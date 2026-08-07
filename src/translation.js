const TRANSLATION_HOSTS = new Set([
  "translate.google.com",
  "translate.googleusercontent.com",
  "translate.goog"
]);

export function normalizeLanguageCode(code) {
  if (typeof code !== "string") return "";
  const normalized = code.trim().replace("_", "-").toLowerCase();
  if (normalized === "zh-cn" || normalized === "zh-hans") return "zh-cn";
  if (normalized === "zh-tw" || normalized === "zh-hant") return "zh-tw";
  return normalized;
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

export function originPatternFromUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return "";
  }
}

export function hostPermissionPatterns(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  if (!host) return [];
  const patterns = [`http://${host}/*`, `https://${host}/*`];
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && host !== "localhost") {
    patterns.push(`http://*.${host}/*`, `https://*.${host}/*`);
  }
  return patterns;
}

export function providerPermissionPatterns(providerMode, {
  allowGoogleWebFallback = false,
  googleCloudApiKey = "",
  deepLApiKey = "",
  deepLApiPlan = "free"
} = {}) {
  const mode = String(providerMode || "auto");
  const patterns = [];
  if (mode === "google-cloud" || (mode === "auto" && googleCloudApiKey)) {
    patterns.push("https://translation.googleapis.com/*");
  }
  if (mode === "google-web" || allowGoogleWebFallback) {
    patterns.push("https://translate.googleapis.com/*", "https://translate.google.com/*");
  }
  if (mode === "deepl" || (mode === "auto" && deepLApiKey)) {
    patterns.push(deepLApiPlan === "pro" ? "https://api.deepl.com/*" : "https://api-free.deepl.com/*");
  }
  return [...new Set(patterns)];
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
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const normalizedRule = String(rule || "").toLowerCase().replace(/^www\./, "");
  return Boolean(host && normalizedRule) && (host === normalizedRule || host.endsWith(`.${normalizedRule}`));
}

export function resolvePageLanguage(detectedLanguage, declaredLanguage) {
  const detected = normalizeLanguageCode(detectedLanguage);
  const declared = normalizeLanguageCode(declaredLanguage);
  if (!detected || detected === "und") return { language: declared, mismatch: false };
  if (!declared || declared === "und") return { language: detected, mismatch: false };
  return {
    language: baseLanguage(detected) === baseLanguage(declared) ? detected : "auto",
    mismatch: baseLanguage(detected) !== baseLanguage(declared)
  };
}

export function targetLanguageForHost(hostname, settings) {
  const profile = siteProfileForHost(hostname, settings);
  if (profile?.targetLanguage) return profile.targetLanguage;
  for (const [rule, language] of Object.entries(settings.siteTargetLanguages || {})) {
    if (hostMatchesRule(hostname, rule)) return language;
  }
  return settings.targetLanguage;
}

export function siteProfileForHost(hostname, settings) {
  const matches = Object.entries(settings.siteProfiles || {})
    .filter(([rule]) => hostMatchesRule(hostname, rule))
    .sort(([left], [right]) => right.length - left.length);
  return matches[0]?.[1] || null;
}

export function providerModeForHost(hostname, settings) {
  return siteProfileForHost(hostname, settings)?.providerMode || settings.providerMode;
}

export function readingModeForHost(hostname, settings) {
  return siteProfileForHost(hostname, settings)?.readingMode || settings.readingMode || "translated";
}

export function sensitivePageModeForHost(hostname, settings) {
  const value = siteProfileForHost(hostname, settings)?.sensitivePageMode;
  return value && value !== "inherit" ? value : settings.sensitivePageMode;
}

export function shouldTranslateLanguage(detectedLanguage, settings, targetLanguage = settings.targetLanguage) {
  const detected = normalizeLanguageCode(detectedLanguage);
  if (!detected || detected === "und") return false;

  const detectedBase = baseLanguage(detected);
  const targetBase = baseLanguage(targetLanguage);
  if (detectedBase === targetBase) return false;

  return !settings.excludedLanguages.some((language) => {
    const excluded = normalizeLanguageCode(language);
    return detected === excluded || detectedBase === baseLanguage(excluded);
  });
}

export function isAutomaticHostAllowed(hostname, settings) {
  if (!settings.enabled) return false;
  if (settings.excludedHosts.some((rule) => hostMatchesRule(hostname, rule))) return false;
  const profile = siteProfileForHost(hostname, settings);
  if (typeof profile?.automatic === "boolean") return profile.automatic;
  if (settings.behaviourMode === "manual") return false;
  if (settings.behaviourMode === "all-sites") return true;
  return settings.approvedHosts.some((rule) => hostMatchesRule(hostname, rule));
}

export function isRtlLanguage(language) {
  return ["ar", "he", "fa", "ur"].includes(baseLanguage(language));
}
