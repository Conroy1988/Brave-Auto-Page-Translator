import test from "node:test";
import assert from "node:assert/strict";
import {
  clearTranslationCache,
  groupTranslationTexts,
  joinTranslationBatch,
  parseGoogleCloudTranslations,
  parseGoogleTranslation,
  parseLibreTranslations,
  protectTerms,
  splitTranslationBatch,
  translateTexts
} from "../src/provider.js";

function responseFor(value) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    async json() {
      return [[[value, "source"]], null, "es"];
    }
  };
}

test.beforeEach(() => clearTranslationCache());

test("parses provider response formats", () => {
  assert.equal(parseGoogleTranslation([[['Hello ', 'Hola '], ['world', 'mundo']], null, 'es']), "Hello world");
  assert.deepEqual(parseGoogleCloudTranslations({ data: { translations: [{ translatedText: "Hello" }] } }, 1), ["Hello"]);
  assert.deepEqual(parseLibreTranslations({ translatedText: ["Hello", "Goodbye"] }, 2), ["Hello", "Goodbye"]);
});

test("joins and restores ordered translation batches", () => {
  const joined = joinTranslationBatch(["Hola", "Adiós"]);
  assert.deepEqual(splitTranslationBatch(joined, 2), ["Hola", "Adiós"]);
  assert.equal(splitTranslationBatch("markers removed", 2), null);
});

test("groups text without exceeding the item limit", () => {
  assert.deepEqual(groupTranslationTexts(["one", "two", "three"], 1000, 2), [["one", "two"], ["three"]]);
});

test("protects glossary and never-translate terms", () => {
  const protectedValue = protectTerms("Hola TKB and Bomberos", [{ source: "Bomberos", replacement: "Fire Brigade" }], ["TKB"]);
  assert.match(protectedValue.text, /BAPTGLOSSARY/);
  assert.equal(protectedValue.restore(protectedValue.text.replace("Hola", "Hello").replace("and", "and")), "Hello TKB and Fire Brigade");
});

test("translates batches while preserving duplicate positions", async () => {
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    requests += 1;
    const source = new URLSearchParams(options.body).get("q");
    return responseFor(source.replaceAll("Unique one", "Translated one").replaceAll("Unique two", "Translated two"));
  };
  const result = await translateTexts(["Unique one", "Unique two", "Unique one"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "google-web",
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result.translations, ["Translated one", "Translated two", "Translated one"]);
  assert.equal(result.engine, "google-web");
  assert.equal(requests, 1);
});

test("falls back to individual requests when batch markers are changed", async () => {
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    requests += 1;
    const source = new URLSearchParams(options.body).get("q");
    if (source.includes("BAPTSEGMENT")) return responseFor("Batch markers were removed");
    return responseFor(`T:${source}`);
  };
  const result = await translateTexts(["Fallback alpha", "Fallback beta"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "google-web",
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result.translations, ["T:Fallback alpha", "T:Fallback beta"]);
  assert.equal(requests, 3);
});

test("retries a temporary provider rate limit", async () => {
  let requests = 0;
  const fakeFetch = async (_url, options) => {
    requests += 1;
    if (requests === 1) {
      return { ok: false, status: 429, headers: { get: () => "0" }, async json() { return {}; } };
    }
    return responseFor(new URLSearchParams(options.body).get("q").replace("Hola", "Hello"));
  };
  const result = await translateTexts(["Hola"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "google-web",
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result.translations, ["Hello"]);
  assert.equal(requests, 2);
});

test("uses official Google Cloud response batching", async () => {
  const fakeFetch = async (url, options) => {
    assert.match(url, /translation\.googleapis\.com/);
    assert.deepEqual(JSON.parse(options.body).q, ["Hola", "Adiós"]);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return { data: { translations: [{ translatedText: "Hello" }, { translatedText: "Goodbye" }] } };
      }
    };
  };
  const result = await translateTexts(["Hola", "Adiós"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "google-cloud",
    googleCloudApiKey: "test-key",
    allowGoogleWebFallback: false,
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result, { translations: ["Hello", "Goodbye"], engine: "google-cloud" });
});

test("uses a configured LibreTranslate endpoint", async () => {
  const fakeFetch = async (url, options) => {
    assert.equal(url, "https://translate.example.test/translate");
    assert.equal(JSON.parse(options.body).api_key, "local-key");
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() { return { translatedText: ["Hello"] }; }
    };
  };
  const result = await translateTexts(["Hola"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "libretranslate",
    libreTranslateEndpoint: "https://translate.example.test/translate",
    libreTranslateApiKey: "local-key",
    allowGoogleWebFallback: false,
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result, { translations: ["Hello"], engine: "libretranslate" });
});

test("rejects provider credentials embedded in a custom endpoint URL", async () => {
  await assert.rejects(() => translateTexts(["Hola"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "libretranslate",
    libreTranslateEndpoint: "https://user:secret@translate.example.test/translate",
    allowGoogleWebFallback: false,
    fetchImpl: async () => { throw new Error("fetch should not run"); }
  }), (error) => error.code === "unsafe-endpoint");
});

test("falls back when on-device translation is unavailable", async () => {
  const fakeFetch = async (_url, options) => responseFor(new URLSearchParams(options.body).get("q").replace("Hola", "Hello"));
  const result = await translateTexts(["Hola"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "on-device",
    allowGoogleWebFallback: true,
    onDeviceTranslate: async () => { throw new Error("not supported"); },
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result, { translations: ["Hello"], engine: "google-web" });
});

test("cancels a translation before a request starts", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => translateTexts(["Hola"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "google-web",
    signal: controller.signal,
    fetchImpl: async () => responseFor("Hello")
  }), /cancelled/i);
});
