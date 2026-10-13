// quests: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, QUEST_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, borderOf, calls, chatHas, isTok, key, loggedIn, px, setCombat, WINDOWS_ENV } from "./helpers.mjs";

// The quest dialog's state: shown, header, body, lines, cards, money and buttons.
const dialog = (addon) => addon.eval(`local f = Vanguard_QuestDialog
  local lines, cards = {}, {}
  for i = 1, f.lines.used do lines[i] = f.lines[i].text:GetText() end
  for i = 1, f.cards.used do cards[i] = f.cards[i].name:GetText() end
  return { shown = f:IsShown(), npc = f.npc:GetText(), title = f.title:GetText(), text = f.text:GetText(),
    objectives = f.objectives:IsShown() and f.objectives:GetText() or false, lines = lines, cards = cards, money = f.money:GetText(),
    primary = f.primary:IsShown() and f.primary.text:GetText() or false, enabled = f.primary:IsEnabled(),
    secondary = f.secondary:IsShown() and f.secondary.text:GetText() or false }`);
it("quest dialog: gossip lines, quest details, rewards and keys", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  const g = dialog(addon);
  expect([g.shown, g.npc, g.text, g.primary, addon.eval("return Vanguard_QuestDialog.portrait.__portrait")], "the NPC's portrait, name and greeting").toEqual([true, "TEST-ONLY Farmer", "TEST-ONLY Well met, <name>.", "Goodbye", "npc"]);
  expect(g.lines, "quests to take, to turn in, then the options, numbered").toEqual(["1.  [8] TEST-ONLY Wolves", "2.  [12] TEST-ONLY Letter", "3.  TEST-ONLY Tell me more"]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestDialog.lines[2].text.__textColor"), "gold"), "a quest ready to turn in is gold").toBe(true);
  key(addon, "2"); key(addon, "7"); key(addon, "W");
  addon.eval("local b = Vanguard_QuestDialog.lines[3] b.__scripts.OnClick(b)");
  expect(calls(addon), "a number key picks its line (keys with no line, and other keys, are left to the game); so does a click").toEqual(["active 90032", "option 90041"]);
  addon.fire("GOSSIP_CLOSED");
  expect([dialog(addon).shown, calls(addon)], "the game closing the talk hides it without closing again").toEqual([false, []]);
  addon.fire("QUEST_DETAIL");
  const d = dialog(addon);
  expect([d.title, d.text, d.objectives, d.money, d.primary, d.secondary], "a quest's details, with Accept and Decline").toEqual(["TEST-ONLY Wolves", "TEST-ONLY Wolves trouble the farm.", "Objectives:  Slay 8 TEST-ONLY Wolves.", "+12s 0c  ·  450 XP", "Accept", "Decline"]);
  expect([d.cards, borderOf(addon, "Vanguard_QuestDialog.cards[1]")], "reward cards, a rare one in its quality color").toEqual([["TEST-ONLY Boots", "TEST-ONLY Gloves", "TEST-ONLY Bread"], [0, 0.44, 0.87, 1]]);
  addon.eval("local c = Vanguard_QuestDialog.cards[3] c.__scripts.OnEnter(c) c.__scripts.OnLeave(c) Vanguard_QuestDialog.scroll.__scripts.OnMouseWheel(Vanguard_QuestDialog.scroll, -1)");
  expect(addon.eval("return GameTooltip.__questItem"), "hovering a card shows its item").toBe("reward 1");
  key(addon, "SPACE");
  addon.eval("Vanguard_QuestDialog.secondary.__scripts.OnClick(Vanguard_QuestDialog.secondary)");
  expect(calls(addon), "Space accepts; Decline declines").toEqual(["accept nil", "decline nil"]);
  addon.eval("__autoAccept = true");
  addon.fire("QUEST_DETAIL");
  key(addon, "SPACE");
  expect([dialog(addon).primary, dialog(addon).secondary, calls(addon)], "a quest the game already accepted: just OK").toEqual(["OK", false, ["ack nil"]]);
});
it("quest dialog: turning in, picking a reward, closing, and handing the windows back", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.eval("__completable = false");
  addon.fire("QUEST_PROGRESS");
  key(addon, "SPACE");
  expect([dialog(addon).primary, dialog(addon).enabled, calls(addon)], "Continue waits until you have what the quest needs").toEqual(["Continue", false, []]);
  addon.eval("__completable = true");
  addon.fire("QUEST_PROGRESS");
  key(addon, "SPACE");
  expect(calls(addon), "then hands it in").toEqual(["complete nil"]);
  addon.fire("QUEST_COMPLETE");
  key(addon, "SPACE");
  expect([dialog(addon).enabled, calls(addon)], "with a choice of rewards, Complete waits for a pick").toEqual([false, []]);
  key(addon, "9");
  key(addon, "2");
  expect(addon.eval("local c = Vanguard_QuestDialog.cards return { c[1].picked:IsShown(), c[2].picked:IsShown(), Vanguard_QuestDialog.primary:IsEnabled() }"), "2 picks the gloves (9 has no reward)").toEqual([false, true, true]);
  addon.eval("local c = Vanguard_QuestDialog.cards[1] c.__scripts.OnClick(c) c = Vanguard_QuestDialog.cards[3] c.__scripts.OnClick(c)");
  key(addon, "SPACE");
  expect(calls(addon), "a click picks too (bread is no choice); Space takes it").toEqual(["reward 1"]);
  addon.eval("__choices = { __choices[1] }");
  addon.fire("QUEST_COMPLETE");
  key(addon, "SPACE");
  expect(calls(addon), "one reward: no pick needed").toEqual(["reward 1"]);
  addon.fire("QUEST_GREETING");
  addon.eval("local b = Vanguard_QuestDialog.lines[1] b.__scripts.OnClick(b)");
  expect([dialog(addon).lines, calls(addon)], "a quest giver without gossip").toEqual([["1.  [5] TEST-ONLY Rats"], ["greetAvail 1"]]);
  addon.eval("__greetAvail, __greetActive = 0, 1 C_GossipInfo.GetText = function() return { __secret = true } end");
  addon.fire("QUEST_GREETING");
  expect(dialog(addon).lines, "a quest of yours still in progress").toEqual(["1.  [6] TEST-ONLY Parcel"]);
  addon.fire("GOSSIP_SHOW");
  expect(dialog(addon).text, "text the client hides shows as …").toBe("…");
  addon.eval("Vanguard_QuestDialog:Hide()");
  expect(calls(addon), "Escape or Goodbye ends the talk").toEqual(["closeGossip nil", "closeQuest nil"]);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  key(addon, "SPACE");
  setCombat(addon, false);
  expect(addon.eval("return { QuestFrame:IsEventRegistered('QUEST_DETAIL'), QuestFrame:IsEventRegistered('QUEST_LOG_UPDATE'), CustomGossipFrameManager:IsEventRegistered('GOSSIP_SHOW') }"), "the game's windows no longer open for these talks (their other events stay)").toEqual([false, true, false]);
  const off = loggedIn(QUEST_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestDialog = { dialog = false } } }" });
  expect(off.eval("return { Vanguard_QuestDialog == nil, QuestFrame:IsEventRegistered('QUEST_DETAIL') }"), "switched off, the game's windows stay").toEqual([true, true]);
});
// The quest dialog's body scroll: its child's height, how far it can scroll, and where it is.
const bodyScroll = (addon) => addon.eval(`local f = Vanguard_QuestDialog return { f.child:GetHeight(), f.scroll:GetVerticalScrollRange(), f.scroll:GetVerticalScroll() }`);
// The quest dialog's height and its body's view height.
const panelHeights = (addon) => addon.eval("local f = Vanguard_QuestDialog return { f:GetHeight(), f.scroll:GetHeight() }");
// Turns the quest dialog's body scroll by one wheel step of this delta.
const wheelBody = (addon, delta) => addon.eval(`local s = Vanguard_QuestDialog.scroll s.__scripts.OnMouseWheel(s, ${delta})`);
it("quest dialog: a long greeting or quest text scrolls, a short one does not", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  expect(bodyScroll(addon), "a short greeting (14 px) and three numbered lines (60 px) fit the body: nothing to scroll").toEqual([88, 0, 0]);
  expect(panelHeights(addon), "the panel is sized to them: the 60 px header, the 88 px body and the 44 px footer").toEqual([192, 88]);
  wheelBody(addon, -1);
  expect(bodyScroll(addon)[2], "the wheel stays at the top when there is no range").toBe(0);
  addon.eval('__greeting = "TEST-ONLY " .. string.rep("word ", 400)');
  addon.fire("GOSSIP_SHOW");
  expect(panelHeights(addon), "2010 characters wrap to 24 lines (336 px): the panel stops at its greatest height (360), the body's view at 256").toEqual([360, 256]);
  expect(bodyScroll(addon), "the child holds the text and the three lines (410 px), and the wheel can reach the 154 px past the view").toEqual([410, 154, 0]);
  wheelBody(addon, -1);
  expect(bodyScroll(addon)[2], "the wheel scrolls down a step").toBe(24);
  wheelBody(addon, -50);
  expect(bodyScroll(addon)[2], "and stops at the end of the content").toBe(154);
  wheelBody(addon, 100);
  expect(bodyScroll(addon)[2], "and at the top going back").toBe(0);
  wheelBody(addon, -1);
  addon.fire("GOSSIP_SHOW");
  expect(bodyScroll(addon)[2], "a new page starts at the top").toBe(0);
  addon.eval('GetQuestText = function() return "TEST-ONLY " .. string.rep("word ", 300) end');
  addon.fire("QUEST_DETAIL");
  expect([panelHeights(addon), bodyScroll(addon)], "a quest's text and its objectives (24 + 14 px lines) count too; a row of reward cards (8 + 36 px) leaves the body 212 px").toEqual([[360, 212], [278, 66, 0]]);
});
it("quest dialog: sized to its page, above the cast bars, cards under the text, a quest mark without a portrait", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("QUEST_DETAIL");
  // A frame's rect on the screen.
  const rect = (ref) => addon.frame(ref).rect;
  expect(addon.eval("return { ns.MoverPoint('questdialog') }"), "by default it sits centered, 8 px above the focus cast bar's top (324 + 14)").toEqual(["BOTTOM", "BOTTOM", 0, 346]);
  const castTops = ["player", "target", "focus"].map((u) => rect(`Vanguard_CastBar_${u}`).top);
  expect(castTops.every((top) => rect("Vanguard_QuestDialog").bottom > top), "every cast bar is below the dialog").toBe(true);
  expect(panelHeights(addon), "a short quest: the text and objectives (40 px) and a row of cards (44 px) between the header and footer").toEqual([188, 40]);
  expect([addon.eval("return Vanguard_QuestDialog.cards[1]:GetLeft() - Vanguard_QuestDialog.text:GetLeft()"), addon.eval("return Vanguard_QuestDialog.money:GetLeft() - Vanguard_QuestDialog.text:GetLeft()")], "the cards and the money line start where the text does").toEqual([0, 0]);
  addon.eval("for i = 1, 4 do __rewards[#__rewards + 1] = __rewards[1] end");
  addon.fire("QUEST_DETAIL");
  expect([panelHeights(addon)[0], addon.eval("return Vanguard_QuestDialog.cards[4]:GetTop() - Vanguard_QuestDialog.cards[1]:GetBottom()")], "seven items: three rows (8 + 3 x 36 + 2 x 4 px), the fourth card on the second row").toEqual([268, -4]);
  addon.eval("__greeting, __avail, __active, __options = '', {}, {}, {}");
  addon.fire("GOSSIP_SHOW");
  expect(panelHeights(addon), "an NPC with nothing to say still gets the least height (160), the body taking the rest").toEqual([160, 56]);
  // The portrait and the quest mark shown, and the mark's texture.
  const portrait = () => addon.eval("local f = Vanguard_QuestDialog return { f.portrait:IsShown(), f.placeholder:IsShown(), f.placeholder:GetTexture() }");
  expect(portrait(), "talking to an NPC: its portrait").toEqual([true, false, "Interface\\AddOns\\Vanguard\\Media\\Icons\\Quests"]);
  addon.eval("__npc = false");
  addon.fire("QUEST_DETAIL");
  expect(portrait().slice(0, 2), "a quest from an item has no NPC to draw: the quest mark instead").toEqual([false, true]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestDialog.placeholder.__vertexColor"), "accent"), "in the accent").toBe(true);
  addon.eval("__npc = true SetPortraitTexture = nil");
  addon.fire("QUEST_DETAIL");
  expect(portrait().slice(0, 2), "and so does a client without the portrait call").toEqual([false, true]);
  const moved = loggedIn(QUEST_ENV, { savedVariables: 'VanguardDB.profiles = { Default = { positions = { questdialog = { point = "TOP", relPoint = "TOP", x = 40, y = -120 } } } }' });
  moved.fire("GOSSIP_SHOW");
  expect(moved.eval("local p, _, rp, x, y = Vanguard_QuestDialog:GetPoint() return { p, rp, x, y }"), "a spot the player saved stays").toEqual(["TOP", "TOP", 40, -120]);
});
it("quest dialog: hiding the whole UI keeps the conversation open; closing it ends it", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  // Alt-Z hides UIParent; the client then runs OnHide on the dialog, which is still marked shown.
  addon.eval("UIParent:Hide() local f = Vanguard_QuestDialog f.__scripts.OnHide(f)");
  expect([calls(addon), addon.eval("return { Vanguard_QuestDialog:IsShown(), Vanguard_QuestDialog:IsVisible() }")], "the UI is hidden, the dialog is waiting and the talk has not ended").toEqual([[], [true, false]]);
  addon.eval("UIParent:Show()");
  expect([addon.eval("return Vanguard_QuestDialog:IsVisible()"), dialog(addon).lines.length], "the UI comes back, and so does the dialog, as it was").toEqual([true, 3]);
  addon.eval("UIParent:Hide()");
  addon.fire("GOSSIP_CLOSED");
  addon.eval("UIParent:Show()");
  expect([calls(addon), addon.eval("return Vanguard_QuestDialog:IsShown()")], "the game ending the talk meanwhile hides it for good, without closing again").toEqual([[], false]);
  addon.fire("GOSSIP_SHOW");
  addon.eval("Vanguard_QuestDialog.primary.__scripts.OnClick(Vanguard_QuestDialog.primary)");
  expect([calls(addon), addon.eval("return Vanguard_QuestDialog:IsShown()")], "Goodbye closes the dialog and ends the talk").toEqual([["closeGossip nil", "closeQuest nil"], false]);
  addon.fire("GOSSIP_SHOW");
  addon.eval("Vanguard_QuestDialog:Hide()");
  expect([calls(addon), addon.eval("return Vanguard_QuestDialog:IsShown()")], "so does Escape (the game's special windows hide it)").toEqual([["closeGossip nil", "closeQuest nil"], false]);
});
it("quest dialog: late item details redraw the page; spell and currency rewards", () => {
  const addon = loggedIn(QUEST_ENV + `GetQuestID = function() return 90031 end
    C_QuestInfoSystem = { GetQuestRewardSpells = function() return { 90081 } end, GetQuestRewardSpellInfo = function() return { name = "TEST-ONLY Bolt" } end,
      GetQuestRewardCurrencies = function() return { { name = "TEST-ONLY Marks", totalRewardAmount = 3 } } end }`);
  addon.fire("QUEST_COMPLETE");
  expect(dialog(addon).money, "spells it teaches and currencies, after the money and XP").toBe("+12s 0c  ·  450 XP  ·  Teaches: TEST-ONLY Bolt  ·  3 TEST-ONLY Marks");
  key(addon, "2");
  addon.eval('__choices[1][1] = "TEST-ONLY Better Boots"');
  addon.fire("QUEST_ITEM_UPDATE");
  expect([dialog(addon).cards[0], addon.eval("return Vanguard_QuestDialog.cards[2].picked:IsShown()")], "an item the game just loaded shows; the pick stays").toEqual(["TEST-ONLY Better Boots", true]);
  addon.eval("Vanguard_QuestDialog:Hide() __choices[1][1] = 'TEST-ONLY Later'");
  addon.fire("QUEST_ITEM_UPDATE");
  expect(dialog(addon).cards[0], "closed, nothing redraws").toBe("TEST-ONLY Better Boots");
  addon.eval("C_QuestInfoSystem = nil");
  expect(addon.eval("return #ns.GetModule('QuestDialog').ExtraRewards(90031)"), "a client without those calls shows none").toBe(0);
});
it("quest automation: accept, turn in, best reward, skip chatter; Shift skips it", () => {
  const on = "VanguardDB.profiles = { Default = { QuestAuto = { accept = true, turnIn = true, skipGossip = true } } }";
  const addon = loggedIn(QUEST_ENV, { savedVariables: on });
  addon.fire("QUEST_DETAIL");
  expect([dialog(addon).shown, calls(addon), chatHas(addon, /Accepted: TEST-ONLY Wolves/)], "accepted for you, the dialog stays shut").toEqual([false, ["accept nil"], true]);
  addon.eval("__shift = true");
  addon.fire("QUEST_DETAIL");
  expect([dialog(addon).shown, calls(addon)], "holding Shift: the dialog, as usual").toEqual([true, []]);
  addon.eval("__shift, __autoAccept = false, true");
  addon.fire("QUEST_DETAIL");
  addon.fire("QUEST_PROGRESS");
  addon.fire("QUEST_COMPLETE");
  expect(calls(addon), "acknowledged, handed in; a choice of rewards is left to you").toEqual(["ack nil", "complete nil"]);
  addon.eval("VanguardDB.profiles.Default.QuestAuto.bestReward = true");
  addon.fire("QUEST_COMPLETE");
  expect([calls(addon), chatHas(addon, /Turned in: TEST-ONLY Wolves \(took TEST-ONLY Gloves\)/)], "the best seller, when switched on").toEqual([["reward 2"], true]);
  addon.eval('__prices["item:90022"] = nil');
  addon.fire("QUEST_COMPLETE");
  expect(calls(addon), "a price the game doesn't know yet: left to you").toEqual([]);
  addon.eval("__choices = {}");
  addon.fire("QUEST_COMPLETE");
  expect(calls(addon), "no choice: just turned in").toEqual(["reward nil"]);
  addon.fire("GOSSIP_SHOW");
  addon.eval("__options = {} __active = {}");
  addon.fire("GOSSIP_SHOW");
  addon.eval("__avail, __active = {}, { { title = 'TEST-ONLY Letter', questLevel = 12, questID = 90032 } }");
  addon.fire("GOSSIP_SHOW");
  expect(calls(addon), "chatter kept when there's more to say; skipped for the one quest").toEqual(["avail 90031", "active 90032"]);
  addon.fire("QUEST_GREETING");
  addon.eval("__greetAvail, __greetActive = 0, 1");
  addon.fire("QUEST_GREETING");
  addon.eval("__greetActive = 2");
  addon.fire("QUEST_GREETING");
  expect(calls(addon), "the same without gossip; two quests are left to you").toEqual(["greetAvail 1", "greetActive 1"]);
  const off = loggedIn(QUEST_ENV);
  off.fire("QUEST_DETAIL");
  expect([dialog(off).shown, calls(off)], "off by default").toEqual([true, []]);
  expect(off.eval("GetQuestDifficultyColor = nil local QP = ns.QuestParts return { QP.Titled(nil, 'TEST-ONLY Note'), select(1, QP.LevelColor(5)) == select(1, ns.Theme.RGB('text')) }"), "a quest without a level, and a client without difficulty colors").toEqual(["TEST-ONLY Note", true]);
});
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
  expect(addon.eval("return { Vanguard_QuestTrackerFrame.__strata, Vanguard_QuestItem1.__strata }"),
    "the tracker (its clickable titles with it) and its items on LOW, as the game's tracker, under the game's windows (an open bag's items stay clickable)").toEqual(["LOW", "LOW"]);
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
  addon.eval("local b = Vanguard_QuestTrackerFrame.moreBtn b.__scripts.OnClick(b)");
  const open = tracker(addon);
  expect([open.blocks.length, open.more], "clicking the count shows them all, with a way back").toEqual([9, "Show fewer"]);
  addon.eval("local b = Vanguard_QuestTrackerFrame.moreBtn b.__scripts.OnClick(b)");
  expect(tracker(addon).more, "and clicking again folds them").toEqual(`+${9 - t.blocks.length} more`);
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
it("quest log: hovering a reward card shows its item, leaving hides it", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  addon.eval("local c = Vanguard_QuestLog.cards[2] c.__scripts.OnEnter(c)");
  expect(addon.eval("return { GameTooltip.__questLogItem, GameTooltip:IsShown(), GameTooltip:GetOwner() == Vanguard_QuestLog.cards[2] }"), "a reward: set from its slot and quest, by its card").toEqual(["reward 1 90051", true, true]);
  addon.eval("local c = Vanguard_QuestLog.cards[1] c.__scripts.OnEnter(c) c.__scripts.OnLeave(c)");
  expect(addon.eval("return { GameTooltip.__questLogItem, GameTooltip:IsShown() }"), "a choice; leaving hides the tooltip").toEqual(["choice 1 90051", false]);
  addon.eval("GameTooltip.SetQuestLogItem = nil GameTooltip.__questLogItem = nil local c = Vanguard_QuestLog.cards[1] c.__scripts.OnEnter(c)");
  expect(addon.eval("return GameTooltip.__questLogItem"), "a client without the call shows nothing").toBe(null);
  addon.eval("local QP, g = ns.QuestParts, GameTooltip GameTooltip = nil QP.ItemTooltip(Vanguard_QuestLog.cards[1]) QP.ItemTooltip({}) Vanguard_QuestLog.cards[1].__scripts.OnLeave() GameTooltip = g");
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
  expect(addon.eval("local c = ns.GetModule('QuestLog').frame.close return { c:GetWidth(), c:GetHeight(), c:IsVisible() }"), "the close button has a size (it was 0 by 0, so it never showed): 20, an even count of whole screen pixels").toEqual([px(addon, 20, true), px(addon, 20, true), true]);
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
  // Whether the tracker's sort is a job on the shared ticker.
  const ticking = () => addon.eval("return ns.ticker.vgJobs['quest tracker sort'] ~= nil");
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
// The fill opacity of the panel painted on a frame: its background (the theme's white texture on the frame's
// BACKGROUND layer, not the shadow under it).
const fillAlpha = (addon, lua) => addon.eval(`local f = ${lua}
  for _, w in ipairs(__wfgStub.frames) do
    if w.__parent == f and w.__kind == "Texture" and w.__layer == "BACKGROUND" and w.__texture == ns.Theme.WHITE and (w.__sublevel or 0) == 0 then return w.__vertexColor[4] end
  end`);
it("windows are opaque: game windows, the quest log and the options window (under a short page too); tooltips keep the theme's", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + WINDOWS_ENV);
  addon.eval("MerchantFrame:Show()");
  addon.slash("quests");
  addon.slash("");
  addon.eval('ns.Options.Show("situations")');
  const opaque = ["MerchantFrame", "Vanguard_QuestLog", "Vanguard_Options"].map((name) => fillAlpha(addon, name));
  expect(opaque, "a skinned game window, the quest log and the options window: no world shows through").toEqual([1, 1, 1]);
  const page = addon.eval(`local f, child = Vanguard_Options, nil
    for _, w in ipairs(__wfgStub.frames) do if w.__kind == "ScrollFrame" and w:IsVisible() and w:GetParent() == f then child = w.child end end
    return { child:GetBottom() > f:GetBottom(), f:GetHeight() == ns.Theme.PixelRound(f, 600, true) }`);
  expect(page, "the Situations page ends above the window's foot; the opaque fill covers the window (600 tall, pixel-rounded) to its edges").toEqual([true, true]);
  expect(fillAlpha(addon, "GameTooltip"), "tooltips keep the theme's panel opacity").toBe(addon.eval("return select(4, ns.Theme.RGB('panel'))"));
});
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
it("nameplates: a gold ! by units your quests need", () => {
  const env = "__related = { nameplate1 = true, nameplate2 = { __secret = true } } C_QuestLog = { UnitIsRelatedToActiveQuest = function(unit) return __related[unit] end }";
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + CLICK_LUA + env);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // A plate's quest mark: shown, its icon, its color.
  const mark = (unit) => addon.eval(`local q = ns.FrameState('vgPlate')[__plates.${unit}].quest return { q:IsShown(), q.__texture, q.__vertexColor }`);
  const one = mark("nameplate1");
  expect([one[0], /Icons\\Quests$/.test(one[1]), isTok(addon, one[2], "gold")], "a quest unit gets the gold !").toEqual([true, true, true]);
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate1].quest.__points.LEFT.rel == ns.FrameState('vgPlate')[__plates.nameplate1].name"), "just right of its name").toBe(true);
  expect(mark("nameplate2")[0], "a hidden answer counts as no").toBe(false);
  addon.eval("__related.nameplate1 = nil");
  addon.fire("QUEST_LOG_UPDATE");
  expect(mark("nameplate1")[0], "it goes when your quests no longer need the unit").toBe(false);
  addon.eval("__related.nameplate1 = true");
  addon.slash("");
  addon.eval('__click("Nameplates")');
  addon.eval('__click("A gold ! by units your quests need")');
  expect(mark("nameplate1")[0], "the switch turns the marks off at once").toBe(false);
  const bare = loggedIn(UNITS_ENV + PLATE_ENV + "C_QuestLog = nil");
  bare.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect(bare.eval("return ns.FrameState('vgPlate')[__plates.nameplate1].quest:IsShown()"), "a client that can't say shows none").toBe(false);
});
// TEST-ONLY quest and gossip windows that color their text for parchment (dark brown), as the game does.
const PARCHMENT_ENV = `
  hooksecurefunc = function(a, b, c)
    if type(a) == "table" then local orig = a[b] a[b] = function(...) local r = orig(...) c(...) return r end
    else local orig = _G[a] _G[a] = function(...) orig(...) b(...) end end
  end
  QuestFrame = CreateFrame("Frame", "QuestFrame", UIParent) QuestFrame:Hide()
  for _, name in ipairs({ "QuestInfoDescriptionText", "QuestInfoTitleHeader" }) do UIParent:CreateFontString(name) _G[name] = __wfgStub.frames[#__wfgStub.frames] end
  function QuestFrame_SetTextColor(fs) fs:SetTextColor(0.2, 0.1, 0) end
  function QuestFrame_SetTitleTextColor(fs) fs:SetTextColor(0.2, 0.1, 0) end
  function QuestInfo_Display() QuestInfoDescriptionText:SetTextColor(0.2, 0.1, 0) end
  GossipFrame = CreateFrame("Frame", "GossipFrame", UIParent) GossipFrame:Hide()
  GossipFrame.GreetingPanel = CreateFrame("Frame", nil, GossipFrame)
  local box = CreateFrame("Frame", nil, GossipFrame.GreetingPanel)
  GossipFrame.GreetingPanel.ScrollBox = box
  local greeting = CreateFrame("Frame", nil, box) greeting.GreetingText = greeting:CreateFontString()
  local option = CreateFrame("Button", nil, box) option.label = option:CreateFontString()
  option.GetFontString = function(self) return self.label end
  __lines = { greeting, option }
  function box:ForEachFrame(fn) for _, f in ipairs(__lines) do fn(f) end end
  function box:Update() for _, f in ipairs(__lines) do (f.GreetingText or f.label):SetTextColor(0.2, 0.1, 0) end end
`;
it("game windows: quest and gossip text stays readable on the dark panel", () => {
  const addon = loggedIn(PARCHMENT_ENV);
  addon.eval("QuestInfo_Display() QuestFrame_SetTitleTextColor(QuestInfoTitleHeader)");
  expect(isTok(addon, addon.eval("return QuestInfoDescriptionText.__textColor"), "text") && isTok(addon, addon.eval("return QuestInfoTitleHeader.__textColor"), "gold"), "quest text goes light and headings gold after the game colors them").toBe(true);
  addon.eval("local fs = UIParent:CreateFontString() QuestFrame_SetTextColor(fs) __fs = fs");
  expect(isTok(addon, addon.eval("return __fs.__textColor"), "text"), "any text the game colors for parchment is lightened").toBe(true);
  addon.eval("GossipFrame.GreetingPanel.ScrollBox:Update()");
  expect(addon.eval("return { __lines[1].GreetingText.__textColor[1] > 0.5, __lines[2].label.__textColor[1] > 0.5 }"), "the gossip greeting and options are light after each redraw").toEqual([true, true]);
  addon.eval("QuestInfoDescriptionText:SetTextColor(0, 0, 0) QuestFrame:Show()");
  expect(isTok(addon, addon.eval("return QuestInfoDescriptionText.__textColor"), "text"), "and when the window shows").toBe(true);
  const off = loggedIn(PARCHMENT_ENV, { savedVariables: "VanguardDB.profiles.Default = { Windows = { windows = false } }" });
  off.eval("QuestInfo_Display()");
  expect(off.eval("return QuestInfoDescriptionText.__textColor[1]"), "with game windows off, the game's colors stay").toBeCloseTo(0.2);
  expect(loggedIn("").eval("return ns.GetModule('Windows').LightGossip() == nil"), "a client without these windows is fine").toBe(true);
});
// TEST-ONLY quest tracker parts the game builds: headers with art, a title and a
// collapse button, a list of sections, an Update the game calls, and its font objects.
const TRACKER_ENV = `
  function __header(parent)
    local h = CreateFrame("Frame", nil, parent) h:SetSize(260, 26)
    h.Background = h:CreateTexture() h.Glow = h:CreateTexture() h.Text = h:CreateFontString()
    h.MinimizeButton = CreateFrame("Button", nil, h) h.MinimizeButton.normal = h.MinimizeButton:CreateTexture()
    h.MinimizeButton.GetNormalTexture = function(self) return self.normal end
    function h:SetCollapsed(collapsed) self.collapsed = collapsed end
    return h
  end
  ObjectiveTrackerFrame.Header = __header(ObjectiveTrackerFrame)
  ObjectiveTrackerFrame.modules = { { Header = __header(ObjectiveTrackerFrame) } }
  function ObjectiveTrackerFrame:Update() end
  ObjectiveTrackerLineFont = { SetFont = function(self, ...) self.font = { ... } end }
  ObjectiveTrackerHeaderFont = { SetFont = function(self, ...) self.font = { ... } end }
`;
it("the quest tracker in the Vanguard look: flat headers, brass lines, theme arrows and font", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV, { savedVariables: "VanguardDB.profiles.Default = { QuestTracker = { own = false } }" });
  const head = addon.eval(`local h = ObjectiveTrackerFrame.Header
    return { h.Background.__alpha, h.Glow.__alpha, h.MinimizeButton.normal.__alpha, h.Text.__font ~= nil, #ns.GetModule("MenuStrip").rules }`);
  expect(head, "header art and the game's button fade; the title takes the theme font; each header gets a brass line").toEqual([0, 0, 0, true, 2]);
  expect(isTok(addon, addon.eval("return ns.GetModule('MenuStrip').rules[1].__vertexColor"), "accent"), "the line is the accent").toBe(true);
  // The container header's arrow texture.
  const arrow = () => addon.eval("return ns.FrameState('vgArrow')[ObjectiveTrackerFrame.Header].__texture");
  expect(/Icons\\Down$/.test(arrow()), "an open section shows the Down arrow").toBe(true);
  addon.eval("ObjectiveTrackerFrame.Header:SetCollapsed(true)");
  expect(/Icons\\Right$/.test(arrow()), "collapsed, it shows Right").toBe(true);
  expect(addon.eval("return { ObjectiveTrackerLineFont.font[2], ObjectiveTrackerHeaderFont.font[2], ObjectiveTrackerHeaderFont.font[1]:find('SemiBold') ~= nil }"), "the tracker's fonts are the theme's (headers bold)").toEqual([12, 13, true]);
  addon.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(addon.eval("return ns.GetModule('MenuStrip').rules[2].__vertexColor[3]"), "the lines follow the accent").toBe(0.3);
  addon.eval("ObjectiveTrackerFrame.modules[2] = { Header = __header(ObjectiveTrackerFrame) } ObjectiveTrackerFrame:Update()");
  expect(addon.eval("return ns.FrameState('vgHeader')[ObjectiveTrackerFrame.modules[2].Header]"), "a section the game adds later is styled on its next update").toBe(true);
  const own = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV);
  expect(own.eval("return { ns.FrameState('vgHeader')[ObjectiveTrackerFrame.Header] == nil, ObjectiveTrackerLineFont.font == nil, #ns.GetModule('MenuStrip').rules }"), "with Vanguard's own tracker on, the game's tracker is not skinned").toEqual([true, true, 0]);
  const off = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV, { savedVariables: "VanguardDB.profiles.Default = { QuestTracker = { own = false }, MenuStrip = { trackerLook = false } }" });
  expect(off.eval("return { ns.FrameState('vgHeader')[ObjectiveTrackerFrame.Header] == nil, ObjectiveTrackerLineFont.font == nil }"), "switched off, the tracker stays the game's").toEqual([true, true]);
  expect(loggedIn(UI_ENV).eval("return ns.GetModule('MenuStrip').rules ~= nil"), "a client without the tracker loads cleanly").toBe(true);
});
