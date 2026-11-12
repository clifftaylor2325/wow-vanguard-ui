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

// SetEnabled is IsProtectedFunction on a button (Blizzard_APIDocumentationGenerated/SimpleButtonAPIDocumentation.lua:336,
// both clients): blocked in a fight even now that it runs Enable and Disable underneath.
it("SetEnabled on a secure button is blocked in combat, once, and leaves the button as it was", () => {
  const addon = createAddon();
  addon.eval('CreateFrame("Button", "TestSecure", UIParent, "SecureActionButtonTemplate")');
  addon.world.combat(true);
  asAddon(addon, "TestSecure:SetEnabled(false)");
  expect(violations(addon)).toEqual(["blocked in combat: Modules/TEST-ONLY.lua:1 called SetEnabled on the protected frame TestSecure"]);
  expect(addon.eval("return TestSecure:IsEnabled()")).toBe(true);
  addon.world.combat(false);
  asAddon(addon, "TestSecure:SetEnabled(false)");
  expect(addon.eval("return { #__wfgStub.violations, TestSecure:IsEnabled() }"), "out of combat it lands").toEqual([0, false]);
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

// The stub keeps its own state in fields named __... (stub.isStubKey); addon code is judged before that shortcut, so a
// field it names __vg... on a game frame is recorded too, while the stub's own __ writes from wow-*.lua stay quiet.
it("addon code storing a field named with two underscores on the game's frame is recorded; the stub's own are not", () => {
  const addon = createAddon();
  addon.eval(`${GAME_FRAME} TestGameFrame:SetAlpha(0.5)`);
  asAddon(addon, "TestGameFrame.__vgSkinned = true");
  expect(violations(addon)).toEqual(["field write: Modules/TEST-ONLY.lua:1 stored the field __vgSkinned on the game's frame TestGameFrame"]);
  expect(addon.eval("return TestGameFrame:GetAlpha()"), "the stub's own write landed").toBe(0.5);
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

// Blizzard_AuraContainer/Blizzard_AuraContainerFrameProviders.lua:79-86 (both clients): a new frame gets the container's
// access restriction right after its (possibly tainted) initializeFrame runs; Blizzard_AuraContainerUtil.lua:403-419
// applies it at once once logged in.
it("an aura button a held container makes is held once the addon's initializeFrame has dressed it, and released with the container", () => {
  const addon = createAddon();
  asAddon(addon, `TestInit = function(b) b:SetSize(10, 10) b.TestFace = b:CreateTexture() end`);
  addon.eval(`TestBox = CreateFrame("AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
    TestBox:AddAuraGroup("g", "HELPFUL", { maxFrameCount = 40, layout = {}, initializeFrame = TestInit })
    TestBox:SetUnit("player") TestBox:SetEnabled(true) __wfgWorld.holdAccess(TestBox)
    for i = 1, 15 do __wfgWorld.addAura("player", { name = "TEST-ONLY " .. i, isHelpful = true, auraInstanceID = 700 + i }) end
    TestBox:UpdateAllAuras() TestLate = TestBox.__groups[1].buttons[15]`);
  // Whether an addon call raised, and what it returned or raised with.
  const tryAddon = (lua) => addon.eval(`local ok, e = pcall(assert(loadstring(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))) if ok then return { true, e } end return { false, tostring(e) }`);
  expect(addon.eval("return { #TestBox.__groups[1].buttons, TestLate:GetWidth(), #__wfgStub.violations }"), "a second batch, dressed by the addon without a refusal").toEqual([20, 10, 0]);
  expect(tryAddon("return TestLate:CanBeAccessedInContext()"), "the new button is held").toEqual([true, false]);
  expect(tryAddon("TestLate:SetAlpha(0.5)")[0], "and refuses the addon").toBe(false);
  expect(tryAddon("TestLate.TestFace:SetAlpha(0.5)")[0], "so does the texture initializeFrame put on it").toBe(false);
  addon.eval("__wfgWorld.releaseAccess(TestBox)");
  expect(tryAddon("TestLate:SetAlpha(0.5) return TestLate:CanBeAccessedInContext()"), "released with the container").toEqual([true, true]);
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

// Blizzard_APIDocumentationGenerated/FrameAPICooldownDocumentation.lua marks Clear, SetCooldown, SetCooldownDuration and
// SetCooldownFromDurationObject IsProtectedFunction (both clients); a chat frame's Clear is a plain method.
it("a protected cooldown's Clear and SetCooldown calls are blocked in combat; a message frame's Clear is not", () => {
  const addon = createAddon();
  addon.eval(`TestHolder = CreateFrame("Frame", "TestHolder", UIParent) __wfgStub.protect(TestHolder)
    TestSwipe = CreateFrame("Cooldown", "TestSwipe", TestHolder) __wfgStub.protect(TestSwipe)
    TestLog = CreateFrame("ScrollingMessageFrame", "TestLog", TestHolder) __wfgStub.protect(TestLog)`);
  addon.world.combat(true);
  asAddon(addon, "TestSwipe:SetCooldown(1, 2) TestSwipe:Clear() TestSwipe:SetCooldownDuration(3) TestLog:Clear()");
  expect(violations(addon)).toEqual(["SetCooldown", "Clear", "SetCooldownDuration"].map((n) => `blocked in combat: Modules/TEST-ONLY.lua:1 called ${n} on the protected frame TestSwipe`));
});

// The game's secure frames by name (wow-taint.lua's GAME_PROTECTED cites each source): Blizzard_RaidUI.xml's
// RaidGroupButtonTemplate, TargetFrame.lua's <frame>ToT, SpellFlyout.xml's SecureFrameTemplate frames.
it("the raid window's group buttons, the target-of-target frames and the spell flyout are protected game frames", () => {
  const addon = createAddon();
  const names = ["RaidGroupButton12", "TargetFrameToT", "FocusFrameToT", "SpellFlyout", "SpellFlyoutPopupButton3"];
  addon.eval(names.map((n) => `CreateFrame("Button", "${n}", UIParent)`).join(" "));
  expect(addon.eval(`return { ${names.map((n) => `(${n}:IsProtected())`).join(", ")} }`)).toEqual(names.map(() => true));
  addon.world.combat(true);
  asAddon(addon, "RaidGroupButton12:SetPoint('CENTER')");
  expect(violations(addon)).toEqual(["blocked in combat: Modules/TEST-ONLY.lua:1 called SetPoint on the protected frame RaidGroupButton12"]);
});
