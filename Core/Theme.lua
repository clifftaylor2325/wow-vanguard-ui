-- The ForeverUI look: flat dark panels, 1px borders, one accent color and
-- one font. Primitives take a frame and paint it; each is idempotent (a
-- second call just repaints) and every painted frame follows live color
-- changes. Textures are solid colors (WHITE8X8), so nothing depends on
-- art from another addon.

local ADDON, ns = ...

local T = {}
ns.Theme = T

T.WHITE = "Interface\\Buttons\\WHITE8X8"

local DEFAULTS = {
  accent = { 0.24, 0.62, 1 },
  panel = { 0.06, 0.07, 0.09, 0.92 },
  inset = { 0.02, 0.02, 0.03, 0.95 },
  border = { 0, 0, 0, 1 },
  font = "",
  outline = "",
}

-- Named accent colors for /fui accent <name>.
T.PRESETS = {
  blue = { 0.24, 0.62, 1 },
  bronze = { 0.8, 0.62, 0.4 },
  green = { 0.36, 0.8, 0.45 },
  purple = { 0.64, 0.46, 0.95 },
  red = { 0.9, 0.3, 0.3 },
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

-- Four 1px edge textures around frame.
local function edges(frame)
  local e = { top = solid(frame, "BORDER"), bottom = solid(frame, "BORDER"), left = solid(frame, "BORDER"), right = solid(frame, "BORDER") }
  e.top:SetPoint("TOPLEFT"); e.top:SetPoint("TOPRIGHT"); e.top:SetHeight(1)
  e.bottom:SetPoint("BOTTOMLEFT"); e.bottom:SetPoint("BOTTOMRIGHT"); e.bottom:SetHeight(1)
  e.left:SetPoint("TOPLEFT"); e.left:SetPoint("BOTTOMLEFT"); e.left:SetWidth(1)
  e.right:SetPoint("TOPRIGHT"); e.right:SetPoint("BOTTOMRIGHT"); e.right:SetWidth(1)
  return e
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

-- Applies the current colors to one painted frame.
local function repaint(entry)
  local p = entry.parts
  if p.bg then
    paintBg(p.bg, entry.opts)
  end
  if p.edges then
    colorEdges(p.edges, borderColor(entry))
  end
  if entry.paint then
    entry.paint(entry)
  end
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
  repaint(entry)
  return frame
end

-- Sets a painted frame's border to { r, g, b }, or back to the theme's with nil.
function T.SetBorder(frame, rgb)
  local entry = painted[frame]
  if not entry then return end
  entry.opts.border = rgb
  repaint(entry)
end

-- A flat button: inset panel, template art faded, a faint white hover.
function T.Button(button)
  local fresh = not painted[button]
  local entry = base(button, "button", { inset = true })
  if fresh then
    T.FadeRegions(button, { [entry.parts.bg] = true })
    entry.parts.hover = solid(button, "HIGHLIGHT")
    entry.parts.hover:SetAllPoints()
    entry.parts.hover:SetVertexColor(1, 1, 1, 0.08)
  end
  repaint(entry)
  return button
end

-- A near-black input box with a border; template art faded.
function T.EditBox(box)
  local fresh = not painted[box]
  local entry = base(box, "editbox", { inset = true })
  if fresh then
    T.FadeRegions(box, { [entry.parts.bg] = true })
  end
  repaint(entry)
  return box
end

-- The painted close glyph: an accent-on-hover "x" in the theme font.
local function paintClose(entry)
  T.SetFont(entry.parts.glyph, 14)
  entry.parts.glyph:SetTextColor(0.85, 0.85, 0.85)
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
  repaint(entry)
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

-- Colors a font string with the accent (or the given color).
function T.Color(fs, r, g, b)
  if r then
    fs:SetTextColor(r, g, b)
  else
    fs:SetTextColor(T.Accent())
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
  for _, entry in pairs(painted) do
    repaint(entry)
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

-- r, g, b (0-1) from a preset name, "rrggbb" or "#rrggbb"; nil otherwise.
function T.ParseColor(text)
  local preset = T.PRESETS[text]
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
