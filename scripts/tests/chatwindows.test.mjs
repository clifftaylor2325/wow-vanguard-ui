// chatwindows: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/ChatWindows.lua: each chat window's size and the game's lock from the Chat page, and
// floating windows as /vg unlock handles.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY game chat layout calls, two windows in use (the second one pulled out of the dock).
const ENV = `
  __wfgWorld.chatWindows[1], __wfgWorld.chatWindows[2] = "General", "Loot"
  __saved, __locks = 0, {}
  FCF_SavePositionAndDimensions = function() __saved = __saved + 1 end
  FCF_SetLocked = function(frame, v) __locks[frame:GetName()] = v end
  ChatFrame1:SetSize(400, 150) ChatFrame2:SetSize(300, 120)
  ChatFrame2:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 50, -60)
`;

// The Chat page's rows.
const PAGE = `local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "chat" then page = p end end`;

it("chat windows: a width and a height slider for each window showing, saved in the game's chat layout", () => {
  const addon = loggedIn(ENV);
  const names = addon.eval(`${PAGE} local out = {} for _, r in ipairs(page.rows()) do if r[1] == "slider" and (r[2]:find("General") or r[2]:find("Loot")) then out[#out + 1] = r[2] end end return out`);
  expect(names, "two sliders for each window").toEqual(["General: width", "General: height", "Loot: width", "Loot: height"]);
  const out = addon.eval(`${PAGE} local rows, out = page.rows(), {}
    for _, r in ipairs(rows) do if r[2] == "Loot: width" then out[1] = r[4]() r[5](500) out[2] = r[4]() end if r[2] == "Loot: height" then out[3] = r[4]() r[5](200) out[4] = r[4]() end end
    out[5] = ChatFrame2:GetWidth() out[6] = ChatFrame2:GetHeight() out[7] = __saved return out`);
  expect(out, "read, set; the other side kept; each set saved").toEqual([300, 500, 120, 200, 500, 200, 2]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat windows: Lock chat windows reads the game's lock and sets it on every window showing", () => {
  const addon = loggedIn(ENV + `GetChatWindowInfo = function(i) return ({ "General", "Loot" })[i], 12, 1, 1, 1, 1, 1, __lock end`);
  // The Lock row's current value.
  const read = () => addon.eval(`${PAGE} for _, r in ipairs(page.rows()) do if r[2] == "Lock chat windows" then return r[3]() end end`);
  addon.eval("__lock = 1");
  expect([read(), addon.eval("__lock = nil return ({ ns.GetModule('ChatWindows').LockSetting() })[1]()")], "1 or true is locked, nil is not").toEqual([true, false]);
  addon.eval(`${PAGE} for _, r in ipairs(page.rows()) do if r[2] == "Lock chat windows" then r[4](true) end end`);
  expect(addon.eval("return { __locks.ChatFrame1, __locks.ChatFrame2 }"), "both windows locked").toEqual([true, true]);
  addon.eval("__lock = true");
  expect(read(), "true is locked").toBe(true);
});

it("chat windows: the floating window becomes a mover and stays where it was put; the main window and docked ones do not", () => {
  const addon = loggedIn(ENV, { savedVariables: 'VanguardDB.profiles = { Default = { ChatWindows = { movers = true } } }' });
  expect(addon.eval("return ns.MoverPoint('chat2')"), "floating window 2 is a mover at its spot").toBe("TOPLEFT");
  addon.eval("ns.SetMoverPoint('chat2', 'TOPLEFT', 'TOPLEFT', 90, -70) local p, _, r, x, y = ChatFrame2:GetPoint(1) __p = { p, r, x, y }");
  expect(addon.eval("return __p"), "dragged there").toEqual(["TOPLEFT", "TOPLEFT", 90, -70]);
  expect(addon.eval("return ns.MoverPoint('chat1')"), "the main window is Chat's own mover, not this one's").toBeFalsy();
  const docked = loggedIn(ENV.replace('"General", "Loot"\n', '"General", "Loot"\n  GetChatWindowInfo = function(i) return ({ "General", "Loot" })[i], 12, 1, 1, 1, 1, 1, 0, 1 end\n'), { savedVariables: 'VanguardDB.profiles = { Default = { ChatWindows = { movers = true } } }' });
  expect(docked.eval("return ns.MoverPoint('chat2')"), "a docked window is not").toBeFalsy();
  expect(addon.eval("return #ns.errors") + docked.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat windows: nothing happens without the movers switch, and a client without the layout calls or windows is fine", () => {
  const off = loggedIn(ENV);
  expect(off.eval("return ns.MoverPoint('chat2')"), "off: no mover").toBeFalsy();
  const bare = loggedIn(`ChatFrame2 = nil FCF_SetLocked = nil FCF_SavePositionAndDimensions = nil GetChatWindowInfo = nil
    __wfgWorld.chatWindows[1] = "General" ChatFrame1:SetSize(400, 150)`, { savedVariables: 'VanguardDB.profiles = { Default = { ChatWindows = { movers = true } } }' });
  const out = bare.eval(`local CW = ns.GetModule("ChatWindows") local g, s = CW.LockSetting() s(true) local w, ws = CW.SizeSetting(ChatFrame1, false) ws(450)
    return { #CW.Windows(), g(), ChatFrame1:GetWidth() }`);
  expect(out, "no windows without the info call; unlocked; the size still sets").toEqual([0, false, 450]);
  expect(bare.eval("return #ns.errors"), "no errors").toBe(0);
});

// TEST-ONLY game tab calls: message groups per window, rename and close.
const TABS = `
  __groups = {}
  ChatFrame_ContainsMessageGroup = function(frame, g) return (__groups[frame:GetName()] or {})[g] == true end
  ChatFrame_AddMessageGroup = function(frame, g) __groups[frame:GetName()] = __groups[frame:GetName()] or {} __groups[frame:GetName()][g] = true end
  ChatFrame_RemoveMessageGroup = function(frame, g) __groups[frame:GetName()][g] = nil end
  FCF_SetWindowName = function(frame, name) __wfgWorld.chatWindows[tonumber(frame:GetName():match("%d+"))] = name end
  FCF_Close = function(frame) __closed = frame:GetName() __wfgWorld.chatWindows[tonumber(frame:GetName():match("%d+"))] = nil frame:Hide() end
`;
// A row on the Chat page, by caption.
const chatRow = (cap) => `${PAGE} local r for _, row in ipairs(page.rows()) do if row[2] == "${cap}" then r = row end end`;

it("chat tabs: the tab picker lists the windows showing; a pick edits that one", () => {
  const addon = loggedIn(ENV + TABS);
  expect(addon.eval(`${chatRow("Tab")} return { r[3][1][2], r[3][2][2], r[4]() }`), "both windows listed, the main one picked").toEqual(["General", "Loot", 1]);
  addon.eval(`${chatRow("Tab")} r[5](2)`);
  expect(addon.eval(`${chatRow("Tab")} return r[4]()`), "now Loot").toBe(2);
  addon.eval("ns.GetModule('ChatWindows').editing = 9");
  expect(addon.eval(`${chatRow("Tab")} return r[4]()`), "a gone window falls back to the main one").toBe(1);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat tabs: Show switches add and remove a message group on the picked tab", () => {
  const addon = loggedIn(ENV + TABS);
  addon.eval(`${chatRow("Tab")} r[5](2) ${chatRow("Show Loot")} r[4](true)`);
  expect(addon.eval(`${chatRow("Show Loot")} return { r[3](), __groups.ChatFrame2.LOOT, __groups.ChatFrame1 == nil }`), "set on Loot's window only").toEqual([true, true, true]);
  addon.eval(`${chatRow("Show Loot")} r[4](false)`);
  expect(addon.eval(`${chatRow("Show Loot")} return r[3]()`), "and off again").toBe(false);
  const bare = loggedIn(ENV);
  expect(bare.eval(`${chatRow("Show Say")} r[4](true) return r[3]()`), "a client without the group calls shows nothing and breaks nothing").toBe(false);
  expect(addon.eval("return #ns.errors") + bare.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat tabs: New makes a tab and picks it; Rename renames the picked tab; names are cleaned; Close shuts any but the main tab", () => {
  const addon = loggedIn(ENV + TABS);
  addon.eval(`${chatRow("New chat tab")} r[3]() local box = Vanguard_TextBox or nil`);
  addon.eval(`local CW = ns.GetModule("ChatWindows") CW.New("  Trade|cffff0000 and more words than fit  ")`);
  expect(addon.eval(`return { __wfgWorld.chatWindows[3], ns.GetModule("ChatWindows").editing }`), "a cleaned, clipped name, and the new tab is picked").toEqual(["Tradecffff0000 a", 3]);
  addon.eval(`${chatRow("Rename this tab")} r[3]() ns.GetModule("ChatWindows").Rename("Barter")`);
  expect(addon.eval("return __wfgWorld.chatWindows[3]"), "renamed").toBe("Barter");
  addon.eval(`ns.GetModule("ChatWindows").Close()`);
  expect(addon.eval("return { __closed, ns.GetModule('ChatWindows').editing == nil }"), "closed, and the picker goes back").toEqual(["ChatFrame3", true]);
  addon.eval(`${chatRow("Close this tab")} r[3]()`);
  expect(addon.eval("return __closed"), "the main tab is not closed").toBe("ChatFrame3");
  addon.eval(`local CW = ns.GetModule("ChatWindows") CW.New("") CW.Rename("   ")`);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat tabs: two new tabs asked for in one fight are both made when it ends", () => {
  const addon = loggedIn(ENV + TABS);
  addon.world.combat(true);
  addon.eval(`local CW = ns.GetModule("ChatWindows") CW.New("Trade") CW.New("Barter")`);
  expect(addon.eval("return __wfgWorld.chatWindows[3] == nil"), "nothing made in the fight").toBe(true);
  addon.world.combat(false);
  expect(addon.eval("return { __wfgWorld.chatWindows[3], __wfgWorld.chatWindows[4] }"), "both tabs after it").toEqual(["Trade", "Barter"]);
});

it("chat tabs: two tabs closed in one fight are both closed when it ends", () => {
  const addon = loggedIn(ENV + TABS + "local close = FCF_Close __allClosed = {} FCF_Close = function(f) close(f) table.insert(__allClosed, f:GetName()) end");
  addon.eval(`ns.GetModule("ChatWindows").New("Trade")`);
  addon.world.combat(true);
  addon.eval(`local CW = ns.GetModule("ChatWindows") CW.editing = 2 CW.Close() CW.editing = 3 CW.Close()`);
  addon.world.combat(false);
  expect(addon.eval("return __allClosed"), "both closed after the fight").toEqual(["ChatFrame2", "ChatFrame3"]);
});

it("chat tabs: a client without the calls says so and changes nothing", () => {
  const addon = loggedIn(ENV + "FCF_OpenNewWindow = nil");
  addon.eval(`local CW = ns.GetModule("ChatWindows") CW.New("Trade") CW.Rename("Barter") CW.Close()`);
  expect(addon.eval("return __wfgWorld.chatWindows[1]"), "nothing renamed").toBe("General");
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

// TEST-ONLY lines in the windows: a coloured one, a hidden one, and a line holding a link.
const LINES = `
  __lines1 = { "|cffff8000[General]|r Hello Sword world", { __secret = true }, "nothing here", "two Sword lines |Hitem:1|h[Big Sword]|h" }
  ChatFrame1.GetNumMessages = function() return #__lines1 end
  ChatFrame1.GetMessageInfo = function(_, i) return __lines1[i] end
`;

// The find box as the player sees it: shown, its title, the query field's text and focus, the lines in its box.
const FIND = "local f = Vanguard_FindDialog return { f:IsShown(), f.title:GetText(), f.query:GetText() or '', f.query:GetParent() == f, Vanguard_FindEdit:GetText() or '' }";
// A word in the accent's text colour, as the find box marks a match.
const lit = (addon, word) => addon.eval(`return ns.Theme.Paint("${word}", "accentText")`);

it("chat find: the Find button opens the find box with the word field at the top; Enter or Find lists the matching lines with each match in the accent colour, hidden lines left out", () => {
  const addon = loggedIn(ENV + LINES);
  addon.eval("local b = ns.GetModule('ChatWindows').findButton b.__scripts.OnClick(b)");
  expect(addon.eval(FIND), "the box opens titled Find in chat, its own empty field at the top, nothing listed yet").toEqual([true, "Find in chat", "", true, ""]);
  expect(addon.eval("local f = Vanguard_FindDialog local p = f.query.__points.RIGHT local g = f.go.__points.TOPRIGHT return { p.rel == f.go, p.relPoint, p.x, g.x, g.y, f.view.__points.TOPLEFT.y < g.y - f.go:GetHeight() }"), "the field ends a gap left of the Find button at the top right, and the lines start under them").toEqual([true, "LEFT", -8, -16, -40, true]);
  addon.type("Vanguard_FindDialog.query", "  SWORD ");
  addon.enter("Vanguard_FindDialog.query");
  const sword = lit(addon, "Sword");
  expect(addon.eval(FIND).slice(1), "Enter finds: the title says how many, the field keeps the word, and the lines show as words with each match lit (case does not matter)")
    .toEqual(['Chat: 2 lines with "sword"', "  SWORD ", true, `[General] Hello ${sword} world\ntwo ${sword} lines [Big ${sword}]`]);
  addon.eval("Vanguard_FindDialog.query:SetText('WORLD') local b = Vanguard_FindDialog.go b.__scripts.OnClick(b)");
  expect(addon.eval(FIND).slice(1, 2).concat(addon.eval(FIND).slice(4)), "a second search from the same box, by the Find button").toEqual(['Chat: 1 lines with "world"', `[General] Hello Sword ${lit(addon, "world")}`]);
  addon.eval("Vanguard_FindDialog.query:SetText('  ') local b = Vanguard_FindDialog.go b.__scripts.OnClick(b)");
  expect([addon.eval(FIND)[1], chatHas(addon, /Type something to find\./)], "an empty word says so in chat and leaves the last lines").toEqual(['Chat: 1 lines with "world"', true]);
  addon.eval("local b = Vanguard_FindDialog.close b.__scripts.OnClick(b)");
  expect(addon.eval(FIND)[0], "Close shuts it").toBe(false);
  addon.eval("ns.GetModule('ChatWindows').AskFind()");
  expect(addon.eval(FIND).slice(0, 3), "opened again it keeps the last word, selected to type over").toEqual([true, "Find in chat", "  "]);
  addon.eval("Vanguard_FindDialog.query:GetScript('OnEscapePressed')(Vanguard_FindDialog.query)");
  expect(addon.eval(FIND)[0], "Escape in the field shuts it").toBe(false);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat find: the find box and the copy box never stack; the one opening takes the other's spot and the other closes", () => {
  const addon = loggedIn(ENV + LINES);
  addon.eval("ns.GetModule('ChatWindows').AskFind() Vanguard_FindDialog:ClearAllPoints() Vanguard_FindDialog:SetPoint('TOPLEFT', UIParent, 'TOPLEFT', 30, -40)");
  addon.eval("ns.GetModule('ChatExtras').ShowCopy()");
  // A dialog's first anchor, with whether it is on UIParent.
  const spot = (name) => addon.eval(`local p, rel, rp, x, y = ${name}:GetPoint() return { p, rel == UIParent, rp, x, y }`);
  expect(addon.eval("return { Vanguard_FindDialog:IsShown(), Vanguard_TextDialog:IsShown() }"), "Copy closes the find box").toEqual([false, true]);
  expect(spot("Vanguard_TextDialog"), "and opens where it was").toEqual(["TOPLEFT", true, "TOPLEFT", 30, -40]);
  addon.eval("Vanguard_TextDialog:ClearAllPoints() Vanguard_TextDialog:SetPoint('CENTER', UIParent, 'CENTER', 5, 6) ns.GetModule('ChatWindows').AskFind()");
  expect(addon.eval("return { Vanguard_FindDialog:IsShown(), Vanguard_TextDialog:IsShown() }"), "Find closes the copy box").toEqual([true, false]);
  expect(spot("Vanguard_FindDialog"), "and opens where it was").toEqual(["CENTER", true, "CENTER", 5, 6]);
  addon.eval("ns.AskText('TEST-ONLY ask', function() end)");
  expect(addon.eval("return { Vanguard_FindDialog:IsShown(), Vanguard_TextDialog:IsShown() }"), "a typing box closes it too").toEqual([false, true]);
});

it("chat find: saved history that no window shows is searched too, and only the newest lines are listed", () => {
  const addon = loggedIn(ENV + LINES, { savedVariables: 'VanguardCharDB = { chatHistory = { [1] = { "5|ffffff|old Sword talk", "6|ffffff|two Sword lines |Hitem:1|h[Big Sword]|h", "bad" }, [7] = "nope" } }' });
  const sword = lit(addon, "Sword");
  expect(addon.eval("return select(2, ns.GetModule('ChatWindows').Find('sword'))"), "the old saved line first, the duplicate of a showing line once").toBe(`old ${sword} talk\n[General] Hello ${sword} world\ntwo ${sword} lines [Big ${sword}]`);
  addon.eval("ns.GetModule('ChatWindows').MAX_FOUND = 1");
  expect(addon.eval("return (ns.GetModule('ChatWindows').Find('sword'))"), "capped to the newest").toBe('Chat: 1 lines with "sword"');
});

it("chat find: the Chat page has the button and the switch; off, no button, and the switch shows and hides it at once; a window without line reads is fine", () => {
  const off = loggedIn(ENV, { savedVariables: 'VanguardDB.profiles = { Default = { ChatWindows = { find = false } } }' });
  expect(off.eval("return ns.GetModule('ChatWindows').findButton == nil"), "switched off: no button").toBe(true);
  off.eval(`${chatRow("Find button in the chat's tab bar")} r[4](true)`);
  expect(off.eval("return ns.GetModule('ChatWindows').findButton:IsShown()"), "the switch makes and shows the button at once").toBe(true);
  off.eval(`${chatRow("Find button in the chat's tab bar")} r[4](false)`);
  expect(off.eval("return { ns.GetModule('ChatWindows').findButton:IsShown(), ns.GetModule('ChatWindows').settings.find }"), "and hides it again, no reload").toEqual([false, false]);
  expect(off.eval(`${PAGE} local out = {} for _, r in ipairs(page.rows()) do if r[1] == "header" then out[#out + 1] = r[2] end end return out`), "the page's groups, the extras under a header of their own").toEqual(["Chat", "Chat windows", "Chat tabs", "Chat extras", "Chat history", "Chat watch", "Chat filter", "Group board"]);
  const addon = loggedIn(ENV);
  addon.eval(`${PAGE} for _, r in ipairs(page.rows()) do if r[2] == "Find in chat" then r[3]() end end`);
  expect(addon.eval("return Vanguard_FindDialog:IsShown()"), "the Chat page's Find in chat opens the same find box").toBe(true);
  addon.eval("ChatFrame1.GetNumMessages = nil");
  expect(addon.eval("return { ns.GetModule('ChatWindows').Find('x') }"), "a window that can't be read has no lines").toEqual(['Chat: 0 lines with "x"', ""]);
  const bare = loggedIn("ChatFrame1 = nil");
  expect(bare.eval("return ns.GetModule('ChatWindows').findButton == nil"), "no main window, no button").toBe(true);
});

// TEST-ONLY: General and Loot both docked (GetChatWindowInfo's ninth value), a Loot line the
// window holds, and the game's lock recorded; the dock hides every docked window but the selected one.
const DOCKED_ENV = `
  __wfgWorld.chatWindows[1], __wfgWorld.chatWindows[2] = "General", "Loot"
  GetChatWindowInfo = function(i) local name = __wfgWorld.chatWindows[i] if name then return name, 12, 1, 1, 1, 1, 1, 0, 1 end end
  __loot = { "You receive loot: TEST-ONLY Sword of the Magistrate" }
  ChatFrame2.GetNumMessages = function() return #__loot end
  ChatFrame2.GetMessageInfo = function(_, i) return __loot[i] end
  __locks = {}
  FCF_SetLocked = function(frame, v) __locks[frame:GetName()] = v end
  ChatFrame2:Hide()
`;
it("chat windows: a docked tab behind the selected one is still a window: Find reads the hidden docked tab's lines", () => {
  const addon = loggedIn(DOCKED_ENV);
  expect(addon.eval("return (ns.GetModule('ChatWindows').Find('sword'))")).toBe('Chat: 1 lines with "sword"');
});

it("chat windows: a docked tab behind the selected one is still a window: the Tab choice offers every docked tab, and Lock locks them all", () => {
  const addon = loggedIn(DOCKED_ENV);
  const CW = "ns.GetModule('ChatWindows')";
  expect(addon.eval(`local out = {} for _, c in ipairs(${CW}.TabChoices()) do out[#out + 1] = c[2] end return out`), "General and the hidden Loot").toEqual(["General", "Loot"]);
  addon.eval(`local _, set = ${CW}.LockSetting() set(true)`);
  expect(addon.eval("return { __locks.ChatFrame1, __locks.ChatFrame2 }"), "both locked").toEqual([true, true]);
});

it("chat windows: a docked tab behind the selected one is still a window: the size sliders stay for the windows showing, and a closed window is left out", () => {
  const addon = loggedIn(DOCKED_ENV + "GetChatWindowInfo = function(i) local name = __wfgWorld.chatWindows[i] if name then return name, 12, 1, 1, 1, 1, 1, 0, i == 1 and 1 or 0 end end");
  const CW = "ns.GetModule('ChatWindows')";
  expect(addon.eval(`return { #${CW}.Shown(), #${CW}.Windows() }`), "Loot neither shown nor docked (closed): only General").toEqual([1, 1]);
});

it("chat tabs: a tab name is cut at 16 characters, not 16 bytes: keeps 16 whole letters of an accented or Cyrillic name", () => {
  const addon = loggedIn("");
  // The cleaned name and its length in bytes.
  const clean = (text) => addon.eval(`local n = ns.GetModule('ChatWindows').CleanName("${text}") return { n, #n }`);
  expect(clean("Ventes à l’hôtel des ventes"), "16 letters, ending on a whole one").toEqual(["Ventes à l’hôtel", 20]);
  expect(clean("Торговля и обмен"), "a 16-letter Cyrillic name is kept whole").toEqual(["Торговля и обмен", 30]);
});
