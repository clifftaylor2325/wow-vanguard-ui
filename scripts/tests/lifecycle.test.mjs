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

// The addon logged in with the heavy modules off, the test modules registered, and `saved` Lua run after the
// saved variables (module switches).
function lifeAddon(saved = "", extra = MODULES) {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + saved });
  addon.eval(extra);
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
  addon.eval(MODULES);
  addon.fire("ADDON_LOADED", "Vanguard");
  addon.eval('ns.SetModuleEnabled("TestParent", false)');
  expect(addon.eval('return { ns.ModuleLive("TestParent"), ns.ModuleLive("TestChild"), ns.ModuleLive("TestReload"), ns.ModulesBuilt() }')).toEqual([false, false, true, false]);
  expect(takeLog(addon)).toEqual([]);
});
