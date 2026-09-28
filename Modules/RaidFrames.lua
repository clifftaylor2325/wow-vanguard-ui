-- Raid frames: up to 40 players in a grid, one column per group (or sorted
-- by role), built on the client's secure group header so the roster can
-- change in combat. Each button shows class-colored health (softened into
-- the panel color by default, so the outlined name stays readable), a role
-- letter and the name on the top row, then Dead / Offline or the missing
-- health on the second, and a thin power bar along the bottom. With
-- showInParty on, these frames also cover your party (and the party frames
-- in UnitFrames aren't built).
--
-- All 40 buttons are created up front, out of combat, so click casting and
-- hover keys (Modules/ClickCast.lua) can be set on every one of them safely.

local ADDON, ns = ...

local T = ns.Theme

local RF = ns.Module("RaidFrames", {
  defaults = { width = 90, height = 40, spacing = 4, showInParty = true, showPlayer = true, sortByRole = false, hideBlizzard = true, look = "soft", showPower = true },
})

local MAX_UNITS = 40
-- The class color's share of a softened bar; the rest is the panel color.
local SOFT = 0.55
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

-- Missing health as short text ("-16K"); "" at full health, or when the client
-- keeps the values secret (in instanced combat), since they can't be subtracted.
function RF.Deficit(unit)
  local health, max = ns.PlainNumber(UnitHealth(unit)), ns.PlainNumber(UnitHealthMax(unit))
  if not health or not max or health >= max then return "" end
  local missing = max - health
  return "-" .. (type(AbbreviateNumbers) == "function" and AbbreviateNumbers(missing) or tostring(missing))
end

-- A class color mixed into the panel color (SOFT of the class color).
function RF.Soften(r, g, b)
  local pr, pg, pb = T.RGB("panel")
  return r * SOFT + pr * (1 - SOFT), g * SOFT + pg * (1 - SOFT), b * SOFT + pb * (1 - SOFT)
end

-- Updating ---------------------------------------------------------------------------------

-- Role letter and name on the top row; Dead / Offline, else the missing health, below.
local function updateTexts(b, unit)
  b.name:SetText(UnitName(unit))
  b.role:SetText(RF.RoleLetter(unit))
  -- DownState, not the health text: that text can be a secret string, and
  -- comparing a secret errors ("attempt to compare ... a secret string value").
  local down = unitFrames().DownState(unit)
  b.down = down ~= nil
  b.status:SetText(down or RF.Deficit(unit))
  T.Color(b.status, down == "Dead" and "bad" or "text2")
end

-- Colors by look: softened class bars (default) or bright ones, both with light
-- names; or dark bars with class-colored names.
local function paintHealth(b, unit)
  local r, g, bl = unitFrames().HealthColor(unit)
  if RF.settings.look == "dark" then
    T.BarColor(b.health, "darkBar")
    return b.name:SetTextColor(r, g, bl)
  end
  if RF.settings.look == "soft" then r, g, bl = RF.Soften(r, g, bl) end
  b.health:SetStatusBarColor(r, g, bl)
  T.Color(b.name, "text")
end

-- The thin power bar: value, maximum and power color, or hidden when turned off.
local function updatePower(b, unit)
  b.power:SetShown(RF.settings.showPower == true)
  if not RF.settings.showPower then return end
  b.power:SetMinMaxValues(0, UnitPowerMax(unit))
  b.power:SetValue(UnitPower(unit))
  b.power:SetStatusBarColor(unitFrames().PowerColor(unit))
end

-- Health bar, colors, texts and power for one button's unit.
function RF.Update(b)
  local unit = b:GetAttribute("unit")
  if not unit or not UnitExists(unit) then return end
  b.health:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(b.health, UnitHealth(unit))
  paintHealth(b, unit)
  updateTexts(b, unit)
  updatePower(b, unit)
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

-- Top row: the role letter, then the name, which stops short of the ready check
-- (top right) and ends in "..." when it's too long. All outlined over the bar.
local function addTopRow(b)
  b.role = T.Text(b.health:CreateFontString(nil, "OVERLAY"), "barName", "text2")
  b.role:SetPoint("TOPLEFT", 4, -5)
  b.name = T.Text(b.health:CreateFontString(nil, "OVERLAY"), "barName")
  b.name:SetPoint("TOPLEFT", b.role, "TOPRIGHT", 3, 0)
  b.name:SetPoint("RIGHT", -18, 0)
  b.name:SetJustifyH("LEFT")
  b.name:SetWordWrap(false)
end

-- Second row, left: Dead / Offline or the missing health.
local function addStatus(b)
  b.status = T.Text(b.health:CreateFontString(nil, "OVERLAY"), "barSmall", "text2")
  b.status:SetPoint("TOPLEFT", 4, -19)
  b.status:SetJustifyH("LEFT")
end

-- A 3 px power bar along the bottom edge.
local function addPower(b)
  b.power = T.StyleBar(CreateFrame("StatusBar", nil, b.health))
  b.power:SetPoint("BOTTOMLEFT")
  b.power:SetPoint("BOTTOMRIGHT")
  b.power:SetHeight(3)
end

-- The health bar filling the button, with its texts and power bar.
local function addParts(b)
  b.health = T.StyleBar(CreateFrame("StatusBar", nil, b))
  b.health:SetPoint("TOPLEFT", 1, -1)
  b.health:SetPoint("BOTTOMRIGHT", -1, 1)
  addTopRow(b)
  addStatus(b)
  addPower(b)
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
local UNIT_EVENTS = { "UNIT_HEALTH", "UNIT_MAXHEALTH", "UNIT_CONNECTION", "UNIT_NAME_UPDATE", "UNIT_FACTION",
  "UNIT_POWER_UPDATE", "UNIT_MAXPOWER", "UNIT_DISPLAYPOWER" }

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

-- Carries a dark style chosen before `look` existed over to `look`, then drops
-- the old key (so this runs once per profile).
local function migrateStyle(s)
  if s.style == "dark" then s.look = "dark" end
  s.style = nil
end

-- Module entry point (Core/Modules.lua): build out of combat, then listen.
function RF.Enable(settings)
  RF.settings = settings
  migrateStyle(settings)
  ns.OutOfCombat(function() build(settings) end)
  for _, e in ipairs(UNIT_EVENTS) do ns.On(e, onUnitEvent) end
  for _, e in ipairs({ "GROUP_ROSTER_UPDATE", "PLAYER_ROLES_ASSIGNED", "PLAYER_ENTERING_WORLD" }) do ns.On(e, RF.UpdateAll) end
end
