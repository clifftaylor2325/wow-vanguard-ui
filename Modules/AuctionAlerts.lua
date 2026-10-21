-- Auction helper, price alerts (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands): a shopping list entry
-- with a max price (its Filters...) can ring an alert at it. When a scan or
-- a search sees the entry's item at or under its max price, the alert sound
-- plays and Chat watch's toast says so: "Price alert", the item and its max
-- price, and the price seen; a click on the toast shows the item in the
-- game's own list. One item alerts at most once a session for each drop in
-- its price (again only when it is seen cheaper than when it last alerted),
-- and the alerts of one frame (a whole scan's) ring once, on one toast.
--
-- Standing rules here: alerts are judged from the prices the store records
-- (AP.OnSeen: each item's cheapest price per unit from a scan or a search,
-- your own listings left out) and from the shop's own result for an entry
-- (AH.EntryFound), every number already through ns.PlainNumber; the only
-- search is the toast click's, through AH.Queue; nothing buys.

local ADDON, ns = ...

local W, AP = ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- This session's alerts: itemID -> the price it last alerted at; and the alerts waiting for the
-- next frame, as { id, price, max }.
AH.alerted, AH.ringing = {}, {}

-- The filter dialog's alert switch, under its max price (Modules/AuctionShop.lua builds the dialog;
-- Save keeps the switch only with a max price).
function AH.AlertRow(d)
  d.alert = W.Check(d, "Alert at or under the max price", function() return d.draft.alert end, function(v) d.draft.alert = v end, AH.FILTER_W - 24)
  d.alert:SetPoint("TOPLEFT", 12, -156)
end

-- Which entries alert ------------------------------------------------------------------------

-- Puts an entry that alerts (its switch on, with a max price) in the index: by its item ID, or
-- among the names.
local function indexEntry(index, e)
  if type(e) ~= "table" or not (e.alert and e.maxPrice) then return end
  if type(e.term) ~= "number" then
    index.names[#index.names + 1] = e
    return
  end
  index.ids[e.term] = index.ids[e.term] or {}
  table.insert(index.ids[e.term], e)
end

-- The entries that alert, from every named list (not Recent's copies): { ids = { [itemID] = entries },
-- names = entries }, worked out once a frame (a scan records thousands of prices in one).
local function alertIndex()
  if AH.alertIndex then return AH.alertIndex end
  local index = { ids = {}, names = {} }
  for _, list in pairs(AP.Store().lists) do
    for _, e in ipairs(list) do indexEntry(index, e) end
  end
  AH.alertIndex = index
  ns.Soon("auction alert index", function() AH.alertIndex = nil end)
  return index
end

-- Whether item id is what a name entry finds: the same name (any case), or one containing it
-- unless exact; of the entry's quality and within its level range (the item's required level)
-- when it has them. False while the client hasn't the item's name.
local function nameFits(e, id)
  local name, _, quality, _, level = C_Item.GetItemInfo(id)
  if ns.IsSecret(name) or type(name) ~= "string" then return false end
  quality, level = ns.PlainNumber(quality), ns.PlainNumber(level) or 0
  if (e.quality and quality ~= e.quality) or (e.minLevel and level < e.minLevel) or (e.maxLevel and level > e.maxLevel) then return false end
  local n, term = name:lower(), e.term:lower()
  return n == term or (not e.exact and n:find(term, 1, true) ~= nil)
end

-- The highest max price among the alerting entries that find item id; nil when none does.
local function maxPrice(id)
  local index, best = alertIndex(), nil
  for _, e in ipairs(index.ids[id] or {}) do best = math.max(best or 0, e.maxPrice) end
  for _, e in ipairs(index.names) do
    if nameFits(e, id) then best = math.max(best or 0, e.maxPrice) end
  end
  return best
end

-- Alerting -----------------------------------------------------------------------------------

-- Item id seen at a price per unit, against an alert's max price: at or under it, it rings (on the
-- next frame, with any others) unless it already alerted this session at that price or less.
function AH.Alert(id, price, max)
  if price > max or (AH.alerted[id] and price >= AH.alerted[id]) then return end
  AH.alerted[id] = price
  AH.ringing[#AH.ringing + 1] = { id = id, price = price, max = max }
  ns.Soon("auction price alerts", AH.RingAlerts)
end

-- A price recorded (AP.OnSeen) while the house is open, checked against the entries that alert.
function AH.CheckAlert(id, price)
  if not AH.open then return end
  local max = maxPrice(id)
  if max then AH.Alert(id, price, max) end
end

-- An entry's own search found its row (AH.TakeBrowse, which leaves out what is over the entry's
-- max price, so a price per stack counts as the shop's row shows it): an alerting entry rings.
function AH.EntryFound(entry, row)
  local _, f = AH.Term(entry)
  if row and f and f.alert and f.maxPrice then AH.Alert(row.key.itemID, row.price, f.maxPrice) end
end

-- The toast's title, line and price: one alert's item, its max price and the price seen; several
-- alerts' count and items.
local function toastText(list)
  local a, names = list[1], {}
  if #list == 1 then return "Price alert", string.format("%s (max %s)", AH.EntryLook(a.id), AP.Money(a.max)), AP.Money(a.price) end
  for i, x in ipairs(list) do names[i] = (AH.EntryLook(x.id)) end
  return string.format("%d price alerts", #list), table.concat(names, ", ")
end

-- The alerts waiting ring once, by item ID: the alert sound and Chat watch's toast; a click on it
-- shows the first one's item in the game's own list while the house is open.
function AH.RingAlerts()
  local list = AH.ringing
  AH.ringing = {}
  table.sort(list, function(a, b) return a.id < b.id end)
  local key = C_AuctionHouse.MakeItemKey(list[1].id)
  local title, line, price = toastText(list)
  ns.GetModule("ChatWatch").Notify(title, line, price, function() if AH.open then AH.QueueFirst({ open = key }) end end)
end

-- Every price the store records is checked against the alerts (only while the house is open).
AP.OnSeen(AH.CheckAlert)
