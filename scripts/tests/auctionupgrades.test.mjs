// auctionupgrades: the Auction helper's Upgrades list (Modules/AuctionUpgrades.lua): the armor and
// weapons a scan or an item search saw that beat what you wear, by Gear upgrades' weights
// (Modules/Upgrades.lua), at the TEST-ONLY auction house of the headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock, and gear for a warrior (strength weights: STR 1, STA 0.2, DPS 2.5):
// bracers 101 (STR 10, worn), 102 and 111 (STR 12), 103 (STR 5) and 108 (STR 20, but not usable);
// helms 104 (STA 5), 105, 109 and 110 (STA 10) for the empty head; a two-hander 107 (10 DPS) for
// the empty hands; a potion 106. __link(id) is an item's link as the client builds them.
const GEAR_ENV = `
  __now = 1790000000
  time = function() return __now end
  local items = __wfgWorld.items
  local function gear(id, name, loc, stats, class)
    items[id] = { name = "TEST-ONLY " .. name, icon = "TEST-ONLY-" .. id, classID = class or 4, equipLoc = loc, stats = stats }
  end
  gear(101, "Worn Bracers", "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 10 })
  gear(102, "Better Bracers", "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 12 })
  gear(103, "Worse Bracers", "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 5 })
  gear(104, "Plain Helm", "INVTYPE_HEAD", { ITEM_MOD_STAMINA_SHORT = 5 })
  gear(105, "Sturdy Helm", "INVTYPE_HEAD", { ITEM_MOD_STAMINA_SHORT = 10 })
  gear(107, "Greatsword", "INVTYPE_2HWEAPON", { ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 10 }, 2)
  gear(108, "Forbidden Bracers", "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 20 })
  gear(109, "Cheap Helm", "INVTYPE_HEAD", { ITEM_MOD_STAMINA_SHORT = 10 })
  gear(110, "Cheap Helm Too", "INVTYPE_HEAD", { ITEM_MOD_STAMINA_SHORT = 10 })
  gear(111, "Better Bracers Too", "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 12 })
  items[108].unusable = true
  items[106] = { name = "TEST-ONLY Potion", classID = 0, subClassID = 1 }
  function __link(id) return (select(2, C_Item.GetItemInfo(id))) end
  __wfgWorld.worn[9] = __link(101)
`;

const HELPER = "ns.GetModule('AuctionHelper')";
const SCAN_BUTTON = `${HELPER}.scanCard.scan`;
const TABLE = `${HELPER}.shopCard.body.table`;

// A warrior at the TEST-ONLY auction house, on the Lists tab with Upgrades picked.
function warrior(extra = "", opts) {
  const addon = loggedIn(GEAR_ENV + extra, opts);
  addon.world.setUnit("player", { class: "WARRIOR" });
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.click("AuctionHouseFrame.Tabs[4]");
  addon.eval(`${HELPER}.PickEntry(${HELPER}.UPGRADES)`);
  return addon;
}

// The replicate list (a Lua list of rows), a click on Scan, the list arriving, and frames until the walks end.
function scan(addon, rows) {
  addon.eval(`__wfgWorld.ah.replicate = ${rows}`);
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  for (let i = 0; i < 10; i++) addon.update(0.01);
}

// Upgrade row i: [shown, name, slot, gain, price].
const row = (addon, i) => addon.eval(`local r = ${TABLE}.rows[${i}]
  return { r:IsShown(), r.name:GetText() or false, r.cells.slot:GetText() or false, r.cells.gain:GetText() or false, r.cells.price:GetText() or false }`);

// The Upgrades entry: [in the pane, its count there, the card's heading and count, the status line].
const card = (addon) => addon.eval(`local AH, e = ${HELPER}, nil
  for _, x in ipairs(AH.PaneEntries()) do if x.key == AH.UPGRADES then e = x end end
  return { e ~= nil, e and e.count or false, AH.shopCard.title:GetText(), AH.shopCard.progress:GetText(), ${TABLE}.status:GetText() }`);

// The queries sent, as "fn:what".
const sent = (addon) => addon.eval(`local out = {}
  for i, q in ipairs(__wfgWorld.ah.queries) do local a = q.args[1] or {} out[i] = q.fn .. ":" .. tostring(a.itemID or (a[1] and a[1].itemID) or a.searchString) end
  return out`);

// A scan with the gear and the potion up: the bracers (the better one twice), the helms, the
// sword, the forbidden bracers.
const SCAN = `{ { itemID = 102, count = 1, buyoutPrice = 500 }, { itemID = 103, count = 1, buyoutPrice = 100 },
  { itemID = 104, count = 1, buyoutPrice = 50 }, { itemID = 105, count = 1, buyoutPrice = 80 }, { itemID = 106, count = 5, buyoutPrice = 500 },
  { itemID = 102, count = 1, buyoutPrice = 400 }, { itemID = 107, count = 1, buyoutPrice = 2000 }, { itemID = 108, count = 1, buyoutPrice = 10 },
  { itemID = 109, count = 1, buyoutPrice = 70 }, { itemID = 110, count = 1, buyoutPrice = 70 }, { itemID = 111, count = 1, buyoutPrice = 400 } }`;

it("upgrades: a scan lists the gear that beats what you wear, the biggest gain first, one listing for an empty slot", () => {
  const addon = warrior();
  expect([card(addon), row(addon, 1)[0]], "the entry, none yet").toEqual([[true, 0, "Upgrades", "", "None yet: a scan or an item search finds armor and weapons that beat what you wear."], false]);
  scan(addon, SCAN);
  expect([1, 2, 3, 4, 5].map((i) => row(addon, i)), "the better bracers (+20 %, at the cheaper of their two listings; equals by link), then one listing per empty slot (the best helm, the cheapest of them, the first by link) and the sword; the worse, the forbidden and the potion are no upgrade").toEqual([
    [true, "TEST-ONLY Better Bracers", "Wrist", "+20 %", "4s 0c"], [true, "TEST-ONLY Better Bracers Too", "Wrist", "+20 %", "4s 0c"],
    [true, "TEST-ONLY Cheap Helm", "Head", "empty slot", "70c"], [true, "TEST-ONLY Greatsword", "Two-Hand", "empty slot", "20s 0c"], [false, false, false, false, false]]);
  expect([card(addon), addon.eval("return __wfgWorld.ah.linkReads"), isTok(addon, addon.eval(`return ${TABLE}.rows[1].cells.gain.__textColor`), "good")], "the count; a link read for each gear listing, none for the potion; the gain in good").toEqual([[true, 4, "Upgrades", "4 found", ""], 10, true]);
  addon.hover(`${TABLE}.rows[1]`);
  expect(addon.eval("local t = GameTooltip return { t.__link, t.__lines[1].text, t:IsShown() }"), "the item's own tooltip, and what a click does").toEqual([addon.eval("return __link(102)"), "Click to show it in the auction house's list.", true]);
  addon.hover(null);
  addon.click(`${TABLE}.rows[1]`);
  expect([sent(addon).at(-1), addon.eval("return #__wfgWorld.ah.restricted"), addon.eval("return AuctionHouseFrame.selectedTab")], "a click shows it in the game's own list, on its Buy tab; nothing is bought").toEqual(["SearchForItemKeys:102", 0, 1]);
});

it("upgrades: an item search's results are judged too, bids only skipped, a listing seen again at its new price", () => {
  const addon = warrior();
  addon.eval(`__wfgWorld.ah.items[102] = { { buyoutAmount = 300, quantity = 1, itemLink = __link(102) }, { minBid = 5, quantity = 1, itemLink = __link(102) },
    { buyoutAmount = 1000, quantity = 1, itemLink = __link(102) } }`);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 102 });
  addon.update(0.01);
  expect(row(addon, 1), "the cheapest listing with a buyout").toEqual([true, "TEST-ONLY Better Bracers", "Wrist", "+20 %", "3s 0c"]);
  addon.eval("__wfgWorld.ah.items[102] = { { buyoutAmount = 1000, quantity = 2, itemLink = __link(102) } }");
  addon.fire("ITEM_SEARCH_RESULTS_ADDED", { itemID: 102 });
  addon.update(0.01);
  expect([row(addon, 1)[4], card(addon)[1]], "seen again dearer, per unit").toEqual(["5s 0c", 1]);
  addon.eval("__wfgWorld.ah.items[106] = { { buyoutAmount = 100, quantity = 1, itemLink = __link(106) } }");
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 106 });
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", 106);
  addon.update(0.01);
  expect([card(addon)[1], addon.eval("return #ns.errors")], "a potion's results, and a key the client hides, are left alone").toEqual([1, 0]);
});

it("upgrades: the same item and suffix at another unique ID is one row at the cheapest price; another suffix stays its own", () => {
  const addon = warrior();
  addon.eval(`function __variant(unique, suffix) return "|cffffffff|Hitem:102:0:0:0:0:0:" .. suffix .. ":" .. unique .. ":60|h[TEST-ONLY Better Bracers]|h|r" end
    __wfgWorld.ah.items[102] = { { buyoutAmount = 900, quantity = 1, itemLink = __variant(111, 5) }, { buyoutAmount = 700, quantity = 1, itemLink = __variant(222, 5) },
      { buyoutAmount = 800, quantity = 1, itemLink = __variant(333, 5) }, { buyoutAmount = 950, quantity = 1, itemLink = __variant(444, 6) } }`);
  addon.fire("ITEM_SEARCH_RESULTS_UPDATED", { itemID: 102 });
  addon.update(0.01);
  expect([card(addon)[1], row(addon, 1)[4], row(addon, 2)[4], row(addon, 3)[0]], "two suffixes, not four listings: the first at its cheapest, the second alone").toEqual([2, "7s 0c", "9s 50c", false]);
  expect(addon.eval(`return ${HELPER}.GearKey("not a link")`), "text that is no item link is its own key").toBe("not a link");
});

it("upgrades: what you wear and the weights change the judgement; closing the house forgets the listings", () => {
  const addon = warrior();
  scan(addon, SCAN);
  addon.eval("__wfgWorld.worn[9] = __link(102)");
  addon.fire("PLAYER_EQUIPMENT_CHANGED", 9);
  expect([card(addon)[1], row(addon, 1)[1]], "the better bracers worn now: no longer an upgrade, the rest judged again").toEqual([2, "TEST-ONLY Cheap Helm"]);
  addon.eval("__wfgWorld.worn[9] = __link(103)");
  addon.fire("PLAYER_EQUIPMENT_CHANGED", 9);
  expect([card(addon)[1], row(addon, 1).slice(1, 4)], "the worse bracers worn: the better ones gain 140 %").toEqual([4, ["TEST-ONLY Better Bracers", "Wrist", "+140 %"]]);
  addon.slash("weights set STR 0");
  addon.eval(`${HELPER}.PaintUpgrades()`);
  expect([card(addon)[1], row(addon, 1)[1]], "strength worth nothing: the bracers are no gain; the helm and the sword still fill their slots").toEqual([2, "TEST-ONLY Cheap Helm"]);
  addon.world.closeAuctionHouse();
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.click("AuctionHouseFrame.Tabs[4]");
  expect(card(addon), "a new visit starts with none").toEqual([true, 0, "Upgrades", "", "None yet: a scan or an item search finds armor and weapons that beat what you wear."]);
  addon.fire("PLAYER_EQUIPMENT_CHANGED", 9);
  expect(addon.eval("return #ns.errors"), "gear changing with nothing seen: no error").toBe(0);
});

it("upgrades: a big scan is judged a hundred listings a frame, and closing the house stops it", () => {
  const addon = warrior(`__rows = {}
    for i = 1, 150 do
      __wfgWorld.items[1000 + i] = { name = "TEST-ONLY Bracers " .. i, classID = 4, equipLoc = "INVTYPE_WRIST", stats = { ITEM_MOD_STRENGTH_SHORT = 11 } }
      __rows[i] = { itemID = 1000 + i, count = 1, buyoutPrice = 100 + i }
    end
    __wfgWorld.ah.replicate = __rows`);
  addon.click(SCAN_BUTTON);
  addon.fire("REPLICATE_ITEM_LIST_UPDATE");
  addon.update(0.01);
  expect([addon.eval(`return ${HELPER}.scan == nil`), addon.eval(`return ${HELPER}.judging.next`), card(addon)[1]], "the scan read in one frame, and a hundred of its listings judged in the same").toEqual([true, 101, 100]);
  addon.world.closeAuctionHouse();
  addon.update(0.01);
  expect([addon.eval(`return ${HELPER}.judging == nil`), addon.eval(`return next(${HELPER}.upgrades) == nil`), addon.eval(`return ${HELPER}.judge:IsShown()`)], "closed: judging stops, the listings go").toEqual([true, true, false]);
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.eval("__now = __now + 1000");
  scan(addon, "__rows");
  expect([card(addon)[1], row(addon, 1).slice(1, 5), row(addon, 20)[1]], "all 150 in, the cheapest first among equal gains, on the rows there are").toEqual([150, ["TEST-ONLY Bracers 1", "Wrist", "+10 %", "1s 1c"], "TEST-ONLY Bracers 20"]);
});

it("upgrades: the switch under Auction house, the Gear upgrades module off, and a client without listing links", () => {
  const addon = warrior(CLICK_LUA);
  addon.eval('ns.Options.Show("town") __click("Upgrades list")');
  scan(addon, SCAN);
  expect([addon.eval("return ns.Settings('AuctionHelper').upgrades"), card(addon).slice(0, 3), addon.eval("return __wfgWorld.ah.linkReads")], "switched off: the entry goes and gives way to no list, no link is read").toEqual([false, [false, false, "Shopping"], 0]);
  const off = warrior("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { Upgrades = false } } }" });
  scan(off, SCAN);
  expect(card(off), "Gear upgrades off: nothing judged, and the line says what to turn on").toEqual([true, 0, "Upgrades", "", "Turn on Gear upgrades (Town and gear) to judge gear."]);
  const bare = warrior("C_AuctionHouse.GetReplicateItemLink = nil");
  scan(bare, SCAN);
  expect([card(bare)[1], addon.eval("return #ns.errors"), chatHas(bare, /Auction house scanned: 11 listings/)], "no links to judge by: the scan still records prices").toEqual([0, 0, true]);
});
