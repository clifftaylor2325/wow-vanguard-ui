-- Unlock mode's popover: right-click a frame's handle to anchor it to the
-- screen or to another frame's side, set its exact offsets, its scale and
-- its opacity, match its width or height to another frame's, or put it back
-- as it started. Changes save at once, like dragging does; a link that
-- can't be is refused, and the popover says why.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

-- Anchor points, as { value, label }, in reading order.
local POINTS = {
  { "TOPLEFT", "Top left" }, { "TOP", "Top" }, { "TOPRIGHT", "Top right" },
  { "LEFT", "Left" }, { "CENTER", "Center" }, { "RIGHT", "Right" },
  { "BOTTOMLEFT", "Bottom left" }, { "BOTTOM", "Bottom" }, { "BOTTOMRIGHT", "Bottom right" },
}
-- The sides of another frame a frame can be anchored to.
local SIDES = { { "LEFT", "Left" }, { "RIGHT", "Right" }, { "TOP", "Top" }, { "BOTTOM", "Bottom" } }

local popover

-- A number rounded to a whole one, as text.
local function whole(v)
  return tostring(math.floor(v + 0.5))
end

-- Says why the last change was refused, or clears it (nil).
local function note(why)
  popover.why:SetText(why or "")
end

-- Fills the anchor rows: the point dropdown for a frame anchored to the screen, the side one for a frame anchored to another.
local function refreshAnchor(to)
  popover.anchor:SetShown(not to)
  popover.side:SetShown(to ~= nil)
  popover.pointCaption:SetText(to and "Side" or "Anchor")
  for _, d in ipairs(popover.dropdowns) do d:Refresh() end
end

-- Fills the popover from the mover's saved point (or link) and offsets, scale and opacity (as percents).
local function refresh()
  local to, rx, ry = ns.MoverAnchor(popover.key), select(3, ns.MoverAnchor(popover.key))
  local point, _, x, y = ns.MoverPoint(popover.key)
  local scale, alpha = ns.MoverLook(popover.key)
  refreshAnchor(to)
  popover.x:SetText(whole(to and rx or x))
  popover.y:SetText(whole(to and ry or y))
  popover.scale:SetText(whole(scale * 100))
  popover.alpha:SetText(whole(alpha * 100))
  popover.title:SetText(popover.label .. "  ·  " .. (ns.MoverLinks.Where(popover.key) or point))
end

-- Runs a setter's answer: refused, the popover says why; either way it shows what holds now.
local function answer(ok, why)
  note(not ok and why or nil)
  refresh()
end

-- Saves an offset typed into the X or Y box (Enter): from the side of the frame it's anchored
-- to, or from its screen point; a bad number is ignored.
local function applyOffset(box)
  local v, key = tonumber(box:GetText() or ""), popover.key
  local to, side, rx, ry = ns.MoverAnchor(key)
  local point, relPoint, x, y = ns.MoverPoint(key)
  local nx, ny = box == popover.x and v or (to and rx or x), box == popover.y and v or (to and ry or y)
  if v and to then ns.SetMoverAnchor(key, to, side, nx, ny) elseif v then ns.SetMoverPoint(key, point, relPoint, nx, ny) end
  box:ClearFocus()
  answer(true)
end

-- Saves a percent typed into the Scale or Opacity box (Enter): the box's setter
-- clamps it to the allowed range; a bad number is ignored.
local function applyPercent(box)
  local v = tonumber(box:GetText() or "")
  if v then box.apply(popover.key, v / 100) end
  box:ClearFocus()
  answer(true)
end

-- Anchors the frame to another screen point, with no offset from it.
local function applyPoint(point)
  ns.SetMoverPoint(popover.key, point, point, 0, 0)
  answer(true)
end

-- Anchors the frame to another frame ("" for the screen), staying where it is.
local function applyTarget(to)
  answer(ns.SetMoverAnchor(popover.key, to))
end

-- Anchors the frame flush against another side of the frame it's anchored to.
local function applySide(side)
  answer(ns.SetMoverAnchor(popover.key, (ns.MoverAnchor(popover.key)), side, 0, 0))
end

-- Choices of every other frame, after `first` ({ "", "Screen" } or { "", "None" }).
local function others(first)
  return function()
    local out = { first }
    for _, m in ipairs(ns.MoverList()) do
      if m.key ~= popover.key then out[#out + 1] = { m.key, m.label } end
    end
    return out
  end
end

-- A caption on the left of a popover row at y.
local function caption(text, y)
  local fs = T.Text(popover:CreateFontString(nil, "OVERLAY"), "label", "text2")
  fs:SetPoint("TOPLEFT", 12, -y)
  fs:SetText(text)
  return fs
end

-- A dropdown on the right of a row at y.
local function dropdown(choices, get, set, y)
  local d = W.Dropdown(popover, choices, get, set, 150)
  d:SetPoint("TOPRIGHT", -12, -y + 4)
  popover.dropdowns[#popover.dropdowns + 1] = d
  return d
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

-- The rows that place the frame: what it's anchored to, the point or side, and X and Y offsets.
local function addPlaceRows()
  caption("Anchor to", 42)
  popover.target = dropdown(others({ "", "Screen" }), function() return ns.MoverAnchor(popover.key) or "" end, applyTarget, 42)
  popover.pointCaption = caption("Anchor", 74)
  popover.anchor = dropdown(POINTS, function() return (ns.MoverPoint(popover.key)) end, applyPoint, 74)
  popover.side = dropdown(SIDES, function() return select(2, ns.MoverAnchor(popover.key)) end, applySide, 74)
  caption("X offset", 106)
  popover.x = numberBox(106, applyOffset)
  caption("Y offset", 136)
  popover.y = numberBox(136, applyOffset)
end

-- A Match width or Match height row at y: None, or another frame whose size it takes.
local function matchRow(dim, text, y)
  caption(text, y)
  return dropdown(others({ "", "None" }), function() return ns.MoverMatch(popover.key, dim) or "" end,
    function(source) answer(ns.SetMoverMatch(popover.key, dim, source)) end, y)
end

-- The rows: placing, scale and opacity, matching sizes, and the line that says why a change was refused.
local function addRows()
  popover.dropdowns = {}
  addPlaceRows()
  popover.scale = percentBox("Scale %", 166, ns.SetMoverScale)
  popover.alpha = percentBox("Opacity %", 196, ns.SetMoverAlpha)
  popover.matchWidth = matchRow("width", "Match width", 228)
  popover.matchHeight = matchRow("height", "Match height", 260)
  popover.why = T.Text(popover:CreateFontString(nil, "OVERLAY"), "small", "warn")
  popover.why:SetPoint("TOPLEFT", 12, -290)
  popover.why:SetWidth(256)
end

-- Reset (to the frame's default place, scale, opacity and size, unlinked) and Done.
local function addButtons()
  popover.done = W.Primary(popover, "Done", function() ns.CloseMoverPopover() end, 80)
  popover.done:SetPoint("BOTTOMRIGHT", -12, 12)
  popover.reset = W.Button(popover, "Reset", function() ns.ResetMovers(popover.key) answer(true) end, 80)
  popover.reset:SetPoint("RIGHT", popover.done, "LEFT", -8, 0)
end

-- The popover, built once: a raised panel over everything, kept on screen.
local function build()
  popover = T.Panel(CreateFrame("Frame", "Vanguard_MoverPopover", UIParent), { raised = true, shadow = true })
  popover:SetSize(280, 364)
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
  answer(true)
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
