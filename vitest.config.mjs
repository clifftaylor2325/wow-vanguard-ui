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
// The lua project does not isolate its files (isolate: false): a worker keeps
// its compiled Lua chunks and its warmed-up JIT from one file to the next, which
// takes about half the time off a run of small files. Nothing there mocks a module or
// changes the environment, and every case builds its own addons.
// Vitest's own reporters stay; the extra one ends a run with the Lua
// harness's per-area summary (scripts/lib/lua-summary-reporter.mjs). On GitHub
// Actions, failures also become annotations on the run, and a JUnit file
// goes beside the coverage report.
const ciReporters = process.env.GITHUB_ACTIONS ? ["github-actions", ["junit", { outputFile: "coverage/junit.xml" }]] : [];

// Shuffled order. The weekly CI run sets VG_SHUFFLE_SEED (D-05) so a hidden
// order dependence shows up; Vitest then prints `Running tests with seed "N"`.
// A failure replays with the same seed: in bash, VG_SHUFFLE_SEED=N npm test;
// in PowerShell, $env:VG_SHUFFLE_SEED=N; npm test (then Remove-Item
// Env:VG_SHUFFLE_SEED, or later runs in that window stay shuffled).
// The seed fixes the order of files and of tests within a file, not how files
// interleave across workers; that does not matter because every file builds
// its own state. Unset (or not a positive whole number), the order is exactly
// as before. There is deliberately no option that runs a failed case again:
// a case that fails in some order is fixed at its cause.
const asked = Number(process.env.VG_SHUFFLE_SEED);
const shuffleSeed = Number.isSafeInteger(asked) && asked > 0 ? asked : 0;
const shuffle = shuffleSeed ? { sequence: { shuffle: { files: true, tests: true }, seed: shuffleSeed } } : {};

export default defineConfig({
  test: {
    environment: "node",
    ...shuffle,
    setupFiles: ["scripts/tests/setup.mjs"],
    reporters: [...configDefaults.reporters, ...ciReporters, luaSummaryReporter()],
    // Each worker (a forked process) gets this much heap. The suite needs far
    // less; a runaway that allocates then dies in a minute or two instead of
    // after 23 of garbage collection (the harness's instruction budget catches
    // a runaway that only loops; this catches one that grows).
    execArgv: ["--max-old-space-size=2048"],
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
    // The edit-time hook's test plants a rule-breaking Lua file under Modules/ for a moment; the scanners in
    // "quick" (code quality, the TOC check, unit events) read that folder, so it runs after them ("hooks", a
    // later group), never beside them.
    projects: [
      { extends: true, test: { name: "quick", include: ["scripts/*.test.mjs", "scripts/tests/smoke.test.mjs"], exclude: [...configDefaults.exclude, "scripts/lua-engine.test.mjs", "scripts/agent-check.test.mjs"] } },
      { extends: true, test: { name: "hooks", include: ["scripts/agent-check.test.mjs"], sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: "lua", isolate: false, include: ["scripts/tests/*.test.mjs", "scripts/lua-engine.test.mjs"], exclude: [...configDefaults.exclude, "scripts/tests/smoke.test.mjs"] } },
    ],
  },
});
