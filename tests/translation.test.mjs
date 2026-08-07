import test from "node:test";
import assert from "node:assert/strict";
import {
  baseLanguage,
  hostMatchesRule,
  hostPermissionPatterns,
  hostnameFromUrl,
  isAutomaticHostAllowed,
  isRtlLanguage,
  isSupportedPageUrl,
  isTranslationHost,
  normalizeLanguageCode,
  originPatternFromUrl,
  providerPermissionPatterns,
  providerModeForHost,
  readingModeForHost,
  resolvePageLanguage,
  shouldTranslateLanguage,
  targetLanguageForHost
} from "../src/translation.js";

test("normalizes browser language codes", () => {
  assert.equal(normalizeLanguageCode("ZH_CN"), "zh-cn");
  assert.equal(normalizeLanguageCode("zh-Hant"), "zh-tw");
  assert.equal(baseLanguage("pt-BR"), "pt");
});

test("accepts public pages and rejects internal or translation pages", () => {
  assert.equal(isSupportedPageUrl("https://example.com/story"), true);
  assert.equal(isSupportedPageUrl("chrome://extensions"), false);
  assert.equal(isSupportedPageUrl("https://translate.google.com/translate?u=x"), false);
  assert.equal(isSupportedPageUrl("https://es-wikipedia-org.translate.goog/wiki/Madrid"), false);
  assert.equal(isSupportedPageUrl("https://translate.goog.example.com/story"), true);
});

test("recognizes Google Translate entry and proxy hosts", () => {
  assert.equal(isTranslationHost("translate.google.com"), true);
  assert.equal(isTranslationHost("es-wikipedia-org.translate.goog"), true);
  assert.equal(isTranslationHost("translate.goog.example.com"), false);
});

test("matches host rules and builds narrow permissions", () => {
  assert.equal(hostMatchesRule("news.example.com", "example.com"), true);
  assert.equal(hostMatchesRule("notexample.com", "example.com"), false);
  assert.equal(hostnameFromUrl("https://www.Example.com/path"), "example.com");
  assert.equal(originPatternFromUrl("https://example.com/path"), "https://example.com/*");
  assert.deepEqual(hostPermissionPatterns("example.com"), [
    "http://example.com/*", "https://example.com/*", "http://*.example.com/*", "https://*.example.com/*"
  ]);
});

test("keeps translation-provider hosts behind optional permission prompts", () => {
  assert.deepEqual(providerPermissionPatterns("on-device", { allowGoogleWebFallback: false }), []);
  assert.deepEqual(providerPermissionPatterns("google-cloud", { allowGoogleWebFallback: false }), ["https://translation.googleapis.com/*"]);
  assert.deepEqual(providerPermissionPatterns("auto", { allowGoogleWebFallback: true }), [
    "https://translate.googleapis.com/*", "https://translate.google.com/*"
  ]);
});

test("skips the target and explicitly excluded languages", () => {
  const settings = { targetLanguage: "en", excludedLanguages: ["fr"] };
  assert.equal(shouldTranslateLanguage("de", settings), true);
  assert.equal(shouldTranslateLanguage("en-GB", settings), false);
  assert.equal(shouldTranslateLanguage("fr-CA", settings), false);
  assert.equal(shouldTranslateLanguage("und", settings), false);
});

test("combines browser and declared page language", () => {
  assert.deepEqual(resolvePageLanguage("es", "es-ES"), { language: "es", mismatch: false });
  assert.deepEqual(resolvePageLanguage("es", "fr"), { language: "auto", mismatch: true });
  assert.deepEqual(resolvePageLanguage("und", "de"), { language: "de", mismatch: false });
});

test("applies behaviour and per-site target rules", () => {
  const settings = {
    enabled: true,
    behaviourMode: "approved-sites",
    approvedHosts: ["example.com"],
    excludedHosts: [],
    targetLanguage: "en",
    siteTargetLanguages: { "forum.example.com": "fr" },
    siteProfiles: { "news.example.com": { targetLanguage: "de", providerMode: "deepl", readingMode: "bilingual", automatic: true } },
    readingMode: "translated",
    providerMode: "auto"
  };
  assert.equal(isAutomaticHostAllowed("news.example.com", settings), true);
  assert.equal(isAutomaticHostAllowed("elsewhere.test", settings), false);
  assert.equal(targetLanguageForHost("forum.example.com", settings), "fr");
  assert.equal(targetLanguageForHost("news.example.com", settings), "de");
  assert.equal(providerModeForHost("news.example.com", settings), "deepl");
  assert.equal(readingModeForHost("news.example.com", settings), "bilingual");
  assert.equal(isRtlLanguage("ar-SA"), true);
});
