// Checks the Lua harness area summary (scripts/lib/lua-summary-reporter.mjs):
// a test file under scripts/tests/ is an area, others are not, and the lines
// count passes per area. The cases handed to tally() are TEST-ONLY.

import path from "node:path";
import { expect, it } from "vitest";
import { areaOf, summaryLines, tally } from "./lib/lua-summary-reporter.mjs";

it("a file under scripts/tests is an area; other tests are not", () => {
  expect(areaOf(path.resolve("scripts/tests/core.test.mjs"))).toBe("core");
  expect(areaOf(path.resolve("scripts/tests/helpers.mjs"))).toBe(null);
  expect(areaOf(path.resolve("scripts/media.test.mjs"))).toBe(null);
});

it("summary lines count passes per area, in first-seen order", () => {
  const cases = [
    { area: "core", state: "passed" },
    { area: "core", state: "failed" },
    { area: "theme", state: "passed" },
  ];
  expect(summaryLines(tally(cases))).toEqual(["  core     1/2 passed", "  theme    1/1 passed"]);
});
