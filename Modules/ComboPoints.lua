-- Combo points for rogues and druids: five pips above the player frame (more on
-- retail, where a talent can raise your maximum), lit in the energy color, shown
-- only while you have points on your target. On WoW Forever (vanilla rules) the
-- points live on your target, so the older target call is asked first, then your
-- combo-point power. Other classes build nothing.

local ADDON, ns = ...

local T = ns.Theme
local UF = ns.GetModule("UnitFrames")

local CP = ns.Module("ComboPoints", { defaults = { size = 14 } })

-- The usual number of pips (all of WoW Forever's), and the most the row grows to on retail.
CP.MAX = 5
CP.CAP = 7
local CLASSES = { ROGUE = true, DRUID = true }

-- Your combo points on your target (0 when none, hidden, or the client can't say).
function CP.Count()
  local n = type(GetComboPoints) == "function" and GetComboPoints("player", "target")
  if ns.IsSecret(n) then return 0 end
  local power = Enum and Enum.PowerType and Enum.PowerType.ComboPoints
  if type(n) ~= "number" and power and type(UnitPower) == "function" then n = UnitPower("player", power) end
  return ns.PlainNumber(n) or 0
end

-- One pip: a small inset panel, and its fill in the energy color.
local function pip(bar, i, size)
  local p = T.HudPanel(CreateFrame("Frame", nil, bar), { inset = true })
  p:SetSize(size, math.floor(size / 2))
  p:SetPoint("LEFT", bar, "LEFT", (i - 1) * (size + 3), 0)
  local px = T.Pixel(p)
  p.fill = T.Tint(T.Snap(p:CreateTexture(nil, "ARTWORK")), "energy")
  p.fill:SetTexture(T.WHITE)
  p.fill:SetPoint("TOPLEFT", px, -px); p.fill:SetPoint("BOTTOMRIGHT", -px, px)
  return p
end

-- How many pips to draw: your combo-point maximum on retail, where a talent can raise it past five (never
-- below five, nor above CP.CAP); always five on WoW Forever.
function CP.Max()
  local power = Enum and Enum.PowerType and Enum.PowerType.ComboPoints
  if ns.IsForever() or not power or type(UnitPowerMax) ~= "function" then return CP.MAX end
  return math.min(CP.CAP, math.max(CP.MAX, ns.PlainNumber(UnitPowerMax("player", power)) or CP.MAX))
end

-- Sizes the row to `max` pips: builds the ones it has not made yet and shows only that many.
local function fit(max)
  for i = #CP.pips + 1, max do CP.pips[i] = pip(CP.bar, i, CP.size) end
  for i, p in ipairs(CP.pips) do p:SetShown(i <= max) end
  CP.bar:SetWidth(max * (CP.size + 3))
end

-- The row of pips just above the player frame, hidden until you have points.
local function build(settings)
  local player = UF.frames.player
  if not player then return end
  CP.size, CP.pips = settings.size, {}
  CP.bar = CreateFrame("Frame", nil, player)
  CP.bar:SetSize(CP.MAX * (CP.size + 3), CP.size)
  CP.bar:SetPoint("BOTTOMLEFT", player, "TOPLEFT", 0, 2)
  CP.Update()
end

-- Lights one pip per point (the row grows or shrinks to your maximum); the row shows only while there are any.
function CP.Update()
  if not CP.bar then return end
  local count = CP.Count()
  fit(CP.Max())
  for i, p in ipairs(CP.pips) do p.fill:SetShown(i <= count) end
  CP.bar:SetShown(count > 0)
end

-- Module entry point (Core/Modules.lua): rogues and druids only, after the unit
-- frames. Your points change with your own power events and when they move to a new target at the
-- same count (no power event then); another unit's don't count.
function CP.Enable(settings)
  local _, class = UnitClass("player")
  if ns.IsSecret(class) or not CLASSES[class] then return end
  ns.OutOfCombat(function() build(settings) end)
  ns.OnUnit({ "UNIT_POWER_UPDATE", "UNIT_POWER_FREQUENT", "UNIT_MAXPOWER" }, CP.Update, "player")
  ns.On("PLAYER_TARGET_CHANGED", CP.Update)
  ns.On("COMBO_TARGET_CHANGED", CP.Update)
end
