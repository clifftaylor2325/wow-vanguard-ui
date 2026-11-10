-- SavedVariables: VanguardDB holds named profiles; VanguardCharDB picks
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
---@param t table
---@return table
function ns.Copy(t)
  return fill({}, t)
end

-- The account file's version. 2: the menu buttons' line icons off and the bag
-- strip's position gone, once (Modules/MenuStrip.lua registers the step).
local DB_VERSION = 2
local upgrades = {}

-- Registers fn(VanguardDB) that brings the account file up to `version`; steps run once, in version order.
---@param version integer
---@param fn fun(db: table)
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
---@param from integer
---@param to integer
---@return boolean ok
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

-- The character's profile as it loads: a staged switch applies, and a profile that was deleted
-- (on another character, since this one last loaded) falls back to Default instead of coming back empty.
local function chooseProfile()
  ns.ApplyPendingProfile()
  if not VanguardDB.profiles[VanguardCharDB.profile] then VanguardCharDB.profile = DEFAULT_PROFILE end
  VanguardDB.profiles[VanguardCharDB.profile] = VanguardDB.profiles[VanguardCharDB.profile] or {}
end

-- True when this character had no saved settings at load: its first login with Vanguard.
local newCharacter = false

-- The profile the account's characters used last: the newest note in VanguardDB.guard.chars whose profile
-- still exists, or nil.
local function lastUsedProfile(chars)
  local name, newest
  for _, note in pairs(chars) do
    local stamp = type(note) == "table" and VanguardDB.profiles[note.profile] and tonumber(note.stamp)
    if stamp and (not newest or stamp > newest) then name, newest = note.profile, stamp end
  end
  return name
end

-- A new character on an account that has run setup (its Profile step then offers to share the profile it
-- loads with) starts on the profile the account's characters used last, not on Default. A character the
-- account file remembers is left to the settings guard (Core/SettingsGuard.lua), which puts its own back.
local function startOnLastUsedProfile()
  local guard = type(VanguardDB.guard) == "table" and VanguardDB.guard
  local chars = guard and type(guard.chars) == "table" and guard.chars
  if not (newCharacter and VanguardDB.setupDone and chars) or chars[ns.SettingsGuard.CharKey()] then return end
  VanguardCharDB.profile = lastUsedProfile(chars) or DEFAULT_PROFILE
end

-- Whole-profile upgrades (ns.MigrateProfile), in the order registered.
local profileMigrations = {}

-- Registers fn(profile) to upgrade a whole profile as older versions saved (or exported) it: for a setting that
-- moved from one module's table to another's, which a table's own upgrade (ns.Migrate) cannot see. It runs on every
-- saved profile as the account file loads, and on an imported string's settings before they are saved, each time, so
-- it must leave an upgraded profile as it is (and skip tables that are not there).
---@param fn fun(profile: table)
function ns.MigrateProfile(fn)
  profileMigrations[#profileMigrations + 1] = fn
end

-- Runs every whole-profile upgrade on a profile, or on a payload of tables by name; returns it.
---@param profile table
---@return table profile
function ns.MigrateProfileTable(profile)
  for _, fn in ipairs(profileMigrations) do fn(profile) end
  return profile
end

-- The modules taken out of Vanguard (their settings, and their names in the profile's module switches), and the
-- account-wide key the Legacy perk list was kept under.
local RETIRED_MODULES = { "PetStable", "Legacy", "BossDocks" }
local RETIRED_ACCOUNT_KEYS = { "legacyPlan" }

-- Forgets what a retired module saved in a profile, and its switch. Leaves an upgraded profile as it is.
ns.MigrateProfile(function(profile)
  for _, name in ipairs(RETIRED_MODULES) do
    profile[name] = nil
    if type(profile.modules) == "table" then profile.modules[name] = nil end
  end
  for _, key in ipairs(RETIRED_ACCOUNT_KEYS) do VanguardDB[key] = nil end
end)

-- Creates or repairs the saved tables, and upgrades an older account file and its profiles.
-- Runs at ADDON_LOADED, when WoW has restored them.
local function initDB()
  local from = savedVersion()
  newCharacter = type(VanguardCharDB) ~= "table"
  VanguardDB = fill(type(VanguardDB) == "table" and VanguardDB or {}, { profiles = {}, client = {} })
  dropBrokenProfiles(VanguardDB.profiles)
  VanguardDB.version = from or DB_VERSION
  if from and from < DB_VERSION then ns.MigrateDB(from, DB_VERSION) end
  for _, profile in pairs(VanguardDB.profiles) do ns.MigrateProfileTable(profile) end
  VanguardCharDB = fill(type(VanguardCharDB) == "table" and VanguardCharDB or {}, { profile = DEFAULT_PROFILE })
  startOnLastUsedProfile()
  chooseProfile()
end

ns.On("ADDON_LOADED", function(_, name)
  if name == ADDON then
    initDB()
  end
end)

-- True when this is the character's first login with Vanguard (it had no saved settings).
---@return boolean
function ns.NewCharacter()
  return newCharacter
end

-- The active profile's name.
---@return string
function ns.ProfileName()
  return VanguardCharDB and VanguardCharDB.profile or DEFAULT_PROFILE
end

-- The active profile table (empty before ADDON_LOADED).
---@return table
function ns.Profile()
  if type(VanguardDB) ~= "table" then
    return {}
  end
  local profiles, name = VanguardDB.profiles, ns.ProfileName()
  local profile = profiles[name]
  if profile then return profile end
  profile = {}
  profiles[name] = profile
  return profile
end

-- key -> the upgrades registered for that settings table (ns.Migrate), in the order they were registered.
local migrations = {}
-- The same table for a look from outside (a test runs every upgrade twice); nothing else writes it.
ns.migrations = migrations
-- Settings tables a migration has already run on (weak, so a replaced table is collected).
local migrated = setmetatable({}, { __mode = "k" })
-- key -> { t = the table ns.Settings filled, defaults = the defaults it was filled from }.
local cache = {}
local profileListeners = {}
local stageListeners = {}

-- Registers fn(saved) to upgrade the settings table `key` as older versions
-- saved (or exported) it. It runs on the saved table before defaults are filled in, so it
-- can tell a value the player had from one a new default would add. It runs again each
-- session, so it must leave an upgraded table as it is. A second upgrade for the same key
-- runs after the first (it used to replace it, silently).
---@param key string  the settings table (a module name, or layout, situations, global)
---@param fn fun(saved: table)
function ns.Migrate(key, fn)
  migrations[key] = migrations[key] or {}
  table.insert(migrations[key], fn)
end

-- Runs the upgrade registered for the settings table `key` (ns.Migrate) on t, once per
-- table: ns.Settings on a saved table, and an import on each table a string carries,
-- before it is saved (Core/ProfileStrings.lua). Returns t.
---@param key string
---@param t table
---@return table t
function ns.MigrateTable(key, t)
  if not migrations[key] or migrated[t] then return t end
  for _, fn in ipairs(migrations[key]) do fn(t) end
  migrated[t] = true
  return t
end

-- Registers fn() to run whenever the active profile's settings are switched, copied, reset or imported.
---@param fn fun()
function ns.OnProfileChanged(fn)
  profileListeners[#profileListeners + 1] = fn
end

-- Tells every ns.OnProfileChanged listener that the active profile's settings changed.
function ns.ProfileChanged()
  for _, fn in ipairs(profileListeners) do fn() end
end

-- Registers fn() to run whenever a profile switch is staged for the reload (ns.StageProfile), so a page
-- that names the selected profile can say it again.
---@param fn fun()
function ns.OnProfileStaged(fn)
  stageListeners[#stageListeners + 1] = ns.Guard("profile staged", fn)
end

-- Forgets the remembered settings tables, so the next ns.Settings call fills each again.
ns.OnProfileChanged(function() cache = {} end)

-- The settings table `key` in the active profile, upgraded (ns.Migrate) once per table, with
-- defaults filled in. Remembered while the profile still holds that table (a write that replaces
-- it is seen at once), so the colour lookups on every bar update don't refill it.
---@param key string
---@param defaults table|nil
---@return table settings  the live table in the profile; writes land in SavedVariables
function ns.Settings(key, defaults)
  local profile, hit = ns.Profile(), cache[key]
  if hit and profile[key] == hit.t and (defaults == nil or defaults == hit.defaults) then return hit.t end
  local saved = ns.MigrateTable(key, type(profile[key]) == "table" and profile[key] or {})
  profile[key] = ns.Fill(saved, defaults or {})
  cache[key] = { t = profile[key], defaults = defaults }
  return profile[key]
end

-- Makes the profile staged by ns.UseProfile the active one and tells the ns.OnProfileChanged listeners,
-- so the settings cache hands out its tables from now on. A staged profile that was deleted since (on
-- another character) is dropped, not made again empty. Returns true if the profile changed. Runs at
-- ADDON_LOADED (the first load after the switch) and at login for a spec's profile, both before any
-- module reads its settings.
---@return boolean changed
function ns.ApplyPendingProfile()
  local name = VanguardCharDB.pendingProfile
  VanguardCharDB.pendingProfile = nil
  if type(name) ~= "string" or name == VanguardCharDB.profile or not VanguardDB.profiles[name] then return false end
  VanguardCharDB.profile = name
  ns.ProfileChanged()
  return true
end

-- Tells the ns.OnProfileStaged listeners that what loads after the reload changed (a staged switch or a spec map
-- change), so a shown Profiles page rebuilds its marks.
function ns.ProfileStagedChanged()
  for _, fn in ipairs(stageListeners) do fn() end
end

-- Stages a switch to a profile (created empty if new). The running modules keep the active profile's
-- tables until the reload, so VanguardCharDB.profile and the settings cache stay as they are (a drag
-- or an accent change still lands in the profile on screen); ns.ApplyPendingProfile applies it. Tells
-- the ns.OnProfileStaged listeners.
---@param name string
function ns.StageProfile(name)
  VanguardDB.profiles[name] = VanguardDB.profiles[name] or {}
  VanguardCharDB.pendingProfile = name ~= VanguardCharDB.profile and name or nil
  ns.ProfileStagedChanged()
end

-- Stages a profile the player picked (the list, the picker, a command, an import): it is also the
-- character's own profile, the one a spec with no profile of its own goes back to. A spec change
-- stages through ns.StageProfile instead, so it never counts as a pick.
---@param name string
function ns.UseProfile(name)
  ns.StageProfile(name)
  VanguardCharDB.ownProfile = name
  ns.WarnSpecWins(name)
end

-- The profile staged for the next reload, or nil.
---@return string|nil
function ns.PendingProfileName()
  return VanguardCharDB and VanguardCharDB.pendingProfile or nil
end

-- The profile this character will use after the next reload: the staged one, else the active one.
---@return string
function ns.SelectedProfileName()
  return ns.PendingProfileName() or ns.ProfileName()
end

-- Profile names, sorted.
---@return string[]
function ns.ProfileNames()
  local names = {}
  for name in pairs(VanguardDB and VanguardDB.profiles or {}) do
    names[#names + 1] = name
  end
  table.sort(names)
  return names
end
