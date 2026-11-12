// The lifecycle of the modules of batch A4-2f (chat, quests and the modules that already had a Disable): each gets
// the three cases every live module gets (lifecycle-helpers.mjs), and the ones whose Disable does something the
// footprint cannot see get a case for it. Written before the suite was run; the first run may need fixes.

import { describe, expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE, chatHas } from "./helpers.mjs";
import { lifecycleCases, moduleOff } from "./lifecycle-helpers.mjs";

// The addon logged in with the heavy modules off, and `saved` Lua run after the saved variables.
function login(saved = "") {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + saved });
  addon.login();
  return addon;
}

const MODULES = [
  "ChatHistory", "ChatFilter", "Quiet", "ChatExtras", "ChatWindows", "QuestDialog", "QuestLog",
  "CooldownKeys", "CooldownGlow", "DataBars", "BrokerStrip", "HudText", "Situations",
];
for (const name of MODULES) lifecycleCases(name, login);

// Lua for a second chat window in use, pulled out of the dock (a floating window).
const FLOATING = '__wfgWorld.chatWindows[1], __wfgWorld.chatWindows[2] = "General", "Loot" ChatFrame2:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 50, -60)';

// The addon logged in with a floating chat window and ChatWindows' "Move floating windows" on, then `saved`.
function floatingLogin(saved = "") {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) + "\nVanguardDB.profiles.Default.ChatWindows = { movers = true }" + saved });
  addon.eval(FLOATING);
  addon.login();
  return addon;
}

describe("ChatWindows with Move floating windows on", () => lifecycleCases("ChatWindows", floatingLogin));

it("lifecycle: ChatWindows switched off lets the floating window go: no handle, and the game may move it", () => {
  const addon = floatingLogin();
  addon.eval('ns.SetModuleEnabled("ChatWindows", false)');
  addon.eval('ChatFrame2:ClearAllPoints() ChatFrame2:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 200, -200)');
  addon.advance(0.1);
  expect(addon.eval("local p, _, r, x, y = ChatFrame2:GetPoint(1) return { ns.MoverFrame('chat2') == nil, p, x, y }")).toEqual([true, "TOPLEFT", 200, -200]);
  addon.eval('ns.SetModuleEnabled("ChatWindows", true)');
  expect(addon.eval("return ns.MoverFrame('chat2') == ChatFrame2"), "on again: its handle back").toBe(true);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: QuestDialog switched off gives the game's quest and gossip windows their events back", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) });
  addon.eval('QuestFrame = CreateFrame("Frame", "QuestFrame") QuestFrame:RegisterEvent("QUEST_DETAIL")');
  addon.login();
  // Whether the game's window listens for the event.
  const has = (frame, event) => addon.eval(`return ${frame}:IsEventRegistered("${event}")`);
  expect(has("QuestFrame", "QUEST_DETAIL"), "taken while the dialog runs").toBe(false);
  addon.eval('ns.SetModuleEnabled("QuestDialog", false)');
  expect(has("QuestFrame", "QUEST_DETAIL"), "given back").toBe(true);
  addon.eval('ns.SetModuleEnabled("QuestDialog", true)');
  expect(has("QuestFrame", "QUEST_DETAIL"), "taken again").toBe(false);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: with QuestDialog off, the hand-back switch never takes the game's windows' events", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) });
  addon.eval('QuestFrame = CreateFrame("Frame", "QuestFrame") QuestFrame:RegisterEvent("QUEST_DETAIL")');
  addon.login();
  addon.eval('ns.SetModuleEnabled("QuestDialog", false) local QD = ns.GetModule("QuestDialog") QD.HandBack(true) QD.HandBack(false)');
  expect(addon.eval('return QuestFrame:IsEventRegistered("QUEST_DETAIL")'), "switched off: the game keeps its window").toBe(true);
  addon.eval('ns.SetModuleEnabled("QuestDialog", true)');
  expect(addon.eval('return QuestFrame:IsEventRegistered("QUEST_DETAIL")'), "switched on again: the dialog takes it").toBe(false);
  addon.eval('local _, set = ns.Options.RestartSetting("QuestDialog", "dialog") set(false) local QD = ns.GetModule("QuestDialog") QD.HandBack(true) QD.HandBack(false)');
  expect(addon.eval('return QuestFrame:IsEventRegistered("QUEST_DETAIL")'), "its dialog row off: the game keeps it too").toBe(true);
});

it("lifecycle: QuestLog switched off clears its override binding and goes quiet", () => {
  const addon = login();
  addon.eval('__cleared = {} local old = ClearOverrideBindings ClearOverrideBindings = function(owner) __cleared[#__cleared + 1] = owner return old(owner) end');
  addon.eval('ns.SetModuleEnabled("QuestLog", false)');
  expect(addon.eval('for _, o in ipairs(__cleared) do if o == ns.GetModule("QuestLog").toggle then return true end end return false'), "the toggle's key handed back").toBe(true);
  expect(addon.eval('return ns.ModuleLive("QuestLog")')).toBe(false);
  expect(addon.eval("return Vanguard_QuestLog:IsShown()")).toBe(false);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: BrokerStrip switched off hides the strip", () => {
  const addon = login();
  addon.eval("Vanguard_BrokerStrip:Show()");
  expect(addon.eval("return Vanguard_BrokerStrip:IsShown()"), "shown first").toBe(true);
  addon.eval('ns.SetModuleEnabled("BrokerStrip", false)');
  expect(addon.eval("return Vanguard_BrokerStrip:IsShown()")).toBe(false);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: Quiet and HudText say what stays until a reload when they stop", () => {
  const addon = login();
  addon.eval('ns.SetModuleEnabled("Quiet", false) ns.SetModuleEnabled("HudText", false)');
  expect([chatHas(addon, /stay hidden until you reload/), chatHas(addon, /keep Vanguard's font until you reload/)]).toEqual([true, true]);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: DataBars switched off gives the game's XP bar its Edit Mode handle back, and on again takes it", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY) });
  addon.eval(`local f = CreateFrame("Frame", "StatusTrackingBarManager", UIParent) f.Selection = CreateFrame("Frame", nil, f)
    function f:HighlightSystem() self.Selection:Show() end`);
  addon.login();
  // Whether the bar's Edit Mode handle shows after Edit Mode highlights it.
  const handle = () => addon.eval("StatusTrackingBarManager:HighlightSystem() return StatusTrackingBarManager.Selection:IsShown()");
  expect(handle(), "Vanguard's bars on: no handle").toBe(false);
  addon.eval('ns.SetModuleEnabled("DataBars", false)');
  expect(handle(), "off: the game's handle").toBe(true);
  addon.eval('ns.SetModuleEnabled("DataBars", true)');
  expect(handle(), "on again: none").toBe(false);
});

it("lifecycle: DataBars stopped, a late visibility repaint does not show its bars again", () => {
  const addon = login();
  addon.eval(`local DB = ns.GetModule("DataBars")
    DB.Line = function() return { cur = 50, max = 100, rested = 0 } end
    DB.Reputation = function() return { name = "Faction", standing = 5, cur = 10, max = 100 } end
    DB.UpdateXP() DB.UpdateReputation()`);
  const shown = 'local DB = ns.GetModule("DataBars") return { DB.xpBar:IsShown(), DB.repBar:IsShown() }';
  expect(addon.eval(shown), "both bars shown with a line each").toEqual([true, true]);
  addon.eval('ns.SetModuleEnabled("DataBars", false) local DB = ns.GetModule("DataBars") DB.UpdateXP() DB.UpdateReputation()');
  expect(addon.eval(shown)).toEqual([false, false]);
});

it("lifecycle: QuestLog stopped with the tracker off, a zone-in no longer opens the game's folded quest zones", () => {
  const addon = login(moduleOff("QuestTracker"));
  addon.eval('local QT = ns.GetModule("QuestTracker") __opened = 0 QT.OpenFolds = function() __opened = __opened + 1 end');
  addon.fire("PLAYER_ENTERING_WORLD");
  addon.advance(0.2);
  const running = addon.eval("return __opened");
  addon.eval('ns.SetModuleEnabled("QuestLog", false) __opened = 0');
  addon.fire("PLAYER_ENTERING_WORLD");
  addon.advance(0.2);
  expect([running > 0, addon.eval("return __opened")]).toEqual([true, 0]);
});
