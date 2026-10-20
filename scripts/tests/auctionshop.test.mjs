// auctionshop: the Auction helper (Modules/AuctionHelper.lua) and its price store
// (Modules/AuctionPrices.lua), at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn, px, setCombat } from "./helpers.mjs";
import { alphaOf, buttonOf, closeOf, escapes, insets, pressEscape, titleOf } from "./dialogs.mjs";

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
// The Shopping card's list (a table), and its results view.
const TABLE = `${HELPER}.shopCard.body.table`;
const VIEW = `${HELPER}.shopCard.view`;
// A logged-in addon at the TEST-ONLY auction house (extra Lua runs before login).
function atAuctionHouse(extra = "", opts) {
  const addon = loggedIn(AH_ENV + extra, opts);
  addon.world.openAuctionHouse();
  addon.update(0);
  return addon;
}
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
// List row i: [shown, name, price, how many up, icon].
const shopRow = (addon, i) => addon.eval(`local r = ${TABLE}.rows[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.cells.price:GetText() or false, r.cells.qty:GetText() or false, r.icon:GetTexture() or false }`);
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
  expect(shopRow(addon, 1), "the result named like the entry, not the cheaper pouch").toEqual([true, "Strange Dust", "12s 50c", "240", "TEST-ONLY-DUST"]);
  expect(shopRow(addon, 2).slice(0, 4), "nothing up").toEqual([true, "TEST-ONLY Nothing", "none up", ""]);
  expect(shopRow(addon, 3)[0], "no third entry").toBe(false);
  addon.advance(1);
  addon.click(`${TABLE}.rows[2]`);
  expect(sent(addon).length, "nothing found: nothing opens").toBe(2);
  addon.click(`${TABLE}.rows[1]`);
  expect(sent(addon).at(-1), "the item's listings are searched by the key its row found").toBe("SendSearchQuery:10940");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.click(`${VIEW}.back`);
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
  addon.wheel(`${TABLE}.rows[1]`, -1);
  expect(shopRow(addon, 1)[1], "seven entries fit the rows: the wheel has nothing to scroll").toBe("Linen Cloth");
  addon.wheel(`${TABLE}.rows[1]`, -5);
  expect([shopRow(addon, 1)[1], shopRow(addon, 7)[1], shopRow(addon, 8)[0]], "every entry on its row, none past the last").toEqual(["Linen Cloth", "d", false]);
  addon.click(`${TABLE}.rows[1]`, "RightButton");
  expect(addon.eval("local out = {} for i, b in ipairs(Vanguard_Menu.items) do if b:IsShown() then out[i] = b.text:GetText() end end return out"), "the row's menu").toEqual(["Filters...", "Remove"]);
  addon.click("Vanguard_Menu.items[2]");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats']"), "Remove took it off").toEqual([99999, "Soul Dust", "a", "b", "c", "d"]);
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
// The Lists pane's entries, by name.
const choices = (addon) => addon.eval(`local c = {} for i, e in ipairs(${HELPER}.PaneEntries()) do c[i] = e.name end return c`);
// The pane's action buttons that work now, by their text.
const actions = (addon) => addon.eval(`local out = {} for _, b in ipairs(${HELPER}.pane.actions) do if b:IsEnabled() then out[#out + 1] = b.text:GetText() end end return out`);
// Clicks the pane's action button named `text` (New, Rename, Copy, Delete or Clear, Import, Export).
function act(addon, text) {
  const i = addon.eval(`for i, b in ipairs(${HELPER}.pane.actions) do if b.text:GetText() == "${text}" then return i end end`);
  addon.click(`${HELPER}.pane.actions[${i}]`);
}
// Picks an entry in the pane by its key (a list's name, or AH.RECENT, AH.DEALS...), as a click on its row does.
const pick = (addon, key) => addon.eval(`${HELPER}.PickEntry(${key})`);
// The Shopping card's heading (the entry shown) and the list's status line.
const heading = (addon) => addon.eval(`return { ${HELPER}.shopCard.title:GetText(), ${TABLE}.status:GetText() }`);
it("shopping lists: the pane picks or makes one, + Add adds, and the caps hold", () => {
  const addon = atAuctionHouse();
  expect([choices(addon), actions(addon), heading(addon)], "no lists yet: make one or import (Deals and Upgrades are always there)").toEqual([["Deals", "Upgrades"], ["New", "Import"], ["Shopping", "No lists yet: New makes one, Import pastes one."]]);
  addon.click(`${HELPER}.shopCard.add`);
  addon.type("Vanguard_TextEdit", "Strange Dust");
  addon.click("Vanguard_TextDialog.primary");
  expect([addon.eval("return VanguardDB.ah.lists.Shopping"), addon.frame("Vanguard_TextDialog").visible], "+ Add with no list makes Shopping").toEqual([["Strange Dust"], false]);
  act(addon, "New");
  addon.type("Vanguard_TextEdit", "  TEST-ONLY B  ");
  addon.click("Vanguard_TextDialog.primary");
  expect([choices(addon), heading(addon), actions(addon)], "made and picked, empty").toEqual([["Shopping", "TEST-ONLY B", "Deals", "Upgrades"], ["TEST-ONLY B", "+ Add takes an item link, an item ID or a name."], ["New", "Rename", "Copy", "Delete", "Import", "Export"]]);
  // Pane row i: [name, count, marked as the one shown].
  const paneRow = (i) => addon.eval(`local r = ${HELPER}.pane.rows[${i}] return { r.name:GetText(), r.count:GetText(), r.rail:IsShown() }`);
  expect([paneRow(1), paneRow(2)], "each list with its count; the one shown marked").toEqual([["Shopping", "1", false], ["TEST-ONLY B", "", true]]);
  addon.click(`${HELPER}.pane.rows[1]`);
  expect([shopRow(addon, 1)[1], paneRow(1)[2], heading(addon)], "picked back by a click on its row").toEqual(["Strange Dust", true, ["Shopping", ""]]);
  addon.eval(`for i = 3, 21 do ${HELPER}.NewList("TEST-ONLY " .. i) end for i = 1, 51 do ${HELPER}.AddEntry("x" .. i, "Shopping") end`);
  expect(addon.eval("local n = 0 for _ in pairs(VanguardDB.ah.lists) do n = n + 1 end return { n, #VanguardDB.ah.lists.Shopping }"), "20 lists, 50 entries").toEqual([20, 50]);
  expect([paneRow(1)[0], paneRow(14)[0], addon.eval(`return ${HELPER}.pane.rows[15]`)], "fourteen entries fit the pane (the lists by name)").toEqual(["Shopping", "TEST-ONLY 4", null]);
  addon.wheel(`${HELPER}.pane.rows[1]`, -9);
  expect([paneRow(1)[0], paneRow(14)[0]], "the wheel scrolls the pane as far as its last entry (the 20 lists, Deals, Upgrades)").toEqual(["TEST-ONLY 17", "Upgrades"]);
  addon.wheel(`${HELPER}.pane.rows[1]`, 9);
  expect(paneRow(1)[0], "and back").toBe("Shopping");
  expect([chatHas(addon, /at most 20 shopping lists/), chatHas(addon, /holds at most 50 items/)], "says why").toEqual([true, true]);
  expect(addon.eval(`return ${HELPER}.NewList("   ")`), "no name, no list").toBe(false);
});
it("the list picked in the pane wears the one selected look (W.Row's accent rail over its raisedHover fill), with its name in the plain text colour", () => {
  const addon = atAuctionHouse();
  makeList(addon, "TEST-ONLY A", '{ "x" }');
  makeList(addon, "TEST-ONLY B", '{ "y" }');
  const [wash, rail] = addon.eval("return { 1, ns.Theme.ROW.height }");
  // Pane row i: [a list row, selected, rail shown, wash shown, name in the text colour].
  const look = (i) => {
    const row = `${HELPER}.pane.rows[${i}]`;
    const [row_, selected, railShown, washShown] = addon.eval(`local r = ${row} return { r.SetSelected ~= nil, r.selected, r.rail:IsShown(), r.wash:IsShown() }`);
    return [row_, selected, railShown, washShown, isTok(addon, addon.eval(`return ${row}.name.__textColor`), "text")];
  };
  expect([look(1), look(2)], "the list shown is selected; the other is a plain row").toEqual([[true, false, false, false, true], [true, true, true, true, true]]);
  const [railColor, washColor] = ["rail", "wash"].map((part) => addon.frame(`${HELPER}.pane.rows[2].${part}`).vertexColor);
  expect([isTok(addon, railColor, "accent"), isTok(addon, washColor, "raisedHover"), washColor[3]], "the rail in the accent, the fill in raisedHover, opaque").toEqual([true, true, wash]);
  expect(addon.eval(`return ${HELPER}.pane.rows[2]:GetHeight()`), "the rows keep the auction helper's height, not the options window's").toBe(addon.eval(`return ${HELPER}.ROW_H`));
  addon.click(`${HELPER}.pane.rows[1]`);
  expect([look(1).slice(1, 4), look(2).slice(1, 4)], "a click moves it").toEqual([[true, true, true], [false, false, false]]);
  expect(rail, "T.ROW.height is the options window's 28").toBe(28);
});
// A table's status line: [its text, its font size, as the colour token].
const statusOf = (addon, table) => {
  const s = addon.frame(`${table}.status`);
  return [s.text, s.font.size, ["text2", "muted"].find((k) => isTok(addon, s.textColor, k))];
};
it("a table's status line is small text2 while it reports (searching, none up), and label muted when it is an empty-state line", () => {
  const addon = atAuctionHouse(DUSTS + DUST_LISTINGS);
  addon.click("AuctionHouseFrame.Tabs[4]");
  const [label, small] = addon.eval("return { ns.Theme.RoleSize('label'), ns.Theme.RoleSize('small') }");
  expect(statusOf(addon, TABLE), "no lists: how to start, an empty-state line").toEqual(["No lists yet: New makes one, Import pastes one.", label, "muted"]);
  const edges = addon.eval(`local t = ${TABLE} return { t.status:GetLeft() - t:GetLeft(), t:GetRight() - t.status:GetRight() }`);
  expect(edges, "the line runs from the table's left to its right edge, T.SPACE.tight in, so a long one wraps").toEqual(Array(2).fill(addon.eval("return ns.Theme.SPACE.tight")));
  pick(addon, `${HELPER}.DEALS`);
  expect(statusOf(addon, TABLE), "the Deals entry's empty line is one too").toEqual(["None yet: a scan or a search finds them.", label, "muted"]);
  dustFound(addon);
  expect(statusOf(addon, TABLE)[0], "a list with a row: nothing to say").toBe("");
  addon.click(`${TABLE}.rows[1]`);
  expect(statusOf(addon, `${VIEW}.table`), "the view's search running: a status").toEqual(["searching...", small, "text2"]);
  addon.eval("__wfgWorld.ah.commodities[10940] = {}");
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect(statusOf(addon, `${VIEW}.table`), "and its answer: none up, a status").toEqual(["none up", small, "text2"]);
});
it("the house closing in a fight still clears the scan, the sell card and this visit's lists (state only, no protected work)", () => {
  const addon = atAuctionHouse("__wfgWorld.ah.replicate = { { itemID = 2589, count = 5, buyoutPrice = 500 } }");
  addon.eval(`${HELPER}.StartScan()`);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.eval(`${HELPER}.deals, ${HELPER}.view, ${HELPER}.upgrades, ${HELPER}.sell = { 1 }, {}, { 1 }, {}`);
  expect(addon.eval(`return { ${HELPER}.open, ${HELPER}.scan ~= nil, ${HELPER}.walker:IsShown() }`), "scanning, house open").toEqual([true, true, true]);
  setCombat(addon, true);
  addon.fire("AUCTION_HOUSE_CLOSED");
  expect(addon.eval(`return { ${HELPER}.open, ${HELPER}.scan == nil, ${HELPER}.walker:IsShown(), ${HELPER}.sell == nil, #${HELPER}.deals, ${HELPER}.view == nil, #${HELPER}.upgrades }`),
    "closed in combat: the state is gone, the walker stopped").toEqual([false, true, false, true, 0, true, 0]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("a row's right-click menu closes with the auction house (its dropdown is hidden, so the shop card is watched)", () => {
  const addon = atAuctionHouse();
  makeList(addon, "TEST-ONLY Mats", '{ "a", "b" }');
  addon.click(`${TABLE}.rows[1]`, "RightButton");
  expect(addon.eval("return Vanguard_Menu:IsShown()"), "the row's menu opens").toBe(true);
  addon.world.closeAuctionHouse();
  addon.update(0);
  expect(addon.eval("return { Vanguard_Menu:IsShown(), Vanguard_Menu.catcher:IsShown() }"), "leaving the house closes it and its catcher").toEqual([false, false]);
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
it("/vg ah add with only an item puts it on the list in use, not on a list named after the link", () => {
  const addon = loggedIn(AH_ENV);
  addon.slash("ah add |cff9d9d9d|Hitem:2589::::::::60:::::::|h[Linen Cloth]|h|r");
  addon.slash("ah list Herbs");
  addon.slash("ah add 2589");
  expect([addon.eval("local n = {} for k in pairs(VanguardDB.ah.lists) do n[#n + 1] = k end table.sort(n) return n"), addon.eval("return VanguardDB.ah.lists.Herbs")], "Shopping, then Herbs in use").toEqual([["Herbs", "Shopping"], [2589]]);
  expect([chatHas(addon, /Added to the shopping list Shopping\./), chatHas(addon, /Added to the shopping list Herbs\./)], "chat says which list").toEqual([true, true]);
  addon.eval("for i = 1, 50 do VanguardDB.ah.lists.Herbs[i] = i end");
  addon.clearChat();
  addon.slash("ah add item:2589");
  expect(chatHas(addon, /Added to/), "a full list adds nothing and says only that").toBe(false);
});
// The filter dialog's fields: shown, title, exact switch, level boxes, quality and max price.
const filterDialog = (addon) => addon.eval(`local d = Vanguard_AuctionFilters
  return { d:IsShown(), d.title:GetText(), d.draft.exact, d.minLevel:GetText(), d.maxLevel:GetText(), d.quality.dropdown.text:GetText(), d.price:GetText() }`);
// Opens the filter dialog of shop row i from its right-click menu.
function openFilters(addon, i) {
  addon.click(`${TABLE}.rows[${i}]`, "RightButton");
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
it("the filter dialog is a dialog: the window title and its X, Escape, the dialog alpha, rows on the dialog layout, Save the one accent button", () => {
  const addon = atAuctionHouse(DUSTS + " __wfgWorld.items[10941].name = 'TEST-ONLY Strange Dust Pouch of the Very Long Name Indeed'");
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "10941" }');
  openFilters(addon, 1);
  const D = "Vanguard_AuctionFilters";
  const T = addon.eval("local T = ns.Theme return { T.RoleSize('title'), T.SPACE.pad, T.SPACE.gap, T.CONTROL.inset, T.ALPHA.dialog, T.ROW.height, T.BUTTON_H, T.CONTROL_H, ns.DIALOG.head, ns.DIALOG.foot }");
  const [titleSize, pad, gap, inset, alpha, row, buttonH, controlH, head, foot] = T;
  expect(titleOf(addon, D), "the title role in the text colour, the pad in from the left, level with the X").toEqual({ size: titleSize, text: true, left: pad, mid: -inset });
  expect(closeOf(addon, D), "an X at the window's corner").toEqual([px(addon, inset), px(addon, inset), true]);
  expect([alphaOf(addon, D), escapes(addon, D)], "the dialog alpha; Escape closes it").toEqual([alpha, true]);
  addon.click(`${D}.chrome.close`);
  expect([addon.frame(D).visible, addon.eval("return VanguardDB.ah.lists['TEST-ONLY Mats'][1]")], "the X closes it and saves nothing").toEqual([false, "Strange Dust"]);
  openFilters(addon, 1);
  pressEscape(addon);
  expect(addon.frame(D).visible, "Escape closes it").toBe(false);
  // A widget's inset from the dialog's [left, top, right, bottom].
  const at = (name) => insets(addon, `${D}.${name}`, D);
  expect([at("exact").slice(0, 2), at("quality").slice(0, 2), at("alert").slice(0, 2)], "the switch, the choice and the alert row on the dialog's rows, the pad in").toEqual([[pad, head], [pad, head + 2 * row], [pad, head + 4 * row]]);
  expect([at("price")[2], at("maxLevel")[2], at("price")[1], at("minLevel")[1]], "the boxes end level with the rows' switch and menu, centred in their rows").toEqual([pad + gap, pad + gap, head + 3 * row + (row - controlH) / 2, head + row + (row - controlH) / 2]);
  expect([at("save").slice(2), at("cancel")[3], addon.eval(`return ${D}:GetHeight()`)], "Save the pad from the corner, Cancel level with it; the height is the head, five rows and the foot").toEqual([[pad, pad], pad, head + 5 * row + foot]);
  expect(addon.eval(`local d = ${D} return { d.save:GetHeight(), d.cancel:GetHeight(), d.price:GetHeight(), d.minLevel:GetHeight(), d.exact:GetHeight(), d.quality:GetHeight(), d.alert:GetHeight(), d.alert:GetWidth() == d.exact:GetWidth(), d.alert:GetBottom() > d.save:GetTop() }`),
    "buttons T.BUTTON_H, boxes T.CONTROL_H, rows T.ROW.height, the alert row as wide as the others, above the buttons").toEqual([buttonH, buttonH, controlH, controlH, row, row, row, true, true]);
  expect([buttonOf(addon, `${D}.save`).slice(0, 2), buttonOf(addon, `${D}.cancel`).slice(0, 2)], "Save is the one accent button").toEqual([[true, "Save"], [false, "Cancel"]]);
  openFilters(addon, 2);
  expect(addon.eval(`local d = ${D} return d.title:GetRight() < d.chrome.close:GetLeft()`), "a long item name stays short of the X").toBe(true);
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
    ["Strange Dust Pouch", "9s 0c", "3"], ["Vision Dust", "none up", ""], ["silk", "", ""], ["Linen Cloth", "none up", ""]]);
  expect(sent(addon)[3], "an ID entry with a max price still searches by its item key").toBe("SearchForItemKeys:2589");
  addon.eval("__wfgWorld.items[4306].pending = nil");
  addon.fire("ITEM_KEY_ITEM_INFO_RECEIVED", 4306);
  expect(shopRow(addon, 3).slice(1, 3), "its name came in and contains silk").toEqual(["TEST-ONLY Silk Bolt", "7s 0c"]);
  // An entry's best price among the silk bolt alone (false: no match).
  const best = (entry) => addon.eval(`local r = ${HELPER}.BestResult(${entry}, { { itemKey = { itemID = 4306 }, minPrice = 700, totalQuantity = 2 } }) return r and r.price or r`);
  expect([best('{ term = "Silk", quality = 3 }'), best('{ term = "Silk", quality = 1 }'), best('{ term = "Silk", exact = true }')], "another quality, or not the exact name, doesn't match").toEqual([false, 700, false]);
});
it("Save in the filter dialog changes the entry it opened on, even after a row above it was removed", () => {
  const addon = atAuctionHouse();
  makeList(addon, "TEST-ONLY Mats", '{ "Alpha", "Bravo", "Charlie" }');
  addon.eval(`local AH = ${HELPER} AH.EditFilters("TEST-ONLY Mats", 2) AH.RemoveEntry("TEST-ONLY Mats", 1)`);
  addon.eval(`${HELPER}.filterDialog.price:SetText("5s") ${HELPER}.SaveFilters()`);
  const list = addon.eval(`local out = {} for i, e in ipairs(VanguardDB.ah.lists['TEST-ONLY Mats']) do out[i] = type(e) == "table" and (e.term .. "@" .. tostring(e.maxPrice)) or e end return out`);
  expect(list, "Bravo takes the max price where it now sits; Charlie is untouched").toEqual(["Bravo@500", "Charlie"]);
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
  const bad = addon.eval(`local out = {} for i, t in ipairs({ "1e5", "0x10", "1e999", "inf", "nan", "1.2.3", "5e", "1_0", ${JSON.stringify("9".repeat(400))}, "1000000g", "999999g 99s 99c", "999999g 99s 100c", "999999g 99s 99c 1c" }) do out[i] = ${HELPER}.ParseMoney(t) or false end return out`);
  expect(bad, "exponent, hex, infinity and other number forms are not money; nothing above the game's highest price").toEqual([false, false, false, false, false, false, false, false, false, false, 9999999999, false, false]);
  expect(addon.eval(`return { ${HELPER}.ParseMoney(".5"), ${HELPER}.ParseMoney("3."), ${HELPER}.ParseMoney("1G") }`), "a bare .5 and 3. still read as gold").toEqual([5000, 30000, 10000]);
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
it("list management from the pane's buttons: rename, duplicate, export, and delete after asking", () => {
  const addon = atAuctionHouse(DUSTS);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "2589" }');
  act(addon, "Rename");
  expect(textDialog(addon).slice(0, 2), "asks for the new name").toEqual([true, "Rename TEST-ONLY Mats"]);
  answerText(addon, "  TEST-ONLY Herbs ");
  expect([choices(addon)[0], addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists['TEST-ONLY Mats'] == nil }"), textDialog(addon)[0]], "renamed, still in use, the box closed").toEqual(["TEST-ONLY Herbs", ["TEST-ONLY Herbs", true], false]);
  act(addon, "Copy");
  pick(addon, '"TEST-ONLY Herbs"');
  act(addon, "Copy");
  expect(choices(addon).slice(0, 3), "copies, each with a free name").toEqual(["TEST-ONLY Herbs", "TEST-ONLY Herbs copy", "TEST-ONLY Herbs copy 2"]);
  expect([addon.eval("return VanguardDB.ah.lists['TEST-ONLY Herbs copy 2']"), shopRow(addon, 1)[1], chatHas(addon, /Copied TEST-ONLY Herbs to TEST-ONLY Herbs copy 2\./)], "the same items, and the copy is in use").toEqual([["Strange Dust", 2589], "Strange Dust", true]);
  act(addon, "Rename");
  answerText(addon, "TEST-ONLY Herbs");
  expect([chatHas(addon, /already a shopping list named TEST-ONLY Herbs\./), addon.eval("return VanguardDB.ah.list")], "a name in use is refused").toEqual([true, "TEST-ONLY Herbs copy 2"]);
  addon.click("Vanguard_TextDialog.close");
  act(addon, "Export");
  expect(textDialog(addon), "one item per line, ready to copy").toEqual([true, "Shopping list TEST-ONLY Herbs copy 2 (Ctrl+C copies it)", "Strange Dust\n2589"]);
  act(addon, "Delete");
  expect(question(addon), "asks first").toEqual([true, "Delete the shopping list TEST-ONLY Herbs copy 2 (2 items)?"]);
  addon.click("Vanguard_Question.no");
  expect(addon.eval("return VanguardDB.ah.lists['TEST-ONLY Herbs copy 2'] ~= nil"), "No keeps it").toBe(true);
  act(addon, "Delete");
  addon.click("Vanguard_Question.confirm");
  expect([choices(addon).slice(0, 2), addon.eval("return VanguardDB.ah.list"), chatHas(addon, /Deleted the shopping list TEST-ONLY Herbs copy 2\./)], "gone; the first list left is in use").toEqual([["TEST-ONLY Herbs", "TEST-ONLY Herbs copy"], "TEST-ONLY Herbs", true]);
  addon.eval(`${HELPER}.DeleteList("TEST-ONLY Herbs copy") ${HELPER}.DeleteList("TEST-ONLY Nothing")`);
  expect(addon.eval("return VanguardDB.ah.list"), "deleting another list leaves the one in use").toBe("TEST-ONLY Herbs");
  addon.eval(`for i = 1, 19 do ${HELPER}.NewList("TEST-ONLY " .. i) end ${HELPER}.NewList("TEST-ONLY Herbs") ${HELPER}.DuplicateList()`);
  expect(addon.eval("return { VanguardDB.ah.lists['TEST-ONLY Herbs copy'] == nil, VanguardDB.ah.list }"), "no copy past 20 lists").toEqual([true, "TEST-ONLY Herbs"]);
  addon.eval(`${HELPER}.DeleteList("TEST-ONLY Herbs") for i = 1, 19 do ${HELPER}.DeleteList("TEST-ONLY " .. i) end`);
  expect([choices(addon), actions(addon), addon.eval("return VanguardDB.ah.list")], "the last one deleted: no list in use").toEqual([["Deals", "Upgrades"], ["New", "Import"], null]);
});
it("import: plain lines and Auctionator's strings, within the caps", () => {
  const addon = atAuctionHouse(DUSTS);
  act(addon, "Import");
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
  addon.click("Vanguard_Question.confirm");
  expect(addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists['TEST-ONLY Herbs copy'] == nil }"), "deleted after asking").toEqual(["TEST-ONLY Herbs", true]);
  addon.slash("ah");
  expect(chatHas(addon, /rename <name>, duplicate, delete, export, import, /), "the help names them").toBe(true);
});
it("Recent: the last 20 terms searched, newest first, kept for the account", () => {
  const addon = atAuctionHouse(DUSTS, { savedVariables: 'VanguardDB.ah = { recent = { "TEST-ONLY Old" } }' });
  expect([choices(addon), heading(addon)[0], actions(addon)], "kept from before: Recent in the pane; nothing shown yet").toEqual([["Recent", "Deals", "Upgrades"], "Shopping", ["New", "Import"]]);
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust", "Soul Dust", "2589" }');
  addon.click(`${HELPER}.shopCard.search`);
  expect(addon.eval("return VanguardDB.ah.recent"), "each term searched, the last first").toEqual([2589, "Soul Dust", "Strange Dust", "TEST-ONLY Old"]);
  pick(addon, `${HELPER}.RECENT`);
  expect([choices(addon), [1, 2, 3, 4].map((i) => shopRow(addon, i)[1]), actions(addon)], "Recent in use: its rows, and what can be done with it").toEqual([["TEST-ONLY Mats", "Recent", "Deals", "Upgrades"], ["Linen Cloth", "Soul Dust", "Strange Dust", "TEST-ONLY Old"], ["New", "Copy", "Clear", "Import", "Export"]]);
  addon.advance(5);
  addon.click(`${HELPER}.shopCard.search`);
  expect([addon.eval("return VanguardDB.ah.recent[1]"), progress(addon)], "searching Recent leaves its order").toEqual([2589, "0 of 4"]);
  addon.click(`${TABLE}.rows[4]`, "RightButton");
  addon.click("Vanguard_Menu.items[2]");
  expect(addon.eval("return #VanguardDB.ah.recent"), "Remove works on Recent").toBe(3);
  addon.eval(`${HELPER}.AddEntry("TEST-ONLY New")`);
  expect(addon.eval("return { VanguardDB.ah.list, VanguardDB.ah.lists.Shopping, VanguardDB.ah.lists['\\1recent'] == nil }"), "+ Add on Recent adds to Shopping").toEqual(["Shopping", ["TEST-ONLY New"], true]);
  addon.eval(`local AH = ${HELPER} AH.Remember("soul dust") AH.Remember({ term = "Soul Dust", exact = true }) for i = 1, 25 do AH.Remember("TEST-ONLY " .. i) end`);
  const recent = addon.eval("return VanguardDB.ah.recent");
  expect([recent.length, recent[0], recent[19]], "20 at most; the same term once, whatever its case").toEqual([20, "TEST-ONLY 25", "TEST-ONLY 6"]);
  pick(addon, `${HELPER}.RECENT`);
  act(addon, "Copy");
  expect(addon.eval("return { VanguardDB.ah.list, #VanguardDB.ah.lists['Recent copy'] }"), "copied into a list of its own").toEqual(["Recent copy", 20]);
  pick(addon, `${HELPER}.RECENT`);
  act(addon, "Clear");
  expect(question(addon), "clearing asks first").toEqual([true, "Clear the 20 recent searches?"]);
  addon.click("Vanguard_Question.confirm");
  expect([addon.eval("return #VanguardDB.ah.recent"), choices(addon).includes("Recent")], "cleared; still in use, so still listed").toEqual([0, true]);
  pick(addon, '"Shopping"');
  expect([choices(addon).includes("Recent"), heading(addon)[1]], "empty and not in use: not listed").toEqual([false, ""]);
  pick(addon, "nil");
  expect(heading(addon), "nothing picked while lists exist").toEqual(["Shopping", "Pick a list in the Lists pane."]);
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
const view = (addon) => addon.eval(`local f = ${VIEW} local rows = {}
  for i, r in ipairs(f.table.rows) do if r:IsShown() then rows[i] = { r.cells.price:GetText(), r.cells.qty:GetText(), r.cells.time:GetText(), r.rail:IsShown() } end end
  return { f:IsShown(), f.name:GetText() or false, f.table.status:GetText() or false, rows }`);
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
  addon.click(`${TABLE}.rows[1]`);
  const q = addon.eval("local q = __wfgWorld.ah.queries[#__wfgWorld.ah.queries] return { q.fn, q.args[1].itemID, q.args[2][1].sortOrder, q.args[3] }");
  expect(q, "the item's own search, cheapest first, through the queue").toEqual(["SendSearchQuery", 10940, 0, false]);
  expect([view(addon).slice(0, 3), addon.eval(`return ${HELPER}.shopCard.body:IsShown()`)], "the view in place of the rows, searching").toEqual([[true, "Strange Dust", "searching..."], false]);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect(view(addon), "cheapest first, the hidden price left out, eight rows").toEqual([true, "Strange Dust", "", [
    ["12s 50c", "7", "10 min", true], ["12s 50c", "20", "50 min", false], ["13s 0c", "200", "11 h", false],
    ["13s 99c", "5", "27 h", false], ["14s 50c", "1", "2 h", false], ["15s 0c", "60", "", false],
    ["19s 90c", "12", "2 h", false], ["25s 0c", "3", "1 min", false]]]);
  expect(addon.eval(`return ${HELPER}.pending == nil`), "its search is answered").toBe(true);
  addon.click(`${VIEW}.table.heads[2]`);
  expect(view(addon)[3].map((r) => r[1]), "by quantity").toEqual(["1", "3", "5", "7", "12", "20", "60", "200"]);
  addon.click(`${VIEW}.table.heads[2]`);
  expect([view(addon)[3].map((r) => r[1]), /Icons\\Down$/.test(addon.eval(`return ${VIEW}.table.arrow:GetTexture()`))], "again: most first, the arrow turned to Down").toEqual([["200", "60", "20", "12", "7", "5", "3", "1"], true]);
  addon.click(`${VIEW}.table.heads[3]`);
  expect(view(addon)[3].map((r) => r[2]), "by time left (none first)").toEqual(["", "1 min", "10 min", "50 min", "2 h", "2 h", "11 h", "27 h"]);
  addon.wheel(`${VIEW}.table.rows[1]`, -5);
  expect(view(addon)[3].map((r) => r[2]), "eight rows fit: the wheel has nothing to scroll").toEqual(["", "1 min", "10 min", "50 min", "2 h", "2 h", "11 h", "27 h"]);
  addon.advance(1);
  addon.click(`${VIEW}.table.rows[2]`);
  expect([sent(addon).at(-1), restrictedLog(addon)], "a listing opens its item in the game's own list; nothing is bought").toEqual(["SearchForItemKeys:10940", []]);
  addon.click(`${VIEW}.back`);
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
  addon.eval(`VanguardDB.ah.lists['TEST-ONLY Gear'][1] = { term = 9999, maxPrice = 50000 } ${HELPER}.PaintShop()`);
  addon.click(`${TABLE}.rows[1]`);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 9999 });
  expect(view(addon)[3].map((r) => [r[0], r[2]]), "an item's buyout, its band by the game's name or ours; bid only and over 5g left out").toEqual([
    ["10s 0c", "Medium"], ["20s 0c", "TEST-ONLY Long"], ["30s 0c", "Very long"], ["40s 0c", "Short"], ["50s 0c", "Medium"], ["60s 0c", "TEST-ONLY Long"],
    ["70s 0c", "Very long"], ["80s 0c", "Short"]]);
  addon.wheel(`${VIEW}.table`, -1);
  addon.advance(1);
  expect(sent(addon).slice(-1)[0], "the last row in view: the next page, through the queue").toBe("RequestMoreItemSearchResults:9999");
  addon.wheel(`${VIEW}.table`, 1);
  addon.advance(1);
  expect(sent(addon).filter((x) => x.startsWith("RequestMore")).length, "asked once until it comes").toBe(1);
  addon.eval("__wfgWorld.ah.items[9999][11] = { buyoutAmount = 500, quantity = 1, timeLeft = 3 } __wfgWorld.ah.searchFull = true");
  addon.fire("ITEM_SEARCH_RESULTS_ADDED", { itemID: 9999 });
  expect([view(addon)[3][0][0], addon.eval(`return ${HELPER}.pending == nil`)], "the new page sorted in; the request done").toEqual(["5s 0c", true]);
  addon.wheel(`${VIEW}.table`, -5);
  addon.advance(2);
  expect(sent(addon).filter((x) => x.startsWith("RequestMore")).length, "all in: no more asked").toBe(1);
  addon.click(`${VIEW}.back`);
  addon.eval(`VanguardDB.ah.lists['TEST-ONLY Gear'][2] = 'TEST-ONLY Unsearched' ${HELPER}.PaintShop()`);
  addon.click(`${TABLE}.rows[2]`);
  expect(view(addon)[0], "a name not searched yet opens nothing").toBe(false);
});
it("a commodity view asks for more with the commodity call; an empty answer says none up; closing drops it", () => {
  const addon = atAuctionHouse(DUSTS + DUST_LISTINGS + " __wfgWorld.ah.searchFull = false");
  dustFound(addon);
  addon.click(`${TABLE}.rows[1]`);
  addon.wheel(`${VIEW}.table`, -1);
  addon.advance(2);
  expect(sent(addon).some((x) => x.startsWith("RequestMore")), "nothing asked before the first answer").toBe(false);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 555);
  addon.wheel(`${VIEW}.table`, -2);
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
  addon.click(`${TABLE}.rows[1]`);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  addon.eval(`local f = ${VIEW}.table f.SetPropagateKeyboardInput = function(self, v) self.__passed = v end f.EnableKeyboard = function(self, on) self.__kb = on end`);
  // Whether the view has the keyboard, and whether its last key went on to the game.
  const kb = () => addon.eval(`local f = ${VIEW}.table return { f.__kb == true, f.__passed }`);
  // Presses a key on the view, as the client does while it has the keyboard.
  const press = (key) => addon.key(`${VIEW}.table`, key);
  addon.hover(`${VIEW}.table.rows[1]`);
  expect(kb()[0], "the mouse over a listing: the view takes the keys").toBe(true);
  press("DOWN");
  expect([view(addon)[3][1][3], kb()[1]], "Down marks the next; the key stops here").toEqual([true, false]);
  expect(addon.eval(`local t = ${VIEW}.table return { t.rows[1].selected, t.rows[2].selected, t.rows[2].wash:IsShown(), ${TABLE}.rows[1].selected }`), "the marked listing wears the selected look (its rail and wash); the list's rows, with no keyboard, never do").toEqual([false, true, true, false]);
  press("UP");
  press("UP");
  expect(view(addon)[3][0][3], "Up, not past the first").toBe(true);
  for (let i = 0; i < 7; i++) press("DOWN");
  expect([view(addon)[3].map((r) => r[0]), view(addon)[3].at(-1)], "Down stops on the last, which is marked; eight rows fit, nothing scrolls").toEqual([["12s 50c", "12s 50c", "13s 0c", "13s 99c", "14s 50c", "15s 0c", "19s 90c", "25s 0c"], ["25s 0c", "3", "1 min", true]]);
  addon.advance(1);
  press("ENTER");
  expect(sent(addon).at(-1), "Enter opens the marked one in the game's list").toBe("SearchForItemKeys:10940");
  press("W");
  expect(kb()[1], "a key the view doesn't use goes on to the game").toBe(true);
  addon.eval("GetCurrentKeyBoardFocus = function() return AuctionHouseFrame end");
  press("DOWN");
  expect([view(addon)[3].at(-1)[3], kb()[1]], "while a box has the typing, keys go on").toEqual([true, true]);
  addon.eval("GetCurrentKeyBoardFocus = function() return nil end");
  addon.hover(null);
  expect(kb()[0], "the mouse left: the keys are the game's").toBe(false);
  addon.hover(`${VIEW}.table`);
  addon.hover(`${VIEW}.table.rows[2]`);
  expect(kb()[0], "from the view onto a row: still the view's").toBe(true);
  setCombat(addon, true);
  addon.hover(`${VIEW}.table`);
  press("DOWN");
  expect([kb()[0], kb()[1]], "in combat: never takes the keys, never sets their passing").toEqual([false, true]);
  setCombat(addon, false);
  addon.eval(`${VIEW}.table:Hide()`);
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
