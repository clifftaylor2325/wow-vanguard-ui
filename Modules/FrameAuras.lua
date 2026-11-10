-- Buffs and debuffs on the target and focus frames, on aura containers
-- (Core/Auras.lua), so they sit where players expect and never float:
--   * debuffs under the frame: a crowd-control slot first, then yours, then
--     (unless "Only your debuffs") everyone else's, smaller and dimmed;
--   * the target's buffs above the frame: all of them, only the important ones
--     (defensives and major cooldowns), or only yours;
--   * each row wraps at the frame's width.
-- The client picks the auras: each group reads one of its filters ("HARMFUL|PLAYER",
-- "HELPFUL" ...), and which filter a group reads is all the say an addon has. Timer
-- numbers are off by default (the sweep shows time left); they can be turned on.
-- A container's groups are fixed once it is made, so a changed setting (a count, the
-- icon size, a filter, the timers) makes that row again, out of combat, and puts the
-- old one away.

local ADDON, ns = ...

local L = ns.L

local UF = ns.GetModule("UnitFrames")

local FA = ns.Module("FrameAuras", {
  defaults = { onlyMine = true, debuffs = 8, buffs = 8, size = 20, timers = false, buffFilter = "all" },
})

-- The skinning group the target and focus auras are in, when the library is loaded (Core/Masque.lua).
FA.MASQUE = "Target and focus auras"
-- The frames that get rows.
FA.FRAMES = { "target", "focus" }
-- The sliders' ranges (the Unit frames page). A saved number is kept inside its range, since a
-- crafted or hand-edited profile can hold any.
FA.RANGES = { size = { min = 16, max = 40, step = 1 }, debuffs = { min = 0, max = 16, step = 1 }, buffs = { min = 0, max = 16, step = 1 } }
-- Which of the target's buffs show, by the Target's buffs choice: the client filters read, one group
-- each, in order (a later group leaves out what an earlier one shows). The words are the ones the
-- nameplates' buff row already reads.
FA.BUFF_FILTERS = {
  all = { "HELPFUL" },
  important = { "HELPFUL|BIG_DEFENSIVE", "HELPFUL|EXTERNAL_DEFENSIVE|!BIG_DEFENSIVE", "HELPFUL|IMPORTANT|!BIG_DEFENSIVE|!EXTERNAL_DEFENSIVE" },
  mine = { "HELPFUL|PLAYER" },
}
-- That choice's row on the Unit frames page.
FA.BUFF_CHOICES = { { "all", L["All"] }, { "important", L["Important"] }, { "mine", L["Yours"] } }
-- How long (seconds) a changed setting holds still before the rows are made again.
FA.SETTLE = 0.3

-- Specs ----------------------------------------------------------------------------------

-- What the rows are built from: the settings, each number kept to its slider's range and a buff
-- choice this version doesn't know read as all.
function FA.Look(s)
  local look = { onlyMine = s.onlyMine, timers = s.timers, buffFilter = FA.BUFF_FILTERS[s.buffFilter] and s.buffFilter or "all" }
  for key, range in pairs(FA.RANGES) do look[key] = math.max(range.min, math.min(range.max, s[key])) end
  return look
end

-- The debuff groups: crowd control (none with no debuffs), yours, then others' (none with onlyMine). Each also reads
-- the debuffs the game flags for nameplates only, as its own target frame's debuff filter does (AuraUtil IncludeNameplateOnly).
local function debuffGroups(look, size)
  return {
    { filter = "HARMFUL|CROWD_CONTROL|INCLUDE_NAME_PLATE_ONLY", max = look.debuffs > 0 and 1 or 0, size = size + 2, debuff = true },
    { filter = "HARMFUL|PLAYER|!CROWD_CONTROL|INCLUDE_NAME_PLATE_ONLY", max = look.debuffs, size = size, debuff = true, sort = "ExpirationOnly" },
    { filter = "HARMFUL|!PLAYER|!CROWD_CONTROL|INCLUDE_NAME_PLATE_ONLY", max = look.onlyMine and 0 or look.debuffs, size = size - 4, debuff = true,
      dim = true },
  }
end

-- The width an aura row wraps at: a banner's line (a big one stands too narrow for a row, under the Standards HUD
-- layout: Modules/UnitFrameLayouts.lua), else the frame's own width.
FA.BANNER_LINE = 160

-- The width a frame's aura rows wrap at (when built: a layout change takes a reload to widen them).
local function lineWidth(f)
  if UF.Standing(f) and UF.Layouts.Big(f) then return FA.BANNER_LINE end
  return f:GetWidth()
end

-- The debuff row under a frame, wrapping at its width.
function FA.DebuffSpec(f, look, size)
  return { point = { "TOPLEFT", f, "BOTTOMLEFT", 0, -3 }, grow = "RIGHT", growY = "DOWN", lineSize = lineWidth(f),
    gap = 2, timer = look.timers, masque = FA.MASQUE, groups = debuffGroups(look, size) }
end

-- The buff groups the Target's buffs choice asks for, each up to the buff count.
local function buffGroups(look)
  local groups = {}
  for i, filter in ipairs(FA.BUFF_FILTERS[look.buffFilter]) do groups[i] = { filter = filter, max = look.buffs, size = look.size - 2 } end
  return groups
end

-- The buff row above a frame (over its tab, where the look gives it one: UF.Crown), wrapping at its width.
function FA.BuffSpec(f, look)
  return { point = { "BOTTOMLEFT", UF.Crown(f), "TOPLEFT", 0, 3 }, grow = "RIGHT", growY = "UP", lineSize = lineWidth(f),
    gap = 2, timer = look.timers, masque = FA.MASQUE, groups = buffGroups(look) }
end

-- Building ---------------------------------------------------------------------------

-- Gives a frame the row `spec` describes under `name` (no row for no spec). A row that already reads
-- the same (its signature, Core/Auras.lua) is kept; one that differs is put away for a new one.
local function setRow(f, name, spec)
  local old, sig = f[name], spec and ns.Auras.Signature(spec) or nil
  if (old and old.sig) == sig then return end
  if old and not ns.Auras.Retire(old) then return end
  f[name] = spec and ns.Auras.Container(f, spec, f.unit) or nil
  if f[name] then f[name].sig = sig end
end

-- The containers on one frame: debuffs below; buffs above on the target only, unless their count is 0.
local function addContainers(f, look, key)
  local size = key == "focus" and look.size - 2 or look.size
  setRow(f, "debuffs", FA.DebuffSpec(f, look, size))
  setRow(f, "buffs", key == "target" and look.buffs > 0 and FA.BuffSpec(f, look) or nil)
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

-- What a client adds to the target and focus frames besides the rows, each fn(frame, key, settings) (Modules/RetailAuras.lua
-- on Retail: the target's private aura spot; none on WoW Forever).
FA.CLIENT_PARTS = {}

-- The rows on the target and focus frames as the settings ask now: a row that needs no change stays.
local function buildRows()
  local look = FA.Look(FA.settings)
  for _, key in ipairs(FA.FRAMES) do
    if UF.frames[key] then addContainers(UF.frames[key], look, key) end
  end
end

-- Adds the containers, and the client's own parts, to the target and focus frames.
local function build(settings)
  buildRows()
  for _, key in ipairs(FA.FRAMES) do
    local f = UF.frames[key]
    for _, part in ipairs(f and FA.CLIENT_PARTS or {}) do ns.Try("frame aura part", part, f, key, settings) end
  end
end

-- The rows made again after a setting changed, showing whoever the frames show now.
local function rebuild()
  buildRows()
  refreshBoth()
end

-- A setting changed (the Unit frames page calls this): the rows follow once it has held still for
-- FA.SETTLE seconds (a dragged slider asks many times a second, and each new row is new frames), and
-- out of combat: a container can't be made in a fight, and the frames they sit on are protected.
function FA.Apply()
  ns.AfterStill("frame auras settle", FA.SETTLE, function() ns.OutOfCombat(rebuild, "frame auras") end)
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

-- Options ------------------------------------------------------------------------------------

-- get/set for one of this module's settings, applied at once (FA.Apply), and its default.
local function setting(key)
  return ns.Options.LiveMethod("FrameAuras", key, "Apply")
end

-- The Target and focus auras card on the Unit frames page (Core/OptionsFrames.lua puts it there):
-- which auras show, how many, how large, and the timers. Every row applies without a reload.
function FA.OptionRows()
  return {
    { "check", L["Only your debuffs"], setting("onlyMine") },
    { "cycle", L["Target's buffs"], FA.BUFF_CHOICES, setting("buffFilter") },
    { "slider", L["Debuffs shown"], FA.RANGES.debuffs, setting("debuffs") },
    { "slider", L["Target's buffs shown"], FA.RANGES.buffs, setting("buffs") },
    { "slider", L["Aura icon size"], FA.RANGES.size, setting("size") },
    { "check", L["Timer numbers on the icons"], setting("timers") },
  }
end
