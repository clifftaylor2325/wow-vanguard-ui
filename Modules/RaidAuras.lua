-- Raid frame indicators: a colored border when a player has a debuff you
-- can dispel, and your own HoTs as small icons with their timers.
--
-- The client's aura filters decide what counts ("HARMFUL|RAID" is debuffs
-- you can dispel; "HELPFUL|PLAYER|RAID(_IN_COMBAT)" is your buffs worth
-- showing on raid frames), so this file never has to read spell names or
-- durations. Midnight may hide some aura values in combat: icons and timers
-- are handed to the widgets as they come, and a hidden dispel type gets a
-- plain highlight instead of its color.

local ADDON, ns = ...

local T = ns.Theme
local RF = ns.GetModule("RaidFrames")

local RA = ns.Module("RaidAuras", {
  defaults = { dispel = true, hots = true, maxHots = 3 },
})

local ICON_SIZE = 14
local HIGHLIGHT = { 0.8, 0.3, 1 }
local DISPEL_COLORS = { Magic = { 0.2, 0.6, 1 }, Curse = { 0.6, 0, 1 }, Disease = { 0.6, 0.4, 0 }, Poison = { 0, 0.6, 0 } }

-- Aura reads ----------------------------------------------------------------------------

-- The i-th aura on a unit through a client filter, or nil (no API, none, or an error).
function RA.Aura(unit, i, filter)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByIndex
  if type(get) ~= "function" then return nil end
  local ok, aura = pcall(get, unit, i, filter)
  return ok and type(aura) == "table" and aura or nil
end

-- The border color for a dispellable debuff: its type's color, or a plain highlight when hidden.
function RA.DispelColor(aura)
  local kind = aura.dispelName
  if ns.IsSecret(kind) or type(kind) ~= "string" then return HIGHLIGHT end
  return DISPEL_COLORS[kind] or HIGHLIGHT
end

-- The filter for your HoTs: the combat one while in combat.
local function hotFilter()
  return ns.InCombat() and "HELPFUL|PLAYER|RAID_IN_COMBAT" or "HELPFUL|PLAYER|RAID"
end

-- Parts --------------------------------------------------------------------------------

-- The border's sides: two anchor points and a width (vertical) or height (horizontal).
local SIDES = {
  { "TOPLEFT", "TOPRIGHT", nil, 2 }, { "BOTTOMLEFT", "BOTTOMRIGHT", nil, 2 },
  { "TOPLEFT", "BOTTOMLEFT", 2 }, { "TOPRIGHT", "BOTTOMRIGHT", 2 },
}

-- One 2 px border edge along a side.
local function edge(frame, side)
  local t = frame:CreateTexture(nil, "OVERLAY")
  t:SetTexture(T.WHITE)
  t:SetPoint(side[1])
  t:SetPoint(side[2])
  if side[3] then t:SetWidth(side[3]) else t:SetHeight(side[4]) end
  return t
end

-- Four 2 px edges around a raid button, hidden until a debuff shows.
local function addBorder(b)
  b.dispel = CreateFrame("Frame", nil, b)
  b.dispel:SetAllPoints()
  b.dispel.edges = {}
  for i, side in ipairs(SIDES) do b.dispel.edges[i] = edge(b.dispel, side) end
  b.dispel:Hide()
end

-- An icon's texture, timer sweep and stack count.
local function addIconParts(f)
  f.icon = f:CreateTexture(nil, "ARTWORK")
  f.icon:SetAllPoints()
  f.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  f.cooldown = CreateFrame("Cooldown", nil, f, "CooldownFrameTemplate")
  f.cooldown:SetAllPoints()
  f.count = T.SetFont(f:CreateFontString(nil, "OVERLAY"), 9)
  f.count:SetPoint("BOTTOMRIGHT", 1, -1)
end

-- One HoT icon, placed right to left along the bottom edge; hidden until used.
local function hotIcon(b, i)
  local f = CreateFrame("Frame", nil, b)
  f:SetSize(ICON_SIZE, ICON_SIZE)
  f:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -2 - (i - 1) * (ICON_SIZE + 1), 2)
  addIconParts(f)
  f:Hide()
  return f
end


-- Adds the border and HoT icons to a raid button (RF setup hook).
local function setup(b)
  addBorder(b)
  b.hots = {}
  for i = 1, RA.settings.maxHots do b.hots[i] = hotIcon(b, i) end
end

-- Updating ------------------------------------------------------------------------------

-- Shows the border while the unit has a debuff you can dispel.
local function updateDispel(b, unit)
  local aura = RA.settings.dispel and RA.Aura(unit, 1, "HARMFUL|RAID")
  b.dispel:SetShown(aura ~= nil and aura ~= false)
  if not aura then return end
  local c = RA.DispelColor(aura)
  for _, t in ipairs(b.dispel.edges) do t:SetVertexColor(c[1], c[2], c[3]) end
end

-- The timer sweep: a duration object where the client offers one, plain
-- numbers otherwise, no sweep when the values are hidden.
local function sweep(cd, unit, aura)
  local getDuration = C_UnitAuras and C_UnitAuras.GetAuraDuration
  if type(getDuration) == "function" and cd.SetCooldownFromDurationObject and aura.auraInstanceID then
    local ok, duration = pcall(getDuration, unit, aura.auraInstanceID)
    if ok and duration then return pcall(cd.SetCooldownFromDurationObject, cd, duration) end
  end
  local exp, dur = ns.PlainNumber(aura.expirationTime), ns.PlainNumber(aura.duration)
  if exp and dur and dur > 0 then cd:SetCooldown(exp - dur, dur) else cd:Clear() end
end

-- Fills one HoT icon from an aura (or hides it).
local function showHot(f, unit, aura)
  f:SetShown(aura ~= nil)
  if not aura then return end
  f.icon:SetTexture(aura.icon)
  sweep(f.cooldown, unit, aura)
  local stacks = ns.PlainNumber(aura.applications)
  f.count:SetText(stacks and stacks > 1 and tostring(stacks) or "")
end

-- Your HoTs on the unit, up to maxHots icons.
local function updateHots(b, unit)
  local filter = hotFilter()
  for i, f in ipairs(b.hots) do
    showHot(f, unit, RA.settings.hots and RA.Aura(unit, i, filter) or nil)
  end
end

-- Refreshes both indicators (RF update hook).
local function update(b, unit)
  updateDispel(b, unit)
  updateHots(b, unit)
end

-- UNIT_AURA: refresh the raid buttons showing that unit.
local function onAura(_, unit)
  for _, b in ipairs(RF.buttons) do
    local own = b:GetAttribute("unit")
    if b:IsShown() and b.dispel and own == unit then update(b, unit) end
  end
end

-- Entering or leaving combat changes the HoT filter: refresh every shown button.
local function refreshAll()
  for _, b in ipairs(RF.buttons) do
    if b.dispel and b:IsShown() then update(b, b:GetAttribute("unit")) end
  end
end

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new).
function RA.Enable(settings)
  RA.settings = settings
  for _, b in ipairs(RF.buttons) do setup(b) end
  table.insert(RF.setupHooks, setup)
  table.insert(RF.updateHooks, update)
  ns.On("UNIT_AURA", onAura)
  ns.On("PLAYER_REGEN_DISABLED", refreshAll)
  ns.On("PLAYER_REGEN_ENABLED", refreshAll)
end
