#!/usr/bin/env node
// npm run coverage: runs every test (the Lua harness under scripts/tests/ and
// the JS tests) under Vitest with line coverage on, merges the hits each
// test file dumped, writes coverage/lua-coverage.json, and fails if the
// total is under the floor in scripts/lua-coverage-floor.json. A failing
// test fails the run before any hits are read, and no hits files at all
// fails too. The floor only goes up; 100 is the goal.
//
// CI splits the run over parallel jobs (lua-suite.yml), in two more modes:
//   npm run coverage -- --shard i/n        runs shard i of n (Vitest's own option) and dumps its
//                                          hits; no floor, since one shard sees part of the suite
//   npm run coverage -- --balanced i/n    the same, but shard i of n of the lua project's test files as
//                                          planned by their measured times (scripts/shard-times.json,
//                                          scripts/lib/shard-plan.mjs): an explicit file list, not a count
//   npm run coverage -- --merge <dir> [--shards n] [--plan n]
//                                          runs no test: merges the hits of every shard (one
//                                          subfolder each) and judges the floor once over all of
//                                          them. It fails when a shard folder is missing or empty
//                                          or when a test file Vitest lists has no hits file; with --plan n it
//                                          also fails when a lua-shard-i folder's hits differ from the files the
//                                          plan for n shards gives shard i (a file missing, run twice, or in the wrong shard).

import fs from "node:fs";
import path from "node:path";
import { root } from "./lib/lua-harness.mjs";
import { anyClientPaths, clientPaths, readToc } from "./lib/toc.mjs";
import { balancedOption, expectedTestFiles, hitsFilesUnder, junitTotals, mergeOption, mergeProblems, planMergeProblems, planOption, shardOption } from "./lib/coverage-shards.mjs";
import { currentPlan } from "./lib/shard-plan.mjs";
import { coverageReport, formatNeverEntered, formatReport, loadHitFiles, loadHits } from "./lib/lua-coverage.mjs";
import { appendJobSummary } from "./lib/lua-summary-reporter.mjs";
import { runInSlot } from "./lib/test-slot.mjs";

const hits = path.join(root, "coverage", "lua-hits");
const balanced = balancedOption(process.argv.slice(2));

// The command line, with `--balanced i/n` turned into the lua project and shard i's planned files (Vitest takes them as filters).
function commandArgs(argv) {
  if (!balanced) return argv;
  const rest = argv.filter((a) => !a.startsWith("--balanced"));
  const files = currentPlan(root, balanced.count)[balanced.index - 1].files;
  return [...rest, "--project", "lua", ...files];
}

const args = commandArgs(process.argv.slice(2));

// Prints a failure and stops.
function stop(message, status = 1) {
  console.error(message);
  process.exit(status);
}

// Starts the hits folder empty; runs once the slot is ours, so a run waiting for one cannot clear a running run's hits.
function clearHits() {
  fs.rmSync(hits, { recursive: true, force: true });
  fs.mkdirSync(hits, { recursive: true });
}

// Runs Vitest (with the arguments given here) in a machine-wide slot, so two runs never overlap, and stops on a failing test.
async function runTests() {
  const status = await runInSlot(args, { ...process.env, LUA_COVERAGE: "1", LUA_COVERAGE_HITS: hits }, clearHits);
  if (status !== 0) process.exit(status);
}

// Whether this run leaves the Retail-only tests out: a local test run with VG_SKIP_RETAIL set. Never a merge, which
// judges a full set of shards (expectedTestFiles lists every test file whatever the variable says).
const withoutRetail = Boolean(process.env.VG_SKIP_RETAIL) && !mergeOption(args);

// The addon's own Lua that at least one client loads (a file the TOC's game-type tags keep to one
// client counts once, covered by that client's cases); the vendored libraries in Libs/ are not counted.
// A run without the Retail-only tests (withoutRetail) counts only the Lua Forever loads.
function countedFiles() {
  const tocLua = withoutRetail ? clientPaths(readToc(root), "forever") : anyClientPaths(readToc(root));
  return tocLua.filter((file) => file.endsWith(".lua") && !file.startsWith("Libs/"));
}

// The floor to hold. Without the Retail-only tests the Retail branches of shared files go unrun, so that run has
// its own floor (withoutRetail, which only goes up too); every other run, a merge included, holds every line to "lines".
function floorToHold() {
  const floors = JSON.parse(fs.readFileSync(path.join(root, "scripts/lua-coverage-floor.json"), "utf8"));
  return withoutRetail ? floors.withoutRetail : floors.lines;
}

// Reports the loaded hits against the floor and fails below it; `heading` names what was judged.
function judge(heading) {
  const report = coverageReport(root, countedFiles());
  const floor = floorToHold();
  fs.mkdirSync(path.join(root, "coverage"), { recursive: true });
  fs.writeFileSync(path.join(root, "coverage/lua-coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${heading} (floor ${floor}%)\n${formatReport(report)}`);
  appendJobSummary(`${heading} (floor ${floor}%)`, formatReport(report).split("\n"));
  console.log(`\n${formatNeverEntered(report)}`);
  if (report.pct + 1e-9 < floor) stop(`\nLua coverage ${report.pct.toFixed(2)}% is below the floor of ${floor}%.`);
}

// One shard or one project: its tests ran and its hits are on disk (at least one file); the floor waits for the merge.
async function runShard(shard) {
  await runTests();
  if (hitsFilesUnder(hits).length === 0) stop(`Lua coverage hits file is missing: ${hits}`);
  const part = shard ? `Shard ${shard.index}/${shard.count}` : `Projects ${args.filter((a) => a !== "--project").join(", ")}`;
  console.log(`\n${part} passed; its hits are in ${hits}. The coverage floor is judged on the merged hits of every job (--merge).`);
}

// The merge: checks every shard's hits are there, loads them, prints the shards' test totals and judges the floor once.
function runMerge({ dir, shards }) {
  const planned = planOption(args);
  const problems = mergeProblems(dir, shards, expectedTestFiles(root));
  if (planned) problems.push(...planMergeProblems(dir, currentPlan(root, planned)));
  if (problems.length) stop(`Cannot merge the shards' coverage:\n  ${problems.join("\n  ")}`);
  loadHitFiles(hitsFilesUnder(dir));
  const totals = junitTotals(dir);
  const merged = `merged ${hitsFilesUnder(dir).length} hits files from ${shards ?? "all"} shards; ${totals.tests} tests in ${totals.files} JUnit files`;
  console.log(merged);
  judge("Lua line coverage, merged over every shard");
  appendJobSummary("Merged shards", [merged]);
}

// One whole run: every test, then the floor on its hits.
async function runWhole() {
  await runTests();
  try {
    loadHits(hits);
  } catch (err) {
    stop(err.message);
  }
  judge("Lua line coverage");
}

const merge = mergeOption(args);
const shard = merge ? null : balanced ?? shardOption(args);
if (merge) runMerge(merge);
else if (shard || args.includes("--project")) await runShard(shard);
else await runWhole();
