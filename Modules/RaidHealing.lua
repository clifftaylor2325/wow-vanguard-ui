-- Healer extras on the raid frames:
--   * incoming heals (green) and shields (white) drawn past the health fill
--   * a colored strip along the top while a player has threat (aggro)
--   * a marker when a player is missing a buff you can give (Fortitude...)
--
-- Written for WoW Forever. Every client call is looked up when used, so a
-- missing one just switches that feature off. Heal prediction uses the
-- client's calculator where it has one (it may hand back hidden values,
-- which go straight to the bars), else the older incoming-heals call.
-- Buffs are watched by name: defaults per class, editable in /fui > Healing
-- (check the defaults against your client's spell names).

local ADDON, ns = ...

local T = ns.Theme
local RF = ns.GetModule("RaidFrames")

local RH = ns.Module("RaidHealing", {
  defaults = { healPrediction = true, absorbs = true, aggro = true, buffWatch = true, buffs = "" },
})

-- Buffs each class can give, by name (the single and group versions count alike).
RH.CLASS_BUFFS = {
  PRIEST = { "Power Word: Fortitude", "Prayer of Fortitude" },
  MAGE = { "Arcane Intellect", "Arcane Brilliance" },
  DRUID = { "Mark of the Wild", "Gift of the Wild" },
  WARRIOR = { "Battle Shout" },
  -- Any blessing, normal or greater, counts: a paladin gives one per player.
  PALADIN = {
    "Blessing of Might", "Blessing of Wisdom", "Blessing of Kings", "Blessing of Salvation", "Blessing of Light",
    "Greater Blessing of Might", "Greater Blessing of Wisdom", "Greater Blessing of Kings",
    "Greater Blessing of Salvation", "Greater Blessing of Light",
  },
}

-- Values -----------------------------------------------------------------------------------

-- A value that isn't there (nil). Written with type() so a hidden value never gets compared.
local function absent(v)
  return type(v) == "nil"
end

local calc

-- The client's heal prediction calculator (made once), or nil if this client has none.
local function calculator()
  if not calc and type(CreateUnitHealPredictionCalculator) == "function" then
    calc = CreateUnitHealPredictionCalculator()
    pcall(calc.SetIncomingHealClampMode, calc, 0)
    pcall(calc.SetIncomingHealOverflowPercent, calc, 1)
  end
  return calc
end

-- max health, incoming heals and shields for a unit (any may be hidden or nil).
function RH.Prediction(unit)
  local c = calculator()
  if c and type(UnitGetDetailedHealPrediction) == "function" then
    UnitGetDetailedHealPrediction(unit, "player", c)
    return c:GetMaximumHealth(), c:GetIncomingHeals(), c:GetTotalDamageAbsorbs()
  end
  local incoming = type(UnitGetIncomingHeals) == "function" and UnitGetIncomingHeals(unit) or nil
  local shields = type(UnitGetTotalAbsorbs) == "function" and UnitGetTotalAbsorbs(unit) or nil
  return UnitHealthMax(unit), incoming, shields
end

-- The threat strip color for a unit, or nil when it has no aggro (or its threat is hidden).
function RH.ThreatColor(unit)
  local status = type(UnitThreatSituation) == "function" and UnitThreatSituation(unit) or nil
  if ns.IsSecret(status) or type(status) ~= "number" or status < 1 then return nil end
  return T.TOKENS["threat" .. math.min(status, 3)]
end

-- Buff watch -------------------------------------------------------------------------------

-- The watched buff names: your own list if you set one, else your class's defaults.
function RH.BuffNames()
  local names = {}
  for name in (RH.settings.buffs or ""):gmatch("[^,]+") do
    names[#names + 1] = name:match("^%s*(.-)%s*$")
  end
  if #names > 0 then return names end
  local _, class = UnitClass("player")
  return RH.CLASS_BUFFS[class] or {}
end

-- Whether the client knows you can cast a spell by name.
local function known(name)
  local info = C_Spell and type(C_Spell.GetSpellInfo) == "function" and C_Spell.GetSpellInfo(name)
  if not absent(info) and info then return true end
  return type(GetSpellInfo) == "function" and not absent(GetSpellInfo(name))
end

-- Whether a unit has an aura by name (HELPFUL).
local function hasBuff(unit, name)
  if C_UnitAuras and type(C_UnitAuras.GetAuraDataBySpellName) == "function" then
    return not absent(C_UnitAuras.GetAuraDataBySpellName(unit, name, "HELPFUL"))
  end
  return AuraUtil and type(AuraUtil.FindAuraByName) == "function" and not absent(AuraUtil.FindAuraByName(name, unit, "HELPFUL"))
end

-- The first watched buff you know, if the unit has none of the watched buffs; else nil.
-- While the client hides auras a lookup can't see a hidden buff, so an absent
-- buff proves nothing: unknown shows no marker rather than a false alarm.
function RH.MissingBuff(unit)
  if ns.AurasSecret() then return nil end
  local names, canGive = RH.BuffNames(), nil
  for _, name in ipairs(names) do
    if hasBuff(unit, name) then return nil end
    canGive = canGive or (known(name) and name)
  end
  return canGive
end

-- Parts ------------------------------------------------------------------------------------

-- An overlay bar that starts where `after` ends (the health fill, or the heal
-- bar), in a texture: the bar texture for heals, tiled stripes for shields.
local function overlay(b, after, color, texture)
  local bar = CreateFrame("StatusBar", nil, b.health)
  bar:SetStatusBarTexture(texture)
  T.BarColor(bar, color)
  bar:SetPoint("TOPLEFT", after:GetStatusBarTexture(), "TOPRIGHT")
  bar:SetPoint("BOTTOMLEFT", after:GetStatusBarTexture(), "BOTTOMRIGHT")
  bar:Hide()
  return bar
end

-- The threat strip along the top edge.
local function addThreat(b)
  b.threat = b.health:CreateTexture(nil, "OVERLAY")
  b.threat:SetTexture(T.WHITE)
  b.threat:SetPoint("TOPLEFT")
  b.threat:SetPoint("TOPRIGHT")
  b.threat:SetHeight(3)
  b.threat:Hide()
end

-- The missing-buff marker: the buff's icon in the top-right corner.
local function addBuffMarker(b)
  b.missing = b.health:CreateTexture(nil, "OVERLAY")
  b.missing:SetSize(12, 12)
  b.missing:SetPoint("RIGHT", -2, 0)
  b.missing:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  b.missing:Hide()
end

-- Adds the heal, shield, threat and buff parts to a raid button (RF setup hook).
local function setup(b)
  b.health:SetClipsChildren(true)
  b.heal = overlay(b, b.health, "heal", T.BarTexture())
  b.shield = overlay(b, b.heal, "shield", T.Texture("Stripes"))
  b.shield:GetStatusBarTexture():SetHorizTile(true)
  addThreat(b)
  addBuffMarker(b)
end

-- Updating ----------------------------------------------------------------------------------

-- Fills an overlay from a value; hides it when the value isn't there. It is
-- as wide as the whole health bar (the button less its 1 px border), so the
-- same max gives the same scale as the health fill.
local function fill(b, bar, max, value, on)
  bar:SetShown(on and not absent(value))
  if not on or absent(value) then return end
  bar:SetWidth(math.max(0, (b:GetWidth() or 0) - 2))
  bar:SetMinMaxValues(0, max)
  bar:SetValue(value)
end

-- Incoming heals and shields.
local function updatePrediction(b, unit)
  local max, incoming, shields = RH.Prediction(unit)
  fill(b, b.heal, max, incoming, RH.settings.healPrediction)
  fill(b, b.shield, max, shields, RH.settings.absorbs)
end

-- The threat strip.
local function updateThreat(b, unit)
  local color = RH.settings.aggro and RH.ThreatColor(unit)
  b.threat:SetShown(color ~= nil and color ~= false)
  if color then b.threat:SetVertexColor(color[1], color[2], color[3]) end
end

-- The missing-buff marker (not on the dead or offline).
local function updateBuff(b, unit)
  local missing = RH.settings.buffWatch and not b.down and RH.MissingBuff(unit)
  b.missing:SetShown(missing ~= nil and missing ~= false)
  if missing and C_Spell and type(C_Spell.GetSpellTexture) == "function" then b.missing:SetTexture(C_Spell.GetSpellTexture(missing)) end
end

-- Everything (RF update hook).
local function update(b, unit)
  updatePrediction(b, unit)
  updateThreat(b, unit)
  updateBuff(b, unit)
end

-- Runs fn(b, unit) for the raid buttons showing a unit.
local function forUnit(unit, fn)
  for _, b in ipairs(RF.buttons) do
    if b.heal and b:IsShown() and RF.Shows(b, unit) then fn(b, b:GetAttribute("unit")) end
  end
end

-- Event -> which part it refreshes (health changes refresh everything via RF.Update).
local EVENTS = {
  -- Each handler refreshes one part for the unit named in the event.
  UNIT_HEAL_PREDICTION = function(_, unit) forUnit(unit, updatePrediction) end,
  UNIT_ABSORB_AMOUNT_CHANGED = function(_, unit) forUnit(unit, updatePrediction) end,
  UNIT_THREAT_SITUATION_UPDATE = function(_, unit) forUnit(unit, updateThreat) end,
  UNIT_AURA = function(_, unit) forUnit(unit, updateBuff) end,
  -- Leaving combat usually lifts the aura restriction: look at every buff again.
  PLAYER_REGEN_ENABLED = function() RF.UpdateAll() end,
}

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new).
function RH.Enable(settings)
  RH.settings = settings
  for _, b in ipairs(RF.buttons) do setup(b) end
  table.insert(RF.setupHooks, setup)
  table.insert(RF.updateHooks, update)
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
end

-- Options ------------------------------------------------------------------------------------

local W = ns.Widgets

-- get/set for one of this module's switches (applies at the next refresh).
local function switch(key)
  return function() return ns.Settings("RaidHealing", RH.defaults)[key] end,
    function(v) ns.Settings("RaidHealing", RH.defaults)[key] = v; RF.UpdateAll() end
end

-- Saves the typed buff list (empty = class defaults) and refreshes the frames.
local function saveBuffs(input)
  ns.Settings("RaidHealing", RH.defaults).buffs = input:GetText()
  input:ClearFocus()
  RF.UpdateAll()
end

-- The buff-list editor: names separated by commas, and Save.
local function buffEditor(content)
  local row = CreateFrame("Frame", nil, content)
  row:SetSize(480, 28)
  row.input = W.Input(row, 330)
  row.input:SetPoint("LEFT")
  row.save = W.Button(row, "Save", function() saveBuffs(row.input) end, 80)
  row.save:SetPoint("LEFT", row.input, "RIGHT", 8, 0)
  -- Shows the saved list, or your class's defaults when you haven't set one.
  row.Refresh = function(self) self.input:SetText(table.concat(RH.BuffNames(), ", ")) end
  row:Refresh()
  return row
end

ns.Options.AddRowKind("buffnames", buffEditor, 34)

ns.Options.AddPage({
  key = "healing",
  title = "Healing",
  icon = "Healing",
  order = 45,
  rows = function()
    return {
      { "header", "On the raid frames" },
      { "check", "Incoming heals (green, past the health)", switch("healPrediction") },
      { "check", "Shields (white, after incoming heals)", switch("absorbs") },
      { "check", "Aggro strip along the top (yellow, orange, red)", switch("aggro") },
      { "check", "Mark players missing a buff you can give", switch("buffWatch") },
      { "header", "Buffs to watch" },
      { "text", "Names, separated by commas. Leave empty for your class's usual buffs." },
      { "buffnames" },
    }
  end,
})
