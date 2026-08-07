import { readFileSync } from "node:fs";
import path from "node:path";
import { readZipEntries } from "./zip-utils.mjs";

const root = path.resolve(import.meta.dirname, "..");
const expectedManifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const archive = path.resolve(root, process.argv[2] || `dist/brave-auto-page-translator-${expectedManifest.version}.zip`);
const failures = [];
const files = readZipEntries(archive);
const entries = [...files.keys()];

if (!entries.includes("manifest.json")) failures.push("manifest.json is not at the ZIP root");
if (entries.some((entry) => entry.startsWith("/") || entry.includes("../") || entry.includes("\\"))) failures.push("archive contains an unsafe path");
if (entries.some((entry) => /(^|\/)(?:node_modules|dist|test-results|playwright-report|\.git)(?:\/|$)/.test(entry))) failures.push("archive contains development-only files");
if (entries.some((entry) => /(^|\/)(?:\.env|package-lock\.json|package\.json)$/.test(entry))) failures.push("archive contains an unnecessary development or secret file");

const packagedManifest = JSON.parse(files.get("manifest.json")?.toString("utf8") || "null");
if (packagedManifest?.version !== expectedManifest.version) failures.push("packaged manifest version does not match the source manifest");
if (packagedManifest?.manifest_version !== 3) failures.push("packaged extension is not Manifest V3");

for (const entry of entries.filter((value) => /\.(?:js|mjs|html|json|md)$/i.test(value))) {
  const source = files.get(entry).toString("utf8");
  if (/\b(?:eval|Function)\s*\(/.test(source)) failures.push(`${entry} uses dynamic code execution`);
  if (/<script\b[^>]*\bsrc=["']https?:\/\//i.test(source)) failures.push(`${entry} loads remote executable code`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) failures.push(`${entry} appears to contain a private key`);
  if (/\bAIza[0-9A-Za-z_-]{30,}\b/.test(source)) failures.push(`${entry} appears to contain a Google API key`);
  if (/\b(?:sk|key)[-_](?:live|prod)[-_][0-9A-Za-z]{16,}\b/i.test(source)) failures.push(`${entry} appears to contain a production secret`);
}

if (failures.length) {
  console.error(`Package verification failed:\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}

console.log(`Verified ${path.relative(root, archive)}: ${entries.length} files, MV3 ${packagedManifest.version}, no development files, remote code, or recognized secrets.`);

