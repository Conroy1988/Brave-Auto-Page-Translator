import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const archives = readdirSync(dist).filter((name) => name.endsWith(".zip")).sort();
if (!archives.length) throw new Error("No extension ZIP was found in dist/. Run npm run package first.");
const lines = archives.map((name) => `${createHash("sha256").update(readFileSync(path.join(dist, name))).digest("hex")}  ${name}`);
writeFileSync(path.join(dist, "SHA256SUMS"), `${lines.join("\n")}\n`);
console.log(`Created dist/SHA256SUMS for ${archives.length} extension package(s).`);
