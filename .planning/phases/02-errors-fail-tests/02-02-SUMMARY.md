---
phase: 02-errors-fail-tests
plan: 02
subsystem: testing
tags: [vitest, shuffle, ci, github-actions, link-wow]
requires: []
provides:
  - "scripts/link-wow.test.mjs passes in any order"
  - "VG_SHUFFLE_SEED turns on a seeded Vitest shuffle (files and tests)"
  - "weekly (schedule-only) shuffled full-suite run that prints its seed and replay lines"
affects: [phase-03-ci-speed]
tech-stack:
  added: []
  patterns: ["workflow files read as text in a quick-project test (no YAML parser)"]
key-files:
  created: [scripts/workflows.test.mjs]
  modified: [scripts/link-wow.test.mjs, vitest.config.mjs, .github/workflows/lua-suite.yml, .github/workflows/full-suite.yml]
key-decisions:
  - "Each link:wow case builds its own folder via fresh() under one temp root; fixed at the cause, no re-run"
  - "Shuffle is env-driven (VG_SHUFFLE_SEED), root-level so both Vitest projects inherit it"
  - "Reused the Sunday full-suite run; shuffle input defaults off so PR, hand-started and release runs are unshuffled"
requirements-completed: [CI-03]
status: complete
plan_head_before: f5e3c47aa4f18eb18322128cafa83a984b6b0972
plan_head_after: 2bc79867e53bd86f6dba46859de5c48639277b1c
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
---

# Phase 2 Plan 02: Shuffle config, link-wow order fix, weekly shuffled run Summary

The suite is order-independent where it was not (`link-wow.test.mjs`), Vitest shuffles from `VG_SHUFFLE_SEED`, and the Sunday full-suite run is the only run that sets it, printing the seed and bash/PowerShell replay lines to the job summary.

## Tasks

| Task | Commit | What |
| ---- | ------ | ---- |
| 2-02-01 | c957db0 | `scripts/link-wow.test.mjs`: `fresh()` builds a TEST-ONLY home, game folder, io (fixed clock) and slot per case; `withAddons`, `withConfig`, `withLink` set starting state; `cli()` takes the case's home. 12 titles kept; `expect(` count 37 to 38 (`withLink` asserts its link). |
| 2-02-02 | 4b4beb5 | `vitest.config.mjs`: `VG_SHUFFLE_SEED` (positive safe integer, else 0) adds `sequence: { shuffle: { files, tests }, seed }` to root `test`; header documents replay (bash and PowerShell) and that no re-run option exists. |
| 2-02-03 | 2bc7986 | `lua-suite.yml`: boolean `shuffle` input (default false) and a step "Pick and print the shuffle seed" before `npm run coverage` (`if: inputs.shuffle`, seed from `date +%s`, to `$GITHUB_ENV` and, via `tee -a`, `$GITHUB_STEP_SUMMARY`). `full-suite.yml`: `shuffle: ${{ github.event_name == 'schedule' }}`. New `scripts/workflows.test.mjs` (7 cases). `release.yml` untouched. |

## Verification (local)

- `npm test -- scripts/link-wow.test.mjs`: 12 passed in written order.
- Same file with `--sequence.shuffle --sequence.seed=` 1, 2, 3 and 20261010: 12 passed each (seed line printed each time). Re-run once more under 20261010 after the final comment fix: 12 passed.
- `VG_SHUFFLE_SEED=4242 npm run test:quick`: exit 0, printed `Running tests with seed "4242"` (8 files, 122 tests).
- `VG_SHUFFLE_SEED=1`, `2`, `3` with `npm run test:quick`: exit 0 each (8 files, 122 tests), seed line printed.
- `npm run test:quick` unshuffled: exit 0, no `Running tests with seed` line (0 matches in the log).
- `vitest.config.mjs` contains `VG_SHUFFLE_SEED`; 0 matches for retry/retries.
- `npm test -- scripts/workflows.test.mjs`: 7 passed. Final `npm run test:quick`: 9 files, 129 tests passed (includes the `.pkgmeta` test, so the new test file does not break packaging).
- `npm run quality`: OK after each task. `git diff --stat` for `release.yml` against the plan base: empty.
- The seed `printf` line was run locally in bash and prints both replay forms with `$env:` literal.

Not run: the full Lua harness suite shuffled (not required by the plan; D-05 asks for no local shuffled runs to close the phase), `npm run coverage`, and any hosted workflow.

## Deviations from Plan

None in substance. Two small notes:

- **Verify commands split:** verify one-liners were run as separate commands (a loop over seeds in one Bash call, logs under `coverage/`); each condition is the same as in the plan.
- **Plan commit ledger:** the harness refused the compound `git rev-parse --git-dir` form for the per-plan ledger file, so `plan_head_before` is the known fast-forward tip `f5e3c47` and `commits: 3` was measured with `git rev-list --count f5e3c47..HEAD` before this SUMMARY commit.
- **Fix during task 1:** `npm run quality` first flagged the `now: () =>` arrow in `fresh()` for no comment above it; a comment line was added. Not a plan deviation.
- `npm ci` was run once in the worktree (vitest was absent); no package was added.

## Known Stubs

None.

## Threat Flags

None. T-02-06 and T-02-07 are covered by `scripts/workflows.test.mjs` (no `${{ inputs.` in any `run:` text; `permissions: contents: read` kept). T-02-08: every link:wow case works under `fs.mkdtempSync` in `os.tmpdir()` with HOME/USERPROFILE pointed there; `afterAll` removes the root.

## Still open (D-05)

The first green hosted shuffled run. The hosted runner is blocked by billing, so the Sunday run has never executed with `shuffle` on. Needs a hosted-runner check: the job summary shows the seed line with both replay forms and the run is green. This part of roadmap criterion 3 stays open by the user's decision.

## Self-Check: PASSED

- Files: scripts/link-wow.test.mjs, vitest.config.mjs, scripts/workflows.test.mjs, .github/workflows/lua-suite.yml, .github/workflows/full-suite.yml all present.
- Commits c957db0, 4b4beb5, 2bc7986 are on the branch.
