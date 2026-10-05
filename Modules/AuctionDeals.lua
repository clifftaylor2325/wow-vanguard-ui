-- Auction helper, the Deals card (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands): a card docked right of
-- the auction house window listing what a scan or a search found priced
-- under an item's usual price. A listing is a deal when its price per unit
-- is under the item's vendor sell price (buy it, sell it to a merchant), or
-- under 70 % of the item's market value over the last 7 days (the mean of
-- each day's market value from your scans), or, for an item no scan priced
-- in that time, under its lowest price on the six days before today. Each
-- row shows the item, its price per unit and how far under it is, the best
-- first; a click shows the item in the game's own list, so buying stays in
-- the game's hands. A visit's deals are forgotten when the house closes.
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
-- The Deals card's rows: how many, and from where (down from the card's top).
AH.DEAL_ROWS, AH.DEAL_ROWS_Y = 8, -20
-- The Deals card's switch (Bars, map, chat > Auction house): on, as the auction plan's Deals card
-- is part of the panel; it only reads prices the panel's searches and scans already bring.
AH.defaults.deals = true
-- This visit's deals: itemID -> { id, key, price, ref, basis, vendor, off }.
AH.deals = {}

-- Judging --------------------------------------------------------------------------------------

-- The mean of an item's daily market values over the last 7 days (today and the six before),
-- rounded down; nil when no scan priced it in that time.
function AH.Market7(itemID, now)
  local p, today, sum, n = AP.House().prices[itemID], AP.Day(now), 0, 0
  for day, v in pairs(p and p.markets or {}) do
    if day > today - 7 then sum, n = sum + v, n + 1 end
  end
  return n > 0 and math.floor(sum / n) or nil
end

-- An item's lowest price on the six days before today (today's may be the very listing judged), or nil.
function AH.LowBefore(itemID, now)
  local p, today, low = AP.House().prices[itemID], AP.Day(now), nil
  for day, v in pairs(p and p.days or {}) do
    if day > today - 7 and day < today and (not low or v < low) then low = v end
  end
  return low
end

-- What a price is judged against: the 7-day market (a deal under AH.DEAL_PCT % of it), else the
-- lowest price before today (a deal under it), each with its share and its name; nil without either.
local function reference(itemID, now)
  local market = AH.Market7(itemID, now)
  if market then return market, AH.DEAL_PCT, "7-day market" end
  local low = AH.LowBefore(itemID, now)
  if low then return low, 100, "Lowest of the 6 days before" end
end

-- A listing of an item at a price per unit as a deal, or nil: under the vendor's price, or under
-- its reference's share; off is how far under (per cent) the vendor's price, else the reference.
function AH.Deal(itemID, price, now)
  local vendor, ref, pct, basis = AH.VendorPrice(itemID), reference(itemID, now)
  vendor = vendor and price < vendor and vendor or nil
  if not vendor and not (ref and price * 100 < ref * pct) then return nil end
  local base = vendor or ref
  return { id = itemID, key = C_AuctionHouse.MakeItemKey(itemID), price = price, ref = ref, basis = basis, vendor = vendor,
    off = math.floor((base - price) * 100 / base) }
end

-- A price recorded (AP.OnSeen) while the house is open and the card on: the item's deal is set, or
-- dropped when it is no longer one (bought, or dearer now); the card repaints on the next frame.
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

-- The Deals card's events (on: the helper's, which ignores them in combat): each price recorded is
-- judged, and closing the house forgets this visit's deals.
function AH.ListenDeals(on)
  AP.OnSeen(AH.CheckDeal)
  on("AUCTION_HOUSE_CLOSED", function() AH.deals = {} end)
end

-- The card -------------------------------------------------------------------------------------

-- How far under a deal is: "< vendor" under the vendor's price, else "-35 %".
local function underText(d)
  if d.vendor then return "< vendor" end
  return string.format("-%d %%", d.off)
end

-- A deal's row: the item, its price per unit and how far under; hidden past the last deal.
local function paintDeal(r, d)
  r:SetShown(d ~= nil)
  r.deal = d
  if not d then return end
  local name, icon = AH.EntryLook(d.id, d)
  r.icon:SetTexture(icon)
  r.name:SetText(name)
  r.price:SetText(AP.Money(d.price))
  r.qty:SetText(underText(d))
end

-- The Deals card, while its switch is on: how many, and the deals from the scroll offset (kept
-- within them), or a line saying how they are found while there are none.
function AH.PaintDeals()
  local f = AH.dealsFrame
  if not f then return end
  f:SetShown(AH.settings.deals)
  local list = AH.SortedDeals()
  f.offset = math.max(0, math.min(f.offset, #list - AH.DEAL_ROWS))
  f.card.count:SetText(#list > 0 and (#list .. " found") or "")
  f.card.status:SetText(#list == 0 and "None yet: a scan or a search finds them." or "")
  for i, r in ipairs(f.card.rows) do paintDeal(r, list[f.offset + i]) end
end

-- A deal clicked: its item in the game's own list (first in line), to buy there.
function AH.OpenDeal(r)
  if r.deal then AH.Queue({ open = r.deal.key }, true) end
end

-- A deal's tooltip: the item, what it was judged against, and what a click does.
local function dealTip(r)
  local d = r.deal
  GameTooltip:SetOwner(r, "ANCHOR_RIGHT")
  GameTooltip:SetText((AH.EntryLook(d.id, d)))
  if d.ref then GameTooltip:AddLine(d.basis .. ": " .. AP.Money(d.ref), T.RGB("text2")) end
  if d.vendor then GameTooltip:AddLine("Vendor price: " .. AP.Money(d.vendor), T.RGB("text2")) end
  GameTooltip:AddLine("Click to show it in the auction house's list.", T.RGB("text2"))
  GameTooltip:Show()
end

-- The wheel over the card scrolls its deals.
local function scrollDeals(f, delta)
  f.offset = math.max(0, f.offset - delta)
  AH.PaintDeals()
end

-- The card's rows: icon, name, price per unit and how far under (in "good"), each with its tooltip.
local function dealRows(c)
  c.rows = {}
  for i = 1, AH.DEAL_ROWS do
    local r = AH.Row(c, i, AH.DEAL_ROWS_Y, AH.OpenDeal)
    AH.RowParts(r)
    T.Color(r.qty, "good")
    r:SetScript("OnEnter", dealTip)
    r:SetScript("OnLeave", function() GameTooltip:Hide() end)
    c.rows[i] = r
  end
end

-- The card in the frame: its heading with the count on the right, the line shown while there are
-- no deals, and the rows.
local function dealCard(f)
  local c = AH.Card(f, "Deals", -AH.PAD, -AH.DEAL_ROWS_Y + AH.DEAL_ROWS * AH.ROW_H)
  c.rule:Hide()
  c.count = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.count:SetPoint("TOPRIGHT", 0, -2)
  c.status = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.status:SetPoint("TOPLEFT", 0, AH.DEAL_ROWS_Y - 4)
  dealRows(c)
  return c
end

-- The Deals card, built with the panel (its child, so it shows and hides with it) and docked right
-- of the auction house window, from its top, as wide as the panel; the wheel scrolls it.
function AH.BuildDeals(panel)
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_AuctionDeals", panel), { shadow = true })
  f:SetSize(AH.WIDTH, 2 * AH.PAD - AH.DEAL_ROWS_Y + AH.DEAL_ROWS * AH.ROW_H)
  f:SetPoint("TOPLEFT", AuctionHouseFrame, "TOPRIGHT", AH.GAP, 0)
  f:EnableMouse(true)
  f:EnableMouseWheel(true)
  f:SetScript("OnMouseWheel", scrollDeals)
  f.card, f.offset = dealCard(f), 0
  AH.dealsFrame = f
end
