-- Raid frames: up to 40 players in a grid, one column per group (or sorted
-- by role), built on the client's secure group header so the roster can
-- change in combat. Each button shows class-colored health, the name, a
-- role letter and Dead / Offline. With showInParty on, these frames also
-- cover your party (and the party frames in UnitFrames aren't built).
--
-- All 40 buttons are created up front, out of combat, so click casting and
-- hover keys (Modules/ClickCast.lua) can be set on every one of them safely.

local ADDON, ns = ...

local T = ns.Theme

local RF = ns.Module("RaidFrames", {
  defaults = { width = 90, height = 40, spacing = 4, showInParty = true, showPlayer = true, sortByRole = false, hideBlizzard = true },
})

local MAX_UNITS = 40
local ROLE_LETTER = { TANK = "T", HEALER = "H", DAMAGER = "", NONE = "" }
local BLIZZARD_FRAMES = { "CompactRaidFrameManager", "CompactRaidFrameContainer", "CompactPartyFrame" }

-- Runs in the secure environment for every button the header creates: size
-- and default clicks, then the insecure setup below via CallMethod.
RF.INIT = [[
  local header = self:GetParent()
  self:SetWidth(header:GetAttribute("fui-width"))
  self:SetHeight(header:GetAttribute("fui-height"))
  self:SetAttribute("*type1", "target")
  self:SetAttribute("*type2", "togglemenu")
  header:CallMethod("initialConfigFunction", self:GetName())
]]

RF.buttons = {}
-- Other modules add to a raid button here: setupHooks(b) once per button,
-- updateHooks(b, unit) on every refresh (Modules/RaidAuras.lua uses both).
RF.setupHooks, RF.updateHooks = {}, {}

-- Values ----------------------------------------------------------------------------------

-- The unit frames module's helpers (class/reaction color, health text).
local function unitFrames()
  return ns.GetModule("UnitFrames")
end

-- The role letter for a unit: T for tanks, H for healers, nothing otherwise.
function RF.RoleLetter(unit)
  local role = type(UnitGroupRolesAssigned) == "function" and UnitGroupRolesAssigned(unit) or "NONE"
  return ns.IsSecret(role) and "" or (ROLE_LETTER[role] or "")
end

-- Updating ---------------------------------------------------------------------------------

-- Name, role letter, and Dead / Offline.
local function updateTexts(b, unit)
  b.name:SetText(UnitName(unit))
  b.role:SetText(RF.RoleLetter(unit))
  local status = unitFrames().HealthText(unit)
  b.status:SetText((status == "Dead" or status == "Offline") and status or "")
end

-- Health bar, colors, name, role and status for one button's unit.
function RF.Update(b)
  local unit = b:GetAttribute("unit")
  if not unit or not UnitExists(unit) then return end
  local UF = unitFrames()
  b.health:SetMinMaxValues(0, UnitHealthMax(unit))
  b.health:SetValue(UnitHealth(unit))
  b.health:SetStatusBarColor(UF.HealthColor(unit))
  updateTexts(b, unit)
  for _, hook in ipairs(RF.updateHooks) do hook(b, unit) end
end

-- Every button currently showing a unit.
function RF.UpdateAll()
  for _, b in ipairs(RF.buttons) do
    if b:IsShown() then RF.Update(b) end
  end
end

-- True when the button shows this unit (by token, or the same player under another token).
function RF.Shows(b, unit)
  local own = b:GetAttribute("unit")
  if own == unit then return true end
  local same = own and type(UnitIsUnit) == "function" and UnitIsUnit(own, unit)
  return not ns.IsSecret(same) and same == true
end

-- A unit event: refresh the buttons showing that unit.
local function onUnitEvent(_, unit)
  for _, b in ipairs(RF.buttons) do
    if b:IsShown() and RF.Shows(b, unit) then RF.Update(b) end
  end
end

-- Building ---------------------------------------------------------------------------------

-- White name, light gray role and status.
local function colorTexts(b)
  T.Color(b.name, "text")
  T.Color(b.role, "text2")
  T.Color(b.status, "text2")
end

-- Name centered, role top left, status along the bottom.
local function addTexts(b)
  b.name = T.SetFont(b.health:CreateFontString(nil, "OVERLAY"), 11)
  b.name:SetPoint("LEFT", 4, 4)
  b.name:SetPoint("RIGHT", -4, 4)
  b.name:SetWordWrap(false)
  b.role = T.SetFont(b.health:CreateFontString(nil, "OVERLAY"), 9)
  b.role:SetPoint("TOPLEFT", 2, -2)
  b.status = T.SetFont(b.health:CreateFontString(nil, "OVERLAY"), 10)
  b.status:SetPoint("BOTTOM", 0, 3)
  colorTexts(b)
end

-- The health bar filling the button, with its texts.
local function addParts(b)
  b.health = CreateFrame("StatusBar", nil, b)
  b.health:SetStatusBarTexture(T.WHITE)
  b.health:SetPoint("TOPLEFT", 1, -1)
  b.health:SetPoint("BOTTOMRIGHT", -1, 1)
  addTexts(b)
end

-- A button's unit changed (roster change): refresh it.
local function onAttributeChanged(b, name)
  if name == "unit" then RF.Update(b) end
end

-- Insecure setup for a button the header created (called from RF.INIT).
function RF.Setup(b)
  T.Panel(b)
  addParts(b)
  b:RegisterForClicks("AnyUp")
  b:HookScript("OnAttributeChanged", onAttributeChanged)
  b:HookScript("OnShow", RF.Update)
  RF.buttons[#RF.buttons + 1] = b
  for _, hook in ipairs(RF.setupHooks) do hook(b) end
  if RF.OnButtonCreated then RF.OnButtonCreated(b) end
end

-- Layout attributes: columns of five, one per group (or sorted by role).
local function layout(header, s)
  header:SetAttribute("groupBy", s.sortByRole and "ASSIGNEDROLE" or "GROUP")
  header:SetAttribute("groupingOrder", s.sortByRole and "TANK,HEALER,DAMAGER,NONE" or "1,2,3,4,5,6,7,8")
  header:SetAttribute("maxColumns", 8)
  header:SetAttribute("unitsPerColumn", 5)
  header:SetAttribute("columnSpacing", s.spacing)
  header:SetAttribute("columnAnchorPoint", "LEFT")
  header:SetAttribute("point", "TOP")
  header:SetAttribute("yOffset", -s.spacing)
end

-- Which groups show: raid always, party and yourself by setting.
local function membership(header, s)
  header:SetAttribute("showRaid", true)
  header:SetAttribute("showParty", s.showInParty)
  header:SetAttribute("showPlayer", s.showPlayer)
  header:SetAttribute("showSolo", false)
  RegisterAttributeDriver(header, "state-visibility", s.showInParty and "[group:raid] show; [group:party] show; hide" or "[group:raid] show; hide")
end

-- Creates all 40 buttons now, out of combat (shown briefly with a negative start index).
local function precreate(header)
  header:SetAttribute("startingIndex", 1 - MAX_UNITS)
  header:Show()
  header:SetAttribute("startingIndex", 1)
end

-- The secure group header, its button template and setup hook.
local function createHeader(s)
  local header = CreateFrame("Frame", "ForeverUI_Raid", UIParent, "SecureGroupHeaderTemplate")
  header:SetAttribute("template", "SecureUnitButtonTemplate")
  header:SetAttribute("fui-width", s.width)
  header:SetAttribute("fui-height", s.height)
  -- Called by RF.INIT (CallMethod) with the new button's name.
  header.initialConfigFunction = function(_, name) RF.Setup(_G[name]) end
  header:SetAttribute("initialConfigFunction", RF.INIT)
  layout(header, s)
  return header
end

local hiddenParent

-- Hides a default raid/party frame by parenting it to a hidden frame.
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetParent then return end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  f:SetParent(hiddenParent)
end

-- Builds the header, precreates its buttons and replaces the default frames.
local function build(s)
  RF.header = createHeader(s)
  ns.Mover(RF.header, "raid", "Raid frames", { "TOPLEFT", "TOPLEFT", 20, -220 })
  precreate(RF.header)
  membership(RF.header, s)
  if s.hideBlizzard then
    for _, name in ipairs(BLIZZARD_FRAMES) do hideBlizzard(name) end
  end
end

-- Module entry point (Core/Modules.lua): build out of combat, then listen.
function RF.Enable(settings)
  RF.settings = settings
  ns.OutOfCombat(function() build(settings) end)
  for _, e in ipairs({ "UNIT_HEALTH", "UNIT_MAXHEALTH", "UNIT_CONNECTION", "UNIT_NAME_UPDATE", "UNIT_FACTION" }) do ns.On(e, onUnitEvent) end
  for _, e in ipairs({ "GROUP_ROSTER_UPDATE", "PLAYER_ROLES_ASSIGNED", "PLAYER_ENTERING_WORLD" }) do ns.On(e, RF.UpdateAll) end
end
