// more: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { AFK_ENV, CLICK_LUA, FAKE_FADES, expectErrors, HEALING_ENV, MICRO_ENV, PLATE_ENV, QUEST_ENV, RAID_ENV, STRIPS_ENV, STRIP_ENV, TIDY_ENV, TOOLS_ENV, UI_ENV, UNITS_ENV, bars, block, borderOf, button, calls, chatHas, gridLines, isTok, key, later, loggedIn, marks, pinned, plate, putAway, px, raidButton, setCombat, strips, WINDOWS_ENV, windowState } from "./helpers.mjs";

it("minimap", () => {
  const addon = loggedIn(UI_ENV);
  const mm = addon.eval(`return { parent = Minimap:GetParent():GetName(), mask = Minimap.__maskTexture,
    size = Minimap.__width, zone = ns.GetModule("Minimap").zone:GetText(), zoneColor = ns.GetModule("Minimap").zone.__textColor,
    border = MinimapCluster.BorderTop.__alpha, zoomIn = Minimap.ZoomIn.__alpha, shape = GetMinimapShape() }`);
  expect(mm.parent === "Vanguard_Minimap" && mm.size === 180, "the minimap moves into the themed holder at 180 px").toBeTruthy();
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
  const M = "ns.GetModule('Minimap')";
  const bands = addon.eval(`local M = ${M} return { #M.bands, M.top.__color, M.top.__height, M.bottom.__height, M.bottom:IsShown(),
    M.zone.__noWrap, M.zone.__width, M.zone.__points.CENTER.rel == M.top, M.coords.__points.CENTER.rel == M.bottom }`);
  expect([bands[0], isTok(addon, bands[1], "panel"), bands[1][3], bands.slice(2)], "a see-through panel-colored band along the top and bottom edges, the zone name and coordinates centered on them; the name is clamped and doesn't wrap").toEqual([2, true, 0.7, [20, 24, true, true, 124, true, true]]);
  addon.eval("ns.Theme.Settings().panel = { 0.1, 0.2, 0.3, 1 } ns.Theme.Refresh()");
  expect(addon.eval(`return ${M}.top.__color`), "the bands follow the panel color live").toEqual([0.1, 0.2, 0.3, 0.7]);
  addon.eval("__maps = 0 ToggleWorldMap = function() __maps = __maps + 1 end local b = Vanguard_MinimapZone b.__scripts.OnClick(b) b.__scripts.OnEnter(b)");
  const tip = addon.eval("return { __maps, GameTooltip:IsShown(), GameTooltip.__lines, Vanguard_MinimapZone.__points.TOPLEFT.x, Vanguard_MinimapZone.__height }");
  expect([tip[0], tip[1], tip[2].map((l) => l.text), isTok(addon, [tip[2][2].r, tip[2][2].g, tip[2][2].b], "zoneContested"), tip[3], tip[4]],
    "clicking the zone name opens the world map; hovering it names the zone, its subzone and whose territory it is (in the zone color); the button leaves the top corners to the game's buttons")
    .toEqual([1, true, ["Elwynn Forest", "Goldshire", "Contested territory"], true, 28, 20]);
  addon.eval("local b = Vanguard_MinimapZone b.__scripts.OnLeave(b) b.__scripts.OnMouseWheel(b, -1)");
  expect(addon.eval("return { GameTooltip:IsShown(), Minimap:GetZoom() }"), "the tooltip goes when the mouse leaves, and the wheel over the name still zooms").toEqual([false, 4]);
  const bare = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Minimap = { coords = false } } }" });
  expect(bare.eval(`return ${M}.bottom:IsShown()`), "coordinates off: no bottom band").toBe(false);
});

it("a minimap that has the game's own wheel handler keeps it, and Vanguard adds none", () => {
  const addon = loggedIn("Minimap:SetScript('OnMouseWheel', function(self, d) self.__gameWheel = (self.__gameWheel or 0) + d end)");
  addon.eval("Minimap:GetScript('OnMouseWheel')(Minimap, 1)");
  expect(addon.eval("return { Minimap.__gameWheel, Minimap:GetZoom(), Minimap:IsMouseWheelEnabled() }"), "the game's handler runs once and Vanguard's doesn't zoom as well").toEqual([1, 0, true]);
});

it("chat", () => {
  const addon = loggedIn(UI_ENV);
  const c = addon.eval(`return { font = { ChatFrame1:GetFont() }, box = ns.Theme.PaintedCount(),
    tab1 = ChatFrame1Tab.Text.__textColor, tab2 = ChatFrame2Tab.Text.__textColor }`);
  expect(c.font[0] === "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-Medium.ttf" && c.font[1] === 12, `chat windows get the theme font at Medium, 12 (got ${JSON.stringify(c.font)})`).toBeTruthy();
  expect(isTok(addon, c.tab2, "accentText") && isTok(addon, c.tab1, "text2"), "the selected window's tab is in the accent's text colour, others gray").toBeTruthy();
  addon.slash("accent ember");
  expect(isTok(addon, addon.eval("return ChatFrame2Tab.Text.__textColor"), "accentText"), "tabs follow accent changes").toBeTruthy();
});

// TEST-ONLY chat window art as the game names it (ChatFrame<i><part>), with the game's own mouseover fade.
const CHAT_ART_ENV = `
  CHAT_FRAME_TEXTURES = { "Background", "ButtonFrameBackground" }
  for i = 1, 2 do
    for _, part in ipairs(CHAT_FRAME_TEXTURES) do _G["ChatFrame" .. i .. part] = _G["ChatFrame" .. i]:CreateTexture() end
  end
  function __fadeIn(frame)
    for _, part in ipairs(CHAT_FRAME_TEXTURES) do
      local art = _G[frame:GetName() .. part]
      if art:IsShown() then art:SetAlpha(1) end
    end
  end
`;

it("minimap: the game's emptied cluster takes no mouse and its zone button is hidden", () => {
  const addon = loggedIn(UI_ENV + `MinimapCluster:EnableMouse(true)
    MinimapCluster.ZoneTextButton = CreateFrame("Button", nil, MinimapCluster)`);
  expect(addon.eval("return { MinimapCluster.__mouse, MinimapCluster.ZoneTextButton:IsShown() }"), "no mouse on the cluster, the zone button hidden (not just faded)").toEqual([false, false]);
  expect(addon.eval("return { MinimapCluster.BorderTop.__alpha, Vanguard_Minimap:IsShown() }"), "the border art is still faded, the map still shows").toEqual([0, true]);
  expect(loggedIn(UI_ENV + "MinimapCluster = nil").eval("return Vanguard_Minimap ~= nil"), "a client without the cluster still gets the map").toBe(true);
});

it("chat art is hidden so the game's mouseover fade cannot bring it back", () => {
  const addon = loggedIn(UI_ENV + CHAT_ART_ENV);
  // Whether each window's art is showing.
  const art = () => addon.eval(`return { ChatFrame1Background:IsShown(), ChatFrame1ButtonFrameBackground:IsShown(), ChatFrame2Background:IsShown(), ChatFrame2ButtonFrameBackground:IsShown() }`);
  expect(art(), "every window's art is hidden").toEqual([false, false, false, false]);
  addon.eval("ChatFrame1Background:SetAlpha(0) __fadeIn(ChatFrame1)");
  expect(addon.eval("return ChatFrame1Background:GetAlpha()"), "the game's fade skips hidden art, so it stays at 0").toBe(0);
  expect(addon.eval("ChatFrame2Background = nil return ns.GetModule('Chat').SkinAll()"), "a window whose art is missing is skipped").toBe(null);
});

it("chat is a mover: placed once, sized once, kept where the player put it", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV);
  // Chat's anchor point, offsets and size.
  const spot = () => addon.eval("local p = ChatFrame1.__points local k, v = next(p) return { k, v.x, v.y, ChatFrame1:GetWidth(), ChatFrame1:GetHeight() }");
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key .. '=' .. m.label end return out").includes("chat=Chat"), "chat is in the unlock list").toBe(true);
  expect(spot(), "first login: bottom-left, 420 x 140").toEqual(["BOTTOMLEFT", 16, 20, 420, 140]);
  addon.eval('ns.SetMoverPoint("chat", "TOPLEFT", "TOPLEFT", 100, -50)');
  expect(spot().slice(0, 3), "dragging it in /vg unlock moves the window").toEqual(["TOPLEFT", 100, -50]);
  addon.eval('ChatFrame1:ClearAllPoints() ChatFrame1:SetPoint("CENTER")');
  expect(spot().slice(0, 3), "and the game's own layout moving it is undone").toEqual(["TOPLEFT", 100, -50]);
  addon.eval("ChatFrame1:SetSize(600, 300)");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(spot().slice(3), "entering the world again keeps the player's size").toEqual([600, 300]);
  expect(addon.eval("return VanguardDB.profiles.Default.Chat.sized"), "the size is only set once ever").toBe(true);
  expect(addon.eval('return ns.ResetMovers("chat")'), "/vg reset chat puts it back").toBe(1);
  expect(spot().slice(0, 3), "at the bottom-left").toEqual(["BOTTOMLEFT", 16, 20]);
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
  const off = loggedIn(UI_ENV + GEAR_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { bank = false } } }" });
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
  expect([painted(addon), addon.eval("return ns.FrameState('vgSkinned')[__new]"), borderOf(addon, "__new") !== undefined], "a slot the game adds is skinned when it fills the slots, the old one is left alone").toEqual([[1, 0, 0], true, true]);
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
  const slot = (name) => addon.eval(`local l = ns.FrameState('vgDurability')[Character${name}Slot] return l and { l:IsShown(), l:GetText(), l.__textColor } or false`);
  expect(slot("Head"), "nothing painted while the pane is shut").toBe(false);
  addon.eval("CharacterFrame:Show()");
  const legs = slot("Legs");
  expect([slot("Head").slice(0, 2), legs[1], isTok(addon, legs[2], "bad"), slot("Neck")[0]], "worn gear shows its durability, red when nearly broken; no durability, no label").toEqual([[true, "30%"], "9%", true, false]);
  addon.eval("__dur[1] = { 100, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(slot("Head")[0], "repaired, the label goes").toBe(false);
  addon.eval("MailFrame:Show()");
  expect(borderOf(addon, "OpenAllMail") !== undefined, "the mail's Open All button is themed").toBe(true);
  const off = loggedIn(UNITS_ENV + UI_ENV + STRIP_ENV + GEAR_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { durability = false } } }" });
  off.eval("CharacterFrame:Show()");
  expect(off.eval("return ns.FrameState('vgDurability')[CharacterHeadSlot] == nil"), "switched off, no labels").toBe(true);
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
  expect(linked[1].includes("|Haddon:Vanguard:url:https://example.test/a?b=1|h[https://example.test/a?b=1]|h") && linked[1].includes("|h[www.example.test]|h"), "both addresses become links").toBe(true);
  expect(addon.eval('return { select("#", __filters.CHAT_MSG_GUILD(nil, "CHAT_MSG_GUILD", "no address here")), select("#", __filters.CHAT_MSG_GUILD(nil, "x", { __secret = true })) }'), "nothing to link, or hidden text: the message is left as it is").toEqual([1, 1]);
  addon.eval('__linkCallback(nil, "addon:Vanguard:url:https://example.test/a") __linkCallback(nil, "addon:OtherAddon:thing")');
  expect(addon.eval("return __shown"), "clicking one opens it ready to copy; other addons' links are left to them").toEqual(["Copy the address (Ctrl+C)", "https://example.test/a"]);
  addon.eval('__lines = { "|cffff8000[TEST-ONLY General]|r hi |Hitem:90001|h[TEST-ONLY Sword]|h", { __secret = true }, "two |TTEST-ONLY-ICON:0|tlines" }');
  addon.eval("local b = ns.GetModule('ChatExtras').copyButton b.__scripts.OnClick(b)");
  expect(addon.eval("return __shown"), "the Copy button gives plain text; hidden lines are left out").toEqual(["Copy chat (Ctrl+C)", "[TEST-ONLY General] hi [TEST-ONLY Sword]\ntwo lines"]);
  const real = loggedIn(UI_ENV + CHAT_EXTRAS_ENV);
  real.eval('__lines = { "TEST-ONLY hello" } local b = ns.GetModule("ChatExtras").copyButton b.__scripts.OnClick(b)');
  expect(real.eval("return { Vanguard_TextDialog:IsShown(), Vanguard_TextEdit:GetText(), Vanguard_TextEdit:GetFont() ~= nil }"),
    "the real copy box opens with the text, its edit box given a font first (the game's SetText errors without one)").toEqual([true, "TEST-ONLY hello", true]);
  const bare = loggedIn("ChatFrame1 = nil");
  bare.slash("copy");
  expect(chatHas(bare, /can't read the chat back/) && bare.eval("return ns.GetModule('ChatExtras').copyButton == nil"), "a client that can't read chat back says so").toBe(true);
  const off = loggedIn(UI_ENV + CHAT_EXTRAS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { ChatExtras = { links = false } } }" });
  expect(off.eval("return next(__filters) == nil"), "links switched off: no filters").toBe(true);
});

// TEST-ONLY chat windows as the game has them: TransformMessages rewrites the
// lines a window holds, the wheel can jump, temporary windows join CHAT_FRAMES.
const CHAT_LINES_ENV = `
  CHAT_FRAMES = { "ChatFrame1", "ChatFrame2" }
  for i = 1, 2 do
    local f = _G["ChatFrame" .. i]
    f.TransformMessages = function(self, pred, transform)
      for n, m in ipairs(self.__messages or {}) do if pred(m) then self.__messages[n] = transform(m, 1, 1, 1) end end
    end
    f.ScrollToTop = function() __scrolled = "top" end
    f.ScrollToBottom = function() __scrolled = "bottom" end
  end
  local open = FCF_OpenTemporaryWindow
  FCF_OpenTemporaryWindow = function(name) local f = open(name) CHAT_FRAMES[#CHAT_FRAMES + 1] = f:GetName() return f end
`;
// The last line chat window i holds.
const lastLine = (addon, i = 1) => addon.eval(`local m = ChatFrame${i}.__messages return m[#m]`);

it("chat: short channel names, live, never reading hidden lines", () => {
  const addon = loggedIn(UI_ENV + CHAT_LINES_ENV);
  const trade = "|Hchannel:channel:2|h[2. Trade - City]|h [TEST-ONLY Name]: wts";
  addon.eval(`ChatFrame1:AddMessage("${trade}")`);
  expect(lastLine(addon), "off by default: the game's channel names").toBe(trade);
  addon.eval("ns.GetModule('ChatExtras').settings.shortChannels = true");
  addon.eval(`ChatFrame1:AddMessage({ __secret = true }) ChatFrame1:AddMessage("${trade}")`);
  expect([lastLine(addon), addon.eval("return issecretvalue(ChatFrame1.__messages[#ChatFrame1.__messages - 1])")], "switched on: [2. Trade - City] becomes [T], the link kept; a hidden line stays as it was")
    .toEqual(["|Hchannel:channel:2|h[T]|h [TEST-ONLY Name]: wts", true]);
  // A line with one channel tag, as the shortener leaves it.
  const short = (label) => addon.eval(`return ns.GetModule('ChatExtras').ShortChannels("|Hchannel:X|h[${label}]|h hi")`);
  expect(["Guild", "Raid Leader", "5. LookingForGroup", "1. General - TEST-ONLY Vale", "6. testonly"].map(short), "the capitals of the name, or its first letter")
    .toEqual(["|Hchannel:X|h[G]|h hi", "|Hchannel:X|h[RL]|h hi", "|Hchannel:X|h[LFG]|h hi", "|Hchannel:X|h[G]|h hi", "|Hchannel:X|h[t]|h hi"]);
  expect(addon.eval('ChatFrame2:AddMessage("plain TEST-ONLY line") local m = ChatFrame2.__messages return m[#m]'), "a line without a channel tag is left alone").toBe("plain TEST-ONLY line");
  addon.eval('FCF_OpenTemporaryWindow("TestOnly")');
  expect(addon.eval("return ns.FrameState('vgWatched')[ChatFrameTempTestOnly]"), "a whisper window that opens later is followed too").toBe(true);
});

it("chat: Ctrl + mouse wheel jumps to the top or bottom", () => {
  const addon = loggedIn(UI_ENV + CHAT_LINES_ENV);
  // The wheel over the main chat window, then where it jumped (or "none").
  const wheel = (delta) => { addon.eval("__scrolled = nil"); addon.wheel("ChatFrame1", delta); return addon.eval('return __scrolled or "none"'); };
  expect(wheel(1), "without Ctrl the wheel is the game's").toBe("none");
  addon.keys({ ctrl: true });
  expect([wheel(1), wheel(-1)], "with Ctrl: up to the top, down to the bottom").toEqual(["top", "bottom"]);
  addon.eval("ns.GetModule('ChatExtras').settings.ctrlScroll = false");
  expect(wheel(1), "switched off, nothing jumps").toBe("none");
});

it("chat: the game's timestamps and class-colored names, from /vg", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA + `C_CVar = nil
    TIMESTAMP_FORMAT_HHMM_24HR, TIMESTAMP_FORMAT_HHMM_AMPM = "%H:%M ", "%I:%M %p "
    TimeUtil = { BetterDate = function(format) return "TEST-ONLY " .. format end }
    time = function() return 1292426852 end`);
  expect(addon.eval("return ns.GetModule('ChatExtras').TimestampChoices()"), "off, then each format this client has, shown as the game shows it")
    .toEqual([["none", "Off"], ["%H:%M ", "TEST-ONLY %H:%M "], ["%I:%M %p ", "TEST-ONLY %I:%M %p "]]);
  addon.eval('ns.Options.Show("more")');
  addon.eval('__click("Chat timestamps")');
  expect(addon.eval('return GetCVar("showTimestamps")'), "the row sets the game's own timestamp setting").toBe("%H:%M ");
  addon.eval('__click("Class-colored names")');
  expect(addon.eval('return GetCVar("chatClassColorOverride")'), "the game's class-color setting: from per chat type to always").toBe("0");
  addon.eval('__click("Class-colored names")');
  expect(addon.eval('return GetCVar("chatClassColorOverride")'), "then never").toBe("1");
  const bare = loggedIn('TimeUtil = nil TIMESTAMP_FORMAT_HHMM = "%I:%M " C_CVar = nil GetCVar = nil SetCVar = nil');
  expect(bare.eval(`local CX = ns.GetModule("ChatExtras") local get, set = CX.CVarSetting("showTimestamps", function(v) return v or "none" end)
    set("%I:%M ") return { get(), CX.TimestampChoices()[2][2] }`), "a client without CVars or the game's formatter: nothing breaks, the format shows as it is").toEqual(["none", "%I:%M "]);
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
  expect([addon.eval("return { Vanguard_MinimapDrawerToggle:IsShown(), Vanguard_MinimapDrawer:IsShown() }"), spot("LibDBIcon10_TestOnlyOne")], "gathered into the shut drawer, the toggle showing").toEqual([[true, false], ["Vanguard_MinimapDrawer", 4, -4]]);
  expect(addon.eval("return TestOnlyOtherButton:GetParent():GetName()"), "other minimap children are left alone").toBe("Minimap");
  addon.eval("local t = Vanguard_MinimapDrawerToggle t.__scripts.OnClick(t)");
  expect(addon.eval("return Vanguard_MinimapDrawer:IsShown()"), "the toggle opens it").toBe(true);
  addon.eval('CreateFrame("Button", "LibDBIcon10_TestOnlyTwo", Minimap)');
  addon.fire("PLAYER_ENTERING_WORLD");
  expect([spot("LibDBIcon10_TestOnlyTwo"), addon.eval("return Vanguard_MinimapDrawer:GetWidth()")], "a late button joins the next cell; the drawer fits").toEqual([["Vanguard_MinimapDrawer", 32, -4], 62]);
  addon.eval('LibDBIcon10_TestOnlyOne:ClearAllPoints() LibDBIcon10_TestOnlyOne:SetPoint("CENTER", Minimap, "CENTER")');
  expect(spot("LibDBIcon10_TestOnlyOne"), "when its addon moves it back, it returns to its cell").toEqual(["Vanguard_MinimapDrawer", 4, -4]);
  const off = loggedIn(UI_ENV + DRAWER_ENV, { savedVariables: "VanguardDB.profiles = { Default = { MinimapButtons = { drawer = false } } }" });
  expect(off.eval("return { LibDBIcon10_TestOnlyOne:GetParent():GetName(), Vanguard_MinimapDrawer == nil }"), "switched off, they stay on the map").toEqual(["Minimap", true]);
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
  const on = loggedIn(PROMPT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { AutoAccept = { summons = true, resurrect = true, duels = true } } }" });
  fire(on);
  expect(on.eval("return __answers"), "each answered, its prompt closed (all three resurrection prompts, whichever the game showed)").toEqual(["summon", "close CONFIRM_SUMMON", "resurrect", "close RESURRECT", "close RESURRECT_NO_SICKNESS", "close RESURRECT_NO_TIMER", "decline", "close DUEL_REQUESTED"]);
  expect(chatHas(on, /summon from <name> to TEST-ONLY Vale/) && chatHas(on, /resurrection from <name>/) && chatHas(on, /duel from someone/), "and said in chat (a hidden name reads as someone)").toBe(true);
  on.eval("__answers = {}");
  setCombat(on, true);
  on.fire("CONFIRM_SUMMON");
  expect(on.eval("return #__answers"), "no summons in combat").toBe(0);
});

// TEST-ONLY loot window: three slots, the second locked (being rolled for); every slot taken is recorded.
const LOOT_ENV = `
  __looted = {}
  GetNumLootItems = function() return 3 end
  GetLootSlotInfo = function(slot) return "TEST-ONLY icon", "TEST-ONLY item", 1, nil, 2, slot == 2 end
  LootSlot = function(slot) __looted[#__looted + 1] = slot end
`;

it("faster auto-loot: every unlocked slot at once while the game auto-loots, off until switched on", () => {
  const off = loggedIn(LOOT_ENV);
  off.fire("LOOT_READY", true);
  expect(off.eval("return #__looted"), "off by default: the game loots as usual").toBe(0);
  const on = loggedIn(LOOT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { AutoAccept = { loot = true } } }" });
  on.fire("LOOT_READY", false);
  expect(on.eval("return #__looted"), "not auto-looting (the window opens to pick): nothing taken").toBe(0);
  on.fire("LOOT_READY", true);
  expect(on.eval("return __looted"), "auto-looting: the last slot first, the locked one left").toEqual([3, 1]);
  const bare = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { AutoAccept = { loot = true } } }" });
  bare.fire("LOOT_READY", true);
  expect(bare.eval("return GetNumLootItems == nil"), "a client without the loot functions is left alone").toBe(true);
});

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
    return { child:GetBottom() > f:GetBottom(), f:GetHeight() == ns.Theme.PixelRound(f, 560, true) }`);
  expect(page, "the Situations page ends above the window's foot; the opaque fill covers the window (560 tall, pixel-rounded) to its edges").toEqual([true, true]);
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
  expect(borderOf(addon, "FriendsFrame") !== undefined, "friends in the Vanguard look").toBe(true);
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
    return { f.blackBg:IsShown(), f.Icon.__texCoord ~= nil, f.AbilityName.__font ~= nil, f.TimeLeft.NumberText.__font ~= nil, f.__points.CENTER.rel == Vanguard_LossOfControlFrameSpot }`);
  expect(loc, "loss of control: its black band hidden, icon cropped, theme text, centered on its spot").toEqual([false, true, true, true, true]);
  expect(addon.eval("return { ns.MoverPoint('lossofcontrol') }"), "a little above your character").toEqual(["CENTER", "CENTER", 0, 140]);
  const head = addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.MainFrame.Name.__font ~= nil, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }");
  expect([head, addon.eval("return (ns.MoverPoint('talkinghead'))")], "the talking head: parchment faded, theme text, at the top center").toEqual([[0, true, true], "TOP"]);
  const hide = loggedIn(ALERTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { talkingHead = 'hide', lossOfControl = false } } }" });
  hide.eval("TalkingHeadFrame:Show()");
  expect(hide.eval("return { TalkingHeadFrame:IsShown(), Vanguard_TalkingHeadFrameSpot == nil, LossOfControlFrame.blackBg.__alpha == nil }"), "hidden, if you'd rather; loss of control off stays the game's").toEqual([false, true, true]);
  const game = loggedIn(ALERTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { talkingHead = 'game' } } }" });
  expect(game.eval("return { TalkingHeadFrame:IsShown(), Vanguard_TalkingHeadFrameSpot == nil }"), "or left to the game").toEqual([true, true]);
  const partial = loggedIn("LossOfControlFrame = CreateFrame('Frame', 'LossOfControlFrame', UIParent) TalkingHeadFrame = CreateFrame('Frame', 'TalkingHeadFrame', UIParent)");
  expect(partial.eval("return Vanguard_LossOfControlFrameSpot ~= nil and Vanguard_TalkingHeadFrameSpot ~= nil"), "frames without their usual parts are still placed").toBe(true);
  expect(loggedIn("").eval("return Vanguard_LossOfControlFrameSpot == nil"), "a client without them loads cleanly").toBe(true);
});

it("game alerts: the loss of control band stays hidden when the game's animation resets its alpha", () => {
  const addon = loggedIn(ALERTS_ENV + "LossOfControlFrame.RedLineTop = LossOfControlFrame:CreateTexture() LossOfControlFrame.RedLineBottom = LossOfControlFrame:CreateTexture()");
  expect(addon.eval("local f = LossOfControlFrame return { f.blackBg:IsShown(), f.RedLineTop:IsShown(), f.RedLineBottom:IsShown() }"), "the band and both red lines are hidden").toEqual([false, false, false]);
  addon.eval("local f = LossOfControlFrame f.blackBg:SetAlpha(0.6) f.RedLineTop:SetAlpha(1) f.RedLineBottom:SetAlpha(1)");
  expect(addon.eval("local f = LossOfControlFrame return { f.blackBg:IsShown(), f.RedLineTop:IsShown(), f.RedLineBottom:IsShown() }"), "restoring their alpha shows nothing").toEqual([false, false, false]);
});

it("game alerts: a talking head that loads later is restyled once when its part of the game loads", () => {
  const addon = loggedIn(ALERTS_ENV.replace(/TalkingHeadFrame/g, "TEST_ONLY_Unloaded"));
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == nil"), "nil at login: nothing placed yet").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_Something");
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == nil"), "another part loading changes nothing").toBe(true);
  addon.eval(`TalkingHeadFrame = CreateFrame("Frame", "TalkingHeadFrame", UIParent) TalkingHeadFrame.BackgroundFrame = CreateFrame("Frame", nil, TalkingHeadFrame)`);
  addon.fire("ADDON_LOADED", "Blizzard_TalkingHeadUI");
  expect(addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }"), "loaded: parchment faded, on its spot").toEqual([0, true]);
  addon.eval("__spot = Vanguard_TalkingHeadFrameSpot");
  addon.fire("ADDON_LOADED", "Blizzard_TalkingHeadUI");
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == __spot"), "a second load event makes no second spot").toBe(true);
});

// TEST-ONLY raid warning frame: one message line the game reuses (as its pool does), numbered as messages come.
const WARNING_ENV = `
  GameFontNormalHuge = "GameFontNormalHuge"
  RaidWarningFrame = CreateFrame("Frame", "RaidWarningFrame", UIParent)
  RaidWarningFrame.line, RaidWarningFrame.counter = RaidWarningFrame:CreateFontString(nil, nil, "GameFontNormalHuge"), 0
  function RaidWarningFrame:AddMessage(text) self.counter = self.counter + 1 self.line:SetText(text) self.line:SetTextColor(1, 0.2, 0.2) self.line.messageOrder = self.counter end
  function RaidWarningFrame:GetSortedMessages() return { self:CreateFontString(nil, nil, "GameFontNormalHuge"), self.line } end
  RaidWarningFrame:RegisterEvent("HARDCORE_DEATHS") RaidWarningFrame:RegisterEvent("CHAT_MSG_RAID_WARNING")
  RaidWarningFrame:SetScript("OnEvent", function(self, event, text) self:AddMessage(text) end)
`;

it("game alerts: Hardcore death notices take the theme font and red; a reused line gets the game's font back", () => {
  const addon = loggedIn(WARNING_ENV);
  // The message line: its font face, color, the game font object it was given, and the death mark.
  const line = () => addon.eval("local l = RaidWarningFrame.line return { font = l.__font and l.__font[1], color = l.__textColor, template = l.__template or false, death = ns.FrameState('vgDeath')[l] or false }");
  addon.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  const death = line();
  expect([death.font, isTok(addon, death.color, "bad"), death.death], "a death notice: the theme's title font, the theme's red").toEqual([addon.eval('local f = UIParent:CreateFontString() ns.Theme.ApplyRole(f, "title") return f.__font[1]'), true, true]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Pull in 5");
  expect([line().template, line().death], "the next raid warning on that line: the game's font again").toEqual(["GameFontNormalHuge", false]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Again");
  expect(line().template, "a line that was never a death notice is left as it is").toBe("GameFontNormalHuge");
  const off = loggedIn(WARNING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { hardcore = false } } }" });
  off.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  expect(off.eval("return RaidWarningFrame.line.__font == nil"), "switched off: the game's own look").toBe(true);
  expect(loggedIn("RaidWarningFrame = CreateFrame('Frame', 'RaidWarningFrame', UIParent)").eval("return ns.GetModule('GameAlerts').settings.hardcore"), "a frame without the game's message list is left alone").toBe(true);
});

// TEST-ONLY minimap marks: a rare, a treasure, a dead rare, a rare with a hidden name, a rare elite.
const VIGNETTE_ENV = `
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  __vignettes = {
    rare = { name = "TEST-ONLY Rare", atlasName = "VignetteKill", isDead = false }, chest = { name = "TEST-ONLY Chest", atlasName = "VignetteLoot" },
    dead = { name = "TEST-ONLY Dead", atlasName = "VignetteKill", isDead = true }, hidden = { name = { __secret = true }, atlasName = "VignetteKill" },
    elite = { name = "TEST-ONLY Elite", atlasName = "VignetteKillElite" },
  }
  C_VignetteInfo = { GetVignetteInfo = function(guid) return __vignettes[guid] end }
`;

it("game alerts: a rare nearby is announced with a sound and a chat line, out of combat, once (off until switched on)", () => {
  const addon = loggedIn(VIGNETTE_ENV + CLICK_LUA);
  // Rare lines in chat so far.
  const rares = () => addon.chat().filter((l) => /Rare nearby/.test(l));
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  expect(rares(), "off until you switch it on").toEqual([]);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("A rare nearby")'), "the switch is under Bars, map, chat").toBe(true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  expect([rares().length, /Rare nearby: TEST-ONLY Rare$/.test(rares()[0]), addon.eval("return __wfgWorld.sounds[#__wfgWorld.sounds]")], "one line and the raid warning sound, once per rare").toEqual([1, true, "RAID_WARNING"]);
  for (const guid of ["chest", "dead", "hidden", "nothing"]) addon.fire("VIGNETTE_MINIMAP_UPDATED", guid, true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", false);
  addon.eval('__wfgStub.fire("VIGNETTE_MINIMAP_UPDATED", { __secret = true }, true)');
  expect(rares().length, "a treasure, a dead rare, a hidden name, an unknown mark, one leaving the map, a hidden mark: nothing").toBe(1);
  setCombat(addon, true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", true);
  expect(rares().length, "not in a fight").toBe(1);
  setCombat(addon, false);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", true);
  expect(rares().length, "a rare elite after the fight").toBe(2);
});

// TEST-ONLY damage meter: someone else's line, then yours at 1234.5 per second.
const DPS_ENV = `
  __dps = { combatSources = { { isLocalPlayer = false, amountPerSecond = 999 }, { isLocalPlayer = true, amountPerSecond = 1234.5 } } }
  Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 }
  C_DamageMeter = { GetCombatSessionFromType = function(kind, what) __asked = { kind, what } return __dps end }
`;

it("the info strip: your DPS in the last fight, from the game's damage meter", () => {
  const addon = loggedIn(UNITS_ENV + DPS_ENV + CLICK_LUA);
  const before = addon.eval("return Vanguard_InfoStrip:GetHeight()");
  expect(block(addon, "dps").shown, "off until you turn it on").toBe(false);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Your DPS in the last fight (from the game's damage meter)")`);
  expect([block(addon, "dps").text, addon.eval("return __asked"), addon.eval("return Vanguard_InfoStrip:GetHeight()")], "your line's figure, the current fight's DPS, on a fifth row").toEqual(["1.2K dps", [1, 1], 84]);
  setCombat(addon, true);
  addon.eval("__dps.combatSources[2].amountPerSecond = 2500");
  addon.fire("DAMAGE_METER_RESET");
  expect(addon.eval("return ns.GetModule('InfoStrip').DPS()"), "in a fight it isn't read (the client hides it)").toBe(null);
  setCombat(addon, false);
  expect(block(addon, "dps").text, "when the fight ends it shows that fight's").toBe("2.5K dps");
  // Runs lua, ends a fight, and says whether the DPS block shows.
  const hidden = (lua) => { addon.eval(lua); addon.fire("PLAYER_REGEN_ENABLED"); return block(addon, "dps").shown; };
  expect([hidden("__dps.combatSources[2].amountPerSecond = { __secret = true }"), hidden("__dps = { __secret = true }"), hidden("__dps = {}"), hidden("__dps = nil")], "hidden figures, a hidden fight, no fight: nothing shows").toEqual([false, false, false, false]);
  expect(addon.eval("return Vanguard_InfoStrip:GetHeight()"), "and the fourth row goes").toBe(before);
  addon.eval("Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 } __dps = { combatSources = { { isLocalPlayer = true, amountPerSecond = 0 } } }");
  expect(hidden(""), "no damage done: nothing shows").toBe(false);
  addon.eval("__asked = nil Enum.DamageMeterSessionType = nil Enum.DamageMeterType = nil");
  expect([addon.eval("return ns.GetModule('InfoStrip').DPS()"), addon.eval("return __asked")], "without the client's enums the meter is not asked with guessed numbers").toEqual([null, null]);
  const bare = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { InfoStrip = { dps = true } } }" });
  bare.fire("PLAYER_REGEN_ENABLED");
  expect(block(bare, "dps").shown, "a client without the damage meter shows nothing").toBe(false);
});

it("the info strip: your place in the last fight's DPS, in a group", () => {
  const addon = loggedIn(UNITS_ENV + DPS_ENV + CLICK_LUA);
  expect(block(addon, "rank").shown, "off until you turn it on").toBe(false);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Your place in the last fight's DPS")`);
  expect([block(addon, "rank").text, isTok(addon, block(addon, "rank").color, "text2"), addon.eval("return Vanguard_InfoStrip:GetHeight()")], "second of two, on the fifth row").toEqual(["#2 of 2", true, 84]);
  addon.eval("__dps.combatSources = { __dps.combatSources[2], __dps.combatSources[1], { isLocalPlayer = false } }");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect([block(addon, "rank").text, isTok(addon, block(addon, "rank").color, "gold")], "at the top of three, in gold").toEqual(["#1 of 3", true]);
  // Ends a fight after lua and says whether the place shows.
  const shown = (lua) => { addon.eval(lua); addon.fire("DAMAGE_METER_RESET"); return block(addon, "rank").shown; };
  expect([shown("__dps.combatSources = { __dps.combatSources[1] }"), shown("__dps.combatSources = { { isLocalPlayer = false }, { isLocalPlayer = false } }"), shown("__dps = { __secret = true }")],
    "alone, not in the list, or a hidden fight: nothing shows").toEqual([false, false, false]);
  const bare = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { InfoStrip = { rank = true } } }" });
  bare.eval("Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 } C_DamageMeter = { GetCombatSessionFromType = function() __asked = true return { combatSources = { { isLocalPlayer = true }, {} } } end }");
  bare.fire("PLAYER_REGEN_ENABLED");
  expect([block(bare, "rank").shown, bare.eval("return __asked == nil")], "a client whose meter had no enums at login is not asked").toEqual([false, true]);
});

it("the info strip's fight reads, shared with Fight history: your line and the fight's length", () => {
  const addon = loggedIn("Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 }");
  // Your line's DPS, its place and the list's length, and the fight's seconds (false for none).
  const read = () => addon.eval("local IS = ns.GetModule('InfoStrip') local line, place, count = IS.MyLine() return { line and line.amountPerSecond or false, place or false, count or false, IS.FightSeconds() or false }");
  expect(read(), "no fight yet: nothing").toEqual([false, false, false, false]);
  addon.eval("__wfgWorld.damageSession = { combatSources = { { isLocalPlayer = false, amountPerSecond = 500 }, { isLocalPlayer = true, amountPerSecond = 412 } }, durationSeconds = 83 }");
  expect(read(), "second of two at 412, in an 83 s fight").toEqual([412, 2, 2, 83]);
  addon.eval("__wfgWorld.damageSession.durationSeconds = nil __wfgWorld.damageSeconds = 61");
  expect(read()[3], "the meter's own figure when the session has none").toBe(61);
  addon.eval("__wfgWorld.damageSession.durationSeconds = __wfgWorld.secret(83) __wfgWorld.damageSeconds = __wfgWorld.secret(83)");
  expect(read()[3], "a hidden length is not read").toBe(false);
  addon.eval("__wfgWorld.damageSession.durationSeconds = nil C_DamageMeter.GetSessionDurationSeconds = nil");
  expect(read()[3], "a client without the meter's figure").toBe(false);
  setCombat(addon, true);
  expect(read(), "in a fight nothing is read").toEqual([false, false, false, false]);
});

// TEST-ONLY group extras: a raid tank (raid1) targeting the boar, and a party pet targeting nothing.
const GROUP_EXTRAS_ENV = `
  RegisterAttributeDriver = function(frame, attr, driver) frame.__drivers = frame.__drivers or {}; frame.__drivers[attr] = driver end
  __units.raid1 = { name = "TEST-ONLY Tank", hp = 300, maxhp = 1000, power = 0, maxpower = 0, ptype = "RAGE", player = true, class = "ROGUE" }
  __units.raid1target = __units.target
  __units.partypet1 = { name = "TEST-ONLY Wolf", hp = 50, maxhp = 100, power = 0, maxpower = 0, ptype = "FOCUS", reaction = 5 }
  function __mt(i, unit)
    local b = CreateFrame("Button", "Vanguard_MainTanksUnitButton" .. i, Vanguard_MainTanks, "SecureUnitButtonTemplate")
    Vanguard_MainTanks.initialConfigFunction(Vanguard_MainTanks, b:GetName())
    b:SetAttribute("unit", unit)
    return b
  end
`;

it("main tank frames: the raid's main tanks and assists, with what each is targeting", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV);
  const header = addon.eval(`local h = Vanguard_MainTanks
    return { h:GetAttribute("groupFilter"), h:GetAttribute("showRaid"), h:GetAttribute("template"), h.__drivers["state-visibility"], h:GetAttribute("initialConfigFunction") == ns.GetModule("MainTanks").INIT }`);
  expect(header, "a secure header of the raid's main tanks and assists, shown in a raid").toEqual(["MAINTANK,MAINASSIST", true, "SecureUnitButtonTemplate", "[group:raid] show; hide", true]);
  expect([addon.eval("return { ns.MoverPoint('maintanks') }"), addon.eval("return { Vanguard_MainTanksHolder:GetWidth(), Vanguard_MainTanksHolder:GetHeight() }")], "movable, at the top left beside the raid tools, room for four").toEqual([["TOPLEFT", "TOPLEFT", 400, -20], [236, 100]]);
  addon.eval('__mt(1, "raid1") __wfgStub.advance(0.5)');
  // The first tile: bar value and color, name, target line and its color.
  const tile = () => addon.eval("local b = Vanguard_MainTanksUnitButton1 return { b.bar.__value, b.bar.__barColor, b.name:GetText(), b.target:GetText(), b.target.__textColor }");
  const one = tile();
  expect([one[0], one[1].slice(0, 3), one[2], one[3], isTok(addon, one[4], "hostile")], "health in their class color, their name, and their target in its reaction color").toEqual([300, [1, 0.96, 0.41], "TEST-ONLY Tank", "TEST-ONLY Boar", true]);
  addon.eval("__units.raid1target = nil __wfgStub.advance(0.5)");
  expect(tile()[3], "no target, no line").toBe("");
  addon.eval('__units.raid1.name = "TEST-ONLY Renamed" Vanguard_MainTanksUnitButton1:SetAttribute("unit", "raid9") Vanguard_MainTanksUnitButton1:Hide() Vanguard_MainTanksUnitButton1:Show()');
  expect(tile()[2], "a unit that isn't there leaves the tile as it was").toBe("TEST-ONLY Tank");
  const off = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { MainTanks = false } } }" });
  expect(off.eval("return Vanguard_MainTanks == nil"), "switched off under Modules, nothing is built").toBe(true);
  expect(loggedIn(UNITS_ENV).eval("return Vanguard_MainTanks ~= nil"), "a client without attribute drivers still builds them").toBe(true);
});

it("main tank frames without secure snippets: the header copies the clicks; tiles are sized and set up out of combat", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + 'SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end');
  expect(addon.eval("local h = Vanguard_MainTanks return { h:GetAttribute('initialConfigFunction') == nil, h:GetAttribute('_initialAttributeNames') }"),
    "no init snippet; the header copies the clicks").toEqual([true, "*type1,*type2"]);
  addon.eval('local b = CreateFrame("Button", "Vanguard_MainTanksUnitButton1", Vanguard_MainTanks, "SecureUnitButtonTemplate") b:SetAttribute("unit", "raid1")');
  addon.fire("GROUP_ROSTER_UPDATE");
  const MT = addon.eval('local MT = ns.GetModule("MainTanks") return { MT.W, MT.H }');
  expect(addon.eval("local b = Vanguard_MainTanksUnitButton1 return { b:GetWidth(), b:GetHeight(), b:GetAttribute('*type1'), b.bar ~= nil }"),
    "the tile has its size, its click and the tile setup").toEqual([MT[0], MT[1], "target", true]);
});

it("party pets and targets: small tiles above the party, only in a party, when switched on", () => {
  expect(loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV).eval("return Vanguard_PartyExtras == nil"), "off until you turn it on").toBe(true);
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { PartyExtras = { show = true } } }" });
  const tiles = addon.eval(`local pet, target = Vanguard_partypet1, Vanguard_party4target
    return { #ns.GetModule("PartyExtras").tiles, pet:GetAttribute("unit"), pet.__watched, target:GetAttribute("unit"), target.__points.TOPLEFT.x, target.__points.TOPLEFT.y, Vanguard_PartyExtras.__drivers["state-visibility"] }`);
  expect(tiles, "a pet and a target tile per party member, each shown while its unit exists, the column only in a party").toEqual([8, "partypet1", true, "party4target", 94, -54, "[group:raid] hide; [group:party] show; hide"]);
  expect(addon.eval("return { ns.MoverPoint('partyextras') }"), "movable, just above the party").toEqual(["BOTTOM", "BOTTOM", -240, 606]);
  addon.eval("ns.GetModule('MainTanks').Paint(Vanguard_partypet1)");
  expect(addon.eval("return { Vanguard_partypet1.name:GetText(), Vanguard_partypet1.target == nil }"), "the pet's name on its tile, no target line").toEqual(["TEST-ONLY Wolf", true]);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Party pets and targets, above the party (reload)") and VanguardDB.profiles.Default.PartyExtras.show'), "the switch is under Unit frames").toBe(false);
});

it("/vg factionart: which of the game's own faction pictures the client has", () => {
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
    local c = Vanguard_AfkScreen.crest
    return { title.__font[1]:match("[^\\\\]+$"), label.__font[1]:match("[^\\\\]+$"), c:IsShown(), (c.__texture or ""):match("[^\\\\]+$") or "", c.__vertexColor }`);
  const ally = look();
  expect(ally.slice(0, 4), "Alliance: Cinzel headings (body text stays Fira Sans), the crossed swords").toEqual(["Cinzel-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", true, "lorc-crossed-swords"]);
  expect(isTok(addon, ally[4], "allianceCrest"), "in Alliance gold").toBe(true);
  expect(addon.eval("return { Vanguard_QuestDialog.crest.vgAlpha, Vanguard_QuestDialog.crest.__vertexColor[4] }"), "a faint watermark in the quest dialog").toEqual([0.1, 0.1]);
  addon.eval('__faction = "Horde"');
  addon.fire("NEUTRAL_FACTION_SELECT_RESULT");
  const horde = look();
  expect([horde[0], horde[3], isTok(addon, horde[4], "hordeCrest")], "Horde: Metamorphous and the crossed axes, in Horde red").toEqual(["Metamorphous-Regular.ttf", "lorc-crossed-axes", true]);
  addon.slash("");
  expect(addon.eval("return Vanguard_Options.crest:IsShown() and Vanguard_Options.crest.__points.LEFT.rel == Vanguard_Options.title"), "the crest beside the options window's title").toBe(true);
  addon.eval('__click("Faction look: crest and heading font")');
  const off = look();
  expect([off[0], off[2], addon.eval("return Vanguard_Options.title.__font[1]:find('Fira') ~= nil")], "Off: the usual heading font, no crests, at once").toEqual(["FiraSansCondensed-SemiBold.ttf", false, true]);
  addon.eval('__click("Faction look: crest and heading font") __faction = "Neutral" ns.Theme.Refresh()');
  expect(look().slice(0, 3), "a neutral character keeps the usual look").toEqual(["FiraSansCondensed-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", false]);
  addon.eval('__faction = "Alliance" ns.Theme.Settings().font = "client" ns.Theme.Refresh()');
  expect(addon.eval("return { ns.Theme.HeadingFont() == nil, Vanguard_AfkScreen.crest:IsShown() }"), "with the game's font chosen, headings follow it (the crest stays)").toEqual([true, true]);
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

it("the info strip: the day and date with a calendar button", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV + 'date = function(f) return f == "%A, %d %B" and "Tuesday, 13 October" or "21:04" end __opened = 0 ToggleCalendar = function() __opened = __opened + 1 end');
  const button = "Vanguard_InfoStripCalendar";
  expect([block(addon, "date").text, addon.eval(`return ${button}:IsShown()`)], "the day and date, with the button beside them").toEqual(["Tuesday, 13 October", true]);
  expect(addon.eval(`return { ${button}:GetWidth(), ns.FrameState("vgGlyph")[${button}].__texture:match("(%a+)$") }`), "the button is an 18-unit slot with the calendar icon").toEqual([18, "Calendar"]);
  addon.eval(`${button}.__scripts.OnClick(${button}) ${button}.__scripts.OnEnter(${button}) ${button}.__scripts.OnLeave(${button})`);
  expect(addon.eval("return __opened"), "a click opens the calendar").toBe(1);
  addon.eval("ToggleCalendar = nil");
  addon.eval(`${button}.__scripts.OnClick(${button})`);
  expect(addon.eval("return #ns.errors"), "a client without it does nothing, without an error").toBe(0);
  addon.eval('ns.Settings("InfoStrip").date = false ns.GetModule("InfoStrip").UpdateAll()');
  expect([block(addon, "date").shown, addon.eval(`return ${button}:IsShown()`)], "turned off, the date and its button go").toEqual([false, false]);
  addon.eval('ns.Settings("InfoStrip").date = true __wfgStub.advance(60)');
  expect(block(addon, "date").shown, "and come back on the next minute's tick").toBe(true);
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

it("the info strip: a warlock's soul shards, across the bags and the reagent bag", () => {
  const SHARDS = `__units.player.class = "WARLOCK" issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
    __wfgWorld.bags[1][3] = { itemID = 6265 } __wfgWorld.bags[2][1] = { itemID = 2589, count = 5 }
    __wfgWorld.bags[5], __wfgWorld.bagSizes[5] = { [2] = { itemID = 6265, count = 2 } }, 4
`;
  const addon = loggedIn(UNITS_ENV + SHARDS + CLICK_LUA);
  expect([block(addon, "shards").text, block(addon, "ammo").shown], "three shards (one in a bag, two in the reagent bag), where ammo would be").toEqual(["shards 3", false]);
  addon.eval("__wfgWorld.bags[1][3] = nil __wfgWorld.bags[5][2] = nil");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(block(addon, "shards").text === "shards 0" && isTok(addon, block(addon, "shards").color, "bad"), "none left is red").toBe(true);
  addon.eval("__wfgWorld.bags[1][3] = { itemID = { __secret = true } }");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(block(addon, "shards").text, "a hidden item doesn't count").toBe("shards 0");
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Soul shards (warlocks)")') && block(addon, "shards").shown, "a switch turns it off at once").toBe(false);
  expect(block(loggedIn(UNITS_ENV + SHARDS + "C_Container.GetContainerItemInfo = nil"), "shards").shown, "a client that can't list bag items shows nothing").toBe(false);
  expect(block(loggedIn(UNITS_ENV), "shards").shown, "a mage carries no shards").toBe(false);
  expect(block(loggedIn(UNITS_ENV + 'UnitClass = function() return "x", { __secret = true } end'), "shards").shown, "a hidden class shows nothing").toBe(false);
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
  const loaded = loggedIn(TRAINER_ENV + "__loadTrainer(false)", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { trainAll = false } } }" });
  loaded.fire("TRAINER_SHOW");
  expect(trainButton(loaded), "a window already loaded gets it too; switched off it hides").toMatchObject({ shown: false, by: "ClassTrainerFrame" });
});

// TEST-ONLY trainer as the game reports it: GetTrainerServiceInfo is name, kind, texture, ...; buying
// changes nothing until the server answers (money and list as they were), or removes the service from the list.
const FOREVER_TRAINER_ENV = `
  __services = { { "TEST-ONLY Bolt", "available", 500 }, { "TEST-ONLY Ward", "unavailable", 100 }, { "TEST-ONLY Blast", "available", 2000 }, { "TEST-ONLY Gust", "available", 1000 } }
  __money, __learned, __shrink = 3200, {}, false
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], s[2], 134400, 1, "Rank 1" end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = __services[i][1] if __shrink then table.remove(__services, i) end end
  ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
`;

it("Train all in one click: no purchase twice, the budget counted before the game answers, a list that re-indexes", () => {
  const addon = loggedIn(FOREVER_TRAINER_ENV);
  addon.fire("TRAINER_SHOW");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return __learned"), "32s on hand, game still showing everything: Bolt (5s) and Blast (20s), not Gust (10s: only 7s left), none twice").toEqual(["TEST-ONLY Bolt", "TEST-ONLY Blast"]);
  expect(chatHas(addon, /Trained 2 skill\(s\) for 25s 0c\./), "one line for the whole click").toBe(true);
  const shrinking = loggedIn(FOREVER_TRAINER_ENV + "__shrink = true __money = 100000");
  shrinking.fire("TRAINER_SHOW");
  shrinking.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(shrinking.eval("return __learned"), "the list shrinking under the buying (indexes shifting) skips and repeats nothing").toEqual(["TEST-ONLY Bolt", "TEST-ONLY Blast", "TEST-ONLY Gust"]);
  const capped = loggedIn(FOREVER_TRAINER_ENV + "__shrink = true __money = 100000 ns.GetModule('Errands').TRAIN_STEPS = 2");
  capped.fire("TRAINER_SHOW");
  capped.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(capped.eval("return #__learned"), "a click learns at most TRAIN_STEPS services").toBe(2);
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

it("keep stocked: /vg stock sets the list, a merchant tops you up", () => {
  const addon = loggedIn(STOCK_ENV);
  addon.slash("stock");
  expect(chatHas(addon, /stock list is empty/), "an empty list says how to add").toBe(true);
  addon.slash("stock |cffffffff|Hitem:90011::|h[TEST-ONLY Bread]|h|r 45");
  addon.slash("stock item:90012 12");
  addon.slash("stock 90013 3");
  addon.slash("stock 90014");
  expect(chatHas(addon, /Keeping 45 × TEST-ONLY Bread\./) && chatHas(addon, /Usage: \/vg stock/), "a shift-clicked item and an amount; no amount, the usage").toBe(true);
  addon.slash("stock");
  expect(chatHas(addon, /Keep 12 × item 90012/), "the list, by name where the game knows it").toBe(true);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "40 more bread in stacks of 20, 12 of the fives rounded up to whole fives, nothing sold out").toEqual([[90011, 20], [90011, 20], [90012, 10], [90012, 5]]);
  expect(chatHas(addon, /Bought 40 × TEST-ONLY Bread for 2s 0c\./) && chatHas(addon, /Bought 15 × item 90012 for 1s 20c\./), "and says what it bought").toBe(true);
  addon.eval("__buys = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__buys"), "nothing when you have enough").toBe(0);
  addon.eval("__have = {} __buys = {} __money = 150");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "it stops when you can't pay for the next stack").toEqual([[90011, 20]]);
  addon.fire("MERCHANT_CLOSED");
  addon.slash("stock item:90011 0");
  addon.slash("stock clear");
  expect(chatHas(addon, /TEST-ONLY Bread is off your stock list/) && addon.eval("return next(VanguardDB.profiles.Default.Errands.stockList)") === null, "0 removes an item, clear empties the list").toBe(true);
  const old = loggedIn(STOCK_ENV + "C_Timer = nil C_MerchantFrame = nil GetMerchantItemInfo = function(i) local g = __goods[i] return 'x', '', g.price, g.stack, g.left end", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90012] = 5 } } } }" });
  old.fire("MERCHANT_SHOW");
  expect(old.eval("return __buys"), "a client with the old merchant call (and no timers)").toEqual([[90012, 5]]);
  const off = loggedIn(STOCK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stock = false, stockList = { [90012] = 5 } } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return #__buys"), "switched off it buys nothing").toBe(0);
});

it("keep stocked: an item sold in stacks (ammo) is bought in whole stacks", () => {
  const addon = loggedIn(STOCK_ENV + "__goods[4] = { id = 90014, price = 100, stack = 200, left = -1, max = 200 }", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90014] = 450 } } } }" });
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "450 wanted: two full stacks and the last 50 rounded up to a whole stack of 200").toEqual([[90014, 200], [90014, 200], [90014, 200]]);
  expect(chatHas(addon, /Bought 600 × item 90014 for 3s 0c\./), "and it says what it really bought").toBe(true);
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
const flightBar = (addon) => addon.eval("local b = Vanguard_FlightTimer return { shown = b:IsShown(), text = b.text:GetText(), value = b:GetValue(), max = select(2, b:GetMinMaxValues()) }");

it("flight timer: the first flight is timed, the next counts down", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV);
  expect(flightBar(addon).shown, "no bar until a flight").toBe(false);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  expect(flightBar(addon), "a route never flown: timing it").toMatchObject({ shown: true, text: "Timing this flight to TEST-ONLY Outpost" });
  addon.eval("__wfgStub.advance(90) __onTaxi = false __wfgStub.advance(1)");
  expect([flightBar(addon).shown, addon.eval('return VanguardDB.profiles.Default.Errands.flights["TEST-ONLY Landing > TEST-ONLY Outpost"]')], "landing saves the time and hides the bar").toEqual([false, 91]);
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
  expect(bare.eval("return Vanguard_FlightTimer == nil and ns.GetModule('Errands').settings ~= nil"), "a client without taxi calls loads cleanly").toBe(true);
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

it("a Vanguard button on the game menu opens the options", () => {
  const addon = loggedIn(FOREVER_MENU_ENV);
  expect(addon.eval("return { __calls.AddButton, __calls.AddSection, __calls.MarkDirty, __hooked == true }"), "no AddButton or AddSection, one MarkDirty; the one InitButtons hook is the Windows skin's").toEqual([0, 0, 1, true]);
  expect(addon.eval("local b = ns.gameMenuButton return { b.layoutIndex, b.bottomPadding, b:GetParent() == GameMenuFrame, b.__template, b:GetText(), b:IsShown() }"), "the menu's own template, first index, section gap under it").toEqual([0, 20, true, "GameMenuFrameButtonTemplate", "Vanguard", true]);
  addon.eval("GameMenuFrame:Show()");
  expect(addon.eval("return GameMenuFrame.order"), "first in the menu, above Options").toEqual(["Vanguard", "Options", "Return to Game"]);
  expect(addon.eval("local m = math.huge for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c ~= ns.gameMenuButton and c.layoutIndex then m = math.min(m, c.layoutIndex) end end return ns.gameMenuButton.layoutIndex < m"), "lower than every pooled button's layoutIndex").toBe(true);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c.GetText and c:GetText() == 'Vanguard' then n = n + 1 end end return { GameMenuFrame.order[1], n, __calls.AddButton }"), "still first on the next open, one button, AddButton only from the game").toEqual(["Vanguard", 1, 4]);
  addon.eval("ns.gameMenuButton:GetScript('OnClick')(ns.gameMenuButton)");
  expect(addon.eval("return { GameMenuFrame:IsShown(), Vanguard_Options and Vanguard_Options:IsShown() or ns.Options.current ~= nil }"), "clicking it closes the menu and opens the options").toEqual([false, true]);
  const old = loggedIn("GameMenuFrame = CreateFrame('Frame', 'GameMenuFrame', UIParent)");
  expect(old.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, b.layoutIndex == nil }"), "an older menu gets a themed button just under it, not laid out").toEqual(["Vanguard", true, true]);
  old.eval("HideUIPanel = function(f) f:Hide() end ns.gameMenuButton.__scripts.OnClick()");
  expect(old.eval("return GameMenuFrame:IsShown()"), "which closes the menu too").toBe(false);
  expect(loggedIn("").eval("return ns.gameMenuButton == nil"), "no game menu, nothing added").toBe(true);
});

// TEST-ONLY the game menu's button pool (AddButton takes from it, Reset empties it; each button has template art)
// and its header plate, as MainMenuFrameTemplates.lua and DialogHeaderTemplate make them.
const MENU_POOL_ENV = `
  GameMenuFrame.buttonPool = { __active = {} }
  function GameMenuFrame.buttonPool:EnumerateActive() return next, self.__active end
  local add, reset = GameMenuFrame.AddButton, GameMenuFrame.Reset
  function GameMenuFrame:AddButton(...) local b = add(self, ...) b.Left = b:CreateTexture(nil, "BACKGROUND") self.buttonPool.__active[b] = true return b end
  function GameMenuFrame:Reset() reset(self) self.buttonPool.__active = {} end
  local header = CreateFrame("Frame", nil, GameMenuFrame)
  header.LeftBG, header.RightBG, header.CenterBG = header:CreateTexture(), header:CreateTexture(), header:CreateTexture()
  header.Text = header:CreateFontString()
  GameMenuFrame.Header = header
`;

it("game menu: buttons made after the skin ran are skinned once, Vanguard's matches, the header plate is gone", () => {
  const addon = loggedIn(FOREVER_MENU_ENV + MENU_POOL_ENV);
  addon.eval("__spy = 0 local real = ns.Theme.Button ns.Theme.Button = function(...) __spy = __spy + 1 return real(...) end");
  addon.eval("GameMenuFrame:Show()");
  // The alpha of a menu button's template art.
  const look = (path) => addon.eval(`local b = ${path} return { b.Left and b.Left.__alpha }`);
  expect(addon.eval("return __spy"), "Vanguard's button and the two pooled ones are skinned when the menu opens").toBe(3);
  expect(borderOf(addon, "ns.gameMenuButton"), "Vanguard's button is painted like a pooled one").toEqual(borderOf(addon, "next(GameMenuFrame.buttonPool.__active)"));
  expect(look("next(GameMenuFrame.buttonPool.__active)"), "a pooled button's template art is faded").toEqual([0]);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("return __spy"), "the next open makes two new buttons: only those are skinned").toBe(5);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame.buttonPool.__active = {} GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for b in GameMenuFrame.buttonPool:EnumerateActive() do if ns.FrameState('vgMenuSkinned')[b] then n = n + 1 end end return n"), "every active button carries the skin").toBe(2);
  const head = addon.eval("local h = GameMenuFrame.Header local p = h.__points.TOP return { h.LeftBG:IsShown(), h.RightBG:IsShown(), h.CenterBG:IsShown(), h.Text.__font ~= nil, p.rel == GameMenuFrame, p.y }");
  expect(head, "the header plate is hidden, its title in the theme font, inside the panel").toEqual([false, false, false, true, true, -8]);
  const off = loggedIn(FOREVER_MENU_ENV + MENU_POOL_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.eval("GameMenuFrame:Show()");
  expect([borderOf(off, "ns.gameMenuButton") == null, off.eval("return GameMenuFrame.Header.LeftBG:IsShown()")], "with the windows switched off the menu stays the game's").toEqual([true, true]);
});

it("game menu button: falls back, or goes without what the menu lacks", () => {
  expectErrors(/^GameMenu: wow-world\.lua:\d+: CreateFrame: unknown template NoSuchTemplate$/);
  const broken = loggedIn(FOREVER_MENU_ENV + 'GameMenuFrame.buttonTemplate = "NoSuchTemplate"');
  expect(broken.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, ns.errors[#ns.errors].text:match('^GameMenu:') ~= nil }"), "a template that can't be built: themed button under the menu, one logged error").toEqual(["Vanguard", true, true]);
  const plain = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.buttonTemplate = nil");
  expect(plain.eval("GameMenuFrame:Show() local b = ns.gameMenuButton return { b.text:GetText(), b.layoutIndex, b:GetWidth(), GameMenuFrame.order[1] }"), "a layout menu without a template gets a themed button, still first").toEqual(["Vanguard", 0, 200, "Vanguard"]);
  const clean = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.MarkDirty = nil");
  expect(clean.eval("GameMenuFrame:Show() local n = 0 for _, e in ipairs(ns.errors) do if e.text:match('^GameMenu:') then n = n + 1 end end return { GameMenuFrame.order[1], n }"), "a layout menu without MarkDirty still gets the button first, no GameMenu error").toEqual(["Vanguard", 0]);
});

// What the game's boss holder and its first and last boss button look like: shown, parked, listening, hooked.
const bossHolder = (addon) => addon.eval(`local c, b1, b5 = BossTargetFrameContainer, Boss1TargetFrame, Boss5TargetFrame
  return { c:IsShown(), c:GetParent() == UIParent, c:IsEventRegistered("PLAYER_ENTERING_WORLD"), rawget(c, "Show") == nil and rawget(c, "SetShown") == nil,
    b1:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b5:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b1:GetParent() == c, b5:GetParent() == c }`);

it("boss frames: five in a column at the top left, the game's put away", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV);
  expect(addon.eval(`return { Vanguard_boss5 ~= nil, Vanguard_boss1.__watched, Vanguard_boss2.__points.TOPLEFT.rel == Vanguard_boss1, Vanguard_boss2:GetWidth() }`), "five boss frames, each shown while its boss exists, stacked, 150 wide in whole screen pixels").toEqual([true, true, true, px(addon, 150)]);
  expect(addon.eval("return { ns.MoverPoint('uf_boss1') }"), "movable, from the top-left corner").toEqual(["TOPLEFT", "TOPLEFT", 20, -20]);
  addon.eval("__units.boss1.hp = 4200");
  addon.fire("INSTANCE_ENCOUNTER_ENGAGE_UNIT");
  expect(addon.eval("return { Vanguard_boss1.health.__value, Vanguard_boss1.name:GetText() }"), "a boss joining the fight shows on its frame").toEqual([4200, "TEST-ONLY Boss"]);
  expect(bossHolder(addon), "the game's holder is hidden, parked, silenced and has no Show hook; its boss buttons are silenced and out of it").toEqual([false, false, false, true, false, false, false, false]);
  expect(addon.eval("return { BossTargetFrameContainer:GetParent():IsShown(), Boss5TargetFrame:IsShown() }"), "under a parent that is hidden").toEqual([false, false]);
  const off = loggedIn(UNITS_ENV + BOSS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { UnitFrames = { boss = false } } }" });
  expect(off.eval("return Vanguard_boss1 == nil"), "switched off: no boss frames").toBe(true);
  expect(bossHolder(off), "and the game keeps its own, untouched").toEqual([true, true, true, true, true, true, true, true]);
});

it("boss frames: the game's holder is put away only out of combat", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV + "__wfgStub.inCombat = true");
  expect([addon.eval("return Vanguard_boss1 == nil"), ...bossHolder(addon)], "in combat nothing is touched").toEqual([true, true, true, true, true, true, true, true, true]);
  setCombat(addon, false);
  expect([addon.eval("return Vanguard_boss1 ~= nil"), ...bossHolder(addon)], "when combat ends it is put away, still without a hook").toEqual([true, false, false, false, true, false, false, false, false]);
});

// TEST-ONLY boss: one boss in the fight, and the game's boss frame holder (an Edit Mode frame,
// protected through its five secure boss buttons, which register the engage event).
const BOSS_ENV = `
  __units.boss1 = { name = "TEST-ONLY Boss", hp = 5000, maxhp = 10000, power = 0, maxpower = 0, ptype = "MANA" }
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then t, name, fn = _G, t, name end local orig = t[name] if type(orig) ~= "function" then return end t[name] = function(...) local r = orig(...) fn(...) return r end end
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
  function __tool(i, button) local b = Vanguard_RaidTools.list[i] b.__scripts.OnClick(b, button or "LeftButton") end
`;

it("raid tools: calls, target icons and world markers for the leader and assistants", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV);
  // Whether the bar shows, and whether its Raid button does.
  const state = () => addon.eval("local a = Vanguard_RaidTools.actions return { Vanguard_RaidTools:IsShown(), a.Raid:IsShown() }");
  expect(state(), "a party's leader sees the bar, with Raid").toEqual([true, true]);
  addon.eval("for i = 1, 4 do __tool(i) end __tool(2, 'RightButton') __tool(5) __tool(13)");
  expect(addon.eval("return __calls"), "ready check, pull 10 (right-click cancels), roles, convert; skull on the target, then clear").toEqual(["ready", "pull 10", "roles", "raid", "pull 0", "mark target 1", "mark target 0"]);
  addon.eval("__markable = false __calls = {} __tool(5)");
  expect(addon.eval("return #__calls"), "a target that can't be marked is left alone").toBe(0);
  expect(addon.eval(`local m, c = Vanguard_RaidTools.list[14], Vanguard_RaidTools.list[22]
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
  expect(bare.eval("local out = {} for k in pairs(Vanguard_RaidTools.actions) do out[#out + 1] = k end return out"), "only the calls this client has").toEqual(["Ready"]);
  const solo = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "__inGroup = false");
  expect(solo.eval("return Vanguard_RaidTools:IsShown()"), "hidden out of a group").toBe(false);
});

it("raid frames: groups as rows, and the main tank's shield", () => {
  const rows = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: "VanguardDB.profiles = { Default = { RaidFrames = { layout = 'rows' } } }" });
  expect(rows.eval(`local h = Vanguard_Raid return { h:GetAttribute("point"), h:GetAttribute("columnAnchorPoint"), h:GetAttribute("xOffset"), h:GetAttribute("yOffset"), Vanguard_RaidHolder:GetWidth(), Vanguard_RaidHolder:GetHeight() }`), "each group a row of five, groups stacked up; the holder is one row").toEqual(["LEFT", "BOTTOM", 4, 0, 516, 48]);
  const addon = loggedIn(UNITS_ENV + RAID_ENV + 'GetPartyAssignment = function(kind, unit) return (unit == "raid1" and kind == "MAINTANK") or (unit == "raid2" and kind == "MAINASSIST") end');
  addon.eval('__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")');
  // Whether tile i's role mark shows, and its color.
  const tint = (i) => addon.eval(`local b = Vanguard_RaidUnitButton${i} return { b.role:IsShown(), b.role.__vertexColor }`);
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
  // The strip's height (three rows with the date, or four with the leveling row).
  const height = () => addon.eval("return Vanguard_InfoStrip:GetHeight()");
  expect([rates(), height()], "nothing to say yet: three rows").toEqual([[false, false, false], 52]);
  addon.eval("__xp = 1900");
  addon.fire("PLAYER_XP_UPDATE", "player");
  later(addon, 10);
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect(rates(), "the first minute's numbers jump about, so they wait").toEqual([false, false, false]);
  later(addon, 1790);
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect([block(addon, "xprate").text, block(addon, "leveltime").text, height()], "900 XP in half an hour; the strip grows a row").toEqual(["1.8K xp/h", "lvl 1h 44m", 68]);
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
  expect([rates(), height()], "no change in gold, no gold rate; back to three rows").toEqual([[false, false, false], 52]);
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
  -- The game's own error line: its handler asks ShouldDisplayMessageType (type 99 is on the game's blacklist),
  -- shows the message under its type as the line's ID, and plays the type's sound.
  UIErrorsFrame = CreateFrame("Frame", "UIErrorsFrame", UIParent) UIErrorsFrame:RegisterEvent("UI_ERROR_MESSAGE")
  function UIErrorsFrame:ShouldDisplayMessageType(messageType) return messageType ~= 99 end
  function UIErrorsFrame:AddMessage(text, r, g, b, a, id) self.__lines = self.__lines or {} self.__lines[#self.__lines + 1] = { text, id } end
  UIErrorsFrame:SetScript("OnEvent", function(self, event, messageType, message)
    if type(message) == "string" and self:ShouldDisplayMessageType(messageType, message) then self:AddMessage(message, 1, 0.1, 0.1, 1, messageType) __sounds = (__sounds or 0) + 1 end
  end)
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
  const off = loggedIn(MERCHANT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Merchant = { repair = false, junk = false, errors = false } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return { #__repairs, #__used, UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE') }"), "each part can be turned off").toEqual([0, 0, true]);
  const bare = loggedIn("CanMerchantRepair = nil");
  bare.fire("MERCHANT_SHOW");
  expect(bare.eval("return ns.GetModule('Merchant').Noisy('x')"), "a client without these calls does nothing").toBe(false);
});

it("the error line drops what the action bar already shows, and the rest takes the game's own path", () => {
  const addon = loggedIn(MERCHANT_ENV);
  expect(addon.eval("return UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE')"), "the game's own handler keeps the event").toBe(true);
  addon.fire("UI_ERROR_MESSAGE", 51, "TEST-ONLY not ready");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 99, "TEST-ONLY Blacklisted by the game");
  addon.fire("UI_ERROR_MESSAGE", 53);
  expect(addon.eval("return UIErrorsFrame.__lines"), "noise is dropped, useful errors stay under their type as the line's ID (so repeats refresh), the game's own blacklist still applies").toEqual([["TEST-ONLY Out of range", 52], ["TEST-ONLY Out of range", 52]]);
  expect(addon.eval("return __sounds"), "and the game's handler still ran for what showed (sounds)").toBe(2);
  expect(addon.eval("return UIErrorsFrame:ShouldDisplayMessageType(7, { __secret = true })"), "a message the client hides is never compared, and shown the game's way").toBe(true);
  const none = loggedIn("UIErrorsFrame = nil");
  expect(none.eval("return ns.GetModule('Merchant').settings.errors"), "no error line on this client: nothing to filter").toBe(true);
  const old = loggedIn(MERCHANT_ENV + "UIErrorsFrame.ShouldDisplayMessageType = nil");
  expect(old.eval("return UIErrorsFrame.ShouldDisplayMessageType == nil"), "an error line without that question is left alone").toBe(true);
});

it("a Sort button on the combined bag, where the client can sort", () => {
  const addon = loggedIn(UI_ENV + "C_Container = { SortBags = function() __sorted = true end }");
  expect(addon.eval('local b = ns.GetModule("Bags").sort b:GetScript("OnClick")(b) return __sorted'), "Sort sorts your bags").toBe(true);
  expect(loggedIn(UI_ENV + "C_Container = nil").eval('return ns.GetModule("Bags").sort == nil'), "no sort call, no button").toBe(true);
});

// TEST-ONLY game search row of the combined bag: the search box and the game's own sort button.
const SORT_ROW_ENV = `
  C_Container = { SortBags = function() end }
  BagItemSearchBox = CreateFrame("EditBox", "BagItemSearchBox", ContainerFrameCombinedBags)
  BagItemAutoSortButton = CreateFrame("Button", "BagItemAutoSortButton", ContainerFrameCombinedBags)
`;

it("the bag's Sort button sits beside the search box and the game's own sort button stays hidden", () => {
  const addon = loggedIn(UI_ENV + SORT_ROW_ENV);
  const sort = addon.eval('local p = ns.GetModule("Bags").sort.__points.LEFT return { p.rel == BagItemSearchBox, p.relPoint, p.x }');
  expect(sort, "right of the search box, 6 px off it").toEqual([true, "RIGHT", 6]);
  expect(addon.eval("return BagItemAutoSortButton:IsShown()"), "the game's own button is hidden at login").toBe(false);
  addon.eval("BagItemAutoSortButton:Show()");
  expect(addon.eval("return BagItemAutoSortButton:IsShown()"), "and the game showing it again (each search row update) hides it again").toBe(false);
  const bare = loggedIn(UI_ENV + "C_Container = { SortBags = function() end }");
  expect(bare.eval('local p = ns.GetModule("Bags").sort.__points.TOPRIGHT return { p.x, p.y }'), "without a search box it takes the game's sort spot, the bag's 12 px padding inside the right edge").toEqual([-12, -34]);
});

it("a context overlay is left alone so the game's search dimming shows", () => {
  const addon = loggedIn(UI_ENV);
  addon.eval("__item.ItemContextOverlay = __item:CreateTexture() ns.FrameState('vgSkinned')[__item] = nil ContainerFrameCombinedBags:Hide() ContainerFrameCombinedBags:Show()");
  expect(addon.eval("return __item.ItemContextOverlay:GetAlpha()"), "its alpha is the game's, not faded to 0").toBe(1);
});

// TEST-ONLY client CVars with the player's own bag choice ("0": separate bags) in them.
const CVAR_ENV = `
  __cvars = { combinedBags = "0" }
  C_CVar.GetCVar = function(k) return __cvars[k] end
`;

it("bags: the combined CVar is set once per change of the setting, and given back when the module is switched off", () => {
  const addon = loggedIn(UI_ENV + CVAR_ENV);
  expect(addon.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied, ns.Settings('Bags').prior }"), "first login: turned on, the player's own value kept").toEqual(["1", true, "0"]);
  const later = loggedIn(UI_ENV + CVAR_ENV, { savedVariables: "VanguardDB.profiles.Default = { Bags = { applied = true, prior = '0' } }" });
  expect(later.eval("return __cvars.combinedBags"), "a later login leaves the player's choice (separate bags) alone").toBe("0");
  const off = loggedIn(UI_ENV + "__cvars = { combinedBags = '1' } C_CVar.GetCVar = function(k) return __cvars[k] end", { savedVariables: "VanguardDB.profiles.Default = { Bags = { combined = false, applied = true, prior = '0' } }" });
  expect(off.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied }"), "turning the setting off sets it once, to separate bags").toEqual(["0", false]);
  addon.eval("ns.SetModuleEnabled('Bags', false)");
  expect(addon.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied == nil, ns.Settings('Bags').prior == nil }"), "switching the module off puts the player's value back").toEqual(["0", true, true]);
  addon.eval("__cvars.combinedBags = '1' ns.SetModuleEnabled('Bags', false)");
  expect(addon.eval("return __cvars.combinedBags"), "and a second time touches nothing").toBe("1");
  const blind = loggedIn(UI_ENV);
  blind.eval("ns.SetModuleEnabled('Bags', false)");
  expect(blind.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied == nil }"), "a client that can't read the CVar has nothing to give back").toEqual(["1", true]);
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

it("flight timer: the taxi check runs only from picking a flight until it lands", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV + "__asked = 0 local real = UnitOnTaxi UnitOnTaxi = function(...) __asked = __asked + 1 return real(...) end");
  // How often the taxi state was asked so far, then reset.
  const asked = () => addon.eval("local n = __asked __asked = 0 return n");
  addon.advance(60);
  expect([asked(), addon.eval('return ns.ticker.vgJobs["flight poll"] ~= nil')], "a minute on the ground with no flight picked: never asked").toEqual([0, false]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true");
  addon.advance(5);
  expect([asked(), flightBar(addon).shown], "in the air: asked twice a second, the bar up").toEqual([10, true]);
  addon.eval("__onTaxi = false");
  addon.advance(1);
  expect([addon.eval('return ns.ticker.vgJobs["flight poll"] ~= nil'), flightBar(addon).shown], "landed: the check stops").toEqual([false, false]);
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
  expect(addon.eval("return ns.FrameState('vgSkinned')[UtilityCooldownViewer.items[2]]"), "items the game adds later are styled too").toBe(true);
  expect(addon.eval("return BuffBarCooldownViewer.items[1].Bar:GetStatusBarTexture() ~= nil and BuffBarCooldownViewer.items[1].Bar.Name.__font ~= nil"), "buff bars get the theme's bar and font").toBe(true);
  const win = addon.eval("local w = DamageMeterSessionWindow1 local l = w.ScrollBox.lines[1] return { w.Header.__alpha, l.StatusBar.BackgroundRegions[1].__alpha, l.StatusBar.Name.__font ~= nil }");
  expect(win, "the meter's header and bar shading fade, its lines take the theme font").toEqual([0, 0, true]);
  addon.eval("__line(DamageMeterSessionWindow1) DamageMeterSessionWindow1.ScrollBox:Update() DamageMeter:SetupSessionWindow() __line(DamageMeterSessionWindow2) DamageMeterSessionWindow2.ScrollBox:Update()");
  expect(addon.eval("return { ns.FrameState('vgSkinned')[DamageMeterSessionWindow1.ScrollBox.lines[2]], ns.FrameState('vgSkinned')[DamageMeterSessionWindow2], ns.FrameState('vgSkinned')[DamageMeterSessionWindow2.ScrollBox.lines[1]] }"), "new lines and new windows are styled as they come").toEqual([true, true, true]);
  // Where a game frame is anchored: { point, the spot it's on }.
  const spot = (name, point) => addon.eval(`local p = ${name}.__points.${point} return p and { p.relPoint, p.rel == Vanguard_${name}Spot } or false`);
  expect([spot("EssentialCooldownViewer", "CENTER"), spot("DamageMeter", "TOPLEFT"), spot("DamageMeter", "BOTTOMRIGHT")], "rows are centered on their spots; the meter fills its own").toEqual([["CENTER", true], ["TOPLEFT", true], ["BOTTOMRIGHT", true]]);
  addon.eval('EditModeManagerFrame:Show() EssentialCooldownViewer:ClearAllPoints() EssentialCooldownViewer:SetPoint("TOP", UIParent, "TOP", 0, -50)');
  expect(spot("EssentialCooldownViewer", "TOP"), "while Edit Mode is open, the game can move it").toEqual(["TOP", false]);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(spot("EssentialCooldownViewer", "CENTER"), "and it's back on its spot when Edit Mode closes").toEqual(["CENTER", true]);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Place them to fit the layout") and VanguardDB.profiles.Default.GameTools.place'), "the placing switch is on the page").toBe(false);
  const left = loggedIn(TOOLS_ENV, { savedVariables: "VanguardDB.profiles.Default = { GameTools = { place = false } }" });
  expect(left.eval("return { Vanguard_DamageMeterSpot == nil, DamageMeter.__points.TOPLEFT.rel == UIParent, ns.FrameState('vgSkinned')[DamageMeterSessionWindow1] }"), "with placing off they keep Edit Mode's spots but are still styled").toEqual([true, true, true]);
  const off = loggedIn(TOOLS_ENV, { savedVariables: "VanguardDB.profiles.Default = { GameTools = { cooldowns = false, meter = false } }" });
  expect(off.eval("return { ns.FrameState('vgSkinned')[EssentialCooldownViewer.items[1]] == nil, ns.FrameState('vgSkinned')[DamageMeterSessionWindow1] == nil, Vanguard_DamageMeterSpot == nil }"), "switched off, both stay the game's").toEqual([true, true, true]);
  expect(loggedIn("").eval("return ns.GetModule('GameTools') ~= nil"), "a client without these tools loads cleanly").toBe(true);
});

it("Edit Mode shows Vanguard's handles too, with a note under its window", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  // Whether the handles are up, how many grid lines show, and whether the note shows (with its text).
  const state = () => {
    const s = addon.eval("local n = Vanguard_EditModeNote return { ns.Unlocked(), n ~= nil and n:IsShown(), n ~= nil and n.text:GetText() == ns.EDIT_NOTE }");
    return [s[0], gridLines(addon), s[1], s[2]];
  };
  addon.eval("EditModeManagerFrame:Show()");
  expect(state(), "opening Edit Mode shows the handles (the game draws its own grid) and the note").toEqual([true, 0, true, true]);
  expect(addon.eval("return Vanguard_EditModeNote.__points.TOP.rel == EditModeManagerFrame"), "the note sits under Edit Mode's window").toBe(true);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(state().slice(0, 3), "closing it hides them again").toEqual([false, 0, false]);
  addon.slash("unlock");
  addon.eval("EditModeManagerFrame:Show() EditModeManagerFrame:Hide()");
  expect(addon.eval("return ns.Unlocked()"), "handles you put up with /vg unlock stay up").toBe(true);
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

// TEST-ONLY Edit Mode systems (P2.18): each named game frame gets a Selection (shown to begin with) and
// the HighlightSystem method Edit Mode calls on every system it shows, which shows that Selection.
const SYSTEMS_ENV = `
  function __system(name, noSelection)
    local f = _G[name] or CreateFrame("Frame", name, UIParent)
    if not noSelection then f.Selection = CreateFrame("Frame", nil, f) end
    function f:HighlightSystem() if self.Selection then self.Selection:Show() end end
    return f
  end
  for _, name in ipairs({ "MainMenuBar", "PlayerFrame", "PlayerCastingBarFrame", "CompactRaidFrameContainer", "StatusTrackingBarManager", "ObjectiveTrackerFrame", "EncounterBar" }) do __system(name) end
  __system("PetFrame", true)
  PetFrame:UnregisterAllEvents()
`;

// Whether each named system's Edit Mode handle is shown after Edit Mode highlights every system.
const handles = (addon) => addon.eval(`local out = {}
  for _, name in ipairs({ "MainMenuBar", "PlayerFrame", "PlayerCastingBarFrame", "CompactRaidFrameContainer", "StatusTrackingBarManager", "ObjectiveTrackerFrame", "EncounterBar" }) do
    _G[name]:HighlightSystem() out[#out + 1] = _G[name].Selection:IsShown() end
  return out`);

it("Edit Mode: a game frame Vanguard hides or replaces gets no handle, every other system keeps its own", () => {
  const addon = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV);
  expect(addon.eval("return { MainMenuBar.Selection:IsShown(), PlayerFrame.Selection:IsShown(), EncounterBar.Selection:IsShown() }"), "the handle of a frame is hidden as soon as Vanguard hides it; one it leaves alone is untouched").toEqual([false, false, true]);
  expect(handles(addon), "action bars, unit frames, cast bar, raid frames, XP bar and the game's quest tracker (Vanguard's is on): none shows; the encounter bar does").toEqual([false, false, false, false, false, false, true]);
  expect(addon.eval("local ok = pcall(PetFrame.HighlightSystem, PetFrame) return ok"), "a replaced system with no Selection is fine").toBe(true);
  const own = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV, { savedVariables: "VanguardDB.profiles.Default = { QuestTracker = { own = false } }" });
  expect(handles(own)[5], "with Vanguard's tracker off, the game's tracker keeps its handle").toBe(true);
  const kept = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV, { savedVariables: "VanguardDB.profiles.Default = { ActionBars = { hideBlizzard = false }, UnitFrames = { hideBlizzard = false } }" });
  expect(handles(kept).slice(0, 2), "with the game's bars and unit frames kept, their handles stay").toEqual([true, true]);
  const plain = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV + "hooksecurefunc = nil");
  expect(plain.eval("return PlayerFrame.Selection:IsShown()"), "a client without hooksecurefunc leaves handles alone").toBe(true);
});

// TEST-ONLY: a client with the Cooldown Manager (switched off), and a cooldown on the essential row's item.
const CDM_ENV = `C_CooldownViewer = { IsCooldownViewerAvailable = function() return true end }
  local i = EssentialCooldownViewer.items[1] i.Cooldown = CreateFrame("Cooldown", nil, i)
`;

it("the game's tools: a switch shows the Cooldown Manager's essential row between the frames, timers in the theme font", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV + CLICK_LUA);
  const timer = addon.eval("local fs = EssentialCooldownViewer.items[1].Cooldown:GetCountdownFontString() return { fs.__font[2], fs.__font[3] }");
  expect(timer, "the cooldown timer in the theme's timer font").toEqual([addon.eval('return ns.Theme.RoleSize("cooldown")'), "OUTLINE"]);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled") == nil'), "off by default: the game's setting is left alone").toBe(true);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Show the game's Cooldown Manager")`);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled")'), "ticked: the game's Cooldown Manager is on").toBe("1");
  addon.eval(`__click("Show the game's Cooldown Manager")`);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled")'), "unticked: off again").toBe("0");
  const on = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameTools = { essential = true } } }" });
  expect([on.eval('return GetCVar("cooldownViewerEnabled")'), chatHas(on, /Cooldown Manager is off/), on.eval("return EssentialCooldownViewer.__points.CENTER.rel == Vanguard_EssentialCooldownViewerSpot")],
    "switched on at login: on, no hint, the essential row on its spot between the frames").toEqual(["1", false, true]);
  const screen = on.screen();
  expect(screen.map((f) => f.name)).toEqual(expect.arrayContaining(["Vanguard_EssentialCooldownViewerSpot", "Vanguard_player", "Vanguard_target"]));
  const bad = [];
  // A game frame filling its own spot (Vanguard_<name>Spot) is meant to cover it.
  const ownSpot = (a, b) => b.name === `Vanguard_${a.name}Spot` || a.name === `Vanguard_${b.name}Spot`;
  for (const a of screen) for (const b of screen) if (a.name < b.name && !ownSpot(a, b) && a.rect.left < b.rect.right && b.rect.left < a.rect.right && a.rect.bottom < b.rect.top && b.rect.bottom < a.rect.top) bad.push(`${a.name} x ${b.name}`);
  expect(bad, "with it on, nothing in the layout covers anything else").toEqual([]);
  const old = loggedIn(UNITS_ENV + TOOLS_ENV + "C_CooldownViewer = nil\n", { savedVariables: "VanguardDB.profiles = { Default = { GameTools = { essential = true } } }" });
  expect(old.eval('return GetCVar("cooldownViewerEnabled") == nil'), "a client without the Cooldown Manager is left alone").toBe(true);
});

it("the game's tools: one hint when the Cooldown Manager is off", () => {
  // A client whose Cooldown Manager is available (or not) and switched on (or not).
  const env = (enabled, available = "true") => `C_CooldownViewer = { IsCooldownViewerAvailable = function() return ${available} end }
    C_CVar = { GetCVarBool = function(name) if name == "cooldownViewerEnabled" then return ${enabled} end end }`;
  const addon = loggedIn(UNITS_ENV + env("false"));
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(chatHas(addon, /Cooldown Manager is off\. Turn it on in Options > Gameplay Enhancements/), "where to turn it on").toBe(true);
  addon.fire("PLAYER_ENTERING_WORLD");
  expect([addon.chat().filter((line) => /Cooldown Manager is off/.test(line)).length, addon.eval("return VanguardDB.profiles.Default.GameTools.cdmHint")], "said once").toEqual([1, false]);
  // Whether a client says the hint at all.
  const hints = (lua, saved = "") => { const a = loggedIn(UNITS_ENV + lua, { savedVariables: saved }); a.fire("PLAYER_ENTERING_WORLD"); return chatHas(a, /Cooldown Manager is off/); };
  expect([hints(env("true")), hints(env("false", "false")), hints(env("false") + " C_CVar = nil"), hints("C_CooldownViewer = nil"),
    hints(env("false"), "VanguardDB.profiles = { Default = { GameTools = { cooldowns = false } } }")],
  "not when it's on, not available yet, the client can't say, or Vanguard leaves it alone").toEqual([false, false, false, false, false]);
});

// The bag and menu bar's rows' scales: each puts its buttons one 24-unit slot and a 4-unit gap apart.
const MENU = 28 / 27, BAGS = 28 / 47;
// A number to three places (sizes worked out in fractions of a unit).
const r3 = (n) => Math.round(n * 1000) / 1000;
// The bag and menu bar's width and height.
const barSize = (addon) => addon.eval("return { Vanguard_MenuStrip:GetWidth(), Vanguard_MenuStrip:GetHeight() }").map(r3);
// The bar's width around a longer row of n slots: the slots, their 4-pixel gaps, and a 12-pixel margin each side.
const barW = (n) => (n > 0 ? n * 28 - 4 : 0) + 24;
// The bar's height: a 24-pixel bags row, a 4-pixel gap and a 30-pixel menu row, inside the margins.
const BAR_H = 24 + 4 + 30 + 24;
// The bar's width around a micro menu w units wide: the game lays its buttons 27 units apart, 5 overlapping.
const menuBarW = (w) => barW(Math.round((w - 5) / 27));

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
  const slots = addon.eval(`local t, a = MinimapCluster.Tracking, AddonCompartmentFrame
    return { t:GetWidth(), t:GetScale(), ns.FrameState('vgGlyph')[t].__texture:match("(%a+)$"), ns.FrameState('vgGlyph')[a].__texture:match("(%a+)$"), ns.FrameState('vgSlot')[t] ~= nil, ns.FrameState('vgSlot')[MinimapCluster.IndicatorFrame.MailFrame] == nil }`);
  expect(slots, "tracking and the addon compartment are 18-unit slot buttons with the theme's icons (unscaled); mail stays an indicator").toEqual([18, 1, "MinimapTracking", "MinimapAddons", true, true]);
  expect(addon.eval("local a = AddonCompartmentFrame a.Text = a:CreateFontString() ns.GetModule('Minimap').SlotButton(a, 'MinimapAddons') return a.Text:GetAlpha()"), "the compartment's count is faded, not left hanging off the slot").toBe(0);
  addon.eval("local a = AddonCompartmentFrame a.__scripts.OnEnter(a)");
  expect(isTok(addon, addon.eval("return ns.FrameState('vgGlyph')[AddonCompartmentFrame].__vertexColor"), "accent"), "a slot button's icon lights in the accent under the mouse").toBe(true);
  expect([pinned(addon, "BagsBar", "Vanguard_MenuStrip"), pinned(addon, "MicroMenuContainer", "Vanguard_MenuStrip")], "the bag bar and the micro menu ride in one bar, each at its row's right end").toEqual([[true, "RIGHT"], [true, "RIGHT"]]);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('pin ') then return e.text end end return 'none'"), "pinning the first row fits both rows with no error: every row's anchor is made first").toBe("none");
  addon.eval("BagsBar:SetSize(600, 45) ns.PausePins(false)");
  expect(barSize(addon), "a bag bar 600 units wide holds 13 bags: the bar hugs their slots inside a 12-unit margin (two rows tall)").toEqual([barW(13), BAR_H]);
  addon.eval("BagsBar:SetSize(50, 20) ns.PausePins(false)");
  expect([...barSize(addon), addon.eval("return Vanguard_BagStrip == nil")], "one bag: the bar shrinks to hug its one slot, and there is no separate bag strip").toEqual([barW(1), BAR_H, true]);
  expect(addon.eval("local s = Vanguard_MenuStrip return { s:GetAlpha(), s.__mouseMotion == nil }"), "the bar is always shown by default (P2.18), nothing watching the mouse").toEqual([1, true]);
  expect(addon.eval("return { Vanguard_QuestTracker:GetWidth(), Vanguard_QuestTracker:GetHeight(), next(ObjectiveTrackerFrame.__points) == nil }"), "Vanguard's tracker is on: its spot is made (260 by 234) and the game's tracker is not pinned").toEqual([260, 234, true]);
});

it("menu strip: the game's tracker is pinned into the spot only while Vanguard's own tracker is off", () => {
  // Where the game's tracker is anchored: whether on the spot, and its height.
  const pinned = (addon) => addon.eval("local p = ObjectiveTrackerFrame.__points.TOPRIGHT return { p ~= nil and p.rel == Vanguard_QuestTracker, ObjectiveTrackerFrame:GetHeight() }");
  const saved = (profile) => ({ savedVariables: `VanguardDB.profiles.Default = ${profile}` });
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ QuestTracker = { own = false } }"))), "Vanguard's tracker off: the game's sits under the info strip, no taller than its spot").toEqual([true, 234]);
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ QuestTracker = { own = true } }"))), "Vanguard's tracker on: one owner only, the game's is not pinned").toEqual([false, 0]);
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ modules = { QuestTracker = false } }"))), "the tracker module switched off altogether: the game's is pinned again").toEqual([true, 234]);
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
  const off = loggedIn(UI_ENV + TIDY_ENV, { savedVariables: `VanguardDB.profiles = { Default = { DataBars = { xp = false, reputation = false },
    InfoStrip = { durability = false, clock = false }, Minimap = { icons = false }, MenuStrip = { menu = "always", tracker = false }, QuestTracker = { own = false } } }` });
  expect(["StatusTrackingBarManager", "DurabilityFrame", "TimeManagerClockButton"].map((n) => putAway(off, n)), "replacements off: the game's own stay").toEqual([false, false, false]);
  expect(off.eval("return MinimapCluster.Tracking:GetParent() == MinimapCluster"), "minimap buttons off: tracking stays where the game put it").toBe(true);
  expect(off.eval("return { Vanguard_MenuStrip:GetAlpha(), Vanguard_MenuStrip.__scripts.OnUpdate == nil }"), "menu strip set to Always: always shown, nothing polling").toEqual([1, true]);
  expect(off.eval("return next(ObjectiveTrackerFrame.__points) == nil and Vanguard_QuestTracker == nil"), "tracker off: the game's tracker is left alone").toBe(true);
  const bare = loggedIn(UI_ENV);
  expect(bare.eval("return Vanguard_MenuStrip ~= nil and Vanguard_QuestTracker ~= nil"), "a client without these frames still gets the strip and the spot, with nothing to pin").toBe(true);
});

it("a menu button takes clicks while the game's notification badge is shown (#243)", () => {
  // TEST-ONLY badge, shaped like the game's NotificationOverlay: a hidden child frame over the whole button, high
  // above it; and a mouse-taking alert frame. The badge turns the mouse back on whenever it is shown.
  const BADGE_ENV = `__badge = CreateFrame("Frame", nil, CharacterMicroButton) __badge:SetAllPoints() __badge:SetFrameLevel(100) __badge:Hide()
    __badge:HookScript("OnShow", function(self) self:EnableMouse(true) self:SetHitRectInsets(0, 0, 0, 0) end)
    __alert = CreateFrame("Frame", nil, CharacterMicroButton) __alert:EnableMouse(true)`;
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + BADGE_ENV);
  // A frame's mouse switch and its hit area's left inset.
  const state = (f) => addon.eval(`return { ${f}:IsMouseEnabled() and 1 or 0, ${f}.__hitInsets[1] }`);
  expect([state("__badge"), state("__alert")], "both frames take no mouse and have no place to hit").toEqual([[0, 512], [0, 512]]);
  addon.eval("__badge:Show()");
  expect(state("__badge"), "a badge shown later is made click-through again").toEqual([0, 512]);
  expect(addon.eval("return ns.FrameState('vgSlot')[CharacterMicroButton]:IsMouseEnabled() and 1 or 0"), "our own slot is left alone").toBe(0);
  addon.eval("local clicked = 0 CharacterMicroButton:HookScript('OnClick', function() clicked = clicked + 1 end) CharacterMicroButton:Click() __clicked = clicked");
  expect(addon.eval("return __clicked"), "a click reaches the button").toBe(1);
});

it("Round Four leftovers: menu glyphs, a target diamond, raid names above incoming heals", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  // A menu button's state: its icon, the icon's color, its faded art and kept flash, the icon's width.
  const glyph = (name) => addon.eval(`local b = ${name} local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { tex = ns.FrameState('vgGlyph')[b] and ns.FrameState('vgGlyph')[b].__texture, color = ns.FrameState('vgGlyph')[b] and ns.FrameState('vgGlyph')[b].__vertexColor, art = art, normal = b.normal.__alpha, flash = b.Flash.__alpha or 1, w = ns.FrameState('vgGlyph')[b] and ns.FrameState('vgGlyph')[b].__width }`);
  const char = glyph("CharacterMicroButton");
  expect(/Icons\\Character$/.test(char.tex) && /Icons\\MenuCog$/.test(glyph("MainMenuMicroButton").tex), "switched on, each menu button gets its Vanguard icon (a client without the rest is fine)").toBeTruthy();
  expect([char.art, char.normal, char.flash, r3(char.w * MENU)], "the game's art is faded but its alert flash stays; the icon is 20 screen pixels").toEqual([0, 0, 1, 20]);
  expect(isTok(addon, char.color, "text"), "the icon is text").toBeTruthy();
  const slot = addon.eval("local s = ns.FrameState('vgSlot')[CharacterMicroButton] return { s.__width, s.__height, s.__points.CENTER ~= nil, ns.FrameState('vgGlyph')[CharacterMicroButton]:GetParent() == s }");
  expect([r3(slot[0] * MENU), r3(slot[1] * MENU), slot[2], slot[3]], "each button sits on a centered slot 24 pixels wide and 30 tall (a 4-pixel gap to its neighbors), the icon on it").toEqual([24, 30, true, true]);
  const bag = addon.eval(`local b = MainMenuBarBackpackButton local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { art, b.icon.__alpha, b.icon.__texCoord[1] > 0, b.icon.__points.TOPLEFT.rel == ns.FrameState('vgSlot')[b], b.icon.__points.TOPLEFT.x }`);
  expect([...bag.slice(0, 4), r3(bag[4] * BAGS)], "bag buttons: the game's art faded, the bag icon kept, cropped and inset 3 pixels in its slot").toEqual([0, 1, true, true, 3]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "disabled"), "and in the disabled tier while the button is disabled").toBeTruthy();
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "text"), "back to text when it's enabled again").toBeTruthy();
  addon.eval('ns.Options.Show("more")');
  expect(addon.eval('return __click("Vanguard icons on the menu buttons") and VanguardDB.profiles.Default.MenuStrip.glyphs'), "the switch is on the page").toBe(false);
  const plain = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV);
  expect(plain.eval("return { ns.FrameState('vgGlyph')[CharacterMicroButton] ~= nil, CharacterMicroButton.normal.__alpha, ns.FrameState('vgSlot')[CharacterMicroButton] ~= nil }"), "by default Vanguard's icon stands on the slot, the game's faded").toEqual([true, 0, true]);
  const off = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  expect(off.eval("return { ns.FrameState('vgGlyph')[CharacterMicroButton] == nil, CharacterMicroButton.normal.__alpha == nil, ns.FrameState('vgSlot')[CharacterMicroButton] ~= nil }"), "switched off, the game's own icon stays, on its slot").toEqual([true, true, true]);

  const plates = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  plates.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  plates.fire("PLAYER_ENTERING_WORLD");
  // A plate's target marker: shown, texture, color and where it's anchored.
  const marker = (unit) => plates.eval(`local m = ns.FrameState('vgPlate')[__plates.${unit}].marker return { m:IsShown(), m.__texture, m.__vertexColor, m.__points.LEFT.relPoint }`);
  const target = marker("nameplate1");
  expect(target[0] === true && /Textures\\Diamond$/.test(target[1]) && isTok(plates, target[2], "accent") && target[3] === "RIGHT", "your target's plate gets an accent diamond at its right").toBeTruthy();
  // Whether a plate's target marker shows.
  const shown = (unit) => plates.eval(`return ns.FrameState('vgPlate')[__plates.${unit}].marker:IsShown()`);
  expect(shown("nameplate2"), "other plates don't").toBe(false);
  plates.eval('VanguardDB.profiles.Default.Nameplates.targetBorder = false ns.GetModule("Nameplates").Update(ns.FrameState("vgPlate")[__plates.nameplate1], "nameplate1")');
  expect(shown("nameplate1"), "and it goes with the target border switch").toBe(false);

  const raid = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  raid.eval('__spawn(1, "raid1")');
  const layers = raid.eval(`local b = Vanguard_RaidUnitButton1
    return { b.name:GetParent() == b.texts and b.status:GetParent() == b.texts and b.role:GetParent() == b.texts and b.roleShadow:GetParent() == b.texts,
      b.texts:GetFrameLevel() > b.heal:GetFrameLevel() and b.texts:GetFrameLevel() > b.shield:GetFrameLevel(), b.texts:GetFrameLevel() < b.overlay:GetFrameLevel() }`);
  expect(layers, "a tile's name, role and status sit above the incoming-heal and shield bars, under the status marks").toEqual([true, true, true]);
});

it("menu strip: set to mouseover, shown by the mouse entering and leaving it and its buttons, with nothing polling", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: 'VanguardDB.profiles.Default = { MenuStrip = { menu = "mouseover" } }' });
  // The menu strip's alpha.
  const alpha = () => addon.eval("return Vanguard_MenuStrip:GetAlpha()");
  expect(addon.eval("local s = Vanguard_MenuStrip return { s:GetScript('OnUpdate') == nil, s.__mouseMotion, s.__mouseClick }"), "no OnUpdate; the strip feels the mouse but lets clicks through").toEqual([true, true, false]);
  addon.hover("CharacterMicroButton");
  expect(alpha(), "straight onto a button: the strip shows").toBe(1);
  addon.hover("Vanguard_MenuStrip");
  expect(alpha(), "from the button onto the strip between buttons: still shown").toBe(1);
  addon.hover("EJMicroButton");
  addon.hover(null);
  expect(alpha(), "off the strip: hidden").toBe(0);
  addon.hover("MainMenuMicroButton");
  addon.eval("Vanguard_MenuStrip.__mouseOver = true");
  addon.hover(null);
  expect(alpha(), "leaving a button while still over the strip keeps it shown").toBe(1);
});

it("bag and menu bar: the bars' own frame art is hidden, the key ring gets a full slot and no fill", () => {
  const addon = strips();
  expect(addon.eval("return { MicroMenu.BorderArt.__alpha, MicroMenu.BackgroundArt.__alpha, BagsBar.BorderArt.__alpha }"), "the brass box is faded").toEqual([0, 0, 0]);
  const ring = addon.eval("local b = KeyRingButton return { b.icon.__alpha, b.icon.__points.TOPLEFT.rel == ns.FrameState('vgSlot')[b], b.icon.__texCoord[1] > 0, ns.FrameState('vgSlot')[b].__width, ns.FrameState('vgFill')[b] == nil, b:GetWidth() }");
  expect([ring[0], ring[1], ring[2], r3(ring[3] * BAGS), ring[4], ring[5]], "the key ring: widened from 33 to a bag's 45 units, its icon cropped in a full 24-pixel slot, no fill").toEqual([1, true, true, 24, true, 45]);
  const off = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(off.eval("return { MicroMenu.BorderArt.__alpha, ns.FrameState('vgSlot')[KeyRingButton] ~= nil }"), "with or without the line icons, the frame art goes and the key ring is framed").toEqual([0, true]);
});

it("bag and menu bar: every row's anchor has a size, so the bars get a rect to draw in", () => {
  const addon = strips("BagsBar:SetSize(315, 45) MicroMenuContainer:SetSize(226.5, 30)");
  // The client gives a zero-sized frame no rect and draws nothing anchored to one: the bar showed its panel and divider with nothing in it (seen in game).
  const rects = (names) => addon.eval(`local out = {} for _, n in ipairs({ ${names.map((n) => JSON.stringify(n)).join(", ")} }) do out[#out + 1] = _G[n]:IsRectValid() end return out`);
  expect(addon.eval("local MS = ns.GetModule('MenuStrip') local out = {} for i, row in ipairs(MS.ROWS) do out[i] = { row.anchor:GetWidth(), row.anchor:GetHeight(), row.anchor:IsRectValid() } end return out"),
    "each row's anchor is its row's box: as wide as the row, a slot tall, with a rect").toEqual([[7 * 28 - 4, 24, true], [8 * 28 - 4, 24, true]]);
  expect(rects(["Vanguard_MenuStrip", "BagsBar", "MicroMenuContainer"]), "the bar and both of the game's bars have rects").toEqual([true, true, true]);
  addon.eval("local MS = ns.GetModule('MenuStrip') Probe = CreateFrame('Frame', 'Probe', UIParent) Probe:SetSize(10, 10) Probe:SetPoint('RIGHT', MS.ROWS[1].anchor, 'TOPRIGHT') Empty = CreateFrame('Frame', 'Empty', UIParent) Empty:SetPoint('CENTER')");
  expect(rects(["Probe"]), "the harness lays out what hangs on a row's anchor").toEqual([true]);
  addon.eval("Probe:SetPoint('RIGHT', Empty, 'TOPRIGHT')");
  expect(rects(["Empty", "Probe"]), "and, like the client, gives nothing hung on a zero-sized frame a rect").toEqual([false, false]);
  addon.eval("BagsBar:SetSize(0, 45) MicroMenuContainer:SetSize(0, 30) ns.PausePins(false)");
  expect(addon.eval("local MS = ns.GetModule('MenuStrip') return { MS.ROWS[1].anchor:GetWidth(), MS.ROWS[2].anchor:GetWidth(), Vanguard_MenuStrip:GetWidth() }"),
    "rows with no buttons keep a unit-wide anchor (the bar hugs its margins)").toEqual([1, 1, 24]);
});

it("bag and menu bar: the bags and menu the game hides on an input switch come back, after combat", () => {
  const addon = strips();
  // Whether the bag bar and the micro menu are shown themselves.
  const shown = () => addon.eval("return { BagsBar:IsShown(), MicroMenu:IsShown() }");
  addon.eval("MicroMenu:Hide() BagsBar:Hide()");
  expect(shown(), "the game's gamepad switch hides both: shown again at once").toEqual([true, true]);
  addon.eval("Vanguard_MenuStrip:Hide()");
  expect(shown(), "hidden only with the bar, they keep their own shown state").toEqual([true, true]);
  addon.eval("Vanguard_MenuStrip:Show()");
  setCombat(addon, true);
  addon.eval("MicroMenu:Hide()");
  expect(shown(), "in combat it waits").toEqual([true, false]);
  setCombat(addon, false);
  expect(shown(), "and shows it when combat ends").toEqual([true, true]);
});

// Where a seated bar's RIGHT point sits on its row's anchor (row k of the bar): { x, y } in screen units.
const seatOf = (addon, bar, k, scale) => addon.eval(`local p = ${bar}.__points.RIGHT return { p.rel == ns.GetModule("MenuStrip").ROWS[${k}].anchor, p.relPoint, p.x, p.y }`).map((v, i) => (i > 1 ? r3(v * scale) : v));

it("bag and menu bar: the rows re-fit when the game lays the bars out or resizes them", () => {
  const addon = strips();
  expect(barSize(addon), "before the game lays them out, the bar is its margins only, a bags row, a gap and a menu row tall").toEqual([24, BAR_H]);
  addon.eval("MicroMenuContainer:Layout()");
  expect(barSize(addon), "the bar grows around the laid-out micro menu").toEqual([menuBarW(378), BAR_H]);
  // Each row's last slot sits at its anchor (its button reaches past it by half the difference), its middle on the row's.
  expect(seatOf(addon, "MicroMenuContainer", 2, MENU), "the menu: the lower row, its middle 55 pixels below the top (the 12-pixel margin, the bags row, the gap and half a 30-pixel slot)").toEqual([true, "TOPRIGHT", r3((32 * MENU - 24) / 2), -55]);
  expect(seatOf(addon, "BagsBar", 1, BAGS), "the bags: the upper row, its middle 24 pixels below the top").toEqual([true, "TOPRIGHT", r3((45 * BAGS - 24) / 2), -24]);
  addon.eval("BagsBar:SetScale(1) BagsBar:Layout()");
  expect([barSize(addon)[0], r3(addon.eval("return BagsBar:GetScale()"))], "a narrower bag row leaves the bar as wide as the menu, and the game's reset of the bag bar's scale is undone").toEqual([menuBarW(378), r3(BAGS)]);
  addon.eval("MicroMenuContainer:SetSize(500, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer, 500, 40)");
  expect(barSize(addon)[0], "a size change alone re-fits the bar").toBe(menuBarW(500));
  expect(addon.eval("local d = ns.GetModule('MenuStrip').divider local p = d.__points.LEFT return { p.relPoint, p.x, p.y, d.__points.RIGHT.x, d:GetHeight() }"), "a one-pixel accent line between the rows, across the bar inside its margins").toEqual(["TOPLEFT", 12, -38, -12, addon.eval("return ns.Theme.Pixel(Vanguard_MenuStrip)")]);
  expect(isTok(addon, addon.eval("return ns.GetModule('MenuStrip').divider.__vertexColor"), "accent"), "in the accent").toBe(true);
  addon.eval("ns.Theme.SetAccent(0.1, 0.9, 0.2)");
  expect(addon.eval("return ns.GetModule('MenuStrip').divider.__vertexColor"), "which it follows").toEqual([0.1, 0.9, 0.2, 1]);
});

it("bag and menu bar: the game's menu icons are drawn larger than their slots, so the icon fills the slot, uncropped", () => {
  // TEST-ONLY quest log button showing one of the game's menu icons; the character button's art has no atlas,
  // and the guild button's is a menu atlas in no button state (a shine, not an icon).
  const addon = strips(`
    local b = __micro("QuestLogMicroButton")
    b.normal:SetAtlas("UI-HUD-MicroMenu-Questlog-Up")
    __micro("GuildMicroButton").normal:SetAtlas("UI-HUD-MicroMenu-Shine")
  `, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  // A button's normal texture: its two corners' offsets from the slot's, the slot's size, the inset, and its texture coordinates.
  const place = (name) => addon.eval(`local b = ${name} local p = b.normal.__points
    return { p.TOPLEFT.x, p.TOPLEFT.y, p.BOTTOMRIGHT.x, p.BOTTOMRIGHT.y, ns.FrameState('vgSlot')[b].__width, ns.FrameState('vgSlot')[b].__height, ns.FrameState('vgInset')[b], b.normal.__texCoord == nil }`);
  const { left: l, right: r, top: t, bottom: btm } = addon.eval("return ns.GetModule('MenuStrip').ICON_BOX");
  const [x0, y0, x1, y1, w, h, d, uncropped] = place("QuestLogMicroButton");
  const fw = (w - 2 * d) / (r - l), fh = (h - 2 * d) / (btm - t);
  expect([x0 + fw * l, y0 - fh * t, x1 - fw * (1 - r), y1 + fh * (1 - btm)].map(r3), "so the icon's box lands exactly on its place, the inset in from the slot's edge").toEqual([d, -d, -d, d].map(r3));
  expect(uncropped, "and nothing is cropped (the client counts an atlas's coordinates its own way)").toBe(true);
  const [cx0, cy0, cx1, cy1, , , cd] = place("CharacterMicroButton");
  expect([cx0, cy0, cx1, cy1].map(r3), "art that isn't one of the game's menu icons fits inside the inset").toEqual([cd, -cd, -cd, cd].map(r3));
  const [gx0, gy0, gx1, gy1, , , gd] = place("GuildMicroButton");
  expect([gx0, gy0, gx1, gy1].map(r3), "and so does a menu atlas in no button state").toEqual([gd, -gd, -gd, gd].map(r3));
});

// TEST-ONLY bars laid out as the game lays them out: nine menu buttons 27 units apart (32 wide,
// overlapping by 5) from the micro menu's left, and the bags right to left from the bag bar's
// right edge, 2 units apart, the key ring last at its 33 units.
const GAME_BARS_ENV = `
  MicroMenuContainer:SetSize(9 * 27 + 5, 40)
  for i, name in ipairs({ "Character", "PlayerSpells", "Talent", "Achievement", "QuestLog", "Guild", "LFD", "Collections", "MainMenu" }) do
    local b = CreateFrame("Button", name .. "MicroButton", MicroMenuContainer) b:SetSize(32, 40) b:SetPoint("LEFT", MicroMenuContainer, "LEFT", (i - 1) * 27, 0)
  end
  BagsBar:SetSize(5 * 47 + 33, 45)
  local prev
  for i, name in ipairs({ "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot", "KeyRingButton" }) do
    local b = CreateFrame("Button", name, BagsBar) b:SetSize(i == 6 and 33 or 45, 45) b.icon = b:CreateTexture()
    if prev then b:SetPoint("RIGHT", prev, "LEFT", -2, 0) else b:SetPoint("RIGHT", BagsBar, "RIGHT") end
    prev = b
  end
`;

// Every slot's screen rect (left, bottom, right, top, to three places) in a row (1 bags, 2 menu), left to right.
const slotRects = (addon, k) => addon.eval(`local MS, out = ns.GetModule("MenuStrip"), {}
  for i, b in ipairs(MS.slotted) do if ns.FrameState('vgRow')[b] == MS.ROWS[${k}] then out[#out + 1] = i end end return out`)
  .map((i) => addon.frame(`ns.FrameState("vgSlot")[ns.GetModule("MenuStrip").slotted[${i}]]`).rect)
  .map((r) => [r.left, r.bottom, r.right, r.top].map(r3)).sort((a, b) => a[0] - b[0]);

it("bag and menu bar: the bar hugs its slots, one size, one baseline per row, one pair of edges", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + GAME_BARS_ENV);
  const bar = addon.frame("Vanguard_MenuStrip").rect;
  const bags = slotRects(addon, 1), menu = slotRects(addon, 2);
  expect([bags.length, menu.length], "six bag slots (the key ring with them) over nine menu slots").toEqual([6, 9]);
  expect([bags.every((r) => r3(r[2] - r[0]) === 24 && r3(r[3] - r[1]) === 24), menu.every((r) => r3(r[2] - r[0]) === 24 && r3(r[3] - r[1]) === 30)],
    "every bag slot is 24 pixels square, the key ring's too; every menu slot is 24 wide and 30 tall").toEqual([true, true]);
  // The left edges' steps along a row.
  const steps = (row) => row.slice(1).map((r, i) => r3(r[0] - row[i][0]));
  expect([steps(bags), steps(menu)], "each row steps one slot and a 4-pixel gap at a time").toEqual([Array(5).fill(28), Array(8).fill(28)]);
  expect([new Set(bags.map((r) => r[1])).size, new Set(menu.map((r) => r[1])).size], "each row on one baseline").toEqual([1, 1]);
  const pad = [r3(menu[0][0] - bar.left), r3(bar.right - menu[8][2]), r3(menu[0][1] - bar.bottom), r3(bar.top - bags[0][3])];
  expect(pad, "the same 12-pixel padding on all four sides: the menu row spans the bar, the bags sit on top").toEqual([12, 12, 12, 12]);
  expect([r3(bags[0][0] - menu[0][0]), r3(menu[8][2] - bags[5][2])], "the shorter bag row is centered over the menu row (3 slots' room each side)").toEqual([42, 42]);
  expect(r3(bags[0][1] - menu[0][3]), "a 4-pixel gap between the rows").toBe(4);
  const line = addon.frame("ns.GetModule('MenuStrip').divider").rect;
  expect([r3(line.left), r3(line.right)], "the divider runs under the slots only, edge to edge with the longer row").toEqual([menu[0][0], menu[8][2]]);
  expect(line.bottom >= menu[0][3] && line.top <= bags[0][1], "between the rows").toBe(true);
  expect([r3(bar.right), r3(bar.bottom), r3(bar.right - bar.left)], "the bar keeps its bottom-right corner, 16 and 20 in from the screen's").toEqual([1904, 20, barW(9)]);
  addon.eval("MicroMenuContainer:SetSize(14 * 27 + 5, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer)");
  const wide = addon.frame("Vanguard_MenuStrip").rect;
  expect([r3(wide.right), r3(wide.right - wide.left)], "fourteen menu buttons: the bar grows to the left only").toEqual([1904, barW(14)]);
});

it("bag and menu bar: one mover keeps the menu strip's saved spot; the bag strip's spot and the line icons are dropped once", () => {
  const spots = 'positions = { menustrip = { point = "BOTTOMLEFT", relPoint = "BOTTOMLEFT", x = 400, y = 20 }, bagstrip = { point = "BOTTOMLEFT", relPoint = "BOTTOMLEFT", x = 10, y = 10 } }';
  const old = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { firstRun: true, savedVariables: `VanguardDB = { version = 1, setupDone = true, profiles = { Default = { MenuStrip = { glyphs = true }, ${spots} } } }` });
  const saved = old.eval("local p = VanguardDB.profiles.Default return { VanguardDB.version, p.MenuStrip.glyphs, p.positions.bagstrip == nil, p.positions.menustrip.x }");
  expect(saved, "an older file: the game's icons again and the bag strip's spot gone, the menu strip's kept").toEqual([2, false, true, 400]);
  expect(old.eval("local p = Vanguard_MenuStrip.__points.BOTTOMLEFT return { p.x, p.y, ns.FrameState('vgGlyph')[CharacterMicroButton] == nil }"), "the bar stands where the menu strip was, with the game's icons").toEqual([400, 20, true]);
  expect(old.eval("local keys = {} for _, m in ipairs(ns.MoverList()) do keys[m.key] = m.label end return { keys.menustrip, keys.bagstrip == nil }"), "one mover for the bar").toEqual(["Bags and game menu", true]);
  const now = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(now.eval("return ns.FrameState('vgGlyph')[CharacterMicroButton] ~= nil"), "line icons switched on after the upgrade stay on").toBe(true);
});

it("bag and menu bar: no re-fit while pins are paused or in combat, and one queued entry per bar", () => {
  const addon = strips();
  addon.eval("ns.PausePins(true) __menuW = 600 MicroMenuContainer:Layout()");
  expect(barSize(addon)[0], "Edit Mode open: the bar waits").toBe(barW(0));
  addon.eval("ns.PausePins(false)");
  expect(barSize(addon)[0], "and fits when it closes").toBe(menuBarW(600));
  setCombat(addon, true);
  addon.eval("__menuW = 400 MicroMenuContainer:Layout()");
  const queued = addon.eval("return ns.QueuedCount()");
  addon.eval("for _ = 1, 50 do MicroMenuContainer:Layout() end");
  expect([barSize(addon)[0], addon.eval("return ns.QueuedCount()")], "in combat nothing changes, and 50 more Layout calls queue nothing more").toEqual([menuBarW(600), queued]);
  setCombat(addon, false);
  expect(barSize(addon)[0], "after combat the bar fits").toBe(menuBarW(400));
  const plain = loggedIn(UI_ENV + 'CreateFrame("Frame", "MicroMenuContainer", UIParent) function MicroMenuContainer:Layout() end');
  expect(plain.eval("return { MicroMenuContainer:GetParent() == Vanguard_MenuStrip, MicroMenuContainer.__scripts.OnSizeChanged ~= nil }"), "a client without hooksecurefunc still pins and watches the size").toEqual([true, true]);
});

it("bag and menu bar: slots are 24 screen pixels wide, take the clicks, and light up under the mouse only", () => {
  const addon = strips("", { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  // A button's slot: its side and the button's hit insets in screen pixels, its frame level against the button's, and its accent edge's color.
  const slot = (name, scale) => addon.eval(`local b = ${name} local s = ns.FrameState('vgSlot')[b] local e
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == s and w.__layer == "BORDER" and w.__sublevel == 0 and w.__vertexColor and w.__vertexColor[1] > 0 then e = w.__vertexColor end end
    return { s.__width, b.__hitInsets and b.__hitInsets[3] or 0, s:GetFrameLevel() < b:GetFrameLevel(), e }`).map((v, i) => (i < 2 ? r3(v * scale) : v));
  const char = slot("CharacterMicroButton", MENU);
  expect(char.slice(0, 3), "a menu slot: 24 pixels wide and 30 tall, the 40-unit button taking clicks on the slot only, drawn under the button").toEqual([24, r3((40 * MENU - 30) / 2), true]);
  expect(char[3][3], "its accent edge is hidden while nothing touches it (a quiet slot)").toBe(0);
  expect(slot("MainMenuBarBackpackButton", BAGS).slice(0, 3), "a bag slot: the same 24 pixels").toEqual([24, r3((45 * BAGS - 24) / 2), true]);
  const accent = addon.eval("return { ns.Theme.Accent() }");
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  const lit = slot("CharacterMicroButton", MENU)[3];
  expect([0, 1, 2].every((i) => lit[i] > accent[i]) && lit[3] === 1, "the mouse over it: the edge shows, brighter than the accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnMouseDown(CharacterMicroButton)");
  const held = slot("CharacterMicroButton", MENU)[3];
  expect([0, 1, 2].every((i) => held[i] < accent[i]), "held down: it darkens").toBe(true);
  addon.eval("CharacterMicroButton.__mouseOver = true CharacterMicroButton.__scripts.OnMouseUp(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3], "let go over it: bright again").toEqual(lit);
  addon.eval("CharacterMicroButton.__mouseOver = false CharacterMicroButton.__scripts.OnMouseUp(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "let go elsewhere: hidden again").toBe(0);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "and when the mouse leaves").toBe(0);
  addon.eval("ns.Theme.SetAccent(0.2, 0.4, 0.6)");
  expect(slot("CharacterMicroButton", MENU)[3], "the edge follows a new accent (still hidden)").toEqual([0.2, 0.4, 0.6, 0]);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "and shows in it under the mouse").toBe(1);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  const well = addon.eval(`local s, out = ns.FrameState('vgSlot')[CharacterMicroButton], { bevel = {}, colors = {} }
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == s and w.__vertexColor then
      if w.__layer == "BORDER" and w.__sublevel == 1 then out.bevel[#out.bevel + 1] = w.__vertexColor[4] end
      out.colors[#out.colors + 1] = w.__vertexColor
    end end
    return out`);
  expect(well.bevel, "a dark well: its bevel lines don't show").toEqual([0, 0]);
  expect(["void", "darkBar"].map((t) => well.colors.some((c) => isTok(addon, c, t))), "filled with the void color, ringed in a lighter line").toEqual([true, true]);
  expect(addon.eval("return { CharacterMicroButton.Background.__alpha, CharacterMicroButton.normal.__alpha == nil, CharacterMicroButton.Flash.__alpha == nil }"), "the game's background plate goes; its icon and alert flash stay").toEqual([0, true, true]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(addon.eval("return CharacterMicroButton.normal.__desaturated"), "a disabled button's icon is grey").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(addon.eval("return CharacterMicroButton.normal.__desaturated"), "and in color again when enabled").toBe(false);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(r3(addon.eval("return ns.FrameState('vgSlot')[CharacterMicroButton].__width") * MENU * 0.5), "a smaller button: its slot shrinks to its place in the row, re-sized by the re-fit").toBe(r3(27 * MENU * 0.5 - 4));
  expect(r3(addon.eval("return ns.FrameState('vgSlot')[EJMicroButton].__width") * MENU), "a button with no size yet gets a full slot").toBe(24);
});

it("bag and menu bar: line icons are 20 screen pixels on their slot, accent under the mouse", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  // The line icon's screen size and whether it is square and centered on the slot.
  const look = () => addon.eval(`local b = CharacterMicroButton local rel = b:GetEffectiveScale() / UIParent:GetEffectiveScale()
    return { ns.FrameState('vgGlyph')[b].__width * rel, ns.FrameState('vgGlyph')[b].__height == ns.FrameState('vgGlyph')[b].__width, ns.FrameState('vgGlyph')[b].__points.CENTER.rel == ns.FrameState('vgSlot')[b] }`);
  expect([r3(look()[0]), look()[1], look()[2]], "20 screen pixels, square, centered on the slot").toEqual([20, true, true]);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(r3(look()[0]), "a smaller menu: the icon stays inside its smaller slot").toBe(r3(27 * MENU * 0.5 - 4 - 4));
  // The line icon's current color.
  const color = () => addon.eval("return ns.FrameState('vgGlyph')[CharacterMicroButton].__vertexColor");
  expect(isTok(addon, color(), "text"), "text at rest").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(isTok(addon, color(), "accent"), "accent under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, color(), "disabled"), "the disabled tier while disabled, even under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, color(), "accent"), "enabled again under the mouse: accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(isTok(addon, color(), "text"), "text once the mouse leaves").toBe(true);
  expect(r3(addon.eval("return MainMenuBarBackpackButton:GetWidth() * BagsBar:GetEffectiveScale() / UIParent:GetEffectiveScale()")), "bag buttons sit one slot and a gap apart (28 screen pixels with their padding)").toBe(r3(45 * BAGS));
});

// TEST-ONLY bags: the backpack (16 slots, 4 free), bag 1 empty (no bag in it), bag 2 full,
// bag 3 a soul bag (20 slots, 5 free, family 256); their buttons, with the game's bag IDs.
const BAGS_ENV = `
  __space = { [0] = { 16, 4, 0 }, [1] = { 0, 0 }, [2] = { 10, 0, 0 }, [3] = { 20, 5, 256 }, [4] = { 0, 0 } }
  C_Container.GetContainerNumSlots = function(bag) return (__space[bag] or { 0 })[1] end
  C_Container.GetContainerNumFreeSlots = function(bag) local s = __space[bag] or { 0, 0 } return s[2], s[3] end
  for i = 0, 2 do
    local b = CreateFrame("Button", "CharacterBag" .. i .. "Slot", BagsBar) b:SetSize(45, 45)
    b.icon = b:CreateTexture() b.bag = i + 1
    function b:GetBagID() return self.bag end
  end
`;

it("bag and menu bar: each bag's slot shows how full it is, the backpack how many slots are free", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + BAGS_ENV);
  // A bag button's fill (shown, width in screen pixels, color), its icon's alpha and greyness, and the backpack's count and its size on screen.
  const bag = (name) => addon.eval(`local b = ${name} local f = ns.FrameState('vgFill')[b]
    return { f:IsShown(), (f.__width or 0) * ${BAGS}, f.__vertexColor or false, ns.FrameState('vgIcon')[b].__alpha, ns.FrameState('vgIcon')[b].__desaturated == true }`).map((v, i) => (i === 1 ? r3(v) : v));
  const pack = bag("MainMenuBarBackpackButton");
  expect([pack[0], pack[1], isTok(addon, pack[2], "accent")], "the backpack, 12 of 16 slots used: a fill three quarters of the 18-pixel icon wide, in the accent").toEqual([true, 13.5, true]);
  const empty = bag("CharacterBag0Slot");
  expect([empty[0], empty[3], empty[4]], "no bag in the slot: no fill, the game's empty-slot art faint and grey").toEqual([false, 0.35, true]);
  const full = bag("CharacterBag1Slot");
  expect([full[0], full[1], isTok(addon, full[2], "bad"), full[3], full[4]], "a full bag: a full-width fill in red").toEqual([true, 18, true, 1, false]);
  expect(r3(bag("CharacterBag2Slot")[1]), "a soul bag fills by its own slots (15 of 20)").toBe(13.5);
  // The backpack's free count and its font size on screen.
  const count = () => addon.eval("local fs = ns.GetModule('MenuStrip').free local _, size = fs:GetFont() return { fs:GetText(), size * MainMenuBarBackpackButton:GetEffectiveScale() / UIParent:GetEffectiveScale() }");
  expect([count()[0], r3(count()[1])], "the backpack: 4 free (the soul bag's free slots hold only shards), at the theme's badge size on screen (9, the one role under 10)").toEqual(["4", addon.eval('return ns.Theme.RoleSize("badge")')]);
  addon.eval("__space[0][2] = 0 __space[1] = { 12, 12, 0 }");
  addon.fire("BAG_UPDATE_DELAYED");
  expect([bag("MainMenuBarBackpackButton")[1], bag("CharacterBag0Slot").slice(0, 1), bag("CharacterBag0Slot")[3], count()[0]], "the bags change: the backpack's fill is full, a new empty bag shows in color with no fill, 12 free").toEqual([18, [false], 1, "12"]);
  const bare = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + "C_Container = nil");
  expect(bare.eval("return { ns.GetModule('MenuStrip').free:GetText(), ns.FrameState('vgFill')[MainMenuBarBackpackButton]:IsShown() }"), "a client that can't count bag slots shows no count and no fill").toEqual(["", false]);
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


it("game windows in the Vanguard look: framed windows, popups, breath bar, and windows that load later", () => {
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

it("game windows: one skin that fails is reported and the other windows, and those that load later, are still skinned", () => {
  expectErrors(/^window CharacterFrame: eval:\d+: TEST-ONLY skin failure$/);
  const addon = loggedIn(WINDOWS_ENV + `__window("CharacterFrame").NineSlice.GetRegions = function() error("TEST-ONLY skin failure") end`);
  expect(addon.eval("return ns.errors[1].text:find('window CharacterFrame', 1, true) ~= nil"), "the failure is reported under the window's name").toBe(true);
  addon.eval("MerchantFrame:Show()");
  expect(windowState(addon, "MerchantFrame"), "windows after it are still skinned").toMatchObject({ art: 0, panel: true });
  addon.eval('__window("PlayerSpellsFrame")');
  addon.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  expect(windowState(addon, "PlayerSpellsFrame"), "and windows that load later too").toMatchObject({ art: 0, panel: true });
  addon.eval("CharacterFrame:Show()");
  expect(addon.eval("return ns.errors[1].count"), "the failing skin is still tried on each show").toBe(2);
});

it("game windows: the quest and gossip windows are skinned only when Vanguard's quest dialog is off", () => {
  const env = WINDOWS_ENV + '__window("QuestFrame") __window("GossipFrame")';
  const on = loggedIn(env);
  on.eval("MerchantFrame:Show() QuestFrame:Show() GossipFrame:Show()");
  expect([windowState(on, "QuestFrame").panel, windowState(on, "GossipFrame").panel, windowState(on, "MerchantFrame").panel], "with the dialog on the game's never show: left alone, other windows skinned").toEqual([false, false, true]);
  expect(on.eval("return ns.FrameState('vgWindow')[QuestFrame] == nil and ns.FrameState('vgWindow')[GossipFrame] == nil"), "and not even hooked").toBe(true);
  for (const saved of ["VanguardDB.profiles = { Default = { QuestDialog = { dialog = false } } }", "VanguardDB.profiles = { Default = { modules = { QuestDialog = false } } }"]) {
    const off = loggedIn(env, { savedVariables: saved });
    off.eval("QuestFrame:Show() GossipFrame:Show()");
    expect([windowState(off, "QuestFrame"), windowState(off, "GossipFrame")], "with the dialog off they are the game's windows again, skinned").toMatchObject([{ art: 0, panel: true }, { art: 0, panel: true }]);
  }
});

it("game windows: switched off they stay the game's, and missing windows are fine", () => {
  const off = loggedIn(WINDOWS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false, popups = false, timers = false } } }" });
  off.eval("MerchantFrame:Show() StaticPopup1:Show()");
  expect([windowState(off, "MerchantFrame").art, windowState(off, "StaticPopup1").art].every((a) => a !== 0), "nothing is faded").toBe(true);
  const bare = loggedIn("");
  expect(bare.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), "a client without these windows loads cleanly").toBe("none");
  const plain = loggedIn(`local f = CreateFrame("Frame", "LootFrame", UIParent) f.ButtonContainer = { Buttons = { CreateFrame("Button", nil, f) } }
    t = CreateFrame("Frame", "MirrorTimer2", UIParent) CreateFrame("StatusBar", "MirrorTimer2StatusBar", t)`);
  expect(plain.eval("return { select('#', LootFrame.ButtonContainer.Buttons[1]:GetRegions()) > 0, MirrorTimer2StatusBar:GetStatusBarTexture() ~= nil }"), "a window with a button container, and a bar found by name").toEqual([true, true]);
});

it("game windows registry: a window added under a group is skinned, its group's switch keeps it the game's", () => {
  const reg = `__window("TestOnlySocialFrame") __window("TestOnlyLaterFrame")
    local GW = ns.GetModule("Windows")
    -- TEST-ONLY skin: the window skin, then the window's extra art faded.
    GW.Add("social", "framed", { "TestOnlySocialFrame" }, function(f) GW.Skin(f) GW.FadeParts(f, { "TestOnlyExtra" }) end)
    TestOnlySocialFrame.TestOnlyExtra = TestOnlySocialFrame:CreateTexture()
    GW.AddButtons("TestOnlySocialFrame", { "TestOnlyLooseButton" }) CreateFrame("Button", "TestOnlyLooseButton", TestOnlySocialFrame)`;
  const on = loggedIn(WINDOWS_ENV + reg);
  on.eval("TestOnlySocialFrame:Show()");
  expect(windowState(on, "TestOnlySocialFrame"), "skinned like any window").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(on.eval("return { TestOnlySocialFrame.TestOnlyExtra.__alpha, select('#', TestOnlyLooseButton:GetRegions()) > 0 }"), "its extra art faded and its loose button themed").toEqual([0, true]);
  on.eval(`ns.GetModule("Windows").Add("map", "onDemand", "TestOnly_Part", { "TestOnlyLaterFrame" })`);
  expect(windowState(on, "TestOnlyLaterFrame").panel, "a late registration for a window that already exists is skinned at once").toBe(true);
  on.eval(`ns.GetModule("Windows").Add("map", "onDemand", "TestOnly_Later", { "TestOnlyLoadsLater" }) __window("TestOnlyLoadsLater")`);
  expect(on.eval("return ns.FrameState('vgWindow')[TestOnlyLoadsLater] == nil"), "a window that doesn't exist yet waits").toBe(true);
  on.fire("ADDON_LOADED", "TestOnly_Later");
  expect(on.eval("return ns.FrameState('vgWindow')[TestOnlyLoadsLater] == true"), "until its part of the game loads").toBe(true);
  const off = loggedIn(WINDOWS_ENV + reg, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  off.eval("TestOnlySocialFrame:Show()");
  expect([windowState(off, "TestOnlySocialFrame").art !== 0, off.eval("return ns.FrameState('vgWindow')[TestOnlySocialFrame] == nil")], "with its group off: not hooked, its art left").toEqual([true, true]);
  expect(windowState(off, "MerchantFrame").panel, "other groups still are").toBe(true);
  expect(on.eval("return ns.GetModule('Windows').ON_DEMAND.Blizzard_EncounterJournal == nil"), "the encounter journal (never on Forever) is not listed").toBe(true);
  expect(on.eval("local GW = ns.GetModule('Windows') return { GW.REGISTERED.PlayerSpellsFrame.group, GW.REGISTERED.StaticPopup1.group, GW.REGISTERED.MirrorTimer1.group }"), "the first groups").toEqual(["windows", "popups", "timers"]);
});

it("game windows registry: parts and named art faded, missing ones skipped", () => {
  const addon = loggedIn(`TestOnlyNamedArt = UIParent:CreateTexture()`);
  const out = addon.eval(`
    local GW = ns.GetModule("Windows")
    local f = CreateFrame("Frame", nil, UIParent)
    f.Tex, f.Box = f:CreateTexture(), CreateFrame("Frame", nil, f)
    local inner = f.Box:CreateTexture()
    GW.FadeParts(f, { "Tex", "Box", "Missing" })
    GW.FadeNamed({ "TestOnlyNamedArt", "TestOnlyNoSuchArt" })
    return { f.Tex.__alpha, inner.__alpha, TestOnlyNamedArt.__alpha }`);
  expect(out).toEqual([0, 0, 0]);
});

it("the AFK screen: a dimmed screen and a card while you're away", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // The AFK screen and its card's texts.
  const afk = () => addon.eval(`local f = Vanguard_AfkScreen
    return { shown = f:IsShown(), name = f.name:GetText(), who = f.who:GetText(), where = f.where:GetText(), away = f.away:GetText(), clock = f.clock:GetText(), xp = f.xp:IsShown() and f.xp.__value, color = f.name.__textColor }`);
  expect(afk().shown, "hidden while you're here").toBe(false);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const card = afk();
  expect(card, "your name, level and class, where you are, the time away and the clock, your XP").toMatchObject({ shown: true, name: "<name>", who: "Level 42 Class", where: "TEST-ONLY Vale  ·  TEST-ONLY Hamlet", away: "Away 0:00", clock: "21:04", xp: 300 });
  expect(card.color.slice(0, 3), "the name in your class color").toEqual([0.25, 0.78, 0.92]);
  expect(addon.eval("return { Vanguard_AfkScreen.__strata, Vanguard_AfkScreen.dim.__vertexColor[4] }"), "over the whole UI, dimmed").toEqual(["FULLSCREEN_DIALOG", 0.75]);
  addon.eval("__wfgStub.advance(65, 1)");
  expect(afk().away, "the time away ticks").toBe("Away 1:05");
  expect(addon.eval("return ns.GetModule('AfkScreen').AwayText(3725)"), "past an hour").toBe("Away 1:02:05");
  addon.fire("PLAYER_FLAGS_CHANGED", "party1");
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(afk().shown, "back: it goes").toBe(false);
});

it("the AFK screen fades in over 0.4 s and, when a fight starts, out in 0.15 s", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + FAKE_FADES);
  addon.eval("__fakeFader(Vanguard_AfkScreen) __afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("local d = __fades[1].duration __finishFades() return d"), "away: the screen fades in slowly").toBe(0.4);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval("return __fades[1].duration"), "a fight puts it away quickly (0.2 s outside one)").toBe(0.15);
});

it("the AFK screen: clicks, keys and fights put it away; what the client can't say is left out", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // Marks you away (or back) and says so.
  const away = (on) => { addon.eval(`__afk = ${on}`); addon.fire("PLAYER_FLAGS_CHANGED", "player"); return addon.eval("return Vanguard_AfkScreen:IsShown()"); };
  expect(away(true), "away").toBe(true);
  addon.eval("Vanguard_AfkScreen.__scripts.OnMouseDown(Vanguard_AfkScreen)");
  expect([addon.eval("return Vanguard_AfkScreen:IsShown()"), away(true)], "a click puts it away, and it stays away while you are").toEqual([false, false]);
  away(false);
  expect(away(true), "next time you're away it's back").toBe(true);
  addon.eval("Vanguard_AfkScreen.__scripts.OnKeyDown(Vanguard_AfkScreen, 'ENTER')");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a key puts it away too").toBe(false);
  away(false);
  away(true);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect([addon.eval("return Vanguard_AfkScreen:IsShown()"), away(true)], "a fight puts it away; it doesn't open in one").toEqual([false, false]);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "after the fight, still away: it's back").toBe(true);
  addon.eval("__level = 60 UnitClass = function() return { __secret = true }, { __secret = true } end GetSubZoneText = function() return 'TEST-ONLY Vale' end ns.GetModule('AfkScreen').Paint()");
  const capped = addon.eval("local f = Vanguard_AfkScreen return { f.xp:IsShown(), f.who:GetText(), f.where:GetText(), f.name.__textColor }");
  expect(capped.slice(0, 3), "at the cap no XP bar; a hidden class is left out; no spot within the zone").toEqual([false, "Level 60", "TEST-ONLY Vale"]);
  expect(isTok(addon, capped[3], "accent"), "the name in the accent when the class is hidden").toBe(true);
  addon.eval("UnitIsAFK = function() return { __secret = true } end");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a hidden away flag counts as here").toBe(false);
  // The modules that read the unit calls this client lacks are off: a client without UnitClass breaks them, and the card is the point here.
  const needUnits = ["UnitFrames", "ComboPoints", "ClassBars", "SwingTimer", "InfoStrip", "Inventory"].map((name) => name + " = false").join(", ");
  const bare = loggedIn("UnitName = nil UnitLevel = nil UnitClass = nil UnitXP = nil", { savedVariables: `VanguardDB.profiles = { Default = { modules = { ${needUnits} } } }` });
  bare.eval("ns.GetModule('AfkScreen').Paint()");
  expect(bare.eval("local f = Vanguard_AfkScreen return { f.name:GetText(), f.who:GetText(), f.xp:IsShown() }"), "a client that can't say much gets a blank card, no errors").toEqual(["", "", false]);
});

it("the AFK screen's backdrop: your faction's passage under the card, in its heading font and crest color", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + CLICK_LUA + '__faction = "Alliance" UnitFactionGroup = function() return __faction end');
  // The passage's shown state, font file, opening words, attribution, color and wrap width.
  const passage = () => addon.eval(`local f = Vanguard_AfkScreen
    return { f.passage:IsShown(), f.passage.__font[1]:match("[^\\\\]+$"), f.passage:GetText():sub(1, 14), f.by:GetText(), f.passage.__textColor, f.passage:GetWidth() }`);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const ally = passage();
  expect(ally.slice(0, 4), "Alliance: Varian's letter, in Cinzel").toEqual([true, "Cinzel-SemiBold.ttf", "My son, a terr", "Varian Wrynn, to his son Anduin"]);
  expect([isTok(addon, ally[4], "allianceCrest"), ally[5]], "in Alliance gold, wrapped under the card").toEqual([true, 640]);
  expect(addon.eval("return Vanguard_AfkScreen.passage.__font[2] > ns.Theme.RoleSize('title')"), "a size over the title's").toBe(true);
  addon.eval('__faction = "Horde"');
  addon.fire("NEUTRAL_FACTION_SELECT_RESULT");
  const horde = passage();
  expect([horde[0], horde[1], horde[2], horde[3], isTok(addon, horde[4], "hordeCrest")], "Horde: the Blood Oath, in Metamorphous and Horde red").toEqual([true, "Metamorphous-Regular.ttf", "Lok'tar ogar! ", "The Blood Oath of the Horde", true]);
  addon.slash("");
  addon.eval('__click("Faction look: crest and heading font")');
  expect(addon.eval("local f = Vanguard_AfkScreen return { f.passage:IsShown(), f.by:IsShown() }"), "the faction look off: no passage").toEqual([false, false]);
  addon.eval('__click("Faction look: crest and heading font") __faction = "Neutral" ns.Theme.Refresh()');
  expect(addon.eval("return Vanguard_AfkScreen.passage:IsShown()"), "a neutral character: none").toBe(false);
});
