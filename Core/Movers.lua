-- Movers: every ForeverUI frame that can be placed registers here. /fui
-- unlock shows a labeled handle over each, plus a grid. Drag a handle and
-- it snaps to nearby frame edges and the screen center; click one and the
-- arrow keys nudge it (Shift: 10 px). Positions are saved per profile
-- against the nearest screen edge, so they hold across resolutions.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.Layout

local DEFAULTS = { grid = true, gridSize = 32, snap = true, editMode = true }
local NUDGE = { UP = { 0, 1 }, DOWN = { 0, -1 }, LEFT = { -1, 0 }, RIGHT = { 1, 0 } }

local movers, order = {}, {}
local unlocked = false
local selected

-- Unlock-mode options (grid, gridSize, snap, editMode) in the active profile.
function ns.MoverOptions()
  return ns.Settings("movers", DEFAULTS)
end

-- Saved positions in the active profile: key -> { point, relPoint, x, y }.
local function saved()
  return ns.Settings("positions")
end

-- The point to use for a mover: saved, else its default.
local function pointFor(m)
  local p = saved()[m.key]
  if type(p) == "table" and p.point then
    return p.point, p.relPoint or p.point, p.x or 0, p.y or 0
  end
  return m.default[1], m.default[2], m.default[3], m.default[4]
end

-- Anchors a frame (or a mover handle) at the mover's point on UIParent.
local function anchor(frame, m)
  local point, relPoint, x, y = pointFor(m)
  frame:ClearAllPoints()
  frame:SetPoint(point, UIParent, relPoint, x, y)
end

-- Puts a mover's frame at its point; protected frames wait for combat to end.
local function place(m)
  ns.OutOfCombat(function() anchor(m.frame, m) end)
end

-- Registers a placeable frame. default = { point, relPoint, x, y } on UIParent.
function ns.Mover(frame, key, label, default)
  local m = { frame = frame, key = key, label = label or key, default = default }
  if not movers[key] then
    order[#order + 1] = key
  end
  movers[key] = m
  place(m)
  return m
end

-- Changes a mover's default point (a stacked bar whose neighbors changed
-- size) and moves its frame, and its handle in unlock mode, there, unless a
-- saved position wins.
function ns.SetMoverDefault(key, default)
  local m = movers[key]
  if not m then return end
  m.default = default
  place(m)
  if m.handle then anchor(m.handle, m) end
end

-- Saving ------------------------------------------------------------------------------

-- Saves a position for a mover, moves its frame, and keeps its handle on it.
local function savePosition(m, point, relPoint, x, y)
  saved()[m.key] = { point = point, relPoint = relPoint, x = x, y = y }
  place(m)
  if m.handle then
    anchor(m.handle, m)
    ns.ShowCoords(m)
  end
  if ns.OnMoverMoved then ns.OnMoverMoved(m.key) end
end

-- A mover's point, relative point and offsets (saved, or its default);
-- nothing for an unknown key.
function ns.MoverPoint(key)
  if movers[key] then return pointFor(movers[key]) end
end

-- Pinning the game's frames ------------------------------------------------------------------

-- Every frame ForeverUI pins (weak keys, so a frame that goes away doesn't stay).
local pinned = setmetatable({}, { __mode = "k" })

-- Runs a frame's pin, flagged so its own SetPoint calls aren't seen as the
-- game's. A pin that fails is reported (ns.Try) and the flag is cleared all the same.
local function applyPin(frame)
  frame.fuiPinning = true
  ns.Try("pin " .. (frame:GetName() or "frame"), frame.fuiPin, frame)
  frame.fuiPinning = false
end

-- Queues a frame's pin for after combat, one entry per frame however often the
-- game moves it; nothing happens while pins are paused (Edit Mode open).
local function runPin(frame)
  if ns.pinsPaused then return end
  ns.OutOfCombat(frame.fuiRun, frame)
end

-- Keeps one of the game's frames where ForeverUI put it: apply(frame) runs now
-- (after combat if in it) and again whenever the game moves the frame back
-- (Edit Mode re-anchors some of its frames when it lays out).
function ns.Pin(frame, apply)
  frame.fuiPin = apply
  frame.fuiRun = frame.fuiRun or function() applyPin(frame) end
  pinned[frame] = true
  runPin(frame)
  if frame.fuiPinned or type(hooksecurefunc) ~= "function" then return end
  frame.fuiPinned = true
  hooksecurefunc(frame, "SetPoint", function(self) if not self.fuiPinning then runPin(self) end end)
end

-- Pauses every pin (so the game's Edit Mode can move its frames freely), or
-- ends the pause and puts every pinned frame back in its ForeverUI spot.
function ns.PausePins(paused)
  ns.pinsPaused = paused == true
  if ns.pinsPaused then return end
  for frame in pairs(pinned) do runPin(frame) end
end

-- Edit Mode ---------------------------------------------------------------------------

-- ForeverUI's frames move with their own handles, so Edit Mode shows those too.
ns.EDIT_NOTE = "The labeled handles are ForeverUI's frames: drag them here too (right-click one for more)."

-- The note under Edit Mode's window, made on first use (it shows and hides with that window).
local function editNote(edit)
  if ns.editNote then return ns.editNote end
  local note = T.Panel(CreateFrame("Frame", "ForeverUI_EditModeNote", edit), { accent = true })
  note:SetSize(320, 36)
  note:SetPoint("TOP", edit, "BOTTOM", 0, -6)
  note.text = T.Text(note:CreateFontString(nil, "OVERLAY"), "small")
  note.text:SetPoint("TOPLEFT", 8, -6) note.text:SetPoint("BOTTOMRIGHT", -8, 6)
  note.text:SetText(ns.EDIT_NOTE)
  ns.editNote = note
  return note
end

-- Edit Mode opened: ForeverUI's handles show too (without the grid: the game
-- draws its own), with the note, unless that's switched off. It closed: they
-- hide, unless /fui unlock had them up already.
function ns.EditModeMovers(edit, open)
  if open and not unlocked and ns.MoverOptions().editMode then ns.editUnlocked = ns.Unlock(true) end
  if not open and ns.editUnlocked then
    ns.editUnlocked = false
    ns.Lock()
  end
  editNote(edit):SetShown(open and unlocked)
end

-- While the game's Edit Mode window is open, pins pause and ForeverUI's handles
-- show; when it closes, everything goes back to its ForeverUI spot.
local function watchEditMode()
  local edit = _G.EditModeManagerFrame
  if type(edit) ~= "table" or not edit.HookScript then return end
  edit:HookScript("OnShow", function() ns.PausePins(true) ns.EditModeMovers(edit, true) end)
  edit:HookScript("OnHide", function() ns.PausePins(false) ns.EditModeMovers(edit, false) end)
end
ns.On("PLAYER_LOGIN", watchEditMode)

-- The frame a mover places (for layout checks), or nil.
function ns.MoverFrame(key)
  return movers[key] and movers[key].frame
end

-- Places a mover at a point on UIParent with offsets, and saves it.
function ns.SetMoverPoint(key, point, relPoint, x, y)
  savePosition(movers[key], point, relPoint or point, x, y)
end

-- A frame's rect as { left, bottom, w, h } in its own scale, or nil if the
-- client can't say (not laid out yet).
local function rectOf(f)
  local left, bottom = f:GetLeft(), f:GetBottom()
  if not left or not bottom then
    return nil
  end
  return { left = left, bottom = bottom, w = f:GetWidth() or 0, h = f:GetHeight() or 0 }
end

-- Rects of every other showing handle, for snapping.
local function otherRects(m)
  local out = {}
  for _, other in pairs(movers) do
    local r = other ~= m and other.handle and other.handle:IsShown() and rectOf(other.handle)
    if r then out[#out + 1] = r end
  end
  return out
end

-- The screen size in a handle's scale.
local function screenSize(h)
  local s = h:GetScale() or 1
  return (UIParent:GetWidth() or 0) / s, (UIParent:GetHeight() or 0) / s
end

-- Where a dropped handle goes: snapped (if on), anchored to the nearest edge.
local function dropPosition(h, r)
  local sw, sh = screenSize(h)
  local left, bottom = r.left, r.bottom
  if ns.MoverOptions().snap then
    left, bottom = L.Snap(left, bottom, r.w, r.h, otherRects(h.mover), sw, sh)
  end
  local point, x, y = L.Anchor(left, bottom, r.w, r.h, sw, sh)
  return point, point, x, y
end

-- Drag stop: saves where the handle was dropped. Without geometry (frame not
-- laid out) it keeps the point the client reports.
local function onDragStop(h)
  h:StopMovingOrSizing()
  local r = rectOf(h)
  if r then
    return savePosition(h.mover, dropPosition(h, r))
  end
  local point, _, relPoint, x, y = h:GetPoint(1)
  if point then savePosition(h.mover, point, relPoint, x, y) end
end

-- Nudges a mover by dx, dy pixels from where it is saved.
function ns.Nudge(key, dx, dy)
  local m = movers[key]
  local point, relPoint, x, y = pointFor(m)
  savePosition(m, point, relPoint, x + dx, y + dy)
end

-- Selection and keys ------------------------------------------------------------------

-- Shows the selected handle's point and offsets on it; others show their label.
function ns.ShowCoords(m)
  if not m.handle then
    return
  end
  local point, _, x, y = pointFor(m)
  m.handle.label:SetText(m == selected and string.format("%s\n%s %d, %d", m.label, point, x, y) or m.label)
end

-- Selects a handle for arrow-key nudging (and deselects the previous one).
local function selectMover(m)
  local previous = selected
  selected = m
  if previous then ns.ShowCoords(previous) end
  if m then ns.ShowCoords(m) end
end

-- Arrow keys nudge the selected handle (Shift: 10 px); other keys pass through.
local function onKeyDown(h, key)
  local dir = NUDGE[key]
  if ns.Client.Has("keyPropagate") then h:SetPropagateKeyboardInput(not (dir and selected == h.mover)) end
  if dir and selected == h.mover then
    local step = IsShiftKeyDown and IsShiftKeyDown() and 10 or 1
    ns.Nudge(h.mover.key, dir[1] * step, dir[2] * step)
  end
end

-- Handles ------------------------------------------------------------------------

-- A click on a handle selects it; a right-click also opens its popover.
local function onMouseDown(h, button)
  selectMover(h.mover)
  if button == "RightButton" and ns.MoverPopover then ns.MoverPopover(h.mover) end
end

-- Wires a handle for dragging, selecting and nudging.
local function wire(h)
  h:SetMovable(true)
  h:SetClampedToScreen(true)
  h:EnableMouse(true)
  h:RegisterForDrag("LeftButton")
  h:SetScript("OnDragStart", h.StartMoving)
  h:SetScript("OnDragStop", onDragStop)
  h:SetScript("OnMouseDown", onMouseDown)
  h:EnableKeyboard(true)
  h:SetScript("OnKeyDown", onKeyDown)
end

-- Builds the handle for a mover: accent-bordered panel with its label.
local function createHandle(m)
  local h = T.Panel(CreateFrame("Frame", nil, UIParent), { accent = true })
  h.mover = m
  h:SetFrameStrata("DIALOG")
  wire(h)
  h.label = h:CreateFontString(nil, "OVERLAY")
  h.label:SetPoint("CENTER")
  T.Text(h.label, "small")
  h.label:SetText(m.label)
  return h
end

-- The handle for a mover, created on first use; sized and placed over its frame.
local function handleFor(m)
  m.handle = m.handle or createHandle(m)
  local f = m.frame
  m.handle:SetScale(f:GetScale() or 1)
  m.handle:SetSize(math.max(f:GetWidth() or 0, 40), math.max(f:GetHeight() or 0, 20))
  anchor(m.handle, m)
  return m.handle
end

-- Lock / unlock -----------------------------------------------------------------------

-- Shows every handle and the grid (not with noGrid). Refused in combat.
function ns.Unlock(noGrid)
  if ns.InCombat() then
    return false
  end
  unlocked = true
  for _, key in ipairs(order) do
    handleFor(movers[key]):Show()
  end
  local options = ns.MoverOptions()
  if options.grid and not noGrid then ns.ShowGrid(options.gridSize) end
  return true
end

-- Hides every handle and the grid.
function ns.Lock()
  unlocked = false
  selectMover(nil)
  if ns.CloseMoverPopover then ns.CloseMoverPopover() end
  for _, m in pairs(movers) do
    if m.handle then m.handle:Hide() end
  end
  ns.HideGrid()
end

-- True while the handles are showing.
function ns.Unlocked()
  return unlocked
end

-- Forgets a saved position (or all with "all") and puts frames back. Returns how many.
function ns.ResetMovers(key)
  local n = 0
  for _, k in ipairs(order) do
    if key == "all" or key == k then
      saved()[k] = nil
      place(movers[k])
      n = n + 1
    end
  end
  return n
end

-- Mover keys and labels, in registration order.
function ns.MoverList()
  local out = {}
  for i, key in ipairs(order) do
    out[i] = { key = key, label = movers[key].label }
  end
  return out
end

-- Entering combat locks: dragging can't move protected frames mid-fight.
ns.On("PLAYER_REGEN_DISABLED", function()
  if unlocked then
    ns.Lock()
    ns.Chat("Locked for combat. /fui unlock again afterwards.")
  end
end)
