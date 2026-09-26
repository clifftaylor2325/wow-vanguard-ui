// Run the real addon Lua under Node (fengari, Lua 5.3) with a WoW API stub.
// Files load in TOC order with the same (ADDON, ns) varargs WoW passes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fengari from "fengari";
import { luaString, luaValue } from "./lua-emit.mjs";

const { lua, lauxlib, lualib, to_luastring } = fengari;

export const ADDON = "ForeverUI";
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The addon's files in TOC load order.
export function tocFiles() {
  const toc = fs.readFileSync(path.join(root, `${ADDON}.toc`), "utf8");
  return toc
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

const TYPE_NAMES = {
  [lua.LUA_TFUNCTION]: "<function>",
  [lua.LUA_TUSERDATA]: "<userdata>",
  [lua.LUA_TLIGHTUSERDATA]: "<userdata>",
  [lua.LUA_TTHREAD]: "<thread>",
};

// A scalar Lua value at idx as JS, or undefined for a table.
function scalarToJs(L, idx, type) {
  if (type === lua.LUA_TNIL || type === lua.LUA_TNONE) return null;
  if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, idx);
  if (type === lua.LUA_TNUMBER) return lua.lua_tonumber(L, idx);
  if (type === lua.LUA_TSTRING) return lua.lua_tojsstring(L, idx);
  if (type !== lua.LUA_TTABLE) return TYPE_NAMES[type] || "<unknown>";
  return undefined;
}

// The table key on top of the stack's key slot (-2) as JS.
function keyToJs(L) {
  const keyType = lua.lua_type(L, -2);
  if (keyType === lua.LUA_TNUMBER) return lua.lua_tonumber(L, -2);
  if (keyType === lua.LUA_TSTRING) return lua.lua_tojsstring(L, -2);
  return TYPE_NAMES[keyType] || "<key>";
}

// Every [key, value] pair of the table at idx, values converted to JS.
function tableEntries(L, idx, depth) {
  const entries = [];
  lua.lua_pushnil(L);
  while (lua.lua_next(L, idx) !== 0) {
    entries.push([keyToJs(L), toJs(L, -1, depth + 1)]);
    lua.lua_pop(L, 1);
  }
  return entries;
}

// Entries with keys exactly 1..n become an array; anything else an object.
function entriesToJs(entries) {
  const isArray = entries.length > 0 && entries.every(([k]) => Number.isInteger(k) && k >= 1 && k <= entries.length);
  if (!isArray) return Object.fromEntries(entries.map(([k, v]) => [String(k), v]));
  const arr = new Array(entries.length);
  for (const [k, v] of entries) arr[k - 1] = v;
  return arr;
}

// Lua value at idx -> plain JS. nil -> null. A table with keys 1..n is an
// array; anything else (including an empty table) is an object.
function toJs(L, idx, depth = 0) {
  idx = lua.lua_absindex(L, idx);
  const type = lua.lua_type(L, idx);
  const scalar = scalarToJs(L, idx, type);
  if (scalar !== undefined) return scalar;
  if (depth > 32) return "<too-deep>";
  return entriesToJs(tableEntries(L, idx, depth));
}

// Pops the error message on top of the stack and throws it, labeled.
function throwTop(L, chunkName) {
  const msg = lua.lua_tojsstring(L, -1);
  lua.lua_pop(L, 1);
  throw new Error(`${chunkName}: ${msg}`);
}

// Pushes `ADDON, ns` the way WoW passes them to each addon file; returns the count.
function pushAddonArgs(L) {
  lua.lua_pushstring(L, to_luastring(ADDON));
  lua.lua_getglobal(L, to_luastring("__wfgNs"));
  return 2;
}

// Loads and runs a chunk, leaving nresults on the stack. Errors throw.
function run(L, source, chunkName, withAddonArgs, nresults) {
  const status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(chunkName));
  if (status !== lua.LUA_OK) throwTop(L, chunkName);
  const nargs = withAddonArgs ? pushAddonArgs(L) : 0;
  if (lua.lua_pcall(L, nargs, nresults, 0) !== lua.LUA_OK) throwTop(L, chunkName);
}

// A fresh Lua state with the standard libraries.
function newState() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  return L;
}

// Runs a plain Lua file (e.g. a WTF SavedVariables file) in a bare state
// and returns the named globals as JS.
export function readLuaGlobals(source, names) {
  const L = newState();
  run(L, source, "=SavedVariables", false, 0);
  const out = {};
  for (const name of names) {
    lua.lua_getglobal(L, to_luastring(name));
    out[name] = toJs(L, -1);
    lua.lua_pop(L, 1);
  }
  return out;
}

// Loads the widget API list and the WoW stub, then an empty addon namespace.
function loadStub(L) {
  const apiPath = path.join(root, "scripts/lib/wow-widget-api.lua");
  run(L, fs.readFileSync(apiPath, "utf8"), "@wow-widget-api.lua", false, 1);
  lua.lua_setglobal(L, to_luastring("__wfgWidgetApi"));
  const stubPath = path.join(root, "scripts/lib/wow-stub.lua");
  run(L, fs.readFileSync(stubPath, "utf8"), "@wow-stub.lua", false, 0);
  run(L, "__wfgNs = {}", "=ns", false, 0);
}

// Loads every TOC file in order, then the SavedVariables source if any.
function loadAddon(L, savedVariables) {
  for (const file of tocFiles()) {
    run(L, fs.readFileSync(path.join(root, file), "utf8"), `@${file}`, true, 0);
  }
  if (savedVariables) run(L, savedVariables, "=SavedVariables", false, 0);
}

// Runs Lua with `ADDON, ns` in scope and returns the first result as JS.
function evalIn(L, source) {
  run(L, `local ADDON, ns = ...\n${source}`, "=eval", true, 1);
  const value = toJs(L, -1);
  lua.lua_pop(L, 1);
  return value;
}

// Test driving: events, clock, slash commands and chat.
function drivers(addon) {
  return {
    // Fires a WoW event with JS arguments.
    fire: (event, ...args) => addon.eval(`__wfgStub.fire(${[event, ...args].map((v) => luaValue(v)).join(", ")})`),
    // One frame of `elapsed` seconds.
    update: (elapsed) => addon.eval(`__wfgStub.update(${Number(elapsed)})`),
    // Advances the clock in frames so throttled OnUpdate drivers tick.
    advance: (seconds, step = 0.25) => addon.eval(`__wfgStub.advance(${Number(seconds)}, ${Number(step)})`),
    // Runs /fui <msg>.
    slash: (msg) => addon.eval(`SlashCmdList.FOREVERUI(${luaString(msg)})`),
    // Chat lines so far; clearChat forgets them.
    chat: () => addon.eval("return __wfgStub.chat") || [],
    clearChat: () => addon.eval("__wfgStub.clearChat()"),
  };
}

// Login and SavedVariables, as WoW sequences them.
function lifecycle(addon) {
  return {
    // ADDON_LOADED then PLAYER_LOGIN.
    login: () => {
      addon.fire("ADDON_LOADED", ADDON);
      addon.fire("PLAYER_LOGIN");
    },
    // The account and character SavedVariables tables.
    savedVariables: () => ({ account: addon.eval("return ForeverUIDB"), char: addon.eval("return ForeverUICharDB") }),
  };
}

// savedVariables: Lua source run after the addon files and before
// ADDON_LOADED, which is when WoW restores SavedVariables.
export function createAddon({ savedVariables = "" } = {}) {
  const L = newState();
  loadStub(L);
  loadAddon(L, savedVariables);
  const addon = {
    L,
    // Runs Lua with `ADDON, ns` in scope and returns the first result as JS.
    eval: (source) => evalIn(L, source),
  };
  return Object.assign(addon, drivers(addon), lifecycle(addon));
}
