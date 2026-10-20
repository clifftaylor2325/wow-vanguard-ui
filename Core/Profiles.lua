-- Profile management on top of Core/DB.lua: new, copy, delete and reset,
-- export/import strings (Core/Serialize.lua, Core/ProfileStrings.lua) with a
-- backup before every import, profiles that follow your
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

-- A copy of a profile's own values: an active Situations override is taken out of the profile in use
-- for the copy (ns.OwnValues, Modules/Situations.lua), as for an export.
local function ownCopy(profile)
  if ns.OwnValues then return ns.OwnValues(ns.Copy, profile) end
  return ns.Copy(profile)
end

-- Copies another profile's settings over the one this character uses after the next reload: the
-- active one, or the one staged while a switch waits (so the profile running until then is never
-- overwritten). Returns the name copied into, or false.
function ns.CopyProfile(from)
  local source, into = VanguardDB.profiles[from], ns.SelectedProfileName()
  if not source or from == into then
    return false
  end
  VanguardDB.profiles[into] = ownCopy(source)
  if into == ns.ProfileName() then ns.ProfileChanged() end
  return into
end

-- Deletes a profile (never the active or the staged one). A character using it, or with it staged,
-- falls back to Default at its next load (Core/DB.lua); a spec set to it uses the character's profile.
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

-- The whole profile for export: its settings (without this computer's own state), plus the display
-- block, format and version beside them.
local function withDisplay(profile)
  local data = {}
  for k, v in pairs(profile) do data[k] = v end
  data.display = ns.DisplayBlock()
  return ns.StampPayload(ns.WithoutClientState(data))
end

-- The export string for scope, from the profile's tables as they are now: the whole profile,
-- or only the parts asked for (Core/ProfileStrings.lua's ns.FindParts).
local function encode(scope)
  local profile = ns.Profile()
  local parts, missing = ns.FindParts(scope, profile)
  if missing then
    return nil, "nothing saved for " .. missing .. " yet"
  end
  if not parts then return S.Encode("profile", withDisplay(profile)) end
  return S.Encode("parts", ns.PartsPayload(profile, parts))
end

-- The export string for the whole profile ("profile" or nil, with the UI scale and screen it
-- was made on) or some parts of it (a part's name, or a list of them: layout, situations,
-- global, a module, or a table's own name such as theme; a list naming every part is the
-- whole profile): the profile's own values, with any active Situations override taken out
-- for the export (ns.OwnValues, Modules/Situations.lua).
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

-- A profile name base from a character's name: the characters a profile name can hold
-- (short enough for freeName's " 2"), else "Character".
local function nameBase(name)
  local base = (type(name) == "string" and name or ""):gsub("[^%w%s%-_]", "")
  return base ~= "" and base:sub(1, 29) or "Character"
end

-- The name ns.ForkProfile would give a profile for this character name.
function ns.ForkName(name)
  return freeName(nameBase(name))
end

-- Gives this character a profile of its own named after `name`, without a reload: the running
-- profile's tables move to the new name (the modules and the settings cache keep using them), and
-- the old name keeps a copy of its own values (no Situations override), so the characters sharing it
-- see what they had. Returns the new name.
function ns.ForkProfile(name)
  local new, live = ns.ForkName(name), ns.Profile()
  VanguardDB.profiles[ns.ProfileName()] = ownCopy(live)
  VanguardDB.profiles[new] = live
  VanguardCharDB.profile, VanguardCharDB.editModeProfile = new, new
  return new
end

-- True when another character runs on the profile called name, as the account file's guard notes
-- each character's profile at logout (Core/SettingsGuard.lua; a damaged note is skipped).
local function characterUses(name)
  local guard = type(VanguardDB.guard) == "table" and VanguardDB.guard
  for _, char in pairs(guard and type(guard.chars) == "table" and guard.chars or {}) do
    if type(char) == "table" and char.profile == name then return true end
  end
  return false
end

-- True when a backup must not replace the profile called name: this character uses it now, after
-- the reload or for a spec, or another character uses it.
local function profileInUse(name)
  if name == ns.ProfileName() or name == ns.SelectedProfileName() then return true end
  for _, profile in pairs(type(VanguardCharDB.specProfiles) == "table" and VanguardCharDB.specProfiles or {}) do
    if profile == name then return true end
  end
  return characterUses(name)
end

-- "<name> backup" (n 1) or "<name> backup <n>", the name cut to fit 32 characters.
local function backupName(name, n)
  local suffix = n == 1 and " backup" or (" backup " .. n)
  return name:sub(1, 32 - #suffix) .. suffix
end

-- The rolling backup's name for a profile: "<name> backup"; never a profile in use (by this
-- character, now, after the reload or for a spec, or by another character): then "<name> backup 2", 3 and on.
function ns.BackupName(name)
  local n = 1
  while profileInUse(backupName(name, n)) do n = n + 1 end
  return backupName(name, n)
end

-- Copies the profile this character uses (its own values: an active Situations override is
-- taken out, as for an export) into its one rolling backup profile, replacing the last
-- backup. Runs before every import. Returns the backup's name.
function ns.BackupProfile()
  local name = ns.BackupName(ns.ProfileName())
  VanguardDB.profiles[name] = ownCopy(ns.Profile())
  return name
end

-- The display block taken out of an imported profile when its UI scale is a usable number, else nil.
local function takeDisplay(data)
  local display = data.display
  data.display = nil
  local scale = type(display) == "table" and tonumber(display.uiScale)
  return scale and scale > 0 and display or nil
end

-- A whole profile whose settings equal one this account has: this character uses that one
-- (after a reload, unless it is already the one in use), and nothing is added.
local function importMatch(name, result)
  ns.UseProfile(name)
  result.reload = name ~= ns.ProfileName()
  if result.reload then return "This string matches profile " .. name .. "; this character will use it after a reload." end
  return "This string matches profile " .. name .. ", which this character already uses: nothing new to import."
end

-- Puts this player's own pixel-perfect switch and multiple in an imported profile's theme: like the
-- display block they belong to the screen the string was made on, so that screen's never come along
-- (Use its UI scale? then turns the switch off where the game's scale runs).
local function ownPixelScale(data)
  data.theme = type(data.theme) == "table" and data.theme or {}
  local mine = ns.Theme.Settings()
  data.theme.pixelScale, data.theme.pixelMultiple = mine.pixelScale, mine.pixelMultiple
end

-- A whole imported profile: saved under a free name (without its display block, which goes
-- in the result, and with this player's pixel-perfect scale), and this character switches to it
-- on reload; one that matches a profile this account has uses that profile instead of making another copy.
local function importWhole(data, result)
  result.display = takeDisplay(data)
  ownPixelScale(data)
  local match = ns.MatchingProfile(ns.StripPayload(data))
  if match then return importMatch(match, result) end
  local name = freeName("Imported")
  VanguardDB.profiles[name] = data
  ns.UseProfile(name)
  return "Imported as profile " .. name .. "; this character will use it after a reload."
end

-- A partial string: its tables merge into the active profile, key by key.
local function importParts(data)
  ns.MergeParts(ns.Profile(), data)
  return "Imported " .. ns.PartsText(data) .. " settings into profile " .. ns.ProfileName() .. "."
end

-- The import's notes: each font or bar texture the string names that this client lacks, then where the backup is.
local function importNotes(payload, backup)
  local notes = ns.MissingMedia(payload)
  notes[#notes + 1] = "Profile " .. ns.ProfileName() .. " as it was before this import is saved as profile " .. backup .. "."
  return notes
end

-- Applies a decoded string (scope and settings, or nil and why not; Core/Serialize.lua): an
-- older string is upgraded first, the other computer's own state is left out (ns.WithoutClientState),
-- and the profile in use is backed up (ns.BackupProfile). A
-- whole profile becomes a new profile this character switches to (or the one it matches); a
-- partial string merges into the active profile. Returns what happened and the result
-- { display (a whole profile's UI scale block, or nil), reload, notes, backup }, or nil and why not.
function ns.ApplyImport(scope, data)
  local kind, payload = ns.ReadPayload(scope, data)
  if not kind then return nil, payload end
  ns.WithoutClientState(payload)
  local backup = ns.BackupProfile()
  local result = { notes = importNotes(payload, backup), backup = backup, reload = true }
  local text = kind == "profile" and importWhole(payload, result) or importParts(payload)
  return text, result
end

-- Applies an import string at once (ns.StartImport, Core/ProfileStrings.lua, spreads a large
-- one over frames): see ns.ApplyImport.
function ns.ImportProfile(text)
  return ns.ApplyImport(S.Decode(text))
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

-- A staged profile's theme table (made when it has none yet): the settings cache only holds the
-- profile on screen until the reload.
local function stagedTheme(name)
  local profile = VanguardDB.profiles[name]
  profile.theme = type(profile.theme) == "table" and profile.theme or {}
  return profile.theme
end

-- Turns Vanguard's pixel-perfect scale off in the profile this character uses after the reload
-- (an import is only staged, so the profile on screen keeps its own), since it would replace the game's UI scale.
local function pixelScaleOffAfterReload()
  local name = ns.SelectedProfileName()
  local theme = name == ns.ProfileName() and ns.Theme.Settings() or stagedTheme(name)
  theme.pixelScale = false
end

-- Sets an imported profile's UI scale (the game's, out of combat) for the profile it was imported into.
local function useDisplayScale(display)
  if ns.SetGameUIScale(display.uiScale) then pixelScaleOffAfterReload() end
end

-- After a whole-profile import that carries its UI scale: asks whether to apply that
-- scale (useDisplayScale), then runs after() either way.
function ns.OfferDisplay(display, after)
  if not display then return after() end
  ns.Ask(ns.DisplayQuestion(display), "Use it", function() useDisplayScale(display) after() end, after)
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

-- The client's role names (a specialization's or a group role) -> Vanguard's.
local ROLE_KEYS = { TANK = "tank", HEALER = "healer", DAMAGER = "damage" }

-- Vanguard's name for a client role ("tank", "healer" or "damage"), or nil for none, an unknown one or a hidden one.
---@param role any
---@return string|nil
function ns.RoleKey(role)
  if ns.IsSecret(role) then return nil end
  return ROLE_KEYS[role]
end

-- Your group role as Vanguard names it, "damage" when you have none or the client hides it. The group
-- role can be secret (SecretWhenUnitIdentityRestricted), and callers use it as a table key.
---@return string
function ns.PlayerRole()
  local assigned = type(UnitGroupRolesAssigned) == "function" and UnitGroupRolesAssigned("player")
  return ns.RoleKey(assigned) or "damage"
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

-- True when the staged profile is one a spec uses, so a spec change staged it (not the player's own pick).
local function specStaged()
  local pending = ns.PendingProfileName()
  for _, name in pairs(specMap()) do
    if name == pending then return true end
  end
  return false
end

-- Stages the current spec's profile (and applies it now when `now`, which is only safe before modules
-- read their settings); a spec with no profile of its own uses the character's, so it takes back a
-- switch another spec staged. Returns true if a switch was staged.
local function followSpec(now)
  local name = ns.SpecProfile()
  if not name and specStaged() then ns.UseProfile(ns.ProfileName()) end
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
  hooksecurefunc(f, "UpdateLayoutInfo", ns.Guard("hook UpdateLayoutInfo", onLayouts))
  if ns.EditModeLayout() then onLayouts() end
end
-- (Registered after the spec profile's login handler, so the profile is settled first.)
ns.On("PLAYER_LOGIN", watchLayouts)
