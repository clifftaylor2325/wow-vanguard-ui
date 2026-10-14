-- Auction prices: the cheapest unit price, the units up and the market value
-- (AP.Summary) of every item at the auction house when you last scanned it
-- (Auction helper's "Scan the auction house"), and the cheapest price each
-- search since has seen (AP.RecordSeen, AP.RecordBrowse), kept per realm and
-- faction (each has its own auction house) with each day's values for 7
-- days, so item tooltips can say "AH: 12s 50c · market 14s 0c (today)" (and
-- what a stack comes to) and the sell card can show the lowest price of the
-- last 7 days. The auction house
-- keeps no price history of its own (its item info has no prices), so this is
-- the only one there is. A price not seen for 30 days is dropped at login (and
-- a realm and faction left with none), and past AP.MAX_ITEMS items in one
-- house the ones priced longest ago go. Shopping lists stay account-wide.
-- From these prices it also works out what disenchanting a piece of gear is
-- worth (AP.Disenchant, vanilla's disenchanting tables), for a tooltip line.

local ADDON, ns = ...

local T = ns.Theme

local AP = {}
ns.AuctionPrices = AP

-- Items priced at most per house, and the share of them a prune keeps (6000 -> 5400); days of
-- values kept per item (the 7 days every reader looks at); days a price is kept; seconds in a day.
AP.MAX_ITEMS, AP.KEEP, AP.DAYS, AP.MAX_AGE, AP.DAY = 6000, 0.9, 7, 30, 86400
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

-- The account's auction data: VanguardDB.ah = { lists (Auction helper's shopping lists, for every
-- character), list (the one in use), houses = { [home key (ns.Home.Key)] = a house, see AP.House } }.
function AP.Store()
  VanguardDB.ah = ns.Fill(type(VanguardDB.ah) == "table" and VanguardDB.ah or {}, { lists = {}, houses = {} })
  return VanguardDB.ah
end

-- Your realm's normalized name (no spaces or hyphens), else its name as the client shows it.
function AP.Realm()
  return ns.Home.Realm()
end

-- This realm and faction's prices: { prices = { [itemID] = an item }, count (items priced),
-- lastScan }. An item is { min, t (the cheapest unit price when last seen, and when), listings
-- (how many listings the last scan counted),
-- days = { [day] = that day's low }, qtys = { [day] = units up }, markets = { [day] = market value } };
-- a day's units and market value are the last seen that day. Prices of older versions have days only.
function AP.House()
  local houses = AP.Store().houses
  local key = ns.Home.Adopt(houses)
  houses[key] = ns.Fill(type(houses[key]) == "table" and houses[key] or {}, { prices = {}, count = 0, lastScan = 0 })
  return houses[key]
end

-- Once: the prices kept for the whole account before they were kept per realm and faction
-- (VanguardDB.ah.prices and lastScan) move into this realm and faction's house; an item the
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

-- What hears of new prices (AP.OnChange): functions called with no arguments.
AP.listeners = {}

-- Adds fn() to the functions told that prices were recorded: once on the next frame however many
-- were (a whole scan is one call), so other addons (Vanguard.API.v1.RegisterForDBUpdate) can refresh.
function AP.OnChange(fn)
  AP.listeners[#AP.listeners + 1] = fn
end

-- Tells every listener, in the order added.
local function tellListeners()
  for _, fn in ipairs(AP.listeners) do fn() end
end

-- What hears of each price as it is recorded (AP.OnSeen): functions called with the item ID, its
-- cheapest unit price and the time.
AP.seenListeners = {}

-- Adds fn(itemID, unitPrice, t) to the functions told of each price recorded, at once (a scan
-- calls it for every item): Auction helper's deals and price alerts.
function AP.OnSeen(fn)
  AP.seenListeners[#AP.seenListeners + 1] = fn
end

-- Notes an item seen at time t: its cheapest unit price (now, and the low of t's day), and the
-- units up and market value when given (t's day keeps the last seen), and how many listings
-- (the item keeps the last count). A new item past AP.MAX_ITEMS evicts the items priced longest
-- ago. The listeners hear of it on the next frame, AP.OnSeen's at once.
function AP.Record(itemID, unitPrice, t, qty, market, listings)
  local house, day = AP.House(), AP.Day(t)
  local p = house.prices[itemID]
  if not p then p = {} house.prices[itemID] = p house.count = house.count + 1 end
  ns.Fill(p, { days = {}, qtys = {}, markets = {} })
  p.min, p.t, p.listings = unitPrice, t, listings or p.listings
  p.days[day] = math.min(p.days[day] or unitPrice, unitPrice)
  p.qtys[day], p.markets[day] = qty or p.qtys[day], market or p.markets[day]
  if house.count > AP.MAX_ITEMS then AP.Evict() end
  ns.Soon("auction prices changed", tellListeners)
  for _, fn in ipairs(AP.seenListeners) do fn(itemID, unitPrice, t) end
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

-- Disenchanting -----------------------------------------------------------------------------

-- Enum.ItemClass's Weapon and Armor (ItemConstantsDocumentation.lua).
AP.WEAPON, AP.ARMOR = 2, 4

-- What disenchanting gives, by item quality (2 green, 3 blue, 4 epic), as item level bands
-- { from, to, outcomes }; an outcome is { material's item ID, chance in per cent, least, most,
-- the chance for a weapon when it differs }. Greens give mostly dust (armour) or mostly essence
-- (weapons) and sometimes a shard; blues a shard; epics shards or Nexus Crystals.
-- UNVERIFIED: written from vanilla's well-known disenchanting tables as players publish them, not
-- from game data (the Forever UI source has none); check the bands, chances and quantities in game.
AP.DISENCHANT = {
  [2] = {
    { 5, 15, { { 10940, 80, 1, 2, 20 }, { 10938, 20, 1, 2, 80 } } },
    { 16, 20, { { 10940, 75, 2, 3, 20 }, { 10939, 20, 1, 2, 75 }, { 10978, 5, 1, 1 } } },
    { 21, 25, { { 10940, 75, 4, 6, 20 }, { 10998, 15, 1, 2, 70 }, { 10978, 10, 1, 1 } } },
    { 26, 30, { { 11083, 75, 1, 2, 20 }, { 11082, 20, 1, 2, 75 }, { 11084, 5, 1, 1 } } },
    { 31, 35, { { 11083, 75, 2, 5, 20 }, { 11134, 20, 1, 2, 75 }, { 11138, 5, 1, 1 } } },
    { 36, 40, { { 11137, 75, 1, 2, 20 }, { 11135, 20, 1, 2, 75 }, { 11139, 5, 1, 1 } } },
    { 41, 45, { { 11137, 75, 2, 5, 20 }, { 11174, 20, 1, 2, 75 }, { 11177, 5, 1, 1 } } },
    { 46, 50, { { 11176, 75, 1, 2, 20 }, { 11175, 20, 1, 2, 75 }, { 11178, 5, 1, 1 } } },
    { 51, 55, { { 11176, 75, 2, 5, 20 }, { 16202, 20, 1, 2, 75 }, { 14343, 5, 1, 1 } } },
    { 56, 60, { { 16204, 75, 1, 2, 20 }, { 16203, 20, 1, 2, 75 }, { 14344, 5, 1, 1 } } },
    { 61, 65, { { 16204, 75, 2, 5, 20 }, { 16203, 20, 2, 3, 75 }, { 14344, 5, 1, 1 } } },
  },
  [3] = {
    { 11, 25, { { 10978, 100, 1, 1 } } },
    { 26, 30, { { 11084, 100, 1, 1 } } },
    { 31, 35, { { 11138, 100, 1, 1 } } },
    { 36, 40, { { 11139, 100, 1, 1 } } },
    { 41, 45, { { 11177, 100, 1, 1 } } },
    { 46, 50, { { 11178, 100, 1, 1 } } },
    { 51, 55, { { 14343, 100, 1, 1 } } },
    { 56, 65, { { 14344, 99.5, 1, 1 }, { 20725, 0.5, 1, 1 } } },
  },
  [4] = {
    { 40, 45, { { 11177, 100, 2, 4 } } },
    { 46, 50, { { 11178, 100, 2, 4 } } },
    { 51, 55, { { 14343, 100, 2, 4 } } },
    { 56, 60, { { 20725, 100, 1, 1 } } },
    { 61, 94, { { 20725, 100, 1, 2 } } },
  },
}

-- A material's worth per unit: its market value on the day it was last seen, else its cheapest
-- price then; nil when it was never priced on this realm and faction.
function AP.Worth(itemID)
  local p = AP.House().prices[itemID]
  return p and (p.markets and p.markets[AP.Day(p.t)] or p.min)
end

-- The outcomes of the band an item level falls in, in a quality's table (nil: none).
local function band(bands, level)
  for _, b in ipairs(bands or {}) do
    if level >= b[1] and level <= b[2] then return b[3] end
  end
end

-- What disenchanting an item gives, and whether it's a weapon: weapons and armour (classID from
-- C_Item.GetItemInfoInstant) of green quality or better, by item level (C_Item.GetItemInfo); nil
-- for anything else, and for an item the client hasn't loaded or hides.
local function outcomes(item)
  local classID = ns.PlainNumber((select(6, C_Item.GetItemInfoInstant(item))))
  local _, _, quality, level = C_Item.GetItemInfo(item)
  quality, level = ns.PlainNumber(quality), ns.PlainNumber(level)
  if not (quality and level) or (classID ~= AP.WEAPON and classID ~= AP.ARMOR) then return nil end
  return band(AP.DISENCHANT[quality], level), classID == AP.WEAPON
end

-- What disenchanting an item (an ID or a link) is worth on average, in copper, rounded down: over
-- its outcomes, chance x average quantity x the material's worth (AP.Worth). A material never
-- priced adds nothing; nil when none is priced or the item doesn't disenchant.
function AP.Disenchant(item)
  local list, weapon = outcomes(item)
  local value, priced = 0, false
  for _, o in ipairs(list or {}) do
    local worth = AP.Worth(o[1])
    if worth then value, priced = value + (weapon and o[5] or o[2]) / 100 * (o[3] + o[4]) / 2 * worth, true end
  end
  return priced and math.floor(value) or nil
end

-- True when a profession (an index GetProfessions gives) is Enchanting: GetProfessionInfo's
-- seventh return is its skill line, and C_TradeSkillUI.GetProfessionInfoBySkillLineID says which
-- profession that is (as Blizzard_ProfessionsBook/Camelot/Blizzard_ProfessionsBook.lua reads them).
local function isEnchanting(index)
  local skillLine = index and select(7, GetProfessionInfo(index))
  local info = skillLine and C_TradeSkillUI.GetProfessionInfoBySkillLineID(skillLine)
  return type(info) == "table" and info.profession == (Enum.Profession or {}).Enchanting
end

-- True when one of your two professions is Enchanting; false where the client can't say.
function AP.HasEnchanting()
  if type(GetProfessions) ~= "function" or type(C_TradeSkillUI) ~= "table" then return false end
  local first, second = GetProfessions()
  return isEnchanting(first) or isEnchanting(second)
end

-- Whether tooltips show disenchant values: the Auction house switch, which until you set it
-- follows whether you know Enchanting.
function AP.DisenchantOn()
  local on = ns.Settings("AuctionHelper").disenchant
  if on == nil then return AP.HasEnchanting() end
  return on
end

-- get/set for the options' disenchant switch, and its default (on for an enchanter).
function AP.DisenchantSetting()
  return AP.DisenchantOn, function(v) ns.Settings("AuctionHelper").disenchant = v end, AP.HasEnchanting()
end

-- Copper as a rough figure, for an estimate: "1g 20s" once there's gold (no copper), else as AP.Money.
function AP.Rough(copper)
  if copper < 10000 then return AP.Money(copper) end
  return string.format("%dg %ds", math.floor(copper / 10000), math.floor(copper / 100) % 100)
end

-- "Disenchant: ~1g 20s" on an item tooltip, for gear that disenchants into materials priced here,
-- while the switch is on.
function AP.DisenchantLine(tt, link)
  local value = AP.DisenchantOn() and AP.Disenchant(link)
  if value then tt:AddLine("Disenchant: ~" .. AP.Rough(value), T.RGB("text2")) end
end

-- Starts with Auction helper's settings: the account-wide prices of older versions moved to this
-- realm and faction (once), old prices pruned, and the tooltip lines (prices, disenchant value) added.
function AP.Enable(settings)
  AP.settings = settings
  AP.Migrate()
  AP.Prune(AP.Now())
  ns.GetModule("Tooltips").AddItemLines(AP.Line)
  ns.GetModule("Tooltips").AddItemLines(AP.DisenchantLine)
end
