-- Auction helper, your auctions (Modules/AuctionHelper.lua holds the panel,
-- the search queue, the scan and the slash commands; the rows sit on its
-- scan card): Check undercuts asks for your auctions (ReadOwned) and checks
-- each item's price now, MarkUndercuts marks the ones someone else asks
-- less for, and each row's Cancel (its cost on hover) cancels one.
--
-- Standing rules here: CancelAuction runs only inside a row's Cancel click;
-- asking for your auctions and each price check go through AH.Queue (one in
-- flight, at most 60 a minute); every price and quantity goes through
-- ns.PlainNumber before arithmetic; both paths work (a commodity's buyout is
-- per unit, an item's per auction); nothing writes into the game's frames.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- Your auctions: rows under the scan line (how many, from where), and Enum.AuctionStatus.Active.
AH.OWNED_ROWS, AH.OWNED_ROWS_Y, AH.ACTIVE = 4, -64, 0

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

-- Check undercuts: asks for your auctions (their prices are checked when they come in).
function AH.CheckUndercuts()
  AH.Queue({ owned = true })
end

-- Your auctions came in: kept and shown; after Check undercuts, each item's price is checked.
function AH.OnOwned()
  local s, seen = AH.pending, {}
  AH.owned = AH.ReadOwned()
  AH.PaintOwned()
  if not (s and s.owned) then return end
  for _, a in ipairs(AH.owned) do
    if not seen[a.key.itemID] then seen[a.key.itemID] = true AH.Queue({ sell = C_AuctionHouse.MakeItemKey(a.key.itemID), check = true }) end
  end
  AH.Done()
end

-- An item's price check answered: each of your auctions of it is undercut when someone else
-- asks less per unit (a commodity's buyout is per unit, an item's per auction).
function AH.MarkUndercuts(id, cheapest, commodity)
  for _, a in ipairs(AH.owned) do
    if a.key.itemID == id then
      a.unit = commodity and a.buyout or math.floor(a.buyout / a.qty)
      a.undercut = cheapest ~= nil and cheapest < a.unit
    end
  end
  AH.PaintOwned()
end

-- Cancel (the row's click, never a timer or an event): cancels one of your auctions if the game allows it.
function AH.Cancel(id)
  if id and C_AuctionHouse.CanCancelAuction(id) then C_AuctionHouse.CancelAuction(id) end
end

-- An auction was cancelled: its row goes.
function AH.OnCanceled(_, id)
  for i, a in ipairs(AH.owned) do
    if a.id == id then table.remove(AH.owned, i) break end
  end
  AH.PaintOwned()
end

-- Cancel's tooltip: what cancelling costs.
local function cancelTip(b)
  local cost = ns.PlainNumber(C_AuctionHouse.GetCancelCost(b:GetParent().id))
  GameTooltip:SetOwner(b, "ANCHOR_RIGHT")
  GameTooltip:SetText("Cancel this auction")
  if cost then GameTooltip:AddLine("Costs " .. AP.Money(cost), T.RGB("text2")) end
  GameTooltip:Show()
end

-- An auction's row: a red mark when undercut, the item, your price per unit, and Cancel.
local function paintOwnedRow(r, a)
  r:SetShown(a ~= nil)
  if not a then return end
  local info = C_AuctionHouse.GetItemKeyInfo(a.key)
  r.id = a.id
  r.mark:SetShown(a.undercut == true)
  r.icon:SetTexture(info and info.iconFileID or AH.UNKNOWN_ICON)
  r.name:SetText(info and info.itemName or ("item " .. a.key.itemID))
  r.price:SetText(a.unit and AP.Money(a.unit) or "")
end

-- Your auctions under the scan card, from the scroll offset.
function AH.PaintOwned()
  local c = AH.scanCard
  if not c then return end
  for i, r in ipairs(c.owned) do paintOwnedRow(r, AH.owned[c.offset + i]) end
end

-- An auction row's Cancel, with what cancelling costs on hover.
local function cancelButton(r)
  local b = W.Button(r, "Cancel", function(self) AH.Cancel(self:GetParent().id) end, 60)
  b:SetHeight(18)
  b:SetPoint("RIGHT", 0, 0)
  b:SetScript("OnEnter", cancelTip)
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
  r.cancel = cancelButton(r)
end

-- The wheel over your auctions scrolls them.
local function scrollOwned(c, delta)
  c.offset = math.max(0, math.min(#AH.owned - #c.owned, c.offset - delta))
  AH.PaintOwned()
end

-- Check undercuts and the rows of your auctions under the scan line.
function AH.BuildOwned(c)
  c.check = W.Button(c, "Check undercuts", function() AH.CheckUndercuts() end, 120)
  c.check:SetPoint("TOPRIGHT", 0, -20)
  c.owned, c.offset = {}, 0
  for i = 1, AH.OWNED_ROWS do
    c.owned[i] = AH.Row(c, i, AH.OWNED_ROWS_Y)
    ownedParts(c.owned[i])
  end
  c:EnableMouseWheel(true)
  c:SetScript("OnMouseWheel", scrollOwned)
end
