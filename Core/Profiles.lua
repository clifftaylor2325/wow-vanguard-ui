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
  ns.ProfileChanged()
  return true
end

-- Deletes a profile (never the active or the staged one); characters or specs using it fall back to Default.
function ns.DeleteProfile(name)
  if not ForeverUIDB.profiles[name] or name == ns.ProfileName() or name == ns.SelectedProfileName() then
    return false
  end
  ForeverUIDB.profiles[name] = nil
  return true
end

-- Clears every setting in the active profile back to defaults.
function ns.ResetProfile()
  ForeverUIDB.profiles[ns.ProfileName()] = {}
  ns.ProfileChanged()
end

-- Export / import ------------------------------------------------------------------------

-- The UI scale and screen this profile was made on, for the export's "display" block:
-- { uiScale (rounded to the hundredth), width, height } (width and height 0 when the client can't say).
function ns.DisplayBlock()
  local get, w, h = _G.GetPhysicalScreenSize, 0, 0
  if type(get) == "function" then w, h = get() end
  local scale = UIParent and UIParent:GetScale() or 1
  return { uiScale = math.floor(scale * 100 + 0.5) / 100, width = tonumber(w) or 0, height = tonumber(h) or 0 }
end

-- The whole profile for export: its settings, plus the display block beside them.
local function withDisplay(profile)
  local data = {}
  for k, v in pairs(profile) do data[k] = v end
  data.display = ns.DisplayBlock()
  return data
end

-- The export string for the whole profile ("profile", with the UI scale and screen it
-- was made on) or one module's settings.
function ns.ExportProfile(scope)
  scope = scope or "profile"
  local profile = ns.Profile()
  local data = scope == "profile" and withDisplay(profile) or profile[scope]
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

-- The display block taken out of an imported profile when its UI scale is a usable number, else nil.
local function takeDisplay(data)
  local display = data.display
  data.display = nil
  local scale = type(display) == "table" and tonumber(display.uiScale)
  return scale and scale > 0 and display or nil
end

-- A whole imported profile: saved under a free name (without its display block, which
-- comes back second), and this character switches to it on reload.
local function importWhole(data)
  local name, display = freeName("Imported"), takeDisplay(data)
  ForeverUIDB.profiles[name] = data
  ns.UseProfile(name)
  return "Imported as profile " .. name .. "; this character will use it after a reload.", display
end

-- Applies an import string. A whole profile becomes a new profile this
-- character switches to; a module's settings replace that module's in the
-- active profile. Returns a description of what changed (and, for a whole profile
-- that carries one, its display block), or nil and why not.
function ns.ImportProfile(text)
  local scope, data = S.Decode(text)
  if not scope then
    return nil, data
  end
  if scope ~= "profile" then
    ns.Profile()[scope] = data
    ns.ProfileChanged()
    return "Imported " .. scope .. " settings into profile " .. ns.ProfileName() .. "."
  end
  return importWhole(data)
end

-- " on a w x h screen" from a display block, or "" when it has no usable size.
local function screenText(display)
  local w, h = tonumber(display.width) or 0, tonumber(display.height) or 0
  if w <= 0 or h <= 0 then return "" end
  return string.format(" on a %d x %d screen", math.floor(w), math.floor(h))
end

-- The question asked after importing a profile that carries its UI scale.
function ns.DisplayQuestion(display)
  local screen, mine = screenText(display), ns.DisplayBlock()
  return string.format("This profile was made at UI scale %d%%%s (yours: %d%%). Use its UI scale?",
    math.floor(display.uiScale * 100 + 0.5), screen, math.floor(mine.uiScale * 100 + 0.5))
end

-- After a whole-profile import that carries its UI scale: asks whether to apply that
-- scale (ns.SetUIScale, out of combat), then runs after() either way.
function ns.OfferDisplay(display, after)
  if not display then return after() end
  ns.Ask(ns.DisplayQuestion(display), "Use it", function() ns.SetUIScale(display.uiScale) after() end, after)
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

-- Stages the current spec's profile (and applies it now when `now`, which is only safe before modules
-- read their settings). Returns true if it changed.
local function followSpec(now)
  local name = ns.SpecProfile()
  if not name or name == ns.SelectedProfileName() then
    return false
  end
  ns.UseProfile(name)
  if now then ns.ApplyPendingProfile() end
  return true
end

-- At login (before modules read settings), take the spec's profile quietly.
ns.On("PLAYER_LOGIN", function() followSpec(true) end)

-- On a spec change mid-session, stage the spec's profile and offer the reload that applies it.
local function onSpecChanged()
  if followSpec(false) then
    ns.OfferReload("Your specialization uses profile " .. ns.SelectedProfileName() .. ".")
  end
end

-- PLAYER_SPECIALIZATION_CHANGED names the unit that changed; only the player's matters.
ns.On("PLAYER_SPECIALIZATION_CHANGED", function(_, unit) if unit == nil or unit == "player" then onSpecChanged() end end)
-- ACTIVE_TALENT_GROUP_CHANGED passes (current, previous) group numbers, no unit: always the player's.
ns.On("ACTIVE_TALENT_GROUP_CHANGED", onSpecChanged)
