// TEST-ONLY auction house set-up and readers shared by the auction test files (auction, auction-prices,
// auction-shop, auction-sell, auction-owned and auction-deals): each exported here is used by two or more.

import { loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock (a test moves __now), the tooltip data API the Tooltips module
// hooks, and a way to show an item's tooltip (the client's own price shown, so only the added
// lines are left), as [text, color] per line.
export const AH_ENV = `
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

export const HELPER = "ns.GetModule('AuctionHelper')";

export const SCAN_BUTTON = `${HELPER}.scanCard.scan`;

// A logged-in addon at the TEST-ONLY auction house (extra Lua runs before login).
export function atAuctionHouse(extra = "", opts) {
  const addon = loggedIn(AH_ENV + extra, opts);
  addon.world.openAuctionHouse();
  addon.update(0);
  return addon;
}

// The replicate list (a Lua list of rows), a click on Scan, the list arriving, and frames until the walk ends.
export function scan(addon, rows) {
  addon.eval(`__wfgWorld.ah.replicate = ${rows}`);
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  for (let i = 0; i < 10; i++) addon.update(0.01);
}

// Two listings of Linen Cloth (5 for 500, 1 for 90) and one of water with no buyout.
export const LINEN = "{ { itemID = 2589, count = 5, buyoutPrice = 500 }, { itemID = 2589, count = 1, buyoutPrice = 90 }, { itemID = 159, count = 1, buyoutPrice = 0, minBid = 5 } }";

// The scan card's "last scan" line.
export const lastLine = (addon) => addon.eval(`return ${HELPER}.scanCard.last:GetText()`);

// Picks a tab on the window: 1-3 the game's, 4 Shopping, 5 Selling.
export const pickTab = (addon, i) => addon.click(`AuctionHouseFrame.Tabs[${i}]`);

// TEST-ONLY dusts: Strange Dust (a commodity) and a pouch named like it.
export const DUSTS = `__wfgWorld.items[10940] = { name = "Strange Dust", icon = "TEST-ONLY-DUST", commodity = true }
  __wfgWorld.items[10941] = { name = "Strange Dust Pouch", icon = "TEST-ONLY-POUCH" }`;

// A shopping list `name` (made and picked) holding entries, given as a Lua list.
export const makeList = (addon, name, entries) => addon.eval(`local AH = ${HELPER} AH.NewList("${name}") for _, e in ipairs(${entries}) do AH.AddEntry(e) end`);

// The queries sent, as "fn:what" (a browse's search text, else the first item key's itemID).
export const sent = (addon) => addon.eval(`local out = {}
  for i, q in ipairs(__wfgWorld.ah.queries) do
    local a = q.args[1]
    out[i] = q.fn .. ":" .. tostring(type(a) == "table" and (a.searchString or a.itemID or (a[1] and a[1].itemID)) or "")
  end
  return out`);

// The shop dropdown's choices, by their text.
export const choices = (addon) => addon.eval(`local c = {} for i, x in ipairs(${HELPER}.shopCard.lists.choices()) do c[i] = x[2] end return c`);

// Opens the filter dialog of shop row i from its right-click menu.
export function openFilters(addon, i) {
  addon.click(`${HELPER}.shopCard.rows[${i}]`, "RightButton");
  addon.click("Vanguard_Menu.items[1]");
}

// The results view: shown, the item's name, the status line, and its rows shown as [price, quantity, time left, marked].
export const view = (addon) => addon.eval(`local f = ${HELPER}.shopCard.view local rows = {}
  for i, r in ipairs(f.rows) do if r:IsShown() then rows[i] = { r.cells.price:GetText(), r.cells.qty:GetText(), r.cells.time:GetText(), r.mark:IsShown() } end end
  return { f:IsShown(), f.name:GetText() or false, f.status:GetText() or false, rows }`);

// Eight TEST-ONLY dust listings (unit price, quantity, seconds left) and one with a hidden price.
export const DUST_LISTINGS = `__wfgWorld.ah.commodities[10940] = {
  { unitPrice = 1300, quantity = 200, timeLeftSeconds = 40000 }, { unitPrice = 1250, quantity = 20, timeLeftSeconds = 3000 },
  { unitPrice = 1399, quantity = 5, timeLeftSeconds = 100000 }, { unitPrice = __wfgWorld.secret(1), quantity = 1 },
  { unitPrice = 1450, quantity = 1, timeLeftSeconds = 7200 }, { unitPrice = 1500, quantity = 60 },
  { unitPrice = 1990, quantity = 12, timeLeftSeconds = 9000 }, { unitPrice = 2500, quantity = 3, timeLeftSeconds = 30 },
  { unitPrice = 1250, quantity = 7, timeLeftSeconds = 600 } }`;

// A list with Strange Dust searched (found up at 12s 50c).
export function dustFound(addon) {
  makeList(addon, "TEST-ONLY Mats", '{ "Strange Dust" }');
  addon.eval("__wfgWorld.ah.browse = { { itemKey = { itemID = 10940 }, minPrice = 1250, totalQuantity = 290 } }");
  addon.click(`${HELPER}.shopCard.search`);
  addon.fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED");
  addon.advance(1);
}

// TEST-ONLY bags: 20 Strange Dust (a commodity) in bag 0 slot 1, a blade (an item) in slot 2,
// and the game's names for the auction lengths.
export const BAGS = `${DUSTS}
  __wfgWorld.items[9999] = { name = "TEST-ONLY Blade", icon = "TEST-ONLY-BLADE", level = 25, suffix = 7 }
  __wfgWorld.bags[0][1] = { itemID = 10940, count = 20 }
  __wfgWorld.bags[0][2] = { itemID = 9999, count = 1 }
  AUCTION_DURATION_ONE, AUCTION_DURATION_TWO = "TEST-ONLY 12 Hours", "TEST-ONLY 24 Hours"`;

// Competing dust: 100 and 120 a unit, and your own at 95.
export const DUST_UP = `__wfgWorld.ah.commodities[10940] = { { unitPrice = 100, quantity = 5 }, { unitPrice = 120, quantity = 3 },
  { unitPrice = 95, quantity = 2, containsOwnerItem = true } }`;

export const CARD = `${HELPER}.sellCard`;

// Drops the item in bag 0 `slot` on the sell slot (picked up first), and answers its price check with `event`.
export function dropAndAnswer(addon, slot, event, payload) {
  addon.eval(`__wfgWorld.cursor = { type = "item", id = 0, bag = 0, slot = ${slot} }`);
  addon.click(`${CARD}.slot`);
  addon.fire(event, payload);
}

// The sell card's values (cheapest now, 7-day low, deposit, your price), its icon, and whether Post works.
export const card = (addon) => addon.eval(`local c = ${CARD} local v = {}
  for i, l in ipairs(c.lines) do v[i] = l.value:GetText() end
  return { v, c.icon:GetTexture() or false, c.post:IsEnabled() }`);

// The restricted calls so far, as [fn, clicked, args...] (an item location as "bag:slot").
export const restrictedLog = (addon) => list(addon.eval(`local out = {}
  for i, c in ipairs(__wfgWorld.ah.restricted) do
    local row = { c.fn, c.clicked }
    for j = 1, 5 do local a = c.args[j] row[#row + 1] = type(a) == "table" and (a.bagID .. ":" .. a.slotIndex) or (a == nil and "nil" or a) end
    out[i] = row
  end
  return out`));

// A Lua list as a JS array (an empty Lua table comes back as {}).
export const list = (v) => (Array.isArray(v) ? v : []);

// TEST-ONLY linen as a commodity: 20 in bag 0 slot 3, 20 in bag 1 slot 1 and 5 in bag 1 slot 2; someone asks 2s a unit.
export const LINEN_BAGS = `__wfgWorld.items[2589].commodity = true
  __wfgWorld.bags[0][3] = { itemID = 2589, count = 20 }
  __wfgWorld.bags[1][1] = { itemID = 2589, count = 20 }
  __wfgWorld.bags[1][2] = { itemID = 2589, count = 5 }
  __wfgWorld.ah.commodities[2589] = { { unitPrice = 200, quantity = 10 } }`;

// The tooltip's lines.
export const tipLines = (addon) => addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines) do out[i] = l.text end return out");
