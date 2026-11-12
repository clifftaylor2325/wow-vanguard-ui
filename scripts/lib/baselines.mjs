// The "only goes down" baselines (scripts/code-quality-baseline.json, scripts/tests/textfit-baseline.json,
// scripts/tests/options-budget-baseline.json) checked against the base branch's copy, so a count cannot be raised
// in the commit that needs the room (H44-25-7). scripts/check-baselines.mjs runs it: the pre-push hook against
// the merge base with origin/main (a number main lowered after the fork is not this branch's rise), verify.yml against
// the pull request's first parent. A number that rose, a line that is new under an existing key, or a key whose value
// changed kind (a number and a list) fails; a new key is a new audit's starting record and is allowed, unless the same
// commit drops a key: then the new keys stand in for the dropped ones (a rename), and their numbers may not add up to
// more than the dropped ones' did, nor their lists hold a line the dropped lists lacked.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BASELINE_FILES = ["scripts/code-quality-baseline.json", "scripts/tests/textfit-baseline.json", "scripts/tests/options-budget-baseline.json"];

// A baseline value's kind as a word: "list" or "number" (anything else by its typeof).
const kindOf = (value) => (Array.isArray(value) ? "list" : typeof value);

// The keys of `from` that `other` lacks, with their values: [key, value] pairs.
const keysOnlyIn = (from, other) => Object.entries(from).filter(([key]) => !(key in other));

// The sum of the numbers among [key, value] pairs.
const numberTotal = (entries) => entries.reduce((sum, [, value]) => sum + (typeof value === "number" ? value : 0), 0);

// The list values among [key, value] pairs, as [key, list] pairs.
const listsOf = (entries) => entries.filter(([, value]) => Array.isArray(value));

// What the keys a commit added carry past the keys it dropped (a rename that raised a count): their numbers' total
// above the dropped numbers' total, and each list line no dropped list held. Nothing when no key was dropped or added.
function renameRises(file, base, head) {
  const dropped = keysOnlyIn(base, head);
  const added = keysOnlyIn(head, base);
  if (dropped.length === 0 || added.length === 0) return [];
  const [was, now] = [numberTotal(dropped), numberTotal(added)];
  const names = `${added.map(([key]) => key).join(", ")} in place of ${dropped.map(([key]) => key).join(", ")}`;
  const numbers = now > was ? [`${file}: ${names}: ${was} -> ${now}`] : [];
  const oldLines = listsOf(dropped).flatMap(([, list]) => list);
  const lines = listsOf(added).flatMap(([key, list]) => list.filter((line) => !oldLines.includes(line)).map((line) => `${file}: ${key} (${names}): new line: ${line}`));
  return numbers.concat(lines);
}

// What rose in one baseline file against its base copy (both parsed): one line each for a number that went up and a
// list line the base's list under that key lacks, or a key whose value is now of another kind. A key the base lacks
// is new and passes, unless a key was dropped too (renameRises).
export function baselineRises(file, base, head) {
  return keyRises(file, base, head).concat(renameRises(file, base, head));
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

// Every rise in the baseline files under root against the ref: strings, empty when none went up. Throws when the base cannot be read.
export function checkBaselines(root, ref, files = BASELINE_FILES) {
  return files.flatMap((file) => {
    const base = atRef(root, ref, file);
    const head = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    return base === null ? [] : baselineRises(file, JSON.parse(base), head);
  });
}
