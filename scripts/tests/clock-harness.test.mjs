// clock-harness: the TEST-ONLY client's clock (stub.advance in scripts/lib/wow-stub.lua) and its timers
// (C_Timer in scripts/lib/wow-world.lua), the base every timed test stands on.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

// The clock after a run of Lua, rounded to the microsecond.
const clockAfter = (addon, lua) => addon.eval(`local start = GetTime() ${lua} return math.floor((GetTime() - start) * 1e6 + 0.5) / 1e6`);

it("advance moves the clock by exactly the time asked, with a shorter last frame", () => {
  const addon = createAddon();
  expect(clockAfter(addon, "__wfgStub.advance(0.1)"), "under half a step still moves").toBe(0.1);
  expect(clockAfter(addon, "__wfgStub.advance(1.1)"), "1.1 s is not rounded to 1.0").toBe(1.1);
  expect(clockAfter(addon, "__wfgStub.advance(0.2)"), "0.2 s is not rounded up to a whole step").toBe(0.2);
  expect(clockAfter(addon, "__wfgStub.advance(2)"), "whole steps as before").toBe(2);
  expect(clockAfter(addon, "__wfgStub.advance(65, 5)"), "a large step too").toBe(65);
});

it("advance runs OnUpdate every frame, and the remainder as its own frame", () => {
  const addon = createAddon();
  addon.eval(`__frames = {} local f = CreateFrame("Frame")
    f:SetScript("OnUpdate", function(_, elapsed) __frames[#__frames + 1] = math.floor(elapsed * 1000 + 0.5) end)`);
  expect(addon.eval("__wfgStub.advance(0.6) return __frames")).toEqual([250, 250, 100]);
});

it("timers due in one large step run in the order they fall due, then the order they were made", () => {
  const addon = createAddon();
  addon.eval(`__ran = {}
    local function note(name) return function() __ran[#__ran + 1] = name end end
    C_Timer.After(2, note("two")) C_Timer.After(1, note("one")) C_Timer.After(1, note("one again"))
    C_Timer.NewTicker(1.5, note("tick"), 1)`);
  expect(addon.eval("__wfgStub.advance(5, 5) return __ran")).toEqual(["one", "one again", "tick", "two"]);
});
