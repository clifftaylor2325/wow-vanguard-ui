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
// The last line of a report: how to apply it and undo it.
const APPLY_LINE = "/vg graphics apply sets these for you; /vg graphics undo puts your settings back.";
// TEST-ONLY quality table: each detail at the step asked for, spell density unknown to this client.
const TABLE_ENV = `
  GetGraphicsCVarValueForQualityLevel = function(name, q) if name == "graphicsSpellDensity" then error("TEST-ONLY") end return q == 1 and 0 or q end
  __wfgWorld.cvars.graphicsShadowQuality, __wfgWorld.cvars.uiScale, __wfgWorld.cvars.useUiScale = "4", "0.9", "1"
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
    APPLY_LINE,
  ]);
  expect(addon.eval("return __wfgWorld.cvars.graphicsQuality"), "nothing is changed").toBe("6");
  addon.advance(5, 1);
  expect(lines(addon).length, "and the check is over").toBe(5);
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
    APPLY_LINE,
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

// Some settings as the client holds them now.
const cvars = (addon, names) => addon.eval(`return { ${names.map((n) => `__wfgWorld.cvars.${n} or "nil"`).join(", ")} }`);
it("/vg graphics apply: sets the suggestion as the game's Options would, and undo puts it all back", () => {
  const addon = loggedIn(GFX_ENV + TABLE_ENV);
  check(addon);
  expect(said(addon, "graphics apply").pop(), "what it set").toBe("Set Graphics Quality 9, your screen's sizes. /vg graphics undo puts your settings back.");
  expect(cvars(addon, ["graphicsQuality", "graphicsShadowQuality", "graphicsParticleDensity", "graphicsSpellDensity", "uiScale", "renderScale"]), "every detail from the game's table, then the step; the 1080p UI scale; a detail the client lacks left alone").toEqual(["8", "8", "8", "nil", "0.8", "1"]);
  addon.eval("__fps = 90");
  check(addon);
  said(addon, "graphics apply");
  expect(cvars(addon, ["graphicsQuality"]), "applied again, one step higher").toEqual(["9"]);
  expect(said(addon, "graphics undo"), "undo").toEqual(["Your graphics settings and UI scale are back as they were. If apply changed Vanguard's sizes, the backup profile it named in chat has the old ones."]);
  expect(cvars(addon, ["graphicsQuality", "graphicsShadowQuality", "graphicsParticleDensity", "uiScale", "useUiScale"]), "back to before the first apply; a setting that had no value stays").toEqual(["6", "4", "9", "0.9", "1"]);
  expect(said(addon, "graphics undo"), "and once only").toEqual(["Nothing to undo: /vg graphics apply hasn't changed anything."]);
});
it("/vg graphics undo: what apply kept stays on this computer: a profile string neither carries nor brings one", () => {
  const friend = loggedIn(GFX_ENV + TABLE_ENV);
  check(friend);
  said(friend, "graphics apply");
  const exported = friend.eval(`local out = {}
    for _, scope in ipairs({ "profile", "Graphics" }) do local _, data = ns.Serialize.Decode(ns.ExportProfile(scope)) out[scope] = data.Graphics ~= nil and data.Graphics.undo ~= nil end
    return { out.profile, out.Graphics, ns.Settings("Graphics").undo.graphicsQuality }`);
  expect(exported, "neither a whole nor a partial string holds the undo record, which stays in the profile").toEqual([false, false, "6"]);
  // TEST-ONLY strings from an older Vanguard that exported another computer's undo record (quality 9 there).
  const strings = friend.eval(`local undo = { graphicsQuality = "9", renderScale = "1" }
    return { ns.Serialize.Encode("profile", ns.StampPayload({ theme = { accent = "jade" }, Graphics = { undo = undo } })),
      ns.Serialize.Encode("parts", ns.StampPayload({ parts = { "Graphics" }, Graphics = { undo = undo } })) }`);
  const me = loggedIn(GFX_ENV + TABLE_ENV + "__wfgWorld.cvars.graphicsQuality = '2'");
  me.eval(`ns.ImportProfile(${JSON.stringify(strings[0])}) ns.ImportProfile(${JSON.stringify(strings[1])})`);
  expect(me.eval("return { VanguardDB.profiles.Imported.Graphics == nil or VanguardDB.profiles.Imported.Graphics.undo == nil, ns.Settings('Graphics').undo == nil }"), "the record is dropped as either string is read").toEqual([true, true]);
  check(me);
  said(me, "graphics apply");
  said(me, "graphics undo");
  expect(cvars(me, ["graphicsQuality"]), "so undo puts this computer's own quality back").toEqual(["2"]);
});
it("/vg graphics apply: a slow 4K screen gets the render scale; low steps keep the game's lowest particle density", () => {
  const addon = loggedIn(GFX_ENV + TABLE_ENV + "__fps = 10 __wfgWorld.cvars.graphicsQuality = '3'");
  addon.eval("__wfgStub.setScreen(3840, 2160)");
  check(addon);
  expect(said(addon, "graphics apply").pop(), "the step, the render scale and the 4K sizes").toBe("Set Graphics Quality 2, Render Scale 80%, your screen's sizes. /vg graphics undo puts your settings back.");
  expect(cvars(addon, ["graphicsQuality", "graphicsParticleDensity", "graphicsShadowQuality", "renderScale"]), "never under the slider's own lowest").toEqual(["1", "1", "0", "0.8"]);
  said(addon, "graphics undo");
  expect(cvars(addon, ["graphicsQuality", "renderScale"]), "undone").toEqual(["3", "1"]);
});
it("/vg graphics apply: what it can't do, it says", () => {
  const addon = loggedIn(GFX_ENV + TABLE_ENV + "__fps = 45 __wfgWorld.cvars.graphicsQuality = '8'");
  expect(said(addon, "graphics apply"), "no check yet").toEqual(["Run /vg graphics first: apply sets what the check suggests."]);
  expect(said(addon, "graphics now"), "anything else: the usage").toEqual(["Usage: /vg graphics [apply | undo]"]);
  addon.eval("__wfgStub.setScreen(1365, 768)");
  check(addon);
  expect(said(addon, "graphics apply").pop(), "already right, small screen: nothing but what it kept").toBe("Set Graphics Quality as it was. /vg graphics undo puts your settings back.");
  addon.eval("__wfgStub.inCombat = true");
  expect([said(addon, "graphics apply"), said(addon, "graphics undo")], "nothing in combat").toEqual([["Settings don't change in combat: try /vg graphics apply after the fight."], ["Settings don't change in combat: try /vg graphics undo after the fight."]]);
  addon.eval("__wfgStub.inCombat = false C_CVar.SetCVar = nil SetCVar = nil");
  expect([said(addon, "graphics apply"), said(addon, "graphics undo")], "no way to set").toEqual([["This client can't change its settings."], ["Nothing to undo: /vg graphics apply hasn't changed anything."]]);
});
it("/vg graphics apply: a refused Graphics Quality is named, and an unreadable setting is not put back", () => {
  const addon = loggedIn(GFX_ENV + TABLE_ENV);
  check(addon);
  addon.eval("local set = SetCVar SetCVar = function(n, v) if n == 'graphicsQuality' then error('TEST-ONLY') end set(n, v) end C_CVar.SetCVar = SetCVar");
  addon.eval("local get = GetCVar GetCVar = function(n) if n == 'uiScale' then error('TEST-ONLY') end return get(n) end C_CVar.GetCVar = GetCVar");
  expect(said(addon, "graphics apply").pop(), "refused").toBe("Set not Graphics Quality (the client refused it), your screen's sizes. /vg graphics undo puts your settings back.");
  addon.eval("C_CVar.GetCVar = nil GetCVar = nil");
  expect(addon.eval("local u = ns.Settings('Graphics').undo return { u.uiScale, u.graphicsShadowQuality }"), "kept: false when unreadable").toEqual([false, "4"]);
  said(addon, "graphics undo");
  expect(cvars(addon, ["graphicsShadowQuality", "uiScale"]), "the readable one back, the other as apply left it").toEqual(["4", "0.8"]);
});
