// questguide: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/QuestGuide.lua and QuestGuideMap.lua: the "New" mark from a client flag found at runtime,
// the arrow on a tracked quest's next step, quest-start pins on the world map, and /vg questdata.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY quests: two in the log, both watched; titles by ID; 90051 is flagged new by the
// TEST-ONLY classification below. A classification enum without a new-quest entry is the default.
const QUESTS_ENV = `
  __titles = { [90051] = "TEST-ONLY Wolves", [90052] = "TEST-ONLY Letter", [90071] = "TEST-ONLY Bandits" }
  C_QuestLog.GetTitleForQuestID = function(id) return __titles[id] end
  __wfgWorld.addQuest({ questID = 90051, title = "TEST-ONLY Wolves", level = 8, watched = true, objectives = { { text = "3/8 TEST-ONLY Wolves slain", finished = false } } })
  __wfgWorld.addQuest({ questID = 90052, title = "TEST-ONLY Letter", level = 12, watched = true, objectives = {} })
  Enum.QuestClassification = { Important = 0, Normal = 7 }
  __class = { [90051] = 11, [90071] = 11 }
  C_QuestInfoSystem.GetQuestClassification = function(id) return __class[id] or 7 end
`;
// The TEST-ONLY flag: a classification named for Forever.
const FLAG_ENV = "Enum.QuestClassification.TestOnlyForever = 11\n";

// TEST-ONLY arrow calls, recorded: the game's quest super-tracking and the map's user waypoint.
const ARROW_ENV = `
  __super = {}
  C_SuperTrack = {
    SetSuperTrackedQuestID = function(id) table.insert(__super, id) __tracked = id end,
    GetSuperTrackedQuestID = function() return __tracked end,
    SetSuperTrackedUserWaypoint = function() end,
  }
  __set = {}
  C_Map.CanSetUserWaypointOnMap = function(id) return id == 10 end
  C_Map.SetUserWaypoint = function(p) table.insert(__set, p) end
  C_Map.GetBestMapForUnit = function() return 10 end
  UiMapPoint = { CreateFromCoordinates = function(id, x, y) return { id, x, y } end }
`;

// TEST-ONLY world map, shown on map 10: a 1000 x 700 canvas, the game's offer pins counted in __offers.
const MAP_ENV = `
  WorldMapFrame = CreateFrame("Frame", "WorldMapFrame", UIParent)
  __canvas = CreateFrame("Frame", nil, WorldMapFrame)
  __canvas:SetSize(1000, 700)
  __mapID, __offers, __requested = 10, 0, {}
  WorldMapFrame.GetCanvas = function() return __canvas end
  WorldMapFrame.GetMapID = function() return __mapID end
  WorldMapFrame.OnMapChanged = function() end
  WorldMapFrame.GetNumActivePinsByTemplate = function(_, t) return t == "QuestOfferPinTemplate" and __offers or 0 end
  WorldMapFrame:Hide()
  C_QuestLine = {
    GetAvailableQuestLines = function(id) return id == 10 and {
      { questID = 90071, questName = "TEST-ONLY Bandits", x = 0.5, y = 0.25, isHidden = false },
      { questID = 90072, questName = "TEST-ONLY Hidden", x = 0.1, y = 0.1, isHidden = true },
      { questID = 90073, questName = "TEST-ONLY Secret", x = __wfgWorld.secret(), y = 0.1, isHidden = false } } or {} end,
    RequestQuestLinesForMap = function(id) table.insert(__requested, id) end,
  }
  C_QuestLog.GetQuestsOnMap = function(id) return id == 10 and {
    { questID = 90071, x = 0.5, y = 0.25, isQuestStart = true },
    { questID = 90074, x = 0.2, y = 0.8, isQuestStart = true },
    { questID = 90051, x = 0.6, y = 0.6, isQuestStart = false } } or {} end
`;

// The tracker's blocks: title and lines each.
const tracker = (addon) => addon.eval(`local f, out = Vanguard_QuestTrackerFrame, {}
  for i = 1, f.blocks.used do local b, lines = f.blocks[i], {} for j = 1, b.lines.used do local l = b.lines[j] lines[j] = l.count:GetText() ~= "" and (l.text:GetText() .. " " .. l.count:GetText()) or l.text:GetText() end out[i] = { b.title:GetText(), lines } end
  return out`);

// The New mark as the addon paints it.
const mark = (addon) => addon.eval('return "  " .. ns.Theme.Paint("New", "accent")');

// The pins drawn: [questID, x offset, y offset] each.
const pins = (addon) => addon.eval(`local QG, out = ns.QuestGuide, {}
  for i = 1, QG.pins.used do local p = QG.pins[i] local _, _, _, x, y = p:GetPoint(1) out[i] = { p.start.questID, x, y } end
  return out`);

it("quest guidance: without a client flag nothing is marked; with one, new quests are marked in the tracker, log and dialog", () => {
  const plain = loggedIn(QUESTS_ENV);
  expect([tracker(plain)[0][0], plain.eval("return ns.QuestGuide.Flag()")], "no flag: the title as it was").toEqual(["[8] TEST-ONLY Wolves", false]);
  const addon = loggedIn(QUESTS_ENV + FLAG_ENV);
  addon.update(0);
  const m = mark(addon);
  expect(tracker(addon).map((b) => b[0]), "the tracker: only the flagged quest").toEqual(["[8] TEST-ONLY Wolves" + m, "[12] TEST-ONLY Letter"]);
  addon.slash("quests");
  expect(addon.eval("return { Vanguard_QuestLog.lines[1].text:GetText(), Vanguard_QuestLog.questTitle:GetText() }"), "the log's line and the chosen quest's title").toEqual(["[8] TEST-ONLY Wolves" + m, "[8] TEST-ONLY Wolves" + m]);
  addon.eval(`__wfgWorld.openNpc({ available = { { title = "TEST-ONLY Bandits", questLevel = 10, questID = 90071 } }, active = { { title = "TEST-ONLY Letter", questLevel = 12, questID = 90052 } } })`);
  expect(addon.eval("return { Vanguard_QuestDialog.lines[1].text:GetText(), Vanguard_QuestDialog.lines[2].text:GetText() }"), "the dialog's quest lines").toEqual(["1.  [10] TEST-ONLY Bandits" + m, "2.  [12] TEST-ONLY Letter"]);
  addon.eval(`__wfgWorld.openNpc({ quest = { title = "TEST-ONLY Bandits", questID = 90071, text = "TEST-ONLY" } })`);
  expect(addon.eval("return Vanguard_QuestDialog.title:GetText()"), "a quest's details page").toBe("TEST-ONLY Bandits" + m);
  addon.eval("ns.Settings('QuestGuide').newMark = false ns.GetModule('QuestTracker').Refresh()");
  expect(tracker(addon)[0][0], "the switch turns the mark off").toBe("[8] TEST-ONLY Wolves");
});

it("quest guidance: a quest tag named for new quests works too; hidden values mark nothing", () => {
  const addon = loggedIn(QUESTS_ENV + `
    Enum.QuestTag = { Group = 1, NewInForever = 500 }
    C_QuestLog.GetQuestTagInfo = function(id) if id == 90052 then return { tagID = 500, tagName = "TEST-ONLY" } end if id == 90051 then return { tagID = __wfgWorld.secret() } end end
  `);
  addon.update(0);
  expect(addon.eval("local f = ns.QuestGuide.Flag() return { f.source, f.name, f.value }"), "found in the tag list").toEqual(["tag", "NewInForever", 500]);
  expect(tracker(addon).map((b) => b[0]), "the tagged quest; a hidden tag is no tag").toEqual(["[8] TEST-ONLY Wolves", "[12] TEST-ONLY Letter" + mark(addon)]);
  expect(addon.eval("return { ns.QuestGuide.IsNew(nil), ns.QuestGuide.IsNew('x') }"), "no quest ID").toEqual([false, false]);
  const bare = loggedIn("Enum.QuestClassification = nil Enum.QuestTag = nil");
  expect(bare.eval("return ns.QuestGuide.Flag()"), "a client without those enums").toBe(false);
});

it("quest guidance: Shift-click a tracked quest and the game's quest arrow follows it, with its next step in the tracker", () => {
  const addon = loggedIn(QUESTS_ENV + ARROW_ENV + "C_QuestLog.GetNextWaypointText = function(id) return id == 90052 and 'TEST-ONLY Take the boat' or nil end");
  addon.keys({ shift: true });
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks[2] b.__scripts.OnClick(b, 'LeftButton')");
  addon.update(0);
  expect([addon.eval("return __super"), chatHas(addon, /Arrow: TEST-ONLY Letter\./)], "the game's arrow on the quest, and chat says so").toEqual([[90052], true]);
  const t = tracker(addon);
  expect(t[1], "the next step first under the followed quest").toEqual(["[12] TEST-ONLY Letter", ["> TEST-ONLY Take the boat"]]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[2].lines[1].text.__textColor"), "accent"), "in the accent").toBe(true);
  expect(t[0][1], "the other quest has no step line").toEqual(["TEST-ONLY Wolves slain 3/8"]);
  addon.eval("ns.QuestArrow.Pick()");
  addon.update(0);
  expect(addon.eval("local b = Vanguard_QuestTrackerFrame.blocks return { b[1].edge:IsShown(), b[2].edge:IsShown() }"), "once the arrow picks it up, the followed quest has the accent line down its edge").toEqual([false, true]);
  addon.eval("ns.Settings('QuestGuide').stepLine = false ns.GetModule('QuestTracker').Refresh()");
  expect(tracker(addon)[1][1], "the step line switched off").toEqual({});
  addon.keys({ shift: false });
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks[1] b.__scripts.OnClick(b, 'LeftButton')");
  expect(addon.eval("return #__super"), "a plain click still opens the quest, no arrow").toBe(1);
  addon.eval("ns.Settings('QuestGuide').stepLine = true __tracked = nil ns.QuestGuide.pointed = 90052 C_QuestLog.GetNextWaypointText = function() return __wfgWorld.secret() end ns.GetModule('QuestTracker').Refresh()");
  expect(tracker(addon)[1][1], "a hidden step text shows nothing").toEqual({});
});

it("quest guidance: the waypoint arrow goes to the next waypoint, else the quest's spot here, else the quest arrow", () => {
  const addon = loggedIn(QUESTS_ENV + ARROW_ENV + `
    C_QuestLog.GetNextWaypoint = function(id) if id == 90051 then return 10, 0.25, 0.5 end end
    C_QuestLog.GetQuestsOnMap = function() return { { questID = 90052, x = 0.75, y = 0.5 }, { questID = 90099, x = 0.1, y = 0.1 } } end
  `);
  addon.eval("ns.Settings('QuestGuide').arrow = 'waypoint'");
  addon.eval("ns.QuestGuide.Point(90051) ns.QuestGuide.Point(90052)");
  expect([addon.eval("return __set"), addon.eval("return #__super")], "the next waypoint, then the quest's spot on this map").toEqual([[[10, 0.25, 0.5], [10, 0.75, 0.5]], 0]);
  addon.eval("ns.QuestGuide.Point(90053)");
  expect(addon.eval("return __super"), "no spot: the game's quest arrow instead").toEqual([90053]);
  expect(chatHas(addon, /Arrow: that quest\./), "a quest without a title").toBe(true);
  addon.eval("C_SuperTrack = nil ns.QuestGuide.Point(90053)");
  expect(chatHas(addon, /The game can't point the arrow at that quest from here\./), "neither works: says so").toBe(true);
  addon.eval("ns.Settings('QuestGuide').arrow = 'quest' C_QuestLog.GetNextWaypoint = function() return __wfgWorld.secret(), 0.1, 0.1 end C_Map.GetBestMapForUnit = function() return nil end ns.QuestGuide.Point(90051)");
  expect(addon.eval("return #__set"), "hidden or missing spots set nothing").toBe(2);
});

it("quest guidance: quest-start pins on the world map, unless the game shows its own or Questie is loaded", () => {
  const addon = loggedIn(QUESTS_ENV + ARROW_ENV + MAP_ENV + CLICK_LUA);
  addon.eval("WorldMapFrame:Show()");
  addon.update(0);
  expect([pins(addon), addon.eval("return __requested")], "starts from quest lines and quest spots, once each; hidden ones left out").toEqual([[[90071, 500, -175], [90074, 200, -560]], [10]]);
  expect(addon.eval("local i = ns.QuestGuide.pins[1].icon local r, g, b = i:GetVertexColor() return { i:GetTexture(), r, g, b }"), "Vanguard's \"!\" in the theme's gold")
    .toEqual(addon.eval('local r, g, b = ns.Theme.RGB("gold") return { ns.QuestParts.ICONS.available, r, g, b }'));
  addon.eval("local p = ns.QuestGuide.pins[1] p.__scripts.OnEnter(p)");
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "the tooltip").toEqual(["TEST-ONLY Bandits", addon.eval('return ns.Theme.Paint("Quest starts here. Click: point the arrow here", "text2")')]);
  addon.eval("local p = ns.QuestGuide.pins[2] p.__scripts.OnEnter(p) p.__scripts.OnLeave(p) p.__scripts.OnClick(p, 'LeftButton')");
  expect([addon.eval("return GameTooltip.__lines[1].text"), addon.eval("return __set"), chatHas(addon, /Arrow: quest start\./)], "an unnamed start; a click puts a waypoint on it").toEqual(["Quest start", [[10, 0.2, 0.8]], true]);
  addon.eval("local p = ns.QuestGuide.pins[1] p.__scripts.OnClick(p, 'LeftButton') p.start = nil p.__scripts.OnEnter(p)");
  expect(chatHas(addon, /Arrow: TEST-ONLY Bandits\./), "a named start").toBe(true);
  addon.eval("__offers = 3 WorldMapFrame:OnMapChanged()");
  addon.update(0);
  expect(pins(addon), "the game's own offers show: no Vanguard pins").toEqual({});
  addon.eval("__offers = 0 __mapID = 11 WorldMapFrame:OnMapChanged()");
  addon.update(0);
  expect(pins(addon), "a map without starts").toEqual({});
  addon.eval("__mapID = 10 ns.QuestGuide.MAX_PINS = 1");
  addon.fire("QUESTLINE_UPDATE");
  addon.update(0);
  expect(pins(addon).length, "at most MAX_PINS").toBe(1);
  addon.eval('ns.Options.Show("quests") __click("Quest-start pins on the world map")');
  addon.update(0);
  expect([addon.eval("return ns.Settings('QuestGuide').pins"), pins(addon)], "the switch off").toEqual([false, {}]);
  addon.eval("ns.Settings('QuestGuide').pins = true C_AddOns.IsAddOnLoaded = function(n) return n == 'Questie' end ns.QuestGuide.RefreshPins()");
  expect(pins(addon), "Questie loaded: its own pins, not Vanguard's").toEqual({});
  addon.eval("C_AddOns.IsAddOnLoaded = function(n) return n == 'OpenMap' end ns.QuestGuide.RefreshPins()");
  expect(pins(addon), "OpenMap loaded: its canvas isn't the zone, so no Vanguard pins").toEqual({});
  addon.eval("WorldMapFrame:Hide() C_AddOns.IsAddOnLoaded = function() return false end ns.QuestGuide.MapChanged()");
  addon.update(0);
  expect(addon.eval("return ns.QuestGuide.pins.used"), "the map closed: nothing redrawn").toBe(0);
});

it("quest guidance: the quest-line answer and quest log changes redraw the pins without asking again", () => {
  const addon = loggedIn(QUESTS_ENV + ARROW_ENV + MAP_ENV + CLICK_LUA);
  addon.eval("WorldMapFrame:Show()");
  addon.update(0);
  addon.eval("ns.QuestGuide.MAX_PINS = 1");
  for (const event of ["QUESTLINE_UPDATE", "QUEST_LOG_UPDATE", "QUEST_POI_UPDATE"]) addon.fire(event);
  addon.update(0);
  expect([addon.eval("return __requested"), pins(addon).length], "one request, from opening the map; the events only redraw").toEqual([[10], 1]);
});

it("quest guidance: a world map that loads after login is followed then; one without a canvas is left alone", () => {
  const addon = loggedIn(QUESTS_ENV);
  expect(addon.eval("return ns.QuestGuide.pins"), "no map yet").toBe(null);
  addon.eval(MAP_ENV);
  addon.fire("ADDON_LOADED", "TEST-ONLY Other");
  addon.fire("ADDON_LOADED", "Blizzard_WorldMap");
  addon.eval("WorldMapFrame:Show()");
  addon.update(0);
  expect(pins(addon).map((p) => p[0]), "pins once it loads").toEqual([90071, 90074]);
  const bare = loggedIn("WorldMapFrame = CreateFrame('Frame', 'WorldMapFrame', UIParent)");
  expect(bare.eval("return ns.QuestGuide.pins"), "a map without a canvas: no pins").toBe(null);
});

it("quest guidance: /vg questdata says whether the client flags new quests, and what it says about quests", () => {
  const addon = loggedIn(QUESTS_ENV + FLAG_ENV + "C_QuestLog.GetQuestTagInfo = function(id) if id == 90051 then return { tagID = 1, tagName = 'TEST-ONLY Group', worldQuestType = __wfgWorld.secret() } end end");
  addon.clearChat();
  addon.slash("questdata 90051");
  const lines = Array.from(addon.chat());
  expect(lines.some((l) => l.endsWith("New-quest flag: classification TestOnlyForever.")), "the flag found").toBe(true);
  const q = lines.find((l) => l.includes("Quest 90051:"));
  expect(q, "classification, tag and log fields, a hidden one named").toMatch(/Quest 90051: classification 11; tag tagID=1 tagName=TEST-ONLY Group worldQuestType=hidden; log .*questID=90051 .*title=TEST-ONLY Wolves/);
  const plain = loggedIn(QUESTS_ENV);
  plain.eval(`__wfgWorld.openNpc({ available = { { title = "TEST-ONLY Bandits", questLevel = 10, questID = 90071 }, { title = "TEST-ONLY No ID", questLevel = 10 } } })`);
  plain.clearChat();
  plain.slash("questdata");
  const out = Array.from(plain.chat());
  expect(out.some((l) => l.endsWith("New-quest flag: none on this client (no quest classification or tag named Forever or New).")), "no flag").toBe(true);
  expect(out.filter((l) => l.includes("Offered: ")).length, "each offered quest's own fields").toBe(2);
  expect(out.filter((l) => /Quest 9005[12]: classification \d+; tag none; log /.test(l)).length, "the tracked quests").toBe(2);
  expect(out.some((l) => /Quest 90071: classification 11; tag none; log none/.test(l)), "an offered quest not in the log").toBe(true);
});

it("quest guidance: switched off, the tracker's Shift-click opens the quest and nothing is marked or pinned", () => {
  const addon = loggedIn(QUESTS_ENV + FLAG_ENV + ARROW_ENV + MAP_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { modules = { QuestGuide = false } } }" });
  addon.keys({ shift: true });
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks[1] b.__scripts.OnClick(b, 'LeftButton')");
  expect([addon.eval("return #__super"), tracker(addon)[0][0], addon.eval("return ns.QuestGuide.pins")], "no arrow, no mark, no pins").toEqual([0, "[8] TEST-ONLY Wolves", null]);
  addon.eval('ns.Options.Show("quests") __click("Quest-start pins on the world map") __click("New mark on quests")');
  expect(addon.eval("return { ns.Settings('QuestGuide').pins, ns.Settings('QuestGuide').newMark }"), "the switches still save").toEqual([false, false]);
});

// W4-C-4: a shift-clicked quest link carries a colour code whose digits come before the quest's ID.
it("quest guidance: /vg questdata reads the quest's ID from a quest link, not its colour code", () => {
  const addon = loggedIn(QUESTS_ENV);
  addon.clearChat();
  addon.slash("questdata |cffffff00|Hquest:90051:10|h[TEST-ONLY Wolves]|h|r");
  expect(addon.chat().filter((l) => /Quest \d+:/.test(l)).map((l) => l.match(/Quest (\d+):/)[1])).toEqual(["90051"]);
});
