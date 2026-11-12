// The "only goes down" baselines (scripts/code-quality-baseline.json, scripts/tests/textfit-baseline.json,
// scripts/tests/options-budget-baseline.json) checked against the base branch's copy, so a count cannot be raised
// in the commit that needs the room (H44-25-7). scripts/check-baselines.mjs runs it: the pre-push hook against
// the merge base with origin/main (a number main lowered after the fork is not this branch's rise), verify.yml against
// the pull request's first parent. A number that rose, a line that is new under an existing key, or a key whose value
// changed kind (a number and a list) fails; a new key is a new audit's starting record and is allowed, unless the same
// commit drops a key: then the new keys stand in for the dropped ones (a rename), and their numbers may not add up to
// more than the dropped ones' did, nor any of them, largest first, be above the dropped one in its place, nor their
// lists hold a line the dropped lists lacked. In a file whose keys are all
// items of one audit (ONE_AUDIT_FILES: the options budget, one key per tab over it) a new key is a new overflow, so it
// fails there unless it stands in for a dropped one. The coverage floor (FLOOR_FILES: scripts/lua-coverage-floor.json)
// is the same kind of ratchet the other way round: every number the base holds must still be there, a number, and no
// lower (floorFalls), so a commit that adds untested Lua cannot lower the floor to fit.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BASELINE_FILES = ["scripts/code-quality-baseline.json", "scripts/tests/textfit-baseline.json", "scripts/tests/options-budget-baseline.json"];
// The baseline files whose keys are all items of one audit, where a new key is a rise, not a new audit's record.
export const ONE_AUDIT_FILES = new Set(["scripts/tests/options-budget-baseline.json"]);
// The floors that only go up, judged by floorFalls instead of baselineRises.
export const FLOOR_FILES = ["scripts/lua-coverage-floor.json"];
// Every file checkBaselines reads by default: the baselines and the floors.
export const CHECKED_FILES = [...BASELINE_FILES, ...FLOOR_FILES];

// A baseline value's kind as a word: "list" or "number" (anything else by its typeof).
const kindOf = (value) => (Array.isArray(value) ? "list" : typeof value);

// The keys of `from` that `other` lacks, with their values: [key, value] pairs.
const keysOnlyIn = (from, other) => Object.entries(from).filter(([key]) => !(key in other));

// The sum of the numbers among [key, value] pairs.
const numberTotal = (entries) => entries.reduce((sum, [, value]) => sum + (typeof value === "number" ? value : 0), 0);

// The list values among [key, value] pairs, as [key, list] pairs.
const listsOf = (entries) => entries.filter(([, value]) => Array.isArray(value));

// The numbers among [key, value] pairs, largest first.
const numbersDown = (entries) => entries.map(([, value]) => value).filter((value) => typeof value === "number").sort((a, b) => b - a);

// What the added keys' numbers carry past the dropped keys' (renameRises): their total above the dropped total, else
// the first added number, largest first, above the dropped number in its place. A rename carries one key's count,
// never the sum of several, so { 15, 9 } -> { 14, 10 } rose though the total fell; a split ({ 10 } -> { 5, 5 })
// passes on its total, and a merge ({ 5, 7 } -> { 12 }) fails (H45-2-56).
function renamedNumberRises(file, names, dropped, added) {
  const [was, now] = [numberTotal(dropped), numberTotal(added)];
  if (now > was) return [`${file}: ${names}: ${was} -> ${now}`];
  const [old, fresh] = [numbersDown(dropped), numbersDown(added)];
  const at = fresh.findIndex((n, i) => i < old.length && n > old[i]);
  const hint = "(a rename carries one key's count; if two keys were merged, land the merge at the larger number or lower it first)";
  return at < 0 ? [] : [`${file}: ${names}: ${old[at]} -> ${fresh[at]} ${hint}`];
}

// What the keys a commit added carry past the keys it dropped (a rename that raised a count): renamedNumberRises,
// and each list line no dropped list held. Nothing when no key was dropped or added.
function renameRises(file, base, head) {
  const dropped = keysOnlyIn(base, head);
  const added = keysOnlyIn(head, base);
  if (dropped.length === 0 || added.length === 0) return [];
  const names = `${added.map(([key]) => key).join(", ")} in place of ${dropped.map(([key]) => key).join(", ")}`;
  const numbers = renamedNumberRises(file, names, dropped, added);
  const oldLines = listsOf(dropped).flatMap(([, list]) => list);
  const lines = listsOf(added).flatMap(([key, list]) => list.filter((line) => !oldLines.includes(line)).map((line) => `${file}: ${key} (${names}): new line: ${line}`));
  return numbers.concat(lines);
}

// The keys a one-audit file (ONE_AUDIT_FILES) gained with no key dropped to stand in for: each a new item over the
// audit's limit. Nothing for another file, or when a key was dropped too (renameRises reads that as a rename).
function newKeyRises(file, base, head) {
  if (!ONE_AUDIT_FILES.has(file) || keysOnlyIn(base, head).length > 0) return [];
  return keysOnlyIn(head, base).map(([key, value]) => `${file}: ${key}: a new key (${value}); every key here is a tab over the budget, so a new one is a new overflow`);
}

// What rose in one baseline file against its base copy (both parsed): one line each for a number that went up and a
// list line the base's list under that key lacks, or a key whose value is now of another kind. A key the base lacks
// is new and passes, unless a key was dropped too (renameRises) or the file is one audit's (newKeyRises).
export function baselineRises(file, base, head) {
  return keyRises(file, base, head).concat(newKeyRises(file, base, head), renameRises(file, base, head));
}

// What fell in one floor file against its base copy (both parsed): one line for each number of the base's that is lower
// in the head, gone from it or no longer a number. A key the base lacks is a new floor and passes.
export function floorFalls(file, base, head) {
  return Object.entries(base).flatMap(([key, was]) => {
    const now = head[key];
    if (!(key in head)) return [`${file}: ${key}: ${was} -> gone; the floor only goes up`];
    if (typeof now !== "number") return [`${file}: ${key}: was a number, now a ${kindOf(now)}; the floor only goes up`];
    return now < was ? [`${file}: ${key}: ${was} -> ${now}; the floor only goes up`] : [];
  });
}

// The options budget baseline a VG_BUDGET_WRITE run writes (scripts/tests/options-budget.test.mjs): what each tab
// already listed shows now, a tab that is back within the budget taken out. Throws naming any tab over the budget
// that is not listed yet: a new overflow never goes in that way (rename a renamed tab's key by hand).
export function budgetWritten(known, found) {
  const added = keysOnlyIn(found, known).map(([key, rows]) => `${key} (${rows})`);
  if (added.length) throw new Error(`VG_BUDGET_WRITE refuses ${added.length} new tab(s) over the budget (fold the parts of the feature, or rename a renamed tab's key by hand):\n  ${added.join("\n  ")}`);
  return Object.fromEntries(Object.entries(found).filter(([key]) => key in known));
}

// The rises under the keys the base and the head share (baselineRises).
function keyRises(file, base, head) {
  return Object.entries(head).flatMap(([key, value]) => {
    if (!(key in base)) return [];
    if (kindOf(value) !== kindOf(base[key])) return [`${file}: ${key}: was a ${kindOf(base[key])}, now a ${kindOf(value)}; a baseline keeps its kind, so put the new kind under a new key`];
    if (Array.isArray(value)) return value.filter((line) => !base[key].includes(line)).map((line) => `${file}: ${key}: new line: ${line}`);
    return value > base[key] ? [`${file}: ${key}: ${base[key]} -> ${value}`] : [];
  });
}

// One git command in a repo, its output as text; throws when git fails.
function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Whether a git command succeeds in a repo.
function succeeds(root, ...args) {
  try {
    git(root, ...args);
    return true;
  } catch {
    return false;
  }
}

// The text of a file at a git ref, null when the ref has no such file (a new one), and a throw when the ref itself cannot be read.
function atRef(root, ref, file) {
  if (!succeeds(root, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`)) {
    throw new Error(`cannot read the base ${ref}: fetch it (git fetch origin main) or name another with --base; this check never skips`);
  }
  return succeeds(root, "cat-file", "-e", `${ref}:${file}`) ? git(root, "show", `${ref}:${file}`) : null;
}

// Every rise in the baseline files and every fall in the floor files (FLOOR_FILES) under root against the ref: strings,
// empty when none moved the wrong way. Throws when the base cannot be read.
export function checkBaselines(root, ref, files = CHECKED_FILES) {
  return files.flatMap((file) => {
    const base = atRef(root, ref, file);
    const head = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const judged = FLOOR_FILES.includes(file) ? floorFalls : baselineRises;
    return base === null ? [] : judged(file, JSON.parse(base), head);
  });
}
