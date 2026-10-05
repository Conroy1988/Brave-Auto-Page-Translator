import test from "node:test";
import assert from "node:assert/strict";
import { runControl, providerReadiness, providerRoutes, requireResponse } from "../src/ui.js";
import { CONSENT_VERSION, DEFAULT_LOCAL_STATE, DEFAULT_SETTINGS, normalizeSettings, createSettingsBackup, parseSettingsBackup } from "../src/settings.js";

const approved = { ...DEFAULT_LOCAL_STATE, privacyConsentVersion: CONSENT_VERSION, privacyConsentAt: "2026-10-05", providerConsents: { "google-web": "2026-10-05" } };
function mockChrome({ permissions = true, availability = "unsupported" } = {}) {
  const messages = [];
  globalThis.chrome = {
    i18n: { getMessage: (key) => key },
    permissions: { contains: async () => permissions, request: () => { throw new Error("Readiness must never request access"); } },
    runtime: { sendMessage: async (value) => { messages.push(value); return { availability }; } }
  };
  return messages;
}
test("a rejected control operation restores the button and reports the error once", async () => {
  const attrs = new Map(), errors = [];
  const button = { disabled: false, setAttribute: (k,v) => attrs.set(k,v), removeAttribute: (k) => attrs.delete(k) };
  await runControl(button, async () => { assert.equal(button.disabled, true); throw new Error("Connection lost"); }, (error) => errors.push(error.message));
  assert.equal(button.disabled, false); assert.equal(attrs.size, 0); assert.deepEqual(errors, ["Connection lost"]);
});
test("a disabled control cannot start a second operation", async () => {
  let calls = 0; await runControl({ disabled: true }, () => calls++); assert.equal(calls, 0);
});
test("unavailable on-device translation explains setup without sending any text", async () => {
  const messages = mockChrome();
  const result = await providerReadiness(DEFAULT_SETTINGS, approved, "example.com", "es", "en");
  assert.equal(result.action, "settings");
  assert.deepEqual(messages, [{ type: "get-on-device-availability", sourceLanguage: "es", targetLanguage: "en" }]);
});
test("provider readiness distinguishes consent, permission and an approved route", async () => {
  mockChrome();
  assert.equal((await providerReadiness(DEFAULT_SETTINGS, DEFAULT_LOCAL_STATE, "", "es", "en")).action, "setup");
  const settings = { ...DEFAULT_SETTINGS, allowGoogleWebFallback: true };
  mockChrome({ permissions: false });
  assert.equal((await providerReadiness(settings, approved, "", "es", "en")).action, "permission");
  mockChrome();
  assert.equal((await providerReadiness(settings, approved, "", "es", "en")).action, "");
});
test("site provider readiness honours the site's provider and its own consent", () => {
  const settings = { ...DEFAULT_SETTINGS, siteProfiles: { "example.com": { providerMode: "deepl" } } };
  assert.deepEqual(providerRoutes(settings, { ...approved, deepLApiKey: "test-key" }, "example.com"), [{ provider: "deepl", consented: false, configured: true, origins: ["https://api-free.deepl.com/*"] }]);
});
test("favourites survive backup and normalization without dropping existing preferences", () => {
  const values = { ...DEFAULT_SETTINGS, targetLanguage: "fr", favouriteLanguages: ["de", "fr", "de", "invalid"], siteProfiles: { "example.com": { targetLanguage: "ja" } }, glossary: [{ source: "Keep", replacement: "Preserve" }] };
  const normalized = normalizeSettings(values); assert.deepEqual(normalized.favouriteLanguages, ["de", "fr"]);
  const restored = parseSettingsBackup(JSON.stringify(createSettingsBackup(values)));
  assert.deepEqual(restored, normalized);
  assert.deepEqual(normalizeSettings({ ...values, favouriteLanguages: undefined }).glossary, values.glossary);
});
test("extension error responses are surfaced rather than treated as successful results", () => {
  mockChrome(); assert.throws(() => requireResponse({ status: "error", message: "worker restarted" }), /worker restarted/);
});
