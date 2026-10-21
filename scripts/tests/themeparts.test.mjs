// themeparts: the theme's shared parts (T.FillParts, T.Tint's memory, the layout constants and the zone
// role) in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { FAKE_FADES, isTok, loggedIn, px, tok } from "./helpers.mjs";

// A themed 80 x 24 button with an accent fill on its ARTWORK layer, and a reader for a fill's state:
// { how many textures, how many shown, the centre's TOPLEFT x and y, its BOTTOMRIGHT x and y }.
const FILL_ENV = `__b = ns.Theme.Button(CreateFrame("Button", "TEST_FillBtn", UIParent)) __b:SetSize(80, 24)
  __fill = ns.Theme.FillParts(__b, "ARTWORK", 1, "accent")
  function __fillState(fill)
    local shown = 0
    for _, t in ipairs(fill.textures) do if t:IsShown() then shown = shown + 1 end end
    local p = fill.bg.__points
    return { #fill.textures, shown, p.TOPLEFT.x + 0, p.TOPLEFT.y + 0, p.BOTTOMRIGHT.x + 0, p.BOTTOMRIGHT.y + 0 }
  end`;

// The vertex colours of every texture of a fill (a Lua expression), as a list.
const fillColors = (addon, fill) => addon.eval(`local out = {} for i, t in ipairs(${fill}.textures) do out[i] = t.__vertexColor end return out`);

// The alphas of every texture of a fill, as a list.
const fillAlphas = (addon, fill) => addon.eval(`local out = {} for i, t in ipairs(${fill}.textures) do out[i] = t:GetAlpha() end return out`);

// Turns rounded corners on (or off) and repaints.
const corners = (addon, on) => addon.eval(`ns.Theme.Settings().corners = "${on ? "rounded" : "square"}" ns.Theme.Refresh()`);

it("fills: one texture on a square button; rounded, seven parts placed inside the frame's arcs, re-tinted on every repaint; square again hides the extras", () => {
  const addon = loggedIn(FILL_ENV);
  expect(addon.eval("return __fillState(__fill)"), "square: the one texture covers the button").toEqual([1, 1, 0, 0, 0, 0]);
  expect(isTok(addon, fillColors(addon, "__fill")[0], "accent"), "in the accent").toBe(true);
  corners(addon, true);
  const r = addon.eval("return ns.Theme.CORNER_RADIUS * ns.Theme.Pixel(__b)");
  expect(addon.eval("return __fillState(__fill)"), "rounded: seven parts, the centre pulled in r on each side").toEqual([7, 7, r, 0, -r, 0]);
  const sides = addon.eval("local l, rt = __fill.roundSides[1], __fill.roundSides[2] return { l:GetWidth(), l.__points.TOPLEFT.y, l.__points.BOTTOMLEFT.y, rt:GetWidth(), rt.__points.TOPRIGHT.x }");
  expect(sides, "an r-wide strip down each side, between the corners").toEqual([r, -r, r, r, 0]);
  const disc = addon.eval("local t = __fill.roundFill.BOTTOMRIGHT return { t:GetWidth(), t:GetHeight(), t.__points.BOTTOMRIGHT.x + 0, t.__points.BOTTOMRIGHT.y + 0, tostring(t.__texture):match('[^\\\\]+$'), t.__texCoord, (t:GetDrawLayer()) }");
  expect(disc, "an r square quarter disc in each corner, flipped for it, on the fill's layer").toEqual([r, r, 0, 0, "CornerFill", [1, 0, 1, 0], "ARTWORK"]);
  expect(addon.eval("local n = 0 for _, t in ipairs(__fill.textures) do local _, sub = t:GetDrawLayer() if sub == 1 then n = n + 1 end end return n"), "every part on the fill's sublevel").toBe(7);
  expect(fillColors(addon, "__fill").every((c) => isTok(addon, c, "accent")), "every part in the accent").toBe(true);
  addon.slash("accent arcane");
  expect([fillColors(addon, "__fill").every((c) => isTok(addon, c, "accent")), tok(addon, "accent")[0] === addon.eval("return ns.Theme.PRESETS.arcane[1]")], "a new accent (arcane) reaches every part").toEqual([true, true]);
  addon.eval('ns.Theme.TintFill(__fill, "bad", 0.5)');
  expect(fillColors(addon, "__fill").every((c) => isTok(addon, c, "bad") && c[3] === 0.5), "TintFill recolours every part at the alpha given").toBe(true);
  addon.eval("ns.Theme.Refresh()");
  expect(fillColors(addon, "__fill").every((c) => isTok(addon, c, "bad") && c[3] === 0.5), "and a repaint keeps that").toBe(true);
  addon.eval("ns.Theme.FillAlpha(__fill, 0.3)");
  expect(fillAlphas(addon, "__fill"), "FillAlpha sets every part").toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
  addon.eval("ns.Theme.ShowFill(__fill, false)");
  expect(addon.eval("return __fillState(__fill)")[1], "ShowFill hides every part").toBe(0);
  addon.eval("ns.Theme.ShowFill(__fill, true)");
  expect(addon.eval("return __fillState(__fill)")[1], "and shows them again").toBe(7);
  corners(addon, false);
  expect(addon.eval("return __fillState(__fill)"), "square again: only the centre shows, back at the corners").toEqual([7, 1, 0, 0, 0, 0]);
  addon.eval("ns.Theme.FillAlpha(__fill, 1) ns.Theme.FadeRegions(__b)");
  expect(fillAlphas(addon, "__fill"), "fading the button's template art leaves its fills alone").toEqual([1, 1, 1, 1, 1, 1, 1]);
});

it("fills: a padded panel's fill reaches out with it; a frame never painted gets one plain texture that nothing re-places", () => {
  const addon = loggedIn('__p = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { pad = 6 }) __p:SetSize(100, 40) __pf = ns.Theme.FillParts(__p, "ARTWORK", nil, "hover") __plain = ns.Theme.FillParts(CreateFrame("Frame", nil, UIParent), "ARTWORK", nil, "hover")');
  const out = px(addon, 6);
  expect(addon.eval("local p = __pf.bg.__points return { p.TOPLEFT.x, p.TOPLEFT.y, p.BOTTOMRIGHT.x, p.BOTTOMRIGHT.y }"), "square: out past the frame by the panel's padding, in whole pixels").toEqual([-out, out, out, -out]);
  corners(addon, true);
  const r = addon.eval("return ns.Theme.CORNER_RADIUS * ns.Theme.Pixel(__p)");
  expect(addon.eval("local p = __pf.bg.__points local c = __pf.roundFill.TOPLEFT.__points.TOPLEFT return { #__pf.textures, p.TOPLEFT.x, c.x, c.y }"), "rounded: the centre pulled in r from the padded edge, the discs at the padded corners").toEqual([7, r - out, -out, out]);
  expect(addon.eval("local p = __plain.bg.__points return { #__plain.textures, __plain.radius, p.TOPLEFT.x + 0, p.BOTTOMRIGHT.x + 0 }"), "an unpainted frame: the plain texture, still square").toEqual([1, 0, 0, 0]);
});

it("fills: a button's hover fill and press overlay follow its rounded corners, and ease or show every part (#257)", () => {
  const addon = loggedIn(FAKE_FADES + FILL_ENV);
  expect(addon.eval("local h = ns.Theme.HoverParts(__b) return { h[1] == h.fill.bg, #h.fill.textures, ns.Theme.PressOverlay(__b):IsShown() }"), "square: the hover parts' first texture is the fill's centre; the press overlay hidden").toEqual([true, 1, false]);
  corners(addon, true);
  const hover = addon.eval("local h = ns.Theme.HoverParts(__b) return { #h.fill.textures, h[1].__vertexColor, h[1]:GetAlpha() }");
  expect([hover[0], isTok(addon, hover[1], "raisedHover"), hover[2]], "rounded: the hover fill has seven parts in raisedHover, still clear").toEqual([7, true, 0]);
  expect(fillAlphas(addon, "ns.Theme.HoverParts(__b).fill"), "every part clear").toEqual([0, 0, 0, 0, 0, 0, 0]);
  addon.eval("for _, t in ipairs(ns.Theme.HoverParts(__b).fill.textures) do __fakeFader(t) end __fakeFader(ns.Theme.HoverParts(__b)[2]) __b.__mouseOver = true __b:GetScript('OnEnter')(__b)");
  expect(addon.eval("local n = 0 for _, g in ipairs(__fades) do if g.playing and g.to == 1 then n = n + 1 end end return n"), "the mouse comes over: eight fades, one per part and one for the line").toBe(8);
  addon.eval("__finishFades() ns.Theme.Settings().reduceMotion = true __b:GetScript('OnLeave')(__b)");
  expect(fillAlphas(addon, "ns.Theme.HoverParts(__b).fill"), "leaving with Reduce motion clears every part at once").toEqual([0, 0, 0, 0, 0, 0, 0]);
  addon.eval("__b:GetScript('OnEnter')(__b)");
  expect([...fillAlphas(addon, "ns.Theme.HoverParts(__b).fill"), addon.eval("return ns.Theme.HoverParts(__b)[2]:GetAlpha()")], "and back on at once").toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  // The press fill's textures: the button's BACKGROUND textures on sublevel 2 (the overlay's layer), with the centre first.
  addon.eval(`__pressFill = { textures = { ns.Theme.PressOverlay(__b) } }
    for _, t in ipairs({ __b:GetRegions() }) do local _, sub = t:GetDrawLayer() if t.__layer == "BACKGROUND" and sub == 2 and t ~= __pressFill.textures[1] then table.insert(__pressFill.textures, t) end end`);
  // The press fill's state: { the overlay shown, how many of its textures are shown, how many it has }.
  const press = () => addon.eval("local shown = 0 for _, t in ipairs(__pressFill.textures) do if t:IsShown() then shown = shown + 1 end end return { ns.Theme.PressOverlay(__b):IsShown(), shown, #__pressFill.textures }");
  expect(press(), "at rest: the press overlay and its six rounded parts are hidden").toEqual([false, 0, 7]);
  addon.eval("__b:GetScript('OnMouseDown')(__b)");
  expect(press(), "mouse down: every part shows").toEqual([true, 7, 7]);
  expect(fillColors(addon, "__pressFill").every((c) => isTok(addon, c, "shade") && c[3] === 0.3), "all in shade at 0.3").toBe(true);
  addon.eval("__b:GetScript('OnMouseUp')(__b)");
  expect(press(), "mouse up: every part hidden").toEqual([false, 0, 7]);
  addon.eval("ns.Theme.EaseHover(CreateFrame('Button'), true)");
});

it("T.Tint remembers its token: a new accent or variant re-tints every tinted region on T.Refresh, a region recoloured by hand since is left alone", () => {
  const addon = loggedIn(`__t = ns.Theme.Tint(UIParent:CreateTexture(), "accent") __h = ns.Theme.Tint(UIParent:CreateTexture(), "accent", 0.5)
    __text = ns.Theme.Tint(UIParent:CreateTexture(), "text2") __hand = ns.Theme.Tint(UIParent:CreateTexture(), "accent") __hand:SetVertexColor(1, 0, 0)
    __bare = { SetVertexColor = function(self, ...) self.c = { ... } end } ns.Theme.Tint(__bare, "accent")`);
  // A test texture's vertex colour, by its global name.
  const colorOf = (name) => addon.eval(`return ${name}.__vertexColor`);
  expect([isTok(addon, colorOf("__t"), "accent"), colorOf("__h")[3], isTok(addon, colorOf("__hand"), "accent")], "tinted brass; the hand-recoloured one is red").toEqual([true, 0.5, false]);
  addon.slash("accent arcane");
  expect([isTok(addon, colorOf("__t"), "accent"), isTok(addon, colorOf("__h"), "accent"), colorOf("__h")[3]], "arcane now, the alpha kept").toEqual([true, true, 0.5]);
  expect(colorOf("__hand"), "the hand-recoloured one stays red").toEqual([1, 0, 0, 1]);
  const before = tok(addon, "text2");
  addon.slash("variant contrast");
  expect([isTok(addon, colorOf("__text"), "text2"), tok(addon, "text2")[0] !== before[0]], "a variant switch reaches a text2 tint too").toEqual([true, true]);
  addon.eval("__t:SetVertexColor(0, 1, 0) ns.Theme.Refresh()");
  expect(colorOf("__t"), "a second hand recolour is left alone as well").toEqual([0, 1, 0, 1]);
  addon.slash("accent jade");
  expect([colorOf("__t"), colorOf("__hand"), addon.eval("return __bare.c[1] == ns.Theme.PRESETS.brass[1]")], "forgotten: neither follows the accent any more; a region that can't say its colour is forgotten at the first refresh").toEqual([[0, 1, 0, 1], [1, 0, 0, 1], true]);
});

it("T.Refresh never compares a hidden vertex colour: a region the client colours from hidden data (a debuff badge's dispel colour) is forgotten, not re-tinted or raised on", () => {
  // The client's hidden number keeps the type "number" (the harness's is a table), so the case marks one plain number hidden
  // through issecretvalue, which ns.IsSecret asks: it is the badge's red channel, a hair off the accent's, close enough that
  // a compare would call it unchanged and re-tint it.
  const addon = loggedIn(`local asked = issecretvalue issecretvalue = function(v) return v == __hidden or asked(v) end
    -- A region that reports the colour it was given, and one that reports it a hair off (the badge).
    local function region(drift) return { SetVertexColor = function(self, ...) self.c = { ... } end,
      GetVertexColor = function(self) return self.c[1] + drift, self.c[2], self.c[3], self.c[4] end } end
    __plain, __badge, __veiled = region(0), region(0.001), region(0)
    ns.Theme.Tint(__plain, "accent") ns.Theme.Tint(__badge, "accent") ns.Theme.Tint(__veiled, "accent")
    __hidden = __badge.c[1] + 0.001
    __veiled.GetVertexColor = function() return __wfgWorld.secret(0.5), 0, 0, 1 end`);
  expect(addon.eval("return { ns.IsSecret(__hidden), ns.IsSecret(__badge.c[1]) }"), "only that number reads as hidden").toEqual([true, false]);
  addon.slash("accent arcane");
  expect(addon.eval("return { __plain.c[1] == ns.Theme.PRESETS.arcane[1], __badge.c[1] == ns.Theme.PRESETS.brass[1], __veiled.c[1] == ns.Theme.PRESETS.brass[1] }"), "the plain region follows the accent; the hidden ones are forgotten and keep theirs, with no error").toEqual([true, true, true]);
});

it("the layout constants: T.SPACE, T.ALPHA, T.CREST, T.ROW, T.SCROLL and the control heights, with the two display roles unchanged", () => {
  const addon = loggedIn();
  expect(addon.eval("return { ns.Theme.SPACE, ns.Theme.ALPHA, ns.Theme.CREST, ns.Theme.ROW, ns.Theme.SCROLL, { ns.Theme.CONTROL_H, ns.Theme.BUTTON_H }, ns.Theme.HEADING_ROLES }")).toEqual([
    { tight: 4, gap: 8, col: 12, pad: 16, section: 24 },
    { opaque: 1, dialog: 0.98, overlay: 0.94, alert: 0.92, calm: 0.35, dispelWash: 0.35 },
    { title: 20, card: 44, watermark: 96, wash: 0.1 },
    { height: 28 },
    { thumb: 4, rest: 0.5, lit: 1 },
    [20, 26],
    { title: true, heading: true },
  ]);
});

it("the zone role: a bold 13 that keeps Fira Sans while the faction look gives titles and headings Cinzel", () => {
  const addon = loggedIn('UnitFactionGroup = function() return "Alliance" end GetLocale = function() return "enUS" end');
  addon.eval('ns.Theme.Settings().faction = "auto" ns.Theme.Refresh()');
  // A new string of a role: its font file and size.
  const look = (role) => addon.eval(`local fs = ns.Theme.Text(UIParent:CreateFontString(), "${role}") return { fs.__font[1]:match("[^\\\\]+$"), fs.__font[2] }`);
  expect(addon.eval("local r = ns.Theme.ROLES.zone return { r.size, r.bold }"), "13, bold").toEqual([13, true]);
  expect(look("title"), "a title takes the display font").toEqual(["Cinzel-SemiBold.ttf", 15]);
  expect(look("zone"), "the zone text keeps Fira Sans SemiBold at 13").toEqual(["FiraSansCondensed-SemiBold.ttf", 13]);
  expect(addon.eval('return ns.Theme.RoleSize("zone")'), "RoleSize knows it").toBe(13);
});
