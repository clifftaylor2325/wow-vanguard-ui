-- Small helpers at a merchant, and a quieter error line:
--   * repair everything with your own gold when you open a merchant who repairs;
--   * sell your gray items (the server limits how fast items sell, so what's
--     left is tried again a few times);
--   * drop the error messages that only repeat what the action bar already
--     shows (ability not ready, not enough rage or energy, no target...).
--     Errors you can act on (out of range, not enough mana, bags full) stay.

local ADDON, ns = ...

local MC = ns.Module("Merchant", { defaults = { repair = true, junk = true, errors = true } })

MC.RETRIES, MC.RETRY_AFTER = 3, 0.3
-- The client's own names for the noisy errors (their text is in the player's language).
MC.NOISE = {
  "ERR_ABILITY_COOLDOWN", "ERR_SPELL_COOLDOWN", "ERR_ITEM_COOLDOWN", "ERR_OUT_OF_ENERGY", "ERR_OUT_OF_RAGE",
  "ERR_OUT_OF_FOCUS", "ERR_NO_ATTACK_TARGET", "ERR_GENERIC_NO_TARGET", "SPELL_FAILED_SPELL_IN_PROGRESS",
}

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
  if cost > (ns.PlainNumber(GetMoney()) or 0) then return ns.Chat("Not enough gold to repair (" .. money(cost) .. ").") end
  RepairAllItems(false)
  ns.Chat("Repaired for " .. money(cost) .. ".")
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
  for bag = 0, 4 do
    for slot = 1, ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do
      if isJunk(bag, slot) then out[#out + 1] = { bag, slot } end
    end
  end
  return out
end

-- Sells what junk is left, then tries again shortly while some remains and tries are left.
function MC.SellJunk(tries)
  local junk = MC.Junk()
  if #junk == 0 then return end
  for _, spot in ipairs(junk) do C_Container.UseContainerItem(spot[1], spot[2]) end
  if tries == MC.RETRIES then ns.Chat(string.format("Selling %d junk item(s).", #junk)) end
  if tries > 1 and C_Timer and C_Timer.After then C_Timer.After(MC.RETRY_AFTER, function() MC.SellJunk(tries - 1) end) end
end

-- Sells your junk: the client's own one-step sale where it has one.
function MC.Sell()
  local all = C_MerchantFrame and C_MerchantFrame.SellAllJunkItems
  if type(all) == "function" then return all() end
  if C_Container and C_Container.GetContainerItemInfo then MC.SellJunk(MC.RETRIES) end
end

-- A merchant opened: repair and sell, as switched on.
local function onMerchant()
  if MC.settings.repair then MC.Repair() end
  if MC.settings.junk then MC.Sell() end
end

-- Errors ------------------------------------------------------------------------------------

-- True for an error that only repeats what the action bar shows.
function MC.Noisy(message)
  for _, name in ipairs(MC.NOISE) do
    if _G[name] == message then return true end
  end
  return false
end

-- Takes over the client's error line: the rest of its errors show as before, in red.
local function filterErrors()
  local frame = _G.UIErrorsFrame
  if type(frame) ~= "table" or not frame.UnregisterEvent then return end
  frame:UnregisterEvent("UI_ERROR_MESSAGE")
  ns.On("UI_ERROR_MESSAGE", function(_, _, message)
    if type(message) == "string" and not MC.Noisy(message) then frame:AddMessage(message, 1, 0.1, 0.1) end
  end)
end

-- Module entry point (Core/Modules.lua).
function MC.Enable(settings)
  MC.settings = settings
  ns.On("MERCHANT_SHOW", onMerchant)
  if settings.errors then filterErrors() end
end
