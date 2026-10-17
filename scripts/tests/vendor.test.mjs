// vendor: Vendor memory (Modules/VendorMemory.lua), merchants' wares remembered account-wide, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock, the tooltip data API the Tooltips module hooks, and a way to show an
// item's tooltip (the client's own price shown, so only the added lines are left).
const VENDOR_ENV = `
  __now = 1000
  time = function() return __now end
  __post = {}
  TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) __post[kind] = fn end }
  GameTooltip.GetItem = function(self) return "TEST-ONLY Item", self.__link end
  __wfgWorld.items[4540] = { name = "TEST-ONLY Bread" }
  function __showItem(link)
    local tt = GameTooltip
    tt.__link, tt.__lines, tt.shownMoneyFrames = link, {}, 1
    __post[Enum.TooltipDataType.Item](tt)
    local out = {}
    for i, l in ipairs(tt.__lines) do out[i] = { l.text, { l.r, l.g, l.b } } end
    return out
  end
`;

// TEST-ONLY wares: bread in limited stock (3 left), and water without a limit.
const WARES = '{ { itemID = 4540, name = "TEST-ONLY Bread", left = 3 }, { itemID = 159, name = "TEST-ONLY Water" } }';

// Talks to a TEST-ONLY merchant (`npc` is a Lua expression for the name) selling `items` (a Lua list).
function visit(addon, npc, items = WARES, event = "MERCHANT_SHOW") {
  addon.eval(`__wfgWorld.units.npc = { name = ${npc} } __wfgWorld.merchant = { items = ${items} }`);
  addon.fire(event);
  addon.advance(0.25);
}

// The merchants remembered for an item, as [name, zone, subzone, limited] (false for none).
const sellers = (addon, id) => addon.eval(`local out = {}
  for i, e in ipairs((VanguardDB.vendors.items or {})[${id}] or {}) do out[i] = { e.n, e.z or false, e.s or false, e.l or false } end
  return out`);

it("a merchant is remembered with its name, zone and subzone; limited stock is flagged", () => {
  const addon = loggedIn(VENDOR_ENV);
  visit(addon, '"Thomas Miller"');
  expect([sellers(addon, 4540), sellers(addon, 159)], "bread is limited, water is not").toEqual([[["Thomas Miller", "Elwynn Forest", "Goldshire", true]], [["Thomas Miller", "Elwynn Forest", "Goldshire", false]]]);
  expect(addon.eval("return { VanguardDB.vendors.count, VanguardDB.vendors.items[4540][1].t }"), "two items, seen at the wall clock's time").toEqual([2, 1000]);
  addon.eval('__wfgWorld.zone.sub = "Elwynn Forest"');
  visit(addon, '"Thomas Miller"');
  expect(sellers(addon, 4540), "a subzone named like its zone is left out, and the merchant isn't listed twice").toEqual([["Thomas Miller", "Elwynn Forest", false, true]]);
});

it("item tooltips say who sells the item and where", () => {
  const addon = loggedIn(VENDOR_ENV);
  visit(addon, '"Thomas Miller"');
  const [bread] = addon.eval('return __showItem("item:4540")');
  const warn = addon.eval('return ns.Theme.Hex("warn")');
  expect(bread[0], "the merchant, then the zone and subzone").toMatch(/^Sold by Thomas Miller \(Elwynn Forest, Goldshire\)/);
  expect([bread[0].endsWith(`|c${warn} · limited stock|r`), isTok(addon, bread[1], "text2")], "limited stock in the warning colour, the line in text2").toEqual([true, true]);
  expect(addon.eval('return __showItem("item:159")[1][1]'), "unlimited water: no suffix").toBe("Sold by Thomas Miller (Elwynn Forest, Goldshire)");
  expect(addon.eval('return { #__showItem("item:2589"), #__showItem("TEST-ONLY no item") }'), "an item no merchant was seen selling, and a link without an item: no line").toEqual([0, 0]);
  addon.eval("ns.GetModule('VendorMemory').settings.tooltip = false");
  expect(addon.eval('return #__showItem("item:4540")'), "the switch turns the line off").toBe(0);
});

it("three merchants per item, the one seen last first", () => {
  const addon = loggedIn(VENDOR_ENV);
  // Visits a merchant in another zone, later.
  const elsewhere = (name, zone, t) => { addon.eval(`__now = ${t} __wfgWorld.zone.name, __wfgWorld.zone.sub = "${zone}", ""`); visit(addon, `"${name}"`); };
  visit(addon, '"Thomas Miller"');
  elsewhere("Innkeeper Heather", "Westfall", 2000);
  elsewhere("Innkeeper Farley", "Elwynn Forest", 3000);
  expect(sellers(addon, 159).map((s) => s[0]), "newest first").toEqual(["Innkeeper Farley", "Innkeeper Heather", "Thomas Miller"]);
  elsewhere("Innkeeper Allison", "Stormwind City", 4000);
  expect(sellers(addon, 159).map((s) => s[0]), "a fourth replaces the oldest").toEqual(["Innkeeper Allison", "Innkeeper Farley", "Innkeeper Heather"]);
  expect(addon.eval('return __showItem("item:159")[3][1]'), "no subzone: just the zone").toBe("Sold by Innkeeper Heather (Westfall)");
  elsewhere("Innkeeper Heather", "Westfall", 5000);
  expect(sellers(addon, 159).map((s) => s[0]), "seeing one again moves it first, once").toEqual(["Innkeeper Heather", "Innkeeper Allison", "Innkeeper Farley"]);
});

it("past the item cap, the items seen longest ago are forgotten", () => {
  const addon = loggedIn(VENDOR_ENV);
  addon.eval("ns.GetModule('VendorMemory').MAX_ITEMS = 10");
  const ten = Array.from({ length: 10 }, (_, i) => `{ itemID = ${90100 + i}, name = "TEST-ONLY ${i}" }`).join(", ");
  visit(addon, '"Thomas Miller"', `{ ${ten} }`);
  addon.eval("__now = 2000 VanguardDB.vendors.items[90100][1].t = 1500");
  visit(addon, '"Thomas Miller"', '{ { itemID = 90200, name = "TEST-ONLY New" } }');
  const kept = addon.eval("local n, has = 0, VanguardDB.vendors.items for _ in pairs(has) do n = n + 1 end return { n, VanguardDB.vendors.count, has[90200] ~= nil, has[90100] ~= nil }");
  expect(kept, "pruned to 9 of 10, keeping the newest two").toEqual([9, 9, true, true]);
});

it("a hidden name or zone, combat and the remember switch", () => {
  const addon = loggedIn(VENDOR_ENV);
  visit(addon, "__wfgWorld.secret(1)");
  expect([addon.eval("return next(VanguardDB.vendors.items)"), addon.eval("return #ns.errors")], "a hidden name: nothing remembered, no error").toEqual([null, 0]);
  addon.eval("GetZoneText = function() return __wfgWorld.secret(1) end");
  visit(addon, '"Thomas Miller"');
  expect([sellers(addon, 159), addon.eval('return __showItem("item:159")[1][1]')], "a hidden zone: the subzone alone").toEqual([[["Thomas Miller", false, "Goldshire", false]], "Sold by Thomas Miller (Goldshire)"]);
  addon.eval('__wfgWorld.zone.sub = "" VanguardDB.vendors = nil');
  visit(addon, '"Thomas Miller"');
  expect(addon.eval('return __showItem("item:159")[1][1]'), "nowhere known: just the name").toBe("Sold by Thomas Miller");
  addon.eval("VanguardDB.vendors = nil __wfgStub.inCombat = true");
  visit(addon, '"Thomas Miller"');
  addon.eval("__wfgStub.inCombat = false ns.GetModule('VendorMemory').settings.remember = false");
  visit(addon, '"Thomas Miller"');
  expect(addon.eval("return VanguardDB.vendors and next(VanguardDB.vendors.items)"), "in combat, and with remembering off: nothing").toBe(null);
});

it("older clients: the item ID from the link, limited stock from the old call, and the list changing", () => {
  const addon = loggedIn(VENDOR_ENV + "GetMerchantItemID = nil C_MerchantFrame = nil");
  visit(addon, '"Thomas Miller"', '{ { link = "|Hitem:4540::|h[TEST-ONLY Bread]|h", name = "TEST-ONLY Bread", left = 3 }, { name = "TEST-ONLY No link", link = { __secret = true } } }', "MERCHANT_UPDATE");
  expect([sellers(addon, 4540), addon.eval("return VanguardDB.vendors.count")], "read from the link, limited from GetMerchantItemInfo; a hidden link is skipped").toEqual([[["Thomas Miller", "Elwynn Forest", "Goldshire", true]], 1]);
});

it("/vg stock says where to buy, /vg vendors counts and clear forgets", () => {
  const addon = loggedIn(VENDOR_ENV);
  visit(addon, '"Thomas Miller"');
  addon.slash("stock 4540 20");
  addon.slash("stock 2589 5");
  addon.slash("stock");
  expect(chatHas(addon, /Keep 20 × TEST-ONLY Bread — sold by Thomas Miller \(Elwynn Forest, Goldshire\)$/), "where to buy").toBe(true);
  expect(chatHas(addon, /Keep 5 × Linen Cloth$/), "nothing for an item no merchant was seen selling").toBe(true);
  addon.slash("vendors");
  expect(chatHas(addon, /1 merchant\(s\) remembered, selling 2 item\(s\)\./), "one merchant, two items").toBe(true);
  addon.slash("vendors clear");
  addon.slash("vendors");
  expect([chatHas(addon, /Forgot every merchant\./), chatHas(addon, /0 merchant\(s\) remembered, selling 0 item\(s\)\./)], "cleared").toEqual([true, true]);
  const off = loggedIn(VENDOR_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { VendorMemory = false }, Errands = { stockList = { [4540] = 20 } } } } VanguardDB.vendors = { items = { [4540] = { { n = 'Thomas Miller' } } }, count = 1 }" });
  off.slash("stock");
  expect(chatHas(off, /Keep 20 × TEST-ONLY Bread$/), "switched off, the stock list doesn't say").toBe(true);
});

// TEST-ONLY the game's font objects for its HUD text (GameFontStyles.xml), as font strings the stub can read back.
const HUD_FONTS_ENV = `
  local holder = CreateFrame("Frame")
  for _, name in ipairs({ "ErrorFont", "ZoneTextFont", "SubZoneTextFont", "PVPInfoTextFont" }) do
    _G[name] = holder:CreateFontString() _G[name]:SetFont("TEST-ONLY-FRIZQT", 10, "THICK")
  end
`;

// Each HUD font object's path is the bold theme font, its size, and its shadow offset.
const hudFonts = (addon) => addon.eval(`local out = {}
  for _, name in ipairs({ "ErrorFont", "ZoneTextFont", "SubZoneTextFont", "PVPInfoTextFont" }) do
    local path, size = _G[name]:GetFont() out[#out + 1] = { path == ns.Theme.Font(true), size, _G[name].__shadowOffset }
  end return out`);

it("the error line and the zone text in the theme font, kept after a Text size change", () => {
  const addon = loggedIn(HUD_FONTS_ENV);
  expect(hudFonts(addon), "the theme font at the game's sizes, with the theme's shadow").toEqual([[true, 16, [1, -1]], [true, 32, [1, -1]], [true, 26, [1, -1]], [true, 22, [1, -1]]]);
  addon.eval("ns.Theme.Settings().textScale = 1.5 ns.Theme.Refresh()");
  expect(hudFonts(addon).map((f) => f[1]), "re-applied at the new Text size").toEqual([24, 48, 39, 33]);
  const off = loggedIn(HUD_FONTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Merchant = false } } }" });
  expect(off.eval("return { ErrorFont:GetFont() }"), "with the module off they are the game's").toEqual(["TEST-ONLY-FRIZQT", 10, "THICK"]);
  const some = loggedIn('ZoneTextFont = CreateFrame("Frame"):CreateFontString()');
  expect([some.eval("return select(2, ZoneTextFont:GetFont())"), some.eval("return #ns.errors")], "a client with only some of them gets those, and loads cleanly").toEqual([32, 0]);
});

// TEST-ONLY the scrolling combat text's font object (GameFontStyles.xml), as a font string the stub can read back,
// and the engine's floating damage font path.
const COMBAT_TEXT_ENV = 'CombatTextFont = CreateFrame("Frame"):CreateFontString() CombatTextFont:SetFont("TEST-ONLY-FRIZQT", 64, "") DAMAGE_TEXT_FONT = "TEST-ONLY-DAMAGE"';
// The combat text font object's path (true when the theme's bold face) and size.
const combatFont = (addon) => addon.eval("local path, size = CombatTextFont:GetFont() return { path == ns.Theme.Font(true), size }");

it("the scrolling combat text and the floating damage numbers in the theme font, while the module is on", () => {
  const addon = loggedIn(COMBAT_TEXT_ENV);
  expect(addon.eval("return DAMAGE_TEXT_FONT == ns.Theme.Font(true)"), "the engine's damage font path is the theme's bold face, set at Vanguard's own load").toBe(true);
  expect(combatFont(addon), "the combat text's part of the game isn't loaded yet: its font object is the game's").toEqual([false, 64]);
  addon.fire("ADDON_LOADED", "Blizzard_TEST-ONLY-Other");
  expect(combatFont(addon)[0], "another part loading changes nothing").toBe(false);
  addon.fire("ADDON_LOADED", "Blizzard_CombatText");
  expect(combatFont(addon), "the part loaded: the theme's bold face at the largest HUD text size").toEqual([true, 32]);
  addon.eval("ns.Theme.Settings().textScale = 1.5 ns.Theme.Refresh()");
  expect(combatFont(addon)[1], "re-applied at the new Text size").toBe(48);
  const already = loggedIn(COMBAT_TEXT_ENV + ' C_AddOns.IsAddOnLoaded = function(name) return name == "Vanguard" or name == "Blizzard_CombatText" end');
  expect(combatFont(already), "already loaded at login: themed at once").toEqual([true, 32]);
  const off = loggedIn(COMBAT_TEXT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Merchant = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_CombatText");
  expect([off.eval("return DAMAGE_TEXT_FONT"), combatFont(off)], "with the module off both are the game's").toEqual(["TEST-ONLY-DAMAGE", [false, 64]]);
  const client = loggedIn(COMBAT_TEXT_ENV, { savedVariables: 'VanguardDB.profiles = { Default = { theme = { font = "client" } } }' });
  expect(client.eval("return DAMAGE_TEXT_FONT"), "the game's font chosen: the game's damage font stays").toBe("TEST-ONLY-DAMAGE");
  const none = loggedIn("DAMAGE_TEXT_FONT = nil C_AddOns.IsAddOnLoaded = nil");
  expect([none.eval("return DAMAGE_TEXT_FONT == nil"), none.eval("return #ns.errors")], "a client without the path or the loaded check: left alone, no error").toEqual([true, 0]);
});
