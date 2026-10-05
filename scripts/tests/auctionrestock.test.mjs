// auctionrestock: the Auction helper's buy lists (Modules/AuctionRestock.lua): what Instance prep
// and Keep stocked say you're short of becomes the Restock shopping list, and its rows say what the
// cheapest of the wanted amount come to, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock, a mage's runes and powder (Arcane Powder a commodity), Linen Cloth a
// commodity, a TEST-ONLY blade (an item), and __carry(itemID, count) into bag 0.
const RESTOCK_ENV = `
  __now = 1790000000
  time = function() return __now end
  local items = __wfgWorld.items
  items[17031] = { name = "TEST-ONLY Rune of Teleportation", commodity = true }
  items[17032] = { name = "TEST-ONLY Rune of Portals", commodity = true }
  items[17020] = { name = "TEST-ONLY Arcane Powder", icon = "TEST-ONLY-POWDER", commodity = true }
  items[2589].commodity = true
  items[9999] = { name = "TEST-ONLY Blade", icon = "TEST-ONLY-BLADE" }
  function __carry(itemID, count)
    local bag = __wfgWorld.bags[0]
    bag[#bag + 1] = { itemID = itemID, count = count }
  end
`;

const HELPER = "ns.GetModule('AuctionHelper')";
const PREP = "ns.GetModule('InstancePrep')";

// A level 60 mage carrying 2 Rune of Teleportation and all the Rune of Portals, with 10 Linen
// Cloth and 2 of the blade on the Keep-stocked list (3 cloth in the bags); the auction house open
// unless `closed`.
function mage({ closed = false, extra = "", savedVariables } = {}) {
  const addon = loggedIn(RESTOCK_ENV + extra, { savedVariables });
  addon.world.setUnit("player", { class: "MAGE", level: 60 });
  addon.eval("__carry(17031, 2) __carry(17032, 5) __carry(2589, 3)");
  addon.slash("stock 2589 10");
  addon.slash("stock 9999 2");
  if (!closed) {
    addon.world.openAuctionHouse();
    addon.update(0);
  }
  return addon;
}

// The Restock list's entries as [term, want].
const restock = (addon) => {
  const out = addon.eval(`local out = {} for i, e in ipairs(ForeverUIDB.ah.lists.Restock or {}) do out[i] = { e.term, e.want } end return out`);
  return Array.isArray(out) ? out : [];
};

// Shop row i: [shown, name, price, count].
const shopRow = (addon, i) => addon.eval(`local r = ${HELPER}.shopCard.rows[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, r.qty:GetText() or false }`);

// The queries sent, as "fn:what" (an item key's itemID, or the first of a list of keys).
const sent = (addon) => addon.eval(`local out = {}
  for i, q in ipairs(__wfgWorld.ah.queries) do
    local a = q.args[1]
    out[i] = q.fn .. ":" .. tostring(a.itemID or (a[1] and a[1].itemID) or a.searchString)
  end
  return out`);

// Answers the search in flight with browse results for item ids (price 100, 50 up each).
function browse(addon, ...ids) {
  addon.eval(`__wfgWorld.ah.browse = {} for _, id in ipairs({ ${ids.join(", ")} }) do table.insert(__wfgWorld.ah.browse, { itemKey = { itemID = id }, minPrice = 100, totalQuantity = 50 }) end`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.advance(1);
}

// The shop card's progress line.
const progress = (addon) => addon.eval(`return ${HELPER}.shopCard.progress:GetText()`);

it("the Restock list holds what Instance prep and Keep stocked are short of, with how many", () => {
  const addon = mage({ closed: true });
  addon.slash("prep");
  expect(addon.eval(`return ${PREP}.card.buy:IsShown()`), "the prep card offers Buy list").toBe(true);
  addon.click(`${PREP}.card.buy`);
  expect(restock(addon), "8 more runes, 20 powder (the portals are packed), 7 cloth and 2 blades").toEqual([[17031, 8], [17020, 20], [2589, 7], [9999, 2]]);
  expect(addon.eval("return ForeverUIDB.ah.list"), "and it's the list in use").toBe("Restock");
  expect(chatHas(addon, /Shopping list Restock: TEST-ONLY Rune of Teleportation x8, TEST-ONLY Arcane Powder x20, Linen Cloth x7, TEST-ONLY Blade x2\./), "chat says what's on it").toBe(true);
  expect(chatHas(addon, /At the auction house, Search list on the Shop card shows what the cheapest of each come to\./), "and where to search it").toBe(true);
  expect(addon.eval("return #__wfgWorld.ah.queries"), "nothing searched away from the auction house").toBe(0);
  addon.slash("stock 17020 30");
  addon.slash("ah restock");
  expect(restock(addon)[1], "an item on both lists: the larger amount").toEqual([17020, 30]);
  addon.eval("__carry(17031, 8) __carry(17020, 30) __carry(2589, 7) __carry(9999, 2)");
  addon.slash("prep");
  expect(addon.eval(`return ${PREP}.card.buy:IsShown()`), "nothing to buy: no Buy list").toBe(false);
  addon.slash("ah restock");
  expect(chatHas(addon, /Nothing to restock: your class's reagents and your Keep-stocked items \(\/fui stock\) are all in your bags\./), "says so").toBe(true);
  expect(restock(addon).length, "the old list stays").toBe(4);
});

it("the prep card's Buy list waits for the Auction helper, and an ammo row is no item to buy", () => {
  const off = loggedIn(RESTOCK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { AuctionHelper = false } } }" });
  off.world.setUnit("player", { class: "MAGE", level: 60 });
  off.slash("prep");
  expect([off.frame("ForeverUI_PrepCard").visible, off.eval(`return ${PREP}.card.buy:IsShown()`)], "runes short, but the helper is off").toEqual([true, false]);
  const hunter = loggedIn(RESTOCK_ENV + "GetInventoryItemCount = function() return 120 end");
  hunter.world.setUnit("player", { class: "HUNTER", level: 60 });
  hunter.slash("prep");
  expect([hunter.texts("Ammo").length, hunter.eval(`return ${PREP}.card.buy:IsShown()`)], "ammo is short, but it's no one item").toEqual([1, false]);
  const noPrep = loggedIn(RESTOCK_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { InstancePrep = false } } }" });
  noPrep.world.setUnit("player", { class: "MAGE", level: 60 });
  noPrep.slash("stock 2589 4");
  noPrep.slash("ah restock");
  expect(restock(noPrep), "Instance prep off: Keep stocked alone").toEqual([[2589, 4]]);
  noPrep.eval("for i = 1, 20 do ForeverUIDB.ah.lists['TEST-ONLY ' .. i] = {} end ForeverUIDB.ah.lists.Restock = nil");
  noPrep.slash("ah restock");
  expect([restock(noPrep), chatHas(noPrep, /at most 20 shopping lists/)], "no room for the list: nothing made").toEqual([[], true]);
});

// 20 Arcane Powder wanted: 6 at 10s, 10 at 12s (4 of them yours), 30 at 15s; one hidden price and one with
// your units hidden.
const POWDER = `__wfgWorld.ah.commodities[17020] = {
  { unitPrice = 1000, quantity = 6 }, { unitPrice = 1200, quantity = 10, numOwnerItems = 4 },
  { unitPrice = __wfgWorld.secret(1), quantity = 99 }, { unitPrice = 1, quantity = 99, numOwnerItems = __wfgWorld.secret(0) },
  { unitPrice = 1500, quantity = 30 } }`;

it("at the auction house Restock searches the list, then prices the cheapest of the wanted amount", () => {
  const addon = mage({ extra: POWDER });
  addon.click(`${HELPER}.shopCard.restock`);
  expect(shopRow(addon, 2), "before its search: how many are needed").toEqual([true, "TEST-ONLY Arcane Powder", "", "need 20"]);
  expect([sent(addon), progress(addon)], "searched at once, an item ID by its key").toEqual([["SearchForItemKeys:17031"], "0 of 4"]);
  browse(addon, 17031);
  expect([sent(addon).slice(1), progress(addon)], "found: its listings next, through the queue, counted").toEqual([["SendSearchQuery:17031"], "1 of 5"]);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 17031);
  expect([shopRow(addon, 1).slice(2), progress(addon)], "none of the rune's listings up: none up").toEqual([["none up", ""], "2 of 5"]);
  addon.advance(1);
  browse(addon, 17020);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 17020);
  expect(sent(addon).slice(2), "then the next entry and its listings").toEqual(["SearchForItemKeys:17020", "SendSearchQuery:17020"]);
  expect(shopRow(addon, 2), "6 at 10s, 6 of the 10 at 12s (4 are yours), 8 at 15s").toEqual([true, "TEST-ONLY Arcane Powder", "2g 52s 0c", "20 for"]);
  expect(isTok(addon, addon.eval(`return ${HELPER}.shopCard.rows[2].qty.__textColor`), "text2"), "enough up: in text2").toBe(true);
  expect(addon.eval("return ns.AuctionPrices.House().prices[17020].min"), "the cheapest price feeds the price store").toBe(1000);
  expect(addon.eval("local out = {} for i, r in ipairs(__wfgWorld.ah.restricted) do out[i] = r.fn end return out"), "nothing is bought").toEqual({});
});

it("fewer up than wanted shows in the warning colour; an item's listings are bought whole", () => {
  const addon = mage({ extra: `__wfgWorld.ah.commodities[2589] = { { unitPrice = 50, quantity = 3 } }
    __wfgWorld.ah.items[9999] = { { buyoutAmount = 3000, quantity = 3 }, { buyoutAmount = 500, quantity = 1, containsOwnerItem = true },
      { buyoutAmount = 1200, quantity = 1, containsOwnerItem = __wfgWorld.secret(false) }, { minBid = 10, quantity = 1 }, { buyoutAmount = 4000, quantity = 1 } }` });
  addon.eval(`${HELPER}.MakeRestock()`);
  addon.eval(`ForeverUIDB.ah.lists.Restock = { ForeverUIDB.ah.lists.Restock[3], ForeverUIDB.ah.lists.Restock[4] } ${HELPER}.SearchList()`);
  browse(addon, 2589);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.advance(1);
  browse(addon, 9999);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(shopRow(addon, 1).slice(2), "3 of the 7 cloth").toEqual(["1s 50c", "3 for"]);
  expect(isTok(addon, addon.eval(`return ${HELPER}.shopCard.rows[1].qty.__textColor`), "warn"), "short: in warn").toBe(true);
  expect(shopRow(addon, 2).slice(2), "2 blades wanted: the stack of 3 at 10s each beats 40s; yours and hidden ones left out").toEqual(["30s 0c", "3 for"]);
  expect(addon.eval(`local AH = ${HELPER} return { AH.CheapestCost({}, 5) }`), "nothing up").toEqual([0, 0]);
});

it("a max price leaves dearer listings out; filters stay when the list is made again and when they're saved", () => {
  const addon = mage({ extra: POWDER });
  addon.eval(`${HELPER}.MakeRestock() ${HELPER}.EditFilters("Restock", 2)`);
  addon.type("ForeverUI_AuctionFilters.price", "11s");
  addon.click("ForeverUI_AuctionFilters.save");
  expect(addon.eval("local e = ForeverUIDB.ah.lists.Restock[2] return { e.term, e.want, e.maxPrice }"), "saving filters keeps the wanted amount").toEqual([17020, 20, 1100]);
  addon.eval("__carry(17020, 5)");
  addon.slash("ah restock");
  expect(addon.eval("local e = ForeverUIDB.ah.lists.Restock[2] return { e.term, e.want, e.maxPrice }"), "made again: the new amount, the filter kept").toEqual([17020, 15, 1100]);
  browse(addon, 17031);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 17031);
  addon.advance(1);
  browse(addon, 17020);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 17020);
  expect(shopRow(addon, 2).slice(2), "only the 6 at 10s are under 11s").toEqual(["60s 0c", "6 for"]);
  addon.eval(`${HELPER}.SearchList()`);
  expect(shopRow(addon, 2).slice(2), "searched again: the old totals go").toEqual(["", "need 15"]);
});

it("a search that never answers still counts; a plain entry has no wanted amount", () => {
  const addon = mage();
  addon.slash("ah restock");
  browse(addon, 17031);
  addon.advance(5);
  expect(sent(addon), "no answers: each gives up after 2 seconds").toEqual(["SearchForItemKeys:17031", "SendSearchQuery:17031", "SearchForItemKeys:17020", "SearchForItemKeys:2589"]);
  expect(addon.eval(`local AH = ${HELPER} return AH.progress.done`), "the unanswered ones count as done").toBe(3);
  addon.eval(`${HELPER}.AddEntry("TEST-ONLY Plain", "Restock")`);
  expect(shopRow(addon, 5).slice(1), "a plain entry: no wanted amount").toEqual(["TEST-ONLY Plain", "", ""]);
  const queued = addon.eval(`return #${HELPER}.queue`);
  addon.eval(`local AH = ${HELPER} AH.QueueCost("TEST-ONLY Plain", { key = { itemID = 1 } }) AH.QueueCost({ term = 1, want = 0 }, { key = { itemID = 1 } })`);
  expect(addon.eval(`return #${HELPER}.queue`), "nothing to price").toBe(queued);
  addon.slash("ah");
  expect(chatHas(addon, /prices clear, restock\./), "the help names restock").toBe(true);
});
