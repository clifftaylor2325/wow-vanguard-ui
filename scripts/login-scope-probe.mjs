#!/usr/bin/env node
// node scripts/login-scope-probe.mjs: finds out which test cases need one of the
// six heavy modules (D-02 lever 2, D-06). It runs the suite (or the files named
// after the options, as Vitest file filters) with VG_LOGIN_SCOPE=probe, which
// turns the six off for every loggedIn login, and reads the JSON report. A case
// that fails with them off needs a heavy module and keeps the full login. It
// prints, for each test file that calls loggedIn, how many of its cases keep the
// full login, then the totals. Failing cases are the expected result, so
// Vitest's exit status is ignored; the exit status is 1 only when no report was
// written, or for a refused --write.
//   --write        write scripts/tests/login-scope.json from this run (sorted, so
//                  the same results always give the same file). A whole-suite run
//                  rewrites the data; a run of named files, or of a report, replaces
//                  only those files' entries and keeps the rest
//   --report <f>   read an existing Vitest JSON report (a probe run made with
//                  VG_LOGIN_SCOPE=probe through the test-slot wrapper) instead of running Vitest
//   --workers <n>  Vitest's worker cap (default: Vitest's own, VITEST_MAX_WORKERS or the core count)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FULL_CASES, FULL_FILES, SCOPE_FILE, buildScope, dataText, mergeScope, probeRows } from "./lib/login-scope.mjs";
import { caseList, relFile } from "./lib/suite-timing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const reportFile = path.join(root, "coverage", "login-probe.json");
const OPTIONS = { write: { type: "boolean", default: false }, workers: { type: "string" }, report: { type: "string" } };

// Prints a message and exits 1.
function fail(message) {
  console.error(message);
  process.exit(1);
}

// The options typed on the command line; positionals are Vitest file filters.
function readOptions(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  const opts = { write: values.write, workers: values.workers, report: values.report, filters: positionals };
  if (opts.workers !== undefined && !(Number.isInteger(Number(opts.workers)) && Number(opts.workers) >= 1)) fail(`--workers must be a whole number of 1 or more, not "${opts.workers}"`);
  return opts;
}

// Runs Vitest with every login scoped and the JSON reporter; its exit status is ignored (failing cases are the result).
function runVitest(opts) {
  fs.rmSync(reportFile, { force: true });
  const cap = opts.workers ? [`--maxWorkers=${opts.workers}`] : [];
  const args = [bin, "run", ...cap, "--reporter=json", `--outputFile=${reportFile}`, ...opts.filters];
  spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, VG_LOGIN_SCOPE: "probe" } });
}

// Reads the JSON report Vitest wrote (or the one named with --report), or exits 1 when there is none.
function loadReport(opts) {
  const file = opts.report ? path.resolve(opts.report) : reportFile;
  if (!fs.existsSync(file)) fail(`Vitest wrote no report (nothing to read at ${file})`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// The test files in the report whose text calls loggedIn(, sorted.
function loginFilesOf(report) {
  const files = report.testResults.map((r) => relFile(root, r.name));
  return files.filter((file) => fs.existsSync(path.join(root, file)) && fs.readFileSync(path.join(root, file), "utf8").includes("loggedIn(")).sort();
}

// Prints one line per login file and the totals; returns the login files that ran no case.
function printRows(rows) {
  rows.forEach((r) => console.log(`keep-full ${r.keep} of ${r.cases}  ${r.file}`));
  const cases = rows.reduce((n, r) => n + r.cases, 0);
  const keep = rows.reduce((n, r) => n + r.keep, 0);
  console.log(`cases ${cases}, keep-full ${keep}, scoped ${cases - keep}`);
  return rows.filter((r) => r.cases === 0).map((r) => r.file);
}

// Writes the data file: its existing note and the scoped map.
function writeData(opts, scoped) {
  const file = path.join(root, SCOPE_FILE);
  const old = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = mergeScope(!opts.filters.length && !opts.report, old.scoped, scoped);
  fs.writeFileSync(file, dataText(old.about, next));
  console.log(`wrote ${Object.keys(next).length} files to ${SCOPE_FILE}`);
}

// The probe's findings from a report: a row per login file, and the scoped map the data file would hold.
function analyse(report) {
  const cases = caseList(report, root);
  const setup = { loginFiles: loginFilesOf(report), fullFiles: FULL_FILES, fullCases: FULL_CASES };
  const scoped = buildScope(cases, setup);
  return { scoped, rows: probeRows(cases, { ...setup, scoped }) };
}

// Prints the findings; with --write, writes the data unless a login file ran no case.
function finish(opts, { scoped, rows }) {
  const empty = printRows(rows);
  empty.forEach((file) => console.error(`WARNING: ${file} ran no case (did it fail to load?)`));
  if (opts.write && empty.length) fail("--write refused: a login file ran no case, so the data would scope it unchecked");
  if (opts.write) writeData(opts, scoped);
}

// Runs the probe, prints the report, and with --write writes the data.
function main() {
  const opts = readOptions(process.argv.slice(2));
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  if (!opts.report) runVitest(opts);
  finish(opts, analyse(loadReport(opts)));
}

main();
