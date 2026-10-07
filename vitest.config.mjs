import os from "node:os";
import { configDefaults, defineConfig } from "vitest/config";
import { luaSummaryReporter } from "./scripts/lib/lua-summary-reporter.mjs";

// Two projects under one config. "quick" is the JS tests (scripts/*.test.mjs,
// none of which loads the addon) and scripts/tests/smoke.test.mjs, one
// addon load: the pull-request gate (npm run test:quick). "lua" is the Lua
// harness (scripts/tests/*.test.mjs, one file per area, run in parallel)
// and the client's own tests (scripts/lua-engine.test.mjs, a dozen loads).
// npm test runs both; npm run coverage runs both with line coverage on,
// which CI does after a merge (.github/workflows/full-suite.yml).
// Vitest's own reporters stay; the extra one ends a run with the Lua
// harness's per-area summary (scripts/lib/lua-summary-reporter.mjs).
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["scripts/tests/setup.mjs"],
    reporters: [...configDefaults.reporters, luaSummaryReporter()],
    // One worker per core. Vitest's default keeps a core free for its main
    // process, which has nothing to do while the workers run the Lua harness;
    // on a two-core CI runner that default ran the files one at a time.
    // VITEST_MAX_WORKERS caps it (set it to leave cores for the game while
    // a run goes on beside it).
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || os.availableParallelism(),
    // A Lua harness case loads the whole addon, often several times; with
    // coverage counting every line hit that can pass Vitest's 5 s default.
    // In CI (Actions sets CI) the limit is 2 minutes, which the full suite
    // needs: its first run timed out the first case of several files at
    // 30 s while every worker started at once on a shared machine.
    testTimeout: process.env.CI ? 120_000 : 30_000,
    projects: [
      { extends: true, test: { name: "quick", include: ["scripts/*.test.mjs", "scripts/tests/smoke.test.mjs"], exclude: [...configDefaults.exclude, "scripts/lua-engine.test.mjs"] } },
      { extends: true, test: { name: "lua", include: ["scripts/tests/*.test.mjs", "scripts/lua-engine.test.mjs"], exclude: [...configDefaults.exclude, "scripts/tests/smoke.test.mjs"] } },
    ],
  },
});
