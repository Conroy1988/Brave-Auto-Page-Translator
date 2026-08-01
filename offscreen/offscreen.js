const translators = new Map();

async function getTranslator(sourceLanguage, targetLanguage) {
  if (!("Translator" in self)) throw new Error("The browser does not provide the on-device Translator API.");
  if (!sourceLanguage || sourceLanguage === "auto") throw new Error("On-device translation requires a detected source language.");
  const key = `${sourceLanguage}:${targetLanguage}`;
  if (translators.has(key)) return translators.get(key);
  const availability = await Translator.availability({ sourceLanguage, targetLanguage });
  if (availability === "unavailable") throw new Error("This on-device language pair is unavailable.");
  const translator = await Translator.create({ sourceLanguage, targetLanguage });
  translators.set(key, translator);
  return translator;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen" || message.type !== "translate-on-device") return false;
  (async () => {
    const translator = await getTranslator(message.sourceLanguage, message.targetLanguage);
    const translations = [];
    for (const text of message.texts || []) translations.push(await translator.translate(text));
    return { status: "ok", translations };
  })().then(sendResponse).catch((error) => sendResponse({ status: "error", message: error.message }));
  return true;
});
