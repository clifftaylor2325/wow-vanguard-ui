-- Auction helper, the Deals list (Modules/AuctionHelper.lua holds the tabs,
-- the search queue, the scan and the slash commands): an entry in the
-- Lists tab's pane, listing what a scan or a search found priced
-- under an item's usual price. A listing is a deal when its price per unit
-- is under the item's vendor sell price (buy it, sell it to a merchant), or
-- under 70 % of the item's market value over the last 7 days (the median of
-- each day's market value from your scans, on at least two days), or, for an item no scan priced
-- in that time, under its lowest price on the six days before today. Each
-- row shows the item, its price per unit, how far under it is and what it was
-- judged against, the best first; a click shows the item in the game's own
-- list, so buying stays in the game's hands. Deals (and upgrades) are kept
-- for 30 minutes after the house closes (a trip to the mailbox), when you
-- come back to the same realm and side's house, and the heading says how long
-- ago the oldest was found.
--
-- Standing rules here: deals are judged from the prices the store records
-- as it records them (AP.OnSeen: each item's cheapest price per unit from a
-- scan or a search, your own listings left out, every number already through
-- ns.PlainNumber); the only search is a click's, through AH.Queue; nothing
-- buys, and nothing writes into the game's auction frames.

local ADDON, ns = ...

local T, AP = ns.Theme, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- A listing under this share (per cent) of its item's 7-day market value is a deal.
AH.DEAL_PCT = 70
-- How many of the last 7 days a scan must have priced an item for its market value to judge by.
AH.MARKET_DAYS = 2
-- The Deals entry's pane key (no list name can have it), and its columns: the price per unit,
-- how far under, and what the price was judged against.
AH.DEALS = "deals"
AH.DEAL_COLUMNS = { { key = "price", title = "Unit price", width = 90, side = "RIGHT", role = "number", color = "gold" },
  { key = "off", title = "Under by", width = 56, side = "RIGHT", role = "small", color = "good" },
  { key = "basis", title = "Judged against", width = 150, side = "LEFT", role = "small", color = "text2" }, name = "Item" }
-- The Deals entry's switch (Town and gear > Auction house): on, as the auction plan's Deals list
-- is part of the tabs; it only reads prices the tabs' searches and scans already bring.
AH.defaults.deals = true
-- The deals found here lately: itemID -> { id, key, price, ref, basis, vendor, off, found (when) }.
AH.deals = {}
-- How long found deals and upgrades are kept after the house closes (seconds).
AH.KEEP = 1800
-- When and where the house last closed ({ at, house }), while what was found then is kept.
AH.closed = nil

-- Judging --------------------------------------------------------------------------------------

-- The middle of an item's daily market values over the last 7 days (today and the six before),
-- rounded down (the median, so one outlier day doesn't skew it); nil unless scans priced it on at
-- least AH.MARKET_DAYS of those days.
function AH.Market7(itemID, now)
  local p, today, vals = AP.House().prices[itemID], AP.Day(now), {}
  for day, v in pairs(p and p.markets or {}) do
    if AP.WithinDays(day, today) then vals[#vals + 1] = v end
  end
  if #vals < AH.MARKET_DAYS then return nil end
  table.sort(vals)
  return math.floor((vals[math.ceil(#vals / 2)] + vals[math.floor(#vals / 2) + 1]) / 2)
end

-- An item's lowest price on the six days before today (today's may be the very listing judged), or nil.
function AH.LowBefore(itemID, now)
  local p, today, low = AP.House().prices[itemID], AP.Day(now), nil
  for day, v in pairs(p and p.days or {}) do
    if AP.WithinDays(day, today) and day < today and (not low or v < low) then low = v end
  end
  return low
end

-- What a price is judged against: the 7-day market (a deal under AH.DEAL_PCT % of it), else the
-- lowest price before today (a deal under it), each with its share and its name; nil without either.
local function reference(itemID, now)
  local market = AH.Market7(itemID, now)
  if market then return market, AH.DEAL_PCT, "7-day market" end
  local low = AH.LowBefore(itemID, now)
  if low then return low, 100, "Prior 6-day low" end
end

-- A listing of an item at a price per unit as a deal, or nil: under the vendor's price, or under
-- its reference's share; off is how far under (per cent) the vendor's price, else the reference.
function AH.Deal(itemID, price, now)
  local vendor, ref, pct, basis = AH.VendorPrice(itemID), reference(itemID, now)
  vendor = vendor and price < vendor and vendor or nil
  if not vendor and not (ref and price * 100 < ref * pct) then return nil end
  local base = vendor or ref
  return { id = itemID, key = C_AuctionHouse.MakeItemKey(itemID), price = price, ref = ref, basis = basis, vendor = vendor,
    off = math.floor((base - price) * 100 / base), found = now }
end

-- A price recorded (AP.OnSeen) while the house is open and the entry on: the item's deal is set, or
-- dropped when it is no longer one (bought, or dearer now); the list repaints on the next frame.
function AH.CheckDeal(itemID, price, t)
  if not (AH.open and AH.settings.deals) then return end
  AH.deals[itemID] = AH.Deal(itemID, price, t)
  ns.Soon("auction deals", AH.PaintDeals)
end

-- This visit's deals, best first: under the vendor's price first, then the furthest under, then by item ID.
function AH.SortedDeals()
  local out = {}
  for _, d in pairs(AH.deals) do out[#out + 1] = d end
  table.sort(out, function(a, b)
    if (a.vendor ~= nil) ~= (b.vendor ~= nil) then return a.vendor ~= nil end
    if a.off ~= b.off then return a.off > b.off end
    return a.id < b.id
  end)
  return out
end

-- Whether what was found before the house last closed is past keeping: it closed AH.KEEP seconds ago or
-- more, or this is another realm or side's house.
function AH.FoundExpired()
  local c = AH.closed
  return c ~= nil and (AP.Now() - c.at >= AH.KEEP or c.house ~= AP.House())
end

-- What was found before the house closed, forgotten once past keeping: deals, upgrades and gear seen.
function AH.DropExpired()
  if not AH.FoundExpired() then return end
  AH.deals, AH.closed = {}, nil
  AH.ForgetGear()
end

-- The house closed: what was found is kept AH.KEEP seconds, then forgotten if the house is still closed
-- (so a scan's gear isn't held for the rest of the session).
local function onClosed()
  AH.closed = { at = AP.Now(), house = AP.House() }
  C_Timer.After(AH.KEEP, ns.Guard("timer forget found", function() if not AH.open then AH.DropExpired() end end))
end

-- Whole minutes since a time.
function AH.MinutesSince(t)
  return math.floor((AP.Now() - t) / 60)
end

-- The heading's count for found rows: "3 found", or "3 found, the oldest 12 min ago" once a row is a
-- minute old (a deal kept from before the mailbox).
function AH.FoundCount(items)
  if #items == 0 then return "" end
  local oldest = AP.Now()
  for _, row in ipairs(items) do oldest = math.min(oldest, row.found) end
  local minutes = AH.MinutesSince(oldest)
  return minutes > 0 and string.format("%d found, the oldest %d min ago", #items, minutes) or (#items .. " found")
end

-- A found row's tooltip line: "Found 12 min ago."
function AH.FoundLine(row)
  GameTooltip:AddLine(string.format("Found %d min ago.", AH.MinutesSince(row.found)), T.RGB("text2"))
end

-- The Deals entry's events: each price recorded is judged, and closing the house starts keeping what was
-- found (state only, so also in combat; AH.OnShow drops it when the house opens past keeping).
function AH.ListenDeals()
  AP.OnSeen(AH.CheckDeal)
  ns.On("AUCTION_HOUSE_CLOSED", onClosed)
end

-- The entry ------------------------------------------------------------------------------------

-- How far under a deal is: "< vendor" under the vendor's price, else "-35 %".
local function underText(d)
  if d.vendor then return "< vendor" end
  return string.format("-%d %%", d.off)
end

-- What a deal was judged against, with that price: the vendor's, else its reference's.
local function basisText(d)
  if d.vendor then return "Vendor price " .. AP.Money(d.vendor) end
  return d.basis .. " " .. AP.Money(d.ref)
end

-- A deal's row: the item, its price per unit, how far under, and what it was judged against.
local function paintDeal(r, d)
  local name, icon = AH.EntryLook(d.id, d)
  r.icon:SetTexture(icon)
  r.name:SetText(name)
  r.cells.price:SetText(AP.Money(d.price))
  r.cells.off:SetText(underText(d))
  r.cells.basis:SetText(basisText(d))
end

-- A deal clicked: its item in the game's own list (first in line), on its Buy tab, to buy there.
function AH.OpenDeal(r)
  if r.item then AH.QueueFirst({ open = r.item.key }) AH.ShowInGame() end
end

-- A deal's tooltip: the item, what it was judged against, and what a click does.
local function dealTip(r)
  local d = r.item
  GameTooltip:SetOwner(r, "ANCHOR_RIGHT")
  GameTooltip:SetText((AH.EntryLook(d.id, d)))
  if d.ref then GameTooltip:AddLine(d.basis .. ": " .. AP.Money(d.ref), T.RGB("text2")) end
  if d.vendor then GameTooltip:AddLine("Vendor price: " .. AP.Money(d.vendor), T.RGB("text2")) end
  AH.FoundLine(d)
  GameTooltip:AddLine("Click to show it in the auction house's list.", T.RGB("text2"))
  GameTooltip:Show()
end

-- The pane's Deals entry with this visit's count, while the switch is on.
local function paneEntry()
  if AH.settings.deals then return { key = AH.DEALS, name = "Deals", count = #AH.SortedDeals() } end
end
AH.PANE_EXTRAS[#AH.PANE_EXTRAS + 1] = paneEntry

-- What the card shows for Deals: the columns, this visit's deals best first, the count beside the
-- heading, and the line shown while there are none.
AH.Sources[AH.DEALS] = { name = "Deals", columns = AH.DEAL_COLUMNS, items = AH.SortedDeals, paint = paintDeal, click = AH.OpenDeal, enter = dealTip,
  count = AH.FoundCount, status = function(items) return #items == 0 and "None yet: a scan or a search finds them." or "" end }

-- The Deals entry painted: its count in the pane and, while it is the entry shown, its rows (the
-- entry gives way to no list when its switch goes off).
function AH.PaintDeals()
  if not AH.shopCard then return end
  if not AH.settings.deals and AH.ListKey() == AH.DEALS then AP.Store().list = nil end
  AH.PaintShop()
end
