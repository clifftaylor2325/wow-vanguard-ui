// merchantbulk: the sell list, sell-all and the Stack/Max buttons at a merchant (Modules/MerchantBulk.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY bags: slot 1 holds 5 of item 159 (listed), 2 holds item 4540 (not listed), 3 a set item (listed),
// 4 a locked listed stack, 5 a hidden item, 6 another stack of item 159, and 7 seven more listed items.
// An equipment set keeps item 6948 (shown by name only). Selling is recorded and "sticky" once.
const BULK_ENV = `
  C_MerchantFrame = nil
  __gold, __used, __sticky = 100000, {}, 0
  __wfgWorld.items[159] = { name = "TEST-ONLY Water", sellPrice = 10 }
  __wfgWorld.items[4540] = { name = "TEST-ONLY Bread", sellPrice = 5 }
  __wfgWorld.items[6948] = { name = "TEST-ONLY Stone", sellPrice = 1, stack = 20 }
  GetMoney = function() return __gold end
  C_EquipmentSet = { GetEquipmentSetIDs = function() return { 1 } end, GetItemIDs = function() return { [16] = 6948 } end }
  __bag = { { itemID = 159, stackCount = 5 }, { itemID = 4540 }, { itemID = 6948 }, { itemID = 159, isLocked = true },
    { itemID = { __secret = true } }, { itemID = 159, stackCount = 2 } }
  for n = 1, 7 do __bag[#__bag + 1] = { itemID = 1000 + n } __wfgWorld.items[1000 + n] = { name = "TEST-ONLY Extra " .. n, sellPrice = 1 } end
  C_Container = { GetContainerNumSlots = function(bag) return bag == 0 and #__bag or 0 end,
    GetContainerItemInfo = function(bag, slot) return __bag[slot] end,
    GetContainerNumFreeSlots = function(bag) return bag == 1 and 3 or 0 end,
    UseContainerItem = function(bag, slot)
      __used[#__used + 1] = slot
      if __sticky > 0 then __sticky = __sticky - 1 else __bag[slot] = nil end
    end }
  C_Timer = { After = function(_, fn) fn() end }
`;

// Settings of the Merchant module, set from the test.
const set = (addon, lua) => addon.eval(`local s = ns.GetModule("Merchant").settings ${lua}`);
const ask = (addon) => addon.eval("local f = Vanguard_Question return f and { f:IsShown(), f.title:GetText() } or { false }");
const used = (addon) => addon.eval("return __used");

it("the sell list: /vg junk adds, lists, removes and clears; the merchant asks first and sells with retries", () => {
  const addon = loggedIn(BULK_ENV);
  addon.slash("junk");
  expect(chatHas(addon, /Your sell list is empty/), "empty list says so").toBe(true);
  addon.slash("junk |Hitem:159::|h[TEST-ONLY Water]|h");
  expect(chatHas(addon, /TEST-ONLY Water is on your sell list\. Switch it on under Merchants and errors/), "added, with a hint while the switch is off").toBe(true);
  addon.slash("junk 6948");
  addon.slash("junk");
  expect(chatHas(addon, /Sell list: TEST-ONLY Water/), "the list names its items").toBe(true);
  addon.slash("junk nonsense");
  expect(chatHas(addon, /Usage: \/vg junk/), "a non-item gets the usage line").toBe(true);
  addon.fire("MERCHANT_SHOW");
  expect(ask(addon)[0], "the switch is off: no question at a merchant").toBe(false);
  set(addon, "s.listSell = true");
  addon.slash("junk 1001");
  expect(chatHas(addon, /TEST-ONLY Extra 1 is on your sell list\.$/), "no hint once switched on").toBe(true);
  addon.fire("MERCHANT_SHOW");
  const [shown, title] = ask(addon);
  expect([shown, title], "one question: 7 water in two stacks and one extra, the set item left out").toEqual([true, "Sell for 0s 71c?\n7 × TEST-ONLY Water\n1 × TEST-ONLY Extra 1"]);
  addon.click("Vanguard_Question.confirm");
  expect(used(addon), "answering Sell sells each listed stack once; locked, hidden and set items stay").toEqual([1, 6, 7]);
  expect(chatHas(addon, /Selling 3 stack\(s\) for 0s 71c\. The merchant's Buyback tab gets them back/), "and says where the undo is").toBe(true);
  addon.slash("junk remove 159");
  addon.slash("junk clear");
  expect(chatHas(addon, /Your sell list is empty\.$/), "cleared").toBe(true);
});

it("the question says 'and N more' past five items; a sale retries what is left and stops without a merchant or in a fight", () => {
  const addon = loggedIn(BULK_ENV);
  set(addon, "s.listSell = true for n = 1, 7 do s.junkList[1000 + n] = true end");
  addon.eval("__sticky = 3");
  addon.fire("MERCHANT_SHOW");
  expect(ask(addon)[1], "five names, then a count of the rest").toMatch(/\nand 2 more$/);
  addon.click("Vanguard_Question.confirm");
  expect(used(addon).length, "all seven tried, the three that stuck tried again").toBe(10);
  addon.fire("MERCHANT_CLOSED");
  addon.eval("__used = {}");
  addon.eval("ns.GetModule('Merchant').SellRows(function() return { { bag = 0, slot = 1 } } end, 3)");
  expect(used(addon), "no merchant open: nothing is used (that would use the item)").toEqual({});
  addon.fire("MERCHANT_SHOW");
  setCombat(addon, true);
  addon.eval("ns.GetModule('Merchant').OfferList()");
  addon.eval("ns.GetModule('Merchant').SellRows(function() return { { bag = 0, slot = 1 } } end, 3)");
  expect(used(addon), "in combat: nothing is used").toEqual({});
});

it("the sell offer is a danger question (Enter never answers it) and sells only the rows it showed, still holding what was shown", () => {
  const addon = loggedIn(BULK_ENV);
  set(addon, "s.listSell = true s.junkList[159] = true s.junkList[1001] = true");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return { Vanguard_Question.confirm == Vanguard_Question.sure, Vanguard_Question.confirm.kind }"), "a danger button: Enter never presses it").toEqual([true, "danger"]);
  addon.eval("__bag[8] = { itemID = 159, stackCount = 3 } __bag[6].stackCount = 9 __bag[7] = { itemID = 4540 }");
  addon.click("Vanguard_Question.confirm");
  expect(used(addon), "the new stack, the stack that grew and the slot that holds something else are not sold; the shown stack is").toEqual([1]);
});

it("/vg sell sells every stack of one item after a question, only at a merchant", () => {
  const addon = loggedIn(BULK_ENV);
  addon.slash("sell");
  expect(chatHas(addon, /Usage: \/vg sell/), "needs an item").toBe(true);
  addon.slash("sell 159");
  expect(chatHas(addon, /Open a merchant first/), "needs a merchant").toBe(true);
  addon.fire("MERCHANT_SHOW");
  addon.slash("sell 999");
  expect(chatHas(addon, /You have no item 999 to sell/), "an item you don't hold").toBe(true);
  addon.slash("sell 159");
  expect(ask(addon)[1], "7 water in two stacks (the locked one stays)").toMatch(/^Sell for 0s 70c\?\n7 × TEST-ONLY Water$/);
  addon.click("Vanguard_Question.no");
  expect(used(addon), "No sells nothing").toEqual({});
  addon.slash("sell 159");
  addon.fire("MERCHANT_CLOSED");
  addon.click("Vanguard_Question.confirm");
  expect([used(addon), chatHas(addon, /Nothing sold: the merchant is closed/)], "answered after the merchant closed: nothing is used").toEqual([{}, true]);
  addon.fire("MERCHANT_SHOW");
  addon.slash("sell 159");
  addon.click("Vanguard_Question.confirm");
  expect(used(addon), "Sell uses each stack").toEqual([1, 6]);
});

it("the helpers are off when the Merchant module is", () => {
  const addon = loggedIn(BULK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Merchant = false } } }" });
  addon.slash("junk");
  addon.slash("sell 159");
  expect(Array.from(addon.chat()).filter((l) => /Merchant helpers are off/.test(l)).length, "both commands say so").toBe(2);
});

// TEST-ONLY merchant: item 1 is 20 water at 2 copper each, sold 5 to a pack at 10 (stock 100 packs), item 2
// costs honor, item 3 is limited (2 left). The quantity window belongs to the first merchant item's button.
const BUY_ENV = `
  __wfgWorld.items[159] = { name = "TEST-ONLY Water", stack = 20, sellPrice = 1 }
  __wfgWorld.merchant = { items = {
    { itemID = 159, name = "TEST-ONLY Water", price = 10, stack = 5, maxStack = 20 },
    { itemID = 160, name = "TEST-ONLY Medal", price = 10, stack = 1 },
    { itemID = 159, name = "TEST-ONLY Limited", price = 10, stack = 1, left = 2 },
    { itemID = 159, name = "TEST-ONLY Hidden", price = { __secret = true }, stack = 1 } } }
  GetMerchantItemCostInfo = function(i) return i == 2 and 1 or 0 end
  __bought = {}
  BuyMerchantItem = function(i, n) __bought[#__bought + 1] = { i, n } end
  __gold = 10000
  GetMoney = function() return __gold end
  C_Container = { GetContainerNumFreeSlots = function(bag) return bag == 0 and 2 or 0 end }
  C_Timer = { After = function(_, fn) fn() end }
  StackSplitFrame = CreateFrame("Frame", "StackSplitFrame", UIParent)
  StackSplitFrame:SetSize(100, 60) StackSplitFrame:SetPoint("CENTER") StackSplitFrame:Hide()
  __owner = function(name, id) StackSplitFrame.owner = { GetName = function() return name end, GetID = function() return id end } end
  __owner("MerchantItem1ItemButton", 1)
`;

// What the quantity window's extras show: the Stack and Max buttons, the cost line and its text (false before they exist).
const split = (addon) => addon.eval(`local MC = ns.GetModule("Merchant") local e = MC.OnSplitShow and ns.FrameState("vgSplitBulk")[StackSplitFrame]
  return e and { e.stack:IsShown(), e.max:IsShown(), e.line:IsShown(), e.line:GetText() } or false`);
// The merchant items bought so far, as { index, count }.
const bought = (addon) => addon.eval("return __bought");

it("the quantity window of a merchant's item gets Stack, Max and a cost line; any other item gets nothing", () => {
  const addon = loggedIn(BUY_ENV);
  addon.fire("MERCHANT_SHOW");
  addon.eval("StackSplitFrame:Show()");
  expect(split(addon), "40 would fit (2 free slots of 20, 8 packs of 5) and cost 80 copper: gold allows 1000 packs").toEqual([true, true, true, "Max 40 for 0s 80c"]);
  addon.eval("__owner('MerchantItem2ItemButton', 2) StackSplitFrame:Hide() StackSplitFrame:Show()");
  expect(split(addon)[0], "an item that costs honor: no buttons").toBe(false);
  addon.eval("__owner('ContainerFrame1Item1', 1) StackSplitFrame:Hide() StackSplitFrame:Show()");
  expect(split(addon)[0], "an item in your bags: no buttons").toBe(false);
  addon.eval("StackSplitFrame.owner = nil StackSplitFrame:Hide() StackSplitFrame:Show()");
  expect(split(addon)[0], "no owner: no buttons").toBe(false);
  addon.eval("__owner('MerchantItem3ItemButton', 3) __gold = 5 StackSplitFrame:Hide() StackSplitFrame:Show()");
  expect(split(addon)[3], "can't pay for one").toBe("Can't afford one");
  addon.eval("__owner('MerchantItem4ItemButton', 4) StackSplitFrame:Hide() StackSplitFrame:Show()");
  expect(split(addon)[0], "a price the client hides is not read: no buttons").toBe(false);
  set(addon, "s.bulkBuy = false");
  addon.eval("__owner('MerchantItem1ItemButton', 1) StackSplitFrame:Hide() StackSplitFrame:Show()");
  expect(split(addon)[0], "switched off: hidden").toBe(false);
});

// Presses one of the quantity window's buttons.
const press = (addon, which) => addon.eval(`local b = ns.FrameState("vgSplitBulk")[StackSplitFrame].${which} b:GetScript("OnClick")(b)`);

it("Stack buys one merchant stack; Max asks first when it is more, then buys in chunks and says what it bought", () => {
  const addon = loggedIn(BUY_ENV);
  addon.fire("MERCHANT_SHOW");
  addon.eval("StackSplitFrame:Show()");
  press(addon, "stack");
  expect([bought(addon), addon.eval("return StackSplitFrame:IsShown()")], "one stack of 20 (4 packs), and the window closes").toEqual([[[1, 20]], false]);
  expect(chatHas(addon, /Bought 20 × TEST-ONLY Water for 0s 40c\./), "and says what it cost").toBe(true);
  addon.eval("__bought = {} StackSplitFrame:Show()");
  press(addon, "max");
  expect(ask(addon)[1], "more than a stack: asks first").toBe("Buy 40 × TEST-ONLY Water for 0s 80c?");
  expect(bought(addon), "nothing bought before the answer").toEqual({});
  addon.click("Vanguard_Question.confirm");
  expect(bought(addon), "two chunks of one stack").toEqual([[1, 20], [1, 20]]);
  expect(chatHas(addon, /Bought 40 × TEST-ONLY Water for 0s 80c\./), "and says so").toBe(true);
});

it("a run stops when the merchant closes, combat starts or the gold runs out; one run at a time; nothing for zero", () => {
  const addon = loggedIn(BUY_ENV + "__later = {} C_Timer = { After = function(s, fn) if s == 0.2 then __later[#__later + 1] = fn end end }");
  const MC = "ns.GetModule('Merchant')";
  addon.fire("MERCHANT_SHOW");
  addon.eval(`${MC}.Buy(1, 8)`);
  addon.eval(`${MC}.Buy(1, 8)`);
  expect(bought(addon), "the first chunk went at once; a second run didn't start beside it").toEqual([[1, 20]]);
  addon.fire("MERCHANT_CLOSED");
  addon.eval("__later[1]()");
  expect([bought(addon).length, chatHas(addon, /Bought 20 × TEST-ONLY Water for 0s 40c\./)], "closed merchant: the run ends and says what it did").toEqual([1, true]);
  addon.fire("MERCHANT_SHOW");
  addon.eval(`${MC}.Buy(1, 8) __gold = 30`);
  addon.eval("__later[#__later]()");
  expect(bought(addon).length, "not enough gold for the next chunk (40 for the chunk, 30 left)").toBe(2);
  addon.eval(`${MC}.Buy(1, 0) ${MC}.Order(1, 0)`);
  addon.eval(`__gold = 10000 ${MC}.Buy(1, 8)`);
  setCombat(addon, true);
  addon.eval("__later[#__later]()");
  expect(bought(addon).length, "combat: no more").toBe(3);
  addon.eval(`${MC}.Buy(2, 1)`);
  expect(bought(addon).length, "in combat nothing starts").toBe(3);
  setCombat(addon, false);
  addon.eval(`__gold = 10000 ${MC}.Buy(2, 1) ${MC}.Buy(9, 1)`);
  expect(bought(addon).length, "an item that costs honor, and one that isn't there, aren't bought").toBe(3);
  addon.eval(`C_Timer = nil __bought = {} __gold = 10000 ${MC}.Buy(1, 8)`);
  expect(bought(addon), "a client without timers buys the chunks one after another").toEqual([[1, 20], [1, 20]]);
});

it("a Buy question answered after the merchant closed, or at another merchant, buys nothing and says so", () => {
  const addon = loggedIn(BUY_ENV);
  addon.fire("MERCHANT_SHOW");
  addon.eval("StackSplitFrame:Show()");
  press(addon, "max");
  addon.fire("MERCHANT_CLOSED");
  addon.click("Vanguard_Question.confirm");
  expect([bought(addon), chatHas(addon, /Nothing bought: the merchant closed or changed what it sells\./)], "closed: nothing, and chat says why").toEqual([{}, true]);
  addon.fire("MERCHANT_SHOW");
  addon.eval("StackSplitFrame:Show()");
  press(addon, "max");
  addon.fire("MERCHANT_CLOSED");
  addon.eval(`__wfgWorld.items[777] = { name = "TEST-ONLY Pricey", stack = 20 }
    __wfgWorld.merchant = { items = { { itemID = 777, name = "TEST-ONLY Pricey", price = 50000, stack = 1, maxStack = 20 } } }`);
  addon.fire("MERCHANT_SHOW");
  addon.click("Vanguard_Question.confirm");
  expect(bought(addon), "the next merchant's item at that place is never bought").toEqual({});
});

it("the tenth item on a merchant page gets Stack and Max too", () => {
  const water = `{ itemID = 159, name = "TEST-ONLY Water", price = 10, stack = 5, maxStack = 20 }`;
  const addon = loggedIn(BUY_ENV + `__wfgWorld.merchant = { items = { ${Array(10).fill(water).join(", ")} } } __owner("MerchantItem10ItemButton", 10)`);
  addon.fire("MERCHANT_SHOW");
  addon.eval("StackSplitFrame:Show()");
  expect([addon.eval("return ns.GetModule('Merchant').SplitIndex(StackSplitFrame)"), split(addon)], "MerchantItem10ItemButton is item 10").toEqual([10, [true, true, true, "Max 40 for 0s 80c"]]);
});
