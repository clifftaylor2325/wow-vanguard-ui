-- Unlock mode's bar: a small bar at the top of the screen while the frames
-- are unlocked. Save and lock keeps every change; Exit without saving puts
-- every frame back as it was when unlock started (spot, links, size, scale
-- and opacity) and locks. Not shown while the game's Edit Mode unlocked the
-- frames: Edit Mode has its own buttons, and closing it keeps the changes.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local bar
-- Every saved spot as it was when unlock started (a copy), until the frames lock.
local before

-- Puts every saved spot back as it was when unlock started, places every frame again, tells what
-- follows each one (ns.MoverChanged: linked frames, the raid grid's growth) once all are back, and locks.
function ns.ExitWithoutSaving()
  local positions, movers = ns.Settings("positions"), ns.MoverList()
  for key in pairs(positions) do positions[key] = nil end
  for key, spot in pairs(before or {}) do positions[key] = type(spot) == "table" and ns.Copy(spot) or spot end
  for _, m in ipairs(movers) do ns.PlaceMover(m.key) end
  for _, m in ipairs(movers) do ns.MoverChanged(m.key) end
  ns.Lock()
  ns.Chat("Every frame is back where it was when you unlocked.")
end

-- The bar's two buttons, at its right: Save and lock, and Exit without saving left of it.
local function addButtons()
  bar.save = W.Primary(bar, "Save and lock", function() ns.Lock() end, 110)
  bar.save:SetPoint("RIGHT", -8, 0)
  bar.exit = W.Button(bar, "Exit without saving", function() ns.ExitWithoutSaving() end, 140)
  bar.exit:SetPoint("RIGHT", bar.save, "LEFT", -6, 0)
end

-- The bar, built once: a raised panel at the top center, over the handles, with its note and buttons.
local function build()
  bar = T.Panel(CreateFrame("Frame", "Vanguard_UnlockBar", UIParent), { raised = true, shadow = true })
  bar:SetSize(400, 36)
  bar:SetPoint("TOP", UIParent, "TOP", 0, -40)
  bar:SetFrameStrata("FULLSCREEN_DIALOG")
  bar:EnableMouse(true)
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "label", "text2")
  bar.text:SetPoint("LEFT", 12, 0)
  bar.text:SetText("Moving frames")
  addButtons()
end

-- Unlock started: remembers every saved spot (once, until the frames lock) and shows the bar,
-- unless the game's Edit Mode unlocked them.
function ns.UnlockStarted(editMode)
  before = before or ns.Copy(ns.Settings("positions"))
  if not bar then build() end
  bar:SetShown(not editMode)
end

-- The frames locked: what was remembered is forgotten (the changes stay) and the bar hides.
function ns.UnlockEnded()
  before = nil
  if bar then bar:Hide() end
end
