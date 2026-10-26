// hud styling: the fixes of the 2026-10-26 UI hunt that need a full login (action bars, unit frames and
// their extras), kept in one file so they never need an entry in login-scope.json.

import { expect, it } from "vitest";
import { NO_RAID, UNITS_ENV, loggedIn } from "./helpers.mjs";

// TEST-ONLY pet mood: a content cat.
const HAPPY_ENV = "GetPetHappiness = function() return 2, 0, 0 end\n";

// TEST-ONLY client with the swing timer, shown whatever your class.
const SWING = `C_SwingTimer = {} Enum = Enum or {} Enum.PlayerSwingType = { MainHand = 0, OffHand = 1, Ranged = 2 }`;
const SWING_ALWAYS = "SwingTimer = { show = 'always' }";

// Saved variables for the default profile with the given module settings.
const profile = (settings) => `VanguardDB = { profiles = { Default = { ${settings} } } }`;

it("P4-3: the swing timer rides above the cast bar when the action bar stack grows", () => {
  // The swing holder's default y, the cast bar's top, and bar 1's top, in UI units.
  const edges = (addon) => addon.eval(`local y = function(k) local _, _, _, v = ns.MoverPoint(k) return v end
    return { y("swing"), y("cast_player") + ns.GetModule("CastBars").LAYOUT.player.h, y("bar1") + Vanguard_Bar1:GetHeight() }`);
  const flat = edges(loggedIn(SWING, { savedVariables: profile(SWING_ALWAYS) }));
  expect(flat[0], "over the default three bars the swing rows sit where they always did").toBeCloseTo(170, 0);
  const six = edges(loggedIn(SWING, { savedVariables: profile(`${SWING_ALWAYS}, ActionBars = { bars = { [6] = { enabled = true } } }`) }));
  expect(six[0] - six[1], "with a 4th stacked bar the swing rows are still 11 over the cast bar").toBe(11);
  expect(six[0], "and above bar 1's top").toBeGreaterThan(six[2]);
});

it("P4-3: the swing timer follows a stack that grows after login, and stays at its spot with the action bars off", () => {
  const live = loggedIn(SWING, { savedVariables: profile(SWING_ALWAYS) });
  const swingY = () => live.eval('local _, _, _, y = ns.MoverPoint("swing") return y');
  const before = swingY();
  live.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[3].perRow = 6 AB.SettingChanged(3, "perRow")');
  expect(swingY() - before, "a second row on bar 3 lifts the swing rows by that row's height").toBeGreaterThan(30);
  const off = loggedIn(SWING, { savedVariables: profile(`${SWING_ALWAYS}, modules = { ActionBars = false }`) });
  expect(off.eval('local _, _, _, y = ns.MoverPoint("swing") return y'), "with the action bars off it sits at its fixed spot").toBe(170);
});

// A rect (left, right, top, bottom) of a frame, font string or texture by ref.
const rectOf = (addon, ref) => addon.frame(ref)?.rect;

it("P4-4: the pet's health text ends left of the happiness glyph", () => {
  const addon = loggedIn(UNITS_ENV + HAPPY_ENV + `__units.pet = { name = "TEST-ONLY Cat", hp = 640, maxhp = 800, power = 0, maxpower = 0, ptype = "FOCUS", reaction = 5 }`);
  addon.fire("UNIT_PET", "player");
  const text = rectOf(addon, "Vanguard_pet.healthText");
  const glyph = addon.eval("local g = ns.GetModule('UnitExtras').happy return { g:GetLeft(), g:GetRight() }");
  expect(text.right, "the last digit sits left of the glyph").toBeLessThanOrEqual(glyph[0]);
});

it("P4-7: the health text of the target, focus and boss frames ends left of the class diamond", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  for (const key of ["target", "focus", "boss1", "boss2"]) {
    addon.eval(`Vanguard_${key}:Show() Vanguard_${key}.class:Show() Vanguard_${key}.healthText:SetText("640")`);
    const text = rectOf(addon, `Vanguard_${key}.healthText`);
    const diamond = rectOf(addon, `Vanguard_${key}.class`);
    expect(text.right, `${key}: the health text clears the diamond`).toBeLessThanOrEqual(diamond.left);
  }
});

it("P4-9: the Versus deck stays a pad above a taller target frame", () => {
  const addon = loggedIn(UNITS_ENV, { savedVariables: profile("UnitFrames = { deck = true, targetHeight = 44 }") });
  // How far the deck's top edge stands above the taller of the player and target frames.
  const pad = () => addon.eval("local d, p, t = ns.GetModule('UnitFrames').deck, Vanguard_player, Vanguard_target return d:GetTop() - math.max(p:GetTop(), t:GetTop())");
  expect(pad(), "a 44 tall target is inside the deck with the full 6 unit pad").toBeCloseTo(6, 0);
  addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.targetHeight = 36 UF.ApplySizes()");
  expect(pad(), "and a target as tall as the player frame leaves the same pad").toBeCloseTo(6, 0);
});
