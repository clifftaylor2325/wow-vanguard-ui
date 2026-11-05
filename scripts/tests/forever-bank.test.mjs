// forever-bank: the bank window's WoW Forever parts (Modules/ForeverBank.lua), on the TEST-ONLY WoW Forever client.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { loggedIn } from "./helpers.mjs";

// TEST-ONLY bank, as Camelot BankFrame.xml/.lua builds it: the page tabs and the bank bag slots in pools on the
// window (made again by RefreshPageTabs and RefreshBagButtons), and the Costs line, the money and the Purchase
// button for buying a bag slot.
const BANK_ENV = `
  local function tex(f, key) f[key] = f:CreateTexture() return f[key] end
  BankFrame = CreateFrame("Frame", "BankFrame", UIParent) BankFrame:Hide()
  BankPanel = CreateFrame("Frame", "BankPanel", BankFrame)
  BankItemSearchBox = CreateFrame("EditBox", "BankItemSearchBox", BankFrame)
  BankFrame.BagCost = BankFrame:CreateFontString()
  BankFrame.BagText = BankFrame:CreateFontString()
  BankPanel.MoneyDisplay = CreateFrame("Frame", nil, BankPanel)
  BankPanel.MoneyDisplay.GoldButton = CreateFrame("Button", nil, BankPanel.MoneyDisplay)
  BankPanel.MoneyDisplay.GoldButton.Text = BankPanel.MoneyDisplay.GoldButton:CreateFontString()
  BankPanel.PurchaseButton = CreateFrame("Button", nil, BankPanel)
  __pageTabs, __bagSlots = {}, {}
  local function pool(list) return { EnumerateActive = function() local t = {} for _, b in ipairs(list) do t[b] = true end return pairs(t) end } end
  BankFrame.bankPageTabPool, BankFrame.itemButtonBagPool = pool(__pageTabs), pool(__bagSlots)
  function BankFrame:RefreshPageTabs()
    local t = CreateFrame("Frame", nil, BankFrame) tex(t, "Background") tex(t, "Icon") tex(t, "SelectedTexture") __pageTabs[#__pageTabs + 1] = t
    for i, tab in ipairs(__pageTabs) do
      tab:ClearAllPoints()
      if i == 1 then tab:SetPoint("TOPLEFT", BankFrame, "TOPRIGHT", 0, -60) else tab:SetPoint("TOPLEFT", __pageTabs[i - 1], "BOTTOMLEFT", 0, -2) end
    end
  end
  function BankFrame:RefreshBagButtons()
    local b = CreateFrame("Button", nil, BankFrame) tex(b, "IconBorder") tex(b, "icon") __bagSlots[#__bagSlots + 1] = b
  end
  BankFrame:RefreshPageTabs() BankFrame:RefreshBagButtons()
`;

// Whether Vanguard dressed a part of the bank (its own record of the parts it dressed once).
const dressed = (addon, part) => addon.eval(`return ns.FrameState("vgForeverBank")[${part}] == true`);

it("forever bank: the page tabs, bag slots, Costs line, money and Purchase button are dressed as the bank opens and again when the game remakes them", () => {
  const addon = loggedIn(BANK_ENV);
  addon.eval("BankFrame:Show()");
  const parts = ["__pageTabs[1]", "__bagSlots[1]", "BankFrame.BagText", "BankFrame.BagCost", "BankPanel.MoneyDisplay", "BankPanel.PurchaseButton"];
  expect(parts.map((p) => dressed(addon, p)), "every part dressed on show").toEqual(parts.map(() => true));
  expect(addon.eval("return { __pageTabs[1].Background.__alpha, __pageTabs[1].Icon.__alpha ~= 0 }"), "a page tab: a side tab in the theme, its plate faded and its icon kept (greyed while another page shows)").toEqual([0, true]);
  // The first page tab's offset from the window's right edge, and how far the panel's padding reaches past it.
  const firstTab = () => addon.eval("local _, rel, _, x = __pageTabs[1]:GetPoint(1) return { rel == BankFrame, x, ns.GetModule('Windows').TabPad(BankFrame) }");
  const [onWindow, x, pad] = firstTab();
  expect([onWindow, pad > 0, x], "the first page tab sits out past the panel's padding").toEqual([true, true, pad]);
  addon.eval("BankFrame:RefreshPageTabs() BankFrame:RefreshBagButtons()");
  expect([dressed(addon, "__pageTabs[2]"), dressed(addon, "__bagSlots[2]")], "tabs and slots the game makes again are dressed after it").toEqual([true, true]);
  expect(firstTab()[1], "the game anchored the first tab afresh: out past the padding again").toBe(pad);
  addon.eval("BankFrame:Hide() BankFrame:Show()");
  expect(addon.eval("return #ns.errors"), "showing it again dresses nothing twice, and nothing errors").toBe(0);
});

it("forever bank: a bank without the parts, the bank switch off and a Retail client leave things alone", () => {
  const bare = loggedIn("BankFrame = CreateFrame('Frame', 'BankFrame', UIParent) BankFrame:Hide() BankPanel = CreateFrame('Frame', 'BankPanel', BankFrame) BankFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no pools, no purchase line: nothing to dress, no errors").toBe(0);
  const off = loggedIn(BANK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { bank = false } } }" });
  off.eval("BankFrame:Show()");
  expect(dressed(off, "BankPanel.PurchaseButton"), "bank switch off: nothing dressed").toBe(false);
  const tabsOff = loggedIn(BANK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  tabsOff.eval("BankFrame:Show()");
  expect([dressed(tabsOff, "__pageTabs[1]"), dressed(tabsOff, "BankPanel.PurchaseButton")], "game window tabs switched off: the page tabs stay the game's").toEqual([false, true]);
  const retail = loggedIn(BANK_ENV, { client: RETAIL_CLIENT });
  expect(retail.eval("return ns.ForeverBank == nil"), "Retail never loads the Forever parts").toBe(true);
});
