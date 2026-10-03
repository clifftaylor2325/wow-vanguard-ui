// motion: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, FAKE_FADES, loggedIn } from "./helpers.mjs";

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
