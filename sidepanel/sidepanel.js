import { DEFAULT_SETTINGS, SUPPORTED_LANGUAGES, hasProviderConsent, loadLocalState, loadSettings, saveSettings } from "../src/settings.js";
import { hostPermissionPatterns, hostnameFromUrl, providerPermissionPatterns, readingModeForHost, siteProfileForHost, targetLanguageForHost } from "../src/translation.js";

const ids = ["pulse","statusTitle","statusDetail","targetLanguage","readingMode","translatePage","restorePage","privacyRoute","workspaceText","translateText","copyResult","workspaceResult","siteTitle","siteProvider","siteTarget","siteReading","siteAutomatic","siteSensitive","saveSite","resetSite","packSource","packTarget","preparePack","packStatus","history","refreshHistory","openSettings","version"];
const fields = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
let settings = { ...DEFAULT_SETTINGS };
let localState = null;
let tab = null;
let hostname = "";
let inspection = null;

function fillLanguages(select, { auto = false } = {}) {
  if (auto) select.append(new Option("Detect automatically", "auto"));
  for (const [code, label] of SUPPORTED_LANGUAGES) select.append(new Option(label, code));
}

function setStatus(title, detail, tone = "") {
  fields.statusTitle.textContent = title;
  fields.statusDetail.textContent = detail;
  fields.pulse.className = `pulse ${tone}`.trim();
}

function renderRoute(state = {}) {
  const privacy = state.privacy || {};
  fields.privacyRoute.textContent = privacy.route === "on-device"
    ? "On-device — nothing left this browser"
    : privacy.route === "external"
      ? `${state.engine || "External provider"} — ${privacy.charactersProcessed || 0} characters sent with ${privacy.maskedValues || 0} protected values masked`
      : "Translation route not active";
}

async function inspect() {
  if (!tab?.id) return;
  inspection = await chrome.runtime.sendMessage({ type: "inspect-tab", tabId: tab.id });
  const state = inspection.pageState || {};
  const labels = {
    translated: ["Page translated", `${state.translatedSections || 0} contextual sections`, "ready"],
    translating: ["Translation in progress", `${state.translatedSections || 0} of ${state.totalSections || "…"} sections`, ""],
    "translation-error": ["Translation needs attention", state.error || "Try again.", "error"],
    unsupported: ["This page is protected", "Open a normal website to translate.", ""],
    ready: ["Ready to translate", `${inspection.language || "Auto-detect"} → ${inspection.targetLanguage}`, "ready"]
  };
  const [title, detail, tone] = labels[inspection.status] || ["Translation ready", inspection.status?.replaceAll("-", " ") || "", ""];
  setStatus(title, detail, tone);
  fields.targetLanguage.value = inspection.targetLanguage || settings.targetLanguage;
  fields.readingMode.value = state.readingMode || inspection.readingMode || readingModeForHost(hostname, settings);
  fields.restorePage.disabled = inspection.status !== "translated";
  renderRoute(state);
}

function renderSiteProfile() {
  const profile = siteProfileForHost(hostname, settings) || {};
  fields.siteTitle.textContent = hostname || "This website";
  fields.siteProvider.value = profile.providerMode || "auto";
  fields.siteTarget.value = profile.targetLanguage || targetLanguageForHost(hostname, settings);
  fields.siteReading.value = profile.readingMode || settings.readingMode;
  fields.siteAutomatic.checked = profile.automatic === true;
  fields.siteSensitive.checked = profile.sensitivePageMode === "allow";
}

function customEndpointOrigin(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

async function loadHistory() {
  const response = await chrome.runtime.sendMessage({ type: "get-recent-translations", tabId: tab?.id });
  const items = response.translations || [];
  fields.history.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "No recent translations."; fields.history.append(empty); return;
  }
  for (const item of items) {
    const article = document.createElement("article");
    const meta = document.createElement("small"); meta.textContent = `${item.kind || "text"} · ${item.engine || "provider"}`;
    const value = document.createElement("p"); value.dir = "auto"; value.textContent = item.translated;
    article.append(meta, value); fields.history.append(article);
  }
}

fields.translatePage.addEventListener("click", async () => { fields.translatePage.disabled = true; await chrome.runtime.sendMessage({ type: "translate-now", tabId: tab.id }); fields.translatePage.disabled = false; await inspect(); });
fields.restorePage.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "restore-page", tabId: tab.id }); await inspect(); });
fields.readingMode.addEventListener("change", async () => { settings = await saveSettings({ ...settings, readingMode: fields.readingMode.value }); await chrome.runtime.sendMessage({ type: "set-reading-mode", tabId: tab.id, readingMode: fields.readingMode.value }); await inspect(); });
fields.targetLanguage.addEventListener("change", async () => { settings = await saveSettings({ ...settings, targetLanguage: fields.targetLanguage.value }); await chrome.runtime.sendMessage({ type: "refresh-settings" }); await inspect(); });
fields.translateText.addEventListener("click", async () => {
  fields.translateText.disabled = true; fields.workspaceResult.textContent = "Translating…";
  const response = await chrome.runtime.sendMessage({ type: "translate-panel-text", tabId: tab.id, text: fields.workspaceText.value, targetLanguage: fields.targetLanguage.value });
  fields.workspaceResult.textContent = response.status === "ok" ? response.translated : response.message || "Translation failed.";
  if (response.status === "ok") renderRoute({ engine: response.engine, privacy: response.privacy });
  fields.translateText.disabled = false; await loadHistory();
});
fields.copyResult.addEventListener("click", () => navigator.clipboard.writeText(fields.workspaceResult.textContent || ""));
fields.saveSite.addEventListener("click", async () => {
  if (!hostname) return;
  const chosenProvider = fields.siteProvider.value;
  if (["google-cloud", "libretranslate", "deepl", "google-web"].includes(chosenProvider) && !hasProviderConsent(localState, chosenProvider)) {
    setStatus("Provider approval required", "Approve this provider's text route in Settings & privacy first.", "error");
    return;
  }
  const missingConfiguration = (chosenProvider === "google-cloud" && !localState.googleCloudApiKey)
    || (chosenProvider === "libretranslate" && !localState.libreTranslateEndpoint)
    || (chosenProvider === "deepl" && !localState.deepLApiKey);
  if (missingConfiguration) {
    setStatus("Provider setup required", "Configure this provider in Settings & privacy before assigning it to a website.", "error");
    return;
  }
  const providerOrigins = providerPermissionPatterns(chosenProvider, {
    googleCloudApiKey: hasProviderConsent(localState, "google-cloud") ? localState.googleCloudApiKey : "",
    deepLApiKey: hasProviderConsent(localState, "deepl") ? localState.deepLApiKey : "",
    deepLApiPlan: settings.deepLApiPlan
  });
  if (["auto", "libretranslate"].includes(chosenProvider) && hasProviderConsent(localState, "libretranslate") && localState.libreTranslateEndpoint) {
    const endpoint = customEndpointOrigin(localState.libreTranslateEndpoint);
    if (endpoint) providerOrigins.push(endpoint);
  }
  if (fields.siteAutomatic.checked) providerOrigins.push(...hostPermissionPatterns(hostname));
  const requestedOrigins = [...new Set(providerOrigins)];
  if (requestedOrigins.length && !await chrome.permissions.request({ origins: requestedOrigins })) {
    setStatus("Website access declined", "The website profile was not changed.", "error");
    return;
  }
  settings = await saveSettings({
    ...settings,
    siteProfiles: {
      ...settings.siteProfiles,
      [hostname]: {
        targetLanguage: fields.siteTarget.value,
        providerMode: fields.siteProvider.value,
        readingMode: fields.siteReading.value,
        automatic: fields.siteAutomatic.checked,
        sensitivePageMode: fields.siteSensitive.checked ? "allow" : "inherit"
      }
    }
  });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  setStatus("Website profile saved", "Future visits will use these choices.", "ready");
});
fields.resetSite.addEventListener("click", async () => {
  if (!hostname) return;
  const siteProfiles = { ...settings.siteProfiles };
  delete siteProfiles[hostname];
  settings = await saveSettings({ ...settings, siteProfiles });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  renderSiteProfile();
  await inspect();
  setStatus("Using global defaults", "The local website profile was removed.", "ready");
});
fields.preparePack.addEventListener("click", async () => {
  fields.preparePack.disabled = true; fields.packStatus.textContent = "Checking browser support…";
  const availability = await chrome.runtime.sendMessage({ type: "get-on-device-availability", sourceLanguage: fields.packSource.value, targetLanguage: fields.packTarget.value });
  if (availability.availability === "unavailable" || availability.availability === "unsupported") fields.packStatus.textContent = "This browser or language pair is unavailable.";
  else {
    fields.packStatus.textContent = availability.availability === "available" ? "Language pair ready." : "Downloading the on-device language pack…";
    const prepared = await chrome.runtime.sendMessage({ type: "download-on-device-language-pack", sourceLanguage: fields.packSource.value, targetLanguage: fields.packTarget.value });
    fields.packStatus.textContent = prepared.status === "ok" ? "Language pair ready for private on-device translation." : prepared.message || "Language pack could not be prepared.";
  }
  fields.preparePack.disabled = false;
});
fields.refreshHistory.addEventListener("click", loadHistory);
fields.openSettings.addEventListener("click", () => chrome.runtime.openOptionsPage());

fillLanguages(fields.targetLanguage); fillLanguages(fields.siteTarget); fillLanguages(fields.packSource); fillLanguages(fields.packTarget);
[settings, localState, [tab]] = await Promise.all([loadSettings(), loadLocalState(), chrome.tabs.query({ active: true, currentWindow: true })]);
hostname = hostnameFromUrl(tab?.url || "");
fields.packSource.value = "es"; fields.packTarget.value = settings.targetLanguage; fields.version.textContent = `v${chrome.runtime.getManifest().version}`;
renderSiteProfile(); await inspect(); await loadHistory();
