// auction: the Auction helper (Modules/AuctionHelper.lua) and its price store
// (Modules/AuctionPrices.lua), at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn, setCombat } from "./helpers.mjs";

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
// A logged-in addon at the TEST-ONLY auction house (extra Lua runs before login).
function atAuctionHouse(extra = "", opts) {
  const addon = loggedIn(AH_ENV + extra, opts);
  addon.world.openAuctionHouse();
  addon.update(0);
  return addon;
}
// The replicate list (a Lua list of rows), the scan card painted (as its countdown is while it shows), a click
// on Scan, the list arriving, and frames until the walk ends.
function scan(addon, rows) {
  addon.eval(`__wfgWorld.ah.replicate = ${rows} ${HELPER}.PaintScan()`);
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  for (let i = 0; i < 10; i++) addon.update(0.01);
}
// Two listings of Linen Cloth (5 for 500, 1 for 90) and one of water with no buyout.
const LINEN = "{ { itemID = 2589, count = 5, buyoutPrice = 500 }, { itemID = 2589, count = 1, buyoutPrice = 90 }, { itemID = 159, count = 1, buyoutPrice = 0, minBid = 5 } }";
// The scan card's "last scan" line.
const lastLine = (addon) => addon.eval(`return ${HELPER}.scanCard.last:GetText()`);
it("a scan records each item's cheapest unit price and the day's low", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  const p = addon.eval("local p = ns.AuctionPrices.House().prices[2589] return { p.min, p.t, p.days[math.floor(__now / 86400)] }");
  expect(p, "90 a unit beats 500 for 5, today").toEqual([90, 1790000000, 90]);
  expect(addon.eval("return { ns.AuctionPrices.House().prices[159] == nil, ns.AuctionPrices.House().count }"), "a listing without a buyout is skipped").toEqual([true, 1]);
  expect(chatHas(addon, /Auction house scanned: 3 listings, prices for 1 items\./), "says what it read").toBe(true);
  expect(addon.eval("return __wfgWorld.ah.queries[1].fn"), "one whole-house query").toBe("ReplicateItems");
  expect(lastLine(addon), "the line under the button: when, and how many items are priced").toBe("Scanned 0 min ago · 1 items");
});
// The scan button: [its label, whether it can be clicked].
const scanButton = (addon) => addon.eval(`local b = ${SCAN_BUTTON} return { b.text:GetText(), b:IsEnabled() }`);
it("scans are 15 minutes apart: the button is greyed and counts down until then", () => {
  const addon = atAuctionHouse();
  addon.click("AuctionHouseFrame.Tabs[4]");
  scan(addon, LINEN);
  addon.eval("__now = __now + 600");
  addon.update(15);
  expect(scanButton(addon), "greyed, with the minutes left").toEqual(["Next scan in 5 min", false]);
  addon.click(SCAN_BUTTON);
  addon.slash("ah scan");
  expect([addon.eval("return #__wfgWorld.ah.queries"), chatHas(addon, /One auction house scan every 15 minutes: the next in 5 min\./)], "too soon: nothing sent; the command says when").toEqual([1, true]);
  expect(lastLine(addon), "the line counts the minutes").toBe("Scanned 10 min ago · 1 items");
  addon.eval("__now = __now + 240");
  addon.update(15);
  expect(scanButton(addon), "the countdown repaints while the card shows").toEqual(["Next scan in 1 min", false]);
  addon.eval("__now = __now + 60");
  addon.update(15);
  expect(scanButton(addon), "15 minutes on: ready").toEqual(["Scan the auction house", true]);
  addon.click(SCAN_BUTTON);
  expect([addon.eval("return #__wfgWorld.ah.queries"), lastLine(addon)], "after 15 minutes a new scan starts").toEqual([2, "scanning 0 of 0"]);
  addon.click(SCAN_BUTTON);
  expect([addon.eval("return #__wfgWorld.ah.queries"), chatHas(addon, /Already scanning: 0 of 0 read\./)], "not while one runs, and chat says it is running").toEqual([2, true]);
});
it("a second Scan click while the first scan runs says it is scanning, never a time to wait", () => {
  const addon = atAuctionHouse();
  addon.eval(`${HELPER}.StartScan() ${HELPER}.StartScan()`);
  const lines = Array.from(addon.chat()).filter((l) => /scan/i.test(l));
  expect([lines.some((l) => /next in/.test(l)), chatHas(addon, /Already scanning: 0 of 0 read\./)], "no first scan yet: no \"next in -29 million min\"").toEqual([false, true]);
});
it("the 15 minutes are the account's: a scan on one side greys the button on the other", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  addon.eval(`__wfgWorld.units.player.faction = 'Horde' __now = __now + 120 ${HELPER}.PaintScan()`);
  expect([scanButton(addon), lastLine(addon)], "another house, no prices of its own yet, but the account's last scan counts").toEqual([["Next scan in 13 min", false], "no scan yet"]);
});
it("a scan the house doesn't answer is given up after 90 s, says why and counts down from the try; a list that still comes is read", () => {
  const addon = atAuctionHouse("__wfgWorld.ah.replicate = { { itemID = 2589, count = 1, buyoutPrice = 90 } }");
  addon.click(SCAN_BUTTON);
  addon.update(89);
  expect(lastLine(addon), "waiting").toBe("scanning 0 of 0");
  addon.update(1);
  expect([addon.eval(`return ${HELPER}.scan == nil`), lastLine(addon), scanButton(addon)], "given up on: no scan running, the button counts down from the try").toEqual([true, "no scan yet", ["Next scan in 15 min", false]]);
  expect(chatHas(addon, /hasn't answered the scan: another character or auction addon may have scanned in the last 15 minutes/), "chat says why").toBe(true);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  expect([addon.eval("return ns.AuctionPrices.House().prices[2589].min"), chatHas(addon, /Auction house scanned: 1 listings/)], "the late list is read all the same").toEqual([90, true]);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  expect(addon.eval("return #__wfgWorld.ah.queries"), "a second list event with no scan waiting does nothing").toBe(1);
});
it("a scan answered in time is not given up on, and closing the house forgets one given up on", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  addon.update(90);
  expect(chatHas(addon, /hasn't answered/), "answered: no message").toBe(false);
  addon.eval("__now = __now + 900");
  addon.click("AuctionHouseFrame.Tabs[4]");
  addon.click(SCAN_BUTTON);
  addon.update(90);
  addon.world.closeAuctionHouse();
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  expect(addon.eval(`return { ${HELPER}.scan == nil, ${HELPER}.lateScan == nil }`), "closed: nothing waits for a list").toEqual([true, true]);
});
it("the last scan's line counts in hours and days, the thousands apart, and turns the warning colour after a day", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  addon.eval(`ns.AuctionPrices.House().count = 8412 __now = __now + 7200 ${HELPER}.PaintScan()`);
  // The line's text, and whether it is in the warning colour.
  const line = () => [lastLine(addon), isTok(addon, addon.eval(`return ${HELPER}.scanCard.last.__textColor`), "warn")];
  expect(line(), "two hours: plain").toEqual(["Scanned 2 h ago · 8,412 items", false]);
  addon.eval(`__now = __now + 2 * 86400 ${HELPER}.PaintScan()`);
  expect(line(), "two days: the warning colour").toEqual(["Scanned 2 days ago · 8,412 items", true]);
  addon.click(SCAN_BUTTON);
  expect(line(), "a new scan's progress is plain").toEqual(["scanning 0 of 0", false]);
});
it("one frame of a scan reads at most 400 listings", () => {
  const addon = atAuctionHouse();
  addon.eval("__rows = {} for i = 1, 1000 do __rows[i] = { itemID = 90000 + i % 7, count = 1, buyoutPrice = 1000 + i } end __wfgWorld.ah.replicate = __rows");
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  const reads = [];
  for (let i = 0; i < 4; i++) {
    addon.eval("__wfgWorld.ah.reads = 0");
    addon.update(0.01);
    reads.push([addon.world.get("ah.reads"), lastLine(addon)]);
  }
  expect(reads, "400, 400, then the last 200; the line counts them").toEqual([[400, "scanning 400 of 1000"], [400, "scanning 800 of 1000"], [200, "Scanned 0 min ago · 7 items"], [0, "Scanned 0 min ago · 7 items"]]);
  expect(addon.eval("return { ns.AuctionPrices.House().count, ns.AuctionPrices.House().prices[90001].min }"), "7 items, each at its cheapest").toEqual([7, 1001]);
});
it("the tooltip line says what an item went for, and when", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  const [line] = addon.eval('return __showItem("item:2589")');
  expect([line[0], isTok(addon, line[1], "text2")], "the cheapest unit price, in text2").toEqual(["AH: 90c (today)", true]);
  expect(addon.eval('return #__showItem("item:159")'), "no line for an item no scan priced").toBe(0);
  addon.eval("__now = __now + 86400");
  expect(addon.eval('return __showItem("item:2589")[1][1]')).toBe("AH: 90c (yesterday)");
  addon.eval("__now = __now + 2 * 86400 ns.AuctionPrices.House().prices[2589].min = 123456 ns.AuctionPrices.House().prices[2589].markets = {}");
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "gold, silver and copper").toBe("AH: 12g 34s 56c (3 days ago)");
  addon.eval("ns.AuctionPrices.House().prices[2589].min = 1250");
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "silver and copper").toBe("AH: 12s 50c (3 days ago)");
  addon.eval("ns.Settings('AuctionHelper').tooltip = false");
  expect(addon.eval('return #__showItem("item:2589")'), "the switch turns it off").toBe(0);
});
it("pruning and caps: old prices go at login, and past the cap the oldest items go", () => {
  const day = 86400;
  const saved = `VanguardDB.ah = { count = 2, prices = {
    [1] = { min = 5, t = 1790000000 - 31 * ${day}, days = {} },
    [2] = { min = 6, t = 1790000000 - ${day}, days = { [math.floor(1790000000 / ${day}) - 30] = 1, [math.floor(1790000000 / ${day}) - 1] = 6 } } } }`;
  const addon = loggedIn(AH_ENV, { savedVariables: saved });
  const kept = addon.eval("local p = ns.AuctionPrices.House().prices local n = 0 for _ in pairs(p[2].days) do n = n + 1 end return { p[1] == nil, n, ns.AuctionPrices.House().count }");
  expect(kept, "the 31-day-old price is gone, and the other's 30-day-old low").toEqual([true, 1, 1]);
  expect(addon.eval("return ns.AuctionPrices.Low7(2)"), "the 7-day low").toBe(6);
  addon.eval("ns.AuctionPrices.House().prices, ns.AuctionPrices.House().count = {}, 0 local AP = ns.AuctionPrices AP.MAX_ITEMS = 10 for i = 1, 10 do AP.Record(100 + i, i, 1790000000 + i) end");
  expect(addon.eval("return ns.AuctionPrices.House().count"), "at the cap").toBe(10);
  addon.eval("ns.AuctionPrices.Record(200, 7, 1790000100)");
  const after = addon.eval("local p = ns.AuctionPrices.House().prices return { ns.AuctionPrices.House().count, p[101] == nil, p[102] == nil, p[103] ~= nil, p[200] ~= nil }");
  expect(after, "the 11th item keeps the newest 9: the two oldest go").toEqual([9, true, true, true, true]);
});
// History ------------------------------------------------------------------------------------

// 100 Linen Cloth up: 5 at 1s, 3 at 1s 20c and 92 at 2s a unit.
const LINEN_100 = "{ { itemID = 2589, count = 5, buyoutPrice = 500 }, { itemID = 2589, count = 3, buyoutPrice = 360 }, { itemID = 2589, count = 92, buyoutPrice = 18400 } }";
// Item 2589's values for the day `ago` days before __now: [low, units, market value] (false for none).
const dayOf = (addon, ago = 0) => addon.eval(`local p, d = ns.AuctionPrices.House().prices[2589], math.floor(__now / 86400) - ${ago}
  return { p.days[d] or false, p.qtys[d] or false, p.markets[d] or false }`);
it("a scan keeps each day's low, units up and market value (the cheapest 15 % of the units)", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN_100);
  expect(dayOf(addon), "15 cheapest units: 5 at 100, 3 at 120, 7 at 200 average 150").toEqual([100, 100, 150]);
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "the low and the market").toBe("AH: 1s 0c · market 1s 50c (today)");
  addon.eval("GameTooltip.__owner = { count = 20 }");
  expect(addon.eval('local l = __showItem("item:2589") return { #l, l[2][1] }'), "over a stack of 20, what it comes to").toEqual([2, "AH x20: 20s 0c · market 30s 0c"]);
  addon.eval("GameTooltip.__owner = { count = __wfgWorld.secret(20) }");
  expect(addon.eval('return #__showItem("item:2589")'), "a hidden stack size: no stack line").toBe(1);
  addon.eval("__now = __now + 900");
  scan(addon, "{ { itemID = 2589, count = 4, buyoutPrice = 480 } }");
  expect([dayOf(addon), addon.eval("return ns.AuctionPrices.House().prices[2589].min")], "later the same day: the day's low stays, units and market are the latest").toEqual([[100, 4, 120], 120]);
  addon.eval("__now = __now + 86400 ns.AuctionPrices.Record(2589, 300, __now)");
  expect([dayOf(addon), dayOf(addon, 1), addon.eval("return ns.AuctionPrices.Low7(2589)")], "a price without units or market: the next day has its low only; the 7-day low spans both").toEqual([[300, false, false], [100, 4, 120], 100]);
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "no market known that day: the low alone").toBe("AH: 3s 0c (today)");
});
it("the market value is quantity-weighted over at least one unit, rounded down", () => {
  const addon = loggedIn(AH_ENV);
  // AP.Summary of a Lua table of { [unit price] = units }: [low, units, market].
  const summary = (prices) => addon.eval(`return { ns.AuctionPrices.Summary(${prices}) }`);
  expect(summary("{ [90] = 1 }"), "one unit: itself").toEqual([90, 1, 90]);
  expect(summary("{ [10] = 1, [20] = 9 }"), "10 units: 15 % is 1.5, so the cheapest 2").toEqual([10, 10, 15]);
  expect(summary("{ [7] = 2, [5] = 1, [100] = 17 }"), "20 units: the cheapest 3, (5 + 7 + 7) / 3 rounded down").toEqual([5, 20, 6]);
});
it("history: 7 days of values are kept, older ones go at login, and older versions' prices still read", () => {
  const today = Math.floor(1790000000 / 86400);
  // A by-day table with value v 6, 7 and 45 days back.
  const byDay = (v) => `{ [${today - 6}] = ${v}, [${today - 7}] = ${v}, [${today - 45}] = ${v} }`;
  const saved = `VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 2, lastScan = 0, prices = {
    [2589] = { min = 90, t = 1790000000, days = ${byDay(90)}, qtys = ${byDay(4)}, markets = ${byDay(95)} },
    [2592] = { min = 70, t = 1790000000, days = { [${today}] = 70 } } } } } }`;
  const addon = atAuctionHouse("", { savedVariables: saved });
  const left = addon.eval(`local p = ns.AuctionPrices.House().prices[2589] local out = {}
    for _, m in ipairs({ p.days, p.qtys, p.markets }) do local n = 0 for _ in pairs(m) do n = n + 1 end out[#out + 1] = n end return out`);
  expect(left, "each kind keeps only the day 6 days back").toEqual([1, 1, 1]);
  expect(addon.eval('return __showItem("item:2592")[1][1]'), "an older version's price: the low alone").toBe("AH: 70c (today)");
  addon.eval("ns.AuctionPrices.Record(2592, 60, __now, { units = 3, market = 65 })");
  expect(addon.eval("local p = ns.AuctionPrices.House().prices[2592] local d = math.floor(__now / 86400) return { p.days[d], p.qtys[d], p.markets[d] }"), "and it takes the new values").toEqual([60, 3, 65]);
});
// Realms and factions ------------------------------------------------------------------------

// The saved houses, as "key:count" sorted by key.
const houses = (addon) => addon.eval(`local out = {}
  for key, h in pairs(VanguardDB.ah.houses) do out[#out + 1] = key .. ":" .. h.count end
  table.sort(out) return out`);
// An older version's account-wide store: Linen Cloth at 90c, a scan 10 minutes ago, and a list.
const ACCOUNT_WIDE = `VanguardDB.ah = { count = 1, lastScan = 1790000000 - 600, list = "Shopping", lists = { Shopping = { 2589 } },
  prices = { [2589] = { min = 90, t = 1790000000, days = { [math.floor(1790000000 / 86400)] = 90 } } } }`;
it("the account-wide prices move into this realm and faction once; the lists stay account-wide", () => {
  const addon = atAuctionHouse("", { savedVariables: ACCOUNT_WIDE });
  expect(houses(addon), "one house: the realm's normalized name and the faction").toEqual(["ForeverTest-Alliance:1"]);
  expect(addon.eval("local ah = VanguardDB.ah return { ah.prices == nil, ah.count == nil, ah.lastScan == nil, ah.lists.Shopping[1] }"), "the old fields are gone, the list is where it was").toEqual([true, true, true, 2589]);
  expect([addon.eval('return __showItem("item:2589")[1][1]'), lastLine(addon)], "the tooltip and the last scan carry over").toEqual(["AH: 90c (today)", "Scanned 10 min ago · 1 items"]);
  addon.eval("ns.AuctionPrices.Migrate() ns.AuctionPrices.Prune(__now)");
  expect(houses(addon), "a second run moves nothing more").toEqual(["ForeverTest-Alliance:1"]);
  addon.eval("__wfgWorld.realm = 'Other-Realm Two'");
  expect([addon.eval('return #__showItem("item:2589")'), addon.eval("return ns.AuctionPrices.Low7(2589)")], "another realm has no price for it").toEqual([0, null]);
  addon.eval(`${HELPER}.PaintScan()`);
  addon.click(SCAN_BUTTON);
  expect(addon.eval("return #__wfgWorld.ah.queries"), "a scan kept from before the account-wide time counts only for its own house: it scans at once").toBe(1);
});
it("each realm and faction keeps its own prices and its own cap", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  addon.eval(`__wfgWorld.units.player.faction = 'Horde' ${HELPER}.PaintScan()`);
  expect([addon.eval('return #__showItem("item:2589")'), lastLine(addon)], "a Horde character on the realm sees none of it").toEqual([0, "no scan yet"]);
  addon.eval("__now = __now + 900");
  scan(addon, "{ { itemID = 2589, count = 1, buyoutPrice = 40 } }");
  addon.eval("__wfgWorld.realm = 'Second Realm'");
  addon.eval("local AP = ns.AuctionPrices AP.MAX_ITEMS = 10 for i = 1, 11 do AP.Record(100 + i, i, __now + i) end");
  expect(houses(addon), "the cap holds per house; the others keep theirs").toEqual(["ForeverTest-Alliance:1", "ForeverTest-Horde:1", "SecondRealm-Horde:9"]);
  addon.eval("__wfgWorld.realm = 'Forever Test'");
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "the Horde price").toBe("AH: 40c (today)");
  addon.eval("__wfgWorld.units.player.faction = 'Alliance'");
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "back on the Alliance side: its own").toBe("AH: 90c (today)");
  addon.slash("ah prices clear");
  expect(list(houses(addon)), "prices clear forgets every house").toEqual([]);
});
it("a full price store forgets the least listed items of one scan, keeping the busiest, not an arbitrary half", () => {
  const addon = atAuctionHouse();
  addon.eval("local AP = ns.AuctionPrices AP.MAX_ITEMS = 100 for i = 1, 101 do AP.Record(1000 + i, 5, __now, { listings = i }) end");
  const kept = addon.eval("local AP = ns.AuctionPrices local keep = math.floor(AP.MAX_ITEMS * AP.KEEP) local out = { keep, ns.AuctionPrices.House().count } for i = 1, 101 do out[#out + 1] = AP.House().prices[1000 + i] and i or 0 end return out");
  const [keep, count, ...ids] = kept;
  const present = ids.filter((i) => i > 0);
  expect([count, present.length, Math.min(...present), Math.max(...present)], "the busiest `keep` items stay: the listing counts 101 down to 101 - keep + 1").toEqual([keep, keep, 101 - keep + 1, 101]);
});
it("migration keeps the newer price of each item; login forgets stale and broken houses", () => {
  const t = 1790000000;
  const saved = `VanguardDB.ah = { houses = {
      ["ForeverTest-Alliance"] = { count = 2, lastScan = ${t}, prices = { [1] = { min = 5, t = ${t}, days = {} }, [2] = { min = 6, t = ${t - 100}, days = {} } } },
      ["Old-Horde"] = { count = 1, lastScan = 0, prices = { [1] = { min = 1, t = ${t - 31 * 86400}, days = {} } } },
      ["Broken-Alliance"] = { prices = 7 }, ["Junk"] = 5 },
    lastScan = ${t - 600}, prices = { [1] = { min = 50, t = ${t - 100}, days = {} }, [2] = { min = 60, t = ${t}, days = {} }, [3] = "junk" } }`;
  const addon = loggedIn(AH_ENV, { savedVariables: saved });
  const p = addon.eval("local p = ns.AuctionPrices.House().prices return { p[1].min, p[2].min, p[3] == nil, ns.AuctionPrices.House().lastScan }");
  expect(p, "the house's newer 5, the old store's newer 60, no junk; the later scan time").toEqual([5, 60, true, t]);
  expect(houses(addon), "a house not seen for 30 days and the broken ones are gone").toEqual(["ForeverTest-Alliance:2"]);
  const neutral = loggedIn(AH_ENV + "__wfgWorld.units.player.faction = 'Neutral' GetNormalizedRealmName = function() return nil end", { savedVariables: ACCOUNT_WIDE });
  expect(houses(neutral), "no side yet, and no normalized name: the realm's own name and 'none'").toEqual(["Forever Test-none:1"]);
});
it("a damaged saved price row is dropped at login and the helper stays on, whatever shape the row has", () => {
  const t = 1790000000;
  const shapes = {
    "a number": "5",
    "a row without a time": "{ min = 5 }",
    "a row whose days is a number": `{ min = 5, t = ${t}, days = 7 }`,
    "a row whose time is text": '{ min = 5, t = "soon", days = {} }',
  };
  for (const [shape, row] of Object.entries(shapes)) {
    const saved = `VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 2, lastScan = ${t}, prices = { [100] = ${row}, [101] = { min = 7, t = ${t}, days = {} } } } } }`;
    const addon = loggedIn(AH_ENV, { savedVariables: saved });
    const state = addon.eval("local p = ns.AuctionPrices.House().prices return { p[101] ~= nil, #ns.errors, ns.GetModule('AuctionHelper').settings ~= nil, ns.AuctionPrices.House().count }");
    const kept = shape === "a row whose days is a number" ? [true, 0, true, 2] : [true, 0, true, 1];
    expect(state, shape + ": no error, the helper on, the good row kept").toEqual(kept);
    expect(addon.eval("return ns.AuctionPrices.House().prices[100] == nil or type(ns.AuctionPrices.House().prices[100].days) == 'table'"), shape + ": the damaged row is gone or whole").toBe(true);
  }
  const old = loggedIn(AH_ENV, { savedVariables: `VanguardDB.ah = { prices = { [100] = { min = 5 }, [101] = { min = 6, t = ${t}, days = {} } }, lastScan = 5 }` });
  expect(old.eval("local p = ns.AuctionPrices.House().prices return { p[100] == nil, p[101].min, #ns.errors }"), "an old account-wide row with no time migrates without an error and is pruned").toEqual([true, 6, 0]);
});
it("a price noted under a clock set ahead stops counting once the clock is right, and a login clamps the time and drops the future days", () => {
  const addon = atAuctionHouse();
  addon.eval("local AP = ns.AuctionPrices AP.Record(2589, 9, __now + 3 * 86400) AP.Record(2589, 40, __now)");
  expect(addon.eval("return ns.AuctionPrices.Low7(2589, __now)"), "the low of the last 7 days ignores the day still to come").toBe(40);
  const t = 1790000000;
  const day = addon.eval("return ns.AuctionPrices.Day(__now)") + 3;
  const saved = `VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 1, lastScan = ${t}, prices = { [100] = { min = 5, t = ${t + 3 * 86400}, days = { [${day}] = 5, [${day - 3}] = 6 } } } } } }`;
  const login = loggedIn(AH_ENV, { savedVariables: saved });
  expect(login.eval("local p = ns.AuctionPrices.House().prices[100] local out = { p.t == __now, p.days[" + day + "] == nil } for _ in pairs(p.days) do out[#out + 1] = true end return out"), "the time is clamped to now, the future day is gone and today's stays").toEqual([true, true, true]);
});
it("a hidden number skips its listing without an error", () => {
  const addon = atAuctionHouse();
  scan(addon, "{ { itemID = 2589, count = __wfgWorld.secret(1), buyoutPrice = 90 }, { itemID = 2589, count = 2, buyoutPrice = 300 } }");
  expect(addon.eval("return { ns.AuctionPrices.House().prices[2589].min, #ns.errors }"), "only the plain listing counts").toEqual([150, 0]);
});
it("our Lists and Posting tabs are sized to their names, so the labels aren't cut off", () => {
  const addon = atAuctionHouse();
  const sizes = addon.eval("local out = {} for i = 4, 5 do local t = AuctionHouseFrame.Tabs[i] out[#out + 1] = { t:GetWidth(), #t:GetText() * 6 } end return out");
  expect(sizes.every(([w, text]) => w >= 70 && w >= text + 20), "each tab at least 70 px wide, with 20 px to spare beside its name").toBe(true);
});
// The window's title text.
const title = (addon) => addon.eval("return AuctionHouseFrame.TitleContainer.TitleText:GetText()");
// Picks a tab on the window: 1-3 the game's, 4 Lists, 5 Posting.
const pickTab = (addon, i) => addon.click(`AuctionHouseFrame.Tabs[${i}]`);
it("two tabs join the window after the game's three; each shows its page over the content area and names the title", () => {
  const addon = atAuctionHouse();
  const window = addon.frame("AuctionHouseFrame");
  const tabs = addon.eval("local out = {} for i, t in ipairs(AuctionHouseFrame.Tabs) do out[i] = t:GetText() end return out");
  expect([tabs, addon.eval("return AuctionHouseFrame.numTabs")], "Lists and Posting after Buy, Sell and Auctions").toEqual([["Buy", "Sell", "Auctions", "Lists", "Posting"], 5]);
  expect([addon.frame("Vanguard_AuctionShopping").visible, addon.frame("Vanguard_AuctionSelling").visible, title(addon)], "both pages hidden on the game's Buy page").toEqual([false, false, "Browse Auctions"]);
  pickTab(addon, 4);
  const page = addon.frame("Vanguard_AuctionShopping");
  expect([page.visible, page.rect.left, page.rect.top, page.rect.width, page.rect.height, title(addon), addon.eval("return AuctionHouseFrame.selectedTab")], "Lists: its page over the content area (under the title, above the money line), the title named, the tab selected").toEqual([true, window.rect.left + 4, window.rect.top - 30, 792, 478, "Lists", 4]);
  const rows = addon.eval(`local AH = ${HELPER} return { AH.SHOP_ROWS, AH.VIEW_ROWS, AH.PANE_ROWS, AH.LIST_ROWS, AH.OWNED_ROWS }`);
  expect(rows, "the rows fill the room their boxes leave: 20 list and view rows, 12 pane entries (three rows of action buttons under them), 8 listings up now, 8 of your auctions").toEqual([20, 20, 12, 8, 8]);
  const fits = addon.eval(`local AH, out = ${HELPER}, {}
    for i, c in ipairs({ AH.pane, AH.scanCard, AH.shopCard, AH.sellCard, AH.ownedCard, AH.shopCard.body.table, AH.pane.actions[6], AH.upCard, AH.upCard.table, AH.ownedCard.table }) do out[i] = { c:GetLeft(), c:GetRight(), c:GetTop(), c:GetBottom() } end return out`);
  const [l, r, t, b] = [page.rect.left, page.rect.right, page.rect.top, page.rect.bottom];
  expect(fits.every(([cl, cr, ct, cb]) => cl >= l && cr <= r && ct <= t && cb >= b), "every card inside its page, the tables and the last action button too").toBe(true);
  expect([fits[0][1] <= fits[2][0], fits[0][3] > fits[1][2], fits[3][1] <= fits[4][0], fits[3][1] <= fits[7][0], fits[7][3] > fits[4][2], fits[0][1] - fits[0][0], fits[3][1] - fits[3][0]], "the pane left of the list, the scan under the pane; Sell left of Up now and your auctions, Up now above your auctions; the pane 240 and the Sell card 300 wide less the padding and the boxes' insets").toEqual([true, true, true, true, true, 208, 268]);
  const boxes = addon.eval(`local AH, out = ${HELPER}, {}
    for i, c in ipairs({ AH.pane, AH.scanCard, AH.shopCard, AH.sellCard, AH.upCard, AH.ownedCard }) do
      local b = c.box
      out[i] = { c:GetLeft() - b:GetLeft(), b:GetTop() - c:GetTop(), b:GetRight() - c:GetRight(), c:GetBottom() - b:GetBottom(), select("#", b:GetRegions()) > 0, b:GetLeft(), b:GetRight(), b:GetTop(), b:GetBottom() }
    end return out`);
  expect(boxes.map((b) => b.slice(0, 5)), "every card in its own box (a painted panel), 8 in from its border all round").toEqual(Array(6).fill([8, 8, 8, 8, true]));
  // Whether two boxes (as the rows above: left at 5, right 6, top 7, bottom 8) don't overlap.
  const apart = (a, c) => a[6] <= c[5] || c[6] <= a[5] || a[8] >= c[7] || c[8] >= a[7];
  expect([apart(boxes[0], boxes[1]), apart(boxes[0], boxes[2]), apart(boxes[3], boxes[4]), apart(boxes[4], boxes[5]), apart(boxes[3], boxes[5])], "no two boxes on a page overlap").toEqual([true, true, true, true, true]);
  expect(addon.eval(`local AH = ${HELPER} return { AH.shopCard.body.table.nameHead:GetText(), AH.upCard.table.nameHead:GetText(), AH.ownedCard.table.nameHead:GetText(), AH.pane.rows[1].name.__justifyH, AH.shopCard.body.table.rows[1].name.__justifyH }`), "the name column headed where rows name an item; names kept to the left").toEqual(["Item", "", "Item", "LEFT", "LEFT"]);
  expect(addon.eval(`local c = ${HELPER}.sellCard return { c.bid:GetTop() == c.stacks:GetTop(), c.bid:GetLeft() > c.stacks:GetRight(), c.bid:GetRight() <= c:GetRight(), c.undercut:GetRight() <= c:GetRight(), c.length:GetRight() <= c:GetRight() }`), "the bid beside the stacks (no empty row for a commodity), and the form inside its box").toEqual([true, true, true, true, true]);
  expect(addon.eval(`local p = ${HELPER}.pane return { p.actions[3]:GetRight() <= p:GetRight(), p.rows[1]:GetTop() - #p.rows * 20 > p.actions[1]:GetTop(), p.actions[6]:GetBottom() >= p:GetBottom() }`), "the action buttons inside the pane's box, under its last row").toEqual([true, true, true]);
  expect(addon.eval(`local c = ${HELPER}.sellCard return { c.post:GetBottom() - 40 >= c:GetBottom(), c.length:GetBottom() > c.post:GetTop(), c.price:GetBottom() > c.length:GetTop(), c.bid:GetBottom() > c.price:GetTop(), c.stack:GetLeft() == c.qty:GetLeft() }`), "the sell form fits its card with room for the two lines under Post, one field a row, rows apart").toEqual([true, true, true, true, true]);
  expect(addon.eval(`local c = ${HELPER}.ownedCard return { c.cancelNext:GetRight() < c.check:GetLeft(), c.check:GetRight() == c:GetRight(), c.table.rows[1]:GetTop() < c.cancelNext:GetBottom(), c.count:GetLeft() > c.title:GetRight() }`), "Check undercuts and Cancel next undercut on the heading line, the count beside the heading, the rows under them").toEqual([true, true, true, true]);
  pickTab(addon, 5);
  expect([addon.frame("Vanguard_AuctionShopping").visible, addon.frame("Vanguard_AuctionSelling").visible, title(addon)], "Posting").toEqual([false, true, "Posting"]);
  pickTab(addon, 1);
  expect([addon.frame("Vanguard_AuctionSelling").visible, title(addon)], "back to the game's Buy: ours hide, the game's title").toEqual([false, "Browse Auctions"]);
  pickTab(addon, 5);
  addon.world.closeAuctionHouse();
  expect(addon.frame("Vanguard_AuctionSelling").visible, "hidden with the window").toBe(false);
  addon.world.openAuctionHouse();
  addon.update(0);
  expect([addon.frame("Vanguard_AuctionSelling").visible, addon.eval("return #AuctionHouseFrame.Tabs"), title(addon)], "open again on the game's Buy page: built once, five tabs still").toEqual([false, 5, "Browse Auctions"]);
  expect(lastLine(addon), "before any scan").toBe("no scan yet");
});
it("every card wears the card chrome (a heading title in its box's corner, the scan line a status), and its controls the control scale", () => {
  const addon = atAuctionHouse();
  pickTab(addon, 4);
  const [heading, small, gap, tight, buttonH, controlH] = addon.eval("local T = ns.Theme return { T.RoleSize('heading'), T.RoleSize('small'), T.SPACE.gap, T.SPACE.tight, T.BUTTON_H, T.CONTROL_H }");
  const cards = { pane: "Lists", scanCard: "Scan", shopCard: "Shopping", sellCard: "Sell", upCard: "Up now", ownedCard: "Your auctions" };
  // A card's title: [its text, the heading role's size, the text colour, on the card's box, how far in from the box's left and down from its top].
  const titleOf = (key) => {
    const t = addon.frame(`${HELPER}.${key}.title`);
    const at = addon.eval(`local c = ${HELPER}.${key} local t, b = c.title, c.box return { t:GetParent() == b, t:GetLeft() - b:GetLeft(), b:GetTop() - t:GetTop() }`);
    return [t.text, t.font.size, isTok(addon, t.textColor, "text"), ...at];
  };
  expect(Object.keys(cards).map(titleOf), "ns.WindowTitle kind card: the heading role in the text colour, T.SPACE.gap in from the box's corner").toEqual(Object.values(cards).map((name) => [name, heading, true, true, gap, gap]));
  expect(addon.eval(`return { ${HELPER}.PAD, ${HELPER}.INSET, ${HELPER}.PAGE_X }`), "the boxes' insets are the HUD card's gap; the page's, the tight one").toEqual([gap, gap, tight]);
  const last = addon.frame(`${HELPER}.scanCard.last`);
  expect([last.font.size, isTok(addon, last.textColor, "text2")], "the last-scan line is a status: small, text2").toEqual([small, true]);
  const heights = addon.eval(`local AH = ${HELPER} local c, p, o = AH.sellCard, AH.pane, AH.ownedCard
    return { { AH.scanCard.scan:GetHeight(), p.actions[1]:GetHeight(), p.actions[6]:GetHeight(), c.post:GetHeight(), c.skip:GetHeight(), c.stop:GetHeight() },
      { AH.shopCard.add:GetHeight(), AH.shopCard.search:GetHeight(), AH.shopCard.restock:GetHeight(), o.check:GetHeight(), o.cancelNext:GetHeight(), o.table.rows[1].cancel:GetHeight(),
        o.table.rows[1].relist:GetHeight(), AH.shopCard.view.back:GetHeight(), c.qty:GetHeight(), c.price:GetHeight(), c.qtyMax:GetHeight(), c.perStack:GetHeight() },
      { AH.ROW_H, AH.shopCard.body.table.rows[1]:GetHeight() } }`);
  expect(heights, "standalone buttons T.BUTTON_H, inline controls (toolbar and in-row buttons, the form's boxes and Max) T.CONTROL_H, a row as tall as one").toEqual([
    Array(6).fill(buttonH), Array(12).fill(controlH), [controlH, controlH]]);
  const gaps = addon.eval(`local a = ${HELPER}.pane.actions return { a[1]:GetBottom() - a[4]:GetTop(), a[2]:GetLeft() - a[1]:GetRight() }`);
  expect(gaps, "the action buttons T.SPACE.tight apart across and down").toEqual([tight, tight]);
});
it("closing the auction house stops a scan", () => {
  const addon = atAuctionHouse();
  addon.eval("__rows = {} for i = 1, 1000 do __rows[i] = { itemID = 2589, count = 1, buyoutPrice = 50 } end __wfgWorld.ah.replicate = __rows");
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  addon.world.closeAuctionHouse();
  addon.update(0.01);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  expect(addon.eval(`return { ${HELPER}.scan == nil, ns.AuctionPrices.House().prices[2589] == nil, __wfgWorld.ah.reads }`), "nothing recorded, no more reads").toEqual([true, true, 400]);
  addon.world.openAuctionHouse();
  addon.update(0);
  expect(lastLine(addon), "the cut-short scan doesn't count").toBe("no scan yet");
  addon.click(SCAN_BUTTON);
  expect(addon.eval("return #__wfgWorld.ah.queries"), "so a new one starts at once").toBe(2);
});
it("a finished scan spends the 15 minutes from its start, and your own listings are left out", () => {
  const addon = atAuctionHouse();
  addon.eval(`__wfgWorld.ah.replicate = { { itemID = 2589, count = 1, buyoutPrice = 50, owner = "Tester" },
    { itemID = 2589, count = 2, buyoutPrice = 60, ownerFullName = "Tester-ForeverTest" },
    { itemID = 2589, count = 1, buyoutPrice = 70, owner = __wfgWorld.secret("Tester") },
    { itemID = 2589, count = 4, buyoutPrice = 400, owner = "TEST-ONLY Rival", ownerFullName = "TEST-ONLY Rival-ForeverTest" },
    { itemID = 2589, count = 1, buyoutPrice = 90 }, { itemID = 2592, count = 1, buyoutPrice = 30, owner = "Tester" } }`);
  addon.click(SCAN_BUTTON);
  addon.eval("__now = __now + 120");
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  const p = addon.eval("local p = ns.AuctionPrices.House().prices return { p[2589].min, p[2589].listings, p[2589].qtys[math.floor(__now / 86400)], p[2592] == nil }");
  expect(p, "yours (by name, by full name) left out; a hidden seller and an unnamed one count").toEqual([70, 3, 6, true]);
  expect(chatHas(addon, /Auction house scanned: 6 listings, prices for 1 items\. 3 of them were yours and are left out\./), "says so").toBe(true);
  expect([addon.eval("return ns.AuctionPrices.House().lastScan"), lastLine(addon)], "the 15 minutes run from the start").toEqual([1790000000, "Scanned 2 min ago · 1 items"]);
});
// Closes the house, puts both scan stamps `ahead` seconds past the clock, and opens it again.
function reopenWithStamps(addon, ahead) {
  addon.world.closeAuctionHouse();
  addon.eval(`ns.AuctionPrices.House().lastScan = __now + ${ahead} ns.AuctionPrices.Store().scannedAt = __now + ${ahead}`);
  addon.world.openAuctionHouse();
  addon.update(0);
}
it("Y6-2 a scan stamped in the future (the clock was ahead, then put right) waits one gap at most", () => {
  const addon = atAuctionHouse();
  reopenWithStamps(addon, 86400);
  expect(addon.eval(`return ${HELPER}.NextScanIn()`), "15 minutes, not a day and 15 minutes").toBe(900);
});
it("Z10-1 the wait after a stamp from the future runs down from the day the house opened", () => {
  const addon = atAuctionHouse();
  reopenWithStamps(addon, 3600);
  addon.eval("__now = __now + 600");
  expect(addon.eval(`return ${HELPER}.NextScanIn()`), "600 s later, 300 left (not 900 until the stamp passes)").toBe(300);
  addon.eval("__now = __now + 300");
  expect(addon.eval(`return ${HELPER}.NextScanIn()`), "the full gap later, the scan is open").toBe(0);
});
it("Z10-1 a clock set back while the house is open still waits one gap at most", () => {
  const addon = atAuctionHouse();
  addon.eval("ns.AuctionPrices.House().lastScan = __now ns.AuctionPrices.Store().scannedAt = __now __now = __now - 3600");
  expect(addon.eval(`return ${HELPER}.NextScanIn()`), "15 minutes, not an hour and 15 minutes").toBe(900);
});
it("Z10-1 a scan stamped in the past is left alone, and so is any stamp while the client can't say the time", () => {
  const addon = atAuctionHouse();
  reopenWithStamps(addon, -300);
  expect(addon.eval("return { ns.AuctionPrices.House().lastScan - __now, ns.AuctionPrices.Store().scannedAt - __now }"), "a real stamp stays where it was").toEqual([-300, -300]);
  addon.eval("time = nil");
  reopenWithStamps(addon, 3600);
  expect(addon.eval("return { ns.AuctionPrices.House().lastScan - __now, #ns.errors }"), "no clock: nothing to clamp to, nothing wiped").toEqual([3600, 0]);
});
it("switches: no tabs, no scan button", () => {
  const off = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  expect([off.frame("Vanguard_AuctionShopping"), off.eval("return #AuctionHouseFrame.Tabs")], "no pages, the game's three tabs alone").toEqual([null, 3]);
  const noButton = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { scanButton = false } } }" });
  expect(noButton.eval(`return ${SCAN_BUTTON}:IsShown()`), "no scan button").toBe(false);
});
it("a house opened in combat still gets its tabs", () => {
  const fight = loggedIn(AH_ENV);
  setCombat(fight, true);
  fight.world.openAuctionHouse();
  fight.update(0);
  expect([fight.eval("return #AuctionHouseFrame.Tabs"), fight.eval("return #ns.errors")], "built in the fight: the game's three tabs and ours, no error").toEqual([5, 0]);
});
it("a scan's list that arrives during a fight is still read", () => {
  const fight = atAuctionHouse(`__wfgWorld.ah.replicate = ${LINEN}`);
  fight.slash("ah scan");
  setCombat(fight, true);
  fight.fire("REPLICATE_ITEM_LIST_UPDATE");
  fight.update(0.01);
  setCombat(fight, false);
  fight.advance(91);
  expect([fight.eval("return ns.AuctionPrices.House().lastScan"), chatHas(fight, /hasn't answered/)], "the list was read, not given up on").toEqual([1790000000, false]);
});
it("/vg ah says what it knows, scans at the auction house, and forgets prices", () => {
  const addon = loggedIn(AH_ENV);
  addon.slash("ah scan");
  expect(chatHas(addon, /Open the auction house to scan it\./), "away from the auction house").toBe(true);
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.eval(`__wfgWorld.ah.replicate = ${LINEN}`);
  addon.slash("ah scan");
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  addon.slash("ah");
  expect(chatHas(addon, /Auction prices for 1 item\(s\); last scan: today\./), "the status").toBe(true);
  addon.clearChat();
  addon.slash("ah prices");
  expect(chatHas(addon, /Auction prices for 1 item\(s\)/), "prices alone: the status").toBe(true);
  addon.slash("ah prices clear");
  addon.slash("ah");
  expect([chatHas(addon, /Forgot every auction price\./), chatHas(addon, /Auction prices for 0 item\(s\)/)], "forgotten").toEqual([true, true]);
  const off = loggedIn(AH_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { AuctionHelper = false } } }" });
  off.slash("ah");
  expect(chatHas(off, /The auction helper is off/), "module off").toBe(true);
  const fresh = loggedIn(AH_ENV);
  fresh.slash("ah");
  expect(chatHas(fresh, /last scan: never\./), "never scanned").toBe(true);
});
it("no auction house on this client: the module still starts, builds nothing and doesn't fail", () => {
  const addon = loggedIn(AH_ENV + "C_AuctionHouse = nil", { savedVariables: "VanguardDB.ah = { prices = { [2589] = { min = 90, t = 1790000000, days = {} } }, count = 1 }" });
  addon.world.openAuctionHouse();
  addon.update(0);
  expect([addon.frame("Vanguard_AuctionShopping"), addon.eval("return #ns.errors")], "no tabs, no error").toEqual([null, 0]);
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "saved prices still in tooltips").toBe("AH: 90c (today)");
});
it("a window without the tab row this client knows: nothing is built, and chat says so once", () => {
  const addon = loggedIn(AH_ENV);
  addon.world.openAuctionHouse();
  addon.eval("AuctionHouseFrame.Tabs = nil");
  addon.update(0);
  addon.world.closeAuctionHouse();
  addon.world.openAuctionHouse();
  addon.eval("AuctionHouseFrame.Tabs = nil");
  addon.update(0);
  const said = addon.chat().filter((l) => /no tab row this client knows/.test(l)).length;
  expect([addon.frame("Vanguard_AuctionShopping"), said, addon.eval("return #ns.errors")], "no pages, said once, no error").toEqual([null, 1, 0]);
});
// A Lua list as a JS array (an empty Lua table comes back as {}).
const list = (v) => (Array.isArray(v) ? v : []);

// TEST-ONLY date("*t", t) of a computer `offset` hours from UTC, for the times given (the harness has no date()).
const dateStub = (offset, times) => {
  const rows = times.map((t) => {
    const d = new Date((t + offset * 3600) * 1000);
    const [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
    const yday = (Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / 86400000 + 1;
    return `[${t}] = { year = ${year}, month = ${month + 1}, day = ${day}, yday = ${yday} }`;
  });
  return `local dates = { ${rows.join(", ")} } date = function(_, t) return dates[t] end`;
};
it("'today' and 'yesterday' go by the computer's day: an hour before 19:30 in New York is today, across UTC midnight", () => {
  const now = Date.UTC(2026, 10, 10, 0, 30) / 1000;
  const [hourAgo, lastNight] = [now - 3600, now - 20 * 3600];
  const addon = loggedIn(`time = function() return ${now} end ` + dateStub(-5, [now, hourAgo, lastNight]));
  // What a price's and a quest's "ago" say for time t.
  const ago = (t) => addon.eval(`return { ns.AuctionPrices.Ago(${t}), ns.GetModule("QuestHistory").Ago(${t}) }`);
  expect([ago(hourAgo), ago(lastNight)], "price, scan, sale and turn-in times alike").toEqual([["today", "today"], ["yesterday", "yesterday"]]);
});
it("the computer's day counts every day since 1970, over year ends and leap years; a client without date() counts UTC days", () => {
  const times = [0, 951782400, 951868800, 1735603200, 1735689600, 1798675200, 1798761600 - 1];
  const addon = loggedIn(dateStub(0, times));
  const days = addon.eval(`local out = {} for i, t in ipairs({ ${times.join(", ")} }) do out[i] = ns.AuctionPrices.LocalDay(t) - ns.AuctionPrices.Day(t) end return out`);
  expect(days, "at UTC the computer's day is the UTC day").toEqual(times.map(() => 0));
  const bare = loggedIn("");
  expect(bare.eval("return ns.AuctionPrices.LocalDay(1798675200)"), "no date(): the UTC day").toBe(20818);
});
