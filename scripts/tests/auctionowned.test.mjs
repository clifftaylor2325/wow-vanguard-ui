// auctionowned: the Auction helper (Modules/AuctionHelper.lua) and its price store
// (Modules/AuctionPrices.lua), at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, isTok, loggedIn } from "./helpers.mjs";

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
const SCAN_BUTTON = `${HELPER}.scanCard.scan`;
// The Shopping card's list (a table), and its results view.
const TABLE = `${HELPER}.shopCard.body.table`;
// A logged-in addon at the TEST-ONLY auction house (extra Lua runs before login).
function atAuctionHouse(extra = "", opts) {
  const addon = loggedIn(AH_ENV + extra, opts);
  addon.world.openAuctionHouse();
  addon.update(0);
  return addon;
}
// The replicate list (a Lua list of rows), a click on Scan, the list arriving, and frames until the walk ends.
function scan(addon, rows) {
  addon.eval(`__wfgWorld.ah.replicate = ${rows}`);
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  for (let i = 0; i < 10; i++) addon.update(0.01);
}
// Picks a tab on the window: 1-3 the game's, 4 Lists, 5 Posting.
const pickTab = (addon, i) => addon.click(`AuctionHouseFrame.Tabs[${i}]`);
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
// The pane's action buttons that work now, by their text.
const actions = (addon) => addon.eval(`local out = {} for _, b in ipairs(${HELPER}.pane.actions) do if b:IsEnabled() then out[#out + 1] = b.text:GetText() end end return out`);
// Picks an entry in the pane by its key (a list's name, or AH.RECENT, AH.DEALS...), as a click on its row does.
const pick = (addon, key) => addon.eval(`${HELPER}.PickEntry(${key})`);
// Opens the filter dialog of shop row i from its right-click menu.
function openFilters(addon, i) {
  addon.click(`${TABLE}.rows[${i}]`, "RightButton");
  addon.click("Vanguard_Menu.items[1]");
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
it("restricted calls run only inside a click", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP + OWNED.replace("__wfgWorld.ah.commodities[10940] = {", "__wfgWorld.ah.unused = {"));
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.post`);
  addon.advance(1);
  checkUndercuts(addon);
  addon.click(`${OWNED_CARD}.table.rows[2].cancel`);
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
  addon.click(`${OWNED_CARD}.table.rows[1].cancel`);
  addon.hover(`${OWNED_CARD}.table.rows[1].cancel`);
  expect([restrictedLog(addon).length, addon.eval("return #GameTooltip.__lines")], "the game won't cancel it; no cost shown when hidden").toEqual([0, 1]);
  addon.wheel(`${OWNED_CARD}.table.rows[1]`, -5);
  expect([ownedRow(addon, 1)[2], ownedRow(addon, 7)[0], ownedRow(addon, 8)[0]], "seven auctions (one sold) on seven rows; the wheel has nothing to scroll").toEqual(["1s 50c", true, false]);
});
// Two more dust auctions of yours: 2 at 1s 30c a unit (undercut by the 1s 20c up) and 2 at 1s 10c (not).
const MORE_DUST = `table.insert(__wfgWorld.ah.owned, { auctionID = 506, itemKey = { itemID = 10940 }, status = 0, quantity = 2, buyoutAmount = 130 })
  table.insert(__wfgWorld.ah.owned, { auctionID = 507, itemKey = { itemID = 10940 }, status = 0, quantity = 2, buyoutAmount = 110 })`;
// Your auctions' status line: [its text, its font size, as the colour token].
const ownedTier = (addon) => {
  const t = addon.frame(`${OWNED_CARD}.table.status`);
  return [t.text, t.font.size, ["text2", "muted"].find((k) => isTok(addon, t.textColor, k))];
};
it("your auctions' line, while there are none to list, is an empty-state line (label muted), before a check and after", () => {
  const addon = atAuctionHouse(BAGS);
  const label = addon.eval("return ns.Theme.RoleSize('label')");
  expect(ownedTier(addon), "before a check: what Check undercuts does").toEqual(["Check undercuts lists your auctions and marks the ones someone asks less for.", label, "muted"]);
  addon.click(`${OWNED_CARD}.check`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect(ownedTier(addon), "checked, none up: said").toEqual(["No auctions of yours are up.", label, "muted"]);
  addon.eval(`__wfgWorld.ah.owned = { { auctionID = 501, itemKey = { itemID = 10940 }, status = 0, quantity = 5, buyoutAmount = 150 } }`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect(ownedTier(addon)[0], "an auction listed: nothing to say").toBe("");
});
const CANCEL_NEXT = `${OWNED_CARD}.cancelNext`;
// The line under your auctions, and whether Cancel next undercut works.
const nextState = (addon) => addon.eval(`local c = ${OWNED_CARD} return { c.summary:GetText(), c.cancelNext:IsEnabled() }`);
// The tooltip's lines.
const tipLines = (addon) => addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out");
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
  expect([nextState(addon), isTok(addon, addon.frame(`${CANCEL_NEXT}.text`).textColor, "disabled")], "none left: it says so and stops, its button in the disabled tier").toEqual([["none undercut", false], true]);
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
it("Cancel next undercut offers an auction again once its cancel did not go through", () => {
  const addon = atAuctionHouse(BAGS + OWNED + MORE_DUST);
  checkUndercuts(addon);
  addon.click(CANCEL_NEXT);
  addon.fire("AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED");
  checkUndercuts(addon);
  expect(addon.eval(`return ${HELPER}.NextUndercut().id`), "a fresh list while the cancel may be on its way: the next click takes the one after").toBe(506);
  addon.advance(10);
  checkUndercuts(addon);
  addon.advance(5);
  expect([nextState(addon), addon.eval(`return ${HELPER}.NextUndercut().id`)], "the game dropped it: 501 is still up and undercut, and offered again").toEqual([["2 undercut", true], 501]);
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
  const r = `${OWNED_CARD}.table.rows[${i}]`;
  const color = addon.frame(`${r}.cells.price`).textColor;
  const token = ["good", "gold", "text2"].find((t) => isTok(addon, color, t)) || "other";
  return addon.eval(`local r = ${r} return { r:IsShown(), r.name:GetText() or false, r.cells.price:GetText() or false, "${token}", r.cancel:IsShown(), r.relist:IsShown(), r.relist:IsEnabled() }`);
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
  expect([addon.eval(`return ${OWNED_CARD}.table.rows[2].flag:IsShown()`), ownedRow(addon, 4)[3], nextState(addon)], "only the blade still up is undercut (1s up)").toEqual([false, true, ["1 undercut", true]]);
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
  addon.click(`${OWNED_CARD}.table.rows[2].relist`);
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
  addon.click(`${OWNED_CARD}.table.rows[3].relist`);
  expect([card(addon)[1], sent(addon), ownedRow(addon, 3)[0]], "the blade from bag 1 is on the sell card, its price checked; the row goes").toEqual(["TEST-ONLY-BLADE", ["SendSellSearchQuery:9999"], false]);
  expect(addon.eval(`local s = ${HELPER}.sell return { s.loc.bagID, s.loc.slotIndex }`), "the bag slot it found").toEqual([1, 4]);
  expect(restrictedLog(addon).length, "relisting posts nothing by itself").toBe(0);
});
// Searches feed the price store ---------------------------------------------------------------

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
// Disenchant values ----------------------------------------------------------------------------

// TEST-ONLY gear (item level 18 unless said): green armour and a green weapon, a blue at 60, an
// epic at 58, and what doesn't disenchant: a green trade good, white armour, green armour at 3,
// green armour whose quality the client hides.
const GEAR = `
  local function gear(id, classID, quality, level) __wfgWorld.items[id] = { name = "TEST-ONLY Gear " .. id, classID = classID, quality = quality, level = level } end
  gear(9101, 4, 2, 18) gear(9102, 2, 2, 18) gear(9103, 4, 3, 60) gear(9104, 2, 4, 58)
  gear(9105, 7, 2, 18) gear(9106, 4, 1, 18) gear(9107, 4, 2, 3) gear(9108, 4, __wfgWorld.secret(2), 18)`;
// Strange Dust's market is 1s, Greater Magic Essence has a low of 10s only, a Large Brilliant Shard
// went for 3g; the greens' shard and Nexus Crystals have no price.
const MATS = "ns.AuctionPrices.Record(10940, 80, __now, { units = 10, market = 100 }) ns.AuctionPrices.Record(10939, 1000, __now) ns.AuctionPrices.Record(14344, 30000, __now)";
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
  addon.eval('ns.Options.Show("town")');
  addon.eval('__click("Disenchant values in tooltips")');
  expect([addon.eval("return ns.Settings('AuctionHelper').disenchant"), tipOf(addon, 9101)], "ticked: on without Enchanting").toEqual([true, ["Disenchant: ~4s 87c"]]);
  addon.eval(ENCHANTER);
  addon.eval("local _, set = ns.AuctionPrices.DisenchantSetting() set(false)");
  expect(tipOf(addon, 9101), "unticked: off even for an enchanter").toEqual([]);
  addon.eval("ns.Settings('AuctionHelper').disenchant = nil");
  expect([tipOf(addon, 9101), addon.eval("return select(3, ns.AuctionPrices.DisenchantSetting())")], "not set: follows Enchanting again").toEqual([["Disenchant: ~4s 87c"], true]);
  addon.eval("__wfgWorld.professions = {}");
  expect(addon.eval("return ns.AuctionPrices.HasEnchanting()"), "no profession: not an enchanter").toBe(false);
  addon.eval("__wfgWorld.skills[333] = { name = 'Enchanting', rank = 1, maxRank = 75 }");
  expect(addon.eval("return ns.AuctionPrices.HasEnchanting()"), "a skill line with a rank: an enchanter").toBe(true);
  addon.eval("GetProfessions, C_TradeSkillUI = nil, nil __wfgWorld.skills[333].rank = 0");
  expect(addon.eval("return ns.AuctionPrices.HasEnchanting()"), "no professions API and rank 0: not an enchanter").toBe(false);
  addon.eval("__wfgWorld.skills[333].rank = 75");
  expect(addon.eval("return ns.AuctionPrices.HasEnchanting()"), "no professions API, ranked skill: an enchanter").toBe(true);
  addon.eval("C_SkillInfo = nil");
  expect(addon.eval("return ns.AuctionPrices.HasEnchanting()"), "a client that can't say: not an enchanter").toBe(false);
});
// Deals ----------------------------------------------------------------------------------------

// Today, as the price store counts days, at the TEST-ONLY clock.
const TODAY = Math.floor(1790000000 / 86400);
// Saved prices of Strange Dust on this realm and faction: its low of yesterday, `low`, and more
// fields (Lua) when given.
const dustHistory = (low, fields = "") => `VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 1, lastScan = 0, prices = {
  [10940] = { min = ${low}, t = 1790000000 - 86400, days = { [${TODAY - 1}] = ${low} } ${fields} } } } } }`;
// Deal row i (the Deals entry shown): [shown, name, price, how far under, judged against].
const dealRow = (addon, i) => addon.eval(`local r = ${TABLE}.rows[${i}] return { r:IsShown(), r.name:GetText() or false, r.cells.price:GetText() or false, r.cells.off:GetText() or false, r.cells.basis:GetText() or false }`);
// The Deals entry: [in the pane, its count there, the card's heading and count, the status line].
const dealsCard = (addon) => addon.eval(`local AH, e = ${HELPER}, nil
  for _, x in ipairs(AH.PaneEntries()) do if x.key == AH.DEALS then e = x end end
  return { e ~= nil, e and e.count or false, AH.shopCard.title:GetText(), AH.shopCard.progress:GetText(), ${TABLE}.status:GetText() }`);
it("deals: a scan lists what's under 70 % of the 7-day market or under vendor price, best first, as an entry in the Lists pane", () => {
  const markets = `, markets = { [${TODAY - 1}] = 1200, [${TODAY - 2}] = 1000, [${TODAY - 8}] = 9000 }`;
  const addon = atAuctionHouse(DUSTS, { savedVariables: dustHistory(1000, markets) });
  pickTab(addon, 4);
  expect(dealsCard(addon).slice(0, 3), "the entry, with no count yet; a list shown").toEqual([true, 0, "Shopping"]);
  pick(addon, `${HELPER}.DEALS`);
  expect([dealsCard(addon), dealRow(addon, 1)[0], actions(addon), addon.eval(`return ${HELPER}.shopCard.add:IsShown()`)], "none yet; no list buttons").toEqual([[true, 0, "Deals", "", "None yet: a scan or a search finds them."], false, ["New", "Import"], false]);
  scan(addon, `{ { itemID = 10940, count = 1, buyoutPrice = 500 }, { itemID = 10940, count = 30, buyoutPrice = 39000 },
    { itemID = 2589, count = 5, buyoutPrice = 50 }, { itemID = 159, count = 1, buyoutPrice = 100 } }`);
  expect(addon.eval("return ns.GetModule('AuctionHelper').Market7(10940, __now)"), "the dust's 7-day market: the middle of 12s, 10s and today's 11s 40c (8 days ago left out)").toBe(1140);
  expect([1, 2, 3].map((i) => dealRow(addon, i)), "linen under its 13c vendor price first, then dust 55 % under its market; water isn't a deal").toEqual([
    [true, "Linen Cloth", "10c", "< vendor", "Vendor price 13c"], [true, "Strange Dust", "5s 0c", "-56 %", "7-day market 11s 40c"], [false, false, false, false, false]]);
  expect([dealsCard(addon), isTok(addon, addon.eval(`return ${TABLE}.rows[2].cells.off.__textColor`), "good")], "the count; how far under in good").toEqual([[true, 2, "Deals", "2 found", ""], true]);
  addon.hover(`${TABLE}.rows[2]`);
  expect(tipLines(addon), "what the dust was judged against, and when it was found").toEqual(["Strange Dust", "7-day market: 11s 40c", "Found 0 min ago.", "Click to show it in the auction house's list."]);
  addon.hover(`${TABLE}.rows[1]`);
  expect(tipLines(addon), "the linen's vendor price it is under (one day of market is no basis)").toEqual(["Linen Cloth", "Vendor price: 13c", "Found 0 min ago.", "Click to show it in the auction house's list."]);
  addon.hover(null);
  expect(addon.eval("return GameTooltip:IsShown()"), "gone with the mouse").toBe(false);
  addon.click(`${TABLE}.rows[1]`);
  expect([sent(addon).at(-1), restrictedLog(addon), addon.eval("return AuctionHouseFrame.selectedTab"), addon.frame("Vanguard_AuctionShopping").visible], "a click shows it in the game's own list, on its Buy tab; nothing is bought").toEqual(["SearchForItemKeys:2589", [], 1, false]);
});
it("deals: one outlier day doesn't set the market, and a single day of market is no basis", () => {
  const outlier = `, markets = { [${TODAY - 1}] = 1000, [${TODAY - 2}] = 1100, [${TODAY - 3}] = 1200, [${TODAY - 4}] = 33566 }`;
  const addon = atAuctionHouse(DUSTS, { savedVariables: dustHistory(1000, outlier) });
  scan(addon, "{ { itemID = 10940, count = 1, buyoutPrice = 900 } }");
  expect(addon.eval("return ns.GetModule('AuctionHelper').Market7(10940, __now)"), "the median of five days (900 today), not the mean of 7,553").toBe(1100);
  const alone = atAuctionHouse(DUSTS, { savedVariables: dustHistory(1000, `, markets = { [${TODAY - 1}] = 33566 }`) });
  expect(alone.eval("return ns.GetModule('AuctionHelper').Market7(10940, __now)"), "one day of market: none, so the low before today stands in").toBe(null);
});
it("deals: each search judges its item again; a low before today stands in for a market; kept 30 minutes after closing", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP + CLICK_LUA, { savedVariables: dustHistory(150) });
  pickTab(addon, 4);
  pick(addon, `${HELPER}.DEALS`);
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.update(0.01);
  expect(dealRow(addon, 1), "the sell search's 1s (your 95c left out) is a third under yesterday's 1s 50c").toEqual([true, "Strange Dust", "1s 0c", "-33 %", "Prior 6-day low 1s 50c"]);
  addon.hover(`${TABLE}.rows[1]`);
  expect(tipLines(addon)[1], "judged against").toBe("Prior 6-day low: 1s 50c");
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 180, totalQuantity = 5 } }");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.update(0.01);
  expect([dealsCard(addon), dealRow(addon, 1)[0]], "a browse sees it at 1s 80c now: no longer a deal").toEqual([[true, 0, "Deals", "", "None yet: a scan or a search finds them."], false]);
  addon.eval(`local AP = ns.AuctionPrices for i = 1, 10 do AP.Record(50000 + i, 1000, __now - 86400) end
    for i = 1, 10 do AP.RecordSeen(50000 + i, 1000 - 10 * i) end`);
  addon.update(0.01);
  expect([dealsCard(addon)[3], dealRow(addon, 1).slice(1, 4), dealRow(addon, 8)[1]], "ten deals, furthest under first, on their rows").toEqual(["10 found", ["item 50010", "9s 0c", "-10 %"], "item 50003"]);
  addon.wheel(`${TABLE}.rows[1]`, -1);
  expect(dealRow(addon, 1)[1], "ten deals fit the rows: the wheel has nothing to scroll").toBe("item 50010");
  addon.wheel(`${TABLE}.rows[1]`, -5);
  expect([dealRow(addon, 1)[1], dealRow(addon, 10)[1], dealRow(addon, 11)[0]], "every deal on its row, none past the last").toEqual(["item 50010", "item 50001", false]);
  addon.wheel(`${TABLE}.rows[1]`, 9);
  expect(dealRow(addon, 1)[1], "nor above the first").toBe("item 50010");
  addon.world.closeAuctionHouse();
  addon.eval("__now = __now + 720 ns.AuctionPrices.RecordSeen(50001, 1)");
  addon.world.openAuctionHouse();
  addon.update(0);
  pickTab(addon, 4);
  expect([dealsCard(addon), dealRow(addon, 10).slice(1, 4)], "back from the mailbox 12 minutes later: the deals are kept and say how old; nothing was judged while the house was closed").toEqual([[true, 10, "Deals", "10 found, the oldest 12 min ago", ""], ["item 50001", "9s 90c", "-1 %"]]);
  addon.hover(null);
  addon.hover(`${TABLE}.rows[1]`);
  expect(tipLines(addon)[2], "each row says when it was found").toBe("Found 12 min ago.");
  addon.world.closeAuctionHouse();
  addon.eval("__now = __now + 1799");
  addon.world.openAuctionHouse();
  addon.update(0);
  expect(addon.eval(`return next(${HELPER}.deals) ~= nil`), "the 30 minutes count from closing: still kept a second short of them").toBe(true);
  addon.world.closeAuctionHouse();
  addon.eval("__now = __now + 1800");
  addon.world.openAuctionHouse();
  addon.update(0);
  pickTab(addon, 4);
  expect(dealsCard(addon), "30 minutes after the house closed they are gone, Deals still shown").toEqual([true, 0, "Deals", "", "None yet: a scan or a search finds them."]);
  addon.eval('ns.Options.Show("town") __click("Deals list")');
  addon.eval("ns.AuctionPrices.RecordSeen(50001, 1)");
  expect([addon.eval("return ns.Settings('AuctionHelper').deals"), dealsCard(addon).slice(0, 3), addon.eval(`return next(${HELPER}.deals) == nil`)], "switched off under Auction house: the entry goes at once and gives way to no list, nothing is judged").toEqual([false, [false, false, "Shopping"], true]);
});
it("deals: what was found is forgotten 30 minutes after closing even if the house isn't opened again", () => {
  const addon = atAuctionHouse();
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 5)");
  addon.world.closeAuctionHouse();
  addon.eval("__now = __now + 1800");
  addon.update(1800);
  expect(addon.eval(`return { next(${HELPER}.deals) == nil, ${HELPER}.closed == nil }`), "the timer drops the deals").toEqual([true, true]);
});
it("deals: the forget timer leaves alone a house opened again before it fires", () => {
  const addon = atAuctionHouse();
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 5)");
  addon.world.closeAuctionHouse();
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.eval("__now = __now + 1800");
  addon.update(1800);
  expect(addon.eval(`return next(${HELPER}.deals) ~= nil`), "open: the timer does nothing").toBe(true);
});
it("deals: kept deals are this realm and side's alone", () => {
  const addon = atAuctionHouse();
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 5)");
  addon.world.closeAuctionHouse();
  addon.eval("__wfgWorld.units.player.faction = 'Horde'");
  addon.world.openAuctionHouse();
  addon.update(0);
  expect(addon.eval(`return next(${HELPER}.deals) == nil`), "the Alliance deal is not shown at the Horde house").toBe(true);
});
it("deals: with the tabs off nothing is built, and a deal found paints nothing", () => {
  const addon = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 5)");
  addon.update(0.01);
  expect([addon.eval(`return ${HELPER}.shopCard == nil`), addon.eval(`return ${HELPER}.deals[2589].price`), addon.eval("return #ns.errors")], "no card, the deal kept, no error").toEqual([true, 5, 0]);
});
// Price alerts ---------------------------------------------------------------------------------

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
