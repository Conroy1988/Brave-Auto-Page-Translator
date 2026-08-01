import { DEFAULT_LOCAL_STATE, DEFAULT_SETTINGS, SUPPORTED_LANGUAGES, loadLocalState, loadSettings, saveSettings } from "../src/settings.js";
import { baseLanguage, hostMatchesRule, hostPermissionPatterns, hostnameFromUrl, providerPermissionPatterns } from "../src/translation.js";

const elements = Object.fromEntries([
  "enabled", "targetLanguage", "statusPulse", "statusTitle", "statusDetail", "providerDetail",
  "translateNow", "automaticSite", "siteRule", "languageRule", "openOptions", "version"
].map((id) => [id, document.querySelector(`#${id}`)]));
const providerNames = {
  auto: "Automatic provider selection",
  "on-device": "On-device translator",
  "google-cloud": "Google Cloud Translation",
  libretranslate: "LibreTranslate",
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
  elements.siteRule.disabled = !hostname;
  elements.siteRule.textContent = siteIsExcluded() ? "Allow translation on this site" : "Never translate this site";
  elements.automaticSite.hidden = settings.behaviourMode === "all-sites" || !hostname;
  elements.automaticSite.textContent = siteIsApproved() ? "Stop automatic translation here" : "Automatically translate this site";
  elements.languageRule.hidden = !language || language === "auto" || language === "und";
  elements.languageRule.textContent = languageIsExcluded(language) ? `Allow ${languageName(language)}` : `Never translate ${languageName(language)}`;
}

async function inspect() {
  if (!activeTab?.id) {
    setStatus("This page cannot be translated", "Open a normal website and try again.", "paused");
    elements.translateNow.disabled = true;
    return;
  }
  inspection = await chrome.runtime.sendMessage({ type: "inspect-tab", tabId: activeTab.id });
  const language = languageName(inspection.language);
  const provider = `Provider: ${providerNames[inspection.pageState?.engine || settings.providerMode] || inspection.pageState?.engine || settings.providerMode}`;
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
  const origins = providerPermissionPatterns(settings.providerMode, {
    allowGoogleWebFallback: settings.allowGoogleWebFallback,
    googleCloudApiKey: localState.googleCloudApiKey
  });
  if (["auto", "libretranslate"].includes(settings.providerMode) && localState.libreTranslateEndpoint) {
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
  if (!providerAccess && ["google-cloud", "google-web", "libretranslate"].includes(settings.providerMode)) {
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
  if (!hostname) return;
  const excluded = siteIsExcluded();
  const excludedHosts = excluded
    ? settings.excludedHosts.filter((rule) => !hostMatchesRule(hostname, rule))
    : [...settings.excludedHosts, hostname];
  await persist({ excludedHosts });
  if (!excluded && inspection?.status === "translated") await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
  await inspect();
});

elements.automaticSite.addEventListener("click", async () => {
  if (!hostname) return;
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
