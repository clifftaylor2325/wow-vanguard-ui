-- Unlock mode's bar: a small bar at the top of the screen while the frames
-- are unlocked. Save and lock keeps every change; Exit without saving puts
-- every frame back as it was when unlock started (spot, links, size, scale
-- and opacity) and locks. Its note says how to move a frame. When unlock was
-- started from the options window, either button opens it again on the same
-- page. Not shown while the game's Edit Mode unlocked the frames: Edit Mode
-- has its own buttons, and closing it keeps the changes.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local bar
-- Every saved spot as it was when unlock started (a copy), until the frames lock.
local before
-- The options page unlock was started from, until the frames lock.
local fromPage

-- The bar's note and its spacing (units): the gaps around the note and between the buttons.
local BAR = { hint = "Drag to move · right-click for anchor, scale, opacity · arrows nudge (Shift ×10)",
  pad = 12, gap = 6, edge = 8, save = 110, exit = 140, height = 36 }

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

-- Whether the options window is open now.
local function optionsOpen()
  local window = ns.Options.Frame()
  return window ~= nil and window:IsShown()
end

-- Runs a bar button's action, then opens the options window again on the page unlock started from, if it did and
-- the window isn't open already (the action locks the frames, which forgets the page, so it is read first).
local function thenBack(action)
  return function()
    local page = fromPage
    action()
    if page and not ns.InCombat() and not optionsOpen() then ns.Options.Show(page) end
  end
end

-- The bar's two buttons, at its right: Save and lock, and Exit without saving left of it.
local function addButtons()
  local u = BAR
  bar.save = W.Primary(bar, "Save and lock", thenBack(function() ns.Lock() end), u.save)
  bar.save:SetPoint("RIGHT", -u.edge, 0)
  bar.exit = W.Button(bar, "Exit without saving", thenBack(function() ns.ExitWithoutSaving() end), u.exit)
  bar.exit:SetPoint("RIGHT", bar.save, "LEFT", -u.gap, 0)
end

-- The bar's note at its left.
local function addHint()
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "label", "text2")
  bar.text:SetPoint("LEFT", BAR.pad, 0)
  bar.text:SetText(BAR.hint)
end

-- Makes the bar as wide as its note and buttons need, at the text size in use now.
local function fitBar()
  local u = BAR
  bar:SetSize(u.pad + bar.text:GetStringWidth() + u.pad + u.exit + u.gap + u.save + u.edge, u.height)
end

-- The bar, built once: a raised panel at the top center, over the handles, with its note and buttons.
local function build()
  bar = T.Panel(CreateFrame("Frame", "Vanguard_UnlockBar", UIParent), { raised = true, shadow = true })
  bar:SetPoint("TOP", UIParent, "TOP", 0, -40)
  bar:SetFrameStrata("FULLSCREEN_DIALOG")
  bar:EnableMouse(true)
  addHint()
  addButtons()
end

-- Unlocks the frames from the options window's page `page`, which closes; the bar's buttons open it again there.
-- In a fight nothing unlocks, the window stays, and chat says why.
---@param page string
function ns.UnlockFromOptions(page)
  if ns.InCombat() then return ns.Chat("In combat. Try again once combat ends.") end
  ns.Options.Hide()
  ns.Unlock()
  fromPage = page
end

-- Unlock started: remembers every saved spot (once, until the frames lock) and shows the bar,
-- unless the game's Edit Mode unlocked them.
function ns.UnlockStarted(editMode)
  before = before or ns.Copy(ns.Settings("positions"))
  if not bar then build() end
  fitBar()
  bar:SetShown(not editMode)
end

-- The frames locked: what was remembered is forgotten (the changes stay) and the bar hides.
function ns.UnlockEnded()
  before, fromPage = nil, nil
  if bar then bar:Hide() end
end
