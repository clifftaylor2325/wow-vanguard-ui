// taint-harness: the TEST-ONLY client's taint rules (scripts/lib/wow-taint.lua): combat lockdown on protected
// frames and field writes on the game's frames, what a test leans on to catch a taint path.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

// Runs Lua as if it were a line of one of the addon's files (Modules/TEST-ONLY.lua).
const asAddon = (addon, lua) => addon.eval(`assert(load(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))()`);

// The rule breaks recorded so far, by text, then forgotten.
const violations = (addon) => addon.eval(`local out = {} for _, v in ipairs(__wfgStub.violations) do out[#out + 1] = v.text end
  __wfgStub.clearViolations() return out`);

// Protected calls from the documented set: three the stub models and one it leaves to a no-op (Raise).
const CALLS = 'local b = TestSecure b:SetFrameLevel(77) b:EnableMouse(false) b:RegisterForClicks("AnyDown") b:Raise()';

it("documented protected methods are blocked on a secure button in combat and run out of combat", () => {
  const addon = createAddon();
  addon.eval('CreateFrame("Button", "TestSecure", UIParent, "SecureActionButtonTemplate") TestSecure:SetFrameLevel(5)');
  addon.world.combat(true);
  asAddon(addon, CALLS);
  // The text a blocked call records.
  const blocked = (name) => `blocked in combat: Modules/TEST-ONLY.lua:1 called ${name} on the protected frame TestSecure`;
  expect(violations(addon)).toEqual(["SetFrameLevel", "EnableMouse", "RegisterForClicks", "Raise"].map(blocked));
  expect(addon.eval("return TestSecure:GetFrameLevel()"), "the level did not move").toBe(5);
  addon.world.combat(false);
  asAddon(addon, CALLS);
  expect(addon.eval("return #__wfgStub.violations"), "out of combat nothing is blocked").toBe(0);
  expect(addon.eval("return TestSecure:GetFrameLevel()"), "the level moved").toBe(77);
});
