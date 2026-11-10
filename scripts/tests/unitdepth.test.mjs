// unit frame depth (A3-1): headless-client tests for the per-frame sizes, text formats, heal prediction and status marks.

import { expect, it } from "vitest";
import { NO_RAID, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

it("a health event asks for the down state once, and a reaction colour comes back as three numbers", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const asked = addon.eval(`__n = 0 local real = UnitIsDeadOrGhost
    UnitIsDeadOrGhost = function(...) __n = __n + 1 return real(...) end
    __wfgStub.fire("UNIT_HEALTH", "target") UnitIsDeadOrGhost = real return __n`);
  expect(asked, "one DownState per health event (it was three)").toBe(1);
  const color = addon.eval(`local UF = ns.GetModule("UnitFrames") return { UF.UnitColor("target") }`);
  expect(color, "a hostile target's colour is r, g, b").toHaveLength(3);
});

// Every frame's [width, height, the width it was given, the height it was given] (TEST-ONLY read; the first two are
// rounded to whole pixels, so the tests compare the given ones).
const sizes = (addon, keys) => addon.eval(`local out = {} for _, k in ipairs({ ${keys.map((k) => `"${k}"`).join(", ")} }) do
  local f = _G["Vanguard_" .. k] out[#out + 1] = { f:GetWidth(), f:GetHeight(), f.vgWidth, f.vgHeight } end return out`);

it("frame sizes: every old fixed size is the slider's default, and a slider moves the frame without a reload", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const keys = ["player", "target", "targettarget", "focus", "pet", "party1", "party4"];
  expect(sizes(addon, keys).map((s) => s.slice(2, 4)), "the sizes the frames had before").toEqual([[240, 36], [240, 36], [120, 24], [160, 30], [120, 24], [160, 32], [160, 32]]);
  addon.eval('local get, set = ns.Options.LiveMethod("UnitFrames", "playerWidth", "ApplySizes") set(300) local _, setH = ns.Options.LiveMethod("UnitFrames", "partyHeight", "ApplySizes") setH(40)');
  expect(sizes(addon, ["player", "party1", "party4"]).map((s) => s.slice(2, 4)), "the player's width and the whole party's height follow at once").toEqual([[300, 36], [160, 40], [160, 40]]);
  expect(sizes(addon, ["player"])[0][0], "the game's own width is that, to the pixel").toBeCloseTo(300, 0);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("frame sizes: a saved number outside the range is kept inside it, a word is the default", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  addon.eval('local UF = ns.GetModule("UnitFrames") UF.settings.focusWidth = 9999 UF.settings.focusHeight = 2 UF.settings.petWidth = "wide" UF.ApplySizes()');
  expect(sizes(addon, ["focus", "pet"]).map((s) => s.slice(2, 4)), "400 and 24 at most and least; the default for a word").toEqual([[400, 24], [120, 24]]);
  expect(addon.eval('return ns.GetModule("UnitFrames").FrameSize("boss1") == nil'), "the boss frames have no sliders").toBe(true);
});

it("frame sizes: a change in a fight waits for it to end, the last ask winning", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  setCombat(addon, true);
  addon.eval('local UF = ns.GetModule("UnitFrames") UF.settings.targetWidth = 200 UF.ApplySizes() UF.settings.targetWidth = 220 UF.ApplySizes()');
  expect(sizes(addon, ["target"])[0].slice(2, 4), "unchanged in the fight").toEqual([240, 36]);
  setCombat(addon, false);
  expect(sizes(addon, ["target"])[0].slice(2, 4), "the last width after it").toEqual([220, 36]);
});
