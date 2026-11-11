#!/usr/bin/env node
// Writes scripts/shard-times.json, the per-test-file seconds the shard planner balances by
// (scripts/lib/shard-plan.mjs), from a measured run. Sources, any number of them:
//   --log <file>     a job log of a shard (the "✓ lua scripts/tests/x.test.mjs (n tests) 1234ms" lines)
//   --junit <file>   the coverage/junit.xml of a job (the lua-shard-<i> artifacts)
//   --run <id>       a workflow run on GitHub: the logs of its shard jobs, read with `gh api`
// With several sources a file's time is their mean. Files that no longer exist are dropped, and a file the
// sources do not hold keeps its old time. --print shows the plan for --count n (default: the lua-suite default) and writes nothing.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./lib/lua-harness.mjs";
import { TIMES_FILE, averageTimes, estimateWall, junitDurations, logDurations, luaTestFiles, planShards, readTimes, timesText } from "./lib/shard-plan.mjs";

const args = process.argv.slice(2);

// Every value of a repeated option, in order.
function valuesOf(name) {
  return args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
}

// The output of a `gh api` call, or a thrown error with what gh said.
function gh(route) {
  const out = spawnSync("gh", ["api", route], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (out.status !== 0) throw new Error(`gh api ${route} failed:\n${out.stderr}`);
  return out.stdout;
}

// The measured tables of the shard jobs of a run: each job's log.
function runTables(runId) {
  const jobs = JSON.parse(gh(`repos/clifftaylor2325/wow-vanguard-ui/actions/runs/${runId}/jobs?per_page=100`)).jobs;
  const shards = jobs.filter((job) => /Tests, shard/.test(job.name));
  return shards.map((job) => logDurations(gh(`repos/clifftaylor2325/wow-vanguard-ui/actions/jobs/${job.id}/logs`)));
}

// Every measured table the options name.
function measurements() {
  const logs = valuesOf("log").map((file) => logDurations(fs.readFileSync(file, "utf8")));
  const junits = valuesOf("junit").map((file) => junitDurations(fs.readFileSync(file, "utf8")));
  return [...logs, ...junits, ...valuesOf("run").flatMap(runTables)];
}

// Prints the plan the committed times give for --count shards.
function printPlan() {
  const count = Number(valuesOf("count")[0] ?? 12);
  const times = readTimes(root);
  const plan = planShards(luaTestFiles(root), times, count);
  for (const [i, shard] of plan.entries()) console.log(`shard ${i + 1}: ${shard.files.length} files, ${shard.seconds} file-seconds, about ${estimateWall(shard.files, times, 4)} s on 4 workers`);
}

// Writes the table: the measured files, then the old ones the measurements lack, minus files gone from disk.
function writeTable() {
  const measured = averageTimes(measurements());
  if (Object.keys(measured).length === 0) throw new Error("no test file times found in the sources given");
  const onDisk = new Set(luaTestFiles(root));
  const merged = { ...readTimes(root), ...measured };
  const kept = Object.fromEntries(Object.entries(merged).filter(([file]) => onDisk.has(file)));
  fs.writeFileSync(path.join(root, TIMES_FILE), timesText(kept));
  console.log(`wrote ${TIMES_FILE}: ${Object.keys(kept).length} files, ${Object.keys(measured).length} measured`);
}

if (args.includes("--print")) printPlan();
else writeTable();
