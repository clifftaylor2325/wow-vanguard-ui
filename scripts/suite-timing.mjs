#!/usr/bin/env node
// npm run timing: runs the suite (or the files named after the options) under
// Vitest on a fixed number of workers (2 by default, the hosted runner's
// size, D-01), reads the JSON report, and prints the machine, the total wall
// time, the sum of file times, the most files that ran at once, the test
// counts and a per-file table (D-06). It exits 1 when a test failed, when the
// wall time is over --budget (seconds, default 300), or when more files ran
// at once than the worker cap.
//   --workers <n>       worker cap (default 2)
//   --budget <seconds>  wall-time budget (default 300)
//   --cases-out <file>  write every case as a sorted `file|case` line; refused
//                       when any case did not pass
//   --baseline <file>   not wired yet (the baseline check comes with its tests)
// Environment variables (VG_LOGIN_SCOPE, VG_SHUFFLE_SEED, LUA_PROFILE) pass
// through to the run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { caseList, formatReport, machineBusy, maxConcurrent } from "./lib/suite-timing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const reportFile = path.join(root, "coverage", "suite-timing.json");
const OPTIONS = {
  workers: { type: "string", default: "2" },
  budget: { type: "string", default: "300" },
  "cases-out": { type: "string" },
  baseline: { type: "string" },
};

// Prints a message and exits 1.
function fail(message) {
  console.error(message);
  process.exit(1);
}

// The options typed on the command line; positionals are Vitest file filters.
function readOptions(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  const opts = { workers: Number(values.workers), budget: Number(values.budget), casesOut: values["cases-out"], baseline: values.baseline, filters: positionals };
  if (!Number.isInteger(opts.workers) || opts.workers < 1) fail(`--workers must be a whole number of 1 or more, not "${values.workers}"`);
  if (!(opts.budget > 0)) fail(`--budget must be a number of seconds above 0, not "${values.budget}"`);
  if (opts.baseline) fail("--baseline is not available yet");
  return opts;
}

// Runs Vitest with the JSON reporter; returns its exit status and the wall seconds around it.
function runVitest(opts) {
  fs.rmSync(reportFile, { force: true });
  const args = [bin, "run", `--maxWorkers=${opts.workers}`, "--reporter=json", `--outputFile=${reportFile}`, ...opts.filters];
  const started = Date.now();
  const run = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env } });
  return { status: run.status ?? 1, wall: (Date.now() - started) / 1000 };
}

// The machine and settings printed at the top of the report.
function environment(opts, busy) {
  const vitest = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "vitest", "package.json"), "utf8")).version;
  return { date: new Date().toISOString(), cpu: os.cpus()[0].model, cores: os.cpus().length, node: process.version, vitest, workers: opts.workers, busy };
}

// Why the run fails: failed tests, a Vitest error, wall time over budget, too many files at once.
function runProblems(opts, run, report) {
  const problems = [];
  if (report.numFailedTests > 0) problems.push(`${report.numFailedTests} test(s) failed`);
  if (run.status !== 0 && report.numFailedTests === 0) problems.push(`Vitest exited with status ${run.status}`);
  if (maxConcurrent(report) > opts.workers) problems.push(`${maxConcurrent(report)} files ran at once, more than the cap of ${opts.workers}`);
  const over = run.wall > opts.budget;
  console.log(`${over ? "over budget" : "within budget"}: ${run.wall.toFixed(1)} s ${over ? ">" : "<="} ${opts.budget} s`);
  if (over) problems.push("wall time is over the budget");
  return problems;
}

// Writes the sorted case list when every case passed; returns the problems.
function writeCases(opts, report) {
  const cases = caseList(report, root);
  const bad = cases.filter((c) => c.status !== "passed");
  if (bad.length) return [`--cases-out refused: ${bad.length} case(s) did not pass, for example ${bad[0].file}|${bad[0].key}`];
  const lines = cases.map((c) => `${c.file}|${c.key}`).sort();
  fs.writeFileSync(opts.casesOut, `${lines.join("\n")}\n`);
  console.log(`wrote ${lines.length} cases to ${opts.casesOut}`);
  return [];
}

// Reads the JSON report Vitest wrote, or exits 1 naming Vitest's exit status.
function loadReport(run) {
  if (!fs.existsSync(reportFile)) fail(`Vitest wrote no report (exit status ${run.status})`);
  return JSON.parse(fs.readFileSync(reportFile, "utf8"));
}

// Runs the suite, prints the report, exits 1 on any problem.
async function main() {
  const opts = readOptions(process.argv.slice(2));
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  const busy = await machineBusy(1000);
  const run = runVitest(opts);
  const report = loadReport(run);
  console.log(formatReport({ env: environment(opts, busy), wall: run.wall, report, root }));
  const problems = [...runProblems(opts, run, report), ...(opts.casesOut ? writeCases(opts, report) : [])];
  problems.forEach((p) => console.error(`FAIL: ${p}`));
  process.exit(problems.length ? 1 : 0);
}

await main();
