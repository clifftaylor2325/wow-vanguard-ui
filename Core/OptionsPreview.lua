-- The General page's two drawn rows (Core/Options.lua lists them): the
-- accent row, a swatch per preset and a hex box, and a live sample of a
-- unit frame and an action button in the current theme. Core/OptionsWindow.lua
-- lays them out like any other row.

local ADDON, ns = ...

local T, W, O = ns.Theme, ns.Widgets, ns.Options

-- The rows' heights.
local SWATCHES_H, PREVIEW_H = 30, 52

-- Applies the typed #rrggbb as the accent (a bad one is ignored), then leaves the box.
local function applyHex(self)
  local cr, cg, cb = T.ParseHex(self:GetText())
  if cr then T.SetAccent(cr, cg, cb) end
  self:ClearFocus()
end

-- The accent row: a swatch per preset and a hex box (Enter applies).
local function accentRow(parent, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, SWATCHES_H)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.label:SetPoint("LEFT", 8, 0)
  r.label:SetText("Accent")
  r.hex = W.Input(r, 74)
  r.hex:SetPoint("RIGHT", -8, 0)
  r.hex:SetScript("OnEnterPressed", ns.Guard("apply the accent hex", applyHex))
  -- Shows the current accent as #rrggbb.
  r.Refresh = function(self) self.hex:SetText("#" .. T.Hex("accent"):sub(3):upper()) end
  return r
end

-- The preset swatches, right to left before the hex box.
local function addSwatches(r)
  for i, name in ipairs(T.PRESET_ORDER) do
    local rgb = T.PRESETS[name]
    local s = W.Swatch(r, rgb, function() T.SetAccent(rgb[1], rgb[2], rgb[3]) end)
    s:SetSize(22, 22)
    s:SetPoint("RIGHT", r.hex, "LEFT", -12 - (#T.PRESET_ORDER - i) * 26, 0)
  end
end

-- A bar on the sample unit frame, h tall, at value (of 100).
local function sampleBar(f, h, value)
  local bar = CreateFrame("StatusBar", nil, f)
  bar:SetHeight(h)
  bar:SetMinMaxValues(0, 100)
  bar:SetValue(value)
  return bar
end

-- The sample unit frame: health on top with the name and health text, power along the bottom.
local function sampleUnit(r)
  local f = T.HudPanel(CreateFrame("Frame", nil, r))
  f:SetSize(220, 36)
  f:SetPoint("LEFT", 8, 0)
  f.health, f.power = sampleBar(f, 26, 72), sampleBar(f, 7, 60)
  f.health:SetPoint("TOPLEFT", 1, -1)
  f.health:SetPoint("TOPRIGHT", -1, -1)
  f.power:SetPoint("BOTTOMLEFT", 1, 1)
  f.power:SetPoint("BOTTOMRIGHT", -1, 1)
  return f
end

-- The sample unit frame's name (left) and health (right).
local function sampleTexts(f)
  f.name = T.Text(f.health:CreateFontString(nil, "OVERLAY"), "name")
  f.name:SetPoint("LEFT", 4, 0)
  f.value = T.Text(f.health:CreateFontString(nil, "OVERLAY"), "number")
  f.value:SetPoint("RIGHT", -4, 0)
end

-- The sample action button: Vanguard's crest as its icon, a key and count, and an accent glow (a spell that procced).
local function sampleButton(r)
  local b = T.Button(CreateFrame("Button", nil, r))
  b:SetSize(36, 36)
  b:SetPoint("LEFT", r.unit, "RIGHT", 16, 0)
  b.icon = b:CreateTexture(nil, "ARTWORK")
  b.icon:SetPoint("TOPLEFT", 1, -1)
  b.icon:SetPoint("BOTTOMRIGHT", -1, 1)
  b.icon:SetTexture(T.Texture("Icon"))
  b.hotkey, b.count = T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "text2"), T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "white")
  b.glow = T.Glow(b, 6)
  return b
end

-- The sample button's key text as the bars place theirs: one line along the top, right-aligned.
local function placeHotkey(fs)
  fs:SetPoint("TOPLEFT", 2, -2)
  fs:SetPoint("TOPRIGHT", -2, -2)
  fs:SetJustifyH("RIGHT")
  fs:SetWordWrap(false)
end

-- A live sample in the current theme (accent, font, text size, bar texture):
-- a unit frame and an action button, as the HUD draws them.
local function previewRow(parent, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, PREVIEW_H)
  r.unit = sampleUnit(r)
  sampleTexts(r.unit)
  r.button = sampleButton(r)
  placeHotkey(r.button.hotkey)
  r.button.count:SetPoint("BOTTOMRIGHT", -2, 2)
  return r
end

-- The sample unit's name: the player's own, or "You" when the client hides it or gives none.
local function playerName()
  local name = UnitName("player")
  if ns.IsSecret(name) or type(name) ~= "string" then return "You" end
  return name
end

-- Fills the sample from the theme as it is now: the bar texture, the bars' colors, the texts and the glow.
local function refreshPreview(r)
  local u, b = r.unit, r.button
  for _, bar in ipairs({ u.health, u.power }) do T.StyleBar(bar) end
  T.BarColor(u.health, "friendly")
  T.BarColor(u.power, "mana")
  u.name:SetText(playerName())
  u.value:SetText("72%")
  b.hotkey:SetText("1")
  b.count:SetText("5")
  T.ShowGlow(b.glow, true)
end

-- The accent row with its swatches.
local function swatchesRow(parent, _, width)
  local r = accentRow(parent, width)
  addSwatches(r)
  return r
end

-- The sample, which refreshes from the theme.
local function sampleRow(parent, _, width)
  local r = previewRow(parent, width)
  r.Refresh = refreshPreview
  return r
end

O.AddRowKind("swatches", swatchesRow, SWATCHES_H)
O.AddRowKind("preview", sampleRow, PREVIEW_H)
