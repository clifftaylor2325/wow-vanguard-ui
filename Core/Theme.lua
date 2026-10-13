-- The Vanguard look ("Slate & Brass"): flat dark panels, 1px borders,
-- one accent color and one font. Primitives take a frame and paint it; each
-- is idempotent (a second call just repaints) and every painted frame
-- follows live color changes. Textures are solid colors (WHITE8X8), so
-- nothing depends on art from another addon.
--
-- Every color the addon uses is a named token below. Modules ask for them
-- by name (T.RGB, T.Color, T.Tint, T.BarColor) and never write color
-- numbers themselves; scripts/lib/code-quality.mjs checks that.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgArrow = ns.FrameState("vgArrow")
local vgChecked = ns.FrameState("vgChecked")
local vgFader = ns.FrameState("vgFader")

local T = {}
ns.Theme = T

T.WHITE = "Interface\\Buttons\\WHITE8X8"

-- Vanguard's own art and fonts (made by scripts/build-media.mjs and scripts/fonts).
T.MEDIA = "Interface\\AddOns\\Vanguard\\Media\\"
T.FONTS = {
  regular = T.MEDIA .. "Fonts\\FiraSansCondensed-Medium.ttf",
  bold = T.MEDIA .. "Fonts\\FiraSansCondensed-SemiBold.ttf",
  -- The faction look's heading fonts (window titles and headings only).
  alliance = T.MEDIA .. "Fonts\\Cinzel-SemiBold.ttf",
  horde = T.MEDIA .. "Fonts\\Metamorphous-Regular.ttf",
}
-- The faction look's crest (Media/Art) and its color, by faction.
T.CRESTS = { Alliance = { "lorc-crossed-swords", "allianceCrest" }, Horde = { "lorc-crossed-axes", "hordeCrest" } }
-- Text roles that take the faction's heading font.
T.HEADING_ROLES = { title = true, heading = true }
-- Clients whose script the bundled font doesn't cover use the game's font.
local CLIENT_FONT_LOCALES = { koKR = true, zhCN = true, zhTW = true }
-- Clients whose script the faction look's heading fonts (Cinzel, Metamorphous:
-- Latin only) don't cover keep Fira Sans for headings: Russian names and titles.
local LATIN_HEADING_MISSING = { ruRU = true }

-- A texture from Media/Textures (Bar, Shadow, Glow, Stripes, LogoLeft, ...).
function T.Texture(name) return T.MEDIA .. "Textures\\" .. name end
-- An icon from Media/Icons (Close, Check, Down, Search, ...).
function T.Icon(name) return T.MEDIA .. "Icons\\" .. name end

-- r, g, b, a (0-1) from "rrggbb" and an optional alpha.
local function fromHex(hex, alpha)
  local n = tonumber(hex, 16)
  return { math.floor(n / 65536) / 255, math.floor(n / 256) % 256 / 255, n % 256 / 255, alpha or 1 }
end

-- Named colors: "rrggbb", or { "rrggbb", alpha }.
local TOKENS = {
  -- Surfaces, stepped about 0.04 apart in OKLCH lightness (#229): inset, panel, raised,
  -- raisedHover (an opaque control under the mouse), divider, borderHi (inner bevel, focus base).
  void = "0b0d11", panel = { "13161c", 0.94 }, raised = "1b1f26", inset = { "0c0e13", 0.95 },
  raisedHover = "262a32", borderHi = "43484f",
  edge = "000000", sheen = { "ffffff", 0.06 }, divider = "2f343d", shade = { "000000", 0.5 },
  hover = { "ffffff", 0.08 }, darkBar = "2a3039", checked = { "ffffff", 0.25 }, gridline = { "ffffff", 0.12 },
  textShadow = { "000000", 0.9 },
  -- The dark sweep over an aura icon as its time runs out.
  sweep = { "000000", 0.65 },
  -- The spark on the power bar (the five-second rule, energy ticks) and the swing timer.
  spark = { "ffffff", 0.9 },
  -- Text
  -- Text tiers, brightest first (#227): text, text2, muted; disabled only for disabled and placeholder text.
  text = "e8eaee", text2 = "c8cdd6", muted = "a6adb9", disabled = "7c8390", white = "ffffff", gold = "ffd100",
  -- State (kept apart from the accent), off the red-green axis (#235, after Okabe-Ito): a bluish
  -- green, an amber and a vermilion, each with a glyph where it stands alone (T.STATE_GLYPHS).
  good = "3fbf9a", warn = "f0b43c", bad = "e8663f", info = "5aa2f0", unknown = "808080",
  -- Reaction to you
  hostile = "cc4b45", neutral = "e0c24e", friendly = "4db86a",
  -- Resources
  mana = "3e7be0", rage = "cf4a3e", energy = "e6c24a", focus = "e0893c",
  -- Threat: yellow, orange, red
  threat1 = "e0c24e", threat2 = "ee8b3a", threat3 = "e0565b",
  -- Dispel types, and the highlight when the type is hidden
  magic = "3c8cf0", curse = "9a55e0", disease = "b08a3a", poison = "3fa34d", dispel = "cc4dff",
  -- Casts
  cast = "e6a93a", channel = "4fc27a", shielded = "8b9099",
  -- Healing overlays
  heal = { "4fc27a", 0.45 }, shield = { "ffffff", 0.35 },
  -- Action button tints
  outOfRange = "e64d4d", noPower = "6680ff", unusable = "666666",
  -- Experience and reputation
  xp = "940090", rested = { "0063e0", 0.5 },
  repHostile = "cc2121", repUnfriendly = "bf4500", repNeutral = "e6b300", repFriendly = "00991a",
  -- The faction look's crests: Alliance gold, Horde red
  allianceCrest = "d6b25a", hordeCrest = "c8453a",
  -- Zone text
  zoneSanctuary = "69ccf0", zoneFriendly = "1aff1a", zoneHostile = "ff1a1a", zoneContested = "ffb300",
}

-- Token name -> { r, g, b, a }.
T.TOKENS = {}
for name, v in pairs(TOKENS) do
  T.TOKENS[name] = type(v) == "table" and fromHex(v[1], v[2]) or fromHex(v)
end

-- Color assist (#235): with the colorAssist setting on, the reaction colors move off the red-green
-- axis, to a friendly blue, a neutral yellow and a hostile vermilion. Token name -> { r, g, b, a }.
T.ASSIST = { friendly = fromHex("4a9be8"), neutral = fromHex("e8d25a"), hostile = fromHex("e0663a") }

-- The glyph (under Media/Icons) that goes with a state color where it stands alone (#235).
T.STATE_GLYPHS = { good = "Check", warn = "Warn", bad = "Close" }

-- Accent presets for /vg accent and the options swatches, in display order.
-- Jade, orchid and copper (#231) keep clear of class, item quality and state colours.
T.PRESET_ORDER = { "brass", "arcane", "jade", "orchid", "copper" }
T.PRESETS = {
  brass = fromHex("d9a441"), arcane = fromHex("5aa2f0"), jade = fromHex("4fbfa3"),
  orchid = fromHex("b48ae8"), copper = fromHex("c8784a"),
}
-- Earlier preset names still work: fel, void and ember (before #231) and the names before them.
-- A profile keeps the colour it saved, so an earlier fel, void or ember pick stays as it was.
local ALIASES = {
  fel = "jade", void = "orchid", ember = "copper",
  blue = "arcane", bronze = "brass", green = "jade", purple = "orchid", red = "copper",
}
-- An earlier name read from T.PRESETS gives the preset it now stands for, so other code and addons
-- that read T.PRESETS.fel keep working (pairs over T.PRESETS still lists only the five).
setmetatable(T.PRESETS, { __index = function(_, name) return ALIASES[name] and T.PRESETS[ALIASES[name]] end })

local DEFAULTS = {
  accent = T.PRESETS.brass,
  panel = T.TOKENS.panel,
  inset = T.TOKENS.inset,
  border = T.TOKENS.edge,
  font = "",
  outline = "",
  pixelScale = false,
  -- Screen pixels per UI unit at pixel-perfect scale (a whole number; the Pixel-perfect screen preset sets it).
  pixelMultiple = 1,
  -- Texel snapping for still textures (borders, fills, dividers, sheens); off until the in-game A/B test (#226).
  texelSnap = false,
  -- Shadows and glows as one nine-slice texture each; off until the in-game check (#236).
  sliceRings = false,
  -- A subtle top-to-bottom lightness shift on floating windows' fills (#259); off by default.
  panelGradient = false,
  -- Experiments with 12.x client features (#239), each off until its in-game A/B check: world text
  -- (outlined roles) drawn with the SLUG font flag, and big windows drawn through a frame buffer
  -- while they open and close.
  slugText = false,
  frameBuffer = false,
  textScale = 1,
  barTexture = "vanguard",
  -- Soft shadows under HUD frames (unit frames, bars, minimap); floating windows always have one.
  hudShadow = false,
  -- Reaction colors off the red-green axis (#235, General -> Look; on reload).
  colorAssist = false,
  smoothBars = true,
  reduceMotion = false,
  sounds = true,
  -- The faction look: "auto" (by your faction) or "off".
  faction = "auto",
}

-- Painted frames: frame -> { kind, opts, parts }. Weak, so hidden frames
-- that get collected don't stay here.
local painted = setmetatable({}, { __mode = "k" })
local listeners = {}
-- Every crest texture (weak), repainted when the theme changes.
local crests = setmetatable({}, { __mode = "k" })

-- Theme settings in the active profile, with defaults.
function T.Settings()
  return ns.Settings("theme", DEFAULTS)
end

-- Profiles saved or exported before the rename (ForeverUI 0.3.0 and earlier)
-- call the bundled bar style "forever"; it is "vanguard" now.
local function renamedBarStyle(saved)
  if saved.barTexture == "forever" then saved.barTexture = "vanguard" end
end
ns.Migrate("theme", renamedBarStyle)

-- r, g, b of the accent color.
function T.Accent()
  local c = T.Settings().accent
  return c[1], c[2], c[3]
end

-- r, g, b, a of the panel (or, with inset, the darker inset) fill.
function T.PanelColor(inset)
  local c = T.Settings()[inset and "inset" or "panel"]
  return c[1], c[2], c[3], c[4]
end

-- The user-adjustable tokens live in the theme settings (the rest are fixed).
local SETTING_TOKENS = { accent = "accent", panel = "panel", inset = "inset", edge = "border" }

-- The accent's text and dim variants (#230), each { OKLCH lightness change, chroma factor }:
-- accentText is lighter, for accent-coloured text; accentDim is darker, for borders and
-- ornament only, never text. Brass d9a441 gives e6b45b and 8a6a2f.
T.ACCENT_VARIANTS = { accentText = { 0.047, 0.94 }, accentDim = { -0.207, 0.67 } }

-- An sRGB channel (0-1) in linear light, and back.
local function linear(c) return c <= 0.04045 and c / 12.92 or ((c + 0.055) / 1.055) ^ 2.4 end
-- A linear channel back in sRGB, clamped to 0-1 (a variant can fall outside the gamut).
local function gamma(c)
  c = math.max(0, math.min(1, c))
  return c <= 0.0031308 and c * 12.92 or 1.055 * c ^ (1 / 2.4) - 0.055
end

-- An sRGB colour in OKLab: L, a, b (Bjorn Ottosson's matrices).
local function toOklab(r, g, b)
  r, g, b = linear(r), linear(g), linear(b)
  local l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ^ (1 / 3)
  local m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ^ (1 / 3)
  local s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ^ (1 / 3)
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
end

-- An OKLab colour back in sRGB: r, g, b (0-1).
local function fromOklab(L, a, b)
  local l = (L + 0.3963377774 * a + 0.2158037573 * b) ^ 3
  local m = (L - 0.1055613458 * a - 0.0638541728 * b) ^ 3
  local s = (L - 0.0894841775 * a - 1.2914855480 * b) ^ 3
  return gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
end

-- Variant name -> { key = the accent it was made from, c = its colour }, so it's worked out once per accent.
local variants = {}

-- An accent variant's colour, made from the current accent (and cached until the accent changes).
local function accentVariant(name)
  local a, v, hit = T.Settings().accent, T.ACCENT_VARIANTS[name], variants[name]
  local key = string.format("%.6f %.6f %.6f", a[1], a[2], a[3])
  if hit and hit.key == key then return hit.c end
  local L, A, B = toOklab(a[1], a[2], a[3])
  local r, g, b = fromOklab(math.max(0, math.min(1, L + v[1])), A * v[2], B * v[2])
  variants[name] = { key = key, c = { r, g, b, 1 } }
  return variants[name].c
end

-- r, g, b, a of a named color (see TOKENS; accent, panel, inset and edge follow the settings,
-- accentText and accentDim follow the accent, and the reactions follow Color assist).
function T.RGB(name)
  local key = SETTING_TOKENS[name]
  local c = T.ACCENT_VARIANTS[name] and accentVariant(name) or key and T.Settings()[key]
    or T.Settings().colorAssist and T.ASSIST[name] or T.TOKENS[name]
  if not c then error("Vanguard: no color named " .. tostring(name), 2) end
  return c[1], c[2], c[3], c[4] or 1
end

-- "ffrrggbb" for a named color, for |c escape codes in chat and tooltip text.
function T.Hex(name)
  local r, g, b = T.RGB(name)
  return string.format("ff%02x%02x%02x", math.floor(r * 255 + 0.5), math.floor(g * 255 + 0.5), math.floor(b * 255 + 0.5))
end

-- Text wrapped in a named color's escape code.
function T.Paint(text, name)
  return "|c" .. T.Hex(name) .. text .. "|r"
end

-- Colors a region with a named color (vertex color), at an optional alpha.
function T.Tint(region, name, alpha)
  local r, g, b, a = T.RGB(name)
  region:SetVertexColor(r, g, b, alpha or a)
  return region
end

-- Colors a status bar's fill with a named color.
function T.BarColor(bar, name)
  bar:SetStatusBarColor(T.RGB(name))
  return bar
end

-- The game's own font.
local function clientFont()
  return STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF"
end

-- The client's locale ("enUS", "ruRU", ...), or "" when it can't say.
local function locale()
  return type(GetLocale) == "function" and GetLocale() or ""
end

-- True when the game's font must be used: chosen, or a Korean or Chinese client.
local function useClientFont(s)
  return s.font == "client" or CLIENT_FONT_LOCALES[locale()] == true
end

-- The font a chosen name stands for: a font shared through LibSharedMedia
-- (Core/SharedMedia.lua), a font path (older settings), or nil (its addon is gone).
local function chosenFont(name)
  return T.SharedPath("font", name) or (name:find("\\", 1, true) and name) or nil
end

-- The UI font path (bold: the SemiBold weight) and outline flag. Settings:
-- font "" is the bundled Fira Sans Condensed, "client" the game's font,
-- anything else a shared font's name; a name no longer shared falls back to Fira.
function T.Font(bold)
  local s = T.Settings()
  if useClientFont(s) then return clientFont(), s.outline end
  local chosen = s.font ~= "" and chosenFont(s.font)
  if chosen then return chosen, s.outline end
  return bold and T.FONTS.bold or T.FONTS.regular, s.outline
end

-- Parts --------------------------------------------------------------------------------

-- A solid-color texture on frame at a draw layer (and sublevel), of a snapping class (T.SNAP_CLASSES).
local function solid(frame, layer, sublevel, class)
  local t = frame:CreateTexture(nil, layer, nil, sublevel)
  t:SetTexture(T.WHITE)
  return T.Snap(t, class)
end

-- Texel snapping policy (#226): which classes of texture snap to the pixel grid while
-- texel snapping is on. Still lines and fills snap; anything that moves or scales
-- (bar fills, sparks, cooldown swipes) and art (icons, soft rings) stays off.
T.SNAP_CLASSES = { border = true, fill = true, divider = true, sheen = true, bar = false, spark = false, swipe = false, icon = false }
-- The sharpening bias a snapped texture gets (0 to 1).
T.SNAP_BIAS = 1
-- Every texture T.Snap has seen -> its class (weak), so a switch reaches them all.
local snapClass = setmetatable({}, { __mode = "k" })

-- Sets a texture's pixel-grid snapping for its class: on (with the bias) only for a still
-- class while texel snapping is on; off otherwise, as before #226.
local function applySnap(texture, class)
  local on = T.SNAP_CLASSES[class] == true and T.Settings().texelSnap == true
  texture:SetSnapToPixelGrid(on)
  texture:SetTexelSnappingBias(on and T.SNAP_BIAS or 0)
end

-- Puts a texture under the snapping policy for its class (default "icon": off, so 1 px
-- lines and icon edges stay crisp at any UI scale instead of blurring or jumping).
function T.Snap(texture, class)
  if texture.SetSnapToPixelGrid then
    snapClass[texture] = class or "icon"
    applySnap(texture, class or "icon")
  end
  return texture
end

-- Puts every texture T.Snap has seen under the policy again (after a switch or a profile load).
local function reSnap()
  for texture, class in pairs(snapClass) do applySnap(texture, class) end
end

-- Turns texel snapping for still textures on or off (the A/B test, #226), at once.
function T.SetTexelSnap(on)
  T.Settings().texelSnap = on == true
  reSnap()
end

-- Pixels ----------------------------------------------------------------------------

-- The screen's height in physical pixels (768 when the client can't say).
local function screenHeight()
  local get = _G.GetPhysicalScreenSize
  if type(get) ~= "function" then return 768 end
  local _, h = get()
  return type(h) == "number" and h > 0 and h or 768
end

-- A frame's effective scale (UIParent's, or 1, when it has none).
local function scaleOf(frame)
  local f = frame and frame.GetEffectiveScale and frame or UIParent
  local s = f and f.GetEffectiveScale and f:GetEffectiveScale()
  return type(s) == "number" and s > 0 and s or 1
end

-- One screen pixel in UI units at scale 1 (768 / screen height): the client's own
-- factor when PixelUtil has it, else worked out from the screen height.
local function pixelFactor()
  local util = _G.PixelUtil
  if type(util) == "table" and type(util.GetPixelToUIUnitFactor) == "function" then
    local factor = util.GetPixelToUIUnitFactor()
    if type(factor) == "number" and factor > 0 then return factor end
  end
  return 768 / screenHeight()
end

-- How long one screen pixel is in a frame's units, so a border of this size is
-- exactly one pixel at any UI scale. Never rounded to whole UI units: the client's
-- GetNearestPixelSize(1, scale, 1) would give 2 px at 1440p and 3 px at 4K.
function T.Pixel(frame)
  return pixelFactor() / scaleOf(frame)
end

-- The UI scale that makes one UI unit one screen pixel (768 / screen height).
function T.PixelPerfectScale()
  return pixelFactor()
end

-- How many screen pixels one UI unit covers at the current UI scale (1 at pixel-perfect scale).
function T.PixelsPerUnit()
  return scaleOf(UIParent) * screenHeight() / 768
end

-- Sizes asked for through T.PixelSize: frame -> { w, h, even }. Weak, so a frame that is
-- collected doesn't stay; a scale or screen change rounds them all again (T.Rescale).
local pixelSized = setmetatable({}, { __mode = "k" })
-- Called after every scale or screen change has been rounded again (T.OnScale).
local scaleListeners = {}

-- A length in frame's units rounded to whole screen pixels at its scale now
-- (mult * floor(x / mult + 0.5), mult being T.Pixel). With even it is an even
-- number of pixels, so a frame centred on an even-width parent stays on whole pixels.
function T.PixelRound(frame, length, even)
  local step = T.Pixel(frame) * (even and 2 or 1)
  return math.floor(length / step + 0.5) * step
end

-- Sizes a frame to w x h rounded to whole screen pixels (even counts with `even`, for
-- a centred frame), and remembers the size asked for, so T.Rescale rounds it again.
function T.PixelSize(frame, w, h, even)
  pixelSized[frame] = { w, h, even }
  frame:SetSize(T.PixelRound(frame, w, even), T.PixelRound(frame, h, even))
  return frame
end

-- Calls fn() (out of combat) after a UI scale, screen or frame scale change, once
-- T.PixelSize frames are rounded again: for layouts that place things on whole pixels.
function T.OnScale(fn)
  scaleListeners[#scaleListeners + 1] = fn
end

-- Rounds every T.PixelSize frame again for the scale now and tells the T.OnScale listeners.
local function resizeAll()
  for frame, s in pairs(pixelSized) do frame:SetSize(T.PixelRound(frame, s[1], s[3]), T.PixelRound(frame, s[2], s[3])) end
  for _, fn in ipairs(scaleListeners) do fn() end
end

-- After a scale change: rounds the remembered sizes again on the next frame, once however
-- often it is asked for, and out of combat (some of them are secure frames).
function T.Rescale()
  ns.Soon("pixel sizes", function() ns.OutOfCombat(resizeAll, "pixel sizes") end)
end

-- Where a frame's border is drawn: a status bar's on top (its fill would cover
-- a BORDER-layer line), anything else's under its content.
local function edgeLayer(frame)
  local bar = frame.GetObjectType and frame:GetObjectType() == "StatusBar"
  if bar then return "OVERLAY", 7 end
  return "BORDER", 0
end

-- The x, y that move an anchor at `point` (TOPLEFT, BOTTOM...) `pad` units out past the frame's edge.
local function outward(point, pad)
  local x = point:find("LEFT") and -pad or (point:find("RIGHT") and pad or 0)
  local y = point:find("TOP") and pad or (point:find("BOTTOM") and -pad or 0)
  return x, y
end

-- Anchors a part's `point` to the same point of frame, `pad` units (default none, rounded to
-- whole screen pixels) out past its edge.
local function pin(t, frame, point, pad)
  t:SetPoint(point, frame, point, outward(point, T.PixelRound(frame, pad or 0)))
end

-- The two corners each edge texture runs between.
local EDGE_POINTS = {
  top = { "TOPLEFT", "TOPRIGHT" }, bottom = { "BOTTOMLEFT", "BOTTOMRIGHT" },
  left = { "TOPLEFT", "BOTTOMLEFT" }, right = { "TOPRIGHT", "BOTTOMRIGHT" },
}

-- Four edge textures around frame, `pad` units out past its edges (sized to one pixel when painted).
local function edges(frame, pad)
  local layer, sub = edgeLayer(frame)
  local e = { top = solid(frame, layer, sub, "border"), bottom = solid(frame, layer, sub, "border"), left = solid(frame, layer, sub, "border"), right = solid(frame, layer, sub, "border") }
  for side, points in pairs(EDGE_POINTS) do
    pin(e[side], frame, points[1], pad)
    pin(e[side], frame, points[2], pad)
  end
  return e
end

-- Sizes the edges to one screen pixel for frame.
local function sizeEdges(e, frame)
  local px = T.Pixel(frame)
  e.top:SetHeight(px); e.bottom:SetHeight(px)
  e.left:SetWidth(px); e.right:SetWidth(px)
end

-- The sheen: a one-pixel light line just inside the top border (placed when painted).
local function sheen(frame)
  return solid(frame, "BORDER", nil, "sheen")
end

-- Places the sheen just inside the top border (`pad` units out past the frame's top), one pixel tall:
-- on the first row inside it, or the `row`th (a bevelled panel keeps row 1 for its bevel line).
-- (A button's hover line sits on row 1, in `token`.)
local function placeSheen(t, frame, pad, token, row)
  local px, out = T.Pixel(frame), T.PixelRound(frame, pad or 0)
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", frame, "TOPLEFT", px - out, out - px * (row or 1))
  t:SetPoint("TOPRIGHT", frame, "TOPRIGHT", out - px, out - px * (row or 1))
  t:SetHeight(px)
  T.Tint(t, token or "sheen")
end

-- The inner bevel (#234) on buttons and raised panels: { token, alpha } of the light line along the
-- top inner edge and the dark one along the bottom inner edge, each one pixel, just inside the border.
T.BEVEL = { top = { "borderHi", 0.35 }, bottom = { "shade", 0.35 } }

-- Places one bevel line (side "TOP" or "BOTTOM") on the first row inside frame's border, `out` past it.
local function placeBevelLine(t, frame, side, out)
  local px, y = T.Pixel(frame), side == "TOP" and out - T.Pixel(frame) or T.Pixel(frame) - out
  t:ClearAllPoints()
  t:SetPoint(side .. "LEFT", frame, side .. "LEFT", px - out, y)
  t:SetPoint(side .. "RIGHT", frame, side .. "RIGHT", out - px, y)
  t:SetHeight(px)
  T.Tint(t, T.BEVEL[side:lower()][1], T.BEVEL[side:lower()][2])
end

-- Places and tints a frame's bevel lines (`pad` units out past the frame).
local function placeBevelLines(bevel, frame, pad)
  local out = T.PixelRound(frame, pad or 0)
  placeBevelLine(bevel.top, frame, "TOP", out)
  placeBevelLine(bevel.bottom, frame, "BOTTOM", out)
end

-- How far a shadow reaches past its frame. It sits evenly around the frame:
-- a drop left an uncovered sliver under the frame (the ring has no middle),
-- so the shadow looked detached below it.
local SHADOW_SIZE = 10

-- The eight pieces of a shadow: texcoords (left, right, top, bottom) in
-- Media/Textures/Shadow, anchors { piece point, frame point }, and which
-- side stretches (w: along the height, h: along the width; corners are square).
local SHADOW_PIECES = {
  { tc = { 0, 0.25, 0, 0.25 }, at = { { "BOTTOMRIGHT", "TOPLEFT" } } },
  { tc = { 0.75, 1, 0, 0.25 }, at = { { "BOTTOMLEFT", "TOPRIGHT" } } },
  { tc = { 0, 0.25, 0.75, 1 }, at = { { "TOPRIGHT", "BOTTOMLEFT" } } },
  { tc = { 0.75, 1, 0.75, 1 }, at = { { "TOPLEFT", "BOTTOMRIGHT" } } },
  { tc = { 0.25, 0.75, 0, 0.25 }, at = { { "BOTTOMLEFT", "TOPLEFT" }, { "BOTTOMRIGHT", "TOPRIGHT" } }, h = true },
  { tc = { 0.25, 0.75, 0.75, 1 }, at = { { "TOPLEFT", "BOTTOMLEFT" }, { "TOPRIGHT", "BOTTOMRIGHT" } }, h = true },
  { tc = { 0, 0.25, 0.25, 0.75 }, at = { { "TOPRIGHT", "TOPLEFT" }, { "BOTTOMRIGHT", "BOTTOMLEFT" } }, w = true },
  { tc = { 0.75, 1, 0.25, 0.75 }, at = { { "TOPLEFT", "TOPRIGHT" }, { "BOTTOMLEFT", "BOTTOMRIGHT" } }, w = true },
}

-- A length rounded to whole screen pixels at frame's scale (at least one).
local function wholePixels(frame, length)
  local px = T.Pixel(frame)
  return math.max(1, math.floor(length / px + 0.5)) * px
end

-- One piece of a nine-slice ring around frame: look = { texture, size, layer, sublevel }.
-- Pixel-snapped and a whole number of pixels thick, so every side meets the
-- frame's edge exactly at any UI scale.
local function ringPiece(frame, piece, look)
  local t = T.Snap(frame:CreateTexture(nil, look.layer, nil, look.sublevel))
  t:SetTexture(T.Texture(look.texture))
  t:SetTexCoord(unpack(piece.tc))
  for _, a in ipairs(piece.at) do t:SetPoint(a[1], frame, a[2], outward(a[2], T.PixelRound(frame, look.pad or 0))) end
  local size = wholePixels(frame, look.size)
  if not piece.w then t:SetHeight(size) end
  if not piece.h then t:SetWidth(size) end
  return t
end

-- Nine-slice rings (#236): with the setting on (theme.sliceRings, /vg nineslice), a shadow or glow
-- is one texture the client slices itself, its corners T.SLICE_MARGIN texture pixels (a quarter of
-- the 64-pixel art), stretched (the client's default slice mode). Off until the in-game check
-- shows how big the client draws the margins; the eight pieces stay the fallback.
T.SLICE_MARGIN = 16
-- Sliced ring textures (weak), so T.SizeGlow knows to move one texture, not eight.
local slicedRing = setmetatable({}, { __mode = "k" })

-- Places a sliced ring `size` units out past frame's edges (and `pad` more), in whole pixels.
local function placeSliced(t, frame, size, pad)
  local out = T.PixelRound(frame, pad or 0) + wholePixels(frame, size)
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", frame, "TOPLEFT", -out, out)
  t:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", out, -out)
end

-- One sliced texture as a ring around frame: { texture }, or nil (and the texture hidden) when
-- the client can't slice textures.
local function sliced(frame, look, t)
  if not t.SetTextureSliceMargins then return t:Hide() end
  t:SetTexture(T.Texture(look.texture))
  t:SetTextureSliceMargins(T.SLICE_MARGIN, T.SLICE_MARGIN, T.SLICE_MARGIN, T.SLICE_MARGIN)
  placeSliced(t, frame, look.size, look.pad)
  slicedRing[t] = true
  return { t }
end

-- A soft ring (shadow or glow) around frame: one sliced texture with the setting on and a
-- client that can, else eight pieces.
local function ring(frame, look)
  local one = T.Settings().sliceRings and sliced(frame, look, T.Snap(frame:CreateTexture(nil, look.layer, nil, look.sublevel)))
  if one then return one end
  local pieces = {}
  for i, piece in ipairs(SHADOW_PIECES) do pieces[i] = ringPiece(frame, piece, look) end
  return pieces
end

-- A soft shadow around frame (or around its panel, `pad` units out), behind everything else on it:
-- SHADOW_SIZE units, or `size` when it is a number (a slot's is smaller).
local function shadow(frame, size, pad)
  return ring(frame, { texture = "Shadow", size = type(size) == "number" and size or SHADOW_SIZE, layer = "BACKGROUND", sublevel = -8, pad = pad })
end

-- A glow ring around frame (hidden until T.ShowGlow), size units wide.
function T.Glow(frame, size)
  local pieces = ring(frame, { texture = "Glow", size = size or 8, layer = "BACKGROUND", sublevel = -7 })
  for _, t in ipairs(pieces) do t:Hide() end
  return pieces
end

-- Shows a glow in a named color (default the accent), or hides it.
function T.ShowGlow(glow, on, color)
  for _, t in ipairs(glow) do
    t:SetShown(on == true)
    if on then T.Tint(t, color or "accent") end
  end
end

-- Resizes a glow ring (T.Glow) to a whole number of screen pixels wide at
-- frame's scale now (call again when its scale changes).
function T.SizeGlow(glow, frame, pixels)
  local size = pixels * T.Pixel(frame)
  if slicedRing[glow[1]] then return placeSliced(glow[1], frame, size) end
  for i, t in ipairs(glow) do
    if not SHADOW_PIECES[i].w then t:SetHeight(size) end
    if not SHADOW_PIECES[i].h then t:SetWidth(size) end
  end
end

-- Bars ---------------------------------------------------------------------------------------

-- The status bar texture the setting picks: the bundled Bar (Vanguard), the
-- calmer BarSoft (Soft), flat, or a bar texture shared through LibSharedMedia
-- by name (Vanguard when that name is no longer shared).
function T.BarTexture()
  local pick = T.Settings().barTexture
  if pick == "flat" then return T.WHITE end
  if pick == "soft" then return T.Texture("BarSoft") end
  return pick ~= "vanguard" and T.SharedPath("statusbar", pick) or T.Texture("Bar")
end

-- A soft spark (Media/Textures/Spark) on a bar's top layer, width units wide,
-- drawn additively so it brightens the fill under it. The caller places and tints it.
function T.Spark(bar, width)
  local t = T.Snap(bar:CreateTexture(nil, "OVERLAY"), "spark")
  t:SetTexture(T.Texture("Spark"))
  t:SetBlendMode("ADD")
  t:SetWidth(width)
  return t
end

-- Gives a status bar the theme's bar texture.
function T.StyleBar(bar)
  bar:SetStatusBarTexture(T.BarTexture())
  T.Snap(bar:GetStatusBarTexture(), "bar")
  return bar
end

-- Sets a bar's value, eased by the client when it can and smoothing is on.
-- The client does the easing, so hidden values work the same way.
function T.SetBarValue(bar, value)
  if T.Settings().smoothBars and ns.Client.Has("barEase") then return bar:SetValue(value, Enum.StatusBarInterpolation.ExponentialEaseOut) end
  bar:SetValue(value)
end

-- Sets the color of every edge.
local function colorEdges(e, r, g, b, a)
  for _, t in pairs(e) do
    t:SetVertexColor(r, g, b, a or 1)
  end
end

-- Scratch tables for T.FadeRegions, reused by every call (and emptied after,
-- so they hold no frame): Vanguard's own parts, and the frame's regions.
local ownScratch, regionScratch, NO_PARTS = {}, {}, {}

-- The textures Vanguard painted on a frame (its panel, border, sheen,
-- shadow...), so fading the game's art again leaves them alone.
local function ownParts(frame)
  local entry = painted[frame]
  for _, part in pairs(entry and entry.parts or NO_PARTS) do
    if type(part) == "table" and part.GetObjectType then ownScratch[part] = true
    elseif type(part) == "table" then for _, p in pairs(part) do ownScratch[p] = true end end
  end
  return ownScratch
end

-- The regions given, in the regions scratch table (from index i on).
local function gather(i, region, ...)
  if region == nil then regionScratch[i] = nil return end
  regionScratch[i] = region
  return gather(i + 1, ...)
end

-- Alpha-out a frame's texture regions (template art), except Vanguard's own
-- painted parts and any in keep. Never hides; safe to run again on every show.
function T.FadeRegions(frame, keep)
  local own = ownParts(frame)
  gather(1, frame:GetRegions())
  for i, region in ipairs(regionScratch) do
    if region.GetObjectType and region:GetObjectType() == "Texture" and not own[region] and not (keep and keep[region]) then region:SetAlpha(0) end
    regionScratch[i] = nil
  end
  for part in pairs(own) do own[part] = nil end
end

-- Painting -------------------------------------------------------------------------

-- The border color for a painted entry: a color set with T.SetBorder, the
-- accent when asked for, else the theme border.
local function borderColor(entry)
  local own = entry.opts.border
  if own then return own[1], own[2], own[3], 1 end
  if entry.opts.accent then return T.Accent() end
  local c = T.Settings().border
  return c[1], c[2], c[3], c[4]
end

-- The panel gradient (#259): the OKLCH lightness change at a large panel's bottom and top edge, so
-- the fill runs about 2.4 % lighter from bottom to top (more bands; less doesn't read).
T.PANEL_GRADIENT = { -0.012, 0.012 }

-- A colour d lighter in OKLCH lightness (darker when d < 0), as a client Color at alpha a.
local function lighter(r, g, b, a, d)
  local L, A, B = toOklab(r, g, b)
  local r2, g2, b2 = fromOklab(L + d, A, B)
  return CreateColor(r2, g2, b2, a)
end

-- Runs a large panel's fill (a floating window's: opts.shadow, or opts.gradient) a shade lighter
-- toward its top while the panelGradient setting is on (VERTICAL runs bottom to top).
local function shadeBg(bg, opts, r, g, b, a)
  if not (T.Settings().panelGradient and (opts.shadow or opts.gradient) and bg.SetGradient) then return end
  bg:SetGradient("VERTICAL", lighter(r, g, b, a, T.PANEL_GRADIENT[1]), lighter(r, g, b, a, T.PANEL_GRADIENT[2]))
end

-- Colors a painted background: panel, inset or raised color (or the opts.fill
-- token), at opts.alpha if given, shaded top to bottom where shadeBg says.
local function paintBg(bg, opts)
  local r, g, b, a = T.PanelColor(opts.inset)
  if opts.raised then r, g, b, a = T.RGB("raised") end
  if opts.fill then r, g, b, a = T.RGB(opts.fill) end
  bg:SetVertexColor(r, g, b, opts.alpha or a)
  shadeBg(bg, opts, r, g, b, opts.alpha or a)
end

-- Applies the current colors (and pixel size) to one painted frame.
local function repaint(frame, entry)
  local p = entry.parts
  if p.bg then paintBg(p.bg, entry.opts) end
  if p.edges then
    colorEdges(p.edges, borderColor(entry))
    sizeEdges(p.edges, frame)
  end
  if p.sheen then placeSheen(p.sheen, frame, entry.opts.pad, nil, p.bevel and 2) end
  if p.bevel then placeBevelLines(p.bevel, frame, entry.opts.pad) end
  if entry.paint then entry.paint(entry, frame) end
end

-- A background texture over frame, `pad` units out past its edges.
local function background(frame, pad)
  local bg = solid(frame, "BACKGROUND", nil, "fill")
  pin(bg, frame, "TOPLEFT", pad)
  pin(bg, frame, "BOTTOMRIGHT", pad)
  return bg
end

-- The parts opts ask for: background, edges, sheen (with a background), a bevel (opts.bevel, or a
-- raised panel with a border, unless opts.noBevel) and shadow, opts.pad units out past frame.
local function makeParts(frame, opts)
  local parts = {}
  parts.bg = not opts.noBg and background(frame, opts.pad) or nil
  parts.edges = not opts.noBorder and edges(frame, opts.pad) or nil
  parts.sheen = parts.bg and not opts.noSheen and sheen(frame) or nil
  local bevelled = parts.edges and not opts.noBevel and (opts.bevel or opts.raised)
  parts.bevel = bevelled and { top = solid(frame, "BORDER", 1, "border"), bottom = solid(frame, "BORDER", 1, "border") } or nil
  parts.shadow = opts.shadow and shadow(frame, opts.shadow, opts.pad) or nil
  return parts
end

-- Creates (once) the parts for frame; returns its entry.
local function base(frame, kind, opts)
  local entry = painted[frame]
  if not entry then
    entry = { kind = kind, opts = opts or {} }
    entry.parts = makeParts(frame, entry.opts)
    painted[frame] = entry
  end
  return entry
end

-- Primitives -----------------------------------------------------------------------

-- A flat dark panel with a one-pixel border and a faint sheen along the
-- top. opts: inset (darker) or raised (lighter), accent (accent border),
-- alpha (fill opacity), shadow (soft drop shadow, for floating windows),
-- pad (draw it all that many units out past the frame's edges: room around
-- a game window's contents), gradient (the panel gradient without a shadow), noBorder, noBg, noSheen.
function T.Panel(frame, opts)
  local entry = base(frame, "panel", opts)
  repaint(frame, entry)
  return frame
end

-- A panel for the HUD (unit frames, bars, the minimap...): T.Panel without
-- the sheen, and with a soft shadow only when "Soft shadows under frames" is
-- on, so the screen stays calm. Floating windows use T.Panel's shadow.
function T.HudPanel(frame, opts)
  local o = {}
  for k, v in pairs(opts or {}) do o[k] = v end
  o.noSheen, o.shadow = true, T.Settings().hudShadow == true
  return T.Panel(frame, o)
end

-- Sets a painted frame's border to { r, g, b }, or back to the theme's with nil.
function T.SetBorder(frame, rgb)
  local entry = painted[frame]
  if not entry then return end
  entry.opts.border = rgb
  repaint(frame, entry)
end

-- How far a painted panel reaches out past its frame (units; 0 when it doesn't, or the frame isn't painted).
function T.Padding(frame)
  local entry = painted[frame]
  return entry and entry.opts.pad or 0
end

-- Places a button's hover line (one pixel inside its top border, in borderHi) when it is painted.
local function paintHoverLine(entry, button)
  placeSheen(entry.parts.hoverLine, button, entry.opts.pad, "borderHi")
end

-- Each themed button's hover parts (weak; kept off the button, which may be one of the game's).
local hoverOf = setmetatable({}, { __mode = "k" })

-- A button's hover parts, { fill, line }, or nil for a button T.Button never painted.
function T.HoverParts(button) return hoverOf[button] end

-- A button's hover look (#257): a raisedHover fill over its inset fill and a one-pixel borderHi
-- line along its top, both clear until the mouse comes over it (T.EaseHover eases them).
local function hoverParts(button, entry)
  local fill = T.Tint(solid(button, "BACKGROUND", 1, "fill"), "raisedHover")
  fill:SetAllPoints()
  entry.parts.hover, entry.parts.hoverLine, entry.paint = fill, solid(button, "BORDER", 2, "border"), paintHoverLine
  hoverOf[button] = { fill, entry.parts.hoverLine }
  for _, t in ipairs(hoverOf[button]) do t:SetAlpha(0) end
  button:HookScript("OnEnter", ns.Guard("button hover", function(b) T.EaseHover(b, true) end))
  button:HookScript("OnLeave", ns.Guard("button hover", function(b) T.EaseHover(b, false) end))
  button:HookScript("OnHide", ns.Guard("button hover", function(b) T.EaseHover(b, false, true) T.PressButton(b, false) end))
end

-- Each frame's keyboard focus ring (weak): { gap = edges, ring = edges }.
local focusOf = setmetatable({}, { __mode = "k" })

-- Pins a set of edges `pixels` screen pixels out past frame, one pixel thick, in a colour.
local function ringAt(e, frame, pixels, token)
  for side, points in pairs(EDGE_POINTS) do
    pin(e[side], frame, points[1], pixels * T.Pixel(frame))
    pin(e[side], frame, points[2], pixels * T.Pixel(frame))
    T.Tint(e[side], token)
  end
  sizeEdges(e, frame)
end

-- A frame's focus ring parts, { gap = edges, ring = edges }, or nil before it ever had one.
function T.FocusParts(frame) return focusOf[frame] end

-- Shows (or hides) a keyboard focus ring around frame (#257): a one-pixel accentText ring outside
-- a one-pixel black gap, placed at the frame's pixel size each time, never animated.
function T.FocusRing(frame, on)
  if not focusOf[frame] and not on then return end
  local f = focusOf[frame] or { gap = edges(frame), ring = edges(frame) }
  focusOf[frame] = f
  ringAt(f.gap, frame, 1, "edge")
  ringAt(f.ring, frame, 2, "accentText")
  for _, e in pairs(f) do for _, t in pairs(e) do t:SetShown(on == true) end end
end

-- How a pressed button looks (#257): a shade overlay at T.PRESS[2] over its fill (one step darker)
-- and its own label (button.text) T.PRESS.drop screen pixels lower, at once, while the mouse is held.
T.PRESS = { "shade", 0.3, drop = 1 }
-- Each themed button's press state (weak): { overlay = texture, ys = its label's anchor ys before the press }.
local pressOf = setmetatable({}, { __mode = "k" })

-- Moves a button's own label (button.text) T.PRESS.drop pixels down (down) or back to where it was,
-- every anchor at once; never on a protected button (its regions can't move in a fight).
local function dropLabel(button, state, down)
  local fs = button.text
  if type(fs) ~= "table" or not fs.GetNumPoints or button.IsProtected and button:IsProtected() then return end
  local points, drop = {}, T.PRESS.drop * T.Pixel(button)
  for i = 1, fs:GetNumPoints() do points[i] = { fs:GetPoint(i) } end
  if down then state.ys = {} end
  for i, p in ipairs(points) do
    if down then state.ys[i] = p[5] end
    fs:SetPoint(p[1], p[2], p[3], p[4], down and p[5] - drop or state.ys and state.ys[i] or p[5])
  end
end

-- A themed button's press overlay, or nil for a button T.Button never painted.
function T.PressOverlay(button) return pressOf[button] and pressOf[button].overlay end

-- Shows or hides a button's press look; only an enabled button shows it.
function T.PressButton(button, down)
  local s = pressOf[button]
  if not s then return end
  local on = down == true and (not button.IsEnabled or button:IsEnabled())
  if on == s.overlay:IsShown() then return end
  s.overlay:SetShown(on)
  dropLabel(button, s, on)
end

-- Each disabled themed button's label colour from before (weak), given back when it's enabled.
local labelBefore = setmetatable({}, { __mode = "k" })

-- Gives a button its disabled look (#257): no hover or press, its label in the disabled tier; or,
-- enabled again, the label's colour from before.
function T.DisabledLook(button, disabled)
  local fs = type(button.text) == "table" and button.text or button.GetFontString and button:GetFontString()
  if disabled then T.EaseHover(button, false, true) T.PressButton(button, false) end
  if not (fs and fs.GetTextColor) then return end
  if disabled then labelBefore[button] = labelBefore[button] or { fs:GetTextColor() } return T.Color(fs, "disabled") end
  local c = labelBefore[button]
  labelBefore[button] = nil
  if c then T.Color(fs, c[1], c[2], c[3]) end
end

-- A button's press and disabled looks (#257): the hidden overlay, and hooks on the mouse and on
-- its state (pcall: a widget without OnEnable/OnDisable can't have them hooked).
local function stateParts(button)
  local t = T.Tint(solid(button, "BACKGROUND", 2, "fill"), T.PRESS[1], T.PRESS[2])
  t:SetAllPoints()
  t:Hide()
  pressOf[button] = { overlay = t }
  button:HookScript("OnMouseDown", ns.Guard("button press", function(b) T.PressButton(b, true) end))
  button:HookScript("OnMouseUp", ns.Guard("button press", function(b) T.PressButton(b, false) end))
  pcall(button.HookScript, button, "OnDisable", ns.Guard("button state", function(b) T.DisabledLook(b, true) end))
  pcall(button.HookScript, button, "OnEnable", ns.Guard("button state", function(b) T.DisabledLook(b, false) end))
end

-- A flat button: inset panel with a bevel, template art faded, an eased hover (raisedHover and a
-- borderHi top line), a press look and a disabled look.
function T.Button(button)
  local fresh = not painted[button]
  local entry = base(button, "button", { inset = true, bevel = true })
  if fresh then
    T.FadeRegions(button, { [entry.parts.bg] = true })
    hoverParts(button, entry)
    stateParts(button)
  end
  repaint(button, entry)
  if button.IsEnabled and not button:IsEnabled() then T.DisabledLook(button, true) end
  return button
end

-- A near-black input box with a border; template art faded.
function T.EditBox(box)
  local fresh = not painted[box]
  local entry = base(box, "editbox", { inset = true })
  if fresh then
    T.FadeRegions(box, { [entry.parts.bg] = true })
  end
  repaint(box, entry)
  return box
end

-- How far a slot's soft shadow reaches (units): small, so a row of slots keeps its gaps.
T.SLOT_SHADOW = 3
-- How a slot's accent edge changes with the button's state: toward white
-- (more than 0: the mouse is over it) or toward black (less: it is pressed).
T.SLOT_STATES = { hover = 0.4, pressed = -0.45 }
-- Where each side of a ring one pixel inside a frame's border is anchored: { point, x, y } in pixels.
local INNER = {
  top = { { "TOPLEFT", 1, -1 }, { "TOPRIGHT", -1, -1 } }, bottom = { { "BOTTOMLEFT", 1, 1 }, { "BOTTOMRIGHT", -1, 1 } },
  left = { { "TOPLEFT", 1, -1 }, { "BOTTOMLEFT", 1, 1 } }, right = { { "TOPRIGHT", -1, -1 }, { "BOTTOMRIGHT", -1, 1 } },
}

-- r, g, b of the accent moved `amount` of the way toward white (amount > 0) or black (amount < 0).
local function shadeAccent(amount)
  local r, g, b = T.Accent()
  local to, k = amount > 0 and 1 or 0, math.abs(amount)
  return r + (to - r) * k, g + (to - g) * k, b + (to - b) * k
end

-- Places a ring of edge textures one pixel inside frame's border, one pixel thick.
local function placeInner(e, frame)
  local px = T.Pixel(frame)
  for side, points in pairs(INNER) do
    e[side]:ClearAllPoints()
    for _, p in ipairs(points) do e[side]:SetPoint(p[1], p[2] * px, p[3] * px) end
  end
  sizeEdges(e, frame)
end

-- Places a one-pixel bevel line two pixels inside frame's top or bottom edge (side "TOP" or "BOTTOM").
local function placeBevel(t, frame, side)
  local px = T.Pixel(frame)
  local y = (side == "TOP" and -2 or 2) * px
  t:ClearAllPoints()
  t:SetPoint(side .. "LEFT", 2 * px, y)
  t:SetPoint(side .. "RIGHT", -2 * px, y)
  t:SetHeight(px)
end

-- Paints a slot's accent edge (for its state; a quiet slot's only while it
-- has one) and its bevel (none in a well), at the frame's pixel size.
local function paintSlot(entry, frame)
  local p = entry.parts
  placeInner(p.inner, frame)
  local r, g, b = shadeAccent(T.SLOT_STATES[entry.opts.state] or 0)
  colorEdges(p.inner, r, g, b, (entry.opts.quiet and not entry.opts.state) and 0 or 1)
  placeBevel(p.lit, frame, "TOP")
  placeBevel(p.dim, frame, "BOTTOM")
  T.Tint(p.lit, "sheen", entry.opts.well and 0 or nil)
  T.Tint(p.dim, "shade", entry.opts.well and 0 or nil)
end

-- A well's fill and border (T.Slot with opts.well): darker than the slate, ringed in a lighter line.
T.SLOT_WELL = { fill = "void", border = "darkBar" }

-- A slot's painting options from T.Slot's opts (quiet, well).
local function slotOpts(opts)
  local well = opts ~= nil and opts.well == true
  return {
    raised = not well, fill = well and T.SLOT_WELL.fill or nil, border = well and { T.RGB(T.SLOT_WELL.border) } or nil, well = well,
    noSheen = true, noBevel = true, shadow = T.SLOT_SHADOW, quiet = opts ~= nil and opts.quiet == true,
  }
end

-- A slot tile for a button (the bag and menu bar): a raised slate fill, a
-- one-pixel border with a one-pixel accent edge inside it, a light line along
-- the top and a dark one along the bottom inside that (a bevel), and a small
-- soft shadow. The accent edge follows the accent and T.SlotState; with
-- opts.quiet it stays hidden until the slot has a state (the mouse over it, or held).
-- With opts.well it is a dark well instead (T.SLOT_WELL, no bevel), for art
-- that isn't a full square icon to stand out on.
function T.Slot(frame, opts)
  local entry = painted[frame]
  if not entry then
    entry = base(frame, "slot", slotOpts(opts))
    entry.parts.inner, entry.parts.lit, entry.parts.dim = edges(frame), solid(frame, "BORDER", 1, "border"), solid(frame, "BORDER", 1, "border")
    entry.paint = paintSlot
  end
  repaint(frame, entry)
  return frame
end

-- Sets a slot's state ("hover", "pressed", or nil for neither) and repaints its accent edge.
function T.SlotState(frame, state)
  local entry = painted[frame]
  entry.opts.state = state
  repaint(frame, entry)
end

-- Window controls (close, maximize, minimize), the same in every window (units): how big the
-- square tile behind the glyph is while the mouse is over it, and the glyph (drawn on a 20-unit
-- grid, one pixel each, its mark in the middle 9); a control with no size yet takes the tile's.
-- And where they sit: a close button's middle `inset` in from its panel's top-right corner on
-- both axes (its tile with 14 of air to the panel's edge, in line with the window's title), the
-- maximize/minimize box `step` left of it.
T.CONTROL = { tile = 20, glyph = 20, inset = 24, step = 28 }
-- The tile's color and opacity by control: red behind close, a wash of the accent behind the others.
T.CONTROL_TILES = { close = { "bad", 0.9 }, other = { "accent", 0.35 } }

-- Paints a window control: its glyph in the secondary text color, or white over its tile while lit.
local function paintControl(entry)
  local p, tile = entry.parts, T.CONTROL_TILES[entry.opts.tile] or T.CONTROL_TILES.other
  T.Tint(p.glyph, entry.lit and "white" or "text2")
  T.Tint(p.tile, tile[1], tile[2])
  p.tile:SetShown(entry.lit == true)
end

-- A texture centered on a button: the path at the size (an even number of screen pixels,
-- so it stays on whole pixels in an even button), on the layer.
local function centered(button, layer, path, size)
  local t = T.Snap(button:CreateTexture(nil, layer))
  t:SetTexture(path)
  T.PixelSize(t, size, size, true)
  t:SetPoint("CENTER")
  return t
end

-- A window control's parts (made once), centered on the button: the square tile and the glyph.
local function controlParts(button, icon)
  return { tile = centered(button, "ARTWORK", T.WHITE, T.CONTROL.tile), glyph = centered(button, "OVERLAY", T.Icon(icon), T.CONTROL.glyph) }
end

-- Sets whether a window control is lit, and repaints it.
local function lightControl(button, entry, lit)
  entry.lit = lit
  repaint(button, entry)
end

-- Lights a window control while the mouse is over it, and puts it back after; a control the game
-- hides under the mouse (minimize swaps itself for maximize) gets no OnLeave, so hiding puts it back too.
local function watchControl(button, entry)
  button:HookScript("OnEnter", function() lightControl(button, entry, true) end)
  button:HookScript("OnLeave", function() lightControl(button, entry, false) end)
  button:HookScript("OnHide", function() lightControl(button, entry, false) end)
end

-- A window control drawn with one of the theme's icons (CloseMark, Maximize, Minimize): its template
-- art faded, the glyph quiet until the mouse is over it, then white on its tile (opts.tile "close"
-- makes the tile red). Sized to the tile when it has no size yet. Safe to run again.
function T.WindowControl(button, icon, opts)
  local entry = painted[button]
  if not entry then
    T.FadeRegions(button)
    entry = { kind = "control", opts = opts or {}, parts = controlParts(button, icon), paint = paintControl }
    painted[button] = entry
    watchControl(button, entry)
    if (button:GetWidth() or 0) < 1 then T.PixelSize(button, T.CONTROL.tile, T.CONTROL.tile, true) end
  end
  repaint(button, entry)
  return button
end

-- A close button as a window control: a plain cross, white on a red tile under the mouse.
function T.CloseButton(button)
  return T.WindowControl(button, "CloseMark", { tile = "close" })
end

-- Puts a close button T.CONTROL.inset in from a panel's top-right corner on both axes: the corner the
-- eye sees, so a panel drawn out past its frame (T.Padding) counts its padding. Returns the button.
function T.PlaceClose(close, panel)
  local inset = T.PixelRound(panel, T.CONTROL.inset - T.Padding(panel))
  close:ClearAllPoints()
  close:SetPoint("CENTER", panel, "TOPRIGHT", -inset, -inset)
  return close
end

-- Game frame primitives (docs/design/RESKIN.md 3.3) -----------------------------------------

-- The art the game's three tab templates draw (PanelTabButtonTemplate,
-- TabSystemButtonTemplate, LargeSideTabButtonTemplate), faded by T.Tab.
T.TAB_ART = {
  "Left", "Middle", "Right", "LeftActive", "MiddleActive", "RightActive", "LeftHighlight", "MiddleHighlight",
  "RightHighlight", "Background", "SelectedTexture", "HighlightTexture", "TabGlow",
  "SquareBackground", "SquareBackgroundActive", "SquareBackgroundActiveGlow",
}

-- Whether a game tab is the selected one: a tab system's flag, the checked state a
-- side tab was last given, else disabled (the game selects a panel tab by disabling it).
local function tabSelected(button)
  if type(button.SetTabSelected) == "function" then return button.isSelected == true end
  if vgChecked[button] ~= nil then return vgChecked[button] end
  return type(button.IsEnabled) == "function" and not button:IsEnabled()
end

-- A selected tab's accent bar: how thick it is (screen pixels); and how faded an unselected tab's icon is.
T.TAB_BAR, T.TAB_DIM = 2, 0.55

-- Places a tab's accent bar along one of its edges (TOP, BOTTOM, LEFT or RIGHT), T.TAB_BAR pixels thick.
local function placeBar(bar, frame, edge)
  local points, thick = EDGE_POINTS[edge:lower()] or EDGE_POINTS.top, T.TAB_BAR * T.Pixel(frame)
  bar:ClearAllPoints()
  bar:SetPoint(points[1])
  bar:SetPoint(points[2])
  if edge == "LEFT" or edge == "RIGHT" then bar:SetWidth(thick) else bar:SetHeight(thick) end
end

-- Greys and fades a tab's icon while another tab is selected (dim), or gives it back its color.
local function dimIcon(button, dim)
  local icon = button.Icon
  if type(icon) ~= "table" or not icon.SetDesaturated then return end
  icon:SetDesaturated(dim)
  icon:SetAlpha(dim and T.TAB_DIM or 1)
end

-- Paints a tab for its state: the selected one raised, with the accent bar on its outer edge (opts.bar)
-- and its icon in color; the others inset, their icon greyed when opts.dimIcon asks.
local function paintTab(entry, frame)
  local on, p = tabSelected(frame), entry.parts
  entry.opts.inset, entry.opts.raised = not on, on
  paintBg(p.bg, entry.opts)
  p.line:SetShown(on)
  placeBar(p.line, frame, entry.opts.bar or "TOP")
  T.Tint(p.line, "accent")
  if entry.opts.dimIcon then dimIcon(frame, not on) end
end

-- Repaints a tab after the game changes its state.
local function repaintTab(button)
  local entry = painted[button]
  if entry then repaint(button, entry) end
end

-- Remembers a side tab's checked state, then repaints it.
local function onTabChecked(button, checked)
  vgChecked[button] = checked == true
  repaintTab(button)
end

-- Follows the three ways the game selects a tab: enabling, SetChecked, SetTabSelected.
-- Side tabs (LargeSideTabButtonTemplate) are Frames, which have no OnEnable or
-- OnDisable script, and hooking a script a widget lacks is an error: hence the pcalls.
local function watchTab(button)
  pcall(button.HookScript, button, "OnEnable", repaintTab)
  pcall(button.HookScript, button, "OnDisable", repaintTab)
  if type(hooksecurefunc) ~= "function" then return end
  if type(button.SetChecked) == "function" then hooksecurefunc(button, "SetChecked", ns.Guard("hook SetChecked", onTabChecked)) end
  if type(button.SetTabSelected) == "function" then hooksecurefunc(button, "SetTabSelected", ns.Guard("hook SetTabSelected", repaintTab)) end
end

-- Fades each part of a frame named in keys that it has (textures or frames), by alpha.
local function fadeKeys(frame, keys)
  for _, key in ipairs(keys) do
    local part = frame[key]
    if type(part) == "table" and part.SetAlpha then part:SetAlpha(0) end
  end
end

-- A tab's own parts (made once): the accent bar (placed when painted) and the hover wash.
local function tabParts(button, entry)
  entry.parts.line, entry.parts.hover = solid(button, "OVERLAY", nil, "divider"), solid(button, "HIGHLIGHT", nil, "fill")
  entry.parts.hover:SetAllPoints()
  T.Tint(entry.parts.hover, "hover")
  entry.paint = paintTab
end

-- One of the game's tab buttons in the theme: its template art faded (its icon and text
-- kept), an inset panel and the faint hover; the selected tab is raised, with a T.TAB_BAR
-- pixel accent bar along one edge. opts (each call may change them): bar, the edge for the
-- bar (TOP, BOTTOM, LEFT, RIGHT; default TOP), and dimIcon, to grey the icon of a tab that
-- isn't selected. Safe to run again; follows the game's selection.
function T.Tab(button, opts)
  local entry = painted[button]
  if not entry then
    entry = base(button, "tab", { inset = true, noSheen = true })
    tabParts(button, entry)
    watchTab(button)
  end
  for k, v in pairs(opts or {}) do entry.opts[k] = v end
  fadeKeys(button, T.TAB_ART)
  repaint(button, entry)
  return button
end

-- A tooltip-like frame in the theme (tooltips, menus, small panels): a panel at 0.94
-- with a soft shadow, the game's NineSlice faded. Safe to run again.
function T.Tooltip(frame)
  if type(frame.NineSlice) == "table" and frame.NineSlice.SetAlpha then frame.NineSlice:SetAlpha(0) end
  return T.Panel(frame, { alpha = 0.94, shadow = true })
end

-- The parts of the game's scroll bars (MinimalScrollBar, WowTrimScrollBar) whose
-- art T.ScrollBar fades, and the pieces each part can hold.
T.SCROLL_ART = { "Background", "Backplate", "Overlay", "Track" }
local SCROLL_PIECES = { "Begin", "Middle", "End", "Texture" }
-- The arrow buttons, and whether each points up (Back) or down (Forward).
local SCROLL_ARROWS = { Back = true, Forward = false }

-- Fades one part of a scroll bar: a frame's own textures, or a texture, and its pieces.
local function fadePart(part)
  if type(part) ~= "table" then return end
  if part.GetRegions then T.FadeRegions(part) elseif part.SetAlpha then part:SetAlpha(0) end
  fadeKeys(part, SCROLL_PIECES)
end

-- The thumb's edge in the accent while the mouse is over it.
local function hoverAccent(f)
  f:HookScript("OnEnter", function() T.SetBorder(f, { T.Accent() }) end)
  f:HookScript("OnLeave", function() T.SetBorder(f, nil) end)
end

-- A scroll arrow in the theme, once: a flat button with the theme's Down icon,
-- turned upside down for the Back (up) arrow.
local function arrowGlyph(button, up)
  if vgArrow[button] then return end
  T.Button(button)
  vgArrow[button] = T.Tint(T.Snap(button:CreateTexture(nil, "OVERLAY")), "text2")
  vgArrow[button]:SetTexture(T.Icon("Down"))
  T.PixelSize(vgArrow[button], 10, 10, true)
  vgArrow[button]:SetPoint("CENTER")
  if up then vgArrow[button]:SetTexCoord(0, 1, 1, 0) end
end

-- One of the game's scroll bars in the theme: its track and art faded, the thumb a
-- raised panel (accent edge under the mouse), the arrows flat with the theme's arrow.
-- A bar without a thumb (not one of the game's) is left alone. Safe to run again.
function T.ScrollBar(bar)
  local thumb = bar.Thumb or (type(bar.Track) == "table" and bar.Track.Thumb)
  if type(thumb) ~= "table" then return bar end
  for _, key in ipairs(T.SCROLL_ART) do fadePart(bar[key]) end
  fadePart(thumb)
  if not painted[thumb] then hoverAccent(thumb) end
  T.Panel(thumb, { raised = true, noSheen = true })
  for key, up in pairs(SCROLL_ARROWS) do if type(bar[key]) == "table" then arrowGlyph(bar[key], up) end end
  return bar
end

-- The game's font objects Vanguard sets: name -> { size before Text size, bold }.
local fontObjects = {}

-- The theme font, scaled by Text size, on each listed font object this client has.
local function applyFontObjects()
  for name, spec in pairs(fontObjects) do
    local font, path, outline = _G[name], T.Font(spec[2])
    if type(font) == "table" and font.SetFont then font:SetFont(path, T.ScaledSize(spec[1]), outline) end
  end
end

-- Puts the theme font on the game's font objects in map ({ FontObjectName = { size,
-- bold } }) now and after every theme change (font, Text size). The list only grows.
function T.FontObjects(map)
  for name, spec in pairs(map) do fontObjects[name] = spec end
  applyFontObjects()
end

-- Tints the logo's halves: accent on the left diamond, text color on the right.
local function paintLogo(entry)
  T.Tint(entry.parts.left, "accent")
  T.Tint(entry.parts.right, "text")
end

-- One half of the logo as a full-size texture on f, at an ARTWORK sublevel.
local function logoHalf(f, half, sublevel)
  local t = f:CreateTexture(nil, "ARTWORK", nil, sublevel)
  t:SetTexture(T.Texture("Logo" .. half))
  t:SetAllPoints()
  return t
end

-- The Vanguard mark (two linked diamonds) at size x size; follows the accent live.
function T.Logo(parent, size)
  local f = T.PixelSize(CreateFrame("Frame", nil, parent), size, size)
  local parts = { right = logoHalf(f, "Right", 0), left = logoHalf(f, "Left", 1) }
  local entry = { kind = "logo", opts = {}, parts = parts, paint = paintLogo }
  painted[f] = entry
  paintLogo(entry)
  return f
end

-- How much T.Crop trims off each edge of an icon's art: 0.08, its baked-in bevel.
T.ICON_EDGE = 0.08

-- Crops the baked-in bevel off an icon texture; given a slot's w and h, crops the long axis further
-- (#259) so the icon keeps its aspect ratio in a slot that isn't square.
function T.Crop(texture, w, h)
  local ex, ey = T.ICON_EDGE, T.ICON_EDGE
  if w and h and w > 0 and h > 0 and w ~= h then
    local keep = (0.5 - T.ICON_EDGE) * math.min(w, h) / math.max(w, h)
    if w > h then ey = 0.5 - keep else ex = 0.5 - keep end
  end
  texture:SetTexCoord(ex, 1 - ex, ey, 1 - ey)
  return texture
end

-- Re-fonts a font string to the theme font, with a 1 px drop shadow so it
-- reads on bright bars. size defaults to its current size (else 12).
function T.SetFont(fs, size)
  local path, outline = T.Font()
  local _, current = fs:GetFont()
  fs:SetFont(path, size or current or 12, outline)
  fs:SetShadowOffset(1, -1)
  fs:SetShadowColor(0, 0, 0, 1)
  return fs
end

-- Text roles: size at text scale 1, bold (the SemiBold weight), and an
-- outline instead of a shadow (world text such as nameplates, and text drawn
-- over a bright bar, such as raid frame names).
T.ROLES = {
  title = { 15, true }, heading = { 13, true }, name = { 12, true }, cell = { 11, true },
  -- No role is under 10 (#258) but badge, for a count or mark on a tiny badge.
  label = { 12 }, number = { 12 }, small = { 10 }, tiny = { 10 }, badge = { 9 }, world = { 11, true, "OUTLINE" },
  barName = { 11, true, "OUTLINE" }, barSmall = { 10, false, "OUTLINE" },
  -- Aura icons: stack counts, and the timer on larger and smaller icons.
  cooldown = { 14, true, "OUTLINE" }, auraCount = { 10, true, "OUTLINE" }, auraTimer = { 11, true, "OUTLINE" }, auraTimerSmall = { 10, true, "OUTLINE" },
  -- Chat windows (Modules/Chat.lua picks the size; this is Medium).
  chat = { 12 },
}

-- Every font string styled with a role: string -> role name. Weak, so text
-- that gets collected doesn't stay; T.RefreshText re-fonts them all.
local styled = setmetatable({}, { __mode = "k" })
-- Styled strings drawn at a size of their own (T.TextSize): string -> size. Weak too.
local sizes = setmetatable({}, { __mode = "k" })

-- A size after the text scale setting.
function T.ScaledSize(size)
  return math.floor(size * (T.Settings().textScale or 1) + 0.5)
end

-- A role's font size after the text scale setting.
local function roleSize(r)
  return T.ScaledSize(r[1])
end

-- A text role's font size (by name) after the text scale setting, for layouts.
function T.RoleSize(role)
  return roleSize(T.ROLES[role])
end

-- Styles a font string for a role: font, size, shadow (or outline) and a
-- color (a name; "text" by default; false leaves the color alone).
function T.Text(fs, role, color)
  local r = T.ROLES[role]
  if not r then error("Vanguard: no text role named " .. tostring(role), 2) end
  styled[fs] = role
  T.ApplyRole(fs, role)
  if color ~= false then T.Color(fs, color or "text") end
  return fs
end

-- A font's flags with SLUG added (#239) when the slugText setting is on and the text is world text
-- (an outlined role); otherwise as given.
function T.FontFlags(flags, world)
  if not (world and T.Settings().slugText) then return flags end
  return (flags and flags ~= "" and flags .. "," or "") .. "SLUG"
end

-- Sets a role's font, size and shadow (or outline) on a font string; leaves its color alone.
function T.ApplyRole(fs, role)
  local r = T.ROLES[role]
  local path, outline = T.Font(r[2])
  if T.HEADING_ROLES[role] then path = T.HeadingFont() or path end
  fs:SetFont(path, sizes[fs] or roleSize(r), T.FontFlags(r[3] or outline, r[3]))
  fs:SetShadowOffset(r[3] and 0 or 1, r[3] and 0 or -1)
  fs:SetShadowColor(T.RGB("textShadow"))
end

-- Draws a font string styled with a role at a size of its own, which the
-- caller works out from the roles' sizes (T.RoleSize); kept when the text is
-- refreshed. nil puts the role's size back.
function T.TextSize(fs, size)
  sizes[fs] = size
  T.ApplyRole(fs, styled[fs])
end

-- Re-fonts every string styled with a role (after a font or text size change).
function T.RefreshText()
  for fs, role in pairs(styled) do T.ApplyRole(fs, role) end
end

-- Colors a font string: a named color, r, g, b (for other addons' skins), or the accent's text variant.
function T.Color(fs, r, g, b)
  if type(r) == "number" then
    fs:SetTextColor(r, g, b)
  else
    fs:SetTextColor(T.RGB(r or "accentText"))
  end
  return fs
end

-- Live changes ------------------------------------------------------------------------

-- Calls fn() after every theme change (for custom elements colored by hand).
function T.OnChanged(fn)
  listeners[#listeners + 1] = fn
end

-- Repaints every painted frame, re-fonts styled text and tells the listeners.
function T.Refresh()
  for frame, entry in pairs(painted) do
    repaint(frame, entry)
  end
  T.RefreshText()
  applyFontObjects()
  for t in pairs(crests) do T.PaintCrest(t) end
  reSnap()
  for _, fn in ipairs(listeners) do
    fn()
  end
end

-- The faction look ---------------------------------------------------------------------

-- Your faction for the faction look ("Alliance" or "Horde"), or nil when it's off or you have none.
function T.Faction()
  if T.Settings().faction == "off" or not ns.FactionArt then return nil end
  local faction = ns.FactionArt.Faction()
  return faction ~= "none" and faction or nil
end

-- The faction's heading font, or nil (look off, no faction, another font chosen, a client using
-- the game's font, or one whose script the heading fonts lack).
function T.HeadingFont()
  local s, faction = T.Settings(), T.Faction()
  if not faction or s.font ~= "" or useClientFont(s) or LATIN_HEADING_MISSING[locale()] then return nil end
  return T.FONTS[faction:lower()]
end

-- Paints a crest texture: your faction's crest in its color, hidden while the look is off.
function T.PaintCrest(t)
  local crest = T.CRESTS[T.Faction() or ""]
  t:SetShown(crest ~= nil)
  if not crest then return end
  t:SetTexture(T.MEDIA .. "Art\\" .. crest[1])
  T.Tint(t, crest[2], t.vgAlpha)
end

-- A size x size crest on a frame (at an optional alpha), following the faction look as it changes.
function T.Crest(parent, size, layer, alpha)
  local t = parent:CreateTexture(nil, layer or "ARTWORK")
  t:SetSize(size, size)
  t.vgAlpha = alpha
  crests[t] = true
  T.PaintCrest(t)
  return t
end

-- Sets the accent color (0-1 components) and repaints.
function T.SetAccent(r, g, b)
  T.Settings().accent = { r, g, b }
  T.Refresh()
end

-- Puts the accent back to its default (brass) and repaints.
function T.ResetAccent()
  T.Settings().accent = ns.Copy(DEFAULTS.accent)
  T.Refresh()
end

-- Puts every theme setting back to its default and repaints.
function T.Reset()
  ns.Profile().theme = nil
  T.Refresh()
end

-- Motion and sound --------------------------------------------------------------------

-- A frame's (or texture's) alpha animation (made once, eased out: fast, then settling), or
-- false when the client can't animate it.
local function fader(frame)
  if vgFader[frame] ~= nil then return vgFader[frame] end
  local group = frame.CreateAnimationGroup and frame:CreateAnimationGroup()
  local alpha = group and group.CreateAnimation and group:CreateAnimation("Alpha")
  if alpha then group:SetToFinalAlpha(true) alpha:SetSmoothing("OUT") end
  vgFader[frame] = alpha and { group = group, alpha = alpha } or false
  return vgFader[frame]
end

-- Plays an alpha change from -> to over seconds, then runs done.
local function playFade(f, from, to, seconds, done)
  f.group:Stop()
  f.alpha:SetFromAlpha(from)
  f.alpha:SetToAlpha(to)
  f.alpha:SetDuration(seconds)
  f.group:SetScript("OnFinished", done)
  f.group:Play()
end

-- The fader to use, or nil when motion is off (Reduce motion, or no animation support).
local function activeFader(frame)
  return not T.Settings().reduceMotion and fader(frame) or nil
end

-- The longest a fade lasts in combat, in seconds: mid-fight nothing lingers
-- on screen or keeps you waiting on it (docs/THEME.md, Motion and sound).
T.COMBAT_FADE = 0.15
-- True from a fight's PLAYER_REGEN_DISABLED, which comes just before the
-- client's combat lockdown starts, until PLAYER_REGEN_ENABLED.
local fighting = false

-- How long a fade lasts: seconds (0.12 by default), at most T.COMBAT_FADE in combat.
function T.FadeTime(seconds)
  local t = seconds or 0.12
  if fighting or ns.InCombat() then return math.min(t, T.COMBAT_FADE) end
  return t
end

-- A fight started or ended: fades are capped while it lasts.
local function onFight(event)
  fighting = event == "PLAYER_REGEN_DISABLED"
end
ns.On("PLAYER_REGEN_DISABLED", onFight)
ns.On("PLAYER_REGEN_ENABLED", onFight)

-- Shows a frame, fading it in (0.12 s by default, at most 0.15 s in combat)
-- unless motion is off. Only for frames that aren't protected: animations
-- never move secure frames.
function T.FadeIn(frame, seconds)
  local f = activeFader(frame)
  frame:Show()
  if not f then return frame:SetAlpha(1) end
  playFade(f, 0, 1, T.FadeTime(seconds), function() frame:SetAlpha(1) end)
end

-- Fades a frame out (as long as T.FadeIn), then hides it (and runs done); at
-- once when motion is off.
function T.FadeOut(frame, seconds, done)
  local f = activeFader(frame)
  -- Hides the frame, restores its alpha for next time, and tells the caller.
  local finish = function() frame:Hide() frame:SetAlpha(1) if done then done() end end
  if not f or not frame:IsShown() then return finish() end
  playFade(f, 1, 0, T.FadeTime(seconds), finish)
end

-- How a window opens and closes (#257): seconds to open and to close, and how many screen
-- pixels it rises into place as it opens.
T.WINDOW_OPEN, T.WINDOW_CLOSE, T.WINDOW_RISE = 0.13, 0.1, 4

-- Each window's open animation (weak; kept off the frame, which may be one of the game's).
local riserOf = setmetatable({}, { __mode = "k" })

-- Adds an animation of a kind to group, at a place in its order, lasting seconds.
local function step(group, kind, order, seconds)
  local a = group:CreateAnimation(kind)
  a:SetOrder(order)
  a:SetDuration(seconds)
  return a
end

-- A window's open animation (made once), or false when the client can't animate it: a drop
-- (at once), then a rise back to its spot while it fades in, eased out.
local function riser(frame)
  if riserOf[frame] ~= nil then return riserOf[frame] end
  local group = frame.CreateAnimationGroup and frame:CreateAnimationGroup()
  local r = group and group.CreateAnimation and { group = group, drop = step(group, "Translation", 1, 0),
    rise = step(group, "Translation", 2, T.WINDOW_OPEN), alpha = step(group, "Alpha", 2, T.WINDOW_OPEN) } or false
  if r then r.rise:SetSmoothing("OUT") r.alpha:SetSmoothing("OUT") end
  riserOf[frame] = r
  return r
end

-- Draws a window through its own frame buffer (#239) while it fades, when the frameBuffer setting
-- is on and the client has SetIsFrameBuffer, so overlapping translucent borders don't ghost.
local function buffered(frame, on)
  if T.Settings().frameBuffer and frame.SetIsFrameBuffer then frame:SetIsFrameBuffer(on) end
end

-- Plays a window's open animation from px below its spot, buffered until it ends.
local function playRise(frame, r, px)
  r.group:Stop() r.drop:SetOffset(0, -px) r.rise:SetOffset(0, px)
  r.alpha:SetFromAlpha(0) r.alpha:SetToAlpha(1)
  buffered(frame, true)
  r.group:SetScript("OnFinished", ns.Guard("window frame buffer", function() buffered(frame, false) end))
  r.group:Play()
end

-- Opens a window (#257): shown, fading in as it rises T.WINDOW_RISE screen pixels into its own
-- spot (so it ends on the pixel grid); at once in combat or with Reduce motion.
function T.OpenWindow(frame)
  local r = not T.Settings().reduceMotion and not (fighting or ns.InCombat()) and riser(frame)
  T.StopFade(frame)
  frame:Show()
  if r then playRise(frame, r, T.Pixel(frame) * T.WINDOW_RISE) end
end

-- Closes a window (#257): fades it out over T.WINDOW_CLOSE, then hides it and runs done.
function T.CloseWindow(frame, done)
  if riserOf[frame] then riserOf[frame].group:Stop() end
  buffered(frame, true)
  T.FadeOut(frame, T.WINDOW_CLOSE, function() buffered(frame, false) if done then done() end end)
end

-- How long a button's hover takes to ease in and out (#257), in seconds; capped in combat like any fade.
T.HOVER_IN, T.HOVER_OUT = 0.1, 0.13

-- Eases a button's hover look in (on, while it is enabled) or out, from where it is now;
-- at once with Reduce motion, or when `now` (the button was hidden).
function T.EaseHover(button, on, now)
  local to = on and (not button.IsEnabled or button:IsEnabled()) and 1 or 0
  for _, t in ipairs(hoverOf[button] or {}) do
    local f = not now and activeFader(t)
    if f then playFade(f, t:GetAlpha(), to, T.FadeTime(to == 1 and T.HOVER_IN or T.HOVER_OUT), function() t:SetAlpha(to) end) end
    if not f then T.StopFade(t) t:SetAlpha(to) end
  end
end

-- Stops a fade in progress and leaves the frame fully visible.
function T.StopFade(frame)
  local f = vgFader[frame]
  if f then f.group:SetScript("OnFinished", nil) f.group:Stop() end
  frame:SetAlpha(1)
end

-- Interface sounds by use -> the client's SOUNDKIT name.
local SOUNDS = {
  on = "IG_MAINMENU_OPTION_CHECKBOX_ON", off = "IG_MAINMENU_OPTION_CHECKBOX_OFF",
  page = "IG_CHARACTER_INFO_TAB", open = "IG_MAINMENU_OPEN", close = "IG_MAINMENU_CLOSE",
  -- An alert you asked for (Chat watch): the whisper sound (Mainline/SoundKitConstants.lua, 3081).
  alert = "TELL_MESSAGE",
}

-- Plays one of the client's own interface sounds, unless sounds are off.
function T.Sound(use)
  local kit = type(SOUNDKIT) == "table" and SOUNDKIT[SOUNDS[use] or ""]
  if T.Settings().sounds and kit and type(PlaySound) == "function" then PlaySound(kit) end
end

-- Pixel-perfect scale ----------------------------------------------------------------

-- The pixel-perfect scale the settings pick: 768 / screen height times the whole
-- multiple (pixelMultiple, 1 unless set: 2 makes one UI unit two screen pixels).
function T.PixelScale()
  return T.PixelPerfectScale() * math.max(1, math.floor(T.Settings().pixelMultiple or 1))
end

-- Sets UIParent to the pixel-perfect scale when that setting is on, out of
-- combat, then resizes every border and rounds pixel-sized frames again.
function T.ApplyScale()
  if not T.Settings().pixelScale then return end
  ns.OutOfCombat(function()
    UIParent:SetScale(T.PixelScale())
    T.Refresh()
    T.Rescale()
  end)
end

-- Turns the pixel-perfect scale on (applies now) or off (the client's own
-- scale returns at the next reload).
function T.SetPixelScale(on)
  T.Settings().pixelScale = on == true
  T.ApplyScale()
end

-- The screen size or the client's UI scale changed: re-apply ours and resize borders.
local function onScaleChanged()
  T.Refresh()
  T.ApplyScale()
  T.Rescale()
end

ns.On("PLAYER_LOGIN", T.ApplyScale)
ns.On("UI_SCALE_CHANGED", onScaleChanged)
ns.On("DISPLAY_SIZE_CHANGED", onScaleChanged)

-- r, g, b (0-1) from a preset name, "rrggbb" or "#rrggbb"; nil otherwise.
function T.ParseColor(text)
  local preset = T.PRESETS[ALIASES[text] or text]
  if preset then
    return preset[1], preset[2], preset[3]
  end
  return T.ParseHex(text)
end

-- r, g, b (0-1) from "rrggbb" or "#rrggbb"; nil if it isn't a hex color.
function T.ParseHex(text)
  local hex = type(text) == "string" and text:match("^#?(%x%x%x%x%x%x)$")
  if not hex then
    return nil
  end
  return tonumber(hex:sub(1, 2), 16) / 255, tonumber(hex:sub(3, 4), 16) / 255, tonumber(hex:sub(5, 6), 16) / 255
end

-- How many frames are painted (for /vg status and tests).
function T.PaintedCount()
  local n = 0
  for _ in pairs(painted) do
    n = n + 1
  end
  return n
end
