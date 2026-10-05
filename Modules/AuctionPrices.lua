-- Auction prices: the cheapest unit price, the units up and the market value
-- (AP.Summary) of every item at the auction house when you last scanned it
-- (Auction helper's "Scan the auction house"), and the cheapest price each
-- search since has seen (AP.RecordSeen, AP.RecordBrowse), kept per realm and
-- faction (each has its own auction house) with each day's values for 30
-- days, so item tooltips can say "AH: 12s 50c · market 14s 0c (today)" (and
-- what a stack comes to) and the sell card can show the lowest price of the
-- last 7 days. The auction house
-- keeps no price history of its own (its item info has no prices), so this is
-- the only one there is. A price not seen for 30 days is dropped at login (and
-- a realm and faction left with none), and past AP.MAX_ITEMS items in one
-- house the ones priced longest ago go. Shopping lists stay account-wide.

local ADDON, ns = ...

local T = ns.Theme

local AP = {}
ns.AuctionPrices = AP

-- Items priced at most per house, and the share of them a prune keeps (6000 -> 5400); days of
-- values kept per item; days a price is kept; seconds in a day.
AP.MAX_ITEMS, AP.KEEP, AP.DAYS, AP.MAX_AGE, AP.DAY = 6000, 0.9, 30, 30, 86400
-- The share of an item's units (per cent) its market value is taken over: the cheapest 15 %.
AP.MARKET_PCT = 15

-- The wall clock in seconds (0 when the client can't say).
function AP.Now()
  local clock = _G.time
  return type(clock) == "function" and ns.PlainNumber(clock()) or 0
end

-- The day a time falls on: whole days since 1970 (UTC).
function AP.Day(t)
  return math.floor(t / AP.DAY)
end

-- The account's auction data: ForeverUIDB.ah = { lists (Auction helper's shopping lists, for every
-- character), list (the one in use), houses = { ["Realm-Faction"] = a house, see AP.House } }.
function AP.Store()
  ForeverUIDB.ah = ns.Fill(type(ForeverUIDB.ah) == "table" and ForeverUIDB.ah or {}, { lists = {}, houses = {} })
  return ForeverUIDB.ah
end

-- The auction house you use: your realm's normalized name (as in "Name-Realm", the same on every
-- character) and your faction, as "Realm-Alliance", "Realm-Horde" or "Realm-none".
function AP.HouseKey()
  return AP.Realm() .. "-" .. ns.FactionArt.Faction()
end

-- Your realm's normalized name (no spaces or hyphens), else its name as the client shows it.
function AP.Realm()
  return GetNormalizedRealmName() or GetRealmName()
end

-- This realm and faction's prices: { prices = { [itemID] = an item }, count (items priced),
-- lastScan }. An item is { min, t (the cheapest unit price when last seen, and when), listings
-- (how many listings the last scan counted),
-- days = { [day] = that day's low }, qtys = { [day] = units up }, markets = { [day] = market value } };
-- a day's units and market value are the last seen that day. Prices of older versions have days only.
function AP.House()
  local houses, key = AP.Store().houses, AP.HouseKey()
  houses[key] = ns.Fill(type(houses[key]) == "table" and houses[key] or {}, { prices = {}, count = 0, lastScan = 0 })
  return houses[key]
end

-- Once: the prices kept for the whole account before they were kept per realm and faction
-- (ForeverUIDB.ah.prices and lastScan) move into this realm and faction's house; an item the
-- house already has keeps whichever was seen last. AP.Prune recounts.
function AP.Migrate()
  local store = AP.Store()
  if type(store.prices) ~= "table" then return end
  local house = AP.House()
  for id, p in pairs(store.prices) do
    local mine = house.prices[id]
    if type(p) == "table" and (not mine or mine.t < p.t) then house.prices[id] = p end
  end
  house.lastScan = math.max(house.lastScan, tonumber(store.lastScan) or 0)
  store.prices, store.count, store.lastScan = nil, nil, nil
end

-- Copper as "1g 23s 45c", "12s 50c" or "90c".
function AP.Money(copper)
  local g, s, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  if g > 0 then return string.format("%dg %ds %dc", g, s, c) end
  if s > 0 then return string.format("%ds %dc", s, c) end
  return c .. "c"
end

-- Recording ----------------------------------------------------------------------------------

-- The prices listed, cheapest first, and how many units there are in all.
local function byPrice(prices)
  local sorted, units = {}, 0
  for price, n in pairs(prices) do sorted[#sorted + 1] = price units = units + n end
  table.sort(sorted)
  return sorted, units
end

-- The quantity-weighted mean unit price of the cheapest `want` units, rounded down.
local function meanOfCheapest(sorted, prices, want)
  local sum, got = 0, 0
  for _, price in ipairs(sorted) do
    local take = math.min(prices[price], want - got)
    sum, got = sum + take * price, got + take
    if got >= want then break end
  end
  return math.floor(sum / got)
end

-- One item's listings summed up (prices = { [unit price] = units listed at it }, at least one
-- unit): its cheapest unit price, its units, and its market value. The market value is the
-- quantity-weighted mean unit price of the cheapest AP.MARKET_PCT % of the units (rounded up, so
-- at least one): the price the cheap end of the supply sits at, which one undercutter's single
-- unit doesn't set and a few dear listings don't lift.
function AP.Summary(prices)
  local sorted, units = byPrice(prices)
  return sorted[1], units, meanOfCheapest(sorted, prices, math.ceil(units * AP.MARKET_PCT / 100))
end

-- Notes an item seen at time t: its cheapest unit price (now, and the low of t's day), and the
-- units up and market value when given (t's day keeps the last seen), and how many listings
-- (the item keeps the last count). A new item past AP.MAX_ITEMS evicts the items priced longest ago.
function AP.Record(itemID, unitPrice, t, qty, market, listings)
  local house, day = AP.House(), AP.Day(t)
  local p = house.prices[itemID]
  if not p then p = {} house.prices[itemID] = p house.count = house.count + 1 end
  ns.Fill(p, { days = {}, qtys = {}, markets = {} })
  p.min, p.t, p.listings = unitPrice, t, listings or p.listings
  p.days[day] = math.min(p.days[day] or unitPrice, unitPrice)
  p.qtys[day], p.markets[day] = qty or p.qtys[day], market or p.markets[day]
  if house.count > AP.MAX_ITEMS then AP.Evict() end
end

-- A price a search saw (not a whole scan): the item's last-seen price and that day's low, never
-- its units or market value (one search sees only part of the supply, so the scan's stay); nothing
-- without a plain item ID and price. t defaults to now.
function AP.RecordSeen(itemID, unitPrice, t)
  itemID, unitPrice = ns.PlainNumber(itemID), ns.PlainNumber(unitPrice)
  if itemID and unitPrice and unitPrice > 0 then AP.Record(itemID, unitPrice, t or AP.Now()) end
end

-- A browse result's item ID and price per unit, or nil: left out when it may hold a listing of
-- yours (containsOwnerItem, or hidden), when a number is hidden, and unless the house says its
-- price is per unit (a commodity) or per item that doesn't stack (equipment); the price of any
-- other item may be a stack's, and its sell search or a scan prices it per unit instead.
local function browsePrice(r)
  local key, mine = r.itemKey, r.containsOwnerItem
  if ns.IsSecret(mine) or mine then return nil end
  local info, id, price = C_AuctionHouse.GetItemKeyInfo(key), ns.PlainNumber(key.itemID), ns.PlainNumber(r.minPrice)
  if info and (info.isCommodity or info.isEquipment) and id and price then return id, price end
end

-- Browse results (the shop's searches and the game's own browse list): each item's cheapest price,
-- the lowest of its item keys, through AP.RecordSeen.
function AP.RecordBrowse(results, t)
  local low = {}
  for _, r in ipairs(results or {}) do
    local id, price = browsePrice(r)
    if id and (not low[id] or price < low[id]) then low[id] = price end
  end
  for id, price in pairs(low) do AP.RecordSeen(id, price, t) end
end

-- Forgets the items priced longest ago, down to AP.KEEP of AP.MAX_ITEMS.
function AP.Evict()
  local store, ids = AP.House(), {}
  for id, p in pairs(store.prices) do ids[#ids + 1] = { id, p.t or 0 } end
  table.sort(ids, function(a, b) return a[2] > b[2] end)
  local keep = math.floor(AP.MAX_ITEMS * AP.KEEP)
  for k = keep + 1, #ids do store.prices[ids[k][1]] = nil end
  store.count = math.min(#ids, keep)
end

-- Drops an item's day values (lows, units, market values) older than AP.DAYS days before today.
local function trimDays(p, today)
  for _, byDay in ipairs({ p.days, p.qtys or {}, p.markets or {} }) do
    for day in pairs(byDay) do
      if day <= today - AP.DAYS then byDay[day] = nil end
    end
  end
end

-- Drops a house's prices last seen more than AP.MAX_AGE days before now, and old day lows;
-- recounts, and returns how many are left.
local function pruneHouse(house, now)
  local today, n = AP.Day(now), 0
  for id, p in pairs(house.prices) do
    if p.t < now - AP.MAX_AGE * AP.DAY then house.prices[id] = nil else n = n + 1 trimDays(p, today) end
  end
  house.count = n
  return n
end

-- Prunes every realm and faction's house; one left without prices (or not a house) is forgotten.
function AP.Prune(now)
  local houses = AP.Store().houses
  for key, house in pairs(houses) do
    if type(house) ~= "table" or type(house.prices) ~= "table" or pruneHouse(house, now) == 0 then houses[key] = nil end
  end
end

-- Reading ------------------------------------------------------------------------------------

-- The lowest price of the last 7 days (today and the six before), or nil.
function AP.Low7(itemID, now)
  local p, today, low = AP.House().prices[itemID], AP.Day(now or AP.Now()), nil
  for day, copper in pairs(p and p.days or {}) do
    if day > today - 7 and (not low or copper < low) then low = copper end
  end
  return low
end

-- How long ago a time was, in days: "today", "yesterday", "3 days ago".
function AP.Ago(t)
  local days = AP.Day(AP.Now()) - AP.Day(t)
  if days < 1 then return "today" end
  return days == 1 and "yesterday" or days .. " days ago"
end

-- n units at the cheapest price, and at the market value unless it's unknown or the same:
-- "12s 50c · market 14s 0c".
local function priceText(low, market, n)
  local text = AP.Money(low * n)
  if market and market ~= low then text = text .. " · market " .. AP.Money(market * n) end
  return text
end

-- An item tooltip's lines: "AH: 12s 50c · market 14s 0c (today)", the cheapest unit price and the
-- market value when a scan last saw it, and over a stack (Tooltips' count of the button under
-- the tooltip) the stack's worth at both, "AH x20: 2g 50s 0c · market 2g 80s 0c".
function AP.Line(tt, link)
  local p = AP.settings.tooltip and AP.House().prices[tonumber(link:match("item:(%d+)"))]
  if not p then return end
  local market, n = p.markets and p.markets[AP.Day(p.t)], ns.GetModule("Tooltips").StackOf(tt)
  tt:AddLine(string.format("AH: %s (%s)", priceText(p.min, market, 1), AP.Ago(p.t)), T.RGB("text2"))
  if n > 1 then tt:AddLine(string.format("AH x%d: %s", n, priceText(p.min, market, n)), T.RGB("text2")) end
end

-- Starts with Auction helper's settings: the account-wide prices of older versions moved to this
-- realm and faction (once), old prices pruned, and the tooltip line added.
function AP.Enable(settings)
  AP.settings = settings
  AP.Migrate()
  AP.Prune(AP.Now())
  ns.GetModule("Tooltips").AddItemLines(AP.Line)
end
