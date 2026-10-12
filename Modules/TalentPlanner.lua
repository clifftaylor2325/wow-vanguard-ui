-- Talent planner: plan where your talent points will go before you have them, on the game's
-- own talents window (WoW Forever's trait tree: one tree, three groups). Vanguard adds a bar
-- along the window's foot: a Plan switch, Spend planned and a summary. With Plan on, a click
-- on a talent sets the rank you want instead of buying it (left-click one more, right-click
-- one back); the planned rank sits on the talent as a badge in your accent, the next point to
-- buy wears an accent ring, and a rank the plan can never reach (a talent it hangs from, or
-- its row's points, missing from the plan) is marked red. Spend planned (or /vg talents spend)
-- buys the next picks in a legal order, highest rows first, and applies them. At a level-up,
-- chat names the next pick; Spend by itself (off until you switch it on) buys them without
-- asking. Plans are kept per character and spec group (Primary, Secondary) in VanguardCharDB,
-- by talent node, with the hash of the tree they were made on: after a patch that moved the
-- talents, the ones still there are kept and the rest dropped, with a line in chat. /vg talents
-- export and import share a plan as a string (for your class only). Everything reads the game's
-- trait API under pcall; a client without it builds the bar and marks nothing.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgPlanner = ns.FrameState("vgPlanner")

local T, W = ns.Theme, ns.Widgets

local TP = ns.Module("TalentPlanner", { defaults = { levelPrompt = true, autoSpend = false } })

-- The events after which the marks are painted again (the tree, its points or the spec group changed).
TP.EVENTS = {
  "TRAIT_CONFIG_UPDATED", "TRAIT_NODE_CHANGED", "TRAIT_TREE_CURRENCY_INFO_UPDATED", "PLAYER_TALENT_UPDATE",
  "ACTIVE_COMBAT_CONFIG_CHANGED", "ACTIVE_TALENT_GROUP_CHANGED",
}
-- Where the game keeps its talents window, as paths of globals and keys, first found wins: Forever's
-- (the spellbook window's TalentsFrame), the retail class talents tab, the older talent window.
TP.FRAMES = { { "PlayerSpellsFrame", "TalentsFrame" }, { "ClassTalentFrame", "TalentsTab" }, { "PlayerTalentFrame" } }
-- How many frames deep inside the window its talent buttons are looked for, when it has no enumerator.
TP.BUTTON_DEPTH = 6
-- Edge types (Enum.TraitEdgeType) that are no requirement: visual only (0) and mutually exclusive (4);
-- any other edge means the talent it points to needs the one it comes from at full rank.
TP.LOOSE_EDGES = { [0] = true, [4] = true }
-- How far above a talent button (frame levels) its mark sits, and the bar above the window.
TP.LEVEL_ABOVE = 5
-- The next pick's ring, units wide.
TP.RING = 6
-- The bar: its size, where it sits from the window's bottom left, the Plan switch's and Spend planned's widths.
TP.BAR_WIDTH, TP.BAR_HEIGHT, TP.BAR_X, TP.BAR_Y, TP.SWITCH_WIDTH, TP.SPEND_WIDTH = 520, 24, 14, 10, 84, 110
-- How long after a level-up the points are read (the game fills the new point in a moment).
TP.LEVEL_DELAY = 1

-- The marks on the game's talent buttons: button -> mark (weak, so a button the game drops goes too).
local marks = setmetatable({}, { __mode = "k" })

-- The game's API ------------------------------------------------------------------------------

-- A call on one of the game's API tables (C_Traits, say) by function name, under pcall: its first
-- result, or nil when this client lacks it or it threw.
local function ask(api, name, ...)
  local t = _G[api]
  local fn = type(t) == "table" and t[name]
  if type(fn) ~= "function" then return nil end
  local ok, value = pcall(fn, ...)
  if ok then return value end
  return nil
end

-- The spec group in use (1 Primary, 2 Secondary), 1 where the client has none.
function TP.SpecGroup()
  return ns.PlainNumber(ask("C_SpecializationInfo", "GetActiveSpecGroup")) or 1
end

-- The config the player's talents live in: the spec group's combat config, else the class talents' active one.
function TP.ConfigID()
  local id = ask("C_SpecializationInfo", "GetCombatConfigIDForSpecGroup", TP.SpecGroup())
  return ns.PlainNumber(id) or ns.PlainNumber(ask("C_ClassTalents", "GetActiveConfigID"))
end

-- A tree's hash as text (its bytes joined), or its ID where the client has no hash.
function TP.TreeHash(treeID)
  local hash = ask("C_Traits", "GetTreeHash", treeID)
  if type(hash) ~= "table" then return tostring(treeID) end
  local parts = {}
  for i, b in ipairs(hash) do parts[i] = tostring(b) end
  return table.concat(parts, "-")
end

-- Reading the tree ------------------------------------------------------------------------------

-- The groups of a tree (its columns: Discipline, Holy, Shadow): groupID -> { name, order }.
local function readGroups(treeID)
  local list = ask("C_Traits", "GetGroupDisplayInfoByTreeID", treeID)
  local groups = {}
  for _, info in ipairs(type(list) == "table" and list or {}) do
    if info.groupID then groups[info.groupID] = { name = info.displayName or "", order = ns.PlainNumber(info.orderIndex) or 0 } end
  end
  return groups
end

-- Unspent talent points: the tree's first currency's quantity.
local function unspent(configID, treeID)
  local list = ask("C_Traits", "GetTreeCurrencyInfo", configID, treeID, false)
  local c = type(list) == "table" and list[1]
  return type(c) == "table" and ns.PlainNumber(c.quantity) or 0
end

-- The group a node is in: the first of its group IDs the tree knows, or nil.
local function groupOf(groups, node)
  for _, id in ipairs(node.groupIDs or {}) do
    if groups[id] then return id end
  end
  return nil
end

-- A node's spell: its entry (the active one, else its first) read through its definition, or nil.
local function spellOf(configID, node)
  local entryID = type(node.activeEntry) == "table" and node.activeEntry.entryID or (node.entryIDs or {})[1]
  local entry = entryID and ask("C_Traits", "GetEntryInfo", configID, entryID)
  local def = type(entry) == "table" and entry.definitionID and ask("C_Traits", "GetDefinitionInfo", entry.definitionID)
  if type(def) ~= "table" then return nil end
  return ns.PlainNumber(def.overriddenSpellID) or ns.PlainNumber(def.spellID)
end

-- The points a node's row needs spent in its group first (its gate conditions' largest), 0 for none.
local function gateOf(configID, conditionIDs)
  local need = 0
  for _, id in ipairs(conditionIDs or {}) do
    local c = ask("C_Traits", "GetConditionInfo", configID, id)
    local n = type(c) == "table" and c.isGate and ns.PlainNumber(c.spentAmountRequired)
    if n and n > need then need = n end
  end
  return need
end

-- One node as the planner keeps it: its group, place, ranks bought and possible, spell, gate and edges
-- out of it; nil for a hidden node or one in no group.
local function readNode(configID, nodeID, groups)
  local node = ask("C_Traits", "GetNodeInfo", configID, nodeID)
  if type(node) ~= "table" or node.isVisible == false then return nil end
  local group = groupOf(groups, node)
  if not group then return nil end
  return {
    nodeID = nodeID, group = group, x = ns.PlainNumber(node.posX) or 0, y = ns.PlainNumber(node.posY) or 0,
    rank = ns.PlainNumber(node.ranksPurchased) or 0, max = math.max(1, ns.PlainNumber(node.maxRanks) or 1),
    spell = spellOf(configID, node), gate = gateOf(configID, node.conditionIDs), edges = node.visibleEdges or {}, prereqs = {},
  }
end

-- Gives each node the list of nodes it hangs from: the sources of the edges into it that are requirements.
local function linkPrereqs(tree)
  for id, node in pairs(tree.nodes) do
    for _, edge in ipairs(node.edges) do
      local target = type(edge) == "table" and tree.nodes[edge.targetNode]
      if target and not TP.LOOSE_EDGES[ns.PlainNumber(edge.type) or 0] then target.prereqs[#target.prereqs + 1] = id end
    end
  end
end

-- The player's talent tree as the planner sees it, or nil on a client without the trait API or a tree:
-- its config, hash, unspent points, groups, and nodes by ID, each with the nodes it hangs from.
function TP.ReadTree()
  local configID = TP.ConfigID()
  local config = configID and ask("C_Traits", "GetConfigInfo", configID)
  local treeID = type(config) == "table" and type(config.treeIDs) == "table" and ns.PlainNumber(config.treeIDs[1])
  if not treeID then return nil end
  local tree = { configID = configID, treeID = treeID, hash = TP.TreeHash(treeID), groups = readGroups(treeID), nodes = {}, points = unspent(configID, treeID) }
  for _, nodeID in ipairs(ask("C_Traits", "GetTreeNodes", treeID) or {}) do
    tree.nodes[nodeID] = readNode(configID, nodeID, tree.groups)
  end
  linkPrereqs(tree)
  return tree
end

-- A talent's name from its spell, else "talent <id>".
function TP.NodeName(node)
  local get = type(C_Spell) == "table" and C_Spell.GetSpellName
  local name = node.spell and type(get) == "function" and get(node.spell)
  if type(name) == "string" and not ns.IsSecret(name) then return name end
  return "talent " .. node.nodeID
end

-- The plan ----------------------------------------------------------------------------------------

-- This character's plans: spec group -> { hash, ranks = { [nodeID] = rank } }, made empty.
local function plans()
  VanguardCharDB.talentPlans = type(VanguardCharDB.talentPlans) == "table" and VanguardCharDB.talentPlans or {}
  return VanguardCharDB.talentPlans
end

-- The plan for a spec group (the one in use by default), made empty when there is none: the ranks
-- wanted per talent node, and the hash of the tree it was made on.
function TP.Plan(group)
  group = group or TP.SpecGroup()
  local all = plans()
  if type(all[group]) ~= "table" then all[group] = {} end
  if type(all[group].ranks) ~= "table" then all[group].ranks = {} end
  return all[group]
end

-- Fits the plan to the tree it is shown on: a plan made on another version of the tree keeps the talents
-- still there (ranks capped) and says what was dropped; the plan takes the tree's hash.
function TP.Reconcile(tree, plan)
  if plan.hash == tree.hash then return plan end
  local dropped = 0
  for id, rank in pairs(plan.ranks) do
    local node = tree.nodes[id]
    if not node then plan.ranks[id] = nil dropped = dropped + 1 elseif rank > node.max then plan.ranks[id] = node.max end
  end
  if plan.hash and dropped > 0 then ns.Chat(string.format("Talent planner: the talent tree changed since your plan was made; dropped %d planned talent%s it no longer has.", dropped, dropped == 1 and "" or "s")) end
  plan.hash = tree.hash
  return plan
end

-- Sets the rank the plan wants for a talent (clamped to what it can have; at or under what is bought
-- removes it) and repaints.
function TP.SetPlanned(nodeID, rank)
  local tree = TP.tree or TP.ReadTree()
  local node = tree and tree.nodes[nodeID]
  if not node then return end
  rank = math.max(0, math.min(node.max, rank))
  TP.Plan().ranks[nodeID] = rank > node.rank and rank or nil
  TP.Refresh()
end

-- Where the buying simulation starts: each node's bought rank, the rank the plan wants (never under
-- what is bought), and the points spent per group.
local function startState(tree, plan)
  local state, want, spent = {}, {}, {}
  for id, node in pairs(tree.nodes) do
    state[id], want[id] = node.rank, math.max(node.rank, math.min(node.max, plan.ranks[id] or 0))
    spent[node.group] = (spent[node.group] or 0) + node.rank
  end
  return state, want, spent
end

-- Whether a node can take its next rank in a simulated state: its row's gate met, the nodes it hangs from full.
local function buyable(tree, state, spent, node)
  if (spent[node.group] or 0) < node.gate then return false end
  for _, id in ipairs(node.prereqs) do
    local src = tree.nodes[id]
    if src and state[id] < src.max then return false end
  end
  return true
end

-- Whether node a comes before node b in buying order: higher rows first, then left to right, then by ID.
local function before(a, b)
  if a.y ~= b.y then return a.y < b.y end
  if a.x ~= b.x then return a.x < b.x end
  return a.nodeID < b.nodeID
end

-- The first node in buying order still short of its wanted rank that can be bought now, or nil.
local function nextPick(tree, want, state, spent)
  local best
  for id, node in pairs(tree.nodes) do
    if state[id] < want[id] and buyable(tree, state, spent, node) and (not best or before(node, best)) then best = node end
  end
  return best
end

-- Buys ranks in the simulation while something can be bought: the node IDs in order, one per point.
local function simulate(tree, want, state, spent)
  local order, pick = {}, nextPick(tree, want, state, spent)
  while pick do
    state[pick.nodeID], spent[pick.group] = state[pick.nodeID] + 1, spent[pick.group] + 1
    order[#order + 1] = pick.nodeID
    pick = nextPick(tree, want, state, spent)
  end
  return order
end

-- The plan against the tree: the order to buy the planned ranks in (one node ID per point), the nodes
-- whose planned rank can never be reached (stuck), and the plan's size: points planned and bought.
function TP.Resolve(tree, plan)
  local state, want, spent = startState(tree, plan)
  local out = { planned = 0, spent = 0, stuck = {} }
  for id, node in pairs(tree.nodes) do out.planned, out.spent = out.planned + want[id], out.spent + node.rank end
  out.order = simulate(tree, want, state, spent)
  for id in pairs(tree.nodes) do out.stuck[id] = state[id] < want[id] or nil end
  return out
end

-- The game's buttons ------------------------------------------------------------------------------

-- The game's talents window, where this client keeps it (TP.FRAMES), or nil before its part of the game loads.
function TP.Frame()
  for _, path in ipairs(TP.FRAMES) do
    local f = _G[path[1]]
    for i = 2, #path do f = type(f) == "table" and f[path[i]] or nil end
    if type(f) == "table" and f.HookScript then return f end
  end
  return nil
end

-- A talent button's node ID: its GetNodeID, else its nodeID field; nil for a frame that is no talent button.
local function nodeIDOf(frame)
  if type(frame.GetNodeID) == "function" then
    local ok, id = pcall(frame.GetNodeID, frame)
    return ok and ns.PlainNumber(id) or nil
  end
  return ns.PlainNumber(frame.nodeID)
end

-- Adds a frame to out under its node ID when it is a talent button.
local function addButton(out, button)
  local id = type(button) == "table" and nodeIDOf(button)
  if id then out[id] = button end
end

-- Adds the talent buttons among a frame and its children, depth levels down (a frame the game
-- keeps from addons, and what it holds, is skipped).
local function walk(out, frame, depth)
  if depth < 0 or type(frame) ~= "table" or not frame.GetChildren or (frame.IsForbidden and frame:IsForbidden()) then return end
  addButton(out, frame)
  local ok, children = pcall(function() return { frame:GetChildren() } end)
  if not ok then return end
  for _, child in ipairs(children) do walk(out, child, depth - 1) end
end

-- The buttons the window's own lookup gives for the tree's nodes (TalentFrameBaseMixin's GetTalentButtonByNodeID).
local function lookedUp(frame, tree)
  local out = {}
  for id in pairs(tree.nodes) do
    local ok, button = pcall(frame.GetTalentButtonByNodeID, frame, id)
    if ok and type(button) == "table" then out[id] = button end
  end
  return out
end

-- The buttons the window's own enumerator gives (TalentFrameBaseMixin's EnumerateAllTalentButtons), or nil without one.
local function enumerated(frame)
  local ok, iter, a, b = pcall(frame.EnumerateAllTalentButtons, frame)
  if not ok or type(iter) ~= "function" then return nil end
  local out = {}
  for button in iter, a, b do addButton(out, button) end
  return out
end

-- Every talent button the window shows for the tree, by node ID: the window's own lookup or enumerator
-- where it has one, else a walk of its frames TP.BUTTON_DEPTH deep.
function TP.Buttons(frame, tree)
  if type(frame.GetTalentButtonByNodeID) == "function" then return lookedUp(frame, tree) end
  local out = type(frame.EnumerateAllTalentButtons) == "function" and enumerated(frame)
  if out then return out end
  out = {}
  walk(out, frame, TP.BUTTON_DEPTH)
  return out
end

-- The marks ---------------------------------------------------------------------------------------

-- The plan's line for a talent in its tooltip.
local function planLine(node, planned)
  if planned and planned > node.rank then return string.format("Planned: %d of %d (%d bought)", planned, node.max, node.rank) end
  return string.format("Not in your plan (%d of %d bought)", node.rank, node.max)
end

-- Adds the plan's lines for a talent to the tooltip: its planned rank (in the accent while it has one) and how to change it.
local function addPlanLines(node)
  local planned = TP.Plan().ranks[node.nodeID]
  local r, g, b = T.RGB(planned and "accent" or "text2")
  GameTooltip:AddLine(planLine(node, planned), r, g, b)
  local hr, hg, hb = T.RGB("text2")
  GameTooltip:AddLine("Left-click plans a point, right-click takes one back.", hr, hg, hb)
end

-- The tooltip for a marked talent: the talent's spell, then the plan's lines for it.
function TP.ShowTip(m)
  local node = m.node
  if not node then return end
  TP.hovered = m
  GameTooltip:SetOwner(m, "ANCHOR_RIGHT")
  if node.spell then GameTooltip:SetSpellByID(node.spell) else GameTooltip:SetText(TP.NodeName(node)) end
  addPlanLines(node)
  GameTooltip:Show()
end

-- Puts the tooltip away when the mouse leaves a mark.
local function hideTip(m)
  if TP.hovered == m then TP.hovered = nil end
  GameTooltip:Hide()
end

-- A click on a mark in plan mode: left plans one more rank (from what is bought or planned), right takes one back.
function TP.Click(m, mouse)
  local node = m.node
  if not node then return end
  local now = math.max(node.rank, TP.Plan().ranks[node.nodeID] or 0)
  TP.SetPlanned(node.nodeID, now + (mouse == "RightButton" and -1 or 1))
  T.Sound(mouse == "RightButton" and "off" or "on")
  if TP.hovered == m then TP.ShowTip(m) end
end

-- The mark's parts and scripts: the badge at its top right, the ring, clicks that plan and a tooltip on hover.
local function markParts(m)
  m.badge = T.Text(m:CreateFontString(nil, "OVERLAY"), "auraCount", "accent")
  m.badge:SetPoint("TOPRIGHT", -2, -2)
  m.ring = T.Glow(m, TP.RING)
  m:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  m:SetScript("OnClick", ns.Guard("click talent plan", function(self, mouse) TP.Click(self, mouse) end))
  m:SetScript("OnEnter", function(self) TP.ShowTip(self) end)
  m:SetScript("OnLeave", hideTip)
  m:EnableMouse(false)
end

-- The mark on one talent button, made once: a button over it (taking the mouse in plan mode only).
local function markFor(button)
  local m = marks[button]
  if m then return m end
  m = CreateFrame("Button", nil, button)
  m:SetAllPoints(button)
  m:SetFrameLevel(button:GetFrameLevel() + TP.LEVEL_ABOVE)
  markParts(m)
  marks[button] = m
  return m
end

-- Paints one mark: the badge with the planned rank while it is above what is bought (red when the plan
-- can't reach it), the ring on the next pick, and the mouse taken in plan mode.
local function paintMark(m, node, planned, result)
  m.node = node
  m.badge:SetShown(planned ~= nil and planned > node.rank)
  m.badge:SetText(planned and tostring(planned) or "")
  T.Color(m.badge, result.stuck[node.nodeID] and "bad" or "accent")
  T.ShowGlow(m.ring, result.order[1] == node.nodeID)
  m:EnableMouse(TP.planning == true)
  m:Show()
end

-- Marks every talent button the window shows now from the tree and plan; marks on buttons that show no
-- talent now are hidden.
local function paintAll(frame, tree, plan, result)
  for _, m in pairs(marks) do m:Hide() end
  for id, button in pairs(TP.Buttons(frame, tree)) do
    local node = tree.nodes[id]
    if node then paintMark(markFor(button), node, plan.ranks[id], result) end
  end
end

-- The bar -----------------------------------------------------------------------------------------

-- The plan's summary: points planned, bought and still to buy, the next pick, and what can't be reached.
function TP.Summary(tree, result)
  local stuck = 0
  for _ in pairs(result.stuck) do stuck = stuck + 1 end
  local text = string.format("%d planned, %d bought, %d to buy", result.planned, result.spent, result.planned - result.spent)
  if result.order[1] then text = text .. "; next: " .. TP.NodeName(tree.nodes[result.order[1]]) end
  if stuck > 0 then text = text .. string.format("; %d unreachable (a talent or row it needs is not in the plan)", stuck) end
  if tree.points > 0 then text = text .. string.format("; %d point%s to spend", tree.points, tree.points == 1 and "" or "s") end
  return text
end

-- Puts the summary on the bar and makes Spend planned usable when there is something to spend (out of combat).
local function paintBar(tree, result)
  local bar = TP.bar
  if not bar then return end
  bar.summary:SetText(TP.Summary(tree, result))
  local can = tree.points > 0 and #result.order > 0 and not ns.InCombat()
  if can then bar.spend:Enable() else bar.spend:Disable() end
  bar.spend:SetAlpha(can and 1 or 0.5)
end

-- Plan mode on or off: the marks take the mouse, the switch re-reads, the window repaints.
function TP.SetPlanning(on)
  TP.planning = on == true
  if TP.bar then TP.bar.plan:Refresh() end
  TP.Refresh()
end

-- The bar's controls: the Plan switch, Spend planned, and the summary after them.
local function barControls(bar)
  bar.plan = W.Check(bar, "Plan", function() return TP.planning == true end, TP.SetPlanning, TP.SWITCH_WIDTH)
  bar.plan:SetHeight(TP.BAR_HEIGHT)
  bar.plan:SetPoint("LEFT", 0, 0)
  bar.spend = W.Button(bar, "Spend planned", function() TP.SpendPlanned() end, TP.SPEND_WIDTH)
  bar.spend:SetHeight(TP.BAR_HEIGHT - 4)
  bar.spend:SetPoint("LEFT", bar.plan, "RIGHT", 8, 0)
  bar.summary = T.Text(bar:CreateFontString(nil, "OVERLAY"), "small", "text2")
  bar.summary:SetPoint("LEFT", bar.spend, "RIGHT", 10, 0)
end

-- The planner's bar along the window's foot, made once.
local function buildBar(frame)
  local bar = CreateFrame("Frame", "Vanguard_TalentPlan", frame)
  bar:SetSize(TP.BAR_WIDTH, TP.BAR_HEIGHT)
  bar:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", TP.BAR_X, TP.BAR_Y)
  bar:SetFrameLevel(frame:GetFrameLevel() + TP.LEVEL_ABOVE)
  barControls(bar)
  TP.bar = bar
end

-- Painting ----------------------------------------------------------------------------------------

-- Reads the tree and plan again and paints the marks and the bar; nothing while the window is away.
function TP.Refresh()
  local frame = TP.Frame()
  if not frame or not frame:IsVisible() then return end
  TP.tree = TP.ReadTree()
  if not TP.tree then return end
  local plan = TP.Reconcile(TP.tree, TP.Plan())
  TP.result = TP.Resolve(TP.tree, plan)
  paintAll(frame, TP.tree, plan, TP.result)
  paintBar(TP.tree, TP.result)
end

-- Paints on the next frame (several events in one frame paint once), or now on a client without C_Timer.
function TP.Schedule()
  if TP.pending then return end
  local after = type(C_Timer) == "table" and C_Timer.After
  if type(after) ~= "function" then return TP.Refresh() end
  TP.pending = true
  after(0, function() TP.pending = false ns.Try("talent planner", TP.Refresh) end)
end

-- Hooks the game's talents window once it exists: the bar built, a repaint on show, the tooltip put away on hide.
function TP.Attach()
  local frame = TP.Frame()
  if not frame or vgPlanner[frame] then return end
  vgPlanner[frame] = true
  buildBar(frame)
  frame:HookScript("OnShow", TP.Schedule)
  frame:HookScript("OnHide", function() GameTooltip:Hide() end)
  TP.Schedule()
end

-- Spending ----------------------------------------------------------------------------------------

-- Applies the staged ranks: the class talents' commit (nil: the talents in use, as the game's window
-- commits), else the trait commit for the config. Says so when the game refused (it throttles commits).
function TP.Commit(configID)
  local done
  if type(_G.C_ClassTalents) == "table" and type(_G.C_ClassTalents.CommitConfig) == "function" then
    done = ask("C_ClassTalents", "CommitConfig", nil)
  else
    done = ask("C_Traits", "CommitConfig", configID)
  end
  if done == false then ns.Chat("Talent planner: the game refused to apply talents just now; try again in a moment.") end
  TP.Schedule()
end

-- The names of the first n picks in the order, each once with its count ("Spirit Tap x2").
local function pickNames(tree, order, n)
  local names, seen = {}, {}
  for i = 1, n do
    local id = order[i]
    if seen[id] then seen[id].count = seen[id].count + 1 else seen[id] = { count = 1 } names[#names + 1] = id end
  end
  for i, id in ipairs(names) do names[i] = TP.NodeName(tree.nodes[id]) .. (seen[id].count > 1 and (" x" .. seen[id].count) or "") end
  return table.concat(names, ", ")
end

-- Buys the next n planned ranks (all the points you have when n is nil) in the plan's order and applies
-- them. Nothing in combat, without points, or with nothing planned to buy; chat says which.
function TP.SpendPlanned(n)
  if ns.InCombat() then return ns.Chat("Talents can't be changed in combat.") end
  local tree = TP.ReadTree()
  if not tree then return ns.Chat("Talent planner: no talent tree to spend in.") end
  local result = TP.Resolve(tree, TP.Plan())
  local count = math.min(tree.points, #result.order, n or #result.order)
  if count <= 0 then return ns.Chat(tree.points > 0 and "Talent planner: nothing planned that can be bought now." or "Talent planner: no points to spend.") end
  for i = 1, count do ask("C_Traits", "PurchaseRank", tree.configID, result.order[i]) end
  ns.Chat(string.format("Talent planner: spent %d point%s on %s.", count, count == 1 and "" or "s", pickNames(tree, result.order, count)))
  TP.Commit(tree.configID)
end

-- The level-up line: how many points wait and what the plan buys next; Spend by itself buys them instead.
function TP.Prompt()
  local tree = TP.ReadTree()
  if not tree or tree.points <= 0 then return end
  local result = TP.Resolve(tree, TP.Plan())
  if #result.order == 0 then return end
  if TP.settings.autoSpend then return TP.SpendPlanned() end
  ns.Chat(string.format("%d talent point%s to spend; your plan's next pick is %s (/vg talents spend buys it).",
    tree.points, tree.points == 1 and "" or "s", TP.NodeName(tree.nodes[result.order[1]])))
end

-- You gained a level: in a moment (the point lands first), after combat, the prompt or the spend, when either is on.
local function onLevelUp()
  if not (TP.settings.levelPrompt or TP.settings.autoSpend) then return end
  local after = type(C_Timer) == "table" and C_Timer.After
  -- The prompt, out of combat.
  local function go() ns.OutOfCombat(function() ns.Try("talent planner", TP.Prompt) end, "talents") end
  if type(after) == "function" then after(TP.LEVEL_DELAY, go) else go() end
end

-- Sharing -----------------------------------------------------------------------------------------

-- A class token as a word ("MAGE" -> "Mage").
local function classWord(token)
  return token:sub(1, 1) .. token:sub(2):lower()
end

-- How many points a set of ranks adds up to.
local function countRanks(ranks)
  local n = 0
  for _, rank in pairs(ranks) do n = n + rank end
  return n
end

-- The ranks in a pasted plan that read as a talent and a rank (whole numbers above zero).
local function cleanRanks(ranks)
  local out = {}
  for id, rank in pairs(ranks) do
    if type(id) == "number" and type(rank) == "number" and rank >= 1 then out[id] = math.floor(rank) end
  end
  return out
end

-- This spec group's plan as a string to share: your class, the tree's hash and the ranks; nil and why when it is empty.
function TP.Export()
  local plan = TP.Plan()
  if not next(plan.ranks) then return nil, "this spec's plan is empty" end
  local _, class = UnitClass("player")
  return ns.Serialize.Encode("talents", { class = not ns.IsSecret(class) and class or nil, hash = plan.hash, ranks = plan.ranks })
end

-- A pasted plan string into this spec group's plan, for your class only: true and its points, or false and why.
-- The tree it was made on is checked at the next repaint (TP.Reconcile).
function TP.Import(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return false, data end
  if scope ~= "talents" or type(data) ~= "table" or type(data.ranks) ~= "table" then return false, "that is not a talent plan" end
  local _, class = UnitClass("player")
  if type(data.class) == "string" and type(class) == "string" and data.class ~= class then return false, "that plan is for a " .. classWord(data.class) end
  local plan = TP.Plan()
  plan.ranks, plan.hash = cleanRanks(data.ranks), type(data.hash) == "string" and data.hash or nil
  TP.Refresh()
  return true, countRanks(plan.ranks)
end

-- /vg talents export, and the options button: the plan as a string in a box to copy.
function TP.ExportDialog()
  local text, err = TP.Export()
  if not text then return ns.Chat("Nothing to export: " .. err .. ".") end
  ns.ShowText("Vanguard talent plan  Ctrl+C to copy", text)
end

-- /vg talents import, and the options button: a box to paste a plan into.
function TP.ImportDialog()
  ns.AskText("Paste a talent plan, then Import", function(text)
    local ok, detail = TP.Import(text)
    if not ok then return ns.Chat("Import failed: " .. detail .. ".") end
    ns.HideText()
    ns.Chat(string.format("Talent plan imported: %d point%s.", detail, detail == 1 and "" or "s"))
  end)
end

-- Empties this spec group's plan.
function TP.Clear()
  TP.Plan().ranks = {}
  TP.Refresh()
  ns.Chat("Talent plan cleared.")
end

-- Commands and options ------------------------------------------------------------------------------

-- /vg talents: the plan's summary in chat.
local function summaryCommand()
  local tree = TP.ReadTree()
  if not tree then return ns.Chat("Talent planner: this client has no talent tree to read.") end
  ns.Chat("Talent plan: " .. TP.Summary(tree, TP.Resolve(tree, TP.Reconcile(tree, TP.Plan()))) .. ".")
end

-- /vg talents plan: plan mode on or off, said in chat.
local function planCommand()
  TP.SetPlanning(not TP.planning)
  ns.Chat("Plan mode " .. (TP.planning and "on: click talents on the talents window to plan them." or "off."))
end

-- /vg talents spend: the planned points bought.
local function spendCommand()
  TP.SpendPlanned()
end

-- /vg talents <word>: what each word does.
TP.COMMANDS = { plan = planCommand, spend = spendCommand, clear = TP.Clear, export = TP.ExportDialog, import = TP.ImportDialog }

-- /vg talents [plan|spend|clear|export|import]: the plan's summary, or one of those.
function TP.Command(rest)
  if not TP.settings then return ns.Chat("The Talent planner is off (/vg > Modules).") end
  local sub = TP.COMMANDS[(rest or ""):match("^(%a*)"):lower()]
  if sub then return sub() end
  summaryCommand()
end

-- get/set for one of the planner's settings.
local function setting(key)
  return function() return ns.Settings("TalentPlanner", TP.defaults)[key] end, function(v) ns.Settings("TalentPlanner", TP.defaults)[key] = v end
end

-- The Talents page: how to plan, the level-up switches, and the plan's export, import and clear.
local function rows()
  return {
    { "header", "Talent planner" },
    { "text", "On the talents window, switch Plan on and click talents to set the ranks you want (right-click takes one back). The planned rank sits on each talent, the next point to buy wears a ring, and Spend planned buys the next picks in order. Plans are kept per character and spec." },
    { "check", "At a level-up, say what the plan picks next", setting("levelPrompt") },
    { "check", "Spend planned points by itself at a level-up (buys and applies them, no asking)", setting("autoSpend") },
    { "button", "Export this spec's plan", TP.ExportDialog },
    { "button", "Import a plan", TP.ImportDialog },
    { "button", "Clear this spec's plan", TP.Clear },
  }
end

ns.Options.AddPage({ key = "talents", title = "Talents", icon = "NavTalents", order = 47, rows = rows })

-- Module entry point (Core/Modules.lua): the window hooked now or when its part of the game loads,
-- repaints on tree changes, and the level-up prompt.
function TP.Enable(settings)
  TP.settings = settings
  TP.Attach()
  ns.On("ADDON_LOADED", TP.Attach)
  for _, event in ipairs(TP.EVENTS) do ns.On(event, TP.Schedule) end
  ns.On("PLAYER_LEVEL_UP", onLevelUp)
end
