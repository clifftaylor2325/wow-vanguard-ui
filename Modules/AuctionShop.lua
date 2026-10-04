-- Auction helper, the Shop card (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands): named shopping lists
-- and their entries (an item ID or a name), managed from the dropdown or
-- /fui ah (rename, duplicate, delete with a confirm, export as text, import
-- plain lines or Auctionator's `^`/`;` strings), Search list, which runs the
-- list's searches one after another, each entry's best result, and the
-- card's rows; clicking a row shows its item in the game's own list.
--
-- Standing rules here: every search goes through AH.Queue (one in flight,
-- at most 60 a minute); every price and count goes through ns.PlainNumber
-- before arithmetic; buying stays in the game's hands (a row only opens its
-- item in the game's list), and nothing writes into the game's auction frames.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The shop card: where it starts and its height, its rows (how many, from where).
AH.SHOP_Y, AH.SHOP_H, AH.SHOP_ROWS, AH.SHOP_ROWS_Y = -8, 196, 6, -74
-- Shopping lists: how many, entries per list, the list "+ Add" starts, the dropdown's "New list..." value.
AH.MAX_LISTS, AH.MAX_ENTRIES, AH.DEFAULT_LIST, AH.NEW = 20, 50, "Shopping", "\1new"
-- The dropdown's other actions on the list in use (values no list name can have).
AH.RENAME, AH.COPY, AH.DELETE, AH.IMPORT, AH.EXPORT = "\1rename", "\1copy", "\1delete", "\1import", "\1export"
-- What chat says when an action needs a list and there's none in use.
AH.NO_LIST = "Pick a shopping list first (the Shop card's dropdown, or /fui ah list <name>)."

-- Shopping lists -----------------------------------------------------------------------------

-- How many shopping lists there are.
local function countLists(store)
  local n = 0
  for _ in pairs(store.lists) do n = n + 1 end
  return n
end

-- The shopping list in use: its name and entries (nil when there's none yet).
function AH.CurrentList()
  local store = AP.Store()
  local list = store.list and store.lists[store.list]
  if list then return store.list, list end
end

-- Makes (or picks) the shopping list `name` and shows it; false for no name, or a new list past AH.MAX_LISTS.
function AH.NewList(name)
  local store = AP.Store()
  name = (name or ""):match("^%s*(.-)%s*$")
  if name == "" then return false end
  if not store.lists[name] and countLists(store) >= AH.MAX_LISTS then return ns.Chat("ForeverUI keeps at most 20 shopping lists.") end
  store.lists[name], store.list = store.lists[name] or {}, name
  ns.HideText()
  AH.PaintShop()
  return true
end

-- An entry from what was typed: the item ID in a link or a bare number, else the name (nil for nothing).
function AH.ParseEntry(text)
  text = (text or ""):match("^%s*(.-)%s*$")
  local id = tonumber(text:match("item:(%d+)") or text:match("^%d+$"))
  if id then return id end
  if text ~= "" then return text end
end

-- Adds an item (a link, an ID or a name) to a list: the one named, else the one in use, else "Shopping".
function AH.AddEntry(text, listName)
  local entry, store = AH.ParseEntry(text), AP.Store()
  local name = listName or store.list or AH.DEFAULT_LIST
  if not entry or not AH.NewList(name) then return end
  local list = store.lists[name]
  if #list >= AH.MAX_ENTRIES then return ns.Chat("A shopping list holds at most 50 items.") end
  list[#list + 1] = entry
  AH.PaintShop()
end

-- Takes entry i off a list.
function AH.RemoveEntry(listName, i)
  local list = AP.Store().lists[listName]
  if list and list[i] ~= nil then table.remove(list, i) end
  AH.PaintShop()
end

-- List management ----------------------------------------------------------------------------

-- Text without the spaces around it.
local function trim(text)
  return (text or ""):match("^%s*(.-)%s*$")
end

-- The name of the list in use when it's one of the named lists (nil otherwise).
local function listInUse()
  local store = AP.Store()
  if store.list and store.lists[store.list] then return store.list end
end

-- The first list by name (nil when there's none left).
local function firstList(store)
  local first
  for name in pairs(store.lists) do
    if not first or name < first then first = name end
  end
  return first
end

-- Renames the list in use; false for no list or no name, nil for a name another list has.
function AH.RenameList(name)
  local store, old = AP.Store(), listInUse()
  name = trim(name)
  if not old or name == "" then return false end
  if store.lists[name] and name ~= old then return ns.Chat("There's already a shopping list named " .. name .. ".") end
  local list = store.lists[old]
  store.lists[old] = nil
  store.lists[name], store.list = list, name
  ns.HideText()
  AH.PaintShop()
  return true
end

-- Deletes a list; the first list left (by name) is the one in use if it was.
function AH.DeleteList(name)
  local store = AP.Store()
  if not store.lists[name] then return end
  store.lists[name] = nil
  if store.list == name then store.list = firstList(store) end
  if AH.shopCard then AH.shopCard.offset = 0 end
  ns.Chat("Deleted the shopping list " .. name .. ".")
  AH.PaintShop()
end

-- Asks before deleting the list in use (Delete or No).
function AH.AskDelete()
  local name = listInUse()
  if not name then return ns.Chat(AH.NO_LIST) end
  local question = string.format("Delete the shopping list %s (%d items)?", name, #AP.Store().lists[name])
  ns.Ask(question, "Delete", function() AH.DeleteList(name) end, function() end)
end

-- A name no list has yet: "<name> copy", then "<name> copy 2" and on.
local function copyName(store, name)
  local new, n = name .. " copy", 1
  while store.lists[new] do
    n = n + 1
    new = string.format("%s copy %d", name, n)
  end
  return new
end

-- Copies the list in use into a new list, which is then the one in use (within AH.MAX_LISTS).
function AH.DuplicateList()
  local store, name, list = AP.Store(), AH.CurrentList()
  if not name then return ns.Chat(AH.NO_LIST) end
  local new = copyName(store, name)
  if not AH.NewList(new) then return end
  for i, entry in ipairs(list) do store.lists[new][i] = entry end
  ns.Chat(string.format("Copied %s to %s.", name, new))
  AH.PaintShop()
end

-- An entry as a line of export text: its item ID or its name.
function AH.EntryText(entry)
  return tostring(entry)
end

-- Shows the list in use as text to copy (Ctrl+C), one item per line.
function AH.ExportList()
  local name, list = AH.CurrentList()
  if not name then return ns.Chat(AH.NO_LIST) end
  local lines = {}
  for i, entry in ipairs(list) do lines[i] = AH.EntryText(entry) end
  ns.ShowText(string.format("Shopping list %s (Ctrl+C copies it)", name), table.concat(lines, "\n"))
end

-- One imported term: its entry from the first field (nil for none; in quotes, the exact name),
-- and how many of its other fields say something (ignored).
function AH.ImportTerm(term)
  local fields, ignored = {}, 0
  for field in (term .. ";"):gmatch("([^;]*);") do fields[#fields + 1] = field end
  for i = 2, #fields do
    if fields[i]:match("%S") then ignored = ignored + 1 end
  end
  local name = trim(fields[1])
  local quoted = name:match('^"(.*)"$')
  return AH.ParseEntry(quoted or name), ignored
end

-- An import's entries and how many fields were ignored: Auctionator's terms (`^` between terms,
-- `;` between fields) or plain lines (item names, IDs or links), or both.
function AH.ParseImport(text)
  local entries, ignored = {}, 0
  local terms = (text or ""):gsub("%^", "\n")
  for term in terms:gmatch("[^\r\n]+") do
    local entry, n = AH.ImportTerm(term)
    entries[#entries + 1] = entry
    ignored = ignored + n
  end
  return entries, ignored
end

-- Says what an import brought: how many came in, how many didn't fit, how many fields were ignored.
local function importSaid(name, added, full, ignored)
  local out = string.format("Imported %d item(s) into %s.", added, name)
  if full > 0 then out = out .. string.format(" %d didn't fit (a list holds at most 50).", full) end
  if ignored > 0 then out = out .. string.format(" %d other search field(s) ignored: ForeverUI takes each item's name.", ignored) end
  ns.Chat(out)
end

-- Adds an import's items to a list (made and picked if it's new), as far as AH.MAX_ENTRIES goes.
function AH.Import(text, name)
  local entries, ignored = AH.ParseImport(text)
  if not AH.NewList(name) then return end
  local list, added = AP.Store().lists[name], 0
  for _, entry in ipairs(entries) do
    if #list < AH.MAX_ENTRIES then list[#list + 1], added = entry, added + 1 end
  end
  importSaid(name, added, #entries - added, ignored)
  AH.PaintShop()
end

-- The import box, for the list in use (else Shopping).
function AH.AskImport()
  local name = listInUse() or AH.DEFAULT_LIST
  ns.AskText("Import into " .. name .. " (names, IDs, links, or a shopping list string)", function(text) AH.Import(text, name) end, "Import")
end

-- The rename box, for the list in use.
function AH.AskRename()
  local name = listInUse()
  if not name then return ns.Chat(AH.NO_LIST) end
  ns.AskText("Rename " .. name, AH.RenameList, "Rename")
end

-- /fui ah's words for the list in use (list and add are in Modules/AuctionHelper.lua).
-- rename <name>: renames it.
AH.COMMANDS.rename = function(arg)
  if not listInUse() then return ns.Chat(AH.NO_LIST) end
  if AH.RenameList(arg) == false then ns.Chat("/fui ah rename <new name> renames the shopping list in use.") end
end
-- duplicate: copies it to a new list.
AH.COMMANDS.duplicate = function() AH.DuplicateList() end
-- delete: deletes it, after asking.
AH.COMMANDS.delete = function() AH.AskDelete() end
-- export: shows it as text to copy.
AH.COMMANDS.export = function() AH.ExportList() end
-- import: the box to paste items into it.
AH.COMMANDS.import = function() AH.AskImport() end

-- Search list: every entry of the list in use, one search at a time.
function AH.SearchList()
  local _, list = AH.CurrentList()
  if not list or #list == 0 then return ns.Chat("Add items to a shopping list first (+ Add, or /fui ah add <list> <item>).") end
  AH.DropQueued("entry")
  AH.found, AH.progress = {}, { done = 0, total = #list }
  for _, entry in ipairs(list) do AH.Queue({ entry = entry }) end
  AH.PaintShop()
end

-- Results ------------------------------------------------------------------------------------

-- A browse result as a row's data, or nil when the client hides its price or count.
local function resultRow(r)
  local price, qty = ns.PlainNumber(r.minPrice), ns.PlainNumber(r.totalQuantity)
  if price and qty then return { key = r.itemKey, price = price, qty = qty } end
end

-- Whether a browse result is the entry's item: its ID, or its name (in any case).
local function matches(entry, r)
  if type(entry) == "number" then return r.itemKey.itemID == entry end
  local info = C_AuctionHouse.GetItemKeyInfo(r.itemKey)
  return info ~= nil and type(info.itemName) == "string" and info.itemName:lower() == entry:lower()
end

-- An entry's row: the result that is its item, else the first (results come cheapest first);
-- false when nothing (readable) is up.
function AH.BestResult(entry, results)
  for _, r in ipairs(results) do
    if matches(entry, r) then return resultRow(r) or false end
  end
  return results[1] and resultRow(results[1]) or false
end

-- Browse results: their prices feed the price store (any browse, the game's too); the list entry
-- in flight takes its row; an item opened in the game's list is done.
function AH.OnBrowse()
  AP.RecordBrowse(C_AuctionHouse.GetBrowseResults())
  local s = AH.pending
  if not (s and (s.entry or s.open)) then return end
  if s.entry then AH.found[s.entry] = AH.BestResult(s.entry, C_AuctionHouse.GetBrowseResults()) end
  AH.Done()
end

-- The shop card -------------------------------------------------------------------------------

-- What a row shows for an entry: the item's name and icon from its result, else from what the
-- client knows of an item ID, else the name typed.
function AH.EntryLook(entry, found)
  local info = found and C_AuctionHouse.GetItemKeyInfo(found.key)
  if info then return info.itemName, info.iconFileID end
  if type(entry) ~= "number" then return entry, AH.UNKNOWN_ICON end
  local name, _, _, _, _, _, _, _, _, icon = C_Item.GetItemInfo(entry)
  return name or ("item " .. entry), icon or AH.UNKNOWN_ICON
end

-- A row for one entry: the item, how many are up and the cheapest price per unit ("none up"
-- after a search found nothing); hidden past the list's end.
local function paintRow(r, entry)
  r:SetShown(entry ~= nil)
  if entry == nil then return end
  local found = AH.found[entry]
  local name, icon = AH.EntryLook(entry, found)
  r.entry = entry
  r.name:SetText(name)
  r.icon:SetTexture(icon)
  r.price:SetText(found and AP.Money(found.price) or (found == false and "none up" or ""))
  r.qty:SetText(found and ("x " .. found.qty) or "")
end

-- The shop card: the list picked, the search's progress ("12 of 50") and a row per entry from the scroll offset.
function AH.PaintShop()
  local c, p = AH.shopCard, AH.progress
  if not c then return end
  local _, list = AH.CurrentList()
  c.lists:Refresh()
  c.progress:SetText(p and string.format("%d of %d", p.done, p.total) or "")
  for i, r in ipairs(c.rows) do
    r.index = c.offset + i
    paintRow(r, list and list[r.index])
  end
end

-- A row clicked: left opens its item in the game's own list (buying stays in the game's hands),
-- right takes the entry off the list.
function AH.ClickRow(r, button)
  if button == "RightButton" then return AH.RemoveEntry((AH.CurrentList()), r.index) end
  local found = AH.found[r.entry]
  if found then AH.Queue({ open = found.key }, true) end
end

-- The mouse wheel over the rows scrolls them.
local function scrollShop(c, delta)
  local _, list = AH.CurrentList()
  c.offset = math.max(0, math.min(#(list or {}) - #c.rows, c.offset - delta))
  AH.PaintShop()
end

-- The dropdown's choices: the lists by name, "New list...", the actions on the list in use, and Import.
local function listChoices()
  local out = {}
  for name in pairs(AP.Store().lists) do out[#out + 1] = { name, name } end
  table.sort(out, function(a, b) return a[1] < b[1] end)
  out[#out + 1] = { AH.NEW, "New list..." }
  if listInUse() then
    for _, c in ipairs({ { AH.RENAME, "Rename list..." }, { AH.COPY, "Duplicate list" }, { AH.DELETE, "Delete list..." }, { AH.EXPORT, "Export list..." } }) do out[#out + 1] = c end
  end
  out[#out + 1] = { AH.IMPORT, "Import..." }
  return out
end

-- The dropdown's actions, by value.
AH.LIST_ACTIONS = {
  [AH.NEW] = function() ns.AskText("New shopping list", AH.NewList, "Create") end,
  [AH.RENAME] = function() AH.AskRename() end,
  [AH.COPY] = function() AH.DuplicateList() end,
  [AH.DELETE] = function() AH.AskDelete() end,
  [AH.EXPORT] = function() AH.ExportList() end,
  [AH.IMPORT] = function() AH.AskImport() end,
}

-- A choice in the dropdown: an action, or a list picked (shown from its top).
local function pickList(v)
  if AH.LIST_ACTIONS[v] then return AH.LIST_ACTIONS[v]() end
  AP.Store().list = v
  AH.shopCard.offset = 0
  AH.PaintShop()
end

-- The shop card's progress line, and its rows, scrolled by the mouse wheel.
local function shopRows(c)
  c.progress = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.progress:SetPoint("LEFT", c.search, "RIGHT", 8, 0)
  c.rows, c.offset = {}, 0
  for i = 1, AH.SHOP_ROWS do
    c.rows[i] = AH.Row(c, i, AH.SHOP_ROWS_Y, AH.ClickRow)
    AH.RowParts(c.rows[i])
  end
  c:EnableMouseWheel(true)
  c:SetScript("OnMouseWheel", scrollShop)
end

-- The shop card: the list dropdown, + Add, Search list with its progress line, and the rows.
function AH.BuildShop(f)
  local c = AH.Card(f, "Shop", AH.SHOP_Y, AH.SHOP_H)
  c.lists = W.Dropdown(c, listChoices, function() return AP.Store().list end, pickList, 180)
  c.lists:SetPoint("TOPLEFT", 0, -20)
  c.add = W.Button(c, "+ Add", function() ns.AskText("Add to list", function(text) AH.AddEntry(text) end, "Add") end, 76)
  c.add:SetPoint("TOPRIGHT", 0, -19)
  c.search = W.Button(c, "Search list", function() AH.SearchList() end, 120)
  c.search:SetPoint("TOPLEFT", 0, -46)
  c.rule:Hide()
  AH.shopCard = c
  shopRows(c)
end
