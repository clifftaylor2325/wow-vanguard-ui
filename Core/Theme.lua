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
-- Where a crest goes and how big (units): beside a window title (title), on the AFK card (card), and as a
-- watermark on the two reading windows (the quest dialog and quest log) at the wash alpha.
T.CREST = { title = 20, card = 44, watermark = 96, wash = 0.1 }
-- Text roles that take the faction's heading font: the two display roles, used only for window and card titles.
T.HEADING_ROLES = { title = true, heading = true }
-- Clients whose script the bundled font doesn't cover use the game's font.
local CLIENT_FONT_LOCALES = { koKR = true, zhCN = true, zhTW = true }
-- Clients whose script the faction look's heading fonts (Cinzel, Metamorphous:
-- Latin only) don't cover keep Fira Sans for headings: Russian names and titles.
local LATIN_HEADING_MISSING = { ruRU = true }

-- A texture from Media/Textures (Bar, Shadow, Glow, Stripes, LogoLeft, ...).
function T.Texture(name) return T.MEDIA .. "Textures\\" .. name end
-- The line and menu icons that are also baked at the pixel sizes in T.ICON_SIZES (#232): the same names
-- and sizes scripts/lib/media-sources.mjs draws (a media test keeps them equal).
T.ICON_SIZES = { 16, 20, 24, 32 }
T.SIZED_ICONS = {
  "Character", "Spellbook", "Talents", "Professions", "Achievements", "Quests", "Social", "Group",
  "Collections", "Journal", "Shop", "MenuCog", "Help", "Map", "House", "Legacy",
}
local sizedSet = {}
for _, name in ipairs(T.SIZED_ICONS) do sizedSet[name] = true end

-- The smallest baked size at or above `px`, else the largest.
function T.IconSize(px)
  for _, size in ipairs(T.ICON_SIZES) do
    if size >= px then return size end
  end
  return T.ICON_SIZES[#T.ICON_SIZES]
end

-- An icon from Media/Icons (Close, Check, Down, Search, ...). With the sizedIcons setting on, `size` (px)
-- picks the copy baked at the nearest size at or above it, when the icon has one.
function T.Icon(name, size)
  local px = size and sizedSet[name] and T.Settings().sizedIcons and T.IconSize(size) or ""
  return T.MEDIA .. "Icons\\" .. name .. px
end

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
  -- No colour at all: the shadow under dark text on an accent fill (a shadow only blurs it).
  clear = { "000000", 0 },
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

-- Theme variants (#237): token sets that swap surfaces and text, chosen with the variant setting
-- ("default" is none). A variant's tokens win over the saved panel and inset colours; `assist` turns
-- Color assist on, `ring` is the accent focus ring in screen pixels, `flat` drops gradients.
T.VARIANT_ORDER = { "default", "contrast", "vellum", "classic", "midnight", "obsidian", "moss", "ember" }
T.VARIANTS = {
  -- High Contrast: opaque near-black panels, white text, no sheen, full-saturation states.
  contrast = {
    label = "High contrast", assist = true, ring = 2, flat = true,
    tokens = {
      panel = "0a0b0e", inset = "050608", raised = "14161b", raisedHover = "22262d", divider = "3a414c", borderHi = "5a6270",
      sheen = { "ffffff", 0 },
      text = "ffffff", text2 = "dfe3ea", muted = "b8bfca",
      good = "00e060", warn = "ff9a1f", bad = "ff4040", info = "4da6ff",
    },
  },
  -- Classic (#218): dark leather and bronze, gold-cream text, a bronze border, the window ornaments on.
  -- Own colours only; nothing from the game's art.
  classic = {
    label = "Classic look", ornaments = true,
    tokens = {
      panel = { "1c1610", 0.96 }, inset = { "120d09", 0.96 }, raised = "2b2117", divider = "4a3a24", edge = "6b5230",
      sheen = { "ffd27a", 0.08 }, text = "f2e2b6", text2 = "d4bf8c", muted = "9c8a62",
    },
  },
  -- Vellum & Ink: a warm dark with cream text and brass.
  vellum = {
    label = "Vellum and ink",
    tokens = {
      panel = { "1a1612", 0.94 }, inset = { "100d0a", 0.95 }, raised = "241f19", divider = "3a3226",
      text = "efe6d2", text2 = "d2c6ad", muted = "9a8f78",
    },
  },
  -- Midnight: a cold navy-black with steel-blue dividers and ice-blue text.
  midnight = {
    label = "Midnight",
    tokens = {
      panel = { "0d1220", 0.94 }, inset = { "080c16", 0.95 }, raised = "151c2e", divider = "2a3550",
      text = "e6eefc", text2 = "c3cfe6", muted = "9aa8c4",
    },
  },
  -- Obsidian: neutral charcoal with no warm or cold tint, light grey text and a thin silver edge.
  obsidian = {
    label = "Obsidian",
    tokens = {
      panel = { "141414", 0.94 }, inset = { "0c0c0c", 0.95 }, raised = "1e1e1e", divider = "343434", edge = "5c5c5c",
      text = "ececec", text2 = "cfcfcf", muted = "a8a8a8",
    },
  },
  -- Moss: a dark forest green with mossy dividers and pale sage text.
  moss = {
    label = "Moss",
    tokens = {
      panel = { "101a14", 0.94 }, inset = { "0a110d", 0.95 }, raised = "18261d", divider = "2c4232",
      text = "e4eee6", text2 = "c3d4c7", muted = "98ad9e",
    },
  },
  -- Ash and ember: smoky grey with a dim rust edge and dividers, warm grey text.
  ember = {
    label = "Ash and ember",
    tokens = {
      panel = { "1a1718", 0.94 }, inset = { "110f10", 0.95 }, raised = "262223", divider = "4a2e2a", edge = "5a2c24",
      text = "ebe4e2", text2 = "cfc5c2", muted = "a89c98",
    },
  },
}
for _, v in pairs(T.VARIANTS) do
  for name, c in pairs(v.tokens) do v.tokens[name] = type(c) == "table" and fromHex(c[1], c[2]) or fromHex(c) end
end

local DEFAULTS = {
  -- A theme variant (#237, #218): "default", "contrast", "vellum", "classic", "midnight", "obsidian", "moss", "ember".
  variant = "default",
  -- Panel corners: "square" (one border language, as always) or "rounded" (T.CORNER_RADIUS arcs).
  corners = "square",
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
  -- A brass rule or corner brackets on a few large windows (#238); off by default.
  ornaments = false,
  -- Experiments with 12.x client features (#239), each off until its in-game A/B check: world text
  -- (outlined roles) drawn with the SLUG font flag, and big windows drawn through a frame buffer
  -- while they open and close.
  slugText = false,
  frameBuffer = false,
  -- Line and menu icons drawn at the pixel size they show at (#232); off until its in-game check.
  sizedIcons = false,
  textScale = 1,
  barTexture = "vanguard",
  -- Soft shadows under HUD frames (unit frames, bars, minimap); floating windows always have one.
  hudShadow = false,
  -- Reaction colors off the red-green axis (#235, General -> Look; on reload).
  colorAssist = false,
  smoothBars = true,
  reduceMotion = false,
  sounds = true,
  -- The faction look: "crest" (your faction's crest only), "auto" (the crest and the heading font) or "off".
  faction = "crest",
}

-- Painted frames: frame -> { kind, opts, parts }. Weak, so hidden frames
-- that get collected don't stay here.
local painted = setmetatable({}, { __mode = "k" })
local listeners = {}
-- Every crest texture (weak), repainted when the theme changes.
local crests = setmetatable({}, { __mode = "k" })
-- Every window with an ornament (#238): frame -> its pieces (weak), repainted when the theme changes.
local ornaments = setmetatable({}, { __mode = "k" })

-- Theme settings in the active profile, with defaults.
function T.Settings()
  return ns.Settings("theme", DEFAULTS)
end

-- Profiles saved or exported before the rename (ForeverUI 0.3.0 and earlier)
-- call the bundled bar style "forever"; it is "vanguard" now. A profile that saved a
-- variant since removed (Frost, the light look, dropped in 0.6.0) goes back to the default.
local function renamedTheme(saved)
  if saved.barTexture == "forever" then saved.barTexture = "vanguard" end
  if saved.variant ~= nil and not T.VARIANTS[saved.variant] and saved.variant ~= "default" then saved.variant = nil end
end
ns.Migrate("theme", renamedTheme)

-- r, g, b of the accent color.
function T.Accent()
  local c = T.Settings().accent
  return c[1], c[2], c[3]
end

-- The active theme variant (a T.VARIANTS entry), or nil for the default look.
function T.Variant()
  return T.VARIANTS[T.Settings().variant]
end

-- r, g, b, a of the panel (or, with inset, the darker inset) fill.
function T.PanelColor(inset)
  local v = T.Variant()
  local c = v and v.tokens[inset and "inset" or "panel"] or T.Settings()[inset and "inset" or "panel"]
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
  local key, v = SETTING_TOKENS[name], T.Variant()
  local assist = T.Settings().colorAssist or v and v.assist
  local c = v and v.tokens[name] or T.ACCENT_VARIANTS[name] and accentVariant(name) or key and T.Settings()[key]
    or assist and T.ASSIST[name] or T.TOKENS[name]
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

-- Every region T.Tint coloured (weak): region -> { token, alpha, r, g, b, a } as last set, so T.Refresh
-- re-tints it after an accent or variant change, and forgets one recoloured by hand since (refreshTints).
local tinted = setmetatable({}, { __mode = "k" })

-- Colors a region with a named color (vertex color), at an optional alpha; remembered, so the
-- colour follows the accent and the variant (a region recoloured by hand since is left alone).
function T.Tint(region, name, alpha)
  local r, g, b, a = T.RGB(name)
  a = alpha or a
  region:SetVertexColor(r, g, b, a)
  local m = tinted[region] or {}
  m.token, m.alpha, m.r, m.g, m.b, m.a = name, alpha, r, g, b, a
  tinted[region] = m
  return region
end

-- Whether a region's vertex colour is still the one T.Tint last set on it, within a 255th on each channel
-- (a client that can't say gives no colour, or a hidden one such as the dispel engine's on a debuff badge,
-- and the region is forgotten: a hidden value is never compared).
local function stillTinted(region, m)
  if not region.GetVertexColor then return false end
  local r, g, b, a = region:GetVertexColor()
  if ns.IsSecret(r) or ns.IsSecret(g) or ns.IsSecret(b) or ns.IsSecret(a) then return false end
  return type(r) == "number" and math.abs(r - m.r) < 0.004 and math.abs(g - m.g) < 0.004
    and math.abs(b - m.b) < 0.004 and math.abs((a or 1) - m.a) < 0.004
end

-- Re-tints every remembered region whose colour is still what T.Tint set (after an accent or variant
-- change); one recoloured by hand since (a class colour, say) is forgotten instead.
local function refreshTints()
  for region, m in pairs(tinted) do
    if stillTinted(region, m) then T.Tint(region, m.token, m.alpha) else tinted[region] = nil end
  end
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

-- Rounded corners (the corners setting, "rounded"): the radius in screen pixels. The corner art
-- (Media/Textures/CornerLine and CornerFill) is a quarter circle on a 32-pixel canvas with an
-- 8-pixel stroke, so drawn at this radius the arc is one pixel wide, like the edges.
T.CORNER_RADIUS = 4

-- Pins one edge texture between its two corner points, `out` units past frame, each end stopped
-- `r` units short of the corner (0 runs it into the corner).
local function placeEdge(t, frame, side, points, out, r)
  t:ClearAllPoints()
  for _, point in ipairs(points) do
    local x, y = outward(point, out)
    local inX, inY = outward(point, -r)
    if side == "top" or side == "bottom" then x = x + inX else y = y + inY end
    t:SetPoint(point, frame, point, x, y)
  end
end

-- Pins the four edges `pad` units out past frame (rounded to whole pixels), `r` units short of the corners.
local function placeEdges(e, frame, pad, r)
  for side, points in pairs(EDGE_POINTS) do placeEdge(e[side], frame, side, points, T.PixelRound(frame, pad or 0), r or 0) end
end

-- Four edge textures around frame, `pad` units out past its edges (sized to one pixel when painted).
local function edges(frame, pad)
  local layer, sub = edgeLayer(frame)
  local e = { top = solid(frame, layer, sub, "border"), bottom = solid(frame, layer, sub, "border"), left = solid(frame, layer, sub, "border"), right = solid(frame, layer, sub, "border") }
  placeEdges(e, frame, pad, 0)
  return e
end

-- Sizes the edges to one screen pixel for frame, or the variant's focus ring (#237) when thick.
local function sizeEdges(e, frame, thick)
  local v = T.Variant()
  local px = T.Pixel(frame) * (thick and v and v.ring or 1)
  e.top:SetHeight(px); e.bottom:SetHeight(px)
  e.left:SetWidth(px); e.right:SetWidth(px)
end

-- The sheen: a one-pixel light line just inside the top border (placed when painted).
local function sheen(frame)
  return solid(frame, "BORDER", nil, "sheen")
end

-- Places the sheen just inside the top border (`pad` units out past the frame's top), one pixel tall:
-- on the first row inside it, or the `row`th (a bevelled panel keeps row 1 for its bevel line).
-- (A button's hover line sits on row 1, in `token`.) `r` units are left clear at each end for rounded corners.
local function placeSheen(t, frame, pad, token, row, r)
  local px, out = T.Pixel(frame), T.PixelRound(frame, pad or 0)
  local inset = px + (r or 0)
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", frame, "TOPLEFT", inset - out, out - px * (row or 1))
  t:SetPoint("TOPRIGHT", frame, "TOPRIGHT", out - inset, out - px * (row or 1))
  t:SetHeight(px)
  T.Tint(t, token or "sheen")
end

-- The inner bevel (#234) on buttons and raised panels: { token, alpha } of the light line along the
-- top inner edge and the dark one along the bottom inner edge, each one pixel, just inside the border.
T.BEVEL = { top = { "borderHi", 0.35 }, bottom = { "shade", 0.35 } }

-- Places one bevel line (side "TOP" or "BOTTOM") on the first row inside frame's border, `out` past
-- it, `r` units clear of each rounded corner.
local function placeBevelLine(t, frame, side, out, r)
  local px, y = T.Pixel(frame), side == "TOP" and out - T.Pixel(frame) or T.Pixel(frame) - out
  t:ClearAllPoints()
  t:SetPoint(side .. "LEFT", frame, side .. "LEFT", px + r - out, y)
  t:SetPoint(side .. "RIGHT", frame, side .. "RIGHT", out - px - r, y)
  t:SetHeight(px)
  T.Tint(t, T.BEVEL[side:lower()][1], T.BEVEL[side:lower()][2])
end

-- Places and tints a frame's bevel lines (`pad` units out past the frame, `r` clear of the corners).
local function placeBevelLines(bevel, frame, pad, r)
  local out = T.PixelRound(frame, pad or 0)
  placeBevelLine(bevel.top, frame, "TOP", out, r or 0)
  placeBevelLine(bevel.bottom, frame, "BOTTOM", out, r or 0)
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
  for _, fill in ipairs(entry and entry.fills or NO_PARTS) do for _, t in ipairs(fill.textures) do ownScratch[t] = true end end
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
  if entry.focused then return T.RGB("accentText") end
  return T.RGB("edge")
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
  if not (T.Settings().panelGradient and (opts.shadow or opts.gradient) and bg.SetGradient) or (T.Variant() or {}).flat then return end
  bg:SetGradient("VERTICAL", lighter(r, g, b, a, T.PANEL_GRADIENT[1]), lighter(r, g, b, a, T.PANEL_GRADIENT[2]))
end

-- Tints a painted frame's fill textures: the background and, once rounded, its side strips and corners.
local function tintFills(p, r, g, b, a)
  p.bg:SetVertexColor(r, g, b, a)
  for _, key in ipairs({ "roundSides", "roundFill" }) do
    for _, t in pairs(p[key] or NO_PARTS) do t:SetVertexColor(r, g, b, a) end
  end
end

-- Colors a painted background: panel, inset or raised color (or the opts.fill
-- token), at opts.alpha if given, shaded top to bottom where shadeBg says (never while rounded:
-- the corner pieces can't follow a gradient).
local function paintBg(p, opts, rounded)
  local r, g, b, a = T.PanelColor(opts.inset)
  if opts.raised then r, g, b, a = T.RGB("raised") end
  if opts.fill then r, g, b, a = T.RGB(opts.fill) end
  tintFills(p, r, g, b, opts.alpha or a)
  if not rounded then shadeBg(p.bg, opts, r, g, b, opts.alpha or a) end
end

-- Texcoords (left, right, top, bottom) flipping the corner art, drawn for the top left, to each corner.
local CORNERS = { TOPLEFT = { 0, 1, 0, 1 }, TOPRIGHT = { 1, 0, 0, 1 }, BOTTOMLEFT = { 0, 1, 1, 0 }, BOTTOMRIGHT = { 1, 0, 1, 0 } }

-- The four corner pieces of `art` on frame at a layer (and sublevel): point -> texture.
local function cornerPieces(frame, art, layer, sublevel)
  local set = {}
  for point, tc in pairs(CORNERS) do
    local t = frame:CreateTexture(nil, layer, nil, sublevel)
    t:SetTexture(T.Texture(art))
    t:SetTexCoord(unpack(tc))
    set[point] = t
  end
  return set
end

-- Makes a frame's rounded-corner parts, once it is first painted rounded: the border arcs where
-- it has edges, and the fill's quarter discs and left and right strips where it has a background.
local function roundParts(frame, p)
  local layer, sub = edgeLayer(frame)
  p.roundLine = p.edges and cornerPieces(frame, "CornerLine", layer, sub) or nil
  p.roundFill = p.bg and cornerPieces(frame, "CornerFill", "BACKGROUND") or nil
  p.roundSides = p.bg and { solid(frame, "BACKGROUND", nil, "fill"), solid(frame, "BACKGROUND", nil, "fill") } or nil
end

-- Places a set of corner pieces, each an r square at its corner, `out` past frame.
local function placeCorners(set, frame, out, r)
  for point, t in pairs(set or NO_PARTS) do
    t:ClearAllPoints()
    t:SetPoint(point, frame, point, outward(point, out))
    t:SetSize(r, r)
  end
end

-- Places the background between the corners: pulled in r on the left and right, with an r-wide
-- strip down each side between the top and bottom corners (r 0 is the plain full background).
local function placeSides(p, frame, out, r)
  p.bg:ClearAllPoints()
  p.bg:SetPoint("TOPLEFT", frame, "TOPLEFT", r - out, out)
  p.bg:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", out - r, -out)
  for i, side in ipairs({ "LEFT", "RIGHT" }) do
    local t, x = p.roundSides[i], side == "LEFT" and -out or out
    t:ClearAllPoints()
    t:SetPoint("TOP" .. side, frame, "TOP" .. side, x, out - r)
    t:SetPoint("BOTTOM" .. side, frame, "BOTTOM" .. side, x, r - out)
    t:SetWidth(math.max(r, 1))
  end
end

-- Shows and places a frame's rounded parts for radius r (units), or hides them (r 0) and gives
-- the background its corners back. Nothing is made for a frame that was never rounded.
local function paintRound(frame, entry, r)
  local p, out = entry.parts, T.PixelRound(frame, entry.opts.pad or 0)
  if r == 0 and not p.round then return end
  if not p.round then roundParts(frame, p) p.round = true end
  for _, key in ipairs({ "roundLine", "roundFill", "roundSides" }) do
    for _, t in pairs(p[key] or NO_PARTS) do t:SetShown(r > 0) end
  end
  if p.bg then placeSides(p, frame, out, r) end
  placeCorners(p.roundLine, frame, out, r)
  placeCorners(p.roundFill, frame, out, r)
  if p.roundLine then colorEdges(p.roundLine, borderColor(entry)) end
end

-- The painted kinds whose corners the corners setting rounds: panels (windows, HUD frames, tooltips)
-- and buttons. Slots and tabs stay square (an icon fills a slot; a tab meets its panel).
local ROUNDED_KINDS = { panel = true, button = true }

-- How far a painted frame's corners round, in its units: T.CORNER_RADIUS pixels with the corners
-- setting on "rounded" (times the variant's ring on an accent-bordered frame), 0 for square corners,
-- a status bar (its fill is square) or a kind that stays square.
local function roundRadius(frame, entry)
  if T.Settings().corners ~= "rounded" or not ROUNDED_KINDS[entry.kind] or edgeLayer(frame) == "OVERLAY" then return 0 end
  local v = T.Variant()
  return T.CORNER_RADIUS * T.Pixel(frame) * ((entry.opts.accent or entry.opts.border) and v and v.ring or 1)
end

-- Colours and sizes a painted frame's edges, re-pinned `r` short of the corners once it has been rounded.
local function paintEdges(frame, entry, r)
  local p = entry.parts
  colorEdges(p.edges, borderColor(entry))
  sizeEdges(p.edges, frame, entry.opts.accent or entry.opts.border)
  if r > 0 or p.round then placeEdges(p.edges, frame, entry.opts.pad, r) end
end

-- Fills (T.FillParts) ------------------------------------------------------------------------

-- Makes a fill's rounded parts the first time its frame is rounded: two side strips and four quarter
-- discs on the fill's layer, at the centre's alpha, added to fill.textures.
local function roundFillParts(frame, fill)
  fill.roundSides = { solid(frame, fill.layer, fill.sublevel, "fill"), solid(frame, fill.layer, fill.sublevel, "fill") }
  fill.roundFill = cornerPieces(frame, "CornerFill", fill.layer, fill.sublevel)
  for _, t in pairs(fill.roundSides) do fill.textures[#fill.textures + 1] = t end
  for _, t in pairs(fill.roundFill) do fill.textures[#fill.textures + 1] = t end
  for i = 2, #fill.textures do fill.textures[i]:SetAlpha(fill.bg:GetAlpha()) end
end

-- Places a fill's parts `pad` units out past frame for radius r (units): the centre alone while the frame
-- has never been rounded, else the centre pulled in r with the strips and discs around it (as placeSides
-- and placeCorners place the painted background).
local function placeFill(frame, fill, pad, r)
  local out = T.PixelRound(frame, pad or 0)
  if r > 0 and not fill.roundSides then roundFillParts(frame, fill) end
  if not fill.roundSides then
    fill.bg:ClearAllPoints()
    pin(fill.bg, frame, "TOPLEFT", pad) pin(fill.bg, frame, "BOTTOMRIGHT", pad)
    return
  end
  placeSides(fill, frame, out, r)
  placeCorners(fill.roundFill, frame, out, r)
end

-- Shows a fill's parts as its state says: the centre while the fill is shown, the strips and discs only
-- while the frame is rounded too.
local function showFillParts(fill)
  fill.bg:SetShown(fill.shown)
  for _, t in ipairs(fill.textures) do
    if t ~= fill.bg then t:SetShown(fill.shown and fill.round > 0) end
  end
end

-- Colours a fill's textures in a token's colour, at an alpha (the token's unless given); remembered for repaints.
function T.TintFill(fill, token, alpha)
  local r, g, b, a = T.RGB(token)
  fill.token, fill.alpha = token, alpha
  tintFills(fill, r, g, b, alpha or a)
  return fill
end

-- Shows or hides a fill, every part at once.
function T.ShowFill(fill, on)
  fill.shown = on == true
  showFillParts(fill)
end

-- Sets every texture of a fill to one alpha.
function T.FillAlpha(fill, a)
  for _, t in ipairs(fill.textures) do t:SetAlpha(a) end
end

-- Places, shows and tints one of a painted frame's fills, `pad` units out, for radius r.
local function repaintFill(frame, fill, pad, r)
  fill.round = r
  placeFill(frame, fill, pad, r)
  showFillParts(fill)
  T.TintFill(fill, fill.token, fill.alpha)
end

-- A solid fill over a painted frame (T.Panel, T.Button) on a layer (and sublevel) in a token's colour, at an
-- alpha: one texture while the frame's corners are square; once rounded, a centre, two side strips and four
-- quarter discs that follow its arcs (like the painted background), re-placed on every repaint. fill.textures
-- lists its parts; T.TintFill, T.ShowFill and T.FillAlpha change it as one. (A frame never painted gets the
-- plain texture, which nothing re-places.)
function T.FillParts(frame, layer, sublevel, token, alpha)
  local entry = painted[frame]
  local fill = { bg = solid(frame, layer, sublevel, "fill"), layer = layer, sublevel = sublevel, token = token, alpha = alpha, shown = true }
  fill.textures = { fill.bg }
  if entry then
    entry.fills = entry.fills or {}
    entry.fills[#entry.fills + 1] = fill
  end
  repaintFill(frame, fill, entry and entry.opts.pad, entry and entry.round or 0)
  return fill
end

-- Applies the current colors (and pixel size) to one painted frame.
local function repaint(frame, entry)
  local p, r = entry.parts, roundRadius(frame, entry)
  entry.round = r
  paintRound(frame, entry, r)
  if p.bg then paintBg(p, entry.opts, r > 0) end
  if p.edges then paintEdges(frame, entry, r) end
  if p.sheen then placeSheen(p.sheen, frame, entry.opts.pad, nil, p.bevel and 2, r) end
  if p.bevel then placeBevelLines(p.bevel, frame, entry.opts.pad, r) end
  for _, fill in ipairs(entry.fills or NO_PARTS) do repaintFill(frame, fill, entry.opts.pad, r) end
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
  placeSheen(entry.parts.hoverLine, button, entry.opts.pad, entry.opts.hoverTo or "borderHi", nil, entry.round)
end

-- Each themed button's hover parts (weak; kept off the button, which may be one of the game's).
local hoverOf = setmetatable({}, { __mode = "k" })

-- A button's hover parts, { the fill's centre texture, line, fill = its T.FillParts fill }, or nil for a
-- button T.Button never painted.
function T.HoverParts(button) return hoverOf[button] end

-- A button's hover look (#257): a raisedHover fill (T.FillParts, so it follows rounded corners) over its
-- inset fill and a one-pixel borderHi line along its top, both clear until the mouse comes over it
-- (T.EaseHover eases them).
local function hoverParts(button, entry)
  local fill = T.FillParts(button, "BACKGROUND", entry.opts.hoverTo and 2 or 1, entry.opts.hoverTo or "raisedHover")
  T.FillAlpha(fill, 0)
  entry.parts.hoverLine, entry.paint = solid(button, "BORDER", 2, "border"), paintHoverLine
  entry.parts.hoverLine:SetAlpha(0)
  hoverOf[button] = { fill.bg, entry.parts.hoverLine, fill = fill }
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
T.PRESS = { "shade", 0.3, drop = 1, row = 0.2 }
-- Each themed button's press state (weak): { overlay = the fill's centre texture, fill = its T.FillParts
-- fill, ys = its label's anchor ys before the press }.
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

-- Shows or hides a button's press look; only an enabled button shows it. A shade marked `row` (a check
-- box's today) leaves the label where it is; a push button's drops it a pixel.
function T.PressButton(button, down)
  local s = pressOf[button]
  if not s then return end
  local on = down == true and (not button.IsEnabled or button:IsEnabled())
  if on == s.overlay:IsShown() then return end
  if s.fill then T.ShowFill(s.fill, on) else s.overlay:SetShown(on) end
  if not s.row then dropLabel(button, s, on) end
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

-- A button's press and disabled looks (#257): the hidden overlay (T.FillParts, so it follows rounded
-- corners), and hooks on the mouse and on its state (pcall: a widget without OnEnable/OnDisable can't
-- have them hooked).
local function stateParts(button)
  local fill = T.FillParts(button, "BACKGROUND", 2, T.PRESS[1], T.PRESS[2])
  T.ShowFill(fill, false)
  pressOf[button] = { overlay = fill.bg, fill = fill }
  button:HookScript("OnMouseDown", ns.Guard("button press", function(b) T.PressButton(b, true) end))
  button:HookScript("OnMouseUp", ns.Guard("button press", function(b) T.PressButton(b, false) end))
  pcall(button.HookScript, button, "OnDisable", ns.Guard("button state", function(b) T.DisabledLook(b, true) end))
  pcall(button.HookScript, button, "OnEnable", ns.Guard("button state", function(b) T.DisabledLook(b, false) end))
end

-- The panel options of each button kind: the secondary is an inset panel with a bevel; the primary
-- has no bevel or sheen (ns.DialogButton lays its accent fill under the hover), and hovers to accentText.
local BUTTON_KINDS = {
  secondary = { inset = true, bevel = true },
  primary = { inset = true, noBevel = true, noSheen = true, hoverTo = "accentText" },
}

-- A flat button of a kind ("secondary" unless given, or "primary"; read on the first call only): inset
-- panel with a bevel, template art faded, an eased hover (raisedHover and a borderHi top line), a press
-- look and a disabled look.
function T.Button(button, kind)
  local fresh = not painted[button]
  local entry = base(button, "button", BUTTON_KINDS[kind or "secondary"])
  if fresh then
    T.FadeRegions(button, { [entry.parts.bg] = true })
    hoverParts(button, entry)
    stateParts(button)
  end
  repaint(button, entry)
  if button.IsEnabled and not button:IsEnabled() then T.DisabledLook(button, true) end
  return button
end

-- Turns an edit box's focus border on or off (accentText while it has the typing); not a ring: the box's own border changes.
local function focusBox(box, on)
  local entry = painted[box]
  entry.focused = on
  repaint(box, entry)
end

-- Hooks a real edit box's focus (a scroll view painted as an input has none).
local function watchFocus(box)
  if not (box.GetObjectType and box:GetObjectType() == "EditBox") then return end
  box:HookScript("OnEditFocusGained", ns.Guard("edit focus", function(b) focusBox(b, true) end))
  box:HookScript("OnEditFocusLost", ns.Guard("edit focus", function(b) focusBox(b, false) end))
end

-- A near-black input box with a border (accentText while it has the typing); template art faded.
function T.EditBox(box)
  local fresh = not painted[box]
  local entry = base(box, "editbox", { inset = true })
  if fresh then
    T.FadeRegions(box, { [entry.parts.bg] = true })
    watchFocus(box)
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
-- How tall controls are (units): an inline control (a dropdown, an input, a segment group, a switch's
-- track) and a standalone button; a list or options row is T.ROW.height.
T.CONTROL_H, T.BUTTON_H = 20, 26
-- The spacing scale (units), the only spacing numbers for new and restyled layouts: pad is the inset of a
-- floating window's or dialog's contents; col the gutter between columns and a card's inset inside a
-- window; gap a HUD card's inset and the gap between controls; tight the gap between cells; section the
-- gap between one section and the next.
T.SPACE = { tight = 4, gap = 8, col = 12, pad = 16, section = 24 }
-- Panel opacity by tier: opaque for the options window, the quest log and a skinned game window; dialog
-- for a dialog, setup, What's new and anything with an edit box; overlay for tooltips and cards (the panel
-- token's own alpha); alert for an alert.
T.ALPHA = { opaque = 1, dialog = 0.98, overlay = 0.94, alert = 0.92 }
-- A list row (W.Row, T.Row): how tall (units).
T.ROW = { height = 28 }
-- The one selected look (docs/THEME.md, "Materials and states"): an accent rail down a row's left edge,
-- `rail` screen pixels wide, over a `fill` (a lighter fill, not an accent wash) that sits under the text.
T.SELECT = { rail = 2, fill = "raisedHover" }
-- The one scroll thumb (the options window, ns.ScrollView and T.ScrollBar): how wide (units), in text2 at
-- the rest alpha, and at the lit alpha while the mouse is over it or it is dragged; no arrows.
T.SCROLL = { thumb = 4, rest = 0.5, lit = 1 }
-- The tile's color and opacity by control while the mouse is over it: red behind close, the grey raisedHover
-- tile behind the others (only close is coloured); at rest every control sits on the same faint raised-slate tile.
T.CONTROL_TILES = { close = { "bad", 0.9 }, other = { "raisedHover", 1 }, rest = { "raised", 0.9 } }

-- Paints a window control: its glyph in the secondary text color on a faint tile, or while lit white over
-- close's red tile and in the text color over the others' grey one.
local function paintControl(entry)
  local p, tile = entry.parts, T.CONTROL_TILES[entry.opts.tile] or T.CONTROL_TILES.other
  if not entry.lit then tile = T.CONTROL_TILES.rest end
  T.Tint(p.glyph, entry.lit and (entry.opts.tile == "close" and "white" or "text") or "text2")
  T.Tint(p.tile, tile[1], tile[2])
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

-- Paints a resting-tile-only control (T.ControlPlate): its tile in T.CONTROL_TILES.rest.
local function paintRestTile(entry)
  T.Tint(entry.parts.tile, T.CONTROL_TILES.rest[1], T.CONTROL_TILES.rest[2])
end

-- Puts a window control's resting tile behind a button of a window's control row that keeps its own icon (the
-- character pane's arrow, the group finder's gear), so the row reads as one set of buttons. Safe to run again.
function T.ControlPlate(button)
  local entry = painted[button]
  if not entry then
    entry = { kind = "plate", opts = {}, parts = { tile = centered(button, "BACKGROUND", T.WHITE, T.CONTROL.tile) }, paint = paintRestTile }
    painted[button] = entry
  end
  repaint(button, entry)
  return button
end

-- A close button as a window control: a plain cross, white on a red tile under the mouse.
function T.CloseButton(button)
  return T.WindowControl(button, "CloseMark", { tile = "close" })
end

-- Puts a close button T.CONTROL.inset in from a panel's top-right corner on both axes: the corner the
-- eye sees, so a panel drawn out past its frame (T.Padding) counts its padding. drop (optional) is how far
-- down the middle goes instead, for a window whose title sits higher than the others'. Returns the button.
function T.PlaceClose(close, panel, drop)
  local inset = T.PixelRound(panel, T.CONTROL.inset - T.Padding(panel))
  local down = drop and T.PixelRound(panel, drop - T.Padding(panel)) or inset
  close:ClearAllPoints()
  close:SetPoint("CENTER", panel, "TOPRIGHT", -inset, -down)
  return close
end

-- Game frame primitives (docs/design/RESKIN.md 3.3) -----------------------------------------

-- A check box's look (docs/design/DESIGN-PRINCIPLES.md 2.6): the box's size (units; an even count of
-- screen pixels, so its centre lands on the button's), its mark (the Check glyph) size and colour, the
-- box's border colour while the mouse is over it, and the fill the box shows while checked (none: the
-- box stays `inset` and only the mark carries the accent, so many-of-many stays light). [DECIDE] 6.8
-- there asks whether it becomes an `accent`-filled box with a `void` mark: fill = "accent", markColor = "void".
T.CHECK = { size = 16, mark = 12, markColor = "accentText", hover = "borderHi", fill = nil }
-- A slider's look, read by the options window's pill slider (and by the game's own sliders once they are skinned): the track's height and its
-- colour with its outline, the fill under the thumb (`borderHi`, a quiet grey, so a page of sliders is not a row
-- of brass bars: [DECIDE] 5a, Cliff 2026-10-17), the thumb's size and colour, the thumb's colour while the slider
-- is locked or disabled, and the shade under the thumb's lit edge.
T.SLIDER = { height = 8, thumb = 12, track = "inset", line = "borderHi", fill = "borderHi", thumbColor = "white",
  thumbOff = "disabled", shade = "shade" }
-- ---- Capsule kit (Phase 8.1): the one pill shape ----
-- The three slices of the Pill textures (a round left end, a flat middle, a round right end), so a capsule
-- stretches to any width and keeps its ends round.
local CAPSULE_CUTS = { { 0, 0.25 }, { 0.25, 0.75 }, { 0.75, 1 } }

-- A capsule's three parts of Media/Textures/<name> (Pill, PillLine, SliderLine) on frame, in one theme
-- color, not yet placed. Returns the parts left to right.
function T.CapsuleArt(frame, layer, name, color)
  local parts = {}
  for i, cut in ipairs(CAPSULE_CUTS) do
    parts[i] = frame:CreateTexture(nil, layer)
    parts[i]:SetTexture(T.Texture(name))
    parts[i]:SetTexCoord(cut[1], cut[2], 0, 1)
    T.Tint(parts[i], color)
  end
  return parts
end

-- Lays a capsule's parts across frame: each round end half the capsule's height wide, the middle between them.
function T.PlaceCapsule(parts, frame, height)
  local cap = height / 2
  parts[1]:SetPoint("TOPLEFT", frame)
  parts[1]:SetPoint("BOTTOMLEFT", frame)
  parts[1]:SetWidth(cap)
  parts[2]:SetPoint("TOPLEFT", frame, "TOPLEFT", cap, 0)
  parts[2]:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -cap, 0)
  parts[3]:SetPoint("TOPRIGHT", frame)
  parts[3]:SetPoint("BOTTOMRIGHT", frame)
  parts[3]:SetWidth(cap)
end

-- A capsule of `height` across frame: its fill in the color `tier` (a theme token, "inset" for a track) and a
-- 1 px outline over it. opts.layer is the fill's layer (BORDER); opts.line the outline's color (borderHi, or
-- false for none) and opts.edge its texture (PillLine; SliderLine is the thicker one for an 8 px track).
-- Returns { fill = parts, line = parts or nil }, for a caller that retints them with the theme.
function T.Capsule(frame, height, tier, opts)
  opts = opts or {}
  local capsule = { fill = T.CapsuleArt(frame, opts.layer or "BORDER", "Pill", tier) }
  T.PlaceCapsule(capsule.fill, frame, height)
  if opts.line ~= false then
    capsule.line = T.CapsuleArt(frame, "OVERLAY", opts.edge or "PillLine", opts.line or "borderHi")
    T.PlaceCapsule(capsule.line, frame, height)
  end
  return capsule
end

-- Each themed check button's parts (weak): { box = the inset panel, fill = its checked fill, mark = the glyph }.
local checkOf = setmetatable({}, { __mode = "k" })

-- A check button's themed parts, { box, fill, mark }, or nil for one T.CheckBox never painted.
function T.CheckParts(button) return checkOf[button] end

-- Whether a check button (or radio) is checked: the game's mark shown, for a plain frame whose mark the
-- game shows and hides (T.CheckBox's `mark`), else its checked state.
local function isChecked(button, c)
  if c.source then return c.source:IsShown() == true end
  return type(button.GetChecked) == "function" and button:GetChecked() == true
end

-- Paints a check button for its state: the mark (and the fill, when T.CHECK names one) shown while it
-- is checked, in their colours, the hover border while the mouse is over it, or the disabled tier while
-- the button is disabled (its label too, and no hover border).
local function paintCheck(button, c)
  local on, off = isChecked(button, c), type(button.IsEnabled) == "function" and not button:IsEnabled()
  c.hover = c.hover and not off -- a disabled button gets no OnLeave, so its hover ends here
  c.mark:SetShown(on)
  T.Tint(c.mark, off and "disabled" or T.CHECK.markColor)
  c.fill:SetShown(on and T.CHECK.fill ~= nil)
  T.Tint(c.fill, off and "disabled" or T.CHECK.fill or "inset")
  T.SetBorder(c.box, c.hover and not off and { T.RGB(T.CHECK.hover) } or nil)
  T.DisabledLook(button, off)
end

-- Makes a check button's parts, centred on it: the box (an inset panel, T.CHECK.size), the fill it
-- shows checked, the press overlay above the fill and under the border (T.PressButton, as a button's;
-- `row`: the label stays put) and the mark.
local function checkParts(button)
  local box = T.Panel(CreateFrame("Frame", nil, button), { inset = true, noSheen = true })
  T.PixelSize(box, T.CHECK.size, T.CHECK.size, true)
  box:SetPoint("CENTER")
  local fill, press = solid(box, "BACKGROUND", 1, "fill"), T.Tint(solid(box, "BACKGROUND", 2, "fill"), T.PRESS[1], T.PRESS[2])
  fill:SetAllPoints()
  press:SetAllPoints()
  press:Hide()
  pressOf[button] = { overlay = press, row = true } -- row: the shade only, the label stays put
  return { box = box, fill = fill, mark = centered(box, "OVERLAY", T.Icon("Check"), T.CHECK.mark), paint = paintCheck }
end

-- Repaints a check button or radio after the game changes its state.
local function repaintCheck(button)
  local c = checkOf[button]
  if c then c.paint(button, c) end
end

-- Notes whether the mouse is over a check button or radio, then repaints it.
local function hoverCheck(button, over)
  checkOf[button].hover = over
  repaintCheck(button)
end

-- Runs fn (guarded as `where`) after each of a region's show calls (Show, Hide, SetShown), as the game makes them.
local function hookShown(region, where, fn)
  if type(hooksecurefunc) ~= "function" then return end
  for _, method in ipairs({ "Show", "Hide", "SetShown" }) do hooksecurefunc(region, method, ns.Guard(where, fn)) end
end

-- Follows the game's state: SetChecked (its own calls), a click (the client flips the state before
-- OnClick runs), enabling and disabling (pcall: a widget without those scripts can't have them hooked).
local function watchState(button)
  local repaint = ns.Guard("check state", repaintCheck)
  for _, script in ipairs({ "OnClick", "OnEnable", "OnDisable" }) do pcall(button.HookScript, button, script, repaint) end
  if type(button.SetChecked) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(button, "SetChecked", ns.Guard("hook SetChecked", repaintCheck))
  end
end

-- Has a plain frame's box follow the mark the game shows while it is checked (`mark`), from now on.
local function watchMark(button, c, mark)
  c.source = mark
  hookShown(mark, "check mark", function() repaintCheck(button) end)
end

-- Follows the mouse: the press look while held, the hover look while over it; a hide clears both.
local function watchCheck(button)
  watchState(button)
  button:HookScript("OnMouseDown", ns.Guard("check press", function(b) T.PressButton(b, true) end))
  button:HookScript("OnMouseUp", ns.Guard("check press", function(b) T.PressButton(b, false) end))
  button:HookScript("OnHide", ns.Guard("check press", function(b) T.PressButton(b, false) hoverCheck(b, false) end))
  button:HookScript("OnEnter", ns.Guard("check hover", function(b) hoverCheck(b, true) end))
  button:HookScript("OnLeave", ns.Guard("check hover", function(b) hoverCheck(b, false) end))
end

-- One of the game's check buttons (UICheckButtonTemplate and kin) in the theme (DESIGN-PRINCIPLES
-- 2.6): its art faded (its label kept), a T.CHECK.size inset box centred on it with the Check glyph in
-- accentText while checked, a borderHi border under the mouse, a shade while pressed, the disabled tier
-- while disabled. Follows the game's SetChecked and clicks. opts.mark: the texture a plain frame shows
-- while checked (QuestLogTrackCheckboxTemplate's CheckMark), which the box then follows. Safe to run again.
function T.CheckBox(button, opts)
  local c = checkOf[button]
  if not c then
    c = checkParts(button)
    checkOf[button] = c
    watchCheck(button)
  end
  if opts and opts.mark and not c.source then watchMark(button, c, opts.mark) end
  T.FadeRegions(button)
  c.paint(button, c)
  return button
end

-- A radio button's look (choose one of several, DESIGN-PRINCIPLES 2.6): the ring's size (an even
-- count of screen pixels), how thick its edge is, the dot's size and colour, the ring's colour under
-- the mouse. The dot is accentText like the check box's mark, so a dark ring with a brass dot pairs
-- with the dark box with a brass check.
T.RADIO = { size = 16, ring = 1, dot = 6, dotColor = "accentText", hover = "borderHi" }

-- A disc of Media/Textures/Knob centred on frame, size units across (even pixels), on a layer, in a colour.
local function disc(frame, layer, size, color)
  return T.Tint(centered(frame, layer, T.Texture("Knob"), size), color)
end

-- Paints a radio for its state: the dot while checked, the ring borderHi under the mouse, the
-- disabled tier while disabled (its label too).
local function paintRadio(button, r)
  local on, off = isChecked(button, r), type(button.IsEnabled) == "function" and not button:IsEnabled()
  r.hover = r.hover and not off -- a disabled button gets no OnLeave, so its hover ends here
  r.mark:SetShown(on)
  T.Tint(r.mark, off and "disabled" or T.RADIO.dotColor)
  T.Tint(r.ring, r.hover and not off and T.RADIO.hover or "edge")
  T.Tint(r.well, "inset")
  T.DisabledLook(button, off)
end

-- Makes a radio's parts on a frame centred on it: the ring (an `edge` disc), the well inside it (an
-- `inset` disc one edge narrower each side), the press shade over the well and the dot.
local function radioParts(button)
  local holder = T.PixelSize(CreateFrame("Frame", nil, button), T.RADIO.size, T.RADIO.size, true)
  holder:SetPoint("CENTER")
  local inner = T.RADIO.size - 2 * T.RADIO.ring
  local press = T.Tint(centered(holder, "ARTWORK", T.Texture("Knob"), inner), T.PRESS[1], T.PRESS[2])
  press:Hide()
  pressOf[button] = { overlay = press, row = true }
  local r = { holder = holder, ring = disc(holder, "BACKGROUND", T.RADIO.size, "edge"), well = disc(holder, "BORDER", inner, "inset") }
  r.mark, r.paint = disc(holder, "OVERLAY", T.RADIO.dot, T.RADIO.dotColor), paintRadio
  return r
end

-- One of the game's radio buttons (UIRadioButtonTemplate) in the theme: its art faded (its label
-- kept), a T.RADIO.size dark ring centred on it with an accentText dot while checked, a borderHi ring
-- under the mouse, a shade while pressed, the disabled tier while disabled. Follows the game's
-- SetChecked and clicks like T.CheckBox. Safe to run again.
function T.Radio(button)
  local r = checkOf[button]
  if not r then
    r = radioParts(button)
    checkOf[button] = r
    watchCheck(button)
  end
  T.FadeRegions(button)
  r.paint(button, r)
  return button
end

-- A divider's look: one screen pixel of this colour, over the game's faded divider art.
T.DIVIDER = { color = "divider" }
-- Each themed divider (a texture or a frame) -> { holder = the frame its line is on, line }. Weak.
local dividerOf = setmetatable({}, { __mode = "k" })

-- A themed divider's parts, { holder, line }, or nil for one T.Divider never painted.
function T.DividerParts(region) return dividerOf[region] end

-- Whether a region is a texture (else a frame).
local function isTexture(region)
  return type(region.GetObjectType) == "function" and region:GetObjectType() == "Texture"
end

-- Sizes a divider's line to one screen pixel thick at its scale now (again after a scale change).
local function sizeDivider(d)
  if d.vertical then d.line:SetWidth(T.Pixel(d.holder)) else d.line:SetHeight(T.Pixel(d.holder)) end
end

-- Sizes every divider's line again (T.OnScale, after a UI scale or screen change).
local function sizeDividers()
  for _, d in pairs(dividerOf) do sizeDivider(d) end
end
T.OnScale(sizeDividers)

-- Makes a divider's line: on its own frame laid over the divider (so fading the game frame's art never
-- fades it), one screen pixel thick, along its top edge (its left edge when vertical), so it sits on
-- whole pixels as the divider does, where a line through an even-height middle would straddle two.
local function dividerLine(region, host, vertical)
  local holder = CreateFrame("Frame", nil, host)
  holder:SetAllPoints(region)
  local d = { holder = holder, line = solid(holder, "ARTWORK", nil, "divider"), vertical = vertical }
  d.line:SetPoint("TOPLEFT")
  d.line:SetPoint(vertical and "BOTTOMLEFT" or "TOPRIGHT")
  sizeDivider(d)
  return d
end

-- Shows a texture divider's line while the game shows the texture.
local function followDivider(region)
  local d = dividerOf[region]
  if d then d.holder:SetShown(region:IsShown()) end
end

-- One of the game's dividers (a texture, or a frame of divider art: Options_HorizontalDivider, the
-- mail window's bar, the quest log's separator) as one pixel of `divider` along it, the game's art
-- faded. opts.vertical (read on the first call): the line runs down it. A texture's line follows the
-- game showing and hiding it. Safe to run again.
function T.Divider(region, opts)
  local tex = isTexture(region)
  if not dividerOf[region] then
    dividerOf[region] = dividerLine(region, tex and region:GetParent() or region, opts and opts.vertical)
    if tex then hookShown(region, "divider shown", followDivider) end
  end
  if tex then region:SetAlpha(0) else T.FadeRegions(region) end
  T.Tint(dividerOf[region].line, T.DIVIDER.color)
  followDivider(region)
  return region
end

-- An arrow button's look: the glyph's size and colour at rest and under the mouse.
T.ARROW = { glyph = 10, color = "text2", hover = "text" }
-- Each direction: the theme icon it turns, and the texture coordinates that turn it.
local ARROW_TURN = {
  down = { "Down", 0, 1, 0, 1 }, up = { "Down", 0, 1, 1, 0 },
  right = { "Right", 0, 1, 0, 1 }, left = { "Right", 1, 0, 0, 1 },
}
-- Each themed arrow button -> { glyph, hover }. Weak.
local arrowOf = setmetatable({}, { __mode = "k" })

-- A themed arrow button's parts, { glyph, hover }, or nil for one T.ArrowButton never painted.
function T.ArrowParts(button) return arrowOf[button] end

-- Paints an arrow's glyph: disabled, under the mouse, or at rest.
local function paintArrow(button)
  local a, off = arrowOf[button], type(button.IsEnabled) == "function" and not button:IsEnabled()
  a.hover = a.hover and not off -- a disabled button gets no OnLeave, so its hover ends here
  T.Tint(a.glyph, off and "disabled" or a.hover and T.ARROW.hover or T.ARROW.color)
end

-- Notes whether the mouse is over an arrow button, then repaints it.
local function hoverArrow(button, over)
  arrowOf[button].hover = over
  paintArrow(button)
end

-- Makes an arrow button's glyph, on its own frame over the button (so fading the button's art never
-- fades it), remembers whether it is flat, and follows the mouse (a hide ends the hover) and its state.
local function arrowParts(button, flat)
  local holder = CreateFrame("Frame", nil, button)
  holder:SetAllPoints()
  arrowOf[button] = { glyph = centered(holder, "OVERLAY", T.Icon("Down"), T.ARROW.glyph), flat = flat }
  for _, script in ipairs({ "OnEnable", "OnDisable" }) do pcall(button.HookScript, button, script, ns.Guard("arrow state", paintArrow)) end
  button:HookScript("OnEnter", ns.Guard("arrow hover", function(b) hoverArrow(b, true) end))
  button:HookScript("OnLeave", ns.Guard("arrow hover", function(b) hoverArrow(b, false) end))
  button:HookScript("OnHide", ns.Guard("arrow hover", function(b) hoverArrow(b, false) end))
end

-- One of the game's arrow buttons (paging, move up and down, steppers) in the theme: the theme's
-- arrow glyph pointing `direction` ("up", "down", "left", "right"; default down) in text2, text under
-- the mouse, the disabled tier while disabled; a flat button panel under it, or with opts.flat (read on
-- the first call) just the glyph, its art faded (for the small steppers beside a slider). Safe to run again.
function T.ArrowButton(button, direction, opts)
  local turn = ARROW_TURN[direction] or ARROW_TURN.down
  if not arrowOf[button] then arrowParts(button, opts and opts.flat) end
  if arrowOf[button].flat then T.FadeRegions(button) else T.Button(button) end
  arrowOf[button].glyph:SetTexture(T.Icon(turn[1]))
  arrowOf[button].glyph:SetTexCoord(turn[2], turn[3], turn[4], turn[5])
  paintArrow(button)
  return button
end

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

-- How faded an unselected tab's icon is.
T.TAB_DIM = 0.55

-- Greys and fades a tab's icon while another tab is selected (dim), or gives it back its color.
local function dimIcon(button, dim)
  local icon = button.Icon
  if type(icon) ~= "table" or not icon.SetDesaturated then return end
  icon:SetDesaturated(dim)
  icon:SetAlpha(dim and T.TAB_DIM or 1)
end

-- Paints a tab for its state: the selected one raised and its icon in color; the others
-- inset, their icon greyed when opts.dimIcon asks.
local function paintTab(entry, frame)
  local on, p = tabSelected(frame), entry.parts
  entry.opts.inset, entry.opts.raised = not on, on
  paintBg(p, entry.opts, entry.round > 0)
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

-- A tab's own parts (made once): the hover wash.
local function tabParts(button, entry)
  entry.parts.hover = solid(button, "HIGHLIGHT", nil, "fill")
  entry.parts.hover:SetAllPoints()
  T.Tint(entry.parts.hover, "hover")
  entry.paint = paintTab
end

-- One of the game's tab buttons in the theme: its template art faded (its icon and text
-- kept), an inset panel and the faint hover; the selected tab is raised. opts (each call may
-- change them): dimIcon, to grey the icon of a tab that isn't selected. Safe to run again;
-- follows the game's selection.
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

-- Rows -----------------------------------------------------------------------------------------

-- Every row T.Row dressed (weak): row -> { hover, press, fill, rail (its textures), over, down, selected,
-- disabled (what it is showing) }.
local rowOf = setmetatable({}, { __mode = "k" })
-- The state names T.RowState takes, and the flag each sets.
local ROW_FLAGS = { hover = "over", pressed = "down", selected = "selected", disabled = "disabled" }

-- One of a row's full-size layers, hidden: a token's colour at an alpha, on a sublevel of the row's artwork.
local function rowLayer(row, sublevel, token, alpha)
  local layer = T.Tint(solid(row, "ARTWORK", sublevel, "fill"), token, alpha)
  layer:SetAllPoints()
  layer:Hide()
  return layer
end

-- The selected look's rail: accent, T.SELECT.rail screen pixels wide down the row's left edge, hidden.
local function rowRail(row)
  local rail = T.Tint(solid(row, "ARTWORK", 3, "fill"), "accent")
  rail:SetPoint("TOPLEFT")
  rail:SetPoint("BOTTOMLEFT")
  rail:SetWidth(T.SELECT.rail * T.Pixel(row))
  rail:Hide()
  return rail
end

-- A row's layers, bottom to top: the selected fill, the hover wash, the press shade and the rail.
local function rowParts(row)
  local fill = rowLayer(row, -1, T.SELECT.fill)
  local hover, press = rowLayer(row, 1, "hover"), rowLayer(row, 2, T.PRESS[1], T.PRESS.row)
  return { fill = fill, hover = hover, press = press, rail = rowRail(row) }
end

-- Shows the layers a row's flags call for: no hover or press while it is disabled; hover and selected stack.
local function paintRow(row)
  local s = rowOf[row]
  local live = not s.disabled
  s.hover:SetShown(live and s.over == true)
  s.press:SetShown(live and s.down == true)
  s.fill:SetShown(s.selected == true)
  s.rail:SetShown(s.selected == true)
end

-- Puts a row in a state: "hover", "pressed", "selected" or "disabled" turn that layer on (off with on = false)
-- and leave the others as they are; "normal" clears all four. A disabled row shows no hover or press and its
-- label takes the disabled tier (T.DisabledLook). A frame T.Row never dressed is left alone.
function T.RowState(row, state, on)
  local s = rowOf[row]
  local flag = ROW_FLAGS[state]
  if not s or not (flag or state == "normal") then return row end
  local was = s.disabled
  if flag then s[flag] = on ~= false else s.over, s.down, s.selected, s.disabled = false, false, false, false end
  paintRow(row)
  if (s.disabled or false) ~= (was or false) then T.DisabledLook(row, s.disabled) end
  return row
end

-- Shows or hides a row's press shade (T.PRESS.row, the row counterpart of T.PressButton).
function T.PressRow(row, down) return T.RowState(row, "pressed", down) end

-- Shows or hides a row's selected look (the rail and fill of T.SELECT): the one place it is drawn.
function T.SelectRow(row, on) return T.RowState(row, "selected", on) end

-- A row's textures (rail, fill, hover, press), or nil for a frame T.Row never dressed.
function T.RowParts(row) return rowOf[row] end

-- Follows the mouse and the game's enabling: hover while over, the press shade while held, both cleared by
-- a hide; OnEnable and OnDisable (pcall: a frame without them can't have them hooked).
local function watchRow(row)
  -- Hooks one script to put the row in a state.
  local function note(script, state, on) row:HookScript(script, ns.Guard("row " .. script, function(r) T.RowState(r, state, on) end)) end
  note("OnEnter", "hover", true) note("OnLeave", "hover", false)
  note("OnMouseDown", "pressed", true) note("OnMouseUp", "pressed", false)
  note("OnHide", "hover", false) note("OnHide", "pressed", false)
  for script, off in pairs({ OnEnable = false, OnDisable = true }) do
    pcall(row.HookScript, row, script, ns.Guard("row state", function(r) T.RowState(r, "disabled", off) end))
  end
end

-- A list row in the theme: see-through, with the `hover` wash under the mouse, the press shade (T.PRESS.row)
-- while held and the one selected look (T.SELECT) through T.RowState; hover never recolours the text. With
-- opts.fade the game's own art on the row is faded by alpha first (the row's layout and scripts stay the
-- game's). Hooks only, never the row's own scripts. Safe to run again.
function T.Row(row, opts)
  local s = rowOf[row]
  if opts and opts.fade then T.FadeRegions(row, s and { [s.fill] = true, [s.hover] = true, [s.press] = true, [s.rail] = true }) end
  if s then return row end
  rowOf[row] = rowParts(row)
  rowOf[row].disabled = row.IsEnabled ~= nil and not row:IsEnabled()
  watchRow(row)
  return row
end

-- The parts of the game's scroll bars (MinimalScrollBar, WowTrimScrollBar) whose
-- art T.ScrollBar fades, and the pieces each part can hold.
T.SCROLL_ART = { "Background", "Backplate", "Overlay", "Track" }
local SCROLL_PIECES = { "Begin", "Middle", "End", "Texture" }
-- The arrow buttons, faded away: the one scroll thumb (T.SCROLL) has no arrows. The old scroll bar's
-- (UIPanelScrollFrameTemplate) are its up and down buttons.
local SCROLL_ARROWS = { "Back", "Forward" }
local OLD_SCROLL_ARROWS = { "ScrollUpButton", "ScrollDownButton" }
-- What a game thumb's hooks note about the mouse: over it (OnEnter, OnLeave) and holding it (OnMouseDown, OnMouseUp).
local THUMB_HOOKS = { OnEnter = { "over", true }, OnLeave = { "over", false }, OnMouseDown = { "held", true }, OnMouseUp = { "held", false } }
-- Per-frame state kept off the game's frames: a game thumb (an old scroll bar's slider, whose thumb is a
-- texture) -> { bar, over, held }, the T.SCROLL line Vanguard drew down it and where the mouse is.
-- (vgArrow, above, marks an arrow button faded once.)
local vgThumb = ns.FrameState("vgThumb")

-- Fades one part of a scroll bar: a frame's own textures (but those in keep), or a texture, and its pieces.
local function fadePart(part, keep)
  if type(part) ~= "table" then return end
  if part.GetRegions then T.FadeRegions(part, keep) elseif part.SetAlpha then part:SetAlpha(0) end
  fadeKeys(part, SCROLL_PIECES)
end

-- A game thumb's line at the lit alpha while the mouse is over the thumb or holds it, the rest alpha otherwise.
local function lightThumb(thumb)
  local s = vgThumb[thumb]
  s.bar:SetAlpha((s.over or s.held) and T.SCROLL.lit or T.SCROLL.rest)
end

-- Follows the mouse on a game thumb through hooks (never its own scripts), relighting its line on each change.
local function watchThumb(thumb)
  for script, note in pairs(THUMB_HOOKS) do
    thumb:HookScript(script, ns.Guard("scroll thumb " .. script, function() vgThumb[thumb][note[1]] = note[2]; lightThumb(thumb) end))
  end
end

-- The one scroll line (T.SCROLL) down the middle of a game thumb, drawn on host (the thumb, or an old
-- scroll bar's slider) along the thumb: text2, T.SCROLL.thumb wide, at the rest alpha.
local function thumbLine(host, thumb)
  local bar = T.Tint(T.Snap(host:CreateTexture(nil, "OVERLAY"), "fill"), "text2")
  bar:SetTexture(T.WHITE)
  bar:SetWidth(T.SCROLL.thumb)
  bar:SetPoint("TOP", thumb)
  bar:SetPoint("BOTTOM", thumb)
  bar:SetAlpha(T.SCROLL.rest)
  return bar
end

-- The line Vanguard drew for a game thumb, on host (the thumb itself unless given), made (and the host's
-- mouse watched) the first time.
local function thumbBar(thumb, host)
  host = host or thumb
  if not vgThumb[host] then
    vgThumb[host] = { bar = thumbLine(host, thumb) }
    watchThumb(host)
  end
  return vgThumb[host].bar
end

-- A scroll arrow faded away, once: alpha 0, and no longer taking the mouse.
local function fadeArrow(button)
  if vgArrow[button] then return end
  vgArrow[button] = true
  button:SetAlpha(0)
  button:EnableMouse(false)
end

-- One of an old scroll bar's up and down buttons, by key or, on a named bar, by its global name.
local function oldArrow(bar, key)
  local name = type(bar.GetName) == "function" and bar:GetName()
  return bar[key] or (name and _G[name .. key])
end

-- The game's old scroll bar (UIPanelScrollFrameTemplate's slider, whose thumb is a texture) in the
-- theme: its art faded, the thumb texture too, the one scroll line drawn on the slider along the thumb
-- (lit while the mouse is over the bar or drags it), the up and down buttons faded away.
local function oldScrollBar(bar)
  local thumb = type(bar.GetThumbTexture) == "function" and bar:GetThumbTexture() or bar.ThumbTexture
  if type(thumb) ~= "table" then return bar end
  T.FadeRegions(bar, { [thumbBar(thumb, bar)] = true })
  for _, key in ipairs(OLD_SCROLL_ARROWS) do
    local button = oldArrow(bar, key)
    if type(button) == "table" then fadeArrow(button) end
  end
  return bar
end

-- One of the game's scroll bars in the theme: its track and art faded, the thumb's art too with the one
-- scroll line (T.SCROLL) down its middle, lit while the mouse is over the thumb or drags it, and the
-- Back and Forward arrows faded away. The old scroll bar (UIPanelScrollFrameTemplate) gets the same look.
-- A bar without a thumb (not one of the game's) is left alone. Safe to run again.
function T.ScrollBar(bar)
  local thumb = bar.Thumb or (type(bar.Track) == "table" and bar.Track.Thumb)
  if type(thumb) ~= "table" then return oldScrollBar(bar) end
  for _, key in ipairs(T.SCROLL_ART) do fadePart(bar[key]) end
  fadePart(thumb, { [thumbBar(thumb)] = true })
  for _, key in ipairs(SCROLL_ARROWS) do if type(bar[key]) == "table" then fadeArrow(bar[key]) end end
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

-- The Vanguard crest (Media/Textures/Icon, pre-colored: the accent and theme don't tint it) at size x size.
function T.Logo(parent, size)
  local f = T.PixelSize(CreateFrame("Frame", nil, parent), size, size)
  local t = f:CreateTexture(nil, "ARTWORK")
  t:SetTexture(T.Texture("Icon"))
  t:SetAllPoints()
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
  -- The minimap's zone text: a bold 13 that never takes the faction look's display font (not in T.HEADING_ROLES).
  zone = { 13, true },
  -- A section header: small, and upper-cased by T.SetText (the fourth field) instead of by :upper() on the string.
  section = { 10, false, nil, true },
}

-- Every font string styled with a role: string -> role name. Weak, so text
-- that gets collected doesn't stay; T.RefreshText re-fonts them all.
local styled = setmetatable({}, { __mode = "k" })
-- Styled strings drawn at a size of their own (T.TextSize): string -> size. Weak too.
local sizes = setmetatable({}, { __mode = "k" })
-- Every font string coloured by token name (T.Color): string -> token. Weak; T.RefreshText recolours
-- them all, so a variant switch reaches text that was drawn before it (a light look needs dark text).
local colored = setmetatable({}, { __mode = "k" })

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

-- Sets a styled font string's text, in capitals when its role says so (T.ROLES.section).
function T.SetText(fs, text)
  local r = T.ROLES[styled[fs]]
  fs:SetText(r and r[4] and text:upper() or text)
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

-- The shadow under text coloured by token: none under the dark void text that sits on an accent fill
-- (a shadow only blurs it), the theme's back under styled text otherwise; other addons' text keeps its own.
local function shadowFor(fs, token)
  if token == "void" then fs:SetShadowColor(T.RGB("clear"))
  elseif styled[fs] then fs:SetShadowColor(T.RGB("textShadow")) end
end

-- Re-fonts every string styled with a role (after a font or text size change) and recolours every
-- string coloured by token (after a variant or accent change).
function T.RefreshText()
  for fs, role in pairs(styled) do T.ApplyRole(fs, role) end
  for fs, token in pairs(colored) do fs:SetTextColor(T.RGB(token)) shadowFor(fs, token) end
end

-- Colors a font string by token (remembered, so T.RefreshText keeps it current; see shadowFor), by
-- r, g, b (for other addons' skins; forgotten), or in the accent's text variant.
function T.Color(fs, r, g, b)
  if type(r) == "number" then
    colored[fs] = nil
    fs:SetTextColor(r, g, b)
  else
    colored[fs] = r or "accentText"
    fs:SetTextColor(T.RGB(r or "accentText"))
    shadowFor(fs, colored[fs])
  end
  return fs
end

-- Live changes ------------------------------------------------------------------------

-- Calls fn() after every theme change (for custom elements colored by hand).
function T.OnChanged(fn)
  listeners[#listeners + 1] = fn
end

-- Repaints the crests, the ornaments and the game frame primitives (check boxes, radios, arrows,
-- dividers).
local function repaintArt()
  for t in pairs(crests) do T.PaintCrest(t) end
  for frame, o in pairs(ornaments) do T.PaintOrnament(frame, o) end
  for button, c in pairs(checkOf) do c.paint(button, c) end
  for button in pairs(arrowOf) do paintArrow(button) end
  for _, d in pairs(dividerOf) do T.Tint(d.line, T.DIVIDER.color) end
end

-- Repaints every painted frame, re-fonts styled text, re-tints remembered regions and tells the listeners.
function T.Refresh()
  for frame, entry in pairs(painted) do repaint(frame, entry) end
  T.RefreshText()
  refreshTints()
  applyFontObjects()
  repaintArt()
  reSnap()
  for _, fn in ipairs(listeners) do fn() end
end

-- The faction look ---------------------------------------------------------------------

-- Your faction for the faction look ("Alliance" or "Horde"), or nil when it's off or you have none.
function T.Faction()
  if T.Settings().faction == "off" or not ns.FactionArt then return nil end
  local faction = ns.FactionArt.Faction()
  return faction ~= "none" and faction or nil
end

-- The faction's heading font, or nil (look not "auto", no faction, another font chosen, a client using
-- the game's font, or one whose script the heading fonts lack).
function T.HeadingFont()
  local s, faction = T.Settings(), T.Faction()
  if not faction or s.faction ~= "auto" or s.font ~= "" or useClientFont(s) or LATIN_HEADING_MISSING[locale()] then return nil end
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

-- The tex coords that turn the top-left corner bracket into each corner (#238).
local CORNER_FLIPS = { TOPLEFT = { 0, 1, 0, 1 }, TOPRIGHT = { 1, 0, 0, 1 }, BOTTOMLEFT = { 0, 1, 1, 0 }, BOTTOMRIGHT = { 1, 0, 1, 0 } }
-- How far the brackets and the rule sit in from the window's edge (units), and the bracket's size.
T.ORNAMENT_INSET, T.ORNAMENT_SIZE = 3, 14

-- Four corner brackets just inside a frame's corners.
local function cornerBrackets(frame)
  local out = {}
  for point, flip in pairs(CORNER_FLIPS) do
    local t = frame:CreateTexture(nil, "OVERLAY")
    t:SetTexture(T.Texture("OrnamentCorner"))
    t:SetSize(T.ORNAMENT_SIZE, T.ORNAMENT_SIZE)
    t:SetPoint(point, frame, point, outward(point, -T.ORNAMENT_INSET))
    t:SetTexCoord(flip[1], flip[2], flip[3], flip[4])
    out[#out + 1] = t
  end
  return out
end

-- A one-pixel rule along the bottom of an anchor (a header) with a diamond cut in its middle.
local function headerRule(frame, anchor)
  local left, right = solid(frame, "OVERLAY", 0, "divider"), solid(frame, "OVERLAY", 0, "divider")
  local mid = frame:CreateTexture(nil, "OVERLAY")
  mid:SetTexture(T.Texture("Diamond"))
  mid:SetSize(7, 7)
  mid:SetPoint("CENTER", anchor, "BOTTOM")
  left:SetPoint("BOTTOMLEFT", anchor, "BOTTOMLEFT", 12, 0)
  left:SetPoint("BOTTOMRIGHT", anchor, "BOTTOM", -8, 0)
  right:SetPoint("BOTTOMLEFT", anchor, "BOTTOM", 8, 0)
  right:SetPoint("BOTTOMRIGHT", anchor, "BOTTOMRIGHT", -12, 0)
  return { left, right, mid, rule = { left, right } }
end

-- Shows or hides a window's ornament with the ornaments setting and paints it in the accent's dim variant.
function T.PaintOrnament(frame, o)
  local on = T.Settings().ornaments == true or (T.Variant() or {}).ornaments == true
  for _, t in ipairs(o) do
    t:SetShown(on)
    T.Tint(t, "accentDim")
  end
  for _, t in ipairs(o.rule or {}) do t:SetHeight(T.Pixel(frame)) end
end

-- Gives a large window an ornament (#238), once: kind "corners" (four brackets) or "rule" (a rule
-- along the bottom of `anchor`, its header). One per window; never on combat frames. Off with the ornaments setting.
function T.Ornament(frame, kind, anchor)
  if ornaments[frame] then return end
  ornaments[frame] = kind == "rule" and headerRule(frame, anchor or frame) or cornerBrackets(frame)
  T.PaintOrnament(frame, ornaments[frame])
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

-- Eases one hover texture's alpha to `to` from where it is now; at once with Reduce motion, or when `now`.
local function easeTo(t, to, now)
  local f = not now and activeFader(t)
  if f then return playFade(f, t:GetAlpha(), to, T.FadeTime(to == 1 and T.HOVER_IN or T.HOVER_OUT), function() t:SetAlpha(to) end) end
  T.StopFade(t)
  t:SetAlpha(to)
end

-- Buttons whose hover look is held on while their menu is open (weak).
local heldHover = setmetatable({}, { __mode = "k" })

-- Eases a button's hover look (every texture of its fill, and its line) in (on, while it is enabled) or
-- out, from where it is now; at once with Reduce motion, or when `now` (the button was hidden).
-- A held button (T.HoldHover) keeps it until it is let go.
function T.EaseHover(button, on, now)
  local h = hoverOf[button]
  if not h then return end
  local to = (on or heldHover[button]) and (not button.IsEnabled or button:IsEnabled()) and 1 or 0
  for _, t in ipairs(h.fill.textures) do easeTo(t, to, now) end
  easeTo(h[2], to, now)
end

-- Holds a button's hover look on (a dropdown while its menu is open, even with the mouse gone) or lets it go.
function T.HoldHover(button, on)
  heldHover[button] = on and true or nil
  T.EaseHover(button, on == true)
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
