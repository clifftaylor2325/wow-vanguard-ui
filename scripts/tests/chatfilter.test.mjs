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
  const others = ["CHAT_MSG_WHISPER", "CHAT_MSG_GUILD", "CHAT_MSG_PARTY", "CHAT_MSG_RAID"];
  expect(others.map((event) => deliver(addon, GOLD, "Goldy", { event })), "the same gold line is let through on every other event").toEqual([false, false, false, false]);
  const off = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { modules = { ChatFilter = false } }" });
  // How many filters the four events have in all.
  const count = (client) => client.eval(`local n = 0 for _, e in ipairs({ "${others.join('", "')}" }) do n = n + #(__wfgWorld.chatFilters[e] or {}) end return n`);
  expect(count(addon) - count(off), "the filter listens to no other event").toBe(0);
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

it("chat filter: your own words match in any case for Cyrillic and accented letters", () => {
  const addon = filtering();
  addon.slash("filter add Продам");
  expect(addon.eval("return ns.Settings('ChatFilter').keywords"), "stored in small letters").toEqual(["продам"]);
  expect(deliver(addon, "ПРОДАМ золото дёшево", "Seller"), "a line in capitals is caught").toBe(true);
  addon.eval("table.insert(ns.Settings('ChatFilter').keywords, 'ÄRGER')");
  expect(deliver(addon, "viel ärger heute", "Old"), "a word saved in capitals by an older version still matches").toBe(true);
  addon.slash("filter add ärger");
  expect(addon.eval("return #ns.Settings('ChatFilter').keywords"), "and adding it again in small letters is refused as a duplicate").toBe(2);
});

it("chat filter: the repeat rule's shortest line counts letters, so a short Chinese line said twice passes", () => {
  const addon = filtering();
  expect([deliver(addon, "组队打本", "Short"), deliver(addon, "组队打本", "Short")], "4 letters (12 bytes) are never a repeat").toEqual([false, false]);
  const line = "组队打本缺一个治疗速度来吧";
  expect([deliver(addon, line, "Long"), deliver(addon, line, "Long")], "13 letters said twice is a repeat").toEqual([false, true]);
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

it("chat filter: a closed Filtered tab is made again on the next caught line, and kept from then on", () => {
  const addon = filtering();
  deliver(addon, GOLD, "Goldy");
  addon.eval("ChatFrame3:Hide()");
  expect(deliver(addon, GOLD, "Goldy2"), "still caught").toBe(true);
  // The Filtered window the filter sends to: its name, shown, and how many lines it holds.
  const window = () => addon.eval("local f = ns.GetModule('ChatFilter').window return { f:GetName(), f:IsShown(), #f.__messages }");
  expect(window(), "the game gives the closed number to the new window (shown again), which holds both lines").toEqual(["ChatFrame3", true, 2]);
  deliver(addon, GOLD, "Goldy3");
  expect(window(), "the next line goes to it too, no second window").toEqual(["ChatFrame3", true, 3]);
  addon.slash("filter hide");
  addon.eval("ChatFrame3:Hide()");
  expect([deliver(addon, GOLD, "Goldy4"), addon.eval("local open = 0 for i = 3, 10 do if _G['ChatFrame' .. i]:IsShown() then open = open + 1 end end return open")], "in hide mode a closed tab is not made again: no window from 3 to 10 is shown").toEqual([true, 0]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

// TEST-ONLY model of the game's chat dock (Blizzard_ChatFrameBase/Mainline/FloatingChatFrame.lua): FCF_OpenNewWindow ends in
// FCFDock_SelectWindow, which selects the new window and hides every other docked one. selects: false is a client whose
// open does not move the selection; the calls to FCFDock_SelectWindow are counted in __selectCalls.
const DOCK_ENV = `
  GENERAL_CHAT_DOCK = CreateFrame("Frame", "GeneralDockManager", UIParent)
  GENERAL_CHAT_DOCK.selected, GENERAL_CHAT_DOCK.frames, __selectCalls = ChatFrame1, { ChatFrame1 }, 0
  function FCFDock_SelectWindow(dock, frame)
    __selectCalls = __selectCalls + 1
    dock.selected = frame
    for _, f in ipairs(dock.frames) do f:SetShown(f == frame) end
  end
  function FCFDock_GetSelectedWindow(dock) return dock.selected end
  local open = FCF_OpenNewWindow
  FCF_OpenNewWindow = function(...)
    local frame = open(...)
    table.insert(GENERAL_CHAT_DOCK.frames, frame)
    if __SELECTS__ then GENERAL_CHAT_DOCK.selected = frame for _, f in ipairs(GENERAL_CHAT_DOCK.frames) do f:SetShown(f == frame) end end
    return frame
  end
  ChatFrame1:Show()`;
// The dock model above; selects false is a client whose new window does not take the selection.
const dockEnv = (selects = true) => DOCK_ENV.replace("__SELECTS__", String(selects));
// The dock's selected window, whether General is shown, and how often the dock was asked to select.
const dockState = (addon) => addon.eval("return { GENERAL_CHAT_DOCK.selected:GetName(), ChatFrame1:IsShown(), __selectCalls }");

it("chat filter: switching it on keeps the tab you are reading selected, not the new empty Filtered tab", () => {
  const addon = loggedIn(dockEnv());
  addon.slash("filter on");
  expect(addon.eval("return ns.GetModule('ChatFilter').window:GetName()"), "the Filtered tab was made").toBe("ChatFrame3");
  expect(dockState(addon), "General stays selected and shown").toEqual(["ChatFrame1", true, 1]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat filter: the closed Filtered tab coming back after a fight keeps the selected tab", () => {
  const addon = filtering(dockEnv());
  addon.eval("local w = ns.GetModule('ChatFilter').window w:Hide() table.remove(GENERAL_CHAT_DOCK.frames, 2) w.isDocked = nil");
  addon.eval("__wfgStub.inCombat = true");
  expect(deliver(addon, GOLD, "Goldy"), "in the fight the line passes and the tab is queued").toBe(false);
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return ns.GetModule('ChatFilter').window:GetName()"), "a new Filtered tab is made (on the closed number, as the game gives it)").toBe("ChatFrame3");
  expect(dockState(addon).slice(0, 2), "General is still the tab shown").toEqual(["ChatFrame1", true]);
});

// A Filtered tab closed, then a spam line in a fight (the tab is queued), then `change` in the same fight, then the fight ends.
const reopenedAfterFight = (change) => {
  const addon = filtering(dockEnv());
  addon.eval("local w = ns.GetModule('ChatFilter').window w:Hide() table.remove(GENERAL_CHAT_DOCK.frames, 2) w.isDocked = nil");
  addon.eval("__wfgStub.inCombat = true");
  deliver(addon, GOLD, "Goldy");
  change(addon);
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  return addon.eval("return ns.GetModule('ChatFilter').window == nil");
};

it("chat filter: a closed Filtered tab queued in a fight is not made when the filter, tab mode or the module is switched off in that fight", () => {
  expect(reopenedAfterFight(() => {}), "nothing changed: the tab is made again").toBe(false);
  expect(reopenedAfterFight((a) => a.slash("filter off")), "filter off").toBe(true);
  expect(reopenedAfterFight((a) => a.slash("filter hide")), "filter hide").toBe(true);
  expect(reopenedAfterFight((a) => a.eval("ns.SetModuleEnabled('ChatFilter', false)")), "module off").toBe(true);
});

it("chat filter: a game whose new window does not take the selection, or has no dock, is left alone", () => {
  const stays = loggedIn(dockEnv(false));
  stays.slash("filter on");
  expect(dockState(stays), "the selection never moved, so nothing is selected again").toEqual(["ChatFrame1", true, 0]);
  const noDock = loggedIn("FCFDock_GetSelectedWindow = nil");
  noDock.slash("filter on");
  expect(noDock.eval("return ns.GetModule('ChatFilter').window ~= nil"), "the tab is still made").toBe(true);
  const noSelect = loggedIn(dockEnv() + " FCFDock_SelectWindow = nil");
  noSelect.slash("filter on");
  expect([noSelect.eval("return ns.GetModule('ChatFilter').window ~= nil"), noSelect.eval("return #ns.errors")], "no select call: no error").toEqual([true, 0]);
});

it("chat filter: the filter waits for the end of a fight to make the tab; with no GetChatWindowInfo the saved window number finds the tab", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true");
  addon.slash("filter on");
  expect(addon.eval("return ns.GetModule('ChatFilter').window == nil"), "not made in combat").toBe(true);
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return ns.GetModule('ChatFilter').window ~= nil"), "made when the fight ends").toBe(true);
  const noInfo = loggedIn("GetChatWindowInfo = nil");
  noInfo.slash("filter on");
  expect(noInfo.eval("local CF = ns.GetModule('ChatFilter') return CF.FindWindow() == CF.window and CF.window ~= nil"), "no way to look by name: the saved window number finds it").toBe(true);
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

it("chat filter: the 40-character word limit counts letters, not bytes, so a Russian word fits", () => {
  const addon = loggedIn();
  addon.slash(`filter add ${"я".repeat(24)}`);
  expect(addon.eval("return #ns.Settings('ChatFilter').keywords"), "24 Cyrillic letters (48 bytes) are added").toBe(1);
  addon.slash(`filter add ${"я".repeat(41)}`);
  expect(chatHas(addon, /at most 40 characters/), "41 letters are too long").toBe(true);
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

it("chat filter: switched off on the Modules page, /vg filter on makes no empty Filtered tab", () => {
  const addon = loggedIn();
  addon.eval("ns.SetModuleEnabled('ChatFilter', false)");
  addon.slash("filter on");
  expect(addon.eval("return ns.GetModule('ChatFilter').window == nil"), "no Filtered tab while nothing is filtered").toBe(true);
  expect(deliver(addon, GOLD), "nothing is caught").toBe(false);
  const fight = loggedIn();
  fight.eval("__wfgStub.inCombat = true");
  fight.slash("filter on");
  fight.eval("ns.SetModuleEnabled('ChatFilter', false) __wfgStub.inCombat = false");
  fight.fire("PLAYER_REGEN_ENABLED");
  expect(fight.eval("return ns.GetModule('ChatFilter').window == nil"), "switched off during the fight: no tab when it ends").toBe(true);
});

it("chat filter: filter off or hide later in the same fight leaves no tab made when it ends", () => {
  for (const verb of ["off", "hide"]) {
    const fight = loggedIn();
    fight.eval("__wfgStub.inCombat = true");
    fight.slash("filter on");
    fight.slash(`filter ${verb}`);
    fight.eval("__wfgStub.inCombat = false");
    fight.fire("PLAYER_REGEN_ENABLED");
    expect(fight.eval("return ns.GetModule('ChatFilter').window == nil"), `filter ${verb}: no tab`).toBe(true);
  }
  const kept = loggedIn();
  kept.eval("__wfgStub.inCombat = true");
  kept.slash("filter on");
  kept.eval("__wfgStub.inCombat = false");
  kept.fire("PLAYER_REGEN_ENABLED");
  expect(kept.eval("return ns.GetModule('ChatFilter').window ~= nil"), "still on: the tab is made").toBe(true);
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
  addon.eval("ChatFrame3:Hide()");
  deliver(addon, GOLD, "Goldy2");
  addon.eval("__wfgStub.inCombat = false");
  expect(addon.eval("return { ns.GetModule('ChatFilter').window:GetName(), ns.GetModule('ChatFilter').window:IsShown() }"), "the closed tab is made again, on the closed number").toEqual(["ChatFrame3", true]);
  addon.slash("filter hide");
  deliver(addon, GOLD, "Goldy3");
  expect(addon.eval("return ns.GetModule('ChatFilter').count"), "a hidden line is counted").toBe(4);
  addon.slash("filter add [Bo|ost]");
  expect(addon.eval("return ns.Settings('ChatFilter').keywords"), "brackets and bars are not kept in a word").toEqual(["boost"]);
  addon.eval('ns.SetModuleEnabled("ChatFilter", false)');
  expect(deliver(addon, GOLD, "Goldy4"), "module off: everything passes").toBe(false);
  addon.eval('ns.SetModuleEnabled("ChatFilter", true)');
  expect(deliver(addon, GOLD, "Goldy5"), "and on again, with one filter registered").toBe(true);
});

// Whether the options window shows a row with this text (CLICK_LUA's __find).
const shown = (addon, text) => addon.eval(`return __find(${JSON.stringify(text)}) ~= nil`);
// The note a locale with some categories missing gets under the switches.
const NOTE = "Some spam categories have no word list for your language yet, so their switches are not shown. Your own words and repeated lines still work.";

// A logged-in addon on a client of this locale, the filter on.
const filteringIn = (locale, extra = "") => filtering(`GetLocale = function() return "${locale}" end ${extra}`);

it("chat filter words: a German client catches German recruiting, boosting and gold lines; English-only sale words are not its words", () => {
  const addon = filteringIn("deDE");
  expect(deliver(addon, "Wir rekrutieren neue Mitglieder, tritt unserer Gilde bei!", "Recruiter"), "recruiting").toBe(true);
  expect(deliver(addon, "Boost im Angebot, günstig, flüster mir", "Booster"), "boosting").toBe(true);
  expect(deliver(addon, "Verkaufe Gold, schnelle Lieferung auf www.goldshop.com", "Goldy"), "gold").toBe(true);
  expect(deliver(addon, "Suche Heiler für die Todesminen", "Honest"), "an honest line").toBe(false);
  expect(addon.eval("return ns.GetModule('ChatFilter').Reasons()"), "the card's reasons are the available categories, your words and repeats").toEqual(["Gold selling", "Boosting", "Recruiting", "Your word", "Repeat"]);
});

it("chat filter words: Russian, French, Spanish, Italian, Portuguese, Korean and Chinese clients each catch a recruiting line of their own language", () => {
  const lines = {
    ruRU: "Идёт набор в нашу гильдию, вступай в гильдию!",
    frFR: "Notre guilde recrute, rejoignez notre guilde",
    esES: "Reclutando para nuestra hermandad, únete a nuestra hermandad",
    esMX: "Reclutando para nuestra hermandad, únete a nuestra hermandad",
    itIT: "Reclutiamo per la gilda, unisciti alla nostra gilda",
    ptBR: "Recrutando para a guilda, junte-se à nossa guilda",
    koKR: "길드원 모집합니다 길드 가입 환영",
    zhCN: "公会招募新人，欢迎加入",
    zhTW: "公會招募新人，歡迎加入",
  };
  for (const [locale, line] of Object.entries(lines)) {
    expect(deliver(filteringIn(locale), line, "Recruiter"), `${locale} recruiting`).toBe(true);
  }
});

it("chat filter words: a Russian or Chinese pick-up raid call is not guild recruiting, a guild line still is", () => {
  const lines = {
    ruRU: ["Набор в рейд Огненные Недра, нужны хилы и танк", "Гильдия TEST-ONLY: набор, рейды по выходным"],
    zhCN: ["熔火之心 团队招募 治疗 坦克", "TEST-ONLY 公会招募 休闲"],
    zhTW: ["熔火之心 團隊招募 治療 坦克", "TEST-ONLY 公會招募 休閒"],
  };
  for (const [locale, [pickup, guild]] of Object.entries(lines)) {
    expect([deliver(filteringIn(locale), pickup, "Raider"), deliver(filteringIn(locale), guild, "Recruiter")], locale).toEqual([false, true]);
  }
});

it("chat filter words: an enGB client uses the English words", () => {
  expect(deliver(filteringIn("enGB"), GOLD, "Goldy"), "gold selling").toBe(true);
});

it("chat filter words: a locale with no word lists catches nothing by category, hides the category switches and says so, while your words and repeats still work", () => {
  const addon = filteringIn("xxXX", CLICK_LUA);
  expect(deliver(addon, GOLD, "Goldy"), "English gold selling passes on a client with no list for it").toBe(false);
  expect(addon.eval("return #ns.GetModule('ChatFilter').Available()"), "no category available").toBe(0);
  addon.eval('ns.Options.Show("chat")');
  expect(["Gold selling", "Boosting", "Guild recruiting"].map(shown.bind(null, addon)), "no category switch").toEqual([false, false, false]);
  expect(shown(addon, "Same line again within a minute"), "the repeat switch stays").toBe(true);
  expect(addon.texts(NOTE).length, "the note").toBe(1);
  addon.eval('ns.GetModule("ChatFilter").Add("spamword")');
  expect(deliver(addon, "buy spamword here", "Spammer"), "your own word").toBe(true);
  expect(deliver(addon, "this exact line repeated", "Rep"), "first time").toBe(false);
  expect(deliver(addon, "this exact line repeated", "Rep"), "repeat").toBe(true);
});

it("chat filter words: an English client shows every category switch and no note", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  expect(["Gold selling", "Boosting", "Guild recruiting"].map((t) => shown(addon, t)), "three switches").toEqual([true, true, true]);
  expect(addon.texts(NOTE).length, "no note").toBe(0);
});

it("chat filter tab: found by its saved window number after the player renames it, not made again; a closed tab forgets the number", () => {
  const addon = filtering();
  deliver(addon, GOLD, "Goldy");
  expect(addon.eval("return VanguardCharDB.filteredTab"), "the number is saved per character").toBe(3);
  addon.eval("__wfgWorld.chatWindows[3] = 'My spam'");
  expect(deliver(addon, GOLD, "Goldy2"), "still caught").toBe(true);
  expect(addon.eval("return { not ChatFrame4:IsShown(), ns.GetModule('ChatFilter').window:GetName() }"), "no second tab").toEqual([true, "ChatFrame3"]);
  expect(addon.eval("return ns.GetModule('ChatFilter').IsTab(3)"), "chat history sees it as the Filtered tab").toBe(true);
  addon.eval("ChatFrame3:Hide()");
  deliver(addon, GOLD, "Goldy3");
  expect(addon.eval("return { VanguardCharDB.filteredTab, ns.GetModule('ChatFilter').window:GetName(), ns.GetModule('ChatFilter').window:IsShown(), __wfgWorld.chatWindows[3] }"), "a closed, renamed tab is let go and a new one made on the closed number and saved").toEqual([3, "ChatFrame3", true, "Filtered"]);
});

it("chat filter tab: a tab an earlier version made (no saved number) is found by its name and its number saved", () => {
  const addon = filtering();
  deliver(addon, GOLD, "Goldy");
  addon.eval("VanguardCharDB.filteredTab = nil ns.GetModule('ChatFilter').window = nil ns.GetModule('ChatFilter').Prepare()");
  expect(addon.eval("return { VanguardCharDB.filteredTab, not ChatFrame4:IsShown() }"), "found by name, saved, not made again").toEqual([3, true]);
});

it("chat filter: an empty or non-text word in a saved keyword list holds nothing, instead of catching every line", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { ChatFilter = { on = true, keywords = { '', 5, 'zzz' } } } }" });
  expect(deliver(addon, "LFM Deadmines need a healer", "Lightmend"), "an ordinary line passes").toBe(false);
  expect(deliver(addon, "something with zzz in it", "Spammer"), "the real word still catches").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("H44-19-50 chat filter: a saved keyword that is no text is dropped, so add, remove and status answer without an error", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { ChatFilter = { on = true, keywords = { 5, 'zzz', { 1 } } } } }" });
  addon.slash("filter add newword");
  addon.slash("filter remove zzz");
  addon.slash("filter");
  expect(addon.eval("return ns.Settings('ChatFilter').keywords"), "the broken entries are gone from the save; the new word is kept").toEqual(["newword"]);
  expect(chatHas(addon, /Your words: newword/), "status names it").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

// The game closes a window (FCF_Close hides and undocks it) and gives its number to the next tab made: the first number
// neither shown nor docked (forever Blizzard_ChatFrameBase/Shared/FloatingChatFrame.lua: FCF_GetNextOpenChatWindowIndex,
// FCF_IsChatWindowIndexActive), as the harness's FCF_OpenNewWindow does.
it("H44-19-52 chat filter: a Filtered tab closed and its number given to a new tab is never fed spam; the filter makes another", () => {
  const addon = filtering("FCF_Close = function(frame, fallback) frame = fallback or frame if frame and frame ~= ChatFrame1 then frame:Hide() end end");
  deliver(addon, GOLD, "Goldy");
  expect(addon.eval("return VanguardCharDB.filteredTab"), "the Filtered tab is ChatFrame3").toBe(3);
  addon.eval("FCF_Close(ChatFrame3) FCF_OpenNewWindow('Loot') ChatFrame3Tab:SetText('Loot') ChatFrame3.__messages = {}");
  expect(addon.eval("return VanguardCharDB.filteredTab"), "the closed tab's number is forgotten at once").toBe(null);
  expect(deliver(addon, GOLD, "Goldy2"), "spam is still caught").toBe(true);
  addon.update(0.1);
  expect(addon.eval("return { #ChatFrame3.__messages, ChatFrame3Tab:GetText(), ns.GetModule('ChatFilter').window:GetName(), VanguardCharDB.filteredTab }"), "Loot keeps its name and holds no spam; a new Filtered tab has it").toEqual([0, "Loot", "ChatFrame4", 4]);
  addon.eval("local w = ns.GetModule('ChatFilter').window FCF_Close(ChatFrame1) FCF_Close(nil) FCF_Close({}, w)");
  expect(addon.eval("return { #ns.errors, VanguardCharDB.filteredTab == nil }"), "the main window, nothing, or a fallback window: no error, and only the Filtered tab's close forgets").toEqual([0, true]);
});

// As the H44-19-52 test: a closed window's number goes to the next tab made (forever
// Blizzard_ChatFrameBase/Shared/FloatingChatFrame.lua: FCF_GetNextOpenChatWindowIndex).
it("H44-19-53 chat filter: a tab that takes a closed Filtered tab's number is kept by Chat history, whether the filter is on, off or its module stopped", () => {
  // ChatFrame3 exists (and is followed by Chat history) but is closed, so the filter's tab takes its number.
  const addon = filtering("__now = 1790000000 time = function() return __now end FCF_Close = function(frame) frame:Hide() end FCF_OpenNewWindow('old') ChatFrame3:Hide()");
  expect(addon.eval("return VanguardCharDB.filteredTab"), "the Filtered tab is ChatFrame3").toBe(3);
  addon.slash("filter off");
  addon.eval("ns.SetModuleEnabled('ChatFilter', false)");
  addon.eval("FCF_Close(ChatFrame3) FCF_OpenNewWindow('Loot')");
  expect(addon.eval("return VanguardCharDB.filteredTab == nil"), "closed while the module is off: the number is forgotten").toBe(true);
  addon.slash("history on");
  addon.eval(`ChatFrame1:AddMessage("main line") ChatFrame3:AddMessage("You receive loot: [Linen Cloth].")`);
  expect(addon.eval("local s = VanguardCharDB.chatHistory or {} return { s[1] and #s[1] or 0, s[3] and #s[3] or 0 }"), "the Loot tab's line is saved").toEqual([1, 1]);
  addon.eval("VanguardCharDB.filteredTab = 3");
  expect(addon.eval("return ns.GetModule('ChatFilter').IsTab(3)"), "a number left saved by a session where the filter never ran does not make a tab the Filtered one").toBe(false);
  addon.eval("ns.SetModuleEnabled('ChatFilter', true)");
  expect(addon.eval("return ns.GetModule('ChatFilter').IsTab(3)"), "with the filter running it is").toBe(true);
});

it("H44-19-54 chat filter: the tab's label is Filtered in the player's language, or the name the player gave the tab, plus the count", () => {
  const addon = filtering();
  addon.eval("ns.L['Filtered'] = 'Gefiltert'");
  deliver(addon, GOLD, "Goldy");
  addon.update(0.1);
  expect(tabName(addon), "never renamed: the translated word and the count").toBe("Gefiltert (1)");
  addon.eval("__wfgWorld.chatWindows[3] = 'Spam'");
  deliver(addon, GOLD, "Goldy2");
  addon.update(0.1);
  expect(tabName(addon), "renamed to Spam: the player's name stays, with the count").toBe("Spam (2)");
  expect(addon.eval("return { ns.GetModule('ChatFilter').TAB, __wfgWorld.chatWindows[3] }"), "the saved name used to find an old tab is untouched English").toEqual(["Filtered", "Spam"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

// TEST-ONLY model of the game's tab naming (Blizzard_ChatFrameBase/Mainline/FloatingChatFrame.lua): FCF_OpenNewWindow
// calls FCF_SetWindowName(chatFrame, name), which ends in tab:SetText(name); FloatingChatFrame_Update calls it again
// on every UPDATE_CHAT_WINDOWS (FCF_SetWindowName(chatFrame, name, true)).
const NAMING_ENV = `
  function FCF_SetWindowName(frame, name) _G[frame:GetName() .. "Tab"]:SetText(name) end
  local open = FCF_OpenNewWindow
  FCF_OpenNewWindow = function(name, ...)
    local frame = open(name, ...)
    FCF_SetWindowName(frame, name)
    return frame
  end`;

// The module's tab text, once the soon-timer ran.
const relabelled = (addon) => {
  addon.update(0.5);
  return tabName(addon);
};

it("H45-8-2 chat filter: a new Filtered tab reads the translated word and the count before anything is caught", () => {
  const addon = loggedIn(NAMING_ENV);
  addon.eval("ns.L['Filtered'] = 'Gefiltert'");
  addon.slash("filter on");
  expect(relabelled(addon), "not the game's English name").toBe("Gefiltert (0)");
});

it("H45-8-2 chat filter: a tab found again (not made) is labelled too", () => {
  const addon = filtering(NAMING_ENV);
  addon.eval("ns.L['Filtered'] = 'Gefiltert'; ns.GetModule('ChatFilter').window = nil; _G.ChatFrame3Tab:SetText('Filtered')");
  addon.eval("ns.GetModule('ChatFilter').Prepare()");
  expect(relabelled(addon)).toBe("Gefiltert (0)");
});

it("H45-8-2 chat filter: the game's own refresh of the chat windows is followed by the label, only for this tab", () => {
  const addon = filtering(NAMING_ENV);
  addon.eval("ns.L['Filtered'] = 'Gefiltert'");
  addon.update(0.5);
  addon.eval("FCF_SetWindowName(ns.GetModule('ChatFilter').window, 'Filtered', true) FCF_SetWindowName(ChatFrame1, 'General', true)");
  expect(addon.eval("return _G.ChatFrame3Tab:GetText()"), "the game wrote its saved name").toBe("Filtered");
  expect(relabelled(addon), "the label is back").toBe("Gefiltert (0)");
  addon.slash("filter off");
  addon.eval("FCF_SetWindowName(ns.GetModule('ChatFilter').window, 'Filtered', true)");
  addon.update(0.5);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
