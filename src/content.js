(() => {
  if (globalThis.__BAPT_CONTENT_LOADED__) return;
  globalThis.__BAPT_CONTENT_LOADED__ = true;

  const EXCLUDED_SELECTOR = [
    "script", "style", "noscript", "textarea", "code", "pre", "kbd", "samp",
    "svg", "math", "[hidden]", "[aria-hidden='true']", "[translate='no']", ".notranslate", "[data-bapt-ui]"
  ].join(",");
  const ATTRIBUTE_NAMES = ["placeholder", "title", "aria-label", "alt", "value"];
  const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

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
    if (typeof element.checkVisibility === "function" && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return true;
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

  function createTextApplication(textNode, parts, onApplied = () => {}) {
    return (value) => {
      if (!textNode) return;
      const translated = `${parts.prefix}${value}${parts.suffix}`;
      textNode.nodeValue = translated;
      onApplied(translated);
    };
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

  function minimizeRoots(roots) {
    const connected = [...new Set(roots)].filter((root) => root?.isConnected !== false);
    return connected.filter((candidate, index) => !connected.some((other, otherIndex) => {
      if (index === otherIndex || !other?.contains) return false;
      return other.contains(candidate);
    }));
  }

  function sensitivePageMetadata(root = document) {
    const reasons = [];
    if (root.querySelector?.("input[type='password']")) reasons.push("password-field");
    if (root.querySelector?.("input[autocomplete^='cc-'],input[inputmode='decimal'][name*='card' i],input[name*='payment' i]")) reasons.push("payment-field");
    return { sensitive: reasons.length > 0, sensitiveReasons: reasons };
  }

  const testApi = globalThis.__BAPT_TEST__;
  if (testApi) {
    Object.assign(testApi, {
      splitWhitespace,
      shouldTranslateText,
      elementIsExcluded,
      chunkRecords,
      createTextApplication,
      minimizeRoots,
      sensitivePageMetadata
    });
    return;
  }

  const textOriginals = new WeakMap();
  const textTranslations = new WeakMap();
  const trackedTextNodes = new Set();
  const attributeOriginals = new WeakMap();
  const attributeTranslations = new WeakMap();
  const trackedAttributes = new Set();
  let observedRoots = new WeakSet();
  const pendingRoots = new Set();
  let observer = null;
  let mutationTimer = null;
  let discoveryTimer = null;
  let visibilityHandler = null;
  let applying = false;
  let jobNumber = 0;
  let activeJobId = "";
  let pageControl = null;
  let pageControlShadow = null;
  let selectionBubble = null;
  let originalDocumentDirection = null;
  let state = {
    active: false,
    busy: false,
    sourceLanguage: "",
    targetLanguage: "",
    translatedSections: 0,
    totalSections: 0,
    engine: "",
    error: "",
    errorCode: ""
  };

  function sendStatus() {
    chrome.runtime.sendMessage({ type: "translation-status", state }).catch(() => {});
  }

  function setState(update) {
    state = { ...state, ...update };
    updatePageControl();
    sendStatus();
  }

  function textRecord(textNode) {
    if (!textNode || elementIsExcluded(textNode.parentElement)) return null;
    const current = textNode.nodeValue || "";
    if (textTranslations.get(textNode) === current) {
      trackedTextNodes.add(textNode);
      return null;
    }
    const parts = splitWhitespace(current);
    if (!shouldTranslateText(parts.core)) return null;
    textOriginals.set(textNode, current);
    trackedTextNodes.add(textNode);
    return {
      text: parts.core,
      identity: textNode,
      apply: createTextApplication(textNode, parts, (translated) => textTranslations.set(textNode, translated))
    };
  }

  function buildTextRecords(root = document.body) {
    if (!root) return [];
    if (root.nodeType === Node.TEXT_NODE) return [textRecord(root)].filter(Boolean);
    const records = [];
    for (const scope of collectOpenRoots(root)) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const record = textRecord(node);
        if (record) records.push(record);
      }
    }
    return records;
  }

  function buildAttributeRecords(root = document.body, enabled = false) {
    if (!enabled || !root) return [];
    const records = [];
    for (const scope of collectOpenRoots(root.nodeType === Node.TEXT_NODE ? root.parentElement : root)) {
      const elements = [];
      if (scope instanceof Element) elements.push(scope);
      elements.push(...(scope.querySelectorAll?.("[placeholder],[title],[aria-label],[alt],input[type='button'][value],input[type='submit'][value]") || []));
      for (const element of elements) {
        if (elementIsExcluded(element)) continue;
        for (const name of ATTRIBUTE_NAMES) {
          if (!element.hasAttribute(name)) continue;
          const current = element.getAttribute(name) || "";
          const translations = attributeTranslations.get(element);
          if (translations?.get(name) === current) {
            trackedAttributes.add(element);
            continue;
          }
          if (!shouldTranslateText(current)) continue;
          let originals = attributeOriginals.get(element);
          if (!originals) {
            originals = new Map();
            attributeOriginals.set(element, originals);
          }
          originals.set(name, current);
          trackedAttributes.add(element);
          records.push({
            text: current.trim(),
            identity: `${name}:${current}`,
            apply(value) {
              if (!element.isConnected) return;
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
    }
    return records;
  }

  function recordsForRoots(roots, translateAttributes) {
    const records = [];
    const textSeen = new Set();
    for (const root of minimizeRoots(roots)) {
      for (const record of buildTextRecords(root)) {
        if (textSeen.has(record.identity)) continue;
        textSeen.add(record.identity);
        records.push(record);
      }
      records.push(...buildAttributeRecords(root, translateAttributes));
    }
    return records;
  }

  function cleanupTracked() {
    for (const node of trackedTextNodes) if (!node.isConnected) trackedTextNodes.delete(node);
    for (const element of trackedAttributes) if (!element.isConnected) trackedAttributes.delete(element);
  }

  function stopObservation() {
    observer?.disconnect();
    observer = null;
    clearTimeout(mutationTimer);
    clearInterval(discoveryTimer);
    mutationTimer = null;
    discoveryTimer = null;
    if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
    observedRoots = new WeakSet();
    pendingRoots.clear();
  }

  function cancelProviderJob() {
    if (!activeJobId) return;
    chrome.runtime.sendMessage({ type: "cancel-translation", jobId: activeJobId }).catch(() => {});
    activeJobId = "";
  }

  function restoreDirection() {
    if (originalDocumentDirection === null) return;
    if (originalDocumentDirection) document.documentElement.setAttribute("dir", originalDocumentDirection);
    else document.documentElement.removeAttribute("dir");
    originalDocumentDirection = null;
  }

  function restoreOriginal() {
    jobNumber += 1;
    cancelProviderJob();
    applying = true;
    try {
      for (const node of trackedTextNodes) {
        const original = textOriginals.get(node);
        if (node.isConnected && typeof original === "string") node.nodeValue = original;
      }
      for (const element of trackedAttributes) {
        const originals = attributeOriginals.get(element);
        if (!element.isConnected || !originals) continue;
        for (const [name, value] of originals) element.setAttribute(name, value);
      }
    } finally {
      applying = false;
    }
    trackedTextNodes.clear();
    trackedAttributes.clear();
    stopObservation();
    restoreDirection();
    pageControl?.remove();
    pageControl = null;
    pageControlShadow = null;
    setState({ active: false, busy: false, translatedSections: 0, totalSections: 0, engine: "", error: "", errorCode: "" });
  }

  function createPageControl() {
    if (window.top !== window || pageControl) return;
    const host = document.createElement("div");
    host.dataset.baptUi = "true";
    host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      .bar{display:flex;align-items:center;gap:9px;max-width:min(430px,calc(100vw - 36px));padding:9px 10px 9px 13px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:#12111c;color:#f7f7fb;box-shadow:0 12px 38px rgba(0,0,0,.32);font:600 12px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif}
      .dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#25c7aa;box-shadow:0 0 0 4px rgba(37,199,170,.15)}
      .dot.busy{background:#a89fff;box-shadow:0 0 0 4px rgba(109,93,252,.18);animation:pulse 1s ease-in-out infinite alternate}
      .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      button{border:0;border-radius:999px;padding:7px 10px;background:#6d5dfc;color:white;font:700 11px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
      button.secondary{padding:5px 7px;background:transparent;color:#c8c5d1;font-size:15px;line-height:1}
      button:hover{filter:brightness(1.12)} button:focus-visible{outline:3px solid #c7c1ff;outline-offset:2px}
      @keyframes pulse{to{opacity:.45}} @media(prefers-reduced-motion:reduce){.dot.busy{animation:none}}
    `;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "label";
    const action = document.createElement("button");
    action.type = "button";
    action.addEventListener("click", () => state.busy ? cancelTranslation() : restoreOriginal());
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "secondary";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss translation control");
    dismiss.addEventListener("click", () => {
      pageControl?.remove();
      pageControl = null;
      pageControlShadow = null;
    });
    bar.append(dot, label, action, dismiss);
    shadow.append(style, bar);
    document.documentElement.append(host);
    pageControl = host;
    pageControlShadow = shadow;
    updatePageControl();
  }

  function updatePageControl() {
    if (!pageControlShadow) return;
    const dot = pageControlShadow.querySelector(".dot");
    const label = pageControlShadow.querySelector(".label");
    const action = pageControlShadow.querySelector("button:not(.secondary)");
    dot.classList.toggle("busy", state.busy);
    if (state.busy) {
      label.textContent = state.totalSections
        ? `Translating ${state.translatedSections} of ${state.totalSections} sections…`
        : "Preparing page translation…";
      action.textContent = "Cancel";
    } else {
      const provider = state.engine ? ` · ${state.engine}` : "";
      label.textContent = `Translated to ${state.targetLanguage.toUpperCase()}${provider}`;
      action.textContent = "Show original";
    }
  }

  function cancelTranslation() {
    jobNumber += 1;
    cancelProviderJob();
    restoreOriginal();
  }

  async function translateRecords(records, sourceLanguage, targetLanguage, job, jobId, baseCount = 0) {
    let translatedCount = 0;
    let engine = state.engine;
    const chunks = chunkRecords(records);
    setState({ totalSections: baseCount + records.length });
    for (const chunk of chunks) {
      activeJobId = jobId;
      const response = await chrome.runtime.sendMessage({
        type: "translate-texts",
        jobId,
        texts: chunk.map((record) => record.text),
        sourceLanguage,
        targetLanguage
      });
      activeJobId = "";
      if (job !== jobNumber) throw Object.assign(new Error("Translation was superseded by a newer request."), { code: "superseded" });
      if (response?.status !== "ok" || response.translations?.length !== chunk.length) {
        throw Object.assign(new Error(response?.message || "Translation provider returned an incomplete page."), { code: response?.code || response?.status || "provider-error" });
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

  function observeRoot(root, observerOptions) {
    if (!root || observedRoots.has(root)) return;
    observer.observe(root, observerOptions);
    observedRoots.add(root);
  }

  function discoverAndObserveRoots(observerOptions) {
    for (const root of collectOpenRoots(document.documentElement)) {
      if (root instanceof ShadowRoot) observeRoot(root, observerOptions);
    }
  }

  function waitForIdle() {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(resolve, { timeout: 900 });
      else setTimeout(resolve, 0);
    });
  }

  async function processPendingRoots(options) {
    if (!state.active || state.busy || document.hidden || !pendingRoots.size) return;
    await waitForIdle();
    const roots = minimizeRoots([...pendingRoots]);
    pendingRoots.clear();
    cleanupTracked();
    discoverAndObserveRoots(options.observerOptions);
    const records = recordsForRoots(roots, options.translateAttributes);
    if (!records.length) return;
    try {
      const previousCount = state.translatedSections;
      const result = await translateRecords(records, options.sourceLanguage, options.targetLanguage, jobNumber, options.jobId, previousCount);
      setState({ translatedSections: previousCount + result.translatedCount, totalSections: previousCount + result.translatedCount, engine: result.engine, error: "", errorCode: "" });
    } catch (error) {
      if (error.code !== "superseded" && error.code !== "cancelled") setState({ error: error.message, errorCode: error.code || "dynamic-translation-error" });
    }
  }

  function observeDynamicContent(options) {
    stopObservation();
    const observerOptions = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: options.translateAttributes,
      attributeFilter: options.translateAttributes ? ATTRIBUTE_NAMES : undefined
    };
    options.observerOptions = observerOptions;
    observer = new MutationObserver((mutations) => {
      if (applying || !state.active) return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) pendingRoots.add(node);
        } else pendingRoots.add(mutation.target);
      }
      if (!pendingRoots.size) return;
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => processPendingRoots(options), 450);
    });
    observeRoot(document.documentElement, observerOptions);
    discoverAndObserveRoots(observerOptions);
    discoveryTimer = setInterval(() => {
      if (!document.hidden && state.active) discoverAndObserveRoots(observerOptions);
    }, 30_000);
    visibilityHandler = () => {
      if (!document.hidden && pendingRoots.size) processPendingRoots(options);
    };
    document.addEventListener("visibilitychange", visibilityHandler, { passive: true });
  }

  function applyTargetDirection(targetLanguage, enabled) {
    if (!enabled || !RTL_LANGUAGES.has(String(targetLanguage).split("-")[0].toLowerCase())) return;
    if (originalDocumentDirection === null) originalDocumentDirection = document.documentElement.getAttribute("dir") || "";
    document.documentElement.setAttribute("dir", "rtl");
  }

  async function translatePage(options) {
    if (state.busy) return { status: "translating", state };
    if (state.active && state.targetLanguage === options.targetLanguage && !state.error) return { status: "translated", state };
    if (state.active) restoreOriginal();

    const job = ++jobNumber;
    const jobId = options.jobId || `${Date.now()}-${job}`;
    setState({
      active: false,
      busy: true,
      sourceLanguage: options.sourceLanguage || "auto",
      targetLanguage: options.targetLanguage,
      translatedSections: 0,
      totalSections: 0,
      engine: "",
      error: "",
      errorCode: ""
    });
    if (options.showPageControl !== false) createPageControl();

    const records = recordsForRoots([document.body], options.translateAttributes === true);
    if (!records.length) {
      setState({ busy: false, error: "No readable page text was found.", errorCode: "no-text" });
      return { status: "no-text", state };
    }

    try {
      const result = await translateRecords(records, state.sourceLanguage, state.targetLanguage, job, jobId);
      if (job !== jobNumber) return { status: "superseded", state };
      setState({ active: true, busy: false, translatedSections: result.translatedCount, totalSections: result.translatedCount, engine: result.engine, error: "", errorCode: "" });
      applyTargetDirection(state.targetLanguage, options.adjustTextDirection !== false);
      if (options.translateDynamicContent !== false) observeDynamicContent({
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        translateAttributes: options.translateAttributes === true,
        jobId
      });
      return { status: "translated", state };
    } catch (error) {
      if (error.code === "superseded" || error.code === "cancelled") return { status: error.code, state };
      restoreOriginal();
      setState({ active: false, busy: false, error: error.message, errorCode: error.code || "translation-error" });
      return { status: "error", code: error.code, message: error.message, state };
    }
  }

  function showSelectionTranslation(message) {
    selectionBubble?.remove();
    const host = document.createElement("aside");
    host.dataset.baptUi = "true";
    host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `.card{width:min(360px,calc(100vw - 36px));padding:16px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:#12111c;color:#f7f7fb;box-shadow:0 14px 42px rgba(0,0,0,.36);font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#aaa7b8;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.value{margin-top:9px;font-size:15px}button{border:0;background:transparent;color:#cbc7df;font-size:18px;cursor:pointer}button:focus-visible{outline:3px solid #c7c1ff}`;
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Selected text translation");
    const top = document.createElement("div");
    top.className = "top";
    const title = document.createElement("span");
    title.textContent = `${message.targetLanguage.toUpperCase()} · ${message.engine}`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close translation");
    close.addEventListener("click", () => host.remove());
    const value = document.createElement("div");
    value.className = "value";
    value.dir = "auto";
    value.textContent = message.translated;
    top.append(title, close);
    card.append(top, value);
    shadow.append(style, card);
    document.documentElement.append(host);
    selectionBubble = host;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "translate-page") {
      translatePage(message).then(sendResponse).catch((error) => sendResponse({ status: "error", message: error.message }));
      return true;
    }
    if (message?.type === "restore-page" || message?.type === "cancel-page-translation") {
      restoreOriginal();
      sendResponse({ status: message.type === "restore-page" ? "restored" : "cancelled", state });
      return false;
    }
    if (message?.type === "get-translation-state") {
      sendResponse({ status: "ok", state });
      return false;
    }
    if (message?.type === "get-page-metadata") {
      sendResponse({
        status: "ok",
        metadata: {
          declaredLanguage: document.documentElement.lang || "",
          ...sensitivePageMetadata(),
          translatableTextPresent: shouldTranslateText(document.body?.innerText || "")
        }
      });
      return false;
    }
    if (message?.type === "show-selection-translation") {
      showSelectionTranslation(message);
      sendResponse({ status: "shown" });
      return false;
    }
    return false;
  });

  chrome.runtime.sendMessage({ type: "content-ready" }).catch(() => {});
})();
