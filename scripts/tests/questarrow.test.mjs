// questarrow: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/QuestArrow.lua: the on-screen arrow that turns toward the nearest unfinished objective
// of the watched quests, with the quest's title and distance.

import { expect, it } from "vitest";
import { createAddon, RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { SETUP_DONE, chatHas, isTok, loggedIn, setCombat } from "./helpers.mjs";

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

it("quest arrow: a quest the game puts on another continent is never picked as nearest, whatever distance it reports", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function(id) if id == 90061 then return 0, false end return 90000, true end ns.QuestArrow.Pick()");
  expect(addon.eval("return ns.QuestArrow.current"), "the quest reading 0 yards off-continent is passed over").toBe(90062);
  expect(addon.eval("return ns.GetModule('QuestTracker').DistanceSq(90061) == nil"), "no distance for it").toBe(true);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function() return 144, __wfgWorld.secret(false) end");
  expect(addon.eval("return ns.GetModule('QuestTracker').DistanceSq(90061)"), "a hidden flag keeps the distance").toBe(144);
});

it("E6-2 quest arrow: a map position the client hides whole gives no spot and no error", () => {
  const addon = loggedIn(ARROW_ENV);
  expect(addon.eval("return { ns.QuestArrow.PlayerSpot(10) }"), "a plain position is read").toEqual([0.5, 0.5]);
  addon.eval("C_Map.GetPlayerMapPosition = function() return __wfgWorld.secret(0) end");
  expect(addon.eval("return ns.QuestArrow.PlayerSpot(10) == nil"), "a hidden position is no spot").toBe(true);
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
  expect(rows, "its rows on the Finding your way card").toEqual(["Show the quest arrow", "Follow the nearest quest"]);
  addon.eval("local rows = ns.QuestArrow.Rows() rows[1][4](false) rows[2][4](false)");
  expect(addon.eval("local s = ns.Settings('QuestArrow') return { s.show, s.auto }"), "both switched off").toEqual([false, false]);
});

it("quest arrow: points at a watched quest with Vanguard's quest tracker module off", () => {
  const addon = loggedIn(ARROW_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { QuestTracker = false } } }" });
  addon.advance(2.5);
  expect(arrow(addon).slice(1), "the nearer quest, as with the tracker on").toEqual(["TEST-ONLY Near", "100 yd", 1, true]);
});

// F-06: TEST-ONLY game super-tracking, recorded: what the game tracks (a quest id, or 0) and every set call.
const SUPER_ENV = `__supers = {}
  C_SuperTrack = { SetSuperTrackedQuestID = function(id) table.insert(__supers, id) __tracked = id end, GetSuperTrackedQuestID = function() return __tracked or 0 end }`;
// The Pin button: { shown, its kind (a button takes the mouse) }, and whether the panel itself takes the mouse.
const pinState = (addon) => addon.eval("local f = Vanguard_QuestArrow return { f.pin:IsShown(), f.pin:GetObjectType(), f.__mouse == true }");

it("quest arrow: within 15 yards it reads Here in the good colour with a faint arrow, but not on a flight", () => {
  const addon = loggedIn(ARROW_ENV + "C_QuestLog.GetDistanceSqToQuest = function() return 144 end");
  addon.eval("ns.QuestArrow.Pick()");
  expect(arrow(addon).slice(2, 4), "12 yards: there").toEqual(["Here", 0.35]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestArrow.dist.__textColor"), "good")).toBe(true);
  addon.eval("UnitOnTaxi = function() return true end ns.QuestArrow.Draw()");
  expect(arrow(addon).slice(2, 4), "on a taxi the distance stays").toEqual(["12 yd", 1]);
  addon.eval("UnitOnTaxi = function() return __wfgWorld.secret() end ns.QuestArrow.Draw()");
  expect(arrow(addon)[2], "a hidden taxi answer counts as on one").toBe("12 yd");
  addon.eval("UnitOnTaxi = function() return false end C_QuestLog.GetDistanceSqToQuest = function() return 400 end ns.QuestArrow.Draw()");
  expect(arrow(addon)[2], "20 yards: not yet").toBe("20 yd");
});

it("quest arrow: a finished quest reads Turn in with the distance, the arrow in gold", () => {
  const addon = loggedIn(ARROW_ENV + "__wfgWorld.quests[1].isComplete = true");
  addon.eval("ns.QuestArrow.Pick()");
  expect(arrow(addon)[2]).toBe("Turn in · 100 yd");
  expect(isTok(addon, addon.eval("return Vanguard_QuestArrow.arrow.__vertexColor"), "gold")).toBe(true);
  addon.eval("GetPlayerFacing = function() return nil end ns.QuestArrow.Draw()");
  expect(arrow(addon)[2], "with no direction").toBe("Turn in · 100 yd, no direction");
});

it("quest arrow: a pinned arrow shows a Pin button, the only part of the panel that takes the mouse; it goes back to the nearest quest", () => {
  const addon = loggedIn(ARROW_ENV + SUPER_ENV);
  addon.eval("ns.QuestArrow.Pick()");
  expect(pinState(addon), "following the nearest: no button").toEqual([false, "Button", false]);
  addon.eval("ns.QuestGuide.Point(90062) ns.QuestArrow.Pick()");
  expect([addon.eval("return ns.QuestArrow.current"), pinState(addon)[0], addon.eval("return Vanguard_QuestArrow.title.__noWrap")], "pinned: the button, the title kept to one line beside it").toEqual([90062, true, true]);
  addon.eval("__wfgStub.hover(Vanguard_QuestArrow.pin)");
  expect(addon.eval("return { GameTooltip.__lines[1].text, GameTooltip.__lines[2].text }")).toEqual(["Pinned (Shift-click in the tracker)", "Click: follow the nearest quest."]);
  addon.eval("__wfgStub.hover(nil) Vanguard_QuestArrow.pin.__scripts.OnClick(Vanguard_QuestArrow.pin)");
  expect([addon.eval("return { ns.QuestGuide.pointed == nil, __tracked, ns.QuestArrow.current }"), pinState(addon)[0], chatHas(addon, /Arrow: nearest quest\./)],
    "the pin and the game's tracked quest let go, back to the nearest, the button gone").toEqual([[true, 0, 90061], false, true]);
});

it("quest arrow: the Pin button leaves a map waypoint the game tracks alone", () => {
  const addon = loggedIn(ARROW_ENV + SUPER_ENV);
  addon.eval("ns.QuestGuide.pointed = 90062 ns.QuestArrow.Pick() ns.QuestArrow.Unpin()");
  expect(addon.eval("return #__supers"), "no quest tracked (a waypoint is): nothing cleared").toBe(0);
});

it("quest arrow: with Follow the nearest quest off, the Pin button lets the arrow go and says so", () => {
  const addon = loggedIn(ARROW_ENV + SUPER_ENV);
  addon.eval("ns.Settings('QuestArrow').auto = false ns.QuestGuide.Point(90062) ns.QuestArrow.Pick()");
  addon.eval("ns.QuestArrow.PinTooltip(Vanguard_QuestArrow.pin)");
  expect(addon.eval("return GameTooltip.__lines[2].text")).toBe("Click: let it go. Follow the nearest quest is off, so the arrow hides.");
  addon.eval("ns.QuestArrow.Unpin()");
  expect([arrow(addon)[4], chatHas(addon, /Arrow: off until you Shift-click a quest in the tracker\./)]).toEqual([false, true]);
});

it("quest arrow on Retail: no Shift-click is promised, the arrow holds the quest tracked on the map (H15-6-1)", () => {
  const addon = loggedIn(ARROW_ENV + SUPER_ENV, { client: RETAIL_CLIENT });
  const text = addon.eval(`local out = {}
    for _, p in ipairs(ns.Options.PAGES) do
      if p.key == "quests" then for _, r in ipairs(p.rows()) do if r[1] == "text" then out[#out + 1] = r[2] end end end
    end
    return table.concat(out, "\\n")`);
  expect(text).toContain("or the quest you track on the game's map.");
  expect(text).not.toContain("Shift-click a quest in the tracker");
  addon.eval("ns.Settings('QuestArrow').auto = false ns.QuestArrow.PinTooltip(Vanguard_QuestArrow.pin) ns.QuestArrow.Unpin()");
  expect([addon.eval("return GameTooltip.__lines[1].text"), chatHas(addon, /Arrow: off until you track a quest on the map\./)]).toEqual(["Pinned (the quest you track on the map)", true]);
});

it("quest arrow: a failed quest is not pointed at, and the arrow moves on from it", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestArrow.Pick() __wfgWorld.quests[1].failed = true ns.QuestArrow.Pick()");
  expect([addon.eval("return ns.QuestArrow.current"), chatHas(addon, /Arrow: TEST-ONLY Far\./)]).toEqual([90062, true]);
});

it("quest arrow: with the arrow switched off, moving on from a failed quest says nothing in chat", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.Settings('QuestArrow').show = false ns.QuestArrow.Pick() __wfgWorld.quests[1].failed = true ns.QuestArrow.Pick()");
  expect([addon.eval("return ns.QuestArrow.current"), chatHas(addon, /Arrow:/)]).toEqual([90062, false]);
});

// Simulates a reload: the module's own state is gone, the character's saved data stays, the module enables again.
const RELOAD = "ns.QuestGuide.pointed = nil ns.QuestGuide.Enable(ns.Settings('QuestGuide')) ns.QuestArrow.Pick()";

it("quest arrow: a Shift-click hold survives a reload, with the Pin button back", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestGuide.Point(90062)");
  addon.eval(RELOAD);
  expect([addon.eval("return ns.QuestArrow.current"), pinState(addon)[0]]).toEqual([90062, true]);
});

it("quest arrow: a restored hold whose quest left the log is dropped and forgotten", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestGuide.Point(90062) table.remove(__wfgWorld.quests, 2)");
  addon.eval(RELOAD);
  expect([addon.eval("return { ns.QuestGuide.pointed == nil, VanguardCharDB.questPin == nil, ns.QuestArrow.current }")]).toEqual([[true, true, 90061]]);
});

it("quest arrow: a restored hold is kept while the quest log is still empty at login", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestGuide.Point(90062) __wfgWorld.quests = {}");
  addon.eval(RELOAD);
  expect(addon.eval("return ns.QuestGuide.pointed")).toBe(90062);
});

it("quest arrow: once the log has updated, a pin on the last quest is dropped when it is turned in and the log is empty", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestGuide.Point(90062) __wfgWorld.quests = {}");
  addon.fire("QUEST_LOG_UPDATE");
  addon.advance(1);
  expect(addon.eval("return { ns.QuestGuide.pointed == nil, VanguardCharDB.questPin == nil }")).toEqual([true, true]);
});

it("quest arrow: a pin whose quest left the log is let go, so a quest the game tracks later is not held", () => {
  const addon = loggedIn(ARROW_ENV + SUPER_ENV);
  addon.eval("ns.QuestGuide.Point(90062) table.remove(__wfgWorld.quests, 2) __tracked = 0 ns.QuestArrow.Pick()");
  expect(addon.eval("return { ns.QuestGuide.pointed == nil, ns.QuestArrow.current }"), "the pin let go, the nearest followed").toEqual([true, 90061]);
  addon.eval(`__wfgWorld.addQuest({ questID = 90062, title = "TEST-ONLY Far", level = 8, watched = true, distanceSq = 90000, objectives = {} }) __tracked = 90062 ns.QuestArrow.Pick()`);
  expect([addon.eval("return ns.QuestArrow.current"), pinState(addon)[0]], "the game's tracked quest doesn't hold the arrow").toEqual([90061, false]);
});

it("quests page: its cards in the order a player meets them, the arrow, guidance and minimap spots on one card", () => {
  const addon = loggedIn(ARROW_ENV);
  const page = addon.eval(`local out = {}
    for _, p in ipairs(ns.Options.PAGES) do
      if p.key == "quests" then for _, r in ipairs(p.rows()) do if r[1] == "header" or r[1] == "cycle" then out[#out + 1] = r[2] end end end
    end
    return out`);
  // The list holds each card's header and its cycle rows, so the Quest windows card's key choice sits under its header.
  expect(page).toEqual(["Quest windows", "Hold a key to open the game's windows", "Quest tracker", "With Questie loaded (reload)", "Order", "Finding your way", "Shift-click points", "Quest history", "Automation (hold Shift while talking to skip it)"]);
  expect(addon.eval("local r = ns.QuestGuide.Rows()[1] return { r[3][1][2], r[3][2][2] }"), "the game's marker, not a second arrow").toEqual(["The game's quest marker", "A map waypoint"]);
});

// Which tracker blocks show the followed quest's accent line, by title.
const edges = (addon) => addon.eval(`local f, out = Vanguard_QuestTrackerFrame, {}
  for i = 1, f.blocks.used do if f.blocks[i].edge:IsShown() then out[#out + 1] = f.blocks[i].title:GetText() end end
  return out`);

it("quest arrow: the tracker draws an accent line down the left edge of the quest the arrow follows, and moves it with the arrow", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.update(0);
  expect(edges(addon), "the nearer quest, the arrow's pick").toEqual(["[8] TEST-ONLY Near"]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[1].edge.__vertexColor"), "accent"), "in the accent").toBe(true);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function(id) return id == 90061 and 10000 or 4000 end ns.QuestArrow.Pick()");
  addon.update(0);
  expect(edges(addon), "the arrow moved on: so does the line").toEqual(["[8] TEST-ONLY Far"]);
  addon.eval("for _, r in ipairs(ns.QuestArrow.Rows()) do if r[2] == 'Show the quest arrow' then r[4](false) end end");
  addon.update(0);
  expect(edges(addon), "with the arrow hidden (its switch) its pick marks nothing").toEqual({});
  addon.eval("ns.QuestGuide.pointed = 90061 ns.GetModule('QuestTracker').Refresh()");
  expect(edges(addon), "the quest you Shift-clicked has it, as its step line does").toEqual(["[8] TEST-ONLY Near"]);
});

it("quest arrow: a quest on another continent with a waypoint toward it says no distance, the arrow stays bright", () => {
  const addon = loggedIn(ARROW_ENV + "__spots[90061] = { 11, 0.6, 0.5 } C_QuestLog.GetDistanceSqToQuest = function() return 250000, false end");
  addon.eval(`C_QuestLog.GetNextWaypointForMap = function(id, map) if id == 90061 and map == 10 then return 0.6, 0.5 end end
    ns.QuestArrow.current = 90061 ns.QuestArrow.target = { 11, 0.6, 0.5 } ns.QuestArrow.Draw()`);
  expect(arrow(addon).slice(2, 4), "a way out of this map but no distance: said so, full arrow").toEqual(["No distance", 1]);
  addon.eval("ns.QuestArrow.ready = true ns.QuestArrow.Draw()");
  expect(arrow(addon)[2], "ready to turn in").toBe("Turn in · no distance");
  addon.eval("C_QuestLog.GetNextWaypointForMap = nil ns.QuestArrow.Draw()");
  expect(arrow(addon).slice(2, 4), "no waypoint either: no direction, faint").toEqual(["No direction", 0.35]);
});

it("quest arrow: the longest real distance lines fit beside the arrow, also with the Pin button showing", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true });
  addon.eval(ARROW_ENV);
  addon.login();
  addon.update(0);
  // The text-fit audit's cut-short findings for the arrow with this distance text.
  const cut = (text) => {
    addon.eval(`Vanguard_QuestArrow.dist:SetText("${text}")`);
    return addon.textFit("Vanguard_QuestArrow").filter((f) => f.kind === "cut");
  };
  expect(cut("Consegna · 1240 m, nessuna direzione"), "the Italian turn-in line with no direction, arrow alone").toEqual([]);
  expect(cut("Consegna · nessuna distanza"), "the Italian turn-in line with no distance, arrow alone").toEqual([]);
  addon.eval("ns.QuestGuide.pointed = 90061 ns.QuestArrow.Pick()");
  expect(addon.eval("return Vanguard_QuestArrow.pin:IsShown()"), "the arrow is held: the Pin button shows").toBe(true);
  expect(cut("Aucun endroit fourni par le jeu"), "the French no-spot reason while the Pin button shows").toEqual([]);
  expect(cut("Consegna · 1240 m, nessuna direzione"), "the Italian line with no direction while the Pin button shows (P9-5)").toEqual([]);
  expect(cut("Consegna · nessuna distanza"), "the Italian line with no distance while the Pin button shows").toEqual([]);
  addon.eval('Vanguard_QuestArrow.dist:SetText("Consegna · 1240 m, nessuna direzione")');
  const overlaps = addon.textFit("Vanguard_QuestArrow").filter((f) => f.kind === "overlap");
  expect(overlaps, "and the distance line does not run under the Pin button").toEqual([]);
  const rows = addon.eval("local f = Vanguard_QuestArrow return { f.pin:GetBottom() >= f.dist:GetTop(), f.title:GetRight() <= f.pin:GetLeft(), f.dist:GetRight() > f.pin:GetLeft() }");
  expect(rows, "the pin sits in the title's row, the title stops short of it, the distance line runs under it").toEqual([true, true, true]);
});

it("quest arrow: the title and the distance line grow away from the panel's middle, so they never draw over each other at Text size 125% to 130%", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true });
  addon.eval(ARROW_ENV);
  addon.login();
  addon.eval("ns.QuestGuide.pointed = 90061 ns.QuestArrow.Pick()");
  for (const scale of [1, 1.25, 1.3]) {
    addon.eval(`ns.Theme.Settings().textScale = ${scale} ns.Theme.Refresh() ns.QuestArrow.Pick()`);
    addon.update(0);
    const lines = addon.eval("local f = Vanguard_QuestArrow return { f.title:GetBottom() >= f.dist:GetTop(), f.title:GetTop() <= f:GetTop(), f.dist:GetBottom() >= f:GetBottom() }");
    expect(lines, `${scale * 100}%: the title stands over the distance line and both stay inside the panel`).toEqual([true, true, true]);
    expect(addon.textFit("Vanguard_QuestArrow").filter((f) => f.kind === "overlap"), `${scale * 100}%: nothing overlaps in the text-fit audit`).toEqual([]);
  }
});

// A1-3 (M13): the arrow's two repeating jobs are tied to frames and rest in a fight.
const FACING_COUNT = "__reads = 0 local facing = GetPlayerFacing GetPlayerFacing = function() __reads = __reads + 1 return facing() end";

it("A1-3 quest arrow: its tickers have owner frames, and the redraw rests while the arrow is hidden", () => {
  const addon = loggedIn(ARROW_ENV + FACING_COUNT);
  expect(addon.eval('local j = ns.ticker.vgJobs return { j["quest arrow"].frame == Vanguard_QuestArrow, j["quest arrow pick"].frame == UIParent }'), "the redraw is the arrow's, the pick the interface's").toEqual([true, true]);
  // How often your facing was read over the next second.
  const reads = () => { addon.eval("__reads = 0"); addon.advance(1); return addon.eval("return __reads"); };
  expect(reads(), "shown: redrawn as the frames pass").toBeGreaterThan(1);
  addon.eval("ns.Settings('QuestArrow').show = false ns.QuestArrow.Draw()");
  expect([arrow(addon)[4], reads()], "hidden: nothing is read for a turn nobody sees").toEqual([false, 0]);
  addon.eval("ns.Settings('QuestArrow').show = true ns.QuestArrow.Draw()");
  expect([arrow(addon)[4], reads() > 1], "shown again by the switch: redrawn again").toEqual([true, true]);
});

it("A1-3 quest arrow: in a fight it holds its turn as you move, a quest log change still redraws it, and it catches up when the fight ends", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.update(0);
  addon.eval("__picks = 0 local pick = ns.QuestArrow.Pick ns.QuestArrow.Pick = function() __picks = __picks + 1 return pick() end");
  addon.world.combat(true);
  addon.eval("__facing = math.pi / 2 __picks = 0");
  addon.advance(3);
  expect([arrow(addon)[0], addon.eval("return __picks")], "three seconds of a fight: the turn it had, and no pick").toEqual([-Math.PI / 2, 0]);
  addon.fire("QUEST_LOG_UPDATE");
  addon.advance(0.05);
  expect([arrow(addon)[0], addon.eval("return __picks")], "the quest log changed: one pick, drawn with the facing now").toEqual([-Math.PI, 1]);
  addon.eval("__facing = 0");
  addon.advance(1);
  expect(arrow(addon)[0], "still the fight: held again").toBeCloseTo(-Math.PI, 5);
  addon.world.combat(false);
  addon.eval("__picks = 0");
  addon.advance(1.05);
  expect([arrow(addon)[0], addon.eval("return __picks") >= 1], "after the fight: the turn and the pick are current within a second").toEqual([-Math.PI / 2, true]);
});

it("A1-3 quest arrow: the each-second pick rests where the client restricts the map; the zone's event still picks", () => {
  const addon = loggedIn(ARROW_ENV + `Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1, ChallengeMode = 2, PvPMatch = 3, Map = 4, Chat = 5 }
  Enum.AddOnRestrictionState = { Inactive = 0, Activating = 1, Active = 2 }
  __restricted = {}
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return __restricted[t] or 0 end }`);
  addon.update(0);
  addon.eval("__picks = 0 local pick = ns.QuestArrow.Pick ns.QuestArrow.Pick = function() __picks = __picks + 1 return pick() end");
  addon.advance(2.05);
  expect(addon.eval("return __picks"), "unrestricted: a pick each second").toBe(2);
  addon.eval("__restricted[4] = 2 __picks = 0");
  addon.advance(3);
  expect([addon.eval("return __picks"), arrow(addon)[2]], "restricted: no pick, and the redraw says no direction").toEqual([0, "100 yd, no direction"]);
  addon.fire("ZONE_CHANGED_NEW_AREA");
  addon.advance(0.05);
  expect(addon.eval("return __picks"), "a new zone picks at once").toBe(1);
});

it("A1-3 quest arrow: a redraw with nothing new sets no text, and a pick fills the same spot table", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.update(0);
  addon.eval(`__sets = 0 local f = Vanguard_QuestArrow
    for _, fs in ipairs({ f.title, f.dist }) do local set = fs.SetText fs.SetText = function(...) __sets = __sets + 1 return set(...) end end`);
  addon.advance(2);
  expect(addon.eval("return __sets"), "two seconds standing still: every redraw, no text set").toBe(0);
  addon.eval("C_QuestLog.GetDistanceSqToQuest = function(id) return id == 90061 and 8100 or 90000 end");
  addon.advance(0.2);
  expect([addon.eval("return __sets"), arrow(addon)[2]], "ten yards nearer: the distance line set once").toEqual([1, "90 yd"]);
  addon.eval("__titles[90061] = 'TEST-ONLY Renamed'");
  addon.advance(0.2);
  expect([addon.eval("return __sets"), arrow(addon)[1]], "a title that arrived late: set once").toEqual([2, "TEST-ONLY Renamed"]);
  expect(addon.eval("local QA = ns.QuestArrow local before = QA.target QA.Pick() return { before == QA.target, QA.target == QA.spot, QA.target[1] }"), "the pick's spot is one table, filled again").toEqual([true, true, 10]);
  addon.eval("__wfgWorld.quests = {} ns.QuestArrow.Pick()");
  expect(addon.eval("return ns.QuestArrow.target == nil"), "no quest: no spot").toBe(true);
});
