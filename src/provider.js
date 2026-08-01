const TRANSLATION_ENDPOINTS = Object.freeze([
  "https://translate.googleapis.com/translate_a/single",
  "https://translate.google.com/translate_a/single"
]);

const CACHE_LIMIT = 2500;
const MAX_BATCH_CHARACTERS = 2800;
const MAX_BATCH_ITEMS = 32;
const translationCache = new Map();

export function parseGoogleTranslation(payload) {
  if (!Array.isArray(payload?.[0])) throw new Error("Translation service returned an unexpected response.");
  const translated = payload[0]
    .map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")
    .join("");
  if (!translated) throw new Error("Translation service returned no translated text.");
  return translated;
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

function cacheKey(text, sourceLanguage, targetLanguage) {
  return `${sourceLanguage || "auto"}\u0000${targetLanguage}\u0000${text}`;
}

function remember(key, value) {
  if (translationCache.size >= CACHE_LIMIT) {
    const oldest = translationCache.keys().next().value;
    translationCache.delete(oldest);
  }
  translationCache.set(key, value);
}

async function requestTranslation(text, sourceLanguage, targetLanguage, fetchImpl) {
  let lastError = null;

  for (const endpoint of TRANSLATION_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const parameters = new URLSearchParams({
        client: "gtx",
        sl: sourceLanguage || "auto",
        tl: targetLanguage,
        dt: "t",
        q: text
      });
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: parameters.toString(),
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Translation service responded with HTTP ${response.status}.`);
      return parseGoogleTranslation(await response.json());
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error("Translation service timed out.")
        : error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Translation service is unavailable.");
}

async function translateGroup(group, sourceLanguage, targetLanguage, fetchImpl) {
  if (group.length === 1) {
    return [await requestTranslation(group[0], sourceLanguage, targetLanguage, fetchImpl)];
  }

  const translatedBatch = await requestTranslation(
    joinTranslationBatch(group),
    sourceLanguage,
    targetLanguage,
    fetchImpl
  );
  const split = splitTranslationBatch(translatedBatch, group.length);
  if (split) return split;

  const output = [];
  for (const text of group) {
    output.push(await requestTranslation(text, sourceLanguage, targetLanguage, fetchImpl));
  }
  return output;
}

export async function translateTexts(texts, sourceLanguage, targetLanguage, fetchImpl = fetch) {
  if (!Array.isArray(texts) || !texts.length) return [];
  if (texts.length > 160) throw new Error("Too many text sections were requested at once.");

  const normalizedSource = String(sourceLanguage || "auto").toLowerCase();
  const normalizedTarget = String(targetLanguage || "").toLowerCase();
  if (!normalizedTarget) throw new Error("A target language is required.");

  const output = Array(texts.length);
  const missing = [];
  const positions = new Map();

  texts.forEach((text, index) => {
    const value = String(text).trim();
    if (!value || value.length > 5000) throw new Error("A text section is empty or too large to translate safely.");
    const key = cacheKey(value, normalizedSource, normalizedTarget);
    if (translationCache.has(key)) {
      output[index] = translationCache.get(key);
      return;
    }
    if (!positions.has(value)) {
      positions.set(value, []);
      missing.push(value);
    }
    positions.get(value).push(index);
  });

  for (const group of groupTranslationTexts(missing)) {
    const translated = await translateGroup(group, normalizedSource, normalizedTarget, fetchImpl);
    translated.forEach((value, groupIndex) => {
      const source = group[groupIndex];
      const key = cacheKey(source, normalizedSource, normalizedTarget);
      remember(key, value);
      for (const position of positions.get(source) || []) output[position] = value;
    });
  }

  return output;
}
