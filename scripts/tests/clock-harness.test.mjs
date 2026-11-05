// clock-harness: the TEST-ONLY client's clock (stub.advance in scripts/lib/wow-stub.lua) and its timers
// (C_Timer in scripts/lib/wow-world.lua), the base every timed test stands on.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

it("timers due in one large step run in the order they fall due, then the order they were made", () => {
  const addon = createAddon();
  addon.eval(`__ran = {}
    local function note(name) return function() __ran[#__ran + 1] = name end end
    C_Timer.After(2, note("two")) C_Timer.After(1, note("one")) C_Timer.After(1, note("one again"))
    C_Timer.NewTicker(1.5, note("tick"), 1)`);
  expect(addon.eval("__wfgStub.advance(5, 5) return __ran")).toEqual(["one", "one again", "tick", "two"]);
});
