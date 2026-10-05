// Tests for scripts/lib/lua-coverage.mjs: which lines count as executable,
// that the hook records only addon chunks, and the report formatting.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fengari from "fengari";
import { expect, it } from "vitest";
import { root } from "./lib/lua-harness.mjs";
import { attachCoverage, coverageReport, executableLines, hitLines, lineRanges, loadHits } from "./lib/lua-coverage.mjs";

const { lua, lauxlib, lualib, to_luastring } = fengari;

// TEST-ONLY source: an early-return function whose `end` line never runs.
const SOURCE = ["local function f(x)", "  if x then", "    return 1", "  end", "  return 2", "end", "", "-- comment", "return f(true)"].join("\n");

it("executable lines skip blanks, comments and each function's implicit final return", () => {
  const lines = [...executableLines(SOURCE, "@TEST-ONLY.lua")].sort((a, b) => a - b);
  expect(lines).toEqual([2, 3, 5, 6, 9]);
});

it("a function ending in a multi-line tail call is fully covered when it runs", () => {
  const src = ["local function g(t) return t[1] end", "local function f()", "  return g({", "    7,", "  })", "end", "return f()"].join("\n");
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  attachCoverage(L);
  lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring("@TEST-ONLY-tail.lua"));
  expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
  const hit = hitLines("@TEST-ONLY-tail.lua");
  const missed = [...executableLines(src, "@TEST-ONLY-tail.lua")].filter((line) => !hit.has(line));
  expect(missed).toEqual([]);
});

it("a syntax error names the chunk", () => {
  expect(() => executableLines("local =", "@TEST-ONLY-bad.lua")).toThrow(/TEST-ONLY-bad\.lua/);
});

it("the hook runs without breaking the chunk", () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  attachCoverage(L);
  lauxlib.luaL_loadbuffer(L, to_luastring(SOURCE), null, to_luastring("@TEST-ONLY.lua"));
  expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
  expect(lua.lua_tonumber(L, -1)).toBe(1);
  lauxlib.luaL_loadbuffer(L, to_luastring("return 3"), null, to_luastring("=TEST-ONLY eval"));
  expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
});

it("missing lines print as ranges", () => {
  expect(lineRanges([1, 2, 3, 7, 9, 10])).toBe("1-3,7,9-10");
  expect(lineRanges([])).toBe("");
});

it("a missing hits file fails", () => {
  const file = path.join(os.tmpdir(), `vg-hits-missing-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  expect(() => loadHits(file)).toThrow(/Lua coverage hits file is missing/);
});

it("empty hits are not full coverage", () => {
  const report = coverageReport(root, ["Core/Events.lua"]);
  expect(report.total > 0 && report.pct < 100).toBeTruthy();
});
