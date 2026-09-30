-- Profile management on top of Core/DB.lua: new, copy, delete and reset,
-- export/import strings (Core/Serialize.lua), and profiles that follow your
-- specialization. Profile changes apply on reload; ForeverUI offers one.
-- Loaded before Core/Modules.lua so the spec profile is chosen at login
-- before any module reads its settings.

local ADDON, ns = ...

local S = ns.Serialize

-- Whether a profile name is usable: 1-32 letters, digits, spaces, - or _.
function ns.ValidProfileName(name)
  return type(name) == "string" and #name >= 1 and #name <= 32 and not name:find("[^%w%s%-_]")
end

-- Creates an empty profile. false if the name is taken or invalid.
function ns.NewProfile(name)
  if not ns.ValidProfileName(name) or ForeverUIDB.profiles[name] then
    return false
  end
  ForeverUIDB.profiles[name] = {}
  return true
end

-- Copies another profile's settings over the active one.
function ns.CopyProfile(from)
  local source = ForeverUIDB.profiles[from]
  if not source or from == ns.ProfileName() then
    return false
  end
  ForeverUIDB.profiles[ns.ProfileName()] = ns.Copy(source)
  return true
end

-- Deletes a profile (never the active one); characters or specs using it fall back to Default.
function ns.DeleteProfile(name)
  if not ForeverUIDB.profiles[name] or name == ns.ProfileName() then
    return false
  end
  ForeverUIDB.profiles[name] = nil
  return true
end

-- Clears every setting in the active profile back to defaults.
function ns.ResetProfile()
  ForeverUIDB.profiles[ns.ProfileName()] = {}
end

-- Export / import ------------------------------------------------------------------------

-- The export string for the whole profile ("profile") or one module's settings.
function ns.ExportProfile(scope)
  scope = scope or "profile"
  local profile = ns.Profile()
  local data = scope == "profile" and profile or profile[scope]
  if type(data) ~= "table" then
    return nil, "nothing saved for " .. scope .. " yet"
  end
  return S.Encode(scope, data)
end

-- A profile name that isn't taken yet, from base ("Imported", "Imported 2", ...).
local function freeName(base)
  local name, n = base, 1
  while ForeverUIDB.profiles[name] do
    n = n + 1
    name = base .. " " .. n
  end
  return name
end

-- A whole imported profile: saved under a free name, and this character switches to it.
local function importWhole(data)
  local name = freeName("Imported")
  ForeverUIDB.profiles[name] = data
  ns.UseProfile(name)
  return "Imported as profile " .. name .. " and switched to it."
end

-- Applies an import string. A whole profile becomes a new profile this
-- character switches to; a module's settings replace that module's in the
-- active profile. Returns a description of what changed, or nil and why not.
function ns.ImportProfile(text)
  local scope, data = S.Decode(text)
  if not scope then
    return nil, data
  end
  if scope ~= "profile" then
    ns.Profile()[scope] = data
    return "Imported " .. scope .. " settings into profile " .. ns.ProfileName() .. "."
  end
  return importWhole(data)
end

-- Specialization -------------------------------------------------------------------------

-- The client's specialization getter, or nil (WoW Forever has no specializations).
local function specGetter()
  local get = (C_SpecializationInfo and C_SpecializationInfo.GetSpecialization) or GetSpecialization
  return type(get) == "function" and get or nil
end

-- True when the client has specializations at all.
function ns.HasSpecs()
  return specGetter() ~= nil
end

-- The active specialization index (1-4), or nil where the client has none.
function ns.SpecIndex()
  local get = specGetter()
  local index = get and ns.PlainNumber(get()) or nil
  return index and index > 0 and index or nil
end

-- This character's spec -> profile map.
local function specMap()
  ForeverUICharDB.specProfiles = type(ForeverUICharDB.specProfiles) == "table" and ForeverUICharDB.specProfiles or {}
  return ForeverUICharDB.specProfiles
end

-- Uses a profile for a spec (the current one when spec is nil); nil profile stops that.
function ns.SetSpecProfile(profile, spec)
  spec = spec or ns.SpecIndex()
  if not spec then return false end
  specMap()[spec] = profile
  return true
end

-- The profile a spec uses, if one is set and still exists.
function ns.SpecProfile(spec)
  local name = specMap()[spec or ns.SpecIndex() or 0]
  return name and ForeverUIDB.profiles[name] and name or nil
end

-- Switches to the current spec's profile. Returns true if it changed.
local function followSpec()
  local name = ns.SpecProfile()
  if not name or name == ns.ProfileName() then
    return false
  end
  ns.UseProfile(name)
  return true
end

-- At login (before modules read settings), take the spec's profile quietly.
ns.On("PLAYER_LOGIN", followSpec)

-- On a spec change mid-session, switch and offer the reload that applies it.
local function onSpecChanged(_, unit)
  if (unit == nil or unit == "player") and followSpec() then
    ns.OfferReload("Your specialization uses profile " .. ns.ProfileName() .. ".")
  end
end
ns.On("PLAYER_SPECIALIZATION_CHANGED", onSpecChanged)
ns.On("ACTIVE_TALENT_GROUP_CHANGED", onSpecChanged)
