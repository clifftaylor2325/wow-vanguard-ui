// theme: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

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
  expect(/Media\\Icons\\CloseMark$/.test(out.glyph || ""), "the close button draws the seal's cross").toBeTruthy();
});

it("window controls: sized when the caller gave no size, quiet until the mouse is over them, then white on a tile (red behind close)", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local function parts(b)
      local tile, glyph, ring
      for _, r in ipairs({ b:GetRegions() }) do
        local tex = r.__texture or ""
        if r.__layer == "ARTWORK" then tile = r
        elseif tex:find("CloseRing") or tex:find("ControlGem") then ring = r
        elseif r.__layer == "OVERLAY" then glyph = r end
      end
      return tile, glyph, ring
    end
    local c = ns.Theme.CloseButton(CreateFrame("Button", nil, UIParent))
    local m = CreateFrame("Button", nil, UIParent)
    m:SetSize(30, 30) ns.Theme.WindowControl(m, "Maximize")
    local tile, glyph, ring = parts(c)
    local quiet = { c:GetWidth(), tile:IsShown(), glyph.__vertexColor, ring.__vertexColor, tile.__texture }
    c.__scripts.OnEnter(c)
    local lit = { tile:IsShown(), tile.__vertexColor, glyph.__vertexColor }
    c.__scripts.OnHide(c)
    local mTile, mGlyph = parts(m)
    m.__scripts.OnEnter(m)
    return { quiet = quiet, lit = lit, after = tile:IsShown(), m = { m:GetWidth(), mGlyph.__texture, mTile.__vertexColor } }`);
  expect([out.quiet[0], out.quiet[1], isTok(addon, out.quiet[2], "text2"), isTok(addon, out.quiet[3], "accent"), /Seal$/.test(out.quiet[4])],
    "an unsized close button takes the 20-unit tile's size; quiet: no fill, the cross in text2 inside the accent seal").toEqual([20, false, true, true, true]);
  expect([out.lit[0], isTok(addon, out.lit[1], "bad"), isTok(addon, out.lit[2], "white"), out.after], "under the mouse: the seal filled red, the cross white; hidden under the mouse (no OnLeave comes) it goes quiet again").toEqual([true, true, true, false]);
  expect([out.m[0], /Icons\\Maximize$/.test(out.m[1]), isTok(addon, out.m[2], "accent")], "a sized control keeps its size; a maximize control's glyph, on an accent tile").toEqual([30, true, true]);
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
  expect(out, "6 units out on every side; Padding says how far (0 for a frame never painted)").toEqual([-6, 6, 6, -6, 6, 6, 0]);
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
  expect(last.startsWith("|c" + addon.eval('return ns.Theme.Hex("accent")') + "Vanguard:|r"), `chat lines start with Vanguard: in the accent (got ${last})`).toBeTruthy();
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
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == l then out[#out + 1] = { tex = w.__texture, color = w.__vertexColor } end end
    return out`);
  expect(logo.length === 2 && logo.every((t) => /Media\\Textures\\Logo(Left|Right)$/.test(t.tex)), "the options title has the two-part logo").toBeTruthy();
  addon.slash("accent fel");
  const left = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.__parent == Vanguard_Options.logo and w.__texture:find("Left") then return w.__vertexColor end end`);
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
  expect([fonts.slice(0, 2), fonts.includes("TEST-ONLY Font"), fonts.includes("Friz Quadrata TT"), fonts.some((f) => /^Vanguard/.test(f))], "the Font picker: the built-ins first, then every shared font but Vanguard's own")
    .toEqual([["Fira Sans Condensed", "the game's font"], true, true, false]);
  addon.eval('__pick("TEST-ONLY Font")');
  expect(addon.eval("return { (ns.Theme.Font()), (ns.Theme.Font(true)), (Vanguard_Options.title:GetFont()), Vanguard_Options.reload:IsShown() }"), "picking a shared font uses it for all text at once, no reload")
    .toEqual(["Interface\\AddOns\\TestOnly\\Font.ttf", "Interface\\AddOns\\TestOnly\\Font.ttf", "Interface\\AddOns\\TestOnly\\Font.ttf", false]);
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
    for i = 1, 40 do lsm:Register("font", string.format("TEST-ONLY Font %02d", i), [[Interface\\AddOns\\TestOnly\\Font.ttf]]) end`);
  addon.eval('ns.Options.Show("general") __dropdown("Font")');
  const total = addon.eval('return #ns.Theme.SharedChoices("font", { {}, {} })');
  // The first choice the menu shows.
  const first = () => addon.eval("return __menuTexts()[1]");
  expect([addon.eval("return #__menuTexts()"), addon.eval("return Vanguard_Menu:GetHeight()"), first()], "16 of the choices, from the top").toEqual([16, 16 * 22 + 2, "Fira Sans Condensed"]);
  addon.wheel("Vanguard_Menu", -3);
  expect(first(), "the wheel scrolls down a choice per step").toBe("2002 Bold");
  addon.wheel("Vanguard_Menu", -100);
  expect([first(), addon.eval("return __menuTexts()[16]")], "and stops at the end of the list").toEqual([addon.eval(`return ns.Theme.SharedChoices("font", { {}, {} })[${total - 15}][2]`), "TEST-ONLY Font 40"]);
  addon.wheel("Vanguard_Menu", 100);
  expect(first(), "and at the top").toBe("Fira Sans Condensed");
  addon.eval('ns.Theme.Settings().font = "TEST-ONLY Font 10" ns.Widgets.CloseMenu() __dropdown("Font")');
  expect(addon.eval("local t = __menuTexts() return { t[16], Vanguard_Menu.items[16].check:IsShown() }"), "a menu opens scrolled to show the current choice, checked").toEqual(["TEST-ONLY Font 10", true]);
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
  expect(look(loggedIn(faction + 'GetLocale = function() return "deDE" end'))[0], "a German client gets Cinzel (it has the Latin accents)").toBe("Cinzel-SemiBold.ttf");
});

// TEST-ONLY game tab buttons shaped like the game's three tab templates, and a reader
// for a tab's accent line (the only OVERLAY texture T.Tab adds) and its art's alpha.
const TABS_LUA = `
  function __tab(keys, kind)
    local b = CreateFrame(kind or "Button", nil, UIParent)
    for _, k in ipairs(keys) do b[k] = b:CreateTexture(nil, "BACKGROUND") end
    b.Icon = b:CreateTexture(nil, "ARTWORK")
    return b
  end
  function __line(b)
    for _, r in ipairs({ b:GetRegions() }) do if r.__layer == "OVERLAY" then return r end end
  end
`;

it("game tabs: art faded, icon kept, a panel, and an accent line that follows the game's selection", () => {
  const addon = loggedIn(TABS_LUA);
  const panelTab = addon.eval(`
    local tab = __tab({ "Left", "Middle", "Right", "LeftActive", "MiddleActive", "RightActive" })
    ns.Theme.Tab(tab) ns.Theme.Tab(tab) __panelTab = tab
    local line = __line(tab)
    local before = line:IsShown()
    tab:Disable() local selected = line:IsShown()
    tab:Enable() local after = line:IsShown()
    return { tab.Left.__alpha, tab.RightActive.__alpha, tab.Icon.__alpha == nil, before, selected, after }`);
  expect(panelTab, "a panel tab: art faded, icon left, the line shows only while the game has it disabled (selected)").toEqual([0, 0, true, false, true, false]);
  const sideTab = addon.eval(`
    local tab = __tab({ "Background", "SelectedTexture", "HighlightTexture" })
    function tab:SetChecked(on) self.SelectedTexture:SetShown(on) end
    ns.Theme.Tab(tab)
    tab:SetChecked(true) local on = __line(tab):IsShown()
    tab:SetChecked(false)
    return { tab.Background.__alpha, tab.SelectedTexture.__alpha, on, __line(tab):IsShown() }`);
  expect(sideTab, "a side tab follows SetChecked").toEqual([0, 0, true, false]);
  const systemTab = addon.eval(`
    local tab = __tab({ "Left", "Middle", "Right" })
    function tab:SetTabSelected(on) self.isSelected = on end
    ns.Theme.Tab(tab)
    tab:SetTabSelected(true) local on = __line(tab):IsShown()
    tab:Disable()
    tab:SetTabSelected(false)
    return { on, __line(tab):IsShown() }`);
  expect(systemTab, "a tab-system tab follows SetTabSelected, not its enabled state").toEqual([true, false]);
  const frameTab = addon.eval(`
    local tab = __tab({ "Background", "SelectedTexture" }, "Frame")
    function tab:HookScript(name, fn) if name == "OnEnable" or name == "OnDisable" then error("Frame doesn't have a " .. name .. " script") end end
    function tab:SetChecked(on) end
    ns.Theme.Tab(tab) tab:SetChecked(true)
    return __line(tab):IsShown()`);
  expect(frameTab, "a side tab that is a Frame (no OnEnable script) still follows SetChecked").toBe(true);
  expect(addon.eval("return #ns.errors"), "and nothing is reported").toBe(0);
  const bare = addon.eval("local b = CreateFrame('Button', nil, UIParent) ns.Theme.Tab(b) return __line(b) ~= nil");
  expect(bare, "a button with none of the parts is panelled, nothing errors").toBe(true);
  addon.eval("__panelTab:Disable() ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(addon.eval("return __line(__panelTab).__vertexColor[3]"), "the line follows the accent").toBeCloseTo(0.3);
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

it("the game's scroll bars: track art faded, a raised thumb with an accent edge under the mouse, flat arrows", () => {
  const addon = loggedIn(SCROLL_LUA);
  const minimal = addon.eval(`
    local bar = __bar() ns.Theme.ScrollBar(bar) ns.Theme.ScrollBar(bar)
    local thumb = bar.Track.Thumb
    thumb.__scripts.OnEnter(thumb)
    local accent = { ns.Theme.Accent() }
    local edged
    for _, r in ipairs({ thumb:GetRegions() }) do if r.__vertexColor and r.__vertexColor[1] == accent[1] and r.__vertexColor[3] == accent[3] then edged = true end end
    thumb.__scripts.OnLeave(thumb)
    return { bar.Track.Begin.__alpha, thumb.Middle.__alpha, bar.Back.Texture.__alpha, edged == true,
      bar.Back.vgArrow.__texCoord[3], bar.Forward.vgArrow.__texCoord == nil }`);
  expect(minimal, "faded, accent under the mouse, the up arrow is the Down icon turned over").toEqual([0, 0, 0, true, 1, true]);
  const trim = addon.eval("local bar = __bar(true) ns.Theme.ScrollBar(bar) return { bar.Background.__alpha, bar.Track.Thumb.Middle.__alpha }");
  expect(trim, "the trim bar's background goes too").toEqual([0, 0]);
  expect(addon.eval("local f = CreateFrame('Frame', nil, UIParent) f.Back = CreateFrame('Button', nil, f) ns.Theme.ScrollBar(f) return f.Back.vgArrow == nil"), "a frame without a thumb is left alone").toBe(true);
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
