// waypoints: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY maps: a world (1) holding two zones and a city whose names share a
// start, the player on zone 10 at 45.67, 12.3. Every waypoint set is recorded.
const MAP_ENV = `
  __maps = {
    [1] = { mapID = 1, name = "TEST-ONLY World", parentMapID = 0 },
    [10] = { mapID = 10, name = "TEST-ONLY Elwynn Forest", parentMapID = 1 },
    [11] = { mapID = 11, name = "TEST-ONLY Duskwood", parentMapID = 1 },
    [12] = { mapID = 12, name = "TEST-ONLY Dun Morogh", parentMapID = 1 },
  }
  __set = {}
  C_Map.GetBestMapForUnit = function() return __playerMap end
  __playerMap = 10
  C_Map.GetMapInfo = function(id) return __maps[id] end
  C_Map.GetMapChildrenInfo = function(id) local out = {} for _, m in pairs(__maps) do if m.parentMapID == id then out[#out + 1] = m end end table.sort(out, function(a, b) return a.mapID < b.mapID end) return out end
  C_Map.CanSetUserWaypointOnMap = function(id) return __maps[id] ~= nil and id ~= 11 end
  C_Map.SetUserWaypoint = function(p) __set[#__set + 1] = p end
  C_Map.ClearUserWaypoint = function() __set[#__set + 1] = "clear" end
  UiMapPoint = { CreateFromCoordinates = function(id, x, y) return { id, x, y } end }
  C_SuperTrack = { SetSuperTrackedUserWaypoint = function(on) __tracked = on end }
`;

// TEST-ONLY world map, there at login, on map 10, the cursor at 40%, 52.5%.
const WORLD_MAP_ENV = `
  WorldMapFrame = CreateFrame("Frame", "WorldMapFrame", UIParent)
  WorldMapFrame.GetMapID = function() return 10 end
  WorldMapFrame.ScrollContainer = CreateFrame("Frame", nil, WorldMapFrame)
  __cursor = { 0.4, 0.525 }
  WorldMapFrame.ScrollContainer.GetNormalizedCursorPosition = function() return __cursor[1], __cursor[2] end
`;

// /way <msg>, and the waypoints set since the last call.
const way = (addon, msg) => {
  addon.clearChat();
  addon.eval(`__set = {} SlashCmdList.VANGUARDWAY(${JSON.stringify(msg)})`);
  return addon.eval("return __set");
};

it("waypoints: /way reads guide coordinates, names zones, and points the game's arrow", () => {
  const addon = loggedIn(MAP_ENV);
  expect(way(addon, "45.2 61.8"), "x y on the map you're on").toEqual([[10, 0.452, 0.618]]);
  expect([addon.eval("return __tracked"), chatHas(addon, /Waypoint: TEST-ONLY Elwynn Forest 45\.2, 61\.8\./)], "the arrow points at it, and chat says where").toEqual([true, true]);
  expect(way(addon, "45.2, 61.8"), "a comma between works").toEqual([[10, 0.452, 0.618]]);
  expect(way(addon, "45,61"), "so does a comma alone").toEqual([[10, 0.45, 0.61]]);
  expect(way(addon, "test-only elwynn forest 42 65 The Inn"), "a zone by its name in any case, and a title").toEqual([[10, 0.42, 0.65]]);
  expect(chatHas(addon, /Elwynn Forest 42\.0, 65\.0 \(The Inn\)\./), "the title is said too").toBe(true);
  expect(way(addon, "TEST-ONLY Dun 30 30"), "a unique start of a name").toEqual([[12, 0.3, 0.3]]);
  expect(way(addon, "#12 50 50"), "a map by its id").toEqual([[12, 0.5, 0.5]]);
  expect(way(addon, "clear"), "clear removes it").toEqual(["clear"]);
  expect(chatHas(addon, /Waypoint cleared/), "and says so").toBe(true);
});

it("waypoints: lines it can't use say why and set nothing", () => {
  const addon = loggedIn(MAP_ENV);
  expect([way(addon, "somewhere nice"), chatHas(addon, /give the coordinates as x y/)], "no coordinates").toEqual([{}, true]);
  expect([way(addon, "45 120"), chatHas(addon, /give the coordinates/)], "a number past 100 isn't a coordinate").toEqual([{}, true]);
  expect([way(addon, "TEST-ONLY D 30 30"), chatHas(addon, /no zone called TEST-ONLY D\./)], "a start two names share").toEqual([{}, true]);
  expect([way(addon, "Narnia 30 30"), chatHas(addon, /no zone called Narnia/)], "a name nothing has").toEqual([{}, true]);
  expect([way(addon, "TEST-ONLY Duskwood 30 30"), chatHas(addon, /Can't put a waypoint on TEST-ONLY Duskwood/)], "a map that can't hold one").toEqual([{}, true]);
  expect([way(addon, "#99 30 30"), chatHas(addon, /Can't put a waypoint on map 99/)], "an id the client doesn't know").toEqual([{}, true]);
  addon.eval("__playerMap = nil");
  expect([way(addon, "30 30"), chatHas(addon, /won't say which map you're on/)], "where the game won't say the map").toEqual([{}, true]);
  expect([way(addon, "TEST-ONLY Duskwood 30 30"), chatHas(addon, /no zone called/)], "nor find a zone by name").toEqual([{}, true]);
  const bare = loggedIn();
  bare.slash("way 45 61");
  expect(chatHas(bare, /no map waypoints/), "a client without user waypoints says so").toBe(true);
});

it("waypoints: /way is left to another addon, /vg way always works, and the switch can turn it off", () => {
  const mine = loggedIn(MAP_ENV);
  expect(mine.eval("return SLASH_VANGUARDWAY1"), "Vanguard takes /way when nobody has it").toBe("/way");
  mine.eval("__set = {}");
  mine.slash("way 10 20");
  expect(mine.eval("return __set"), "/vg way sets one too").toEqual([[10, 0.1, 0.2]]);
  const tomtom = loggedIn(MAP_ENV + 'C_AddOns.IsAddOnLoaded = function(name) return name == "TomTom" end');
  expect(tomtom.eval("return { SLASH_VANGUARDWAY1 == nil, SlashCmdList.VANGUARDWAY == nil }"), "TomTom loaded: /way is its").toEqual([true, true]);
  const taken = loggedIn(MAP_ENV + 'hash_SlashCmdList = { ["/WAY"] = function() end }');
  expect(taken.eval("return SLASH_VANGUARDWAY1 == nil"), "another addon's /way is left alone").toBe(true);
  const off = loggedIn(MAP_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Waypoints = { slash = false } } }" });
  expect(off.eval("return SLASH_VANGUARDWAY1 == nil"), "switched off: no /way").toBe(true);
});

it("waypoints: the world map shows your coordinates and the cursor's, ten times a second", () => {
  const addon = loggedIn(MAP_ENV + WORLD_MAP_ENV);
  // The coordinates line's text.
  const line = () => addon.eval("return Vanguard_MapCoords and ns.GetModule('Waypoints').mapLine:GetText()");
  addon.update(0.2);
  expect(line(), "you and the cursor").toBe("You 45.7, 12.3     Cursor 40.0, 52.5");
  addon.eval("__cursor = { 1.2, 0.5 }");
  addon.update(0.05);
  expect(line(), "not again within a tenth of a second").toBe("You 45.7, 12.3     Cursor 40.0, 52.5");
  addon.update(0.06);
  expect(line(), "then the cursor off the map drops out").toBe("You 45.7, 12.3");
  addon.eval("WorldMapFrame.GetMapID = function() return nil end __cursor = { 0.5, 0.25 }");
  addon.update(0.2);
  expect(line(), "a map with no id: the cursor only").toBe("Cursor 50.0, 25.0");
  addon.eval("WorldMapFrame.ScrollContainer.GetNormalizedCursorPosition = nil");
  addon.update(0.2);
  expect(line(), "nothing the client says: an empty line").toBe("");
  const late = loggedIn(MAP_ENV);
  expect(late.eval("return Vanguard_MapCoords == nil"), "no world map at login: nothing yet").toBe(true);
  late.eval(WORLD_MAP_ENV);
  late.fire("ADDON_LOADED", "TEST-ONLY Other");
  late.fire("ADDON_LOADED", "Blizzard_WorldMap");
  late.fire("ADDON_LOADED", "Blizzard_WorldMap");
  expect(late.eval("return Vanguard_MapCoords ~= nil and Vanguard_MapCoords:GetParent() == WorldMapFrame"), "it joins the map when the map loads, once").toBe(true);
  const off = loggedIn(MAP_ENV + WORLD_MAP_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Waypoints = { mapCoords = false } } }" });
  expect(off.eval("return Vanguard_MapCoords == nil"), "switched off: no line").toBe(true);
});

// TEST-ONLY SuperTrackedFrame, the game's floating waypoint pin: its Icon, DistanceText and the UpdateIcon the game
// runs when the tracking changes (an atlas for a quest or waypoint, a portrait for a party member). __pinKind is what
// the game tracks (Enum.SuperTrackingType); setting a user waypoint makes it the waypoint and redraws the icon. The
// atlas sets the icon's coordinates to its sub-rectangle (ATLAS_RECT), as the real client's SetAtlas does.
const PIN_ENV = `
  SuperTrackedFrame = CreateFrame("Frame", "SuperTrackedFrame", UIParent)
  SuperTrackedFrame.Icon = SuperTrackedFrame:CreateTexture(nil, "BACKGROUND")
  SuperTrackedFrame.DistanceText = SuperTrackedFrame:CreateFontString(nil, "BACKGROUND")
  Enum.SuperTrackingType = { Quest = 0, UserWaypoint = 1, Corpse = 2, PartyMember = 5 }
  __pinKind = 0
  C_SuperTrack.GetHighestPrioritySuperTrackingType = function() return __pinKind end
  function SuperTrackedFrame:UpdateIcon()
    if __pinKind == 5 then self.Icon:SetTexture("TEST-ONLY-portrait") return end
    self.Icon:SetAtlas("TEST-ONLY-Navigation-Tracked-Icon", true) self.Icon:SetTexCoord(0.25, 0.5, 0.25, 0.5)
  end
  SuperTrackedFrame:UpdateIcon()
  local track = C_SuperTrack.SetSuperTrackedUserWaypoint
  C_SuperTrack.SetSuperTrackedUserWaypoint = function(on) track(on) __pinKind = 1 SuperTrackedFrame:UpdateIcon() end
`;
// The sub-rectangle the TEST-ONLY atlas sets and the whole texture, as SetTexCoord's left, right, top, bottom.
const ATLAS_RECT = [0.25, 0.5, 0.25, 0.5];
const WHOLE = [0, 1, 0, 1];
// The pin as the player sees it: the icon's texture, atlas and coordinates, its tint, and whether the distance text has the theme's bold font and its flags.
const pin = (addon) => addon.eval(`local f = SuperTrackedFrame local path, _, flags = f.DistanceText:GetFont()
  return { icon = f.Icon.__texture or false, atlas = f.Icon.__atlas or false, coords = f.Icon.__texCoord or false, tint = f.Icon.__vertexColor or false, font = path == (ns.Theme.Font(true)), flags = flags or false }`);
// Whether the pin is Vanguard's: its icon, its tint in the accent, and the coordinates it is drawn with (the whole pin, not the atlas's slice).
const vanguardPin = (addon) => { const p = pin(addon); return [/Icons\\Pin$/.test(p.icon), isTok(addon, p.tint, "accent"), p.coords]; };

it("waypoints: the game's floating pin takes Vanguard's pin and font, and keeps them when the game redraws it", () => {
  const addon = loggedIn(MAP_ENV + PIN_ENV);
  expect([...vanguardPin(addon), pin(addon).font, pin(addon).flags], "at login: Vanguard's whole pin in the accent, the distance in the theme's outlined font").toEqual([true, true, WHOLE, true, "OUTLINE"]);
  way(addon, "45 61");
  expect(vanguardPin(addon), "after /way the game redraws its icon: still Vanguard's whole pin, not a slice of it").toEqual([true, true, WHOLE]);
  addon.eval("SuperTrackedFrame:UpdateIcon()");
  expect(vanguardPin(addon), "and again on any later redraw").toEqual([true, true, WHOLE]);
  addon.eval("ns.Theme.SetAccent(0.2, 0.7, 0.4)");
  expect([...vanguardPin(addon), pin(addon).tint.slice(0, 3)], "the accent changes: the pin follows").toEqual([true, true, WHOLE, [0.2, 0.7, 0.4]]);
  addon.eval("__pinKind = 5 SuperTrackedFrame:UpdateIcon()");
  expect([pin(addon).icon, pin(addon).tint], "tracking a party member: the game's portrait, untinted").toEqual(["TEST-ONLY-portrait", [1, 1, 1, 1]]);
  addon.eval("__pinKind = 2 SuperTrackedFrame:UpdateIcon()");
  expect([pin(addon).atlas, pin(addon).coords, isTok(addon, pin(addon).tint, "white")], "the corpse run: the game's tombstone as its atlas draws it, untinted").toEqual(["TEST-ONLY-Navigation-Tracked-Icon", ATLAS_RECT, true]);
  addon.eval("__pinKind = __wfgWorld.secret(5) SuperTrackedFrame:UpdateIcon()");
  expect(vanguardPin(addon), "a kind the client hides: Vanguard's pin, no error").toEqual([true, true, WHOLE]);
  addon.eval("__pinKind = 0 SuperTrackedFrame:UpdateIcon()");
  expect(vanguardPin(addon), "a quest again: Vanguard's pin").toEqual([true, true, WHOLE]);
});

it("waypoints: the pin is the game's own with its switch off or the module off, and nothing happens without the frame", () => {
  // The pin's icon, atlas, coordinates, tint and font as a list, to read against the game's own.
  const untouched = (addon) => { const p = pin(addon); return [p.icon, p.atlas, p.coords, p.tint, p.font]; };
  const off = loggedIn(MAP_ENV + PIN_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Waypoints = { pin = false } } }" });
  way(off, "45 61");
  expect(untouched(off), "switch off: the game's atlas and its slice, no tint, the game's font").toEqual([false, "TEST-ONLY-Navigation-Tracked-Icon", ATLAS_RECT, false, false]);
  const noModule = loggedIn(MAP_ENV + PIN_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Waypoints = false } } }" });
  expect(untouched(noModule), "module off: untouched").toEqual([false, "TEST-ONLY-Navigation-Tracked-Icon", ATLAS_RECT, false, false]);
  const bare = loggedIn(MAP_ENV + 'SuperTrackedFrame = CreateFrame("Frame", "SuperTrackedFrame", UIParent)');
  bare.eval("ns.GetModule('Waypoints').PaintPin()");
  expect(bare.eval("return SuperTrackedFrame.Icon == nil"), "a frame without the parts: left alone, no error").toBe(true);
  const none = loggedIn(MAP_ENV);
  way(none, "45 61");
  expect(none.eval("return SuperTrackedFrame == nil"), "no frame at all: nothing made, no error").toBe(true);
});

// TEST-ONLY game waypoint: __point is what the game holds (map, x, y) or nil; clearing drops it and untracks.
const POINT_ENV = `
  __point = nil
  C_Map.HasUserWaypoint = function() return __point ~= nil end
  C_Map.GetUserWaypoint = function() return __point and { uiMapID = __point[1], position = { GetXY = function() return __point[2], __point[3] end } } end
  C_Map.ClearUserWaypoint = function() __point = nil end
  C_Map.SetUserWaypoint = function(p) __point = p end
`;

// The game puts a waypoint down (a Ctrl-click on the map) and fires its event.
const click = (addon, map, x, y) => {
  addon.eval(`__point = { ${map}, ${x}, ${y} } __tracked = false`);
  addon.fire("USER_WAYPOINT_UPDATED");
};

it("waypoints: a map click turns the arrow on, remembers the spot, and the list keeps eight", () => {
  const addon = loggedIn(MAP_ENV + POINT_ENV);
  click(addon, 10, 0.2, 0.3);
  expect(addon.eval("return __tracked"), "the game leaves the arrow off; Vanguard turns it on").toBe(true);
  for (let i = 1; i <= 9; i++) click(addon, 12, 0.1 * (i % 9) + 0.05, 0.5);
  click(addon, 12, 0.15, 0.5);
  expect(addon.eval("return #ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).recent"), "eight at most, the repeated spot moved up and not doubled").toBe(8);
  expect(addon.eval("return ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).recent[1].x"), "newest first").toBe(0.15);
  addon.eval("__point = nil");
  addon.fire("USER_WAYPOINT_UPDATED");
  expect(addon.eval("return #ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).recent"), "clearing adds nothing").toBe(8);
});

it("waypoints: with the switch off a map click only remembers; a hidden position is not remembered", () => {
  const addon = loggedIn(MAP_ENV + POINT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Waypoints = { follow = false } } }" });
  click(addon, 10, 0.2, 0.3);
  expect([addon.eval("return __tracked"), addon.eval("return #ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).recent")]).toEqual([false, 1]);
  addon.eval("__point = { 10, __wfgWorld.secret(0.5), 0.5 }");
  addon.fire("USER_WAYPOINT_UPDATED");
  expect(addon.eval("return #ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).recent"), "a secret coordinate is skipped").toBe(1);
});

it("waypoints: /way recent lists the spots and /way recent <n> goes back to one", () => {
  const addon = loggedIn(MAP_ENV + POINT_ENV);
  way(addon, "recent");
  expect(chatHas(addon, /No recent waypoints yet/), "none yet").toBe(true);
  click(addon, 10, 0.2, 0.3);
  click(addon, 12, 0.5, 0.25);
  way(addon, "recent");
  expect([chatHas(addon, /1\. TEST-ONLY Dun Morogh 50\.0, 25\.0/), chatHas(addon, /2\. TEST-ONLY Elwynn Forest 20\.0, 30\.0/)], "newest first").toEqual([true, true]);
  way(addon, "recent 2");
  expect(addon.eval("return { __point[1], __point[2], __point[3] }"), "back to the second").toEqual([10, 0.2, 0.3]);
  expect(chatHas(addon, /Waypoint: TEST-ONLY Elwynn Forest 20\.0, 30\.0/), "and says so").toBe(true);
  way(addon, "recent 7");
  expect(chatHas(addon, /No recent waypoint 7/), "a number past the list").toBe(true);
  addon.eval("ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).recent[1].map = 11");
  way(addon, "recent 1");
  expect(chatHas(addon, /Can't put a waypoint on TEST-ONLY Duskwood/), "a map that can't hold one now").toBe(true);
});

it("waypoints: the options list the spots as buttons, and Clear waypoint takes it and the arrow away", () => {
  const addon = loggedIn(MAP_ENV + POINT_ENV);
  // Each row as "type|label".
  const rows = () => addon.eval("local out = {} for i, r in ipairs(ns.GetModule('Waypoints').Rows()) do out[i] = r[1] .. '|' .. r[2] end return out");
  expect(rows().slice(-1)[0], "no spots yet: a line saying so").toMatch(/^text\|No recent waypoints/);
  click(addon, 10, 0.2, 0.3);
  click(addon, 12, 0.5, 0.25);
  expect(rows().slice(-2), "a button for each, newest first").toEqual(["button|Go to TEST-ONLY Dun Morogh 50.0, 25.0", "button|Go to TEST-ONLY Elwynn Forest 20.0, 30.0"]);
  addon.eval("ns.GetModule('Waypoints').Rows()[6][3]()");
  expect(addon.eval("return __point[1]"), "its button goes back to that spot").toBe(10);
  addon.eval("__tracked = true ns.GetModule('Waypoints').Rows()[3][3]()");
  expect([addon.eval("return __point"), addon.eval("return __tracked")], "Clear waypoint").toEqual([null, false]);
  addon.eval("local r = ns.GetModule('Waypoints').Rows()[2] r[4](false)");
  expect(addon.eval("return ns.Settings('Waypoints', ns.GetModule('Waypoints').defaults).follow"), "the switch").toBe(false);
});

it("waypoints: with OpenMap drawing the world map, the cursor's coordinates step aside and the Map page says so", () => {
  const addon = loggedIn(MAP_ENV + WORLD_MAP_ENV + "C_AddOns.IsAddOnLoaded = function(n) return n == 'OpenMap' end");
  addon.update(0.2);
  expect(addon.eval("return ns.GetModule('Waypoints').mapLine:GetText()"), "your coordinates only").toBe("You 45.7, 12.3");
  // Each row as "type|label".
  const rows = () => addon.eval("local out = {} for i, r in ipairs(ns.GetModule('Waypoints').Rows()) do out[i] = r[1] .. '|' .. r[2] end return out");
  expect(rows().slice(-2), "a card naming OpenMap").toEqual(["header|OpenMap", expect.stringMatching(/^text\|OpenMap is drawing the world map\./)]);
  addon.eval("C_AddOns.IsAddOnLoaded = function() return false end");
  expect(rows(), "without it: no card").not.toContain("header|OpenMap");
});

it("waypoints: the world map has a Clear waypoint button, shown only while there is a waypoint", () => {
  const addon = loggedIn(MAP_ENV + POINT_ENV + WORLD_MAP_ENV);
  // Whether the map's Clear waypoint button shows.
  const shown = () => addon.eval("return ns.GetModule('Waypoints').clearButton:IsShown()");
  addon.update(0.2);
  expect(shown(), "no waypoint, no button").toBe(false);
  click(addon, 10, 0.2, 0.3);
  addon.update(0.2);
  expect(shown(), "a waypoint, a button").toBe(true);
  addon.eval("ns.GetModule('Waypoints').clearButton:GetScript('OnClick')()");
  addon.update(0.2);
  expect([shown(), addon.eval("return __point")], "the click clears it").toEqual([false, null]);
});
