(() => {
  if (globalThis.__BAPT_CONTENT_LOADED__) return;
  globalThis.__BAPT_CONTENT_LOADED__ = true;

  const EXCLUDED_SELECTOR = [
    "script", "style", "noscript", "textarea", "code", "pre", "kbd", "samp",
    "svg", "math", "[hidden]", "[aria-hidden='true']", "[translate='no']", ".notranslate", "[data-bapt-ui]"
  ].join(",");
  const ATTRIBUTE_NAMES = ["placeholder", "title", "aria-label", "alt", "value"];
  const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);
  const BLOCK_SELECTOR = "p,li,dt,dd,blockquote,figcaption,h1,h2,h3,h4,h5,h6,td,th,caption,summary,label,article,section";
  const READING_MODES = new Set(["translated", "bilingual", "hover"]);

  function inlineMarker(index) {
    return `BAPTINLINE${String(index).padStart(4, "0")}BAPT`;
  }

  function joinContextualRecords(records) {
    return records.map((record, index) => `${inlineMarker(index)} ${record.text}`).join(" ");
  }

  function splitContextualTranslation(value, expectedCount) {
    const pattern = /BAPT\s*INLINE\s*(\d{4})\s*BAPT/gi;
    const source = String(value);
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== expectedCount) return null;
    const output = Array(expectedCount).fill("");
    for (let index = 0; index < matches.length; index += 1) {
      const itemIndex = Number(matches[index][1]);
      if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= expectedCount) return null;
      output[itemIndex] = source.slice(matches[index].index + matches[index][0].length, matches[index + 1]?.index ?? source.length).trim();
    }
    return output.every(Boolean) ? output : null;
  }

  function isElementInViewport(element, viewport = { width: innerWidth, height: innerHeight }) {
    if (!element?.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewport.height && rect.left <= viewport.width;
  }

  function partitionViewportRecords(records) {
    const visible = [];
    const deferred = [];
    for (const record of records) (record.visible ? visible : deferred).push(record);
    return { visible, deferred };
  }

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
      joinContextualRecords,
      splitContextualTranslation,
      isElementInViewport,
      partitionViewportRecords,
      minimizeRoots,
      sensitivePageMetadata
    });
    return;
  }

  const textOriginals = new WeakMap();
  const textTranslations = new WeakMap();
  const textTranslationCores = new WeakMap();
  const textParts = new WeakMap();
  const trackedTextNodes = new Set();
  const textDisconnectedAt = new WeakMap();
  const attributeOriginals = new WeakMap();
  const attributeTranslations = new WeakMap();
  const trackedAttributes = new Set();
  const attributeDisconnectedAt = new WeakMap();
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
  let composeTrigger = null;
  let composePreview = null;
  let activeEditable = null;
  let currentReadingMode = "translated";
  let smartComposeEnabled = true;
  let configuredTargetLanguage = "en";
  const bilingualElements = new Set();
  const hoverBlocks = new WeakSet();
  let originalDocumentDirection = null;
  let state = {
    active: false,
    busy: false,
    sourceLanguage: "",
    targetLanguage: "",
    translatedSections: 0,
    totalSections: 0,
    engine: "",
    readingMode: "translated",
    privacy: { route: "", charactersProcessed: 0, maskedValues: 0, maskedKinds: [] },
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

  function translationBlockFor(node) {
    const parent = node?.parentElement;
    return parent?.closest?.(BLOCK_SELECTOR) || parent;
  }

  function renderTextNode(node, showOriginal = false) {
    const parts = textParts.get(node);
    const translated = textTranslationCores.get(node);
    if (!parts || typeof translated !== "string") return;
    const core = showOriginal || currentReadingMode === "bilingual" ? parts.core : translated;
    const rendered = `${parts.prefix}${core}${parts.suffix}`;
    node.nodeValue = rendered;
    if (!showOriginal && currentReadingMode !== "bilingual") textTranslations.set(node, rendered);
  }

  function removeBilingualElements() {
    for (const element of bilingualElements) element.remove();
    bilingualElements.clear();
  }

  function bindHoverBlock(block) {
    if (!block || hoverBlocks.has(block)) return;
    hoverBlocks.add(block);
    block.addEventListener("mouseenter", () => {
      if (currentReadingMode !== "hover") return;
      applying = true;
      try {
        for (const node of trackedTextNodes) if (translationBlockFor(node) === block) renderTextNode(node, true);
      } finally { applying = false; }
    }, { passive: true });
    block.addEventListener("mouseleave", () => {
      if (currentReadingMode !== "hover") return;
      applying = true;
      try {
        for (const node of trackedTextNodes) if (translationBlockFor(node) === block) renderTextNode(node, false);
      } finally { applying = false; }
    }, { passive: true });
  }

  function renderReadingMode() {
    removeBilingualElements();
    applying = true;
    try {
      for (const node of trackedTextNodes) renderTextNode(node);
      if (currentReadingMode === "bilingual") {
        const byBlock = new Map();
        for (const node of trackedTextNodes) {
          if (!node.isConnected || !textTranslationCores.has(node)) continue;
          const block = translationBlockFor(node);
          if (!block || block.dataset?.baptUi) continue;
          if (!byBlock.has(block)) byBlock.set(block, []);
          byBlock.get(block).push(textTranslationCores.get(node));
        }
        for (const [block, translations] of byBlock) {
          if (!block.parentNode || !translations.length) continue;
          const companion = document.createElement("div");
          companion.dataset.baptUi = "true";
          companion.dataset.baptBilingual = "true";
          companion.dir = "auto";
          companion.textContent = translations.join(" ");
          companion.style.cssText = "margin:.4em 0 .8em;padding:.55em .75em;border-left:3px solid #6d5dfc;border-radius:.35em;background:color-mix(in srgb,#6d5dfc 9%,transparent);color:inherit;font:inherit;line-height:1.45;opacity:.92";
          block.insertAdjacentElement("afterend", companion);
          bilingualElements.add(companion);
        }
      } else if (currentReadingMode === "hover") {
        for (const node of trackedTextNodes) bindHoverBlock(translationBlockFor(node));
      }
    } finally {
      applying = false;
    }
    setState({ readingMode: currentReadingMode });
  }

  function contextualizeRecords(records) {
    const groups = new Map();
    for (const record of records) {
      const key = record.block || record.identity;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    return [...groups.values()].flatMap((recordsInBlock) => {
      const chunks = [];
      let chunk = [];
      let length = 0;
      for (const record of recordsInBlock) {
        if (chunk.length && (chunk.length >= 28 || length + record.text.length > 4200)) {
          chunks.push(chunk); chunk = []; length = 0;
        }
        chunk.push(record); length += record.text.length;
      }
      if (chunk.length) chunks.push(chunk);
      return chunks.map((group) => {
        if (group.length === 1) return group[0];
        return {
          text: joinContextualRecords(group),
          identity: group,
          block: group[0].block,
          visible: group.some((record) => record.visible),
          fallbackRecords: group,
          apply(value) {
            const values = splitContextualTranslation(value, group.length);
            if (!values) return false;
            values.forEach((translation, index) => group[index].apply(translation));
            return true;
          }
        };
      });
    });
  }

  function textRecord(textNode) {
    if (!textNode || elementIsExcluded(textNode.parentElement)) return null;
    const current = textNode.nodeValue || "";
    if (textTranslations.get(textNode) === current || (trackedTextNodes.has(textNode) && textTranslationCores.has(textNode) && textOriginals.get(textNode) === current)) {
      trackedTextNodes.add(textNode);
      return null;
    }
    const parts = splitWhitespace(current);
    if (!shouldTranslateText(parts.core)) return null;
    textOriginals.set(textNode, current);
    textParts.set(textNode, parts);
    trackedTextNodes.add(textNode);
    const block = translationBlockFor(textNode);
    return {
      text: parts.core,
      identity: textNode,
      block,
      visible: isElementInViewport(block),
      apply(value) {
        if (!textNode) return true;
        textTranslationCores.set(textNode, String(value));
        renderTextNode(textNode);
        return true;
      }
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
    return contextualizeRecords(records);
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
            visible: isElementInViewport(element),
            apply(value) {
              if (!element.isConnected) return;
              element.setAttribute(name, value);
              let translated = attributeTranslations.get(element);
              if (!translated) {
                translated = new Map();
                attributeTranslations.set(element, translated);
              }
              translated.set(name, value);
              return true;
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
    const now = Date.now();
    const gracePeriod = 30_000;
    for (const node of trackedTextNodes) {
      if (node.isConnected) textDisconnectedAt.delete(node);
      else if (!textDisconnectedAt.has(node)) textDisconnectedAt.set(node, now);
      else if (now - textDisconnectedAt.get(node) > gracePeriod) trackedTextNodes.delete(node);
    }
    for (const element of trackedAttributes) {
      if (element.isConnected) attributeDisconnectedAt.delete(element);
      else if (!attributeDisconnectedAt.has(element)) attributeDisconnectedAt.set(element, now);
      else if (now - attributeDisconnectedAt.get(element) > gracePeriod) trackedAttributes.delete(element);
    }
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
        if (typeof original === "string") node.nodeValue = original;
      }
      for (const element of trackedAttributes) {
        const originals = attributeOriginals.get(element);
        if (!originals) continue;
        for (const [name, value] of originals) element.setAttribute(name, value);
      }
    } finally {
      applying = false;
    }
    trackedTextNodes.clear();
    trackedAttributes.clear();
    removeBilingualElements();
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
    const mode = document.createElement("button");
    mode.type = "button";
    mode.className = "secondary mode";
    mode.setAttribute("aria-label", "Change reading mode");
    mode.title = "Switch between translated, bilingual and original-on-hover modes";
    mode.addEventListener("click", () => {
      const modes = ["translated", "bilingual", "hover"];
      currentReadingMode = modes[(modes.indexOf(currentReadingMode) + 1) % modes.length];
      renderReadingMode();
    });
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
    bar.append(dot, label, action, mode, dismiss);
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
    const mode = pageControlShadow.querySelector("button.mode");
    dot.classList.toggle("busy", state.busy);
    if (state.busy) {
      label.textContent = state.totalSections
        ? `Translating ${state.translatedSections} of ${state.totalSections} sections…`
        : "Preparing page translation…";
      action.textContent = "Cancel";
    } else {
      const provider = state.engine ? ` · ${state.engine}` : "";
      const privacy = state.privacy.route === "on-device"
        ? " · on-device"
        : state.privacy.route === "external"
          ? ` · ${state.privacy.maskedValues || 0} protected`
          : "";
      label.textContent = `Translated to ${state.targetLanguage.toUpperCase()}${provider}${privacy}`;
      action.textContent = "Show original";
    }
    if (mode) mode.textContent = currentReadingMode === "bilingual" ? "A+B" : currentReadingMode === "hover" ? "Hover" : "A→B";
  }

  function cancelTranslation() {
    jobNumber += 1;
    cancelProviderJob();
    restoreOriginal();
  }

  async function translateRecords(records, sourceLanguage, targetLanguage, job, jobId, baseCount = 0, totalCount = 0) {
    let translatedCount = 0;
    let engine = state.engine;
    const chunks = chunkRecords(records);
    setState({ totalSections: totalCount || baseCount + records.length });
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
      const fallbacks = [];
      try {
        response.translations.forEach((value, index) => {
          if (chunk[index].apply(value) === false) fallbacks.push(...(chunk[index].fallbackRecords || []));
        });
      } finally {
        applying = false;
      }
      if (fallbacks.length) {
        const fallbackResponse = await chrome.runtime.sendMessage({
          type: "translate-texts",
          jobId,
          texts: fallbacks.map((record) => record.text),
          sourceLanguage,
          targetLanguage
        });
        if (fallbackResponse?.status !== "ok" || fallbackResponse.translations?.length !== fallbacks.length) {
          throw Object.assign(new Error("Context markers changed and safe fallback translation failed."), { code: "context-integrity" });
        }
        applying = true;
        try { fallbackResponse.translations.forEach((value, index) => fallbacks[index].apply(value)); }
        finally { applying = false; }
      }
      translatedCount += chunk.length;
      engine = response.engine || engine;
      const privacy = response.privacy || {};
      setState({
        translatedSections: baseCount + translatedCount,
        engine,
        privacy: {
          route: privacy.route || state.privacy.route,
          charactersProcessed: state.privacy.charactersProcessed + Number(privacy.charactersProcessed || 0),
          maskedValues: state.privacy.maskedValues + Number(privacy.maskedValues || 0),
          maskedKinds: [...new Set([...(state.privacy.maskedKinds || []), ...(privacy.maskedKinds || [])])]
        }
      });
    }
    renderReadingMode();
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
    currentReadingMode = READING_MODES.has(options.readingMode) ? options.readingMode : "translated";
    smartComposeEnabled = options.smartCompose !== false;
    configuredTargetLanguage = options.targetLanguage || configuredTargetLanguage;
    setState({
      active: false,
      busy: true,
      sourceLanguage: options.sourceLanguage || "auto",
      targetLanguage: options.targetLanguage,
      translatedSections: 0,
      totalSections: 0,
      engine: "",
      readingMode: currentReadingMode,
      privacy: { route: "", charactersProcessed: 0, maskedValues: 0, maskedKinds: [] },
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
      const { visible, deferred } = options.viewportFirst === false
        ? { visible: records, deferred: [] }
        : partitionViewportRecords(records);
      const first = visible.length ? visible : deferred.splice(0, Math.min(12, deferred.length));
      const firstResult = await translateRecords(first, state.sourceLanguage, state.targetLanguage, job, jobId, 0, records.length);
      let result = firstResult;
      if (deferred.length) {
        await waitForIdle();
        const deferredResult = await translateRecords(deferred, state.sourceLanguage, state.targetLanguage, job, jobId, firstResult.translatedCount, records.length);
        result = { translatedCount: firstResult.translatedCount + deferredResult.translatedCount, engine: deferredResult.engine || firstResult.engine };
      }
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
    style.textContent = `.card{width:min(360px,calc(100vw - 36px));padding:16px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:#12111c;color:#f7f7fb;box-shadow:0 14px 42px rgba(0,0,0,.36);font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.top,.tools{display:flex;justify-content:space-between;gap:8px;align-items:center}.top{color:#aaa7b8;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.value{margin-top:9px;font-size:15px}.tools{justify-content:flex-start;margin-top:12px}button{border:0;border-radius:8px;padding:5px 7px;background:#242130;color:#cbc7df;font:700 11px system-ui;cursor:pointer}.close{background:transparent;font-size:18px}button:focus-visible{outline:3px solid #c7c1ff}`;
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
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close translation");
    close.addEventListener("click", () => host.remove());
    const value = document.createElement("div");
    value.className = "value";
    value.dir = "auto";
    value.textContent = message.translated;
    const tools = document.createElement("div");
    tools.className = "tools";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => navigator.clipboard.writeText(value.textContent || ""));
    const speak = document.createElement("button");
    speak.type = "button";
    speak.textContent = "Listen";
    speak.addEventListener("click", () => {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(value.textContent || ""));
    });
    const reverse = document.createElement("button");
    reverse.type = "button";
    reverse.textContent = "Reverse";
    reverse.addEventListener("click", async () => {
      if (!message.original || !state.sourceLanguage || state.sourceLanguage === "auto") return;
      reverse.disabled = true;
      try {
        const response = await requestComposeTranslation(value.textContent || "", { sourceLanguage: message.targetLanguage, targetLanguage: state.sourceLanguage });
        value.textContent = response.translated;
      } finally { reverse.disabled = false; }
    });
    tools.append(copy, speak, reverse);
    top.append(title, close);
    card.append(top, value, tools);
    shadow.append(style, card);
    document.documentElement.append(host);
    selectionBubble = host;
  }

  function safeEditable(element) {
    if (!element || element.closest?.("[data-bapt-ui]") || element.disabled || element.readOnly) return false;
    const sensitiveDescriptor = `${element.name || ""} ${element.id || ""} ${element.autocomplete || ""} ${element.getAttribute?.("aria-label") || ""} ${element.getAttribute?.("placeholder") || ""} ${element.form?.action || ""}`;
    if (/password|passcode|one.?time.?code|otp|pin|card|payment|security|cvv|cvc|username|user.?name|log.?in|sign.?in|auth/i.test(sensitiveDescriptor)) return false;
    if (element instanceof HTMLTextAreaElement) return true;
    if (element instanceof HTMLInputElement) {
      return ["text", "search"].includes((element.type || "text").toLowerCase())
        && !element.closest?.("form")?.querySelector?.("input[type='password']");
    }
    return element.isContentEditable && !element.closest?.("[aria-hidden='true']") && !element.closest?.("form")?.querySelector?.("input[type='password']");
  }

  function editableText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
    return element.innerText || "";
  }

  function replaceEditableText(element, value) {
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    } else element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function removeComposeTrigger() {
    composeTrigger?.remove();
    composeTrigger = null;
  }

  function showComposeTrigger(element) {
    removeComposeTrigger();
    if (!smartComposeEnabled || !safeEditable(element)) return;
    activeEditable = element;
    const host = document.createElement("div");
    host.dataset.baptUi = "true";
    host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Translate writing";
    button.title = "Translate your writing before sending (Alt+Enter)";
    button.style.cssText = "border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 13px;background:#6d5dfc;color:white;box-shadow:0 10px 30px rgba(0,0,0,.3);font:700 12px system-ui;cursor:pointer";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => openComposeFor(element));
    shadow.append(button);
    document.documentElement.append(host);
    composeTrigger = host;
  }

  async function requestComposeTranslation(text, { sourceLanguage = "auto", targetLanguage = configuredTargetLanguage, style = "natural" } = {}) {
    const response = await chrome.runtime.sendMessage({ type: "translate-compose-text", text, sourceLanguage, targetLanguage, style });
    if (response?.status !== "ok") throw new Error(response?.message || "Writing translation failed.");
    return response;
  }

  function createComposePreview(element, original) {
    composePreview?.remove();
    const host = document.createElement("aside");
    host.dataset.baptUi = "true";
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(5,5,12,.52);padding:18px";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `.card{width:min(560px,calc(100vw - 36px));padding:20px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:#12111c;color:#f7f7fb;box-shadow:0 24px 70px rgba(0,0,0,.46);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}.top,.actions,.route{display:flex;align-items:center;justify-content:space-between;gap:10px}.top h2{margin:0;font-size:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.pane{min-height:112px;padding:12px;border:1px solid #393548;border-radius:12px;background:#1b1926;white-space:pre-wrap;overflow-wrap:anywhere}.label{display:block;margin-bottom:6px;color:#aaa7b8;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}select,button{border:1px solid #464158;border-radius:10px;padding:9px 11px;background:#242130;color:#f7f7fb;font:700 12px system-ui;cursor:pointer}button.primary{border-color:#6d5dfc;background:#6d5dfc}.route{justify-content:flex-start;color:#aaa7b8;font-size:11px;margin:10px 0 16px}.error{color:#ff9898}.busy{opacity:.65}@media(max-width:560px){.grid{grid-template-columns:1fr}}`;
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Translate writing preview");
    card.innerHTML = `<div class="top"><h2>Translate your writing</h2><select aria-label="Writing style"><option value="natural">Natural</option><option value="formal">Formal</option><option value="informal">Informal</option></select></div><div class="grid"><div><span class="label">Original</span><div class="pane original" dir="auto"></div></div><div><span class="label">Translation</span><div class="pane translated" dir="auto">Translating…</div></div></div><div class="route" aria-live="polite"></div><div class="actions"><div><button type="button" data-action="swap">Swap languages</button><button type="button" data-action="copy">Copy</button></div><div><button type="button" data-action="cancel">Cancel</button><button class="primary" type="button" data-action="replace">Replace writing</button></div></div>`;
    card.querySelector(".original").textContent = original;
    shadow.append(style, card);
    document.documentElement.append(host);
    composePreview = host;
    let latest = null;
    let swapped = false;
    const translated = card.querySelector(".translated");
    const route = card.querySelector(".route");
    const styleSelect = card.querySelector("select");
    async function run() {
      card.classList.add("busy");
      translated.textContent = "Translating…";
      route.className = "route";
      try {
        latest = await requestComposeTranslation(swapped && latest ? latest.translated : original, {
          sourceLanguage: swapped ? configuredTargetLanguage : "auto",
          targetLanguage: swapped && state.sourceLanguage && state.sourceLanguage !== "auto" ? state.sourceLanguage : configuredTargetLanguage,
          style: styleSelect.value
        });
        translated.textContent = latest.translated;
        route.textContent = latest.privacy?.route === "on-device"
          ? "On-device — nothing left this browser"
          : `${latest.engine} — ${latest.privacy?.charactersProcessed || original.length} characters, ${latest.privacy?.maskedValues || 0} protected values`;
      } catch (error) {
        translated.textContent = "Translation was not completed.";
        route.textContent = error.message;
        route.className = "route error";
      } finally { card.classList.remove("busy"); }
    }
    styleSelect.addEventListener("change", run);
    card.addEventListener("click", async (event) => {
      const action = event.target.closest?.("button")?.dataset.action;
      if (action === "cancel") host.remove();
      if (action === "replace" && latest) { replaceEditableText(element, latest.translated); host.remove(); }
      if (action === "copy" && latest) await navigator.clipboard.writeText(latest.translated);
      if (action === "swap" && latest) { swapped = !swapped; await run(); }
    });
    run();
  }

  function openComposeFor(element = activeEditable || document.activeElement) {
    if (!safeEditable(element)) return;
    const text = editableText(element).trim();
    if (!text) return;
    createComposePreview(element, text);
  }

  document.addEventListener("focusin", (event) => {
    if (safeEditable(event.target)) showComposeTrigger(event.target);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key === "Enter" && safeEditable(document.activeElement)) {
      event.preventDefault();
      openComposeFor(document.activeElement);
    }
    if (event.key === "Escape") composePreview?.remove();
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "configure-content") {
      smartComposeEnabled = message.smartCompose !== false;
      configuredTargetLanguage = message.targetLanguage || configuredTargetLanguage;
      if (!smartComposeEnabled) removeComposeTrigger();
      sendResponse({ status: "configured" });
      return false;
    }
    if (message?.type === "set-reading-mode") {
      if (!READING_MODES.has(message.readingMode)) {
        sendResponse({ status: "invalid-reading-mode" });
        return false;
      }
      currentReadingMode = message.readingMode;
      renderReadingMode();
      sendResponse({ status: "ok", state });
      return false;
    }
    if (message?.type === "open-smart-compose") {
      openComposeFor(document.activeElement);
      sendResponse({ status: "opened" });
      return false;
    }
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
