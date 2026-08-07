export function applyTranslations(root = document) {
  const language = chrome.i18n.getUILanguage?.() || "en";
  document.documentElement.lang = language.replace("_", "-");
  for (const element of root.querySelectorAll("[data-i18n]")) {
    const translated = chrome.i18n.getMessage(element.dataset.i18n);
    if (translated) element.textContent = translated;
  }
  for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
    const translated = chrome.i18n.getMessage(element.dataset.i18nPlaceholder);
    if (translated) element.placeholder = translated;
  }
}

