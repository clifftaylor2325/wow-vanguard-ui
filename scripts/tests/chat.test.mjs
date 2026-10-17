// chat: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, expectErrors, STRIP_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, INSIDES_LUA, borderOf, chatHas, isTok, later, loggedIn, setCombat, WINDOWS_ENV, windowState } from "./helpers.mjs";

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
// TEST-ONLY chat side buttons as the game builds them: round art on each (background, artwork and
// highlight), a state icon on the voice and text-to-speech buttons, counts on Quick Join, and the
// hidden alert flash on the scroll-to-bottom and voice channel buttons.
const CHAT_BUTTONS_ENV = `
  function __roundButton(name, parent)
    local b = CreateFrame("Button", name, parent)
    for _, layer in ipairs({ "BACKGROUND", "ARTWORK", "HIGHLIGHT" }) do
      local t = b:CreateTexture(nil, layer) t:SetTexture("TEST-ONLY-ART") b["__" .. layer] = t
    end
    return b
  end
  function __iconButton(name, parent)
    local b = __roundButton(name, parent)
    b.Icon = b:CreateTexture(nil, "OVERLAY") b.Icon:SetTexture("TEST-ONLY-ICON")
    return b
  end
  ChatFrame1.buttonFrame = CreateFrame("Frame", "ChatFrame1ButtonFrame", ChatFrame1)
  ChatFrame1.buttonFrame.minimizeButton = __roundButton("ChatFrame1ButtonFrameMinimizeButton", ChatFrame1.buttonFrame)
  ChatFrame1.ScrollToBottomButton = __roundButton(nil, ChatFrame1)
  ChatFrame1.ScrollToBottomButton.Flash = ChatFrame1.ScrollToBottomButton:CreateTexture(nil, "OVERLAY")
  ChatFrame1.ScrollToBottomButton.Flash:Hide()
  __roundButton("ChatFrameMenuButton", ChatFrame1ButtonFrame)
  local channel = __iconButton("ChatFrameChannelButton", UIParent)
  channel.Flash = channel:CreateTexture(nil, "OVERLAY") channel.Flash:Hide()
  __iconButton("ChatFrameToggleVoiceDeafenButton", UIParent)
  __iconButton("ChatFrameToggleVoiceMuteButton", UIParent)
  TextToSpeechButtonFrame = CreateFrame("Frame", "TextToSpeechButtonFrame", UIParent)
  TextToSpeechButtonFrame.Button = __iconButton("TextToSpeechButton", TextToSpeechButtonFrame)
  local quick = __roundButton("QuickJoinToastButton", UIParent)
  quick.FriendCount = quick:CreateFontString(nil, "ARTWORK") quick.FriendCount:SetFont("TEST-ONLY-FONT", 10, "") quick.FriendCount:SetText("3")
  quick.QueueCount = quick:CreateFontString(nil, "ARTWORK")
  quick.QueueButton = quick:CreateTexture(nil, "ARTWORK") quick.QueueButton:SetTexture("TEST-ONLY-ART") quick.QueueButton:SetAlpha(0)
  -- What a side button looks like: its round art's alphas, whether a tile shows on it, the theme glyph it carries, its own icon's alpha.
  function __buttonLook(b, white)
    local tile, glyph = false, false
    for _, r in ipairs({ b:GetRegions() }) do
      if r.__texture == white and r:GetAlpha() ~= 0 then tile = true end
      if r.__layer == "OVERLAY" and type(r.__texture) == "string" then glyph = r.__texture:match("Icons\\\\(%w+)$") or glyph end
    end
    return { b.__BACKGROUND:GetAlpha(), b.__ARTWORK:GetAlpha(), b.__HIGHLIGHT:GetAlpha(), tile, glyph, b.Icon and b.Icon:GetAlpha() or false }
  end
`;
it("chat side buttons sit on themed tiles: a glyph on the menu, minimize, scroll and Quick Join buttons; the voice buttons keep their own icon", () => {
  const addon = loggedIn(UI_ENV + CHAT_BUTTONS_ENV);
  // What the player sees on a side button: art alphas, tile, glyph, own icon alpha.
  const look = (b) => addon.eval(`return __buttonLook(${b}, ns.Theme.WHITE)`);
  expect(look("ChatFrameMenuButton"), "the chat menu: round art faded, a tile with the chat glyph").toEqual([0, 0, 0, true, "NavChat", false]);
  expect(look("ChatFrame1ButtonFrameMinimizeButton"), "the window's minimize box").toEqual([0, 0, 0, true, "Minimize", false]);
  expect(look("ChatFrame1.ScrollToBottomButton"), "the scroll-to-bottom arrow").toEqual([0, 0, 0, true, "Down", false]);
  expect(look("QuickJoinToastButton"), "Quick Join: the social glyph").toEqual([0, 0, 0, true, "Social", false]);
  expect(addon.eval("local c = QuickJoinToastButton.FriendCount return { c.__layer, c.__sublevel, select(2, c:GetFont()), c:GetText() }"), "its counts above the glyph, in the badge role, text untouched").toEqual(["OVERLAY", 7, 9, "3"]);
  addon.eval("QuickJoinToastButton.QueueButton:SetAlpha(1)");
  expect(addon.eval("local q = QuickJoinToastButton.QueueButton return { q:IsShown(), q:IsVisible() }"), "its queue art, which the game's toast animation raises to full alpha and leaves there while a toast is up, is hidden rather than faded, so raised it still shows nothing").toEqual([false, false]);
  for (const name of ["ChatFrameChannelButton", "ChatFrameToggleVoiceDeafenButton", "ChatFrameToggleVoiceMuteButton", "TextToSpeechButton"]) {
    expect(look(name), `${name}: round art faded, a resting tile behind its own icon`).toEqual([0, 0, 0, true, false, 1]);
  }
  expect(addon.eval("return { ChatFrameChannelButton.Flash:GetAlpha(), ChatFrame1.ScrollToBottomButton.Flash:GetAlpha() }"), "the game's alert flashes are faded, never hidden or shown (their animation drives the alpha)").toEqual([0, 0]);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("FCF_OpenTemporaryWindow('TEST-ONLY')");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "a new window re-skins the buttons without piling up").toBe(painted);
});
it("chat side buttons: module off leaves the game's art; a client without text to speech, Quick Join or a scroll arrow is fine", () => {
  const off = loggedIn(UI_ENV + CHAT_BUTTONS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Chat = false } } }" });
  expect(off.eval("return __buttonLook(ChatFrameMenuButton, ns.Theme.WHITE)"), "the chat menu keeps its round art, no tile, no glyph").toEqual([1, 1, 1, false, false, false]);
  expect(off.eval("return __buttonLook(ChatFrameChannelButton, ns.Theme.WHITE)"), "so does the voice channel button").toEqual([1, 1, 1, false, false, 1]);
  expect(off.eval("return QuickJoinToastButton.QueueButton:IsShown()"), "Quick Join's queue art is left shown for the game's animation").toBe(true);
  const bare = loggedIn(UI_ENV + CHAT_BUTTONS_ENV + "TextToSpeechButtonFrame = nil TextToSpeechButton = nil QuickJoinToastButton = nil ChatFrame1.ScrollToBottomButton = nil");
  expect(bare.eval("return __buttonLook(ChatFrameMenuButton, ns.Theme.WHITE)[5]"), "the buttons this client has are still skinned").toBe("NavChat");
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
  addon.eval('ns.Options.Show("chat")');
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
  const page = addon.eval("local c = ItemTextPageText.__colors return { c.P, c.H1, c.H2, c.H3, ItemTextMaterialTopLeft.__alpha }");
  expect([isTok(addon, page[0], "text"), isTok(addon, page[1], "text"), isTok(addon, page[2], "text"), isTok(addon, page[3], "text"), page[4]], "a book's page in light text, its headings too (not gold), its parchment faded").toEqual([true, true, true, true, 0]);
  addon.eval('AuctionHouseFrame = CreateFrame("Frame", "AuctionHouseFrame", UIParent)');
  addon.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  expect(borderOf(addon, "AuctionHouseFrame") !== undefined, "the auction house, when it loads").toBe(true);
  addon.eval("ItemTextPageText = { }");
  addon.eval('ItemTextFrame.__scripts.OnEvent(ItemTextFrame, "ITEM_TEXT_READY")');
  expect(addon.eval("return ItemTextMaterialTopLeft.__alpha"), "a page without colors to set is left alone").toBe(0);
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
it("game windows in the Vanguard look: framed windows, popups, breath bar, and windows that load later", () => {
  const addon = loggedIn(WINDOWS_ENV);
  addon.eval("MerchantFrame:Show()");
  const first = windowState(addon, "MerchantFrame");
  expect(first, "the game's art is faded, a panel is painted, its Inset is an inset panel, the title takes the title role").toMatchObject({ art: 0, nine: 0, portrait: 0, insetNine: 0, inset: true, panel: true, title: true });
  addon.eval("MerchantFrame:Hide() MerchantFrame:Show()");
  expect(windowState(addon, "MerchantFrame"), "showing it again keeps the panel and paints nothing new").toMatchObject({ panel: true, painted: first.painted });
  expect(windowState(addon, "StaticPopup1"), "popups too").toMatchObject({ art: 0, inset: true, panel: true });
  addon.eval('__window("TestOnlyNoInset").Inset = nil __window("TestOnlyBareInset").Inset = {} ns.GetModule("Windows").Add("windows", "framed", { "TestOnlyNoInset", "TestOnlyBareInset" })');
  expect(addon.eval("TestOnlyNoInset:Show() TestOnlyBareInset:Show() return { ns.Theme.PaintedCount() > 0, #ns.errors }"), "a window without an Inset, or with one that is no frame, is skinned all the same").toEqual([true, 0]);
  // Whether every breath bar in the container has the theme's bar texture (not the game's) and its frame art faded.
  const timers = () => addon.eval(`local ok = true
    for _, t in ipairs({ MirrorTimerContainer:GetChildren() }) do ok = ok and t.StatusBar:GetStatusBarTexture() ~= nil and t.StatusBar:GetStatusBarTexture().__texture ~= "TEST-ONLY-ART" and t.Border.__alpha == 0 end
    return ok`);
  expect(timers(), "the breath bars (the container's unnamed timers) take the theme's bar texture, their art faded").toBe(true);
  addon.eval("MirrorTimerContainer:SetupTimer(2)");
  expect(timers(), "the game sets a timer up with its own bar texture: Vanguard puts the theme's back").toBe(true);
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("MirrorTimerContainer:Hide() MirrorTimerContainer:Show() MirrorTimerContainer:SetupTimer(1)");
  expect([timers(), addon.eval("return ns.Theme.PaintedCount()")], "the container showing again (a timer starting) keeps the look and paints nothing new").toEqual([true, painted]);
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
  expect([windowState(off, "MerchantFrame").inset, windowState(off, "StaticPopup1").inset], "and no Inset is painted").toEqual([false, false]);
  expect(off.eval("local t = MirrorTimerContainer:GetChildren() return t.StatusBar:GetStatusBarTexture() == nil and t.Border.__alpha ~= 0"), "the breath bars keep the game's bar and art").toBe(true);
  const bare = loggedIn("");
  expect(bare.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), "a client without these windows loads cleanly").toBe("none");
  const plain = loggedIn(`local f = CreateFrame("Frame", "LootFrame", UIParent) f.ButtonContainer = { Buttons = { CreateFrame("Button", nil, f) } }`);
  expect(plain.eval("return select('#', LootFrame.ButtonContainer.Buttons[1]:GetRegions()) > 0"), "a window with a button container").toBe(true);
});
// TEST-ONLY loot window (ScrollingFlatPanelTemplate): the window, and its list as the game's ScrollBox hands out
// rows (LootFrameItemElementTemplate: an item card with its slot, name and rarity tag).
const LOOT_ROWS_ENV = `${WINDOWS_ENV}
  ScrollBoxListMixin = { Event = { OnAcquiredFrame = "OnAcquiredFrame" } }
  local f = __window("LootFrame")
  local box = { rows = {}, callbacks = {} }
  function box:RegisterCallback(event, fn, owner) self.callbacks[event] = { fn, owner } end
  function box:ForEachFrame(fn) for _, row in ipairs(self.rows) do fn(row) end end
  f.ScrollBox = box
  -- A row as the game acquires it: the card art, the item slot (icon, quality border, count), the texts.
  function __lootRow()
    local row = CreateFrame("Frame", nil, UIParent)
    for _, key in ipairs({ "NameFrame", "BorderFrame", "QualityStripe", "HighlightNameFrame", "IconQuestTexture" }) do row[key] = row:CreateTexture() end
    row.Text, row.QualityText = row:CreateFontString(nil, "ARTWORK"), row:CreateFontString(nil, "ARTWORK")
    row.Item = CreateFrame("Button", nil, row) row.Item.icon = row.Item:CreateTexture() row.Item.IconBorder = row.Item:CreateTexture()
    return row
  end
  table.insert(box.rows, __lootRow())
`;
// A loot row's look: its card art and hover stroke alphas, its slot in the bags' item look, its texts' fonts.
const lootRow = (addon, lua) => addon.eval(`local row = ${lua}
  return { row.NameFrame:GetAlpha(), row.BorderFrame:GetAlpha(), row.QualityStripe:GetAlpha(), row.HighlightNameFrame:GetAlpha(), row.IconQuestTexture:GetAlpha(),
    ns.FrameState("vgSkinned")[row.Item] == true, row.Text:GetFont() ~= nil, row.QualityText:GetFont() ~= nil }`);
it("R1.2 the loot window: its rows lose the game's card art and take the bags' item look, on show and as the list acquires them", () => {
  const addon = loggedIn(LOOT_ROWS_ENV);
  addon.eval("LootFrame:Show()");
  const first = windowState(addon, "LootFrame");
  expect(first, "the window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(lootRow(addon, "LootFrame.ScrollBox.rows[1]"), "the row that was there: card, stroke and rarity ribbon faded, the hover stroke and quest mark kept, the slot done, the texts in the theme font").toEqual([0, 0, 0, 1, 1, true, true, true]);
  addon.eval("local box = LootFrame.ScrollBox local cb = box.callbacks.OnAcquiredFrame box.later = __lootRow() cb[1](cb[2], box.later) cb[1](cb[2], nil)");
  expect(lootRow(addon, "LootFrame.ScrollBox.later"), "a row acquired later, the same; a missing row is skipped").toEqual([0, 0, 0, 1, 1, true, true, true]);
  const painted = windowState(addon, "LootFrame").painted;
  addon.eval("LootFrame:Hide() LootFrame:Show() local cb = LootFrame.ScrollBox.callbacks.OnAcquiredFrame cb[1](cb[2], LootFrame.ScrollBox.later)");
  expect([windowState(addon, "LootFrame").painted, addon.eval("local n = 0 for _ in pairs(LootFrame.ScrollBox.callbacks) do n = n + 1 end return n")], "a second show, and a row acquired again, paint nothing more; the list is watched once").toEqual([painted, 1]);
});
it("R1.2 the loot window: a row the skin cannot handle is reported, not raised into the game's list, and the rows after it are still done", () => {
  expectErrors(/^acquire loot row: eval:\d+: TEST-ONLY broken row$/);
  const addon = loggedIn(LOOT_ROWS_ENV);
  addon.eval("LootFrame:Show()");
  addon.eval(`local box = LootFrame.ScrollBox local cb = box.callbacks.OnAcquiredFrame
    local broken = __lootRow() broken.Text = { SetFont = function() error("TEST-ONLY broken row") end }
    box.after = __lootRow() cb[1](cb[2], broken) cb[1](cb[2], box.after)`);
  expect(lootRow(addon, "LootFrame.ScrollBox.after"), "the list went on: the next row is skinned").toEqual([0, 0, 0, 1, 1, true, true, true]);
});
it("R1.2 the loot window: the windows group off leaves its rows the game's; a loot window without a list, or a client without the list mixin, loads cleanly", () => {
  const off = loggedIn(LOOT_ROWS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.eval("LootFrame:Show()");
  expect([windowState(off, "LootFrame").art !== 0, lootRow(off, "LootFrame.ScrollBox.rows[1]"), off.eval("return LootFrame.ScrollBox.callbacks.OnAcquiredFrame == nil")], "not hooked, the row's art left").toEqual([true, [1, 1, 1, 1, 1, false, false, false], true]);
  // Any error Vanguard reported from the windows modules, or "none".
  const errors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'");
  const noList = loggedIn(`${WINDOWS_ENV} __window("LootFrame")`);
  noList.eval("LootFrame:Show()");
  const noMixin = loggedIn(LOOT_ROWS_ENV + " ScrollBoxListMixin = nil");
  noMixin.eval("LootFrame:Show()");
  const noEvent = loggedIn(LOOT_ROWS_ENV + " ScrollBoxListMixin.Event = nil");
  noEvent.eval("LootFrame:Show()");
  expect([noList, noMixin, noEvent].map(errors), "none of them reports an error").toEqual(["none", "none", "none"]);
  expect([windowState(noList, "LootFrame").panel, noMixin.eval("return LootFrame.ScrollBox.callbacks.OnAcquiredFrame == nil")], "the window is still skinned; no list events without the game's mixin").toEqual([true, true]);
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
  expect(on.eval("local GW = ns.GetModule('Windows') return { GW.REGISTERED.PlayerSpellsFrame.group, GW.REGISTERED.StaticPopup1.group, GW.REGISTERED.MirrorTimerContainer.group }"), "the first groups").toEqual(["windows", "popups", "timers"]);
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
it("R2.4 shared skin helpers: a glyph keeps its picture, a dropdown its arrow, a search box its magnifier; anything else is skipped", () => {
  const addon = loggedIn(`TestOnlyLocal = true`);
  const out = addon.eval(`
    local GW = ns.GetModule("Windows")
    local function art(f) local t = f:CreateTexture() t:SetTexture("TEST-ONLY-ART") return t end
    local glyph = CreateFrame("Button", nil, UIParent) glyph.up, glyph.off = art(glyph), art(glyph)
    glyph.GetNormalTexture, glyph.GetDisabledTexture = function() return glyph.up end, function() return glyph.off end
    local drop = CreateFrame("Button", nil, UIParent) drop.Arrow = art(drop)
    local search = CreateFrame("EditBox", nil, UIParent) search.searchIcon = art(search)
    GW.SkinGlyph(glyph) GW.SkinDropdown(drop) GW.SkinSearch(search)
    GW.SkinGlyph(nil) GW.SkinGlyph({}) GW.SkinDropdown("x") GW.SkinDropdown({}) GW.SkinSearch(false) GW.SkinSearch({}) GW.ShowTexture(nil) GW.ShowTexture({})
    return { glyph:GetNormalTexture():GetAlpha(), glyph:GetDisabledTexture():GetAlpha(), drop.Arrow:GetAlpha(), search.searchIcon:GetAlpha(),
      ns.Theme.PaintedCount() > 0, #ns.errors }`);
  expect(out, "pictures shown again after the theme faded the game's art; odd input skipped without an error").toEqual([1, 1, 1, 1, true, 0]);
  expect(addon.eval('return { type(ns.GetModule("Windows").DressChecks), ns.GetModule("Windows").CHECK_DEPTH }'), "the check-box helpers live with the shared ones").toEqual(["function", 5]);
});
// TEST-ONLY trade window (TradeFrame.xml): the frame and its buttons, six wells, seven item rows a side (each with a
// slot plate, a name plate and an item button; the seventh is the enchant row with an icon of its own), your money
// input line, the other player's money plate and figure, and the two column headings.
const TRADE_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  local f = __window("TradeFrame")
  for _, name in ipairs({ "TradeFrameTradeButton", "TradeFrameCancelButton" }) do CreateFrame("Button", name, f) end
  TradeFrameTradeButton.WarningIcon = __art(TradeFrameTradeButton)
  for _, name in ipairs(ns.GetModule("Windows").TRADE_INSETS) do __well(name, f) end
  for _, side in ipairs({ "TradePlayerItem", "TradeRecipientItem" }) do
    for i = 1, 7 do
      local row = CreateFrame("Frame", side .. i, f) row.SlotTexture = __art(row) row.Icon = __art(row)
      _G[side .. i .. "NameFrame"] = __art(row)
      __itemButton(side .. i .. "ItemButton", row)
    end
  end
  __moneyInput("TradePlayerInputMoneyFrame", f)
  TradeRecipientMoneyBg = __art(f)
  __moneyLine("TradeRecipientMoneyFrame", f)
  TradeFrameRecipientNameText, TradeFramePlayerNameText = f:CreateFontString(nil, "OVERLAY"), f:CreateFontString(nil, "OVERLAY")
  -- TEST-ONLY reader of the trade window's inside (see tradeState).
  function __tradeState()
    local wells, rows, skinned, icons = 0, 0, 0, 0
    for _, name in ipairs(ns.GetModule("Windows").TRADE_INSETS) do
      local w = _G[name]
      local faded = true for _, r in ipairs({ w:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" and r.__alpha ~= 0 then faded = false end end
      if faded and w.NineSlice.__alpha == 0 and __sunk(w) then wells = wells + 1 end
    end
    for _, side in ipairs({ "TradePlayerItem", "TradeRecipientItem" }) do
      for i = 1, 7 do
        local row = _G[side .. i]
        if row.SlotTexture.__alpha == 0 and _G[side .. i .. "NameFrame"].__alpha == 0 then rows = rows + 1 end
        if ns.FrameState("vgSkinned")[_G[side .. i .. "ItemButton"]] then skinned = skinned + 1 end
        if row.Icon.__alpha == 0 then icons = icons + 1 end
      end
    end
    local boxes, coins = 0, 0
    for _, key in ipairs({ "gold", "silver", "copper" }) do
      local box = TradePlayerInputMoneyFrame[key]
      if select(1, box:GetRegions()).__alpha == 0 then boxes = boxes + 1 end
      if box.texture.__alpha == 1 then coins = coins + 1 end
    end
    return { wells = wells, rows = rows, skinned = skinned, icons = icons, boxes = boxes, coins = coins, bg = TradeRecipientMoneyBg.__alpha,
      figure = __themed(TradeRecipientMoneyFrame.GoldButton.Text), heads = __looks(TradeFramePlayerNameText, "label", "text") and __looks(TradeFrameRecipientNameText, "label", "text"),
      warning = TradeFrameTradeButton.WarningIcon.__alpha, painted = ns.Theme.PaintedCount() }
  end
`;
// The trade window's inside: how many of the six wells are faded and sunk, how many rows have their plates faded
// and their item button skinned, whether the enchant icon stays, the money boxes and their coins, the recipient
// plate, the headings, and the Trade button's warning icon.
const tradeState = (addon) => addon.eval("return __tradeState()");
it("R2.8 the trade window: wells sunk, the fourteen rows' plates faded with item buttons in the bags' look, money boxes, headings and the warning icon", () => {
  const addon = loggedIn(TRADE_ENV);
  addon.eval("TradeFrame:Show()");
  const first = tradeState(addon);
  expect(first, "six wells, all rows done, no enchant icon faded, coins and the warning icon shown, plate faded, texts themed").toMatchObject({ wells: 6, rows: 14, skinned: 14, icons: 0, boxes: 3, coins: 3, bg: 0, figure: true, heads: true, warning: 1 });
  expect(windowState(addon, "TradeFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("TradeFrame:Hide() TradeFrame:Show()");
  expect(tradeState(addon).painted, "a second show paints nothing new").toBe(first.painted);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("R2.8 the trade window: the windows group off leaves it the game's; a trade window without its parts loads cleanly", () => {
  const off = loggedIn(TRADE_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.eval("TradeFrame:Show()");
  expect(tradeState(off), "nothing faded, painted or themed").toMatchObject({ wells: 0, rows: 0, skinned: 0, boxes: 0, heads: false });
  expect(off.eval("return TradeRecipientMoneyBg.__alpha ~= 0"), "the other player's money plate stays").toBe(true);
  const bare = loggedIn(`${WINDOWS_ENV}__window("TradeFrame")`);
  bare.eval("TradeFrame:Show()");
  expect([windowState(bare, "TradeFrame").panel, bare.eval("return #ns.errors")], "a bare window is skinned, no part missing is an error").toEqual([true, 0]);
  const odd = loggedIn(`${TRADE_ENV} TradeRecipientItem3 = {} TradeFrameTradeButton.WarningIcon = nil TradeRecipientMoneyFrame = {} TradePlayerInputMoneyFrame.gold = {} TradePlayerInputMoneyFrame.silver = nil`);
  odd.eval("TradeFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts (a row that is no frame, no warning icon, a bare money line) are skipped").toBe(0);
});
// TEST-ONLY mail window (MailFrame.xml): the frame and its buttons; the inbox (parchment, page count, seven rows
// each with plates, an item button and its slot plate, texts coloured as the game does for unread mail, the two
// page arrows with captions); the send page (four bar textures sharing one picture and a coin that does not, the
// letter's scroll frame with stationery and a dark body, the To and Subject boxes with a label and their typed
// text, the money input, radios, well, plate and lines, sixteen attachment slots of which three hold a picture).
const MAIL_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  PREV, NEXT, MAIL_TO_LABEL, MAIL_SUBJECT_LABEL = "TEST-ONLY Prev", "TEST-ONLY Next", "TEST-ONLY To:", "TEST-ONLY Subject:"
  local f = __window("MailFrame")
  for _, name in ipairs({ "OpenAllMail", "SendMailCancelButton", "SendMailMailButton" }) do CreateFrame("Button", name, f) end
  local inbox = CreateFrame("Frame", "InboxFrame", f)
  InboxFrameBg, InboxCurrentPage = __art(inbox), __text(inbox)
  for _, key in ipairs({ "PrevPageButton", "NextPageButton" }) do
    inbox[key] = CreateFrame("Button", nil, inbox) __art(inbox[key])
    __text(inbox[key], key == "PrevPageButton" and PREV or NEXT)
  end
  for i = 1, 7 do
    local row = CreateFrame("Frame", "MailItem" .. i, inbox) __art(row) __art(row)
    row.Button = __itemButton("MailItem" .. i .. "Button", row)
    _G["MailItem" .. i .. "ButtonSlot"] = __art(row.Button)
    for _, part in ipairs({ "Sender", "Subject" }) do
      _G["MailItem" .. i .. part] = __text(row) _G["MailItem" .. i .. part]:SetTextColor(1, 0.82, 0)
    end
  end
  local send = CreateFrame("Frame", "SendMailFrame", f)
  SendMailErrorCoin = send:CreateTexture("SendMailErrorCoin") SendMailErrorCoin:SetTexture("TEST-ONLY-COIN")
  SendMailHorizontalBarLeft, SendMailHorizontalBarLeft2 = __art(send, "SendMailHorizontalBarLeft"), __art(send, "SendMailHorizontalBarLeft2")
  send.rightHalves = { __art(send), __art(send) }
  SendMailScrollFrame = __well("SendMailScrollFrame", send)
  SendStationeryBackgroundLeft = __art(SendMailScrollFrame)
  SendMailBodyEditBox = CreateFrame("EditBox", "SendMailBodyEditBox", send) SendMailBodyEditBox:SetTextColor(0.2, 0.1, 0.05)
  for _, key in ipairs({ "Name", "Subject" }) do
    local box = CreateFrame("EditBox", "SendMail" .. key .. "EditBox", send) __art(box)
    __text(box, key == "Name" and MAIL_TO_LABEL or MAIL_SUBJECT_LABEL)
    box.typed = __text(box, "typed")
  end
  __moneyInput("SendMailMoney", send)
  for _, name in ipairs({ "SendMailSendMoneyButton", "SendMailCODButton" }) do __art(CreateFrame("CheckButton", name, send)) end
  __well("SendMailMoneyInset", send)
  CreateFrame("Frame", "SendMailMoneyBg", send)
  SendMailMoneyText = __text(send)
  __moneyLine("SendMailMoneyFrame", send) __moneyLine("SendMailCostMoneyFrame", send)
  for i = 1, 16 do
    local b = __itemButton("SendMailAttachment" .. i, send) __art(b)
    if i <= 3 then b.picture = b:CreateTexture() b.GetNormalTexture = function() return b.picture end end
  end
  -- TEST-ONLY reader of the mail window's inside (see mailState).
  function __mailState()
    local out, rows, items, slots, texts = {}, 0, 0, 0, 0
    for i = 1, 7 do
      local row = _G["MailItem" .. i]
      if __faded(row) then rows = rows + 1 end
      if ns.FrameState("vgSkinned")[row.Button] then items = items + 1 end
      if _G["MailItem" .. i .. "ButtonSlot"].__alpha == 0 then slots = slots + 1 end
      local s, j = _G["MailItem" .. i .. "Sender"], _G["MailItem" .. i .. "Subject"]
      if __themed(s) and __themed(j) and s.__textColor[2] == 0.82 and j.__textColor[2] == 0.82 then texts = texts + 1 end
    end
    local pagers = 0
    for _, key in ipairs({ "PrevPageButton", "NextPageButton" }) do
      local b = InboxFrame[key]
      if ns.Theme.ArrowParts(b) and __faded(b) and __themed(select(2, b:GetRegions())) then pagers = pagers + 1 end
    end
    local bars = 0
    for _, r in ipairs({ SendMailFrame:GetRegions() }) do if ns.Theme.DividerParts(r) then bars = bars + 1 end end
    local attached, pictures = 0, 0
    for i = 1, 16 do
      local b = _G["SendMailAttachment" .. i]
      if ns.FrameState("vgSkinned")[b] and __faded(b) then attached = attached + 1 end
      if b.picture and b.picture.__alpha == 1 then pictures = pictures + 1 end
    end
    local boxes = 0
    for _, name in ipairs({ "SendMailNameEditBox", "SendMailSubjectEditBox" }) do
      local box = _G[name]
      if __faded(box) and __themed(select(2, box:GetRegions())) and not __themed(box.typed) then boxes = boxes + 1 end
    end
    return { parchment = InboxFrameBg.__alpha == 0, rows = rows, items = items, slots = slots, texts = texts, pagers = pagers, page = __themed(InboxCurrentPage),
      bars = bars, coin = SendMailErrorCoin.__alpha ~= 0, attached = attached, pictures = pictures, boxes = boxes,
      letter = __faded(SendMailScrollFrame) and __sunk(SendMailScrollFrame) and SendStationeryBackgroundLeft.__alpha == 0, body = SendMailBodyEditBox.__textColor[1] > 0.5,
      radios = ns.Theme.PaintedCount() > 0 and __faded(SendMailCODButton) and __faded(SendMailSendMoneyButton), plate = SendMailMoneyBg.__alpha,
      well = __faded(SendMailMoneyInset) and __sunk(SendMailMoneyInset), label = __themed(SendMailMoneyText), lines = __themed(SendMailMoneyFrame.GoldButton.Text) and __themed(SendMailCostMoneyFrame.CopperButton.Text),
      coins = (SendMailMoney.gold.texture.__alpha == 1 and 1 or 0) + (SendMailMoney.silver.texture.__alpha == 1 and 1 or 0) + (SendMailMoney.copper.texture.__alpha == 1 and 1 or 0), painted = ns.Theme.PaintedCount() }
  end
`;
// The mail window's inside as __mailState reads it.
const mailState = (addon) => addon.eval("return __mailState()");
it("R2.9 the mail window: inbox rows and arrows, the send page's letter, boxes, money, bars and attachments in the theme", () => {
  const addon = loggedIn(MAIL_ENV);
  addon.eval("MailFrame:Show()");
  const first = mailState(addon);
  expect(first, "the inbox page and its seven rows, themed once the window shows").toMatchObject({ parchment: true, rows: 7, items: 7, slots: 7, texts: 7, pagers: 2, page: true });
  expect(first, "the send page: four bars as dividers (the coin is no bar), the letter on an inset with a light body, boxes, radios, the money well and lines").toMatchObject({ bars: 4, coin: true, letter: true, body: true, boxes: 2, radios: true, plate: 0, well: true, label: true, lines: true, coins: 3 });
  expect(first, "sixteen attachment slots in the item look, their pictures kept").toMatchObject({ attached: 16, pictures: 3 });
  expect(windowState(addon, "MailFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("MailFrame:Hide() MailFrame:Show()");
  expect(mailState(addon).painted, "a second show paints nothing new").toBe(first.painted);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("R2.9 the mail window: a picture that arrives later is kept; the windows group off leaves it the game's; a bare or odd mail window loads cleanly", () => {
  const addon = loggedIn(MAIL_ENV);
  addon.eval("MailFrame:Show() local b = SendMailAttachment5 b.picture = b:CreateTexture() b.GetNormalTexture = function() return b.picture end MailFrame:Hide() MailFrame:Show()");
  expect(addon.eval("return SendMailAttachment5.picture.__alpha"), "an item dropped on a slot after the first show keeps its picture on the next").toBe(1);
  const off = loggedIn(MAIL_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.eval("MailFrame:Show()");
  expect(mailState(off), "nothing faded or painted").toMatchObject({ parchment: false, rows: 0, items: 0, bars: 0, attached: 0, boxes: 0, pagers: 0, letter: false });
  const bare = loggedIn(`${WINDOWS_ENV}__window("MailFrame")`);
  bare.eval("MailFrame:Show()");
  expect([windowState(bare, "MailFrame").panel, bare.eval("return #ns.errors")], "a bare window is skinned without an error").toEqual([true, 0]);
  const odd = loggedIn(`${MAIL_ENV} MailItem3 = {} InboxFrame.PrevPageButton = {} SendMailHorizontalBarLeft = {} SendMailAttachment2 = {} SendMailNameEditBox = {} SendMailSendMoneyButton = {} SendMailScrollFrame = {}`);
  odd.eval("MailFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts (rows, arrows, bars, slots, boxes, radios that are no frames) are skipped").toBe(0);
  const noBars = loggedIn(`${MAIL_ENV} SendMailFrame = nil`);
  noBars.eval("MailFrame:Show()");
  expect(noBars.eval("return #ns.errors"), "no send page is no error").toBe(0);
});
// TEST-ONLY quest and gossip windows (QuestFrame.xml, GossipFrame.xml): the four quest pages with their parchment,
// the six push buttons, six required-item tiles (an icon, a name plate and a name) with the required money line,
// and the gossip window's greeting panel with its parchment and Goodbye button.
const QUEST_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  local q = __window("QuestFrame")
  for _, name in ipairs(ns.GetModule("Windows").QUEST_PANELS) do __art(CreateFrame("Frame", name, q)) __art(_G[name]) end
  for _, name in ipairs(ns.GetModule("Windows").EXTRA_BUTTONS.QuestFrame) do CreateFrame("Button", name, q) end
  for i = 1, 6 do
    local item = __itemButton("QuestProgressItem" .. i, QuestFrameProgressPanel) item.NameFrame = __art(item) item.Icon = item.icon
    _G["QuestProgressItem" .. i .. "Name"] = __text(item)
  end
  __moneyLine("QuestProgressRequiredMoneyFrame", QuestFrameProgressPanel)
  local g = __window("GossipFrame")
  g.GreetingPanel = CreateFrame("Frame", nil, g) __art(g.GreetingPanel) g.GreetingPanel.GoodbyeButton = CreateFrame("Button", nil, g.GreetingPanel)
  -- TEST-ONLY reader of the quest and gossip windows' inside (see questState).
  function __questState()
    local panels, items, buttons = 0, 0, 0
    for _, name in ipairs(ns.GetModule("Windows").QUEST_PANELS) do if __faded(_G[name]) then panels = panels + 1 end end
    for i = 1, 6 do
      local item = _G["QuestProgressItem" .. i]
      if item.NameFrame.__alpha == 0 and ns.FrameState("vgSkinned")[item] and __themed(_G["QuestProgressItem" .. i .. "Name"]) then items = items + 1 end
    end
    for _, name in ipairs(ns.GetModule("Windows").EXTRA_BUTTONS.QuestFrame) do if select("#", _G[name]:GetRegions()) > 0 then buttons = buttons + 1 end end
    return { panels = panels, items = items, buttons = buttons, money = __themed(QuestProgressRequiredMoneyFrame.GoldButton.Text),
      greeting = __faded(GossipFrame.GreetingPanel), goodbye = select("#", GossipFrame.GreetingPanel.GoodbyeButton:GetRegions()) > 0, painted = ns.Theme.PaintedCount() }
  end
`;
// The quest and gossip windows' inside as __questState reads it.
const questState = (addon) => addon.eval("return __questState()");
it("R2.10 the quest and gossip windows (quest dialog off): the four pages' parchment faded, required items and money, buttons, the Goodbye button", () => {
  const addon = loggedIn(QUEST_ENV, { savedVariables: "VanguardDB.profiles = { Default = { QuestDialog = { dialog = false } } }" });
  addon.eval("QuestFrame:Show() GossipFrame:Show()");
  const first = questState(addon);
  expect(first, "all pages faded, six required items in the item look, money in the theme font, the push buttons and Goodbye themed").toMatchObject({ panels: 4, items: 6, buttons: 6, money: true, greeting: true, goodbye: true });
  expect([windowState(addon, "QuestFrame").panel, windowState(addon, "GossipFrame").panel], "both windows skinned").toEqual([true, true]);
  addon.eval("QuestFrame:Hide() QuestFrame:Show() GossipFrame:Hide() GossipFrame:Show()");
  expect([questState(addon).painted, addon.eval("return #ns.errors")], "a second show paints nothing new and raises no error").toEqual([first.painted, 0]);
});
it("R2.10 the quest and gossip windows: Vanguard's quest dialog on leaves them the game's; bare or odd windows load cleanly", () => {
  const on = loggedIn(QUEST_ENV);
  on.eval("QuestFrame:Show() GossipFrame:Show()");
  expect(questState(on), "with the dialog on the game's windows are not touched").toMatchObject({ panels: 0, items: 0, buttons: 0, greeting: false, goodbye: false });
  const dialogOff = "VanguardDB.profiles = { Default = { QuestDialog = { dialog = false } } }";
  const bare = loggedIn(`${WINDOWS_ENV}__window("QuestFrame") __window("GossipFrame")`, { savedVariables: dialogOff });
  bare.eval("QuestFrame:Show() GossipFrame:Show()");
  expect([windowState(bare, "QuestFrame").panel, bare.eval("return #ns.errors")], "windows without their pages are skinned without an error").toEqual([true, 0]);
  const odd = loggedIn(`${QUEST_ENV} QuestFrameRewardPanel = {} QuestProgressItem2 = {} GossipFrame.GreetingPanel.GoodbyeButton = {} QuestProgressRequiredMoneyFrame = nil`, { savedVariables: dialogOff });
  odd.eval("QuestFrame:Show() GossipFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts are skipped").toBe(0);
});
// TEST-ONLY popup and ready check (GameDialog.xml, ReadyCheck.xml): StaticPopup1 with its dark tile (BG), its warning
// icon and progress fill (content), and every optional control; the ready check holder with its listener (tile,
// nine-slice, portrait, title, prompt, Yes and No).
const POPUP_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  local p = StaticPopup1
  p.BG = CreateFrame("Frame", nil, p) p.BG.Top, p.BG.Bottom = __art(p.BG), __art(p.BG)
  p.AlertIcon, p.ProgressBarFill = __art(p), __art(p)
  p.EditBox = CreateFrame("EditBox", nil, p) __art(p.EditBox) p.EditBox.NineSlice = CreateFrame("Frame", nil, p.EditBox)
  p.MoneyInputFrame, p.MoneyFrame = __moneyInput(nil, p), __moneyLine(nil, p)
  p.Dropdown = CreateFrame("Button", nil, p) p.Dropdown.Arrow = __art(p.Dropdown)
  p.ExtraButton = CreateFrame("Button", nil, p)
  p.ItemFrame = CreateFrame("Frame", nil, p) p.ItemFrame.NameFrame = __art(p.ItemFrame) p.ItemFrame.Item = __itemButton(nil, p.ItemFrame)
  local r = CreateFrame("Frame", "ReadyCheckFrame", UIParent) r:Hide()
  local l = CreateFrame("Frame", "ReadyCheckListenerFrame", r)
  l.Bg, l.NineSlice = __art(l), CreateFrame("Frame", nil, l)
  l.NineSlice:CreateTexture():SetTexture("TEST-ONLY-ART")
  l.TitleContainer = CreateFrame("Frame", nil, l) l.TitleContainer.TitleText = __text(l.TitleContainer)
  l.PortraitContainer = CreateFrame("Frame", nil, l) l.PortraitContainer.Portrait = __art(l.PortraitContainer)
  l.YesButton, l.NoButton = CreateFrame("Button", nil, l), CreateFrame("Button", nil, l)
  ReadyCheckFrameText = __text(l)
`;
it("R2.11 popups: the dark tile faded, the warning icon and progress fill kept, every optional control in the theme", () => {
  const addon = loggedIn(POPUP_ENV);
  addon.eval("StaticPopup1:Show()");
  // The popup's parts as the skin leaves them.
  const read = () => addon.eval(`local p = StaticPopup1
    return { tile = __faded(p.BG), icon = p.AlertIcon.__alpha, fill = p.ProgressBarFill.__alpha, box = __faded(p.EditBox) and p.EditBox.NineSlice.__alpha == 0,
      money = __themed(p.MoneyFrame.GoldButton.Text) and p.MoneyInputFrame.gold.texture.__alpha == 1, arrow = p.Dropdown.Arrow.__alpha,
      extra = select("#", p.ExtraButton:GetRegions()) > 0, item = p.ItemFrame.NameFrame.__alpha == 0 and ns.FrameState("vgSkinned")[p.ItemFrame.Item] == true,
      painted = ns.Theme.PaintedCount(), errors = #ns.errors }`);
  const first = read();
  expect(first, "tile faded, content kept, text box and money in the theme, the dropdown keeps its arrow, the extra button themed, the item in the item look").toMatchObject({ tile: true, icon: 1, fill: 1, box: true, money: true, arrow: 1, extra: true, item: true, errors: 0 });
  addon.eval("StaticPopup1:Hide() StaticPopup1:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
  const bare = loggedIn(`${WINDOWS_ENV}${INSIDES_LUA} StaticPopup1.EditBox = {} StaticPopup1.ItemFrame = {} StaticPopup1.Dropdown = {} StaticPopup1.BG = 1`);
  bare.eval("StaticPopup1:Show()");
  expect([windowState(bare, "StaticPopup1").panel, bare.eval("return #ns.errors")], "a bare popup, or odd controls, are skinned without an error").toEqual([true, 0]);
});
it("R2.11 the ready check: the listener's tile and border faded, the portrait kept, title, prompt and buttons in the theme", () => {
  const addon = loggedIn(POPUP_ENV);
  addon.eval("ReadyCheckFrame:Show()");
  // The ready check listener's parts as the skin leaves them.
  const read = () => addon.eval(`local l = ReadyCheckListenerFrame
    return { bg = l.Bg.__alpha, nine = l.NineSlice.__alpha, ninePiece = __faded(l.NineSlice), portrait = l.PortraitContainer.Portrait.__alpha, title = __titled(l.TitleContainer.TitleText),
      prompt = __themed(ReadyCheckFrameText), yes = select("#", l.YesButton:GetRegions()) > 0, no = select("#", l.NoButton:GetRegions()) > 0,
      panel = ns.Theme.PaintedCount(), errors = #ns.errors }`);
  const first = read();
  expect(first, "the listener's art faded, the portrait kept").toMatchObject({ bg: 0, nine: 0, ninePiece: true, title: true, prompt: true, yes: true, no: true, errors: 0 });
  expect(first.portrait, "the portrait of who called the check is content").not.toBe(0);
  addon.eval("ReadyCheckFrame:Hide() ReadyCheckFrame:Show()");
  expect(read().panel, "a second show paints nothing new").toBe(first.panel);
  const bare = loggedIn(`${WINDOWS_ENV} CreateFrame("Frame", "ReadyCheckFrame", UIParent):Hide()`);
  bare.eval("ReadyCheckFrame:Show()");
  const noTitle = loggedIn(`${POPUP_ENV} ReadyCheckListenerFrame.TitleContainer = nil ReadyCheckListenerFrame.NineSlice = nil`);
  noTitle.eval("ReadyCheckFrame:Show()");
  expect([bare, noTitle].map((a) => a.eval("return #ns.errors")), "a holder without its listener, or a listener without title or border, is no error").toEqual([0, 0]);
});
it("R2.11 the loot window's close button, the breath bars' caption and the guild bank's portrait", () => {
  const env = `${LOOT_ROWS_ENV}${INSIDES_LUA} LootFrame.ClosePanelButton = CreateFrame("Button", nil, LootFrame)
    __window("GuildBankFrame").Portrait = __art(GuildBankFrame) __art(GuildBankFrame)`;
  const addon = loggedIn(env);
  const off = loggedIn(env, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  expect([off, addon].map((a) => a.eval("return select('#', LootFrame.ClosePanelButton:GetRegions()) > 0")), "the loot window's ClosePanelButton is a theme close button (the game's, with the group off, is not)").toEqual([false, true]);
  addon.fire("ADDON_LOADED", "Blizzard_GuildBankUI");
  addon.eval("GuildBankFrame:Show()");
  expect(addon.eval("local out = {} for _, r in ipairs({ GuildBankFrame:GetRegions() }) do if r.__texture == 'TEST-ONLY-ART' then out[#out + 1] = r.__alpha end end return { GuildBankFrame.Portrait.__alpha, out[3] }"), "the guild bank's portrait is shown again, its other art faded").toEqual([1, 0]);
  expect(addon.eval(`local ok = true for _, t in ipairs({ MirrorTimerContainer:GetChildren() }) do
    local _, size = t.Text:GetFont() ok = ok and size == ns.Theme.RoleSize("barSmall") end return ok`), "each breath bar's caption takes the small bar text").toBe(true);
});
// TEST-ONLY group loot roll window, dressing room and book window (GroupLootFrame.xml, DressUpFrames.xml,
// ItemTextFrame.xml): the roll window's four buttons, countdown bar with its background, item icon with its quality
// ring; the dressing room's model with backdrops, buttons, dropdown and side panels; the book's page area,
// arrows with captions, reading bar and page count.
const INNER_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  PREV, NEXT = "TEST-ONLY Prev", "TEST-ONLY Next"
  local roll = __window("GroupLootFrame1")
  roll.LootButtonContainer = CreateFrame("Frame", nil, roll)
  for _, key in ipairs(ns.GetModule("Windows").LOOT_ROLLS) do roll.LootButtonContainer[key] = CreateFrame("Button", nil, roll.LootButtonContainer) end
  roll.Timer = CreateFrame("StatusBar", nil, roll) roll.Timer.Background = __art(roll.Timer) roll.Timer:SetStatusBarTexture("TEST-ONLY-ART")
  roll.IconFrame = __itemButton(nil, roll) roll.IconFrame.Border = __art(roll.IconFrame)
  local dress = __window("DressUpFrame")
  dress.ModelScene = __well(nil, dress)
  for _, name in ipairs({ "DressUpFrameCancelButton", "DressUpFrameResetButton" }) do CreateFrame("Button", name, dress) end
  dress.CustomSetDropdown = CreateFrame("Button", nil, dress) dress.CustomSetDropdown.Arrow = __art(dress.CustomSetDropdown)
  dress.CustomSetDropdown.SaveButton = CreateFrame("Button", nil, dress.CustomSetDropdown)
  dress.LinkButton, dress.ToggleCustomSetDetailsButton = CreateFrame("Button", nil, dress), CreateFrame("Button", nil, dress)
  dress.SetSelectionPanel, dress.CustomSetDetailsPanel = __well(nil, dress), __well(nil, dress)
  __window("ItemTextFrame")
  ItemTextScrollFrame, ItemTextCurrentPage = __well("ItemTextScrollFrame", ItemTextFrame), __text(ItemTextFrame)
  for _, name in ipairs({ "ItemTextPrevPageButton", "ItemTextNextPageButton" }) do local b = CreateFrame("Button", name, ItemTextFrame) __art(b) __text(b, name == "ItemTextPrevPageButton" and PREV or NEXT) end
  ItemTextStatusBar = CreateFrame("StatusBar", "ItemTextStatusBar", ItemTextFrame) __art(ItemTextStatusBar) ItemTextStatusBar:SetStatusBarTexture("TEST-ONLY-ART")
  -- Whether a bar is a flat track: its game art faded, the theme's bar texture on a visible fill, an inset panel behind.
  function __track(bar)
    local fill = bar:GetStatusBarTexture()
    return __faded(bar) and fill.__texture ~= "TEST-ONLY-ART" and fill.__alpha ~= 0 and __sunk(bar)
  end
  -- Whether a button has a theme control tile (it gained a texture).
  function __tiled(b) return select("#", b:GetRegions()) > 0 end
`;
it("R2.12 group loot rolls: the four buttons on tiles, the countdown a flat track, the item icon in the item look", () => {
  const addon = loggedIn(INNER_ENV);
  addon.eval("GroupLootFrame1:Show()");
  // The roll window's parts as the skin leaves them.
  const read = () => addon.eval(`local f = GroupLootFrame1 local keys = ns.GetModule("Windows").LOOT_ROLLS local tiles = 0
    for _, key in ipairs(keys) do if __tiled(f.LootButtonContainer[key]) then tiles = tiles + 1 end end
    return { tiles = tiles, track = __track(f.Timer), ring = f.IconFrame.Border.__alpha, item = ns.FrameState("vgSkinned")[f.IconFrame] == true, painted = ns.Theme.PaintedCount(), errors = #ns.errors }`);
  const first = read();
  expect(first, "four tiles, a flat countdown, the ring faded and the icon in the item look").toMatchObject({ tiles: 4, track: true, ring: 0, item: true, errors: 0 });
  addon.eval("GroupLootFrame1:Hide() GroupLootFrame1:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
  const odd = loggedIn(`${INNER_ENV} GroupLootFrame1.LootButtonContainer = nil GroupLootFrame1.Timer = {} GroupLootFrame1.IconFrame = 1`);
  odd.eval("GroupLootFrame1:Show()");
  expect(odd.eval("return #ns.errors"), "a roll window without its buttons, bar or icon is no error").toBe(0);
});
it("R2.12 the dressing room: the model an inset, the outfit controls and side panels in the theme", () => {
  const addon = loggedIn(INNER_ENV);
  addon.eval("DressUpFrame:Show()");
  // The dressing room's parts as the skin leaves them.
  const read = () => addon.eval(`local f = DressUpFrame
    return { model = __faded(f.ModelScene) and __sunk(f.ModelScene), panels = __sunk(f.SetSelectionPanel) and __faded(f.SetSelectionPanel) and __sunk(f.CustomSetDetailsPanel),
      buttons = __tiled(DressUpFrameCancelButton) and __tiled(DressUpFrameResetButton) and __tiled(f.LinkButton) and __tiled(f.CustomSetDropdown.SaveButton), dropdown = f.CustomSetDropdown.Arrow.__alpha,
      toggle = __tiled(f.ToggleCustomSetDetailsButton), painted = ns.Theme.PaintedCount(), errors = #ns.errors }`);
  const first = read();
  expect(first, "model and panels sunk, buttons themed, the dropdown keeps its arrow, the toggle on a control tile").toMatchObject({ model: true, panels: true, buttons: true, dropdown: 1, toggle: true, errors: 0 });
  addon.eval("DressUpFrame:Hide() DressUpFrame:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
  const odd = loggedIn(`${INNER_ENV} DressUpFrame.ModelScene = nil DressUpFrame.CustomSetDropdown = {} DressUpFrame.LinkButton = 1 DressUpFrame.SetSelectionPanel = {}`);
  odd.eval("DressUpFrame:Show()");
  expect(odd.eval("return #ns.errors"), "a dressing room without the outfit controls is no error").toBe(0);
});
it("R2.12 books and letters: the page area an inset, flat page arrows, a flat reading bar, the page count in small text", () => {
  const addon = loggedIn(INNER_ENV);
  addon.eval("ItemTextFrame:Show()");
  // The book window's parts as the skin leaves them.
  const read = () => addon.eval(`return { page = __sunk(ItemTextScrollFrame), arrows = ns.Theme.ArrowParts(ItemTextPrevPageButton) ~= nil and ns.Theme.ArrowParts(ItemTextNextPageButton) ~= nil,
    captions = __themed(select(2, ItemTextPrevPageButton:GetRegions())) and __themed(select(2, ItemTextNextPageButton:GetRegions())), bar = __track(ItemTextStatusBar), count = __themed(ItemTextCurrentPage),
    painted = ns.Theme.PaintedCount(), errors = #ns.errors }`);
  const first = read();
  expect(first, "all themed").toMatchObject({ page: true, arrows: true, captions: true, bar: true, count: true, errors: 0 });
  addon.eval("ItemTextFrame:Hide() ItemTextFrame:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
  const bare = loggedIn(`${WINDOWS_ENV} __window("ItemTextFrame")`);
  bare.eval("ItemTextFrame:Show()");
  expect([windowState(bare, "ItemTextFrame").panel, bare.eval("return #ns.errors")], "a book window without its parts is skinned without an error").toEqual([true, 0]);
});
// TEST-ONLY time manager (Blizzard_TimeManager.xml): the window with its globe, title line, three check boxes on it,
// the stopwatch frame with its nested check (a clock icon), the alarm's three dropdowns, message box and labels.
const TIME_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  TIMEMANAGER_TITLE = "TEST-ONLY Time"
  local f = __window("TimeManagerFrame")
  TimeManagerGlobe = __art(f) f.title = __text(f, TIMEMANAGER_TITLE)
  for _, name in ipairs({ "TimeManagerAlarmEnabledButton", "TimeManagerMilitaryTimeCheck", "TimeManagerLocalTimeCheck" }) do
    __art(CreateFrame("CheckButton", name, f)) _G[name .. "Text"] = __text(_G[name])
  end
  local sw = CreateFrame("Frame", "TimeManagerStopwatchFrame", f)
  TimeManagerStopwatchFrameText = __text(sw) __art(CreateFrame("CheckButton", "TimeManagerStopwatchCheck", sw))
  f.AlarmTimeFrame = CreateFrame("Frame", nil, f)
  for _, key in ipairs(ns.GetModule("Windows").TIME_DROPDOWNS) do
    f.AlarmTimeFrame[key] = CreateFrame("Button", nil, f.AlarmTimeFrame) f.AlarmTimeFrame[key].Arrow = __art(f.AlarmTimeFrame[key])
  end
  TimeManagerAlarmTimeLabel, TimeManagerAlarmMessageLabel = __text(f), __text(f)
  TimeManagerAlarmMessageEditBox = CreateFrame("EditBox", "TimeManagerAlarmMessageEditBox", f) __art(TimeManagerAlarmMessageEditBox)
  TimeManagerAlarmEnabledButtonText:SetTextColor(1, 0.82, 0)
`;
it("R2.13 the time manager: check boxes, dropdowns, the alarm message box, labels, the title line; the globe stays", () => {
  const addon = loggedIn(TIME_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_TimeManager");
  addon.eval("TimeManagerFrame:Show()");
  // The window's parts as the skin leaves them.
  const read = () => addon.eval(`local f = TimeManagerFrame local boxes, drops = 0, 0
    for _, name in ipairs({ "TimeManagerAlarmEnabledButton", "TimeManagerMilitaryTimeCheck", "TimeManagerLocalTimeCheck" }) do if __faded(_G[name]) then boxes = boxes + 1 end end
    for _, key in ipairs(ns.GetModule("Windows").TIME_DROPDOWNS) do if __faded(f.AlarmTimeFrame[key], f.AlarmTimeFrame[key].Arrow) and f.AlarmTimeFrame[key].Arrow.__alpha == 1 then drops = drops + 1 end end
    return { globe = TimeManagerGlobe.__alpha, boxes = boxes, drops = drops, stopwatch = not __faded(TimeManagerStopwatchCheck) and select("#", TimeManagerStopwatchCheck:GetRegions()) > 1,
      message = __faded(TimeManagerAlarmMessageEditBox), labels = __themed(TimeManagerAlarmTimeLabel) and __themed(TimeManagerAlarmMessageLabel) and __themed(TimeManagerStopwatchFrameText),
      enabledColour = TimeManagerAlarmEnabledButtonText.__textColor[2] ~= 0.82, title = __titled(f.title), painted = ns.Theme.PaintedCount(), errors = #ns.errors }`);
  const first = read();
  expect(first, "the globe is content and stays; three check boxes, three dropdowns with their arrows, the message box, the labels and the title in the theme; the stopwatch check keeps its icon on a tile").toMatchObject({ globe: 1, boxes: 3, drops: 3, stopwatch: true, message: true, labels: true, enabledColour: true, title: true, errors: 0 });
  addon.eval("TimeManagerFrame:Hide() TimeManagerFrame:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
  const bare = loggedIn(`${WINDOWS_ENV} __window("TimeManagerFrame")`);
  bare.fire("ADDON_LOADED", "Blizzard_TimeManager");
  bare.eval("TimeManagerFrame:Show()");
  expect([windowState(bare, "TimeManagerFrame").panel, bare.eval("return #ns.errors")], "a bare time manager is skinned without an error").toEqual([true, 0]);
  const odd = loggedIn(`${TIME_ENV} TimeManagerFrame.AlarmTimeFrame = 1 TimeManagerStopwatchCheck = 1 TimeManagerAlarmMessageEditBox = {}`);
  odd.fire("ADDON_LOADED", "Blizzard_TimeManager");
  odd.eval("TimeManagerFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts are skipped").toBe(0);
});
