// retail-bank: the bank window's Retail parts (Modules/RetailBank.lua) and the private aura spots on raid tiles and
// the target frame (Modules/RetailAuras.lua), on the TEST-ONLY Retail client (RETAIL_CLIENT, with
// scripts/lib/wow-retail-bank.lua's stubs).

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { RAID_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY bank, as Mainline BankFrame.xml builds it on Retail: the Bank and Warband tabs in its tab system, the
// panel's pooled side tabs (two bought, made again on RefreshBankTabs) and the tab for buying one, the warband's
// gold row and deposit row, and two slots of a warband tab (container 13, Enum.BagIndex.AccountBankTab_1) holding
// the sword and the waters, which the search words reach as they do a character tab's.
const BANK_ENV = `
  __wfgWorld.bagSizes[13] = 2
  __wfgWorld.bags[13] = { { itemID = 90001 }, { itemID = 159, count = 5 } }
  __wfgWorld.items[90001] = { name = "TEST-ONLY Sword", quality = 2, classID = 2, itemLevel = 20 }
  local function tex(f, key) f[key] = f:CreateTexture() return f[key] end
  BankFrame = CreateFrame("Frame", "BankFrame", UIParent) BankFrame:Hide()
  BankFrame.TabSystem = CreateFrame("Frame", nil, BankFrame)
  BankFrame.TabSystem.tabs = {}
  for i = 1, 2 do local t = CreateFrame("Button", nil, BankFrame.TabSystem) tex(t, "Left") tex(t, "Middle") tex(t, "Right") BankFrame.TabSystem.tabs[i] = t end
  function BankFrame.TabSystem:GetTabButton(id) return self.tabs[id] end
  BankPanel = CreateFrame("Frame", "BankPanel", BankFrame)
  BankItemSearchBox = CreateFrame("EditBox", "BankItemSearchBox", BankFrame)
  local function sideTab() local t = CreateFrame("Button", nil, BankPanel) tex(t, "Border") tex(t, "Icon") tex(t, "SelectedTexture") tex(t, "SearchOverlay") t.RefreshSearchOverlay = function(self) self.SearchOverlay:SetShown(self.filtered == true) end return t end
  __sideTabs = { sideTab(), sideTab() }
  BankPanel.bankTabPool = { EnumerateActive = function() return pairs({ [__sideTabs[1]] = true, [__sideTabs[2]] = true }) end }
  BankPanel.PurchaseTab = sideTab()
  function BankPanel:RefreshBankTabs() __sideTabs[3] = __sideTabs[3] or sideTab() end
  BankPanel.MoneyFrame = CreateFrame("Frame", nil, BankPanel)
  BankPanel.MoneyFrame.WithdrawButton = CreateFrame("Button", nil, BankPanel.MoneyFrame)
  BankPanel.MoneyFrame.DepositButton = CreateFrame("Button", nil, BankPanel.MoneyFrame)
  BankPanel.MoneyFrame.Border = CreateFrame("Frame", nil, BankPanel.MoneyFrame)
  BankPanel.MoneyFrame.MoneyDisplay = CreateFrame("Frame", nil, BankPanel.MoneyFrame)
  BankPanel.AutoDepositFrame = CreateFrame("Frame", nil, BankPanel)
  BankPanel.AutoDepositFrame.DepositButton = CreateFrame("Button", nil, BankPanel.AutoDepositFrame)
  BankPanel.AutoDepositFrame.IncludeReagentsCheckbox = CreateFrame("CheckButton", nil, BankPanel.AutoDepositFrame)
  __bankSlots = {}
  local function slot(i)
    local b = CreateFrame("Button", nil, BankPanel)
    b.GetBankTabID, b.GetContainerSlotID = function() return 13 end, function() return i end
    b.SetMatchesSearch = function(self, yes) self.matches = yes end
    b.Refresh = function(self) self:SetMatchesSearch((BankItemSearchBox:GetText() or "") == "") end
    return b
  end
  function BankPanel:EnumerateValidItems() local t = {} for _, b in ipairs(__bankSlots) do t[b] = true end return pairs(t) end
  function BankPanel:GenerateItemSlotsForSelectedTab() for i = 1, 2 do __bankSlots[i] = __bankSlots[i] or slot(i) __bankSlots[i]:Refresh() end end
  function BankPanel:UpdateSearchResults() for b in self:EnumerateValidItems() do b:Refresh() end end
`;

// Whether Vanguard dressed a part of the bank (its own record of the parts it dressed once).
const dressed = (addon, part) => addon.eval(`return ns.FrameState("vgRetailBank")[${part}] == true`);

it("retail bank: the Bank and Warband tabs, the side tabs and the warband's rows are dressed as the bank opens", () => {
  const addon = loggedIn(BANK_ENV, { client: RETAIL_CLIENT });
  addon.eval("BankFrame:Show()");
  expect(addon.eval("local t = BankFrame.TabSystem.tabs return { t[1].Left.__alpha, t[2].Middle.__alpha }"), "the type tabs' game art is faded").toEqual([0, 0]);
  expect(addon.eval("local t = __sideTabs[1] return { t.Border.__alpha, t.Icon.__alpha == nil, t.SelectedTexture.__alpha == nil }"),
    "a side tab: its frame faded, its icon and selected glow kept").toEqual([0, true, true]);
  expect(addon.eval("return BankPanel.PurchaseTab.SelectedTexture.__alpha == nil"), "the buying tab's selected glow is kept too").toBe(true);
  const parts = ["BankPanel.PurchaseTab", "BankPanel.MoneyFrame.WithdrawButton", "BankPanel.MoneyFrame.DepositButton", "BankPanel.MoneyFrame.Border",
    "BankPanel.MoneyFrame.MoneyDisplay", "BankPanel.AutoDepositFrame.DepositButton", "BankPanel.AutoDepositFrame.IncludeReagentsCheckbox"];
  expect(parts.map((p) => dressed(addon, p)), "the buying tab, both rows' buttons, the money box and the check box").toEqual(parts.map(() => true));
  addon.eval("BankPanel:RefreshBankTabs() __sideTabs[2] = __sideTabs[3] BankPanel:RefreshBankTabs()");
  expect(dressed(addon, "__sideTabs[3]"), "a tab the game makes again is dressed after it").toBe(true);
  addon.eval("BankFrame:Hide() BankFrame:Show()");
  expect(addon.eval("return #ns.errors"), "showing it again dresses nothing twice, and nothing errors").toBe(0);
});

it("retail bank: with the game windows' tabs switched off, the Bank and Warband tabs stay the game's", () => {
  const addon = loggedIn(BANK_ENV, { client: RETAIL_CLIENT, savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  addon.eval("BankFrame:Show()");
  expect([addon.eval("return BankFrame.TabSystem.tabs[1].Left.__alpha == nil"), dressed(addon, "BankPanel.MoneyFrame.DepositButton")], "the tabs untouched, the rows still dressed").toEqual([true, true]);
});

it("retail bank: the bank switch off leaves the whole bank the game's", () => {
  const addon = loggedIn(BANK_ENV, { client: RETAIL_CLIENT, savedVariables: "VanguardDB.profiles = { Default = { Bags = { bank = false } } }" });
  addon.eval("BankFrame:Show()");
  expect(dressed(addon, "BankPanel.MoneyFrame.DepositButton"), "nothing dressed").toBe(false);
});

it("retail bank: the search words work in a warband tab as in a character tab", () => {
  const addon = loggedIn(BANK_ENV, { client: RETAIL_CLIENT });
  // The bank's search words are wired with the combined bag's (Bags.Enable); this client has no combined bag, so wire them as it does.
  addon.eval("ns.GetModule('Bags').WatchBankSearch(BankPanel)");
  addon.eval("BankFrame:Show() BankPanel:GenerateItemSlotsForSelectedTab() BankItemSearchBox:SetText('q:uncommon') BankPanel:UpdateSearchResults()");
  expect(Object.values(addon.eval("local out = {} for i, b in ipairs(__bankSlots) do out[i] = b.matches == true end return out")), "the sword alone is lit").toEqual([true, false]);
});

it("retail bank: with search words in the box a side tab is dimmed when none of its slots matches; plain text leaves the game's overlay", () => {
  const addon = loggedIn(BANK_ENV, { client: RETAIL_CLIENT });
  addon.eval(`__wfgWorld.bagSizes[14] = 1 __wfgWorld.bags[14] = { { itemID = 90002 } }
    __wfgWorld.items[90002] = { name = "TEST-ONLY Epic", quality = 4, classID = 2 }
    __sideTabs[1].tabData, __sideTabs[2].tabData = { ID = 13 }, { ID = 14 }
    BankFrame:Show()`);
  // Whether each side tab's overlay shows.
  const overlays = () => Object.values(addon.eval("return { __sideTabs[1].SearchOverlay:IsShown(), __sideTabs[2].SearchOverlay:IsShown() }"));
  addon.eval("BankItemSearchBox:SetText('q:epic') for _, t in ipairs(__sideTabs) do t:RefreshSearchOverlay() end");
  expect(overlays(), "the epic is only in the second tab: the first is dimmed").toEqual([true, false]);
  addon.eval("BankItemSearchBox:SetText('sword') for _, t in ipairs(__sideTabs) do t:RefreshSearchOverlay() end");
  expect(overlays(), "a plain word: the game's own answer (nothing filtered here)").toEqual([false, false]);
  addon.eval("BankItemSearchBox:SetText('q:epic') __sideTabs[1].tabData = nil __sideTabs[1]:RefreshSearchOverlay()");
  expect([overlays()[0], addon.eval("return #ns.errors")], "a tab without data keeps the game's answer, no errors").toEqual([false, 0]);
});

// A slot with a Background and an ItemSlotBackground, skinned; their alpha as [background, item slot background].
const slotArt = (client) => {
  const addon = loggedIn("", client ? { client } : {});
  return Object.values(addon.eval(`local b = CreateFrame("Button", nil, UIParent)
    b.Background, b.ItemSlotBackground = b:CreateTexture(), b:CreateTexture()
    ns.GetModule("Bags").SkinItem(b)
    return { b.Background:GetAlpha(), b.ItemSlotBackground:GetAlpha() }`));
};

it("retail bank: bag and bank slots lose the game's Background and ItemSlotBackground art; WoW Forever keeps it", () => {
  expect(slotArt(RETAIL_CLIENT), "Retail: both faded").toEqual([0, 0]);
  expect(slotArt(), "Forever: both kept").toEqual([1, 1]);
});

// The private aura spots handed to the game, as [unit, parent's name or the target spot's owner, size] by id.
const spots = (addon) => Object.values(addon.eval(`local out = {}
  for id, a in pairs(__wfgWorld.privateAnchors) do out[#out + 1] = { a.unitToken, a.auraIndex, a.iconInfo.iconWidth, a.parent:GetParent():GetName() or "?" } end
  table.sort(out, function(x, y) return x[4] .. x[1] < y[4] .. y[1] end)
  return out`)).map((s) => Object.values(s));

it("retail auras: each raid tile hands the game one private aura spot, moved to its new unit, given back when emptied", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { client: RETAIL_CLIENT });
  addon.eval(`__spawn(1, "raid1") __spawn(2, "raid3")`);
  const size = addon.eval("return ns.GetModule('RaidFrames').TileZones().icon + ns.PrivateAuras.GROW");
  expect(spots(addon).filter((s) => s[3].startsWith("Vanguard_Raid")), "one spot per tile, for its unit's first private aura").toEqual([
    ["raid1", 1, size, "Vanguard_RaidUnitButton1"], ["raid3", 1, size, "Vanguard_RaidUnitButton2"]]);
  expect(addon.eval(`local b = Vanguard_RaidUnitButton1 local h = b.privateAura
    return { h.__points.CENTER.rel == b.health, h:GetFrameLevel() > b:GetFrameLevel(), h:GetFrameLevel() < b.overlay:GetFrameLevel() }`),
    "in the middle of the health bar, above the tile, under the ready check, resurrection and summon marks").toEqual([true, true, true]);
  setCombat(addon, true);
  addon.eval('Vanguard_RaidUnitButton2:SetAttribute("unit", "raid2")');
  expect(spots(addon).filter((s) => s[3] === "Vanguard_RaidUnitButton2").map((s) => s[0]), "a roster change in a fight moves the spot to the new unit").toEqual(["raid2"]);
  setCombat(addon, false);
  addon.eval("ns.GetModule('RaidFrames').Emptied(Vanguard_RaidUnitButton2)");
  expect(spots(addon).filter((s) => s[3] === "Vanguard_RaidUnitButton2"), "an emptied tile's spot is given back").toEqual([]);
});

it("retail auras: the raid tiles keep their private aura spot with Raid debuffs and HoTs switched off (H9-4-1)", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { client: RETAIL_CLIENT, savedVariables: "VanguardDB.profiles = { Default = { modules = { RaidAuras = false } } }" });
  addon.eval(`__spawn(1, "raid1")`);
  expect([addon.eval("return ns.ModuleEnabled('RaidAuras')"), addon.eval("return Vanguard_RaidUnitButton1.debuffRow == nil")], "the aura rows are off").toEqual([false, true]);
  expect(spots(addon).filter((s) => s[3].startsWith("Vanguard_Raid")).map((s) => s[0]), "the tile still has its spot, for its unit").toEqual(["raid1"]);
});

it("retail auras: the target frame has a spot right of it, over the target of target (H9-1-3), handed again on each new target", () => {
  const addon = loggedIn(UNITS_ENV, { client: RETAIL_CLIENT });
  // The target spot's unit, whether it sits by the target frame, and its anchor id.
  const target = () => addon.eval("local h = ns.PrivateAuras.target return { h.unit, h.__points.BOTTOMLEFT.rel == Vanguard_target, h.anchorID }");
  const first = target();
  expect([first[0], first[1]], "the target's spot, beside its frame").toEqual(["target", true]);
  const [left, bottom, targetRight, totLeft, totTop] = Object.values(addon.eval(
    "local h, t = ns.PrivateAuras.target, Vanguard_targettarget return { h:GetLeft(), h:GetBottom(), Vanguard_target:GetRight(), t:GetLeft(), t:GetTop() }"));
  expect([left > targetRight, left < totLeft + 10, bottom > totTop], "right of the target, standing on the target of target, not over it").toEqual([true, true, true]);
  addon.fire("PLAYER_TARGET_CHANGED");
  const second = target();
  expect([second[2] !== first[2], addon.eval(`return __wfgWorld.privateAnchors[${first[2]}] == nil`)], "a new spot for the new target, the old one given back").toEqual([true, true]);
});

it("retail auras: your own six private aura spots stand left of your buffs, outside the block Calm fades (H18-7-1)", () => {
  const addon = loggedIn(UNITS_ENV, { client: RETAIL_CLIENT });
  const own = addon.eval(`local out = {}
    for _, a in pairs(__wfgWorld.privateAnchors) do if a.unitToken == "player" then out[#out + 1] = { a.auraIndex, a.iconInfo.iconWidth, a.parent:GetParent() } end end
    table.sort(out, function(x, y) return x[1] < y[1] end)
    local holder = ns.GetModule("PlayerAuras").holder
    local row = out[1] and out[1][3]
    return { #out, out[1] and out[1][1], out[6] and out[6][1], out[1] and out[1][2], row ~= nil and row:GetParent() == UIParent, row ~= nil and row.__points.RIGHT.rel == holder }`);
  const size = addon.eval("return ns.GetModule('PlayerAuras').settings.size + ns.PrivateAuras.GROW");
  expect(own, "six spots for the player's aura 1 to 6, a debuff and a bit across, in a row hung on the block's holder but not under it").toEqual([6, 1, 6, size, true, true]);
  expect(addon.eval("local n = 0 for _, a in pairs(__wfgWorld.privateAnchors) do if a.unitToken == 'target' then n = n + 1 end end return n"), "the target's spot still asks for the first").toBe(1);
  const off = loggedIn(UNITS_ENV, { client: RETAIL_CLIENT, savedVariables: "VanguardDB.profiles = { Default = { modules = { PlayerAuras = false } } }" });
  expect(off.eval("local n = 0 for _, a in pairs(__wfgWorld.privateAnchors) do if a.unitToken == 'player' then n = n + 1 end end return n"), "with the buffs block off the game's debuff frame is not parked and nothing is added").toBe(0);
});
