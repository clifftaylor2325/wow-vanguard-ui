// Scoped logins (D-02 lever 2, D-06): a test that does not need the six heavy
// modules logs in with them off, through the SavedVariables seam
// (VanguardDB.profiles.Default.modules.<Name> = false), chosen by the data in
// scripts/tests/login-scope.json and never by guesswork. This file is the pure
// part: which logins are scoped, and the Lua that scopes them. scripts/tests/
// helpers.mjs (loggedIn) applies it; scripts/login-scope-probe.mjs derives the
// data. Only node: modules are used, so a quick-project test can run it.

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
];

// Single cases (`file|case`) that stay on the full login, in files that are otherwise scoped.
export const FULL_CASES = [
  "scripts/tests/core.test.mjs|client capability probe: every flag off, every module still enables", // every module, on every client shape
  "scripts/tests/setup.test.mjs|the setup wizard sits above the unlock handles on the last step, so their labels never draw over it", // needs the handles of the bars
];

// Where the data lives, relative to the repo root.
export const SCOPE_FILE = "scripts/tests/login-scope.json";

// The values VG_LOGIN_SCOPE may take besides unset or empty (use the data).
const MODES = ["full", "probe"];

// Lua that turns the named modules off in the Default profile, merging into
// whatever VanguardDB the caller's saved variables made (each level is created
// only where it is missing). Starts with a newline so it never joins the
// caller's last line; no names give no Lua.
export function modulesOffLua(names) {
  if (!names.length) return "";
  const levels = ["VanguardDB", "VanguardDB.profiles", "VanguardDB.profiles.Default", "VanguardDB.profiles.Default.modules"];
  const make = levels.map((level) => `${level} = ${level} or {}`);
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
