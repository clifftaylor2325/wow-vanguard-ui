// taint-harness: the TEST-ONLY client's taint rules (scripts/lib/wow-taint.lua): combat lockdown on protected
// frames and field writes on the game's frames, what a test leans on to catch a taint path.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

// Runs Lua as if it were a line of one of the addon's files (Modules/TEST-ONLY.lua).
const asAddon = (addon, lua) => addon.eval(`assert(loadstring(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))()`);

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
  const tryAddon = (lua) => addon.eval(`local ok, e = pcall(assert(loadstring(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))) return { ok, ok and "" or tostring(e) }`);
  expect(tryAddon("TestPlate:ClearAllPoints()"), "the plate refuses").toEqual([false, "Modules/TEST-ONLY.lua:1: Attempt to access forbidden object from code tainted by an AddOn"]);
  expect(tryAddon("TestIcon:SetTexture(1)")[0], "its texture refuses").toBe(false);
  expect(tryAddon("return TestPlate:IsForbidden() and TestIcon:IsForbidden()"), "both say so, to the addon too").toEqual([true, ""]);
  expect(tryAddon("TestMine:SetAlpha(0.5)"), "the addon's own frame stays open").toEqual([true, ""]);
  expect(addon.eval("TestPlate:SetAlpha(0.5) return TestPlate:GetAlpha()"), "test code still reaches it").toBe(0.5);
});

it("world.holdAccess holds a frame and what hangs from it back from addon code while IsForbidden says no, and releaseAccess lets go", () => {
  const addon = createAddon();
  addon.eval(`TestRow = CreateFrame("Frame", nil, UIParent) TestIcon = TestRow:CreateTexture()`);
  asAddon(addon, "TestEdge = CreateFrame('Frame', nil, TestRow)");
  addon.eval("__wfgWorld.holdAccess(TestRow)");
  // Whether an addon call raised, and what it returned or raised with.
  const tryAddon = (lua) => addon.eval(`local ok, e = pcall(assert(loadstring(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))) if ok then return { true, e } end return { false, tostring(e) }`);
  expect(tryAddon("local parent = TestRow:GetParent() return parent"), "the row refuses, GetParent too").toEqual([false, "Modules/TEST-ONLY.lua:1: Attempt to access forbidden object from code tainted by an AddOn"]);
  expect([tryAddon("TestIcon:SetAlpha(1)")[0], tryAddon("TestEdge:SetAlpha(1)")[0]], "its texture and the addon's own frame on it refuse").toEqual([false, false]);
  expect(tryAddon("return TestRow:IsForbidden() or TestRow:CanBeAccessedInContext()"), "not forbidden, and not reachable").toEqual([true, false]);
  expect(addon.eval("return TestRow:CanBeAccessedInContext() and TestRow:GetParent() == UIParent"), "test code still reaches it").toBe(true);
  addon.eval("__wfgWorld.releaseAccess(TestRow)");
  expect(tryAddon("return TestRow:CanBeAccessedInContext() and TestRow:GetParent() == UIParent"), "released: open again").toEqual([true, true]);
});

it("a secret answers type() as the value it hides, to the addon and to test code; the harness reads the raw type", () => {
  const addon = createAddon();
  expect(addon.eval(`local s, t = __wfgWorld.secret(5), __wfgWorld.secret("TEST-ONLY")
    return { type(s), type(t), type(__wfgWorld.secret(nil)), __wfgRawType(s), issecretvalue(s), type({}), type(3) }`))
    .toEqual(["number", "string", "number", "table", true, "table", "number"]);
  expect(addon.eval("local ok = pcall(function() local s = __wfgWorld.secret(5) return type(s) == 'number' and s > 0 end) return ok"), "a type gate lets it through to the compare, which errors").toBe(false);
});

// The addon's chunks compile without tail calls (scripts/lib/lua-keep-frames.mjs), so `return frame:Method()` keeps the
// addon's stack entry and the guards still see whose line it is (Lua 5.1 manual 2.5.8 drops it otherwise).
it("a guarded call in tail position from addon code is still the addon's: blocked in combat, from test Lua and from an event", () => {
  const addon = createAddon();
  addon.eval('CreateFrame("Button", "TestSecure", UIParent, "SecureActionButtonTemplate") TestSecure:SetFrameLevel(5)');
  asAddon(addon, `function TestTailCall() return TestSecure:SetFrameLevel(8) end
    TestEvents = CreateFrame("Frame")
    TestEvents:SetScript("OnEvent", function() return TestSecure:Hide() end)
    TestEvents:RegisterEvent("PLAYER_TARGET_CHANGED")`);
  addon.world.combat(true);
  addon.eval("TestTailCall()");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(violations(addon)).toEqual([
    "blocked in combat: Modules/TEST-ONLY.lua:1 called SetFrameLevel on the protected frame TestSecure",
    "blocked in combat: Modules/TEST-ONLY.lua:3 called Hide on the protected frame TestSecure",
  ]);
  expect(addon.eval("return { TestSecure:GetFrameLevel(), TestSecure:IsShown() }"), "neither landed").toEqual([5, true]);
});

it("a secret getter and a refused secret setter in tail position from addon code answer the addon as a plain call does", () => {
  const addon = createAddon();
  addon.eval(`TestGame = CreateFrame("Frame", "TestGame", UIParent) __wfgWorld.holdSecret(TestGame, "Shown") TestTrue = __wfgWorld.secret(true)`);
  asAddon(addon, `function TestGetTail() return TestGame:IsShown() end
    function TestSetTail() return TestGame:SetShown(TestTrue) end`);
  expect(addon.eval("return issecretvalue(TestGetTail())"), "the getter hands the addon a secret").toBe(true);
  expect(addon.eval("local ok, e = pcall(TestSetTail) return { ok, tostring(e) }")).toEqual([false,
    "Modules/TEST-ONLY.lua:2: bad argument #1 to 'SetShown' (Secret values are only allowed during untainted execution for this argument.)"]);
});

// The client judges the run, not the line that makes the call: game Lua the addon calls in combat is tainted by it
// (Blizzard_UIParentPanelManager/Shared/UIParentPanelManager.lua CheckProtectedFunctionsAllowed,
// `InCombatLockdown() and not issecure()`, both clients). Test Lua stands in for the game's.
it("a protected call or a binding write that game code makes for the addon in combat is blocked, and the addon's line named", () => {
  const addon = createAddon();
  addon.eval(`CreateFrame("Button", "TestSecure", UIParent, "SecureActionButtonTemplate") TestSecure:SetFrameLevel(5)
    function TestGameHelper() TestSecure:SetFrameLevel(9) SetBinding("F", "JUMP") end`);
  addon.world.combat(true);
  asAddon(addon, "TestGameHelper()");
  expect(violations(addon)).toEqual([
    "blocked in combat: Modules/TEST-ONLY.lua:1 called SetFrameLevel on the protected frame TestSecure",
    "blocked in combat: Modules/TEST-ONLY.lua:1 called SetBinding(), which the client refuses addon code in a fight",
  ]);
  addon.eval("TestGameHelper()");
  expect(addon.eval("return #__wfgStub.violations"), "the game's own run is not blocked").toBe(0);
  expect(addon.eval("return TestSecure:GetFrameLevel()")).toBe(9);
});
