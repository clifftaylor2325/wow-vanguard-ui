-- Buffs and debuffs on the target and focus frames, on aura containers
-- (Core/Auras.lua), so they sit where players expect and never float:
--   * debuffs under the frame: a crowd-control slot first, then yours, then
--     (unless "Only your debuffs") everyone else's, smaller and dimmed;
--   * the target's buffs above the frame;
--   * each row wraps at the frame's width.
-- The client's filters pick them ("HARMFUL|PLAYER", "HELPFUL" ...). Timer
-- numbers are off by default (the sweep shows time left); they can be turned on.
-- The groups are fixed once built, so these settings apply after a reload.

local ADDON, ns = ...

local UF = ns.GetModule("UnitFrames")

local FA = ns.Module("FrameAuras", {
  defaults = { onlyMine = true, debuffs = 8, buffs = 8, size = 20, timers = false },
})

-- The Masque group the target and focus auras are in, when Masque is loaded (Core/Masque.lua).
FA.MASQUE = "Target and focus auras"

-- Specs ----------------------------------------------------------------------------------

-- The debuff groups: crowd control, yours, then others' (none with onlyMine).
local function debuffGroups(s, size)
  return {
    { filter = "HARMFUL|CROWD_CONTROL", max = 1, size = size + 2, debuff = true },
    { filter = "HARMFUL|PLAYER|!CROWD_CONTROL", max = s.debuffs, size = size, debuff = true, sort = "ExpirationOnly" },
    { filter = "HARMFUL|!PLAYER|!CROWD_CONTROL", max = s.onlyMine and 0 or s.debuffs, size = size - 4, debuff = true, dim = true },
  }
end

-- The debuff row under a frame, wrapping at its width.
function FA.DebuffSpec(f, s, size)
  return { point = { "TOPLEFT", f, "BOTTOMLEFT", 0, -3 }, grow = "RIGHT", growY = "DOWN", lineSize = f:GetWidth(),
    gap = 2, timer = s.timers, masque = FA.MASQUE, groups = debuffGroups(s, size) }
end

-- The buff row above a frame, wrapping at its width.
function FA.BuffSpec(f, s)
  return { point = { "BOTTOMLEFT", f, "TOPLEFT", 0, 3 }, grow = "RIGHT", growY = "UP", lineSize = f:GetWidth(),
    gap = 2, timer = s.timers, masque = FA.MASQUE, groups = { { filter = "HELPFUL", max = s.buffs, size = s.size - 2 } } }
end

-- Building ---------------------------------------------------------------------------

-- The containers on one frame: debuffs below; buffs above on the target only.
local function addContainers(f, s, key)
  local size = key == "focus" and s.size - 2 or s.size
  f.debuffs = ns.Auras.Container(f, FA.DebuffSpec(f, s, size), f.unit)
  f.buffs = key == "target" and ns.Auras.Container(f, FA.BuffSpec(f, s), f.unit) or nil
end

-- Updating ---------------------------------------------------------------------------

-- Reads a frame's auras again (its unit token now means someone else).
function FA.Update(f)
  if not f or not f.debuffs then return end
  f.debuffs:Refresh()
  if f.buffs then f.buffs:Refresh() end
end

-- Both frames (after a /reload, the target may already be there).
local function refreshBoth()
  FA.Update(UF.frames.target)
  FA.Update(UF.frames.focus)
end

-- Adds the containers to the target and focus frames.
local function build(settings)
  for _, key in ipairs({ "target", "focus" }) do
    if UF.frames[key] then addContainers(UF.frames[key], settings, key) end
  end
end

-- Module entry point (Core/Modules.lua): after the unit frames are built.
-- The containers follow UNIT_AURA themselves; a new target or focus refreshes them.
function FA.Enable(settings)
  FA.settings = settings
  ns.OutOfCombat(function() build(settings) end)
  ns.On("PLAYER_TARGET_CHANGED", function() FA.Update(UF.frames.target) end)
  ns.On("PLAYER_FOCUS_CHANGED", function() FA.Update(UF.frames.focus) end)
  ns.On("PLAYER_ENTERING_WORLD", refreshBoth)
end
