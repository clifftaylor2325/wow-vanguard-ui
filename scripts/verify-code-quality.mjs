#!/usr/bin/env node
// The checker self-test lives in scripts/code-quality.test.mjs (Vitest).
// This runs that file, then the repo-wide scan, so `npm run verify` still covers both.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const file = path.join(root, "scripts", "code-quality.test.mjs");
const tests = spawnSync(process.execPath, [bin, "run", file], { cwd: root, stdio: "inherit" });
if ((tests.status ?? 1) !== 0) process.exit(tests.status ?? 1);
const scan = path.join(root, "scripts", "check-code-quality.mjs");
const scanned = spawnSync(process.execPath, [scan], { cwd: root, stdio: "inherit" });
process.exit(scanned.status ?? 1);
