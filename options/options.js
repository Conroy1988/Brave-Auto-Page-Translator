import {
  CONSENT_VERSION,
  DEFAULT_LOCAL_STATE,
  DEFAULT_SETTINGS,
  EXTERNAL_PROVIDER_MODES,
  SUPPORTED_LANGUAGES,
  clearProviderSecrets,
  createSettingsBackup,
  externalProvidersForConfiguration,
  hasCurrentConsent,
  hasProviderConsent,
  loadLocalState,
  loadSettings,
  parseSettingsBackup,
  recordProviderConsents,
  saveLocalState,
  saveSettings
} from "../src/settings.js";
import { applyTranslations } from "../src/i18n.js";
import { providerPermissionPatterns } from "../src/translation.js";

const ids = [
  "settingsForm", "enabled", "behaviourMode", "targetLanguage", "approvedHosts", "providerMode",
  "allowGoogleWebFallback", "googleCloudApiKey", "libreTranslateEndpoint", "libreTranslateApiKey",
  "deepLApiKey", "deepLApiPlan", "rememberProviderCredentials", "providerDisclosure",
  "providerDisclosureTitle", "providerDisclosureText", "providerConsent", "providerConsentLabel",
  "translateDynamicContent", "translateAttributes", "readingMode", "viewportFirst", "privacyFirewall", "smartCompose", "composeStyle", "adjustTextDirection", "sensitivePageMode",
  "showPageControl", "showBadge", "excludedLanguages", "excludedHosts", "siteTargetLanguages",
  "glossary", "neverTranslateTerms", "privacyFirewallTerms", "permissionState", "toggleAllSites", "providerStatus",
  "testProvider", "consentBanner", "consentTitle", "consentDetail", "openOnboarding",
  "privacyRoute", "credentialStorage", "privacyPermission", "providerConsentSummary",
  "exportSettings", "importSettings", "settingsFile", "previewDiagnostics", "exportDiagnostics",
  "supportPreview", "diagnosticsPreview", "copyDiagnostics", "clearCache", "reset", "saveStatus",
  "packSource", "packTarget", "preparePack", "packStatus"
];
const fields = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
applyTranslations();
const ALL_SITE_ORIGINS = ["http://*/*", "https://*/*"];
const providerLabels = {
  "google-cloud": "Google Cloud Translation",
  libretranslate: "your LibreTranslate server",
  deepl: "DeepL API",
  "google-web": "Google web compatibility service"
};
let settings = { ...DEFAULT_SETTINGS };
let localState = { ...DEFAULT_LOCAL_STATE };
let diagnostics = null;
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

function customEndpointOrigin(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function collectSettings() {
  return {
    ...settings,
    enabled: fields.enabled.checked,
    behaviourMode: fields.behaviourMode.value,
    targetLanguage: fields.targetLanguage.value,
    approvedHosts: lines(fields.approvedHosts.value),
    providerMode: fields.providerMode.value,
    allowGoogleWebFallback: fields.allowGoogleWebFallback.checked,
    deepLApiPlan: fields.deepLApiPlan.value,
    translateDynamicContent: fields.translateDynamicContent.checked,
    translateAttributes: fields.translateAttributes.checked,
    readingMode: fields.readingMode.value,
    viewportFirst: fields.viewportFirst.checked,
    privacyFirewall: fields.privacyFirewall.checked,
    smartCompose: fields.smartCompose.checked,
    composeStyle: fields.composeStyle.value,
    adjustTextDirection: fields.adjustTextDirection.checked,
    sensitivePageMode: fields.sensitivePageMode.checked ? "allow" : "manual",
    showPageControl: fields.showPageControl.checked,
    showBadge: fields.showBadge.checked,
    excludedLanguages: fields.excludedLanguages.value.split(","),
    excludedHosts: lines(fields.excludedHosts.value),
    siteTargetLanguages: parseSiteTargets(fields.siteTargetLanguages.value),
    glossary: parseGlossary(fields.glossary.value),
    neverTranslateTerms: lines(fields.neverTranslateTerms.value),
    privacyFirewallTerms: lines(fields.privacyFirewallTerms.value)
  };
}

function collectLocalState() {
  return {
    ...localState,
    rememberProviderCredentials: fields.rememberProviderCredentials.checked,
    googleCloudApiKey: fields.googleCloudApiKey.value,
    libreTranslateEndpoint: fields.libreTranslateEndpoint.value,
    libreTranslateApiKey: fields.libreTranslateApiKey.value,
    deepLApiKey: fields.deepLApiKey.value
  };
}

function configuredExternalProviders() {
  return externalProvidersForConfiguration(collectSettings(), collectLocalState());
}

function renderProviderDisclosure() {
  const providers = configuredExternalProviders();
  const missing = providers.filter((provider) => !hasProviderConsent(localState, provider));
  fields.providerDisclosure.classList.toggle("hidden", providers.length === 0);
  if (!providers.length) {
    fields.providerDisclosureTitle.textContent = "On-device text route";
    fields.providerDisclosureText.textContent = "No external provider is enabled. Compatible language packs are processed by the browser on this device.";
    fields.providerConsent.checked = false;
    fields.providerConsent.disabled = true;
  } else {
    const names = providers.map((provider) => providerLabels[provider]).join(", ");
    fields.providerDisclosureTitle.textContent = `External text route: ${names}`;
    fields.providerDisclosureText.textContent = "Readable page text—or writing explicitly submitted through Smart Compose—is sent over HTTPS only when translation runs. The Privacy Firewall masks common identifiable values first. Password, PIN, security-code and payment fields, cookies, full HTML, images and files are never included.";
    fields.providerConsent.disabled = missing.length === 0;
    fields.providerConsent.checked = missing.length === 0;
    fields.providerConsentLabel.textContent = missing.length
      ? `I understand and allow ${missing.map((provider) => providerLabels[provider]).join(", ")} to receive readable page text for translation.`
      : "Provider-specific consent is already recorded for this configuration.";
  }
  fields.privacyRoute.textContent = providers.length
    ? providers.map((provider) => providerLabels[provider]).join(" → fallback to ")
    : "Browser on-device translator only";
  fields.credentialStorage.textContent = fields.rememberProviderCredentials.checked ? "Local device storage" : "Browser session only";
  const accepted = EXTERNAL_PROVIDER_MODES.filter((provider) => hasProviderConsent(localState, provider));
  fields.providerConsentSummary.textContent = accepted.length
    ? `Provider consent recorded for: ${accepted.map((provider) => providerLabels[provider]).join(", ")}.`
    : "No external-provider consent is recorded. External providers cannot be used until you explicitly approve their text route.";
}

async function renderPermission() {
  const granted = await chrome.permissions.contains({ origins: ALL_SITE_ORIGINS });
  fields.permissionState.textContent = granted ? "Granted for all websites" : "Not granted";
  fields.permissionState.style.color = granted ? "#69d7c8" : "#aaa6b7";
  fields.toggleAllSites.textContent = granted ? "Remove all-site access" : "Grant all-site access";
  fields.privacyPermission.textContent = granted ? "All HTTP and HTTPS websites" : "Only sites approved on demand";
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
  fields.deepLApiKey.value = localState.deepLApiKey;
  fields.deepLApiPlan.value = settings.deepLApiPlan;
  fields.rememberProviderCredentials.checked = localState.rememberProviderCredentials;
  fields.translateDynamicContent.checked = settings.translateDynamicContent;
  fields.translateAttributes.checked = settings.translateAttributes;
  fields.readingMode.value = settings.readingMode;
  fields.viewportFirst.checked = settings.viewportFirst;
  fields.privacyFirewall.checked = settings.privacyFirewall;
  fields.smartCompose.checked = settings.smartCompose;
  fields.composeStyle.value = settings.composeStyle;
  fields.adjustTextDirection.checked = settings.adjustTextDirection;
  fields.sensitivePageMode.checked = settings.sensitivePageMode === "allow";
  fields.showPageControl.checked = settings.showPageControl;
  fields.showBadge.checked = settings.showBadge;
  fields.excludedLanguages.value = settings.excludedLanguages.join(", ");
  fields.excludedHosts.value = settings.excludedHosts.join("\n");
  fields.siteTargetLanguages.value = Object.entries(settings.siteTargetLanguages).map(([host, language]) => `${host} = ${language}`).join("\n");
  fields.glossary.value = settings.glossary.map(({ source, replacement }) => `${source} => ${replacement}`).join("\n");
  fields.neverTranslateTerms.value = settings.neverTranslateTerms.join("\n");
  fields.privacyFirewallTerms.value = settings.privacyFirewallTerms.join("\n");
  renderConsent();
  renderProviderDisclosure();
}

function providerOriginsForConfiguration(nextSettings, nextLocal) {
  const providerConfig = {
    allowGoogleWebFallback: nextSettings.allowGoogleWebFallback,
    googleCloudApiKey: nextLocal.googleCloudApiKey,
    deepLApiKey: nextLocal.deepLApiKey,
    deepLApiPlan: nextSettings.deepLApiPlan
  };
  const providerModes = new Set([
    nextSettings.providerMode,
    ...Object.values(nextSettings.siteProfiles || {}).map((profile) => profile.providerMode)
  ]);
  const providerOrigins = [...providerModes].flatMap((provider) => providerPermissionPatterns(provider, providerConfig));
  const endpointOrigin = customEndpointOrigin(nextLocal.libreTranslateEndpoint);
  if (endpointOrigin && [...providerModes].some((provider) => ["auto", "libretranslate"].includes(provider))) providerOrigins.push(endpointOrigin);
  return [...new Set(providerOrigins)];
}

async function saveAll() {
  const nextSettings = collectSettings();
  let nextLocal = collectLocalState();
  const externalProviders = externalProvidersForConfiguration(nextSettings, nextLocal);
  const missingConsents = externalProviders.filter((provider) => !hasProviderConsent(nextLocal, provider));
  if (missingConsents.length) {
    if (!fields.providerConsent.checked) throw new Error("Review and accept the provider data route before saving this external provider.");
    nextLocal = recordProviderConsents(nextLocal, missingConsents);
  }
  const providerOrigins = providerOriginsForConfiguration(nextSettings, nextLocal);
  const requestedOrigins = nextSettings.behaviourMode === "all-sites" ? ALL_SITE_ORIGINS : providerOrigins;
  const permissionsGranted = !requestedOrigins.length || await chrome.permissions.request({ origins: requestedOrigins });
  if (!permissionsGranted) {
    if (nextSettings.behaviourMode === "all-sites") {
      nextSettings.behaviourMode = "manual";
      fields.behaviourMode.value = "manual";
      showStatus("All-site access was declined; Manual only was saved instead.", true);
    }
    const providerAlreadyGranted = !providerOrigins.length || await chrome.permissions.contains({ origins: providerOrigins });
    if (externalProviders.length && !providerAlreadyGranted) {
      throw new Error("Website access to the configured external translation provider was declined.");
    }
  }
  settings = await saveSettings(nextSettings);
  localState = await saveLocalState(nextLocal);
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  render();
  await renderPermission();
}

for (const [code, label] of SUPPORTED_LANGUAGES) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = label;
  fields.targetLanguage.append(option);
  fields.packSource.append(new Option(label, code));
  fields.packTarget.append(new Option(label, code));
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

for (const field of [fields.providerMode, fields.allowGoogleWebFallback, fields.googleCloudApiKey, fields.libreTranslateEndpoint, fields.deepLApiKey, fields.deepLApiPlan, fields.rememberProviderCredentials]) {
  field.addEventListener("input", renderProviderDisclosure);
  field.addEventListener("change", renderProviderDisclosure);
}

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

fields.exportSettings.addEventListener("click", () => {
  downloadJson(createSettingsBackup(collectSettings()), `auto-page-translator-settings-${Date.now()}.json`);
  showStatus("Credential-free settings backup exported");
});

fields.importSettings.addEventListener("click", () => fields.settingsFile.click());
fields.settingsFile.addEventListener("change", async () => {
  try {
    const file = fields.settingsFile.files?.[0];
    if (!file) return;
    settings = await saveSettings(parseSettingsBackup(await file.text()));
    await chrome.runtime.sendMessage({ type: "refresh-settings" });
    render();
    await renderPermission();
    showStatus("Settings imported; provider credentials and consent were unchanged");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    fields.settingsFile.value = "";
  }
});

async function loadDiagnostics() {
  const result = await chrome.runtime.sendMessage({ type: "get-diagnostics" });
  diagnostics = result.diagnostics;
  fields.diagnosticsPreview.value = JSON.stringify(diagnostics, null, 2);
  fields.supportPreview.hidden = false;
  return diagnostics;
}

fields.previewDiagnostics.addEventListener("click", async () => {
  await loadDiagnostics();
  fields.diagnosticsPreview.focus();
});

fields.exportDiagnostics.addEventListener("click", async () => {
  downloadJson(diagnostics || await loadDiagnostics(), `auto-page-translator-diagnostics-${Date.now()}.json`);
  showStatus("Privacy-safe diagnostic report exported");
});

fields.copyDiagnostics.addEventListener("click", async () => {
  await navigator.clipboard.writeText(fields.diagnosticsPreview.value || JSON.stringify(await loadDiagnostics(), null, 2));
  showStatus("Support report copied after review");
});

fields.clearCache.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear-provider-cache" });
  showStatus("In-memory translation cache cleared");
});

fields.preparePack.addEventListener("click", async () => {
  fields.preparePack.disabled = true;
  fields.packStatus.textContent = "Checking browser support…";
  try {
    const availability = await chrome.runtime.sendMessage({ type: "get-on-device-availability", sourceLanguage: fields.packSource.value, targetLanguage: fields.packTarget.value });
    if (["unsupported", "unavailable"].includes(availability.availability)) {
      fields.packStatus.textContent = "This browser or language pair is unavailable.";
      return;
    }
    fields.packStatus.textContent = availability.availability === "available" ? "Language pair ready." : "Downloading browser language pack…";
    const prepared = await chrome.runtime.sendMessage({ type: "download-on-device-language-pack", sourceLanguage: fields.packSource.value, targetLanguage: fields.packTarget.value });
    fields.packStatus.textContent = prepared.status === "ok" ? "Language pair ready for on-device translation." : prepared.message || "Language pack could not be prepared.";
  } finally {
    fields.preparePack.disabled = false;
  }
});

fields.reset.addEventListener("click", async () => {
  settings = await saveSettings(DEFAULT_SETTINGS);
  await clearProviderSecrets();
  localState = await saveLocalState({
    ...localState,
    rememberProviderCredentials: false,
    googleCloudApiKey: "",
    libreTranslateEndpoint: "",
    libreTranslateApiKey: "",
    deepLApiKey: ""
  });
  await chrome.permissions.remove({ origins: ALL_SITE_ORIGINS }).catch(() => false);
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  render();
  await renderPermission();
  showStatus("Defaults restored; privacy and provider consent records were retained");
});

[settings, localState] = await Promise.all([loadSettings(), loadLocalState()]);
fields.packSource.value = "es";
fields.packTarget.value = settings.targetLanguage;
render();
await renderPermission();
