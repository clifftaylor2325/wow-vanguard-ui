// Scoped logins (scripts/lib/login-scope.mjs, used by loggedIn in
// scripts/tests/helpers.mjs): a test that does not need the six heavy modules
// logs in with them off, chosen by the data in scripts/tests/login-scope.json.
// These tests cover the rules, the case-name format the data is keyed by, and
// two real logins through the SavedVariables seam.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { FULL_CASES, FULL_FILES, HEAVY, SCOPE_FILE, modulesOffLua, scopeFor } from "./lib/login-scope.mjs";
import { SETUP_DONE, loggedIn, runningCase } from "./tests/helpers.mjs";

// Scope data with one listed file whose keep-full list holds one case.
const DATA = { scoped: { "a.test.mjs": ["keep me"], "b.test.mjs": [] } };

// Whether each of the six heavy modules is enabled in an addon, in HEAVY order.
const enabledSix = (addon) => HEAVY.map((name) => addon.eval(`return ns.ModuleEnabled("${name}")`));

// Runs fn with VG_LOGIN_SCOPE set to value (or unset for undefined), then puts the old value back.
function withMode(value, fn) {
  const before = process.env.VG_LOGIN_SCOPE;
  if (value === undefined) delete process.env.VG_LOGIN_SCOPE;
  else process.env.VG_LOGIN_SCOPE = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.VG_LOGIN_SCOPE;
    else process.env.VG_LOGIN_SCOPE = before;
  }
}

it("modulesOffLua: no names give no Lua", () => {
  expect(modulesOffLua([])).toBe("");
});

it("modulesOffLua: starts on a new line, makes each missing table level, then sets each name false in order", () => {
  const lines = modulesOffLua(HEAVY).split("\n");
  expect(lines[0], "a leading newline so it never joins the caller's last line").toBe("");
  expect(lines.slice(1, 5)).toEqual([
    "VanguardDB = VanguardDB or {}",
    "VanguardDB.profiles = VanguardDB.profiles or {}",
    "VanguardDB.profiles.Default = VanguardDB.profiles.Default or {}",
    "VanguardDB.profiles.Default.modules = VanguardDB.profiles.Default.modules or {}",
  ]);
  expect(lines.slice(5)).toEqual(HEAVY.map((name) => `VanguardDB.profiles.Default.modules.${name} = false`));
});

it("HEAVY: the six modules research measured at about 150 of a login's 190 ms", () => {
  expect(HEAVY).toEqual(["ActionBars", "FrameAuras", "PlayerAuras", "InstancePrep", "UnitFrames", "RaidTools"]);
});

it("scopeFor: mode full is always a full login", () => {
  expect(scopeFor({ mode: "full", file: "b.test.mjs", key: "x", data: DATA })).toEqual([]);
});

it("scopeFor: mode probe scopes every login, even outside a case", () => {
  expect(scopeFor({ mode: "probe", file: "zzz.test.mjs", key: "x", data: DATA })).toEqual(HEAVY);
  expect(scopeFor({ mode: "probe", data: DATA })).toEqual(HEAVY);
});

it("scopeFor: with no mode, no case key or a file not in the data is a full login", () => {
  expect(scopeFor({ file: "b.test.mjs", data: DATA }), "outside a running case").toEqual([]);
  expect(scopeFor({ mode: "", file: "zzz.test.mjs", key: "x", data: DATA }), "an empty mode is no mode; the file is not listed").toEqual([]);
});

it("scopeFor: with no mode, a case on its file's keep list is full and any other case in a listed file is scoped", () => {
  expect(scopeFor({ file: "a.test.mjs", key: "keep me", data: DATA })).toEqual([]);
  expect(scopeFor({ file: "a.test.mjs", key: "another", data: DATA })).toEqual(HEAVY);
  expect(scopeFor({ file: "b.test.mjs", key: "keep me", data: DATA }), "the keep list is per file").toEqual(HEAVY);
});

it("scopeFor: an unknown mode throws an error that names VG_LOGIN_SCOPE and the allowed values", () => {
  expect(() => scopeFor({ mode: "fast", file: "a.test.mjs", key: "x", data: DATA })).toThrow(/VG_LOGIN_SCOPE.*full.*probe/);
});

// What runningCase says while this file is being collected, before any case runs.
const OUTSIDE = runningCase();

it("runningCase: a top-level case's key is its own title, in its file's repo-relative path", () => {
  expect(runningCase()).toEqual({ file: "scripts/login-scope.test.mjs", key: "runningCase: a top-level case's key is its own title, in its file's repo-relative path" });
});

// The titles "outer" and "inner" are literal: plan 03-04 task 2 checks the JSON report's key for this case is "outer > inner".
describe("outer", () => {
  it("inner", () => {
    expect(runningCase()).toEqual({ file: "scripts/login-scope.test.mjs", key: "outer > inner" });
  });
});

it("runningCase: outside a running case there is no key, so a login there is a full one", () => {
  expect(OUTSIDE.key).toBeUndefined();
  expect(scopeFor({ ...OUTSIDE, data: { scoped: { [OUTSIDE.file]: [] } } })).toEqual([]);
});

it("the data file: a note, and sorted listed files each with a list of case names, none of them a full-login file", () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, SCOPE_FILE), "utf8"));
  const files = Object.keys(data.scoped);
  expect(typeof data.about).toBe("string");
  expect(files, "sorted, so the same data always reads the same").toEqual([...files].sort());
  expect(Object.values(data.scoped).every((keep) => Array.isArray(keep) && keep.every((k) => typeof k === "string"))).toBe(true);
  expect(files.filter((f) => FULL_FILES.includes(f)), "a file kept on the full login is never listed").toEqual([]);
});

it("the full-login lists name files that exist and cases in the form file|case", () => {
  expect([...FULL_FILES, ...FULL_CASES.map((c) => c.split("|")[0])].filter((f) => !fs.existsSync(path.join(root, f)))).toEqual([]);
  expect(FULL_CASES.every((c) => c.split("|").length === 2)).toBe(true);
});

it("a real scoped login: the six modules are off, RaidFrames is on, no frame of ActionBars exists, no error", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) });
  addon.login();
  expect(enabledSix(addon), "all six off").toEqual(HEAVY.map(() => false));
  expect(addon.eval('return ns.ModuleEnabled("RaidFrames")'), "the others stay on").toBe(true);
  expect(addon.eval("return Vanguard_Bar1Button1 == nil"), "ActionBars built nothing").toBe(true);
  expect(addon.eval("return #ns.errors"), "and nothing failed").toBe(0);
});

it("a real scoped login on a brand-new account (no VanguardDB before the scope text): the six are off, no error", () => {
  const addon = createAddon({ savedVariables: modulesOffLua(HEAVY) });
  addon.login();
  expect(enabledSix(addon)).toEqual(HEAVY.map(() => false));
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("the scope text merges into the caller's own saved variables instead of replacing them", () => {
  const saved = `${SETUP_DONE}VanguardDB.profiles = { Default = { modules = { RaidFrames = false }, Marker = 7 } }`;
  const addon = createAddon({ savedVariables: saved + modulesOffLua(HEAVY) });
  addon.login();
  expect(addon.eval("return { VanguardDB.profiles.Default.Marker, ns.ModuleEnabled('RaidFrames'), ns.ModuleEnabled('UnitFrames') }"), "the caller's own settings stay").toEqual([7, false, false]);
});

it("loggedIn: a test file that is not in the data gets the full login", () => {
  const addon = withMode(undefined, () => loggedIn());
  expect(enabledSix(addon)).toEqual(HEAVY.map(() => true));
});

it("loggedIn: VG_LOGIN_SCOPE=probe scopes it, and VG_LOGIN_SCOPE=full overrides the probe's reach", () => {
  expect(enabledSix(withMode("probe", () => loggedIn())), "probe: all six off").toEqual(HEAVY.map(() => false));
  expect(enabledSix(withMode("full", () => loggedIn())), "full: all six on").toEqual(HEAVY.map(() => true));
});

it("loggedIn: any other VG_LOGIN_SCOPE fails loudly, before a login is made", () => {
  expect(() => withMode("nonsense", () => loggedIn())).toThrow(/VG_LOGIN_SCOPE/);
});
