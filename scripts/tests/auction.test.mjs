// auction: the Auction helper (Modules/AuctionHelper.lua) on the game's window: its tabs, the scan,
// the switches and /vg ah, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";
import { AH_ENV, HELPER, LINEN, SCAN_BUTTON, atAuctionHouse, lastLine, pickTab } from "./auction-env.mjs";

// The window's title text.
const title = (addon) => addon.eval("return AuctionHouseFrame.TitleContainer.TitleText:GetText()");

it("two tabs join the window after the game's three; each shows its page over the content area and names the title", () => {
  const addon = atAuctionHouse();
  const window = addon.frame("AuctionHouseFrame");
  const tabs = addon.eval("local out = {} for i, t in ipairs(AuctionHouseFrame.Tabs) do out[i] = t:GetText() end return out");
  expect([tabs, addon.eval("return AuctionHouseFrame.numTabs")], "Shopping and Selling after Buy, Sell and Auctions").toEqual([["Buy", "Sell", "Auctions", "Shopping", "Selling"], 5]);
  expect([addon.frame("Vanguard_AuctionShopping").visible, addon.frame("Vanguard_AuctionSelling").visible, title(addon)], "both pages hidden on the game's Buy page").toEqual([false, false, "Browse Auctions"]);
  pickTab(addon, 4);
  const page = addon.frame("Vanguard_AuctionShopping");
  expect([page.visible, page.rect.left, page.rect.top, page.rect.width, page.rect.height, title(addon), addon.eval("return AuctionHouseFrame.selectedTab")], "Shopping: its page over the content area (under the title, above the money line), the title named, the tab selected").toEqual([true, window.rect.left + 4, window.rect.top - 30, 792, 478, "Shopping", 4]);
  const rows = addon.eval(`local AH = ${HELPER} return { AH.SHOP_ROWS, AH.VIEW_ROWS, AH.DEAL_ROWS, AH.LIST_ROWS, AH.OWNED_ROWS }`);
  expect(rows, "the rows fill the room: 19 shop and view rows, 18 deals, 9 listings under the sell form, 19 of your auctions").toEqual([19, 19, 18, 9, 19]);
  const fits = addon.eval(`local AH, out = ${HELPER}, {}
    for i, c in ipairs({ AH.shopCard, AH.dealsFrame.card, AH.scanCard, AH.sellCard, AH.ownedCard }) do out[i] = { c:GetLeft(), c:GetRight(), c:GetTop(), c:GetBottom() } end return out`);
  const [l, r, t, b] = [page.rect.left, page.rect.right, page.rect.top, page.rect.bottom];
  expect(fits.every(([cl, cr, ct, cb]) => cl >= l && cr <= r && ct <= t && cb >= b), "every card inside its page").toBe(true);
  expect([fits[0][1] <= fits[1][0], fits[1][3] > fits[2][2], fits[3][1] <= fits[4][0]], "Shop left of Deals, the scan under Deals; Sell left of your auctions").toEqual([true, true, true]);
  expect(addon.eval(`local c = ${HELPER}.sellCard return { c.post:GetBottom() >= c:GetBottom(), c.status:GetBottom() >= c:GetBottom(), c.length:GetBottom() > c.post:GetTop() }`), "the sell form fits its card, rows apart").toEqual([true, true, true]);
  expect(addon.eval(`local c = ${HELPER}.ownedCard return { c.owned[#c.owned]:GetBottom() > c.cancelNext:GetTop(), c.cancelNext:GetBottom() >= c:GetBottom() }`), "Cancel next undercut under the last row, inside the card").toEqual([true, true]);
  pickTab(addon, 5);
  expect([addon.frame("Vanguard_AuctionShopping").visible, addon.frame("Vanguard_AuctionSelling").visible, title(addon)], "Selling").toEqual([false, true, "Selling"]);
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

it("switches: no tabs, no scan button; nothing at all in combat", () => {
  const off = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  expect([off.frame("Vanguard_AuctionShopping"), off.eval("return #AuctionHouseFrame.Tabs")], "no pages, the game's three tabs alone").toEqual([null, 3]);
  const noButton = atAuctionHouse("", { savedVariables: "VanguardDB.profiles = { Default = { AuctionHelper = { scanButton = false } } }" });
  expect(noButton.eval(`return ${SCAN_BUTTON}:IsShown()`), "no scan button").toBe(false);
  const fight = loggedIn(AH_ENV);
  setCombat(fight, true);
  fight.world.openAuctionHouse();
  fight.update(0);
  expect(fight.frame("Vanguard_AuctionShopping"), "ignored in combat").toBe(null);
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
