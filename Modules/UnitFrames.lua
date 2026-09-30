-- Unit frames: player, target, target of target, focus, pet and party 1-4.
-- Each is a secure unit button (click to target, right-click for the unit
-- menu) with a health bar, power bar, name and health text, in the theme.
--
-- Midnight hides some unit values from addons ("secret values"). They can
-- be handed to bars and font strings but not compared or computed with, so
-- this file never does arithmetic on health or power: bars get the raw
-- values, and text is formatted only when the value isn't secret.

local ADDON, ns = ...

local T = ns.Theme

local UF = ns.Module("UnitFrames", {
  defaults = { hideBlizzard = true, healthText = true, powerHeight = 6 },
})

-- Target classification -> the color of its diamond (none for normal units).
local CLASSIFICATION = { elite = "gold", rareelite = "accent", rare = "text2", worldboss = "bad" }

-- key, unit, size, label and default point (on UIParent) for each frame.
local LAYOUT = {
  { key = "player", unit = "player", w = 220, h = 38, label = "Player", point = { "CENTER", "CENTER", -260, -170 } },
  { key = "target", unit = "target", w = 220, h = 38, label = "Target", point = { "CENTER", "CENTER", 260, -170 } },
  { key = "targettarget", unit = "targettarget", w = 120, h = 24, label = "Target of target", point = { "CENTER", "CENTER", 430, -200 } },
  { key = "focus", unit = "focus", w = 160, h = 30, label = "Focus", point = { "CENTER", "CENTER", -260, -60 } },
  { key = "pet", unit = "pet", w = 120, h = 24, label = "Pet", point = { "CENTER", "CENTER", -300, -210 } },
}
local PARTY_SIZE = 4
local PARTY = { w = 160, h = 32, gap = 10, label = "Party", point = { "TOPLEFT", "TOPLEFT", 20, -220 } }

-- Blizzard frames replaced when hideBlizzard is on (only those this client has).
local BLIZZARD_FRAMES = { "PlayerFrame", "TargetFrame", "FocusFrame", "PetFrame", "PartyFrame" }


UF.frames = {}

-- Values ---------------------------------------------------------------------------------

local isSecret = ns.IsSecret

-- A plain boolean from an API that may return a secret: secrets count as false.
local function flag(value)
  return not isSecret(value) and value == true
end

-- The color for a unit's reaction to the player (hostile, neutral, friendly).
local function reactionColor(unit)
  local reaction = UnitReaction and UnitReaction(unit, "player")
  if isSecret(reaction) or type(reaction) ~= "number" then
    return T.TOKENS.unknown
  end
  return T.TOKENS[reaction <= 3 and "hostile" or reaction == 4 and "neutral" or "friendly"]
end

-- r, g, b for a unit's health bar: class color for players, reaction otherwise.
function UF.HealthColor(unit)
  if flag(UnitIsPlayer(unit)) then
    local _, class = UnitClass(unit)
    local c = not isSecret(class) and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
    if c then
      return c.r, c.g, c.b
    end
  end
  local c = reactionColor(unit)
  return c[1], c[2], c[3]
end

-- Power types with a ForeverUI color; others use the client's PowerBarColor.
local POWER_TOKENS = { MANA = "mana", RAGE = "rage", ENERGY = "energy", FOCUS = "focus" }

-- r, g, b for a unit's power bar (mana, rage, energy...).
function UF.PowerColor(unit)
  local _, token = UnitPowerType(unit)
  if isSecret(token) or type(token) ~= "string" then return T.RGB("mana") end
  if POWER_TOKENS[token] then return T.RGB(POWER_TOKENS[token]) end
  local c = PowerBarColor and PowerBarColor[token]
  if c then return c.r, c.g, c.b end
  return T.RGB("mana")
end

-- A number as short text (12.3K). Secret values go to the client's own
-- formatter when there is one, since only it may read them.
local function shortNumber(value)
  if type(AbbreviateNumbers) == "function" then
    local ok, text = pcall(AbbreviateNumbers, value)
    if ok then
      return text
    end
  end
  return not isSecret(value) and tostring(value) or ""
end

-- True for a player who is known to be offline (secret or unknown counts as online).
local function isOffline(unit)
  if not UnitIsConnected or not flag(UnitIsPlayer(unit)) then
    return false
  end
  local connected = UnitIsConnected(unit)
  return not isSecret(connected) and connected == false
end

-- "Dead", "Offline", or nil when the unit is neither. Safe with secret
-- values: they count as neither, and nothing secret is compared.
function UF.DownState(unit)
  if flag(UnitIsDeadOrGhost(unit)) then
    return "Dead"
  end
  return isOffline(unit) and "Offline" or nil
end

-- Health as a percent ("84%"), from the client's own percent with its 0-100
-- curve, so it works while health is hidden; nil where the client can't.
local function percentText(unit)
  local get, curve = _G.UnitHealthPercent, _G.CurveConstants and _G.CurveConstants.ScaleTo100
  if type(get) ~= "function" or not curve then return nil end
  local ok, text = pcall(function() return string.format("%d%%", get(unit, true, curve)) end)
  return ok and text or nil
end

-- The health text: Dead, Offline, else the percent (if chosen) or current
-- health shortened. Either may itself be secret: show it, never compare it.
function UF.HealthText(unit)
  local percent = UF.settings and UF.settings.healthFormat == "percent" and percentText(unit)
  return UF.DownState(unit) or percent or shortNumber(UnitHealth(unit))
end

-- The unit's level as text ("??" for a boss or a level too far above you), or "".
function UF.LevelText(unit)
  local level = ns.PlainNumber(type(UnitLevel) == "function" and UnitLevel(unit) or nil)
  if not level then return "" end
  return level < 1 and "??" or tostring(level)
end

-- The color token of a unit's classification diamond, or nil for a normal unit.
function UF.ClassToken(unit)
  local kind = type(UnitClassification) == "function" and UnitClassification(unit) or nil
  return not ns.IsSecret(kind) and CLASSIFICATION[kind] or nil
end

-- Building ------------------------------------------------------------------------------

-- A themed status bar filling part of a unit frame.
local function createBar(parent)
  local bar = T.StyleBar(CreateFrame("StatusBar", nil, parent))
  bar:SetMinMaxValues(0, 1)
  bar.bg = bar:CreateTexture(nil, "BACKGROUND")
  bar.bg:SetAllPoints()
  bar.bg:SetColorTexture(T.RGB("shade"))
  return bar
end

-- A font string in a text role on a unit frame's health bar.
local function createText(f, role, point, x)
  local fs = T.Text(f.health:CreateFontString(nil, "OVERLAY"), role)
  fs:SetPoint(point, f.health, point, x, 0)
  return fs
end

-- Lays out the bars inside a frame: health on top, power along the bottom.
local function layoutBars(f, powerHeight)
  f.health:SetPoint("TOPLEFT", 1, -1)
  f.health:SetPoint("BOTTOMRIGHT", -1, powerHeight + 2)
  f.power:SetPoint("TOPLEFT", f.health, "BOTTOMLEFT", 0, -1)
  f.power:SetPoint("BOTTOMRIGHT", -1, 1)
end

-- The secure part: which unit, left-click targets, right-click opens the menu.
local function makeSecure(f, unit)
  f:SetAttribute("unit", unit)
  f:SetAttribute("*type1", "target")
  f:SetAttribute("*type2", "togglemenu")
  f:RegisterForClicks("AnyUp")
end

-- The level left of the name (where levels are shown).
local function addLevel(f)
  f.level = createText(f, "name", "LEFT", 4)
  f.name:ClearAllPoints()
  f.name:SetPoint("LEFT", f.level, "RIGHT", 4, 0)
end

-- A small diamond (the ForeverUI mark) over the top-right corner: elite, rare or boss.
local function addClassMark(f)
  f.class = T.Snap(f.health:CreateTexture(nil, "OVERLAY"))
  f.class:SetTexture(T.Texture("LogoLeft"))
  f.class:SetSize(14, 14)
  f.class:SetPoint("CENTER", f, "TOPRIGHT", -2, -2)
  f.class:Hide()
end

-- Creates one unit frame (a secure unit button) with its bars and texts.
local function createUnitFrame(key, unit, w, h, settings)
  local f = CreateFrame("Button", "ForeverUI_" .. key, UIParent, "SecureUnitButtonTemplate")
  f.unit, f.key = unit, key
  f:SetSize(w, h)
  makeSecure(f, unit)
  T.Panel(f, { shadow = true })
  f.health, f.power = createBar(f), createBar(f)
  layoutBars(f, settings.powerHeight)
  f.name, f.healthText = createText(f, "name", "LEFT", 4), createText(f, "number", "RIGHT", -4)
  if settings.showLevel then addLevel(f) end
  return f
end

-- Updating ------------------------------------------------------------------------------

-- Health bar value, color and text. Raw values go straight to the bar.
function UF.UpdateHealth(f)
  local unit = f.unit
  f.health:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(f.health, UnitHealth(unit))
  f.health:SetStatusBarColor(UF.HealthColor(unit))
  f.healthText:SetText(UF.settings.healthText and UF.HealthText(unit) or "")
end

-- Power bar value and color.
function UF.UpdatePower(f)
  local unit = f.unit
  f.power:SetMinMaxValues(0, UnitPowerMax(unit))
  T.SetBarValue(f.power, UnitPower(unit))
  f.power:SetStatusBarColor(UF.PowerColor(unit))
end

-- The level, colored by how hard the unit is for you (the client's color).
local function updateLevel(f)
  f.level:SetText(UF.LevelText(f.unit))
  local get = _G.GetCreatureDifficultyColor
  local c = type(get) == "function" and ns.PlainNumber(UnitLevel(f.unit)) and get(UnitLevel(f.unit))
  if c then f.level:SetTextColor(c.r, c.g, c.b) else T.Color(f.level, "text2") end
end

-- The classification diamond: shown in its color for elite, rare and boss units.
local function updateClass(f)
  local token = UF.ClassToken(f.unit)
  f.class:SetShown(token ~= nil)
  if token then T.Tint(f.class, token) end
end

-- The unit's name (passed through as is: it may be secret, and nil clears),
-- its level and its classification where the frame shows them.
function UF.UpdateName(f)
  f.name:SetText(UnitName(f.unit))
  if f.level then updateLevel(f) end
  if f.class then updateClass(f) end
end

-- Everything on a frame, if its unit exists.
function UF.UpdateFrame(f)
  if not flag(UnitExists(f.unit)) then
    return
  end
  UF.UpdateHealth(f)
  UF.UpdatePower(f)
  UF.UpdateName(f)
end

-- Unit event -> what it updates.
local UNIT_EVENTS = {
  UNIT_HEALTH = UF.UpdateHealth,
  UNIT_MAXHEALTH = UF.UpdateHealth,
  UNIT_CONNECTION = UF.UpdateHealth,
  UNIT_FACTION = UF.UpdateHealth,
  UNIT_POWER_UPDATE = UF.UpdatePower,
  UNIT_MAXPOWER = UF.UpdatePower,
  UNIT_DISPLAYPOWER = UF.UpdatePower,
  UNIT_NAME_UPDATE = UF.UpdateName,
}

-- Frame OnEvent: a unit event for this frame's unit.
local function onUnitEvent(f, event)
  UNIT_EVENTS[event](f)
end

-- Listens for its own unit's events (RegisterUnitEvent filters by unit).
local function listen(f)
  for event in pairs(UNIT_EVENTS) do
    f:RegisterUnitEvent(event, f.unit)
  end
  f:SetScript("OnEvent", onUnitEvent)
end

-- Target of target has no events of its own; refresh it a few times a second.
local function pollTargetOfTarget(f)
  local elapsed = 0
  f:SetScript("OnUpdate", function(self, dt)
    elapsed = elapsed + dt
    if elapsed >= 0.2 then
      elapsed = 0
      UF.UpdateFrame(self)
    end
  end)
end

-- Updates every frame whose key is listed (all frames with no list).
function UF.Refresh(keys)
  for key, f in pairs(UF.frames) do
    if not keys or keys[key] then
      UF.UpdateFrame(f)
    end
  end
end

-- Global event -> which frames it refreshes (nil = all).
local GLOBAL_EVENTS = {
  PLAYER_ENTERING_WORLD = false,
  PLAYER_TARGET_CHANGED = { target = true, targettarget = true },
  PLAYER_FOCUS_CHANGED = { focus = true },
  UNIT_PET = { pet = true },
  GROUP_ROSTER_UPDATE = { party1 = true, party2 = true, party3 = true, party4 = true },
}

-- Refreshes the frames a global event affects.
local function onGlobalEvent(event)
  UF.Refresh(GLOBAL_EVENTS[event] or nil)
end

-- Setup ---------------------------------------------------------------------------------

-- Shows the frame while its unit exists (the client does this securely).
local function watch(f)
  if f.unit ~= "player" and type(RegisterUnitWatch) == "function" then
    RegisterUnitWatch(f)
  end
end

-- Creates, places and wires one frame.
local function addFrame(key, unit, w, h, label, point)
  local f = createUnitFrame(key, unit, w, h, UF.settings)
  if key == "target" or key == "focus" then addClassMark(f) end
  UF.frames[key] = f
  listen(f)
  watch(f)
  if point then
    ns.Mover(f, "uf_" .. key, label, point)
  end
  return f
end

-- True when the raid frames module also shows the party, so these party frames aren't built.
function UF.RaidCoversParty()
  local raid = ns.GetModule("RaidFrames")
  return raid ~= nil and ns.ModuleEnabled("RaidFrames") and ns.Settings("RaidFrames", raid.defaults).showInParty == true
end

-- Party 1-4: the first is movable, the rest stack below it.
local function addParty()
  local first = addFrame("party1", "party1", PARTY.w, PARTY.h, PARTY.label, PARTY.point)
  local prev = first
  for i = 2, PARTY_SIZE do
    local f = addFrame("party" .. i, "party" .. i, PARTY.w, PARTY.h)
    f:SetPoint("TOPLEFT", prev, "BOTTOMLEFT", 0, -PARTY.gap)
    prev = f
  end
end

local hiddenParent

-- Hides a Blizzard unit frame for good: no events, parented to a hidden frame.
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.UnregisterAllEvents then
    return
  end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  f:UnregisterAllEvents()
  f:Hide()
  f:SetParent(hiddenParent)
end

-- Builds every frame. Secure frames can't be set up in combat, so this waits.
local function build(settings)
  for _, def in ipairs(LAYOUT) do
    addFrame(def.key, def.unit, def.w, def.h, def.label, def.point)
  end
  if not UF.RaidCoversParty() then addParty() end
  pollTargetOfTarget(UF.frames.targettarget)
  if settings.hideBlizzard then
    for _, name in ipairs(BLIZZARD_FRAMES) do hideBlizzard(name) end
  end
  UF.Refresh()
end

-- WoW Forever players read levels and health percent on every frame (as its
-- own UI does), so a profile that hasn't chosen yet starts that way there.
local function clientDefaults(settings)
  if settings.showLevel == nil then settings.showLevel = ns.IsForever() end
  if settings.healthFormat == nil then settings.healthFormat = ns.IsForever() and "percent" or "value" end
end

-- Module entry point (Core/Modules.lua): build once out of combat, then listen.
function UF.Enable(settings)
  UF.settings = settings
  clientDefaults(settings)
  ns.OutOfCombat(function() build(settings) end)
  for event in pairs(GLOBAL_EVENTS) do
    ns.On(event, onGlobalEvent)
  end
end
