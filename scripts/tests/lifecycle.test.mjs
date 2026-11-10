// The module lifecycle (Core/Modules.lua, docs/design/MODULE-LIFECYCLE.md), exercised by TEST-ONLY modules
// registered before login: declared dependencies, the login pass in load order, live start and stop, late
// enable, rebuilds, switches made in a fight, and the reload-only modules that wait. No real module declares
// live yet (A4-2a), so these modules are the only ones the registry starts or stops mid-session.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE, chatHas, expectErrors, setCombat } from "./helpers.mjs";

// TEST-ONLY modules, each logging "on <name>" from Enable and "off <name>" from Disable into __life.log:
// TestParent and its TestChild are live; TestReload is reload-only, with the live TestKept on it.
const MODULES = `
  __life = { log = {} }
  local function mod(name, def)
    local m = ns.Module(name, def)
    function m.Enable() table.insert(__life.log, "on " .. name) end
    function m.Disable() table.insert(__life.log, "off " .. name) end
    return m
  end
  mod("TestParent", { defaults = {}, live = true })
  mod("TestChild", { defaults = {}, live = true, requires = { "TestParent" }, afterOff = "Test child keeps its font until you reload." })
  mod("TestReload", { defaults = {}, reload = "It replaces a game frame." })
  mod("TestKept", { defaults = {}, live = true, requires = { "TestReload" } })
`;

// Lua that switches these modules off in the Default profile before login.
const off = (...names) => names.map((n) => `\nVanguardDB.profiles.Default.modules.${n} = false`).join("");

// Runs Lua as a file of the addon's (the taint rules count its frames as the addon's, as a module's are).
const asAddon = (addon, lua) => addon.eval(`assert(load(${JSON.stringify(`local ADDON, ns = ...\n${lua}`)}, "@Modules/TEST-ONLY.lua"))("Vanguard", ns)`);

// The addon logged in with the heavy modules off, the test modules registered, and `saved` Lua run after the
// saved variables (module switches).
function lifeAddon(saved = "", extra = MODULES) {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + saved });
  asAddon(addon, extra);
  addon.login();
  return addon;
}

// A Lua list as a JS array (an empty Lua table comes back as {}).
const list = (value) => (Array.isArray(value) ? value : Object.values(value));

// The log so far, emptied.
const takeLog = (addon) => list(addon.eval("local out = __life.log __life.log = {} return out"));

// The modules waiting for a reload (ns.ModulesWaiting).
const waiting = (addon) => list(addon.eval("return ns.ModulesWaiting()"));

// Whether each module is running now (ns.ModuleLive), as { name: boolean }.
const live = (addon, ...names) => Object.fromEntries(names.map((n) => [n, addon.eval(`return ns.ModuleLive("${n}")`)]));

it("lifecycle: login builds the modules in load order, parents first", () => {
  expect(takeLog(lifeAddon())).toEqual(["on TestParent", "on TestChild", "on TestReload", "on TestKept"]);
});

it("lifecycle: a live parent switched off stops its live child first, and on again starts it first", () => {
  const addon = lifeAddon();
  takeLog(addon);
  addon.eval('ns.SetModuleEnabled("TestParent", false)');
  expect(takeLog(addon)).toEqual(["off TestChild", "off TestParent"]);
  expect(live(addon, "TestParent", "TestChild")).toEqual({ TestParent: false, TestChild: false });
  addon.eval('ns.SetModuleEnabled("TestParent", true)');
  expect(takeLog(addon)).toEqual(["on TestParent", "on TestChild"]);
});

it("lifecycle: a live module switched off says what stays until a reload, when it declared it", () => {
  const addon = lifeAddon();
  addon.eval('ns.SetModuleEnabled("TestChild", false)');
  expect(chatHas(addon, /Test child keeps its font until you reload\./)).toBe(true);
});

it("lifecycle: a child switched on while its parent is off waits for the parent", () => {
  const addon = lifeAddon(off("TestParent", "TestChild"));
  expect(takeLog(addon)).toEqual(["on TestReload", "on TestKept"]);
  addon.eval('ns.SetModuleEnabled("TestChild", true)');
  expect(takeLog(addon)).toEqual([]);
  expect(addon.eval('return ns.ModuleWanted("TestChild")')).toBe(false);
  addon.eval('ns.SetModuleEnabled("TestParent", true)');
  expect(takeLog(addon)).toEqual(["on TestParent", "on TestChild"]);
});

it("lifecycle: a module switched off at login is built when switched on (late enable)", () => {
  const addon = lifeAddon(off("TestParent"));
  expect(live(addon, "TestParent", "TestChild")).toEqual({ TestParent: false, TestChild: false });
  addon.eval('ns.SetModuleEnabled("TestParent", true)');
  expect(live(addon, "TestParent", "TestChild")).toEqual({ TestParent: true, TestChild: true });
});

it("lifecycle: a reload-only parent switched off keeps itself and its live child until the reload, and both wait", () => {
  const addon = lifeAddon();
  takeLog(addon);
  addon.eval('ns.SetModuleEnabled("TestReload", false)');
  expect(takeLog(addon)).toEqual(["off TestReload"]);
  expect(live(addon, "TestReload", "TestKept")).toEqual({ TestReload: true, TestKept: true });
  expect(waiting(addon)).toEqual(["TestReload", "TestKept"]);
  addon.eval('ns.SetModuleEnabled("TestReload", true)');
  expect(waiting(addon)).toEqual([]);
});

it("lifecycle: a live child of a reload-only parent that was off at login does not start before the reload", () => {
  const addon = lifeAddon(off("TestReload"));
  expect(live(addon, "TestReload", "TestKept")).toEqual({ TestReload: false, TestKept: false });
  addon.eval('ns.SetModuleEnabled("TestReload", true)');
  expect(live(addon, "TestKept")).toEqual({ TestKept: false });
  expect(waiting(addon)).toEqual(["TestReload"]);
});

it("lifecycle: a rebuild stops and starts a running live module without its after-off line", () => {
  const addon = lifeAddon();
  takeLog(addon);
  addon.eval('ns.RestartModule("TestChild") ns.RestartModule("TestReload") ns.RestartModule("Nothing")');
  expect(takeLog(addon)).toEqual(["off TestChild", "on TestChild"]);
  expect(chatHas(addon, /keeps its font/)).toBe(false);
});

it("lifecycle: a switch made in a fight flips, waits for the fight to end, then applies once", () => {
  const addon = lifeAddon();
  takeLog(addon);
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("TestParent", false) ns.SetModuleEnabled("TestParent", true) ns.SetModuleEnabled("TestChild", false)');
  expect(addon.eval('return { ns.ModuleEnabled("TestChild"), ns.ModuleAwaitsFight("TestChild"), ns.ModuleAwaitsFight("TestParent") }')).toEqual([false, true, false]);
  expect(takeLog(addon)).toEqual([]);
  setCombat(addon, false);
  expect(takeLog(addon)).toEqual(["off TestChild"]);
  expect(addon.eval('return ns.ModuleAwaitsFight("TestChild")')).toBe(false);
});

it("lifecycle: in a fight, a rebuild and a start wait too, and say so", () => {
  const addon = lifeAddon(off("TestParent"));
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("TestParent", true) ns.RestartModule("TestKept")');
  expect(addon.eval('return { ns.ModuleAwaitsFight("TestParent"), ns.ModuleAwaitsFight("TestKept"), ns.ModuleAwaitsFight("TestReload") }')).toEqual([true, true, false]);
  setCombat(addon, false);
  expect(live(addon, "TestParent", "TestChild")).toEqual({ TestParent: true, TestChild: true });
});

it("lifecycle: a live module whose Enable fails is reported and stays off; the next switch tries again", () => {
  expectErrors("module TestBroken: broken on purpose");
  const addon = lifeAddon(off("TestBroken"), `${MODULES}
    local B = ns.Module("TestBroken", { defaults = {}, live = true })
    function B.Enable() error("broken on purpose", 0) end`);
  addon.eval('ns.SetModuleEnabled("TestBroken", true)');
  expect(live(addon, "TestBroken")).toEqual({ TestBroken: false });
});

it("lifecycle: a module that requires one not registered before it is reported, and never runs", () => {
  expectErrors(/^module TestEarly: requires TestLater, which is not registered before it$/);
  const addon = lifeAddon("", `${MODULES}
    local E = ns.Module("TestEarly", { defaults = {}, live = true, requires = { "TestLater" } })
    function E.Enable() table.insert(__life.log, "on TestEarly") end`);
  expect(live(addon, "TestEarly")).toEqual({ TestEarly: false });
});

it("lifecycle: before the login pass, a module counts as live when it is wanted, and nothing settles", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  asAddon(addon, MODULES);
  addon.fire("ADDON_LOADED", "Vanguard");
  addon.eval('ns.SetModuleEnabled("TestParent", false)');
  expect(addon.eval('return { ns.ModuleLive("TestParent"), ns.ModuleLive("TestChild"), ns.ModuleLive("TestReload"), ns.ModulesBuilt() }')).toEqual([false, false, true, false]);
  expect(takeLog(addon)).toEqual([]);
});

// The scope ------------------------------------------------------------------------------------------------------

// A TEST-ONLY live module that registers one of everything through its scope: a mover on its own frame (built once),
// an event, a unit event, a ticker, a visibility rule and a gate on a TEST-ONLY hook list (__life.hooks). Every
// handler counts into __life.calls.
const SCOPED = `${MODULES}
  __life.calls, __life.hooks, __life.scopes = 0, {}, {}
  local S = ns.Module("TestScoped", { defaults = {}, live = true })
  function S.Count() __life.calls = __life.calls + 1 end
  function S.Enable(settings, scope)
    table.insert(__life.scopes, scope)
    S.frame = S.frame or CreateFrame("Frame", "VanguardTest_Scoped", UIParent)
    S.frame:SetSize(40, 20)
    scope:Mover(S.frame, "testscoped", "Test scoped", { "CENTER", "CENTER", 0, 0 })
    S.frame:Show()
    ns.Visibility.ApplyNow(S.frame, "always")
    scope:On("PLAYER_TARGET_CHANGED", S.Count)
    scope:OnUnit({ "UNIT_HEALTH" }, S.Count, "player")
    scope:Every("test scoped", 0.5, S.Count)
    scope:Gate("hook", S.Count, function(gate) table.insert(__life.hooks, gate) end)
  end
`;

// TEST-ONLY: what the addon has registered and shows, for comparing two states: handler counts per event, ticker
// keys, the events each addon frame listens for, the addon frames shown under a parent (by name or kind), frames with a state
// driver, mover keys, open gates, and how many frames there are.
const FOOTPRINT = `
  local stub = __wfgStub
  local out = { handlers = ns.HandlerCounts(), tickers = {}, events = {}, shown = {}, drivers = 0, movers = {}, gates = 0 }
  for key in pairs(ns.ticker.vgJobs) do out.tickers[#out.tickers + 1] = tostring(key) end
  for _, w in ipairs(stub.frames) do
    if w.__id > stub.firstAddonFrame then
      for event in pairs(w.__events) do out.events[#out.events + 1] = event end
      if w.__parent and w:IsVisible() then out.shown[#out.shown + 1] = w.__name or w.__kind end
      if w.__states and next(w.__states) then out.drivers = out.drivers + 1 end
    end
  end
  for i, m in ipairs(ns.MoverList()) do out.movers[i] = m.key end
  for _, list in ipairs({ out.tickers, out.events, out.shown, out.movers }) do table.sort(list) end
  for _, name in ipairs(ns.ModuleNames()) do
    local scope = ns.GetModule(name).scope
    if scope and scope.on then out.gates = out.gates + scope.gateCount end
  end
  out.frames = #stub.frames
  return out
`;

// The footprint now, without the frame count (a stopped module's frames stay: the client never frees one).
function footprint(addon, { frames = false } = {}) {
  const f = addon.eval(FOOTPRINT);
  if (!frames) delete f.frames;
  return f;
}

it("lifecycle: a module that declares nothing gets no scope; one that declares live or reload gets one", () => {
  const addon = lifeAddon("", `${MODULES}
    local P = ns.Module("TestPlain", { defaults = {} })
    function P.Enable(settings, scope) __life.plain = scope == nil end`);
  expect(addon.eval("return __life.plain")).toBe(true);
  expect(addon.eval('return { ns.GetModule("TestParent").scope ~= nil, ns.GetModule("TestReload").scope ~= nil }')).toEqual([true, true]);
});

it("lifecycle: switched off live, a module leaves what a login with it off leaves", () => {
  const offAtLogin = footprint(lifeAddon(off("TestScoped"), SCOPED));
  const addon = lifeAddon("", SCOPED);
  addon.eval('ns.SetModuleEnabled("TestScoped", false)');
  expect(footprint(addon)).toEqual(offAtLogin);
});

it("lifecycle: switched on late, a module has the footprint of a login with it on", () => {
  const onAtLogin = footprint(lifeAddon("", SCOPED), { frames: true });
  const addon = lifeAddon(off("TestScoped"), SCOPED);
  addon.eval('ns.SetModuleEnabled("TestScoped", true)');
  expect(footprint(addon, { frames: true })).toEqual(onAtLogin);
});

it("lifecycle: toggled three times, a module makes no new frame, handler or gate", () => {
  const addon = lifeAddon("", SCOPED);
  const first = footprint(addon, { frames: true });
  for (let i = 0; i < 3; i++) addon.eval('ns.SetModuleEnabled("TestScoped", false) ns.SetModuleEnabled("TestScoped", true)');
  expect(footprint(addon, { frames: true })).toEqual(first);
  expect(addon.eval("return #__life.hooks")).toBe(1);
});

it("lifecycle: a stopped module's handlers, unit events, ticker and gate stop calling it, and start again with it", () => {
  const addon = lifeAddon("", SCOPED);
  // Fires each thing the module listens to, and says how many calls reached it.
  const poke = () => {
    addon.eval("__life.calls = 0 __life.hooks[1]()");
    addon.fire("PLAYER_TARGET_CHANGED");
    addon.fire("UNIT_HEALTH", "player");
    addon.advance(1);
    return addon.eval("return __life.calls");
  };
  const running = poke();
  expect(running).toBeGreaterThanOrEqual(4);
  addon.eval('ns.SetModuleEnabled("TestScoped", false)');
  expect(poke()).toBe(0);
  addon.eval('ns.SetModuleEnabled("TestScoped", true)');
  expect(poke()).toBe(running);
});

it("lifecycle: a scope is kept for the session, and takes one handler off or one ticker away on request", () => {
  const addon = lifeAddon("", SCOPED);
  addon.eval('ns.SetModuleEnabled("TestScoped", false) ns.SetModuleEnabled("TestScoped", true)');
  expect(addon.eval("return __life.scopes[1] == __life.scopes[2] and __life.scopes[1]:Running()")).toBe(true);
  addon.eval('local s = __life.scopes[1] s:Off("PLAYER_TARGET_CHANGED", ns.GetModule("TestScoped").Count) s:Off("PLAYER_TARGET_CHANGED", print) s:Every("test scoped", nil)');
  expect(footprint(addon).tickers).not.toContain("test scoped");
  expect(footprint(addon).handlers.PLAYER_TARGET_CHANGED ?? 0).toBe(footprint(lifeAddon(off("TestScoped"), SCOPED)).handlers.PLAYER_TARGET_CHANGED ?? 0);
});

it("lifecycle: a stopped module's mover leaves unlock mode and keeps its spot, and comes back with its handle", () => {
  const addon = lifeAddon("", SCOPED);
  addon.eval('ns.SetMoverPoint("testscoped", "CENTER", "CENTER", 100, 50) ns.Unlock()');
  addon.eval('ns.SetModuleEnabled("TestScoped", false)');
  expect(addon.eval('local keys = {} for _, m in ipairs(ns.MoverList()) do keys[m.key] = true end return keys.testscoped == nil')).toBe(true);
  expect(addon.eval('return { ns.MoverSaved("testscoped"), VanguardTest_Scoped:IsShown() }')).toEqual([true, false]);
  const frames = addon.eval("return #__wfgStub.frames");
  addon.eval('ns.SetModuleEnabled("TestScoped", true)');
  expect(addon.eval("return #__wfgStub.frames")).toBe(frames);
  expect(addon.eval('local _, _, _, x, y = VanguardTest_Scoped:GetPoint(1) return { x, y }')).toEqual([100, 50]);
  addon.eval("ns.Lock()");
});

it("lifecycle: a module whose Enable fails after registering has what it registered released", () => {
  expectErrors("module TestHalf: half built");
  const addon = lifeAddon("", `${MODULES}
    local H = ns.Module("TestHalf", { defaults = {}, live = true })
    function H.Enable(settings, scope) scope:On("PLAYER_TARGET_CHANGED", print) error("half built", 0) end`);
  const plain = lifeAddon();
  expect(footprint(addon).handlers).toEqual(footprint(plain).handlers);
});
