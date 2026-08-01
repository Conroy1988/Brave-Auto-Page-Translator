import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_VERSION,
  hasCurrentConsent,
  normalizeLocalState,
  normalizeSettings,
  suggestedTargetLanguage
} from "../src/settings.js";

test("defaults to manual translation with sensitive safeguards", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.behaviourMode, "manual");
  assert.equal(settings.translateAttributes, false);
  assert.equal(settings.sensitivePageMode, "manual");
});

test("normalizes rules, targets and glossary entries", () => {
  const settings = normalizeSettings({
    approvedHosts: ["https://www.Example.com/path", "example.com"],
    siteTargetLanguages: { "Forum.Example.com": "fr" },
    glossary: [{ source: " Bomberos ", replacement: " Fire Brigade " }]
  });
  assert.deepEqual(settings.approvedHosts, ["example.com"]);
  assert.deepEqual(settings.siteTargetLanguages, { "forum.example.com": "fr" });
  assert.deepEqual(settings.glossary, [{ source: "Bomberos", replacement: "Fire Brigade" }]);
});

test("requires the current consent version", () => {
  assert.equal(hasCurrentConsent(normalizeLocalState({ privacyConsentVersion: CONSENT_VERSION })), true);
  assert.equal(hasCurrentConsent(normalizeLocalState({ privacyConsentVersion: CONSENT_VERSION - 1 })), false);
});

test("suggests a supported browser UI language", () => {
  assert.equal(suggestedTargetLanguage("fr-CA"), "fr");
  assert.equal(suggestedTargetLanguage("xx-ZZ"), "en");
});
