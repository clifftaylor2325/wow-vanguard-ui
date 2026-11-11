// stub-harness: the TEST-ONLY client's widgets (scripts/lib/wow-stub.lua): how methods resolve, scripts and
// shown state, the base every frame test stands on.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

it("replacing a method a widget kind already resolved reaches new and existing widgets of that kind", () => {
  const addon = createAddon();
  const seen = addon.eval(`local old = CreateFrame("Frame") old:SetScale(2)
    local orig = __wfgStub.methods.SetScale
    __wfgStub.methods.SetScale = function(self) self.__marked = true end
    local fresh = CreateFrame("Frame") fresh:SetScale(3) old:SetScale(3)
    local button = CreateFrame("Button") button:SetScale(3)
    __wfgStub.methods.SetScale = orig
    return { fresh = fresh.__marked == true, old = old.__marked == true, button = button.__marked == true }`);
  expect(seen).toEqual({ fresh: true, old: true, button: true });
});

it("HookScript refuses a script the widget's kind lacks, as SetScript does", () => {
  const addon = createAddon();
  expect(addon.eval(`local ok, err = pcall(function() CreateFrame("Frame"):HookScript("OnClick", function() end) end)
    return { ok, err:match("Frame doesn't have a \\"OnClick\\" script") ~= nil }`)).toEqual([false, true]);
});

it("buttons, check buttons, sliders and edit boxes take OnEnable and OnDisable hooks, run by Disable and Enable", () => {
  const addon = createAddon();
  const runs = addon.eval(`local out = {}
    for _, kind in ipairs({ "Button", "CheckButton", "Slider", "EditBox" }) do
      local w, seen = CreateFrame(kind), {}
      w:HookScript("OnDisable", function() seen[#seen + 1] = "off" end)
      w:HookScript("OnEnable", function() seen[#seen + 1] = "on" end)
      w:Disable() w:Enable() out[kind] = table.concat(seen, " ")
    end
    return out`);
  expect(runs).toEqual({ Button: "off on", CheckButton: "off on", Slider: "off on", EditBox: "off on" });
});

it("SetShown runs OnShow and OnHide as Show and Hide do, but not a hook on the frame's Show", () => {
  const addon = createAddon();
  const runs = addon.eval(`local f, seen = CreateFrame("Frame"), {}
    f:SetScript("OnShow", function() seen[#seen + 1] = "show" end)
    f:SetScript("OnHide", function() seen[#seen + 1] = "hide" end)
    f:Hide() f:SetShown(true) f:SetShown(true) f:SetShown(nil) f:SetShown(false)
    hooksecurefunc(f, "Show", function() seen[#seen + 1] = "Show hook" end)
    f:SetShown(true)
    return table.concat(seen, " ")`);
  expect(runs).toBe("hide show hide show");
});

// Blizzard_APIDocumentationGenerated, both clients: SimpleStatusBarConstantsDocumentation.lua, NumericRuleFormatterSharedDocumentation.lua,
// DurationTextBindingSharedDocumentation.lua, StringUtilDocumentation.lua and NumericRuleFormatterAPIDocumentation.lua.
it("the world's status bar, rounding and duration enums carry the client's names and values, and its rule formatter the client's methods", () => {
  const addon = createAddon();
  expect(addon.eval(`local e = Enum return { e.StatusBarInterpolation.Immediate, e.StatusBarInterpolation.ExponentialEaseOut,
    e.NumericRuleFormatRounding.Nearest, e.NumericRuleFormatRounding.Up, e.NumericRuleFormatRounding.Down,
    e.DurationTextBindingProperty.RemainingDuration, e.DurationTextBindingProperty.RemainingPercent, e.DurationTextBindingProperty.TotalDuration, e.DurationTextBindingProperty.EndTime }`))
    .toEqual([0, 1, 0, 1, 2, 0, 1, 4, 6]);
  expect(addon.eval(`local f = C_StringUtil.CreateNumericRuleFormatter() f:SetBreakpoints({ { threshold = 0 } }) f:AddBreakpoint({ threshold = 60 })
    local copy = f:Copy() f:ClearBreakpoints()
    return { #f:GetBreakpoints(), #copy:GetBreakpoints(), copy:GetBreakpoints()[2].threshold, f.Format == nil }`)).toEqual([0, 2, 60, true]);
});

// OnUpdate runs only while a frame is visible (SimpleFrameScriptObjectConstantsDocumentation.lua OnUpdateMode
// RunWhenVisible; Blizzard_UnitFrame/Shared/CompactUnitFrame.lua:292 works around it for a hidden frame).
it("a shown frame under a hidden parent runs no OnUpdate until the parent shows", () => {
  const addon = createAddon();
  const ticks = addon.eval(`local p = CreateFrame("Frame") local c = CreateFrame("Frame", nil, p) __ticks = 0
    c:SetScript("OnUpdate", function() __ticks = __ticks + 1 end)
    p:Hide() __wfgStub.update(0.1) __wfgStub.update(0.1) local hidden = __ticks
    p:Show() __wfgStub.update(0.1)
    return { hidden, __ticks, c:IsShown() }`);
  expect(ticks).toEqual([0, 1, true]);
});

// UnitThreatSituation is SecretWhenUnitThreatStateRestricted and UnitDetailedThreatSituation
// SecretWhenUnitThreatValuesRestricted (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua, both clients).
it("threat reads answer with secrets while the world hides threat or holds a secret value, and plainly otherwise", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob", threat: 3, threatPct: 100 });
  // Which of the threat reads are secrets.
  const read = () => addon.eval(`local s = issecretvalue local a = { UnitDetailedThreatSituation("target") }
    return { s(UnitThreatSituation("target")), s(a[1]), s(a[2]), s(a[3]), s(a[5]) }`);
  expect(addon.eval("return { UnitDetailedThreatSituation('target') }"), "plain").toEqual([true, 3, 100, 100, 0]);
  expect(read(), "plain: no secrets").toEqual([false, false, false, false, false]);
  addon.eval("__wfgWorld.threatSecret = true");
  expect(read(), "world.threatSecret: every return").toEqual([true, true, true, true, true]);
  addon.eval("__wfgWorld.threatSecret = false __wfgWorld.units.target.threat = __wfgWorld.secret(1)");
  expect([...read(), addon.eval("return rawget(UnitDetailedThreatSituation('target'), 'n')")], "a secret stored value: every return, isTanking from the value inside").toEqual([true, true, true, true, true, false]);
});

// A unit watch reads SecureButton_GetUnit, the "unit" attribute (Blizzard_RestrictedAddOnEnvironment/SecureStateDriver.lua,
// Blizzard_FrameXML/SecureTemplates.lua:201-212, both clients), never a .unit field.
it("a unit watch shows a frame by its unit attribute and ignores a .unit field", () => {
  const addon = createAddon();
  expect(addon.eval(`local byField = CreateFrame("Button", nil, UIParent) byField.unit = "player"
    local byAttribute = CreateFrame("Button", nil, UIParent) byAttribute:SetAttribute("unit", "player")
    RegisterUnitWatch(byField) RegisterUnitWatch(byAttribute)
    return { byField:IsShown(), byAttribute:IsShown() }`)).toEqual([false, true]);
});

// UnitInRange is SecretReturns on both clients (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua).
it("UnitInRange hands a secret range back as a secret, with a secret checked flag", () => {
  const addon = createAddon();
  addon.world.setUnit("party1", { name: "TEST-ONLY Friend", inRange: false });
  // Whether each return is a secret, and what it hides.
  const read = () => addon.eval(`local a, b = UnitInRange("party1")
    local hidden = a
    if issecretvalue(a) then hidden = rawget(a, "n") end
    return { issecretvalue(a), issecretvalue(b), hidden }`);
  expect(read(), "plain").toEqual([false, false, false]);
  addon.eval("__wfgWorld.units.party1.inRange = __wfgWorld.secret(false)");
  expect(read(), "secret").toEqual([true, true, false]);
});

// UnitHealthPercent is SecretReturns and SecretWhenCurveSecret on both clients
// (Blizzard_APIDocumentationGenerated/UnitDocumentation.lua): with hidden health every answer is hidden.
it("UnitHealthPercent answers hidden health with a secret percent, a secret number curve result or a hidden color", () => {
  const addon = createAddon();
  addon.world.setUnit("target", { name: "TEST-ONLY Mob", hp: 25, maxhp: 100 });
  // Plain or secret, and the value inside, for no curve, a number curve and a color curve.
  const read = () => addon.eval(`local num = { Evaluate = function(_, x) return x * 100 end }
    local col = C_CurveUtil.CreateColorCurve() col:AddPoint(0, CreateColor(1, 0, 0, 1))
    local function look(v) if issecretvalue(v) then return { true, rawget(v, "n") } end return { false, v } end
    return { look(UnitHealthPercent("target")), look(UnitHealthPercent("target", true, num)),
      look(UnitHealthPercent("target", true, col).r) }`);
  expect(read(), "plain").toEqual([[false, 25], [false, 25], [false, 1]]);
  addon.eval("__wfgWorld.units.target.hp = __wfgWorld.secret(25)");
  expect(read(), "hidden health").toEqual([[true, 25], [true, 25], [true, 1]]);
});
