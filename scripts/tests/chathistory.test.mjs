// chathistory: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/ChatHistory.lua: the lines in the chat windows are saved per character and put back
// after a reload or the next login, bounded by lines per window and by age, whispers left out.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { CLICK_LUA, chatHas, expectErrors, loggedIn } from "./helpers.mjs";

// A controllable clock for the saved lines' times, and a fixed date text.
const CLOCK = `__now = 1790000000 time = function() return __now end date = function(_, at) return "Mon " .. tostring(at or 0) end`;

// A logged-in addon with the clock; `on` switches history on at once.
const session = (on = true) => {
  const addon = loggedIn(CLOCK);
  if (on) addon.slash("history on");
  return addon;
};
// The main window's and the second window's lines.
const lines = (addon, i = 1) => Object.values(addon.eval(`return ChatFrame${i}.__messages or {}`));
// The yes/no question: whether it shows, and its text.
const question = (addon) => addon.eval("local f = Vanguard_Question return { f:IsShown(), f.title:GetText() }");
// The saved lines, window -> list.
const saved = (addon) => addon.eval("return VanguardCharDB.chatHistory");

// Logs out and in again as the same character; `now` moves the clock, `extra` runs before login.
function relog(addon, { now = 0, extra = "" } = {}) {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  next.eval(`${CLOCK} __now = __now + ${now} ${extra}`);
  next.login();
  return next;
}

it("chat history: off until switched on; nothing is saved, and nothing comes back", () => {
  const addon = session(false);
  addon.eval(`ChatFrame1:AddMessage("a line before", 1, 1, 1)`);
  expect(saved(addon), "nothing saved while off").toBeFalsy();
  const back = relog(addon);
  expect(lines(back).filter((l) => /earlier chat/.test(l)).length, "and nothing is put back").toBe(0);
  expect(back.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat history: closing a tab drops its saved lines, so the next tab to take that window number starts empty", () => {
  const addon = loggedIn(`${CLOCK} FCF_Close = function() end`);
  addon.slash("history on");
  addon.eval(`ChatFrame1:AddMessage("main") ChatFrame2:AddMessage("trade") VanguardCharDB.chatHistory[3] = { "1|ffffff|loot" }`);
  addon.eval("ChatFrame2.__frameID = 2 FCF_Close(ChatFrame2) FCF_Close(DEFAULT_CHAT_FRAME) FCF_Close(nil, { GetID = function() return 3 end }) FCF_Close(nil) FCF_Close({})");
  expect(Object.keys(saved(addon)), "only the main window (window 1) keeps its lines").toEqual(["0"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat history: lines come back after a relog, in their own window and colour, between a header and a footer", () => {
  const addon = session();
  expect(chatHas(addon, /Chat history on\./), "says so").toBe(true);
  addon.eval(`ChatFrame1:AddMessage("hello main", 1, 0.5, 0) ChatFrame2:AddMessage("hello second", 0, 0, 1) ChatFrame1:AddMessage("no colour")`);
  expect(saved(addon)[0], "packed with time, colour and text").toEqual(["1790000000|ff8000|hello main", "1790000000|ffffff|no colour"]);
  const back = relog(addon, { now: 60 });
  const main = back.eval("return { ChatFrame1.__messages, ChatFrame1.__lastColor }");
  const dashes = "—".repeat(8);
  expect(lines(back, 1), "main window: a muted rule saying when they are from, its lines, a closing rule").toEqual([
    `|cffa6adb9${dashes} Chat from your last session (2 lines, until Mon 1790000000) ${dashes}|r`, "hello main", "no colour", `|cffa6adb9${dashes} End of the earlier chat ${dashes}|r`]);
  expect(lines(back, 2)[1], "the second window got its own line").toBe("hello second");
  expect(back.eval("return #VanguardCharDB.chatHistory[1]"), "putting lines back does not save them again").toBe(2);
  expect(back.eval("return #ns.errors"), "no errors").toBe(0);
  void main;
});

it("chat history: restored lines carry no old chat line numbers, so Report Chat is not offered for them", () => {
  const addon = session();
  addon.slash("history whispers on");
  addon.eval(`ChatFrame1:AddMessage("|Hplayer:Bob:523:CHANNEL:2|h[Bob]|h: hi") ChatFrame1:AddMessage("|HBNplayer:Al:9:77:BN_WHISPER:Al|h[Al]|h: yo")
    ChatFrame1:AddMessage("|Hplayer:Cy|h[Cy]|h: plain") ChatFrame1:AddMessage("|HBNplayer:|Kq12|k:9:78:BN_WHISPER:|Kq12|k|h[Di]|h: hey") ChatFrame1:AddMessage("|Hreportcensoredmessage:5|h[Report]|h hidden")
    ChatFrame1:AddMessage("|Hdiscorduser:12:987654:523:GUILD:|h[Al]|h: gg")`);
  const back = lines(relog(addon));
  expect(back.slice(1, 7)).toEqual(["|Hplayer:Bob:0:CHANNEL:2|h[Bob]|h: hi", "|HBNplayer:Al:9:0:BN_WHISPER:Al|h[Al]|h: yo", "|Hplayer:Cy|h[Cy]|h: plain", "|HBNplayer:|Kq12|k:9:0:BN_WHISPER:|Kq12|k|h[Di]|h: hey", "[Report] hidden",
    "|Hdiscorduser:12:987654:0:GUILD:|h[Al]|h: gg"]);
});

it("chat history: hidden text, other kinds of value and very long lines are never saved", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage(__wfgWorld.secret(), 1, 1, 1) ChatFrame1:AddMessage(nil) ChatFrame1:AddMessage(42) ChatFrame1:AddMessage("")
    ChatFrame1:AddMessage(string.rep("x", 601)) ChatFrame1:AddMessage("a secret colour", __wfgWorld.secret(), 1, 1) ChatFrame1:AddMessage("fine", 1, 1, 1)`);
  expect(saved(addon)[0], "only the readable lines, a hidden colour as white").toEqual(["1790000000|ffffff|a secret colour", "1790000000|ffffff|fine"]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat history: whispers are not kept unless asked for (by the sender link), and a whisper sent to a pop-out costs no line", () => {
  const addon = session();
  addon.eval(`for _, fn in ipairs(__wfgWorld.chatFilters.CHAT_MSG_WHISPER) do fn() end
    ChatFrame1:AddMessage("Trade line") ChatFrame1:AddMessage("same frame, after")`);
  addon.update(0.1);
  addon.eval(`ChatFrame1:AddMessage("|Hplayer:Bob:77:WHISPER:BOB|h[Bob]|h whispers: hi") ChatFrame1:AddMessage("|HBNplayer:Al:9:77:BN_WHISPER:Al|h[Al]|h whispers: yo") ChatFrame1:AddMessage("plain line")`);
  expect(saved(addon)[0], "a whisper that only a pop-out showed costs no line; the whispers shown are not kept").toEqual(["1790000000|ffffff|Trade line", "1790000000|ffffff|same frame, after", "1790000000|ffffff|plain line"]);
  addon.slash("history whispers");
  expect(chatHas(addon, /Whispers are kept too\./), "says so").toBe(true);
  addon.eval(`ChatFrame1:AddMessage("|Hplayer:Bob:77:WHISPER:BOB|h[Bob]|h whispers: hi again")`);
  expect(saved(addon)[0].length, "a whisper is kept now").toBe(4);
  addon.slash("history nowhispers");
  expect(chatHas(addon, /New whispers are not kept\. Whispers already saved stay until they age out or you clear them\./), "and can be turned off again, saying saved ones stay").toBe(true);
  expect(saved(addon)[0].length, "the whisper saved earlier stays").toBe(4);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat history: an outgoing whisper's link keeps it out too", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage("To |Hplayer:Bob:78:WHISPER:BOB|h[Bob]|h: hello") ChatFrame1:AddMessage("plain line")`);
  expect(saved(addon)[0], "the whisper is not kept").toEqual(["1790000000|ffffff|plain line"]);
});

it("chat history: lines older than the limit, surplus lines and broken entries are dropped at login and logout", () => {
  const addon = session();
  addon.eval(`ns.Settings("ChatHistory").lines = 3 ChatFrame1:AddMessage("old one") __now = __now + 2 * 86400 ChatFrame1:AddMessage("n1") ChatFrame1:AddMessage("n2") ChatFrame1:AddMessage("n3") ChatFrame1:AddMessage("n4")`);
  expect(saved(addon)[0].length, "the window may run a little over its limit between prunes").toBe(5);
  addon.eval(`VanguardCharDB.chatHistory[2] = { "garbage" } VanguardCharDB.chatHistory[3] = "not a list"`);
  addon.fire("PLAYER_LOGOUT");
  expect(saved(addon), "the newest three; broken windows gone").toEqual([["1790172800|ffffff|n2", "1790172800|ffffff|n3", "1790172800|ffffff|n4"]]);
  const later = relog(addon, { now: 2 * 86400 + 4 * 86400 });
  expect(later.eval("return VanguardCharDB.chatHistory"), "three days kept: after four more days nothing is left").toEqual({});
  expect(lines(later).length, "nothing comes back").toBe(0);
});

it("chat history: the combat log and the Filtered tab are left out, saved and restored", () => {
  const addon = session();
  addon.eval(`COMBATLOG = ChatFrame2 ChatFrame1:AddMessage("chat") ChatFrame2:AddMessage("combat")`);
  expect(saved(addon), "the combat log is not kept").toEqual([["1790000000|ffffff|chat"]]);
  addon.eval(`COMBATLOG = nil __wfgWorld.chatWindows[2] = ns.GetModule("ChatFilter").TAB ChatFrame2:AddMessage("spam")`);
  expect(saved(addon).length, "nor is the Filtered tab").toBe(1);
  addon.eval(`VanguardCharDB.chatHistory[2] = { "1790000000|ffffff|old spam" }`);
  const back = relog(addon, { extra: `__wfgWorld.chatWindows[2] = ns.GetModule("ChatFilter").TAB` });
  expect(lines(back, 2).length, "and nothing is put back in it").toBe(0);
});

it("chat history: a window trims itself once it is well over its limit", () => {
  const addon = session();
  addon.eval(`ns.Settings("ChatHistory").lines = 100 for i = 1, 151 do ChatFrame1:AddMessage("line " .. i) end`);
  const list = saved(addon)[0];
  expect([list.length, list[0], list[99]], "151 lines is over 100 + 50: down to the newest 100").toEqual([100, "1790000000|ffffff|line 52", "1790000000|ffffff|line 151"]);
});

it("chat history: a trim while playing also drops lines past their age", () => {
  const addon = session();
  addon.eval(`ns.Settings("ChatHistory").lines = 100 for i = 1, 100 do ChatFrame1:AddMessage("old") end __now = __now + 4 * 86400 for i = 1, 51 do ChatFrame1:AddMessage("new") end`);
  expect(saved(addon)[0].length, "only the 51 new lines are left").toBe(51);
});

it("chat history: /vg history says what is kept, clears it, and turns it on and off", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage("one") ChatFrame2:AddMessage("two")`);
  addon.slash("history");
  expect(chatHas(addon, /Chat history is on: up to 200 lines per window for 3 days; whispers are not kept\./) && chatHas(addon, /2 lines saved in 2 windows\./), "status").toBe(true);
  addon.slash("history clear");
  expect(question(addon), "clear asks first, naming what goes").toEqual([true, "Forget the 2 saved chat lines in 2 windows? This can't be undone."]);
  addon.click("Vanguard_Question.no");
  expect(Object.keys(saved(addon)).length, "No keeps it").toBe(2);
  addon.slash("history clear");
  addon.click("Vanguard_Question.confirm");
  expect([chatHas(addon, /Saved chat history cleared\./), saved(addon)], "Clear forgets it").toEqual([true, {}]);
  addon.slash("history off");
  addon.eval(`ChatFrame1:AddMessage("after off")`);
  expect([chatHas(addon, /Chat history off\./), saved(addon)], "off saves nothing more").toEqual([true, {}]);
  addon.slash("history sideways");
  expect(chatHas(addon, /Usage: \/vg history/), "usage").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat history: the Chat page has its switch, limits, whispers and Clear button; Disable stops saving", () => {
  const addon = loggedIn(CLOCK + CLICK_LUA);
  addon.slash("");
  const PAGE = `local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "chat" then page = p end end`;
  const rows = addon.eval(`${PAGE} local out = {} for _, row in ipairs(page.rows()) do out[#out + 1] = row[2] end return out`);
  expect(rows.filter((t) => /history|Lines kept|Keep lines|Keep whispers|Clear saved chat/.test(t)), "the rows").toEqual(["Chat history", "Keep chat history", "Lines kept per chat window", "Keep lines for", "Keep whispers", "Clear saved chat"]);
  addon.slash("history on");
  addon.eval(`ChatFrame1:AddMessage("cleared by the button") ${PAGE} for _, row in ipairs(page.rows()) do if row[2] == "Clear saved chat" then row[3]() end end`);
  expect([question(addon)[0], Object.keys(saved(addon)).length], "the Clear button asks first").toEqual([true, 1]);
  addon.click("Vanguard_Question.confirm");
  expect(saved(addon), "Clear forgets it").toEqual({});
  addon.eval(`ns.GetModule("ChatHistory").Disable() ChatFrame1:AddMessage("after disable")`);
  expect(saved(addon), "a module switched off saves nothing").toEqual({});
});

it("chat history: windows the client lacks, a missing clock and a client without hooks do not break it", () => {
  const addon = loggedIn(`${CLOCK} ChatFrame2 = nil`);
  addon.slash("history on");
  addon.eval(`ChatFrame1:AddMessage("kept")`);
  const bare = createAddon({ savedVariables: `VanguardDB = ${luaValue(addon.savedVariables().account)}\nVanguardCharDB = { profile = "Default", chatHistory = { [9] = { "1|ffffff|nobody home" }, [1] = { "5|00ff00|green" } } }\n` });
  bare.eval("time = nil date = nil hooksecurefunc = nil");
  bare.login();
  expect(bare.eval("return #ns.errors"), "no clock, no hooks, a window that is gone: no errors").toBe(0);
  expect(bare.eval("return ns.GetModule('ChatHistory').Unpack('x')"), "a broken entry is nothing").toBeNull();
});

it("chat history: a line printed at login, before the world is entered, is not replayed in the earlier block and is kept for the next session", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage("old session line")`);
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  next.eval(`${CLOCK} __now = __now + 3600`);
  next.fire("ADDON_LOADED", "Vanguard");
  next.fire("PLAYER_LOGIN");
  next.eval(`ChatFrame1:AddMessage("SomeAddon loaded")`);
  next.fire("PLAYER_ENTERING_WORLD", true, false);
  const shown = lines(next);
  expect(shown.filter((l) => l === "SomeAddon loaded").length, "shown once").toBe(1);
  expect(shown.some((l) => /1 lines, until Mon 1790000000/.test(l)), "the block counts and dates only the old line").toBe(true);
  expect(saved(next)[0], "kept after the restored line, for the next session").toEqual(["1790000000|ffffff|old session line", "1790003600|ffffff|SomeAddon loaded"]);
  expect(next.eval("return #ns.errors"), "no errors").toBe(0);
});

// Logs in again as the same character without the world entered yet (the caller fires PLAYER_ENTERING_WORLD).
function nextLogin(addon, extra = "", saveEdit = "") {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n${saveEdit}` });
  next.eval(`${CLOCK} ${extra}`);
  next.fire("ADDON_LOADED", "Vanguard");
  next.fire("PLAYER_LOGIN");
  return next;
}

it("chat history: a module started later in the session meets a zone change, which does not replay the earlier chat", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage("last session")`);
  const next = nextLogin(addon);
  next.fire("PLAYER_ENTERING_WORLD", false, false);
  expect(lines(next).some((l) => /earlier chat|last session/.test(l)), "no replay on a zone change").toBe(false);
  next.eval(`ChatFrame1:AddMessage("this session")`);
  next.fire("PLAYER_ENTERING_WORLD", false, false);
  expect(saved(next)[0], "the saved lines stay, and the lines shown meanwhile join them once").toEqual(["1790000000|ffffff|last session", "1790000000|ffffff|this session"]);
  expect(next.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat history: a reload restores too, and one window that cannot take its lines does not stop the others", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage("main") ChatFrame2:AddMessage("trade")`);
  const next = nextLogin(addon, `ChatFrame1.AddMessage = function() error("boom") end`);
  next.fire("PLAYER_ENTERING_WORLD", false, true);
  expect(lines(next, 2).some((l) => l === "trade"), "window 2 is back though window 1 raised first").toBe(true);
  expect(next.eval("return ns.GetModule('ChatHistory').restoring"), "the restore flag is cleared").toBeFalsy();
  expectErrors("restore chat window: eval:2: boom");
});

it("chat history: saved data from an older version (a string where a table goes, lines that are not lines) is read without an error", () => {
  const addon = session();
  addon.eval(`ChatFrame1:AddMessage("keep me")`);
  const next = nextLogin(addon, "", `VanguardCharDB.chatHistory[2] = "old format" VanguardCharDB.chatHistory[3] = { 5, {}, "x", "1790000000|zzzzzz|bad", "|ffffff|no time" } VanguardCharDB.chatHistory.junk = true\n`);
  next.fire("PLAYER_ENTERING_WORLD", true, false);
  expect(lines(next, 1).some((l) => l === "keep me"), "the good window comes back").toBe(true);
  expect(Object.keys(saved(next)), "the damaged ones are dropped").toEqual(["0"]);
  expect(next.eval("return #ns.errors"), "no errors").toBe(0);
});
