import { DEFAULT_SETTINGS, loadSettings, normalizeSettings } from "./settings.js";
import { translateTexts } from "./provider.js";
import {
  baseLanguage,
  hostMatchesRule,
  hostnameFromUrl,
  isSupportedPageUrl,
  normalizeLanguageCode,
  shouldTranslateLanguage
} from "./translation.js";

const recentlyHandled = new Map();
let settingsPromise = loadSettings();

async function refreshSettings() {
  settingsPromise = loadSettings();
  return settingsPromise;
}

async function setBadge(tabId, text, color = "#6d5dfc") {
  const settings = await settingsPromise;
  await chrome.action.setBadgeText({ tabId, text: settings.showBadge ? text : "" });
  if (text && settings.showBadge) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    if (typeof chrome.action.setBadgeTextColor === "function") {
      await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" }).catch(() => {});
    }
  }
}

function isExcludedHost(hostname, excludedHosts) {
  return excludedHosts.some((rule) => hostMatchesRule(hostname, rule));
}

async function inspectTab(tabId, tab) {
  const settings = await settingsPromise;
  const url = tab?.url || "";
  const hostname = hostnameFromUrl(url);

  if (!isSupportedPageUrl(url)) {
    return { status: "unsupported", settings, hostname, language: "" };
  }

  try {
    const page = await chrome.tabs.sendMessage(tabId, { type: "get-translation-state" }, { frameId: 0 });
    if (page?.state?.busy) return { status: "translating", settings, hostname, language: page.state.sourceLanguage, pageState: page.state };
    if (page?.state?.error) return { status: "translation-error", settings, hostname, language: page.state.sourceLanguage, pageState: page.state };
    if (page?.state?.active) return { status: "translated", settings, hostname, language: page.state.sourceLanguage, pageState: page.state };
  } catch {
    // The content script may still be starting. Normal language inspection can continue.
  }

  let language = "";
  try {
    language = normalizeLanguageCode(await chrome.tabs.detectLanguage(tabId));
  } catch {
    language = "";
  }

  if (isExcludedHost(hostname, settings.excludedHosts)) {
    return { status: "excluded-site", settings, hostname, language };
  }

  if (!language || language === "und") {
    return { status: "unknown-language", settings, hostname, language };
  }

  if (baseLanguage(language) === baseLanguage(settings.targetLanguage)) {
    return { status: "already-target", settings, hostname, language };
  }

  if (!shouldTranslateLanguage(language, settings)) {
    return { status: "excluded-language", settings, hostname, language };
  }

  return { status: "ready", settings, hostname, language };
}

async function translateTab(tabId, tab, { manual = false } = {}) {
  const inspection = await inspectTab(tabId, tab);
  const { settings, language } = inspection;

  if (!manual && !settings.enabled) {
    await setBadge(tabId, "OFF", "#6b7280");
    return { ...inspection, status: "disabled" };
  }

  const manualOverride = manual && ["unknown-language", "excluded-site", "excluded-language", "translation-error", "translated"].includes(inspection.status);
  if (inspection.status !== "ready" && !manualOverride) {
    if (inspection.status === "excluded-site") await setBadge(tabId, "SKIP", "#64748b");
    else if (inspection.status === "already-target") await setBadge(tabId, "");
    return inspection;
  }

  const sourceUrl = tab.url;
  const now = Date.now();
  const previous = recentlyHandled.get(tabId);
  if (!manual && previous?.url === sourceUrl && now - previous.time < 3_000) {
    return { ...inspection, status: "recently-handled" };
  }
  recentlyHandled.set(tabId, { url: sourceUrl, time: now });

  await setBadge(tabId, "…", "#6d5dfc");
  try {
    const request = {
      type: "translate-page",
      sourceLanguage: language || "auto",
      targetLanguage: settings.targetLanguage,
      translateDynamicContent: settings.translateDynamicContent,
      showPageControl: settings.showPageControl
    };
    const result = await chrome.tabs.sendMessage(tabId, request, { frameId: 0 });
    if (result?.status === "translated") {
      chrome.tabs.sendMessage(tabId, { ...request, showPageControl: false }).catch(() => {});
      await setBadge(tabId, baseLanguage(settings.targetLanguage).toUpperCase(), "#0f9f8f");
      return { ...inspection, ...result, status: "translated" };
    }
    await setBadge(tabId, "ERR", "#dc2626");
    return { ...inspection, status: result?.status || "translation-error", message: result?.message || "The page could not be translated." };
  } catch (error) {
    await setBadge(tabId, "ERR", "#dc2626");
    return { ...inspection, status: "translation-error", message: error.message };
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(normalizeSettings(stored));
  await chrome.storage.sync.remove("openInNewTab");
  await refreshSettings();
  if (reason === "install") await chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") refreshSettings();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  translateTab(tabId, tab).catch((error) => console.warn("Automatic translation skipped:", error));
});

chrome.tabs.onRemoved.addListener((tabId) => recentlyHandled.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    if (!message || typeof message !== "object") return { status: "invalid-message" };
    if (message.type === "refresh-settings") return refreshSettings();

    if (message.type === "translate-texts") {
      const translations = await translateTexts(
        message.texts,
        normalizeLanguageCode(message.sourceLanguage) || "auto",
        normalizeLanguageCode(message.targetLanguage)
      );
      return { status: "ok", translations, engine: "google-text" };
    }

    if (message.type === "content-ready") {
      if (sender.frameId !== 0 || !sender.tab?.id || !sender.tab.url) return { status: "ready" };
      const settings = await settingsPromise;
      if (settings.enabled) translateTab(sender.tab.id, sender.tab).catch(() => {});
      return { status: "ready" };
    }

    if (message.type === "translation-status") {
      const statusTabId = sender.tab?.id;
      if (!Number.isInteger(statusTabId) || sender.frameId !== 0) return { status: "ignored" };
      if (message.state?.busy) await setBadge(statusTabId, "…", "#6d5dfc");
      else if (message.state?.error) await setBadge(statusTabId, "ERR", "#dc2626");
      else if (message.state?.active) await setBadge(statusTabId, baseLanguage(message.state.targetLanguage).toUpperCase(), "#0f9f8f");
      else await setBadge(statusTabId, "");
      return { status: "recorded" };
    }

    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId)) return { status: "invalid-tab" };
    const tab = await chrome.tabs.get(tabId);

    if (message.type === "inspect-tab") return inspectTab(tabId, tab);
    if (message.type === "translate-now") return translateTab(tabId, tab, { manual: true });
    if (message.type === "restore-page") {
      const result = await chrome.tabs.sendMessage(tabId, { type: "restore-page" }, { frameId: 0 });
      chrome.tabs.sendMessage(tabId, { type: "restore-page" }).catch(() => {});
      await setBadge(tabId, "");
      return result;
    }
    return { status: "unknown-message" };
  };

  handle().then(sendResponse).catch((error) => sendResponse({ status: "error", message: error.message }));
  return true;
});
