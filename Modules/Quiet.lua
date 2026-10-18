-- Quiet the game (each off until you switch it on): hide the red error line, hide the zone and subzone
-- names that fade in on entering an area, and let the camera zoom out further.

local ADDON, ns = ...

local QU = ns.Module("Quiet", { defaults = { errors = false, zoneText = false, camera = 0 } })

-- The furthest-zoom choices (the game's cameraDistanceMaxZoomFactor); 0 leaves the game's own setting.
QU.CAMERA = { { 0, "game's setting" }, { 1.5, "1.5 x" }, { 2, "2 x" }, { 2.6, "2.6 x (furthest)" } }

-- Hides a frame the game just showed, while `key` is switched on.
local function quiet(frame, key)
  if type(frame) ~= "table" or type(frame.HookScript) ~= "function" then return end
  frame:HookScript("OnShow", ns.Guard("quiet " .. key, function(f) if QU.settings[key] then f:Hide() end end))
end

-- The error line (UIErrorsFrame): each line is cleared as it arrives, while the switch is on.
local function errorLine()
  local f = _G.UIErrorsFrame
  if type(f) ~= "table" or type(f.AddMessage) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(f, "AddMessage", ns.Guard("quiet errors", function(self) if QU.settings.errors and self.Clear then self:Clear() end end))
end

-- The camera's furthest zoom (a CVar the client lets addons set), out of combat; 0 leaves the game's own setting.
function QU.ApplyCamera()
  local set = (C_CVar and C_CVar.SetCVar) or _G.SetCVar
  local factor = QU.settings and tonumber(QU.settings.camera) or 0
  if type(set) ~= "function" or factor <= 0 then return end
  ns.OutOfCombat(function() set("cameraDistanceMaxZoomFactor", factor) end, "quiet camera")
end

-- Module entry point (Core/Modules.lua): the hooks read their switch each time, so the options apply at once.
function QU.Enable(settings)
  QU.settings = settings
  errorLine()
  quiet(_G.ZoneTextFrame, "zoneText")
  quiet(_G.SubZoneTextFrame, "zoneText")
  QU.ApplyCamera()
end
