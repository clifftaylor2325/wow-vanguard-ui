import os from "node:os";
import { configDefaults, defineConfig } from "vitest/config";
import { luaSummaryReporter } from "./scripts/lib/lua-summary-reporter.mjs";

// JS tests (scripts/*.test.mjs) and the Lua harness (scripts/tests/*.test.mjs,
// one file per area, run in parallel), under Vitest. Vitest's own reporters
// stay; the extra one ends a run with the Lua harness's per-area summary
// (scripts/lib/lua-summary-reporter.mjs).
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
    setupFiles: ["scripts/tests/setup.mjs"],
    reporters: [...configDefaults.reporters, luaSummaryReporter()],
    // One worker per core. Vitest's default keeps a core free for its main
    // process, which has nothing to do while the workers run the Lua harness;
    // on a two-core CI runner that default ran the files one at a time.
    // VITEST_MAX_WORKERS caps it (the self-hosted runner's .env can set it so
    // a run leaves cores for the game).
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || os.availableParallelism(),
    // A Lua harness case loads the whole addon, often several times; with
    // coverage counting every line hit that can pass Vitest's 5 s default.
    testTimeout: 30_000,
  },
});
