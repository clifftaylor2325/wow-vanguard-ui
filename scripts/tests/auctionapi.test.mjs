// auctionapi: ForeverUI.API.v1 (Modules/AuctionAPI.lua), the auction prices, shopping lists and
// searches other addons call, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock a test moves (__now), dusts (Strange Dust a commodity, and a pouch
// named like it), and __call(fn, ...), which calls an API function from Lua and returns
// { ok, result or error }.
const API_ENV = `
  __now = 1790000000
  time = function() return __now end
  __wfgWorld.items[10940] = { name = "Strange Dust", icon = "TEST-ONLY-DUST", commodity = true, sellPrice = 4 }
  __wfgWorld.items[10941] = { name = "Strange Dust Pouch", icon = "TEST-ONLY-POUCH", sellPrice = 0 }
  function __call(fn, ...)
    local ok, out = pcall(ForeverUI.API.v1[fn], ...)
    return { ok, out }
  end
`;

const HELPER = "ns.GetModule('AuctionHelper')";

// A logged-in addon (extra Lua before login), the auction house open unless `closed`.
function withApi(extra = "", { closed = false, savedVariables } = {}) {
  const addon = loggedIn(API_ENV + extra, { savedVariables });
  if (!closed) {
    addon.world.openAuctionHouse();
    addon.update(0);
  }
  return addon;
}

// Calls API function `fn` with Lua argument text `args`; its single result (null for nil).
const call = (addon, fn, args) => addon.eval(`return ForeverUI.API.v1.${fn}(${args})`);

// The queries sent, as "fn:what" (a browse's search text, else the first item key's itemID).
const sent = (addon) => {
  const out = addon.eval(`local out = {}
    for i, q in ipairs(__wfgWorld.ah.queries) do
      local a = q.args[1]
      out[i] = q.fn .. ":" .. tostring(type(a) == "table" and (a.searchString or a.itemID or (a[1] and a[1].itemID)) or "")
    end
    return out`);
  return Array.isArray(out) ? out : [];
};

// A shopping list's entries, or null.
const listOf = (addon, name) => addon.eval(`return ForeverUIDB.ah.lists["${name}"]`);

const NAMES = ["AlterShoppingListItems", "CreateShoppingList", "GetAuctionPriceByItemID", "GetAuctionPriceByItemLink",
  "GetDisenchantPriceByItemID", "GetDisenchantPriceByItemLink",
  "GetVendorPriceByItemID", "GetVendorPriceByItemLink", "MultiSearch", "MultiSearchExact", "RegisterForDBUpdate"];

it("ForeverUI.API.v1 has Auctionator's function names, and every one wants a callerID string", () => {
  const addon = withApi();
  expect(addon.eval("local out = {} for k, v in pairs(ForeverUI.API.v1) do if type(v) == 'function' then out[#out + 1] = k end end table.sort(out) return out")).toEqual(NAMES);
  for (const fn of NAMES) {
    const [ok, err] = addon.eval(`return __call("${fn}", 42, 2589)`);
    expect([fn, ok, err.replace(/^.*?: (?=ForeverUI)/, "")], "a number for callerID").toEqual([fn, false, `ForeverUI.API.v1.${fn}: callerID must be a string, got number`]);
  }
  expect(addon.eval("return __call('MultiSearch', nil, {})[2]"), "no callerID").toMatch(/MultiSearch: callerID must be a string, got nil$/);
  const where = addon.eval("local ok, err = pcall(function() local p = ForeverUI.API.v1.GetAuctionPriceByItemID('TEST-ONLY Addon', '2589') return p end) return err");
  expect(where, "the error names the caller's line (not ForeverUI's), and the argument").toMatch(/^eval:\d+: ForeverUI\.API\.v1\.GetAuctionPriceByItemID: itemID must be a number, got string$/);
  const wrong = [["GetAuctionPriceByItemLink", "2589", "itemLink must be a string, got number"],
    ["GetDisenchantPriceByItemID", "'9101'", "itemID must be a number, got string"], ["GetDisenchantPriceByItemLink", "9101", "itemLink must be a string, got number"],
["GetVendorPriceByItemID", "'x'", "itemID must be a number, got string"],
    ["GetVendorPriceByItemLink", "{}", "itemLink must be a string, got table"], ["RegisterForDBUpdate", "'x'", "callback must be a function, got string"],
    ["MultiSearch", "'Strange Dust'", "terms must be a table, got string"], ["MultiSearchExact", "nil", "terms must be a table, got nil"],
    ["CreateShoppingList", "5, {}", "listName must be a string, got number"], ["CreateShoppingList", "'L'", "items must be a table, got nil"],
    ["AlterShoppingListItems", "nil, {}", "listName must be a string, got nil"], ["AlterShoppingListItems", "'L', 'x'", "items must be a table, got string"]];
  for (const [fn, args, msg] of wrong) {
    expect(addon.eval(`return __call("${fn}", "TEST-ONLY Addon", ${args})[2]`), fn).toMatch(new RegExp(`${fn}: ${msg}$`));
  }
});

it("auction prices by item ID and link: this realm and faction's cheapest unit price last seen, in copper", () => {
  const addon = withApi();
  addon.eval("ns.AuctionPrices.Record(2589, 90, __now, 100, 120) ns.AuctionPrices.Record(2589, 110, __now + 60)");
  expect(call(addon, "GetAuctionPriceByItemID", "'TEST-ONLY Addon', 2589"), "the last seen, not the day's low or the market").toBe(110);
  expect(call(addon, "GetAuctionPriceByItemLink", "'TEST-ONLY Addon', '|cffffffff|Hitem:2589::::::::60:::::|h[Linen Cloth]|h|r'"), "by link").toBe(110);
  expect(call(addon, "GetAuctionPriceByItemLink", "'TEST-ONLY Addon', 'item:2589'"), "a bare item string").toBe(110);
  expect([call(addon, "GetAuctionPriceByItemID", "'TEST-ONLY Addon', 159"), call(addon, "GetAuctionPriceByItemLink", "'TEST-ONLY Addon', 'no link'")], "never seen, and no item in the text").toEqual([null, null]);
  addon.eval("__wfgWorld.units.player.faction = 'Horde'");
  expect(call(addon, "GetAuctionPriceByItemID", "'TEST-ONLY Addon', 2589"), "the other faction's house has none").toBe(null);
  addon.eval("ForeverUIDB = nil");
  expect(call(addon, "GetAuctionPriceByItemID", "'TEST-ONLY Addon', 2589"), "before the saved variables load: none, and no error").toBe(null);
});

it("vendor prices by item ID and link, from the client's item info", () => {
  const addon = withApi();
  expect(call(addon, "GetVendorPriceByItemID", "'TEST-ONLY Addon', 10940"), "a merchant pays 4c").toBe(4);
  expect(call(addon, "GetVendorPriceByItemLink", "'TEST-ONLY Addon', '|cffffffff|Hitem:2589::::|h[Linen Cloth]|h|r'"), "Linen Cloth by link").toBe(13);
  expect(call(addon, "GetVendorPriceByItemID", "'TEST-ONLY Addon', 10941"), "no value: 0").toBe(0);
  expect(call(addon, "GetVendorPriceByItemID", "'TEST-ONLY Addon', 4242"), "an item the client hasn't loaded").toBe(null);
  addon.eval("__wfgWorld.items[10940].sellPrice = __wfgWorld.secret(4)");
  expect(call(addon, "GetVendorPriceByItemID", "'TEST-ONLY Addon', 10940"), "a hidden price").toBe(null);
});

it("disenchant prices by item ID and link, whether or not you know Enchanting", () => {
  const addon = withApi(`__wfgWorld.items[9101] = { name = "TEST-ONLY Gloves", classID = 4, quality = 2, level = 18 }
    __wfgWorld.items[9102] = { name = "TEST-ONLY Sword", classID = 2, quality = 2, level = 18 }`);
  expect(call(addon, "GetDisenchantPriceByItemID", "'TEST-ONLY Addon', 9101"), "no material priced yet").toBe(null);
  addon.eval("ns.AuctionPrices.Record(10940, 80, __now, 10, 100) ns.AuctionPrices.Record(10939, 1000, __now)");
  expect(call(addon, "GetDisenchantPriceByItemID", "'TEST-ONLY Addon', 9101"), "75 % of 2.5 dust at 1s, 20 % of 1.5 essence at 10s").toBe(487);
  expect(call(addon, "GetDisenchantPriceByItemLink", "'TEST-ONLY Addon', '|cff1eff00|Hitem:9102::::|h[TEST-ONLY Sword]|h|r'"), "a weapon by link: mostly essence").toBe(1175);
  expect(call(addon, "GetDisenchantPriceByItemID", "'TEST-ONLY Addon', 2589"), "cloth doesn't disenchant").toBe(null);
  addon.eval("ForeverUIDB = nil");
  expect(call(addon, "GetDisenchantPriceByItemID", "'TEST-ONLY Addon', 9101"), "before the saved variables load: none").toBe(null);
});

it("RegisterForDBUpdate: callbacks run once on the frame after a scan, and after a search records a price", () => {
  const addon = withApi(`__wfgWorld.ah.commodities[10940] = { { unitPrice = 100, quantity = 5 } }
    __wfgWorld.bags[0][1] = { itemID = 10940, count = 20 }`);
  addon.eval(`__heard = {} ForeverUI.API.v1.RegisterForDBUpdate("TEST-ONLY A", function(...) table.insert(__heard, "A" .. select("#", ...)) end)
    ForeverUI.API.v1.RegisterForDBUpdate("TEST-ONLY Broken", function() error("TEST-ONLY broken") end)
    ForeverUI.API.v1.RegisterForDBUpdate("TEST-ONLY B", function() table.insert(__heard, "B") end)`);
  // What the callbacks have heard, in order.
  const heard = () => { const h = addon.eval("return __heard"); return Array.isArray(h) ? h : []; };
  addon.eval("__wfgWorld.ah.replicate = { { itemID = 2589, count = 5, buyoutPrice = 500 }, { itemID = 10940, count = 1, buyoutPrice = 90 }, { itemID = 2592, count = 2, buyoutPrice = 60 } }");
  addon.click(`${HELPER}.scanCard.scan`);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  addon.update(0.01);
  expect(heard(), "the scan recorded 3 items: each callback once, with no arguments, the broken one between them reported").toEqual(["A0", "B"]);
  expect([chatHas(addon, /ForeverUI\.API\.v1 update for TEST-ONLY Broken: .*TEST-ONLY broken/), addon.eval("return #ns.errors")], "reported").toEqual([true, 1]);
  addon.advance(1);
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 0, bag = 0, slot = 1 }");
  addon.click(`${HELPER}.sellCard.slot`);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.update(0.01);
  expect([heard(), call(addon, "GetAuctionPriceByItemID", "'TEST-ONLY Addon', 10940")], "a sell search saw 100: told again, and the price is the new one").toEqual([["A0", "B", "A0", "B"], 100]);
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 95, totalQuantity = 3 } }");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.update(0.01);
  expect(heard().length, "a browse that saw a price too").toBe(6);
  addon.eval("__wfgWorld.ah.browse = {}");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.advance(1);
  expect(heard().length, "a search that saw nothing: not told").toBe(6);
});

it("MultiSearch searches each term through the shop's queue, only at the open auction house", () => {
  const closed = withApi("", { closed: true });
  expect([call(closed, "MultiSearch", "'TEST-ONLY Addon', { 'Strange Dust' }"), sent(closed), listOf(closed, "TEST-ONLY Addon search")], "closed: nothing").toEqual([false, [], null]);
  const addon = withApi();
  expect(call(addon, "MultiSearch", `'TEST-ONLY Addon', { 'Strange Dust', '"Soul Dust";0;0;0;0;0;0;0;0;0;0;', 2589, '   ', 'item:2592' }`), "queued").toBe(true);
  expect(listOf(addon, "TEST-ONLY Addon search"), "the terms as a list (Auctionator's fields and quotes off, a non-string and a blank left out)").toEqual(["Strange Dust", "Soul Dust", 2592]);
  expect([sent(addon), addon.eval(`return ${HELPER}.shopCard.progress:GetText()`), addon.eval(`return ${HELPER}.shopCard.lists.text:GetText()`)], "one search at a time, on the shop card, its list picked").toEqual([["SendBrowseQuery:Strange Dust"], "0 of 3", "TEST-ONLY Addon search"]);
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 240 } }");
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.advance(1);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.advance(1);
  expect(sent(addon), "a second apart; an ID by its item key").toEqual(["SendBrowseQuery:Strange Dust", "SendBrowseQuery:Soul Dust", "SearchForItemKeys:2592"]);
  expect(addon.eval(`local r = ${HELPER}.shopCard.rows[1] return { r.name:GetText(), r.price:GetText() }`), "the first row shows the result").toEqual(["Strange Dust", "12s 50c"]);
  expect(call(addon, "MultiSearch", "'TEST-ONLY Addon', { 'Vision Dust' }"), "again").toBe(true);
  expect([listOf(addon, "TEST-ONLY Addon search"), sent(addon).length], "the list is replaced, the searches waiting dropped; the new one waits for the search in flight").toEqual([["Vision Dust"], 3]);
  addon.advance(2);
  expect(sent(addon).at(-1), "then goes").toBe("SendBrowseQuery:Vision Dust");
  expect(call(addon, "MultiSearch", "'TEST-ONLY Addon', { '', 7 }"), "no usable term").toBe(false);
});

it("MultiSearchExact searches a name the client knows by its item ID", () => {
  const addon = withApi();
  expect(call(addon, "MultiSearchExact", "'TEST-ONLY Addon', { '\"Strange Dust\"', 'TEST-ONLY Unknown', '2589' }"), "queued").toBe(true);
  expect(listOf(addon, "TEST-ONLY Addon search"), "a known name by ID, an unknown one by name, an ID as it is").toEqual([10940, "TEST-ONLY Unknown", 2589]);
  expect(sent(addon), "only that item comes back").toEqual(["SearchForItemKeys:10940"]);
  const noPanel = withApi("", { savedVariables: "ForeverUIDB.profiles = { Default = { AuctionHelper = { panel = false } } }" });
  expect([call(noPanel, "MultiSearchExact", "'TEST-ONLY Addon', { 'Strange Dust' }"), sent(noPanel)], "without the panel the search still runs").toEqual([true, ["SearchForItemKeys:10940"]]);
  const off = withApi("", { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { AuctionHelper = false } } }" });
  expect([call(off, "MultiSearch", "'TEST-ONLY Addon', { 'Strange Dust' }"), sent(off)], "with the helper off, nothing").toEqual([false, []]);
});

it("CreateShoppingList makes or replaces a list; AlterShoppingListItems changes one that exists; the caps hold", () => {
  const addon = withApi("", { closed: true });
  expect(call(addon, "CreateShoppingList", "'TEST-ONLY Addon', '  TEST-ONLY Mats ', { 'Strange Dust', '\"Linen Cloth\";1;60', '' }"), "made, with the house closed").toBe(true);
  expect([listOf(addon, "TEST-ONLY Mats"), addon.eval("return ForeverUIDB.ah.list")], "named without the spaces; the list in use is left alone").toEqual([["Strange Dust", "Linen Cloth"], null]);
  expect(call(addon, "CreateShoppingList", "'TEST-ONLY Addon', 'TEST-ONLY Mats', { 'Soul Dust' }"), "made again").toBe(true);
  expect(listOf(addon, "TEST-ONLY Mats"), "replaced").toEqual(["Soul Dust"]);
  expect(call(addon, "AlterShoppingListItems", "'TEST-ONLY Addon', 'TEST-ONLY Mats', { 'Vision Dust', '2589', 2590 }"), "altered").toBe(true);
  expect(listOf(addon, "TEST-ONLY Mats"), "its entries replaced (a number left out: terms are strings)").toEqual(["Vision Dust", 2589]);
  expect([call(addon, "AlterShoppingListItems", "'TEST-ONLY Addon', 'TEST-ONLY None', { 'x' }"), listOf(addon, "TEST-ONLY None")], "no such list: nothing made").toEqual([false, null]);
  expect(call(addon, "CreateShoppingList", "'TEST-ONLY Addon', '   ', { 'x' }"), "no name").toBe(false);
  addon.eval("local t = {} for i = 1, 60 do t[i] = 'x' .. i end ForeverUI.API.v1.CreateShoppingList('TEST-ONLY Addon', 'TEST-ONLY Long', t)");
  expect(addon.eval("return #ForeverUIDB.ah.lists['TEST-ONLY Long']"), "at most 50 entries").toBe(50);
  addon.eval("for i = 3, 20 do ForeverUIDB.ah.lists['TEST-ONLY ' .. i] = {} end");
  expect([call(addon, "CreateShoppingList", "'TEST-ONLY Addon', 'TEST-ONLY 21st', {}"), call(addon, "CreateShoppingList", "'TEST-ONLY Addon', 'TEST-ONLY Mats', { 'Arcane Crystal' }")], "at 20 lists no new one; an existing one is still replaced").toEqual([false, true]);
});

it("a list the shop card shows is repainted when an addon changes it", () => {
  const addon = withApi();
  addon.eval(`${HELPER}.NewList("TEST-ONLY Mats") ${HELPER}.AddEntry("Strange Dust")`);
  call(addon, "AlterShoppingListItems", "'TEST-ONLY Addon', 'TEST-ONLY Mats', { 'Linen Cloth', 'Soul Dust' }");
  expect(addon.eval(`local rows = ${HELPER}.shopCard.rows return { rows[1].name:GetText(), rows[2].name:GetText(), rows[3]:IsShown() }`)).toEqual(["Linen Cloth", "Soul Dust", false]);
});
