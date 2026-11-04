-- TEST-ONLY Retail stubs, classes area: the calls behind Retail's class resources, charged combo
-- points and empowered casts (Modules/RetailClassBars.lua, ComboPoints.lua, CastBars.lua), checked
-- against Blizzard's live docs (UnitDocumentation.lua) and the game's own frames that call them
-- (RuneFrame.lua, EssenceFramePlayer.lua, CastingBarFrame.lua). Both clients' docs list most of
-- these; only Retail's classes use them, so only the Retail world answers them.
--
-- A unit's fields here (world.setUnit): rawPowers[kind] (UnitPower's unmodified answer; else the
-- power times its display mod), partial[kind] (UnitPartialPower), stagger (UnitStagger), charged
-- (GetUnitChargedPowerPoints' list) and, on unit.cast, stages, stageMs (one length per stage, ms)
-- and holdMs (the hold at the last stage). World fields: world.runes[i] = { start, duration, ready }
-- (every rune ready when unset) and world.powerRegen[kind] (GetPowerRegenForPowerType).

local world = __wfgWorld

-- Essence, which Retail's Evokers have (Enum.PowerType in Blizzard's UnitConstantsDocumentation).
Enum.PowerType.Essence = 19

-- How many of a power's unmodified units make one point (soul shards: tenths), as the client says.
function UnitPowerDisplayMod(kind)
  return kind == Enum.PowerType.SoulShards and 10 or 1
end

local basePower = UnitPower
-- UnitPower with Retail's third argument: the unmodified power (a unit's rawPowers, else its power
-- times the display mod; a hidden power stays hidden).
function UnitPower(unit, kind, unmodified)
  local power = basePower(unit, kind)
  if not unmodified then return power end
  local u = world.unit(unit)
  local raw = u and u.rawPowers and u.rawPowers[kind]
  if raw ~= nil then return raw end
  if issecretvalue(power) then return power end
  return power * UnitPowerDisplayMod(kind)
end

-- The share of the next point recharged so far, in thousandths (unit.partial[kind]; 0 when unset).
function UnitPartialPower(unit, kind)
  local u = world.unit(unit)
  return u and u.partial and u.partial[kind] or 0
end

-- A power's regeneration in points a second (world.powerRegen; nil when unset).
function GetPowerRegenForPowerType(kind)
  return world.powerRegen and world.powerRegen[kind]
end

-- A Brewmaster's stagger (unit.stagger; 0 when unset).
function UnitStagger(unit)
  local u = world.unit(unit)
  return u and u.stagger or 0
end

-- A rune's cooldown: start, duration, ready (world.runes[i]; ready when unset).
function GetRuneCooldown(i)
  local r = world.runes and world.runes[i]
  if not r then return 0, 0, true end
  return r.start, r.duration, r.ready == true
end

-- The pip numbers of a unit's charged combo points (unit.charged; nothing when unset).
function GetUnitChargedPowerPoints(unit)
  local u = world.unit(unit)
  return u and u.charged
end

local baseChannel = UnitChannelInfo
-- Retail's channel: the world's eight values, then whether it is empowered and its stages (never hidden).
function UnitChannelInfo(unit)
  local u = world.unit(unit)
  local c = u and u.cast
  if not c or not c.channel then return nil end
  local name, text, icon, startMs, endMs, trade, notInterruptible, spellId = baseChannel(unit)
  return name, text, icon, startMs, endMs, trade, notInterruptible, spellId, (c.stages or 0) > 0, c.stages or 0
end

-- How long stage `index` (from 0) of a unit's empowered cast lasts, in ms (unit.cast.stageMs).
function GetUnitEmpowerStageDuration(unit, index)
  local c = world.unit(unit).cast
  return c.stageMs[index + 1]
end

-- How long a unit's empowered cast holds at its last stage, in ms (unit.cast.holdMs; 0 when unset).
function GetUnitEmpowerHoldAtMaxTime(unit)
  local c = world.unit(unit).cast
  return c.holdMs or 0
end
