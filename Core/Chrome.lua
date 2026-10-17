-- Window chrome shared by every Vanguard window and card: the title line with its count and
-- close button (ns.WindowTitle), the one scroll view with the T.SCROLL thumb (ns.ScrollView),
-- a section header (W.SectionHeader) and a list row with the one selected look (W.Row).
-- Nothing here paints a panel: a window paints itself, then asks for its chrome.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

-- Titles --------------------------------------------------------------------------------------

-- The text role of each title tier: a window's title, a card's heading (the two display roles).
local TITLE_ROLES = { window = "title", card = "heading" }
-- Where a title sits, by tier and alignment: its point, the frame's point it anchors to, x and y.
-- A window's title sits on the close button's line (its middle T.CONTROL.inset down), T.SPACE.pad in from
-- the left or centred; a card's top T.SPACE.gap in from its corner, or centred at that height.
local TITLE_SPOTS = {
  window = { left = { "LEFT", "TOPLEFT", T.SPACE.pad, -T.CONTROL.inset }, center = { "CENTER", "TOP", 0, -T.CONTROL.inset } },
  card = { left = { "TOPLEFT", "TOPLEFT", T.SPACE.gap, -T.SPACE.gap }, center = { "TOP", "TOP", 0, -T.SPACE.gap } },
}
-- The gap between a title and its count: right of it, or under it when the title is centred.
local COUNT_GAP, COUNT_DROP = T.SPACE.gap + 2, T.SPACE.tight

-- The title string: its tier's role in the body text colour (gold is for content), at its tier's spot.
local function addTitle(frame, text, kind, align)
  local spot = TITLE_SPOTS[kind][align]
  local title = T.Text(frame:CreateFontString(nil, "OVERLAY"), TITLE_ROLES[kind], "text")
  title:SetPoint(spot[1], frame, spot[2], spot[3], spot[4])
  title:SetJustifyH(align == "center" and "CENTER" or "LEFT")
  title:SetText(text)
  return title
end

-- The count or subtitle beside a title, in small text2: right of it, or under it when the title is centred.
local function addCount(frame, title, text, align)
  local count = T.Text(frame:CreateFontString(nil, "OVERLAY"), "small", "text2")
  if align == "center" then count:SetPoint("TOP", title, "BOTTOM", 0, -COUNT_DROP) else count:SetPoint("LEFT", title, "RIGHT", COUNT_GAP, 0) end
  count:SetJustifyH(align == "center" and "CENTER" or "LEFT")
  count:SetText(text)
  return count
end

-- The close button: where every window has it (T.PlaceClose), or T.SPACE.gap in from a card's top-right
-- corner; its click runs onClose(frame) under a guard named after the title.
local function addClose(frame, text, kind, onClose)
  local close = T.CloseButton(CreateFrame("Button", nil, frame))
  if kind == "card" then close:SetPoint("TOPRIGHT", -T.SPACE.gap, -T.SPACE.gap) else T.PlaceClose(close, frame) end
  close:SetScript("OnClick", ns.Guard("click close " .. text, function() onClose(frame) end))
  return close
end

-- Lets Escape close a named frame, through the game's list of special frames (where the client has it).
local function closeOnEscape(frame)
  local name = frame:GetName()
  if not name then error("Vanguard: WindowTitle: escape needs a named frame", 3) end
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, name) end
end

-- A window's or card's title line. opts.kind: "window" (the default; the title role) or "card" (the heading
-- role), both in the text colour. opts.align: "left" (the default) or "center". opts.count: a second string
-- (a quest count, a subtitle) beside the title. opts.onClose: a function; a close button is placed and its
-- click calls it with the frame. opts.escape: the frame (which must have a name) closes on Escape.
-- Returns { title, count, close }, and sets frame.title and frame.close for the code that reads them.
---@param frame table  a frame Vanguard made
---@param text string
---@param opts table|nil  kind, align, count, onClose, escape
---@return table parts  { title, count, close }
function ns.WindowTitle(frame, text, opts)
  opts = opts or {}
  local kind, align = opts.kind or "window", opts.align or "left"
  local parts = { title = addTitle(frame, text, kind, align) }
  if opts.count then parts.count = addCount(frame, parts.title, opts.count, align) end
  if opts.onClose then parts.close = addClose(frame, text, kind, opts.onClose) end
  if opts.escape then closeOnEscape(frame) end
  frame.title, frame.close = parts.title, parts.close
  return parts
end

-- Scroll view ---------------------------------------------------------------------------------

-- How wide the thumb's grip is (units): wider than the thin bar, so it is easy to catch.
local GRIP_W = 12
-- The thumb's shortest height (units), how far it sits right of the view, how far one wheel step
-- scrolls, and how tall the soft edges are.
local THUMB_MIN, THUMB_OUT, WHEEL_STEP, EDGE_H = 24, T.SPACE.col, 40, 24

-- How far a view can scroll: its content's height past its own.
local function maxScroll(view)
  return math.max(0, view.child:GetHeight() - view:GetHeight())
end

-- Sizes and places the thumb (hidden, with its grip, while everything fits): as tall as the view's share
-- of the content, THUMB_MIN at least, as far down its travel as the view is scrolled.
local function updateThumb(view)
  local vh, ch = view:GetHeight(), view.child:GetHeight()
  local shown = vh > 0 and ch > vh + 1
  view.thumb:SetShown(shown)
  view.grip:SetShown(shown)
  if not shown then return end
  local h = math.max(THUMB_MIN, vh * vh / ch)
  view.thumb:SetHeight(h)
  view.thumb:ClearAllPoints()
  view.thumb:SetPoint("TOPRIGHT", view, "TOPRIGHT", THUMB_OUT, -(view:GetVerticalScroll() or 0) / (ch - vh) * (vh - h))
end

-- The soft edges: the top one once scrolled down, the bottom one while there is more below.
local function updateEdges(view)
  local scroll = view:GetVerticalScroll() or 0
  view.fadeTop:SetShown(scroll > 1)
  view.fadeBottom:SetShown(scroll < maxScroll(view) - 1)
end

-- Scrolls a view to y, kept within its content, with its thumb and edges.
local function scrollTo(view, y)
  view:SetVerticalScroll(math.max(0, math.min(maxScroll(view), y)))
  updateThumb(view)
  updateEdges(view)
end

-- Lights the thumb while the mouse is over its grip or drags it; the rest alpha otherwise.
local function lightThumb(view)
  view.thumb:SetAlpha((view.drag or view.grip:IsMouseOver()) and T.SCROLL.lit or T.SCROLL.rest)
end

-- The cursor's height in the view's units.
local function cursorY(view)
  local _, y = GetCursorPosition()
  return y / view:GetEffectiveScale()
end

-- While the thumb is dragged: scrolls as far as the cursor moved, scaled from the thumb's travel to the content's.
local function onDrag(view)
  local travel = view:GetHeight() - view.thumb:GetHeight()
  if not view.drag or travel <= 0 then return end
  scrollTo(view, view.drag.scroll + (view.drag.y - cursorY(view)) / travel * maxScroll(view))
end

-- Starts a thumb drag with the left button: the view follows the cursor until the button is let go.
local function startDrag(view, button)
  if button ~= "LeftButton" then return end
  view.drag = { y = cursorY(view), scroll = view:GetVerticalScroll() or 0 }
  lightThumb(view)
  view.grip:SetScript("OnUpdate", function() onDrag(view) end)
end

-- Ends a thumb drag.
local function stopDrag(view)
  view.drag = nil
  view.grip:SetScript("OnUpdate", nil)
  lightThumb(view)
end

-- The grip's mouse: the thumb lights under it, and dragging it scrolls the view. A grip hidden mid-drag (its
-- window closed, or the content fits now) never hears the button let go, so hiding it ends the drag too.
local function wireGrip(view, grip)
  grip:SetScript("OnEnter", ns.Guard("enter scroll grip", function() lightThumb(view) end))
  grip:SetScript("OnLeave", ns.Guard("leave scroll grip", function() lightThumb(view) end))
  grip:SetScript("OnMouseDown", ns.Guard("press scroll grip", function(_, button) startDrag(view, button) end))
  grip:SetScript("OnMouseUp", ns.Guard("release scroll grip", function() stopDrag(view) end))
  grip:SetScript("OnHide", ns.Guard("hide scroll grip", function() stopDrag(view) end))
end

-- The thumb: the one scroll line (T.SCROLL) right of the view, with its invisible grip over it.
local function addThumb(view, holder)
  view.thumb = W.Flat(holder, "OVERLAY", "text2")
  view.thumb:SetWidth(T.SCROLL.thumb)
  view.thumb:SetAlpha(T.SCROLL.rest)
  view.grip = CreateFrame("Frame", nil, holder)
  view.grip:SetPoint("TOP", view.thumb, "TOP")
  view.grip:SetPoint("BOTTOM", view.thumb, "BOTTOM")
  view.grip:SetWidth(GRIP_W)
  view.grip:EnableMouse(true)
  wireGrip(view, view.grip)
end

-- A soft edge in the panel's colour over one end of the view (lines fade into it).
local function fadeEdge(holder, side)
  local t = T.Snap(holder:CreateTexture(nil, "OVERLAY"))
  t:SetTexture(T.Texture("Fade"))
  T.Tint(t, "panel")
  if side == "TOP" then t:SetTexCoord(0, 1, 1, 0) end
  t:SetPoint(side .. "LEFT")
  t:SetPoint(side .. "RIGHT")
  t:SetHeight(EDGE_H)
  return t
end

-- The layer above the content: the two soft edges, and the thumb with its grip.
local function addOverlay(view)
  local holder = CreateFrame("Frame", nil, view)
  holder:SetAllPoints(view)
  holder:SetFrameLevel(view:GetFrameLevel() + 10)
  view.fadeTop, view.fadeBottom = fadeEdge(holder, "TOP"), fadeEdge(holder, "BOTTOM")
  addThumb(view, holder)
end

-- The content: the frame given (an edit box, say), or a Frame opts.width wide, as the view's scroll child.
local function addChild(view, opts)
  view.child = opts.child or CreateFrame("Frame", nil, view)
  if not opts.child then view.child:SetSize(opts.width or 1, 1) end
  view:SetScrollChild(view.child)
end

-- Sizes the content to `height` (at least 1) and keeps the scroll inside the new range.
local function fit(view, height)
  view.child:SetHeight(math.max(1, height))
  scrollTo(view, view:GetVerticalScroll() or 0)
end

-- Scrolls the view the least that brings a span of the content (`top` units down, `h` tall) into view.
local function showSpan(view, top, h)
  local scroll, vh = view:GetVerticalScroll() or 0, view:GetHeight()
  if top < scroll then scrollTo(view, top) elseif top + h > scroll + vh then scrollTo(view, top + h - vh) end
end

-- Keeps a multi-line edit box's cursor in view: each time it moves (OnCursorChanged's x, y, w, h; y is how
-- far down from the box's top the cursor is, as a negative offset), the view scrolls so its rectangle is inside.
-- The client can move the cursor to a new last line before it makes the box taller, so the span is kept
-- (view.cursor) and followed again when the box's size changes.
local function followCursor(view, box)
  box:HookScript("OnCursorChanged", ns.Guard("follow cursor", function(_, _, y, _, h) view.cursor = { -y, h }; showSpan(view, -y, h) end))
  box:HookScript("OnSizeChanged", ns.Guard("follow grown box", function() if view.cursor then showSpan(view, view.cursor[1], view.cursor[2]) end end))
end

-- A scroll view: a ScrollFrame holding view.child (opts.child, a frame you made, or a Frame opts.width wide),
-- with the one scroll thumb (T.SCROLL) right of it under a grip you can drag, soft panel-coloured edges where
-- there is more above or below, the wheel scrolling WHEEL_STEP a step, and no arrows. It re-reads its thumb and
-- edges when its own size changes, as when the client first lays out a view sized by its anchors (no height
-- before that, so a thumb worked out earlier would be missing). view:Fit(height) sizes the content and clamps
-- the scroll; view:ScrollTo(y); view:FollowCursor(editBox) keeps a cursor in view.
---@param parent table
---@param opts table|nil  child, width
---@return table view  the ScrollFrame, with child, thumb, grip, Fit, ScrollTo and FollowCursor
function ns.ScrollView(parent, opts)
  opts = opts or {}
  local view = CreateFrame("ScrollFrame", nil, parent)
  addChild(view, opts)
  addOverlay(view)
  view:EnableMouseWheel(true)
  view:SetScript("OnMouseWheel", ns.Guard("wheel scroll view", function(self, delta) scrollTo(self, (self:GetVerticalScroll() or 0) - delta * WHEEL_STEP) end))
  view:HookScript("OnSizeChanged", ns.Guard("size scroll view", function() scrollTo(view, view:GetVerticalScroll() or 0) end))
  view.Fit, view.ScrollTo, view.FollowCursor = fit, scrollTo, followCursor
  scrollTo(view, 0)
  return view
end

-- Section header -------------------------------------------------------------------------------

-- How tall a section header is (units), and its chevron's size.
local HEADER_H, CHEVRON = 18, 12

-- Shows a header folded (a Right chevron) or open (Down); remembered in header.collapsed.
local function setCollapsed(header, on)
  header.collapsed = on == true
  header.chevron:SetTexture(T.Icon(header.collapsed and "Right" or "Down"))
end

-- Sets a header's text, in capitals.
local function setHeaderText(header, text)
  T.SetText(header.text, text)
end

-- The chevron left of a collapsible header's text; a click flips it and tells onToggle(collapsed).
local function addChevron(header, text, onToggle)
  header.chevron = W.IconTexture(header, "Down", CHEVRON, "text2")
  header.chevron:SetPoint("LEFT")
  header.text:SetPoint("LEFT", header.chevron, "RIGHT", T.SPACE.tight, 0)
  header.SetCollapsed = setCollapsed
  header:SetScript("OnClick", ns.Guard("click section " .. text, function(self) self:SetCollapsed(not self.collapsed) if onToggle then onToggle(self.collapsed) end end))
  setCollapsed(header, false)
end

-- The count after a header's text, in small text2.
local function addHeaderCount(header, text)
  local count = T.Text(header:CreateFontString(nil, "OVERLAY"), "small", "text2")
  count:SetPoint("LEFT", header.text, "RIGHT", T.SPACE.tight, 0)
  count:SetText(text)
  return count
end

-- A header's text: small muted capitals along its left edge (the options cards' style).
local function addHeaderText(header, text)
  header.text = T.Text(header:CreateFontString(nil, "OVERLAY"), "section", "muted")
  header.text:SetPoint("LEFT")
  header.SetText = setHeaderText
  header:SetText(text)
end

-- A section header: an HEADER_H band with its text in small muted capitals (the options cards' style).
-- opts.collapsible adds a chevron (Down open, Right folded), header:SetCollapsed(on) and a click calling
-- opts.onToggle(collapsed); opts.count a small text2 count after the text (header.count); opts.width its
-- width. header:SetText(text) changes the text.
function W.SectionHeader(parent, text, opts)
  opts = opts or {}
  local header = CreateFrame("Button", nil, parent)
  header:SetHeight(HEADER_H)
  if opts.width then header:SetWidth(opts.width) end
  addHeaderText(header, text)
  if opts.collapsible then addChevron(header, text, opts.onToggle) end
  if opts.count then header.count = addHeaderCount(header, opts.count) end
  return header
end

-- Rows -----------------------------------------------------------------------------------------

-- Shows or hides a row's selected look: the accent rail and wash.
local function setSelected(row, on)
  row.selected = on == true
  row.rail:SetShown(row.selected)
  row.wash:SetShown(row.selected)
end

-- The selected look's parts, hidden: the wash over the row and the rail down its left edge, T.ROW.rail
-- screen pixels wide.
local function addSelectedLook(row)
  row.wash = T.Tint(W.Flat(row, "BACKGROUND", "accent"), "accent", T.ROW.wash)
  row.wash:SetAllPoints()
  row.rail = W.Flat(row, "ARTWORK", "accent")
  row.rail:SetPoint("TOPLEFT")
  row.rail:SetPoint("BOTTOMLEFT")
  row.rail:SetWidth(T.ROW.rail * T.Pixel(row))
  row.SetSelected = setSelected
  setSelected(row, false)
end

-- A list row: a Button `height` tall (T.ROW.height unless given) with the hover wash under the mouse.
-- row:SetSelected(on) shows the one selected look: an accent rail T.ROW.rail screen pixels wide along its
-- left edge (row.rail) and an accent wash at T.ROW.wash alpha (row.wash). opts.width sets its width.
function W.Row(parent, height, opts)
  local row = CreateFrame("Button", nil, parent)
  row:SetHeight(height or T.ROW.height)
  if opts and opts.width then row:SetWidth(opts.width) end
  W.Flat(row, "HIGHLIGHT", "hover"):SetAllPoints()
  addSelectedLook(row)
  return row
end
