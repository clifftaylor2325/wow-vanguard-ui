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

it("one hook records each chunk's lines under its own name, including a chunk loaded from a binary", () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  attachCoverage(L);
  // Two source chunks run under one hook.
  lauxlib.luaL_loadbuffer(L, to_luastring("local a = 1\nlocal b = 2\nreturn a + b"), null, to_luastring("@TEST-ONLY-one.lua"));
  expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
  lauxlib.luaL_loadbuffer(L, to_luastring("local x = 1\n\n\nreturn x"), null, to_luastring("@TEST-ONLY-two.lua"));
  expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
  expect([...hitLines("@TEST-ONLY-one.lua")].sort()).toEqual([1, 2, 3]);
  expect([...hitLines("@TEST-ONLY-two.lua")].sort()).toEqual([1, 4]);
  // A chunk compiled, dumped and loaded back as a binary keeps its name and lines.
  lauxlib.luaL_loadbuffer(L, to_luastring("local y = 5\nreturn y"), null, to_luastring("@TEST-ONLY-dumped.lua"));
  const parts = [];
  lua.lua_dump(L, (_, bytes, size) => { parts.push(bytes.slice(0, size)); return 0; }, null, 0);
  lua.lua_pop(L, 1);
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((offset, p) => { bytes.set(p, offset); return offset + p.length; }, 0);
  expect(lauxlib.luaL_loadbufferx(L, bytes, null, to_luastring("@TEST-ONLY-dumped.lua"), to_luastring("b"))).toBe(lua.LUA_OK);
  expect(lua.lua_pcall(L, 0, 1, 0)).toBe(lua.LUA_OK);
  expect([...hitLines("@TEST-ONLY-dumped.lua")].sort()).toEqual([1, 2]);
  expect(hitLines("@TEST-ONLY-one.lua").size, "earlier chunks keep their lines after later ones fold").toBe(3);
});

it("missing lines print as ranges", () => {
  expect(lineRanges([1, 2, 3, 7, 9, 10])).toBe("1-3,7,9-10");
  expect(lineRanges([])).toBe("");
});

it("a missing hits file fails", () => {
  const file = path.join(os.tmpdir(), `fui-hits-missing-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  expect(() => loadHits(file)).toThrow(/Lua coverage hits file is missing/);
});

it("empty hits are not full coverage", () => {
  const report = coverageReport(root, ["Core/Events.lua"]);
  expect(report.total > 0 && report.pct < 100).toBeTruthy();
});
