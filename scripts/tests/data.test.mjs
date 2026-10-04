// data: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { DATA_ENV, bars, loggedIn } from "./helpers.mjs";

it("data bars", () => {
  const addon = loggedIn(DATA_ENV);
  const b = bars(addon);
  expect(b.xp === 12300 && b.xpMax === 40000 && Math.abs(b.rested - 478 * 17300 / 40000) < 1e-9, "XP bar with rested overlay out to XP + rested").toBeTruthy();
  expect(b.xpText === "Level 42  12.3K / 40.0K (30%)  rested 5.0K", `XP text (got ${b.xpText})`).toBeTruthy();
  expect(b.xpTextShown === false, "text shows on hover only by default").toBeTruthy();
  addon.eval("ForeverUI_xpbar:GetScript('OnEnter')(ForeverUI_xpbar)");
  expect(addon.eval("return ForeverUI_xpbar.text:IsShown()") === true, "hovering shows it").toBeTruthy();
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
