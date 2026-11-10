// unit frame depth (A3-1): headless-client tests for the per-frame sizes, text formats, heal prediction and status marks.

import { expect, it } from "vitest";
import { FOREVER_ENV, NO_RAID, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

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

// The unit environment with the client's missing-health call and a percent that always says 84 (TEST-ONLY).
const TEXT_ENV = UNITS_ENV + FOREVER_ENV + `
  CurveConstants = { ScaleTo100 = { __curve = true } }
  UnitHealthPercent = function() return 84 end
  UnitHealthMissing = function(unit)
    local h, m = __units[unit].hp, __units[unit].maxhp
    if issecretvalue(h) or issecretvalue(m) then return { __secret = true } end
    return m - h
  end
`;

// The health text, and the power text, of a frame after `setup` (a format picked), as plain text, "secret" or "-" for none.
const texts = (addon, setup, key = "player") => addon.eval(`local UF = ns.GetModule("UnitFrames") ${setup} UF.Refresh()
  local f = _G["Vanguard_${key}"]
  local function show(t) if type(t) == "table" and t.__secret then return "secret" end return t or "-" end
  return { show(f.healthText:GetText()), show(f.powerText:GetText()), f.powerText:IsShown() }`);

it("text formats: value, percent, both and deficit, in plain text", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  // The player's health text in a format.
  const health = (format) => texts(addon, `UF.settings.healthFormat = "${format}"`)[0];
  expect([health("value"), health("percent"), health("both"), health("deficit")], "player health 900 of 1000").toEqual(["900", "84%", "900  84%", "-100"]);
  addon.eval("__units.player.hp = 1000");
  expect(health("deficit"), "nothing missing says nothing").toBe("");
  expect(health("nonsense"), "a format no release knows reads as the value").toBe("1000");
});

it("text formats: hidden values go to the text whole, never joined or computed on", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  // The target's (hidden) health text in a format.
  const health = (format) => texts(addon, `UF.settings.healthFormat = "${format}"`, "target")[0];
  expect([health("value"), health("deficit")], "a hidden value and a hidden deficit show as the client formats them").toEqual(["secret", "secret"]);
  expect(health("both"), "both falls back to the percent alone").toBe("84%");
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("power text: off by default; value, percent, both and deficit when picked, empty for the dead", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  // The player's texts with the power format picked.
  const power = (format) => texts(addon, `UF.settings.powerFormat = "${format}" UF.ApplyPowerText()`);
  expect(power("none"), "no power text, hidden").toEqual(["84%", "-", false]);
  expect([power("value")[1], power("percent")[1], power("both")[1], power("deficit")[1]], "50 of 100").toEqual(["50", "50%", "50  50%", "-50"]);
  expect(power("value")[2], "shown on a 36 tall frame").toBe(true);
  expect(texts(addon, 'UF.settings.powerFormat = "value" UF.ApplyPowerText() ns.GetModule("UnitFrames").frames.party1.vgDown = nil', "party1")[1], "an empty bar has no power").toBe("");
});

it("power text: hidden power falls back to the value; a frame too short for two lines shows none", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  addon.eval('__units.player.power = { __secret = true }');
  expect(texts(addon, 'UF.settings.powerFormat = "percent" UF.ApplyPowerText()')[1], "a hidden amount: the client's own value text").toBe("secret");
  expect(texts(addon, 'UF.settings.playerHeight = 24 UF.ApplySizes()')[2], "24 tall: no room under the health text").toBe(false);
});

it("power text: sits under the health text, and mid-bar on a frame drawn bare", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  texts(addon, 'UF.settings.powerFormat = "value" UF.ApplyPowerText()');
  // Where the health text and the power text anchor on the player frame.
  const points = () => addon.eval("return { (Vanguard_player.healthText:GetPoint()), (Vanguard_player.powerText:GetPoint()) }");
  const roomy = points();
  expect(roomy[0].startsWith("TOP") && roomy[1].startsWith("BOTTOM"), "health text on the top line, power text on the bottom").toBe(true);
  addon.eval('ns.Theme.Settings().hudLook = "hairline" ns.Theme.Refresh()');
  expect(points(), "bare: the health text is in the name row, the power text mid-bar").toEqual([expect.stringMatching(/^(LEFT|RIGHT)$/), expect.stringMatching(/^(LEFT|RIGHT)$/)]);
});
