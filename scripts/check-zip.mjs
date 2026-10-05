#!/usr/bin/env node
// Checks a release zip from scripts/package.mjs: every entry inflates to
// bytes matching its CRC, and the entry list is exactly what the zip must
// hold (the TOC and every file it loads, Media/, the libraries' license
// files and LICENSE, under <Addon>/). Missing and extra names are printed
// and fail the run. Pure Node, so it runs on any CI runner.
//
//   node scripts/check-zip.mjs [--zip dist/<Addon>-<version>.zip] [--ref HEAD]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The value after --name, or the fallback.
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// Runs git in the repo root and returns its output as text lines.
function gitLines(...args) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 64 << 20 }).toString("utf8").split("\n").filter(Boolean);
}

// The addon's name: the one .toc file in the repo root.
export function addonName() {
  return fs.readdirSync(root).find((f) => f.endsWith(".toc")).replace(/\.toc$/, "");
}

// The names the zip must hold, as git has them at `ref`, in zip order.
export function expectedEntries(ref = "HEAD") {
  const addon = addonName();
  const toc = `${addon}.toc`;
  const loaded = gitLines("show", `${ref}:${toc}`).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const media = gitLines("ls-tree", "-r", "--name-only", ref, "Media");
  const libLicenses = gitLines("ls-tree", "-r", "--name-only", ref, "Libs").filter((f) => !f.endsWith(".lua"));
  return [toc, ...loaded, ...media, ...libLicenses, "LICENSE"].map((f) => `${addon}/${f}`);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

// CRC-32 of a buffer, as ZIP stores it.
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// The offset of the end-of-central-directory record (no comment is written, so it is the last 22 bytes).
function endRecord(zip) {
  const at = zip.length - 22;
  if (at < 0 || zip.readUInt32LE(at) !== 0x06054b50) throw new Error("not a zip from scripts/package.mjs (no end record)");
  return { count: zip.readUInt16LE(at + 10), start: zip.readUInt32LE(at + 16) };
}

// One central-directory entry at `at`: its name, CRC, sizes and local header offset, plus where the next entry starts.
function centralEntry(zip, at) {
  if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`bad central directory entry at ${at}`);
  const nameLength = zip.readUInt16LE(at + 28);
  const extra = zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
  const entry = { name, crc: zip.readUInt32LE(at + 16), packed: zip.readUInt32LE(at + 20), size: zip.readUInt32LE(at + 24), local: zip.readUInt32LE(at + 42) };
  return { entry, next: at + 46 + nameLength + extra };
}

// Inflates an entry's packed bytes; damaged data names the entry.
function inflate(zip, entry, dataAt) {
  try {
    return zlib.inflateRawSync(zip.subarray(dataAt, dataAt + entry.packed));
  } catch (err) {
    throw new Error(`${entry.name}: data is damaged (${err.message})`);
  }
}

// Inflates an entry's data from its local header and checks the CRC and size.
function checkEntry(zip, entry) {
  if (zip.readUInt32LE(entry.local) !== 0x04034b50) throw new Error(`${entry.name}: bad local header`);
  const dataAt = entry.local + 30 + zip.readUInt16LE(entry.local + 26) + zip.readUInt16LE(entry.local + 28);
  const data = inflate(zip, entry, dataAt);
  if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(`${entry.name}: data does not match its CRC`);
}

// Every entry name in a zip buffer, in central-directory order, each checked against its CRC.
export function zipEntries(zip) {
  const { count, start } = endRecord(zip);
  const names = [];
  let at = start;
  for (let i = 0; i < count; i++) {
    const { entry, next } = centralEntry(zip, at);
    checkEntry(zip, entry);
    names.push(entry.name);
    at = next;
  }
  return names;
}

// The names in `actual` but not `expected`, and the other way round.
export function compareEntries(actual, expected) {
  const have = new Set(actual);
  const want = new Set(expected);
  return { missing: expected.filter((n) => !have.has(n)), extra: actual.filter((n) => !want.has(n)) };
}

// The one zip in dist/, or the --zip argument.
function zipPath() {
  const given = arg("zip", null);
  if (given) return path.resolve(given);
  const dist = path.join(root, "dist");
  const zips = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => f.endsWith(".zip")) : [];
  if (zips.length !== 1) throw new Error(`expected one zip in dist/, found ${zips.length}`);
  return path.join(dist, zips[0]);
}

// Checks the zip and prints the result; exit code 1 on any difference.
function main() {
  const file = zipPath();
  const actual = zipEntries(fs.readFileSync(file));
  const { missing, extra } = compareEntries(actual, expectedEntries(arg("ref", "HEAD")));
  for (const name of missing) console.error(`missing: ${name}`);
  for (const name of extra) console.error(`extra:   ${name}`);
  console.log(`${path.relative(process.cwd(), file)}: ${actual.length} entries, all match their CRC${missing.length || extra.length ? "" : ", and the list is complete"}`);
  if (missing.length || extra.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
