export const CONSENT_VERSION = 1;

export const SUPPORTED_LANGUAGES = Object.freeze([
  ["en", "English"],
  ["ar", "Arabic"],
  ["bn", "Bengali"],
  ["bg", "Bulgarian"],
  ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"],
  ["hr", "Croatian"],
  ["cs", "Czech"],
  ["da", "Danish"],
  ["nl", "Dutch"],
  ["et", "Estonian"],
  ["fi", "Finnish"],
  ["fr", "French"],
  ["de", "German"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["kn", "Kannada"],
  ["ko", "Korean"],
  ["lv", "Latvian"],
  ["lt", "Lithuanian"],
  ["mr", "Marathi"],
  ["no", "Norwegian"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["sr", "Serbian"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["es", "Spanish"],
  ["sv", "Swedish"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["vi", "Vietnamese"]
]);

export const BEHAVIOUR_MODES = Object.freeze(["manual", "approved-sites", "all-sites"]);
export const PROVIDER_MODES = Object.freeze(["auto", "on-device", "google-cloud", "libretranslate", "google-web"]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  behaviourMode: "manual",
  targetLanguage: "en",
  providerMode: "auto",
  allowGoogleWebFallback: true,
  excludedLanguages: [],
  excludedHosts: ["localhost", "127.0.0.1"],
  approvedHosts: [],
  siteTargetLanguages: {},
  glossary: [],
  neverTranslateTerms: [],
  translateDynamicContent: true,
  translateAttributes: false,
  sensitivePageMode: "manual",
  adjustTextDirection: true,
  showPageControl: true,
  showBadge: true
});

export const DEFAULT_LOCAL_STATE = Object.freeze({
  privacyConsentVersion: 0,
  privacyConsentAt: "",
  googleCloudApiKey: "",
  libreTranslateEndpoint: "",
  libreTranslateApiKey: ""
});

const VALID_TARGETS = new Set(SUPPORTED_LANGUAGES.map(([code]) => code));
const VALID_TARGET_LOOKUP = new Map(SUPPORTED_LANGUAGES.map(([code]) => [code.toLowerCase(), code]));

function cleanList(value, transform = (item) => item) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => transform(item.trim()))
    .filter(Boolean))];
}

function cleanHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function cleanSiteTargets(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([host, language]) => [cleanHost(host), VALID_TARGET_LOOKUP.get(String(language).toLowerCase())])
    .filter(([host, language]) => host && language));
}

function cleanGlossary(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((entry) => {
    const source = String(entry?.source || "").trim();
    const replacement = String(entry?.replacement || "").trim();
    const key = source.toLocaleLowerCase();
    if (!source || !replacement || seen.has(key)) return [];
    seen.add(key);
    return [{ source, replacement }];
  }).slice(0, 200);
}

export function normalizeSettings(value = {}) {
  const targetLanguage = VALID_TARGETS.has(value.targetLanguage)
    ? value.targetLanguage
    : DEFAULT_SETTINGS.targetLanguage;

  return {
    enabled: value.enabled !== false,
    behaviourMode: BEHAVIOUR_MODES.includes(value.behaviourMode) ? value.behaviourMode : DEFAULT_SETTINGS.behaviourMode,
    targetLanguage,
    providerMode: PROVIDER_MODES.includes(value.providerMode) ? value.providerMode : DEFAULT_SETTINGS.providerMode,
    allowGoogleWebFallback: value.allowGoogleWebFallback !== false,
    excludedLanguages: cleanList(value.excludedLanguages, (item) => item.toLowerCase()),
    excludedHosts: cleanList(value.excludedHosts, cleanHost),
    approvedHosts: cleanList(value.approvedHosts, cleanHost),
    siteTargetLanguages: cleanSiteTargets(value.siteTargetLanguages),
    glossary: cleanGlossary(value.glossary),
    neverTranslateTerms: cleanList(value.neverTranslateTerms).slice(0, 200),
    translateDynamicContent: value.translateDynamicContent !== false,
    translateAttributes: value.translateAttributes === true,
    sensitivePageMode: value.sensitivePageMode === "allow" ? "allow" : "manual",
    adjustTextDirection: value.adjustTextDirection !== false,
    showPageControl: value.showPageControl !== false,
    showBadge: value.showBadge !== false
  };
}

export function normalizeLocalState(value = {}) {
  return {
    privacyConsentVersion: Number.isInteger(value.privacyConsentVersion) ? value.privacyConsentVersion : 0,
    privacyConsentAt: typeof value.privacyConsentAt === "string" ? value.privacyConsentAt : "",
    googleCloudApiKey: typeof value.googleCloudApiKey === "string" ? value.googleCloudApiKey.trim() : "",
    libreTranslateEndpoint: typeof value.libreTranslateEndpoint === "string" ? value.libreTranslateEndpoint.trim() : "",
    libreTranslateApiKey: typeof value.libreTranslateApiKey === "string" ? value.libreTranslateApiKey.trim() : ""
  };
}

export function hasCurrentConsent(localState) {
  return normalizeLocalState(localState).privacyConsentVersion >= CONSENT_VERSION;
}

export function suggestedTargetLanguage(uiLanguage = "en") {
  const normalized = String(uiLanguage || "en").replace("_", "-").toLowerCase();
  return VALID_TARGET_LOOKUP.get(normalized)
    || VALID_TARGET_LOOKUP.get(normalized.split("-")[0])
    || "en";
}

export async function loadSettings() {
  return normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.sync.set(normalized);
  return normalized;
}

export async function loadLocalState() {
  return normalizeLocalState(await chrome.storage.local.get(DEFAULT_LOCAL_STATE));
}

export async function saveLocalState(state) {
  const normalized = normalizeLocalState(state);
  await chrome.storage.local.set(normalized);
  return normalized;
}
