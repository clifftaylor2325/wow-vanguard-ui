-- Nameplates in the ForeverUI look: a flat health bar in the unit's class
-- or reaction color (or its threat color while you have aggro), the name
-- above it with its level (colored by how hard it is for you), your debuffs over the name, the raid target icon to the left,
-- a cast bar under it, an accent border on your target, and a gold "!" by the
-- name of units your quests need (when the client says so plainly).
--
-- ForeverUI draws its own frame on each nameplate the client gives it and
-- hides the default one; the client still places, sizes and stacks the
-- plates. Plates the client keeps from addons (forbidden ones, such as
-- friendly plates in some instances) are left as they are.
--
-- Written for WoW Forever. Health goes to the bar as the client gives it,
-- hidden or not. Threat and names are only read when they are plain.

local ADDON, ns = ...

local T = ns.Theme
local CB = ns.GetModule("CastBars")
local RS = ns.GetModule("RaidStatus")

local NP = ns.Module("Nameplates", {
  defaults = { width = 130, height = 10, level = true, threat = true, castBar = true, debuffs = 4, targetBorder = true, timers = true, questMarks = true },
})

local ICON = 18
-- The target marker's size (a diamond right of your target's plate).
NP.MARKER = 8
-- The quest mark's size (a "!" right of the name).
NP.QUEST = 12

NP.plates = {}
-- Every frame we built on a plate (the client reuses plates, so each gets one).
NP.built = {}

-- Values -----------------------------------------------------------------------------------

-- The client's nameplate for a unit, or nil (none, or kept from addons).
function NP.PlateFor(unit)
  local api = _G.C_NamePlate
  local plate = type(api) == "table" and api.GetNamePlateForUnit and api.GetNamePlateForUnit(unit)
  if type(plate) ~= "table" or (plate.IsForbidden and plate:IsForbidden()) then return nil end
  return plate
end

-- Your threat color on a unit, or nil when you have none (or it is hidden).
function NP.ThreatColor(unit)
  local status = type(UnitThreatSituation) == "function" and UnitThreatSituation("player", unit) or nil
  if ns.IsSecret(status) or type(status) ~= "number" or status < 1 then return nil end
  return T.TOKENS["threat" .. math.min(status, 3)]
end

-- The bar color: threat while you have aggro (if on), else class or reaction.
function NP.Color(unit)
  local threat = NP.settings.threat and NP.ThreatColor(unit)
  if threat then return threat[1], threat[2], threat[3] end
  return ns.GetModule("UnitFrames").HealthColor(unit)
end

-- True when one of your active quests needs the unit (a hidden answer counts as no).
function NP.QuestUnit(unit)
  local fn = C_QuestLog and C_QuestLog.UnitIsRelatedToActiveQuest
  local related = type(fn) == "function" and fn(unit)
  return not ns.IsSecret(related) and related == true
end

-- True when the unit is your target (hidden counts as no).
local function isTarget(unit)
  local same = UnitIsUnit(unit, "target")
  return not ns.IsSecret(same) and same == true
end

-- Building ---------------------------------------------------------------------------------

-- An accent diamond just right of the plate, shown on your target's plate.
local function addMarker(f)
  f.marker = T.Snap(f:CreateTexture(nil, "OVERLAY"))
  f.marker:SetTexture(T.Texture("Diamond"))
  f.marker:SetSize(NP.MARKER, NP.MARKER)
  f.marker:SetPoint("LEFT", f, "RIGHT", 4, 0)
  f.marker:Hide()
end

-- A gold "!" just right of the name, shown on units your quests need.
local function addQuestMark(f)
  f.quest = f:CreateTexture(nil, "OVERLAY")
  f.quest:SetTexture(T.Icon("Quests"))
  f.quest:SetSize(NP.QUEST, NP.QUEST)
  f.quest:SetPoint("LEFT", f.name, "RIGHT", 2, 0)
  T.Tint(f.quest, "gold")
  f.quest:Hide()
end

-- The name above the bar (its level just left of it, the quest mark just
-- right), the raid icon to its left and the target marker to its right.
local function addTexts(f)
  f.name = T.Text(f:CreateFontString(nil, "OVERLAY"), "world")
  f.name:SetPoint("BOTTOM", f, "TOP", 0, 3)
  f.level = T.Text(f:CreateFontString(nil, "OVERLAY"), "world")
  f.level:SetPoint("RIGHT", f.name, "LEFT", -3, 0)
  f.raidIcon = f:CreateTexture(nil, "OVERLAY")
  f.raidIcon:SetSize(ICON, ICON)
  f.raidIcon:SetPoint("RIGHT", f, "LEFT", -4, 0)
  f.raidIcon:Hide()
  addMarker(f)
  addQuestMark(f)
end

-- Your debuffs in a row over the name, soonest to expire first, with timers
-- (a plate is where you watch your damage over time): an aura container that
-- follows the plate's unit (Core/Auras.lua).
function NP.DebuffSpec(f, s)
  return { point = { "BOTTOMLEFT", f, "TOPLEFT", 0, 16 }, grow = "RIGHT", growY = "UP", lineSize = s.width, gap = 2, timer = s.timers, mouse = false,
    groups = { { filter = "HARMFUL|PLAYER|!CROWD_CONTROL", max = s.debuffs, size = ICON, debuff = true, sort = "ExpirationOnly" },
      { filter = "HARMFUL|PLAYER|CROWD_CONTROL", max = s.debuffs > 0 and 1 or 0, size = ICON, debuff = true } } }
end

-- The cast bar under the health bar; its icon (left of it) lines up with the plate's left edge.
local function addCastBar(f, s)
  f.cast = CB.Build(CreateFrame("StatusBar", nil, f), s.width - s.height - 3, s.height)
  f.cast:SetPoint("TOPRIGHT", f, "BOTTOMRIGHT", 0, -4)
end

-- A plate's debuff row on the backend in use, noting whether that was the
-- client's engine (a plate first drawn in combat gets the fallback).
local function addDebuffs(f)
  f.debuffs = ns.Auras.Container(f, NP.DebuffSpec(f, NP.settings), f.unit)
  f.debuffsOnEngine = ns.Auras.Backend() == ns.AuraEngine
end

-- Our frame on a client nameplate: health bar, texts, debuffs, cast bar, and
-- its own unit events (ns.SetUnits points them at the plate's unit).
local function build(plate)
  local s = NP.settings
  local f = CreateFrame("StatusBar", nil, plate)
  f:SetSize(s.width, s.height)
  f:SetPoint("CENTER")
  T.HudPanel(T.StyleBar(f), { inset = true })
  addTexts(f)
  addDebuffs(f)
  if s.castBar then addCastBar(f, s) end
  f.events, NP.built[#NP.built + 1] = ns.OnUnit(NP.UNIT_EVENTS, NP.OnUnitEvent), f
  return f
end

-- After a fight: plates first drawn in it got the fallback icons, so give
-- them the client's own aura container now that one can be made.
local function upgradeDebuffs()
  if not ns.AuraEngine.Available() then return end
  for _, f in ipairs(NP.built) do
    if not f.debuffsOnEngine then
      f.debuffs:SetUnit(nil)
      f.debuffs.frame:Hide()
      addDebuffs(f)
    end
  end
end

-- Hides the client's own frame on a plate, and keeps it hidden.
local function hideDefault(plate)
  local uf = plate.UnitFrame
  if type(uf) ~= "table" or not uf.Hide then return end
  uf:Hide()
  if not uf.fuiHooked then
    uf.fuiHooked = true
    uf:HookScript("OnShow", uf.Hide)
  end
end

-- Updating ---------------------------------------------------------------------------------

-- The level left of the name, where it's switched on.
local function updateLevel(f, unit)
  if NP.settings.level then return ns.GetModule("UnitFrames").PaintLevel(f.level, unit) end
  f.level:SetText("")
end

-- Health bar, color, name and level, raid icon, and your target's border and marker.
function NP.Update(f, unit)
  f:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(f, UnitHealth(unit))
  f:SetStatusBarColor(NP.Color(unit))
  f.name:SetText(UnitName(unit))
  updateLevel(f, unit)
  RS.PaintIcon(f.raidIcon, RS.RaidIcon(unit))
  local target = NP.settings.targetBorder and isTarget(unit)
  T.SetBorder(f, target and { T.Accent() } or nil)
  f.marker:SetShown(target == true)
  if target then T.Tint(f.marker, "accent") end
end

-- Shows a plate's quest mark while the unit is one your quests need (and the marks are on).
function NP.PaintQuest(f, unit)
  f.quest:SetShown(NP.settings.questMarks == true and NP.QuestUnit(unit))
end

-- Points the debuff row at the plate's unit (the client reuses plates for other units).
function NP.UpdateAuras(f, unit)
  f.debuffs:SetUnit(unit)
end

-- Everything on one plate.
local function refresh(f, unit)
  NP.Update(f, unit)
  NP.PaintQuest(f, unit)
  NP.UpdateAuras(f, unit)
  if f.cast then CB.Show(f.cast, unit) end
end

-- Runs fn(frame, unit) for every plate we drew on.
local function each(fn)
  for unit, f in pairs(NP.plates) do fn(f, unit) end
end

-- Events -----------------------------------------------------------------------------------

-- A nameplate appeared: draw on it (once per plate) and fill it in.
local function onAdded(_, unit)
  local plate = NP.PlateFor(unit)
  if not plate then return end
  plate.fui = plate.fui or build(plate)
  hideDefault(plate)
  NP.plates[unit] = plate.fui
  plate.fui.unit = unit
  ns.SetUnits(plate.fui.events, unit)
  plate.fui:Show()
  refresh(plate.fui, unit)
end

-- A nameplate went away: forget it (the client reuses the plate).
local function onRemoved(_, unit)
  local f = NP.plates[unit]
  if f then f:Hide(); f.unit = nil; f.debuffs:SetUnit(nil); ns.SetUnits(f.events) end
  NP.plates[unit] = nil
end

-- After a login or reload: pick up the plates already on screen.
local function scan()
  for i = 1, 40 do
    local unit = "nameplate" .. i
    if UnitExists(unit) and not NP.plates[unit] then onAdded(nil, unit) end
  end
end

-- Shows the unit's cast under its plate, where the plate has a cast bar.
local function showCast(f, unit)
  if f.cast then CB.Show(f.cast, unit) end
end

-- A plate's unit event -> what it repaints on that plate. Each plate asks the
-- client for its own unit's events only (ns.OnUnit), so 30 plates don't each
-- hear the other 29 (or the raid's).
local UNIT_HANDLERS = {
  UNIT_HEALTH = NP.Update, UNIT_MAXHEALTH = NP.Update, UNIT_NAME_UPDATE = NP.Update,
  UNIT_FACTION = NP.Update, UNIT_THREAT_LIST_UPDATE = NP.Update, UNIT_LEVEL = NP.Update,
}
for _, event in ipairs(CB.EVENTS) do UNIT_HANDLERS[event] = showCast end
NP.UNIT_EVENTS = {}
for event in pairs(UNIT_HANDLERS) do table.insert(NP.UNIT_EVENTS, event) end

-- A unit event for a plate's unit: repaint what it changed on that plate.
function NP.OnUnitEvent(event, unit)
  local f = NP.plates[unit]
  if f then UNIT_HANDLERS[event](f, unit) end
end

-- Event -> handler.
local EVENTS = {
  PLAYER_ENTERING_WORLD = scan,
  NAME_PLATE_UNIT_ADDED = onAdded, NAME_PLATE_UNIT_REMOVED = onRemoved,
  PLAYER_TARGET_CHANGED = function() each(NP.Update) end, RAID_TARGET_UPDATE = function() each(NP.Update) end,
  -- Your new level changes how hard every unit is for you.
  PLAYER_LEVEL_UP = function() each(NP.Update) end,
  PLAYER_REGEN_ENABLED = upgradeDebuffs,
  -- Your quests changed: which units they need may have too.
  QUEST_LOG_UPDATE = function() each(NP.PaintQuest) end,
}

-- Module entry point (Core/Modules.lua).
function NP.Enable(settings)
  NP.settings = settings
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
end

-- Options ------------------------------------------------------------------------------------

-- get/set for one of this module's settings, and its default; reload says it applies after a reload.
local function setting(key, reload)
  return function() return ns.Settings("Nameplates", NP.defaults)[key] end,
    function(v)
      ns.Settings("Nameplates", NP.defaults)[key] = v
      if reload then ns.Options.NeedReload() else each(refresh) end
    end, NP.defaults[key]
end

-- The Nameplates page: looks first, then debuffs and size (both after a reload).
function NP.OptionRows()
  return {
    { "header", "Nameplates" },
    { "text", "Turn the whole module off under Modules to keep the default plates." },
    { "check", "Levels, colored by how hard the unit is for you", setting("level") },
    { "check", "Threat colors while you have aggro", setting("threat") },
    { "check", "Accent border and marker on your target", setting("targetBorder") }, { "check", "Cast bar", setting("castBar", true) },
    { "check", "A gold ! by units your quests need", setting("questMarks") },
    { "cycle", "Your debuffs shown", { { 0, "none" }, { 4, "4" }, { 6, "6" } }, setting("debuffs", true) },
    { "check", "Timer numbers on your debuffs (reload)", setting("timers", true) },
    { "cycle", "Width", { { 110, "110" }, { 130, "130" }, { 160, "160" } }, setting("width", true) }, { "cycle", "Height", { { 8, "8" }, { 10, "10" }, { 14, "14" } }, setting("height", true) } }
end

ns.Options.AddPage({
  key = "nameplates",
  title = "Nameplates",
  icon = "Nameplates",
  order = 70,
  rows = function() return NP.OptionRows() end,
})
