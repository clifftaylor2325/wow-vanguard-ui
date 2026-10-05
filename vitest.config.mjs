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
    // One worker per core, and per 2 GB of memory. Vitest's default keeps a
    // core free for its main process, which has nothing to do while the
    // workers run the Lua harness; on a two-core CI runner that default ran
    // the files one at a time. A worker with coverage on holds about 500 MB
    // and grows with the file, so on the owner's runner (16 logical cores,
    // 16 GB) 16 workers paged and ran about five times slower each.
    // VITEST_MAX_WORKERS overrides it (the runner's .env can set it so a run
    // leaves room for the game).
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || Math.max(1, Math.min(os.availableParallelism(), Math.floor(os.totalmem() / 2 ** 31))),
    // A Lua harness case loads the whole addon, often several times; with
    // coverage counting every line hit that can pass Vitest's 5 s default.
    // In CI (the self-hosted runner sets CI) the limit is 2 minutes: the
    // first run there timed out the first case of several files at 30 s
    // while every worker started at once on a shared desktop.
    testTimeout: process.env.CI ? 120_000 : 30_000,
  },
});
