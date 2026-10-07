-- Auction prices for other addons: Vanguard.API.v1, a table of functions
-- with the names and argument order of Auctionator's v1 API (as
-- docs/handoff/AUCTION-PLAN.md lists them; its source was not read), so an
-- addon written for Auctionator can read Vanguard's prices with a one-line
-- shim. docs/API.md documents it for addon authors.
--
-- Every function takes the calling addon's name first (callerID, a string);
-- a call without one, or with an argument of the wrong type, raises an error
-- at the caller's line that says which. Prices are this realm and faction's
-- (Modules/AuctionPrices.lua), in copper. Searches go through the Auction
-- helper's queue (one in flight, at most 60 a minute) and only while the
-- auction house is open; nothing here posts, buys or cancels.

local ADDON, ns = ...

local AP = ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

local API = {}
Vanguard.API = { v1 = API }
ns.API = API

-- Checking calls -----------------------------------------------------------------------------

-- Raises "Vanguard.API.v1.<fn>: <what> must be a <want>" at the line that called the API
-- (four levels up: here, check, the API function, its caller).
local function fail(fn, what, want, got)
  error(string.format("Vanguard.API.v1.%s: %s must be a %s, got %s", fn, what, want, type(got)), 4)
end

-- Checks an API call's callerID (a string) and one more argument (v, of type want).
local function check(fn, callerID, what, v, want)
  if type(callerID) ~= "string" then fail(fn, "callerID", "string", callerID) end
  if type(v) ~= want then fail(fn, what, want, v) end
end

-- Prices -------------------------------------------------------------------------------------

-- This realm and faction's prices, or none before the saved variables are loaded.
local function prices()
  return type(VanguardDB) == "table" and AP.House().prices or {}
end

-- The item ID in an item link (or "item:2589" string), or nil.
local function linkID(link)
  return tonumber(link:match("item:(%d+)"))
end

-- The cheapest unit price last seen for an item (copper), or nil.
local function auctionPrice(itemID)
  local p = itemID and prices()[itemID]
  return p and p.min or nil
end

-- What one of an item sells to a merchant for (copper; 0 for no value), or nil when the client
-- hasn't loaded the item or hides the price.
local function vendorPrice(item)
  return ns.PlainNumber((select(11, C_Item.GetItemInfo(item))))
end

-- The auction price of an item by its ID: the cheapest unit price last seen on this realm and
-- faction, by a scan or a search, in copper; nil when it was never seen (or not for 30 days).
function API.GetAuctionPriceByItemID(callerID, itemID)
  check("GetAuctionPriceByItemID", callerID, "itemID", itemID, "number")
  return auctionPrice(itemID)
end

-- The auction price of an item by its link (see GetAuctionPriceByItemID).
function API.GetAuctionPriceByItemLink(callerID, itemLink)
  check("GetAuctionPriceByItemLink", callerID, "itemLink", itemLink, "string")
  return auctionPrice(linkID(itemLink))
end

-- What a merchant pays for one of an item by its ID, in copper, or nil.
function API.GetVendorPriceByItemID(callerID, itemID)
  check("GetVendorPriceByItemID", callerID, "itemID", itemID, "number")
  return vendorPrice(itemID)
end

-- What a merchant pays for one of an item by its link, in copper, or nil.
function API.GetVendorPriceByItemLink(callerID, itemLink)
  check("GetVendorPriceByItemLink", callerID, "itemLink", itemLink, "string")
  return vendorPrice(itemLink)
end

-- What disenchanting an item is worth on average (AP.Disenchant), or nil; none before the saved
-- variables are loaded.
local function disenchantPrice(item)
  return type(VanguardDB) == "table" and AP.Disenchant(item) or nil
end

-- What disenchanting an item is worth on average by its ID, in copper: each material's chance x
-- average quantity x its market value (else its cheapest price) here; nil for an item that
-- doesn't disenchant (weapons and armour, green or better) or whose materials were never priced.
function API.GetDisenchantPriceByItemID(callerID, itemID)
  check("GetDisenchantPriceByItemID", callerID, "itemID", itemID, "number")
  return disenchantPrice(itemID)
end

-- The disenchant value of an item by its link (see GetDisenchantPriceByItemID).
function API.GetDisenchantPriceByItemLink(callerID, itemLink)
  check("GetDisenchantPriceByItemLink", callerID, "itemLink", itemLink, "string")
  return disenchantPrice(itemLink)
end

-- callback() runs (with no arguments) on the frame after prices are recorded: once after a whole
-- scan, and after each search that saw a price. One that fails is reported by Vanguard (/vg
-- errors) and doesn't stop the others.
function API.RegisterForDBUpdate(callerID, callback)
  check("RegisterForDBUpdate", callerID, "callback", callback, "function")
  AP.OnChange(function() ns.Try("Vanguard.API.v1 update for " .. callerID, callback) end)
end

-- Shopping lists and searches ----------------------------------------------------------------

-- A search string as a shopping list entry: the name before the first ";" (Auctionator's search
-- strings carry their filters after it and quote a name to match exactly) without quotes, read as
-- the shop reads what is typed (an item link or ID, else a name); nil when blank.
local function termEntry(term)
  return AH.ParseEntry((term:match("^[^;]*"):gsub('"', "")))
end

-- An exact search's entry: the item's ID when the client knows an item of that name (a search by
-- ID shows only that item), else the name as it is.
local function exactEntry(entry)
  if type(entry) ~= "string" then return entry end
  return (C_Item.GetItemInfoInstant(entry)) or entry
end

-- The entries for a list of search strings: blank and non-string ones left out, at most
-- AH.MAX_ENTRIES (a list's cap), by ID where they can be when exact.
local function entries(terms, exact)
  local out = {}
  for _, term in ipairs(terms) do
    local entry = type(term) == "string" and termEntry(term)
    if entry and #out < AH.MAX_ENTRIES then out[#out + 1] = exact and exactEntry(entry) or entry end
  end
  return out
end

-- How many shopping lists there are.
local function countLists(lists)
  local n = 0
  for _ in pairs(lists) do n = n + 1 end
  return n
end

-- Puts the entries in shopping list `name`, made when new, its old entries replaced; false (and
-- nothing changed) for a blank name or a new list past AH.MAX_LISTS. The shop card repaints.
local function putList(name, list)
  local lists = AP.Store().lists
  name = name:match("^%s*(.-)%s*$")
  if name == "" or not lists[name] and countLists(lists) >= AH.MAX_LISTS then return false end
  lists[name] = list
  AH.PaintShop()
  return true
end

-- A search of the terms at the open auction house: they become the list "<callerID> search" (made
-- or replaced), which the shop card picks and searches as Search list does. False when the house
-- is closed, no term is usable, or the list can't be made.
local function search(callerID, terms, exact)
  local name, list = callerID .. " search", entries(terms, exact)
  if not AH.open or #list == 0 or not putList(name, list) then return false end
  AP.Store().list = name
  AH.ShopTop()
  AH.SearchList()
  return true
end

-- Searches the auction house for each search string (a name, matched as the game's search box
-- does), one search at a time through the shop; the results show on the shop card. True when queued.
function API.MultiSearch(callerID, terms)
  check("MultiSearch", callerID, "terms", terms, "table")
  return search(callerID, terms, false)
end

-- MultiSearch, each name matched exactly: a name the client knows is searched by its item ID.
function API.MultiSearchExact(callerID, terms)
  check("MultiSearchExact", callerID, "terms", terms, "table")
  return search(callerID, terms, true)
end

-- Makes the shopping list `listName` holding the search strings (a list of that name already
-- there is replaced). Lists are the account's, shown on the shop card. True when made.
function API.CreateShoppingList(callerID, listName, items)
  check("CreateShoppingList", callerID, "listName", listName, "string")
  check("CreateShoppingList", callerID, "items", items, "table")
  return putList(listName, entries(items, false))
end

-- Replaces the entries of the shopping list `listName` with the search strings; false when there
-- is no list of that name.
function API.AlterShoppingListItems(callerID, listName, items)
  check("AlterShoppingListItems", callerID, "listName", listName, "string")
  check("AlterShoppingListItems", callerID, "items", items, "table")
  if AP.Store().lists[listName] == nil then return false end
  return putList(listName, entries(items, false))
end
