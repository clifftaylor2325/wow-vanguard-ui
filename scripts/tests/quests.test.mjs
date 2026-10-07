// quests: Vanguard's quest tracker and quest log, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { UNITS_ENV, chatHas, isTok, key, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY watched quests: wolves (one objective left, a usable item, 400 away), a letter ready
// to turn in (100 away), and a far one whose distance the client hides.
const TRACK_ENV = `
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then return end local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  ObjectiveTrackerFrame = CreateFrame("Frame", "ObjectiveTrackerFrame", UIParent)
  __watches = { 90051, 90052, 90053 }
  __quests = {
    [90051] = { index = 1, title = "TEST-ONLY Wolves", level = 8, dist = 400, item = "item:90061",
      objectives = { { text = "3/8 TEST-ONLY Wolves slain", finished = false }, { text = "1/1 TEST-ONLY Pelt", finished = true } } },
    [90052] = { index = 2, title = "TEST-ONLY Letter", level = 12, ready = true, dist = 100, objectives = {} },
    [90053] = { index = 3, title = "TEST-ONLY Far", level = 3, dist = { __secret = true }, objectives = { { text = "0/1 TEST-ONLY Stone", finished = false } } },
  }
  function __index(i) for id, q in pairs(__quests) do if q.index == i then return id end end end
  C_QuestLog = {
    GetNumQuestWatches = function() return #__watches end,
    GetQuestIDForQuestWatchIndex = function(i) return __watches[i] end,
    GetLogIndexForQuestID = function(id) return __quests[id] and __quests[id].index end,
    GetInfo = function(i) local q = __quests[__index(i)] return q and { title = q.title, level = q.level } end,
    ReadyForTurnIn = function(id) return __quests[id].ready == true end,
    IsComplete = function() return false end,
    GetQuestObjectives = function(id) return __quests[id].objectives end,
    GetDistanceSqToQuest = function(id) return __quests[id].dist end,
    RemoveQuestWatch = function(id) __removed = id end,
  }
  GetQuestLogSpecialItemInfo = function(i) local q = __quests[__index(i)] if q.item then return q.item, "TEST-ONLY-ICON" end end
  QuestMapFrame_OpenToQuestDetails = function(id) __opened = id end
  GetQuestDifficultyColor = function(level) return { r = level > 10 and 1 or 0.25, g = 0.75, b = 0.25 } end
`;

// The tracker: shown, count, each shown block's title and lines, and the "+N more" line.
const tracker = (addon) => addon.eval(`local f = Vanguard_QuestTrackerFrame
  local blocks = {}
  for i = 1, f.blocks.used do
    local b, lines = f.blocks[i], {}
    for j = 1, b.lines.used do lines[j] = b.lines[j]:GetText() end
    blocks[i] = { b.title:GetText(), lines }
  end
  return { shown = f:IsShown(), count = f.count:GetText(), blocks = blocks, more = f.more:IsShown() and f.more:GetText() or false }`);

it("quest tracker: watched quests with levels, objectives and items", () => {
  const addon = loggedIn(TRACK_ENV);
  const t = tracker(addon);
  expect([t.shown, t.count, t.more], "shown with the count").toEqual([true, "3", false]);
  expect(t.blocks, "each quest with its level, its objectives, or ready to turn in").toEqual([
    ["[8] TEST-ONLY Wolves", ["- 3/8 TEST-ONLY Wolves slain", "- 1/1 TEST-ONLY Pelt"]], ["[12] TEST-ONLY Letter", ["Ready to turn in"]], ["[3] TEST-ONLY Far", ["- 0/1 TEST-ONLY Stone"]]]);
  const colors = addon.eval("local b = Vanguard_QuestTrackerFrame.blocks return { b[1].lines[1].__textColor, b[1].lines[2].__textColor, b[2].lines[1].__textColor, b[2].title.__textColor }");
  expect([isTok(addon, colors[0], "text2"), isTok(addon, colors[1], "good"), isTok(addon, colors[2], "good"), colors[3][0]], "done objectives in green, the title in its difficulty color").toEqual([true, true, true, 1]);
  expect(addon.eval("return { ObjectiveTrackerFrame:IsShown(), ObjectiveTrackerFrame:GetParent() == UIParent, Vanguard_QuestTrackerFrame:GetParent() == Vanguard_QuestTracker }"), "the game's tracker is hidden in place; this one sits in the tracker's spot").toEqual([false, true, true]);
  expect(addon.eval(`local b = Vanguard_QuestItem1 return { b:GetAttribute("type"), b:GetAttribute("item"), b.__points.TOPRIGHT.rel == Vanguard_QuestTrackerFrame.blocks[1], b:IsShown() }`), "the wolves' item, beside its quest").toEqual(["item", "item:90061", true, true]);
  setCombat(addon, true);
  addon.eval("__quests[90051].item = nil");
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(addon.eval("return Vanguard_QuestItem1:IsShown()"), "in combat the item buttons wait").toBe(true);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_QuestItem1:IsShown()"), "and update after").toBe(false);
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks b[2].__scripts.OnClick(b[2], 'RightButton') b[1].__scripts.OnClick(b[1], 'LeftButton')");
  expect(addon.eval("return { __removed, Vanguard_QuestLog:IsShown(), ns.GetModule('QuestLog').selected }"), "right-click stops watching; left-click opens the quest in the quest log").toEqual([90052, true, 90051]);
  const noLog = loggedIn(TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestLog = { own = false } } }" });
  noLog.eval("local b = Vanguard_QuestTrackerFrame.blocks[1] b.__scripts.OnClick(b, 'LeftButton')");
  expect(noLog.eval("return __opened"), "with Vanguard's quest log off, the game's map opens it").toBe(90051);
});

// TEST-ONLY quest item extras: the game's cooldown and range answers by log index (__cd, __range), and the tooltip call.
const ITEM_ENV = `
  __cd, __range = {}, {}
  GetQuestLogSpecialItemCooldown = function(i) local c = __cd[i] if c then return c[1], c[2], 1 end return 0, 0, 1 end
  IsQuestLogSpecialItemInRange = function(i) return __range[i] end
  GameTooltip.SetOwner = function(self, owner) self.__owner = owner end
  GameTooltip.SetQuestLogSpecialItem = function(self, i) self.__special = i end
`;

// Each item button: the quest it is for, whether it shows, and the title of the block it sits beside.
const questItems = (addon) => addon.eval(`local out = {}
  for i, b in ipairs(ns.GetModule("QuestTracker").items) do
    out[i] = { b.questID or false, b:IsShown(), b:IsShown() and b.__points.TOPRIGHT.rel.title:GetText() or false }
  end
  return out`);

// The tracker's block titles, top to bottom.
const blockTitles = (addon) => tracker(addon).blocks.map((b) => b[0]);

it("quest tracker: with Questie loaded, Questie's tracker shows instead unless Vanguard's is picked", () => {
  const QUESTIE = 'C_AddOns.IsAddOnLoaded = function(name) return name == "Vanguard" or name == "Questie" end\n';
  const questie = loggedIn(QUESTIE + TRACK_ENV);
  expect([questie.eval("return Vanguard_QuestTrackerFrame == nil"), questie.eval("return ns.GetModule('MenuStrip').OwnTracker()")], "Questie's tracker has the job: Vanguard's isn't built, and the game's isn't hidden").toEqual([true, false]);
  const ours = loggedIn(QUESTIE + TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { withQuestie = 'vanguard' } } }" });
  expect([tracker(ours).shown, ours.eval("return ns.GetModule('MenuStrip').OwnTracker()")], "Vanguard's picked: it shows as usual").toEqual([true, true]);
  const without = loggedIn(TRACK_ENV);
  expect(tracker(without).shown, "no Questie: Vanguard's shows").toBe(true);
});

it("quest tracker: each quest keeps its own item button; in combat counts update and the items wait", () => {
  const addon = loggedIn(TRACK_ENV);
  addon.eval("__quests[90054] = { index = 4, title = 'TEST-ONLY Boar', level = 9, dist = 50, item = 'item:90062', objectives = {} } __watches[4] = 90054");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  expect(questItems(addon), "the wolves' item and the boar's, each beside its quest").toEqual([[90051, true, "[8] TEST-ONLY Wolves"], [90054, true, "[9] TEST-ONLY Boar"]]);
  addon.eval("__watches = { 90052, 90053, 90054 }");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  expect(questItems(addon), "the wolves go: their button is free, and the boar keeps its own, beside its block").toEqual([[false, false, false], [90054, true, "[9] TEST-ONLY Boar"]]);
  addon.eval("__watches = { 90052, 90053, 90054, 90051 }");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  expect(questItems(addon), "the wolves back: they take the free button, the boar keeps its own").toEqual([[90051, true, "[8] TEST-ONLY Wolves"], [90054, true, "[9] TEST-ONLY Boar"]]);
  expect(blockTitles(addon), "the blocks as watched").toEqual(["[12] TEST-ONLY Letter", "[3] TEST-ONLY Far", "[9] TEST-ONLY Boar", "[8] TEST-ONLY Wolves"]);
  setCombat(addon, true);
  const waiting = addon.eval("return ns.QueuedCount()");
  addon.eval("__rels = { ns.GetModule('QuestTracker').items[1].__points.TOPRIGHT.rel, ns.GetModule('QuestTracker').items[2].__points.TOPRIGHT.rel }");
  addon.eval("__watches = { 90053, 90054, 90051 } __quests[90051].objectives[1].text = '5/8 TEST-ONLY Wolves slain'");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  for (let i = 0; i < 5; i++) addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect([blockTitles(addon), tracker(addon).blocks[2][1][0]], "in combat the tracker redraws: the letter is gone and the wolves' count is up").toEqual([["[3] TEST-ONLY Far", "[9] TEST-ONLY Boar", "[8] TEST-ONLY Wolves"], "- 5/8 TEST-ONLY Wolves slain"]);
  const anchors = "local items = ns.GetModule('QuestTracker').items return { items[1].__points.TOPRIGHT.rel == __rels[1], items[2].__points.TOPRIGHT.rel == __rels[2], ns.QueuedCount() }";
  expect(addon.eval(anchors).map((v, k) => (k === 2 ? v - waiting : v)), "the item buttons keep their anchors, and one placement waits").toEqual([true, true, 1]);
  setCombat(addon, false);
  expect([addon.eval(anchors).slice(0, 2), questItems(addon)], "after combat they move beside the right blocks").toEqual([
    [false, false], [[90051, true, "[8] TEST-ONLY Wolves"], [90054, true, "[9] TEST-ONLY Boar"]]]);
});

it("quest tracker: an item shows its cooldown and range, and the game's tooltip", () => {
  const addon = loggedIn(TRACK_ENV + ITEM_ENV);
  // The first item button's cooldown (start, duration), or nil when none runs.
  const cooldown = () => addon.eval("return Vanguard_QuestItem1.cooldown.__cooldown");
  expect(cooldown(), "no cooldown running: nothing drawn").toBeFalsy();
  addon.eval("__cd[1] = { 500, 30 }");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(cooldown(), "the game's cooldown for the quest item's log index").toEqual([500, 30]);
  addon.eval("__cd[1] = { 0, 0 }");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(cooldown(), "over: cleared").toBeFalsy();
  addon.eval("__cd[1] = { { __secret = true }, { __secret = true } }");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(cooldown().map((v) => v.__secret), "hidden numbers go to the widget untouched").toEqual([true, true]);
  setCombat(addon, true);
  addon.eval("__cd[1] = { 600, 10 }");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(cooldown(), "the cooldown follows in combat too").toEqual([600, 10]);
  setCombat(addon, false);
  addon.eval("GetQuestLogSpecialItemCooldown = nil");
  addon.fire("BAG_UPDATE_COOLDOWN");
  expect(cooldown(), "a client without the call: cleared").toBeFalsy();
  // Whether the item's icon is tinted as out of range.
  const red = () => isTok(addon, addon.eval("return Vanguard_QuestItem1.icon.__vertexColor"), "outOfRange");
  addon.update(0.01);
  expect(red(), "a fresh item is not tinted").toBe(false);
  addon.eval("__range[1] = 0");
  addon.update(0.1);
  expect(red(), "the range is checked a few times a second, not every frame").toBe(false);
  addon.update(0.2);
  expect(red(), "out of range (0): the icon goes red").toBe(true);
  addon.eval("__range[1] = 1");
  addon.update(0.3);
  expect(red(), "back in range (1): normal").toBe(false);
  addon.eval("__range[1] = { __secret = true }");
  addon.update(0.3);
  expect(red(), "a hidden answer is never taken as out of range").toBe(false);
  addon.eval("local b = Vanguard_QuestItem1 b.__scripts.OnEnter(b)");
  expect(addon.eval("return { GameTooltip.__special, GameTooltip.__owner == Vanguard_QuestItem1, GameTooltip:IsShown() }"), "hovering shows the game's tooltip for the quest item's log index").toEqual([1, true, true]);
  addon.eval("local b = Vanguard_QuestItem1 b.__scripts.OnLeave(b)");
  expect(addon.eval("return GameTooltip:IsShown()"), "and leaving hides it").toBe(false);
  addon.eval("GameTooltip.__special = nil Vanguard_QuestItem1.questID = 90099 Vanguard_QuestItem1.__scripts.OnEnter(Vanguard_QuestItem1)");
  expect(addon.eval("return GameTooltip.__special"), "an item whose quest has left the log shows no tooltip").toBeFalsy();
  addon.eval("Vanguard_QuestItem1.questID = 90051 GameTooltip.SetQuestLogSpecialItem = nil Vanguard_QuestItem1.__scripts.OnEnter(Vanguard_QuestItem1)");
  expect(addon.eval("return GameTooltip.__special"), "a client without the tooltip call shows none").toBeFalsy();
});

it("quest tracker: nearest first, collapsing, too many quests, and switched off", () => {
  const addon = loggedIn(UNITS_ENV + TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { order = 'nearest' } } }" });
  addon.eval("__wfgStub.advance(1.25)");
  expect(tracker(addon).blocks.map((b) => b[0]), "nearest first; a distance the client hides goes last").toEqual(["[12] TEST-ONLY Letter", "[8] TEST-ONLY Wolves", "[3] TEST-ONLY Far"]);
  addon.eval("local t = Vanguard_QuestTrackerFrame.toggle t.__scripts.OnClick(t)");
  expect([Object.keys(tracker(addon).blocks).length, addon.eval("return Vanguard_QuestTrackerFrame.body:IsShown()"), addon.eval("return Vanguard_QuestTrackerFrame.toggle.icon.__texture:match('Right') ~= nil")], "collapsed: just the header").toEqual([0, false, true]);
  addon.eval(`local t = Vanguard_QuestTrackerFrame.toggle t.__scripts.OnClick(t)
    for i = 1, 6 do local id = 90070 + i __quests[id] = { index = 10 + i, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = { { text = "a" }, { text = "b" }, { text = "c" } } } __watches[#__watches + 1] = id end`);
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  const t = tracker(addon);
  expect([t.count, t.more], "more than fit: the rest are counted").toEqual(["9", `+${9 - t.blocks.length} more`]);
  addon.eval("__watches = {}");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  expect(tracker(addon).shown, "nothing watched, nothing shown").toBe(false);
  const own = loggedIn(TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { MenuStrip = { tracker = false } } }" });
  expect(own.eval("return { Vanguard_QuestTrackerFrame:GetParent():GetName(), (ns.MoverPoint('questtracker')) }"), "with the menu strip's spot off, it makes its own").toEqual(["Vanguard_QuestTracker", "TOPRIGHT"]);
  const off = loggedIn(TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { own = false } } }" });
  expect(off.eval("return { Vanguard_QuestTrackerFrame == nil, ObjectiveTrackerFrame:IsShown() }"), "switched off: the game's tracker").toEqual([true, true]);
});

// TEST-ONLY quest log: two zones (the wolves and the letter in one, the far quest in the other),
// a hidden entry; the wolves are watched and give boots (a choice) and bread.
const QLOG_ENV = `
  UISpecialFrames = {}
  __quests[90051].index, __quests[90052].index, __quests[90053].index = 2, 3, 5
  __log = { { isHeader = true, title = "TEST-ONLY Vale" }, { questID = 90051 }, { questID = 90052 }, { isHeader = true, title = "TEST-ONLY Hills" }, { questID = 90053 }, { questID = 90054, isHidden = true } }
  C_QuestLog.GetNumQuestLogEntries = function() return #__log end
  C_QuestLog.GetInfo = function(i) local e = __log[i] local q = e and e.questID and __quests[e.questID]
    if q then return { questID = e.questID, title = q.title, level = q.level } end return e end
  __watched, __group, __overrides, __owners = { [90051] = 0 }, false, {}, {}
  C_QuestLog.SetSelectedQuest = function(id) __selected = id end
  C_QuestLog.GetQuestWatchType = function(id) return __watched[id] end
  C_QuestLog.AddQuestWatch = function(id) __added = id end
  C_QuestLog.IsPushableQuest = function() return true end
  C_QuestLog.SetAbandonQuest = function() __abandoning = __selected end
  IsInGroup = function() return __group end
  StaticPopup_Show = function(which, text) __popup = which .. " " .. text end
  QuestLogPushQuest = function() __pushed = __selected end
  GetQuestLogQuestText = function() return "TEST-ONLY About " .. __selected end
  GetNumQuestLogChoices = function(id) return id == 90051 and 1 or 0 end
  GetQuestLogChoiceInfo = function() return "TEST-ONLY Boots", "TEST-ONLY-ICON", 1, 3 end
  GetNumQuestLogRewards = function(id) return id == 90051 and 1 or 0 end
  GetQuestLogRewardInfo = function() return "TEST-ONLY Bread", "TEST-ONLY-ICON", 5, 1 end
  GetQuestLogRewardMoney = function() return 1200 end
  GetQuestLogRewardXP = function() return 450 end
  C_Item = { GetItemQualityColor = function() return 0, 0.44, 0.87 end }
  __keys = { "L", "SHIFT-L" }
  GetBindingKey = function(action) if action == "TOGGLEQUESTLOG" then return unpack(__keys) end end
  ClearOverrideBindings = function(owner) for k in pairs(__overrides) do if __owners[k] == owner then __overrides[k] = nil end end end
  SetOverrideBindingClick = function(owner, _, key, name, button) __overrides[key] = name .. ":" .. (button or "LeftButton") __owners[key] = owner end
`;

// The quest log: shown, count, list lines, and the chosen quest's details and buttons.
const questLog = (addon) => addon.eval(`local f = Vanguard_QuestLog
  local lines, cards = {}, {}
  for i = 1, f.lines.used do lines[i] = f.lines[i].text:GetText() end
  for i = 1, f.cards.used do cards[i] = f.cards[i].name:GetText() end
  local b = f.buttons
  return { shown = f:IsShown(), count = f.count:GetText(), lines = lines, detail = f.detail:IsShown(),
    title = f.questTitle:GetText(), text = f.text:GetText(), objectives = f.objectives:GetText(), cards = cards, money = f.money:GetText(),
    track = b.track:IsShown() and b.track.text:GetText() or false, share = b.share:IsEnabled() }`);

// Clicks a quest log line, or one of its buttons.
const logLine = (addon, i) => addon.eval(`local b = Vanguard_QuestLog.lines[${i}] b.__scripts.OnClick(b)`);

// Clicks one of the quest log's buttons by key.
const logButton = (addon, key) => addon.eval(`local b = Vanguard_QuestLog.buttons.${key} b.__scripts.OnClick(b)`);

it("quest log: zones, a quest's details, and its buttons", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  expect(addon.eval("return __overrides"), "the game's quest log keys open this log").toEqual({ L: "Vanguard_QuestLogToggle:LeftButton", "SHIFT-L": "Vanguard_QuestLogToggle:LeftButton" });
  addon.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  let q = questLog(addon);
  expect([q.shown, q.count, q.lines], "your quests under their zones (hidden ones left out)").toEqual([true, "3 quests", ["TEST-ONLY Vale", "[8] TEST-ONLY Wolves", "[12] TEST-ONLY Letter", "TEST-ONLY Hills", "[3] TEST-ONLY Far"]]);
  expect([q.title, q.text, q.objectives, q.cards, q.money, q.track, q.share], "the first quest, chosen: text, objectives, rewards; watched; nobody to share with").toEqual([
    "[8] TEST-ONLY Wolves", "TEST-ONLY About 90051", "Objectives\n- 3/8 TEST-ONLY Wolves slain\n+ 1/1 TEST-ONLY Pelt", ["TEST-ONLY Boots", "TEST-ONLY Bread"], "+12s 0c  ·  450 XP", "Untrack", false]);
  logButton(addon, "track");
  logLine(addon, 3);
  logButton(addon, "track");
  expect([addon.eval("return { __removed, __added }"), questLog(addon).title], "Untrack the wolves; choose the letter and Track it").toEqual([[90051, 90052], "[12] TEST-ONLY Letter"]);
  expect(addon.eval("local l = Vanguard_QuestLog.lines return { l[3].mark:IsShown(), l[2].mark:IsShown(), l[1].mark:IsShown() }"), "the chosen quest's line is marked").toEqual([true, false, false]);
  addon.eval("__group = true");
  logLine(addon, 3);
  logButton(addon, "share"); logButton(addon, "abandon"); logButton(addon, "map");
  expect(addon.eval("return { __pushed, __abandoning, __popup, __opened }"), "Share; Abandon through the game's own confirmation; Map").toEqual([90052, 90052, "ABANDON_QUEST TEST-ONLY Letter", 90052]);
  logLine(addon, 1);
  expect(questLog(addon).lines, "a zone folds its quests away").toEqual(["TEST-ONLY Vale", "TEST-ONLY Hills", "[3] TEST-ONLY Far"]);
  addon.eval("Vanguard_QuestLog.listScroll.__scripts.OnMouseWheel(Vanguard_QuestLog.listScroll, -1) ns.GetModule('QuestLog').Select(90099)");
  expect([questLog(addon).detail, questLog(addon).track], "a quest gone from the log: nothing chosen").toEqual([false, false]);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(questLog(addon).title, "the log's next update chooses the first quest showing").toBe("[3] TEST-ONLY Far");
});

// The quest log's two scroll areas: each child's height, how far it scrolls, and where it is.
const logScrolls = (addon) => addon.eval(`local f = Vanguard_QuestLog
  return { list = { f.list:GetHeight(), f.listScroll:GetVerticalScrollRange(), f.listScroll:GetVerticalScroll() },
    detail = { f.detail:GetHeight(), f.detailScroll:GetVerticalScrollRange(), f.detailScroll:GetVerticalScroll() } }`);

// Turns one of the quest log's scroll areas ("listScroll" or "detailScroll") by one wheel step of this delta.
const wheelLog = (addon, which, delta) => addon.eval(`local s = Vanguard_QuestLog.${which} s.__scripts.OnMouseWheel(s, ${delta})`);

it("quest log: a long list and long quest text scroll, a short one does not", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  expect(addon.eval("local c = ns.GetModule('QuestLog').frame.close return { c:GetWidth(), c:GetHeight(), c:IsVisible() }"), "the close button has a size (it was 0 by 0, so it never showed)").toEqual([20, 20, true]);
  expect(logScrolls(addon), "five lines and a short text fit the 356 px views: nothing to scroll").toEqual({ list: [356, 0, 0], detail: [356, 0, 0] });
  addon.eval(`for i = 1, 20 do local id = 91000 + i
    __log[#__log + 1] = { questID = id }
    __quests[id] = { index = #__log, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = {} } end
    GetQuestLogQuestText = function() return "TEST-ONLY " .. string.rep("word ", 300) end`);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(logScrolls(addon), "25 lines of 20 px make the list 500 px; the wolves' 1510 characters, objectives, a row of rewards and the money line make the details 516 px").toEqual({ list: [500, 144, 0], detail: [516, 160, 0] });
  wheelLog(addon, "listScroll", -1);
  expect(logScrolls(addon).list[2], "the wheel scrolls the list a step").toBe(24);
  wheelLog(addon, "listScroll", -50);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(logScrolls(addon).list[2], "it stops at the end of the list, and a redraw keeps the place").toBe(144);
  logLine(addon, 4);
  expect(logScrolls(addon).list, "folding the Hills away shortens the list; the scroll comes back inside it").toEqual([356, 0, 0]);
  wheelLog(addon, "detailScroll", -3);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(logScrolls(addon).detail, "the details scroll too, and the same quest redrawn keeps its place").toEqual([516, 160, 72]);
  logLine(addon, 3);
  expect(logScrolls(addon).detail, "another quest starts at the top, with its own height (no objectives or rewards)").toEqual([434, 78, 0]);
  wheelLog(addon, "detailScroll", -100);
  expect(logScrolls(addon).detail[2], "the wheel stops at the end of the details").toBe(78);
});

// TEST-ONLY counters: how often the tracker and the quest log rebuild (__rebuilds.tracker, __rebuilds.log).
const COUNT_REBUILDS = `__rebuilds = { tracker = 0, log = 0 }
  local QT, QL = ns.GetModule("QuestTracker"), ns.GetModule("QuestLog")
  local tracker, log = QT.Refresh, QL.Refresh
  QT.Refresh = function(...) __rebuilds.tracker = __rebuilds.tracker + 1 return tracker(...) end
  QL.Refresh = function(...) __rebuilds.log = __rebuilds.log + 1 return log(...) end`;

// The rebuilds counted since the last look (then forgets them).
const rebuilds = (addon) => addon.eval("local r = __rebuilds __rebuilds = { tracker = 0, log = 0 } return r");

it("quest bursts: many quest log updates in one frame rebuild the tracker and the open log once", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval(COUNT_REBUILDS);
  for (let i = 0; i < 20; i++) addon.fire("QUEST_LOG_UPDATE");
  expect(rebuilds(addon), "nothing rebuilds within the frame of the burst (the log is closed)").toEqual({ tracker: 0, log: 0 });
  addon.eval("__quests[90051].title = 'TEST-ONLY Wolves, renamed'");
  addon.update(0);
  expect([rebuilds(addon), addon.eval("return Vanguard_QuestTrackerFrame.blocks[1].title:GetText()")], "the next frame: one tracker rebuild, with the news").toEqual([{ tracker: 1, log: 0 }, "[8] TEST-ONLY Wolves, renamed"]);
  addon.eval("ns.GetModule('QuestLog').Open()");
  rebuilds(addon);
  for (let i = 0; i < 20; i++) addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  addon.update(0);
  expect(rebuilds(addon), "with the log open: one rebuild of each").toEqual({ tracker: 1, log: 1 });
  addon.fire("QUEST_LOG_UPDATE");
  addon.eval("Vanguard_QuestLog:Hide()");
  addon.update(0);
  expect(rebuilds(addon).log, "a log closed before the next frame isn't re-rendered").toBe(0);
});

it("quest tracker: the nearest-first sort ticks only while that order is on", () => {
  const addon = loggedIn(TRACK_ENV);
  // Whether the tracker has its sort ticker (an OnUpdate script).
  const ticking = () => addon.eval("return Vanguard_QuestTrackerFrame:GetScript('OnUpdate') ~= nil");
  expect(ticking(), "in the game's order, no sort ticker").toBe(false);
  addon.eval("ns.GetModule('QuestTracker').settings.order = 'nearest' ns.GetModule('QuestTracker').ApplyOrder()");
  expect([ticking(), addon.eval("return Vanguard_QuestTrackerFrame.blocks[1].title:GetText()")], "nearest first: it ticks, and the tracker is re-sorted at once").toEqual([true, "[12] TEST-ONLY Letter"]);
  addon.eval("ns.GetModule('QuestTracker').settings.order = 'game' ns.GetModule('QuestTracker').ApplyOrder()");
  expect([ticking(), addon.eval("return Vanguard_QuestTrackerFrame.blocks[1].title:GetText()")], "back to the game's order: no ticker, the game's order").toEqual([false, "[8] TEST-ONLY Wolves"]);
});

it("quest log: keys follow rebinding, /vg quests, closing, and switched off", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval('__keys = { "K" }');
  addon.fire("UPDATE_BINDINGS");
  expect(addon.eval("return __overrides"), "a new key for the quest log moves with it").toEqual({ K: "Vanguard_QuestLogToggle:LeftButton" });
  addon.slash("quests");
  expect(addon.eval("return Vanguard_QuestLog:IsShown()"), "/vg quests opens it").toBe(true);
  addon.eval("Vanguard_QuestLog.close.__scripts.OnClick(Vanguard_QuestLog.close)");
  addon.slash("quests");
  addon.slash("quests");
  expect(addon.eval("return { Vanguard_QuestLog:IsShown(), UISpecialFrames[#UISpecialFrames] }"), "the close button and /vg quests close it; Escape too").toEqual([false, "Vanguard_QuestLog"]);
  const off = loggedIn(TRACK_ENV + QLOG_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestLog = { own = false } } }" });
  off.slash("quests");
  expect([off.eval("return Vanguard_QuestLog == nil and next(__overrides) == nil"), chatHas(off, /quest log is off/)], "switched off: the game's quest log key stays the game's").toEqual([true, true]);
});

// TEST-ONLY game quest log toggle (what the quest log micro button calls) and the game's map window it opens.
const TOGGLE_ENV = `
  hooksecurefunc = function(a, b, c)
    if type(a) == "table" then local orig = a[b] a[b] = function(...) local r = orig(...) c(...) return r end
    else local orig = _G[a] _G[a] = function(...) orig(...) b(...) end end
  end
  __game = 0
  WorldMapFrame = CreateFrame("Frame", "WorldMapFrame", UIParent) WorldMapFrame:Hide()
  function ToggleQuestLog() __game = __game + 1 if WorldMapFrame then if WorldMapFrame:IsShown() then WorldMapFrame:Hide() else WorldMapFrame:Show() end end end
`;

it("quest log: the game's quest log button opens Vanguard's log instead of the game's", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + TOGGLE_ENV);
  // The state of Vanguard's log and the game's map after a press of the micro button.
  const press = () => { addon.eval("ToggleQuestLog()"); return addon.eval("return { Vanguard_QuestLog:IsShown(), WorldMapFrame:IsShown(), __game }"); };
  expect(press(), "the button opens this log, and the game's window it opened is put away").toEqual([true, false, 1]);
  expect(press(), "pressed again it closes this log").toEqual([false, false, 2]);
  addon.eval("WorldMapFrame:Show()");
  expect(press(), "a map the player had open: the game's toggle closes it, and this log opens").toEqual([true, false, 3]);
  const off = loggedIn(TRACK_ENV + QLOG_ENV + TOGGLE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestLog = { own = false } } }" });
  off.eval("ToggleQuestLog()");
  expect(off.eval("return { Vanguard_QuestLog == nil, WorldMapFrame:IsShown() }"), "with Vanguard's log off, the button is the game's").toEqual([true, true]);
  const bare = loggedIn(TRACK_ENV + QLOG_ENV + TOGGLE_ENV + "WorldMapFrame = nil");
  bare.eval("ToggleQuestLog()");
  expect(bare.eval("return Vanguard_QuestLog:IsShown()"), "a client without the map window is fine").toBe(true);
  const none = loggedIn(TRACK_ENV + QLOG_ENV + "ToggleQuestLog = nil");
  expect(none.eval("return Vanguard_QuestLog ~= nil and ToggleQuestLog == nil"), "a client without the toggle loads cleanly").toBe(true);
});
