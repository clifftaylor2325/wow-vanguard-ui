// motion: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, FAKE_FADES, isTok, loggedIn, px, setCombat } from "./helpers.mjs";

it("motion: fades, reduce motion, sounds", () => {
  const addon = loggedIn(CLICK_LUA + FAKE_FADES + "SOUNDKIT = { IG_MAINMENU_OPTION_CHECKBOX_ON = 856, IG_MAINMENU_OPTION_CHECKBOX_OFF = 857, IG_MAINMENU_OPEN = 850, IG_MAINMENU_CLOSE = 851, IG_CHARACTER_INFO_TAB = 841 } __sounds = {} PlaySound = function(k) table.insert(__sounds, k) end");
  addon.eval('local f = CreateFrame("Frame", "TEST_Fade", UIParent) __fakeFader(f) f:Hide() ns.Theme.FadeIn(f)');
  expect(addon.eval("return TEST_Fade:IsShown() and __fades[1].from == 0 and __fades[1].to == 1 and __fades[1].duration == 0.12") === true, "FadeIn shows the frame and fades it from 0 to 1 in 0.12 s").toBeTruthy();
  addon.eval("__finishFades() ns.Theme.FadeOut(TEST_Fade)");
  expect(addon.eval("return TEST_Fade:IsShown()") === true, "FadeOut keeps the frame up while it fades").toBeTruthy();
  addon.eval("__finishFades()");
  expect(addon.eval("return TEST_Fade:IsShown()") === false, "and hides it when the fade ends").toBeTruthy();
  addon.eval("ns.Theme.Settings().reduceMotion = true ns.Theme.FadeIn(TEST_Fade) ns.Theme.FadeOut(TEST_Fade)");
  expect(addon.eval("return #__fades == 0 and not TEST_Fade:IsShown()") === true, "Reduce motion skips fades").toBeTruthy();
  addon.eval("ns.Theme.Settings().reduceMotion = false");
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval("return __sounds[#__sounds]") === 850, "opening the window plays the open sound").toBeTruthy();
  addon.eval('__click("Snap to other frames")');
  expect(addon.eval("return __sounds[#__sounds]") === 857, "switching something off plays the off click").toBeTruthy();
  addon.eval('__click("Interface sounds") __sounds = {} __click("Snap to other frames")');
  expect(addon.eval("return #__sounds") === 0, "Interface sounds can be turned off").toBeTruthy();
});

it("motion: the alert sound is the game's whisper sound, and Interface sounds turns it off", () => {
  const addon = loggedIn("SOUNDKIT = { TELL_MESSAGE = 3081 } __sounds = {} PlaySound = function(k) table.insert(__sounds, k) end");
  addon.eval('ns.Theme.Sound("alert")');
  expect(addon.eval("return __sounds"), "TELL_MESSAGE (3081)").toEqual([3081]);
  addon.eval('ns.Theme.Settings().sounds = false ns.Theme.Sound("alert")');
  expect(addon.eval("return #__sounds"), "nothing more with Interface sounds off").toBe(1);
});

it("motion: no fade lasts more than 0.15 s in combat", () => {
  const addon = loggedIn(FAKE_FADES);
  // Fades TEST_Fade in (out when out is true) over seconds and returns how long the fade was set to last.
  const fade = (seconds, out) => addon.eval(`__fades = {} TEST_Fade:Show() ns.Theme.${out ? "FadeOut" : "FadeIn"}(TEST_Fade, ${seconds}) return __fades[1].duration`);
  addon.eval('local f = CreateFrame("Frame", "TEST_Fade", UIParent) __fakeFader(f)');
  expect([fade(0.35, true), fade(0.4), fade("nil")], "out of combat a fade lasts as long as asked (0.12 s by default)").toEqual([0.35, 0.4, 0.12]);
  setCombat(addon, true);
  expect([fade(0.35, true), fade(0.4), fade("nil"), fade(0.1, true)], "in combat longer fades are cut to 0.15 s; shorter ones stay").toEqual([0.15, 0.15, 0.12, 0.1]);
  setCombat(addon, false);
  expect(fade(0.4), "after the fight, full length again").toBe(0.4);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(fade(0.35, true), "a fight counts from its first event, before the client's lockdown starts").toBe(0.15);
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return ns.Theme.FadeTime(0.35)"), "and stops counting when it ends").toBe(0.35);
});

// A themed test button with fake faders on its two hover parts; returns nothing.
const HOVER_BUTTON = `local b = ns.Theme.Button(CreateFrame("Button", "TEST_Hover", UIParent)) b:SetSize(80, 22)
  for _, t in ipairs(ns.Theme.HoverParts(b)) do __fakeFader(t) end
  -- The playing fake fade on a region, or nil.
  function __playing(owner) for i = #__fades, 1, -1 do local g = __fades[i] if g.owner == owner and g.playing then return g end end end`;

// The hover parts' alphas, and the last fade each was given: { alphas, fades }.
const hoverState = (addon) => addon.eval(`local out = { {}, {} }
  for i, t in ipairs(ns.Theme.HoverParts(TEST_Hover)) do out[1][i] = t:GetAlpha() local g = __playing(t) out[2][i] = g and { g.from, g.to, g.duration, g.anims[1].smoothing } or false end
  return out`);

it("motion: a button's hover eases in (0.1 s) and out (0.13 s) to raisedHover with a borderHi top line, never while disabled (#257)", () => {
  const addon = loggedIn(FAKE_FADES + HOVER_BUTTON);
  const [fill, line] = addon.eval("local h = ns.Theme.HoverParts(TEST_Hover) return { h[1].__vertexColor, h[2].__vertexColor }");
  expect([isTok(addon, fill, "raisedHover"), isTok(addon, line, "borderHi")], "the fill in raisedHover, the line in borderHi").toEqual([true, true]);
  expect(addon.eval("local p = ns.Theme.HoverParts(TEST_Hover)[2] return { p:GetHeight(), p.__points.TOPLEFT ~= nil }"), "the line is one screen pixel, along the top").toEqual([px(addon, 1), true]);
  expect(hoverState(addon), "clear at rest").toEqual([[0, 0], [false, false]]);
  addon.eval('TEST_Hover:GetScript("OnEnter")(TEST_Hover)');
  expect(hoverState(addon)[1], "the mouse comes over: both ease in from 0 to 1 in 0.1 s, eased out").toEqual([[0, 1, 0.1, "OUT"], [0, 1, 0.1, "OUT"]]);
  addon.eval('__finishFades() TEST_Hover:GetScript("OnLeave")(TEST_Hover)');
  expect(hoverState(addon), "and leaves: they ease out from 1 in 0.13 s").toEqual([[1, 1], [[1, 0, 0.13, "OUT"], [1, 0, 0.13, "OUT"]]]);
  addon.eval('__finishFades() TEST_Hover:Disable() TEST_Hover:GetScript("OnEnter")(TEST_Hover) __finishFades()');
  expect(hoverState(addon)[0], "a disabled button shows no hover").toEqual([0, 0]);
  addon.eval('TEST_Hover:Enable() TEST_Hover:GetScript("OnEnter")(TEST_Hover) TEST_Hover:Hide()');
  expect(hoverState(addon), "hiding the button clears its hover at once").toEqual([[0, 0], [false, false]]);
  addon.eval('TEST_Hover:Show() ns.Theme.Settings().reduceMotion = true TEST_Hover:GetScript("OnEnter")(TEST_Hover)');
  expect(hoverState(addon), "Reduce motion: at once, no fade").toEqual([[1, 1], [false, false]]);
});

it("motion: a window opens rising 4 px into place as it fades in, and closes in 0.1 s; at once in combat (#257)", () => {
  const addon = loggedIn(FAKE_FADES + 'local f = CreateFrame("Frame", "TEST_Window", UIParent) f:SetSize(200, 100) f:Hide() __fakeFader(f)');
  addon.eval("ns.Theme.OpenWindow(TEST_Window) __riser = __fades[1]");
  const open = addon.eval(`local g = __riser local out = {}
    for i, a in ipairs(g.anims) do out[i] = { a.kind, a.order, a.duration, a.offset and a.offset[2] or false, a.smoothing or false } end
    return { TEST_Window:IsShown(), g.playing, g.from, g.to, out }`);
  const p4 = 4 * px(addon, 1);
  expect(open, "shown at once; a drop of 4 screen pixels, then a 0.13 s rise back and fade in, eased out").toEqual([true, true, 0, 1,
    [["Translation", 1, 0, -p4, false], ["Translation", 2, 0.13, p4, "OUT"], ["Alpha", 2, 0.13, false, "OUT"]]]);
  addon.eval("__fades = {} ns.Theme.CloseWindow(TEST_Window)");
  expect(addon.eval("return { __riser.playing, __fades[1].duration, TEST_Window:IsShown() }"), "closing stops the rise and fades out in 0.1 s").toEqual([false, 0.1, true]);
  addon.eval("__finishFades()");
  expect(addon.eval("return TEST_Window:IsShown()"), "then hides it").toBe(false);
  setCombat(addon, true);
  addon.eval("__fades = {} ns.Theme.OpenWindow(TEST_Window)");
  expect(addon.eval("return { TEST_Window:IsShown(), #__fades, TEST_Window:GetAlpha() }"), "in combat it opens at once").toEqual([true, 0, 1]);
  setCombat(addon, false);
  addon.eval('__fades = {} local f = CreateFrame("Frame", "TEST_Plain", UIParent) f:Hide() ns.Theme.OpenWindow(f) ns.Theme.OpenWindow(f)');
  expect(addon.eval("return { TEST_Plain:IsShown(), #__fades, TEST_Plain:GetAlpha() }"), "a client that can't animate opens it at once, every time").toEqual([true, 0, 1]);
});
