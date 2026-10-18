// quests: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, QUEST_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, borderOf, calls, chatHas, isTok, key, loggedIn, px, setCombat, WINDOWS_ENV } from "./helpers.mjs";

// The theme's layout numbers the quest windows are built on: { inset, pad, col, gap, tight, buttonH, rowH, watermark, wash }.
const layout = (addon) => addon.eval(`local T = ns.Theme
  return { T.CONTROL.inset, T.SPACE.pad, T.SPACE.col, T.SPACE.gap, T.SPACE.tight, T.BUTTON_H, T.ROW.height, T.CREST.watermark, T.CREST.wash }`);
// The quest dialog's state: shown, header, body, lines, cards, money and buttons.
const dialog = (addon) => addon.eval(`local f = Vanguard_QuestDialog
  local lines, cards = {}, {}
  for i = 1, f.lines.used do lines[i] = f.lines[i].text:GetText() end
  for i = 1, f.cards.used do cards[i] = f.cards[i].name:GetText() end
  return { shown = f:IsShown(), npc = f.npc:GetText(), title = f.title:GetText(), text = f.text:GetText(),
    objectives = f.objectives:IsShown() and f.objectives:GetText() or false, lines = lines, cards = cards, money = f.money:GetText(),
    primary = f.primary:IsShown() and f.primary.text:GetText() or false, enabled = f.primary:IsEnabled(),
    secondary = f.secondary:IsShown() and f.secondary.text:GetText() or false,
    escape = f.escape:IsShown() and f.escape.text:GetText() or false }`);
it("quest dialog: Enter presses the main button (or Goodbye alone) out of combat, and is not caught in combat", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  setCombat(addon, true);
  key(addon, "ENTER");
  expect([calls(addon), addon.eval("return Vanguard_QuestDialog:IsShown()")], "in combat Enter does nothing").toEqual([[], true]);
  setCombat(addon, false);
  key(addon, "NUMPADENTER");
  expect([calls(addon), addon.eval("return Vanguard_QuestDialog:IsShown()")], "out of combat, on a page with only Goodbye, Enter says goodbye").toEqual([["closeGossip nil", "closeQuest nil"], false]);
});
it("quest dialog: gossip lines, quest details, rewards and keys", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  const g = dialog(addon);
  expect([g.shown, g.npc, g.text, g.primary, g.escape, addon.eval("return Vanguard_QuestDialog.portrait.__portrait")], "the NPC's portrait, name and greeting; Goodbye is the escape button, not a primary").toEqual([true, "TEST-ONLY Farmer", "TEST-ONLY Well met, <name>.", false, "Goodbye", "npc"]);
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
  expect(bodyScroll(addon), "a short greeting (14 px), three numbered lines (84 px, 28 each) and the 12 px line gap fit the body: nothing to scroll").toEqual([114, 0, 0]);
  expect(panelHeights(addon), "the panel is sized to them: the 64 px header, the 114 px body and the 50 px footer").toEqual([228, 114]);
  wheelBody(addon, -1);
  expect(bodyScroll(addon)[2], "the wheel stays at the top when there is no range").toBe(0);
  addon.eval('__greeting = "TEST-ONLY " .. string.rep("word ", 400)');
  addon.fire("GOSSIP_SHOW");
  expect(panelHeights(addon), "2010 characters wrap to 24 lines (336 px): the panel stops at its greatest height (360), the body's view at 246 (what the 64 px header and 50 px footer leave)").toEqual([360, 246]);
  expect(bodyScroll(addon), "the child holds the text and the three lines (436 px), and the wheel can reach the 190 px past the view").toEqual([436, 190, 0]);
  wheelBody(addon, -1);
  expect(bodyScroll(addon)[2], "the wheel scrolls down a step of 40").toBe(40);
  wheelBody(addon, -50);
  expect(bodyScroll(addon)[2], "and stops at the end of the content").toBe(190);
  wheelBody(addon, 100);
  expect(bodyScroll(addon)[2], "and at the top going back").toBe(0);
  wheelBody(addon, -1);
  addon.fire("GOSSIP_SHOW");
  expect(bodyScroll(addon)[2], "a new page starts at the top").toBe(0);
  addon.eval('GetQuestText = function() return "TEST-ONLY " .. string.rep("word ", 300) end');
  addon.fire("QUEST_DETAIL");
  expect([panelHeights(addon), bodyScroll(addon)], "a quest's text and its objectives (24 + 14 px lines) count too; a row of reward cards (8 + 36 px) leaves the body 202 px").toEqual([[360, 202], [278, 76, 0]]);
});
it("quest dialog: sized to its page, above the cast bars, cards under the text, a quest mark without a portrait", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("QUEST_DETAIL");
  // A frame's rect on the screen.
  const rect = (ref) => addon.frame(ref).rect;
  expect(addon.eval("return { ns.MoverPoint('questdialog') }"), "by default it sits centered, 8 px above the focus cast bar's top (324 + 14)").toEqual(["BOTTOM", "BOTTOM", 0, 346]);
  const castTops = ["player", "target", "focus"].map((u) => rect(`Vanguard_CastBar_${u}`).top);
  expect(castTops.every((top) => rect("Vanguard_QuestDialog").bottom > top), "every cast bar is below the dialog").toBe(true);
  expect(panelHeights(addon), "a short quest: the text and objectives (40 px) and a row of cards (44 px) between the 64 px header and the 50 px footer").toEqual([198, 40]);
  expect([addon.eval("return Vanguard_QuestDialog.cards[1]:GetLeft() - Vanguard_QuestDialog.text:GetLeft()"), addon.eval("return Vanguard_QuestDialog.money:GetLeft() - Vanguard_QuestDialog.text:GetLeft()")], "the cards and the money line start where the text does").toEqual([0, 0]);
  addon.eval("for i = 1, 4 do __rewards[#__rewards + 1] = __rewards[1] end");
  addon.fire("QUEST_DETAIL");
  expect([panelHeights(addon)[0], addon.eval("return Vanguard_QuestDialog.cards[4]:GetTop() - Vanguard_QuestDialog.cards[1]:GetBottom()")], "seven items: three rows (8 + 3 x 36 + 2 x 4 px), the fourth card on the second row").toEqual([278, -4]);
  addon.eval("__greeting, __avail, __active, __options = '', {}, {}, {}");
  addon.fire("GOSSIP_SHOW");
  expect(panelHeights(addon), "an NPC with nothing to say still gets the least height (160), the body taking the rest").toEqual([160, 46]);
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
it("quest dialog: the header sits at the window inset, the NPC's name in the window title's role and colour, no X, a dialog-opacity panel", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("QUEST_DETAIL");
  const [, pad, col, , tight] = layout(addon);
  const npc = addon.frame("Vanguard_QuestDialog.npc"), title = addon.frame("Vanguard_QuestDialog.title");
  expect([npc.text, npc.font.size, isTok(addon, npc.textColor, "text")], "the NPC's name is the title role in the text colour (it was a gold-less heading)").toEqual(["TEST-ONLY Farmer", addon.eval("return ns.Theme.RoleSize('title')"), true]);
  expect([title.font.size, isTok(addon, title.textColor, "gold")], "the quest title under it stays a gold label").toEqual([addon.eval("return ns.Theme.RoleSize('label')"), true]);
  const header = addon.eval(`local f, b, n, t = Vanguard_QuestDialog, Vanguard_QuestDialog.portraitBox, Vanguard_QuestDialog.npc, Vanguard_QuestDialog.title
    return { b:GetLeft() - f:GetLeft(), f:GetTop() - b:GetTop(), b:GetWidth(), n:GetLeft() - b:GetRight(), b:GetTop() - n:GetTop(), t:GetLeft() - n:GetLeft(), n:GetBottom() - t:GetTop(),
      f.scroll:GetLeft() - f:GetLeft(), f:GetTop() - f.scroll:GetTop() }`);
  expect(header, "the portrait T.SPACE.pad in from the corner, the name T.SPACE.col right of it and 2 down, the quest title T.SPACE.tight under the name; the body starts at the pad, under the 64 px header").toEqual([pad, pad, 40, col, 2, 0, tight, pad, 64]);
  expect(addon.eval("return { Vanguard_QuestDialog.close == nil, Vanguard_QuestDialog.title:GetText() }"), "no X: Goodbye closes the dialog; a quest's page names the quest").toEqual([true, "TEST-ONLY Wolves"]);
  expect(fillAlpha(addon, "Vanguard_QuestDialog"), "the panel is T.ALPHA.dialog (it was 0.96)").toBe(addon.eval("return ns.Theme.ALPHA.dialog"));
  addon.fire("GOSSIP_SHOW");
  const rows = addon.eval("local f = Vanguard_QuestDialog return { f.lines[1]:GetHeight(), f.lines[1]:GetWidth(), f.scroll:GetWidth() }");
  expect(rows, "the numbered lines are T.ROW.height tall and as wide as the body").toEqual([layout(addon)[6], 516, 516]);
});
it("quest dialog: the body scrolls in the one scroll view, with its thumb and soft edge only when there is more", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  // The body's thumb, top edge and bottom edge, shown or not; and the thumb's right edge from the body's.
  const view = () => addon.eval("local v = Vanguard_QuestDialog.scroll return { v.thumb:IsShown(), v.fadeTop:IsShown(), v.fadeBottom:IsShown(), v.thumb:IsShown() and v.thumb:GetRight() - v:GetRight() }");
  expect(view().slice(0, 3), "a short greeting: nothing to scroll, so no thumb and no edge").toEqual([false, false, false]);
  addon.eval('__greeting = "TEST-ONLY " .. string.rep("word ", 400)');
  addon.fire("GOSSIP_SHOW");
  expect(view(), "a long one: the thumb T.SPACE.col right of the body, and the bottom edge fades").toEqual([true, false, true, 12]);
  wheelBody(addon, -1);
  expect(view().slice(0, 3), "scrolled a step: the top edge fades in too").toEqual([true, true, true]);
  wheelBody(addon, -50);
  expect(view().slice(0, 3), "at the end the bottom edge goes").toEqual([true, true, false]);
  addon.fire("GOSSIP_SHOW");
  expect(view().slice(0, 3), "a new page starts at the top again").toEqual([true, false, true]);
  expect(addon.eval("local f = Vanguard_QuestDialog return f.scroll:GetRight() + 12 == f:GetRight() - ns.Theme.SPACE.pad"), "the thumb ends at the window's pad").toBe(true);
});
it("quest dialog: quest lines carry Vanguard's marks by state, a gold ! to take, a gold ? to turn in, a muted ? in progress; other icons stay as they are", () => {
  const addon = loggedIn(QUEST_ENV + `__active = { { title = "TEST-ONLY Letter", questLevel = 12, questID = 90032, isComplete = true }, { title = "TEST-ONLY Pelts", questLevel = 9, questID = 90033, isComplete = false } }`);
  addon.fire("GOSSIP_SHOW");
  // A dialog line's icon: its file name, tint token (gold, muted, white), size and whether it shows.
  const mark = (i) => {
    const [file, color, w, h, shown] = addon.eval(`local b = Vanguard_QuestDialog.lines[${i}] return { tostring(b.icon.__texture):match("[^\\\\]+$"), b.icon.__vertexColor, b.icon:GetWidth(), b.icon:GetHeight(), b.icon:IsShown() }`);
    return [file, ["gold", "muted", "white"].find((name) => isTok(addon, color, name)), w, h, shown];
  };
  expect(addon.eval("return Vanguard_QuestDialog.lines.used"), "a quest to take, one to turn in, one in progress, one gossip option").toBe(4);
  expect([mark(1), mark(2), mark(3)], "! in gold; ? in gold; the same ? muted; all 16 px").toEqual([["QuestBang", "gold", 16, 16, true], ["QuestQuery", "gold", 16, 16, true], ["QuestQuery", "muted", 16, 16, true]]);
  expect(mark(4).slice(1), "a gossip option's own icon is left white at the same size").toEqual(["white", 16, 16, true]);
  expect(addon.eval("local QP = ns.QuestParts return { QP.ICONS.available == ns.Theme.Icon('QuestBang'), QP.ICONS.ready == ns.Theme.Icon('QuestQuery'), QP.ICONS.active == QP.ICONS.ready }"), "QP.ICONS names Vanguard's glyphs, not the game's gossip icons").toEqual([true, true, true]);
  addon.eval("__active = {}");
  addon.fire("GOSSIP_SHOW");
  expect([mark(1), mark(2)], "a line reused for another page is repainted: the option's icon is white again").toEqual([["QuestBang", "gold", 16, 16, true], [mark(2)[0], "white", 16, 16, true]]);
  addon.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3) ns.Theme.Refresh()");
  expect(mark(1)[1], "marks keep their tint after a theme refresh").toBe("gold");
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
  addon.eval("Vanguard_QuestDialog.escape.__scripts.OnClick(Vanguard_QuestDialog.escape)");
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
// TEST-ONLY Legacy challenges: tracked achievements (C_ContentTracking's achievement type) and their criteria.
const ACH_ENV = `
  Enum.ContentTrackingType = { Achievement = 2 }
  Enum.ContentTrackingStopType = { Manual = 2 }
  __achievements = {
    [7001] = { name = "TEST-ONLY Legacy Pathfinder", completed = false,
      criteria = { { text = "2/3 TEST-ONLY Roads", done = false }, { text = "1/1 TEST-ONLY Bridges", done = true } } },
    [7002] = { name = "TEST-ONLY Legacy Done", completed = true, criteria = {} },
  }
  __tracked = { 7001, 7002 }
  C_ContentTracking = {
    GetTrackedIDs = function(kind) if kind == 2 then return __tracked end return {} end,
    StopTracking = function(kind, id, stop) __stopped = { kind, id, stop } end,
  }
  GetAchievementInfo = function(id) local a = __achievements[id] if a then return id, a.name, 10, a.completed end end
  GetAchievementNumCriteria = function(id) return __achievements[id] and #__achievements[id].criteria or 0 end
  GetAchievementCriteriaInfo = function(id, i) local c = __achievements[id].criteria[i] return c.text, 0, c.done end
`;
// One watched quest, which leaves room under it for the challenges.
const ONE_QUEST = "__watches = { 90052 }";
it("quest tracker: tracked Legacy challenges under their own heading", () => {
  const addon = loggedIn(TRACK_ENV + ACH_ENV + ONE_QUEST);
  expect(blockTitles(addon), "the quest, then the heading, then each tracked challenge").toEqual(["[12] TEST-ONLY Letter", "Legacy challenges", "TEST-ONLY Legacy Pathfinder", "TEST-ONLY Legacy Done"]);
  expect(tracker(addon).blocks.slice(1), "the criteria as objectives, and a finished challenge reads Complete").toEqual([
    ["Legacy challenges", {}], ["TEST-ONLY Legacy Pathfinder", ["- 2/3 TEST-ONLY Roads", "- 1/1 TEST-ONLY Bridges"]], ["TEST-ONLY Legacy Done", ["Complete"]]]);
  const colors = addon.eval("local b = Vanguard_QuestTrackerFrame.blocks return { b[2].title.__textColor, b[3].title.__textColor, b[4].lines[1].__textColor }");
  expect([isTok(addon, colors[0], "gold"), isTok(addon, colors[1], "text"), isTok(addon, colors[2], "good")], "the heading in gold, a challenge's title in the text color").toEqual([true, true, true]);
  expect(tracker(addon).count, "the count still counts quests only").toBe("1");
});
it("quest tracker: right-click stops tracking a challenge; the heading and left-click do nothing", () => {
  const addon = loggedIn(TRACK_ENV + ACH_ENV + ONE_QUEST);
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks b[2].__scripts.OnClick(b[2], 'RightButton') b[3].__scripts.OnClick(b[3], 'LeftButton')");
  expect(addon.eval("return { __stopped == nil, __opened == nil }"), "the heading ignores clicks; a left-click on a challenge doesn't open a quest").toEqual([true, true]);
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks b[3].__scripts.OnClick(b[3], 'RightButton')");
  expect(addon.eval("return __stopped"), "right-click stops it, as manual tracking, through the game's own call").toEqual([2, 7001, 2]);
});
it("quest tracker: a heading never shows without a challenge under it, and follows the game's list", () => {
  const addon = loggedIn(TRACK_ENV + ACH_ENV);
  expect([blockTitles(addon), tracker(addon).more], "three quests fill the room: the challenges wait behind +2 more, and no heading shows alone").toEqual([["[8] TEST-ONLY Wolves", "[12] TEST-ONLY Letter", "[3] TEST-ONLY Far"], "+2 more"]);
  addon.eval(ONE_QUEST + "\n__tracked = { 7002 }");
  addon.fire("CONTENT_TRACKING_UPDATE");
  addon.update(0);
  expect(blockTitles(addon).slice(1), "one quest, then one tracked challenge under the heading").toEqual(["Legacy challenges", "TEST-ONLY Legacy Done"]);
  addon.eval("__tracked = {}");
  addon.fire("TRACKED_ACHIEVEMENT_LIST_CHANGED");
  addon.update(0);
  expect(blockTitles(addon), "none tracked: the heading goes").toEqual(["[12] TEST-ONLY Letter"]);
});
it("quest tracker: without the challenge API, nothing is drawn for them", () => {
  const bare = loggedIn(TRACK_ENV + ONE_QUEST);
  expect(blockTitles(bare), "a client without the content tracker shows no heading").toEqual(["[12] TEST-ONLY Letter"]);
  const noInfo = loggedIn(TRACK_ENV + ACH_ENV + ONE_QUEST + "\nGetAchievementInfo = nil");
  expect(blockTitles(noInfo), "without the achievement API, nothing is drawn for them").toEqual(["[12] TEST-ONLY Letter"]);
});
// A timed quest in the world's own log (TEST-ONLY): "Hurry", watched, with `seconds` left on its clock.
const timedQuest = (addon, seconds) => {
  addon.world.addQuest({ questID: 90090, title: "TEST-ONLY Hurry", level: 10, watched: true, objectives: [{ text: "0/1 TEST-ONLY Parcel delivered", finished: false }] });
  addon.eval(`__wfgWorld.setQuestTimer(90090, ${seconds})`);
  addon.update(0);
};
// Whether the tracker's once-a-second countdown redraw is a job on the shared ticker.
const timerTicking = (addon) => addon.eval("return ns.ticker.vgJobs['quest timers'] ~= nil");
it("quest tracker: a timed quest shows its countdown under its title, ticking once a second until the timer is gone, and only while watched", () => {
  const addon = loggedIn();
  timedQuest(addon, 272);
  expect(tracker(addon).blocks[0], "Time left as m:ss above the objectives").toEqual(["[10] TEST-ONLY Hurry", ["Time left 4:32", "- 0/1 TEST-ONLY Parcel delivered"]]);
  expect([isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[1].lines[1].__textColor"), "text2"), timerTicking(addon)], "in the objective color; the redraw ticks").toEqual([true, true]);
  addon.advance(2);
  expect(tracker(addon).blocks[0][1][0], "two seconds later").toBe("Time left 4:30");
  addon.eval("__wfgWorld.setQuestTimer(90090, 3725)");
  addon.update(0);
  expect(tracker(addon).blocks[0][1][0], "an hour and more stays minutes and seconds").toBe("Time left 62:05");
  addon.eval("__wfgWorld.setQuestTimer(90090, nil)");
  addon.update(0);
  expect([tracker(addon).blocks[0][1], timerTicking(addon)], "the timer gone: the line and the ticking go").toEqual([["- 0/1 TEST-ONLY Parcel delivered"], false]);
  addon.eval("ns.GetModule('QuestTracker').settings.autoTrack = false");
  addon.world.addQuest({ questID: 90091, title: "TEST-ONLY Dawdle", level: 10, watched: false, objectives: [{ text: "0/1 TEST-ONLY Note read", finished: false }] });
  addon.eval("__wfgWorld.setQuestTimer(90091, 500)");
  addon.update(0);
  expect([blockTitles(addon), timerTicking(addon)], "a timed quest you don't watch: not drawn, and nothing ticks for it").toEqual([["[10] TEST-ONLY Hurry"], false]);
});
it("quest tracker: a timer the client hides shows nothing, a client without timers shows nothing, and neither errors", () => {
  const addon = loggedIn();
  timedQuest(addon, "__wfgWorld.secret(90)");
  expect([tracker(addon).blocks[0][1], timerTicking(addon)], "a secret timer: no line, no ticking").toEqual([["- 0/1 TEST-ONLY Parcel delivered"], false]);
  const bare = loggedIn("C_QuestLog.GetQuestTimers = nil");
  timedQuest(bare, 272);
  expect([tracker(bare).blocks[0][1], timerTicking(bare)], "no timer API: the quest as usual").toEqual([["- 0/1 TEST-ONLY Parcel delivered"], false]);
});
// TEST-ONLY tracked recipes in the world: a bandage from two Linen Cloth (the world names it) and a thread the
// client hasn't named yet, with a finishing reagent, a slot without reagents and a hidden slot to skip; a
// recipe without a name and one whose name is hidden; one Linen Cloth in the bags.
const RECIPE_ENV = `
  __wfgWorld.recipes[90100] = { recipeID = 90100, name = "TEST-ONLY Linen Bandage", outputItemID = 90101, quantityMin = 1, quantityMax = 1,
    reagentSlotSchematics = { { reagents = { { itemID = 2589 } }, quantityRequired = 2, reagentType = 1 }, { reagents = { { itemID = 90102 } }, quantityRequired = 1, reagentType = 1 },
      { reagents = { { itemID = 159 } }, quantityRequired = 1, reagentType = 2 }, { quantityRequired = 1, reagentType = 1 }, __wfgWorld.secret(1) } }
  __wfgWorld.recipes[90103] = { recipeID = 90103 }
  __wfgWorld.recipes[90104] = { recipeID = 90104, name = __wfgWorld.secret("hidden") }
  __wfgWorld.bags[1][1] = { itemID = 2589, count = 1 }
`;
it("quest tracker: recipes you track sit under a Recipes heading with their reagents, follow the bags, and go when untracked", () => {
  const addon = loggedIn(RECIPE_ENV);
  addon.world.addQuest({ questID: 90052, title: "TEST-ONLY Letter", level: 12, watched: true });
  addon.eval("__wfgWorld.trackRecipe(90100) __wfgWorld.trackRecipe(90103) __wfgWorld.trackRecipe(90104) __wfgWorld.trackedRecipes[#__wfgWorld.trackedRecipes + 1] = __wfgWorld.secret(7)");
  addon.update(0);
  expect(tracker(addon).blocks, "the quest, the heading, then the named recipe with the reagent the client names").toEqual([
    ["[12] TEST-ONLY Letter", {}], ["Recipes", {}], ["TEST-ONLY Linen Bandage", ["- 1/2 Linen Cloth"]]]);
  const colors = addon.eval("local b = Vanguard_QuestTrackerFrame.blocks return { b[2].title.__textColor, b[3].title.__textColor, b[3].lines[1].__textColor }");
  expect([isTok(addon, colors[0], "gold"), isTok(addon, colors[1], "text"), isTok(addon, colors[2], "text2")], "the heading in gold, the recipe's name in the text color, a short reagent in gray").toEqual([true, true, true]);
  addon.eval("__wfgWorld.items[90102] = { name = 'TEST-ONLY Thread', icon = 'TEST-ONLY-ICON', quality = 1 } __wfgWorld.bags[1][2] = { itemID = 2589, count = 1 }");
  addon.fire("GET_ITEM_INFO_RECEIVED", 90102);
  addon.update(0);
  expect(tracker(addon).blocks[2][1], "the thread's name arrives: its line joins; the bags are read again").toEqual(["- 2/2 Linen Cloth", "- 0/1 TEST-ONLY Thread"]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.blocks[3].lines[1].__textColor"), "good"), "a reagent you have enough of is green").toBe(true);
  addon.eval("__wfgWorld.bags[1][3] = { itemID = 90102, count = 1 }");
  addon.fire("BAG_UPDATE_DELAYED");
  addon.update(0);
  expect(tracker(addon).blocks[2][1], "a bag change redraws the counts").toEqual(["- 2/2 Linen Cloth", "- 1/1 TEST-ONLY Thread"]);
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks b[2].__scripts.OnClick(b[2], 'LeftButton') b[3].__scripts.OnClick(b[3], 'LeftButton')");
  expect(addon.eval("return __wfgWorld.openedRecipe"), "the heading ignores clicks; left-click opens the recipe through the game's call").toBe(90100);
  addon.eval("local b = Vanguard_QuestTrackerFrame.blocks b[3].__scripts.OnClick(b[3], 'RightButton')");
  addon.update(0);
  expect(blockTitles(addon), "right-click stops tracking it, through the game's call, and the heading goes with the last recipe").toEqual(["[12] TEST-ONLY Letter"]);
  const bare = loggedIn(RECIPE_ENV + "\nC_TradeSkillUI.GetRecipesTracked = nil");
  bare.world.addQuest({ questID: 90052, title: "TEST-ONLY Letter", level: 12, watched: true });
  bare.eval("__wfgWorld.trackedRecipes = { 90100 }");
  bare.fire("TRACKED_RECIPE_UPDATE", 90100, true);
  bare.update(0);
  expect(blockTitles(bare), "a client without recipe tracking: no heading, no error").toEqual(["[12] TEST-ONLY Letter"]);
});
it("quest tracker: switched off, a timed quest and a tracked recipe draw nothing", () => {
  const off = loggedIn(RECIPE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { own = false } } }" });
  timedQuest(off, 272);
  off.eval("__wfgWorld.trackRecipe(90100)");
  off.update(0);
  expect([off.eval("return Vanguard_QuestTrackerFrame == nil"), timerTicking(off)], "no tracker, no ticking").toEqual([true, false]);
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
  addon.click("Vanguard_QuestTrackerFrame.header");
  expect([Object.keys(tracker(addon).blocks).length, addon.eval("return Vanguard_QuestTrackerFrame.body:IsShown()"), addon.eval("return Vanguard_QuestTrackerFrame.header.chevron.__texture:match('Right') ~= nil")], "collapsed by the header's chevron: just the header").toEqual([0, false, true]);
  addon.click("Vanguard_QuestTrackerFrame.header");
  expect([addon.eval("return Vanguard_QuestTrackerFrame.body:IsShown()"), addon.eval("return Vanguard_QuestTrackerFrame.header.chevron.__texture:match('Down') ~= nil")], "and open again").toEqual([true, true]);
  addon.eval(`for i = 1, 6 do local id = 90070 + i __quests[id] = { index = 10 + i, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = { { text = "a" }, { text = "b" }, { text = "c" } } } __watches[#__watches + 1] = id end`);
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  const t = tracker(addon);
  expect([t.count, t.more], "more than fit: the rest are counted").toEqual(["9", `+${9 - t.blocks.length} more`]);
  addon.eval("local b = Vanguard_QuestTrackerFrame.moreBtn b.__scripts.OnClick(b)");
  const open = tracker(addon);
  expect([open.blocks.length, open.more], "clicking the count shows them all, with a way back").toEqual([9, "Show fewer"]);
  expect(addon.eval("return VanguardDB.profiles.Default.QuestTracker.expanded"), "and the profile keeps that choice past a reload").toBe(true);
  addon.eval(`for i = 7, 9 do local id = 90070 + i __quests[id] = { index = 10 + i, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = {} } __watches[#__watches + 1] = id end`);
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  const capped = tracker(addon);
  expect([capped.count, capped.blocks.length, capped.more], "all shown stops at ten quests, counting the rest").toEqual(["12", 10, "Show fewer  ·  +2 more"]);
  addon.eval("for _ = 1, 3 do table.remove(__watches) end");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  addon.eval("local b = Vanguard_QuestTrackerFrame.moreBtn b.__scripts.OnClick(b)");
  expect(tracker(addon).more, "and clicking again folds them").toEqual(`+${9 - t.blocks.length} more`);
  addon.eval("__watches = {}");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  expect(tracker(addon).shown, "nothing watched, nothing shown").toBe(false);
  const kept = loggedIn(UNITS_ENV + TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { expanded = true } } }" });
  kept.update(0);
  expect(tracker(kept).blocks.length, "a profile that kept Show all logs in with every watched quest shown").toBe(3);
  const own = loggedIn(TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { MenuStrip = { tracker = false } } }" });
  expect(own.eval("return { Vanguard_QuestTrackerFrame:GetParent():GetName(), (ns.MoverPoint('questtracker')) }"), "with the menu strip's spot off, it makes its own").toEqual(["Vanguard_QuestTracker", "TOPRIGHT"]);
  const off = loggedIn(TRACK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestTracker = { own = false } } }" });
  expect(off.eval("return { Vanguard_QuestTrackerFrame == nil, ObjectiveTrackerFrame:IsShown() }"), "switched off: the game's tracker").toEqual([true, true]);
});
it("quest tracker: the Quests header is a collapsible section header with the count after it and the brass rule under it; \"+n more\" is a status line", () => {
  const addon = loggedIn(TRACK_ENV);
  const tight = layout(addon)[4];
  const small = addon.eval("return ns.Theme.RoleSize('small')");
  const header = addon.frame("Vanguard_QuestTrackerFrame.header.text"), count = addon.frame("Vanguard_QuestTrackerFrame.header.count");
  expect([header.text, header.font.size, isTok(addon, header.textColor, "muted")], "QUESTS in small muted capitals (it was a 13 px heading)").toEqual(["QUESTS", small, true]);
  expect([count.text, count.font.size, isTok(addon, count.textColor, "text2")], "the count after it in small text2").toEqual(["3", small, true]);
  const place = addon.eval(`local f = Vanguard_QuestTrackerFrame local h = f.header
    return { h:GetHeight(), h:GetWidth(), f.count == h.count, h.collapsed, h.chevron.__texture:match("%a+$"), h.chevron:GetWidth(), f.toggle == nil,
      f.count:GetLeft() - h.text:GetRight(), h.text:GetLeft() - h.chevron:GetRight(), f:GetTop() - h:GetTop() }`);
  expect(place, "an 18 px band as wide as the tracker, the 12 px chevron (open: Down) first, the text T.SPACE.tight after it, the count T.SPACE.tight after the text; the old arrow button is gone").toEqual([18, 260, true, false, "Down", 12, true, tight, tight, 0]);
  const rule = addon.eval(`local f = Vanguard_QuestTrackerFrame local r = f.rule
    return { r:GetHeight() == ns.Theme.Pixel(f), f:GetTop() - r:GetTop(), r:GetLeft() == f:GetLeft(), r:GetRight() == f:GetRight() }`);
  expect(rule, "the brass rule stays under the header (QT.HEADER less T.SPACE.tight down, a pixel thick, the tracker's width): the tracker has no panel to carry a divider").toEqual([true, 18, true, true]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestTrackerFrame.rule.__vertexColor"), "accent"), "in the accent").toBe(true);
  addon.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(addon.eval("return Vanguard_QuestTrackerFrame.rule.__vertexColor[3]"), "and it follows an accent change").toBe(0.3);
  addon.click("Vanguard_QuestTrackerFrame.header");
  expect(addon.eval("local h = Vanguard_QuestTrackerFrame.header return { h.collapsed, h.chevron.__texture:match('%a+$'), ns.GetModule('QuestTracker').collapsed }"), "a click on the header folds the tracker and turns the chevron").toEqual([true, "Right", true]);
  addon.click("Vanguard_QuestTrackerFrame.header");
  addon.eval(`for i = 1, 6 do local id = 90070 + i __quests[id] = { index = 10 + i, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = { { text = "a" }, { text = "b" }, { text = "c" } } } __watches[#__watches + 1] = id end`);
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  const more = addon.frame("Vanguard_QuestTrackerFrame.more");
  expect([more.visible, /^\+\d+ more$/.test(more.text), more.font.size, isTok(addon, more.textColor, "text2")], "the \"+n more\" line is a status line: small text2").toEqual([true, true, small, true]);
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
  __watches, __group, __overrides, __owners = { 90051 }, false, {}, {}
  C_QuestLog.SetSelectedQuest = function(id) __selected = id end
  C_QuestLog.GetQuestWatchType = function() return 0 end
  C_QuestLog.AddQuestWatch = function(id) __added = id if not __full then __watches[#__watches + 1] = id end end
  C_QuestLog.RemoveQuestWatch = function(id) __removed = id for i, w in ipairs(__watches) do if w == id then table.remove(__watches, i) end end end
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
// The quest log: shown, count, zone headers, list lines, and the chosen quest's details and buttons.
const questLog = (addon) => addon.eval(`local f = Vanguard_QuestLog
  local lines, zones, cards = {}, {}, {}
  for i = 1, f.zones.used do zones[i] = f.zones[i].text:GetText() end
  for i = 1, f.lines.used do lines[i] = f.lines[i].text:GetText() end
  for i = 1, f.cards.used do cards[i] = f.cards[i].name:GetText() end
  local b = f.buttons
  return { shown = f:IsShown(), count = f.count:GetText(), zones = zones, lines = lines, detail = f.detail:IsShown(),
    title = f.questTitle:GetText(), text = f.text:GetText(), objectives = f.objectives:GetText(), cards = cards, money = f.money:GetText(),
    track = b.track:IsShown() and b.track.text:GetText() or false, share = b.share:IsEnabled() }`);
// Clicks a quest log line (a quest; zones are not lines), a zone header, or one of its buttons.
const logLine = (addon, i) => addon.eval(`local b = Vanguard_QuestLog.lines[${i}] b.__scripts.OnClick(b)`);
const logZone = (addon, i) => addon.eval(`local z = Vanguard_QuestLog.zones[${i}] z.__scripts.OnClick(z)`);
// Clicks one of the quest log's buttons by key.
const logButton = (addon, key) => addon.eval(`local b = Vanguard_QuestLog.buttons.${key} b.__scripts.OnClick(b)`);
it("quest log: zones, a quest's details, and its buttons", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  expect(addon.eval("return __overrides"), "the game's quest log keys open this log").toEqual({ L: "Vanguard_QuestLogToggle:LeftButton", "SHIFT-L": "Vanguard_QuestLogToggle:LeftButton" });
  addon.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  let q = questLog(addon);
  expect([q.shown, q.count, q.zones, q.lines], "your quests under their zones, which are headers in capitals (hidden ones left out)").toEqual([true, "3 quests", ["TEST-ONLY VALE", "TEST-ONLY HILLS"], ["[8] TEST-ONLY Wolves", "[12] TEST-ONLY Letter", "[3] TEST-ONLY Far"]]);
  expect([q.title, q.text, q.objectives, q.cards, q.money, q.track, q.share], "the first quest, chosen: text, objectives, rewards; watched; nobody to share with").toEqual([
    "[8] TEST-ONLY Wolves", "TEST-ONLY About 90051", "Objectives\n- 3/8 TEST-ONLY Wolves slain\n+ 1/1 TEST-ONLY Pelt", ["TEST-ONLY Boots", "TEST-ONLY Bread"], "+12s 0c  ·  450 XP", "Untrack", false]);
  logButton(addon, "track");
  expect(questLog(addon).track, "Untrack flips the button to Track at once").toBe("Track");
  logLine(addon, 2);
  logButton(addon, "track");
  expect(questLog(addon).track, "Track flips it to Untrack").toBe("Untrack");
  addon.eval("__watches = { 90051 }");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.eval("__wfgStub.advance(1)");
  expect(questLog(addon).track, "a watch change from elsewhere (the tracker's right-click) redraws the button").toBe("Track");
  addon.eval("__full = true IsShiftKeyDown = function() return true end");
  logLine(addon, 2);
  expect([questLog(addon).track, addon.chat().filter((l) => /The game didn't track TEST-ONLY Letter \(1 quests tracked\)/.test(l)).length], "Shift-click a line tracks it; when the game refuses, the button stays Track and chat says so").toEqual(["Track", 1]);
  addon.eval("__full = nil IsShiftKeyDown = function() return false end");
  expect([addon.eval("return { __removed, __added }"), questLog(addon).title], "Untrack the wolves; choose the letter and Track it").toEqual([[90051, 90052], "[12] TEST-ONLY Letter"]);
  expect(addon.eval("local l = Vanguard_QuestLog.lines return { l[2].selected, l[1].selected, l[3].selected }"), "the chosen quest's line is marked").toEqual([true, false, false]);
  addon.eval("__group = true");
  logLine(addon, 2);
  logButton(addon, "share"); logButton(addon, "abandon"); logButton(addon, "map");
  expect(addon.eval("return { __pushed, __abandoning, __popup, __opened }"), "Share; Abandon through the game's own confirmation; Map").toEqual([90052, 90052, "ABANDON_QUEST TEST-ONLY Letter", 90052]);
  logZone(addon, 1);
  expect([questLog(addon).zones, questLog(addon).lines], "a zone folds its quests away (its header stays)").toEqual([["TEST-ONLY VALE", "TEST-ONLY HILLS"], ["[3] TEST-ONLY Far"]]);
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
// Each quest log scroll view's thumb, top edge and bottom edge: shown or not, as { list, detail }.
const logThumbs = (addon) => addon.eval(`local f = Vanguard_QuestLog
  local function look(v) return { v.thumb:IsShown(), v.fadeTop:IsShown(), v.fadeBottom:IsShown() } end
  return { list = look(f.listScroll), detail = look(f.detailScroll) }`);
// Turns one of the quest log's scroll areas ("listScroll" or "detailScroll") by one wheel step of this delta.
const wheelLog = (addon, which, delta) => addon.eval(`local s = Vanguard_QuestLog.${which} s.__scripts.OnMouseWheel(s, ${delta})`);
it("quest log: a long list and long quest text scroll, a short one does not", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  expect(addon.eval("local c = ns.GetModule('QuestLog').frame.close return { c:GetWidth(), c:GetHeight(), c:IsVisible() }"), "the close button has a size (it was 0 by 0, so it never showed): 20, an even count of whole screen pixels").toEqual([px(addon, 20, true), px(addon, 20, true), true]);
  expect(logScrolls(addon), "three quests under two zones (two 18 px headers, three 28 px rows, an 8 px gap) and a short text fit the 384 px and 350 px views: nothing to scroll").toEqual({ list: [128, 0, 0], detail: [172, 0, 0] });
  expect(logThumbs(addon), "so no thumb and no soft edge show on either side").toEqual({ list: [false, false, false], detail: [false, false, false] });
  addon.eval(`for i = 1, 20 do local id = 91000 + i
    __log[#__log + 1] = { questID = id }
    __quests[id] = { index = #__log, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = {} } end
    GetQuestLogQuestText = function() return "TEST-ONLY " .. string.rep("word ", 300) end`);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(logScrolls(addon), "23 rows of 28 px and two zone headers make the list 688 px; the wolves' 1510 characters, objectives, a row of rewards and the money line make the details 536 px").toEqual({ list: [688, 304, 0], detail: [536, 186, 0] });
  expect(logThumbs(addon), "both sides show the scroll thumb, and the list's bottom edge fades (there is more below)").toEqual({ list: [true, false, true], detail: [true, false, true] });
  expect(addon.eval("local f = Vanguard_QuestLog return { f.listScroll.thumb:GetRight() - f.listScroll:GetRight(), f.listScroll.thumb:GetHeight(), f.detailScroll.thumb:GetRight() - f.detailScroll:GetRight() }"), "T.SPACE.col right of each view, as tall as its share of the content (384 of 688, 350 of 530)").toEqual([12, 384 * 384 / 688, 12]);
  wheelLog(addon, "listScroll", -1);
  expect([logScrolls(addon).list[2], logThumbs(addon).list], "the wheel scrolls the list a step of 40, and its top edge fades in").toEqual([40, [true, true, true]]);
  wheelLog(addon, "listScroll", -50);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect([logScrolls(addon).list[2], logThumbs(addon).list], "it stops at the end of the list, a redraw keeps the place, and the bottom edge goes").toEqual([304, [true, true, false]]);
  logZone(addon, 2);
  expect([logScrolls(addon).list, logThumbs(addon).list], "folding the Hills away shortens the list (18 + 2 x 28 + 8 + 18); the scroll comes back inside it, and the thumb goes").toEqual([[100, 0, 0], [false, false, false]]);
  wheelLog(addon, "detailScroll", -3);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(logScrolls(addon).detail, "the details scroll too (three steps of 40), and the same quest redrawn keeps its place").toEqual([536, 186, 120]);
  logLine(addon, 2);
  expect(logScrolls(addon).detail, "another quest starts at the top, with its own height (no objectives or rewards)").toEqual([454, 104, 0]);
  wheelLog(addon, "detailScroll", -100);
  expect(logScrolls(addon).detail[2], "the wheel stops at the end of the details").toBe(104);
});
it("quest log: the title line is the one window chrome (role, colour, offsets, count, X, Escape), the panel is opaque", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  const [inset, pad, , gap] = layout(addon);
  const title = addon.frame("Vanguard_QuestLog.title"), count = addon.frame("Vanguard_QuestLog.count");
  expect([title.text, title.font.size, isTok(addon, title.textColor, "text")], "Quest log, in the title role and the text colour (gold is for content)").toEqual(["Quest log", addon.eval("return ns.Theme.RoleSize('title')"), true]);
  expect([count.text, count.font.size, isTok(addon, count.textColor, "text2")], "the quest count beside it in small text2").toEqual(["3 quests", addon.eval("return ns.Theme.RoleSize('small')"), true]);
  const offsets = addon.eval(`local f, t, c = Vanguard_QuestLog, Vanguard_QuestLog.title, Vanguard_QuestLog.count
    return { t:GetLeft() - f:GetLeft(), (t:GetTop() + t:GetBottom()) / 2 - f:GetTop(), c:GetLeft() - t:GetRight() }`);
  expect(offsets, "T.SPACE.pad in (it was 14), centred T.CONTROL.inset down on the close button's line, the count T.SPACE.gap + 2 right of it").toEqual([pad, -inset, gap + 2]);
  const close = addon.eval(`local f, c = Vanguard_QuestLog, Vanguard_QuestLog.close
    local p, inset = c.__points.CENTER, ns.Theme.PixelRound(f, ns.Theme.CONTROL.inset)
    return { p.rel == f, p.relPoint, p.x + inset, p.y + inset, c:IsShown() }`);
  expect(close, "the X where T.PlaceClose puts every window's").toEqual([true, "TOPRIGHT", 0, 0, true]);
  expect(addon.eval("local n = 0 for _, name in ipairs(UISpecialFrames) do if name == 'Vanguard_QuestLog' then n = n + 1 end end return n"), "Escape closes it, wired once").toBe(1);
  addon.click("Vanguard_QuestLog.close");
  expect(addon.eval("return Vanguard_QuestLog:IsShown()"), "the X hides the window").toBe(false);
  addon.eval("ns.GetModule('QuestLog').Open()");
  expect(fillAlpha(addon, "Vanguard_QuestLog"), "the panel is T.ALPHA.opaque").toBe(addon.eval("return ns.Theme.ALPHA.opaque"));
});
it("quest log: the faction crest is a watermark behind the top-right corner, as in the quest dialog, and the details buttons sit on the control scale", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + QUEST_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  const [, pad, col, gap, , buttonH, , watermark, wash] = layout(addon);
  // A window's crest: size, layer, shown, alpha, and where it sits in the window.
  const mark = (name) => addon.eval(`local c = ${name}.crest local p = c.__points.TOPRIGHT
    return { c:GetWidth(), c:GetHeight(), c.__layer, c:IsShown(), c.__vertexColor[4], p.rel == ${name}, p.relPoint, p.x, p.y }`);
  const expected = [watermark, watermark, "BORDER", true, wash, true, "TOPRIGHT", -col, -6];
  expect(mark("Vanguard_QuestLog"), "T.CREST.watermark square at T.CREST.wash alpha, behind the window's content, T.SPACE.col in from the corner").toEqual(expected);
  addon.fire("GOSSIP_SHOW");
  expect(mark("Vanguard_QuestDialog"), "the quest dialog's is the same").toEqual(expected);
  expect(isTok(addon, addon.eval("return Vanguard_QuestLog.crest.__vertexColor"), "allianceCrest"), "an Alliance character's crest is in the Alliance gold").toBe(true);
  const buttons = addon.eval(`local f, out = Vanguard_QuestLog, {}
    for _, key in ipairs({ "track", "share", "abandon", "map" }) do local b = f.buttons[key] out[#out + 1] = { b:GetWidth(), b:GetHeight(), b:GetLeft() - f.detailScroll:GetLeft(), b:GetBottom() - f:GetBottom() } end
    return out`);
  expect(buttons.map((b) => b[1]), "every button is T.BUTTON_H tall").toEqual([buttonH, buttonH, buttonH, buttonH]);
  expect(buttons.map((b) => [b[0], b[2]]), "four buttons 81 wide: Abandon alone at the details column's left edge, Track, Share and Map in a row ending at its right").toEqual([[81, 4 * 81 + 3 * gap - 3 * 81 - 2 * gap], [81, 4 * 81 + 3 * gap - 2 * 81 - gap], [81, 0], [81, 4 * 81 + 3 * gap - 81]]);
  expect(buttons.map((b) => b[3]), "a pad up from the window's foot").toEqual([pad, pad, pad, pad]);
  expect(addon.eval("local f = Vanguard_QuestLog return f.buttons.map:GetRight() - f.detailScroll:GetRight()"), "the last one ends where the details column does").toBe(0);
});
it("quest log: the watermark follows the faction look, in both reading windows", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + QUEST_ENV);
  // Whether the log's crest and the dialog's crest show.
  // The history line: shown, text.
  const shown = () => addon.eval("return { Vanguard_QuestLog.crest:IsShown(), Vanguard_QuestDialog.crest:IsShown() }");
  expect(shown(), "shown by default (Crest only)").toEqual([true, true]);
  addon.eval('ns.Theme.Settings().faction = "off" ns.Theme.Refresh()');
  expect(shown(), "hidden at once while the faction look is Off").toEqual([false, false]);
  addon.eval('ns.Theme.Settings().faction = "crest" ns.Theme.Refresh()');
  expect(shown(), "and back").toEqual([true, true]);
});
it("quest log: zone headers are collapsible section headers, in capitals with a chevron, and folding keeps across redraws", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  const [, , , gap, , , row] = layout(addon);
  // A zone header: its text, chevron file, folded flag, height, and its left and top from the list.
  const zone = (i) => addon.eval(`local z = Vanguard_QuestLog.zones[${i}]
    return { z.text:GetText(), z.chevron.__texture:match("%a+$"), z.collapsed, z:GetHeight(), z:GetLeft() - Vanguard_QuestLog.list:GetLeft(), Vanguard_QuestLog.list:GetTop() - z:GetTop() }`);
  expect(zone(1), "the first zone: capitals, the open chevron, an 18 px band, T.SPACE.gap in from the list's edge at its top").toEqual(["TEST-ONLY VALE", "Down", false, 18, gap, 0]);
  expect(zone(2), "the second sits a gap under the last quest of the first (18 + 2 rows + 8)").toEqual(["TEST-ONLY HILLS", "Down", false, 18, gap, 18 + 2 * row + gap]);
  const look = addon.frame("Vanguard_QuestLog.zones[1].text");
  expect([look.font.size, isTok(addon, look.textColor, "muted")], "the header text is small muted (the options cards' style), not gold").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true]);
  logZone(addon, 1);
  expect([zone(1)[1], zone(1)[2], questLog(addon).lines, addon.eval("return ns.GetModule('QuestLog').collapsed['TEST-ONLY Vale']")], "a click folds it: the chevron turns Right and its quests go").toEqual(["Right", true, ["[3] TEST-ONLY Far"], true]);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect([zone(1)[1], zone(2)[5], questLog(addon).lines.length], "a redraw from the game keeps it folded; the next zone moved up under the folded one").toEqual(["Right", 18 + gap, 1]);
  logZone(addon, 1);
  expect([zone(1)[1], zone(1)[2], questLog(addon).lines.length, addon.eval("return ns.GetModule('QuestLog').collapsed['TEST-ONLY Vale']")], "a second click opens it again").toEqual(["Down", false, 3, null]);
  logZone(addon, 2);
  expect([zone(2)[1], questLog(addon).lines], "folding the second zone leaves the first one open").toEqual(["Right", ["[8] TEST-ONLY Wolves", "[12] TEST-ONLY Letter"]]);
});
it("quest log: the chosen quest's line shows the rail and wash of W.Row, the others only the hover wash; the lines are a row tall", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  const [, , , , , , row] = layout(addon);
  // A line's selected look: { rail shown, rail width in screen pixels, wash shown, wash alpha, height, selected }.
  const mark = (i) => addon.eval(`local b = Vanguard_QuestLog.lines[${i}]
    return { b.rail:IsShown(), b.rail:GetWidth() / ns.Theme.Pixel(b), b.wash:IsShown(), b.wash.__vertexColor[4], b:GetHeight(), b.selected }`);
  expect([mark(1), mark(2)], "the first quest is chosen: the 2-pixel rail and the opaque fill on it alone; every line is T.ROW.height").toEqual([[true, 2, true, 1, row, true], [false, 2, false, 1, row, false]]);
  expect([isTok(addon, addon.eval("return Vanguard_QuestLog.lines[1].rail.__vertexColor"), "accent"), isTok(addon, addon.eval("return Vanguard_QuestLog.lines[1].wash.__vertexColor"), "raisedHover")], "the rail is the accent, the fill raisedHover").toEqual([true, true]);
  logLine(addon, 3);
  expect([mark(1)[0], mark(2)[0], mark(3)[0], mark(3)[5]], "choosing the third moves the mark").toEqual([false, false, true, true]);
  addon.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(addon.eval("return Vanguard_QuestLog.lines[3].rail.__vertexColor[3]"), "and it follows an accent change").toBe(0.3);
  expect(addon.eval("return ns.Theme.RowParts(Vanguard_QuestLog.lines[2]).hover:GetParent() == Vanguard_QuestLog.lines[2]"), "W.Row's hover wash is on the line").toBe(true);
  expect(addon.eval("return Vanguard_QuestLog.lines[1].text:GetText()"), "no numbers in the log").toBe("[8] TEST-ONLY Wolves");
});
it("quest log: a ready quest keeps the log's check, untinted, and a quest in progress has no mark", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("ns.GetModule('QuestLog').Open()");
  const icons = addon.eval(`local f, out = Vanguard_QuestLog, {}
    for i = 1, f.lines.used do local b = f.lines[i] out[i] = { b.icon:IsShown(), tostring(b.icon.__texture):match("[^\\\\]+$"), b.icon.__vertexColor } end
    return out`);
  expect(icons.map((i) => [i[0], i[1]]), "the letter (ready to turn in) has the check; the wolves and the far quest none").toEqual([[false, "nil"], [true, "Check"], [false, "nil"]]);
  expect(isTok(addon, icons[1][2], "white"), "the check is untinted").toBe(true);
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
  addon.eval("QuestInfo_Display()");
  expect([isTok(addon, addon.eval("return QuestInfoDescriptionText.__textColor"), "text"), isTok(addon, addon.eval("return QuestInfoTitleHeader.__textColor"), "text")], "quest text and the headings (the quest's name too) go light after the game colors them").toEqual([true, true]);
  addon.eval("QuestInfoTitleHeader:SetTextColor(0.2, 0.1, 0) QuestFrame_SetTitleTextColor(QuestInfoTitleHeader)");
  expect(isTok(addon, addon.eval("return QuestInfoTitleHeader.__textColor"), "text"), "and when the game recolors a heading on its own").toBe(true);
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

it("quest log: Ctrl-click marks quests, the Abandon button counts them, and one question abandons them all", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + "__gone = {} C_QuestLog.AbandonQuest = function() __gone[#__gone + 1] = __selected end");
  addon.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  addon.eval("ns.GetModule('QuestLog').AbandonMarked()");
  expect(addon.eval("return Vanguard_Question"), "nothing marked: no question").toBe(null);
  addon.eval("__wfgWorld.keys.ctrl = true");
  logLine(addon, 1); logLine(addon, 2); logLine(addon, 2);
  expect(addon.eval("return Vanguard_QuestLog.buttons.abandon.text:GetText()"), "two marked, one unmarked again: Abandon 1").toBe("Abandon 1");
  logLine(addon, 3);
  expect([addon.eval("local l = Vanguard_QuestLog.lines return { l[1].selected, l[2].selected, l[3].selected }"), addon.eval("return Vanguard_QuestLog.buttons.abandon.text:GetText()")], "marked lines look chosen; Abandon 2").toEqual([[true, false, true], "Abandon 2"]);
  addon.eval("__wfgWorld.keys.ctrl = false");
  logButton(addon, "abandon");
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "one question naming the quests, in log order").toBe("Abandon 2 quest(s)?\nTEST-ONLY Wolves\nTEST-ONLY Far");
  expect(addon.eval("return __gone"), "nothing abandoned before the answer").toEqual({});
  addon.click("Vanguard_Question.confirm");
  expect([addon.eval("return __gone"), addon.eval("return Vanguard_QuestLog.buttons.abandon.text:GetText()")], "each marked quest abandoned; the marks are cleared").toEqual([[90051, 90053], "Abandon"]);
});
// TEST-ONLY quest history: the clock at three days past the seeded turn-ins, and a store another character wrote.
const HISTORY_ENV = `
  time = function() return 1000000 + 3 * 86400 end
`;
const HISTORY_SAVED = `VanguardDB.questHistory = { count = 2, quests = {
  [90051] = { who = "Thrall-Forever", class = "SHAMAN", t = 1000000, title = "TEST-ONLY Wolves" },
  [90052] = { who = "Tester-ForeverTest", class = "MAGE", t = 1000000 + 3 * 86400 } } }`;
// The quest history store: { count, entries as "id|who|class|time|title" }.
const historyStore = (addon) => addon.eval("local s = VanguardDB.questHistory local out = {} for id, r in pairs(s.quests) do out[#out + 1] = id .. '|' .. r.who .. '|' .. tostring(r.class) .. '|' .. r.t .. '|' .. tostring(r.title) end table.sort(out) return { s.count, out }");
it("quest history: a turn-in is recorded for the account, one entry per quest, ignoring ids the client hides", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + HISTORY_ENV + `
  C_QuestLog.GetTitleForQuestID = function(id) return id == 90051 and "TEST-ONLY Wolves" or nil end`);
  addon.fire("QUEST_TURNED_IN", 90051, 250, 100);
  expect(historyStore(addon), "the quest, who turned it in (name-realm), their class file, when, and its title").toEqual([1, ["90051|Tester-ForeverTest|MAGE|1259200|TEST-ONLY Wolves"]]);
  addon.fire("QUEST_TURNED_IN", 90051, 250, 100);
  addon.fire("QUEST_TURNED_IN", "90052");
  addon.fire("QUEST_TURNED_IN", addon.world.secret(90053));
  addon.fire("QUEST_TURNED_IN");
  expect(historyStore(addon)[0], "a repeat turn-in replaces the entry; a text, a hidden or a missing id is ignored").toBe(1);
  addon.eval("ns.GetModule('QuestHistory').MAX_QUESTS = 3 time = function() return 2000000 end");
  for (const id of [90061, 90062, 90063, 90064]) {
    addon.eval(`time = function() return ${2000000 + id} end`);
    addon.fire("QUEST_TURNED_IN", id);
  }
  expect(historyStore(addon), "past the cap (90063 was the fourth) the oldest turn-ins go, down to 90 %, then it grows again").toEqual([3, [90062, 90063, 90064].map((id) => `${id}|Tester-ForeverTest|MAGE|${2000000 + id}|nil`)]);
});
it("quest history: a client that hides your name, or has no clock, does not fail", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + `
  UnitName = function() return nil end C_QuestLog.GetTitleForQuestID = nil`);
  addon.fire("QUEST_TURNED_IN", 90051);
  expect(historyStore(addon)[0], "no name, no entry").toBe(0);
  addon.eval("UnitName = function() return 'Tester' end time = nil");
  addon.fire("QUEST_TURNED_IN", 90051);
  expect(addon.eval("local r = VanguardDB.questHistory.quests[90051] return { r.t, r.title or false }"), "no clock: time 0; no title lookup: none").toEqual([0, false]);
});
it("quest history: the quest log says which character did the quest, and the setting turns it all off", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + HISTORY_ENV, { savedVariables: HISTORY_SAVED });
  const muted = addon.eval("return ns.Theme.Hex('muted')");
  addon.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  expect(questLog(addon).objectives, "another character's turn-in, muted, under the objectives").toBe(`Objectives\n- 3/8 TEST-ONLY Wolves slain\n+ 1/1 TEST-ONLY Pelt\n\n|c${muted}Done on Thrall-Forever · 3 days ago|r`);
  logLine(addon, 2);
  expect(questLog(addon).objectives, "this character's own, for a quest with no objectives: today, on this character").toBe(`|c${muted}Done on this character · today|r`);
  logLine(addon, 3);
  expect(questLog(addon).objectives.includes("Done on"), "a quest nobody finished has no line").toBe(false);
  const off = loggedIn(TRACK_ENV + QLOG_ENV + HISTORY_ENV, { savedVariables: HISTORY_SAVED + ` VanguardDB.profiles = { Default = { QuestHistory = { track = false } } }` });
  off.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  off.fire("QUEST_TURNED_IN", 90053);
  expect([questLog(off).objectives.includes("Done on"), off.eval("return VanguardDB.questHistory.count")], "off: no line, nothing recorded").toEqual([false, 2]);
});
it("quest history: the quest dialog's details say who did the quest, muted under the objectives, and a quest nobody did has none", () => {
  const addon = loggedIn(QUEST_ENV + HISTORY_ENV + `
  __id = 90051 GetQuestID = function() return __id end`, { savedVariables: HISTORY_SAVED });
  addon.fire("QUEST_DETAIL");
  // The history line: shown, text.
  const shown = () => addon.eval("local h = Vanguard_QuestDialog.history return { h:IsShown(), h:GetText() }");
  expect(shown(), "Done on Thrall-Forever, 3 days ago").toEqual([true, "Done on Thrall-Forever · 3 days ago"]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestDialog.history.__textColor"), "muted"), "in the muted color").toBe(true);
  addon.eval("__id = 90099");
  addon.fire("QUEST_DETAIL");
  expect(shown(), "a quest nobody did: no line").toEqual([false, ""]);
  addon.eval("__id = 90052 GetObjectiveText = function() return nil end VanguardDB.questHistory.quests[90052].who = '<name>-ForeverTest'");
  addon.fire("QUEST_DETAIL");
  expect(shown(), "with no objectives the line sits under the text").toEqual([true, "Done on this character · today"]);
  const off = loggedIn(QUEST_ENV + HISTORY_ENV + `
  __id = 90051 GetQuestID = function() return __id end`, { savedVariables: HISTORY_SAVED + ` VanguardDB.profiles = { Default = { QuestHistory = { track = false } } }` });
  off.fire("QUEST_DETAIL");
  expect(off.eval("return Vanguard_QuestDialog.history:IsShown()"), "history off: the dialog draws no line").toBe(false);
});
it("quest history: /vg quests history [n] lists the latest turn-ins, newest first, and /vg quests still opens the log", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV + HISTORY_ENV + `
  C_QuestLog.GetTitleForQuestID = function(id) return id == 90052 and "TEST-ONLY Letter" or nil end`, { savedVariables: HISTORY_SAVED });
  addon.slash("quests history");
  // The last n chat lines without the Vanguard prefix color.
  const said = (n) => addon.chat().slice(-n).map((l) => l.replace(/^\|c\w{8}Vanguard:\|r /, "Vanguard: "));
  expect(said(3), "a heading with the count, then each quest with who and when; a title the store lacks is asked of the client").toEqual([
    "Vanguard: Latest 2 quest turn-in(s), of 2 remembered:", "Vanguard: TEST-ONLY Letter · Tester-ForeverTest · today", "Vanguard: TEST-ONLY Wolves · Thrall-Forever · 3 days ago"]);
  addon.eval("VanguardDB.questHistory.quests[90053] = { who = 'Jaina-Forever', t = 1 } VanguardDB.questHistory.count = 3");
  addon.slash("quests history 1");
  expect(said(2), "a number limits the list").toEqual(["Vanguard: Latest 1 quest turn-in(s), of 3 remembered:", "Vanguard: TEST-ONLY Letter · Tester-ForeverTest · today"]);
  addon.slash("quests history 99");
  expect(said(1), "a title nobody knows reads Quest <id>").toEqual(["Vanguard: Quest 90053 · Jaina-Forever · 14 days ago"]);
  addon.slash("quests");
  expect(addon.eval("return Vanguard_QuestLog:IsShown()"), "without history, the quest log toggles").toBe(true);
  addon.eval("VanguardDB.questHistory.quests = {}");
  addon.slash("quests history");
  expect(said(1), "nothing remembered").toEqual(["Vanguard: No turn-ins remembered yet."]);
  const off = loggedIn(TRACK_ENV + QLOG_ENV, { savedVariables: `VanguardDB.profiles = { Default = { QuestHistory = { track = false } } }` });
  off.slash("quests history");
  expect(chatHas(off, /Quest history is off/), "switched off").toBe(true);
});
it("quest automation: a quest a player shares follows its own switch, and Shift skips it", () => {
  // Makes the quest on offer come from a player.
  const shared = (addon) => addon.eval("UnitIsPlayer = function(unit) return unit == 'npc' and __sharer == true end __sharer = true");
  const addon = loggedIn(QUEST_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestAuto = { accept = true } } }" });
  shared(addon);
  addon.fire("QUEST_DETAIL");
  expect([dialog(addon).shown, calls(addon)], "Accept quests alone leaves a player's quest to you").toEqual([true, []]);
  const on = loggedIn(QUEST_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestAuto = { acceptShared = true } } }" });
  shared(on);
  on.fire("QUEST_DETAIL");
  expect([dialog(on).shown, calls(on), chatHas(on, /Accepted: TEST-ONLY Wolves \(shared by TEST-ONLY Farmer\)/)], "a shared quest is accepted and chat says who shared it").toEqual([false, ["accept nil"], true]);
  on.eval("__shift = true");
  on.fire("QUEST_DETAIL");
  expect([dialog(on).shown, calls(on)], "holding Shift: the dialog, as usual").toEqual([true, []]);
  on.eval("__shift, __sharer = false, false");
  on.fire("QUEST_DETAIL");
  expect([dialog(on).shown, calls(on)], "a quest from an NPC is not covered by the shared switch").toEqual([true, []]);
  on.eval("__sharer = { __secret = true } UnitIsPlayer = function() return __sharer end");
  on.fire("QUEST_DETAIL");
  expect(calls(on), "a hidden answer counts as an NPC").toEqual([]);
});
it("quest log: each line shows its quest's XP at the right, with thousands set apart, and the switch turns it off", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval("Vanguard_QuestLogToggle.__scripts.OnClick(Vanguard_QuestLogToggle)");
  // The XP text on each quest log line.
  const xps = () => addon.eval("local f, out = Vanguard_QuestLog, {} for i = 1, f.lines.used do out[i] = f.lines[i].xp:GetText() end return out");
  expect(xps(), "450 XP on each of the three quests").toEqual(["450 XP", "450 XP", "450 XP"]);
  expect(addon.eval("local QP = ns.QuestParts return { QP.XPText(1250), QP.XPText(1234567), QP.XPText(99.9) }"), "set apart by commas, whole numbers").toEqual(["1,250 XP", "1,234,567 XP", "99 XP"]);
  expect(isTok(addon, addon.eval("return Vanguard_QuestLog.lines[1].xp.__textColor"), "text2"), "muted").toBe(true);
  addon.eval("ns.GetModule('QuestLog').settings.xp = false ns.GetModule('QuestLog').Refresh()");
  expect(xps(), "off: no XP on the lines").toEqual(["", "", ""]);
  addon.eval("GetQuestLogRewardXP = function() return 0 end ns.GetModule('QuestLog').settings.xp = true ns.GetModule('QuestLog').Refresh()");
  expect(xps(), "a quest worth nothing shows none").toEqual(["", "", ""]);
});
