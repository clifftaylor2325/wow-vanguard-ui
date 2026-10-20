-- Movers: every Vanguard frame that can be placed registers here. /vg
-- unlock shows a labeled handle over each, plus a grid. Drag a handle and
-- it snaps to nearby frame edges and the screen center; click one and the
-- arrow keys nudge it (Shift: 10 px). Positions are saved per profile
-- against the nearest screen edge, so they hold across resolutions, with
-- each frame's own scale and opacity (right-click a handle to set them).
-- A frame can also be anchored to another frame's side, or match its width
-- or height (Core/MoverLinks.lua); unlock mode's bar can exit without
-- saving (Core/UnlockBar.lua).

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgFading = ns.FrameState("vgFading")

local T = ns.Theme
local L = ns.Layout

local DEFAULTS = { grid = true, gridSize = 32, snap = true, editMode = true }
local NUDGE = { UP = { 0, 1 }, DOWN = { 0, -1 }, LEFT = { -1, 0 }, RIGHT = { 1, 0 } }

local movers, order = {}, {}
local unlocked = false
local selected
-- Text after every handle's label (Situations: " · recording Raid"), or "".
local suffix = ""

-- Unlock-mode options (grid, gridSize, snap, editMode) in the active profile.
function ns.MoverOptions()
  return ns.Settings("movers", DEFAULTS)
end

-- Saved positions in the active profile: key -> { point, relPoint, x, y, scale, alpha }
-- (offsets in UIParent's units; scale and opacity left out while they are 1), plus a
-- frame's links: rel, match, and its own w and h (Core/MoverLinks.lua).
local function saved()
  return ns.Settings("positions")
end

-- A mover's saved entry, made empty when there is none, so a move keeps the
-- scale and opacity and a size change keeps the point.
local function entry(key)
  local p = saved()[key]
  if type(p) ~= "table" then
    p = {}
    saved()[key] = p
  end
  return p
end

-- The scale and opacity a mover's frame may have (the popover and the options keep to them).
ns.MOVER_SCALE = { min = 0.5, max = 2 }
ns.MOVER_ALPHA = { min = 0.1, max = 1 }

-- A saved scale or opacity kept to its range; 1 when it isn't a number (a hand-edited profile string).
local function within(v, range)
  v = tonumber(v)
  return v and math.max(range.min, math.min(range.max, v)) or 1
end

-- A mover's saved scale and opacity: 1 and 1 unless set.
function ns.MoverLook(key)
  local p = saved()[key]
  if type(p) ~= "table" then return 1, 1 end
  return within(p.scale, ns.MOVER_SCALE), within(p.alpha, ns.MOVER_ALPHA)
end

-- The nine anchor points a saved position may name.
local POINTS = { TOPLEFT = true, TOP = true, TOPRIGHT = true, LEFT = true, CENTER = true, RIGHT = true, BOTTOMLEFT = true, BOTTOM = true, BOTTOMRIGHT = true }

-- The farthest a saved offset may put a frame from its anchor (UIParent units).
ns.MAX_OFFSET = 5000

-- An offset kept to a sane range: not a number (or NaN) reads as 0, anything else within +-ns.MAX_OFFSET.
---@param v any
---@return number
function ns.SaneOffset(v)
  v = tonumber(v)
  if not v or v ~= v then return 0 end
  return math.max(-ns.MAX_OFFSET, math.min(ns.MAX_OFFSET, v))
end

-- The point to use for a mover: where its link puts it (anchored to a frame
-- that is there), saved (when it names a real point; offsets that aren't
-- numbers read as 0, and none is more than ns.MAX_OFFSET away), else its default.
local function pointFor(m)
  local p = saved()[m.key]
  if type(p) == "table" and p.rel ~= nil then
    local point, relPoint, x, y = ns.MoverLinks.Point(m.key, p)
    if point then return point, relPoint, ns.SaneOffset(x), ns.SaneOffset(y) end
  end
  if type(p) == "table" and POINTS[p.point] then
    return p.point, POINTS[p.relPoint] and p.relPoint or p.point, ns.SaneOffset(p.x), ns.SaneOffset(p.y)
  end
  return m.default[1], m.default[2], m.default[3], m.default[4]
end

-- Anchors a frame (or a mover handle) at the mover's point on UIParent. The offsets
-- are saved in UIParent's units and a frame's own are its scale's, so they are
-- divided by it: a scaled frame keeps its anchor point where it is and grows around it.
local function anchor(frame, m)
  local point, relPoint, x, y = pointFor(m)
  local s = frame:GetScale() or 1
  frame:ClearAllPoints()
  frame:SetPoint(point, UIParent, relPoint, x / s, y / s)
end

-- Draws a mover's frame at its opacity times the alpha its module last gave it.
local function fade(m)
  local f = m.frame
  vgFading[f] = true
  f:SetAlpha(m.ownAlpha * select(2, ns.MoverLook(m.key)))
  vgFading[f] = false
end

-- From the first opacity other than 1 on, an alpha the frame's module sets (a
-- bar fading out on mouseover, say) is kept and multiplied by the opacity, so
-- the module's fades still work. A hidden (secret) alpha is left as it is.
local function watchAlpha(m)
  m.ownAlpha = m.frame:GetAlpha() or 1
  if type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(m.frame, "SetAlpha", ns.Guard("hook SetAlpha", function(f, a)
    if vgFading[f] or ns.PlainNumber(a) == nil then return end
    m.ownAlpha = a
    fade(m)
  end))
end

-- Sets a mover's frame to its saved scale and opacity; pixel-sized frames round again for the new scale.
local function applyLook(m)
  local scale, alpha = ns.MoverLook(m.key)
  m.frame:SetScale(scale)
  T.Rescale()
  if alpha == 1 and not m.ownAlpha then return end
  if not m.ownAlpha then watchAlpha(m) end
  fade(m)
end

-- Puts a mover's frame at its point, scale, size (one Vanguard may size) and opacity;
-- protected frames wait for combat to end.
local function place(m)
  ns.OutOfCombat(function()
    applyLook(m)
    ns.MoverLinks.Size(m)
    anchor(m.frame, m)
  end)
end

-- Registers a placeable frame. default = { point, relPoint, x, y } on UIParent.
function ns.Mover(frame, key, label, default)
  local m = { frame = frame, key = key, label = label or key, default = default }
  if not movers[key] then
    order[#order + 1] = key
  end
  movers[key] = m
  place(m)
  ns.MoverLinks.Registered(key)
  return m
end

-- Changes a mover's default point (a stacked bar whose neighbors changed
-- size) and moves its frame, and its handle in unlock mode, there, unless a
-- saved position wins; frames linked to it follow.
function ns.SetMoverDefault(key, default)
  local m = movers[key]
  if not m then return end
  m.default = default
  place(m)
  if m.handle then anchor(m.handle, m) end
  ns.MoverLinks.Changed(key)
end

-- Functions told with a mover's key when it was placed again (a drag, a nudge, a reset): a module
-- that pins something to its side of the screen follows with it.
local placedListeners = {}

-- Registers fn(key) to run after a mover was placed again.
---@param fn fun(key: string)
function ns.OnMoverPlaced(fn)
  placedListeners[#placedListeners + 1] = fn
end

-- Tells everything that follows a mover (the frames linked to it, the popover, the OnMoverPlaced listeners) that it changed.
function ns.MoverChanged(key)
  ns.MoverLinks.Changed(key)
  if ns.OnMoverMoved then ns.OnMoverMoved(key) end
  for _, fn in ipairs(placedListeners) do fn(key) end
end

-- Saving ------------------------------------------------------------------------------

-- Saves a position for a mover (keeping its scale and opacity; an anchored one keeps its
-- link, with new offsets), moves its frame, and keeps its handle on it.
local function savePosition(m, point, relPoint, x, y)
  local p = entry(m.key)
  p.point, p.relPoint, p.x, p.y = point, relPoint, x, y
  ns.MoverLinks.Saved(m.key, p)
  place(m)
  if m.handle then
    anchor(m.handle, m)
    ns.ShowCoords(m)
  end
  ns.MoverChanged(m.key)
end

-- A mover's point, relative point and offsets (saved, or its default);
-- nothing for an unknown key.
function ns.MoverPoint(key)
  if movers[key] then return pointFor(movers[key]) end
end

-- Pinning the game's frames ------------------------------------------------------------------

-- Pin state lives here, never on the game's frames (a field stored on one of
-- them plants taint). Weak keys, so a frame that goes away doesn't stay.
-- pinned: frame -> its apply function; runs: frame -> its queued run (made once,
-- so the combat queue keeps one entry per frame); hooked: frames whose SetPoint
-- is hooked; pinning: frames whose pin is running now.
local pinned = setmetatable({}, { __mode = "k" })
local runs = setmetatable({}, { __mode = "k" })
local hooked = setmetatable({}, { __mode = "k" })
local pinning = setmetatable({}, { __mode = "k" })

-- Runs a frame's pin, flagged so its own SetPoint calls aren't seen as the
-- game's. A pin that fails is reported (ns.Try) and the flag is cleared all the same.
local function applyPin(frame)
  pinning[frame] = true
  ns.Try("pin " .. (frame:GetName() or "frame"), pinned[frame], frame)
  pinning[frame] = nil
end

-- Queues a frame's pin for after combat, one entry per frame however often the
-- game moves it; nothing happens while pins are paused (Edit Mode open).
local function runPin(frame)
  if ns.pinsPaused then return end
  ns.OutOfCombat(runs[frame], frame)
end

-- Keeps one of the game's frames where Vanguard put it: apply(frame) runs now
-- (after combat if in it) and again whenever the game moves the frame back
-- (Edit Mode re-anchors some of its frames when it lays out).
function ns.Pin(frame, apply)
  pinned[frame] = apply
  runs[frame] = runs[frame] or function() applyPin(frame) end
  runPin(frame)
  if hooked[frame] or type(hooksecurefunc) ~= "function" then return end
  hooked[frame] = true
  hooksecurefunc(frame, "SetPoint", ns.Guard("hook SetPoint", function(self) if not pinning[self] then runPin(self) end end))
end

-- Runs a pinned frame's pin again (the game resized it or laid it out again),
-- through the queue; nothing while its pin is running or for a frame never pinned.
function ns.Repin(frame)
  if pinning[frame] or not pinned[frame] then return end
  runPin(frame)
end

-- Pauses every pin (so the game's Edit Mode can move its frames freely), or
-- ends the pause and puts every pinned frame back in its Vanguard spot.
function ns.PausePins(paused)
  ns.pinsPaused = paused == true
  if ns.pinsPaused then return end
  for frame in pairs(pinned) do runPin(frame) end
end

-- Edit Mode ---------------------------------------------------------------------------

-- Vanguard's frames move with their own handles, so Edit Mode shows those too.
ns.EDIT_NOTE = "The labeled handles are Vanguard's frames: drag them here too (right-click one for more)."

-- The note under Edit Mode's window, made on first use (it shows and hides with that window). Edit Mode's window
-- resizes itself from every child frame, so the note is marked ignoreInLayout: hung below the window, it would
-- otherwise count as part of the window and stretch it each time the game lays it out.
local function editNote(edit)
  if ns.editNote then return ns.editNote end
  local note = T.Panel(CreateFrame("Frame", "Vanguard_EditModeNote", edit), { accent = true })
  note.ignoreInLayout = true
  note:SetSize(320, 36)
  note:SetPoint("TOP", edit, "BOTTOM", 0, -6)
  note.text = T.Text(note:CreateFontString(nil, "OVERLAY"), "small")
  note.text:SetPoint("TOPLEFT", 8, -6) note.text:SetPoint("BOTTOMRIGHT", -8, 6)
  note.text:SetText(ns.EDIT_NOTE)
  ns.editNote = note
  return note
end

-- Edit Mode opened: Vanguard's handles show too (without the grid: the game
-- draws its own), with the note, unless that's switched off. It closed: they
-- hide, unless /vg unlock had them up already.
function ns.EditModeMovers(edit, open)
  if open and not unlocked and ns.MoverOptions().editMode then ns.editUnlocked = ns.Unlock(true) end
  if not open and ns.editUnlocked then
    ns.editUnlocked = false
    ns.Lock()
  end
  editNote(edit):SetShown(open and unlocked)
end

-- The game's frames Vanguard hides or replaces (set): Edit Mode gets no handle for them.
local replaced = {}

-- Hides a replaced frame's Edit Mode handle (runs after the game highlights the frame).
local function hideHandle(frame)
  if type(frame.Selection) == "table" then frame.Selection:Hide() end
end

-- Notes that Vanguard hides or replaces one of the game's frames, so Edit Mode shows no
-- handle or selection for it. Edit Mode highlights a system through its HighlightSystem
-- method (on entering, from its check boxes, and when another system is selected), so the
-- handle is hidden from a post-hook on that method: nothing Edit Mode reads is written, and
-- its own code runs untouched. A frame that isn't an Edit Mode system is left alone.
function ns.EditModeReplaced(frame)
  if type(frame) ~= "table" or replaced[frame] or type(frame.HighlightSystem) ~= "function" then return end
  if type(hooksecurefunc) ~= "function" then return end
  replaced[frame] = true
  hooksecurefunc(frame, "HighlightSystem", ns.Guard("hook HighlightSystem", hideHandle))
  hideHandle(frame)
end

-- While the game's Edit Mode window is open, pins pause and Vanguard's handles
-- show; when it closes, everything goes back to its Vanguard spot.
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

-- A frame's rect as { left, bottom, w, h } in UIParent's units (its own times
-- its scale), or nil if the client can't say (not laid out yet).
local function rectOf(f)
  local left, bottom = f:GetLeft(), f:GetBottom()
  if not left or not bottom then
    return nil
  end
  local s = f:GetScale() or 1
  return { left = left * s, bottom = bottom * s, w = (f:GetWidth() or 0) * s, h = (f:GetHeight() or 0) * s }
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

-- Where a dropped handle goes: snapped (if on), anchored to the nearest edge,
-- all in UIParent's units.
local function dropPosition(h, r)
  local screen = { w = UIParent:GetWidth() or 0, h = UIParent:GetHeight() or 0 }
  local rect = r
  if ns.MoverOptions().snap then rect = L.Snap(r, otherRects(h.mover), screen) end
  local point, x, y = L.Anchor(rect, screen)
  return point, point, x, y
end

-- Drag stop: saves where the handle was dropped. Without geometry (frame not
-- laid out) it keeps the point the client reports (in the handle's scale).
local function onDragStop(h)
  h:StopMovingOrSizing()
  local r = rectOf(h)
  if r then
    return savePosition(h.mover, dropPosition(h, r))
  end
  local point, _, relPoint, x, y = h:GetPoint(1)
  local s = h:GetScale() or 1
  if point then savePosition(h.mover, point, relPoint, x * s, y * s) end
end

-- Nudges a mover by dx, dy pixels from where it is saved.
function ns.Nudge(key, dx, dy)
  local m = movers[key]
  local point, relPoint, x, y = pointFor(m)
  savePosition(m, point, relPoint, x + dx, y + dy)
end

-- Selection and keys ------------------------------------------------------------------

-- Shows the selected handle's point and offsets on it (for an anchored frame, the
-- side it's anchored to and its offsets from it); others show their label.
function ns.ShowCoords(m)
  if not m.handle then
    return
  end
  local point, _, x, y = pointFor(m)
  local where, rx, ry = ns.MoverLinks.Where(m.key)
  local label = m.label .. suffix
  m.handle.label:SetText(m == selected and string.format("%s\n%s %d, %d", label, where or point, rx or x, ry or y) or label)
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

-- The strata from lowest to highest, to rank a mover's frame's own against HIGH.
local STRATA_RANK = { BACKGROUND = 1, LOW = 2, MEDIUM = 3, HIGH = 4, DIALOG = 5, FULLSCREEN = 6, FULLSCREEN_DIALOG = 7, TOOLTIP = 8 }

-- The strata a mover's handle goes on: HIGH, so it sits over the frame it moves and the game's own Edit Mode
-- selections (MEDIUM) but under Edit Mode's window and dialogs (DIALOG), which stay on top while they are
-- open. A frame that itself sits above HIGH (the quest dialog, on DIALOG) would cover a HIGH handle, so its
-- handle rides on its own strata instead.
local function handleStrata(frame)
  local own = frame.GetFrameStrata and frame:GetFrameStrata()
  return (STRATA_RANK[own] or 0) > STRATA_RANK.HIGH and own or "HIGH"
end

-- Builds the handle for a mover: accent-bordered panel with its label, well over
-- its frame's level, so a window's scroll views and their thumbs and fade edges (a dozen levels up) stay under
-- it too.
local function createHandle(m)
  local h = T.Panel(CreateFrame("Frame", nil, UIParent), { accent = true })
  h.mover = m
  h:SetFrameLevel((m.frame:GetFrameLevel() or 0) + 50)
  wire(h)
  h.label = h:CreateFontString(nil, "OVERLAY")
  h.label:SetPoint("CENTER")
  T.Text(h.label, "small")
  h.label:SetText(m.label .. suffix)
  return h
end

-- Sets the text after every handle's label (nil for none), and relabels the handles there are now.
function ns.SetMoverSuffix(text)
  suffix = text or ""
  for _, m in pairs(movers) do ns.ShowCoords(m) end
end

-- The handle for a mover, created on first use; sized and placed over its frame (at least 40 x 14, so a thin bar
-- can still be grabbed without its handle spilling onto the frame above it).
local function handleFor(m)
  m.handle = m.handle or createHandle(m)
  local f = m.frame
  m.handle:SetScale(f:GetScale() or 1)
  m.handle:SetSize(math.max(f:GetWidth() or 0, 40), math.max(f:GetHeight() or 0, 14))
  anchor(m.handle, m)
  return m.handle
end

-- Puts a mover's frame where it belongs now (and its handle, sized to it, in unlock mode).
function ns.PlaceMover(key)
  local m = movers[key]
  if not m then return end
  place(m)
  if m.handle then
    handleFor(m)
    ns.ShowCoords(m)
  end
end

-- Scale and opacity ---------------------------------------------------------------------

-- Saves a mover's scale or opacity (field "scale" or "alpha", to the hundredth,
-- clamped to range; 1 is saved as unset) and applies it, its handle following.
local function setLook(key, field, value, range)
  local m = movers[key]
  if not m or type(value) ~= "number" then return end
  value = math.max(range.min, math.min(range.max, math.floor(value * 100 + 0.5) / 100))
  entry(key)[field] = value ~= 1 and value or nil
  place(m)
  if m.handle then handleFor(m) end
  ns.MoverChanged(key)
end

-- Sets a mover's scale (0.5 to 2); its frame grows or shrinks around its anchor point.
function ns.SetMoverScale(key, scale)
  setLook(key, "scale", scale, ns.MOVER_SCALE)
end

-- Sets a mover's opacity (0.1 to 1).
function ns.SetMoverAlpha(key, alpha)
  setLook(key, "alpha", alpha, ns.MOVER_ALPHA)
end

-- Lock / unlock -----------------------------------------------------------------------

-- Shows a mover's handle on its strata: the one given, else its own (handleStrata).
local function showHandle(m, strata)
  local h = handleFor(m)
  h:SetFrameStrata(strata or handleStrata(m.frame))
  h:Show()
end

-- Shows every handle and the grid (not for the game's Edit Mode, which draws its own),
-- and remembers every spot for Exit without saving (Core/UnlockBar.lua). Refused in combat.
-- In Edit Mode every handle goes on HIGH, so Edit Mode's window (DIALOG) stays over them all.
function ns.Unlock(editMode)
  if ns.InCombat() then return false end
  ns.UnlockStarted(editMode)
  unlocked = true
  local strata = editMode and "HIGH" or nil
  for _, key in ipairs(order) do showHandle(movers[key], strata) end
  local options = ns.MoverOptions()
  if options.grid and not editMode then ns.ShowGrid(options.gridSize) end
  return true
end

-- Hides every handle, the grid and unlock mode's bar, keeping every change.
function ns.Lock()
  unlocked = false
  ns.UnlockEnded()
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

-- Forgets one mover's saved position, scale, opacity and links and puts its frame (and handle) back.
local function resetOne(k)
  saved()[k] = nil
  ns.PlaceMover(k)
  ns.MoverChanged(k)
end

-- Forgets a saved position, scale, opacity and links (or all with "all") and puts frames back. Returns how many.
function ns.ResetMovers(key)
  local n = 0
  for _, k in ipairs(order) do
    if key == "all" or key == k then
      resetOne(k)
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
    ns.Chat("Locked for combat. /vg unlock again afterwards.")
  end
end)
