const GOOGLE_WEB_ENDPOINTS = Object.freeze([
  "https://translate.googleapis.com/translate_a/single",
  "https://translate.google.com/translate_a/single"
]);
const GOOGLE_CLOUD_ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const DEEPL_ENDPOINTS = Object.freeze({
  free: "https://api-free.deepl.com/v2/translate",
  pro: "https://api.deepl.com/v2/translate"
});
const EXTERNAL_ENGINES = new Set(["google-cloud", "libretranslate", "deepl", "google-web"]);
const CACHE_LIMIT = 2500;
const MAX_BATCH_CHARACTERS = 2800;
const MAX_BATCH_ITEMS = 32;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_RETRIES = 2;
const CIRCUIT_FAILURE_LIMIT = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;
const translationCache = new Map();
const circuitState = new Map();
let activeRequests = 0;
const requestWaiters = [];

const PRIVACY_PATTERNS = Object.freeze([
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu],
  ["url", /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu],
  ["ipv4", /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/gu],
  ["currency", /(?<!\w)(?:£|€|\$|¥)\s?\d[\d,.]*(?:\s?(?:GBP|EUR|USD|JPY))?\b|\b\d[\d,.]*\s?(?:GBP|EUR|USD|JPY)\b/giu],
  ["date", /\b(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{2}|\d{4})|\d{4}-\d{2}-\d{2})\b/gu],
  ["reference", /\b(?=[A-Z0-9-]{8,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)+\b/giu],
  ["phone", /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/gu]
]);

export class TranslationProviderError extends Error {
  constructor(message, { code = "provider-error", retryable = false, status = 0 } = {}) {
    super(message);
    this.name = "TranslationProviderError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Translation was cancelled.", "AbortError"));
    }, { once: true });
  });
}

async function withRequestSlot(operation, signal) {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      requestWaiters.push(waiter);
      signal?.addEventListener("abort", () => {
        const index = requestWaiters.indexOf(waiter);
        if (index >= 0) requestWaiters.splice(index, 1);
        reject(new DOMException("Translation was cancelled.", "AbortError"));
      }, { once: true });
    });
  }
  if (signal?.aborted) throw new DOMException("Translation was cancelled.", "AbortError");
  activeRequests += 1;
  try {
    return await operation();
  } finally {
    activeRequests -= 1;
    requestWaiters.shift()?.resolve();
  }
}

function retryAfterMilliseconds(response, attempt) {
  const header = response.headers?.get?.("retry-after");
  if (header && /^\d+$/.test(header)) return Math.min(Number(header) * 1000, 10_000);
  return Math.min(500 * (2 ** attempt), 4_000);
}

function circuitFor(url) {
  const origin = new URL(url).origin;
  const value = circuitState.get(origin) || { failures: 0, openUntil: 0 };
  if (value.openUntil && value.openUntil <= Date.now()) {
    value.failures = 0;
    value.openUntil = 0;
  }
  circuitState.set(origin, value);
  return value;
}

async function requestJson(url, init, { fetchImpl = fetch, signal, timeoutMs = 15_000 } = {}) {
  const circuit = circuitFor(url);
  if (circuit.openUntil > Date.now()) {
    throw new TranslationProviderError("Translation provider is temporarily unavailable. Try again shortly.", { code: "circuit-open", retryable: true });
  }

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Translation was cancelled.", "AbortError");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await withRequestSlot(() => fetchImpl(url, { ...init, signal: controller.signal }), signal);
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const error = new TranslationProviderError(
          response.status === 429 ? "Translation provider rate limit reached." : `Translation provider responded with HTTP ${response.status}.`,
          { code: response.status === 429 ? "rate-limited" : "http-error", retryable, status: response.status }
        );
        if (!retryable || attempt === MAX_RETRIES) throw error;
        await delay(retryAfterMilliseconds(response, attempt), signal);
        continue;
      }
      const payload = await response.json();
      circuit.failures = 0;
      circuit.openUntil = 0;
      return payload;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new TranslationProviderError(signal?.aborted ? "Translation was cancelled." : "Translation provider timed out.", { code: signal?.aborted ? "cancelled" : "timeout", retryable: !signal?.aborted })
        : error instanceof TranslationProviderError
          ? error
          : new TranslationProviderError("Translation provider could not be reached. Check its website permission and your connection.", { code: "network-error", retryable: true });
      const retryable = lastError?.retryable !== false;
      if (!retryable || attempt === MAX_RETRIES || signal?.aborted) break;
      await delay(500 * (2 ** attempt), signal);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_LIMIT) circuit.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  throw lastError instanceof Error ? lastError : new TranslationProviderError("Translation provider is unavailable.");
}

export function parseGoogleTranslation(payload) {
  if (!Array.isArray(payload?.[0])) throw new TranslationProviderError("Translation provider returned an unexpected response.", { code: "invalid-response" });
  const translated = payload[0]
    .map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")
    .join("");
  if (!translated) throw new TranslationProviderError("Translation provider returned no translated text.", { code: "empty-response" });
  return translated;
}

export function parseGoogleCloudTranslations(payload, expectedCount) {
  const values = payload?.data?.translations;
  if (!Array.isArray(values) || values.length !== expectedCount) {
    throw new TranslationProviderError("Google Cloud returned an incomplete translation.", { code: "invalid-response" });
  }
  return values.map((item) => String(item?.translatedText || ""));
}

export function parseLibreTranslations(payload, expectedCount) {
  const value = payload?.translatedText;
  const values = Array.isArray(value) ? value : [value];
  if (values.length !== expectedCount || values.some((item) => typeof item !== "string" || !item)) {
    throw new TranslationProviderError("LibreTranslate returned an incomplete translation.", { code: "invalid-response" });
  }
  return values;
}

export function parseDeepLTranslations(payload, expectedCount) {
  const values = payload?.translations;
  if (!Array.isArray(values) || values.length !== expectedCount) {
    throw new TranslationProviderError("DeepL returned an incomplete translation.", { code: "invalid-response" });
  }
  const translations = values.map((item) => String(item?.text || ""));
  if (translations.some((item) => !item)) {
    throw new TranslationProviderError("DeepL returned an empty translation.", { code: "invalid-response" });
  }
  return translations;
}

function marker(index) {
  return `BAPTSEGMENT${String(index).padStart(4, "0")}BAPT`;
}

export function joinTranslationBatch(texts) {
  return texts.map((value, index) => `${marker(index)}\n${value}`).join("\n");
}

export function splitTranslationBatch(value, expectedCount) {
  const markerPattern = /BAPT\s*SEGMENT\s*(\d{4})\s*BAPT/gi;
  const matches = [...String(value).matchAll(markerPattern)];
  if (matches.length !== expectedCount) return null;
  const output = Array(expectedCount).fill("");
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const itemIndex = Number(current[1]);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= expectedCount) return null;
    output[itemIndex] = String(value).slice(current.index + current[0].length, next?.index ?? String(value).length).trim();
  }
  return output.every(Boolean) ? output : null;
}

export function groupTranslationTexts(texts, maxCharacters = MAX_BATCH_CHARACTERS, maxItems = MAX_BATCH_ITEMS) {
  const groups = [];
  let current = [];
  let currentLength = 0;
  for (const text of texts) {
    const value = String(text);
    const projectedLength = currentLength + value.length + marker(current.length).length + 2;
    if (current.length && (projectedLength > maxCharacters || current.length >= maxItems)) {
      groups.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(value);
    currentLength += value.length + marker(current.length - 1).length + 2;
  }
  if (current.length) groups.push(current);
  return groups;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function protectTerms(text, glossary = [], neverTranslateTerms = []) {
  const terms = [
    ...neverTranslateTerms.map((source) => ({ source, replacement: source })),
    ...glossary
  ].filter((entry) => entry?.source && entry?.replacement)
    .sort((a, b) => b.source.length - a.source.length);
  const replacements = [];
  let protectedText = String(text);
  terms.forEach((entry) => {
    const token = `BAPTGLOSSARY${String(replacements.length).padStart(4, "0")}BAPT`;
    const pattern = new RegExp(escapeRegExp(String(entry.source)), "giu");
    if (!pattern.test(protectedText)) return;
    pattern.lastIndex = 0;
    protectedText = protectedText.replace(pattern, token);
    replacements.push({ token, replacement: String(entry.replacement) });
  });
  return {
    text: protectedText,
    restore(value) {
      let restored = String(value);
      replacements.forEach(({ token, replacement }) => {
        const index = token.match(/BAPTGLOSSARY(\d{4})BAPT/)?.[1] || "";
        const flexible = new RegExp(`BAPT\\s*GLOSSARY\\s*${index}\\s*BAPT`, "gi");
        restored = restored.replace(flexible, replacement);
      });
      return restored;
    }
  };
}

export function protectSensitivePatterns(text, customTerms = []) {
  const replacements = [];
  let protectedText = String(text);
  const patterns = [
    ...[...new Set((customTerms || []).map((value) => String(value || "").trim()).filter(Boolean))]
      .sort((a, b) => b.length - a.length)
      .map((value) => ["custom", new RegExp(escapeRegExp(value), "giu")]),
    ...PRIVACY_PATTERNS
  ];
  for (const [kind, pattern] of patterns) {
    protectedText = protectedText.replace(pattern, (value) => {
      const token = `BAPTPRIVATE${String(replacements.length).padStart(4, "0")}BAPT`;
      replacements.push({ token, value, kind });
      return token;
    });
  }
  return {
    text: protectedText,
    maskedCount: replacements.length,
    maskedKinds: [...new Set(replacements.map(({ kind }) => kind))],
    restore(value) {
      let restored = String(value);
      for (const { token, value: original } of replacements) {
        const index = token.match(/BAPTPRIVATE(\d{4})BAPT/)?.[1] || "";
        const flexible = new RegExp(`BAPT\\s*PRIVATE\\s*${index}\\s*BAPT`, "gi");
        const occurrences = restored.match(flexible)?.length || 0;
        if (occurrences !== 1) {
          throw new TranslationProviderError("A protected value was changed by the translation provider, so the original text was kept.", {
            code: "privacy-token-integrity",
            retryable: false
          });
        }
        flexible.lastIndex = 0;
        restored = restored.replace(flexible, original);
      }
      if (/BAPT\s*PRIVATE\s*\d{4}\s*BAPT/i.test(restored)) {
        throw new TranslationProviderError("A protected value was changed by the translation provider, so the original text was kept.", {
          code: "privacy-token-integrity",
          retryable: false
        });
      }
      return restored;
    }
  };
}

function cacheKey(text, sourceLanguage, targetLanguage, engine, terminologyKey) {
  return `${engine}\u0000${sourceLanguage || "auto"}\u0000${targetLanguage}\u0000${terminologyKey}\u0000${text}`;
}

function remember(key, value) {
  if (translationCache.size >= CACHE_LIMIT) translationCache.delete(translationCache.keys().next().value);
  translationCache.set(key, value);
}

export function clearTranslationCache() {
  translationCache.clear();
  circuitState.clear();
}

async function googleWebRequest(text, sourceLanguage, targetLanguage, options) {
  let lastError;
  for (const endpoint of GOOGLE_WEB_ENDPOINTS) {
    try {
      const parameters = new URLSearchParams({
        client: "gtx",
        sl: sourceLanguage || "auto",
        tl: targetLanguage,
        dt: "t",
        q: text
      });
      return parseGoogleTranslation(await requestJson(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: parameters.toString(),
        credentials: "omit",
        cache: "no-store"
      }, options));
    } catch (error) {
      lastError = error;
      if (error?.code === "cancelled") break;
    }
  }
  throw lastError || new TranslationProviderError("Google web translation is unavailable.");
}

async function translateGoogleWeb(texts, sourceLanguage, targetLanguage, options) {
  const output = [];
  for (const group of groupTranslationTexts(texts)) {
    if (group.length === 1) {
      output.push(await googleWebRequest(group[0], sourceLanguage, targetLanguage, options));
      continue;
    }
    const translatedBatch = await googleWebRequest(joinTranslationBatch(group), sourceLanguage, targetLanguage, options);
    const split = splitTranslationBatch(translatedBatch, group.length);
    if (split) output.push(...split);
    else {
      for (const text of group) output.push(await googleWebRequest(text, sourceLanguage, targetLanguage, options));
    }
  }
  return output;
}

async function translateGoogleCloud(texts, sourceLanguage, targetLanguage, apiKey, options) {
  if (!apiKey) throw new TranslationProviderError("A Google Cloud Translation API key is required.", { code: "missing-credential", retryable: false });
  const url = `${GOOGLE_CLOUD_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = { q: texts, target: targetLanguage, format: "text" };
  if (sourceLanguage && sourceLanguage !== "auto") body.source = sourceLanguage;
  const payload = await requestJson(url, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify(body),
    credentials: "omit",
    cache: "no-store"
  }, options);
  return parseGoogleCloudTranslations(payload, texts.length);
}

async function translateLibre(texts, sourceLanguage, targetLanguage, endpoint, apiKey, options) {
  if (!endpoint) throw new TranslationProviderError("A LibreTranslate endpoint is required.", { code: "missing-endpoint", retryable: false });
  const url = new URL(endpoint);
  if (url.username || url.password) {
    throw new TranslationProviderError("LibreTranslate endpoint URLs cannot contain credentials.", { code: "unsafe-endpoint", retryable: false });
  }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new TranslationProviderError("LibreTranslate must use HTTPS, except for a local server.", { code: "insecure-endpoint", retryable: false });
  }
  const body = { q: texts, source: sourceLanguage || "auto", target: targetLanguage, format: "text" };
  if (apiKey) body.api_key = apiKey;
  const payload = await requestJson(url.href, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: JSON.stringify(body),
    credentials: "omit",
    cache: "no-store"
  }, options);
  return parseLibreTranslations(payload, texts.length);
}

function deepLLanguage(code, { target = false } = {}) {
  const normalized = String(code || "").replace("_", "-").toUpperCase();
  if (!normalized || normalized === "AUTO") return "";
  if (target && normalized === "EN") return "EN-GB";
  if (target && normalized === "PT") return "PT-PT";
  if (normalized === "ZH-CN" || normalized === "ZH-TW") return "ZH";
  return normalized.split("-")[0];
}

async function translateDeepL(texts, sourceLanguage, targetLanguage, apiKey, apiPlan, options) {
  if (!apiKey) throw new TranslationProviderError("A DeepL API key is required.", { code: "missing-credential", retryable: false });
  const endpoint = DEEPL_ENDPOINTS[apiPlan === "pro" ? "pro" : "free"];
  const body = new URLSearchParams();
  for (const text of texts) body.append("text", text);
  body.set("target_lang", deepLLanguage(targetLanguage, { target: true }));
  const source = deepLLanguage(sourceLanguage);
  if (source) body.set("source_lang", source);
  if (["prefer_more", "prefer_less"].includes(options.formality)) body.set("formality", options.formality);
  const payload = await requestJson(endpoint, {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${apiKey}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: body.toString(),
    credentials: "omit",
    cache: "no-store"
  }, options);
  return parseDeepLTranslations(payload, texts.length);
}

function providerCandidates(config) {
  const requested = config.providerMode || "auto";
  const allowedExternal = config.allowedExternalProviders
    ? new Set(config.allowedExternalProviders)
    : EXTERNAL_ENGINES;
  if (EXTERNAL_ENGINES.has(requested) && !allowedExternal.has(requested)) {
    throw new TranslationProviderError("Confirm this provider's page-text disclosure in Settings before using it.", { code: "provider-consent-required", retryable: false });
  }
  if (requested !== "auto") {
    return [
      requested,
      ...(config.allowGoogleWebFallback && requested !== "google-web" && allowedExternal.has("google-web") ? ["google-web"] : [])
    ];
  }
  return [
    "on-device",
    ...(config.googleCloudApiKey && allowedExternal.has("google-cloud") ? ["google-cloud"] : []),
    ...(config.libreTranslateEndpoint && allowedExternal.has("libretranslate") ? ["libretranslate"] : []),
    ...(config.deepLApiKey && allowedExternal.has("deepl") ? ["deepl"] : []),
    ...(config.allowGoogleWebFallback && allowedExternal.has("google-web") ? ["google-web"] : [])
  ];
}

async function runProvider(engine, texts, config) {
  const common = { fetchImpl: config.fetchImpl || fetch, signal: config.signal, formality: config.formality };
  if (engine === "on-device") {
    if (typeof config.onDeviceTranslate !== "function") throw new TranslationProviderError("On-device translation is not available in this browser.", { code: "provider-unavailable", retryable: false });
    return config.onDeviceTranslate(texts, config.sourceLanguage, config.targetLanguage, config.signal);
  }
  if (engine === "google-cloud") return translateGoogleCloud(texts, config.sourceLanguage, config.targetLanguage, config.googleCloudApiKey, common);
  if (engine === "libretranslate") return translateLibre(texts, config.sourceLanguage, config.targetLanguage, config.libreTranslateEndpoint, config.libreTranslateApiKey, common);
  if (engine === "deepl") return translateDeepL(texts, config.sourceLanguage, config.targetLanguage, config.deepLApiKey, config.deepLApiPlan, common);
  if (engine === "google-web") return translateGoogleWeb(texts, config.sourceLanguage, config.targetLanguage, common);
  throw new TranslationProviderError(`Unknown translation provider: ${engine}`, { code: "invalid-provider", retryable: false });
}

export async function translateTexts(texts, config = {}) {
  if (!Array.isArray(texts) || !texts.length) return { translations: [], engine: "" };
  if (texts.length > 160) throw new TranslationProviderError("Too many text sections were requested at once.", { code: "request-too-large", retryable: false });
  const sourceLanguage = String(config.sourceLanguage || "auto").toLowerCase();
  const targetLanguage = String(config.targetLanguage || "").toLowerCase();
  if (!targetLanguage) throw new TranslationProviderError("A target language is required.", { code: "missing-target", retryable: false });

  const validatedTexts = texts.map((text) => {
    const value = String(text).trim();
    if (!value || value.length > 5000) throw new TranslationProviderError("A text section is empty or too large to translate safely.", { code: "invalid-section", retryable: false });
    return value;
  });
  let lastError;

  for (const engine of providerCandidates(config)) {
    try {
      const protectedValues = validatedTexts.map((value) => {
        const privacy = engine === "on-device" || config.privacyFirewall === false
          ? { text: value, maskedCount: 0, maskedKinds: [], restore: (translated) => String(translated) }
          : protectSensitivePatterns(value, config.privacyFirewallTerms);
        const terminology = protectTerms(privacy.text, config.glossary, config.neverTranslateTerms);
        return {
          text: terminology.text,
          maskedCount: privacy.maskedCount,
          maskedKinds: privacy.maskedKinds,
          restore(translated) {
            return privacy.restore(terminology.restore(translated));
          }
        };
      });
      const terminologyKey = JSON.stringify([
        config.glossary || [],
        config.neverTranslateTerms || [],
        engine === "on-device" ? "on-device" : [config.privacyFirewall !== false, config.privacyFirewallTerms || []]
      ]);
      const output = Array(texts.length);
      const missing = [];
      const positions = new Map();
      protectedValues.forEach((item, index) => {
        const key = cacheKey(item.text, sourceLanguage, targetLanguage, engine, terminologyKey);
        if (translationCache.has(key)) {
          output[index] = item.restore(translationCache.get(key));
          return;
        }
        if (!positions.has(item.text)) {
          positions.set(item.text, []);
          missing.push(item.text);
        }
        positions.get(item.text).push(index);
      });

      if (missing.length) {
        const translated = await runProvider(engine, missing, { ...config, sourceLanguage, targetLanguage });
        if (!Array.isArray(translated) || translated.length !== missing.length) throw new TranslationProviderError("Translation provider returned an incomplete page.", { code: "invalid-response" });
        translated.forEach((value, translatedIndex) => {
          const source = missing[translatedIndex];
          const key = cacheKey(source, sourceLanguage, targetLanguage, engine, terminologyKey);
          remember(key, value);
          for (const position of positions.get(source) || []) output[position] = protectedValues[position].restore(value);
        });
      }
      const result = { translations: output, engine };
      if (config.includePrivacyMetrics) {
        result.privacy = {
          route: engine === "on-device" ? "on-device" : "external",
          charactersProcessed: texts.reduce((sum, value) => sum + String(value).length, 0),
          maskedValues: protectedValues.reduce((sum, value) => sum + value.maskedCount, 0),
          maskedKinds: [...new Set(protectedValues.flatMap((value) => value.maskedKinds))]
        };
      }
      return result;
    } catch (error) {
      lastError = error;
      if (error?.code === "cancelled" || config.signal?.aborted) throw error;
    }
  }
  throw lastError || new TranslationProviderError("No translation provider is configured.", { code: "provider-unavailable", retryable: false });
}
