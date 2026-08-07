import {
  DEFAULT_LOCAL_STATE,
  EXTERNAL_PROVIDER_MODES,
  externalProvidersForConfiguration,
  hasCurrentConsent,
  hasProviderConsent,
  loadLocalState,
  loadSettings,
  migrateSettingsStorage,
  normalizeSettings,
  restrictStorageAccess,
  saveLocalState,
  saveSettings,
  suggestedTargetLanguage
} from "./settings.js";
import { clearTranslationCache, translateTexts } from "./provider.js";
import {
  baseLanguage,
  hostMatchesRule,
  hostPermissionPatterns,
  hostnameFromUrl,
  isAutomaticHostAllowed,
  isSupportedPageUrl,
  normalizeLanguageCode,
  originPatternFromUrl,
  providerModeForHost,
  readingModeForHost,
  resolvePageLanguage,
  sensitivePageModeForHost,
  siteProfileForHost,
  shouldTranslateLanguage,
  targetLanguageForHost
} from "./translation.js";

const AUTO_SCRIPT_ID = "auto-page-translator";
const ALL_SITE_ORIGINS = ["http://*/*", "https://*/*"];
const activeJobs = new Map();
const recentlyHandled = new Map();
const languagePackProgress = new Map();
const recentTranslations = new Map();
let jobCounter = 0;
let settingsPromise = loadSettings();
let localStatePromise = loadLocalState();

restrictStorageAccess().catch(() => {});

async function refreshRuntimeState() {
  settingsPromise = loadSettings();
  localStatePromise = loadLocalState();
  const values = await Promise.all([settingsPromise, localStatePromise]);
  return { settings: values[0], localState: values[1] };
}

async function runtimeState() {
  const [settings, localState] = await Promise.all([settingsPromise, localStatePromise]);
  return { settings, localState };
}

async function setBadge(tabId, text, color = "#6d5dfc") {
  const { settings } = await runtimeState();
  await chrome.action.setBadgeText({ tabId, text: settings.showBadge ? text : "" });
  if (text && settings.showBadge) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    if (typeof chrome.action.setBadgeTextColor === "function") {
      await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" }).catch(() => {});
    }
  }
}

function isExcludedHost(hostname, excludedHosts) {
  return excludedHosts.some((rule) => hostMatchesRule(hostname, rule));
}

async function hasOrigins(origins) {
  if (!origins.length) return false;
  return chrome.permissions.contains({ origins });
}

async function hasPagePermission(url) {
  const origin = originPatternFromUrl(url);
  return Boolean(origin) && hasOrigins([origin]);
}

function matchPatternsForHost(hostname) {
  return hostPermissionPatterns(hostname).map((pattern) => pattern.replace("http://", "*://").replace("https://", "*://"))
    .filter((pattern, index, values) => values.indexOf(pattern) === index);
}

async function syncRegisteredContentScript() {
  await chrome.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT_ID] }).catch(() => {});
  const { settings, localState } = await runtimeState();
  if (!hasCurrentConsent(localState) || !settings.enabled) return;

  let matches = [];
  if (settings.behaviourMode === "all-sites" && await hasOrigins(ALL_SITE_ORIGINS)) {
    matches = ["http://*/*", "https://*/*"];
  } else {
    const profiledHosts = Object.entries(settings.siteProfiles || {})
      .filter(([, profile]) => profile.automatic === true)
      .map(([host]) => host);
    for (const host of [...new Set([...(settings.behaviourMode === "approved-sites" ? settings.approvedHosts : []), ...profiledHosts])]) {
      const origins = hostPermissionPatterns(host);
      if (await hasOrigins(origins)) matches.push(...matchPatternsForHost(host));
    }
  }
  matches = [...new Set(matches)];
  if (!matches.length) return;

  await chrome.scripting.registerContentScripts([{
    id: AUTO_SCRIPT_ID,
    matches,
    js: ["src/content.js"],
    runAt: "document_idle",
    allFrames: true,
    matchOriginAsFallback: true,
    persistAcrossSessions: true
  }]);
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "get-translation-state" }, { frameId: 0 });
    if (response) return;
  } catch {
    // The script has not been injected into this page yet.
  }
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["src/content.js"] });
}

async function pageMetadata(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "get-page-metadata" }, { frameId: 0 });
    return response?.metadata || { declaredLanguage: "", sensitive: false, sensitiveReasons: [] };
  } catch {
    return { declaredLanguage: "", sensitive: false, sensitiveReasons: [] };
  }
}

async function inspectTab(tabId, tab, { inject = false } = {}) {
  const { settings, localState } = await runtimeState();
  const url = tab?.url || "";
  const hostname = hostnameFromUrl(url);
  const targetLanguage = targetLanguageForHost(hostname, settings);
  const readingMode = readingModeForHost(hostname, settings);
  const providerMode = providerModeForHost(hostname, settings);
  if (!isSupportedPageUrl(url)) {
    return { status: "unsupported", settings, hostname, language: "", targetLanguage, readingMode, providerMode, consented: hasCurrentConsent(localState), incognito: Boolean(tab?.incognito) };
  }
  if (!hasCurrentConsent(localState)) {
    return { status: "consent-required", settings, hostname, language: "", targetLanguage, consented: false, incognito: Boolean(tab?.incognito) };
  }

  if (inject || await hasPagePermission(url)) {
    await ensureContentScript(tabId).catch(() => {});
    await chrome.tabs.sendMessage(tabId, {
      type: "configure-content",
      smartCompose: settings.smartCompose,
      targetLanguage
    }, { frameId: 0 }).catch(() => {});
  }
  try {
    const page = await chrome.tabs.sendMessage(tabId, { type: "get-translation-state" }, { frameId: 0 });
    if (page?.state?.busy) return { status: "translating", settings, hostname, language: page.state.sourceLanguage, targetLanguage, pageState: page.state, consented: true };
    if (page?.state?.error) return { status: "translation-error", settings, hostname, language: page.state.sourceLanguage, targetLanguage, pageState: page.state, consented: true };
    if (page?.state?.active) return { status: "translated", settings, hostname, language: page.state.sourceLanguage, targetLanguage, pageState: page.state, consented: true };
  } catch {
    // Page inspection continues using browser language detection.
  }

  let detectedLanguage = "";
  try {
    detectedLanguage = normalizeLanguageCode(await chrome.tabs.detectLanguage(tabId));
  } catch {
    detectedLanguage = "";
  }
  const metadata = await pageMetadata(tabId);
  const resolved = resolvePageLanguage(detectedLanguage, metadata.declaredLanguage);
  const language = resolved.language || detectedLanguage || metadata.declaredLanguage || "";

  if (isExcludedHost(hostname, settings.excludedHosts)) {
    return { status: "excluded-site", settings, hostname, language, targetLanguage, metadata, languageMismatch: resolved.mismatch, consented: true };
  }
  if (metadata.sensitive && sensitivePageModeForHost(hostname, settings) === "manual") {
    return { status: "sensitive-page", settings, hostname, language, targetLanguage, metadata, languageMismatch: resolved.mismatch, consented: true };
  }
  if (language && language !== "auto" && baseLanguage(language) === baseLanguage(targetLanguage)) {
    return { status: "already-target", settings, hostname, language, targetLanguage, metadata, languageMismatch: resolved.mismatch, consented: true };
  }
  if (language && language !== "auto" && !shouldTranslateLanguage(language, settings, targetLanguage)) {
    return { status: "excluded-language", settings, hostname, language, targetLanguage, metadata, languageMismatch: resolved.mismatch, consented: true };
  }
  return {
    status: language ? "ready" : "unknown-language",
    settings,
    hostname,
    language: resolved.mismatch ? "auto" : language,
    detectedLanguage,
    declaredLanguage: metadata.declaredLanguage,
    targetLanguage,
    readingMode,
    providerMode,
    siteProfile: siteProfileForHost(hostname, settings),
    metadata,
    languageMismatch: resolved.mismatch,
    consented: true,
    incognito: Boolean(tab?.incognito),
    externalProviders: externalProvidersForConfiguration(settings, localState).map((provider) => ({
      provider,
      consented: hasProviderConsent(localState, provider)
    }))
  };
}

function abortTabJobs(tabId) {
  for (const [key, job] of activeJobs) {
    if (job.tabId !== tabId) continue;
    job.controller.abort();
    activeJobs.delete(key);
  }
}

function rememberTranslation(tabId, entry) {
  if (!Number.isInteger(tabId)) return;
  const history = recentTranslations.get(tabId) || [];
  history.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ...entry });
  recentTranslations.set(tabId, history.slice(0, 20));
}

async function translateTab(tabId, tab, { manual = false, readingModeOverride = "" } = {}) {
  const { settings, localState } = await runtimeState();
  const url = tab?.url || "";
  const hostname = hostnameFromUrl(url);
  if (!hasCurrentConsent(localState)) return { status: "consent-required", message: "Complete the privacy setup before translating." };
  if (!isSupportedPageUrl(url)) return { status: "unsupported", message: "This browser page cannot be translated." };
  if (!manual) {
    if (tab.incognito) return { status: "incognito-manual-only" };
    if (!isAutomaticHostAllowed(hostname, settings)) return { status: "not-automatic" };
    if (!await hasPagePermission(url)) return { status: "permission-required" };
  }

  try {
    await ensureContentScript(tabId);
  } catch {
    return { status: "permission-required", message: "Allow access to this website, then try again." };
  }

  const inspection = await inspectTab(tabId, tab, { inject: true });
  if (!manual && inspection.status === "sensitive-page") {
    await setBadge(tabId, "SAFE", "#64748b");
    return inspection;
  }
  const manualOverride = manual && ["unknown-language", "sensitive-page", "excluded-site", "excluded-language", "translation-error", "translated"].includes(inspection.status);
  if (inspection.status !== "ready" && !manualOverride) {
    if (inspection.status === "excluded-site") await setBadge(tabId, "SKIP", "#64748b");
    else if (inspection.status === "already-target") await setBadge(tabId, "");
    return inspection;
  }

  const now = Date.now();
  const previous = recentlyHandled.get(tabId);
  if (!manual && previous?.url === url && now - previous.time < 3_000) return { ...inspection, status: "recently-handled" };
  recentlyHandled.set(tabId, { url, time: now });
  abortTabJobs(tabId);
  const jobId = `${tabId}-${Date.now()}-${++jobCounter}`;
  await setBadge(tabId, "…", "#6d5dfc");
  try {
    const request = {
      type: "translate-page",
      jobId,
      sourceLanguage: inspection.language || "auto",
      targetLanguage: inspection.targetLanguage,
      translateDynamicContent: settings.translateDynamicContent,
      translateAttributes: settings.translateAttributes,
      readingMode: readingModeOverride || readingModeForHost(hostname, settings),
      viewportFirst: settings.viewportFirst,
      smartCompose: settings.smartCompose,
      adjustTextDirection: settings.adjustTextDirection,
      showPageControl: settings.showPageControl
    };
    const result = await chrome.tabs.sendMessage(tabId, request, { frameId: 0 });
    if (result?.status === "translated") {
      chrome.tabs.sendMessage(tabId, { ...request, showPageControl: false }).catch(() => {});
      await setBadge(tabId, baseLanguage(inspection.targetLanguage).toUpperCase(), "#0f9f8f");
      return { ...inspection, ...result, status: "translated" };
    }
    await setBadge(tabId, "ERR", "#dc2626");
    return { ...inspection, status: result?.status || "translation-error", message: result?.message || "The page could not be translated." };
  } catch (error) {
    if (recentlyHandled.get(tabId)?.url === url) recentlyHandled.delete(tabId);
    await setBadge(tabId, "ERR", "#dc2626");
    return { ...inspection, status: "translation-error", message: error.message };
  }
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL("offscreen/offscreen.html");
  if (typeof chrome.runtime.getContexts === "function") {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    if (contexts.length) return;
  } else if (typeof chrome.offscreen.hasDocument === "function" && await chrome.offscreen.hasDocument()) {
    return;
  }
  await chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["DOM_SCRAPING"],
    justification: "Run the browser's on-device Translator API in a document context."
  });
}

async function translateOnDevice(texts, sourceLanguage, targetLanguage) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "translate-on-device",
    texts,
    sourceLanguage,
    targetLanguage
  });
  if (response?.status !== "ok") {
    const error = new Error(response?.message || "On-device translation is unavailable.");
    error.code = "provider-unavailable";
    throw error;
  }
  return response.translations;
}

async function onDeviceAvailability(sourceLanguage, targetLanguage) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    target: "offscreen",
    type: "on-device-availability",
    sourceLanguage,
    targetLanguage
  });
}

async function prepareOnDevice(sourceLanguage, targetLanguage) {
  await ensureOffscreenDocument();
  const key = `${sourceLanguage}:${targetLanguage}`;
  languagePackProgress.set(key, { sourceLanguage, targetLanguage, loaded: 0, state: "downloading" });
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "prepare-on-device",
    sourceLanguage,
    targetLanguage
  });
  languagePackProgress.set(key, {
    sourceLanguage,
    targetLanguage,
    loaded: response?.status === "ok" ? 1 : 0,
    state: response?.status === "ok" ? "ready" : "error",
    message: response?.message || ""
  });
  return { ...response, progress: languagePackProgress.get(key) };
}

async function providerConfig(settings, localState, signal, { hostname = "", formality = "" } = {}) {
  return {
    providerMode: providerModeForHost(hostname, settings),
    allowGoogleWebFallback: settings.allowGoogleWebFallback,
    googleCloudApiKey: localState.googleCloudApiKey,
    libreTranslateEndpoint: localState.libreTranslateEndpoint,
    libreTranslateApiKey: localState.libreTranslateApiKey,
    deepLApiKey: localState.deepLApiKey,
    deepLApiPlan: settings.deepLApiPlan,
    allowedExternalProviders: EXTERNAL_PROVIDER_MODES.filter((provider) => hasProviderConsent(localState, provider)),
    glossary: settings.glossary,
    neverTranslateTerms: settings.neverTranslateTerms,
    privacyFirewall: settings.privacyFirewall,
    privacyFirewallTerms: settings.privacyFirewallTerms,
    includePrivacyMetrics: true,
    formality,
    signal,
    onDeviceTranslate: translateOnDevice
  };
}

async function translateSelection(info, tab) {
  if (!tab?.id || !info.selectionText?.trim()) return;
  const { settings, localState } = await runtimeState();
  if (!hasCurrentConsent(localState)) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  await ensureContentScript(tab.id);
  const hostname = hostnameFromUrl(tab.url || "");
  const targetLanguage = targetLanguageForHost(hostname, settings);
  const result = await translateTexts([info.selectionText], {
    ...(await providerConfig(settings, localState, undefined, { hostname })),
    sourceLanguage: "auto",
    targetLanguage
  });
  rememberTranslation(tab.id, {
    kind: "selection",
    original: info.selectionText,
    translated: result.translations[0],
    targetLanguage,
    engine: result.engine,
    privacy: result.privacy
  });
  await chrome.tabs.sendMessage(tab.id, {
    type: "show-selection-translation",
    original: info.selectionText,
    translated: result.translations[0],
    targetLanguage,
    engine: result.engine,
    privacy: result.privacy
  }, { frameId: info.frameId || 0 });
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "translate-page", title: "Translate this page", contexts: ["page"] });
    chrome.contextMenus.create({ id: "restore-page", title: "Show original page text", contexts: ["page"] });
    chrome.contextMenus.create({ id: "translate-selection", title: "Translate selected text", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "translate-compose", title: "Translate this writing", contexts: ["editable"] });
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await restrictStorageAccess();
  const normalized = normalizeSettings(await migrateSettingsStorage());
  if (reason === "install") normalized.targetLanguage = suggestedTargetLanguage(chrome.i18n.getUILanguage());
  await saveSettings(normalized);
  await chrome.storage.sync.remove("openInNewTab");
  const localState = await chrome.storage.local.get(DEFAULT_LOCAL_STATE);
  await chrome.storage.local.set({ ...DEFAULT_LOCAL_STATE, ...localState });
  await refreshRuntimeState();
  await syncRegisteredContentScript();
  createContextMenus();
  if (reason === "install" || (!hasCurrentConsent(localState) && previousVersion !== chrome.runtime.getManifest().version)) {
    await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }
});

chrome.runtime.onStartup.addListener(() => {
  restrictStorageAccess().then(refreshRuntimeState).then(syncRegisteredContentScript).catch(() => {});
  createContextMenus();
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (!["sync", "local", "session"].includes(areaName)) return;
  refreshRuntimeState().then(syncRegisteredContentScript).catch(() => {});
});

chrome.permissions.onAdded.addListener(() => syncRegisteredContentScript().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => syncRegisteredContentScript().catch(() => {}));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") abortTabJobs(tabId);
  if (changeInfo.status !== "complete" || !tab.url) return;
  translateTab(tabId, tab).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  recentlyHandled.delete(tabId);
  recentTranslations.delete(tabId);
  abortTabJobs(tabId);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-page" && tab?.id) translateTab(tab.id, tab, { manual: true }).catch(() => {});
  if (info.menuItemId === "restore-page" && tab?.id) {
    abortTabJobs(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "restore-page" }).catch(() => {});
  }
  if (info.menuItemId === "translate-selection") translateSelection(info, tab).catch(() => {});
  if (info.menuItemId === "translate-compose" && tab?.id) {
    ensureContentScript(tab.id).then(() => chrome.tabs.sendMessage(tab.id, { type: "open-smart-compose" }, { frameId: info.frameId || 0 })).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "translate-page") await translateTab(tab.id, tab, { manual: true });
  if (command === "restore-page") {
    abortTabJobs(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "restore-page" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;
  const handle = async () => {
    if (!message || typeof message !== "object") return { status: "invalid-message" };
    if (message.type === "refresh-settings") {
      const result = await refreshRuntimeState();
      await syncRegisteredContentScript();
      return result;
    }
    if (message.type === "open-onboarding") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
      return { status: "opened" };
    }
    if (message.type === "sync-content-scripts") {
      await syncRegisteredContentScript();
      return { status: "synced" };
    }
    if (message.type === "clear-provider-cache") {
      clearTranslationCache();
      return { status: "cleared" };
    }
    if (message.type === "translate-compose-text") {
      if (!sender.tab?.id) return { status: "forbidden", message: "Writing translation requests must come from a webpage." };
      const original = String(message.text || "").trim();
      if (!original || original.length > 5000) return { status: "invalid-text", message: "Select between 1 and 5,000 characters." };
      const { settings, localState } = await runtimeState();
      if (!hasCurrentConsent(localState)) return { status: "consent-required", message: "Privacy consent is required." };
      const hostname = hostnameFromUrl(sender.tab.url || "");
      const targetLanguage = normalizeLanguageCode(message.targetLanguage) || targetLanguageForHost(hostname, settings);
      const sourceLanguage = normalizeLanguageCode(message.sourceLanguage) || "auto";
      const style = ["natural", "formal", "informal"].includes(message.style) ? message.style : settings.composeStyle;
      const result = await translateTexts([original], {
        ...(await providerConfig(settings, localState, undefined, {
          hostname,
          formality: style === "formal" ? "prefer_more" : style === "informal" ? "prefer_less" : ""
        })),
        sourceLanguage,
        targetLanguage
      });
      const response = {
        status: "ok",
        original,
        translated: result.translations[0],
        sourceLanguage,
        targetLanguage,
        style,
        engine: result.engine,
        privacy: result.privacy
      };
      rememberTranslation(sender.tab.id, { kind: "compose", ...response });
      return response;
    }
    if (message.type === "translate-panel-text") {
      const tabId = Number(message.tabId);
      const original = String(message.text || "").trim();
      if (!Number.isInteger(tabId) || !original || original.length > 5000) return { status: "invalid-text", message: "Enter between 1 and 5,000 characters." };
      const tab = await chrome.tabs.get(tabId);
      const { settings, localState } = await runtimeState();
      if (!hasCurrentConsent(localState)) return { status: "consent-required", message: "Privacy consent is required." };
      const hostname = hostnameFromUrl(tab.url || "");
      const targetLanguage = normalizeLanguageCode(message.targetLanguage) || targetLanguageForHost(hostname, settings);
      const result = await translateTexts([original], {
        ...(await providerConfig(settings, localState, undefined, { hostname })),
        sourceLanguage: normalizeLanguageCode(message.sourceLanguage) || "auto",
        targetLanguage
      });
      const response = { status: "ok", original, translated: result.translations[0], targetLanguage, engine: result.engine, privacy: result.privacy };
      rememberTranslation(tabId, { kind: "workspace", ...response });
      return response;
    }
    if (message.type === "get-recent-translations") {
      const tabId = Number(message.tabId || sender.tab?.id);
      return { status: "ok", translations: recentTranslations.get(tabId) || [] };
    }
    if (message.type === "set-reading-mode") {
      const tabId = Number(message.tabId || sender.tab?.id);
      if (!Number.isInteger(tabId)) return { status: "invalid-tab" };
      return chrome.tabs.sendMessage(tabId, { type: "set-reading-mode", readingMode: message.readingMode });
    }
    if (message.type === "translate-texts") {
      if (!sender.tab?.id) return { status: "forbidden", message: "Translation requests must come from a webpage." };
      const { settings, localState } = await runtimeState();
      if (!hasCurrentConsent(localState)) return { status: "consent-required", message: "Privacy consent is required." };
      const controller = new AbortController();
      const key = `${sender.tab.id}:${sender.frameId || 0}:${message.jobId || "page"}`;
      activeJobs.set(key, { tabId: sender.tab.id, controller });
      try {
        const hostname = hostnameFromUrl(sender.tab.url || "");
        const result = await translateTexts(message.texts, {
          ...(await providerConfig(settings, localState, controller.signal, { hostname })),
          sourceLanguage: normalizeLanguageCode(message.sourceLanguage) || "auto",
          targetLanguage: normalizeLanguageCode(message.targetLanguage)
        });
        return { status: "ok", ...result };
      } finally {
        activeJobs.delete(key);
      }
    }
    if (message.type === "cancel-translation") {
      if (!sender.tab?.id) return { status: "ignored" };
      const key = `${sender.tab.id}:${sender.frameId || 0}:${message.jobId || "page"}`;
      activeJobs.get(key)?.controller.abort();
      activeJobs.delete(key);
      return { status: "cancelled" };
    }
    if (message.type === "test-provider") {
      const { settings, localState } = await runtimeState();
      if (!hasCurrentConsent(localState)) return { status: "consent-required", message: "Complete privacy setup first." };
      const targetLanguage = settings.targetLanguage === "fr" ? "es" : "fr";
      const result = await translateTexts(["Hello world"], {
        ...(await providerConfig(settings, localState)),
        sourceLanguage: "en",
        targetLanguage
      });
      return { status: "ok", engine: result.engine, sample: result.translations[0] };
    }
    if (message.type === "get-on-device-availability") {
      return onDeviceAvailability(
        normalizeLanguageCode(message.sourceLanguage) || "en",
        normalizeLanguageCode(message.targetLanguage) || "fr"
      );
    }
    if (message.type === "download-on-device-language-pack") {
      return prepareOnDevice(
        normalizeLanguageCode(message.sourceLanguage) || "en",
        normalizeLanguageCode(message.targetLanguage) || "fr"
      );
    }
    if (message.type === "get-on-device-language-pack-progress") {
      const sourceLanguage = normalizeLanguageCode(message.sourceLanguage) || "en";
      const targetLanguage = normalizeLanguageCode(message.targetLanguage) || "fr";
      const key = `${sourceLanguage}:${targetLanguage}`;
      return { status: "ok", progress: languagePackProgress.get(key) || null };
    }
    if (message.type === "on-device-download-progress") {
      const sourceLanguage = normalizeLanguageCode(message.sourceLanguage);
      const targetLanguage = normalizeLanguageCode(message.targetLanguage);
      languagePackProgress.set(`${sourceLanguage}:${targetLanguage}`, {
        sourceLanguage,
        targetLanguage,
        loaded: Math.max(0, Math.min(1, Number(message.loaded || 0))),
        state: "downloading"
      });
      return { status: "recorded" };
    }
    if (message.type === "get-diagnostics") {
      const { settings, localState } = await runtimeState();
      return {
        status: "ok",
        diagnostics: {
          generatedAt: new Date().toISOString(),
          extensionVersion: chrome.runtime.getManifest().version,
          browserUserAgent: navigator.userAgent,
          consentVersion: localState.privacyConsentVersion,
          behaviourMode: settings.behaviourMode,
          providerMode: settings.providerMode,
          providerCredentialsConfigured: {
            googleCloud: Boolean(localState.googleCloudApiKey),
            libreTranslate: Boolean(localState.libreTranslateEndpoint),
            deepL: Boolean(localState.deepLApiKey)
          },
          providerConsents: Object.fromEntries(EXTERNAL_PROVIDER_MODES.map((provider) => [provider, hasProviderConsent(localState, provider)])),
          providerCredentialsPersistence: localState.rememberProviderCredentials ? "this-device" : "browser-session",
          siteRulesStorage: "local-only",
          allSitesPermission: await hasOrigins(ALL_SITE_ORIGINS),
          rules: {
            excludedLanguageCount: settings.excludedLanguages.length,
            excludedHostCount: settings.excludedHosts.length,
            approvedHostCount: settings.approvedHosts.length,
            siteProfileCount: Object.keys(settings.siteProfiles || {}).length,
            glossaryCount: settings.glossary.length,
            neverTranslateTermCount: settings.neverTranslateTerms.length,
            privacyFirewallTermCount: settings.privacyFirewallTerms.length
          }
        }
      };
    }
    if (message.type === "content-ready") {
      if (sender.frameId !== 0 || !sender.tab?.id || !sender.tab.url) return { status: "ready" };
      translateTab(sender.tab.id, sender.tab).catch(() => {});
      return { status: "ready" };
    }
    if (message.type === "translation-status") {
      const tabId = sender.tab?.id;
      if (!Number.isInteger(tabId) || sender.frameId !== 0) return { status: "ignored" };
      if (message.state?.busy) await setBadge(tabId, "…", "#6d5dfc");
      else if (message.state?.error) await setBadge(tabId, "ERR", "#dc2626");
      else if (message.state?.active) await setBadge(tabId, baseLanguage(message.state.targetLanguage).toUpperCase(), "#0f9f8f");
      else await setBadge(tabId, "");
      return { status: "recorded" };
    }

    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId)) return { status: "invalid-tab" };
    const tab = await chrome.tabs.get(tabId);
    if (message.type === "inspect-tab") return inspectTab(tabId, tab, { inject: true });
    if (message.type === "translate-now") return translateTab(tabId, tab, { manual: true });
    if (message.type === "restore-page") {
      abortTabJobs(tabId);
      const result = await chrome.tabs.sendMessage(tabId, { type: "restore-page" });
      await setBadge(tabId, "");
      return result;
    }
    if (message.type === "cancel-tab-translation") {
      abortTabJobs(tabId);
      await chrome.tabs.sendMessage(tabId, { type: "cancel-page-translation" }).catch(() => {});
      return { status: "cancelled" };
    }
    return { status: "unknown-message" };
  };
  handle().then(sendResponse).catch((error) => sendResponse({ status: "error", code: error.code || "extension-error", message: error.message }));
  return true;
});
