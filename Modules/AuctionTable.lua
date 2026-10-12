-- Auction helper, the table (Modules/AuctionHelper.lua holds the tabs, the
-- search queue, the scan and the slash commands): the one widget the pages'
-- lists share. The Shopping page's list, its listings view, Deals and
-- Upgrades, and the Selling page's listings and your auctions are each a
-- table: a header line with a heading per column (a click sorts by it, the
-- sorted one in the accent with an arrow for the order), a status line for
-- what to say while there are no rows, and the rows, each an icon and a
-- name on the left and a cell per column on the right (the name takes the
-- rest of the width), scrolled by the mouse wheel and, when the owner asks,
-- taken by the keyboard while the mouse is over them (Up and Down mark a
-- row, Enter opens it; every other key stays the game's).
--
-- Standing rules here: the table shows what it is given and asks nothing of
-- the house; its owner paints each row and answers its clicks, sorts and
-- scrolls, so no price or count is read here.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets
local AH = ns.GetModule("AuctionHelper")

-- The header line's height, the most columns a table has beside the name, and the room between two columns.
AH.TABLE_HEAD, AH.TABLE_CELLS, AH.TABLE_GAP = 16, 4, 12

-- How many rows fit in h units with the header (one at least).
function AH.TableRows(h)
  return math.max(1, math.floor((h - AH.TABLE_HEAD) / AH.ROW_H))
end

-- Columns --------------------------------------------------------------------------------------

-- Where the columns sit: each one's right edge from the table's right (the last at the edge, each
-- before it further in, AH.TABLE_GAP apart), and where the name column ends.
local function place(columns)
  local xs, x = {}, 0
  for i = #columns, 1, -1 do xs[i], x = x, x + columns[i].width + AH.TABLE_GAP end
  return xs, x
end

-- Heading i at its column: the column's width, its title kept to the column's side.
local function placeHead(t, i, col, x)
  local h = t.heads[i]
  h.key, h.side = col.key, col.side
  h:ClearAllPoints()
  h:SetPoint("TOPRIGHT", t, "TOPRIGHT", -x, 0)
  h:SetWidth(col.width)
  h.text:ClearAllPoints()
  h.text:SetPoint(col.side, col.side == "RIGHT" and -2 or 2, 0)
  h.text:SetText(col.title)
  h:Show()
end

-- A row's cell i at its column: in the column's text role and color, kept to its side.
local function placeCell(r, i, col, x)
  local fs = T.Text(r.cells[i], col.role or "small", col.color or "text")
  fs:ClearAllPoints()
  if col.side == "RIGHT" then fs:SetPoint("RIGHT", r, "RIGHT", -(x + 2), 0) else fs:SetPoint("LEFT", r, "RIGHT", 2 - x - col.width, 0) end
  r.cells[col.key] = fs
  fs:Show()
end

-- A row's cells for the table's columns (by key too; the cells past them hidden, old keys dropped),
-- and its name up to the first column.
local function placeCells(t, r)
  for k in pairs(r.cells) do if type(k) == "string" then r.cells[k] = nil end end
  for i = 1, AH.TABLE_CELLS do
    local col = t.columns[i]
    if col then placeCell(r, i, col, t.xs[i]) else r.cells[i]:Hide() r.cells[i]:SetText("") end
  end
  r.name:SetPoint("RIGHT", r, "RIGHT", -(t.nameEnd + 4), 0)
end

-- The sort arrow beside a heading: up for low first, down for high first.
local function paintArrow(t, h, reverse)
  local right = h.side == "RIGHT"
  t.arrow:ClearAllPoints()
  t.arrow:SetPoint(right and "RIGHT" or "LEFT", h.text, right and "LEFT" or "RIGHT", right and -2 or 2, 0)
  t.arrow:SetRotation(reverse and 0 or math.pi)
  t.arrow:Show()
end

-- The sorted column, by key (none for a table that doesn't sort): its heading in the accent with
-- the arrow, the others plain.
local function setSort(t, key, reverse)
  t.sort, t.reverse = key, reverse
  t.arrow:Hide()
  for i = 1, AH.TABLE_CELLS do
    local h = t.heads[i]
    local on = key ~= nil and h.key == key
    T.Color(h.text, on and "accentText" or "text2")
    if on then paintArrow(t, h, reverse) end
  end
end

-- The table's columns, at most AH.TABLE_CELLS, as { key, title, width, side (the text's, RIGHT or
-- LEFT), role, color } (and name, the name column's heading, when its rows name an item): the
-- headings and every row's cells laid out again, nothing sorted.
local function setColumns(t, columns)
  t.columns = columns
  t.xs, t.nameEnd = place(columns)
  t.nameHead:SetText(columns.name or "")
  for i = 1, AH.TABLE_CELLS do
    if columns[i] then placeHead(t, i, columns[i], t.xs[i]) else t.heads[i]:Hide() t.heads[i].key = nil end
  end
  for _, r in ipairs(t.rows) do placeCells(t, r) end
  setSort(t, nil)
  return t
end

-- Heading i: a button on the header line, sorting by its column on a click (the owner's onSort).
local function head(t)
  local h = CreateFrame("Button", nil, t)
  h:SetHeight(AH.TABLE_HEAD)
  h.text = T.Text(h:CreateFontString(nil, "OVERLAY"), "small", "text2")
  h:SetScript("OnClick", ns.Guard("click sort header", function(self) if t.onSort and self.key then t.onSort(self.key) end end))
  return h
end

-- Rows -----------------------------------------------------------------------------------------

-- The table has the keyboard while the mouse is over it, out of combat; lets it go otherwise.
local function focusKeys(t, on)
  t:EnableKeyboard(on and not ns.InCombat())
end

-- The mouse over a row: the keyboard (when the table takes it), then the owner's onEnter.
local function enterRow(r)
  local t = r:GetParent()
  if t.keys then focusKeys(t, true) end
  if t.onEnter then t.onEnter(r) end
end

-- The mouse off a row: the keyboard stays while it is still over the table; then the owner's onLeave.
local function leaveRow(r)
  local t = r:GetParent()
  if t.keys then focusKeys(t, t:IsMouseOver()) end
  if t.onLeave then t.onLeave(r) end
end

-- The keyboard's mark on a row: an accent edge on its left and a wash across it.
local function keyMarks(r)
  r.wash, r.mark = W.Flat(r, "BACKGROUND", "hover"), W.Flat(r, "ARTWORK", "accent")
  r.wash:SetAllPoints()
  r.mark:SetPoint("TOPLEFT")
  r.mark:SetPoint("BOTTOMLEFT")
  r.mark:SetWidth(2)
end
AH.KeyMarks = keyMarks

-- A row's flag: a small square before the icon, in the table's flag color (hidden until painted).
local function flagMark(r, color)
  r.flag = W.Flat(r, "ARTWORK", color)
  r.flag:SetSize(6, 6)
  r.flag:SetPoint("LEFT", 0, 0)
  r.flag:Hide()
  r.icon:SetPoint("LEFT", 10, 0)
end

-- A row's name after its icon, kept to the left on one line (its right edge set with the columns).
local function rowName(r)
  r.name = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.name:SetPoint("LEFT", r.icon, "RIGHT", 4, 0)
  r.name:SetJustifyH("LEFT")
  r.name:SetWordWrap(false)
end

-- A row's icon (16 px) and name, and its cells (each with a font from the start, so one past the
-- columns can be cleared; placed and styled when the columns are set).
local function rowParts(t, r)
  r.icon = T.Crop(r:CreateTexture(nil, "ARTWORK"))
  r.icon:SetSize(16, 16)
  r.icon:SetPoint("LEFT", 2, 0)
  rowName(r)
  r.cells = {}
  for i = 1, AH.TABLE_CELLS do r.cells[i] = T.Text(r:CreateFontString(nil, "OVERLAY"), "small") end
  if t.keys then keyMarks(r) end
  if t.flag then flagMark(r, t.flag) end
end

-- Row i, AH.ROW_H tall under the header: a click goes to the owner's onClick with the row (its
-- item and index on it), the mouse over it to its onEnter and onLeave.
local function row(t, i)
  local r = AH.Row(t, i, -AH.TABLE_HEAD, function(self, button) if t.onClick then t.onClick(self, button) end end)
  rowParts(t, r)
  r:SetScript("OnEnter", enterRow)
  r:SetScript("OnLeave", leaveRow)
  return r
end

-- Painting -------------------------------------------------------------------------------------

-- The rows from the scroll offset: each one's item (the owner's paintRow fills it), the keyboard's
-- mark on the marked one; the rows past the last item hidden.
local function paint(t)
  for i, r in ipairs(t.rows) do
    local index = t.offset + i
    local item = t.items[index]
    r.item, r.index = item, index
    r:SetShown(item ~= nil)
    if item then t.paintRow(r, item, index) end
    if r.mark then r.mark:SetShown(item ~= nil and index == t.mark) r.wash:SetShown(item ~= nil and index == t.mark) end
  end
end

-- The items shown, from the scroll offset (the one given, else the table's, kept within them), painted.
local function setItems(t, items, offset)
  t.items = items
  t.offset = math.max(0, math.min(offset or t.offset, #items - #t.rows))
  paint(t)
end

-- Whether the rows are near the end of the items (within two), for an owner that pages.
local function nearEnd(t)
  return t.offset + #t.rows >= #t.items - 2
end

-- The wheel scrolls the rows; the owner's onNear may then ask for more.
local function scroll(t, delta)
  setItems(t, t.items, t.offset - delta)
  if t.onNear then t.onNear() end
end

-- The status line, shown while there is something to say (over the rows' place).
local function setStatus(t, text)
  t.status:SetText(text or "")
end

-- Keys -----------------------------------------------------------------------------------------

-- Marks row i (kept within the items, scrolled into view) for the keyboard; the owner's onNear may ask for more.
local function markRow(t, i)
  t.mark = math.max(1, math.min(#t.items, i))
  local offset = t.offset
  if t.mark <= offset then offset = t.mark - 1 end
  if t.mark > offset + #t.rows then offset = t.mark - #t.rows end
  setItems(t, t.items, offset)
  if t.onNear then t.onNear() end
end

-- What a key does: Up and Down move the mark, Enter opens the marked row (the owner's onOpen);
-- true when the key was used.
local function useKey(t, key)
  if key == "UP" or key == "DOWN" then markRow(t, t.mark + (key == "UP" and -1 or 1)) return true end
  if key == "ENTER" and t.items[t.mark] then t.onOpen(t.mark) return true end
  return false
end

-- A key while the table has the keyboard: the ones it uses stop here, every other one goes on to
-- the game; none is used while a box has the typing (the options window's way).
local function onKey(t, key)
  local typing = type(GetCurrentKeyBoardFocus) == "function" and GetCurrentKeyBoardFocus() ~= nil
  local used = not typing and t:IsShown() and useKey(t, key)
  if not ns.InCombat() and ns.Client.Has("keyPropagate") then t:SetPropagateKeyboardInput(not used) end
end

-- The keys: the table has the keyboard while the mouse is over it, never once hidden.
local function keyInput(t)
  t:SetScript("OnKeyDown", onKey)
  t:SetScript("OnEnter", function(self) focusKeys(self, true) end)
  t:SetScript("OnLeave", function(self) focusKeys(self, self:IsMouseOver()) end)
  t:SetScript("OnHide", function(self) self:EnableKeyboard(false) end)
end

-- The table ------------------------------------------------------------------------------------

-- The table's methods.
local METHODS = { SetColumns = setColumns, SetItems = setItems, Paint = paint, SetSort = setSort,
  SetStatus = setStatus, MarkRow = markRow, NearEnd = nearEnd }

-- The table's parts: the headings, the sort arrow, the status line and n rows.
local function parts(t, n)
  t.heads, t.rows, t.items, t.offset, t.mark = {}, {}, {}, 0, 1
  for i = 1, AH.TABLE_CELLS do t.heads[i] = head(t) end
  t.nameHead = T.Text(t:CreateFontString(nil, "OVERLAY"), "small", "text2")
  t.nameHead:SetPoint("TOPLEFT", 4, -2)
  t.arrow = W.IconTexture(t, "Down", 10, "accent")
  t.status = T.Text(t:CreateFontString(nil, "OVERLAY"), "small", "text2")
  t.status:SetPoint("TOPLEFT", 4, -AH.TABLE_HEAD - 4)
  for i = 1, n do t.rows[i] = row(t, i) end
end

-- A table of n rows for the columns (setColumns), on a parent; opts: paintRow(r, item, i) fills a
-- row, onClick(r, button) takes a click, onEnter(r) and onLeave(r) the mouse, onSort(key) a heading
-- click, onNear a scroll near the end, keys (true) the keyboard with onOpen(i) for Enter, flag a
-- color for a square before each icon. It sets its height; its owner anchors it.
function AH.Table(parent, columns, n, opts)
  local t = CreateFrame("Frame", nil, parent)
  for k, v in pairs(opts) do t[k] = v end
  for k, v in pairs(METHODS) do t[k] = v end
  t:SetHeight(AH.TABLE_HEAD + n * AH.ROW_H)
  t:EnableMouse(true)
  t:EnableMouseWheel(true)
  t:SetScript("OnMouseWheel", scroll)
  parts(t, n)
  if t.keys then keyInput(t) end
  return setColumns(t, columns)
end
