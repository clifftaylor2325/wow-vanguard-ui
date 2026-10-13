// bagsections: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

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

// TEST-ONLY game combined bag, as Blizzard_UIPanels_Game Mainline/ContainerFrame.lua
// (which Forever loads) builds it: one item button per bag slot (bags 4 to 0,
// slots last to first); GetColumns() columns (10, or __cols) of 37 px slots 5 px
// apart, 15 px of padding in its width and 75 px (title and search row) in its
// height; the money line 8 px inside the sides and bottom (on the currency
// tracker __token when that shows); the grid laid out from the bottom right on
// the money line; the search row (the search box at 62 px, 330 wide, the game's
// sort button at the top right); UpdateItems filling the slots (quality border,
// stack count); and a slot's tooltip filled as the client does on hover.
// __openBag() opens it as ContainerFrame_GenerateFrame does, and the game then
// places it (UpdateContainerFrameAnchors): 10 px from the screen's right, 85 px
// up, scaled down (to 0.75 at the least) until it fits under the screen's top.
const BAG_FRAME = `
  local f = CreateFrame("Frame", "ContainerFrameCombinedBags", UIParent)
  f:Hide() f:SetSize(430, 200) f:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -100, 100)
  f.MoneyFrame = CreateFrame("Frame", nil, f) f.MoneyFrame:SetHeight(20)
  f.MoneyFrame:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", 8, 8) f.MoneyFrame:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -8, 8)
  BagItemSearchBox = CreateFrame("EditBox", "BagItemSearchBox", UIParent) BagItemSearchBox:SetSize(96, 18)
  BagItemAutoSortButton = CreateFrame("Button", "BagItemAutoSortButton", UIParent) BagItemAutoSortButton:SetSize(28, 26)
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
  -- The game's enumerator, columns, padding, size and grid.
  function f:EnumerateValidItems() return ipairs(self.Items) end
  local function columns() return __cols or 10 end
  function f:GetColumns() return columns() end
  function f:GetPaddingWidth() return 15 end
  function f:GetPaddingHeight() return 75 end
  function f:CalculateWidth() local c = columns() return c * 37 + (c - 1) * 5 + self:GetPaddingWidth() end
  function f:CalculateHeight()
    local rows, token = math.ceil(#self.Items / columns()), __token and __token:IsShown() and __token:GetHeight() or 0
    return rows * 37 + (rows - 1) * 5 + self:GetPaddingHeight() + token + self.MoneyFrame:GetHeight() + 12
  end
  function f:UpdateFrameSize() self:SetSize(self:CalculateWidth(), self:CalculateHeight()) end
  function f:UpdateItemLayout()
    local c = columns()
    for i, b in ipairs(self.Items) do
      b:ClearAllPoints() b:SetPoint("BOTTOMRIGHT", self.MoneyFrame, "TOPRIGHT", -((i - 1) % c) * 42, 4 + math.floor((i - 1) / c) * 42)
    end
  end
  -- The money line, 8 px in, on the currency tracker when it shows.
  function f:UpdateCurrencyFrames()
    local m, t = self.MoneyFrame, __token and __token:IsShown() and __token
    if t then t:ClearAllPoints() t:SetPoint("BOTTOMLEFT", self, "BOTTOMLEFT", 8, 8) t:SetPoint("BOTTOMRIGHT", self, "BOTTOMRIGHT", -8, 8) end
    m:ClearAllPoints()
    if t then m:SetPoint("BOTTOMRIGHT", t, "TOPRIGHT", 0, 3) m:SetPoint("BOTTOMLEFT", t, "TOPLEFT", 0, 3) return end
    m:SetPoint("BOTTOMLEFT", self, "BOTTOMLEFT", 8, 8) m:SetPoint("BOTTOMRIGHT", self, "BOTTOMRIGHT", -8, 8)
  end
  -- The search row (UpdateSearchBox, from Update).
  function f:UpdateSearchBox()
    BagItemSearchBox:SetParent(self) BagItemSearchBox:ClearAllPoints() BagItemSearchBox:SetPoint("TOPLEFT", self, "TOPLEFT", 62, -37) BagItemSearchBox:SetWidth(330) BagItemSearchBox:Show()
    BagItemAutoSortButton:SetParent(self) BagItemAutoSortButton:SetPoint("TOPRIGHT", self, "TOPRIGHT", -9, -34) BagItemAutoSortButton:Show()
  end
  function f:Update() self:UpdateSearchBox() end
  -- The game filling its slots: each slot's quality border and stack count.
  function f:UpdateItems()
    for _, b in ipairs(self.Items) do
      local info = C_Container.GetContainerItemInfo(b:GetBagID(), b:GetID())
      b.count = info and info.stackCount
      if info and info.quality then local r, g, bl = C_Item.GetItemQualityColor(info.quality) b.IconBorder:SetVertexColor(r, g, bl) else b.IconBorder:Hide() end
    end
  end
  -- The game placing its bag windows (UpdateContainerFrameAnchors, GetContainerScale).
  function __anchorBags()
    local s, free = 1, UIParent:GetHeight() - 85
    while s > 0.75 and free / s < f:GetHeight() do s = s - 0.01 end
    s = math.max(s, 0.75) f:SetScale(s) f:ClearAllPoints() f:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -10 / s, 85 / s)
  end
  f:SetScript("OnShow", function(self) self:UpdateFrameSize() self:UpdateItemLayout() __anchorBags() self:UpdateCurrencyFrames() end)
  -- Opening the bag (ContainerFrame_GenerateFrame): shown, its money line, size and grid set again, its search row, placed, then filled.
  function __openBag() f:Show() f:UpdateCurrencyFrames() f:UpdateFrameSize() f:UpdateItemLayout() f:Update() __anchorBags() f:UpdateItems() end
`;
const BAG_ENV = ITEMS_ENV + BAG_FRAME;

// TEST-ONLY items of each section, by section key.
const KIND_ITEM = { quest: 90003, equipment: 90001, consumables: 159, trade: 2589, other: 6948, junk: 90002 };
// TEST-ONLY bags 0 to 4 of the given sizes, filled in order with so many items of each kind ({ trade: 20, ... }); the rest empty.
const fill = (sizes, counts) => {
  const ids = Object.entries(counts).flatMap(([kind, n]) => Array(n).fill(KIND_ITEM[kind]));
  return `__wfgWorld.bagSizes = { [0] = ${sizes.join(", ")} }
    local ids, i = { ${ids.join(", ")} }, 0
    for bag = 0, 4 do __wfgWorld.bags[bag] = {} for slot = 1, __wfgWorld.bagSizes[bag] do i = i + 1 __wfgWorld.bags[bag][slot] = ids[i] and { itemID = ids[i] } end end`;
};
// A bag of these sizes and contents, logged in and opened.
const openFilled = (sizes, counts, extra = "") => {
  const addon = loggedIn([ITEMS_ENV, fill(sizes, counts), extra, BAG_FRAME].join("\n"));
  addon.eval("__openBag()");
  return addon;
};

// The padding Vanguard keeps inside the bag window.
const PAD = 12;
// How far inside the bag window each shown slot, section header, the search
// box, Sort and the money line lie, at the least: { left, right, top, bottom } in px.
const insets = (addon) => addon.eval(`local f, BG = ContainerFrameCombinedBags, ns.GetModule("Bags")
  local list = { BagItemSearchBox, BG.sort, f.MoneyFrame }
  for _, b in ipairs(f.Items) do if b:IsShown() then list[#list + 1] = b end end
  for _, fs in pairs(BG.headers) do if fs:IsShown() then list[#list + 1] = fs end end
  local m = { left = 1e9, right = 1e9, top = 1e9, bottom = 1e9 }
  for _, w in ipairs(list) do
    m.left, m.right = math.min(m.left, w:GetLeft() - f:GetLeft()), math.min(m.right, f:GetRight() - w:GetRight())
    m.top, m.bottom = math.min(m.top, f:GetTop() - w:GetTop()), math.min(m.bottom, w:GetBottom() - f:GetBottom())
  end
  return m`);
// The gaps around each shown section header: [above it (from the slots of the
// section before it, or none on the first row), under it (to its own slots)], by label.
const headerGaps = (addon) => addon.eval(`local f, out = ContainerFrameCombinedBags, {}
  local function gaps(fs, above, under)
    for _, b in ipairs(f.Items) do
      local overlaps = b:GetLeft() < fs:GetRight() and b:GetRight() > fs:GetLeft()
      if overlaps and b:GetBottom() >= fs:GetTop() then above = math.min(above or 1e9, b:GetBottom() - fs:GetTop()) end
      if overlaps and b:GetTop() <= fs:GetBottom() then under = math.min(under, fs:GetBottom() - b:GetTop()) end
    end
    return { above, under }
  end
  for _, fs in pairs(ns.GetModule("Bags").headers) do if fs:IsShown() then out[fs:GetText()] = gaps(fs, false, 1e9) end end
  return out`);

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
  expect(first, "quest items, equipment, consumables and trade goods side by side on the first row, under their headers").toEqual([[12, 93], [103, 93], [194, 93], [285, 93]]);
  const second = ["b0s1", "b0s7", "b0s5", "b0s8", "b1s1", "b1s4"].map((s) => spot(addon, s));
  expect(second, "Other (the Hearthstone, the item not loaded yet), Junk and the empty slots on the next").toEqual([[12, 160], [54, 160], [103, 160], [194, 160], [236, 160], [362, 160]]);
  const quest = addon.texts("Quest items")[0];
  const frame = addon.frame("ContainerFrameCombinedBags").rect;
  expect([quest.rect.left - frame.left, frame.top - quest.rect.top, quest.rect.width], "a header sits over its slots, as wide as its section").toEqual([12, 75, 79]);
  expect(isTok(addon, quest.textColor, "accentText"), "headers are in the accent's text colour").toBe(true);
  expect(addon.eval("local f = ContainerFrameCombinedBags return { f:GetWidth(), f:GetHeight() }"), "the window grows by the headers and rows the sections add, and by the padding (the game's 430 x 186)").toEqual([439, 233]);
  expect(addon.eval("for _, b in ipairs(ContainerFrameCombinedBags.Items) do if not b:IsShown() then return false end end return true"), "no slot is hidden").toBe(true);
  addon.slash("accent ff8000");
  expect(isTok(addon, addon.texts("Quest items")[0].textColor, "accentText"), "a new accent repaints the headers").toBe(true);
});

it("bag sections follow what you carry; the same items move nothing", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  const layouts = countLayouts(addon);
  addon.eval("ContainerFrameCombinedBags:UpdateItems()");
  expect(layouts(), "the game filling the same slots again: nothing moves").toBe(0);
  addon.eval("local bags = __wfgWorld.bags bags[1][1], bags[0][2] = bags[0][2], nil ContainerFrameCombinedBags:UpdateItems()");
  expect([layouts(), spot(addon, "b1s1"), spot(addon, "b0s2")], "water moved to bag 1: its slot joins Consumables, the old one Empty").toEqual([1, [194, 93], [194, 160]]);
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
  expect(spot(addon, "b1s2"), "a change in combat leaves the slots where they are").toEqual([278, 160]);
  setCombat(addon, false);
  expect([spot(addon, "b1s2"), spot(addon, "b0s5")], "combat over: the gray item's new slot is under Junk, its old one with the empty ones").toEqual([[103, 160], [194, 160]]);
  setCombat(addon, true);
  addon.eval("ContainerFrameCombinedBags:Hide() __openBag()");
  expect([headers(addon), spot(addon, "b0s1"), height(addon)], "opened in combat: the game's grid, no headers, the game's height").toEqual([[], [343, 75], 186]);
  expect(addon.eval("local f = ContainerFrameCombinedBags return { f:GetWidth(), f.MoneyFrame:GetLeft() - f:GetLeft(), f:GetRight() - ns.GetModule('Bags').sort:GetRight() }"), "the game's width and money line; Sort still inside the right edge").toEqual([430, 8, 12]);
  setCombat(addon, false);
  expect([headers(addon).length, spot(addon, "b0s6"), height(addon)], "and the sections when combat ends").toEqual([7, [12, 93], 233]);
});

it("an item the client hasn't loaded yet waits under Other and moves when its info arrives", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  const layouts = countLayouts(addon);
  addon.fire("ITEM_DATA_LOAD_RESULT", 6948, true);
  expect(layouts(), "another item's info: nothing to do").toBe(0);
  addon.eval("__wfgWorld.items[90999] = { name = 'TEST-ONLY Helm', quality = 3, classID = 4, subClassID = 2 }");
  addon.fire("ITEM_DATA_LOAD_RESULT", 90999, true);
  expect([layouts(), spot(addon, "b0s7"), addon.eval("return ns.GetModule('Bags').pending[90999] == nil")], "it joins Equipment, beside the sword").toEqual([1, [145, 93], true]);
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

it("a switch under Bars and bags gives back the plain combined bag at once, and the sections again", () => {
  const addon = loggedIn(BAG_ENV + CLICK_LUA);
  addon.eval("__openBag()");
  addon.slash("");
  addon.eval('__click("Bars and bags")');
  expect(addon.eval('return __click("Combined bag in sections") and VanguardDB.profiles.Default.Bags.sections'), "the switch is on the page").toBe(false);
  expect([headers(addon), spot(addon, "b0s1"), height(addon)], "switched off: the game's grid and height, no headers").toEqual([[], [343, 75], 186]);
  addon.eval("ContainerFrameCombinedBags:UpdateItems() ContainerFrameCombinedBags:Hide() __openBag()");
  expect([headers(addon), spot(addon, "b0s1")], "and it stays plain as the bag fills and opens").toEqual([[], [343, 75]]);
  addon.eval('__click("Combined bag in sections")');
  expect([headers(addon).length, spot(addon, "b0s1"), height(addon)], "switched on: sections at once").toEqual([7, [12, 160], 233]);
  addon.eval('ContainerFrameCombinedBags:Hide() __click("Combined bag in sections") __click("Combined bag in sections")');
  expect(addon.eval("return ns.FrameState('vgSections')[ContainerFrameCombinedBags] == nil"), "switched off and on while closed: laid out at the next opening").toBe(true);
});

it("a client without the bag window's layout calls keeps the plain combined bag", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA);
  addon.eval("ContainerFrameCombinedBags:Show()");
  addon.slash("");
  addon.eval('__click("Bars and bags") __click("Combined bag in sections")');
  expect([addon.eval("return ns.GetModule('Bags').sectionFrame == nil"), headers(addon)], "no sections, and the switch does nothing").toEqual([true, []]);
  const old = loggedIn(BAG_ENV + "C_Item.GetItemInfoInstant = nil");
  old.eval("__openBag()");
  expect([headers(old), spot(old, "b0s1")], "no instant item info: the game's grid").toEqual([[], [343, 75]]);
  const noColumns = loggedIn(BAG_ENV + "ContainerFrameCombinedBags.GetColumns = nil");
  noColumns.eval("__openBag()");
  expect([headers(noColumns), spot(noColumns, "b0s1")], "a bag window that can't say its columns: the game's grid").toEqual([[], [343, 75]]);
});

// TEST-ONLY bag contents: the owner's bag (backpack and four 10-slot bags,
// trade goods over two rows, Other and Junk side by side) and a full bag (four
// 18-slot bags, every slot taken, three sections over three rows each).
const OWNER_BAG = [[16, 10, 10, 10, 10], { quest: 2, equipment: 8, consumables: 8, trade: 20, other: 1, junk: 5 }];
const FULL_BAG = [[16, 18, 18, 18, 18], { quest: 4, equipment: 22, consumables: 21, trade: 26, other: 6, junk: 9 }];

// How far inside the bag window's right edge the slots end, at the least.
const slotsRight = (addon) => addon.eval(`local f, m = ContainerFrameCombinedBags, 1e9
  for _, b in ipairs(f.Items) do m = math.min(m, f:GetRight() - b:GetRight()) end return m`);

it("the bag's slots, headers, search row and money line sit the padding inside the window, in bags of every size", () => {
  const inside = { left: PAD, right: PAD, top: 36, bottom: PAD };
  const small = loggedIn(BAG_ENV);
  small.eval("__openBag()");
  expect(insets(small), "a small bag: slots and money line 12 px in, Sort 12 px in from the right, the search row under the title").toEqual(inside);
  for (const [sizes, counts] of [OWNER_BAG, FULL_BAG]) {
    const addon = openFilled(sizes, counts);
    expect([insets(addon), slotsRight(addon), addon.eval("return ContainerFrameCombinedBags:GetWidth()")], `${sizes.join("+")} slots: a full row of the game's 10 columns ends 12 px in; the window is the game's 415 px grid and the padding`).toEqual([inside, PAD, 439]);
  }
  const wide = openFilled(...OWNER_BAG, "__cols = 12");
  expect([insets(wide), slotsRight(wide), wide.eval("return ContainerFrameCombinedBags:GetWidth()")], "a client with 12 columns: 12 slots a row, the window as wide as its grid and the padding").toEqual([inside, PAD, 12 * 37 + 11 * 5 + 2 * PAD]);
  expect(wide.eval("return BagItemSearchBox:GetWidth()"), "the search box starts the padding in and narrows so Sort fits beside it").toBe(523 - PAD - 52 - 6 - PAD);
});

it("a clear gap above each section header, a small one under it; sections side by side keep theirs", () => {
  const addon = openFilled(...OWNER_BAG);
  expect(headerGaps(addon), "12 px from the slots above to a header, 4 px from a header to its own slots").toEqual({
    "Quest items": [false, 4], Equipment: [12, 4], Consumables: [12, 4], "Trade goods": [12, 4], Other: [12, 4], Junk: [12, 4], Empty: [12, 4],
  });
  const side = addon.eval(`local h = ns.GetModule("Bags").headers return { h.junk:GetLeft() - h.other:GetRight(), h.junk:GetTop() - h.other:GetTop() }`);
  expect(side, "Junk 12 px right of Other, on the same line").toEqual([12, 0]);
});

it("the window grows to fit; on a 768 px screen at UI scale 1 the game keeps even a full bag on screen", () => {
  const screen = "__wfgStub.setScreen(1365, 768)";
  // The window's height, the game's scale for it, and whether all of it is on the screen.
  const fitted = (addon) => addon.eval("local f = ContainerFrameCombinedBags local s = f:GetScale() return { f:GetHeight(), math.floor(s * 100 + 0.5) / 100, f:GetTop() * s <= 768, f:GetBottom() * s >= 0 }");
  expect(fitted(openFilled(...OWNER_BAG, screen)), "the owner's bag: taller by the gaps and padding, still at full size").toEqual([585, 1, true, true]);
  expect(fitted(openFilled(...FULL_BAG, screen)), "a full bag: taller than the 683 px above the game's bag offset, so the game draws it a little smaller, all of it on screen").toEqual([753, 0.9, true, true]);
});

it("the money line keeps the padding when the game puts it back, and sits on the currency tracker when that shows", () => {
  const addon = loggedIn(BAG_ENV + "__token = CreateFrame('Frame', nil, ContainerFrameCombinedBags) __token:SetHeight(17)");
  addon.eval("__openBag()");
  // The tracker's left, right and bottom insets, the money line's height over it and left inset, and the slots' height over the money line.
  const rows = () => addon.eval(`local f = ContainerFrameCombinedBags local m = f.MoneyFrame
    return { __token:GetLeft() - f:GetLeft(), f:GetRight() - __token:GetRight(), __token:GetBottom() - f:GetBottom(), m:GetBottom() - __token:GetTop(), m:GetLeft() - f:GetLeft(), __slots.b0s1:GetBottom() - m:GetTop() }`);
  expect(rows(), "the tracker 12 px in, the money line 3 px over it as the game puts it, the slots 4 px over that").toEqual([PAD, PAD, PAD, 3, PAD, 4]);
  addon.eval("ContainerFrameCombinedBags:UpdateCurrencyFrames()");
  expect(rows(), "the game anchoring its money line again: the padding again").toEqual([PAD, PAD, PAD, 3, PAD, 4]);
});

it("with sections off the game's plain grid is as it was, and Sort fits beside the search box there too", () => {
  const addon = loggedIn(BAG_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { sections = false } } }" });
  addon.eval("__openBag()");
  const money = addon.eval("local f = ContainerFrameCombinedBags return { f.MoneyFrame:GetLeft() - f:GetLeft(), f:GetWidth(), f:GetHeight() }");
  expect([headers(addon), spot(addon, "b0s1"), money], "the game's grid, money line, width and height").toEqual([[], [343, 75], [8, 430, 186]]);
  const sort = addon.eval(`local f, s = ContainerFrameCombinedBags, ns.GetModule("Bags").sort return { f:GetRight() - s:GetRight(), BagItemSearchBox:GetWidth() }`);
  expect(sort, "Sort ends 12 px inside the right edge; the search box gives it room").toEqual([PAD, 430 - PAD - 52 - 6 - PAD]);
});

// TEST-ONLY gamepad bag bar, as Blizzard_MainMenuBarBagButtons builds it on Forever (Camelot
// MainMenuBarBagButtons.xml, Shared GamepadBagBarMixin:OnLoad): parented to the combined bag, its backpack
// button (37 x 37) left showing without a gamepad. In game it shows in the window's top-right corner over
// the search row (Cliff's screenshot); the spot here (5 px in, 19 px down) stands in for that.
const BACKPACK_ENV = `
  GamepadBagBar = CreateFrame("Frame", "GamepadBagBar", ContainerFrameCombinedBags) GamepadBagBar:SetSize(215, 50)
  GamepadBagBar:SetPoint("TOPRIGHT", ContainerFrameCombinedBags, "TOPRIGHT", -5, -19)
  GamepadBagBar.BackpackButton = CreateFrame("Button", "GamepadBackpackButton", GamepadBagBar)
  GamepadBagBar.BackpackButton:SetSize(37, 37) GamepadBagBar.BackpackButton:SetPoint("RIGHT", GamepadBagBar, "RIGHT")
`;

// The search row from left to right: the search box's left inset, the gap to Sort, Sort's width, the gap
// from Sort to the backpack button, and Sort's inset from the window's right edge (px).
const searchRow = (addon) => addon.eval(`local f, s, b = ContainerFrameCombinedBags, ns.GetModule("Bags").sort, GamepadBackpackButton
  return { BagItemSearchBox:GetLeft() - f:GetLeft(), s:GetLeft() - BagItemSearchBox:GetRight(), s:GetWidth(), b:GetLeft() - s:GetRight(), f:GetRight() - s:GetRight() }`);

// TEST-ONLY gamepad interface switched on (InputUtil, as the client has it).
const GAMEPAD_ENV = "InputUtil = { IsGamepadUIEnabled = function() return true end }";

it("without a gamepad the game's backpack button in the bag's top-right corner is hidden, so nothing covers Sort", () => {
  const addon = loggedIn(BAG_ENV + BACKPACK_ENV);
  addon.eval("__openBag()");
  expect([addon.eval("return GamepadBackpackButton:IsShown()"), searchRow(addon).slice(-1)[0]], "hidden at login; Sort ends 12 px inside the right edge").toEqual([false, PAD]);
  addon.eval("GamepadBackpackButton:Show() ContainerFrameCombinedBags:Update()");
  expect([addon.eval("return GamepadBackpackButton:IsShown()"), searchRow(addon).slice(-1)[0]], "the game showing it again: hidden again").toEqual([false, PAD]);
  const other = loggedIn(BAG_ENV + BACKPACK_ENV.replace('"GamepadBagBar", ContainerFrameCombinedBags', '"GamepadBagBar", UIParent'));
  other.eval("__openBag()");
  expect(other.eval("return GamepadBackpackButton:IsShown()"), "a bar on another frame: hidden as well (no gamepad)").toBe(false);
});

it("with a gamepad the backpack button stays the game's, and Sort sits beside it where the game places it in the window", () => {
  const addon = loggedIn(GAMEPAD_ENV + BAG_ENV + BACKPACK_ENV);
  addon.eval("__openBag()");
  expect([addon.eval("return GamepadBackpackButton:IsShown()"), searchRow(addon)], "shown; search box 12 px in, Sort 6 px right of it at its full 52 px, the button 6 px right of Sort").toEqual([true, [PAD, 6, 52, 6, 48]]);
  addon.eval("GamepadBackpackButton:Hide() GamepadBackpackButton:Show() ContainerFrameCombinedBags:Update()");
  expect(addon.eval("return GamepadBackpackButton:IsShown()"), "the game showing it: it stays").toBe(true);
  const other = loggedIn(GAMEPAD_ENV + BAG_ENV + BACKPACK_ENV.replace('"GamepadBagBar", ContainerFrameCombinedBags', '"GamepadBagBar", UIParent'));
  other.eval("__openBag()");
  expect([other.eval("return GamepadBackpackButton:IsShown()"), searchRow(other).slice(-1)[0]], "a bar that isn't on the bag window: Sort the padding in").toEqual([true, PAD]);
});
