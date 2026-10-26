-- Unlock mode's popover: right-click a frame's handle to anchor it to the
-- screen or to another frame's side, set its exact offsets, its scale and
-- its opacity, match its width or height to another frame's, or put it back
-- as it started. Changes save at once, like dragging does; a link that
-- can't be is refused, and the popover says why.

local ADDON, ns = ...
local L = ns.L

local T, W = ns.Theme, ns.Widgets

-- Anchor points, as { value, label }, in reading order.
local POINTS = {
  { "TOPLEFT", L["Top left"] }, { "TOP", L["Top"] }, { "TOPRIGHT", L["Top right"] },
  { "LEFT", L["Left"] }, { "CENTER", L["Center"] }, { "RIGHT", L["Right"] },
  { "BOTTOMLEFT", L["Bottom left"] }, { "BOTTOM", L["Bottom"] }, { "BOTTOMRIGHT", L["Bottom right"] },
}
-- The sides of another frame a frame can be anchored to.
local SIDES = { { "LEFT", L["Left"] }, { "RIGHT", L["Right"] }, { "TOP", L["Top"] }, { "BOTTOM", L["Bottom"] } }

local popover

-- The popover's size, and the width of its right column: the dropdowns and the number boxes alike, so the column
-- has one edge. The captions get what is left of WIDTH, enough for the longest German and Russian ones at 130% text.
local WIDTH, HEIGHT, FIELD_W = 320, 372, 150
-- Where the first row's middle is (down from the top, past the title line), and how far apart the rows are:
-- a row (T.ROW.height) and a gap between.
local ROWS_TOP, ROW_STEP = 56, T.ROW.height + T.SPACE.tight

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
  popover.pointCaption:SetText(to and L["Side"] or L["Anchor"])
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

-- Saves the offset typed into a box: from the side of the frame it's anchored to, or from its screen
-- point, the other axis as it is. Returns the setter's answer (ok, why); a bad number saves nothing.
local function saveOffset(box)
  local v, key = tonumber(box:GetText() or ""), popover.key
  if not v then return nil end
  local to, side, rx, ry = ns.MoverAnchor(key)
  local point, relPoint, x, y = ns.MoverPoint(key)
  local nx, ny = x, y
  if to then nx, ny = rx, ry end
  if box == popover.x then nx = v elseif box == popover.y then ny = v end
  if to then return ns.SetMoverAnchor(key, to, side, nx, ny) end
  return ns.SetMoverPoint(key, point, relPoint, nx, ny)
end

-- Saves an offset typed into the X or Y box (Enter), and says why a link was refused.
local function applyOffset(box)
  local ok, why = saveOffset(box)
  box:ClearFocus()
  answer(ok, why)
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

-- The middle of the popover's i-th row, down from its top.
local function rowY(i)
  return ROWS_TOP + (i - 1) * ROW_STEP
end

-- A caption on the left of a popover row (its middle y down from the top).
local function caption(text, y)
  local fs = T.Text(popover:CreateFontString(nil, "OVERLAY"), "label", "text2")
  fs:SetPoint("LEFT", popover, "TOPLEFT", T.SPACE.col, -y)
  fs:SetText(text)
  return fs
end

-- A dropdown on the right of a row, FIELD_W wide.
local function dropdown(choices, get, set, y)
  local d = W.Dropdown(popover, choices, get, set, FIELD_W)
  d:SetPoint("RIGHT", popover, "TOPRIGHT", -T.SPACE.col, -y)
  popover.dropdowns[#popover.dropdowns + 1] = d
  return d
end

-- A number box on the right of a row, as wide as a dropdown; Enter saves it (with onEnter).
local function numberBox(y, onEnter)
  local box = W.Input(popover, FIELD_W)
  box:SetPoint("RIGHT", popover, "TOPRIGHT", -T.SPACE.col, -y)
  box:SetScript("OnEnterPressed", ns.Guard("apply a typed number", onEnter))
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
  caption(L["Anchor to"], rowY(1))
  popover.target = dropdown(others({ "", L["Screen"] }), function() return ns.MoverAnchor(popover.key) or "" end, applyTarget, rowY(1))
  popover.pointCaption = caption(L["Anchor"], rowY(2))
  popover.anchor = dropdown(POINTS, function() return (ns.MoverPoint(popover.key)) end, applyPoint, rowY(2))
  popover.side = dropdown(SIDES, function() return select(2, ns.MoverAnchor(popover.key)) end, applySide, rowY(2))
  caption(L["X offset"], rowY(3))
  popover.x = numberBox(rowY(3), applyOffset)
  caption(L["Y offset"], rowY(4))
  popover.y = numberBox(rowY(4), applyOffset)
end

-- A Match width or Match height row at y: None, or another frame whose size it takes.
local function matchRow(dim, text, y)
  caption(text, y)
  return dropdown(others({ "", L["None"] }), function() return ns.MoverMatch(popover.key, dim) or "" end,
    function(source) answer(ns.SetMoverMatch(popover.key, dim, source)) end, y)
end

-- The rows: placing, scale and opacity, matching sizes, and the line that says why a change was refused.
local function addRows()
  popover.dropdowns = {}
  addPlaceRows()
  popover.scale = percentBox(L["Scale %"], rowY(5), ns.SetMoverScale)
  popover.alpha = percentBox(L["Opacity %"], rowY(6), ns.SetMoverAlpha)
  popover.matchWidth = matchRow("width", L["Match width"], rowY(7))
  popover.matchHeight = matchRow("height", L["Match height"], rowY(8))
  popover.why = T.Text(popover:CreateFontString(nil, "OVERLAY"), "small", "warn")
  popover.why:SetPoint("TOPLEFT", T.SPACE.col, -(rowY(8) + T.ROW.height / 2 + T.SPACE.tight))
  popover.why:SetWidth(WIDTH - 2 * T.SPACE.col)
end

-- Reset (to the frame's default place, scale, opacity and size, unlinked) and Done (the popover is a form that
-- applies as you go, so it ends in Done, which closes it as its X does).
local function addButtons()
  popover.done = W.Primary(popover, L["Done"], function() ns.CloseMoverPopover() end)
  popover.done:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  popover.reset = W.Button(popover, L["Reset"], function() ns.ResetMovers(popover.key) answer(true) end)
  popover.reset:SetPoint("RIGHT", popover.done, "LEFT", -T.SPACE.gap, 0)
end

-- The popover's title, a card's (the heading role, in the text colour) with its X: a name and where the frame is
-- anchored (refresh sets it), on one line short of the X. The X closes it as Done does; so does Escape, which
-- also puts an open dropdown away.
local function addChrome()
  local parts = ns.WindowTitle(popover, L["Position"], { kind = "card", onClose = ns.CloseMoverPopover, escape = true })
  parts.title:SetWidth(WIDTH - 3 * T.SPACE.gap - T.CONTROL.tile)
  parts.title:SetWordWrap(false)
  popover:HookScript("OnHide", ns.Guard("close mover menu", W.CloseMenu))
end

-- The popover, built once: a panel at the dialog alpha (it has edit boxes) over everything, kept on screen.
local function build()
  popover = T.Panel(CreateFrame("Frame", "Vanguard_MoverPopover", UIParent), { raised = true, alpha = T.ALPHA.dialog, shadow = true })
  popover:SetSize(WIDTH, HEIGHT)
  popover:SetFrameStrata("FULLSCREEN_DIALOG")
  popover:SetClampedToScreen(true)
  popover:EnableMouse(true)
  addChrome()
  addRows()
  addButtons()
end

-- Opens the popover for a mover, beside its handle.
function ns.MoverPopover(m)
  if not popover then build() end
  popover.key, popover.label = m.key, m.label
  popover:ClearAllPoints()
  popover:SetPoint("TOPLEFT", m.handle or UIParent, "TOPRIGHT", T.SPACE.gap, 0)
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
