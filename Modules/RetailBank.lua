-- The bank window's Retail parts (WoW Retail only: the TOC keeps this file off WoW Forever), added to the bank's
-- skin (Modules/Bags.lua, BG.BANK_PARTS) with the Bags module's bank switch. The game's own bank (Mainline
-- BankFrame.lua) holds the character bank and the warband bank in one window; Vanguard dresses:
--   * the Bank and Warband tabs along its foot (its tab system), as the game windows' tabs are (GW.DressTabs,
--     under the tabs switch);
--   * each bank's bought tabs down its right side and the tab for buying one, as icon tiles (the game makes them
--     again whenever the bank or its tabs change, RefreshBankTabs);
--   * the warband bank's gold row (Withdraw, Deposit and the money in its box) and its deposit row (the deposit
--     button and the Include reagents check box).
-- The slots and the search words are the bank's on both clients: a warband tab's slots are the bank panel's too.

local ADDON, ns = ...

local BG = ns.GetModule("Bags")

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState): parts dressed once.
local vgDressed = ns.FrameState("vgRetailBank")

local RB = {}
ns.RetailBank = RB

-- The parts of a side tab whose art stays: its selected glow and the search overlay that dims a tab with no match.
RB.TAB_KEEP = { "SelectedTexture", "SearchOverlay" }

-- Dresses a part of the game's once (the game reuses its pooled tabs, and never undoes the look).
local function once(part, dress, ...)
  if type(part) ~= "table" or vgDressed[part] then return end
  vgDressed[part] = true
  dress(part, ...)
end

-- With search words in the bank's box, a side tab is dimmed when none of its slots matches them (the game's
-- own overlay follows its text search, which knows nothing of the words). Reads the game's fields, stores nothing.
function RB.MarkTab(tab)
  local tests = BG.BankTests()
  local id = tab.tabData and ns.PlainNumber(tab.tabData.ID)
  if tests and id and tab.SearchOverlay then tab.SearchOverlay:SetShown(not BG.ContainerMatches(tests, id)) end
end

-- Dresses one bought side tab as an icon tile, and has its search overlay follow the bank's search words.
function RB.DressTab(tab)
  ns.GetModule("Windows").DressIcon(tab, RB.TAB_KEEP)
  if type(tab.RefreshSearchOverlay) == "function" then hooksecurefunc(tab, "RefreshSearchOverlay", ns.Guard("hook bank tab search", RB.MarkTab)) end
end

-- The bank's side tabs as the game made them last: each bought tab, and the tab for buying one.
function RB.DressSideTabs(panel)
  local GW, pool = ns.GetModule("Windows"), panel.bankTabPool
  if type(pool) == "table" and type(pool.EnumerateActive) == "function" then
    for tab in pool:EnumerateActive() do once(tab, RB.DressTab) end
  end
  once(panel.PurchaseTab, GW.DressIcon, RB.TAB_KEEP)
end

-- The warband bank's gold row and deposit row in the theme: buttons, the check box and the money in a flat box.
function RB.DressRows(panel)
  local GW, money, deposit = ns.GetModule("Windows"), panel.MoneyFrame or {}, panel.AutoDepositFrame or {}
  once(money.WithdrawButton, GW.SkinButton)
  once(money.DepositButton, GW.SkinButton)
  once(money.MoneyDisplay, GW.SkinMoney)
  once(money.Border, GW.InsetPanel)
  once(deposit.DepositButton, GW.SkinButton)
  once(deposit.IncludeReagentsCheckbox, GW.SkinCheck)
end

-- Everything on the bank as it shows: the Bank and Warband tabs (when game window tabs are Vanguard's), the rows
-- and the side tabs.
function RB.DressBank(bank, panel)
  local GW = ns.GetModule("Windows")
  if GW.GroupOn("tabs") then once(bank, GW.DressTabs) end
  RB.DressRows(panel)
  RB.DressSideTabs(panel)
end

-- Watches the bank (BG.BANK_PARTS): the whole on each show, the side tabs each time the game makes them again.
function RB.Watch(bank, panel)
  bank:HookScript("OnShow", ns.Guard("show warband bank", function() RB.DressBank(bank, panel) end))
  if type(panel.RefreshBankTabs) == "function" then
    hooksecurefunc(panel, "RefreshBankTabs", ns.Guard("hook RefreshBankTabs", RB.DressSideTabs))
  end
end

table.insert(BG.BANK_PARTS, RB.Watch)
