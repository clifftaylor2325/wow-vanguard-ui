-- Nameplates in the ForeverUI look: a flat health bar in the unit's class
-- or reaction color (or its threat color while you have aggro), the name
-- above it with its level (colored by how hard it is for you), your debuffs over the name, the raid target icon to the left,
-- a cast bar under it, and an accent border on your target.
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
  defaults = { width = 130, height = 10, level = true, threat = true, castBar = true, debuffs = 4, targetBorder = true, timers = true },
})

local ICON = 18

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

-- True when the unit is your target (hidden counts as no).
local function isTarget(unit)
  local same = UnitIsUnit(unit, "target")
  return not ns.IsSecret(same) and same == true
end

-- Building ---------------------------------------------------------------------------------

-- The name above the bar (its level just left of it), the raid icon to its left, and the target glow around it.
local function addTexts(f)
  f.name = T.Text(f:CreateFontString(nil, "OVERLAY"), "world")
  f.name:SetPoint("BOTTOM", f, "TOP", 0, 3)
  f.level = T.Text(f:CreateFontString(nil, "OVERLAY"), "world")
  f.level:SetPoint("RIGHT", f.name, "LEFT", -3, 0)
  f.glow = T.Glow(f, 6)
  f.raidIcon = f:CreateTexture(nil, "OVERLAY")
  f.raidIcon:SetSize(ICON, ICON)
  f.raidIcon:SetPoint("RIGHT", f, "LEFT", -4, 0)
  f.raidIcon:Hide()
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

-- Our frame on a client nameplate: health bar, texts, debuffs, cast bar.
local function build(plate)
  local s = NP.settings
  local f = CreateFrame("StatusBar", nil, plate)
  f:SetSize(s.width, s.height)
  f:SetPoint("CENTER")
  T.Panel(T.StyleBar(f), { inset = true })
  addTexts(f)
  addDebuffs(f)
  if s.castBar then addCastBar(f, s) end
  table.insert(NP.built, f)
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

-- Health bar, color, name and level, raid icon and target border.
function NP.Update(f, unit)
  f:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(f, UnitHealth(unit))
  f:SetStatusBarColor(NP.Color(unit))
  f.name:SetText(UnitName(unit))
  updateLevel(f, unit)
  RS.PaintIcon(f.raidIcon, RS.RaidIcon(unit))
  local target = NP.settings.targetBorder and isTarget(unit)
  T.SetBorder(f, target and { T.Accent() } or nil)
  T.ShowGlow(f.glow, target)
end

-- Points the debuff row at the plate's unit (the client reuses plates for other units).
function NP.UpdateAuras(f, unit)
  f.debuffs:SetUnit(unit)
end

-- Everything on one plate.
local function refresh(f, unit)
  NP.Update(f, unit)
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
  plate.fui:Show()
  refresh(plate.fui, unit)
end

-- A nameplate went away: forget it (the client reuses the plate).
local function onRemoved(_, unit)
  local f = NP.plates[unit]
  if f then f:Hide(); f.unit = nil; f.debuffs:SetUnit(nil) end
  NP.plates[unit] = nil
end

-- Runs fn(frame, unit) for one unit's plate, if we drew on it.
local function forUnit(fn)
  return function(_, unit)
    local f = NP.plates[unit]
    if f then fn(f, unit) end
  end
end

-- After a login or reload: pick up the plates already on screen.
local function scan()
  for i = 1, 40 do
    local unit = "nameplate" .. i
    if UnitExists(unit) and not NP.plates[unit] then onAdded(nil, unit) end
  end
end

-- Event -> handler.
local EVENTS = {
  PLAYER_ENTERING_WORLD = scan,
  NAME_PLATE_UNIT_ADDED = onAdded, NAME_PLATE_UNIT_REMOVED = onRemoved,
  UNIT_HEALTH = forUnit(NP.Update), UNIT_MAXHEALTH = forUnit(NP.Update), UNIT_NAME_UPDATE = forUnit(NP.Update),
  UNIT_FACTION = forUnit(NP.Update), UNIT_THREAT_LIST_UPDATE = forUnit(NP.Update), UNIT_LEVEL = forUnit(NP.Update),
  PLAYER_TARGET_CHANGED = function() each(NP.Update) end, RAID_TARGET_UPDATE = function() each(NP.Update) end,
  -- Your new level changes how hard every unit is for you.
  PLAYER_LEVEL_UP = function() each(NP.Update) end,
  PLAYER_REGEN_ENABLED = upgradeDebuffs,
}

-- A cast event: show it on that unit's plate.
local onCast = forUnit(function(f, unit) if f.cast then CB.Show(f.cast, unit) end end)

-- Module entry point (Core/Modules.lua).
function NP.Enable(settings)
  NP.settings = settings
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
  for _, event in ipairs(CB.EVENTS) do ns.On(event, onCast) end
end

-- Options ------------------------------------------------------------------------------------

-- get/set for one of this module's settings; reload says it applies after a reload.
local function setting(key, reload)
  return function() return ns.Settings("Nameplates", NP.defaults)[key] end,
    function(v)
      ns.Settings("Nameplates", NP.defaults)[key] = v
      if reload then ns.Options.NeedReload() else each(refresh) end
    end
end

-- The Nameplates page: looks first, then debuffs and size (both after a reload).
function NP.OptionRows()
  return {
    { "header", "Nameplates" },
    { "text", "Turn the whole module off under Modules to keep the default plates." },
    { "check", "Levels, colored by how hard the unit is for you", setting("level") },
    { "check", "Threat colors while you have aggro", setting("threat") },
    { "check", "Accent border on your target", setting("targetBorder") }, { "check", "Cast bar", setting("castBar", true) },
    { "cycle", "Your debuffs shown", { { 0, "none" }, { 4, "4" }, { 6, "6" } }, setting("debuffs", true) },
    { "check", "Timer numbers on your debuffs (reload)", setting("timers", true) },
    { "cycle", "Width", { { 110, "110" }, { 130, "130" }, { 160, "160" } }, setting("width", true) },
    { "cycle", "Height", { { 8, "8" }, { 10, "10" }, { 14, "14" } }, setting("height", true) } }
end

ns.Options.AddPage({
  key = "nameplates",
  title = "Nameplates",
  icon = "Nameplates",
  order = 70,
  rows = function() return NP.OptionRows() end,
})
