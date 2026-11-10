// The module lifecycle (Core/Modules.lua, docs/design/MODULE-LIFECYCLE.md), exercised by TEST-ONLY modules
// registered before login: declared dependencies, the login pass in load order, live start and stop, late
// enable, rebuilds, switches made in a fight, and the reload-only modules that wait. No real module declares
// live yet (A4-2a), so these modules are the only ones the registry starts or stops mid-session.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE, chatHas, expectErrors, setCombat } from "./helpers.mjs";
import { footprint, lifecycleCases } from "./lifecycle-helpers.mjs";

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
  addon.eval('ns.SetModuleEnabled("Chat", true) ns.SetModuleEnabled("TestReload", true)');
  expect(notice(addon)).toEqual([false, ""]);
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
