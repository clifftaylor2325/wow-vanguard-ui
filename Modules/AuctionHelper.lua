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
--     item's cheapest unit price, units up and market value
--     (Modules/AuctionPrices.lua), which item tooltips then show everywhere.
--
-- The module is one table over four files, loaded in this order: this one
-- holds the panel and its build order, the search queue and its throttle,
-- event routing, the scan, the slash commands and Enable;
-- Modules/AuctionShop.lua the Shop card, Modules/AuctionSell.lua the Sell
-- card and Modules/AuctionOwned.lua your auctions.
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
-- A result row's height (the shop's rows and your auctions'), and the icon of an item the client doesn't know.
AH.ROW_H, AH.UNKNOWN_ICON = 20, "Interface\\Icons\\INV_Misc_QuestionMark"

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
function AH.Card(f, title, y, h)
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

-- A string of a row in a text role and color, at the row's right edge less x.
local function rowText(r, role, color, x)
  local fs = T.Text(r:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetPoint("RIGHT", x, 0)
  return fs
end

-- A row's icon (16 px), name, count and price.
function AH.RowParts(r)
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
function AH.Row(c, i, y, onClick)
  local r = CreateFrame("Button", nil, c)
  r:SetHeight(AH.ROW_H)
  r:SetPoint("TOPLEFT", 0, y - (i - 1) * AH.ROW_H)
  r:SetPoint("TOPRIGHT", 0, y - (i - 1) * AH.ROW_H)
  W.Flat(r, "HIGHLIGHT", "hover"):SetAllPoints()
  r:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  r:SetScript("OnClick", onClick)
  return r
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

-- Drops the queued searches of one kind ("entry", "sell"...).
function AH.DropQueued(kind)
  local kept = {}
  for _, s in ipairs(AH.queue) do if not s[kind] then kept[#kept + 1] = s end end
  AH.queue = kept
end

-- The search in flight is answered (or gave up waiting): count a list entry, and send the next.
function AH.Done()
  local s = AH.pending
  AH.pending = nil
  if s.entry and AH.progress then AH.progress.done = AH.progress.done + 1 end
  AH.PaintShop()
  AH.Next()
end

-- The panel ----------------------------------------------------------------------------------

-- The scan card: the scan button and when the last scan was, Check undercuts and your auctions.
local function buildScan(f)
  local c = AH.Card(f, "Scan and your auctions", AH.SCAN_Y, AH.SCAN_H)
  c.scan = W.Button(c, "Scan the auction house", function() AH.StartScan() end, 150)
  c.scan:SetPoint("TOPLEFT", 0, -20)
  c.last = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.last:SetPoint("TOPLEFT", 0, -50)
  AH.scanCard = c
  AH.BuildOwned(c)
end

-- The panel beside the auction house window (as tall as it), built the first time the window shows.
function AH.Build()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_AuctionPanel", UIParent), { shadow = true })
  f:SetWidth(AH.WIDTH)
  f:SetPoint("TOPRIGHT", AuctionHouseFrame, "TOPLEFT", -AH.GAP, 0)
  f:SetPoint("BOTTOMRIGHT", AuctionHouseFrame, "BOTTOMLEFT", -AH.GAP, 0)
  f:EnableMouse(true)
  AH.frame = f
  AH.BuildShop(f)
  AH.BuildSell(f)
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
  local c, s, last = AH.scanCard, AH.scan, AP.House().lastScan
  if not c then return end
  c.scan:SetShown(AH.settings.scanButton)
  if s then return c.last:SetText(string.format("scanning %d of %d", s.next, s.total or 0)) end
  c.last:SetText(last > 0 and string.format("last scan %d min ago", math.floor((AP.Now() - last) / 60)) or "no scan yet")
end

-- A new scan: where the walk is, each item's listings and how many, your listings left out (and
-- your name, alone and as "Name-Realm", to know them by), and when it started.
local function newScan()
  local me = UnitName("player")
  return { next = 0, items = {}, listings = {}, mine = 0, me = me, meFull = string.format("%s-%s", tostring(me), AP.Realm()), started = AP.Now() }
end

-- Asks the house for every listing (ReplicateItems), at most once every AH.SCAN_GAP seconds (only a
-- finished scan counts: one cut short by closing the house doesn't); the rows are read once
-- REPLICATE_ITEM_LIST_UPDATE says they're in.
function AH.StartScan()
  local wait = AP.House().lastScan + AH.SCAN_GAP - AP.Now()
  AH.PaintScan()
  if not AH.open then return ns.Chat("Open the auction house to scan it.") end
  if AH.scan or wait > 0 then return ns.Chat(string.format("One auction house scan every 15 minutes: the next in %d min.", math.ceil(wait / 60))) end
  AH.scan = newScan()
  C_AuctionHouse.ReplicateItems()
  AH.PaintScan()
end

-- The listings are in: walk them, AH.SCAN_ROWS per frame.
local function onReplicate()
  if not AH.scan or AH.scan.total then return end
  AH.scan.total = ns.PlainNumber(C_AuctionHouse.GetNumReplicateItems()) or 0
  AH.walker:Show()
end

-- Whether a listing is yours: GetReplicateItemInfo names its seller (owner, and ownerFullName as
-- "Name-Realm"); a seller the client hides or hasn't loaded yet isn't you.
local function isMine(s, owner, ownerFull)
  if ns.IsSecret(owner) or ns.IsSecret(ownerFull) then return false end
  return (owner ~= nil and owner == s.me) or (ownerFull ~= nil and ownerFull == s.meFull)
end

-- Listing i (0-based): its units at its unit price (buyout over count) join its item's listings
-- (s.items[itemID] = { [unit price] = units }) and its count; skipped without a buyout or when
-- the client hides a number, and counted apart when it's yours.
function AH.ScanRow(s, i)
  local _, _, count, _, _, _, _, _, _, buyout, _, _, _, owner, ownerFull, _, id = C_AuctionHouse.GetReplicateItemInfo(i)
  count, buyout, id = ns.PlainNumber(count), ns.PlainNumber(buyout), ns.PlainNumber(id)
  if not (count and buyout and id) or count < 1 or buyout < 1 then return end
  if isMine(s, owner, ownerFull) then s.mine = s.mine + 1 return end
  local unit, prices = math.floor(buyout / count), s.items[id] or {}
  prices[unit], s.items[id] = (prices[unit] or 0) + count, prices
  s.listings[id] = (s.listings[id] or 0) + 1
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

-- Each item's cheapest unit price, units up, market value and listings go in the price store; how many items.
local function recordScan(s, now)
  local n = 0
  for id, prices in pairs(s.items) do
    local low, units, market = AP.Summary(prices)
    AP.Record(id, low, now, units, market, s.listings[id])
    n = n + 1
  end
  return n
end

-- The whole list is read: the prices are recorded, and the 15 minutes run from the scan's start.
function AH.FinishScan()
  local s = AH.scan
  local n = recordScan(s, AP.Now())
  AP.House().lastScan, AH.scan = s.started, nil
  AH.walker:Hide()
  local yours = s.mine > 0 and string.format(" %d of them were yours and are left out.", s.mine) or ""
  ns.Chat(string.format("Auction house scanned: %d listings, prices for %d items.%s", s.total, n, yours))
  AH.PaintScan()
end

-- Slash command ------------------------------------------------------------------------------

-- A list's entries by name, for chat.
local function entryNames(list)
  local names = {}
  for i, entry in ipairs(list) do names[i] = (AH.EntryLook(entry)) end
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
  -- Forgets every price (of every realm and faction).
  prices = function(arg)
    if arg ~= "clear" then return AH.Status() end
    AP.Store().houses = {}
    ns.Chat("Forgot every auction price.")
  end,
}

-- What the helper knows: how many prices on this realm and faction, and the last scan there.
function AH.Status()
  local store = AP.House()
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
  on("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", AH.OnBrowse)
  on("ITEM_KEY_ITEM_INFO_RECEIVED", function() AH.PaintShop() end)
  on("ITEM_SEARCH_RESULTS_UPDATED", AH.OnSearchResults)
  on("COMMODITY_SEARCH_RESULTS_UPDATED", AH.OnSearchResults)
  on("AUCTION_HOUSE_THROTTLED_SYSTEM_READY", function() AH.PaintSell() end)
  on("OWNED_AUCTIONS_UPDATED", AH.OnOwned)
  on("AUCTION_CANCELED", AH.OnCanceled)
end

-- Module entry point (Core/Modules.lua): prices in tooltips, and the panel at the auction house.
function AH.Enable(settings)
  AH.settings = settings
  AP.Enable(settings)
  if type(C_AuctionHouse) ~= "table" then return end
  AH.Start()
  listen()
end
