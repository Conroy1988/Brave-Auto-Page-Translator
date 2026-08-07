import { inflateRawSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function findEndOfCentralDirectory(archive) {
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found.");
}

export function readZipEntries(filename) {
  const archive = readFileSync(filename);
  const end = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(end + 10);
  let centralOffset = archive.readUInt32LE(end + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("Invalid ZIP central-directory entry.");
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP entry for ${name}.`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
    if (data.length !== uncompressedSize) throw new Error(`ZIP size mismatch for ${name}.`);
    entries.set(name, data);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function extractZip(filename, target) {
  for (const [name, data] of readZipEntries(filename)) {
    if (!name || name.startsWith("/") || name.includes("../") || name.includes("\\")) throw new Error(`Unsafe ZIP path: ${name}`);
    const destination = path.join(target, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, data);
  }
}

