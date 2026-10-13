-- Auction helper: two Vanguard tabs on the game's auction house window,
-- Lists and Posting (AH.TAB_NAMES), after its own Buy, Sell and Auctions.
--   * Shop: named shopping lists (items by ID or by name); "Search list" runs
--     the list's searches one after another (one in flight, at most 60 a
--     minute) and each row shows the item's cheapest price per unit and how
--     many are up; clicking a row lists that item's auctions, and clicking
--     one shows the item in the game's own list, so buying stays in the
--     game's hands.
--   * Sell: drop an item on the card (or pick one in the game's sell frame:
--     the card takes the item the game's window is given) and it shows the
--     cheapest price someone else asks now, the 7-day low from your scans,
--     the deposit, and the price to ask (undercut by 1 copper, 1 silver, 1 %,
--     or matched); a form sets the quantity, stack size, stacks, a typed
--     price, a bid and the length; Post puts up one stack per click only.
--   * Your auctions: "Check undercuts" asks for your auctions, checks each
--     item's price now, and marks the ones someone else asks less for; each
--     row's Cancel (its cost on hover) cancels that auction, from the click only.
--   * Scan: "Scan the auction house" (once every 15 minutes, the game's own
--     limit for a whole-house query) reads every listing and records each
--     item's cheapest unit price, units up and market value
--     (Modules/AuctionPrices.lua), which item tooltips then show everywhere.
--
-- The module is one table over several files, loaded in this order: this one
-- holds the tabs, their pages and the cards' build order, the search queue and its throttle,
-- event routing, the scan, the slash commands and Enable; Modules/AuctionTable.lua
-- the table the pages' lists share; Modules/AuctionShop.lua the Shopping page
-- (the Lists pane and the list shown), Modules/AuctionSell.lua the Sell card
-- and Modules/AuctionOwned.lua your auctions. Modules/AuctionLedger.lua
-- adds the sales ledger and the sell card's Your history,
-- Modules/AuctionRestock.lua the Restock buy list, Modules/AuctionDeals.lua
-- the Deals entry in the Lists pane and Modules/AuctionUpgrades.lua the Upgrades one.
--
-- The game's auction house is the modern one (C_AuctionHouse) on WoW Forever.
-- The helper's two tabs join the window's own tab row (its Tabs list and its
-- display-mode lookup, as the game's OnLoad fills them), each with a display
-- mode of its own that names none of the game's frames, so picking one hides
-- them all while the tab's page shows; a listing opened to buy switches the
-- window to its Buy tab. Nothing else of the game's is touched: the other
-- hooks are post-hooks (SetDisplayMode and UpdateTitle, to show a page and
-- name the title; SetPostItem, to read the item the game's sell frame was
-- given and, when Posting was open, show Posting again). Posting and cancelling run only inside a button's
-- click, and a post the game wants confirmed waits for a second click (Confirm). Every price and
-- quantity goes through ns.PlainNumber before any arithmetic, and events are
-- ignored in combat (the house closes then).

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices

local AH = ns.Module("AuctionHelper", { defaults = { panel = true, tooltip = true, undercut = "silver", scanButton = true } })

-- Seconds between scans, listings read per frame of a scan; the Sell card's column's width, the
-- room between the cards' boxes and the column's edges, and between a box's border and what it
-- holds; the scan card's height; the Lists pane's width, and the height of a card's toolbar
-- line (the heading with buttons on its right).
AH.SCAN_GAP, AH.SCAN_ROWS = 900, 400
AH.WIDTH, AH.PAD, AH.INSET, AH.SCAN_H = 300, 8, 8, 80
AH.PANE_W, AH.TOOLBAR_H = 240, 24
-- A page's insets on the window: from its sides, under its title, above its money line.
AH.PAGE_X, AH.PAGE_TOP, AH.PAGE_BOTTOM = 4, 30, 30
-- The helper's two tabs, as the window's tab row and title name them: the Shopping page (your lists,
-- Deals, Upgrades and the scan) and the Selling page (the Sell card, Up now and your auctions).
AH.TAB_NAMES = { "Lists", "Posting" }
-- Searches: seconds between two (at most 60 a minute), and how long one waits for its results.
AH.SEND_GAP, AH.FALLBACK = 1, 2
-- A result row's height (the shop's rows and your auctions'), and the icon of an item the client doesn't know.
AH.ROW_H, AH.UNKNOWN_ICON = 20, "Interface\\Icons\\INV_Misc_QuestionMark"

-- Helpers ------------------------------------------------------------------------------------

-- Runs fn on an event, unless in combat (the auction house closes in combat).
local function on(event, fn)
  ns.On(event, function(...) if not ns.InCombat() then fn(...) end end)
end

-- A card's box on a column: a raised panel with the theme's border (the options window's card
-- look), from y (down from the column's top), h units tall, AH.PAD in from the column's sides.
local function box(f, y, h)
  local b = T.Panel(CreateFrame("Frame", nil, f), { raised = true })
  b:SetPoint("TOPLEFT", f, "TOPLEFT", AH.PAD, y)
  b:SetPoint("TOPRIGHT", f, "TOPRIGHT", -AH.PAD, y)
  b:SetHeight(h)
  return b
end

-- A card on a column, in its box (h tall from y): what it holds sits AH.INSET in from the box's
-- border, its heading at the top left; the card (c.box its box) is what its parts hang on.
function AH.Card(f, title, y, h)
  local c = CreateFrame("Frame", nil, box(f, y, h))
  c.box = c:GetParent()
  c:SetPoint("TOPLEFT", AH.INSET, -AH.INSET)
  c:SetPoint("BOTTOMRIGHT", -AH.INSET, AH.INSET)
  c.title = T.Text(c:CreateFontString(nil, "OVERLAY"), "heading")
  c.title:SetPoint("TOPLEFT")
  c.title:SetText(title)
  return c
end

-- The inner size of a card's box h tall: what its parts have room for.
function AH.Inner(h)
  return h - 2 * AH.INSET
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
  r:SetScript("OnClick", ns.Guard("click auction row", onClick))
  return r
end

-- Searches -----------------------------------------------------------------------------------

-- Sends one search: an item to open in the game's own list, an item's price check (a sell search),
-- the next page of an item's listings (the sell card's: more, the shop's view's: page), your
-- auctions, or the shop's (Modules/AuctionShop.lua: a list entry, an item's listings); always
-- cheapest first.
function AH.Send(s)
  local api, page = C_AuctionHouse, s.more or s.page
  if s.sell then return api.SendSellSearchQuery(s.sell, AH.SORTS, true) end
  if page then return AH.RequestMore(s.commodity, page) end
  if s.owned then return api.QueryOwnedAuctions(AH.SORTS) end
  if s.open then return api.SearchForItemKeys({ s.open }, AH.SORTS) end
  AH.SendShop(s)
end

-- Asks the house for the next page of an item's listings: a commodity's by its itemID, an item's by its key.
function AH.RequestMore(commodity, key)
  local api = C_AuctionHouse
  if commodity then return api.RequestMoreCommoditySearchResults(key.itemID) end
  api.RequestMoreItemSearchResults(key)
end

-- Waits until AH.SEND_GAP has passed since the last search, then tries the next (one timer at a time).
local function sendLater(wait)
  if AH.waiting then return end
  AH.waiting = true
  C_Timer.After(wait, ns.Guard("timer search queue", function() AH.waiting = false AH.Next() end))
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
  C_Timer.After(AH.FALLBACK, ns.Guard("timer search fallback", function() if AH.pending == s then AH.Done() end end))
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
  if (s.entry or s.cost) and AH.progress then AH.progress.done = AH.progress.done + 1 end
  AH.PaintShop()
  AH.Next()
end

-- The panel ----------------------------------------------------------------------------------

-- Layout ---------------------------------------------------------------------------------------

-- The rows a card has room for in h units (AH.ROW_H each; one at least).
local function fitRows(h)
  return math.max(1, math.floor(h / AH.ROW_H))
end

-- The Up now card's height on the Selling page: half the column, less the padding between the cards.
local function upHeight(cardH)
  return math.floor((cardH - AH.PAD) / 2)
end

-- How many rows each card gets, from a card's height and the Lists pane's: set before the cards
-- are built, so the lists grow to the room their page has.
local function countRows(cardH, paneH)
  local upH = upHeight(cardH)
  AH.SHOP_ROWS = AH.TableRows(AH.Inner(cardH) - AH.TOOLBAR_H)
  AH.VIEW_ROWS = AH.SHOP_ROWS
  AH.PANE_ROWS = fitRows(AH.Inner(paneH) + AH.PANE_ROWS_Y - AH.ACTIONS_H)
  AH.LIST_ROWS = AH.TableRows(AH.Inner(upH) - AH.TOOLBAR_H)
  AH.OWNED_ROWS = AH.TableRows(AH.Inner(cardH - upH - AH.PAD) - AH.TOOLBAR_H)
end

-- A page on the window: a child frame over its content area (under the title, above the money
-- line), hidden until its tab is picked.
local function page(name)
  local f = CreateFrame("Frame", name, AuctionHouseFrame)
  f:SetPoint("TOPLEFT", AuctionHouseFrame, "TOPLEFT", AH.PAGE_X, -AH.PAGE_TOP)
  f:SetPoint("BOTTOMRIGHT", AuctionHouseFrame, "BOTTOMRIGHT", -AH.PAGE_X, AH.PAGE_BOTTOM)
  f:Hide()
  return f
end

-- A column of a page, at its left or right edge (side), width wide and as tall as the page.
function AH.Column(f, side, width)
  local c = CreateFrame("Frame", nil, f)
  c:SetWidth(width)
  c:SetPoint("TOP" .. side)
  c:SetPoint("BOTTOM" .. side)
  return c
end

-- The scan card under the Lists pane: the scan button and when the last scan was.
local function buildScan(column, y)
  local c = AH.Card(column, "Scan", y, AH.SCAN_H)
  c.scan = W.Button(c, "Scan the auction house", function() AH.StartScan() end, 150)
  c.scan:SetPoint("TOPLEFT", 0, -20)
  c.last = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.last:SetPoint("TOPLEFT", 0, -50)
  AH.scanCard = c
end

-- The Shopping page (h tall, w wide): the Lists pane with the scan under it in a column on the
-- left, and the list shown (the Shop card) on the right.
local function buildShopping(h, w)
  local f = page("Vanguard_AuctionShopping")
  local cardH, paneH = h - 2 * AH.PAD, h - 3 * AH.PAD - AH.SCAN_H
  local side = AH.Column(f, "LEFT", AH.PANE_W)
  AH.BuildPane(side, paneH)
  buildScan(side, -(2 * AH.PAD + paneH))
  AH.BuildShop(AH.Column(f, "RIGHT", w - AH.PANE_W), cardH)
  return f
end

-- The Selling page (h tall, w wide): the Sell card in a column on the left; on the right, the
-- listings up now (with Your history) above your auctions.
local function buildSelling(h, w)
  local f = page("Vanguard_AuctionSelling")
  local cardH = h - 2 * AH.PAD
  local upH = upHeight(cardH)
  AH.BuildSell(AH.Column(f, "LEFT", AH.WIDTH), cardH)
  local side = AH.Column(f, "RIGHT", w - AH.WIDTH)
  AH.BuildUp(side, upH)
  AH.BuildOwned(side, -(2 * AH.PAD + upH), cardH - upH - AH.PAD)
  return f
end

-- Tabs -----------------------------------------------------------------------------------------

-- The tab's label, and the tab sized to fit it (the game's tab sizing: 20 px of padding, 70 px at least),
-- so a name never runs past its tab.
local function labelTab(tab, name)
  tab:SetText(name)
  PanelTemplates_TabResize(tab, 20, nil, 70)
end

-- A tab after the window's last, named for its page: its display mode is a table of its own that
-- names none of the game's frames, so picking it hides them all, and the page shows meanwhile.
-- The game's tab template (PanelTabButtonTemplate, parentArray Tabs) puts the new tab in the
-- window's Tabs itself; a client whose template doesn't gets it added here.
local function addTab(name, f)
  local w = AuctionHouseFrame
  local last = w.Tabs[#w.Tabs]
  local tab = CreateFrame("Button", nil, w, "AuctionHouseFrameDisplayModeTabTemplate")
  if w.Tabs[#w.Tabs] ~= tab then table.insert(w.Tabs, tab) end
  labelTab(tab, name)
  tab:SetPoint("LEFT", last, "RIGHT", -15, 0)
  tab.displayMode = {}
  w.tabsForDisplayMode[tab.displayMode] = #w.Tabs
  f.vgMode, f.vgTitle = tab.displayMode, name
  return tab
end

-- The window's display mode changed: each page shows while the mode is its own; the mode it had
-- before is kept (AH.lastMode), so a bag click can bring Selling back (AH.KeepSelling).
local function onDisplayMode(w, mode)
  if w.displayMode ~= AH.mode then AH.lastMode, AH.mode = AH.mode, w.displayMode end
  for _, f in ipairs(AH.pages) do f:SetShown(mode == f.vgMode) end
end

-- The window named its title for the tab picked: a page's name while one of ours is.
local function onTitle(w)
  for _, f in ipairs(AH.pages) do
    if w.displayMode == f.vgMode then w:SetTitle(f.vgTitle) end
  end
end

-- Whether the window has the tab row the Forever client gives it: its Tabs, the lookup from a
-- display mode to a tab, and the game's tab count call.
local function hasTabs(w)
  return type(w) == "table" and type(w.Tabs) == "table" and #w.Tabs > 0
    and type(w.tabsForDisplayMode) == "table" and type(PanelTemplates_SetNumTabs) == "function"
end

-- The two tabs on the window, the hooks that show their pages and name the title, and the tabs
-- in the Vanguard look when the Windows module dresses the window's.
local function addTabs(shopping, selling)
  local w = AuctionHouseFrame
  AH.tabs = { addTab(AH.TAB_NAMES[1], shopping), addTab(AH.TAB_NAMES[2], selling) }
  PanelTemplates_SetNumTabs(w, #w.Tabs)
  hooksecurefunc(w, "SetDisplayMode", ns.Guard("hook SetDisplayMode", onDisplayMode))
  hooksecurefunc(w, "UpdateTitle", ns.Guard("hook UpdateTitle", onTitle))
  local GW = ns.GetModule("Windows")
  if GW and GW.DressTabsOf then GW.DressTabsOf("AuctionHouseFrame") end
end

-- The game's own Buy page, so an item just searched shows in its list; our tab brings you back.
function AH.ShowInGame()
  local w, modes = AuctionHouseFrame, AuctionHouseFrameDisplayMode
  if type(modes) == "table" and type(w) == "table" and type(w.SetDisplayMode) == "function" then w:SetDisplayMode(modes.Buy) end
end

-- A bag click while Selling was open: the game showed its own sell page for the item, so Selling
-- (whose card took the item) shows again.
function AH.KeepSelling()
  local f = AH.pages and AH.pages[2]
  if f and AH.lastMode == f.vgMode and AH.mode ~= f.vgMode then AuctionHouseFrame:SetDisplayMode(f.vgMode) end
end

-- No tab row on the window (another client's): said once in chat, and nothing is built.
function AH.NoTabRow()
  if not AH.saidNoTabs then ns.Chat(string.format("The auction house window has no tab row this client knows, so the %s and %s tabs can't be added (/vg errors says if something failed).", AH.TAB_NAMES[1], AH.TAB_NAMES[2])) end
  AH.saidNoTabs = true
  return false
end

-- The helper's tabs and pages, built the first time the window shows: Shopping (the Lists pane
-- with the scan, and the list shown) and Selling (the Sell card and your auctions), sized to the
-- window's content area; Selling has the listings up now and your auctions on its right. Without
-- the tab row (another client's window) nothing is built.
function AH.Build()
  if not hasTabs(AuctionHouseFrame) then return AH.NoTabRow() end
  local h, w = AuctionHouseFrame:GetHeight() - AH.PAGE_TOP - AH.PAGE_BOTTOM, AuctionHouseFrame:GetWidth() - 2 * AH.PAGE_X
  countRows(h - 2 * AH.PAD, h - 3 * AH.PAD - AH.SCAN_H)
  local shopping, selling = buildShopping(h, w), buildSelling(h, w)
  AH.pages = { shopping, selling }
  addTabs(shopping, selling)
  return true
end

-- The auction house opened: the tabs go on the window the first time (unless switched off, or
-- the window has no tab row), and the cards are painted.
function AH.OnShow()
  AH.open = true
  if not AH.settings.panel or type(AuctionHouseFrame) ~= "table" then return end
  if not AH.pages and not AH.Build() then return end
  AH.PaintShop()
  AH.PaintSell()
  AH.PaintScan()
  AH.PaintOwned()
end

-- The auction house closed: searches waiting and a scan in progress stop (the pages go with the window).
function AH.OnClosed()
  AH.open, AH.scan, AH.pending, AH.queue, AH.progress, AH.sell = false, nil, nil, {}, nil, nil
  AH.walker:Hide()
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

-- A new scan: where the walk is, each item's listings and how many, the gear to judge for
-- upgrades (link -> cheapest unit price, Modules/AuctionUpgrades.lua), your listings left out (and your name, alone and as
-- "Name-Realm", to know them by), and when it started.
local function newScan()
  local me = UnitName("player")
  return { next = 0, items = {}, listings = {}, gear = {}, mine = 0, me = me, meFull = string.format("%s-%s", tostring(me), AP.Realm()), started = AP.Now() }
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
-- (s.items[itemID] = { [unit price] = units }) and its count, and gear joins the scan's gear to
-- judge; skipped without a buyout or when the client hides a number, and counted apart when it's yours.
function AH.ScanRow(s, i)
  local _, _, count, _, _, _, _, _, _, buyout, _, _, _, owner, ownerFull, _, id = C_AuctionHouse.GetReplicateItemInfo(i)
  count, buyout, id = ns.PlainNumber(count), ns.PlainNumber(buyout), ns.PlainNumber(id)
  if not (count and buyout and id) or count < 1 or buyout < 1 then return end
  if isMine(s, owner, ownerFull) then s.mine = s.mine + 1 return end
  local unit, prices = math.floor(buyout / count), s.items[id] or {}
  prices[unit], s.items[id] = (prices[unit] or 0) + count, prices
  s.listings[id] = (s.listings[id] or 0) + 1
  AH.ScanGear(s, i, id, unit)
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

-- The whole list is read: the prices are recorded, the gear found goes to be judged, and the 15
-- minutes run from the scan's start.
function AH.FinishScan()
  local s = AH.scan
  local n = recordScan(s, AP.Now())
  AP.House().lastScan, AH.scan = s.started, nil
  AH.walker:Hide()
  AH.JudgeGear(s.gear)
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

-- /vg ah list [name]: picks (or makes) a list, and says what's on the list in use.
function AH.ListCommand(arg)
  if arg ~= "" and not AH.NewList(arg) then return end
  local name, list = AH.CurrentList()
  if not name then return ns.Chat("No shopping lists yet: /vg ah list <name> makes one.") end
  ns.Chat(string.format("Shopping list %s (%d): %s", name, #list, #list > 0 and entryNames(list) or "empty"))
end

-- /vg ah add <list> <item>: the list is the longest list name the words start with, else the first word.
function AH.AddCommand(arg)
  local best
  for name in pairs(AP.Store().lists) do
    if arg:sub(1, #name + 1) == name .. " " and #name > #(best or "") then best = name end
  end
  local list = best or arg:match("^(%S+)") or ""
  AH.AddEntry(arg:sub(#list + 2), list)
end

-- /vg ah's words: list, add, scan, and prices clear (Modules/AuctionShop.lua adds the list in use's words).
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
  ns.Chat(string.format("Auction prices for %d item(s); last scan: %s. /vg ah list <name>, add <list> <item>, rename <name>, duplicate, delete, export, import, recent, scan (at the auction house), prices clear, restock.", store.count, last))
end

-- /vg ah [list <name>|add <list> <item>|rename <name>|duplicate|delete|export|import|recent|restock|scan|prices clear].
function AH.Command(rest)
  if not AH.settings then return ns.Chat("The auction helper is off (/vg > Modules).") end
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

-- An item's search results: a search answered (UPDATED), or a further page of it (ADDED).
AH.SEARCH_EVENTS = { "ITEM_SEARCH_RESULTS_UPDATED", "COMMODITY_SEARCH_RESULTS_UPDATED", "ITEM_SEARCH_RESULTS_ADDED", "COMMODITY_SEARCH_RESULTS_ADDED" }
-- The events that paint the sell card again: the game's message throttle busy or ready (as the
-- game's own sell frame follows it), and the bags changed.
AH.SELL_EVENTS = { "AUCTION_HOUSE_THROTTLED_MESSAGE_SENT", "AUCTION_HOUSE_THROTTLED_SYSTEM_READY", "BAG_UPDATE_DELAYED" }

-- An item's search results go to the shop's view and to the sell card, both against the search in
-- flight when they came: only the one whose search it is (their kinds differ) marks it done, which
-- may send the next search at once.
function AH.OnSearchEvent(event, arg)
  local s, id = AH.pending, type(arg) == "table" and arg.itemID or arg
  AH.OnListings(event, id, s)
  AH.OnSearchResults(event, id, s)
  AH.OnCostResults(event, id, s)
end

-- The auction house's events the helper follows (none in combat), then each file's own.
local function listen()
  on("AUCTION_HOUSE_SHOW", function() ns.Soon("auctionhelper", AH.OnShow) end)
  on("AUCTION_HOUSE_CLOSED", AH.OnClosed)
  on("REPLICATE_ITEM_LIST_UPDATE", onReplicate)
  on("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", AH.OnBrowse)
  for _, e in ipairs(AH.SEARCH_EVENTS) do on(e, AH.OnSearchEvent) end
  -- The sell card again when the game goes busy (a message sent) or is ready for a post again, or a
  -- stack left the bags, so Post is on only while it can post.
  for _, e in ipairs(AH.SELL_EVENTS) do on(e, function() AH.PaintSell() end) end
  -- What the game answers to a post, said in chat.
  for e in pairs(AH.POST_ANSWERS) do on(e, AH.OnPostAnswer) end
  for _, each in ipairs({ AH.ListenShop, AH.ListenOwned, AH.ListenLedger, AH.ListenDeals, AH.ListenUpgrades }) do each(on) end
end

-- Module entry point (Core/Modules.lua): prices in tooltips, and the panel at the auction house.
function AH.Enable(settings)
  AH.settings = settings
  AP.Enable(settings)
  if type(C_AuctionHouse) ~= "table" then return end
  AH.Start()
  listen()
end
