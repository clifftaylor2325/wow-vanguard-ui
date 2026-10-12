// chatwatch: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/ChatWatch.lua: phrases watched for in chat ring the whisper sound and
// show a toast you click to whisper the sender.

import { expect, it } from "vitest";
import { CLICK_LUA, isTok, loggedIn } from "./helpers.mjs";

// TEST-ONLY sound kit and the game's whisper call, recorded.
const WATCH_ENV = `
  SOUNDKIT = { TELL_MESSAGE = 3081 }
  __tells = {}
  ChatFrameUtil = { SendTell = function(name) table.insert(__tells, name) end }
`;

// An addon watching for "lfm" (and any other phrases given).
function watching(...phrases) {
  const addon = loggedIn(WATCH_ENV + CLICK_LUA);
  for (const p of ["LFM", ...phrases]) addon.slash(`watch add ${p}`);
  return addon;
}

let nextLine = 1;
// A chat line as the client sends it: the event, text, sender, then the payload with a fresh line ID (or the one given).
const say = (addon, event, text, sender, lineID = nextLine++) =>
  addon.fire(`CHAT_MSG_${event}`, text, sender, "Common", "2. Trade - City", "", "", 2, 2, "Trade - City", 7, lineID, "Player-1-0001");

// TEST-ONLY Lua for say() when the text or sender must be a secret: fires straight from Lua.
const sayLua = (addon, text, sender) => addon.eval(`__wfgStub.fire("CHAT_MSG_CHANNEL", ${text}, ${sender}, "Common", "2. Trade", "", "", 2, 2, "Trade", 7, ${nextLine++}, "g")`);

// How many alert sounds have played.
const rings = (addon) => addon.eval("local n = 0 for _, s in ipairs(__wfgWorld.sounds) do if s == 3081 then n = n + 1 end end return n");

// The toast: shown, sender, line.
const toast = (addon) => addon.eval("local f = Vanguard_ChatWatchToast return { f:IsShown(), f.sender:GetText(), f.line:GetText() }");

it("chat watch: a watched phrase in Trade rings the whisper sound and shows a toast with the sender", () => {
  const addon = watching();
  expect(addon.eval("return ns.Settings('ChatWatch').phrases"), "stored lower-case").toEqual(["lfm"]);
  say(addon, "CHANNEL", "LFM Deadmines need a healer", "Lightmend");
  expect(rings(addon), "the whisper sound (3081)").toBe(1);
  expect(toast(addon), "the toast, with the sender and the line").toEqual([true, "Lightmend", "LFM Deadmines need a healer"]);
  expect(isTok(addon, addon.eval("return Vanguard_ChatWatchToast.sender.__textColor"), "accentText"), "the sender in the accent's text colour").toBe(true);
  addon.advance(8.5);
  expect(toast(addon)[0], "gone after 8 s").toBe(false);
});

it("chat watch: matching ignores case and links' codes; unticked channels are not watched", () => {
  const addon = watching("WTS Devilsaur");
  say(addon, "YELL", "lfm zf", "Tankadin");
  expect(rings(addon), "yell is watched by default, any case").toBe(1);
  say(addon, "SAY", "LFM ST", "Someone");
  say(addon, "GUILD", "LFM BRD", "Guildie");
  expect(rings(addon), "say and guild are off by default").toBe(1);
  addon.advance(3);
  say(addon, "CHANNEL", "WTS |cff1eff00|Hitem:15062::::::::60:::::|h[Devilsaur Leggings]|h|r cheap", "Seller");
  expect([rings(addon), toast(addon)[1]], "a phrase running into a link's name").toEqual([2, "Seller"]);
  addon.eval('local get, set = ns.GetModule("ChatWatch").ChannelSetting("party", "raid") set(true)');
  addon.advance(3);
  say(addon, "RAID_LEADER", "LFM after this", "Leader");
  expect([rings(addon), addon.eval("return ns.Settings('ChatWatch').channels.raid")], "Party and raid switches both").toEqual([3, true]);
  addon.advance(3);
  say(addon, "WHISPER", "lfm?", "Friend");
  expect(rings(addon), "whispers are off by default").toBe(3);
});

it("chat watch: hidden chat (dungeons, raids, encounters) is skipped without an error", () => {
  const addon = watching();
  sayLua(addon, "__wfgWorld.secret()", '"Lightmend"');
  sayLua(addon, '"LFM"', "__wfgWorld.secret()");
  sayLua(addon, "nil", '"Lightmend"');
  expect([rings(addon), toast(addon)[0], addon.eval("return #ns.errors")], "no sound, no toast, no errors").toEqual([0, false, 0]);
});

it("chat watch: one alert per line, and per sender and phrase every 30 s", () => {
  const addon = watching("wts");
  say(addon, "CHANNEL", "LFM UBRS", "Lightmend", 500);
  say(addon, "CHANNEL", "LFM UBRS", "Lightmend", 500);
  expect(rings(addon), "the same line (by its ID) rings once").toBe(1);
  addon.advance(3);
  say(addon, "CHANNEL", "LFM UBRS still", "Lightmend");
  expect(rings(addon), "the same sender and phrase stays quiet for 30 s").toBe(1);
  say(addon, "CHANNEL", "WTS potions", "Lightmend");
  say(addon, "CHANNEL", "LFM MC", "Raidlead");
  expect([rings(addon), toast(addon)[1]], "another phrase or sender rings, at most once every 2 s; the toast shows the newest").toEqual([2, "Raidlead"]);
  addon.advance(31);
  say(addon, "CHANNEL", "LFM UBRS last call", "Lightmend");
  expect(rings(addon), "released after 30 s").toBe(3);
  addon.eval("local CW = ns.GetModule('ChatWatch') CW.MAX_LINES = 2 CW.lines, CW.lineCount = {}, 0");
  say(addon, "CHANNEL", "nothing", "A", 1);
  say(addon, "CHANNEL", "nothing", "A", 2);
  say(addon, "CHANNEL", "nothing", "A", 3);
  expect(addon.eval("local CW = ns.GetModule('ChatWatch') return { CW.lineCount, CW.lines[3] == true, CW.lines[1] == nil }"), "the seen lines start over past the cap").toEqual([1, true, true]);
});

it("chat watch: your own lines don't ring; clicking the toast whispers the sender", () => {
  const addon = watching();
  say(addon, "CHANNEL", "LFM DM", "Tester");
  say(addon, "CHANNEL", "LFM DM", "Tester-ForeverTest");
  expect(rings(addon), "your own lines, with or without your realm").toBe(0);
  say(addon, "CHANNEL", "LFM DM", "Lightmend-Realm");
  addon.click("Vanguard_ChatWatchToast");
  expect([addon.eval("return __tells"), toast(addon)[0]], "a click whispers the sender and puts the toast away").toEqual([["Lightmend-Realm"], false]);
  say(addon, "CHANNEL", "LFM SM", "Other");
  addon.click("Vanguard_ChatWatchToast", "RightButton");
  expect([addon.eval("return #__tells"), toast(addon)[0]], "a right-click only dismisses").toEqual([1, false]);
  addon.eval("ChatFrameUtil = nil ChatFrame_SendTell = function(name) table.insert(__tells, 'old:' .. name) end ns.GetModule('ChatWatch').Whisper('Lightmend')");
  addon.eval("ChatFrame_SendTell = nil ns.GetModule('ChatWatch').Whisper('Lightmend')");
  expect(addon.eval("return __tells"), "the older whisper call, or nothing without one").toEqual(["Lightmend-Realm", "old:Lightmend"]);
  addon.eval("__wfgWorld.units.player.name = __wfgWorld.secret()");
  addon.advance(3);
  say(addon, "CHANNEL", "LFM RFC", "Tester");
  expect(rings(addon), "a hidden own name: the line counts").toBe(2);
});

it("chat watch: the sound and the toast can each be switched off", () => {
  const addon = watching();
  addon.eval("ns.Settings('ChatWatch').sound = false");
  say(addon, "CHANNEL", "LFM", "A");
  expect([rings(addon), toast(addon)[0]], "toast without sound").toEqual([0, true]);
  addon.eval("ns.Settings('ChatWatch').sound = true ns.Settings('ChatWatch').toast = false ns.GetModule('ChatWatch').HideToast()");
  say(addon, "CHANNEL", "LFM", "B");
  expect([rings(addon), toast(addon)[0]], "sound without toast").toEqual([1, false]);
});

it("chat watch: /vg watch adds, lists, removes and clears; at most 20 phrases of 40 characters", () => {
  const addon = watching();
  // The last chat line.
  const last = () => addon.chat().at(-1);
  addon.slash("watch lfm");
  expect(last(), "an unknown verb: the usage").toMatch(/Usage: \/vg watch/);
  addon.slash("watch add lfm");
  expect(last(), "a phrase already watched").toMatch(/Already watching for "lfm"/);
  addon.slash("watch add   ");
  expect(last(), "nothing typed").toMatch(/Type a phrase/);
  addon.slash(`watch add ${"x".repeat(41)}`);
  expect(last(), "too long").toMatch(/at most 40 characters/);
  for (let i = 2; i <= 20; i++) addon.slash(`watch add phrase ${i}`);
  addon.slash("watch add one too many");
  expect([last(), addon.eval("return #ns.Settings('ChatWatch').phrases")], "the 21st is refused").toEqual([expect.stringMatching(/at most 20 phrases/), 20]);
  addon.slash("watch list");
  expect(last(), "the list").toMatch(/Watching chat for: lfm, phrase 2, .*phrase 20$/);
  addon.slash("watch remove LFM");
  expect(last(), "removed, any case").toMatch(/No longer watching for "lfm"/);
  addon.slash("watch remove lfm");
  expect(last(), "not there").toMatch(/Not watching for "lfm"/);
  addon.slash("watch clear");
  addon.slash("watch");
  expect(last(), "cleared: none").toMatch(/Chat watch has no phrases\. \/vg watch add/);
});

it("chat watch: the options add a phrase from a dialog, list a Remove button per phrase, and switch channels", () => {
  const addon = watching();
  addon.eval('ns.Options.Show("more")');
  expect(addon.find("^Remove: lfm$").text, "a Remove button for the phrase").toBe("Remove: lfm");
  addon.eval('__click("Add a phrase")');
  expect(addon.frame("Vanguard_TextDialog").visible, "Add a phrase asks for it").toBe(true);
  addon.type("Vanguard_TextEdit", "  WTS Arcanite ");
  addon.click("Vanguard_TextDialog.primary");
  expect([addon.frame("Vanguard_TextDialog").visible, addon.find("^Remove: wts arcanite$").text], "added: the dialog closes and the page lists it").toEqual([false, "Remove: wts arcanite"]);
  addon.eval('__click("Add a phrase")');
  addon.type("Vanguard_TextEdit", "lfm");
  addon.click("Vanguard_TextDialog.primary");
  expect(addon.frame("Vanguard_TextDialog").visible, "refused: the dialog stays").toBe(true);
  addon.eval('__click("Remove: lfm")');
  expect(addon.eval("return ns.Settings('ChatWatch').phrases"), "Remove takes it off").toEqual(["wts arcanite"]);
  addon.eval('__click("Party and raid")');
  addon.eval('__click("Say")');
  addon.eval('__click("Sound")');
  const s = addon.eval("local s = ns.Settings('ChatWatch') return { s.channels.party, s.channels.raid, s.channels.say, s.sound }");
  expect(s, "the switches set the profile").toEqual([true, true, true, false]);
});

it("chat watch: no chat filter is added, and the module off listens to nothing", () => {
  const on = watching();
  const off = loggedIn(WATCH_ENV, { savedVariables: "VanguardDB.profiles.Default = { modules = { ChatWatch = false } }" });
  // How many chat filters are registered for the chat events Chat watch reads.
  const filters = (addon) => addon.eval("local n = 0 for event in pairs(ns.GetModule('ChatWatch').EVENTS) do n = n + #(__wfgWorld.chatFilters[event] or {}) end return n");
  expect(filters(on), "the same filters as without Chat watch").toBe(filters(off));
  off.slash("watch add lfm");
  say(off, "CHANNEL", "LFM", "Lightmend");
  expect([rings(off), off.eval("return Vanguard_ChatWatchToast == nil")], "off: nothing rings, no toast is built").toEqual([0, true]);
});

// A WTS line linking Strange Dust (no auction price) and then Linen Cloth (12s 50c on this realm and faction).
const WTS_LINE = "WTS |cffffffff|Hitem:10940::::|h[Strange Dust]|h|r and |cffffffff|Hitem:2589::::|h[Linen Cloth]|h|r";

// The toast's price text, its color, and the right edges of the line, the price and the toast.
const priceLook = (addon) => {
  const [toastRect, line, price] = ["Vanguard_ChatWatchToast", "Vanguard_ChatWatchToast.line", "Vanguard_ChatWatchToast.price"].map((r) => addon.frame(r));
  // An empty price is 0 wide, so it has no rect (as in the client): its edges are then undefined.
  return { text: price.text, color: price.textColor, lineRight: line.rect.right, priceLeft: price.rect?.left, priceRight: price.rect?.right, toastRight: toastRect.rect.right };
};

it("chat watch: a line linking an item with an auction price shows it beside the line, the line untouched", () => {
  const addon = watching("wts");
  addon.eval("ns.AuctionPrices.Record(2589, 1250, 1790000000)");
  say(addon, "CHANNEL", WTS_LINE, "Seller");
  const look = priceLook(addon);
  expect([look.text, isTok(addon, look.color, "gold"), toast(addon)[2]], "the first linked item with a price; the line as it was sent").toEqual(["AH 12s 50c", true, WTS_LINE]);
  expect([look.priceRight, look.lineRight], "the price at the toast's edge, the line ending 6 px before it").toEqual([look.toastRight - 8, look.priceLeft - 6]);
  say(addon, "CHANNEL", "WTS |cffffffff|Hitem:10940::::|h[Strange Dust]|h|r cheap", "Other");
  const plain = priceLook(addon);
  expect([plain.text, plain.lineRight], "no priced item: no price, the line to the toast's edge again").toEqual(["", plain.toastRight - 8]);
  addon.eval('ns.Options.Show("more")');
  addon.eval('__click("Auction price of a linked item")');
  say(addon, "CHANNEL", WTS_LINE, "Third");
  expect([priceLook(addon).text, addon.eval("return ns.Settings('ChatWatch').prices")], "switched off in the Chat watch options").toEqual(["", false]);
  addon.eval("ns.Settings('ChatWatch').prices = true");
  expect(addon.eval(`local CW = ns.GetModule("ChatWatch") return { CW.PriceText(__wfgWorld.secret()) == nil, CW.PriceText("item:2589 [Linen Cloth]") == nil, CW.PriceText("${WTS_LINE.replace(/"/g, '\\"')}") }`), "a hidden line is never read; text without a link has no price").toEqual([true, true, "AH 12s 50c"]);
  addon.eval("__wfgWorld.units.player.faction = 'Horde'");
  expect(addon.eval(`return ns.GetModule("ChatWatch").PriceText("${WTS_LINE}") == nil`), "the other faction's house has no price for it").toBe(true);
});

it("chat watch: another module's alert uses the same toast and sound, even with Chat watch off; its click runs its own action", () => {
  const off = loggedIn(WATCH_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { ChatWatch = false } } }" });
  // Rings an alert from another module (TEST-ONLY), counting the clicks it hears of in __ran.
  const notify = (addon) => addon.eval('__ran = __ran or 0 ns.GetModule("ChatWatch").Notify("TEST-ONLY Title", "TEST-ONLY line", "1g", function() __ran = __ran + 1 end)');
  expect(off.frame("Vanguard_ChatWatchToast"), "Chat watch off: no toast yet").toBe(null);
  notify(off);
  expect([toast(off), off.eval("return Vanguard_ChatWatchToast.price:GetText()"), rings(off)], "the toast is made for it, with the sound").toEqual([[true, "TEST-ONLY Title", "TEST-ONLY line"], "1g", 1]);
  notify(off);
  expect(rings(off), "at most one sound every 2 seconds").toBe(1);
  off.click("Vanguard_ChatWatchToast");
  expect([off.eval("return __ran"), off.eval("return #__tells"), toast(off)[0]], "a click runs its action, whispers no one, and puts it away").toEqual([1, 0, false]);
  notify(off);
  off.click("Vanguard_ChatWatchToast", "RightButton");
  expect([off.eval("return __ran"), toast(off)[0]], "right-click only puts it away").toEqual([1, false]);
  const on = watching();
  notify(on);
  say(on, "CHANNEL", "LFM Deadmines", "Lightmend");
  on.click("Vanguard_ChatWatchToast");
  expect([on.eval("return __ran"), on.eval("return __tells")], "a chat line's toast after it whispers the sender, not the alert's action").toEqual([0, ["Lightmend"]]);
});

it("chat watch: two-part names: your realm is left off the toast, a click whispers the full name, a namesake elsewhere rings", () => {
  const addon = watching();
  say(addon, "CHANNEL", "LFM DM", "Lightmend-ForeverTest");
  expect(toast(addon)[1], "someone on your realm, without it").toBe("Lightmend");
  addon.click("Vanguard_ChatWatchToast");
  expect(addon.eval("return __tells"), "the whisper keeps the full name").toEqual(["Lightmend-ForeverTest"]);
  addon.advance(3);
  say(addon, "CHANNEL", "LFM DM", "Tester-OtherRealm");
  expect([rings(addon), toast(addon)[1]], "your name on another realm is someone else, shown with their realm").toEqual([2, "Tester-OtherRealm"]);
});
