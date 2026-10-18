// graphics: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Core/Graphics.lua: /vg graphics, which reads the graphics card, the Graphics Quality in use and
// the one the game recommends, the render scale and the screen, measures the frame rate out of
// combat, and suggests a Graphics Quality and the setup sizes. It never changes a setting (HUD-10).

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

// TEST-ONLY client: a dedicated card, quality 6 in use (7 on the slider), 8 recommended, full render scale.
const GFX_ENV = `
  __fps = 45
  GetFramerate = function() return __fps end
  C_VideoOptions = { GetGxAdapterInfo = function() return { { name = "TEST-ONLY GPU", isLowPower = false, isExternal = false } } end }
  __wfgWorld.cvars.graphicsQuality, __wfgWorld.cvars.renderScale = "6", "1"
  C_CVar.GetCVarDefault = function(name) return name == "graphicsQuality" and "8" or nil end
`;
// The chat lines printed since the last clear, without the colored "Vanguard:" prefix.
const lines = (addon) => Array.from(addon.chat()).map((line) => line.replace(/^.*Vanguard:\S*\s/, ""));
// The chat lines printed by one /vg command.
const said = (addon, command) => {
  addon.clearChat();
  addon.slash(command);
  return lines(addon);
};
// Runs a whole check and returns its report.
const check = (addon) => {
  said(addon, "graphics");
  addon.clearChat();
  addon.advance(5, 1);
  return lines(addon);
};

it("/vg graphics: five readings, then the frame rate, the computer, the suggestion and the screen", () => {
  const addon = loggedIn(GFX_ENV);
  expect(said(addon, "graphics"), "it starts and says how long").toEqual(["Checking this computer and your frame rate for 5 s: stand where you usually play (a city is slower than the open world). /vg graphics again ends it early."]);
  addon.clearChat();
  addon.advance(5, 1);
  expect(lines(addon), "the report").toEqual([
    "Frame rate: 45 fps on average over 5 s.",
    "Graphics card: TEST-ONLY GPU (dedicated). Graphics Quality 7 of 10 (the game recommends 9 for this computer), render scale 100%.",
    "Suggested: Graphics Quality 9 in Options → Graphics; this computer has room for it.",
    "Screen 1920 x 1080: setup suggests the 1080p sizes (UI scale 80%); /vg setup, then Screen, applies it.",
  ]);
  expect(addon.eval("return __wfgWorld.cvars.graphicsQuality"), "nothing is changed").toBe("6");
  addon.advance(5, 1);
  expect(lines(addon).length, "and the check is over").toBe(4);
});
it("/vg graphics: a slow 4K screen on a low-power chip: lower, the 4K sizes and the render scale tip", () => {
  const addon = loggedIn(GFX_ENV + "__fps = 20 C_VideoOptions.GetGxAdapterInfo = function() return { { name = 'TEST-ONLY iGPU', isLowPower = true } } end");
  addon.eval("__wfgStub.setScreen(3840, 2160)");
  expect(check(addon), "lower two steps, the card's kind, the 4K preset and the tip").toEqual([
    "Frame rate: 20 fps on average over 5 s.",
    "Graphics card: TEST-ONLY iGPU (built-in, low power). Graphics Quality 7 of 10 (the game recommends 9 for this computer), render scale 100%.",
    "Suggested: lower Graphics Quality to 5 in Options → Graphics (the slider sets every detail for you).",
    "Screen 3840 x 2160: setup suggests the 4K sizes (UI scale 65%); /vg setup, then Screen, applies it.",
    "On a 4K screen, Render Scale 80% in Options → Graphics helps the frame rate most, with little change in sharpness.",
  ]);
});
it("/vg graphics: nothing the client can't say is guessed", () => {
  const addon = loggedIn(GFX_ENV + "C_VideoOptions = nil C_CVar.GetCVarDefault = nil __wfgWorld.cvars.graphicsQuality = nil __wfgWorld.cvars.renderScale = nil");
  expect(check(addon).slice(1, 3), "unknown card, settings and quality").toEqual([
    "Graphics card: unknown. Graphics Quality unknown of 10 (the game recommends unknown for this computer), render scale unknown.",
    "Graphics Quality can't be read on this client; if the game feels slow, lower it in Options → Graphics.",
  ]);
  addon.eval("GetCVarDefault = function() return '6' end C_CVar.GetCVar = nil GetCVar = nil");
  expect(addon.eval("local G = ns.Graphics return { G.Setting('graphicsQuality', true), G.Setting('graphicsQuality') == nil }"), "the old default getter; no getter at all").toEqual([6, true]);
  addon.eval("GetCVarDefault = function() error('TEST-ONLY') end");
  expect(addon.eval("return ns.Graphics.Setting('graphicsQuality', true) == nil"), "a getter that errors").toBe(true);
  const cards = ["function() error('TEST-ONLY') end", "function() return {} end", "function() return { { name = 5 } } end", "5"];
  for (const get of cards) {
    addon.eval(`C_VideoOptions = { GetGxAdapterInfo = ${get} }`);
    expect(addon.eval("return ns.Graphics.Card() == nil"), "no card from " + get).toBe(true);
  }
  addon.eval("__wfgStub.setScreen(1365, 768)");
  expect(addon.eval("return ns.Graphics.ScreenLine()"), "a small screen: no preset, Pixel-perfect").toBe("Screen 1365 x 768: setup suggests Pixel-perfect; /vg setup, then Screen, applies it.");
  addon.eval("GetPhysicalScreenSize = nil");
  expect(addon.eval("return { ns.Graphics.ScreenSize() }"), "no screen size").toEqual([0, 0]);
});
it("/vg graphics: the suggestion keeps a good setting, caps a low-power chip and stays on the slider", () => {
  const addon = loggedIn(GFX_ENV);
  // What the check advises for Advice(avg, quality, recommended, lowPower).
  const advice = (args) => addon.eval(`return ns.Graphics.Advice(${args})`);
  expect(advice("45, 6, 6, false"), "the recommended one in use").toBe("Your Graphics Quality suits this computer and screen.");
  expect(advice("45, 6, nil, false"), "no recommendation: the one in use").toBe("Your Graphics Quality suits this computer and screen.");
  expect(advice("90, 6, nil, false"), "fast: one step up").toMatch(/^Suggested: Graphics Quality 8 /);
  expect(advice("90, 6, nil, true"), "but never above 5 on a low-power chip").toMatch(/^Suggested: lower Graphics Quality to 5 /);
  expect(addon.eval("local G = ns.Graphics return { G.Suggest(10, 1, nil, false), G.Suggest(90, 9, 9, false) }"), "0 to 9 only").toEqual([0, 9]);
  // Whether RenderTip(avg, height, render) gives the tip.
  const tip = (args) => addon.eval(`return ns.Graphics.RenderTip(${args}) ~= nil`);
  expect([tip("20, 2160, 1"), tip("40, 2160, 1"), tip("20, 1440, 1"), tip("20, 2160, 0.8"), tip("20, 2160, nil"), tip("20, nil, 1")], "only slow, 4K and full render scale").toEqual([true, false, false, false, false, false]);
});
it("/vg graphics: no readings in combat, the fight refused, no timers, and an early end", () => {
  const addon = loggedIn(GFX_ENV);
  said(addon, "graphics");
  addon.eval("__wfgStub.inCombat = true");
  addon.clearChat();
  addon.advance(5, 1);
  expect(lines(addon), "every tick in combat").toEqual(["Frame rate check: no readings (none are taken in combat). Try again out of combat."]);
  expect(said(addon, "graphics"), "not started in a fight").toEqual(["The check waits for the end of the fight: try /vg graphics again then."]);
  addon.eval("__wfgStub.inCombat = false");
  said(addon, "graphics");
  addon.advance(2, 1);
  expect(said(addon, "graphics")[0], "asked again: it ends with what it has").toBe("Frame rate: 45 fps on average over 2 s.");
  const bare = loggedIn(GFX_ENV + "C_Timer = nil");
  expect(said(bare, "graphics"), "no timers").toEqual(["This client has no timers to measure with."]);
  const blind = loggedIn(GFX_ENV + "GetFramerate = nil");
  expect(check(blind), "no frame rate counter: no readings").toEqual(["Frame rate check: no readings (none are taken in combat). Try again out of combat."]);
});
