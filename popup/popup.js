import { DEFAULT_SETTINGS, SUPPORTED_LANGUAGES, loadSettings, saveSettings } from "../src/settings.js";
import { hostnameFromUrl, hostMatchesRule } from "../src/translation.js";

const elements = {
  enabled: document.querySelector("#enabled"),
  targetLanguage: document.querySelector("#targetLanguage"),
  statusPulse: document.querySelector("#statusPulse"),
  statusTitle: document.querySelector("#statusTitle"),
  statusDetail: document.querySelector("#statusDetail"),
  translateNow: document.querySelector("#translateNow"),
  siteRule: document.querySelector("#siteRule"),
  openOptions: document.querySelector("#openOptions")
};

let settings = { ...DEFAULT_SETTINGS };
let activeTab = null;
let hostname = "";
let pageTranslated = false;

function languageName(code) {
  return SUPPORTED_LANGUAGES.find(([value]) => value.toLowerCase() === code?.toLowerCase())?.[1] || code || "Unknown";
}

function siteIsExcluded() {
  return settings.excludedHosts.some((rule) => hostMatchesRule(hostname, rule));
}

function setStatus(title, detail, tone = "") {
  elements.statusTitle.textContent = title;
  elements.statusDetail.textContent = detail;
  elements.statusPulse.className = `pulse ${tone}`.trim();
}

function renderSiteRule() {
  elements.siteRule.disabled = !hostname;
  elements.siteRule.textContent = siteIsExcluded() ? "Allow translation on this site" : "Never translate this site";
}

async function inspect() {
  if (!activeTab?.id) {
    setStatus("This page cannot be translated", "Open a normal website and try again.", "paused");
    elements.translateNow.disabled = true;
    return;
  }

  const result = await chrome.runtime.sendMessage({ type: "inspect-tab", tabId: activeTab.id });
  pageTranslated = result.status === "translated";
  const language = languageName(result.language);
  const statusMap = {
    unsupported: ["This page cannot be translated", "Browser and extension pages are protected.", "paused"],
    "excluded-site": ["Website excluded", `${hostname} will remain in its original language.`, "paused"],
    "unknown-language": ["Language not detected", "You can still try translating this page manually.", ""],
    "already-target": ["Already in your language", `Detected ${language}. No translation is needed.`, "ready"],
    "excluded-language": ["Language excluded", `${language} is on your excluded-language list.`, "paused"],
    translating: ["Translation in progress", "Visible page text is being translated in place.", ""],
    translated: ["Page translated", `${result.pageState?.translatedSections || 0} text sections → ${languageName(result.pageState?.targetLanguage)}`, "ready"],
    "translation-error": ["Translation needs attention", result.pageState?.error || "Try again to retry the translation service.", "paused"],
    ready: ["Ready to translate", `${language} → ${languageName(settings.targetLanguage)}`, "ready"]
  };

  const [title, detail, tone] = statusMap[result.status] || ["Translation ready", `${language} detected.`, "ready"];
  setStatus(title, detail, tone);
  elements.translateNow.textContent = pageTranslated ? "Show original" : "Translate this page";
  elements.translateNow.disabled = result.status === "unsupported" || result.status === "already-target" || result.status === "translating";
}

async function init() {
  for (const [code, label] of SUPPORTED_LANGUAGES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    elements.targetLanguage.append(option);
  }

  settings = await loadSettings();
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  hostname = hostnameFromUrl(activeTab?.url || "");
  elements.enabled.checked = settings.enabled;
  elements.targetLanguage.value = settings.targetLanguage;
  renderSiteRule();
  await inspect();
}

elements.enabled.addEventListener("change", async () => {
  settings = await saveSettings({ ...settings, enabled: elements.enabled.checked });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  if (!settings.enabled) setStatus("Automatic translation paused", "Manual translation remains available.", "paused");
  else await inspect();
});

elements.targetLanguage.addEventListener("change", async () => {
  settings = await saveSettings({ ...settings, targetLanguage: elements.targetLanguage.value });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  if (pageTranslated && activeTab?.id) {
    await chrome.runtime.sendMessage({ type: "translate-now", tabId: activeTab.id });
  }
  await inspect();
});

elements.translateNow.addEventListener("click", async () => {
  if (pageTranslated) {
    await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
    pageTranslated = false;
    await inspect();
    return;
  }
  elements.translateNow.disabled = true;
  elements.translateNow.textContent = "Translating…";
  const result = await chrome.runtime.sendMessage({ type: "translate-now", tabId: activeTab.id });
  if (result.status === "translated") window.close();
  else {
    elements.translateNow.textContent = "Translate this page";
    elements.translateNow.disabled = false;
    setStatus("Translation was not started", result.message || "The page did not meet the translation rules.", "paused");
  }
});

elements.siteRule.addEventListener("click", async () => {
  if (!hostname) return;
  const wasExcluded = siteIsExcluded();
  const excludedHosts = wasExcluded
    ? settings.excludedHosts.filter((rule) => !hostMatchesRule(hostname, rule))
    : [...settings.excludedHosts, hostname];
  settings = await saveSettings({ ...settings, excludedHosts });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  if (!wasExcluded && pageTranslated) await chrome.runtime.sendMessage({ type: "restore-page", tabId: activeTab.id });
  renderSiteRule();
  await inspect();
});

elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

init().catch((error) => setStatus("Extension error", error.message, "paused"));
