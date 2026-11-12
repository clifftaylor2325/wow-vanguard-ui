// The "only goes down" baselines against the base branch (scripts/lib/baselines.mjs, scripts/check-baselines.mjs).

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { baselineRises, checkBaselines } from "./lib/baselines.mjs";
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
