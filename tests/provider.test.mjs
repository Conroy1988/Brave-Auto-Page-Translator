import test from "node:test";
import assert from "node:assert/strict";
import {
  clearTranslationCache,
  groupTranslationTexts,
  joinTranslationBatch,
  parseDeepLTranslations,
  parseGoogleCloudTranslations,
  parseGoogleTranslation,
  parseLibreTranslations,
  protectTerms,
  protectSensitivePatterns,
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
  assert.deepEqual(parseDeepLTranslations({ translations: [{ text: "Hello" }, { text: "Goodbye" }] }, 2), ["Hello", "Goodbye"]);
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

test("masks private patterns and fails closed if a provider damages a token", () => {
  const value = protectSensitivePatterns("Email dan@example.com, call +44 7700 900123, ref CASE-2026-9911.");
  assert.equal(value.maskedCount, 3);
  assert.deepEqual(new Set(value.maskedKinds), new Set(["email", "phone", "reference"]));
  assert.equal(value.restore(value.text), "Email dan@example.com, call +44 7700 900123, ref CASE-2026-9911.");
  assert.throws(() => value.restore("Provider removed every token"), (error) => error.code === "privacy-token-integrity");
  assert.throws(() => value.restore(`${value.text} ${value.text}`), (error) => error.code === "privacy-token-integrity");
});

test("keeps private values untouched for the on-device route", async () => {
  const result = await translateTexts(["Email dan@example.com"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "on-device",
    includePrivacyMetrics: true,
    onDeviceTranslate: async (texts) => texts.map((text) => text.replace("Email", "Email"))
  });
  assert.equal(result.privacy.route, "on-device");
  assert.equal(result.privacy.maskedValues, 0);
  assert.equal(result.translations[0], "Email dan@example.com");
});

test("masks private values only before an external provider request", async () => {
  let providerText = "";
  const result = await translateTexts(["Email dan@example.com on 2026-08-07 for £1,240.00"], {
    sourceLanguage: "en",
    targetLanguage: "fr",
    providerMode: "libretranslate",
    libreTranslateEndpoint: "https://translate.example.test/translate",
    includePrivacyMetrics: true,
    fetchImpl: async (_url, options) => {
      providerText = JSON.parse(options.body).q[0];
      return { ok: true, status: 200, headers: { get: () => null }, async json() { return { translatedText: [providerText] }; } };
    }
  });
  assert.doesNotMatch(providerText, /dan@example\.com|2026-08-07|£1,240\.00/);
  assert.equal(result.privacy.route, "external");
  assert.equal(result.privacy.maskedValues, 3);
  assert.deepEqual(new Set(result.privacy.maskedKinds), new Set(["email", "date", "currency"]));
  assert.equal(result.translations[0], "Email dan@example.com on 2026-08-07 for £1,240.00");
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

test("uses the official DeepL API without exposing the key in the URL", async () => {
  const fakeFetch = async (url, options) => {
    assert.equal(url, "https://api-free.deepl.com/v2/translate");
    assert.equal(options.headers.authorization, "DeepL-Auth-Key local-deepl-key");
    assert.doesNotMatch(url, /local-deepl-key/);
    const body = new URLSearchParams(options.body);
    assert.deepEqual(body.getAll("text"), ["Hola", "Adiós"]);
    assert.equal(body.get("target_lang"), "EN-GB");
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() { return { translations: [{ text: "Hello" }, { text: "Goodbye" }] }; }
    };
  };
  const result = await translateTexts(["Hola", "Adiós"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "deepl",
    deepLApiKey: "local-deepl-key",
    deepLApiPlan: "free",
    allowGoogleWebFallback: false,
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result, { translations: ["Hello", "Goodbye"], engine: "deepl" });
});

test("blocks an external provider until its provider-specific disclosure is accepted", async () => {
  await assert.rejects(() => translateTexts(["Hola"], {
    sourceLanguage: "es",
    targetLanguage: "en",
    providerMode: "google-web",
    allowedExternalProviders: [],
    fetchImpl: async () => responseFor("Hello")
  }), (error) => error.code === "provider-consent-required");
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

test("automatic mode falls through a failed official provider to an approved custom provider", async () => {
  const fakeFetch = async (url) => {
    if (new URL(url).hostname === "translation.googleapis.com") {
      return {
        ok: false,
        status: 401,
        headers: { get: () => null },
        async json() { return { error: { message: "invalid test key" } }; }
      };
    }
    assert.equal(url, "https://translate.example.test/translate");
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
    providerMode: "auto",
    googleCloudApiKey: "invalid-test-key",
    libreTranslateEndpoint: "https://translate.example.test/translate",
    allowedExternalProviders: ["google-cloud", "libretranslate"],
    onDeviceTranslate: async () => { throw new Error("not supported"); },
    fetchImpl: fakeFetch
  });
  assert.deepEqual(result, { translations: ["Hello"], engine: "libretranslate" });
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
