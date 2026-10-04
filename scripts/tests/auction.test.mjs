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

// The replicate list (a Lua list of rows), a click on Scan, the list arriving, and frames until the walk ends.
function scan(addon, rows) {
  addon.eval(`__wfgWorld.ah.replicate = ${rows}`);
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
  const saved = `ForeverUIDB.ah = { count = 2, prices = {
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

it("history: 30 days of values are kept, older ones go at login, and older versions' prices still read", () => {
  const today = Math.floor(1790000000 / 86400);
  // A by-day table with value v 29, 30 and 45 days back.
  const byDay = (v) => `{ [${today - 29}] = ${v}, [${today - 30}] = ${v}, [${today - 45}] = ${v} }`;
  const saved = `ForeverUIDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 2, lastScan = 0, prices = {
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

// Realms and factions ------------------------------------------------------------------------

// The saved houses, as "key:count" sorted by key.
const houses = (addon) => addon.eval(`local out = {}
  for key, h in pairs(ForeverUIDB.ah.houses) do out[#out + 1] = key .. ":" .. h.count end
  table.sort(out) return out`);

// An older version's account-wide store: Linen Cloth at 90c, a scan 10 minutes ago, and a list.
const ACCOUNT_WIDE = `ForeverUIDB.ah = { count = 1, lastScan = 1790000000 - 600, list = "Shopping", lists = { Shopping = { 2589 } },
  prices = { [2589] = { min = 90, t = 1790000000, days = { [math.floor(1790000000 / 86400)] = 90 } } } }`;

it("the account-wide prices move into this realm and faction once; the lists stay account-wide", () => {
  const addon = atAuctionHouse("", { savedVariables: ACCOUNT_WIDE });
  expect(houses(addon), "one house: the realm's normalized name and the faction").toEqual(["ForeverTest-Alliance:1"]);
  expect(addon.eval("local ah = ForeverUIDB.ah return { ah.prices == nil, ah.count == nil, ah.lastScan == nil, ah.lists.Shopping[1] }"), "the old fields are gone, the list is where it was").toEqual([true, true, true, 2589]);
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
  const saved = `ForeverUIDB.ah = { houses = {
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

it("the panel docks left of the auction house window, as tall as it, and goes with it", () => {
  const addon = atAuctionHouse();
  const [panel, window] = [addon.frame("ForeverUI_AuctionPanel"), addon.frame("AuctionHouseFrame")];
  expect([panel.visible, panel.rect.right, panel.rect.top, panel.rect.height, panel.rect.width], "4 px left of the window").toEqual([true, window.rect.left - 4, window.rect.top, 538, 280]);
  addon.world.closeAuctionHouse();
  expect(addon.frame("ForeverUI_AuctionPanel").visible, "hidden on close").toBe(false);
  addon.world.openAuctionHouse();
  addon.update(0);
  expect([addon.frame("ForeverUI_AuctionPanel").visible, addon.frames('w.__name == "ForeverUI_AuctionPanel"').length], "shown again, built once").toEqual([true, 1]);
  expect(lastLine(addon), "before any scan").toBe("no scan yet");
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
  expect([addon.eval("return ns.AuctionPrices.House().lastScan"), lastLine(addon)], "the 15 minutes run from the start").toEqual([1790000000, "last scan 2 min ago"]);
});

it("switches: no panel, no scan button; nothing at all in combat", () => {
  const off = atAuctionHouse("", { savedVariables: "ForeverUIDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  expect(off.frame("ForeverUI_AuctionPanel"), "no panel").toBe(null);
  const noButton = atAuctionHouse("", { savedVariables: "ForeverUIDB.profiles = { Default = { AuctionHelper = { scanButton = false } } }" });
  expect(noButton.eval(`return ${SCAN_BUTTON}:IsShown()`), "no scan button").toBe(false);
  const fight = loggedIn(AH_ENV);
  setCombat(fight, true);
  fight.world.openAuctionHouse();
  fight.update(0);
  expect(fight.frame("ForeverUI_AuctionPanel"), "ignored in combat").toBe(null);
});

it("/fui ah says what it knows, scans at the auction house, and forgets prices", () => {
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
  const off = loggedIn(AH_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { AuctionHelper = false } } }" });
  off.slash("ah");
  expect(chatHas(off, /The auction helper is off/), "module off").toBe(true);
  const fresh = loggedIn(AH_ENV);
  fresh.slash("ah");
  expect(chatHas(fresh, /last scan: never\./), "never scanned").toBe(true);
});

it("no auction house on this client: the module still starts, builds nothing and doesn't fail", () => {
  const addon = loggedIn(AH_ENV + "C_AuctionHouse = nil", { savedVariables: "ForeverUIDB.ah = { prices = { [2589] = { min = 90, t = 1790000000, days = {} } }, count = 1 }" });
  addon.world.openAuctionHouse();
  addon.update(0);
  expect([addon.frame("ForeverUI_AuctionPanel"), addon.eval("return #ns.errors")], "no panel, no error").toEqual([null, 0]);
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "saved prices still in tooltips").toBe("AH: 90c (today)");
});

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

// Shop row i: [shown, name, price, count, icon].
const shopRow = (addon, i) => addon.eval(`local r = ${HELPER}.shopCard.rows[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, r.qty:GetText() or false, r.icon:GetTexture() or false }`);

// The shop card's progress line.
const progress = (addon) => addon.eval(`return ${HELPER}.shopCard.progress:GetText()`);

it("a list search runs one query at a time within the limit", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "Soul Dust", "Vision Dust" }');
  addon.click(`${HELPER}.shopCard.search`);
  expect([sent(addon), progress(addon)], "the first search only").toEqual([["SendBrowseQuery:Strange Dust"], "0 of 3"]);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect([sent(addon).length, progress(addon)], "answered: the next waits a second after the last").toEqual([1, "1 of 3"]);
  addon.advance(1);
  expect(sent(addon), "then goes").toEqual(["SendBrowseQuery:Strange Dust", "SendBrowseQuery:Soul Dust"]);
  addon.advance(2);
  expect([sent(addon).length, progress(addon)], "no answer: after 2 seconds the third goes anyway").toEqual([3, "2 of 3"]);
  expect(addon.eval("local q = __wfgWorld.ah.queries[1].args[1] return { q.sorts[1].sortOrder, q.sorts[1].reverseSort }"), "cheapest first").toEqual([0, false]);
});

it("never more than 60 searches a minute, a second apart", () => {
  const addon = atAuctionHouse(`__sentAt = {} local raw = C_AuctionHouse.SendBrowseQuery
    C_AuctionHouse.SendBrowseQuery = function(q) table.insert(__sentAt, GetTime()) raw(q) end`);
  addon.eval(`for i = 1, 70 do ${HELPER}.Queue({ entry = "TEST-ONLY " .. i }) end`);
  for (let i = 0; i < 239; i++) {
    addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
    addon.update(0.25);
  }
  const at = addon.eval("return __sentAt");
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  expect([at.length, Math.min(...gaps) >= 1 - 1e-9], "60 in the minute, each at least a second after the last").toEqual([60, true]);
});

it("result rows show name, cheapest price and quantity; a click shows the item in the game's own list", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "TEST-ONLY Nothing" }');
  addon.eval(`__wfgWorld.ah.browse = { { itemKey = { itemID = 10941 }, minPrice = 900, totalQuantity = 3 },
    { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 240 } }`);
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.eval("__wfgWorld.ah.browse = {}");
  addon.advance(1);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(shopRow(addon, 1), "the result named like the entry, not the cheaper pouch").toEqual([true, "Strange Dust", "12s 50c", "x 240", "TEST-ONLY-DUST"]);
  expect(shopRow(addon, 2).slice(0, 4), "nothing up").toEqual([true, "TEST-ONLY Nothing", "none up", ""]);
  expect(shopRow(addon, 3)[0], "no third entry").toBe(false);
  addon.advance(1);
  addon.click(`${HELPER}.shopCard.rows[1]`);
  addon.click(`${HELPER}.shopCard.rows[2]`);
  expect(sent(addon).at(-1), "the game's own list is asked for that item's key (its browse list shows it)").toBe("SearchForItemKeys:10940");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect([shopRow(addon, 1)[2], addon.eval(`return ${HELPER}.pending == nil`)], "the row keeps its price; nothing waits").toEqual(["12s 50c", true]);
});

it("entries by item link, ID or name; right-click removes one; the wheel scrolls", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "|cffffffff|Hitem:2589::::|h[Linen Cloth]|h|r", "99999", "  ", "Soul Dust", "a", "b", "c", "d" }');
  expect(addon.eval("return ForeverUIDB.ah.lists['TEST-ONLY Mats']"), "a link and a number become IDs; a blank is skipped").toEqual([2589, 99999, "Soul Dust", "a", "b", "c", "d"]);
  expect(shopRow(addon, 1).slice(1), "an ID the client knows").toEqual(["Linen Cloth", "", "", "Interface\\Icons\\INV_Fabric_Linen_01"]);
  expect(shopRow(addon, 2).slice(1), "one it doesn't").toEqual(["item 99999", "", "", "Interface\\Icons\\INV_Misc_QuestionMark"]);
  addon.click(`${HELPER}.shopCard.search`);
  expect(sent(addon), "an ID searches by its item key").toEqual(["SearchForItemKeys:2589"]);
  addon.wheel(`${HELPER}.shopCard.rows[1]`, -1);
  expect(shopRow(addon, 1)[1], "scrolled one down").toBe("item 99999");
  addon.wheel(`${HELPER}.shopCard.rows[1]`, -5);
  expect([shopRow(addon, 1)[1], shopRow(addon, 6)[1]], "no further than the last").toEqual(["item 99999", "d"]);
  addon.click(`${HELPER}.shopCard.rows[1]`, "RightButton");
  expect(addon.eval("return ForeverUIDB.ah.lists['TEST-ONLY Mats']"), "right-click removed it").toEqual([2589, "Soul Dust", "a", "b", "c", "d"]);
});

it("item names the client hasn't loaded yet, and a hidden price", () => {
  const addon = atAuctionHouse(DUSTS + " __wfgWorld.items[10940].pending = true");
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "Soul Dust" }');
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 240 } }");
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(shopRow(addon, 1).slice(1, 3), "the first result, under the name typed").toEqual(["Strange Dust", "12s 50c"]);
  addon.eval("__wfgWorld.items[10940].pending = nil __wfgWorld.items[10940].name = 'TEST-ONLY Strange Dust'");
  addon.fire("ITEM_KEY_ITEM_INFO_RECEIVED", 10940);
  expect(shopRow(addon, 1)[1], "repainted once the name is in").toBe("TEST-ONLY Strange Dust");
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 1 }, minPrice = __wfgWorld.secret(5), totalQuantity = 2 } }");
  addon.advance(1);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect([shopRow(addon, 2)[2], addon.eval("return #ns.errors")], "a hidden price: nothing to show, no error").toEqual(["none up", 0]);
});

it("shopping lists: the dropdown picks or makes one, + Add adds, and the caps hold", () => {
  const addon = atAuctionHouse();
  expect(addon.eval(`local c = {} for i, x in ipairs(${HELPER}.shopCard.lists.choices()) do c[i] = x[2] end return c`), "no lists yet").toEqual(["New list..."]);
  addon.click(`${HELPER}.shopCard.add`);
  addon.type("ForeverUI_TextEdit", "Strange Dust");
  addon.click("ForeverUI_TextDialog.primary");
  expect([addon.eval("return ForeverUIDB.ah.lists.Shopping"), addon.frame("ForeverUI_TextDialog").visible], "+ Add with no list makes Shopping").toEqual([["Strange Dust"], false]);
  addon.eval(`${HELPER}.shopCard.lists.set(${HELPER}.NEW)`);
  addon.type("ForeverUI_TextEdit", "  TEST-ONLY B  ");
  addon.click("ForeverUI_TextDialog.primary");
  expect(addon.eval(`local c = {} for i, x in ipairs(${HELPER}.shopCard.lists.choices()) do c[i] = x[2] end return { c, ${HELPER}.shopCard.lists.text:GetText() }`), "made and picked").toEqual([["Shopping", "TEST-ONLY B", "New list..."], "TEST-ONLY B"]);
  addon.eval(`${HELPER}.shopCard.lists.set("Shopping")`);
  expect(shopRow(addon, 1)[1], "picked back").toBe("Strange Dust");
  addon.eval(`for i = 3, 21 do ${HELPER}.NewList("TEST-ONLY " .. i) end for i = 1, 51 do ${HELPER}.AddEntry("x" .. i, "Shopping") end`);
  expect(addon.eval("local n = 0 for _ in pairs(ForeverUIDB.ah.lists) do n = n + 1 end return { n, #ForeverUIDB.ah.lists.Shopping }"), "20 lists, 50 entries").toEqual([20, 50]);
  expect([chatHas(addon, /at most 20 shopping lists/), chatHas(addon, /holds at most 50 items/)], "says why").toEqual([true, true]);
  expect(addon.eval(`return ${HELPER}.NewList("   ")`), "no name, no list").toBe(false);
});

it("Search list needs entries; closing the auction house drops the searches waiting", () => {
  const addon = atAuctionHouse();
  addon.click(`${HELPER}.shopCard.search`);
  expect(chatHas(addon, /Add items to a shopping list first/), "nothing to search").toBe(true);
  makeList(addon, "TEST-ONLY Mats", '{ "a", "b", "c" }');
  addon.click(`${HELPER}.shopCard.search`);
  addon.world.closeAuctionHouse();
  addon.advance(5);
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.advance(5);
  expect([sent(addon).length, progress(addon)], "only the one sent before closing").toEqual([1, ""]);
});

it("/fui ah list and add", () => {
  const addon = loggedIn(AH_ENV);
  addon.slash("ah list");
  expect(chatHas(addon, /No shopping lists yet/), "none").toBe(true);
  addon.slash("ah list TEST-ONLY Mats");
  addon.slash("ah add TEST-ONLY Mats Strange Dust");
  addon.slash("ah add Herbs 2589");
  addon.slash("ah list TEST-ONLY Mats");
  addon.slash("ah list Herbs");
  addon.slash("ah list Empty");
  expect([chatHas(addon, /Shopping list TEST-ONLY Mats \(1\): Strange Dust$/), chatHas(addon, /Shopping list Herbs \(1\): Linen Cloth$/), chatHas(addon, /Shopping list Empty \(0\): empty$/)], "each list").toEqual([true, true, true]);
  addon.eval("for i = 1, 20 do ForeverUIDB.ah.lists['TEST-ONLY ' .. i] = {} end");
  addon.clearChat();
  addon.slash("ah list Twenty-first");
  expect(chatHas(addon, /Shopping list/), "refused past the cap, nothing listed").toBe(false);
});

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
  const q = addon.eval("local q = __wfgWorld.ah.queries[1] return { q.fn, q.args[1].itemID, q.args[1].itemLevel, q.args[3] }");
  expect(q, "a sell search for the dust, owner listings apart").toEqual(["SendSellSearchQuery", 10940, 0, true]);
  expect(card(addon), "cheapest 100 (your 95 left out); 1 silver under, but not under 1 silver; deposit for 20").toEqual([["1s 0c", "none", "3s 0c · TEST-ONLY 12 Hours", "1s 0c"], "TEST-ONLY-DUST", true]);
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
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon), "the stack of 20 at 1s a unit, for the first length").toEqual([["PostCommodity", true, "0:1", 1, 20, 100, "nil"]]);
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
  expect(card(addon)[0], "an item: 4500 each for the pair is cheapest").toEqual(["45s 0c", "none", "30c · TEST-ONLY 24 Hours", "44s 0c"]);
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
  expect([card(addon)[0], addon.eval("return #ns.errors")], "the hidden price skipped, no deposit shown, no error").toEqual([["4s 0c", "none", "", "3s 0c"], 0]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon)[0], "a hidden stack size posts one; an unknown length is the first").toEqual(["PostCommodity", true, "0:1", 1, 1, 300, "nil"]);
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

const SCAN_CARD = `${HELPER}.scanCard`;

// Owned row i: [shown, name, price, undercut mark shown].
const ownedRow = (addon, i) => addon.eval(`local r = ${SCAN_CARD}.owned[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, r.mark:IsShown() }`);

// Check undercuts, the auctions arriving, and each price check answered a second apart.
function checkUndercuts(addon) {
  addon.click(`${SCAN_CARD}.check`);
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
  expect([ownedRow(addon, 1), ownedRow(addon, 2), ownedRow(addon, 3)[0]], "the dust is undercut (1s 20c against your 1s 50c), the blade isn't").toEqual([[true, "Strange Dust", "1s 50c", true], [true, "TEST-ONLY Blade", "40s 0c", false], false]);
  expect(isTok(addon, addon.eval(`return ${SCAN_CARD}.owned[1].mark.__vertexColor`), "bad"), "the mark is red").toBe(true);
  addon.hover(`${SCAN_CARD}.owned[1].cancel`);
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "what cancelling costs").toEqual(["Cancel this auction", "Costs 1s 0c"]);
  addon.hover(null);
  addon.click(`${SCAN_CARD}.owned[1].cancel`);
  expect(restrictedLog(addon), "cancelled once, from the click").toEqual([["CancelAuction", true, 501, "nil", "nil", "nil", "nil"]]);
  addon.fire("AUCTION_CANCELED", 501);
  expect([ownedRow(addon, 1)[1], ownedRow(addon, 2)[0]], "its row goes").toEqual(["TEST-ONLY Blade", false]);
});

it("restricted calls run only inside a click", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP + OWNED.replace("__wfgWorld.ah.commodities[10940] = {", "__wfgWorld.ah.unused = {"));
  dropAndAnswer(addon, 1, "COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${CARD}.post`);
  addon.advance(1);
  checkUndercuts(addon);
  addon.click(`${SCAN_CARD}.owned[2].cancel`);
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
  addon.click(`${SCAN_CARD}.owned[1].cancel`);
  addon.hover(`${SCAN_CARD}.owned[1].cancel`);
  expect([restrictedLog(addon).length, addon.eval("return #GameTooltip.__lines")], "the game won't cancel it; no cost shown when hidden").toEqual([0, 1]);
  addon.wheel(`${SCAN_CARD}.owned[1]`, -5);
  expect([ownedRow(addon, 1)[2], ownedRow(addon, 4)[0]], "scrolled to the end: 6 auctions, 4 rows").toEqual(["90c", true]);
});
