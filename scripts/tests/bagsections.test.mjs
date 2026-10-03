// bagsections: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, UI_ENV, borderOf, isTok, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY bags: the backpack (8 slots) holds a Hearthstone, 5 waters, 12
// linen, a sword, a gray item, a quest letter and an item the client hasn't
// loaded yet (90999); bag 1 (4 slots) is empty. Tooltips get the item post-call.
const ITEMS_ENV = `
  __wfgWorld.bagSizes = { [0] = 8, 4, 0, 0, 0 }
  local items = __wfgWorld.items
  items[90001] = { name = "TEST-ONLY Sword", quality = 2, classID = 2, subClassID = 7, sellPrice = 40 }
  items[90002] = { name = "TEST-ONLY Gray", quality = 0, classID = 15, sellPrice = 3 }
  items[90003] = { name = "TEST-ONLY Letter", quality = 1, classID = 12, quest = true }
  __wfgWorld.bags[0] = { { itemID = 6948 }, { itemID = 159, count = 5 }, { itemID = 2589, count = 12 },
    { itemID = 90001 }, { itemID = 90002 }, { itemID = 90003 }, { itemID = 90999 } }
  __post = {}
  TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) __post[kind] = fn end }
`;

// TEST-ONLY game combined bag, as Blizzard_UIPanels_Game ContainerFrame.lua
// builds it: one item button per bag slot (bags 4 to 0, slots last to first),
// a money row at the bottom, a 10-column grid laid out from the bottom right
// on show, UpdateItems filling the slots (quality border, stack count), and
// a slot's tooltip filled as the client does on hover. __openBag() opens it as the game does.
const BAG_ENV = ITEMS_ENV + `
  local f = CreateFrame("Frame", "ContainerFrameCombinedBags", UIParent)
  f:Hide() f:SetSize(430, 200) f:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -100, 100)
  f.MoneyFrame = CreateFrame("Frame", nil, f) f.MoneyFrame:SetHeight(20)
  f.MoneyFrame:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 8, 8) f.MoneyFrame:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -8, 8)
  -- A slot's tooltip, as the client fills it on hover.
  local function enter(self)
    local info = C_Container.GetContainerItemInfo(self:GetBagID(), self:GetID())
    GameTooltip:SetOwner(self, "ANCHOR_NONE") GameTooltip.__itemLink = info and info.hyperlink
    __post[Enum.TooltipDataType.Item](GameTooltip)
  end
  f.Items, __slots = {}, {}
  for bag = 4, 0, -1 do
    local size = __wfgWorld.bagSizes[bag]
    for i = 1, size do
      local b = CreateFrame("Button", nil, f) b:SetSize(37, 37) b:SetID(size - i + 1)
      b.GetBagID = function() return bag end
      b.IconBorder, b.icon = b:CreateTexture(nil, "OVERLAY"), b:CreateTexture(nil, "ARTWORK")
      b.ItemContextOverlay = b:CreateTexture(nil, "OVERLAY")
      b:SetScript("OnEnter", enter)
      f.Items[#f.Items + 1], __slots["b" .. bag .. "s" .. b:GetID()] = b, b
    end
  end
  -- The game's enumerator, size and grid.
  function f:EnumerateValidItems() return ipairs(self.Items) end
  function f:CalculateHeight() local rows = math.ceil(#self.Items / 10) return rows * 37 + (rows - 1) * 5 + 75 + 20 + 12 end
  function f:UpdateFrameSize() self:SetSize(430, self:CalculateHeight()) end
  function f:UpdateItemLayout()
    for i, b in ipairs(self.Items) do
      b:ClearAllPoints() b:SetPoint("BOTTOMRIGHT", self.MoneyFrame, "TOPRIGHT", -((i - 1) % 10) * 42, 4 + math.floor((i - 1) / 10) * 42)
    end
  end
  -- The game filling its slots: each slot's quality border and stack count.
  function f:UpdateItems()
    for _, b in ipairs(self.Items) do
      local info = C_Container.GetContainerItemInfo(b:GetBagID(), b:GetID())
      b.count = info and info.stackCount
      if info and info.quality then local r, g, bl = C_Item.GetItemQualityColor(info.quality) b.IconBorder:SetVertexColor(r, g, bl) else b.IconBorder:Hide() end
    end
  end
  f:SetScript("OnShow", function(self) self:UpdateFrameSize() self:UpdateItemLayout() end)
  -- Opening the bag (ContainerFrame_GenerateFrame): shown, sized and laid out again, then filled.
  function __openBag() f:Show() f:UpdateFrameSize() f:UpdateItemLayout() f:UpdateItems() end
`;

// Where a slot sits: [px from the bag window's left, px down from its top].
const spot = (addon, slot) => addon.eval(`local f, b = ContainerFrameCombinedBags, __slots.${slot}
  return { b:GetLeft() - f:GetLeft(), f:GetTop() - b:GetTop() }`);

// The bag window's height.
const height = (addon) => addon.eval("return ContainerFrameCombinedBags:GetHeight()");

// The section headers, in order.
const LABELS = ["Quest items", "Equipment", "Consumables", "Trade goods", "Other", "Junk", "Empty"];
// The section headers showing, in order.
const headers = (addon) => LABELS.filter((label) => addon.texts(label).length === 1);

// Counts the module's layouts (BG.Place calls) from now on; returns a reader that resets the count.
const countLayouts = (addon) => {
  addon.eval(`__places = 0 local BG = ns.GetModule("Bags") local place = BG.Place
    BG.Place = function(...) __places = __places + 1 return place(...) end`);
  return () => addon.eval("local n = __places __places = 0 return n");
};

it("the combined bag in sections: each kind of item under its header, packed side by side", () => {
  const addon = loggedIn(BAG_ENV);
  expect(addon.eval("return ns.Settings('Bags').sections"), "sections are on by default").toBe(true);
  addon.eval("__openBag()");
  expect(headers(addon), "every kind present gets its header").toEqual(LABELS);
  const first = ["b0s6", "b0s4", "b0s2", "b0s3"].map((s) => spot(addon, s));
  expect(first, "quest items, equipment, consumables and trade goods side by side on the first row, under their headers").toEqual([[7, 91], [98, 91], [189, 91], [280, 91]]);
  const second = ["b0s1", "b0s7", "b0s5", "b0s8", "b1s1", "b1s4"].map((s) => spot(addon, s));
  expect(second, "Other (the Hearthstone, the item not loaded yet), Junk and the empty slots on the next").toEqual([[7, 150], [49, 150], [98, 150], [189, 150], [231, 150], [357, 150]]);
  const quest = addon.texts("Quest items")[0];
  const frame = addon.frame("ContainerFrameCombinedBags").rect;
  expect([quest.rect.left - frame.left, frame.top - quest.rect.top, quest.rect.width], "a header sits over its slots, as wide as its section").toEqual([7, 75, 79]);
  expect(isTok(addon, quest.textColor, "accent"), "headers are in the accent").toBe(true);
  expect(height(addon), "the window grows by the headers and rows the sections add (the game's 186)").toBe(219);
  expect(addon.eval("for _, b in ipairs(ContainerFrameCombinedBags.Items) do if not b:IsShown() then return false end end return true"), "no slot is hidden").toBe(true);
  addon.slash("accent ff8000");
  expect(isTok(addon, addon.texts("Quest items")[0].textColor, "accent"), "a new accent repaints the headers").toBe(true);
});

it("bag sections follow what you carry; the same items move nothing", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  const layouts = countLayouts(addon);
  addon.eval("ContainerFrameCombinedBags:UpdateItems()");
  expect(layouts(), "the game filling the same slots again: nothing moves").toBe(0);
  addon.eval("local bags = __wfgWorld.bags bags[1][1], bags[0][2] = bags[0][2], nil ContainerFrameCombinedBags:UpdateItems()");
  expect([layouts(), spot(addon, "b1s1"), spot(addon, "b0s2")], "water moved to bag 1: its slot joins Consumables, the old one Empty").toEqual([1, [189, 91], [189, 150]]);
  addon.eval('local b = ns.GetModule("Bags").sort b:GetScript("OnClick")(b)');
  expect(addon.eval("return __wfgWorld.sorted"), "Sort still sorts your bags").toBe(true);
  addon.eval("ContainerFrameCombinedBags:Hide()");
  addon.eval("__wfgWorld.bags[0][2] = { itemID = 159 } ContainerFrameCombinedBags:UpdateItems()");
  expect(layouts(), "a closed bag waits for its next opening").toBe(0);
});

it("in combat the bag keeps its layout and catches up after; opened in combat it shows the plain grid until then", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  setCombat(addon, true);
  addon.eval("local bags = __wfgWorld.bags bags[1][2], bags[0][5] = bags[0][5], nil ContainerFrameCombinedBags:UpdateItems()");
  expect(spot(addon, "b1s2"), "a change in combat leaves the slots where they are").toEqual([273, 150]);
  setCombat(addon, false);
  expect([spot(addon, "b1s2"), spot(addon, "b0s5")], "combat over: the gray item's new slot is under Junk, its old one with the empty ones").toEqual([[98, 150], [189, 150]]);
  setCombat(addon, true);
  addon.eval("ContainerFrameCombinedBags:Hide() __openBag()");
  expect([headers(addon), spot(addon, "b0s1"), height(addon)], "opened in combat: the game's grid, no headers, the game's height").toEqual([[], [343, 75], 186]);
  setCombat(addon, false);
  expect([headers(addon).length, spot(addon, "b0s6"), height(addon)], "and the sections when combat ends").toEqual([7, [7, 91], 219]);
});

it("an item the client hasn't loaded yet waits under Other and moves when its info arrives", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  const layouts = countLayouts(addon);
  addon.fire("ITEM_DATA_LOAD_RESULT", 6948, true);
  expect(layouts(), "another item's info: nothing to do").toBe(0);
  addon.eval("__wfgWorld.items[90999] = { name = 'TEST-ONLY Helm', quality = 3, classID = 4, subClassID = 2 }");
  addon.fire("ITEM_DATA_LOAD_RESULT", 90999, true);
  expect([layouts(), spot(addon, "b0s7"), addon.eval("return ns.GetModule('Bags').pending[90999] == nil")], "it joins Equipment, beside the sword").toEqual([1, [140, 91], true]);
  addon.fire("ITEM_DATA_LOAD_RESULT", 90999, true);
  expect(layouts(), "the same item again: nothing to do").toBe(0);
});

it("quality borders, search dimming and item tooltips still work inside sections", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  expect(borderOf(addon, "__slots.b0s4"), "the sword's slot is bordered in its quality color").toEqual([0.12, 1, 0, 1]);
  expect(addon.eval("return { __slots.b0s4.ItemContextOverlay:GetAlpha(), __slots.b0s4.IconBorder:GetAlpha() }"), "the search dimming overlay is left alone, the game's border art faded").toEqual([1, 0]);
  addon.hover("__slots.b0s2");
  const lines = addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out");
  expect(lines, "the water's tooltip: what the stack sells for, and how many you have").toEqual(["Sells for", "You have 5"]);
});

it("a switch under Bars, map, chat gives back the plain combined bag at once, and the sections again", () => {
  const addon = loggedIn(BAG_ENV + CLICK_LUA);
  addon.eval("__openBag()");
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Combined bag in sections") and ForeverUIDB.profiles.Default.Bags.sections'), "the switch is on the page").toBe(false);
  expect([headers(addon), spot(addon, "b0s1"), height(addon)], "switched off: the game's grid and height, no headers").toEqual([[], [343, 75], 186]);
  addon.eval("ContainerFrameCombinedBags:UpdateItems() ContainerFrameCombinedBags:Hide() __openBag()");
  expect([headers(addon), spot(addon, "b0s1")], "and it stays plain as the bag fills and opens").toEqual([[], [343, 75]]);
  addon.eval('__click("Combined bag in sections")');
  expect([headers(addon).length, spot(addon, "b0s1"), height(addon)], "switched on: sections at once").toEqual([7, [7, 150], 219]);
  addon.eval('ContainerFrameCombinedBags:Hide() __click("Combined bag in sections") __click("Combined bag in sections")');
  expect(addon.eval("return ContainerFrameCombinedBags.fuiSections == nil"), "switched off and on while closed: laid out at the next opening").toBe(true);
});

it("a client without the bag window's layout calls keeps the plain combined bag", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA);
  addon.eval("ContainerFrameCombinedBags:Show()");
  addon.slash("");
  addon.eval('__click("Bars, map, chat") __click("Combined bag in sections")');
  expect([addon.eval("return ns.GetModule('Bags').sectionFrame == nil"), headers(addon)], "no sections, and the switch does nothing").toEqual([true, []]);
  const old = loggedIn(BAG_ENV + "C_Item.GetItemInfoInstant = nil");
  old.eval("__openBag()");
  expect([headers(old), spot(old, "b0s1")], "no instant item info: the game's grid").toEqual([[], [343, 75]]);
});
