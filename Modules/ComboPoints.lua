-- Combo points for rogues and druids: five pips above the player frame, lit
-- in the energy color, shown only while you have points on your target. On
-- WoW Forever (vanilla rules) the points live on your target, so the older
-- target call is asked first, then your combo-point power. Other classes
-- build nothing.

local ADDON, ns = ...

local T = ns.Theme
local UF = ns.GetModule("UnitFrames")

local CP = ns.Module("ComboPoints", { defaults = { size = 14 } })

CP.MAX = 5
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

-- The row of pips just above the player frame, hidden until you have points.
local function build(settings)
  local player = UF.frames.player
  if not player then return end
  CP.bar = CreateFrame("Frame", nil, player)
  CP.bar:SetSize(CP.MAX * (settings.size + 3), settings.size)
  CP.bar:SetPoint("BOTTOMLEFT", player, "TOPLEFT", 0, 2)
  CP.pips = {}
  for i = 1, CP.MAX do CP.pips[i] = pip(CP.bar, i, settings.size) end
  CP.Update()
end

-- Lights one pip per point; the row shows only while there are any.
function CP.Update()
  if not CP.bar then return end
  local count = CP.Count()
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
