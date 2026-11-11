#!/usr/bin/env node
// Writes Vanguard's artwork (scripts/lib/media-sources.mjs) to Media/ as TGA.
//
//   node scripts/build-media.mjs          write every file, and delete images no source makes any more
//   node scripts/build-media.mjs --check  fail if a committed file is missing, out of date, left over or unlisted

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tga } from "./lib/media-art.mjs";
import { FIXED_MEDIA, MEDIA } from "./lib/media-sources.mjs";

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

// Every file under a Media folder at any depth, as repo paths (dot files such as .DS_Store are not counted).
function mediaOnDisk(dir) {
  const names = fs.readdirSync(dir, { recursive: true });
  return names.filter((n) => fs.statSync(path.join(dir, n)).isFile() && !path.basename(n).startsWith(".")).map((n) => `Media/${n.split(path.sep).join("/")}`);
}

// The TGA images under Media/ that no source makes (a source removed from media-sources.mjs).
export function orphanMedia(dir = path.join(root, "Media")) {
  const made = new Set(mediaFiles().map(({ file }) => file));
  return mediaOnDisk(dir).filter((file) => file.toLowerCase().endsWith(".tga") && !made.has(file));
}

// The files under Media/ that are neither a generated image nor named in FIXED_MEDIA. Reported, never deleted:
// the packager ships whatever git lists there, so one of these would reach players unnoticed.
export function unlistedMedia(dir = path.join(root, "Media")) {
  const fixed = new Set(FIXED_MEDIA);
  return mediaOnDisk(dir).filter((file) => !file.toLowerCase().endsWith(".tga") && !fixed.has(file));
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
  const stale = staleMedia(), orphans = orphanMedia(), unlisted = unlistedMedia();
  for (const { file } of stale) console.error(`out of date: ${file} (run node scripts/build-media.mjs)`);
  for (const file of orphans) console.error(`no source makes ${file} (run node scripts/build-media.mjs to delete it)`);
  for (const file of unlisted) console.error(`${file} is not made by a source and not in FIXED_MEDIA (scripts/lib/media-sources.mjs): list it there or remove it`);
  if (stale.length || orphans.length || unlisted.length) process.exit(1);
  console.log(`OK  ${Object.keys(MEDIA).length} media files match their sources`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) check();
  else writeAll();
}
