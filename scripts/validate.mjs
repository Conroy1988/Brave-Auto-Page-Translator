import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];
const requiredFiles = [
  "manifest.json",
  "src/background.js",
  "src/content.js",
  "src/provider.js",
  "src/settings.js",
  "src/translation.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "options/options.html",
  "options/options.css",
  "options/options.js",
  "onboarding/onboarding.html",
  "onboarding/onboarding.css",
  "onboarding/onboarding.js",
  "offscreen/offscreen.html",
  "offscreen/offscreen.js",
  "_locales/en/messages.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "PRIVACY.md",
  "SECURITY.md",
  "SUPPORT.md",
  "LICENSE"
];

if (manifest.manifest_version !== 3) failures.push("manifest_version must be 3");
if (manifest.version !== packageJson.version) failures.push("manifest and package versions do not match");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) failures.push("version must use x.y.z format");
if (manifest.default_locale !== "en") failures.push("default_locale must be en");
if (manifest.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'none'") failures.push("extension pages must use the strict packaged-code content security policy");
if (manifest.content_scripts?.length) failures.push("website scripts must be registered dynamically after consent");

const requiredPermissions = ["activeTab", "contextMenus", "offscreen", "scripting", "storage"];
for (const permission of requiredPermissions) {
  if (!manifest.permissions?.includes(permission)) failures.push(`missing required permission: ${permission}`);
}
for (const excessive of ["tabs", "webRequest", "webRequestBlocking", "cookies", "history", "downloads"]) {
  if (manifest.permissions?.includes(excessive)) failures.push(`unnecessary privileged permission present: ${excessive}`);
}
for (const broadPattern of ["<all_urls>", "http://*/*", "https://*/*"]) {
  if (manifest.host_permissions?.includes(broadPattern)) failures.push(`broad website access must be optional: ${broadPattern}`);
}
for (const pattern of ["http://*/*", "https://*/*"]) {
  if (!manifest.optional_host_permissions?.includes(pattern)) failures.push(`missing optional website permission: ${pattern}`);
}
for (const providerHost of [
  "https://translate.googleapis.com/*",
  "https://translate.google.com/*",
  "https://translation.googleapis.com/*"
]) {
  if (manifest.host_permissions?.includes(providerHost)) failures.push(`provider access must be optional: ${providerHost}`);
}

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) failures.push(`missing required file: ${file}`);
}

const ignoredDirectories = new Set([".git", ".e2e-extension", "coverage", "dist", "node_modules", "playwright-report", "store-assets", "test-results"]);
function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return [];
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}

const sourceFiles = walk(root).filter((file) => /\.(?:html|js|mjs)$/.test(file));
for (const file of sourceFiles.filter((file) => /\.(?:js|mjs)$/.test(file))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}: ${result.stderr.trim()}`);
}

for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (/\b(?:eval|Function)\s*\(/.test(source)) failures.push(`${relative} uses dynamic code execution`);
  if (/<script\b[^>]*\bsrc=["']https?:\/\//i.test(source)) failures.push(`${relative} loads remote executable code`);
}

const backgroundSource = readFileSync(path.join(root, "src/background.js"), "utf8");
const onboardingSource = readFileSync(path.join(root, "onboarding/onboarding.js"), "utf8");
const settingsSource = readFileSync(path.join(root, "src/settings.js"), "utf8");
if (!backgroundSource.includes("hasCurrentConsent")) failures.push("background translation must enforce current privacy consent");
if (!backgroundSource.includes("registerContentScripts")) failures.push("automatic translation must use dynamic content-script registration");
if (!onboardingSource.includes("privacyConsentVersion")) failures.push("onboarding must record versioned privacy consent");
if (!settingsSource.includes("chrome.storage.local")) failures.push("provider credentials must be kept in local extension storage");
if (/chrome\.tabs\.(?:update|create)\s*\([^)]*translate\.google/i.test(backgroundSource)) {
  failures.push("translation must not navigate the user away from the original page");
}

for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
  const file = path.join(root, iconPath);
  if (!existsSync(file)) continue;
  const icon = readFileSync(file);
  const expected = Number(size);
  if (icon.toString("hex", 0, 8) !== "89504e470d0a1a0a") failures.push(`${iconPath} is not a PNG`);
  if (icon.readUInt32BE(16) !== expected || icon.readUInt32BE(20) !== expected) failures.push(`${iconPath} dimensions do not match ${size}x${size}`);
}

if (failures.length) {
  console.error(`Validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Manifest V${manifest.manifest_version} ${manifest.version} passed ${requiredFiles.length} file and policy checks.`);
