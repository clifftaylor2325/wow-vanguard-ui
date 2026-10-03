// Vitest setup for the Lua harness tests: when npm run coverage asks for
// line hits, each test file writes its own hits file as it ends, and
// scripts/coverage-lua.mjs merges them.

import path from "node:path";
import { afterAll, expect } from "vitest";
import { dumpHits } from "../lib/lua-coverage.mjs";

afterAll(() => {
  const dir = process.env.LUA_COVERAGE_HITS;
  if (dir) dumpHits(path.join(dir, `${path.basename(expect.getState().testPath ?? "hits")}-${process.pid}.json`));
});
