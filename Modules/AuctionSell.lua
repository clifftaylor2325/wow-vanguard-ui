-- Auction helper, the Sell card (Modules/AuctionHelper.lua holds the tabs,
-- the search queue, the scan and the slash commands): the sell slot and the
-- item it takes (TakeItem, TakeCursor, or the game's own sell frame), the
-- price check's results (Cheapest), the undercut rules and the price to ask
-- (Suggest), and the form: quantity and stack size (each with Max; the stack
-- size starts at the vanilla preset for the item's class, StackPreset), the
-- number of stacks, a price typed per unit or per stack, a bid for items, and
-- the auction length (Duration). Post puts up one stack per click and loads
-- the next ("posted 3 of 10"); Skip passes a stack, Stop ends the sale.
--
-- Standing rules here: PostItem and PostCommodity (and ConfirmPost*) run only
-- inside Post's click, one call per click; the only hook is a post-hook on the game's
-- SetPostItem that reads the item it was given (and keeps Posting open), and nothing writes into the
-- game's auction frames; price checks go through AH.Queue (one in flight, at
-- most 60 a minute); every price and quantity goes through ns.PlainNumber
-- before arithmetic; and both paths work: a commodity at a unit price, or an
-- item (each auction one item) with a buyout and an optional bid.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The sell card's lines.
AH.SELL_LINES = { "Cheapest now", "7-day low", "Deposit", "Your price" }
-- The form: where its rows start (down from the card's top), how far apart they are, and the
-- width of the label column before its boxes.
AH.FORM_Y, AH.FORM_ROW, AH.LABEL_W = -110, 26, 60
-- The Up now card (the listings up for the item on the sell card): its rows (how many, until
-- AH.Build counts them) and its columns: the price each, how many, and the time left.
AH.LIST_ROWS = 4
AH.UP_COLUMNS = { { key = "price", title = "Price each", width = 100, side = "RIGHT", role = "number", color = "gold" },
  { key = "qty", title = "Qty", width = 60, side = "RIGHT", role = "small", color = "text2" },
  { key = "time", title = "Time left", width = 90, side = "LEFT", role = "small", color = "text2" } }
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
-- (an item locks while the house takes it): its location, else nil and whether it was locked.
local function holds(s, bag, slot)
  local info = bag and C_Container.GetContainerItemInfo(bag, slot)
  if not (info and ns.PlainNumber(info.itemID) == s.id) then return nil end
  local loc = ItemLocation:CreateFromBagAndSlot(bag, slot)
  local key = C_AuctionHouse.GetItemKeyFromItem(loc)
  if not (key and key.itemLevel == s.key.itemLevel and key.itemSuffix == s.key.itemSuffix) then return nil end
  if info.isLocked then return nil, true end
  return loc
end

-- Where the sale's item is now: its own slot while it's still there, else the first bag slot
-- that holds it (the next stack, once the one before went up); nil when none does, then whether
-- one was found locked (still with the house).
function AH.SellLocation(s)
  local found, locked = holds(s, s.loc:GetBagAndSlot())
  for bag = 0, AH.LAST_BAG do
    for slot = 1, found and 0 or ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do
      local loc, lk = holds(s, bag, slot)
      found, locked = found or loc, locked or lk
    end
  end
  s.loc = found or s.loc
  return found, locked
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

-- A listing's time left: hours or minutes from its seconds, else its band as the shop's view
-- names it (AH.BandText: the game's words, TIME_LEFT_SHORT...), else nothing.
function AH.TimeLeft(r)
  local secs = ns.PlainNumber(r.timeLeftSeconds)
  if secs then return secs >= 3600 and math.floor(secs / 3600) .. " h" or math.max(1, math.ceil(secs / 60)) .. " min" end
  return AH.BandText(ns.PlainNumber(r.timeLeft))
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
function AH.ReadSale(s, commodity, cheapest)
  s.cheapest, s.searched = cheapest, true
  s.rows, s.full = AH.Listings(commodity, s.search), hasFull(s)
end

-- Near the end of the listings, with more on the house: the next page is queued (a "more" search,
-- one at a time; AH.Send asks for it with AH.RequestMore).
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
  AH.upCard.table.offset = 0
  AH.Queue({ sell = AH.sell.search, card = true }, true)
  AH.PaintSell()
  return true
end

-- An item dropped on (or clicked onto) the sell slot: it goes back to its bag and onto the card.
function AH.TakeCursor()
  local loc = C_Cursor.GetCursorItem()
  if not loc then return end
  ClearCursor()
  AH.TakeItem(loc)
end

-- Search results for item id (a search answered, or a further page of it; AH.OnSearchEvent): the
-- search s in flight takes them when it is a price check or a page of the sell card's: the sell card
-- its listings and the cheapest, your auctions' check the cheapest; the cheapest also feeds the price store.
function AH.OnSearchResults(event, id, s)
  local commodity = event:find("^COMMODITY") ~= nil
  local key = s and (s.sell or s.more)
  if not (key and key.itemID == id) then return end
  local cheapest = AH.Cheapest(commodity, key)
  AP.RecordSeen(id, cheapest)
  if (s.card or s.more) and AH.sell and AH.sell.id == id then AH.ReadSale(AH.sell, commodity, cheapest) end
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

-- A listing clicked (on the Up now card): its price becomes the card's, less the undercut rule unless it's yours.
function AH.ClickListing(r)
  local s, l = AH.sell, r.item
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

-- Why Post can't put the next stack up, by the key AH.PostCheck gives: shown on the card's count
-- line while Post is off, and in chat when a click comes too soon (the game busy since the paint).
AH.POST_REASONS = {
  price = "no price yet: wait for the price check, or type one",
  bid = "the bid must be under the buyout",
  bags = "the item isn't in your bags",
  vendor = "under the vendor price",
  money = "not enough money for the deposit",
  busy = "waiting for the auction house",
}

-- A bid as the game takes it (rounded up to silver without copper prices, as the price is), or nil.
local function bidFor(s)
  return s.bid and forGame(s.bid)
end

-- The sale's unit price when it has one it may post at (and a bid under it), else why not.
local function priceCheck(s)
  local price = AH.SellPrice(s)
  if not price then return "price" end
  if s.bid and bidFor(s) >= price then return "bid" end
  return nil, price
end

-- Whether the money you have covers the next stack's deposit at location loc (when both are known).
local function canPay(s, loc)
  local dep, money = deposit(s, (AH.Duration(s)), loc), ns.PlainNumber(GetMoney())
  return not (dep and money) or money >= dep
end

-- Whether Post can put the sale's next stack up now: nil, the unit price and the item's location;
-- else why not ("sold" when nothing is left to post; a key of AH.POST_REASONS otherwise): a price
-- (and a bid under it), the item in the bags, not under the vendor's price with "Never post under
-- vendor price", the deposit covered, and the game's message throttle ready.
function AH.PostCheck(s)
  if not (s and s.qty > s.done) then return "sold" end
  local why, price = priceCheck(s)
  local loc, locked = nil, false
  if not why then loc, locked = AH.SellLocation(s) end
  if why or not loc then return why or (locked and "busy" or "bags") end
  if AH.settings.vendorFloor and AH.UnderVendor(s, price) then return "vendor" end
  if not canPay(s, loc) then return "money" end
  if not C_AuctionHouse.IsThrottledMessageSystemReady() then return "busy" end
  return nil, price, loc
end

-- A stack went up, or was skipped: on to the next; after the last, the card empties and its line
-- keeps the count.
function AH.NextStack(s, n)
  s.passed, s.done, s.pending = s.passed + 1, s.done + n, nil
  AH.sellStatus = string.format("posted %d of %d", s.posted, AH.StackCount(s))
  if s.done >= s.qty then AH.sell = nil end
  AH.PaintSell()
end

-- A click on Post that can't post (the game went busy after the card was painted): chat says why,
-- and the card is painted again, so Post shows off until it can.
local function refused(why)
  if AH.POST_REASONS[why] then ns.Chat("Can't post yet: " .. AH.POST_REASONS[why] .. ".") end
  AH.PaintSell()
end

-- What the game answers to a post, as chat says it (AH.OnPostAnswer): by event, the text, which of
-- the event's values goes in its %s, and whether the first value must name this addon.
AH.POST_ANSWERS = {
  AUCTION_HOUSE_POST_ERROR = { "the auction house refused it" },
  AUCTION_HOUSE_POST_WARNING = { "the game wants it confirmed" },
  AUCTION_HOUSE_SHOW_ERROR = { "the auction house sent error %s", 1, nil, "ErrorName" },
  AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED = { "the game dropped it (too many messages at once)" },
  UI_ERROR_MESSAGE = { "the game said \"%s\"", 2 },
  ADDON_ACTION_BLOCKED = { "the game blocked %s", 2, true },
  ADDON_ACTION_FORBIDDEN = { "the game blocked %s", 2, true },
}
-- Seconds after a click on Post that the game's answers above count as answers to it.
AH.POST_ANSWER_TIME = 3

-- An auction house error code as chat says it: the code and the client's own name for it
-- (Enum.AuctionHouseError, e.g. 10 is DatabaseError), or the bare code when the client has none.
function AH.ErrorName(code)
  for name, value in pairs(Enum.AuctionHouseError or {}) do
    if value == code then return string.format("%s (%s)", tostring(code), name) end
  end
  return tostring(code)
end

-- An answer from the game (event e, its values ...) within AH.POST_ANSWER_TIME of a click on Post:
-- chat says it ("Post: the game said ..."); a secret value shows as "?".
function AH.OnPostAnswer(e, ...)
  local a = AH.POST_ANSWERS[e]
  if not (a and AH.postAt and GetTime() - AH.postAt <= AH.POST_ANSWER_TIME) then return end
  if a[3] and (...) ~= ADDON then return end
  local v = a[2] and select(a[2], ...)
  if ns.IsSecret(v) then v = "?" end
  local text = string.format(a[1], a[4] and not ns.IsSecret(v) and AH[a[4]](v) or tostring(v))
  ns.Chat("Post: " .. text .. ".")
  if AH.sell then AH.sell.answer = text AH.PaintSell() end
end

-- Chat says what a click on Post sends, before the game sees it: the stack's place in the sale,
-- how many, the unit price and the length. The game's last answer is forgotten.
local function sending(s, n, price, d)
  ns.Chat(string.format("Post: sending stack %d of %d (%d at %s each, %s).", s.passed + 1, AH.StackCount(s), n, AP.Money(price), AH.DurationName(d)))
  AH.postAt, s.answer = GetTime(), nil
end

-- The restricted call for the sale's next stack, without its "Post" or "ConfirmPost": Commodity
-- (location, length, quantity, unit price) or Item (location, length, quantity, bid, buyout).
local function postCall(s, loc, price)
  local d, n = AH.Duration(s), stackSize(s)
  if s.commodity then return "Commodity", { loc, d, n, price, n = 4 } end
  return "Item", { loc, d, n, bidFor(s), price, n = 5 }
end

-- A stack went up: counted, and on to the next.
local function posted(s, n)
  s.posted = s.posted + 1
  AH.NextStack(s, n)
end

-- The game wants the post confirmed: the card keeps it and asks, and Post becomes Confirm.
local function askConfirm(s, kind, args)
  s.pending = { kind = kind, args = args }
  ns.Chat("Post: the game asks you to confirm this price; click Confirm to list it.")
  AH.PaintSell()
end

-- Confirm (Post's click while the game asks): the post it held, confirmed, and on to the next.
local function confirmPost(s)
  local p = s.pending
  C_AuctionHouse["ConfirmPost" .. p.kind](unpack(p.args, 1, p.args.n))
  posted(s, p.args[3])
end

-- Post (the button's click, never a timer or an event): puts the next stack up, one restricted
-- call per click. A true answer means the game wants the post confirmed: the card asks, and the
-- next click (Confirm) confirms it.
function AH.Post()
  local s = AH.sell
  if s and s.pending then return confirmPost(s) end
  local why, price, loc = AH.PostCheck(s)
  if why then return refused(why) end
  local kind, args = postCall(s, loc, price)
  sending(s, args[3], price, args[2])
  if C_AuctionHouse["Post" .. kind](unpack(args, 1, args.n)) then return askConfirm(s, kind, args) end
  posted(s, args[3])
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

-- The count line: "posted 3 of 10" (kept after the last stack or Stop; the guide says the rest).
local function statusText(s)
  if not s then return AH.sellStatus or "" end
  return string.format("posted %d of %d", s.posted, AH.StackCount(s))
end

-- The form for the sale s (or nil): its boxes, the toggle, the length, the count line, and Skip
-- and Stop while there is a sale.
local function paintForm(c, s)
  paintBoxes(c, s)
  c.perStack.text:SetText(AH.perStack and "per stack" or "per unit")
  c.length:Refresh()
  c.status:SetText(statusText(s))
  enable(c.skip, s ~= nil)
  enable(c.stop, s ~= nil)
end

-- The posting guide under the Post line: its steps, and for each state of the sale (AH.GuideState)
-- the step it is on, the line saying what to do or what is happening, and whether something is in
-- the way (that line in the warn colour).
AH.GUIDE_STEPS = { "Item", "Price", "Post", "Listed" }
AH.GUIDE = {
  empty = { 1, "Drop an item on the slot, or click one in your bags." },
  done = { 4, "Finished: %s. Drop the next item to sell more." },
  checking = { 2, "Checking what it sells for..." },
  price = { 2, "No price found: type one in Price.", true },
  bid = { 2, "Lower the bid: it must be under the buyout.", true },
  vendor = { 2, "Raise the price: it's under what a vendor pays.", true },
  bags = { 1, "It isn't in your bags now: put it on the card again.", true },
  money = { 3, "You don't have the money for the deposit.", true },
  busy = { 3, "Waiting for the auction house to be ready..." },
  sent = { 3, "Stack %d sent: waiting for the auction house..." },
  ready = { 3, "Click Post to list stack %d of %d." },
  confirm = { 3, "The game asks you to confirm this price: click Confirm.", true },
  answer = { 3, "%s.", true },
}

-- Where the sale s stands for the guide (why: AH.PostCheck's answer): an AH.GUIDE key and the
-- values its line shows.
function AH.GuideState(s, why)
  if not s then return AH.sellStatus and "done" or "empty", AH.sellStatus end
  if s.pending then return "confirm" end
  if s.answer then return "answer", (s.answer:gsub("^%l", string.upper)) end
  if why == "price" and not s.searched then return "checking" end
  if why == "busy" and s.posted > 0 then return "sent", s.posted end
  if AH.GUIDE[why] then return why end
  return "ready", s.passed + 1, AH.StackCount(s)
end

-- The guide: the steps done, the one the sale is on (lit) and those to come, and its line.
local function paintGuide(c, s, why)
  local key, a, b = AH.GuideState(s, why)
  local g = AH.GUIDE[key]
  for i, step in ipairs(c.steps) do T.Color(step, i == g[1] and "accentText" or i < g[1] and "text" or "muted") end
  c.guide:SetText(string.format(g[2], a, b))
  T.Color(c.guide, g[3] and "warn" or "text")
end

-- The price line: in red, and saying so, while the price is under the item's vendor sell price.
local function paintPriceLine(c, s)
  local line, under = c.lines[#c.lines], s ~= nil and AH.UnderVendor(s, AH.SellPrice(s))
  line:SetText(under and "Under vendor price" or AH.SELL_LINES[#AH.SELL_LINES])
  T.Color(line, under and "bad" or "text2")
  T.Color(line.value, under and "bad" or "accentText")
end

-- A listing's row on the Up now card: its price per unit, how many, the time left, and the flag
-- when it's yours (the item is the sell card's, so the row names none).
local function paintListing(r, l)
  r.icon:SetTexture(nil)
  r.name:SetText("")
  r.cells.price:SetText(AP.Money(l.unit))
  r.cells.qty:SetText("x " .. l.qty)
  r.cells.time:SetText(l.time)
  r.flag:SetShown(l.mine)
end

-- The Up now card's status line: what to do without a sale, "searching..." until its price
-- check answers, "none up" when it found nothing.
local function upStatus(s)
  if not s then return "Put an item on the Sell card to see what's up now." end
  if #(s.rows or {}) > 0 then return "" end
  return s.searched and "none up" or "searching..."
end

-- The listings up now for the sale (none without one), from the table's scroll offset.
function AH.PaintUp(s)
  local t = AH.upCard.table
  t:SetItems(s and s.rows or {})
  t:SetStatus(upStatus(s))
end

-- The sell card's top: the item's icon and lines (the price line red under the vendor's).
local function paintItem(c, s)
  local values = s and sellValues(s) or {}
  c.icon:SetTexture(s and C_Item.GetItemIcon(s.loc) or nil)
  for i, line in ipairs(c.lines) do line.value:SetText(values[i] or "") end
  paintPriceLine(c, s)
end

-- Post: on when the next stack can go up (why nil), or as Confirm while the game asks to confirm one.
local function paintPost(c, s, why)
  local asking = s ~= nil and s.pending ~= nil
  c.post.text:SetText(asking and "Confirm" or "Post")
  enable(c.post, why == nil or asking)
end

-- The sell card: the item, the form, the posting guide (what to do next, or why Post is off), its
-- history line, and Post, which works only when the next stack can go up (AH.PostCheck) or the game
-- asks to confirm one (then it reads Confirm); the Up now card beside it (the listings, or Your history).
function AH.PaintSell()
  local c, s = AH.sellCard, AH.sell
  if not c then return end
  local why = AH.PostCheck(s)
  paintItem(c, s)
  paintForm(c, s)
  paintGuide(c, s, why)
  paintPost(c, s, why)
  AH.PaintHistoryLine(c, s)
  AH.PaintUp(s)
  AH.PaintHistory(AH.upCard, s)
end

-- The sell card's lines: a label on the left of the space beside the slot, its value on the right.
local function sellLines(c)
  c.lines = {}
  for i, label in ipairs(AH.SELL_LINES) do
    local l = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
    l:SetPoint("TOPLEFT", 44, -20 - (i - 1) * 14)
    l:SetText(label)
    l.value = T.Text(c:CreateFontString(nil, "OVERLAY"), i == #AH.SELL_LINES and "number" or "small", i == #AH.SELL_LINES and "accentText" or "text")
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
  c.slot:SetScript("OnClick", ns.Guard("click sell slot", AH.TakeCursor))
  c.icon = T.Crop(c.slot:CreateTexture(nil, "ARTWORK"))
  c.icon:SetPoint("TOPLEFT", 2, -2)
  c.icon:SetPoint("BOTTOMRIGHT", -2, 2)
end

-- The undercut rule (live), and the card repainted with it.
local function undercutRow(c)
  c.undercut = W.Choice(c, "Undercut by", AH.UNDERCUT_CHOICES, function() return AH.settings.undercut end,
    function(v) AH.settings.undercut = v AH.PaintSell() end, AH.WIDTH - 2 * AH.PAD - 2 * AH.INSET)
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

-- The form under the undercut rule, a field a row: quantity and stack size, each with Max; the
-- number of stacks, with the bid beside it (an item's only, so a commodity leaves no empty row);
-- the price with its per unit / per stack toggle.
local function sellForm(c)
  field(c, "qty", "Quantity", 0, 1, AH.LABEL_W, 60)
  maxButton(c, "qty")
  field(c, "stack", "Stack", 0, 2, AH.LABEL_W, 60)
  maxButton(c, "stack")
  field(c, "stacks", "Stacks", 0, 3, AH.LABEL_W, 60)
  field(c, "bid", "Bid", 128, 3, 28, 100)
  field(c, "price", "Price", 0, 4, AH.LABEL_W, 110)
  c.perStack = W.Button(c, "per unit", function() AH.TogglePerStack() end, 70)
  c.perStack:SetHeight(22)
  c.perStack:SetPoint("LEFT", c.price, "RIGHT", 4, 0)
end

-- The auction length: the game's three, as segments, under the form.
local function lengthRow(c)
  c.length = W.Choice(c, "", AH.DurationChoices(), function() return (AH.Duration(AH.sell)) end,
    function(d) AH.PickDuration(d) end, AH.WIDTH - 2 * AH.PAD - 2 * AH.INSET)
  c.length:SetPoint("TOPLEFT", 0, AH.FORM_Y - 4 * AH.FORM_ROW)
end

-- A small line of the card at y, on the left.
local function smallLine(c, y)
  local fs = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  fs:SetPoint("TOPLEFT", 0, y)
  return fs
end

-- The posting line: Skip, Stop and Post on the right, the count on the left under them, and the
-- item's history line (Modules/AuctionLedger.lua) under that.
local function postRow(c)
  local y = AH.FORM_Y - 4 * AH.FORM_ROW - 32
  c.post = W.Primary(c, "Post", function() AH.Post() end, 60)
  c.post:SetPoint("TOPRIGHT", 0, y)
  c.stop = W.Button(c, "Stop", function() AH.StopSelling() end, 44)
  c.stop:SetPoint("RIGHT", c.post, "LEFT", -4, 0)
  c.skip = W.Button(c, "Skip", function() AH.SkipStack() end, 44)
  c.skip:SetPoint("RIGHT", c.stop, "LEFT", -4, 0)
  c.status, c.historyLine = smallLine(c, y - 6), smallLine(c, y - 30)
end

-- The posting guide under the history line: its numbered steps in a row, and the line under them.
local function guideRow(c)
  local y = AH.FORM_Y - 4 * AH.FORM_ROW - 86
  c.steps = {}
  for i, name in ipairs(AH.GUIDE_STEPS) do
    c.steps[i] = smallLine(c, y)
    c.steps[i]:SetPoint("TOPLEFT", (i - 1) * 64, y)
    c.steps[i]:SetText(i .. "  " .. name)
  end
  c.guide = smallLine(c, y - 18)
  c.guide:SetPoint("RIGHT")
end

-- Near the end of the listings on the Up now card, with more on the house: the next page is asked for.
local function moreListings()
  if AH.sell then askMore(AH.sell) end
end

-- The Up now card on a column (h tall): the listings up for the item on the sell card, as a table
-- (yours flagged in the accent; a click takes a price; the wheel scrolls, and near the end the
-- next page is asked for), with Your history in its place on a toggle (Modules/AuctionLedger.lua).
function AH.BuildUp(column, h)
  local c = AH.Card(column, "Up now", -AH.PAD, h)
  AH.upCard = c
  c.table = AH.Table(c, AH.UP_COLUMNS, AH.LIST_ROWS, { flag = "accent", paintRow = paintListing, onClick = AH.ClickListing, onNear = moreListings })
  AH.TableUnder(c.table, c)
  AH.BuildHistory(c)
end

-- The sell card (h tall): the slot, its lines, the undercut rule, the form, the length, the
-- posting line and the history line.
function AH.BuildSell(f, h)
  local c = AH.Card(f, "Sell", -AH.PAD, h)
  AH.sellCard = c
  sellSlot(c)
  sellLines(c)
  undercutRow(c)
  sellForm(c)
  lengthRow(c)
  postRow(c)
  guideRow(c)
  hooksecurefunc(AuctionHouseFrame, "SetPostItem", ns.Guard("hook SetPostItem", function(_, loc) if AH.TakeItem(loc) then AH.KeepSelling() end end))
end
