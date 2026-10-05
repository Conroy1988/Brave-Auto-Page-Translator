import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_VERSION,
  SETTINGS_SCHEMA_VERSION,
  createSettingsBackup,
  externalProvidersForConfiguration,
  hasCurrentConsent,
  hasProviderConsent,
  loadLocalState,
  migrateSettingsStorage,
  normalizeLocalState,
  normalizeSettings,
  parseSettingsBackup,
  recordProviderConsents,
  saveLocalState,
  shouldRecommendGoogleWebFallback,
  suggestedTargetLanguage
} from "../src/settings.js";

test("defaults to all websites with sensitive safeguards", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.behaviourMode, "all-sites");
  assert.equal(settings.allowGoogleWebFallback, false);
  assert.equal(settings.translateAttributes, false);
  assert.equal(settings.sensitivePageMode, "manual");
  assert.equal(settings.readingMode, "translated");
  assert.equal(settings.viewportFirst, true);
  assert.equal(settings.privacyFirewall, true);
  assert.equal(settings.smartCompose, true);
});

test("keeps existing manual and approved-site choices when applying defaults", () => {
  for (const behaviourMode of ["manual", "approved-sites", "all-sites"]) {
    assert.equal(normalizeSettings({ behaviourMode, targetLanguage: "fr" }).behaviourMode, behaviourMode);
  }
});

test("normalizes rules, targets and glossary entries", () => {
  const settings = normalizeSettings({
    approvedHosts: ["https://www.Example.com/path", "example.com"],
    siteTargetLanguages: { "Forum.Example.com": "fr" },
    glossary: [{ source: " Bomberos ", replacement: " Fire Brigade " }],
    siteProfiles: { "News.Example.com": { providerMode: "deepl", readingMode: "bilingual", automatic: true } }
  });
  assert.deepEqual(settings.approvedHosts, ["example.com"]);
  assert.deepEqual(settings.siteTargetLanguages, { "forum.example.com": "fr" });
  assert.deepEqual(settings.glossary, [{ source: "Bomberos", replacement: "Fire Brigade" }]);
  assert.deepEqual(settings.siteProfiles, { "news.example.com": { providerMode: "deepl", readingMode: "bilingual", automatic: true } });
});

test("requires the current consent version", () => {
  assert.equal(hasCurrentConsent(normalizeLocalState({ privacyConsentVersion: CONSENT_VERSION })), true);
  assert.equal(hasCurrentConsent(normalizeLocalState({ privacyConsentVersion: CONSENT_VERSION - 1 })), false);
});

test("suggests a supported browser UI language", () => {
  assert.equal(suggestedTargetLanguage("fr-CA"), "fr");
  assert.equal(suggestedTargetLanguage("xx-ZZ"), "en");
});

test("records explicit consent for each external provider", () => {
  const state = recordProviderConsents({}, ["google-cloud", "deepl"], "2026-08-05T00:00:00.000Z");
  assert.equal(hasProviderConsent(state, "google-cloud"), true);
  assert.equal(hasProviderConsent(state, "deepl"), true);
  assert.equal(hasProviderConsent(state, "google-web"), false);
  assert.equal(hasProviderConsent(state, "on-device"), true);
});

test("describes every external provider that automatic mode may contact", () => {
  assert.deepEqual(externalProvidersForConfiguration({
    providerMode: "auto",
    allowGoogleWebFallback: true
  }, {
    googleCloudApiKey: "cloud-key",
    libreTranslateEndpoint: "https://translate.example.test/translate",
    deepLApiKey: "deepl-key"
  }), ["google-cloud", "libretranslate", "deepl", "google-web"]);
  assert.deepEqual(externalProvidersForConfiguration({
    providerMode: "on-device",
    siteProfiles: { "example.com": { providerMode: "deepl" } }
  }), ["deepl"]);
});

test("recommends the disclosed Brave fallback only when automatic mode has no working route", () => {
  assert.equal(shouldRecommendGoogleWebFallback({ providerMode: "auto" }, {}, "unsupported"), true);
  assert.equal(shouldRecommendGoogleWebFallback({ providerMode: "auto" }, {}, "unavailable"), true);
  assert.equal(shouldRecommendGoogleWebFallback({ providerMode: "auto" }, {}, "downloadable"), false);
  assert.equal(shouldRecommendGoogleWebFallback({ providerMode: "auto", allowGoogleWebFallback: true }, {}, "unsupported"), false);
  assert.equal(shouldRecommendGoogleWebFallback({ providerMode: "auto" }, { deepLApiKey: "configured" }, "unsupported"), false);
  assert.equal(shouldRecommendGoogleWebFallback({ providerMode: "on-device" }, {}, "unsupported"), false);
});

test("exports and validates credential-free settings backups", () => {
  const backup = createSettingsBackup({ approvedHosts: ["example.com"], glossary: [{ source: "Hola", replacement: "Hello" }], privacyFirewallTerms: ["Project Lantern"] }, "2026-08-05T00:00:00.000Z");
  assert.equal(backup.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal("googleCloudApiKey" in backup.settings, false);
  assert.deepEqual(backup.settings.privacyFirewallTerms, []);
  assert.deepEqual(parseSettingsBackup(JSON.stringify(backup)).approvedHosts, ["example.com"]);
  assert.throws(() => parseSettingsBackup({ format: "other", settings: {} }), /not an Auto Page Translator/i);
});

test("migrates site rules out of synchronized storage without losing preferences", async () => {
  const syncData = {
    targetLanguage: "fr",
    allowGoogleWebFallback: true,
    approvedHosts: ["Example.com"],
    glossary: [{ source: "Hola", replacement: "Hello" }]
  };
  const localData = { privacyConsentVersion: 1 };
  const sessionData = {};
  const area = (data) => ({
    async get() { return { ...data }; },
    async set(values) { Object.assign(data, values); },
    async remove(keys) { for (const key of keys) delete data[key]; }
  });
  globalThis.chrome = { storage: { sync: area(syncData), local: area(localData), session: area(sessionData) } };

  const migrated = await migrateSettingsStorage();
  assert.equal(migrated.targetLanguage, "fr");
  assert.deepEqual(migrated.approvedHosts, ["example.com"]);
  assert.equal("approvedHosts" in syncData, false);
  assert.equal("glossary" in syncData, false);
  assert.deepEqual(localData.approvedHosts, ["example.com"]);
  assert.equal(localData.settingsSchemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.deepEqual((await migrateSettingsStorage()).approvedHosts, ["example.com"]);

  await saveLocalState({ googleCloudApiKey: "temporary-key", rememberProviderCredentials: false });
  assert.equal(sessionData.googleCloudApiKey, "temporary-key");
  assert.equal(localData.googleCloudApiKey, "");
  assert.equal((await loadLocalState()).googleCloudApiKey, "temporary-key");

  await saveLocalState({ deepLApiKey: "remembered-key", rememberProviderCredentials: true });
  assert.equal(sessionData.deepLApiKey, "remembered-key");
  assert.equal(localData.deepLApiKey, "remembered-key");
});
