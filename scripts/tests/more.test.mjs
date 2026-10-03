// more: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { AFK_ENV, CLICK_LUA, HEALING_ENV, MICRO_ENV, PLATE_ENV, QUEST_ENV, RAID_ENV, STRIPS_ENV, STRIP_ENV, TIDY_ENV, TOOLS_ENV, UI_ENV, UNITS_ENV, bars, block, borderOf, button, calls, chatHas, isTok, key, later, loggedIn, marks, pinned, plate, putAway, raidButton, setCombat, strips } from "./helpers.mjs";

it("minimap", () => {
  const addon = loggedIn(UI_ENV);
  const mm = addon.eval(`return { parent = Minimap:GetParent():GetName(), mask = Minimap.__maskTexture,
    size = Minimap.__width, zone = ns.GetModule("Minimap").zone:GetText(), zoneColor = ns.GetModule("Minimap").zone.__textColor,
    border = MinimapCluster.BorderTop.__alpha, zoomIn = Minimap.ZoomIn.__alpha, shape = GetMinimapShape() }`);
  expect(mm.parent === "ForeverUI_Minimap" && mm.size === 180, "the minimap moves into the themed holder at 180 px").toBeTruthy();
  expect(mm.shape === "SQUARE", "GetMinimapShape tells other addons it is square").toBeTruthy();
  expect(mm.zone === "TEST-ONLY Vale" && isTok(addon, mm.zoneColor, "zoneContested"), "zone text on top, colored for contested").toBeTruthy();
  expect(mm.border === 0 && mm.zoomIn === 0, "border art and zoom buttons are faded").toBeTruthy();
  addon.update(0.25);
  expect(addon.eval('return ns.GetModule("Minimap").coords:GetText()') === "45.7, 12.3", "coordinates under the map").toBeTruthy();
  addon.eval("Minimap:GetScript('OnMouseWheel')(Minimap, 1)");
  expect(addon.eval("return Minimap:GetZoom()") === 1, "the mouse wheel zooms in").toBeTruthy();
  addon.eval("for _ = 1, 10 do Minimap:GetScript('OnMouseWheel')(Minimap, 1) end");
  expect(addon.eval("return Minimap:GetZoom()") === 5, "and stops at the last zoom level").toBeTruthy();
  addon.eval("C_Map.GetPlayerMapPosition = function() return { GetXY = function() return { __secret = true }, 0.5 end } end");
  addon.update(0.25);
  expect(addon.eval('return ns.GetModule("Minimap").coords:GetText()') === "", "secret or missing coordinates show nothing").toBeTruthy();
  expect(addon.eval("return ns.MoverList()[1] ~= nil") === true, "the minimap is movable").toBeTruthy();
});

it("chat", () => {
  const addon = loggedIn(UI_ENV);
  const c = addon.eval(`return { font = { ChatFrame1:GetFont() }, box = ns.Theme.PaintedCount(),
    tab1 = ChatFrame1Tab.Text.__textColor, tab2 = ChatFrame2Tab.Text.__textColor }`);
  expect(c.font[0] === "Interface\\AddOns\\ForeverUI\\Media\\Fonts\\FiraSansCondensed-Medium.ttf" && c.font[1] === 12, `chat windows get the theme font at Medium, 12 (got ${JSON.stringify(c.font)})`).toBeTruthy();
  expect(isTok(addon, c.tab2, "accent") && isTok(addon, c.tab1, "text2"), "the selected window's tab is accent, others gray").toBeTruthy();
  addon.slash("accent ember");
  expect(isTok(addon, addon.eval("return ChatFrame2Tab.Text.__textColor"), "accent"), "tabs follow accent changes").toBeTruthy();
});

it("bags", () => {
  const addon = loggedIn(UI_ENV);
  expect(addon.eval("return __cvars.combinedBags") === "1", "combined bags are turned on").toBeTruthy();
  addon.eval("ContainerFrameCombinedBags:Show()");
  const b = addon.eval("return { border = __item.IconBorder.__alpha, painted = ns.Theme.PaintedCount() }");
  expect(b.border === 0, "item slot art is faded when the bag opens").toBeTruthy();
  addon.eval("ContainerFrameCombinedBags:Hide(); ContainerFrameCombinedBags:Show()");
  expect(addon.eval("return ns.Theme.PaintedCount()") === b.painted, "reopening repaints, it doesn't pile up").toBeTruthy();
});

// TEST-ONLY bank, search boxes, character pane slots and mail, with hooks that run after the original.
const GEAR_ENV = `
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then return end local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  BagItemSearchBox = CreateFrame("EditBox", "BagItemSearchBox", ContainerFrameCombinedBags)
  BankFrame = CreateFrame("Frame", "BankFrame", UIParent) BankFrame:Hide()
  BankPanel = CreateFrame("Frame", "BankPanel", BankFrame)
  BankItemSearchBox = CreateFrame("EditBox", "BankItemSearchBox", BankFrame)
  __bankItems = {}
  BankPanel.itemButtonPool = { EnumerateActive = function() local i = 0 return function() i = i + 1 return __bankItems[i] end end }
  function BankPanel:GenerateItemSlotsForSelectedTab() local b = CreateFrame("Button", nil, self) b.IconBorder = b:CreateTexture() __bankItems[#__bankItems + 1] = b end
  BankPanel:GenerateItemSlotsForSelectedTab()
  CharacterFrame = CreateFrame("Frame", "CharacterFrame", UIParent) CharacterFrame:Hide()
  for slot, id in pairs({ Head = 1, Neck = 2, Legs = 7 }) do CreateFrame("Button", "Character" .. slot .. "Slot", CharacterFrame).GetID = function() return id end end
  MailFrame = CreateFrame("Frame", "MailFrame", UIParent) MailFrame:Hide()
  OpenAllMail = CreateFrame("Button", "OpenAllMail", MailFrame)
`;

it("bags and bank: item quality borders, the search boxes and the bank in the theme", () => {
  const addon = loggedIn(UI_ENV + GEAR_ENV);
  addon.eval("ContainerFrameCombinedBags:Show() __item.IconBorder:SetVertexColor(0.1, 0.4, 1)");
  expect(borderOf(addon, "__item"), "a rare item's slot border takes its quality color").toEqual([0.1, 0.4, 1, 1]);
  addon.eval("__item.IconBorder:Hide()");
  expect(borderOf(addon, "__item"), "no quality, the theme's border").not.toEqual([0.1, 0.4, 1, 1]);
  expect(borderOf(addon, "BagItemSearchBox") !== undefined, "the bag's search box is in the theme").toBe(true);
  addon.eval("BankFrame:Show()");
  expect([borderOf(addon, "BankFrame") !== undefined, borderOf(addon, "__bankItems[1]") !== undefined, borderOf(addon, "BankItemSearchBox") !== undefined], "the bank window, its slots and its search box").toEqual([true, true, true]);
  addon.eval("BankPanel:GenerateItemSlotsForSelectedTab()");
  expect(borderOf(addon, "__bankItems[2]") !== undefined, "slots of another bank tab too").toBe(true);
  const off = loggedIn(UI_ENV + GEAR_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Bags = { bank = false } } }" });
  off.eval("BankFrame:Show()");
  expect(borderOf(off, "__bankItems[1]") == null, "switched off, the bank stays the game's").toBe(true);
});

// TEST-ONLY spies counting the theme's painting calls, and a bag window the game fills with UpdateItems.
const BAG_SPY_ENV = `
  __paint = { Panel = 0, FadeRegions = 0, SetBorder = 0 }
  function ContainerFrameCombinedBags:UpdateItems() end
`;
// Wraps the theme's painting calls in counters (after login, so the addon's own calls go through them).
const BAG_SPIES = `for name in pairs(__paint) do local real = ns.Theme[name] ns.Theme[name] = function(...) __paint[name] = __paint[name] + 1 return real(...) end end`;
// The painting counts so far, then reset.
const painted = (addon) => addon.eval("local c = { __paint.Panel, __paint.FadeRegions, __paint.SetBorder } for k in pairs(__paint) do __paint[k] = 0 end return c");

it("bags: each slot is skinned once, the window on show, a border only when its color changes", () => {
  const addon = loggedIn(UI_ENV + GEAR_ENV + BAG_SPY_ENV);
  addon.eval(BAG_SPIES);
  addon.eval("ContainerFrameCombinedBags:Show()");
  expect(painted(addon), "opening paints the window and its one slot, and fades the window and the new search box").toEqual([2, 2, 0]);
  addon.fire("BAG_UPDATE_DELAYED");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(painted(addon), "bag updates while open repaint nothing").toEqual([0, 0, 0]);
  addon.eval(`__new = CreateFrame("Button", nil, ContainerFrameCombinedBags) __new.IconBorder = __new:CreateTexture()
    ContainerFrameCombinedBags.EnumerateValidItems = function() return ipairs({ __item, __new }) end
    ContainerFrameCombinedBags:UpdateItems()`);
  expect([painted(addon), addon.eval("return __new.fuiSkinned"), borderOf(addon, "__new") !== undefined], "a slot the game adds is skinned when it fills the slots, the old one is left alone").toEqual([[1, 0, 0], true, true]);
  addon.eval("for _ = 1, 3 do __item.IconBorder:SetVertexColor(0.1, 0.4, 1) end");
  expect([painted(addon)[2], borderOf(addon, "__item")], "the same quality color three times: one repaint").toEqual([1, [0.1, 0.4, 1, 1]]);
  addon.eval("__item.IconBorder:Hide() __item.IconBorder:Hide() __item.IconBorder:SetVertexColor(0.1, 0.4, 1)");
  expect(painted(addon)[2], "back to the theme's border once, then the color again").toBe(2);
  addon.eval("local s = { __secret = true } for _ = 1, 2 do __item.IconBorder:SetVertexColor(s, s, s) end __item.IconBorder:SetVertexColor(0.1, 0.4, 1)");
  expect(painted(addon)[2], "a secret color is never compared: every call repaints, and so does the next plain color").toBe(3);
  addon.eval("ContainerFrameCombinedBags:Hide() ContainerFrameCombinedBags:Show()");
  expect(painted(addon), "reopening fades and panels the window again, no slot").toEqual([1, 1, 0]);
});

it("character pane durability, the mail's Open All button", () => {
  const addon = loggedIn(UNITS_ENV + UI_ENV + STRIP_ENV + GEAR_ENV);
  // A gear slot's durability label: shown, text and color.
  const slot = (name) => addon.eval(`local l = Character${name}Slot.fuiDurability return l and { l:IsShown(), l:GetText(), l.__textColor } or false`);
  expect(slot("Head"), "nothing painted while the pane is shut").toBe(false);
  addon.eval("CharacterFrame:Show()");
  const legs = slot("Legs");
  expect([slot("Head").slice(0, 2), legs[1], isTok(addon, legs[2], "bad"), slot("Neck")[0]], "worn gear shows its durability, red when nearly broken; no durability, no label").toEqual([[true, "30%"], "9%", true, false]);
  addon.eval("__dur[1] = { 100, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(slot("Head")[0], "repaired, the label goes").toBe(false);
  addon.eval("MailFrame:Show()");
  expect(borderOf(addon, "OpenAllMail") !== undefined, "the mail's Open All button is themed").toBe(true);
  const off = loggedIn(UNITS_ENV + UI_ENV + STRIP_ENV + GEAR_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Windows = { durability = false } } }" });
  off.eval("CharacterFrame:Show()");
  expect(off.eval("return CharacterHeadSlot.fuiDurability == nil"), "switched off, no labels").toBe(true);
});

// TEST-ONLY chat hooks: the game's message filters and link callback, and the lines the main window holds.
const CHAT_EXTRAS_ENV = `
  __filters, __lines = {}, {}
  ChatFrame_AddMessageEventFilter = function(event, fn) __filters[event] = fn end
  EventRegistry = { RegisterCallback = function(self, event, fn) __linkCallback = fn end }
  ChatFrame1.GetNumMessages = function() return #__lines end
  ChatFrame1.GetMessageInfo = function(_, i) return __lines[i] end
`;

it("chat extras: web links you can copy, and a Copy button for the recent chat", () => {
  const addon = loggedIn(UI_ENV + CHAT_EXTRAS_ENV);
  addon.eval("ns.ShowText = function(title, text) __shown = { title, text } end");
  const linked = addon.eval('return { __filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", "see https://example.test/a?b=1 or www.example.test now", "<name>") }');
  expect(linked[0] === false && linked[2] === "<name>", "the message passes on, with the rest of its details").toBe(true);
  expect(linked[1].includes("|Haddon:ForeverUI:url:https://example.test/a?b=1|h[https://example.test/a?b=1]|h") && linked[1].includes("|h[www.example.test]|h"), "both addresses become links").toBe(true);
  expect(addon.eval('return { select("#", __filters.CHAT_MSG_GUILD(nil, "CHAT_MSG_GUILD", "no address here")), select("#", __filters.CHAT_MSG_GUILD(nil, "x", { __secret = true })) }'), "nothing to link, or hidden text: the message is left as it is").toEqual([1, 1]);
  addon.eval('__linkCallback(nil, "addon:ForeverUI:url:https://example.test/a") __linkCallback(nil, "addon:OtherAddon:thing")');
  expect(addon.eval("return __shown"), "clicking one opens it ready to copy; other addons' links are left to them").toEqual(["Copy the address (Ctrl+C)", "https://example.test/a"]);
  addon.eval('__lines = { "|cffff8000[TEST-ONLY General]|r hi |Hitem:90001|h[TEST-ONLY Sword]|h", { __secret = true }, "two |TTEST-ONLY-ICON:0|tlines" }');
  addon.eval("local b = ns.GetModule('ChatExtras').copyButton b.__scripts.OnClick(b)");
  expect(addon.eval("return __shown"), "the Copy button gives plain text; hidden lines are left out").toEqual(["Copy chat (Ctrl+C)", "[TEST-ONLY General] hi [TEST-ONLY Sword]\ntwo lines"]);
  const bare = loggedIn("ChatFrame1 = nil");
  bare.slash("copy");
  expect(chatHas(bare, /can't read the chat back/) && bare.eval("return ns.GetModule('ChatExtras').copyButton == nil"), "a client that can't read chat back says so").toBe(true);
  const off = loggedIn(UI_ENV + CHAT_EXTRAS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { ChatExtras = { links = false } } }" });
  expect(off.eval("return next(__filters) == nil"), "links switched off: no filters").toBe(true);
});

// TEST-ONLY addon minimap buttons (the LibDBIcon kind) and one that isn't.
const DRAWER_ENV = `
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then return end local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  CreateFrame("Button", "LibDBIcon10_TestOnlyOne", Minimap)
  CreateFrame("Button", "TestOnlyOtherButton", Minimap)
`;

it("minimap drawer: addon buttons gathered beside the map", () => {
  const addon = loggedIn(UI_ENV + DRAWER_ENV);
  // A button's parent and its spot in the drawer.
  const spot = (name) => addon.eval(`local b = ${name} local p = b.__points.TOPLEFT return { b:GetParent():GetName(), p and p.x, p and p.y }`);
  expect([addon.eval("return { ForeverUI_MinimapDrawerToggle:IsShown(), ForeverUI_MinimapDrawer:IsShown() }"), spot("LibDBIcon10_TestOnlyOne")], "gathered into the shut drawer, the toggle showing").toEqual([[true, false], ["ForeverUI_MinimapDrawer", 4, -4]]);
  expect(addon.eval("return TestOnlyOtherButton:GetParent():GetName()"), "other minimap children are left alone").toBe("Minimap");
  addon.eval("local t = ForeverUI_MinimapDrawerToggle t.__scripts.OnClick(t)");
  expect(addon.eval("return ForeverUI_MinimapDrawer:IsShown()"), "the toggle opens it").toBe(true);
  addon.eval('CreateFrame("Button", "LibDBIcon10_TestOnlyTwo", Minimap)');
  addon.fire("PLAYER_ENTERING_WORLD");
  expect([spot("LibDBIcon10_TestOnlyTwo"), addon.eval("return ForeverUI_MinimapDrawer:GetWidth()")], "a late button joins the next cell; the drawer fits").toEqual([["ForeverUI_MinimapDrawer", 32, -4], 62]);
  addon.eval('LibDBIcon10_TestOnlyOne:ClearAllPoints() LibDBIcon10_TestOnlyOne:SetPoint("CENTER", Minimap, "CENTER")');
  expect(spot("LibDBIcon10_TestOnlyOne"), "when its addon moves it back, it returns to its cell").toEqual(["ForeverUI_MinimapDrawer", 4, -4]);
  const off = loggedIn(UI_ENV + DRAWER_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { MinimapButtons = { drawer = false } } }" });
  expect(off.eval("return { LibDBIcon10_TestOnlyOne:GetParent():GetName(), ForeverUI_MinimapDrawer == nil }"), "switched off, they stay on the map").toEqual(["Minimap", true]);
});

// TEST-ONLY prompts: every answer is recorded.
const PROMPT_ENV = `
  __answers = {}
  local function log(text) return function() __answers[#__answers + 1] = text end end
  C_SummonInfo = { ConfirmSummon = log("summon"), GetSummonConfirmSummoner = function() return "<name>" end, GetSummonConfirmAreaName = function() return "TEST-ONLY Vale" end }
  AcceptResurrect, CancelDuel = log("resurrect"), log("decline")
  StaticPopup_Hide = function(which) __answers[#__answers + 1] = "close " .. which end
`;

it("auto-accept: summons, resurrections and duels, each off until switched on", () => {
  // Brings up all three prompts.
  const fire = (addon) => { addon.fire("CONFIRM_SUMMON"); addon.fire("RESURRECT_REQUEST", "<name>"); addon.fire("DUEL_REQUESTED", { __secret: true }); };
  const off = loggedIn(PROMPT_ENV);
  fire(off);
  expect(off.eval("return #__answers"), "off by default: the game asks as usual").toBe(0);
  const on = loggedIn(PROMPT_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { AutoAccept = { summons = true, resurrect = true, duels = true } } }" });
  fire(on);
  expect(on.eval("return __answers"), "each answered, its prompt closed").toEqual(["summon", "close CONFIRM_SUMMON", "resurrect", "close RESURRECT", "close RESURRECT_NO_SICKNESS", "decline", "close DUEL_REQUESTED"]);
  expect(chatHas(on, /summon from <name> to TEST-ONLY Vale/) && chatHas(on, /resurrection from <name>/) && chatHas(on, /duel from someone/), "and said in chat (a hidden name reads as someone)").toBe(true);
  on.eval("__answers = {}");
  setCombat(on, true);
  on.fire("CONFIRM_SUMMON");
  expect(on.eval("return #__answers"), "no summons in combat").toBe(0);
});

// The quest dialog's state: shown, header, body, lines, cards, money and buttons.
const dialog = (addon) => addon.eval(`local f = ForeverUI_QuestDialog
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
  expect([g.shown, g.npc, g.text, g.primary, addon.eval("return ForeverUI_QuestDialog.portrait.__portrait")], "the NPC's portrait, name and greeting").toEqual([true, "TEST-ONLY Farmer", "TEST-ONLY Well met, <name>.", "Goodbye", "npc"]);
  expect(g.lines, "quests to take, to turn in, then the options, numbered").toEqual(["1.  [8] TEST-ONLY Wolves", "2.  [12] TEST-ONLY Letter", "3.  TEST-ONLY Tell me more"]);
  expect(isTok(addon, addon.eval("return ForeverUI_QuestDialog.lines[2].text.__textColor"), "gold"), "a quest ready to turn in is gold").toBe(true);
  key(addon, "2"); key(addon, "7"); key(addon, "W");
  addon.eval("local b = ForeverUI_QuestDialog.lines[3] b.__scripts.OnClick(b)");
  expect(calls(addon), "a number key picks its line (keys with no line, and other keys, are left to the game); so does a click").toEqual(["active 90032", "option 90041"]);
  addon.fire("GOSSIP_CLOSED");
  expect([dialog(addon).shown, calls(addon)], "the game closing the talk hides it without closing again").toEqual([false, []]);
  addon.fire("QUEST_DETAIL");
  const d = dialog(addon);
  expect([d.title, d.text, d.objectives, d.money, d.primary, d.secondary], "a quest's details, with Accept and Decline").toEqual(["TEST-ONLY Wolves", "TEST-ONLY Wolves trouble the farm.", "Objectives:  Slay 8 TEST-ONLY Wolves.", "+12s 0c  ·  450 XP", "Accept", "Decline"]);
  expect([d.cards, borderOf(addon, "ForeverUI_QuestDialog.cards[1]")], "reward cards, a rare one in its quality color").toEqual([["TEST-ONLY Boots", "TEST-ONLY Gloves", "TEST-ONLY Bread"], [0, 0.44, 0.87, 1]]);
  addon.eval("local c = ForeverUI_QuestDialog.cards[3] c.__scripts.OnEnter(c) c.__scripts.OnLeave(c) ForeverUI_QuestDialog.scroll.__scripts.OnMouseWheel(ForeverUI_QuestDialog.scroll, -1)");
  expect(addon.eval("return GameTooltip.__questItem"), "hovering a card shows its item").toBe("reward 1");
  key(addon, "SPACE");
  addon.eval("ForeverUI_QuestDialog.secondary.__scripts.OnClick(ForeverUI_QuestDialog.secondary)");
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
  expect(addon.eval("local c = ForeverUI_QuestDialog.cards return { c[1].picked:IsShown(), c[2].picked:IsShown(), ForeverUI_QuestDialog.primary:IsEnabled() }"), "2 picks the gloves (9 has no reward)").toEqual([false, true, true]);
  addon.eval("local c = ForeverUI_QuestDialog.cards[1] c.__scripts.OnClick(c) c = ForeverUI_QuestDialog.cards[3] c.__scripts.OnClick(c)");
  key(addon, "SPACE");
  expect(calls(addon), "a click picks too (bread is no choice); Space takes it").toEqual(["reward 1"]);
  addon.eval("__choices = { __choices[1] }");
  addon.fire("QUEST_COMPLETE");
  key(addon, "SPACE");
  expect(calls(addon), "one reward: no pick needed").toEqual(["reward 1"]);
  addon.fire("QUEST_GREETING");
  addon.eval("local b = ForeverUI_QuestDialog.lines[1] b.__scripts.OnClick(b)");
  expect([dialog(addon).lines, calls(addon)], "a quest giver without gossip").toEqual([["1.  [5] TEST-ONLY Rats"], ["greetAvail 1"]]);
  addon.eval("__greetAvail, __greetActive = 0, 1 C_GossipInfo.GetText = function() return { __secret = true } end");
  addon.fire("QUEST_GREETING");
  expect(dialog(addon).lines, "a quest of yours still in progress").toEqual(["1.  [6] TEST-ONLY Parcel"]);
  addon.fire("GOSSIP_SHOW");
  expect(dialog(addon).text, "text the client hides shows as …").toBe("…");
  addon.eval("ForeverUI_QuestDialog:Hide()");
  expect(calls(addon), "Escape or Goodbye ends the talk").toEqual(["closeGossip nil", "closeQuest nil"]);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  key(addon, "SPACE");
  setCombat(addon, false);
  expect(addon.eval("return { QuestFrame:IsEventRegistered('QUEST_DETAIL'), QuestFrame:IsEventRegistered('QUEST_LOG_UPDATE'), CustomGossipFrameManager:IsEventRegistered('GOSSIP_SHOW') }"), "the game's windows no longer open for these talks (their other events stay)").toEqual([false, true, false]);
  const off = loggedIn(QUEST_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { QuestDialog = { dialog = false } } }" });
  expect(off.eval("return { ForeverUI_QuestDialog == nil, QuestFrame:IsEventRegistered('QUEST_DETAIL') }"), "switched off, the game's windows stay").toEqual([true, true]);
});

// The quest dialog's body scroll: its child's height, how far it can scroll, and where it is.
const bodyScroll = (addon) => addon.eval(`local f = ForeverUI_QuestDialog return { f.child:GetHeight(), f.scroll:GetVerticalScrollRange(), f.scroll:GetVerticalScroll() }`);

// Turns the quest dialog's body scroll by one wheel step of this delta.
const wheelBody = (addon, delta) => addon.eval(`local s = ForeverUI_QuestDialog.scroll s.__scripts.OnMouseWheel(s, ${delta})`);

it("quest dialog: a long greeting or quest text scrolls, a short one does not", () => {
  const addon = loggedIn(QUEST_ENV);
  addon.fire("GOSSIP_SHOW");
  expect(bodyScroll(addon), "a short greeting fits the 132 px body: nothing to scroll").toEqual([132, 0, 0]);
  wheelBody(addon, -1);
  expect(bodyScroll(addon)[2], "the wheel stays at the top when there is no range").toBe(0);
  addon.eval('__greeting = "TEST-ONLY " .. string.rep("word ", 400)');
  addon.fire("GOSSIP_SHOW");
  expect(bodyScroll(addon), "2010 characters wrap to 24 lines (336 px) plus three numbered lines (60 px): the child grows to hold them").toEqual([410, 278, 0]);
  wheelBody(addon, -1);
  expect(bodyScroll(addon)[2], "the wheel scrolls down a step").toBe(24);
  wheelBody(addon, -50);
  expect(bodyScroll(addon)[2], "and stops at the end of the content").toBe(278);
  wheelBody(addon, 100);
  expect(bodyScroll(addon)[2], "and at the top going back").toBe(0);
  wheelBody(addon, -1);
  addon.fire("GOSSIP_SHOW");
  expect(bodyScroll(addon)[2], "a new page starts at the top").toBe(0);
  addon.eval('GetQuestText = function() return "TEST-ONLY " .. string.rep("word ", 300) end');
  addon.fire("QUEST_DETAIL");
  expect(bodyScroll(addon), "a quest's text and its objectives (24 + 14 px lines) count too, and no numbered lines").toEqual([278, 146, 0]);
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
  expect([dialog(addon).cards[0], addon.eval("return ForeverUI_QuestDialog.cards[2].picked:IsShown()")], "an item the game just loaded shows; the pick stays").toEqual(["TEST-ONLY Better Boots", true]);
  addon.eval("ForeverUI_QuestDialog:Hide() __choices[1][1] = 'TEST-ONLY Later'");
  addon.fire("QUEST_ITEM_UPDATE");
  expect(dialog(addon).cards[0], "closed, nothing redraws").toBe("TEST-ONLY Better Boots");
  addon.eval("C_QuestInfoSystem = nil");
  expect(addon.eval("return #ns.GetModule('QuestDialog').ExtraRewards(90031)"), "a client without those calls shows none").toBe(0);
});

it("quest automation: accept, turn in, best reward, skip chatter; Shift skips it", () => {
  const on = "ForeverUIDB.profiles = { Default = { QuestAuto = { accept = true, turnIn = true, skipGossip = true } } }";
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
  addon.eval("ForeverUIDB.profiles.Default.QuestAuto.bestReward = true");
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
const tracker = (addon) => addon.eval(`local f = ForeverUI_QuestTrackerFrame
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
  const colors = addon.eval("local b = ForeverUI_QuestTrackerFrame.blocks return { b[1].lines[1].__textColor, b[1].lines[2].__textColor, b[2].lines[1].__textColor, b[2].title.__textColor }");
  expect([isTok(addon, colors[0], "text2"), isTok(addon, colors[1], "good"), isTok(addon, colors[2], "good"), colors[3][0]], "done objectives in green, the title in its difficulty color").toEqual([true, true, true, 1]);
  expect(addon.eval("return { ObjectiveTrackerFrame:IsShown(), ObjectiveTrackerFrame:GetParent() == UIParent, ForeverUI_QuestTrackerFrame:GetParent() == ForeverUI_QuestTracker }"), "the game's tracker is hidden in place; this one sits in the tracker's spot").toEqual([false, true, true]);
  expect(addon.eval(`local b = ForeverUI_QuestItem1 return { b:GetAttribute("type"), b:GetAttribute("item"), b.__points.TOPRIGHT.rel == ForeverUI_QuestTrackerFrame.blocks[1], b:IsShown() }`), "the wolves' item, beside its quest").toEqual(["item", "item:90061", true, true]);
  setCombat(addon, true);
  addon.eval("__quests[90051].item = nil");
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(addon.eval("return ForeverUI_QuestItem1:IsShown()"), "in combat the item buttons wait").toBe(true);
  setCombat(addon, false);
  expect(addon.eval("return ForeverUI_QuestItem1:IsShown()"), "and update after").toBe(false);
  addon.eval("local b = ForeverUI_QuestTrackerFrame.blocks b[2].__scripts.OnClick(b[2], 'RightButton') b[1].__scripts.OnClick(b[1], 'LeftButton')");
  expect(addon.eval("return { __removed, ForeverUI_QuestLog:IsShown(), ns.GetModule('QuestLog').selected }"), "right-click stops watching; left-click opens the quest in the quest log").toEqual([90052, true, 90051]);
  const noLog = loggedIn(TRACK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { QuestLog = { own = false } } }" });
  noLog.eval("local b = ForeverUI_QuestTrackerFrame.blocks[1] b.__scripts.OnClick(b, 'LeftButton')");
  expect(noLog.eval("return __opened"), "with ForeverUI's quest log off, the game's map opens it").toBe(90051);
});

it("quest tracker: nearest first, collapsing, too many quests, and switched off", () => {
  const addon = loggedIn(UNITS_ENV + TRACK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { QuestTracker = { order = 'nearest' } } }" });
  addon.eval("__wfgStub.advance(1.25)");
  expect(tracker(addon).blocks.map((b) => b[0]), "nearest first; a distance the client hides goes last").toEqual(["[12] TEST-ONLY Letter", "[8] TEST-ONLY Wolves", "[3] TEST-ONLY Far"]);
  addon.eval("local t = ForeverUI_QuestTrackerFrame.toggle t.__scripts.OnClick(t)");
  expect([Object.keys(tracker(addon).blocks).length, addon.eval("return ForeverUI_QuestTrackerFrame.body:IsShown()"), addon.eval("return ForeverUI_QuestTrackerFrame.toggle.icon.__texture:match('Right') ~= nil")], "collapsed: just the header").toEqual([0, false, true]);
  addon.eval(`local t = ForeverUI_QuestTrackerFrame.toggle t.__scripts.OnClick(t)
    for i = 1, 6 do local id = 90070 + i __quests[id] = { index = 10 + i, title = "TEST-ONLY Many " .. i, level = 5, dist = i, objectives = { { text = "a" }, { text = "b" }, { text = "c" } } } __watches[#__watches + 1] = id end`);
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  const t = tracker(addon);
  expect([t.count, t.more], "more than fit: the rest are counted").toEqual(["9", `+${9 - t.blocks.length} more`]);
  addon.eval("__watches = {}");
  addon.fire("QUEST_WATCH_LIST_CHANGED");
  addon.update(0);
  expect(tracker(addon).shown, "nothing watched, nothing shown").toBe(false);
  const own = loggedIn(TRACK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { MenuStrip = { tracker = false } } }" });
  expect(own.eval("return { ForeverUI_QuestTrackerFrame:GetParent():GetName(), (ns.MoverPoint('questtracker')) }"), "with the menu strip's spot off, it makes its own").toEqual(["ForeverUI_QuestTracker", "TOPRIGHT"]);
  const off = loggedIn(TRACK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { QuestTracker = { own = false } } }" });
  expect(off.eval("return { ForeverUI_QuestTrackerFrame == nil, ObjectiveTrackerFrame:IsShown() }"), "switched off: the game's tracker").toEqual([true, true]);
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
const questLog = (addon) => addon.eval(`local f = ForeverUI_QuestLog
  local lines, cards = {}, {}
  for i = 1, f.lines.used do lines[i] = f.lines[i].text:GetText() end
  for i = 1, f.cards.used do cards[i] = f.cards[i].name:GetText() end
  local b = f.buttons
  return { shown = f:IsShown(), count = f.count:GetText(), lines = lines, detail = f.detail:IsShown(),
    title = f.questTitle:GetText(), text = f.text:GetText(), objectives = f.objectives:GetText(), cards = cards, money = f.money:GetText(),
    track = b.track:IsShown() and b.track.text:GetText() or false, share = b.share:IsEnabled() }`);

// Clicks a quest log line, or one of its buttons.
const logLine = (addon, i) => addon.eval(`local b = ForeverUI_QuestLog.lines[${i}] b.__scripts.OnClick(b)`);

// Clicks one of the quest log's buttons by key.
const logButton = (addon, key) => addon.eval(`local b = ForeverUI_QuestLog.buttons.${key} b.__scripts.OnClick(b)`);

it("quest log: zones, a quest's details, and its buttons", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  expect(addon.eval("return __overrides"), "the game's quest log keys open this log").toEqual({ L: "ForeverUI_QuestLogToggle:LeftButton", "SHIFT-L": "ForeverUI_QuestLogToggle:LeftButton" });
  addon.eval("ForeverUI_QuestLogToggle.__scripts.OnClick(ForeverUI_QuestLogToggle)");
  let q = questLog(addon);
  expect([q.shown, q.count, q.lines], "your quests under their zones (hidden ones left out)").toEqual([true, "3 quests", ["TEST-ONLY Vale", "[8] TEST-ONLY Wolves", "[12] TEST-ONLY Letter", "TEST-ONLY Hills", "[3] TEST-ONLY Far"]]);
  expect([q.title, q.text, q.objectives, q.cards, q.money, q.track, q.share], "the first quest, chosen: text, objectives, rewards; watched; nobody to share with").toEqual([
    "[8] TEST-ONLY Wolves", "TEST-ONLY About 90051", "Objectives\n- 3/8 TEST-ONLY Wolves slain\n+ 1/1 TEST-ONLY Pelt", ["TEST-ONLY Boots", "TEST-ONLY Bread"], "+12s 0c  ·  450 XP", "Untrack", false]);
  logButton(addon, "track");
  logLine(addon, 3);
  logButton(addon, "track");
  expect([addon.eval("return { __removed, __added }"), questLog(addon).title], "Untrack the wolves; choose the letter and Track it").toEqual([[90051, 90052], "[12] TEST-ONLY Letter"]);
  expect(addon.eval("local l = ForeverUI_QuestLog.lines return { l[3].mark:IsShown(), l[2].mark:IsShown(), l[1].mark:IsShown() }"), "the chosen quest's line is marked").toEqual([true, false, false]);
  addon.eval("__group = true");
  logLine(addon, 3);
  logButton(addon, "share"); logButton(addon, "abandon"); logButton(addon, "map");
  expect(addon.eval("return { __pushed, __abandoning, __popup, __opened }"), "Share; Abandon through the game's own confirmation; Map").toEqual([90052, 90052, "ABANDON_QUEST TEST-ONLY Letter", 90052]);
  logLine(addon, 1);
  expect(questLog(addon).lines, "a zone folds its quests away").toEqual(["TEST-ONLY Vale", "TEST-ONLY Hills", "[3] TEST-ONLY Far"]);
  addon.eval("ForeverUI_QuestLog.listScroll.__scripts.OnMouseWheel(ForeverUI_QuestLog.listScroll, -1) ns.GetModule('QuestLog').Select(90099)");
  expect([questLog(addon).detail, questLog(addon).track], "a quest gone from the log: nothing chosen").toEqual([false, false]);
  addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  expect(questLog(addon).title, "the log's next update chooses the first quest showing").toBe("[3] TEST-ONLY Far");
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
  expect([rebuilds(addon), addon.eval("return ForeverUI_QuestTrackerFrame.blocks[1].title:GetText()")], "the next frame: one tracker rebuild, with the news").toEqual([{ tracker: 1, log: 0 }, "[8] TEST-ONLY Wolves, renamed"]);
  addon.eval("ns.GetModule('QuestLog').Open()");
  rebuilds(addon);
  for (let i = 0; i < 20; i++) addon.fire("QUEST_LOG_UPDATE");
  addon.update(0);
  addon.update(0);
  expect(rebuilds(addon), "with the log open: one rebuild of each").toEqual({ tracker: 1, log: 1 });
  addon.fire("QUEST_LOG_UPDATE");
  addon.eval("ForeverUI_QuestLog:Hide()");
  addon.update(0);
  expect(rebuilds(addon).log, "a log closed before the next frame isn't re-rendered").toBe(0);
});

it("quest tracker: the nearest-first sort ticks only while that order is on", () => {
  const addon = loggedIn(TRACK_ENV);
  // Whether the tracker has its sort ticker (an OnUpdate script).
  const ticking = () => addon.eval("return ForeverUI_QuestTrackerFrame:GetScript('OnUpdate') ~= nil");
  expect(ticking(), "in the game's order, no sort ticker").toBe(false);
  addon.eval("ns.GetModule('QuestTracker').settings.order = 'nearest' ns.GetModule('QuestTracker').ApplyOrder()");
  expect([ticking(), addon.eval("return ForeverUI_QuestTrackerFrame.blocks[1].title:GetText()")], "nearest first: it ticks, and the tracker is re-sorted at once").toEqual([true, "[12] TEST-ONLY Letter"]);
  addon.eval("ns.GetModule('QuestTracker').settings.order = 'game' ns.GetModule('QuestTracker').ApplyOrder()");
  expect([ticking(), addon.eval("return ForeverUI_QuestTrackerFrame.blocks[1].title:GetText()")], "back to the game's order: no ticker, the game's order").toEqual([false, "[8] TEST-ONLY Wolves"]);
});

it("quest log: keys follow rebinding, /fui quests, closing, and switched off", () => {
  const addon = loggedIn(TRACK_ENV + QLOG_ENV);
  addon.eval('__keys = { "K" }');
  addon.fire("UPDATE_BINDINGS");
  expect(addon.eval("return __overrides"), "a new key for the quest log moves with it").toEqual({ K: "ForeverUI_QuestLogToggle:LeftButton" });
  addon.slash("quests");
  expect(addon.eval("return ForeverUI_QuestLog:IsShown()"), "/fui quests opens it").toBe(true);
  addon.eval("ForeverUI_QuestLog.close.__scripts.OnClick(ForeverUI_QuestLog.close)");
  addon.slash("quests");
  addon.slash("quests");
  expect(addon.eval("return { ForeverUI_QuestLog:IsShown(), UISpecialFrames[#UISpecialFrames] }"), "the close button and /fui quests close it; Escape too").toEqual([false, "ForeverUI_QuestLog"]);
  const off = loggedIn(TRACK_ENV + QLOG_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { QuestLog = { own = false } } }" });
  off.slash("quests");
  expect([off.eval("return ForeverUI_QuestLog == nil and next(__overrides) == nil"), chatHas(off, /quest log is off/)], "switched off: the game's quest log key stays the game's").toEqual([true, true]);
});

// TEST-ONLY extra windows: friends, a book (its page text records the colors it's given), and
// the game's loss of control and talking head alerts with their parts.
const ALERTS_ENV = `
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then return end local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  FriendsFrame = CreateFrame("Frame", "FriendsFrame", UIParent) FriendsFrame:Hide()
  ItemTextFrame = CreateFrame("Frame", "ItemTextFrame", UIParent) ItemTextFrame:Hide()
  ItemTextFrame:SetScript("OnEvent", function() end)
  ItemTextMaterialTopLeft = ItemTextFrame:CreateTexture("ItemTextMaterialTopLeft")
  ItemTextPageText = { __colors = {}, SetTextColor = function(self, tag, r, g, b) self.__colors[tag] = { r, g, b, 1 } end }
  LossOfControlFrame = CreateFrame("Frame", "LossOfControlFrame", UIParent)
  LossOfControlFrame.blackBg = LossOfControlFrame:CreateTexture()
  LossOfControlFrame.Icon = LossOfControlFrame:CreateTexture()
  LossOfControlFrame.AbilityName = LossOfControlFrame:CreateFontString()
  LossOfControlFrame.TimeLeft = CreateFrame("Frame", nil, LossOfControlFrame)
  LossOfControlFrame.TimeLeft.NumberText = LossOfControlFrame.TimeLeft:CreateFontString()
  TalkingHeadFrame = CreateFrame("Frame", "TalkingHeadFrame", UIParent)
  TalkingHeadFrame.BackgroundFrame = CreateFrame("Frame", nil, TalkingHeadFrame)
  TalkingHeadFrame.MainFrame = CreateFrame("Frame", nil, TalkingHeadFrame)
  TalkingHeadFrame.MainFrame.Name = TalkingHeadFrame.MainFrame:CreateFontString()
  TalkingHeadFrame.MainFrame.Text = TalkingHeadFrame.MainFrame:CreateFontString()
`;

it("more game windows: friends, books and letters, and windows that load later", () => {
  const addon = loggedIn(ALERTS_ENV);
  addon.eval("FriendsFrame:Show()");
  expect(borderOf(addon, "FriendsFrame") !== undefined, "friends in the ForeverUI look").toBe(true);
  addon.eval('ItemTextFrame:Show() ItemTextFrame.__scripts.OnEvent(ItemTextFrame, "ITEM_TEXT_READY")');
  const page = addon.eval("return { ItemTextPageText.__colors.P, ItemTextPageText.__colors.H1, ItemTextMaterialTopLeft.__alpha }");
  expect([isTok(addon, page[0], "text"), isTok(addon, page[1], "gold"), page[2]], "a book's page in light text, gold headings, its parchment faded").toEqual([true, true, 0]);
  addon.eval('AuctionHouseFrame = CreateFrame("Frame", "AuctionHouseFrame", UIParent)');
  addon.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  expect(borderOf(addon, "AuctionHouseFrame") !== undefined, "the auction house, when it loads").toBe(true);
  addon.eval("ItemTextPageText = { }");
  addon.eval('ItemTextFrame.__scripts.OnEvent(ItemTextFrame, "ITEM_TEXT_READY")');
  expect(addon.eval("return ItemTextMaterialTopLeft.__alpha"), "a page without colors to set is left alone").toBe(0);
});

it("game alerts: loss of control and the talking head, styled and placed (or hidden)", () => {
  const addon = loggedIn(ALERTS_ENV);
  const loc = addon.eval(`local f = LossOfControlFrame
    return { f.blackBg.__alpha, f.Icon.__texCoord ~= nil, f.AbilityName.__font ~= nil, f.TimeLeft.NumberText.__font ~= nil, f.__points.CENTER.rel == ForeverUI_LossOfControlFrameSpot }`);
  expect(loc, "loss of control: its black band faded, icon cropped, theme text, centered on its spot").toEqual([0, true, true, true, true]);
  expect(addon.eval("return { ns.MoverPoint('lossofcontrol') }"), "a little above your character").toEqual(["CENTER", "CENTER", 0, 140]);
  const head = addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.MainFrame.Name.__font ~= nil, f.__points.CENTER.rel == ForeverUI_TalkingHeadFrameSpot }");
  expect([head, addon.eval("return (ns.MoverPoint('talkinghead'))")], "the talking head: parchment faded, theme text, at the top center").toEqual([[0, true, true], "TOP"]);
  const hide = loggedIn(ALERTS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { GameAlerts = { talkingHead = 'hide', lossOfControl = false } } }" });
  hide.eval("TalkingHeadFrame:Show()");
  expect(hide.eval("return { TalkingHeadFrame:IsShown(), ForeverUI_TalkingHeadFrameSpot == nil, LossOfControlFrame.blackBg.__alpha == nil }"), "hidden, if you'd rather; loss of control off stays the game's").toEqual([false, true, true]);
  const game = loggedIn(ALERTS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { GameAlerts = { talkingHead = 'game' } } }" });
  expect(game.eval("return { TalkingHeadFrame:IsShown(), ForeverUI_TalkingHeadFrameSpot == nil }"), "or left to the game").toEqual([true, true]);
  const partial = loggedIn("LossOfControlFrame = CreateFrame('Frame', 'LossOfControlFrame', UIParent) TalkingHeadFrame = CreateFrame('Frame', 'TalkingHeadFrame', UIParent)");
  expect(partial.eval("return ForeverUI_LossOfControlFrameSpot ~= nil and ForeverUI_TalkingHeadFrameSpot ~= nil"), "frames without their usual parts are still placed").toBe(true);
  expect(loggedIn("").eval("return ForeverUI_LossOfControlFrameSpot == nil"), "a client without them loads cleanly").toBe(true);
});

// TEST-ONLY damage meter: someone else's line, then yours at 1234.5 per second.
const DPS_ENV = `
  __dps = { combatSources = { { isLocalPlayer = false, amountPerSecond = 999 }, { isLocalPlayer = true, amountPerSecond = 1234.5 } } }
  Enum = { DamageMeterSessionType = { Current = 1 }, DamageMeterType = { Dps = 1 } }
  C_DamageMeter = { GetCombatSessionFromType = function(kind, what) __asked = { kind, what } return __dps end }
`;

it("the info strip: your DPS in the last fight, from the game's damage meter", () => {
  const addon = loggedIn(UNITS_ENV + DPS_ENV + CLICK_LUA);
  const before = addon.eval("return ForeverUI_InfoStrip:GetHeight()");
  expect(block(addon, "dps").shown, "off until you turn it on").toBe(false);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Your DPS in the last fight (from the game's damage meter)")`);
  expect([block(addon, "dps").text, addon.eval("return __asked"), addon.eval("return ForeverUI_InfoStrip:GetHeight()")], "your line's figure, the current fight's DPS, on a fourth row").toEqual(["1.2K dps", [1, 1], 68]);
  setCombat(addon, true);
  addon.eval("__dps.combatSources[2].amountPerSecond = 2500");
  addon.fire("DAMAGE_METER_RESET");
  expect(addon.eval("return ns.GetModule('InfoStrip').DPS()"), "in a fight it isn't read (the client hides it)").toBe(null);
  setCombat(addon, false);
  expect(block(addon, "dps").text, "when the fight ends it shows that fight's").toBe("2.5K dps");
  // Runs lua, ends a fight, and says whether the DPS block shows.
  const hidden = (lua) => { addon.eval(lua); addon.fire("PLAYER_REGEN_ENABLED"); return block(addon, "dps").shown; };
  expect([hidden("__dps.combatSources[2].amountPerSecond = { __secret = true }"), hidden("__dps = { __secret = true }"), hidden("__dps = {}"), hidden("__dps = nil")], "hidden figures, a hidden fight, no fight: nothing shows").toEqual([false, false, false, false]);
  expect(addon.eval("return ForeverUI_InfoStrip:GetHeight()"), "and the fourth row goes").toBe(before);
  addon.eval("Enum = { DamageMeterSessionType = { Current = 1 }, DamageMeterType = { Dps = 1 } } __dps = { combatSources = { { isLocalPlayer = true, amountPerSecond = 0 } } }");
  expect(hidden(""), "no damage done: nothing shows").toBe(false);
  addon.eval("__asked = nil Enum = nil");
  expect([addon.eval("return ns.GetModule('InfoStrip').DPS()"), addon.eval("return __asked")], "without the client's enums the meter is not asked with guessed numbers").toEqual([null, null]);
  const bare = loggedIn(UNITS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { InfoStrip = { dps = true } } }" });
  bare.fire("PLAYER_REGEN_ENABLED");
  expect(block(bare, "dps").shown, "a client without the damage meter shows nothing").toBe(false);
});

// TEST-ONLY group extras: a raid tank (raid1) targeting the boar, and a party pet targeting nothing.
const GROUP_EXTRAS_ENV = `
  RegisterAttributeDriver = function(frame, attr, driver) frame.__drivers = frame.__drivers or {}; frame.__drivers[attr] = driver end
  __units.raid1 = { name = "TEST-ONLY Tank", hp = 300, maxhp = 1000, power = 0, maxpower = 0, ptype = "RAGE", player = true, class = "ROGUE" }
  __units.raid1target = __units.target
  __units.partypet1 = { name = "TEST-ONLY Wolf", hp = 50, maxhp = 100, power = 0, maxpower = 0, ptype = "FOCUS", reaction = 5 }
  function __mt(i, unit)
    local b = CreateFrame("Button", "ForeverUI_MainTanksUnitButton" .. i, ForeverUI_MainTanks, "SecureUnitButtonTemplate")
    ForeverUI_MainTanks.initialConfigFunction(ForeverUI_MainTanks, b:GetName())
    b:SetAttribute("unit", unit)
    return b
  end
`;

it("main tank frames: the raid's main tanks and assists, with what each is targeting", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV);
  const header = addon.eval(`local h = ForeverUI_MainTanks
    return { h:GetAttribute("groupFilter"), h:GetAttribute("showRaid"), h:GetAttribute("template"), h.__drivers["state-visibility"], h:GetAttribute("initialConfigFunction") == ns.GetModule("MainTanks").INIT }`);
  expect(header, "a secure header of the raid's main tanks and assists, shown in a raid").toEqual(["MAINTANK,MAINASSIST", true, "SecureUnitButtonTemplate", "[group:raid] show; hide", true]);
  expect([addon.eval("return { ns.MoverPoint('maintanks') }"), addon.eval("return { ForeverUI_MainTanksHolder:GetWidth(), ForeverUI_MainTanksHolder:GetHeight() }")], "movable, at the top left beside the raid tools, room for four").toEqual([["TOPLEFT", "TOPLEFT", 400, -20], [236, 100]]);
  addon.eval('__mt(1, "raid1") __wfgStub.advance(0.5)');
  // The first tile: bar value and color, name, target line and its color.
  const tile = () => addon.eval("local b = ForeverUI_MainTanksUnitButton1 return { b.bar.__value, b.bar.__barColor, b.name:GetText(), b.target:GetText(), b.target.__textColor }");
  const one = tile();
  expect([one[0], one[1].slice(0, 3), one[2], one[3], isTok(addon, one[4], "hostile")], "health in their class color, their name, and their target in its reaction color").toEqual([300, [1, 0.96, 0.41], "TEST-ONLY Tank", "TEST-ONLY Boar", true]);
  addon.eval("__units.raid1target = nil __wfgStub.advance(0.5)");
  expect(tile()[3], "no target, no line").toBe("");
  addon.eval('__units.raid1.name = "TEST-ONLY Renamed" ForeverUI_MainTanksUnitButton1:SetAttribute("unit", "raid9") ForeverUI_MainTanksUnitButton1:Hide() ForeverUI_MainTanksUnitButton1:Show()');
  expect(tile()[2], "a unit that isn't there leaves the tile as it was").toBe("TEST-ONLY Tank");
  const off = loggedIn(UNITS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { MainTanks = false } } }" });
  expect(off.eval("return ForeverUI_MainTanks == nil"), "switched off under Modules, nothing is built").toBe(true);
  expect(loggedIn(UNITS_ENV).eval("return ForeverUI_MainTanks ~= nil"), "a client without attribute drivers still builds them").toBe(true);
});

it("main tank frames without secure snippets: the header copies the clicks; tiles are sized and set up out of combat", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + 'SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end');
  expect(addon.eval("local h = ForeverUI_MainTanks return { h:GetAttribute('initialConfigFunction') == nil, h:GetAttribute('_initialAttributeNames') }"),
    "no init snippet; the header copies the clicks").toEqual([true, "*type1,*type2"]);
  addon.eval('local b = CreateFrame("Button", "ForeverUI_MainTanksUnitButton1", ForeverUI_MainTanks, "SecureUnitButtonTemplate") b:SetAttribute("unit", "raid1")');
  addon.fire("GROUP_ROSTER_UPDATE");
  const MT = addon.eval('local MT = ns.GetModule("MainTanks") return { MT.W, MT.H }');
  expect(addon.eval("local b = ForeverUI_MainTanksUnitButton1 return { b:GetWidth(), b:GetHeight(), b:GetAttribute('*type1'), b.bar ~= nil }"),
    "the tile has its size, its click and the tile setup").toEqual([MT[0], MT[1], "target", true]);
});

it("party pets and targets: small tiles above the party, only in a party, when switched on", () => {
  expect(loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV).eval("return ForeverUI_PartyExtras == nil"), "off until you turn it on").toBe(true);
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + CLICK_LUA, { savedVariables: "ForeverUIDB.profiles = { Default = { PartyExtras = { show = true } } }" });
  const tiles = addon.eval(`local pet, target = ForeverUI_partypet1, ForeverUI_party4target
    return { #ns.GetModule("PartyExtras").tiles, pet:GetAttribute("unit"), pet.__watched, target:GetAttribute("unit"), target.__points.TOPLEFT.x, target.__points.TOPLEFT.y, ForeverUI_PartyExtras.__drivers["state-visibility"] }`);
  expect(tiles, "a pet and a target tile per party member, each shown while its unit exists, the column only in a party").toEqual([8, "partypet1", true, "party4target", 94, -54, "[group:raid] hide; [group:party] show; hide"]);
  expect(addon.eval("return { ns.MoverPoint('partyextras') }"), "movable, just above the party").toEqual(["BOTTOM", "BOTTOM", -240, 606]);
  addon.eval("ns.GetModule('MainTanks').Paint(ForeverUI_partypet1)");
  expect(addon.eval("return { ForeverUI_partypet1.name:GetText(), ForeverUI_partypet1.target == nil }"), "the pet's name on its tile, no target line").toEqual(["TEST-ONLY Wolf", true]);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Party pets and targets, above the party (reload)") and ForeverUIDB.profiles.Default.PartyExtras.show'), "the switch is under Unit frames").toBe(false);
});

it("/fui factionart: which of the game's own faction pictures the client has", () => {
  const addon = loggedIn(`C_Texture = { GetAtlasInfo = function(name) if name:find("MountJournal") then return { width = 64 } end end }
    UnitFactionGroup = function() return "Horde" end`);
  addon.slash("factionart");
  const lines = addon.chat().join("\n");
  expect([/you're Horde/.test(lines), /atlas MountJournalIcons-Horde\s+\|c\w+yes/.test(lines), /atlas UI-HUD-UnitFrame-Player-PVP-HordeIcon\s+\|c\w+missing/.test(lines)], "your faction, and each atlas found or missing").toEqual([true, true, true]);
  addon.eval("ns.FactionArt.tester.SetTexture = function(_, file) return file:find('Timer') ~= nil end");
  expect(addon.eval("return { ns.FactionArt.HasFile('Interface\\\\Timer\\\\Horde-Logo'), ns.FactionArt.HasFile('Interface\\\\TargetingFrame\\\\UI-PVP-Horde') }"), "a file counts when the client loads it").toEqual([true, false]);
  addon.eval("UnitFactionGroup = function() return { __secret = true } end issecretvalue = function(v) return type(v) == 'table' and v.__secret end");
  expect(addon.eval("return ns.FactionArt.Faction()"), "a hidden answer counts as none").toBe("none");
  const bare = loggedIn("C_Texture = nil UnitFactionGroup = nil");
  expect(bare.eval("return { ns.FactionArt.HasAtlas('MountJournalIcons-Horde'), ns.FactionArt.Faction() }"), "a client without these calls has none, and no faction").toEqual([false, "none"]);
});

it("the faction look: your faction's crest and heading font, and Off", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + '__faction = "Alliance" UnitFactionGroup = function() return __faction end');
  // A new title and label string's font file, and a new crest's texture, color and shown state.
  const look = () => addon.eval(`local T = ns.Theme
    local title, label = T.Text(UIParent:CreateFontString(), "title"), T.Text(UIParent:CreateFontString(), "label")
    local c = ForeverUI_AfkScreen.crest
    return { title.__font[1]:match("[^\\\\]+$"), label.__font[1]:match("[^\\\\]+$"), c:IsShown(), (c.__texture or ""):match("[^\\\\]+$") or "", c.__vertexColor }`);
  const ally = look();
  expect(ally.slice(0, 4), "Alliance: Cinzel headings (body text stays Fira Sans), the crossed swords").toEqual(["Cinzel-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", true, "lorc-crossed-swords"]);
  expect(isTok(addon, ally[4], "allianceCrest"), "in Alliance gold").toBe(true);
  expect(addon.eval("return { ForeverUI_QuestDialog.crest.fuiAlpha, ForeverUI_QuestDialog.crest.__vertexColor[4] }"), "a faint watermark in the quest dialog").toEqual([0.1, 0.1]);
  addon.eval('__faction = "Horde"');
  addon.fire("NEUTRAL_FACTION_SELECT_RESULT");
  const horde = look();
  expect([horde[0], horde[3], isTok(addon, horde[4], "hordeCrest")], "Horde: Metamorphous and the crossed axes, in Horde red").toEqual(["Metamorphous-Regular.ttf", "lorc-crossed-axes", true]);
  addon.slash("");
  expect(addon.eval("return ForeverUI_Options.crest:IsShown() and ForeverUI_Options.crest.__points.LEFT.rel == ForeverUI_Options.title"), "the crest beside the options window's title").toBe(true);
  addon.eval('__click("Faction look: crest and heading font")');
  const off = look();
  expect([off[0], off[2], addon.eval("return ForeverUI_Options.title.__font[1]:find('Fira') ~= nil")], "Off: the usual heading font, no crests, at once").toEqual(["FiraSansCondensed-SemiBold.ttf", false, true]);
  addon.eval('__click("Faction look: crest and heading font") __faction = "Neutral" ns.Theme.Refresh()');
  expect(look().slice(0, 3), "a neutral character keeps the usual look").toEqual(["FiraSansCondensed-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", false]);
  addon.eval('__faction = "Alliance" ns.Theme.Settings().font = "client" ns.Theme.Refresh()');
  expect(addon.eval("return { ns.Theme.HeadingFont() == nil, ForeverUI_AfkScreen.crest:IsShown() }"), "with the game's font chosen, headings follow it (the crest stays)").toEqual([true, true]);
});

it("the info strip under the minimap", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV + CLICK_LUA);
  const dur = block(addon, "durability");
  expect(dur.text === "9%" && isTok(addon, dur.color, "bad"), "your most worn item, red at 10% or less").toBe(true);
  addon.eval("__dur[7] = { 50, 100 } __dur[1] = { 20, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(isTok(addon, block(addon, "durability").color, "warn"), "orange at 25% or less").toBe(true);
  addon.eval("__dur[1] = { 90, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(block(addon, "durability").text === "50%" && isTok(addon, block(addon, "durability").color, "text"), "plain above that").toBe(true);
  expect(block(addon, "bags").text, "free slots across the five bags").toBe("12 free");
  expect([block(addon, "system").text, block(addon, "gold").text, block(addon, "clock").text], "fps and latency, gold, the time").toEqual(["58 fps  64 ms", "12g 34s 7c", "21:04"]);
  expect(block(addon, "ammo").shown, "a mage carries no ammo").toBe(false);
  addon.eval("__fps = 30 __money = 507 __wfgStub.advance(1.1)");
  expect(block(addon, "system").text, "fps waits for the third second").toBe("58 fps  64 ms");
  addon.eval("__wfgStub.advance(2.2)");
  addon.fire("PLAYER_MONEY");
  expect([block(addon, "system").text, block(addon, "gold").text], "then updates; under a gold, no gold part").toEqual(["30 fps  64 ms", "5s 7c"]);
  addon.eval("C_Container.GetContainerNumFreeSlots = function() return 0 end");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(isTok(addon, block(addon, "bags").color, "bad"), "full bags are red").toBe(true);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Clock")') && block(addon, "clock").shown, "a block turns off at once").toBe(false);
  expect(addon.eval('return { ns.MoverPoint("infostrip") }'), "the strip is movable, under the minimap").toEqual(["TOPRIGHT", "TOPRIGHT", -12, -200]);
});

it("the info strip: ammo, and clients that can't answer", () => {
  const hunter = loggedIn(UNITS_ENV + STRIP_ENV + '__units.player.class = "HUNTER"');
  expect(block(hunter, "ammo").text, "a hunter's ammo").toBe("ammo 412");
  hunter.eval("__ammo = 0");
  hunter.fire("UNIT_INVENTORY_CHANGED", "player");
  expect(block(hunter, "ammo").text === "ammo 0" && isTok(hunter, block(hunter, "ammo").color, "bad"), "out of ammo is red").toBe(true);
  hunter.eval('__units.player.class = "WARRIOR"');
  hunter.fire("BAG_UPDATE_DELAYED");
  expect(block(hunter, "ammo").shown, "a warrior with none shows nothing").toBe(false);
  hunter.eval('UnitClass = function() return "x", { __secret = true } end');
  hunter.fire("BAG_UPDATE_DELAYED");
  expect(block(hunter, "ammo").shown, "a hidden class shows nothing").toBe(false);
  const bare = loggedIn(UNITS_ENV + "GetMoney = function() return { __secret = true } end GetInventoryItemDurability = nil C_Container = nil GetFramerate = nil GetNetStats = nil");
  expect(["durability", "bags", "system", "gold", "clock"].map((k) => block(bare, k).shown), "no answer, no block").toEqual([false, false, false, false, false]);
});

// TEST-ONLY trainer: two services you can learn (5s and 20s), one you can't yet, one learned; 22s on hand.
const TRAINER_ENV = `
  __services = { { "TEST-ONLY Bolt", "available", 500 }, { "TEST-ONLY Ward", "unavailable", 100 }, { "TEST-ONLY Blast", "available", 2000 }, { "TEST-ONLY Old", "used", 0 } }
  __money, __learned = 2200, {}
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], "", s[2], false end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = __services[i][1] __money = __money - __services[i][3] __services[i][2] = "used" end
  C_Timer = { After = function(_, fn) fn() end }
  function __loadTrainer(withTrain)
    ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
    if withTrain then ClassTrainerTrainButton = CreateFrame("Button", "ClassTrainerTrainButton", ClassTrainerFrame) end
  end
`;

// The Train all button: its label, whether it's enabled, and where it sits.
const trainButton = (addon) => addon.eval(`local b = ns.GetModule("Errands").trainButton
  if not b then return false end
  local p = b.__points.RIGHT or b.__points.BOTTOMLEFT
  return { text = b.text:GetText(), enabled = b:IsEnabled(), shown = b:IsShown(), by = p.rel:GetName() }`);

it("Train all at a trainer: learns what you can afford, one at a time", () => {
  const addon = loggedIn(TRAINER_ENV);
  expect(trainButton(addon), "no trainer window yet, no button").toBe(false);
  addon.eval("__loadTrainer(true)");
  addon.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  addon.fire("TRAINER_SHOW");
  expect(trainButton(addon), "on the trainer's window, beside its own Train button, with the count and cost").toEqual({ text: "Train all (2) · 25s 0c", enabled: true, shown: true, by: "ClassTrainerTrainButton" });
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return __learned"), "learns what 22s pays for, then stops").toEqual(["TEST-ONLY Bolt"]);
  expect(chatHas(addon, /Trained 1 skill\(s\) for 5s 0c\./), "and says what it cost").toBe(true);
  expect(trainButton(addon).enabled, "the one left costs more than you have").toBe(false);
  addon.eval("__money = 5000");
  addon.fire("TRAINER_UPDATE");
  setCombat(addon, true);
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return #__learned"), "nothing in combat").toBe(1);
  setCombat(addon, false);
  addon.fire("TRAINER_CLOSED");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return #__learned"), "nor once the trainer closed").toBe(1);
  addon.fire("TRAINER_SHOW");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect([addon.eval("return __learned"), trainButton(addon).text], "then the rest").toEqual([["TEST-ONLY Bolt", "TEST-ONLY Blast"], "Train all"]);
  const loaded = loggedIn(TRAINER_ENV + "__loadTrainer(false)", { savedVariables: "ForeverUIDB.profiles = { Default = { Errands = { trainAll = false } } }" });
  loaded.fire("TRAINER_SHOW");
  expect(trainButton(loaded), "a window already loaded gets it too; switched off it hides").toMatchObject({ shown: false, by: "ClassTrainerFrame" });
});

// TEST-ONLY merchant stock: 90011 sells singly (5c, stacks of 20), 90012 in fives (40c for 5), 90013 is sold out.
const STOCK_ENV = `
  __goods = { { id = 90011, price = 5, stack = 1, left = -1, max = 20 }, { id = 90012, price = 40, stack = 5, left = -1, max = 10 }, { id = 90013, price = 1, stack = 1, left = 0, max = 20 } }
  __have, __buys, __money = { [90011] = 5 }, {}, 100000
  GetMoney = function() return __money end
  GetMerchantNumItems = function() return #__goods end
  GetMerchantItemLink = function(i) return "|cffffffff|Hitem:" .. __goods[i].id .. "::|h[TEST-ONLY Good]|h|r" end
  GetMerchantItemMaxStack = function(i) return __goods[i].max end
  C_MerchantFrame = { GetItemInfo = function(i) local g = __goods[i] return { price = g.price, stackCount = g.stack, numAvailable = g.left } end }
  BuyMerchantItem = function(i, n) local g = __goods[i] __buys[#__buys + 1] = { g.id, n } __have[g.id] = (__have[g.id] or 0) + n __money = __money - math.ceil(g.price / g.stack * n) end
  C_Item = { GetItemCount = function(id) return __have[id] or 0 end, GetItemInfo = function(id) if id == 90011 then return "TEST-ONLY Bread" end end }
  C_Timer = { After = function(_, fn) fn() end }
`;

it("keep stocked: /fui stock sets the list, a merchant tops you up", () => {
  const addon = loggedIn(STOCK_ENV);
  addon.slash("stock");
  expect(chatHas(addon, /stock list is empty/), "an empty list says how to add").toBe(true);
  addon.slash("stock |cffffffff|Hitem:90011::|h[TEST-ONLY Bread]|h|r 45");
  addon.slash("stock item:90012 12");
  addon.slash("stock 90013 3");
  addon.slash("stock 90014");
  expect(chatHas(addon, /Keeping 45 × TEST-ONLY Bread\./) && chatHas(addon, /Usage: \/fui stock/), "a shift-clicked item and an amount; no amount, the usage").toBe(true);
  addon.slash("stock");
  expect(chatHas(addon, /Keep 12 × item 90012/), "the list, by name where the game knows it").toBe(true);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "40 more bread in stacks of 20, 12 of the fives, nothing sold out").toEqual([[90011, 20], [90011, 20], [90012, 10], [90012, 2]]);
  expect(chatHas(addon, /Bought 40 × TEST-ONLY Bread for 2s 0c\./) && chatHas(addon, /Bought 12 × item 90012 for 0s 96c\./), "and says what it bought").toBe(true);
  addon.eval("__buys = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__buys"), "nothing when you have enough").toBe(0);
  addon.eval("__have = {} __buys = {} __money = 150");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "it stops when you can't pay for the next stack").toEqual([[90011, 20]]);
  addon.fire("MERCHANT_CLOSED");
  addon.slash("stock item:90011 0");
  addon.slash("stock clear");
  expect(chatHas(addon, /TEST-ONLY Bread is off your stock list/) && addon.eval("return next(ForeverUIDB.profiles.Default.Errands.stockList)") === null, "0 removes an item, clear empties the list").toBe(true);
  const old = loggedIn(STOCK_ENV + "C_Timer = nil C_MerchantFrame = nil GetMerchantItemInfo = function(i) local g = __goods[i] return 'x', '', g.price, g.stack, g.left end", { savedVariables: "ForeverUIDB.profiles = { Default = { Errands = { stockList = { [90012] = 5 } } } }" });
  old.fire("MERCHANT_SHOW");
  expect(old.eval("return __buys"), "a client with the old merchant call (and no timers)").toEqual([[90012, 5]]);
  const off = loggedIn(STOCK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Errands = { stock = false, stockList = { [90012] = 5 } } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return #__buys"), "switched off it buys nothing").toBe(0);
});

// TEST-ONLY flight points: you stand at node 1, node 2 is a destination.
const TAXI_ENV = `
  __onTaxi = false
  hooksecurefunc = function(name, fn) local orig = _G[name] _G[name] = function(...) orig(...) fn(...) end end
  NumTaxiNodes = function() return 2 end
  TaxiNodeGetType = function(i) return i == 1 and "CURRENT" or "REACHABLE" end
  TaxiNodeName = function(i) return i == 1 and "TEST-ONLY Landing" or "TEST-ONLY Outpost" end
  TakeTaxiNode = function() end
  UnitOnTaxi = function() return __onTaxi end
`;

// The flight bar: shown, its text, value and max.
const flightBar = (addon) => addon.eval("local b = ForeverUI_FlightTimer return { shown = b:IsShown(), text = b.text:GetText(), value = b:GetValue(), max = select(2, b:GetMinMaxValues()) }");

it("flight timer: the first flight is timed, the next counts down", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV);
  expect(flightBar(addon).shown, "no bar until a flight").toBe(false);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  expect(flightBar(addon), "a route never flown: timing it").toMatchObject({ shown: true, text: "Timing this flight to TEST-ONLY Outpost" });
  addon.eval("__wfgStub.advance(90) __onTaxi = false __wfgStub.advance(1)");
  expect([flightBar(addon).shown, addon.eval('return ForeverUIDB.profiles.Default.Errands.flights["TEST-ONLY Landing > TEST-ONLY Outpost"]')], "landing saves the time and hides the bar").toEqual([false, 91]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  addon.eval("__wfgStub.advance(30)");
  expect(flightBar(addon), "the same route again counts down").toMatchObject({ shown: true, text: "TEST-ONLY Outpost  1:01", max: 91 });
  addon.eval("__onTaxi = false __wfgStub.advance(1)");
  addon.eval("TakeTaxiNode(2) __wfgStub.advance(12)");
  expect(addon.eval('return ns.GetModule("Errands").flight'), "a flight that never takes off is forgotten").toBe(null);
  addon.eval('TaxiNodeGetType = function() return { __secret = true } end TakeTaxiNode(2)');
  expect(addon.eval('return ns.GetModule("Errands").flight'), "no route when the start is hidden").toBe(null);
  expect(addon.eval("return { ns.MoverPoint('flighttimer') }"), "the bar is movable, above the cluster").toEqual(["BOTTOM", "BOTTOM", 0, 312]);
  const bare = loggedIn("");
  expect(bare.eval("return ForeverUI_FlightTimer == nil and ns.GetModule('Errands').settings ~= nil"), "a client without taxi calls loads cleanly").toBe(true);
});

// TEST-ONLY model of the Forever game menu: pooled buttons numbered from 1 by InitButtons on every
// show, then a layout that orders the shown children by layoutIndex (LayoutFrame.lua).
const FOREVER_MENU_ENV = `
  HideUIPanel = function(f) f:Hide() end
  local hookAll = hooksecurefunc
  hooksecurefunc = function(t, ...) if t == GameMenuFrame then __hooked = true end return hookAll(t, ...) end
  __calls = { AddButton = 0, AddSection = 0, MarkDirty = 0 }
  GameMenuFrame = CreateFrame("Frame", "GameMenuFrame", UIParent) GameMenuFrame:Hide()
  GameMenuFrame.buttonTemplate = "GameMenuFrameButtonTemplate"
  function GameMenuFrame:Reset()
    self.nextLayoutIndex = 1
    for _, c in ipairs({ self:GetChildren() }) do
      if c.layoutIndex and c.layoutIndex >= 1 then c:Hide() c.layoutIndex = nil end
    end
  end
  function GameMenuFrame:AddButton(text, fn)
    __calls.AddButton = __calls.AddButton + 1
    local b = CreateFrame("Button", nil, self, self.buttonTemplate)
    b:SetText(text) b:SetScript("OnClick", fn)
    b.layoutIndex = self.nextLayoutIndex self.nextLayoutIndex = self.nextLayoutIndex + 1
    return b
  end
  function GameMenuFrame:AddSection() __calls.AddSection = __calls.AddSection + 1 end
  function GameMenuFrame:InitButtons()
    self:Reset() self:AddButton("Options", function() end) self:AddSection() self:AddButton("Return to Game", function() end)
  end
  function GameMenuFrame:MarkDirty() __calls.MarkDirty = __calls.MarkDirty + 1 end
  function GameMenuFrame:Layout()
    local kids = {}
    for _, c in ipairs({ self:GetChildren() }) do if c:IsShown() and c.layoutIndex then kids[#kids + 1] = c end end
    table.sort(kids, function(a, b) return a.layoutIndex < b.layoutIndex end)
    self.order = {}
    for i, c in ipairs(kids) do self.order[i] = c:GetText() or c.text:GetText() end
  end
  GameMenuFrame:SetScript("OnShow", function(self) self:InitButtons() self:Layout() end)
`;

it("a ForeverUI button on the game menu opens the options", () => {
  const addon = loggedIn(FOREVER_MENU_ENV);
  expect(addon.eval("return { __calls.AddButton, __calls.AddSection, __calls.MarkDirty, __hooked == nil }"), "no AddButton or AddSection, no InitButtons hook, one MarkDirty").toEqual([0, 0, 1, true]);
  expect(addon.eval("local b = ns.gameMenuButton return { b.layoutIndex, b.bottomPadding, b:GetParent() == GameMenuFrame, b.__template, b:GetText(), b:IsShown() }"), "the menu's own template, first index, section gap under it").toEqual([0, 20, true, "GameMenuFrameButtonTemplate", "ForeverUI", true]);
  addon.eval("GameMenuFrame:Show()");
  expect(addon.eval("return GameMenuFrame.order"), "first in the menu, above Options").toEqual(["ForeverUI", "Options", "Return to Game"]);
  expect(addon.eval("local m = math.huge for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c ~= ns.gameMenuButton and c.layoutIndex then m = math.min(m, c.layoutIndex) end end return ns.gameMenuButton.layoutIndex < m"), "lower than every pooled button's layoutIndex").toBe(true);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c:GetText() == 'ForeverUI' then n = n + 1 end end return { GameMenuFrame.order[1], n, __calls.AddButton }"), "still first on the next open, one button, AddButton only from the game").toEqual(["ForeverUI", 1, 4]);
  addon.eval("ns.gameMenuButton:GetScript('OnClick')(ns.gameMenuButton)");
  expect(addon.eval("return { GameMenuFrame:IsShown(), ForeverUI_Options and ForeverUI_Options:IsShown() or ns.Options.current ~= nil }"), "clicking it closes the menu and opens the options").toEqual([false, true]);
  const old = loggedIn("GameMenuFrame = CreateFrame('Frame', 'GameMenuFrame', UIParent)");
  expect(old.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, b.layoutIndex == nil }"), "an older menu gets a themed button just under it, not laid out").toEqual(["ForeverUI", true, true]);
  old.eval("HideUIPanel = function(f) f:Hide() end ns.gameMenuButton.__scripts.OnClick()");
  expect(old.eval("return GameMenuFrame:IsShown()"), "which closes the menu too").toBe(false);
  expect(loggedIn("").eval("return ns.gameMenuButton == nil"), "no game menu, nothing added").toBe(true);
});

it("game menu button: falls back, or goes without what the menu lacks", () => {
  const broken = loggedIn(FOREVER_MENU_ENV + 'GameMenuFrame.buttonTemplate = "NoSuchTemplate"');
  expect(broken.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, ns.errors[#ns.errors].text:match('^GameMenu:') ~= nil }"), "a template that can't be built: themed button under the menu, one logged error").toEqual(["ForeverUI", true, true]);
  const plain = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.buttonTemplate = nil");
  expect(plain.eval("GameMenuFrame:Show() local b = ns.gameMenuButton return { b.text:GetText(), b.layoutIndex, b:GetWidth(), GameMenuFrame.order[1] }"), "a layout menu without a template gets a themed button, still first").toEqual(["ForeverUI", 0, 200, "ForeverUI"]);
  const clean = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.MarkDirty = nil");
  expect(clean.eval("GameMenuFrame:Show() local n = 0 for _, e in ipairs(ns.errors) do if e.text:match('^GameMenu:') then n = n + 1 end end return { GameMenuFrame.order[1], n }"), "a layout menu without MarkDirty still gets the button first, no GameMenu error").toEqual(["ForeverUI", 0]);
});

// What the game's boss holder and its first and last boss button look like: shown, parked, listening, hooked.
const bossHolder = (addon) => addon.eval(`local c, b1, b5 = BossTargetFrameContainer, Boss1TargetFrame, Boss5TargetFrame
  return { c:IsShown(), c:GetParent() == UIParent, c:IsEventRegistered("PLAYER_ENTERING_WORLD"), rawget(c, "Show") == nil and rawget(c, "SetShown") == nil,
    b1:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b5:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b1:GetParent() == c, b5:GetParent() == c }`);

it("boss frames: five in a column at the top left, the game's put away", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV);
  expect(addon.eval(`return { ForeverUI_boss5 ~= nil, ForeverUI_boss1.__watched, ForeverUI_boss2.__points.TOPLEFT.rel == ForeverUI_boss1, ForeverUI_boss2:GetWidth() }`), "five boss frames, each shown while its boss exists, stacked").toEqual([true, true, true, 150]);
  expect(addon.eval("return { ns.MoverPoint('uf_boss1') }"), "movable, from the top-left corner").toEqual(["TOPLEFT", "TOPLEFT", 20, -20]);
  addon.eval("__units.boss1.hp = 4200");
  addon.fire("INSTANCE_ENCOUNTER_ENGAGE_UNIT");
  expect(addon.eval("return { ForeverUI_boss1.health.__value, ForeverUI_boss1.name:GetText() }"), "a boss joining the fight shows on its frame").toEqual([4200, "TEST-ONLY Boss"]);
  expect(bossHolder(addon), "the game's holder is hidden, parked, silenced and has no Show hook; its boss buttons are silenced and out of it").toEqual([false, false, false, true, false, false, false, false]);
  expect(addon.eval("return { BossTargetFrameContainer:GetParent():IsShown(), Boss5TargetFrame:IsShown() }"), "under a parent that is hidden").toEqual([false, false]);
  const off = loggedIn(UNITS_ENV + BOSS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { UnitFrames = { boss = false } } }" });
  expect(off.eval("return ForeverUI_boss1 == nil"), "switched off: no boss frames").toBe(true);
  expect(bossHolder(off), "and the game keeps its own, untouched").toEqual([true, true, true, true, true, true, true, true]);
});

it("boss frames: the game's holder is put away only out of combat", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV + "__wfgStub.inCombat = true");
  expect([addon.eval("return ForeverUI_boss1 == nil"), ...bossHolder(addon)], "in combat nothing is touched").toEqual([true, true, true, true, true, true, true, true, true]);
  setCombat(addon, false);
  expect([addon.eval("return ForeverUI_boss1 ~= nil"), ...bossHolder(addon)], "when combat ends it is put away, still without a hook").toEqual([true, false, false, false, true, false, false, false, false]);
});

// TEST-ONLY boss: one boss in the fight, and the game's boss frame holder (an Edit Mode frame,
// protected through its five secure boss buttons, which register the engage event).
const BOSS_ENV = `
  __units.boss1 = { name = "TEST-ONLY Boss", hp = 5000, maxhp = 10000, power = 0, maxpower = 0, ptype = "MANA" }
  hooksecurefunc = function(t, name, fn) local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  BossTargetFrameContainer = CreateFrame("Frame", "BossTargetFrameContainer", UIParent)
  BossTargetFrameContainer:RegisterEvent("PLAYER_ENTERING_WORLD")
  BossTargetFrameContainer.IsProtected = function() return true, false end
  for i = 1, 5 do
    CreateFrame("Button", "Boss" .. i .. "TargetFrame", BossTargetFrameContainer, "SecureUnitButtonTemplate"):RegisterEvent("INSTANCE_ENCOUNTER_ENGAGE_UNIT")
  end
`;

// TEST-ONLY group: you lead a party; every raid tool call is recorded.
const TOOLS_GROUP_ENV = `
  __leader, __assist, __inGroup, __inRaid, __markable, __calls = true, false, true, false, true, {}
  local function log(text) __calls[#__calls + 1] = text end
  IsInGroup = function() return __inGroup end
  IsInRaid = function() return __inRaid end
  UnitIsGroupLeader = function() return __leader end
  UnitIsGroupAssistant = function() return __assist end
  IsEveryoneAssistant = function() return false end
  C_PartyInfo = { DoReadyCheck = function() log("ready") end, DoCountdown = function(n) log("pull " .. n) end, ConvertToRaid = function() log("raid") end }
  InitiateRolePoll = function() log("roles") end
  SetRaidTarget = function(unit, i) log("mark " .. unit .. " " .. i) end
  CanBeRaidTarget = function() return __markable end
  function __tool(i, button) local b = ForeverUI_RaidTools.list[i] b.__scripts.OnClick(b, button or "LeftButton") end
`;

it("raid tools: calls, target icons and world markers for the leader and assistants", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV);
  // Whether the bar shows, and whether its Raid button does.
  const state = () => addon.eval("local a = ForeverUI_RaidTools.actions return { ForeverUI_RaidTools:IsShown(), a.Raid:IsShown() }");
  expect(state(), "a party's leader sees the bar, with Raid").toEqual([true, true]);
  addon.eval("for i = 1, 4 do __tool(i) end __tool(2, 'RightButton') __tool(5) __tool(13)");
  expect(addon.eval("return __calls"), "ready check, pull 10 (right-click cancels), roles, convert; skull on the target, then clear").toEqual(["ready", "pull 10", "roles", "raid", "pull 0", "mark target 1", "mark target 0"]);
  addon.eval("__markable = false __calls = {} __tool(5)");
  expect(addon.eval("return #__calls"), "a target that can't be marked is left alone").toBe(0);
  expect(addon.eval(`local m, c = ForeverUI_RaidTools.list[14], ForeverUI_RaidTools.list[22]
    return { m:GetAttribute("type"), m:GetAttribute("marker"), m:GetAttribute("action1"), m:GetAttribute("action2"), c:GetAttribute("action") }`), "world markers are the game's secure marker buttons").toEqual(["worldmarker", 1, "toggle", "clear", "clear"]);
  addon.eval("__inRaid, __leader, __assist = true, false, true");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(state(), "a raid assistant sees it too, without Raid").toEqual([true, false]);
  addon.eval("__assist = false");
  setCombat(addon, true);
  addon.fire("PARTY_LEADER_CHANGED");
  expect(state()[0], "in combat it waits").toBe(true);
  setCombat(addon, false);
  expect(state()[0], "then hides for a plain raid member").toBe(false);
  const bare = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "C_PartyInfo = { DoReadyCheck = C_PartyInfo.DoReadyCheck } InitiateRolePoll = nil");
  expect(bare.eval("local out = {} for k in pairs(ForeverUI_RaidTools.actions) do out[#out + 1] = k end return out"), "only the calls this client has").toEqual(["Ready"]);
  const solo = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "__inGroup = false");
  expect(solo.eval("return ForeverUI_RaidTools:IsShown()"), "hidden out of a group").toBe(false);
});

it("raid frames: groups as rows, and the main tank's shield", () => {
  const rows = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { RaidFrames = { layout = 'rows' } } }" });
  expect(rows.eval(`local h = ForeverUI_Raid return { h:GetAttribute("point"), h:GetAttribute("columnAnchorPoint"), h:GetAttribute("xOffset"), h:GetAttribute("yOffset"), ForeverUI_RaidHolder:GetWidth(), ForeverUI_RaidHolder:GetHeight() }`), "each group a row of five, groups stacked up; the holder is one row").toEqual(["LEFT", "BOTTOM", 4, 0, 516, 48]);
  const addon = loggedIn(UNITS_ENV + RAID_ENV + 'GetPartyAssignment = function(kind, unit) return (unit == "raid1" and kind == "MAINTANK") or (unit == "raid2" and kind == "MAINASSIST") end');
  addon.eval('__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")');
  // Whether tile i's role mark shows, and its color.
  const tint = (i) => addon.eval(`local b = ForeverUI_RaidUnitButton${i} return { b.role:IsShown(), b.role.__vertexColor }`);
  expect(raidButton(addon, 1).role === addon.eval("return ns.Theme.Icon('RoleTank')") && isTok(addon, tint(1)[1], "accent"), "the main tank's shield in the accent").toBe(true);
  expect(raidButton(addon, 2).role === addon.eval("return ns.Theme.Icon('RoleTank')") && isTok(addon, tint(2)[1], "text2"), "the main assist's in text2").toBe(true);
  expect(tint(3)[0], "no assignment, no role: no mark").toBe(false);
});

// TEST-ONLY leveling numbers: level 10 of 60, 1000 of 5000 XP into the level.
const LEVEL_ENV = `
  __xp, __xpmax, __rested, __level = 1000, 5000, 2500, 10
  UnitXP = function() return __xp end
  UnitXPMax = function() return __xpmax end
  GetXPExhaustion = function() return __rested end
  UnitLevel = function() return __level end
  GetMaxPlayerLevel = function() return 60 end
`;

it("the info strip: XP and gold per hour, and time to level", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV + LEVEL_ENV);
  // Whether each leveling block shows.
  const rates = () => ["xprate", "leveltime", "goldrate"].map((k) => block(addon, k).shown);
  // The strip's height (two rows, or three with the leveling row).
  const height = () => addon.eval("return ForeverUI_InfoStrip:GetHeight()");
  expect([rates(), height()], "nothing to say yet: two rows").toEqual([[false, false, false], 36]);
  addon.eval("__xp = 1900");
  addon.fire("PLAYER_XP_UPDATE", "player");
  later(addon, 10);
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect(rates(), "the first minute's numbers jump about, so they wait").toEqual([false, false, false]);
  later(addon, 1790);
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect([block(addon, "xprate").text, block(addon, "leveltime").text, height()], "900 XP in half an hour; the strip grows a row").toEqual(["1.8K xp/h", "lvl 1h 44m", 52]);
  addon.eval("__xp, __xpmax, __rested = 200, 6000, nil");
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect([block(addon, "xprate").text, block(addon, "leveltime").text], "a level-up counts the old level's rest too").toEqual(["8.4K xp/h", "lvl 42m"]);
  addon.eval("__money = 128407");
  addon.fire("PLAYER_MONEY");
  const gold = block(addon, "goldrate");
  expect(gold.text === "+1g 0s/h" && isTok(addon, gold.color, "gold"), "gold earned per hour").toBe(true);
  addon.eval("__money = 123207 __wfgStub.advance(5)");
  const spent = block(addon, "goldrate");
  expect(/^-3s 9\dc\/h$/.test(spent.text) && isTok(addon, spent.color, "bad"), "the timer repaints the rates; spending shows red").toBe(true);
  addon.eval("__level = 60");
  addon.fire("PLAYER_LEVEL_UP");
  expect(rates(), "no XP numbers at the level cap").toEqual([false, false, true]);
  addon.eval("__money = 123407");
  addon.fire("PLAYER_MONEY");
  expect([rates(), height()], "no change in gold, no gold rate; back to two rows").toEqual([[false, false, false], 36]);
  addon.eval('__level = 20 __xp = { __secret = true }');
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect(rates(), "hidden XP: the rate so far stays, the time to level hides").toEqual([true, false, false]);
  expect(addon.eval('local IS = ns.GetModule("InfoStrip") return { IS.ShortMoney(5), IS.ShortMoney(507), IS.Duration(30) }'), "short money and times").toEqual(["5c", "5s 7c", "1m"]);
});

// TEST-ONLY merchant: repairs for 50s; bag 0 holds a gray item, a gray with no value, and a white.
const MERCHANT_ENV = `
  C_MerchantFrame = nil
  __repairs, __used = {}, {}
  CanMerchantRepair = function() return __canRepair end
  __canRepair, __cost, __gold = true, 5000, 10000
  GetRepairAllCost = function() return __cost, true end
  GetMoney = function() return __gold end
  RepairAllItems = function(guild) __repairs[#__repairs + 1] = guild end
  __bag = { { quality = 0 }, { quality = 0, hasNoValue = true }, { quality = 1 }, { quality = { __secret = true } } }
  __sticky = 1
  C_Container = { GetContainerNumSlots = function(bag) return bag == 0 and 4 or 0 end,
    GetContainerItemInfo = function(bag, slot) return __bag[slot] end,
    UseContainerItem = function(bag, slot) __used[#__used + 1] = slot if __sticky > 0 then __sticky = __sticky - 1 else __bag[slot] = nil end end }
  C_Timer = { After = function(_, fn) fn() end }
  ERR_ABILITY_COOLDOWN = "TEST-ONLY not ready"
  UIErrorsFrame = CreateFrame("Frame", "UIErrorsFrame", UIParent) UIErrorsFrame:RegisterEvent("UI_ERROR_MESSAGE")
  function UIErrorsFrame:AddMessage(text) self.__lines = self.__lines or {} self.__lines[#self.__lines + 1] = text end
`;

it("at a merchant: repair with your own gold, sell junk", () => {
  const addon = loggedIn(MERCHANT_ENV);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __repairs"), "repairs with your own gold, not the guild's").toEqual([false]);
  expect(chatHas(addon, /Repaired for 50s 0c/) && chatHas(addon, /Selling 1 junk item/), "and says so").toBe(true);
  expect(addon.eval("return { __used, __bag[1] == nil }"), "the gray item is sold, tried again when the first try didn't take").toEqual([[1, 1], true]);
  addon.eval("__gold = 100 __repairs = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__repairs") === 0 && chatHas(addon, /Not enough gold to repair/), "no repair you can't pay for").toBe(true);
  addon.eval("__cost = 0");
  addon.fire("MERCHANT_SHOW");
  addon.eval("__canRepair = false");
  addon.fire("MERCHANT_SHOW");
  addon.eval("C_MerchantFrame = { SellAllJunkItems = function() __all = true end }");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __all"), "the client's own one-step sale where it has one").toBe(true);
  const off = loggedIn(MERCHANT_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Merchant = { repair = false, junk = false, errors = false } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return { #__repairs, #__used, UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE') }"), "each part can be turned off").toEqual([0, 0, true]);
  const bare = loggedIn("CanMerchantRepair = nil");
  bare.fire("MERCHANT_SHOW");
  expect(bare.eval("return ns.GetModule('Merchant').Noisy('x')"), "a client without these calls does nothing").toBe(false);
});

it("the error line drops what the action bar already shows", () => {
  const addon = loggedIn(MERCHANT_ENV);
  expect(addon.eval("return UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE')"), "ForeverUI takes over the error line").toBe(false);
  addon.fire("UI_ERROR_MESSAGE", 51, "TEST-ONLY not ready");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 53);
  expect(addon.eval("return UIErrorsFrame.__lines"), "noise is dropped, useful errors stay").toEqual(["TEST-ONLY Out of range"]);
  const none = loggedIn("UIErrorsFrame = nil");
  expect(none.eval("return ns.GetModule('Merchant').settings.errors"), "no error line on this client: nothing to take over").toBe(true);
});

it("a Sort button on the combined bag, where the client can sort", () => {
  const addon = loggedIn(UI_ENV + "C_Container = { SortBags = function() __sorted = true end }");
  expect(addon.eval('local b = ns.GetModule("Bags").sort b:GetScript("OnClick")(b) return __sorted'), "Sort sorts your bags").toBe(true);
  expect(loggedIn(UI_ENV + "C_Container = nil").eval('return ns.GetModule("Bags").sort == nil'), "no sort call, no button").toBe(true);
});

it("nameplates: a gold ! by units your quests need", () => {
  const env = "__related = { nameplate1 = true, nameplate2 = { __secret = true } } C_QuestLog = { UnitIsRelatedToActiveQuest = function(unit) return __related[unit] end }";
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + CLICK_LUA + env);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // A plate's quest mark: shown, its icon, its color.
  const mark = (unit) => addon.eval(`local q = __plates.${unit}.fui.quest return { q:IsShown(), q.__texture, q.__vertexColor }`);
  const one = mark("nameplate1");
  expect([one[0], /Icons\\Quests$/.test(one[1]), isTok(addon, one[2], "gold")], "a quest unit gets the gold !").toEqual([true, true, true]);
  expect(addon.eval("return __plates.nameplate1.fui.quest.__points.LEFT.rel == __plates.nameplate1.fui.name"), "just right of its name").toBe(true);
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
  expect(bare.eval("return __plates.nameplate1.fui.quest:IsShown()"), "a client that can't say shows none").toBe(false);
});

it("flight timer: the taxi check runs only from picking a flight until it lands", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV + "__asked = 0 local real = UnitOnTaxi UnitOnTaxi = function(...) __asked = __asked + 1 return real(...) end");
  // How often the taxi state was asked so far, then reset.
  const asked = () => addon.eval("local n = __asked __asked = 0 return n");
  addon.advance(60);
  expect([asked(), addon.eval('return ns.GetModule("Errands").poller:IsShown()')], "a minute on the ground with no flight picked: never asked").toEqual([0, false]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true");
  addon.advance(5);
  expect([asked(), flightBar(addon).shown], "in the air: asked twice a second, the bar up").toEqual([10, true]);
  addon.eval("__onTaxi = false");
  addon.advance(1);
  expect([addon.eval('return ns.GetModule("Errands").poller:IsShown()'), flightBar(addon).shown], "landed: the check stops").toEqual([false, false]);
  asked();
  addon.advance(30);
  expect(asked(), "and stays stopped").toBe(0);
});

it("minimap coordinates: asked again only after the player moves", () => {
  // TEST-ONLY world position, and a counter of map position lookups.
  const addon = loggedIn(UI_ENV + `__pos = { 100, 200, 0, 1 } UnitPosition = function() return __pos[1], __pos[2], __pos[3], __pos[4] end
    __asked = 0 local real = C_Map.GetPlayerMapPosition C_Map.GetPlayerMapPosition = function(...) __asked = __asked + 1 return real(...) end`);
  // Map position lookups so far, then reset; and the text under the map.
  const asked = () => addon.eval("local n = __asked __asked = 0 return n");
  const coords = () => addon.eval('return ns.GetModule("Minimap").coords:GetText()');
  addon.advance(2);
  expect([asked(), coords()], "standing still for two seconds: one lookup, the coordinates shown").toEqual([1, "45.7, 12.3"]);
  addon.eval("__pos[1] = 101 C_Map.GetPlayerMapPosition = function() __asked = __asked + 1 return { GetXY = function() return 0.5, 0.25 end } end");
  addon.advance(0.25);
  expect([asked(), coords()], "a step: looked up again, the new coordinates").toEqual([1, "50.0, 25.0"]);
  addon.eval("__pos[4] = 2");
  addon.advance(0.25);
  addon.eval("C_Map.GetBestMapForUnit = function() return 7 end");
  addon.advance(0.25);
  expect(asked(), "another continent, or another map at the same spot: looked up again each time").toBe(2);
  addon.eval("__pos[1] = { __secret = true }");
  addon.advance(1);
  expect(asked(), "a hidden position can't be compared: looked up on every refresh, as before").toBe(4);
});

it("minimap with no position, chat window hooks, and short numbers", () => {
  const addon = loggedIn(`
    C_Map = nil
    __hooks = {}
    -- TEST-ONLY chat hooks: hooksecurefunc, FCF_OpenTemporaryWindow and FCF_Tab_OnClick.
    hooksecurefunc = function(name, fn) __hooks[name] = fn end
    function FCF_OpenTemporaryWindow() end
    function FCF_Tab_OnClick() end
  `);
  expect(addon.eval('return ns.GetModule("Minimap").CoordsText()') === "", "coordinates are blank when the client has no map position").toBeTruthy();
  expect(addon.eval("return type(__hooks.FCF_OpenTemporaryWindow)") === "function", "a new whisper window is skinned when it opens").toBeTruthy();
  expect(addon.eval("return type(__hooks.FCF_Tab_OnClick)") === "function", "clicking a chat tab refreshes the tabs").toBeTruthy();
  expect(addon.eval('return ns.GetModule("DataBars").Short(1500000)') === "1.5M", "a million is shown as millions").toBeTruthy();
  expect(addon.eval('return ns.GetModule("DataBars").Short(12)') === "12", "a small number is shown whole").toBeTruthy();
});

it("the game's tools: Cooldown Manager and damage meter styled and placed, standing aside for Edit Mode", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  const item = addon.eval(`local i = EssentialCooldownViewer.items[1]
    return { crop = i.Icon.__texCoord and i.Icon.__texCoord[1], inset = i.Icon.__points.TOPLEFT.x > 0, font = i.ChargeCount.Current.__font[3] }`);
  expect(item.crop > 0 && item.inset && item.font === "OUTLINE", "cooldown icons are cropped, inset in a thin border, with outlined numbers").toBe(true);
  addon.eval("UtilityCooldownViewer:RefreshLayout()");
  expect(addon.eval("return UtilityCooldownViewer.items[2].fuiSkinned"), "items the game adds later are styled too").toBe(true);
  expect(addon.eval("return BuffBarCooldownViewer.items[1].Bar:GetStatusBarTexture() ~= nil and BuffBarCooldownViewer.items[1].Bar.Name.__font ~= nil"), "buff bars get the theme's bar and font").toBe(true);
  const win = addon.eval("local w = DamageMeterSessionWindow1 local l = w.ScrollBox.lines[1] return { w.Header.__alpha, l.StatusBar.BackgroundRegions[1].__alpha, l.StatusBar.Name.__font ~= nil }");
  expect(win, "the meter's header and bar shading fade, its lines take the theme font").toEqual([0, 0, true]);
  addon.eval("__line(DamageMeterSessionWindow1) DamageMeterSessionWindow1.ScrollBox:Update() DamageMeter:SetupSessionWindow() __line(DamageMeterSessionWindow2) DamageMeterSessionWindow2.ScrollBox:Update()");
  expect(addon.eval("return { DamageMeterSessionWindow1.ScrollBox.lines[2].fuiSkinned, DamageMeterSessionWindow2.fuiSkinned, DamageMeterSessionWindow2.ScrollBox.lines[1].fuiSkinned }"), "new lines and new windows are styled as they come").toEqual([true, true, true]);
  // Where a game frame is anchored: { point, the spot it's on }.
  const spot = (name, point) => addon.eval(`local p = ${name}.__points.${point} return p and { p.relPoint, p.rel == ForeverUI_${name}Spot } or false`);
  expect([spot("EssentialCooldownViewer", "CENTER"), spot("DamageMeter", "TOPLEFT"), spot("DamageMeter", "BOTTOMRIGHT")], "rows are centered on their spots; the meter fills its own").toEqual([["CENTER", true], ["TOPLEFT", true], ["BOTTOMRIGHT", true]]);
  addon.eval('EditModeManagerFrame:Show() EssentialCooldownViewer:ClearAllPoints() EssentialCooldownViewer:SetPoint("TOP", UIParent, "TOP", 0, -50)');
  expect(spot("EssentialCooldownViewer", "TOP"), "while Edit Mode is open, the game can move it").toEqual(["TOP", false]);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(spot("EssentialCooldownViewer", "CENTER"), "and it's back on its spot when Edit Mode closes").toEqual(["CENTER", true]);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Place them to fit the layout") and ForeverUIDB.profiles.Default.GameTools.place'), "the placing switch is on the page").toBe(false);
  const left = loggedIn(TOOLS_ENV, { savedVariables: "ForeverUIDB.profiles.Default = { GameTools = { place = false } }" });
  expect(left.eval("return { ForeverUI_DamageMeterSpot == nil, DamageMeter.__points.TOPLEFT.rel == UIParent, DamageMeterSessionWindow1.fuiSkinned }"), "with placing off they keep Edit Mode's spots but are still styled").toEqual([true, true, true]);
  const off = loggedIn(TOOLS_ENV, { savedVariables: "ForeverUIDB.profiles.Default = { GameTools = { cooldowns = false, meter = false } }" });
  expect(off.eval("return { EssentialCooldownViewer.items[1].fuiSkinned == nil, DamageMeterSessionWindow1.fuiSkinned == nil, ForeverUI_DamageMeterSpot == nil }"), "switched off, both stay the game's").toEqual([true, true, true]);
  expect(loggedIn("").eval("return ns.GetModule('GameTools') ~= nil"), "a client without these tools loads cleanly").toBe(true);
});

it("Edit Mode shows ForeverUI's handles too, with a note under its window", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  // Whether the handles are up, how many grid lines show, and whether the note shows (with its text).
  const state = () => addon.eval("local n = ForeverUI_EditModeNote return { ns.Unlocked(), ns.GridLineCount(), n ~= nil and n:IsShown(), n ~= nil and n.text:GetText() == ns.EDIT_NOTE }");
  addon.eval("EditModeManagerFrame:Show()");
  expect(state(), "opening Edit Mode shows the handles (the game draws its own grid) and the note").toEqual([true, 0, true, true]);
  expect(addon.eval("return ForeverUI_EditModeNote.__points.TOP.rel == EditModeManagerFrame"), "the note sits under Edit Mode's window").toBe(true);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(state().slice(0, 3), "closing it hides them again").toEqual([false, 0, false]);
  addon.slash("unlock");
  addon.eval("EditModeManagerFrame:Show() EditModeManagerFrame:Hide()");
  expect(addon.eval("return ns.Unlocked()"), "handles you put up with /fui unlock stay up").toBe(true);
  addon.slash("lock");
  setCombat(addon, true);
  addon.eval("EditModeManagerFrame:Show()");
  expect(state().slice(0, 3), "not in combat").toEqual([false, 0, false]);
  addon.eval("EditModeManagerFrame:Hide()");
  setCombat(addon, false);
  addon.slash("");
  addon.eval(`__click("Show these handles in the game's Edit Mode too")`);
  addon.eval("EditModeManagerFrame:Show()");
  expect(state().slice(0, 3), "the switch under General turns it off").toEqual([false, 0, false]);
});

it("the game's tools: one hint when the Cooldown Manager is off", () => {
  // A client whose Cooldown Manager is available (or not) and switched on (or not).
  const env = (enabled, available = "true") => `C_CooldownViewer = { IsCooldownViewerAvailable = function() return ${available} end }
    C_CVar = { GetCVarBool = function(name) if name == "cooldownViewerEnabled" then return ${enabled} end end }`;
  const addon = loggedIn(UNITS_ENV + env("false"));
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(chatHas(addon, /Cooldown Manager is off\. Turn it on in Options > Gameplay Enhancements/), "where to turn it on").toBe(true);
  addon.fire("PLAYER_ENTERING_WORLD");
  expect([addon.chat().filter((line) => /Cooldown Manager is off/.test(line)).length, addon.eval("return ForeverUIDB.profiles.Default.GameTools.cdmHint")], "said once").toEqual([1, false]);
  // Whether a client says the hint at all.
  const hints = (lua, saved = "") => { const a = loggedIn(UNITS_ENV + lua, { savedVariables: saved }); a.fire("PLAYER_ENTERING_WORLD"); return chatHas(a, /Cooldown Manager is off/); };
  expect([hints(env("true")), hints(env("false", "false")), hints(env("false") + " C_CVar = nil"), hints("C_CooldownViewer = nil"),
    hints(env("false"), "ForeverUIDB.profiles = { Default = { GameTools = { cooldowns = false } } }")],
  "not when it's on, not available yet, the client can't say, or ForeverUI leaves it alone").toEqual([false, false, false, false, false]);
});

it("the game's extras: duplicates hidden, minimap buttons on the map, menu strip, quest tracker", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV);
  expect(["DurabilityFrame", "TimeManagerClockButton", "GameTimeFrame"].map((n) => putAway(addon, n)), "the game's durability figure, clock and calendar button are put away").toEqual([true, true, true]);
  // The game's XP bar: still under its own parent (Edit Mode calls methods on it), and hidden.
  const xpBar = () => addon.eval("local f = StatusTrackingBarManager return { f:GetParent() == UIParent, f:IsShown() }");
  expect(xpBar(), "the game's XP bar is hidden where it is, not moved").toEqual([true, false]);
  addon.eval("StatusTrackingBarManager:Show()");
  expect(xpBar(), "when the game shows it, it's hidden again").toEqual([true, false]);
  addon.eval("StatusTrackingBarManager:SetShown(true)");
  expect(xpBar(), "however it's shown").toEqual([true, false]);
  expect(addon.eval("local M = ns.GetModule('Minimap') M.overlay:Layout() return M.overlay.Layout == M.NoLayout"), "the map's overlay answers a moved button's Layout call (the mail icon makes one when mail arrives)").toBe(true);
  const overlay = "ns.GetModule('Minimap').overlay";
  expect([pinned(addon, "MinimapCluster.Tracking", overlay), pinned(addon, "MinimapCluster.IndicatorFrame.MailFrame", overlay), pinned(addon, "AddonCompartmentFrame", overlay)],
    "tracking, mail and the addon compartment sit on the map's corners").toEqual([[true, "BOTTOMLEFT"], [true, "TOPRIGHT"], [true, "BOTTOMRIGHT"]]);
  addon.eval('MinimapCluster.Tracking:ClearAllPoints() MinimapCluster.Tracking:SetPoint("CENTER", UIParent, "CENTER", 0, 0)');
  expect(pinned(addon, "MinimapCluster.Tracking", overlay), "when the game moves one back, it returns to its corner").toEqual([true, "BOTTOMLEFT"]);
  expect([pinned(addon, "MicroMenuContainer", "ForeverUI_MenuStrip"), pinned(addon, "BagsBar", "ForeverUI_BagStrip")], "the micro menu and the bag bar each get their own strip, centered in it").toEqual([[true, "CENTER"], [true, "CENTER"]]);
  addon.eval("BagsBar:SetSize(300, 40) ns.PausePins(false)");
  expect(addon.eval("return { ForeverUI_BagStrip:GetWidth(), ForeverUI_BagStrip:GetHeight() }"), "a bag bar wider than the strip grows it, with a margin around it (36 tall at least)").toEqual([300 * 0.7 + 12, 36]);
  addon.eval("BagsBar:SetSize(50, 20) ns.PausePins(false)");
  expect(addon.eval("return { ForeverUI_BagStrip:GetWidth(), ForeverUI_BagStrip:GetHeight() }"), "and never shrinks below its default").toEqual([132, 36]);
  expect(addon.eval("return { BagsBar:GetScale(), ForeverUI_BagStrip:GetAlpha(), ForeverUI_BagStrip.__points.BOTTOMRIGHT.x, ForeverUI_BagStrip.__points.BOTTOMRIGHT.y }"), "bags sit small, always shown, just above the menu on its right edge").toEqual([0.7, 1, -16, 20 + 36 + 6]);
  expect(addon.eval("return ForeverUI_MenuStrip:GetAlpha()"), "which is out of sight until the mouse is over it").toBe(0);
  addon.hover("ForeverUI_MenuStrip");
  expect(addon.eval("return ForeverUI_MenuStrip:GetAlpha()"), "and shows with the mouse over it").toBe(1);
  expect(addon.eval("local p = ObjectiveTrackerFrame.__points.TOPRIGHT return { p.rel == ForeverUI_QuestTracker, ObjectiveTrackerFrame:GetHeight() }"), "the quest tracker sits under the info strip, no taller than its spot").toEqual([true, 248]);
});

it("the game's extras: a protected frame is hidden once, out of combat, with no Show hook", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + "ProtectedBar = CreateFrame('Frame', 'ProtectedBar', UIParent) ProtectedBar.IsProtected = function() return true, false end __wfgStub.inCombat = true");
  // Shown, still under UIParent, and without a raw Show or SetShown hook.
  const state = () => addon.eval("local f = ProtectedBar return { f:IsShown(), f:GetParent() == UIParent, rawget(f, 'Show') == nil and rawget(f, 'SetShown') == nil }");
  addon.eval("ns.GetModule('DataBars').Suppress('ProtectedBar')");
  expect(state(), "in combat it is left alone, with no hook").toEqual([true, true, true]);
  setCombat(addon, false);
  expect(state(), "after combat it is hidden where it is, still with no hook").toEqual([false, true, true]);
  addon.eval("ProtectedBar:Show() ns.GetModule('DataBars').Suppress('ProtectedBar')");
  expect(state(), "hidden once: shown again when the game shows it, and a second Suppress does nothing").toEqual([true, true, true]);
});

it("the game's extras: each switch off leaves the game's frame alone, and missing frames are fine", () => {
  const off = loggedIn(UI_ENV + TIDY_ENV, { savedVariables: `ForeverUIDB.profiles = { Default = { DataBars = { xp = false, reputation = false },
    InfoStrip = { durability = false, clock = false }, Minimap = { icons = false }, MenuStrip = { menu = "always", tracker = false }, QuestTracker = { own = false } } }` });
  expect(["StatusTrackingBarManager", "DurabilityFrame", "TimeManagerClockButton"].map((n) => putAway(off, n)), "replacements off: the game's own stay").toEqual([false, false, false]);
  expect(off.eval("return MinimapCluster.Tracking:GetParent() == MinimapCluster"), "minimap buttons off: tracking stays where the game put it").toBe(true);
  expect(off.eval("return { ForeverUI_MenuStrip:GetAlpha(), ForeverUI_MenuStrip.__scripts.OnUpdate == nil }"), "menu strip set to Always: always shown, nothing polling").toEqual([1, true]);
  expect(off.eval("return next(ObjectiveTrackerFrame.__points) == nil and ForeverUI_QuestTracker == nil"), "tracker off: the game's tracker is left alone").toBe(true);
  const bare = loggedIn(UI_ENV);
  expect(bare.eval("return ForeverUI_MenuStrip ~= nil and ForeverUI_QuestTracker ~= nil"), "a client without these frames still gets the strip and the spot, with nothing to pin").toBe(true);
});

it("Round Four leftovers: menu glyphs, a target diamond, raid names above incoming heals", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + CLICK_LUA);
  // A menu button's state: its icon, the icon's color, its faded art and kept flash, the icon's width.
  const glyph = (name) => addon.eval(`local b = ${name} local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { tex = b.fuiGlyph and b.fuiGlyph.__texture, color = b.fuiGlyph and b.fuiGlyph.__vertexColor, art = art, normal = b.normal.__alpha, flash = b.Flash.__alpha or 1, w = b.fuiGlyph and b.fuiGlyph.__width }`);
  const char = glyph("CharacterMicroButton");
  expect(/Icons\\Character$/.test(char.tex) && /Icons\\MenuCog$/.test(glyph("MainMenuMicroButton").tex), "each menu button gets its ForeverUI icon (a client without the rest is fine)").toBeTruthy();
  expect(char.art === 0 && char.normal === 0 && char.flash === 1 && Math.abs(char.w - 16 / 0.8) < 1e-9, "the game's art is faded but its alert flash stays; the icon is 16 screen pixels").toBeTruthy();
  expect(isTok(addon, char.color, "text"), "the icon is text").toBeTruthy();
  const face = addon.eval("local f = CharacterMicroButton.fuiFace return { f.__width, f.__height, f.__points.CENTER ~= nil, CharacterMicroButton.fuiGlyph:GetParent() == f }");
  expect(face, "each button's face is a centered 24-unit square (a gap between neighbors), the icon on it").toEqual([24, 24, true, true]);
  const bag = addon.eval(`local b = MainMenuBarBackpackButton local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { art, b.icon.__alpha, b.icon.__texCoord[1] > 0, b.icon.__points.TOPLEFT.x }`);
  expect(bag, "bag buttons: the game's art faded, the bag icon kept, cropped and inset in a thin border").toEqual([0, 1, true, 4]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "muted"), "and muted while the button is disabled").toBeTruthy();
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "text"), "back to text when it's enabled again").toBeTruthy();
  addon.eval('ns.Options.Show("more")');
  expect(addon.eval('return __click("ForeverUI icons on the menu buttons") and ForeverUIDB.profiles.Default.MenuStrip.glyphs'), "the switch is on the page").toBe(false);
  const plain = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV, { savedVariables: "ForeverUIDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  expect(plain.eval("return CharacterMicroButton.fuiGlyph == nil and CharacterMicroButton.normal.__alpha == nil"), "switched off, the game's menu art stays").toBe(true);

  const plates = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  plates.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  plates.fire("PLAYER_ENTERING_WORLD");
  // A plate's target marker: shown, texture, color and where it's anchored.
  const marker = (unit) => plates.eval(`local m = __plates.${unit}.fui.marker return { m:IsShown(), m.__texture, m.__vertexColor, m.__points.LEFT.relPoint }`);
  const target = marker("nameplate1");
  expect(target[0] === true && /Textures\\Diamond$/.test(target[1]) && isTok(plates, target[2], "accent") && target[3] === "RIGHT", "your target's plate gets an accent diamond at its right").toBeTruthy();
  // Whether a plate's target marker shows.
  const shown = (unit) => plates.eval(`return __plates.${unit}.fui.marker:IsShown()`);
  expect(shown("nameplate2"), "other plates don't").toBe(false);
  plates.eval('ForeverUIDB.profiles.Default.Nameplates.targetBorder = false ns.GetModule("Nameplates").Update(__plates.nameplate1.fui, "nameplate1")');
  expect(shown("nameplate1"), "and it goes with the target border switch").toBe(false);

  const raid = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  raid.eval('__spawn(1, "raid1")');
  const layers = raid.eval(`local b = ForeverUI_RaidUnitButton1
    return { b.name:GetParent() == b.texts and b.status:GetParent() == b.texts and b.role:GetParent() == b.texts and b.roleShadow:GetParent() == b.texts,
      b.texts:GetFrameLevel() > b.heal:GetFrameLevel() and b.texts:GetFrameLevel() > b.shield:GetFrameLevel(), b.texts:GetFrameLevel() < b.overlay:GetFrameLevel() }`);
  expect(layers, "a tile's name, role and status sit above the incoming-heal and shield bars, under the status marks").toEqual([true, true, true]);
});

it("menu strip: shown by the mouse entering and leaving it and its buttons, with nothing polling", () => {
  const addon = strips();
  // The menu strip's alpha.
  const alpha = () => addon.eval("return ForeverUI_MenuStrip:GetAlpha()");
  expect(addon.eval("local s = ForeverUI_MenuStrip return { s:GetScript('OnUpdate') == nil, s.__mouseMotion, s.__mouseClick }"), "no OnUpdate; the strip feels the mouse but lets clicks through").toEqual([true, true, false]);
  addon.hover("CharacterMicroButton");
  expect(alpha(), "straight onto a button: the strip shows").toBe(1);
  addon.hover("ForeverUI_MenuStrip");
  expect(alpha(), "from the button onto the strip between buttons: still shown").toBe(1);
  addon.hover("EJMicroButton");
  addon.hover(null);
  expect(alpha(), "off the strip: hidden").toBe(0);
  addon.hover("MainMenuMicroButton");
  addon.eval("ForeverUI_MenuStrip.__mouseOver = true");
  addon.hover(null);
  expect(alpha(), "leaving a button while still over the strip keeps it shown").toBe(1);
});

it("menu and bag strips: the bars' own frame art is hidden, the key ring is skinned", () => {
  const addon = strips();
  expect(addon.eval("return { MicroMenu.BorderArt.__alpha, MicroMenu.BackgroundArt.__alpha, BagsBar.BorderArt.__alpha }"), "the brass box is faded").toEqual([0, 0, 0]);
  expect(addon.eval("return { KeyRingButton.fuiBag, KeyRingButton.icon.__alpha, KeyRingButton.icon.__points.TOPLEFT.x, KeyRingButton.icon.__texCoord[1] > 0 }"), "the key ring gets the bag look").toEqual([true, 1, 4, true]);
  const off = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "ForeverUIDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  expect(off.eval("return { MicroMenu.BorderArt.__alpha, KeyRingButton.fuiBag == nil }"), "the frame art goes with or without the glyphs; the key ring keeps the game's look without them").toEqual([0, true]);
});

// The bag strip's x and y offsets at a point name.
const bagXY = (addon, point) => addon.eval(`local p = ForeverUI_BagStrip.__points.${point} return { p.x, p.y }`);

// The two strips' sizes, and the bag strip's x offset at a point name.
const stripSizes = (addon) => addon.eval("return { ForeverUI_MenuStrip:GetWidth(), ForeverUI_MenuStrip:GetHeight(), ForeverUI_BagStrip:GetWidth(), ForeverUI_BagStrip:GetHeight() }");

it("menu and bag strips: they re-fit when the game lays the bars out or resizes them", () => {
  const addon = strips();
  expect(stripSizes(addon), "before the game lays them out, the strips have their default sizes").toEqual([300, 36, 132, 36]);
  addon.eval("MicroMenuContainer:Layout()");
  expect(stripSizes(addon).slice(0, 2), "the menu strip grows around the laid-out micro menu, 36 tall").toEqual([378 * 0.8 + 12, 36]);
  expect(bagXY(addon, "BOTTOMRIGHT"), "and the bag strip sits just above it, on the same right edge").toEqual([-16, 20 + 36 + 6]);
  addon.eval("BagsBar:SetScale(1) BagsBar:Layout()");
  expect(stripSizes(addon).slice(2), "the bag strip grows around the laid-out bag bar, 36 tall").toEqual([266 * 0.7 + 12, 36]);
  expect(addon.eval("return BagsBar:GetScale()"), "the game's reset of the bag bar's scale is undone").toBe(0.7);
  addon.eval("MicroMenuContainer:SetSize(500, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer, 500, 40)");
  expect(stripSizes(addon)[0], "a size change alone re-fits the menu strip").toBe(500 * 0.8 + 12);
  expect(bagXY(addon, "BOTTOMRIGHT"), "and keeps the bag strip just above it").toEqual([-16, 20 + stripSizes(addon)[1] + 6]);
});

// The bag strip's x offset at a point name (nil when it has no such point).
const bagX = (addon, point) => addon.eval(`local p = ForeverUI_BagStrip.__points.${point} return p and p.x`);

it("menu and bag strips: a saved bag position wins; the default follows the menu strip's spot", () => {
  const addon = strips();
  addon.eval("ns.SetMoverPoint('bagstrip', 'BOTTOMLEFT', 'BOTTOMLEFT', 10, 10) MicroMenuContainer:Layout()");
  expect([bagX(addon, "BOTTOMLEFT"), bagX(addon, "BOTTOMRIGHT")], "a bag strip the player moved stays there through a re-fit").toEqual([10, null]);
  addon.eval("ns.ResetMovers('bagstrip')");
  expect(bagXY(addon, "BOTTOMRIGHT"), "and Reset puts it at the computed default").toEqual([-16, 20 + 36 + 6]);
  addon.eval("ns.SetMoverPoint('menustrip', 'BOTTOMLEFT', 'BOTTOMLEFT', 400, 20) MicroMenuContainer:Layout()");
  expect(bagXY(addon, "BOTTOMLEFT"), "a menu strip on the left: the bags line up on its left edge, above it").toEqual([400, 20 + 36 + 6]);
  addon.eval("ns.SetMoverPoint('menustrip', 'BOTTOM', 'BOTTOM', 40, 20) MicroMenuContainer:Layout()");
  expect(bagXY(addon, "BOTTOM"), "centered: centered over it").toEqual([40, 20 + 36 + 6]);
  addon.eval("ns.SetMoverPoint('menustrip', 'TOPRIGHT', 'TOPRIGHT', -16, -40) MicroMenuContainer:Layout()");
  expect(bagXY(addon, "TOPRIGHT"), "a top anchor: the bag strip's top is its height and a gap above the menu strip's").toEqual([-16, -40 + 36 + 6]);
  addon.eval("ns.SetMoverPoint('menustrip', 'RIGHT', 'RIGHT', -16, 0) MicroMenuContainer:Layout()");
  expect(bagXY(addon, "RIGHT"), "a middle anchor: centers a strip's half-heights and a gap apart").toEqual([-16, 36 + 6]);
});

it("menu and bag strips: moving or resetting the menu strip moves the bag strip's default at once, with no re-fit", () => {
  const addon = strips();
  addon.eval("MicroMenuContainer:Layout()");
  addon.eval("ns.SetMoverPoint('menustrip', 'BOTTOMRIGHT', 'BOTTOMRIGHT', -216, 20)");
  expect(bagXY(addon, "BOTTOMRIGHT"), "a drag of the menu strip carries the bag strip's default along").toEqual([-216, 20 + 36 + 6]);
  addon.eval("ns.ResetMovers('menustrip')");
  expect(bagXY(addon, "BOTTOMRIGHT"), "and Reset brings it back").toEqual([-16, 20 + 36 + 6]);
  addon.eval("ns.SetMoverPoint('bagstrip', 'BOTTOMLEFT', 'BOTTOMLEFT', 10, 10) ns.SetMoverPoint('menustrip', 'BOTTOMRIGHT', 'BOTTOMRIGHT', -216, 20)");
  expect(bagX(addon, "BOTTOMLEFT"), "a bag strip the player placed stays where it is").toBe(10);
  expect(addon.eval("local n = 0 ns.WatchMover('nothing', function() n = n + 1 end) ns.SetMoverPoint('menustrip', 'BOTTOM', 'BOTTOM', 0, 20) return n"), "a watcher is told of its own mover only").toBe(0);
});

it("menu and bag strips: no re-fit while pins are paused or in combat, and one queued entry per bar", () => {
  const addon = strips();
  addon.eval("ns.PausePins(true) __menuW = 600 MicroMenuContainer:Layout()");
  expect(stripSizes(addon)[0], "Edit Mode open: the strip waits").toBe(300);
  addon.eval("ns.PausePins(false)");
  expect(stripSizes(addon)[0], "and fits when it closes").toBe(600 * 0.8 + 12);
  setCombat(addon, true);
  addon.eval("__menuW = 400 MicroMenuContainer:Layout()");
  const queued = addon.eval("return ns.QueuedCount()");
  addon.eval("for _ = 1, 50 do MicroMenuContainer:Layout() end");
  expect([stripSizes(addon)[0], addon.eval("return ns.QueuedCount()")], "in combat nothing changes, and 50 more Layout calls queue nothing more").toEqual([600 * 0.8 + 12, queued]);
  setCombat(addon, false);
  expect(stripSizes(addon)[0], "after combat the strip fits").toBe(400 * 0.8 + 12);
  const plain = loggedIn(UI_ENV + 'CreateFrame("Frame", "MicroMenuContainer", UIParent) function MicroMenuContainer:Layout() end');
  expect(plain.eval("return { MicroMenuContainer:GetParent() == ForeverUI_MenuStrip, MicroMenuContainer.__scripts.OnSizeChanged ~= nil }"), "a client without hooksecurefunc still pins and watches the size").toEqual([true, true]);
});

it("menu and bag strips: glyphs are 16 screen pixels on a square face, accent under the mouse", () => {
  const addon = strips();
  // The glyph's screen size, whether it is square, and the face's size and centering.
  const look = () => addon.eval(`local b = CharacterMicroButton local rel = b:GetEffectiveScale() / UIParent:GetEffectiveScale()
    return { b.fuiGlyph.__width * rel, b.fuiGlyph.__height == b.fuiGlyph.__width, b.fuiFace.__width, b.fuiFace.__height, b.fuiFace.__points.CENTER ~= nil }`);
  expect(look(), "16 screen pixels, square, on a centered 24-unit face").toEqual([16, true, 24, 24, true]);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(addon.eval("return CharacterMicroButton.fuiGlyph.__width"), "a smaller menu: the glyph is capped at the face and re-sized by the re-fit").toBe(24);
  expect(addon.eval("return EJMicroButton.fuiFace.__width"), "a button with no size yet gets a 24-unit face").toBe(24);
  // The glyph's current color.
  const color = () => addon.eval("return CharacterMicroButton.fuiGlyph.__vertexColor");
  expect(isTok(addon, color(), "text"), "text at rest").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(isTok(addon, color(), "accent"), "accent under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, color(), "muted"), "muted while disabled, even under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, color(), "accent"), "enabled again under the mouse: accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(isTok(addon, color(), "text"), "text once the mouse leaves").toBe(true);
  expect(addon.eval("return MainMenuBarBackpackButton:GetWidth() * BagsBar:GetEffectiveScale() / UIParent:GetEffectiveScale()"), "bag buttons are 31.5 screen pixels").toBe(45 * 0.7);
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
  const off = loggedIn(PARCHMENT_ENV, { savedVariables: "ForeverUIDB.profiles.Default = { Windows = { windows = false } }" });
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

it("the quest tracker in the ForeverUI look: flat headers, brass lines, theme arrows and font", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV);
  const head = addon.eval(`local h = ObjectiveTrackerFrame.Header
    return { h.Background.__alpha, h.Glow.__alpha, h.MinimizeButton.normal.__alpha, h.Text.__font ~= nil, #ns.GetModule("MenuStrip").rules }`);
  expect(head, "header art and the game's button fade; the title takes the theme font; each header gets a brass line").toEqual([0, 0, 0, true, 2]);
  expect(isTok(addon, addon.eval("return ns.GetModule('MenuStrip').rules[1].__vertexColor"), "accent"), "the line is the accent").toBe(true);
  // The container header's arrow texture.
  const arrow = () => addon.eval("return ObjectiveTrackerFrame.Header.fuiArrow.__texture");
  expect(/Icons\\Down$/.test(arrow()), "an open section shows the Down arrow").toBe(true);
  addon.eval("ObjectiveTrackerFrame.Header:SetCollapsed(true)");
  expect(/Icons\\Right$/.test(arrow()), "collapsed, it shows Right").toBe(true);
  expect(addon.eval("return { ObjectiveTrackerLineFont.font[2], ObjectiveTrackerHeaderFont.font[2], ObjectiveTrackerHeaderFont.font[1]:find('SemiBold') ~= nil }"), "the tracker's fonts are the theme's (headers bold)").toEqual([12, 13, true]);
  addon.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(addon.eval("return ns.GetModule('MenuStrip').rules[2].__vertexColor[3]"), "the lines follow the accent").toBe(0.3);
  addon.eval("ObjectiveTrackerFrame.modules[2] = { Header = __header(ObjectiveTrackerFrame) } ObjectiveTrackerFrame:Update()");
  expect(addon.eval("return ObjectiveTrackerFrame.modules[2].Header.fuiHeader"), "a section the game adds later is styled on its next update").toBe(true);
  const off = loggedIn(UI_ENV + TIDY_ENV + TRACKER_ENV, { savedVariables: "ForeverUIDB.profiles.Default = { MenuStrip = { trackerLook = false } }" });
  expect(off.eval("return { ObjectiveTrackerFrame.Header.fuiHeader == nil, ObjectiveTrackerLineFont.font == nil }"), "switched off, the tracker stays the game's").toEqual([true, true]);
  expect(loggedIn(UI_ENV).eval("return ns.GetModule('MenuStrip').rules ~= nil"), "a client without the tracker loads cleanly").toBe(true);
});

// TEST-ONLY game windows: a framed window built like the game's ButtonFrameTemplate (art textures,
// NineSlice, inset, portrait, close button, title, push buttons), a popup and a breath bar.
const WINDOWS_ENV = `
  function __window(name, kind)
    local f = CreateFrame("Frame", name, UIParent)
    f:CreateTexture(nil, "BACKGROUND"):SetTexture("TEST-ONLY-ART")
    f.NineSlice = CreateFrame("Frame", nil, f) f.NineSlice:CreateTexture(nil, "BORDER")
    f.Inset = CreateFrame("Frame", nil, f) f.Inset.NineSlice = CreateFrame("Frame", nil, f.Inset)
    f.PortraitContainer = CreateFrame("Frame", nil, f)
    f.CloseButton = CreateFrame("Button", name .. "CloseButton", f)
    f.TitleContainer = CreateFrame("Frame", nil, f) f.TitleContainer.TitleText = f.TitleContainer:CreateFontString(nil, "OVERLAY")
    for i = 1, 2 do CreateFrame("Button", name .. "Button" .. i, f) end
    f:Hide()
    return f
  end
  __window("MerchantFrame") __window("StaticPopup1")
  local t = __window("MirrorTimer1") t.StatusBar = CreateFrame("StatusBar", nil, t)
`;

// A window's state: its own art faded, its parts dressed, how many frames are painted.
const windowState = (addon, name) => addon.eval(`local f = ${name}
  local art for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
  local panel = 0 for _, r in ipairs({ f:GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then panel = panel + 1 end end
  return { art = art, nine = f.NineSlice.__alpha, portrait = f.PortraitContainer.__alpha, insetNine = f.Inset.NineSlice.__alpha,
    panel = panel > 0, title = f.TitleContainer.TitleText:GetFont() ~= nil, painted = ns.Theme.PaintedCount() }`);

it("game windows in the ForeverUI look: framed windows, popups, breath bar, and windows that load later", () => {
  const addon = loggedIn(WINDOWS_ENV);
  addon.eval("MerchantFrame:Show()");
  const first = windowState(addon, "MerchantFrame");
  expect(first, "the game's art is faded, a panel is painted, the title takes the theme font").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, panel: true, title: true });
  addon.eval("MerchantFrame:Hide() MerchantFrame:Show()");
  expect(windowState(addon, "MerchantFrame"), "showing it again keeps the panel and paints nothing new").toMatchObject({ panel: true, painted: first.painted });
  expect(windowState(addon, "StaticPopup1"), "popups too").toMatchObject({ art: 0, panel: true });
  expect(addon.eval("return MirrorTimer1.StatusBar:GetStatusBarTexture() ~= nil"), "the breath bar uses the theme's bar texture").toBe(true);
  addon.eval('__window("PlayerSpellsFrame")');
  addon.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  expect(windowState(addon, "PlayerSpellsFrame"), "the spellbook is skinned when it loads").toMatchObject({ art: 0, panel: true });
  addon.fire("ADDON_LOADED", "TEST-ONLY_SomethingElse");
});

it("game windows: switched off they stay the game's, and missing windows are fine", () => {
  const off = loggedIn(WINDOWS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Windows = { windows = false, popups = false, timers = false } } }" });
  off.eval("MerchantFrame:Show() StaticPopup1:Show()");
  expect([windowState(off, "MerchantFrame").art, windowState(off, "StaticPopup1").art].every((a) => a !== 0), "nothing is faded").toBe(true);
  const bare = loggedIn("");
  expect(bare.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), "a client without these windows loads cleanly").toBe("none");
  const plain = loggedIn(`local f = CreateFrame("Frame", "LootFrame", UIParent) f.ButtonContainer = { Buttons = { CreateFrame("Button", nil, f) } }
    t = CreateFrame("Frame", "MirrorTimer2", UIParent) CreateFrame("StatusBar", "MirrorTimer2StatusBar", t)`);
  expect(plain.eval("return { select('#', LootFrame.ButtonContainer.Buttons[1]:GetRegions()) > 0, MirrorTimer2StatusBar:GetStatusBarTexture() ~= nil }"), "a window with a button container, and a bar found by name").toEqual([true, true]);
});

it("the AFK screen: a dimmed screen and a card while you're away", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // The AFK screen and its card's texts.
  const afk = () => addon.eval(`local f = ForeverUI_AfkScreen
    return { shown = f:IsShown(), name = f.name:GetText(), who = f.who:GetText(), where = f.where:GetText(), away = f.away:GetText(), clock = f.clock:GetText(), xp = f.xp:IsShown() and f.xp.__value, color = f.name.__textColor }`);
  expect(afk().shown, "hidden while you're here").toBe(false);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const card = afk();
  expect(card, "your name, level and class, where you are, the time away and the clock, your XP").toMatchObject({ shown: true, name: "<name>", who: "Level 42 Class", where: "TEST-ONLY Vale  ·  TEST-ONLY Hamlet", away: "Away 0:00", clock: "21:04", xp: 300 });
  expect(card.color.slice(0, 3), "the name in your class color").toEqual([0.25, 0.78, 0.92]);
  expect(addon.eval("return { ForeverUI_AfkScreen.__strata, ForeverUI_AfkScreen.dim.__vertexColor[4] }"), "over the whole UI, dimmed").toEqual(["FULLSCREEN_DIALOG", 0.75]);
  addon.eval("__wfgStub.advance(65, 1)");
  expect(afk().away, "the time away ticks").toBe("Away 1:05");
  expect(addon.eval("return ns.GetModule('AfkScreen').AwayText(3725)"), "past an hour").toBe("Away 1:02:05");
  addon.fire("PLAYER_FLAGS_CHANGED", "party1");
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(afk().shown, "back: it goes").toBe(false);
});

it("the AFK screen: clicks, keys and fights put it away; what the client can't say is left out", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // Marks you away (or back) and says so.
  const away = (on) => { addon.eval(`__afk = ${on}`); addon.fire("PLAYER_FLAGS_CHANGED", "player"); return addon.eval("return ForeverUI_AfkScreen:IsShown()"); };
  expect(away(true), "away").toBe(true);
  addon.eval("ForeverUI_AfkScreen.__scripts.OnMouseDown(ForeverUI_AfkScreen)");
  expect([addon.eval("return ForeverUI_AfkScreen:IsShown()"), away(true)], "a click puts it away, and it stays away while you are").toEqual([false, false]);
  away(false);
  expect(away(true), "next time you're away it's back").toBe(true);
  addon.eval("ForeverUI_AfkScreen.__scripts.OnKeyDown(ForeverUI_AfkScreen, 'ENTER')");
  expect(addon.eval("return ForeverUI_AfkScreen:IsShown()"), "a key puts it away too").toBe(false);
  away(false);
  away(true);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect([addon.eval("return ForeverUI_AfkScreen:IsShown()"), away(true)], "a fight puts it away; it doesn't open in one").toEqual([false, false]);
  setCombat(addon, false);
  expect(addon.eval("return ForeverUI_AfkScreen:IsShown()"), "after the fight, still away: it's back").toBe(true);
  addon.eval("__level = 60 UnitClass = function() return { __secret = true }, { __secret = true } end GetSubZoneText = function() return 'TEST-ONLY Vale' end ns.GetModule('AfkScreen').Paint()");
  const capped = addon.eval("local f = ForeverUI_AfkScreen return { f.xp:IsShown(), f.who:GetText(), f.where:GetText(), f.name.__textColor }");
  expect(capped.slice(0, 3), "at the cap no XP bar; a hidden class is left out; no spot within the zone").toEqual([false, "Level 60", "TEST-ONLY Vale"]);
  expect(isTok(addon, capped[3], "accent"), "the name in the accent when the class is hidden").toBe(true);
  addon.eval("UnitIsAFK = function() return { __secret = true } end");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("return ForeverUI_AfkScreen:IsShown()"), "a hidden away flag counts as here").toBe(false);
  const bare = loggedIn("UnitName = nil UnitLevel = nil UnitClass = nil UnitXP = nil");
  bare.eval("ns.GetModule('AfkScreen').Paint()");
  expect(bare.eval("local f = ForeverUI_AfkScreen return { f.name:GetText(), f.who:GetText(), f.xp:IsShown() }"), "a client that can't say much gets a blank card, no errors").toEqual(["", "", false]);
});
