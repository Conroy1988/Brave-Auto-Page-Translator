import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, ".e2e-extension");
const entries = ["src", "popup", "options", "onboarding", "offscreen", "_locales", "icons"];

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const entry of entries) cpSync(path.join(root, entry), path.join(target, entry), { recursive: true });

const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
manifest.host_permissions = [...new Set([
  ...(manifest.host_permissions || []),
  "http://*/*",
  "https://*/*"
])];
manifest.optional_host_permissions = [];
writeFileSync(path.join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Prepared an isolated test build with fixture-only website access.");
