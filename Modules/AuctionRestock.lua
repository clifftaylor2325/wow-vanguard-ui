-- Auction helper, buy lists (Modules/AuctionHelper.lua holds the panel and
-- the search queue, Modules/AuctionShop.lua the Shop card): what Instance
-- prep and Keep stocked say you're short of (Modules/InstancePrep.lua's
-- PR.BuyRows: your class's reagents and the Keep-stocked items under their
-- count) becomes the Restock shopping list, each item with how many you need
-- (an entry's want). Restock on the Shop card, Buy list on the Instance prep
-- card and /vg ah restock make it; at the auction house it is searched at
-- once. An entry with a wanted amount is searched as any other, then its
-- item's listings are read (one more search through the same queue) and its
-- row says what the cheapest of that many come to, "8 for 1g 20s 0c", in the
-- warning colour when fewer are up.
--
-- Standing rules here: every search goes through AH.Queue (one in flight, at
-- most 60 a minute); every price and count goes through ns.PlainNumber before
-- arithmetic; your own units are left out (you can't buy them); nothing buys.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The buy list's name.
AH.RESTOCK = "Restock"

-- Making the list ----------------------------------------------------------------------------

-- The filters each item had on the old list (its max price...), by item.
local function keptFilters(old)
  local kept = {}
  for _, entry in ipairs(old) do
    local term, f = AH.Term(entry)
    if f then kept[term] = f end
  end
  return kept
end

-- The Restock list's entries for what's short, as { term = item ID, want = how many } (at most
-- AH.MAX_ENTRIES), each with the filters an entry of the same item had on the old list.
local function restockEntries(rows, old)
  local kept, out = keptFilters(old), {}
  for i = 1, math.min(#rows, AH.MAX_ENTRIES) do
    local entry = {}
    for k, v in pairs(kept[rows[i].id] or {}) do entry[k] = v end
    entry.term, entry.want = rows[i].id, rows[i].need
    out[i] = entry
  end
  return out
end

-- The list's items as chat text: "Arcane Powder x12, Rune of Teleportation x10".
local function restockText(list)
  local out = {}
  for i, entry in ipairs(list) do out[i] = string.format("%s x%d", (AH.EntryLook(entry)), entry.want) end
  return table.concat(out, ", ")
end

-- Makes (or makes again) the Restock list from what's short, and puts it in use (shown from its
-- top); nil when nothing you can buy is short, false when there's no room for another list.
function AH.MakeRestock()
  local rows, store = ns.GetModule("InstancePrep").BuyRows(), AP.Store()
  if #rows == 0 then return ns.Chat("Nothing to restock: your class's reagents and your Keep-stocked items (/vg stock) are all in your bags.") end
  local entries = restockEntries(rows, store.lists[AH.RESTOCK] or {})
  if not AH.NewList(AH.RESTOCK) then return false end
  store.lists[AH.RESTOCK] = entries
  if AH.shopCard then AH.shopCard.offset = 0 end
  ns.Chat(string.format("Shopping list %s: %s.", AH.RESTOCK, restockText(entries)))
  AH.PaintShop()
  return true
end

-- Restock (the Shop card's button, Instance prep's Buy list, /vg ah restock): the list made, and
-- searched at once while the auction house is open (else chat says where to search it).
function AH.Restock()
  if not AH.MakeRestock() then return end
  if AH.open then return AH.SearchList() end
  ns.Chat("At the auction house, Search list on the Shop card shows what the cheapest of each come to.")
end

-- /vg ah restock: the Restock list made (and searched at the auction house).
AH.COMMANDS.restock = function() AH.Restock() end

-- Pricing the wanted amount ------------------------------------------------------------------

-- An entry's row was found (AH.TakeBrowse): when the entry wants an amount, its item's listings are
-- searched next (first in the queue, once per row found) to price the cheapest of that many; the
-- search counts in the list's progress.
function AH.QueueCost(entry, found)
  local _, f = AH.Term(entry)
  local want = f and ns.PlainNumber(f.want)
  if not (found and want and want > 0) or found.costQueued then return end
  found.costQueued = true
  if AH.progress then AH.progress.total = AH.progress.total + 1 end
  AH.Queue({ cost = found, want = want, maxPrice = f.maxPrice }, true)
end

-- A commodity listing as { unit price, units you can buy } (your own units left out); nil for a
-- hidden number.
local function commodityRow(r)
  local unit, qty, mine = ns.PlainNumber(r.unitPrice), ns.PlainNumber(r.quantity), ns.PlainNumber(r.numOwnerItems or 0)
  if unit and qty and mine then return { unit = unit, qty = qty - mine } end
end

-- An item listing as { unit price, quantity, whole = its buyout (it's bought as one) }; nil when
-- it's yours (or the client hides whether), has no buyout, or hides a number.
local function itemRow(r)
  local buyout, qty, mine = ns.PlainNumber(r.buyoutAmount), ns.PlainNumber(r.quantity), r.containsOwnerItem
  if ns.IsSecret(mine) or mine or not (buyout and qty) or qty < 1 then return nil end
  return { unit = math.floor(buyout / qty), qty = qty, whole = buyout }
end

-- Search result i of an item (a commodity's by its item ID, else by its key) as a row, or nil.
local function resultRow(key, commodity, i)
  local api = C_AuctionHouse
  if commodity then
    local r = api.GetCommoditySearchResultInfo(key.itemID, i)
    return r and commodityRow(r)
  end
  local r = api.GetItemSearchResultInfo(key, i)
  return r and itemRow(r)
end

-- The listings of an item you could buy, cheapest per unit first: none of yours, none over the
-- max price.
function AH.CostListings(key, commodity, maxPrice)
  local api, rows = C_AuctionHouse, {}
  local n = commodity and api.GetNumCommoditySearchResults(key.itemID) or api.GetNumItemSearchResults(key)
  for i = 1, ns.PlainNumber(n) or 0 do
    local row = resultRow(key, commodity, i)
    if row and row.qty > 0 and not (maxPrice and row.unit > maxPrice) then rows[#rows + 1] = row end
  end
  table.sort(rows, function(a, b) return a.unit < b.unit end)
  return rows
end

-- What the cheapest `want` units come to: a commodity's units as many as needed, an item's listings
-- whole (so it may come to more units); how many that buys (fewer when fewer are up), and the total.
function AH.CheapestCost(rows, want)
  local got, total = 0, 0
  for _, r in ipairs(rows) do
    if got >= want then break end
    local take = r.whole and r.qty or math.min(r.qty, want - got)
    got, total = got + take, total + (r.whole or take * r.unit)
  end
  return got, total
end

-- Search results for item id (AH.OnSearchEvent): the cost search in flight for that item prices
-- its row's wanted amount from the listings (and the cheapest price feeds the price store), and is done.
function AH.OnCostResults(event, id, s)
  if not (s and s.cost and s.cost.key.itemID == id) then return end
  local rows = AH.CostListings(s.cost.key, event:find("COMMODITY", 1, true) ~= nil, s.maxPrice)
  s.cost.got, s.cost.total = AH.CheapestCost(rows, s.want)
  if rows[1] then AP.RecordSeen(id, rows[1].unit) end
  AH.Done()
end

-- The shop card ------------------------------------------------------------------------------

-- A priced row: "8 for" and what they come to, in the warning colour when fewer are up; "none up"
-- when none of the listings can be bought.
local function paintPriced(r, found, want)
  T.Color(r.qty, found.got < want and "warn" or "text2")
  r.qty:SetText(found.got > 0 and (found.got .. " for") or "")
  r.price:SetText(found.got > 0 and AP.Money(found.total) or "none up")
end

-- A shop row's wanted amount (AH.PaintShop, after the row is painted): "need 8" before its search,
-- what the cheapest 8 come to once priced; the count is in text2 otherwise.
function AH.PaintCost(r, entry)
  local _, f = AH.Term(entry)
  local want, found = f and f.want, AH.found[entry]
  T.Color(r.qty, "text2")
  if not want then return end
  if found and found.got then return paintPriced(r, found, want) end
  if found == nil then r.qty:SetText("need " .. want) end
end

-- The Shop card's Restock button, right of Search list: the Restock list made and searched.
function AH.BuildRestock(c)
  c.restock = W.Button(c.body, "Restock", function() AH.Restock() end, 76)
  c.restock:SetPoint("TOPRIGHT", 0, -46)
end
