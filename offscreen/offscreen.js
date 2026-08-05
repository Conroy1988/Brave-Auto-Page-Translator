const translators = new Map();

async function translatorAvailability(sourceLanguage, targetLanguage) {
  if (!("Translator" in self)) return "unsupported";
  if (!sourceLanguage || sourceLanguage === "auto") return "source-required";
  return Translator.availability({ sourceLanguage, targetLanguage });
}

async function getTranslator(sourceLanguage, targetLanguage) {
  if (!("Translator" in self)) throw new Error("The browser does not provide the on-device Translator API.");
  if (!sourceLanguage || sourceLanguage === "auto") throw new Error("On-device translation requires a detected source language.");
  const key = `${sourceLanguage}:${targetLanguage}`;
  if (translators.has(key)) return translators.get(key);
  const availability = await translatorAvailability(sourceLanguage, targetLanguage);
  if (availability === "unavailable") throw new Error("This on-device language pair is unavailable.");
  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        chrome.runtime.sendMessage({
          type: "on-device-download-progress",
          sourceLanguage,
          targetLanguage,
          loaded: Number(event.loaded || 0)
        }).catch(() => {});
      });
    }
  });
  translators.set(key, translator);
  return translator;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;
  (async () => {
    if (message.type === "on-device-availability") {
      return {
        status: "ok",
        availability: await translatorAvailability(message.sourceLanguage, message.targetLanguage)
      };
    }
    if (message.type !== "translate-on-device") return { status: "invalid-message" };
    const translator = await getTranslator(message.sourceLanguage, message.targetLanguage);
    const translations = [];
    for (const text of message.texts || []) translations.push(await translator.translate(text));
    return { status: "ok", translations };
  })().then(sendResponse).catch((error) => sendResponse({ status: "error", message: error.message }));
  return true;
});
