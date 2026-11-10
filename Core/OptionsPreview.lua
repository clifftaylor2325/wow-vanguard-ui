-- The General page's two drawn rows (Core/Options.lua lists them): the
-- accent row, a swatch per preset and a hex box, and a live sample of a
-- unit frame and an action button in the current theme. Core/OptionsWindow.lua
-- lays them out like any other row.

local ADDON, ns = ...

local L = ns.L

local T, W, O = ns.Theme, ns.Widgets, ns.Options

-- The rows' heights.
local SWATCHES_H, PREVIEW_H = 30, 52

-- Applies the typed #rrggbb as the accent (a bad one is ignored), then leaves the box.
local function applyHex(self)
  local cr, cg, cb = T.ParseHex(self:GetText())
  if cr then T.SetAccent(cr, cg, cb) end
  self:ClearFocus()
end

-- The swatches before the hex box (units): a swatch's size, the step from one to the next, the gap between the last
-- one and the hex box, and the extra gap that sets the class swatch apart from the presets.
local SWATCH = { size = 22, step = 26, gap = 12, apart = 8 }

-- The class swatch as the accent is now: your class colour, shown only while the client gives one, with the check
-- while the accent follows your class.
local function refreshClassSwatch(s, following)
  local r, g, b = T.ClassColor()
  s:SetShown(r ~= nil)
  if r then s.fill:SetVertexColor(r, g, b) end
  s.check:SetShown(following)
end

-- Shows the current accent as #rrggbb, and a check on the swatch that is the accent: the class swatch while the
-- accent follows your class, else the preset with its colour.
local function refreshAccent(self)
  self.hex:SetText("#" .. T.Hex("accent"):sub(3):upper())
  local r, g, b = T.Accent()
  local following = T.Settings().accentClass == true
  for _, s in ipairs(self.swatches) do s.check:SetShown(not following and s.rgb[1] == r and s.rgb[2] == g and s.rgb[3] == b) end
  refreshClassSwatch(self.classSwatch, following)
end

-- The accent row: a swatch per preset and a hex box (Enter applies).
local function accentRow(parent, width)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, SWATCHES_H)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.label:SetPoint("LEFT", 8, 0)
  r.label:SetText(L["Accent"])
  r.hex = W.Input(r, 74)
  r.hex:SetPoint("RIGHT", -8, 0)
  r.hex:SetScript("OnEnterPressed", ns.Guard("apply the accent hex", applyHex))
  r.Refresh = refreshAccent
  return r
end

-- One preset swatch, number i from the left: right to left before the hex box, with a void check for the chosen one.
local function generalSwatch(r, i, name)
  local rgb = T.PRESETS[name]
  local s = W.Swatch(r, rgb, function() T.SetAccent(rgb[1], rgb[2], rgb[3]) end)
  s:SetSize(SWATCH.size, SWATCH.size)
  s:SetPoint("RIGHT", r.hex, "LEFT", -SWATCH.gap - (#T.PRESET_ORDER - i) * SWATCH.step, 0)
  s.rgb = rgb
  s.check = W.IconTexture(s, "Check", 12, "void")
  s.check:SetPoint("CENTER")
  r.swatches[i] = s
end

-- The class swatch's tooltip, where the client has one: what a click does.
local function classTip(s)
  if not GameTooltip then return end
  GameTooltip:SetOwner(s, "ANCHOR_RIGHT")
  GameTooltip:SetText(L["Your class colour"])
  GameTooltip:AddLine(L["The accent follows your class, on every character that uses this profile."], T.RGB("text2"))
  GameTooltip:Show()
end

-- The class swatch, left of the presets and set a little apart from them: a click makes the accent follow your class
-- colour (T.SetClassAccent); refreshClassSwatch gives it its colour and its check.
local function addClassSwatch(r)
  local s = W.Swatch(r, T.PRESETS.brass, function() T.SetClassAccent() end)
  s:SetSize(SWATCH.size, SWATCH.size)
  s:SetPoint("RIGHT", r.hex, "LEFT", -SWATCH.gap - #T.PRESET_ORDER * SWATCH.step - SWATCH.apart, 0)
  s.check = W.IconTexture(s, "Check", 12, "void")
  s.check:SetPoint("CENTER")
  s:HookScript("OnEnter", ns.Guard("class swatch tip", classTip))
  s:HookScript("OnLeave", ns.Guard("class swatch tip", function() if GameTooltip then GameTooltip:Hide() end end))
  r.classSwatch = s
end

-- The preset swatches, and the class swatch before them.
local function addSwatches(r)
  r.swatches = {}
  for i, name in ipairs(T.PRESET_ORDER) do generalSwatch(r, i, name) end
  addClassSwatch(r)
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
  if ns.IsSecret(name) or type(name) ~= "string" then return L["You"] end
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
