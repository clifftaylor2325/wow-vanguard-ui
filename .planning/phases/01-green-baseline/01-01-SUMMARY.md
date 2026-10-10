---
phase: 01-green-baseline
plan: 01
subsystem: testing
tags: [baseline, vitest, lua-harness, coverage, issue-169]
requires: []
provides:
  - Clean-checkout baseline evidence for origin/main (b032e6f)
  - Git evidence that the seven #169 cases are resolved without an addon or stub change
affects: [01-02]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/01-green-baseline/01-01-SUMMARY.md
  modified: []
decisions:
  - "D-06 held: no tracked file outside .planning/ changed; the only tracked output is this SUMMARY"
requirements-completed: [CI-01, CI-02]
status: complete
duration: 25min
completed: 2026-10-09
actuals:
  tokens: 4000
  tasks: 3
  commits: 1
plan_head_before: 83f2364c1092a5241a04e20bc9f5e8582470bb29
---

# Phase 1 Plan 01: Re-baseline the full suite and coverage on clean main Summary

**origin/main at b032e6f, installed with `npm ci` in a detached scratch worktree, passes the five #169 files (120/120), `npm run verify` (873/873, 66 files, quality scan OK) and `npm run coverage` at 19050/19050 lines, 100.00%, with every run green on the first attempt and no tracked file changed outside `.planning/`.**

## Evidence

| Item | Result |
|------|--------|
| Baseline SHA | `b032e6f` (full `b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b`). Local `main` is also `b032e6f`; it matched origin/main after `git fetch origin main`. |
| Scratch checkout | `../vg-p1-baseline`, detached at `b032e6f`, own `npm ci` install (no link or copy of another `node_modules`) |
| Node / npm / Vitest | v24.14.0 / 11.9.0 / 5.0.3 (equals the lock file's pinned version) |
| Cores | 16 (`os.availableParallelism()`) |
| `npm ci` | added 42 packages; 2 moderate-severity audit notices, nothing changed (not in scope) |

### Baseline runs

| Step | Command | Log | Vitest `Test Files` | Vitest `Tests` | Duration | Exit |
|------|---------|-----|---------------------|----------------|----------|------|
| Targeted | `npm test -- scripts/tests/auction.test.mjs scripts/tests/auctionledger.test.mjs scripts/tests/chatwatch.test.mjs scripts/tests/plates.test.mjs scripts/tests/raid.test.mjs` | `targeted-run1.log` | `Test Files  5 passed (5)` | `Tests  120 passed (120)` | 103.33s | 0 |
| Verify | `npm run verify` | `verify-run1.log` | `Test Files  66 passed (66)` | `Tests  873 passed (873)` | 339.06s | 0 |
| Coverage | `npm run coverage` | `coverage-run1.log` | `Test Files  66 passed (66)` | `Tests  873 passed (873)` | 292.58s | 0 |

- Targeted run, Lua harness areas: `auction 74/74`, `auctionledger 10/10`, `chatwatch 11/11`, `plates 13/13`, `raid 12/12`. The targeted log records `head=b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b` and `vitest=5.0.3`.
- Verify run: 58 Lua harness areas, every one n/n passed. Quality scan line: `OK  every function is documented and at most 10 lines; colors and text sizes come from the theme`.
- Coverage run: the Lua harness areas are again all n/n; the report is the header `Lua line coverage (floor 100%)` followed directly by the total line, with no per-file row between them and no below-the-floor message:

```
Lua line coverage (floor 100%)
  total                        19050/19050 100.00%
```

- Floor: `scripts/lua-coverage-floor.json` reads `lines` 100 and `git diff --quiet origin/main HEAD -- scripts/lua-coverage-floor.json` exits 0 (unchanged).
- The verify run (newest) is older than the coverage run, and both are green with no red run between them, so the baseline rests on two consecutive clean full runs.

### Git evidence (all read-only)

| Command | Result |
|---------|--------|
| `git cat-file -e 'eff5158^{commit}'` and `git cat-file -e '0cf01dc^{commit}'` | both commits exist, so the empty diff below is meaningful |
| `git diff --stat eff5158 0cf01dc -- 'Modules/Auction*'` | empty: the tests-only commit made the four auction cases pass without touching auction code, so cases 1-4 are not code bugs (D-02, D-03). The same pathspec between `eff5158` and `origin/main` lists 10 changed auction files, so the pathspec matches real files |
| `git diff --quiet eff5158 origin/main -- scripts/lib/wow-layout.lua` | exit 0: the stricter laid-out rule is unchanged since the issue's baseline (D-01) |
| `git merge-base --is-ancestor 84a7b0a origin/main` | exit 0: the fixing commit is on main |
| `git merge-base --is-ancestor e0f34d8 origin/main` | exit 0: the fixing commit is on main |
| `git merge-base --is-ancestor 0cf01dc origin/main` | exit 1: the stub-loosening commit is not on main (D-01) |
| `git diff --stat origin/main...HEAD -- Modules Core scripts` | empty: this branch changes no addon, stub or test file (D-06) |

Note: the planning branch also carries one committed `.pkgmeta` line (`b8786c5` adds `.planning` to the package `ignore` list so planning files never ship in the zip). It is packaging metadata, not addon, stub or test code, so it is outside D-06's scope. It is left as it is.

### Files left in the scratch worktree

None. `../vg-p1-baseline` was removed with `git worktree remove` (no `--force`, which would have been refused had the runs left untracked or modified files) and `git worktree prune`. The folder no longer exists. The main checkout's own `node_modules/vitest/package.json` is intact.

## Run ledger

Every run log under `coverage/p1-baseline/` (gitignored scratch folder). No run was red, so there are no decision files.

| Log | Last line | Role |
|-----|-----------|------|
| `targeted-run1.log` | `exit=0` | baseline for the targeted step |
| `verify-run1.log` | `exit=0` | baseline for the verify step |
| `coverage-run1.log` | `exit=0` | baseline for the coverage step |

No flaky case was observed or reported by the user, so nothing is listed for Phase 2 (CI-03).

## Task Commits

None for tasks 1-3: per D-06 this plan changes no tracked file outside `.planning/`, so it has no task commits. Its only tracked output is this SUMMARY, committed on its own.

## Deviations from Plan

**1. [Rule 3 - Blocking] Executor worktree started at `b032e6f`, not at the planning commit**
- **Found during:** startup
- **Issue:** the harness created the worktree at `b032e6f` (main), so the `.planning/` files the plan reads were missing.
- **Fix:** fast-forwarded the executor's own branch to the planning commit `83f2364` (`git merge --ff-only`, no history rewrite). The branch's `Modules Core scripts` diff against origin/main stays empty.

**2. [Rule 3 - Blocking] Commands adapted to the isolation guard**
- **Issue:** the sandbox refuses git calls that use `-C <variable>`, `cd` out of the worktree, or compound shells. The plan's `$R`/`$W`/`$D` one-liners were therefore run as separate plain commands using relative paths (`../vg-p1-baseline`, `coverage/p1-baseline`), and the worktree's `HEAD` was read from its git-dir `HEAD` file. The targeted log's `vitest=5.0.3` line was written literally after reading `node_modules/vitest/package.json` of the scratch install.
- **Impact:** none on the evidence; the commands, logs and results are the plan's. The plan's automated verify one-liners were not run verbatim for the same reason; each of their conditions was checked individually above.

Otherwise the plan was executed as written.

## Notes

- (a) This plan changed no tracked file outside `.planning/`, so it has no task commits (D-06). Its only tracked output is this SUMMARY.
- (b) A green suite is not yet an error-free suite. Only `smoke.test.mjs` asserts an empty `ns.errors` today. Phase 2's guard (CI-04) may turn some cases red, and that would not be a Phase 1 regression (RESEARCH Pitfall 5).
- Nothing here observed in-game behaviour; this is headless evidence only.

## Known Stubs

None.

## Threat Flags

None. No file created or modified introduces new security-relevant surface.

## Self-Check: PASSED

- Run logs exist: `targeted-run1.log`, `verify-run1.log`, `coverage-run1.log` (each ends `exit=0`).
- `eff5158`, `0cf01dc`, `84a7b0a`, `e0f34d8` resolve in the repository.
