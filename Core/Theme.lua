-- The ForeverUI look ("Slate & Brass"): flat dark panels, 1px borders,
-- one accent color and one font. Primitives take a frame and paint it; each
-- is idempotent (a second call just repaints) and every painted frame
-- follows live color changes. Textures are solid colors (WHITE8X8), so
-- nothing depends on art from another addon.
--
-- Every color the addon uses is a named token below. Modules ask for them
-- by name (T.RGB, T.Color, T.Tint, T.BarColor) and never write color
-- numbers themselves; scripts/lib/code-quality.mjs checks that.

local ADDON, ns = ...

local T = {}
ns.Theme = T

T.WHITE = "Interface\\Buttons\\WHITE8X8"

-- ForeverUI's own art and fonts (made by scripts/build-media.mjs and scripts/fonts).
T.MEDIA = "Interface\\AddOns\\ForeverUI\\Media\\"
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

-- A texture from Media/Textures (Bar, Shadow, Glow, Stripes, LogoLeft, ...).
function T.Texture(name) return T.MEDIA .. "Textures\\" .. name end
-- An icon from Media/Icons (General, Close, Check, Down, ...).
function T.Icon(name) return T.MEDIA .. "Icons\\" .. name end

-- r, g, b, a (0-1) from "rrggbb" and an optional alpha.
local function fromHex(hex, alpha)
  local n = tonumber(hex, 16)
  return { math.floor(n / 65536) / 255, math.floor(n / 256) % 256 / 255, n % 256 / 255, alpha or 1 }
end

-- Named colors: "rrggbb", or { "rrggbb", alpha }.
local TOKENS = {
  -- Surfaces
  void = "0b0d11", panel = { "12151b", 0.94 }, raised = "1a1e26", inset = { "07080b", 0.95 },
  edge = "000000", sheen = { "ffffff", 0.06 }, divider = "242a34", shade = { "000000", 0.5 },
  hover = { "ffffff", 0.08 }, darkBar = "2a3039", checked = { "ffffff", 0.25 }, gridline = { "ffffff", 0.12 },
  textShadow = { "000000", 0.9 },
  -- The dark sweep over an aura icon as its time runs out.
  sweep = { "000000", 0.65 },
  -- The spark on the power bar (the five-second rule, energy ticks) and the swing timer.
  spark = { "ffffff", 0.9 },
  -- Text
  text = "e8eaee", text2 = "a6adb9", muted = "6b7280", white = "ffffff", gold = "ffd100",
  -- State (kept apart from the accent)
  good = "4fc27a", warn = "ee8b3a", bad = "e0565b", info = "5aa2f0", unknown = "808080",
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

-- Accent presets for /fui accent and the options swatches, in display order.
T.PRESET_ORDER = { "brass", "arcane", "fel", "void", "ember" }
T.PRESETS = {
  brass = fromHex("d9a441"), arcane = fromHex("5aa2f0"), fel = fromHex("5bcb7e"),
  void = fromHex("a47bf0"), ember = fromHex("e0664b"),
}
-- Earlier preset names still work.
local ALIASES = { blue = "arcane", bronze = "brass", green = "fel", purple = "void", red = "ember" }

local DEFAULTS = {
  accent = T.PRESETS.brass,
  panel = T.TOKENS.panel,
  inset = T.TOKENS.inset,
  border = T.TOKENS.edge,
  font = "",
  outline = "",
  pixelScale = false,
  textScale = 1,
  barTexture = "forever",
  -- Soft shadows under HUD frames (unit frames, bars, minimap); floating windows always have one.
  hudShadow = false,
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

-- r, g, b, a of a named color (see TOKENS; accent, panel, inset and edge follow the settings).
function T.RGB(name)
  local key = SETTING_TOKENS[name]
  local c = key and T.Settings()[key] or T.TOKENS[name]
  if not c then error("ForeverUI: no color named " .. tostring(name), 2) end
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

-- True when the game's font must be used: chosen, or a Korean or Chinese client.
local function useClientFont(s)
  local locale = type(GetLocale) == "function" and GetLocale() or ""
  return s.font == "client" or CLIENT_FONT_LOCALES[locale] == true
end

-- The UI font path (bold: the SemiBold weight) and outline flag. Settings:
-- font "" is the bundled Fira Sans Condensed, "client" the game's font,
-- anything else a font path.
function T.Font(bold)
  local s = T.Settings()
  if useClientFont(s) then return clientFont(), s.outline end
  if s.font ~= "" then return s.font, s.outline end
  return bold and T.FONTS.bold or T.FONTS.regular, s.outline
end

-- Parts --------------------------------------------------------------------------------

-- A solid-color texture on frame at a draw layer (and sublevel).
local function solid(frame, layer, sublevel)
  local t = frame:CreateTexture(nil, layer, nil, sublevel)
  t:SetTexture(T.WHITE)
  return T.Snap(t)
end

-- Keeps a texture off the client's pixel-grid snapping, so 1 px lines and
-- icon edges stay crisp at any UI scale instead of blurring or jumping.
function T.Snap(texture)
  if texture.SetSnapToPixelGrid then
    texture:SetSnapToPixelGrid(false)
    texture:SetTexelSnappingBias(0)
  end
  return texture
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

-- Where a frame's border is drawn: a status bar's on top (its fill would cover
-- a BORDER-layer line), anything else's under its content.
local function edgeLayer(frame)
  local bar = frame.GetObjectType and frame:GetObjectType() == "StatusBar"
  if bar then return "OVERLAY", 7 end
  return "BORDER", 0
end

-- Four edge textures around frame (sized to one pixel when painted).
local function edges(frame)
  local layer, sub = edgeLayer(frame)
  local e = { top = solid(frame, layer, sub), bottom = solid(frame, layer, sub), left = solid(frame, layer, sub), right = solid(frame, layer, sub) }
  e.top:SetPoint("TOPLEFT"); e.top:SetPoint("TOPRIGHT")
  e.bottom:SetPoint("BOTTOMLEFT"); e.bottom:SetPoint("BOTTOMRIGHT")
  e.left:SetPoint("TOPLEFT"); e.left:SetPoint("BOTTOMLEFT")
  e.right:SetPoint("TOPRIGHT"); e.right:SetPoint("BOTTOMRIGHT")
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
  return solid(frame, "BORDER")
end

-- Places the sheen one pixel inside the top border, one pixel tall.
local function placeSheen(t, frame)
  local px = T.Pixel(frame)
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", px, -px)
  t:SetPoint("TOPRIGHT", -px, -px)
  t:SetHeight(px)
  T.Tint(t, "sheen")
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
  for _, a in ipairs(piece.at) do t:SetPoint(a[1], frame, a[2]) end
  local size = wholePixels(frame, look.size)
  if not piece.w then t:SetHeight(size) end
  if not piece.h then t:SetWidth(size) end
  return t
end

-- The eight pieces of a soft ring (shadow or glow) around frame.
local function ring(frame, look)
  local pieces = {}
  for i, piece in ipairs(SHADOW_PIECES) do pieces[i] = ringPiece(frame, piece, look) end
  return pieces
end

-- A soft shadow around frame, behind everything else on it.
local function shadow(frame)
  return ring(frame, { texture = "Shadow", size = SHADOW_SIZE, layer = "BACKGROUND", sublevel = -8 })
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

-- Bars ---------------------------------------------------------------------------------------

-- The status bar texture the setting picks: the bundled Bar (Forever), the
-- calmer BarSoft (Soft), or flat.
function T.BarTexture()
  local pick = T.Settings().barTexture
  if pick == "flat" then return T.WHITE end
  if pick == "soft" then return T.Texture("BarSoft") end
  return T.Texture("Bar")
end

-- A soft spark (Media/Textures/Spark) on a bar's top layer, width units wide,
-- drawn additively so it brightens the fill under it. The caller places and tints it.
function T.Spark(bar, width)
  local t = T.Snap(bar:CreateTexture(nil, "OVERLAY"))
  t:SetTexture(T.Texture("Spark"))
  t:SetBlendMode("ADD")
  t:SetWidth(width)
  return t
end

-- Gives a status bar the theme's bar texture.
function T.StyleBar(bar)
  bar:SetStatusBarTexture(T.BarTexture())
  T.Snap(bar:GetStatusBarTexture())
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

-- The textures ForeverUI painted on a frame (its panel, border, sheen,
-- shadow...), so fading the game's art again leaves them alone.
local function ownParts(frame)
  local own, entry = {}, painted[frame]
  for _, part in pairs(entry and entry.parts or {}) do
    if type(part) == "table" and part.GetObjectType then own[part] = true
    elseif type(part) == "table" then for _, p in pairs(part) do own[p] = true end end
  end
  return own
end

-- Alpha-out a frame's texture regions (template art), except ForeverUI's own
-- painted parts and any in keep. Never hides; safe to run again on every show.
function T.FadeRegions(frame, keep)
  local own = ownParts(frame)
  for _, region in ipairs({ frame:GetRegions() }) do
    if region.GetObjectType and region:GetObjectType() == "Texture" and not own[region] and not (keep and keep[region]) then
      region:SetAlpha(0)
    end
  end
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

-- Colors a painted background: panel, inset or raised color, at opts.alpha if given.
local function paintBg(bg, opts)
  local r, g, b, a = T.PanelColor(opts.inset)
  if opts.raised then r, g, b, a = T.RGB("raised") end
  bg:SetVertexColor(r, g, b, opts.alpha or a)
end

-- Applies the current colors (and pixel size) to one painted frame.
local function repaint(frame, entry)
  local p = entry.parts
  if p.bg then paintBg(p.bg, entry.opts) end
  if p.edges then
    colorEdges(p.edges, borderColor(entry))
    sizeEdges(p.edges, frame)
  end
  if p.sheen then placeSheen(p.sheen, frame) end
  if entry.paint then entry.paint(entry) end
end

-- The parts opts ask for: background, edges, sheen (with a background) and shadow.
local function makeParts(frame, opts)
  local parts = {}
  parts.bg = not opts.noBg and solid(frame, "BACKGROUND") or nil
  if parts.bg then parts.bg:SetAllPoints() end
  parts.edges = not opts.noBorder and edges(frame) or nil
  parts.sheen = parts.bg and not opts.noSheen and sheen(frame) or nil
  parts.shadow = opts.shadow and shadow(frame) or nil
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
-- noBorder, noBg, noSheen.
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

-- A flat button: inset panel, template art faded, a faint white hover.
function T.Button(button)
  local fresh = not painted[button]
  local entry = base(button, "button", { inset = true })
  if fresh then
    T.FadeRegions(button, { [entry.parts.bg] = true })
    entry.parts.hover = solid(button, "HIGHLIGHT")
    entry.parts.hover:SetAllPoints()
    T.Tint(entry.parts.hover, "hover")
  end
  repaint(button, entry)
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

-- The painted close glyph: the Close icon in the secondary text color.
local function paintClose(entry)
  T.Tint(entry.parts.glyph, "text2")
end

-- The close icon and a hover wash on a button.
local function closeParts(button)
  local glyph = button:CreateTexture(nil, "OVERLAY")
  glyph:SetTexture(T.Icon("Close"))
  glyph:SetSize(12, 12)
  glyph:SetPoint("CENTER")
  local hover = solid(button, "HIGHLIGHT")
  hover:SetAllPoints()
  T.Tint(hover, "hover")
  return { glyph = glyph, hover = hover }
end

-- A close button drawn with the Close icon; template art faded.
function T.CloseButton(button)
  local entry = painted[button]
  if not entry then
    T.FadeRegions(button)
    entry = { kind = "close", opts = {}, parts = closeParts(button), paint = paintClose }
    painted[button] = entry
  end
  repaint(button, entry)
  return button
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

-- The ForeverUI mark (two linked diamonds) at size x size; follows the accent live.
function T.Logo(parent, size)
  local f = CreateFrame("Frame", nil, parent)
  f:SetSize(size, size)
  local parts = { right = logoHalf(f, "Right", 0), left = logoHalf(f, "Left", 1) }
  local entry = { kind = "logo", opts = {}, parts = parts, paint = paintLogo }
  painted[f] = entry
  paintLogo(entry)
  return f
end

-- Crops the baked-in bevel off an icon texture.
function T.Crop(texture)
  texture:SetTexCoord(0.08, 0.92, 0.08, 0.92)
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
  title = { 15, true }, heading = { 13, true }, name = { 13, true }, cell = { 11, true },
  label = { 12 }, number = { 12 }, small = { 10 }, tiny = { 9 }, world = { 10, true, "OUTLINE" },
  barName = { 11, true, "OUTLINE" }, barSmall = { 10, false, "OUTLINE" },
  -- Aura icons: stack counts, and the timer on larger and smaller icons.
  cooldown = { 14, true, "OUTLINE" }, auraCount = { 10, true, "OUTLINE" }, auraTimer = { 11, true, "OUTLINE" }, auraTimerSmall = { 9, true, "OUTLINE" },
  -- Chat windows (Modules/Chat.lua picks the size; this is Medium).
  chat = { 12 },
}

-- Every font string styled with a role: string -> role name. Weak, so text
-- that gets collected doesn't stay; T.RefreshText re-fonts them all.
local styled = setmetatable({}, { __mode = "k" })

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
  if not r then error("ForeverUI: no text role named " .. tostring(role), 2) end
  styled[fs] = role
  T.ApplyRole(fs, role)
  if color ~= false then T.Color(fs, color or "text") end
  return fs
end

-- Sets a role's font, size and shadow (or outline) on a font string; leaves its color alone.
function T.ApplyRole(fs, role)
  local r = T.ROLES[role]
  local path, outline = T.Font(r[2])
  if T.HEADING_ROLES[role] then path = T.HeadingFont() or path end
  fs:SetFont(path, roleSize(r), r[3] or outline)
  fs:SetShadowOffset(r[3] and 0 or 1, r[3] and 0 or -1)
  fs:SetShadowColor(T.RGB("textShadow"))
end

-- Re-fonts every string styled with a role (after a font or text size change).
function T.RefreshText()
  for fs, role in pairs(styled) do T.ApplyRole(fs, role) end
end

-- Colors a font string: a named color, r, g, b (for other addons' skins), or the accent.
function T.Color(fs, r, g, b)
  if type(r) == "number" then
    fs:SetTextColor(r, g, b)
  else
    fs:SetTextColor(T.RGB(r or "accent"))
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
  for t in pairs(crests) do T.PaintCrest(t) end
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

-- The faction's heading font, or nil (look off, no faction, another font chosen, or a client using the game's font).
function T.HeadingFont()
  local s, faction = T.Settings(), T.Faction()
  if not faction or s.font ~= "" or useClientFont(s) then return nil end
  return T.FONTS[faction:lower()]
end

-- Paints a crest texture: your faction's crest in its color, hidden while the look is off.
function T.PaintCrest(t)
  local crest = T.CRESTS[T.Faction() or ""]
  t:SetShown(crest ~= nil)
  if not crest then return end
  t:SetTexture(T.MEDIA .. "Art\\" .. crest[1])
  T.Tint(t, crest[2], t.fuiAlpha)
end

-- A size x size crest on a frame (at an optional alpha), following the faction look as it changes.
function T.Crest(parent, size, layer, alpha)
  local t = parent:CreateTexture(nil, layer or "ARTWORK")
  t:SetSize(size, size)
  t.fuiAlpha = alpha
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

-- A frame's alpha animation (made once), or false when the client can't animate it.
local function fader(frame)
  if frame.fuiFader ~= nil then return frame.fuiFader end
  local group = frame.CreateAnimationGroup and frame:CreateAnimationGroup()
  local alpha = group and group.CreateAnimation and group:CreateAnimation("Alpha")
  if alpha then group:SetToFinalAlpha(true) end
  frame.fuiFader = alpha and { group = group, alpha = alpha } or false
  return frame.fuiFader
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

-- Shows a frame, fading it in (0.12 s by default) unless motion is off.
-- Only for frames that aren't protected: animations never move secure frames.
function T.FadeIn(frame, seconds)
  local f = activeFader(frame)
  frame:Show()
  if not f then return frame:SetAlpha(1) end
  playFade(f, 0, 1, seconds or 0.12, function() frame:SetAlpha(1) end)
end

-- Fades a frame out, then hides it (and runs done); at once when motion is off.
function T.FadeOut(frame, seconds, done)
  local f = activeFader(frame)
  -- Hides the frame, restores its alpha for next time, and tells the caller.
  local finish = function() frame:Hide() frame:SetAlpha(1) if done then done() end end
  if not f or not frame:IsShown() then return finish() end
  playFade(f, 1, 0, seconds or 0.12, finish)
end

-- Stops a fade in progress and leaves the frame fully visible.
function T.StopFade(frame)
  local f = frame.fuiFader
  if f then f.group:SetScript("OnFinished", nil) f.group:Stop() end
  frame:SetAlpha(1)
end

-- Interface sounds by use -> the client's SOUNDKIT name.
local SOUNDS = {
  on = "IG_MAINMENU_OPTION_CHECKBOX_ON", off = "IG_MAINMENU_OPTION_CHECKBOX_OFF",
  page = "IG_CHARACTER_INFO_TAB", open = "IG_MAINMENU_OPEN", close = "IG_MAINMENU_CLOSE",
}

-- Plays one of the client's own interface sounds, unless sounds are off.
function T.Sound(use)
  local kit = type(SOUNDKIT) == "table" and SOUNDKIT[SOUNDS[use] or ""]
  if T.Settings().sounds and kit and type(PlaySound) == "function" then PlaySound(kit) end
end

-- Pixel-perfect scale ----------------------------------------------------------------

-- Sets UIParent to the pixel-perfect scale when that setting is on, out of
-- combat, then resizes every border.
function T.ApplyScale()
  if not T.Settings().pixelScale then return end
  ns.OutOfCombat(function()
    UIParent:SetScale(T.PixelPerfectScale())
    T.Refresh()
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

-- How many frames are painted (for /fui status and tests).
function T.PaintedCount()
  local n = 0
  for _ in pairs(painted) do
    n = n + 1
  end
  return n
end
