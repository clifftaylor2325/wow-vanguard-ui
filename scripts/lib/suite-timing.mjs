// Pure helpers for npm run timing (scripts/suite-timing.mjs): they read the
// JSON report Vitest writes with --reporter=json and turn it into the printed
// timing report (D-01, D-06) and the case lists the phase gate compares. Only
// node: modules are used, so a quick-project test can run them on canned JSON.

import os from "node:os";

// A path with forward slashes only.
function forward(p) {
  return p.replace(/\\/g, "/");
}

// The path relative to the repo root, with forward slashes (case-blind prefix match for Windows drives).
export function relFile(root, absPath) {
  const prefix = `${forward(root).replace(/\/+$/, "")}/`;
  const abs = forward(absPath);
  return abs.toLowerCase().startsWith(prefix.toLowerCase()) ? abs.slice(prefix.length) : abs;
}

// A case name shaped like Vitest's currentTestName: ancestors and title joined by " > ".
export function caseKey(assertion) {
  return [...(assertion.ancestorTitles ?? []), assertion.title].join(" > ");
}

// One row per test file: { file, tests, passed, seconds }, longest first.
export function fileRows(report, root) {
  return report.testResults
    .map((r) => ({
      file: relFile(root, r.name),
      tests: r.assertionResults.length,
      passed: r.assertionResults.filter((a) => a.status === "passed").length,
      seconds: (r.endTime - r.startTime) / 1000,
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

// Seconds from the earliest file start to the latest file end.
export function wallSpan(report) {
  const starts = report.testResults.map((r) => r.startTime);
  const ends = report.testResults.map((r) => r.endTime);
  return starts.length ? (Math.max(...ends) - Math.min(...starts)) / 1000 : 0;
}

// The largest number of file intervals that overlap at one instant (an end frees its slot before a start at the same time takes one).
export function maxConcurrent(report) {
  const points = report.testResults.flatMap((r) => [[r.startTime, 1], [r.endTime, -1]]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let most = 0;
  for (const [, step] of points) most = Math.max(most, (open += step));
  return most;
}

// Every case in the report as { file, key, status }.
export function caseList(report, root) {
  return report.testResults.flatMap((r) =>
    r.assertionResults.map((a) => ({ file: relFile(root, r.name), key: caseKey(a), status: a.status })),
  );
}

// Compares baseline `file|key` lines (a multiset) with this run's cases.
// Passed cases are matched first, so a duplicate line needs one passing case per copy.
export function baselineDiff(lines, cases) {
  const wanted = new Map();
  for (const line of lines) wanted.set(line, (wanted.get(line) ?? 0) + 1);
  const result = { total: lines.length, passed: 0, missing: [], notPassed: [], added: {} };
  const ordered = [...cases].sort((a, b) => (b.status === "passed") - (a.status === "passed"));
  for (const c of ordered) matchCase(wanted, result, c);
  for (const [line, n] of wanted) result.missing.push(...Array(n).fill(line));
  return result;
}

// Files one case into the diff: matched and passed, matched and not passed, or new.
function matchCase(wanted, result, c) {
  const line = `${c.file}|${c.key}`;
  if (!wanted.get(line)) {
    result.added[c.file] = (result.added[c.file] ?? 0) + 1;
    return;
  }
  wanted.set(line, wanted.get(line) - 1);
  if (c.status === "passed") result.passed += 1;
  else result.notPassed.push(line);
}

// CPU idle and total ticks summed over all cores.
function cpuTotals() {
  const sums = os.cpus().map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
  return { idle: sums.reduce((a, s) => a + s.idle, 0), total: sums.reduce((a, s) => a + s.total, 0) };
}

// Percent of all cores that were busy over a short sample; a promise.
export function machineBusy(sampleMs) {
  const before = cpuTotals();
  return new Promise((resolve) =>
    setTimeout(() => {
      const after = cpuTotals();
      const total = after.total - before.total;
      resolve(total > 0 ? Math.round(100 * (1 - (after.idle - before.idle) / total)) : 0);
    }, sampleMs),
  );
}

// A number of seconds with one decimal.
function one(n) {
  return n.toFixed(1);
}

// The header lines about the machine and the settings, one `label value` each.
function envLines(env) {
  return [
    `date ${env.date}`,
    `cpu ${String(env.cpu).trim()}`,
    `cores ${env.cores}`,
    `node ${env.node}`,
    `vitest ${env.vitest}`,
    `workers ${env.workers}`,
    `busy before run ${env.busy}%`,
  ];
}

// The header lines about the result: times, concurrency and test counts.
function resultLines(wall, report, root) {
  const rows = fileRows(report, root);
  const sum = rows.reduce((total, r) => total + r.seconds, 0);
  const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
  return [
    `total wall ${one(wall)} s`,
    `file span ${one(wallSpan(report))} s`,
    `sum of file times ${one(sum)} s`,
    `max concurrent files ${maxConcurrent(report)}`,
    `tests ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${skipped} skipped`,
  ];
}

// The per-file table: every file, longest first.
function tableLines(rows) {
  // One table row: seconds, tests, file.
  const cell = (r) => `${one(r.seconds).padStart(7)}  ${String(r.tests).padStart(5)}  ${r.file}`;
  return ["", "seconds  tests  file", ...rows.map(cell)];
}

// The printed report from { env, wall, report, root }.
export function formatReport(summary) {
  const { env, wall, report, root } = summary;
  const lines = [...envLines(env), ...resultLines(wall, report, root), ...tableLines(fileRows(report, root))];
  return lines.join("\n");
}
