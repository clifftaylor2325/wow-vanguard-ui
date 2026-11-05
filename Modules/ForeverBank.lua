-- The bank window's WoW Forever parts (WoW Forever only: the TOC keeps this file off Retail), added to the bank's
-- skin (Modules/Bags.lua, BG.BANK_PARTS) with the Bags module's bank switch. Forever's bank (Camelot
-- BankFrame.lua/.xml) makes these itself, and Vanguard dresses them to sit with the flat bank panel:
--   * the page tabs down its right side, as the game windows' side tabs are (under the tabs switch; the game makes
--     them again whenever the pages change, RefreshPageTabs);
--   * the row of bank bag slots at its foot, as item slots (RefreshBagButtons);
--   * the Bag Slots and Costs lines, the money beside them and the Purchase button, while a bag slot is left to buy.
-- The slots and the search words are the bank's on both clients (Modules/Bags.lua).

local ADDON, ns = ...

local BG = ns.GetModule("Bags")

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState): parts dressed once.
local vgDressed = ns.FrameState("vgForeverBank")

local FB = {}
ns.ForeverBank = FB

-- Dresses a part of the game's once (the game reuses its pooled frames, and never undoes the look).
local function once(part, dress, ...)
  if type(part) ~= "table" or vgDressed[part] then return end
  vgDressed[part] = true
  dress(part, ...)
end

-- Runs dress(part, ...) on each active frame of one of the bank's pools.
local function eachActive(pool, dress, ...)
  if type(pool) ~= "table" or type(pool.EnumerateActive) ~= "function" then return end
  for part in pool:EnumerateActive() do dress(part, ...) end
end

-- Dresses each active frame of one of the bank's pools, once.
local function dressPool(pool, dress, ...)
  eachActive(pool, once, dress, ...)
end

-- The bank's page tabs as the game made them last: side tabs in the theme, and out past the panel's padding again
-- (the game anchors them afresh each time, the first one on the window's right edge). Left to the game when the
-- tabs group is off.
function FB.DressPageTabs(bank)
  local GW = ns.GetModule("Windows")
  if not GW.GroupOn("tabs") then return end
  dressPool(bank.bankPageTabPool, GW.DressSideTab, bank)
  eachActive(bank.bankPageTabPool, GW.PadTabAgain, bank)
end

-- The bank's bag slots as the game made them last.
function FB.DressBagSlots(bank)
  dressPool(bank.itemButtonBagPool, BG.SkinItem)
end

-- The Bag Slots and Costs lines, the money and the Purchase button.
function FB.DressPurchase(bank, panel)
  local GW = ns.GetModule("Windows")
  once(bank.BagText, GW.SkinText, "label", "text")
  once(bank.BagCost, GW.SkinText, "label", "text")
  once(panel.MoneyDisplay, GW.SkinMoney)
  once(panel.PurchaseButton, GW.SkinButton)
end

-- Everything on the bank as it shows: the page tabs, the bag slots and the purchase line.
function FB.DressBank(bank, panel)
  FB.DressPageTabs(bank)
  FB.DressBagSlots(bank)
  FB.DressPurchase(bank, panel)
end

-- Runs fn(bank) after the game calls the bank's method again (the game rebuilds its pooled frames there).
local function after(bank, method, fn)
  if type(bank[method]) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(bank, method, ns.Guard("hook " .. method, fn))
  end
end

-- Watches the bank (BG.BANK_PARTS): the whole on each show, the tabs and slots each time the game makes them again.
function FB.Watch(bank, panel)
  bank:HookScript("OnShow", ns.Guard("show bank parts", function() FB.DressBank(bank, panel) end))
  after(bank, "RefreshPageTabs", FB.DressPageTabs)
  after(bank, "RefreshBagButtons", FB.DressBagSlots)
end

table.insert(BG.BANK_PARTS, FB.Watch)
