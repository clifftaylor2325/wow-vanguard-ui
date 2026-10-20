// data: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { DATA_ENV, bars, loggedIn } from "./helpers.mjs";

it("data bars", () => {
  const addon = loggedIn(DATA_ENV);
  const b = bars(addon);
  expect(b.xp === 12300 && b.xpMax === 40000 && Math.abs(b.rested - 478 * 17300 / 40000) < 1e-9, "XP bar with rested overlay out to XP + rested").toBeTruthy();
  expect(b.xpText === "Level 42  12.3K / 40.0K (30%)  rested 5.0K", `XP text (got ${b.xpText})`).toBeTruthy();
  expect(b.xpTextShown === false, "text shows on hover only by default").toBeTruthy();
  addon.eval("Vanguard_xpbar:GetScript('OnEnter')(Vanguard_xpbar)");
  expect(addon.eval("return Vanguard_xpbar.text:IsShown()") === true, "hovering shows it").toBeTruthy();
  expect(b.rep === 1200 && b.repMax === 6000 && b.repColor[1] === 0.6, "reputation within the current standing, friendly green").toBeTruthy();
  expect(b.repText === "TEST-ONLY Faction  1.2K / 6.0K (20%)", `reputation text (got ${b.repText})`).toBeTruthy();
  addon.eval("__maxLevel = true; __faction = nil");
  addon.fire("PLAYER_XP_UPDATE");
  addon.fire("UPDATE_FACTION");
  const after = bars(addon);
  expect(after.xpShown === false && after.repShown === false, "XP hides at max level; reputation hides with nothing watched").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(movers.includes("xpbar") && movers.includes("repbar"), "both bars are movable").toBeTruthy();
});

// Where each bar's text sits: its anchor point, the bar point it is on, and its x offset.
const textPlace = (addon) => addon.eval(`local out = {}
  for i, bar in ipairs({ Vanguard_xpbar, Vanguard_repbar }) do local p, _, rel, x = bar.text:GetPoint(1) out[i] = { p, rel, x } end
  return out`);
it("data bar texts: on thin bars the XP text goes to the left end and the reputation text to the right, so they never overlap", () => {
  const addon = loggedIn(DATA_ENV, { savedVariables: "VanguardDB.profiles = { Default = { DataBars = { text = 'always' } } }" });
  expect(textPlace(addon), "6 px bars under 10 px text: each at its own end, a cell gap in").toEqual([["LEFT", "LEFT", 4], ["RIGHT", "RIGHT", -4]]);
  addon.eval("ns.SetMoverSize('xpbar', 'height', 20)");
  expect(textPlace(addon)[0], "a bar as tall as its text: centred again").toEqual(["CENTER", "CENTER", 0]);
  addon.eval("ns.SetMoverSize('xpbar', 'height', 12) ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  expect(textPlace(addon)[0], "a larger text size than the bar: back to its end").toEqual(["LEFT", "LEFT", 4]);
});
