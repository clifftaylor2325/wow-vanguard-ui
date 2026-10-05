-- Auction helper, the Sell card (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands): the sell slot and the
-- item it takes (TakeItem, TakeCursor, or the game's own sell frame), the
-- price check's results (Cheapest), the undercut rules and the price to ask
-- (Suggest), and the form: quantity and stack size (each with Max; the stack
-- size starts at the vanilla preset for the item's class, StackPreset), the
-- number of stacks, a price typed per unit or per stack, a bid for items, and
-- the auction length (Duration). Post puts up one stack per click and loads
-- the next ("posted 3 of 10"); Skip passes a stack, Stop ends the sale.
--
-- Standing rules here: PostItem and PostCommodity run only inside Post's
-- click, one call per click; the only hook is a post-hook on the game's
-- SetPostItem that reads the item it was given, and nothing writes into the
-- game's auction frames; price checks go through AH.Queue (one in flight, at
-- most 60 a minute); every price and quantity goes through ns.PlainNumber
-- before arithmetic; and both paths work: a commodity at a unit price, or an
-- item (each auction one item) with a buyout and an optional bid.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The sell card: where it starts and its height, and its lines.
AH.SELL_Y, AH.SELL_H = -210, 346
AH.SELL_LINES = { "Cheapest now", "7-day low", "Deposit", "Your price" }
-- The form: where its rows start (down from the card's top) and how far apart they are.
AH.FORM_Y, AH.FORM_ROW = -110, 26
-- The listings under the form: where they start, and how many rows show.
AH.LIST_Y, AH.LIST_ROWS = -250, 4
-- Enum.AuctionHouseTimeLeftBand (AuctionHouseEnumsDocumentation.lua) by the game's words for it (TIME_LEFT_SHORT...).
AH.TIME_BANDS = { [0] = "SHORT", "MEDIUM", "LONG", "VERY_LONG" }
-- Coins in copper, for a typed price ("1g 50s").
AH.COINS = { g = 10000, s = 100, c = 1 }
-- The sell card's settings: the auction length a new item starts with ("last": the last one
-- used; or 1 to 3), and lastDuration, the last one picked on the card (none at first).
AH.defaults.duration = "last"
-- And whether Post refuses a price under the item's vendor sell price (on: a sale that loses to
-- the vendor is never what you meant).
AH.defaults.vendorFloor = true
-- Enum.ItemCommodityStatus's Item and Commodity (AuctionHouseDocumentation.lua); the game's
-- names for the three auction lengths (AUCTION_DURATION_ONE...).
AH.ITEM, AH.COMMODITY, AH.DURATIONS = 1, 2, { "ONE", "TWO", "THREE" }
-- The undercut rules as the sell card's segments.
AH.UNDERCUT_CHOICES = { { "copper", "1c" }, { "silver", "1s" }, { "percent", "1%" }, { "match", "Match" } }

-- Stack presets for vanilla: how many units go up in one auction by default, by item class and
-- subclass ("class:subclass", as C_Item.GetItemInfoInstant gives them; Enum.ItemClass and
-- Enum.ItemConsumableSubclass in ItemConstantsDocumentation.lua; the trade goods subclasses are not
-- in the documentation, so they are the client's numbers: 5 cloth, 6 leather, 7 metal and stone,
-- 9 herb). Cloth, ore, herbs 20, potions 5 and food 20 are the plan's "how vanilla players buy"
-- (docs/handoff/AUCTION-PLAN.md, section 4); bars and leather (20) go with the other trade goods,
-- elixirs, flasks and scrolls (5) with potions. Anything else goes up one at a time (AH.STACK_DEFAULT).
AH.STACK_PRESETS = {
  ["7:5"] = 20, -- Cloth: Linen to Runecloth, Mooncloth, Felcloth.
  ["7:6"] = 20, -- Leather and hides.
  ["7:7"] = 20, -- Metal and stone: ore, bars and stone.
  ["7:9"] = 20, -- Herbs.
  ["0:1"] = 5, -- Potions.
  ["0:2"] = 5, -- Elixirs.
  ["0:3"] = 5, -- Flasks.
  ["0:4"] = 5, -- Scrolls.
  ["0:5"] = 20, -- Food and drink.
}
AH.STACK_DEFAULT = 1

-- Stack presets ------------------------------------------------------------------------------

-- The preset stack size for an item (an ID or a link): its class and subclass's, else
-- AH.STACK_DEFAULT (also for an item the client doesn't know, or a class it hides).
function AH.StackPreset(item)
  local _, _, _, _, _, class, sub = C_Item.GetItemInfoInstant(item)
  class, sub = ns.PlainNumber(class), ns.PlainNumber(sub)
  return class and sub and AH.STACK_PRESETS[class .. ":" .. sub] or AH.STACK_DEFAULT
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

-- A price as the game takes it: at least 1 copper, and in whole silver (rounded up) on a client
-- without copper prices, as the game's sell frame does.
local function forGame(price)
  price = math.max(1, price)
  if not C_AuctionHouse.SupportsCopperValues() then price = math.ceil(price / 100) * 100 end
  return price
end

-- The price to ask: the cheapest now (else the 7-day low) less the undercut; nil with neither.
function AH.Suggest(cheapest, low7)
  local base = cheapest or low7
  if not base then return nil end
  return forGame((AH.UNDERCUT[AH.settings.undercut] or AH.UNDERCUT.silver)(base))
end

-- The unit price the card's item goes up at: the one typed, else the suggestion (nil: none yet).
function AH.SellPrice(s)
  if s.unit then return forGame(s.unit) end
  return AH.Suggest(s.cheapest, AP.Low7(s.id))
end

-- A price typed as "1g 50s 25c" (any of the three, spaces optional) or a bare number of copper;
-- nil for nothing, zero or anything else.
function AH.ParseMoney(text)
  local t, total = (text or ""):lower():gsub("%s+", ""), 0
  if t:match("^%d+$") then t = t .. "c" end
  local rest = t:gsub("(%d+)([gsc])", function(n, coin) total = total + tonumber(n) * AH.COINS[coin] return "" end)
  return rest == "" and total > 0 and total or nil
end

-- Auction lengths ----------------------------------------------------------------------------

-- The game's name for auction length d (AUCTION_DURATION_ONE...), or "duration d" without one.
function AH.DurationName(d)
  return _G["AUCTION_DURATION_" .. AH.DURATIONS[d]] or ("duration " .. d)
end

-- The three auction lengths as choices, by the game's names; "Last used" first when asked for.
function AH.DurationChoices(withLast)
  local out = withLast and { { "last", "Last used" } } or {}
  for d = 1, 3 do out[#out + 1] = { d, AH.DurationName(d) } end
  return out
end

-- The length a new item starts with: the one set under Auction length, or the last used (picked
-- on the card, else the one the game's own sell frame last used, its CVar).
local function defaultDuration()
  local set = AH.settings
  if set.duration ~= "last" then return set.duration end
  return set.lastDuration or GetCVar("auctionHouseDurationDropdown")
end

-- The auction length for the card's sale s (1 to 3: picked on the card, else the default; 1 for
-- anything else), and the game's name for it.
function AH.Duration(s)
  local d = tonumber(s and s.duration or defaultDuration() or "")
  d = d and d >= 1 and d <= 3 and math.floor(d) or 1
  return d, AH.DurationName(d)
end

-- A length picked on the card: the item on it goes up for that long, and it is the last used.
function AH.PickDuration(d)
  if AH.sell then AH.sell.duration = d end
  AH.settings.lastDuration = d
  AH.PaintSell()
end

-- Stacks -------------------------------------------------------------------------------------

-- How many units the next stack holds: the stack size, or what's left when that's less.
local function stackSize(s)
  return math.min(s.stack, s.qty - s.done)
end

-- How many stacks the sale makes in all: the ones posted or skipped, and those still to go.
function AH.StackCount(s)
  return s.passed + math.ceil(math.max(0, s.qty - s.done) / s.stack)
end

-- The bag slot's item when it is the sale's (the same item ID, level and suffix) and not locked
-- (an item locks while the house takes it): its location, else nil.
local function holds(s, bag, slot)
  local info = bag and C_Container.GetContainerItemInfo(bag, slot)
  if not (info and ns.PlainNumber(info.itemID) == s.id and not info.isLocked) then return nil end
  local loc = ItemLocation:CreateFromBagAndSlot(bag, slot)
  local key = C_AuctionHouse.GetItemKeyFromItem(loc)
  if key and key.itemLevel == s.key.itemLevel and key.itemSuffix == s.key.itemSuffix then return loc end
end

-- Where the sale's item is now: its own slot while it's still there, else the first bag slot
-- that holds it (the next stack, once the one before went up); nil when none does.
function AH.SellLocation(s)
  local found = holds(s, s.loc:GetBagAndSlot())
  for bag = 0, 4 do
    for slot = 1, found and 0 or ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do found = found or holds(s, bag, slot) end
  end
  s.loc = found or s.loc
  return found
end

-- The deposit for the next stack for length d (rounded up to silver without copper prices), or nil.
local function deposit(s, d, loc)
  local api, n = C_AuctionHouse, stackSize(s)
  if not loc or n < 1 then return nil end
  local copper
  if s.commodity then copper = api.CalculateCommodityDeposit(s.id, d, n) else copper = api.CalculateItemDeposit(loc, d, n) end
  copper = ns.PlainNumber(copper)
  if copper and not api.SupportsCopperValues() then copper = math.ceil(copper / 100) * 100 end
  return copper
end

-- Price checks -------------------------------------------------------------------------------

-- An item's search results as the house sent them (cheapest first): the commodity results for
-- its itemID, or the item results for its key.
local function results(commodity, key)
  local api, out = C_AuctionHouse, {}
  local n = commodity and api.GetNumCommoditySearchResults(key.itemID) or api.GetNumItemSearchResults(key)
  for i = 1, ns.PlainNumber(n) or 0 do
    out[#out + 1] = commodity and api.GetCommoditySearchResultInfo(key.itemID, i) or api.GetItemSearchResultInfo(key, i)
  end
  return out
end

-- One result's unit price: a commodity's unit price, an item's buyout over its quantity; nil
-- for one with only a bid, or a number the client hides.
local function resultUnit(r, commodity)
  if commodity then return ns.PlainNumber(r.unitPrice) end
  local buyout, qty = ns.PlainNumber(r.buyoutAmount), ns.PlainNumber(r.quantity)
  return buyout and qty and qty > 0 and math.floor(buyout / qty) or nil
end

-- The cheapest unit price someone else asks for an item now (your listings left out), or nil:
-- from the commodity results or the item results, whichever the search brought.
function AH.Cheapest(commodity, key)
  local best
  for _, r in ipairs(results(commodity, key)) do
    local unit = not r.containsOwnerItem and resultUnit(r, commodity)
    if unit and (not best or unit < best) then best = unit end
  end
  return best
end

-- A listing's time left: hours or minutes from its seconds, else the game's words for its band
-- (TIME_LEFT_SHORT...), else nothing.
function AH.TimeLeft(r)
  local secs = ns.PlainNumber(r.timeLeftSeconds)
  if secs then return secs >= 3600 and math.floor(secs / 3600) .. " h" or math.max(1, math.ceil(secs / 60)) .. " min" end
  local band = AH.TIME_BANDS[ns.PlainNumber(r.timeLeft)]
  return band and _G["TIME_LEFT_" .. band] or ""
end

-- The listings up for an item, cheapest first: each one's unit price, quantity, time left and
-- whether it's yours; one without a buyout, or with a number the client hides, is left out.
function AH.Listings(commodity, key)
  local out = {}
  for _, r in ipairs(results(commodity, key)) do
    local unit, qty = resultUnit(r, commodity), ns.PlainNumber(r.quantity)
    if unit and qty then out[#out + 1] = { unit = unit, qty = qty, time = AH.TimeLeft(r), mine = r.containsOwnerItem == true } end
  end
  return out
end

-- Whether the house has sent every listing of the sale's item (no further page to ask for).
local function hasFull(s)
  local api = C_AuctionHouse
  if s.commodity then return api.HasFullCommoditySearchResults(s.id) ~= false end
  return api.HasFullItemSearchResults(s.search) ~= false
end

-- The sale's listings and cheapest price, from its item's search results.
function AH.ReadListings(s, commodity, cheapest)
  s.cheapest, s.searched = cheapest, true
  s.rows, s.full = AH.Listings(commodity, s.search), hasFull(s)
end

-- Asks the house for the next page of an item's listings (a queued search, AH.Send: one in
-- flight, at most 60 a minute).
function AH.RequestMore(q)
  local api = C_AuctionHouse
  if q.commodity then return api.RequestMoreCommoditySearchResults(q.more.itemID) end
  api.RequestMoreItemSearchResults(q.more)
end

-- Near the end of the listings, with more on the house: the next page is queued (one at a time).
local function askMore(s)
  if s.full ~= false or (AH.pending and AH.pending.more) then return end
  AH.DropQueued("more")
  AH.Queue({ more = s.search, commodity = s.commodity })
end

-- The sale -----------------------------------------------------------------------------------

-- A new sale for an item taken onto the card: how many can go up (GetAvailablePostCount), the
-- quantity (a commodity's whole stack, an item one), the preset stack size, nothing posted yet.
local function newSale(loc, key, commodity)
  local max = math.max(1, ns.PlainNumber(C_AuctionHouse.GetAvailablePostCount(loc)) or 1)
  local qty = commodity and ns.PlainNumber(C_Item.GetStackCount(loc)) or 1
  return { loc = loc, key = key, id = key.itemID, commodity = commodity, max = max, qty = math.max(1, math.min(qty, max)),
    stack = AH.StackPreset(key.itemID), passed = 0, posted = 0, done = 0, search = C_AuctionHouse.MakeItemKey(key.itemID) }
end

-- Puts an item on the sell card (when the house takes it and the client knows whether it's a
-- commodity) and checks its price now.
function AH.TakeItem(loc)
  local api = C_AuctionHouse
  if not (AH.sellCard and loc and loc:IsValid() and api.IsSellItemValid(loc, false)) then return end
  local status = api.GetItemCommodityStatus(loc)
  if status ~= AH.ITEM and status ~= AH.COMMODITY then return end
  AH.sell, AH.sellStatus = newSale(loc, api.GetItemKeyFromItem(loc), status == AH.COMMODITY), nil
  AH.sellCard.listOffset = 0
  AH.Queue({ sell = AH.sell.search, card = true }, true)
  AH.PaintSell()
end

-- An item dropped on (or clicked onto) the sell slot: it goes back to its bag and onto the card.
function AH.TakeCursor()
  local loc = C_Cursor.GetCursorItem()
  if not loc then return end
  ClearCursor()
  AH.TakeItem(loc)
end

-- Search results for an item (a search answered, or a further page of it): the search in flight
-- takes them: the sell card its listings and the cheapest, your auctions' check the cheapest; the
-- cheapest also feeds the price store.
function AH.OnSearchResults(event, arg)
  local s, commodity = AH.pending, event:find("^COMMODITY") ~= nil
  local id = type(arg) == "table" and arg.itemID or arg
  local key = s and (s.sell or s.more)
  if not (key and key.itemID == id) then return end
  local cheapest = AH.Cheapest(commodity, key)
  AP.RecordSeen(id, cheapest)
  if (s.card or s.more) and AH.sell and AH.sell.id == id then AH.ReadListings(AH.sell, commodity, cheapest) end
  if s.check then AH.MarkUndercuts(id, cheapest, commodity) end
  AH.Done()
  AH.PaintSell()
end

-- A whole number typed into one of the form's boxes, kept between lo and hi; nil for anything else.
local function typedCount(text, lo, hi)
  local n = tonumber(text)
  return n and math.max(lo, math.min(hi, math.floor(n))) or nil
end

-- What typing in each of the form's boxes does to the sale s, from the text typed.
AH.FORM = {
  -- The quantity to put up in all (at most what can go up).
  qty = function(s, text) s.qty = typedCount(text, 1, s.max) or s.qty end,
  -- Units per auction.
  stack = function(s, text) s.stack = typedCount(text, 1, s.max) or s.stack end,
  -- How many stacks: the quantity becomes that many stacks (at most what can go up).
  stacks = function(s, text) local n = typedCount(text, 1, s.max) if n then s.qty = math.min(s.max, n * s.stack) end end,
  -- The price, per unit or per (full) stack by the toggle; nothing readable goes back to the suggestion.
  price = function(s, text) local p = AH.ParseMoney(text) s.unit = p and (AH.perStack and math.floor(p / s.stack) or p) end,
  -- A bid per item (items only); nothing for none.
  bid = function(s, text) s.bid = AH.ParseMoney(text) end,
}

-- What each Max button sets on the sale s.
AH.MAX = {
  -- The quantity: all that can go up.
  qty = function(s) s.qty = s.max end,
  -- The stack size: the whole quantity in one.
  stack = function(s) s.stack = s.qty end,
}

-- Something typed into the form's box `name` (or its Max clicked, with `max`): the sale takes it.
function AH.TypeForm(name, text, max)
  if not AH.sell then return end
  if max then AH.MAX[name](AH.sell) else AH.FORM[name](AH.sell, text) end
  AH.PaintSell()
end

-- The price box's toggle: a price typed there is per unit or per (full) stack.
function AH.TogglePerStack()
  AH.perStack = not AH.perStack
  AH.PaintSell()
end

-- A listing clicked: its price becomes the card's, less the undercut rule unless it's yours.
function AH.ClickListing(r)
  local s, l = AH.sell, r.listing
  if not (s and l) then return end
  s.unit = l.mine and l.unit or (AH.UNDERCUT[AH.settings.undercut] or AH.UNDERCUT.silver)(l.unit)
  AH.PaintSell()
end

-- Vendor floor --------------------------------------------------------------------------------

-- An item's vendor sell price per unit (C_Item.GetItemInfo's sellPrice), or nil when the client
-- doesn't know it yet, hides it, or the vendor won't buy it.
function AH.VendorPrice(id)
  local price = ns.PlainNumber((select(11, C_Item.GetItemInfo(id))))
  return price and price > 0 and price or nil
end

-- Whether a unit price is under the sale's item's vendor sell price.
function AH.UnderVendor(s, price)
  local vendor = AH.VendorPrice(s.id)
  return price ~= nil and vendor ~= nil and price < vendor
end

-- Posting ------------------------------------------------------------------------------------

-- The unit price the next stack goes up at, when Post can put it up: a sale with units left and
-- a price (and a bid under it; not under the vendor's with "Never post under vendor price"), its
-- item in the bags, and the game's message throttle ready.
function AH.PostPrice(s)
  local price = s and s.qty > s.done and AH.SellPrice(s)
  if not price or (s.bid and s.bid >= price) or not AH.SellLocation(s) then return nil end
  if AH.settings.vendorFloor and AH.UnderVendor(s, price) then return nil end
  if C_AuctionHouse.IsThrottledMessageSystemReady() then return price end
end

-- A stack went up, or was skipped: on to the next; after the last, the card empties and its line
-- keeps the count.
function AH.NextStack(s, n)
  s.passed, s.done = s.passed + 1, s.done + n
  AH.sellStatus = string.format("posted %d of %d", s.posted, AH.StackCount(s))
  if s.done >= s.qty then AH.sell = nil end
  AH.PaintSell()
end

-- Post (the button's click, never a timer or an event): puts the next stack up, one restricted
-- call per click. A true answer means the game wants the post confirmed: that is the game's to
-- ask, so the card says so and keeps the stack.
function AH.Post()
  local s = AH.sell
  local price = AH.PostPrice(s)
  if not price then return end
  local api, loc, d, n = C_AuctionHouse, AH.SellLocation(s), AH.Duration(s), stackSize(s)
  local confirm
  if s.commodity then confirm = api.PostCommodity(loc, d, n, price) else confirm = api.PostItem(loc, d, n, s.bid, price) end
  if confirm then return ns.Chat("The game wants this price confirmed: list it from the game's own Sell tab.") end
  s.posted = s.posted + 1
  AH.NextStack(s, n)
end

-- Skip: the next stack stays in the bags; on to the one after.
function AH.SkipStack()
  local s = AH.sell
  if s and s.qty > s.done then AH.NextStack(s, stackSize(s)) end
end

-- Stop: the sale ends here; the card empties and its line keeps the count.
function AH.StopSelling()
  local s = AH.sell
  if s then AH.sellStatus = string.format("posted %d of %d", s.posted, AH.StackCount(s)) end
  AH.sell = nil
  AH.PaintSell()
end

-- The sell card --------------------------------------------------------------------------------

-- Copper as money text, or `none` without a value.
local function money(copper, none)
  return copper and AP.Money(copper) or none
end

-- The sell card's lines for its sale: the cheapest now ("none up" after a search found none),
-- the 7-day low, the next stack's deposit with the length, and the unit price it will ask.
local function sellValues(s)
  local d, label = AH.Duration(s)
  local price, dep = AH.SellPrice(s), deposit(s, d, AH.SellLocation(s))
  local now = money(s.cheapest, s.searched and "none up" or "...")
  return { now, money(AP.Low7(s.id), "none"), dep and (AP.Money(dep) .. " · " .. label) or "", money(price, "") }
end

-- A button on or off.
local function enable(b, on)
  if on then b:Enable() else b:Disable() end
end

-- A form box shows a value (blank for none), unless it has the typing.
local function show(box, value)
  if not box:HasFocus() then box:SetText(value and tostring(value) or "") end
end

-- The form's boxes for the sale s (or nil): quantity, stack size, stacks, the price (per unit or
-- per stack by the toggle) and the bid, shown for an item only.
local function paintBoxes(c, s)
  local price = s and AH.SellPrice(s)
  show(c.qty, s and s.qty)
  show(c.stack, s and s.stack)
  show(c.stacks, s and AH.StackCount(s))
  show(c.price, price and AP.Money(price * (AH.perStack and s.stack or 1)))
  show(c.bid, s and s.bid and AP.Money(s.bid))
  c.bid:SetShown(s ~= nil and not s.commodity)
end

-- The form for the sale s (or nil): its boxes, the toggle, the length, the count ("posted 3 of
-- 10", kept after the last stack or Stop), and Skip and Stop while there is a sale.
local function paintForm(c, s)
  paintBoxes(c, s)
  c.perStack.text:SetText(AH.perStack and "per stack" or "per unit")
  c.length:Refresh()
  c.status:SetText(s and string.format("posted %d of %d", s.posted, AH.StackCount(s)) or AH.sellStatus or "")
  enable(c.skip, s ~= nil)
  enable(c.stop, s ~= nil)
end

-- The price line: in red, and saying so, while the price is under the item's vendor sell price.
local function paintPriceLine(c, s)
  local line, under = c.lines[#c.lines], s ~= nil and AH.UnderVendor(s, AH.SellPrice(s))
  line:SetText(under and "Under vendor price" or AH.SELL_LINES[#AH.SELL_LINES])
  T.Color(line, under and "bad" or "text2")
  T.Color(line.value, under and "bad" or "accent")
end

-- A listing's row: its price per unit, how many, the time left, and a mark when it's yours.
local function paintListing(r, l)
  r:SetShown(l ~= nil)
  r.listing = l
  if not l then return end
  r.price:SetText(AP.Money(l.unit))
  r.qty:SetText("x " .. l.qty)
  r.time:SetText(l.time)
  r.mark:SetShown(l.mine)
end

-- The sale's listings under the form, from the scroll offset, with their header while there are any.
local function paintListings(c, s)
  local rows = s and s.rows or {}
  c.listHead:SetShown(#rows > 0)
  for i, r in ipairs(c.listings) do paintListing(r, rows[c.listOffset + i]) end
end

-- The sell card: the item's icon and lines (the price line red under the vendor's), the form,
-- the listings, and Post, which works only
-- when the next stack can go up (AH.PostPrice).
function AH.PaintSell()
  local c, s = AH.sellCard, AH.sell
  if not c then return end
  local values = s and sellValues(s) or {}
  c.icon:SetTexture(s and C_Item.GetItemIcon(s.loc) or nil)
  for i, line in ipairs(c.lines) do line.value:SetText(values[i] or "") end
  paintForm(c, s)
  paintListings(c, s)
  paintPriceLine(c, s)
  enable(c.post, AH.PostPrice(s) ~= nil)
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

-- The form's box `name`: `label` on its left (lw wide), the box `width` wide at x on form row
-- `row`; typing in it goes to AH.TypeForm.
local function field(c, name, label, x, row, lw, width)
  local e = W.Input(c, width)
  e:SetHeight(22)
  e:SetPoint("TOPLEFT", x + lw, AH.FORM_Y - (row - 1) * AH.FORM_ROW)
  e.label = T.Text(e:CreateFontString(nil, "OVERLAY"), "small", "text2")
  e.label:SetPoint("RIGHT", e, "LEFT", -4, 0)
  e.label:SetText(label)
  e:SetScript("OnTextChanged", function(self, user) if user then AH.TypeForm(name, self:GetText()) end end)
  c[name] = e
end

-- A Max button after the form's box `name`.
local function maxButton(c, name)
  local b = W.Button(c, "Max", function() AH.TypeForm(name, nil, true) end, 36)
  b:SetHeight(22)
  b:SetPoint("LEFT", c[name], "RIGHT", 2, 0)
  c[name .. "Max"] = b
end

-- The form under the undercut rule: quantity and stack size, each with Max; the number of stacks
-- and the bid; the price with its per unit / per stack toggle.
local function sellForm(c)
  field(c, "qty", "Quantity", 0, 1, 52, 40)
  maxButton(c, "qty")
  field(c, "stack", "Stack", 134, 1, 36, 40)
  maxButton(c, "stack")
  field(c, "stacks", "Stacks", 0, 2, 52, 40)
  field(c, "bid", "Bid", 134, 2, 36, 76)
  field(c, "price", "Price", 0, 3, 52, 110)
  c.perStack = W.Button(c, "per unit", function() AH.TogglePerStack() end, 70)
  c.perStack:SetHeight(22)
  c.perStack:SetPoint("LEFT", c.price, "RIGHT", 4, 0)
end

-- The auction length: the game's three, as segments.
local function lengthRow(c)
  c.length = W.Choice(c, "", AH.DurationChoices(), function() return (AH.Duration(AH.sell)) end,
    function(d) AH.PickDuration(d) end, AH.WIDTH - 2 * AH.PAD)
  c.length:SetPoint("TOPLEFT", 0, AH.FORM_Y - 3 * AH.FORM_ROW)
end

-- The posting line: the count on the left; Skip, Stop and Post on the right.
local function postRow(c)
  local y = AH.FORM_Y - 3 * AH.FORM_ROW - 32
  c.post = W.Primary(c, "Post", function() AH.Post() end, 60)
  c.post:SetPoint("TOPRIGHT", 0, y)
  c.stop = W.Button(c, "Stop", function() AH.StopSelling() end, 44)
  c.stop:SetPoint("RIGHT", c.post, "LEFT", -4, 0)
  c.skip = W.Button(c, "Skip", function() AH.SkipStack() end, 44)
  c.skip:SetPoint("RIGHT", c.stop, "LEFT", -4, 0)
  c.status = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.status:SetPoint("TOPLEFT", 0, y - 6)
end

-- The wheel over the listings scrolls them; near the end, with more on the house, the next page is asked for.
local function scrollListings(c, delta)
  local s = AH.sell
  if not s then return end
  local card = c:GetParent()
  card.listOffset = math.max(0, math.min(#(s.rows or {}) - AH.LIST_ROWS, card.listOffset - delta))
  if card.listOffset + AH.LIST_ROWS >= #(s.rows or {}) - 1 then askMore(s) end
  AH.PaintSell()
end

-- A listing row's parts: the mark for yours, the price per unit, how many and the time left.
local function listingParts(r)
  r.mark = W.Flat(r, "ARTWORK", "accent")
  r.mark:SetSize(6, 6)
  r.mark:SetPoint("LEFT", 0, 0)
  r.price = T.Text(r:CreateFontString(nil, "OVERLAY"), "number", "gold")
  r.price:SetPoint("LEFT", 10, 0)
  r.qty = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "text2")
  r.qty:SetPoint("RIGHT", -70, 0)
  r.time = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "text2")
  r.time:SetPoint("RIGHT", -2, 0)
end

-- One of the listings' column headers, at a point of the header line.
local function listHeader(head, text, point, x)
  local fs = T.Text(head:CreateFontString(nil, "OVERLAY"), "small", "muted")
  fs:SetPoint(point, x, 0)
  fs:SetText(text)
end

-- The listings under the posting line: the column headers, then AH.LIST_ROWS rows (a click takes
-- a row's price), which the wheel scrolls.
local function listingRows(c)
  c.list = CreateFrame("Frame", nil, c)
  c.list:SetPoint("TOPLEFT", 0, AH.LIST_Y)
  c.list:SetPoint("TOPRIGHT", 0, AH.LIST_Y)
  c.list:SetHeight(14 + AH.LIST_ROWS * AH.ROW_H)
  c.listHead = CreateFrame("Frame", nil, c.list)
  c.listHead:SetPoint("TOPLEFT")
  c.listHead:SetPoint("TOPRIGHT")
  c.listHead:SetHeight(14)
  c.list:EnableMouseWheel(true)
  c.list:SetScript("OnMouseWheel", scrollListings)
end

-- The listings' headers and rows.
local function listings(c)
  listingRows(c)
  listHeader(c.listHead, "Up now, each", "LEFT", 10)
  listHeader(c.listHead, "Qty", "RIGHT", -70)
  listHeader(c.listHead, "Time left", "RIGHT", -2)
  c.listings, c.listOffset = {}, 0
  for i = 1, AH.LIST_ROWS do
    c.listings[i] = AH.Row(c.list, i, -14, function(r) AH.ClickListing(r) end)
    listingParts(c.listings[i])
  end
end

-- The sell card: the slot, its lines, the undercut rule, the form, the length, the posting line
-- and the listings.
function AH.BuildSell(f)
  local c = AH.Card(f, "Sell", AH.SELL_Y, AH.SELL_H)
  AH.sellCard = c
  sellSlot(c)
  sellLines(c)
  undercutRow(c)
  sellForm(c)
  lengthRow(c)
  postRow(c)
  listings(c)
  hooksecurefunc(AuctionHouseFrame, "SetPostItem", function(_, loc) AH.TakeItem(loc) end)
end
