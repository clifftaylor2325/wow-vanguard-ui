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

// Rolls ---------------------------------------------------------------------------------------------------------

lifecycleCases("Rolls", loginWith());

it("lifecycle: rolls switched off stops recording, keeps what it has for /vg rolls, and a late repaint leaves the panel hidden", () => {
  const addon = loginWith()();
  addon.eval('RANDOM_ROLL_RESULT = "%s rolls %d (%d-%d)"');
  addon.fire("CHAT_MSG_SYSTEM", "TEST-ONLY Tank rolls 87 (1-100)");
  addon.eval('ns.SetModuleEnabled("Rolls", false)');
  addon.fire("CHAT_MSG_SYSTEM", "TEST-ONLY Mage rolls 12 (1-100)");
  addon.advance(31);
  expect(addon.eval("local R = ns.GetModule('Rolls') return { #R.rolls, Vanguard_Rolls:IsShown() }")).toEqual([1, false]);
});

// InstancePrep --------------------------------------------------------------------------------------------------

// A login with Instance prep left on (it is one of the six heavy modules the scoped logins turn off).
const PREP = loginWith("", ["InstancePrep"]);

lifecycleCases("InstancePrep", PREP);

it("lifecycle: instance prep switched off closes its card and its wanted-amounts window, and answers /vg prep as off", () => {
  const addon = PREP();
  addon.eval('local PR = ns.GetModule("InstancePrep") PR.ShowOnDemand() PR.Wizard.Open()');
  expect(addon.eval("return { Vanguard_PrepCard:IsShown(), Vanguard_PrepWizard:IsShown() }")).toEqual([true, true]);
  addon.eval('ns.SetModuleEnabled("InstancePrep", false)');
  expect(addon.eval("return { Vanguard_PrepCard:IsShown(), Vanguard_PrepWizard:IsShown() }")).toEqual([false, false]);
  addon.eval('local PR = ns.GetModule("InstancePrep") PR.Command("") PR.ShowOnDemand() PR.Wizard.Open()');
  expect(addon.eval("return { Vanguard_PrepCard:IsShown(), Vanguard_PrepWizard:IsShown(), #ns.GetModule('InstancePrep').BuyRows() }")).toEqual([false, false, 0]);
});

// QuestArrow ----------------------------------------------------------------------------------------------------

lifecycleCases("QuestArrow", loginWith());

it("lifecycle: the quest arrow's tickers keep their owner frames after a restart, and a stopped arrow follows no quest", () => {
  const addon = loginWith()();
  addon.eval('ns.SetModuleEnabled("QuestArrow", false) ns.SetModuleEnabled("QuestArrow", true)');
  expect(addon.eval('local jobs = ns.ticker.vgJobs return { jobs["quest arrow pick"].frame == UIParent, jobs["quest arrow"].frame == Vanguard_QuestArrow }')).toEqual([true, true]);
  addon.eval('local QA = ns.GetModule("QuestArrow") QA.current = 7 ns.SetModuleEnabled("QuestArrow", false)');
  expect(addon.eval("return { ns.QuestArrow.Current() == nil, ns.QuestArrow.Followed() == nil, Vanguard_QuestArrow:IsShown() }")).toEqual([true, true, false]);
});

// QuestMinimap --------------------------------------------------------------------------------------------------

lifecycleCases("QuestMinimap", loginWith());

it("lifecycle: the quest minimap's tickers keep the layer as owner after a restart, and a stopped one reads nothing", () => {
  const addon = loginWith()();
  addon.eval('ns.SetModuleEnabled("QuestMinimap", false) ns.SetModuleEnabled("QuestMinimap", true)');
  expect(addon.eval('local jobs = ns.ticker.vgJobs return { jobs["quest minimap read"].frame == Vanguard_QuestMinimap, jobs["quest minimap"].frame == Vanguard_QuestMinimap }')).toEqual([true, true]);
  addon.eval('local QM = ns.GetModule("QuestMinimap") ns.SetModuleEnabled("QuestMinimap", false) QM.spots = { 1 } QM.Read()');
  expect(addon.eval('return { #ns.GetModule("QuestMinimap").spots, Vanguard_QuestMinimap:IsShown() }')).toEqual([1, false]);
});

// CooldownGaps --------------------------------------------------------------------------------------------------

const GAPS_ON = loginWith("\nVanguardDB.profiles.Default.CooldownGaps = { on = true }");

lifecycleCases("CooldownGaps", GAPS_ON);

it("lifecycle: the gaps row's own switch builds and takes it away at once, and the Gaps card follows", () => {
  const addon = loginWith()();
  // Whether the Gaps card says the row is off.
  const card = () => addon.eval('return ns.GetModule("CooldownGaps").CardRows()[1][2] == ns.GetModule("CooldownGaps").OFF');
  expect([addon.eval("return Vanguard_CooldownGaps == nil"), card()]).toEqual([true, true]);
  addon.eval("local _, set = ns.Options.RestartSetting('CooldownGaps', 'on') set(true)");
  expect([addon.eval("return Vanguard_CooldownGaps:IsShown()"), card()]).toEqual([true, false]);
  addon.eval("local _, set = ns.Options.RestartSetting('CooldownGaps', 'on') set(false)");
  expect([addon.eval("return Vanguard_CooldownGaps:IsShown()"), card()]).toEqual([false, true]);
});

it("lifecycle: the gaps row switched off with its module hides its row, says it is off, and ignores a repaint that was queued", () => {
  const addon = GAPS_ON();
  addon.eval('ns.GetModule("CooldownGaps").Refresh() ns.SetModuleEnabled("CooldownGaps", false) ns.GetModule("CooldownGaps").Refresh()');
  expect(addon.eval('return { Vanguard_CooldownGaps:IsShown(), ns.GetModule("CooldownGaps").settings == nil }')).toEqual([false, true]);
});

// ChatWatch -----------------------------------------------------------------------------------------------------

const WATCH = loginWith('\nVanguardDB.profiles.Default.ChatWatch = { phrases = { "lfm" }, toast = true }');

lifecycleCases("ChatWatch", WATCH);

it("lifecycle: chat watch switched off stops alerting, drops an alert waiting for the fight, and another module's alert still shows", () => {
  const addon = WATCH();
  addon.eval('ns.SetModuleEnabled("ChatWatch", false) ns.GetModule("ChatWatch").Alert("TEST-ONLY Sender", "lfm", "lfm")');
  expect(addon.eval("return Vanguard_ChatWatchToast:IsShown()")).toBe(false);
  addon.eval('ns.GetModule("ChatWatch").Notify("TEST-ONLY", "an alert", nil, function() end)');
  expect(addon.eval("return Vanguard_ChatWatchToast:IsShown()")).toBe(true);
});
