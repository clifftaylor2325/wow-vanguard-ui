-- Auction helper, the Shopping page (Modules/AuctionHelper.lua holds the tabs,
-- the search queue, the scan and the slash commands): named shopping lists
-- and their entries (an item ID or a name, with filters: exact name, level,
-- quality and a max price, set from a row's right-click menu), managed from
-- the Lists pane's buttons or /vg ah (new, rename, duplicate, delete with a
-- confirm, export as text, import plain lines or Auctionator's `^`/`;`
-- strings), Search list, which runs the list's searches one after another
-- (the last 20 terms searched are kept, account-wide, as the Recent
-- pseudo-list), and each entry's best result. The pane on the left lists the
-- lists (with Recent, and the entries other files add: Deals, Upgrades); the
-- card on the right shows the one picked as a table (Modules/AuctionTable.lua)
-- under a toolbar; clicking a row opens the results view in its place: every
-- listing of that item (unit price, quantity, time left; each column sorts),
-- further pages read as you scroll, Up/Down and Enter while the mouse is
-- over it, and a listing clicked shows its item in the game's own list.
--
-- Standing rules here: every search goes through AH.Queue (one in flight,
-- at most 60 a minute); every price and count goes through ns.PlainNumber
-- before arithmetic; buying stays in the game's hands (a row or a listing
-- only opens its item in the game's list; nothing here buys), and nothing
-- writes into the game's auction frames.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The list's rows: how many (until AH.Build counts them from the room they have), and its columns
-- (Modules/AuctionTable.lua's form): the cheapest unit price, how many are up, and the max price.
AH.SHOP_ROWS = 6
AH.LIST_COLUMNS = { { key = "price", title = "Unit price", width = 100, side = "RIGHT", role = "number", color = "gold" },
  { key = "qty", title = "Up", width = 60, side = "RIGHT", role = "small", color = "text2" },
  { key = "max", title = "Max", width = 80, side = "RIGHT", role = "small", color = "text2" }, name = "Item" }
-- The Lists pane: its rows (how many, from where), the height its action buttons take (two rows of
-- standalone buttons and the gap between), their width (three to a row), and the actions in order.
AH.PANE_ROWS, AH.PANE_ROWS_Y, AH.ACTIONS_H, AH.ACTION_W = 6, -20, 2 * T.BUTTON_H + T.SPACE.tight, 66
-- Shopping lists: how many, entries per list, the list "+ Add" starts, the New action's value.
AH.MAX_LISTS, AH.MAX_ENTRIES, AH.DEFAULT_LIST, AH.NEW = 20, 50, "Shopping", "\1new"
-- The other actions on the list in use (values no list name can have).
AH.RENAME, AH.COPY, AH.DELETE, AH.IMPORT, AH.EXPORT = "\1rename", "\1copy", "\1delete", "\1import", "\1export"
AH.ACTIONS = { { AH.NEW, "New" }, { AH.RENAME, "Rename" }, { AH.COPY, "Copy" }, { AH.DELETE, "Delete" }, { AH.IMPORT, "Import" }, { AH.EXPORT, "Export" } }
-- Enum.AuctionHouseFilter's ExactMatch and PoorQuality (AuctionHouseEnumsDocumentation.lua): the
-- quality filters run on from PoorQuality in Enum.ItemQuality's order (Poor 0 ... Legendary 5).
AH.EXACT_FILTER, AH.QUALITY_FILTER = 5, 6
-- The qualities a filter can ask for, as { Enum.ItemQuality, name }, after "Any".
AH.ANY, AH.QUALITIES = "any", { { "any", "Any" }, { 0, "Poor" }, { 1, "Common" }, { 2, "Uncommon" }, { 3, "Rare" }, { 4, "Epic" }, { 5, "Legendary" } }
-- The results view: its rows (how many, until AH.Build counts them) and its columns.
AH.VIEW_ROWS = 6
AH.VIEW_COLUMNS = { { key = "price", title = "Unit price", width = 100, side = "RIGHT", role = "number", color = "gold" },
  { key = "qty", title = "Quantity", width = 70, side = "RIGHT", role = "small", color = "text" },
  { key = "time", title = "Time left", width = 92, side = "LEFT", role = "small", color = "text2" } }
-- Enum.AuctionHouseTimeLeftBand (Short 0 ... VeryLong 3) as the game's names (TIME_LEFT_SHORT...) and
-- ours when the client has none.
AH.TIME_BANDS = { [0] = { "TIME_LEFT_SHORT", "Short" }, [1] = { "TIME_LEFT_MEDIUM", "Medium" }, [2] = { "TIME_LEFT_LONG", "Long" }, [3] = { "TIME_LEFT_VERY_LONG", "Very long" } }
-- A shop row's right-click menu; the filter dialog's width.
AH.ROW_CHOICES, AH.FILTER_W = { { "filters", "Filters..." }, { "remove", "Remove" } }, 280
-- Copper in one of each money unit typed into a max price.
AH.MONEY_UNITS = { g = 10000, s = 100, c = 1 }
-- The Recent pseudo-list: its pane key, and how many searched terms it keeps.
AH.RECENT, AH.MAX_RECENT = "\1recent", 20
-- What chat says when an action needs a list and there's none in use.
AH.NO_LIST = "Pick a shopping list first (the Lists pane, or /vg ah list <name>)."

-- Shopping lists -----------------------------------------------------------------------------

-- How many shopping lists there are.
local function countLists(store)
  local n = 0
  for _ in pairs(store.lists) do n = n + 1 end
  return n
end

-- Entries whose browse results wait for an item's name (matched again when it comes in).
AH.unnamed = {}

-- The terms searched last, newest first (VanguardDB.ah.recent, kept for the account).
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
  if not store.lists[name] and countLists(store) >= AH.MAX_LISTS then return ns.Chat("Vanguard keeps at most 20 shopping lists.") end
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
-- else "Shopping"; true once added.
function AH.AddEntry(text, listName)
  local entry, store = AH.ParseEntry(text), AP.Store()
  local name = listName or (store.lists[store.list or ""] and store.list) or AH.DEFAULT_LIST
  if not entry or not AH.NewList(name) then return end
  local list = store.lists[name]
  if #list >= AH.MAX_ENTRIES then return ns.Chat("A shopping list holds at most 50 items.") end
  list[#list + 1] = entry
  AH.PaintShop()
  return true
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
  ns.Ask(question, "Clear", function() AP.Store().recent = {} AH.PaintShop() end, function() end, "danger")
end

-- Asks before deleting the list in use (Delete or No); on Recent, before clearing it.
function AH.AskDelete()
  if AH.ListKey() == AH.RECENT then return askClearRecent() end
  local name = listInUse()
  if not name then return ns.Chat(AH.NO_LIST) end
  local question = string.format("Delete the shopping list %s (%d items)?", name, #AP.Store().lists[name])
  ns.Ask(question, "Delete", function() AH.DeleteList(name) end, function() end, "danger")
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
  if ignored > 0 then out = out .. string.format(" %d other search field(s) ignored: Vanguard takes each item's name.", ignored) end
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

-- /vg ah's words for the list in use (list and add are in Modules/AuctionHelper.lua).
-- rename <name>: renames it.
AH.COMMANDS.rename = function(arg)
  if not listInUse() then return ns.Chat(AH.NO_LIST) end
  if AH.RenameList(arg) == false then ns.Chat("/vg ah rename <new name> renames the shopping list in use.") end
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
  if not list or #list == 0 then return ns.Chat("Add items to a shopping list first (+ Add, or /vg ah add <list> <item>).") end
  if AH.ListKey() ~= AH.RECENT then for _, entry in ipairs(list) do AH.Remember(entry) end end
  AH.DropQueued("entry")
  AH.DropQueued("cost")
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

-- Sends the shop's search: an item's listings for the view, or a list entry (an item ID by its
-- item key, a name by text with its filters). The view's further pages go through AH.Send.
function AH.SendShop(s)
  local api, term, f = C_AuctionHouse, AH.Term(s.entry)
  if s.listings then return api.SendSearchQuery(s.listings, AH.SORTS, false) end
  if s.cost then return api.SendSearchQuery(s.cost.key, AH.SORTS, false) end
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

-- An entry's browse results: its row, or (while a result's name isn't in yet) kept to match again;
-- a row found may ring the entry's price alert (Modules/AuctionAlerts.lua).
function AH.TakeBrowse(entry, results)
  local best = AH.BestResult(entry, results)
  AH.found[entry] = best
  AH.unnamed[entry] = best == nil and results or nil
  AH.QueueCost(entry, best)
  AH.EntryFound(entry, best)
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

-- The auction house events the shop follows besides browse results and item search results
-- (on: Modules/AuctionHelper.lua's, which ignores them in combat; AH.OnSearchEvent hands the
-- search results to AH.OnListings).
function AH.ListenShop(on)
  on("ITEM_KEY_ITEM_INFO_RECEIVED", function() AH.OnItemInfo() end)
  ns.On("AUCTION_HOUSE_CLOSED", function() AH.view = nil end) -- state only, so also in combat
end

-- Listings ------------------------------------------------------------------------------------

-- A time-left band as the game names it, or ours ("" for none); the sell card's listings use it too.
function AH.BandText(band)
  local b = band and AH.TIME_BANDS[band]
  if not b then return "" end
  return _G[b[1]] or b[2]
end

-- Seconds left as "12 h" or "35 min".
local function secondsText(secs)
  if secs >= 3600 then return string.format("%d h", math.floor(secs / 3600)) end
  return string.format("%d min", math.max(1, math.floor(secs / 60)))
end

-- An item listing as a row: its buyout over its quantity, and its time-left band; nil with only a
-- bid, or a number the client hides.
local function itemListing(r)
  local buyout, qty, band = ns.PlainNumber(r.buyoutAmount), ns.PlainNumber(r.quantity), ns.PlainNumber(r.timeLeft)
  if not (buyout and qty) or qty < 1 then return nil end
  return { price = math.floor(buyout / qty), qty = qty, time = band or 0, timeText = AH.BandText(band) }
end

-- A commodity listing as a row: its unit price, quantity and seconds left; nil for a hidden number.
local function commodityListing(r)
  local unit, qty, secs = ns.PlainNumber(r.unitPrice), ns.PlainNumber(r.quantity), ns.PlainNumber(r.timeLeftSeconds)
  if not (unit and qty) then return nil end
  return { price = unit, qty = qty, time = secs or 0, timeText = secs and secondsText(secs) or "" }
end

-- Listing i of the view's item as a row, or nil (unreadable, or above the entry's max price).
local function listing(v, i)
  local r = AH.SearchResultInfo(v.key, v.commodity, i)
  if not r then return nil end
  local row
  if v.commodity then row = commodityListing(r) else row = itemListing(r) end
  if row and not (v.maxPrice and row.price > v.maxPrice) then return row end
end

-- Whether every listing of the view's item is in.
local function hasFull(v)
  if v.commodity then return C_AuctionHouse.HasFullCommoditySearchResults(v.key.itemID) end
  return C_AuctionHouse.HasFullItemSearchResults(v.key)
end

-- Sorts the view's rows by its column (between equals the cheapest, then the fewest, first),
-- reversed when asked.
local function sortListings(v)
  table.sort(v.rows, function(a, b)
    if a[v.sort] == b[v.sort] then return a.price < b.price or (a.price == b.price and a.qty < b.qty) end
    if v.reverse then return a[v.sort] > b[v.sort] end
    return a[v.sort] < b[v.sort]
  end)
end

-- Reads every listing of the view's item the client has, sorted.
function AH.ReadView(v)
  local api, rows = C_AuctionHouse, {}
  local n = v.commodity and api.GetNumCommoditySearchResults(v.key.itemID) or api.GetNumItemSearchResults(v.key)
  for i = 1, ns.PlainNumber(n) or 0 do rows[#rows + 1] = listing(v, i) end
  v.rows, v.full, v.asked, v.searched = rows, hasFull(v), false, true
  sortListings(v)
end

-- Search results for item id (AH.OnSearchEvent): the view's item is read again; the search s in
-- flight is done when it is the view's (its listings, or a page of them).
function AH.OnListings(event, id, s)
  local v = AH.view
  if v and v.key.itemID == id then
    v.commodity = event:find("COMMODITY", 1, true) ~= nil
    AH.ReadView(v)
    AH.PaintShop()
  end
  local key = s and (s.listings or s.page)
  if key and key.itemID == id then AH.Done() end
end

-- Asks for the next page of listings (through the queue, once at a time) when the view is near its
-- last row and the client has more.
local function moreIfNear(v)
  if v.commodity == nil or v.full or v.asked or not AH.shopCard.view.table:NearEnd() then return end
  v.asked = true
  AH.Queue({ page = v.key, commodity = v.commodity })
end

-- The view's table from its top, its first row marked for the keyboard.
local function viewTop()
  local t = AH.shopCard.view.table
  t.offset, t.mark = 0, 1
end

-- Opens the results view for an item key: every listing, searched first in line.
function AH.OpenListings(key, f)
  AH.view = { key = key, rows = {}, sort = "price", reverse = false, maxPrice = f and f.maxPrice }
  viewTop()
  AH.DropQueued("listings")
  AH.DropQueued("page")
  AH.Queue({ listings = key }, true)
  AH.PaintShop()
end

-- Back: the list again, and the view's searches dropped.
function AH.CloseListings()
  AH.view = nil
  AH.DropQueued("listings")
  AH.DropQueued("page")
  AH.PaintShop()
end

-- Sorts by a column; the same column again turns the order round.
function AH.SortListings(column)
  local v = AH.view
  v.reverse = v.sort == column and not v.reverse
  v.sort = column
  viewTop()
  sortListings(v)
  AH.PaintShop()
end

-- A listing opened (clicked, or Enter on the marked one): its item in the game's own list, on its Buy tab, to buy there.
function AH.OpenListing(i)
  local v = AH.view
  if not v.rows[i] then return end
  AH.shopCard.view.table.mark = i
  AH.Queue({ open = v.key }, true)
  AH.ShowInGame()
  AH.PaintShop()
end

-- The view's head: its item, and "searching..." or "none up" while there's no listing to show.
local function paintViewHead(f, v)
  local info = C_AuctionHouse.GetItemKeyInfo(v.key)
  f.icon:SetTexture(info and info.iconFileID or AH.UNKNOWN_ICON)
  f.name:SetText(info and info.itemName or ("item " .. v.key.itemID))
  f.table:SetStatus(#v.rows > 0 and "" or (v.searched and "none up" or "searching..."))
  f.table:SetSort(v.sort, v.reverse)
end

-- A listing's row: unit price, quantity and time left (the item is in the view's head).
local function paintListing(r, l)
  r.icon:SetTexture(nil)
  r.name:SetText("")
  r.cells.price:SetText(AP.Money(l.price))
  r.cells.qty:SetText(tostring(l.qty))
  r.cells.time:SetText(l.timeText)
end

-- The results view in place of the list while it's open (else the list, its toolbar and the heading).
function AH.PaintListings()
  local c, v = AH.shopCard, AH.view
  c.body:SetShown(v == nil)
  c.title:SetShown(v == nil)
  c.view:SetShown(v ~= nil)
  if not v then return end
  paintViewHead(c.view, v)
  c.view.table:SetItems(v.rows)
end

-- The list shown ------------------------------------------------------------------------------

-- What a row shows for an entry: the item's name and icon from its result, else from what the
-- client knows of an item ID, else the name typed.
function AH.EntryLook(entry, found)
  local info, term = found and C_AuctionHouse.GetItemKeyInfo(found.key), AH.Term(entry)
  if info then return info.itemName, info.iconFileID end
  if type(term) ~= "number" then return term, AH.UNKNOWN_ICON end
  local name, _, _, _, _, _, _, _, _, icon = C_Item.GetItemInfo(term)
  return name or ("item " .. term), icon or AH.UNKNOWN_ICON
end

-- A row for one entry: the item, the cheapest price per unit ("none up" after a search found
-- nothing), how many are up, and its max price when a filter sets one.
local function paintRow(r, entry)
  local found = AH.found[entry]
  local name, icon = AH.EntryLook(entry, found)
  local _, f = AH.Term(entry)
  r.name:SetText(name)
  r.icon:SetTexture(icon)
  r.cells.price:SetText(found and AP.Money(found.price) or (found == false and "none up" or ""))
  r.cells.qty:SetText(found and tostring(found.qty) or "")
  r.cells.max:SetText(f and f.maxPrice and AP.Money(f.maxPrice) or "")
  AH.PaintCost(r, entry)
end

-- A row clicked: left opens the results view for its item (the one its search found, or an item
-- ID's own), right opens the row's menu (Filters..., Remove) under it.
function AH.ClickRow(r, button)
  if button == "RightButton" then return AH.RowMenu(r) end
  local found, term, f = AH.found[r.item], AH.Term(r.item)
  local key = found and found.key or (type(term) == "number" and C_AuctionHouse.MakeItemKey(term))
  if key then AH.OpenListings(key, f) end
end

-- The list's status line: how to start while there's no list, or the list is empty.
local function listStatus(items)
  if not AH.CurrentList() then return countLists(AP.Store()) > 0 and "Pick a list in the Lists pane." or "No lists yet: New makes one, Import pastes one." end
  if #items > 0 then return "" end
  return AH.ListKey() == AH.RECENT and "Nothing searched yet." or "+ Add takes an item link, an item ID or a name."
end

-- The list search's progress, "12 of 50", while one runs.
local function listCount()
  local p = AH.progress
  return p and string.format("%d of %d", p.done, p.total) or ""
end

-- What the card shows for a list (the entry picked in the pane): its columns, its items, how a
-- row is painted and what a click does, the count beside the heading, the status line, and that
-- the list buttons apply. Modules/AuctionDeals.lua and Modules/AuctionUpgrades.lua add their own,
-- by their pane keys.
AH.Sources = {}
AH.Sources.list = { columns = AH.LIST_COLUMNS, paint = paintRow, click = AH.ClickRow, count = listCount, status = listStatus, buttons = true,
  items = function() local _, list = AH.CurrentList() return list or {} end }

-- The source of what the card shows now: the entry picked in the pane (a list unless a file adds its own).
function AH.Source()
  return AH.Sources[AH.ListKey()] or AH.Sources.list
end

-- The card's toolbar: the heading names the list (or the source), the count beside it, and the list buttons when they apply.
local function paintToolbar(c, s, items)
  c.title:SetText(AH.CurrentList() or s.name or "Shopping")
  c.progress:SetText(s.count(items))
  for _, b in ipairs({ c.add, c.search, c.restock }) do b:SetShown(s.buttons == true) end
end

-- The source's list on the card: its columns when they change, its rows from the scroll offset,
-- and its status line (every source's is an empty-state line: how to start, or what is missing).
local function paintSource(t, s, items)
  if t.columns ~= s.columns then t:SetColumns(s.columns) end
  t.paintRow = s.paint
  t:SetItems(items)
  t:SetStatus(s.status(items), true)
end

-- The card: the pane, then the source's list, its toolbar, and the results view when one is open.
function AH.PaintShop()
  local c = AH.shopCard
  if not c then return end
  AH.PaintPane()
  local s = AH.Source()
  local items = s.items()
  paintToolbar(c, s, items)
  paintSource(c.body.table, s, items)
  AH.PaintListings()
end

-- The list shown from its top (a list made or picked, Modules/AuctionAPI.lua's searches).
function AH.ShopTop()
  if AH.shopCard then AH.shopCard.body.table.offset = 0 end
end

-- The Lists pane -------------------------------------------------------------------------------

-- The pane's entries, each { key, name, count }: the lists by name, Recent (once something was
-- searched, or while it is shown), then what the other files add (Deals, Upgrades: AH.PANE_EXTRAS,
-- each a function giving an entry or nil).
function AH.PaneEntries()
  local out = {}
  for name, list in pairs(AP.Store().lists) do out[#out + 1] = { key = name, name = name, count = #list } end
  table.sort(out, function(a, b) return a.name < b.name end)
  if #AH.Recent() > 0 or AH.ListKey() == AH.RECENT then out[#out + 1] = { key = AH.RECENT, name = "Recent", count = #AH.Recent() } end
  for _, extra in ipairs(AH.PANE_EXTRAS) do out[#out + 1] = extra() end
  return out
end
AH.PANE_EXTRAS = {}

-- An entry picked in the pane: its list shown from the top (a results view open closes).
function AH.PickEntry(key)
  AP.Store().list = key
  AH.ShopTop()
  if AH.view then return AH.CloseListings() end
  AH.PaintShop()
end

-- A pane row: the entry's name and count, with the row's selected look (W.Row) when it's the one shown.
local function paintPaneRow(r, e)
  r:SetShown(e ~= nil)
  r.entry = e
  if not e then return end
  r.name:SetText(e.name)
  r.count:SetText(e.count > 0 and tostring(e.count) or "")
  r:SetSelected(e.key == AH.ListKey())
end

-- Which actions work now: on a list all six; on Recent new, import, copy, export and delete (as
-- Clear); with nothing shown, new and import.
local function actionsOn()
  if listInUse() then return { [AH.NEW] = true, [AH.RENAME] = true, [AH.COPY] = true, [AH.DELETE] = true, [AH.IMPORT] = true, [AH.EXPORT] = true } end
  local recent = AH.ListKey() == AH.RECENT
  return { [AH.NEW] = true, [AH.IMPORT] = true, [AH.COPY] = recent, [AH.EXPORT] = recent, [AH.DELETE] = recent }
end

-- The action buttons: the ones that work now enabled (the rest muted); Delete reads Clear on Recent.
local function paintActions(p)
  local on = actionsOn()
  for _, b in ipairs(p.actions) do
    if on[b.action] then b:Enable() else b:Disable() end
    T.Color(b.text, on[b.action] and "text" or "disabled")
  end
  p.delete.text:SetText(AH.ListKey() == AH.RECENT and "Clear" or "Delete")
end

-- The pane: its entries from the scroll offset (kept within them), and the actions.
function AH.PaintPane()
  local p = AH.pane
  if not p then return end
  local entries = AH.PaneEntries()
  p.offset = math.max(0, math.min(p.offset, #entries - #p.rows))
  for i, r in ipairs(p.rows) do paintPaneRow(r, entries[p.offset + i]) end
  paintActions(p)
end

-- The wheel over the pane scrolls its entries.
local function scrollPane(p, delta)
  p.offset = math.max(0, p.offset - delta)
  AH.PaintPane()
end

-- Pane row i: a click shows its entry; its name on the left, its count on the right.
local function paneRow(p, i)
  local r = AH.Row(p, i, AH.PANE_ROWS_Y, function(self) if self.entry then AH.PickEntry(self.entry.key) end end)
  r.name = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.name:SetPoint("LEFT", T.SPACE.gap, 0)
  r.name:SetPoint("RIGHT", -40, 0)
  r.name:SetJustifyH("LEFT")
  r.name:SetWordWrap(false)
  r.count = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "text2")
  r.count:SetPoint("RIGHT", -T.SPACE.tight, 0)
  return r
end

-- Action button i at the pane's bottom, three to a row, T.SPACE.tight between them: its action
-- (AH.LIST_ACTIONS) on a click.
local function actionButton(p, i, choice)
  local b = W.Button(p, choice[2], function() AH.LIST_ACTIONS[choice[1]]() end, AH.ACTION_W)
  b.action = choice[1]
  local col, row = (i - 1) % 3, math.floor((i - 1) / 3)
  b:SetPoint("BOTTOMLEFT", p, "BOTTOMLEFT", col * (AH.ACTION_W + T.SPACE.tight), (1 - row) * (T.BUTTON_H + T.SPACE.tight))
  return b
end

-- The Lists pane on a column (h tall): the entries' rows (the wheel scrolls them) and the actions.
function AH.BuildPane(column, h)
  local p = AH.Card(column, "Lists", -AH.PAD, h)
  p.rows, p.offset, p.actions = {}, 0, {}
  for i = 1, AH.PANE_ROWS do p.rows[i] = paneRow(p, i) end
  for i, choice in ipairs(AH.ACTIONS) do p.actions[i] = actionButton(p, i, choice) end
  p.delete = p.actions[4]
  p:EnableMouseWheel(true)
  p:SetScript("OnMouseWheel", scrollPane)
  AH.pane = p
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

-- Filters -----------------------------------------------------------------------------------

-- The dearest price a typed amount may be, in copper: the game's highest price, 999999g 99s 99c.
AH.MAX_PRICE = 9999999999

-- Copper from a typed price: "1g 50s", "75s 20c", "12c" or a bare number of gold ("2.5"); nil for
-- nothing, nothing above zero, more than the game's highest price, or text that isn't money (an
-- exponent such as "1e5", hex such as "0x10" or "inf" is not a number here). Every price box reads
-- it (the shop's max price, the sell card's price and bid), so a bare number is gold in all of them.
-- (The sums are in floating point so a long number can't wrap around as a whole-number sum might.)
function AH.ParseMoney(text)
  text = trim(text):lower()
  local copper = 0
  if text:match("^%d+%.?%d*$") or text:match("^%.%d+$") then
    copper = tonumber(text) * 10000.0
  else
    local rest = text:gsub("(%d+)%s*([gsc])", function(n, unit) copper = copper + (tonumber(n) + 0.0) * AH.MONEY_UNITS[unit] return "" end)
    if trim(rest) ~= "" then return nil end
  end
  if copper > 0 and copper <= AH.MAX_PRICE then return math.floor(copper + 0.5) end
end

-- A level typed into a box: a whole number from 1, else nil.
local function typedLevel(box)
  local n = tonumber(box:GetText() or "")
  if n and n >= 1 then return math.floor(n) end
end

-- The dialog's entry: its term with what the dialog says (the price alert only with a max price),
-- or the bare term without any filter.
local function filteredEntry(d)
  local quality = d.draft.quality ~= AH.ANY and d.draft.quality or nil
  local f = { term = d.term, exact = d.draft.exact or nil, quality = quality, maxPrice = AH.ParseMoney(d.price:GetText()),
    minLevel = typedLevel(d.minLevel), maxLevel = typedLevel(d.maxLevel), want = d.want }
  f.alert = f.maxPrice and d.draft.alert or nil
  if f.exact or f.quality or f.maxPrice or f.minLevel or f.maxLevel or f.want then return f end
  return d.term
end

-- Where entry sits in list now (a row above it may have gone, or Recent moved it), or nil once it is gone.
local function placeOf(list, entry)
  for i, e in ipairs(list) do
    if e == entry then return i end
  end
end

-- Save: the entry the dialog opened on takes its filters (its old row is searched again next time), wherever
-- it sits in its list now; nothing changes once it is off the list.
function AH.SaveFilters()
  local d = AH.filterDialog
  local list = AH.ListByName(d.listName)
  local i = list and placeOf(list, d.entry)
  if i then list[i] = filteredEntry(d) end
  d:Hide()
  AH.PaintShop()
end

-- The filter dialog's layout: rows T.ROW.height tall from ns.DIALOG.head down (a switch row, a choice row, or a
-- caption with its boxes), T.SPACE.pad in from the dialog's sides, as wide as the dialog less both; a caption or
-- a box sits T.SPACE.gap inside a row's edge, level with the labels and the switch of the rows' own. How many
-- rows, the level boxes' and the price box's widths, and a foot button's width.
local FILTER_ROWS, LEVEL_W, PRICE_W, FOOT_BUTTON_W = 5, 44, 120, 80
local ROW_W = AH.FILTER_W - 2 * T.SPACE.pad

-- Row n's top, down from the filter dialog's top.
local function rowTop(n)
  return ns.DIALOG.head + (n - 1) * T.ROW.height
end

-- A row's widget (the switch, the choice) placed at row n.
local function placeRow(widget, n)
  widget:ClearAllPoints()
  widget:SetPoint("TOPLEFT", T.SPACE.pad, -rowTop(n))
  widget:SetWidth(ROW_W)
end

-- A caption on the left of row n of the filter dialog, level with the row's middle.
local function filterCaption(d, text, n)
  local fs = T.Text(d:CreateFontString(nil, "OVERLAY"), "label")
  fs:SetPoint("LEFT", d, "TOPLEFT", T.SPACE.pad + T.SPACE.gap, -(rowTop(n) + T.ROW.height / 2))
  fs:SetText(text)
  return fs
end

-- A box on the filter dialog, its right edge level with the rows' switch and menu, in row n.
local function filterBox(d, width, n)
  local box = W.Input(d, width)
  box:SetPoint("RIGHT", d, "TOPRIGHT", -(T.SPACE.pad + T.SPACE.gap), -(rowTop(n) + T.ROW.height / 2))
  return box
end

-- Level: its caption, then the two boxes with "to" between them, from the right edge in.
local function levelRow(d)
  filterCaption(d, "Level", 2)
  d.maxLevel = filterBox(d, LEVEL_W, 2)
  local to = filterCaption(d, "to", 2)
  to:ClearAllPoints()
  to:SetPoint("RIGHT", d.maxLevel, "LEFT", -T.SPACE.gap, 0)
  d.minLevel = W.Input(d, LEVEL_W)
  d.minLevel:SetPoint("RIGHT", to, "LEFT", -T.SPACE.gap, 0)
end

-- Exact name (row 1) and Quality (row 3): the draft's switch and choice.
local function exactAndQuality(d)
  d.exact = W.Check(d, "Exact name only", function() return d.draft.exact end, function(v) d.draft.exact = v end, ROW_W)
  placeRow(d.exact, 1)
  d.quality = W.Choice(d, "Quality", AH.QUALITIES, function() return d.draft.quality end, function(v) d.draft.quality = v end, ROW_W)
  placeRow(d.quality, 3)
end

-- The filter dialog's rows: exact name, level from and to, quality, max price and the price alert
-- at it (Modules/AuctionAlerts.lua, which builds its row; it goes to row 5 here).
local function filterRows(d)
  exactAndQuality(d)
  levelRow(d)
  filterCaption(d, "Max price", 4)
  d.price = filterBox(d, PRICE_W, 4)
  AH.AlertRow(d)
  placeRow(d.alert, 5)
end

-- The filter dialog's draft (what its switch and choice show), and Save and Cancel along its foot.
local function filterFrame(d)
  d.draft = { exact = false, quality = AH.ANY }
  d.save = W.Primary(d, "Save", function() AH.SaveFilters() end, FOOT_BUTTON_W)
  d.save:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  d.cancel = W.Button(d, "Cancel", function() d:Hide() end, FOOT_BUTTON_W)
  d.cancel:SetPoint("RIGHT", d.save, "LEFT", -T.SPACE.gap, 0)
end

-- The filter dialog, built once: a dialog (ns.Dialog: the dialog alpha, its title, X and Escape) over the
-- auction house, its title (kept short of the X by ns.Dialog) on one line, with Save and Cancel.
local function buildFilters()
  local d = ns.Dialog("Vanguard_AuctionFilters", AH.FILTER_W, ns.DIALOG.head + FILTER_ROWS * T.ROW.height + ns.DIALOG.foot, "Filters")
  d:SetClampedToScreen(true)
  d.title:SetMaxLines(1)
  filterFrame(d)
  filterRows(d)
  AH.filterDialog = d
  return d
end

-- Fills the filter dialog from an entry's filters.
local function fillFilters(d, entry)
  local term, f = AH.Term(entry)
  f = f or {}
  d.term, d.draft, d.want = term, { exact = f.exact == true, quality = f.quality or AH.ANY, alert = f.alert == true }, f.want
  d.title:SetText("Filters: " .. (AH.EntryLook(entry)))
  d.minLevel:SetText(f.minLevel and tostring(f.minLevel) or "")
  d.maxLevel:SetText(f.maxLevel and tostring(f.maxLevel) or "")
  d.price:SetText(f.maxPrice and AP.Money(f.maxPrice) or "")
  d.exact:Refresh()
  d.quality:Refresh()
  d.alert:Refresh()
end

-- Opens the filter dialog for entry i of a list, over the auction house window.
function AH.EditFilters(listName, i)
  local d, list = AH.filterDialog or buildFilters(), AH.ListByName(listName)
  if not (list and list[i] ~= nil) then return end
  d.listName, d.entry = listName, list[i]
  fillFilters(d, list[i])
  d:ClearAllPoints()
  d:SetPoint("CENTER", type(AuctionHouseFrame) == "table" and AuctionHouseFrame or UIParent, "CENTER", 0, 0)
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

-- The card ------------------------------------------------------------------------------------

-- A table under a card's toolbar, the width of the card.
function AH.TableUnder(t, parent)
  t:SetPoint("TOPLEFT", parent, "TOPLEFT", 0, -AH.TOOLBAR_H)
  t:SetPoint("TOPRIGHT", parent, "TOPRIGHT", 0, -AH.TOOLBAR_H)
end

-- A toolbar button, T.CONTROL_H high (level with the heading), right of the last one (or at the card's top right).
function AH.ToolButton(c, text, onClick, width, after)
  local b = W.Button(c.body, text, onClick, width)
  b:SetHeight(T.CONTROL_H)
  if after then b:SetPoint("RIGHT", after, "LEFT", -T.SPACE.tight, 0) else b:SetPoint("TOPRIGHT", 0, 2) end
  return b
end

-- The card's toolbar: the count or progress beside the heading, and the list buttons on the right:
-- + Add, Search list and Restock (Modules/AuctionRestock.lua).
local function toolbar(c)
  c.progress = T.Text(c.body:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.progress:SetPoint("LEFT", c.title, "RIGHT", T.SPACE.gap, 0)
  c.add = AH.ToolButton(c, "+ Add", function() ns.AskText("Add to list", function(text) AH.AddEntry(text) end, "Add") end, 70)
  c.search = AH.ToolButton(c, "Search list", function() AH.SearchList() end, 100, c.add)
  AH.BuildRestock(c)
end

-- A click on a row: whatever the card shows (its source) answers it.
local function clickSource(r, button)
  AH.Source().click(r, button)
end

-- The mouse over a row: the source's tooltip, when it has one.
local function enterSource(r)
  local s = AH.Source()
  if s.enter then s.enter(r) end
end

-- The mouse off a row: the tooltip goes.
local function leaveSource()
  GameTooltip:Hide()
end

-- The view's top line: Back, then the item's icon and name.
local function viewHead(f)
  f.back = W.Button(f, "Back", function() AH.CloseListings() end, 60)
  f.back:SetHeight(T.CONTROL_H)
  f.back:SetPoint("TOPLEFT", 0, 2)
  f.icon = T.Crop(f:CreateTexture(nil, "ARTWORK"))
  f.icon:SetSize(16, 16)
  f.icon:SetPoint("LEFT", f.back, "RIGHT", T.SPACE.gap, 0)
  f.name = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading")
  f.name:SetPoint("LEFT", f.icon, "RIGHT", T.SPACE.tight, 0)
  f.name:SetPoint("RIGHT", f, "RIGHT", 0, 0)
  f.name:SetWordWrap(false)
end

-- The results view in the list's place (over the whole card), hidden until a row opens it: Back
-- and the item, then the listings' table, which takes the keyboard while the mouse is over it.
local function buildView(c)
  local f = CreateFrame("Frame", nil, c)
  f:SetAllPoints()
  viewHead(f)
  f.table = AH.Table(f, AH.VIEW_COLUMNS, AH.VIEW_ROWS, { keys = true, paintRow = paintListing, onOpen = AH.OpenListing, onSort = AH.SortListings,
    onClick = function(r) AH.OpenListing(r.index) end, onNear = function() if AH.view then moreIfNear(AH.view) end end })
  AH.TableUnder(f.table, f)
  f:Hide()
  c.view = f
end

-- The Shopping card (h tall): the toolbar and the list's table (in c.body, which the results view
-- takes the place of), a row's menu (a hidden dropdown that opens the dropdown menu under the
-- row right-clicked), and the results view.
function AH.BuildShop(f, h)
  local c = AH.Card(f, "Shopping", -AH.PAD, h)
  c.body = CreateFrame("Frame", nil, c)
  c.body:SetAllPoints()
  AH.shopCard = c
  toolbar(c)
  c.body.table = AH.Table(c.body, AH.LIST_COLUMNS, AH.SHOP_ROWS, { paintRow = paintRow, onClick = clickSource, onEnter = enterSource, onLeave = leaveSource })
  AH.TableUnder(c.body.table, c.body)
  c.rowMenu = W.Dropdown(c, AH.ROW_CHOICES, function() end, AH.RowAction, 120)
  c.rowMenu:Hide()
  buildView(c)
end
