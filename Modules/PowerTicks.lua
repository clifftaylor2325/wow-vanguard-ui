-- A spark on your power bar, the vanilla way:
--   * mana: after a spell that costs mana, the spark crosses the bar over five
--     seconds (the five-second rule: spirit regen waits until it has passed);
--   * energy: the spark crosses the bar every two seconds, in step with the
--     server's energy ticks, so you can time your next ability to one.
-- The mana spark is timed from your casts (the spell's cost, from the client),
-- never from your mana. An energy tick is seen as your energy going up; a
-- hidden value is no information, so the spark waits for a plain one.
-- A druid's form switches between the two.

local ADDON, ns = ...

local T = ns.Theme
local UF = ns.GetModule("UnitFrames")

local PT = ns.Module("PowerTicks", { defaults = { mana = true, energy = true } })

-- Power types (Enum.PowerType), and each one's sweep: seconds, and whether it repeats.
PT.MANA, PT.ENERGY = 0, 3
PT.SWEEPS = { mana = { 5, false }, energy = { 2, true } }

-- Timing --------------------------------------------------------------------------------------

-- Where the spark is along the bar (0 to 1) at a time, or nil when it's hidden.
function PT.Fraction(now)
  if not PT.from then return nil end
  local gone, length = now - PT.from, PT.SWEEPS[PT.mode][1]
  if PT.SWEEPS[PT.mode][2] then return (gone % length) / length end
  if gone < length then return gone / length end
end

-- Moves the spark along the bar (one anchor, moved in place each frame); it
-- hides, and the timer stops, once a sweep is over.
function PT.Tick()
  local at = PT.Fraction(GetTime())
  PT.spark:SetShown(at ~= nil)
  if not at then PT.driver:SetScript("OnUpdate", nil) return end
  PT.spark:SetPoint("TOP", PT.bar, "TOPLEFT", at * PT.bar:GetWidth(), 0)
end

-- Starts a sweep from now; the spark is as tall as the bar.
function PT.Start()
  PT.from = GetTime()
  PT.spark:SetHeight(PT.bar:GetHeight())
  PT.driver:SetScript("OnUpdate", PT.Tick)
  PT.Tick()
end

-- Mana ----------------------------------------------------------------------------------------

-- True when a spell costs you mana (false when the client can't say).
function PT.CostsMana(spellID)
  local get = C_Spell and C_Spell.GetSpellPowerCost
  if type(get) ~= "function" or ns.IsSecret(spellID) then return false end
  for _, c in ipairs(get(spellID) or {}) do
    if ns.PlainNumber(c.type) == PT.MANA and (ns.PlainNumber(c.cost) or 0) > 0 then return true end
  end
  return false
end

-- One of your spells went off: a mana spell starts the five seconds again.
function PT.OnCast(_, unit, _, spellID)
  if unit == "player" and PT.mode == "mana" and PT.CostsMana(spellID) then PT.Start() end
end

-- Energy --------------------------------------------------------------------------------------

-- Your power changed: energy going up is a server tick, and the sweep restarts from it.
function PT.OnPower(_, unit)
  if unit ~= "player" or PT.mode ~= "energy" then return end
  local now = ns.PlainNumber(UnitPower("player", PT.ENERGY))
  if now and PT.last and now > PT.last then PT.Start() end
  PT.last = now
end

-- Mode ----------------------------------------------------------------------------------------

-- "mana", "energy" or nil: the spark your current power shows, as switched on.
function PT.Mode()
  local kind = ns.PlainNumber(UnitPowerType("player"))
  if kind == PT.MANA and PT.settings.mana then return "mana" end
  if kind == PT.ENERGY and PT.settings.energy then return "energy" end
end

-- Your power type may have changed (a druid's form): a new kind starts with no spark.
function PT.UpdateMode()
  local mode = PT.Mode()
  if mode == PT.mode then return end
  PT.mode, PT.from, PT.last = mode, nil, nil
  PT.spark:Hide()
  PT.driver:SetScript("OnUpdate", nil)
end

-- Building ------------------------------------------------------------------------------------

-- The spark on the player frame's power bar, and the timer that moves it.
local function build(bar)
  PT.bar, PT.driver = bar, CreateFrame("Frame")
  PT.spark = T.Tint(T.Spark(bar, 6), "spark")
  PT.spark:Hide()
  PT.UpdateMode()
end

-- Builds the spark on the player frame (none, no spark) and follows your casts, power and forms.
local function attach()
  local player = UF.frames.player
  if not player then return end
  build(player.power)
  ns.OnUnit("UNIT_SPELLCAST_SUCCEEDED", PT.OnCast, "player")
  ns.OnUnit("UNIT_POWER_FREQUENT", PT.OnPower, "player")
  ns.OnUnit("UNIT_DISPLAYPOWER", PT.UpdateMode, "player")
  ns.On("UPDATE_SHAPESHIFT_FORM", PT.UpdateMode)
end

-- Module entry point (Core/Modules.lua): out of combat, once the unit frames are built.
function PT.Enable(settings)
  PT.settings = settings
  ns.OutOfCombat(attach)
end
