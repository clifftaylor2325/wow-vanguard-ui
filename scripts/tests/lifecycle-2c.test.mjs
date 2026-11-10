// The lifecycle of the A4-2c modules (listeners and stored data): each switches off and on without a reload. The three
// standard cases (scripts/tests/lifecycle-helpers.mjs) on the real module, plus a case for anything its Disable does,
// and for what it does for the player or keeps (stopped means it does nothing, and the stored data stays).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE, chatHas } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// A login with the heavy modules off (except those in `keep`) and `settings` Lua run on the saved variables, then
// `saved` (a module switch from moduleOff).
const loginWith = (settings = "", keep = []) => (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => !keep.includes(n))) + settings + saved });
  addon.login();
  return addon;
};

// AutoAccept ----------------------------------------------------------------------------------------------------

const AUTO_ACCEPT = loginWith("\nVanguardDB.profiles.Default.AutoAccept = { summons = true, resurrect = true, loot = true }");

// The game's answers to its prompts, logged in __answers.
const PROMPTS = `
  __answers = {}
  local function log(text) return function() __answers[#__answers + 1] = text end end
  C_SummonInfo = { ConfirmSummon = log("summon"), GetSummonConfirmSummoner = function() return "<name>" end, GetSummonConfirmAreaName = function() return "TEST-ONLY Vale" end }
  AcceptResurrect = log("resurrect")
  StaticPopup_Hide = function(which) __answers[#__answers + 1] = "close " .. which end
`;

lifecycleCases("AutoAccept", AUTO_ACCEPT);

it("lifecycle: auto-accept switched off does nothing at all, and on again answers the prompts as before", () => {
  const addon = AUTO_ACCEPT();
  addon.eval(PROMPTS);
  addon.eval('ns.SetModuleEnabled("AutoAccept", false)');
  addon.fire("CONFIRM_SUMMON");
  addon.fire("RESURRECT_REQUEST", "<name>");
  addon.eval('ns.GetModule("AutoAccept").AcceptSummon()');
  addon.advance(1);
  expect(addon.eval("return #__answers"), "nothing answered, nothing closed").toBe(0);
  expect(chatHas(addon, /Accepted a/), "and nothing said").toBe(false);
  addon.eval('ns.SetModuleEnabled("AutoAccept", true)');
  addon.fire("RESURRECT_REQUEST", "<name>");
  expect(addon.eval("return __answers[1]")).toBe("resurrect");
});
