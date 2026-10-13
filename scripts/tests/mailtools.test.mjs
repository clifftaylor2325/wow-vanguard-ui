// mailtools: the mail tools (Modules/MailTools.lua): off until switched on; the panel beside the
// mail window that searches and filters the inbox, Take, and the send-to-alt presets, at the
// TEST-ONLY mail window of the headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

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
  addon.eval("Vanguard_MailTools.rows[2].take:Click()");
  expect(taken(addon), "money, then the item").toEqual([["money", 1], ["item", 2, 1]]);
  expect(addon.eval("return Vanguard_MailTools.rows[3].take:IsShown()"), "nothing to take: no button").toBe(false);
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

it("the options have the switch", () => {
  const addon = mailer();
  addon.eval('ns.Options.Show("town")');
  expect(addon.find("^Search the inbox and send%-to%-alt presets").text, "under Town and gear").toMatch(/^Search the inbox/);
  addon.eval("ns.Settings('MailTools').on = false");
  addon.eval(`${MT}.Paint()`);
  expect(addon.eval("return Vanguard_MailTools == nil"), "off before any mailbox: no panel").toBe(true);
});
