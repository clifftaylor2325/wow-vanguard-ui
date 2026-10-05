-- SavedVariables: VanguardDB holds named profiles; VanguardCharDB picks
-- which profile this character uses. Every module keeps its settings in
-- its own table inside the active profile.

local ADDON, ns = ...

local DEFAULT_PROFILE = "Default"
ns.DEFAULT_PROFILE = DEFAULT_PROFILE
-- A profile this character used or had staged that was deleted on another character since; said at login.
local lostProfile

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

-- The account file's version. 2: the menu buttons' line icons off and the bag
-- strip's position gone, once (Modules/MenuStrip.lua registers the step).
local DB_VERSION = 2
local upgrades = {}

-- Registers fn(VanguardDB) that brings the account file up to `version`; steps run once, in version order.
function ns.UpgradeDB(version, fn)
  upgrades[version] = fn
end

-- Runs the upgrade step for version v under ns.Try and stamps it; false when the step failed (the stamp is left so the next login retries).
local function upgradeStep(v)
  local fn = upgrades[v]
  if fn and not ns.Try("DB upgrade " .. v, fn, VanguardDB) then return false end
  VanguardDB.version = v
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
  if type(VanguardDB) ~= "table" then return nil end
  return type(VanguardDB.version) == "number" and VanguardDB.version or 0
end

-- Drops the profiles a damaged (hand-edited) file holds under a name that isn't a string, or that aren't tables:
-- every reader of a profile indexes it, and the profile list sorts the names.
local function dropBrokenProfiles(profiles)
  for name, profile in pairs(profiles) do
    if type(name) ~= "string" or type(profile) ~= "table" then profiles[name] = nil end
  end
end

-- The profile this character saved, or Default when it is gone (deleted on another character since),
-- remembering the lost name for the login message.
local function stillThere(name)
  if VanguardDB.profiles[name] then return name end
  if type(name) == "string" and name ~= DEFAULT_PROFILE then lostProfile = name end
  return DEFAULT_PROFILE
end

-- Creates or repairs the saved tables, and upgrades an older account file.
-- Runs at ADDON_LOADED, when WoW has restored them.
local function initDB()
  local from = savedVersion()
  VanguardDB = fill(type(VanguardDB) == "table" and VanguardDB or {}, { profiles = {} })
  dropBrokenProfiles(VanguardDB.profiles)
  VanguardDB.version = from or DB_VERSION
  if from and from < DB_VERSION then ns.MigrateDB(from, DB_VERSION) end
  VanguardCharDB = fill(type(VanguardCharDB) == "table" and VanguardCharDB or {}, { profile = DEFAULT_PROFILE })
  ns.ApplyPendingProfile()
  VanguardCharDB.profile = stillThere(VanguardCharDB.profile)
  VanguardDB.profiles[VanguardCharDB.profile] = VanguardDB.profiles[VanguardCharDB.profile] or {}
end

ns.On("ADDON_LOADED", function(_, name)
  if name == ADDON then
    initDB()
  end
end)

-- At login, says which profile was deleted on another character, and the one this character uses instead.
ns.On("PLAYER_LOGIN", function()
  if not lostProfile then return end
  ns.Chat("Profile " .. lostProfile .. " was deleted on another character; this character uses " .. ns.ProfileName() .. ".")
  lostProfile = nil
end)

-- The active profile's name.
function ns.ProfileName()
  return VanguardCharDB and VanguardCharDB.profile or DEFAULT_PROFILE
end

-- The active profile table (empty before ADDON_LOADED).
function ns.Profile()
  if type(VanguardDB) ~= "table" then
    return {}
  end
  local name = ns.ProfileName()
  VanguardDB.profiles[name] = VanguardDB.profiles[name] or {}
  return VanguardDB.profiles[name]
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

-- Makes the profile staged by ns.UseProfile the active one and tells the ns.OnProfileChanged listeners,
-- so the settings cache hands out its tables from now on. Returns true if the profile changed. A staged
-- profile deleted on another character since is dropped (the login message says so). Runs at ADDON_LOADED
-- (the first load after the switch) and at login for a spec's profile, both before any module reads its settings.
function ns.ApplyPendingProfile()
  local name = VanguardCharDB.pendingProfile
  VanguardCharDB.pendingProfile = nil
  if type(name) ~= "string" or name == VanguardCharDB.profile then return false end
  if not VanguardDB.profiles[name] then lostProfile = name return false end
  VanguardCharDB.profile = name
  ns.ProfileChanged()
  return true
end

-- Stages a switch to a profile (created empty if new). The running modules keep the active profile's
-- tables until the reload, so VanguardCharDB.profile and the settings cache stay as they are (a drag
-- or an accent change still lands in the profile on screen); ns.ApplyPendingProfile applies it.
function ns.UseProfile(name)
  VanguardDB.profiles[name] = VanguardDB.profiles[name] or {}
  VanguardCharDB.pendingProfile = name ~= VanguardCharDB.profile and name or nil
end

-- The profile staged for the next reload, or nil.
function ns.PendingProfileName()
  return VanguardCharDB and VanguardCharDB.pendingProfile or nil
end

-- The profile this character will use after the next reload: the staged one, else the active one.
function ns.SelectedProfileName()
  return ns.PendingProfileName() or ns.ProfileName()
end

-- Profile names, sorted.
function ns.ProfileNames()
  local names = {}
  for name in pairs(VanguardDB and VanguardDB.profiles or {}) do
    names[#names + 1] = name
  end
  table.sort(names)
  return names
end
