import test from "node:test";
import assert from "node:assert/strict";
import {
  baseLanguage,
  buildTranslationUrl,
  hostMatchesRule,
  hostnameFromUrl,
  isSupportedPageUrl,
  isTranslationHost,
  normalizeLanguageCode,
  shouldTranslateLanguage
} from "../src/translation.js";

test("normalizes browser language codes", () => {
  assert.equal(normalizeLanguageCode("ZH_CN"), "zh-cn");
  assert.equal(baseLanguage("pt-BR"), "pt");
});

test("accepts public pages and rejects internal or translation pages", () => {
  assert.equal(isSupportedPageUrl("https://example.com/story"), true);
  assert.equal(isSupportedPageUrl("chrome://extensions"), false);
  assert.equal(isSupportedPageUrl("https://translate.google.com/translate?u=x"), false);
  assert.equal(isSupportedPageUrl("https://es-wikipedia-org.translate.goog/wiki/Madrid"), false);
  assert.equal(isSupportedPageUrl("https://translate.goog/"), false);
  assert.equal(isSupportedPageUrl("https://translate.goog.example.com/story"), true);
});

test("recognizes Google Translate entry and proxy hosts", () => {
  assert.equal(isTranslationHost("translate.google.com"), true);
  assert.equal(isTranslationHost("es-wikipedia-org.translate.goog"), true);
  assert.equal(isTranslationHost("translate.goog.example.com"), false);
});

test("matches a hostname and all of its subdomains", () => {
  assert.equal(hostMatchesRule("news.example.com", "example.com"), true);
  assert.equal(hostMatchesRule("notexample.com", "example.com"), false);
  assert.equal(hostnameFromUrl("https://www.Example.com/path"), "example.com");
});

test("skips the target and explicitly excluded languages", () => {
  const settings = { targetLanguage: "en", excludedLanguages: ["fr"] };
  assert.equal(shouldTranslateLanguage("de", settings), true);
  assert.equal(shouldTranslateLanguage("en-GB", settings), false);
  assert.equal(shouldTranslateLanguage("fr-CA", settings), false);
  assert.equal(shouldTranslateLanguage("und", settings), false);
});

test("builds an encoded Google Translate page URL", () => {
  const result = new URL(buildTranslationUrl("https://example.com/a?x=1&y=2", "en", "de"));
  assert.equal(result.origin, "https://translate.google.com");
  assert.equal(result.searchParams.get("sl"), "de");
  assert.equal(result.searchParams.get("tl"), "en");
  assert.equal(result.searchParams.get("u"), "https://example.com/a?x=1&y=2");
});
