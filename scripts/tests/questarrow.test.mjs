// questarrow: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/QuestArrow.lua: the on-screen arrow that turns toward the nearest unfinished objective
// of the watched quests, with the quest's title and distance.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY world: the player at (0.5, 0.5) on map 10 (1000 x 1000 yards) facing north. Quest 90061
// is 100 yards away with its spot due east, 90062 is 300 yards away with its spot to the north-west.
const ARROW_ENV = `
  __titles = { [90061] = "TEST-ONLY Near", [90062] = "TEST-ONLY Far", [90063] = "TEST-ONLY Done" }
  C_QuestLog.GetTitleForQuestID = function(id) return __titles[id] end
  __spots = { [90061] = { 10, 0.6, 0.5 }, [90062] = { 10, 0.3, 0.3 }, [90063] = { 10, 0.5, 0.9 } }
  C_QuestLog.GetNextWaypoint = function(id) if __spots[id] then return table.unpack(__spots[id]) end end
  C_QuestLog.GetQuestsOnMap = function() return {} end
  C_Map.GetBestMapForUnit = function() return 10 end
  C_Map.GetMapWorldSize = function() return 1000, 1000 end
  __facing = 0
  GetPlayerFacing = function() return __facing end
  C_Map.GetPlayerMapPosition = function() return { GetXY = function() return 0.5, 0.5 end } end
  __wfgWorld.addQuest({ questID = 90061, title = "TEST-ONLY Near", level = 8, watched = true, distanceSq = 10000, objectives = {} })
  __wfgWorld.addQuest({ questID = 90062, title = "TEST-ONLY Far", level = 8, watched = true, distanceSq = 90000, objectives = {} })
`;

// What the arrow shows: its turn, title, distance, alpha and whether it is shown.
const arrow = (addon) => addon.eval(`local f = Vanguard_QuestArrow
  return { f.arrow:GetRotation(), f.title:GetText(), f.dist:GetText(), f.arrow:GetAlpha(), f:IsShown() }`);

it("quest arrow: points at the nearest watched quest's spot, turning with your facing", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.update(0);
  const [turn, title, dist, alpha, shown] = arrow(addon);
  expect([title, dist, alpha, shown], "the nearer quest, its distance").toEqual(["TEST-ONLY Near", "100 yd", 1, true]);
  expect(turn, "its spot is due east: a quarter turn clockwise").toBeCloseTo(-Math.PI / 2, 5);
  addon.eval("__facing = math.pi / 2");
  addon.advance(0.5);
  expect(arrow(addon)[0], "facing west, the east spot is straight behind: half a turn").toBeCloseTo(-Math.PI, 5);
  addon.eval("__facing = 0 ns.QuestArrow.target = { 10, 0.5, 0.4 }");
  addon.advance(0.2);
  expect(arrow(addon)[0], "a spot due north is straight ahead").toBeCloseTo(0, 5);
});

it("quest arrow: a finished quest outranks a nearer objective; the pick holds unless a quest is clearly nearer; chat says when it moves on", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestArrow.Pick()");
  // The quest the arrow follows.
  const pick = () => addon.eval("return ns.QuestArrow.current");
  expect(pick(), "nearest first").toBe(90061);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function(id) return id == 90061 and 10000 or 8000 end");
  addon.eval("ns.QuestArrow.Pick()");
  expect(pick(), "a little nearer is not enough to switch").toBe(90061);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function(id) return id == 90061 and 10000 or 4000 end");
  addon.eval("ns.QuestArrow.Pick()");
  expect(pick(), "clearly nearer: switch").toBe(90062);
  expect(chatHas(addon, /Arrow:/), "an unfinished quest is not moved on from with a word").toBe(false);
  addon.eval(`__wfgWorld.addQuest({ questID = 90063, title = "TEST-ONLY Done", level = 8, watched = true, isComplete = true, objectives = {} })
    C_QuestLog.GetDistanceSqToQuest = function(id) return id == 90063 and 12000 or (id == 90061 and 10000 or 40000) end`);
  addon.eval("ns.QuestArrow.Pick()");
  expect(pick(), "12000 away but finished: it counts as 3000").toBe(90063);
  addon.eval("__wfgWorld.quests[3].watched = false __wfgWorld.quests[3].isComplete = false table.remove(__wfgWorld.quests, 3)");
  addon.eval("ns.QuestArrow.Pick()");
  expect([pick(), chatHas(addon, /Arrow: TEST-ONLY Near\./)], "the turn-in gone: on to the next, with a word").toEqual([90061, true]);
});

it("quest arrow: no direction when the client won't say, another zone, no spot, hidden values and no quests", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.update(0);
  addon.eval("GetPlayerFacing = function() return nil end");
  addon.advance(0.3);
  expect(arrow(addon).slice(2, 4), "no facing: the distance and a faint arrow").toEqual(["100 yd, no direction", 0.35]);
  addon.eval("GetPlayerFacing = function() return __wfgWorld.secret() end C_Map.GetPlayerMapPosition = function() return nil end");
  addon.advance(0.3);
  expect(arrow(addon)[3], "a hidden facing and no position: faint").toBe(0.35);
  addon.eval("__spots[90061] = { 11, 0.6, 0.5 } ns.QuestArrow.Pick() C_Map.GetMapWorldSize = function() return nil end");
  expect(arrow(addon).slice(2, 4), "a spot on another map").toEqual(["100 yd, no direction", 0.35]);
  addon.eval("__spots[90061] = nil C_QuestLog.GetNextWaypoint = function() return __wfgWorld.secret(), 0.1, 0.1 end ns.QuestArrow.Pick()");
  expect(arrow(addon)[2], "no spot, or a hidden one").toBe("No spot from the game");
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function() return __wfgWorld.secret() end C_QuestLog.GetTitleForQuestID = function() return __wfgWorld.secret() end ns.QuestArrow.Pick()");
  expect(addon.eval("return ns.QuestArrow.current"), "a hidden distance ranks nothing").toBe(null);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function() return 100 end ns.QuestArrow.current = 90061 ns.QuestArrow.target = { 10, 0.5, 0.5 } C_QuestLog.GetNextWaypoint = nil C_Map.GetPlayerMapPosition = function() return { GetXY = function() return 0.5, 0.5 end } end GetPlayerFacing = function() return 0 end C_Map.GetMapWorldSize = nil ns.QuestArrow.Draw()");
  expect(arrow(addon)[1], "a hidden title reads as Quest").toBe("Quest");
  addon.eval("for i = #__wfgWorld.quests, 1, -1 do table.remove(__wfgWorld.quests, i) end ns.QuestArrow.Pick()");
  expect(arrow(addon)[4], "no quests: nothing on screen").toBe(false);
});

it("quest arrow: while the map is restricted it has no spot for you and so no direction", () => {
  const addon = loggedIn(ARROW_ENV + `Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1, ChallengeMode = 2, PvPMatch = 3, Map = 4, Chat = 5 }
  Enum.AddOnRestrictionState = { Inactive = 0, Activating = 1, Active = 2 }
  __restricted = {}
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return __restricted[t] or 0 end }
`);
  addon.update(0);
  addon.eval("__restricted[4] = 2");
  addon.advance(0.3);
  expect(arrow(addon).slice(2, 4), "restricted: the distance and a faint arrow").toEqual(["100 yd, no direction", 0.35]);
});

it("quest arrow: a quest on another map is pointed at by the client's next waypoint on this one, when it has one", () => {
  const addon = loggedIn(ARROW_ENV + "__spots[90061] = { 11, 0.6, 0.5 }");
  addon.eval(`C_QuestLog.GetNextWaypointForMap = function(id, map) if id == 90061 and map == 10 then return 0.5, 0.1 end end`);
  addon.eval("ns.QuestArrow.Pick()");
  expect(arrow(addon).slice(2, 4), "the quest's own way out of this map: due north, full arrow").toEqual(["100 yd", 1]);
  expect(arrow(addon)[0]).toBeCloseTo(0, 5);
  addon.eval(`C_QuestLog.GetNextWaypointForMap = nil
    C_SuperTrack = { GetSuperTrackedQuestID = function() return 90061 end }
    C_Navigation = { GetNextWaypointForMap = function(map) return 0.6, 0.5 end }`);
  addon.advance(0.2);
  expect(arrow(addon)[0], "the game's waypoint for its tracked quest: due east").toBeCloseTo(-Math.PI / 2, 5);
  addon.eval("C_Navigation = nil C_SuperTrack.GetNextWaypointForMap = function() return 0.4, 0.5 end");
  addon.advance(0.2);
  expect(arrow(addon)[0], "the older C_SuperTrack call: due west").toBeCloseTo(Math.PI / 2, 5);
  addon.eval("C_SuperTrack.GetNextWaypointForMap = function() return __wfgWorld.secret(), 0.5 end");
  addon.advance(0.2);
  expect(arrow(addon).slice(2, 4), "a hidden waypoint: no direction").toEqual(["100 yd, no direction", 0.35]);
  addon.eval("C_SuperTrack.GetSuperTrackedQuestID = function() return 90062 end C_SuperTrack.GetNextWaypointForMap = function() return 0.4, 0.5 end");
  addon.advance(0.2);
  expect(arrow(addon)[3], "the game tracks another quest: its waypoint is not used").toBe(0.35);
});

it("quest arrow: a Shift-click pin wins; with auto off only the pinned quest is followed; combat does not stop it", () => {
  const addon = loggedIn(ARROW_ENV + "C_SuperTrack = { SetSuperTrackedQuestID = function(id) __tracked = id end, GetSuperTrackedQuestID = function() return __tracked end }");
  addon.eval("ns.QuestGuide.Point(90062)");
  addon.eval("ns.QuestArrow.Pick()");
  expect(addon.eval("return ns.QuestArrow.current"), "pinned beats nearest").toBe(90062);
  addon.eval("ns.Settings('QuestArrow').auto = false __tracked = nil ns.QuestGuide.pointed = nil ns.QuestArrow.Pick()");
  expect(arrow(addon)[4], "auto off and nothing pinned: no arrow").toBe(false);
  addon.eval("ns.QuestGuide.pointed = 90061 ns.QuestArrow.Pick()");
  setCombat(addon, true);
  const said = Array.from(addon.chat()).length;
  addon.eval("ns.Settings('QuestArrow').auto = true table.remove(__wfgWorld.quests, 1) ns.QuestGuide.pointed = nil ns.QuestArrow.Pick()");
  expect([arrow(addon)[1], Array.from(addon.chat()).length - said], "in combat: still updates, says nothing").toEqual(["TEST-ONLY Far", 0]);
  addon.eval("ns.Settings('QuestArrow').show = false ns.QuestArrow.Draw()");
  expect(arrow(addon)[4], "the switch hides it").toBe(false);
});

it("quest arrow: its options sit on the Quests page and change the settings", () => {
  const addon = loggedIn(ARROW_ENV);
  const rows = addon.eval("local out = {} for i, row in ipairs(ns.QuestArrow.Rows()) do out[i] = row[2] end return out");
  expect(rows, "the card").toEqual(["Quest arrow", rows[1], "Show the quest arrow", "Follow the nearest quest (off: only the one you pinned)"]);
  addon.eval("local rows = ns.QuestArrow.Rows() local _, set = rows[3][3]() rows[3][4](false) rows[4][4](false)");
  expect(addon.eval("local s = ns.Settings('QuestArrow') return { s.show, s.auto }"), "both switched off").toEqual([false, false]);
});
