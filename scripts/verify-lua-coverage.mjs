#!/usr/bin/env node
// Tests for scripts/lib/lua-coverage.mjs: which lines count as executable,
// that the hook records only addon chunks, and the report formatting.

import assert from "node:assert/strict";
import fengari from "fengari";
import { attachCoverage, executableLines, hitLines, lineRanges } from "./lib/lua-coverage.mjs";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const results = [];

// Runs one named check and records pass or fail.
function check(name, fn) {
  try {
    fn();
    results.push(["OK  ", name]);
  } catch (err) {
    results.push(["FAIL", `${name}: ${err.message}`]);
  }
}

// TEST-ONLY source: an early-return function whose `end` line never runs.
const SOURCE = ["local function f(x)", "  if x then", "    return 1", "  end", "  return 2", "end", "", "-- comment", "return f(true)"].join("\n");

check("executable lines skip blanks, comments and each function's implicit final return", () => {
  const lines = [...executableLines(SOURCE, "@TEST-ONLY.lua")].sort((a, b) => a - b);
  assert.deepEqual(lines, [2, 3, 5, 6, 9]);
});

check("a function ending in a multi-line tail call is fully covered when it runs", () => {
  const src = ["local function g(t) return t[1] end", "local function f()", "  return g({", "    7,", "  })", "end", "return f()"].join("\n");
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  attachCoverage(L);
  lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring("@TEST-ONLY-tail.lua"));
  assert.equal(lua.lua_pcall(L, 0, 1, 0), lua.LUA_OK);
  const hit = hitLines("@TEST-ONLY-tail.lua");
  const missed = [...executableLines(src, "@TEST-ONLY-tail.lua")].filter((line) => !hit.has(line));
  assert.deepEqual(missed, []);
});

check("a syntax error names the chunk", () => {
  assert.throws(() => executableLines("local =", "@TEST-ONLY-bad.lua"), /TEST-ONLY-bad\.lua/);
});

check("the hook runs without breaking the chunk", () => {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  attachCoverage(L);
  lauxlib.luaL_loadbuffer(L, to_luastring(SOURCE), null, to_luastring("@TEST-ONLY.lua"));
  assert.equal(lua.lua_pcall(L, 0, 1, 0), lua.LUA_OK);
  assert.equal(lua.lua_tonumber(L, -1), 1);
  lauxlib.luaL_loadbuffer(L, to_luastring("return 3"), null, to_luastring("=TEST-ONLY eval"));
  assert.equal(lua.lua_pcall(L, 0, 1, 0), lua.LUA_OK);
});

check("missing lines print as ranges", () => {
  assert.equal(lineRanges([1, 2, 3, 7, 9, 10]), "1-3,7,9-10");
  assert.equal(lineRanges([]), "");
});

console.log("lua coverage tool");
for (const [mark, text] of results) console.log(`${mark}${text}`);
if (results.some(([mark]) => mark === "FAIL")) process.exit(1);
