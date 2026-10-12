#!/usr/bin/env node
// Whether a pull request changes nothing but docs (docs/** and *.md files).
// verify.yml runs this as the Quick checks job's first check, on a checkout
// of the pull request's merge commit fetched two deep, and skips every later
// step when it prints docs_only=true. The job itself always runs and reports,
// so the ruleset's required "Quick checks" is met by a docs-only pull request
// too (a workflow skipped by a path filter would leave it pending).
//
// When the changed files cannot be listed, the answer is false: every check
// runs. Writes docs_only=<true|false> to $GITHUB_OUTPUT when that is set.
//
//   node scripts/docs-only.mjs

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// The paths that count as docs: anything under docs/, and Markdown anywhere.
export const DOCS = [/^docs\//, /\.md$/];

// True when there is at least one changed file and every one is a doc.
export function isDocsOnly(files) {
  return files.length > 0 && files.every((f) => DOCS.some((re) => re.test(f)));
}

// The files the merge commit at HEAD changes against its first parent (the base), or [] if git cannot say.
export function changedFiles(dir) {
  try {
    const out = execFileSync("git", ["diff", "--no-renames", "--name-only", "HEAD^1", "HEAD"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Prints the changed files and the answer, and hands the answer to the workflow.
function main() {
  const files = changedFiles(process.cwd());
  const docs = isDocsOnly(files);
  console.log(`${files.length} changed file(s):\n${files.map((f) => `  ${f}`).join("\n")}`);
  console.log(docs ? "Docs only: the checks below are skipped." : "Not docs only: every check runs.");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docs}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
