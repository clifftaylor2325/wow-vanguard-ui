-- Unlock mode's popover: right-click a frame's handle to set the screen
-- point it's anchored to and its exact offsets, or put it back where it
-- started. Changes save at once, like dragging does.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

-- Anchor points, as { value, label }, in reading order.
local POINTS = {
  { "TOPLEFT", "Top left" }, { "TOP", "Top" }, { "TOPRIGHT", "Top right" },
  { "LEFT", "Left" }, { "CENTER", "Center" }, { "RIGHT", "Right" },
  { "BOTTOMLEFT", "Bottom left" }, { "BOTTOM", "Bottom" }, { "BOTTOMRIGHT", "Bottom right" },
}

local popover

-- Fills the popover from the mover's saved point and offsets.
local function refresh()
  local point, _, x, y = ns.MoverPoint(popover.key)
  popover.anchor:Refresh()
  popover.x:SetText(tostring(math.floor(x + 0.5)))
  popover.y:SetText(tostring(math.floor(y + 0.5)))
  popover.title:SetText(popover.label .. "  ·  " .. point)
end

-- Saves an offset typed into the X or Y box (Enter); a bad number is ignored.
local function applyOffset(box)
  local v = tonumber(box:GetText() or "")
  local point, relPoint, x, y = ns.MoverPoint(popover.key)
  if v then ns.SetMoverPoint(popover.key, point, relPoint, box == popover.x and v or x, box == popover.y and v or y) end
  box:ClearFocus()
  refresh()
end

-- Anchors the frame to another screen point, with no offset from it.
local function applyPoint(point)
  ns.SetMoverPoint(popover.key, point, point, 0, 0)
  refresh()
end

-- A caption on the left of a popover row at y.
local function caption(text, y)
  local fs = T.Text(popover:CreateFontString(nil, "OVERLAY"), "label", "text2")
  fs:SetPoint("TOPLEFT", 12, -y)
  fs:SetText(text)
  return fs
end

-- A number box on the right of a row at y; Enter saves it.
local function offsetBox(y)
  local box = W.Input(popover, 80)
  box:SetPoint("TOPRIGHT", -12, -y + 4)
  box:SetScript("OnEnterPressed", applyOffset)
  return box
end

-- The rows: anchor point, X and Y offsets.
local function addRows()
  caption("Anchor", 42)
  popover.anchor = W.Dropdown(popover, POINTS, function() return (ns.MoverPoint(popover.key)) end, applyPoint, 130)
  popover.anchor:SetPoint("TOPRIGHT", -12, -38)
  caption("X offset", 74)
  popover.x = offsetBox(74)
  caption("Y offset", 104)
  popover.y = offsetBox(104)
end

-- Reset (to the frame's default place) and Done.
local function addButtons()
  popover.done = W.Primary(popover, "Done", function() ns.CloseMoverPopover() end, 80)
  popover.done:SetPoint("BOTTOMRIGHT", -12, 12)
  popover.reset = W.Button(popover, "Reset", function() ns.ResetMovers(popover.key) refresh() end, 80)
  popover.reset:SetPoint("RIGHT", popover.done, "LEFT", -8, 0)
end

-- The popover, built once: a raised panel over everything, kept on screen.
local function build()
  popover = T.Panel(CreateFrame("Frame", "ForeverUI_MoverPopover", UIParent), { raised = true, shadow = true })
  popover:SetSize(250, 176)
  popover:SetFrameStrata("FULLSCREEN_DIALOG")
  popover:SetClampedToScreen(true)
  popover:EnableMouse(true)
  popover.title = T.Text(popover:CreateFontString(nil, "OVERLAY"), "heading")
  popover.title:SetPoint("TOPLEFT", 12, -12)
  addRows()
  addButtons()
end

-- Opens the popover for a mover, beside its handle.
function ns.MoverPopover(m)
  if not popover then build() end
  popover.key, popover.label = m.key, m.label
  popover:ClearAllPoints()
  popover:SetPoint("TOPLEFT", m.handle or UIParent, "TOPRIGHT", 8, 0)
  refresh()
  T.FadeIn(popover)
end

-- Closes the popover (and any open dropdown).
function ns.CloseMoverPopover()
  W.CloseMenu()
  if popover and popover:IsShown() then T.FadeOut(popover) end
end

-- Keeps the numbers current while the frame is dragged or nudged.
function ns.OnMoverMoved(key)
  if popover and popover:IsShown() and popover.key == key then refresh() end
end
