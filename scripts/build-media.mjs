#!/usr/bin/env node
// Writes Vanguard's artwork (scripts/lib/media-sources.mjs) to Media/ as TGA.
//
//   node scripts/build-media.mjs          write every file
//   node scripts/build-media.mjs --check  fail if a committed file is missing or out of date

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tga } from "./lib/media-art.mjs";
import { MEDIA } from "./lib/media-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every generated file as { file (repo path), bytes }.
export function mediaFiles() {
  return Object.entries(MEDIA).map(([rel, make]) => ({ file: `Media/${rel}`, bytes: tga(make()) }));
}

// The files whose committed bytes differ from what the sources make.
export function staleMedia() {
  return mediaFiles().filter(({ file, bytes }) => {
    const full = path.join(root, file);
    return !fs.existsSync(full) || !fs.readFileSync(full).equals(bytes);
  });
}

// Writes every file.
function writeAll() {
  for (const { file, bytes } of mediaFiles()) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  }
  console.log(`wrote ${Object.keys(MEDIA).length} files to Media/`);
}

// Fails (exit 1) listing any stale file.
function check() {
  const stale = staleMedia();
  for (const { file } of stale) console.error(`out of date: ${file} (run node scripts/build-media.mjs)`);
  if (stale.length) process.exit(1);
  console.log(`OK  ${Object.keys(MEDIA).length} media files match their sources`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) check();
  else writeAll();
}
