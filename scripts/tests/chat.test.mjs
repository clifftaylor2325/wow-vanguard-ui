// chat: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { describe, expect, it } from "vitest";
import { luaValue } from "../lib/lua-emit.mjs";
import { CLICK_LUA, expectErrors, STRIP_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, INSIDES_LUA, borderOf, chatHas, isTok, later, loggedIn, setCombat, tok, WINDOWS_ENV, windowState } from "./helpers.mjs";

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
    M.zone.__noWrap, M.zone.__width, M.zone.__points.CENTER.rel == M.zoneButton, M.coords.__points.CENTER.rel == M.bottom }`);
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
it("a round minimap: masked to a disc, an outline on its rim, bands cut to the disc, buttons on the rim, no corner diamonds", () => {
  const M = "ns.GetModule('Minimap')";
  // A client logged in with this profile (a Lua table literal) saved.
  const shapeOf = (savedVariables) => loggedIn(UI_ENV + TIDY_ENV, { savedVariables: `VanguardDB.profiles = { Default = ${savedVariables} }` });
  expect(shapeOf("{}").eval("return GetMinimapShape()"), "by default the map stays square").toBe("SQUARE");
  expect(shapeOf('{ theme = { variant = "classic" }, Minimap = { shape = "square" } }').eval("return GetMinimapShape()"), "square says square even under Classic look").toBe("SQUARE");
  expect(shapeOf('{ theme = { variant = "classic" } }').eval("return GetMinimapShape()"), "following the theme, Classic look makes it round").toBe("ROUND");
  const addon = shapeOf('{ Minimap = { shape = "round" } }');
  const round = addon.eval(`local M = ${M} return { GetMinimapShape(), Minimap.__maskTexture, #M.corners, #M.bands, M.top.__masks and #M.top.__masks, M.rules[1].__masks and #M.rules[1].__masks,
    M.zone.__width, Vanguard_MinimapZone.__points.TOPLEFT.x, M.top:IsShown(), M.rules[1]:IsShown(), Vanguard_Minimap:GetHeight(), M.overlay:GetHeight(),
    M.zone.__points.CENTER.rel == M.zoneButton, Vanguard_MinimapZone.__points.TOPLEFT.rel == Vanguard_Minimap, Minimap.__points.BOTTOM.y }`);
  expect(round.slice(0, 6), "ROUND to other addons, the disc as the map's mask, no corner diamonds, the bands and rules masked to it, a zone name that fits the top chord").toEqual(["ROUND", expect.stringContaining("RoundDisc"), 0, 2, 1, 1]);
  expect(round.slice(6), "the zone name runs the map's whole width on a strip above the disc (the holder a band taller, the map and overlay on its bottom square), with no top band or rule").toEqual([180, 0, false, false, 202, 182, true, true, 1]);
  const rim = addon.eval("return { MinimapCluster.Tracking.__points.CENTER.x, MinimapCluster.Tracking.__points.CENTER.y, MinimapCluster.Tracking.__points.CENTER.rel == ns.GetModule('Minimap').overlay }");
  expect(rim[0] < -50 && rim[1] < -50 && rim[2], "the tracking button sits on the rim at the lower left, in the map's overlay").toBe(true);
  expect(Math.hypot(Math.abs(rim[0]) + 9, Math.abs(rim[1]) + 9) <= 88, "its outer corner stays inside the outline, so the whole button shows").toBe(true);
  expect(addon.eval("local ok = pcall(ns.Theme.Refresh) return ok"), "a theme refresh repaints the disc and ring").toBe(true);
});
it("a minimap that has the game's own wheel handler keeps it, and Vanguard adds none", () => {
  const addon = loggedIn("Minimap:SetScript('OnMouseWheel', function(self, d) self.__gameWheel = (self.__gameWheel or 0) + d end)");
  addon.eval("Minimap:GetScript('OnMouseWheel')(Minimap, 1)");
  expect(addon.eval("return { Minimap.__gameWheel, Minimap:GetZoom(), Minimap:IsMouseWheelEnabled() }"), "the game's handler runs once and Vanguard's doesn't zoom as well").toEqual([1, 0, true]);
});
// Lua that finds the Chat page's row captioned `cap` as `r`.
const chatRow = (cap) => `local r for _, p in ipairs(ns.Options.PAGES) do if p.key == "chat" then for _, row in ipairs(p.rows()) do if row[2] == "${cap}" then r = row end end end end`;
it("chat", () => {
  const addon = loggedIn(UI_ENV + "ChatFrame1.SetSpacing = function(_, s) __spacing = s end function FCFTab_UpdateColors() end");
  const c = addon.eval(`return { font = { ChatFrame1:GetFont() }, box = ns.Theme.PaintedCount() }`);
  expect(c.font[0] === "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-Medium.ttf" && c.font[1] === 12, `chat windows get the theme font at Medium, 12 (got ${JSON.stringify(c.font)})`).toBeTruthy();
  const shadow = addon.eval("return { ChatFrame1.__shadowOffset, ChatFrame1.__shadowColor, __spacing }");
  expect([shadow[0], isTok(addon, shadow[1], "textShadow"), shadow[2]], "chat lines carry the theme's (1, -1) drop shadow in textShadow and two units between lines").toEqual([[1, -1], true, 2]);
  addon.eval("FCFTab_UpdateColors(ChatFrame2Tab, true) FCFTab_UpdateColors(ChatFrame1Tab, false)");
  // Whether chat tab n is painted in the raised (selected) fill.
  const raised = (n) => addon.eval(`local bg for _, r in ipairs({ ChatFrame${n}Tab:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end end
    local c, r, g, b = bg and bg.__vertexColor, ns.Theme.RGB("raised") return c ~= nil and c[1] == r and c[2] == g and c[3] == b`);
  expect([raised(2), raised(1)], "the game names the selected tab as it colours it (never disabling one): the selected tab is raised, the others inset").toEqual([true, false]);
  // A flat chat tab's look: its fill's alpha, and whether its lit top line shows (and is borderHi).
  const flat = (n) => addon.eval(`local bg, lit for _, r in ipairs({ ChatFrame${n}Tab:GetRegions() }) do
    if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end
    if r.__layer == "BORDER" and r.__vertexColor and r:GetHeight() == ns.Theme.Pixel(ChatFrame${n}Tab) and r.__points.TOPLEFT and r.__points.TOPLEFT.y < 0 then lit = r end
  end return { bg:GetAlpha(), lit ~= nil and lit:IsShown(), lit and lit.__vertexColor }`);
  const [sel, other] = [flat(2), flat(1)];
  expect([sel[0], sel[1], isTok(addon, sel[2], "borderHi"), other[0], other[1]], "the selected tab keeps its fill and a one-pixel borderHi line along its top; the other has no fill or border, just its name on the bar").toEqual([1, true, true, 0, false]);
  expect(addon.eval("local p = ns.Theme.PaintedCount() return p > 0"), "tabs are the theme's tabs").toBe(true);
});
it("chat tabs: the alert glow is the accent colour and keeps the game's own alpha; a tab without a glow is fine", () => {
  const addon = loggedIn(UI_ENV + "ChatFrame1Tab.glow = ChatFrame1Tab:CreateTexture() ChatFrame1Tab.glow:SetAlpha(0.5) ChatFrame2Tab.Glow = nil");
  addon.eval("ns.GetModule('Chat').SkinAll()");
  expect(isTok(addon, addon.eval("local g = ChatFrame1Tab.glow return g.__vertexColor or { g:GetVertexColor() }"), "accent"), "the glow takes the accent").toBe(true);
  expect(addon.eval("return ChatFrame1Tab.glow:GetAlpha()"), "its alpha is the game's to animate").toBe(0.5);
  addon.slash("accent ember");
  expect(isTok(addon, addon.eval("local g = ChatFrame1Tab.glow return g.__vertexColor or { g:GetVertexColor() }"), "accent"), "and follows accent changes").toBe(true);
});
// How many shown pieces of corner art `art` a frame carries (four arcs on a rounded border).
const arcs = (addon, name, art = "CornerLine") => addon.eval(`local n = 0 for _, r in ipairs({ ${name}:GetRegions() }) do if tostring(r.__texture):find("${art}") and r:IsShown() then n = n + 1 end end return n`);
it("chat frame: one rounded panel round the text, the scroll column and a 24-tall tab bar, shown with the background; Copy and Find are glyph tiles at the bar's right end, in a fixed order", () => {
  const addon = loggedIn(UI_ENV);
  const F = "ns.GetModule('Chat').frames[ChatFrame1]";
  // The panel's reach past the window: top (the bar), right (the scroll column), bottom.
  const panel = () => addon.eval(`local f = ${F} return { f.panel:IsShown(), f.outline.__points.TOPLEFT.x, f.outline.__points.TOPLEFT.y, f.outline.__points.BOTTOMRIGHT.x, f.outline.__points.BOTTOMRIGHT.y, f.panel:GetParent() == f.outline, f.panel.__points.TOPLEFT.y, f.panel.__points.BOTTOMRIGHT.x }`);
  expect(panel(), "a gap round the window, the bar's height above it and the scroll column to its right; the painted panel under the outline, on the same footprint").toEqual([true, -4, 24, 28, -4, true, 24, 28]);
  expect(arcs(addon, F + ".panel"), "the panel's border is rounded, whatever the Corners setting").toBe(4);
  expect(arcs(addon, F + ".panel", "Shadow"), "no shadow under the panel by default").toBe(0);
  const soft = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { theme = { hudShadow = true } } }" });
  expect(soft.eval(`local n, h = 0, 99 for _, r in ipairs({ ${F}.panel:GetRegions() }) do if tostring(r.__texture):find("Shadow") then n, h = n + 1, math.min(h, r:GetHeight()) end end
    local px = ns.Theme.Pixel(${F}.panel) return { n, h == math.floor(6 / px + 0.5) * px }`), "Soft shadows under frames on: the eight-piece shadow ring, its corners 6 units in whole pixels").toEqual([8, true]);
  expect(addon.eval(`local f = ${F} local b = f.bar.__points.BOTTOMRIGHT return { f.bar:GetHeight(), f.bar:GetParent() == f.outline, b.rel == f.outline, b.relPoint, b.x, b.y, f.outline:GetFrameStrata() }`), "the bar is the panel's top band, 24 tall, under the outline (in the BACKGROUND strata), which stays when the painted panel goes").toEqual([24, true, true, "TOPRIGHT", 0, -24, "BACKGROUND"]);
  expect(addon.eval(`local f = ${F} return { f.rule:GetHeight() == ns.Theme.Pixel(f.bar), f.rule.__points.BOTTOMLEFT.rel == f.bar }`), "a one-pixel rule along the bar's bottom").toEqual([true, true]);
  expect(isTok(addon, addon.eval(`return ${F}.rule.__vertexColor`), "divider"), "in the divider colour").toBe(true);
  // A bar button's place and look: its anchor on the bar and x, whether it is a 20 x 20 tile, and its glyph.
  const tile = (ref) => addon.eval(`local b = ${ref} local p, rel, rp, x = b:GetPoint() local glyph
    for _, r in ipairs({ b:GetRegions() }) do if r.__layer == "OVERLAY" and type(r.__texture) == "string" then glyph = r.__texture:match("Icons\\\\(%w+)$") end end
    return { p, rel == ns.GetModule('Chat').frames[ChatFrame1].bar, rp, x, math.abs(b:GetWidth() - 20) < 1 and math.abs(b:GetHeight() - 20) < 1, glyph }`);
  expect(tile("ns.GetModule('ChatExtras').copyButton"), "Copy: a 20 x 20 glyph tile (the side buttons' control) a gap in from the bar's right end, two sheets on it").toEqual(["RIGHT", true, "RIGHT", -4, true, "Copy"]);
  expect(tile("ns.GetModule('ChatWindows').findButton"), "Find: the magnifier tile a tile and a gap left of Copy (the two take 48 units), whichever module asked first").toEqual(["RIGHT", true, "RIGHT", -28, true, "Search"]);
  addon.hover("ns.GetModule('ChatWindows').findButton");
  expect(addon.eval("return { GameTooltip:IsShown(), GameTooltip.__lines[1].text }"), "the mouse over a tile names it").toEqual([true, "Find"]);
  addon.hover(null);
  expect(addon.eval("return GameTooltip:IsShown()"), "and the name goes with the mouse").toBe(false);
  expect(addon.eval("local b = ns.GetModule('Chat').AddBarButton(ChatFrame1, 'TEST-ONLY', 'click test', function() end) local _, _, _, x = b:GetPoint() return x"), "a button no slot is listed for takes the slot after Find").toBe(-52);
  addon.eval("ns.GetModule('Chat').settings.background = false ns.GetModule('Chat').SkinAll()");
  expect([panel()[0], addon.eval(`return { ${F}.outline:IsShown(), ${F}.bar:IsVisible(), ns.GetModule('ChatExtras').copyButton:IsVisible() }`)], "background off: no painted panel; the outline, the bar and its tiles stay").toEqual([false, [true, true, true]]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("chat background off: a scrim on the panel's footprint, clear at the left edge, solid behind the lines, fading out over the right 96 units, in the panel colour at the Light strength", () => {
  const addon = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Chat = { background = false } } }" });
  const S = "ns.GetModule('Chat').frames[ChatFrame1].scrim";
  // The scrim: shown, on the panel's footprint, and its three textures' widths, gradients and colour.
  const scrim = () => addon.eval(`local s = ${S} local p = s.frame.__points return { s.frame:IsShown(), p.TOPLEFT.x, p.TOPLEFT.y, p.BOTTOMRIGHT.x, p.BOTTOMRIGHT.y,
    s.left:GetWidth(), s.left.__gradient, s.mid.__vertexColor, s.mid.__points.TOPLEFT.rel == s.left and s.mid.__points.BOTTOMRIGHT.rel == s.right, s.right:GetWidth(), s.right.__gradient }`);
  const [shown, x0, y0, x1, y1, leftW, leftG, mid, midBetween, rightW, rightG] = scrim();
  const panel = addon.eval("return { ns.Theme.RGB('panel') }").slice(0, 3);
  expect([shown, x0, y0, x1, y1], "shown with the background off, on the panel's footprint").toEqual([true, -4, 24, 28, -4]);
  expect([leftW, leftG], "the left ramp: 12 units, clear to the panel colour at 0.55").toEqual([12, ["HORIZONTAL", [...panel, 0], [...panel, 0.55]]]);
  expect([mid, midBetween], "the middle: the panel colour at 0.55 between the ramps").toEqual([[...panel, 0.55], true]);
  expect([rightW, rightG], "the right ramp: 96 units, the panel colour at 0.55 to clear").toEqual([96, ["HORIZONTAL", [...panel, 0.55], [...panel, 0]]]);
  addon.eval("ns.Theme.Settings().panel = { 0.1, 0.2, 0.3, 1 } ns.Theme.Refresh()");
  expect(scrim()[7], "the scrim follows the panel colour live").toEqual([0.1, 0.2, 0.3, 0.55]);
  addon.eval("ns.GetModule('Chat').settings.background = true ns.GetModule('Chat').SkinAll()");
  expect(addon.eval(`return { ${S}.frame:IsShown(), ns.GetModule('Chat').frames[ChatFrame1].panel:IsShown(), ${S}.frame:GetParent() == ns.GetModule('Chat').frames[ChatFrame1].outline }`), "background on: the panel is back and the scrim gone; the scrim rides under the outline").toEqual([false, true, true]);
});
// TEST-ONLY spies on the main window's line fade setters (ScrollingMessageFrameMixin), which the stub does not model.
const CHAT_FADE_ENV = `
  __fade = {}
  function ChatFrame1:SetFading(on) __fade.on = on end
  function ChatFrame1:SetTimeVisible(s) __fade.visible = s end
  function ChatFrame1:SetFadeDuration(s) __fade.duration = s end
`;
it("chat text fades: lines stay 60 s then fade over 0.6 s by default, Never and 10 s from the Chat page's row, 0.15 s in a fight, at once under Reduce motion", () => {
  const addon = loggedIn(UI_ENV + CHAT_FADE_ENV);
  // The main window's fade: on, seconds visible, fade seconds.
  const fade = () => addon.eval("return { __fade.on, __fade.visible, __fade.duration }");
  expect(fade(), "by default a line stays 60 s, then fades over 0.6 s").toEqual([true, 60, 0.6]);
  addon.eval("ns.Options.Show('chat')");
  expect(addon.texts("Chat text fades").length, "the Chat page has the row").toBe(1);
  // The row's getter and setter (its get/set pair), from the Chat page's rows under its Chat header.
  const row = (lua) => addon.eval(`${chatRow("Chat text fades")} return ${lua}`);
  expect(row("r[4]()"), "the row reads the setting").toBe(60);
  row("r[5](0)");
  expect([fade()[0], addon.eval("return VanguardDB.profiles.Default.Chat.lineFade")], "Never: no fade, saved").toEqual([false, 0]);
  row("r[5](10)");
  expect(fade(), "After 10 seconds").toEqual([true, 10, 0.6]);
  addon.world.combat(true);
  expect(fade()[2], "a fight starts: the fade is capped at 0.15 s").toBe(0.15);
  addon.world.combat(false);
  expect(fade()[2], "and goes back to 0.6 s after it").toBe(0.6);
  addon.eval("ns.Theme.Settings().reduceMotion = true ns.Theme.Refresh()");
  expect(fade()[2], "Reduce motion: a line goes at once").toBe(0);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
// TEST-ONLY chat edit boxes as the game has them: the main window's with a header the game colours from
// ChatTypeInfo in UpdateHeader (ChatFrameEditBoxMixin), the second window's with neither.
const CHAT_EDIT_ENV = `
  ChatTypeInfo = { SAY = { r = 1, g = 1, b = 1 }, GUILD = { r = 0.25, g = 1, b = 0.25 } }
  ChatFrame1EditBoxHeader = ChatFrame1EditBox:CreateFontString(nil, "ARTWORK")
  ChatFrame1EditBox:SetAttribute("chatType", "SAY")
  function ChatFrame1EditBox:UpdateHeader() local info = ChatTypeInfo[self:GetAttribute("chatType")] ChatFrame1EditBoxHeader:SetTextColor(info.r, info.g, info.b) end
  ChatFrame1EditBox:UpdateHeader()
`;
it("chat edit box: under the panel in the chat role, a rail in the channel's colour that follows the game's header, fading to full as it gains the typing and back as it loses it", () => {
  const addon = loggedIn(UI_ENV + CHAT_EDIT_ENV);
  const F = "ns.GetModule('Chat').frames[ChatFrame1]";
  expect(addon.eval(`local b = ChatFrame1EditBox local p = b.__points return { p.TOPLEFT.rel == ${F}.outline, p.TOPLEFT.relPoint, p.TOPLEFT.y, p.TOPRIGHT.relPoint, b:GetHeight(), (select(2, b:GetFont())) }`),
    "a gap under the panel, as tall as the tab bar, the panel's width, in the chat role (12)").toEqual([true, "BOTTOMLEFT", -4, "BOTTOMRIGHT", 24, 12]);
  // A window's edit box rail: its colour and width.
  const rail = (i) => addon.eval(`local r = ns.FrameState("vgRail")[ChatFrame${i}EditBox] return { r.__vertexColor, r:GetWidth() == 2 * ns.Theme.Pixel(ChatFrame${i}EditBox) }`);
  expect(rail(1), "the rail is two pixels wide in the header's colour (Say, white)").toEqual([[1, 1, 1, 1], true]);
  addon.eval('ChatFrame1EditBox:SetAttribute("chatType", "GUILD") ChatFrame1EditBox:UpdateHeader()');
  expect(rail(1)[0], "the game recolouring the header for /g recolours the rail").toEqual([0.25, 1, 0.25, 1]);
  expect(isTok(addon, rail(2)[0], "accent"), "a box with no header and no chat type: the accent").toBe(true);
  addon.eval('ChatFrame2EditBox:SetAttribute("chatType", "GUILD") ns.GetModule("Chat").SkinAll()');
  expect(rail(2)[0], "no header but a chat type: ChatTypeInfo's colour").toEqual([0.25, 1, 0.25, 1]);
  // The main edit box's alpha after the clock moves on by seconds.
  const alphaAfter = (seconds) => { addon.update(seconds); return Math.round(addon.eval("return ChatFrame1EditBox:GetAlpha()") * 100) / 100; };
  addon.eval("ChatFrame1EditBox:SetAlpha(1) ChatFrame1EditBox:GetScript('OnEditFocusGained')(ChatFrame1EditBox)");
  expect([alphaAfter(0), alphaAfter(0.1), alphaAfter(0.1)], "gaining the typing: from the game's 0.35 to 1 over 0.2 s").toEqual([0.35, 0.68, 1]);
  expect(addon.eval("return ns.ticker.vgJobs[ChatFrame1EditBox] == nil"), "the fade's job stops at the end").toBe(true);
  addon.eval("ChatFrame1EditBox:GetScript('OnEditFocusLost')(ChatFrame1EditBox)");
  expect([alphaAfter(0), alphaAfter(0.05)], "losing it: back to 0.35 over 0.05 s").toEqual([1, 0.35]);
  addon.world.combat(true);
  addon.eval("ChatFrame1EditBox:GetScript('OnEditFocusGained')(ChatFrame1EditBox)");
  expect([alphaAfter(0), alphaAfter(0.15)], "in a fight the fade in is capped at 0.15 s").toEqual([0.35, 1]);
  addon.world.combat(false);
  addon.eval("ns.Theme.Settings().reduceMotion = true ChatFrame1EditBox:GetScript('OnEditFocusLost')(ChatFrame1EditBox)");
  expect(alphaAfter(0), "Reduce motion: at once").toBe(0.35);
  addon.eval("ns.Theme.Settings().reduceMotion = false __wfgStub.setScreen(2560, 1440) ns.GetModule('Chat').Refresh()");
  expect(rail(1)[1], "after a scale change the rail is two pixels again").toBe(true);
  // The main edit box's anchors: what its top-left hangs from and where, and whether it has a top-right.
  const boxPoints = () => addon.eval(`local p = ChatFrame1EditBox.__points return { p.TOPLEFT and p.TOPLEFT.rel == ${F}.outline, p.TOPLEFT and p.TOPLEFT.relPoint, p.TOPLEFT and p.TOPLEFT.y, p.TOPRIGHT ~= nil }`);
  addon.eval("ChatFrame1EditBox:ClearAllPoints() ChatFrame1EditBox:SetPoint('TOPLEFT', ChatFrame1, 'BOTTOMLEFT', 0, -10)");
  expect(boxPoints(), "the game anchoring the box to the window's art: off the panel").toEqual([false, "BOTTOMLEFT", -10, false]);
  addon.eval("ns.GetModule('Chat').Refresh()");
  expect(boxPoints(), "a refresh puts it back under the panel").toEqual([true, "BOTTOMLEFT", -4, true]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("chat frame: with Chat switched off the Copy button keeps its old place over the window's top right", () => {
  const off = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Chat = false } } }" });
  expect(off.eval("local p, rel, rp, x, y = ns.GetModule('ChatExtras').copyButton:GetPoint() return { p, rel == ChatFrame1, rp, x, y }"), "over the window's top right edge").toEqual(["BOTTOMRIGHT", true, "TOPRIGHT", 0, 4]);
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
it("minimap: a free-for-all zone (arena) is named in the hostile colour, with a free-for-all territory line", () => {
  const addon = loggedIn(UI_ENV + `GetZonePVPInfo = nil C_PvP = { GetZonePVPInfo = function() return "arena" end }`);
  addon.eval("ns.GetModule('Minimap').UpdateZone() Vanguard_MinimapZone.__scripts.OnEnter(Vanguard_MinimapZone)");
  const tip = addon.eval("return GameTooltip.__lines");
  expect([isTok(addon, addon.eval("return ns.GetModule('Minimap').zone.__textColor"), "zoneHostile"), tip[tip.length - 1].text, isTok(addon, [tip[tip.length - 1].r, tip[tip.length - 1].g, tip[tip.length - 1].b], "zoneHostile")],
    "as the game's own minimap colours and names it").toEqual([true, "Free-for-all territory", true]);
});
it("minimap: Rotate Minimap's config update puts Vanguard's mask back, square or round", () => {
  const ROTATE = `MinimapCluster.UpdateMinimapConfig = function() Minimap:SetMaskTexture("ui-hud-minimap-frame-generic-mask") end`;
  const square = loggedIn(UI_ENV + TIDY_ENV + ROTATE);
  square.eval("MinimapCluster:UpdateMinimapConfig()");
  const round = loggedIn(UI_ENV + TIDY_ENV + ROTATE, { savedVariables: 'VanguardDB.profiles = { Default = { Minimap = { shape = "round" } } }' });
  round.eval("MinimapCluster:UpdateMinimapConfig()");
  expect([square.eval("return Minimap.__maskTexture"), round.eval("return Minimap.__maskTexture")], "the square stays square, the round map keeps Vanguard's disc")
    .toEqual([square.eval("return ns.Theme.WHITE"), expect.stringContaining("RoundDisc")]);
});
it("minimap: the faded zoom buttons take no mouse, so nothing invisible catches a click", () => {
  const addon = loggedIn(UI_ENV + 'Minimap.ZoomOut = CreateFrame("Button", nil, Minimap)');
  expect(addon.eval("return { Minimap.ZoomIn.__mouse, Minimap.ZoomOut.__mouse, Minimap.ZoomIn.__alpha, Minimap.ZoomIn:IsEnabled() }"), "faded, no mouse, still enabled for the wheel's clicks").toEqual([false, false, 0, true]);
});
it("minimap: the tracking and compartment slots fade the game's round art again whenever it puts it back", () => {
  const STATES = `for _, f in ipairs({ MinimapCluster.Tracking, AddonCompartmentFrame }) do
      f.AddTexture = f:CreateTexture(nil, "ARTWORK")
      f.OnButtonStateChanged = function(self) self.AddTexture:SetAlpha(0.1) end
    end`;
  const addon = loggedIn(UI_ENV + TIDY_ENV + STATES);
  addon.eval("MinimapCluster.Tracking:OnButtonStateChanged() AddonCompartmentFrame:OnButtonStateChanged()");
  expect(addon.eval("return { MinimapCluster.Tracking.AddTexture.__alpha, AddonCompartmentFrame.AddTexture.__alpha }"), "hover or press: the art stays faded").toEqual([0, 0]);
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
  -- What a side button looks like: its round art's alphas, whether its control tile shows (only under the mouse), the theme glyph it carries, its own icon's alpha.
  function __buttonLook(b, white)
    local tile, glyph = false, false
    for _, r in ipairs({ b:GetRegions() }) do
      if r.__texture == white and r:IsShown() then tile = true end
      if r.__layer == "OVERLAY" and type(r.__texture) == "string" then glyph = r.__texture:match("Icons\\\\(%w+)$") or glyph end
    end
    return { b.__BACKGROUND:GetAlpha(), b.__ARTWORK:GetAlpha(), b.__HIGHLIGHT:GetAlpha(), tile, glyph, b.Icon and b.Icon:GetAlpha() or false }
  end
`;
it("chat side buttons are window controls: a glyph on the menu, minimize, scroll and Quick Join buttons; the voice buttons keep their own icon", () => {
  const addon = loggedIn(UI_ENV + CHAT_BUTTONS_ENV);
  // What the player sees on a side button: art alphas, tile, glyph, own icon alpha.
  const look = (b) => addon.eval(`return __buttonLook(${b}, ns.Theme.Texture("ControlTile"))`);
  expect(look("ChatFrameMenuButton"), "the chat menu: round art faded, the chat glyph with no tile at rest").toEqual([0, 0, 0, false, "NavChat", false]);
  expect(look("ChatFrame1ButtonFrameMinimizeButton"), "the window's minimize box").toEqual([0, 0, 0, false, "Minimize", false]);
  expect(look("ChatFrame1.ScrollToBottomButton"), "the scroll-to-bottom arrow").toEqual([0, 0, 0, false, "Down", false]);
  expect(look("QuickJoinToastButton"), "Quick Join: the social glyph").toEqual([0, 0, 0, false, "Social", false]);
  expect(addon.eval("local c = QuickJoinToastButton.FriendCount return { c.__layer, c.__sublevel, select(2, c:GetFont()), c:GetText() }"), "its counts above the glyph, in the badge role, text untouched").toEqual(["OVERLAY", 7, 9, "3"]);
  addon.eval("QuickJoinToastButton.QueueButton:SetAlpha(1)");
  expect(addon.eval("local q = QuickJoinToastButton.QueueButton return { q:IsShown(), q:IsVisible() }"), "its queue art, which the game's toast animation raises to full alpha and leaves there while a toast is up, is hidden rather than faded, so raised it still shows nothing").toEqual([false, false]);
  for (const name of ["ChatFrameChannelButton", "ChatFrameToggleVoiceDeafenButton", "ChatFrameToggleVoiceMuteButton", "TextToSpeechButton"]) {
    expect(look(name), `${name}: round art faded, its own icon with no tile at rest`).toEqual([0, 0, 0, false, false, 1]);
  }
  expect(addon.eval("return { ChatFrameChannelButton.Flash:GetAlpha(), ChatFrame1.ScrollToBottomButton.Flash:GetAlpha() }"), "the game's alert flashes are faded, never hidden or shown (their animation drives the alpha)").toEqual([0, 0]);
  addon.eval("FCF_OpenTemporaryWindow('WHISPER', 'TEST-ONLY Name')");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("ns.GetModule('Chat').SkinAll()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "a new window re-skins the buttons, and skinning again piles nothing up").toBe(painted);
});
// TEST-ONLY stand-in for the game's flash animation on the scroll-to-bottom button (Flash.FlashAnim).
const CHAT_FLASH_ENV = `
  local anim = { playing = false, scripts = {} }
  function anim:HookScript(name, fn) self.scripts[name] = fn end
  function anim:IsPlaying() return self.playing end
  function anim:Play() self.playing = true self.scripts.OnPlay() end
  function anim:Stop(finished) self.playing = false self.scripts[finished and "OnFinished" or "OnStop"]() end
  ChatFrame1.ScrollToBottomButton.Flash.FlashAnim = anim
`;
it("chat scroll-to-bottom tile: a one-pixel accentText ring round it while the game flashes it, gone when the flash stops or finishes; a client without the animation gets no ring", () => {
  const addon = loggedIn(UI_ENV + CHAT_BUTTONS_ENV + CHAT_FLASH_ENV);
  // The ring: shown, its size, its border's colour (the theme's one-pixel border, set to accentText), and whether it has any fill.
  const ring = () => addon.eval(`local b = ChatFrame1.ScrollToBottomButton local r = ns.FrameState("vgRing")[b] local fill, edge, px = false, nil, ns.Theme.Pixel(r)
    for _, t in ipairs({ r:GetRegions() }) do
      if t.__layer == "BACKGROUND" and t:GetAlpha() > 0 then fill = true end
      if t.__vertexColor and (t:GetHeight() == px or t:GetWidth() == px) then edge = t end
    end
    return { r:IsShown(), r:GetParent() == b, math.abs(r:GetWidth() - 20) < 1, edge and edge.__vertexColor, fill, ns.Theme.Padding(r) }`);
  const rest = ring();
  expect([rest[0], rest[1], rest[2], isTok(addon, rest[3], "accentText"), rest[4], rest[5]], "at rest the ring is hidden: a tile-sized frame on the button with the theme's one-pixel border in accentText and no fill").toEqual([false, true, true, true, false, 0]);
  addon.eval("ChatFrame1.ScrollToBottomButton.Flash.FlashAnim:Play()");
  expect(ring()[0], "the game's flash starting shows it").toBe(true);
  addon.eval("ChatFrame1.ScrollToBottomButton.Flash.FlashAnim:Stop()");
  expect(ring()[0], "stopped: hidden").toBe(false);
  addon.eval("ChatFrame1.ScrollToBottomButton.Flash.FlashAnim:Play() ChatFrame1.ScrollToBottomButton.Flash.FlashAnim:Stop(true)");
  expect(ring()[0], "finished: hidden").toBe(false);
  addon.eval("ns.GetModule('Chat').SkinAll()");
  expect(addon.eval("return #ChatFrame1.ScrollToBottomButton.Flash.FlashAnim.scripts"), "skinned again, the hooks are not piled on").toBe(0);
  const playing = loggedIn(UI_ENV + CHAT_BUTTONS_ENV + CHAT_FLASH_ENV + "ChatFrame1.ScrollToBottomButton.Flash.FlashAnim.playing = true");
  expect(playing.eval("return ns.FrameState('vgRing')[ChatFrame1.ScrollToBottomButton]:IsShown()"), "a flash already playing when the tile is skinned shows the ring at once").toBe(true);
  const plain = loggedIn(UI_ENV + CHAT_BUTTONS_ENV);
  expect(plain.eval("return { ns.FrameState('vgRing')[ChatFrame1.ScrollToBottomButton]:IsShown(), #ns.errors }"), "no animation on this client: the ring stays hidden, no errors").toEqual([false, 0]);
});
it("chat side buttons stack down from the bar's top, a step apart, closing up over a hidden one; they follow the game re-siding and re-anchoring them", () => {
  const addon = loggedIn(UI_ENV + CHAT_BUTTONS_ENV + CHAT_DOCK_ENV + "ChatAlertFrame = { UpdateAnchors = function() QuickJoinToastButton:ClearAllPoints() QuickJoinToastButton:SetPoint('CENTER', UIParent) end }");
  // Each stacked button's centre: [relative point on the bar, x, y], in stacking order.
  const stack = () => addon.eval("local out = {} for _, name in ipairs(ns.GetModule('Chat').STACK) do local p = _G[name].__points.CENTER out[#out + 1] = p and { p.rel == ns.GetModule('Chat').frames[ChatFrame1].bar and p.relPoint or '?', p.x, p.y } or false end return out");
  const column = (xs, ys, side = "TOPLEFT") => ys.map((y, i) => [side, xs, y]);
  expect(stack(), "menu, Quick Join, voice channel, deafen, mute, text to speech: 18 left of the bar's corner, the first flush with its top, 28 apart").toEqual(column(-18, [-10, -38, -66, -94, -122, -150]));
  addon.eval("ChatFrameChannelButton:Hide()");
  expect(stack().slice(3), "a button the game hides leaves no gap").toEqual(column(-18, [-66, -94, -122]));
  addon.eval("ChatFrameChannelButton:Show()");
  expect(stack()[3], "and takes its place back when shown").toEqual(["TOPLEFT", -18, -94]);
  addon.eval("ChatAlertFrame:UpdateAnchors()");
  expect(stack()[1], "the game's alert container re-anchoring Quick Join is put right").toEqual(["TOPLEFT", -18, -38]);
  addon.eval("TextToSpeechButtonFrame:Hide() ChatFrameChannelButton:Hide() TextToSpeechButtonFrame:Show()");
  expect(stack()[5], "text to speech is stacked by the frame the game shows and hides (its button fills it): shown again with the voice channel gone, it closes up").toEqual(["TOPLEFT", -18, -122]);
  addon.eval("ChatFrameChannelButton:Show()");
  addon.eval("FCF_SetButtonSide(ChatFrame1, 'right')");
  expect(stack().slice(0, 2), "buttons on the right: mirrored to the panel's right edge").toEqual(column(18, [-10, -38], "TOPRIGHT"));
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("chat side buttons: module off leaves the game's art; a client without text to speech, Quick Join or a scroll arrow is fine", () => {
  const off = loggedIn(UI_ENV + CHAT_BUTTONS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Chat = false } } }" });
  expect(off.eval("return __buttonLook(ChatFrameMenuButton, ns.Theme.Texture('ControlTile'))"), "the chat menu keeps its round art, no tile, no glyph").toEqual([1, 1, 1, false, false, false]);
  expect(off.eval("return __buttonLook(ChatFrameChannelButton, ns.Theme.Texture('ControlTile'))"), "so does the voice channel button").toEqual([1, 1, 1, false, false, 1]);
  expect(off.eval("return QuickJoinToastButton.QueueButton:IsShown()"), "Quick Join's queue art is left shown for the game's animation").toBe(true);
  const bare = loggedIn(UI_ENV + CHAT_BUTTONS_ENV + "TextToSpeechButtonFrame = nil TextToSpeechButton = nil QuickJoinToastButton = nil ChatFrame1.ScrollToBottomButton = nil");
  expect(bare.eval("return __buttonLook(ChatFrameMenuButton, ns.Theme.WHITE)[5]"), "the buttons this client has are still skinned").toBe("NavChat");
});
it("chat buttons with the Chat module off: Find sits left of Copy over the window's top right, not on top of it", () => {
  const off = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Chat = false } } }" });
  // A button's anchor over the window (point, its point there, x of its right edge) and its width.
  const place = (button) => off.eval(`local p, rel, rp, x = ${button}:GetPoint(1) return { p, rel == ChatFrame1 and rp, x, ${button}:GetWidth() }`);
  const copy = place("ns.GetModule('ChatExtras').copyButton");
  const find = place("ns.GetModule('ChatWindows').findButton");
  expect([find[0], find[1]], "both hang from the window's top right").toEqual([copy[0], copy[1]]);
  expect(find[2] <= copy[2] - copy[3], "Find's right edge is left of Copy's left edge").toBe(true);
});
it("chat: a whisper window, ChatFrame11 as the game names it, is skinned when it opens", () => {
  const addon = loggedIn(UI_ENV);
  addon.eval("FCF_OpenTemporaryWindow('WHISPER', 'TEST-ONLY Name')");
  const parts = addon.eval("local CH = ns.GetModule('Chat') local p = CH.frames[ChatFrame11] return p and { p.outline:IsShown(), CH.frames[ChatFrame1].outline:IsShown() } or false");
  expect(parts, "its panel, shown like the main window's").toEqual([true, true]);
});
it("chat background: the panel's fill in the panel colour, three strengths, tabs fit their labels and are rounded and 20 tall, Copy sits in the bar", () => {
  const addon = loggedIn(UI_ENV);
  // The main window's fill: its alpha and colour token.
  const look = () => addon.eval("local f = ns.GetModule('Chat').frames[ChatFrame1] return { f.fill.alpha, f.fill.token, f.fill.round > 0 }");
  expect(look(), "Medium by default, the panel colour, rounded with the panel").toEqual([0.75, "panel", true]);
  addon.eval("ns.GetModule('Chat').settings.backdrop = 0.55 ns.GetModule('Chat').Refresh()");
  expect(look()[0], "Light").toBe(0.55);
  addon.eval("ns.GetModule('Chat').settings.backdrop = 0.123 ns.GetModule('Chat').Refresh()");
  expect(look()[0], "an unknown saved value falls back to Medium").toBe(0.75);
  expect(addon.eval("return ChatFrame1Tab.Text:GetStringWidth() + 24 == ChatFrame1Tab:GetWidth()"), "a tab is as wide as its label plus padding").toBe(true);
  expect(addon.eval("return { ChatFrame1Tab:GetHeight(), ChatFrame1Tab.Text.__points.CENTER ~= nil }"), "a tab is a control high, its label centred in it").toEqual([20, true]);
  expect([arcs(addon, "ChatFrame1Tab"), arcs(addon, "ChatFrame1EditBox")], "the tabs and the edit box are rounded like the panel").toEqual([4, 4]);
  expect(addon.eval("local p, rel = ns.GetModule('ChatExtras').copyButton:GetPoint() return p == 'RIGHT' and rel == ns.GetModule('Chat').frames[ChatFrame1].bar"), "the Copy button sits in the tab bar, at its right end").toBe(true);
  addon.eval("ChatFrame1.ScrollBar = CreateFrame('Frame', nil, ChatFrame1) ns.GetModule('Chat').SkinAll()");
  expect(addon.eval("return #ns.errors"), "a window with a scroll bar is skinned without errors").toBe(0);
  const off = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Chat = { background = false } } }" });
  expect(off.eval("local f = ns.GetModule('Chat').frames[ChatFrame1] return { f.panel:IsShown(), f.scrim.frame:IsShown() }"), "background off hides the panel and shows the scrim").toEqual([false, true]);
});
// TEST-ONLY chat dock, tab fade and floating-tab code as the game has it: the dock anchored to the main
// window's art, its layout colouring each docked tab's label gold and sizing it, the six tab alphas,
// FCFTab_UpdateAlpha setting a tab's alpha from them, and the game re-anchoring a floating tab and
// the side buttons.
const CHAT_DOCK_ENV = `
  GENERAL_CHAT_DOCK = CreateFrame("Frame", "GENERAL_CHAT_DOCK", UIParent)
  GENERAL_CHAT_DOCK.scrollFrame = CreateFrame("ScrollFrame", nil, GENERAL_CHAT_DOCK)
  GENERAL_CHAT_DOCK.scrollFrame:SetScrollChild(CreateFrame("Frame", nil, GENERAL_CHAT_DOCK.scrollFrame))
  GENERAL_CHAT_DOCK.scrollFrame:GetScrollChild():SetPoint("LEFT")
  GENERAL_CHAT_DOCK.DOCKED_CHAT_FRAMES = { ChatFrame1, ChatFrame2 }
  ChatFrame1.isStaticDocked, ChatFrame1.isDocked, ChatFrame2.isDocked = true, 1, 1
  __dockUpdates = 0
  -- TEST-ONLY: the game colouring a tab: its label gold.
  function FCFTab_UpdateColors(tab, selected) tab:GetFontString():SetTextColor(1, 0.82, 0) end
  -- TEST-ONLY: the game's dock layout: each docked tab coloured and sized for its label (70 wide here), a fixed tab on the dock's bottom-left, the rest a unit under the scroll child's centre.
  function FCFDock_UpdateTabs(dock, force)
    __dockUpdates = __dockUpdates + 1
    local child = dock.scrollFrame:GetScrollChild()
    for _, frame in ipairs(dock.DOCKED_CHAT_FRAMES) do
      local tab = _G[frame:GetName() .. "Tab"]
      tab:ClearAllPoints() FCFTab_UpdateColors(tab, frame == SELECTED_CHAT_FRAME) tab:SetWidth(70)
      if frame.isStaticDocked then tab:SetParent(dock) tab:SetPoint("BOTTOMLEFT", dock, "BOTTOMLEFT", 0, 0)
      else tab:SetParent(child) tab:SetPoint("LEFT", child, "LEFT", 0, -1) end
    end
  end
  function FCFDock_SetPrimary(dock, frame) dock:ClearAllPoints() dock:SetPoint("BOTTOMLEFT", frame, "TOPLEFT") end
  function FCF_SetTabPosition(frame, x) local tab = _G[frame:GetName() .. "Tab"] if tab then tab:ClearAllPoints() tab:SetPoint("BOTTOMLEFT", frame, "TOPLEFT", x + 2, 0) end end
  function FCF_SetButtonSide(frame, side) frame.buttonSide = side end
  CHAT_FRAME_TAB_SELECTED_MOUSEOVER_ALPHA, CHAT_FRAME_TAB_SELECTED_NOMOUSE_ALPHA = 1.0, 0.4
  CHAT_FRAME_TAB_ALERTING_MOUSEOVER_ALPHA, CHAT_FRAME_TAB_ALERTING_NOMOUSE_ALPHA = 1.0, 1.0
  CHAT_FRAME_TAB_NORMAL_MOUSEOVER_ALPHA, CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA = 0.6, 0.2
  __alphaCalls = 0
  function FCFTab_UpdateAlpha(frame) __alphaCalls = __alphaCalls + 1 _G[frame:GetName() .. "Tab"]:SetAlpha(CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA) end
`;
it("chat tabs stay visible: the game's six tab alphas are 1 while the switch is on and applied to every tab; off gives the game's own back; the Chat page has the switch", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA + CHAT_DOCK_ENV);
  // The six alphas, the second tab's alpha and how often the game's updater ran.
  const alphas = () => addon.eval("local out = {} for _, name in ipairs(ns.GetModule('Chat').TAB_ALPHAS) do out[#out + 1] = _G[name] end return { out, ChatFrame2Tab:GetAlpha(), __alphaCalls }");
  expect(alphas(), "on by default: all six are 1, each window's tab was updated").toEqual([[1, 1, 1, 1, 1, 1], 1, 2]);
  addon.eval("ns.GetModule('Chat').settings.tabsVisible = false ns.GetModule('Chat').ApplyTabAlpha()");
  expect(alphas(), "off: the game's own values and fade come back, floored at 0.6 (the bar is visible at rest, so 0.2 is too faint)").toEqual([[1, 0.6, 1, 1, 0.6, 0.6], 0.6, 4]);
  addon.eval('ns.Options.Show("chat") __click("Keep chat tabs visible")');
  expect([addon.eval("return VanguardDB.profiles.Default.Chat.tabsVisible"), alphas()[0][5]], "the Chat page's switch turns it back on at once").toEqual([true, 1]);
  const bare = loggedIn(UI_ENV);
  expect([bare.eval("return CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA"), bare.eval("return #ns.errors")], "a client without the fade code: the alphas are still set, nothing else runs").toEqual([1, 0]);
  bare.eval("ns.GetModule('Chat').settings.tabsVisible = false ns.GetModule('Chat').ApplyTabAlpha()");
  expect(bare.eval("return CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA"), "and off leaves it as it was (unset)").toBe(null);
});
it("chat bar hidden until hover (off by default): the bar goes after 4 s away, comes back with the mouse over the chat, stays while a tab alerts; the tabs follow through the game's alphas; off brings every bar back", () => {
  const addon = loggedIn(UI_ENV + CHAT_DOCK_ENV + "function FCF_StartAlertFlash() end function FCF_StopAlertFlash() end");
  const B = "ns.GetModule('Chat').frames[ChatFrame1].bar";
  // The bar: visible; the hover job: running; the six tab alphas.
  const state = () => addon.eval(`local out = {} for _, name in ipairs(ns.GetModule('Chat').TAB_ALPHAS) do out[#out + 1] = _G[name] end return { ${B}:IsVisible(), ns.ticker.vgJobs["chat bar hover"] ~= nil, out }`);
  expect(state(), "off by default: the bar stays, no job, the tabs at 1").toEqual([true, false, [1, 1, 1, 1, 1, 1]]);
  addon.eval(`${chatRow("Hide the tab bar until the mouse is over the chat")} r[4](true)`);
  expect(state(), "on (the Chat page's row under its Chat header): the job runs and the tabs show only under the mouse or alerting").toEqual([true, true, [1, 0, 1, 1, 1, 0]]);
  addon.advance(3.9, 0.1);
  expect(state()[0], "3.9 s away: still there").toBe(true);
  addon.advance(0.3, 0.1);
  expect(state()[0], "4 s away: gone").toBe(false);
  addon.eval("ChatFrame1.__mouseOver = true");
  addon.advance(0.1, 0.1);
  expect(state()[0], "the mouse over the chat brings it back").toBe(true);
  // The game flashes only a window that isn't shown: here the docked one behind the shown tab.
  addon.eval("ChatFrame1.isDocked, ChatFrame2.isDocked = 1, 1 ChatFrame2:Hide() ChatFrame1.__mouseOver = false FCF_StartAlertFlash(ChatFrame2)");
  addon.advance(4.5, 0.1);
  expect(state()[0], "a docked tab alerting keeps the shown window's bar, mouse or not").toBe(true);
  addon.eval("FCF_StopAlertFlash(ChatFrame2) FCF_StartAlertFlash(nil)");
  addon.advance(4.5, 0.1);
  expect(state()[0], "the alert over, it goes after the idle time again").toBe(false);
  addon.eval("ChatFrame1EditBox.__mouseOver = true");
  addon.advance(0.1, 0.1);
  expect(state()[0], "the mouse resting on the edit box under the panel brings it back").toBe(true);
  addon.eval("ChatFrame1EditBox.__mouseOver = false ChatFrame1EditBox.HasFocus = function() return true end");
  addon.advance(4.5, 0.1);
  expect(state()[0], "the typing in the box (HasFocus) keeps it, mouse or not").toBe(true);
  addon.eval("ChatFrame1EditBox.HasFocus = function() return false end");
  addon.advance(4.5, 0.1);
  expect(state()[0], "the box left, it goes after the idle time again").toBe(false);
  addon.eval(`${chatRow("Hide the tab bar until the mouse is over the chat")} r[4](false)`);
  expect(state(), "off again: the bar is back at once, the job gone, the tabs at 1").toEqual([true, false, [1, 1, 1, 1, 1, 1]]);
  expect(addon.eval("return { VanguardDB.profiles.Default.Chat.barHover, #ns.errors }"), "saved, no errors").toEqual([false, 0]);
});
it("chat dock: the docked tabs sit centred in the main window's bar, over the panel, and end before Find and Copy, after the game anchors the dock and lays its tabs out; a floating tab sits on its own window's bar", () => {
  const addon = loggedIn(UI_ENV + CHAT_DOCK_ENV);
  // The dock's anchors: the bar's top-left and bottom-left corners, right end at a button; the scroll child a tab high, a unit up.
  const dock = () => addon.eval("local d, F, child = GENERAL_CHAT_DOCK.__points, ns.GetModule('Chat').frames[ChatFrame1], GENERAL_CHAT_DOCK.scrollFrame:GetScrollChild() return { d.TOPLEFT.rel == F.bar, d.TOPLEFT.x, d.TOPLEFT.y, d.BOTTOMLEFT.rel == F.bar, d.BOTTOMLEFT.x, d.BOTTOMLEFT.y, d.RIGHT.rel == ns.GetModule('ChatWindows').findButton, d.RIGHT.relPoint, d.RIGHT.x, child.__points.LEFT.y, child:GetHeight() }");
  expect(dock(), "a tab high, two units inside the bar (tabs 20 tall in a 24 bar), ending a gap left of Find; the scroll child a tab high and a unit up").toEqual([true, 2, -2, true, 2, 2, true, "LEFT", -4, 1, 20]);
  addon.eval("FCFDock_SetPrimary(GENERAL_CHAT_DOCK, ChatFrame1)");
  expect(dock(), "the game anchoring it to the window's art again is put right").toEqual([true, 2, -2, true, 2, 2, true, "LEFT", -4, 1, 20]);
  expect(addon.eval("return ns.GetModule('Chat').frames[ChatFrame1].outline:GetFrameStrata()"), "the panel sits in the BACKGROUND strata, under the dock's tabs (low in LOW, where a frame a level under the window still covers them)").toBe("BACKGROUND");
  expect(addon.eval("return __dockUpdates"), "skinning asks the game to lay the dock out again, for the theme's font, on the next frame").toBe(0);
  addon.update(0);
  expect(addon.eval("return __dockUpdates"), "once").toBe(1);
  // Each docked tab after the game's layout: height, width, where its label is anchored, its parent, its label colour.
  const tabs = () => addon.eval("local out = {} for i = 1, 2 do local t = _G['ChatFrame' .. i .. 'Tab'] local p = t.__points.LEFT or t.__points.BOTTOMLEFT out[i] = { t:GetHeight(), t:GetWidth(), t.Text.__points.CENTER ~= nil, t:GetParent() == (i == 1 and GENERAL_CHAT_DOCK or GENERAL_CHAT_DOCK.scrollFrame:GetScrollChild()), p.y, { t.Text:GetTextColor() } } end return out");
  const textColours = [tok(addon, "text"), tok(addon, "text2")];
  expect(tabs().map((t) => t.slice(0, 5)), "the game's layout keeps the skin: a control high, the game's width (the label in the theme's font), the label centred, the fixed tab on the dock and the other in the scroll child a unit under its centre (level with the fixed one)").toEqual([[20, 70, true, true, 0], [20, 70, true, true, -1]]);
  expect(textColours, "the labels are back in the theme's text colours, not the gold the game's colouring paints").toEqual(expect.arrayContaining(tabs().map((t) => t[5])));
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("FCF_SetTabPosition(ChatFrame1, 0) FCF_SetTabPosition(ChatFrame2, 0)");
  expect(addon.eval("local t = ChatFrame2Tab.__points.BOTTOMLEFT return { __dockUpdates, t and t.rel == ChatFrame2 }"), "the game anchoring docked windows' tabs to the windows' art (a chat windows update) leaves them there for the frame").toEqual([1, true]);
  addon.update(0);
  expect(addon.eval("local t = ChatFrame2Tab.__points.LEFT return { __dockUpdates, t and t.rel == GENERAL_CHAT_DOCK.scrollFrame:GetScrollChild(), ns.Theme.PaintedCount() }"), "then the dock lays its tabs out once for both, so the tabs go back, painting nothing new").toEqual([2, true, painted]);
  addon.eval("ChatFrame2.isDocked = nil table.remove(GENERAL_CHAT_DOCK.DOCKED_CHAT_FRAMES, 2) FCF_SetTabPosition(ChatFrame2, 30)");
  addon.update(0);
  expect(addon.eval("local t = ChatFrame2Tab.__points.BOTTOMLEFT return { t.rel == ns.GetModule('Chat').frames[ChatFrame2].bar, t.x, t.y, __dockUpdates }"), "a floating tab: on its window's bar at the x the player dragged it to, no dock layout").toEqual([true, 32, 2, 2]);
  addon.eval("ns.GetModule('Chat').RefitTabs()");
  addon.update(0);
  expect(addon.eval("return { ChatFrame1Tab:GetWidth(), ChatFrame2Tab:GetWidth() ~= 70, __dockUpdates }"), "a refit (a font change) fits the floating tab to its label, leaves the docked one to the dock and has the dock lay out once").toEqual([70, true, 3]);
  expect(addon.eval("FCF_SetTabPosition({ GetName = function() return 'ChatFrame9' end }, 0) return #ns.errors"), "a window Vanguard hasn't dressed is left alone").toBe(0);
  addon.eval("FCF_OpenNewWindow('TEST-ONLY')");
  expect(addon.eval("return { ns.GetModule('Chat').frames[ChatFrame3] ~= nil, ns.FrameState('vgChatTab')[ChatFrame3Tab] == true, ChatFrame3Tab:GetHeight(), #ns.errors }"), "a window made from the game's menu gets the panel and the tab the skin").toEqual([true, true, 20, 0]);
  const skinned = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("ns.GetModule('Chat').SkinAll()");
  expect(addon.eval("return ns.Theme.PaintedCount()"), "skinning again paints nothing new").toBe(skinned);
  addon.eval("local t = CreateFrame('Button', 'TestOnlyChatTab', UIParent) t.Text = t:CreateFontString(nil, 'OVERLAY') t:SetFontString(t.Text) FCFTab_UpdateColors(t, true)");
  expect(addon.eval("return { ns.FrameState('vgChatTab')[TestOnlyChatTab] == true, TestOnlyChatTab:GetHeight(), #ns.errors }"), "the game colouring a tab Vanguard hasn't dressed gives it the skin").toEqual([true, 20, 0]);
  // The bar's end: Find's x on the bar, Copy's, and what the dock's right end hangs from (its point and x).
  const ends = () => addon.eval(`local CX, CW, d = ns.GetModule('ChatExtras'), ns.GetModule('ChatWindows'), GENERAL_CHAT_DOCK.__points.RIGHT
    local _, _, _, fx = CW.findButton:GetPoint() local _, _, _, cx = CX.copyButton:GetPoint()
    local at = d.rel == CW.findButton and "find" or d.rel == CX.copyButton and "copy" or d.rel == ns.GetModule('Chat').frames[ChatFrame1].bar and "bar" or "?"
    return { fx, cx, at, d.relPoint, d.x, CW.findButton:IsShown(), CX.copyButton:IsShown() }`);
  expect(ends(), "both tiles: Copy at the end, Find before it, the dock ending at Find").toEqual([-28, -4, "find", "LEFT", -4, true, true]);
  addon.eval("ns.GetModule('ChatExtras').settings.copy = false ns.GetModule('ChatExtras').ApplyCopy()");
  expect(ends(), "Copy hidden: Find moves to the end slot and the dock's right end follows it").toEqual([-4, -4, "find", "LEFT", -4, true, false]);
  addon.eval("ns.GetModule('ChatWindows').settings.find = false ns.GetModule('ChatWindows').ApplyFind()");
  expect(ends().slice(2), "both hidden: the dock runs to the bar's right end").toEqual(["bar", "RIGHT", -4, false, false]);
  addon.eval("ns.GetModule('ChatExtras').settings.copy = true ns.GetModule('ChatExtras').ApplyCopy()");
  expect(ends(), "Copy back alone: at the end, the dock ending at it").toEqual([-4, -4, "copy", "LEFT", -4, false, true]);
  addon.eval("ns.GetModule('ChatWindows').settings.find = true ns.GetModule('ChatWindows').ApplyFind()");
  expect(ends(), "Find back: left of Copy again, in slot order whichever came back first").toEqual([-28, -4, "find", "LEFT", -4, true, true]);
  // The game's dock layout re-anchoring the main edit box to the window's art: put back under the panel.
  addon.eval("ChatFrame1EditBox:ClearAllPoints() ChatFrame1EditBox:SetPoint('TOPLEFT', ChatFrame1, 'BOTTOMLEFT', 0, 0) FCFDock_UpdateTabs(GENERAL_CHAT_DOCK, true)");
  expect(addon.eval("local p = ChatFrame1EditBox.__points return { p.TOPLEFT.rel == ns.GetModule('Chat').frames[ChatFrame1].outline, p.TOPLEFT.relPoint, p.TOPLEFT.y, p.TOPRIGHT ~= nil, #ns.errors }"), "after the game's dock layout the edit box is back under the panel").toEqual([true, "BOTTOMLEFT", -4, true, 0]);
  const plain = loggedIn(UI_ENV + CHAT_DOCK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { ChatExtras = { copy = false }, ChatWindows = { find = false } } }" });
  expect(plain.eval("local d = GENERAL_CHAT_DOCK.__points return { d.RIGHT.rel == ns.GetModule('Chat').frames[ChatFrame1].bar, d.RIGHT.relPoint, d.RIGHT.x }"), "without Find and Copy the dock runs to the bar's right end").toEqual([true, "RIGHT", -4]);
});
// TEST-ONLY the Combat Log's filter strip as Blizzard_CombatLog sets it up when it loads: 24 tall, a child
// of the log's tab, its bottom 3 over the window's top and its right end at the scroll bar's edge, and the
// window's CombatLogQuickButtonFrame field; and the game's background layout, which the log's load and every
// dock update run for the log (it anchors the window's art, which the windows here lack).
const COMBAT_LOG_ENV = `
  __backgroundUpdates = 0
  function FloatingChatFrame_UpdateBackgroundAnchors(frame) __backgroundUpdates = __backgroundUpdates + 1 end
  function __combatLogStrip()
    local strip = CreateFrame("Frame", "CombatLogQuickButtonFrame_Custom", ChatFrame2Tab)
    strip:SetHeight(24)
    strip:SetPoint("BOTTOMLEFT", ChatFrame2, "TOPLEFT", 0, 3)
    strip:SetPoint("BOTTOMRIGHT", ChatFrame2, "TOPRIGHT", 8, 3)
    ChatFrame2.CombatLogQuickButtonFrame = strip
    FloatingChatFrame_UpdateBackgroundAnchors(ChatFrame2)
  end
`;

it("combat log: its panel, bar and scrim stand the filter strip's height higher, so its bar lines up with the dock's, and the strip is seated under the rule two units in from the panel's edges, as the strip loads and on every dock update; other windows keep the bar's height", () => {
  const addon = loggedIn(UI_ENV + CHAT_DOCK_ENV + COMBAT_LOG_ENV);
  // How far over a window's top its outline, panel and scrim sit (the TOPLEFT y of each).
  const tops = (frame) => addon.eval(`local F = ns.GetModule('Chat').frames[${frame}] return { F.outline.__points.TOPLEFT.y, F.panel.__points.TOPLEFT.y, F.scrim.frame.__points.TOPLEFT.y }`);
  expect(tops("ChatFrame2"), "before the log's filter strip loads, the bar's height (24)").toEqual([24, 24, 24]);
  addon.eval("__combatLogStrip()");
  expect(tops("ChatFrame2"), "the strip loaded (the game's background layout ran): the strip's 24 more").toEqual([48, 48, 48]);
  expect(tops("ChatFrame1"), "the main window keeps the bar's height").toEqual([24, 24, 24]);
  // The strip's anchors: its bottom corners on the window's top edge, the right one over the scroll column.
  const strip = () => addon.eval("local p = CombatLogQuickButtonFrame_Custom.__points return { p.BOTTOMLEFT.rel == ChatFrame2, p.BOTTOMLEFT.relPoint, p.BOTTOMLEFT.x, p.BOTTOMLEFT.y, p.BOTTOMRIGHT.relPoint, p.BOTTOMRIGHT.x, p.BOTTOMRIGHT.y }");
  expect(strip(), "the strip's bottom on the window's top (not 3 over it, into the rule), two units in from the panel's edges (over the scroll column on the right)").toEqual([true, "TOPLEFT", -2, 0, "TOPRIGHT", 26, 0]);
  addon.eval("CombatLogQuickButtonFrame_Custom:ClearAllPoints() CombatLogQuickButtonFrame_Custom:SetPoint('BOTTOMLEFT', ChatFrame2, 'TOPLEFT', 0, 3) FloatingChatFrame_UpdateBackgroundAnchors(ChatFrame2)");
  expect(strip(), "a dock update (the game's layout again) seats it again").toEqual([true, "TOPLEFT", -2, 0, "TOPRIGHT", 26, 0]);
  expect(addon.eval("FloatingChatFrame_UpdateBackgroundAnchors(ChatFrame1) FloatingChatFrame_UpdateBackgroundAnchors({ GetName = function() return 'ChatFrame9' end }) return { __backgroundUpdates, #ns.errors }"), "a window without a strip, or one Vanguard hasn't dressed, is left alone").toEqual([4, 0]);
  expect(tops("ChatFrame1")).toEqual([24, 24, 24]);
  const early = loggedIn(UI_ENV + CHAT_DOCK_ENV + COMBAT_LOG_ENV + "__combatLogStrip()");
  expect(early.eval("local F = ns.GetModule('Chat').frames[ChatFrame2] local p = CombatLogQuickButtonFrame_Custom.__points return { F.outline.__points.TOPLEFT.y, p.BOTTOMLEFT.y, p.BOTTOMRIGHT.x, #ns.errors }"), "a strip loaded before Vanguard dressed the window: the band and the seat from the start").toEqual([48, 0, 26, 0]);
});

it("chat window size: a window left at an earlier first size is set to the new one once, Larger and Largest scale the default, a size the player set is kept, and the first size follows the screen", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Chat = { sized = true, grown = true } } }" });
  // The chat window's width and height.
  const size = () => addon.eval("return { ChatFrame1:GetWidth(), ChatFrame1:GetHeight() }");
  addon.eval("ChatFrame1:SetSize(500, 154) ns.GetModule('Chat').settings.widened = false");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(size(), "0.7.0's first size becomes the new default (524 x 200 on a 1920-unit screen)").toEqual([524, 200]);
  expect(addon.eval("local s = VanguardDB.profiles.Default.Chat return { s.grown == nil, s.widened }"), "0.7.0's grown flag is dropped from the profile (ns.Migrate); widened is set in its place").toEqual([true, true]);
  addon.eval("ChatFrame1:SetSize(420, 140) ns.GetModule('Chat').settings.widened = false");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(size(), "so is 0.6's first size, once").toEqual([524, 200]);
  addon.eval("ChatFrame1:SetSize(600, 300)");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(size(), "a size the player set stays").toEqual([600, 300]);
  addon.eval("ns.GetModule('Chat').settings.windowScale = 1.5 ns.GetModule('Chat').ApplySize()");
  expect(size(), "Larger is one and a half times the default").toEqual([786, 300]);
  expect(addon.eval("local CH = ns.GetModule('Chat') return { { CH.DefaultSize(1707) }, { CH.DefaultSize(1365) }, { CH.DefaultSize(2560) }, { CH.DefaultSize(1600) } }"), "the first size fills the room left of the player frame, up to 524: 416 on a 1080p screen at setup's 80 % scale; under 1600 units it tucks under the frame at 372 x 144").toEqual([[416, 200], [372, 144], [524, 200], [372, 200]]);
  addon.eval("ns.GetModule('Chat').settings.windowScale = 'x' ns.GetModule('Chat').ApplySize() ChatFrame1 = nil ns.GetModule('Chat').ApplySize()");
});
it("chat is a mover: placed once, sized once, kept where the player put it", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV);
  // Chat's anchor point, offsets and size.
  const spot = () => addon.eval("local p = ChatFrame1.__points local k, v = next(p) return { k, v.x, v.y, ChatFrame1:GetWidth(), ChatFrame1:GetHeight() }");
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key .. '=' .. m.label end return out").includes("chat=Chat"), "chat is in the unlock list").toBe(true);
  expect(spot(), "first login: bottom-left, 40 in (room for the side buttons), 524 x 200").toEqual(["BOTTOMLEFT", 40, 20, 524, 200]);
  addon.eval('ns.SetMoverPoint("chat", "TOPLEFT", "TOPLEFT", 100, -50)');
  expect(spot().slice(0, 3), "dragging it in /vg unlock moves the window").toEqual(["TOPLEFT", 100, -50]);
  addon.eval('ChatFrame1:ClearAllPoints() ChatFrame1:SetPoint("CENTER")');
  expect(spot().slice(0, 3), "and the game's own layout moving it is undone").toEqual(["TOPLEFT", 100, -50]);
  addon.eval("ChatFrame1:SetSize(600, 300)");
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(spot().slice(3), "entering the world again keeps the player's size").toEqual([600, 300]);
  expect(addon.eval("return VanguardDB.profiles.Default.Chat.sized"), "the size is only set once ever").toBe(true);
  expect(addon.eval('return ns.ResetMovers("chat")'), "/vg reset chat puts it back").toBe(1);
  expect(spot().slice(0, 3), "at the bottom-left").toEqual(["BOTTOMLEFT", 40, 20]);
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
  ChatFrame_AddMessageEventFilter = function(event, fn) if not ns.GetModule("ChatFilter").registered then __filters[event] = fn end end
  EventRegistry = { RegisterCallback = function(self, event, fn) if not ns.GetModule("ChatFilter").registered then __linkCallback = fn end end }
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
  addon.eval("Enum.AddOnRestrictionType = { Chat = 5 } Enum.AddOnRestrictionState = { Inactive = 0 } C_RestrictedActions = { GetAddOnRestrictionState = function() return 2 end }");
  expect(addon.eval('return { select("#", __filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", "see www.example.test", "<name>")) }'), "while chat is restricted: left as it is").toEqual([1]);
  addon.eval("C_RestrictedActions = nil");
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
  const off = loggedIn(UI_ENV + CHAT_EXTRAS_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { ChatExtras = { links = false, copy = false } } }" });
  // How many values the say filter hands back for a line with an address: 1 (left as it is) or 3 (linked).
  const handed = () => off.eval('return select("#", __filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", "see www.example.test", "<name>"))');
  expect([handed(), off.eval("return ns.GetModule('ChatExtras').copyButton == nil")], "links and the Copy button switched off: the line is left as it is, and there is no button").toEqual([1, true]);
  off.eval('ns.Options.Show("chat") __click("Clickable web links in chat") __click("Copy button in the chat\'s tab bar")');
  expect([handed(), off.eval("return ns.GetModule('ChatExtras').copyButton:IsShown()")], "both switches apply at once: the next line is linked, and the button is made and shown").toEqual([3, true]);
  off.eval('__click("Copy button in the chat\'s tab bar")');
  expect(off.eval("return ns.GetModule('ChatExtras').copyButton:IsShown()"), "off again hides it").toBe(false);
  expect(off.eval("return #ns.errors"), "no errors").toBe(0);
});
it("chat extras: a hidden line never reaches the link filter's comparison, and a failing filter or click lets the line through", () => {
  const addon = loggedIn(UI_ENV + CHAT_EXTRAS_ENV);
  // The harness's secrets can't raise on ==, so prove the early return: LinkURLs is never reached for hidden or non-string text.
  addon.eval('__reached = 0 local CX = ns.GetModule("ChatExtras") local real = CX.LinkURLs CX.LinkURLs = function(...) __reached = __reached + 1 return real(...) end');
  const secret = addon.eval('local out = {} for _, event in ipairs(ns.GetModule("ChatExtras").EVENTS) do out[#out + 1] = select("#", __filters[event](nil, event, { __secret = true }, "<name>")) .. ":" .. tostring((__filters[event](nil, event, { __secret = true }, "<name>"))) end return out');
  expect(secret.every((r) => r === "1:false") && secret.length === 15, "every registered chat event: a hidden line returns a bare false").toBe(true);
  expect(addon.eval('return { select("#", __filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", nil)), select("#", __filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", 42)), __reached }'), "missing or non-string text: bare false, and the text is never read").toEqual([1, 1, 0]);
  addon.eval('ns.GetModule("ChatExtras").LinkURLs = function() error("TEST-ONLY link filter", 0) end');
  expect(addon.eval('return { select("#", __filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", "plain text")), (__filters.CHAT_MSG_SAY(nil, "CHAT_MSG_SAY", "plain text")) }'), "a filter that fails hands the game false: the line is not dropped").toEqual([1, false]);
  expect(() => addon.eval('ns.ShowText = function() error("TEST-ONLY click", 0) end __linkCallback(nil, "addon:Vanguard:url:https://example.test/a")'), "a failing link click does not reach the game's code").not.toThrow();
  expectErrors("chat filter links: TEST-ONLY link filter", "chat link click: TEST-ONLY click");
});

// TEST-ONLY chat windows as the game has them: TransformMessages rewrites the
// lines a window holds, the wheel can jump, and the game's own wheel handler moves three lines a
// tick whatever the modifiers (ScrollUtil.InitScrollingMessageFrameWithScrollBar: ScrollByAmount(value * 3)).
const CHAT_LINES_ENV = `
  CHAT_FRAMES = { "ChatFrame1", "ChatFrame2" }
  for i = 1, 2 do
    local f = _G["ChatFrame" .. i]
    f.TransformMessages = function(self, pred, transform)
      for n, m in ipairs(self.__messages or {}) do if pred(m) then self.__messages[n] = transform(m, 1, 1, 1) end end
    end
    f.ScrollToTop = function() __scrolled = "top" end
    f.ScrollToBottom = function() __scrolled = "bottom" end
    f.ScrollByAmount = function(_, n) __lines = (__lines or 0) + n end
    f.ScrollUp = function(self) self:ScrollByAmount(1) end
    f.ScrollDown = function(self) self:ScrollByAmount(-1) end
    f:SetScript("OnMouseWheel", function(self, value) self:ScrollByAmount(value * 3) end)
  end
`;
// The last line chat window i holds.
const lastLine = (addon, i = 1) => addon.eval(`local m = ChatFrame${i}.__messages return m[#m]`);
it("chat: short channel names by default, off live and in a profile that turned them off, never reading hidden lines", () => {
  const addon = loggedIn(UI_ENV + CHAT_LINES_ENV);
  const trade = "|Hchannel:channel:2|h[2. Trade - City]|h [TEST-ONLY Name]: wts";
  addon.eval(`ChatFrame1:AddMessage({ __secret = true }) ChatFrame1:AddMessage("${trade}")`);
  expect([lastLine(addon), addon.eval("return issecretvalue(ChatFrame1.__messages[#ChatFrame1.__messages - 1])")], "on by default: [2. Trade - City] becomes [T], the link kept; a hidden line stays as it was")
    .toEqual(["|Hchannel:channel:2|h[T]|h [TEST-ONLY Name]: wts", true]);
  addon.eval("ns.GetModule('ChatExtras').settings.shortChannels = false");
  addon.eval(`ChatFrame1:AddMessage("${trade}")`);
  expect(lastLine(addon), "switched off: the game's channel names").toBe(trade);
  const kept = loggedIn(UI_ENV + CHAT_LINES_ENV, { savedVariables: "VanguardDB.profiles = { Default = { ChatExtras = { shortChannels = false } } }" });
  kept.eval(`ChatFrame1:AddMessage("${trade}")`);
  expect(lastLine(kept), "a profile that turned it off before the default changed keeps the game's names").toBe(trade);
  addon.eval("ns.GetModule('ChatExtras').settings.shortChannels = true");
  // A line with one channel tag, as the shortener leaves it.
  const short = (label) => addon.eval(`return ns.GetModule('ChatExtras').ShortChannels("|Hchannel:X|h[${label}]|h hi")`);
  expect(["Guild", "Raid Leader", "5. LookingForGroup", "1. General - TEST-ONLY Vale", "6. testonly"].map(short), "the capitals of the name, or its first letter")
    .toEqual(["|Hchannel:X|h[G]|h hi", "|Hchannel:X|h[RL]|h hi", "|Hchannel:X|h[LFG]|h hi", "|Hchannel:X|h[G]|h hi", "|Hchannel:X|h[t]|h hi"]);
  expect(addon.eval('ChatFrame2:AddMessage("plain TEST-ONLY line") local m = ChatFrame2.__messages return m[#m]'), "a line without a channel tag is left alone").toBe("plain TEST-ONLY line");
  addon.eval('FCF_OpenTemporaryWindow("WHISPER", "TestOnly")');
  expect(addon.eval("return ns.FrameState('vgWatched')[ChatFrame11]"), "a whisper window that opens later is followed too").toBe(true);
});
it("chat: the wheel adds one line to the game's three, Shift too, Ctrl + wheel jumps to the top or bottom", () => {
  const addon = loggedIn(UI_ENV + CHAT_LINES_ENV);
  // The wheel over the main chat window, then where it jumped (or "none") and the lines it scrolled in all, the game's with Vanguard's.
  const wheel = (delta) => { addon.eval("__scrolled, __lines = nil, 0"); addon.wheel("ChatFrame1", delta); return [addon.eval('return __scrolled or "none"'), addon.eval("return __lines")]; };
  expect([wheel(1), wheel(-1)], "no modifier: no jump, four lines up or down in all (the game's three and one)").toEqual([["none", 4], ["none", -4]]);
  addon.keys({ shift: true });
  expect(wheel(1), "Shift: the game reads no modifier, so it is a plain tick").toEqual(["none", 4]);
  addon.keys({ shift: false, ctrl: true });
  expect([wheel(1), wheel(-1)], "with Ctrl: up to the top, down to the bottom, nothing added to the game's lines").toEqual([["top", 3], ["bottom", -3]]);
  addon.eval("ns.GetModule('ChatExtras').settings.ctrlScroll = false");
  expect(wheel(1), "switched off, nothing jumps").toEqual(["none", 3]);
  addon.keys({ ctrl: false });
  expect(wheel(1)[1], "and the plain tick still adds its line").toBe(4);
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
it("minimap drawer: its Modules row says it needs the Minimap module, which it gathers nothing without", () => {
  const addon = loggedIn(UI_ENV + DRAWER_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Minimap = false } } }" });
  expect(addon.eval("return Vanguard_MinimapDrawer == nil and LibDBIcon10_TestOnlyOne:GetParent():GetName()"), "Minimap off: no drawer, the button stays on the map").toBe("Minimap");
  const row = addon.eval(`for _, page in ipairs(ns.Options.PAGES) do if page.key == "modules" then
    for _, r in ipairs(page.rows()) do if r[1] == "module" and r[2] == "Minimap drawer" then return r[6] end end end end`);
  expect(row, "the row names what it needs, as the other dependent modules do").toMatch(/ Needs Minimap\.$/);
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
// TEST-ONLY invites and death: every answer is recorded; the world is a battleground, nobody is a friend.
const INVITE_ENV = `
  __answers = {}
  local function log(text) return function(...) __answers[#__answers + 1] = text end end
  DeclineGuild, DeclineGroup, BNDeclineFriendInvite, RepopMe = log("guild"), log("group"), log("friend"), log("release")
  StaticPopup_Hide = function(which) __answers[#__answers + 1] = "close " .. which end
  __pvp, __soul, __friends = "pvp", false, {}
  IsInInstance = function() return true, __pvp end
  C_DeathInfo = { GetSelfResurrectOptions = function() return { { name = "TEST-ONLY Soulstone", optionType = 0, id = 1, canUse = __soul, isLimited = false, priority = 1 } } end }
  C_FriendList = { IsFriend = function(guid) return __friends[guid] == "friend" end }
  C_BattleNet = { GetAccountInfoByGUID = function(guid) return __friends[guid] == "bnet" and {} or nil end }
  IsGuildMember = function(guid) return __friends[guid] == "guild" end
`;
// PARTY_INVITE_REQUEST with the client's payload (PartyInfoDocumentation): name, isTank, isHealer, isDamage,
// isNativeRealm, allowMultipleRoles, inviterGUID, questSessionActive.
const invite = (addon, guid) => addon.fire("PARTY_INVITE_REQUEST", "<name>", false, false, false, false, false, guid, false);
const INVITES_ON = "VanguardDB.profiles = { Default = { AutoAccept = { guildInvites = true, strangerGroups = true, friendRequests = true, pvpRelease = true } } }";
it("quiet the game: guild invites, stranger group invites, friend requests and battleground release, off until switched on", () => {
  // Brings up all four prompts; the invites are answered on the next frame.
  const fire = (addon) => { addon.fire("GUILD_INVITE_REQUEST", "<name>"); invite(addon, "stranger"); addon.update(0); addon.fire("BN_FRIEND_INVITE_ADDED", 7); addon.fire("PLAYER_DEAD"); };
  const off = loggedIn(INVITE_ENV);
  fire(off);
  expect(off.eval("return #__answers"), "off by default: the game asks as usual").toBe(0);
  const on = loggedIn(INVITE_ENV, { savedVariables: INVITES_ON });
  fire(on);
  expect(on.eval("return __answers"), "each answered, its prompt closed").toEqual(["guild", "close GUILD_INVITE", "group", "close PARTY_INVITE", "friend", "release"]);
  expect(chatHas(on, /guild invite from <name>/) && chatHas(on, /group invite from <name>/) && chatHas(on, /Battle.net friend request/), "and said in chat").toBe(true);
  on.eval("__answers = {}");
  for (const who of ["friend", "bnet", "guild"]) { on.eval(`__friends.x = "${who}"`); invite(on, "x"); }
  on.fire("PARTY_INVITE_REQUEST", "<name>");
  invite(on, { __secret: true });
  on.update(0);
  expect(on.eval("return #__answers"), "a friend, a Battle.net friend, a guildmate, or someone the game hides stay invitable").toBe(0);
  on.eval("__pvp = 'arena'");
  on.fire("PLAYER_DEAD");
  on.eval("__pvp, __soul = 'pvp', true");
  on.fire("PLAYER_DEAD");
  expect(on.eval("return #__answers"), "no release in an arena, or with a soulstone").toBe(0);
  on.eval("__soul = false");
  on.fire("PLAYER_DEAD");
  on.eval("C_DeathInfo.GetSelfResurrectOptions = function() return {} end");
  on.fire("PLAYER_DEAD");
  expect(on.eval("return __answers"), "a soulstone that can't be used yet, or none, still releases").toEqual(["release", "release"]);
  on.eval("__answers = {} C_DeathInfo, HasSoulstone = nil, function() return true end");
  on.fire("PLAYER_DEAD");
  expect(on.eval("return #__answers"), "an older client without C_DeathInfo asks HasSoulstone").toBe(0);
  const bare = loggedIn("", { savedVariables: INVITES_ON });
  for (const e of ["GUILD_INVITE_REQUEST", "PARTY_INVITE_REQUEST", "BN_FRIEND_INVITE_ADDED", "PLAYER_DEAD"]) bare.fire(e, "<name>");
  bare.update(0);
  expect(bare.eval("return DeclineGuild == nil and RepopMe == nil"), "a client without the calls is left alone").toBe(true);
  const noFriends = loggedIn(INVITE_ENV + "C_FriendList, C_BattleNet, IsGuildMember = nil, nil, nil", { savedVariables: INVITES_ON });
  invite(noFriends, "stranger");
  noFriends.update(0);
  expect(noFriends.eval("return __answers"), "with no way to tell who is a friend, a stranger is declined").toEqual(["group", "close PARTY_INVITE"]);
});
// TEST-ONLY game text: the error line and the zone names record what they were given. The error line
// works as Blizzard_UIErrorsFrame does: red errors (UI_ERROR_MESSAGE, a blacklisted type 99 never shown)
// and yellow info lines (UI_INFO_MESSAGE) go through AddMessage, as does AddExternalErrorMessage.
const QUIET_ENV = `
  RED_FONT_COLOR = { GetRGB = function() return 1, 0.125, 0.125 end }
  UIErrorsFrame = CreateFrame("Frame", "UIErrorsFrame", UIParent) __shown = {}
  UIErrorsFrame:RegisterEvent("UI_ERROR_MESSAGE") UIErrorsFrame:RegisterEvent("UI_INFO_MESSAGE")
  function UIErrorsFrame:AddMessage(text, r, g, b) __shown[#__shown + 1] = text end
  function UIErrorsFrame:Clear() __shown = {} end
  function UIErrorsFrame:AddExternalErrorMessage(text) self:AddMessage(text, RED_FONT_COLOR:GetRGB()) end
  UIErrorsFrame:SetScript("OnEvent", function(self, event, messageType, message)
    if event == "UI_INFO_MESSAGE" then self:AddMessage(message, 1, 0.82, 0, 1, messageType)
    elseif messageType ~= 99 then self:AddMessage(message, 1, 0.125, 0.125, 1, messageType) end
  end)
  ZoneTextFrame = CreateFrame("Frame", "ZoneTextFrame", UIParent) ZoneTextFrame:Hide()
  SubZoneTextFrame = CreateFrame("Frame", "SubZoneTextFrame", UIParent) SubZoneTextFrame:Hide()
`;
it("quiet the game: the error line and the zone names, each off until switched on and applied at once; a further camera", () => {
  const off = loggedIn(QUIET_ENV);
  off.fire("UI_ERROR_MESSAGE", 50, "TEST-ONLY Out of range")
  off.eval("ZoneTextFrame:Show() SubZoneTextFrame:Show()");
  expect(off.eval("return { #__shown, ZoneTextFrame:IsShown(), SubZoneTextFrame:IsShown(), tostring(GetCVar('cameraDistanceMaxZoomFactor')) }"), "off by default: the game's own").toEqual([1, true, true, "nil"]);
  const on = loggedIn(QUIET_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Quiet = { errors = true, zoneText = true, camera = 2.6 } } }" });
  on.fire("UI_ERROR_MESSAGE", 50, "TEST-ONLY Out of range")
  on.eval("ZoneTextFrame:Show() SubZoneTextFrame:Show()");
  expect(on.eval("return { #__shown, ZoneTextFrame:IsShown(), SubZoneTextFrame:IsShown(), tostring(GetCVar('cameraDistanceMaxZoomFactor')) }"), "the error line cleared, both names hidden, the camera set").toEqual([0, false, false, "2.6"]);
  on.eval("ns.GetModule('Quiet').settings.errors = false ns.GetModule('Quiet').settings.zoneText = false ZoneTextFrame:Show()");
  on.fire("UI_ERROR_MESSAGE", 50, "TEST-ONLY Out of range");
  expect(on.eval("return { #__shown, ZoneTextFrame:IsShown() }"), "switched off, they show again at once").toEqual([1, true]);
  setCombat(on, true);
  on.eval("ns.GetModule('Quiet').settings.camera = 1.5 ns.GetModule('Quiet').ApplyCamera()");
  expect(on.eval("return GetCVar('cameraDistanceMaxZoomFactor')"), "not changed in combat").toBe("2.6");
  const bare = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { Quiet = { errors = true, zoneText = true } } }" });
  expect(bare.eval("return ZoneTextFrame == nil and ns.GetModule('Quiet').settings.errors"), "a client without these frames is left alone").toBe(true);
  expect(loggedIn(QUIET_ENV + "SetCVar, C_CVar = nil, nil", { savedVariables: "VanguardDB.profiles = { Default = { Quiet = { camera = 2 } } }" }).eval("return GetCVar('cameraDistanceMaxZoomFactor')"), "no CVar call, no change").toBe(null);
});
it("quiet the game: picking the game's setting for the camera zoom puts back the player's own, out of combat", () => {
  // TEST-ONLY the player's own furthest zoom before Vanguard changes it.
  const addon = loggedIn(QUIET_ENV + "SetCVar('cameraDistanceMaxZoomFactor', '1.9')", { savedVariables: "VanguardDB.profiles = { Default = { Quiet = { camera = 2.6 } } }" });
  expect(addon.eval("return { GetCVar('cameraDistanceMaxZoomFactor'), ns.Settings('Quiet').cameraPrior }"), "the camera set, the player's value kept").toEqual(["2.6", "1.9"]);
  addon.eval("ns.Settings('Quiet').camera = 2 ns.GetModule('Quiet').ApplyCamera()");
  expect(addon.eval("return ns.Settings('Quiet').cameraPrior"), "a second choice keeps the value from before the first").toBe("1.9");
  setCombat(addon, true);
  addon.eval("ns.Settings('Quiet').camera = 0 ns.GetModule('Quiet').ApplyCamera()");
  expect(addon.eval("return GetCVar('cameraDistanceMaxZoomFactor')"), "not in combat").toBe("2");
  setCombat(addon, false);
  expect(addon.eval("return { GetCVar('cameraDistanceMaxZoomFactor'), ns.Settings('Quiet').cameraPrior == nil }"), "the game's setting: the player's own value back").toEqual(["1.9", true]);
  addon.eval("SetCVar('cameraDistanceMaxZoomFactor', '1.5') ns.GetModule('Quiet').ApplyCamera()");
  expect(addon.eval("return GetCVar('cameraDistanceMaxZoomFactor')"), "and after that the game's setting is left alone").toBe("1.5");
  addon.eval("ns.Settings('Quiet').camera = 2.6 ns.GetModule('Quiet').ApplyCamera()");
  expect(addon.eval("local _, data = ns.Serialize.Decode(ns.ExportProfile()) return { data.Quiet.camera, data.Quiet.cameraPrior == nil }"), "a profile string has the choice, not this computer's camera").toEqual([2.6, true]);
});
it("quiet the game: hiding the red error line keeps yellow info lines, whichever way the red line came", () => {
  const addon = loggedIn(QUIET_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Quiet = { errors = true } } }" });
  addon.fire("UI_INFO_MESSAGE", 0, "TEST-ONLY Kobold Vermin slain: 3/10");
  addon.fire("UI_ERROR_MESSAGE", 50, "TEST-ONLY Out of range");
  expect(addon.eval("return __shown"), "the red error goes, the yellow progress line stays").toEqual(["TEST-ONLY Kobold Vermin slain: 3/10"]);
  addon.fire("UI_ERROR_MESSAGE", 99, "TEST-ONLY Ability not ready");
  expect(addon.eval("return __shown"), "an error the game doesn't show clears nothing").toEqual(["TEST-ONLY Kobold Vermin slain: 3/10"]);
  addon.eval("UIErrorsFrame:AddExternalErrorMessage('TEST-ONLY No empty slots')");
  expect(addon.eval("return __shown"), "a red line added outside the event goes too").toEqual(["TEST-ONLY Kobold Vermin slain: 3/10"]);
  addon.advance(3);
  addon.fire("UI_ERROR_MESSAGE", 50, "TEST-ONLY Out of range");
  expect(addon.eval("return #__shown"), "a yellow line that has faded is not shown again").toBe(0);
  const plain = loggedIn(QUIET_ENV + "RED_FONT_COLOR = nil", { savedVariables: "VanguardDB.profiles = { Default = { Quiet = { errors = true } } }" });
  plain.fire("UI_ERROR_MESSAGE", 50, "TEST-ONLY Out of range");
  expect(plain.eval("return __shown"), "a client without the game's red leaves the line alone").toEqual(["TEST-ONLY Out of range"]);
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
  const sort = addon.eval('local p = ns.GetModule("Bags").sort.__points.LEFT return { p.rel == ns.GetModule("Bags").tools.groups, p.relPoint, p.x }');
  expect(sort, "right of the Filter and Groups buttons, which sit right of the search box, 6 px off it").toEqual([true, "RIGHT", 6]);
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
});it("bags: an imported profile turns combined bags on, since what Vanguard set on one computer never travels in a string", () => {
  const me = loggedIn(UI_ENV + CVAR_ENV);
  expect(me.eval(`local _, data = ns.Serialize.Decode(ns.ExportProfile()) local s = ns.Settings("Bags") return { data.Bags.combined, data.Bags.applied == nil, data.Bags.prior == nil, s.applied }`), "the string has the setting, not the flags this computer keeps").toEqual([true, true, true, true]);
  // TEST-ONLY string from an older Vanguard that exported the flags of a computer on separate bags.
  me.eval('ns.ImportProfile(ns.Serialize.Encode("profile", ns.StampPayload({ Bags = { combined = true, applied = true, prior = "0" } })))');
  expect(me.eval("local b = VanguardDB.profiles.Imported.Bags return { b.combined, b.applied == nil, b.prior == nil }"), "the import keeps the setting and drops the flags").toEqual([true, true, true]);
  me.fire("PLAYER_LOGOUT");
  const sv = me.savedVariables();
  // The next session on another computer (its own CVars: separate bags) with the imported profile.
  const next = loggedIn(UI_ENV + CVAR_ENV, { savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  expect(next.eval("return { ns.ProfileName(), __cvars.combinedBags, ns.Settings('Bags').prior }"), "the imported profile sets combined bags once, keeping this computer's value").toEqual(["Imported", "1", "0"]);
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
  expect(addon.eval('return ns.GetModule("DataBars").Short(999960)'), "a number that rounds up to a thousand thousands reads in millions").toBe("1.0M");
  expect(addon.eval('return ns.GetModule("DataBars").Short(999940)'), "one that doesn't stays in thousands").toBe("999.9K");
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
    local search = CreateFrame("EditBox", nil, UIParent) search.searchIcon = art(search) search.Instructions = search:CreateFontString()
    GW.SkinGlyph(glyph) GW.SkinDropdown(drop) GW.SkinSearch(search)
    GW.SkinGlyph(nil) GW.SkinGlyph({}) GW.SkinDropdown("x") GW.SkinDropdown({}) GW.SkinSearch(false) GW.SkinSearch({}) GW.ShowTexture(nil) GW.ShowTexture({})
    return { glyph:GetNormalTexture():GetAlpha(), glyph:GetDisabledTexture():GetAlpha(), drop.Arrow:GetAlpha(), search.searchIcon:GetAlpha(),
      ns.Theme.PaintedCount() > 0, #ns.errors, select(4, search.searchIcon:GetPoint()), ns.Theme.SPACE.gap, select(4, search.Instructions:GetPoint()), ns.Theme.SEARCH_INSET }`);
  expect(out, "pictures shown again after the theme faded the game's art; odd input skipped without an error; the magnifier a gap in from the left with the text after it").toEqual([1, 1, 0, 1, true, 0, 8, 8, 28, 28]);
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
    __text(inbox[key], "TEST-ONLY not a caption")
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
      local caption, left = select(2, b:GetRegions()), key == "PrevPageButton"
      local point, to, toPoint, x = caption:GetPoint(1)
      local spaced = point == (left and "LEFT" or "RIGHT") and to == b and toPoint == (left and "RIGHT" or "LEFT") and x == (left and 8 or -8)
        and select(2, select(3, b:GetRegions()):GetPoint(1)) ~= b
      if ns.Theme.ArrowParts(b) and __faded(b) and __themed(caption) and spaced then pagers = pagers + 1 end
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
  expect(first, "tile faded, content kept, text box and money in the theme, the dropdown keeps its arrow, the extra button themed, the item in the item look").toMatchObject({ tile: true, icon: 1, fill: 1, box: true, money: true, arrow: 0, extra: true, item: true, errors: 0 });
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
  expect(first, "model and panels sunk, buttons themed, the dropdown keeps its arrow, the toggle on a control tile").toMatchObject({ model: true, panels: true, buttons: true, dropdown: 0, toggle: true, errors: 0 });
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
    for _, key in ipairs(ns.GetModule("Windows").TIME_DROPDOWNS) do if __faded(f.AlarmTimeFrame[key], f.AlarmTimeFrame[key].Arrow) and f.AlarmTimeFrame[key].Arrow.__alpha == 0 then drops = drops + 1 end end
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

describe("auto-accept: Forever's own invite windows and the teleport check", () => {
  // TEST-ONLY models of Forever's invite windows, made before the addon as the client does
  // (Blizzard_FrameXML/GuildInviteFrame.xml, Blizzard_LFGUtil/Shared/LFGInvitePopup.xml): the guild
  // window shows on its event and declines as it hides unless accepted; the role popup is shown by
  // the game for an invite with roles. Every answer is recorded.
  const FOREVER_INVITES = `
    __answers = {}
    DeclineGuild = function() __answers[#__answers + 1] = "guild" end
    DeclineGroup = function() __answers[#__answers + 1] = "group" end
    StaticPopup_Hide = function(which) __answers[#__answers + 1] = "close " .. which end
    StaticPopupSpecial_Hide = function(frame) __answers[#__answers + 1] = "hide " .. frame:GetName() frame:Hide() end
    GuildInviteFrame = CreateFrame("Frame", "GuildInviteFrame", UIParent)
    GuildInviteFrame:Hide()
    GuildInviteFrame:RegisterEvent("GUILD_INVITE_REQUEST")
    GuildInviteFrame:SetScript("OnEvent", function(self) self.accepted = nil self:Show() end)
    GuildInviteFrame:SetScript("OnHide", function(self) if not self.accepted then DeclineGuild() end end)
    LFGInvitePopup = CreateFrame("Frame", "LFGInvitePopup", UIParent)
    LFGInvitePopup:Hide()
  `;
  const ON = "VanguardDB.profiles = { Default = { AutoAccept = { guildInvites = true, strangerGroups = true, summons = true } } }";

  it("a declined guild invite closes Forever's invite window, declining once", () => {
    const addon = loggedIn(FOREVER_INVITES, { savedVariables: ON });
    addon.fire("GUILD_INVITE_REQUEST", "<name>", "<guild>", 0, "", false);
    expect(addon.eval("return #__answers"), "nothing yet: the game's window gets the event too").toBe(0);
    addon.update(0);
    expect(addon.eval("return { GuildInviteFrame:IsShown(), __answers }"), "the window is hidden and its own hide declines, once").toEqual([false, ["hide GuildInviteFrame", "guild", "close GUILD_INVITE"]]);
    expect(chatHas(addon, /guild invite from <name>/), "and said in chat").toBe(true);
  });

  it("a declined stranger's role invite closes Forever's role popup", () => {
    const addon = loggedIn(FOREVER_INVITES + "StaticPopupSpecial_Hide = nil", { savedVariables: ON });
    addon.eval("LFGInvitePopup:Show()");
    addon.fire("PARTY_INVITE_REQUEST", "<name>", true, false, true, false, false, "stranger", false);
    addon.update(0);
    expect(addon.eval("return { LFGInvitePopup:IsShown(), __answers }"), "declined and the popup hidden (a client without StaticPopupSpecial_Hide hides it itself)").toEqual([false, ["group", "close PARTY_INVITE"]]);
  });

  it("a summon the game won't let you take yet leaves its prompt up", () => {
    const addon = loggedIn("", { savedVariables: ON });
    addon.eval("__wfgWorld.summon = { summoner = '<name>', area = 'TEST-ONLY Vale' } __wfgWorld.cannotTeleport = true");
    addon.fire("CONFIRM_SUMMON");
    expect(addon.eval("return __wfgWorld.summonAccepted == true"), "PlayerCanTeleport false: not accepted").toBe(false);
    addon.eval("__wfgWorld.cannotTeleport = false");
    addon.fire("CONFIRM_SUMMON");
    expect(addon.eval("return __wfgWorld.summonAccepted == true"), "once it can: accepted").toBe(true);
  });
});

describe("chat text size: the game's chat setting", () => {
  it("survives a reload, so chat keeps following the game's own size", () => {
    const first = loggedIn();
    first.eval(`for _, p in ipairs(ns.Options.PAGES) do if p.key == "chat" then
      for _, r in ipairs(p.rows()) do if r[2] == "Chat text size (follows Text size)" then r[5](0) end end end end`);
    const saved = first.eval("return VanguardDB.profiles.Default.Chat");
    const again = loggedIn("FCF_SetChatWindowFontSize = nil", { savedVariables: `VanguardDB.profiles.Default = { Chat = ${luaValue(saved)} }` });
    again.eval("ChatFrame1:SetFont(ChatFrame1:GetFont(), 18)");
    expect(again.eval('return { ns.Settings("Chat").textSize, ns.GetModule("Chat").TextSize(ChatFrame1) }'), "still the game's setting after the reload: the window's own 18").toEqual([0, 18]);
  });
});

describe("chat tabs: the selected tab is the one the game colours as selected", () => {
  // Whether chat tab n is painted in the raised (selected) fill, and its fill's alpha.
  const look = (addon, n) => addon.eval(`local bg for _, r in ipairs({ ChatFrame${n}Tab:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end end
    local c, r, g, b = bg and bg.__vertexColor, ns.Theme.RGB("raised") return { c ~= nil and c[1] == r and c[2] == g and c[3] == b, bg and bg:GetAlpha() }`);
  // TEST-ONLY: Blizzard's FCFTab_UpdateColors only recolours the label (it never disables a tab); the
  // dock knows its selected window.
  const DOCK = `function FCFTab_UpdateColors(tab, selected) tab:GetFontString():SetTextColor(1, 0.82, 0) end
    GENERAL_CHAT_DOCK = CreateFrame("Frame", "GENERAL_CHAT_DOCK", UIParent)
    ChatFrame1.isDocked, ChatFrame2.isDocked = 1, 1
    function FCFDock_GetSelectedWindow() return ChatFrame1 end`;

  it("the game's colouring picks the raised tab, with no tab disabled", () => {
    const addon = loggedIn(UI_ENV + DOCK);
    addon.eval("FCFTab_UpdateColors(ChatFrame1Tab, false) FCFTab_UpdateColors(ChatFrame2Tab, true)");
    expect([look(addon, 1), look(addon, 2)], "ChatFrame2's tab is the shown one: raised with its fill showing").toEqual([[false, 0], [true, 1]]);
  });

  it("at skin time the dock's selected window and a floating window's tab are drawn selected", () => {
    const addon = loggedIn(UI_ENV + DOCK);
    expect([look(addon, 1), look(addon, 2)], "the dock's selected window raised, the other docked one not").toEqual([[true, 1], [false, 0]]);
    addon.eval("ChatFrame2.isDocked = nil ns.GetModule('Chat').SkinAll()");
    expect(look(addon, 2), "a floating window's tab is always its window's selected tab").toEqual([true, 1]);
  });
});

describe("chat tabs: a floating whisper window whose name the client hides", () => {
  it("keeps the game's tab width, and the windows after it are still skinned", () => {
    const addon = loggedIn();
    addon.world.secretGeometry("derived");
    // The game's whisper pop-out, dragged out of the dock: its tab text is the sender's name, which the client
    // hides in chat lockdown (Blizzard_ChatFrameBase/Mainline/FloatingChatFrame.lua, FCF_HasSecretName).
    addon.eval(`ChatFrame2.isDocked = nil ChatFrame2Tab:SetWidth(180)
      ChatFrame2Tab.Text:SetText(__wfgWorld.secret("TEST-ONLY Whisperer"))`);
    expect(addon.eval("local ok = pcall(ns.GetModule('Chat').RefitTabs) return { ok, ChatFrame2Tab:GetWidth() }"), "no error; the game's fixed width stays").toEqual([true, 180]);
    addon.eval('FCF_OpenTemporaryWindow("WHISPER")');
    expect(addon.eval("return ns.GetModule('Chat').frames[ChatFrame11] ~= nil"), "the whisper window opened after it is skinned").toBe(true);
  });
});
