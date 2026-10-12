// Tests for scripts/docs-only.mjs, verify.yml's docs-only switch (#262): which
// change sets count as docs only, and the diff of a merge commit against its
// base, built in a scratch git repo the way the checkout two deep sees it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { changedFiles, isDocsOnly } from "./docs-only.mjs";
import { root } from "./check-zip.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-docs-only-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// Runs git in a scratch repo, with a fixed identity so commits work anywhere.
function git(dir, ...args) {
  const id = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
  return execFileSync("git", [...id, ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
}

// Writes each { path: text } into a folder, making parent folders.
function writeFiles(dir, files) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
}

// Applies { path: text } (null deletes the file) and commits everything.
function commitChange(dir, change, message) {
  for (const [f, text] of Object.entries(change)) if (text === null) fs.rmSync(path.join(dir, f));
  writeFiles(dir, Object.fromEntries(Object.entries(change).filter(([, t]) => t !== null)));
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

// A scratch repo whose HEAD merges a branch that made `change` into a base that moved on.
function mergedRepo(name, change) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  git(dir, "init", "-q", "-b", "base");
  commitChange(dir, { "Core/A.lua": "-- a\n", "docs/x.md": "x\n", "README.md": "r\n" }, "base");
  git(dir, "checkout", "-q", "-b", "topic");
  commitChange(dir, change, "topic");
  git(dir, "checkout", "-q", "base");
  git(dir, "commit", "-q", "--allow-empty", "-m", "base moves on");
  git(dir, "merge", "-q", "--no-ff", "--no-edit", "topic");
  return dir;
}

it("docs/** and Markdown anywhere count as docs; anything else does not", () => {
  expect(isDocsOnly(["docs/handoff/plan.txt", "README.md", "scripts/tests/README.md"])).toBe(true);
  expect(isDocsOnly(["docs/x.md", "Core/A.lua"])).toBe(false);
  expect(isDocsOnly([".github/workflows/verify.yml"])).toBe(false);
  expect(isDocsOnly(["docsy/x.txt"])).toBe(false);
});

it("no changed files at all is not docs only, so every check runs", () => {
  expect(isDocsOnly([])).toBe(false);
});

it("a merge that changes only docs is docs only", () => {
  const dir = mergedRepo("docs", { "docs/x.md": "changed\n", "CLAUDE.md": "new\n" });
  expect(changedFiles(dir).sort()).toEqual(["CLAUDE.md", "docs/x.md"]);
  expect(isDocsOnly(changedFiles(dir))).toBe(true);
});

it("a merge that also touches code is not docs only", () => {
  const dir = mergedRepo("code", { "docs/x.md": "changed\n", "Core/A.lua": "-- b\n" });
  expect(isDocsOnly(changedFiles(dir))).toBe(false);
});

it("moving a code file into docs/ lists both paths, so it is not docs only", () => {
  const dir = mergedRepo("rename", { "Core/A.lua": null, "docs/A.lua.md": "-- a\n" });
  expect(changedFiles(dir).sort()).toEqual(["Core/A.lua", "docs/A.lua.md"]);
  expect(isDocsOnly(changedFiles(dir))).toBe(false);
});

it("a commit without a parent gives no list, so every check runs", () => {
  const dir = path.join(scratch, "lone");
  fs.mkdirSync(dir);
  git(dir, "init", "-q");
  writeFiles(dir, { "docs/x.md": "x\n" });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "only");
  expect(changedFiles(dir)).toEqual([]);
});

it("the command writes docs_only to GITHUB_OUTPUT", () => {
  const dir = mergedRepo("output", { "docs/y.md": "y\n" });
  const out = path.join(scratch, "github-output");
  const log = execFileSync(process.execPath, [path.join(root, "scripts/docs-only.mjs")], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: out } });
  expect(log).toContain("Docs only: the checks below are skipped.");
  expect(fs.readFileSync(out, "utf8")).toBe("docs_only=true\n");
});
