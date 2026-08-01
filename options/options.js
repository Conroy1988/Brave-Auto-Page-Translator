import {
  CONSENT_VERSION,
  DEFAULT_LOCAL_STATE,
  DEFAULT_SETTINGS,
  SUPPORTED_LANGUAGES,
  hasCurrentConsent,
  loadLocalState,
  loadSettings,
  saveLocalState,
  saveSettings
} from "../src/settings.js";
import { providerPermissionPatterns } from "../src/translation.js";

const ids = [
  "settingsForm", "enabled", "behaviourMode", "targetLanguage", "approvedHosts", "providerMode",
  "allowGoogleWebFallback", "googleCloudApiKey", "libreTranslateEndpoint", "libreTranslateApiKey",
  "translateDynamicContent", "translateAttributes", "adjustTextDirection", "sensitivePageMode",
  "showPageControl", "showBadge", "excludedLanguages", "excludedHosts", "siteTargetLanguages",
  "glossary", "neverTranslateTerms", "permissionState", "toggleAllSites", "providerStatus",
  "testProvider", "consentBanner", "consentTitle", "consentDetail", "openOnboarding", "exportDiagnostics",
  "clearCache", "reset", "saveStatus"
];
const fields = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
const ALL_SITE_ORIGINS = ["http://*/*", "https://*/*"];
let settings = { ...DEFAULT_SETTINGS };
let localState = { ...DEFAULT_LOCAL_STATE };
let statusTimer;

function showStatus(message, error = false) {
  clearTimeout(statusTimer);
  fields.saveStatus.textContent = message;
  fields.saveStatus.style.color = error ? "#ff9898" : "#69d7c8";
  statusTimer = setTimeout(() => { fields.saveStatus.textContent = ""; }, 5000);
}

function lines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function parseSiteTargets(value) {
  return Object.fromEntries(lines(value).flatMap((line) => {
    const [host, language] = line.split("=").map((item) => item.trim());
    return host && language ? [[host, language]] : [];
  }));
}

function parseGlossary(value) {
  return lines(value).flatMap((line) => {
    const separator = line.includes("=>") ? "=>" : "=";
    const [source, replacement] = line.split(separator).map((item) => item.trim());
    return source && replacement ? [{ source, replacement }] : [];
  });
}

async function renderPermission() {
  const granted = await chrome.permissions.contains({ origins: ALL_SITE_ORIGINS });
  fields.permissionState.textContent = granted ? "Granted for all websites" : "Not granted";
  fields.permissionState.style.color = granted ? "#69d7c8" : "#aaa6b7";
  fields.toggleAllSites.textContent = granted ? "Remove all-site access" : "Grant all-site access";
  return granted;
}

function renderConsent() {
  const current = hasCurrentConsent(localState);
  fields.consentBanner.classList.toggle("ready", current);
  fields.consentTitle.textContent = current ? "Privacy setup complete" : "Privacy setup required";
  fields.consentDetail.textContent = current
    ? `Consent version ${localState.privacyConsentVersion} accepted ${localState.privacyConsentAt ? new Date(localState.privacyConsentAt).toLocaleString() : ""}.`
    : "Translation is blocked until the page-text disclosure is accepted.";
  fields.openOnboarding.textContent = current ? "Review privacy setup" : "Complete setup";
}

function render() {
  fields.enabled.checked = settings.enabled;
  fields.behaviourMode.value = settings.behaviourMode;
  fields.targetLanguage.value = settings.targetLanguage;
  fields.approvedHosts.value = settings.approvedHosts.join("\n");
  fields.providerMode.value = settings.providerMode;
  fields.allowGoogleWebFallback.checked = settings.allowGoogleWebFallback;
  fields.googleCloudApiKey.value = localState.googleCloudApiKey;
  fields.libreTranslateEndpoint.value = localState.libreTranslateEndpoint;
  fields.libreTranslateApiKey.value = localState.libreTranslateApiKey;
  fields.translateDynamicContent.checked = settings.translateDynamicContent;
  fields.translateAttributes.checked = settings.translateAttributes;
  fields.adjustTextDirection.checked = settings.adjustTextDirection;
  fields.sensitivePageMode.checked = settings.sensitivePageMode === "allow";
  fields.showPageControl.checked = settings.showPageControl;
  fields.showBadge.checked = settings.showBadge;
  fields.excludedLanguages.value = settings.excludedLanguages.join(", ");
  fields.excludedHosts.value = settings.excludedHosts.join("\n");
  fields.siteTargetLanguages.value = Object.entries(settings.siteTargetLanguages).map(([host, language]) => `${host} = ${language}`).join("\n");
  fields.glossary.value = settings.glossary.map(({ source, replacement }) => `${source} => ${replacement}`).join("\n");
  fields.neverTranslateTerms.value = settings.neverTranslateTerms.join("\n");
  renderConsent();
}

function collectSettings() {
  return {
    enabled: fields.enabled.checked,
    behaviourMode: fields.behaviourMode.value,
    targetLanguage: fields.targetLanguage.value,
    approvedHosts: lines(fields.approvedHosts.value),
    providerMode: fields.providerMode.value,
    allowGoogleWebFallback: fields.allowGoogleWebFallback.checked,
    translateDynamicContent: fields.translateDynamicContent.checked,
    translateAttributes: fields.translateAttributes.checked,
    adjustTextDirection: fields.adjustTextDirection.checked,
    sensitivePageMode: fields.sensitivePageMode.checked ? "allow" : "manual",
    showPageControl: fields.showPageControl.checked,
    showBadge: fields.showBadge.checked,
    excludedLanguages: fields.excludedLanguages.value.split(","),
    excludedHosts: lines(fields.excludedHosts.value),
    siteTargetLanguages: parseSiteTargets(fields.siteTargetLanguages.value),
    glossary: parseGlossary(fields.glossary.value),
    neverTranslateTerms: lines(fields.neverTranslateTerms.value)
  };
}

function customEndpointOrigin(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

async function saveAll() {
  const nextSettings = collectSettings();
  if (nextSettings.behaviourMode === "all-sites" && !await chrome.permissions.contains({ origins: ALL_SITE_ORIGINS })) {
    const granted = await chrome.permissions.request({ origins: ALL_SITE_ORIGINS });
    if (!granted) {
      nextSettings.behaviourMode = "manual";
      showStatus("All-site access was declined; Manual only was saved instead.", true);
    }
  }
  const providerOrigins = providerPermissionPatterns(nextSettings.providerMode, {
    allowGoogleWebFallback: nextSettings.allowGoogleWebFallback,
    googleCloudApiKey: fields.googleCloudApiKey.value.trim()
  });
  if (providerOrigins.length && !await chrome.permissions.contains({ origins: providerOrigins })) {
    const granted = await chrome.permissions.request({ origins: providerOrigins });
    if (!granted && ["google-cloud", "google-web"].includes(nextSettings.providerMode)) {
      throw new Error("Website access to the selected Google translation provider was declined.");
    }
    if (!granted) showStatus("Provider fallback access was declined; another configured engine may still work.", true);
  }
  const endpointOrigin = customEndpointOrigin(fields.libreTranslateEndpoint.value);
  if (endpointOrigin && !await chrome.permissions.contains({ origins: [endpointOrigin] })) {
    const granted = await chrome.permissions.request({ origins: [endpointOrigin] });
    if (!granted && nextSettings.providerMode === "libretranslate") throw new Error("Website access to the LibreTranslate endpoint was declined.");
  }
  settings = await saveSettings(nextSettings);
  localState = await saveLocalState({
    ...localState,
    googleCloudApiKey: fields.googleCloudApiKey.value,
    libreTranslateEndpoint: fields.libreTranslateEndpoint.value,
    libreTranslateApiKey: fields.libreTranslateApiKey.value
  });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  render();
  await renderPermission();
}

for (const [code, label] of SUPPORTED_LANGUAGES) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = label;
  fields.targetLanguage.append(option);
}

fields.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveAll();
    showStatus("Settings saved");
  } catch (error) {
    showStatus(error.message, true);
  }
});

fields.toggleAllSites.addEventListener("click", async () => {
  const granted = await chrome.permissions.contains({ origins: ALL_SITE_ORIGINS });
  if (granted) {
    await chrome.permissions.remove({ origins: ALL_SITE_ORIGINS });
    if (settings.behaviourMode === "all-sites") {
      settings = await saveSettings({ ...settings, behaviourMode: "manual" });
      fields.behaviourMode.value = "manual";
    }
  } else await chrome.permissions.request({ origins: ALL_SITE_ORIGINS });
  await chrome.runtime.sendMessage({ type: "sync-content-scripts" });
  await renderPermission();
});

fields.testProvider.addEventListener("click", async () => {
  fields.providerStatus.textContent = "Saving and testing…";
  try {
    await saveAll();
    const result = await chrome.runtime.sendMessage({ type: "test-provider" });
    fields.providerStatus.textContent = result.status === "ok"
      ? `Success via ${result.engine}: ${result.sample}`
      : result.message || "Provider test failed.";
  } catch (error) {
    fields.providerStatus.textContent = error.message;
  }
});

fields.openOnboarding.addEventListener("click", () => chrome.runtime.sendMessage({ type: "open-onboarding" }));

fields.exportDiagnostics.addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "get-diagnostics" });
  const blob = new Blob([JSON.stringify(result.diagnostics, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `auto-page-translator-diagnostics-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showStatus("Privacy-safe diagnostic report exported");
});

fields.clearCache.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear-provider-cache" });
  showStatus("In-memory translation cache cleared");
});

fields.reset.addEventListener("click", async () => {
  settings = await saveSettings(DEFAULT_SETTINGS);
  localState = await saveLocalState({
    ...localState,
    googleCloudApiKey: "",
    libreTranslateEndpoint: "",
    libreTranslateApiKey: ""
  });
  await chrome.permissions.remove({ origins: ALL_SITE_ORIGINS }).catch(() => false);
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  render();
  await renderPermission();
  showStatus("Defaults restored; privacy consent was retained");
});

[settings, localState] = await Promise.all([loadSettings(), loadLocalState()]);
render();
await renderPermission();
