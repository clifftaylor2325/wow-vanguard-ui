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
-- arithmetic, comparison, concatenation, length, a call and a field read or
-- write. Here it is a table under a metatable that raises on each of those, so
-- the same mistakes fail (a plain table would only fail some of them). What
-- the real client's type() returns for a secret number is not confirmed
-- (issue #284 records it); until then type(secret) is "table" here.

-- What a secret refuses: every metamethod raises this.
local function refuse()
  error("attempt to use a secret value", 2)
end

local SECRET = {
  __index = refuse, __newindex = refuse, __call = refuse,
  __add = refuse, __sub = refuse, __mul = refuse, __div = refuse, __mod = refuse, __pow = refuse, __unm = refuse,
  __concat = refuse, __len = refuse, __lt = refuse, __le = refuse,
}

-- A secret value (hides `n`, which only the harness reads, with rawget).
function world.secret(n)
  return setmetatable({ __secret = true, n = n }, SECRET)
end

-- Whether a value is a secret.
function issecretvalue(v)
  return type(v) == "table" and rawget(v, "__secret") == true
end

world.aurasSecret = false
C_Secrets = {
  -- Whether the client hides aura values right now.
  ShouldAurasBeSecret = function() return world.aurasSecret end,
  -- Whether one aura's values are hidden: every aura's while auras are, else this one's when its times are secrets.
  ShouldUnitAuraInstanceBeSecret = function(unit, id)
    local aura = C_UnitAuras.GetAuraDataByAuraInstanceID(unit, id)
    return world.aurasSecret or (aura ~= nil and (issecretvalue(aura.duration) or issecretvalue(aura.expirationTime)))
  end,
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

-- The realm you're on (a test may change it).
world.realm = "Forever Test"
-- Its name (ConnectionDocumentation.lua's GetRealmName).
function GetRealmName() return world.realm end
-- Its name without spaces or hyphens (PlayerScriptDocumentation.lua's GetNormalizedRealmName).
function GetNormalizedRealmName() return (world.realm:gsub("[ %-]", "")) end

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
world.addons = { Vanguard = { Version = "0.3.0", Title = "Vanguard" } }
-- A TOC field of an addon.
function GetAddOnMetadata(name, field) return (world.addons[name] or {})[field] end
C_AddOns = {
  GetAddOnMetadata = viaGlobal("GetAddOnMetadata"),
  -- Loading a Blizzard addon: true for the ones the world lists as loadable.
  LoadAddOn = function(name) return world.loadable and world.loadable[name] == true, nil end,
  IsAddOnLoaded = function(name) return name == "Vanguard" end,
}

-- Modifier keys: whatever a test puts in world.keys.
function IsShiftKeyDown() return world.keys.shift == true end
function IsControlKeyDown() return world.keys.ctrl == true end
function IsAltKeyDown() return world.keys.alt == true end

-- The cursor's screen position, in pixels.
function GetCursorPosition() return world.mouse.x, world.mouse.y end

-- What's on the cursor: nil, or { type, id, ... } from a pickup.
world.cursor = nil
-- The cursor's contents as type, id, subtype; a spell as the client gives it: "spell", book index, book type, spell id.
function GetCursorInfo()
  local c = world.cursor
  if not c then return nil end
  if c.type == "spell" then return "spell", c.index or 1, c.subType or "spell", c.id end
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
  SpellBookSpellBank = { Player = 0, Pet = 1 },
  SpellBookItemType = { None = 0, Spell = 1, FutureSpell = 2, PetAction = 3, Flyout = 4 },
  StatusBarInterpolation = { Immediate = 0, Smooth = 1 },
  -- A subset of Enum.TooltipDataLineType with the client's values (TooltipInfoSharedDocumentation.lua).
  TooltipDataLineType = { None = 0, Blank = 1, UnitName = 2, UnitThreat = 7, QuestObjective = 8, QuestTitle = 17, QuestPlayer = 18 },
  TooltipDataType = { Item = 0, Spell = 1, Unit = 2 },
  WeaponSlot = { MainHand = 0, OffHand = 1 },
}

STANDARD_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
-- The engine's floating damage font path (Blizzard_Fonts_Shared/Shared/GameFonts.xml, the enUS value).
DAMAGE_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
UISpecialFrames = {}

-- securecallfunction: calls fn with the arguments (the bundled
-- CallbackHandler-1.0 dispatches callbacks through it).
function securecallfunction(fn, ...)
  return fn(...)
end

-- The hooks hooksecurefunc made: each stands in for the function it hooks, so
-- wow-taint.lua looks through it to the code that called the function.
stub.transparent = setmetatable({}, { __mode = "k" })

-- hooksecurefunc: runs fn after the function, as FrameXML does. A global name
-- hooks _G; a missing function is left alone.
function hooksecurefunc(t, name, fn)
  if type(t) == "string" then t, name, fn = _G, t, name end
  local orig = t[name]
  if type(orig) ~= "function" then return end
  -- The original, then the hook, with the original's results.
  local function hooked(...)
    local results = { orig(...) }
    fn(...)
    return unpack(results)
  end
  stub.transparent[hooked] = true
  t[name] = hooked
end

-- debugstack(start): the Lua call stack as text, `start` levels above its caller (1 = the function
-- that called debugstack), as Blizzard_ScriptErrors.lua reads it: `debugstack(debugStackLevel)`.
-- Built from debug.traceback without its "stack traceback:" header, one frame per line.
function debugstack(start)
  local text = debug.traceback("", (tonumber(start) or 1) + 1)
  return (text:gsub("^\n?stack traceback:\n?", ""))
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

-- Events the client knows: anything the addon registers, unless listed here (or by a test) as invalid.
-- LEARNED_SPELL_IN_TAB is gone from Forever (11.0 renamed it LEARNED_SPELL_IN_SKILL_LINE:
-- Blizzard_Deprecated/11_0_0_SpellBookAPITransitionGuide.lua, SpellBookDocumentation.lua).
world.invalidEvents = { LEARNED_SPELL_IN_TAB = true }
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

-- The command a key is bound to ("" when free), the reverse of world.bindings.
function GetBindingAction(key)
  for command, keys in pairs(world.bindings) do
    for _, k in ipairs(keys) do if k == key then return command end end
  end
  return ""
end

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

-- A number as the client abbreviates it (12.3K, 1.2M); secrets stay secret.
function AbbreviateNumbers(v)
  if issecretvalue(v) then local n = rawget(v, "n") return world.secret(n and AbbreviateNumbers(n)) end
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
      if issecretvalue(n) then local v = rawget(n, "n") return world.secret(v and self:Format(v)) end
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
-- The number inside a value that may be secret (the harness looks; the addon never does).
local function inside(v) return issecretvalue(v) and rawget(v, "n") or v end

-- A unit's health as a percent (0 to 100); with a curve, what the curve gives at the fraction (0 to 1), as the client
-- evaluates it. With hidden health, a color comes back with hidden components.
function UnitHealthPercent(unit, _, curve)
  local u = resolveUnit(unit)
  local hp, max = u and inside(u.hp), u and inside(u.maxhp)
  local fraction = max and max > 0 and hp / max or 0
  if type(curve) ~= "table" or not curve.Evaluate then return fraction * 100 end
  local c = curve:Evaluate(fraction)
  if not (u and (issecretvalue(u.hp) or issecretvalue(u.maxhp))) then return c end
  return CreateColor(world.secret(c.r), world.secret(c.g), world.secret(c.b), world.secret(c.a))
end
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
function UnitIsTapDenied(unit) return uf(unit, "tapDenied") == true end
function UnitAffectingCombat(unit) return uf(unit, "inCombat") == true end
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

-- Enters or leaves combat, as the client does: PLAYER_REGEN_DISABLED fires just
-- before the lockdown starts (its handlers may still touch protected frames), and
-- PLAYER_REGEN_ENABLED just after it ends.
function world.combat(on)
  if stub.inCombat == on then return end
  if on then stub.fire("PLAYER_REGEN_DISABLED") end
  stub.inCombat = on
  if not on then stub.fire("PLAYER_REGEN_ENABLED") end
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

-- A duration object for an aura or cast: the client's "secret-safe" timer. It is a
-- userdata in the client (LuaDurationObject, ObjectType "Userdata"), so it is one here.
local function durationObject(start, duration)
  local d = { start = start, duration = duration }
  -- Start, total, end and remaining time; IsZero and HasSecretValues as the client's.
  function d:GetStartTime() return self.start end
  function d:GetTotalDuration() return self.duration end
  function d:GetEndTime() return self.start + self.duration end
  function d:GetRemainingDuration() return math.max(0, self.start + self.duration - stub.now) end
  function d:IsZero() return self.duration == 0 end
  function d:HasSecretValues() return issecretvalue(self.duration) end
  return __wfgUserdata(d)
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

local containers, scanned = {}, 0
-- The aura containers made so far, in creation order. Widgets are only ever
-- added to stub.frames, so each is looked at once, not on every aura change.
local function auraContainers()
  for i = scanned + 1, #stub.frames do
    if stub.frames[i].__kind == "AuraContainer" then containers[#containers + 1] = stub.frames[i] end
  end
  scanned = #stub.frames
  return containers
end

-- The client's aura containers showing a unit read its auras again (the
-- client does this itself on an aura change), then UNIT_AURA fires.
local function auraChanged(unit, payload)
  local u = resolveUnit(unit)
  for _, w in ipairs(auraContainers()) do
    if w.__unit and resolveUnit(w.__unit) == u then w:UpdateAllAuras() end
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
  -- Puts the spell on the cursor.
  PickupSpell = function(key) local id = spellOf(key) world.cursor = id and { type = "spell", id = id } or nil end,
  GetSpellName = function(key) local _, s = spellOf(key) return s and s.name end,
  GetSpellTexture = function(key) local _, s = spellOf(key) return s and s.icon end,
  -- The spell's power costs, as a list of { type, cost, name }.
  GetSpellPowerCost = function(key)
    local _, s = spellOf(key)
    return s and { { type = s.costType or 0, cost = s.cost or 0, name = s.costName or "MANA" } } or {}
  end,
}

-- Whether a spell is cast on friends (the healer's spells and buffs in the world).
function C_Spell.IsSpellHelpful(key)
  local _, s = spellOf(key)
  return s ~= nil and s.helpful == true
end

-- The spellbook: world.book is the list of learned spellbook items, in book order,
-- as { id, rank, passive, offSpec } over world.spells; C_SpellBook reads it as one
-- skill line. world.learn(id, fields) adds a spell to both and fires SPELLS_CHANGED.
world.book = {}

-- Adds a spell to the world and the spellbook (fields: name, icon, rank, helpful, passive, offSpec, cost).
function world.learn(id, fields)
  world.spells[id] = world.spells[id] or { name = fields.name, icon = fields.icon or "Interface\\Icons\\TEST-ONLY", cost = fields.cost or 0, helpful = fields.helpful }
  world.book[#world.book + 1] = { id = id, rank = fields.rank, passive = fields.passive, offSpec = fields.offSpec }
  stub.fire("SPELLS_CHANGED")
end

-- Whether the player knows a spell (it is in the spellbook, rank or not).
function IsPlayerSpell(id)
  for _, item in ipairs(world.book) do
    if item.id == id then return true end
  end
  return false
end

-- Forgets every learned spell (the spellbook is empty again).
function world.forgetAll()
  world.book = {}
  stub.fire("SPELLS_CHANGED")
end

C_SpellBook = {
  -- One skill line while anything is learned.
  GetNumSpellBookSkillLines = function() return #world.book > 0 and 1 or 0 end,
  -- The one skill line holds every learned spell.
  GetSpellBookSkillLineInfo = function(line) if line ~= 1 then return nil end return { name = "General", itemIndexOffset = 0, numSpellBookItems = #world.book } end,
  -- A spellbook item as the client describes it: name, subName ("Rank 3"), icon, spellID, itemType, isPassive, isOffSpec.
  GetSpellBookItemInfo = function(index, bank)
    local item = bank == Enum.SpellBookSpellBank.Player and world.book[index]
    local s = item and world.spells[item.id]
    if not s then return nil end
    return { name = s.name, subName = item.rank and ("Rank " .. item.rank) or "", iconID = s.icon, spellID = item.id, actionID = item.id,
      itemType = Enum.SpellBookItemType.Spell, isPassive = item.passive == true, isOffSpec = item.offSpec == true }
  end,
  -- A spellbook item's name and rank text.
  GetSpellBookItemName = function(index, bank)
    local info = C_SpellBook.GetSpellBookItemInfo(index, bank)
    return info and info.name, info and info.subName
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
-- Places a spell on the cursor onto the slot (nothing comes back to the cursor), and records the slot.
function PlaceAction(slot)
  local c = world.cursor
  world.placed, world.cursor = slot, nil
  if c and c.type == "spell" then world.setAction(slot, { id = c.id }) end
end
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
-- quality, link, sellPrice, junk }. world.items[itemID] gives GetItemInfo
-- (and GetItemInfoInstant: classID, subClassID; quest = true for a quest item).

world.money = 123456
world.bags = { [0] = {}, {}, {}, {}, {} }
world.bagSizes = { [0] = 16, 16, 16, 16, 16 }
world.items = {
  [6948] = { name = "Hearthstone", icon = "Interface\\Icons\\INV_Misc_Rune_01", quality = 1, sellPrice = 0, classID = 15, subClassID = 0 },
  [159] = { name = "Refreshing Spring Water", icon = "Interface\\Icons\\INV_Drink_07", quality = 1, sellPrice = 5, classID = 0, subClassID = 5 },
  [2589] = { name = "Linen Cloth", icon = "Interface\\Icons\\INV_Fabric_Linen_01", quality = 1, sellPrice = 13, classID = 7, subClassID = 5 },
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
  return item.name, link, item.quality or 1, item.level or 1, 1, item.type or "Miscellaneous", item.subType or "Junk", item.stack or 20, item.equipLoc or "", item.icon, item.sellPrice or 0, 15, 0, item.bind or 0, 0, 0, item.quality == 0
end
-- itemID, type, subType, equipLoc, icon, classID, subClassID of a known item (nothing for one the client doesn't know).
function C_Item.GetItemInfoInstant(key)
  local id, item = itemOf(key)
  if not item then return end
  return id, item.type or "Miscellaneous", item.subType or "Junk", item.equipLoc or "", item.icon, item.classID or 15, item.subClassID or 0
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
    return { iconFileID = it.icon or icon, stackCount = it.count or 1, quality = it.quality or quality, hyperlink = it.link or link, itemID = it.itemID, hasNoValue = (world.items[it.itemID] or {}).sellPrice == 0, isLocked = it.locked == true }
  end,
  -- Whether a slot holds a quest item (the item's quest = true) and the quest it starts (questID).
  GetContainerItemQuestInfo = function(bag, slot)
    local it = (world.bags[bag] or {})[slot]
    local item = it and world.items[it.itemID] or {}
    return { isQuestItem = item.quest == true, questID = item.questID, isActive = false }
  end,
  -- Uses (sells, at a merchant) an item; recorded.
  UseContainerItem = function(bag, slot) world.usedItems = world.usedItems or {} table.insert(world.usedItems, { bag, slot }) end,
  SortBags = function() world.sorted = true end,
}

-- Equipped items: world.inventory[slotId] = { itemID, durability, maxDurability }; world.worn[slotId]
-- = the item's link, for what GetInventoryItemLink gives.
world.inventory, world.worn = {}, {}
-- The link of what a slot wears (world.worn), as the addon compares gear by.
function GetInventoryItemLink(_, slot) return world.worn[slot] end
-- An item's stats (world.items[id].stats, ITEM_MOD_* keys to amounts), none for an item without.
function C_Item.GetItemStats(key) local _, item = itemOf(key) return item and item.stats end
-- Whether an item can be worn: it has an equip location that isn't INVTYPE_NON_EQUIP.
function C_Item.IsEquippableItem(key) local _, item = itemOf(key) return item ~= nil and item.equipLoc ~= nil and item.equipLoc ~= "" and item.equipLoc ~= "INVTYPE_NON_EQUIP" end
C_PlayerInfo = C_PlayerInfo or {}
-- Whether you can use an item: unless world.items[id].unusable.
function C_PlayerInfo.CanUseItem(id) local _, item = itemOf(id) return not (item and item.unusable) end
-- Equipped items: icon, count and durability of a slot.
function GetInventoryItemTexture(_, slot) local it = world.inventory[slot] return it and (world.items[it.itemID] or {}).icon end
function GetInventoryItemCount(_, slot) return world.inventory[slot] and 1 or 0 end
function GetInventoryItemDurability(slot) local it = world.inventory[slot] if not it then return nil end return it.durability or 100, it.maxDurability or 100 end

-- Merchants: world.merchant = { items = { { name, icon, price, stack, left, link, itemID } }, repair = cost },
-- and the merchant you talk to is the "npc" unit: world.units.npc = { name = ... }.
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
function GetMerchantItemID(i) local it = world.merchant and world.merchant.items[i] return it and it.itemID end
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
  -- The log entry as the client's QuestInfo (no completion field: IsComplete answers that).
  GetInfo = function(i)
    local q = questAt(i)
    return q and { questID = q.questID, title = q.title, level = q.level or 1, isHeader = q.isHeader == true, isOnMap = true, hasLocalPOI = true, questLogIndex = i, isCollapsed = false, isHidden = false, isTask = false }
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
-- A unit's tooltip data (TooltipInfoDocumentation.lua, GetUnit): its `tooltipLines`, each { type, leftText }
-- with a type from Enum.TooltipDataLineType; nothing for a unit that does not exist.
C_TooltipInfo = {
  -- The unit's tooltip data, or nothing.
  GetUnit = function(unit) local u = resolveUnit(unit) return u and { type = Enum.TooltipDataType.Unit, lines = u.tooltipLines or {} } or nil end,
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
function GetQuestLogRewardXP(id) local _, q = questIndex(id or world.selectedQuest) return q and q.xp or 0 end

-- world.questTimers: the timed quests, { questID, endsAt } each (world.setQuestTimer); endsAt a secret for
-- a timer the client hides.
world.questTimers = {}

-- Seconds left on one timed quest: as the clock stands, or the secret as it is.
local function timerLeft(t)
  if issecretvalue(t.endsAt) then return t.endsAt end
  return math.max(0, t.endsAt - stub.now)
end

-- The timed quests' remaining seconds, as the game's timer frame reads them (Blizzard_QuestTimer.lua;
-- QuestLogDocumentation.lua's QuestTimerInfo: questID, questTimer).
function C_QuestLog.GetQuestTimers()
  local out = {}
  for _, t in ipairs(world.questTimers) do out[#out + 1] = { questID = t.questID, questTimer = timerLeft(t) } end
  return out
end

-- Starts a quest's timer (seconds left; a secret for one the client hides) or clears it (nil), then
-- fires QUEST_LOG_UPDATE as the log does.
function world.setQuestTimer(questID, seconds)
  local kept = {}
  for _, t in ipairs(world.questTimers) do if t.questID ~= questID then kept[#kept + 1] = t end end
  if seconds ~= nil then kept[#kept + 1] = { questID = questID, endsAt = issecretvalue(seconds) and seconds or stub.now + seconds } end
  world.questTimers = kept
  stub.fire("QUEST_LOG_UPDATE")
end

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
  -- GossipInfoDocumentation.lua: SelectOptionByIndex(optionID = an option's orderIndex) and ForceGossip (the NPC
  -- wants its gossip shown even with one option), which the game's gossip frame reads before it skips to one.
  SelectOptionByIndex = function(index) world.gossipChosenIndex = index end,
  ForceGossip = function() return npc().forceGossip == true end,
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
function GetZoneText() return world.zone.name end
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
  -- How long the last fight lasted, when a test sets world.damageSeconds.
  GetSessionDurationSeconds = function() return world.damageSeconds end,
}

-- The auction house --------------------------------------------------------------------------------
-- C_AuctionHouse as Blizzard_APIDocumentationGenerated/AuctionHouseDocumentation.lua has it, with
-- the ItemLocation and C_Cursor stand-ins it takes. The test is the server: what a query would
-- bring back sits in world.ah, a query is only recorded (world.ah.queries, { fn, args }), and the
-- test fires the result event itself (world.fireAuctionEvents fires every one).
--   browse = { BrowseResultInfo, ... }                items[itemID] = { ItemSearchResultInfo, ... }
--   commodities[itemID] = { CommoditySearchResultInfo, ... }
--   replicate = { { count, buyoutPrice, itemID, link, ... }, ... }  rows by GetReplicateItemInfo's return
--     names (link: GetReplicateItemLink's, else built from the itemID), read 0-based as the
--     client's; world.ah.reads counts the reads, world.ah.linkReads the links read
--   owned = { OwnedAuctionInfo, ... }; ready and copper (true unless set false); needsConfirm (a
--   post the client wants confirmed); deposit (copper per item per duration step); cancelCost;
--   noCancel[auctionID]; browseFull (false: more browse results to ask for); more[itemID] (true: another
--   page of that item's search results to ask for); searchFull (false: more of any item or commodity
--   search results to ask for).
-- The calls the client restricts to a hardware event (HasRestrictions: PostItem, PostCommodity,
-- ConfirmPostItem, ConfirmPostCommodity, CancelAuction, PlaceBid, StartCommoditiesPurchase) are
-- logged in world.ah.restricted as { fn, args, clicked, path }: clicked says whether a click was
-- running (stub.click), path is the Lua stack that made the call.
-- world.ah.throttle = true models what a post does to the client (AuctionHouseDocumentation.lua;
-- the game's sell frame follows the same throttle, Blizzard_AuctionHouseSellFrame.lua CanPostItem):
-- a PostItem or PostCommodity the client doesn't want confirmed sends a throttled message, so
-- AUCTION_HOUSE_THROTTLED_MESSAGE_SENT fires, IsThrottledMessageSystemReady answers false and the
-- posted bag slot is locked (world.bags entry .locked, GetContainerItemInfo's isLocked) until the
-- test calls world.finishPost(auctionID): the house took the stack (the units leave the slot),
-- AUCTION_HOUSE_AUCTION_CREATED, BAG_UPDATE_DELAYED and AUCTION_HOUSE_THROTTLED_SYSTEM_READY fire.
-- Off (the default), the throttle stays ready and nothing leaves the bags.
-- world.items[id].commodity = true makes an item a commodity, .noAuction one the house won't take,
-- .pending one whose item key info the client hasn't loaded yet, .equipment one the house calls equipment.

Enum.ItemCommodityStatus = { Unknown = 0, Item = 1, Commodity = 2 }
Enum.AuctionHouseError = { NotEnoughMoney = 0, ItemNotFound = 4, HasRestriction = 6, IsBusy = 7, DatabaseError = 10 }
Enum.AuctionHouseSortOrder = { Price = 0, Name = 1, Level = 2, Bid = 3, Buyout = 4, TimeRemaining = 5 }
Enum.AuctionStatus = { Active = 0, Sold = 1 }

-- A fresh auction house with nothing listed.
local function emptyAuctionHouse()
  return { browse = {}, items = {}, commodities = {}, replicate = {}, owned = {}, queries = {}, restricted = {},
    reads = 0, linkReads = 0, deposit = 15, cancelCost = 0, noCancel = {}, more = {} }
end
world.ah = emptyAuctionHouse()

-- Clicks are hardware events: stub.hardware counts the clicks running now.
stub.hardware = 0
local rawClick = stub.click
-- A click, counted while it runs.
function stub.click(...)
  stub.hardware = stub.hardware + 1
  rawClick(...)
  stub.hardware = stub.hardware - 1
end

-- A query the addon may send at any time: recorded as { fn, args }.
local function query(name)
  return function(...) table.insert(world.ah.queries, { fn = name, args = { ... } }) end
end

-- A post the client sent with world.ah.throttle on: the throttle busy and the posted slot locked
-- until world.finishPost; its location and quantity are kept for that.
local function sendPost(loc, quantity)
  local it = loc and (world.bags[loc.bagID] or {})[loc.slotIndex]
  if it then it.locked = true end
  world.ah.ready, world.ah.posting = false, { loc = loc, quantity = quantity }
  stub.fire("AUCTION_HOUSE_THROTTLED_MESSAGE_SENT")
end

-- A restricted call: logged with whether a click was running and the code path that made it;
-- a post answers world.ah.needsConfirm (true: the client wants the post confirmed), and one it
-- sends drops the throttle with world.ah.throttle on.
local function restricted(name)
  return function(...)
    local args = { ... }
    table.insert(world.ah.restricted, { fn = name, args = args, clicked = stub.hardware > 0, path = debug.traceback("", 2) })
    if name ~= "PostItem" and name ~= "PostCommodity" then return end
    if world.ah.needsConfirm == true then return true end
    if world.ah.throttle then sendPost(args[1], args[3]) end
    return false
  end
end

-- The house took the post world.ah.throttle held: the stack's units leave its slot (the slot
-- empties when none are left), and the auction is made, the bags change and the throttle is ready.
function world.finishPost(auctionID)
  local p = world.ah.posting
  local bag, slot = p and p.loc.bagID, p and p.loc.slotIndex
  local it = bag and (world.bags[bag] or {})[slot]
  if it then it.locked, it.count = nil, (it.count or 1) - p.quantity end
  if it and it.count < 1 then world.bags[bag][slot] = nil end
  world.ah.ready, world.ah.posting = true, nil
  stub.fire("AUCTION_HOUSE_AUCTION_CREATED", auctionID)
  stub.fire("BAG_UPDATE_DELAYED")
  stub.fire("AUCTION_HOUSE_THROTTLED_SYSTEM_READY")
end

-- ItemLocation (Blizzard_ObjectAPI/Mainline/ItemLocation.lua): a bag and slot in world.bags.
ItemLocation = {}
local itemLocationMixin = {}
-- Its bag and slot, whether it names one, forgetting it, and whether an item is there.
function itemLocationMixin:GetBagAndSlot() return self.bagID, self.slotIndex end
function itemLocationMixin:IsBagAndSlot() return self.bagID ~= nil and self.slotIndex ~= nil end
function itemLocationMixin:Clear() self.bagID, self.slotIndex = nil, nil end
function itemLocationMixin:IsValid() return C_Item.DoesItemExist(self) end
-- The location of a bag slot.
function ItemLocation:CreateFromBagAndSlot(bag, slot)
  return setmetatable({ bagID = bag, slotIndex = slot }, { __index = itemLocationMixin })
end

-- The bag entry at a location, or nil.
local function itemAtLocation(loc)
  local bag, slot = loc and loc.bagID, loc and loc.slotIndex
  return bag and (world.bags[bag] or {})[slot] or nil
end
-- C_Item's location calls: whether an item is there, its ID, stack size and icon.
function C_Item.DoesItemExist(loc) return itemAtLocation(loc) ~= nil end
function C_Item.GetItemID(loc) local it = itemAtLocation(loc) return it and it.itemID end
function C_Item.GetStackCount(loc) local it = itemAtLocation(loc) return it and (it.count or 1) or 0 end
function C_Item.GetItemIcon(loc) local it = itemAtLocation(loc) return it and (world.items[it.itemID] or {}).icon end

C_Cursor = {
  -- The item on the cursor when it was picked up from a bag slot (world.cursor = { type = "item", id, bag, slot }).
  GetCursorItem = function()
    local c = world.cursor
    if c and c.type == "item" and c.bag then return ItemLocation:CreateFromBagAndSlot(c.bag, c.slot) end
  end,
}

-- An item key, as MakeItemKey and GetItemKeyFromItem give one.
local function itemKey(id, level, suffix)
  return { itemID = id, itemLevel = level or 0, itemSuffix = suffix or 0, battlePetSpeciesID = 0 }
end

-- What the house knows about an item key: nil for an item the client hasn't loaded yet.
local function itemKeyInfo(key)
  local item = world.items[key.itemID]
  if not item or item.pending then return nil end
  return { itemID = key.itemID, battlePetSpeciesID = 0, itemName = item.name, quality = item.quality or 1,
    iconFileID = item.icon, isPet = false, isCommodity = item.commodity == true, isEquipment = item.equipment == true }
end

-- An item location's Enum.ItemCommodityStatus: unknown (no item there, or one the client doesn't know), item or commodity.
local function commodityStatus(loc)
  local it = itemAtLocation(loc)
  local item = it and world.items[it.itemID]
  if not item then return Enum.ItemCommodityStatus.Unknown end
  return item.commodity and Enum.ItemCommodityStatus.Commodity or Enum.ItemCommodityStatus.Item
end

-- GetReplicateItemInfo's 18 returns, by name, in order.
local REPLICATE = { "name", "texture", "count", "qualityID", "usable", "level", "levelType", "minBid", "minIncrement",
  "buyoutPrice", "bidAmount", "highBidder", "bidderFullName", "owner", "ownerFullName", "saleStatus", "itemID", "hasAllInfo" }

-- Replicate list row `index` (0-based, as the client's) as GetReplicateItemInfo's 18 returns; every read is counted.
local function replicateInfo(index)
  world.ah.reads = world.ah.reads + 1
  local row = world.ah.replicate[index + 1]
  if not row then return nil end
  local out = {}
  for i, field in ipairs(REPLICATE) do out[i] = row[field] end
  return unpack(out, 1, #REPLICATE)
end

-- Replicate list row `index`'s item link: the row's `link`, else one built from its itemID (nil
-- past the list); every read is counted apart (world.ah.linkReads).
local function replicateLink(index)
  world.ah.linkReads = world.ah.linkReads + 1
  local row = world.ah.replicate[index + 1]
  if not row then return nil end
  return row.link or (select(2, C_Item.GetItemInfo(row.itemID)))
end

C_AuctionHouse = {
  -- Queries, recorded; the test answers by firing the result event.
  SendBrowseQuery = query("SendBrowseQuery"), SearchForItemKeys = query("SearchForItemKeys"),
  SendSearchQuery = query("SendSearchQuery"), SendSellSearchQuery = query("SendSellSearchQuery"),
  QueryOwnedAuctions = query("QueryOwnedAuctions"), ReplicateItems = query("ReplicateItems"),
  RequestMoreBrowseResults = query("RequestMoreBrowseResults"), CloseAuctionHouse = query("CloseAuctionHouse"),
  RequestMoreCommoditySearchResults = query("RequestMoreCommoditySearchResults"), RequestMoreItemSearchResults = query("RequestMoreItemSearchResults"),
  -- Restricted to a hardware event: logged with the code path.
  PostItem = restricted("PostItem"), PostCommodity = restricted("PostCommodity"),
  ConfirmPostItem = restricted("ConfirmPostItem"), ConfirmPostCommodity = restricted("ConfirmPostCommodity"),
  CancelAuction = restricted("CancelAuction"), PlaceBid = restricted("PlaceBid"),
  StartCommoditiesPurchase = restricted("StartCommoditiesPurchase"),
  GetReplicateItemInfo = replicateInfo,
  GetReplicateItemLink = replicateLink,
}

-- Browse results, and whether all of them are in.
function C_AuctionHouse.GetBrowseResults() return world.ah.browse end
function C_AuctionHouse.HasFullBrowseResults() return world.ah.browseFull ~= false end
-- Item keys, and what the house knows about one.
function C_AuctionHouse.MakeItemKey(id, level, suffix) return itemKey(id, level, suffix) end
function C_AuctionHouse.GetItemKeyInfo(key) return itemKeyInfo(key) end
-- Item search results for an item key (by its itemID), and commodity results for an itemID.
function C_AuctionHouse.GetNumItemSearchResults(key) return #(world.ah.items[key.itemID] or {}) end
function C_AuctionHouse.GetItemSearchResultInfo(key, i) return (world.ah.items[key.itemID] or {})[i] end
function C_AuctionHouse.GetNumCommoditySearchResults(id) return #(world.ah.commodities[id] or {}) end
function C_AuctionHouse.GetCommoditySearchResultInfo(id, i) return (world.ah.commodities[id] or {})[i] end
-- Whether every result of a search is in: world.ah.more[itemID] = true (another page of that item's
-- results) or world.ah.searchFull = false (more for any search) says there's more to ask for.
function C_AuctionHouse.HasFullCommoditySearchResults(id) return world.ah.more[id] ~= true and world.ah.searchFull ~= false end
function C_AuctionHouse.HasFullItemSearchResults(key) return world.ah.more[key and key.itemID] ~= true and world.ah.searchFull ~= false end
-- The replicate list's size, and your auctions.
function C_AuctionHouse.GetNumReplicateItems() return #world.ah.replicate end
function C_AuctionHouse.GetOwnedAuctions() return world.ah.owned end
function C_AuctionHouse.GetNumOwnedAuctions() return #world.ah.owned end
-- Selling: whether the house takes an item, commodity or item, its key, how many can go up (every one of
-- the item in the bags, as the game's sell frame's Max offers), and the deposit.
function C_AuctionHouse.IsSellItemValid(loc) local it = itemAtLocation(loc) return it ~= nil and (world.items[it.itemID] or {}).noAuction ~= true end
function C_AuctionHouse.GetItemCommodityStatus(loc) return commodityStatus(loc) end
function C_AuctionHouse.GetItemKeyFromItem(loc) local id = C_Item.GetItemID(loc) local item = world.items[id] or {} return itemKey(id, item.level, item.suffix) end
function C_AuctionHouse.GetAvailablePostCount(loc) local id = C_Item.GetItemID(loc) return id and C_Item.GetItemCount(id) or 0 end
function C_AuctionHouse.CalculateItemDeposit(_, duration, quantity) return world.ah.deposit * duration * quantity end
function C_AuctionHouse.CalculateCommodityDeposit(_, duration, quantity) return world.ah.deposit * duration * quantity end
-- The message throttle, copper prices, and cancelling one of your auctions.
function C_AuctionHouse.IsThrottledMessageSystemReady() return world.ah.ready ~= false end
function C_AuctionHouse.SupportsCopperValues() return world.ah.copper ~= false end
function C_AuctionHouse.CanCancelAuction(id) return world.ah.noCancel[id] ~= true end
function C_AuctionHouse.GetCancelCost() return world.ah.cancelCost end

-- Every auction house event (the documentation's LiteralNames).
world.AH_EVENTS = {
  "AUCTION_CANCELED", "AUCTION_HOUSE_AUCTION_CREATED", "AUCTION_HOUSE_AUCTIONS_EXPIRED", "AUCTION_HOUSE_BROWSE_FAILURE",
  "AUCTION_HOUSE_BROWSE_RESULTS_ADDED", "AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", "AUCTION_HOUSE_CLOSED", "AUCTION_HOUSE_DISABLED",
  "AUCTION_HOUSE_FAVORITES_UPDATED", "AUCTION_HOUSE_ITEM_DELIVERY_DELAY_UPDATE", "AUCTION_HOUSE_NEW_BID_RECEIVED",
  "AUCTION_HOUSE_NEW_RESULTS_RECEIVED", "AUCTION_HOUSE_POST_ERROR", "AUCTION_HOUSE_POST_WARNING", "AUCTION_HOUSE_PURCHASE_COMPLETED",
  "AUCTION_HOUSE_SCRIPT_DEPRECATED", "AUCTION_HOUSE_SHOW", "AUCTION_HOUSE_SHOW_COMMODITY_WON_NOTIFICATION", "AUCTION_HOUSE_SHOW_ERROR",
  "AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", "AUCTION_HOUSE_SHOW_NOTIFICATION", "AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED",
  "AUCTION_HOUSE_THROTTLED_MESSAGE_QUEUED", "AUCTION_HOUSE_THROTTLED_MESSAGE_RESPONSE_RECEIVED", "AUCTION_HOUSE_THROTTLED_MESSAGE_SENT",
  "AUCTION_HOUSE_THROTTLED_SYSTEM_READY", "AUCTION_MULTISELL_FAILURE", "AUCTION_MULTISELL_START", "AUCTION_MULTISELL_UPDATE",
  "BID_ADDED", "BIDS_UPDATED", "COMMODITY_PRICE_UNAVAILABLE", "COMMODITY_PRICE_UPDATED", "COMMODITY_PURCHASE_FAILED",
  "COMMODITY_PURCHASE_SUCCEEDED", "COMMODITY_PURCHASED", "COMMODITY_SEARCH_RESULTS_ADDED", "COMMODITY_SEARCH_RESULTS_RECEIVED",
  "COMMODITY_SEARCH_RESULTS_UPDATED", "EXTRA_BROWSE_INFO_RECEIVED", "ITEM_KEY_ITEM_INFO_RECEIVED", "ITEM_PURCHASED",
  "ITEM_SEARCH_RESULTS_ADDED", "ITEM_SEARCH_RESULTS_UPDATED", "OWNED_AUCTION_BIDDER_INFO_RECEIVED", "OWNED_AUCTIONS_UPDATED",
  "REPLICATE_ITEM_LIST_UPDATE",
}
-- The events whose payload is an item key (the rest get an ID: an itemID or an auction's).
local KEY_EVENTS = { AUCTION_HOUSE_NEW_RESULTS_RECEIVED = true, ITEM_SEARCH_RESULTS_ADDED = true, ITEM_SEARCH_RESULTS_UPDATED = true }

-- Fires every auction house event once, with `key` (an item key) or `id` as its payload.
function world.fireAuctionEvents(key, id)
  for _, event in ipairs(world.AH_EVENTS) do stub.fire(event, KEY_EVENTS[event] and key or id) end
end

-- TEST-ONLY shapes of the game's PanelTemplates tab calls (Blizzard_SharedXML PanelTemplates.lua):
-- the tab count and the selected tab are kept on the window. How many tabs the window has.
function PanelTemplates_SetNumTabs(frame, n) frame.numTabs = n end
-- The selected tab, by number.
function PanelTemplates_SetTab(frame, id) frame.selectedTab = id end
-- The selected tab's number.
function PanelTemplates_GetSelectedTab(frame) return frame.selectedTab end
-- A tab sized to its text (the text's width plus the padding, at least the minimum), as the game does.
-- Text is measured at the harness's 6 px a character.
function PanelTemplates_TabResize(tab, padding, absoluteSize, minWidth)
  local w = absoluteSize or (#(tab:GetText() or "") * 6 + (padding or 0))
  tab:SetWidth(math.max(minWidth or 0, w))
end
-- The window's display modes (Blizzard_AuctionHouseFrame.lua): each names the window's frames it shows.
AuctionHouseFrameDisplayMode = { Buy = { "BrowseResultsFrame" }, ItemSell = { "ItemSellFrame" }, Auctions = { "AuctionsFrame" } }

-- The tab template's OnClick (AuctionHouseFrameDisplayModeTabMixin): the window's display mode set
-- to the tab's.
local function displayModeClick(self)
  local w = self:GetParent()
  if w and w.SetDisplayMode then w:SetDisplayMode(self.displayMode) end
end

local rawCreateFrame = CreateFrame
-- CreateFrame with the tab template gives the button the template's OnClick and size, and puts it
-- in its parent's Tabs (PanelTabButtonTemplate's parentArray), as the game's XML does for the
-- window's own tabs and an addon's alike.
function CreateFrame(kind, name, parent, template, ...)
  local w = rawCreateFrame(kind, name, parent, template, ...)
  if template == "AuctionHouseFrameDisplayModeTabTemplate" then
    w:SetSize(80, 32)
    w:SetScript("OnClick", displayModeClick)
    parent.Tabs = parent.Tabs or {}
    table.insert(parent.Tabs, w)
  end
  return w
end

-- One of the window's tabs, after the last: its text and display mode (the template puts it in Tabs).
local function auctionTab(f, text, mode)
  local last = f.Tabs[#f.Tabs]
  local tab = CreateFrame("Button", "AuctionHouseFrame" .. text .. "Tab", f, "AuctionHouseFrameDisplayModeTabTemplate")
  tab:SetText(text)
  tab.displayMode = mode
  if last then tab:SetPoint("LEFT", last, "RIGHT", -15, 0) else tab:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 20, -28) end
  f.tabsForDisplayMode[mode] = #f.Tabs
end

-- The window's title, as PortraitFrameTemplate keeps it (TitleContainer.TitleText), and the game's
-- UpdateTitle: Buy, Sell or Auctions for tabs 1-3, the Buy title for any other tab.
local function auctionTitle(f)
  f.TitleContainer = { TitleText = f:CreateFontString(nil, "OVERLAY", "GameFontNormal") }
  -- The title text.
  function f:SetTitle(text) self.TitleContainer.TitleText:SetText(text) end
  -- The title for the selected tab.
  function f:UpdateTitle()
    local tab = PanelTemplates_GetSelectedTab(self)
    self:SetTitle(tab == 2 and "Sell" or tab == 3 and "Auctions" or "Browse Auctions")
  end
end

-- The game's SetDisplayMode: the mode kept (the same one again returns early), its tab selected
-- and the title updated; a mode with no tab (none of the game's has that) changes neither.
local function auctionDisplayMode(f)
  -- The display mode.
  function f:SetDisplayMode(mode)
    if self.displayMode == mode then return end
    self.displayMode = mode
    local tab = self.tabsForDisplayMode[mode]
    if tab then PanelTemplates_SetTab(self, tab) self:UpdateTitle() end
  end
end

-- The window's tab row and display modes, as the game's OnLoad sets them up: the title, three tabs,
-- the lookup from a mode to its tab, SetDisplayMode and the tab count.
local function auctionTabs(f)
  f.Tabs, f.tabsForDisplayMode = {}, {}
  auctionTitle(f)
  auctionDisplayMode(f)
  auctionTab(f, "Buy", AuctionHouseFrameDisplayMode.Buy)
  auctionTab(f, "Sell", AuctionHouseFrameDisplayMode.ItemSell)
  auctionTab(f, "Auctions", AuctionHouseFrameDisplayMode.Auctions)
  PanelTemplates_SetNumTabs(f, #f.Tabs)
end

-- The game's auction house window, made the first time the house opens (Blizzard_AuctionHouseUI
-- loads on demand), 800 x 538 at the center, with its tab row and the SetPostItem a bag click calls
-- (it shows the game's sell page, as in the game).
local function auctionHouseFrame()
  if AuctionHouseFrame then return AuctionHouseFrame end
  local f = stub.newWidget("Frame", "AuctionHouseFrame", UIParent)
  f:SetSize(800, 538)
  f:SetPoint("CENTER")
  auctionTabs(f)
  -- The item a bag click (or the game's sell frame) puts up for sale: recorded in world.ah.postItem.
  function f:SetPostItem(loc) world.ah.postItem = loc self:SetDisplayMode(AuctionHouseFrameDisplayMode.ItemSell) end
  stub.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI")
  return f
end

-- The player talks to an auctioneer: the window shows on its Buy page (the game's OnShow sets that
-- mode) and AUCTION_HOUSE_SHOW fires.
function world.openAuctionHouse()
  local f = auctionHouseFrame()
  f:Show()
  f:SetDisplayMode(AuctionHouseFrameDisplayMode.Buy)
  stub.fire("AUCTION_HOUSE_SHOW")
end

-- The auction house closes: AUCTION_HOUSE_CLOSED fires and the window hides.
function world.closeAuctionHouse()
  stub.fire("AUCTION_HOUSE_CLOSED")
  if AuctionHouseFrame then AuctionHouseFrame:Hide() end
end

-- A bag item clicked with the auction house open: the game hands its location to the window's SetPostItem.
function world.postFromBag(bag, slot)
  AuctionHouseFrame:SetPostItem(ItemLocation:CreateFromBagAndSlot(bag, slot))
end

-- The mailbox --------------------------------------------------------------------------------------
-- world.mail = { mail, ... }, the inbox in order: { sender, subject, money, cod (the pay-on-delivery amount, 0 if none), gm, daysLeft, itemCount,
-- firstItemQuantity, firstItemLink, slots (the attachment slots holding an item, as a set; slots 1 to itemCount
-- when unset), letter (true: a letter with text, kept once emptied), invoice = { type ("seller",
-- "seller_temp_invoice", "buyer"), itemName, playerName, bid, buyout, deposit, consignment, count } }, read by
-- the globals Blizzard_MailFrame/MailFrame.lua calls (GetInboxNumItems, GetInboxHeaderInfo, GetInboxInvoiceInfo, HasInboxItem);
-- world.openMailbox() fires MAIL_SHOW and MAIL_INBOX_UPDATE (MailInfoDocumentation.lua).
world.mail = {}

-- How many mails are in the inbox, and how many there are in all.
function GetInboxNumItems() return #world.mail, #world.mail end
-- A mail's header: packageIcon, stationeryIcon, sender, subject, money, CODAmount, daysLeft, itemCount,
-- wasRead, wasReturned, textCreated, canReply, isGM, firstItemQuantity, firstItemLink (nothing for none).
function GetInboxHeaderInfo(i)
  local m = world.mail[i]
  if not m then return nil end
  return nil, nil, m.sender, m.subject, m.money or 0, m.cod or 0, m.daysLeft or 30, m.itemCount, false, false, false, true, m.gm == true, m.firstItemQuantity, m.firstItemLink
end
-- An invoice's invoiceType, itemName, playerName, bid, buyout, deposit, consignment, moneyDelay, etaHour,
-- etaMin, count, commerceAuction (nothing for a mail that isn't one).
function GetInboxInvoiceInfo(i)
  local v = (world.mail[i] or {}).invoice
  if not v then return nil end
  return v.type, v.itemName, v.playerName, v.bid, v.buyout, v.deposit, v.consignment, 0, 0, 0, v.count, false
end

-- The player opens the mailbox: MAIL_SHOW, then the inbox arrives (MAIL_INBOX_UPDATE).
function world.openMailbox()
  stub.fire("MAIL_SHOW")
  stub.fire("MAIL_INBOX_UPDATE")
end

-- A mail's attachment slots that hold an item, as a set: mail.slots when a test sets it, else slots 1 to
-- its itemCount. A slot keeps its number as the items before it leave (Blizzard_MailFrame/MailFrame.lua
-- walks slots 1 to ATTACHMENTS_MAX_RECEIVE with HasInboxItem).
local function mailSlots(m)
  if not m.slots then
    m.slots = {}
    for n = 1, m.itemCount or 0 do m.slots[n] = true end
  end
  return m.slots
end
-- Whether attachment slot n of mail i holds an item.
function HasInboxItem(i, n)
  local m = world.mail[i]
  return m ~= nil and mailSlots(m)[n] == true
end
C_Mail = C_Mail or {}
-- Whether the server is still answering a mail command: world.mailPending (false by default).
function C_Mail.IsCommandPending() return world.mailPending == true end

-- After a take the server answers with the changed inbox: a mail left with no money and no items leaves it
-- (the mails after it move up a place) unless it is a letter with text (mail.letter), and MAIL_INBOX_UPDATE fires.
local function settleMail(i)
  local m = world.mail[i]
  if m and (m.money or 0) == 0 and (m.itemCount or 0) == 0 and not m.letter then table.remove(world.mail, i) end
  stub.fire("MAIL_INBOX_UPDATE")
end
-- world.taken = what TakeInboxMoney and TakeInboxItem were asked for: { "money", mail } or { "item", mail, attachment }.
world.taken = {}
-- Takes a mail's money: noted, the mail's money goes to 0, and the inbox settles.
function TakeInboxMoney(i)
  table.insert(world.taken, { "money", i })
  if world.mail[i] then world.mail[i].money = 0 end
  settleMail(i)
end
-- Takes attachment n of mail i: noted; the slot empties (its item count drops, and the first item's link goes
-- with the last item), and the inbox settles. An empty slot takes nothing.
function TakeInboxItem(i, n)
  table.insert(world.taken, { "item", i, n })
  local m = world.mail[i]
  if not (m and mailSlots(m)[n]) then return end
  m.slots[n], m.itemCount = nil, m.itemCount - 1
  if m.itemCount == 0 then m.firstItemLink, m.firstItemQuantity = nil, nil end
  settleMail(i)
end

-- The mail window (MailFrame, with the Send Mail tab's SendMailFrame and its name box), made on the
-- first call; world.openMailWindow() shows it with the mailbox, world.showSendMail() the Send Mail tab,
-- world.closeMailWindow() fires MAIL_CLOSED and hides it (Blizzard_MailFrame/MailFrame.lua).
local function mailWindow()
  if MailFrame then return end
  local f = stub.newWidget("Frame", "MailFrame", UIParent)
  f:SetSize(384, 512)
  f:SetPoint("TOPLEFT", 16, -116)
  local send = stub.newWidget("Frame", "SendMailFrame", f)
  send:SetAllPoints()
  send:Hide()
  stub.newWidget("EditBox", "SendMailNameEditBox", send)
end
-- The mail window shows with the mailbox.
function world.openMailWindow()
  mailWindow()
  MailFrame:Show()
  world.openMailbox()
end
-- The Send Mail tab opens.
function world.showSendMail() mailWindow() SendMailFrame:Show() end
-- The mail window closes.
function world.closeMailWindow()
  stub.fire("MAIL_CLOSED")
  if MailFrame then MailFrame:Hide() end
end

-- Professions -------------------------------------------------------------------------------------
-- world.professions = { { name, skillLine, profession (an Enum.Profession), rank, maxRank }, ... }:
-- your two primary professions, as GetProfessions gives them (prof1, prof2; first aid, fishing and
-- cooking aren't modelled), with GetProfessionInfo's returns and C_TradeSkillUI's ProfessionInfo for a
-- skill line, as Blizzard_ProfessionsBook/Camelot/Blizzard_ProfessionsBook.lua reads them
-- (ProfessionConstantsDocumentation.lua, TradeSkillUIDocumentation.lua).

Enum.Profession = { FirstAid = 0, Blacksmithing = 1, Leatherworking = 2, Alchemy = 3, Herbalism = 4, Cooking = 5, Mining = 6,
  Tailoring = 7, Engineering = 8, Enchanting = 9, Fishing = 10, Skinning = 11, Jewelcrafting = 12, Inscription = 13, Archaeology = 14 }
world.professions = {}

-- prof1, prof2 (indices into world.professions; nil for none), then first aid, fishing and cooking (nil).
function GetProfessions()
  return world.professions[1] and 1 or nil, world.professions[2] and 2 or nil
end
-- name, texture, rank, maxRank, numSpells, spellOffset, skillLine of a profession index.
function GetProfessionInfo(index)
  local p = world.professions[index]
  if not p then return nil end
  return p.name, p.icon, p.rank or 1, p.maxRank or 75, 1, 0, p.skillLine
end
C_TradeSkillUI = C_TradeSkillUI or {}
-- A skill line's ProfessionInfo: its profession when it is one of yours, else none named.
function C_TradeSkillUI.GetProfessionInfoBySkillLineID(skillLine)
  for _, p in ipairs(world.professions) do
    if p.skillLine == skillLine then return { profession = p.profession, professionID = skillLine, professionName = p.name, skillLevel = p.rank or 1, maxSkillLevel = p.maxRank or 75 } end
  end
  return { professionID = skillLine, professionName = "", skillLevel = 0, maxSkillLevel = 0 }
end

-- Skills ------------------------------------------------------------------------------------------
-- world.skills[skillID] = { name, rank, maxRank }: the skills you know, as C_SkillInfo.GetSkillLineInfoByID
-- gives them (SkillInfoDocumentation.lua, SkillLineAttributes); an unknown skill answers rank 0.
world.skills = {}
C_SkillInfo = C_SkillInfo or {}
-- The SkillLineAttributes of a skill line (the fields Vanguard reads).
function C_SkillInfo.GetSkillLineInfoByID(skillID)
  local s = world.skills[skillID] or {}
  return { skillID = skillID, name = s.name or "", isHeader = false, rank = s.rank or 0, maxRank = s.maxRank or 0 }
end

-- The profession window (Blizzard_Professions, which Forever loads on TRADE_SKILL_SHOW:
-- Blizzard_Game/Mainline/EventImplementation.lua's HandleTradeSkillShow calls ShowProfessionsFrame,
-- Blizzard_Professions/Blizzard_Professions_Bootstrap.lua). ProfessionsFrame (673 x 594,
-- Camelot/Blizzard_ProfessionsFrame.xml) holds CraftingPage.SchematicForm, whose Init(recipeInfo)
-- shows a recipe (Blizzard_ProfessionsCrafting.lua's SelectRecipe calls it).
-- world.recipes[recipeID] = a CraftingRecipeSchematic (TradeSkillUITypesDocumentation.lua):
-- { recipeID, name, outputItemID, quantityMin, quantityMax, reagentSlotSchematics = { { reagents =
-- { { itemID } }, quantityRequired, reagentType } } }, as C_TradeSkillUI.GetRecipeSchematic gives it.

Enum.CraftingReagentType = { Modifying = 0, Basic = 1, Finishing = 2, Automatic = 3 }
world.recipes = {}

-- A recipe's schematic (nil for one the world doesn't have).
function C_TradeSkillUI.GetRecipeSchematic(recipeID) return world.recipes[recipeID] end
-- world.cooldowns[recipeID] = seconds left; world.openedRecipe = the last recipe OpenRecipe was given.
world.cooldowns = {}
-- Every recipe ID the world has, in order (the open profession's list).
function C_TradeSkillUI.GetAllRecipeIDs()
  local ids = {}
  for id in pairs(world.recipes) do ids[#ids + 1] = id end
  table.sort(ids)
  return ids
end
-- A recipe's cooldown: seconds left (0 for none), whether it is a daily one, charges, max charges.
function C_TradeSkillUI.GetRecipeCooldown(recipeID) return world.cooldowns[recipeID] or 0, false, 0, 0 end
-- Opens a recipe in the profession window (only noted here).
function C_TradeSkillUI.OpenRecipe(recipeID) world.openedRecipe = recipeID return true end

-- world.trackedRecipes: the recipe IDs you track in the profession window, in order (world.trackRecipe).
world.trackedRecipes = {}
-- The tracked recipes (Blizzard_ProfessionsRecipeTracker.lua reads both lists; recrafts are none here).
function C_TradeSkillUI.GetRecipesTracked(isRecraft)
  local out = {}
  if isRecraft then return out end
  for i, id in ipairs(world.trackedRecipes) do out[i] = id end
  return out
end
-- Tracks (tracked true or nil) or untracks (false) a recipe, firing TRACKED_RECIPE_UPDATE(recipeID, tracked)
-- as the client does (TradeSkillUIDocumentation.lua).
function world.trackRecipe(recipeID, tracked)
  local kept, on = {}, tracked ~= false
  for _, id in ipairs(world.trackedRecipes) do if id ~= recipeID then kept[#kept + 1] = id end end
  if on then kept[#kept + 1] = recipeID end
  world.trackedRecipes = kept
  stub.fire("TRACKED_RECIPE_UPDATE", recipeID, on)
end
-- The game's own call to track or untrack a recipe (the tracker's right-click goes through it).
function C_TradeSkillUI.SetRecipeTracked(recipeID, tracked) world.trackRecipe(recipeID, tracked) end

-- The window, made the first time a profession opens, with its crafting page's recipe form.
local function professionsFrame()
  if ProfessionsFrame then return ProfessionsFrame end
  local f = stub.newWidget("Frame", "ProfessionsFrame", UIParent)
  f:SetSize(673, 594)
  f:SetPoint("TOPLEFT", 16, -116)
  f.CraftingPage = stub.newWidget("Frame", nil, f)
  f.CraftingPage:SetAllPoints()
  f.CraftingPage.SchematicForm = stub.newWidget("Frame", nil, f.CraftingPage)
  -- Shows a recipe (its recipeInfo kept, as the game's GetRecipeInfo returns it).
  function f.CraftingPage.SchematicForm:Init(recipeInfo) self.currentRecipeInfo = recipeInfo end
  stub.fire("ADDON_LOADED", "Blizzard_Professions")
  return f
end

-- A profession opens (TRADE_SKILL_SHOW, the window shows) on a recipe, if one is given.
function world.openProfession(recipeID)
  local f = professionsFrame()
  stub.fire("TRADE_SKILL_SHOW")
  f:Show()
  if recipeID then world.selectRecipe(recipeID) end
end

-- A recipe picked in the list: the form is given it.
function world.selectRecipe(recipeID)
  ProfessionsFrame.CraftingPage.SchematicForm:Init({ recipeID = recipeID, learned = true })
end

-- The window closes: TRADE_SKILL_CLOSE fires and it hides.
function world.closeProfession()
  stub.fire("TRADE_SKILL_CLOSE")
  if ProfessionsFrame then ProfessionsFrame:Hide() end
end

-- Chat and the game's frames ----------------------------------------------------------------------

world.chatFilters = {}
-- What was sent to chat channels, { text, chatType } each, in order.
world.sentChat = {}
C_ChatInfo = C_ChatInfo or {}
-- C_ChatInfo.SendChatMessage (ChatInfoDocumentation.lua) adds to world.sentChat. The SendChatMessage
-- global is only a deprecation fallback on Forever (Blizzard_DeprecatedChatInfo), so it is not modelled.
C_ChatInfo.SendChatMessage = function(text, chatType) table.insert(world.sentChat, { text, chatType }) end
ChatFrameUtil = {}
-- Chat filters: 12.x keeps them in ChatFrameUtil (Blizzard_ChatFrameBase/Shared/ChatFrameFilters.lua).
function ChatFrameUtil.AddMessageEventFilter(event, fn) world.chatFilters[event] = world.chatFilters[event] or {} table.insert(world.chatFilters[event], fn) end
-- The old global is only an alias of it, set while the client loads its deprecation fallbacks
-- (Blizzard_DeprecatedChatInfo/Deprecated_ChatFrame.lua).
ChatFrame_AddMessageEventFilter = ChatFrameUtil.AddMessageEventFilter
-- Temporary windows and the FCF helpers the addon calls.
function FCF_OpenTemporaryWindow(name) local f = stub.newWidget("ScrollingMessageFrame", "ChatFrameTemp" .. name, UIParent) return f end
function FCF_Tab_OnClick() end
-- Names of the chat windows made by FCF_OpenNewWindow, by index.
world.chatWindows = {}
-- GetChatWindowInfo(i): the window's name.
function GetChatWindowInfo(i) return world.chatWindows[i] end
-- Chat window i's tab: a button whose Text is its font string (ChatTabTemplate's ButtonText),
-- which the game recolours by GetFontString.
local function chatTab(i)
  local tab = stub.newWidget("Button", "ChatFrame" .. i .. "Tab", UIParent)
  tab.Text = tab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  tab:SetFontString(tab.Text)
  return tab
end

-- FCF_OpenNewWindow(name): makes the next free window and its tab, returns the window.
function FCF_OpenNewWindow(name)
  local i = 3
  while _G["ChatFrame" .. i] do i = i + 1 end
  world.chatWindows[i] = name
  NUM_CHAT_WINDOWS = math.max(NUM_CHAT_WINDOWS, i)
  _G["ChatFrame" .. i .. "Tab"] = chatTab(i)
  _G["ChatFrame" .. i] = stub.newWidget("ScrollingMessageFrame", "ChatFrame" .. i, UIParent)
  return _G["ChatFrame" .. i]
end
-- Position restore: nothing to do.
function FCF_RestorePositionAndDimensions() end
-- Sets a chat window's font size.
function FCF_SetChatWindowFontSize(_, frame, size) frame:SetFont(STANDARD_TEXT_FONT, size, "") end

-- Chat bubbles (Modules/ChatBubbles.lua): C_ChatBubbles.GetAllChatBubbles lists world.bubbles, each a bubble
-- frame with one child panel holding nine art textures and the text's font string (as
-- Blizzard_ChatBubble/ChatBubbleTemplates.xml builds them). A forbidden bubble is listed too, with IsForbidden
-- true, so an addon's own check is exercised. world.instance is whether the player is in an instance.
world.bubbles, world.instance = {}, false
-- Whether the player is in an instance (a party instance when world.instance is true), and its kind.
function IsInInstance() if world.instance == true then return true, "party" end return false, "none" end
C_ChatBubbles = {
  -- Every bubble there is, in order.
  GetAllChatBubbles = function() local out = {} for i, bubble in ipairs(world.bubbles) do out[i] = bubble end return out end,
}

-- A bubble's panel: its nine art textures and its text, keyed String as the game's template keys it (unkeyed
-- leaves the text a bare region, as a client whose template lacks the key would).
local function bubblePanel(bubble, text, unkeyed)
  local panel = stub.newWidget("Frame", nil, bubble)
  panel:SetAllPoints()
  for _ = 1, 9 do panel:CreateTexture(nil, "BACKGROUND"):SetTexture("TEST-ONLY-ART") end
  local fs = panel:CreateFontString(nil, "ARTWORK")
  fs:SetFont(STANDARD_TEXT_FONT, 13, "")
  fs:SetText(text)
  if not unkeyed then panel.String = fs end
  return panel
end

-- The IsForbidden of a bubble addons may not touch (an instance's).
local function alwaysForbidden() return true end

-- A chat bubble appears over a speaker's head saying `text`, and CHAT_MSG_SAY fires (the message the engine
-- raised it for). opts.forbidden makes it a bubble addons may not touch (an instance's); opts.empty one with no
-- panel yet; opts.unkeyed one whose text has no String key; opts.event the chat event the line came in on
-- (CHAT_MSG_SAY unless given). Returns the bubble's index in world.bubbles.
function world.addChatBubble(text, opts)
  opts = opts or {}
  local bubble = stub.newWidget("Frame", nil, UIParent)
  bubble:SetSize(120, 40)
  bubble:SetPoint("CENTER")
  if not opts.empty then bubblePanel(bubble, text, opts.unkeyed) end
  if opts.forbidden then bubble.IsForbidden = alwaysForbidden end
  world.bubbles[#world.bubbles + 1] = bubble
  stub.fire(opts.event or "CHAT_MSG_SAY", text, "TEST-ONLY Speaker")
  return #world.bubbles
end

-- The game's chat windows: NUM_CHAT_WINDOWS frames with tabs and edit boxes.
local function chatFrames()
  local new = stub.newWidget
  NUM_CHAT_WINDOWS = 2
  for i = 1, NUM_CHAT_WINDOWS do
    local f = new("ScrollingMessageFrame", "ChatFrame" .. i, UIParent)
    f:SetFont(STANDARD_TEXT_FONT, 14, "")
    chatTab(i)
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

-- The tooltip's setters, recorded so tests can read what it shows.
local function tooltipSetters(tip)
  -- What the tooltip was set to: a unit, an equipped item, a link, an item or a spell id.
  function tip:SetUnit(unit) self.__unit = unit self.__lines = { { text = UnitName(unit) } } end
  function tip:SetInventoryItem(unit, slot) self.__item = { unit = unit, slot = slot } end
  function tip:SetHyperlink(link) self.__link = link end
  function tip:SetItemByID(id) self.__itemId = id end
  function tip:SetQuestLogItem(kind, i, questID) self.__questLogItem = kind .. " " .. i .. " " .. tostring(questID) end
  function tip:SetSpellByID(id) self.__spellId = id self.__lines = { { text = (world.spells[id] or {}).name } } end
  function tip:GetItem() return self.__itemName, self.__itemLink end
end

-- GameTooltip: a hidden frame with the methods the addon calls, recorded.
local function tooltipFrame()
  local tip = stub.newWidget("Frame", "GameTooltip", UIParent)
  tip:Hide()
  tooltipLines(tip)
  tooltipAction(tip)
  tooltipSetters(tip)
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

-- world.secretReads: names of client reads that answer with a secret while on, as the client does
-- in instanced combat (a test sets world.secretReads.UnitOnTaxi = true). Off by default.
world.secretReads = {}

-- Wraps holder[key] so it answers world.secret(0) while world.secretReads[name] is on.
local function secretRead(name, holder, key)
  local real = holder[key]
  holder[key] = function(...)
    if world.secretReads[name] then return world.secret(0) end
    return real(...)
  end
end

for _, name in ipairs({ "UnitOnTaxi", "UnitLevel", "UnitXP", "UnitIsDeadOrGhost" }) do secretRead(name, _G, name) end
secretRead("C_Map.GetPlayerMapPosition", C_Map, "GetPlayerMapPosition")
secretRead("C_QuestLog.GetDistanceSqToQuest", C_QuestLog, "GetDistanceSqToQuest")

-- Resets the world to its defaults (units, actions, bags, quests) without touching frames.
function world.reset()
  world.units = { player = defaultPlayer() }
  world.actions, world.quests, world.npc, world.merchant, world.trainer = {}, {}, nil, nil, nil
  world.cursor, world.timers, world.book = nil, {}, {}
  world.ah = emptyAuctionHouse()
  world.professions, world.recipes, world.cooldowns, world.openedRecipe = {}, {}, {}, nil
  world.questTimers, world.trackedRecipes = {}, {}
  world.mail, world.taken, world.mailPending = {}, {}, nil
  world.bubbles, world.instance = {}, false
  refreshWatches()
end
