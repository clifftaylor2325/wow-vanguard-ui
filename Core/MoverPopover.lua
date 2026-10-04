-- Unlock mode's popover: right-click a frame's handle to set the screen
-- point it's anchored to, its exact offsets, its scale and its opacity, or
-- put it back as it started. Changes save at once, like dragging does.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

-- Anchor points, as { value, label }, in reading order.
local POINTS = {
  { "TOPLEFT", "Top left" }, { "TOP", "Top" }, { "TOPRIGHT", "Top right" },
  { "LEFT", "Left" }, { "CENTER", "Center" }, { "RIGHT", "Right" },
  { "BOTTOMLEFT", "Bottom left" }, { "BOTTOM", "Bottom" }, { "BOTTOMRIGHT", "Bottom right" },
}

local popover

-- A number rounded to a whole one, as text.
local function whole(v)
  return tostring(math.floor(v + 0.5))
end

-- Fills the popover from the mover's saved point, offsets, scale and opacity (as percents).
local function refresh()
  local point, _, x, y = ns.MoverPoint(popover.key)
  local scale, alpha = ns.MoverLook(popover.key)
  popover.anchor:Refresh()
  popover.x:SetText(whole(x))
  popover.y:SetText(whole(y))
  popover.scale:SetText(whole(scale * 100))
  popover.alpha:SetText(whole(alpha * 100))
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

-- Saves a percent typed into the Scale or Opacity box (Enter): the box's setter
-- clamps it to the allowed range; a bad number is ignored.
local function applyPercent(box)
  local v = tonumber(box:GetText() or "")
  if v then box.apply(popover.key, v / 100) end
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

-- A number box on the right of a row at y; Enter saves it (with onEnter).
local function numberBox(y, onEnter)
  local box = W.Input(popover, 80)
  box:SetPoint("TOPRIGHT", -12, -y + 4)
  box:SetScript("OnEnterPressed", onEnter)
  return box
end

-- A percent box (scale or opacity) on a row at y; apply(key, value) saves it.
local function percentBox(text, y, apply)
  caption(text, y)
  local box = numberBox(y, applyPercent)
  box.apply = apply
  return box
end

-- The rows: anchor point, X and Y offsets, scale and opacity.
local function addRows()
  caption("Anchor", 42)
  popover.anchor = W.Dropdown(popover, POINTS, function() return (ns.MoverPoint(popover.key)) end, applyPoint, 130)
  popover.anchor:SetPoint("TOPRIGHT", -12, -38)
  caption("X offset", 74)
  popover.x = numberBox(74, applyOffset)
  caption("Y offset", 104)
  popover.y = numberBox(104, applyOffset)
  popover.scale = percentBox("Scale %", 134, ns.SetMoverScale)
  popover.alpha = percentBox("Opacity %", 164, ns.SetMoverAlpha)
end

-- Reset (to the frame's default place, scale and opacity) and Done.
local function addButtons()
  popover.done = W.Primary(popover, "Done", function() ns.CloseMoverPopover() end, 80)
  popover.done:SetPoint("BOTTOMRIGHT", -12, 12)
  popover.reset = W.Button(popover, "Reset", function() ns.ResetMovers(popover.key) refresh() end, 80)
  popover.reset:SetPoint("RIGHT", popover.done, "LEFT", -8, 0)
end

-- The popover, built once: a raised panel over everything, kept on screen.
local function build()
  popover = T.Panel(CreateFrame("Frame", "ForeverUI_MoverPopover", UIParent), { raised = true, shadow = true })
  popover:SetSize(250, 236)
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
