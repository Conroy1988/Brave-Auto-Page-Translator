(() => {
  const EXCLUDED_SELECTOR = [
    "script", "style", "noscript", "textarea", "code", "pre", "kbd", "samp",
    "svg", "math", "[hidden]", "[aria-hidden='true']", "[translate='no']", ".notranslate", "[data-bapt-ui]"
  ].join(",");

  function splitWhitespace(value) {
    const match = String(value).match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { prefix: match?.[1] || "", core: match?.[2] || "", suffix: match?.[3] || "" };
  }

  function shouldTranslateText(value) {
    const text = String(value || "").trim();
    return text.length >= 2 && /\p{L}/u.test(text) && !/^(?:https?:\/\/|www\.)\S+$/i.test(text);
  }

  function elementIsExcluded(element) {
    if (!element || Boolean(element.closest?.(EXCLUDED_SELECTOR)) || element.isContentEditable) return true;
    if (typeof element.checkVisibility === "function" && !element.checkVisibility({ checkOpacity: false })) return true;
    return false;
  }

  function chunkRecords(records, maxItems = 120, maxCharacters = 12000) {
    const chunks = [];
    let current = [];
    let length = 0;
    for (const record of records) {
      if (current.length && (current.length >= maxItems || length + record.text.length > maxCharacters)) {
        chunks.push(current);
        current = [];
        length = 0;
      }
      current.push(record);
      length += record.text.length;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  function collectOpenRoots(root = document.body) {
    if (!root) return [];
    const roots = [root];
    for (let index = 0; index < roots.length; index += 1) {
      const scope = roots[index];
      for (const element of scope.querySelectorAll?.("*") || []) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    return roots;
  }

  const testApi = globalThis.__BAPT_TEST__;
  if (testApi) {
    Object.assign(testApi, { splitWhitespace, shouldTranslateText, elementIsExcluded, chunkRecords });
    return;
  }

  const textOriginals = new WeakMap();
  const textTranslations = new WeakMap();
  const trackedTextNodes = new Set();
  const attributeOriginals = new WeakMap();
  const attributeTranslations = new WeakMap();
  const trackedAttributes = new Set();
  let observer = null;
  let mutationTimer = null;
  let applying = false;
  let jobNumber = 0;
  let pageControl = null;
  let state = {
    active: false,
    busy: false,
    sourceLanguage: "",
    targetLanguage: "",
    translatedSections: 0,
    engine: "",
    error: ""
  };

  function sendStatus() {
    chrome.runtime.sendMessage({ type: "translation-status", state }).catch(() => {});
  }

  function setState(update) {
    state = { ...state, ...update };
    sendStatus();
  }

  function buildTextRecords(root = document.body) {
    if (!root) return [];
    const records = [];
    for (const scope of collectOpenRoots(root)) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (elementIsExcluded(node.parentElement)) continue;
        const current = node.nodeValue || "";
        if (textTranslations.get(node) === current) continue;
        const parts = splitWhitespace(current);
        if (!shouldTranslateText(parts.core)) continue;
        textOriginals.set(node, current);
        trackedTextNodes.add(node);
        records.push({
          text: parts.core,
          apply(value) {
            const translated = `${parts.prefix}${value}${parts.suffix}`;
            node.nodeValue = translated;
            textTranslations.set(node, translated);
          }
        });
      }
    }
    return records;
  }

  function buildAttributeRecords(root = document.body) {
    if (!root?.querySelectorAll) return [];
    const records = [];
    const elements = collectOpenRoots(root).flatMap((scope) => [
      scope,
      ...scope.querySelectorAll("[placeholder],[title],[aria-label],[alt],input[type='button'][value],input[type='submit'][value]")
    ]);
    const names = ["placeholder", "title", "aria-label", "alt", "value"];
    for (const element of elements) {
      if (!(element instanceof Element) || elementIsExcluded(element)) continue;
      for (const name of names) {
        if (!element.hasAttribute(name)) continue;
        const current = element.getAttribute(name) || "";
        const translations = attributeTranslations.get(element);
        if (translations?.get(name) === current || !shouldTranslateText(current)) continue;
        let originals = attributeOriginals.get(element);
        if (!originals) {
          originals = new Map();
          attributeOriginals.set(element, originals);
        }
        originals.set(name, current);
        trackedAttributes.add(element);
        records.push({
          text: current.trim(),
          apply(value) {
            element.setAttribute(name, value);
            let translated = attributeTranslations.get(element);
            if (!translated) {
              translated = new Map();
              attributeTranslations.set(element, translated);
            }
            translated.set(name, value);
          }
        });
      }
    }
    return records;
  }

  function cleanupTracked() {
    for (const node of trackedTextNodes) if (!node.isConnected) trackedTextNodes.delete(node);
    for (const element of trackedAttributes) if (!element.isConnected) trackedAttributes.delete(element);
  }

  function restoreOriginal() {
    applying = true;
    for (const node of trackedTextNodes) {
      const original = textOriginals.get(node);
      if (node.isConnected && typeof original === "string") node.nodeValue = original;
    }
    for (const element of trackedAttributes) {
      const originals = attributeOriginals.get(element);
      if (!element.isConnected || !originals) continue;
      for (const [name, value] of originals) element.setAttribute(name, value);
    }
    applying = false;
    trackedTextNodes.clear();
    trackedAttributes.clear();
    observer?.disconnect();
    observer = null;
    pageControl?.remove();
    pageControl = null;
    setState({ active: false, busy: false, translatedSections: 0, engine: "", error: "" });
  }

  function showControl(targetLanguage) {
    if (window.top !== window || pageControl) return;
    const host = document.createElement("div");
    host.dataset.baptUi = "true";
    host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
      .bar{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 13px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:#12111c;color:#f7f7fb;box-shadow:0 12px 38px rgba(0,0,0,.32);font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif}
      .dot{width:7px;height:7px;border-radius:50%;background:#25c7aa;box-shadow:0 0 0 4px rgba(37,199,170,.15)}
      button{border:0;border-radius:999px;padding:7px 10px;background:#6d5dfc;color:white;font:700 11px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
      button:hover{filter:brightness(1.1)}
    </style><div class="bar"><span class="dot"></span><span>Translated to ${targetLanguage.toUpperCase()}</span><button type="button">Show original</button></div>`;
    shadow.querySelector("button").addEventListener("click", restoreOriginal);
    document.documentElement.append(host);
    pageControl = host;
  }

  async function translateRecords(records, sourceLanguage, targetLanguage, job, baseCount = 0) {
    let translatedCount = 0;
    let engine = "google-text";
    for (const chunk of chunkRecords(records)) {
      const response = await chrome.runtime.sendMessage({
        type: "translate-texts",
        texts: chunk.map((record) => record.text),
        sourceLanguage,
        targetLanguage
      });
      if (job !== jobNumber) throw new Error("Translation was superseded by a newer request.");
      if (response?.status !== "ok" || response.translations?.length !== chunk.length) {
        throw new Error(response?.message || "Translation service returned an incomplete page.");
      }
      applying = true;
      try {
        response.translations.forEach((value, index) => chunk[index].apply(value));
      } finally {
        applying = false;
      }
      translatedCount += chunk.length;
      engine = response.engine || engine;
      setState({ translatedSections: baseCount + translatedCount, engine });
    }
    return { translatedCount, engine };
  }

  function observeDynamicContent(sourceLanguage, targetLanguage) {
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      if (applying || !state.active) return;
      const hasRelevantChange = mutations.some((mutation) => mutation.type === "childList" || mutation.type === "characterData" || mutation.type === "attributes");
      if (!hasRelevantChange) return;
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(async () => {
        cleanupTracked();
        for (const root of collectOpenRoots()) {
          if (root instanceof ShadowRoot) observer.observe(root, observerOptions);
        }
        const records = [...buildTextRecords(), ...buildAttributeRecords()];
        if (!records.length) return;
        try {
          const previousCount = state.translatedSections;
          const result = await translateRecords(records, sourceLanguage, targetLanguage, jobNumber, previousCount);
          setState({ translatedSections: previousCount + result.translatedCount, engine: result.engine, error: "" });
        } catch (error) {
          setState({ error: error.message });
        }
      }, 700);
    });
    const observerOptions = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label", "alt", "value"]
    };
    observer.observe(document.documentElement, observerOptions);
    for (const root of collectOpenRoots()) {
      if (root instanceof ShadowRoot) observer.observe(root, observerOptions);
    }
  }

  async function translatePage(options) {
    if (state.busy) return { status: "translating", state };
    if (state.active && state.targetLanguage === options.targetLanguage && !state.error) return { status: "translated", state };
    if (state.active) restoreOriginal();

    const job = ++jobNumber;
    setState({
      active: false,
      busy: true,
      sourceLanguage: options.sourceLanguage || "auto",
      targetLanguage: options.targetLanguage,
      translatedSections: 0,
      engine: "",
      error: ""
    });

    const records = [...buildTextRecords(), ...buildAttributeRecords()];
    if (!records.length) {
      setState({ busy: false, error: "No readable page text was found." });
      return { status: "no-text", state };
    }

    try {
      const result = await translateRecords(records, state.sourceLanguage, state.targetLanguage, job);
      if (job !== jobNumber) return { status: "superseded", state };
      setState({ active: true, busy: false, translatedSections: result.translatedCount, engine: result.engine, error: "" });
      if (options.translateDynamicContent !== false) observeDynamicContent(state.sourceLanguage, state.targetLanguage);
      if (options.showPageControl !== false) showControl(state.targetLanguage);
      return { status: "translated", state };
    } catch (error) {
      restoreOriginal();
      setState({ active: false, busy: false, error: error.message });
      return { status: "error", message: error.message, state };
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "translate-page") {
      translatePage(message).then(sendResponse).catch((error) => sendResponse({ status: "error", message: error.message }));
      return true;
    }
    if (message?.type === "restore-page") {
      jobNumber += 1;
      restoreOriginal();
      sendResponse({ status: "restored", state });
      return false;
    }
    if (message?.type === "get-translation-state") {
      sendResponse({ status: "ok", state });
      return false;
    }
    return false;
  });

  chrome.runtime.sendMessage({ type: "content-ready" }).catch(() => {});
})();
