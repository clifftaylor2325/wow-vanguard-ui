// taint-harness: the TEST-ONLY client's taint rules (scripts/lib/wow-taint.lua): combat lockdown on protected
// frames and field writes on the game's frames, what a test leans on to catch a taint path.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

// Runs Lua as if it were a line of one of the addon's files (Modules/TEST-ONLY.lua).
const asAddon = (addon, lua) => addon.eval(`assert(load(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))()`);

// The rule breaks recorded so far, by text, then forgotten.
const violations = (addon) => addon.eval(`local out = {} for _, v in ipairs(__wfgStub.violations) do out[#out + 1] = v.text end
  __wfgStub.clearViolations() return out`);

// Protected calls from the documented set; Raise leaves a frame already above the others where it is.
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

// A game frame with a field the game set (layoutIndex), as test code stands in for the game's frames.
const GAME_FRAME = 'CreateFrame("Frame", "TestGameFrame", UIParent).layoutIndex = 3';

it("addon code overwriting a field the game set on its frame is recorded, and the new value reads back", () => {
  const addon = createAddon();
  addon.eval(GAME_FRAME);
  asAddon(addon, "TestGameFrame.layoutIndex = 99");
  expect(violations(addon)).toEqual(["field write: Modules/TEST-ONLY.lua:1 stored the field layoutIndex on the game's frame TestGameFrame"]);
  expect(addon.eval("return TestGameFrame.layoutIndex"), "the write still lands").toBe(99);
  expect(addon.eval('return { __wfgStub.ownField(TestGameFrame, "layoutIndex"), __wfgStub.ownField(TestGameFrame, "__name") }'),
    "ownField reads a kept field and a stub field").toEqual([99, "TestGameFrame"]);
});

it("game or test code overwriting a field on the game's frame is not recorded", () => {
  const addon = createAddon();
  addon.eval(`${GAME_FRAME} TestGameFrame.layoutIndex = 7`);
  expect(addon.eval("return { #__wfgStub.violations, TestGameFrame.layoutIndex }")).toEqual([0, 7]);
});
