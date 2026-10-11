---
phase: 03-fast-suite-and-ci-gate
plan: 01
subsystem: testing
tags: [vitest, json-reporter, suite-timing, baseline, ci]

requires:
  - phase: 02-error-guard-and-shuffle
    provides: the 907-case suite (69 files) that is the phase-start baseline
provides:
  - "npm run timing: runs the suite on a fixed worker cap (default 2) and prints header, wall time, sum of file times, max concurrent files, test counts and a per-file table"
  - "--cases-out and --baseline: record and check the list of passing cases"
  - "03-BASELINE-CASES.txt: the 907 phase-start cases, for the phase gate"
affects: [03-04, 03-06, 03-07]

plan_head_before: 2624b1fd18d392bdaff870ae18036a48b47d8d5a
plan_head_after: e72bdd6c91e05d6cf3eeb3148a558998510884ff

actuals:
  tokens: 28600
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "thin CLI over a pure library, tested on canned Vitest JSON"
    - "case key is ancestorTitles + title joined by ' > '"

key-files:
  created:
    - scripts/lib/suite-timing.mjs
    - scripts/suite-timing.mjs
    - scripts/suite-timing.test.mjs
    - .planning/phases/03-fast-suite-and-ci-gate/03-BASELINE-CASES.txt
  modified:
    - package.json

key-decisions:
  - "The CLI also fails when Vitest exits non-zero with no failed test (load error, unhandled error); the plan listed only failed tests, budget and concurrency"
  - "Test files in suite-timing.test.mjs are flat it() calls with the group in the title, because describe() callbacks are not exempt from the 10-line body rule"

patterns-established:
  - "Run Vitest through spawnSync with --reporter=json --outputFile=coverage/suite-timing.json, env passed through"

requirements-completed: [CI-06]

coverage:
  - id: D1
    description: "npm run timing prints the header, totals, max concurrent files, test counts and a per-file table on 2 workers by default, and exits non-zero on failure, over-budget or over-cap"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run timing -- --budget 300 scripts/workflows.test.mjs (exit 0, max concurrent files 1, within budget); --budget 0.001 (exit 1, over budget)"
        status: pass
      - kind: unit
        ref: "scripts/suite-timing.test.mjs#formatReport"
        status: pass
    human_judgment: false
  - id: D2
    description: "--cases-out writes the sorted file|case list and refuses on any non-passing case; --baseline fails on a missing, failed or skipped baseline case and lists new cases by file"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "scripts/suite-timing.test.mjs#baselineDiff"
        status: pass
      - kind: other
        ref: "npm run timing -- --workers 4 --baseline 03-BASELINE-CASES.txt scripts/tests/smoke.test.mjs (baseline: 1 of 907 present and passed, exit 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "03-BASELINE-CASES.txt holds the 907 phase-start cases, captured from a run of 907 passed, 0 failed, 0 skipped before any test edit"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run timing -- --workers 4 --budget 900 --cases-out ... (tests 907 passed, 0 failed, 0 skipped; wrote 907 cases)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 01: Suite timing recorder and phase-start case list Summary

**`npm run timing` runs the whole suite on a capped worker count, prints per-file times and totals from Vitest's JSON report, and records or checks the 907 phase-start case names with `--cases-out` and `--baseline`.**

## Performance

- **Duration:** about 8 min
- **Completed:** 2026-10-11
- **Tasks:** 3 (tracer, auto, tdd)
- **Files modified:** 5 (4 created, `package.json` modified)

## Accomplishments

- `scripts/lib/suite-timing.mjs` holds the pure functions (relFile, caseKey, fileRows, wallSpan, maxConcurrent, caseList, baselineDiff, machineBusy, formatReport); `scripts/suite-timing.mjs` is the CLI; `timing` is in `package.json`.
- The tracer ran end to end on one file (`max concurrent files 1`, `within budget`; a 0.001 s budget gives `over budget` and exit 1).
- `03-BASELINE-CASES.txt` has 907 sorted `file|case` lines, taken at commit `030d2c4` with no test file differing from the phase start.
- `--baseline` prints `baseline: N of 907 cases present and passed`, the missing and not-passed lines and the new cases by file; a one-file run against the list reports 906 missing and exits 1, so the check bites.
- 14 quick-project tests cover the report and baseline code on canned JSON.

## Baseline run header (4 workers; names only, not a timing claim)

```
date 2026-10-11T02:49:44.852Z
cpu 13th Gen Intel(R) Core(TM) i7-13620H
cores 16
node v24.14.0
vitest 5.0.2
workers 4
busy before run 10%
total wall 154.6 s
file span 153.9 s
sum of file times 578.7 s
max concurrent files 4
tests 907 passed, 0 failed, 0 skipped
```

## Task Commits

1. **Task 1 (3-01-01): `npm run timing` runs Vitest on 2 workers and prints the per-file report** - `030d2c4`
2. **Task 2 (3-01-02): Record the 907 phase-start cases** - `6521e6a`
3. **Task 3 (3-01-03): `--baseline` fails a run that lost or failed a baseline case; unit tests** - `e72bdd6`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

_Task 3 was test-first: the 5 `baselineDiff` tests failed (`baselineDiff is not a function`) before the implementation, then all 14 passed. It is one commit, as the plan specifies._

## Files Created/Modified

- `scripts/lib/suite-timing.mjs` - pure report, case-list and baseline functions
- `scripts/suite-timing.mjs` - the `npm run timing` CLI
- `scripts/suite-timing.test.mjs` - quick-project tests on canned JSON
- `.planning/phases/03-fast-suite-and-ci-gate/03-BASELINE-CASES.txt` - the 907 phase-start cases
- `package.json` - `timing` script

## Decisions Made

- The CLI also exits 1 when Vitest exits non-zero without a failed test (a file that fails to load, an unhandled error), so such a run cannot read as green.
- Test groups are written as flat `it("<group>: <case>")` calls: `scripts/lib/code-quality.mjs` exempts only `it()` callbacks from the 10-line rule, not `describe()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Non-zero Vitest status with no failed test now fails the run**
- **Found during:** Task 1
- **Issue:** The plan's exit conditions (failed tests, budget, concurrency) would pass a run where Vitest itself errored (suite load failure, unhandled error) but reported 0 failed tests.
- **Fix:** `runProblems` adds `Vitest exited with status N` in that case.
- **Files modified:** `scripts/suite-timing.mjs`
- **Committed in:** `030d2c4`

**2. [Rule 3 - Blocking] No `describe()` in the test file**
- **Found during:** Task 3
- **Issue:** `describe()` callbacks over 10 lines fail `npm run quality`.
- **Fix:** Flat `it()` calls with the group as a title prefix.
- **Files modified:** `scripts/suite-timing.test.mjs`
- **Committed in:** `e72bdd6`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking). **Impact:** none on scope; both are small and inside the plan's files.

## Issues Encountered

- `node_modules/vitest` reports version 5.0.2 while `package.json` pins 5.0.3 (the plan's facts say 5.0.3). The report header prints what is installed. Not touched (D-05 allows no dependency change); worth a `npm ci` check before the hosted-runner timing in 03-07.
- The plan's `--baseline` flag is mentioned in the Task 1 header comment as not wired; Task 3 replaced that text.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-04 can rely on `caseKey` matching the `a > b > c` shape; it should check this against `expect.getState().currentTestName` as the plan said.
- 03-06 and 03-07 use `npm run timing` (with `VG_LOGIN_SCOPE` passed through) and `--baseline` for the gate.
- No 2-worker timing was recorded here (the baseline run used 4 workers on purpose); the real figure comes from later plans.

## Self-Check: PASSED

- Created files present: `scripts/lib/suite-timing.mjs`, `scripts/suite-timing.mjs`, `scripts/suite-timing.test.mjs`, `03-BASELINE-CASES.txt` (907 lines).
- Commits `030d2c4`, `6521e6a`, `e72bdd6` are ancestors of HEAD; `git rev-list --count` from the plan base gives 3.
- `npm run quality` OK; `npm run test:quick` 163 passed (11 files); `npm test -- scripts/suite-timing.test.mjs` 14 passed.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
