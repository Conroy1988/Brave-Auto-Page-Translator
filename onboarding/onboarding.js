import {
  CONSENT_VERSION,
  DEFAULT_SETTINGS,
  SUPPORTED_LANGUAGES,
  loadSettings,
  saveLocalState,
  saveSettings,
  suggestedTargetLanguage
} from "../src/settings.js";
import { providerPermissionPatterns } from "../src/translation.js";

const form = document.querySelector("#setupForm");
const targetLanguage = document.querySelector("#targetLanguage");
const providerMode = document.querySelector("#providerMode");
const consent = document.querySelector("#consent");
const status = document.querySelector("#status");
const deviceAvailability = document.querySelector("#deviceAvailability");
const ALL_SITE_ORIGINS = ["http://*/*", "https://*/*"];

for (const [code, label] of SUPPORTED_LANGUAGES) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = label;
  targetLanguage.append(option);
}

const existing = await loadSettings().catch(() => DEFAULT_SETTINGS);
targetLanguage.value = existing.targetLanguage || suggestedTargetLanguage(chrome.i18n.getUILanguage());
providerMode.value = existing.providerMode;
const behaviour = form.elements.behaviourMode;
for (const radio of behaviour) radio.checked = radio.value === existing.behaviourMode;
deviceAvailability.textContent = "Translator" in self
  ? "This browser reports an on-device Translator API. Language packs may download when first used."
  : "This browser does not currently report an on-device Translator API; automatic mode will use the next configured provider.";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  let permissionWarning = "";
  if (!consent.checked) {
    status.textContent = "Please accept the privacy checkpoint to continue.";
    consent.focus();
    return;
  }
  const behaviourMode = form.elements.behaviourMode.value;
  const requestedOrigins = behaviourMode === "all-sites"
    ? ALL_SITE_ORIGINS
    : providerPermissionPatterns(providerMode.value, { allowGoogleWebFallback: existing.allowGoogleWebFallback });
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
    providerMode: providerMode.value
  });
  await saveLocalState({
    ...(await chrome.storage.local.get(null)),
    privacyConsentVersion: CONSENT_VERSION,
    privacyConsentAt: new Date().toISOString()
  });
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  status.textContent = permissionWarning ? `Setup complete. ${permissionWarning}` : "Setup complete. You can close this tab.";
  document.querySelector("button[type='submit']").textContent = "Setup complete";
  document.querySelector("button[type='submit']").disabled = true;
});
