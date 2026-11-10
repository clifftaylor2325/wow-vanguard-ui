// officerloot: the officer loot tools (Modules/OfficerLoot.lua), a soft-reserve list, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { SETUP_DONE, chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY: the game's English roll format.
const ROLL_ENV = 'RANDOM_ROLL_RESULT = "%s rolls %d (%d-%d)"\n';
// A saved profile with the tools switched on.
const ON = { savedVariables: "VanguardDB = { version = 2, profiles = { Default = { OfficerLoot = { on = true } } }, setupDone = true }\nVanguardCharDB = {}" };

// A system message saying `name` rolled `n` in 1-100.
const roll = (addon, name, n) => addon.fire("CHAT_MSG_SYSTEM", `${name} rolls ${n} (1-100)`);
// Types a /vg command and returns the chat lines it printed, joined.
const say = (addon, cmd) => { addon.chat(); addon.slash(cmd); return Array.from(addon.chat()).join("\n"); };
// The roll tracker's drawn lines as [left, right].
const lines = (addon) => addon.eval(`local f, out = Vanguard_Rolls, {}
  for i, row in ipairs(f.rows) do if row.left:IsShown() then out[#out + 1] = { row.left:GetText(), row.right:GetText() } end end
  return out`);
// TEST-ONLY loot history: one drop with two players, rolling or done.
const LOOT = (done) => `
  C_LootHistory = {
    GetAllEncounterInfos = function() return { { encounterID = 7, startTime = 100 } } end,
    GetSortedDropsForEncounter = function() return { {
      lootListKey = 1, itemHyperlink = "|cff0070dd|Hitem:1234:0|h[TEST-ONLY Boots]|h|r", startTime = 100, winner = ${done} and {} or nil,
      rollInfos = { { playerName = "Thrall", state = 0, roll = 40, isWinner = false }, { playerName = "Jaina", state = 3, roll = 70, isWinner = true } },
    } } end,
  }`;
// The options card's rows as [kind, label].
const rows = (addon) => addon.eval(`local out = {} for i, r in ipairs(ns.GetModule("OfficerLoot").Rows()) do out[i] = { r[1], r[2] } end return out`);
// Presses the card's button with this label.
const press = (addon, label) => addon.eval(`for _, r in ipairs(ns.GetModule("OfficerLoot").Rows()) do if r[2] == ${JSON.stringify(label)} then r[3]() end end`);
// The yes/no question: whether it shows, and its text.
const question = (addon) => addon.eval("local f = Vanguard_Question return { f:IsShown(), f.title:GetText() }");
// The names on the roll tracker's lines.
const names = (addon) => lines(addon).map((x) => x[0]);

it("the tools are off until switched on: commands say so, and on and off turn them on and off", () => {
  const addon = loggedIn(ROLL_ENV);
  expect(say(addon, "loot add Thrall Boots"), "off by default").toMatch(/off/);
  expect(say(addon, "loot on")).toMatch(/on\./);
  expect(addon.eval("return ns.Settings('OfficerLoot').on")).toBe(true);
  expect(say(addon, "loot")).toMatch(/add <player> <item>/);
  expect(say(addon, "loot off")).toMatch(/off\./);
  addon.eval("ns.GetModule('OfficerLoot').enabled = false");
  expect(say(addon, "loot on"), "module off").toMatch(/Modules/);
});

it("add, list, remove and clear keep reserves on the character, by name or item link", () => {
  const addon = loggedIn("", ON);
  expect(say(addon, "loot add Thrall Boots")).toMatch(/Reserved: Boots for Thrall/);
  expect(say(addon, "loot add thrall boots"), "same again").toMatch(/already reserves/);
  say(addon, "loot add Jaina |cff0070dd|Hitem:1234:0|h[Boots]|h|r");
  say(addon, "loot add Jaina Cloak");
  expect(say(addon, "loot add"), "needs both").toMatch(/Use \/vg loot add/);
  expect(say(addon, "loot list"), "one line per item").toMatch(/Boots: Thrall[^]*Cloak: Jaina/);
  expect(addon.eval("return #VanguardCharDB.lootReserves"), "kept on the character").toBe(3);
  expect(say(addon, "loot remove Jaina cloak")).toMatch(/Removed/);
  expect(say(addon, "loot remove Nobody cloak")).toMatch(/No such reserve/);
  say(addon, "loot clear");
  expect(question(addon), "clear asks first, naming what goes").toEqual([true, "Forget all 2 reserve(s) on this character? This can't be undone."]);
  addon.click("Vanguard_Question.no");
  expect(addon.eval("return #VanguardCharDB.lootReserves"), "No keeps them").toBe(2);
  say(addon, "loot clear");
  addon.click("Vanguard_Question.confirm");
  expect(chatHas(addon, /Forgot 2/), "Clear forgets them").toBe(true);
  expect(say(addon, "loot list"), "empty").toMatch(/No reserves yet/);
  expect(addon.eval("return ns.GetModule('OfficerLoot').Item('   ') == nil"), "blank item").toBe(true);
  expect(addon.eval("return ns.GetModule('OfficerLoot').Remove('x', '  ')"), "blank item removes nothing").toBe(0);
});

it("a roll on a reserved item is flagged [SR], by the item the loot history says is rolling, and the item lists who reserved it", () => {
  const addon = loggedIn(ROLL_ENV + LOOT("false"), ON);
  say(addon, "loot add Thrall TEST-ONLY Boots");
  say(addon, "loot add Realmguy-Stormrage |cff0070dd|Hitem:1234:0|h[Other name]|h|r");
  addon.fire("LOOT_HISTORY_UPDATE_DROP", 7, 1);
  roll(addon, "Thrall", 50);
  roll(addon, "Realmguy", 20);
  roll(addon, "Jaina", 10);
  expect(names(addon), "rolls flagged, then the item with its reserves and players").toEqual([
    "Rolls 1-100", "Thrall [SR]", "Realmguy [SR]", "Jaina", "|cff0070dd|Hitem:1234:0|h[TEST-ONLY Boots]|h|r", "Reserved: Thrall, Realmguy-Stormrage", "Thrall [SR]", "Jaina",
  ]);
  expect(say(addon, "loot focus Cloak")).toMatch(/flagged for Cloak/);
  expect(names(addon).slice(1, 4), "focus changes the item the round is for").toEqual(["Thrall", "Realmguy", "Jaina"]);
  expect(say(addon, "loot focus")).toMatch(/follow the item/);
  addon.eval('ns.Settings("OfficerLoot").on = false ns.GetModule("Rolls").Paint()');
  expect(names(addon).some((x) => /SR|Reserved/.test(x)), "off: no flags").toBe(false);
});

it("a reserve is for the same item id when both have one, and for the same name only when one side has none", () => {
  const addon = loggedIn("", ON);
  const OL = "ns.GetModule('OfficerLoot')";
  say(addon, "loot add Thrall |cff0070dd|Hitem:1234:0|h[TEST-ONLY Boots]|h|r");
  // Whether Thrall holds a reserve for this item text.
  const holds = (item) => addon.eval(`return ${OL}.Reserved('Thrall', ${JSON.stringify(item)})`);
  expect(holds("|Hitem:1234::|h[TEST-ONLY Boots]|h"), "the same id").toBe(true);
  expect(holds("|Hitem:5678::|h[TEST-ONLY Boots]|h"), "another item with the same name").toBe(false);
  expect(holds("TEST-ONLY Boots"), "typed by name only: the name decides").toBe(true);
});

it("a reserve for a player with a realm is not another realm's player of the same name; a bare name matches either way", () => {
  const addon = loggedIn("", ON);
  const OL = "ns.GetModule('OfficerLoot')";
  // Whether OfficerLoot reads the two names as one player.
  const same = (a, b) => addon.eval(`return ${OL}.Same(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  expect(same("Bob-Stormrage", "Bob-Silvermoon"), "two realms").toBe(false);
  expect(same("Bob-Stormrage", "Bob"), "a bare name").toBe(true);
  expect(same("Bob", "bob-Stormrage"), "a bare name the other way, any case").toBe(true);
  expect(same("Bob-Area 52", "Bob-Area52"), "a typed space in the realm").toBe(true);
  say(addon, "loot add Bob-Stormrage TEST-ONLY Boots");
  say(addon, "loot add Bob-Silvermoon TEST-ONLY Boots");
  expect(addon.eval("return #VanguardCharDB.lootReserves"), "a second Bob from another realm is its own reserve").toBe(2);
});

it("a finished item is not the one rolls are flagged for, and a hidden item text is skipped", () => {
  const addon = loggedIn(ROLL_ENV + LOOT("true"), ON);
  say(addon, "loot add Thrall TEST-ONLY Boots");
  addon.fire("LOOT_HISTORY_UPDATE_DROP", 7, 1);
  roll(addon, "Thrall", 50);
  expect(lines(addon)[1][0], "no item rolling: no flag").toBe("Thrall");
  expect(addon.eval("return ns.GetModule('OfficerLoot').Item(__wfgWorld.secret('x')) == nil"), "secret").toBe(true);
});

it("the list goes in the chat box for the party or raid on a click, in parts, and is printed where the game has no chat box call", () => {
  const addon = loggedIn("ChatFrameUtil = { OpenChat = function(t) __box = t end }", ON);
  addon.chat();
  press(addon, "Put the list in the party chat box");
  expect(chatHas(addon, /No reserves to share/), "empty").toBe(true);
  say(addon, "loot add Thrall Boots");
  press(addon, "Put the list in the party chat box");
  expect(addon.eval("return __box"), "one part").toBe("/p Soft reserves: Boots: Thrall");
  for (let i = 0; i < 12; i++) say(addon, `loot add Player${i} TEST-ONLY-Long-Item-Name-Number-${i}-xxxxxxxxxxxxx`);
  press(addon, "Put the list in the raid chat box");
  const first = addon.eval("return __box");
  expect(first.startsWith("/raid Soft reserves: "), "starts with the label").toBe(true);
  expect(first.length, "fits a chat line").toBeLessThan(255);
  expect(chatHas(addon, /Part 1 of \d/)).toBe(true);
  press(addon, "Put the list in the raid chat box");
  expect(addon.eval("return __box").startsWith("/raid Soft reserves"), "the next part has no label").toBe(false);
  const bare = loggedIn("", ON);
  say(bare, "loot add Thrall Boots");
  bare.chat();
  press(bare, "Put the list in the party chat box");
  expect(chatHas(bare, /Soft reserves: Boots: Thrall/), "printed instead").toBe(true);
  press(bare, "Print the reserve list to my chat");
  press(bare, "Clear every reserve");
  expect([question(bare)[0], chatHas(bare, /Forgot 1/)], "the button asks first").toEqual([true, false]);
  bare.click("Vanguard_Question.confirm");
  expect(chatHas(bare, /Forgot 1/)).toBe(true);
});

it("many reserves on one item are cut between names, so every shared part fits the chat box with /raid in front", () => {
  const addon = loggedIn("", ON);
  for (let i = 0; i < 24; i++) say(addon, `loot add Raider${String(i).padStart(2, "0")}abcd Ashkandi`);
  const parts = addon.eval("local out = {} for i, p in ipairs(ns.GetModule('OfficerLoot').Chunks()) do out[i] = '/raid ' .. p end return out");
  expect(Math.max(...parts.map((p) => p.length)), "the chat box holds 255 bytes").toBeLessThanOrEqual(255);
  expect(parts[0].startsWith("/raid Soft reserves: Ashkandi: Raider00abcd, "), "the first part names the item").toBe(true);
  expect(parts[1].startsWith("/raid Ashkandi (cont.): "), "the next carries the item on").toBe(true);
  expect(parts.join(" ").match(/Raider\d\dabcd/g).length, "every name once").toBe(24);
});

it("H29-19-1 every shared part fits 255 bytes with /raid in front in French and Russian, whose Soft reserves head is longer", () => {
  for (const locale of ["enUS", "frFR", "ruRU"]) {
    const addon = createAddon({ client: `__wfgWorld.locale = "${locale}"`, savedVariables: ON.savedVariables });
    addon.login();
    // 16 reserves on items of 8 to 21 letters, so the first line meets every width.
    for (let n = 8; n <= 21; n++) {
      for (let i = 0; i < 16; i++) say(addon, `loot add Raider${String(i).padStart(2, "0")}abcd ${"I".repeat(n)}`);
      const longest = addon.eval("local m = 0 for _, p in ipairs(ns.GetModule('OfficerLoot').Chunks()) do m = math.max(m, #('/raid ' .. p)) end return m");
      expect(longest, `${locale}: item name of ${n} letters`).toBeLessThanOrEqual(255);
      addon.eval("ns.GetModule('OfficerLoot').Clear()");
    }
  }
});

it("the options card has the switch, and Add a reserve asks for player and item", () => {
  const addon = loggedIn("", ON);
  expect(rows(addon).map((r) => r[1])).toContain("Soft-reserve list");
  addon.eval("ns.AskText = function(title, fn) __ask = fn end");
  press(addon, "Add a reserve");
  addon.eval('__ask("Thrall Boots")');
  expect(addon.eval("return #VanguardCharDB.lootReserves")).toBe(1);
  addon.eval('local r = ns.GetModule("OfficerLoot").Rows()[3] r[4](false) __g = r[3]()');
  expect(addon.eval("return __g"), "the switch turned the tools off").toBe(false);
});

it("reserves compare Russian names and item names without regard to case, and the ones saved before still match", () => {
  const addon = loggedIn(ROLL_ENV, ON);
  const norms = addon.eval('local OL = ns.GetModule("OfficerLoot") return { OL.Norm("Игрок-Realm"), OL.Same("Игрок", "игрок"), OL.Item("Железная руда").lname }');
  expect(norms, "names and the saved item name are in small letters, the realm cut").toEqual(["игрок", true, "железная руда"]);
  const old = addon.eval('local OL = ns.GetModule("OfficerLoot") return OL.Match({ lname = "Железная руда" }, OL.Item("железная РУДА"))');
  expect(old, "a reserve saved with a Cyrillic capital still matches").toBe(true);
});
