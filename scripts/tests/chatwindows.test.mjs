// chatwindows: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/ChatWindows.lua: each chat window's size and the game's lock from the Chat page, and
// floating windows as /vg unlock handles.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

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

it("chat find: the Find button asks what to find; matching lines of the windows show as plain text, hidden lines left out", () => {
  const addon = loggedIn(ENV + LINES);
  addon.eval("ns.ShowText = function(title, text) __shown = { title, text } end");
  addon.eval("local b = ns.GetModule('ChatWindows').findButton b.__scripts.OnClick(b)");
  expect(addon.eval("return Vanguard_TextDialog:IsShown()"), "the Find button opens the question").toBe(true);
  addon.eval("ns.GetModule('ChatWindows').Find('  SWORD ')");
  expect(addon.eval("return __shown"), "case does not matter; colours and links reduced to words").toEqual(['Chat: 2 lines with "sword"', "[General] Hello Sword world\ntwo Sword lines [Big Sword]"]);
  addon.eval("ns.GetModule('ChatWindows').Find('')");
  expect(addon.eval("return __shown[1]"), "an empty word asks again and shows nothing new").toBe('Chat: 2 lines with "sword"');
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("chat find: saved history that no window shows is searched too, and only the newest lines are listed", () => {
  const addon = loggedIn(ENV + LINES, { savedVariables: 'VanguardCharDB = { chatHistory = { [1] = { "5|ffffff|old Sword talk", "6|ffffff|two Sword lines |Hitem:1|h[Big Sword]|h", "bad" }, [7] = "nope" } }' });
  addon.eval("ns.ShowText = function(title, text) __shown = { title, text } end ns.GetModule('ChatWindows').Find('sword')");
  expect(addon.eval("return __shown[2]"), "the old saved line first, the duplicate of a showing line once").toBe("old Sword talk\n[General] Hello Sword world\ntwo Sword lines [Big Sword]");
  addon.eval("ns.GetModule('ChatWindows').MAX_FOUND = 1 ns.GetModule('ChatWindows').Find('sword')");
  expect(addon.eval("return __shown[1]"), "capped to the newest").toBe('Chat: 1 lines with "sword"');
});

it("chat find: the Chat page has the button and the switch; off, no button; a window without line reads is fine", () => {
  const off = loggedIn(ENV, { savedVariables: 'VanguardDB.profiles = { Default = { ChatWindows = { find = false } } }' });
  expect(off.eval("return ns.GetModule('ChatWindows').findButton == nil"), "switched off: no button").toBe(true);
  const addon = loggedIn(ENV);
  addon.eval(`${PAGE} for _, r in ipairs(page.rows()) do if r[2] == "Find in chat" then r[3]() end end`);
  expect(addon.eval("return Vanguard_TextDialog:IsShown()"), "the Chat page's Find in chat asks the same question").toBe(true);
  addon.eval("ChatFrame1.GetNumMessages = nil ns.ShowText = function(title) __shown = title end ns.GetModule('ChatWindows').Find('x')");
  expect(addon.eval("return __shown"), "a window that can't be read has no lines").toBe('Chat: 0 lines with "x"');
  const bare = loggedIn("ChatFrame1 = nil");
  expect(bare.eval("return ns.GetModule('ChatWindows').findButton == nil"), "no main window, no button").toBe(true);
});
