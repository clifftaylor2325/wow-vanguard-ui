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
  BankPanel.MoneyDisplay = CreateFrame("Frame", nil, BankPanel)
  BankPanel.MoneyDisplay.GoldButton = CreateFrame("Button", nil, BankPanel.MoneyDisplay)
  BankPanel.MoneyDisplay.GoldButton.Text = BankPanel.MoneyDisplay.GoldButton:CreateFontString()
  BankPanel.PurchaseButton = CreateFrame("Button", nil, BankPanel)
  __pageTabs, __bagSlots = {}, {}
  local function pool(list) return { EnumerateActive = function() local t = {} for _, b in ipairs(list) do t[b] = true end return pairs(t) end } end
  BankFrame.bankPageTabPool, BankFrame.itemButtonBagPool = pool(__pageTabs), pool(__bagSlots)
  function BankFrame:RefreshPageTabs()
    local t = CreateFrame("Button", nil, BankFrame) tex(t, "Border") tex(t, "Icon") tex(t, "SelectedTexture") __pageTabs[#__pageTabs + 1] = t
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
  const parts = ["__pageTabs[1]", "__bagSlots[1]", "BankFrame.BagCost", "BankPanel.MoneyDisplay", "BankPanel.PurchaseButton"];
  expect(parts.map((p) => dressed(addon, p)), "every part dressed on show").toEqual(parts.map(() => true));
  expect(addon.eval("return { __pageTabs[1].Border.__alpha, __pageTabs[1].Icon.__alpha == nil, __pageTabs[1].SelectedTexture.__alpha == nil }"), "a page tab: its frame faded, its icon and selected glow kept").toEqual([0, true, true]);
  addon.eval("BankFrame:RefreshPageTabs() BankFrame:RefreshBagButtons()");
  expect([dressed(addon, "__pageTabs[2]"), dressed(addon, "__bagSlots[2]")], "tabs and slots the game makes again are dressed after it").toEqual([true, true]);
  addon.eval("BankFrame:Hide() BankFrame:Show()");
  expect(addon.eval("return #ns.errors"), "showing it again dresses nothing twice, and nothing errors").toBe(0);
});

it("forever bank: a bank without the parts, the bank switch off and a Retail client leave things alone", () => {
  const bare = loggedIn("BankFrame = CreateFrame('Frame', 'BankFrame', UIParent) BankFrame:Hide() BankPanel = CreateFrame('Frame', 'BankPanel', BankFrame) BankFrame:Show()");
  expect(bare.eval("return #ns.errors"), "no pools, no purchase line: nothing to dress, no errors").toBe(0);
  const off = loggedIn(BANK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { bank = false } } }" });
  off.eval("BankFrame:Show()");
  expect(dressed(off, "BankPanel.PurchaseButton"), "bank switch off: nothing dressed").toBe(false);
  const retail = loggedIn(BANK_ENV, { client: RETAIL_CLIENT });
  expect(retail.eval("return ns.ForeverBank == nil"), "Retail never loads the Forever parts").toBe(true);
});
