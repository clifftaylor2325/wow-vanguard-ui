// Checks the balanced shard planner (scripts/lib/shard-plan.mjs, scripts/shard-times.json): reading times
// from a job log or a JUnit file, the greedy plan, and the guarantee CI relies on, that for the test files
// on disk every file of the lua project lands in exactly one shard and Vitest, handed a shard's list,
// selects exactly those files. No test runs; `vitest list` only names files.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { root } from "./lib/lua-harness.mjs";
import { balancedOption, planMergeProblems, planOption } from "./lib/coverage-shards.mjs";
import { averageTimes, currentPlan, estimateWall, junitDurations, logDurations, luaTestFiles, PLAN_ENV, planProblems, planShards, readTimes, timesText } from "./lib/shard-plan.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-plan-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// Writes a file (and its folders) under the scratch folder.
function put(rel, text) {
  const file = path.join(scratch, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

it("a job log's per-file lines give seconds per file, colour codes and all", () => {
  const log = [
    "2026-11-11T00:41:59Z  \x1b[32m✓\x1b[39m \x1b[30m\x1b[46m lua \x1b[49m\x1b[39m scripts/tests/plates.test.mjs \x1b[2m(\x1b[22m\x1b[2m20 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[33m 59225\x1b[2mms\x1b[22m\x1b[39m",
    " ✓ quick scripts/pkgmeta.test.mjs (1 test) 800ms",
    " ❯ lua scripts/tests/chat.test.mjs (3 tests | 1 failed) 1500ms",
    " Test Files  3 passed (3)",
  ].join("\n");
  expect(logDurations(log)).toEqual({ "scripts/tests/plates.test.mjs": 59.225, "scripts/pkgmeta.test.mjs": 0.8, "scripts/tests/chat.test.mjs": 1.5 });
});

it("a JUnit file's test suites give seconds per file", () => {
  const xml = '<testsuites tests="3">\n<testsuite name="scripts/tests/a.test.mjs" timestamp="t" tests="2" time="12.5">\n<testsuite name="not a file" time="3">\n<testsuite name="scripts/b.test.mjs" time="0.25">';
  expect(junitDurations(xml)).toEqual({ "scripts/tests/a.test.mjs": 12.5, "scripts/b.test.mjs": 0.25 });
});

it("several measurements average per file, and the committed table is sorted text that reads back", () => {
  const table = averageTimes([{ "b.test.mjs": 10, "a.test.mjs": 1 }, { "b.test.mjs": 20.1 }]);
  expect(table).toEqual({ "a.test.mjs": 1, "b.test.mjs": 15.1 });
  expect(Object.keys(table)).toEqual(["a.test.mjs", "b.test.mjs"]);
  expect(JSON.parse(timesText(table))).toEqual(table);
  expect(timesText(table)).toBe('{\n  "a.test.mjs": 1,\n  "b.test.mjs": 15.1\n}\n');
});

it("the plan puts the longest file first into the lightest shard", () => {
  const times = { "a": 10, "b": 9, "c": 5, "d": 5, "e": 1 };
  const plan = planShards(["e", "d", "c", "b", "a"], times, 2);
  expect(plan).toEqual([{ files: ["a", "d"], seconds: 15 }, { files: ["b", "c", "e"], seconds: 15 }]);
});

it("the plan does not depend on the order the files are given in", () => {
  const times = { a: 3, b: 3, c: 3, d: 2 };
  expect(planShards(["d", "c", "b", "a"], times, 2)).toEqual(planShards(["a", "b", "c", "d"], times, 2));
});

it("files with no time count as the median and spread evenly; with no times at all every file counts the same", () => {
  const plan = planShards(["a", "b", "c", "d", "e", "f"], { a: 4 }, 3);
  expect(plan.map((s) => s.files.length)).toEqual([2, 2, 2]);
  expect(planShards(["a", "b"], { a: 6, b: 2 }, 1)[0].seconds).toBe(8);
  const even = planShards(["a", "b", "c", "d"], {}, 2);
  expect(even.map((s) => s.files.length)).toEqual([2, 2]);
  expect(planShards(["a", "b", "c"], { a: 1, b: 2 }, 2).flatMap((s) => s.files).sort()).toEqual(["a", "b", "c"]);
});

it("more shards than files leave empty shards, and a bad count throws", () => {
  expect(planShards(["a"], { a: 1 }, 3).map((s) => s.files.length)).toEqual([1, 0, 0]);
  for (const bad of [0, -1, 1.5, NaN]) expect(() => planShards(["a"], {}, bad), String(bad)).toThrow(/whole number of 1 or more/);
});

it("the wall estimate runs the longest file first on the freest worker and is never under the longest file", () => {
  expect(estimateWall(["a", "b", "c"], { a: 10, b: 4, c: 4 }, 2)).toBe(10);
  expect(estimateWall(["a", "b", "c"], { a: 4, b: 4, c: 4 }, 2)).toBe(8);
  expect(estimateWall(["a"], { a: 7 }, 4)).toBe(7);
});

it("a plan is checked for a file in no shard, in two shards, or not on disk", () => {
  const plan = [{ files: ["a", "b"] }, { files: ["b", "x"] }];
  expect(planProblems(plan, ["a", "b", "c"])).toEqual(["c is in no shard", "b is in 2 shards", "x is planned but does not exist"]);
  expect(planProblems([{ files: ["a"] }, { files: ["b"] }], ["a", "b"])).toEqual([]);
});

it("every lua-project test file on disk is in exactly one shard, for every shard count CI accepts", () => {
  const files = luaTestFiles(root);
  expect(files).toContain("scripts/tests/chat.test.mjs");
  expect(files).toContain("scripts/lua-engine.test.mjs");
  expect(files.some((f) => f.endsWith("smoke.test.mjs")), "the quick project's files are not planned").toBe(false);
  const times = readTimes(root);
  for (let count = 1; count <= 16; count += 1) expect(planProblems(planShards(files, times, count), files), `${count} shards`).toEqual([]);
});

it("the committed timing table is whole seconds-per-file numbers for files that exist", () => {
  const files = new Set(luaTestFiles(root));
  const times = readTimes(root);
  for (const [file, seconds] of Object.entries(times)) {
    expect(files.has(file), `${file} in shard-times.json is not a lua-project test file (node scripts/shard-times.mjs rewrites the table)`).toBe(true);
    expect(seconds, file).toBeGreaterThanOrEqual(0);
  }
  expect(Object.keys(times).length).toBeGreaterThan(100);
});

it("VG_SKIP_RETAIL leaves the Retail-only files out of a local run but not out of the plan or the times table check", () => {
  const before = process.env.VG_SKIP_RETAIL;
  process.env.VG_SKIP_RETAIL = "1";
  try {
    expect(luaTestFiles(root)).toContain("scripts/tests/retail-bank.test.mjs");
  } finally {
    if (before === undefined) delete process.env.VG_SKIP_RETAIL;
    else process.env.VG_SKIP_RETAIL = before;
  }
});

it("Vitest, handed one shard's file list, selects exactly those files", () => {
  const shard = currentPlan(root, 12)[0].files;
  const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
  const out = spawnSync(process.execPath, [bin, "list", "--filesOnly", "--project", "lua", ...shard], { cwd: root, encoding: "utf8", env: PLAN_ENV });
  const listed = out.stdout.split("\n").map((l) => l.replace(/^\[[^\]]*\]\s*/, "").trim()).filter((l) => l.endsWith(".test.mjs"));
  expect(listed.sort(), out.stderr).toEqual([...shard].sort());
});

it("--balanced i/n and --plan n are read, and wrong ones throw", () => {
  expect(balancedOption(["--balanced", "3/10"])).toEqual({ index: 3, count: 10 });
  expect(balancedOption(["--project", "lua"])).toBeNull();
  expect(() => balancedOption(["--balanced=11/10"])).toThrow(/--balanced must be i\/n/);
  expect(planOption(["--merge", "d", "--plan", "10"])).toBe(10);
  expect(planOption(["--merge", "d"])).toBeNull();
  for (const bad of ["0", "x", "2.5"]) expect(() => planOption(["--plan", bad]), bad).toThrow(/--plan must be a whole number/);
});

it("a merge is held to the plan: a file not run, run twice, or run in the wrong shard each fail", () => {
  const plan = [{ files: ["scripts/tests/a.test.mjs", "scripts/tests/b.test.mjs"] }, { files: ["scripts/tests/c.test.mjs"] }];
  put("ok/lua-shard-1/lua-hits/a.test.mjs-1.json", "{}");
  put("ok/lua-shard-1/lua-hits/b.test.mjs-1.json", "{}");
  put("ok/lua-shard-2/lua-hits/c.test.mjs-2.json", "{}");
  put("ok/lua-shard-quick/lua-hits/smoke.test.mjs-3.json", "{}");
  expect(planMergeProblems(path.join(scratch, "ok"), plan)).toEqual([]);
  put("bad/lua-shard-1/lua-hits/a.test.mjs-1.json", "{}");
  put("bad/lua-shard-1/lua-hits/a.test.mjs-9.json", "{}");
  put("bad/lua-shard-1/lua-hits/c.test.mjs-1.json", "{}");
  expect(planMergeProblems(path.join(scratch, "bad"), plan)).toEqual([
    "shard 1 did not run b.test.mjs",
    "shard 1 ran a.test.mjs more than once",
    "shard 1 ran c.test.mjs, which is not in its plan",
    "shard 2 did not run c.test.mjs",
  ]);
});
