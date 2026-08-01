import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

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
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "PRIVACY.md",
  "LICENSE"
];

const failures = [];
if (manifest.manifest_version !== 3) failures.push("manifest_version must be 3");
if (manifest.version !== packageJson.version) failures.push("manifest and package versions do not match");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) failures.push("version must use x.y.z format");
if (manifest.host_permissions?.includes("<all_urls>")) failures.push("use explicit HTTP and HTTPS website patterns instead of <all_urls>");
for (const pattern of ["http://*/*", "https://*/*"]) {
  if (!manifest.host_permissions?.includes(pattern)) failures.push(`missing website permission: ${pattern}`);
}
const contentScript = manifest.content_scripts?.find((entry) => entry.js?.includes("src/content.js"));
if (!contentScript) failures.push("src/content.js must be registered as a content script");
if (contentScript && contentScript.all_frames !== true) failures.push("content translation must be enabled for frames");
for (const pattern of ["http://*/*", "https://*/*"]) {
  if (!contentScript?.matches?.includes(pattern)) failures.push(`content script is missing match pattern: ${pattern}`);
}

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) failures.push(`missing required file: ${file}`);
}

const backgroundSource = readFileSync(path.join(root, "src/background.js"), "utf8");
if (/chrome\.tabs\.(?:update|create)\s*\(/.test(backgroundSource)) {
  failures.push("translation must not navigate away from the original page");
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}

for (const file of walk(root).filter((file) => file.endsWith(".js") || file.endsWith(".mjs"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}: ${result.stderr.trim()}`);
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

console.log(`Manifest V${manifest.manifest_version} ${manifest.version} validated successfully.`);
