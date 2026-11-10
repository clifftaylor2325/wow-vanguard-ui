-- Quiet the game (each off until you switch it on, but for the action-bar errors): hide the red error line (but
-- for four errors you must act on: full bags, a full quest log, too many of an item, loot gone), or only the errors
-- that repeat what the action bar already shows; hide the zone and subzone names that fade in on entering an area;
-- let the camera zoom out further; and decline duels, invites and friend requests (Modules/QuietDeclines.lua).

local ADDON, ns = ...

local L = ns.L

local QU = ns.Module("Quiet", { defaults = {
  errors = false, barErrors = true, zoneText = false, camera = 0,
  duels = false, guildInvites = false, strangerGroups = false, friendRequests = false, pvpRelease = false,
}, live = true, afterOff = L["The action bar's own errors stay hidden until you reload."] })

-- Whether a switch of the module is on, while the module is (a switch-off applies at once).
---@param key string
---@return boolean
function QU.Switched(key)
  return QU.scope ~= nil and QU.scope:Running() and type(QU.settings) == "table" and QU.settings[key] == true
end

-- Settings older versions kept in other modules' tables (0.9.4 gathered them here): table -> { old key -> key }.
QU.MOVED = {
  AutoAccept = { duels = "duels", guildInvites = "guildInvites", strangerGroups = "strangerGroups", friendRequests = "friendRequests", pvpRelease = "pvpRelease" },
  Merchant = { errors = "barErrors" },
}

-- Moves one older table's settings into the profile's Quiet table: a value the player had keeps, off when its
-- module was switched off (so nothing starts that wasn't running); a value Quiet already has stands. True when
-- anything moved.
local function moveFrom(profile, from, keys)
  local old, off, moved = profile[from], type(profile.modules) == "table" and profile.modules[from] == false, false
  if type(old) ~= "table" then return false end
  for oldKey, key in pairs(keys) do
    if type(old[oldKey]) == "boolean" then
      profile.Quiet = type(profile.Quiet) == "table" and profile.Quiet or {}
      if profile.Quiet[key] == nil then profile.Quiet[key] = old[oldKey] and not off end
      old[oldKey], moved = nil, true
    end
  end
  return moved
end

-- Quiet's own switches as a switched-off Quiet left the screen: the error line, the zone names, the camera.
QU.WAS_OFF = { errors = false, zoneText = false, camera = 0 }

-- A profile that had Quiet switched off while its declines and action-bar errors ran under the other modules:
-- Quiet is switched on with its own switches as they were in effect, so the moved ones keep running and nothing
-- else on screen changes.
local function wakeForMoved(profile)
  if type(profile.modules) ~= "table" or profile.modules.Quiet ~= false then return end
  profile.modules.Quiet = true
  for key, value in pairs(QU.WAS_OFF) do profile.Quiet[key] = value end
end
ns.MigrateProfile(function(profile)
  local moved = false
  for from, keys in pairs(QU.MOVED) do moved = moveFrom(profile, from, keys) or moved end
  if moved then wakeForMoved(profile) end
end)

-- The furthest-zoom choices (the game's cameraDistanceMaxZoomFactor); 0 is the game's own setting.
QU.CAMERA = { { 0, L["The game's setting"] }, { 1.5, "1.5 x" }, { 2, "2 x" }, { 2.6, L["2.6 x (furthest)"] } }

-- Hides a frame the game just showed, while the module is on and `key` is switched on. The hook goes in once a
-- session, through the scope's gate (it can't be taken off, so it does nothing while the module is off).
local function quiet(scope, frame, key)
  if type(frame) ~= "table" or type(frame.HookScript) ~= "function" then return end
  -- Hides the frame when its switch is on.
  local function hide(f) if QU.Switched(key) then f:Hide() end end
  scope:Gate("quiet " .. tostring(frame), hide, function(gate) frame:HookScript("OnShow", ns.Guard("quiet " .. key, gate)) end)
end

-- How long the error line shows a line, in seconds (Blizzard_UIErrorsFrame: displayDuration 2 plus
-- fadeDuration 0.5), and how far a line's colour may be from the game's red and still count as red.
QU.LINE_LIFE, QU.RED_TOLERANCE = 2.5, 0.1

-- The red errors that stay with the switch on, by the client's names for them (GetGameMessageInfo).
QU.KEEP = { ERR_INV_FULL = true, ERR_QUEST_LOG_FULL = true, ERR_ITEM_MAX_COUNT = true, ERR_LOOT_GONE = true }

-- The error line's other lines (yellow info such as quest progress, system lines, the kept errors) still
-- showing: { text, r, g, b, a, id, at }, so taking a red line off can put them back; and whether they are
-- being put back now (their own AddMessage calls are not new lines).
local shown, readding = {}, false

-- Whether each message type is one of QU.KEEP, read once per type.
local keptType = {}

-- True when a red line's message type is one of QU.KEEP; a hidden, missing or unknown type is not.
local function kept(id)
  id = ns.PlainNumber(id)
  if not id or type(GetGameMessageInfo) ~= "function" then return false end
  if keptType[id] == nil then
    local ok, name = pcall(GetGameMessageInfo, id)
    keptType[id] = ok and type(name) == "string" and not ns.IsSecret(name) and QU.KEEP[name] == true
  end
  return keptType[id]
end

-- True when a colour component is a plain number within QU.RED_TOLERANCE of the red one.
local function near(x, red)
  return type(x) == "number" and not ns.IsSecret(x) and math.abs(x - red) <= QU.RED_TOLERANCE
end

-- True when a line's colour is the game's red (RED_FONT_COLOR, which the game's errors use); a hidden
-- colour or a client without that colour counts as not red.
local function isRed(r, g, b)
  local red = _G.RED_FONT_COLOR
  if type(red) ~= "table" or type(red.GetRGB) ~= "function" then return false end
  local rr, rg, rb = red:GetRGB()
  return near(r, rr) and near(g, rg) and near(b, rb)
end

-- The lines added within QU.LINE_LIFE, oldest first.
local function stillShown(now)
  local out = {}
  for _, line in ipairs(shown) do
    if now - line.at < QU.LINE_LIFE then out[#out + 1] = line end
  end
  return out
end

-- Adds the lines back to the error line.
local function readd(frame, lines)
  for _, l in ipairs(lines) do frame:AddMessage(l.text, l.r, l.g, l.b, l.a, l.id) end
end

-- Takes a red line off the error line: it clears, and the other lines still showing are added again.
-- Each keeps when it first came, so it is put back only within its own time: the game shows a line
-- put back for its full time again, so it can stay up to twice as long, never on and on. An error while
-- putting them back still ends the putting back.
local function dropRed(frame, now)
  local others = stillShown(now)
  frame:Clear()
  readding = true
  pcall(readd, frame, others)
  readding = false
  shown = others
end

-- After the error line adds a line, while the module and the switch are on: a red one (an error, whichever way it came)
-- is taken off, unless it is one of QU.KEEP; any other is remembered. An error the game doesn't show
-- adds no line, so it clears nothing.
local function onLine(frame, text, r, g, b, a, id)
  if not QU.Switched("errors") or readding then return end
  local now = type(GetTime) == "function" and GetTime() or 0
  if isRed(r, g, b) and not kept(id) then return dropRed(frame, now) end
  shown = stillShown(now)
  shown[#shown + 1] = { text = text, r = r, g = g, b = b, a = a, id = id, at = now }
end

-- The action bar's errors --------------------------------------------------------------------

-- How many of the client's message types the noisy-error scan looks at, at most.
QU.LAST_MESSAGE_TYPE = 2000
-- The client's own names for the errors that only repeat what the action bar already shows (their text is in the
-- player's language): ability not ready, not enough rage or energy, no target. Errors you can act on (out of range,
-- not enough mana, bags full) stay.
QU.NOISE = {
  "ERR_ABILITY_COOLDOWN", "ERR_SPELL_COOLDOWN", "ERR_ITEM_COOLDOWN", "ERR_OUT_OF_ENERGY", "ERR_OUT_OF_RAGE",
  "ERR_OUT_OF_FOCUS", "ERR_NO_ATTACK_TARGET", "ERR_GENERIC_NO_TARGET", "SPELL_FAILED_SPELL_IN_PROGRESS",
}

-- The client's message types for the noisy errors, found by their names (GetGameMessageInfo).
-- The scan stops at the first index the client refuses, or at QU.LAST_MESSAGE_TYPE.
function QU.NoisyTypes()
  local names, out = {}, {}
  for _, name in ipairs(QU.NOISE) do names[name] = true end
  for index = 1, QU.LAST_MESSAGE_TYPE do
    local ok, name = pcall(GetGameMessageInfo, index)
    if not ok then break end
    if names[name] then out[#out + 1] = index end
  end
  return out
end

-- Turns the noisy errors off through the client's own switch for each message type
-- (UIErrorsFrame:SetMessageTypeEnabled), at login (a reload applies the switch). The game's handler stays as it
-- is, with its lines, throttling and sounds, and Vanguard never replaces one of its methods (that would taint it).
local function filterBarErrors()
  local frame = _G.UIErrorsFrame
  if type(frame) ~= "table" or type(frame.SetMessageTypeEnabled) ~= "function" or type(GetGameMessageInfo) ~= "function" then return end
  for _, index in ipairs(QU.NoisyTypes()) do frame:SetMessageTypeEnabled(index, false) end
end

-- The error line (UIErrorsFrame): a post-hook on its AddMessage, which never replaces the game's own; gated, so it
-- does nothing while the module is off.
local function errorLine(scope)
  local f = _G.UIErrorsFrame
  if type(f) ~= "table" or type(f.AddMessage) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  scope:Gate("quiet errors", onLine, function(gate) hooksecurefunc(f, "AddMessage", ns.Guard("quiet errors", gate)) end)
end

-- The camera's furthest zoom as the client has it now (nil when it can't say).
local function cameraNow()
  local get = (C_CVar and C_CVar.GetCVar) or _G.GetCVar
  if type(get) == "function" then return get("cameraDistanceMaxZoomFactor") end
end

-- The account's notes on the client: its own state, not a profile's (Core/DB.lua). Empty before they are loaded.
local function clientNotes()
  return type(VanguardDB) == "table" and VanguardDB.client or {}
end

-- The CVar setter, or nil when the client has none.
local function cvarSetter()
  local set = (C_CVar and C_CVar.SetCVar) or _G.SetCVar
  if type(set) == "function" then return set end
end

-- Puts back the player's own furthest zoom, if Vanguard changed it (kept account-wide, since the CVar
-- outlives the profile), and forgets it.
local function restoreCamera(set)
  local notes = clientNotes()
  if notes.cameraPrior ~= nil then set("cameraDistanceMaxZoomFactor", notes.cameraPrior) end
  notes.cameraPrior = nil
end

-- Sets the furthest zoom from the settings: a chosen factor, keeping the player's own value from before
-- Vanguard's first change in the account's cameraPrior; or, for "The game's setting", that kept value put back.
local function setCamera(set, settings)
  local factor = tonumber(settings.camera) or 0
  if factor <= 0 then return restoreCamera(set) end
  local notes = clientNotes()
  if notes.cameraPrior == nil then notes.cameraPrior = cameraNow() end
  return set("cameraDistanceMaxZoomFactor", factor)
end

-- The camera's furthest zoom (a CVar the client lets addons set), out of combat. "The game's setting" (0) puts
-- back the player's own value if Vanguard changed it, and otherwise leaves the game's setting alone.
function QU.ApplyCamera()
  local set, settings = cvarSetter(), QU.settings
  if not set or type(settings) ~= "table" then return end
  if (tonumber(settings.camera) or 0) <= 0 and clientNotes().cameraPrior == nil then return end
  ns.OutOfCombat(function() setCamera(set, settings) end, "quiet camera")
end

-- Moves a value an older version kept in the profile (settings.cameraPrior) to the account's notes,
-- unless they hold one already.
local function adoptProfilePrior(settings)
  if settings.cameraPrior == nil then return end
  local notes = clientNotes()
  if notes.cameraPrior == nil then notes.cameraPrior = settings.cameraPrior end
  settings.cameraPrior = nil
end

-- The module switched off (Core/Modules.lua): the red errors and zone names show again and the declines stop at
-- once (its gates and handlers go with the scope), and the player's own furthest zoom comes back, out of combat.
-- The action bar's errors, turned off through the client's own switch, come back with a reload (afterOff).
function QU.Disable()
  local set = cvarSetter()
  if set then ns.OutOfCombat(function() restoreCamera(set) end, "quiet camera") end
end

-- Module entry point (Core/Modules.lua): the hooks read their switch each time, so the options and a switch-off
-- apply at once.
function QU.Enable(settings, scope)
  QU.settings, QU.scope = settings, scope
  adoptProfilePrior(settings)
  errorLine(scope)
  if settings.barErrors then filterBarErrors() end
  quiet(scope, _G.ZoneTextFrame, "zoneText")
  quiet(scope, _G.SubZoneTextFrame, "zoneText")
  QU.ApplyCamera()
  QU.ListenForPrompts(scope)
end
