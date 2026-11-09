// The in-game results ledger, docs/smoke-results.json: what Cliff has seen pass or fail in the game,
// one entry per SMOKE-TEST.md step and build. The checks here are pure; scripts/smoke-results.test.mjs
// runs them on the committed file, and scripts/release-local.mjs refuses a version whose own steps
// (the ones its changelog section names) have no entry for that build.

import fs from "node:fs";
import path from "node:path";

export const LEDGER = "docs/smoke-results.json";
export const RESULTS = ["pass", "fail", "partial", "skip"];
const FIELDS = ["step", "build", "date", "result", "note"];
const STEP_ID = /^\d+(?:\.\d+)*[a-z]?$/;

// The step ids SMOKE-TEST.md defines ("### 33.390 Title" gives "33.390"), as a Set.
export function smokeSteps(md) {
  return new Set([...md.matchAll(/^### (\d+(?:\.\d+)*[a-z]?) /gm)].map((m) => m[1]));
}

// The ledger's entries from the repo (an array), read fresh.
export function readLedger(root) {
  return JSON.parse(fs.readFileSync(path.join(root, LEDGER), "utf8"));
}

// What is wrong with one entry: strings, empty when it is well formed.
function entryProblems(e, i, steps) {
  const at = `entry ${i + 1}`;
  if (typeof e !== "object" || e === null || Array.isArray(e)) return [`${at} is not an object`];
  const out = Object.keys(e).filter((k) => !FIELDS.includes(k)).map((k) => `${at} has an unknown field ${k}`);
  if (typeof e.step !== "string" || !STEP_ID.test(e.step) || !steps.has(e.step)) out.push(`${at}: step ${e.step} is not a SMOKE-TEST.md step`);
  if (typeof e.build !== "string" || !/^\d+\.\d+\.\d+$/.test(e.build)) out.push(`${at}: build ${e.build} is not a Vanguard version (0.9.3)`);
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || Number.isNaN(Date.parse(e.date))) out.push(`${at}: date ${e.date} is not YYYY-MM-DD`);
  if (!RESULTS.includes(e.result)) out.push(`${at}: result ${e.result} is not one of ${RESULTS.join(", ")}`);
  if (typeof e.note !== "string" || !e.note.trim()) out.push(`${at}: the note is empty (say what was seen)`);
  return out;
}

// Every problem in a ledger: strings, empty when every entry is well formed.
export function ledgerProblems(entries, steps) {
  if (!Array.isArray(entries)) return ["the ledger is not a list"];
  return entries.flatMap((e, i) => entryProblems(e, i, steps));
}

// The parts of a step id as numbers and a letter ("33.390" gives [33, 390]).
const parts = (id) => id.match(/^([\d.]+)/)[1].split(".").map(Number);

// Whether id sits between from and to (same section, its last number in range).
function inRange(id, from, to) {
  const [a, b, c] = [parts(id), parts(from), parts(to)];
  if (a.length !== b.length || a.slice(0, -1).join() !== b.slice(0, -1).join()) return false;
  return a.at(-1) >= b.at(-1) && a.at(-1) <= c.at(-1);
}

// The SMOKE steps a changelog section names: "steps 33.344 to 33.389" and single ids, as a sorted list.
export function namedSteps(section, steps) {
  const found = new Set();
  for (const m of section.matchAll(/\bsteps? (\d+\.\d+[a-z]?) to (\d+\.\d+[a-z]?)(?!\d|\.\d)/g)) {
    for (const id of steps) if (inRange(id, m[1], m[2])) found.add(id);
  }
  for (const m of section.matchAll(/(?<![\d.])(\d+\.\d+(?:\.\d+)?[a-z]?)(?!\d|\.\d)/g)) if (steps.has(m[1])) found.add(m[1]);
  return [...found].sort((x, y) => x.localeCompare(y, "en", { numeric: true }));
}

// The steps a version's changelog section names that have no ledger entry for that build.
export function unrecordedSteps(entries, section, version, steps) {
  const seen = new Set(entries.filter((e) => e.build === version).map((e) => e.step));
  return namedSteps(section, steps).filter((id) => !seen.has(id));
}
