-- Boss mod docks: two movable spots in the layout for boss mods' timer bars,
-- "Boss timers" (their normal bars) and "Boss timers, soon" (the big bars a
-- timer moves to as it runs out). They are empty frames: only their handles
-- show, in unlock mode. /vg dock (or the button under Windows and tools) lines
-- Deadly Boss Mods' bars up with them through DBM's own settings call
-- (DBT:SetOption, then DBT:Rearrange); BigWigs has no such call, so for it
-- the command says where the spots are, to drag its anchors there. Nothing is
-- ever moved on its own.

local ADDON, ns = ...

local BD = ns.Module("BossDocks", { defaults = {} })

-- The spots: mover key and label, default point, size, DBM's option prefix and BigWigs' bar kind.
BD.SPOTS = {
  { key = "bossbars", label = "Boss timers", default = { "BOTTOM", "BOTTOM", 360, 300 }, w = 200, h = 120, dbm = "Timer", bigwigs = "normal" },
  { key = "bossbarssoon", label = "Boss timers, soon", default = { "TOP", "TOP", 0, -260 }, w = 240, h = 80, dbm = "HugeTimer", bigwigs = "emphasized" },
}

-- Whether Deadly Boss Mods' bars (DBM-StatusBarTimers' DBT) are loaded.
function BD.HasDBM()
  local dbt = _G.DBT
  return type(dbt) == "table" and type(dbt.SetOption) == "function"
end

-- Whether BigWigs is loaded.
function BD.HasBigWigs()
  return type(_G.BigWigs) == "table"
end

-- A spot's center as whole x, y from the middle of the screen, in UIParent's units.
function BD.Offset(f)
  local cx, cy = f:GetCenter()
  local ux, uy = UIParent:GetCenter()
  if not (cx and ux) then return nil end
  local s = f:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return math.floor(cx * s - ux + 0.5), math.floor(cy * s - uy + 0.5)
end

-- Moves DBM's bars of one kind ("Timer" or "HugeTimer") onto a spot with DBM's own settings call.
local function dockDBM(prefix, f)
  local x, y = BD.Offset(f)
  if not x then return end
  _G.DBT:SetOption(prefix .. "Point", "CENTER")
  _G.DBT:SetOption(prefix .. "X", x)
  _G.DBT:SetOption(prefix .. "Y", y)
end

-- Lines up both kinds of DBM bar, then has DBM place them again.
local function dockAllDBM()
  for _, s in ipairs(BD.SPOTS) do dockDBM(s.dbm, BD.frames[s.key]) end
  if type(_G.DBT.Rearrange) == "function" then _G.DBT:Rearrange() end
  ns.Chat("Lined up Deadly Boss Mods' bars with the Boss timers spots.")
end

-- Says where the spots are, for dragging BigWigs' anchors there.
local function sayWhere()
  for _, s in ipairs(BD.SPOTS) do
    local x, y = BD.Offset(BD.frames[s.key])
    ns.Chat(string.format("BigWigs: drag its %s bars' anchor to %s (%s, %s from the middle of the screen).", s.bigwigs, s.label, tostring(x), tostring(y)))
  end
end

-- /vg dock: Deadly Boss Mods' bars onto the spots; where they are, for BigWigs.
function BD.Command()
  if not BD.frames then return ns.Chat("Vanguard's boss docks are off (/vg > Modules).") end
  if ns.InCombat() then return ns.Chat("After the fight: boss bars aren't moved in combat.") end
  local dbm, bigwigs = BD.HasDBM(), BD.HasBigWigs()
  if not dbm and not bigwigs then return ns.Chat("Neither Deadly Boss Mods nor BigWigs is loaded.") end
  if dbm then dockAllDBM() end
  if bigwigs then sayWhere() end
end

-- Module entry point (Core/Modules.lua): the spots, each an empty frame with a mover.
function BD.Enable()
  BD.frames = {}
  for _, s in ipairs(BD.SPOTS) do
    local f = CreateFrame("Frame", "Vanguard_" .. s.key, UIParent)
    f:SetSize(s.w, s.h)
    ns.Mover(f, s.key, s.label, s.default)
    BD.frames[s.key] = f
  end
end
