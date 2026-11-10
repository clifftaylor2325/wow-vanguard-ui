// The adversarial review's probes of the module lifecycle (work/a4-lifecycle-all at 42f8f3a7), kept as cases: each
// failed while its finding stood (H1 to H3, M1 to M4, and a failed start built again at every settle) and passes
// with its fix.
import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { CLICK_LUA, HEALING_ENV, RAID_ENV, SETUP_DONE, UNITS_ENV, loggedIn } from "./helpers.mjs";
import { footprint, moduleOff } from "./lifecycle-helpers.mjs";

// Runs Lua as a file of the addon's (the taint rules count its frames as the addon's).
const asAddon = (addon, lua) => addon.eval(`assert(load(${JSON.stringify(`local ADDON, ns = ...\n${lua}`)}, "@Modules/TEST-ONLY.lua"))("Vanguard", ns)`);
// The addon with the heavy modules off, not yet logged in.
const scoped = () => createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) });

// H1: Modules/MainTanks.lua:73 registers the poll under a string key; Core/Ticker.lua:28 hands the key to the job.
it("H1 a main tank tile's poll repaints the tile", () => {
  const addon = loggedIn(UNITS_ENV);
  addon.eval(`__units.raid1 = { name = "TEST-ONLY Tank", hp = 300, maxhp = 1000, power = 0, maxpower = 0, ptype = "RAGE", player = true, class = "ROGUE" }
    local b = CreateFrame("Button", "Vanguard_MainTanksUnitButton1", Vanguard_MainTanks, "SecureUnitButtonTemplate")
    b:SetAttribute("unit", "raid1")
    Vanguard_MainTanks.initialConfigFunction(Vanguard_MainTanks, b:GetName())
    Vanguard_MainTanks:Show() b:Show()`);
  addon.eval('__units.raid1.name = "TEST-ONLY Renamed"');
  addon.advance(3);
  expect(addon.eval("return Vanguard_MainTanksUnitButton1.name:GetText()")).toBe("TEST-ONLY Renamed");
});

// H2: Modules/QuestDialog.lua:396 QD.HandBack takes the game's events while the module is stopped.
it("H2 QuestDialog off, the hand-back switch ticked and unticked, leaves the game's quest window its events", () => {
  const addon = scoped();
  addon.eval('QuestFrame = CreateFrame("Frame", "QuestFrame") QuestFrame:RegisterEvent("QUEST_DETAIL")');
  addon.login();
  addon.eval('ns.SetModuleEnabled("QuestDialog", false)');
  addon.eval('local QD = ns.GetModule("QuestDialog") QD.HandBack(true) QD.HandBack(false)');
  expect(addon.eval('return QuestFrame:IsEventRegistered("QUEST_DETAIL")')).toBe(true);
});

// H3: Modules/Situations.lua:293 placeSpot and :304 writeModule skip what is not registered or running.
it("H3 a module switched off under a situation's override gets its own spot back when the situation ends", () => {
  const SIT = '__inside, __kind, __resting = false, "none", false IsInInstance = function() return __inside, __kind end IsResting = function() return __resting end ';
  const override = '{ positions = { brokerstrip = { point = "BOTTOM", relPoint = "BOTTOM", x = 0, y = 300 } }, settings = {} }';
  const addon = loggedIn(SIT + CLICK_LUA, { savedVariables: `VanguardDB = { version = 2, setupDone = true, profiles = { Default = { Situations = { overrides = { raid = ${override} } } } } }\n` });
  addon.advance(0.5);
  addon.world.setUnit("raid1", { name: "TEST-ONLY Ally" });
  addon.advance(0.5);
  addon.eval('ns.SetModuleEnabled("BrokerStrip", false)');
  addon.world.removeUnit("raid1");
  addon.advance(0.5);
  addon.fire("PLAYER_LOGOUT");
  expect(addon.eval("return ns.Settings('positions').brokerstrip")).toBe(null);
});

// M1: Core/ModuleScope.lua:365 the wrapper does not check scope.on; the dispatch under way keeps its list.
it("M1 a module stopped at the end of a fight does not get that PLAYER_REGEN_ENABLED", () => {
  const addon = scoped();
  asAddon(addon, `local M = ns.Module("TestStale", { live = true }) __stale = {}
    function M.Enable(_, scope) scope:On("PLAYER_REGEN_ENABLED", function() table.insert(__stale, scope:Running() and "running" or "AFTER STOP") end) end`);
  addon.login();
  addon.eval('__wfgStub.inCombat = true ns.SetModuleEnabled("TestStale", false) __wfgStub.inCombat = false');
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return #__stale")).toBe(0);
});

// M2: Core/Movers.lua:262 a new mover table each ns.Mover call; :199 watchAlpha hooks SetAlpha again for each.
it("M2 a mover with an opacity keeps one SetAlpha hook across restarts", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + "\nVanguardDB.profiles.Default = { positions = { brokerstrip = { alpha = 0.5 } } }" });
  addon.login();
  addon.eval('__n = 0 hooksecurefunc(Vanguard_BrokerStrip, "SetAlpha", function() __n = __n + 1 end)');
  // Sets the strip's opacity once and says how many SetAlpha calls that made.
  const calls = () => addon.eval("__n = 0 Vanguard_BrokerStrip:SetAlpha(1) return __n");
  const first = calls();
  for (let i = 0; i < 3; i++) addon.eval('ns.SetModuleEnabled("BrokerStrip", false) ns.SetModuleEnabled("BrokerStrip", true)');
  expect(calls()).toBe(first);
});

// M3: Modules/RaidHealing.lua listen() -> RF.OnTileUnit subscriptions are outside the scope and stay.
it("M3 in a raid, RaidHealing switched off leaves the unit events a login with it off leaves", () => {
  const env = UNITS_ENV + RAID_ENV + HEALING_ENV, spawn = '__spawn(1, "raid1"); __spawn(3, "raid3")';
  const off = loggedIn(env, { savedVariables: moduleOff("RaidHealing") });
  off.eval(spawn);
  const addon = loggedIn(env);
  addon.eval(spawn);
  addon.eval('ns.SetModuleEnabled("RaidHealing", false)');
  expect(footprint(addon).events).toEqual(footprint(off).events);
});

// M4: Core/ProfileSwitch.lua:12 `type(t) == "table" and t[key] or nil` reads a saved false as unset.
it("M4 a reload-only theme setting saved as false against a default of true keeps the profile from applying now", () => {
  const addon = createAddon({ savedVariables: `
    VanguardDB = { version = 2, setupDone = true, profiles = { Default = { modules = {}, theme = { colorAssistGame = false } }, Raid = { modules = {} } } }
    VanguardCharDB = { profile = "Default" }` });
  addon.eval('for _, name in ipairs(ns.ModuleNames()) do VanguardDB.profiles.Default.modules[name] = false VanguardDB.profiles.Raid.modules[name] = false end');
  addon.login();
  expect(addon.eval('return ns.PickProfile("Raid")')).toBe(false);
});

// L: a live module whose Enable fails is built again at every settle (7 tries after three toggles of another module).
it("L a module whose Enable failed is not built again by another module's switch", () => {
  const addon = scoped();
  asAddon(addon, '__tries = 0 local M = ns.Module("TestBroken", { live = true }) function M.Enable() __tries = __tries + 1 error("TEST-ONLY broken") end');
  addon.login();
  for (let i = 0; i < 3; i++) addon.eval('ns.SetModuleEnabled("Rolls", false) ns.SetModuleEnabled("Rolls", true)');
  const tries = addon.eval("return __tries");
  addon.eval("for i = #ns.errors, 1, -1 do table.remove(ns.errors, i) end");
  expect(tries).toBe(1);
});
