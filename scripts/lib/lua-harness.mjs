// Run the real addon Lua under Node (fengari, Lua 5.3) inside a TEST-ONLY
// headless client: the widget stub (wow-stub.lua), its layout (wow-layout.lua)
// and the game world (wow-world.lua). Files load in TOC order with the same
// (ADDON, ns) varargs WoW passes. A worker compiles each file once and loads
// every later addon from the compiled chunks (see chunkCache).
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
import { LuaSource, luaString, luaValue } from "./lua-emit.mjs";
import { lineHook } from "./lua-coverage.mjs";
import { profileSampler } from "./lua-profile.mjs";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

export const ADDON = "Vanguard";

// The two clients the TOC declares (## Interface: 16001, 120007). The world
// starts as WoW Forever; RETAIL_CLIENT, passed to createAddon as `client`,
// makes it a Retail 12.x client before the addon's files load.
export const FOREVER_CLIENT = "";
export const RETAIL_CLIENT = '__wfgWorld.build.version, __wfgWorld.build.interface = "12.0.7", 120007';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Lua 5.1 fidelity for `..`: the game prints a whole float as "3", fengari
// (5.3) as "3.0". Concatenation converts through this one function, which
// wow-stub.lua cannot reach, so it is patched here; tostring and
// string.format are shimmed in the stub. Vitest evaluates this module once
// per test file while fengari itself is shared by the worker, so the patch
// marks itself and is applied once.
if (!lobject.luaO_tostring.__wfgPatched) {
  const rawToString = lobject.luaO_tostring;
  lobject.luaO_tostring = function (L, obj) {
    rawToString(L, obj);
    const s = obj.jsstring();
    if (/^-?\d+\.0$/.test(s)) obj.setsvalue(lstring.luaS_new(L, to_luastring(s.slice(0, -2))));
  };
  lobject.luaO_tostring.__wfgPatched = true;
}

// Compiled chunks, so a worker parses each Lua file once however many
// addons its test file loads: file -> { stamp, bytes } with the bytes from
// lua_dump (line info kept, so tracebacks and coverage read as from source).
// It lives on globalThis because Vitest evaluates this module once per test file.
const chunkCache = (globalThis[Symbol.for("foreverui.chunks")] ??= new Map());

// A file's cache stamp: its modification time and size, so an edit recompiles it.
function stampOf(file) {
  const stat = fs.statSync(file);
  return `${stat.mtimeMs}:${stat.size}`;
}

// The binary chunk of the compiled function on top of the stack (lua_dump, line info kept).
function dumpTop(L) {
  const parts = [];
  lua.lua_dump(L, (L, bytes, size) => { parts.push(bytes.slice(0, size)); return 0; }, null, 0);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

// Pushes the compiled chunk of a Lua file, from the cache when the file is
// unchanged, else by parsing it (and caching the result). Errors throw.
export function pushFileChunk(L, file, chunkName) {
  const stamp = stampOf(file);
  const cached = chunkCache.get(file);
  if (cached && cached.stamp === stamp) {
    if (lauxlib.luaL_loadbufferx(L, cached.bytes, null, to_luastring(chunkName), to_luastring("b")) !== lua.LUA_OK) throwTop(L, chunkName);
    return;
  }
  const source = fs.readFileSync(file, "utf8");
  if (lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(chunkName)) !== lua.LUA_OK) throwTop(L, chunkName);
  chunkCache.set(file, { stamp, bytes: dumpTop(L) });
}

// Whether a file's compiled chunk is in the cache (for the harness's own tests).
export const hasCachedChunk = (file) => chunkCache.has(file);

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

// Hooks -------------------------------------------------------------------------------------
// Every addon state gets one debug hook: the coverage line hook when npm run coverage asks
// for it, and always a count hook that stops a runaway. Lua that runs more instructions in
// one call from the tests (an eval, an event, a frame, a file load) than the budget raises
// an error with a traceback, where a test timeout can't reach (the call is synchronous):
// without it a looping test once grew a CI worker for 23 minutes until it died out of memory.

// Instructions between two count hooks (how often the budget is checked).
const COUNT_EVERY = 1000;
// The budget a state gets unless createAddon is told another.
const DEFAULT_BUDGET = Number(process.env.LUA_INSTRUCTION_BUDGET) || 5e8;
// Each state's budget and how much of it the current call has used.
const budgets = new WeakMap();

// Starts the current call's count from zero (a state without a budget is left alone).
function resetBudget(L) {
  const b = budgets.get(L);
  if (b) b.used = 0;
}

// Counts COUNT_EVERY more instructions, and raises a Lua error once the call is past its budget.
function countHook(L) {
  const b = budgets.get(L);
  b.used += COUNT_EVERY;
  if (b.used <= b.limit) return;
  lauxlib.luaL_error(L, to_luastring(`Lua ran ${b.limit} instructions in one call from the tests: a runaway loop? (createAddon's instructionBudget, or LUA_INSTRUCTION_BUDGET, raises it)`));
}

// Sets the state's one hook: the count hook, the coverage line hook when coverage is on,
// and the profiler's sampler on each count event when LUA_PROFILE is set.
function attachHooks(L, limit) {
  budgets.set(L, { limit, used: 0 });
  const onLine = process.env.LUA_COVERAGE ? lineHook() : null;
  const sample = process.env.LUA_PROFILE ? profileSampler() : null;
  // A count event: the budget check, then the profiler's sample.
  const onCount = (state) => { countHook(state); if (sample) sample(state); };
  // Line events go to coverage, count events to the budget (and the profiler).
  const hook = (state, ar) => (ar.event === lua.LUA_HOOKLINE ? onLine(state, ar) : onCount(state));
  lua.lua_sethook(L, hook, lua.LUA_MASKCOUNT | (onLine ? lua.LUA_MASKLINE : 0), COUNT_EVERY);
}

// The message handler for pcall: the error with a Lua traceback (test and
// harness frames trimmed), so a failure says where in the addon it happened.
function traceback(L) {
  const msg = lua.lua_tojsstring(L, 1) ?? "<non-string error>";
  lauxlib.luaL_traceback(L, L, to_luastring(msg), 1);
  const [first, ...rest] = lua.lua_tojsstring(L, -1).split("\n");
  const lines = [first, ...rest.filter((l) => !/\[C\]: in \?$|wow-stub\.lua|wow-world\.lua|wow-layout\.lua|wow-taint\.lua|wow-inspect\.lua/.test(l))];
  lua.lua_pushstring(L, to_luastring(lines.join("\n")));
  return 1;
}

// Runs the chunk that `push` leaves on the stack, with the traceback handler
// under it, leaving nresults. Errors throw with a traceback.
function runPushed(L, push, chunkName, withAddonArgs, nresults) {
  resetBudget(L);
  lua.lua_pushjsfunction(L, traceback);
  const base = lua.lua_gettop(L);
  push();
  const nargs = withAddonArgs ? pushAddonArgs(L) : 0;
  if (lua.lua_pcall(L, nargs, nresults, base) !== lua.LUA_OK) throwTop(L, chunkName);
  lua.lua_remove(L, base);
}

// Loads and runs Lua source, leaving nresults on the stack.
function run(L, source, chunkName, withAddonArgs, nresults) {
  runPushed(L, () => {
    if (lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(chunkName)) !== lua.LUA_OK) throwTop(L, chunkName);
  }, chunkName, withAddonArgs, nresults);
}

// Loads and runs a Lua file through the chunk cache, leaving nresults on the stack.
function runFile(L, file, chunkName, withAddonArgs, nresults) {
  runPushed(L, () => pushFileChunk(L, file, chunkName), chunkName, withAddonArgs, nresults);
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
  runFile(L, path.join(root, "scripts/lib", name), `@${name}`, false, nresults);
}

// __wfgUserdata(fields): a full userdata that reads its fields and methods from
// the table `fields`, as the client's script objects that are not frames (a
// duration object is one: type() says "userdata", not "table").
function newUserdata(L) {
  lua.lua_newuserdata(L, 0);
  lua.lua_createtable(L, 0, 1);
  lua.lua_pushvalue(L, 1);
  lua.lua_setfield(L, -2, to_luastring("__index"));
  lua.lua_setmetatable(L, -2);
  return 1;
}

// Loads the widget API list, the WoW stub, its layout, the world, the taint rules, and an empty addon namespace.
function loadStub(L) {
  lua.lua_pushjsfunction(L, newUserdata);
  lua.lua_setglobal(L, to_luastring("__wfgUserdata"));
  runLib(L, "wow-widget-api.lua", 1);
  lua.lua_setglobal(L, to_luastring("__wfgWidgetApi"));
  runLib(L, "wow-stub.lua");
  runLib(L, "wow-layout.lua");
  runLib(L, "wow-world.lua");
  runLib(L, "wow-taint.lua");
  run(L, "__wfgNs = {}; __wfgStub.firstAddonFrame = #__wfgStub.frames", "=ns", false, 0);
}

// Loads every TOC file in order, then the SavedVariables source if any.
function loadAddon(L, savedVariables) {
  for (const file of tocFiles()) {
    runFile(L, path.join(root, file), `@${file}`, true, 0);
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
    // Runs /vg <msg>.
    slash: (msg) => addon.eval(`SlashCmdList.VANGUARD(${luaString(msg)})`),
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
    savedVariables: () => ({ account: addon.eval("return VanguardDB"), char: addon.eval("return VanguardCharDB") }),
  };
}

// The world's changers (scripts/lib/wow-world.lua), each firing the client's events:
//   unit(token)                    a unit's fields (null when it does not exist)
//   setUnit(token, fields)         creates or updates a unit: { name, hp, maxhp, class, reaction... }
//   removeUnit(token)
//   combat(on)                     enters or leaves combat
//   secretGeometry(mode)           "derived", "strict" or null: geometry getters answer with secrets (scripts/lib/wow-taint.lua)
//   addAura(unit, aura)            { name, duration, applications, isHarmful, dispelName, sourceUnit }
//   removeAura(unit, name)
//   setAction(slot, fields)        a spell (by world spell id) or any action fields; null clears
//   addQuest(quest), openNpc(data)
//   learn(id, fields)              a spell in the spellbook: { name, icon, rank, helpful, passive, offSpec }
//   forgetAll()                    an empty spellbook
//   openAuctionHouse(), closeAuctionHouse()   the auction house window and its events
//   postFromBag(bag, slot)         a bag item clicked with the auction house open (its SetPostItem)
//   finishPost(auctionID)          the house took the post ah.throttle held (the throttle ready again)
//   fireAuctionEvents(key, id)     every auction house event once
//   openMailbox()                  the mailbox opens: MAIL_SHOW, then the inbox (world.mail) arrives
//   openMailWindow()               the mail window shows with the mailbox; showSendMail() its Send Mail tab; closeMailWindow() fires MAIL_CLOSED
//   openProfession(recipeID), selectRecipe(recipeID), closeProfession()   the profession window and its recipe form
//   addChatBubble(text, opts)      a chat bubble over a speaker's head (CHAT_MSG_SAY, or opts.event, fires); opts { forbidden, empty, unkeyed, event }; returns its index
const WORLD_CALLS = ["unit", "setUnit", "removeUnit", "combat", "secretGeometry", "addAura", "removeAura", "setAction", "addQuest", "openNpc", "learn", "forgetAll",
  "openAuctionHouse", "closeAuctionHouse", "postFromBag", "finishPost", "fireAuctionEvents", "openMailbox", "openMailWindow", "showSendMail", "closeMailWindow", "openProfession", "selectRecipe", "closeProfession",
  "addChatBubble"];

// The world: what the game API reports, from JS.
function worldApi(addon) {
  const api = {
    // A secret value, as the client hides numbers in instanced combat: made by
    // wow-world.lua's world.secret when the call reaches Lua, so it carries the
    // metatable that refuses arithmetic, comparison and field reads.
    secret: (n) => new LuaSource(`__wfgWorld.secret(${luaValue(n)})`),
    // Any world field: get("money"), set("money", 5).
    get: (field) => addon.eval(`return __wfgWorld.${field}`),
    set: (field, value) => addon.eval(`__wfgWorld.${field} = ${luaValue(value)}`),
    // Removes a client API the test wants absent (an older or stricter client).
    without: (...names) => addon.eval(names.map((n) => `${n} = nil`).join("\n")),
  };
  for (const fn of WORLD_CALLS) api[fn] = (...rest) => addon.eval(`return __wfgWorld.${fn}(${args(rest)})`);
  return api;
}

// Lua for a frame by global name with optional fields ("Vanguard_player.health"),
// a `ns` path (ns.GetModule("X").frame) or a widget id.
function frameRef(ref) {
  if (typeof ref === "number") return `__wfgStub.frames[${ref}]`;
  if (/^ns[.\[]/.test(ref)) return ref;
  const [name, ...fields] = ref.split(".");
  return `_G[${luaString(name)}]${fields.map((f) => `.${f}`).join("")}`;
}

// The Lua file that builds a frame's snapshot (see wow-inspect.lua for the fields),
// loaded through the chunk cache like the other stub files.
const INSPECT = path.join(root, "scripts/lib/wow-inspect.lua");

// A Lua list result as a JS array (an empty Lua table converts to {}).
const list = (value) => (Array.isArray(value) ? value : []);

// Frame inspectors: what a frame draws, as plain JS.
function inspectors(addon) {
  runFile(addon.L, INSPECT, "@wow-inspect.lua", false, 0);
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

// Every addon createAddon built since the last test ended. The array lives on
// globalThis because the global afterEach in scripts/tests/setup.mjs reaches
// the same one through the symbol (setup.mjs runs for the quick project too, so
// it never imports this module) and empties it in place: only push and
// splice(0) touch it, so every module keeps holding the one array.
export const createdAddons = (globalThis[Symbol.for("vanguard.addons")] ??= []);

// Lua that keeps what ns.ClearErrors drops: the entries it is about to forget
// go into __wfgCleared first, so the error guard still judges them.
const HARVEST = `
  __wfgCleared = {}
  local kept = ns.ClearErrors
  ns.ClearErrors = function(...)
    for i = 1, #ns.errors do __wfgCleared[#__wfgCleared + 1] = ns.errors[i] end
    return kept(...)
  end
`;

// Registers an addon for the error guard and starts keeping the errors ns.ClearErrors forgets.
function track(addon) {
  addon.eval(HARVEST);
  createdAddons.push(addon);
}

// savedVariables: Lua source run after the addon files and before
// ADDON_LOADED, which is when WoW restores SavedVariables. client: Lua run
// after the client is up and before the addon's files load (the client the
// addon finds as it loads, e.g. RETAIL_CLIENT). instructionBudget: the most
// instructions one call from the tests may run (see Hooks above).
export function createAddon({ savedVariables = "", client = "", instructionBudget = DEFAULT_BUDGET } = {}) {
  const L = newState();
  attachHooks(L, instructionBudget);
  loadStub(L);
  if (client) run(L, client, "=client", false, 0);
  loadAddon(L, savedVariables);
  // Runs Lua with `ADDON, ns` in scope and returns the first result as JS.
  const addon = { L, eval: (source) => evalIn(L, source) };
  Object.assign(addon, drivers(addon), lifecycle(addon), inspectors(addon), input(addon));
  addon.world = worldApi(addon);
  track(addon);
  return addon;
}
