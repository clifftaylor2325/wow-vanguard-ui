#!/usr/bin/env node
// Fails if any function is over the length limit or undocumented
// (rules in scripts/lib/code-quality.mjs).
//
//   node scripts/check-code-quality.mjs [--summary]
//
// --summary prints a per-file count instead of every problem.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkSource } from "./lib/code-quality.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Vendored code is kept as upstream wrote it.
const EXCLUDE = new Set();

// Tracked Lua and JS files this repo owns.
function sourceFiles() {
  const out = execFileSync("git", ["ls-files", "*.lua", "*.mjs", "*.js"], { cwd: root, encoding: "utf8" });
  return out.split("\n").filter((f) => f && !EXCLUDE.has(f));
}

// Prints problems (or a per-file summary) and returns how many there were.
function report(summary) {
  let total = 0;
  for (const file of sourceFiles()) {
    const problems = checkSource(file, fs.readFileSync(path.join(root, file), "utf8"));
    total += problems.length;
    if (summary && problems.length) console.log(`${String(problems.length).padStart(4)}  ${file}`);
    if (!summary) for (const p of problems) console.log(`${file}:${p.line}: ${p.message}`);
  }
  return total;
}

const total = report(process.argv.includes("--summary"));
console.log(total ? `\n${total} code-quality problem(s).` : "OK  every function is documented and at most 10 lines");
process.exit(total ? 1 : 0);
