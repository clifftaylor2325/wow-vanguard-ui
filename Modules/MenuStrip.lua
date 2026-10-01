-- The game's always-on extras, put where they don't clutter the screen:
--   * the micro menu (character, spellbook, talents, ...) and the bag bar,
--     side by side in one small strip in the bottom-right corner, which shows
--     only while the mouse is over it (or always, if you prefer);
--   * the quest tracker, under the info strip on the right, no taller than its spot.
-- Both stay where they're put when the game lays out its own frames again
-- (ns.Pin), and a client without one of these frames simply keeps its own.

local ADDON, ns = ...

local T = ns.Theme

local MS = ns.Module("MenuStrip", { defaults = { menu = "mouseover", tracker = true } })

MS.WIDTH, MS.HEIGHT, MS.SCALE = 300, 36, 0.8
-- The quest tracker's spot: its width and the most height it gets (it ends above the
-- target of target at UI scale 1.0).
MS.TRACKER_W, MS.TRACKER_H = 260, 280
-- How often the strip checks for the mouse (seconds).
MS.POLL = 0.15

-- The menu strip ---------------------------------------------------------------------------

-- Pins one of the game's bars into the strip at one end, drawn smaller.
local function pinInto(name, point, x)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetPoint then return end
  ns.Pin(f, function(bar)
    bar:SetParent(MS.strip)
    bar:SetScale(MS.SCALE)
    bar:ClearAllPoints()
    bar:SetPoint(point, MS.strip, point, x, 0)
  end)
end

-- Shows the strip while the mouse is over it (checked a few times a second).
local function watchMouse(strip)
  local elapsed = 0
  strip:SetScript("OnUpdate", function(self, dt)
    elapsed = elapsed + dt
    if elapsed < MS.POLL then return end
    elapsed = 0
    self:SetAlpha(self:IsMouseOver() and 1 or 0)
  end)
end

-- The strip in the bottom-right corner with the micro menu and bag bar in it.
local function buildStrip(settings)
  MS.strip = T.HudPanel(CreateFrame("Frame", "ForeverUI_MenuStrip", UIParent), { inset = true })
  MS.strip:SetSize(MS.WIDTH, MS.HEIGHT)
  ns.Mover(MS.strip, "menustrip", "Menu and bags", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 20 })
  pinInto("MicroMenuContainer", "LEFT", 4)
  pinInto("BagsBar", "RIGHT", -4)
  if settings.menu == "mouseover" then watchMouse(MS.strip) MS.strip:SetAlpha(0) end
end

-- The quest tracker -------------------------------------------------------------------------

-- The tracker's spot under the info strip, and the game's tracker pinned into it.
local function buildTracker()
  MS.trackerSpot = CreateFrame("Frame", "ForeverUI_QuestTracker", UIParent)
  MS.trackerSpot:SetSize(MS.TRACKER_W, MS.TRACKER_H)
  ns.Mover(MS.trackerSpot, "questtracker", "Quest tracker", { "TOPRIGHT", "TOPRIGHT", -12, -244 })
  local tracker = _G.ObjectiveTrackerFrame
  if type(tracker) ~= "table" or not tracker.SetPoint then return end
  ns.Pin(tracker, function(f)
    f:ClearAllPoints()
    f:SetPoint("TOPRIGHT", MS.trackerSpot, "TOPRIGHT", 0, 0)
    f:SetHeight(MS.TRACKER_H)
  end)
end

-- Module entry point (Core/Modules.lua): out of combat, since some of these hold secure buttons.
function MS.Enable(settings)
  ns.OutOfCombat(function()
    buildStrip(settings)
    if settings.tracker then buildTracker() end
  end)
end
