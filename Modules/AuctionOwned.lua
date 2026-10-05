-- Auction helper, your auctions (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands; the rows sit on its
-- scan card): Check undercuts asks for your auctions (ReadOwned) and checks
-- each item's price now, MarkUndercuts marks the ones someone else asks
-- less for, and a line under the rows says how many ("3 undercut"). Each
-- row's Cancel (its cost on hover) cancels one; Cancel next undercut
-- cancels the first undercut auction on each click and moves to the next.
-- With "check again" on, a post or a cancel checks them all again.
-- Each row says how its auction stands: up (your price per unit and
-- Cancel), sold (the amount), or expired (coming back by mail; once it is
-- in the bags, Relist puts it on the sell card through AH.TakeItem). The
-- rows stay while the house is closed, so an expired one is still there
-- after the walk to the mailbox.
--
-- Standing rules here: CancelAuction runs only inside a Cancel click (a
-- row's, or Cancel next undercut's: one auction per click); asking for your
-- auctions and each price check go through AH.Queue (one in flight, at most
-- 60 a minute); every price and quantity goes through ns.PlainNumber before
-- arithmetic; both paths work (a commodity's buyout is per unit, an item's
-- per auction); nothing writes into the game's frames.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- Your auctions: rows under the scan line (how many, from where).
AH.OWNED_ROWS, AH.OWNED_ROWS_Y = 4, -64
-- A row's status by Enum.AuctionStatus (Active 0, Sold 1; AuctionHouseDocumentation.lua); an
-- expired auction has no status of its own: AUCTION_HOUSE_AUCTIONS_EXPIRED says so.
AH.STATUS = { [0] = "active", [1] = "sold" }
-- Enum.AuctionHouseNotification's AuctionSold and AuctionExpired (AuctionHouseEnumsDocumentation.lua),
-- as AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION gives them.
AH.SOLD_NOTE, AH.EXPIRED_NOTE = 4, 5
-- The bags searched for an expired auction's item: the backpack (0) to the fourth bag.
AH.LAST_BAG = 4
-- Cancel next undercut and the line beside it, under the rows (down from the scan card's top).
AH.NEXT_Y = -146
-- Check your auctions again after each post and cancel: off until switched on, since each
-- check is a search per item (Bars, map, chat > Auction house).
AH.defaults.recheck = false

-- Your auctions ------------------------------------------------------------------------------

-- An auction's price per unit and the whole auction's, from its buyout (a commodity's buyout is
-- per unit, an item's per auction); nothing without a buyout.
local function prices(key, buyout, qty)
  if not buyout then return nil, nil end
  local info = C_AuctionHouse.GetItemKeyInfo(key)
  if info and info.isCommodity then return buyout, buyout * qty end
  return math.floor(buyout / qty), buyout
end

-- One of your auctions as a row's data, or nil (one up without a buyout, or a number the client
-- hides). A sold one's amount is the whole auction's buyout, else the bid it sold on.
local function ownedAuction(a)
  local buyout, bid = ns.PlainNumber(a.buyoutAmount), ns.PlainNumber(a.bidAmount)
  local qty, id, status = ns.PlainNumber(a.quantity), ns.PlainNumber(a.auctionID), AH.STATUS[a.status]
  if not (status and qty and id) or qty < 1 or not (buyout or status == "sold" and bid) then return nil end
  local unit, total = prices(a.itemKey, buyout, qty)
  return { id = id, key = a.itemKey, buyout = buyout, qty = qty, unit = unit, amount = total or bid, status = status }
end

-- Your auctions as the game lists them: up with a buyout, or sold.
function AH.ReadOwned()
  local out = {}
  for _, a in ipairs(C_AuctionHouse.GetOwnedAuctions() or {}) do out[#out + 1] = ownedAuction(a) end
  return out
end

-- True for an auction still up (neither sold nor expired).
local function up(a)
  return a.status ~= "sold" and a.status ~= "expired"
end

-- Your auctions as the game lists them now, each keeping its undercut mark (until the next check)
-- and a cancel on its way from the list before; the expired ones (the game drops them) stay at
-- the end until relisted.
local function keep(old, new)
  local was = {}
  for _, o in ipairs(old) do was[o.id] = o end
  for _, a in ipairs(new) do
    local o = was[a.id]
    was[a.id] = nil
    if o then a.undercut, a.cancelling = o.undercut, o.cancelling end
  end
  for _, o in ipairs(old) do if was[o.id] and o.status == "expired" then new[#new + 1] = o end end
  return new
end

-- Check undercuts: asks for your auctions (their prices are checked when they come in).
function AH.CheckUndercuts()
  AH.checked = true
  AH.Queue({ owned = true })
  AH.PaintOwned()
end

-- After a post or a cancel, with "check again" on: your auctions are checked again (a check still
-- waiting is dropped first, so the searches never pile up).
function AH.Recheck()
  if not (AH.settings.recheck and AH.open) then return end
  AH.DropQueued("owned")
  AH.DropQueued("check")
  AH.CheckUndercuts()
end

-- Your auctions' events, through the helper's on (no handler runs in combat): the list came in,
-- an auction was cancelled, one was posted (AUCTION_HOUSE_AUCTION_CREATED, the game's own signal
-- for addons), one ran out, and the game's notices (one sold or ran out).
function AH.ListenOwned(on)
  on("OWNED_AUCTIONS_UPDATED", AH.OnOwned)
  on("AUCTION_CANCELED", AH.OnCanceled)
  on("AUCTION_HOUSE_AUCTION_CREATED", AH.Recheck)
  on("AUCTION_HOUSE_AUCTIONS_EXPIRED", AH.OnExpired)
  on("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", AH.OnNotice)
end

-- A price check for each item among your auctions (one per item).
local function checkPrices()
  local seen = {}
  for _, a in ipairs(AH.owned) do
    local id = a.key.itemID
    if not seen[id] then seen[id] = true AH.Queue({ sell = C_AuctionHouse.MakeItemKey(id), check = true }) end
  end
end

-- Your auctions came in: kept and shown; after Check undercuts, each item's price is checked.
function AH.OnOwned()
  local s = AH.pending
  AH.owned = keep(AH.owned, AH.ReadOwned())
  if s and s.owned then
    checkPrices()
    AH.Done()
  end
  AH.PaintOwned()
end

-- An item's price check answered: each of your auctions of it is undercut when someone else
-- asks less per unit (a commodity's buyout is per unit, an item's per auction).
function AH.MarkUndercuts(id, cheapest, commodity)
  if AH.pending then AH.pending.answered = true end
  for _, a in ipairs(AH.owned) do
    if a.key.itemID == id and up(a) then
      a.unit = commodity and a.buyout or math.floor(a.buyout / a.qty)
      a.undercut = cheapest ~= nil and cheapest < a.unit
    end
  end
  AH.PaintOwned()
end

-- True while Check undercuts' searches (your auctions, then each item's price) wait or run.
local function checking()
  local s = AH.pending
  if s and (s.owned or s.check) and not s.answered then return true end
  for _, q in ipairs(AH.queue) do if q.owned or q.check then return true end end
  return false
end

-- The undercut auctions left to cancel (none already on its way), in the list's order.
local function undercuts()
  local out = {}
  for _, a in ipairs(AH.owned) do
    if a.undercut and not a.cancelling and up(a) then out[#out + 1] = a end
  end
  return out
end

-- The next undercut auction the game lets you cancel, or nil.
function AH.NextUndercut()
  for _, a in ipairs(undercuts()) do
    if C_AuctionHouse.CanCancelAuction(a.id) then return a end
  end
end

-- Cancel (the row's click, never a timer or an event): cancels one of your auctions if the game allows it.
function AH.Cancel(id)
  if id and C_AuctionHouse.CanCancelAuction(id) then C_AuctionHouse.CancelAuction(id) end
end

-- Cancel next undercut (the button's click, never a timer or an event): cancels one auction, the
-- next undercut one, marked as on its way so the next click takes the one after.
function AH.CancelNext()
  local a = AH.NextUndercut()
  if not a then return end
  a.cancelling = true
  C_AuctionHouse.CancelAuction(a.id)
  AH.PaintOwned()
end

-- The row of auction id and its place in the list, or nil.
local function findOwned(id)
  for i, a in ipairs(AH.owned) do
    if a.id == id then return a, i end
  end
end

-- An auction was cancelled: its row goes (and with "check again" on, the rest are checked again).
function AH.OnCanceled(_, id)
  local _, i = findOwned(id)
  if i then table.remove(AH.owned, i) end
  AH.PaintOwned()
  AH.Recheck()
end

-- An auction ran out (AUCTION_HOUSE_AUCTIONS_EXPIRED): its row stays, as expired, until relisted.
function AH.OnExpired(_, id)
  local a = findOwned(id)
  if a then a.status = "expired" end
  AH.PaintOwned()
end

-- The game's notice about an auction (AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION: the notice, its
-- text and, when it has one, the auction): one of yours sold, or ran out.
function AH.OnNotice(_, note, _, id)
  local a = id and findOwned(id)
  if not a then return end
  a.status = note == AH.SOLD_NOTE and "sold" or note == AH.EXPIRED_NOTE and "expired" or a.status
  AH.PaintOwned()
end

-- The first bag slot holding item id (the backpack to bag AH.LAST_BAG), as an ItemLocation, or nil.
function AH.FindInBags(id)
  for bag = 0, AH.LAST_BAG do
    for slot = 1, ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do
      local info = C_Container.GetContainerItemInfo(bag, slot)
      if info and ns.PlainNumber(info.itemID) == id then return ItemLocation:CreateFromBagAndSlot(bag, slot) end
    end
  end
end

-- Relist (an expired row's click): once the item is back in the bags, its row goes and the item
-- goes on the sell card (the sell card's own TakeItem, which checks its price now).
function AH.Relist(id)
  local a, i = findOwned(id)
  local loc = a and AH.FindInBags(a.key.itemID)
  if not loc then return end
  table.remove(AH.owned, i)
  AH.TakeItem(loc)
  AH.PaintOwned()
end

-- An auction's item name ("item 123" until the client knows it) and icon.
local function itemLook(key)
  local info = C_AuctionHouse.GetItemKeyInfo(key)
  return info and info.itemName or ("item " .. key.itemID), info and info.iconFileID or AH.UNKNOWN_ICON
end

-- A tooltip on b: what a click does, and what cancelling auction id costs (when the game says).
local function costTip(b, title, id)
  local cost = ns.PlainNumber(C_AuctionHouse.GetCancelCost(id))
  GameTooltip:SetOwner(b, "ANCHOR_RIGHT")
  GameTooltip:SetText(title)
  if cost then GameTooltip:AddLine("Costs " .. AP.Money(cost), T.RGB("text2")) end
  GameTooltip:Show()
end

-- Cancel's tooltip: what cancelling costs.
local function cancelTip(b)
  costTip(b, "Cancel this auction", b:GetParent().id)
end

-- Cancel next undercut's tooltip: the auction it cancels next, and what that costs.
local function nextTip(b)
  local a = AH.NextUndercut()
  if a then costTip(b, "Cancel " .. (itemLook(a.key)), a.id) end
end

-- What a row's price column says, and in which color: your price per unit while up, "sold" and
-- the amount, or "expired" and where the item is (coming back by mail, or in the bags).
local function statusText(a, home)
  if a.status == "sold" then return "sold · " .. AP.Money(a.amount), "good" end
  if a.status == "expired" then return home and "expired · in bags" or "expired · by mail", "text2" end
  return AP.Money(a.unit), "gold"
end

-- A row's red mark (undercut, while up) and its button: Cancel while up, Relist once expired
-- (working when the item is back in the bags); a sold row has none.
local function paintActions(r, a, home)
  r.mark:SetShown(a.undercut == true and up(a))
  r.cancel:SetShown(up(a))
  r.relist:SetShown(a.status == "expired")
  if home then r.relist:Enable() else r.relist:Disable() end
  T.Color(r.relist.text, home and "text" or "muted")
end

-- An auction's row: the item, what the price column says by status, the mark and the button.
local function paintOwnedRow(r, a)
  r:SetShown(a ~= nil)
  if not a then return end
  local name, icon = itemLook(a.key)
  local home = a.status == "expired" and AH.FindInBags(a.key.itemID) ~= nil
  local text, color = statusText(a, home)
  r.id = a.id
  r.icon:SetTexture(icon)
  r.name:SetText(name)
  T.Color(r.price, color):SetText(text)
  paintActions(r, a, home)
end

-- Paints your auctions again in AH.SEND_GAP seconds (one wait at a time) while a check runs: its
-- last search may give up without an answer, and the line then still has to say how many are undercut.
local function paintLater()
  if AH.paintWait then return end
  AH.paintWait = true
  C_Timer.After(AH.SEND_GAP, function() AH.paintWait = false AH.PaintOwned() end)
end

-- The line under the rows once you've checked ("checking...", "3 undercut", "none undercut"),
-- and Cancel next undercut, which works while an undercut auction is left to cancel.
local function paintNext(c)
  local busy, n, nextOne = checking(), #undercuts(), AH.NextUndercut()
  if busy then paintLater() end
  c.summary:SetText(not AH.checked and "" or busy and "checking..." or n > 0 and (n .. " undercut") or "none undercut")
  if nextOne then c.cancelNext:Enable() else c.cancelNext:Disable() end
  T.Color(c.cancelNext.text, nextOne and "text" or "muted")
end

-- Your auctions under the scan card, from the scroll offset, and the line and button under them.
function AH.PaintOwned()
  local c = AH.scanCard
  if not c then return end
  for i, r in ipairs(c.owned) do paintOwnedRow(r, AH.owned[c.offset + i]) end
  paintNext(c)
end

-- A button whose tooltip says what it costs (Cancel and Cancel next undercut), 18 high.
local function costButton(parent, text, onClick, width, tip)
  local b = W.Button(parent, text, onClick, width)
  b:SetHeight(18)
  b:SetScript("OnEnter", tip)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return b
end

-- An auction row's parts: the undercut mark, icon, name (up to the price column, however long
-- that is), the price column, and Cancel or Relist in the same place.
local function ownedParts(r)
  r.mark = W.Flat(r, "ARTWORK", "bad")
  r.mark:SetSize(6, 6)
  r.mark:SetPoint("LEFT", 0, 0)
  AH.RowParts(r)
  r.icon:SetPoint("LEFT", 10, 0)
  r.price:SetPoint("RIGHT", -64, 0)
  r.name:SetPoint("RIGHT", r.price, "LEFT", -4, 0)
  r.cancel = costButton(r, "Cancel", function(self) AH.Cancel(self:GetParent().id) end, 60, cancelTip)
  r.relist = W.Button(r, "Relist", function(self) AH.Relist(self:GetParent().id) end, 60)
  for _, b in ipairs({ r.cancel, r.relist }) do b:SetHeight(18) b:SetPoint("RIGHT", 0, 0) end
end

-- Cancel next undercut (what it cancels next and the cost on hover), and the line beside it.
local function nextRow(c)
  c.cancelNext = costButton(c, "Cancel next undercut", function() AH.CancelNext() end, 140, nextTip)
  c.cancelNext:SetPoint("TOPRIGHT", 0, AH.NEXT_Y)
  c.summary = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.summary:SetPoint("LEFT", c, "TOPLEFT", 0, AH.NEXT_Y - 9)
end

-- The wheel over your auctions scrolls them.
local function scrollOwned(c, delta)
  c.offset = math.max(0, math.min(#AH.owned - #c.owned, c.offset - delta))
  AH.PaintOwned()
end

-- Check undercuts, the rows of your auctions under the scan line, and Cancel next undercut.
function AH.BuildOwned(c)
  c.check = W.Button(c, "Check undercuts", function() AH.CheckUndercuts() end, 120)
  c.check:SetPoint("TOPRIGHT", 0, -20)
  c.owned, c.offset = {}, 0
  for i = 1, AH.OWNED_ROWS do
    c.owned[i] = AH.Row(c, i, AH.OWNED_ROWS_Y)
    ownedParts(c.owned[i])
  end
  nextRow(c)
  c:EnableMouseWheel(true)
  c:SetScript("OnMouseWheel", scrollOwned)
end
