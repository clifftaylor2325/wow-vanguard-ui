// The "only goes down" baselines against the base branch (scripts/lib/baselines.mjs, scripts/check-baselines.mjs).

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { baselineRises, budgetWritten, checkBaselines } from "./lib/baselines.mjs";
import { root } from "./check-zip.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-baselines-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));
const FILE = "scripts/code-quality-baseline.json";

// Runs git in the scratch repo.
const git = (...args) => execFileSync("git", args, { cwd: scratch, stdio: "pipe" });

// Writes the baseline file in the scratch repo.
const write = (data) => {
  fs.mkdirSync(path.join(scratch, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(scratch, FILE), JSON.stringify(data));
};

it("a number that rose and a list line that is new under an existing key are named; a drop and a new key pass", () => {
  expect(baselineRises("f.json", { a: 2, b: 5, c: ["x", "y"], d: [] }, { a: 3, b: 4, c: ["x", "z"], d: [], e: 99, f: ["new"] })).toEqual(["f.json: a: 2 -> 3", "f.json: c: new line: z"]);
  expect(baselineRises("f.json", { a: 2, c: ["x", "y"] }, { a: 2, c: ["y"] })).toEqual([]);
});

it("against a commit, a raised number fails, an unchanged or lowered one passes, and a file new since the base passes", () => {
  git("init", "-q");
  git("config", "user.name", "t");
  git("config", "user.email", "t@example.com");
  write({ rule: 5 });
  git("add", FILE);
  git("commit", "-q", "-m", "base");
  expect(checkBaselines(scratch, "HEAD", [FILE])).toEqual([]);
  write({ rule: 6, other: 1 });
  expect(checkBaselines(scratch, "HEAD", [FILE])).toEqual([`${FILE}: rule: 5 -> 6`]);
  write({ rule: 4 });
  expect(checkBaselines(scratch, "HEAD", [FILE])).toEqual([]);
  fs.writeFileSync(path.join(scratch, "scripts/new-baseline.json"), JSON.stringify({ rule: 99 }));
  expect(checkBaselines(scratch, "HEAD", ["scripts/new-baseline.json"]), "a file the base does not have yet").toEqual([]);
});

it("a base that cannot be read fails loudly instead of skipping", () => {
  expect(() => checkBaselines(scratch, "no-such-ref", [FILE])).toThrow(/cannot read the base no-such-ref.*never skips/);
  const run = spawnSync(process.execPath, [path.join(root, "scripts/check-baselines.mjs"), "--base", "no-such-ref"], { encoding: "utf8" });
  expect([run.status, run.stderr]).toEqual([1, expect.stringContaining("cannot read the base no-such-ref")]);
});

it("a number main lowered after the branch forked fails against main's tip, and passes against the merge base", () => {
  const dir = fs.mkdtempSync(path.join(scratch, "fork-"));
  // Runs git in the fork repo, its output trimmed.
  const run = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" }).trim();
  // Writes the baseline file in the fork repo.
  const put = (data) => (fs.mkdirSync(path.join(dir, "scripts"), { recursive: true }), fs.writeFileSync(path.join(dir, FILE), JSON.stringify(data)));
  run("init", "-q", "-b", "main");
  run("config", "user.name", "t");
  run("config", "user.email", "t@example.com");
  put({ rule: 12 });
  run("add", FILE);
  run("commit", "-q", "-m", "fork point");
  run("checkout", "-q", "-b", "work");
  run("commit", "-q", "--allow-empty", "-m", "the branch raises nothing");
  run("checkout", "-q", "main");
  put({ rule: 11 });
  run("commit", "-q", "-am", "main lowers the rule");
  run("checkout", "-q", "work");
  expect(checkBaselines(dir, "main", [FILE]), "against the tip the old number reads as a rise").toEqual([`${FILE}: rule: 11 -> 12`]);
  expect(checkBaselines(dir, run("merge-base", "HEAD", "main"), [FILE]), "against the merge base nothing rose").toEqual([]);
});

it("H44-G3-8 a count moved under a new key while it rose is named; a rename that keeps or lowers it, and a new audit key alone, pass", () => {
  expect(baselineRises("f.json", { "long-line": 457, other: 2 }, { "long-lines": 458, other: 2 }), "a renamed number that rose").toEqual(["f.json: long-lines in place of long-line: 457 -> 458"]);
  expect(baselineRises("f.json", { dialogs: ["x"] }, { "dialog boxes": ["x", "y"] }), "a renamed list with a new line").toEqual(["f.json: dialog boxes (dialog boxes in place of dialogs): new line: y"]);
  expect(baselineRises("f.json", { "long-line": 457, dialogs: ["x", "y"] }, { "long-lines": 450, "dialog boxes": ["y"] }), "renamed and lowered").toEqual([]);
  expect(baselineRises("f.json", { "long-line": 457 }, { "long-line": 457, "new-audit": 30, "new-scene": ["z"] }), "a new audit's starting record").toEqual([]);
});

it("a key whose value changed kind fails with a sentence, never a throw", () => {
  expect(baselineRises("f.json", { a: 2, b: ["x"] }, { a: ["x"], b: 3 })).toEqual([
    "f.json: a: was a number, now a list; a baseline keeps its kind, so put the new kind under a new key",
    "f.json: b: was a list, now a number; a baseline keeps its kind, so put the new kind under a new key",
  ]);
});

const BUDGET_FILE = "scripts/tests/options-budget-baseline.json";

it("H45-2-55 a new key in the options budget file is a new overflow and fails; in the other two it is a new audit and passes", () => {
  expect(baselineRises(BUDGET_FILE, { "chat / Chat": 9 }, { "chat / Chat": 9, "bags / New tab": 14 })).toEqual([
    `${BUDGET_FILE}: bags / New tab: a new key (14); every key here is a tab over the budget, so a new one is a new overflow`,
  ]);
  for (const file of ["scripts/code-quality-baseline.json", "scripts/tests/textfit-baseline.json"]) {
    expect(baselineRises(file, { a: 9 }, { a: 9, b: 14 }), file).toEqual([]);
  }
  expect(baselineRises(BUDGET_FILE, { "chat / Chat tabs": 15 }, { "chat / Tabs": 15 }), "a renamed tab at the same number").toEqual([]);
});

it("H45-2-55 the options budget write keeps only the tabs already listed, and refuses a new one by name", () => {
  expect(budgetWritten({ "chat / Chat": 9, "chat / Old": 12 }, { "chat / Chat": 8 })).toEqual({ "chat / Chat": 8 });
  expect(() => budgetWritten({ "chat / Chat": 9 }, { "chat / Chat": 9, "bags / New tab": 14 })).toThrow(/refuses 1 new tab.*bags \/ New tab \(14\)/s);
});
