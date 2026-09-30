-- SavedVariables: ForeverUIDB holds named profiles; ForeverUICharDB picks
-- which profile this character uses. Every module keeps its settings in
-- its own table inside the active profile.

local ADDON, ns = ...

local DEFAULT_PROFILE = "Default"

-- Copies every missing key of defaults into t (recursing into tables); returns t.
local function fill(t, defaults)
  for k, v in pairs(defaults) do
    if type(v) == "table" then
      t[k] = fill(type(t[k]) == "table" and t[k] or {}, v)
    elseif t[k] == nil then
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

-- Creates or repairs the saved tables. Runs at ADDON_LOADED, when WoW has
-- restored them.
local function initDB()
  ForeverUIDB = fill(type(ForeverUIDB) == "table" and ForeverUIDB or {}, { version = 1, profiles = {} })
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

-- Registers fn(saved) to upgrade the settings table `key` as older versions
-- saved it. It runs on the saved table before defaults are filled in, so it
-- can tell a value the player had from one a new default would add.
function ns.Migrate(key, fn)
  migrations[key] = fn
end

-- The settings table `key` in the active profile, upgraded (ns.Migrate), with defaults filled in.
function ns.Settings(key, defaults)
  local profile = ns.Profile()
  local saved = type(profile[key]) == "table" and profile[key] or {}
  if migrations[key] then migrations[key](saved) end
  profile[key] = fill(saved, defaults or {})
  return profile[key]
end

-- Switches this character to a profile (created empty if new). Takes effect on /reload.
function ns.UseProfile(name)
  ForeverUIDB.profiles[name] = ForeverUIDB.profiles[name] or {}
  ForeverUICharDB.profile = name
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
