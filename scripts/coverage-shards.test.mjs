// Checks the sharded coverage run (scripts/lib/coverage-shards.mjs and the --shard and --merge
// modes of scripts/coverage-lua.mjs): the options, the hits files found, everything that must
// fail a merge (a missing shard, an empty shard, a test file with no hits), the union of hits,
// and the floor judged once over the merged hits. No test runs; `vitest list` only names files.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { root } from "./lib/lua-harness.mjs";
import { anyClientPaths, readToc } from "./lib/toc.mjs";
import { expectedTestFiles, hitsFilesUnder, junitTotals, listedTestFiles, mergeOption, mergeProblems, shardOption, testFileOf } from "./lib/coverage-shards.mjs";
import { coverageReport, executableLines, loadHitFiles } from "./lib/lua-coverage.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-shards-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// Writes a file (and its folders) under the scratch folder; returns its path.
function put(rel, text) {
  const file = path.join(scratch, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

it("--shard i/n is read in both spellings, and a malformed or out-of-range one throws", () => {
  expect(shardOption(["--shard", "2/4"])).toEqual({ index: 2, count: 4 });
  expect(shardOption(["--project", "lua", "--shard=4/4"])).toEqual({ index: 4, count: 4 });
  expect(shardOption(["--project", "lua"])).toBeNull();
  for (const bad of ["0/4", "5/4", "x/4", "2", "1.5/3"]) expect(() => shardOption(["--shard", bad]), bad).toThrow(/--shard must be i\/n/);
  expect(() => shardOption(["--shard"])).toThrow(/needs a value/);
});

it("--merge <dir> and --shards n are read, and without --merge there is no merge", () => {
  expect(mergeOption(["--merge", "shards", "--shards", "4"])).toEqual({ dir: "shards", shards: 4 });
  expect(mergeOption(["--merge=a/b"])).toEqual({ dir: "a/b", shards: null });
  expect(mergeOption(["--shard", "1/2"])).toBeNull();
});

it("hits files are found at any depth, JSON only, in order, and named back to their test file", () => {
  put("tree/shard-2/lua-hits/b.test.mjs-9.json", "{}");
  put("tree/shard-1/lua-hits/a.test.mjs-7.json", "{}");
  put("tree/shard-1/junit.xml", "<testsuites/>");
  const found = hitsFilesUnder(path.join(scratch, "tree")).map((f) => path.relative(scratch, f));
  expect(found).toEqual([path.join("tree", "shard-1", "lua-hits", "a.test.mjs-7.json"), path.join("tree", "shard-2", "lua-hits", "b.test.mjs-9.json")]);
  expect(testFileOf("/x/lua-hits/lua-engine.test.mjs-31337.json")).toBe("lua-engine.test.mjs");
});

it("the listed test files come from the lines `vitest list --filesOnly` prints", () => {
  const out = "[hooks] scripts/agent-check.test.mjs\n[lua] scripts/tests/chat.test.mjs\n\nsome other line\n";
  expect([...listedTestFiles(out)]).toEqual(["agent-check.test.mjs", "chat.test.mjs"]);
  expect(expectedTestFiles(root).has("test-slot.test.mjs")).toBe(true);
});

it("a complete merge folder has no problems", () => {
  const expected = new Set(["a.test.mjs", "b.test.mjs"]);
  expect(mergeProblems(path.join(scratch, "tree"), 2, expected)).toEqual([]);
  expect(mergeProblems(path.join(scratch, "tree"), null, expected)).toEqual([]);
});

it("a missing shard, an empty shard, a test file without hits and a stray hits file each fail the merge", () => {
  put("bad/shard-1/lua-hits/a.test.mjs-7.json", "{}");
  put("bad/shard-2/junit.xml", "<testsuites/>");
  const problems = mergeProblems(path.join(scratch, "bad"), 3, new Set(["a.test.mjs", "b.test.mjs"]));
  expect(problems).toEqual([
    "expected the hits of 3 shards, found 2 folder(s): shard-1, shard-2",
    "shard folder shard-2 holds no hits file",
    "no hits file for test file b.test.mjs",
  ]);
  const stray = mergeProblems(path.join(scratch, "tree"), 2, new Set(["a.test.mjs"]));
  expect(stray).toEqual(["hits file for b.test.mjs, which Vitest does not list"]);
  expect(mergeProblems(path.join(scratch, "bad"), 0, new Set()).join("\n")).toContain("found 2 folder(s)");
  put("none/readme.txt", "x");
  expect(mergeProblems(path.join(scratch, "none"), 1, new Set())).toEqual(["expected the hits of 1 shards, found 0 folder(s): none"]);
});

it("JUnit totals add up across shards, and a file without totals counts as none", () => {
  put("junit/s1/junit.xml", '<?xml version="1.0"?>\n<testsuites name="vitest tests" tests="120" failures="1" errors="0">');
  put("junit/s2/junit.xml", '<testsuites name="vitest tests" tests="80" failures="0">');
  put("junit/s3/junit.xml", "<nothing/>");
  expect(junitTotals(path.join(scratch, "junit"))).toEqual({ files: 3, tests: 200, failures: 1 });
});

it("the hits of several shards are united: a line any shard hit counts as covered", () => {
  const theme = fs.readFileSync(path.join(root, "Core/Theme.lua"), "utf8");
  const [first, second, third] = [...executableLines(theme, "@Core/Theme.lua")].sort((a, b) => a - b);
  const one = put("union/one.json", JSON.stringify({ "@Core/Theme.lua": [first, second] }));
  const two = put("union/two.json", JSON.stringify({ "@Core/Theme.lua": [second, third], "@Core/Events.lua": [5] }));
  loadHitFiles([one]);
  expect(coverageReport(root, ["Core/Theme.lua"]).covered).toBe(2);
  loadHitFiles([one, two]);
  expect(coverageReport(root, ["Core/Theme.lua"]).covered, "the third line comes from the second shard").toBe(3);
  loadHitFiles([]);
  expect(coverageReport(root, ["Core/Theme.lua"]).covered).toBe(0);
});

// Writes one hits file per listed test file, split over `shards` folders, each hitting `lines(file)`.
function writeShards(name, shards, lines) {
  const files = [...expectedTestFiles(root)].sort();
  files.forEach((file, i) => put(`${name}/shard-${(i % shards) + 1}/lua-hits/${file}-${1000 + i}.json`, JSON.stringify(i === 0 ? lines : {})));
  return path.join(scratch, name);
}

// Every executable line of every file the TOC loads, as the hits one test file could dump.
function everyLine() {
  const files = anyClientPaths(readToc(root)).filter((f) => f.endsWith(".lua") && !f.startsWith("Libs/"));
  return Object.fromEntries(files.map((f) => [`@${f}`, [...executableLines(fs.readFileSync(path.join(root, f), "utf8"), `@${f}`)]]));
}

// Runs `coverage-lua.mjs --merge` on a folder: { status, out }.
function merge(dir, ...more) {
  const run = spawnSync(process.execPath, ["scripts/coverage-lua.mjs", "--merge", dir, ...more], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

it("--merge judges the floor once over every shard: 100% passes, a missing shard or too few lines fail", () => {
  const full = merge(writeShards("full", 4, everyLine()), "--shards", "4");
  expect(full.out).toMatch(/merged \d+ hits files from 4 shards/);
  expect(full.out).toMatch(/total .* 100\.00%/);
  expect(full.status, full.out).toBe(0);
  const short = merge(writeShards("short", 4, {}), "--shards", "4");
  expect(short.status).toBe(1);
  expect(short.out).toMatch(/below the floor of 100%/);
  const gone = merge(path.join(scratch, "full"), "--shards", "5");
  expect(gone.status).toBe(1);
  expect(gone.out).toContain("expected the hits of 5 shards, found 4 folder(s)");
}, 120_000);

// Every *.test.mjs file under scripts/, repo-relative with forward slashes.
function testFilesUnder(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : testFilesUnder(rel);
    return e.name.endsWith(".test.mjs") ? [rel] : [];
  });
}

it("no two test files share a base name (the merge names hits files by base name alone)", () => {
  const names = testFilesUnder("scripts").map((f) => path.basename(f));
  const repeated = names.filter((n, i) => names.indexOf(n) !== i);
  expect(repeated, "rename one: a shared name lets one file's missing hits pass as the other's").toEqual([]);
});
