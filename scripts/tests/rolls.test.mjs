// rolls: the roll tracker (Modules/Rolls.lua), the group's /roll results and loot rolls, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: the game's English roll format.
const ROLL_ENV = 'RANDOM_ROLL_RESULT = "%s rolls %d (%d-%d)"\n';

// A system message saying `name` rolled `roll` in low-high.
const roll = (addon, name, n, low = 1, high = 100) => addon.fire("CHAT_MSG_SYSTEM", `${name} rolls ${n} (${low}-${high})`);

// The panel: shown, its height and each drawn line as [left, right, accent?].
const panel = (addon) => addon.eval(`local f, lines = Vanguard_Rolls, {}
  for i, row in ipairs(f.rows) do
    if row.left:IsShown() then lines[#lines + 1] = { row.left:GetText(), row.right:GetText(), row.left.__textColor or false } end
  end
  return { f:IsShown(), f:GetHeight(), lines }`);

// TEST-ONLY loot history: one item (a link, done or not) with players as { name, rollType, roll, winner } Lua tables.
const lootEnv = (done, players) => `
  C_LootHistory = {
    GetNumItems = function() return 1 end,
    GetItem = function() return 1, "|cff0070dd[Boots]|r", ${players.length}, ${done}, 1 end,
    GetPlayerInfo = function(_, p) local x = ({ ${players.join(", ")} })[p] return x[1], "WARRIOR", x[2], x[3], x[4] end,
  }`;

it("a roll in chat shows the panel, highest first, with the top roll in the accent", () => {
  const addon = loggedIn(ROLL_ENV);
  expect(panel(addon)[0], "no panel before a roll").toBe(false);
  roll(addon, "Thrall", 42);
  roll(addon, "Jaina", 87);
  roll(addon, "Sylvanas", 5);
  const [shown, , lines] = panel(addon);
  expect([shown, lines.map((l) => l.slice(0, 2))], "heading, then highest first").toEqual([true, [["Rolls 1-100", ""], ["Jaina", "87"], ["Thrall", "42"], ["Sylvanas", "5"]]]);
  expect([isTok(addon, lines[1][2], "accent"), isTok(addon, lines[2][2], "text2"), isTok(addon, lines[0][2], "text")], "winner accent, rest gray, heading bright").toEqual([true, true, true]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("a tie marks both, a roll in another range starts a new round, and a different range shows its figures", () => {
  const addon = loggedIn(ROLL_ENV);
  roll(addon, "Thrall", 50);
  roll(addon, "Jaina", 50);
  const tie = panel(addon)[2];
  expect(tie.map((l) => [l[0], isTok(addon, l[2], "accent")]).slice(1), "earlier roll first, both accent").toEqual([["Thrall", true], ["Jaina", true]]);
  roll(addon, "Thrall", 3, 1, 6);
  expect(panel(addon)[2].map((l) => l.slice(0, 2)), "only the new range").toEqual([["Rolls 1-6", ""], ["Thrall", "3 (1-6)"]]);
});

it("a round older than 30 seconds is not part of the next one, and the panel goes when it falls quiet", () => {
  const addon = loggedIn(ROLL_ENV);
  roll(addon, "Thrall", 90);
  addon.advance(20);
  roll(addon, "Jaina", 10);
  expect(panel(addon)[2].length, "within 30 s of each other: one round").toBe(3);
  addon.advance(29);
  expect(panel(addon)[0], "29 s after the last roll: still there").toBe(true);
  addon.advance(2);
  expect(panel(addon)[0], "30 s after the last roll: gone").toBe(false);
  roll(addon, "Thrall", 70);
  addon.advance(31);
  roll(addon, "Jaina", 99);
  expect(panel(addon)[2].map((l) => l[0]), "a roll 31 s after the last starts a fresh round").toEqual(["Rolls 1-100", "Jaina"]);
});

it("lines the game didn't write as a roll, hidden lines and a client without the format are skipped", () => {
  const addon = loggedIn(ROLL_ENV);
  addon.fire("CHAT_MSG_SYSTEM", "Thrall has joined the party.");
  addon.eval('ns.GetModule("Rolls").Parse(nil)');
  addon.eval('__wfgStub.fire("CHAT_MSG_SYSTEM", __wfgWorld.secret("Thrall rolls 4 (1-100)"))');
  expect(panel(addon)[0], "nothing recorded").toBe(false);
  const bare = loggedIn("");
  roll(bare, "Thrall", 4);
  expect([panel(bare)[0], bare.eval("return #ns.errors")], "no RANDOM_ROLL_RESULT: the tracker stays quiet").toEqual([false, 0]);
});

it("the format works where a language reorders its placeholders", () => {
  const addon = loggedIn('RANDOM_ROLL_RESULT = "%2$d (%3$d-%4$d): %1$s wuerfelt"\n');
  addon.fire("CHAT_MSG_SYSTEM", "55 (1-100): Thrall wuerfelt");
  expect(panel(addon)[2].map((l) => l.slice(0, 2)), "name and figures found by position").toEqual([["Rolls 1-100", ""], ["Thrall", "55"]]);
});

it("40 rolls are kept at most; /vg rolls lists them newest first and clear forgets them", () => {
  const addon = loggedIn(ROLL_ENV);
  expect(chatHas((addon.slash("rolls"), addon), /No rolls seen this session yet/), "nothing yet").toBe(true);
  for (let i = 1; i <= 41; i++) roll(addon, `P${i}`, i);
  expect(addon.eval("local R = ns.GetModule('Rolls') return { #R.rolls, R.rolls[1].name }"), "the oldest went").toEqual([40, "P2"]);
  expect(addon.eval("return #ns.GetModule('Rolls').Lines()"), "the panel stops at 14 lines").toBe(14);
  addon.slash("rolls");
  expect([chatHas(addon, /Rolls this session, newest first/), chatHas(addon, /P41 {2}41 {2}\(1-100\)/)], "listed").toEqual([true, true]);
  addon.slash("rolls clear");
  expect([chatHas(addon, /Rolls forgotten/), panel(addon)[0]], "forgotten and hidden").toEqual([true, false]);
});

it("the panel is off with its switch, and shows again when it is turned back on", () => {
  const addon = loggedIn(ROLL_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Rolls = { show = false } } }" });
  roll(addon, "Thrall", 9);
  expect(panel(addon)[0], "recorded but hidden").toBe(false);
  addon.eval("local R = ns.GetModule('Rolls') R.settings.show = true R.Paint()");
  expect(panel(addon)[0], "on").toBe(true);
  addon.eval("ns.GetModule('Rolls').Paint()");
});

it("loot rolls: each member's choice and roll, the winner in the accent, 'rolling' until it is done", () => {
  const players = ['{ "Thrall", 1, 88, true }', '{ "Jaina", 2, 40, false }', '{ "Sylvanas", 0, nil, false }'];
  const addon = loggedIn(ROLL_ENV + lootEnv(false, players));
  addon.fire("LOOT_HISTORY_FULL_UPDATE");
  const [shown, , lines] = panel(addon);
  expect([shown, lines.map((l) => l.slice(0, 2))], "the item, then each player").toEqual([true, [["|cff0070dd[Boots]|r", "rolling"], ["Thrall", "Need 88"], ["Jaina", "Greed 40"], ["Sylvanas", "Pass"]]]);
  expect([isTok(addon, lines[1][2], "accent"), isTok(addon, lines[2][2], "text2")], "the winner in the accent").toEqual([true, true]);
  addon.eval("C_LootHistory.GetItem = function() return 1, '|cff0070dd[Boots]|r', 1, true, 1 end");
  addon.fire("LOOT_HISTORY_ROLL_COMPLETE");
  expect(panel(addon)[2][0].slice(0, 2), "done: no 'rolling'").toEqual(["|cff0070dd[Boots]|r", ""]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("loot rolls keep the newest 4 items, skip hidden names and links, and sit under the /roll round", () => {
  const addon = loggedIn(ROLL_ENV + lootEnv(true, ['{ __wfgWorld.secret("Hidden"), 1, 5, false }', '{ "Thrall", 3, 9, true }']));
  addon.eval(`C_LootHistory.GetNumItems = function() return 6 end
    local item = C_LootHistory.GetItem
    C_LootHistory.GetItem = function(i) if i == 6 then return 1, __wfgWorld.secret("link"), 2, true, 1 end return item() end`);
  roll(addon, "Jaina", 20);
  addon.fire("LOOT_HISTORY_ROLL_CHANGED", 6, 1);
  expect(addon.eval("return #ns.GetModule('Rolls').items"), "4 of the 6").toBe(4);
  const lines = panel(addon)[2];
  expect([lines[0][0], lines[1][0], lines[4][0], lines[4][1], lines[5][0]], "the round first, then the items; the hidden link is '?'").toEqual(["Rolls 1-100", "Jaina", "|cff0070dd[Boots]|r", "", "Thrall"]);
  expect(lines.some((l) => l[0] === "Hidden"), "a hidden name is skipped").toBe(false);
  expect(lines.some((l) => l[0] === "?"), "the newest item's hidden link reads '?'").toBe(true);
});

it("a client without the loot history, or with the switch off, leaves loot rolls off with no error", () => {
  const without = loggedIn(ROLL_ENV);
  without.fire("LOOT_HISTORY_FULL_UPDATE");
  expect([without.eval("local R = ns.GetModule('Rolls') return { R.HasLoot(), #R.items, #ns.errors }")], "no calls, nothing read").toEqual([[false, 0, 0]]);
  expect(without.eval("C_LootHistory = { GetNumItems = function() end } return ns.GetModule('Rolls').HasLoot()"), "half an API is none").toBe(false);
  const off = loggedIn(ROLL_ENV + lootEnv(true, ['{ "Thrall", 1, 9, true }']), { savedVariables: "VanguardDB.profiles = { Default = { Rolls = { loot = false } } }" });
  off.fire("LOOT_HISTORY_FULL_UPDATE");
  expect(off.eval("return #ns.GetModule('Rolls').items"), "loot switched off: not read").toBe(0);
});

it("the panel follows its visibility setting", () => {
  const addon = loggedIn(ROLL_ENV, { savedVariables: 'VanguardDB.profiles = { Default = { Rolls = { visibility = "hidden" } } }' });
  roll(addon, "Thrall", 9);
  expect(panel(addon)[0], "a 'hidden' panel stays hidden").toBe(false);
});

it("the roll tracker: T.SPACE.gap in from the panel's edge on every side (a HUD card's padding), and as tall as its padding and lines", () => {
  const addon = loggedIn(ROLL_ENV);
  roll(addon, "Thrall", 42);
  roll(addon, "Jaina", 87);
  const gap = addon.eval("return ns.Theme.SPACE.gap");
  const [panelRect, name] = ["", ".rows[1].left"].map((part) => addon.frame(`Vanguard_Rolls${part}`).rect);
  const figure = addon.eval("local p = Vanguard_Rolls.rows[1].right.__points.TOPRIGHT return { p.x, p.rel == Vanguard_Rolls }");
  expect([name.left - panelRect.left, panelRect.top - name.top, figure[0], figure[1]], "the first line a gap in from the left and top, its figure a gap in from the right").toEqual([gap, gap, -gap, true]);
  expect(panel(addon)[1] - 3 * addon.eval("return ns.GetModule('Rolls').LINE"), "three lines (the heading and two rolls) and two gaps").toBe(2 * gap);
});
