// Scoped logins (scripts/lib/login-scope.mjs, used by loggedIn in
// scripts/tests/helpers.mjs): a test that does not need the six heavy modules
// logs in with them off, chosen by the data in scripts/tests/login-scope.json.
// These tests cover the rules, the case-name format the data is keyed by, and
// two real logins through the SavedVariables seam.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { FULL_CASES, FULL_FILES, HEAVY, SCOPE_FILE, buildScope, dataText, modulesOffLua, probeRows, scopeFor } from "./lib/login-scope.mjs";
import { SETUP_DONE, loggedIn, runningCase } from "./tests/helpers.mjs";

// Scope data with one listed file whose keep-full list holds one case.
const DATA = { scoped: { "a.test.mjs": ["keep me"], "b.test.mjs": [] } };

// Whether each of the six heavy modules is enabled in an addon, in HEAVY order.
const enabledSix = (addon) => HEAVY.map((name) => addon.eval(`return ns.ModuleEnabled("${name}")`));

// A case as the probe reads it from the JSON report (see caseList in scripts/lib/suite-timing.mjs).
const kase = (file, key, status = "passed") => ({ file, key, status });

// A probe run over three login files and one file that never logs in: a.test.mjs has a failed case (sharing its
// title with a passing one) and a skipped one, full.test.mjs is kept on the full login, other.test.mjs is not a login file.
const RUN = [
  kase("a.test.mjs", "ok"), kase("a.test.mjs", "needs"), kase("a.test.mjs", "needs", "failed"), kase("a.test.mjs", "waits", "skipped"),
  kase("b.test.mjs", "fine"), kase("full.test.mjs", "q", "failed"), kase("other.test.mjs", "r", "failed"),
];
const SETUP = { loginFiles: ["b.test.mjs", "full.test.mjs", "a.test.mjs"], fullFiles: ["full.test.mjs"], fullCases: ["a.test.mjs|zeta", "full.test.mjs|ignored", "b.test.mjs|a|b"] };

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

it("buildScope: lists each login file that is not kept full, with the sorted keys of its cases that did not pass plus its full cases", () => {
  expect(buildScope(RUN, SETUP)).toEqual({ "a.test.mjs": ["needs", "waits", "zeta"], "b.test.mjs": ["a|b"] });
});

it("buildScope: files outside the login files and every full-login file get no entry; a full case of a full-login file is ignored", () => {
  const files = Object.keys(buildScope(RUN, SETUP));
  expect(files.includes("other.test.mjs"), "never logs in").toBe(false);
  expect(files.includes("full.test.mjs"), "the whole file is full anyway").toBe(false);
});

it("buildScope: the files come out sorted, so the same results always give the same JSON text", () => {
  const scoped = buildScope(RUN, SETUP);
  expect(Object.keys(scoped)).toEqual(["a.test.mjs", "b.test.mjs"]);
  expect(JSON.stringify(buildScope([...RUN].reverse(), { ...SETUP, loginFiles: [...SETUP.loginFiles].reverse() }))).toBe(JSON.stringify(scoped));
});

it("buildScope: a login file with every case passing and no full case is listed with an empty keep list", () => {
  expect(buildScope([kase("c.test.mjs", "x")], { loginFiles: ["c.test.mjs"], fullFiles: [], fullCases: [] })).toEqual({ "c.test.mjs": [] });
});

it("probeRows: one row per login file, sorted, counting its cases that keep the full login; a full-login file keeps all", () => {
  const scoped = buildScope(RUN, SETUP);
  expect(probeRows(RUN, { ...SETUP, scoped })).toEqual([
    { file: "a.test.mjs", cases: 4, keep: 3 },
    { file: "b.test.mjs", cases: 1, keep: 0 },
    { file: "full.test.mjs", cases: 1, keep: 1 },
  ]);
});

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

it("dataText: the data file is in the form the probe writes (two-space indent, trailing newline), so --write is reproducible", () => {
  const text = fs.readFileSync(path.join(root, SCOPE_FILE), "utf8").replace(/\r\n/g, "\n");
  const data = JSON.parse(text);
  expect(dataText(data.about, data.scoped)).toBe(text);
  expect(dataText("n", { "a.test.mjs": [] })).toBe('{\n  "about": "n",\n  "scoped": {\n    "a.test.mjs": []\n  }\n}\n');
});

it("the full-login lists name files that exist and cases in the form file|case", () => {
  expect([...FULL_FILES, ...FULL_CASES.map((c) => c.split("|")[0])].filter((f) => !fs.existsSync(path.join(root, f)))).toEqual([]);
  expect(FULL_CASES.every((c) => c.split("|").length === 2)).toBe(true);
});

// The text of a file under the repo root.
const textOf = (file) => fs.readFileSync(path.join(root, file), "utf8");

it("the full-login lists cannot go stale: every hand-kept case's title is still in its file, so a rename cannot move it onto a scoped login", () => {
  const gone = FULL_CASES.filter((entry) => {
    const [file, key] = entry.split("|");
    return !textOf(file).includes(key.split(" > ").pop());
  });
  expect(gone, "renamed or deleted cases").toEqual([]);
});

it("the full-login lists agree with the committed data: each hand-kept case is on its file's keep list, no hand-kept file is listed", () => {
  const { scoped } = JSON.parse(textOf(SCOPE_FILE));
  const missing = FULL_CASES.filter((entry) => {
    const [file, key] = entry.split("|");
    return !(scoped[file] ?? []).includes(key);
  });
  expect(missing, "FULL_CASES entries the data does not keep full").toEqual([]);
  expect(FULL_FILES.filter((file) => Object.hasOwn(scoped, file)), "FULL_FILES entries the data lists").toEqual([]);
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
