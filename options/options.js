import { DEFAULT_SETTINGS, SUPPORTED_LANGUAGES, loadSettings, saveSettings } from "../src/settings.js";

const form = document.querySelector("#settingsForm");
const fields = {
  enabled: document.querySelector("#enabled"),
  targetLanguage: document.querySelector("#targetLanguage"),
  excludedLanguages: document.querySelector("#excludedLanguages"),
  excludedHosts: document.querySelector("#excludedHosts"),
  translateDynamicContent: document.querySelector("#translateDynamicContent"),
  showPageControl: document.querySelector("#showPageControl"),
  showBadge: document.querySelector("#showBadge"),
  reset: document.querySelector("#reset"),
  saveStatus: document.querySelector("#saveStatus")
};

let statusTimer;

function showStatus(message) {
  clearTimeout(statusTimer);
  fields.saveStatus.textContent = message;
  statusTimer = setTimeout(() => { fields.saveStatus.textContent = ""; }, 3000);
}

function render(settings) {
  fields.enabled.checked = settings.enabled;
  fields.targetLanguage.value = settings.targetLanguage;
  fields.excludedLanguages.value = settings.excludedLanguages.join(", ");
  fields.excludedHosts.value = settings.excludedHosts.join("\n");
  fields.translateDynamicContent.checked = settings.translateDynamicContent;
  fields.showPageControl.checked = settings.showPageControl;
  fields.showBadge.checked = settings.showBadge;
}

function collect() {
  return {
    enabled: fields.enabled.checked,
    targetLanguage: fields.targetLanguage.value,
    excludedLanguages: fields.excludedLanguages.value.split(","),
    excludedHosts: fields.excludedHosts.value.split(/\r?\n/),
    translateDynamicContent: fields.translateDynamicContent.checked,
    showPageControl: fields.showPageControl.checked,
    showBadge: fields.showBadge.checked
  };
}

for (const [code, label] of SUPPORTED_LANGUAGES) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = label;
  fields.targetLanguage.append(option);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = await saveSettings(collect());
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  render(settings);
  showStatus("Settings saved");
});

fields.reset.addEventListener("click", async () => {
  const settings = await saveSettings(DEFAULT_SETTINGS);
  await chrome.runtime.sendMessage({ type: "refresh-settings" });
  render(settings);
  showStatus("Defaults restored");
});

loadSettings().then(render).catch((error) => showStatus(error.message));
