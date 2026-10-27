// bagsections: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { CLICK_LUA, SETUP_DONE, UI_ENV, borderOf, isTok, loggedIn, setCombat } from "./helpers.mjs";

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
// The room the Filter and Groups buttons take on the search row: their widths (each fits its label) and a 6 px gap after each.
const tools = (addon) => addon.eval(`local t = ns.GetModule("Bags").tools return t.filter:GetWidth() + t.groups:GetWidth() + 12`);
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
  for _, fs in pairs(ns.GetModule("Bags").headers) do if fs:IsShown() then out[fs.text:GetText()] = gaps(fs, false, 1e9) end end
  return out`);

// Where a slot sits: [px from the bag window's left, px down from its top].
const spot = (addon, slot) => addon.eval(`local f, b = ContainerFrameCombinedBags, __slots.${slot}
  return { b:GetLeft() - f:GetLeft(), f:GetTop() - b:GetTop() }`);

// The bag window's height.
const height = (addon) => addon.eval("return ContainerFrameCombinedBags:GetHeight()");

// The section headers, in order, as they read: small muted capitals (W.SectionHeader).
const LABELS = ["QUEST ITEMS", "EQUIPMENT", "CONSUMABLES", "TRADE GOODS", "OTHER", "JUNK", "EMPTY"];
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
  const frame = addon.frame("ContainerFrameCombinedBags").rect;
  const band = addon.eval(`local h = ns.GetModule("Bags").headers.quest return { h:GetLeft(), h:GetTop(), h:GetWidth(), h:GetHeight() }`);
  expect([band[0] - frame.left, frame.top - band[1], band[2], band[3]], "a header band sits over its slots, as wide as its section, W.SectionHeader's 18 tall").toEqual([12, 75, 79, 18]);
  expect(addon.eval("local f = ContainerFrameCombinedBags return { f:GetWidth(), f:GetHeight() }"), "the window grows by the headers and rows the sections add, and by the padding (the game's 430 x 186)").toEqual([439, 233]);
  expect(addon.eval("for _, b in ipairs(ContainerFrameCombinedBags.Items) do if not b:IsShown() then return false end end return true"), "no slot is hidden").toBe(true);
});

it("section headers are W.SectionHeader's small muted capitals, not accent text, and take no clicks", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  const quest = addon.texts("QUEST ITEMS")[0];
  expect([quest.font.size, isTok(addon, quest.textColor, "muted")], "the small role, in the muted colour").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true]);
  expect(isTok(addon, quest.textColor, "accentText"), "no longer in the accent").toBe(false);
  expect(addon.eval(`local h = ns.GetModule("Bags").headers.quest return { h:IsMouseEnabled() and "mouse" or "no mouse", h.text:GetText(), h.chevron == nil }`), "no mouse, upper case, not collapsible").toEqual(["no mouse", "QUEST ITEMS", true]);
  addon.slash("accent ff8000");
  expect(isTok(addon, addon.texts("QUEST ITEMS")[0].textColor, "muted"), "a new accent leaves them muted").toBe(true);
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
  expect(small.eval("return { ns.GetModule('Bags').PAD, ns.GetModule('Bags').sort:GetHeight(), ns.Theme.SPACE.col, ns.Theme.CONTROL_H }"), "the padding is T.SPACE.col; Sort is an inline control tall (T.CONTROL_H)").toEqual([PAD, 20, PAD, 20]);
  for (const [sizes, counts] of [OWNER_BAG, FULL_BAG]) {
    const addon = openFilled(sizes, counts);
    expect([insets(addon), slotsRight(addon), addon.eval("return ContainerFrameCombinedBags:GetWidth()")], `${sizes.join("+")} slots: a full row of the game's 10 columns ends 12 px in; the window is the game's 415 px grid and the padding`).toEqual([inside, PAD, 439]);
  }
  const wide = openFilled(...OWNER_BAG, "__cols = 12");
  expect([insets(wide), slotsRight(wide), wide.eval("return ContainerFrameCombinedBags:GetWidth()")], "a client with 12 columns: 12 slots a row, the window as wide as its grid and the padding").toEqual([inside, PAD, 12 * 37 + 11 * 5 + 2 * PAD]);
  expect(wide.eval("return BagItemSearchBox:GetWidth()"), "the search box starts the padding in and narrows so Sort fits beside it").toBe(523 - PAD - 52 - 6 - tools(wide) - PAD);
});

it("a clear gap above each section header, its band reaching down to its slots; sections side by side keep theirs", () => {
  const addon = openFilled(...OWNER_BAG);
  expect(headerGaps(addon), "12 px from the slots above to a header band; the band reaches down to its own slots, holding the air under its text").toEqual({
    "QUEST ITEMS": [false, 0], EQUIPMENT: [12, 0], CONSUMABLES: [12, 0], "TRADE GOODS": [12, 0], OTHER: [12, 0], JUNK: [12, 0], EMPTY: [12, 0],
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
  expect(sort, "Sort ends 12 px inside the right edge; the search box gives it room").toEqual([PAD, 430 - PAD - 52 - 6 - tools(addon) - PAD]);
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
  return { BagItemSearchBox:GetLeft() - f:GetLeft(), s:GetLeft() - ns.GetModule("Bags").tools.groups:GetRight(), s:GetWidth(), b:GetLeft() - s:GetRight(), f:GetRight() - s:GetRight() }`);

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

it("the combined bag's money line takes the theme font and its gold coin box becomes a flat inset, each time the bag is shown", () => {
  const addon = loggedIn(BAG_ENV);
  addon.eval("__openBag()");
  addon.eval(`local m = ContainerFrameCombinedBags.MoneyFrame
    for _, key in ipairs({ "GoldButton", "SilverButton", "CopperButton" }) do
      m[key] = CreateFrame("Button", nil, m) m[key].Text = m[key]:CreateFontString(nil, "ARTWORK") m[key].Text:SetFont("TEST-ONLY-GAME", 12, "")
    end
    m.Border = CreateFrame("Frame", nil, m) m.Border:CreateTexture():SetTexture("TEST-ONLY-ART")
    ContainerFrameCombinedBags:Hide() ContainerFrameCombinedBags:Show()`);
  expect(addon.eval(`local m = ContainerFrameCombinedBags.MoneyFrame
    return { m.GoldButton.Text:GetFont() ~= "TEST-ONLY-GAME", m.CopperButton.Text:GetFont() ~= "TEST-ONLY-GAME", m.Border:GetRegions():GetAlpha(), select("#", m.Border:GetRegions()) > 1 }`), "figures in the theme font; the coin box's art faded and a panel of the theme's put in its place").toEqual([true, true, 0, true]);
});

it("bag categories: your own sections above the built-in ones, in list order, first in the list winning", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { quest: 1, equipment: 1, consumables: 2, junk: 1 });
  // The chat so far, as one string.
  const chat = () => Array.from(addon.chat()).join("\n");
  addon.slash("bag add Potions |Hitem:159::|h[TEST-ONLY Water]|h");
  addon.slash("bag add Tools 90001");
  expect(addon.texts("POTIONS").length + addon.texts("TOOLS").length, "both headers show at once, without a reload").toBe(2);
  expect(addon.eval(`local h = ns.GetModule("Bags").headers
    return h["cat:potions"]:GetTop() >= h.quest:GetTop() and h["cat:potions"]:GetLeft() < h.quest:GetLeft()`), "categories sit before Quest items").toBe(true);
  addon.slash("bag add Tools 159");
  expect(addon.eval(`return ns.Settings("Bags").categories[2].items[159]`), "an item is in one category: the newer move wins").toBe(true);
  expect(addon.eval(`return ns.Settings("Bags").categories[1].items[159]`)).toBeNull();
  addon.slash("bag top Tools");
  expect(addon.eval(`return ns.Settings("Bags").categories[1].name`), "top moves it first").toBe("Tools");
  addon.slash("bag remove 159");
  expect(addon.texts("POTIONS").length, "an emptied category shows no header").toBe(0);
  addon.slash("bag delete tools");
  expect(addon.texts("TOOLS").length, "a deleted category's header goes").toBe(0);
  addon.slash("bag delete Potions");
  addon.slash("bag");
  addon.slash("bag delete Nope");
  addon.slash("bag add Tools");
  expect(chat(), "the list, a missing category and the usage line are answered").toMatch(/No bag categories[^]*No bag category called Nope[^]*Usage: \/vg bag/);
  addon.slash("bag add Mix 6948");
  addon.slash("bag");
  expect(chat(), "the list names each category and its items").toMatch(/Mix: /);
});

it("bag categories: Make first moves the category's section first at once, with the same items", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { quest: 1, equipment: 1, consumables: 2, junk: 1 });
  addon.slash("bag add Potions |Hitem:159::|h[TEST-ONLY Water]|h");
  addon.slash("bag add Tools 90001");
  addon.slash("bag top Tools");
  expect(addon.eval(`local h = ns.GetModule("Bags").headers
    return h["cat:tools"]:GetLeft() < h["cat:potions"]:GetLeft()`), "Tools now sits before Potions").toBe(true);
});
it("bag categories ignore an item with no usable ID", () => {
  const addon = openFilled([8, 0, 0, 0, 0], { equipment: 1 });
  addon.slash("bag add Tools 90001");
  expect(addon.eval(`local BG = ns.GetModule("Bags") return { BG.CategoryOf(nil) == nil, BG.CategoryOf(90001) }`)).toEqual([true, "cat:tools"]);
});

// TEST-ONLY search: the game's search row marks each item button matching or not (SetMatchesSearch); UpdateSearchResults is its refresh.
const SEARCH_ENV = `
  local f = ContainerFrameCombinedBags
  for _, b in ipairs(f.Items) do b.SetMatchesSearch = function(self, yes) self.matches = yes end end
  function f:UpdateSearchResults() for _, b in ipairs(self.Items) do b:SetMatchesSearch(true) end end
  local items = __wfgWorld.items
  items[90001].level, items[90001].bind, items[90001].type, items[90001].subType = 30, 2, "Weapon", "Swords"
  items[159].level = 5
`;

// Types a search and has the game refresh; returns the names of the items left lit.
const lit = (addon, text) => Object.values(addon.eval(`BagItemSearchBox:SetText(${JSON.stringify(text)}) ContainerFrameCombinedBags:UpdateSearchResults()
  local out = {}
  for _, b in ipairs(ContainerFrameCombinedBags.Items) do if b.matches then out[#out + 1] = (C_Container.GetContainerItemInfo(b:GetBagID(), b:GetID()) or {}).itemID end end
  table.sort(out) return out`));

it("search operators: ilvl, quality, type, bind and category words combine with plain words; no operator leaves the game's search alone", () => {
  const addon = loggedIn(ITEMS_ENV + fill([8, 4, 0, 0, 0], { quest: 1, equipment: 1, consumables: 2, junk: 1 }) + BAG_FRAME + SEARCH_ENV);
  addon.eval("__openBag()");
  expect(lit(addon, "sword"), "a plain word: the game's own result stands (every filled slot lit in this test)").toHaveLength(5);
  expect(lit(addon, "ilvl>20"), "item level above 20").toEqual([90001]);
  expect(lit(addon, "ilvl<=5"), "at most 5 (items with no level count as 1)").toEqual([159, 159, 90002, 90003]);
  expect(lit(addon, "q:uncommon"), "a quality by name").toEqual([90001]);
  expect(lit(addon, "q>=2"), "a quality by number").toEqual([90001]);
  expect(lit(addon, "type:sword bind:boe"), "type and binding together").toEqual([90001]);
  expect(lit(addon, "TYPE:Weapon test-only"), "case does not matter; a plain word must match as well").toEqual([90001]);
  expect(lit(addon, "bind:bop"), "nothing binds on pickup here").toEqual([]);
  expect(lit(addon, "ilvl>x"), "a key with no usable value is a plain word: no such name").toHaveLength(5);
  addon.slash("bag add Water 159");
  expect(lit(addon, "cat:water"), "a category by name").toEqual([159, 159]);
  expect(lit(addon, "cat:nope"), "no such category").toEqual([]);
  expect(addon.eval(`local BG = ns.GetModule("Bags") return BG.ItemMatches(BG.ParseSearch("ilvl>1"), 1, 4)`), "an empty slot never matches").toBe(false);
});

it("search operators wait for a client that has the search refresh, and skip buttons without a match call", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { equipment: 1 });
  expect(addon.eval("return ContainerFrameCombinedBags.UpdateSearchResults"), "this client has none: nothing hooked, nothing broken").toBeNull();
  const other = loggedIn(ITEMS_ENV + fill([8, 4, 0, 0, 0], { equipment: 1 }) + BAG_FRAME + "function ContainerFrameCombinedBags:UpdateSearchResults() end");
  other.eval("__openBag() BagItemSearchBox:SetText('ilvl>1') ContainerFrameCombinedBags:UpdateSearchResults()");
  expect(other.eval("return ContainerFrameCombinedBags.Items[1].matches"), "buttons without SetMatchesSearch are left alone").toBeNull();
  expect(other.eval(`local BG = ns.GetModule("Bags") return BG.ParseSearch(nil) == nil`), "no text: no tests").toBe(true);
});

// TEST-ONLY game whose bag refill sets each slot's match from its own search, as Mainline/ContainerFrame.lua's
// UpdateItems does (here the game's own search lights everything).
const REFILL_ENV = `
  local f, fill = ContainerFrameCombinedBags, ContainerFrameCombinedBags.UpdateItems
  function f:UpdateItems() fill(self) for _, b in ipairs(self.Items) do b:SetMatchesSearch(true) end end
`;

it("search operators hold when the game fills the bag's slots again (an item moved)", () => {
  const addon = loggedIn(ITEMS_ENV + fill([8, 4, 0, 0, 0], { equipment: 1, consumables: 2 }) + BAG_FRAME + SEARCH_ENV + REFILL_ENV);
  addon.eval("__openBag()");
  expect(lit(addon, "q:uncommon"), "the sword alone").toEqual([90001]);
  addon.eval("ContainerFrameCombinedBags:UpdateItems()");
  expect(Object.values(addon.eval("local out = {} for _, b in ipairs(ContainerFrameCombinedBags.Items) do if b.matches then out[#out + 1] = (C_Container.GetContainerItemInfo(b:GetBagID(), b:GetID()) or {}).itemID end end return out")), "still the sword alone after the refill").toEqual([90001]);
});

// TEST-ONLY bank, as Mainline/BankFrameTemplates.lua builds it (BankFrame.xml loads BankPanelTemplate): a tab
// (bag 6) holding the sword, 5 waters and the gray item; the panel's pooled slots (each knows its tab and slot,
// and its Refresh sets its match from the game's own search); a page turn makes the slots again; the game's
// own search, which doesn't know the search words, greys every slot while its box holds any text.
const BANK_ENV = `
  __wfgWorld.bagSizes[6] = 4
  __wfgWorld.bags[6] = { { itemID = 90001 }, { itemID = 159, count = 5 }, { itemID = 90002 } }
  BankFrame = CreateFrame("Frame", "BankFrame", UIParent) BankFrame:Hide()
  BankPanel = CreateFrame("Frame", "BankPanel", BankFrame)
  BankItemSearchBox = CreateFrame("EditBox", "BankItemSearchBox", BankFrame)
  __bankSlots = {}
  local function gameMatch() return (BankItemSearchBox:GetText() or "") == "" end
  local function slot(i)
    local b = CreateFrame("Button", nil, BankPanel)
    b.GetBankTabID, b.GetContainerSlotID = function() return 6 end, function() return i end
    b.SetMatchesSearch = function(self, yes) self.matches = yes end
    b.Refresh = function(self) self:SetMatchesSearch(gameMatch()) end
    return b
  end
  function BankPanel:EnumerateValidItems() local i = 0 return function() i = i + 1 return __bankSlots[i] end end
  function BankPanel:GenerateItemSlotsForSelectedTab() for i = 1, 4 do __bankSlots[i] = __bankSlots[i] or slot(i) __bankSlots[i]:Refresh() end end
  function BankPanel:RefreshAllItemsForSelectedTab() for b in self:EnumerateValidItems() do b:Refresh() end end
  function BankPanel:UpdateSearchResults() for b in self:EnumerateValidItems() do b:SetMatchesSearch(gameMatch()) end end
`;

// The items of the bank slots left lit.
const bankLit = (addon) => Object.values(addon.eval(`local out = {}
  for _, b in ipairs(__bankSlots) do if b.matches then out[#out + 1] = (C_Container.GetContainerItemInfo(6, b:GetContainerSlotID()) or {}).itemID or "empty" end end
  return out`));

it("the bank's search box takes the search words too, and they hold through a refreshed slot, a page turn and a refresh", () => {
  const addon = loggedIn(ITEMS_ENV + BAG_FRAME + SEARCH_ENV + BANK_ENV);
  addon.eval("__openBag() BankFrame:Show() BankPanel:GenerateItemSlotsForSelectedTab()");
  expect(bankLit(addon), "no search: every slot lit").toEqual([90001, 159, 90002, "empty"]);
  addon.eval("BankItemSearchBox:SetText('q:uncommon') BankPanel:UpdateSearchResults()");
  expect(bankLit(addon), "the sword alone, not the game's all-grey bank").toEqual([90001]);
  addon.eval("__bankSlots[1]:Refresh() __bankSlots[2]:Refresh()");
  expect(bankLit(addon), "a slot the game refreshes (an item picked up or put down) keeps the words' answer").toEqual([90001]);
  addon.eval("BankPanel:GenerateItemSlotsForSelectedTab() BankPanel:RefreshAllItemsForSelectedTab()");
  expect(bankLit(addon), "a page turn and a whole refresh: the same").toEqual([90001]);
  addon.eval("BankItemSearchBox:SetText('ilvl<=5 spring') BankPanel:UpdateSearchResults()");
  expect(bankLit(addon), "words and a plain word together").toEqual([159]);
  addon.eval("BankItemSearchBox:SetText('sword') BankPanel:UpdateSearchResults()");
  expect(bankLit(addon), "a plain word alone is the game's own search").toEqual([]);
});

it("/vg bag deposit sends a category's stacks to the open bank, out of combat only", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { consumables: 2, equipment: 1 });
  // The chat so far, as one string.
  const chat = () => Array.from(addon.chat()).join("\n");
  addon.slash("bag add Water 159");
  addon.slash("bag deposit Water");
  addon.slash("bag deposit Nope");
  expect(chat(), "no bank open: told so; no such category: told so").toMatch(/Open the bank first[^]*No bag category called Nope/);
  addon.eval("BankFrame = CreateFrame('Frame', 'BankFrame', UIParent) BankFrame:Show() __wfgWorld.usedItems = nil");
  setCombat(addon, true);
  addon.slash("bag deposit Water");
  expect(addon.eval("return __wfgWorld.usedItems"), "nothing moves in a fight").toBeNull();
  setCombat(addon, false);
  addon.slash("bag deposit Water");
  expect(addon.eval("return __wfgWorld.usedItems"), "both stacks of water go, the sword stays").toEqual([[0, 1], [0, 2]]);
  expect(chat(), "it says how many").toMatch(/Sent 2 stack\(s\) of Water/);
});

// The text of the shown rows of the dropdown menu now open.
const menuRows = (addon) => Object.values(addon.eval("local out = {} for i, b in ipairs(Vanguard_Menu.items) do if b:IsShown() then out[#out + 1] = b.text:GetText() end end return out"));
// Opens one of the bag's tool buttons ("filter" or "groups").
const openTool = (addon, key) => addon.eval(`ns.GetModule("Bags").tools.${key}:Click()`);

it("the bag's Filter button fills the search box with a ready-made search and refreshes the lit items", () => {
  const addon = loggedIn(ITEMS_ENV + fill([8, 4, 0, 0, 0], { equipment: 1, consumables: 2 }) + BAG_FRAME + SEARCH_ENV);
  addon.eval("__openBag()");
  addon.slash("bag add Water 159");
  openTool(addon, "filter");
  expect(menuRows(addon), "the ready-made searches, then each group").toEqual(["Show everything", "Rare or better", "Epic or better", "Bind on equip", "Armor", "Weapons", "Group: Water"]);
  addon.click("Vanguard_Menu.items[4]");
  expect(addon.eval("return BagItemSearchBox:GetText()"), "bind on equip typed in").toBe("bind:boe");
  expect(Object.values(addon.eval("local out = {} for _, b in ipairs(ContainerFrameCombinedBags.Items) do if b.matches then out[#out + 1] = (C_Container.GetContainerItemInfo(b:GetBagID(), b:GetID()) or {}).itemID end end return out")), "and the sword lit alone").toEqual([90001]);
  openTool(addon, "filter");
  addon.click("Vanguard_Menu.items[7]");
  expect(addon.eval("return BagItemSearchBox:GetText()"), "a group is a cat: search").toBe("cat:water");
  addon.eval("ContainerFrameCombinedBags.UpdateSearchResults = nil BagItemSearchBox:SetText('x')");
  openTool(addon, "filter");
  addon.click("Vanguard_Menu.items[1]");
  expect(addon.eval("return BagItemSearchBox:GetText()"), "show everything empties the box, with no refresh call to make").toBe("");
});

it("the bag's Groups button makes groups, files the held item, sends to the bank, orders and deletes", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { equipment: 1, consumables: 2 });
  // The chat so far, as one string.
  const chat = () => Array.from(addon.chat()).join("\n");
  openTool(addon, "groups");
  expect(menuRows(addon), "only New group before any exists").toEqual(["New group..."]);
  addon.click("Vanguard_Menu.items[1]");
  addon.eval("Vanguard_TextEdit:SetText('Food items') Vanguard_TextDialog.primary:Click()");
  expect(addon.eval("return ns.Settings('Bags').categories[1].name"), "the typed name becomes one word").toBe("Food-items");
  addon.eval("ns.GetModule('Bags').NewGroup('food-ITEMS') ns.GetModule('Bags').NewGroup('   ')");
  expect(chat(), "the same name twice is refused").toMatch(/food-ITEMS already exists/);
  openTool(addon, "groups");
  expect(menuRows(addon), "four actions per group, then taking the held item out").toEqual(["New group...", "Put held item in Food-items", "Send Food-items to the bank", "Make Food-items first", "Delete Food-items", "Take held item out of its group"]);
  addon.click("Vanguard_Menu.items[2]");
  expect(chat(), "nothing in hand").toMatch(/Pick an item up first/);
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 159 }");
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[2]");
  expect([addon.eval("return ns.Settings('Bags').categories[1].items[159]"), addon.eval("return __wfgWorld.cursor")], "the held water is in the group and the cursor is clear").toEqual([true, null]);
  expect(addon.texts("FOOD-ITEMS").length, "its header shows at once").toBe(1);
  addon.eval("ns.GetModule('Bags').NewGroup('Other') __wfgWorld.cursor = { type = 'spell', id = 5 }");
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[6]");
  expect(chat(), "something that is not an item is not filed").toMatch(/Pick an item up first[^]*Pick an item up first/);
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[8]");
  expect(addon.eval("return ns.Settings('Bags').categories[1].name"), "Make first moves it up").toBe("Other");
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[3]");
  expect(chat(), "Send to the bank answers (no bank open)").toMatch(/Open the bank first/);
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[5]");
  expect(addon.eval("return #ns.Settings('Bags').categories"), "Delete removes one group").toBe(1);
});

it("the bag's Groups menu closes with the bag, so its catcher doesn't eat the next click", () => {
  const addon = loggedIn(BAG_ENV + CLICK_LUA);
  addon.eval("__openBag()");
  addon.eval('local g = ns.GetModule("Bags").tools.groups g:GetScript("OnClick")(g)');
  expect(addon.eval("return Vanguard_Menu:IsShown()"), "the menu opens").toBe(true);
  addon.eval("ContainerFrameCombinedBags:Hide()");
  addon.update(0);
  expect(addon.eval("return { Vanguard_Menu:IsShown(), Vanguard_Menu.catcher:IsShown() }"), "closing the bag closes it and its catcher").toEqual([false, false]);
});
it("the Filter and Groups buttons are as wide as their labels need, so neither is cut off", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { equipment: 1 });
  const rows = Object.values(addon.eval(`local out = {} for _, key in ipairs({ "filter", "groups" }) do
    local b = ns.GetModule("Bags").tools[key]
    out[#out + 1] = { b.text:GetText(), b.text:GetStringWidth() <= b.text:GetWidth(), b.text:GetWidth() > 0 }
  end return out`)).map((r) => Object.values(r));
  expect(rows, "each label in full, with room to spare between its left inset and the arrow").toEqual([["Filter", true, true], ["Groups", true, true]]);
  expect(addon.eval("return BagItemSearchBox:GetWidth() > 100"), "and the search box keeps a usable width").toBe(true);
});

it("the bag's Groups menu takes the held item out of its group, and its header goes", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { equipment: 1, consumables: 2 });
  // The chat so far, as one string.
  const chat = () => Array.from(addon.chat()).join("\n");
  addon.slash("bag add Water 159");
  expect(addon.texts("WATER").length, "the group's header shows").toBe(1);
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[6]");
  expect(chat(), "nothing in hand: told so").toMatch(/Pick an item up first, then take it out of its group\./);
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 6948 }");
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[6]");
  expect(chat(), "an item in no group: told so").toMatch(/is in no group\./);
  expect(addon.eval("return __wfgWorld.cursor.id"), "and it stays in hand").toBe(6948);
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 159 }");
  openTool(addon, "groups");
  addon.click("Vanguard_Menu.items[6]");
  expect([addon.eval("return ns.Settings('Bags').categories[1].items[159]"), addon.eval("return __wfgWorld.cursor")], "the water is out of the group and the cursor is clear").toEqual([null, null]);
  expect(addon.texts("WATER").length, "the empty group's header goes at once").toBe(0);
  expect(chat(), "it says so").toMatch(/Refreshing Spring Water is in no category/);
});

// The Junk header's count text.
const junkValue = (addon) => addon.eval("return ns.GetModule('Bags').headers.junk.count:GetText()");

it("the Junk header shows what the junk sells for, kept up as a stack changes", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { equipment: 1, junk: 3 });
  expect(junkValue(addon), "three gray items at 3c each").toBe("· 9c");
  addon.eval("__wfgWorld.bags[0][2].count = 50 ContainerFrameCombinedBags:UpdateItems()");
  expect(junkValue(addon), "one of them now a stack of 50, with no section moving").toBe("· 1s 56c");
  addon.eval("__wfgWorld.items[90002].sellPrice = 0 ContainerFrameCombinedBags:UpdateItems()");
  expect(junkValue(addon), "junk that sells for nothing shows no value").toBe("");
  expect(addon.eval("return ns.GetModule('Bags').headers.equipment.count"), "no other header has a value").toBeNull();
});

it("the Junk value counts a gray item filed in a group, and Junk is wide enough to show it", () => {
  const addon = openFilled([8, 4, 0, 0, 0], { equipment: 1, junk: 2 });
  addon.slash("bag add Keep " + addon.eval("return __wfgWorld.bags[0][2].itemID"));
  expect(junkValue(addon), "the filed gray still sells: 3c + 3c").toBe("· 6c");
  addon.eval("__wfgWorld.items[90002].sellPrice = 123456 ContainerFrameCombinedBags:UpdateItems()");
  expect(junkValue(addon), "a value too wide for Junk's narrow header is left off, not drawn over the next header").toBe("");
});

it("Sort shows its whole label in German, Russian and Portuguese, and the search box gives up the room", () => {
  for (const locale of ["deDE", "ruRU", "ptBR"]) {
    const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE });
    addon.eval(BAG_ENV);
    addon.login();
    addon.eval("__openBag()");
    expect(addon.textFit("ns.GetModule('Bags').sort"), `${locale}: nothing cut`).toEqual([]);
    const gap = addon.eval("return ns.GetModule('Bags').sort:GetLeft() - BagItemSearchBox:GetRight()");
    expect(gap, `${locale}: the search box ends before Sort`).toBeGreaterThanOrEqual(0);
  }
});

it("a section of one or two items is as wide as its translated header, so no header is cut (B10-7)", () => {
  for (const locale of ["deDE", "ruRU"]) {
    const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE });
    addon.eval([BAG_ENV, fill([8, 4, 0, 0, 0], { quest: 1, consumables: 1, trade: 2 })].join("\n"));
    addon.login();
    addon.eval("__openBag()");
    const cut = addon.textFit("ns.GetModule('Bags').headers.quest").concat(addon.textFit("ns.GetModule('Bags').headers.consumables"), addon.textFit("ns.GetModule('Bags').headers.trade"));
    expect(cut, `${locale}: no section header is cut`).toEqual([]);
    expect(addon.eval("local h = ns.GetModule('Bags').headers return { h.quest:GetWidth() > 79, h.other == nil }"), `${locale}: a long header widens its section past two slots`).toEqual([true, true]);
  }
});

it("Filter, Groups and Sort refit when the Text size changes while the bag is open (B10-9)", () => {
  for (const locale of ["ruRU", "deDE"]) {
    const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE });
    addon.eval(BAG_ENV);
    addon.login();
    addon.eval("__openBag()");
    addon.eval("ns.Theme.Settings().textScale = 1.5 ns.Theme.Refresh()");
    const BG = "ns.GetModule('Bags')";
    const cut = ["filter", "groups"].flatMap((name) => addon.textFit(`${BG}.tools.${name}`)).concat(addon.textFit(`${BG}.sort`));
    expect(cut, `${locale}: Filter, Groups and Sort show their whole labels at 150%`).toEqual([]);
    const gap = addon.eval(`return ${BG}.tools.filter:GetLeft() - BagItemSearchBox:GetRight()`);
    expect(gap, `${locale}: the search box still ends before Filter`).toBeGreaterThanOrEqual(0);
  }
});

it("the sectioned combined bag is clamped to the screen, so a bag taller than a short canvas keeps its title and Sort button; a plain bag is left alone", () => {
  // TEST-ONLY: frames record the clamp they are given (the stub's SetClampedToScreen keeps nothing); the game windows'
  // own clamp (Drag game windows by their title bar) is off, so only the sections' clamp is seen.
  const record = "__wfgStub.methods.SetClampedToScreen = function(self, on) self.__testClamped = on end\n";
  const unmovable = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { movable = false } } }" };
  // Whether the combined bag was given a clamp to the screen, with this Lua run before login.
  const clamp = (extra) => loggedIn(record + BAG_ENV + extra, unmovable).eval("return ContainerFrameCombinedBags.__testClamped");
  expect(clamp("__wfgStub.setScreen(1188, 668)"), "clamped once the sections watch it").toBe(true);
  expect(clamp("C_Item.GetItemInfoInstant = nil"), "a client that can't section keeps the game's frame as it is").toBeNull();
});
