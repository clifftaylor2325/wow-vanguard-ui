// The lifecycle of the A4-2d modules (on the unit frames): each switches off and on without a reload. The three
// standard cases (scripts/tests/lifecycle-helpers.mjs) on the real module, plus a case for anything its Disable does.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { HEAVY, modulesOffLua } from "../lib/login-scope.mjs";
import { SETUP_DONE } from "./helpers.mjs";
import { lifecycleCases } from "./lifecycle-helpers.mjs";

// The modules these cases need on: the unit frames the others sit on, and the heavy ones this batch converts.
const KEEP = ["UnitFrames", "FrameAuras", "RaidTools"];

// A login with the other heavy modules off, `settings` Lua run on the saved variables, then `saved` (a module
// switch from moduleOff), and `env` Lua run before the login (a class, a unit).
const loginWith = (settings = "", env = "") => (saved = "") => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => !KEEP.includes(n))) + settings + saved });
  if (env) addon.eval(env);
  addon.login();
  return addon;
};

// The player is a rogue with some combo points.
const ROGUE = 'UnitClass = function() return "Rogue", "ROGUE" end GetComboPoints = function() return 2 end';

const login = loginWith();

// FrameAuras ----------------------------------------------------------------------------------------------------

lifecycleCases("FrameAuras", login);

it("lifecycle: frame auras switched off empties and hides the target's rows, and on again shows the same ones", () => {
  const addon = login();
  const rows = 'local f = ns.GetModule("UnitFrames").frames.target return f.debuffs.frame:IsShown()';
  expect(addon.eval(rows)).toBe(true);
  addon.eval('ns.SetModuleEnabled("FrameAuras", false)');
  expect(addon.eval(rows)).toBe(false);
  addon.eval('ns.SetModuleEnabled("FrameAuras", true)');
  expect(addon.eval(rows)).toBe(true);
});

it("lifecycle: frame auras can't start while the unit frames are off", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE + modulesOffLua(HEAVY.filter((n) => n !== "FrameAuras")) });
  addon.login();
  expect(addon.eval('return ns.ModuleLive("FrameAuras")')).toBe(false);
});

// ComboPoints ---------------------------------------------------------------------------------------------------

const ROGUE_LOGIN = loginWith("", ROGUE);

lifecycleCases("ComboPoints", ROGUE_LOGIN);

it("lifecycle: combo points switched off hides the row, and on again shows the same row", () => {
  const addon = ROGUE_LOGIN();
  const shown = 'return ns.GetModule("ComboPoints").bar:IsShown()';
  expect(addon.eval(shown)).toBe(true);
  addon.eval('ns.SetModuleEnabled("ComboPoints", false)');
  expect(addon.eval(shown)).toBe(false);
  addon.eval('local CP = ns.GetModule("ComboPoints") local bar = CP.bar ns.SetModuleEnabled("ComboPoints", true) __same = bar == CP.bar');
  expect(addon.eval("return __same")).toBe(true);
  expect(addon.eval(shown)).toBe(true);
});
