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
  const p = addon.eval("local p = ForeverUIDB.ah.prices[2589] return { p.min, p.t, p.days[math.floor(__now / 86400)] }");
  expect(p, "90 a unit beats 500 for 5, today").toEqual([90, 1790000000, 90]);
  expect(addon.eval("return { ForeverUIDB.ah.prices[159] == nil, ForeverUIDB.ah.count }"), "a listing without a buyout is skipped").toEqual([true, 1]);
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
  expect(addon.eval("return { ForeverUIDB.ah.count, ForeverUIDB.ah.prices[90001].min }"), "7 items, each at its cheapest").toEqual([7, 1001]);
});

it("the tooltip line says what an item went for, and when", () => {
  const addon = atAuctionHouse();
  scan(addon, LINEN);
  const [line] = addon.eval('return __showItem("item:2589")');
  expect([line[0], isTok(addon, line[1], "text2")], "the cheapest unit price, in text2").toEqual(["AH: 90c (today)", true]);
  expect(addon.eval('return #__showItem("item:159")'), "no line for an item no scan priced").toBe(0);
  addon.eval("__now = __now + 86400");
  expect(addon.eval('return __showItem("item:2589")[1][1]')).toBe("AH: 90c (yesterday)");
  addon.eval("__now = __now + 2 * 86400 ForeverUIDB.ah.prices[2589].min = 123456");
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "gold, silver and copper").toBe("AH: 12g 34s 56c (3 days ago)");
  addon.eval("ForeverUIDB.ah.prices[2589].min = 1250");
  expect(addon.eval('return __showItem("item:2589")[1][1]'), "silver and copper").toBe("AH: 12s 50c (3 days ago)");
  addon.eval("ns.Settings('AuctionHelper').tooltip = false");
  expect(addon.eval('return #__showItem("item:2589")'), "the switch turns it off").toBe(0);
});

it("pruning and caps: old prices go at login, and past the cap the oldest items go", () => {
  const day = 86400;
  const saved = `ForeverUIDB.ah = { count = 2, prices = {
    [1] = { min = 5, t = 1790000000 - 31 * ${day}, days = {} },
    [2] = { min = 6, t = 1790000000 - ${day}, days = { [math.floor(1790000000 / ${day}) - 20] = 1, [math.floor(1790000000 / ${day}) - 1] = 6 } } } }`;
  const addon = loggedIn(AH_ENV, { savedVariables: saved });
  const kept = addon.eval("local p = ForeverUIDB.ah.prices local n = 0 for _ in pairs(p[2].days) do n = n + 1 end return { p[1] == nil, n, ForeverUIDB.ah.count }");
  expect(kept, "the 31-day-old price is gone, and the other's 20-day-old low").toEqual([true, 1, 1]);
  expect(addon.eval("return ns.AuctionPrices.Low7(2)"), "the 7-day low").toBe(6);
  addon.eval("ForeverUIDB.ah.prices, ForeverUIDB.ah.count = {}, 0 local AP = ns.AuctionPrices AP.MAX_ITEMS = 10 for i = 1, 10 do AP.Record(100 + i, i, 1790000000 + i) end");
  expect(addon.eval("return ForeverUIDB.ah.count"), "at the cap").toBe(10);
  addon.eval("ns.AuctionPrices.Record(200, 7, 1790000100)");
  const after = addon.eval("local p = ForeverUIDB.ah.prices return { ForeverUIDB.ah.count, p[101] == nil, p[102] == nil, p[103] ~= nil, p[200] ~= nil }");
  expect(after, "the 11th item keeps the newest 9: the two oldest go").toEqual([9, true, true, true, true]);
});

it("a hidden number skips its listing without an error", () => {
  const addon = atAuctionHouse();
  scan(addon, "{ { itemID = 2589, count = __wfgWorld.secret(1), buyoutPrice = 90 }, { itemID = 2589, count = 2, buyoutPrice = 300 } }");
  expect(addon.eval("return { ForeverUIDB.ah.prices[2589].min, #ns.errors }"), "only the plain listing counts").toEqual([150, 0]);
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
  expect(addon.eval(`return { ${HELPER}.scan == nil, ForeverUIDB.ah.prices[2589] == nil, __wfgWorld.ah.reads }`), "nothing recorded, no more reads").toEqual([true, true, 400]);
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
