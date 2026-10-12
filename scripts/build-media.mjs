#!/usr/bin/env node
// Writes Vanguard's artwork (scripts/lib/media-sources.mjs) to Media/ as TGA.
//
//   node scripts/build-media.mjs          write every file, and delete images no source makes any more
//   node scripts/build-media.mjs --check  fail if a committed file is missing, out of date or left over

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

// The TGA images under Media/ that no source makes (a source removed from media-sources.mjs).
export function orphanMedia() {
  const made = new Set(mediaFiles().map(({ file }) => file));
  const dirs = fs.readdirSync(path.join(root, "Media")).filter((d) => fs.statSync(path.join(root, "Media", d)).isDirectory());
  const images = dirs.flatMap((d) => fs.readdirSync(path.join(root, "Media", d)).filter((f) => f.endsWith(".tga")).map((f) => `Media/${d}/${f}`));
  return images.filter((file) => !made.has(file));
}

// Writes every file and deletes the images no source makes.
function writeAll() {
  for (const { file, bytes } of mediaFiles()) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  }
  const orphans = orphanMedia();
  for (const file of orphans) fs.rmSync(path.join(root, file));
  console.log(`wrote ${Object.keys(MEDIA).length} files to Media/${orphans.length ? `, deleted ${orphans.join(", ")}` : ""}`);
}

// Fails (exit 1) listing any stale or left-over file.
function check() {
  const stale = staleMedia(), orphans = orphanMedia();
  for (const { file } of stale) console.error(`out of date: ${file} (run node scripts/build-media.mjs)`);
  for (const file of orphans) console.error(`no source makes ${file} (run node scripts/build-media.mjs to delete it)`);
  if (stale.length || orphans.length) process.exit(1);
  console.log(`OK  ${Object.keys(MEDIA).length} media files match their sources`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) check();
  else writeAll();
}
