// smoke: the one Lua harness case the pull-request gate runs (npm run
// test:quick, .github/workflows/verify.yml): the addon loads once, logs in
// on a finished-setup account, draws its default layout, unlocks and locks
// its frames, plays a couple of seconds, and has caught no error. Anything
// deeper is the full suite (.github/workflows/full-suite.yml).

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("the addon loads, logs in, unlocks and locks its frames, and catches no error", () => {
  const addon = loggedIn();
  expect(addon.screen().map((f) => f.name), "the default layout is drawn").toEqual(expect.arrayContaining(["Vanguard_player", "Vanguard_Bar1", "Vanguard_Minimap"]));
  addon.slash("unlock");
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length, "unlock shows the movers").toBeGreaterThan(0);
  addon.slash("lock");
  expect(addon.frames("w.mover ~= nil and w:IsShown()").length, "lock hides them").toBe(0);
  addon.advance(2);
  expect(addon.eval("return #ns.errors"), "nothing caught by ns.Try").toBe(0);
});
