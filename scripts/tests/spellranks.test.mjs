// spellranks: Spell ranks (Modules/SpellRanks.lua), the bar notice and trainer memory, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

// Both switches on (they start off).
const ON = "VanguardDB.profiles = { Default = { SpellRanks = { barNotice = true, trainerMemory = true } } }";

// A logged-in mage who knows Frostbolt Rank 1 to 3 and Arcane Intellect (unranked).
function mage(savedVariables = ON) {
  const addon = loggedIn("", { savedVariables });
  for (const [id, name, rank] of [[100, "TEST-ONLY Frostbolt", 1], [101, "TEST-ONLY Frostbolt", 2], [102, "TEST-ONLY Frostbolt", 3], [200, "TEST-ONLY Intellect"]]) {
    addon.world.learn(id, { name, rank });
  }
  addon.advance(0.25);
  return addon;
}

// Puts spell `id` on action slot `slot` (the world fires the slot change).
const put = (addon, slot, id) => addon.eval(`__wfgWorld.setAction(${slot}, { id = ${id} })`);

// The spell IDs on the slots, 0 for an empty one.
const slots = (addon, list) => addon.eval(`local out = {} for i, s in ipairs({ ${list.join(",")} }) do out[i] = select(2, GetActionInfo(s)) or 0 end return out`);

// How many chat lines match.
const count = (addon, re) => Array.from(addon.chat()).filter((l) => re.test(l)).length;

it("the bar notice says once that buttons hold an older rank; /vg ranks lists them without changing anything", () => {
  const addon = mage();
  put(addon, 3, 100);
  put(addon, 14, 101);
  put(addon, 5, 102);
  put(addon, 6, 200);
  addon.eval('__wfgWorld.setAction(7, { type = "macro", id = 5 })');
  addon.advance(0.25);
  expect(count(addon, /2 button\(s\) on your bars hold an older spell rank\./), "two buttons, said once").toBe(1);
  addon.world.learn(300, { name: "TEST-ONLY Other", rank: 1 });
  addon.advance(0.25);
  expect(count(addon, /hold an older spell rank/), "the same list is not said again").toBe(1);
  addon.slash("ranks");
  expect(chatHas(addon, /Bar 1 button 3: TEST-ONLY Frostbolt Rank 1 -> Rank 3$/), "bar 1").toBe(true);
  expect(chatHas(addon, /Action slot 14: TEST-ONLY Frostbolt Rank 2 -> Rank 3$/), "bar 1's second page, which no button shows now").toBe(true);
  expect(slots(addon, [3, 14]), "nothing changed").toEqual([100, 101]);
});

it("/vg ranks names Vanguard's bar and button for a slot, and sees bars 6 to 8", () => {
  const addon = mage("VanguardDB.profiles = { Default = { SpellRanks = { barNotice = true }, ActionBars = { bars = { [6] = { enabled = true } } } } }");
  put(addon, 61, 100);
  put(addon, 145, 101);
  addon.slash("ranks");
  expect(chatHas(addon, /Bar 2 button 1: TEST-ONLY Frostbolt Rank 1 -> Rank 3$/), "slot 61 is Vanguard's bar 2").toBe(true);
  expect(chatHas(addon, /Bar 6 button 1: TEST-ONLY Frostbolt Rank 2 -> Rank 3$/), "slot 145 is Vanguard's bar 6").toBe(true);
});

it("/vg ranks swap puts the newest rank on each button, out of combat, and the notice speaks again for a new one", () => {
  const addon = mage();
  put(addon, 3, 100);
  put(addon, 14, 101);
  addon.advance(0.25);
  setCombat(addon, true);
  addon.slash("ranks swap");
  expect([chatHas(addon, /Bars can't change in combat/), slots(addon, [3, 14])], "not in combat").toEqual([true, [100, 101]]);
  setCombat(addon, false);
  addon.slash("ranks swap");
  expect([chatHas(addon, /Put the newest rank on 2 button\(s\)\./), slots(addon, [3, 14]), addon.eval("return GetCursorInfo()")], "both swapped, cursor empty").toEqual([true, [102, 102], null]);
  addon.slash("ranks");
  expect(chatHas(addon, /Every spell on your bars is at your newest rank\./), "nothing left").toBe(true);
  addon.advance(0.25);
  put(addon, 4, 100);
  addon.advance(0.25);
  expect(count(addon, /1 button\(s\) on your bars hold an older spell rank\./), "a new older rank is said").toBe(1);
});

it("a swap leaves the cursor alone when it holds something, and says so when nothing could change", () => {
  const addon = mage();
  put(addon, 3, 100);
  addon.eval('__wfgWorld.cursor = { type = "item", id = 1 }');
  addon.slash("ranks swap");
  expect([chatHas(addon, /No button changed\./), slots(addon, [3]), addon.eval("return GetCursorInfo()")], "a held item stays held").toEqual([true, [100], "item"]);
  addon.eval("__wfgWorld.cursor = nil C_Spell.PickupSpell = function() end");
  addon.slash("ranks swap");
  expect([count(addon, /No button changed\./), slots(addon, [3])], "a pickup that doesn't take leaves the bar").toEqual([2, [100]]);
});

it("a client with only the global PickupSpell still swaps", () => {
  const addon = mage();
  addon.eval("C_Spell.PickupSpell = nil PickupSpell = function(id) __wfgWorld.cursor = { type = 'spell', id = id } end");
  put(addon, 3, 100);
  addon.slash("ranks swap");
  expect(slots(addon, [3]), "the global took it").toEqual([102]);
  addon.eval("PickupSpell = nil");
  put(addon, 3, 100);
  addon.slash("ranks swap");
  expect([slots(addon, [3]), addon.eval("return #ns.errors")], "neither: no change, no error").toEqual([[100], 0]);
});

it("the bar notice is off until switched on, and waits out combat", () => {
  const off = mage("");
  put(off, 3, 100);
  off.advance(0.25);
  expect(chatHas(off, /hold an older spell rank/), "off by default").toBe(false);
  off.slash("ranks");
  expect(chatHas(off, /(Bar 1 button|Action slot) 3: /), "the list still works").toBe(true);
  const on = mage();
  setCombat(on, true);
  put(on, 3, 100);
  on.world.learn(301, { name: "TEST-ONLY Another", rank: 1 });
  on.advance(0.25);
  expect(chatHas(on, /hold an older spell rank/), "nothing said in combat").toBe(false);
  setCombat(on, false);
  expect(chatHas(on, /1 button\(s\) on your bars hold an older spell rank\./), "said when it ends").toBe(true);
});

// TEST-ONLY trainer: Fireball R3 (level 6, can learn), Frostbolt R4 (level 8, not yet; rank among later returns), one learned, one with no level, one with a hidden name.
const TRAINER = `
  __services = {
    { "TEST-ONLY Fireball", "available", 500, 6, "Rank 3" }, { "TEST-ONLY Frostbolt", "unavailable", 900, 8, "Rank 4" },
    { "TEST-ONLY Old", "used", 0, 4, "Rank 1" }, { "TEST-ONLY Recipe", "available", 10, 0 }, { __secret = true, "available", 1, 5 },
  }
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1].__secret and s[1] or s[1], s[2], 134400, 1, s[5] end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  GetTrainerServiceLevelReq = function(i) return __services[i][4] end
  __wfgWorld.units.npc = { name = "Archmage Test" }
`;

// Opens the trainer and lets the remembering happen.
function visit(addon) {
  addon.fire("TRAINER_SHOW");
  addon.advance(0.25);
}

// The remembered mage services as [name, rank, level, trainer, zone, sub], sorted by name.
const remembered = (addon) => addon.eval(`local out = {}
  local c = VanguardDB.trainers.MAGE
  for _, s in pairs(c and c.list or {}) do out[#out + 1] = { s.name, s.rank or false, s.level, s.trainer or false, s.zone or false, s.sub or false } end
  table.sort(out, function(a, b) return a[1] < b[1] end) return out`);

it("trainer memory keeps what a trainer teaches and at what level, and /vg trainers next says what is coming", () => {
  const addon = mage();
  addon.eval(TRAINER.replace("{ __secret = true, \"available\", 1, 5 }", '{ __wfgWorld.secret("x"), "available", 1, 5 }'));
  visit(addon);
  expect(remembered(addon), "the two to come, with the trainer and place; learned, no level and hidden are skipped").toEqual([
    ["TEST-ONLY Fireball", "Rank 3", 6, "Archmage Test", "Elwynn Forest", "Goldshire"], ["TEST-ONLY Frostbolt", "Rank 4", 8, "Archmage Test", "Elwynn Forest", "Goldshire"],
  ]);
  addon.slash("trainers");
  expect(chatHas(addon, /2 trainer service\(s\) remembered for your class\./), "the count").toBe(true);
  addon.eval("__wfgWorld.units.player.level = 5");
  addon.slash("trainers next");
  expect(chatHas(addon, /Trainers you've visited teach, in the next levels:/), "a header").toBe(true);
  expect(chatHas(addon, /Level 6: TEST-ONLY Fireball Rank 3 \(Archmage Test, Elwynn Forest, Goldshire\)$/), "level 6").toBe(true);
  expect(chatHas(addon, /Level 8: TEST-ONLY Frostbolt Rank 4 \(Archmage Test, Elwynn Forest, Goldshire\)$/), "level 8").toBe(true);
  addon.eval("__wfgWorld.units.player.level = 1");
  addon.slash("trainers next");
  expect(count(addon, /Level 8: TEST-ONLY Frostbolt/), "a service more than five levels ahead is left out").toBe(1);
});

it("on a German client the trainer's rank text is kept by its number, not the English word; a texture path is no rank", () => {
  const addon = mage();
  addon.eval('__wfgWorld.locale = "deDE"');
  addon.eval(TRAINER.replace('"Rank 3"', '"Rang 3"').replace('"Rank 4"', '"Interface\\\\Icons\\\\Spell_Frost_02"'));
  visit(addon);
  expect(remembered(addon).map((s) => s.slice(0, 2)), "Rang 3 is the rank; the path is not").toEqual([["TEST-ONLY Fireball", "Rang 3"], ["TEST-ONLY Frostbolt", false]]);
});

it("a level-up says what the trainers teach from that level; clear forgets", () => {
  const addon = mage();
  addon.eval(TRAINER.replace("{ __secret = true, \"available\", 1, 5 }", '{ "TEST-ONLY Late", "unavailable", 1, 30 }'));
  visit(addon);
  addon.fire("PLAYER_LEVEL_UP", 6);
  expect([chatHas(addon, /Trainers you've visited teach, from this level:/), chatHas(addon, /Level 8: TEST-ONLY Frostbolt/), chatHas(addon, /Level 6: TEST-ONLY Fireball/), chatHas(addon, /Level 30:/)], "levels 6 to 10 only").toEqual([true, true, true, false]);
  addon.eval("__wfgWorld.units.player.level = 60");
  addon.slash("trainers next");
  expect(chatHas(addon, /Nothing remembered for the next levels\./), "nothing near level 60").toBe(true);
  addon.slash("trainers clear");
  addon.slash("trainers");
  expect([chatHas(addon, /Forgot every trainer\./), chatHas(addon, /0 trainer service\(s\) remembered/)], "cleared").toEqual([true, true]);
});

it("a service's place text drops what the client hides; a name seen again updates, and a full list takes no new one", () => {
  const addon = mage();
  addon.eval(TRAINER);
  // The service text for a record with these Lua fields.
  const text = (fields) => addon.eval(`return ns.GetModule("SpellRanks").Text({ level = 7, name = "X", ${fields} })`);
  expect([text('rank = "Rank 2", trainer = "T", zone = "Z"'), text('trainer = "T", sub = "S"'), text('trainer = "T"'), text("")], "rank, trainer and place as known").toEqual([
    "Level 7: X Rank 2 (T, Z)", "Level 7: X (T, S)", "Level 7: X (T)", "Level 7: X",
  ]);
  addon.eval("ns.GetModule('SpellRanks').MAX_SERVICES = 2");
  visit(addon);
  addon.eval('__services[1][3] = 1 __services[2][1] = "TEST-ONLY Third" __wfgWorld.zone.sub = ""');
  visit(addon);
  expect(remembered(addon).map((s) => s[0]), "Fireball updated in place; the third is turned away at the cap").toEqual(["TEST-ONLY Fireball", "TEST-ONLY Frostbolt"]);
  expect(remembered(addon)[0][5], "the later visit's place (no subzone)").toBe(false);
});

it("trainer memory reads nothing when it is off, in combat, with a hidden trainer name or class, or without the calls", () => {
  // Whether nothing is remembered.
  const none = (addon) => addon.eval("return next(VanguardDB.trainers or {}) == nil");
  const off = mage("");
  off.eval(TRAINER);
  visit(off);
  expect([none(off), off.eval("return #ns.errors")], "off by default").toEqual([true, 0]);
  const combat = mage();
  combat.eval(TRAINER);
  setCombat(combat, true);
  visit(combat);
  expect(none(combat), "not in combat").toBe(true);
  const hidden = mage();
  hidden.eval(TRAINER + '__wfgWorld.units.npc = { name = __wfgWorld.secret("n") }');
  visit(hidden);
  expect(none(hidden), "a hidden trainer name").toBe(true);
  const noClass = mage();
  noClass.eval(TRAINER + 'UnitClass = function() return "x", __wfgWorld.secret("MAGE") end');
  visit(noClass);
  expect(none(noClass), "a hidden class").toBe(true);
  noClass.slash("trainers");
  expect(chatHas(noClass, /0 trainer service\(s\) remembered/), "nothing counted").toBe(true);
  const bare = mage();
  bare.eval('__wfgWorld.units.npc = { name = "Archmage Test" }');
  visit(bare);
  bare.fire("PLAYER_LEVEL_UP", 5);
  bare.eval("__wfgWorld.units.player.level = 3 ns.GetModule('SpellRanks').settings.trainerMemory = false");
  bare.fire("PLAYER_LEVEL_UP", 4);
  bare.slash("trainers next");
  expect([chatHas(bare, /Trainers you've visited teach, from this level/), chatHas(bare, /Nothing remembered/)], "a client without trainer calls remembers nothing; off, a level-up is quiet").toEqual([false, true]);
});

it("the module off: /vg ranks still reads, nothing is watched", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { SpellRanks = false } } }" });
  addon.world.learn(100, { name: "TEST-ONLY Frostbolt", rank: 1 });
  addon.world.learn(101, { name: "TEST-ONLY Frostbolt", rank: 2 });
  put(addon, 3, 100);
  addon.advance(0.25);
  addon.slash("ranks");
  addon.slash("trainers");
  expect([chatHas(addon, /hold an older spell rank/), chatHas(addon, /(Bar 1 button|Action slot) 3: /), chatHas(addon, /0 trainer service\(s\)/)], "no notice, but the commands answer").toEqual([false, true, true]);
});

it("upcoming services come lowest level first, then by name", () => {
  const addon = mage();
  addon.eval(`local SR = ns.GetModule("SpellRanks")
    for i, l in ipairs({ 9, 6, 8, 7, 6 }) do SR.Remember("MAGE", { name = "TEST-ONLY " .. (10 - i), level = l }) end`);
  expect(addon.eval(`local out = {} for i, s in ipairs(ns.GetModule("SpellRanks").Upcoming(5)) do out[i] = s.level .. s.name end return out`), "sorted").toEqual([
    "6TEST-ONLY 5", "6TEST-ONLY 8", "7TEST-ONLY 6", "8TEST-ONLY 7", "9TEST-ONLY 9",
  ]);
});
