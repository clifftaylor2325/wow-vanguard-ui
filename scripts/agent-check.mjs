#!/usr/bin/env node
// The edit-time check for agents: Claude Code's PostToolUse hook
// (.claude/settings.json) pipes the tool call's JSON here after every Edit or
// Write. For any Lua, .mjs or .js file the scan reads (everything but Libs/ and
// node_modules/), it runs the code-quality rules on that one file
// (scripts/lib/code-quality.mjs: the 10-line limit, the comment above every
// function, colours only from the theme, ns.Guard on hooks and timers) and, for
// addon Lua under Core/ or Modules/, luacheck when it is installed, and
// prints what it found on stderr with exit code 2, which Claude Code hands
// back to the agent as feedback. Anything else exits 0 and says nothing, so
// the hook never slows an edit that the rules don't cover. It can also be
// run by hand: node scripts/agent-check.mjs <file>.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkSource } from "./lib/code-quality.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The file the hook's stdin JSON names (tool_input.file_path), or the first argument.
function targetFile() {
  if (process.argv[2]) return process.argv[2];
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    return input.tool_input?.file_path ?? input.tool_response?.filePath ?? null;
  } catch {
    return null;
  }
}

// The repo-relative path of a file the scan covers (any Lua, .mjs or .js file outside Libs/ and node_modules/,
// the files sourceFiles reads in scripts/lib/code-quality.mjs), else null.
export function coveredPath(file) {
  if (!file) return null;
  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
  if (rel.startsWith("..") || rel.startsWith("Libs/") || rel.startsWith("node_modules/")) return null;
  return /\.(lua|mjs|js)$/.test(rel) ? rel : null;
}

// luacheck's findings for one addon Lua file, as lines; none for any other file (.luacheckrc leaves scripts/ out),
// when luacheck is not installed, or when the file passes.
function luacheckLines(rel) {
  if (!/^(Core|Modules)\/.+\.lua$/.test(rel)) return [];
  const run = spawnSync("luacheck", ["--no-color", "--formatter", "plain", rel], { cwd: root, encoding: "utf8" });
  if (run.error || run.status === 0) return [];
  return run.stdout.split("\n").filter((l) => l.trim());
}

// Every finding for one covered file: the code-quality rules, then luacheck.
export function findings(rel) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const quality = checkSource(rel, src).map((p) => `${rel}:${p.line}: ${p.message}`);
  return [...quality, ...luacheckLines(rel)];
}

// Hook entry: report the findings for the edited file on stderr and exit 2 so the agent sees them.
function main() {
  const rel = coveredPath(targetFile());
  if (!rel || !fs.existsSync(path.join(root, rel))) return;
  const found = findings(rel);
  if (!found.length) return;
  process.stderr.write(`agent-check: ${found.length} problem(s) in ${rel} (CLAUDE.md hard rules)\n${found.join("\n")}\n`);
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
