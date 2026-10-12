-- The Situations banner: while a situation is recording (Modules/Situations.lua),
-- a strip over the options window, and one at the top of the screen while the
-- frames are unlocked, say "Editing as: Raid · changes apply only in Raid",
-- with a button that stops recording, saves what changed and puts the base
-- profile back. While recording, the options rows of settings an override
-- can't hold say so (O.SettingNote, which Core/OptionsWindow.lua reads).
--
-- The banners clear when recording stops (the button, the page, /vg situation
-- stop, logout), on a profile change, and the screen one when the frames lock
-- (by hand, or for combat).

local ADDON, ns = ...

local T, W, O = ns.Theme, ns.Widgets, ns.Options
local SI = ns.GetModule("Situations")

local B = {}
SI.Banner = B

-- The strips' height, and their button's width.
local HEIGHT, BUTTON_WIDTH = 30, 110

-- What the banner says while recording a situation (one of SI.NAMES).
function B.Text(name)
  local label = SI.LABELS[name]
  return "Editing as: " .. label .. " · changes apply only in " .. label
end

-- What a setting row an override can't hold says while recording, or nil (not recording, or one it can hold).
function O.SettingNote(module, key)
  if not SI.recording or SI.Holds(module, key) then return nil end
  return "Not recorded for " .. SI.LABELS[SI.recording] .. ": this setting changes your base profile."
end

-- The button: stops recording and saves it (the chat says what was kept), out of combat.
local function stopAndSave()
  ns.OutOfCombat(function() SI.SetRecording("off") end, "situations")
end

-- One strip: a raised panel with an accent border, the text on the left and the button on the right; hidden.
local function strip(parent)
  local f = T.Panel(CreateFrame("Frame", nil, parent), { raised = true, accent = true })
  f:SetHeight(HEIGHT)
  f.text = T.Text(f:CreateFontString(nil, "OVERLAY"), "label")
  f.text:SetPoint("LEFT", 10, 0)
  f.button = W.Button(f, "Stop and save", stopAndSave, BUTTON_WIDTH)
  f.button:SetPoint("RIGHT", -4, 0)
  f:Hide()
  return f
end

-- The strip along the top edge of the options window, just outside it (made once the window is).
local function optionsStrip()
  local window = O.Frame()
  if B.options or not window then return B.options end
  B.options = strip(window)
  B.options:SetPoint("BOTTOMLEFT", window, "TOPLEFT", 0, 4)
  B.options:SetPoint("BOTTOMRIGHT", window, "TOPRIGHT", 0, 4)
  return B.options
end

-- The strip at the top center of the screen, above the frames' handles; it fits its text.
local function screenStrip()
  if B.screen then return B.screen end
  B.screen = strip(UIParent)
  B.screen:SetPoint("TOP", UIParent, "TOP", 0, -8)
  B.screen:SetFrameStrata("FULLSCREEN_DIALOG")
  B.screen.fit = true
  return B.screen
end

-- Sets a strip's text (a fitting strip takes its width from it) and shows it while on.
local function show(f, on, text)
  if not f then return end
  f.text:SetText(text)
  if f.fit then f:SetWidth(f.text:GetStringWidth() + BUTTON_WIDTH + 24) end
  f:SetShown(on)
end

-- Shows the banners that apply: the options one while recording, the screen one while recording with the frames unlocked.
function B.Update()
  local name = SI.recording
  local unlocked = name ~= nil and ns.Unlocked()
  show(optionsStrip(), name ~= nil, name and B.Text(name) or "")
  show(unlocked and screenStrip() or B.screen, unlocked, name and B.Text(name) or "")
end

-- Recording started or stopped: the banners follow, and the options rows re-read their notes.
function B.Changed()
  B.Update()
  O.Refresh()
end

hooksecurefunc(SI, "StartRecording", ns.Guard("situations banner", B.Changed))
hooksecurefunc(SI, "StopRecording", ns.Guard("situations banner", B.Changed))
hooksecurefunc(ns, "Unlock", ns.Guard("situations banner", B.Update))
hooksecurefunc(ns, "Lock", ns.Guard("situations banner", B.Update))
hooksecurefunc(O, "Refresh", ns.Guard("situations banner", B.Update))
-- A profile change stops a recording: only the banners follow here (the rows re-read their notes when
-- Situations refreshes the page; refreshing them now would read the new profile's tables before it is settled).
ns.OnProfileChanged(ns.Guard("situations banner", B.Update))
