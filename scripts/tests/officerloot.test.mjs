// officerloot: the officer loot tools (Modules/OfficerLoot.lua, OfficerRoster.lua), a soft-reserve list and a roster, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

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
  expect(say(addon, "loot clear")).toMatch(/Forgot 2/);
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
  press(addon, "Put the list in the chat box for the party");
  expect(chatHas(addon, /No reserves to share/), "empty").toBe(true);
  say(addon, "loot add Thrall Boots");
  press(addon, "Put the list in the chat box for the party");
  expect(addon.eval("return __box"), "one part").toBe("/p Soft reserves: Boots: Thrall");
  for (let i = 0; i < 12; i++) say(addon, `loot add Player${i} TEST-ONLY-Long-Item-Name-Number-${i}-xxxxxxxxxxxxx`);
  press(addon, "Put the list in the chat box for the raid");
  const first = addon.eval("return __box");
  expect(first.startsWith("/raid Soft reserves: "), "starts with the label").toBe(true);
  expect(first.length, "fits a chat line").toBeLessThan(255);
  expect(chatHas(addon, /Part 1 of \d/)).toBe(true);
  press(addon, "Put the list in the chat box for the raid");
  expect(addon.eval("return __box").startsWith("/raid Soft reserves"), "the next part has no label").toBe(false);
  const bare = loggedIn("", ON);
  say(bare, "loot add Thrall Boots");
  bare.chat();
  press(bare, "Put the list in the chat box for the party");
  expect(chatHas(bare, /Soft reserves: Boots: Thrall/), "printed instead").toBe(true);
  press(bare, "Print the reserve list to my chat");
  press(bare, "Clear every reserve");
  expect(chatHas(bare, /Forgot 1/)).toBe(true);
});

it("the options card has the switch, and Add a reserve asks for player and item", () => {
  const addon = loggedIn("", ON);
  expect(rows(addon).map((r) => r[1])).toContain("Turn on the soft-reserve list and the roster");
  addon.eval("ns.AskText = function(title, fn) __ask = fn end");
  press(addon, "Add a reserve");
  addon.eval('__ask("Thrall Boots")');
  expect(addon.eval("return #VanguardCharDB.lootReserves")).toBe(1);
  addon.eval('local r = ns.GetModule("OfficerLoot").Rows()[3] r[4](false) __g = r[3]()');
  expect(addon.eval("return __g"), "the switch turned the tools off").toBe(false);
});

// The roster panel: whether it is shown, and each line as [left, right].
const roster = (addon) => addon.eval(`local f, out = Vanguard_OfficerRoster, {}
  for i, row in ipairs(f.rows) do if row.left:IsShown() then out[#out + 1] = { row.left:GetText(), row.right:GetText() } end end
  return { f:IsShown(), out }`);

it("the roster lists the raid by role then name, with leader marks, offline and dead, and follows changes", () => {
  const addon = loggedIn("RAID_CLASS_COLORS.WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }", ON);
  // Makes or changes a raid member.
  const set = (t, f) => addon.world.setUnit(t, { isPlayer: true, ...f });
  set("raid1", { name: "Zed", class: "WARRIOR", className: "Warrior", role: "TANK", leader: true });
  set("raid2", { name: "Amy", class: "PRIEST", className: "Priest", role: "HEALER", assistant: true });
  set("raid3", { name: "Bob", class: "MAGE", className: "Mage", role: "DAMAGER", connected: false });
  set("raid4", { name: "Cat", class: "MAGE", className: "Mage", role: "DAMAGER", dead: true });
  set("raid5", { name: "Dan", class: "MAGE", className: "Mage" });
  say(addon, "loot roster");
  expect(roster(addon)).toEqual([true, [
    ["Roster 5", "1 offline"], ["Zed", "Tank Lead"], ["Amy", "Healer Asst"], ["Bob", "DPS Offline"], ["Cat", "DPS Dead"], ["Dan", ""],
  ]]);
  expect(addon.eval("return Vanguard_OfficerRoster.rows[2].left.__textColor[1]"), "class color").toBeCloseTo(0.78);
  addon.world.setUnit("raid3", { connected: true });
  expect(roster(addon)[1][3], "an event repaints it").toEqual(["Bob", "DPS"]);
  say(addon, "loot roster");
  expect(roster(addon)[0], "toggles off").toBe(false);
  press(addon, "Show or hide the roster");
  expect(roster(addon)[0]).toBe(true);
  addon.eval('ns.Settings("OfficerLoot").on = false ns.GetModule("OfficerLoot").Apply()');
  expect(roster(addon)[0], "off hides it").toBe(false);
  expect(say(addon, "loot roster")).toMatch(/off/);
});

it("the roster handles a solo player, a party and a hidden name", () => {
  const addon = loggedIn("", ON);
  say(addon, "loot roster");
  expect(roster(addon)[1].map((x) => x[0]), "alone: just you").toEqual(["Roster 1", "Tester"]);
  addon.world.setUnit("party1", { name: "Pal", class: "MAGE", className: "Mage", isPlayer: true });
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(roster(addon)[1].map((x) => x[0]), "party").toEqual(["Roster 2", "Tester", "Pal"]);
  addon.eval('__wfgWorld.units.party1.name = __wfgWorld.secret("Pal")');
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(roster(addon)[1].map((x) => x[0]), "a hidden name is left out").toEqual(["Roster 1", "Tester"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("the roster: T.SPACE.gap in from the panel's edge on every side (a HUD card's padding), and as tall as its padding and lines", () => {
  const addon = loggedIn("", ON);
  addon.world.setUnit("party1", { name: "Pal", class: "MAGE", className: "Mage", isPlayer: true });
  say(addon, "loot roster");
  const gap = addon.eval("return ns.Theme.SPACE.gap");
  const [panel, name] = ["", ".rows[1].left"].map((part) => addon.frame(`Vanguard_OfficerRoster${part}`).rect);
  const note = addon.eval("local p = Vanguard_OfficerRoster.rows[1].right.__points.TOPRIGHT return { p.x, p.rel == Vanguard_OfficerRoster }");
  expect([name.left - panel.left, panel.top - name.top, note[0], note[1]], "the heading a gap in from the left and top, its note a gap in from the right").toEqual([gap, gap, -gap, true]);
  expect(addon.eval("return Vanguard_OfficerRoster:GetHeight() - 3 * ns.GetModule('OfficerLoot').RLINE"), "three lines (the heading, you and Pal) and two gaps").toBe(2 * gap);
});
