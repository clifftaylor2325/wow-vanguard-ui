// The module lifecycle (Core/Modules.lua, docs/design/MODULE-LIFECYCLE.md), exercised by TEST-ONLY modules
// registered before login: declared dependencies, the login pass in load order, live start and stop, late
// enable, rebuilds, switches made in a fight, and the reload-only modules that wait. No real module declares
// live yet (A4-2a), so these modules are the only ones the registry starts or stops mid-session.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE, chatHas, expectErrors, setCombat } from "./helpers.mjs";
import { footprint, lifecycleCases, savedNow } from "./lifecycle-helpers.mjs";

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
  mod("TestReload", { defaults = { size = 2 }, reload = "It replaces a game frame." })
  mod("TestKept", { defaults = {}, live = true, requires = { "TestReload" } })
`;

// Lua that switches these modules off in the Default profile before login.
const off = (...names) => names.map((n) => `\nVanguardDB.profiles.Default.modules.${n} = false`).join("");

// Runs Lua as a file of the addon's (the taint rules count its frames as the addon's, as a module's are).
const asAddon = (addon, lua) => addon.eval(`assert(loadstring(${JSON.stringify(`local ADDON, ns = ...\n${lua}`)}, "@Modules/TEST-ONLY.lua"))("Vanguard", ns)`);

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
  expect(waiting(addon), "its Disable ran, so it waits for the reload even switched back on (H44-1-2, pick A)").toEqual(["TestReload"]);
});

it("lifecycle: a reload-only module with no Disable stops waiting when switched back on", () => {
  const addon = lifeAddon("", `${MODULES}
    local P = ns.Module("TestPlain", { defaults = {}, reload = "It replaces a game frame." })
    function P.Enable() end`);
  addon.eval('ns.SetModuleEnabled("TestPlain", false)');
  expect(waiting(addon), "off: waits").toEqual(["TestPlain"]);
  addon.eval('ns.SetModuleEnabled("TestPlain", true)');
  expect(waiting(addon), "on again: nothing was undone, nothing waits").toEqual([]);
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
    __tries, __broken = 0, true
    function B.Enable() __tries = __tries + 1 if __broken then error("broken on purpose", 0) end end`);
  addon.eval('ns.SetModuleEnabled("TestBroken", true)');
  expect(live(addon, "TestBroken")).toEqual({ TestBroken: false });
  addon.eval('__broken = false ns.SetModuleEnabled("TestBroken", false) ns.SetModuleEnabled("TestBroken", true)');
  expect([addon.eval("return __tries"), live(addon, "TestBroken")]).toEqual([2, { TestBroken: true }]);
});

it("lifecycle: a live module that failed at login does not read 'Applies after the fight' when another switch moves in a fight", () => {
  expectErrors("module TestBroken: broken on purpose");
  const addon = lifeAddon("", `${MODULES}
    local B = ns.Module("TestBroken", { defaults = {}, live = true })
    __tries = 0
    function B.Enable() __tries = __tries + 1 error("broken on purpose", 0) end
    ns.Module("TestOther", { defaults = {}, live = true }).Enable = function() end`);
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("TestOther", false)');
  expect(addon.eval('return { ns.ModuleAwaitsFight("TestBroken"), ns.ModuleAwaitsFight("TestOther"), ns.Options.ModuleNote("TestBroken") ~= "Applies after the fight" }'), "the failed module waits for nothing; the switched one does").toEqual([false, true, true]);
  setCombat(addon, false);
  expect([live(addon, "TestBroken"), addon.eval("return __tries")], "after the fight it is still off and was not tried again").toEqual([{ TestBroken: false }, 1]);
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

it("lifecycle: a module that declares nothing gets no scope; one that declares live or reload gets one", () => {
  const addon = lifeAddon("", `${MODULES}
    local P = ns.Module("TestPlain", { defaults = {} })
    function P.Enable(settings, scope) __life.plain = scope == nil end`);
  expect(addon.eval("return __life.plain")).toBe(true);
  expect(addon.eval('return { ns.GetModule("TestParent").scope ~= nil, ns.GetModule("TestReload").scope ~= nil }')).toEqual([true, true]);
});

// The three cases every live module gets (lifecycle-helpers.mjs), on the module that registers one of everything.
lifecycleCases("TestScoped", (saved) => lifeAddon(saved, SCOPED));

it("lifecycle: toggled, a module installs its gate's hook once", () => {
  const addon = lifeAddon("", SCOPED);
  for (let i = 0; i < 3; i++) addon.eval('ns.SetModuleEnabled("TestScoped", false) ns.SetModuleEnabled("TestScoped", true)');
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

// TEST-ONLY TestBudget and TestOther: each fails on every UNIT_HEALTH for the player and on every tick of its ticker,
// counting its calls in __budget.
const BUDGET = `${MODULES}
  __budget = { TestBudget = 0, TestOther = 0 }
  local function failing(name)
    local m = ns.Module(name, { defaults = {}, live = true })
    local function fail() __budget[name] = __budget[name] + 1 error(name .. " fails on purpose", 0) end
    function m.Enable(_, scope) scope:OnUnit("UNIT_HEALTH", fail, "player") scope:Every(name .. " tick", 0.1, fail) end
  end
  failing("TestBudget") failing("TestOther")`;

// Fires UNIT_HEALTH for the player and runs every ticker `times` times.
function failTimes(addon, times) {
  for (let i = 0; i < times; i++) {
    addon.fire("UNIT_HEALTH", "player");
    addon.advance(0.11);
  }
}

it("lifecycle: a unit event handler and a ticker paused by the error budget run again after their module restarts; another module's stay paused", () => {
  const sites = ["TestBudget", "TestOther"].flatMap((n) => [`event UNIT_HEALTH: ${n} fails on purpose`, `ticker ${n} tick: ${n} fails on purpose`]);
  expectErrors(...sites);
  const addon = lifeAddon("", BUDGET);
  failTimes(addon, 10);
  expect(addon.eval("return #ns.paused"), "both modules' handler and ticker paused").toBe(4);
  addon.eval('ns.SetModuleEnabled("TestBudget", false) ns.SetModuleEnabled("TestBudget", true) __budget.TestBudget, __budget.TestOther = 0, 0');
  failTimes(addon, 1);
  expect(addon.eval("return { __budget.TestBudget, __budget.TestOther }"), "the restarted module's two run again, the other's do not").toEqual([2, 0]);
  expect(list(addon.eval("local out = {} for i, p in ipairs(ns.paused) do out[i] = p.where end return out")), "only the other module's are listed").toEqual(["event UNIT_HEALTH", "ticker TestOther tick"]);
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

// Combat ---------------------------------------------------------------------------------------------------------

// A TEST-ONLY live module with a secure button of its own: hiding it is protected, so its stop waits for the fight.
const SECURE = `${MODULES}
  local B = ns.Module("TestSecure", { defaults = {}, live = true })
  function B.Enable(settings, scope)
    B.button = B.button or CreateFrame("Button", "VanguardTest_Secure", UIParent, "SecureActionButtonTemplate")
    B.button:SetSize(20, 20)
    B.button:SetPoint("CENTER")
    scope:Frame(B.button):Show()
  end
`;

it("lifecycle: a module with a secure frame switched off in a fight keeps it until the fight ends, then hides it", () => {
  const addon = lifeAddon("", SECURE);
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("TestSecure", false)');
  expect(addon.eval("return { VanguardTest_Secure:IsShown(), ns.ModuleLive('TestSecure') }")).toEqual([true, true]);
  setCombat(addon, false);
  expect(addon.eval("return { VanguardTest_Secure:IsShown(), ns.ModuleLive('TestSecure') }")).toEqual([false, false]);
});

// The note beside a module's name on the Modules page (the window open there), or null for a row without one.
const moduleNote = (addon, caption) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.ownSwitch ~= nil and w.label.__text == "${caption}" and ns.Options.RevealRow(w) then return w.ownSwitch.__text end end`);

it("lifecycle: a live module's row says its switch applies after the fight, and stops saying so when it has", () => {
  const addon = lifeAddon();
  addon.eval('ns.Options.Show("modules")');
  expect(moduleNote(addon, "TestParent")).toBe("");
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("TestParent", false) ns.Options.Refresh()');
  expect(moduleNote(addon, "TestParent")).toBe("Applies after the fight");
  expect(moduleNote(addon, "TestReload")).toBe(null);
  setCombat(addon, false);
  expect(moduleNote(addon, "TestParent")).toBe("");
});

// The options window ----------------------------------------------------------------------------------------------

// A module row's widget on the shown Modules page, by its caption, as Lua (nil when it isn't shown).
const moduleRowLua = (caption) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.source and w.source[1] == "module" and w.source[2] == "${caption}" and ns.Options.RevealRow(w) then return w end end end)()`;

// The footer's reload notice: shown, and its text.
const notice = (addon) => addon.eval("return { Vanguard_Options.notice:IsShown(), Vanguard_Options.notice:GetText() }");

it("lifecycle: a live module's switch has no reload tag; a reload-only one keeps it, with its reason in the tip", () => {
  const addon = lifeAddon();
  addon.eval('ns.Options.Show("modules")');
  // Whether a module row wears the reload tag, and its tip.
  const tagOf = (caption) => addon.eval(`local w = ${moduleRowLua(caption)} return { w.tag ~= nil, w.source.tip or "" }`);
  expect(tagOf("TestParent")).toEqual([false, ""]);
  expect(tagOf("TestReload")).toEqual([true, "It replaces a game frame.\nTakes effect after /reload."]);
  expect(tagOf("Unit frames")).toEqual([true, "Takes effect after /reload."]);
});

it("lifecycle: a child whose parent is off is greyed, says it needs the parent, and a click jumps to the parent's row", () => {
  const addon = lifeAddon(off("TestParent"));
  addon.eval('ns.Options.Show("modules")');
  expect(moduleNote(addon, "TestChild")).toBe("Needs TestParent");
  expect(addon.eval(`local w = ${moduleRowLua("TestChild")} return { w.label:GetTextColor() }`)).toEqual(addon.eval('return { ns.Theme.RGB("disabled") }'));
  addon.eval(`local w = ${moduleRowLua("TestChild")} w:GetScript("OnClick")(w)`);
  expect(addon.eval('return ns.ModuleEnabled("TestChild")'), "the click switched nothing").toBe(true);
  expect(addon.eval(`local w = ${moduleRowLua("TestParent")} return w.found ~= nil and w.found:IsShown()`), "and marked the parent").toBe(true);
  addon.eval(`local w = ${moduleRowLua("TestParent")} w:GetScript("OnClick")(w)`);
  expect(moduleNote(addon, "TestChild"), "the parent on: the note goes").toBe("");
  expect(live(addon, "TestChild")).toEqual({ TestChild: true });
});

it("lifecycle: a live child of a reload-only parent switched off says it goes with the parent after a reload", () => {
  const addon = lifeAddon();
  addon.eval('ns.Options.Show("modules")');
  addon.eval(`local w = ${moduleRowLua("TestReload")} w:GetScript("OnClick")(w)`);
  expect(moduleNote(addon, "TestKept")).toBe("Off with TestReload after a reload");
});

it("lifecycle: the reload notice names what waits, and goes when the switches are back", () => {
  const addon = lifeAddon();
  addon.eval('ns.Options.Show("modules")');
  expect(notice(addon)).toEqual([false, ""]);
  addon.eval('ns.SetModuleEnabled("TestReload", false)');
  expect(notice(addon)).toEqual([true, "Waiting for a reload: TestReload, TestKept"]);
  addon.eval('ns.SetModuleEnabled("Chat", false)');
  expect(notice(addon)).toEqual([true, "Waiting for a reload: Chat, TestReload and 1 more"]);
  addon.eval('ns.SetModuleEnabled("Chat", true)');
  expect(notice(addon), "Chat has no Disable: back on, it stops waiting").toEqual([true, "Waiting for a reload: TestReload, TestKept"]);
  addon.eval('ns.SetModuleEnabled("TestReload", true)');
  expect(notice(addon), "TestReload's Disable ran, so it is named until the reload (H44-1-2)").toEqual([true, "Waiting for a reload: TestReload"]);
  addon.eval("ns.Options.NeedReload()");
  expect(notice(addon), "a change marked for the reload keeps the usual notice").toEqual([true, "Some changes need a reload"]);
});

it("lifecycle: a reload setting's change is named until it is put back", () => {
  const addon = lifeAddon();
  addon.eval('ns.Options.Show("general") __get, __set = ns.Options.RestartSetting("TestReload", "size")');
  addon.eval("__set(5)");
  expect(notice(addon)).toEqual([true, "Waiting for a reload: TestReload"]);
  addon.eval("__set(4)");
  expect(notice(addon)).toEqual([true, "Waiting for a reload: TestReload"]);
  addon.eval("__set(2)");
  expect(notice(addon)).toEqual([false, ""]);
  expect(addon.eval("return ns.Options.AppliesLive(__set)")).toBe(false);
});

it("lifecycle: a setting row that rebuilds a live module applies at once, with no reload tag on its caption", () => {
  const addon = lifeAddon();
  addon.eval(`ns.Options.AddRows("general", function()
    local get, set = ns.Options.RestartSetting("TestParent", "shape")
    local get2, set2 = ns.Options.RestartSetting("TestReload", "size")
    return { { "header", "TEST-ONLY rows" }, { "check", "TEST-ONLY shape (reload)", get, set }, { "check", "TEST-ONLY size (reload)", get2, set2 } }
  end) ns.Options.Show("general")`);
  // Whether the setting row with this English caption wears the reload tag.
  const tagged = (caption) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.source and w.source.english == "${caption}" then return w.tag ~= nil end end`);
  expect([tagged("TEST-ONLY shape"), tagged("TEST-ONLY size")]).toEqual([false, true]);
  takeLog(addon);
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.source and w.source.english == "TEST-ONLY shape" then w:GetScript("OnClick")(w) end end`);
  expect(takeLog(addon)).toEqual(["off TestParent", "on TestParent"]);
  expect(addon.eval('return ns.Settings("TestParent").shape')).toBe(true);
  expect(notice(addon)).toEqual([false, ""]);
});

it("lifecycle: the reload notice naming two long module names fits the footer, a third longer as a translation", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY), textFit: true });
  addon.login();
  addon.eval('ns.SetModuleEnabled("SpecialBars", false) ns.SetModuleEnabled("MenuStrip", false) ns.SetModuleEnabled("Chat", false) ns.Options.Show("modules")');
  expect(addon.eval("return Vanguard_Options.notice:GetText()")).toMatch(/^Waiting for a reload: Pet, stance and extra buttons.* and 1 more/);
  expect(addon.textFit("Vanguard_Options").filter((f) => /Waiting for a reload/.test(`${f.text} ${f.other ?? ""}`))).toEqual([]);
});

// Live profile switching -------------------------------------------------------------------------------------------

// Saved variables with two profiles, Default and Raid, that switch every real module off, so only the TEST-ONLY
// modules run; `raid` is Lua run on the Raid profile's table (P) to make it differ.
const twoProfiles = (raid = "") => `
  VanguardDB = { version = 2, setupDone = true, profiles = { Default = { modules = {} }, Raid = { modules = {} } } }
  VanguardCharDB = { profile = "Default" }
  local P = VanguardDB.profiles.Raid
  ${raid}
`;

// The TEST-ONLY modules, then every real module switched off in both profiles (before login).
const ONLY_TEST = (extra = "") => `${MODULES}
  ${extra}
  for _, name in ipairs(ns.ModuleNames()) do
    if not name:find("^Test") then VanguardDB.profiles.Default.modules[name] = false VanguardDB.profiles.Raid.modules[name] = false end
  end
`;

// The addon logged in on Default with only the TEST-ONLY modules (TestReload made to rebind when `rebinds`).
function profileAddon(raid = "", extra = "") {
  const addon = createAddon({ savedVariables: twoProfiles(raid) });
  asAddon(addon, ONLY_TEST(extra));
  addon.login();
  return addon;
}

// The rebinding reload-only module: TestReload keeps def.settings and declares rebinds.
const REBINDS = 'local R = ns.GetModule("TestReload") R.rebinds = true function R.Enable(s) R.settings = s table.insert(__life.log, "on TestReload") end';

it("lifecycle: H44-12-1 a profile whose module settings are not a table is compared as missing, not walked", () => {
  const addon = profileAddon("", REBINDS);
  addon.eval("VanguardDB.profiles.Raid.TestReload = 5");
  expect(addon.eval('local ok, err = pcall(ns.PickProfile, "Raid") return { ok, ns.SelectedProfileName() }'), "no error; staged for the reload").toEqual([true, "Raid"]);
});

it("lifecycle: a reload-only module that can't take new settings keeps a profile from applying now, unnamed", () => {
  const addon = profileAddon();
  expect(addon.eval('return { ns.SwitchBlockers("Raid") }')).toEqual([["TestReload"], {}]);
  expect(addon.eval('return { ns.PickProfile("Raid"), VanguardCharDB.profile, VanguardCharDB.pendingProfile, ns.SwitchWaitText("Raid") }')).toEqual([false, "Default", "Raid"]);
});

it("lifecycle: profiles that differ only in live modules switch at once, with the footprint of a login with the new one", () => {
  const raid = 'P.modules.TestChild = false P.TestParent = { shape = true }';
  const atLogin = createAddon({ savedVariables: twoProfiles(raid).replace('profile = "Default"', 'profile = "Raid"') });
  asAddon(atLogin, ONLY_TEST(REBINDS));
  atLogin.login();
  const addon = profileAddon(raid, REBINDS);
  takeLog(addon);
  addon.slash("profile Raid");
  expect(takeLog(addon)).toEqual(["off TestKept", "off TestChild", "off TestParent", "on TestParent", "on TestKept"]);
  expect(addon.eval('return { VanguardCharDB.profile, VanguardCharDB.pendingProfile == nil, ns.Settings("TestParent").shape, ns.GetModule("TestReload").settings == ns.Settings("TestReload") }')).toEqual(["Raid", true, true, true]);
  expect(chatHas(addon, /This character now uses profile Raid\./)).toBe(true);
  expect(footprint(addon, { frames: true })).toEqual(footprint(atLogin, { frames: true }));
});

it("lifecycle: a rebinding module whose settings differ blocks the switch, and the reload offer names it", () => {
  const addon = profileAddon('P.TestReload = { size = 7 }', REBINDS);
  addon.slash("profile Raid");
  expect(addon.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile }")).toEqual(["Default", "Raid"]);
  expect(addon.eval("return Vanguard_Reload.title:GetText()")).toBe("This character will use profile Raid after the reload. TestReload differs in Raid, so the switch waits for a reload. Reload the UI now to apply it?");
});

it("lifecycle: a reload-only module's switch or the theme's reload settings differing block the switch", () => {
  expect(profileAddon("P.modules.TestReload = false", REBINDS).eval('return { ns.SwitchBlockers("Raid") }')).toEqual([["TestReload"], ["TestReload"]]);
  expect(profileAddon("P.theme = { hudShadow = true }", REBINDS).eval('return { ns.SwitchBlockers("Raid") }')).toEqual([["theme"], ["theme"]]);
  expect(profileAddon('P.theme = { variant = "contrast" }', REBINDS).eval('return ns.SwitchWaitText("Raid")')).toBe("the theme differs in Raid, so the switch waits for a reload.");
  expect(profileAddon('P.modules.TestReload = false P.theme = { variant = "contrast" }', REBINDS).eval('return ns.SwitchWaitText("Raid")')).toBe("TestReload, the theme differ in Raid, so the switch waits for a reload.");
  expect(profileAddon("P.TestReload = { size = 2, extra = { 1 } }", REBINDS).eval('return { ns.SwitchBlockers("Raid") }')).toEqual([["TestReload"], ["TestReload"]]);
  expect(profileAddon("P.TestReload = { size = 2 }", REBINDS).eval('return { ns.SwitchBlockers("Raid") }')).toEqual([{}, {}]);
});

it("lifecycle: a profile picked in a fight, or the profile in use picked again, is staged as before", () => {
  const addon = profileAddon("", REBINDS);
  setCombat(addon, true);
  expect(addon.eval('return { ns.PickProfile("Raid"), VanguardCharDB.pendingProfile }')).toEqual([false, "Raid"]);
  setCombat(addon, false);
  expect(addon.eval('return { ns.PickProfile("Default"), VanguardCharDB.profile, VanguardCharDB.pendingProfile == nil }')).toEqual([false, "Default", true]);
});

it("lifecycle: the options window's picker and Use button switch at once when they can, with no reload notice", () => {
  const addon = profileAddon("", REBINDS);
  addon.eval('ns.Options.Show("profiles") ns.NewProfile("Spare")');
  expect(addon.eval('return { ns.PickProfile("Raid"), VanguardCharDB.profile }')).toEqual([true, "Raid"]);
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.use and w.label and w.label.__text == "Default" and ns.Options.RevealRow(w) then w.use:GetScript("OnClick")(w.use) end end');
  expect(addon.eval("return VanguardCharDB.profile")).toBe("Default");
  expect(notice(addon)).toEqual([false, ""]);
});

it("lifecycle: a spec change switches to its profile at once when it can, and says so in chat", () => {
  const addon = profileAddon("", `${REBINDS} GetSpecialization = function() return __spec end __spec = 1`);
  addon.eval('VanguardCharDB.specProfiles = { [2] = "Raid" } __spec = 2');
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval("return { VanguardCharDB.profile, VanguardCharDB.pendingProfile == nil }")).toEqual(["Raid", true]);
  expect(chatHas(addon, /Your specialization uses profile Raid\./)).toBe(true);
});

it("lifecycle: a spec change that must wait names what differs in its reload offer", () => {
  const addon = profileAddon("P.TestReload = { size = 9 }", `${REBINDS} GetSpecialization = function() return __spec end __spec = 1`);
  addon.eval('VanguardCharDB.specProfiles = { [2] = "Raid" } __spec = 2');
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(addon.eval("return Vanguard_Reload.title:GetText()")).toBe("Your specialization uses profile Raid. TestReload differs in Raid, so the switch waits for a reload. Reload the UI now to apply it?");
});

it("lifecycle: a module that fails at a login in a fight has its secure frame put away when the fight ends", () => {
  expectErrors("module TestHalfSecure: half built");
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) });
  asAddon(addon, `${MODULES}
    local H = ns.Module("TestHalfSecure", { defaults = {}, live = true })
    function H.Enable(settings, scope)
      H.button = H.button or CreateFrame("Button", "VanguardTest_HalfSecure", UIParent, "SecureActionButtonTemplate")
      scope:Frame(H.button)
      error("half built", 0)
    end`);
  addon.eval("__wfgStub.inCombat = true");
  addon.login();
  expect(addon.eval("return VanguardTest_HalfSecure:IsShown()")).toBe(true);
  setCombat(addon, false);
  expect(addon.eval("return VanguardTest_HalfSecure:IsShown()")).toBe(false);
});

// Late-built frames and gates -------------------------------------------------------------------------------------

// A TEST-ONLY live module whose window is built after Enable (__life.build(), as a window first wanting it would) and
// adopted by its scope, with its mover.
const LAZY = `${MODULES}
  local Z = ns.Module("TestLazy", { defaults = {}, live = true })
  function Z.Enable(settings, scope) Z.scope = scope end
  function __life.build()
    Z.frame = Z.frame or CreateFrame("Frame", "VanguardTest_Lazy", UIParent)
    Z.frame:SetSize(30, 30)
    Z.scope:Adopt(Z.frame, "testlazy", "Test lazy", { "CENTER", "CENTER", 0, 0 })
    Z.scope:Adopt(Z.frame, "testlazy", "Test lazy", { "CENTER", "CENTER", 0, 0 })
    Z.frame:Show()
  end
`;

// Whether the TEST-ONLY lazy window's mover is registered now.
const lazyMover = (addon) => addon.eval('for _, m in ipairs(ns.MoverList()) do if m.key == "testlazy" then return true end end return false');

it("lifecycle: a frame adopted after Enable is the scope's at every later start, with its mover", () => {
  const addon = lifeAddon("", LAZY);
  addon.eval("__life.build()");
  expect([lazyMover(addon), addon.eval('return #ns.GetModule("TestLazy").scope.adopted')]).toEqual([true, 1]);
  addon.eval('ns.SetModuleEnabled("TestLazy", false)');
  expect([lazyMover(addon), addon.eval("return VanguardTest_Lazy:IsShown()")]).toEqual([false, false]);
  addon.eval('ns.SetModuleEnabled("TestLazy", true) VanguardTest_Lazy:Show()');
  expect(lazyMover(addon), "the next start adopts it again without Enable").toBe(true);
  addon.eval('ns.SetModuleEnabled("TestLazy", false)');
  expect(addon.eval("return VanguardTest_Lazy:IsShown()"), "and the next stop puts it away again").toBe(false);
});

// A TEST-ONLY live module whose window is built after Enable and adopted with no mover (no key).
const LAZY_PLAIN = `${MODULES}
  local Z = ns.Module("TestLazyPlain", { defaults = {}, live = true })
  function Z.Enable(settings, scope) Z.scope = scope end
  function __life.build()
    Z.frame = Z.frame or CreateFrame("Frame", "VanguardTest_LazyPlain", UIParent)
    Z.frame:SetSize(30, 30)
    Z.scope:Adopt(Z.frame)
    Z.frame:Show()
  end
`;

it("lifecycle: a frame adopted without a mover is the scope's at every later start, and hidden at every stop", () => {
  const addon = lifeAddon("", LAZY_PLAIN);
  addon.eval("__life.build()");
  addon.eval('ns.SetModuleEnabled("TestLazyPlain", false)');
  expect(addon.eval("return VanguardTest_LazyPlain:IsShown()"), "the stop hides it").toBe(false);
  addon.eval('ns.SetModuleEnabled("TestLazyPlain", true) VanguardTest_LazyPlain:Show() ns.SetModuleEnabled("TestLazyPlain", false)');
  expect([addon.eval("return VanguardTest_LazyPlain:IsShown()"), addon.eval('return #ns.GetModule("TestLazyPlain").scope.adopted')],
    "adopted again at the next start without Enable, so the next stop hides it too; no mover, one entry").toEqual([false, 1]);
});

it("lifecycle: a gate pointed at nothing does nothing while the module runs, and calls through when pointed again", () => {
  const addon = lifeAddon("", SCOPED);
  // Calls the hook's gate and says how many calls reached the module.
  const call = () => addon.eval("__life.calls = 0 __life.hooks[1]() return __life.calls");
  addon.eval('__life.scopes[1]:Point("hook", nil)');
  expect(call()).toBe(0);
  addon.eval('__life.scopes[1]:Point("hook", ns.GetModule("TestScoped").Count)');
  expect(call()).toBe(1);
});

it("lifecycle: a gate whose install could not hook yet is neither kept nor counted, and the next call installs it", () => {
  const addon = lifeAddon("", SCOPED);
  // How many gates the scope has installed.
  const gates = () => addon.eval("return __life.scopes[1].gateCount");
  const before = gates();
  addon.eval('__life.scopes[1]:Gate("later", print, function() return false end)');
  expect(gates()).toBe(before);
  addon.eval('__life.scopes[1]:Gate("later", print, function(gate) __life.later = gate end)');
  expect([gates(), addon.eval("return __life.later ~= nil")]).toEqual([before + 1, true]);
});

it("lifecycle: a module stopped by the settle at the end of a fight does not get that fight's end itself", () => {
  const addon = lifeAddon("", `${SCOPED}
    __life.ended = 0
    local W = ns.Module("TestFightEnd", { defaults = {}, live = true })
    function W.Enable(settings, scope) scope:On("PLAYER_REGEN_ENABLED", function() __life.ended = __life.ended + 1 end) end`);
  setCombat(addon, true);
  addon.eval('ns.SetModuleEnabled("TestFightEnd", false)');
  setCombat(addon, false);
  expect(addon.eval('return { __life.ended, ns.ModuleLive("TestFightEnd") }')).toEqual([0, false]);
});

it("lifecycle: a mover with a saved opacity, toggled three times, hooks its frame once", () => {
  const addon = lifeAddon("", SCOPED);
  addon.eval('ns.SetMoverAlpha("testscoped", 0.5)');
  // How many hooks the harness has seen installed.
  const hooks = () => addon.eval("return __wfgStub.hooks");
  const first = hooks();
  for (let i = 0; i < 3; i++) addon.eval('ns.SetModuleEnabled("TestScoped", false) ns.SetModuleEnabled("TestScoped", true)');
  expect(hooks()).toBe(first);
  expect(addon.eval("return VanguardTest_Scoped:GetAlpha()")).toBe(0.5);
});

it("lifecycle: a module whose start failed gets its own Disable, and a change of one of its settings tries it again", () => {
  expectErrors("module TestFlaky: flaky");
  const addon = lifeAddon("", `${MODULES}
    __life.flaky, __life.undone = true, 0
    local F = ns.Module("TestFlaky", { defaults = {}, live = true })
    function F.Enable() if __life.flaky then error("flaky", 0) end end
    function F.Disable() __life.undone = __life.undone + 1 end`);
  expect(addon.eval('return { ns.ModuleLive("TestFlaky"), __life.undone }')).toEqual([false, 1]);
  addon.eval('__life.flaky = false ns.RestartModule("TestFlaky")');
  expect(addon.eval('return ns.ModuleLive("TestFlaky")')).toBe(true);
});

it("lifecycle: a frame handed to the scope twice in one run is kept once", () => {
  const addon = lifeAddon("", SCOPED);
  addon.eval("local s = __life.scopes[1] local n = #s.frames s:Frame(VanguardTest_Scoped) __life.kept = #s.frames - n");
  expect(addon.eval("return __life.kept")).toBe(0);
});

it("lifecycle: a module switched on while the frames are unlocked shows its handle at once", () => {
  const addon = lifeAddon(off("TestScoped"), SCOPED);
  addon.eval("ns.Unlock()");
  addon.eval('ns.SetModuleEnabled("TestScoped", true)');
  expect(addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "testscoped" then return w:IsShown() end end return false')).toBe(true);
  addon.eval("ns.Lock()");
});

it("lifecycle: a key registered twice keeps one handle", () => {
  const addon = lifeAddon("", SCOPED);
  addon.eval('ns.Unlock() local f = CreateFrame("Frame", "VanguardTest_Second", UIParent) f:SetSize(10, 10) ns.Mover(f, "testscoped", "Test scoped", { "CENTER", "CENTER", 0, 0 })');
  expect(addon.eval('local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "testscoped" and w:IsShown() then n = n + 1 end end return n')).toBe(1);
  addon.eval("ns.Lock()");
});

// Every real live module stopped, with time and the game's events after it ------------------------------------

// Lua: the frames of every running live module are noted in __owned (before any stops: a parent's stop takes its
// children down too), then each is switched off.
const STOP_ALL = `__owned = {}
  local stopping = {}
  for _, name in ipairs(ns.ModuleNames()) do
    local def = ns.GetModule(name)
    if def.live and ns.ModuleLive(name) then stopping[#stopping + 1] = name end
    if def.live and ns.ModuleLive(name) then for _, f in ipairs(def.scope.frames) do __owned[#__owned + 1] = f end end
  end
  for _, name in ipairs(stopping) do ns.SetModuleEnabled(name, false) end`;

// Lua: the noted frames that are on screen, by name.
const OWNED_SHOWN = "local out = {} for _, f in ipairs(__owned) do if f:IsVisible() then out[#out + 1] = f:GetName() or f.__kind end end return out";

// The game's events a stopped module might still react to, with the player as the unit where one is needed.
const LATER_EVENTS = [
  ["PLAYER_TARGET_CHANGED"], ["UNIT_HEALTH", "player"], ["UNIT_AURA", "player"], ["UNIT_POWER_UPDATE", "player"],
  ["GROUP_ROSTER_UPDATE"], ["PLAYER_ENTERING_WORLD"], ["ZONE_CHANGED_NEW_AREA"], ["BAG_UPDATE_DELAYED"],
  ["QUEST_LOG_UPDATE"], ["PLAYER_XP_UPDATE", "player"], ["UPDATE_FACTION"], ["READY_CHECK"],
];

// The parts of live modules that start off, switched on so the sweep has their frames and timers too.
const PARTS_ON = `
  local p = VanguardDB.profiles.Default
  p.Meter, p.GroupThreat, p.PartyExtras, p.CooldownGaps = { on = true }, { show = true }, { show = true }, { on = true }
  p.FightHistory, p.UnitExtras, p.CooldownGlow, p.CooldownKeys = { strip = true, recap = true }, { chip = true }, { glow = true }, { keys = true }
  p.MailTools, p.CraftQueue, p.OfficerLoot, p.ChatWindows = { on = true }, { on = true }, { on = true }, { movers = true }`;

// The addon with every real module on but ActionBars, PlayerAuras and InstancePrep (the heavy ones no live module
// needs) and the live modules' optional parts on (PARTS_ON), logged in and settled.
function everyLiveModule() {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(["ActionBars", "PlayerAuras", "InstancePrep"]) + PARTS_ON });
  addon.login();
  addon.advance(1);
  return addon;
}

// Fires the events (each module queues its repaints and timers), then stops every live module before any of that runs.
function stopMidWork(addon) {
  for (const [event, ...args] of LATER_EVENTS) addon.fire(event, ...args);
  addon.eval(STOP_ALL);
}

// Lua: what the visibility rules may still do to a stopped module's frame (Core/Visibility.lua): a linger running out
// or the client's state driver repaints it (V.Refresh, which calls its owner back), and a Calm HUD change reapplies.
const LATE_REPAINT = "for _, f in ipairs(__owned) do if f.vgOnState then ns.Visibility.Refresh(f) end end ns.Visibility.ApplyCalm()";

// Ten seconds pass (linger, repaint and retry timers queued before the stop run out), the visibility rules repaint,
// the events fire again, and a few more seconds pass.
function timePasses(addon) {
  addon.advance(10);
  addon.eval(LATE_REPAINT);
  for (const [event, ...args] of LATER_EVENTS) addon.fire(event, ...args);
  addon.advance(5);
}

it("lifecycle: every live module stopped with work queued stays stopped through ten seconds and the game's events: nothing of theirs shows, nothing is registered again", () => {
  const addon = everyLiveModule();
  stopMidWork(addon);
  const stopped = footprint(addon);
  expect(addon.eval("return #__owned"), "the live modules had frames").toBeGreaterThan(10);
  timePasses(addon);
  expect(list(addon.eval(OWNED_SHOWN)), "none of their frames on screen").toEqual([]);
  expect(footprint(addon), "no handler, ticker, event, driver, mover or gate came back").toEqual(stopped);
});

it("lifecycle: every live module switched off in a fight stops when it ends, and nothing of theirs shows or is written after", () => {
  const addon = everyLiveModule();
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  stopMidWork(addon);
  const saved = savedNow(addon);
  setCombat(addon, false);
  const stopped = footprint(addon);
  timePasses(addon);
  expect(list(addon.eval(OWNED_SHOWN)), "none of their frames on screen").toEqual([]);
  expect(footprint(addon), "nothing registered again").toEqual(stopped);
  expect(savedNow(addon), "the saved variables as the switches left them").toEqual(saved);
});

// A live profile switch with the real live modules ------------------------------------------------------------

// Saved variables with two profiles that differ only in live modules (the meter and group threat on in Raid, the roll
// panel off), every reload-only module off in both, on the character's profile `profile`.
const liveProfiles = (profile) => `
  VanguardDB = { version = 2, setupDone = true, profiles = { Default = { modules = {} }, Raid = { modules = { Rolls = false }, Meter = { on = true }, GroupThreat = { show = true } } } }
  VanguardCharDB = { profile = "${profile}" }`;

// Lua run once the modules are registered, before login: every module that is not live switched off in both profiles.
const RELOAD_ONLY_OFF = `for _, name in ipairs(ns.ModuleNames()) do
  if not ns.GetModule(name).live then VanguardDB.profiles.Default.modules[name] = false VanguardDB.profiles.Raid.modules[name] = false end
end`;

// The addon logged in on `profile` with only real live modules running.
function liveProfileAddon(profile) {
  const addon = createAddon({ savedVariables: liveProfiles(profile) });
  addon.eval(RELOAD_ONLY_OFF);
  addon.login();
  return addon;
}

it("lifecycle: with every reload-only module off, a profile that differs in real live modules switches at once, as a login on it, and leaves the old profile as it was", () => {
  const onRaid = footprint(liveProfileAddon("Raid"));
  const addon = liveProfileAddon("Default");
  const before = addon.eval("return VanguardDB.profiles.Default");
  expect(addon.eval('return ns.PickProfile("Raid")'), "applied at once").toBe(true);
  // Frames and installed hooks are left out: the roll panel ran on Default, and the client frees neither.
  expect(footprint(addon), "the footprint of a login on Raid").toEqual(onRaid);
  expect(addon.eval("return VanguardDB.profiles.Default"), "Default untouched").toEqual(before);
});

// A live module with one scope ticker that raises while __h.fail; M.Pause stops the job as a module does when it has
// nothing to time (CooldownGlow's CG.Apply, RetailClassBars' fillRunes: scope:Every(key, nil)).
const STOP_START = `
  __h = { runs = 0, fail = true }
  local M = ns.Module("TestStopStart", { defaults = {}, live = true })
  local function tick() if __h.fail then error("TEST-ONLY tick", 0) end __h.runs = __h.runs + 1 end
  function M.Enable(_, scope) M.scope = scope scope:Every("test stopstart", 0.1, tick) end
  function M.Pause() M.scope:Every("test stopstart", nil, tick) end
  __M = M`;

// The addon with STOP_START logged in and its ticker paused by the error budget, then switched off and on with the
// job mended: { the job ran, rows left on the paused list }.
function pausedThenRestarted(stopFirst) {
  const addon = lifeAddon("", STOP_START);
  addon.advance(1.5, 0.1);
  expect(addon.eval("local out = {} for _, p in ipairs(ns.paused) do out[#out + 1] = p.where end return out"), "paused at the job's label").toEqual(["ticker test stopstart"]);
  if (stopFirst) addon.eval("__M.Pause()");
  addon.eval('__h.fail = false ns.SetModuleEnabled("TestStopStart", false) ns.SetModuleEnabled("TestStopStart", true)');
  addon.advance(1, 0.1);
  return addon.eval("return { __h.runs > 0, #ns.paused }");
}

it("lifecycle: a paused scope ticker still running at the stop runs again after the module is switched off and on", () => {
  expectErrors("ticker test stopstart: TEST-ONLY tick");
  expect(pausedThenRestarted(false)).toEqual([true, 0]);
});

it("lifecycle: a paused scope ticker the module stopped itself runs again after the module is switched off and on (H44-1-R1)", () => {
  expectErrors("ticker test stopstart: TEST-ONLY tick");
  expect(pausedThenRestarted(true), "the close forgot its failures: it runs and the paused list is empty").toEqual([true, 0]);
});

it("lifecycle: a failed live module is tried again by a live profile switch (H44-1-4)", () => {
  expectErrors("module TestPicky: TEST-ONLY bad size");
  const saved = `
    VanguardDB = { version = 2, setupDone = true, profiles = { Default = { modules = {}, TestPicky = { size = -1 } }, Raid = { modules = {}, TestPicky = { size = 5 } } } }
    VanguardCharDB = { profile = "Default" }`;
  const addon = createAddon({ savedVariables: saved });
  asAddon(addon, `__tries = 0
    local M = ns.Module("TestPicky", { defaults = { size = 1 }, live = true })
    function M.Enable(s) __tries = __tries + 1 if s.size < 0 then error("TEST-ONLY bad size", 0) end end
    for _, name in ipairs(ns.ModuleNames()) do
      if name ~= "TestPicky" then VanguardDB.profiles.Default.modules[name] = false VanguardDB.profiles.Raid.modules[name] = false end
    end`);
  addon.login();
  expect(addon.eval('return { ns.PickProfile("Raid"), VanguardCharDB.profile }'), "switched at once").toEqual([true, "Raid"]);
  expect(addon.eval("return { ns.ModuleLive(\"TestPicky\"), __tries }"), "built on Raid's good settings after one more try").toEqual([true, 2]);
});
