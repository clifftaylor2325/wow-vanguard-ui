// theme: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, button, chatHas, isTok, loggedIn, setCombat } from "./helpers.mjs";

it("theme", () => {
  const addon = loggedIn();
  const colors = addon.eval(`
    local f = ns.Theme.Panel(CreateFrame("Frame", "TestPanel", UIParent), { accent = true })
    ns.Theme.Panel(f, { accent = true })
    local out = {}
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__kind == "Texture" then out[#out + 1] = w.__vertexColor end
    end
    return out`);
  expect(colors.length === 6, `a panel is one background, four edges and a sheen, painted once (got ${colors.length})`).toBeTruthy();
  expect(colors.some((c) => isTok(addon, c, "accent")), "an accent panel's border uses the accent").toBeTruthy();
  addon.slash("accent ff8000");
  const edge = addon.eval(`
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == TestPanel and w.__layer == "BORDER" then return w.__vertexColor end
    end`);
  expect(edge[0] === 1 && Math.abs(edge[1] - 128 / 255) < 1e-9 && edge[2] === 0, "/fui accent repaints painted frames live").toBeTruthy();
  addon.slash("accent nope");
  expect(chatHas(addon, /Usage: \/fui accent/), "a bad accent shows usage").toBeTruthy();
  addon.slash("theme reset");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.brass[1]") === true, "/fui theme reset restores the default accent (brass)").toBeTruthy();
});

it("widgets", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local before = ns.Theme.PaintedCount()
    local b = ns.Theme.Button(CreateFrame("Button", nil, UIParent, "UIPanelButtonTemplate"))
    local e = ns.Theme.EditBox(CreateFrame("EditBox", nil, UIParent))
    local c = ns.Theme.CloseButton(CreateFrame("Button", nil, UIParent, "UIPanelCloseButton"))
    local glyph
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == c and w.__kind == "Texture" and w.__layer == "OVERLAY" then glyph = w.__texture end
    end
    return { painted = ns.Theme.PaintedCount() - before, glyph = glyph }`);
  expect(out.painted === 3, "button, edit box and close button are painted").toBeTruthy();
  expect(/Media\\Icons\\Close$/.test(out.glyph || ""), "the close button draws the Close icon").toBeTruthy();
});

// The top border of a fresh panel at a UI scale on a screen `height` pixels tall
// (optionally with a TEST-ONLY PixelUtil): { h, pixelUtil }.
function borderAt(scale, height, pixelUtil = false) {
  const pu = pixelUtil ? `PixelUtil = { GetNearestPixelSize = function(size, s) __pu = true return size * 768 / ${height} / s end }` : "";
  const addon = loggedIn(`GetPhysicalScreenSize = function() return 1920, ${height} end ${pu}`);
  return addon.eval(`UIParent:SetScale(${scale})
    local f = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent))
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__layer == "BORDER" and w.__height then return { h = w.__height, pixelUtil = __pu == true } end
    end`);
}

it("theme tokens and pixel-perfect borders", () => {
  for (const scale of [0.64, 0.71, 1]) {
    const px = borderAt(scale, 1080).h * scale * 1080 / 768;
    expect(Math.abs(px - 1) < 1e-9, `at UI scale ${scale} a border is one screen pixel (got ${px})`).toBeTruthy();
  }
  expect(borderAt(0.71, 1440, true).pixelUtil === true, "the client's PixelUtil sizes borders where it exists").toBeTruthy();
  const addon = loggedIn(CLICK_LUA + "GetPhysicalScreenSize = function() return 2560, 1440 end");
  expect(addon.eval('return (pcall(ns.Theme.RGB, "TEST-ONLY-nope"))') === false, "an unknown color name is an error, not a silent default").toBeTruthy();
  expect(addon.eval("local fs = UIParent:CreateFontString() ns.Theme.Color(fs, 1, 0, 0) return fs.__textColor[1]") === 1, "Color still takes r, g, b (skin API)").toBeTruthy();
  expect(isTok(addon, addon.eval("local t = UIParent:CreateTexture() ns.Theme.Tint(t, 'magic') return t.__vertexColor"), "magic"), "Tint colors a texture by name").toBeTruthy();
  expect(addon.eval('return ns.Theme.Hex("white")') === "ffffffff", "Hex gives the escape-code form").toBeTruthy();
  addon.eval('ns.Chat("TEST-ONLY line")');
  const last = addon.chat().at(-1);
  expect(last.startsWith("|c" + addon.eval('return ns.Theme.Hex("accent")') + "ForeverUI:|r"), `chat lines start with ForeverUI: in the accent (got ${last})`).toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  setCombat(addon, true);
  addon.eval('__click("Pixel-perfect scale")');
  expect(addon.eval("return UIParent:GetScale()") === 1, "the pixel-perfect scale waits for combat to end").toBeTruthy();
  setCombat(addon, false);
  expect(Math.abs(addon.eval("return UIParent:GetScale()") - 768 / 1440) < 1e-9, "then UIParent gets 768 / screen height").toBeTruthy();
  addon.eval('__click("Pixel-perfect scale")');
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "turning it off offers a reload (the client's scale comes back)").toBeTruthy();
});

it("bundled font and logo", () => {
  const FIRA = "Interface\\AddOns\\ForeverUI\\Media\\Fonts\\FiraSansCondensed-";
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval("return (ns.Theme.Font())") === FIRA + "Medium.ttf", "the bundled Fira Sans Condensed is the default font").toBeTruthy();
  expect(addon.eval("return (ns.Theme.Font(true))") === FIRA + "SemiBold.ttf", "bold asks for its SemiBold weight").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval('return __click("Font")') && addon.eval("return (ns.Theme.Font())") === "Fonts\\FRIZQT__.TTF", "the Font option switches to the game's font").toBeTruthy();
  expect([addon.eval("return ForeverUI_Options.title:GetFont()"), addon.eval("return ForeverUI_Options.reload:IsShown()")], "a font change re-fonts the text already on screen, with no reload").toEqual(["Fonts\\FRIZQT__.TTF", false]);
  const korean = loggedIn('GetLocale = function() return "koKR" end');
  expect(korean.eval("return (ns.Theme.Font())") === "Fonts\\FRIZQT__.TTF", "Korean and Chinese clients keep the game's font (Fira has no Hangul or Han)").toBeTruthy();
  const logo = addon.eval(`local l = ForeverUI_Options.logo
    local out = {}
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == l then out[#out + 1] = { tex = w.__texture, color = w.__vertexColor } end end
    return out`);
  expect(logo.length === 2 && logo.every((t) => /Media\\Textures\\Logo(Left|Right)$/.test(t.tex)), "the options title has the two-part logo").toBeTruthy();
  addon.slash("accent fel");
  const left = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == ForeverUI_Options.logo and w.__texture:find("Left") then return w.__vertexColor end end`);
  expect(isTok(addon, left, "accent"), "the logo's left diamond follows the accent live").toBeTruthy();
});

it("text roles, sheen and shadows", () => {
  const addon = loggedIn(CLICK_LUA);
  // A fresh font string styled for a role: its font, shadow offset and color.
  const fs = (role, color) => addon.eval(`local fs = ns.Theme.Text(UIParent:CreateFontString(), "${role}"${color ? `, "${color}"` : ""})
    return { font = { fs:GetFont() }, shadow = fs.__shadowOffset, color = fs.__textColor }`);
  const title = fs("title");
  expect(/SemiBold\.ttf$/.test(title.font[0]) && title.font[1] === 15, "the title role is SemiBold 15").toBeTruthy();
  expect(/Medium\.ttf$/.test(fs("label").font[0]) && fs("label").font[1] === 12, "the label role is Medium 12").toBeTruthy();
  expect(isTok(addon, fs("label").color, "text") && isTok(addon, fs("small", "muted").color, "muted"), "roles color text by name (text by default)").toBeTruthy();
  const world = fs("world");
  expect(world.font[2] === "OUTLINE" && world.shadow?.[0] === 0, "world text is outlined without a shadow").toBeTruthy();
  expect(fs("label").shadow?.[0] === 1 && fs("label").shadow?.[1] === -1, "other text gets a one-pixel shadow").toBeTruthy();
  expect(addon.eval('return (pcall(ns.Theme.Text, UIParent:CreateFontString(), "TEST-ONLY-nope"))') === false, "an unknown role is an error").toBeTruthy();
  addon.eval('__old = ns.Theme.Text(UIParent:CreateFontString(), "label", "muted") ns.Options.Show("general")');
  addon.eval('__click("Text size")');
  expect(fs("label").font[1] === 13 && addon.eval("return ForeverUI_Options.reload:IsShown()") === false, "Text size scales every role (110%: 12 -> 13) at once, no reload").toBeTruthy();
  expect(addon.eval("return { select(2, __old:GetFont()), __old.__textColor == nil }"), "text already on screen is re-sized too, its color kept").toEqual([13, false]);
  const parts = addon.eval(`local f = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true })
    local out = { shadow = 0, sheen = 0 }
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == f and w.__texture and w.__texture:find("Shadow") then out.shadow = out.shadow + 1 out.tc = out.tc or w.__texCoord
        for _, p in pairs(w.__points) do if p.y ~= 0 or p.x ~= 0 then out.shifted = true end end
        out.snapped = (out.snapped or true) and w.__snapToPixelGrid == false end
      if w.__parent == f and w.__layer == "BORDER" and w.__points.TOPLEFT and w.__points.TOPLEFT.y ~= 0 then out.sheen = out.sheen + 1 out.sheenColor = w.__vertexColor end
    end
    return out`);
  expect(parts.shadow === 8 && parts.tc?.length === 4, "a shadowed panel gets eight shadow pieces cut from Media/Textures/Shadow").toBeTruthy();
  expect([parts.shifted ?? false, parts.snapped], "the shadow sits flush around the panel (no drop, so no gap under it), pixel-snapped").toEqual([false, true]);
  expect(parts.sheen === 1 && isTok(addon, parts.sheenColor, "sheen"), "and a sheen one pixel inside its top edge").toBeTruthy();
  expect(addon.eval("local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__parent == ForeverUI_Options and w.__texture and w.__texture:find('Shadow') then n = n + 1 end end return n") === 8, "the options window casts a shadow").toBeTruthy();
});
