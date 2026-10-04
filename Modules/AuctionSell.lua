-- Auction helper, the Sell card (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands): the sell slot and the
-- item it takes (TakeItem, TakeCursor, or the game's own sell frame), the
-- price check's results (Cheapest), the undercut rules and the price to ask
-- (Suggest), the auction length (Duration), the deposit, and Post.
--
-- Standing rules here: PostItem and PostCommodity run only inside Post's
-- click; the only hook is a post-hook on the game's SetPostItem that reads
-- the item it was given, and nothing writes into the game's auction frames;
-- price checks go through AH.Queue (one in flight, at most 60 a minute);
-- every price and quantity goes through ns.PlainNumber before arithmetic;
-- and both paths work: a commodity's whole stack, or an item one at a time.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The sell card: where it starts and its height, and its lines.
AH.SELL_Y, AH.SELL_H = -210, 136
AH.SELL_LINES = { "Cheapest now", "7-day low", "Deposit", "Your price" }
-- Enum.ItemCommodityStatus's Item and Commodity (AuctionHouseDocumentation.lua); the game's
-- names for the three auction lengths (AUCTION_DURATION_ONE...).
AH.ITEM, AH.COMMODITY, AH.DURATIONS = 1, 2, { "ONE", "TWO", "THREE" }
-- The undercut rules as the sell card's segments.
AH.UNDERCUT_CHOICES = { { "copper", "1c" }, { "silver", "1s" }, { "percent", "1%" }, { "match", "Match" } }

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

-- The price to ask: the cheapest now (else the 7-day low) less the undercut, at least 1 copper;
-- nil with neither. Without copper prices it rounds up to whole silver, as the game's sell frame does.
function AH.Suggest(cheapest, low7)
  local base = cheapest or low7
  if not base then return nil end
  local price = math.max(1, (AH.UNDERCUT[AH.settings.undercut] or AH.UNDERCUT.silver)(base))
  if not C_AuctionHouse.SupportsCopperValues() then price = math.ceil(price / 100) * 100 end
  return price
end

-- The auction length the game's sell frame last used (its CVar, 1 to 3), and the game's name for it.
function AH.Duration()
  local d = tonumber(GetCVar("auctionHouseDurationDropdown") or "")
  d = d and d >= 1 and d <= 3 and math.floor(d) or 1
  return d, _G["AUCTION_DURATION_" .. AH.DURATIONS[d]] or ("duration " .. d)
end

-- The deposit for posting the card's item for duration d (rounded up to silver without copper prices), or nil.
local function deposit(s, d)
  local api = C_AuctionHouse
  local copper = s.commodity and api.CalculateCommodityDeposit(s.id, d, s.qty) or api.CalculateItemDeposit(s.loc, d, s.qty)
  copper = ns.PlainNumber(copper)
  if copper and not api.SupportsCopperValues() then copper = math.ceil(copper / 100) * 100 end
  return copper
end

-- One result's unit price: a commodity's unit price, an item's buyout over its quantity; nil
-- for your own listing, one with only a bid, or a number the client hides.
local function unitPrice(r, commodity)
  if not r or r.containsOwnerItem then return nil end
  if commodity then return ns.PlainNumber(r.unitPrice) end
  local buyout, qty = ns.PlainNumber(r.buyoutAmount), ns.PlainNumber(r.quantity)
  return buyout and qty and qty > 0 and math.floor(buyout / qty) or nil
end

-- The cheapest unit price someone else asks for an item now (your listings left out), or nil:
-- from the commodity results or the item results, whichever the search brought.
function AH.Cheapest(commodity, key)
  local api, best = C_AuctionHouse, nil
  local n = commodity and api.GetNumCommoditySearchResults(key.itemID) or api.GetNumItemSearchResults(key)
  for i = 1, ns.PlainNumber(n) or 0 do
    local r = commodity and api.GetCommoditySearchResultInfo(key.itemID, i) or api.GetItemSearchResultInfo(key, i)
    local unit = unitPrice(r, commodity)
    if unit and (not best or unit < best) then best = unit end
  end
  return best
end

-- Puts an item on the sell card (when the house takes it and the client knows whether it's a
-- commodity: a commodity sells the stack, an item one at a time) and checks its price now.
function AH.TakeItem(loc)
  local api = C_AuctionHouse
  if not (AH.sellCard and loc and loc:IsValid() and api.IsSellItemValid(loc, false)) then return end
  local status = api.GetItemCommodityStatus(loc)
  if status ~= AH.ITEM and status ~= AH.COMMODITY then return end
  local key, commodity = api.GetItemKeyFromItem(loc), status == AH.COMMODITY
  AH.sell = { loc = loc, id = key.itemID, commodity = commodity, qty = commodity and ns.PlainNumber(C_Item.GetStackCount(loc)) or 1 }
  AH.Queue({ sell = api.MakeItemKey(key.itemID), card = true }, true)
  AH.PaintSell()
end

-- An item dropped on (or clicked onto) the sell slot: it goes back to its bag and onto the card.
function AH.TakeCursor()
  local loc = C_Cursor.GetCursorItem()
  if not loc then return end
  ClearCursor()
  AH.TakeItem(loc)
end

-- Search results for an item: the price check in flight (the sell card's, or your auctions') takes the cheapest.
function AH.OnSearchResults(event, arg)
  local s, commodity = AH.pending, event == "COMMODITY_SEARCH_RESULTS_UPDATED"
  local id = type(arg) == "table" and arg.itemID or arg
  if not (s and s.sell and s.sell.itemID == id) then return end
  local cheapest = AH.Cheapest(commodity, s.sell)
  if s.card and AH.sell and AH.sell.id == id then AH.sell.cheapest, AH.sell.searched = cheapest, true end
  if s.check then AH.MarkUndercuts(id, cheapest, commodity) end
  AH.Done()
  AH.PaintSell()
end

-- Copper as money text, or `none` without a value.
local function money(copper, none)
  return copper and AP.Money(copper) or none
end

-- The sell card's lines for its item: the cheapest now ("none up" after a search found none),
-- the 7-day low, the deposit with the duration, and the price it will ask (nil: unknown).
local function sellValues(s)
  local low7, d, label = AP.Low7(s.id), AH.Duration()
  local price, dep = AH.Suggest(s.cheapest, low7), deposit(s, d)
  local now = money(s.cheapest, s.searched and "none up" or "...")
  return { now, money(low7, "none"), dep and (AP.Money(dep) .. " · " .. label) or "", money(price, "") }, price
end

-- The sell card: the item's icon and lines, and Post, which works only with a price while the
-- game's message throttle is ready.
function AH.PaintSell()
  local c, s = AH.sellCard, AH.sell
  if not c then return end
  local values, price = {}, nil
  if s then values, price = sellValues(s) end
  c.icon:SetTexture(s and C_Item.GetItemIcon(s.loc) or nil)
  for i, line in ipairs(c.lines) do line.value:SetText(values[i] or "") end
  local ready = price ~= nil and C_AuctionHouse.IsThrottledMessageSystemReady()
  if ready then c.post:Enable() else c.post:Disable() end
end

-- Post (the button's click, never a timer or an event): lists the card's item at the suggested
-- price for the game's duration. A true answer means the game wants the post confirmed: that is
-- the game's to ask, so the card says so and keeps the item.
function AH.Post()
  local s = AH.sell
  local price = s and AH.Suggest(s.cheapest, AP.Low7(s.id))
  if not price or not C_AuctionHouse.IsThrottledMessageSystemReady() then return end
  local d, api, confirm = AH.Duration(), C_AuctionHouse
  if s.commodity then confirm = api.PostCommodity(s.loc, d, s.qty, price) else confirm = api.PostItem(s.loc, d, 1, nil, price) end
  if confirm then return ns.Chat("The game wants this price confirmed: list it from the game's own Sell tab.") end
  AH.sell = nil
  AH.PaintSell()
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

-- The sell card: the slot, its lines, the undercut rule and Post.
function AH.BuildSell(f)
  local c = AH.Card(f, "Sell", AH.SELL_Y, AH.SELL_H)
  sellSlot(c)
  sellLines(c)
  undercutRow(c)
  c.post = W.Primary(c, "Post", function() AH.Post() end, 120)
  c.post:SetPoint("TOPRIGHT", 0, -110)
  AH.sellCard = c
  hooksecurefunc(AuctionHouseFrame, "SetPostItem", function(_, loc) AH.TakeItem(loc) end)
end
