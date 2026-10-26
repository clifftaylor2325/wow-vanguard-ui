// mailtools: the mail tools (Modules/MailTools.lua): off until switched on; the panel beside the
// mail window that searches and filters the inbox, Take, and the send-to-alt presets, at the
// TEST-ONLY mail window of the headless client.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { SETUP_DONE, chatHas, isTok, loggedIn } from "./helpers.mjs";
import { alphaOf, insets } from "./dialogs.mjs";

// TEST-ONLY: three mails (a sale with money, a letter with an item, a plain letter), and bag items.
const ENV = `
  local items = __wfgWorld.items
  items[900] = { name = "TEST-ONLY Iron Bar" }
  items[901] = { name = "TEST-ONLY Iron Ore" }
  items[902] = { name = "TEST-ONLY Herb" }
  __wfgWorld.bagSizes = { [0] = 4, 0, 0, 0, 0 }
  __wfgWorld.bags = { [0] = { [1] = { itemID = 900 }, [2] = { itemID = 901 }, [4] = { itemID = 902 } } }
  __wfgWorld.mail = {
    { sender = "Auction House", subject = "Auction successful: Iron Bar", money = 5000, itemCount = 0, invoice = { type = "seller", itemName = "Iron Bar", bid = 5000, count = 1 } },
    { sender = "Bobalt", subject = "Some ore", money = 0, itemCount = 1, firstItemQuantity = 5, firstItemLink = "|cffffffff|Hitem:901::::::::60|h[TEST-ONLY Iron Ore]|h|r" },
    { sender = "Mum", subject = "Hello", money = 0, itemCount = 0 },
  }
`;
const ON = "VanguardDB.profiles = { Default = { MailTools = { on = true } } }";
const MT = "ns.GetModule('MailTools')";

// A logged-in character, the tools on unless told otherwise.
function mailer(extra = "", savedVariables = ON) {
  return loggedIn(ENV + extra, { savedVariables });
}
// Types a /vg command and says whether chat then has a line matching re.
const say = (addon, cmd, re) => (addon.slash(cmd), chatHas(addon, re));
// The rows the panel shows, as their text.
const rows = (addon) => addon.eval(`local out = {} for _, r in ipairs(Vanguard_MailTools.rows) do if r:IsShown() then out[#out + 1] = r.text:GetText() end end return out`);
// What the game was asked to take.
const taken = (addon) => addon.eval("return __wfgWorld.taken");

it("is off until switched on, and says so", () => {
  const addon = mailer("", "");
  expect(say(addon, "mail", /The mail tools are off/), "off by default").toBe(true);
  addon.world.openMailWindow();
  expect(addon.eval("return Vanguard_MailTools == nil"), "no panel").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("searches and filters the inbox beside the mail window, and Take takes the money and the first item", () => {
  const addon = mailer();
  addon.world.openMailWindow();
  expect(rows(addon), "all three").toEqual(["Auction House: Auction successful: Iron Bar (50s 0c)", "Bobalt: Some ore (1 item)", "Mum: Hello"]);
  const [p, w] = [addon.frame("Vanguard_MailTools").rect, addon.frame("MailFrame").rect];
  expect([p.left - w.right, p.top], "right of the window, from its top").toEqual([8, w.top]);
  addon.type("Vanguard_MailTools.search", "IRON  ore");
  expect(rows(addon), "every word, any case; the first item's name counts").toEqual(["Bobalt: Some ore (1 item)"]);
  addon.type("Vanguard_MailTools.search", "");
  addon.click("Vanguard_MailTools.filterButton");
  expect([rows(addon).length, addon.eval("return Vanguard_MailTools.filterButton.text:GetText()")], "Money").toEqual([1, "Money"]);
  addon.click("Vanguard_MailTools.filterButton");
  expect(rows(addon), "Items").toEqual(["Bobalt: Some ore (1 item)"]);
  addon.click("Vanguard_MailTools.filterButton");
  expect(rows(addon).length, "Sales").toBe(1);
  addon.click("Vanguard_MailTools.filterButton");
  expect(rows(addon).length, "back to All").toBe(3);
  addon.eval("Vanguard_MailTools.rows[1].take:Click()");
  expect(rows(addon), "the emptied sale leaves the inbox, and the rows move up").toEqual(["Bobalt: Some ore (1 item)", "Mum: Hello"]);
  addon.eval("Vanguard_MailTools.rows[1].take:Click()");
  expect(taken(addon), "money, then the item").toEqual([["money", 1], ["item", 1, 1]]);
  expect(addon.eval("return Vanguard_MailTools.rows[1].take:IsShown()"), "nothing to take: no button").toBe(false);
  addon.eval("Vanguard_MailTools.rows[3].mail = nil Vanguard_MailTools.rows[3].take:Click()");
  expect(Object.keys(taken(addon)).length, "a row with no mail takes nothing").toBe(2);
  addon.world.closeMailWindow();
  expect(addon.frame("Vanguard_MailTools").visible, "closed with the window").toBe(false);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("/vg mail prints what matches", () => {
  const addon = mailer();
  expect(say(addon, "mail zzz", /No mail matches/), "nothing").toBe(true);
  expect(say(addon, "mail bobalt", /2\. Bobalt: Some ore \(1 item\)/), "a match").toBe(true);
  addon.eval("local m = {} for i = 1, 11 do m[i] = { sender = 'S' .. i, subject = 'many', itemCount = 0 } end __wfgWorld.mail = m");
  addon.slash("mail many");
  expect(chatHas(addon, /\+3 more\./), "more than the rows").toBe(true);
  addon.eval("__wfgWorld.mail = { { sender = __wfgWorld.secret('x'), subject = __wfgWorld.secret('y'), itemCount = 0 } }");
  expect(say(addon, "mail", /\?: /), "a hidden sender and subject: plain, no error").toBe(true);
  const old = mailer("GetInboxNumItems = nil GetInboxInvoiceInfo = nil");
  old.slash("mail");
  expect([chatHas(old, /No mail matches/), old.eval("return #ns.errors")], "no mail API: nothing, no error").toEqual([true, 0]);
});

it("presets: add, list, replace and remove; Send types the name and attaches the matching items", () => {
  const addon = mailer();
  expect(say(addon, "mail preset", /No presets yet/), "none").toBe(true);
  expect(say(addon, "mail preset add", /\/vg mail preset add <name>/), "usage").toBe(true);
  addon.slash("mail preset add Smith Bobalt iron");
  addon.slash("mail preset add Everything Bobalt");
  addon.slash("mail preset add smith Bobalt ore, bar");
  expect(chatHas(addon, /Preset Smith: send to Bobalt what is named iron\./) && chatHas(addon, /Preset Everything: send to Bobalt every item\./), "added").toBe(true);
  addon.slash("mail preset");
  expect(chatHas(addon, /smith: to Bobalt, ore, bar/), "same name replaces, listed").toBe(true);
  expect(say(addon, "mail send nobody", /No preset called nobody/), "unknown").toBe(true);
  expect(say(addon, "mail send smith", /Open the Send Mail tab/), "tab closed").toBe(true);
  addon.world.openMailWindow();
  addon.world.showSendMail();
  addon.slash("mail send smith");
  expect(addon.eval("return SendMailNameEditBox:GetText()"), "the character typed in").toBe("Bobalt");
  expect(addon.eval("return __wfgWorld.usedItems"), "the iron items attached, not the herb").toEqual([[0, 1], [0, 2]]);
  expect(chatHas(addon, /smith: 2 items attached for Bobalt\. Press Send\./), "chat says so").toBe(true);
  addon.eval("__wfgWorld.usedItems = nil");
  addon.world.combat(true);
  addon.slash("mail send smith");
  addon.world.combat(false);
  expect(addon.eval("return __wfgWorld.usedItems"), "in combat: nothing").toBe(null);
  addon.slash("mail send everything");
  expect(addon.eval("return #__wfgWorld.usedItems"), "no words: every item").toBe(3);
  expect(addon.eval("local b = Vanguard_MailTools.presets return { b[1].text:GetText(), b[2]:IsShown(), b[3]:IsShown() }"), "buttons for the presets").toEqual(["smith", true, false]);
  addon.eval("__wfgWorld.usedItems = nil");
  addon.eval("Vanguard_MailTools.presets[1]:Click()");
  expect(addon.eval("return #__wfgWorld.usedItems"), "a button sends its preset").toBe(2);
  addon.slash("mail preset remove smith");
  addon.slash("mail preset remove smith");
  expect([chatHas(addon, /Preset smith removed\./), chatHas(addon, /No preset called smith\./)], "removed once").toEqual([true, true]);
  expect(addon.eval(`return #${MT}.settings.presets`), "one left").toBe(1);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("more matches than rows: the heading counts them, the wheel scrolls through them, and Take all takes every match", () => {
  const addon = mailer("__wfgWorld.mail = {} for i = 1, 12 do __wfgWorld.mail[i] = { sender = 'Alt' .. i, subject = 'Gold', money = 100 * i, itemCount = 0 } end");
  addon.world.openMailWindow();
  // The heading's count.
  const count = () => addon.eval("return Vanguard_MailTools.count:GetText()");
  expect([rows(addon).length, rows(addon)[0], count()], "eight rows, and which of how many").toEqual([8, "Alt1: Gold (1s 0c)", "1-8 of 12"]);
  addon.wheel("Vanguard_MailTools.search", -3);
  expect(count(), "the wheel over the search box moves nothing").toBe("1-8 of 12");
  addon.wheel("Vanguard_MailTools.rows[2].take", -3);
  expect([rows(addon)[0], count()], "the wheel over the rows (a Take button too) moves them down the matches").toEqual(["Alt4: Gold (4s 0c)", "4-11 of 12"]);
  addon.wheel("Vanguard_MailTools.rows[1]", -9);
  expect([rows(addon)[7], count()], "no further than the last match").toEqual(["Alt12: Gold (12s 0c)", "5-12 of 12"]);
  addon.world.closeMailWindow();
  addon.world.openMailWindow();
  expect(count(), "the mailbox opened again starts at the top").toBe("1-8 of 12");
  addon.wheel("Vanguard_MailTools.rows[1]", -9);
  addon.type("Vanguard_MailTools.search", "Alt1");
  expect([rows(addon).length, count()], "new words start at the top again: Alt1, Alt10-12").toEqual([4, ""]);
  addon.type("Vanguard_MailTools.search", "");
  addon.slash("mail takeall");
  addon.advance(6);
  expect([addon.eval("return #__wfgWorld.taken"), count()], "all twelve taken; none left past the rows").toEqual([12, ""]);
});
it("the heading says when the server holds more mail than the inbox loaded", () => {
  const addon = mailer("__wfgWorld.mailOnServer = 60");
  addon.world.openMailWindow();
  expect(addon.eval("return Vanguard_MailTools.count:GetText()"), "taking some loads the rest").toBe("more on the server");
  addon.eval("__wfgWorld.mail = {} for i = 1, 9 do __wfgWorld.mail[i] = { sender = 'Alt' .. i, subject = 'Hi', itemCount = 0 } end");
  addon.fire("MAIL_INBOX_UPDATE");
  expect(addon.eval("return Vanguard_MailTools.count:GetText()"), "both at once").toBe("1-8 of 9 · more on the server");
});
it("each row says how long its mail has left, in the warning colour when short, and when the game then deletes it with something in it", () => {
  const addon = mailer(`__wfgWorld.mail = {
    { sender = "Auction House", subject = "Sold", money = 5000, itemCount = 0, daysLeft = 29.5, deletes = true },
    { sender = "Bobalt", subject = "Ore", money = 0, itemCount = 1, daysLeft = 2.5 },
    { sender = "Mum", subject = "Hello", money = 0, itemCount = 0, daysLeft = 0.3, deletes = true },
    { sender = "Auction House", subject = "Sold too", money = 900, itemCount = 0, daysLeft = 1.5, deletes = true },
    { sender = "Carl", subject = "Hi", money = 0, itemCount = 0, daysLeft = 12 },
    { sender = "Dee", subject = "Secret", money = 0, itemCount = 0, daysLeft = __wfgWorld.secret(5) },
  }`);
  addon.world.openMailWindow();
  const days = addon.eval(`local out = {} for i = 1, 6 do local d = Vanguard_MailTools.rows[i].days
    out[i] = { d:GetText() or "", d.__textColor } end return out`).map((r) => [r[0], isTok(addon, r[1], "warn")]);
  expect(days, "a sale's gold 29 days off: plain; 2 days left; hours under a day (an empty letter is lost with nothing); a sale's gold deleted in a day; plain days; a hidden time says nothing").toEqual([
    ["29d", false], ["2d", true], ["7h", true], ["deleted in 1d", true], ["12d", false], ["", false]]);
});
it("presets attach only what can be mailed: a soulbound or locked item is passed over and not counted", () => {
  const addon = mailer("__wfgWorld.bagSizes[0] = 6 __wfgWorld.bags[0][5] = { itemID = 900, bound = true } __wfgWorld.bags[0][6] = { itemID = 901, locked = true } __wfgWorld.bags[0][1].bound = true __wfgWorld.bags[0][2].locked = true");
  addon.slash("mail preset add Smith Bobalt iron");
  addon.world.openMailWindow();
  addon.world.showSendMail();
  addon.slash("mail send smith");
  expect([addon.eval("return __wfgWorld.usedItems"), chatHas(addon, /Smith: 0 items attached for Bobalt\./)], "every iron item is bound or locked").toEqual([null, true]);
  addon.eval("__wfgWorld.bags[0][2].locked = nil");
  addon.slash("mail send smith");
  expect([addon.eval("return __wfgWorld.usedItems"), chatHas(addon, /Smith: 1 items attached for Bobalt\./)], "the ore, once free").toEqual([[[0, 2]], true]);
});
it("+ Add on the panel makes a preset, a right-click on its button asks and removes it, and pointing says what it sends", () => {
  const addon = mailer();
  addon.world.openMailWindow();
  // + Add shown, its caption, and the hint shown.
  const slots = () => addon.eval("local f = Vanguard_MailTools return { f.addPreset:IsShown(), f.addPreset.text:GetText(), f.hint:IsShown() }");
  expect(slots(addon), "+ Add in the first place, the hint beside it").toEqual([true, "+ Add", true]);
  addon.click("Vanguard_MailTools.addPreset");
  addon.type("Vanguard_TextEdit", "Smith");
  addon.click("Vanguard_TextDialog.primary");
  expect([addon.frame("Vanguard_TextDialog").visible, chatHas(addon, /A preset needs a name and a character/)], "a name alone: the box stays and chat says what it needs").toEqual([true, true]);
  addon.type("Vanguard_TextEdit", "  Smith Bobalt iron bar ");
  addon.click("Vanguard_TextDialog.primary");
  expect([addon.frame("Vanguard_TextDialog").visible, addon.eval(`local p = ${MT}.settings.presets[1] return { p.name, p.to, p.words }`)], "added; the box closes").toEqual([false, ["Smith", "Bobalt", "iron bar"]]);
  const [first, add] = [addon.frame("Vanguard_MailTools.presets[1]").rect, addon.frame("Vanguard_MailTools.addPreset").rect];
  expect([addon.eval("return Vanguard_MailTools.presets[1].text:GetText()"), add.left - first.right, slots(addon)[2]], "its button, then + Add a tight step on; no hint").toEqual(["Smith", 4, false]);
  addon.hover("Vanguard_MailTools.presets[1]");
  expect(addon.eval("local out = {} for _, l in ipairs(GameTooltip.__lines) do out[#out + 1] = l.text end return out"), "the tooltip").toEqual(["Smith", "Sends items named iron bar to Bobalt.", "Right-click to remove."]);
  addon.hover(null);
  addon.slash("mail preset add All Bobalt");
  addon.hover("Vanguard_MailTools.presets[2]");
  expect(addon.eval("return GameTooltip.__lines[2].text"), "no words: every item").toBe("Sends every item to Bobalt.");
  addon.eval(`${MT}.settings.presets[2].name = 'Gone' ${MT}.PresetTip(Vanguard_MailTools.presets[2])`);
  addon.slash("mail preset add C Bobalt");
  addon.slash("mail preset add D Bobalt");
  expect(slots(addon)[0], "every place holds a preset: no + Add").toBe(false);
  addon.eval("Vanguard_MailTools.presets[1]:Click('RightButton')");
  expect([addon.eval("return Vanguard_Question.title:GetText()"), addon.eval(`return #${MT}.settings.presets`)], "a right-click asks first").toEqual(["Remove the preset Smith?", 4]);
  addon.click("Vanguard_Question.confirm");
  expect([addon.eval(`return ${MT}.settings.presets[1].name`), slots(addon)[0], chatHas(addon, /Preset Smith removed\./)], "removed; + Add is back").toEqual(["Gone", true, true]);
  addon.eval(`${MT}.PresetClick(nil, 'RightButton')`);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("attaches at most 12, and a preset button before the panel exists is quiet", () => {
  const addon = mailer("__wfgWorld.bagSizes[0] = 20 for s = 1, 20 do __wfgWorld.bags[0][s] = { itemID = 900 } end");
  addon.slash("mail preset add All Bobalt");
  addon.world.openMailWindow();
  addon.world.showSendMail();
  addon.slash("mail send all");
  expect(addon.eval("return #__wfgWorld.usedItems"), "the game's limit").toBe(12);
  const early = mailer();
  early.slash("mail preset add One Bobalt");
  expect(early.eval(`return ${MT}.PaintPresets()`), "no panel yet").toBe(null);
});

it("a panel first built by the inbox update (the window shows after MAIL_SHOW) hides unset presets, says when there is nothing, and sits on the window's layer", () => {
  const addon = mailer("__wfgWorld.mail = {}");
  addon.eval("MailFrame = nil");
  addon.world.openMailWindow();
  expect(addon.eval("local n = 0 for _, b in ipairs(Vanguard_MailTools.presets) do if b:IsShown() then n = n + 1 end end return n"), "no stray Preset buttons").toBe(0);
  expect(addon.eval("return { Vanguard_MailTools.empty:IsShown(), Vanguard_MailTools.empty:GetText(), Vanguard_MailTools.hint:IsShown() }"), "empty inbox and the hint").toEqual([true, "Your inbox is empty.", true]);
  expect(addon.eval("return { Vanguard_MailTools:GetFrameStrata() == MailFrame:GetFrameStrata(), Vanguard_MailTools:GetFrameLevel() == MailFrame:GetFrameLevel() }"), "same layer").toEqual([true, true]);
  addon.eval("__wfgWorld.mail = { { sender = 'Mum', subject = 'Hello', itemCount = 0 } }");
  addon.type("Vanguard_MailTools.search", "zzz");
  expect(addon.eval("return Vanguard_MailTools.empty:GetText()"), "mail but no match").toBe("No mail matches.");
  addon.type("Vanguard_MailTools.search", "");
  expect(addon.eval("return Vanguard_MailTools.empty:IsShown()"), "rows shown: no line").toBe(false);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("the panel goes with the mail window however it closes: hidden with no MAIL_CLOSED, or an inbox update after it", () => {
  const addon = mailer();
  addon.world.openMailWindow();
  expect(addon.eval("return Vanguard_MailTools:GetParent() == MailFrame"), "a child of the window").toBe(true);
  addon.eval("MailFrame:Hide()");
  expect(addon.frame("Vanguard_MailTools").visible, "the window hidden (walked away, Escape): the panel too").toBe(false);
  addon.world.openMailWindow();
  expect(addon.frame("Vanguard_MailTools").visible, "back with the mailbox").toBe(true);
  addon.world.closeMailWindow();
  addon.fire("MAIL_INBOX_UPDATE");
  expect(addon.frame("Vanguard_MailTools").visible, "a late inbox update leaves it closed").toBe(false);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("the options have the switch", () => {
  const addon = mailer();
  addon.eval('ns.Options.Show("town")');
  expect(addon.find("^Search the inbox and send%-to%-alt presets").text, "under Town and gear").toMatch(/^Search the inbox/);
  addon.eval("ns.Settings('MailTools').on = false");
  addon.eval(`${MT}.Paint()`);
  expect(addon.eval("return Vanguard_MailTools == nil"), "off before any mailbox: no panel").toBe(true);
});

// The theme numbers the panel is laid out with: gap, row height, button height, control height, the opaque alpha,
// and the heading, small and label role sizes.
const tokens = (addon) => addon.eval(`local T = ns.Theme
  return { T.SPACE.gap, T.ROW.height, T.BUTTON_H, T.CONTROL_H, T.ALPHA.opaque, T.RoleSize("heading"), T.RoleSize("small"), T.RoleSize("label") }`);

// A W.Row's look, from a Lua expression for it: its height, its hover wash (the vertex colour of its T.Row hover layer), and whether the selected look is there and hidden.
const rowLook = (addon, row) => addon.eval(`local r = ${row}
  local hover = ns.Theme.RowParts(r).hover.__vertexColor
  return { r:GetHeight(), hover, r.rail ~= nil and r.wash ~= nil, r.rail:IsShown() or r.wash:IsShown() }`);

it("the panel: a card heading with no X, opaque, T.SPACE.gap in from its edges, W.Rows T.ROW.height tall, controls at their heights", () => {
  const addon = mailer();
  addon.slash("mail preset add Smith Bobalt iron");
  addon.world.openMailWindow();
  const [gap, rowH, buttonH, controlH, opaque, headingSize] = tokens(addon);
  const [title, panel] = ["title", ""].map((part) => addon.frame(`Vanguard_MailTools${part && "."}${part}`));
  expect([title.text, title.font.size, isTok(addon, title.textColor, "text"), title.rect.left - panel.rect.left, panel.rect.top - title.rect.top],
    "the heading role in text, T.SPACE.gap in and down from the card's corner").toEqual(["Find mail", headingSize, true, gap, gap]);
  expect(addon.eval("return Vanguard_MailTools.close == nil"), "no X: the panel follows the mail window").toBe(true);
  expect(alphaOf(addon, "Vanguard_MailTools"), "T.ALPHA.opaque").toBe(opaque);
  const look = rowLook(addon, "Vanguard_MailTools.rows[1]");
  expect([look[0], isTok(addon, look[1], "hover"), look[2], look[3]], "a row is a W.Row: T.ROW.height, the hover wash, the selected look made and hidden").toEqual([rowH, true, true, false]);
  // How far a part of the panel sits inside it, as [left, top, right, bottom].
  const inset = (part) => insets(addon, `Vanguard_MailTools.${part}`, "Vanguard_MailTools");
  expect([inset("rows[8]")[0], inset("rows[8]")[2], inset("search")[0], inset("presets[1]")[0], inset("presets[1]")[3]],
    "rows, the search box and the preset buttons all T.SPACE.gap in from the sides, the buttons from the bottom").toEqual([gap, gap, gap, gap, gap]);
  const heights = ["rows[1].take", "filterButton", "presets[1]", "search"].map((part) => addon.frame(`Vanguard_MailTools.${part}`).rect.height);
  expect(heights, "Take, the filter and the preset buttons T.BUTTON_H; the search box T.CONTROL_H").toEqual([buttonH, buttonH, buttonH, controlH]);
  expect(inset("rows[8]")[3], "the last row clears the preset buttons and the Take all row: a gap and a button, twice, and a gap").toBe(2 * (gap + buttonH) + gap);
});

it("the panel's two plain lines: the empty-state line is label muted, the preset hint a small muted note that stays inside the panel", () => {
  const addon = mailer("__wfgWorld.mail = {}");
  addon.world.openMailWindow();
  const [gap, , , , , , smallSize, labelSize] = tokens(addon);
  const [empty, hint] = ["empty", "hint"].map((part) => addon.frame(`Vanguard_MailTools.${part}`));
  expect([empty.visible, empty.text, empty.font.size, isTok(addon, empty.textColor, "muted")], "the empty-state tier").toEqual([true, "Your inbox is empty.", labelSize, true]);
  expect([hint.visible, hint.font.size, isTok(addon, hint.textColor, "muted")], "the note tier").toEqual([true, smallSize, true]);
  const inside = insets(addon, "Vanguard_MailTools.hint", "Vanguard_MailTools");
  const [add, note] = [addon.frame("Vanguard_MailTools.addPreset").rect, hint.rect];
  expect([inside[2] >= gap, inside[3] > gap, note.left - add.right, hint.text], "beside + Add, on one line, T.SPACE.gap clear of the side and the button").toEqual([true, true, gap, "No presets yet."]);
});

// TEST-ONLY inbox for Take all and Return all: a sale (money), a letter with two items from Bobalt, a plain letter, a
// pay-on-delivery parcel from Carl, and a game master mail with money. The returned mails are noted in __returned.
const BULK = `
  __returned = {}
  ReturnInboxItem = function(i) __returned[#__returned + 1] = i end
  __wfgWorld.mail[2].itemCount = 2
  __wfgWorld.mail[4] = { sender = "Carl", subject = "Pay me", money = 0, itemCount = 1, cod = 100 }
  __wfgWorld.mail[5] = { sender = "GM", subject = "A gift", money = 700, itemCount = 0, gm = true }
`;
// The mails ReturnInboxItem was asked for, by inbox place.
const returned = (addon) => addon.eval("return __returned");

it("Take all takes the money and items of the shown mail one step at a time, leaving pay-on-delivery mail", () => {
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  addon.slash("mail takeall");
  addon.slash("mail takeall");
  expect(chatHas(addon, /Mail: a run is already going/), "one run at a time").toBe(true);
  expect(taken(addon), "the first step went at once, from the last mail").toEqual([["money", 5]]);
  addon.advance(2);
  expect(taken(addon), "the game master's money, the two items, the sale's money; Carl's parcel left").toEqual([["money", 5], ["item", 2, 1], ["item", 2, 2], ["money", 1]]);
  expect([chatHas(addon, /Take all: 4 of 4 done/), addon.eval("local out = {} for i, m in ipairs(__wfgWorld.mail) do out[i] = m.sender end return out")], "says so; the emptied mails are gone").toEqual([true, ["Mum", "Carl"]]);
  addon.eval("__wfgWorld.mail = {}");
  addon.slash("mail takeall");
  expect(chatHas(addon, /Take all: nothing to do/), "an empty inbox").toBe(true);
});

it("a run stops when the mailbox closes, skips a mail that moved, and the buttons run the same", () => {
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  addon.click("Vanguard_MailTools.takeAll");
  addon.eval("__wfgWorld.mail[2].subject = 'Moved'");
  addon.fire("MAIL_CLOSED");
  addon.advance(2);
  expect(taken(addon), "the first step only: the mailbox closed").toEqual([["money", 5]]);
  expect(chatHas(addon, /Take all: 1 of 4 done/), "and says how far it got").toBe(true);
  const later = mailer(BULK);
  later.world.openMailWindow();
  later.click("Vanguard_MailTools.takeAll");
  later.eval("__wfgWorld.mail[2].subject = 'Moved'");
  later.advance(2);
  expect([taken(later), chatHas(later, /Take all: 2 of 4 done/)], "the moved mail's items are skipped, and not counted").toEqual([[["money", 5], ["money", 1]], true]);
  const bare = mailer(BULK + "C_Timer = nil TakeInboxItem = nil");
  bare.world.openMailWindow();
  bare.slash("mail takeall");
  expect(chatHas(bare, /Take all: 2 of 4 done/), "without timers the steps run at once; a missing call is skipped, and not counted").toBe(true);
});

it("Return all asks, then sends back the shown mail a player can have returned, last first", () => {
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  addon.click("Vanguard_MailTools.returnAll");
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "sales, game master mail and empty letters stay").toBe("Return 2 mail(s) to their senders?");
  expect(returned(addon), "nothing before the answer").toEqual({});
  addon.click("Vanguard_Question.confirm");
  addon.advance(2);
  expect(returned(addon), "Carl's parcel, then Bobalt's letter").toEqual([4, 2]);
  expect(chatHas(addon, /Return all: 2 of 2 done/), "and says so").toBe(true);
  addon.eval("__wfgWorld.mail = { { sender = 'Mum', subject = 'Hello', itemCount = 0 } }");
  addon.slash("mail returnall");
  expect(chatHas(addon, /Return all: nothing to return/), "nothing to return").toBe(true);
});

it("a pay-on-delivery mail shows what it asks in its row, has no Take button, and Take never takes it", () => {
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  expect(rows(addon)[3], "Carl's row says the amount due").toBe("Carl: Pay me (1 item, pay 1s 0c on delivery)");
  expect(addon.eval("local r = Vanguard_MailTools.rows return { r[2].take:IsShown(), r[4].take:IsShown() }"), "no Take button on the parcel").toEqual([true, false]);
  addon.eval("Vanguard_MailTools.rows[4].take:Click()");
  addon.eval(`${MT}.Take(${MT}.Read(4))`);
  expect(taken(addon), "neither the click nor a direct call took it").toEqual({});
  expect(chatHas(addon, /that one asks for payment on delivery/), "and chat says why").toBe(true);
  addon.eval("__wfgWorld.mail[4].money = 50");
  expect(say(addon, "mail carl", /4\. Carl: Pay me \(50c, 1 item, pay 1s 0c on delivery\)/), "/vg mail shows it too").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("Take refuses a row whose mail is no longer at its place, even when the sender and subject match", () => {
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  addon.eval("__wfgWorld.mail[2] = { sender = 'Bobalt', subject = 'Some ore', itemCount = 1, cod = 500 }");
  addon.eval("Vanguard_MailTools.rows[2].take:Click()");
  expect(taken(addon), "a pay-on-delivery mail now stands where the row's free one was").toEqual({});
  expect(chatHas(addon, /that mail has moved/), "chat says so").toBe(true);
  addon.eval("__wfgWorld.mail[2] = nil");
  addon.eval("Vanguard_MailTools.rows[2].take:Click()");
  expect(taken(addon), "an index with nothing at it takes nothing").toEqual({});
});

// What Take all took after the mail at place 2 (two items from Bobalt) was swapped for the mail given, once the first step had gone.
function afterSwap(replacement) {
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  addon.slash("mail takeall");
  addon.eval(`__wfgWorld.mail[2] = ${replacement}`);
  addon.advance(2);
  return taken(addon).filter((t) => t[1] === 2);
}

it("Take all and Return all compare more than the sender and subject before they act on a mail", () => {
  const link = "firstItemLink = '|cffffffff|Hitem:901::::::::60|h[TEST-ONLY Iron Ore]|h|r'";
  const same = `sender = 'Bobalt', subject = 'Some ore', ${link}`;
  expect(afterSwap(`{ ${same}, itemCount = 2 }`), "the same mail rebuilt: taken as before").toEqual([["item", 2, 1], ["item", 2, 2]]);
  expect(afterSwap(`{ ${same}, itemCount = 2, cod = 500 }`), "a pay-on-delivery mail with the same header").toEqual([]);
  expect(afterSwap(`{ ${same}, itemCount = 3 }`), "more items than listed").toEqual([]);
  expect(afterSwap(`{ ${same}, itemCount = 1 }`), "fewer items (one taken by hand): the one left is taken").toEqual([["item", 2, 1]]);
  expect(afterSwap(`{ ${same}, itemCount = 2, money = 9 }`), "different money").toEqual([]);
  expect(afterSwap("{ sender = 'Bobalt', subject = 'Some ore', itemCount = 2, cod = 0 }"), "the first item gone from the header: taken, as a take changes it").toEqual([["item", 2, 1], ["item", 2, 2]]);
  const addon = mailer(BULK);
  addon.world.openMailWindow();
  addon.click("Vanguard_MailTools.returnAll");
  addon.eval("__wfgWorld.mail[4].money = 1");
  addon.click("Vanguard_Question.confirm");
  addon.advance(2);
  expect(returned(addon), "Return all skips the parcel that changed and returns the other").toEqual([2]);
  expect(chatHas(addon, /Return all: 1 of 2 done/), "and counts only the mail it returned").toBe(true);
});

// TEST-ONLY inbox the way the server changes it: a letter from Bobalt with money and three items, and two items
// from Mum. A take empties its slot; an emptied mail leaves the inbox and moves up those after it.
const SERVER = `
  __wfgWorld.mail = {
    { sender = "Bobalt", subject = "Gold and ore", money = 5000, itemCount = 3, firstItemQuantity = 5, firstItemLink = "|cffffffff|Hitem:901::::::::60|h[TEST-ONLY Iron Ore]|h|r" },
    { sender = "Mum", subject = "Herbs", money = 0, itemCount = 2 },
  }
`;
// The senders left in the inbox.
const senders = (addon) => addon.eval("local out = {} for i, m in ipairs(__wfgWorld.mail) do out[i] = m.sender end return out");

it("Take all empties every mail as the inbox changes after each take, and counts what it took", () => {
  const addon = mailer(SERVER);
  addon.world.openMailWindow();
  addon.click("Vanguard_MailTools.takeAll");
  addon.advance(5);
  expect(taken(addon), "Mum's two items, then Bobalt's money and his three items, each from the slot that still holds one").toEqual([["item", 2, 1], ["item", 2, 2], ["money", 1], ["item", 1, 1], ["item", 1, 2], ["item", 1, 3]]);
  expect([chatHas(addon, /Take all: 6 of 6 done\./), senders(addon)], "every step went, and the inbox is empty").toEqual([true, {}]);
});

it("Take all leaves a letter with text in the inbox once it is empty, and waits while the game answers a take", () => {
  const addon = mailer(SERVER + "__wfgWorld.mail[1].letter = true");
  addon.world.openMailWindow();
  addon.click("Vanguard_MailTools.takeAll");
  addon.eval("__wfgWorld.mailPending = true");
  addon.advance(2);
  expect(taken(addon), "the game still busy: one take only").toEqual([["item", 2, 1]]);
  addon.eval("__wfgWorld.mailPending = false");
  addon.advance(5);
  expect([taken(addon).length, chatHas(addon, /Take all: 6 of 6 done\./), senders(addon)], "then the rest; Bobalt's emptied letter stays").toEqual([6, true, ["Bobalt"]]);
});

it("Take all passes a mail whose take the game refuses (bags full), says so, and ends with an honest count", () => {
  const addon = mailer(SERVER + "TakeInboxItem = function(i, n) table.insert(__wfgWorld.taken, { 'item', i, n }) end");
  addon.world.openMailWindow();
  addon.click("Vanguard_MailTools.takeAll");
  addon.advance(5);
  expect(taken(addon), "each item tried once; Bobalt's money still comes in").toEqual([["item", 2, 1], ["money", 1], ["item", 1, 1]]);
  expect([chatHas(addon, /Mail: could not take from Herbs \(bags full\?\)\./), chatHas(addon, /Mail: could not take from Gold and ore \(bags full\?\)\./)], "chat names each mail once").toEqual([true, true]);
  expect([chatHas(addon, /Take all: 1 of 6 done\./), addon.eval(`return ${MT}.running == nil`)], "the run ended, counting only the money").toEqual([true, true]);
});

it("Take on a row takes the first attachment slot that still holds an item", () => {
  const addon = mailer("__wfgWorld.mail[2].slots = { [3] = true }");
  addon.world.openMailWindow();
  addon.eval("Vanguard_MailTools.rows[2].take:Click()");
  expect(taken(addon), "slots 1 and 2 were already taken: slot 3").toEqual([["item", 2, 3]]);
});

it("the Take buttons hold their label in German and French, the mail's line giving up the room", () => {
  for (const locale of ["deDE", "frFR"]) {
    const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE + ON });
    addon.eval(ENV);
    addon.login();
    addon.world.openMailWindow();
    const cut = addon.textFit("Vanguard_MailTools").filter((f) => f.text === (locale === "deDE" ? "Nehmen" : "Prendre"));
    expect(cut, `${locale}: Take is not cut`).toEqual([]);
    const gap = addon.eval("local r = Vanguard_MailTools.rows[1] return r.days:GetRight() <= r.take:GetLeft()");
    expect(gap, `${locale}: the time left ends before Take`).toBe(true);
  }
});

it("the heading's count ends inside the panel in French and German, cut short with an ellipsis (B10-8)", () => {
  for (const locale of ["frFR", "deDE"]) {
    const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE + ON });
    addon.eval(ENV + "__wfgWorld.mail = {} for i = 1, 50 do __wfgWorld.mail[i] = { sender = 'Alt' .. i, subject = 'Gold', money = 100, itemCount = 0 } end __wfgWorld.mailOnServer = 120");
    addon.login();
    addon.world.openMailWindow();
    const [text, inside] = addon.eval("local f = Vanguard_MailTools return { f.count:GetText(), f.count:GetRight() <= f:GetRight() - ns.GetModule('MailTools').PAD }");
    expect(inside, `${locale}: '${text}' ends before the panel's padding`).toBe(true);
    expect(addon.textFit("Vanguard_MailTools").filter((f) => f.text !== text || f.kind !== "cut"), `${locale}: nothing spills or overlaps; the count may end in an ellipsis`).toEqual([]);
  }
});

it("+ Add holds its label in German, Russian and Portuguese in every place along the bottom, and stays inside the panel (P10-9)", () => {
  for (const locale of ["deDE", "ruRU", "ptBR", "frFR", "esES"]) {
    const addon = createAddon({ textFit: true, client: `__wfgWorld.locale = "${locale}"`, savedVariables: SETUP_DONE + ON });
    addon.eval(ENV);
    addon.login();
    addon.world.openMailWindow();
    for (let n = 0; n <= 3; n++) {
      addon.eval(`${MT}.settings.presets = {} for i = 1, ${n} do ${MT}.settings.presets[i] = { name = "TEST-ONLY P" .. i, to = "Bobalt", words = "" } end ${MT}.Paint()`);
      const label = addon.eval("return Vanguard_MailTools.addPreset.text:GetText()");
      expect(addon.textFit("Vanguard_MailTools").filter((f) => f.text === label), `${locale}, ${n} presets: + Add is not cut`).toEqual([]);
      const inside = addon.eval("local f = Vanguard_MailTools return f.addPreset:GetRight() <= f:GetRight() - ns.Theme.SPACE.gap");
      expect(inside, `${locale}, ${n} presets: + Add ends inside the panel's padding`).toBe(true);
    }
  }
});
