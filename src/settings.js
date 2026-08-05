export const CONSENT_VERSION = 2;
export const SETTINGS_SCHEMA_VERSION = 2;
export const SETTINGS_BACKUP_FORMAT = "auto-page-translator-settings";

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
export const PROVIDER_MODES = Object.freeze(["auto", "on-device", "google-cloud", "libretranslate", "deepl", "google-web"]);
export const EXTERNAL_PROVIDER_MODES = Object.freeze(["google-cloud", "libretranslate", "deepl", "google-web"]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  behaviourMode: "manual",
  targetLanguage: "en",
  providerMode: "auto",
  allowGoogleWebFallback: false,
  deepLApiPlan: "free",
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
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  privacyConsentVersion: 0,
  privacyConsentAt: "",
  providerConsents: {},
  rememberProviderCredentials: false,
  googleCloudApiKey: "",
  libreTranslateEndpoint: "",
  libreTranslateApiKey: "",
  deepLApiKey: ""
});

export const SYNC_SETTING_KEYS = Object.freeze([
  "enabled",
  "behaviourMode",
  "targetLanguage",
  "providerMode",
  "allowGoogleWebFallback",
  "deepLApiPlan",
  "translateDynamicContent",
  "translateAttributes",
  "sensitivePageMode",
  "adjustTextDirection",
  "showPageControl",
  "showBadge"
]);

export const LOCAL_SETTING_KEYS = Object.freeze([
  "excludedLanguages",
  "excludedHosts",
  "approvedHosts",
  "siteTargetLanguages",
  "glossary",
  "neverTranslateTerms"
]);

const SECRET_KEYS = Object.freeze([
  "googleCloudApiKey",
  "libreTranslateEndpoint",
  "libreTranslateApiKey",
  "deepLApiKey"
]);
const VALID_TARGETS = new Set(SUPPORTED_LANGUAGES.map(([code]) => code));
const VALID_TARGET_LOOKUP = new Map(SUPPORTED_LANGUAGES.map(([code]) => [code.toLowerCase(), code]));
let migrationPromise;

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

function cleanProviderConsents(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([provider, acceptedAt]) => EXTERNAL_PROVIDER_MODES.includes(provider) && typeof acceptedAt === "string" && acceptedAt));
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

function storageDefaults(keys) {
  return pick(DEFAULT_SETTINGS, keys);
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
    allowGoogleWebFallback: value.allowGoogleWebFallback === true,
    deepLApiPlan: value.deepLApiPlan === "pro" ? "pro" : "free",
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
    settingsSchemaVersion: Number.isInteger(value.settingsSchemaVersion) ? value.settingsSchemaVersion : 1,
    privacyConsentVersion: Number.isInteger(value.privacyConsentVersion) ? value.privacyConsentVersion : 0,
    privacyConsentAt: typeof value.privacyConsentAt === "string" ? value.privacyConsentAt : "",
    providerConsents: cleanProviderConsents(value.providerConsents),
    rememberProviderCredentials: value.rememberProviderCredentials === true,
    googleCloudApiKey: typeof value.googleCloudApiKey === "string" ? value.googleCloudApiKey.trim() : "",
    libreTranslateEndpoint: typeof value.libreTranslateEndpoint === "string" ? value.libreTranslateEndpoint.trim() : "",
    libreTranslateApiKey: typeof value.libreTranslateApiKey === "string" ? value.libreTranslateApiKey.trim() : "",
    deepLApiKey: typeof value.deepLApiKey === "string" ? value.deepLApiKey.trim() : ""
  };
}

export function hasCurrentConsent(localState) {
  return normalizeLocalState(localState).privacyConsentVersion >= CONSENT_VERSION;
}

export function hasProviderConsent(localState, provider) {
  if (!EXTERNAL_PROVIDER_MODES.includes(provider)) return true;
  return Boolean(normalizeLocalState(localState).providerConsents[provider]);
}

export function recordProviderConsents(localState, providers, acceptedAt = new Date().toISOString()) {
  const normalized = normalizeLocalState(localState);
  const providerConsents = { ...normalized.providerConsents };
  for (const provider of providers) {
    if (EXTERNAL_PROVIDER_MODES.includes(provider)) providerConsents[provider] = acceptedAt;
  }
  return { ...normalized, providerConsents };
}

export function externalProvidersForConfiguration(settings, localState = {}) {
  const normalizedSettings = normalizeSettings(settings);
  const normalizedLocal = normalizeLocalState(localState);
  if (normalizedSettings.providerMode !== "auto") {
    const providers = EXTERNAL_PROVIDER_MODES.includes(normalizedSettings.providerMode) ? [normalizedSettings.providerMode] : [];
    if (normalizedSettings.allowGoogleWebFallback && normalizedSettings.providerMode !== "google-web") providers.push("google-web");
    return [...new Set(providers)];
  }
  return [
    ...(normalizedLocal.googleCloudApiKey ? ["google-cloud"] : []),
    ...(normalizedLocal.libreTranslateEndpoint ? ["libretranslate"] : []),
    ...(normalizedLocal.deepLApiKey ? ["deepl"] : []),
    ...(normalizedSettings.allowGoogleWebFallback ? ["google-web"] : [])
  ];
}

export function suggestedTargetLanguage(uiLanguage = "en") {
  const normalized = String(uiLanguage || "en").replace("_", "-").toLowerCase();
  return VALID_TARGET_LOOKUP.get(normalized)
    || VALID_TARGET_LOOKUP.get(normalized.split("-")[0])
    || "en";
}

export async function restrictStorageAccess() {
  for (const area of [chrome.storage.local, chrome.storage.sync, chrome.storage.session]) {
    if (typeof area.setAccessLevel === "function") {
      await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    }
  }
}

export async function migrateSettingsStorage() {
  const [syncStored, localStored] = await Promise.all([
    chrome.storage.sync.get(null),
    chrome.storage.local.get(null)
  ]);
  if (Number(localStored.settingsSchemaVersion) >= SETTINGS_SCHEMA_VERSION) {
    return normalizeSettings({ ...syncStored, ...pick(localStored, LOCAL_SETTING_KEYS) });
  }
  const merged = normalizeSettings({ ...syncStored, ...pick(localStored, LOCAL_SETTING_KEYS) });
  const localRules = {};
  for (const key of LOCAL_SETTING_KEYS) {
    localRules[key] = Object.hasOwn(localStored, key) ? localStored[key] : syncStored[key];
  }
  const normalizedRules = pick(normalizeSettings({ ...merged, ...localRules }), LOCAL_SETTING_KEYS);
  // Write the complete local copy and migration marker before deleting synchronized
  // values so concurrent extension contexts can never observe an empty in-between state.
  await chrome.storage.local.set({ ...normalizedRules, settingsSchemaVersion: SETTINGS_SCHEMA_VERSION });
  await chrome.storage.sync.set(pick(merged, SYNC_SETTING_KEYS));
  await chrome.storage.sync.remove(LOCAL_SETTING_KEYS);
  return { ...merged, ...normalizedRules };
}

async function ensureMigration() {
  migrationPromise ||= migrateSettingsStorage().catch((error) => {
    migrationPromise = undefined;
    throw error;
  });
  return migrationPromise;
}

export async function loadSettings() {
  await ensureMigration();
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get(storageDefaults(SYNC_SETTING_KEYS)),
    chrome.storage.local.get(storageDefaults(LOCAL_SETTING_KEYS))
  ]);
  return normalizeSettings({ ...synced, ...local });
}

export async function saveSettings(settings) {
  await ensureMigration();
  const normalized = normalizeSettings(settings);
  await Promise.all([
    chrome.storage.sync.set(pick(normalized, SYNC_SETTING_KEYS)),
    chrome.storage.local.set(pick(normalized, LOCAL_SETTING_KEYS))
  ]);
  return normalized;
}

export async function loadLocalState() {
  await ensureMigration();
  const [persistent, session] = await Promise.all([
    chrome.storage.local.get(DEFAULT_LOCAL_STATE),
    chrome.storage.session.get(pick(DEFAULT_LOCAL_STATE, SECRET_KEYS))
  ]);
  const normalized = normalizeLocalState(persistent);
  const sessionSecrets = normalizeLocalState(session);
  return normalizeLocalState({
    ...normalized,
    ...Object.fromEntries(SECRET_KEYS.map((key) => [key, sessionSecrets[key] || normalized[key]]))
  });
}

export async function saveLocalState(state) {
  await ensureMigration();
  const normalized = normalizeLocalState({ ...state, settingsSchemaVersion: SETTINGS_SCHEMA_VERSION });
  const secrets = pick(normalized, SECRET_KEYS);
  const persistent = {
    ...normalized,
    ...Object.fromEntries(SECRET_KEYS.map((key) => [key, normalized.rememberProviderCredentials ? secrets[key] : ""]))
  };
  await Promise.all([
    chrome.storage.session.set(secrets),
    chrome.storage.local.set(persistent)
  ]);
  return normalized;
}

export async function clearProviderSecrets() {
  await Promise.all([
    chrome.storage.session.remove(SECRET_KEYS),
    chrome.storage.local.remove(SECRET_KEYS)
  ]);
}

export function createSettingsBackup(settings, createdAt = new Date().toISOString()) {
  return {
    format: SETTINGS_BACKUP_FORMAT,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    createdAt,
    settings: normalizeSettings(settings)
  };
}

export function parseSettingsBackup(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || parsed.format !== SETTINGS_BACKUP_FORMAT || !parsed.settings || typeof parsed.settings !== "object") {
    throw new Error("This is not an Auto Page Translator settings backup.");
  }
  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion > SETTINGS_SCHEMA_VERSION) {
    throw new Error("This settings backup was created by a newer unsupported version.");
  }
  return normalizeSettings(parsed.settings);
}
