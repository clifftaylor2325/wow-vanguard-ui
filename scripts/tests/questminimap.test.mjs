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
  expect(marks(addon), "east, north on the edge, and west past it").toEqual([
    ["QuestBang", Math.round(half / 2), 0, 1], ["QuestQuery", 0, Math.round(half), 1], ["QuestBang", -Math.round(half), 0, 0.5]]);
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
