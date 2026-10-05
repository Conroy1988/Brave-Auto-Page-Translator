export function message(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function applyTranslations(root = document) {
  const language = chrome.i18n.getUILanguage?.() || "en";
  document.documentElement.lang = language.replace("_", "-");
  document.documentElement.dir = /^(ar|he|fa|ur)(-|_|$)/i.test(language) ? "rtl" : "ltr";
  for (const element of root.querySelectorAll("[data-i18n]")) {
    const translated = chrome.i18n.getMessage(element.dataset.i18n);
    if (translated) element.textContent = translated;
  }
  for (const element of root.querySelectorAll("[data-i18n-label]")) {
    const translated = chrome.i18n.getMessage(element.dataset.i18nLabel);
    if (translated) element.setAttribute("aria-label", translated);
  }
  for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
    const translated = chrome.i18n.getMessage(element.dataset.i18nPlaceholder);
    if (translated) element.placeholder = translated;
  }
}
