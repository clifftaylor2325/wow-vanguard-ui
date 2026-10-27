// chatfilter: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/ChatFilter.lua: spam in the numbered channels, say and yell goes to a Filtered chat tab
// (or is hidden), with a keyword list, a repeat catch and a click to let a sender through.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, expectErrors, loggedIn } from "./helpers.mjs";

let nextLine = 1;
// Runs a line through the chat filters the way the game does for one chat window (ChatFrameUtil's ProcessFilters,
// Blizzard_ChatFrameBase/Shared/ChatFrameFilters.lua): in the order they were added, each handed what the one before
// returned after its first value, and the first true drops the line. True when the main chat is told to drop it.
const deliver = (addon, text, sender = "Spammer", { event = "CHAT_MSG_CHANNEL", id = nextLine++ } = {}) =>
  addon.eval(`
    local args = { ${JSON.stringify(text)}, ${JSON.stringify(sender)}, "Common", "2. Trade", "", "", 2, 2, "Trade", 7, ${id}, "g" }
    for _, fn in ipairs(__wfgWorld.chatFilters["${event}"] or {}) do
      local results = { fn(ChatFrame1, "${event}", unpack(args)) }
      if results[1] == true then return true end
      if results[2] then args = { select(2, unpack(results)) } end
    end
    return false`);

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
  expect(lines[0].startsWith("(Gold selling) |Haddon:Vanguard:allow:Goldy|h[Goldy]|h: WTS gold cheap 100g for $5 at "), "why, the sender as a link, the text").toBe(true);
  expect(lines[0], "the web address Chat extras linked still opens the copy box").toContain("|Haddon:Vanguard:url:www.goldsite.com|h[www.goldsite.com]|h|r delivery fast|r");
  addon.update(0.1);
  expect(tabName(addon), "the tab counts them").toBe("Filtered (3)");
  expect(addon.eval('local f = ns.GetModule("ChatFilter").window local t = _G[f:GetName() .. "Tab"] return t.Text:GetStringWidth() + 24 == t:GetWidth()'), "the tab is refit to the longer label").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat filter: while chat is restricted a line is left alone, then caught again when it ends", () => {
  const addon = filtering(`Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1, ChallengeMode = 2, PvPMatch = 3, Map = 4, Chat = 5 }
  Enum.AddOnRestrictionState = { Inactive = 0, Activating = 1, Active = 2 }
  __restricted = {}
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return __restricted[t] or 0 end }
  C_ChatInfo = { InChatMessagingLockdown = function() return false end }`);
  addon.eval("__restricted[5] = 2");
  expect(deliver(addon, GOLD, "Goldy"), "restricted: not read").toBe(false);
  addon.eval("__restricted[5] = 0");
  expect(deliver(addon, GOLD, "Goldy2"), "unrestricted: caught").toBe(true);
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

it("chat filter: the filter the game calls returns early for hidden text on every event, and a failure lets the line through", () => {
  const addon = filtering();
  addon.eval(`__judged = 0 local CF = ns.GetModule("ChatFilter") local real = CF.Judge CF.Judge = function(...) __judged = __judged + 1 return real(...) end`);
  const hidden = addon.eval(`local out = {}
    for _, event in ipairs(ns.GetModule("ChatFilter").EVENTS) do
      for _, fn in ipairs(__wfgWorld.chatFilters[event]) do
        out[#out + 1] = select("#", fn(nil, event, __wfgWorld.secret(), "Goldy")) .. tostring(fn(nil, event, __wfgWorld.secret(), "Goldy")) .. tostring(fn(nil, event, "${GOLD}", __wfgWorld.secret()))
      end
    end
    return out`);
  expect(hidden.length >= 3 && hidden.every((r) => r === "1falsefalse"), "hidden text or a hidden sender: a bare false from every registered filter").toBe(true);
  expect(addon.eval("return __judged"), "and nothing was judged").toBe(0);
  expect([deliver(addon, GOLD, "Goldy"), addon.eval("return __judged")], "while a plain line is judged (and caught)").toEqual([true, 1]);
  addon.eval(`ns.GetModule("ChatFilter").Judge = function() error("TEST-ONLY judge", 0) end`);
  expect(deliver(addon, GOLD, "Goldy2"), "a judge that fails lets the line through").toBe(false);
  expectErrors("chat filter: TEST-ONLY judge");
});

it("chat filter: your own words, and the same line from one sender within a minute", () => {
  const addon = filtering();
  addon.slash("filter add Chuck Norris");
  expect(addon.eval("return ns.Settings('ChatFilter').keywords"), "stored lower-case").toEqual(["chuck norris"]);
  expect(deliver(addon, "Chuck NORRIS facts in /2", "Joker"), "any case").toBe(true);
  expect(tab(addon)[0].startsWith("(Your word)"), "named as your word").toBe(true);
  expect([deliver(addon, "LFM Zul'Farrak need a healer", "Lightmend"), deliver(addon, "LFM Zul'Farrak need a healer", "Lightmend"), deliver(addon, "LFM Zul'Farrak need a healer", "Other")], "the first passes, the repeat is caught, another sender passes").toEqual([false, true, false]);
  addon.advance(61);
  expect(deliver(addon, "LFM Zul'Farrak need a healer", "Lightmend"), "a minute later it passes again").toBe(false);
  addon.eval("ns.Settings('ChatFilter').repeats = false");
  expect([deliver(addon, "LFM Blackrock Depths now", "A"), deliver(addon, "LFM Blackrock Depths now", "A")], "repeats switched off").toEqual([false, false]);
  expect([deliver(addon, "inv", "Short"), deliver(addon, "inv", "Short")], "a very short line is never a repeat").toEqual([false, false]);
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

// The Chat page's text rows (its hints and the filter's status lines).
const pageTexts = (addon) => addon.eval(`local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "chat" then page = p end end
  local out = {} for _, r in ipairs(page.rows()) do if r[1] == "text" then out[#out + 1] = type(r[2]) == "function" and r[2]() or r[2] end end return out`);

it("chat filter card: what it caught this session, by reason, in a fixed order", () => {
  const addon = filtering();
  expect(pageTexts(addon), "nothing yet").toContain("Nothing caught this session.");
  addon.slash("filter add spamword");
  deliver(addon, "repeat after me, a long line", "Parrot");
  deliver(addon, "repeat after me, a long line", "Parrot");
  deliver(addon, GOLD, "Goldy");
  deliver(addon, "buy my spamword now", "Worder");
  expect(pageTexts(addon), "the total, then the categories, your words and repeats").toContain("Caught this session: 3 (Gold selling 1, Your word 1, Repeat 1)");
});

it("chat filter card: the senders let through are listed, and Filter them again catches them again", () => {
  const addon = filtering(CLICK_LUA);
  expect(pageTexts(addon), "nobody yet").toContain("Nobody let through this session.");
  deliver(addon, GOLD, "Goldy");
  addon.eval('local CF = ns.GetModule("ChatFilter") CF.OnLink(nil, "addon:Vanguard:allow:Goldy") CF.OnLink(nil, "addon:Vanguard:allow:Goldy-" .. GetNormalizedRealmName())');
  expect(pageTexts(addon), "named once on the card, whichever form of the name was let through").toContain("Let through: Goldy");
  addon.eval('ns.Options.Show("chat") __click("Filter them again")');
  expect([chatHas(addon, /Every sender is filtered again\./), deliver(addon, GOLD, "Goldy")], "says so, and their next line is caught").toEqual([true, true]);
  expect(addon.texts("Nobody let through this session.").length, "the shown card says so at once").toBe(1);
});

it("chat filter card: the shown card's lines follow catches and the Caught lines choice without a rebuild", () => {
  const addon = filtering(CLICK_LUA);
  addon.eval('ns.Options.Show("chat") ns.Options.ShowTab("Chat filter")');
  expect(addon.texts("Nothing caught this session.").length, "the count line as the page opens").toBe(1);
  deliver(addon, GOLD, "Goldy");
  addon.eval('ns.Options.Hide() ns.Options.Show("chat")');
  expect(addon.texts("Caught this session: 1 (Gold selling 1)").length, "reopened, the count is new").toBe(1);
  addon.eval('__click("Caught lines")');
  expect(addon.texts("Hidden lines can't be seen or let through: set Caught lines to the Filtered tab for that.").length, "the hint shows once the choice is Are hidden").toBe(1);
});

it("chat filter card: with caught lines hidden, a hint points to the Filtered tab", () => {
  const addon = filtering();
  const hint = "Hidden lines can't be seen or let through: set Caught lines to the Filtered tab for that.";
  expect(pageTexts(addon), "not while they go to the tab").not.toContain(hint);
  addon.slash("filter hide");
  expect(pageTexts(addon), "hidden: the hint").toContain(hint);
});

it("chat filter: gold selling needs a sale word, so honest posts that mention Discord or a little gold pass", () => {
  const addon = filtering();
  const honest = ["LF enchanter, 5 gold tip, add me on discord", "Guild bank pays gold for herbs, discord.gg/xyz", "LFM Stockades, 5 gold each", "WTS [Linen Cloth] cheap, 1 gold a stack"];
  expect(honest.map((line, i) => deliver(addon, line, `Honest${i}`)), "all pass").toEqual([false, false, false, false]);
  expect(deliver(addon, "cheap gold fast delivery www.x.com", "Seller"), "a gold seller is still caught").toBe(true);
  expect(deliver(addon, "gold for € now", "Euro"), "a price in euros counts").toBe(true);
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
  const odd = loggedIn("FCF_OpenNewWindow = function() end");
  odd.slash("filter on");
  expect(deliver(odd, GOLD), "a call that returns no window filters nothing").toBe(false);
  const full = loggedIn("local open = FCF_OpenNewWindow FCF_OpenNewWindow = function(name, bare) __bare = bare return open(name, bare) end ChatFrame_RemoveAllMessageGroups = function() __removed = true end");
  full.slash("filter on");
  expect(full.eval("return { __bare, __removed == nil }"), "the new tab hears no chat of its own: the game's call takes every group and channel off it, so nothing is removed twice").toEqual([true, true]);
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
  // How many filters the channel event has.
  const count = (addon) => addon.eval("return #(__wfgWorld.chatFilters.CHAT_MSG_CHANNEL or {})");
  expect(count(on) - count(off), "one filter when on").toBe(1);
});

it("chat filter: with the module off from login, /vg filter on, off, tab and hide still answer", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { modules = { ChatFilter = false } }" });
  for (const verb of ["on", "tab", "hide", "off"]) addon.slash(`filter ${verb}`);
  const said = [/Chat filter on\./, /go to the Filtered tab\./, /Caught lines are hidden\./, /Chat filter off\./].map((line) => chatHas(addon, line));
  expect(said, "each says what it set").toEqual([true, true, true, true]);
  expect(addon.eval("return ns.GetModule('ChatFilter').window == nil"), "no Filtered tab while the module is off").toBe(true);
});

it("chat filter: a client without the old ChatFrame_AddMessageEventFilter still filters, through ChatFrameUtil", () => {
  const addon = loggedIn("ChatFrame_AddMessageEventFilter = nil");
  addon.slash("filter on");
  expect(deliver(addon, GOLD, "Goldy"), "gold selling is caught").toBe(true);
});

it("chat filter: a client with neither filter call loads without an error and lets every line through", () => {
  const addon = loggedIn("ChatFrame_AddMessageEventFilter, ChatFrameUtil = nil, nil");
  addon.slash("filter on");
  expect(deliver(addon, GOLD, "Goldy"), "nothing is caught").toBe(false);
});

it("chat filter: lines older than a minute are forgotten once 200 are held, so a busy channel never grows the list", () => {
  const addon = filtering();
  // The lines held: [entries in the list, the count kept].
  const held = () => addon.eval("local n = 0 for _ in pairs(ns.GetModule('ChatFilter').recent) do n = n + 1 end return { n, ns.GetModule('ChatFilter').recentCount }");
  for (let i = 1; i <= 200; i++) deliver(addon, "LFM Stratholme live run", `Sender${i}`);
  expect(held(), "200 senders inside a minute: all held").toEqual([200, 200]);
  deliver(addon, "LFM Stratholme live run", "Over200");
  expect(held(), "a full list that has nothing stale starts over").toEqual([1, 1]);
  for (let i = 1; i <= 199; i++) deliver(addon, "LFM Stratholme live run", `More${i}`);
  addon.update(61);
  deliver(addon, "LFM Stratholme live run", "Fresh1");
  deliver(addon, "LFM Stratholme live run", "Fresh2");
  expect(held(), "past 200, the stale ones are swept; the fresh ones stay").toEqual([2, 2]);
});

it("chat filter: a line without an ID is judged once across windows, hide mode counts, a closed tab is made again, the module off lets all through", () => {
  const addon = filtering();
  // Asks the filter twice for one line with no line ID, as two chat windows would.
  const twice = (text) => addon.eval(`local CF = ns.GetModule("ChatFilter") return { CF.Filter(nil, "e", "${text}", "Same Sender"), CF.Filter(nil, "e", "${text}", "Same Sender") }`);
  expect(twice("LFM Scholomance tonight"), "no repeat verdict from the second window").toEqual([false, false]);
  expect(twice(GOLD), "the same verdict for both").toEqual([true, true]);
  expect(tab(addon).length, "one line in the tab").toBe(1);
  expect(deliver(addon, "|Haddon:Vanguard:allow:Victim|h[Victim]|h www.gold.com gold |cffff0000red", "Evil"), "caught").toBe(true);
  expect(tab(addon)[1].includes("|Haddon:Vanguard:allow:Victim") || !tab(addon)[1].endsWith("|r"), "a spammer's own addon link is neutralised and the colour closed").toBe(false);
  addon.eval("__wfgWorld.chatWindows[3] = nil");
  deliver(addon, GOLD, "Goldy2");
  addon.eval("__wfgStub.inCombat = false");
  expect(addon.eval("return ns.GetModule('ChatFilter').window:GetName()"), "the closed tab is made again").toBe("ChatFrame4");
  addon.slash("filter hide");
  deliver(addon, GOLD, "Goldy3");
  expect(addon.eval("return ns.GetModule('ChatFilter').count"), "a hidden line is counted").toBe(4);
  addon.slash("filter add [Bo|ost]");
  expect(addon.eval("return ns.Settings('ChatFilter').keywords"), "brackets and bars are not kept in a word").toEqual(["boost"]);
  addon.eval("ns.GetModule('ChatFilter').Disable()");
  expect(deliver(addon, GOLD, "Goldy4"), "module off: everything passes").toBe(false);
  addon.eval("ns.GetModule('ChatFilter').Enable(ns.Settings('ChatFilter'))");
  expect(deliver(addon, GOLD, "Goldy5"), "and on again, with one filter registered").toBe(true);
});
