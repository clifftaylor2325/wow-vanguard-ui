// Tests for the raid benchmark's pure logic (scripts/lib/bench.mjs): the
// options, the seeded script, the statistics, the module counts and the
// printed and compared tables. Nothing here loads the addon; the run itself
// is checked by scripts/tests/bench.test.mjs in the lua project.

import { expect, it } from "vitest";
import {
  DEFAULTS, LABEL, RAID_SIZE, change, compareEvents, compareModules, countEvents, eventRows, formatCompare, formatResult,
  isAddonFile, makeScript, moduleCounts, overBudget, readOptions, rng, stats,
} from "./lib/bench.mjs";

// A small result as runBench makes it: two events, two modules and a harness file.
function sampleResult(overrides = {}) {
  return {
    label: LABEL, commit: "0123456789abcdef0123", dirty: false, date: "2026-10-12T00:00:00.000Z", node: "v22.0.0",
    seed: 255, events: { UNIT_HEALTH: { count: 10, median: 100, min: 90, max: 120, spreadPct: 30, addonInstr: 600, harnessInstr: 1500 },
      OnUpdate: { count: 2, median: 3000, min: 2900, max: 3100, spreadPct: 6.7, addonInstr: 7000, harnessInstr: 10000 } },
    steps: 12, reps: 3, warmup: 1, raid: 40, inCombat: true, totalMs: { median: 7, min: 6.5, max: 7.5, spreadPct: 14.3 },
    modules: { "Modules/RaidFrames.lua": { self: 6000, byEvent: { UNIT_HEALTH: 4000, OnUpdate: 2000 } },
      "Core/Events.lua": { self: 2000, byEvent: { UNIT_HEALTH: 2000 } }, "wow-stub.lua": { self: 8000, byEvent: { OnUpdate: 8000 } } },
    ...overrides,
  };
}

// A roster step on the model: whether it was possible (a member who is in leaves, one who is away joins, never you); their auras and cast go.
function rosterOk(raid, i, v) {
  const ok = (v === 1) === raid.away.has(i) && i !== 1;
  if (v === 1) raid.away.delete(i);
  else raid.away.add(i);
  raid.casting.delete(i);
  for (const key of [...raid.auras]) if (key.startsWith(`${i}:`)) raid.auras.delete(key);
  return ok;
}

// Any other step on the model: whether it was possible (the member is in; a stop ends a cast; an aura is gained only when absent).
function stepOk(raid, event, i, v) {
  if (event === "OnUpdate") return true;
  let ok = !raid.away.has(i);
  if (event === "UNIT_SPELLCAST_START") raid.casting.add(i);
  if (event === "UNIT_SPELLCAST_STOP") ok = raid.casting.delete(i) && ok;
  const key = `${i}:${Math.abs(v)}`;
  if (event === "UNIT_AURA") ok = (v > 0 ? !raid.auras.has(key) && raid.auras.add(key) : raid.auras.delete(key)) && ok;
  return ok;
}

// Replays a script's steps on a model of the raid; returns the state it ends in and how many steps were impossible.
function replay(steps) {
  const raid = { away: new Set(), casting: new Set(), auras: new Set() };
  let impossible = 0;
  for (const [event, i, v] of steps) {
    if (!(event === "GROUP_ROSTER_UPDATE" ? rosterOk(raid, i, v) : stepOk(raid, event, i, v))) impossible++;
  }
  return { away: raid.away.size, casting: raid.casting.size, auras: raid.auras.size, impossible };
}

it("options: the defaults, every flag read, and --no-profile turns the profiled repetition off", () => {
  expect(readOptions([])).toEqual({ ...DEFAULTS, out: undefined, compare: undefined, summary: undefined, profile: true, budget: undefined });
  const opts = readOptions(["--events", "50", "--reps", "2", "--warmup", "0", "--seed", "9", "--out", "a.json", "--compare", "b.json", "--budget", "12.5", "--summary", "s.md", "--no-profile"]);
  expect(opts).toEqual({ events: 50, reps: 2, warmup: 0, seed: 9, out: "a.json", compare: "b.json", summary: "s.md", profile: false, budget: 12.5 });
});

it("options: bad values and an unknown flag are refused with the reason", () => {
  expect(() => readOptions(["--events", "0"])).toThrow('--events must be a whole number of 1 or more, not "0"');
  expect(() => readOptions(["--reps", "2.5"])).toThrow("--reps must be a whole number");
  expect(() => readOptions(["--warmup=-1"])).toThrow("--warmup must be a whole number of 0 or more");
  expect(() => readOptions(["--seed", "x"])).toThrow("--seed must be a whole number");
  expect(() => readOptions(["--compare", "b.json", "--budget", "0"])).toThrow("--budget must be a percent above 0");
  expect(() => readOptions(["--budget", "10"])).toThrow("--budget needs --compare <file>");
  expect(() => readOptions(["--fast"])).toThrow(/Unknown option/);
});

it("the generator is seeded: the same seed gives the same numbers, another seed others", () => {
  // Five numbers from a generator with this seed.
  const draw = (seed) => Array.from({ length: 5 }, rng(seed));
  expect(draw(1)).toEqual(draw(1));
  expect(draw(1)).not.toEqual(draw(2));
  expect(draw(0).every((n) => n >= 0 && n < 1)).toBe(true);
});

it("the script is deterministic, has every kind of step, and only does what the raid allows", () => {
  const steps = makeScript({ seed: 255, events: 2000 });
  expect(makeScript({ seed: 255, events: 2000 })).toEqual(steps);
  expect(makeScript({ seed: 256, events: 2000 })).not.toEqual(steps);
  expect(Object.keys(countEvents(steps)).sort()).toEqual(["GROUP_ROSTER_UPDATE", "OnUpdate", "UNIT_AURA", "UNIT_HEALTH", "UNIT_POWER_UPDATE", "UNIT_SPELLCAST_START", "UNIT_SPELLCAST_STOP"]);
  expect(steps.every(([event, i]) => event === "OnUpdate" || (i >= 1 && i <= RAID_SIZE))).toBe(true);
  expect(replay(steps), "no step on an absent member, you never leave, and the closing steps put the raid back").toEqual({ away: 0, casting: 0, auras: 0, impossible: 0 });
});

it("the closing steps come after the asked-for count, and the mix is mostly health", () => {
  const steps = makeScript({ seed: 3, events: 400 });
  expect(steps.length).toBeGreaterThanOrEqual(400);
  const counts = countEvents(steps.slice(0, 400));
  expect(counts.UNIT_HEALTH).toBeGreaterThan(counts.UNIT_POWER_UPDATE);
  expect(counts.GROUP_ROSTER_UPDATE ?? 0).toBeLessThan(counts.OnUpdate);
});

it("stats: the median of an odd and an even count, the range and the spread", () => {
  expect(stats([5, 1, 3])).toEqual({ median: 3, min: 1, max: 5, spreadPct: (4 / 3) * 100 });
  expect(stats([4, 1, 3, 2])).toEqual({ median: 2.5, min: 1, max: 4, spreadPct: 120 });
  expect(stats([0, 0]).spreadPct).toBe(0);
});

it("event rows: microseconds per step from each repetition's milliseconds, and instructions per step", () => {
  const steps = [["UNIT_HEALTH", 1, 5], ["UNIT_HEALTH", 2, 5], ["OnUpdate", 0, 0]];
  const reps = [{ UNIT_HEALTH: 2, OnUpdate: 3 }, { UNIT_HEALTH: 4, OnUpdate: 1 }];
  const modules = { "Modules/RaidFrames.lua": { self: 4000, byEvent: { UNIT_HEALTH: 4000 } }, "wow-stub.lua": { self: 3000, byEvent: { UNIT_HEALTH: 2000, OnUpdate: 1000 } } };
  const rows = eventRows(steps, reps, modules);
  expect(rows.UNIT_HEALTH).toMatchObject({ count: 2, reps: [1000, 2000], median: 1500, addonInstr: 2000, harnessInstr: 1000 });
  expect(rows.OnUpdate).toMatchObject({ count: 1, median: 2000, addonInstr: 0, harnessInstr: 1000 });
  expect(eventRows(steps, reps, null).UNIT_HEALTH.addonInstr).toBeUndefined();
});

it("module counts: each file's own samples times 1000, in all and per event; files with none are left out", () => {
  const byEvent = {
    UNIT_HEALTH: { files: { "Modules/RaidFrames.lua": { self: 3, incl: 5 }, "Core/Events.lua": { self: 0, incl: 5 } } },
    OnUpdate: { files: { "Modules/RaidFrames.lua": { self: 2, incl: 2 } } },
  };
  expect(moduleCounts(byEvent)).toEqual({ "Modules/RaidFrames.lua": { self: 5000, byEvent: { UNIT_HEALTH: 3000, OnUpdate: 2000 } } });
  expect([isAddonFile("Modules/RaidFrames.lua"), isAddonFile("Core/DB.lua"), isAddonFile("Libs/LibStub/LibStub.lua"), isAddonFile("wow-stub.lua"), isAddonFile("eval")]).toEqual([true, true, true, false, false]);
});

it("the printed result names the label and settings, ranks events by time, and lists only addon files as modules", () => {
  const text = formatResult(sampleResult());
  expect(text).toContain(`### Vanguard raid bench (${LABEL})`);
  expect(text).toContain("Commit 0123456789ab · 40-member raid in combat · seed 255 · 12 steps per repetition");
  expect(text).toContain("compare with `/vg perf` in a raid");
  expect(text.indexOf("| OnUpdate | 2 | 3000.0 | 2900.0–3100.0 | 6.7% | 7.0k | 10.0k |")).toBeLessThan(text.indexOf("| UNIT_HEALTH | 10 | 100.0 |"));
  expect(text).toContain("| all steps (ms per rep) | 12 | 7.00 | 6.50–7.50 | 14.3% |  |  |");
  expect(text).toContain("| Modules/RaidFrames.lua | 6.0k | 75.0% | 2.63 | UNIT_HEALTH |");
  expect(text).not.toContain("| wow-stub.lua");
  expect(formatResult(sampleResult({ modules: null, dirty: true }))).not.toContain("module (addon file)");
  expect(formatResult(sampleResult({ dirty: true }))).toContain("with uncommitted changes");
});

it("change: a signed percent, and new or gone when one side is missing", () => {
  expect([change(100, 112), change(100, 90), change(100, 100), change(undefined, 5), change(5, undefined), change(0, 0), change(0, 3)]).toEqual(["+12.0%", "-10.0%", "+0.0%", "new", "gone", "0.0%", "new"]);
});

it("compare: per event before and after with the changes, the modules that moved most, and the budget", () => {
  const before = sampleResult();
  const after = sampleResult({ events: { ...before.events, UNIT_HEALTH: { ...before.events.UNIT_HEALTH, median: 130, addonInstr: 660 }, UNIT_AURA: { count: 4, median: 50, addonInstr: 100 } },
    modules: { ...before.modules, "Core/Events.lua": { self: 1000, byEvent: {} }, "Modules/RaidAuras.lua": { self: 3000, byEvent: {} } } });
  const rows = compareEvents(before, after);
  expect(rows.map((r) => r.event)).toEqual(["OnUpdate", "UNIT_AURA", "UNIT_HEALTH"]);
  expect(rows[2]).toMatchObject({ beforeUs: 100, afterUs: 130, timeChange: "+30.0%", instrChange: "+10.0%" });
  expect(rows[1]).toMatchObject({ timeChange: "new", instrChange: "new" });
  expect(compareModules(before, after).map((r) => r.file)).toEqual(["Modules/RaidAuras.lua", "Core/Events.lua"]);
  expect(overBudget(before, after, 25).map((r) => r.event)).toEqual(["UNIT_HEALTH"]);
  expect(overBudget(before, after, 30)).toEqual([]);
  const text = formatCompare(before, after, "old.json");
  expect(text).toContain("### Against old.json (commit 0123456789ab, 2026-10-12T00:00:00.000Z)");
  expect(text).toContain("| UNIT_HEALTH | 100.0 | 130.0 | +30.0% | 0.6k | 0.7k | +10.0% |");
  expect(text).toContain("| Modules/RaidAuras.lua | 0.0k | 3.0k | new |");
  expect(text).not.toContain("The scripts differ");
});

it("compare says so when the two scripts differ, and works without module counts", () => {
  const text = formatCompare(sampleResult({ seed: 1, modules: null }), sampleResult({ events: sampleResult().events }), "old.json");
  expect(text).toContain("The scripts differ (seed 1 → 255)");
  expect(text).toContain("| Core/Events.lua | 0.0k | 2.0k | new |");
});
