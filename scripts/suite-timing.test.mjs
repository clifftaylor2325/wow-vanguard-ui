// npm run timing (scripts/suite-timing.mjs) is built on small pure functions in
// scripts/lib/suite-timing.mjs. These tests run them on canned Vitest JSON
// reports built inline; nothing here loads the addon or starts Vitest.

import { expect, it } from "vitest";
import { baselineDiff, caseKey, caseList, fileRows, formatReport, machineBusy, maxConcurrent, relFile, wallSpan } from "./lib/suite-timing.mjs";

// A report with one file per [startMs, endMs] pair and no cases.
function reportOf(intervals) {
  return { testResults: intervals.map(([startTime, endTime], i) => ({ name: `/r/f${i}.test.mjs`, startTime, endTime, assertionResults: [] })) };
}

// One assertion result with the given ancestors, title and status.
function assertion(ancestorTitles, title, status = "passed") {
  return { ancestorTitles, title, status };
}

// A case as caseList returns it.
function kase(file, key, status = "passed") {
  return { file, key, status };
}

it("wallSpan and maxConcurrent: measure the span and the overlap of file intervals", () => {
  const report = reportOf([[0, 10000], [5000, 20000], [30000, 31000]]);
  expect(wallSpan(report)).toBe(31);
  expect(maxConcurrent(report)).toBe(2);
});

it("wallSpan and maxConcurrent: count back-to-back files as one at a time, and an empty report as none", () => {
  expect(maxConcurrent(reportOf([[0, 10000], [10000, 20000]]))).toBe(1);
  expect(maxConcurrent(reportOf([]))).toBe(0);
  expect(wallSpan(reportOf([]))).toBe(0);
});

it("relFile and fileRows: make repo-relative paths with forward slashes, from POSIX or Windows paths", () => {
  expect(relFile("/repo", "/repo/scripts/tests/x.test.mjs")).toBe("scripts/tests/x.test.mjs");
  expect(relFile("C:\\repo", "c:\\repo\\scripts\\tests\\x.test.mjs")).toBe("scripts/tests/x.test.mjs");
  expect(relFile("/repo", "/elsewhere/y.mjs")).toBe("/elsewhere/y.mjs");
});

it("relFile and fileRows: list files longest first with their test and passed counts", () => {
  const report = {
    testResults: [
      { name: "C:\\repo\\scripts\\a.test.mjs", startTime: 0, endTime: 2000, assertionResults: [assertion([], "one")] },
      { name: "C:\\repo\\scripts\\tests\\x.test.mjs", startTime: 0, endTime: 9500, assertionResults: [assertion([], "p"), assertion([], "f", "failed"), assertion([], "q")] },
    ],
  };
  expect(fileRows(report, "C:\\repo")).toEqual([
    { file: "scripts/tests/x.test.mjs", tests: 3, passed: 2, seconds: 9.5 },
    { file: "scripts/a.test.mjs", tests: 1, passed: 1, seconds: 2 },
  ]);
});

it("caseKey and caseList: join the describe titles and the case title with ' > '", () => {
  expect(caseKey(assertion(["outer", "inner"], "t"))).toBe("outer > inner > t");
  expect(caseKey(assertion([], "top level"))).toBe("top level");
  expect(caseKey({ title: "no ancestors listed" })).toBe("no ancestors listed");
});

it("caseKey and caseList: list every case with its file, key and status", () => {
  const report = { testResults: [{ name: "/repo/a.test.mjs", assertionResults: [assertion(["d"], "x"), assertion([], "y", "skipped")] }] };
  expect(caseList(report, "/repo")).toEqual([kase("a.test.mjs", "d > x"), kase("a.test.mjs", "y", "skipped")]);
});

it("baselineDiff: counts a baseline case that is present and passed", () => {
  const diff = baselineDiff(["a|x", "b|y"], [kase("a", "x"), kase("b", "y")]);
  expect(diff).toEqual({ total: 2, passed: 2, missing: [], notPassed: [], added: {} });
});

it("baselineDiff: reports a listed case that is absent as missing", () => {
  const diff = baselineDiff(["a|x", "b|y"], [kase("a", "x")]);
  expect(diff.missing).toEqual(["b|y"]);
  expect(diff.passed).toBe(1);
});

it("baselineDiff: reports a listed case that failed or was skipped as not passed", () => {
  const diff = baselineDiff(["a|x", "a|y", "a|z"], [kase("a", "x", "failed"), kase("a", "y", "skipped"), kase("a", "z")]);
  expect(diff.notPassed).toEqual(["a|x", "a|y"]);
  expect(diff.passed).toBe(1);
  expect(diff.missing).toEqual([]);
});

it("baselineDiff: groups cases that are not in the list by file", () => {
  const diff = baselineDiff(["a|x"], [kase("a", "x"), kase("a", "n1"), kase("a", "n2"), kase("b", "n3")]);
  expect(diff.added).toEqual({ a: 2, b: 1 });
});

it("baselineDiff: needs one passing case for each copy of a duplicated line", () => {
  const lines = ["a|x", "a|x"];
  expect(baselineDiff(lines, [kase("a", "x")])).toMatchObject({ passed: 1, missing: ["a|x"] });
  expect(baselineDiff(lines, [kase("a", "x", "failed"), kase("a", "x")])).toMatchObject({ passed: 1, notPassed: ["a|x"], missing: [] });
  expect(baselineDiff(lines, [kase("a", "x"), kase("a", "x")])).toMatchObject({ passed: 2, missing: [], notPassed: [] });
});

const env = { date: "2026-10-10T00:00:00.000Z", cpu: "Test CPU ", cores: 4, node: "v24.0.0", vitest: "5.0.3", workers: 2, busy: 7 };
const report = {
  numPassedTests: 3,
  numFailedTests: 0,
  numPendingTests: 1,
  numTodoTests: 1,
  testResults: [
    { name: "/repo/scripts/a.test.mjs", startTime: 0, endTime: 4000, assertionResults: [assertion([], "x")] },
    { name: "/repo/scripts/b.test.mjs", startTime: 1000, endTime: 9000, assertionResults: [assertion([], "y"), assertion([], "z")] },
  ],
};

it("formatReport: prints every header label in order, then one table row per file", () => {
  const lines = formatReport({ env, wall: 12.34, report, root: "/repo" }).split("\n");
  const labels = ["date ", "cpu ", "cores ", "node ", "vitest ", "workers ", "busy before run ", "total wall ", "file span ", "sum of file times ", "max concurrent files ", "tests "];
  expect(lines.slice(0, 12).map((l, i) => l.startsWith(labels[i]))).toEqual(labels.map(() => true));
  expect(lines.slice(14)).toEqual(["    8.0      2  scripts/b.test.mjs", "    4.0      1  scripts/a.test.mjs"]);
});

it("formatReport: prints the figures: wall, span, sum, concurrency and counts with todo counted as skipped", () => {
  const text = formatReport({ env, wall: 12.34, report, root: "/repo" });
  expect(text).toContain("cpu Test CPU\n");
  expect(text).toContain("busy before run 7%");
  expect(text).toContain("total wall 12.3 s\nfile span 9.0 s\nsum of file times 12.0 s\nmax concurrent files 2\n");
  expect(text).toContain("tests 3 passed, 0 failed, 2 skipped");
});

it("machineBusy: resolves to a percent between 0 and 100", async () => {
  const busy = await machineBusy(20);
  expect(busy).toBeGreaterThanOrEqual(0);
  expect(busy).toBeLessThanOrEqual(100);
});
