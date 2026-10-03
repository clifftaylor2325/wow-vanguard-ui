-- SavedVariables: ForeverUIDB holds named profiles; ForeverUICharDB picks
-- which profile this character uses. Every module keeps its settings in
-- its own table inside the active profile.

local ADDON, ns = ...

local DEFAULT_PROFILE = "Default"

-- Copies every missing or wrong-typed key of defaults into t (recursing into
-- tables); returns t. A default fixes its key's type: a saved value of another
-- type is replaced, so a setting must not change type (nil counts as missing).
local function fill(t, defaults)
  for k, v in pairs(defaults) do
    if type(v) == "table" then
      t[k] = fill(type(t[k]) == "table" and t[k] or {}, v)
    elseif type(t[k]) ~= type(v) then
      t[k] = v
    end
  end
  return t
end
ns.Fill = fill

-- A deep copy of a plain table.
function ns.Copy(t)
  return fill({}, t)
end

local DB_VERSION = 1
local upgrades = {}

-- Registers fn(ForeverUIDB) that brings the account file up to `version`; steps run once, in version order.
function ns.UpgradeDB(version, fn)
  upgrades[version] = fn
end

-- Runs the upgrade step for version v under ns.Try and stamps it; false when the step failed (the stamp is left so the next login retries).
local function upgradeStep(v)
  local fn = upgrades[v]
  if fn and not ns.Try("DB upgrade " .. v, fn, ForeverUIDB) then return false end
  ForeverUIDB.version = v
  return true
end

-- Brings a saved account file from version `from` up to `to`, one registered step at a time; stops at the first failing step. true when every step ran.
function ns.MigrateDB(from, to)
  for v = from + 1, to do
    if not upgradeStep(v) then return false end
  end
  return true
end

-- The saved account file's version: 0 for a file saved before a version was stamped, nil for a fresh install.
local function savedVersion()
  if type(ForeverUIDB) ~= "table" then return nil end
  return type(ForeverUIDB.version) == "number" and ForeverUIDB.version or 0
end

-- Creates or repairs the saved tables, and upgrades an older account file.
-- Runs at ADDON_LOADED, when WoW has restored them.
local function initDB()
  local from = savedVersion()
  ForeverUIDB = fill(type(ForeverUIDB) == "table" and ForeverUIDB or {}, { profiles = {} })
  ForeverUIDB.version = from or DB_VERSION
  if from and from < DB_VERSION then ns.MigrateDB(from, DB_VERSION) end
  ForeverUICharDB = fill(type(ForeverUICharDB) == "table" and ForeverUICharDB or {}, { profile = DEFAULT_PROFILE })
  ForeverUIDB.profiles[ForeverUICharDB.profile] = ForeverUIDB.profiles[ForeverUICharDB.profile] or {}
end

ns.On("ADDON_LOADED", function(_, name)
  if name == ADDON then
    initDB()
  end
end)

-- The active profile's name.
function ns.ProfileName()
  return ForeverUICharDB and ForeverUICharDB.profile or DEFAULT_PROFILE
end

-- The active profile table (empty before ADDON_LOADED).
function ns.Profile()
  if type(ForeverUIDB) ~= "table" then
    return {}
  end
  local name = ns.ProfileName()
  ForeverUIDB.profiles[name] = ForeverUIDB.profiles[name] or {}
  return ForeverUIDB.profiles[name]
end

local migrations = {}
-- Settings tables a migration has already run on (weak, so a replaced table is collected).
local migrated = setmetatable({}, { __mode = "k" })
-- key -> { t = the table ns.Settings filled, defaults = the defaults it was filled from }.
local cache = {}
local profileListeners = {}

-- Registers fn(saved) to upgrade the settings table `key` as older versions
-- saved it. It runs on the saved table before defaults are filled in, so it
-- can tell a value the player had from one a new default would add.
function ns.Migrate(key, fn)
  migrations[key] = fn
end

-- Registers fn() to run whenever the active profile's settings are switched, copied, reset or imported.
function ns.OnProfileChanged(fn)
  profileListeners[#profileListeners + 1] = fn
end

-- Tells every ns.OnProfileChanged listener that the active profile's settings changed.
function ns.ProfileChanged()
  for _, fn in ipairs(profileListeners) do fn() end
end

-- Forgets the remembered settings tables, so the next ns.Settings call fills each again.
ns.OnProfileChanged(function() cache = {} end)

-- The settings table `key` in the active profile, upgraded (ns.Migrate) once per table, with
-- defaults filled in. Remembered while the profile still holds that table (a write that replaces
-- it is seen at once), so the colour lookups on every bar update don't refill it.
function ns.Settings(key, defaults)
  local profile, hit = ns.Profile(), cache[key]
  if hit and profile[key] == hit.t and (defaults == nil or defaults == hit.defaults) then return hit.t end
  local saved = type(profile[key]) == "table" and profile[key] or {}
  if migrations[key] and not migrated[saved] then migrations[key](saved) migrated[saved] = true end
  profile[key] = ns.Fill(saved, defaults or {})
  cache[key] = { t = profile[key], defaults = defaults }
  return profile[key]
end

-- Switches this character to a profile (created empty if new). Takes effect on /reload.
function ns.UseProfile(name)
  ForeverUIDB.profiles[name] = ForeverUIDB.profiles[name] or {}
  ForeverUICharDB.profile = name
  ns.ProfileChanged()
end

-- Profile names, sorted.
function ns.ProfileNames()
  local names = {}
  for name in pairs(ForeverUIDB and ForeverUIDB.profiles or {}) do
    names[#names + 1] = name
  end
  table.sort(names)
  return names
end
