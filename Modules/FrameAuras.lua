-- Buffs and debuffs on the target and focus frames: a row of debuffs
-- (yours only, by default) above the frame and a row of buffs above that.
-- The client's filters pick them ("HARMFUL|PLAYER", "HELPFUL"); icons,
-- timers and stacks come from Core/Auras.lua.

local ADDON, ns = ...

local UF = ns.GetModule("UnitFrames")

local FA = ns.Module("FrameAuras", {
  defaults = { onlyMine = true, debuffs = 8, buffs = 8, size = 22 },
})

-- Building ---------------------------------------------------------------------------

-- A row of icons above `anchor` (a frame or the row below), left to right.
local function row(parent, anchor, count, size)
  local icons = {}
  for i = 1, count do
    local f = ns.Auras.Icon(parent, size)
    f:SetPoint("BOTTOMLEFT", anchor, "TOPLEFT", (i - 1) * (size + 2), 3)
    icons[i] = f
  end
  return icons
end

-- The debuff row right above a unit frame and the buff row above that.
local function addRows(f, s)
  f.debuffs = row(f, f, s.debuffs, s.size)
  local above = f.debuffs[1] or f
  f.buffs = row(f, above, s.buffs, s.size)
end

-- Updating ---------------------------------------------------------------------------

-- Fills a row from a filter; unused icons hide.
local function fillRow(icons, unit, filter)
  for i, icon in ipairs(icons) do
    ns.Auras.Show(icon, unit, ns.Auras.Get(unit, i, filter))
  end
end

-- Refreshes both rows on a unit frame.
function FA.Update(f)
  if not f or not f.debuffs then return end
  fillRow(f.debuffs, f.unit, FA.settings.onlyMine and "HARMFUL|PLAYER" or "HARMFUL")
  fillRow(f.buffs, f.unit, "HELPFUL")
end

-- UNIT_AURA for target or focus.
local function onAura(_, unit)
  if unit == "target" or unit == "focus" then FA.Update(UF.frames[unit]) end
end

-- Both frames (after a /reload, the target may already be there).
local function refreshBoth()
  FA.Update(UF.frames.target)
  FA.Update(UF.frames.focus)
end

-- Adds the rows to the target and focus frames, then fills them.
local function build(settings)
  for _, key in ipairs({ "target", "focus" }) do
    if UF.frames[key] then addRows(UF.frames[key], settings) end
  end
  refreshBoth()
end

-- Module entry point (Core/Modules.lua): after the unit frames are built.
function FA.Enable(settings)
  FA.settings = settings
  ns.OutOfCombat(function() build(settings) end)
  ns.On("UNIT_AURA", onAura)
  ns.On("PLAYER_TARGET_CHANGED", function() FA.Update(UF.frames.target) end)
  ns.On("PLAYER_FOCUS_CHANGED", function() FA.Update(UF.frames.focus) end)
  ns.On("PLAYER_ENTERING_WORLD", refreshBoth)
end
