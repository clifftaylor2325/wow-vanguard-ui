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
    out[#out + 1] = { (m:GetTexture() or ""):match("Icons\\\\(%a+)"), math.floor(x + 0.5), math.floor(y + 0.5), a } end end
  return out`));

it("quest minimap: a ! for each quest in the log with objectives left, a ? once ready, faint on the edge past the minimap", () => {
  const addon = loggedIn(MINIMAP_ENV);
  addon.advance(0.5);
  const half = addon.eval("return Minimap:GetWidth() / 2");
  const room = half - addon.eval("return ns.QuestMinimap.SIZE") / 2;
  expect(marks(addon), "east, north on the edge (drawn just inside it), and west past it").toEqual([
    ["QuestBang", Math.round(half / 2), 0, 1], ["QuestQuery", 0, Math.round(room), 1], ["QuestBang", -Math.round(room), 0, 0.5]]);
});

// TEST-ONLY: one quest 400 yards north-east, past the minimap's corner.
const NORTH_EAST = `C_QuestLog.GetQuestsOnMap = function() return { { questID = 90061, x = 0.5 + 0.4 / math.sqrt(2), y = 0.5 - 0.4 / math.sqrt(2) } } end`;

it("quest minimap: on a round minimap a far mark sits on the rim, inside the disc, not in the square's corner", () => {
  const addon = loggedIn(MINIMAP_ENV + NORTH_EAST, { savedVariables: 'VanguardDB.profiles = { Default = { Minimap = { shape = "round" } } }' });
  addon.advance(0.5);
  const half = addon.eval("return Minimap:GetWidth() / 2");
  const along = Math.round((half - addon.eval("return ns.QuestMinimap.SIZE") / 2) / Math.sqrt(2));
  expect(marks(addon), "on the rim at 45 degrees, faint").toEqual([["QuestBang", along, along, 0.5]]);
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
