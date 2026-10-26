// auctionsell: the Auction helper (Modules/AuctionHelper.lua) and its price store
// (Modules/AuctionPrices.lua), at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { SETUP_DONE, chatHas, isTok, loggedIn } from "./helpers.mjs";
import { luaValue } from "../lib/lua-emit.mjs";

// TEST-ONLY: a wall clock (a test moves __now), the tooltip data API the Tooltips module
// hooks, and a way to show an item's tooltip (the client's own price shown, so only the added
// lines are left), as [text, color] per line.
const AH_ENV = `
  __now = 1790000000
  time = function() return __now end
  __post = {}
  TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) __post[kind] = fn end }
  GameTooltip.GetItem = function(self) return "TEST-ONLY Item", self.__link end
  function __showItem(link)
    local tt = GameTooltip
    tt.__link, tt.__lines, tt.shownMoneyFrames = link, {}, 1
    __post[Enum.TooltipDataType.Item](tt)
    local out = {}
    for i, l in ipairs(tt.__lines) do out[i] = { l.text, { l.r, l.g, l.b } } end
    return out
  end
`;
const HELPER = "ns.GetModule('AuctionHelper')";
// The Shopping card's list (a table), and its results view.
const TABLE = `${HELPER}.shopCard.body.table`;
const VIEW = `${HELPER}.shopCard.view`;
// A logged-in addon at the TEST-ONLY auction house (extra Lua runs before login).
function atAuctionHouse(extra = "", opts) {
  const addon = loggedIn(AH_ENV + extra, opts);
  addon.world.openAuctionHouse();
  addon.update(0);
  return addon;
}
// Shop ---------------------------------------------------------------------------------------

// TEST-ONLY dusts: Strange Dust (a commodity) and a pouch named like it.
const DUSTS = `__wfgWorld.items[10940] = { name = "Strange Dust", icon = "TEST-ONLY-DUST", commodity = true }
  __wfgWorld.items[10941] = { name = "Strange Dust Pouch", icon = "TEST-ONLY-POUCH" }`;
// A shopping list `name` (made and picked) holding entries, given as a Lua list.
const makeList = (addon, name, entries) => addon.eval(`local AH = ${HELPER} AH.NewList("${name}") for _, e in ipairs(${entries}) do AH.AddEntry(e) end`);
// The queries sent, as "fn:what" (a browse's search text, else the first item key's itemID).
const sent = (addon) => addon.eval(`local out = {}
  for i, q in ipairs(__wfgWorld.ah.queries) do
    local a = q.args[1]
    out[i] = q.fn .. ":" .. tostring(type(a) == "table" and (a.searchString or a.itemID or (a[1] and a[1].itemID)) or "")
  end
  return out`);
// The Lists pane's entries, by name.
const choices = (addon) => addon.eval(`local c = {} for i, e in ipairs(${HELPER}.PaneEntries()) do c[i] = e.name end return c`);
// The results view: shown, the item's name, the status line, and its rows shown as [price, quantity, time left, marked].
const view = (addon) => addon.eval(`local f = ${VIEW} local rows = {}
  for i, r in ipairs(f.table.rows) do if r:IsShown() then rows[i] = { r.cells.price:GetText(), r.cells.qty:GetText(), r.cells.time:GetText(), r.rail:IsShown() } end end
  return { f:IsShown(), f.name:GetText() or false, f.table.status:GetText() or false, rows }`);
// Eight TEST-ONLY dust listings (unit price, quantity, seconds left) and one with a hidden price.
const DUST_LISTINGS = `__wfgWorld.ah.commodities[10940] = {
  { unitPrice = 1300, quantity = 200, timeLeftSeconds = 40000 }, { unitPrice = 1250, quantity = 20, timeLeftSeconds = 3000 },
  { unitPrice = 1399, quantity = 5, timeLeftSeconds = 100000 }, { unitPrice = __wfgWorld.secret(1), quantity = 1 },
  { unitPrice = 1450, quantity = 1, timeLeftSeconds = 7200 }, { unitPrice = 1500, quantity = 60 },
  { unitPrice = 1990, quantity = 12, timeLeftSeconds = 9000 }, { unitPrice = 2500, quantity = 3, timeLeftSeconds = 30 },
  { unitPrice = 1250, quantity = 7, timeLeftSeconds = 600 } }`;
// A list with Strange Dust searched (found up at 12s 50c).
function dustFound(addon) {
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust" }');
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 290 } }");
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.advance(1);
}
// Sell ---------------------------------------------------------------------------------------

// TEST-ONLY bags: 20 Strange Dust (a commodity) in bag 0 slot 1, a blade (an item) in slot 2,
// and the game's names for the auction lengths.
const BAGS = `${DUSTS}
  __wfgWorld.items[9999] = { name = "TEST-ONLY Blade", icon = "TEST-ONLY-BLADE", level = 25, suffix = 7 }
  __wfgWorld.bags[0][1] = { itemID = 10940, count = 20 }
  __wfgWorld.bags[0][2] = { itemID = 9999, count = 1 }
  AUCTION_DURATION_ONE, AUCTION_DURATION_TWO = "TEST-ONLY 12 Hours", "TEST-ONLY 24 Hours"`;
// Competing dust: 100 and 120 a unit, and your own at 95.
const DUST_UP = `__wfgWorld.ah.commodities[10940] = { { unitPrice = 100, quantity = 5 }, { unitPrice = 120, quantity = 3 },
  { unitPrice = 95, quantity = 2, containsOwnerItem = true } }`;
const CARD = `${HELPER}.sellCard`;
// Drops the item in bag 0 `slot` on the sell slot (picked up first), and answers its price check with `event`.
function dropAndAnswer(addon, slot, event, payload) {
  addon.eval(`__wfgWorld.cursor = { type = "item", id = 0, bag = 0, slot = ${slot} }`);
  addon.click(`${CARD}.slot`);
  addon.fire(event, payload);
}
// The sell card's values (cheapest now, 7-day low, deposit, your price), its icon, and whether Post works.
const card = (addon) => addon.eval(`local c = ${CARD} local v = {}
  for i, l in ipairs(c.lines) do v[i] = l.value:GetText() end
  return { v, c.icon:GetTexture() or false, c.post:IsEnabled() }`);
// The restricted calls so far, as [fn, clicked, args...] (an item location as "bag:slot").
const restrictedLog = (addon) => list(addon.eval(`local out = {}
  for i, c in ipairs(__wfgWorld.ah.restricted) do
    local row = { c.fn, c.clicked }
    for j = 1, 5 do local a = c.args[j] row[#row + 1] = type(a) == "table" and (a.bagID .. ":" .. a.slotIndex) or (a == nil and "nil" or a) end
    out[i] = row
  end
  return out`));
// A Lua list as a JS array (an empty Lua table comes back as {}).
const list = (v) => (Array.isArray(v) ? v : []);
it("the sell card suggests an undercut", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.stackMax`);
  const q = addon.eval("local q = __wfgWorld.ah.queries[1] return { q.fn, q.args[1].itemID, q.args[1].itemLevel, q.args[3] }");
  expect(q, "a sell search for the dust, owner listings apart").toEqual(["SendSellSearchQuery", 10940, 0, true]);
  expect(card(addon), "cheapest 100 (your 95 left out), which the 7-day low now has too; 1 silver under, but not under 1 silver; deposit for 20").toEqual([["1s 0c", "1s 0c", "3s 0c · TEST-ONLY 12 Hours", "1s 0c"], "TEST-ONLY-DUST", true]);
  const prices = [1, 3, 4].map((i) => { addon.click(`${CARD}.undercut.segments[${i}]`); return card(addon)[0][3]; });
  expect(prices, "copper, percent, match").toEqual(["99c", "99c", "1s 0c"]);
  expect(addon.eval("return ns.Settings('AuctionHelper').undercut"), "the rule is the setting").toBe("match");
  addon.eval("__wfgWorld.ah.copper = false __wfgWorld.ah.deposit = 7");
  addon.click(`${CARD}.undercut.segments[1]`);
  expect(card(addon)[0].slice(2), "no copper on this client: whole silver up, deposit too").toEqual(["2s 0c · TEST-ONLY 12 Hours", "1s 0c"]);
});
it("posting calls the right function from a click, never from a timer", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.stackMax`);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon), "the stack of 20 (in one: the stack size's Max) at 1s a unit, for the first length").toEqual([["PostCommodity", true, "0:1", 1, 20, 100, "nil"]]);
  expect(card(addon), "the card is empty again").toEqual([["", "", "", ""], false, false]);
  addon.advance(5);
  addon.world.fireAuctionEvents({ itemID: 10940 }, 10940);
  addon.advance(5);
  expect(restrictedLog(addon).length, "nothing more without a click").toBe(1);
  addon.eval("SetCVar('auctionHouseDurationDropdown', 2) __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 }, { buyoutAmount = 9000, quantity = 2 }, { minBid = 10, quantity = 1 }, { buyoutAmount = 10, quantity = 0 } }");
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.advance(1);
  addon.world.postFromBag(0, 2);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(card(addon)[0], "an item: 4500 each for the pair is cheapest, and the 7-day low").toEqual(["45s 0c", "45s 0c", "30c · TEST-ONLY 24 Hours", "44s 0c"]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon)[1], "one blade, buyout only, for the second length").toEqual(["PostItem", true, "0:2", 2, 1, "nil", 4400]);
  expect(addon.eval("return __wfgWorld.ah.postItem.slotIndex"), "the game's own SetPostItem still ran").toBe(2);
});
it("a true return asks for a confirm, and the next click on Post (Confirm) confirms it", () => {
  const addon = atAuctionHouse(BAGS + "__wfgWorld.ah.needsConfirm = true __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.click(`${CARD}.post`);
  // Post's label and state, and the guide's line.
  const asking = () => addon.eval(`local c = ${CARD} return { c.post.text:GetText(), c.post:IsEnabled(), c.guide:GetText() }`);
  expect([chatHas(addon, /the game asks you to confirm this price/), card(addon)[1], asking()], "says so, keeps the item, and Post reads Confirm").toEqual([true, "TEST-ONLY-BLADE", ["Confirm", true, "The game asks you to confirm this price: click Confirm."]]);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.advance(5);
  expect(restrictedLog(addon).map((c) => c[0]), "posted once, nothing confirmed without a click").toEqual(["PostItem"]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon).map((c) => c.slice(0, 7)), "the click confirms the same post").toEqual([["PostItem", true, "0:2", 1, 1, "nil", 4900], ["ConfirmPostItem", true, "0:2", 1, 1, "nil", 4900]]);
  expect([card(addon)[1], form(addon)[7], asking()[0]], "the blade is listed: the card empties, Post again").toEqual([false, "posted 1 of 1", "Post"]);
});
it("a price typed after the game asks to confirm turns Confirm back into Post, and the next click posts the new price", () => {
  const addon = atAuctionHouse(BAGS + "__wfgWorld.ah.needsConfirm = true __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.type(`${CARD}.price`, "15s");
  addon.click(`${CARD}.post`);
  addon.type(`${CARD}.price`, "15g");
  const label = addon.eval(`return ${CARD}.post.text:GetText()`);
  addon.click(`${CARD}.post`);
  const calls = restrictedLog(addon).map((c) => [c[0], c[6]]);
  expect([label, calls], "Post again, and the 15g price goes through PostItem, never a stale confirm").toEqual(["Post", [["PostItem", 1500], ["PostItem", 150000]]]);
});
it("a new undercut rule after the game asks to confirm turns Confirm back into Post", () => {
  const addon = atAuctionHouse(BAGS + "__wfgWorld.ah.needsConfirm = true __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.click(`${CARD}.post`);
  addon.eval(`local AH = ${HELPER} AH.settings.undercut = "match" AH.PaintSell()`);
  const asking = addon.eval(`local c = ${CARD} return { c.post.text:GetText(), c.guide:GetText() }`);
  expect(asking, "the suggestion moved to 50s, so the held 49s confirm no longer applies").toEqual(["Post", "Click Post to list stack 1 of 1."]);
});
it("the addon never writes into the game's auction window", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP);
  // The window's own fields (not the stub's), sorted.
  const fields = () => addon.eval("local out = {} for k in pairs(AuctionHouseFrame) do if type(k) == 'string' and k:sub(1, 2) ~= '__' then out[#out + 1] = k end end table.sort(out) return out");
  const before = fields();
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.post`);
  addon.world.postFromBag(0, 2);
  addon.world.fireAuctionEvents({ itemID: 9999 }, 9999);
  addon.world.closeAuctionHouse();
  expect(fields(), "the same fields: only SetPostItem, post-hooked").toEqual(before);
});
it("what the sell card won't take, and when it can't post", () => {
  const addon = atAuctionHouse(BAGS + "__wfgWorld.items[777] = { name = 'TEST-ONLY Bound', noAuction = true } __wfgWorld.bags[0][3] = { itemID = 777 } __wfgWorld.bags[0][4] = { itemID = 4242 }");
  addon.click(`${CARD}.slot`);
  for (const slot of [3, 4, 9]) addon.world.postFromBag(0, slot);
  expect([card(addon)[1], addon.eval("return #__wfgWorld.ah.queries")], "nothing on the cursor, a bound item, one the client doesn't know, an empty slot").toEqual([false, 0]);
  addon.eval("__wfgWorld.ah.ready = false");
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.stackMax`);
  expect([card(addon)[0], card(addon)[2], addon.eval("return __wfgWorld.cursor")], "nothing up, no 7-day low: no price, no Post; the cursor emptied").toEqual([["none up", "none", "3s 0c · TEST-ONLY 12 Hours", ""], false, null]);
  addon.eval(`ns.AuctionPrices.Record(10940, 300, __now) ${HELPER}.PaintSell()`);
  expect([card(addon)[0][3], card(addon)[2]], "the 7-day low gives a price; Post waits for the game").toEqual(["2s 0c", false]);
  addon.eval(`${HELPER}.Post()`);
  addon.eval("__wfgWorld.ah.ready = true");
  addon.fire("AUCTION_HOUSE_THROTTLED_SYSTEM_READY");
  expect([card(addon)[2], restrictedLog(addon).length], "ready again: Post works (nothing was posted while it wasn't)").toEqual([true, 0]);
});
it("hidden numbers and stray results", () => {
  const addon = atAuctionHouse(BAGS + `__wfgWorld.ah.commodities[10940] = { { unitPrice = __wfgWorld.secret(1), quantity = 5 }, { unitPrice = 400, quantity = 1 } }
    C_AuctionHouse.CalculateCommodityDeposit = function() return __wfgWorld.secret(1) end
    C_Item.GetStackCount = function() return __wfgWorld.secret(20) end
    SetCVar("auctionHouseDurationDropdown", 7)`);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 555);
  expect(card(addon)[0][0], "results for another item aren't the card's").toBe("...");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect([card(addon)[0], addon.eval("return #ns.errors")], "the hidden price skipped (the 7-day low takes the plain one), no deposit shown, no error").toEqual([["4s 0c", "4s 0c", "", "3s 0c"], 0]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon)[0], "a hidden stack size posts one; an unknown length is the first").toEqual(["PostCommodity", true, "0:1", 1, 1, 300, "nil"]);
});
it("stack presets for vanilla: by item class and subclass, else one", () => {
  const addon = loggedIn(AH_ENV + `
    __wfgWorld.items[9001] = { name = "TEST-ONLY Potion", classID = 0, subClassID = 1 }
    __wfgWorld.items[9002] = { name = "TEST-ONLY Elixir", classID = 0, subClassID = 2 }
    __wfgWorld.items[9003] = { name = "TEST-ONLY Flask", classID = 0, subClassID = 3 }
    __wfgWorld.items[9004] = { name = "TEST-ONLY Scroll", classID = 0, subClassID = 4 }
    __wfgWorld.items[9005] = { name = "TEST-ONLY Leather", classID = 7, subClassID = 6 }
    __wfgWorld.items[9006] = { name = "TEST-ONLY Ore", classID = 7, subClassID = 7 }
    __wfgWorld.items[9007] = { name = "TEST-ONLY Herb", classID = 7, subClassID = 9 }
    __wfgWorld.items[9008] = { name = "TEST-ONLY Dust", classID = 7, subClassID = 12 }
    __wfgWorld.items[9009] = { name = "TEST-ONLY Hidden", classID = __wfgWorld.secret(7), subClassID = 5 }`);
  const presets = addon.eval(`local out = {} for i, id in ipairs({ 2589, 159, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 6948, 4242, 9009, "item:2589" }) do out[i] = ${HELPER}.StackPreset(id) end return out`);
  expect(presets, "cloth, food, potion, elixir, flask, scroll, leather, ore, herb 20/5; dust, a hearthstone, an unknown item, a hidden class 1; a link works").toEqual([20, 20, 5, 5, 5, 5, 20, 20, 20, 1, 1, 1, 1, 20]);
});
// TEST-ONLY linen as a commodity: 20 in bag 0 slot 3, 20 in bag 1 slot 1 and 5 in bag 1 slot 2; someone asks 2s a unit.
const LINEN_BAGS = `__wfgWorld.items[2589].commodity = true
  __wfgWorld.bags[0][3] = { itemID = 2589, count = 20 }
  __wfgWorld.bags[1][1] = { itemID = 2589, count = 20 }
  __wfgWorld.bags[1][2] = { itemID = 2589, count = 5 }
  __wfgWorld.ah.commodities[2589] = { { unitPrice = 200, quantity = 10 } }`;
// The sell form: [quantity, stack size, stacks, price box, bid box, bid shown, toggle, count line].
const form = (addon) => addon.eval(`local c = ${CARD}
  return { c.qty:GetText(), c.stack:GetText(), c.stacks:GetText(), c.price:GetText(), c.bid:GetText(), c.bid:IsShown(), c.perStack.text:GetText(), c.status:GetText() }`);
it("the sell form: quantity and stack size with Max, the preset stack, one stack posted per click and the next loaded", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  expect(form(addon), "the dropped stack, cloth's preset of 20: one stack; no bid for a commodity").toEqual(["20", "20", "1", "1s 0c", "", false, "per unit", "posted 0 of 1"]);
  addon.click(`${CARD}.qtyMax`);
  expect(form(addon).slice(0, 3), "Max: all 45 in the bags, three stacks").toEqual(["45", "20", "3"]);
  addon.click(`${CARD}.post`);
  expect([restrictedLog(addon), form(addon)[7]], "the first stack of 20, from the click").toEqual([[["PostCommodity", true, "0:3", 1, 20, 100, "nil"]], "posted 1 of 3"]);
  addon.eval("__wfgWorld.bags[0][3] = nil");
  addon.click(`${CARD}.post`);
  addon.eval("__wfgWorld.bags[1][1] = nil");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(card(addon)[0][2], "the deposit is the next stack's: the last 5").toBe("75c · TEST-ONLY 12 Hours");
  addon.advance(5);
  expect(restrictedLog(addon).length, "a timer posts nothing").toBe(2);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon).map((c) => [c[0], c[1], c[2], c[4]]), "each stack from the next bag slot, one call per click").toEqual([["PostCommodity", true, "0:3", 20], ["PostCommodity", true, "1:1", 20], ["PostCommodity", true, "1:2", 5]]);
  expect([card(addon), form(addon)[7]], "all up: the card empties and the line keeps the count").toEqual([[["", "", "", ""], false, false], "posted 3 of 3"]);
  addon.click(`${CARD}.post`);
  addon.world.fireAuctionEvents({ itemID: 2589 }, 2589);
  expect(restrictedLog(addon).length, "nothing left to post; events post nothing").toBe(3);
});
it("the sell form: typed counts and prices, per unit or per stack, Skip and Stop", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS);
  addon.type(`${CARD}.qty`, "12");
  expect(addon.eval(`return { ${HELPER}.sell == nil, #ns.errors }`), "nothing on the card: typing does nothing").toEqual([true, 0]);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.type(`${CARD}.qty`, "999");
  addon.type(`${CARD}.stack`, "10");
  expect(form(addon).slice(0, 3), "at most what can go up; stacks of 10").toEqual(["45", "10", "5"]);
  addon.type(`${CARD}.qty`, "TEST-ONLY");
  addon.type(`${CARD}.stacks`, "2");
  expect(form(addon).slice(0, 3), "a word changes nothing; two stacks make 20").toEqual(["20", "10", "2"]);
  addon.type(`${CARD}.price`, "1g 2s 3c");
  expect([form(addon)[3], card(addon)[0][3]], "a typed price per unit").toEqual(["1g 2s 3c", "1g 2s 3c"]);
  addon.click(`${CARD}.perStack`);
  expect([form(addon)[3], form(addon)[6]], "per stack: the box shows a stack's price").toEqual(["10g 20s 30c", "per stack"]);
  addon.type(`${CARD}.price`, "5s");
  expect(card(addon)[0][3], "5s for a stack of 10 is 50c a unit").toBe("50c");
  addon.type(`${CARD}.price`, "55c");
  expect([card(addon)[0][3], form(addon)[3]], "a stack price that doesn't divide is rounded up, never under what was typed (6c a unit, 60c a stack)").toEqual(["6c", "60c"]);
  addon.click(`${CARD}.perStack`);
  addon.type(`${CARD}.price`, "1.5");
  expect(card(addon)[0][3], "a bare number is gold, as in the shop's max price").toBe("1g 50s 0c");
  addon.type(`${CARD}.price`, "150c");
  expect(card(addon)[0][3], "copper takes its c").toBe("1s 50c");
  for (const text of ["", "12x", "0"]) {
    addon.type(`${CARD}.price`, text);
    expect(card(addon)[0][3], `"${text}": back to the suggestion`).toBe("1s 0c");
  }
  addon.click(`${CARD}.skip`);
  expect([form(addon)[7], restrictedLog(addon).length], "Skip passes a stack without posting it").toEqual(["posted 0 of 2", 0]);
  addon.click(`${CARD}.post`);
  expect([restrictedLog(addon)[0][4], card(addon)[1], form(addon)[7]], "the second stack goes up, and that's all").toEqual([10, false, "posted 1 of 2"]);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.click(`${CARD}.stop`);
  expect([card(addon)[1], form(addon)[7], addon.eval(`return { ${CARD}.stop:IsEnabled(), ${CARD}.skip:IsEnabled() }`)], "Stop empties the card").toEqual([false, "posted 0 of 1", [false, false]]);
  addon.click(`${CARD}.stackMax`);
  addon.eval(`${HELPER}.SkipStack() ${HELPER}.StopSelling()`);
  expect(addon.eval("return #ns.errors"), "Max, Skip and Stop with nothing on the card do nothing").toBe(0);
});
it("the sell form: an item's bid, and the auction length picked, remembered or fixed", () => {
  const addon = atAuctionHouse(BAGS + "AUCTION_DURATION_THREE = 'TEST-ONLY 48 Hours' __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(form(addon).slice(0, 6), "an item: one, one at a time, a bid box").toEqual(["1", "1", "1", "49s 0c", "", true]);
  addon.type(`${CARD}.bid`, "50s");
  expect(card(addon)[2], "a bid at or over the buyout: no Post").toBe(false);
  addon.type(`${CARD}.bid`, "10s");
  addon.click(`${CARD}.length`);
  addon.click(`${CARD}.length`);
  expect([card(addon)[0][2], card(addon)[2]], "the length picked on the card").toEqual(["45c · TEST-ONLY 48 Hours", true]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon)[0], "the blade, for 48 hours, with a 10s bid and a 49s buyout").toEqual(["PostItem", true, "0:2", 3, 1, 1000, 4900]);
  addon.eval("__wfgWorld.bags[0][2] = { itemID = 9999, count = 1 }");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect([card(addon)[0][2], addon.eval("return ns.Settings('AuctionHelper').lastDuration")], "the next item starts at the last length used").toEqual(["45c · TEST-ONLY 48 Hours", 3]);
  addon.eval("ns.Settings('AuctionHelper').duration = '2'");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(card(addon)[0][2], "a fixed length under Auction length").toBe("30c · TEST-ONLY 24 Hours");
  const choices = addon.eval(`local out = {} for i, c in ipairs(${HELPER}.DurationSettingChoices()) do out[i] = c[2] end return out`);
  expect(choices, "the option's choices: last used, then the game's names").toEqual(["Last used", "TEST-ONLY 12 Hours", "TEST-ONLY 24 Hours", "TEST-ONLY 48 Hours"]);
});
it("a fixed Auction length picked in the options survives the next login", () => {
  const first = loggedIn();
  first.eval(`for _, p in ipairs(ns.Options.PAGES) do if p.key == "town" then
    for _, r in ipairs(p.rows()) do if r[2] == "Auction length" then r[5](r[3][3][1]) end end end end`);
  const saved = first.eval("return VanguardDB.profiles.Default.AuctionHelper");
  const again = loggedIn("", { savedVariables: `VanguardDB.profiles.Default = { AuctionHelper = ${luaValue(saved)} }` });
  expect(again.eval("return ns.Settings('AuctionHelper').duration"), "24 hours, not put back to Last used").toBe("2");
});
it("the next stack is the same item: another variant or a locked slot is passed over", () => {
  const addon = atAuctionHouse(BAGS + `__wfgWorld.bags[1][1] = { itemID = 9999, count = 1 } __wfgWorld.bags[1][2] = { itemID = 9999, count = 1 }
    __wfgWorld.bags[1][3] = { itemID = 9999, count = 1 } __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }
    local key, info = C_AuctionHouse.GetItemKeyFromItem, C_Container.GetContainerItemInfo
    C_AuctionHouse.GetItemKeyFromItem = function(loc) local k = key(loc) if loc.bagID == 1 and loc.slotIndex == 1 then k.itemSuffix = 99 end return k end
    C_Container.GetContainerItemInfo = function(bag, slot) local i = info(bag, slot) if i and bag == 1 and slot == 2 then i.isLocked = true end return i end`);
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.click(`${CARD}.qtyMax`);
  addon.click(`${CARD}.post`);
  addon.eval("__wfgWorld.bags[0][2] = nil");
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon).map((c) => c[2]), "the blade in bag 0, then the one in bag 1 slot 3").toEqual(["0:2", "1:3"]);
  addon.eval("__wfgWorld.bags[1][3] = nil");
  addon.fire("BAG_UPDATE_DELAYED");
  expect([card(addon)[2], card(addon)[0][2], form(addon)[7], addon.eval(`return ${CARD}.guide:GetText()`)], "none left in the bags (the card follows the bags): no Post, no deposit, and the guide says why").toEqual([false, "", "posted 2 of 4", "It isn't in your bags now: put it on the card again."]);
});
// TEST-ONLY linen up now: someone's at 2s (2 hours left), yours at 2s 50c, someone's at 3s (20
// minutes left), and one with a hidden price.
const LINEN_UP = `__wfgWorld.ah.commodities[2589] = { { unitPrice = 200, quantity = 10, timeLeftSeconds = 7200 },
  { unitPrice = 250, quantity = 5, timeLeftSeconds = 7200, containsOwnerItem = true },
  { unitPrice = 300, quantity = 4, timeLeftSeconds = 1200 }, { unitPrice = __wfgWorld.secret(1), quantity = 1 } }`;
// The Up now card (the listings up for the item on the sell card), and its status line.
const UP = `${HELPER}.upCard`;
// The Up now card's status line.
const upStatus = (addon) => addon.eval(`return ${UP}.table.status:GetText()`);
// Listing row i on the Up now card: [shown, price, how many, time left, your flag shown].
const listingRow = (addon, i) => addon.eval(`local r = ${UP}.table.rows[${i}]
  return { r:IsShown(), r.cells.price:GetText() or false, r.cells.qty:GetText() or false, r.cells.time:GetText() or false, r.flag:IsShown() }`);
// The Up now table's status line: [its text, its font size, as the colour token].
const upTier = (addon) => {
  const t = addon.frame(`${UP}.table.status`);
  return [t.text, t.font.size, ["text2", "muted"].find((k) => isTok(addon, t.textColor, k))];
};
it("the Up now card's line is an empty-state line (label muted) without a sale, a status (small text2) while it searches or finds none", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + LINEN_UP);
  const [label, small] = addon.eval("return { ns.Theme.RoleSize('label'), ns.Theme.RoleSize('small') }");
  expect(upTier(addon), "nothing on the card: what to do").toEqual(["Put an item on the Sell card to see what's up now.", label, "muted"]);
  addon.eval(`__wfgWorld.cursor = { type = "item", id = 0, bag = 0, slot = 3 }`);
  addon.click(`${CARD}.slot`);
  expect(upTier(addon), "its price check sent: a status").toEqual(["searching...", small, "text2"]);
  addon.eval("__wfgWorld.ah.commodities[2589] = {}");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  expect(upTier(addon), "nothing up: a status").toEqual(["none up", small, "text2"]);
});
it("the Up now card lists what's up for the item on the sell card: price each, how many, time left, yours flagged; a click takes a price", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + LINEN_UP);
  expect(upStatus(addon), "nothing on the card: the line says so").toBe("Put an item on the Sell card to see what's up now.");
  addon.eval(`__wfgWorld.cursor = { type = "item", id = 0, bag = 0, slot = 3 }`);
  addon.click(`${CARD}.slot`);
  expect(upStatus(addon), "its price check sent").toBe("searching...");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  const rows = [1, 2, 3].map((i) => listingRow(addon, i));
  expect(rows, "cheapest first; the hidden price left out").toEqual([[true, "2s 0c", "x 10", "2 h", false], [true, "2s 50c", "x 5", "2 h", true], [true, "3s 0c", "x 4", "20 min", false]]);
  expect([listingRow(addon, 4)[0], upStatus(addon), addon.eval(`return ${UP}.table.heads[1].text:GetText()`)], "three rows under the headings, nothing to say").toEqual([false, "", "Price each"]);
  expect(isTok(addon, addon.eval(`return ${UP}.table.rows[2].flag.__vertexColor`), "accent"), "yours flagged in the accent").toBe(true);
  addon.click(`${UP}.table.rows[3]`);
  expect(card(addon)[0][3], "someone's 3s, less the undercut (1 silver)").toBe("2s 0c");
  addon.click(`${UP}.table.rows[2]`);
  expect(card(addon)[0][3], "your own 2s 50c, as it is").toBe("2s 50c");
  addon.click(`${CARD}.undercut.segments[1]`);
  addon.click(`${UP}.table.rows[1]`);
  expect([card(addon)[0][3], form(addon)[3]], "2s less 1 copper, in the price box too").toEqual(["1s 99c", "1s 99c"]);
  addon.click(`${CARD}.stop`);
  addon.click(`${UP}.table.rows[1]`);
  expect([listingRow(addon, 1)[0], addon.eval("return #ns.errors")], "no sale: no rows, a click does nothing").toEqual([false, 0]);
  addon.eval("__wfgWorld.ah.commodities[2589] = {} __wfgWorld.cursor = { type = 'item', id = 0, bag = 0, slot = 3 }");
  addon.click(`${CARD}.slot`);
  addon.advance(1);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  expect([listingRow(addon, 1)[0], upStatus(addon)], "none up now: the line says so").toEqual([false, "none up"]);
});
it("the listings scroll, and near the end the next page comes through the search queue", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + `__wfgWorld.ah.commodities[2589] = {}
    for i = 1, 6 do __wfgWorld.ah.commodities[2589][i] = { unitPrice = 100 * i, quantity = i } end
    __wfgWorld.ah.more[2589] = true`);
  addon.wheel(`${UP}.table`, -1);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.wheel(`${UP}.table.rows[1]`, -1);
  addon.wheel(`${UP}.table.rows[1]`, -1);
  expect([listingRow(addon, 1)[1], listingRow(addon, 6)[1], listingRow(addon, 7)[0], sent(addon)], "six listings fit the rows; near the end, the next page waits a second after the last search").toEqual(["1s 0c", "6s 0c", false, ["SendSellSearchQuery:2589"]]);
  addon.advance(1);
  addon.wheel(`${UP}.table.rows[1]`, -1);
  expect(sent(addon), "asked once, through the queue").toEqual(["SendSellSearchQuery:2589", "RequestMoreCommoditySearchResults:"]);
  expect(addon.eval("return __wfgWorld.ah.queries[2].args[1]"), "for the linen").toBe(2589);
  addon.eval("for i = 7, 8 do __wfgWorld.ah.commodities[2589][i] = { unitPrice = 100 * i, quantity = i } end __wfgWorld.ah.more[2589] = nil");
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 2589);
  addon.wheel(`${UP}.table.rows[1]`, -5);
  addon.advance(5);
  expect([listingRow(addon, 8)[1], sent(addon).length], "the page is in; all of it: nothing more asked").toEqual(["8s 0c", 2]);
  addon.wheel(`${UP}.table.rows[1]`, 10);
  expect(listingRow(addon, 1)[1], "back to the top").toBe("1s 0c");
});
it("an item's listings: the game's words for time left, a page more by item key, bid-only ones left out", () => {
  const addon = atAuctionHouse(BAGS + `TIME_LEFT_SHORT, TIME_LEFT_MEDIUM, TIME_LEFT_LONG, TIME_LEFT_VERY_LONG = "TEST-ONLY Short", "TEST-ONLY Medium", "TEST-ONLY Long", "TEST-ONLY Very long"
    __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1, timeLeft = 0 }, { buyoutAmount = 6000, quantity = 1, timeLeft = 3 },
      { minBid = 100, quantity = 1, timeLeft = 2 }, { buyoutAmount = 7000, quantity = 1, timeLeft = 1 }, { buyoutAmount = 8000, quantity = 1, timeLeft = 2 },
      { buyoutAmount = 9000, quantity = 1, timeLeft = 9 }, { buyoutAmount = 9500, quantity = 1, timeLeftSeconds = 30 } }
    __wfgWorld.ah.more[9999] = true`);
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect([1, 2, 3, 4].map((i) => listingRow(addon, i).slice(1, 4)), "by band").toEqual([["50s 0c", "x 1", "TEST-ONLY Short"], ["60s 0c", "x 1", "TEST-ONLY Very long"], ["70s 0c", "x 1", "TEST-ONLY Medium"], ["80s 0c", "x 1", "TEST-ONLY Long"]]);
  addon.advance(1);
  addon.wheel(`${UP}.table.rows[1]`, -5);
  expect([listingRow(addon, 5)[3], listingRow(addon, 6)[3]], "a band the game doesn't name: nothing; seconds: at least a minute").toEqual(["", "1 min"]);
  expect(sent(addon).at(-1), "the next page by the item's key").toBe("RequestMoreItemSearchResults:9999");
  addon.eval("__wfgWorld.ah.more[9999] = nil table.insert(__wfgWorld.ah.items[9999], { buyoutAmount = 9900, quantity = 1, timeLeft = 3 })");
  addon.fire("ITEM_SEARCH_RESULTS_ADDED", { itemID: 9999 });
  addon.wheel(`${UP}.table.rows[1]`, -5);
  expect(listingRow(addon, 7)[1], "the page is in").toBe("99s 0c");
});
it("the shop's view and the sell card share the search events: each search and each page reaches its own card", () => {
  const addon = atAuctionHouse(BAGS + DUST_LISTINGS + " __wfgWorld.ah.more[10940] = true");
  dustFound(addon);
  addon.click(`${TABLE}.rows[1]`);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  // How many listings the sell card holds.
  const saleRows = () => addon.eval(`return #${HELPER}.sell.rows`);
  // The kind of the search in flight, or false.
  const pending = () => addon.eval(`local s = ${HELPER}.pending return s and (s.listings and "listings" or s.sell and "sell" or s.page and "page" or s.more and "more") or false`);
  expect([view(addon)[3][0][0], listingRow(addon, 1)[0], pending(), sent(addon).slice(-1)], "the view's search answered; the sell card's waits its second").toEqual(["12s 50c", false, false, ["SendSearchQuery:10940"]]);
  addon.advance(1);
  expect(pending(), "then the sell card's price check").toBe("sell");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect([saleRows(), card(addon)[0][0], pending()], "it reaches the sell card").toEqual([8, "12s 50c", false]);
  addon.advance(1);
  addon.wheel(`${VIEW}.table`, -1);
  addon.wheel(`${UP}.table.rows[1]`, -5);
  expect([pending(), addon.eval(`return #${HELPER}.queue`), sent(addon).slice(-1)], "the view's page in flight, the sell card's queued behind it").toEqual(["page", 1, ["RequestMoreCommoditySearchResults:"]]);
  addon.eval("table.insert(__wfgWorld.ah.commodities[10940], { unitPrice = 1000, quantity = 4, timeLeftSeconds = 600 }) __wfgWorld.ah.more[10940] = nil");
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 10940);
  addon.wheel(`${VIEW}.table`, 10);
  expect([view(addon)[3][0][0], saleRows(), card(addon)[0][0], pending()], "the page reaches the view, not the sell card").toEqual(["10s 0c", 8, "12s 50c", false]);
  addon.advance(1);
  expect([pending(), sent(addon).filter((x) => x.startsWith("RequestMore")).length], "then the sell card's page").toEqual(["more", 2]);
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 10940);
  expect([saleRows(), card(addon)[0][0], pending(), addon.eval("return #ns.errors")], "it reaches the sell card").toEqual([9, "10s 0c", false, 0]);
});
// The price line: [label, value, label in "bad", value in "bad"].
const priceLine = (addon) => {
  const [label, value, labelColor, valueColor] = addon.eval(`local l = ${CARD}.lines[4] return { l:GetText(), l.value:GetText(), l.__textColor, l.value.__textColor }`);
  return [label, value, isTok(addon, labelColor, "bad"), isTok(addon, valueColor, "bad")];
};
it("vendor floor: the price line turns red under the vendor's price, and Post waits unless the option is off", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  expect([priceLine(addon), card(addon)[2]], "1s a unit is over linen's 13c").toEqual([["Your price", "1s 0c", false, false], true]);
  addon.type(`${CARD}.price`, "12c");
  expect([priceLine(addon), card(addon)[2]], "12c is under it: red, and no Post").toEqual([["Under vendor price", "12c", true, true], false]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon).length, "nothing posted").toBe(0);
  addon.type(`${CARD}.price`, "13c");
  expect([priceLine(addon), card(addon)[2]], "at the vendor's price: fine").toEqual([["Your price", "13c", false, false], true]);
  addon.eval("ns.Settings('AuctionHelper').vendorFloor = false");
  addon.type(`${CARD}.price`, "11c");
  expect([priceLine(addon)[2], card(addon)[2]], "the option off: still red, but Post works").toEqual([true, true]);
  addon.click(`${CARD}.post`);
  expect([restrictedLog(addon)[0].slice(0, 6), priceLine(addon)], "posted at 11c; the card empties").toEqual([["PostCommodity", true, "0:3", 1, 20, 11], ["Your price", "", false, false]]);
});
it("vendor floor: an item the vendor won't buy, or a hidden vendor price, is never under", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + "__wfgWorld.items[2589].sellPrice = __wfgWorld.secret(13) __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.type(`${CARD}.price`, "1c");
  expect([priceLine(addon)[2], card(addon)[2], addon.eval("return #ns.errors")], "hidden: not red, Post works, no error").toEqual([false, true, 0]);
  addon.advance(1);
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.type(`${CARD}.price`, "1c");
  expect([priceLine(addon)[2], card(addon)[2]], "no vendor price (0): never under").toEqual([false, true]);
  expect(addon.eval(`return ${HELPER}.VendorPrice(424242)`), "an item the client doesn't know").toBe(null);
});
// Your auctions ------------------------------------------------------------------------------

// TEST-ONLY auctions of yours: 5 dust at 1s 50c a unit, a blade at 40s, and three the check
// leaves out (sold, bid only, a hidden buyout).
const OWNED = `__wfgWorld.ah.owned = {
  { auctionID = 501, itemKey = { itemID = 10940 }, status = 0, quantity = 5, buyoutAmount = 150 },
  { auctionID = 502, itemKey = { itemID = 9999 }, status = 0, quantity = 1, buyoutAmount = 4000 },
  { auctionID = 503, itemKey = { itemID = 9999 }, status = 1, quantity = 1, buyoutAmount = 4000 },
  { auctionID = 504, itemKey = { itemID = 9999 }, status = 0, quantity = 1, bidAmount = 300 },
  { auctionID = 505, itemKey = { itemID = 9999 }, status = 0, quantity = 1, buyoutAmount = __wfgWorld.secret(1) } }
  __wfgWorld.ah.commodities[10940] = { { unitPrice = 120, quantity = 7 }, { unitPrice = 150, quantity = 5, containsOwnerItem = true } }
  __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }
  __wfgWorld.ah.cancelCost = 100`;
const OWNED_CARD = `${HELPER}.ownedCard`;
// Owned row i: [shown, name, price, undercut flag shown].
const ownedRow = (addon, i) => addon.eval(`local r = ${OWNED_CARD}.table.rows[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.cells.price:GetText() or false, r.flag:IsShown() }`);
// Check undercuts, the auctions arriving, and each price check answered a second apart.
function checkUndercuts(addon) {
  addon.click(`${OWNED_CARD}.check`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.advance(1);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.advance(1);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
}
it("undercut check marks the undercut auction and Cancel is per click", () => {
  const addon = atAuctionHouse(BAGS + OWNED);
  checkUndercuts(addon);
  expect(sent(addon), "your auctions, then each item once").toEqual(["QueryOwnedAuctions:", "SendSellSearchQuery:10940", "SendSellSearchQuery:9999"]);
  expect([ownedRow(addon, 1), ownedRow(addon, 2), ownedRow(addon, 3), ownedRow(addon, 4)[0]], "the dust is undercut (1s 20c against your 1s 50c), the blade isn't; the sold blade shows as sold").toEqual([[true, "Strange Dust", "1s 50c", true], [true, "TEST-ONLY Blade", "40s 0c", false], [true, "TEST-ONLY Blade", "sold · 40s 0c", false], false]);
  expect(isTok(addon, addon.eval(`return ${OWNED_CARD}.table.rows[1].flag.__vertexColor`), "bad"), "the mark is red").toBe(true);
  addon.hover(`${OWNED_CARD}.table.rows[1].cancel`);
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "what cancelling costs").toEqual(["Cancel this auction", "Costs 1s 0c"]);
  addon.hover(null);
  addon.click(`${OWNED_CARD}.table.rows[1].cancel`);
  expect(restrictedLog(addon), "cancelled once, from the click").toEqual([["CancelAuction", true, 501, "nil", "nil", "nil", "nil"]]);
  addon.fire("AUCTION_CANCELED", 501);
  expect([ownedRow(addon, 1)[1], ownedRow(addon, 2)[2], ownedRow(addon, 3)[0]], "its row goes").toEqual(["TEST-ONLY Blade", "sold · 40s 0c", false]);
});

// The addon on a client of `locale` with the text-fit audit, the Posting tab shown (a stack of dust in bag 0 slot 1).
function postingTab(locale) {
  const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE });
  addon.eval(AH_ENV + "__wfgWorld.items[10940] = { name = 'Strange Dust', icon = 'TEST-ONLY-DUST', commodity = true }");
  addon.login();
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.eval("__wfgStub.click(AuctionHouseFrame.Tabs[5])");
  return addon;
}
it("the sell card's Post, Stop, Skip and Max buttons and the guide's steps fit in real translations", () => {
  for (const locale of ["frFR", "deDE", "ruRU", "itIT", "esES"]) {
    const addon = postingTab(locale);
    expect(addon.textFit(CARD), `${locale}: nothing on the sell card is cut or overlaps`).toEqual([]);
    const steps = addon.eval(`local s = ${CARD}.steps return { s[1]:GetRight() < s[2]:GetLeft(), s[2]:GetRight() < s[3]:GetLeft(), s[3]:GetRight() < s[4]:GetLeft() }`);
    expect(steps, `${locale}: each guide step ends before the next`).toEqual([true, true, true]);
  }
});

it("the scan button holds its countdown in Russian, French and Portuguese", () => {
  for (const locale of ["ruRU", "frFR", "ptBR"]) {
    const addon = postingTab(locale);
    addon.eval(`${HELPER}.refusedAt = ns.AuctionPrices.Now() ${HELPER}.PaintScan()`);
    expect(addon.eval(`return ${HELPER}.scanCard.scan.text:GetText():find('15') ~= nil`), `${locale}: the countdown is on the button`).toBe(true);
    addon.eval("__wfgStub.click(AuctionHouseFrame.Tabs[4])");
    expect(addon.textFit(`${HELPER}.scanCard`), `${locale}: the countdown is not cut`).toEqual([]);
  }
});

it("the Your auctions toolbar holds Check undercuts and Cancel next undercut in real translations, clear of the summary (P10-5)", () => {
  for (const locale of ["frFR", "deDE", "ruRU", "itIT", "esES", "ptBR"]) {
    const addon = postingTab(locale);
    expect(addon.eval(`return ${OWNED_CARD}.cancelNext:GetLeft() ~= nil`), `${locale}: before a check (no line yet) Cancel next undercut still has its place`).toBe(true);
    addon.eval(`${HELPER}.checked = true ${HELPER}.PaintOwned()`);
    expect(addon.eval(`return ${OWNED_CARD}.summary:GetText()`), `${locale}: the line beside the heading is up`).not.toBe("");
    const labels = addon.eval(`local c = ${OWNED_CARD} return { c.check.text:GetText(), c.cancelNext.text:GetText() }`);
    const cut = addon.textFit(OWNED_CARD).filter((f) => labels.includes(f.text));
    expect(cut, `${locale}: neither label is cut`).toEqual([]);
    const room = addon.eval(`local c = ${OWNED_CARD} return { c.summary:GetRight() <= c.cancelNext:GetLeft(), c.cancelNext:GetRight() <= c.check:GetLeft(), c.check:GetRight() <= c:GetRight() }`);
    expect(room, `${locale}: summary, Cancel next, Check undercuts in a row inside the card`).toEqual([true, true, true]);
  }
});

it("the Lists pane's action buttons hold their labels in German and Russian, two to a row in three rows (P10-6)", () => {
  for (const locale of ["deDE", "ruRU"]) {
    const addon = postingTab(locale);
    addon.eval("__wfgStub.click(AuctionHouseFrame.Tabs[4])");
    const labels = addon.eval(`local out = {} for i, b in ipairs(${HELPER}.pane.actions) do out[i] = b.text:GetText() end return out`);
    expect(addon.textFit(`${HELPER}.pane`).filter((f) => labels.includes(f.text)), `${locale}: no action label is cut`).toEqual([]);
    const grid = addon.eval(`local a = ${HELPER}.pane.actions return { a[1]:GetLeft() == a[3]:GetLeft(), a[2]:GetLeft() > a[1]:GetRight(), a[3]:GetTop() < a[1]:GetBottom(), a[5]:GetTop() < a[3]:GetBottom(), a[6]:GetRight() <= ${HELPER}.pane:GetRight() }`);
    expect(grid, `${locale}: columns line up, rows step down, the last button stays inside the pane`).toEqual([true, true, true, true, true]);
  }
});

it("the filter dialog's Quality caption sits on one line beside its dropdown in every language (leftover from P10-9's round)", () => {
  for (const locale of ["enUS", "deDE", "ruRU", "ptBR", "frFR"]) {
    const addon = postingTab(locale);
    addon.eval(`${HELPER}.NewList("TEST-ONLY A") ${HELPER}.AddEntry("Strange Dust", "TEST-ONLY A") ${HELPER}.EditFilters("TEST-ONLY A", 1)`);
    const caption = addon.eval("local q = Vanguard_AuctionFilters.quality return { q.label:GetText(), q.label:GetStringHeight() <= ns.Theme.RoleSize('label') * 1.5, q.label:GetRight() <= q.dropdown:GetLeft() }");
    expect(caption.slice(1), `${locale}: ${caption[0]} is one line and ends before the dropdown`).toEqual([true, true]);
    expect(addon.textFit("Vanguard_AuctionFilters").filter((f) => f.text === caption[0]), `${locale}: and is not cut`).toEqual([]);
  }
});

it("the Lists toolbar buttons hold their labels in French and German", () => {
  for (const locale of ["frFR", "deDE"]) {
    const addon = postingTab(locale);
    addon.eval("__wfgStub.click(AuctionHouseFrame.Tabs[4])");
    const toolbar = addon.textFit(`${HELPER}.shopCard`);
    expect(toolbar, `${locale}: nothing on the shopping card is cut`).toEqual([]);
  }
});
