// theme: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, borderOf, button, chatHas, isTok, loggedIn, px, setCombat, tok } from "./helpers.mjs";

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
  expect(edge[0] === 1 && Math.abs(edge[1] - 128 / 255) < 1e-9 && edge[2] === 0, "/vg accent repaints painted frames live").toBeTruthy();
  addon.slash("accent nope");
  expect(chatHas(addon, /Usage: \/vg accent/), "a bad accent shows usage").toBeTruthy();
  addon.slash("theme reset");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.brass[1]") === true, "/vg theme reset restores the default accent (brass)").toBeTruthy();
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
      if w.__parent == c and w.__kind == "Texture" and w.__layer == "OVERLAY" and (w.__texture or ""):find("CloseMark") then glyph = w.__texture end
    end
    return { painted = ns.Theme.PaintedCount() - before, glyph = glyph }`);
  expect(out.painted === 3, "button, edit box and close button are painted").toBeTruthy();
  expect(/Media\\Icons\\CloseMark$/.test(out.glyph || ""), "the close button draws the theme's cross").toBeTruthy();
});

it("window controls: sized when the caller gave no size, on a faint tile at rest, then white on a colored tile under the mouse (red behind close)", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local function parts(b)
      local tile, glyph, extra = nil, nil, 0
      for _, r in ipairs({ b:GetRegions() }) do
        if r.__layer == "ARTWORK" then tile = r
        elseif r.__layer == "OVERLAY" then extra = extra + (glyph and 1 or 0) glyph = r end
      end
      return tile, glyph, extra
    end
    local c = ns.Theme.CloseButton(CreateFrame("Button", nil, UIParent))
    local m = CreateFrame("Button", nil, UIParent)
    m:SetSize(30, 30) ns.Theme.WindowControl(m, "Maximize")
    local tile, glyph, extra = parts(c)
    local quiet = { c:GetWidth(), tile:IsShown(), glyph.__vertexColor, extra, tile:GetWidth(), (glyph.__texture or ""):match("(%a+)$"), tile.__vertexColor }
    c.__scripts.OnEnter(c)
    local lit = { tile:IsShown(), tile.__vertexColor, glyph.__vertexColor }
    c.__scripts.OnHide(c)
    local mTile, mGlyph = parts(m)
    m.__scripts.OnEnter(m)
    return { quiet = quiet, lit = lit, after = tile.__vertexColor, m = { m:GetWidth(), mGlyph.__texture, mTile.__vertexColor } }`);
  expect([out.quiet[0], out.quiet[1], isTok(addon, out.quiet[2], "text2"), out.quiet[3], out.quiet[4], out.quiet[5]],
    "an unsized close button takes the 20-unit tile's size in whole, even screen pixels; at rest: a faint raised tile under a plain cross in text2 and nothing else").toEqual([px(addon, 20, true), true, true, 0, px(addon, 20, true), "CloseMark"]);
  expect(isTok(addon, out.quiet[6], "raised"), "the resting tile is the raised slate, the same behind every control").toBe(true);
  expect([out.lit[0], isTok(addon, out.lit[1], "bad"), isTok(addon, out.lit[2], "white"), isTok(addon, out.after, "raised")], "under the mouse: a red square tile, the cross white; hidden under the mouse (no OnLeave comes) the tile goes back to the resting slate").toEqual([true, true, true, true]);
  expect([out.m[0], /Icons\\Maximize$/.test(out.m[1]), isTok(addon, out.m[2], "raisedHover")], "a sized control keeps its size; a maximize control's glyph, on the grey raisedHover tile (only close is coloured)").toEqual([30, true, true]);
});

it("panels with padding: the fill, border and shadow reach out past the frame, the frame itself stays put", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local f = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { pad = 6, shadow = true })
    local bg, top
    for _, r in ipairs({ f:GetRegions() }) do
      if r.__layer == "BACKGROUND" and r.__texture == ns.Theme.WHITE then bg = r end
      if r.__layer == "BORDER" and r.__points.TOPLEFT and r.__points.TOPRIGHT and not top then top = r end
    end
    local p = bg.__points
    return { p.TOPLEFT.x, p.TOPLEFT.y, p.BOTTOMRIGHT.x, p.BOTTOMRIGHT.y, top.__points.TOPLEFT.y, ns.Theme.Padding(f), ns.Theme.Padding(UIParent) }`);
  const six = px(addon, 6);
  expect(out, "6 units out on every side, in whole screen pixels; Padding says how far (0 for a frame never painted)").toEqual([-six, six, six, -six, six, 6, 0]);
});

// A TEST-ONLY PixelUtil for a screen `height` pixels tall, as Blizzard writes it:
// the factor is 768 / height and GetNearestPixelSize rounds to whole pixels.
function pixelUtilLua(height) {
  return `PixelUtil = {
    GetPixelToUIUnitFactor = function() __pu = true return 768 / ${height} end,
    GetNearestPixelSize = function(size, s, min)
      local f = 768 / ${height}
      local n = math.floor(size * s / f + 0.5)
      if min and n < min then n = min end
      return n * f / s
    end }`;
}

// The top border of a fresh panel at a UI scale on a screen `height` pixels tall
// (optionally with a TEST-ONLY PixelUtil): { h, pixelUtil }.
function borderAt(scale, height, pixelUtil = false) {
  const pu = pixelUtil ? pixelUtilLua(height) : "";
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
  expect(last.startsWith("|c" + addon.eval('return ns.Theme.Hex("accentText")') + "Vanguard:|r"), `chat lines start with Vanguard: in the accent's text colour (got ${last})`).toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  setCombat(addon, true);
  addon.eval('__click("Pixel-perfect scale")');
  expect(addon.eval("return UIParent:GetScale()") === 1, "the pixel-perfect scale waits for combat to end").toBeTruthy();
  setCombat(addon, false);
  expect(Math.abs(addon.eval("return UIParent:GetScale()") - 768 / 1440) < 1e-9, "then UIParent gets 768 / screen height").toBeTruthy();
  addon.eval('__click("Pixel-perfect scale")');
  expect(addon.eval("return Vanguard_Options.reload:IsShown()") === true, "turning it off offers a reload (the client's scale comes back)").toBeTruthy();
});

it("one-pixel borders at every resolution and UI scale", () => {
  // One addon; each case swaps the globals Theme reads (it looks them up on every call).
  const addon = loggedIn("");
  // T.Pixel(UIParent) in screen pixels for a screen `h` tall, a UI scale, and a PixelUtil source (Lua text or "nil").
  const pixels = (h, scale, util) => addon.eval(`GetPhysicalScreenSize = function() return 1920, ${h} end
    ${util === "nil" ? "PixelUtil = nil" : util}
    UIParent:SetScale(${scale}) return ns.Theme.Pixel(UIParent) * UIParent:GetEffectiveScale() * ${h} / 768`);
  for (const h of [1080, 1440, 2160]) {
    for (const scale of [1, 768 / h]) {
      expect(pixels(h, scale, "nil"), `${h}p, UI scale ${scale}, no PixelUtil`).toBeCloseTo(1, 9);
      expect(pixels(h, scale, pixelUtilLua(h)), `${h}p, UI scale ${scale}, PixelUtil`).toBeCloseTo(1, 9);
    }
  }
  // The client's rounding gives whole pixels (2 at 1440p, 3 at 2160p); a border must not.
  for (const [h, rounded] of [[1440, 2], [2160, 3]]) {
    pixels(h, 1, pixelUtilLua(h));
    expect(addon.eval(`return PixelUtil.GetNearestPixelSize(1, 1, 1) * ${h} / 768`), `GetNearestPixelSize at ${h}p`).toBeCloseTo(rounded, 9);
    expect(borderAt(1, h, true).h * h / 768, `a panel border at ${h}p`).toBeCloseTo(1, 9);
  }
  pixels(1440, 1, pixelUtilLua(1440));
  expect(addon.eval('UIParent:SetScale(0.71) local f = CreateFrame("Frame", nil, UIParent) f:SetScale(0.5) return ns.Theme.Pixel(f) * f:GetEffectiveScale() * 1440 / 768'), "a frame at its own scale").toBeCloseTo(1, 9);
  expect(pixels(1440, 1, "PixelUtil = { GetNearestPixelSize = function() return 999 end }"), "a PixelUtil without the factor falls back to the screen height").toBeCloseTo(1, 9);
  expect(pixels(1080, 1, "PixelUtil = { GetPixelToUIUnitFactor = function() return nil end }"), "a factor that is not a number falls back too").toBeCloseTo(1, 9);
  expect(pixels(1440, 1, "PixelUtil = { GetPixelToUIUnitFactor = function() return 0 end }"), "a factor of zero falls back too").toBeCloseTo(1, 9);
  expect(pixels(1440, 1, "PixelUtil = { GetPixelToUIUnitFactor = function() return -1 end }"), "a negative factor falls back too").toBeCloseTo(1, 9);
});

it("bundled font and logo", () => {
  const FIRA = "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-";
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval("return (ns.Theme.Font())") === FIRA + "Medium.ttf", "the bundled Fira Sans Condensed is the default font").toBeTruthy();
  expect(addon.eval("return (ns.Theme.Font(true))") === FIRA + "SemiBold.ttf", "bold asks for its SemiBold weight").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval('return __click("Font")') && addon.eval("return (ns.Theme.Font())") === "Fonts\\FRIZQT__.TTF", "the Font option switches to the game's font").toBeTruthy();
  expect([addon.eval("return Vanguard_Options.title:GetFont()"), addon.eval("return Vanguard_Options.reload:IsShown()")], "a font change re-fonts the text already on screen, with no reload").toEqual(["Fonts\\FRIZQT__.TTF", false]);
  const korean = loggedIn('GetLocale = function() return "koKR" end');
  expect(korean.eval("return (ns.Theme.Font())") === "Fonts\\FRIZQT__.TTF", "Korean and Chinese clients keep the game's font (Fira has no Hangul or Han)").toBeTruthy();
  const logo = addon.eval(`local l = Vanguard_Options.logo
    local out = {}
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == l then out[#out + 1] = w.__texture end end
    return out`);
  expect(logo.length === 1 && /Media\\Textures\\Icon$/.test(logo[0]), "the options title shows the crest, the same pre-colored art as the addons-list icon").toBeTruthy();
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
  expect(fs("label").font[1] === 13 && addon.eval("return Vanguard_Options.reload:IsShown()") === false, "Text size scales every role (110%: 12 -> 13) at once, no reload").toBeTruthy();
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
  expect(addon.eval("local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__parent == Vanguard_Options and w.__texture and w.__texture:find('Shadow') then n = n + 1 end end return n") === 8, "the options window casts a shadow").toBeTruthy();
});

it("fading a frame's art: template textures go, Vanguard's own parts and kept ones stay, call after call", () => {
  const addon = loggedIn();
  const out = addon.eval(`local T = ns.Theme
    local a = CreateFrame("Frame", nil, UIParent)
    local art1, art2, keep, label = a:CreateTexture(), a:CreateTexture(), a:CreateTexture(), a:CreateFontString()
    T.Panel(a)
    T.FadeRegions(a, { [keep] = true })
    local faded = 0 for _, r in ipairs({ a:GetRegions() }) do if r:GetAlpha() == 0 then faded = faded + 1 end end
    art1:SetAlpha(1)
    local b = CreateFrame("Frame", nil, UIParent)
    local other = b:CreateTexture()
    T.FadeRegions(b)
    T.FadeRegions(CreateFrame("Frame", nil, UIParent))
    return { faded, art2:GetAlpha(), keep:GetAlpha(), label:GetAlpha(), other:GetAlpha(), art1:GetAlpha() }`);
  expect(out, "only the two template textures fade; a later call on another frame touches only that frame's").toEqual([2, 0, 1, 1, 0, 1]);
});

// TEST-ONLY: opens the options row's dropdown with this caption, and reads what its menu shows.
const DROPDOWN_LUA = `
  function __dropdown(caption)
    for _, w in ipairs(__wfgStub.frames) do
      if w.dropdown and w.label:GetText() == caption and w:IsVisible() then w.dropdown:GetScript("OnClick")(w.dropdown) return w end
    end
  end
  function __menuTexts()
    local out = {}
    for _, b in ipairs(Vanguard_Menu.items) do if b:IsShown() then out[#out + 1] = b.text:GetText() end end
    return out
  end
  function __pick(text)
    for _, b in ipairs(Vanguard_Menu.items) do if b:IsShown() and b.text:GetText() == text then b:GetScript("OnClick")(b) return true end end
  end
`;
// TEST-ONLY media another addon shares through LibSharedMedia-3.0.
const SHARED_LUA = `local lsm = LibStub("LibSharedMedia-3.0")
  lsm:Register("font", "TEST-ONLY Font", [[Interface\\AddOns\\TestOnly\\Font.ttf]])
  lsm:Register("statusbar", "TEST-ONLY Bar", [[Interface\\AddOns\\TestOnly\\Bar]])`;

it("shared media: the bundled LibSharedMedia-3.0 carries Vanguard's font and bars, and the pickers offer what other addons share", () => {
  const FIRA = "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-";
  const addon = loggedIn(CLICK_LUA + DROPDOWN_LUA + SHARED_LUA);
  expect(addon.eval(`local lsm = LibStub("LibSharedMedia-3.0")
    return { LibStub.minors["LibSharedMedia-3.0"], LibStub.minors["CallbackHandler-1.0"], lsm:Fetch("font", "Vanguard Fira Sans"), lsm:Fetch("font", "Vanguard Fira Sans SemiBold"),
      lsm:Fetch("statusbar", "Vanguard"), lsm:Fetch("statusbar", "Vanguard Soft"), lsm:Fetch("statusbar", "Vanguard Flat") }`), "the libraries load, and Vanguard shares its font's two weights and its three bar textures")
    .toEqual([8020003, 8, FIRA + "Medium.ttf", FIRA + "SemiBold.ttf", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", "Interface\\AddOns\\Vanguard\\Media\\Textures\\BarSoft", "Interface\\Buttons\\WHITE8X8"]);
  addon.eval('ns.Options.Show("general") __dropdown("Font")');
  const fonts = addon.eval("return __menuTexts()");
  expect(fonts, "the Font picker: Vanguard's own two fonts only (other addons' fonts are not listed)").toEqual(["Fira Sans Condensed", "the game's font"]);
  addon.eval('ns.Theme.Settings().font = "TEST-ONLY Font" ns.Theme.Refresh()');
  expect(addon.eval("return { (ns.Theme.Font()), (ns.Theme.Font(true)), (Vanguard_Options.title:GetFont()) }"), "a font another addon shares, once in use, is used for all text at once")
    .toEqual(["Interface\\AddOns\\TestOnly\\Font.ttf", "Interface\\AddOns\\TestOnly\\Font.ttf", "Interface\\AddOns\\TestOnly\\Font.ttf"]);
  addon.eval('__dropdown("Bar texture")');
  const bars = addon.eval("return __menuTexts()");
  expect([bars.slice(0, 3), bars.includes("TEST-ONLY Bar"), bars.includes("Blizzard"), bars.slice(3).some((b) => /^Vanguard/.test(b))], "the Bar texture picker: Vanguard, Soft, Flat, then every shared bar texture but Vanguard's own")
    .toEqual([["Vanguard", "Soft", "Flat"], true, true, false]);
  addon.eval('__pick("TEST-ONLY Bar")');
  expect(addon.eval("return { ns.Theme.BarTexture(), Vanguard_Options.reload:IsShown() }"), "picking a shared bar texture uses it (on reload, as the built-ins)").toEqual(["Interface\\AddOns\\TestOnly\\Bar", true]);
  expect(addon.eval('ns.Theme.Settings().barTexture = "Blizzard" return ns.Theme.BarTexture()'), "the game's bars LibSharedMedia lists work too").toBe("Interface\\TargetingFrame\\UI-StatusBar");
});

it("shared media: a name no longer shared, or no LibSharedMedia at all, falls back to the built-ins", () => {
  const FIRA = "Interface\\AddOns\\Vanguard\\Media\\Fonts\\FiraSansCondensed-";
  const addon = loggedIn(CLICK_LUA + DROPDOWN_LUA);
  addon.eval('ns.Theme.Settings().font = "TEST-ONLY Gone" ns.Theme.Settings().barTexture = "TEST-ONLY Gone" ns.Options.Show("general")');
  expect(addon.eval("return { (ns.Theme.Font()), (ns.Theme.Font(true)), ns.Theme.BarTexture(), __dropdown('Font').dropdown.text:GetText() }"), "a font or bar whose addon is gone: Fira Sans Condensed and the Vanguard bars, and the picker says so")
    .toEqual([FIRA + "Medium.ttf", FIRA + "SemiBold.ttf", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", "Fira Sans Condensed"]);
  const bare = loggedIn('LibStub = nil');
  expect(bare.eval(`local T = ns.Theme
    T.Settings().font = "Friz Quadrata TT" T.Settings().barTexture = "Blizzard"
    local out = { T.SharedMedia() == nil, #T.SharedChoices("font", { { "", "TEST-ONLY" } }), (T.Font()), T.BarTexture() }
    T.Settings().font = [[Interface\\AddOns\\TestOnly\\Old.ttf]]
    out[5] = (T.Font())
    return out`), "without the library: only the built-ins, shared names fall back, and a font path from older settings still works")
    .toEqual([true, 1, FIRA + "Medium.ttf", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", "Interface\\AddOns\\TestOnly\\Old.ttf"]);
});

it("a long dropdown shows 16 choices at once, scrolls with the wheel and opens at the current choice", () => {
  const addon = loggedIn(CLICK_LUA + DROPDOWN_LUA + `local lsm = LibStub("LibSharedMedia-3.0")
    for i = 1, 40 do lsm:Register("statusbar", string.format("TEST-ONLY Bar %02d", i), [[Interface\\AddOns\\TestOnly\\Bar.tga]]) end`);
  addon.eval('ns.Options.Show("general") __dropdown("Bar texture")');
  const total = addon.eval('return #ns.Theme.SharedChoices("statusbar", { {}, {}, {} })');
  // The first choice the menu shows.
  const first = () => addon.eval("return __menuTexts()[1]");
  expect([addon.eval("return #__menuTexts()"), addon.eval("return Vanguard_Menu:GetHeight()"), first()], "16 of the choices, from the top, each an inline control tall").toEqual([16, 16 * addon.eval("return ns.Theme.CONTROL_H") + 2, "Vanguard"]);
  addon.wheel("Vanguard_Menu", -3);
  expect(first(), "the wheel scrolls down a choice per step").toBe(addon.eval(`return ns.Theme.SharedChoices("statusbar", { {}, {}, {} })[4][2]`));
  addon.wheel("Vanguard_Menu", -100);
  expect([first(), addon.eval("return __menuTexts()[16]")], "and stops at the end of the list").toEqual([addon.eval(`return ns.Theme.SharedChoices("statusbar", { {}, {}, {} })[${total - 15}][2]`), "TEST-ONLY Bar 40"]);
  addon.wheel("Vanguard_Menu", 100);
  expect(first(), "and at the top").toBe("Vanguard");
  addon.eval('ns.Theme.Settings().barTexture = "TEST-ONLY Bar 10" ns.Widgets.CloseMenu() __dropdown("Bar texture")');
  expect(addon.eval("local t = __menuTexts() return { t[16], Vanguard_Menu.items[16].check:IsShown() }"), "a menu opens scrolled to show the current choice, checked").toEqual(["TEST-ONLY Bar 10", true]);
});

it("the font picker lists Vanguard's two fonts and the one in use, not every font another addon shares", () => {
  const addon = loggedIn(CLICK_LUA + DROPDOWN_LUA + `local lsm = LibStub("LibSharedMedia-3.0")
    lsm:Register("font", "TEST-ONLY Shared", [[Interface\\AddOns\\TestOnly\\Font.ttf]])`);
  addon.eval('ns.Options.Show("general") __dropdown("Font")');
  expect(addon.eval("return __menuTexts()"), "Vanguard's two fonts only").toEqual(["Fira Sans Condensed", "the game's font"]);
  // A profile that uses the shared font loads before the window is built, so its list starts with it.
  const used = loggedIn(CLICK_LUA + DROPDOWN_LUA + `LibStub("LibSharedMedia-3.0"):Register("font", "TEST-ONLY Shared", [[Interface\\AddOns\\TestOnly\\Font.ttf]])
    ns.Theme.Settings().font = "TEST-ONLY Shared"`);
  used.eval('ns.Options.Show("general") __dropdown("Font")');
  expect(used.eval("return __menuTexts()"), "a font from another addon that is in use is listed after them").toEqual(["Fira Sans Condensed", "the game's font", "TEST-ONLY Shared"]);
  used.eval('ns.Theme.Settings().font = "Fira Sans Condensed" ns.Theme.Refresh() __pick("TEST-ONLY Shared")');
  expect(used.eval("return { (ns.Theme.Font()), Vanguard_Options.reload:IsShown() }"), "picking it from the row applies it at once, no reload").toEqual(["Interface\\AddOns\\TestOnly\\Font.ttf", false]);
});

it("the faction look on a Russian client keeps Fira Sans for headings (the faction fonts have no Cyrillic); the crest stays", () => {
  const faction = 'UnitFactionGroup = function() return __faction end __faction = "Alliance" ';
  const addon = loggedIn(faction + 'GetLocale = function() return "ruRU" end');
  // A new heading string's font file, and whether the options window's crest shows.
  const look = (a) => a.eval(`ns.Options.Show("general") local fs = ns.Theme.Text(UIParent:CreateFontString(), "heading")
    return { fs.__font[1]:match("[^\\\\]+$"), Vanguard_Options.crest:IsShown() }`);
  expect(look(addon), "Alliance on ruRU: Fira Sans SemiBold headings, the crest shown").toEqual(["FiraSansCondensed-SemiBold.ttf", true]);
  addon.eval('__faction = "Horde" ns.Theme.Refresh()');
  expect(look(addon)[0], "Horde on ruRU too").toBe("FiraSansCondensed-SemiBold.ttf");
  const german = loggedIn(faction + 'GetLocale = function() return "deDE" end');
  german.eval('ns.Theme.Settings().faction = "auto" ns.Theme.Refresh()');
  expect(look(german)[0], "a German client gets Cinzel (it has the Latin accents)").toBe("Cinzel-SemiBold.ttf");
});

// TEST-ONLY game tab buttons shaped like the game's three tab templates, and readers for a
// tab's art alpha and its fill: the selected tab is raised (the theme's raised colour), the
// others inset. The fill is the last BACKGROUND texture T.Tab tints.
const TABS_LUA = `
  function __tab(keys, kind)
    local b = CreateFrame(kind or "Button", nil, UIParent)
    for _, k in ipairs(keys) do b[k] = b:CreateTexture(nil, "BACKGROUND") end
    b.Icon = b:CreateTexture(nil, "ARTWORK")
    return b
  end
  function __tabBg(b)
    local bg
    for _, r in ipairs({ b:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__vertexColor then bg = r end end
    return bg
  end
  function __raised(b)
    local c = __tabBg(b).__vertexColor
    local r, g, bl = ns.Theme.RGB("raised")
    return c[1] == r and c[2] == g and c[3] == bl
  end
`;

it("game tabs: art faded, icon kept, a panel, and the selected tab raised while the game has it selected", () => {
  const addon = loggedIn(TABS_LUA);
  const panelTab = addon.eval(`
    local tab = __tab({ "Left", "Middle", "Right", "LeftActive", "MiddleActive", "RightActive" })
    ns.Theme.Tab(tab) ns.Theme.Tab(tab) __panelTab = tab
    local before = __raised(tab)
    tab:Disable() local selected = __raised(tab)
    tab:Enable() local after = __raised(tab)
    return { tab.Left.__alpha, tab.RightActive.__alpha, tab.Icon.__alpha == nil, before, selected, after }`);
  expect(panelTab, "a panel tab: art faded, icon left, raised only while the game has it disabled (selected)").toEqual([0, 0, true, false, true, false]);
  const sideTab = addon.eval(`
    local tab = __tab({ "Background", "SelectedTexture", "HighlightTexture" })
    function tab:SetChecked(on) self.SelectedTexture:SetShown(on) end
    ns.Theme.Tab(tab)
    tab:SetChecked(true) local on = __raised(tab)
    tab:SetChecked(false)
    return { tab.Background.__alpha, tab.SelectedTexture.__alpha, on, __raised(tab) }`);
  expect(sideTab, "a side tab follows SetChecked").toEqual([0, 0, true, false]);
  const systemTab = addon.eval(`
    local tab = __tab({ "Left", "Middle", "Right" })
    function tab:SetTabSelected(on) self.isSelected = on end
    ns.Theme.Tab(tab)
    tab:SetTabSelected(true) local on = __raised(tab)
    tab:Disable()
    tab:SetTabSelected(false)
    return { on, __raised(tab) }`);
  expect(systemTab, "a tab-system tab follows SetTabSelected, not its enabled state").toEqual([true, false]);
  const frameTab = addon.eval(`
    local tab = __tab({ "Background", "SelectedTexture" }, "Frame")
    function tab:HookScript(name, fn) if name == "OnEnable" or name == "OnDisable" then error("Frame doesn't have a " .. name .. " script") end end
    function tab:SetChecked(on) end
    ns.Theme.Tab(tab) tab:SetChecked(true)
    return __raised(tab)`);
  expect(frameTab, "a side tab that is a Frame (no OnEnable script) still follows SetChecked").toBe(true);
  expect(addon.eval("return #ns.errors"), "and nothing is reported").toBe(0);
  const bare = addon.eval("local b = CreateFrame('Button', nil, UIParent) ns.Theme.Tab(b) return __tabBg(b) ~= nil");
  expect(bare, "a button with none of the parts is panelled, nothing errors").toBe(true);
  addon.eval('__panelTab:Disable() ns.Theme.Settings().variant = "midnight" ns.Theme.Refresh()');
  expect(addon.eval("return __raised(__panelTab)"), "a theme variant change repaints the selected tab in the variant's raised colour").toBe(true);
});

it("tooltip-like frames: a panel with a shadow and the game's NineSlice faded, once", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local f = CreateFrame("Frame", nil, UIParent)
    f.NineSlice = CreateFrame("Frame", nil, f)
    ns.Theme.Tooltip(f)
    local n = ns.Theme.PaintedCount()
    ns.Theme.Tooltip(f)
    ns.Theme.Tooltip(CreateFrame("Frame", nil, UIParent))
    return { f.NineSlice.__alpha, ns.Theme.PaintedCount() - n, select("#", f:GetRegions()) > 0 }`);
  expect(out, "faded, painted once, and a frame without a NineSlice works too").toEqual([0, 1, true]);
});

// TEST-ONLY scroll bar shaped like the game's MinimalScrollBar (thumb inside the
// track) or WowTrimScrollBar (with a background and backplate).
const SCROLL_LUA = `
  function __bar(trim)
    local bar = CreateFrame("Frame", nil, UIParent)
    bar.Track = CreateFrame("Frame", nil, bar)
    bar.Track.Begin, bar.Track.Middle = bar.Track:CreateTexture(), bar.Track:CreateTexture()
    bar.Track.Thumb = CreateFrame("Button", nil, bar.Track)
    bar.Track.Thumb.Middle = bar.Track.Thumb:CreateTexture()
    bar.Back, bar.Forward = CreateFrame("Button", nil, bar), CreateFrame("Button", nil, bar)
    bar.Back.Texture = bar.Back:CreateTexture()
    if trim then bar.Background, bar.Backplate = bar:CreateTexture(), CreateFrame("Frame", nil, bar) end
    return bar
  end
`;

it("the game's scroll bars: track art faded, the one T.SCROLL line on the thumb (lit under the mouse), the arrows faded away", () => {
  const addon = loggedIn(SCROLL_LUA);
  const minimal = addon.eval(`
    local bar = __bar() ns.Theme.ScrollBar(bar) ns.Theme.ScrollBar(bar)
    local thumb = bar.Track.Thumb
    local line = ns.FrameState('vgThumb')[thumb].bar
    local rest = line:GetAlpha()
    thumb.__scripts.OnEnter(thumb)
    local lit = line:GetAlpha()
    thumb.__scripts.OnLeave(thumb)
    return { bar.Track.Begin.__alpha, thumb.Middle.__alpha, bar.Back:GetAlpha(), bar.Back.__mouse, line:GetWidth(), rest, lit, line:GetAlpha(),
      ns.FrameState('vgArrow')[bar.Back] ~= nil, ns.FrameState('vgArrow')[bar.Forward] ~= nil }`);
  expect(minimal, "faded; the line T.SCROLL.thumb wide at the rest alpha, lit under the mouse; the arrows at alpha 0 without the mouse, marked once").toEqual([0, 0, 0, false, 4, 0.5, 1, 0.5, true, true]);
  const trim = addon.eval("local bar = __bar(true) ns.Theme.ScrollBar(bar) return { bar.Background.__alpha, bar.Track.Thumb.Middle.__alpha }");
  expect(trim, "the trim bar's background goes too").toEqual([0, 0]);
  expect(addon.eval("local f = CreateFrame('Frame', nil, UIParent) f.Back = CreateFrame('Button', nil, f) ns.Theme.ScrollBar(f) return ns.FrameState('vgArrow')[f.Back] == nil"), "a frame without a thumb is left alone").toBe(true);
});

it("the game's old scroll bar (UIPanelScrollFrameTemplate): its art and thumb texture faded, the one T.SCROLL line on the slider along the thumb, the up and down buttons faded away", () => {
  const addon = loggedIn(`
    local bar = CreateFrame("Frame", "TEST_OldScroll", UIParent) bar.Top = bar:CreateTexture() bar.ThumbTexture = bar:CreateTexture()
    bar.ScrollUpButton = CreateFrame("Button", nil, bar) CreateFrame("Button", "TEST_OldScrollScrollDownButton", bar)
    ns.Theme.ScrollBar(bar) ns.Theme.ScrollBar(bar)`);
  const out = addon.eval(`local bar = TEST_OldScroll local line = ns.FrameState('vgThumb')[bar].bar
    local rest = line:GetAlpha() bar.__scripts.OnMouseDown(bar) local held = line:GetAlpha() bar.__scripts.OnMouseUp(bar)
    return { bar.Top.__alpha, bar.ThumbTexture.__alpha, line:GetAlpha(), line.__points.TOP.rel == bar.ThumbTexture, line.__points.BOTTOM.rel == bar.ThumbTexture,
      rest, held, line:GetAlpha(), bar.ScrollUpButton:GetAlpha(), TEST_OldScrollScrollDownButton:GetAlpha(), select("#", bar:GetRegions()) }`);
  expect(out, "faded; the line along the thumb texture at the rest alpha, lit while held; the up button (by key) and down button (by name) at alpha 0; painted once").toEqual([0, 0, 0.5, true, true, 0.5, 1, 0.5, 0, 0, 3]);
});

it("the game's font objects: the theme font at Text size, kept after a theme change", () => {
  const addon = loggedIn(`
    __FontA = CreateFrame("Frame"):CreateFontString()
  `);
  addon.eval(`ns.Theme.FontObjects({ __FontA = { 14, true }, __NoSuchFont = { 12 } })`);
  const before = addon.eval("return { __FontA:GetFont() }");
  expect(before[0], "the bold theme font").toBe(addon.eval("return (ns.Theme.Font(true))"));
  expect(before[1], "at the size given").toBe(14);
  addon.eval("ns.Theme.Settings().textScale = 1.5 ns.Theme.Refresh()");
  expect(addon.eval("return select(2, __FontA:GetFont())"), "re-applied at the new Text size").toBe(21);
});

it("pixel rounding: sizes and offsets land on whole screen pixels, centred ones on an even count (#225)", () => {
  const addon = loggedIn();
  // Screen pixels a length covers at UIParent's scale now (1080p, scale 1: 1080 / 768 per unit).
  const pixels = (lua) => addon.eval(`return (${lua}) * UIParent:GetEffectiveScale() * 1080 / 768`);
  expect(pixels("ns.Theme.PixelRound(UIParent, 38)"), "38 units at 1080p and scale 1 are 53.4 pixels: 53").toBeCloseTo(53, 9);
  expect(pixels("ns.Theme.PixelRound(UIParent, 21, true)"), "21 units, centred: 29.5 pixels become an even 30").toBeCloseTo(30, 9);
  expect(pixels("ns.Theme.PixelRound(UIParent, 0)"), "nothing stays nothing").toBe(0);
  addon.eval(`UIParent:SetScale(768 / 1080)`);
  expect(addon.eval("return ns.Theme.PixelRound(UIParent, 38)"), "at pixel-perfect scale a whole unit is already a whole pixel").toBeCloseTo(38, 9);
});

it("pixel sizes are rounded again after a UI scale, screen or frame scale change, out of combat (#225)", () => {
  const addon = loggedIn("__scaled = 0 ns.Theme.OnScale(function() __scaled = __scaled + 1 end)");
  addon.eval(`TEST_Sized = ns.Theme.PixelSize(CreateFrame("Frame", nil, UIParent), 100, 40)`);
  // TEST_Sized's width and height in screen pixels at UIParent's scale now.
  const size = () => addon.eval("local k = UIParent:GetEffectiveScale() * 1080 / 768 return { TEST_Sized:GetWidth() * k, TEST_Sized:GetHeight() * k }");
  expect(size().map((n) => Math.round(n * 1e6) / 1e6), "100 x 40 units at 1080p and scale 1: 140.6 x 56.3 pixels become 141 x 56").toEqual([141, 56]);
  setCombat(addon, true);
  addon.eval("UIParent:SetScale(0.8)");
  addon.fire("UI_SCALE_CHANGED");
  addon.update(0.1);
  expect([addon.eval("return __scaled"), addon.eval("return ns.QueuedCount()") > 0], "in combat the rounding waits (sizes on secure frames are protected)").toEqual([0, true]);
  setCombat(addon, false);
  expect(size().map((n) => Math.round(n * 1e6) / 1e6), "then at scale 0.8: 112.5 x 45 pixels become 113 x 45").toEqual([113, 45]);
  expect(addon.eval("return __scaled"), "and the OnScale listeners run once").toBe(1);
  addon.fire("DISPLAY_SIZE_CHANGED");
  addon.fire("DISPLAY_SIZE_CHANGED");
  addon.update(0.1);
  expect(addon.eval("return __scaled"), "a burst of changes rounds once").toBe(2);
  addon.eval("ns.SetMoverScale('minimap', 1.5)");
  addon.update(0.1);
  expect(addon.eval("return __scaled"), "a frame's own scale (unlock mode) rounds again too").toBe(3);
});

it("pixel-perfect scale takes a whole multiple: 2 makes one UI unit two screen pixels (#225)", () => {
  const addon = loggedIn("GetPhysicalScreenSize = function() return 3840, 2160 end");
  addon.eval("ns.Theme.Settings().pixelMultiple = 2 ns.Theme.SetPixelScale(true)");
  expect(addon.eval("return UIParent:GetScale()"), "4K at 2x: 2 x 768 / 2160").toBeCloseTo((2 * 768) / 2160, 9);
  addon.eval("ns.Theme.Settings().pixelMultiple = 0.5");
  expect(addon.eval("return ns.Theme.PixelScale()"), "never less than one pixel per unit").toBeCloseTo(768 / 2160, 9);
});

// Snapping of one texture of each class on a panel, a bar and a button: { class: [snaps, bias] }.
const snapping = (addon) => addon.eval(`local T = ns.Theme
  __snapPanel = __snapPanel or T.Panel(CreateFrame("Frame", nil, UIParent))
  __snapBar = __snapBar or T.StyleBar(CreateFrame("StatusBar", nil, UIParent))
  __snapSpark = __snapSpark or T.Spark(__snapBar, 8)
  __snapIcon, __snapLine = __snapIcon or T.Snap(UIParent:CreateTexture()), __snapLine or T.Snap(UIParent:CreateTexture(), "divider")
  local out = {}
  for _, w in ipairs(__wfgStub.frames) do
    if w.__parent == __snapPanel and w.__layer == "BACKGROUND" then out.fill = { w.__snapToPixelGrid, w.__texelBias } end
    if w.__parent == __snapPanel and w.__layer == "BORDER" and w.__points.TOPLEFT and w.__points.TOPLEFT.y ~= 0 then out.sheen = { w.__snapToPixelGrid, w.__texelBias } end
  end
  for name, t in pairs({ bar = __snapBar:GetStatusBarTexture(), spark = __snapSpark, icon = __snapIcon, divider = __snapLine }) do out[name] = { t.__snapToPixelGrid, t.__texelBias } end
  return out`);

it("texel snapping (#226): off by default; /vg texelsnap snaps still borders, fills, dividers and sheens, never bars, sparks or icons", () => {
  const addon = loggedIn();
  const off = [false, 0];
  expect(snapping(addon), "off by default: nothing snaps, as before").toEqual({ fill: off, sheen: off, bar: off, spark: off, icon: off, divider: off });
  addon.slash("texelsnap on");
  const on = [true, 1];
  expect(snapping(addon), "on: still classes snap with bias 1, moving ones and art don't").toEqual({ fill: on, sheen: on, bar: off, spark: off, icon: off, divider: on });
  expect([addon.eval("return ns.Theme.Settings().texelSnap"), chatHas(addon, /Texel snapping on/)], "saved in the profile, and said in chat").toEqual([true, true]);
  expect(addon.eval('return ns.Theme.Snap(UIParent:CreateTexture(), "border").__snapToPixelGrid'), "a texture made while it's on follows the policy").toBe(true);
  addon.slash("texelsnap");
  expect([snapping(addon).fill, addon.eval("return ns.Theme.Settings().texelSnap"), chatHas(addon, /Texel snapping off/)], "with nothing after it, it toggles back off").toEqual([off, false, true]);
  addon.slash("texelsnap");
  addon.slash("texelsnap off");
  expect(snapping(addon).sheen, "off turns it off").toEqual(off);
});

it("texel snapping (#226): a profile saved with it on snaps still textures from login", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB = { profiles = { Default = { theme = { texelSnap = true } } } }" });
  expect(addon.eval("local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.__snapToPixelGrid == true and w.__texelBias == 1 then n = n + 1 end end return n") > 0, "textures made during login snap").toBe(true);
  const s = snapping(addon);
  expect([s.fill, s.bar], "a panel's fill snaps, a bar's fill doesn't").toEqual([[true, 1], [false, 0]]);
});

// WCAG relative luminance of an { r, g, b } colour (0-1 channels).
const lum = (c) => c.slice(0, 3).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);

// WCAG contrast of a token's colour over the panel colour.
const contrast = (addon, name) => {
  const [a, b] = [lum(tok(addon, name)) + 0.05, lum(tok(addon, "panel")) + 0.05];
  return Math.round((Math.max(a, b) / Math.min(a, b)) * 10) / 10;
};

it("text tiers (#227): text, text2, muted, then disabled, each readable on a panel; a search box's hint is in the disabled tier", () => {
  const addon = loggedIn();
  expect(["text", "text2", "muted", "disabled"].map((n) => contrast(addon, n)), "brightest first; every tier, disabled too, clears 4.5:1").toEqual([15, 11.4, 8, 4.7]);
  const hint = addon.eval('local e = ns.Widgets.Search(UIParent, 200, "Search", function() end) return { e.hint.__textColor[1], e.hint.__textColor[2], e.hint.__textColor[3] }');
  expect(isTok(addon, hint, "disabled"), "the search hint is placeholder text").toBe(true);
});

it("slate surfaces (#229): inset, panel, raised, raisedHover, divider, borderHi step up evenly; a profile keeps a panel colour it saved", () => {
  const addon = loggedIn();
  const steps = ["inset", "panel", "raised", "raisedHover", "divider", "borderHi"].map((n) => lum(tok(addon, n)));
  expect(steps.every((l, i) => i === 0 || l > steps[i - 1]), "each lighter than the one before").toBe(true);
  expect(isTok(addon, addon.eval("return { ns.Theme.PanelColor() }"), "panel"), "a new profile's panels use the new panel colour").toBe(true);
  const old = loggedIn("", { savedVariables: 'VanguardDB = { profiles = { Default = { theme = { panel = { 0x12 / 255, 0x15 / 255, 0x1b / 255, 0.94 } } } } }' });
  expect(old.eval("return { ns.Theme.PanelColor() }")[0], "a profile that saved the old panel keeps it (no migration)").toBeCloseTo(0x12 / 255, 6);
});

// An accent variant as rrggbb.
const hexOf = (addon, name) => addon.eval(`return ns.Theme.Hex("${name}")`).slice(2);

it("accent variants (#230): accentText and accentDim are made from any accent in OKLCH and follow /vg accent", () => {
  const addon = loggedIn();
  expect([hexOf(addon, "accent"), hexOf(addon, "accentText"), hexOf(addon, "accentDim")], "brass: fill, a lighter text, a darker dim").toEqual(["d9a441", "e6b45b", "8a6a2f"]);
  addon.slash("accent 5aa2f0");
  expect([hexOf(addon, "accentText"), hexOf(addon, "accentDim")], "a new accent gives new variants at once").toEqual(["6eb1fb", "386493"]);
  addon.slash("accent ff0000");
  expect([hexOf(addon, "accentText"), hexOf(addon, "accentDim")], "a variant outside the screen's colours is clamped").toEqual(["ff3c2e", "950000"]);
  addon.slash("accent ffffff");
  expect(hexOf(addon, "accentText"), "white can't get lighter").toBe("ffffff");
  expect(contrast(addon, "accentText") > contrast(addon, "accent") || hexOf(addon, "accent") === "ffffff", "text is never dimmer than the fill").toBe(true);
  addon.slash("accent reset");
  expect(addon.eval('local fs = UIParent:CreateFontString() ns.Theme.Color(fs) return ns.Theme.Hex("accentText") == string.format("ff%02x%02x%02x", fs.__textColor[1] * 255 + 0.5, fs.__textColor[2] * 255 + 0.5, fs.__textColor[3] * 255 + 0.5)'), "T.Color with no colour uses the text variant").toBe(true);
});

it("type sizes (#258): no role under 10 but badge; the error badge uses it", () => {
  const addon = loggedIn();
  const small = addon.eval("local out = {} for name, r in pairs(ns.Theme.ROLES) do if r[1] < 10 then out[#out + 1] = name end end return out");
  expect(small, "only badge is under 10").toEqual(["badge"]);
  expect(addon.eval("return { ns.Theme.RoleSize('tiny'), ns.Theme.RoleSize('auraTimerSmall'), ns.Theme.RoleSize('badge') }"), "tiny and the small aura timer at 10, badge 9").toEqual([10, 10, 9]);
});

// A painted frame's one-pixel lines on BORDER sublevel 1 or 2 and its sheen: { y offset in pixels, colour } of each, top to bottom.
const lines = (addon, lua) => addon.eval(`local f, px = ${lua}, ns.Theme.Pixel(${lua}) local out = {}
  for _, w in ipairs(__wfgStub.frames) do
    if w.__parent == f and w.__kind == "Texture" and w.__layer == "BORDER" and math.abs((w:GetHeight() or 0) - px) < 1e-9 and (w.__points.TOPLEFT or w.__points.BOTTOMLEFT) then
      local p = w.__points.TOPLEFT or w.__points.BOTTOMLEFT
      out[#out + 1] = { p.point, math.floor(p.y / px + 0.5), w.__vertexColor }
    end
  end
  table.sort(out, function(a, b) return a[1] .. a[2] < b[1] .. b[2] end)
  return out`);

it("inner bevel (#234): buttons and raised panels get a borderHi line inside the top and a dark one inside the bottom; the sheen moves one row down", () => {
  const addon = loggedIn();
  // Whether colour c is the token `name` at alpha a.
  const near = (c, name, a) => isTok(addon, c, name) && Math.abs(c[3] - a) < 1e-6;
  addon.eval('__btn = ns.Theme.Button(CreateFrame("Button", nil, UIParent)) __btn:SetSize(80, 22)');
  addon.eval('__raised = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { raised = true })');
  addon.eval('__flat = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent))');
  addon.eval('__slot = ns.Theme.Slot(CreateFrame("Frame", nil, UIParent))');
  for (const which of ["__btn", "__raised"]) {
    const l = lines(addon, which);
    const bottom = l.find((x) => x[0] === "BOTTOMLEFT" && x[1] === 1), top = l.find((x) => x[0] === "TOPLEFT" && x[1] === -1 && near(x[2], "borderHi", 0.35)), sheen = l.find((x) => x[0] === "TOPLEFT" && x[1] === -2);
    expect([bottom?.[1], near(bottom?.[2], "shade", 0.35), top !== undefined, isTok(addon, sheen?.[2], "sheen")], `${which}: bottom line on the first row up, dark at 35%; top line on the first row down in borderHi at 35%; the sheen on the second row`).toEqual([1, true, true, true]);
  }
  const flat = lines(addon, "__flat").filter((x) => x[1] !== 0);
  expect([flat.length, flat[0][1], isTok(addon, flat[0][2], "sheen")], "a plain panel: no bevel, its sheen on the first row").toEqual([1, -1, true]);
  expect(lines(addon, "__slot").some((x) => near(x[2], "borderHi", 0.35)), "a slot keeps its own bevel, not this one").toBe(false);
});

// The Shadow or Glow textures on a frame: { count, the first one's slice margins, its TOPLEFT x and y }.
const ringOf = (addon, lua, art) => addon.eval(`local f, n, first = ${lua}, 0, nil
  for _, w in ipairs(__wfgStub.frames) do if w.__parent == f and (w.__texture or ""):find("${art}$") then n = n + 1 first = first or w end end
  local p = first and first.__points.TOPLEFT
  return { n, first and first.__sliceMargins or false, p and p.x or false, p and p.y or false }`);

it("nine-slice rings (#236): off by default; /vg nineslice draws each shadow and glow as one sliced texture after a reload, eight pieces where the client can't", () => {
  const addon = loggedIn();
  expect(ringOf(addon, 'ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true })', "Shadow")[0], "off by default: eight pieces").toBe(8);
  addon.slash("nineslice");
  expect([addon.eval("return ns.Theme.Settings().sliceRings"), chatHas(addon, /Nine-slice shadows on after a \/reload/)], "the switch, saved, says it needs a reload").toEqual([true, true]);
  addon.slash("nineslice off");
  expect([addon.eval("return ns.Theme.Settings().sliceRings"), chatHas(addon, /Nine-slice shadows off after a \/reload/)], "and off").toEqual([false, true]);
  const on = loggedIn("", { savedVariables: "VanguardDB = { profiles = { Default = { theme = { sliceRings = true } } } }" });
  const ten = px(on, 10), pixel = on.eval("return ns.Theme.Pixel(UIParent)");
  expect(ringOf(on, 'ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true })', "Shadow"), "on: one texture, 16-pixel margins, 10 units out on every side").toEqual([1, [16, 16, 16, 16], -ten, ten]);
  on.eval('__g = CreateFrame("Frame", nil, UIParent) __glow = ns.Theme.Glow(__g, 6) ns.Theme.SizeGlow(__glow, __g, 2) ns.Theme.ShowGlow(__glow, true)');
  expect([ringOf(on, "__g", "Glow"), on.eval("return __glow[1]:IsShown()")], "a glow is one texture too, sized to whole pixels and shown").toEqual([[1, [16, 16, 16, 16], -2 * pixel, 2 * pixel], true]);
  on.eval('__old = CreateFrame("Frame", nil, UIParent) local real = __old.CreateTexture __old.CreateTexture = function(...) local t = real(...) t.SetTextureSliceMargins = false return t end ns.Theme.Panel(__old, { shadow = true })');
  expect(ringOf(on, "__old", "Shadow")[0], "a client that can't slice gets the eight pieces").toBe(8);
});

// A painted frame's fill (the white BACKGROUND texture over it): { its colour, its gradient or false }.
const fillOf = (addon, lua) => addon.eval(`local f = ${lua}
  for _, r in ipairs({ f:GetRegions() }) do if r.__layer == "BACKGROUND" and r.__texture == ns.Theme.WHITE and r.__points.BOTTOMRIGHT then return { r.__vertexColor, r.__gradient or false } end end`);

it("panel gradient (#259): off by default; /vg gradient runs a floating window's fill a shade lighter toward the top, at once", () => {
  const addon = loggedIn('__win = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true }) __flat = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent))');
  expect(fillOf(addon, "__win")[1], "off by default: one colour").toBe(false);
  addon.slash("gradient");
  const [base, gradient] = fillOf(addon, "__win");
  const [orientation, bottom, top] = gradient;
  expect([orientation, bottom[3], top[3], chatHas(addon, /Panel gradient on/)], "on at once: VERTICAL (bottom to top), the fill's alpha kept at both ends").toEqual(["VERTICAL", base[3], base[3], true]);
  // A colour's rough brightness (r + g + b).
  const lum = (c) => c[0] + c[1] + c[2];
  expect([lum(bottom) < lum(base), lum(base) < lum(top), [0, 1, 2].every((i) => top[i] - bottom[i] < 0.025)], "darker at the bottom, lighter at the top, and only a shade apart (under 7 of 255 levels)").toEqual([true, true, true]);
  expect(fillOf(addon, "__flat")[1], "a panel that isn't a floating window stays flat").toBe(false);
  addon.eval('__asked = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { gradient = true })');
  expect(fillOf(addon, "__asked")[1][0], "unless it asks for the gradient").toBe("VERTICAL");
  addon.slash("gradient off");
  expect([fillOf(addon, "__win")[1], addon.eval("return ns.Theme.Settings().panelGradient"), chatHas(addon, /Panel gradient off/)], "off again: one colour, saved").toEqual([false, false, true]);
});

it("icon crop (#259): the bevel off every edge of a square slot; a slot that isn't square crops its long axis further", () => {
  const addon = loggedIn();
  // The tex coords T.Crop gives a texture for a slot of w by h (nil: unknown).
  const crop = (w, h) => addon.eval(`return ns.Theme.Crop(UIParent:CreateTexture(), ${w}, ${h}).__texCoord`);
  expect([crop("nil", "nil"), crop(30, 30), crop(0, 20)], "square or unknown: 0.08 to 0.92 both ways").toEqual([[0.08, 0.92, 0.08, 0.92], [0.08, 0.92, 0.08, 0.92], [0.08, 0.92, 0.08, 0.92]]);
  const wide = crop(40, 20), tall = crop(20, 40);
  expect([wide[0], wide[1], wide[2], wide[3]].map((v) => +v.toFixed(6)), "twice as wide: the height keeps half as much").toEqual([0.08, 0.92, 0.29, 0.71]);
  expect([tall[0], tall[1], tall[2], tall[3]].map((v) => +v.toFixed(6)), "twice as tall: the width does").toEqual([0.29, 0.71, 0.08, 0.92]);
});

it("state colors and Color assist (#235): states off the red-green axis; the switch moves reactions to blue, yellow and vermilion", () => {
  const addon = loggedIn(CLICK_LUA);
  // A token's color as rrggbb.
  const hex = (name) => addon.eval(`return ns.Theme.Hex("${name}")`).slice(2);
  expect(["good", "warn", "bad"].map(hex), "good, warn and bad").toEqual(["3fbf9a", "f0b43c", "e8663f"]);
  expect(addon.eval("return ns.Theme.STATE_GLYPHS"), "each with a glyph where it stands alone").toEqual({ good: "Check", warn: "Warn", bad: "Close" });
  addon.world.setUnit("target", { name: "TEST-ONLY Wolf", hp: 1, maxhp: 1, reaction: 2 });
  // The target's health bar color as rrggbb.
  const bar = () => addon.eval(`local r, g, b = ns.GetModule("UnitFrames").HealthColor("target") return string.format("%02x%02x%02x", r * 255 + 0.5, g * 255 + 0.5, b * 255 + 0.5)`);
  expect([["friendly", "neutral", "hostile"].map(hex), bar()], "off by default: the usual reactions").toEqual([["4db86a", "e0c24e", "cc4b45"], "cc4b45"]);
  addon.slash("");
  addon.eval('__click("General")');
  expect(addon.eval('return __click("Color assist")') !== false, "the switch is under General, Look").toBe(true);
  expect([addon.eval("return ns.Theme.Settings().colorAssist"), ["friendly", "neutral", "hostile"].map(hex), bar()], "on: friendly blue, neutral yellow, hostile vermilion, health bars too").toEqual([true, ["4a9be8", "e8d25a", "e0663a"], "e0663a"]);
  expect(hex("bad"), "other colors stay as they are").toBe("e8663f");
});

// The visible textures under a frame that use a given art file.
const artShown = (addon, frame, art) => addon.eval(`local n = 0 for _, w in ipairs(__wfgStub.frames) do
  if w.__kind == "Texture" and w.__parent == ${frame} and w:IsShown() and tostring(w.__texture):find("${art}") then n = n + 1 end end return n`);

it("ornaments (#238): off by default; /vg ornaments puts a rule on the options window and brackets on the quest log and setup, in the accent's dim variant", () => {
  const addon = loggedIn("", { firstRun: true });
  addon.eval('ns.Options.Show("general") ns.GetModule("QuestLog").Toggle()');
  // How many ornament pieces each window shows: the options rule diamond, the quest log and setup brackets.
  const shown = () => [artShown(addon, "Vanguard_Options", "Diamond"), artShown(addon, "Vanguard_QuestLog", "OrnamentCorner"), artShown(addon, "Vanguard_Setup", "OrnamentCorner")];
  expect(shown(), "off by default: nothing drawn").toEqual([0, 0, 0]);
  addon.slash("ornaments");
  expect([shown(), chatHas(addon, /Window ornaments on/)], "on at once: a diamond rule, four brackets each").toEqual([[1, 4, 4], true]);
  const dim = tok(addon, "accentDim");
  expect(addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == Vanguard_QuestLog and tostring(w.__texture):find("OrnamentCorner") then return w.__vertexColor end end`).slice(0, 3), "tinted in the accent's dim variant").toEqual(dim.slice(0, 3));
  addon.eval('ns.Theme.Ornament(Vanguard_QuestLog, "corners")');
  expect(artShown(addon, "Vanguard_QuestLog", "OrnamentCorner"), "asking again adds nothing").toBe(4);
  addon.eval('ns.Theme.Settings().accent = { 0.2, 0.9, 0.4 } ns.Theme.Refresh()');
  expect(addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == Vanguard_QuestLog and tostring(w.__texture):find("OrnamentCorner") then return w.__vertexColor end end`)[1], "follows the accent").not.toBeCloseTo(dim[0], 2);
  addon.slash("ornaments off");
  expect([shown(), chatHas(addon, /Window ornaments off/)]).toEqual([[0, 0, 0], true]);
});

// The border thickness of a painted frame, in screen pixels: its thickest thin BORDER-layer line (the sheen is one pixel).
const edgeThickness = (addon, name) => addon.eval(`local f = ${name} local least
  for _, r in ipairs({ f:GetRegions() }) do
    local w, h = r:GetWidth(), r:GetHeight()
    local t = r.__layer == "BORDER" and (w > 0 and h > 0 and math.min(w, h) or math.max(w, h))
    if t and t > 0 and t < 10 and (not least or t > least) then least = t end
  end
  return least and least / ns.Theme.Pixel(f)`);

it("theme variants (#237): default unchanged; High contrast and Vellum and ink swap surface and text tokens, repaint at once and ride the profile", () => {
  const addon = loggedIn('__win = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true }) __ring = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { accent = true })');
  const base = { text: tok(addon, "text"), panel: tok(addon, "panel"), hostile: tok(addon, "hostile") };
  expect([addon.eval("return ns.Theme.Variant()"), addon.eval("return ns.Theme.Settings().variant"), edgeThickness(addon, "__ring")], "off by default: no variant, a 1 px accent border").toEqual([null, "default", 1]);
  addon.slash("variant contrast");
  expect([tok(addon, "text").slice(0, 3), tok(addon, "panel"), tok(addon, "sheen")[3], chatHas(addon, /Theme variant: High contrast/)], "white text, an opaque panel, no sheen").toEqual([[1, 1, 1], [10 / 255, 11 / 255, 14 / 255, 1], 0, true]);
  expect([tok(addon, "hostile"), edgeThickness(addon, "__ring")], "Color assist on with it, and a 2 px accent ring").toEqual([addon.eval("return { ns.Theme.RGB('hostile') }"), 2]);
  expect(tok(addon, "hostile")[0], "the reaction colors are the assist set").not.toBeCloseTo(base.hostile[0], 3);
  expect(fillOf(addon, "__win")[0].slice(0, 3), "a painted window follows at once").toEqual(tok(addon, "panel").slice(0, 3));
  addon.slash("gradient on");
  expect(fillOf(addon, "__win")[1], "no gradient, even with the setting on").toBe(false);
  addon.slash("gradient off");
  addon.slash("variant vellum");
  expect([tok(addon, "text").slice(0, 3), tok(addon, "raised").slice(0, 3), tok(addon, "hostile")[0] === base.hostile[0], edgeThickness(addon, "__ring")], "warm text and raised, normal reactions, a 1 px border").toEqual([[239 / 255, 230 / 255, 210 / 255], [36 / 255, 31 / 255, 25 / 255], true, 1]);
  expect(addon.eval("return VanguardDB.profiles.Default.theme.variant"), "kept in the profile").toBe("vellum");
  addon.slash("variant nope");
  expect([chatHas(addon, /Usage: \/vg variant/), addon.eval("return ns.Theme.Settings().variant")], "a bad name shows usage and changes nothing").toEqual([true, "vellum"]);
  addon.slash("variant");
  addon.slash("variant default");
  expect([tok(addon, "text"), tok(addon, "panel"), chatHas(addon, /Theme variant: Slate and brass/)], "back to the default look").toEqual([base.text, base.panel, true]);
  addon.slash("variant contrast");
  addon.slash("theme reset");
  expect(addon.eval("return ns.Theme.Variant()"), "Reset theme clears it").toBeNull();
});

it("SLUG text (#239): off by default; /vg slug adds the SLUG flag to outlined world text only, at once", () => {
  const addon = loggedIn('__world = UIParent:CreateFontString() ns.Theme.Text(__world, "world") __plain = UIParent:CreateFontString() ns.Theme.Text(__plain, "label")');
  // The font flags set on a test font string.
  const flags = (name) => addon.eval(`return ${name}.__font[3]`);
  expect([flags("__world"), flags("__plain")], "off by default").toEqual(["OUTLINE", ""]);
  addon.slash("slug");
  expect([flags("__world"), flags("__plain"), chatHas(addon, /SLUG text on/)], "world text gains SLUG, panel text does not").toEqual(["OUTLINE,SLUG", "", true]);
  expect(addon.eval('return ns.Theme.FontFlags(nil, true), ns.Theme.FontFlags("", true)'), "with no flags it is just SLUG").toBe("SLUG");
  addon.slash("slug off");
  expect([flags("__world"), addon.eval("return ns.Theme.Settings().slugText"), chatHas(addon, /SLUG text off/)]).toEqual(["OUTLINE", false, true]);
});

it("sized icons (#232): off by default; /vg icons makes T.Icon pick the baked size for a sized icon, and only for one", () => {
  const addon = loggedIn("");
  // The path T.Icon gives for a name and a size.
  const icon = (args) => addon.eval(`return ns.Theme.Icon(${args})`);
  expect([icon('"Quests", 20'), icon('"Quests"')], "off: the plain file").toEqual([expect.stringMatching(/Icons\\Quests$/), expect.stringMatching(/Icons\\Quests$/)]);
  addon.slash("icons");
  expect(chatHas(addon, /Sized icons on after a \/reload/)).toBe(true);
  expect([icon('"Quests", 20'), icon('"Quests", 18'), icon('"Quests", 40'), icon('"Quests"')], "on: the size at or above, the largest past the top, the plain file with no size").toEqual([expect.stringMatching(/Quests20$/), expect.stringMatching(/Quests20$/), expect.stringMatching(/Quests32$/), expect.stringMatching(/Quests$/)]);
  expect(icon('"LogoMark", 20'), "an icon with no sized copy stays plain").toMatch(/LogoMark$/);
  addon.slash("icons maybe");
  expect(chatHas(addon, /Usage: \/vg icons/), "a typo keeps the setting and shows the usage").toBe(true);
  addon.slash("icons off");
  expect([addon.eval("return ns.Theme.Settings().sizedIcons"), chatHas(addon, /Sized icons off/)]).toEqual([false, true]);
});

it("classic look (#218): a variant with a bronze border, gold-cream text and the window ornaments on without their setting", () => {
  const addon = loggedIn("", { firstRun: true });
  addon.eval('ns.GetModule("QuestLog").Toggle() __win = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true })');
  // The colour of the test window's border.
  const edge = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == __win and w.__layer == "BORDER" and w.__vertexColor then return w.__vertexColor end end`);
  const base = edge();
  expect(artShown(addon, "Vanguard_QuestLog", "OrnamentCorner"), "off by default").toBe(0);
  addon.slash("variant classic");
  expect([tok(addon, "text").slice(0, 3), chatHas(addon, /Theme variant: Classic look/)], "gold-cream text").toEqual([[242 / 255, 226 / 255, 182 / 255], true]);
  expect([edge()[2] < edge()[0], edge()[0] > base[0], artShown(addon, "Vanguard_QuestLog", "OrnamentCorner")], "a bronze border (warm, not black) and the brackets on").toEqual([true, true, 4]);
  addon.slash("variant default");
  expect([edge()[0], artShown(addon, "Vanguard_QuestLog", "OrnamentCorner")], "back to the black border, no brackets").toEqual([base[0], 0]);
});

it("more variants: Midnight, Obsidian, Moss and Ash and ember swap surfaces and text, and every variant keeps its text tiers readable", () => {
  const addon = loggedIn();
  const base = { text: tok(addon, "text"), edge: tok(addon, "edge") };
  addon.slash("variant midnight");
  expect([tok(addon, "panel").slice(0, 3), chatHas(addon, /Theme variant: Midnight/)], "navy-black panels").toEqual([[13 / 255, 18 / 255, 32 / 255], true]);
  addon.slash("variant obsidian");
  expect([tok(addon, "panel")[0] === tok(addon, "panel")[2], tok(addon, "edge")[0] > base.edge[0]], "a neutral grey and a lighter edge").toEqual([true, true]);
  addon.slash("variant moss");
  expect(tok(addon, "panel")[1] > tok(addon, "panel")[0], "green leads").toBe(true);
  addon.slash("variant ember");
  expect([tok(addon, "divider")[0] > tok(addon, "divider")[2], chatHas(addon, /Theme variant: Ash and ember/)], "a rust divider").toEqual([true, true]);
  for (const name of addon.eval("return ns.Theme.VARIANT_ORDER")) {
    addon.slash(`variant ${name}`);
    expect(["text", "text2", "muted"].map((n) => contrast(addon, n) >= 4.5), `${name}: text, text2 and muted clear 4.5:1`).toEqual([true, true, true]);
  }
  expect(addon.eval("return #ns.Theme.VARIANT_ORDER"), "eight entries, default included").toBe(8);
  addon.slash("variant default");
  expect(tok(addon, "text"), "back to the default").toEqual(base.text);
});

// Whether a frame has a visible texture of a Media/Textures file, and how many.
const artCount = (addon, name, art) => addon.eval(`local n = 0 for _, r in ipairs({ ${name}:GetRegions() }) do if tostring(r.__texture):find("${art}") and r:IsShown() then n = n + 1 end end return n`);

it("a removed variant (Frost): /vg variant frost is refused, and a profile that saved it comes back on the default look", () => {
  const addon = loggedIn(undefined, { savedVariables: 'VanguardDB = { profiles = { Default = { theme = { variant = "frost" } } } }' });
  expect([addon.eval("return ns.Theme.Settings().variant"), addon.eval("return ns.Theme.VARIANTS.frost == nil"), tok(addon, "text").slice(0, 3)], "the saved frost is migrated away; the default text colour").toEqual(["default", true, [232 / 255, 234 / 255, 238 / 255]]);
  addon.slash("variant frost");
  expect([chatHas(addon, /Usage: \/vg variant default\|contrast\|vellum\|classic\|midnight\|obsidian\|moss\|ember$/), addon.eval("return ns.Theme.Settings().variant")], "refused, and the setting is left alone").toEqual([true, "default"]);
  expect(addon.eval("return ns.Theme.VARIANT_ORDER")).toEqual(["default", "contrast", "vellum", "classic", "midnight", "obsidian", "moss", "ember"]);
});

it("rounded corners: off by default; /vg corners rounded gives panels and buttons arcs, pulls the fill and lines in, and square hides it all again", () => {
  const addon = loggedIn('__win = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true }) __btn = ns.Theme.Button(CreateFrame("Button", nil, UIParent)) __bar = ns.Theme.Panel(CreateFrame("StatusBar", nil, UIParent)) __bare = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { noBorder = true })');
  expect([addon.eval("return ns.Theme.Settings().corners"), artCount(addon, "__win", "CornerLine"), addon.eval("return __win.__children and #__win.__children or 0")], "square by default: no corner art made").toEqual(["square", 0, 0]);
  addon.slash("corners rounded");
  const r = addon.eval("return ns.Theme.CORNER_RADIUS * ns.Theme.Pixel(__win)");
  expect([artCount(addon, "__win", "CornerLine"), artCount(addon, "__win", "CornerFill"), chatHas(addon, /Corners: rounded/)], "four arcs and four discs on a window").toEqual([4, 4, true]);
  expect([artCount(addon, "__btn", "CornerLine"), artCount(addon, "__bar", "CornerLine"), artCount(addon, "__bare", "CornerLine"), artCount(addon, "__bare", "CornerFill")], "a button rounds; a status bar stays square; a borderless panel rounds only its fill").toEqual([4, 0, 0, 4]);
  const corner = addon.eval(`for _, t in ipairs({ __win:GetRegions() }) do if tostring(t.__texture):find("CornerLine") and t.__points.TOPRIGHT then return { t:GetWidth(), t.__texCoord } end end`);
  expect(corner, "an r square, flipped for its corner").toEqual([r, [1, 0, 0, 1]]);
  const top = addon.eval(`for _, t in ipairs({ __win:GetRegions() }) do if t.__layer == "BORDER" and t.__points.TOPLEFT and t.__points.TOPRIGHT and t:GetHeight() == ns.Theme.Pixel(__win) then return { t.__points.TOPLEFT.x, t.__points.TOPRIGHT.x } end end`);
  expect(top, "the top edge stops r short of each corner").toEqual([r, -r]);
  expect(fillOf(addon, "__win")[0].slice(0, 3), "the fill keeps the panel colour").toEqual(tok(addon, "panel").slice(0, 3));
  expect(addon.eval("local f = __win for _, t in ipairs({ f:GetRegions() }) do if t.__layer == 'BACKGROUND' and t.__texture == ns.Theme.WHITE and t.__points.BOTTOMRIGHT then return t.__points.TOPLEFT.x end end"), "the main fill is pulled in r").toBe(r);
  addon.slash("gradient on");
  expect(fillOf(addon, "__win")[1], "no gradient while rounded (the corner pieces can't follow it)").toBe(false);
  addon.slash("gradient off");
  addon.slash("corners oval");
  expect([chatHas(addon, /Usage: \/vg corners/), addon.eval("return ns.Theme.Settings().corners")], "a bad name shows usage").toEqual([true, "rounded"]);
  addon.slash("corners");
  addon.slash("corners square");
  expect([artCount(addon, "__win", "CornerLine"), artCount(addon, "__win", "CornerFill"), addon.eval("local f = __win for _, t in ipairs({ f:GetRegions() }) do if t.__layer == 'BACKGROUND' and t.__texture == ns.Theme.WHITE and t.__points.BOTTOMRIGHT then return t.__points.TOPLEFT.x end end")], "square again: the art hidden and the fill back to the corners").toEqual([0, 0, 0]);
  expect(addon.eval("return VanguardDB.profiles.Default.theme.corners"), "kept in the profile").toBe("square");
});

it("rounded corners: High contrast's 2 px ring rounds at twice the radius, and a reset returns to square", () => {
  const addon = loggedIn('__ring = ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { accent = true })');
  addon.slash("corners rounded");
  addon.slash("variant contrast");
  const px = addon.eval("return ns.Theme.Pixel(__ring)");
  expect(addon.eval(`for _, t in ipairs({ __ring:GetRegions() }) do if tostring(t.__texture):find("CornerLine") then return t:GetWidth() end end`) / px, "8 px arcs").toBe(8);
  addon.slash("theme reset");
  expect(addon.eval("return ns.Theme.Settings().corners"), "reset gives square corners").toBe("square");
});

// WCAG contrast of an { r, g, b } colour against another.
const contrastOf = (a, b) => Math.round(((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)) * 10) / 10;

it("a variant switch recolours text drawn before it: with the options window open, Classic look leaves no text in the default look's grey", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const before = [tok(addon, "text").slice(0, 3), tok(addon, "text2").slice(0, 3)];
  addon.slash("variant classic");
  // Every shown font string inside the options window: its text and colour.
  const texts = addon.eval(`local out = {}
    for _, w in ipairs(__wfgStub.frames) do
      if type(w.__text) == "string" and #w.__text > 0 and w.__textColor then
        local shown, inWin, f = true, false, w
        while f do if f.__shown == false then shown = false end if f == Vanguard_Options then inWin = true end f = f.__parent end
        if shown and inWin then out[#out + 1] = { w.__text, w.__textColor[1], w.__textColor[2], w.__textColor[3] } end
      end
    end return out`);
  // Whether a colour is the given r, g, b (within a rounding step).
  const same = (c, [r, g, b]) => Math.abs(c[0] - r) < 0.002 && Math.abs(c[1] - g) < 0.002 && Math.abs(c[2] - b) < 0.002;
  const stale = texts.filter(([, r, g, b]) => before.some((c) => same(c, [r, g, b]))).map(([t]) => t);
  expect(texts.length > 40, "the window has text to check").toBe(true);
  expect(stale, "no label, value, header or dropdown keeps the default look's text colours").toEqual([]);
  expect(texts.some(([, r, g, b]) => same(tok(addon, "text").slice(0, 3), [r, g, b])), "labels wear Classic's gold-cream").toBe(true);
  addon.eval('__hand = UIParent:CreateFontString() ns.Theme.Color(__hand, 0.5, 0.5, 0.5)');
  addon.slash("variant default");
  expect([tok(addon, "text").slice(0, 3), addon.eval("return { __hand:GetTextColor() }").slice(0, 3)], "back to the default; text coloured by hand is left alone").toEqual([[232 / 255, 234 / 255, 238 / 255], [0.5, 0.5, 0.5]]);
});

// One of the game's check buttons: template art, a label, checked; returns nothing.
const CHECK_BUTTON = `local b = CreateFrame("CheckButton", "TEST_Check", UIParent) b:SetSize(24, 24)
  b.Art = b:CreateTexture() b:SetCheckedTexture(b:CreateTexture()) b:SetFontString(b:CreateFontString()) b.text = b:GetFontString() b.text:SetPoint("LEFT", b, "RIGHT", 2, 0) b:SetChecked(true) ns.Theme.CheckBox(b)`;

it("theme: a game check button becomes a 16 px inset box with the Check glyph in accentText while checked, following the game's state and the mouse (DESIGN-PRINCIPLES 2.6)", () => {
  const addon = loggedIn(CHECK_BUTTON);
  // The check button's state: { art faded, box width, mark shown, mark colour, mark size, press shown, fill shown, box regions, label colour }.
  const state = () => addon.eval(`local c = ns.Theme.CheckParts(TEST_Check)
    return { TEST_Check.Art.__alpha, c.box:GetWidth(), c.mark:IsShown(), c.mark.__vertexColor, c.mark:GetWidth(), ns.Theme.PressOverlay(TEST_Check):IsShown(), c.fill:IsShown(), select("#", c.box:GetRegions()), TEST_Check:GetFontString().__textColor }`);
  let s = state();
  expect([s[0], s[1], s[2], isTok(addon, s[3], "accentText"), s[5], s[6]], "art faded; the box 16 px; the mark shown in accentText; no press, no fill").toEqual([0, addon.eval("return ns.Theme.PixelRound(UIParent, 16, true)"), true, true, false, false]);
  expect([s[4], addon.eval("return ns.Theme.CheckParts(TEST_Check).mark.__texture")], "the Check glyph at 12 px").toEqual([addon.eval("return ns.Theme.PixelRound(UIParent, 12, true)"), addon.eval('return ns.Theme.Icon("Check")')]);
  addon.eval("TEST_Check:SetChecked(false)");
  expect(state()[2], "SetChecked(false): the mark goes").toBe(false);
  addon.eval('TEST_Check:SetChecked(true) TEST_Check:GetScript("OnClick")(TEST_Check)');
  expect(state()[2], "a click (the client flips the state first): the mark is back").toBe(true);
  addon.eval('TEST_Check:GetScript("OnEnter")(TEST_Check)');
  expect(isTok(addon, borderOf(addon, "ns.Theme.CheckParts(TEST_Check).box"), "borderHi"), "under the mouse the box's border is borderHi").toBe(true);
  addon.eval('TEST_Check:GetScript("OnLeave")(TEST_Check)');
  expect(isTok(addon, borderOf(addon, "ns.Theme.CheckParts(TEST_Check).box"), "edge"), "and back to edge").toBe(true);
  addon.eval('TEST_Check:GetScript("OnMouseDown")(TEST_Check)');
  expect([state()[5], addon.eval("return select(5, TEST_Check.text:GetPoint(1))"), addon.eval("return { ns.Theme.PressOverlay(TEST_Check):GetDrawLayer() }")], "held: the shade shows above the fill and under the border, the label stays put").toEqual([true, 0, ["BACKGROUND", 2]]);
  addon.eval('TEST_Check:GetScript("OnMouseUp")(TEST_Check)');
  expect(state()[5], "let go: it hides").toBe(false);
  addon.eval('TEST_Check:GetScript("OnEnter")(TEST_Check) TEST_Check:Disable()');
  s = state();
  expect([isTok(addon, s[3], "disabled"), isTok(addon, s[8], "disabled"), isTok(addon, borderOf(addon, "ns.Theme.CheckParts(TEST_Check).box"), "edge")], "disabled under the mouse: the mark and the label in the disabled tier, the hover border let go").toEqual([true, true, true]);
  addon.eval("TEST_Check:Enable()");
  expect(isTok(addon, state()[3], "accentText"), "enabled: the mark's colour back").toBe(true);
  addon.eval('TEST_Check:GetScript("OnEnter")(TEST_Check) TEST_Check:GetScript("OnHide")(TEST_Check)');
  expect(isTok(addon, borderOf(addon, "ns.Theme.CheckParts(TEST_Check).box"), "edge"), "hidden under the mouse: the hover border let go").toBe(true);
  const n = state()[7];
  addon.eval("ns.Theme.CheckBox(TEST_Check)");
  expect(state()[7], "painting again adds nothing").toBe(n);
  addon.eval('ns.Theme.CHECK.fill = "accent" ns.Theme.CHECK.markColor = "void" ns.Theme.Refresh()');
  s = state();
  expect([s[6], isTok(addon, addon.eval("return ns.Theme.CheckParts(TEST_Check).fill.__vertexColor"), "accent"), isTok(addon, s[3], "void")], "the filled look ([DECIDE] 6.8) is two values in T.CHECK, reaching a painted box on refresh").toEqual([true, true, true]);
  addon.eval('Vanguard.RegisterSkin("TEST-ONLY-check", function(S) __skinned = S.CheckBox(CreateFrame("CheckButton", nil, UIParent)) __plain = S.CheckBox(CreateFrame("Frame", nil, UIParent)) end)');
  expect(addon.eval("return { ns.Theme.CheckParts(__skinned) ~= nil, ns.Theme.CheckParts(__plain) ~= nil }"), "other addons get it as S.CheckBox, on a plain frame without click scripts too").toEqual([true, true]);
});

it("theme: a plain frame whose check mark the game shows and hides (QuestLogTrackCheckboxTemplate) gets the check box look, following that mark", () => {
  const addon = loggedIn(`local f = CreateFrame("Frame", "TEST_Track", UIParent) f:SetSize(16, 16) f.Bg = f:CreateTexture() f.CheckMark = f:CreateTexture() f.CheckMark:Hide()
    ns.Theme.CheckBox(f) ns.Theme.CheckBox(f, { mark = f.CheckMark })`);
  // The frame's state: { its art's alpha, the game mark's alpha, Vanguard's mark shown }.
  const state = () => addon.eval("local c = ns.Theme.CheckParts(TEST_Track) return { TEST_Track.Bg.__alpha, TEST_Track.CheckMark.__alpha, c.mark:IsShown() }");
  expect(state(), "painted plain first, then given its mark: the art and the game's mark faded; not tracked, no mark").toEqual([0, 0, false]);
  addon.eval("TEST_Track.CheckMark:Show()");
  expect(state()[2], "the game shows its mark: the Check glyph shows").toBe(true);
  addon.eval("TEST_Track.CheckMark:SetShown(false)");
  expect(state()[2], "and hides it again").toBe(false);
});

// One of the game's radio buttons: template art, a label, checked; returns nothing.
const RADIO = `local b = CreateFrame("CheckButton", "TEST_Radio", UIParent) b:SetSize(16, 16)
  b.Art = b:CreateTexture() b:SetCheckedTexture(b:CreateTexture()) b:SetFontString(b:CreateFontString()) b.text = b:GetFontString() b:SetChecked(true) ns.Theme.Radio(b)`;

it("theme: a game radio button becomes a dark 16 px ring with an accentText dot while checked, following the game's state and the mouse", () => {
  const addon = loggedIn(RADIO);
  // The radio's state: { art faded, ring width, dot shown, dot colour, ring colour, press shown, holder regions, label colour, well width }.
  const state = () => addon.eval(`local r = ns.Theme.CheckParts(TEST_Radio)
    return { TEST_Radio.Art.__alpha, r.ring:GetWidth(), r.mark:IsShown(), r.mark.__vertexColor, r.ring.__vertexColor, ns.Theme.PressOverlay(TEST_Radio):IsShown(), select("#", r.holder:GetRegions()), TEST_Radio.text.__textColor or false, r.well:GetWidth() }`);
  let s = state();
  expect([s[0], s[1], s[8], s[2], isTok(addon, s[3], "accentText"), isTok(addon, s[4], "edge"), s[5]], "art faded; an edge ring 16 px round a 14 px well; the dot in accentText; no press").toEqual([0, px(addon, 16, true), px(addon, 14, true), true, true, true, false]);
  expect(addon.eval('return ns.Theme.CheckParts(TEST_Radio).ring.__texture == ns.Theme.Texture("Knob")'), "the ring is the round Knob art").toBe(true);
  addon.eval("TEST_Radio:SetChecked(false)");
  expect(state()[2], "SetChecked(false): the dot goes").toBe(false);
  addon.eval('TEST_Radio:GetScript("OnEnter")(TEST_Radio)');
  expect(isTok(addon, state()[4], "borderHi"), "under the mouse the ring is borderHi").toBe(true);
  addon.eval('TEST_Radio:GetScript("OnMouseDown")(TEST_Radio)');
  expect(state()[5], "held: the shade shows").toBe(true);
  addon.eval('TEST_Radio:GetScript("OnMouseUp")(TEST_Radio) TEST_Radio:SetChecked(true) TEST_Radio:Disable()');
  s = state();
  expect([s[5], isTok(addon, s[3], "disabled"), isTok(addon, s[7], "disabled"), isTok(addon, s[4], "edge")], "let go, then disabled under the mouse: the dot and label disabled, the ring back to edge").toEqual([false, true, true, true]);
  const n = state()[6];
  addon.eval("TEST_Radio:Enable()");
  expect(isTok(addon, state()[4], "edge"), "enabled after the mouse left while it was disabled (no OnLeave): no stuck hover ring").toBe(true);
  addon.eval("ns.Theme.Radio(TEST_Radio)");
  s = state();
  expect([s[6], isTok(addon, s[3], "accentText")], "painting again adds nothing; enabled, the dot's colour is back").toEqual([n, true]);
  addon.eval('ns.Theme.RADIO.dotColor = "accent" ns.Theme.Refresh()');
  expect(isTok(addon, state()[3], "accent"), "T.RADIO reaches a painted radio on refresh").toBe(true);
  addon.eval('Vanguard.RegisterSkin("TEST-ONLY-radio", function(S) __radio = S.Radio(CreateFrame("CheckButton", nil, UIParent)) end)');
  expect(addon.eval("return ns.Theme.CheckParts(__radio) ~= nil"), "other addons get it as S.Radio").toBe(true);
});

it("theme: a game divider becomes one pixel of divider along it, the game's art faded, following the game showing it", () => {
  const addon = loggedIn(`local f = CreateFrame("Frame", "TEST_DivHost", UIParent) f:SetSize(200, 100)
    f.Bar = f:CreateTexture() f.Bar:SetPoint("TOPLEFT") f.Bar:SetPoint("TOPRIGHT") f.Bar:SetHeight(4) ns.Theme.Divider(f.Bar)
    f.Sep = CreateFrame("Frame", nil, f) f.Sep.Art = f.Sep:CreateTexture() ns.Theme.Divider(f.Sep, { vertical = true })`);
  // A divider's state: { its art's alpha, the line's thickness, colour, shown, the holder's anchor }.
  const state = (d, art, thick) => addon.eval(`local d = ns.Theme.DividerParts(${d}) local l = d.line
    return { ${art}.__alpha, l:${thick}(), l.__vertexColor, d.holder:IsShown(), d.holder.__points.TOPLEFT.rel == ${d} }`);
  let s = state("TEST_DivHost.Bar", "TEST_DivHost.Bar", "GetHeight");
  expect([s[0], s[1], isTok(addon, s[2], "divider"), s[3], s[4]], "the texture faded; a line one screen pixel high in divider, over it").toEqual([0, addon.eval("return ns.Theme.Pixel(UIParent)"), true, true, true]);
  addon.eval("TEST_DivHost.Bar:Hide()");
  expect(state("TEST_DivHost.Bar", "TEST_DivHost.Bar", "GetHeight")[3], "the game hides the texture: the line goes").toBe(false);
  addon.eval("TEST_DivHost.Bar:Show() ns.Theme.Divider(TEST_DivHost.Bar)");
  expect([state("TEST_DivHost.Bar", "TEST_DivHost.Bar", "GetHeight")[3], addon.eval("return select('#', TEST_DivHost:GetChildren())")], "shown again; painting again adds no frame").toEqual([true, 2]);
  expect(addon.eval("local l = ns.Theme.DividerParts(TEST_DivHost.Bar).line return { l.__points.TOPLEFT ~= nil, l.__points.TOPRIGHT ~= nil }"), "the line runs along the divider's top edge, on whole pixels").toEqual([true, true]);
  addon.eval("UIParent:SetScale(0.8)");
  addon.fire("UI_SCALE_CHANGED");
  addon.update(0.1);
  expect(state("TEST_DivHost.Bar", "TEST_DivHost.Bar", "GetHeight")[1], "after a UI scale change the line is one screen pixel again").toBe(addon.eval("return ns.Theme.Pixel(UIParent)"));
  s = state("TEST_DivHost.Sep", "TEST_DivHost.Sep.Art", "GetWidth");
  expect([s[0], s[1], s[4]], "a frame of divider art: its art faded, a vertical line one pixel wide over it").toEqual([0, addon.eval("return ns.Theme.Pixel(UIParent)"), true]);
  addon.eval('ns.Theme.DIVIDER.color = "accent" ns.Theme.Refresh()');
  expect(isTok(addon, state("TEST_DivHost.Sep", "TEST_DivHost.Sep.Art", "GetWidth")[2], "accent"), "T.DIVIDER reaches it on refresh").toBe(true);
  addon.eval('Vanguard.RegisterSkin("TEST-ONLY-divider", function(S) __div = S.Divider(UIParent:CreateTexture()) end)');
  expect(addon.eval("return ns.Theme.DividerParts(__div) ~= nil"), "other addons get it as S.Divider").toBe(true);
});

it("theme: a game arrow button shows the theme's arrow glyph turned its way, in text2, text under the mouse, disabled while disabled", () => {
  const addon = loggedIn(`for _, n in ipairs({ "Up", "Left", "Flat" }) do local b = CreateFrame("Button", "TEST_Arrow" .. n, UIParent) b:SetSize(20, 20) b.Art = b:CreateTexture() end
    ns.Theme.ArrowButton(TEST_ArrowUp, "up") ns.Theme.ArrowButton(TEST_ArrowLeft, "left") ns.Theme.ArrowButton(TEST_ArrowFlat, "sideways", { flat = true })`);
  // An arrow's state: { glyph texture, texture coordinates, colour, art alpha, has a button panel }.
  const state = (n) => addon.eval(`local g = ns.Theme.ArrowParts(TEST_Arrow${n}).glyph
    return { g.__texture, g.__texCoord, g.__vertexColor, TEST_Arrow${n}.Art.__alpha, ns.Theme.PressOverlay(TEST_Arrow${n}) ~= nil }`);
  // The path of a theme icon.
  const icon = (n) => addon.eval(`return ns.Theme.Icon("${n}")`);
  let s = state("Up");
  expect([s[0], s[1], isTok(addon, s[2], "text2"), s[3], s[4]], "up: the Down glyph flipped, in text2, on a flat button panel").toEqual([icon("Down"), [0, 1, 1, 0], true, 0, true]);
  s = state("Left");
  expect([s[0], s[1]], "left: the Right glyph mirrored").toEqual([icon("Right"), [1, 0, 0, 1]]);
  s = state("Flat");
  expect([s[0], s[1], s[3], s[4]], "an unknown direction points down; flat: no panel, just the art faded").toEqual([icon("Down"), [0, 1, 0, 1], 0, false]);
  addon.eval('TEST_ArrowUp:GetScript("OnEnter")(TEST_ArrowUp)');
  expect(isTok(addon, state("Up")[2], "text"), "under the mouse: text").toBe(true);
  addon.eval('TEST_ArrowUp:Disable()');
  expect(isTok(addon, state("Up")[2], "disabled"), "disabled: the disabled tier").toBe(true);
  addon.eval('TEST_ArrowUp:Enable()');
  expect(isTok(addon, state("Up")[2], "text2"), "enabled after the mouse left while it was disabled (no OnLeave): text2, no stuck hover").toBe(true);
  addon.eval('TEST_ArrowUp:GetScript("OnEnter")(TEST_ArrowUp) TEST_ArrowUp:GetScript("OnHide")(TEST_ArrowUp)');
  expect(isTok(addon, state("Up")[2], "text2"), "hidden under the mouse: the hover ends").toBe(true);
  addon.eval('ns.Theme.ArrowButton(TEST_ArrowFlat, "down")');
  expect(state("Flat")[4], "flat is kept on a later call without it").toBe(false);
  addon.eval('ns.Theme.ARROW.color = "accent" ns.Theme.Refresh()');
  expect(isTok(addon, state("Up")[2], "accent"), "enabled and left: T.ARROW's resting colour, reaching it on refresh").toBe(true);
  addon.eval('Vanguard.RegisterSkin("TEST-ONLY-arrow", function(S) __arrow = S.ArrowButton(CreateFrame("Button", nil, UIParent), "right") end)');
  expect(addon.eval("return ns.Theme.ArrowParts(__arrow) ~= nil"), "other addons get it as S.ArrowButton").toBe(true);
});
