const GOOGLE_WEB_ENDPOINTS = Object.freeze([
  "https://translate.googleapis.com/translate_a/single",
  "https://translate.google.com/translate_a/single"
]);
const GOOGLE_CLOUD_ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
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

function providerCandidates(config) {
  const requested = config.providerMode || "auto";
  if (requested !== "auto") {
    return [requested, ...(config.allowGoogleWebFallback && requested !== "google-web" ? ["google-web"] : [])];
  }
  return [
    "on-device",
    ...(config.googleCloudApiKey ? ["google-cloud"] : []),
    ...(config.libreTranslateEndpoint ? ["libretranslate"] : []),
    ...(config.allowGoogleWebFallback ? ["google-web"] : [])
  ];
}

async function runProvider(engine, texts, config) {
  const common = { fetchImpl: config.fetchImpl || fetch, signal: config.signal };
  if (engine === "on-device") {
    if (typeof config.onDeviceTranslate !== "function") throw new TranslationProviderError("On-device translation is not available in this browser.", { code: "provider-unavailable", retryable: false });
    return config.onDeviceTranslate(texts, config.sourceLanguage, config.targetLanguage, config.signal);
  }
  if (engine === "google-cloud") return translateGoogleCloud(texts, config.sourceLanguage, config.targetLanguage, config.googleCloudApiKey, common);
  if (engine === "libretranslate") return translateLibre(texts, config.sourceLanguage, config.targetLanguage, config.libreTranslateEndpoint, config.libreTranslateApiKey, common);
  if (engine === "google-web") return translateGoogleWeb(texts, config.sourceLanguage, config.targetLanguage, common);
  throw new TranslationProviderError(`Unknown translation provider: ${engine}`, { code: "invalid-provider", retryable: false });
}

export async function translateTexts(texts, config = {}) {
  if (!Array.isArray(texts) || !texts.length) return { translations: [], engine: "" };
  if (texts.length > 160) throw new TranslationProviderError("Too many text sections were requested at once.", { code: "request-too-large", retryable: false });
  const sourceLanguage = String(config.sourceLanguage || "auto").toLowerCase();
  const targetLanguage = String(config.targetLanguage || "").toLowerCase();
  if (!targetLanguage) throw new TranslationProviderError("A target language is required.", { code: "missing-target", retryable: false });

  const protectedValues = texts.map((text) => {
    const value = String(text).trim();
    if (!value || value.length > 5000) throw new TranslationProviderError("A text section is empty or too large to translate safely.", { code: "invalid-section", retryable: false });
    return protectTerms(value, config.glossary, config.neverTranslateTerms);
  });
  const terminologyKey = JSON.stringify([config.glossary || [], config.neverTranslateTerms || []]);
  let lastError;

  for (const engine of providerCandidates(config)) {
    try {
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
      return { translations: output, engine };
    } catch (error) {
      lastError = error;
      if (error?.code === "cancelled" || config.signal?.aborted) throw error;
    }
  }
  throw lastError || new TranslationProviderError("No translation provider is configured.", { code: "provider-unavailable", retryable: false });
}
