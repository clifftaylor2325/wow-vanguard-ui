#!/usr/bin/env node
// The coverage-tool checks live in scripts/lua-coverage.test.mjs (Vitest).
// This runs that file so `npm run verify` still covers the suite.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const file = path.join(root, "scripts", "lua-coverage.test.mjs");
const run = spawnSync(process.execPath, [bin, "run", file], { cwd: root, stdio: "inherit" });
process.exit(run.status ?? 1);
