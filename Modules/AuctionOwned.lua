-- Auction helper, your auctions (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands; the rows sit on its
-- scan card): Check undercuts asks for your auctions (ReadOwned) and checks
-- each item's price now, MarkUndercuts marks the ones someone else asks
-- less for, and a line under the rows says how many ("3 undercut"). Each
-- row's Cancel (its cost on hover) cancels one; Cancel next undercut
-- cancels the first undercut auction on each click and moves to the next.
-- With "check again" on, a post or a cancel checks them all again.
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

-- Your auctions: rows under the scan line (how many, from where), and Enum.AuctionStatus.Active.
AH.OWNED_ROWS, AH.OWNED_ROWS_Y, AH.ACTIVE = 4, -64, 0
-- Cancel next undercut and the line beside it, under the rows (down from the scan card's top).
AH.NEXT_Y = -146
-- Check your auctions again after each post and cancel: off until switched on, since each
-- check is a search per item (Bars, map, chat > Auction house).
AH.defaults.recheck = false

-- Your auctions ------------------------------------------------------------------------------

-- One of your auctions as a row's data, or nil (sold, no buyout, or a number the client hides).
-- Its price per unit: the buyout for a commodity (priced per unit), else the buyout over the quantity.
local function ownedAuction(a)
  local buyout, qty, id = ns.PlainNumber(a.buyoutAmount), ns.PlainNumber(a.quantity), ns.PlainNumber(a.auctionID)
  if a.status ~= AH.ACTIVE or not (buyout and qty and id) or qty < 1 then return nil end
  local info = C_AuctionHouse.GetItemKeyInfo(a.itemKey)
  local unit = info and info.isCommodity and buyout or math.floor(buyout / qty)
  return { id = id, key = a.itemKey, buyout = buyout, qty = qty, unit = unit }
end

-- Your active auctions with a buyout.
function AH.ReadOwned()
  local out = {}
  for _, a in ipairs(C_AuctionHouse.GetOwnedAuctions() or {}) do out[#out + 1] = ownedAuction(a) end
  return out
end

-- Your auctions as the game lists them now, each keeping its undercut mark (until the next check)
-- and a cancel on its way from the list before.
local function keep(old, new)
  local was = {}
  for _, o in ipairs(old) do was[o.id] = o end
  for _, a in ipairs(new) do
    local o = was[a.id]
    if o then a.undercut, a.cancelling = o.undercut, o.cancelling end
  end
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
-- an auction was cancelled, and one was posted (AUCTION_HOUSE_AUCTION_CREATED, the game's own
-- signal for addons).
function AH.ListenOwned(on)
  on("OWNED_AUCTIONS_UPDATED", AH.OnOwned)
  on("AUCTION_CANCELED", AH.OnCanceled)
  on("AUCTION_HOUSE_AUCTION_CREATED", AH.Recheck)
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
    if a.key.itemID == id then
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
  for _, a in ipairs(AH.owned) do if a.undercut and not a.cancelling then out[#out + 1] = a end end
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

-- An auction was cancelled: its row goes (and with "check again" on, the rest are checked again).
function AH.OnCanceled(_, id)
  for i, a in ipairs(AH.owned) do
    if a.id == id then table.remove(AH.owned, i) break end
  end
  AH.PaintOwned()
  AH.Recheck()
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

-- An auction's row: a red mark when undercut, the item, your price per unit, and Cancel.
local function paintOwnedRow(r, a)
  r:SetShown(a ~= nil)
  if not a then return end
  local name, icon = itemLook(a.key)
  r.id = a.id
  r.mark:SetShown(a.undercut == true)
  r.icon:SetTexture(icon)
  r.name:SetText(name)
  r.price:SetText(a.unit and AP.Money(a.unit) or "")
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

-- An auction row's parts: the undercut mark, icon, name, price and Cancel.
local function ownedParts(r)
  r.mark = W.Flat(r, "ARTWORK", "bad")
  r.mark:SetSize(6, 6)
  r.mark:SetPoint("LEFT", 0, 0)
  AH.RowParts(r)
  r.icon:SetPoint("LEFT", 10, 0)
  r.price:SetPoint("RIGHT", -64, 0)
  r.cancel = costButton(r, "Cancel", function(self) AH.Cancel(self:GetParent().id) end, 60, cancelTip)
  r.cancel:SetPoint("RIGHT", 0, 0)
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
