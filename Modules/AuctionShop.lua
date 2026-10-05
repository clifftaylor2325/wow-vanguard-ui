-- Auction helper, the Shop card (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands): named shopping lists
-- and their entries (an item ID or a name, with filters: exact name, level,
-- quality and a max price, set from a row's right-click menu), managed from the dropdown or
-- /fui ah (rename, duplicate, delete with a confirm, export as text, import
-- plain lines or Auctionator's `^`/`;` strings), Search list, which runs the
-- list's searches one after another (the last 20 terms searched are kept,
-- account-wide, as the Recent pseudo-list), each entry's best result, and the
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
-- Enum.AuctionHouseFilter's ExactMatch and PoorQuality (AuctionHouseEnumsDocumentation.lua): the
-- quality filters run on from PoorQuality in Enum.ItemQuality's order (Poor 0 ... Legendary 5).
AH.EXACT_FILTER, AH.QUALITY_FILTER = 5, 6
-- The qualities a filter can ask for, as { Enum.ItemQuality, name }, after "Any".
AH.ANY, AH.QUALITIES = "any", { { "any", "Any" }, { 0, "Poor" }, { 1, "Common" }, { 2, "Uncommon" }, { 3, "Rare" }, { 4, "Epic" }, { 5, "Legendary" } }
-- A shop row's right-click menu; the filter dialog's width.
AH.ROW_CHOICES, AH.FILTER_W = { { "filters", "Filters..." }, { "remove", "Remove" } }, 280
-- Copper in one of each money unit typed into a max price.
AH.MONEY_UNITS = { g = 10000, s = 100, c = 1 }
-- The Recent pseudo-list: its dropdown value, and how many searched terms it keeps.
AH.RECENT, AH.MAX_RECENT = "\1recent", 20
-- What chat says when an action needs a list and there's none in use.
AH.NO_LIST = "Pick a shopping list first (the Shop card's dropdown, or /fui ah list <name>)."

-- Shopping lists -----------------------------------------------------------------------------

-- How many shopping lists there are.
local function countLists(store)
  local n = 0
  for _ in pairs(store.lists) do n = n + 1 end
  return n
end

-- Entries whose browse results wait for an item's name (matched again when it comes in).
AH.unnamed = {}

-- The terms searched last, newest first (ForeverUIDB.ah.recent, kept for the account).
function AH.Recent()
  local store = AP.Store()
  store.recent = type(store.recent) == "table" and store.recent or {}
  return store.recent
end

-- A list's entries by its name, Recent's by AH.RECENT (nil when there's no such list).
function AH.ListByName(name)
  if name == AH.RECENT then return AH.Recent() end
  return AP.Store().lists[name]
end

-- The name of the list on the card, as AH.ListByName takes it.
function AH.ListKey()
  return AP.Store().list
end

-- The shopping list in use: its name and entries (nil when there's none yet).
function AH.CurrentList()
  local store = AP.Store()
  if store.list == AH.RECENT then return "Recent", AH.Recent() end
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

-- An entry's search term (an item ID or a name) and its filters (nil for a plain entry): an entry
-- with filters is { term, exact, minLevel, maxLevel, quality, maxPrice }, a plain one just its term.
function AH.Term(entry)
  if type(entry) == "table" then return entry.term, entry end
  return entry
end

-- A copy of an entry (its own filters table), for another list.
local function copyEntry(entry)
  if type(entry) ~= "table" then return entry end
  local out = {}
  for k, v in pairs(entry) do out[k] = v end
  return out
end

-- An entry from what was typed: the item ID in a link or a bare number, else the name (nil for nothing).
function AH.ParseEntry(text)
  text = (text or ""):match("^%s*(.-)%s*$")
  local id = tonumber(text:match("item:(%d+)") or text:match("^%d+$"))
  if id then return id end
  if text ~= "" then return text end
end

-- Adds an item (a link, an ID or a name) to a list: the one named, else the one in use (not Recent),
-- else "Shopping".
function AH.AddEntry(text, listName)
  local entry, store = AH.ParseEntry(text), AP.Store()
  local name = listName or (store.lists[store.list or ""] and store.list) or AH.DEFAULT_LIST
  if not entry or not AH.NewList(name) then return end
  local list = store.lists[name]
  if #list >= AH.MAX_ENTRIES then return ns.Chat("A shopping list holds at most 50 items.") end
  list[#list + 1] = entry
  AH.PaintShop()
end

-- Takes entry i off a list.
function AH.RemoveEntry(listName, i)
  local list = AH.ListByName(listName)
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

-- Asks before forgetting the recent searches (Clear or No).
local function askClearRecent()
  local recent = AH.Recent()
  local question = string.format("Clear the %d recent searches?", #recent)
  ns.Ask(question, "Clear", function() AP.Store().recent = {} AH.PaintShop() end, function() end)
end

-- Asks before deleting the list in use (Delete or No); on Recent, before clearing it.
function AH.AskDelete()
  if AH.ListKey() == AH.RECENT then return askClearRecent() end
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
  for i, entry in ipairs(list) do store.lists[new][i] = copyEntry(entry) end
  ns.Chat(string.format("Copied %s to %s.", name, new))
  AH.PaintShop()
end

-- An entry as a line of export text: its item ID or its name, in quotes for an exact name.
function AH.EntryText(entry)
  local term, f = AH.Term(entry)
  if f and f.exact then return '"' .. term .. '"' end
  return tostring(term)
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
  local entry = AH.ParseEntry(quoted or name)
  if quoted and type(entry) == "string" then entry = { term = entry, exact = true } end
  return entry, ignored
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
-- recent: Recent in use, and what's on it.
AH.COMMANDS.recent = function()
  AP.Store().list = AH.RECENT
  AH.PaintShop()
  AH.ListCommand("")
end

-- Keeps a searched term first in Recent (once, whatever its case), at most AH.MAX_RECENT of them.
function AH.Remember(entry)
  local recent, key = AH.Recent(), AH.EntryText(entry):lower()
  for i = #recent, 1, -1 do
    if AH.EntryText(recent[i]):lower() == key then table.remove(recent, i) end
  end
  table.insert(recent, 1, copyEntry(entry))
  for i = #recent, AH.MAX_RECENT + 1, -1 do recent[i] = nil end
end

-- Search list: every entry of the list in use, one search at a time (each kept in Recent, unless
-- it's Recent that is searched).
function AH.SearchList()
  local _, list = AH.CurrentList()
  if not list or #list == 0 then return ns.Chat("Add items to a shopping list first (+ Add, or /fui ah add <list> <item>).") end
  if AH.ListKey() ~= AH.RECENT then for _, entry in ipairs(list) do AH.Remember(entry) end end
  AH.DropQueued("entry")
  AH.found, AH.unnamed, AH.progress = {}, {}, { done = 0, total = #list }
  for _, entry in ipairs(list) do AH.Queue({ entry = entry }) end
  AH.PaintShop()
end

-- Results ------------------------------------------------------------------------------------

-- A browse result as a row's data, or nil when the client hides its price or count.
local function resultRow(r)
  local price, qty = ns.PlainNumber(r.minPrice), ns.PlainNumber(r.totalQuantity)
  if price and qty then return { key = r.itemKey, price = price, qty = qty } end
end

-- The browse query for a name: its filters (exact match, one quality) and level range.
local function browseQuery(term, f)
  f = f or {}
  local filters = {}
  if f.exact then filters[#filters + 1] = AH.EXACT_FILTER end
  if f.quality then filters[#filters + 1] = AH.QUALITY_FILTER + f.quality end
  return { searchString = term, sorts = AH.SORTS, filters = filters, itemClassFilters = {}, minLevel = f.minLevel, maxLevel = f.maxLevel }
end

-- Sends the shop's search: a list entry (an item ID by its item key, a name by text with its filters).
function AH.SendShop(s)
  local api, term, f = C_AuctionHouse, AH.Term(s.entry)
  if type(term) == "number" then return api.SearchForItemKeys({ api.MakeItemKey(term) }, AH.SORTS) end
  api.SendBrowseQuery(browseQuery(term, f))
end

-- Whether browse result r is a name entry's item on a pass (1: the same name; 2: a name containing
-- it, unless exact) and of its quality; nil while the client hasn't the result's name yet.
local function nameMatches(term, f, r, pass)
  local info = C_AuctionHouse.GetItemKeyInfo(r.itemKey)
  local name = info and type(info.itemName) == "string" and info.itemName:lower()
  if not name then return nil end
  if f and f.quality and info.quality ~= f.quality then return false end
  if pass == 1 then return name == term:lower() end
  return not (f and f.exact) and name:find(term:lower(), 1, true) ~= nil
end

-- Whether browse result r is the entry's item on a pass: its item ID (first pass), else by name.
local function matches(term, f, r, pass)
  if type(term) == "number" then return pass == 1 and r.itemKey.itemID == term end
  return nameMatches(term, f, r, pass)
end

-- A result row the entry takes: readable and not above its max price.
local function affordable(row, f)
  return row ~= nil and not (f and f.maxPrice and row.price > f.maxPrice)
end

-- An entry's row: the cheapest result that is its item (the same name first, then one containing it),
-- readable and within its max price; false when there's none, nil while a result's name isn't in yet.
function AH.BestResult(entry, results)
  local term, f = AH.Term(entry)
  local unnamed = false
  for pass = 1, 2 do
    for _, r in ipairs(results) do
      local m, row = matches(term, f, r, pass), resultRow(r)
      if m == nil then unnamed = true elseif m and affordable(row, f) then return row end
    end
  end
  if not unnamed then return false end
end

-- An entry's browse results: its row, or (while a result's name isn't in yet) kept to match again.
function AH.TakeBrowse(entry, results)
  local best = AH.BestResult(entry, results)
  AH.found[entry] = best
  AH.unnamed[entry] = best == nil and results or nil
end

-- Item names came in: the entries waiting on them are matched again, and the card repainted.
function AH.OnItemInfo()
  for entry, results in pairs(AH.unnamed) do AH.TakeBrowse(entry, results) end
  AH.PaintShop()
end

-- Browse results: their prices feed the price store (any browse, the game's too); the list entry
-- in flight takes its row; an item opened in the game's list is done.
function AH.OnBrowse()
  AP.RecordBrowse(C_AuctionHouse.GetBrowseResults())
  local s = AH.pending
  if not (s and (s.entry or s.open)) then return end
  if s.entry then AH.TakeBrowse(s.entry, C_AuctionHouse.GetBrowseResults()) end
  AH.Done()
end

-- The auction house events the shop follows besides browse results (on: Modules/AuctionHelper.lua's,
-- which ignores them in combat).
function AH.ListenShop(on)
  on("ITEM_KEY_ITEM_INFO_RECEIVED", function() AH.OnItemInfo() end)
end

-- The shop card -------------------------------------------------------------------------------

-- What a row shows for an entry: the item's name and icon from its result, else from what the
-- client knows of an item ID, else the name typed.
function AH.EntryLook(entry, found)
  local info, term = found and C_AuctionHouse.GetItemKeyInfo(found.key), AH.Term(entry)
  if info then return info.itemName, info.iconFileID end
  if type(term) ~= "number" then return term, AH.UNKNOWN_ICON end
  local name, _, _, _, _, _, _, _, _, icon = C_Item.GetItemInfo(term)
  return name or ("item " .. term), icon or AH.UNKNOWN_ICON
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
-- right opens the row's menu (Filters..., Remove) under it.
function AH.ClickRow(r, button)
  if button == "RightButton" then return AH.RowMenu(r) end
  local found = AH.found[r.entry]
  if found then AH.Queue({ open = found.key }, true) end
end

-- The mouse wheel over the rows scrolls them.
local function scrollShop(c, delta)
  local _, list = AH.CurrentList()
  c.offset = math.max(0, math.min(#(list or {}) - #c.rows, c.offset - delta))
  AH.PaintShop()
end

-- The actions on the list in use: a list's, or Recent's (no rename; Delete clears it).
local function listActions()
  if listInUse() then return { { AH.RENAME, "Rename list..." }, { AH.COPY, "Duplicate list" }, { AH.DELETE, "Delete list..." }, { AH.EXPORT, "Export list..." } } end
  if AH.ListKey() == AH.RECENT then return { { AH.COPY, "Duplicate list" }, { AH.EXPORT, "Export list..." }, { AH.DELETE, "Clear recent..." } } end
  return {}
end

-- The dropdown's choices: the lists by name, Recent (once something was searched), "New list...",
-- the actions on the list in use, and Import.
local function listChoices()
  local out = {}
  for name in pairs(AP.Store().lists) do out[#out + 1] = { name, name } end
  table.sort(out, function(a, b) return a[1] < b[1] end)
  if #AH.Recent() > 0 or AH.ListKey() == AH.RECENT then out[#out + 1] = { AH.RECENT, "Recent" } end
  out[#out + 1] = { AH.NEW, "New list..." }
  for _, c in ipairs(listActions()) do out[#out + 1] = c end
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

-- Filters -----------------------------------------------------------------------------------

-- Copper from a typed price: "1g 50s", "75s 20c", "12c" or a bare number of gold ("2.5"); nil for
-- nothing, nothing above zero, or text that isn't money.
function AH.ParseMoney(text)
  text = trim(text):lower()
  local gold, copper = tonumber(text), 0
  if gold then return gold > 0 and math.floor(gold * 10000 + 0.5) or nil end
  local rest = text:gsub("(%d+)%s*([gsc])", function(n, unit) copper = copper + tonumber(n) * AH.MONEY_UNITS[unit] return "" end)
  if copper > 0 and trim(rest) == "" then return copper end
end

-- A level typed into a box: a whole number from 1, else nil.
local function typedLevel(box)
  local n = tonumber(box:GetText() or "")
  if n and n >= 1 then return math.floor(n) end
end

-- The dialog's entry: its term with what the dialog says, or the bare term without any filter.
local function filteredEntry(d)
  local quality = d.draft.quality ~= AH.ANY and d.draft.quality or nil
  local f = { term = d.term, exact = d.draft.exact or nil, quality = quality, maxPrice = AH.ParseMoney(d.price:GetText()),
    minLevel = typedLevel(d.minLevel), maxLevel = typedLevel(d.maxLevel) }
  if f.exact or f.quality or f.maxPrice or f.minLevel or f.maxLevel then return f end
  return d.term
end

-- Save: the entry takes the dialog's filters (its old row is searched again next time).
function AH.SaveFilters()
  local d = AH.filterDialog
  local list = AH.ListByName(d.listName)
  if list and list[d.index] ~= nil then list[d.index] = filteredEntry(d) end
  d:Hide()
  AH.PaintShop()
end

-- A caption on the left of the filter dialog at y.
local function filterCaption(d, text, y)
  local fs = T.Text(d:CreateFontString(nil, "OVERLAY"), "label")
  fs:SetPoint("TOPLEFT", 20, y)
  fs:SetText(text)
  return fs
end

-- A box on the filter dialog, its right edge x from the dialog's right, at y.
local function filterBox(d, width, x, y)
  local box = W.Input(d, width)
  box:SetPoint("TOPRIGHT", x, y)
  return box
end

-- The filter dialog's rows: exact name, level from and to, quality and max price.
local function filterRows(d)
  d.exact = W.Check(d, "Exact name only", function() return d.draft.exact end, function(v) d.draft.exact = v end, AH.FILTER_W - 24)
  d.exact:SetPoint("TOPLEFT", 12, -36)
  filterCaption(d, "Level", -74)
  d.minLevel, d.maxLevel = filterBox(d, 44, -90, -70), filterBox(d, 44, -20, -70)
  filterCaption(d, "to", -74):SetPoint("TOPLEFT", AH.FILTER_W - 80, -74)
  d.quality = W.Choice(d, "Quality", AH.QUALITIES, function() return d.draft.quality end, function(v) d.draft.quality = v end, AH.FILTER_W - 24)
  d.quality:SetPoint("TOPLEFT", 12, -96)
  filterCaption(d, "Max price", -134)
  d.price = filterBox(d, 120, -20, -130)
end

-- The filter dialog's draft (what its switch and choice show), title, and Save and Cancel at the bottom right.
local function filterFrame(d)
  d.draft = { exact = false, quality = AH.ANY }
  d.title = T.Text(d:CreateFontString(nil, "OVERLAY"), "heading")
  d.title:SetPoint("TOPLEFT", 12, -12)
  d.save = W.Primary(d, "Save", function() AH.SaveFilters() end, 80)
  d.save:SetPoint("BOTTOMRIGHT", -12, 12)
  d.cancel = W.Button(d, "Cancel", function() d:Hide() end, 80)
  d.cancel:SetPoint("RIGHT", d.save, "LEFT", -8, 0)
end

-- The filter dialog, built once: a raised panel over the auction house, with Save and Cancel.
local function buildFilters()
  local d = T.Panel(CreateFrame("Frame", "ForeverUI_AuctionFilters", UIParent), { raised = true, shadow = true })
  d:SetSize(AH.FILTER_W, 200)
  d:SetFrameStrata("DIALOG")
  d:SetClampedToScreen(true)
  d:EnableMouse(true)
  filterFrame(d)
  filterRows(d)
  d:Hide()
  AH.filterDialog = d
  return d
end

-- Fills the filter dialog from an entry's filters.
local function fillFilters(d, entry)
  local term, f = AH.Term(entry)
  f = f or {}
  d.term, d.draft = term, { exact = f.exact == true, quality = f.quality or AH.ANY }
  d.title:SetText("Filters: " .. (AH.EntryLook(entry)))
  d.minLevel:SetText(f.minLevel and tostring(f.minLevel) or "")
  d.maxLevel:SetText(f.maxLevel and tostring(f.maxLevel) or "")
  d.price:SetText(f.maxPrice and AP.Money(f.maxPrice) or "")
  d.exact:Refresh()
  d.quality:Refresh()
end

-- Opens the filter dialog for entry i of a list, beside the shop panel.
function AH.EditFilters(listName, i)
  local d, list = AH.filterDialog or buildFilters(), AH.ListByName(listName)
  if not (list and list[i] ~= nil) then return end
  d.listName, d.index = listName, i
  fillFilters(d, list[i])
  d:ClearAllPoints()
  d:SetPoint("TOPLEFT", AH.frame or UIParent, "TOPRIGHT", 8, 0)
  d:Show()
end

-- A choice in a row's menu: its filters, or off the list.
function AH.RowAction(v)
  local c = AH.shopCard
  if v == "remove" then return AH.RemoveEntry(AH.ListKey(), c.menuIndex) end
  AH.EditFilters(AH.ListKey(), c.menuIndex)
end

-- A row's menu (the dropdown menu's, opened by a hidden dropdown under the row).
function AH.RowMenu(r)
  local d = AH.shopCard.rowMenu
  AH.shopCard.menuIndex = r.index
  W.CloseMenu()
  d:ClearAllPoints()
  d:SetPoint("BOTTOMLEFT", r, "BOTTOMLEFT", 22, 0)
  d:GetScript("OnClick")(d)
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

-- The shop card's controls: the list dropdown, + Add and Search list.
local function shopControls(c)
  c.lists = W.Dropdown(c, listChoices, function() return AP.Store().list end, pickList, 180)
  c.lists:SetPoint("TOPLEFT", 0, -20)
  c.add = W.Button(c, "+ Add", function() ns.AskText("Add to list", function(text) AH.AddEntry(text) end, "Add") end, 76)
  c.add:SetPoint("TOPRIGHT", 0, -19)
  c.search = W.Button(c, "Search list", function() AH.SearchList() end, 120)
  c.search:SetPoint("TOPLEFT", 0, -46)
end

-- The shop card: the list dropdown, + Add, Search list with its progress line, the rows, and a
-- row's menu (a hidden dropdown that opens the dropdown menu under the row right-clicked).
function AH.BuildShop(f)
  local c = AH.Card(f, "Shop", AH.SHOP_Y, AH.SHOP_H)
  shopControls(c)
  c.rule:Hide()
  AH.shopCard = c
  shopRows(c)
  c.rowMenu = W.Dropdown(c, AH.ROW_CHOICES, function() end, AH.RowAction, 120)
  c.rowMenu:Hide()
end
