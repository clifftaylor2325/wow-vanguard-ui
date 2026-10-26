-- Legacy: help with Forever's Legacy system (the account-wide perk tree of 16 points, and its
-- challenges). Two parts, because the game's own data is not known yet:
--   * /vg legacy probe lists what the client has for the system (its window and pages, the
--     globals with Legacy in their name, the perk tree panel's ids and node count, the
--     challenge panes), read only, out of combat and without opening or loading anything. It
--     is the first step the research asked for; a tracker of the challenges waits on it.
--   * a perk planner (off until switched on): /vg legacy plan add <points> <name> keeps a list
--     of perks you mean to take, never over 16 points in all, for the whole account; remove
--     <name> drops one, clear forgets the list, and bare /vg legacy plan lists it.
-- The list is typed by hand: no perk names are built in, and the game's tree is not changed.

local ADDON, ns = ...

local L = ns.L

local LG = ns.Module("Legacy", { defaults = { planner = false } })

-- Points in the perk tree, the most globals the probe lists, and the most keys it shows of a frame.
LG.BUDGET, LG.MAX_GLOBALS, LG.MAX_KEYS = 16, 20, 12
-- The window's pages the probe looks into, by key, and the perk panel's key on the tree page.
LG.PAGES = { "TreePage", "ChallengesPage", "RewardTrackPage" }
LG.PANEL = "LegacyTreeTraitPanel"

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

-- Probing -------------------------------------------------------------------------------------

-- A value as a short word: its type, or the number or text itself.
local function shown(value)
  if ns.IsSecret(value) then return "hidden" end
  if type(value) == "number" or type(value) == "string" or type(value) == "boolean" then return tostring(value) end
  return type(value)
end

-- A table's string keys, sorted, the first LG.MAX_KEYS of them, as one text.
local function keysOf(t)
  local keys = {}
  for key in pairs(t) do if type(key) == "string" then keys[#keys + 1] = key end end
  table.sort(keys)
  return #keys .. " keys" .. (#keys > 0 and ": " .. table.concat(keys, ", ", 1, math.min(#keys, LG.MAX_KEYS)) or "")
end

-- Globals with Legacy in their name, sorted, the first LG.MAX_GLOBALS of them.
function LG.Globals()
  local found = {}
  for key, value in pairs(_G) do
    if type(key) == "string" and key:find("Legacy") then found[#found + 1] = key .. " (" .. shown(value) .. ")" end
  end
  table.sort(found)
  return { unpack(found, 1, LG.MAX_GLOBALS) }, #found
end

-- How many nodes the game lists for a tree id (asked under pcall), or nil.
local function nodeCount(tree)
  local traits = _G.C_Traits
  if type(traits) ~= "table" or type(traits.GetTreeNodes) ~= "function" or type(tree) ~= "number" then return nil end
  local ok, nodes = pcall(traits.GetTreeNodes, tree)
  return ok and type(nodes) == "table" and #nodes or nil
end

-- The perk panel's ids and its node count, as one text.
function LG.PanelLine(panel)
  return string.format("perk panel: configID %s, treeID %s, nodes %s", shown(panel.configID), shown(panel.treeID), shown(nodeCount(panel.treeID) or "unknown"))
end

-- Lines for one page of the window: whether it is there and its keys.
local function pageLine(window, key)
  local page = window[key]
  if type(page) ~= "table" then return key .. ": missing" end
  return key .. ": " .. keysOf(page)
end

-- The lines about the window once it is loaded: each page, then the perk panel.
local function windowLines(window)
  local out = {}
  for _, key in ipairs(LG.PAGES) do out[#out + 1] = pageLine(window, key) end
  local panel = type(window.TreePage) == "table" and window.TreePage[LG.PANEL]
  out[#out + 1] = type(panel) == "table" and LG.PanelLine(panel) or "perk panel: not found on TreePage"
  return out
end

-- The probe's lines.
function LG.ProbeLines()
  local window = _G.LegacySystemFrame
  local loaded = type(window) == "table"
  local out = { "Legacy probe: LegacySystemFrame is " .. (loaded and "loaded" or "not loaded (open the Legacy window once, then run this again)") }
  for _, line in ipairs(loaded and windowLines(window) or {}) do out[#out + 1] = line end
  local names, total = LG.Globals()
  out[#out + 1] = string.format("globals with Legacy in the name (%d): %s", total, table.concat(names, ", "))
  return out
end

-- /vg legacy probe: the lines, out of combat.
function LG.Probe()
  if ns.InCombat() then return ns.Chat("Not in combat.") end
  for _, line in ipairs(LG.ProbeLines()) do ns.Chat(line) end
end

-- Command ---------------------------------------------------------------------------------

-- /vg legacy [probe|plan ...].
function LG.Command(rest)
  local word, tail = (rest or ""):match("^%s*(%S*)%s*(.-)%s*$")
  if word == "probe" then return LG.Probe() end
  if word ~= "plan" then return ns.Chat(ns.Literal(L["Legacy: /vg legacy probe lists what the client has for the Legacy system; /vg legacy plan [add <points> <name>|remove <name>|clear] plans the perk tree's 16 points."])) end
  if not ns.Settings("Legacy", LG.defaults).planner then return ns.Chat(L["The Legacy perk planner is off: switch it on under Town and gear."]) end
  LG.PlanCommand(tail)
end

-- Module entry point (Core/Modules.lua).
function LG.Enable(settings)
  LG.settings = settings
end
