-- Auction prices: the cheapest unit price of every item up at the auction
-- house when you last scanned it (Auction helper's "Scan the auction house"),
-- kept for the whole account with each day's low for two weeks, so item
-- tooltips can say "AH: 12s 50c (today)" and the sell card can show the
-- lowest price of the last 7 days. The auction house keeps no price history
-- of its own (its item info has no prices), so this is the only one there is.
-- A price not seen for 30 days is dropped at login, and past AP.MAX_ITEMS
-- items the ones priced longest ago go.

local ADDON, ns = ...

local T = ns.Theme

local AP = {}
ns.AuctionPrices = AP

-- Items priced at most, and the share of them a prune keeps (6000 -> 5400); days of lows
-- kept per item; days a price is kept; seconds in a day.
AP.MAX_ITEMS, AP.KEEP, AP.DAYS, AP.MAX_AGE, AP.DAY = 6000, 0.9, 14, 30, 86400

-- The wall clock in seconds (0 when the client can't say).
function AP.Now()
  local clock = _G.time
  return type(clock) == "function" and ns.PlainNumber(clock()) or 0
end

-- The day a time falls on: whole days since 1970 (UTC).
function AP.Day(t)
  return math.floor(t / AP.DAY)
end

-- The account's auction data: ForeverUIDB.ah = { prices = { [itemID] = { min, t, days = { [day] = copper } } },
-- count (items priced), lists (Auction helper's shopping lists), lastScan }.
function AP.Store()
  ForeverUIDB.ah = ns.Fill(type(ForeverUIDB.ah) == "table" and ForeverUIDB.ah or {}, { prices = {}, count = 0, lists = {}, lastScan = 0 })
  return ForeverUIDB.ah
end

-- Copper as "1g 23s 45c", "12s 50c" or "90c".
function AP.Money(copper)
  local g, s, c = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  if g > 0 then return string.format("%dg %ds %dc", g, s, c) end
  if s > 0 then return string.format("%ds %dc", s, c) end
  return c .. "c"
end

-- Recording ----------------------------------------------------------------------------------

-- Notes an item's cheapest unit price at time t: its price now, and the low of t's day.
-- A new item past AP.MAX_ITEMS evicts the items priced longest ago.
function AP.Record(itemID, unitPrice, t)
  local store, day = AP.Store(), AP.Day(t)
  local p = store.prices[itemID]
  if not p then p = { days = {} } store.prices[itemID] = p store.count = store.count + 1 end
  p.min, p.t = unitPrice, t
  p.days[day] = math.min(p.days[day] or unitPrice, unitPrice)
  if store.count > AP.MAX_ITEMS then AP.Evict() end
end

-- Forgets the items priced longest ago, down to AP.KEEP of AP.MAX_ITEMS.
function AP.Evict()
  local store, ids = AP.Store(), {}
  for id, p in pairs(store.prices) do ids[#ids + 1] = { id, p.t or 0 } end
  table.sort(ids, function(a, b) return a[2] > b[2] end)
  local keep = math.floor(AP.MAX_ITEMS * AP.KEEP)
  for k = keep + 1, #ids do store.prices[ids[k][1]] = nil end
  store.count = math.min(#ids, keep)
end

-- Drops an item's day lows older than AP.DAYS days before today.
local function trimDays(p, today)
  for day in pairs(p.days) do
    if day <= today - AP.DAYS then p.days[day] = nil end
  end
end

-- Drops the prices last seen more than AP.MAX_AGE days before now, and old day lows; recounts.
function AP.Prune(now)
  local store, today, n = AP.Store(), AP.Day(now), 0
  for id, p in pairs(store.prices) do
    if p.t < now - AP.MAX_AGE * AP.DAY then store.prices[id] = nil else n = n + 1 trimDays(p, today) end
  end
  store.count = n
end

-- Reading ------------------------------------------------------------------------------------

-- The lowest price of the last 7 days (today and the six before), or nil.
function AP.Low7(itemID, now)
  local p, today, low = AP.Store().prices[itemID], AP.Day(now or AP.Now()), nil
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

-- An item tooltip's line: "AH: 12s 50c (today)", the cheapest unit price at the last scan that saw it.
function AP.Line(tt, link)
  local p = AP.settings.tooltip and AP.Store().prices[tonumber(link:match("item:(%d+)"))]
  if p then tt:AddLine(string.format("AH: %s (%s)", AP.Money(p.min), AP.Ago(p.t)), T.RGB("text2")) end
end

-- Starts with Auction helper's settings: old prices pruned, and the tooltip line added.
function AP.Enable(settings)
  AP.settings = settings
  AP.Prune(AP.Now())
  ns.GetModule("Tooltips").AddItemLines(AP.Line)
end
