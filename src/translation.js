const TRANSLATION_HOSTS = new Set([
  "translate.google.com",
  "translate.googleusercontent.com",
  "translate.goog"
]);

export function normalizeLanguageCode(code) {
  if (typeof code !== "string") return "";
  return code.trim().replace("_", "-").toLowerCase();
}

export function baseLanguage(code) {
  return normalizeLanguageCode(code).split("-")[0];
}

export function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isTranslationHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return [...TRANSLATION_HOSTS].some(
    (translationHost) => host === translationHost || host.endsWith(`.${translationHost}`)
  );
}

export function isSupportedPageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !isTranslationHost(url.hostname);
  } catch {
    return false;
  }
}

export function hostMatchesRule(hostname, rule) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const normalizedRule = rule.toLowerCase().replace(/^www\./, "");
  return host === normalizedRule || host.endsWith(`.${normalizedRule}`);
}

export function shouldTranslateLanguage(detectedLanguage, settings) {
  const detected = normalizeLanguageCode(detectedLanguage);
  if (!detected || detected === "und") return false;

  const detectedBase = baseLanguage(detected);
  const targetBase = baseLanguage(settings.targetLanguage);
  if (detectedBase === targetBase) return false;

  return !settings.excludedLanguages.some((language) => {
    const excluded = normalizeLanguageCode(language);
    return detected === excluded || detectedBase === baseLanguage(excluded);
  });
}
