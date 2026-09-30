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
  defaults = { width = 100, height = 48, spacing = 4, showInParty = true, showPlayer = true, sortByRole = false, hideBlizzard = true, look = "soft", showPower = true },
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
-- Tiles by the unit token the group header gave them (see RF.ForUnit).
RF.byUnit = {}

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

-- True when two unit tokens name the same unit (a hidden answer counts as no).
function RF.Same(a, b)
  local same = type(UnitIsUnit) == "function" and UnitIsUnit(a, b)
  return not ns.IsSecret(same) and same == true
end

-- True when a unit is your target (a hidden answer counts as no).
local function isTarget(unit)
  return RF.Same(unit, "target")
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
-- names; or dark bars with class-colored names. The dead and offline get a dark bar.
local function paintHealth(b, unit)
  local r, g, bl = unitFrames().HealthColor(unit)
  if b.down then return T.BarColor(b.health, "darkBar") end
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
  updateTexts(b, unit)
  paintHealth(b, unit)
  updatePower(b, unit)
  RF.PaintEdge(b, unit)
  for _, hook in ipairs(RF.updateHooks) do hook(b, unit) end
end

-- The tile's own edge: accent on your target, the theme's otherwise.
function RF.PaintEdge(b, unit)
  T.SetBorder(b, isTarget(unit) and { T.Accent() } or nil)
end

-- Every button currently showing a unit.
function RF.UpdateAll()
  for _, b in ipairs(RF.buttons) do
    if b:IsShown() then RF.Update(b) end
  end
end

-- Runs fn(tile, unit) for the shown tile showing this unit token, if any.
-- The client sends a unit event for each token that names the unit (raid3,
-- target...), so the tile's own token is enough, as for the game's raid frames.
function RF.ForUnit(unit, fn)
  local b = unit and RF.byUnit[unit]
  if b and b:IsShown() then fn(b, unit) end
end

-- A unit event: refresh the tile showing that unit.
local function onUnitEvent(_, unit)
  RF.ForUnit(unit, RF.Update)
end

-- Zones ------------------------------------------------------------------------------------
-- A tile is laid out in zones that never overlap (tested at several sizes and
-- text scales): the name row at the top, the missing-buff mark in the top-right
-- corner, the status line under the name (or at the name row's right when the
-- tile is too short), debuffs bottom left, your HoTs bottom right, the power
-- bar along the bottom. Ready check and resurrection come and go in the center.
-- Rects are { x, y, w, h } from the tile's top-left, y growing down.

RF.POWER = 3
local CORNER = 10

-- A text role's line height: its size (text scale included) and a pixel of air each side.
local function lineHeight(role)
  return T.RoleSize(role) + 2
end

-- The icon strip: icon size from the tile's height, how many fit each side, and its top.
local function strip(w, h)
  local icon = math.max(10, math.min(18, math.floor(h * 0.3)))
  local per = math.max(1, math.min(3, math.floor((w / 2 - 3) / (icon + 1))))
  return icon, per, h - 1 - RF.POWER - 1 - icon
end

-- The name row and status line: status under the name when it fits above the
-- icon strip, else at the right of the name row. The fifth field is its justification.
local function textZones(z, w, top)
  local nameH, statusH = lineHeight("barName"), lineHeight("barSmall")
  if top - (4 + nameH) >= statusH then
    z.name, z.status = { 4, 4, w - 20, nameH }, { 4, 4 + nameH, w - 8, statusH, "CENTER" }
  else
    z.name, z.status = { 4, 4, w - 52, nameH }, { w - 44, 4, 28, statusH, "RIGHT" }
  end
end

-- Every zone of a w x h tile.
function RF.Zones(w, h)
  local icon, per, top = strip(w, h)
  local rowW = per * (icon + 1) - 1
  local z = { icon = icon, per = per, missing = { w - 3 - CORNER, 3, CORNER, CORNER }, power = { 1, h - 1 - RF.POWER, w - 2, RF.POWER } }
  z.debuffs, z.hots = { 2, top, rowW, icon }, { w - 2 - rowW, top, rowW, icon }
  textZones(z, w, top)
  return z
end

-- The zones of the tiles at the set size.
function RF.TileZones()
  return RF.Zones(RF.settings.width, RF.settings.height)
end

-- Building ---------------------------------------------------------------------------------

-- Top row: the role letter, then the name, which stops at its zone's edge and
-- ends in "..." when it's too long. All outlined over the bar.
local function addTopRow(b, z)
  b.role = T.Text(b.health:CreateFontString(nil, "OVERLAY"), "barName", "text2")
  b.role:SetPoint("TOPLEFT", b, "TOPLEFT", z.name[1], -z.name[2])
  b.name = T.Text(b.health:CreateFontString(nil, "OVERLAY"), "barName")
  b.name:SetPoint("TOPLEFT", b.role, "TOPRIGHT", 3, 0)
  b.name:SetPoint("TOPRIGHT", b, "TOPLEFT", z.name[1] + z.name[3], -z.name[2])
  b.name:SetJustifyH("LEFT")
  b.name:SetWordWrap(false)
end

-- The status line: Dead / Offline or the missing health.
local function addStatus(b, z)
  b.status = T.Text(b.health:CreateFontString(nil, "OVERLAY"), "barSmall", "text2")
  b.status:SetPoint("TOPLEFT", b, "TOPLEFT", z.status[1], -z.status[2])
  b.status:SetWidth(z.status[3])
  b.status:SetJustifyH(z.status[5])
end

-- The layer above everything on the tile (auras included) for marks, and a
-- faint wash while the mouse is over the tile.
local function addOverlay(b)
  b.overlay = CreateFrame("Frame", nil, b)
  b.overlay:SetAllPoints()
  b.overlay:SetFrameLevel(b:GetFrameLevel() + 20)
  b.hover = T.Tint(T.Snap(b.overlay:CreateTexture(nil, "BACKGROUND")), "hover")
  b.hover:SetTexture(T.WHITE)
  b.hover:SetAllPoints(b.health)
  b.hover:Hide()
end

-- A 3 px power bar along the bottom edge.
local function addPower(b)
  b.power = T.StyleBar(CreateFrame("StatusBar", nil, b.health))
  b.power:SetPoint("BOTTOMLEFT")
  b.power:SetPoint("BOTTOMRIGHT")
  b.power:SetHeight(3)
end

-- The health bar filling the button, with its texts, power bar and overlay.
local function addParts(b)
  local z = RF.TileZones()
  b.health = T.StyleBar(CreateFrame("StatusBar", nil, b))
  b.health:SetPoint("TOPLEFT", 1, -1)
  b.health:SetPoint("BOTTOMRIGHT", -1, 1)
  addTopRow(b, z)
  addStatus(b, z)
  addPower(b)
  addOverlay(b)
end

-- Moves a tile to its new unit token in RF.byUnit. The tile showing you is
-- also filed under "player", since your own events name you that way.
local function track(b, unit)
  if b.tracked and RF.byUnit[b.tracked] == b then RF.byUnit[b.tracked] = nil end
  if RF.byUnit.player == b then RF.byUnit.player = nil end
  b.tracked = unit
  if unit then RF.byUnit[unit] = b end
  if unit and RF.Same(unit, "player") then RF.byUnit.player = b end
end

-- A button's unit changed (roster change): track it and refresh it.
local function onAttributeChanged(b, name, value)
  if name ~= "unit" then return end
  track(b, value)
  RF.Update(b)
end

-- A button's scripts: clicks, follow its unit, refresh on show, light on hover.
local function addScripts(b)
  b:RegisterForClicks("AnyUp")
  b:HookScript("OnAttributeChanged", onAttributeChanged)
  b:HookScript("OnShow", RF.Update)
  b:HookScript("OnEnter", function() b.hover:Show() end)
  b:HookScript("OnLeave", function() b.hover:Hide() end)
end

-- Insecure setup for a button the header created (called from RF.INIT).
function RF.Setup(b)
  T.Panel(b)
  addParts(b)
  addScripts(b)
  RF.buttons[#RF.buttons + 1] = b
  track(b, b:GetAttribute("unit"))
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
  for _, e in ipairs({ "GROUP_ROSTER_UPDATE", "PLAYER_ROLES_ASSIGNED", "PLAYER_ENTERING_WORLD", "PLAYER_TARGET_CHANGED" }) do ns.On(e, RF.UpdateAll) end
end
