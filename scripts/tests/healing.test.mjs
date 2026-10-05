// healing: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

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

// TEST-ONLY: the client's all-at-once aura list (counted), the by-name lookup and the spell lookup (counted too),
// and the aura restriction (__secretAuras).
const AURA_LIST = `__auraCalls, __byName, __spellInfo, __secretAuras = 0, 0, 0, false
  C_UnitAuras.GetUnitAuras = function(unit) __auraCalls = __auraCalls + 1 local out = {} for name in pairs(__buffs[unit] or {}) do out[#out + 1] = { name = name } end return out end
  local byName, info = C_UnitAuras.GetAuraDataBySpellName, C_Spell.GetSpellInfo
  C_UnitAuras.GetAuraDataBySpellName = function(...) __byName = __byName + 1 return byName(...) end
  C_Spell.GetSpellInfo = function(...) __spellInfo = __spellInfo + 1 return info(...) end
  C_Secrets = { ShouldAurasBeSecret = function() return __secretAuras end }`;

// The buff watch's calls since the last look (then forgets them): { list, byName, spell }.
const buffCalls = (addon) => addon.eval("local c = { list = __auraCalls, byName = __byName, spell = __spellInfo } __auraCalls, __byName, __spellInfo = 0, 0, 0 return c");

it("buff watch: one aura pass per aura change, nothing on health, the names and known spells kept", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + AURA_LIST);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  buffCalls(addon);
  for (let i = 0; i < 100; i++) { addon.eval(`__units.raid1.hp = ${300 + i}`); addon.fire("UNIT_HEALTH", "raid1"); }
  expect([buffCalls(addon), healing(addon, 1).missing], "100 health events: no aura or spell lookups, the marker stays").toEqual([{ list: 0, byName: 0, spell: 0 }, "TEST-ONLY-ICON-Arcane Intellect"]);
  addon.eval("__buffs.raid1 = { ['Arcane Intellect'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect([buffCalls(addon), healing(addon, 1).missing], "one aura change: one pass over the unit's buffs, no by-name lookups, no spell lookups").toEqual([{ list: 1, byName: 0, spell: 0 }, false]);
  expect(addon.eval('local RH = ns.GetModule("RaidHealing") return RH.BuffNames() == RH.BuffNames()'), "the name list is read once and kept").toBe(true);
  addon.eval("__buffs.raid1 = {} __known = { ['Arcane Brilliance'] = true } GetSpellInfo = nil");
  addon.fire("SPELLS_CHANGED");
  addon.fire("SPELLS_CHANGED");
  addon.update(0);
  expect([buffCalls(addon).spell, healing(addon, 1).missing], "your spells changed: they are looked up again once (two names), and the tiles marked with what you know now").toEqual([2, "TEST-ONLY-ICON-Arcane Brilliance"]);
  addon.eval("__secretAuras = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(healing(addon, 1).missing, "a fight that hides auras takes the marker away").toBe(false);
});

it("healing fallbacks and options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + `CreateUnitHealPredictionCalculator = nil UnitGetTotalAbsorbs = nil
    UnitGetIncomingHeals = function() return 120 end`);
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).heal === 120 && healing(addon, 1).shield == null, "without the calculator: the older incoming-heals call; no shields").toBeTruthy();
  addon.eval('ns.Options.Show("healing")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.save and w.input then w.input:SetText("TEST-ONLY Aura, Arcane Brilliance") w.save:GetScript("OnClick")(w.save) end end`);
  expect(addon.eval("return VanguardDB.profiles.Default.RaidHealing.buffs") === "TEST-ONLY Aura, Arcane Brilliance", "the buff list saves").toBeTruthy();
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Brilliance", "and the frames watch the saved names").toBeTruthy();
  expect(addon.eval('return __click("Aggro strip")') && addon.eval("return VanguardDB.profiles.Default.RaidHealing.aggro") === false, "the page's switches work").toBeTruthy();
});
