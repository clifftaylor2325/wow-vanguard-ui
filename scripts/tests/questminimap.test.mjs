// questminimap: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/QuestMinimap.lua: a mark on the minimap for each quest in your log with a spot on the map
// you're on, from the client's quest spots; on the edge, faint, when it's farther than the minimap shows.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

// TEST-ONLY world: the player at (0.5, 0.5) on map 10 (1000 x 1000 yards) facing north, the minimap
// showing 200 yards from its centre to its edge. Three quests in the log: 90061 100 yards east, 90062
// (ready) 200 yards north, 90063 400 yards west; the client's spots also hold a quest start, a quest
// not in the log and a hidden spot, none of which get a mark.
const MINIMAP_ENV = `
  C_Map.GetBestMapForUnit = function() return 10 end
  C_Map.GetMapWorldSize = function() return 1000, 1000 end
  C_Map.GetPlayerMapPosition = function() return { GetXY = function() return 0.5, 0.5 end } end
  C_Minimap = { GetViewRadius = function() return 200 end }
  __facing = 0
  GetPlayerFacing = function() return __facing end
  C_QuestLog.GetQuestsOnMap = function(id) return id == 10 and {
    { questID = 90061, x = 0.6, y = 0.5 },
    { questID = 90062, x = 0.5, y = 0.3 },
    { questID = 90063, x = 0.1, y = 0.5 },
    { questID = 90064, x = 0.5, y = 0.5, isQuestStart = true },
    { questID = 90065, x = 0.5, y = 0.5 },
    { questID = 90061, x = __wfgWorld.secret(), y = 0.5 },
    "TEST-ONLY not a table" } or {} end
  __wfgWorld.addQuest({ questID = 90061, title = "TEST-ONLY East", level = 8, objectives = {} })
  __wfgWorld.addQuest({ questID = 90062, title = "TEST-ONLY North", level = 8, isComplete = true, objectives = {} })
  __wfgWorld.addQuest({ questID = 90063, title = "TEST-ONLY West", level = 8, objectives = {} })
`;

// The shown marks: [icon name, x offset, y offset, alpha] each.
const marks = (addon) => Object.values(addon.eval(`local out, QM = {}, ns.QuestMinimap
  for i, m in ipairs(QM.marks) do if m:IsShown() then
    local _, _, _, x, y = m:GetPoint(1) local _, _, _, a = m:GetVertexColor()
    out[#out + 1] = { (m:GetTexture() or ""):match("(%a+)$"), math.floor(x + 0.5), math.floor(y + 0.5), a } end end
  return out`));

it("quest minimap: a dot for each quest in the log with objectives left, a ? once ready, faint on the edge past the minimap", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.advance(0.5);
  const half = addon.eval("return Minimap:GetWidth() / 2");
  const room = half - addon.eval("return ns.QuestMinimap.SIZE") / 2;
  expect(marks(addon), "east, north on the edge (drawn just inside it), and west past it").toEqual([
    ["Knob", Math.round(half / 2), 0, 1], ["QuestQuery", 0, Math.round(room), 1], ["Knob", -Math.round(room), 0, 0.5]]);
});

// TEST-ONLY: one quest 400 yards north-east, past the minimap's corner.
const NORTH_EAST = `C_QuestLog.GetQuestsOnMap = function() return { { questID = 90061, x = 0.5 + 0.4 / math.sqrt(2), y = 0.5 - 0.4 / math.sqrt(2) } } end`;

it("quest minimap: on a round minimap a far mark sits on the rim, inside the disc, not in the square's corner", () => {
  const addon = loggedIn(MINIMAP_ENV + NORTH_EAST, { savedVariables: 'VanguardDB.profiles = { Default = { Minimap = { shape = "round" } } }' });
  addon.advance(0.5);
  const half = addon.eval("return Minimap:GetWidth() / 2");
  const along = Math.round((half - addon.eval("return ns.QuestMinimap.SIZE") / 2) / Math.sqrt(2));
  expect(marks(addon), "on the rim at 45 degrees, faint").toEqual([["Knob", along, along, 0.5]]);
});

it("quest minimap: with Vanguard's minimap off the game's round one gets rim marks; a square one gets its corner", () => {
  const off = loggedIn(MINIMAP_ENV + NORTH_EAST, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Minimap = false } } }" });
  expect(off.eval("return ns.QuestMinimap.Round()"), "the game's own minimap is round").toBe(true);
  const square = loggedIn(MINIMAP_ENV + NORTH_EAST);
  square.advance(0.5);
  const room = Math.round(square.eval("return Minimap:GetWidth() / 2 - ns.QuestMinimap.SIZE / 2"));
  expect(marks(square)[0].slice(1, 3), "the square map's corner, inside it").toEqual([room, room]);
});

it("quest minimap: the marks turn with a rotating minimap", () => {
  const addon = loggedIn(MINIMAP_ENV + "SetCVar('rotateMinimap', '1') __facing = math.pi / 2");
  addon.advance(0.5);
  const half = addon.eval("return Minimap:GetWidth() / 2");
  expect(marks(addon)[0].slice(1, 3), "facing west, the east quest is behind you").toEqual([0, -Math.round(half / 2)]);
  addon.eval("GetPlayerFacing = function() return __wfgWorld.secret() end");
  addon.advance(0.3);
  expect(marks(addon)[0].slice(1, 3), "a hidden facing: drawn north-up").toEqual([Math.round(half / 2), 0]);
});

it("quest minimap: no marks while the map is restricted", () => {
  const addon = loggedIn(MINIMAP_ENV + `Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1, ChallengeMode = 2, PvPMatch = 3, Map = 4, Chat = 5 }
  Enum.AddOnRestrictionState = { Inactive = 0, Activating = 1, Active = 2 }
  __restricted = {}
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return __restricted[t] or 0 end }
`);
  addon.advance(0.5);
  expect(marks(addon).length, "unrestricted: marks").toBeGreaterThan(0);
  addon.eval("__restricted[4] = 2");
  addon.fire("QUEST_LOG_UPDATE");
  addon.advance(1.5);
  expect(marks(addon).length, "restricted: none").toBe(0);
});

it("quest minimap: no marks without the client's scale, a map, or with the switch off; the option row", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.eval("C_Minimap = nil");
  addon.advance(0.5);
  expect(marks(addon).length, "no view radius").toBe(0);
  addon.eval("C_Minimap = { GetViewRadius = function() return 200 end } C_Map.GetMapWorldSize = nil");
  addon.advance(0.5);
  expect(marks(addon).length, "no map size").toBe(0);
  addon.eval("C_Map.GetMapWorldSize = function() return 1000, 1000 end C_Map.GetBestMapForUnit = function() return nil end");
  addon.advance(1.5);
  expect(marks(addon).length, "no map").toBe(0);
  addon.eval("C_Map.GetBestMapForUnit = function() return 10 end");
  addon.fire("QUEST_LOG_UPDATE");
  addon.advance(0.5);
  expect(marks(addon).length, "back, after the log changes").toBe(3);
  const row = addon.eval("local r = ns.QuestMinimap.Rows()[1] return { r[2], r[3]() }");
  expect(row, "the switch, on").toEqual(["Quest spots on the minimap", true]);
  addon.eval("ns.QuestMinimap.Rows()[1][4](false)");
  expect(marks(addon).length, "switched off").toBe(0);
});

it("quest minimap: marks show with Vanguard's quest tracker module off", () => {
  const addon = loggedIn(MINIMAP_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { QuestTracker = false } } }" });
  addon.advance(2.5);
  expect(marks(addon).length, "east, north and west, as with the tracker on").toBe(3);
});

it("quest minimap: an objective's dot is small and in the accent, a ? gold and drawn over the dots, and the quest the arrow follows a size larger", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.advance(0.5);
  // Each shown mark's texture name, size, draw sublevel and whether its colour is the token given.
  const looks = () => addon.eval(`local out, T = {}, ns.Theme for _, m in ipairs(ns.QuestMinimap.marks) do if m:IsShown() then
    local _, sub = m:GetDrawLayer() local r, g, b = m:GetVertexColor() local tr, tg, tb = T.RGB(m:GetTexture():find("Knob") and "accent" or "gold")
    out[#out + 1] = { m:GetTexture():match("(%a+)$"), m:GetWidth(), sub, r == tr and g == tg and b == tb } end end return out`);
  expect(looks().slice(0, 2), "the east dot: 8, under; the north ?: 12, over").toEqual([["Knob", 8, 1, true], ["QuestQuery", 12, 2, true]]);
  // TEST-ONLY: the arrow picks the quest given.
  const follow = (id) => { addon.eval(`ns.QuestArrow.Choose = function() return ${id} end`); addon.advance(1.5); };
  follow(90061);
  expect([addon.eval("return ns.QuestArrow.current"), looks()[0]], "followed: the dot a size larger").toEqual([90061, ["Knob", 12, 1, true]]);
  follow(90062);
  expect(looks().map((l) => l[1]), "a followed ? is the largest mark (QM.SIZE), the dot back to 8").toEqual([8, addon.eval("return ns.QuestMinimap.SIZE"), 8]);
});

it("quest minimap: with the switch off the client's spots aren't read, and ticking it shows the marks at once", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.eval("ns.QuestMinimap.Rows()[1][4](false) __reads = 0 local get = C_QuestLog.GetQuestsOnMap C_QuestLog.GetQuestsOnMap = function(id) __reads = __reads + 1 return get(id) end");
  addon.advance(5);
  expect(addon.eval("return __reads"), "no reads in 5 seconds").toBe(0);
  addon.eval("ns.QuestMinimap.Rows()[1][4](true)");
  expect([addon.eval("return __reads"), marks(addon).length], "read and drawn without waiting for a tick").toEqual([1, 3]);
});

it("quest minimap: reading the spots builds no quest record, only whether each quest is in the log and ready", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.eval("local QT = ns.GetModule('QuestTracker') __records = 0 local quest = QT.Quest QT.Quest = function(id) __records = __records + 1 return quest(id) end");
  addon.advance(3);
  expect([addon.eval("return __records"), marks(addon).length]).toEqual([0, 3]);
});

// A1-3 (M13): the marks' two repeating jobs are tied to the marks' layer and rest in a fight.
it("A1-3 quest minimap: its tickers are the layer's; in a fight the marks hold as you move and catch up when it ends", () => {
  const addon = loggedIn(MINIMAP_ENV + "__px = 0.5 C_Map.GetPlayerMapPosition = function() return { GetXY = function() return __px, 0.5 end } end");
  addon.advance(0.5);
  expect(addon.eval('local j = ns.ticker.vgJobs return { j["quest minimap"].frame == Vanguard_QuestMinimap, j["quest minimap read"].frame == Vanguard_QuestMinimap }'), "both jobs count time only while the layer over the minimap shows").toEqual([true, true]);
  // How far east of the minimap's centre the first mark sits.
  const east = () => marks(addon)[0][1];
  const before = east();
  addon.world.combat(true);
  addon.eval("__px = 0.55");
  addon.advance(2);
  expect(east(), "you moved 50 yards east in a fight: the mark is where it was").toBe(before);
  addon.world.combat(false);
  addon.advance(0.25);
  expect([Math.abs(east() - before / 2) <= 1, addon.eval("return ns.QuestMinimap.scale.px")], "after the fight: half as far east, from the one scale table").toEqual([true, 0.55]);
});

it("A1-3 quest minimap: with the minimap hidden the quest spots aren't read", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.eval("__asked = 0 local on = C_QuestLog.GetQuestsOnMap C_QuestLog.GetQuestsOnMap = function(id) __asked = __asked + 1 return on(id) end");
  // How often the client was asked for the map's quests over the next three seconds.
  const asked = () => { addon.eval("__asked = 0"); addon.advance(3.05); return addon.eval("return __asked"); };
  expect(asked(), "shown: once a second").toBe(3);
  addon.eval("Minimap:Hide()");
  expect(asked(), "hidden: not at all").toBe(0);
  addon.eval("Minimap:Show()");
  addon.world.combat(true);
  expect(asked(), "in a fight: not at all").toBe(0);
  addon.fire("QUEST_LOG_UPDATE");
  addon.advance(0.05);
  expect(addon.eval("return __asked"), "a quest log change in a fight still reads them").toBe(1);
});

it("quest minimap: a minimap the client has not sized (no room for a mark) draws none, never a point of NaN", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.advance(0.5);
  expect(marks(addon).length, "sized: marks").toBe(3);
  addon.eval("ns.QuestMinimap.layer.GetWidth = function() return 0 end");
  addon.advance(0.5);
  const nan = addon.eval(`local bad = 0 for _, m in ipairs(ns.QuestMinimap.marks) do if m:IsShown() then
    local _, _, _, x, y = m:GetPoint(1) if x ~= x or y ~= y then bad = bad + 1 end end end return bad`);
  expect(nan, "no mark sits at a NaN offset").toBe(0);
  expect(marks(addon).length, "no marks while the minimap has no room").toBe(0);
});
