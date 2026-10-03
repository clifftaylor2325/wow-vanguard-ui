// healing: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, HEALING_ENV, RAID_ENV, UNITS_ENV, healing, isTok, loggedIn } from "./helpers.mjs";

it("heal prediction, aggro, buff watch", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  const one = healing(addon, 1);
  expect(one.heal === 200 && one.healMax === 1000 && one.shield === 150, "incoming heals and shields from the client's calculator").toBeTruthy();
  expect(addon.eval("return __calc.clamp") === 0, "incoming heals are clamped to missing health").toBeTruthy();
  expect(healing(addon, 2).heal?.__secret, "hidden incoming heals go to the bar untouched").toBeTruthy();
  expect(isTok(addon, one.threat, "threat3"), "full aggro shows a red strip").toBeTruthy();
  expect(healing(addon, 2).threat === false, "hidden threat shows no strip").toBeTruthy();
  expect(one.missing === "TEST-ONLY-ICON-Arcane Intellect", "a player missing your buff is marked with its icon").toBeTruthy();
  expect(healing(addon, 2).missing === false, "the group version of the buff counts").toBeTruthy();
  expect(healing(addon, 3).missing === false, "offline players aren't marked").toBeTruthy();
  addon.eval("__buffs.raid1 = { ['Arcane Intellect'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "the mark goes once they have it").toBeTruthy();
  addon.eval("__threat.raid1 = 0");
  addon.fire("UNIT_THREAT_SITUATION_UPDATE", "raid1");
  expect(healing(addon, 1).threat === false, "the strip goes with the aggro").toBeTruthy();
  addon.eval("__pred.raid1.heals = 50");
  addon.fire("UNIT_HEAL_PREDICTION", "raid1");
  expect(healing(addon, 1).heal === 50, "UNIT_HEAL_PREDICTION refreshes the heal bar").toBeTruthy();
});

it("healing fallbacks and options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + `CreateUnitHealPredictionCalculator = nil UnitGetTotalAbsorbs = nil
    UnitGetIncomingHeals = function() return 120 end`);
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).heal === 120 && healing(addon, 1).shield == null, "without the calculator: the older incoming-heals call; no shields").toBeTruthy();
  addon.eval('ns.Options.Show("healing")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.save and w.input then w.input:SetText("TEST-ONLY Aura, Arcane Brilliance") w.save:GetScript("OnClick")(w.save) end end`);
  expect(addon.eval("return ForeverUIDB.profiles.Default.RaidHealing.buffs") === "TEST-ONLY Aura, Arcane Brilliance", "the buff list saves").toBeTruthy();
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Brilliance", "and the frames watch the saved names").toBeTruthy();
  expect(addon.eval('return __click("Aggro strip")') && addon.eval("return ForeverUIDB.profiles.Default.RaidHealing.aggro") === false, "the page's switches work").toBeTruthy();
});
