// auction-sell: the sell card and sell form: undercuts, posting, stack presets, counts and prices,
// and the search events it shares with the shop, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";
import { AH_ENV, BAGS, CARD, DUST_LISTINGS, DUST_UP, HELPER, LINEN_BAGS, atAuctionHouse, card, choices, dropAndAnswer, dustFound, restrictedLog, sent, view } from "./auction-env.mjs";

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

it("a true return waits for the game's confirmation", () => {
  const addon = atAuctionHouse(BAGS + "__wfgWorld.ah.needsConfirm = true __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.click(`${CARD}.post`);
  expect([chatHas(addon, /The game wants this price confirmed/), card(addon)[1]], "says so and keeps the item").toEqual([true, "TEST-ONLY-BLADE"]);
  addon.world.fireAuctionEvents({ itemID: 9999 }, 9999);
  addon.advance(5);
  expect(restrictedLog(addon).map((c) => c[0]), "posted once, never confirmed by the addon").toEqual(["PostItem"]);
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
  addon.eval("ns.Settings('AuctionHelper').duration = 2");
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(card(addon)[0][2], "a fixed length under Auction length").toBe("30c · TEST-ONLY 24 Hours");
  const choices = addon.eval(`local out = {} for i, c in ipairs(${HELPER}.DurationChoices(true)) do out[i] = c[2] end return out`);
  expect(choices, "the option's choices: last used, then the game's names").toEqual(["Last used", "TEST-ONLY 12 Hours", "TEST-ONLY 24 Hours", "TEST-ONLY 48 Hours"]);
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
  expect([card(addon)[2], card(addon)[0][2], form(addon)[7]], "none left in the bags (the card follows the bags): no Post, no deposit").toEqual([false, "", "posted 2 of 4"]);
});

// TEST-ONLY linen up now: someone's at 2s (2 hours left), yours at 2s 50c, someone's at 3s (20
// minutes left), and one with a hidden price.
const LINEN_UP = `__wfgWorld.ah.commodities[2589] = { { unitPrice = 200, quantity = 10, timeLeftSeconds = 7200 },
  { unitPrice = 250, quantity = 5, timeLeftSeconds = 7200, containsOwnerItem = true },
  { unitPrice = 300, quantity = 4, timeLeftSeconds = 1200 }, { unitPrice = __wfgWorld.secret(1), quantity = 1 } }`;

// Listing row i: [shown, price, how many, time left, your mark shown].
const listingRow = (addon, i) => addon.eval(`local r = ${CARD}.listings[${i}]
  return { r:IsShown(), r.price:GetText() or false, r.qty:GetText() or false, r.time:GetText() or false, r.mark:IsShown() }`);

it("the sell card lists what's up now: price each, how many, time left, yours marked; a click takes a price", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + LINEN_UP);
  expect(addon.eval(`return ${CARD}.listHead:IsShown()`), "nothing on the card: no header").toBe(false);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  const rows = [1, 2, 3].map((i) => listingRow(addon, i));
  expect(rows, "cheapest first; the hidden price left out").toEqual([[true, "2s 0c", "x 10", "2 h", false], [true, "2s 50c", "x 5", "2 h", true], [true, "3s 0c", "x 4", "20 min", false]]);
  expect([listingRow(addon, 4)[0], addon.eval(`return ${CARD}.listHead:IsShown()`)], "three rows, and the header").toEqual([false, true]);
  expect(isTok(addon, addon.eval(`return ${CARD}.listings[2].mark.__vertexColor`), "accent"), "yours marked in the accent").toBe(true);
  addon.click(`${CARD}.listings[3]`);
  expect(card(addon)[0][3], "someone's 3s, less the undercut (1 silver)").toBe("2s 0c");
  addon.click(`${CARD}.listings[2]`);
  expect(card(addon)[0][3], "your own 2s 50c, as it is").toBe("2s 50c");
  addon.click(`${CARD}.undercut.segments[1]`);
  addon.click(`${CARD}.listings[1]`);
  expect([card(addon)[0][3], form(addon)[3]], "2s less 1 copper, in the price box too").toEqual(["1s 99c", "1s 99c"]);
  addon.click(`${CARD}.stop`);
  addon.click(`${CARD}.listings[1]`);
  expect([listingRow(addon, 1)[0], addon.eval("return #ns.errors")], "no sale: no rows, a click does nothing").toEqual([false, 0]);
});

it("the listings scroll, and near the end the next page comes through the search queue", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + `__wfgWorld.ah.commodities[2589] = {}
    for i = 1, 6 do __wfgWorld.ah.commodities[2589][i] = { unitPrice = 100 * i, quantity = i } end
    __wfgWorld.ah.more[2589] = true`);
  addon.wheel(`${CARD}.list`, -1);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.wheel(`${CARD}.listings[1]`, -1);
  addon.wheel(`${CARD}.listings[1]`, -1);
  expect([listingRow(addon, 1)[1], listingRow(addon, 6)[1], listingRow(addon, 7)[0], sent(addon)], "six listings fit the rows; near the end, the next page waits a second after the last search").toEqual(["1s 0c", "6s 0c", false, ["SendSellSearchQuery:2589"]]);
  addon.advance(1);
  addon.wheel(`${CARD}.listings[1]`, -1);
  expect(sent(addon), "asked once, through the queue").toEqual(["SendSellSearchQuery:2589", "RequestMoreCommoditySearchResults:"]);
  expect(addon.eval("return __wfgWorld.ah.queries[2].args[1]"), "for the linen").toBe(2589);
  addon.eval("for i = 7, 8 do __wfgWorld.ah.commodities[2589][i] = { unitPrice = 100 * i, quantity = i } end __wfgWorld.ah.more[2589] = nil");
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 2589);
  addon.wheel(`${CARD}.listings[1]`, -5);
  addon.advance(5);
  expect([listingRow(addon, 8)[1], sent(addon).length], "the page is in; all of it: nothing more asked").toEqual(["8s 0c", 2]);
  addon.wheel(`${CARD}.listings[1]`, 10);
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
  addon.wheel(`${CARD}.listings[1]`, -5);
  expect([listingRow(addon, 5)[3], listingRow(addon, 6)[3]], "a band the game doesn't name: nothing; seconds: at least a minute").toEqual(["", "1 min"]);
  expect(sent(addon).at(-1), "the next page by the item's key").toBe("RequestMoreItemSearchResults:9999");
  addon.eval("__wfgWorld.ah.more[9999] = nil table.insert(__wfgWorld.ah.items[9999], { buyoutAmount = 9900, quantity = 1, timeLeft = 3 })");
  addon.fire("ITEM_SEARCH_RESULTS_ADDED", { itemID: 9999 });
  addon.wheel(`${CARD}.listings[1]`, -5);
  expect(listingRow(addon, 7)[1], "the page is in").toBe("99s 0c");
});

it("the shop's view and the sell card share the search events: each search and each page reaches its own card", () => {
  const addon = atAuctionHouse(BAGS + DUST_LISTINGS + " __wfgWorld.ah.more[10940] = true");
  dustFound(addon);
  addon.click(`${HELPER}.shopCard.rows[1]`);
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
  addon.wheel(`${HELPER}.shopCard.view`, -1);
  addon.wheel(`${CARD}.listings[1]`, -5);
  expect([pending(), addon.eval(`return #${HELPER}.queue`), sent(addon).slice(-1)], "the view's page in flight, the sell card's queued behind it").toEqual(["page", 1, ["RequestMoreCommoditySearchResults:"]]);
  addon.eval("table.insert(__wfgWorld.ah.commodities[10940], { unitPrice = 1000, quantity = 4, timeLeftSeconds = 600 }) __wfgWorld.ah.more[10940] = nil");
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 10940);
  addon.wheel(`${HELPER}.shopCard.view`, 10);
  expect([view(addon)[3][0][0], saleRows(), card(addon)[0][0], pending()], "the page reaches the view, not the sell card").toEqual(["10s 0c", 8, "12s 50c", false]);
  addon.advance(1);
  expect([pending(), sent(addon).filter((x) => x.startsWith("RequestMore")).length], "then the sell card's page").toEqual(["more", 2]);
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 10940);
  expect([saleRows(), card(addon)[0][0], pending(), addon.eval("return #ns.errors")], "it reaches the sell card").toEqual([9, "10s 0c", false, 0]);
});
