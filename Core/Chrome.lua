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

-- Lets Escape close a named frame, through the game's list of special frames (where the client has it),
-- the way the game's own windows close: the game hides it, nothing reads keys. A frame already listed is
-- not listed twice.
---@param frame table  a named frame Vanguard made
function ns.CloseOnEscape(frame)
  local name = frame:GetName()
  if not name then error("Vanguard: escape needs a named frame", 2) end
  if type(UISpecialFrames) ~= "table" then return end
  for _, listed in ipairs(UISpecialFrames) do if listed == name then return end end
  table.insert(UISpecialFrames, name)
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
  if opts.escape then ns.CloseOnEscape(frame) end
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

-- Shows or hides a row's selected look (T.SelectRow, the one place it is drawn) and notes it on the row.
local function setSelected(row, on)
  row.selected = on == true
  T.SelectRow(row, row.selected)
end

-- A list row: a Button `height` tall (T.ROW.height unless given), dressed by T.Row: the hover wash under
-- the mouse, the press shade while held and, through row:SetSelected(on), the one selected look: an accent
-- rail T.SELECT.rail screen pixels wide along its left edge (row.rail) over a lighter fill (row.wash).
-- opts.width sets its width.
function W.Row(parent, height, opts)
  local row = CreateFrame("Button", nil, parent)
  row:SetHeight(height or T.ROW.height)
  if opts and opts.width then row:SetWidth(opts.width) end
  local parts = T.RowParts(T.Row(row))
  row.rail, row.wash, row.selected, row.SetSelected = parts.rail, parts.fill, false, setSelected
  return row
end

-- Keyboard focus ---------------------------------------------------------------------------------

-- Each window's keyboard focus (weak): { list = a function giving its buttons, at = the focused one }.
local focusOf = setmetatable({}, { __mode = "k" })

-- The window's buttons that can take focus now: shown and enabled, in the list's order.
local function focusable(frame)
  local out = {}
  for _, b in ipairs(focusOf[frame].list()) do
    if b:IsVisible() and (not b.IsEnabled or b:IsEnabled()) then out[#out + 1] = b end
  end
  return out
end

-- Moves a window's focus to b (or to none), the T.FocusRing with it.
local function setFocused(frame, b)
  local f = focusOf[frame]
  if f.at then T.FocusRing(f.at, false) end
  f.at = b
  if b then T.FocusRing(b, true) end
end

-- Moves a window's focus to the next (dir 1) or previous (dir -1) button, wrapping; the first Shift-Tab lands on the last.
local function stepFocus(frame, dir)
  local list, at = focusable(frame), 0
  for i, b in ipairs(list) do
    if b == focusOf[frame].at then at = i end
  end
  if #list == 0 then return end
  if at == 0 and dir < 0 then at = 1 end
  setFocused(frame, list[(at - 1 + dir) % #list + 1])
end

-- Presses the focused button with Enter or Space, if it is still there, enabled and has a click to run.
local function pressFocused(b)
  local click = b and b:IsVisible() and (not b.IsEnabled or b:IsEnabled()) and b:GetScript("OnClick")
  if click then click(b, "LeftButton") end
  return click ~= nil and click ~= false
end

-- What a key does in a window with focus; true when it used the key. Tab and Shift-Tab step; Enter and Space press
-- the focused button (and do nothing with no focus: Enter then belongs to the window's own primary). Not in combat.
---@param frame table  a window given ns.TabFocus
---@param key string
---@return boolean used
function ns.FocusKey(frame, key)
  if ns.InCombat() or not focusOf[frame] then return false end
  if key == "TAB" then stepFocus(frame, IsShiftKeyDown and IsShiftKeyDown() and -1 or 1) return true end
  if key == "ENTER" or key == "SPACE" then return pressFocused(focusOf[frame].at) end
  return false
end

-- Drops a window's focus ring (a wizard changed page, say).
---@param frame table  a window given ns.TabFocus
function ns.FocusClear(frame)
  if focusOf[frame] then setFocused(frame, nil) end
end

-- Takes the keyboard only while the window is shown, out of combat and where the client can pass keys on (a key
-- the window doesn't use must reach the game); a window shown in a fight, or up when one starts, waits for it to end.
local function holdKeys(frame, on)
  if on and ns.InCombat() then return ns.AfterCombat(function() holdKeys(frame, frame:IsShown()) end, frame) end
  frame:EnableKeyboard(on and ns.Client.Has("keyPropagate") or false)
end

-- The window's key script hook: a key the focus uses stops here, every other one goes on to the game (out of combat).
local function hookFocusKeys(frame)
  frame:HookScript("OnKeyDown", ns.Guard("window focus key", function(f, key)
    if ns.InCombat() or not ns.Client.Has("keyPropagate") then return end
    f:SetPropagateKeyboardInput(not ns.FocusKey(f, key))
  end))
end

-- A fight lets the keyboard go; the combat queue takes it back after, if the window is still up.
local function releaseInCombat(frame)
  ns.On("PLAYER_REGEN_DISABLED", function()
    frame:EnableKeyboard(false)
    ns.AfterCombat(function() holdKeys(frame, frame:IsShown()) end, frame)
  end)
end

-- Gives a window Tab focus over the buttons list() returns (a function, read at each key): a Tab or Shift-Tab
-- moves a T.FocusRing along them, Enter or Space presses the focused one, every other key goes on to the game. The
-- ring clears when the window shows or hides. Hooks only; the window's own key script, if any, still runs. A window
-- that holds the keyboard and routes its keys itself passes own = true and calls ns.FocusKey from its key script.
---@param frame table  a window of Vanguard's own
---@param list function  returns the buttons that can take focus, in order
---@param own boolean|nil  the window holds the keyboard and calls ns.FocusKey itself
function ns.TabFocus(frame, list, own)
  focusOf[frame] = { list = list }
  frame:HookScript("OnShow", ns.Guard("window focus show", function(f) setFocused(f, nil) if not own then holdKeys(f, true) end end))
  frame:HookScript("OnHide", ns.Guard("window focus hide", function(f) setFocused(f, nil) if not own then holdKeys(f, false) end end))
  if own then return end
  hookFocusKeys(frame)
  releaseInCombat(frame)
  if frame:IsShown() then holdKeys(frame, true) end
end
