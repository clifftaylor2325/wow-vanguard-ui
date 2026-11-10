// The lifecycle of the A4-2d modules (on the unit frames): each switches off and on without a reload. The three
// standard cases (scripts/tests/lifecycle-helpers.mjs) on the real module, plus a case for anything its Disable does.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// The modules these cases need on: the unit frames the others sit on, and the heavy ones this batch converts.
const KEEP = ["UnitFrames", "FrameAuras", "RaidTools"];

// A login with the other heavy modules off, `settings` Lua run on the saved variables, then `saved` (a module
// switch from moduleOff), and `env` Lua run before the login (a class, a unit).
const loginWith = (settings = "", env = "") => (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => !KEEP.includes(n))) + settings + saved });
  if (env) addon.eval(env);
  addon.login();
  return addon;
};

// The player is a rogue with some combo points.
const ROGUE = 'UnitClass = function() return "Rogue", "ROGUE" end GetComboPoints = function() return 2 end';

const login = loginWith();

// FrameAuras ----------------------------------------------------------------------------------------------------

lifecycleCases("FrameAuras", login);

it("lifecycle: frame auras switched off empties and hides the target's rows, and on again shows the same ones", () => {
  const addon = login();
  const rows = 'local f = ns.GetModule("UnitFrames").frames.target return f.debuffs.frame:IsShown()';
  expect(addon.eval(rows)).toBe(true);
  addon.eval('ns.SetModuleEnabled("FrameAuras", false)');
  expect(addon.eval(rows)).toBe(false);
  addon.eval('ns.SetModuleEnabled("FrameAuras", true)');
  expect(addon.eval(rows)).toBe(true);
});

it("lifecycle: frame auras can't start while the unit frames are off", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => n !== "FrameAuras")) });
  addon.login();
  expect(addon.eval('return ns.ModuleLive("FrameAuras")')).toBe(false);
});

// ComboPoints ---------------------------------------------------------------------------------------------------

const ROGUE_LOGIN = loginWith("", ROGUE);

lifecycleCases("ComboPoints", ROGUE_LOGIN);

it("lifecycle: combo points switched off hides the row, and on again shows the same row", () => {
  const addon = ROGUE_LOGIN();
  const shown = 'return ns.GetModule("ComboPoints").bar:IsShown()';
  expect(addon.eval(shown)).toBe(true);
  addon.eval('ns.SetModuleEnabled("ComboPoints", false)');
  expect(addon.eval(shown)).toBe(false);
  addon.eval('local CP = ns.GetModule("ComboPoints") local bar = CP.bar ns.SetModuleEnabled("ComboPoints", true) __same = bar == CP.bar');
  expect(addon.eval("return __same")).toBe(true);
  expect(addon.eval(shown)).toBe(true);
});

// ClassBars -----------------------------------------------------------------------------------------------------

const SHAMAN_LOGIN = loginWith("", 'UnitClass = function() return "Shaman", "SHAMAN" end');

lifecycleCases("ClassBars", SHAMAN_LOGIN);

it("lifecycle: class bars switched off hides the totem row and gives the totem cells back to the cooldown gaps, and on again shows the same row", () => {
  const addon = SHAMAN_LOGIN();
  const row = 'return ns.GetModule("ClassBars").totems:IsShown()';
  expect([addon.eval(row), addon.eval('return ns.GetModule("ClassBars").cells ~= nil')]).toEqual([true, true]);
  addon.eval('ns.SetModuleEnabled("ClassBars", false)');
  expect([addon.eval(row), addon.eval('return ns.GetModule("ClassBars").cells == nil')]).toEqual([false, true]);
  addon.eval('local CB = ns.GetModule("ClassBars") local row = CB.totems ns.SetModuleEnabled("ClassBars", true) __same = row == CB.totems');
  expect([addon.eval("return __same"), addon.eval(row)]).toEqual([true, true]);
});

it("lifecycle: class bars switched off hides a druid's mana bar", () => {
  const addon = loginWith("", 'UnitClass = function() return "Druid", "DRUID" end')();
  addon.eval('ns.SetModuleEnabled("ClassBars", false)');
  expect(addon.eval('return ns.GetModule("ClassBars").manaHolder:IsShown()')).toBe(false);
});

// PowerTicks ----------------------------------------------------------------------------------------------------

lifecycleCases("PowerTicks", login);

it("lifecycle: power ticks switched off ends a sweep and hides the spark, and on again starts with none", () => {
  const addon = login();
  addon.eval('local PT = ns.GetModule("PowerTicks") PT.mode = "energy" PT.Start()');
  expect(addon.eval('return ns.GetModule("PowerTicks").spark:IsShown()')).toBe(true);
  addon.eval('ns.SetModuleEnabled("PowerTicks", false)');
  expect(addon.eval('local PT = ns.GetModule("PowerTicks") return { PT.spark:IsShown(), PT.from == nil }')).toEqual([false, true]);
  addon.eval('ns.SetModuleEnabled("PowerTicks", true)');
  expect(addon.eval('return ns.GetModule("PowerTicks").spark:IsShown()')).toBe(false);
});

// UnitExtras ----------------------------------------------------------------------------------------------------

const CHIP_LOGIN = loginWith("\nVanguardDB.profiles.Default.UnitExtras = { chip = true }");

lifecycleCases("UnitExtras", CHIP_LOGIN);

it("lifecycle: unit extras switched off clears the readouts and hides the chip, and on again shows the same chip", () => {
  const addon = CHIP_LOGIN();
  addon.eval('local UX = ns.GetModule("UnitExtras") UX.chip:Show() UX.threat:SetText("87%")');
  addon.eval('ns.SetModuleEnabled("UnitExtras", false)');
  expect(addon.eval('local UX = ns.GetModule("UnitExtras") return { UX.chip:IsShown(), UX.threat:GetText() }')).toEqual([false, ""]);
  addon.eval('local UX = ns.GetModule("UnitExtras") local chip = UX.chip ns.SetModuleEnabled("UnitExtras", true) __same = chip == UX.chip');
  expect(addon.eval("return __same")).toBe(true);
});

it("lifecycle: a status chip draw still waiting when unit extras switches off does not show the chip", () => {
  const addon = CHIP_LOGIN();
  addon.eval('ns.GetModule("UnitExtras").SoonChip() ns.SetModuleEnabled("UnitExtras", false)');
  addon.advance(0.1);
  expect(addon.eval('return ns.GetModule("UnitExtras").chip:IsShown()')).toBe(false);
});

it("lifecycle: the chip's row switched off through its setting rebuilds the module without it", () => {
  const addon = CHIP_LOGIN();
  addon.eval("local _, set = ns.Options.RestartSetting('UnitExtras', 'chip') set(false)");
  expect(addon.eval('return ns.GetModule("UnitExtras").chip:IsShown()')).toBe(false);
});

// MainTanks -----------------------------------------------------------------------------------------------------

lifecycleCases("MainTanks", login);

it("lifecycle: main tanks switched off hides the holder and the header and lets go of the header's visibility driver, and on again drives it", () => {
  const addon = login();
  const state = 'return { Vanguard_MainTanks:IsShown(), Vanguard_MainTanks.__states.visibility, ns.MoverPoint("maintanks") ~= nil }';
  expect(addon.eval(state)).toEqual([true, "[group:raid] show; hide", true]);
  addon.eval('ns.SetModuleEnabled("MainTanks", false)');
  expect(addon.eval("return { Vanguard_MainTanks:IsShown(), Vanguard_MainTanks.__states.visibility == nil, Vanguard_MainTanksHolder:IsShown() }")).toEqual([false, true, false]);
  addon.eval('ns.SetModuleEnabled("MainTanks", true)');
  expect(addon.eval(state)[1]).toBe("[group:raid] show; hide");
});

it("lifecycle: a main tank tile is read only while the module runs", () => {
  const addon = login();
  addon.eval('ns.GetModule("MainTanks").Setup(CreateFrame("Button", nil, Vanguard_MainTanks, "SecureUnitButtonTemplate"))');
  const read = 'local tiles = ns.GetModule("MainTanks").tiles return ns.ticker.vgJobs[tiles[#tiles]] ~= nil';
  expect(addon.eval(read)).toBe(true);
  addon.eval('ns.SetModuleEnabled("MainTanks", false)');
  expect(addon.eval(read)).toBe(false);
  addon.eval('ns.SetModuleEnabled("MainTanks", true)');
  expect(addon.eval(read)).toBe(true);
});
