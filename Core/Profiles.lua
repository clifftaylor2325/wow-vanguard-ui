-- Profile management on top of Core/DB.lua: new, copy, delete and reset,
-- export/import strings (Core/Serialize.lua), profiles that follow your
-- specialization, and the game's Edit Mode layout that goes with a profile.
-- Profile changes apply on reload; Vanguard offers one.
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
  if not ns.ValidProfileName(name) or VanguardDB.profiles[name] then
    return false
  end
  VanguardDB.profiles[name] = {}
  return true
end

-- Copies another profile's settings over the active one.
function ns.CopyProfile(from)
  local source = VanguardDB.profiles[from]
  if not source or from == ns.ProfileName() then
    return false
  end
  VanguardDB.profiles[ns.ProfileName()] = ns.Copy(source)
  ns.ProfileChanged()
  return true
end

-- Deletes a profile (never the active or the staged one); characters or specs using it fall back to Default.
function ns.DeleteProfile(name)
  if not VanguardDB.profiles[name] or name == ns.ProfileName() or name == ns.SelectedProfileName() then
    return false
  end
  VanguardDB.profiles[name] = nil
  return true
end

-- Clears every setting in the active profile back to defaults.
function ns.ResetProfile()
  VanguardDB.profiles[ns.ProfileName()] = {}
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

-- The export string for scope, from the profile's tables as they are now.
local function encode(scope)
  local profile = ns.Profile()
  local data = scope == "profile" and withDisplay(profile) or profile[scope]
  if type(data) ~= "table" then
    return nil, "nothing saved for " .. scope .. " yet"
  end
  return S.Encode(scope, data)
end

-- The export string for the whole profile ("profile", with the UI scale and screen it
-- was made on) or one module's settings: the profile's own values, with any active
-- Situations override taken out for the export (ns.OwnValues, Modules/Situations.lua).
function ns.ExportProfile(scope)
  scope = scope or "profile"
  if ns.OwnValues then return ns.OwnValues(encode, scope) end
  return encode(scope)
end

-- A profile name that isn't taken yet, from base ("Imported", "Imported 2", ...).
local function freeName(base)
  local name, n = base, 1
  while VanguardDB.profiles[name] do
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
  VanguardDB.profiles[name] = data
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
  VanguardCharDB.specProfiles = type(VanguardCharDB.specProfiles) == "table" and VanguardCharDB.specProfiles or {}
  return VanguardCharDB.specProfiles
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
  return name and VanguardDB.profiles[name] and name or nil
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

-- Edit Mode layout -------------------------------------------------------------------------
-- A profile remembers the name of the game's Edit Mode layout in use (profile.editMode.layout,
-- so it is in the profile's export string too). When a character loads a profile other than
-- the one it last ran, Vanguard switches Edit Mode to that layout, out of combat, if this
-- account has a layout of that name. Edit Mode's layouts are read through its own manager
-- (EditModeManagerFrame: the presets first, then the account's and the character's), and the
-- switch is the client's C_EditMode.SetActiveLayout, as Edit Mode's layout menu does it.

-- The game's Edit Mode manager, when it has the methods Vanguard reads; else nil.
local function editModeManager()
  local f = _G.EditModeManagerFrame
  if type(f) == "table" and type(f.GetLayouts) == "function" and type(f.GetActiveLayoutInfo) == "function" then return f end
end

-- The name of the Edit Mode layout in use, or nil (no Edit Mode, or its layouts aren't loaded yet).
function ns.EditModeLayout()
  local f = editModeManager()
  local info = f and f:GetActiveLayoutInfo()
  return type(info) == "table" and info.layoutName or nil
end

-- The position of the layout called name in Edit Mode's list, or nil when this account has none.
local function layoutIndex(f, name)
  for i, info in ipairs(f:GetLayouts() or {}) do
    if type(info) == "table" and info.layoutName == name then return i end
  end
end

-- The active profile's Edit Mode settings: { layout = name }.
local function editModeSettings()
  return ns.Settings("editMode")
end

local layoutsSeen, switching = false, false

-- Remembers the layout in use in the active profile (not while a switch to the profile's own waits for combat to end).
local function rememberLayout()
  if switching then return end
  editModeSettings().layout = ns.EditModeLayout()
end

-- Switches Edit Mode to the layout at index, out of combat, and says so.
local function switchLayout(index, name)
  switching = true
  ns.OutOfCombat(function()
    switching = false
    C_EditMode.SetActiveLayout(index)
    ns.Chat("Edit Mode layout " .. name .. ", from profile " .. ns.ProfileName() .. ".")
  end)
end

-- True when the client can switch Edit Mode's layout.
local function canSwitch()
  return type(C_EditMode) == "table" and type(C_EditMode.SetActiveLayout) == "function"
end

-- The profile's layout, when this character has just loaded the profile (it ran another one
-- last time), the profile names a layout other than the one in use and the client can switch; else nil.
local function layoutToLoad()
  local last = VanguardCharDB.editModeProfile
  VanguardCharDB.editModeProfile = ns.ProfileName()
  local name = editModeSettings().layout
  if last == nil or last == ns.ProfileName() or type(name) ~= "string" or name == ns.EditModeLayout() then return nil end
  return canSwitch() and name or nil
end

-- The first time this session Edit Mode has its layouts: switch to the profile's layout when the
-- profile was just loaded (a missing one is reported and stays remembered); afterwards, and
-- otherwise, remember the layout in use.
local function onLayouts()
  if layoutsSeen then return rememberLayout() end
  layoutsSeen = true
  local name = layoutToLoad()
  local index = name and layoutIndex(editModeManager(), name)
  if index then return switchLayout(index, name) end
  if name then return ns.Chat("Profile " .. ns.ProfileName() .. " uses Edit Mode layout " .. name .. ", which this account doesn't have.") end
  rememberLayout()
end

-- Follows Edit Mode's layouts from a post-hook on its manager's UpdateLayoutInfo (it runs
-- whenever the layouts load or change); when they loaded before login, starts now.
local function watchLayouts()
  local f = editModeManager()
  if not f or type(f.UpdateLayoutInfo) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(f, "UpdateLayoutInfo", onLayouts)
  if ns.EditModeLayout() then onLayouts() end
end
-- (Registered after the spec profile's login handler, so the profile is settled first.)
ns.On("PLAYER_LOGIN", watchLayouts)
