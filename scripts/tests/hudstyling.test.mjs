// hud styling: the fixes of the 2026-10-26 UI hunt that need a full login (action bars, unit frames and
// their extras), kept in one file so they never need an entry in login-scope.json.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

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
