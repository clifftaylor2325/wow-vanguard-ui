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
