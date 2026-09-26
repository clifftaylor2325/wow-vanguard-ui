#!/usr/bin/env node
// Build the release zip: dist/ForeverUI-<version>.zip holding a
// ForeverUI/ folder with the TOC, every file it loads, and LICENSE.
//
//   node scripts/package.mjs [--ref HEAD] [--out dist]
//
// Files come from git at --ref, not the working tree, so a locally pulled
// HubCache.lua or an uncommitted edit never ships.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// No npm dependencies: packaging runs without npm ci.
const ADDON = "ForeverUI";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The value after --name, or the fallback.
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const ref = arg("ref", "HEAD");
const outDir = path.resolve(arg("out", path.join(root, "dist")));

// Runs git in the repo root; `show` reads a file as of the ref.
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 64 << 20 });
const show = (file) => git("show", `${ref}:${file}`);

const tocName = `${ADDON}.toc`;
const toc = show(tocName).toString("utf8");
const version = toc.match(/^## Version:\s*(\S+)/m)?.[1];
if (!version) throw new Error(`${tocName} has no ## Version`);
const loaded = toc
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const files = [tocName, ...loaded, "LICENSE"];

// Minimal ZIP writer (deflate, no extras). Timestamps are the commit time so
// the same commit always builds the same bytes.
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
// A date as ZIP (MS-DOS) time and day fields, in UTC.
function dosTime(date) {
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

const commitTime = new Date(Number(git("log", "-1", "--format=%ct", ref).toString().trim()) * 1000);
const { time, day } = dosTime(commitTime);
const locals = [];
const centrals = [];
let offset = 0;
for (const file of files) {
  const data = show(file);
  const name = Buffer.from(`${ADDON}/${file}`, "utf8");
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, `${ADDON}-${version}.zip`);
fs.writeFileSync(zipPath, Buffer.concat([...locals, ...centrals, end]));
console.log(`${path.relative(process.cwd(), zipPath)}  (${files.length} files, version ${version}, ${ref})`);
