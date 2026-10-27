-- Raid tools for the group's leader and assistants, in one small bar:
--   * Ready check, a 10-second pull countdown (right-click cancels it), a role
--     check, and "Raid" to turn your party into a raid while you lead one;
--   * the eight raid target icons (click one to mark your target; the last
--     button clears it);
--   * the eight world markers (click to place or remove one where you aim; the
--     last button clears them all). These are the game's own secure marker
--     buttons, so they work in combat.
-- The bar shows while you're in a group and lead it or assist (or everyone
-- assists). It holds secure buttons, so it only shows or hides out of combat.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L

local RT = ns.Module("RaidTools", { defaults = {} })

RT.ICON, RT.GAP, RT.PAD = 18, 2, T.SPACE.tight
-- A text button's usual width, and the width of the bar's icon rows (nine icons).
RT.ACTION_W = 44
RT.ROW_W = 2 * RT.PAD + 9 * RT.ICON + 8 * RT.GAP
-- The raid icon that matches each world marker's color (blue square, green
-- triangle, purple diamond, red cross, yellow star, orange circle, silver moon, white skull).
RT.MARKER_ICONS = { 6, 4, 3, 7, 1, 2, 5, 8 }
-- The clear button's mark.
RT.CLEAR = T.Icon("Close")

-- Calls a function from C_PartyInfo, else the global of that name; nil when neither exists. Only for a call
-- the game lets addon code make: Ready and Pull run as macros instead (RT.ACTIONS), as the client reserves
-- C_PartyInfo.DoReadyCheck and DoCountdown for secure code.
local function party(name, ...)
  local fn = C_PartyInfo and C_PartyInfo[name]
  if type(fn) ~= "function" then fn = _G[name] end
  if type(fn) == "function" then return fn(...) end
end

-- A plain true from a global client call (hidden values count as false).
local function globalTrue(name, ...)
  return ns.IsTrue(ns.CallIf(_G, name, ...))
end

-- Who may use the tools: the leader, an assistant, or anyone when everyone assists.
function RT.CanLead()
  if not globalTrue("IsInGroup") then return false end
  return globalTrue("UnitIsGroupLeader", "player") or (globalTrue("IsInRaid") and (globalTrue("UnitIsGroupAssistant", "player") or globalTrue("IsEveryoneAssistant")))
end

-- The text buttons -----------------------------------------------------------------------

-- The pull countdown in seconds (a right-click sends 0 instead).
RT.PULL_SECONDS = 10

-- Each text button: label, what a click does, the client call it needs (the button shows only where the
-- client has it), and for a secure button the macro attributes it runs on a click instead of a handler
-- (the game's own /readycheck and /countdown; a right-click on Pull cancels its countdown).
RT.ACTIONS = {
  { L["Ready"], false, "DoReadyCheck", { macrotext = "/readycheck" } },
  { L["Pull"], false, "DoCountdown", { macrotext = "/countdown " .. RT.PULL_SECONDS, macrotext2 = "/countdown 0" } },
  { L["Roles"], function() _G.InitiateRolePoll() end, "InitiateRolePoll" },
  { L["Raid"], function() party("ConvertToRaid") end, "ConvertToRaid" },
}

-- True when this client has the call a button needs.
local function hasCall(name)
  return type(C_PartyInfo and C_PartyInfo[name]) == "function" or type(_G[name]) == "function"
end

-- Makes a secure button run the macro attributes in `macros` on a click's release, whatever the
-- key-down casting setting says. Out of combat: the attributes of a secure frame are fixed in a fight.
local function runMacros(b, macros)
  b:SetAttribute("type", "macro")
  b:SetAttribute("useOnKeyDown", false)
  for name, text in pairs(macros) do b:SetAttribute(name, text) end
end

-- One text button { label, click, call, macros } on the first row, kept by its call's name: a secure
-- button running its macros, else a plain one calling its click.
local function actionButton(bar, spec)
  local b = ns.DialogButton(bar, spec[1], RT.ACTION_W, nil, spec[4] and "SecureActionButtonTemplate")
  b:SetHeight(RT.ICON)
  b:RegisterForClicks("AnyUp")
  if spec[4] then runMacros(b, spec[4]) else b:SetScript("OnClick", ns.Guard("click raid tools button", spec[2])) end
  bar.actions[spec[3]] = b
  RT.Place(bar, b, 1, #bar.list)
end

-- The text buttons showing now, in their order (Raid hides in a raid).
local function shownActions(bar)
  local shown = {}
  for _, spec in ipairs(RT.ACTIONS) do
    local b = bar.actions[spec[3]]
    if b and b:IsShown() then shown[#shown + 1] = b end
  end
  return shown
end

-- Gives the text buttons showing now one width: their usual, or what the widest shown label needs (a translation
-- often runs longer than the English), placed side by side at it, and the bar the width the row then takes when
-- that is more than its icon rows'. Runs again when a button hides or shows, so a hidden label asks for no room.
function RT.WidenActions(bar)
  local shown, width = shownActions(bar), RT.ACTION_W
  for _, b in ipairs(shown) do
    b:SetWidth(RT.ACTION_W)
    width = math.max(width, ns.WidenToLabel(b):GetWidth())
  end
  for i, b in ipairs(shown) do
    b:SetWidth(width)
    b:SetPoint("TOPLEFT", bar, "TOPLEFT", RT.PAD + (i - 1) * (width + RT.GAP), -RT.PAD)
  end
  bar:SetWidth(math.max(RT.ROW_W, 2 * RT.PAD + #shown * (width + RT.GAP) - RT.GAP))
end

-- The row of text buttons this client can use, as wide as their labels need.
local function addActions(bar)
  bar.actions = {}
  for _, spec in ipairs(RT.ACTIONS) do
    if hasCall(spec[3]) then actionButton(bar, spec) end
  end
  RT.WidenActions(bar)
end

-- Icon buttons ---------------------------------------------------------------------------

-- Puts a button at column `col` (0-based) of row `row` (1-3), and keeps it in the bar's list.
function RT.Place(bar, b, row, col)
  b:SetPoint("TOPLEFT", bar, "TOPLEFT", RT.PAD + col * (b:GetWidth() + RT.GAP), -RT.PAD - (row - 1) * (RT.ICON + RT.GAP))
  bar.list[#bar.list + 1] = b
end

-- An icon button showing raid icon `index` (or the clear mark for nil). A secure one acts on the
-- click's release whatever the key-down casting setting says, since it only listens for releases.
local function iconButton(bar, template, index)
  local b = T.Button(CreateFrame("Button", nil, bar, template))
  b:SetSize(RT.ICON, RT.ICON)
  b.icon = b:CreateTexture(nil, "OVERLAY")
  b.icon:SetPoint("TOPLEFT", 2, -2)
  b.icon:SetPoint("BOTTOMRIGHT", -2, 2)
  if index then ns.GetModule("RaidStatus").PaintIcon(b.icon, index) else b.icon:SetTexture(RT.CLEAR) end
  b:RegisterForClicks("AnyUp")
  if template then b:SetAttribute("useOnKeyDown", false) end
  return b
end

-- Marks your target with raid icon i (0 clears it), if it can be marked.
function RT.MarkTarget(i)
  if type(SetRaidTarget) ~= "function" or not globalTrue("UnitExists", "target") then return end
  if type(CanBeRaidTarget) == "function" and not globalTrue("CanBeRaidTarget", "target") then return end
  SetRaidTarget("target", i)
end

-- The row of raid target icons, then a button that clears your target's.
local function addTargetIcons(bar)
  for i = 1, 9 do
    local b = iconButton(bar, nil, i <= 8 and i or nil)
    b:SetScript("OnClick", ns.Guard("click raid target icon", function() RT.MarkTarget(i <= 8 and i or 0) end))
    RT.Place(bar, b, 2, i - 1)
  end
end

-- One secure world marker button: left places or removes marker i, right clears it.
local function markerButton(bar, i)
  local b = iconButton(bar, "SecureActionButtonTemplate", RT.MARKER_ICONS[i])
  b:SetAttribute("type", "worldmarker")
  b:SetAttribute("marker", i)
  b:SetAttribute("action1", "toggle")
  b:SetAttribute("action2", "clear")
  return b
end

-- The row of world markers, then a secure button that clears them all.
local function addMarkers(bar)
  for i = 1, 8 do RT.Place(bar, markerButton(bar, i), 3, i - 1) end
  local clear = iconButton(bar, "SecureActionButtonTemplate")
  clear:SetAttribute("type", "worldmarker")
  clear:SetAttribute("action", "clear")
  RT.Place(bar, clear, 3, 8)
end

-- Showing --------------------------------------------------------------------------------

-- Shows the bar to the leader and assistants in a group (and "Raid" only to a
-- party's leader). Waits for the end of combat (the bar holds secure buttons),
-- once however many group events come in the fight.
function RT.Update()
  ns.OutOfCombat(function()
    local raid = RT.bar.actions.ConvertToRaid
    RT.bar:SetShown(RT.CanLead())
    if raid then raid:SetShown(not globalTrue("IsInRaid") and globalTrue("UnitIsGroupLeader", "player")) end
    RT.WidenActions(RT.bar)
  end, "raidtools")
end

-- The movable bar: three rows (calls, target icons, world markers).
local function build()
  local bar = T.HudPanel(CreateFrame("Frame", "Vanguard_RaidTools", UIParent))
  bar.list = {}
  bar:SetSize(RT.ROW_W, 2 * RT.PAD + 3 * RT.ICON + 2 * RT.GAP)
  ns.Mover(bar, "raidtools", L["Raid tools"], { "TOPLEFT", "TOPLEFT", 186, -20 })
  addActions(bar)
  addTargetIcons(bar)
  addMarkers(bar)
  RT.bar = bar
end

-- Module entry point (Core/Modules.lua): build out of combat, then follow the group.
function RT.Enable()
  ns.OutOfCombat(function()
    build()
    RT.Update()
  end)
  for _, e in ipairs({ "GROUP_ROSTER_UPDATE", "PARTY_LEADER_CHANGED", "PLAYER_ENTERING_WORLD" }) do ns.On(e, RT.Update) end
end
