// chat-bags: the minimap cluster, chat windows and extras, bags and bank, the character pane, the
// minimap drawer and the auto-accept and auto-loot comforts, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, STRIP_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, borderOf, chatHas, isTok, loggedIn, setCombat } from "./helpers.mjs";
import { painted } from "./more-env.mjs";

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

it("chat", () => {
  const addon = loggedIn(UI_ENV);
  const c = addon.eval(`return { font = { ChatFrame1:GetFont() }, box = ns.Theme.PaintedCount(),
    tab1 = ChatFrame1Tab.Text.__textColor, tab2 = ChatFrame2Tab.Text.__textColor }`);
  expect(c.font[0] === "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-Medium.ttf" && c.font[1] === 12, `chat windows get the theme font at Medium, 12 (got ${JSON.stringify(c.font)})`).toBeTruthy();
  expect(isTok(addon, c.tab2, "accent") && isTok(addon, c.tab1, "text2"), "the selected window's tab is accent, others gray").toBeTruthy();
  addon.slash("accent ember");
  expect(isTok(addon, addon.eval("return ChatFrame2Tab.Text.__textColor"), "accent"), "tabs follow accent changes").toBeTruthy();
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
  expect([painted(addon), addon.eval("return __new.vgSkinned"), borderOf(addon, "__new") !== undefined], "a slot the game adds is skinned when it fills the slots, the old one is left alone").toEqual([[1, 0, 0], true, true]);
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
  const slot = (name) => addon.eval(`local l = Character${name}Slot.vgDurability return l and { l:IsShown(), l:GetText(), l.__textColor } or false`);
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
  expect(off.eval("return CharacterHeadSlot.vgDurability == nil"), "switched off, no labels").toBe(true);
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
  expect(addon.eval("return ChatFrameTempTestOnly.vgWatched"), "a whisper window that opens later is followed too").toBe(true);
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
