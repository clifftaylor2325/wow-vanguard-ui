// dungeoncard: the dungeon card on the Instance prep checklist (Modules/DungeonCard.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { loggedIn, setCombat } from "./helpers.mjs";

// The switch on (it starts off).
const ON = "VanguardDB.profiles = { Default = { InstancePrep = { dungeonCard = true } } }";

// TEST-ONLY dungeon: the instance calls, the map's levels and quests, quest tags, and a bag with two keys and an apple.
const ENV = `
  __inside, __kind = true, "party"
  IsInInstance = function() return __inside, __kind end
  GetInstanceInfo = function() if not __inside then return "Elwynn Forest", "none", 0, "", 0 end return "TEST-ONLY Ragefire Chasm", "party", 1, "Normal", 5, 0, false, 389 end
  __levels, __onMap = { 13, 18 }, nil
  C_Map.GetMapLevels = function() if __levels then return __levels[1], __levels[2] end end
  C_QuestLog.GetQuestsOnMap = function() return __onMap end
  Enum.QuestTag = { Dungeon = 81, Raid = 62, Group = 1 }
  __tags = { [1] = 81, [2] = 62, [3] = 1 }
  C_QuestLog.GetQuestTagInfo = function(id) return __tags[id] and { tagID = __tags[id] } or nil end
  __wfgWorld.items[4536] = { name = "TEST-ONLY Apple", classID = 0, subClassID = 5 }
  __wfgWorld.items[7146] = { name = "TEST-ONLY Skeleton Key", classID = 13, subClassID = 0 }
  __wfgWorld.items[7147] = { name = "TEST-ONLY Gate Key", classID = 13, subClassID = 0 }
  local bag = __wfgWorld.bags[0]
  bag[#bag + 1] = { itemID = 4536, count = 20 } bag[#bag + 1] = { itemID = 7146, count = 1 } bag[#bag + 1] = { itemID = 7147, count = 1 } bag[#bag + 1] = { itemID = 7146, count = 1 }
  __wfgWorld.quests = {
    { questID = 1, title = "TEST-ONLY Fire Brand", level = 15, isComplete = true }, { questID = 2, title = "TEST-ONLY Taragaman", level = 13 },
    { questID = 3, title = "TEST-ONLY Forest Wolves", level = 9 }, { questID = 9, title = "Header", isHeader = true, level = 1 },
    { questID = 4, title = "TEST-ONLY Hidden", level = __wfgWorld.secret(5) },
  }
`;

// A logged-in character with food to spare, so nothing is short unless a test says.
function character(savedVariables = ON, extra = "") {
  const addon = loggedIn(ENV + extra, { savedVariables });
  addon.eval("__wfgWorld.bags[0][5] = nil");
  return addon;
}

// The card's text lines, as shown.
const lines = (addon) => addon.eval(`local out = {}
  for _, fs in ipairs(ns.GetModule("InstancePrep").card.info) do if fs:IsShown() then out[#out + 1] = fs:GetText() end end
  return out`);
// The shown lines as a list (an empty Lua table comes back as an object).
const text = (addon) => { const out = lines(addon); return Array.isArray(out) ? out : []; };

// Whether the card is on screen.
const shown = (addon) => addon.frame("Vanguard_PrepCard").visible;

it("at the door the card shows the dungeon, your quests on its map and your keys, even with nothing short", () => {
  const addon = character(ON, "__onMap = { { questID = 1 }, { questID = 2 } }");
  expect(shown(addon), "nothing short, but the card has things to say").toBe(true);
  expect(text(addon), "heading, quests by level, keys once each").toEqual([
    "TEST-ONLY Ragefire Chasm · levels 13-18 · 5-player Normal", "Your quests here", "[13] TEST-ONLY Taragaman", "[15] TEST-ONLY Fire Brand · done", "Keys: TEST-ONLY Skeleton Key, TEST-ONLY Gate Key",
  ]);
});

it("elsewhere /vg prep lists the dungeon and raid quests in your log, with a more line past six", () => {
  const addon = character(ON, "__inside = false __kind = 'none'");
  addon.slash("prep");
  expect(text(addon).slice(0, 4), "tagged quests only, lowest level first, hidden ones skipped").toEqual(["Dungeon quests in your log", "[9] TEST-ONLY Forest Wolves", "[13] TEST-ONLY Taragaman", "[15] TEST-ONLY Fire Brand · done"]);
  const many = character(ON, `__inside = false __kind = 'none' for i = 20, 29 do __wfgWorld.quests[#__wfgWorld.quests + 1] = { questID = 100 + i, title = "TEST-ONLY Q" .. i, level = i } __tags[100 + i] = 81 end`);
  many.slash("prep");
  const out = text(many);
  expect([out.length, out[out.length - 2]], "six quests and the rest counted").toEqual([9, "and 7 more"]);
});

it("the level range, size and difficulty drop what the client does not give", () => {
  const addon = character(ON, "__levels = nil");
  addon.eval("GetInstanceInfo = function() return 'TEST-ONLY Cave', 'party', 1, __wfgWorld.secret('Normal'), 5 end");
  addon.slash("prep");
  expect(text(addon)[0], "no levels; a hidden difficulty left out").toBe("TEST-ONLY Cave · 5-player");
  addon.eval("__levels = { 20, 20 } GetInstanceInfo = function() return 'TEST-ONLY Cave', 'raid', 1, '', 0 end");
  addon.slash("prep");
  expect(text(addon)[0], "one level; no size").toBe("TEST-ONLY Cave · level 20");
  addon.eval("__levels = { 0, 0 } GetInstanceInfo = function() return __wfgWorld.secret('x') end");
  addon.slash("prep");
  expect(text(addon)[0], "no name: no heading, quests are the log's tagged ones").toBe("Dungeon quests in your log");
});

it("the card is off until switched on, and says nothing in combat or on a client without the calls", () => {
  const off = character("");
  off.slash("prep");
  expect([text(off).length, shown(off)], "off by default: just the checklist").toEqual([0, true]);
  const on = character();
  setCombat(on, true);
  expect(on.eval("return #ns.DungeonCard.Lines()"), "nothing in combat").toBe(0);
  const bare = character();
  bare.eval("C_Map = nil C_QuestLog = nil C_Container = nil C_Item = nil GetInstanceInfo = nil Enum.QuestTag = nil");
  expect([bare.eval("return #ns.DungeonCard.Lines()"), bare.eval("return #ns.errors")], "no calls: no lines, no error").toEqual([0, 0]);
});

it("an item the client has not cached shows by its number; without a map listing, a dungeon shows its tagged quests", () => {
  const addon = character();
  addon.eval("C_Item.GetItemInfo = function() end __onMap = nil");
  addon.slash("prep");
  expect(text(addon).slice(-1), "keys by number").toEqual(["Keys: item 7146, item 7147"]);
  expect(text(addon)[1], "the tagged quests stand in for the map's").toBe("Your quests here");
});
