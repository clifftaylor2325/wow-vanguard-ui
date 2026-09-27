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
  hover = { "ffffff", 0.08 }, checked = { "ffffff", 0.25 }, gridline = { "ffffff", 0.12 },
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
}

-- Painted frames: frame -> { kind, opts, parts }. Weak, so hidden frames
-- that get collected don't stay here.
local painted = setmetatable({}, { __mode = "k" })
local listeners = {}

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

-- The UI font path and outline flag.
function T.Font()
  local s = T.Settings()
  local path = s.font ~= "" and s.font or STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF"
  return path, s.outline
end

-- Parts --------------------------------------------------------------------------------

-- A solid-color texture on frame at a draw layer.
local function solid(frame, layer)
  local t = frame:CreateTexture(nil, layer)
  t:SetTexture(T.WHITE)
  return t
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

-- How long one screen pixel is in a frame's units, so a border of this size
-- is exactly one pixel at any UI scale. Uses the client's PixelUtil when present.
function T.Pixel(frame)
  local scale, util = scaleOf(frame), _G.PixelUtil
  if type(util) == "table" and type(util.GetNearestPixelSize) == "function" then
    return util.GetNearestPixelSize(1, scale, 1)
  end
  return 768 / screenHeight() / scale
end

-- The UI scale that makes one UI unit one screen pixel (768 / screen height).
function T.PixelPerfectScale()
  return 768 / screenHeight()
end

-- Four edge textures around frame (sized to one pixel when painted).
local function edges(frame)
  local e = { top = solid(frame, "BORDER"), bottom = solid(frame, "BORDER"), left = solid(frame, "BORDER"), right = solid(frame, "BORDER") }
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

-- Sets the color of every edge.
local function colorEdges(e, r, g, b, a)
  for _, t in pairs(e) do
    t:SetVertexColor(r, g, b, a or 1)
  end
end

-- Alpha-out a frame's existing texture regions (template art). Never hides.
function T.FadeRegions(frame, keep)
  for _, region in ipairs({ frame:GetRegions() }) do
    if region.GetObjectType and region:GetObjectType() == "Texture" and not (keep and keep[region]) then
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

-- Colors a painted background: panel (or inset) color, at opts.alpha if given.
local function paintBg(bg, opts)
  local r, g, b, a = T.PanelColor(opts.inset)
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
  if entry.paint then entry.paint(entry) end
end

-- Creates (once) the background and edges for frame; returns its entry.
local function base(frame, kind, opts)
  local entry = painted[frame]
  if not entry then
    entry = { kind = kind, opts = opts or {}, parts = {} }
    entry.parts.bg = not entry.opts.noBg and solid(frame, "BACKGROUND") or nil
    if entry.parts.bg then entry.parts.bg:SetAllPoints() end
    entry.parts.edges = not entry.opts.noBorder and edges(frame) or nil
    painted[frame] = entry
  end
  return entry
end

-- Primitives -----------------------------------------------------------------------

-- A flat dark panel with a 1px border. opts: inset (darker), accent
-- (accent-colored border), alpha (fill opacity), noBorder, noBg.
function T.Panel(frame, opts)
  local entry = base(frame, "panel", opts)
  repaint(frame, entry)
  return frame
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

-- The painted close glyph: an accent-on-hover "x" in the theme font.
local function paintClose(entry)
  T.SetFont(entry.parts.glyph, 14)
  T.Color(entry.parts.glyph, "text2")
end

-- A close button drawn as an "x"; template art faded.
function T.CloseButton(button)
  local entry = painted[button]
  if not entry then
    T.FadeRegions(button)
    entry = { kind = "close", opts = {}, parts = { glyph = button:CreateFontString(nil, "OVERLAY") }, paint = paintClose }
    entry.parts.glyph:SetPoint("CENTER")
    entry.parts.glyph:SetText("x")
    painted[button] = entry
  end
  repaint(button, entry)
  return button
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

-- Repaints every painted frame and tells the listeners.
function T.Refresh()
  for frame, entry in pairs(painted) do
    repaint(frame, entry)
  end
  for _, fn in ipairs(listeners) do
    fn()
  end
end

-- Sets the accent color (0-1 components) and repaints.
function T.SetAccent(r, g, b)
  T.Settings().accent = { r, g, b }
  T.Refresh()
end

-- Puts every theme setting back to its default and repaints.
function T.Reset()
  ns.Profile().theme = nil
  T.Refresh()
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
