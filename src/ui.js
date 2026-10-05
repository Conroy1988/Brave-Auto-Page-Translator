import { SUPPORTED_LANGUAGES, hasCurrentConsent, hasProviderConsent, loadSettings, saveSettings } from "./settings.js";
import { providerModeForHost, providerPermissionPatterns } from "./translation.js";
import { message } from "./i18n.js";

export async function runControl(button, operation, onError = () => {}, after = () => {}) {
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try { return await operation(); }
  catch (error) { onError(error); }
  finally { button.disabled = false; button.removeAttribute("aria-busy"); after(); }
}

export function requireResponse(response) {
  if (!response || response.status === "error") throw new Error(response?.message || message("connectionError"));
  return response;
}

export function fillLanguages(select, favourites = []) {
  const selected = select.value;
  const favouriteSet = new Set(favourites);
  const names = new Intl.DisplayNames([chrome.i18n.getUILanguage?.() || "en"], { type: "language" });
  select.replaceChildren();
  for (const [code, label] of [...SUPPORTED_LANGUAGES].sort((a, b) => Number(favouriteSet.has(b[0])) - Number(favouriteSet.has(a[0])))) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${favouriteSet.has(code) ? "★ " : ""}${names.of(code) || label}`;
    select.append(option);
  }
  if (selected) select.value = selected;
}

export function attachFavourite(select, button) {
  async function render() {
    const settings = await loadSettings();
    fillLanguages(select, settings.favouriteLanguages);
    const chosen = settings.favouriteLanguages.includes(select.value);
    button.setAttribute("aria-pressed", String(chosen));
    button.textContent = chosen ? "★" : "☆";
    button.setAttribute("aria-label", message(chosen ? "removeFavourite" : "addFavourite"));
    button.title = button.getAttribute("aria-label");
  }
  button.addEventListener("click", () => runControl(button, async () => {
    const settings = await loadSettings();
    const favouriteLanguages = settings.favouriteLanguages.includes(select.value)
      ? settings.favouriteLanguages.filter((code) => code !== select.value)
      : [...settings.favouriteLanguages, select.value];
    await saveSettings({ ...settings, favouriteLanguages });
    await render();
  }, (error) => { button.title = error.message; }));
  select.addEventListener("change", () => void render());
  return render;
}

export function providerRoutes(settings, localState, hostname = "") {
  const mode = providerModeForHost(hostname, settings);
  const configured = [];
  if (localState.googleCloudApiKey) configured.push("google-cloud");
  if (localState.libreTranslateEndpoint) configured.push("libretranslate");
  if (localState.deepLApiKey) configured.push("deepl");
  if (settings.allowGoogleWebFallback) configured.push("google-web");
  const candidates = mode === "auto" ? ["on-device", ...configured] : [mode, ...(settings.allowGoogleWebFallback && mode !== "google-web" ? ["google-web"] : [])];
  return [...new Set(candidates)].map((provider) => {
    const consented = provider === "on-device" || hasProviderConsent(localState, provider);
    const ready = provider === "on-device" || provider === "google-web" || configured.includes(provider);
    const origins = providerPermissionPatterns(provider, { deepLApiPlan: settings.deepLApiPlan });
    if (provider === "libretranslate" && localState.libreTranslateEndpoint) {
      try { const url = new URL(localState.libreTranslateEndpoint); origins.push(`${url.protocol}//${url.host}/*`); } catch { /* configuration is reported below */ }
    }
    return { provider, consented, configured: ready, origins };
  });
}

// Inspection never sends page text or requests permissions. Only the user's action can request access.
export async function providerReadiness(settings, localState, hostname, sourceLanguage, targetLanguage) {
  if (!hasCurrentConsent(localState)) return { action: "setup", text: message("setupRequired") };
  const routes = providerRoutes(settings, localState, hostname);
  if (providerModeForHost(hostname, settings) !== "auto" && routes[0]?.provider !== "on-device" && (!routes[0]?.consented || !routes[0]?.configured)) return { action: "settings", text: message("providerSetupRequired") };
  for (const route of routes) {
    if (!route.consented || !route.configured || route.provider === "on-device") continue;
    if (await chrome.permissions.contains({ origins: route.origins })) return { action: "", text: "" };
  }
  if (routes.some((route) => route.provider === "on-device")) {
    const source = sourceLanguage && !["auto", "und"].includes(sourceLanguage) ? sourceLanguage : targetLanguage === "en" ? "es" : "en";
    const availability = requireResponse(await chrome.runtime.sendMessage({ type: "get-on-device-availability", sourceLanguage: source, targetLanguage }));
    if (["available", "downloadable", "downloading"].includes(availability.availability)) return { action: "", text: "" };
  }
  if (routes.some((route) => route.consented && route.configured && route.provider !== "on-device")) return { action: "permission", text: message("providerPermissionRequired") };
  return { action: "settings", text: message("providerSetupRequired") };
}

export async function ensureProviderAccess(settings, localState, hostname) {
  const routes = providerRoutes(settings, localState, hostname).filter((route) => route.provider !== "on-device" && route.consented && route.configured);
  const origins = [...new Set(routes.flatMap((route) => route.origins))];
  if (!origins.length || await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}
