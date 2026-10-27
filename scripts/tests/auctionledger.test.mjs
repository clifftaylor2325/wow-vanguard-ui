// auctionledger: the sales ledger (Modules/AuctionLedger.lua): sales, expiries and cancels from the
// auction events and the inbox's auction mail, counted once; Your history on the sell card; and the
// info strip's auction sales this session.

import { expect, it } from "vitest";
import { CLICK_LUA, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY: a wall clock (a test moves __now), Strange Dust (a commodity) and a blade, 20 dust and
// the blade in the bags, and the game's "Auction expired" subject line.
const ENV = `
  __now = 1790000000
  time = function() return __now end
  __wfgWorld.items[10940] = { name = "Strange Dust", icon = "TEST-ONLY-DUST", commodity = true }
  __wfgWorld.items[9999] = { name = "TEST-ONLY Blade", icon = "TEST-ONLY-BLADE" }
  __wfgWorld.bags[0][1] = { itemID = 10940, count = 20 }
  __wfgWorld.bags[0][2] = { itemID = 9999, count = 1 }
  AUCTION_EXPIRED_MAIL_SUBJECT = "TEST-ONLY Auction expired: %s"
`;

const HELPER = "ns.GetModule('AuctionHelper')";
const CARD = `${HELPER}.sellCard`;

// A logged-in addon at the auction house (extra Lua runs before login).
function atAuctionHouse(extra = "", opts) {
  const addon = loggedIn(ENV + extra, opts);
  addon.world.openAuctionHouse();
  addon.update(0);
  return addon;
}

// The ledger's records, oldest first: [kind, item ID, name, units, amount, auction ID, from a mail].
const records = (addon) => {
  const out = addon.eval(`local out = {}
    for i, r in ipairs(ns.AuctionLedger.Book().records) do
      out[i] = { r.kind, r.id or false, r.name or false, r.qty, r.amount or false, r.auction or false, r.mail ~= nil }
    end
    return out`);
  return Array.isArray(out) ? out : [];
};

// Your auctions up: 20 dust at 1s a unit, a blade at 40s and one at 45s; and a blade sold at 40s.
const OWNED = `__wfgWorld.ah.owned = {
  { auctionID = 501, itemKey = { itemID = 10940 }, status = 0, quantity = 20, buyoutAmount = 100 },
  { auctionID = 502, itemKey = { itemID = 9999 }, status = 0, quantity = 1, buyoutAmount = 4000 },
  { auctionID = 503, itemKey = { itemID = 9999 }, status = 0, quantity = 1, buyoutAmount = 4500 },
  { auctionID = 504, itemKey = { itemID = 9999 }, status = 1, quantity = 1, buyoutAmount = 4000 } }`;

// A seller invoice (an auction sold) for `count` of an item, `bid` copper in all, with `days` left.
const invoice = (name, bid, count, days = 29.9) => `{ sender = "TEST-ONLY Auction House", subject = "TEST-ONLY Auction successful", daysLeft = ${days},
  invoice = { type = "seller", itemName = "${name}", bid = ${bid}, count = ${count}, deposit = 10, consignment = 5 } }`;
// A mail with the game's "Auction expired" subject for an item, its `qty` back with it.
const expiredMail = (name, qty, days = 29.5) => `{ sender = "TEST-ONLY Auction House", subject = "TEST-ONLY Auction expired: ${name}", daysLeft = ${days}, firstItemQuantity = ${qty} }`;

it("events: a sold row, the game's notices, an expiry and a cancel are one record each, however often they come", () => {
  const addon = atAuctionHouse(OWNED);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect(records(addon), "the sold blade is a sale; the rest are remembered while up").toEqual([["sold", 9999, "TEST-ONLY Blade", 1, 4000, 504, false]]);
  expect(addon.eval("local n = 0 for _ in pairs(ns.AuctionLedger.Book().open) do n = n + 1 end return n"), "three up").toBe(3);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "TEST-ONLY Blade", 502);
  addon.eval("__wfgWorld.ah.owned[2].status = 1");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.fire("AUCTION_HOUSE_AUCTIONS_EXPIRED", 501);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 5, "Strange Dust", 501);
  addon.fire("AUCTION_CANCELED", 503);
  expect(records(addon).slice(1), "the notice's sale (its sold row again adds nothing), the dust's expiry (its notice too), the cancel").toEqual([
    ["sold", 9999, "TEST-ONLY Blade", 1, 4000, 502, false],
    ["expired", 10940, "Strange Dust", 20, false, 501, false],
    ["cancelled", 9999, "TEST-ONLY Blade", 1, false, 503, false],
  ]);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 5, "TEST-ONLY Gizmo", 999);
  expect(records(addon)[4], "an expiry notice for an auction never seen up: one of the item it names").toEqual(["expired", false, "TEST-ONLY Gizmo", 1, false, 999, false]);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "TEST-ONLY Gizmo", 998);
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "TEST-ONLY Gizmo");
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 5, "TEST-ONLY Gizmo");
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 0, "TEST-ONLY bid placed", 502);
  addon.fire("AUCTION_CANCELED", 997);
  addon.eval('__wfgStub.fire("AUCTION_HOUSE_AUCTIONS_EXPIRED", __wfgWorld.secret(501))');
  expect([records(addon).length, addon.eval("return #ns.errors")], "a sale never seen up, no auction, other notices, an unknown or hidden one: nothing").toEqual([5, 0]);
});

it("mail: seller invoices and expired mail are noted once however often the inbox is read; other mail isn't", () => {
  const addon = loggedIn(ENV + `__wfgWorld.mail = { ${invoice("Linen Cloth", 2000, 20)},
    { subject = "TEST-ONLY Auction pending", daysLeft = 30, invoice = { type = "seller_temp_invoice", itemName = "Linen Cloth", bid = 2000, count = 20 } },
    ${expiredMail("Strange Dust", 5)}, { sender = "TEST-ONLY Friend", subject = "TEST-ONLY Hello", daysLeft = 3 },
    { subject = "TEST-ONLY Auction won", daysLeft = 30, invoice = { type = "buyer", itemName = "Strange Dust", bid = 90, count = 1 } },
    ${invoice("TEST-ONLY Unknown Thing", 300, 1)}, ${invoice("TEST-ONLY Unknown Thing", 300, 1)} }`);
  addon.world.openMailbox();
  expect(records(addon), "the sale (its item found by name), the expiry, and two alike sales as two").toEqual([
    ["sold", 2589, "Linen Cloth", 20, 2000, false, true],
    ["expired", 10940, "Strange Dust", 5, false, false, true],
    ["sold", false, "TEST-ONLY Unknown Thing", 1, 300, false, true],
    ["sold", false, "TEST-ONLY Unknown Thing", 1, 300, false, true],
  ]);
  addon.eval("__now = __now + 600");
  addon.eval("for _, m in ipairs(__wfgWorld.mail) do m.daysLeft = m.daysLeft - 600 / 86400 end");
  addon.fire("MAIL_INBOX_UPDATE");
  expect(records(addon).length, "read again ten minutes on: the same four").toBe(4);
  addon.eval("table.remove(__wfgWorld.mail, 1)");
  addon.fire("MAIL_INBOX_UPDATE");
  expect(records(addon).length, "a mail taken: its record stays").toBe(4);
  addon.eval(`__wfgWorld.mail = { ${invoice("Linen Cloth", 2000, 20, 29.0)} }`);
  addon.fire("MAIL_INBOX_UPDATE");
  expect(records(addon)[4], "a later mail alike (another expiry time) is another sale").toEqual(["sold", 2589, "Linen Cloth", 20, 2000, false, true]);
});

it("mail: the subject line as the client words it, and hidden values", () => {
  const addon = loggedIn(ENV + 'AUCTION_EXPIRED_MAIL_SUBJECT = "TEST-ONLY (Expired) %s [back]."');
  addon.eval(`__wfgWorld.mail = { ${expiredMail("Strange Dust", 5)},
    { subject = "TEST-ONLY (Expired) Strange Dust [back].", daysLeft = 29, firstItemQuantity = 3 },
    { subject = "TEST-ONLY (Expired) Linen Cloth [back].", daysLeft = 29 },
    { subject = "TEST-ONLY (Expired) Strange Dust [back].", daysLeft = __wfgWorld.secret(29) },
    { subject = __wfgWorld.secret("x"), daysLeft = 29 },
    { daysLeft = 29, invoice = { type = "seller", itemName = "Linen Cloth", bid = __wfgWorld.secret(1), count = 1 } },
    { daysLeft = 29, invoice = { type = "seller", itemName = "Linen Cloth", bid = 50 } } }`);
  addon.world.openMailbox();
  expect(records(addon), "the brackets and dots are the line's own; no count is one; hidden numbers and texts are passed over").toEqual([
    ["expired", 10940, "Strange Dust", 3, false, false, true],
    ["expired", 2589, "Linen Cloth", 1, false, false, true],
    ["sold", 2589, "Linen Cloth", 1, 50, false, true],
  ]);
  addon.eval("AUCTION_EXPIRED_MAIL_SUBJECT = nil __wfgWorld.mail = { " + expiredMail("Linen Cloth", 2, 20) + " }");
  addon.fire("MAIL_INBOX_UPDATE");
  expect([records(addon).length, addon.eval("return #ns.errors")], "a client without the line: expired mail isn't read").toEqual([3, 0]);
});

it("an event's sale and the mail about it are one record, the mail's figures standing", () => {
  const addon = atAuctionHouse(OWNED);
  addon.fire("OWNED_AUCTIONS_UPDATED");
  addon.fire("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", 4, "Strange Dust", 501);
  expect(records(addon)[1], "the notice: the whole auction, 20 at 1s").toEqual(["sold", 10940, "Strange Dust", 20, 2000, 501, false]);
  addon.eval(`__wfgWorld.mail = { ${invoice("Strange Dust", 500, 5)}, ${invoice("Strange Dust", 1500, 15)}, ${invoice("TEST-ONLY Blade", 4000, 1)} }`);
  addon.world.openMailbox();
  expect(records(addon), "5 of the dust joined the notice's record at the same price each; the other 15 a sale of their own; the blade's mail joined its sold row").toEqual([
    ["sold", 9999, "TEST-ONLY Blade", 1, 4000, 504, true],
    ["sold", 10940, "Strange Dust", 5, 500, 501, true],
    ["sold", 10940, "Strange Dust", 15, 1500, false, true],
  ]);
  addon.fire("MAIL_INBOX_UPDATE");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect(records(addon).length, "read again, and the sold row again: still three").toBe(3);
  addon.eval(`__wfgWorld.mail = { ${invoice("TEST-ONLY Blade", 4500, 1, 28)} }`);
  addon.fire("MAIL_INBOX_UPDATE");
  addon.eval("__wfgWorld.ah.owned[3].status = 1");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect(records(addon).slice(3), "a mail first, then the sold row of that auction: one record with both").toEqual([["sold", 9999, "TEST-ONLY Blade", 1, 4500, 503, true]]);
  addon.eval(`__wfgWorld.mail = { ${invoice("TEST-ONLY Blade", 3900, 1, 27)} }`);
  addon.fire("MAIL_INBOX_UPDATE");
  addon.eval("__now = __now + 31 * 86400");
  addon.eval("__wfgWorld.ah.owned = { { auctionID = 601, itemKey = { itemID = 9999 }, status = 1, quantity = 1, buyoutAmount = 3900 } }");
  addon.fire("OWNED_AUCTIONS_UPDATED");
  expect(records(addon).slice(4).map((r) => r.slice(4)), "another price, and a sale a month after a mail alike: their own records").toEqual([[3900, false, true], [3900, 601, false]]);
});

it("the ledger is kept per realm and faction, capped, and old records go at login", () => {
  const old = 1790000000 - 91 * 86400;
  const saved = `VanguardDB.ah = { ledgers = {
    ["ForeverTest-Alliance"] = { records = { { kind = "sold", id = 9999, name = "TEST-ONLY Blade", qty = 1, amount = 100, t = ${old} },
      { kind = "sold", id = 9999, name = "TEST-ONLY Blade", qty = 1, amount = 200, t = 1790000000 - 86400 }, "TEST-ONLY broken" },
      open = { [1] = { t = 1790000000 - 4 * 86400 }, [2] = { t = 1790000000 - 3600 }, [3] = "TEST-ONLY broken" } },
    ["ForeverTest-Horde"] = { records = { { kind = "sold", qty = 1, amount = 1, t = ${old} } }, open = {} },
    ["Elsewhere-Horde"] = "TEST-ONLY broken", ["Other-Horde"] = { records = {} } } }`;
  const addon = loggedIn(ENV, { savedVariables: saved });
  expect(addon.eval(`local out = {} for k, b in pairs(VanguardDB.ah.ledgers) do local n = 0 for _ in pairs(b.open) do n = n + 1 end out[#out + 1] = k .. ":" .. #b.records .. ":" .. n end table.sort(out) return out`),
    "older than 90 days, an auction seen up 4 days ago and anything broken go; a house left empty is forgotten").toEqual(["ForeverTest-Alliance:1:1"]);
  addon.eval("__wfgWorld.units.player.faction = 'Horde'");
  addon.eval("ns.AuctionLedger.Note({ kind = 'cancelled', id = 9999, name = 'TEST-ONLY Blade', qty = 1, auction = 7, t = __now })");
  expect([records(addon).length, addon.eval("return #VanguardDB.ah.ledgers['ForeverTest-Alliance'].records")], "the Horde's own ledger").toEqual([1, 1]);
  addon.eval("ns.AuctionLedger.MAX = 3 for i = 1, 5 do ns.AuctionLedger.Note({ kind = 'cancelled', id = 9999, qty = 1, auction = 100 + i, t = __now + i }) end");
  expect(records(addon).map((r) => r[5]), "past the cap the oldest go").toEqual([103, 104, 105]);
  addon.eval("ns.AuctionPrices.Store().houses = {}");
  expect(records(addon).length, "forgetting the prices keeps the ledger").toBe(3);
});

// The Up now card, which holds Your history.
const UP = `${HELPER}.upCard`;

// The Up now card's history: [shown, toggle text, line, the listings' visibility, rows as [price, its color is gold, qty, when]].
const history = (addon) => {
  const rows = [1, 2, 3, 4].map((i) => {
    const r = `${UP}.history.rows[${i}]`;
    if (!addon.eval(`return ${r}:IsShown()`)) return null;
    return [addon.eval(`return ${r}.cells.price:GetText()`), isTok(addon, addon.frame(`${r}.cells.price`).textColor, "gold"), addon.eval(`return ${r}.cells.qty:GetText()`), addon.eval(`return ${r}.cells.time:GetText()`)];
  }).filter(Boolean);
  return addon.eval(`local c = ${UP} return { c.history:IsShown(), c.historyToggle.text:GetText(), c.summary:GetText(), c.table:IsShown() }`).concat([rows]);
};

// The sell card's history line.
const historyLine = (addon) => addon.eval(`return ${CARD}.historyLine:GetText()`);

// Drops the item in bag 0 `slot` on the sell slot.
function drop(addon, slot) {
  addon.eval(`__wfgWorld.cursor = { type = "item", id = 0, bag = 0, slot = ${slot} }`);
  addon.click(`${CARD}.slot`);
}

it("Your history on the Up now card: the item's last records, how many sold of those that sold or ran out, the average each", () => {
  const addon = atAuctionHouse();
  expect([history(addon), historyLine(addon)], "listings by default; the toggle offers the history; no line on the sell card").toEqual([[false, "Your history", "", true, []], ""]);
  addon.click(`${UP}.historyToggle`);
  expect(history(addon).slice(0, 4), "no item: it says how to see it").toEqual([true, "Up now", "Put an item on the Sell card to see how it sold.", false]);
  drop(addon, 2);
  expect([history(addon).slice(2), historyLine(addon)], "an item never sold").toEqual([["No sales or expiries of this item yet.", false, []], "No sales or expiries of this item yet."]);
  addon.eval(`local AL = ns.AuctionLedger
    AL.Note({ kind = "sold", id = 9999, name = "TEST-ONLY Blade", qty = 1, amount = 4000, auction = 1, t = __now - 3 * 86400 })
    AL.Note({ kind = "expired", id = 9999, name = "TEST-ONLY Blade", qty = 1, auction = 2, t = __now - 86400 })
    AL.Note({ kind = "cancelled", id = 9999, name = "TEST-ONLY Blade", qty = 1, auction = 3, t = __now - 60 })
    AL.Note({ kind = "sold", name = "TEST-ONLY Blade", qty = 2, amount = 9001, mail = __now + 86400, t = __now })
    AL.Note({ kind = "sold", id = 10940, name = "Strange Dust", qty = 20, amount = 2000, auction = 4, t = __now })`);
  expect(history(addon).slice(2), "newest first (the mail's by name), cancels shown but not counted; the average over the units sold").toEqual([
    "sold 2 of 3 · avg 43s 33c", false,
    [["45s 0c", true, "x 2", "today"], ["cancelled", false, "x 1", "today"], ["expired", false, "x 1", "yesterday"], ["40s 0c", true, "x 1", "3 days ago"]],
  ]);
  addon.eval(`ns.AuctionLedger.Note({ kind = "expired", id = 9999, qty = 1, auction = 5, t = __now })`);
  expect([history(addon)[2], historyLine(addon)], "a new record shows at once, on the sell card's line too").toEqual(["sold 2 of 4 · avg 43s 33c", "sold 2 of 4 · avg 43s 33c"]);
  addon.click(`${UP}.historyToggle`);
  expect(history(addon).slice(0, 4), "Up now: the listings again, the line gone").toEqual([false, "Your history", "", true]);
  addon.click(`${UP}.historyToggle`);
  addon.eval(`${HELPER}.StopSelling()`);
  drop(addon, 1);
  expect(history(addon).slice(2, 3), "the dust: one sale, nothing ran out").toEqual(["sold 1 of 1 · avg 1s 0c"]);
  addon.eval(`ns.AuctionLedger.Book().records = { { kind = "cancelled", id = 10940, qty = 5, auction = 9, t = __now } } ${HELPER}.PaintSell()`);
  expect(history(addon).slice(2), "only a cancel: nothing sold or ran out").toEqual(["No sales or expiries of this item yet.", false, [["cancelled", false, "x 5", "today"]]]);
});

it("the history's toggle sits on the Up now card's heading line, and the history in the listings' place", () => {
  const addon = atAuctionHouse();
  addon.click(`${UP}.historyToggle`);
  const cardRect = addon.frame(UP).rect;
  const toggle = addon.frame(`${UP}.historyToggle`).rect;
  const title = addon.frame(`${UP}.title`).rect;
  const list = addon.frame(`${UP}.table`).rect;
  const hist = addon.frame(`${UP}.history`).rect;
  expect([toggle.right, toggle.top >= title.top, toggle.bottom < title.top, toggle.left > title.right], "right-aligned, level with the heading").toEqual([cardRect.right, true, true, true]);
  expect(hist, "exactly where the listings are").toEqual(list);
  expect([addon.frame(`${UP}.summary`).rect.right <= toggle.left, addon.frame(`${UP}.summary`).rect.left > title.right], "the line beside the heading, before the toggle").toEqual([true, true]);
});

it("the info strip's auction sales: this session's, off until switched on, from the options", () => {
  const before = `VanguardDB.ah = { ledgers = { ["ForeverTest-Alliance"] = { records = { { kind = "sold", id = 9999, qty = 1, amount = 70000, auction = 1, t = 1790000000 - 600 } }, open = {} } } }`;
  const addon = atAuctionHouse(CLICK_LUA, { savedVariables: before });
  // The strip's auction sales block: [shown, text].
  const block = () => addon.eval("local fs = ns.GetModule('InfoStrip').fonts.ahgold return { fs:IsShown(), fs:GetText() or false }");
  addon.eval(`ns.AuctionLedger.Note({ kind = "sold", id = 9999, qty = 1, amount = 4000, auction = 2, t = __now })`);
  expect(block()[0], "off by default").toBe(false);
  addon.eval('ns.Options.Show("map")');
  addon.eval('__click("Your auction sales this session")');
  expect([addon.eval("return ns.Settings('InfoStrip').ahgold"), block()], "on: this session's sale only (the one before login isn't)").toEqual([true, [true, "AH +40s 0c"]]);
  expect(isTok(addon, addon.frame("ns.GetModule('InfoStrip').fonts.ahgold").textColor, "gold"), "in gold").toBe(true);
  addon.eval(`ns.AuctionLedger.Note({ kind = "sold", id = 9999, qty = 1, amount = 125000, auction = 3, t = __now })
    ns.AuctionLedger.Note({ kind = "expired", id = 9999, qty = 1, auction = 4, t = __now })`);
  expect([block()[1], addon.eval("return Vanguard_InfoStrip:GetHeight()")], "a new sale counts at once, on the fourth row (rows with nothing to show close up); an expiry adds nothing").toEqual(["AH +12g 90s", 76]);
  addon.eval("ns.AuctionLedger.Book().records = {} ns.GetModule('InfoStrip').Paint('ahgold')");
  expect(block()[0], "no sales: hidden").toBe(false);
  addon.eval(`ns.AuctionLedger.Note({ kind = "sold", id = 9999, qty = 1, amount = 90000, mail = __now + 86400, t = __now })
    ns.GetModule('InfoStrip').Paint('ahgold')`);
  expect(block()[0], "a sale first read from the mail may be days old: not this session's").toBe(false);
  addon.eval(`ns.GetModule('InfoStrip').session.start = GetTime() - 600
    ns.AuctionLedger.Note({ kind = "sold", id = 9999, qty = 1, amount = 5000, auction = 5, t = __now - 300 })`);
  expect(block()[1], "the strip's session, carried on through a /reload, started before the ledger did").toBe("AH +50s 0c");
});

it("with the auction helper off, nothing is noted and the strip shows nothing", () => {
  const addon = loggedIn(ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { AuctionHelper = false }, InfoStrip = { ahgold = true } } }" });
  addon.eval(`__wfgWorld.mail = { ${invoice("Linen Cloth", 2000, 20)} }`);
  addon.world.openMailbox();
  expect([addon.eval("return ns.AuctionLedger.SessionSales()"), addon.eval("return ns.GetModule('InfoStrip').fonts.ahgold:IsShown()")], "no ledger, no block").toEqual([0, false]);
});

it("a client without the inbox calls doesn't read mail", () => {
  const addon = loggedIn(ENV + "GetInboxNumItems = nil");
  addon.eval(`__wfgWorld.mail = { ${invoice("Linen Cloth", 2000, 20)} }`);
  addon.world.openMailbox();
  expect([records(addon).length, addon.eval("return #ns.errors")]).toEqual([0, 0]);
});
