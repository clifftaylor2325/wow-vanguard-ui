// chatfilter: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/ChatFilter.lua: spam in the numbered channels, say and yell goes to a Filtered chat tab
// (or is hidden), with a keyword list, a repeat catch and a click to let a sender through.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn } from "./helpers.mjs";

let nextLine = 1;
// Runs a line through the chat filters the way the game does (once per chat window); true when the main chat is told to drop it.
const deliver = (addon, text, sender = "Spammer", { event = "CHAT_MSG_CHANNEL", id = nextLine++ } = {}) =>
  addon.eval(`
    local dropped = false
    for _, fn in ipairs(__wfgWorld.chatFilters["${event}"] or {}) do
      if fn(ChatFrame1, "${event}", ${JSON.stringify(text)}, ${JSON.stringify(sender)}, "Common", "2. Trade", "", "", 2, 2, "Trade", 7, ${id}, "g") == true then dropped = true end
    end
    return dropped`);

// The Filtered tab's lines and the tab's own text.
const tab = (addon) => addon.eval("local f = ns.GetModule('ChatFilter').window return f and f.__messages or {}");
const tabName = (addon) => addon.eval("local f = ns.GetModule('ChatFilter').window return f and _G[f:GetName() .. 'Tab']:GetText()");

const GOLD = "WTS gold cheap 100g for $5 at www.goldsite.com delivery fast";

// A logged-in addon with the filter on.
const filtering = (extra = "") => {
  const addon = loggedIn(extra);
  addon.slash("filter on");
  return addon;
};

it("chat filter: off until switched on; on makes the Filtered tab and catches gold selling, boosting and recruiting", () => {
  const addon = loggedIn();
  expect([deliver(addon, GOLD), addon.eval("return ns.GetModule('ChatFilter').window == nil")], "off: nothing is caught, no tab").toEqual([false, true]);
  addon.slash("filter on");
  expect(chatHas(addon, /Chat filter on\./), "says so").toBe(true);
  expect(deliver(addon, GOLD, "Goldy"), "gold selling is caught").toBe(true);
  expect(deliver(addon, "WTS boost UBRS cheap, whisper me", "Booster"), "boosting is caught").toBe(true);
  expect(deliver(addon, "<Fun Guild> is recruiting new members, casual raid team", "Recruiter"), "recruiting is caught").toBe(true);
  expect(deliver(addon, "LFM Deadmines need a healer", "Lightmend"), "a normal line passes").toBe(false);
  expect(deliver(addon, "anyone selling linen cloth?", "Buyer"), "gold words alone do not trip it").toBe(false);
  const lines = tab(addon);
  expect(lines.length, "three lines in the tab").toBe(3);
  expect(lines[0], "why, the sender as a link, the text").toBe(`(Gold selling) |Haddon:Vanguard:allow:Goldy|h[Goldy]|h: ${GOLD}`);
  addon.update(0.1);
  expect(tabName(addon), "the tab counts them").toBe("Filtered (3)");
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat filter: the same window is found again, not made twice; say and yell are filtered, whispers and guild are not", () => {
  const addon = filtering();
  addon.fire("PLAYER_ENTERING_WORLD");
  addon.eval("ns.GetModule('ChatFilter').window = nil ns.GetModule('ChatFilter').Prepare()");
  expect(addon.eval("return ns.GetModule('ChatFilter').window:GetName()"), "found by its name").toBe("ChatFrame3");
  expect(deliver(addon, GOLD, "Yeller", { event: "CHAT_MSG_YELL" }), "yell").toBe(true);
  expect(deliver(addon, GOLD, "Sayer", { event: "CHAT_MSG_SAY" }), "say").toBe(true);
  expect(addon.eval("local n = 0 for _, e in ipairs({ 'CHAT_MSG_WHISPER', 'CHAT_MSG_GUILD', 'CHAT_MSG_PARTY', 'CHAT_MSG_RAID' }) do n = n + #(__wfgWorld.chatFilters[e] or {}) end local CF = ns.GetModule('ChatFilter') for _, fn in ipairs(__wfgWorld.chatFilters.CHAT_MSG_WHISPER or {}) do assert(fn ~= CF.Filter) end return n >= 0"), "the filter listens to no other event").toBe(true);
});

it("chat filter: one line is judged once however many windows ask; your own lines and secret text pass", () => {
  const addon = filtering();
  expect([deliver(addon, GOLD, "Goldy", { id: 900 }), deliver(addon, GOLD, "Goldy", { id: 900 })], "the second window gets the same verdict").toEqual([true, true]);
  expect(tab(addon).length, "one line in the tab").toBe(1);
  expect(deliver(addon, GOLD, "Tester"), "your own line is never caught").toBe(false);
  const secretText = addon.eval(`local CF = ns.GetModule("ChatFilter") return CF.Filter(nil, "CHAT_MSG_CHANNEL", __wfgWorld.secret(), "Goldy", "", "", "", "", 0, 0, "", 0, 901)`);
  const secretSender = addon.eval(`local CF = ns.GetModule("ChatFilter") return CF.Filter(nil, "CHAT_MSG_CHANNEL", "${GOLD}", __wfgWorld.secret())`);
  const noText = addon.eval(`local CF = ns.GetModule("ChatFilter") return CF.Filter(nil, "CHAT_MSG_CHANNEL", nil, "Goldy")`);
  expect([secretText, secretSender, noText, tab(addon).length, addon.eval("return #ns.errors")], "hidden or missing text passes unread, no errors").toEqual([false, false, false, 1, 0]);
});

it("chat filter: your own words, and the same line from one sender within a minute", () => {
  const addon = filtering();
  addon.slash("filter add Chuck Norris");
  expect(addon.eval("return ns.Settings('ChatFilter').keywords"), "stored lower-case").toEqual(["chuck norris"]);
  expect(deliver(addon, "Chuck NORRIS facts in /2", "Joker"), "any case").toBe(true);
  expect(tab(addon)[0].startsWith("(Your word)"), "named as your word").toBe(true);
  expect([deliver(addon, "LFM ZF", "Lightmend"), deliver(addon, "LFM ZF", "Lightmend"), deliver(addon, "LFM ZF", "Other")], "the first passes, the repeat is caught, another sender passes").toEqual([false, true, false]);
  addon.advance(61);
  expect(deliver(addon, "LFM ZF", "Lightmend"), "a minute later it passes again").toBe(false);
  addon.eval("ns.Settings('ChatFilter').repeats = false");
  expect([deliver(addon, "LFM BRD", "A"), deliver(addon, "LFM BRD", "A")], "repeats switched off").toEqual([false, false]);
  addon.eval("ns.Settings('ChatFilter').gold = false");
  expect(deliver(addon, GOLD, "Goldy"), "a category switched off").toBe(false);
});

it("chat filter: clicking a sender's name lets them through for the session", () => {
  const addon = filtering();
  deliver(addon, GOLD, "Goldy");
  addon.eval(`__wfgWorld.callbacks.SetItemRef = __wfgWorld.callbacks.SetItemRef or {} EventRegistry:TriggerEvent("SetItemRef", "item:1234", "x"); EventRegistry:TriggerEvent("SetItemRef", "addon:Vanguard:allow:Goldy", "[Goldy]")`);
  addon.eval(`local CF = ns.GetModule("ChatFilter") CF.OnLink(CF, 5)`);
  expect(chatHas(addon, /Goldy's lines show in chat again until you log out\./), "says so").toBe(true);
  expect(deliver(addon, GOLD, "Goldy"), "their next line stays in the chat").toBe(false);
});

it("chat filter: hide mode drops lines without a tab; with no tab possible nothing is lost", () => {
  const addon = loggedIn();
  addon.slash("filter hide");
  addon.slash("filter on");
  expect([deliver(addon, GOLD), addon.eval("return ns.GetModule('ChatFilter').window == nil")], "hidden, no tab made").toEqual([true, true]);
  expect(chatHas(addon, /Caught lines are hidden\./), "says so").toBe(true);
  const bare = loggedIn("FCF_OpenNewWindow = nil");
  bare.slash("filter on");
  expect(deliver(bare, GOLD), "a client that can't make the tab filters nothing").toBe(false);
  const odd = loggedIn("FCF_OpenNewWindow = function() end ChatFrame_RemoveAllMessageGroups = function() end ChatFrame_RemoveAllChannels = function() end");
  odd.slash("filter on");
  expect(deliver(odd, GOLD), "a call that returns no window filters nothing").toBe(false);
  const full = loggedIn("ChatFrame_RemoveAllMessageGroups = function(f) __groups = f:GetName() end ChatFrame_RemoveAllChannels = function(f) __channels = f:GetName() end");
  full.slash("filter on");
  expect(full.eval("return { __groups, __channels }"), "the new tab hears no chat of its own").toEqual(["ChatFrame3", "ChatFrame3"]);
});

it("chat filter: the filter waits for the end of a fight to make the tab; no GetChatWindowInfo means a new tab each time is not tried", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true");
  addon.slash("filter on");
  expect(addon.eval("return ns.GetModule('ChatFilter').window == nil"), "not made in combat").toBe(true);
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return ns.GetModule('ChatFilter').window ~= nil"), "made when the fight ends").toBe(true);
  const noInfo = loggedIn("GetChatWindowInfo = nil");
  noInfo.slash("filter on");
  expect(noInfo.eval("return ns.GetModule('ChatFilter').FindWindow()"), "no way to look for the tab").toBe(null);
});

it("chat filter: the /vg filter command and the keyword limits", () => {
  const addon = loggedIn();
  addon.slash("filter");
  expect(chatHas(addon, /Chat filter is off; caught lines go to the Filtered tab; 0 caught this session\./), "status").toBe(true);
  addon.slash("filter add");
  expect(chatHas(addon, /Type a word to filter\./), "empty").toBe(true);
  addon.slash(`filter add ${"x".repeat(41)}`);
  expect(chatHas(addon, /at most 40 characters/), "too long").toBe(true);
  addon.slash("filter add alpha");
  addon.slash("filter add ALPHA");
  expect(chatHas(addon, /Already filtering "alpha"\./), "no duplicates").toBe(true);
  addon.slash("filter");
  expect(chatHas(addon, /Your words: alpha/), "the words are listed").toBe(true);
  for (let i = 0; i < 30; i++) addon.slash(`filter add w${i}`);
  expect(chatHas(addon, /at most 30 words/), "limit").toBe(true);
  addon.slash("filter remove alpha");
  addon.slash("filter remove alpha");
  expect([chatHas(addon, /No longer filtering "alpha"\./), chatHas(addon, /Not filtering "alpha"\./)], "remove").toEqual([true, true]);
  addon.slash("filter clear");
  addon.slash("filter bogus");
  addon.slash("filter off");
  expect([addon.eval("return #ns.Settings('ChatFilter').keywords"), chatHas(addon, /no words now/), chatHas(addon, /Usage: \/vg filter/), chatHas(addon, /Chat filter off\./)], "clear, usage, off").toEqual([0, true, true, true]);
  addon.slash("filter tab");
  expect(chatHas(addon, /go to the Filtered tab\./), "tab says so").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat filter: the options page switches it on and adds and removes a word", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  addon.eval('__click("Filter chat")');
  expect([addon.eval("return ns.Settings('ChatFilter').on"), addon.eval("return ns.GetModule('ChatFilter').window ~= nil")], "the switch turns it on and makes the tab").toEqual([true, true]);
  addon.eval('ns.GetModule("ChatFilter").AddFromDialog("spam")');
  addon.eval('ns.Options.Show("chat")');
  addon.eval('__click("Remove: spam")');
  expect(addon.eval("return #ns.Settings('ChatFilter').keywords"), "added, then removed from its button").toBe(0);
  addon.eval("local CF = ns.GetModule('ChatFilter') CF.settings = nil CF.Changed()");
});

it("chat filter: the module off registers no filter", () => {
  const off = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { modules = { ChatFilter = false } }" });
  const on = loggedIn();
  const count = (addon) => addon.eval("return #(__wfgWorld.chatFilters.CHAT_MSG_CHANNEL or {})");
  expect(count(on) - count(off), "one filter when on").toBe(1);
});
