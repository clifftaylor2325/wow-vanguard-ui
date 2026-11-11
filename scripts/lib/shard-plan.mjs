// The balanced split of the lua project's test files over CI shards (lua-suite.yml).
// scripts/shard-times.json holds how long each test file took in a measured run (seconds); the
// planner assigns files to shards greedily by that time, longest first into the lightest shard,
// and each shard then runs an explicit list of files (npm run coverage -- --balanced i/n).
// Everything here is a pure function except luaTestFiles (it asks Vitest which files the lua project
// holds) and readTimes. The planner is deterministic, so every shard job computes the same plan
// from the same checkout and no job has to hand the plan to another.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const TIMES_FILE = "scripts/shard-times.json";

// The time given to a file the table has no time for: the median of the known times, else this many seconds.
export const FALLBACK_SECONDS = 10;

// The text of a log or JUnit file with its colour codes removed.
function plain(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// The seconds per test file a Vitest job log holds (its "✓ lua scripts/tests/x.test.mjs (3 tests) 1234ms" lines), as { file: seconds }.
export function logDurations(logText) {
  const found = {};
  for (const line of plain(logText).split("\n")) {
    const match = line.match(/(?:✓|❯|×)\s+(?:\w+\s+)?(\S+\.test\.mjs)\s+\(\d+ tests?[^)]*\)\s+(\d+)ms/);
    if (match) found[match[1]] = Number(match[2]) / 1000;
  }
  return found;
}

// The seconds per test file a Vitest JUnit file holds (one <testsuite name="file" time="s"> each), as { file: seconds }.
export function junitDurations(xml) {
  const found = {};
  for (const tag of xml.match(/<testsuite\b[^>]*>/g) ?? []) {
    const name = tag.match(/\bname="([^"]*\.test\.mjs)"/)?.[1];
    const time = tag.match(/\btime="([\d.]+)"/)?.[1];
    if (name && time) found[name] = Number(time);
  }
  return found;
}

// The mean of a list of numbers, to a tenth.
function meanOf(list) {
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
}

// Several measurements of the same files as one table: the mean of each file's seconds, to a tenth.
export function averageTimes(measurements) {
  const sums = {};
  for (const table of measurements) for (const [file, seconds] of Object.entries(table)) (sums[file] ??= []).push(seconds);
  return Object.fromEntries(Object.entries(sums).sort(([a], [b]) => (a < b ? -1 : 1)).map(([file, list]) => [file, meanOf(list)]));
}

// The table as the text committed to the repository: sorted, one file per line.
export function timesText(table) {
  const lines = Object.keys(table).sort().map((file) => `  ${JSON.stringify(file)}: ${table[file]}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}

// The median of a list of numbers (0 for an empty list).
function median(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

// The seconds to plan with for each file: its table time, or the median of the table's times for a file it lacks.
export function plannedSeconds(files, times) {
  const known = files.filter((file) => file in times).map((file) => times[file]);
  const guess = median(known) || FALLBACK_SECONDS;
  return files.map((file) => ({ file, seconds: file in times ? times[file] : guess }));
}

// Splits the files over `count` shards: longest first, each into the shard with the least time so far
// (the lowest number on a tie); a file with no time counts as the median, so such files spread evenly.
// Returns [{ files, seconds }] with `count` entries, in shard order; a shard may be empty.
export function planShards(files, times, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`the shard count must be a whole number of 1 or more, not ${count}`);
  const shards = Array.from({ length: count }, () => ({ files: [], seconds: 0 }));
  const order = plannedSeconds(files, times).sort((a, b) => b.seconds - a.seconds || (a.file < b.file ? -1 : 1));
  for (const { file, seconds } of order) {
    const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
    lightest.files.push(file);
    lightest.seconds += seconds;
  }
  return shards.map((shard) => ({ files: shard.files.sort(), seconds: Math.round(shard.seconds * 10) / 10 }));
}

// The wall time, in seconds, a shard's files take on `workers` parallel workers, as Vitest runs them: the longest
// file first, each on the worker that is free soonest. A planning estimate; it cannot be shorter than the longest file.
export function estimateWall(files, times, workers) {
  const busy = Array(workers).fill(0);
  for (const { seconds } of plannedSeconds(files, times).sort((a, b) => b.seconds - a.seconds)) {
    busy.sort((a, b) => a - b);
    busy[0] += seconds;
  }
  return Math.round(Math.max(...busy) * 10) / 10;
}

// What is wrong with a plan against the files that exist: a file in no shard, a file in two, a file that does not exist.
export function planProblems(plan, files) {
  const seen = new Map();
  for (const shard of plan) for (const file of shard.files) seen.set(file, (seen.get(file) ?? 0) + 1);
  const problems = [];
  for (const file of files) if (!seen.has(file)) problems.push(`${file} is in no shard`);
  for (const [file, times] of seen) if (times > 1) problems.push(`${file} is in ${times} shards`);
  for (const file of seen.keys()) if (!files.includes(file)) problems.push(`${file} is planned but does not exist`);
  return problems;
}

// The committed timing table ({ file: seconds }).
export function readTimes(root) {
  return JSON.parse(fs.readFileSync(path.join(root, TIMES_FILE), "utf8"));
}

// The test files of the lua project, as paths from the repository root, sorted (asked of Vitest, which runs nothing).
export function luaTestFiles(root) {
  const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
  const out = spawnSync(process.execPath, [bin, "list", "--filesOnly", "--project", "lua"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
  if (out.status !== 0) throw new Error(`vitest list failed:\n${out.stdout}${out.stderr}`);
  const lines = out.stdout.split("\n").map((l) => l.replace(/^\[[^\]]*\]\s*/, "").trim());
  return lines.filter((l) => l.endsWith(".test.mjs")).map((l) => path.relative(root, path.resolve(root, l)).split(path.sep).join("/")).sort();
}

// The plan for the files on disk with the committed times.
export function currentPlan(root, count) {
  return planShards(luaTestFiles(root), readTimes(root), count);
}
