#!/usr/bin/env node
// npm run coverage: runs every test (the Lua harness under scripts/tests/ and
// the JS tests) under Vitest with line coverage on, merges the hits each
// test file dumped, writes coverage/lua-coverage.json, and fails if the
// total is under the floor in scripts/lua-coverage-floor.json. A failing
// test fails the run before any hits are read, and no hits files at all
// fails too. The floor only goes up; 100 is the goal.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { root, tocFiles } from "./lib/lua-harness.mjs";
import { coverageReport, formatReport, loadHits } from "./lib/lua-coverage.mjs";
import { appendJobSummary } from "./lib/lua-summary-reporter.mjs";

const hits = path.join(root, "coverage", "lua-hits");
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");

fs.rmSync(hits, { recursive: true, force: true });
fs.mkdirSync(hits, { recursive: true });
const run = spawnSync(process.execPath, [bin, "run"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, LUA_COVERAGE: "1", LUA_COVERAGE_HITS: hits },
});
if ((run.status ?? 1) !== 0) process.exit(run.status ?? 1);
try {
  loadHits(hits);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// The addon's own Lua; the vendored libraries in Libs/ are not counted.
const luaFiles = tocFiles().filter((file) => file.endsWith(".lua") && !file.startsWith("Libs/"));
const report = coverageReport(root, luaFiles);
const floor = JSON.parse(fs.readFileSync(path.join(root, "scripts/lua-coverage-floor.json"), "utf8")).lines;
fs.writeFileSync(path.join(root, "coverage/lua-coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nLua line coverage (floor ${floor}%)\n${formatReport(report)}`);
appendJobSummary(`Lua line coverage (floor ${floor}%)`, formatReport(report).split("\n"));
if (report.pct + 1e-9 < floor) {
  console.error(`\nLua coverage ${report.pct.toFixed(2)}% is below the floor of ${floor}%.`);
  process.exit(1);
}
