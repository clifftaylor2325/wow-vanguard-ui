// auction-shop: the Shopping tab: list searches, shopping lists, filters, Recent, the view of an
// item's listings and its keys, at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";
import { AH_ENV, BAGS, DUSTS, DUST_LISTINGS, HELPER, atAuctionHouse, choices, dustFound, makeList, openFilters, restrictedLog, sent, view } from "./auction-env.mjs";

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
  expect(shopRow(addon, 1)[1], "seven entries fit the rows: the wheel has nothing to scroll").toBe("Linen Cloth");
  addon.wheel(`${HELPER}.shopCard.rows[1]`, -5);
  expect([shopRow(addon, 1)[1], shopRow(addon, 7)[1], shopRow(addon, 8)[0]], "every entry on its row, none past the last").toEqual(["Linen Cloth", "d", false]);
  addon.click(`${HELPER}.shopCard.rows[1]`, "RightButton");
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

it("a shop row opens every listing of its item in place of the rows; columns sort; Back returns", () => {
  const addon = atAuctionHouse(DUSTS + DUST_LISTINGS);
  dustFound(addon);
  addon.click(`${HELPER}.shopCard.rows[1]`);
  const q = addon.eval("local q = __wfgWorld.ah.queries[#__wfgWorld.ah.queries] return { q.fn, q.args[1].itemID, q.args[2][1].sortOrder, q.args[3] }");
  expect(q, "the item's own search, cheapest first, through the queue").toEqual(["SendSearchQuery", 10940, 0, false]);
  expect([view(addon).slice(0, 3), addon.eval(`return ${HELPER}.shopCard.body:IsShown()`)], "the view in place of the rows, searching").toEqual([[true, "Strange Dust", "searching..."], false]);
  addon.fire("COMMODITY_SEARCH_RESULTS_UPDATED", 10940);
  expect(view(addon), "cheapest first, the hidden price left out, eight rows").toEqual([true, "Strange Dust", "", [
    ["12s 50c", "7", "10 min", true], ["12s 50c", "20", "50 min", false], ["13s 0c", "200", "11 h", false],
    ["13s 99c", "5", "27 h", false], ["14s 50c", "1", "2 h", false], ["15s 0c", "60", "", false],
    ["19s 90c", "12", "2 h", false], ["25s 0c", "3", "1 min", false]]]);
  expect(addon.eval(`return ${HELPER}.pending == nil`), "its search is answered").toBe(true);
  addon.click(`${HELPER}.shopCard.view.heads[2]`);
  expect(view(addon)[3].map((r) => r[1]), "by quantity").toEqual(["1", "3", "5", "7", "12", "20", "60", "200"]);
  addon.click(`${HELPER}.shopCard.view.heads[2]`);
  expect([view(addon)[3].map((r) => r[1]), addon.eval(`return ${HELPER}.shopCard.view.arrow:GetRotation()`)], "again: most first, the arrow turned").toEqual([["200", "60", "20", "12", "7", "5", "3", "1"], 0]);
  addon.click(`${HELPER}.shopCard.view.heads[3]`);
  expect(view(addon)[3].map((r) => r[2]), "by time left (none first)").toEqual(["", "1 min", "10 min", "50 min", "2 h", "2 h", "11 h", "27 h"]);
  addon.wheel(`${HELPER}.shopCard.view.rows[1]`, -5);
  expect(view(addon)[3].map((r) => r[2]), "eight rows fit: the wheel has nothing to scroll").toEqual(["", "1 min", "10 min", "50 min", "2 h", "2 h", "11 h", "27 h"]);
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
    ["10s 0c", "Medium"], ["20s 0c", "TEST-ONLY Long"], ["30s 0c", "Very long"], ["40s 0c", "Short"], ["50s 0c", "Medium"], ["60s 0c", "TEST-ONLY Long"],
    ["70s 0c", "Very long"], ["80s 0c", "Short"]]);
  addon.wheel(`${HELPER}.shopCard.view`, -1);
  addon.advance(1);
  expect(sent(addon).slice(-1)[0], "the last row in view: the next page, through the queue").toBe("RequestMoreItemSearchResults:9999");
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
  expect([view(addon)[3].map((r) => r[0]), view(addon)[3].at(-1)], "Down stops on the last, which is marked; eight rows fit, nothing scrolls").toEqual([["12s 50c", "12s 50c", "13s 0c", "13s 99c", "14s 50c", "15s 0c", "19s 90c", "25s 0c"], ["25s 0c", "3", "1 min", true]]);
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
