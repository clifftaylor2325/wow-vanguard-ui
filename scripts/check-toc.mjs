#!/usr/bin/env node
// Checks Vanguard.toc against the files on disk and against .luacheckrc. It
// fails (exit 1) when:
//   - a .lua file under Core/, Modules/ or Locales/ is not listed in the TOC (an orphan:
//     the game never loads it, and neither do the test harness and the
//     coverage floor, which both walk the TOC);
//   - a file is listed twice;
//   - a ## SavedVariables or ## SavedVariablesPerCharacter name is missing
//     from `globals` in .luacheckrc;
//   - ## Interface lacks one of EXPECTED_INTERFACE, or ## Title or ## Version
//     is missing;
//   - a shared library (Libs/) is listed after one of the addon's own files;
//   - a file line carries a bracket directive other than AllowLoadGameType and
//     ExcludeLoadGameType (the harness models only those), or its game-type
//     tags keep it off every client the harness models (scripts/lib/toc.mjs).
// A listed file that is missing on disk, or has the wrong case, is caught by
// the luac5.1 -p step that opens every TOC path on Linux CI.
//
//   node scripts/check-toc.mjs [--root <folder>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CLIENT_GAME_TYPES, TAG_FIELDS, loadsOn, tocEntries } from "./lib/toc.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The Interface values the TOC must list: WoW Forever, then Retail 12.1.5 (the client the harness models as RETAIL_CLIENT).
export const EXPECTED_INTERFACE = ["16001", "120105"];
const ORPHAN_SCOPE = ["Core", "Modules", "Locales"];
const LIBS = "Libs/";
const SAVED_KEYS = ["SavedVariables", "SavedVariablesPerCharacter"];

// The TOC's metadata ({ key: value }) and its files ([{ path, line, allow, exclude, unknown }]), in
// order: each path as the game reads it (forward slashes, its game-type tags apart; scripts/lib/toc.mjs).
export function parseToc(text) {
  const meta = {};
  for (const raw of text.split("\n")) {
    const tag = /^##\s*([^:]+?)\s*:\s*(.*)$/.exec(raw.trim());
    if (tag) meta[tag[1]] = tag[2].trim();
  }
  return { meta, files: tocEntries(text) };
}

// The text of the `globals = { ... }` table in .luacheckrc (braces balanced), or "".
function globalsBlock(text) {
  const start = /^globals\s*=\s*\{/m.exec(text);
  if (!start) return "";
  let depth = 0;
  for (let i = start.index + start[0].length - 1; i < text.length; i++) {
    depth += text[i] === "{" ? 1 : text[i] === "}" ? -1 : 0;
    if (depth === 0) return text.slice(start.index, i + 1);
  }
  return text.slice(start.index);
}

// The names .luacheckrc lets the addon set: quoted entries and `Name = {...}` keys of `globals`.
export function luacheckGlobals(text) {
  const block = globalsBlock(text).replace(/--[^\n]*/g, "");
  const quoted = [...block.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  const keyed = [...block.matchAll(/([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]).filter((k) => k !== "globals");
  return new Set([...quoted, ...keyed]);
}

// Every .lua file under Core/, Modules/ and Locales/ of a checkout, as repo paths with forward slashes.
export function luaFilesOnDisk(dir) {
  return ORPHAN_SCOPE.flatMap((folder) => {
    const base = path.join(dir, folder);
    if (!fs.existsSync(base)) return [];
    const all = fs.readdirSync(base, { recursive: true }).map((f) => `${folder}/${String(f).replace(/\\/g, "/")}`);
    return all.filter((f) => f.endsWith(".lua"));
  }).sort();
}

// ## Interface, ## Title and ## Version problems.
function metaProblems(meta, toc) {
  const out = [];
  const listed = (meta.Interface ?? "").split(/[,\s]+/);
  for (const want of EXPECTED_INTERFACE.filter((v) => !listed.includes(v))) {
    out.push(`${toc}: ## Interface does not list ${want}; it must list ${EXPECTED_INTERFACE.join(", ")} (EXPECTED_INTERFACE in scripts/check-toc.mjs)`);
  }
  for (const key of ["Title", "Version"].filter((k) => !meta[k])) out.push(`${toc}: ## ${key} is missing; add a "## ${key}: ..." line`);
  return out;
}

// Files listed more than once (compared without case, as Windows and the game do).
function duplicateProblems(files, toc) {
  const seen = new Map();
  const out = [];
  for (const f of files) {
    const key = f.path.toLowerCase();
    if (seen.has(key)) out.push(`${toc}:${f.line}: ${f.path} is listed twice (first on line ${seen.get(key)}); remove one`);
    else seen.set(key, f.line);
  }
  return out;
}

// .lua files under Core/, Modules/ and Locales/ that the TOC does not list.
function orphanProblems(files, disk, toc) {
  const listed = new Set(files.map((f) => f.path));
  const orphans = disk.filter((f) => !listed.has(f));
  return orphans.map((f) => `${f} is not listed in ${toc}, so the game, the tests and the coverage floor never load it; list it in load order, or delete it`);
}

// SavedVariables names the TOC declares that .luacheckrc's globals do not list.
function savedVariableProblems(meta, globals, toc) {
  const names = SAVED_KEYS.flatMap((key) => (meta[key] ?? "").split(",").map((n) => [key, n.trim()]));
  const missing = names.filter(([, n]) => n && !globals.has(n));
  return missing.map(([key, n]) => `${toc}: ## ${key} names ${n}, which is not in globals in .luacheckrc; add "${n}" there`);
}

// Shared libraries listed after the first of the addon's own files.
function libraryOrderProblems(files, toc) {
  const first = files.find((f) => !f.path.startsWith(LIBS));
  if (!first) return [];
  const late = files.filter((f) => f.path.startsWith(LIBS) && f.line > first.line);
  return late.map((f) => `${toc}:${f.line}: ${f.path} loads after ${first.path} (line ${first.line}); move the shared libraries above the addon's own files`);
}

// Bracket directives the harness does not model, and files whose tags keep them off every client.
function tagProblems(files, toc) {
  const known = Object.keys(TAG_FIELDS).join(" and ");
  const unknown = files.flatMap((f) => f.unknown.map((name) => `${toc}:${f.line}: ${f.path} carries [${name} ...]; the harness reads only ${known}, so it would load the file where the game may not`));
  const clients = Object.keys(CLIENT_GAME_TYPES);
  const nowhere = files.filter((f) => !clients.some((c) => loadsOn(f, c)));
  return [...unknown, ...nowhere.map((f) => `${toc}:${f.line}: ${f.path} loads on no client (${clients.join(", ")}): check its game-type tags`)];
}

// Every problem, given the TOC's text, .luacheckrc's text and the .lua files on disk.
export function tocProblems({ toc, luacheckrc, disk, name = "Vanguard.toc" }) {
  const { meta, files } = parseToc(toc);
  return [
    ...metaProblems(meta, name),
    ...duplicateProblems(files, name),
    ...orphanProblems(files, disk, name),
    ...savedVariableProblems(meta, luacheckGlobals(luacheckrc), name),
    ...libraryOrderProblems(files, name),
    ...tagProblems(files, name),
  ];
}

// The problems of the checkout at `dir` (its one .toc file in the root).
export function checkCheckout(dir) {
  const name = fs.readdirSync(dir).find((f) => f.endsWith(".toc"));
  if (!name) return [`${dir}: no .toc file in the root`];
  // The text of a file in that checkout.
  const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
  return tocProblems({ toc: read(name), luacheckrc: read(".luacheckrc"), disk: luaFilesOnDisk(dir), name });
}

// Prints each problem, or one OK line; exit code 1 on any problem.
function main() {
  const at = process.argv.indexOf("--root");
  const problems = checkCheckout(at >= 0 ? path.resolve(process.argv[at + 1]) : root);
  for (const p of problems) console.error(p);
  if (problems.length) process.exit(1);
  console.log("OK  the TOC lists every Lua file under Core/, Modules/ and Locales/ once, libraries first; Interface, Title, Version and SavedVariables check out");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
