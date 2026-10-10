-- Small helpers at a merchant, and a quieter error line:
--   * repair everything with your own gold when you open a merchant who repairs;
--   * sell your gray items (the server limits how fast items sell, so what's
--     left is tried again a few times);
--   * drop the error messages that only repeat what the action bar already
--     shows (ability not ready, not enough rage or energy, no target...).
--     Errors you can act on (out of range, not enough mana, bags full) stay,
--     and still go through the client's own error line.
--   * the error line, and the zone names shown as you enter a place, in the theme font.

local ADDON, ns = ...

local T = ns.Theme
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
  if tries > 1 and C_Timer and C_Timer.After then C_Timer.After(MC.RETRY_AFTER, ns.Guard("timer sell junk", function() MC.SellJunk(tries - 1) end)) end
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

-- Makes the client's own error line decline the noisy errors. Its handler stays
-- (per-type lines that refresh instead of stacking, throttling, flashing, sounds):
-- it asks the frame whether each message may show, and that answer is filtered here.
local function filterErrors()
  local frame = _G.UIErrorsFrame
  if type(frame) ~= "table" or type(frame.ShouldDisplayMessageType) ~= "function" then return end
  local allowed = frame.ShouldDisplayMessageType
  -- The client's answer, unless the message is noise.
  frame.ShouldDisplayMessageType = function(self, messageType, message)
    if not ns.IsSecret(message) and MC.Noisy(message) then return false end
    return allowed(self, messageType, message)
  end
end

-- HUD text ----------------------------------------------------------------------------------

-- The game's font objects for its text on the HUD, at the game's own sizes (scaled by Text
-- size): the error line, and the zone, subzone and PvP lines (PVPArenaTextString's too).
MC.FONTS = { ErrorFont = { 16, true }, ZoneTextFont = { 32, true }, SubZoneTextFont = { 26, true }, PVPInfoTextFont = { 22, true } }

-- The HUD text in the theme font, with the theme's drop shadow in place of the game's
-- thick outline so it reads over the world. A font object the client lacks is skipped.
function MC.ThemeFonts()
  T.FontObjects(MC.FONTS)
  for name in pairs(MC.FONTS) do
    local font = _G[name]
    if type(font) == "table" and font.SetShadowOffset then
      font:SetShadowOffset(1, -1)
      font:SetShadowColor(T.RGB("textShadow"))
    end
  end
end

-- Module entry point (Core/Modules.lua).
function MC.Enable(settings)
  MC.settings = settings
  ns.On("MERCHANT_SHOW", onMerchant)
  if settings.errors then filterErrors() end
  MC.ThemeFonts()
end
