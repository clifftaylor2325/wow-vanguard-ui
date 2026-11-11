// aspects-harness: the TEST-ONLY client's secret aspects (scripts/lib/wow-aspects.lua) and the VM's refusals on
// secrets (scripts/lib/lua-secret-ops.mjs): a widget given a secret keeps that aspect and its getters answer the
// addon with secrets; a setter that refuses the addon's secret raises the client's error; a truth test, `not` or
// `==` on a secret in the addon's code raises. Game and test code may do all of it.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

// Runs Lua as if it were a line of one of the addon's files (Modules/TEST-ONLY.lua), and returns its result.
const asAddon = (addon, lua) => addon.eval(`return assert(loadstring(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))()`);

// The same, under pcall: { ok, result or error text }.
const tryAddon = (addon, lua) => addon.eval(`return { pcall(assert(loadstring(${JSON.stringify(lua)}, "@Modules/TEST-ONLY.lua"))) }`);

// The client's error for a secret handed to a method that takes one only from untainted code.
const refusedText = (name, i = 1) => `Modules/TEST-ONLY.lua:1: bad argument #${i} to '${name}' (Secret values are only allowed during untainted execution for this argument.)`;

it("the addon's truth test, `not` and `==` on a secret raise the client's errors; a secret number tests true; game and test code may do all three", () => {
  const addon = createAddon();
  addon.eval("__yes, __five = __wfgWorld.secret(true), __wfgWorld.secret(5)");
  expect(tryAddon(addon, "if __yes then return 1 end"), "if on a secret boolean").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to perform boolean test on a secret value"]);
  expect(tryAddon(addon, "return __yes and 1 or 2"), "and / or test it too").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to perform boolean test on a secret value"]);
  expect(tryAddon(addon, "return not __yes"), "not").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to negate a secret value"]);
  expect(tryAddon(addon, "return __five == 5"), "== on any secret").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to compare a secret value"]);
  expect(tryAddon(addon, "return __yes ~= nil"), "~= nil too").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to compare a secret value"]);
  expect(asAddon(addon, "return { __five and 1, issecretvalue(__yes), type(__yes), UIParent == UIParent }"), "a secret number tests true, issecretvalue and type() read it, other tables compare")
    .toEqual([1, true, "boolean", true]);
  expect(addon.eval("return { __yes and 1, not __yes, __five == 5 }"), "test code (the game's own) tests and compares secrets as the values they hide, as untainted code may").toEqual([1, false, false]);
});

// [widget kind, the setter's Lua with a secret argument, the getter, its aspect]: each setter that takes a secret from the addon.
const TAINTED_OK = [
  ["Frame", "SetAlpha(__wfgWorld.secret(0.5))", "GetAlpha", "Alpha"],
  ["Texture", "SetAlphaFromBoolean(__wfgWorld.secret(true), 1, 0)", "GetAlpha", "Alpha"],
  ["Texture", "SetVertexColor(1, __wfgWorld.secret(0.5), 1)", "GetVertexColor", "VertexColor"],
  ["FontString", "SetText(__wfgWorld.secret('TEST-ONLY'))", "GetText", "Text"],
  ["FontString", "SetTextColor(__wfgWorld.secret(1), 1, 1)", "GetTextColor", "VertexColor"],
  ["StatusBar", "SetValue(__wfgWorld.secret(40))", "GetValue", "BarValue"],
  ["StatusBar", "SetMinMaxValues(0, __wfgWorld.secret(100))", "GetMinMaxValues", "BarValue"],
  ["StatusBar", "SetStatusBarColor(__wfgWorld.secret(1), 0, 0)", "GetStatusBarColor", "VertexColor"],
  ["Texture", "SetRotation(__wfgWorld.secret(1))", "GetRotation", "Rotation"],
  ["Texture", "SetDesaturated(__wfgWorld.secret(true))", "IsDesaturated", "Desaturation"],
  ["Frame", "SetID(__wfgWorld.secret(3))", "GetID", "ID"],
];

// Lua that makes a widget of a kind on UIParent as `w` (a font string with a font).
const MAKES = {
  Frame: "w = CreateFrame('Frame', nil, UIParent)", StatusBar: "w = CreateFrame('StatusBar', nil, UIParent)",
  Texture: "w = UIParent:CreateTexture()", FontString: "w = UIParent:CreateFontString() w:SetFont('TEST-ONLY', 10)",
  Button: "w = CreateFrame('Button', nil, UIParent)", EditBox: "w = CreateFrame('EditBox', nil, UIParent)",
  ScrollFrame: "w = CreateFrame('ScrollFrame', nil, UIParent)",
};

// Lua that makes a widget of a kind as the global __w.
const make = (kind) => MAKES[kind].replace(/\bw\b/g, "__w");

it("each setter the client lets the addon hand a secret gives its aspect, and the matching getter then answers the addon with secrets", () => {
  const addon = createAddon();
  for (const [kind, set, get, aspect] of TAINTED_OK) {
    asAddon(addon, make(kind));
    expect(asAddon(addon, `return { issecretvalue((__w:${get}())), __w:HasAnySecretAspect() }`), `${kind}:${get} is plain before`).toEqual([false, false]);
    asAddon(addon, `__w:${set}`);
    expect(asAddon(addon, `return { issecretvalue((__w:${get}())), __w:HasSecretAspect(Enum.SecretAspect.${aspect}) }`), `${kind}:${set} gives ${aspect}`).toEqual([true, true]);
  }
});

// [widget kind, the setter's Lua with a secret argument, the getter that turns secret after the game's code calls it, its aspect].
const REFUSED = [
  ["Texture", "SetShown(__wfgWorld.secret(false))", "IsShown", "Shown"],
  ["Frame", "SetShown(__wfgWorld.secret(true))", "IsShown", "Shown"],
  ["Frame", "SetScale(__wfgWorld.secret(0.5))", "GetScale", "Scale"],
  ["Frame", "SetFrameLevel(__wfgWorld.secret(9))", "GetFrameLevel", "FrameLevel"],
  ["Button", "SetText(__wfgWorld.secret('TEST-ONLY'))", "GetText", "Text"],
  ["EditBox", "SetText(__wfgWorld.secret('TEST-ONLY'))", "GetText", "Text"],
  ["Frame", "SetFrameStrata(__wfgWorld.secret('HIGH'))", "GetFrameStrata", "FrameStrata"],
  ["ScrollFrame", "SetVerticalScroll(__wfgWorld.secret(5))", "GetVerticalScroll", "ScrollOffset"],
];

it("each setter that refuses the addon's secret raises the client's error, under pcall too; the game's code gives the aspect and keeps the plain value", () => {
  const addon = createAddon();
  for (const [kind, set, get, aspect] of REFUSED) {
    addon.eval(make(kind));
    const name = set.slice(0, set.indexOf("("));
    expect(tryAddon(addon, `__w:${set}`), `${kind}:${name} from the addon`).toEqual([false, refusedText(name)]);
    expect(asAddon(addon, `return __w:HasAnySecretAspect()`), "a refused call gives nothing").toBe(false);
    addon.eval(`__w:${set}`);
    expect(asAddon(addon, `return { issecretvalue((__w:${get}())), __w:HasSecretAspect(Enum.SecretAspect.${aspect}) }`), `${kind}:${name} from the game's code gives ${aspect}`).toEqual([true, true]);
    expect(addon.eval(`return issecretvalue((__w:${get}()))`), "test code reads the plain value").toBe(false);
  }
  expect(addon.eval("local t = UIParent:CreateTexture() t:SetShown(__wfgWorld.secret(false)) return t.__shown"), "the stub keeps what the secret hides").toBe(false);
});

// Geometry and other setters with no aspect: the addon's secret is refused at its position.
const REFUSED_PLAIN = [
  ["SetPoint('CENTER', UIParent, 'CENTER', __wfgWorld.secret(4), 0)", "SetPoint", 4],
  ["SetWidth(__wfgWorld.secret(4))", "SetWidth", 1],
  ["SetHeight(__wfgWorld.secret(4))", "SetHeight", 1],
  ["SetSize(10, __wfgWorld.secret(4))", "SetSize", 2],
  ["SetParent(__wfgWorld.secret(1))", "SetParent", 1],
];

it("SetPoint, the size setters, SetParent and the rest refuse the addon's secret at the argument it is in", () => {
  const addon = createAddon();
  addon.eval("__w = CreateFrame('Frame', nil, UIParent)");
  for (const [set, name, i] of REFUSED_PLAIN) expect(tryAddon(addon, `__w:${set}`), name).toEqual([false, refusedText(name, i)]);
  expect(tryAddon(addon, "local s = CreateFrame('Slider', nil, UIParent) s:SetValue(__wfgWorld.secret(1))"), "a slider's SetValue is not a status bar's").toEqual([false, refusedText("SetValue")]);
  expect(tryAddon(addon, "local c = CreateFrame('Cooldown', nil, UIParent) c:SetCooldown(__wfgWorld.secret(1), 10)"), "SetCooldown takes no secret from the addon").toEqual([false, refusedText("SetCooldown")]);
  expect(asAddon(addon, "__w:SetPoint('CENTER') __w:SetSize(10, 10) return __w:IsAnchoringSecret()"), "plain values set as ever").toBe(false);
});

it("IsVisible is secret for the addon while the widget or any parent holds Shown; IsShown follows the widget's own", () => {
  const addon = createAddon();
  addon.eval("__top = CreateFrame('Frame', nil, UIParent) __mid = CreateFrame('Frame', nil, __top) __leaf = __mid:CreateTexture()");
  // Which of IsShown and IsVisible answer the addon with secrets, for the parent and the texture.
  const secrets = () => asAddon(addon, "local s = issecretvalue return { s(__top:IsShown()), s(__top:IsVisible()), s(__leaf:IsShown()), s(__leaf:IsVisible()) }");
  expect(secrets(), "nothing held").toEqual([false, false, false, false]);
  addon.eval("__wfgWorld.holdSecret(__top, 'Shown')");
  expect(secrets(), "the parent's Shown: its own reads, and the texture's IsVisible").toEqual([true, true, false, true]);
  expect(addon.eval("return { __leaf:IsVisible(), __top:IsShown() }"), "the values stay as they were, and test code reads them").toEqual([true, true]);
});

it("secret anchoring: from the game's SetPoint or SetSize, a secret texture or holdSecret; it reaches what anchors to the region, and ClearAllPoints resets it", () => {
  const addon = createAddon();
  addon.eval(`__a = CreateFrame('Frame', nil, UIParent) __a:SetSize(10, 10) __a:SetPoint('CENTER', UIParent, 'CENTER', __wfgWorld.secret(5), 0)
    __b = CreateFrame('Frame', nil, UIParent) __b:SetSize(10, 10) __b:SetPoint('LEFT', __a, 'RIGHT')`);
  // Whether the addon reads secrets from the two frames' widths and the first one's point.
  const secrets = () => asAddon(addon, "local s = issecretvalue return { s(__a:GetWidth()), s(__b:GetLeft()), s((select(4, __a:GetPoint()))), __a:IsAnchoringSecret(), __a:HasSecretValues() }");
  expect(secrets(), "the game's secret offset: the frame, its points and what anchors to it").toEqual([true, true, true, true, true]);
  addon.eval("__a:ClearAllPoints() __a:SetPoint('CENTER')");
  expect(secrets(), "cleared points reset the anchoring; the object keeps having had secret values").toEqual([false, false, false, false, true]);
  addon.eval("__t = UIParent:CreateTexture() __t:SetSize(4, 4) __t:SetPoint('CENTER')");
  asAddon(addon, "__t:SetTexture(__wfgWorld.secret(1))");
  expect(asAddon(addon, "return { issecretvalue(__t:GetWidth()), __t:HasSecretValues() }"), "a secret texture from the addon is taken, and hides the texture's geometry").toEqual([true, true]);
  addon.eval("__wfgWorld.holdSecret(__b, 'Anchoring')");
  expect(asAddon(addon, "return issecretvalue(__b:GetHeight())"), "holdSecret(w, 'Anchoring')").toBe(true);
});

it("secretAspects strict: every frame of the game's holds Shown, Alpha, Text and BarValue for the addon; UIParent and the addon's own frames do not", () => {
  const addon = createAddon();
  addon.eval("__game = CreateFrame('StatusBar', nil, UIParent) __gameText = __game:CreateFontString() __gameText:SetFont('TEST-ONLY', 10) __gameText:SetText('TEST-ONLY')");
  asAddon(addon, "__mine = CreateFrame('Frame', nil, UIParent)");
  // Which reads answer the addon with secrets.
  const secrets = () => asAddon(addon, "local s = issecretvalue return { s(__game:IsShown()), s(__game:GetAlpha()), s(__game:GetValue()), s(__gameText:GetText()), s(__game:GetScale()), s(UIParent:IsShown()), s(__mine:IsShown()) }");
  expect(secrets(), "off").toEqual([false, false, false, false, false, false, false]);
  addon.world.secretAspects("strict");
  expect(secrets(), "strict").toEqual([true, true, true, true, false, false, false]);
  expect(() => addon.world.secretAspects("TEST-ONLY"), "an unknown mode is refused").toThrow(/strict or off/);
  addon.world.secretAspects(null);
  expect(secrets(), "and off again").toEqual([false, false, false, false, false, false, false]);
});

it("the #838 shape, with no trick: a plate edge whose Shown the client holds secret makes the old repaint line raise, and a plain hide does not", () => {
  const addon = createAddon();
  addon.eval("__edge = UIParent:CreateTexture() __wfgWorld.holdSecret(__edge, 'Shown')");
  expect(tryAddon(addon, "local shown = true __edge:SetShown(shown and __edge:IsShown())"), "t:SetShown(shown and t:IsShown()), as Core/Theme.lua had it")
    .toEqual([false, refusedText("SetShown")]);
  expect(tryAddon(addon, "if __edge:IsShown() then return 1 end"), "testing the read-back fails too").toEqual([false, "Modules/TEST-ONLY.lua:1: attempt to perform boolean test on a secret value"]);
  expect(tryAddon(addon, "__edge:Hide() __edge:SetShown(false) __edge:SetAlphaFromBoolean(__edge:IsShown(), 1, 0)"), "hiding it, or handing the secret to SetAlphaFromBoolean, is fine").toEqual([true]);
});
