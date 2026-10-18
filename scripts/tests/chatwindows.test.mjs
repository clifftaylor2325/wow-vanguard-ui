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
  const names = addon.eval(`${PAGE} local out = {} for _, r in ipairs(page.rows()) do if r[1] == "slider" and r[2]:find("General") or r[2]:find("Loot") then out[#out + 1] = r[2] end end return out`);
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
