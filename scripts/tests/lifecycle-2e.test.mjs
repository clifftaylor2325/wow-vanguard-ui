// The raid and town modules that switch off and on without a reload (A4-2e): RaidAuras, RaidHealing, RaidStatus,
// OfficerLoot, Upgrades, CharacterExtras, Errands, Merchant, TalentPlanner and QuestGuide. Each gets the three
// cases every live module gets (lifecycle-helpers.mjs), and a case for what its Disable does.

import { expect, it } from "vitest";
import { HEALING_ENV, RAID_ENV, UNITS_ENV, healing, loggedIn, marks } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// The addon logged in with `saved` Lua appended to its saved variables (the lifecycle cases' login).
const login = (saved) => loggedIn("", { savedVariables: saved });

const STATUS_ENV = `
  __status = { icon = { raid1 = 8 }, ready = {}, rez = {}, range = { raid1 = true, raid3 = false } }
  GetRaidTargetIndex = function(unit) return __status.icon[unit] end
  UnitIsGroupLeader = function(unit) return unit == "raid1" end
  UnitInRange = function(unit) return __status.range[unit], true end
`;

// Switches a module off or on, as the options window does.
const switchTo = (addon, name, on) => addon.eval(`ns.SetModuleEnabled("${name}", ${on})`);

lifecycleCases("RaidAuras", login);

it("RaidAuras: switched off, a tile's rows and indicators are hidden and its unit let go; on again they come back, not made twice", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.eval('__spawn(1, "raid1")');
  const rows = () => addon.eval("local b = Vanguard_RaidUnitButton1 return { b.debuffRow ~= nil and b.debuffRow.frame:IsShown(), b.hotRow ~= nil and b.hotRow.frame:IsShown(), b.auraUnit }");
  expect(rows()[0], "a tile that shows a unit has its rows").toBe(true);
  const frames = addon.eval("return #__wfgStub.frames");
  switchTo(addon, "RaidAuras", false);
  expect(rows(), "hidden, and no unit").toEqual([false, false, null]);
  switchTo(addon, "RaidAuras", true);
  expect(rows()[0], "shown again").toBe(true);
  expect(addon.eval("return #__wfgStub.frames"), "the same rows, not new ones").toBe(frames);
});

it("RaidAuras: a changed setting makes the tile's rows again at the restart, an unchanged one keeps them", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.eval('__spawn(1, "raid1") __row = Vanguard_RaidUnitButton1.debuffRow');
  const same = () => addon.eval("return Vanguard_RaidUnitButton1.debuffRow == __row");
  addon.eval('ns.RestartModule("RaidAuras")');
  expect(same(), "the same settings: the same rows").toBe(true);
  addon.eval('VanguardDB.profiles.Default.RaidAuras.debuffs = 0 ns.RestartModule("RaidAuras")');
  expect(same(), "another debuff count: other rows").toBe(false);
});

lifecycleCases("RaidHealing", login);

lifecycleCases("RaidHealing", login);

it("RaidHealing: switched off, every tile loses its heal, shield, aggro and buff marks at once; on again they return", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(3, "raid3")');
  expect(healing(addon, 1).heal, "a heal is drawn").toBe(200);
  switchTo(addon, "RaidHealing", false);
  expect(addon.eval("local b = Vanguard_RaidUnitButton1 return { b.heal:IsShown(), b.shield:IsShown(), b.threat:IsShown(), b.missing:IsShown(), b.overshield:IsShown() }")).toEqual([false, false, false, false, false]);
  addon.eval("__pred.raid1.heals = 50");
  addon.fire("UNIT_HEAL_PREDICTION", "raid1");
  expect(addon.eval("return Vanguard_RaidUnitButton1.heal:IsShown()"), "an event while off draws nothing").toBe(false);
  switchTo(addon, "RaidHealing", true);
  expect(healing(addon, 1).heal, "back, with the heal as it is now").toBe(50);
});

lifecycleCases("RaidStatus", login);

it("RaidStatus: switched off, every tile loses its marks and its range fade and the range job stops; on again they return", () => {
  const addon = loggedIn("C_Timer = nil " + UNITS_ENV + RAID_ENV + STATUS_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(3, "raid3")');
  expect([marks(addon, 1).leader !== false, marks(addon, 3).alpha], "a leader crown, a faded tile").toEqual([true, 0.4]);
  switchTo(addon, "RaidStatus", false);
  expect([marks(addon, 1).leader, marks(addon, 3).alpha, marks(addon, 3).status], "no marks, no fade, the status text back").toEqual([false, 1, true]);
  expect(addon.eval('return ns.ticker.vgJobs["raid range"] ~= nil'), "no range job").toBe(false);
  addon.fire("READY_CHECK");
  expect(marks(addon, 1).ready, "a ready check while off draws nothing").toBe(false);
  switchTo(addon, "RaidStatus", true);
  expect([marks(addon, 1).leader !== false, marks(addon, 3).alpha, addon.eval('return ns.ticker.vgJobs["raid range"] ~= nil')]).toEqual([true, 0.4, true]);
});

lifecycleCases("OfficerLoot", login);

it("OfficerLoot: switched off, the roll tracker has no list (nothing is flagged), and on again it has it back", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB = { version = 2, profiles = { Default = { OfficerLoot = { on = true } } }, setupDone = true }\nVanguardCharDB = {}" });
  expect(addon.eval('return ns.GetModule("Rolls").reserve == ns.GetModule("OfficerLoot")'), "the tracker has the list").toBe(true);
  switchTo(addon, "OfficerLoot", false);
  expect(addon.eval('return ns.GetModule("Rolls").reserve'), "no list").toBe(null);
  switchTo(addon, "OfficerLoot", true);
  expect(addon.eval('return ns.GetModule("Rolls").reserve == ns.GetModule("OfficerLoot")'), "the list again").toBe(true);
});

lifecycleCases("Upgrades", login);

it("Upgrades: switched off, it reads as off (no settings, no upgrade); its tooltip and card hooks stay one each, however often it is toggled", () => {
  const addon = loggedIn("");
  const hooks = () => addon.eval('return { #ns.GetModule("Tooltips").itemLines, #ns.QuestParts.cardHooks }');
  const [lines, cards] = hooks();
  switchTo(addon, "Upgrades", false);
  expect(addon.eval('local UP = ns.GetModule("Upgrades") return { UP.settings == nil, UP.IsUpgrade("item:2") }'), "off").toEqual([true, false]);
  for (let i = 0; i < 3; i++) addon.eval('ns.SetModuleEnabled("Upgrades", true) ns.SetModuleEnabled("Upgrades", false)');
  switchTo(addon, "Upgrades", true);
  expect(hooks(), "each hook once").toEqual([lines, cards]);
  expect(addon.eval('return ns.GetModule("Upgrades").settings ~= nil'), "on again").toBe(true);
});

// TEST-ONLY character pane with a head slot wearing a level 40 helm.
const CHARACTER_PANE = `
  CharacterFrame = CreateFrame("Frame", "CharacterFrame", UIParent) CharacterFrame:Hide()
  CreateFrame("Button", "CharacterHeadSlot", CharacterFrame).GetID = function() return 1 end
  __wfgWorld.items[1001] = { name = "TEST-ONLY Helm", quality = 3, level = 40, equipLoc = "INVTYPE_HEAD" }
  __wfgWorld.worn[1] = "item:1001:0"
`;
const withPane = (saved) => loggedIn(CHARACTER_PANE, { savedVariables: saved });

lifecycleCases("CharacterExtras", withPane);

it("CharacterExtras: switched off, the item level on the game's slot goes and the pane draws none; on again it returns", () => {
  const addon = withPane("");
  const level = () => addon.eval("local l = ns.FrameState('vgGearInfo')[CharacterHeadSlot] return l and l.level:IsShown() or false");
  addon.eval("CharacterFrame:Show()");
  expect(level(), "shown").toBe(true);
  switchTo(addon, "CharacterExtras", false);
  expect(level(), "gone at once").toBe(false);
  addon.eval("CharacterFrame:Hide() CharacterFrame:Show()");
  expect(level(), "the pane opening draws nothing").toBe(false);
  switchTo(addon, "CharacterExtras", true);
  expect(level(), "back, the pane being open").toBe(true);
});

lifecycleCases("Errands", login);

// TEST-ONLY trainer window with one service to learn.
const TRAINER = `
  __services = { { "TEST-ONLY Bolt", "available", 500 } }
  GetMoney = function() return 2200 end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], "", s[2], false end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
`;

it("Errands: switched off, the Train all button on the game's trainer window is hidden and stays hidden; on again it returns, not made twice", () => {
  const addon = loggedIn(TRAINER);
  const button = () => addon.eval('local b = ns.GetModule("Errands").trainButton return b ~= nil and b:IsShown()');
  addon.fire("TRAINER_SHOW");
  expect(button(), "shown on the trainer").toBe(true);
  const frames = addon.eval("return #__wfgStub.frames");
  switchTo(addon, "Errands", false);
  expect(button(), "hidden at once").toBe(false);
  addon.fire("TRAINER_SHOW");
  expect(button(), "a trainer opening while off shows nothing").toBe(false);
  expect(addon.eval('return ns.GetModule("Errands").settings == nil'), "the module reads as off").toBe(true);
  switchTo(addon, "Errands", true);
  expect(button(), "back").toBe(true);
  expect(addon.eval("return #__wfgStub.frames"), "the same button, not a new one").toBe(frames);
});

it("Errands: a flight timer switched off points its hooks at nothing, and switched on again at the timer", () => {
  const addon = loggedIn("TakeTaxiNode = function() end TaxiRequestEarlyLanding = function() end");
  const target = () => addon.eval('local ER = ns.GetModule("Errands") return ER.scope.latest["take taxi"] == ER.OnTakeTaxi and "timer" or ER.scope.latest["take taxi"] == ER.Idle and "idle"');
  expect(target(), "on at login").toBe("timer");
  addon.eval('VanguardDB.profiles.Default.Errands.flightTimer = false ns.RestartModule("Errands")');
  expect(target(), "off").toBe("idle");
  addon.eval('VanguardDB.profiles.Default.Errands.flightTimer = true ns.RestartModule("Errands")');
  expect(target(), "on again").toBe("timer");
});

lifecycleCases("Merchant", login);

it("Merchant: switched off, it reads as off and a merchant opening does nothing; on again it repairs and sells as before", () => {
  const addon = loggedIn("CanMerchantRepair = function() return true end GetRepairAllCost = function() return 50, true end GetMoney = function() return 500 end __repairs = 0 RepairAllItems = function() __repairs = __repairs + 1 end");
  const open = () => { addon.fire("MERCHANT_SHOW"); addon.fire("MERCHANT_CLOSED"); return addon.eval("return __repairs"); };
  expect(open(), "repairs at a merchant").toBe(1);
  switchTo(addon, "Merchant", false);
  expect(addon.eval('return ns.GetModule("Merchant").settings == nil'), "off").toBe(true);
  expect(open(), "nothing repaired while off").toBe(1);
  switchTo(addon, "Merchant", true);
  expect(open(), "repairs again").toBe(2);
});

lifecycleCases("TalentPlanner", login);

it("TalentPlanner: switched off, it reads as off and plan mode ends, so /vg talents spends nothing; on again it is back", () => {
  const addon = loggedIn("");
  addon.eval('ns.GetModule("TalentPlanner").planning = true');
  switchTo(addon, "TalentPlanner", false);
  expect(addon.eval('local TP = ns.GetModule("TalentPlanner") return { TP.settings == nil, TP.planning }'), "off, not planning").toEqual([true, false]);
  addon.chat();
  addon.slash("talents spend");
  expect(Array.from(addon.chat()).join("\n"), "the command says so").toMatch(/Talent planner is off/);
  switchTo(addon, "TalentPlanner", true);
  expect(addon.eval('return ns.GetModule("TalentPlanner").settings ~= nil'), "on again").toBe(true);
});
