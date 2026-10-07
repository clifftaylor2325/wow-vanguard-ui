// auction-deals: deals under the market and price alerts, at the TEST-ONLY auction house of the
// headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, isTok } from "./helpers.mjs";
import { BAGS, DUSTS, DUST_UP, HELPER, atAuctionHouse, dropAndAnswer, makeList, openFilters, pickTab, restrictedLog, scan, sent, tipLines } from "./auction-env.mjs";

const DEALS = `${HELPER}.dealsFrame`;

// Today, as the price store counts days, at the TEST-ONLY clock.
const TODAY = Math.floor(1790000000 / 86400);

// Saved prices of Strange Dust on this realm and faction: its low of yesterday, `low`, and more
// fields (Lua) when given.
const dustHistory = (low, fields = "") => `VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 1, lastScan = 0, prices = {
  [10940] = { min = ${low}, t = 1790000000 - 86400, days = { [${TODAY - 1}] = ${low} } ${fields} } } } } }`;

// Deal row i: [shown, name, price, how far under].
const dealRow = (addon, i) => addon.eval(`local r = ${DEALS}.card.rows[${i}] return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, r.qty:GetText() or false }`);

// The Deals card: [shown, its count, the line shown while there are none].
const dealsCard = (addon) => [addon.frame("Vanguard_AuctionDeals").visible, ...addon.eval(`local c = ${DEALS}.card return { c.count:GetText(), c.status:GetText() }`)];

it("deals: a scan lists what's under 70 % of the 7-day market or under vendor price, best first, beside the Shop card", () => {
  const markets = `, markets = { [${TODAY - 1}] = 1200, [${TODAY - 2}] = 1000, [${TODAY - 8}] = 9000 }`;
  const addon = atAuctionHouse(DUSTS, { savedVariables: dustHistory(1000, markets) });
  pickTab(addon, 4);
  const [deals, page] = [addon.frame("Vanguard_AuctionDeals"), addon.frame("Vanguard_AuctionShopping")];
  expect([deals.rect.right, deals.rect.top, deals.rect.width, deals.rect.height], "the Shopping page's right column, from its top, with room for 18 rows").toEqual([page.rect.right, page.rect.top, 280, 406]);
  expect([dealsCard(addon), dealRow(addon, 1)[0]], "none yet").toEqual([[true, "", "None yet: a scan or a search finds them."], false]);
  scan(addon, `{ { itemID = 10940, count = 1, buyoutPrice = 500 }, { itemID = 10940, count = 30, buyoutPrice = 39000 },
    { itemID = 2589, count = 5, buyoutPrice = 50 }, { itemID = 159, count = 1, buyoutPrice = 100 } }`);
  expect(addon.eval("return ns.GetModule('AuctionHelper').Market7(10940, __now)"), "the dust's 7-day market: 12s, 10s and today's 11s 40c (8 days ago left out)").toBe(1113);
  expect([1, 2, 3].map((i) => dealRow(addon, i)), "linen under its 13c vendor price first, then dust 55 % under its market; water isn't a deal").toEqual([
    [true, "Linen Cloth", "10c", "< vendor"], [true, "Strange Dust", "5s 0c", "-55 %"], [false, false, false, false]]);
  expect([dealsCard(addon), isTok(addon, addon.eval(`return ${DEALS}.card.rows[2].qty.__textColor`), "good")], "the count; how far under in good").toEqual([[true, "2 found", ""], true]);
  addon.hover(`${DEALS}.card.rows[2]`);
  expect(tipLines(addon), "what the dust was judged against").toEqual(["Strange Dust", "7-day market: 11s 13c", "Click to show it in the auction house's list."]);
  addon.hover(`${DEALS}.card.rows[1]`);
  expect(tipLines(addon), "the linen's market, and the vendor's price it is under").toEqual(["Linen Cloth", "7-day market: 10c", "Vendor price: 13c", "Click to show it in the auction house's list."]);
  addon.hover(null);
  expect(addon.eval("return GameTooltip:IsShown()"), "gone with the mouse").toBe(false);
  addon.click(`${DEALS}.card.rows[1]`);
  expect([sent(addon).at(-1), restrictedLog(addon), addon.eval("return AuctionHouseFrame.selectedTab"), addon.frame("Vanguard_AuctionShopping").visible], "a click shows it in the game's own list, on its Buy tab; nothing is bought").toEqual(["SearchForItemKeys:2589", [], 1, false]);
});

it("deals: each search judges its item again; a low before today stands in for a market; closing forgets them", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP + CLICK_LUA, { savedVariables: dustHistory(150) });
  pickTab(addon, 4);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.update(0.01);
  expect(dealRow(addon, 1), "the sell search's 1s (your 95c left out) is a third under yesterday's 1s 50c").toEqual([true, "Strange Dust", "1s 0c", "-33 %"]);
  addon.hover(`${DEALS}.card.rows[1]`);
  expect(tipLines(addon)[1], "judged against").toBe("Lowest of the 6 days before: 1s 50c");
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 180, totalQuantity = 5 } }");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.update(0.01);
  expect([dealsCard(addon), dealRow(addon, 1)[0]], "a browse sees it at 1s 80c now: no longer a deal").toEqual([[true, "", "None yet: a scan or a search finds them."], false]);
  addon.eval(`local AP = ns.AuctionPrices for i = 1, 10 do AP.Record(50000 + i, 1000, __now - 86400) end
    for i = 1, 10 do AP.RecordSeen(50000 + i, 1000 - 10 * i) end`);
  addon.update(0.01);
  expect([dealsCard(addon)[1], dealRow(addon, 1).slice(1), dealRow(addon, 8)[1]], "ten deals, furthest under first, eight rows").toEqual(["10 found", ["item 50010", "9s 0c", "-10 %"], "item 50003"]);
  addon.wheel(`${DEALS}.card.rows[1]`, -1);
  expect(dealRow(addon, 1)[1], "ten deals fit the rows: the wheel has nothing to scroll").toBe("item 50010");
  addon.wheel(`${DEALS}.card.rows[1]`, -5);
  expect([dealRow(addon, 1)[1], dealRow(addon, 10)[1], dealRow(addon, 11)[0]], "every deal on its row, none past the last").toEqual(["item 50010", "item 50001", false]);
  addon.wheel(`${DEALS}.card.rows[1]`, 9);
  expect(dealRow(addon, 1)[1], "nor above the first").toBe("item 50010");
  addon.world.closeAuctionHouse();
  addon.eval("ns.AuctionPrices.RecordSeen(50001, 1)");
  addon.world.openAuctionHouse();
  addon.update(0);
  pickTab(addon, 4);
  expect(dealsCard(addon), "a new visit starts with none; nothing is judged while the house is closed").toEqual([true, "", "None yet: a scan or a search finds them."]);
  addon.eval('ns.Options.Show("more") __click("Deals card")');
  addon.eval("ns.AuctionPrices.RecordSeen(50001, 1)");
  expect([addon.eval("return ns.Settings('AuctionHelper').deals"), addon.frame("Vanguard_AuctionDeals").visible, addon.eval(`return next(${HELPER}.deals) == nil`)], "switched off under Auction house: the card goes at once, nothing is judged").toEqual([false, false, true]);
});

it("deals: with the tabs off nothing is built, and a deal found paints nothing", () => {
  const addon = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 5)");
  addon.update(0.01);
  expect([addon.frame("Vanguard_AuctionDeals"), addon.eval(`return ${HELPER}.deals[2589].price`), addon.eval("return #ns.errors")], "no card, the deal kept, no error").toEqual([null, 5, 0]);
});

// TEST-ONLY: the alert sound's kit.
const ALERT_ENV = " SOUNDKIT = { TELL_MESSAGE = 3081 } ";

// The toast: [shown, title, line, price].
const alertToast = (addon) => addon.eval("local f = Vanguard_ChatWatchToast return { f:IsShown(), f.sender:GetText() or false, f.line:GetText() or false, f.price:GetText() or false }");

// How many times the alert sound (3081) has played.
const alertRings = (addon) => addon.eval("local n = 0 for _, s in ipairs(__wfgWorld.sounds) do if s == 3081 then n = n + 1 end end return n");

// Searches the list again with Strange Dust up at `price`, a second after the last search, and lets the frame end.
function dustAt(addon, price) {
  addon.advance(1);
  addon.eval(`__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = ${price}, totalQuantity = 5 } }`);
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.update(0.01);
}

it("price alerts: the filter dialog's switch alerts at the max price; a search at or under it rings once per drop", () => {
  const addon = atAuctionHouse(DUSTS + ALERT_ENV);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust" }');
  openFilters(addon, 1);
  expect(addon.eval("local d = Vanguard_AuctionFilters return { d.alert.label:GetText(), d.draft.alert == true }"), "the switch under the max price, off").toEqual(["Alert at or under the max price", false]);
  addon.click("Vanguard_AuctionFilters.alert");
  addon.click("Vanguard_AuctionFilters.save");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats'][1]"), "no max price: nothing to alert at, a plain entry").toBe("Strange Dust");
  openFilters(addon, 1);
  addon.click("Vanguard_AuctionFilters.alert");
  addon.type("Vanguard_AuctionFilters.price", "1g");
  addon.click("Vanguard_AuctionFilters.save");
  expect(addon.eval("local e = VanguardDB.ah.lists['TEST-ONLY Mats'][1] return { e.term, e.maxPrice, e.alert }"), "kept with the max price").toEqual(["Strange Dust", 10000, true]);
  openFilters(addon, 1);
  expect(addon.eval("return Vanguard_AuctionFilters.draft.alert"), "the dialog shows it on").toBe(true);
  addon.click("Vanguard_AuctionFilters.cancel");
  dustAt(addon, 12000);
  expect([alertRings(addon), alertToast(addon)[0]], "over the max price: nothing").toEqual([0, false]);
  dustAt(addon, 9000);
  expect([alertRings(addon), alertToast(addon)], "under it: one sound, one toast (the browse and the shop's row are one alert)").toEqual([1, [true, "Price alert", "Strange Dust (max 1g 0s 0c)", "90s 0c"]]);
  addon.advance(3);
  dustAt(addon, 9000);
  dustAt(addon, 9500);
  expect(alertRings(addon), "the same price again, or dearer: no alert").toBe(1);
  dustAt(addon, 8000);
  expect([alertRings(addon), alertToast(addon)[3]], "cheaper than when it alerted: again").toEqual([2, "80s 0c"]);
  addon.advance(1);
  addon.click("Vanguard_ChatWatchToast");
  expect([sent(addon).at(-1), restrictedLog(addon), alertToast(addon)[0]], "a click on the toast shows the item in the game's list; nothing is bought").toEqual(["SearchForItemKeys:10940", [], false]);
});

it("price alerts: a scan or any search rings for named lists' entries by ID or name, several on one toast", () => {
  const lists = `VanguardDB.ah = { list = "TEST-ONLY Mats", recent = { { term = 9999, maxPrice = 99999, alert = true } }, lists = { ["TEST-ONLY Mats"] = {
    { term = 2589, maxPrice = 20, alert = true }, { term = "dust", maxPrice = 600, alert = true, quality = 1 }, { term = "Soul Dust", exact = true, maxPrice = 1, alert = true },
    { term = "pouch", maxPrice = 99999, alert = true, maxLevel = 0 }, { term = "TEST-ONLY", maxPrice = 99999, alert = true, minLevel = 2 }, { term = 159, maxPrice = 1000 }, "TEST-ONLY Plain" } } }`;
  const addon = atAuctionHouse(DUSTS + ALERT_ENV + `__wfgWorld.items[10941].quality = 2 __wfgWorld.items[11083] = { name = "Soul Dust", commodity = true }
    __wfgWorld.items[9999] = { name = "TEST-ONLY Blade" }`, { savedVariables: lists });
  scan(addon, `{ { itemID = 2589, count = 1, buyoutPrice = 15 }, { itemID = 10940, count = 1, buyoutPrice = 500 }, { itemID = 10941, count = 1, buyoutPrice = 100 },
    { itemID = 11083, count = 1, buyoutPrice = 550 }, { itemID = 9999, count = 1, buyoutPrice = 5 }, { itemID = 159, count = 1, buyoutPrice = 1 }, { itemID = 77777, count = 1, buyoutPrice = 1 } }`);
  expect([alertRings(addon), alertToast(addon)], "linen by ID, two dusts by name; not the pouch (another quality), the blade (only on Recent, and under level 2), water (no alert), an unknown item").toEqual([1,
    [true, "3 price alerts", "Linen Cloth, Strange Dust, Soul Dust", ""]]);
  addon.advance(3);
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 11083 }, minPrice = 400, totalQuantity = 2 } }");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.update(0.01);
  expect([alertRings(addon), alertToast(addon).slice(1)], "the game's own browse sees soul dust cheaper").toEqual([2, ["Price alert", "Soul Dust (max 6s 0c)", "4s 0c"]]);
  const queries = sent(addon).length;
  addon.world.closeAuctionHouse();
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 1)");
  addon.update(0.01);
  addon.click("Vanguard_ChatWatchToast");
  expect([alertRings(addon), sent(addon).length], "the house closed: nothing alerts, and the toast's click searches nothing").toEqual([2, queries]);
});
