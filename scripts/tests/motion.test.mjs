// motion: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, FAKE_FADES, loggedIn, setCombat } from "./helpers.mjs";

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
