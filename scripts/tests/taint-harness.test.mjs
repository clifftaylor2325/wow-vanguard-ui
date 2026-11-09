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

it("the game's action, pet, stance, raid and boss frames are protected by name, and a bar holding one is too", () => {
  const addon = createAddon();
  addon.eval(`TestBar = CreateFrame("Frame", "TestBar", UIParent)
    for _, name in ipairs({ "ActionButton1", "MultiBarBottomLeftButton3", "PetActionButton2", "StanceButton1", "CompactRaidFrame12", "Boss2TargetFrame" }) do
      CreateFrame("CheckButton", name, TestBar)
    end
    TestPlain = CreateFrame("Frame", "ActionButtonless", UIParent)`);
  addon.world.combat(true);
  asAddon(addon, "ActionButton1:Hide() Boss2TargetFrame:SetPoint('CENTER') CompactRaidFrame12:Hide() TestBar:Hide() TestPlain:Hide()");
  const texts = violations(addon);
  expect(texts.map((t) => t.replace(/^.* called (\w+) on the protected frame /, "$1 ")), "blocked: the button, the boss frame, the raid tile and the bar; not a look-alike name")
    .toEqual(["Hide ActionButton1", "SetPoint Boss2TargetFrame", "Hide CompactRaidFrame12", "Hide TestBar"]);
});

it("an addon frame given a game frame's name is not taken for the game's", () => {
  const addon = createAddon();
  asAddon(addon, 'CreateFrame("Button", "ActionButton1", UIParent)');
  addon.world.combat(true);
  asAddon(addon, "ActionButton1:Hide()");
  expect(addon.eval("return #__wfgStub.violations")).toBe(0);
});

it("world.forbid closes a game frame and the game's widgets under it to addon code, and leaves the addon's own open", () => {
  const addon = createAddon();
  addon.eval(`TestPlate = CreateFrame("Frame", nil, UIParent) TestIcon = TestPlate:CreateTexture()`);
  asAddon(addon, "TestMine = CreateFrame('Frame', nil, TestPlate)");
  addon.eval("__wfgWorld.forbid(TestPlate)");
  // Whether an addon call on that widget raised, and the text it raised with.
  const tryAddon = (lua) => addon.eval(`local ok, e = pcall(assert(load(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))) return { ok, ok and "" or tostring(e) }`);
  expect(tryAddon("TestPlate:ClearAllPoints()"), "the plate refuses").toEqual([false, "Modules/TEST-ONLY.lua:1: Attempt to access forbidden object from code tainted by an AddOn"]);
  expect(tryAddon("TestIcon:SetTexture(1)")[0], "its texture refuses").toBe(false);
  expect(tryAddon("return TestPlate:IsForbidden() and TestIcon:IsForbidden()"), "both say so, to the addon too").toEqual([true, ""]);
  expect(tryAddon("TestMine:SetAlpha(0.5)"), "the addon's own frame stays open").toEqual([true, ""]);
  expect(addon.eval("TestPlate:SetAlpha(0.5) return TestPlate:GetAlpha()"), "test code still reaches it").toBe(0.5);
});

it("a secret answers type() as the value it hides, to the addon and to test code; the harness reads the raw type", () => {
  const addon = createAddon();
  expect(addon.eval(`local s, t = __wfgWorld.secret(5), __wfgWorld.secret("TEST-ONLY")
    return { type(s), type(t), type(__wfgWorld.secret(nil)), __wfgRawType(s), issecretvalue(s), type({}), type(3) }`))
    .toEqual(["number", "string", "number", "table", true, "table", "number"]);
  expect(addon.eval("local ok = pcall(function() local s = __wfgWorld.secret(5) return type(s) == 'number' and s > 0 end) return ok"), "a type gate lets it through to the compare, which errors").toBe(false);
});
