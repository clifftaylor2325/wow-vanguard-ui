// quest-dialog: Vanguard's quest and gossip dialog and quest automation, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { QUEST_ENV, borderOf, calls, chatHas, isTok, key, loggedIn, setCombat } from "./helpers.mjs";

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
