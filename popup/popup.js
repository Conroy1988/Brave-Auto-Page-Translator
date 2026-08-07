import {
  DEFAULT_LOCAL_STATE,
  DEFAULT_SETTINGS,
  SUPPORTED_LANGUAGES,
  externalProvidersForConfiguration,
  hasProviderConsent,
  loadLocalState,
  loadSettings,
  saveSettings
} from "../src/settings.js";
import { applyTranslations } from "../src/i18n.js";
import { baseLanguage, hostMatchesRule, hostPermissionPatterns, hostnameFromUrl, providerPermissionPatterns } from "../src/translation.js";

const elements = Object.fromEntries([
  "enabled", "targetLanguage", "readingMode", "statusPulse", "statusTitle", "statusDetail", "providerDetail",
  "translateNow", "openSidePanel", "automaticSite", "siteRule", "languageRule", "privateNotice", "openOptions", "version"
].map((id) => [id, document.querySelector(`#${id}`)]));
applyTranslations();
const providerNames = {
  auto: "Automatic provider selection",
  "on-device": "On-device translator",
  "google-cloud": "Google Cloud Translation",
  libretranslate: "LibreTranslate",
  deepl: "DeepL API",
  "google-web": "Google web compatibility service"
};
let settings = { ...DEFAULT_SETTINGS };
let localState = { ...DEFAULT_LOCAL_STATE };
let activeTab = null;
let hostname = "";
let inspection = null;

function languageName(code) {
  return SUPPORTED_LANGUAGES.find(([value]) => value.toLowerCase() === code?.toLowerCase())?.[1] || code || "Unknown";
}

function siteIsExcluded() {
  return settings.excludedHosts.some((rule) => hostMatchesRule(hostname, rule));
}

function siteIsApproved() {
  return settings.approvedHosts.some((rule) => hostMatchesRule(hostname, rule));
}

function languageIsExcluded(language) {
  const base = baseLanguage(language);
  return settings.excludedLanguages.some((value) => baseLanguage(value) === base);
}

function setStatus(title, detail, tone = "", provider = "") {
  elements.statusTitle.textContent = title;
  elements.statusDetail.textContent = detail;
  elements.statusPulse.className = `pulse ${tone}`.trim();
  elements.providerDetail.textContent = provider;
}

function renderQuickActions() {
  const language = inspection?.language;
  const privateWindow = Boolean(activeTab?.incognito);
  elements.privateNotice.hidden = !privateWindow;
  elements.siteRule.disabled = !hostname || privateWindow;
  elements.siteRule.textContent = siteIsExcluded() ? "Allow translation on this site" : "Never translate this site";
  elements.automaticSite.hidden = settings.behaviourMode === "all-sites" || !hostname || privateWindow;
  elements.automaticSite.textContent = siteIsApproved() ? "Stop automatic translation here" : "Automatically translate this site";
  elements.languageRule.hidden = privateWindow || !language || language === "auto" || language === "und";
  elements.languageRule.textContent = languageIsExcluded(language) ? `Allow ${languageName(language)}` : `Never translate ${languageName(language)}`;
}

async function inspect() {
  if (!activeTab?.id) {
    setStatus("This page cannot be translated", "Open a normal website and try again.", "paused");
    elements.translateNow.disabled = true;
    return;
  }
  inspection = await chrome.runtime.sendMessage({ type: "inspect-tab", tabId: activeTab.id });
  elements.readingMode.value = inspection.pageState?.readingMode || inspection.readingMode || settings.readingMode;
  const language = languageName(inspection.language);
  const providerKey = inspection.pageState?.engine || inspection.providerMode || settings.providerMode;
  const privacy = inspection.pageState?.privacy;
  const route = privacy?.route === "on-device" ? " · on-device" : privacy?.route === "external" ? ` · ${privacy.maskedValues || 0} protected` : "";
  const provider = `Provider: ${providerNames[providerKey] || providerKey}${route}`;
  const statusMap = {
    unsupported: ["This page cannot be translated", "Browser and extension pages are protected.", "paused"],
    "consent-required": ["Privacy setup required", "Review how webpage text is processed before translation runs.", "paused"],
    "excluded-site": ["Website excluded", `${hostname} will remain in its original language.`, "paused"],
    "sensitive-page": ["Private-page safeguard", "Automatic translation is paused here. Manual translation remains available.", "paused"],
    "unknown-language": ["Language not detected", "You can still translate manually using provider auto-detection.", ""],
    "already-target": ["Already in your language", `Detected ${language}. No translation is needed.`, "ready"],
    "excluded-language": ["Language excluded", `${language} is on your excluded-language list.`, "paused"],
    translating: ["Translation in progress", `${inspection.pageState?.translatedSections || 0} of ${inspection.pageState?.totalSections || "…"} sections`, ""],
    translated: ["Page translated", `${inspection.pageState?.translatedSections || 0} text sections → ${languageName(inspection.pageState?.targetLanguage)}`, "ready"],
    "translation-error": ["Translation needs attention", inspection.pageState?.error || "Try again to retry the provider.", "error"],
    ready: [inspection.languageMismatch ? "Language mismatch handled" : "Ready to translate", `${language} → ${languageName(inspection.targetLanguage)}`, "ready"]
  };
  const [title, detail, tone] = statusMap[inspection.status] || ["Translation ready", `${language} detected.`, "ready"];
  setStatus(title, detail, tone, provider);
  elements.translateNow.textContent = inspection.status === "translated" ? "Show original" : inspection.status === "translating" ? "Cancel translation" : inspection.status === "consent-required" ? "Complete privacy setup" : "Translate this page";
  elements.translateNow.disabled = ["unsupported", "already-target"].includes(inspection.status);
  renderQuickActions();
}

async function persist(update) {
  settings = await saveSettings({ ...settings, ...update });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
}

function customEndpointOrigin(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

async function ensureProviderAccess() {
  const providerMode = inspection?.providerMode || settings.providerMode;
  const unapproved = externalProvidersForConfiguration(settings, localState)
    .filter((provider) => !hasProviderConsent(localState, provider));
  if (unapproved.includes(providerMode) || (["google-cloud", "libretranslate", "deepl", "google-web"].includes(providerMode) && !hasProviderConsent(localState, providerMode))) {
    setStatus("Provider approval required", "Review the provider text route in Settings & privacy before translating.", "paused");
    return false;
  }
  const origins = providerPermissionPatterns(providerMode, {
    allowGoogleWebFallback: settings.allowGoogleWebFallback && hasProviderConsent(localState, "google-web"),
    googleCloudApiKey: hasProviderConsent(localState, "google-cloud") ? localState.googleCloudApiKey : "",
    deepLApiKey: hasProviderConsent(localState, "deepl") ? localState.deepLApiKey : "",
    deepLApiPlan: settings.deepLApiPlan
  });
  if (["auto", "libretranslate"].includes(providerMode) && localState.libreTranslateEndpoint && hasProviderConsent(localState, "libretranslate")) {
    const endpoint = customEndpointOrigin(localState.libreTranslateEndpoint);
    if (endpoint) origins.push(endpoint);
  }
  const uniqueOrigins = [...new Set(origins)];
  if (!uniqueOrigins.length || await chrome.permissions.contains({ origins: uniqueOrigins })) return true;
  return chrome.permissions.request({ origins: uniqueOrigins });
}

async function init() {
  for (const [code, label] of SUPPORTED_LANGUAGES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    elements.targetLanguage.append(option);
  }
  [settings, localState] = await Promise.all([loadSettings(), loadLocalState()]);
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  hostname = hostnameFromUrl(activeTab?.url || "");
  elements.enabled.checked = settings.enabled;
  elements.targetLanguage.value = settings.targetLanguage;
  elements.readingMode.value = inspection?.pageState?.readingMode || settings.readingMode;
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  await inspect();
}

elements.enabled.addEventListener("change", async () => {
  await persist({ enabled: elements.enabled.checked });
  if (!settings.enabled) setStatus("Automatic translation paused", "Manual translation remains available.", "paused");
  else await inspect();
});

elements.targetLanguage.addEventListener("change", async () => {
  const wasTranslated = inspection?.status === "translated";
  await persist({ targetLanguage: elements.targetLanguage.value });
  if (wasTranslated && activeTab?.id) {
    await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
    await chrome.runtime.sendMessage({ type: "translate-now", tabId: activeTab.id });
  }
  await inspect();
});

elements.readingMode.addEventListener("change", async () => {
  await persist({ readingMode: elements.readingMode.value });
  if (activeTab?.id && inspection?.status === "translated") {
    await chrome.runtime.sendMessage({ type: "set-reading-mode", tabId: activeTab.id, readingMode: elements.readingMode.value });
  }
  await inspect();
});

elements.openSidePanel.addEventListener("click", async () => {
  if (!activeTab?.id || !chrome.sidePanel?.open) {
    setStatus("Open from the side-panel menu", "Choose Private Auto Page Translator in the browser's side-panel picker.", "paused");
    return;
  }
  await chrome.sidePanel.open({ tabId: activeTab.id });
  window.close();
});

elements.translateNow.addEventListener("click", async () => {
  if (inspection?.status === "consent-required") {
    await chrome.runtime.sendMessage({ type: "open-onboarding" });
    window.close();
    return;
  }
  if (inspection?.status === "translated") {
    await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
    await inspect();
    return;
  }
  if (inspection?.status === "translating") {
    await chrome.runtime.sendMessage({ type: "cancel-tab-translation", tabId: activeTab.id });
    await inspect();
    return;
  }
  const providerAccess = await ensureProviderAccess();
  if (!providerAccess && ["google-cloud", "google-web", "libretranslate", "deepl"].includes(inspection?.providerMode || settings.providerMode)) {
    setStatus("Provider access declined", "Translation needs access to the provider selected in Settings.", "error");
    return;
  }
  elements.translateNow.disabled = true;
  elements.translateNow.textContent = "Translating…";
  const result = await chrome.runtime.sendMessage({ type: "translate-now", tabId: activeTab.id });
  if (result.status === "translated") window.close();
  else {
    elements.translateNow.disabled = false;
    setStatus("Translation was not completed", result.message || "Review the page rules and provider settings.", "error");
  }
});

elements.siteRule.addEventListener("click", async () => {
  if (!hostname || activeTab?.incognito) return;
  const excluded = siteIsExcluded();
  const excludedHosts = excluded
    ? settings.excludedHosts.filter((rule) => !hostMatchesRule(hostname, rule))
    : [...settings.excludedHosts, hostname];
  await persist({ excludedHosts });
  if (!excluded && inspection?.status === "translated") await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
  await inspect();
});

elements.automaticSite.addEventListener("click", async () => {
  if (!hostname || activeTab?.incognito) return;
  const approved = siteIsApproved();
  const patterns = hostPermissionPatterns(hostname);
  if (!approved) {
    const granted = await chrome.permissions.request({ origins: patterns });
    if (!granted) {
      setStatus("Website access declined", "Manual translation remains available.", "paused");
      return;
    }
  } else await chrome.permissions.remove({ origins: patterns }).catch(() => false);
  const approvedHosts = approved
    ? settings.approvedHosts.filter((rule) => !hostMatchesRule(hostname, rule))
    : [...settings.approvedHosts, hostname];
  await persist({ behaviourMode: "approved-sites", approvedHosts, enabled: true });
  elements.enabled.checked = true;
  await inspect();
});

elements.languageRule.addEventListener("click", async () => {
  if (activeTab?.incognito) return;
  const language = baseLanguage(inspection?.language);
  if (!language) return;
  const excluded = languageIsExcluded(language);
  const excludedLanguages = excluded
    ? settings.excludedLanguages.filter((value) => baseLanguage(value) !== language)
    : [...settings.excludedLanguages, language];
  await persist({ excludedLanguages });
  if (!excluded && inspection?.status === "translated") await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
  await inspect();
});

elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
init().catch((error) => setStatus("Extension error", error.message, "error"));
