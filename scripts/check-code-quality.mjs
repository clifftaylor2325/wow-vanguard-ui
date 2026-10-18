#!/usr/bin/env node
// Fails if any function is over the length limit or undocumented, or addon
// Lua writes color numbers, or hands a hook, click or timer a callback that is
// not an ns.Guard(...) call (rules in scripts/lib/code-quality.mjs).
//
// Then prints the counts of the report-only rules (#263: secure calls outside
// a combat guard, OnUpdate handlers neither throttled nor cleared, script
// handlers that are not ns.Guard calls). Those fail
// the run only when a count rises above its baseline in
// scripts/code-quality-baseline.json, a ratchet like the coverage floor: when
// a count drops, lower the baseline in the same commit.
//
//   node scripts/check-code-quality.mjs [--summary] [--report]
//
// --summary prints a per-file count instead of every problem; --report also
// lists every report-only finding.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { REPORT_RULES, checkSource, compareToBaseline, reportSource, sourceFiles as listSources } from "./lib/code-quality.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "scripts/code-quality-baseline.json";

// Vendored code is kept as upstream wrote it: the shared libraries in Libs/.
const EXCLUDE = new Set();
const VENDORED = "Libs/";

// The Lua and JS files this repo owns, new ones included.
function sourceFiles() {
  return listSources(root).filter((f) => !EXCLUDE.has(f) && !f.startsWith(VENDORED));
}

// The text of each source file, read once: [{ file, src }].
const sources = sourceFiles().map((file) => ({ file, src: fs.readFileSync(path.join(root, file), "utf8") }));

// Prints problems (or a per-file summary) and returns how many there were.
function report(summary) {
  let total = 0;
  for (const { file, src } of sources) {
    const problems = checkSource(file, src);
    total += problems.length;
    if (summary && problems.length) console.log(`${String(problems.length).padStart(4)}  ${file}`);
    if (!summary) for (const p of problems) console.log(`${file}:${p.line}: ${p.message}`);
  }
  return total;
}

// Each report-only rule's count (listing every finding with --report).
function reportOnlyCounts(list) {
  const counts = Object.fromEntries(REPORT_RULES.map((r) => [r, 0]));
  for (const { file, src } of sources) {
    for (const f of reportSource(file, src)) {
      counts[f.rule] += 1;
      if (list) console.log(`${file}:${f.line}: [${f.rule}] ${f.message}`);
    }
  }
  return counts;
}

const NOTES = { above: "  ABOVE the baseline: fix the new finding (--report lists them)", below: "  below the baseline: lower it", at: "" };

// Prints each report-only count against its baseline; returns the rules that rose above it.
function ratchet(counts, baseline) {
  console.log(`\nReport-only rules (fail only above ${BASELINE}):`);
  const rows = compareToBaseline(counts, baseline);
  for (const r of rows) console.log(`  ${r.rule.padEnd(30)} ${String(r.count).padStart(4)}  (baseline ${r.baseline})${NOTES[r.status]}`);
  return rows.filter((r) => r.status === "above");
}

// The files Vanguard.toc loads (Lua only), as repo-relative paths.
function tocLuaFiles() {
  const lines = fs.readFileSync(path.join(root, "Vanguard.toc"), "utf8").split(/\r?\n/);
  return lines.map((l) => l.trim()).filter((l) => l.endsWith(".lua"));
}

// Compiles each TOC file with the real Lua 5.1 compiler when it is installed (the harness parses
// Lua 5.3, so only luac5.1 sees every error); prints what failed, or a note when luac5.1 is missing.
function luacProblems() {
  if (spawnSync("luac5.1", ["-v"]).error) {
    console.log("luac5.1 not installed: only the token rule judges Lua 5.1 syntax (apt-get install lua5.1)");
    return 0;
  }
  const bad = tocLuaFiles().filter((f) => spawnSync("luac5.1", ["-p", f], { cwd: root, stdio: "inherit" }).status !== 0);
  console.log(bad.length ? `\n${bad.length} file(s) do not compile under Lua 5.1.` : "OK  every file the TOC loads compiles under luac5.1");
  return bad.length;
}

const total = report(process.argv.includes("--summary"));
console.log(total ? `\n${total} code-quality problem(s).` : "OK  every function is documented and at most 10 lines; colors and text sizes come from the theme; hooks, clicks and timers run under ns.Guard");
const risen = ratchet(reportOnlyCounts(process.argv.includes("--report")), JSON.parse(fs.readFileSync(path.join(root, BASELINE), "utf8")));
const luac = luacProblems();
process.exit(total || luac || risen.length ? 1 : 0);
