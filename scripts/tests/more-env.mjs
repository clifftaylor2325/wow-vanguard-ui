// TEST-ONLY environments and readers shared by the files split out of more.test.mjs (chat-bags,
// quest-dialog, quests, game-alerts, info-strip, errands, game-menu, menu-strip, game-tools,
// game-windows and more): each exported here is used by two or more of them.


// The painting counts so far, then reset.
export const painted = (addon) => addon.eval("local c = { __paint.Panel, __paint.FadeRegions, __paint.SetBorder } for k in pairs(__paint) do __paint[k] = 0 end return c");

// TEST-ONLY merchant: repairs for 50s; bag 0 holds a gray item, a gray with no value, and a white.
export const MERCHANT_ENV = `
  C_MerchantFrame = nil
  __repairs, __used = {}, {}
  CanMerchantRepair = function() return __canRepair end
  __canRepair, __cost, __gold = true, 5000, 10000
  GetRepairAllCost = function() return __cost, true end
  GetMoney = function() return __gold end
  RepairAllItems = function(guild) __repairs[#__repairs + 1] = guild end
  __bag = { { quality = 0 }, { quality = 0, hasNoValue = true }, { quality = 1 }, { quality = { __secret = true } } }
  __sticky = 1
  C_Container = { GetContainerNumSlots = function(bag) return bag == 0 and 4 or 0 end,
    GetContainerItemInfo = function(bag, slot) return __bag[slot] end,
    UseContainerItem = function(bag, slot) __used[#__used + 1] = slot if __sticky > 0 then __sticky = __sticky - 1 else __bag[slot] = nil end end }
  C_Timer = { After = function(_, fn) fn() end }
  ERR_ABILITY_COOLDOWN = "TEST-ONLY not ready"
  -- The game's own error line: its handler asks ShouldDisplayMessageType (type 99 is on the game's blacklist),
  -- shows the message under its type as the line's ID, and plays the type's sound.
  UIErrorsFrame = CreateFrame("Frame", "UIErrorsFrame", UIParent) UIErrorsFrame:RegisterEvent("UI_ERROR_MESSAGE")
  function UIErrorsFrame:ShouldDisplayMessageType(messageType) return messageType ~= 99 end
  function UIErrorsFrame:AddMessage(text, r, g, b, a, id) self.__lines = self.__lines or {} self.__lines[#self.__lines + 1] = { text, id } end
  UIErrorsFrame:SetScript("OnEvent", function(self, event, messageType, message)
    if type(message) == "string" and self:ShouldDisplayMessageType(messageType, message) then self:AddMessage(message, 1, 0.1, 0.1, 1, messageType) __sounds = (__sounds or 0) + 1 end
  end)
`;

// The bag and menu bar's rows' scales: each puts its buttons one 24-unit slot and a 4-unit gap apart.
export const MENU = 28 / 27, BAGS = 28 / 47;

// A number to three places (sizes worked out in fractions of a unit).
export const r3 = (n) => Math.round(n * 1000) / 1000;

// The bag and menu bar's width and height.
export const barSize = (addon) => addon.eval("return { Vanguard_MenuStrip:GetWidth(), Vanguard_MenuStrip:GetHeight() }").map(r3);

// The bar's width around a longer row of n slots: the slots, their 4-pixel gaps, and a 12-pixel margin each side.
export const barW = (n) => (n > 0 ? n * 28 - 4 : 0) + 24;

// The bar's height: a 24-pixel bags row, a 4-pixel gap and a 30-pixel menu row, inside the margins.
export const BAR_H = 24 + 4 + 30 + 24;
