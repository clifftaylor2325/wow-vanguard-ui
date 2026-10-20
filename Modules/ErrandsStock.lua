-- Errands, the Keep stocked window: the stock list (ER.StockList, this character's own) as rows you can
-- edit, an item icon and name, where to buy it (Vendor memory), how many to carry and Remove, over a slot
-- an item from your bags is dragged onto to add it. Opened from /vg > Town and gear > Errands, "Edit list...".
-- Amounts save as you type; 0 or an empty box takes the item off when you leave it. Buying is unchanged
-- (Errands.lua): this window only edits the list, so it works in a fight as well as out of one.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local ER = ns.GetModule("Errands")
local SW = {}
ER.StockWindow = SW

SW.WIDTH, SW.HEIGHT, SW.PAD = 480, 440, T.SPACE.pad
-- A row's height and the gap under it, how many rows show before the list scrolls, and the room right of
-- the rows for the scroll thumb.
SW.ROW_H, SW.ROW_GAP, SW.SHOWN, SW.THUMB_ROOM = 40, T.SPACE.tight, 6, T.SPACE.col
-- The amount box's and the Remove button's widths, and the icon's size.
SW.AMOUNT_W, SW.REMOVE_W, SW.ICON = 64, 88, 32
-- The note's and the column header's line heights, and the add slot's height.
SW.LINE_H, SW.SLOT_H = 18, 48
-- What a dragged item is added with when the client doesn't know its stack size yet.
SW.DEFAULT_AMOUNT = 20
SW.NOTE = "Bought from merchants up to these amounts when you visit one. This character only."
SW.EMPTY = "Nothing on your list yet. Drag an item onto the slot below."
SW.NOT_SEEN = "where to buy: not seen yet"

-- The list's width: the window's less its pads and the thumb's room.
local LIST_W = SW.WIDTH - 2 * SW.PAD - SW.THUMB_ROOM

-- The list ------------------------------------------------------------------------------------

-- How many of an item a dragged one is added with: one stack, or SW.DEFAULT_AMOUNT while the client can't say.
function SW.StartAmount(id)
  local info = C_Item and C_Item.GetItemInfo
  local stack = type(info) == "function" and ns.PlainNumber((select(8, info(id)))) or nil
  return stack and stack > 0 and stack or SW.DEFAULT_AMOUNT
end

-- Adds an item to the list (an item already on it keeps its amount) and repaints.
function SW.Add(id)
  local list = ER.StockList()
  list[id] = list[id] or SW.StartAmount(id)
  SW.Refresh()
end

-- Takes an item off the list and repaints.
function SW.Remove(id)
  ER.StockList()[id] = nil
  SW.Refresh()
end

-- The item on the cursor, added to the list: what the add slot does with a drop or a click.
function SW.TakeCursor()
  local kind, id = GetCursorInfo()
  id = kind == "item" and ns.PlainNumber(id) or nil
  if not id then return end
  ClearCursor()
  SW.Add(id)
end

-- Rows ----------------------------------------------------------------------------------------

-- Typing in a row's box: a whole number above 0 is saved at once (0 and empty wait for SW.LeaveAmount).
local function typeAmount(box, user)
  local n, id = tonumber(box:GetText()), box:GetParent().id
  if user and id and n and n > 0 then ER.StockList()[id] = math.floor(n) end
end

-- Leaving a row's box: 0 or nothing takes the item off; anything else shows the amount kept. A box losing
-- focus because a repaint hid it (SW.painting) leaves the list alone: the player didn't leave it.
function SW.LeaveAmount(box)
  local id = box:GetParent().id
  if SW.painting or not id or not ER.StockList()[id] then return end
  local n = tonumber(box:GetText())
  if not n or n <= 0 then return SW.Remove(id) end
  box:SetText(tostring(ER.StockList()[id]))
end

-- A row's amount box: numbers only, saved as you type, checked when you leave it.
local function amountBox(row)
  local box = W.Input(row, SW.AMOUNT_W)
  box:SetNumeric(true)
  box:SetMaxLetters(5)
  box:HookScript("OnTextChanged", ns.Guard("type stock amount", typeAmount))
  box:HookScript("OnEditFocusLost", ns.Guard("leave stock amount", SW.LeaveAmount))
  return box
end

-- The text side of a row: the item's name over where to buy it, between the icon and the amount box.
local function rowText(row)
  row.name = T.Text(row:CreateFontString(nil, "OVERLAY"), "label", "text")
  row.name:SetPoint("TOPLEFT", row.icon, "TOPRIGHT", T.SPACE.gap, -1)
  row.name:SetPoint("RIGHT", row.amount, "LEFT", -T.SPACE.gap, 0)
  row.where = T.Text(row:CreateFontString(nil, "OVERLAY"), "small", "muted")
  row.where:SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", T.SPACE.gap, 1)
  row.where:SetPoint("RIGHT", row.amount, "LEFT", -T.SPACE.gap, 0)
end

-- A row's Remove button, at its right edge.
local function removeButton(row)
  row.remove = ns.DialogButton(row, "Remove", SW.REMOVE_W)
  row.remove:SetPoint("RIGHT", -T.SPACE.tight, 0)
  row.remove:SetScript("OnClick", ns.Guard("click stock remove", function(self) SW.Remove(self:GetParent().id) end))
end

-- One row, made on demand: a list row with the icon, the name and where to buy it, the amount and Remove.
local function makeRow(parent)
  local row = W.Row(parent, SW.ROW_H, { width = LIST_W })
  row.icon = T.Crop(row:CreateTexture(nil, "ARTWORK"))
  row.icon:SetSize(SW.ICON, SW.ICON)
  row.icon:SetPoint("LEFT", T.SPACE.tight, 0)
  removeButton(row)
  row.amount = amountBox(row)
  row.amount:SetPoint("RIGHT", row.remove, "LEFT", -T.SPACE.gap, 0)
  rowText(row)
  return row
end

-- Fills row i with an item: its icon, name, where to buy it and the amount kept.
local function paintRow(row, i, id)
  row.id = id
  row:SetPoint("TOPLEFT", SW.frame.list.child, "TOPLEFT", 0, -(i - 1) * (SW.ROW_H + SW.ROW_GAP))
  row.icon:SetTexture(C_Item and C_Item.GetItemIconByID and C_Item.GetItemIconByID(id) or nil)
  row.name:SetText(ER.ItemName(id))
  row.where:SetText(ER.WhereToBuy(id) or SW.NOT_SEEN)
  row.amount:SetText(tostring(ER.StockList()[id]))
  row:Show()
end

-- Repaints the rows from the list (the empty line when there are none) and sizes the scroll to them.
function SW.Refresh()
  local f = SW.frame
  if not f then return end
  local ids = ER.StockIDs()
  SW.painting = true
  f.rows.Reset()
  for i, id in ipairs(ids) do paintRow(f.rows.Next(), i, id) end
  SW.painting = nil
  f.empty:SetShown(#ids == 0)
  f.list:Fit(#ids * (SW.ROW_H + SW.ROW_GAP))
end

-- The window -----------------------------------------------------------------------------------

-- Where the list starts, down from the top: the dialog's head, the note and the column header.
local LIST_TOP = ns.DIALOG.head + 2 * SW.LINE_H
-- How tall the list is: SW.SHOWN rows with their gaps.
local LIST_H = SW.SHOWN * (SW.ROW_H + SW.ROW_GAP)

-- A muted line of text at x, y from the window's top-left.
local function note(f, text, role, x, y)
  local fs = T.Text(f:CreateFontString(nil, "OVERLAY"), role, "muted")
  fs:SetPoint("TOPLEFT", x, -y)
  fs:SetText(text)
  return fs
end

-- The note under the title and the Item and Carry column labels over the rows.
local function labels(f)
  f.note = note(f, SW.NOTE, "label", SW.PAD, ns.DIALOG.head)
  f.note:SetWidth(SW.WIDTH - 2 * SW.PAD)
  f.note:SetJustifyH("LEFT")
  note(f, "Item", "small", SW.PAD + SW.ICON + T.SPACE.tight + T.SPACE.gap, ns.DIALOG.head + SW.LINE_H)
  local carry = LIST_W - T.SPACE.tight - SW.REMOVE_W - T.SPACE.gap - SW.AMOUNT_W
  note(f, "Carry", "small", SW.PAD + carry, ns.DIALOG.head + SW.LINE_H)
end

-- The scrolling rows (made as they are needed) and the line an empty list shows instead.
local function rows(f)
  f.list = ns.ScrollView(f, { width = LIST_W })
  f.list:SetPoint("TOPLEFT", SW.PAD, -LIST_TOP)
  f.list:SetSize(LIST_W, LIST_H)
  f.rows = ns.QuestParts.Pool(f.list.child, makeRow)
  f.empty = note(f, SW.EMPTY, "label", SW.PAD, LIST_TOP + T.SPACE.gap)
end

-- The add slot under the list: a slot an item is dragged onto (or clicked with one held), and what it does.
local function addSlot(f)
  local slot = T.Slot(CreateFrame("Button", nil, f))
  slot:SetSize(SW.SLOT_H - T.SPACE.gap, SW.SLOT_H - T.SPACE.gap)
  slot:SetPoint("TOPLEFT", SW.PAD + T.SPACE.tight, -(LIST_TOP + LIST_H + T.SPACE.gap + T.SPACE.tight))
  slot:SetScript("OnReceiveDrag", ns.Guard("drop on stock slot", SW.TakeCursor))
  slot:SetScript("OnClick", ns.Guard("click stock slot", SW.TakeCursor))
  slot.plus = T.Text(slot:CreateFontString(nil, "OVERLAY"), "heading", "accentText")
  slot.plus:SetPoint("CENTER")
  slot.plus:SetText("+")
  f.slot = slot
end

-- The add slot's two lines beside it.
local function slotText(f)
  f.slotText = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text")
  f.slotText:SetPoint("TOPLEFT", f.slot, "TOPRIGHT", T.SPACE.col, -T.SPACE.tight)
  f.slotText:SetText("Add an item: drag one from your bags onto this slot")
  f.slotHint = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.slotHint:SetPoint("BOTTOMLEFT", f.slot, "BOTTOMRIGHT", T.SPACE.col, T.SPACE.tight)
  f.slotHint:SetText(string.format("It is added with one stack (or %d); change the amount in its row.", SW.DEFAULT_AMOUNT))
end

-- Clear list asks first (it can't be undone), then empties the list.
function SW.AskClear()
  if next(ER.StockList()) == nil then return end
  ns.Ask("Clear your Keep stocked list?", "Clear list", ER.ClearStock, nil, "danger")
end

-- The footer: Clear list at the far left, Done (the list saves as you go) at the right.
local function footer(f)
  f.clear = ns.DialogButton(f, "Clear list", nil, "danger")
  f.clear:SetPoint("BOTTOMLEFT", SW.PAD, SW.PAD)
  f.clear:SetScript("OnClick", ns.Guard("click stock clear", SW.AskClear))
  f.done = W.Primary(f, "Done", function() f:Hide() end)
  f.done:SetPoint("BOTTOMRIGHT", -SW.PAD, SW.PAD)
end

-- Builds the window once: a dialog (its X and Escape close it).
local function build()
  local f = ns.Dialog("Vanguard_StockList", SW.WIDTH, SW.HEIGHT, "Keep stocked")
  labels(f)
  rows(f)
  addSlot(f)
  slotText(f)
  footer(f)
  return f
end

-- Repaints an open window on the next frame, once for a burst (an item's name or icon arriving).
local function refreshSoon()
  if SW.frame and SW.frame:IsShown() then ns.Soon("stock window", SW.Refresh) end
end

-- Opens the window (Errands must be on), built on first use.
function SW.Open()
  if not ER.settings then return ns.Chat("Errands is off (/vg > Modules).") end
  if not SW.frame then
    SW.frame = build()
    ns.On("GET_ITEM_INFO_RECEIVED", refreshSoon)
  end
  SW.Refresh()
  SW.frame:Show()
end
