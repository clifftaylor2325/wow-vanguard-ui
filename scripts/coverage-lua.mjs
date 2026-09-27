#!/usr/bin/env node
// npm run coverage: the Lua harness with line coverage on. Prints the files
// below 100% with their missing lines, writes coverage/lua-coverage.json,
// and fails if the total is under the floor in scripts/lua-coverage-floor.json.
// The floor only goes up; 100 is the goal.

import fs from "node:fs";
import path from "node:path";
import { root, tocFiles } from "./lib/lua-harness.mjs";
import { coverageReport, formatReport } from "./lib/lua-coverage.mjs";

process.env.LUA_COVERAGE = "1";
await import("./verify-lua.mjs");

// Lua files ForeverUI.toc loads. The harness and the WoW stub are not the addon.
const report = coverageReport(root, tocFiles().filter((file) => file.endsWith(".lua")));
const floor = JSON.parse(fs.readFileSync(path.join(root, "scripts/lua-coverage-floor.json"), "utf8")).lines;
fs.mkdirSync(path.join(root, "coverage"), { recursive: true });
fs.writeFileSync(path.join(root, "coverage/lua-coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nLua line coverage (floor ${floor}%)\n${formatReport(report)}`);
if (report.pct + 1e-9 < floor) {
  console.error(`\nLua coverage ${report.pct.toFixed(2)}% is below the floor of ${floor}%.`);
  process.exit(1);
}
