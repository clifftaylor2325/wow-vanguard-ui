// Vitest setup for the Lua harness tests: when npm run coverage asks for
// line hits, each test file writes its own hits file as it ends, and
// scripts/coverage-lua.mjs merges them. After every test the error guard
// judges what the addons it built caught.

import path from "node:path";
import { afterAll, afterEach, expect } from "vitest";
import { dumpHits } from "../lib/lua-coverage.mjs";
import { check, takeExpected } from "../lib/error-guard.mjs";

// The addons the test built. The array is shared through the global, not
// imported from lua-harness.mjs: this file runs for the quick project too, and
// importing the harness would load it in every quick test file. Whichever
// module loads first creates the array; the harness reuses it.
const createdAddons = (globalThis[Symbol.for("vanguard.addons")] ??= []);

afterAll(() => {
  const dir = process.env.LUA_COVERAGE_HITS;
  if (dir) dumpHits(path.join(dir, `${path.basename(expect.getState().testPath ?? "hits")}-${process.pid}.json`));
});

// After every test: forget the addons it built and the errors it named, so
// no Lua state outlives its test, and fail the test if an addon left an error
// it did not name with expectErrors. Every test in both projects is judged, and
// a test opts out of nothing; it can only name, with expectErrors, each error
// it causes on purpose (D-01). The guard never advances the test clock: work a
// test did not advance stays unrun.
afterEach(() => {
  check(createdAddons.splice(0), takeExpected());
});
