export const SUPPORTED_LANGUAGES = Object.freeze([
  ["en", "English"],
  ["ar", "Arabic"],
  ["bg", "Bulgarian"],
  ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"],
  ["hr", "Croatian"],
  ["cs", "Czech"],
  ["da", "Danish"],
  ["nl", "Dutch"],
  ["et", "Estonian"],
  ["fi", "Finnish"],
  ["fr", "French"],
  ["de", "German"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["hi", "Hindi"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["lv", "Latvian"],
  ["lt", "Lithuanian"],
  ["no", "Norwegian"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["sr", "Serbian"],
  ["sk", "Slovak"],
  ["sl", "Slovenian"],
  ["es", "Spanish"],
  ["sv", "Swedish"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["vi", "Vietnamese"]
]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  targetLanguage: "en",
  excludedLanguages: [],
  excludedHosts: ["localhost", "127.0.0.1"],
  translateDynamicContent: true,
  showPageControl: true,
  showBadge: true
});

const VALID_TARGETS = new Set(SUPPORTED_LANGUAGES.map(([code]) => code));

function cleanList(value, transform = (item) => item) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => transform(item.trim()))
    .filter(Boolean))];
}

export function normalizeSettings(value = {}) {
  const targetLanguage = VALID_TARGETS.has(value.targetLanguage)
    ? value.targetLanguage
    : DEFAULT_SETTINGS.targetLanguage;

  return {
    enabled: value.enabled !== false,
    targetLanguage,
    excludedLanguages: cleanList(value.excludedLanguages, (item) => item.toLowerCase()),
    excludedHosts: cleanList(value.excludedHosts, (item) => item.toLowerCase().replace(/^www\./, "")),
    translateDynamicContent: value.translateDynamicContent !== false,
    showPageControl: value.showPageControl !== false,
    showBadge: value.showBadge !== false
  };
}

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return normalizeSettings(stored);
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.sync.set(normalized);
  return normalized;
}
