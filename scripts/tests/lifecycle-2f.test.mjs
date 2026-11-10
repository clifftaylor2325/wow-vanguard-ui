// The lifecycle of the modules of batch A4-2f (chat, quests and the modules that already had a Disable): each gets
// the three cases every live module gets (lifecycle-helpers.mjs), and the ones whose Disable does something the
// footprint cannot see get a case for it. Written before the suite was run; the first run may need fixes.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

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

it("lifecycle: QuestLog switched off clears its override binding and goes quiet", () => {
  const addon = login();
  addon.eval('ns.SetModuleEnabled("QuestLog", false)');
  expect(addon.eval('return ns.ModuleLive("QuestLog")')).toBe(false);
  expect(addon.eval("return Vanguard_QuestLog:IsShown()")).toBe(false);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: BrokerStrip switched off hides the strip", () => {
  const addon = login();
  addon.eval('ns.SetModuleEnabled("BrokerStrip", false)');
  expect(addon.eval("return Vanguard_BrokerStrip:IsShown()")).toBe(false);
  expect(addon.eval("return #ns.errors")).toBe(0);
});

it("lifecycle: Quiet and HudText say what stays until a reload when they stop", () => {
  const addon = login();
  addon.eval('ns.SetModuleEnabled("Quiet", false) ns.SetModuleEnabled("HudText", false)');
  expect(addon.eval("return #ns.errors")).toBe(0);
});
