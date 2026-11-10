// healing: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, FOREVER_ENV, HEALING_ENV, RAID_ENV, UNITS_ENV, healing, isTok, loggedIn, unitEvents } from "./helpers.mjs";

it("the power bar sits above the incoming-heal and shield bars and under the tile's texts, so a prediction never covers the mana strip", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1")');
  const levels = addon.eval("local b = Vanguard_RaidUnitButton1 return { b.heal:GetFrameLevel(), b.shield:GetFrameLevel(), b.power:GetFrameLevel(), b.texts:GetFrameLevel() }");
  expect(levels[2] > levels[0] && levels[2] > levels[1], "power above heal and shield").toBe(true);
  expect(levels[2] < levels[3], "and still under the texts").toBe(true);
});

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
  addon.eval("VanguardDB.profiles.Default.RaidHealing.healPrediction = false");
  addon.fire("UNIT_HEAL_PREDICTION", "raid1");
  expect(addon.eval("local b = Vanguard_RaidUnitButton1 return { b.heal:IsShown(), b.heal:GetValue() }"), "incoming heals turned off: the bar hides empty, so the shield starts at the health edge").toEqual([false, 0]);
});

it("H28-I4 overshield: a bright line at the health bar's end when shields run past a full bar, a hidden answer to its opacity", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  // Raid button i's overshield mark: [shown, opacity, the hidden answer it was handed].
  const mark = (i) => addon.eval(`local m = Vanguard_RaidUnitButton${i}.overshield return { m:IsShown(), m:GetAlpha(), m.__alphaFromBoolean ~= nil }`);
  expect(addon.eval("return __calc.absorbClamp"), "shields are clamped to missing health less incoming heals").toBe(0);
  expect(mark(1), "shields past a full bar: lit").toEqual([true, 1, false]);
  expect(mark(2)[2], "a hidden answer goes to its opacity untouched").toBe(true);
  expect(mark(3), "shields within the bar: unlit").toEqual([true, 0, false]);
  addon.eval("__calc.GetDamageAbsorbs = nil");
  addon.fire("UNIT_ABSORB_AMOUNT_CHANGED", "raid1");
  expect(mark(1)[1], "a calculator that can't say: unlit").toBe(0);
  addon.eval("VanguardDB.profiles.Default.RaidHealing.absorbs = false");
  addon.fire("UNIT_ABSORB_AMOUNT_CHANGED", "raid1");
  expect(mark(1)[0], "shields turned off: no mark").toBe(false);
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

it("buff watch: by-name lookups and no aura list per aura change, nothing on health, the names and known spells kept", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + AURA_LIST);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2"); __spawn(3, "raid3")');
  buffCalls(addon);
  for (let i = 0; i < 100; i++) { addon.eval(`__units.raid1.hp = ${300 + i}`); addon.fire("UNIT_HEALTH", "raid1"); }
  expect([buffCalls(addon), healing(addon, 1).missing], "100 health events: no aura or spell lookups, the marker stays").toEqual([{ list: 0, byName: 0, spell: 0 }, "TEST-ONLY-ICON-Arcane Intellect"]);
  addon.eval("__buffs.raid1 = { ['Arcane Intellect'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect([buffCalls(addon), healing(addon, 1).missing], "A1-6: one aura change: a by-name lookup that finds the first watched buff, no list of every buff built, no spell lookups").toEqual([{ list: 0, byName: 1, spell: 0 }, false]);
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

it("Y1-4 buff watch: an aura event that only refreshes auras looks nothing up; one that adds, removes or resets does", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + AURA_LIST);
  addon.eval('__spawn(1, "raid1")');
  buffCalls(addon);
  // Fires UNIT_AURA for raid1 with the given update info (Lua).
  const aura = (info) => addon.eval(`__wfgStub.fire("UNIT_AURA", "raid1", ${info})`);
  aura("{ isFullUpdate = false, updatedAuraInstanceIDs = { 7, 8 } }");
  aura("{ isFullUpdate = false, addedAuras = {}, removedAuraInstanceIDs = {}, updatedAuraInstanceIDs = { 9 } }");
  expect(buffCalls(addon).byName, "two refreshes: no lookup").toBe(0);
  addon.eval("__buffs.raid1 = { ['Arcane Intellect'] = true }");
  aura("{ isFullUpdate = false, addedAuras = { { auraInstanceID = 10 } } }");
  expect([buffCalls(addon).byName, healing(addon, 1).missing], "a buff added: looked up, and the marker goes").toEqual([1, false]);
  aura("{ isFullUpdate = false, removedAuraInstanceIDs = { 10 } }");
  aura("{ isFullUpdate = true }");
  aura("nil");
  aura("{ isFullUpdate = { __secret = true } }");
  expect(buffCalls(addon).byName, "removed, a full update, no info and a hidden flag: each looked up").toBe(4);
});

it("healing reads: a hidden number goes through untouched, a missing call or a non-number is nil, never tested for truth", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + "CreateUnitHealPredictionCalculator = nil");
  // Runs setup, then reads the fallback prediction and threat color: [incoming is the secret, shields is, incoming, shields, strip colored].
  const read = (setup) => addon.eval(`local RH = ns.GetModule("RaidHealing") ${setup}
    local _, incoming, shields = RH.Prediction("raid1")
    return { incoming == __s, shields == __s, tostring(incoming), tostring(shields), tostring(RH.ThreatColor("raid1") ~= nil) }`);
  expect(read("__s = __wfgWorld.secret() UnitGetIncomingHeals = function() return __s end UnitGetTotalAbsorbs = function() return __s end UnitThreatSituation = function() return __s end"), "hidden heals and shields are handed on as they are; hidden threat shows no strip")
    .toEqual([true, true, expect.any(String), expect.any(String), "false"]);
  expect(read("UnitGetIncomingHeals = nil UnitGetTotalAbsorbs = nil UnitThreatSituation = nil"), "a client without the calls: nothing").toEqual([false, false, "nil", "nil", "false"]);
  expect(read("UnitGetIncomingHeals = function() return false end UnitGetTotalAbsorbs = function() return 'x' end UnitThreatSituation = function() return 2 end"), "a value that is not a number is nothing; plain threat still colors the strip").toEqual([false, false, "nil", "nil", "true"]);
  expect(read("UnitGetIncomingHeals = function() return 45 end UnitGetTotalAbsorbs = function() return 0 end UnitThreatSituation = function() return 0 end"), "plain numbers pass, zero too; no aggro, no strip").toEqual([false, false, "45", "0", "false"]);
});

it("healing fallbacks and options", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + `CreateUnitHealPredictionCalculator = nil UnitGetTotalAbsorbs = nil
    UnitGetIncomingHeals = function() return 120 end`);
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).heal === 120 && healing(addon, 1).shield === 0 && addon.eval("return Vanguard_RaidUnitButton1.shield:IsShown()") === false, "without the calculator: the older incoming-heals call; no shields (the bar hidden, empty)").toBeTruthy();
  addon.eval('ns.Options.Show("healing")');
  // The one buff editor on the page, found before Save is pressed: Save rebuilds the page (new rows for the typed
  // names), which appends a fresh editor to the client's frame list, so a walk over that list would press Save forever.
  addon.eval(`local editor for _, w in ipairs(__wfgStub.frames) do if w.save and w.input then editor = w end end
    editor.input:SetText("TEST-ONLY Aura, Arcane Brilliance") editor.save:GetScript("OnClick")(editor.save)`);
  expect(addon.eval("return VanguardDB.profiles.Default.RaidHealing.buffs") === "TEST-ONLY Aura, Arcane Brilliance", "the buff list saves").toBeTruthy();
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Brilliance", "and the frames watch the saved names").toBeTruthy();
  expect(addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.icon and w.label and w.label:GetText() == "Arcane Intellect" then return w.icon:GetTexture() end end`), "each class buff gets a row with its icon").toBe("TEST-ONLY-ICON-Arcane Intellect");
  expect(addon.eval('return __click("TEST-ONLY Aura")') && addon.eval("return VanguardDB.profiles.Default.RaidHealing.buffs"), "a buff's switch takes it off the list").toBe("Arcane Brilliance");
  expect(addon.eval('return __click("Aggro strip")') && addon.eval("return VanguardDB.profiles.Default.RaidHealing.aggro") === false, "the page's switches work").toBeTruthy();
  addon.eval("ns.Settings('RaidHealing').buffs = '  , Arcane Brilliance,' ns.GetModule('RaidHealing').Forget()");
  expect(addon.eval("return ns.GetModule('RaidHealing').BuffNames()"), "blank pieces (spaces, a trailing comma) are no buff names").toEqual(["Arcane Brilliance"]);
  addon.eval("ns.Settings('RaidHealing').buffs = '   ' ns.GetModule('RaidHealing').Forget()");
  expect(addon.eval("return #ns.GetModule('RaidHealing').BuffNames() > 0"), "only blanks: the class's own buffs, not none").toBe(true);
});

it("every healing buff has a static icon, so none shows a question mark", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV);
  expect(addon.eval(`local RH = ns.GetModule("RaidHealing") for _, c in ipairs(RH.ALL_BUFFS) do for _, b in ipairs(c[2]) do
    if not RH.FALLBACK_ICONS[b[2]] then return b[1] end end end return "ok"`), "each listed buff has a fallback icon").toBe("ok");
  addon.eval("C_Spell.GetSpellTexture = function() return nil end");
  addon.eval('ns.Options.Show("healing")');
  expect(addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.icon and w.label and w.label:GetText() == "Blessing of Sanctuary" then return w.icon:GetTexture() end end`), "an unknown spell falls back to its static icon").toBe("Interface\\Icons\\Spell_Nature_LightningShield");
});

it("on a German client the class buffs are watched and listed under the client's names", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + `__wfgWorld.locale = "deDE"
    __names = { [1459] = "Arkane Intelligenz", [23028] = "Arkane Brillanz", [1243] = "Machtwort: Seelenstärke", [21562] = "Machtwort: Seelenstärke" }
    __known = { ["Arkane Intelligenz"] = true } __buffs = { raid2 = { ["Arkane Brillanz"] = true } }`);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2")');
  expect(addon.eval('return table.concat(ns.GetModule("RaidHealing").BuffNames(), ", ")'), "the mage's usual buffs, named by the client").toBe("Arkane Intelligenz, Arkane Brillanz");
  expect(healing(addon, 1).missing, "a player without them is marked with the buff you know").toBe("TEST-ONLY-ICON-Arkane Intelligenz");
  expect(healing(addon, 2).missing, "the German group buff counts").toBe(false);
  addon.eval('ns.Options.Show("healing")');
  // The icon of the buff row whose label reads `label`, or nil.
  const rowIcon = (label) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.icon and w.label and w.label:GetText() == "${label}" then return w.icon:GetTexture() end end`);
  expect(rowIcon("Arkane Brillanz"), "the options row shows the client's name").toBe("TEST-ONLY-ICON-Arkane Brillanz");
  expect(rowIcon("Arcane Brilliance"), "not the English one").toBe(null);
  expect(rowIcon("Divine Spirit"), "a buff the client can't name keeps its English label").toBe("TEST-ONLY-ICON-Divine Spirit");
  expect(addon.eval('local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.icon and w.label and w.label:GetText() == "Machtwort: Seelenstärke" then n = n + 1 end end return n'),
    "two ids the client names alike make one row").toBe(1);
});

it("H28-2-1: a player the client can't see (far away, another phase) gets no missing-buff mark until it can", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + "__unseen = { raid1 = true } UnitIsVisible = function(unit) return not __unseen[unit] end");
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).missing, "out of sight, without the buff: no mark").toBe(false);
  addon.eval("__unseen.raid1 = nil");
  addon.eval(`__wfgStub.fire("UNIT_AURA", "raid1", { isFullUpdate = true })`);
  expect(healing(addon, 1).missing, "in sight again, its auras sent: the mark shows").toBe("TEST-ONLY-ICON-Arcane Intellect");
});

it("H40-4-1: a Forever paladin's watch counts Blessing of Sanctuary, normal or greater, so its holder isn't marked missing Might", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + FOREVER_ENV + `
    __names = { [19740] = "Blessing of Might", [20911] = "Blessing of Sanctuary", [25899] = "Greater Blessing of Sanctuary" }
    __known = { ["Blessing of Might"] = true, ["Blessing of Sanctuary"] = true }
    local oldClass = UnitClass
    UnitClass = function(unit) if unit == "player" then return "Paladin", "PALADIN" end return oldClass(unit) end
  `);
  addon.eval('__spawn(1, "raid1")');
  addon.eval("ns.GetModule('RaidHealing').Forget()");
  addon.eval("__buffs.raid1 = { ['Blessing of Sanctuary'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect([healing(addon, 1).missing, addon.eval("return ns.GetModule('RaidHealing').MissingBuff('raid1')")], "Sanctuary: no mark").toEqual([false, null]);
  addon.eval("__buffs.raid1 = { ['Greater Blessing of Sanctuary'] = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing, "Greater Sanctuary: no mark").toBe(false);
  addon.eval("__buffs.raid1 = {}");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing, "no blessing: marked").toBe("TEST-ONLY-ICON-Blessing of Might");
});

// A1-6 (M1): the raid add-ons' unit events are each tile's own, not every unit's.
it("A1-6: heal prediction, shields, threat and auras are heard per tile, so another unit's events run nothing here", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + AURA_LIST);
  addon.eval('__spawn(1, "raid1"); __spawn(2, "raid2")');
  for (const event of ["UNIT_AURA", "UNIT_HEAL_PREDICTION", "UNIT_ABSORB_AMOUNT_CHANGED", "UNIT_THREAT_SITUATION_UPDATE"]) {
    const heard = unitEvents(addon, event);
    expect([heard.subs.includes("raid1") && heard.subs.includes("raid2"), heard.plain], event + ": each tile's own unit, nothing for every unit").toEqual([true, 0]);
  }
  buffCalls(addon);
  addon.fire("UNIT_AURA", "nameplate3");
  addon.fire("UNIT_AURA", "target");
  expect(buffCalls(addon), "a nameplate's and the target's aura changes look nothing up").toEqual({ list: 0, byName: 0, spell: 0 });
  addon.eval("C_UnitAuras.GetAuraDataBySpellName = nil __buffs.raid2 = { ['Arcane Intellect'] = true }");
  addon.fire("UNIT_AURA", "raid2");
  expect([buffCalls(addon).list, healing(addon, 2).missing], "a client without the by-name lookup: one pass over the list instead").toEqual([1, false]);
  addon.eval('Vanguard_RaidUnitButton2:SetAttribute("unit", "raid7") __units.raid7 = __units.raid2 __buffs.raid7 = {}');
  addon.fire("UNIT_AURA", "raid7");
  expect(healing(addon, 2).missing, "the tile's unit changed: it hears the new unit").toBe("TEST-ONLY-ICON-Arcane Intellect");
});

it("A1-6: with the raid frames off, raid healing takes no unit's heal, shield or threat events", () => {
  const addon = loggedIn(UNITS_ENV + HEALING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { RaidFrames = false, UnitFrames = false, GroupThreat = false, RaidTools = false } } }" });
  const plain = ["UNIT_HEAL_PREDICTION", "UNIT_ABSORB_AMOUNT_CHANGED", "UNIT_THREAT_SITUATION_UPDATE"].map((event) => unitEvents(addon, event).plain);
  expect(plain, "no frame takes them for every unit").toEqual([0, 0, 0]);
});

// A1-12 (L6): the overlays' width is set when the tile's width changes, not on every health event.
it("A1-12: a health event sets no overlay width again; a resized tile's overlays follow", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  addon.eval('__spawn(1, "raid1")');
  addon.eval(`__widths = 0 local b = Vanguard_RaidUnitButton1
    for _, bar in ipairs({ b.heal, b.shield }) do local set = bar.SetWidth bar.SetWidth = function(...) __widths = __widths + 1 return set(...) end end`);
  for (let i = 0; i < 20; i++) { addon.eval(`__units.raid1.hp = ${300 + i}`); addon.fire("UNIT_HEALTH", "raid1"); }
  expect(addon.eval("return __widths"), "twenty health events at one size: no width set").toBe(0);
  addon.eval("local b = Vanguard_RaidUnitButton1 b:SetWidth(b:GetWidth() + 20) __units.raid1.hp = 400");
  addon.fire("UNIT_HEALTH", "raid1");
  expect(addon.eval("local b = Vanguard_RaidUnitButton1 return { __widths, b.heal:GetWidth() == b:GetWidth() - 2 }"), "a wider tile: each overlay set once, to the health bar's width").toEqual([2, true]);
});
