const TRANSLATION_HOSTS = new Set([
  "translate.google.com",
  "translate.googleusercontent.com"
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

export function isSupportedPageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !TRANSLATION_HOSTS.has(url.hostname);
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

export function buildTranslationUrl(originalUrl, targetLanguage, sourceLanguage = "auto") {
  const url = new URL("https://translate.google.com/translate");
  url.searchParams.set("sl", normalizeLanguageCode(sourceLanguage) || "auto");
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("u", originalUrl);
  return url.toString();
}
