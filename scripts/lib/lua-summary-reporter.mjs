// A Vitest reporter that ends a run with one line per Lua harness area: the
// test files under scripts/tests/ (core, theme, bars...), each counted as
// passed/total, like the summary the harness printed before it moved onto Vitest.

import fs from "node:fs";
import path from "node:path";

export const TESTS_DIR = path.join("scripts", "tests");

// The area a test module belongs to: its file name without .test.mjs, or null for other tests.
export function areaOf(moduleId) {
  const rel = path.relative(process.cwd(), moduleId);
  if (!rel.startsWith(TESTS_DIR) || !rel.endsWith(".test.mjs")) return null;
  return path.basename(rel, ".test.mjs");
}

// Tallies [{ area, state }] into Map(area -> { passed, total }), in first-seen order.
export function tally(cases) {
  const counts = new Map();
  for (const { area, state } of cases) {
    if (!counts.has(area)) counts.set(area, { passed: 0, total: 0 });
    const c = counts.get(area);
    c.total += 1;
    if (state === "passed") c.passed += 1;
  }
  return counts;
}

// One "  name     passed/total passed" line per area that has cases.
export function summaryLines(counts) {
  const width = Math.max(9, ...[...counts.keys()].map((n) => n.length + 1));
  return [...counts].filter(([, c]) => c.total > 0).map(([name, c]) => `  ${name.padEnd(width)}${c.passed}/${c.total} passed`);
}

// The harness's cases from a finished run as [{ area, state }]; [] when none ran.
function harnessCases(testModules) {
  const out = [];
  for (const mod of testModules) {
    const area = areaOf(mod.moduleId);
    if (area) for (const t of mod.children.allTests()) out.push({ area, state: t.result().state });
  }
  return out;
}

// Appends lines to the GitHub Actions job summary (GITHUB_STEP_SUMMARY) as a text block; nothing elsewhere.
export function appendJobSummary(title, lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  fs.appendFileSync(file, [`### ${title}`, "", "```text", ...lines, "```", ""].join("\n"));
}

// A reporter object for vitest.config.mjs that prints the area lines after a run.
export function luaSummaryReporter() {
  return {
    // Keeps Vitest's logger so the lines print with the rest of the run's output.
    onInit(vitest) { this.logger = vitest.logger; },
    // Prints the area lines when the Lua harness was part of the run.
    onTestRunEnd(testModules) {
      const cases = harnessCases(testModules);
      if (cases.length === 0) return;
      const lines = summaryLines(tally(cases));
      this.logger.log(["", "Lua harness by area", ...lines].join("\n"));
      appendJobSummary("Lua harness by area", lines);
    },
  };
}
