-- The TEST-ONLY game world behind the WoW API the addon reads: units, auras,
-- action slots, spells, bags and money, quests, the group, the map, keys and
-- the mouse. Loads after wow-stub.lua and wow-layout.lua, before the addon.
--
-- Every API here is one the real client has (the list in .luacheckrc). The
-- defaults are a WoW Forever client with one logged-in mage and nothing
-- targeted; a test changes the world through __wfgWorld (the `world` table
-- here) and the harness's JS wrappers, and the right events fire.
-- Never shipped in game.

local stub = __wfgStub
local world = {}
__wfgWorld = world
stub.world = world

-- Secrets --------------------------------------------------------------------------------
-- The client hides some values in instanced combat: a "secret" errors on
-- arithmetic and comparison. Here it is a table, so the same mistakes fail.

-- A secret value (hides `n`, which only the preview reads).
function world.secret(n)
  return { __secret = true, n = n }
end

-- Whether a value is a secret.
function issecretvalue(v)
  return type(v) == "table" and v.__secret == true
end

world.aurasSecret = false
C_Secrets = {
  -- Whether the client hides aura values right now.
  ShouldAurasBeSecret = function() return world.aurasSecret end,
}

-- Client ---------------------------------------------------------------------------------

world.build = { version = "1.16.0", build = "65000", date = "Sep 1 2026", interface = 16001 }
world.locale = "enUS"
world.cvars = {}
world.sounds = {}
world.reloads = 0
world.keys = {}
world.mouse = { x = 960, y = 540 }

-- The client version, build, date and interface number (WoW Forever by default).
function GetBuildInfo()
  local b = world.build
  return b.version, b.build, b.date, b.interface
end

-- The locale, frame rate, latency and screen size a test may change.
function GetLocale() return world.locale end
function GetFramerate() return 60 end
function GetNetStats() return 0, 0, 40, 60 end
function GetPhysicalScreenSize() return stub.screen.width, stub.screen.height end
-- CVars live in world.cvars as strings, as the client keeps them.
function GetCVar(name) return world.cvars[name] end
function SetCVar(name, value) world.cvars[name] = tostring(value) end
function GetCVarBool(name) local v = world.cvars[name] return v == "1" or v == true end
-- A C_ namespace function that calls the global of the same name at call
-- time, so a test that replaces (or removes) the global changes both.
local function viaGlobal(name)
  return function(...)
    local fn = _G[name]
    if type(fn) == "function" then return fn(...) end
  end
end
world.viaGlobal = viaGlobal

C_CVar = { GetCVar = viaGlobal("GetCVar"), SetCVar = viaGlobal("SetCVar"), GetCVarBool = viaGlobal("GetCVarBool") }

-- Sounds are recorded, not played.
function PlaySound(id) world.sounds[#world.sounds + 1] = id end
SOUNDKIT = setmetatable({}, { __index = function(_, k) return k end })

-- The Forever client refuses ReloadUI from addons; here it is counted.
function ReloadUI() world.reloads = world.reloads + 1 end

-- Addon metadata comes from the TOC the harness read.
world.addons = { ForeverUI = { Version = "0.3.0", Title = "ForeverUI" } }
-- A TOC field of an addon.
function GetAddOnMetadata(name, field) return (world.addons[name] or {})[field] end
C_AddOns = {
  GetAddOnMetadata = viaGlobal("GetAddOnMetadata"),
  -- Loading a Blizzard addon: true for the ones the world lists as loadable.
  LoadAddOn = function(name) return world.loadable and world.loadable[name] == true, nil end,
  IsAddOnLoaded = function(name) return name == "ForeverUI" end,
}

-- Modifier keys: whatever a test puts in world.keys.
function IsShiftKeyDown() return world.keys.shift == true end
function IsControlKeyDown() return world.keys.ctrl == true end
function IsAltKeyDown() return world.keys.alt == true end

-- The cursor's screen position, in pixels.
function GetCursorPosition() return world.mouse.x, world.mouse.y end

-- What's on the cursor: nil, or { type, id, ... } from a pickup.
world.cursor = nil
-- The cursor's contents as type, id, subtype.
function GetCursorInfo()
  local c = world.cursor
  if not c then return nil end
  return c.type, c.id, c.subType
end
-- Empties the cursor.
function ClearCursor() world.cursor = nil end

-- Enums the addon reads, with the client's values.
Enum = {
  PowerType = { Mana = 0, Rage = 1, Focus = 2, Energy = 3, ComboPoints = 4, Runes = 5, RunicPower = 6, SoulShards = 7, LunarPower = 8, HolyPower = 9, Maelstrom = 11, Chi = 12, Insanity = 13, ArcaneCharges = 16, Fury = 17, Pain = 18 },
  CustomAuraButtonDispelTypeTextureStyle = { PreserveAsset = 0, Flat = 1 },
  DurationTextBindingProperty = { RemainingDuration = 0, TotalDuration = 1 },
  LuaCurveType = { Linear = 0, Step = 1 },
  NumericRuleFormatRounding = { Down = 0, Up = 1, Nearest = 2 },
  PlayerSwingType = { MainHand = 0, OffHand = 1, Ranged = 2 },
  StatusBarInterpolation = { Immediate = 0, Smooth = 1 },
  TooltipDataType = { Item = 0, Spell = 1, Unit = 2 },
  WeaponSlot = { MainHand = 0, OffHand = 1 },
}

STANDARD_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
UISpecialFrames = {}

-- hooksecurefunc: runs fn after the function, as FrameXML does. A global name
-- hooks _G; a missing function is left alone.
function hooksecurefunc(t, name, fn)
  if type(t) == "string" then t, name, fn = _G, t, name end
  local orig = t[name]
  if type(orig) ~= "function" then return end
  t[name] = function(...)
    local results = { orig(...) }
    fn(...)
    return unpack(results)
  end
end

-- Static popups: which are shown, by name.
world.popups = {}
-- Shows a popup by name (its arguments kept), hides one, or hides a UI panel.
function StaticPopup_Show(name, ...) world.popups[name] = { ... } return world.popups[name] end
function StaticPopup_Hide(name) world.popups[name] = nil end
function HideUIPanel(frame) if frame and frame.Hide then frame:Hide() end end

-- EventRegistry: callbacks by event name, which world.trigger(event, ...) runs.
world.callbacks = {}
EventRegistry = {
  -- Keeps a callback for an event.
  RegisterCallback = function(_, event, fn, owner)
    world.callbacks[event] = world.callbacks[event] or {}
    table.insert(world.callbacks[event], { fn = fn, owner = owner })
  end,
  -- Runs the callbacks for an event.
  TriggerEvent = function(_, event, ...)
    for _, cb in ipairs(world.callbacks[event] or {}) do cb.fn(cb.owner, ...) end
  end,
}

-- Events the client knows: anything the addon registers, unless a test lists some as invalid.
world.invalidEvents = {}
C_EventUtils = {
  -- Whether the client knows an event.
  IsEventValid = function(event) return world.invalidEvents[event] ~= true end,
}

-- Timers on the test clock: C_Timer.After runs when stub.update has moved
-- the clock past the delay.
world.timers = {}

-- Schedules fn once after `delay` seconds.
local function after(delay, fn)
  local t = { at = stub.now + delay, fn = fn }
  world.timers[#world.timers + 1] = t
  return t
end

-- The timers that are due now.
local function dueTimers()
  local due = {}
  for _, t in ipairs(world.timers) do
    if not t.cancelled and t.at <= stub.now then due[#due + 1] = t end
  end
  return due
end

-- Runs every timer that is due, in order, and forgets the finished ones.
local function runTimers()
  for _, t in ipairs(dueTimers()) do
    t.done = true
    t.fn(t)
  end
  local left = {}
  for _, t in ipairs(world.timers) do if not t.done and not t.cancelled then left[#left + 1] = t end end
  world.timers = left
end

-- Gives a timer the Cancel and IsCancelled methods the client's have.
local function cancellable(t)
  -- Cancel stops it; IsCancelled says whether it was.
  function t:Cancel() self.cancelled = true end
  function t:IsCancelled() return self.cancelled == true end
  return t
end

C_Timer = {
  -- Runs fn once after `delay` seconds.
  After = function(delay, fn) after(delay, fn) end,
  -- A timer object with Cancel and IsCancelled.
  NewTimer = function(delay, fn) return cancellable(after(delay, fn)) end,
}

-- A ticker: fires every `period` seconds, `iterations` times (forever when nil).
function C_Timer.NewTicker(period, fn, iterations)
  local t = cancellable({ left = iterations })
  -- One tick: runs fn and schedules the next while any are left.
  local function tick()
    if t.cancelled then return end
    fn(t)
    if t.left then t.left = t.left - 1 end
    if not t.left or t.left > 0 then after(period, tick) end
  end
  after(period, tick)
  return t
end

local rawUpdate = stub.update
-- Each frame also runs due timers.
function stub.update(elapsed)
  rawUpdate(elapsed)
  runTimers()
end

-- Bindings and secure drivers -------------------------------------------------------------

world.bindings = { ACTIONBUTTON1 = { "1" }, ACTIONBUTTON2 = { "2" }, ACTIONBUTTON3 = { "3" }, TOGGLEBACKPACK = { "B" }, OPENALLBAGS = { "B" } }
world.overrides = {}

-- The keys bound to a command.
function GetBindingKey(command) return unpack(world.bindings[command] or {}) end

-- Override bindings: key -> "frame:button", by owner.
function SetOverrideBindingClick(owner, _, key, name, button)
  world.overrides[key] = { owner = owner, target = name .. ":" .. (button or "LeftButton") }
end
-- A plain binding to a click.
function SetBindingClick(key, name, button) return SetOverrideBindingClick(nil, nil, key, name, button) end

-- Forgets an owner's override bindings.
function ClearOverrideBindings(owner)
  for key, o in pairs(world.overrides) do if o.owner == owner then world.overrides[key] = nil end end
end

-- Secure state and attribute drivers: the condition string is recorded per frame.
function RegisterStateDriver(frame, state, driver)
  frame.__states = frame.__states or {}
  frame.__states[state] = driver
end
-- Removes a state driver.
function UnregisterStateDriver(frame, state) if frame.__states then frame.__states[state] = nil end end

-- Attribute drivers: the condition string recorded per frame and attribute.
function RegisterAttributeDriver(frame, attr, driver)
  frame.__drivers = frame.__drivers or {}
  frame.__drivers[attr] = driver
end

-- Removes an attribute driver.
function UnregisterAttributeDriver(frame, attr) if frame.__drivers then frame.__drivers[attr] = nil end end

-- Unit watches: a watched frame shows while its unit exists (re-checked on unit changes).
world.watched = {}
-- Shows a frame while its unit exists (the unit comes from its attribute or .unit).
function RegisterUnitWatch(frame)
  frame.__watched = true
  world.watched[frame] = true
  frame:SetShown(UnitExists(frame:GetAttribute("unit") or frame.unit))
end
-- Stops watching a frame.
function UnregisterUnitWatch(frame)
  frame.__watched = nil
  world.watched[frame] = nil
end

-- Shows or hides every watched frame by whether its unit exists now.
local function refreshWatches()
  for frame in pairs(world.watched) do
    frame:SetShown(UnitExists(frame:GetAttribute("unit") or frame.unit) == true)
  end
end

-- Colors and utilities ----------------------------------------------------------------------

-- Class colors, as the client has them.
RAID_CLASS_COLORS = {
  WARRIOR = CreateColor(0.78, 0.61, 0.43), PALADIN = CreateColor(0.96, 0.55, 0.73), HUNTER = CreateColor(0.67, 0.83, 0.45),
  ROGUE = CreateColor(1, 0.96, 0.41), PRIEST = CreateColor(1, 1, 1), SHAMAN = CreateColor(0, 0.44, 0.87),
  MAGE = CreateColor(0.25, 0.78, 0.92), WARLOCK = CreateColor(0.53, 0.53, 0.93), DRUID = CreateColor(1, 0.49, 0.04),
  DEATHKNIGHT = CreateColor(0.77, 0.12, 0.23), MONK = CreateColor(0, 1, 0.59), DEMONHUNTER = CreateColor(0.64, 0.19, 0.79), EVOKER = CreateColor(0.2, 0.58, 0.5),
}

-- Power colors by name and by Enum.PowerType value.
PowerBarColor = {
  MANA = { r = 0, g = 0.44, b = 0.87 }, RAGE = { r = 0.78, g = 0.25, b = 0.25 }, FOCUS = { r = 1, g = 0.5, b = 0.25 },
  ENERGY = { r = 1, g = 0.96, b = 0.41 }, COMBO_POINTS = { r = 1, g = 0.96, b = 0.41 }, RUNIC_POWER = { r = 0, g = 0.82, b = 1 },
  LUNAR_POWER = { r = 0.3, g = 0.52, b = 0.9 }, HOLY_POWER = { r = 0.95, g = 0.9, b = 0.6 }, MAELSTROM = { r = 0, g = 0.5, b = 1 },
  INSANITY = { r = 0.4, g = 0, b = 0.8 }, CHI = { r = 0.71, g = 1, b = 0.92 }, FURY = { r = 0.79, g = 0.26, b = 0.99 }, PAIN = { r = 1, g = 0.61, b = 0 },
}
for name, value in pairs(Enum.PowerType) do
  local key = name:gsub("(%l)(%u)", "%1_%2"):upper()
  if PowerBarColor[key] then PowerBarColor[value] = PowerBarColor[key] end
end

-- The difficulty color of a creature level against the player's.
function GetCreatureDifficultyColor(level)
  local diff = level - UnitLevel("player")
  if diff >= 5 then return { r = 1, g = 0.1, b = 0.1 } end
  if diff >= 3 then return { r = 1, g = 0.5, b = 0.25 } end
  if diff >= -2 then return { r = 1, g = 1, b = 0 } end
  if diff >= -7 then return { r = 0.25, g = 0.75, b = 0.25 } end
  return { r = 0.5, g = 0.5, b = 0.5 }
end
GetQuestDifficultyColor = GetCreatureDifficultyColor

-- Threat status colors: 0 gray through 3 red.
function GetThreatStatusColor(status)
  local colors = { [0] = { 0.69, 0.69, 0.69 }, { 1, 1, 0.47 }, { 1, 0.6, 0 }, { 1, 0, 0 } }
  local c = colors[status] or colors[0]
  return c[1], c[2], c[3]
end

-- A number as the client abbreviates it (12.3K, 1.2M); secrets stay secret.
function AbbreviateNumbers(v)
  if issecretvalue(v) then return world.secret(v.n and AbbreviateNumbers(v.n)) end
  if type(v) ~= "number" then return tostring(v) end
  if v >= 1e6 then return string.format("%.1fM", v / 1e6) end
  if v >= 1e3 then return string.format("%.1fK", v / 1e3) end
  return tostring(v)
end

AnchorUtil = { FlowDirection = { LeftToRight = 1, RightToLeft = 2, TopToBottom = 3, BottomToTop = 4 } }

-- Color curves: the color at a value, by the nearest step below it.
C_CurveUtil = {
  -- A curve object: AddPoint(x, color), Evaluate(x).
  CreateColorCurve = function(kind)
    local curve = { kind = kind, points = {} }
    -- SetType picks the curve kind; AddPoint keeps a color at a value; Evaluate gives the color of the nearest point at or below.
    function curve:SetType(t) self.kind = t end
    function curve:AddPoint(x, color) self.points[#self.points + 1] = { x = x, color = color } end
    -- The color of the nearest point at or below x.
    function curve:Evaluate(x)
      local best
      for _, p in ipairs(self.points) do if p.x <= x and (not best or p.x > best.x) then best = p end end
      return best and best.color or self.points[1] and self.points[1].color
    end
    return curve
  end,
}

-- Numeric rule formatters: a formatter object whose Format rounds a number.
C_StringUtil = {
  -- A formatter object for a rounding rule.
  CreateNumericRuleFormatter = function(rounding)
    local f = { rounding = rounding }
    -- A number rounded by the rule, as text; a secret stays secret.
    function f:Format(n)
      if issecretvalue(n) then return world.secret(n.n and self:Format(n.n)) end
      local r = rounding == Enum.NumericRuleFormatRounding.Up and math.ceil(n) or math.floor(n)
      return tostring(r)
    end
    return f
  end,
}

-- Atlases the client has (a test adds to world.atlases); unknown ones are nil, as in game.
world.atlases = {}
C_Texture = {
  -- The atlas info table, or nil.
  GetAtlasInfo = function(name)
    local a = world.atlases[name]
    return a and { file = a.file or "TEST-ONLY-ATLAS", width = a.width or 64, height = a.height or 64, leftTexCoord = 0, rightTexCoord = 1, topTexCoord = 0, bottomTexCoord = 1 }
  end,
}

-- Units -----------------------------------------------------------------------------------
-- world.units holds units by base token (player, target, focus, pet, party1..,
-- raid1.., boss1.., nameplate1..). Derived tokens (targettarget, partypet1,
-- raid1target, mouseover) resolve through fields on those.

world.units = {}

-- The player: a human mage at 60 with full bars.
local function defaultPlayer()
  return {
    name = "Tester", class = "MAGE", className = "Mage", level = 60, race = "Human", faction = "Alliance",
    hp = 42800, maxhp = 48000, power = 31000, maxpower = 40000, ptype = 0, ptypeName = "MANA",
    isPlayer = true, reaction = 5, connected = true, role = "DAMAGER", xp = 0, xpmax = 100,
  }
end
world.units.player = defaultPlayer()
world.maxLevel = 60

-- Resolves a unit token to its base unit: "targettarget" is the target's target, etc.
local function resolveUnit(token)
  if type(token) ~= "string" then return nil end
  local base = world.units[token]
  if base then return base end
  local owner, rest = token:match("^(%a+%d*)(%a+)$")
  if owner == nil or world.units[owner] == nil then return nil end
  if rest == "target" then return world.units[owner].target and resolveUnit(world.units[owner].target) end
  if rest == "pet" then return world.units[owner].pet and resolveUnit(world.units[owner].pet) end
  return nil
end
world.unit = resolveUnit

-- A unit's field, or nil when the unit does not exist.
local function uf(unit, field)
  local u = resolveUnit(unit)
  return u and u[field]
end

-- The unit API, read from world.units.
function UnitExists(unit) return resolveUnit(unit) ~= nil end
function UnitName(unit) local u = resolveUnit(unit) return u and u.name, u and u.realm end
-- A unit's GUID: its guid field, else one made from its name (nil when it doesn't exist).
function UnitGUID(unit) local u = resolveUnit(unit) return u and (u.guid or ("TEST-ONLY-GUID-" .. tostring(u.name))) end
function UnitHealth(unit) return uf(unit, "hp") or 0 end
function UnitHealthMax(unit) return uf(unit, "maxhp") or 0 end
function UnitHealthPercent(unit) local u = resolveUnit(unit) return u and u.maxhp > 0 and u.hp / u.maxhp * 100 or 0 end
-- A unit's power: its main power, combo points, or another type from unit.powers.
function UnitPower(unit, kind)
  local u = resolveUnit(unit)
  if not u then return 0 end
  if kind == Enum.PowerType.ComboPoints then return u.combo or 0 end
  if kind ~= nil and kind ~= u.ptype then return (u.powers or {})[kind] or 0 end
  return u.power or 0
end
-- A unit's maximum power, by the same rules.
function UnitPowerMax(unit, kind)
  local u = resolveUnit(unit)
  if not u then return 0 end
  if kind == Enum.PowerType.ComboPoints then return u.maxcombo or 5 end
  if kind ~= nil and kind ~= u.ptype then return (u.maxpowers or {})[kind] or 0 end
  return u.maxpower or 0
end
-- More unit facts: power type, player, class, level, reaction and states.
function UnitPowerType(unit) local u = resolveUnit(unit) return u and u.ptype or 0, u and u.ptypeName or "MANA" end
function UnitIsPlayer(unit) return uf(unit, "isPlayer") == true end
function UnitClass(unit) local u = resolveUnit(unit) return u and (u.className or u.class), u and u.class, 0 end
function UnitLevel(unit) return uf(unit, "level") or 0 end
function UnitReaction(unit) local u = resolveUnit(unit) return u and (u.reaction or 5) end
function UnitIsDeadOrGhost(unit) return uf(unit, "dead") == true end
function UnitIsConnected(unit) local u = resolveUnit(unit) return u ~= nil and u.connected ~= false end
function UnitIsAFK(unit) return uf(unit, "afk") == true end
function UnitOnTaxi(unit) return uf(unit, "taxi") == true end
function UnitInRange(unit) local u = resolveUnit(unit) return u ~= nil and u.inRange ~= false, u ~= nil end
function UnitClassification(unit) return uf(unit, "classification") or "normal" end
function UnitFactionGroup(unit) local u = resolveUnit(unit) return u and u.faction, u and u.faction end
function UnitGroupRolesAssigned(unit) return uf(unit, "role") or "NONE" end
function UnitHasIncomingResurrection(unit) return uf(unit, "incomingRes") == true end
function UnitXP(unit) return uf(unit, "xp") or 0 end
function UnitXPMax(unit) return uf(unit, "xpmax") or 0 end
function GetXPExhaustion() return world.units.player.rested end
function IsXPUserDisabled() return world.units.player.xpDisabled == true end
function GetMaxPlayerLevel() return world.maxLevel end
function IsPlayerAtEffectiveMaxLevel() return world.units.player.level >= world.maxLevel end
function GetComboPoints(unit) return uf(unit, "combo") or 0 end

-- Whether two tokens name the same unit.
function UnitIsUnit(a, b)
  local ua, ub = resolveUnit(a), resolveUnit(b)
  return ua ~= nil and ua == ub
end

-- Threat: a unit's status against its target (0-3), from unit.threat.
function UnitThreatSituation(unit) return uf(unit, "threat") end
-- isTanking, status, scaled percent, raw percent, threat value.
function UnitDetailedThreatSituation(unit)
  local u = resolveUnit(unit)
  if not u or u.threat == nil then return nil end
  return u.threat >= 2, u.threat, u.threatPct or 0, u.threatPct or 0, 0
end

-- Heal prediction, absorbs and heal calculators.
function UnitGetIncomingHeals(unit) return uf(unit, "incomingHeals") or 0 end
function UnitGetTotalAbsorbs(unit) return uf(unit, "absorbs") or 0 end
-- Fills a calculator with a unit (as the client does) and returns the unit's incoming heals.
function UnitGetDetailedHealPrediction(unit, _, calc)
  if calc then calc.unit = unit end
  local u = resolveUnit(unit)
  return u and (u.incomingHeals or 0) or 0, 0, 0
end
-- The client's heal prediction calculator, reading the unit's world fields.
function CreateUnitHealPredictionCalculator()
  local c = {}
  -- The calculator's unit and modes, then what it reads from the unit.
  function c:SetUnit(unit) self.unit = unit end
  function c:SetIncomingHealClampMode(m) self.clamp = m end
  function c:SetIncomingHealOverflowPercent(p) self.overflow = p end
  function c:GetMaximumHealth() return UnitHealthMax(self.unit) end
  function c:GetIncomingHeals() return UnitGetIncomingHeals(self.unit) end
  function c:GetTotalDamageAbsorbs() return UnitGetTotalAbsorbs(self.unit) end
  return c
end

-- Totems: four slots on the player, each { name, icon, start, duration }.
world.totems = {}
-- haveTotem, name, start, duration, icon of a totem slot.
function GetTotemInfo(slot)
  local t = world.totems[slot]
  if not t then return false, "", 0, 0, "" end
  return true, t.name, t.start or stub.now, t.duration or 0, t.icon or ""
end
-- A totem's duration object (the newer client's), from its start and duration.
function GetTotemDuration(slot)
  local t = world.totems[slot] or {}
  return world.durationObject(t.start or stub.now, t.duration or 0)
end

-- Pet happiness (hunters): 1 unhappy, 2 content, 3 happy.
function GetPetHappiness() return uf("pet", "happiness") end
C_PetInfo = { GetPetHappiness = viaGlobal("GetPetHappiness") }

-- Specializations: none on WoW Forever.
function GetSpecialization() return world.spec end
C_SpecializationInfo = { GetSpecialization = viaGlobal("GetSpecialization") }

-- The watched faction (nil until a test sets world.watchedFaction).
C_Reputation = { GetWatchedFactionData = function() return world.watchedFaction end }

-- Casting: a unit's cast or channel from unit.cast = { name, icon, startMs, endMs, channel, interruptible, spellId }.
function UnitCastingInfo(unit)
  local c = uf(unit, "cast")
  if not c or c.channel then return nil end
  return c.name, c.name, c.icon, c.startMs, c.endMs, false, nil, c.interruptible ~= false, c.spellId
end
-- A channel: name, text, icon, startMs, endMs, isTradeSkill, notInterruptible, spellId.
function UnitChannelInfo(unit)
  local c = uf(unit, "cast")
  if not c or not c.channel then return nil end
  return c.name, c.name, c.icon, c.startMs, c.endMs, false, c.interruptible ~= false, c.spellId
end

-- The group ---------------------------------------------------------------------------------

-- Party and raid units present, in order.
local function groupUnits(prefix)
  local out = {}
  for i = 1, prefix == "raid" and 40 or 4 do
    if world.units[prefix .. i] then out[#out + 1] = prefix .. i end
  end
  return out
end

-- Group facts from which party/raid units exist.
function IsInRaid() return #groupUnits("raid") > 0 end
function IsInGroup() return IsInRaid() or #groupUnits("party") > 0 end

-- The group's size: raid members, or the party plus you.
function GetNumGroupMembers()
  if IsInRaid() then return #groupUnits("raid") end
  local n = #groupUnits("party")
  return n > 0 and n + 1 or 0
end
-- Leader, assistant, assignments, ready checks and raid target marks.
function UnitIsGroupLeader(unit) return uf(unit, "leader") == true end
function UnitIsGroupAssistant(unit) return uf(unit, "assistant") == true end
function IsEveryoneAssistant() return world.everyoneAssistant == true end
function GetPartyAssignment(role, unit) local u = resolveUnit(unit) return u ~= nil and u.assignment == role end
function GetReadyCheckStatus(unit) return uf(unit, "readyCheck") end
function GetRaidTargetIndex(unit) return uf(unit, "raidTarget") end
function SetRaidTarget(unit, index) local u = resolveUnit(unit) if u then u.raidTarget = index ~= 0 and index or nil end end
function CanBeRaidTarget(unit) return UnitExists(unit) end
C_PartyInfo = {
  -- Group leaders can do these; a test sets world.canUseRaidTools.
  CanUseRaidTools = function() return world.canUseRaidTools ~= false end,
  DoCountdown = function(seconds) world.countdown = seconds end,
  ConvertToRaid = function() world.converted = "raid" end,
  ConvertToParty = function() world.converted = "party" end,
}
C_SummonInfo = {
  -- A pending summon's summoner and area, and accepting it.
  GetSummonConfirmSummoner = function() return world.summon and world.summon.summoner end,
  GetSummonConfirmAreaName = function() return world.summon and world.summon.area end,
  ConfirmSummon = function() world.summonAccepted = true end,
}
-- Accepting a resurrection and cancelling a duel, recorded.
function AcceptResurrect() world.resurrectAccepted = true end
function CancelDuel() world.duelCancelled = true end

-- Changing the world: units ----------------------------------------------------------------

-- The events a changed field fires.
local UNIT_EVENTS = {
  hp = "UNIT_HEALTH", maxhp = "UNIT_MAXHEALTH", power = "UNIT_POWER_UPDATE", maxpower = "UNIT_MAXPOWER",
  ptype = "UNIT_DISPLAYPOWER", name = "UNIT_NAME_UPDATE", level = "UNIT_LEVEL", combo = "UNIT_POWER_UPDATE",
  dead = "UNIT_HEALTH", connected = "UNIT_CONNECTION", threat = "UNIT_THREAT_SITUATION_UPDATE",
  afk = "PLAYER_FLAGS_CHANGED", incomingHeals = "UNIT_HEAL_PREDICTION", absorbs = "UNIT_ABSORB_AMOUNT_CHANGED",
  cast = "UNIT_SPELLCAST_START", happiness = "UNIT_HAPPINESS", role = "PLAYER_ROLES_ASSIGNED",
  raidTarget = "RAID_TARGET_UPDATE", pet = "UNIT_PET", target = "UNIT_TARGET",
}

-- The event a token's appearance or disappearance fires.
local function tokenEvent(token)
  if token == "target" then return "PLAYER_TARGET_CHANGED" end
  if token == "focus" then return "PLAYER_FOCUS_CHANGED" end
  if token == "pet" then return "UNIT_PET", "player" end
  if token:match("^party") or token:match("^raid") then return "GROUP_ROSTER_UPDATE" end
  if token:match("^boss") then return "INSTANCE_ENCOUNTER_ENGAGE_UNIT" end
  if token:match("^nameplate") then return "NAME_PLATE_UNIT_ADDED", token end
  return "UNIT_NAME_UPDATE", token
end

-- Fires the events for the fields that changed on a unit.
local function fireUnitChanges(token, fields)
  local fired = {}
  for field in pairs(fields) do
    local event = UNIT_EVENTS[field]
    if event and not fired[event] then
      fired[event] = true
      stub.fire(event, token)
    end
  end
end

-- Creates or updates a unit and fires what changed. A new unit fires its
-- token's event (PLAYER_TARGET_CHANGED, GROUP_ROSTER_UPDATE...).
function world.setUnit(token, fields)
  local u = world.units[token]
  local new = u == nil
  u = u or { name = token, hp = 100, maxhp = 100, power = 0, maxpower = 0, ptype = 1, ptypeName = "RAGE", reaction = 4, level = 60, connected = true }
  for k, v in pairs(fields or {}) do u[k] = v end
  world.units[token] = u
  refreshWatches()
  if new then stub.fire(tokenEvent(token)) else fireUnitChanges(token, fields or {}) end
  return u
end

-- Removes a unit and fires its token's event.
function world.removeUnit(token)
  if not world.units[token] then return end
  world.units[token] = nil
  refreshWatches()
  if token:match("^nameplate") then stub.fire("NAME_PLATE_UNIT_REMOVED", token) else stub.fire(tokenEvent(token)) end
end

-- Enters or leaves combat, firing PLAYER_REGEN_DISABLED / ENABLED.
function world.combat(on)
  if stub.inCombat == on then return end
  stub.inCombat = on
  stub.fire(on and "PLAYER_REGEN_DISABLED" or "PLAYER_REGEN_ENABLED")
end

-- Auras -----------------------------------------------------------------------------------
-- unit.auras is a list of aura data tables as C_UnitAuras returns them:
-- { name, icon, applications, duration, expirationTime, isHarmful, isHelpful,
--   dispelName, sourceUnit, spellId, auraInstanceID, isRaid, isFromPlayerOrPlayerPet }.

local nextAuraId = 100

-- Whether an aura passes one filter word (HELPFUL, HARMFUL, PLAYER, RAID, !RAID, ...).
local function passes(aura, word)
  if word == "HELPFUL" then return not aura.isHarmful end
  if word == "HARMFUL" then return aura.isHarmful == true end
  if word == "PLAYER" then return aura.sourceUnit == "player" or aura.isFromPlayerOrPlayerPet == true end
  if word == "RAID" then return aura.isRaid == true end
  if word == "!RAID" then return aura.isRaid ~= true end
  if word == "CANCELABLE" then return aura.isHarmful ~= true end
  return true
end

-- The auras of a unit that pass every word of a filter ("HARMFUL|RAID").
local function filtered(unit, filter)
  local out = {}
  for _, aura in ipairs(uf(unit, "auras") or {}) do
    local ok = true
    for word in (filter or ""):gmatch("[^|%s]+") do ok = ok and passes(aura, word) end
    if ok then out[#out + 1] = aura end
  end
  return out
end
world.auras = filtered

-- A duration object for an aura or cast: the client's "secret-safe" timer.
local function durationObject(start, duration)
  local d = { start = start, duration = duration }
  -- Start, total, end and remaining time; IsZero and HasSecretValues as the client's.
  function d:GetStartTime() return self.start end
  function d:GetTotalDuration() return self.duration end
  function d:GetEndTime() return self.start + self.duration end
  function d:GetRemainingDuration() return math.max(0, self.start + self.duration - stub.now) end
  function d:IsZero() return self.duration == 0 end
  function d:HasSecretValues() return issecretvalue(self.duration) end
  return d
end
world.durationObject = durationObject

C_UnitAuras = {
  -- The i-th aura of a unit through a filter.
  GetAuraDataByIndex = function(unit, i, filter) return filtered(unit, filter)[i] end,
  -- The first aura by name through a filter.
  GetAuraDataBySpellName = function(unit, name, filter)
    for _, aura in ipairs(filtered(unit, filter)) do if aura.name == name then return aura end end
  end,
  -- An aura by instance id.
  GetAuraDataByAuraInstanceID = function(unit, id)
    for _, aura in ipairs(uf(unit, "auras") or {}) do if aura.auraInstanceID == id then return aura end end
  end,
  -- The stack count the client would display (hidden ones become secrets).
  GetAuraApplicationDisplayCount = function(unit, id)
    local aura = C_UnitAuras.GetAuraDataByAuraInstanceID(unit, id)
    return aura and aura.applications or 0
  end,
  -- The dispel type color through a curve (nil when the client has none).
  GetAuraDispelTypeColor = function(unit, id, curve)
    local aura = C_UnitAuras.GetAuraDataByAuraInstanceID(unit, id)
    local kind = aura and aura.dispelName or "None"
    return curve and curve:Evaluate(kind) or world.dispelColors[kind]
  end,
  -- The duration object of an aura.
  GetAuraDuration = function(unit, id)
    local aura = C_UnitAuras.GetAuraDataByAuraInstanceID(unit, id)
    if not aura then return nil end
    return durationObject((aura.expirationTime or stub.now) - (aura.duration or 0), aura.duration or 0)
  end,
}
world.dispelColors = { Magic = CreateColor(0.2, 0.6, 1), Curse = CreateColor(0.6, 0, 1), Disease = CreateColor(0.6, 0.4, 0), Poison = CreateColor(0, 0.6, 0), None = CreateColor(0.8, 0, 0) }

-- AuraUtil.FindAuraByName, as FrameXML has it: the aura's fields unpacked.
AuraUtil = {
  -- name, icon, count, dispelType, duration, expirationTime, source, isStealable, nameplateShowPersonal, spellId.
  FindAuraByName = function(name, unit, filter)
    local aura
    for _, a in ipairs(filtered(unit, filter)) do if a.name == name then aura = a break end end
    if not aura then return nil end
    return aura.name, aura.icon, aura.applications, aura.dispelName, aura.duration, aura.expirationTime, aura.sourceUnit, false, false, aura.spellId
  end,
}

-- Fills in an aura's defaults: an instance id, an icon, helpful/harmful, expiration.
local function completeAura(aura)
  nextAuraId = nextAuraId + 1
  aura.auraInstanceID = aura.auraInstanceID or nextAuraId
  aura.icon = aura.icon or ("TEST-ONLY-ICON-" .. tostring(aura.name))
  aura.isHelpful = not aura.isHarmful
  if aura.duration and not aura.expirationTime then aura.expirationTime = stub.now + aura.duration end
  return aura
end

-- The client's aura containers showing a unit read its auras again (the
-- client does this itself on an aura change), then UNIT_AURA fires.
local function auraChanged(unit, payload)
  local u = resolveUnit(unit)
  for _, w in ipairs(stub.frames) do
    if w.__kind == "AuraContainer" and w.__unit and resolveUnit(w.__unit) == u then w:UpdateAllAuras() end
  end
  stub.fire("UNIT_AURA", unit, payload)
end

-- Adds an aura to a unit and fires UNIT_AURA; returns the aura.
function world.addAura(unit, aura)
  local u = resolveUnit(unit)
  if not u then error("TEST-ONLY: no unit " .. tostring(unit)) end
  u.auras = u.auras or {}
  table.insert(u.auras, completeAura(aura))
  auraChanged(unit, { addedAuras = { aura } })
  return aura
end

-- Removes the auras of a unit with a name (or all with no name) and fires UNIT_AURA.
function world.removeAura(unit, name)
  local u = resolveUnit(unit)
  if not u or not u.auras then return end
  local kept, removed = {}, {}
  for _, aura in ipairs(u.auras) do
    if name == nil or aura.name == name then removed[#removed + 1] = aura.auraInstanceID else kept[#kept + 1] = aura end
  end
  u.auras = kept
  auraChanged(unit, { removedAuraInstanceIDs = removed })
end

-- Weapon enchants: { main = { name, expiration, charges, id }, off = ... }.
world.enchants = {}
C_Item = C_Item or {}
-- hasMainHandEnchant, expiration, charges, id, then the same for the off hand.
function C_Item.GetWeaponEnchantInfo()
  local m, o = world.enchants.main, world.enchants.off
  return m ~= nil, m and m.expiration or 0, m and m.charges or 0, m and m.id, o ~= nil, o and o.expiration or 0, o and o.charges or 0, o and o.id
end

-- Spells, action slots and cooldowns ---------------------------------------------------------
-- world.spells[id] = { name, icon, cost }; world.actions[slot] = { type, id,
-- icon, count, usable, noPower, current, inRange, cooldown = { start, duration } }.

world.spells = {
  [133] = { name = "Fireball", icon = "Interface\\Icons\\Spell_Fire_FlameBolt", cost = 30 },
  [1459] = { name = "Arcane Intellect", icon = "Interface\\Icons\\Spell_Holy_MagicalSentry", cost = 60 },
  [116] = { name = "Frostbolt", icon = "Interface\\Icons\\Spell_Frost_FrostBolt02", cost = 25 },
  [2136] = { name = "Fire Blast", icon = "Interface\\Icons\\Spell_Fire_Fireball", cost = 40 },
  [118] = { name = "Polymorph", icon = "Interface\\Icons\\Spell_Nature_Polymorph", cost = 20 },
}

-- A spell by id or by name.
local function spellOf(key)
  if world.spells[key] then return key, world.spells[key] end
  for id, s in pairs(world.spells) do if s.name == key then return id, s end end
end
world.spell = spellOf

-- GetSpellInfo (the Forever client has it): name, rank, icon, castTime, minRange, maxRange, spellId.
function GetSpellInfo(key)
  local id, s = spellOf(key)
  if not s then return nil end
  return s.name, nil, s.icon, s.castTime or 0, 0, s.range or 40, id
end

C_Spell = {
  -- A spell info table, as the newer API returns it.
  GetSpellInfo = function(key)
    local id, s = spellOf(key)
    return s and { name = s.name, iconID = s.icon, castTime = s.castTime or 0, minRange = 0, maxRange = s.range or 40, spellID = id }
  end,
  GetSpellName = function(key) local _, s = spellOf(key) return s and s.name end,
  GetSpellTexture = function(key) local _, s = spellOf(key) return s and s.icon end,
  -- The spell's power costs, as a list of { type, cost, name }.
  GetSpellPowerCost = function(key)
    local _, s = spellOf(key)
    return s and { { type = s.costType or 0, cost = s.cost or 0, name = s.costName or "MANA" } } or {}
  end,
}

world.actions = {}

-- The action in a slot (empty: {}).
local function actionOf(slot) return world.actions[slot] or {} end

-- Sets a slot to a spell (`id` of a world spell) or anything with fields, and fires ACTIONBAR_SLOT_CHANGED.
function world.setAction(slot, fields)
  if fields == nil then world.actions[slot] = nil else
    local a = { type = "spell", usable = true }
    local s = fields.id and select(2, spellOf(fields.id))
    if s then a.icon, a.name = s.icon, s.name end
    for k, v in pairs(fields) do a[k] = v end
    world.actions[slot] = a
  end
  stub.fire("ACTIONBAR_SLOT_CHANGED", slot)
end

-- The action slot API, read from world.actions.
function HasAction(slot) return world.actions[slot] ~= nil end
function GetActionInfo(slot) local a = actionOf(slot) return a.type, a.id, a.subType end
function GetActionTexture(slot) return actionOf(slot).icon end
function GetActionText(slot) return actionOf(slot).macro end
function GetActionCount(slot) return actionOf(slot).count or 0 end
function IsUsableAction(slot) local a = actionOf(slot) return a.usable == true, a.noPower == true end
function IsCurrentAction(slot) return actionOf(slot).current == true end
function IsAutoRepeatAction(slot) return actionOf(slot).autoRepeat == true end
function IsConsumableAction(slot) return actionOf(slot).consumable == true end
function IsStackableAction(slot) return actionOf(slot).stackable == true end
function IsActionInRange(slot) local a = actionOf(slot) if a.inRange == nil then return nil end return a.inRange end
function IsSpellOverlayed(id) return (world.overlayed or {})[id] == true end
function GetActionCooldown(slot) local cd = actionOf(slot).cooldown or {} return cd[1] or cd.start or 0, cd[2] or cd.duration or 0, 1, 1 end
-- The cooldown as a duration object.
function GetActionCooldownDuration(slot)
  local start, duration = GetActionCooldown(slot)
  return durationObject(start, duration)
end
-- Using, picking up and placing actions, recorded.
function UseAction(slot) world.used = world.used or {} table.insert(world.used, slot) end
function PickupAction(slot) world.cursor = { type = "action", id = slot } end
function PlaceAction(slot) world.placed = slot world.cursor = nil end
C_ActionBar = {
  -- Range checks and the bar page, recorded.
  EnableActionRangeCheck = function(slot, on) world.rangeChecks = world.rangeChecks or {} world.rangeChecks[slot] = on end,
  GetActionBarPage = function() return world.page or 1 end,
  HasAction = HasAction,
}

-- Swing timers (the Forever client's C_SwingTimer): per hand, { start, duration }.
world.swings = {}
C_SwingTimer = {
  -- A hand's swing start and duration, or nil when it isn't swinging.
  GetSwingTimerInfo = function(kind)
    local s = world.swings[kind]
    if not s then return nil end
    return s.start or stub.now, s.duration or 0
  end,
}

-- Items, bags and money ------------------------------------------------------------------------
-- world.bags[bag] = { [slot] = item }, item = { itemID, name, icon, count,
-- quality, link, sellPrice, junk }. world.items[itemID] gives GetItemInfo.

world.money = 123456
world.bags = { [0] = {}, {}, {}, {}, {} }
world.bagSizes = { [0] = 16, 16, 16, 16, 16 }
world.items = {
  [6948] = { name = "Hearthstone", icon = "Interface\\Icons\\INV_Misc_Rune_01", quality = 1, sellPrice = 0 },
  [159] = { name = "Refreshing Spring Water", icon = "Interface\\Icons\\INV_Drink_07", quality = 1, sellPrice = 5 },
  [2589] = { name = "Linen Cloth", icon = "Interface\\Icons\\INV_Fabric_Linen_01", quality = 1, sellPrice = 13 },
}

-- Copper in the purse.
function GetMoney() return world.money end

-- An item's static info by id, name or link.
local function itemOf(key)
  if world.items[key] then return key, world.items[key] end
  local id = type(key) == "string" and tonumber(key:match("item:(%d+)"))
  if id and world.items[id] then return id, world.items[id] end
  for i, item in pairs(world.items) do if item.name == key then return i, item end end
end
world.item = itemOf

C_Item = C_Item or {}
-- GetItemInfo: name, link, quality, level, minLevel, type, subType, stackCount, equipLoc, icon, sellPrice.
function C_Item.GetItemInfo(key)
  local id, item = itemOf(key)
  if not item then return nil end
  local link = "|cffffffff|Hitem:" .. id .. "|h[" .. item.name .. "]|h|r"
  return item.name, link, item.quality or 1, item.level or 1, 1, item.type or "Miscellaneous", item.subType or "Junk", item.stack or 20, item.equipLoc or "", item.icon, item.sellPrice or 0, 15, 0, 0, 0, 0, item.quality == 0
end
-- How many of an item are in the bags.
function C_Item.GetItemCount(key)
  local id = itemOf(key)
  local n = 0
  for _, bag in pairs(world.bags) do for _, it in pairs(bag) do if it.itemID == id then n = n + (it.count or 1) end end end
  return n
end
-- r, g, b and the hex of an item quality.
function C_Item.GetItemQualityColor(q)
  local colors = { [0] = { 0.62, 0.62, 0.62 }, { 1, 1, 1 }, { 0.12, 1, 0 }, { 0, 0.44, 0.87 }, { 0.64, 0.21, 0.93 }, { 1, 0.5, 0 } }
  local c = colors[q] or colors[1]
  return c[1], c[2], c[3], string.format("ff%02x%02x%02x", c[1] * 255, c[2] * 255, c[3] * 255)
end
GetItemInfo = C_Item.GetItemInfo
GetItemCount = C_Item.GetItemCount

C_Container = {
  -- A bag's slot count.
  GetContainerNumSlots = function(bag) return world.bagSizes[bag] or 0 end,
  -- Free slots, and the bag's family (0: anything).
  GetContainerNumFreeSlots = function(bag)
    local used = 0
    for _ in pairs(world.bags[bag] or {}) do used = used + 1 end
    return (world.bagSizes[bag] or 0) - used, 0
  end,
  -- Item info in a bag slot, as the client's table.
  GetContainerItemInfo = function(bag, slot)
    local it = (world.bags[bag] or {})[slot]
    if not it then return nil end
    local _, link, quality, _, _, _, _, _, _, icon = C_Item.GetItemInfo(it.itemID)
    return { iconFileID = it.icon or icon, stackCount = it.count or 1, quality = it.quality or quality, hyperlink = it.link or link, itemID = it.itemID, hasNoValue = (world.items[it.itemID] or {}).sellPrice == 0, isLocked = false }
  end,
  -- Uses (sells, at a merchant) an item; recorded.
  UseContainerItem = function(bag, slot) world.usedItems = world.usedItems or {} table.insert(world.usedItems, { bag, slot }) end,
  SortBags = function() world.sorted = true end,
}

-- Equipped items: world.inventory[slotId] = { itemID, durability, maxDurability }.
world.inventory = {}
-- Equipped items: icon, count and durability of a slot.
function GetInventoryItemTexture(_, slot) local it = world.inventory[slot] return it and (world.items[it.itemID] or {}).icon end
function GetInventoryItemCount(_, slot) return world.inventory[slot] and 1 or 0 end
function GetInventoryItemDurability(slot) local it = world.inventory[slot] if not it then return nil end return it.durability or 100, it.maxDurability or 100 end

-- Merchants: world.merchant = { items = { { name, icon, price, stack, left, link } }, repair = cost }.
world.merchant = nil
-- The merchant API, read from world.merchant.
function GetMerchantNumItems() return world.merchant and #world.merchant.items or 0 end

-- name, icon, price, stack, numAvailable, isPurchasable, isUsable of a merchant item.
function GetMerchantItemInfo(i)
  local it = world.merchant and world.merchant.items[i]
  if not it then return nil end
  return it.name, it.icon, it.price or 0, it.stack or 1, it.left or -1, true, false
end
-- Links, stacks, buying and repairing at the merchant.
function GetMerchantItemLink(i) local it = world.merchant and world.merchant.items[i] return it and (it.link or "|Hitem:" .. (it.itemID or 0) .. "|h[" .. it.name .. "]|h") end
function GetMerchantItemMaxStack(i) local it = world.merchant and world.merchant.items[i] return it and it.maxStack or 20 end
function BuyMerchantItem(i, n) world.bought = world.bought or {} table.insert(world.bought, { i, n or 1 }) end
function CanMerchantRepair() return world.merchant ~= nil and world.merchant.repair ~= nil end
function GetRepairAllCost() local r = world.merchant and world.merchant.repair return r or 0, r ~= nil and r > 0 end
function RepairAllItems() world.repaired = true world.money = world.money - GetRepairAllCost() end
C_MerchantFrame = {
  -- The older global names for the item API.
  GetItemInfo = function(i) local it = world.merchant and world.merchant.items[i] return it and { name = it.name, texture = it.icon, price = it.price or 0, stackCount = it.stack or 1, numAvailable = it.left or -1, isPurchasable = true } end,
  SellAllJunkItems = function() world.soldJunk = true end,
}

-- Trainers: world.trainer = { services = { { name, cost, available } } }.
world.trainer = nil
-- The trainer API, read from world.trainer.
function GetNumTrainerServices() return world.trainer and #world.trainer.services or 0 end
function GetTrainerServiceInfo(i) local s = world.trainer and world.trainer.services[i] if not s then return nil end return s.name, s.available ~= false and "available" or "unavailable", s.category or "" end
function GetTrainerServiceCost(i) local s = world.trainer and world.trainer.services[i] return s and s.cost or 0 end
function BuyTrainerService(i) world.trained = world.trained or {} table.insert(world.trained, i) world.money = world.money - GetTrainerServiceCost(i) end

-- Quests ----------------------------------------------------------------------------------------
-- world.quests: the log, in order: { questID, title, level, isComplete, watched,
-- objectives = { { text, finished, type } }, description, zone, isHeader }.
-- world.npc: an open quest giver: { greeting, available = { { title, level } },
-- active = { { title, level, complete } }, quest = { title, text, objectives, rewards = { { name, icon, count } }, choices = {...}, money, xp, complete, autoAccept } }.

world.quests = {}
world.npc = nil

-- The log entry at an index.
local function questAt(i) return world.quests[i] end

-- The index of a quest by id.
local function questIndex(id)
  for i, q in ipairs(world.quests) do if q.questID == id then return i, q end end
end

C_QuestLog = {
  -- Entries in the log, and how many are quests (not headers).
  GetNumQuestLogEntries = function() local n = 0 for _, q in ipairs(world.quests) do if not q.isHeader then n = n + 1 end end return #world.quests, n end,
  -- The log entry as the client's info table.
  GetInfo = function(i)
    local q = questAt(i)
    return q and { questID = q.questID, title = q.title, level = q.level or 1, isHeader = q.isHeader == true, isComplete = q.isComplete == true, isOnMap = true, hasLocalPOI = true, questLogIndex = i, isCollapsed = false, isHidden = false, isTask = false }
  end,
  GetLogIndexForQuestID = function(id) return (questIndex(id)) end,
  GetQuestObjectives = function(id) local _, q = questIndex(id) return q and q.objectives or {} end,
  IsComplete = function(id) local _, q = questIndex(id) return q ~= nil and q.isComplete == true end,
  GetNumQuestWatches = function() local n = 0 for _, q in ipairs(world.quests) do if q.watched then n = n + 1 end end return n end,
  -- The i-th watched quest's id.
  GetQuestIDForQuestWatchIndex = function(i)
    local n = 0
    for _, q in ipairs(world.quests) do
      if q.watched then n = n + 1 if n == i then return q.questID end end
    end
  end,
  GetQuestWatchType = function(id) local _, q = questIndex(id) return q and q.watched and 0 or nil end,
  AddQuestWatch = function(id) local _, q = questIndex(id) if q then q.watched = true stub.fire("QUEST_WATCH_LIST_CHANGED", id, true) end end,
  RemoveQuestWatch = function(id) local _, q = questIndex(id) if q then q.watched = nil stub.fire("QUEST_WATCH_LIST_CHANGED", id, false) end end,
  GetDistanceSqToQuest = function(id) local _, q = questIndex(id) return q and q.distanceSq or 0, true end,
  UnitIsRelatedToActiveQuest = function(unit) return uf(unit, "questRelated") == true end,
  SetSelectedQuest = function(id) world.selectedQuest = id end,
  GetSelectedQuest = function() return world.selectedQuest end,
  IsPushableQuest = function(id) local _, q = questIndex(id) return q ~= nil and q.pushable == true end,
  SetAbandonQuest = function() world.abandoning = world.selectedQuest end,
  AbandonQuest = function() local i = questIndex(world.abandoning) if i then table.remove(world.quests, i) stub.fire("QUEST_LOG_UPDATE") end end,
  GetQuestRewardCurrencies = function() return {} end,
  GetQuestRewardSpells = function() return {} end,
  GetQuestRewardSpellInfo = function() return nil end,
  GetMaxNumQuestsCanAccept = function() return 25 end,
}
C_QuestInfoSystem = {
  -- Reward spells: none.
  GetQuestRewardSpells = function() return {} end,
  GetQuestRewardSpellInfo = function() return nil end,
}

-- The older quest log globals, read from the selected quest.
function QuestLogPushQuest() world.pushed = world.selectedQuest end
function QuestMapFrame_OpenToQuestDetails(id) world.openedQuest = id end
function GetQuestLogSpecialItemInfo(i) local q = questAt(i) if not q or not q.item then return nil end return q.item.link, q.item.icon, q.item.charges or 0, true end
function GetQuestLogQuestText() local _, q = questIndex(world.selectedQuest) return q and q.description or "", q and q.objectivesText or "" end
function GetNumQuestLogChoices() local _, q = questIndex(world.selectedQuest) return q and q.choices and #q.choices or 0 end
function GetQuestLogChoiceInfo(i) local _, q = questIndex(world.selectedQuest) local c = q and q.choices and q.choices[i] if not c then return nil end return c.name, c.icon, c.count or 1, c.quality or 1, true end
function GetNumQuestLogRewards() local _, q = questIndex(world.selectedQuest) return q and q.rewards and #q.rewards or 0 end
function GetQuestLogRewardInfo(i) local _, q = questIndex(world.selectedQuest) local r = q and q.rewards and q.rewards[i] if not r then return nil end return r.name, r.icon, r.count or 1, r.quality or 1, true end
function GetQuestLogRewardMoney() local _, q = questIndex(world.selectedQuest) return q and q.money or 0 end
function GetQuestLogRewardXP() local _, q = questIndex(world.selectedQuest) return q and q.xp or 0 end

-- Adds a quest to the log and fires QUEST_LOG_UPDATE / QUEST_ACCEPTED.
function world.addQuest(q)
  q.objectives = q.objectives or {}
  table.insert(world.quests, q)
  stub.fire("QUEST_ACCEPTED", q.questID)
  stub.fire("QUEST_LOG_UPDATE")
  return q
end

-- Quest givers: gossip and the quest detail page.
local function npc() return world.npc or { available = {}, active = {}, options = {} } end
local function openQuest() return npc().quest or {} end

C_GossipInfo = {
  -- Gossip options and quests at the open NPC, and choosing among them.
  GetOptions = function() return npc().options or {} end,
  GetAvailableQuests = function() return npc().available or {} end,
  GetActiveQuests = function() return npc().active or {} end,
  GetText = function() return npc().greeting or "" end,
  SelectOption = function(id) world.gossipChosen = id end,
  SelectAvailableQuest = function(id) world.questChosen = id end,
  SelectActiveQuest = function(id) world.questChosen = id end,
  CloseGossip = function() world.npc = nil stub.fire("GOSSIP_CLOSED") end,
  GetNumOptions = function() return #(npc().options or {}) end,
}
-- The older quest giver globals, read from world.npc.
function GetGreetingText() return npc().greeting or "" end
function GetNumAvailableQuests() return #(npc().available or {}) end
function GetNumActiveQuests() return #(npc().active or {}) end
function GetAvailableTitle(i) local q = (npc().available or {})[i] return q and q.title end
function GetAvailableLevel(i) local q = (npc().available or {})[i] return q and q.level or 1 end
function GetActiveTitle(i) local q = (npc().active or {})[i] return q and q.title end
function GetActiveLevel(i) local q = (npc().active or {})[i] return q and q.level or 1 end
function SelectAvailableQuest(i) world.questChosen = i stub.fire("QUEST_DETAIL") end
function SelectActiveQuest(i) world.questChosen = i stub.fire("QUEST_PROGRESS") end
function GetTitleText() return openQuest().title or "" end
function GetQuestText() return openQuest().text or "" end
function GetObjectiveText() return openQuest().objectivesText or "" end
function GetProgressText() return openQuest().progress or "" end
function GetRewardText() return openQuest().rewardText or "" end
function GetQuestID() return openQuest().questID or 0 end
function GetRewardMoney() return openQuest().money or 0 end
function GetRewardXP() return openQuest().xp or 0 end
function GetNumQuestRewards() return #(openQuest().rewards or {}) end
function GetNumQuestChoices() return #(openQuest().choices or {}) end
function GetNumQuestItems() return #(openQuest().required or {}) end
function IsQuestCompletable() return openQuest().complete ~= false end
function QuestGetAutoAccept() return openQuest().autoAccept == true end
-- A reward, choice or required item: name, icon, count, quality, usable.
function GetQuestItemInfo(kind, i)
  local list = kind == "choice" and openQuest().choices or kind == "required" and openQuest().required or openQuest().rewards
  local it = (list or {})[i]
  if not it then return nil end
  return it.name, it.icon, it.count or 1, it.quality or 1, true
end
-- A quest item's link, and the quest giver actions, each closing the window as the client does.
function GetQuestItemLink(kind, i) local name = GetQuestItemInfo(kind, i) return name and "|Hitem:0|h[" .. name .. "]|h" end
function AcceptQuest() local q = openQuest() world.accepted = q.questID world.npc = nil stub.fire("QUEST_FINISHED") end
function AcknowledgeAutoAcceptQuest() AcceptQuest() end
function DeclineQuest() world.declined = true world.npc = nil stub.fire("QUEST_FINISHED") end
function CloseQuest() world.npc = nil stub.fire("QUEST_FINISHED") end
function CompleteQuest() stub.fire("QUEST_COMPLETE") end
function GetQuestReward(choice) world.rewardChosen = choice world.npc = nil stub.fire("QUEST_FINISHED") end
function SetPortraitTexture(texture) texture:SetTexture("TEST-ONLY-PORTRAIT") end

-- Opens a quest giver's window: gossip (GOSSIP_SHOW), or a quest's detail page (QUEST_DETAIL).
function world.openNpc(data)
  world.npc = data
  if data.quest and not data.options and not data.available and not data.active then
    stub.fire(data.quest.complete and "QUEST_COMPLETE" or "QUEST_DETAIL")
  else
    stub.fire("GOSSIP_SHOW")
  end
end

-- Map and zone -----------------------------------------------------------------------------------

world.zone = { name = "Elwynn Forest", sub = "Goldshire", pvp = "friendly", mapId = 37, x = 0.4567, y = 0.123 }
-- Zone names and PvP status from world.zone.
function GetMinimapZoneText() return world.zone.sub or world.zone.name end
function GetRealZoneText() return world.zone.name end
function GetSubZoneText() return world.zone.sub or "" end
function GetZonePVPInfo() return world.zone.pvp end
C_PvP = { GetZonePVPInfo = viaGlobal("GetZonePVPInfo") }
C_Map = {
  -- The map id, and the player's position on it.
  GetBestMapForUnit = function() return world.zone.mapId end,
  -- The player's map position as a vector with GetXY.
  GetPlayerMapPosition = function()
    return {
      -- x, y as fractions of the map.
      GetXY = function() return world.zone.x, world.zone.y end,
    }
  end,
}

-- The game's tools ------------------------------------------------------------------------------

C_CooldownViewer = {
  -- Whether the Cooldown Manager exists (a test sets world.cooldownViewer).
  IsCooldownViewerAvailable = function() return world.cooldownViewer == true end,
}
C_DamageMeter = {
  -- The last fight's session, when a test sets world.damageSession.
  GetCombatSessionFromType = function() return world.damageSession end,
}

-- Chat and the game's frames ----------------------------------------------------------------------

world.chatFilters = {}
-- Chat filters, temporary windows and the FCF helpers the addon calls.
function ChatFrame_AddMessageEventFilter(event, fn) world.chatFilters[event] = world.chatFilters[event] or {} table.insert(world.chatFilters[event], fn) end
function FCF_OpenTemporaryWindow(name) local f = stub.newWidget("ScrollingMessageFrame", "ChatFrameTemp" .. name, UIParent) return f end
function FCF_Tab_OnClick() end
function FCF_RestorePositionAndDimensions() end
function FCF_SetChatWindowFontSize(_, frame, size) frame:SetFont(STANDARD_TEXT_FONT, size, "") end

-- The game's chat windows: NUM_CHAT_WINDOWS frames with tabs and edit boxes.
local function chatFrames()
  local new = stub.newWidget
  NUM_CHAT_WINDOWS = 2
  for i = 1, NUM_CHAT_WINDOWS do
    local f = new("ScrollingMessageFrame", "ChatFrame" .. i, UIParent)
    f:SetFont(STANDARD_TEXT_FONT, 14, "")
    local tab = new("Button", "ChatFrame" .. i .. "Tab", UIParent)
    tab.Text = tab:CreateFontString(nil, "OVERLAY")
    new("EditBox", "ChatFrame" .. i .. "EditBox", UIParent)
  end
  SELECTED_CHAT_FRAME = ChatFrame1
end

-- The game's minimap and its cluster, with the buttons the addon fades.
local function minimapFrames()
  local new = stub.newWidget
  Minimap = new("Minimap", "Minimap", UIParent)
  Minimap:SetSize(140, 140)
  Minimap.ZoomIn = new("Button", "MinimapZoomIn", Minimap)
  Minimap.ZoomOut = new("Button", "MinimapZoomOut", Minimap)
  MinimapCluster = new("Frame", "MinimapCluster", UIParent)
  MinimapCluster.BorderTop = new("Frame", nil, MinimapCluster)
end

-- The tooltip's lines: owner, text and added lines, as the client keeps them.
local function tooltipLines(tip)
  -- Owner and anchor, then the lines.
  function tip:SetOwner(owner, anchor) self.__owner, self.__anchor, self.__lines = owner, anchor, {} end
  function tip:GetOwner() return self.__owner end
  function tip:SetText(text, r, g, b) self.__lines = { { text = text, r = r, g = g, b = b } } end
  function tip:AddLine(text, r, g, b) self.__lines = self.__lines or {} table.insert(self.__lines, { text = text, r = r, g = g, b = b }) end
  function tip:AddDoubleLine(left, right) self.__lines = self.__lines or {} table.insert(self.__lines, { text = left, right = right }) end
  function tip:NumLines() return #(self.__lines or {}) end
  function tip:ClearLines() self.__lines = {} end
end

-- The tooltip's action methods.
local function tooltipAction(tip)
  -- An action slot's tooltip, as the client fills it: true when the slot holds an action.
  function tip:SetAction(slot)
    self.__action = slot
    self.__lines = { { text = actionOf(slot).name } }
    return HasAction(slot)
  end
end

-- GameTooltip: a hidden frame with the methods the addon calls, recorded.
local function tooltipFrame()
  local tip = stub.newWidget("Frame", "GameTooltip", UIParent)
  tip:Hide()
  tooltipLines(tip)
  tooltipAction(tip)
  -- What the tooltip was set to: a unit, an equipped item, a link or an item id.
  function tip:SetUnit(unit) self.__unit = unit self.__lines = { { text = UnitName(unit) } } end
  function tip:SetInventoryItem(unit, slot) self.__item = { unit = unit, slot = slot } end
  function tip:SetHyperlink(link) self.__link = link end
  function tip:SetItemByID(id) self.__itemId = id end
  function tip:GetItem() return self.__itemName, self.__itemLink end
  return tip
end

-- The game's own frames the addon re-skins, hides or moves: unit frames,
-- the cast bar, the error line and the tooltip.
local function blizzardFrames()
  local new = stub.newWidget
  chatFrames()
  minimapFrames()
  for _, name in ipairs({ "PlayerFrame", "TargetFrame", "FocusFrame", "PetFrame", "PlayerCastingBarFrame" }) do
    new("Frame", name, UIParent)
  end
  UIErrorsFrame = new("ScrollingMessageFrame", "UIErrorsFrame", UIParent)
  GameTooltip = tooltipFrame()
end

blizzardFrames()

-- The client's default tooltip anchor: owned by the frame, placed by the game.
function GameTooltip_SetDefaultAnchor(tooltip, parent) tooltip:SetOwner(parent, "ANCHOR_NONE") end

-- Resets the world to its defaults (units, actions, bags, quests) without touching frames.
function world.reset()
  world.units = { player = defaultPlayer() }
  world.actions, world.quests, world.npc, world.merchant, world.trainer = {}, {}, nil, nil, nil
  world.cursor, world.timers = nil, {}
  refreshWatches()
end
