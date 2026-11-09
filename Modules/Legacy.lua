-- Legacy: help with Forever's Legacy system (the account-wide perk tree of 16 points, and its
-- challenges). Two parts, because the game's own data is not known yet:
--   * /vg legacy probe lists what the client has for the system (its window and pages, the
--     globals with Legacy in their name, the perk tree panel's ids and node count, the
--     challenge panes), read only, out of combat and without opening or loading anything. It
--     is the first step the research asked for; a tracker of the challenges waits on it. The
--     probe itself lives with the others in Modules/Probe.lua.
--   * a perk planner (off until switched on): /vg legacy plan add <points> <name> keeps a list
--     of perks you mean to take, never over 16 points in all, for the whole account; remove
--     <name> drops one, clear forgets the list, and bare /vg legacy plan lists it.
-- The list is typed by hand: no perk names are built in, and the game's tree is not changed.

local ADDON, ns = ...

local L = ns.L

local LG = ns.Module("Legacy", { clients = { forever = true }, defaults = { planner = false } })

-- WoW Forever only: on another client the module isn't registered and the rest of this file doesn't load.
if not ns.ClientAllows(LG) then return end

-- Points in the perk tree.
LG.BUDGET = 16

-- The plan ------------------------------------------------------------------------------------

-- The account's plan: a list of { name, points }.
function LG.Plan()
  VanguardDB.legacyPlan = type(VanguardDB.legacyPlan) == "table" and VanguardDB.legacyPlan or {}
  return VanguardDB.legacyPlan
end

-- Points planned in all.
function LG.Spent()
  local total = 0
  for _, perk in ipairs(LG.Plan()) do total = total + perk.points end
  return total
end

-- The index of the perk with that name (any case), or nil.
local function find(name)
  for i, perk in ipairs(LG.Plan()) do
    if perk.name:lower() == name:lower() then return i end
  end
end

-- Plans points for a perk (a new perk, or a new count for one already listed). Returns
-- true, or false and why: the points must be whole and 1 or more, and all of them fit the budget.
function LG.Add(name, points)
  if name == "" or not points or points < 1 or points ~= math.floor(points) then return false, L["Give a whole number of points (1 or more) and a perk name."] end
  local at = find(name)
  local others = LG.Spent() - (at and LG.Plan()[at].points or 0)
  if others + points > LG.BUDGET then return false, ns.Format(L["That makes {points} points; the tree has {budget}."], { points = others + points, budget = LG.BUDGET }) end
  if at then LG.Plan()[at].points = points else table.insert(LG.Plan(), { name = name, points = points }) end
  return true
end

-- Drops the perk with that name; true when there was one.
function LG.Remove(name)
  local at = find(name)
  if at then table.remove(LG.Plan(), at) end
  return at ~= nil
end

-- The plan as chat lines: each perk, then the points spent of the budget.
function LG.Lines()
  local out = {}
  for _, perk in ipairs(LG.Plan()) do out[#out + 1] = string.format("%d  %s", perk.points, perk.name) end
  out[#out + 1] = ns.Format(L["{spent} of {budget} points planned."], { spent = LG.Spent(), budget = LG.BUDGET })
  return out
end

-- /vg legacy plan [add <points> <name>|remove <name>|clear].
function LG.PlanCommand(rest)
  local word, tail = rest:match("^(%S*)%s*(.-)$")
  if word == "add" then return LG.AddCommand(tail) end
  if word == "remove" then return ns.Chat(LG.Remove(tail) and L["Perk dropped."] or L["No such perk in the plan."]) end
  if word == "clear" then VanguardDB.legacyPlan = {} return ns.Chat(L["Legacy plan cleared."]) end
  for _, line in ipairs(LG.Lines()) do ns.Chat(line) end
end

-- /vg legacy plan add <points> <name>: says that it was kept, or why it was refused.
function LG.AddCommand(tail)
  local points, name = tail:match("^(%d+)%s+(.+)$")
  local ok, why = LG.Add(name or "", tonumber(points))
  ns.Chat(ok and L["Planned."] or why)
end

-- Command ---------------------------------------------------------------------------------

-- /vg legacy [probe|plan ...].
function LG.Command(rest)
  local word, tail = (rest or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if word == "probe" then return ns.Probe.Legacy() end
  if word ~= "plan" then return ns.Chat(ns.Literal(L["Legacy: /vg legacy probe lists what the client has for the Legacy system; /vg legacy plan [add <points> <name>|remove <name>|clear] plans the perk tree's 16 points."])) end
  if not ns.Settings("Legacy", LG.defaults).planner then return ns.Chat(L["The Legacy perk planner is off: switch it on under Town and gear."]) end
  LG.PlanCommand(tail)
end

-- Module entry point (Core/Modules.lua).
function LG.Enable(settings)
  LG.settings = settings
end
