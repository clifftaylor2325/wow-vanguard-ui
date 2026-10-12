// Tests for scripts/lib/lua-profile.mjs and the profile CLI: the sampler ranks a
// hot function first, the report adds up, dumps merge, and nothing is sampled
// unless LUA_PROFILE asks for it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import fengari from "fengari";
import { expect, it } from "vitest";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { dumpProfile, formatProfile, mergeProfiles, profileData, profileSampler, resetProfile, topRows } from "./lib/lua-profile.mjs";

const { lua, lauxlib, lualib, to_luastring } = fengari;

// Runs a Lua chunk named "@<name>" in a state whose count hook is the sampler.
function runChunk(L, source, name) {
  expect(lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(name))).toBe(lua.LUA_OK);
  expect(lua.lua_pcall(L, 0, 0, 0)).toBe(lua.LUA_OK);
}

// Profiles a hot loop in one file and a cold one in another; returns the data.
function profileHotAndCold() {
  resetProfile();
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_sethook(L, profileSampler(), lua.LUA_MASKCOUNT, 1000);
  runChunk(L, "function hot() local n = 0 for i = 1, 400000 do n = n + i end return n end", "@TEST-ONLY-hot.lua");
  runChunk(L, "function cold() local n = 0 for i = 1, 4000 do n = n + i end return n end", "@TEST-ONLY-cold.lua");
  runChunk(L, "hot()\ncold()", "=TEST-ONLY-driver");
  return profileData();
}

// The percent column of the rows under a report section title.
function percents(report, title) {
  const lines = report.split("\n");
  const rows = lines.slice(lines.indexOf(title) + 2);
  return rows.slice(0, rows.indexOf("")).map((r) => Number(/([\d.]+)%/.exec(r)[1]));
}

it("a hot function ranks first: its file in self by file, its line in self by line, its name in inclusive by function", () => {
  const data = profileHotAndCold();
  expect(data.samples).toBeGreaterThan(100);
  expect(topRows(data.files, "self", 1)[0][0]).toBe("TEST-ONLY-hot.lua");
  expect(topRows(data.lines, null, 1)[0][0]).toMatch(/^TEST-ONLY-hot\.lua:1$/);
  expect(data.functions["TEST-ONLY-hot.lua:0 hot"] ?? data.functions["TEST-ONLY-hot.lua:1 hot"]).toBeGreaterThan(data.functions["TEST-ONLY-cold.lua:1 cold"] ?? 0);
});

it("self samples add up to the sample count, and each file's inclusive count is at least its self count", () => {
  const data = profileHotAndCold();
  const files = Object.values(data.files);
  expect(files.reduce((n, f) => n + f.self, 0)).toBe(data.samples);
  expect(files.every((f) => f.incl >= f.self && f.incl <= data.samples)).toBe(true);
});

it("the self by file percentages of a report sum to 100", () => {
  const data = { samples: 8, files: { "a.lua": { self: 4, incl: 8 }, "b.lua": { self: 3, incl: 3 }, "c.lua": { self: 1, incl: 1 } }, functions: {}, lines: {} };
  const report = formatProfile(data, { area: "test", wallMs: 12 });
  const sum = percents(report, "self by file").reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - 100)).toBeLessThan(0.1);
});

it("the report has the header, the sample meaning and the four sections in order", () => {
  const report = formatProfile(profileHotAndCold(), { area: "hot-cold", wallMs: 5 });
  const titles = ["self by file", "inclusive by file", "inclusive by function", "self by line"];
  const at = titles.map((t) => report.indexOf(`\n${t}\n`));
  expect(at.every((i) => i > 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  expect(report).toMatch(/^Lua profile: hot-cold\nsamples \d+\ninstructions per sample 1000\nwall ms 5\n/);
  expect(report).toContain("one sample = 1000 Lua VM instructions; time inside JS-implemented functions is not counted");
});

it("mergeProfiles adds the samples and the file, function and line counts of two dumps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-profile-"));
  const first = JSON.parse(JSON.stringify(profileHotAndCold()));
  dumpProfile(path.join(dir, "a.json"));
  dumpProfile(path.join(dir, "b.json"));
  const merged = mergeProfiles([path.join(dir, "a.json"), path.join(dir, "b.json")]);
  expect(merged.samples).toBe(first.samples * 2);
  expect(merged.files["TEST-ONLY-hot.lua"].self).toBe(first.files["TEST-ONLY-hot.lua"].self * 2);
  expect(merged.files["TEST-ONLY-hot.lua"].incl).toBe(first.files["TEST-ONLY-hot.lua"].incl * 2);
  const [fn, count] = topRows(first.functions, null, 1)[0];
  expect(merged.functions[fn]).toBe(count * 2);
  const [line, hits] = topRows(first.lines, null, 1)[0];
  expect(merged.lines[line]).toBe(hits * 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

it("dumpProfile writes nothing when no sample was taken", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-profile-"));
  resetProfile();
  dumpProfile(path.join(dir, "none.json"));
  expect(fs.existsSync(path.join(dir, "none.json"))).toBe(false);
  fs.rmSync(dir, { recursive: true, force: true });
});

it("with LUA_PROFILE unset a login samples nothing", () => {
  const saved = process.env.LUA_PROFILE;
  delete process.env.LUA_PROFILE;
  resetProfile();
  createAddon().login();
  if (saved !== undefined) process.env.LUA_PROFILE = saved;
  expect(profileData().samples).toBe(0);
});

it("an unknown or malformed area lists the valid ones and exits 1", () => {
  for (const area of ["no-such-area", "../package"]) {
    const run = spawnSync(process.execPath, [path.join(root, "scripts/profile-lua.mjs"), area], { cwd: root, encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/auction/);
    expect(run.stderr).toMatch(/login/);
  }
});
