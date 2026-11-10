-- Small helpers at a merchant:
--   * repair everything with your own gold when you open a merchant who repairs;
--   * sell your gray items (the server limits how fast items sell, so what's
--     left is tried again a few times, only while the merchant stays open);
--   * sell the items on your own sell list, ask first, and buy a stack or the most you can in one click
--     (off until switched on; Modules/MerchantBulk.lua).
-- The game's HUD text in the theme font was here until it got its own module (Modules/HudText.lua).

local ADDON, ns = ...
local L = ns.L

local MC = ns.Module("Merchant", { defaults = { repair = true, junk = true, listSell = false, bulkBuy = true }, live = true })

MC.RETRIES, MC.RETRY_AFTER = 3, 0.3
-- The last bag scanned for sales: the reagent bag (Enum.BagIndex.ReagentBag), after the four ordinary bags.
MC.LAST_BAG = 5

-- Money as text, the info strip's way.
local function money(copper)
  return ns.GetModule("InfoStrip").Money(copper)
end

-- Repair ------------------------------------------------------------------------------------

-- Repairs everything with your own gold, if this merchant repairs and you can pay; says what it cost.
function MC.Repair()
  if type(CanMerchantRepair) ~= "function" or not CanMerchantRepair() then return end
  local cost, can = GetRepairAllCost()
  cost = ns.PlainNumber(cost)
  if not cost or cost <= 0 or not can then return end
  if cost > (ns.PlainNumber(GetMoney()) or 0) then return ns.Chat(ns.Format(L["Not enough gold to repair ({money})."], { money = money(cost) })) end
  RepairAllItems(false)
  ns.Chat(ns.Format(L["Repaired for {money}."], { money = money(cost) }))
end

-- Junk --------------------------------------------------------------------------------------

-- True for a gray item worth something at the vendor.
local function isJunk(bag, slot)
  local info = C_Container.GetContainerItemInfo(bag, slot)
  if type(info) ~= "table" or ns.IsSecret(info.quality) or ns.IsSecret(info.hasNoValue) then return false end
  return info.quality == 0 and not info.hasNoValue
end

-- Your junk as { bag, slot } pairs.
function MC.Junk()
  local out = {}
  for bag = 0, MC.LAST_BAG do
    for slot = 1, ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do
      if isJunk(bag, slot) then out[#out + 1] = { bag, slot } end
    end
  end
  return out
end

-- Sells what junk is left, then tries again shortly while some remains and tries are left; only while a
-- merchant is open (using a bag item with none open would use or equip it), before every try.
function MC.SellJunk(tries)
  if not MC.Trading() then return end
  local junk = MC.Junk()
  if #junk == 0 then return end
  for _, spot in ipairs(junk) do C_Container.UseContainerItem(spot[1], spot[2]) end
  if tries == MC.RETRIES then ns.Chat(ns.Format(L["Selling {count} junk item(s)."], { count = #junk })) end
  if tries > 1 and C_Timer and C_Timer.After then C_Timer.After(MC.RETRY_AFTER, ns.Guard("timer sell junk", function() MC.SellJunk(tries - 1) end)) end
end

-- Sells your junk: the client's own one-step sale where it has one and has it turned on, else item by item.
function MC.Sell()
  local all = C_MerchantFrame and C_MerchantFrame.SellAllJunkItems
  local enabled = C_MerchantFrame and C_MerchantFrame.IsSellAllJunkEnabled
  if type(all) == "function" and type(enabled) == "function" and enabled() == true then return all() end
  if C_Container and C_Container.GetContainerItemInfo then MC.SellJunk(MC.RETRIES) end
end

-- A merchant opened: repair and sell, as switched on.
local function onMerchant()
  MC.SetOpen(true)
  if MC.settings.repair then MC.Repair() end
  if MC.settings.junk then MC.Sell() end
  MC.OfferList()
end

-- The merchant closed.
local function onMerchantClosed()
  MC.SetOpen(false)
end

-- Module entry point (Core/Modules.lua): the merchant events through the scope, and the quantity window's hooks
-- (gates, installed once a session). MC.Disable, in Modules/MerchantBulk.lua, hides the drawers it drew.
function MC.Enable(settings, scope)
  MC.settings, MC.scope = settings, scope
  MC.MoveSellList(settings)
  scope:On("MERCHANT_SHOW", onMerchant)
  scope:On("MERCHANT_CLOSED", onMerchantClosed)
  MC.HookSplit()
end
