// The "only goes down" baselines (scripts/code-quality-baseline.json, scripts/tests/textfit-baseline.json,
// scripts/tests/options-budget-baseline.json) checked against the base branch's copy, so a count cannot be raised
// in the commit that needs the room (H44-25-7). scripts/check-baselines.mjs runs it: the pre-push hook against
// origin/main, verify.yml against the pull request's first parent. A number that rose or a line that is new under an
// existing key fails; a new key is a new audit's starting record and is allowed.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BASELINE_FILES = ["scripts/code-quality-baseline.json", "scripts/tests/textfit-baseline.json", "scripts/tests/options-budget-baseline.json"];

// What rose in one baseline file against its base copy (both parsed): one line each for a number that went up and a
// list line the base's list under that key lacks. A key the base lacks is new and passes.
export function baselineRises(file, base, head) {
  return Object.entries(head).flatMap(([key, value]) => {
    if (!(key in base)) return [];
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
