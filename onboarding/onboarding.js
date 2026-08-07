import {
  CONSENT_VERSION,
  DEFAULT_SETTINGS,
  SUPPORTED_LANGUAGES,
  externalProvidersForConfiguration,
  hasProviderConsent,
  loadLocalState,
  loadSettings,
  recordProviderConsents,
  saveLocalState,
  saveSettings,
  suggestedTargetLanguage
} from "../src/settings.js";
import { applyTranslations } from "../src/i18n.js";
import { providerPermissionPatterns } from "../src/translation.js";

const form = document.querySelector("#setupForm");
applyTranslations();
const targetLanguage = document.querySelector("#targetLanguage");
const providerMode = document.querySelector("#providerMode");
const allowGoogleWebFallback = document.querySelector("#allowGoogleWebFallback");
const consent = document.querySelector("#consent");
const providerConsent = document.querySelector("#providerConsent");
const providerConsentRow = document.querySelector("#providerConsentRow");
const providerConsentLabel = document.querySelector("#providerConsentLabel");
const status = document.querySelector("#status");
const deviceAvailability = document.querySelector("#deviceAvailability");
const ALL_SITE_ORIGINS = ["http://*/*", "https://*/*"];

for (const [code, label] of SUPPORTED_LANGUAGES) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = label;
  targetLanguage.append(option);
}

const [existing, existingLocal] = await Promise.all([
  loadSettings().catch(() => DEFAULT_SETTINGS),
  loadLocalState()
]);
targetLanguage.value = existing.targetLanguage || suggestedTargetLanguage(chrome.i18n.getUILanguage());
providerMode.value = existing.providerMode;
allowGoogleWebFallback.checked = existing.allowGoogleWebFallback;
const behaviour = form.elements.behaviourMode;
for (const radio of behaviour) radio.checked = radio.value === existing.behaviourMode;
const providerNames = {
  "google-cloud": "Google Cloud Translation",
  libretranslate: "your LibreTranslate server",
  deepl: "DeepL API",
  "google-web": "Google web compatibility service"
};

function externalProviders() {
  return externalProvidersForConfiguration({
    ...existing,
    providerMode: providerMode.value,
    allowGoogleWebFallback: allowGoogleWebFallback.checked
  }, existingLocal);
}

function renderProviderConsent() {
  const missing = externalProviders().filter((provider) => !hasProviderConsent(existingLocal, provider));
  providerConsentRow.hidden = missing.length === 0;
  providerConsent.required = missing.length > 0;
  providerConsent.checked = false;
  providerConsentLabel.textContent = missing.length
    ? `I explicitly allow ${missing.map((provider) => providerNames[provider]).join(", ")} to receive readable page text for translation.`
    : "No new external-provider approval is required.";
}

providerMode.addEventListener("change", renderProviderConsent);
allowGoogleWebFallback.addEventListener("change", renderProviderConsent);
renderProviderConsent();

try {
  const availability = await chrome.runtime.sendMessage({
    type: "get-on-device-availability",
    sourceLanguage: "es",
    targetLanguage: targetLanguage.value
  });
  const labels = {
    available: "ready on this device",
    downloadable: "supported; a language pack will download on first use",
    downloading: "language pack download is in progress",
    unavailable: "not currently available for this language pair"
  };
  deviceAvailability.textContent = `On-device translator: ${labels[availability?.availability] || availability?.availability || "availability could not be confirmed"}.`;
} catch {
  deviceAvailability.textContent = "On-device translator availability could not be confirmed. Automatic mode will remain fail-safe if no approved provider is available.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  let permissionWarning = "";
  if (!consent.checked) {
    status.textContent = "Please accept the privacy checkpoint to continue.";
    consent.focus();
    return;
  }
  const missingProviderConsents = externalProviders().filter((provider) => !hasProviderConsent(existingLocal, provider));
  if (missingProviderConsents.length && !providerConsent.checked) {
    status.textContent = "Please approve the selected external provider's text route or choose on-device translation.";
    providerConsent.focus();
    return;
  }
  const behaviourMode = form.elements.behaviourMode.value;
  const requestedOrigins = behaviourMode === "all-sites"
    ? ALL_SITE_ORIGINS
    : providerPermissionPatterns(providerMode.value, { allowGoogleWebFallback: allowGoogleWebFallback.checked });
  if (requestedOrigins.length) {
    status.textContent = behaviourMode === "all-sites" ? "Waiting for website-access permission…" : "Waiting for translation-provider access…";
    const granted = await chrome.permissions.request({ origins: requestedOrigins });
    if (!granted) {
      if (behaviourMode === "all-sites") {
        permissionWarning = "All-site access was declined, so Manual mode was selected. Grant provider access later in Settings.";
        status.textContent = permissionWarning;
        form.elements.behaviourMode.value = "manual";
      } else {
        permissionWarning = "Provider access was declined. External translation may need permission from Settings.";
        status.textContent = permissionWarning;
      }
    }
  }
  const finalMode = form.elements.behaviourMode.value;
  await saveSettings({
    ...existing,
    enabled: true,
    behaviourMode: finalMode,
    targetLanguage: targetLanguage.value,
    providerMode: providerMode.value,
    allowGoogleWebFallback: allowGoogleWebFallback.checked
  });
  await saveLocalState(recordProviderConsents({
    ...existingLocal,
    privacyConsentVersion: CONSENT_VERSION,
    privacyConsentAt: new Date().toISOString()
  }, missingProviderConsents));
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  status.textContent = permissionWarning ? `Setup complete. ${permissionWarning}` : "Setup complete. You can close this tab.";
  document.querySelector("button[type='submit']").textContent = "Setup complete";
  document.querySelector("button[type='submit']").disabled = true;
});
