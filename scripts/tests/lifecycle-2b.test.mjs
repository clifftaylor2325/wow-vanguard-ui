// The lifecycle of the A4-2b modules (own frames): each switches off and on without a reload. The three standard cases
// (scripts/tests/lifecycle-helpers.mjs) on the real module, plus a case for anything its Disable or ticker does.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE } from "./helpers.mjs";
import { footprint, lifecycleCases, moduleOff } from "./lifecycle-helpers.mjs";

// A login with the heavy modules off (except those in `keep`) and `settings` Lua run on the saved variables, then
// `saved` (a module switch from moduleOff).
const loginWith = (settings = "", keep = []) => (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => !keep.includes(n))) + settings + saved });
  addon.login();
  return addon;
};

// GroupThreat ---------------------------------------------------------------------------------------------------

const GROUP_THREAT = loginWith("\nVanguardDB.profiles.Default.GroupThreat = { show = true }");

lifecycleCases("GroupThreat", GROUP_THREAT);

it("lifecycle: group threat switched off hides its panel, and a draw still waiting does not show it again", () => {
  const addon = GROUP_THREAT();
  addon.eval('ns.SetModuleEnabled("GroupThreat", false) ns.GetModule("GroupThreat").Soon()');
  addon.advance(0.3);
  expect(addon.eval("return ns.GetModule('GroupThreat').panel:IsShown()")).toBe(false);
});

it("lifecycle: group threat with its panel row switched off builds nothing, and on again builds the panel once", () => {
  const addon = loginWith("\nVanguardDB.profiles.Default.GroupThreat = { show = false }")();
  expect(addon.eval("return Vanguard_GroupThreat == nil")).toBe(true);
  addon.eval("local _, set = ns.Options.RestartSetting('GroupThreat', 'show') set(true)");
  expect(addon.eval("return Vanguard_GroupThreat ~= nil")).toBe(true);
});

// FightHistory --------------------------------------------------------------------------------------------------

lifecycleCases("FightHistory", loginWith());

it("lifecycle: fight history switched off keeps its fights for /vg fights, and a visibility change leaves no driver", () => {
  const addon = loginWith()();
  addon.eval('local FH = ns.GetModule("FightHistory") FH.fights[1] = { duration = 30, dps = 100, at = 0 } ns.SetModuleEnabled("FightHistory", false) FH.ApplyVisibility() FH.Record()');
  expect(addon.eval('return #ns.GetModule("FightHistory").fights')).toBe(1);
  expect(footprint(addon)).toEqual(footprint(loginWith()(moduleOff("FightHistory"))));
});

// Meter ---------------------------------------------------------------------------------------------------------

const METER_ON = loginWith("\nVanguardDB.profiles.Default.Meter = { on = true }");

lifecycleCases("Meter", METER_ON);
lifecycleCases("Meter", loginWith());

it("lifecycle: the meter switched off closes its spell panel, gives target of target its spot back and answers /vg meter as off", () => {
  const addon = METER_ON();
  expect(addon.eval("return ns.MeterWideFrom() > 0")).toBe(true);
  addon.eval('local MT = ns.GetModule("Meter") MT.OpenDetail({ name = "TEST-ONLY", totalAmount = 1 })');
  addon.eval('ns.SetModuleEnabled("Meter", false)');
  expect(addon.eval("return { ns.MeterWideFrom(), Vanguard_MeterDetail:IsShown(), Vanguard_Meter:IsShown() }")).toEqual([0, false, false]);
  addon.eval('ns.GetModule("Meter").Command("overall")');
  expect(addon.eval('return ns.GetModule("Meter").settings.session')).not.toBe("Overall");
});

it("lifecycle: the meter's own switch turned on after the module started builds it once, and off then on keeps one frame", () => {
  const addon = loginWith()();
  expect(addon.eval("return Vanguard_Meter == nil")).toBe(true);
  addon.eval('ns.GetModule("Meter").SetOn(true)');
  const frames = addon.eval("return #__wfgStub.frames");
  addon.eval('ns.SetModuleEnabled("Meter", false) ns.SetModuleEnabled("Meter", true)');
  expect(addon.eval("return { #__wfgStub.frames, Vanguard_Meter:IsShown() }")).toEqual([frames, true]);
});
