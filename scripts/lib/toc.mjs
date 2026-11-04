// Reading Vanguard.toc the way the game does, for every script that walks it (the
// harness, the coverage floor, the TOC check, packaging, the code-quality scan).
//
// A file line may carry game-type tags after its path, as Blizzard's own TOCs do
// (Blizzard_UnitFrame.toc on the forever branch of wow-ui-source):
//   Modules/SwingTimer.lua [AllowLoadGameType camelot] [ExcludeLoadGameType standard]
// AllowLoadGameType loads the file only on a client of one of the listed game types;
// ExcludeLoadGameType skips it on a client of any listed type. Values are
// comma-separated. Other bracket directives are reported by scripts/check-toc.mjs.

import fs from "node:fs";
import path from "node:path";

// The game types each client the harness models belongs to: WoW Forever is
// `camelot` (WOW_PROJECT_CAMELOT, 18) and Retail `standard`; both are the `mainline` family.
export const CLIENT_GAME_TYPES = { forever: ["camelot", "mainline"], retail: ["standard", "mainline"] };

// The directives a file line may carry, by the field they fill.
export const TAG_FIELDS = { AllowLoadGameType: "allow", ExcludeLoadGameType: "exclude" };

const TAG = /\[\s*([A-Za-z]+)\s*([^\]]*)\]/g;

// One file line as { path, allow, exclude, unknown }: the path with forward slashes, the game
// types each tag lists (allow null when the line has none), and any other directive's name.
export function tocLine(raw) {
  const line = raw.trim();
  const at = line.search(/\s*\[/);
  const entry = { path: (at < 0 ? line : line.slice(0, at)).trim().replace(/\\/g, "/"), allow: null, exclude: [], unknown: [] };
  for (const [, name, values] of line.slice(Math.max(at, 0)).matchAll(TAG)) {
    const field = TAG_FIELDS[name];
    const types = values.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (field) entry[field] = [...(entry[field] ?? []), ...types];
    else entry.unknown.push(name);
  }
  return entry;
}

// Whether a line is a file (not blank, not a ## tag or a # comment).
const isFileLine = (raw) => raw.trim() !== "" && !raw.trim().startsWith("#");

// The TOC's file lines, in order, as tocLine entries with their 1-based line number.
export function tocEntries(text) {
  return text.split(/\r?\n/).flatMap((raw, i) => (isFileLine(raw) ? [{ ...tocLine(raw), line: i + 1 }] : []));
}

// Whether an entry loads on a client (a key of CLIENT_GAME_TYPES).
export function loadsOn(entry, client) {
  const types = CLIENT_GAME_TYPES[client];
  const allowed = entry.allow === null || entry.allow.some((t) => types.includes(t));
  return allowed && !entry.exclude.some((t) => types.includes(t));
}

// Every path the TOC lists, whichever client loads it (the release zip holds them all).
export const tocPaths = (text) => tocEntries(text).map((e) => e.path);

// The paths one client loads, in order.
export const clientPaths = (text, client) => tocEntries(text).filter((e) => loadsOn(e, client)).map((e) => e.path);

// The paths at least one modelled client loads, in order (what the coverage floor counts).
export const anyClientPaths = (text) => tocEntries(text).filter((e) => Object.keys(CLIENT_GAME_TYPES).some((c) => loadsOn(e, c))).map((e) => e.path);

// The TOC's text in a checkout.
export const readToc = (root, name = "Vanguard.toc") => fs.readFileSync(path.join(root, name), "utf8");
