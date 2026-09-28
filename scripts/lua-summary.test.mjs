// Checks the Lua harness category summary (scripts/lib/lua-summary-reporter.mjs):
// every case in scripts/verify-lua.test.mjs has exactly one category, and the
// lines count passes per category. The cases handed to tally() are TEST-ONLY.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { CATEGORIES, categoryOf, summaryLines, tally } from "./lib/lua-summary-reporter.mjs";

const harness = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-lua.test.mjs");

// The it() names in the Lua harness, read from its source.
const harnessNames = () => [...fs.readFileSync(harness, "utf8").matchAll(/^it\("((?:[^"\\]|\\.)*)"/gm)].map((m) => m[1]);

it("every Lua harness case has exactly one category", () => {
  const names = harnessNames();
  const listed = CATEGORIES.flatMap(([, n]) => n);
  expect(names.length).toBeGreaterThan(0);
  expect(names.filter((n) => categoryOf(n) === "other")).toEqual([]);
  expect(listed.filter((n) => !names.includes(n))).toEqual([]);
  expect(new Set(listed).size).toBe(listed.length);
});

it("summary lines count passes per category, unlisted cases under other", () => {
  const cases = [
    { name: "saved variables", state: "passed" },
    { name: "modules", state: "failed" },
    { name: "TEST-ONLY case with no category", state: "passed" },
  ];
  expect(summaryLines(tally(cases))).toEqual(["  core     1/2 passed", "  other    1/1 passed"]);
});