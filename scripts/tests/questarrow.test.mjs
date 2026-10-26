// questarrow: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/QuestArrow.lua: the on-screen arrow that turns toward the nearest unfinished objective
// of the watched quests, with the quest's title and distance.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
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
  expect(rows, "its rows on the Finding your way card").toEqual(["Show the quest arrow", "Follow the nearest quest (off: only the one you pinned)"]);
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

it("quest arrow: a failed quest is not pointed at, and the arrow moves on from it", () => {
  const addon = loggedIn(ARROW_ENV);
  addon.eval("ns.QuestArrow.Pick() __wfgWorld.quests[1].failed = true ns.QuestArrow.Pick()");
  expect([addon.eval("return ns.QuestArrow.current"), chatHas(addon, /Arrow: TEST-ONLY Far\./)]).toEqual([90062, true]);
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
  expect(page).toEqual(["Quest windows", "Quest tracker", "With Questie loaded (reload)", "Order", "Finding your way", "Shift-click points", "Quest history", "Automation (hold Shift while talking to skip it)"]);
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
  addon.eval("ns.QuestGuide.pointed = 90061 ns.QuestArrow.Pick()");
  expect(addon.eval("return Vanguard_QuestArrow.pin:IsShown()"), "the arrow is held: the Pin button shows").toBe(true);
  expect(cut("Aucun endroit fourni par le jeu"), "the French no-spot reason while the Pin button shows").toEqual([]);
});
