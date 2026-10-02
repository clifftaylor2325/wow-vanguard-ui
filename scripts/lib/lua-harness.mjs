// Run the real addon Lua under Node (fengari, Lua 5.3) inside a TEST-ONLY
// headless client: the widget stub (wow-stub.lua), its layout (wow-layout.lua)
// and the game world (wow-world.lua). Files load in TOC order with the same
// (ADDON, ns) varargs WoW passes.
//
// createAddon() gives a loaded addon with drivers (fire, update, advance,
// slash, chat), a lifecycle (login, savedVariables), the world (units,
// auras, actions, combat...), frame inspectors (frame, frames, screen) and
// input (click, hover, wheel, key, drag, type). scripts/tests/README.md
// shows how a scenario test reads.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fengari from "fengari";
import lobject from "fengari/src/lobject.js";
import lstring from "fengari/src/lstring.js";
import { luaString, luaValue } from "./lua-emit.mjs";
import { attachCoverage } from "./lua-coverage.mjs";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

export const ADDON = "ForeverUI";
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Lua 5.1 fidelity for `..`: the game prints a whole float as "3", fengari
// (5.3) as "3.0". Concatenation converts through this one function, which
// wow-stub.lua cannot reach, so it is patched here; tostring and
// string.format are shimmed in the stub.
const rawToString = lobject.luaO_tostring;
lobject.luaO_tostring = function (L, obj) {
  rawToString(L, obj);
  const s = obj.jsstring();
  if (/^-?\d+\.0$/.test(s)) obj.setsvalue(lstring.luaS_new(L, to_luastring(s.slice(0, -2))));
};

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
  lua.lua_checkstack(L, 4);
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
  const kind = depth > 0 && widgetField(L, idx, "__kind");
  if (kind) return `<${kind} ${widgetField(L, idx, "__name") ?? widgetField(L, idx, "__id")}>`;
  return entriesToJs(tableEntries(L, idx, depth));
}

// A raw string or number field of the table at idx (null when absent): a
// nested widget converts to a short label, not its whole graph of parents.
function widgetField(L, idx, field) {
  lua.lua_checkstack(L, 2);
  lua.lua_pushliteral(L, field);
  lua.lua_rawget(L, idx);
  const type = lua.lua_type(L, -1);
  const value = type === lua.LUA_TSTRING ? lua.lua_tojsstring(L, -1) : type === lua.LUA_TNUMBER ? lua.lua_tonumber(L, -1) : null;
  lua.lua_pop(L, 1);
  return value;
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

// The message handler for pcall: the error with a Lua traceback (test and
// harness frames trimmed), so a failure says where in the addon it happened.
function traceback(L) {
  const msg = lua.lua_tojsstring(L, 1) ?? "<non-string error>";
  lauxlib.luaL_traceback(L, L, to_luastring(msg), 1);
  const [first, ...rest] = lua.lua_tojsstring(L, -1).split("\n");
  const lines = [first, ...rest.filter((l) => !/\[C\]: in \?$|wow-stub\.lua|wow-world\.lua|wow-layout\.lua/.test(l))];
  lua.lua_pushstring(L, to_luastring(lines.join("\n")));
  return 1;
}

// Loads and runs a chunk, leaving nresults on the stack. Errors throw with a traceback.
function run(L, source, chunkName, withAddonArgs, nresults) {
  lua.lua_pushjsfunction(L, traceback);
  const base = lua.lua_gettop(L);
  const status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(chunkName));
  if (status !== lua.LUA_OK) throwTop(L, chunkName);
  const nargs = withAddonArgs ? pushAddonArgs(L) : 0;
  if (lua.lua_pcall(L, nargs, nresults, base) !== lua.LUA_OK) throwTop(L, chunkName);
  lua.lua_remove(L, base);
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

// Runs one of the client's Lua files (scripts/lib/<name>) as "@<name>".
function runLib(L, name, nresults = 0) {
  run(L, fs.readFileSync(path.join(root, "scripts/lib", name), "utf8"), `@${name}`, false, nresults);
}

// Loads the widget API list, the WoW stub, its layout, the world, and an empty addon namespace.
function loadStub(L) {
  runLib(L, "wow-widget-api.lua", 1);
  lua.lua_setglobal(L, to_luastring("__wfgWidgetApi"));
  runLib(L, "wow-stub.lua");
  runLib(L, "wow-layout.lua");
  runLib(L, "wow-world.lua");
  run(L, "__wfgNs = {}; __wfgStub.firstAddonFrame = #__wfgStub.frames", "=ns", false, 0);
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

// Lua arguments from JS values.
const args = (values) => values.map((v) => luaValue(v)).join(", ");

// Test driving: events, clock, slash commands and chat.
function drivers(addon) {
  return {
    // Fires a WoW event with JS arguments.
    fire: (event, ...rest) => addon.eval(`__wfgStub.fire(${args([event, ...rest])})`),
    // One frame of `elapsed` seconds.
    update: (elapsed) => addon.eval(`__wfgStub.update(${Number(elapsed)})`),
    // Advances the clock in frames so throttled OnUpdate drivers tick.
    advance: (seconds, step = 0.25) => addon.eval(`__wfgStub.advance(${Number(seconds)}, ${Number(step)})`),
    // Runs /fui <msg>.
    slash: (msg) => addon.eval(`SlashCmdList.FOREVERUI(${luaString(msg)})`),
    // Chat lines so far; clearChat forgets them.
    chat: () => { const lines = addon.eval("return __wfgStub.chat"); return Array.isArray(lines) ? lines : []; },
    clearChat: () => addon.eval("__wfgStub.clearChat()"),
  };
}

// Login and SavedVariables, as WoW sequences them.
function lifecycle(addon) {
  return {
    // ADDON_LOADED, PLAYER_LOGIN, PLAYER_ENTERING_WORLD.
    login: () => {
      addon.fire("ADDON_LOADED", ADDON);
      addon.fire("PLAYER_LOGIN");
      addon.fire("PLAYER_ENTERING_WORLD", true, false);
    },
    // The account and character SavedVariables tables.
    savedVariables: () => ({ account: addon.eval("return ForeverUIDB"), char: addon.eval("return ForeverUICharDB") }),
  };
}

// The world's changers (scripts/lib/wow-world.lua), each firing the client's events:
//   unit(token)                    a unit's fields (null when it does not exist)
//   setUnit(token, fields)         creates or updates a unit: { name, hp, maxhp, class, reaction... }
//   removeUnit(token)
//   combat(on)                     enters or leaves combat
//   addAura(unit, aura)            { name, duration, applications, isHarmful, dispelName, sourceUnit }
//   removeAura(unit, name)
//   setAction(slot, fields)        a spell (by world spell id) or any action fields; null clears
//   addQuest(quest), openNpc(data)
const WORLD_CALLS = ["unit", "setUnit", "removeUnit", "combat", "addAura", "removeAura", "setAction", "addQuest", "openNpc"];

// The world: what the game API reports, from JS.
function worldApi(addon) {
  const api = {
    // A secret value, as the client hides numbers in instanced combat.
    secret: (n) => ({ __secret: true, n }),
    // Any world field: get("money"), set("money", 5).
    get: (field) => addon.eval(`return __wfgWorld.${field}`),
    set: (field, value) => addon.eval(`__wfgWorld.${field} = ${luaValue(value)}`),
    // Removes a client API the test wants absent (an older or stricter client).
    without: (...names) => addon.eval(names.map((n) => `${n} = nil`).join("\n")),
  };
  for (const fn of WORLD_CALLS) api[fn] = (...rest) => addon.eval(`return __wfgWorld.${fn}(${args(rest)})`);
  return api;
}

// Lua for a frame by global name with optional fields ("ForeverUI_player.health"),
// a `ns` path (ns.GetModule("X").frame) or a widget id.
function frameRef(ref) {
  if (typeof ref === "number") return `__wfgStub.frames[${ref}]`;
  if (/^ns[.\[]/.test(ref)) return ref;
  const [name, ...fields] = ref.split(".");
  return `_G[${luaString(name)}]${fields.map((f) => `.${f}`).join("")}`;
}

// Lua that builds a frame's snapshot (see inspect.lua for the fields).
const INSPECT = fs.readFileSync(path.join(root, "scripts/lib/wow-inspect.lua"), "utf8");

// A Lua list result as a JS array (an empty Lua table converts to {}).
const list = (value) => (Array.isArray(value) ? value : []);

// Frame inspectors: what a frame draws, as plain JS.
function inspectors(addon) {
  addon.eval(INSPECT);
  return {
    // A frame's snapshot: { id, name, kind, shown, visible, rect, text, texture, color, alpha, value, children... }; null when missing.
    frame: (ref) => addon.eval(`local f = ${frameRef(ref)}\nreturn f and __wfgInspect(f)`),
    // Snapshots of every widget that passes a Lua predicate on the widget (`w`).
    frames: (predicate = "true") => list(addon.eval(`return __wfgInspectAll(function(w) return ${predicate} end)`)),
    // The visible top-level frames (anchored, not the game's), with their rects, for overlap checks.
    screen: () => list(addon.eval("return __wfgScreen()")),
    // Every visible font string that reads exactly `text`, else [].
    texts: (text) => list(addon.eval(`return __wfgInspectAll(function(w) return w.__kind == "FontString" and w:IsVisible() and w.__text == ${luaString(text)} end)`)),
    // The first visible frame whose name or text matches a pattern.
    find: (pattern) => addon.eval(`return __wfgFind(${luaString(pattern)})`),
  };
}

// Runs a stub input driver on a frame reference with extra arguments.
function inputCall(addon, fn, ref, rest) {
  return addon.eval(`__wfgStub.${fn}(${frameRef(ref)}${rest.length ? ", " + args(rest) : ""})`);
}

// Input: the mouse and keyboard, by frame reference (a global name, a `ns` path or a widget id).
//   click(ref, button = "LeftButton", down = false)
//   hover(ref)           moves the mouse onto a frame (null: off everything)
//   wheel(ref, delta = 1), key(ref, key)
//   drag(ref, point, x, y)   drags a frame to a point on the screen and drops it
//   type(ref, text), enter(ref)   an edit box's text, and Enter in it
function input(addon) {
  const api = {
    // The mouse onto a frame, a click on it, and the wheel over it.
    hover: (ref) => (ref == null ? addon.eval("__wfgStub.hover(nil)") : inputCall(addon, "hover", ref, [])),
    click: (ref, button, down) => inputCall(addon, "click", ref, [button ?? "LeftButton", down ?? false]),
    wheel: (ref, delta = 1) => inputCall(addon, "wheel", ref, [delta]),
    // Holds or releases modifier keys: keys({ shift: true }).
    keys: (held) => addon.eval(`for k, v in pairs(${luaValue(held)}) do __wfgWorld.keys[k] = v end`),
    // Puts the mouse at screen pixels (for sliders and drags).
    mouse: (x, y) => addon.eval(`__wfgWorld.mouse = { x = ${Number(x)}, y = ${Number(y)} }`),
  };
  for (const fn of ["key", "drag", "type", "enter"]) api[fn] = (ref, ...rest) => inputCall(addon, fn, ref, rest);
  return api;
}

// savedVariables: Lua source run after the addon files and before
// ADDON_LOADED, which is when WoW restores SavedVariables.
export function createAddon({ savedVariables = "" } = {}) {
  const L = newState();
  if (process.env.LUA_COVERAGE) attachCoverage(L);
  loadStub(L);
  loadAddon(L, savedVariables);
  // Runs Lua with `ADDON, ns` in scope and returns the first result as JS.
  const addon = { L, eval: (source) => evalIn(L, source) };
  Object.assign(addon, drivers(addon), lifecycle(addon), inspectors(addon), input(addon));
  addon.world = worldApi(addon);
  return addon;
}
