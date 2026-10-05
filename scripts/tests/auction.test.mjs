// auction: the Auction helper (Modules/AuctionHelper.lua) and its price store
// (Modules/AuctionPrices.lua), at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, isTok, loggedIn, setCombat } from "./helpers.mjs";

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

it("the panel docks left of the auction house window, at least as tall as it, with every card inside, and goes with it", () => {
  const addon = atAuctionHouse();
  const [panel, window] = [addon.frame("Vanguard_AuctionPanel"), addon.frame("AuctionHouseFrame")];
  const height = addon.eval(`local AH = ${HELPER} return AH.SCAN_H - AH.ScanY() + AH.PAD`);
  expect([panel.visible, panel.rect.right, panel.rect.top, panel.rect.height, panel.rect.width], "4 px left of the window, from its top, as tall as its cards need").toEqual([true, window.rect.left - 4, window.rect.top, Math.max(538, height), 280]);
  const cards = addon.eval(`local AH, out = ${HELPER}, {}
    for i, c in ipairs({ AH.shopCard, AH.sellCard, AH.scanCard }) do out[i] = { c:GetTop(), c:GetBottom() } end return out`);
  const bottom = panel.rect.bottom;
  expect(cards.every(([, b]) => b >= bottom + 8), "every card ends inside the panel's padding").toBe(true);
  expect([cards[0][1] > cards[1][0], cards[1][1] > cards[2][0]], "the cards don't overlap: shop over sell over scan").toEqual([true, true]);
  expect(addon.eval(`local c = ${HELPER}.sellCard return { c.post:GetBottom() >= c:GetBottom(), c.status:GetBottom() >= c:GetBottom(), c.length:GetBottom() > c.post:GetTop() }`), "the sell form fits its card, rows apart").toEqual([true, true, true]);
  addon.world.closeAuctionHouse();
  expect(addon.frame("Vanguard_AuctionPanel").visible, "hidden on close").toBe(false);
  addon.world.openAuctionHouse();
  addon.update(0);
  expect([addon.frame("Vanguard_AuctionPanel").visible, addon.frames('w.__name == "Vanguard_AuctionPanel"').length], "shown again, built once").toEqual([true, 1]);
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
  const off = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  expect(off.frame("Vanguard_AuctionPanel"), "no panel").toBe(null);
  const noButton = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { scanButton = false } } }" });
  expect(noButton.eval(`return ${SCAN_BUTTON}:IsShown()`), "no scan button").toBe(false);
  const fight = loggedIn(AH_ENV);
  setCombat(fight, true);
  fight.world.openAuctionHouse();
  fight.update(0);
  expect(fight.frame("Vanguard_AuctionPanel"), "ignored in combat").toBe(null);
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
  expect([addon.frame("Vanguard_AuctionPanel"), addon.eval("return #ns.errors")], "no panel, no error").toEqual([null, 0]);
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

it("result rows show name, cheapest price and quantity; a click opens the item's listings", () => {
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
  addon.click(`${HELPER}.shopCard.rows[2]`);
  expect(sent(addon).length, "nothing found: nothing opens").toBe(2);
  addon.click(`${HELPER}.shopCard.rows[1]`);
  expect(sent(addon).at(-1), "the item's listings are searched by the key its row found").toBe("SendSearchQuery:10940");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${HELPER}.shopCard.view.back`);
  expect([shopRow(addon, 1)[2], addon.eval(`return ${HELPER}.pending == nil`)], "back: the row keeps its price; nothing waits").toEqual(["12s 50c", true]);
});

it("entries by item link, ID or name; Remove on the right-click menu; the wheel scrolls", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "|cffffffff|Hitem:2589::::|h[Linen Cloth]|h|r", "99999", "  ", "Soul Dust", "a", "b", "c", "d" }');
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats']"), "a link and a number become IDs; a blank is skipped").toEqual([2589, 99999, "Soul Dust", "a", "b", "c", "d"]);
  expect(shopRow(addon, 1).slice(1), "an ID the client knows").toEqual(["Linen Cloth", "", "", "Interface\\Icons\\INV_Fabric_Linen_01"]);
  expect(shopRow(addon, 2).slice(1), "one it doesn't").toEqual(["item 99999", "", "", "Interface\\Icons\\INV_Misc_QuestionMark"]);
  addon.click(`${HELPER}.shopCard.search`);
  expect(sent(addon), "an ID searches by its item key").toEqual(["SearchForItemKeys:2589"]);
  addon.wheel(`${HELPER}.shopCard.rows[1]`, -1);
  expect(shopRow(addon, 1)[1], "scrolled one down").toBe("item 99999");
  addon.wheel(`${HELPER}.shopCard.rows[1]`, -5);
  expect([shopRow(addon, 1)[1], shopRow(addon, 6)[1]], "no further than the last").toEqual(["item 99999", "d"]);
  addon.click(`${HELPER}.shopCard.rows[1]`, "RightButton");
  expect(addon.eval("local out = {} for i, b in ipairs(Vanguard_Menu.items) do if b:IsShown() then out[i] = b.text:GetText() end end return out"), "the row's menu").toEqual(["Filters...", "Remove"]);
  addon.click("Vanguard_Menu.items[2]");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats']"), "Remove took it off").toEqual([2589, "Soul Dust", "a", "b", "c", "d"]);
});

it("item names the client hasn't loaded yet, and a hidden price", () => {
  const addon = atAuctionHouse(DUSTS + " __wfgWorld.items[10940].pending = true __wfgWorld.items[11083] = { name = 'Soul Dust' }");
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "Soul Dust" }');
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 240 } }");
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(shopRow(addon, 1).slice(1, 3), "its name isn't in: the row waits, under the name typed").toEqual(["Strange Dust", ""]);
  addon.eval("__wfgWorld.items[10940].pending = nil __wfgWorld.items[10940].name = 'TEST-ONLY Strange Dust'");
  addon.fire("ITEM_KEY_ITEM_INFO_RECEIVED", 10940);
  expect(shopRow(addon, 1).slice(1, 3), "matched once the name is in (it contains the one typed)").toEqual(["TEST-ONLY Strange Dust", "12s 50c"]);
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 11083 }, minPrice = __wfgWorld.secret(5), totalQuantity = 2 } }");
  addon.advance(1);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect([shopRow(addon, 2)[2], addon.eval("return #ns.errors")], "a hidden price: nothing to show, no error").toEqual(["none up", 0]);
});

// The shop dropdown's choices, by their text.
const choices = (addon) => addon.eval(`local c = {} for i, x in ipairs(${HELPER}.shopCard.lists.choices()) do c[i] = x[2] end return c`);

// The dropdown's actions on the list in use, after the lists and "New list...".
const LIST_ACTIONS = ["Rename list...", "Duplicate list", "Delete list...", "Export list...", "Import..."];

it("shopping lists: the dropdown picks or makes one, + Add adds, and the caps hold", () => {
  const addon = atAuctionHouse();
  expect(choices(addon), "no lists yet: make one or import").toEqual(["New list...", "Import..."]);
  addon.click(`${HELPER}.shopCard.add`);
  addon.type("Vanguard_TextEdit", "Strange Dust");
  addon.click("Vanguard_TextDialog.primary");
  expect([addon.eval("return VanguardDB.ah.lists.Shopping"), addon.frame("Vanguard_TextDialog").visible], "+ Add with no list makes Shopping").toEqual([["Strange Dust"], false]);
  addon.eval(`${HELPER}.shopCard.lists.set(${HELPER}.NEW)`);
  addon.type("Vanguard_TextEdit", "  TEST-ONLY B  ");
  addon.click("Vanguard_TextDialog.primary");
  expect([choices(addon), addon.eval(`return ${HELPER}.shopCard.lists.text:GetText()`)], "made and picked").toEqual([["Shopping", "TEST-ONLY B", "New list...", ...LIST_ACTIONS], "TEST-ONLY B"]);
  addon.eval(`${HELPER}.shopCard.lists.set("Shopping")`);
  expect(shopRow(addon, 1)[1], "picked back").toBe("Strange Dust");
  addon.eval(`for i = 3, 21 do ${HELPER}.NewList("TEST-ONLY " .. i) end for i = 1, 51 do ${HELPER}.AddEntry("x" .. i, "Shopping") end`);
  expect(addon.eval("local n = 0 for _ in pairs(VanguardDB.ah.lists) do n = n + 1 end return { n, #VanguardDB.ah.lists.Shopping }"), "20 lists, 50 entries").toEqual([20, 50]);
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

it("/vg ah list and add", () => {
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
  addon.eval("for i = 1, 20 do VanguardDB.ah.lists['TEST-ONLY ' .. i] = {} end");
  addon.clearChat();
  addon.slash("ah list Twenty-first");
  expect(chatHas(addon, /Shopping list/), "refused past the cap, nothing listed").toBe(false);
});

// The filter dialog's fields: shown, title, exact switch, level boxes, quality and max price.
const filterDialog = (addon) => addon.eval(`local d = Vanguard_AuctionFilters
  return { d:IsShown(), d.title:GetText(), d.draft.exact, d.minLevel:GetText(), d.maxLevel:GetText(), d.quality.dropdown.text:GetText(), d.price:GetText() }`);

// Opens the filter dialog of shop row i from its right-click menu.
function openFilters(addon, i) {
  addon.click(`${HELPER}.shopCard.rows[${i}]`, "RightButton");
  addon.click("Vanguard_Menu.items[1]");
}

// The browse query sent last: its text, filters, and level range.
const lastBrowse = (addon) => addon.eval(`local q for _, x in ipairs(__wfgWorld.ah.queries) do if x.fn == "SendBrowseQuery" then q = x.args[1] end end
  return { q.searchString, q.filters, q.minLevel or false, q.maxLevel or false }`);

it("search filters: exact name, levels and quality go in the browse query; a max price hides dearer results", () => {
  const addon = atAuctionHouse(DUSTS + " __wfgWorld.items[10940].quality = 2 __wfgWorld.items[10941].quality = 2");
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust" }');
  openFilters(addon, 1);
  expect(filterDialog(addon), "a plain entry: nothing set").toEqual([true, "Filters: Strange Dust", false, "", "", "Any", ""]);
  addon.click("Vanguard_AuctionFilters.exact");
  addon.type("Vanguard_AuctionFilters.minLevel", "10");
  addon.type("Vanguard_AuctionFilters.maxLevel", "20.5");
  addon.eval("Vanguard_AuctionFilters.quality.dropdown.set(2)");
  addon.type("Vanguard_AuctionFilters.price", "1g 50s");
  addon.click("Vanguard_AuctionFilters.save");
  const saved = addon.eval("local e = VanguardDB.ah.lists['TEST-ONLY Mats'][1] return { e.term, e.exact, e.minLevel, e.maxLevel, e.quality, e.maxPrice }");
  expect([saved, addon.frame("Vanguard_AuctionFilters").visible], "saved on the entry; the dialog closes").toEqual([["Strange Dust", true, 10, 20, 2, 15000], false]);
  addon.eval(`__wfgWorld.ah.browse = { { itemKey = { itemID = 10941 }, minPrice = 900, totalQuantity = 3 }, { itemKey = { itemID = 10940 }, minPrice = 20000, totalQuantity = 4 } }`);
  addon.click(`${HELPER}.shopCard.search`);
  expect(lastBrowse(addon), "ExactMatch (5), Uncommon (8) and the level range").toEqual(["Strange Dust", [5, 8], 10, 20]);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(shopRow(addon, 1).slice(1, 3), "the pouch isn't the exact name, the dust is over 1g 50s: none up").toEqual(["Strange Dust", "none up"]);
  addon.eval(`__wfgWorld.ah.browse[2].minPrice = 14000`);
  addon.advance(1);
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  expect(shopRow(addon, 1).slice(1, 3), "under the max: shown").toEqual(["Strange Dust", "1g 40s 0c"]);
  openFilters(addon, 1);
  expect(filterDialog(addon), "the dialog shows what's set").toEqual([true, "Filters: Strange Dust", true, "10", "20", "Uncommon", "1g 50s 0c"]);
  addon.type("Vanguard_AuctionFilters.price", "lots");
  addon.click("Vanguard_AuctionFilters.cancel");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats'][1].maxPrice"), "Cancel keeps them").toBe(15000);
  openFilters(addon, 1);
  addon.click("Vanguard_AuctionFilters.exact");
  for (const box of ["minLevel", "maxLevel", "price"]) addon.type(`Vanguard_AuctionFilters.${box}`, "");
  addon.eval(`Vanguard_AuctionFilters.quality.dropdown.set(${HELPER}.ANY)`);
  addon.click("Vanguard_AuctionFilters.save");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats']"), "every filter cleared: a plain name again").toEqual(["Strange Dust"]);
  addon.advance(1);
  addon.click(`${HELPER}.shopCard.search`);
  expect(lastBrowse(addon), "no filters, no levels").toEqual(["Strange Dust", {}, false, false]);
});

it("a name matches only itself or a name containing it, never an unrelated result", () => {
  const addon = atAuctionHouse(DUSTS + ` __wfgWorld.items[2589] = { name = "Linen Cloth", quality = 1 } __wfgWorld.items[4306] = { name = "TEST-ONLY Silk Bolt", pending = true }`);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "Vision Dust", "silk", "2589" }');
  addon.eval(`local AH = ${HELPER} local list = VanguardDB.ah.lists['TEST-ONLY Mats'] list[4] = { term = 2589, maxPrice = 50 }`);
  // Answers the search in flight with browse results, and lets the next go.
  const answer = (browse) => {
    addon.eval(`__wfgWorld.ah.browse = ${browse}`);
    addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
    addon.advance(1);
  };
  addon.click(`${HELPER}.shopCard.search`);
  answer("{ { itemKey = { itemID = 2589 }, minPrice = 10, totalQuantity = 9 }, { itemKey = { itemID = 10941 }, minPrice = 900, totalQuantity = 3 } }");
  answer("{ { itemKey = { itemID = 2589 }, minPrice = 10, totalQuantity = 9 } }");
  answer("{ { itemKey = { itemID = 4306 }, minPrice = 700, totalQuantity = 2 }, { itemKey = { itemID = 2589 }, minPrice = 10, totalQuantity = 9 } }");
  answer("{ { itemKey = { itemID = 2589 }, minPrice = 60, totalQuantity = 9 } }");
  expect([1, 2, 3, 4].map((i) => shopRow(addon, i).slice(1, 4)), "the pouch contains the name; linen is no dust; silk waits for its name; an ID over its max").toEqual([
    ["Strange Dust Pouch", "9s 0c", "x 3"], ["Vision Dust", "none up", ""], ["silk", "", ""], ["Linen Cloth", "none up", ""]]);
  expect(sent(addon)[3], "an ID entry with a max price still searches by its item key").toBe("SearchForItemKeys:2589");
  addon.eval("__wfgWorld.items[4306].pending = nil");
  addon.fire("ITEM_KEY_ITEM_INFO_RECEIVED", 4306);
  expect(shopRow(addon, 3).slice(1, 3), "its name came in and contains silk").toEqual(["TEST-ONLY Silk Bolt", "7s 0c"]);
  // An entry's best price among the silk bolt alone (false: no match).
  const best = (entry) => addon.eval(`local r = ${HELPER}.BestResult(${entry}, { { itemKey = { itemID = 4306 }, minPrice = 700, totalQuantity = 2 } }) return r and r.price or r`);
  expect([best('{ term = "Silk", quality = 3 }'), best('{ term = "Silk", quality = 1 }'), best('{ term = "Silk", exact = true }')], "another quality, or not the exact name, doesn't match").toEqual([false, 700, false]);
});

it("filters travel: exact names export in quotes, import as exact, and copies have their own", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "Soul Dust" }');
  addon.eval(`${HELPER}.Import('"Strange Dust";;0^"2589"', "TEST-ONLY Mats")`);
  expect(addon.eval("local l = VanguardDB.ah.lists['TEST-ONLY Mats'] return { l[2].term, l[2].exact, l[3] }"), "quotes: an exact name (an ID stays an ID)").toEqual(["Strange Dust", true, 2589]);
  addon.eval(`${HELPER}.ExportList()`);
  expect(addon.eval("return Vanguard_TextDialog.edit:GetText()"), "exported with its quotes").toBe('Soul Dust\n"Strange Dust"\n2589');
  addon.eval(`${HELPER}.DuplicateList() VanguardDB.ah.lists['TEST-ONLY Mats copy'][2].exact = false`);
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats'][2].exact"), "the copy's filters are its own").toBe(true);
  addon.eval(`${HELPER}.EditFilters("TEST-ONLY Mats", 9) ${HELPER}.EditFilters("TEST-ONLY Mats", 3)`);
  expect(filterDialog(addon).slice(0, 2), "no entry 9; an ID entry by its item's name").toEqual([true, "Filters: Linen Cloth"]);
  addon.eval(`VanguardDB.ah.lists['TEST-ONLY Mats'][3] = nil ${HELPER}.SaveFilters()`);
  expect([addon.eval("return #VanguardDB.ah.lists['TEST-ONLY Mats']"), addon.frame("Vanguard_AuctionFilters").visible], "its entry gone meanwhile: nothing saved").toEqual([2, false]);
  const prices = addon.eval(`local out = {} for i, t in ipairs({ "2.5", "75s 20c", " 3G 4s ", "12c", "0", "-1", "abc", "5x", "1g abc", "" }) do out[i] = ${HELPER}.ParseMoney(t) or false end return out`);
  expect(prices, "gold as a number, or g/s/c amounts").toEqual([25000, 7520, 30400, 12, false, false, false, false, false, false]);
});

// The text dialog: whether it shows, its title and its text.
const textDialog = (addon) => addon.eval("local f = Vanguard_TextDialog return { f:IsShown(), f.title:GetText(), f.edit:GetText() }");

// Types text into the text dialog and clicks its primary button.
function answerText(addon, text) {
  addon.type("Vanguard_TextEdit", text);
  addon.click("Vanguard_TextDialog.primary");
}

// The yes/no question: whether it shows, and its text.
const question = (addon) => addon.eval("local f = Vanguard_Question return { f:IsShown(), f.title:GetText() }");

it("list management from the dropdown: rename, duplicate, export, and delete after asking", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "2589" }');
  // Picks a dropdown value.
  const pick = (v) => addon.eval(`${HELPER}.shopCard.lists.set(${v})`);
  pick(`${HELPER}.RENAME`);
  expect(textDialog(addon).slice(0, 2), "asks for the new name").toEqual([true, "Rename TEST-ONLY Mats"]);
  answerText(addon, "  TEST-ONLY Herbs ");
  expect([choices(addon)[0], addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists['TEST-ONLY Mats'] == nil }"), textDialog(addon)[0]], "renamed, still in use, the box closed").toEqual(["TEST-ONLY Herbs", ["TEST-ONLY Herbs", true], false]);
  pick(`${HELPER}.COPY`);
  pick('"TEST-ONLY Herbs"');
  pick(`${HELPER}.COPY`);
  expect(choices(addon).slice(0, 3), "copies, each with a free name").toEqual(["TEST-ONLY Herbs", "TEST-ONLY Herbs copy", "TEST-ONLY Herbs copy 2"]);
  expect([addon.eval("return VanguardDB.ah.lists['TEST-ONLY Herbs copy 2']"), shopRow(addon, 1)[1], chatHas(addon, /Copied TEST-ONLY Herbs to TEST-ONLY Herbs copy 2\./)], "the same items, and the copy is in use").toEqual([["Strange Dust", 2589], "Strange Dust", true]);
  pick(`${HELPER}.RENAME`);
  answerText(addon, "TEST-ONLY Herbs");
  expect([chatHas(addon, /already a shopping list named TEST-ONLY Herbs\./), addon.eval("return VanguardDB.ah.list")], "a name in use is refused").toEqual([true, "TEST-ONLY Herbs copy 2"]);
  addon.click("Vanguard_TextDialog.close");
  pick(`${HELPER}.EXPORT`);
  expect(textDialog(addon), "one item per line, ready to copy").toEqual([true, "Shopping list TEST-ONLY Herbs copy 2 (Ctrl+C copies it)", "Strange Dust\n2589"]);
  pick(`${HELPER}.DELETE`);
  expect(question(addon), "asks first").toEqual([true, "Delete the shopping list TEST-ONLY Herbs copy 2 (2 items)?"]);
  addon.click("Vanguard_Question.no");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Herbs copy 2'] ~= nil"), "No keeps it").toBe(true);
  pick(`${HELPER}.DELETE`);
  addon.click("Vanguard_Question.yes");
  expect([choices(addon).slice(0, 2), addon.eval("return VanguardDB.ah.list"), chatHas(addon, /Deleted the shopping list TEST-ONLY Herbs copy 2\./)], "gone; the first list left is in use").toEqual([["TEST-ONLY Herbs", "TEST-ONLY Herbs copy"], "TEST-ONLY Herbs", true]);
  addon.eval(`${HELPER}.DeleteList("TEST-ONLY Herbs copy") ${HELPER}.DeleteList("TEST-ONLY Nothing")`);
  expect(addon.eval("return VanguardDB.ah.list"), "deleting another list leaves the one in use").toBe("TEST-ONLY Herbs");
  addon.eval(`for i = 1, 19 do ${HELPER}.NewList("TEST-ONLY " .. i) end ${HELPER}.NewList("TEST-ONLY Herbs") ${HELPER}.DuplicateList()`);
  expect(addon.eval("return { VanguardDB.ah.lists['TEST-ONLY Herbs copy'] == nil, VanguardDB.ah.list }"), "no copy past 20 lists").toEqual([true, "TEST-ONLY Herbs"]);
  addon.eval(`${HELPER}.DeleteList("TEST-ONLY Herbs") for i = 1, 19 do ${HELPER}.DeleteList("TEST-ONLY " .. i) end`);
  expect([choices(addon), addon.eval("return VanguardDB.ah.list")], "the last one deleted: no list in use").toEqual([["New list...", "Import..."], null]);
});

it("import: plain lines and Auctionator's strings, within the caps", () => {
  const addon = atAuctionHouse(DUSTS);
  addon.eval(`${HELPER}.shopCard.lists.set(${HELPER}.IMPORT)`);
  expect(textDialog(addon).slice(0, 2), "no list in use: into Shopping").toEqual([true, "Import into Shopping (names, IDs, links, or a shopping list string)"]);
  answerText(addon, "Linen Cloth\n 2589 \r\n|cffffffff|Hitem:10940::::|h[Strange Dust]|h|r\n\n   \n");
  expect([addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists.Shopping }"), textDialog(addon)[0], chatHas(addon, /Imported 3 item\(s\) into Shopping\.$/)], "a name, an ID and a link; blanks skipped").toEqual([["Shopping", ["Linen Cloth", 2589, 10940]], false, true]);
  addon.eval(`${HELPER}.AskImport()`);
  answerText(addon, '"Strange Dust";;0;0;;;;;;;;#;;^Soul Dust;1;60^ ^"";x^  "Vision Dust"  ');
  expect(addon.eval("return VanguardDB.ah.lists.Shopping"), "each term's first field (in quotes: an exact name); an empty name skipped").toEqual(["Linen Cloth", 2589, 10940, { term: "Strange Dust", exact: true }, "Soul Dust", { term: "Vision Dust", exact: true }]);
  expect(chatHas(addon, /Imported 3 item\(s\) into Shopping\. 6 other search field\(s\) ignored: Vanguard takes each item's name\.$/), "says how many fields it ignored").toBe(true);
  addon.eval(`for i = 1, 43 do ${HELPER}.AddEntry("x" .. i) end ${HELPER}.Import("a\\nb\\nc", "Shopping")`);
  expect([addon.eval("return #VanguardDB.ah.lists.Shopping"), chatHas(addon, /Imported 1 item\(s\) into Shopping\. 2 didn't fit \(a list holds at most 50\)\.$/)], "50 at most").toEqual([50, true]);
  addon.eval(`for i = 1, 19 do ${HELPER}.NewList("TEST-ONLY " .. i) end ${HELPER}.Import("a", "TEST-ONLY 21")`);
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY 21'] == nil"), "no new list past 20").toBe(true);
});

it("/vg ah rename, duplicate, delete, export and import act on the list in use", () => {
  const addon = loggedIn(AH_ENV);
  for (const word of ["rename TEST-ONLY X", "duplicate", "delete", "export"]) addon.slash(`ah ${word}`);
  expect(addon.chat().filter((l) => /Pick a shopping list first/.test(l)).length, "no list in use yet").toBe(4);
  addon.slash("ah list TEST-ONLY Mats");
  addon.slash("ah add TEST-ONLY Mats Strange Dust");
  addon.slash("ah rename");
  expect(chatHas(addon, /\/vg ah rename <new name> renames the shopping list in use\./), "a name is needed").toBe(true);
  addon.slash("ah rename TEST-ONLY Herbs");
  addon.slash("ah duplicate");
  expect(addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists['TEST-ONLY Herbs copy'] }"), "renamed, then copied").toEqual(["TEST-ONLY Herbs copy", ["Strange Dust"]]);
  addon.slash("ah export");
  expect(textDialog(addon)[2], "exported").toBe("Strange Dust");
  addon.slash("ah import");
  answerText(addon, "Soul Dust");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Herbs copy']"), "imported into it").toEqual(["Strange Dust", "Soul Dust"]);
  addon.slash("ah delete");
  addon.click("Vanguard_Question.yes");
  expect(addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists['TEST-ONLY Herbs copy'] == nil }"), "deleted after asking").toEqual(["TEST-ONLY Herbs", true]);
  addon.slash("ah");
  expect(chatHas(addon, /rename <name>, duplicate, delete, export, import, /), "the help names them").toBe(true);
});

it("Recent: the last 20 terms searched, newest first, kept for the account", () => {
  const addon = atAuctionHouse(DUSTS, { savedVariables: 'VanguardDB.ah = { recent = { "TEST-ONLY Old" } }' });
  expect([choices(addon), addon.eval(`return ${HELPER}.shopCard.lists.text:GetText()`)], "kept from before: Recent in the dropdown").toEqual([["Recent", "New list...", "Import..."], "Recent"]);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "Soul Dust", "2589" }');
  addon.click(`${HELPER}.shopCard.search`);
  expect(addon.eval("return VanguardDB.ah.recent"), "each term searched, the last first").toEqual([2589, "Soul Dust", "Strange Dust", "TEST-ONLY Old"]);
  addon.eval(`${HELPER}.shopCard.lists.set(${HELPER}.RECENT)`);
  expect([choices(addon), [1, 2, 3, 4].map((i) => shopRow(addon, i)[1])], "Recent in use: its rows, and what can be done with it").toEqual([["TEST-ONLY Mats", "Recent", "New list...", "Duplicate list", "Export list...", "Clear recent...", "Import..."], ["Linen Cloth", "Soul Dust", "Strange Dust", "TEST-ONLY Old"]]);
  addon.advance(5);
  addon.click(`${HELPER}.shopCard.search`);
  expect([addon.eval("return VanguardDB.ah.recent[1]"), progress(addon)], "searching Recent leaves its order").toEqual([2589, "0 of 4"]);
  addon.click(`${HELPER}.shopCard.rows[4]`, "RightButton");
  addon.click("Vanguard_Menu.items[2]");
  expect(addon.eval("return #VanguardDB.ah.recent"), "Remove works on Recent").toBe(3);
  addon.eval(`${HELPER}.AddEntry("TEST-ONLY New")`);
  expect(addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists.Shopping, VanguardDB.ah.lists['\\1recent'] == nil }"), "+ Add on Recent adds to Shopping").toEqual(["Shopping", ["TEST-ONLY New"], true]);
  addon.eval(`local AH = ${HELPER} AH.Remember("soul dust") AH.Remember({ term = "Soul Dust", exact = true }) for i = 1, 25 do AH.Remember("TEST-ONLY " .. i) end`);
  const recent = addon.eval("return VanguardDB.ah.recent");
  expect([recent.length, recent[0], recent[19]], "20 at most; the same term once, whatever its case").toEqual([20, "TEST-ONLY 25", "TEST-ONLY 6"]);
  addon.eval(`${HELPER}.shopCard.lists.set(${HELPER}.RECENT) ${HELPER}.shopCard.lists.set(${HELPER}.COPY)`);
  expect(addon.eval("return { VanguardDB.ah.list, #VanguardDB.ah.lists['Recent copy'] }"), "copied into a list of its own").toEqual(["Recent copy", 20]);
  addon.eval(`${HELPER}.shopCard.lists.set(${HELPER}.RECENT) ${HELPER}.shopCard.lists.set(${HELPER}.DELETE)`);
  expect(question(addon), "clearing asks first").toEqual([true, "Clear the 20 recent searches?"]);
  addon.click("Vanguard_Question.yes");
  expect([addon.eval("return #VanguardDB.ah.recent"), choices(addon).includes("Recent")], "cleared; still in use, so still listed").toEqual([0, true]);
  addon.eval(`${HELPER}.shopCard.lists.set("Shopping")`);
  expect(choices(addon).includes("Recent"), "empty and not in use: not listed").toBe(false);
});

it("/vg ah recent shows Recent", () => {
  const addon = loggedIn(AH_ENV, { savedVariables: 'VanguardDB.ah = { recent = "TEST-ONLY broken" }' });
  addon.slash("ah recent");
  expect(chatHas(addon, /Shopping list Recent \(0\): empty$/), "a broken saved value is an empty Recent").toBe(true);
  addon.eval("VanguardDB.ah.recent = { 2589, 'Soul Dust' }");
  addon.slash("ah recent");
  expect([chatHas(addon, /Shopping list Recent \(2\): Linen Cloth, Soul Dust$/), addon.eval("return VanguardDB.ah.list")], "its items, and it's in use").toEqual([true, "\u0001recent"]);
  addon.slash("ah");
  expect(chatHas(addon, /import, recent, scan/), "the help names it").toBe(true);
});

// The results view: shown, the item's name, the status line, and its rows shown as [price, quantity, time left, marked].
const view = (addon) => addon.eval(`local f = ${HELPER}.shopCard.view local rows = {}
  for i, r in ipairs(f.rows) do if r:IsShown() then rows[i] = { r.cells.price:GetText(), r.cells.qty:GetText(), r.cells.time:GetText(), r.mark:IsShown() } end end
  return { f:IsShown(), f.name:GetText() or false, f.status:GetText() or false, rows }`);

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

it("a shop row opens every listing of its item in place of the rows; columns sort; Back returns", () => {
  const addon = atAuctionHouse(DUSTS + DUST_LISTINGS);
  dustFound(addon);
  addon.click(`${HELPER}.shopCard.rows[1]`);
  const q = addon.eval("local q = __wfgWorld.ah.queries[#__wfgWorld.ah.queries] return { q.fn, q.args[1].itemID, q.args[2][1].sortOrder, q.args[3] }");
  expect(q, "the item's own search, cheapest first, through the queue").toEqual(["SendSearchQuery", 10940, 0, false]);
  expect([view(addon).slice(0, 3), addon.eval(`return ${HELPER}.shopCard.body:IsShown()`)], "the view in place of the rows, searching").toEqual([[true, "Strange Dust", "searching..."], false]);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect(view(addon), "cheapest first, the hidden price left out, six rows").toEqual([true, "Strange Dust", "", [
    ["12s 50c", "7", "10 min", true], ["12s 50c", "20", "50 min", false], ["13s 0c", "200", "11 h", false],
    ["13s 99c", "5", "27 h", false], ["14s 50c", "1", "2 h", false], ["15s 0c", "60", "", false]]]);
  expect(addon.eval(`return ${HELPER}.pending == nil`), "its search is answered").toBe(true);
  addon.click(`${HELPER}.shopCard.view.heads[2]`);
  expect(view(addon)[3].map((r) => r[1]), "by quantity").toEqual(["1", "3", "5", "7", "12", "20"]);
  addon.click(`${HELPER}.shopCard.view.heads[2]`);
  expect([view(addon)[3].map((r) => r[1]), addon.eval(`return ${HELPER}.shopCard.view.arrow:GetRotation()`)], "again: most first, the arrow turned").toEqual([["200", "60", "20", "12", "7", "5"], 0]);
  addon.click(`${HELPER}.shopCard.view.heads[3]`);
  expect(view(addon)[3].map((r) => r[2]), "by time left (none first)").toEqual(["", "1 min", "10 min", "50 min", "2 h", "2 h"]);
  addon.wheel(`${HELPER}.shopCard.view.rows[1]`, -5);
  expect(view(addon)[3].map((r) => r[2]), "the wheel scrolls to the end").toEqual(["10 min", "50 min", "2 h", "2 h", "11 h", "27 h"]);
  addon.advance(1);
  addon.click(`${HELPER}.shopCard.view.rows[2]`);
  expect([sent(addon).at(-1), restrictedLog(addon)], "a listing opens its item in the game's own list; nothing is bought").toEqual(["SearchForItemKeys:10940", []]);
  addon.click(`${HELPER}.shopCard.view.back`);
  expect([view(addon)[0], addon.eval(`return ${HELPER}.shopCard.body:IsShown()`), shopRow(addon, 1)[1]], "Back: the rows again").toEqual([false, true, "Strange Dust"]);
});

it("the view reads further pages as it scrolls, shows time-left bands and leaves out what's over the max price", () => {
  const addon = atAuctionHouse(BAGS + `TIME_LEFT_LONG = "TEST-ONLY Long"
    __wfgWorld.ah.searchFull = false
    __wfgWorld.ah.items[9999] = {}
    for i = 1, 8 do __wfgWorld.ah.items[9999][i] = { buyoutAmount = 1000 * i, quantity = 1, timeLeft = i % 4 } end
    table.insert(__wfgWorld.ah.items[9999], { minBid = 10, quantity = 1, timeLeft = 0 })
    table.insert(__wfgWorld.ah.items[9999], { buyoutAmount = 99000, quantity = 1, timeLeft = 9 })`);
  makeList(addon, "TEST-ONLY Gear", "{ \"9999\" }");
  addon.eval("VanguardDB.ah.lists['TEST-ONLY Gear'][1] = { term = 9999, maxPrice = 50000 }");
  addon.click(`${HELPER}.shopCard.rows[1]`);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(view(addon)[3].map((r) => [r[0], r[2]]), "an item's buyout, its band by the game's name or ours; bid only and over 5g left out").toEqual([
    ["10s 0c", "Medium"], ["20s 0c", "TEST-ONLY Long"], ["30s 0c", "Very long"], ["40s 0c", "Short"], ["50s 0c", "Medium"], ["60s 0c", "TEST-ONLY Long"]]);
  addon.wheel(`${HELPER}.shopCard.view`, -1);
  addon.advance(1);
  expect(sent(addon).slice(-1)[0], "near the end: the next page, through the queue").toBe("RequestMoreItemSearchResults:9999");
  addon.wheel(`${HELPER}.shopCard.view`, 1);
  addon.advance(1);
  expect(sent(addon).filter((x) => x.startsWith("RequestMore")).length, "asked once until it comes").toBe(1);
  addon.eval("__wfgWorld.ah.items[9999][11] = { buyoutAmount = 500, quantity = 1, timeLeft = 3 } __wfgWorld.ah.searchFull = true");
  addon.fire("ITEM_SEARCH_RESULTS_ADDED", { itemID: 9999 });
  expect([view(addon)[3][0][0], addon.eval(`return ${HELPER}.pending == nil`)], "the new page sorted in; the request done").toEqual(["5s 0c", true]);
  addon.wheel(`${HELPER}.shopCard.view`, -5);
  addon.advance(2);
  expect(sent(addon).filter((x) => x.startsWith("RequestMore")).length, "all in: no more asked").toBe(1);
  addon.click(`${HELPER}.shopCard.view.back`);
  addon.eval(`VanguardDB.ah.lists['TEST-ONLY Gear'][2] = 'TEST-ONLY Unsearched' ${HELPER}.PaintShop()`);
  addon.click(`${HELPER}.shopCard.rows[2]`);
  expect(view(addon)[0], "a name not searched yet opens nothing").toBe(false);
});

it("a commodity view asks for more with the commodity call; an empty answer says none up; closing drops it", () => {
  const addon = atAuctionHouse(DUSTS + DUST_LISTINGS + " __wfgWorld.ah.searchFull = false");
  dustFound(addon);
  addon.click(`${HELPER}.shopCard.rows[1]`);
  addon.wheel(`${HELPER}.shopCard.view`, -1);
  addon.advance(2);
  expect(sent(addon).some((x) => x.startsWith("RequestMore")), "nothing asked before the first answer").toBe(false);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 555);
  addon.wheel(`${HELPER}.shopCard.view`, -2);
  addon.advance(1);
  expect(addon.eval("local q = __wfgWorld.ah.queries[#__wfgWorld.ah.queries] return { q.fn, q.args[1] }"), "the commodity's next page").toEqual(["RequestMoreCommoditySearchResults", 10940]);
  addon.eval("__wfgWorld.ah.commodities[10940] = {}");
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 10940);
  expect(view(addon).slice(2), "nothing left: none up").toEqual(["none up", {}]);
  addon.world.closeAuctionHouse();
  addon.world.openAuctionHouse();
  addon.update(0);
  expect([view(addon)[0], shopRow(addon, 1)[0]], "a new visit starts on the rows").toEqual([false, true]);
});

it("keys: Up and Down mark a listing, Enter opens it, only while the mouse is over the view; other keys go on", () => {
  const addon = atAuctionHouse(DUSTS + DUST_LISTINGS);
  dustFound(addon);
  addon.click(`${HELPER}.shopCard.rows[1]`);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.eval(`local f = ${HELPER}.shopCard.view f.SetPropagateKeyboardInput = function(self, v) self.__passed = v end f.EnableKeyboard = function(self, on) self.__kb = on end`);
  // Whether the view has the keyboard, and whether its last key went on to the game.
  const kb = () => addon.eval(`local f = ${HELPER}.shopCard.view return { f.__kb == true, f.__passed }`);
  // Presses a key on the view, as the client does while it has the keyboard.
  const press = (key) => addon.key(`${HELPER}.shopCard.view`, key);
  addon.hover(`${HELPER}.shopCard.view.rows[1]`);
  expect(kb()[0], "the mouse over a listing: the view takes the keys").toBe(true);
  press("DOWN");
  expect([view(addon)[3][1][3], kb()[1]], "Down marks the next; the key stops here").toEqual([true, false]);
  press("UP");
  press("UP");
  expect(view(addon)[3][0][3], "Up, not past the first").toBe(true);
  for (let i = 0; i < 7; i++) press("DOWN");
  expect([view(addon)[3].map((r) => r[0]), view(addon)[3].at(-1)], "Down past the sixth scrolls; not past the last, which is marked").toEqual([["13s 0c", "13s 99c", "14s 50c", "15s 0c", "19s 90c", "25s 0c"], ["25s 0c", "3", "1 min", true]]);
  addon.advance(1);
  press("ENTER");
  expect(sent(addon).at(-1), "Enter opens the marked one in the game's list").toBe("SearchForItemKeys:10940");
  press("W");
  expect(kb()[1], "a key the view doesn't use goes on to the game").toBe(true);
  addon.eval("GetCurrentKeyBoardFocus = function() return ns.GetModule('AuctionHelper').frame end");
  press("DOWN");
  expect([view(addon)[3].at(-1)[3], kb()[1]], "while a box has the typing, keys go on").toEqual([true, true]);
  addon.eval("GetCurrentKeyBoardFocus = function() return nil end");
  addon.hover(null);
  expect(kb()[0], "the mouse left: the keys are the game's").toBe(false);
  addon.hover(`${HELPER}.shopCard.view`);
  addon.hover(`${HELPER}.shopCard.view.rows[2]`);
  expect(kb()[0], "from the view onto a row: still the view's").toBe(true);
  setCombat(addon, true);
  addon.hover(`${HELPER}.shopCard.view`);
  press("DOWN");
  expect([kb()[0], kb()[1]], "in combat: never takes the keys, never sets their passing").toEqual([false, true]);
  setCombat(addon, false);
  addon.eval(`${HELPER}.shopCard.view:Hide()`);
  expect(kb()[0], "hidden: none").toBe(false);
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
  addon.click(`${CARD}.perStack`);
  addon.type(`${CARD}.price`, "150");
  expect(card(addon)[0][3], "a bare number is copper").toBe("1s 50c");
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
  expect([listingRow(addon, 1)[1], listingRow(addon, 4)[1], sent(addon)], "scrolled to the end: the next page waits a second after the last search").toEqual(["3s 0c", "6s 0c", ["SendSellSearchQuery:2589"]]);
  addon.advance(1);
  addon.wheel(`${CARD}.listings[1]`, -1);
  expect(sent(addon), "asked once, through the queue").toEqual(["SendSellSearchQuery:2589", "RequestMoreCommoditySearchResults:"]);
  expect(addon.eval("return __wfgWorld.ah.queries[2].args[1]"), "for the linen").toBe(2589);
  addon.eval("for i = 7, 8 do __wfgWorld.ah.commodities[2589][i] = { unitPrice = 100 * i, quantity = i } end __wfgWorld.ah.more[2589] = nil");
  addon.fire("COMMODITY_SEARCH_RESULTS_ADDED", 2589);
  addon.wheel(`${CARD}.listings[1]`, -5);
  addon.advance(5);
  expect([listingRow(addon, 4)[1], sent(addon).length], "the page is in; all of it: nothing more asked").toEqual(["8s 0c", 2]);
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
  expect([listingRow(addon, 3)[3], listingRow(addon, 4)[3]], "a band the game doesn't name: nothing; seconds: at least a minute").toEqual(["", "1 min"]);
  expect(sent(addon).at(-1), "the next page by the item's key").toBe("RequestMoreItemSearchResults:9999");
  addon.eval("__wfgWorld.ah.more[9999] = nil table.insert(__wfgWorld.ah.items[9999], { buyoutAmount = 9900, quantity = 1, timeLeft = 3 })");
  addon.fire("ITEM_SEARCH_RESULTS_ADDED", { itemID: 9999 });
  addon.wheel(`${CARD}.listings[1]`, -5);
  expect(listingRow(addon, 4)[1], "the page is in").toBe("99s 0c");
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

// The price line: [label, value, label in "bad", value in "bad"].
const priceLine = (addon) => {
  const [label, value, labelColor, valueColor] = addon.eval(`local l = ${CARD}.lines[4] return { l:GetText(), l.value:GetText(), l.__textColor, l.value.__textColor }`);
  return [label, value, isTok(addon, labelColor, "bad"), isTok(addon, valueColor, "bad")];
};

it("vendor floor: the price line turns red under the vendor's price, and Post waits unless the option is off", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS);
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  expect([priceLine(addon), card(addon)[2]], "1s a unit is over linen's 13c").toEqual([["Your price", "1s 0c", false, false], true]);
  addon.type(`${CARD}.price`, "12");
  expect([priceLine(addon), card(addon)[2]], "12c is under it: red, and no Post").toEqual([["Under vendor price", "12c", true, true], false]);
  addon.click(`${CARD}.post`);
  expect(restrictedLog(addon).length, "nothing posted").toBe(0);
  addon.type(`${CARD}.price`, "13");
  expect([priceLine(addon), card(addon)[2]], "at the vendor's price: fine").toEqual([["Your price", "13c", false, false], true]);
  addon.eval("ns.Settings('AuctionHelper').vendorFloor = false");
  addon.type(`${CARD}.price`, "11");
  expect([priceLine(addon)[2], card(addon)[2]], "the option off: still red, but Post works").toEqual([true, true]);
  addon.click(`${CARD}.post`);
  expect([restrictedLog(addon)[0].slice(0, 6), priceLine(addon)], "posted at 11c; the card empties").toEqual([["PostCommodity", true, "0:3", 1, 20, 11], ["Your price", "", false, false]]);
});

it("vendor floor: an item the vendor won't buy, or a hidden vendor price, is never under", () => {
  const addon = atAuctionHouse(BAGS + LINEN_BAGS + "__wfgWorld.items[2589].sellPrice = __wfgWorld.secret(13) __wfgWorld.ah.items[9999] = { { buyoutAmount = 5000, quantity = 1 } }");
  dropAndAnswer(addon, 3, "COMMODITY_SEARCH_RESULTS_UPDATED", 2589);
  addon.type(`${CARD}.price`, "1");
  expect([priceLine(addon)[2], card(addon)[2], addon.eval("return #ns.errors")], "hidden: not red, Post works, no error").toEqual([false, true, 0]);
  addon.advance(1);
  dropAndAnswer(addon, 2, "ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  addon.type(`${CARD}.price`, "1");
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
  expect([ownedRow(addon, 1), ownedRow(addon, 2), ownedRow(addon, 3), ownedRow(addon, 4)[0]], "the dust is undercut (1s 20c against your 1s 50c), the blade isn't; the sold blade shows as sold").toEqual([[true, "Strange Dust", "1s 50c", true], [true, "TEST-ONLY Blade", "40s 0c", false], [true, "TEST-ONLY Blade", "sold · 40s 0c", false], false]);
  expect(isTok(addon, addon.eval(`return ${SCAN_CARD}.owned[1].mark.__vertexColor`), "bad"), "the mark is red").toBe(true);
  addon.hover(`${SCAN_CARD}.owned[1].cancel`);
  expect(addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out"), "what cancelling costs").toEqual(["Cancel this auction", "Costs 1s 0c"]);
  addon.hover(null);
  addon.click(`${SCAN_CARD}.owned[1].cancel`);
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
  expect([ownedRow(addon, 1)[2], ownedRow(addon, 4)[0]], "scrolled to the end: 7 auctions (one sold), 4 rows").toEqual(["90c", true]);
});

// Two more dust auctions of yours: 2 at 1s 30c a unit (undercut by the 1s 20c up) and 2 at 1s 10c (not).
const MORE_DUST = `table.insert(__wfgWorld.ah.owned, { auctionID = 506, itemKey = { itemID = 10940 }, status = 0, quantity = 2, buyoutAmount = 130 })
  table.insert(__wfgWorld.ah.owned, { auctionID = 507, itemKey = { itemID = 10940 }, status = 0, quantity = 2, buyoutAmount = 110 })`;

const CANCEL_NEXT = `${SCAN_CARD}.cancelNext`;

// The line under your auctions, and whether Cancel next undercut works.
const nextState = (addon) => addon.eval(`local c = ${SCAN_CARD} return { c.summary:GetText(), c.cancelNext:IsEnabled() }`);

// The tooltip's lines.
const tipLines = (addon) => addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out");

it("Cancel next undercut cancels one undercut auction per click, then says none are left", () => {
  const addon = atAuctionHouse(BAGS + OWNED + MORE_DUST);
  expect(nextState(addon), "before a check: no line, nothing to cancel").toEqual(["", false]);
  addon.click(`${SCAN_CARD}.check`);
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
  addon.click(`${SCAN_CARD}.check`);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.advance(1);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.advance(4);
  expect(nextState(addon), "the blade's check gave up: soon after, the line still says how many").toEqual(["2 undercut", true]);
  addon.click(CANCEL_NEXT);
  expect([restrictedLog(addon).map((c) => c[2]), nextState(addon)], "501 can't be cancelled, so 506 goes; 501 still counts").toEqual([[506], ["1 undercut", false]]);
  addon.eval("__wfgWorld.ah.owned = {}");
  addon.click(`${SCAN_CARD}.check`);
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
  const r = `${SCAN_CARD}.owned[${i}]`;
  const color = addon.frame(`${r}.price`).textColor;
  const token = ["good", "gold", "text2"].find((t) => isTok(addon, color, t)) || "other";
  return addon.eval(`local r = ${r} return { r:IsShown(), r.name:GetText() or false, r.price:GetText() or false, "${token}", r.cancel:IsShown(), r.relist:IsShown(), r.relist:IsEnabled() }`);
};

it("sold rows show the amount, and are neither cancelled nor counted as undercut", () => {
  const addon = atAuctionHouse(BAGS + SOLD + "__wfgWorld.ah.items[9999] = { { buyoutAmount = 100, quantity = 1 } }");
  addon.click(`${SCAN_CARD}.check`);
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
  expect([addon.eval(`return ${SCAN_CARD}.owned[2].mark:IsShown()`), ownedRow(addon, 4)[3], nextState(addon)], "only the blade still up is undercut (1s up)").toEqual([false, true, ["1 undercut", true]]);
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
  addon.click(`${SCAN_CARD}.owned[2].relist`);
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
  addon.click(`${SCAN_CARD}.owned[3].relist`);
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

// Deals ----------------------------------------------------------------------------------------

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

it("deals: a scan lists what's under 70 % of the 7-day market or under vendor price, best first, right of the window", () => {
  const markets = `, markets = { [${TODAY - 1}] = 1200, [${TODAY - 2}] = 1000, [${TODAY - 8}] = 9000 }`;
  const addon = atAuctionHouse(DUSTS, { savedVariables: dustHistory(1000, markets) });
  const [deals, window] = [addon.frame("Vanguard_AuctionDeals"), addon.frame("AuctionHouseFrame")];
  expect([deals.rect.left, deals.rect.top, deals.rect.width, deals.rect.height, deals.rect.right <= 1920], "4 px right of the window, from its top, on the screen").toEqual([window.rect.right + 4, window.rect.top, 280, 196, true]);
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
  expect([sent(addon).at(-1), restrictedLog(addon)], "a click shows it in the game's own list; nothing is bought").toEqual(["SearchForItemKeys:2589", []]);
});

it("deals: each search judges its item again; a low before today stands in for a market; closing forgets them", () => {
  const addon = atAuctionHouse(BAGS + DUST_UP + CLICK_LUA, { savedVariables: dustHistory(150) });
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
  expect(dealRow(addon, 1)[1], "the wheel scrolls").toBe("item 50009");
  addon.wheel(`${DEALS}.card.rows[1]`, -5);
  expect([dealRow(addon, 1)[1], dealRow(addon, 8)[1]], "no further than the last").toEqual(["item 50008", "item 50001"]);
  addon.wheel(`${DEALS}.card.rows[1]`, 9);
  expect(dealRow(addon, 1)[1], "nor above the first").toBe("item 50010");
  addon.world.closeAuctionHouse();
  addon.eval("ns.AuctionPrices.RecordSeen(50001, 1)");
  addon.world.openAuctionHouse();
  addon.update(0);
  expect(dealsCard(addon), "a new visit starts with none; nothing is judged while the house is closed").toEqual([true, "", "None yet: a scan or a search finds them."]);
  addon.eval('ns.Options.Show("more") __click("Deals card")');
  addon.eval("ns.AuctionPrices.RecordSeen(50001, 1)");
  expect([addon.eval("return ns.Settings('AuctionHelper').deals"), addon.frame("Vanguard_AuctionDeals").visible, addon.eval(`return next(${HELPER}.deals) == nil`)], "switched off under Auction house: the card goes at once, nothing is judged").toEqual([false, false, true]);
});

it("deals: with the panel off nothing is built, and a deal found paints nothing", () => {
  const addon = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  addon.eval("ns.AuctionPrices.RecordSeen(2589, 5)");
  addon.update(0.01);
  expect([addon.frame("Vanguard_AuctionDeals"), addon.eval(`return ${HELPER}.deals[2589].price`), addon.eval("return #ns.errors")], "no card, the deal kept, no error").toEqual([null, 5, 0]);
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
