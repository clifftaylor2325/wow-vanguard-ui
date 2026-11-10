// unit frame depth (A3-1): headless-client tests for the per-frame sizes, text formats, heal prediction and status marks.

import { expect, it } from "vitest";
import { NO_RAID, UNITS_ENV, loggedIn } from "./helpers.mjs";

it("a health event asks for the down state once, and a reaction colour comes back as three numbers", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const asked = addon.eval(`__n = 0 local real = UnitIsDeadOrGhost
    UnitIsDeadOrGhost = function(...) __n = __n + 1 return real(...) end
    __wfgStub.fire("UNIT_HEALTH", "target") UnitIsDeadOrGhost = real return __n`);
  expect(asked, "one DownState per health event (it was three)").toBe(1);
  const color = addon.eval(`local UF = ns.GetModule("UnitFrames") return { UF.UnitColor("target") }`);
  expect(color, "a hostile target's colour is r, g, b").toHaveLength(3);
});
