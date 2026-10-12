// ticker: the one throttled per-frame driver (Core/Ticker.lua, ns.Every), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { expectErrors } from "./helpers.mjs";

// TEST-ONLY counters: __count(name) is a job that counts its runs in __runs[name].
const COUNT_LUA = `
  __runs = {}
  function __count(name) return function() __runs[name] = (__runs[name] or 0) + 1 end end
`;

// The addon with the counters, nothing fired (no module has registered a job).
function counting() {
  const addon = createAddon();
  addon.eval(COUNT_LUA);
  return addon;
}

it("idle cost: with no job the ticker has no OnUpdate, and a 1 s job runs once a second however many frames pass", () => {
  const addon = counting();
  // Whether the ticker frame has an OnUpdate.
  const driving = () => addon.eval("return ns.ticker:GetScript('OnUpdate') ~= nil");
  // How often the one-second job has run.
  const runs = () => addon.eval("return __runs['TEST-ONLY second'] or 0");
  expect(driving(), "nothing registered: the ticker frame runs no OnUpdate").toBe(false);
  addon.eval("ns.Every('TEST-ONLY second', 1, __count('TEST-ONLY second'))");
  expect(driving(), "a job registered: the ticker runs").toBe(true);
  addon.advance(1, 1 / 64);
  expect(runs(), "64 frames in one second: one run").toBe(1);
  addon.advance(10, 1 / 128);
  expect(runs(), "1,280 frames in ten seconds: ten more runs").toBe(11);
  addon.update(5);
  expect(runs(), "one long frame: one run, not a catch-up of five").toBe(12);
  addon.eval("ns.Every('TEST-ONLY second', nil) ns.Every('TEST-ONLY never there', nil)");
  addon.advance(5);
  expect([driving(), runs()], "stopped: no OnUpdate, no more runs; stopping a key that isn't running is harmless").toEqual([false, 12]);
});

it("ticker jobs: tied to a frame they count only while it is visible, start at once when asked, and keep their count when asked again", () => {
  const addon = counting();
  addon.eval(`__holder = CreateFrame("Frame", nil, UIParent) __holder:Hide()
    __framed = CreateFrame("Frame", "TEST_ONLY_Framed", __holder)
    ns.Every(__framed, 0.5, __count("framed"), __framed)
    ns.Every("TEST-ONLY now", 0.5, __count("now"), nil, true)`);
  // How often each job has run: { framed, now }.
  const runs = () => addon.eval("return { __runs.framed or 0, __runs.now or 0 }");
  addon.update(0.1);
  expect(runs(), "parent hidden: the framed job waits; the 'now' job runs on its first frame").toEqual([0, 1]);
  addon.advance(2, 0.25);
  addon.eval("__holder:Show()");
  addon.update(0.25);
  expect(runs(), "the hidden time didn't count; the other job ran every half second").toEqual([0, 5]);
  addon.eval('ns.Every(__framed, 0.5, __count("framed"), __framed)');
  addon.update(0.25);
  expect(runs(), "asked again while running: its quarter second still counts").toEqual([1, 6]);
});

it("ticker jobs: a failing job is reported and goes on, and a job may stop another mid-frame", () => {
  expectErrors(/^ticker TEST-ONLY bad: eval:\d+: TEST-ONLY tick$/, /^ticker job: eval:\d+: TEST-ONLY unnamed$/);
  const addon = counting();
  addon.eval(`ns.Every("TEST-ONLY bad", 1, function() __runs.bad = (__runs.bad or 0) + 1 error("TEST-ONLY tick") end)
    ns.Every({}, 1, function() error("TEST-ONLY unnamed") end)
    ns.Every("TEST-ONLY stopper", 1, function() ns.Every("TEST-ONLY stopped", nil) end)
    ns.Every("TEST-ONLY stopped", 1, __count("stopped"))`);
  addon.advance(2, 0.5);
  expect(addon.eval("return { __runs.bad, __runs.stopped or 0 }"), "the failing job ran each second; the stopped one never did").toEqual([2, 0]);
  expect(addon.eval("return { ns.errors[1].text, ns.errors[1].count }"), "kept under the job's key").toEqual([expect.stringMatching(/^ticker TEST-ONLY bad: /), 2]);
});
