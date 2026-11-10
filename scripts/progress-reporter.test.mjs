// Checks the per-file progress lines (scripts/lib/progress-reporter.mjs): the
// line's shape, the clock, when the lines print, and that the reporter counts
// files as they finish. The modules handed to the reporter are TEST-ONLY.

import { expect, it } from "vitest";
import { clock, progressLine, progressOn, progressReporter } from "./lib/progress-reporter.mjs";

// A finished case as the reporter reads one.
function fakeCase(state) {
  // Its result.
  return { result: () => ({ state }) };
}

// A finished test module as the reporter reads one: `states` are its cases' results.
function fakeModule(file, states, duration) {
  const tests = states.map(fakeCase);
  return {
    // Failed when any case failed.
    state: () => (states.includes("failed") ? "failed" : "passed"),
    // The time its cases took, in milliseconds.
    diagnostic: () => ({ duration }),
    project: { name: "lua" },
    relativeModuleId: file,
    // Its cases.
    children: { allTests: () => tests },
  };
}

it("the clock reads seconds under a minute and minutes with two-digit seconds after", () => {
  expect([clock(0.4), clock(42), clock(59.6), clock(724), clock(3600)]).toEqual(["0s", "42s", "1m00s", "12m04s", "60m00s"]);
});

it("a line holds the count, the result, the file's time, its project, its cases and the run's time so far", () => {
  const passed = { done: 37, total: 188, state: "passed", seconds: 35.21, project: "lua", file: "scripts/tests/chat.test.mjs", tests: 152, failed: 0, elapsed: 724 };
  expect(progressLine(passed)).toBe("[ 37/188] ok     35.2s  lua    scripts/tests/chat.test.mjs (152 tests)  12m04s in");
  const failed = { ...passed, done: 188, state: "failed", seconds: 0.04, project: "quick", file: "scripts/x.test.mjs", tests: 1, failed: 1 };
  expect(progressLine(failed)).toBe("[188/188] FAIL    0.0s  quick  scripts/x.test.mjs (1 test, 1 failed)  12m04s in");
});

it("the lines print when Vitest chose its quiet reporter, and VG_PROGRESS forces them on or off", () => {
  expect(progressOn({}, ["minimal"])).toBe(true);
  expect(progressOn({}, ["default", "github-actions"])).toBe(false);
  expect(progressOn({ VG_PROGRESS: "1" }, ["default"])).toBe(true);
  expect(progressOn({ VG_PROGRESS: "0" }, ["minimal"])).toBe(false);
});

it("the reporter prints one line per finished file and starts its count again on a new run", () => {
  const lines = [];
  const reporter = progressReporter();
  // Keeps what the reporter prints.
  const log = (line) => lines.push(line);
  reporter.onInit({ logger: { log } });
  reporter.onTestRunStart([{}, {}]);
  reporter.onTestModuleEnd(fakeModule("scripts/tests/a.test.mjs", ["passed", "passed"], 1500));
  reporter.onTestModuleEnd(fakeModule("scripts/tests/b.test.mjs", ["passed", "failed"], 250));
  reporter.onTestRunStart([{}]);
  reporter.onTestModuleEnd(fakeModule("scripts/tests/a.test.mjs", ["passed"], 10));
  expect(lines.map((line) => line.replace(/\s+\d+s in$/, ""))).toEqual([
    "[1/2] ok      1.5s  lua    scripts/tests/a.test.mjs (2 tests)",
    "[2/2] FAIL    0.3s  lua    scripts/tests/b.test.mjs (2 tests, 1 failed)",
    "[1/1] ok      0.0s  lua    scripts/tests/a.test.mjs (1 test)",
  ]);
});
