// auctionpost: Post on the Auction helper's Sell card (Modules/AuctionSell.lua) driven the way a
// player drives it, from the bag click to the last stack, with the client's message throttle and
// item lock modelled (world.ah.throttle, world.finishPost) and no caught error after any step.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

const HELPER = "ns.GetModule('AuctionHelper')";
const CARD = `${HELPER}.sellCard`;

// TEST-ONLY bags: 45 Linen Cloth (a commodity) in three slots, someone asking 2s a unit; a blade
// (an item) in bag 0 slot 2, someone asking 50s for one; the game's names for the auction lengths;
// the throttle modelled.
const BAGS = `__wfgWorld.items[2589].commodity = true
  __wfgWorld.items[9999] = { name = "TEST-ONLY Blade", icon = "TEST-ONLY-BLADE", level = 25, suffix = 7 }
  __wfgWorld.bags[0][3] = { itemID = 2589, count = 20 }
  __wfgWorld.bags[1][1] = { itemID = 2589, count = 20 }
  __wfgWorld.bags[1][2] = { itemID = 2589, count = 5 }
  __wfgWorld.bags[0][2] = { itemID = 9999, count = 1 }
  __wfgWorld.ah.commodities[2589] = { { unitPrice = 200, quantity = 10 } }
  __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }
  __wfgWorld.ah.throttle = true
  AUCTION_DURATION_ONE, AUCTION_DURATION_TWO = "TEST-ONLY 12 Hours", "TEST-ONLY 24 Hours"`;

// A logged-in addon at the TEST-ONLY auction house, on the helper's Selling tab (extra Lua runs before login).
function atSelling(extra = "") {
  const addon = loggedIn(BAGS + extra);
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.click(`${HELPER}.tabs[2]`);
  return addon;
}

// The caught errors' texts, so far.
const errors = (addon) => {
  const list = addon.eval("local out = {} for i, e in ipairs(ns.errors) do out[i] = e.text end return out");
  return Array.isArray(list) ? list : [];
};

// The restricted calls so far, as [fn, clicked, args...] (an item location as "bag:slot").
const posts = (addon) => {
  const list = addon.eval(`local out = {}
    for i, c in ipairs(__wfgWorld.ah.restricted) do
      local row = { c.fn, c.clicked }
      for j = 1, 5 do local a = c.args[j] row[#row + 1] = type(a) == "table" and (a.bagID .. ":" .. a.slotIndex) or (a == nil and "nil" or a) end
      out[i] = row
    end
    return out`);
  return Array.isArray(list) ? list : [];
};

// The sell card as the player sees it: [item on it, Post on, the count line].
const card = (addon) => addon.eval(`local c = ${CARD} return { ${HELPER}.sell ~= nil, c.post:IsEnabled(), c.status:GetText() }`);

// Bag item `slot` of bag 0 clicked, back on the Selling tab (the game's SetPostItem shows its own
// sell page), and the price check answered with `event` once it is sent (searches go a second apart).
function bagClick(addon, slot, event, payload) {
  addon.world.postFromBag(0, slot);
  addon.click(`${HELPER}.tabs[2]`);
  addon.advance(1);
  addon.fire(event, payload);
}

it("Post on a commodity, end to end: bag click, price check, each stack up through the throttle", () => {
  const addon = atSelling();
  expect([card(addon), errors(addon)], "the Selling tab: nothing on the card, no error").toEqual([[false, false, ""], []]);
  addon.world.postFromBag(0, 3);
  expect(addon.eval("local q = __wfgWorld.ah.queries[#__wfgWorld.ah.queries] return { q.fn, q.args[1].itemID }"), "the bag click: the item's price check is sent").toEqual(["SendSellSearchQuery", 2589]);
  addon.click(`${HELPER}.tabs[2]`);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.click(`${CARD}.qtyMax`);
  expect([card(addon), errors(addon)], "priced 1s under 2s: all 45, three stacks of 20, Post on").toEqual([[true, true, "posted 0 of 3"], []]);
  addon.click(`${CARD}.post`);
  expect([posts(addon), card(addon), errors(addon)], "the first stack from the click; the throttle drops and Post waits").toEqual([[["PostCommodity", true, "0:3", 1, 20, 100, "nil"]], [true, false, "posted 1 of 3 · waiting for the auction house"], []]);
  addon.world.finishPost(501);
  expect([addon.eval("return __wfgWorld.bags[0][3] == nil"), card(addon), errors(addon)], "the house took it: the slot is empty, Post is on again").toEqual([true, [true, true, "posted 1 of 3"], []]);
  addon.click(`${CARD}.post`);
  addon.world.finishPost(502);
  addon.click(`${CARD}.post`);
  expect([posts(addon).map((p) => [p[0], p[2], p[4]]), card(addon), errors(addon)], "each stack from the next slot; the last 5 empty the card").toEqual([[["PostCommodity", "0:3", 20], ["PostCommodity", "1:1", 20], ["PostCommodity", "1:2", 5]], [false, false, "posted 3 of 3"], []]);
  addon.world.finishPost(503);
  expect([posts(addon).length, posts(addon).every((p) => p[1]), errors(addon)], "nothing more, every post from a click, no error").toEqual([3, true, []]);
});

it("Post on an item, end to end: the bid and buyout in whole silver where the game takes no copper", () => {
  const addon = atSelling("__wfgWorld.ah.copper = false SetCVar('auctionHouseDurationDropdown', 2)");
  bagClick(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.type(`${CARD}.bid`, "10s 50c");
  expect([card(addon), errors(addon)], "one blade; the bid under the buyout").toEqual([[true, true, "posted 0 of 1"], []]);
  addon.click(`${CARD}.post`);
  expect([posts(addon), card(addon)], "the blade for the length last used, bid 10s 50c up to 11s, buyout 49s").toEqual([[["PostItem", true, "0:2", 2, 1, 1100, 4900]], [false, false, "posted 1 of 1"]]);
  addon.world.finishPost(601);
  expect([addon.eval("return __wfgWorld.bags[0][2] == nil"), errors(addon)], "the blade went up; no error").toEqual([true, []]);
});

it("Post off says why on the card, and a click the game is too busy for says so in chat", () => {
  const addon = atSelling("__wfgWorld.ah.commodities[2589] = {} __wfgWorld.items[2589].sellPrice = 150");
  bagClick(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  expect(card(addon), "nothing up and no 7-day low: no price").toEqual([true, false, "posted 0 of 1 · no price yet: wait for the price check, or type one"]);
  addon.type(`${CARD}.price`, "1s");
  expect(card(addon)[2], "1s a unit is under the vendor's 1s 50c").toBe("posted 0 of 1 · under the vendor price");
  addon.type(`${CARD}.price`, "2s");
  addon.eval("__wfgWorld.money = 10");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(card(addon)[2], "10c won't pay a 3s deposit").toBe("posted 0 of 1 · not enough money for the deposit");
  addon.eval("__wfgWorld.money = 123456 __wfgWorld.bags[0][3] = nil __wfgWorld.bags[1] = {}");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(card(addon), "no linen left in the bags").toEqual([true, false, "posted 0 of 1 · the item isn't in your bags"]);
  addon.eval("__wfgWorld.bags[0][3] = { itemID = 2589, count = 20 } __wfgWorld.ah.ready = false");
  addon.fire("AUCTION_HOUSE_THROTTLED_MESSAGE_SENT");
  expect(card(addon), "a message sent: the game is busy").toEqual([true, false, "posted 0 of 1 · waiting for the auction house"]);
  addon.eval("__wfgWorld.ah.ready = true");
  addon.fire("AUCTION_HOUSE_THROTTLED_SYSTEM_READY");
  addon.eval("__wfgWorld.ah.ready = false");
  addon.click(`${CARD}.post`);
  expect([posts(addon), chatHas(addon, /Can't post yet: waiting for the auction house\./), card(addon)[1]], "busy since the paint: no post, chat says why, Post goes off").toEqual([[], true, false]);
  bagClick(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.type(`${CARD}.bid`, "60s");
  expect(card(addon)[2], "a bid over the 49s buyout").toBe("posted 0 of 1 · the bid must be under the buyout");
  addon.click(`${CARD}.stop`);
  addon.eval(`${HELPER}.Post()`);
  expect([card(addon), posts(addon), errors(addon)], "nothing on the card: Post does nothing, and no error").toEqual([[false, false, "posted 0 of 1"], [], []]);
});
