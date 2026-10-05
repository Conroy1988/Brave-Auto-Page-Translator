import { DEFAULT_SETTINGS, hasProviderConsent, loadLocalState, loadSettings, saveSettings } from "../src/settings.js";
import { hostPermissionPatterns, hostnameFromUrl, readingModeForHost, siteProfileForHost, targetLanguageForHost } from "../src/translation.js";
import { applyTranslations, message } from "../src/i18n.js";
import { attachFavourite, ensureProviderAccess, fillLanguages, providerReadiness, providerRoutes, requireResponse, runControl } from "../src/ui.js";

const fields = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
let settings = { ...DEFAULT_SETTINGS }, localState, tab, hostname = "", inspection;
let contextVersion = 0, queryVersion = 0, pollTimer, refreshTimer, windowId, siteDirty = false, readiness;
let resultText = "";
applyTranslations();

function setStatus(title, detail, tone = "") {
  fields.statusTitle.textContent = title;
  fields.statusDetail.textContent = detail;
  fields.pulse.className = `pulse ${tone}`.trim();
}
function report(error) { setStatus(message("needsAttention"), error.message, "error"); }
function sameContext(version) { return contextVersion === version; }
async function send(value) { return requireResponse(await chrome.runtime.sendMessage(value)); }
function renderRoute(state = {}) {
  const privacy = state.privacy || {};
  fields.privacyRoute.textContent = privacy.route === "on-device" ? message("onDeviceRoute")
    : privacy.route === "external" ? message("externalRoute", [state.engine || "", String(privacy.charactersProcessed || 0), String(privacy.maskedValues || 0)])
      : message("routeInactive");
}
function updateButtons() {
  const busy = inspection?.status === "translating";
  fields.cancelPage.hidden = !busy;
  fields.translatePage.textContent = message(inspection?.status === "consent-required" ? "completeSetup" : busy ? "cancelTranslation" : "translateThisPage");
  if (!fields.translatePage.hasAttribute("aria-busy")) fields.translatePage.disabled = !tab?.id || ["unsupported", "already-target"].includes(inspection?.status);
  if (!fields.restorePage.hasAttribute("aria-busy")) fields.restorePage.disabled = !tab?.id || !inspection?.pageState?.translatedSections;
  fields.copyResult.disabled = !resultText;
  for (const id of ["saveSite", "resetSite", "siteAutomatic", "siteSensitive", "siteProvider", "siteTarget", "siteReading"]) {
    if (!fields[id].hasAttribute("aria-busy")) fields[id].disabled = !hostname || Boolean(tab?.incognito);
  }
  fields.privateNotice.hidden = !tab?.incognito;
}
function renderSiteProfile() {
  const profile = siteProfileForHost(hostname, settings) || {};
  fields.siteTitle.textContent = hostname || message("thisWebsite");
  fields.siteProvider.value = profile.providerMode || "auto";
  fields.siteTarget.value = profile.targetLanguage || targetLanguageForHost(hostname, settings);
  fields.siteReading.value = profile.readingMode || settings.readingMode;
  fields.siteAutomatic.checked = profile.automatic === true;
  fields.siteSensitive.checked = profile.sensitivePageMode === "allow";
  siteDirty = false;
}
async function renderReadiness(version) {
  if (!inspection || ["unsupported", "translating", "translated"].includes(inspection.status)) { fields.readiness.hidden = true; return; }
  const next = await providerReadiness(settings, localState, hostname, inspection.language, inspection.targetLanguage || settings.targetLanguage);
  if (!sameContext(version)) return;
  readiness = next;
  fields.readiness.hidden = !next.action;
  fields.readinessText.textContent = next.text;
  fields.readinessAction.textContent = message(next.action === "permission" ? "grantProviderAccess" : next.action === "setup" ? "completeSetup" : "settingsPrivacy");
}
async function inspect(version = contextVersion) {
  clearTimeout(pollTimer);
  if (!tab?.id) { updateButtons(); return; }
  const next = await send({ type: "inspect-tab", tabId: tab.id });
  if (!sameContext(version)) return;
  inspection = next;
  // The background has the authoritative URL when activeTab permits inspection.
  if (next.hostname && next.hostname !== hostname) { hostname = next.hostname; renderSiteProfile(); }
  const state = next.pageState || {};
  const labels = {
    translated: [message("pageTranslated"), message("sectionsTranslated", [String(state.translatedSections || 0)]), "ready"],
    translating: [message("translationProgress"), `${state.translatedSections || 0} / ${state.totalSections || "…"}`, ""],
    "translation-error": [message("needsAttention"), state.error || message("retryTranslation"), "error"],
    unsupported: [message("protectedPage"), message("openWebsite"), "paused"],
    "consent-required": [message("setupRequired"), message("completeSetup"), "paused"],
    "excluded-site": [message("siteExcluded"), hostname, "paused"],
    "excluded-language": [message("languageExcluded"), next.language || "", "paused"],
    "sensitive-page": [message("privateSafeguard"), message("manualAvailable"), "paused"],
    "already-target": [message("alreadyTarget"), next.targetLanguage || "", "ready"]
  };
  setStatus(...(labels[next.status] || [message("readyToTranslate"), `${next.language || "Auto"} → ${next.targetLanguage || settings.targetLanguage}`, "ready"]));
  fields.targetLanguage.value = next.targetLanguage || settings.targetLanguage;
  fields.readingMode.value = state.readingMode || next.readingMode || readingModeForHost(hostname, settings);
  updateButtons(); renderRoute(state);
  await refreshFavourite();
  if (!sameContext(version)) return;
  if (next.status === "translating") pollTimer = setTimeout(() => inspect(version).catch(report), 900);
  else await renderReadiness(version);
}
async function loadHistory(version = contextVersion) {
  if (!tab?.id) return;
  const response = await send({ type: "get-recent-translations", tabId: tab.id });
  if (!sameContext(version)) return;
  fields.history.replaceChildren();
  const items = response.translations || [];
  if (!items.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = message("noRecentTranslations"); fields.history.append(p); }
  for (const item of items) {
    const article = document.createElement("article"), meta = document.createElement("small"), value = document.createElement("p");
    meta.textContent = `${item.kind || "text"} · ${item.engine || ""}`;
    value.dir = "auto"; value.textContent = item.translated;
    article.append(meta, value); fields.history.append(article);
  }
}
async function refreshContext() {
  const request = ++queryVersion;
  const [next] = await chrome.tabs.query({ active: true, windowId });
  if (request !== queryVersion) return;
  const changed = next?.id !== tab?.id || next?.url !== tab?.url;
  if (changed) {
    contextVersion++; clearTimeout(pollTimer); tab = next; hostname = hostnameFromUrl(next?.url || ""); inspection = undefined;
    readiness = undefined; fields.readiness.hidden = true; resultText = "";
    fields.workspaceResult.textContent = message("resultPlaceholder"); renderRoute();
  }
  const version = contextVersion;
  const loaded = await Promise.all([loadSettings(), loadLocalState()]);
  if (!sameContext(version)) return;
  [settings, localState] = loaded;
  if (changed || !siteDirty) renderSiteProfile();
  updateButtons();
  if (!tab?.id) { setStatus(message("protectedPage"), message("openWebsite")); return; }
  await Promise.all([inspect(version), loadHistory(version)]);
}
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refreshContext().catch(report), 80); }
function control(id, operation) {
  fields[id].addEventListener("click", () => {
    const version = contextVersion;
    runControl(fields[id], () => operation(version), (error) => { if (sameContext(version)) report(error); }, updateButtons);
  });
}
async function patchSettings(update) {
  settings = await saveSettings({ ...await loadSettings(), ...update });
  await send({ type: "refresh-settings" });
}
control("translatePage", async (version) => {
  const target = tab?.id;
  if (!target) return;
  if (inspection?.status === "consent-required") { await send({ type: "open-onboarding" }); return; }
  const cancelling = inspection?.status === "translating";
  if (!cancelling && !await ensureProviderAccess(settings, localState, hostname)) throw new Error(message("providerPermissionRequired"));
  if (!sameContext(version)) return;
  if (!cancelling) {
    inspection = { ...inspection, status: "translating" }; updateButtons();
    setStatus(message("translationProgress"), message("translating"));
    pollTimer = setTimeout(() => inspect(version).catch(report), 900);
  }
  const response = await send({ type: cancelling ? "cancel-tab-translation" : "translate-now", tabId: target });
  if (!sameContext(version)) return;
  await inspect(version);
  if (response.message && !["translated", "cancelled"].includes(response.status)) setStatus(message("needsAttention"), response.message, "error");
});
control("cancelPage", async (version) => { await send({ type: "cancel-tab-translation", tabId: tab.id }); if (sameContext(version)) await inspect(version); });
control("restorePage", async (version) => { await send({ type: "restore-page", tabId: tab.id }); if (sameContext(version)) await inspect(version); });
for (const [id, setting] of [["readingMode", "readingMode"], ["targetLanguage", "targetLanguage"]]) fields[id].addEventListener("change", async () => {
  const version = contextVersion, target = tab?.id, value = fields[id].value;
  try {
    await patchSettings({ [setting]: value });
    if (setting === "readingMode" && target) await send({ type: "set-reading-mode", tabId: target, readingMode: value });
    if (sameContext(version)) await inspect(version);
  } catch (error) { if (sameContext(version)) report(error); }
});
control("translateText", async (version) => {
  const target = tab?.id, text = fields.workspaceText.value;
  if (!target || !text.trim()) throw new Error(message("enterText"));
  if (!await ensureProviderAccess(settings, localState, hostname)) throw new Error(message("providerPermissionRequired"));
  if (!sameContext(version)) return;
  resultText = ""; updateButtons(); fields.workspaceResult.textContent = message("translating");
  try {
    const response = await send({ type: "translate-panel-text", tabId: target, text, targetLanguage: fields.targetLanguage.value });
    if (!sameContext(version)) return;
    if (response.status !== "ok") throw new Error(response.message || message("needsAttention"));
    resultText = response.translated; fields.workspaceResult.textContent = resultText; renderRoute(response); await loadHistory(version);
  } catch (error) { if (sameContext(version)) fields.workspaceResult.textContent = error.message; throw error; }
});
control("copyResult", async () => { if (resultText) await navigator.clipboard.writeText(resultText); });
for (const id of ["siteProvider", "siteTarget", "siteReading", "siteAutomatic", "siteSensitive"]) fields[id].addEventListener("change", () => { siteDirty = true; });
control("saveSite", async (version) => {
  if (!hostname || tab?.incognito) return;
  const host = hostname, chosenProvider = fields.siteProvider.value;
  const profile = { targetLanguage: fields.siteTarget.value, providerMode: chosenProvider, readingMode: fields.siteReading.value, automatic: fields.siteAutomatic.checked, sensitivePageMode: fields.siteSensitive.checked ? "allow" : "inherit" };
  const routes = providerRoutes({ ...settings, siteProfiles: { ...settings.siteProfiles, [host]: profile } }, localState, host);
  const selected = routes.find((route) => route.provider === chosenProvider);
  if (selected && (!selected.consented || !selected.configured)) throw new Error(message("providerSetupRequired"));
  const origins = [...new Set(routes.filter((route) => route.consented && route.configured).flatMap((route) => route.origins).concat(profile.automatic ? hostPermissionPatterns(host) : []))];
  if (origins.length && !await chrome.permissions.contains({ origins }) && !await chrome.permissions.request({ origins })) throw new Error(message("providerPermissionRequired"));
  if (!sameContext(version)) return;
  const current = await loadSettings();
  await patchSettings({ siteProfiles: { ...current.siteProfiles, [host]: profile } });
  if (sameContext(version)) { siteDirty = false; setStatus(message("profileSaved"), host, "ready"); }
});
control("resetSite", async (version) => {
  if (!hostname || tab?.incognito) return;
  const host = hostname, current = await loadSettings(), siteProfiles = { ...current.siteProfiles };
  delete siteProfiles[host]; await patchSettings({ siteProfiles });
  if (sameContext(version)) { renderSiteProfile(); await inspect(version); }
});
control("preparePack", async () => {
  const pair = { sourceLanguage: fields.packSource.value, targetLanguage: fields.packTarget.value };
  fields.packStatus.textContent = message("checkingSupport");
  try {
    const availability = await send({ type: "get-on-device-availability", ...pair });
    if (["unsupported", "unavailable"].includes(availability.availability)) { fields.packStatus.textContent = message("pairUnavailable"); return; }
    fields.packStatus.textContent = message("preparingPair");
    const response = await send({ type: "download-on-device-language-pack", ...pair });
    fields.packStatus.textContent = response.status === "ok" ? message("pairReady") : response.message || message("pairUnavailable");
  } catch (error) { fields.packStatus.textContent = error.message; throw error; }
});
control("refreshHistory", loadHistory);
control("readinessAction", async (version) => {
  if (readiness?.action === "setup") await send({ type: "open-onboarding" });
  else if (readiness?.action === "permission") { await ensureProviderAccess(settings, localState, hostname); if (sameContext(version)) await inspect(version); }
  else await chrome.runtime.openOptionsPage();
});
control("openSettings", () => chrome.runtime.openOptionsPage());
const refreshFavourite = attachFavourite(fields.targetLanguage, fields.favouriteLanguage);
for (const field of [fields.targetLanguage, fields.siteTarget, fields.packSource, fields.packTarget]) fillLanguages(field);
fields.packSource.value = "es";
fields.version.textContent = `v${chrome.runtime.getManifest().version}`;
chrome.tabs.onActivated.addListener((info) => { if (info.windowId === windowId) scheduleRefresh(); });
chrome.tabs.onUpdated.addListener((id, change) => { if (id === tab?.id && (change.url || change.status === "complete")) scheduleRefresh(); });
chrome.tabs.onRemoved.addListener((id) => { if (id === tab?.id) scheduleRefresh(); });
chrome.storage.onChanged.addListener(scheduleRefresh);
chrome.permissions.onAdded.addListener(scheduleRefresh);
chrome.permissions.onRemoved.addListener(scheduleRefresh);
window.addEventListener("unload", () => { clearTimeout(pollTimer); clearTimeout(refreshTimer); });
try { windowId = (await chrome.windows.getCurrent()).id; await refreshContext(); fields.packTarget.value = settings.targetLanguage; }
catch (error) { report(error); updateButtons(); }
