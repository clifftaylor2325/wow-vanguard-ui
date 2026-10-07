// auction-owned: the vendor floor, your auctions (undercut checks, cancels, sold and expired rows),
// price records from searches, and disenchant values, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, isTok, loggedIn } from "./helpers.mjs";
import { AH_ENV, BAGS, CARD, DUSTS, DUST_UP, HELPER, LINEN_BAGS, SCAN_BUTTON, atAuctionHouse, card, dropAndAnswer, list, makeList, restrictedLog, sent, tipLines } from "./auction-env.mjs";

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

// Owned row i: [shown, name, price, undercut mark shown].
const ownedRow = (addon, i) => addon.eval(`local r = ${OWNED_CARD}.owned[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, r.mark:IsShown() }`);

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
  expect(isTok(addon, addon.eval(`return ${OWNED_CARD}.owned[1].mark.__vertexColor`), "bad"), "the mark is red").toBe(true);
  addon.hover(`${OWNED_CARD}.owned[1].cancel`);
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "what cancelling costs").toEqual(["Cancel this auction", "Costs 1s 0c"]);
  addon.hover(null);
  addon.click(`${OWNED_CARD}.owned[1].cancel`);
  expect(restrictedLog(addon), "cancelled once, from the click").toEqual([["CancelAuction", true, 501, "nil", "nil", "nil", "nil"]]);
  addon.fire("AUCTION_CANCELED", 501);
  expect([ownedRow(addon, 1)[1], ownedRow(addon, 2)[2], ownedRow(addon, 3)[0]], "its row goes").toEqual(["TEST-ONLY Blade", "sold · 40s 0c", false]);
});

it("restricted calls run only inside a click", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP + OWNED.replace("__wfgWorld.ah.commodities[10940] = {", "__wfgWorld.ah.unused = {"));
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.post`);
  addon.advance(1);
  checkUndercuts(addon);
  addon.click(`${OWNED_CARD}.owned[2].cancel`);
  const after = restrictedLog(addon);
  for (let i = 0; i < 3; i++) {
    addon.advance(3);
    addon.world.fireAuctionEvents({ itemID: 10940 }, 501);
    addon.world.openAuctionHouse();
    addon.update(0);
  }
  expect(after.map((c) => [c[0], c[1]]), "a post and a cancel, each from a click").toEqual([["PostCommodity", true], ["CancelAuction", true]]);
  expect(restrictedLog(addon), "timers and every auction house event add nothing").toEqual(after);
  expect(addon.eval("local n = 0 for _, c in ipairs(__wfgWorld.ah.restricted) do if c.path:find('AuctionSell.lua') or c.path:find('AuctionOwned.lua') then n = n + 1 end end return n"), "both made by the helper's buttons").toBe(2);
});

it("your auctions: refused cancels, scrolling, unknown names, hidden costs, and updates the game sends", () => {
  const addon = atAuctionHouse(BAGS + OWNED + `__wfgWorld.ah.noCancel[501] = true __wfgWorld.ah.cancelCost = __wfgWorld.secret(1)
    __wfgWorld.items[9999].pending = true
    for i = 1, 4 do table.insert(__wfgWorld.ah.owned, { auctionID = 600 + i, itemKey = { itemID = 10940 }, status = 0, quantity = 1, buyoutAmount = 90 }) end`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect([ownedRow(addon, 1), ownedRow(addon, 2).slice(1, 3), list(sent(addon))], "shown when the game sends them, nothing checked").toEqual([[true, "Strange Dust", "1s 50c", false], ["item 9999", "40s 0c"], []]);
  addon.click(`${OWNED_CARD}.owned[1].cancel`);
  addon.hover(`${OWNED_CARD}.owned[1].cancel`);
  expect([restrictedLog(addon).length, addon.eval("return #GameTooltip.__lines")], "the game won't cancel it; no cost shown when hidden").toEqual([0, 1]);
  addon.wheel(`${OWNED_CARD}.owned[1]`, -5);
  expect([ownedRow(addon, 1)[2], ownedRow(addon, 7)[0], ownedRow(addon, 8)[0]], "seven auctions (one sold) on seven rows; the wheel has nothing to scroll").toEqual(["1s 50c", true, false]);
});

// Two more dust auctions of yours: 2 at 1s 30c a unit (undercut by the 1s 20c up) and 2 at 1s 10c (not).
const MORE_DUST = `table.insert(__wfgWorld.ah.owned, { auctionID = 506, itemKey = { itemID = 10940 }, status = 0, quantity = 2, buyoutAmount = 130 })
  table.insert(__wfgWorld.ah.owned, { auctionID = 507, itemKey = { itemID = 10940 }, status = 0, quantity = 2, buyoutAmount = 110 })`;

const CANCEL_NEXT = `${OWNED_CARD}.cancelNext`;

// The line under your auctions, and whether Cancel next undercut works.
const nextState = (addon) => addon.eval(`local c = ${OWNED_CARD} return { c.summary:GetText(), c.cancelNext:IsEnabled() }`);

it("Cancel next undercut cancels one undercut auction per click, then says none are left", () => {
  const addon = atAuctionHouse(BAGS + OWNED + MORE_DUST);
  expect(nextState(addon), "before a check: no line, nothing to cancel").toEqual(["", false]);
  addon.click(`${OWNED_CARD}.check`);
  expect(nextState(addon), "asking for your auctions").toEqual(["checking...", false]);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.advance(1);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect(nextState(addon), "the dust is checked, the blade not yet").toEqual(["checking...", true]);
  addon.advance(1);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(nextState(addon), "the dust at 1s 50c and at 1s 30c (1s 20c is up), not the one at 1s 10c").toEqual(["2 undercut", true]);
  addon.hover(CANCEL_NEXT);
  expect(tipLines(addon), "which auction goes next, and what that costs").toEqual(["Cancel Strange Dust", "Costs 1s 0c"]);
  addon.hover(null);
  addon.click(CANCEL_NEXT);
  expect([restrictedLog(addon), nextState(addon)], "the first, from the click; one left").toEqual([[["CancelAuction", true, 501, "nil", "nil", "nil", "nil"]], ["1 undercut", true]]);
  addon.click(CANCEL_NEXT);
  expect(restrictedLog(addon).map((c) => c[2]), "the next click takes the next one, before the game has answered the first").toEqual([501, 506]);
  expect([nextState(addon), isTok(addon, addon.frame(`${CANCEL_NEXT}.text`).textColor, "muted")], "none left: it says so and stops").toEqual([["none undercut", false], true]);
  addon.click(CANCEL_NEXT);
  addon.fire("AUCTION_CANCELED", 501);
  addon.fire("AUCTION_CANCELED", 506);
  addon.advance(5);
  addon.eval("for i = #__wfgWorld.ah.owned, 1, -1 do local id = __wfgWorld.ah.owned[i].auctionID if id == 501 or id == 506 then table.remove(__wfgWorld.ah.owned, i) end end");
  addon.world.fireAuctionEvents({ itemID: 10940 }, 0);
  expect(restrictedLog(addon).length, "a click on it disabled, timers and every auction house event: nothing more").toBe(2);
  expect([ownedRow(addon, 1)[1], ownedRow(addon, 3).slice(1), nextState(addon)], "the blade and the dust at 1s 10c are left (and the sold blade)").toEqual(["TEST-ONLY Blade", ["Strange Dust", "1s 10c", false], ["none undercut", false]]);
  expect(addon.eval("local n = 0 for _, c in ipairs(__wfgWorld.ah.restricted) do if c.path:find('AuctionOwned.lua') then n = n + 1 end end return n"), "both made by the button").toBe(2);
});

it("Cancel next undercut skips an auction the game won't cancel; the line waits for a check that never answers", () => {
  const addon = atAuctionHouse(BAGS + OWNED + MORE_DUST + "__wfgWorld.ah.noCancel[501] = true");
  addon.click(`${OWNED_CARD}.check`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.advance(1);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.advance(4);
  expect(nextState(addon), "the blade's check gave up: soon after, the line still says how many").toEqual(["2 undercut", true]);
  addon.click(CANCEL_NEXT);
  expect([restrictedLog(addon).map((c) => c[2]), nextState(addon)], "501 can't be cancelled, so 506 goes; 501 still counts").toEqual([[506], ["1 undercut", false]]);
  addon.eval("__wfgWorld.ah.owned = {}");
  addon.click(`${OWNED_CARD}.check`);
  addon.advance(1);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect([nextState(addon), list(ownedRow(addon, 1))[0]], "no auctions: none undercut at once").toEqual([["none undercut", false], false]);
});

it("with check again on, each post and each cancel checks your auctions again, through the queue", () => {
  const addon = atAuctionHouse(BAGS + OWNED);
  checkUndercuts(addon);
  addon.advance(1);
  addon.fire("AUCTION_HOUSE_AUCTION_CREATED", 601);
  addon.fire("AUCTION_CANCELED", 502);
  expect([sent(addon).length, addon.eval("return ns.Settings('AuctionHelper').recheck")], "off by default: nothing more asked").toEqual([3, false]);
  addon.eval("ns.Settings('AuctionHelper').recheck = true");
  addon.fire("AUCTION_HOUSE_AUCTION_CREATED", 601);
  expect(sent(addon).at(-1), "a post: your auctions asked for again").toBe("QueryOwnedAuctions:");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect([ownedRow(addon, 1)[3], nextState(addon)], "the dust keeps its mark while it's checked again").toEqual([true, ["checking...", true]]);
  addon.fire("AUCTION_CANCELED", 501);
  // The searches waiting, by kind.
  const queued = () => addon.eval(`local out = {} for i, s in ipairs(${HELPER}.queue) do out[i] = s.owned and "owned" or s.check and "check" or "other" end return out`);
  expect(queued(), "a cancel: the checks waiting are dropped for one new check").toEqual(["owned"]);
  addon.advance(1);
  expect([sent(addon).length, sent(addon).at(-1)], "sent a second after the last search").toEqual([5, "QueryOwnedAuctions:"]);
  addon.world.closeAuctionHouse();
  addon.fire("AUCTION_CANCELED", 502);
  expect(list(queued()), "not while the house is closed").toEqual([]);
});

// Your auctions after some sold: 5 dust at 1s 50c a unit and a blade at 40s (both sold on their
// buyout), a blade sold on a 3s bid, a sold blade whose price the client hides, and a blade up at 45s.
const SOLD = `__wfgWorld.ah.owned = {
  { auctionID = 701, itemKey = { itemID = 10940 }, status = 1, quantity = 5, buyoutAmount = 150 },
  { auctionID = 702, itemKey = { itemID = 9999 }, status = 1, quantity = 1, buyoutAmount = 4000 },
  { auctionID = 703, itemKey = { itemID = 9999 }, status = 1, quantity = 1, bidAmount = 300 },
  { auctionID = 704, itemKey = { itemID = 9999 }, status = 1, quantity = 1, buyoutAmount = __wfgWorld.secret(1) },
  { auctionID = 705, itemKey = { itemID = 9999 }, status = 0, quantity = 1, buyoutAmount = 4500 } }`;

// Owned row i as the player sees it: [shown, name, price column, its color token (one of good, gold,
// text2), Cancel shown, Relist shown, Relist works].
const ownedLook = (addon, i) => {
  const r = `${OWNED_CARD}.owned[${i}]`;
  const color = addon.frame(`${r}.price`).textColor;
  const token = ["good", "gold", "text2"].find((t) => isTok(addon, color, t)) || "other";
  return addon.eval(`local r = ${r} return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, "${token}", r.cancel:IsShown(), r.relist:IsShown(), r.relist:IsEnabled() }`);
};

it("sold rows show the amount, and are neither cancelled nor counted as undercut", () => {
  const addon = atAuctionHouse(BAGS + SOLD + "__wfgWorld.ah.items[9999] = { { buyoutAmount = 100, quantity = 1 } }");
  addon.click(`${OWNED_CARD}.check`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.advance(1);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.advance(1);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect([1, 2, 3, 4].map((i) => ownedLook(addon, i)), "the dust's 5 at 1s 50c, the blade's buyout, the bid; the hidden price left out").toEqual([
    [true, "Strange Dust", "sold · 7s 50c", "good", false, false, false],
    [true, "TEST-ONLY Blade", "sold · 40s 0c", "good", false, false, false],
    [true, "TEST-ONLY Blade", "sold · 3s 0c", "good", false, false, false],
    [true, "TEST-ONLY Blade", "45s 0c", "gold", true, false, false],
  ]);
  expect([addon.eval(`return ${OWNED_CARD}.owned[2].mark:IsShown()`), ownedRow(addon, 4)[3], nextState(addon)], "only the blade still up is undercut (1s up)").toEqual([false, true, ["1 undercut", true]]);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "TEST-ONLY A buyer has been found", 705);
  expect([ownedLook(addon, 4), nextState(addon)], "the game says it sold: no more Cancel, nothing to cancel next").toEqual([[true, "TEST-ONLY Blade", "sold · 45s 0c", "good", false, false, false], ["none undercut", false]]);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "TEST-ONLY no auction");
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 0, "TEST-ONLY bid placed", 701);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "TEST-ONLY not yours", 999);
  expect([ownedLook(addon, 1)[2], addon.eval("return #ns.errors")], "other notices change nothing").toEqual(["sold · 7s 50c", 0]);
});

it("an expired auction says it's coming back by mail; once it is in the bags, Relist puts it on the sell card", () => {
  const addon = atAuctionHouse(BAGS + OWNED + "__wfgWorld.bags[0][2] = nil");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.fire("AUCTION_HOUSE_AUCTIONS_EXPIRED", 502);
  expect(ownedLook(addon, 2), "expired: by mail, Relist waits for it").toEqual([true, "TEST-ONLY Blade", "expired · by mail", "text2", false, true, false]);
  addon.click(`${OWNED_CARD}.owned[2].relist`);
  addon.eval(`${HELPER}.Relist(502) ${HELPER}.Relist(999)`);
  expect([card(addon)[1], list(sent(addon))], "nothing to put on the card yet").toEqual([false, []]);
  addon.eval("table.remove(__wfgWorld.ah.owned, 2)");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect([ownedLook(addon, 2)[2], ownedLook(addon, 3)[2]], "the game drops it from its list; the row stays, at the end").toEqual(["sold · 40s 0c", "expired · by mail"]);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 5, "TEST-ONLY expired", 501);
  expect(ownedLook(addon, 1).slice(2), "the game's notice that one ran out (other dust is in the bags)").toEqual(["expired · in bags", "text2", false, true, true]);
  addon.world.closeAuctionHouse();
  addon.eval("__wfgWorld.bags[1][4] = { itemID = 9999, count = 1 }");
  addon.world.openAuctionHouse();
  addon.update(0);
  expect(ownedLook(addon, 3), "after the mailbox: back in the bags, Relist works").toEqual([true, "TEST-ONLY Blade", "expired · in bags", "text2", false, true, true]);
  addon.advance(1);
  addon.click(`${OWNED_CARD}.owned[3].relist`);
  expect([card(addon)[1], sent(addon), ownedRow(addon, 3)[0]], "the blade from bag 1 is on the sell card, its price checked; the row goes").toEqual(["TEST-ONLY-BLADE", ["SendSellSearchQuery:9999"], false]);
  expect(addon.eval(`local s = ${HELPER}.sell return { s.loc.bagID, s.loc.slotIndex }`), "the bag slot it found").toEqual([1, 4]);
  expect(restrictedLog(addon).length, "relisting posts nothing by itself").toBe(0);
});

// Item `id`'s stored values: [last-seen price, today's low, today's units, today's market] (false for none).
const stored = (addon, id) => addon.eval(`local p, d = ns.AuctionPrices.House().prices[${id}], math.floor(__now / 86400)
  if not p then return false end
  return { p.min, p.days[d] or false, p.qtys[d] or false, p.markets[d] or false }`);

it("browse results record each trusted item's cheapest price, the game's own browses too", () => {
  const addon = atAuctionHouse(`${DUSTS}
    __wfgWorld.items[9998] = { name = "TEST-ONLY Helm", equipment = true }
    __wfgWorld.items[10942] = { name = "TEST-ONLY Mine", commodity = true }
    __wfgWorld.items[10943] = { name = "TEST-ONLY Late", commodity = true, pending = true }`);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust" }');
  addon.eval(`__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 240 },
    { itemKey = { itemID = 10940, itemLevel = 5 }, minPrice = 1100, totalQuantity = 3 }, { itemKey = { itemID = 10941 }, minPrice = 900, totalQuantity = 3 },
    { itemKey = { itemID = 9998 }, minPrice = 5000, totalQuantity = 1 }, { itemKey = { itemID = 10942 }, minPrice = 10, totalQuantity = 1, containsOwnerItem = true },
    { itemKey = { itemID = 10942 }, minPrice = 20, totalQuantity = 1, containsOwnerItem = __wfgWorld.secret(false) },
    { itemKey = { itemID = 10943 }, minPrice = 30, totalQuantity = 1 }, { itemKey = { itemID = 10940 }, minPrice = __wfgWorld.secret(5), totalQuantity = 1 } }`);
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(stored(addon, 10940), "a commodity: its lowest item key, no units or market").toEqual([1100, 1100, false, false]);
  expect(stored(addon, 9998), "equipment: priced per item").toEqual([5000, 5000, false, false]);
  expect([stored(addon, 10941), stored(addon, 10942), stored(addon, 10943)], "a stackable item, a result with yours (or hidden), an item not loaded: none").toEqual([false, false, false]);
  addon.eval("__now = __now + 60 __wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1300, totalQuantity = 9 } }");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(stored(addon, 10940), "a browse the game made: the last-seen price moves, the day's low stays").toEqual([1300, 1100, false, false]);
});

it("a sell search and an owned check record the price; a scan keeps the units and market value", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP);
  addon.eval(`__wfgWorld.ah.replicate = { { itemID = 10940, count = 10, buyoutPrice = 1500 }, { itemID = 10940, count = 10, buyoutPrice = 2000 } }`);
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  expect(stored(addon, 10940), "the scan: low 150, 20 units, market of the cheapest 3").toEqual([150, 150, 20, 150]);
  addon.advance(1);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect(stored(addon, 10940), "the sell search's 100 (your 95 left out): last seen and the day's low; units and market stay the scan's").toEqual([100, 100, 20, 150]);
  expect(addon.eval('local l = __showItem("item:10940") return l[#l][1]'), "the tooltip's last line").toBe("AH: 1s 0c · market 1s 50c (today)");
  const owned = atAuctionHouse(BAGS + OWNED);
  checkUndercuts(owned);
  expect([stored(owned, 10940), stored(owned, 9999)], "the owned check: 120 (your 150 left out), and the blade's 5000").toEqual([[120, 120, false, false], [5000, 5000, false, false]]);
  owned.eval("ns.AuctionPrices.RecordSeen(10940, __wfgWorld.secret(1)) ns.AuctionPrices.RecordSeen(10940, 0) ns.AuctionPrices.RecordSeen(10940, nil)");
  expect(stored(owned, 10940), "a hidden, zero or missing price records nothing").toEqual([120, 120, false, false]);
});

// TEST-ONLY gear (item level 18 unless said): green armour and a green weapon, a blue at 60, an
// epic at 58, and what doesn't disenchant: a green trade good, white armour, green armour at 3,
// green armour whose quality the client hides.
const GEAR = `
  local function gear(id, classID, quality, level) __wfgWorld.items[id] = { name = "TEST-ONLY Gear " .. id, classID = classID, quality = quality, level = level } end
  gear(9101, 4, 2, 18) gear(9102, 2, 2, 18) gear(9103, 4, 3, 60) gear(9104, 2, 4, 58)
  gear(9105, 7, 2, 18) gear(9106, 4, 1, 18) gear(9107, 4, 2, 3) gear(9108, 4, __wfgWorld.secret(2), 18)`;

// Strange Dust's market is 1s, Greater Magic Essence has a low of 10s only, a Large Brilliant Shard
// went for 3g; the greens' shard and Nexus Crystals have no price.
const MATS = "ns.AuctionPrices.Record(10940, 80, __now, 10, 100) ns.AuctionPrices.Record(10939, 1000, __now) ns.AuctionPrices.Record(14344, 30000, __now)";

// TEST-ONLY professions: Tailoring, and Enchanting second.
const ENCHANTER = "__wfgWorld.professions = { { name = 'Tailoring', skillLine = 197, profession = 7 }, { name = 'Enchanting', skillLine = 333, profession = 9 } }";

// The tooltip lines of item `id`, as text.
const tipOf = (addon, id) => list(addon.eval(`local out = {} for i, l in ipairs(__showItem("item:${id}")) do out[i] = l[1] end return out`));

it("disenchant values: chance x average quantity x each material's market (else its low), for gear only", () => {
  const addon = loggedIn(AH_ENV + GEAR);
  addon.eval(MATS);
  expect(addon.eval("return { ns.AuctionPrices.Disenchant('item:9101'), ns.AuctionPrices.Disenchant(9102) }"), "armour: 75 % of 2.5 dust at 1s, 20 % of 1.5 essence at 10s; a weapon the other way round").toEqual([487, 1175]);
  expect([tipOf(addon, 9101), addon.eval("return ns.AuctionPrices.HasEnchanting()")], "not an enchanter: no line by default").toEqual([[], false]);
  addon.eval(ENCHANTER);
  const [line] = addon.eval('return __showItem("item:9101")');
  expect([line[0], isTok(addon, line[1], "text2")], "an enchanter (the second profession) sees it, in text2").toEqual(["Disenchant: ~4s 87c", true]);
  expect([tipOf(addon, 9102), tipOf(addon, 9103)], "the weapon; the blue's shard (99.5 %) in gold and silver").toEqual([["Disenchant: ~11s 75c"], ["Disenchant: ~2g 98s"]]);
  const none = [9104, 9105, 9106, 9107, 9108, 4242].map((id) => tipOf(addon, id).length);
  expect([none, addon.eval("return #ns.errors")], "unpriced crystals, a trade good, white, too low, a hidden quality, unknown: no line").toEqual([[0, 0, 0, 0, 0, 0], 0]);
  addon.eval("ns.AuctionPrices.Record(9101, 5000, __now)");
  expect(tipOf(addon, 9101), "under the auction price").toEqual(["AH: 50s 0c (today)", "Disenchant: ~4s 87c"]);
});

it("disenchant values: the switch is on for enchanters until set, in the Auction house options", () => {
  const addon = loggedIn(AH_ENV + GEAR + CLICK_LUA);
  addon.eval(MATS);
  expect(addon.eval("local get, set, default = ns.AuctionPrices.DisenchantSetting() return { get(), default }"), "off for a non-enchanter").toEqual([false, false]);
  addon.eval('ns.Options.Show("more")');
  addon.eval('__click("Disenchant values in tooltips")');
  expect([addon.eval("return ns.Settings('AuctionHelper').disenchant"), tipOf(addon, 9101)], "ticked: on without Enchanting").toEqual([true, ["Disenchant: ~4s 87c"]]);
  addon.eval(ENCHANTER);
  addon.eval("local _, set = ns.AuctionPrices.DisenchantSetting() set(false)");
  expect(tipOf(addon, 9101), "unticked: off even for an enchanter").toEqual([]);
  addon.eval("ns.Settings('AuctionHelper').disenchant = nil");
  expect([tipOf(addon, 9101), addon.eval("return select(3, ns.AuctionPrices.DisenchantSetting())")], "not set: follows Enchanting again").toEqual([["Disenchant: ~4s 87c"], true]);
  addon.eval("C_TradeSkillUI = nil");
  expect(addon.eval("return ns.AuctionPrices.HasEnchanting()"), "a client that can't say: not an enchanter").toBe(false);
});
