// Scoped logins (D-02 lever 2, D-06): a test that does not need the six heavy
// modules logs in with them off, through the SavedVariables seam
// (VanguardDB.profiles.Default.modules.<Name> = false), chosen by the data in
// scripts/tests/login-scope.json and never by guesswork. This file is the pure
// part: which logins are scoped, and the Lua that scopes them. scripts/tests/
// helpers.mjs (loggedIn) applies it; scripts/login-scope-probe.mjs derives the
// data. Only node: modules are used, so a quick-project test can run it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The six modules a login pays for most (Enable cost, measured 2026-10-10:
// about 150 of a login's 190 ms; ActionBars 67 ms, FrameAuras 27, PlayerAuras
// 20, InstancePrep 13, UnitFrames 12, RaidTools 12).
export const HEAVY = ["ActionBars", "FrameAuras", "PlayerAuras", "InstancePrep", "UnitFrames", "RaidTools"];

// Whole files that stay on the full login on purpose: a cross-module check
// scoped would hide breakage between modules. Plan 03-06 reviews this list.
export const FULL_FILES = [
  "scripts/tests/smoke.test.mjs", // the pull request's one harness case: a complete login, unlock, lock, no errors
  "scripts/tests/scenarios.test.mjs", // every top-level frame of the default layout inside a 1920x1080 screen with no overlaps
  "scripts/tests/movers.test.mjs", // moving the frames of every module that has one
  "scripts/login-scope.test.mjs", // its logins test the scoping rules under each mode, so the data must not scope them
];

// Single cases (`file|case`) that stay on the full login, in files that are otherwise scoped.
export const FULL_CASES = [
  "scripts/tests/core.test.mjs|client capability probe: every flag off, every module still enables", // every module, on every client shape
  "scripts/tests/setup.test.mjs|the setup wizard sits above the unlock handles on the last step, so their labels never draw over it", // needs the handles of the bars
  "scripts/tests/setup.test.mjs|setup layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect", // the rects of every module's mover against each other; with a module off an overlap check passes vacuously
  "scripts/tests/setup.test.mjs|setup screens: with each screen preset, nothing overlaps or leaves its own screen, in every layout, solo to 40-man", // the same check at each screen preset
  "scripts/tests/units.test.mjs|threat and happiness only where the client and settings allow", // coverage: the only case that runs Modules/UnitExtras.lua:46 (it passes vacuously with UnitFrames off, since nothing is built)
];

// The account file version a fresh install is stamped with, read from Core/DB.lua so a scoped
// brand-new account is made as current and Core/DB.lua runs no upgrade step on it (WR-01).
const DB_VERSION = Number(/local DB_VERSION = ([0-9]+)/.exec(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../Core/DB.lua"), "utf8"))[1]);

// Where the data lives, relative to the repo root.
export const SCOPE_FILE = "scripts/tests/login-scope.json";

// The values VG_LOGIN_SCOPE may take besides unset or empty (use the data).
const MODES = ["full", "probe"];

// Lua that turns the named modules off in the Default profile, merging into
// whatever VanguardDB the caller's saved variables made (each level is created
// only where it is missing; a missing VanguardDB is made current, so it is not migrated). Starts with a newline so it never joins the
// caller's last line; no names give no Lua.
export function modulesOffLua(names) {
  if (!names.length) return "";
  const levels = ["VanguardDB", "VanguardDB.profiles", "VanguardDB.profiles.Default", "VanguardDB.profiles.Default.modules"];
  const make = levels.map((level) => `${level} = ${level} or ${level === "VanguardDB" ? `{ version = ${DB_VERSION} }` : "{}"}`);
  const off = names.map((name) => `VanguardDB.profiles.Default.modules.${name} = false`);
  return `\n${[...make, ...off].join("\n")}`;
}

// The modules a login turns off, from VG_LOGIN_SCOPE (mode), the running case
// (file and key) and the scope data. `full` is never scoped, `probe` always,
// anything else throws. With no mode the data decides: a case outside a
// running case, a file not in the data and a case on its file's keep-full list
// get a full login; every other case in a listed file is scoped.
export function scopeFor({ mode, file, key, data }) {
  if (mode && !MODES.includes(mode)) throw new Error(`VG_LOGIN_SCOPE must be one of ${MODES.join(", ")} or unset, not "${mode}"`);
  if (mode === "full") return [];
  if (mode === "probe") return HEAVY;
  const keep = Object.hasOwn(data.scoped, file) ? data.scoped[file] : undefined;
  return key === undefined || !keep || keep.includes(key) ? [] : HEAVY;
}

// The names in fullCases (`file|case` entries) that belong to a file.
function fullCasesOf(file, fullCases) {
  const prefix = `${file}|`;
  return fullCases.filter((entry) => entry.startsWith(prefix)).map((entry) => entry.slice(prefix.length));
}

// One login file's keep-full list: the names of its cases that did not pass in the
// probe run (a case that needs a heavy module fails with it off) plus its full cases,
// sorted and without repeats.
function keepList(file, cases, fullCases) {
  const failed = cases.filter((c) => c.file === file && c.status !== "passed").map((c) => c.key);
  return [...new Set([...failed, ...fullCasesOf(file, fullCases)])].sort();
}

// The `scoped` map of the data file from a probe run: `cases` are the run's { file, key, status }
// (as caseList reads them), loginFiles the test files that call loggedIn, fullFiles the files
// kept whole on the full login and fullCases the single `file|case` entries kept full. Every
// login file that is not in fullFiles gets an entry; the files come out sorted, so the same
// results always give the same JSON text.
export function buildScope(cases, { loginFiles, fullFiles, fullCases }) {
  const files = [...new Set(loginFiles)].filter((file) => !fullFiles.includes(file)).sort();
  return Object.fromEntries(files.map((file) => [file, keepList(file, cases, fullCases)]));
}

// The text of the data file for a note and a scoped map: two-space indent and a trailing newline.
export function dataText(about, scoped) {
  return `${JSON.stringify({ about, scoped }, null, 2)}\n`;
}

// One row per login file for the probe's printout, sorted by file: how many cases it has and
// how many of them keep the full login (every case of a file in fullFiles; else those named in
// the file's keep list in `scoped`).
export function probeRows(cases, { loginFiles, fullFiles, scoped }) {
  return [...new Set(loginFiles)].sort().map((file) => {
    const own = cases.filter((c) => c.file === file);
    const kept = fullFiles.includes(file) ? own : own.filter((c) => (scoped[file] ?? []).includes(c.key));
    return { file, cases: own.length, keep: kept.length };
  });
}
