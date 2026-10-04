-- Auction helper: a ForeverUI panel docked to the left of the game's auction
-- house window.
--   * Shop: named shopping lists (items by ID or by name); "Search list" runs
--     the list's searches one after another (one in flight, at most 60 a
--     minute) and each row shows the item's cheapest price per unit and how
--     many are up; clicking a row shows that item in the game's own list, so
--     buying stays in the game's hands.
--   * Sell: drop an item on the card (or pick one in the game's sell frame:
--     the card takes the item the game's window is given) and it shows the
--     cheapest price someone else asks now, the 7-day low from your scans,
--     the deposit, and the price to ask (undercut by 1 copper, 1 silver, 1 %,
--     or matched); Post lists it, from the button's click only.
--   * Your auctions: "Check undercuts" asks for your auctions, checks each
--     item's price now, and marks the ones someone else asks less for; each
--     row's Cancel (its cost on hover) cancels that auction, from the click only.
--   * Scan: "Scan the auction house" (once every 15 minutes, the game's own
--     limit for a whole-house query) reads every listing and records each
--     item's cheapest unit price (Modules/AuctionPrices.lua), which item
--     tooltips then show everywhere.
--
-- The game's auction house is the modern one (C_AuctionHouse) on WoW Forever.
-- Nothing here touches the game's auction frames: the panel only anchors to
-- the window, and the only hook is a post-hook on its SetPostItem that reads
-- the item it was given. Posting and cancelling run only inside a button's
-- click, and a post the game wants confirmed is left to the game. Every price and
-- quantity goes through ns.PlainNumber before any arithmetic, and events are
-- ignored in combat (the house closes then).

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices

local AH = ns.Module("AuctionHelper", { defaults = { panel = true, tooltip = true, undercut = "silver", scanButton = true } })

-- Seconds between scans, listings read per frame of a scan; the panel's width, padding and gap
-- to the window; where the scan card starts (down from the panel's top) and its height.
AH.SCAN_GAP, AH.SCAN_ROWS = 900, 400
AH.WIDTH, AH.PAD, AH.GAP, AH.SCAN_Y, AH.SCAN_H = 280, 8, 4, -354, 168
-- Searches: seconds between two (at most 60 a minute), and how long one waits for its results.
AH.SEND_GAP, AH.FALLBACK = 1, 2
-- The shop card: where it starts and its height, its rows (how many, from where, how tall).
AH.SHOP_Y, AH.SHOP_H, AH.SHOP_ROWS, AH.SHOP_ROWS_Y, AH.ROW_H = -8, 196, 6, -74, 20
-- Shopping lists: how many, entries per list, the list "+ Add" starts, the dropdown's "New list..." value.
AH.MAX_LISTS, AH.MAX_ENTRIES, AH.DEFAULT_LIST, AH.NEW = 20, 50, "Shopping", "\1new"
AH.UNKNOWN_ICON = "Interface\\Icons\\INV_Misc_QuestionMark"
-- The sell card: where it starts and its height, and its lines.
AH.SELL_Y, AH.SELL_H = -210, 136
AH.SELL_LINES = { "Cheapest now", "7-day low", "Deposit", "Your price" }
-- Enum.ItemCommodityStatus's Item and Commodity (AuctionHouseDocumentation.lua); the game's
-- names for the three auction lengths (AUCTION_DURATION_ONE...).
AH.ITEM, AH.COMMODITY, AH.DURATIONS = 1, 2, { "ONE", "TWO", "THREE" }
-- The undercut rules as the sell card's segments.
AH.UNDERCUT_CHOICES = { { "copper", "1c" }, { "silver", "1s" }, { "percent", "1%" }, { "match", "Match" } }
-- Your auctions: rows under the scan line (how many, from where), and Enum.AuctionStatus.Active.
AH.OWNED_ROWS, AH.OWNED_ROWS_Y, AH.ACTIVE = 4, -64, 0

-- Helpers ------------------------------------------------------------------------------------

-- Runs fn on an event, unless in combat (the auction house closes in combat).
local function on(event, fn)
  ns.On(event, function(...) if not ns.InCombat() then fn(...) end end)
end

-- A one-pixel divider line just above a card.
local function divider(c)
  c.rule = W.Flat(c, "ARTWORK", "divider")
  c.rule:SetPoint("BOTTOMLEFT", c, "TOPLEFT", 0, AH.PAD / 2)
  c.rule:SetPoint("BOTTOMRIGHT", c, "TOPRIGHT", 0, AH.PAD / 2)
  c.rule:SetHeight(T.Pixel(c))
end

-- A card on the panel: a heading, from y (down from the panel's top), h units tall, with a
-- divider line above it.
local function card(f, title, y, h)
  local c = CreateFrame("Frame", nil, f)
  c:SetPoint("TOPLEFT", f, "TOPLEFT", AH.PAD, y)
  c:SetPoint("TOPRIGHT", f, "TOPRIGHT", -AH.PAD, y)
  c:SetHeight(h)
  c.title = T.Text(c:CreateFontString(nil, "OVERLAY"), "heading")
  c.title:SetPoint("TOPLEFT")
  c.title:SetText(title)
  divider(c)
  return c
end

-- Searches -----------------------------------------------------------------------------------

-- Sends one search: a list entry (an item ID by its item key, a name by text), an item to open
-- in the game's own list, an item's price check (a sell search) or your auctions; always cheapest first.
function AH.Send(s)
  local api = C_AuctionHouse
  if s.sell then return api.SendSellSearchQuery(s.sell, AH.SORTS, true) end
  if s.owned then return api.QueryOwnedAuctions(AH.SORTS) end
  if s.open then return api.SearchForItemKeys({ s.open }, AH.SORTS) end
  if type(s.entry) == "number" then return api.SearchForItemKeys({ api.MakeItemKey(s.entry) }, AH.SORTS) end
  api.SendBrowseQuery({ searchString = s.entry, sorts = AH.SORTS, filters = {}, itemClassFilters = {} })
end

-- Waits until AH.SEND_GAP has passed since the last search, then tries the next (one timer at a time).
local function sendLater(wait)
  if AH.waiting then return end
  AH.waiting = true
  C_Timer.After(wait, function() AH.waiting = false AH.Next() end)
end

-- Sends the next queued search: one in flight at a time, and AH.SEND_GAP seconds apart (at most
-- 60 a minute, well under the client's 100). The one after follows its results, or AH.FALLBACK seconds.
function AH.Next()
  if AH.pending or #AH.queue == 0 or not AH.open then return end
  local wait = AH.lastSent + AH.SEND_GAP - GetTime()
  if wait > 0 then return sendLater(wait) end
  local s = table.remove(AH.queue, 1)
  AH.pending, AH.lastSent = s, GetTime()
  AH.Send(s)
  C_Timer.After(AH.FALLBACK, function() if AH.pending == s then AH.Done() end end)
end

-- Queues a search (first in line when asked) and sends it if nothing is in flight.
function AH.Queue(search, first)
  table.insert(AH.queue, first and 1 or #AH.queue + 1, search)
  AH.Next()
end

-- The search in flight is answered (or gave up waiting): count a list entry, and send the next.
function AH.Done()
  local s = AH.pending
  AH.pending = nil
  if s.entry and AH.progress then AH.progress.done = AH.progress.done + 1 end
  AH.PaintShop()
  AH.Next()
end

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

-- Drops the queued searches of one kind ("entry", "sell"...).
local function dropQueued(kind)
  local kept = {}
  for _, s in ipairs(AH.queue) do if not s[kind] then kept[#kept + 1] = s end end
  AH.queue = kept
end

-- Search list: every entry of the list in use, one search at a time.
function AH.SearchList()
  local _, list = AH.CurrentList()
  if not list or #list == 0 then return ns.Chat("Add items to a shopping list first (+ Add, or /fui ah add <list> <item>).") end
  dropQueued("entry")
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

-- Browse results: the list entry in flight takes its row; an item opened in the game's list is done.
local function onBrowse()
  local s = AH.pending
  if not (s and (s.entry or s.open)) then return end
  if s.entry then AH.found[s.entry] = AH.BestResult(s.entry, C_AuctionHouse.GetBrowseResults()) end
  AH.Done()
end

-- The shop card -------------------------------------------------------------------------------

-- What a row shows for an entry: the item's name and icon from its result, else from what the
-- client knows of an item ID, else the name typed.
local function entryLook(entry, found)
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
  local name, icon = entryLook(entry, found)
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

-- A string of a row in a text role and color, at the row's right edge less x.
local function rowText(r, role, color, x)
  local fs = T.Text(r:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetPoint("RIGHT", x, 0)
  return fs
end

-- A row's icon (16 px), name, count and price.
local function rowParts(r)
  r.icon = T.Crop(r:CreateTexture(nil, "ARTWORK"))
  r.icon:SetSize(16, 16)
  r.icon:SetPoint("LEFT", 2, 0)
  r.name = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.name:SetPoint("LEFT", r.icon, "RIGHT", 4, 0)
  r.name:SetPoint("RIGHT", r, "RIGHT", -124, 0)
  r.name:SetWordWrap(false)
  r.price, r.qty = rowText(r, "number", "gold", -2), rowText(r, "small", "text2", -78)
end

-- Result row i of a card, AH.ROW_H tall from y, with a hover wash; it takes both mouse buttons.
local function row(c, i, y, onClick)
  local r = CreateFrame("Button", nil, c)
  r:SetHeight(AH.ROW_H)
  r:SetPoint("TOPLEFT", 0, y - (i - 1) * AH.ROW_H)
  r:SetPoint("TOPRIGHT", 0, y - (i - 1) * AH.ROW_H)
  W.Flat(r, "HIGHLIGHT", "hover"):SetAllPoints()
  r:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  r:SetScript("OnClick", onClick)
  return r
end

-- The dropdown's choices: the lists by name, then "New list...".
local function listChoices()
  local out = {}
  for name in pairs(AP.Store().lists) do out[#out + 1] = { name, name } end
  table.sort(out, function(a, b) return a[1] < b[1] end)
  out[#out + 1] = { AH.NEW, "New list..." }
  return out
end

-- A list picked in the dropdown: that one (from its top), or a name asked for a new one.
local function pickList(v)
  if v == AH.NEW then return ns.AskText("New shopping list", AH.NewList, "Create") end
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
    c.rows[i] = row(c, i, AH.SHOP_ROWS_Y, AH.ClickRow)
    rowParts(c.rows[i])
  end
  c:EnableMouseWheel(true)
  c:SetScript("OnMouseWheel", scrollShop)
end

-- The shop card: the list dropdown, + Add, Search list with its progress line, and the rows.
local function buildShop(f)
  local c = card(f, "Shop", AH.SHOP_Y, AH.SHOP_H)
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

-- Selling ------------------------------------------------------------------------------------

-- The undercut rules, on the price to beat: 1 copper, 1 silver (never below 1 silver unless the
-- price already is), 1 % (rounded down), or the same price.
AH.UNDERCUT = {
  -- 1 copper less.
  copper = function(p) return p - 1 end,
  -- 1 silver less, floored at 1 silver.
  silver = function(p) return math.max(p - 100, math.min(p, 100)) end,
  -- 1 % less.
  percent = function(p) return math.floor(p * 0.99) end,
  -- The same price.
  match = function(p) return p end,
}

-- The price to ask: the cheapest now (else the 7-day low) less the undercut, at least 1 copper;
-- nil with neither. Without copper prices it rounds up to whole silver, as the game's sell frame does.
function AH.Suggest(cheapest, low7)
  local base = cheapest or low7
  if not base then return nil end
  local price = math.max(1, (AH.UNDERCUT[AH.settings.undercut] or AH.UNDERCUT.silver)(base))
  if not C_AuctionHouse.SupportsCopperValues() then price = math.ceil(price / 100) * 100 end
  return price
end

-- The auction length the game's sell frame last used (its CVar, 1 to 3), and the game's name for it.
function AH.Duration()
  local d = tonumber(GetCVar("auctionHouseDurationDropdown") or "")
  d = d and d >= 1 and d <= 3 and math.floor(d) or 1
  return d, _G["AUCTION_DURATION_" .. AH.DURATIONS[d]] or ("duration " .. d)
end

-- The deposit for posting the card's item for duration d (rounded up to silver without copper prices), or nil.
local function deposit(s, d)
  local api = C_AuctionHouse
  local copper = s.commodity and api.CalculateCommodityDeposit(s.id, d, s.qty) or api.CalculateItemDeposit(s.loc, d, s.qty)
  copper = ns.PlainNumber(copper)
  if copper and not api.SupportsCopperValues() then copper = math.ceil(copper / 100) * 100 end
  return copper
end

-- One result's unit price: a commodity's unit price, an item's buyout over its quantity; nil
-- for your own listing, one with only a bid, or a number the client hides.
local function unitPrice(r, commodity)
  if not r or r.containsOwnerItem then return nil end
  if commodity then return ns.PlainNumber(r.unitPrice) end
  local buyout, qty = ns.PlainNumber(r.buyoutAmount), ns.PlainNumber(r.quantity)
  return buyout and qty and qty > 0 and math.floor(buyout / qty) or nil
end

-- The cheapest unit price someone else asks for an item now (your listings left out), or nil:
-- from the commodity results or the item results, whichever the search brought.
function AH.Cheapest(commodity, key)
  local api, best = C_AuctionHouse, nil
  local n = commodity and api.GetNumCommoditySearchResults(key.itemID) or api.GetNumItemSearchResults(key)
  for i = 1, ns.PlainNumber(n) or 0 do
    local r = commodity and api.GetCommoditySearchResultInfo(key.itemID, i) or api.GetItemSearchResultInfo(key, i)
    local unit = unitPrice(r, commodity)
    if unit and (not best or unit < best) then best = unit end
  end
  return best
end

-- Puts an item on the sell card (when the house takes it and the client knows whether it's a
-- commodity: a commodity sells the stack, an item one at a time) and checks its price now.
function AH.TakeItem(loc)
  local api = C_AuctionHouse
  if not (AH.sellCard and loc and loc:IsValid() and api.IsSellItemValid(loc, false)) then return end
  local status = api.GetItemCommodityStatus(loc)
  if status ~= AH.ITEM and status ~= AH.COMMODITY then return end
  local key, commodity = api.GetItemKeyFromItem(loc), status == AH.COMMODITY
  AH.sell = { loc = loc, id = key.itemID, commodity = commodity, qty = commodity and ns.PlainNumber(C_Item.GetStackCount(loc)) or 1 }
  AH.Queue({ sell = api.MakeItemKey(key.itemID), card = true }, true)
  AH.PaintSell()
end

-- An item dropped on (or clicked onto) the sell slot: it goes back to its bag and onto the card.
function AH.TakeCursor()
  local loc = C_Cursor.GetCursorItem()
  if not loc then return end
  ClearCursor()
  AH.TakeItem(loc)
end

-- Search results for an item: the price check in flight (the sell card's, or your auctions') takes the cheapest.
local function onSearchResults(event, arg)
  local s, commodity = AH.pending, event == "COMMODITY_SEARCH_RESULTS_UPDATED"
  local id = type(arg) == "table" and arg.itemID or arg
  if not (s and s.sell and s.sell.itemID == id) then return end
  local cheapest = AH.Cheapest(commodity, s.sell)
  if s.card and AH.sell and AH.sell.id == id then AH.sell.cheapest, AH.sell.searched = cheapest, true end
  if s.check then AH.MarkUndercuts(id, cheapest, commodity) end
  AH.Done()
  AH.PaintSell()
end

-- Copper as money text, or `none` without a value.
local function money(copper, none)
  return copper and AP.Money(copper) or none
end

-- The sell card's lines for its item: the cheapest now ("none up" after a search found none),
-- the 7-day low, the deposit with the duration, and the price it will ask (nil: unknown).
local function sellValues(s)
  local low7, d, label = AP.Low7(s.id), AH.Duration()
  local price, dep = AH.Suggest(s.cheapest, low7), deposit(s, d)
  local now = money(s.cheapest, s.searched and "none up" or "...")
  return { now, money(low7, "none"), dep and (AP.Money(dep) .. " · " .. label) or "", money(price, "") }, price
end

-- The sell card: the item's icon and lines, and Post, which works only with a price while the
-- game's message throttle is ready.
function AH.PaintSell()
  local c, s = AH.sellCard, AH.sell
  if not c then return end
  local values, price = {}, nil
  if s then values, price = sellValues(s) end
  c.icon:SetTexture(s and C_Item.GetItemIcon(s.loc) or nil)
  for i, line in ipairs(c.lines) do line.value:SetText(values[i] or "") end
  local ready = price ~= nil and C_AuctionHouse.IsThrottledMessageSystemReady()
  if ready then c.post:Enable() else c.post:Disable() end
end

-- Post (the button's click, never a timer or an event): lists the card's item at the suggested
-- price for the game's duration. A true answer means the game wants the post confirmed: that is
-- the game's to ask, so the card says so and keeps the item.
function AH.Post()
  local s = AH.sell
  local price = s and AH.Suggest(s.cheapest, AP.Low7(s.id))
  if not price or not C_AuctionHouse.IsThrottledMessageSystemReady() then return end
  local d, api, confirm = AH.Duration(), C_AuctionHouse
  if s.commodity then confirm = api.PostCommodity(s.loc, d, s.qty, price) else confirm = api.PostItem(s.loc, d, 1, nil, price) end
  if confirm then return ns.Chat("The game wants this price confirmed: list it from the game's own Sell tab.") end
  AH.sell = nil
  AH.PaintSell()
end

-- The sell card's lines: a label on the left of the space beside the slot, its value on the right.
local function sellLines(c)
  c.lines = {}
  for i, label in ipairs(AH.SELL_LINES) do
    local l = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
    l:SetPoint("TOPLEFT", 44, -20 - (i - 1) * 14)
    l:SetText(label)
    l.value = T.Text(c:CreateFontString(nil, "OVERLAY"), i == #AH.SELL_LINES and "number" or "small", i == #AH.SELL_LINES and "accent" or "text")
    l.value:SetPoint("TOPRIGHT", 0, -20 - (i - 1) * 14)
    c.lines[i] = l
  end
end

-- The sell slot: drop an item on it (or click with one on the cursor).
local function sellSlot(c)
  c.slot = T.Slot(CreateFrame("Button", nil, c))
  c.slot:SetSize(36, 36)
  c.slot:SetPoint("TOPLEFT", 0, -20)
  c.slot:SetScript("OnReceiveDrag", AH.TakeCursor)
  c.slot:SetScript("OnClick", AH.TakeCursor)
  c.icon = T.Crop(c.slot:CreateTexture(nil, "ARTWORK"))
  c.icon:SetPoint("TOPLEFT", 2, -2)
  c.icon:SetPoint("BOTTOMRIGHT", -2, 2)
end

-- The undercut rule (live), and the card repainted with it.
local function undercutRow(c)
  c.undercut = W.Choice(c, "Undercut by", AH.UNDERCUT_CHOICES, function() return AH.settings.undercut end,
    function(v) AH.settings.undercut = v AH.PaintSell() end, AH.WIDTH - 2 * AH.PAD)
  c.undercut:SetPoint("TOPLEFT", 0, -78)
end

-- The sell card: the slot, its lines, the undercut rule and Post.
local function buildSell(f)
  local c = card(f, "Sell", AH.SELL_Y, AH.SELL_H)
  sellSlot(c)
  sellLines(c)
  undercutRow(c)
  c.post = W.Primary(c, "Post", function() AH.Post() end, 120)
  c.post:SetPoint("TOPRIGHT", 0, -110)
  AH.sellCard = c
  hooksecurefunc(AuctionHouseFrame, "SetPostItem", function(_, loc) AH.TakeItem(loc) end)
end

-- Your auctions ------------------------------------------------------------------------------

-- One of your auctions as a row's data, or nil (sold, no buyout, or a number the client hides).
-- Its price per unit: the buyout for a commodity (priced per unit), else the buyout over the quantity.
local function ownedAuction(a)
  local buyout, qty, id = ns.PlainNumber(a.buyoutAmount), ns.PlainNumber(a.quantity), ns.PlainNumber(a.auctionID)
  if a.status ~= AH.ACTIVE or not (buyout and qty and id) or qty < 1 then return nil end
  local info = C_AuctionHouse.GetItemKeyInfo(a.itemKey)
  local unit = info and info.isCommodity and buyout or math.floor(buyout / qty)
  return { id = id, key = a.itemKey, buyout = buyout, qty = qty, unit = unit }
end

-- Your active auctions with a buyout.
function AH.ReadOwned()
  local out = {}
  for _, a in ipairs(C_AuctionHouse.GetOwnedAuctions() or {}) do out[#out + 1] = ownedAuction(a) end
  return out
end

-- Check undercuts: asks for your auctions (their prices are checked when they come in).
function AH.CheckUndercuts()
  AH.Queue({ owned = true })
end

-- Your auctions came in: kept and shown; after Check undercuts, each item's price is checked.
local function onOwned()
  local s, seen = AH.pending, {}
  AH.owned = AH.ReadOwned()
  AH.PaintOwned()
  if not (s and s.owned) then return end
  for _, a in ipairs(AH.owned) do
    if not seen[a.key.itemID] then seen[a.key.itemID] = true AH.Queue({ sell = C_AuctionHouse.MakeItemKey(a.key.itemID), check = true }) end
  end
  AH.Done()
end

-- An item's price check answered: each of your auctions of it is undercut when someone else
-- asks less per unit (a commodity's buyout is per unit, an item's per auction).
function AH.MarkUndercuts(id, cheapest, commodity)
  for _, a in ipairs(AH.owned) do
    if a.key.itemID == id then
      a.unit = commodity and a.buyout or math.floor(a.buyout / a.qty)
      a.undercut = cheapest ~= nil and cheapest < a.unit
    end
  end
  AH.PaintOwned()
end

-- Cancel (the row's click, never a timer or an event): cancels one of your auctions if the game allows it.
function AH.Cancel(id)
  if id and C_AuctionHouse.CanCancelAuction(id) then C_AuctionHouse.CancelAuction(id) end
end

-- An auction was cancelled: its row goes.
local function onCanceled(_, id)
  for i, a in ipairs(AH.owned) do
    if a.id == id then table.remove(AH.owned, i) break end
  end
  AH.PaintOwned()
end

-- Cancel's tooltip: what cancelling costs.
local function cancelTip(b)
  local cost = ns.PlainNumber(C_AuctionHouse.GetCancelCost(b:GetParent().id))
  GameTooltip:SetOwner(b, "ANCHOR_RIGHT")
  GameTooltip:SetText("Cancel this auction")
  if cost then GameTooltip:AddLine("Costs " .. AP.Money(cost), T.RGB("text2")) end
  GameTooltip:Show()
end

-- An auction's row: a red mark when undercut, the item, your price per unit, and Cancel.
local function paintOwnedRow(r, a)
  r:SetShown(a ~= nil)
  if not a then return end
  local info = C_AuctionHouse.GetItemKeyInfo(a.key)
  r.id = a.id
  r.mark:SetShown(a.undercut == true)
  r.icon:SetTexture(info and info.iconFileID or AH.UNKNOWN_ICON)
  r.name:SetText(info and info.itemName or ("item " .. a.key.itemID))
  r.price:SetText(a.unit and AP.Money(a.unit) or "")
end

-- Your auctions under the scan card, from the scroll offset.
function AH.PaintOwned()
  local c = AH.scanCard
  if not c then return end
  for i, r in ipairs(c.owned) do paintOwnedRow(r, AH.owned[c.offset + i]) end
end

-- An auction row's Cancel, with what cancelling costs on hover.
local function cancelButton(r)
  local b = W.Button(r, "Cancel", function(self) AH.Cancel(self:GetParent().id) end, 60)
  b:SetHeight(18)
  b:SetPoint("RIGHT", 0, 0)
  b:SetScript("OnEnter", cancelTip)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return b
end

-- An auction row's parts: the undercut mark, icon, name, price and Cancel.
local function ownedParts(r)
  r.mark = W.Flat(r, "ARTWORK", "bad")
  r.mark:SetSize(6, 6)
  r.mark:SetPoint("LEFT", 0, 0)
  rowParts(r)
  r.icon:SetPoint("LEFT", 10, 0)
  r.price:SetPoint("RIGHT", -64, 0)
  r.cancel = cancelButton(r)
end

-- The wheel over your auctions scrolls them.
local function scrollOwned(c, delta)
  c.offset = math.max(0, math.min(#AH.owned - #c.owned, c.offset - delta))
  AH.PaintOwned()
end

-- Check undercuts and the rows of your auctions under the scan line.
local function ownedRows(c)
  c.check = W.Button(c, "Check undercuts", function() AH.CheckUndercuts() end, 120)
  c.check:SetPoint("TOPRIGHT", 0, -20)
  c.owned, c.offset = {}, 0
  for i = 1, AH.OWNED_ROWS do
    c.owned[i] = row(c, i, AH.OWNED_ROWS_Y)
    ownedParts(c.owned[i])
  end
  c:EnableMouseWheel(true)
  c:SetScript("OnMouseWheel", scrollOwned)
end

-- The panel ----------------------------------------------------------------------------------

-- The scan card: the scan button and when the last scan was, Check undercuts and your auctions.
local function buildScan(f)
  local c = card(f, "Scan and your auctions", AH.SCAN_Y, AH.SCAN_H)
  c.scan = W.Button(c, "Scan the auction house", function() AH.StartScan() end, 150)
  c.scan:SetPoint("TOPLEFT", 0, -20)
  c.last = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.last:SetPoint("TOPLEFT", 0, -50)
  AH.scanCard = c
  ownedRows(c)
end

-- The panel beside the auction house window (as tall as it), built the first time the window shows.
function AH.Build()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_AuctionPanel", UIParent), { shadow = true })
  f:SetWidth(AH.WIDTH)
  f:SetPoint("TOPRIGHT", AuctionHouseFrame, "TOPLEFT", -AH.GAP, 0)
  f:SetPoint("BOTTOMRIGHT", AuctionHouseFrame, "BOTTOMLEFT", -AH.GAP, 0)
  f:EnableMouse(true)
  AH.frame = f
  buildShop(f)
  buildSell(f)
  buildScan(f)
  return f
end

-- The auction house opened: the panel shows (built the first time), unless switched off.
function AH.OnShow()
  AH.open = true
  if not AH.settings.panel or type(AuctionHouseFrame) ~= "table" then return end
  local f = AH.frame or AH.Build()
  f:Show()
  AH.PaintShop()
  AH.PaintSell()
  AH.PaintScan()
  AH.PaintOwned()
end

-- The auction house closed: the panel hides, and searches waiting and a scan in progress stop.
function AH.OnClosed()
  AH.open, AH.scan, AH.pending, AH.queue, AH.progress, AH.sell = false, nil, nil, {}, nil, nil
  AH.walker:Hide()
  if AH.frame then AH.frame:Hide() end
end

-- Scan ---------------------------------------------------------------------------------------

-- "last scan 12 min ago", "scanning 400 of 12000", or "no scan yet"; the button with its switch.
function AH.PaintScan()
  local c, s, last = AH.scanCard, AH.scan, AP.Store().lastScan
  if not c then return end
  c.scan:SetShown(AH.settings.scanButton)
  if s then return c.last:SetText(string.format("scanning %d of %d", s.next, s.total or 0)) end
  c.last:SetText(last > 0 and string.format("last scan %d min ago", math.floor((AP.Now() - last) / 60)) or "no scan yet")
end

-- Asks the house for every listing (ReplicateItems), at most once every AH.SCAN_GAP seconds; the
-- rows are read once REPLICATE_ITEM_LIST_UPDATE says they're in.
function AH.StartScan()
  local wait = AP.Store().lastScan + AH.SCAN_GAP - AP.Now()
  AH.PaintScan()
  if not AH.open then return ns.Chat("Open the auction house to scan it.") end
  if AH.scan or wait > 0 then return ns.Chat(string.format("One auction house scan every 15 minutes: the next in %d min.", math.ceil(wait / 60))) end
  AH.scan = { next = 0, best = {} }
  AP.Store().lastScan = AP.Now()
  C_AuctionHouse.ReplicateItems()
  AH.PaintScan()
end

-- The listings are in: walk them, AH.SCAN_ROWS per frame.
local function onReplicate()
  if not AH.scan or AH.scan.total then return end
  AH.scan.total = ns.PlainNumber(C_AuctionHouse.GetNumReplicateItems()) or 0
  AH.walker:Show()
end

-- Listing i (0-based): its unit price (buyout over count) against its item's cheapest so far;
-- skipped without a buyout or when the client hides a number.
function AH.ScanRow(s, i)
  local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, id = C_AuctionHouse.GetReplicateItemInfo(i)
  count, buyout, id = ns.PlainNumber(count), ns.PlainNumber(buyout), ns.PlainNumber(id)
  if not (count and buyout and id) or count < 1 or buyout < 1 then return end
  local unit = math.floor(buyout / count)
  s.best[id] = math.min(s.best[id] or unit, unit)
end

-- One frame of the scan: the next AH.SCAN_ROWS listings; after the last, the prices are recorded.
function AH.ScanStep()
  local s = AH.scan
  local last = math.min(s.next + AH.SCAN_ROWS, s.total) - 1
  for i = s.next, last do AH.ScanRow(s, i) end
  s.next = last + 1
  AH.PaintScan()
  if s.next >= s.total then AH.FinishScan() end
end

-- The whole list is read: each item's cheapest unit price goes in the price store.
function AH.FinishScan()
  local s, now, n = AH.scan, AP.Now(), 0
  for id, unit in pairs(s.best) do AP.Record(id, unit, now) n = n + 1 end
  AH.scan = nil
  AH.walker:Hide()
  ns.Chat(string.format("Auction house scanned: %d listings, prices for %d items.", s.total, n))
  AH.PaintScan()
end

-- Slash command ------------------------------------------------------------------------------

-- A list's entries by name, for chat.
local function entryNames(list)
  local names = {}
  for i, entry in ipairs(list) do names[i] = (entryLook(entry)) end
  return table.concat(names, ", ")
end

-- /fui ah list [name]: picks (or makes) a list, and says what's on the list in use.
function AH.ListCommand(arg)
  if arg ~= "" and not AH.NewList(arg) then return end
  local name, list = AH.CurrentList()
  if not name then return ns.Chat("No shopping lists yet: /fui ah list <name> makes one.") end
  ns.Chat(string.format("Shopping list %s (%d): %s", name, #list, #list > 0 and entryNames(list) or "empty"))
end

-- /fui ah add <list> <item>: the list is the longest list name the words start with, else the first word.
function AH.AddCommand(arg)
  local best
  for name in pairs(AP.Store().lists) do
    if arg:sub(1, #name + 1) == name .. " " and #name > #(best or "") then best = name end
  end
  local list = best or arg:match("^(%S+)") or ""
  AH.AddEntry(arg:sub(#list + 2), list)
end

-- /fui ah's words: list, add, scan, and prices clear.
AH.COMMANDS = {
  -- Picks or makes a list.
  list = function(arg) AH.ListCommand(arg) end,
  -- Adds to a list.
  add = function(arg) AH.AddCommand(arg) end,
  -- Scans the auction house.
  scan = function() AH.StartScan() end,
  -- Forgets every price.
  prices = function(arg)
    if arg ~= "clear" then return AH.Status() end
    local store = AP.Store()
    store.prices, store.count = {}, 0
    ns.Chat("Forgot every auction price.")
  end,
}

-- What the helper knows: how many prices, and the last scan.
function AH.Status()
  local store = AP.Store()
  local last = store.lastScan > 0 and AP.Ago(store.lastScan) or "never"
  ns.Chat(string.format("Auction prices for %d item(s); last scan: %s. /fui ah list <name>, add <list> <item>, scan (at the auction house), prices clear.", store.count, last))
end

-- /fui ah [list <name>|add <list> <item>|scan|prices clear].
function AH.Command(rest)
  if not AH.settings then return ns.Chat("The auction helper is off (/fui > Modules).") end
  local word, arg = (rest or ""):match("^(%S*)%s*(.-)%s*$")
  local fn = AH.COMMANDS[word:lower()]
  if fn then return fn(arg) end
  AH.Status()
end

-- The helper's state: searches sorted cheapest first, nothing queued or found, and the scan's frame walker.
function AH.Start()
  local order = Enum.AuctionHouseSortOrder
  AH.SORTS = { { sortOrder = order and order.Price or 0, reverseSort = false } }
  AH.queue, AH.found, AH.owned, AH.lastSent = {}, {}, {}, -AH.SEND_GAP
  AH.walker = CreateFrame("Frame")
  AH.walker:Hide()
  AH.walker:SetScript("OnUpdate", AH.ScanStep)
end

-- The auction house's events the helper follows (none in combat).
local function listen()
  on("AUCTION_HOUSE_SHOW", function() ns.Soon("auctionhelper", AH.OnShow) end)
  on("AUCTION_HOUSE_CLOSED", AH.OnClosed)
  on("REPLICATE_ITEM_LIST_UPDATE", onReplicate)
  on("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", onBrowse)
  on("ITEM_KEY_ITEM_INFO_RECEIVED", function() AH.PaintShop() end)
  on("ITEM_SEARCH_RESULTS_UPDATED", onSearchResults)
  on("COMMODITY_SEARCH_RESULTS_UPDATED", onSearchResults)
  on("AUCTION_HOUSE_THROTTLED_SYSTEM_READY", function() AH.PaintSell() end)
  on("OWNED_AUCTIONS_UPDATED", onOwned)
  on("AUCTION_CANCELED", onCanceled)
end

-- Module entry point (Core/Modules.lua): prices in tooltips, and the panel at the auction house.
function AH.Enable(settings)
  AH.settings = settings
  AP.Enable(settings)
  if type(C_AuctionHouse) ~= "table" then return end
  AH.Start()
  listen()
end
