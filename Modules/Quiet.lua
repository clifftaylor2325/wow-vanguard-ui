-- Quiet the game (each off until you switch it on): hide the red error line, hide the zone and subzone
-- names that fade in on entering an area, and let the camera zoom out further.

local ADDON, ns = ...

local QU = ns.Module("Quiet", { defaults = { errors = false, zoneText = false, camera = 0 } })

-- The furthest-zoom choices (the game's cameraDistanceMaxZoomFactor); 0 is the game's own setting.
QU.CAMERA = { { 0, "The game's setting" }, { 1.5, "1.5 x" }, { 2, "2 x" }, { 2.6, "2.6 x (furthest)" } }

-- Hides a frame the game just showed, while `key` is switched on.
local function quiet(frame, key)
  if type(frame) ~= "table" or type(frame.HookScript) ~= "function" then return end
  frame:HookScript("OnShow", ns.Guard("quiet " .. key, function(f) if QU.settings[key] then f:Hide() end end))
end

-- How long the error line shows a line, in seconds (Blizzard_UIErrorsFrame: displayDuration 2 plus
-- fadeDuration 0.5), and how far a line's colour may be from the game's red and still count as red.
QU.LINE_LIFE, QU.RED_TOLERANCE = 2.5, 0.1

-- The error line's other lines (yellow info such as quest progress, system lines) still showing:
-- { text, r, g, b, a, id, at }, so taking a red line off can put them back.
local shown = {}

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

-- Takes a red line off the error line: it clears, and the other lines still showing are added again.
local function dropRed(frame, now)
  local others = stillShown(now)
  shown = {}
  frame:Clear()
  for _, l in ipairs(others) do frame:AddMessage(l.text, l.r, l.g, l.b, l.a, l.id) end
end

-- After the error line adds a line, while the switch is on: a red one (an error, whichever way it came)
-- is taken off; any other is remembered. An error the game doesn't show adds no line, so it clears nothing.
local function onLine(frame, text, r, g, b, a, id)
  if not QU.settings.errors then return end
  local now = type(GetTime) == "function" and GetTime() or 0
  if isRed(r, g, b) then return dropRed(frame, now) end
  shown = stillShown(now)
  shown[#shown + 1] = { text = text, r = r, g = g, b = b, a = a, id = id, at = now }
end

-- The error line (UIErrorsFrame): a post-hook on its AddMessage, which never replaces the game's own.
local function errorLine()
  local f = _G.UIErrorsFrame
  if type(f) ~= "table" or type(f.AddMessage) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(f, "AddMessage", ns.Guard("quiet errors", onLine))
end

-- The camera's furthest zoom as the client has it now (nil when it can't say).
local function cameraNow()
  local get = (C_CVar and C_CVar.GetCVar) or _G.GetCVar
  if type(get) == "function" then return get("cameraDistanceMaxZoomFactor") end
end

-- Sets the furthest zoom from the settings: a chosen factor, keeping the player's own value from before
-- Vanguard's first change in settings.cameraPrior; or, for "The game's setting", that kept value put back.
local function setCamera(set, settings)
  local factor = tonumber(settings.camera) or 0
  if factor > 0 then
    if settings.cameraPrior == nil then settings.cameraPrior = cameraNow() end
    return set("cameraDistanceMaxZoomFactor", factor)
  end
  if settings.cameraPrior ~= nil then set("cameraDistanceMaxZoomFactor", settings.cameraPrior) end
  settings.cameraPrior = nil
end

-- The camera's furthest zoom (a CVar the client lets addons set), out of combat. "The game's setting" (0) puts
-- back the player's own value if Vanguard changed it, and otherwise leaves the game's setting alone.
function QU.ApplyCamera()
  local set = (C_CVar and C_CVar.SetCVar) or _G.SetCVar
  local settings = QU.settings
  if type(set) ~= "function" or type(settings) ~= "table" then return end
  if (tonumber(settings.camera) or 0) <= 0 and settings.cameraPrior == nil then return end
  ns.OutOfCombat(function() setCamera(set, settings) end, "quiet camera")
end

-- Module entry point (Core/Modules.lua): the hooks read their switch each time, so the options apply at once.
function QU.Enable(settings)
  QU.settings = settings
  errorLine()
  quiet(_G.ZoneTextFrame, "zoneText")
  quiet(_G.SubZoneTextFrame, "zoneText")
  QU.ApplyCamera()
end
