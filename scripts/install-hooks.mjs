#!/usr/bin/env node
// npm's prepare script (it runs after npm install and npm ci): points git at
// the repo's hooks in .githooks (the pre-push hook runs the quick checks).
// Does nothing in CI (CI is set), outside a git checkout (an unpacked copy, a
// release zip), or when git is missing, so an install never fails over it.
//
//   node scripts/install-hooks.mjs

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const HOOKS_PATH = ".githooks";

// Runs git in dir; its output, or null when git fails or is missing.
function git(dir, ...args) {
  try {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Sets core.hooksPath in the checkout at dir; returns what it did, as one line.
export function installHooks(dir, env = process.env) {
  if (env.CI) return "hooks: CI, left alone";
  if (git(dir, "rev-parse", "--is-inside-work-tree") !== "true") return "hooks: not a git checkout, left alone";
  if (git(dir, "config", "core.hooksPath", HOOKS_PATH) === null) return "hooks: git config failed, left alone";
  return `hooks: core.hooksPath set to ${HOOKS_PATH} (pre-push runs the quick checks)`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) console.log(installHooks(process.cwd()));
