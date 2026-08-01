import { DEFAULT_SETTINGS, loadSettings, normalizeSettings } from "./settings.js";
import {
  baseLanguage,
  buildTranslationUrl,
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

  const manualOverride = manual && ["unknown-language", "excluded-site", "excluded-language"].includes(inspection.status);
  if (inspection.status !== "ready" && !manualOverride) {
    if (inspection.status === "excluded-site") await setBadge(tabId, "SKIP", "#64748b");
    else if (inspection.status === "already-target") await setBadge(tabId, "");
    return inspection;
  }

  const sourceUrl = tab.url;
  const now = Date.now();
  const previous = recentlyHandled.get(tabId);
  if (previous?.url === sourceUrl && now - previous.time < 15_000) {
    return { ...inspection, status: "recently-handled" };
  }
  recentlyHandled.set(tabId, { url: sourceUrl, time: now });

  const translatedUrl = buildTranslationUrl(sourceUrl, settings.targetLanguage, language || "auto");
  await setBadge(tabId, `→${baseLanguage(settings.targetLanguage).toUpperCase()}`, "#0f9f8f");

  if (settings.openInNewTab) {
    await chrome.tabs.create({ url: translatedUrl, active: true, openerTabId: tabId });
  } else {
    await chrome.tabs.update(tabId, { url: translatedUrl });
  }

  return { ...inspection, status: "translated", translatedUrl };
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(normalizeSettings(stored));
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    if (!message || typeof message !== "object") return { status: "invalid-message" };
    if (message.type === "refresh-settings") return refreshSettings();

    const tabId = Number(message.tabId);
    if (!Number.isInteger(tabId)) return { status: "invalid-tab" };
    const tab = await chrome.tabs.get(tabId);

    if (message.type === "inspect-tab") return inspectTab(tabId, tab);
    if (message.type === "translate-now") return translateTab(tabId, tab, { manual: true });
    return { status: "unknown-message" };
  };

  handle().then(sendResponse).catch((error) => sendResponse({ status: "error", message: error.message }));
  return true;
});
