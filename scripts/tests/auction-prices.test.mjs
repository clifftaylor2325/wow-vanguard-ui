// auction-prices: the price store (Modules/AuctionPrices.lua): scans, the tooltip line, history, realms
// and factions, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";
import { AH_ENV, HELPER, LINEN, SCAN_BUTTON, atAuctionHouse, lastLine, list, scan } from "./auction-env.mjs";

it("a scan records each item's cheapest unit price and the day's low", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  const p = addon.eval("local p = ns.AuctionPrices.House().prices[2589] return { p.min, p.t, p.days[math.floor(__now / 86400)] }");
  expect(p, "90 a unit beats 500 for 5, today").toEqual([90, 1790000000, 90]);
  expect(addon.eval("return { ns.AuctionPrices.House().prices[159] == nil, ns.AuctionPrices.House().count }"), "a listing without a buyout is skipped").toEqual([true, 1]);
  expect(chatHas(addon, /Auction house scanned: 3 listings, prices for 1 items\./), "says what it read").toBe(true);
  expect(addon.eval("return __wfgWorld.ah.queries[1].fn"), "one whole-house query").toBe("ReplicateItems");
  expect(lastLine(addon), "the line under the button").toBe("last scan 0 min ago");
});

it("scans are 15 minutes apart", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  addon.eval("__now = __now + 600");
  addon.click(SCAN_BUTTON);
  expect([addon.eval("return #__wfgWorld.ah.queries"), chatHas(addon, /One auction house scan every 15 minutes: the next in 5 min\./)], "too soon: nothing sent").toEqual([1, true]);
  expect(lastLine(addon), "the line counts the minutes").toBe("last scan 10 min ago");
  addon.eval("__now = __now + 300");
  addon.click(SCAN_BUTTON);
  expect([addon.eval("return #__wfgWorld.ah.queries"), lastLine(addon)], "after 15 minutes a new scan starts").toEqual([2, "scanning 0 of 0"]);
  addon.click(SCAN_BUTTON);
  expect(addon.eval("return #__wfgWorld.ah.queries"), "not while one runs").toBe(2);
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
  expect(reads, "400, 400, then the last 200; the line counts them").toEqual([[400, "scanning 400 of 1000"], [400, "scanning 800 of 1000"], [200, "last scan 0 min ago"], [0, "last scan 0 min ago"]]);
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

it("history: 30 days of values are kept, older ones go at login, and older versions' prices still read", () => {
  const today = Math.floor(1790000000 / 86400);
  // A by-day table with value v 29, 30 and 45 days back.
  const byDay = (v) => `{ [${today - 29}] = ${v}, [${today - 30}] = ${v}, [${today - 45}] = ${v} }`;
  const saved = `VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 2, lastScan = 0, prices = {
    [2589] = { min = 90, t = 1790000000, days = ${byDay(90)}, qtys = ${byDay(4)}, markets = ${byDay(95)} },
    [2592] = { min = 70, t = 1790000000, days = { [${today}] = 70 } } } } } }`;
  const addon = atAuctionHouse("", { savedVariables: saved });
  const left = addon.eval(`local p = ns.AuctionPrices.House().prices[2589] local out = {}
    for _, m in ipairs({ p.days, p.qtys, p.markets }) do local n = 0 for _ in pairs(m) do n = n + 1 end out[#out + 1] = n end return out`);
  expect(left, "each kind keeps only the day 29 days back").toEqual([1, 1, 1]);
  expect(addon.eval('return __showItem("item:2592")[1][1]'), "an older version's price: the low alone").toBe("AH: 70c (today)");
  addon.eval("ns.AuctionPrices.Record(2592, 60, __now, 3, 65)");
  expect(addon.eval("local p = ns.AuctionPrices.House().prices[2592] local d = math.floor(__now / 86400) return { p.days[d], p.qtys[d], p.markets[d] }"), "and it takes the new values").toEqual([60, 3, 65]);
});

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
  expect([addon.eval('return __showItem("item:2589")[1][1]'), lastLine(addon)], "the tooltip and the last scan carry over").toEqual(["AH: 90c (today)", "last scan 10 min ago"]);
  addon.eval("ns.AuctionPrices.Migrate() ns.AuctionPrices.Prune(__now)");
  expect(houses(addon), "a second run moves nothing more").toEqual(["ForeverTest-Alliance:1"]);
  addon.eval("__wfgWorld.realm = 'Other-Realm Two'");
  expect([addon.eval('return #__showItem("item:2589")'), addon.eval("return ns.AuctionPrices.Low7(2589)")], "another realm has no price for it").toEqual([0, null]);
  addon.click(SCAN_BUTTON);
  expect(addon.eval("return #__wfgWorld.ah.queries"), "and its own 15 minutes: it scans at once").toBe(1);
});

it("each realm and faction keeps its own prices and its own cap", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  addon.eval(`__wfgWorld.units.player.faction = 'Horde' ${HELPER}.PaintScan()`);
  expect([addon.eval('return #__showItem("item:2589")'), lastLine(addon)], "a Horde character on the realm sees none of it").toEqual([0, "no scan yet"]);
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

it("a hidden number skips its listing without an error", () => {
  const addon = atAuctionHouse();
  scan(addon, "{ { itemID = 2589, count = __wfgWorld.secret(1), buyoutPrice = 90 }, { itemID = 2589, count = 2, buyoutPrice = 300 } }");
  expect(addon.eval("return { ns.AuctionPrices.House().prices[2589].min, #ns.errors }"), "only the plain listing counts").toEqual([150, 0]);
});
