---
phase: 03-fast-suite-and-ci-gate
plan: 06
subsystem: testing
tags: [scoped-logins, probe, vitest, coverage, ci]

requires:
  - phase: 03-fast-suite-and-ci-gate
    provides: plan 03-04 (scoped-login mechanism and probe), 03-01 (npm run timing, baseline list), 03-03 (npm run profile)
provides:
  - "scripts/tests/login-scope.json written by the probe over the whole suite: 57 login files, 786 cases, 147 keep full, 639 scoped"
  - "FULL_CASES reviewed and extended to five hand-kept cross-module or coverage cases; two guard tests so a rename cannot move one onto a scoped login"
  - "scripts/tests/README.md sections on scoped logins, npm run timing and npm run profile; README.md command list names both scripts"
affects: [03-07]

plan_head_before: 9c2da95f4040d55d30cea3726b9f3400c5e4d08a
plan_head_after: 0cca8353e68e1d9303f20e75dd8b3c578bd1479b

actuals:
  tokens: 4830
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "scope data is generated (probe --write) and reproducible; the hand-kept lists hold only what the probe cannot know (cross-module checks, coverage)"
    - "a case that passes scoped only because nothing is built (vacuous pass) is found by the coverage floor and put back on the full login through FULL_CASES"

key-files:
  created: []
  modified:
    - scripts/tests/login-scope.json
    - scripts/lib/login-scope.mjs
    - scripts/login-scope.test.mjs
    - scripts/tests/README.md
    - README.md

key-decisions:
  - "setup 'nothing overlaps' cases (two) are hand-kept full: they check every module's mover rects against each other and pass vacuously with a module off"
  - "units 'threat and happiness only where the client and settings allow' is hand-kept full for coverage (UnitExtras.lua:46)"
  - "auras 'raid tile zones never overlap' and bars 'action bar layout' are not hand-kept: one module's own geometry"

requirements-completed: [CI-06]

coverage:
  - id: D1
    description: "scripts/tests/login-scope.json is the probe's whole-suite output (4 workers, no timed-out case), and a second probe run reproduces it byte for byte"
    requirement: CI-06
    verification:
      - kind: other
        ref: "node scripts/login-scope-probe.mjs --write --workers 4 twice; diff coverage/p3-scope-first.json scripts/tests/login-scope.json exits 0 (cases 786, keep-full 147, scoped 639)"
        status: pass
    human_judgment: false
  - id: D2
    description: "With the data applied the whole suite passes, Lua line coverage is 19058/19058 = 100.00%, and all 907 phase-start cases are present and passed with 0 failed and 0 skipped"
    requirement: CI-06
    verification:
      - kind: other
        ref: "VITEST_MAX_WORKERS=4 npm run coverage (Tests 989 passed, total 19058/19058 100.00%)"
        status: pass
      - kind: other
        ref: "npm run timing -- --workers 4 --budget 900 --baseline 03-BASELINE-CASES.txt (baseline: 907 of 907 cases present and passed; tests 989 passed, 0 failed, 0 skipped; wall 101.5 s)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A quick test fails if a hand-kept full-login case's title or file is gone, or if a FULL_CASES entry is not on its file's keep list, or a FULL_FILES path is listed"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "scripts/login-scope.test.mjs (the full-login lists cannot go stale; the full-login lists agree with the committed data)"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/tests/README.md explains scoped logins, VG_LOGIN_SCOPE, the probe, npm run timing and npm run profile; README.md's command list names both scripts"
    requirement: CI-06
    verification:
      - kind: other
        ref: "grep login-scope.json / VG_LOGIN_SCOPE in scripts/tests/README.md; grep npm run timing / npm run profile in README.md; npm run test:quick (231 passed)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 06: Whole-suite scoped logins Summary

**The probe now scopes 639 of the suite's 786 login cases (57 files) to a login without the six heavy modules, 147 cases keep the full login, and the suite still passes 989 of 989 with Lua coverage at 19058/19058 and all 907 phase-start cases present; the whole suite runs in 101.5 s on 4 workers.**

## Performance

- **Duration:** about 13 min (most of it four whole-suite runs and two probe runs)
- **Started:** 2026-10-11T03:17:13Z
- **Completed:** 2026-10-11T03:29:53Z
- **Tasks:** 2 (tracer, auto)
- **Files modified:** 5 (no file created)

## Probe totals and keep-full counts

`node scripts/login-scope-probe.mjs --write --workers 4`: cases 786, keep-full 147, scoped 639; 57 files written. No "timed out" in either probe run's report.

Keep-full per file for the files research listed (research's count in brackets; counts include hand-kept cases): bars 32 (33), units 15 (15), prep 11 (11), setup 8 (7), auctionrestock 6 (6), auras 6 (6), core 5 (5), more 5 (5), clickcast 3 (3), frames 3 (3), visibility 3 (3), masque 2 (2), options 2 (1), clicks 1 (1), raid 1 (1), range 1 (1), report 1 (1), lua-engine 0 (1). `scenarios`, `smoke` and `movers` stay whole-file full. Every difference is within a few cases; setup is higher by its hand-kept cases.

## Final hand-kept lists

`FULL_FILES` unchanged: `smoke`, `scenarios`, `movers`, `login-scope.test.mjs`.

`FULL_CASES` (scripts/lib/login-scope.mjs), five entries:

1. `core.test.mjs` "client capability probe: every flag off, every module still enables" (from 03-04)
2. `setup.test.mjs` "the setup wizard sits above the unlock handles on the last step, so their labels never draw over it" (from 03-04)
3. `setup.test.mjs` "setup layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect" (added)
4. `setup.test.mjs` "setup screens: with each screen preset, nothing overlaps or leaves its own screen, in every layout, solo to 40-man" (added)
5. `units.test.mjs` "threat and happiness only where the client and settings allow" (added; reason: coverage)

## Accomplishments

- Reviewed the cross-module candidates (re-ran the planning grep, read `setup`, `auras`, `bars` and the core probe cases) and kept the two setup overlap checks full: they compare the rects of every module's movers, and an overlap check passes vacuously when a module's frames are missing. `auras` "raid tile zones never overlap" is `RaidFrames.Zones` geometry only and `bars` "action bar layout" is one module's own layout, so neither is hand-kept.
- Two guard tests in `scripts/login-scope.test.mjs` (27 tests now), written first: every `FULL_CASES` title is still in its file's text, and every `FULL_CASES` entry is on its file's keep list in the committed data with no `FULL_FILES` path listed. The data one failed until the probe wrote the file.
- Wrote `scripts/tests/login-scope.json` with the probe and proved it three ways (coverage, baseline, reproducibility).
- Documented scoped logins, `VG_LOGIN_SCOPE`, the probe, `npm run timing` and `npm run profile` in `scripts/tests/README.md`, and added both commands to `README.md`'s command list.

## Task Commits

1. **Task 1 (3-06-01): scope every login file from the probe; 907 of 907 phase-start cases pass** - `1993665` (tracer)
2. **Task 2 (3-06-02): docs: scoped logins, the probe, timing and profiling** - `0cca835`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

_The tracer gate was met by running the whole verify block end to end (guard test, probe, coverage, baseline, second probe and diff, quality) on the data that was committed, before task 2 started; no `blocking-human` gate was set._

## Proof numbers (4 workers)

| Check | Result |
| --- | --- |
| `VITEST_MAX_WORKERS=4 npm run coverage`, first run with the data | Tests 989 passed; total 19057/19058, `Modules/UnitExtras.lua` missing line 46 |
| same, after the `FULL_CASES` entry for line 46 and a rerun of the probe | Tests 989 passed; total 19058/19058 100.00% |
| `npm run timing -- --workers 4 --budget 900 --baseline ...` | `baseline: 907 of 907 cases present and passed`; `tests 989 passed, 0 failed, 0 skipped`; total wall 101.5 s |
| new cases against the baseline | 82, all in quick-project files this phase added (login-scope 27, lua-profile 8, suite-timing 14, workflows 33) |
| second probe run, `diff` against the first | empty, exit 0 |

The 101.5 s is the suite on 4 workers (coverage off). The CI 2-worker figure against D-06's 150 s budget is plan 03-07's to measure.

## Files Created/Modified

- `scripts/tests/login-scope.json` - the probe's whole-suite output (57 files)
- `scripts/lib/login-scope.mjs` - three `FULL_CASES` entries added, each with its reason
- `scripts/login-scope.test.mjs` - two guard tests
- `scripts/tests/README.md` - Scoped logins, and Timing and profiling sections
- `README.md` - two lines in the command list

## Decisions Made

See key-decisions. The floor was not touched, no case was edited, and no addon Lua, `setup.mjs`, `error-guard.mjs` or `lua-harness.mjs` changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] A coverage-only entry in FULL_CASES for UnitExtras.lua:46**
- **Found during:** Task 1 (first coverage run with the data)
- **Issue:** 19057/19058: `Modules/UnitExtras.lua:46` (the `GetPetHappiness` global fallback) was reached only by `units.test.mjs` "threat and happiness only where the client and settings allow". With UnitFrames off that case passes without building anything, so it ran but tested nothing.
- **Fix:** added the case to `FULL_CASES` with the reason `coverage: the only case that runs Modules/UnitExtras.lua:46`, as the plan prescribes; reran the probe and the coverage run.
- **Files modified:** `scripts/lib/login-scope.mjs`, `scripts/tests/login-scope.json`
- **Verification:** coverage 19058/19058 100.00%, 989 passed
- **Committed in:** `1993665`

---

**Total deviations:** 1 auto-fixed (Rule 2). **Impact:** one extra probe and coverage run; no scope change.

## Issues Encountered

- The first probe wrote the data before the coverage gap was known, so the probe ran twice before the reproducibility pair (three probe runs in all). Neither final run had a timed-out case.
- Scoping can hide a vacuous pass: a case whose assertions are all "nothing is built" passes with the module off. The coverage floor caught the one that mattered (UnitExtras line 46). A case that passes vacuously without being the only runner of a line is not detected by anything; 03-07's `VG_LOGIN_SCOPE=full` equivalence run is the other side of that check.

## For the user: CLAUDE.md is now stale

`CLAUDE.md`'s command list does not name `npm run timing` or `npm run profile -- <area>` (the plan forbids editing it). Suggested additions to its Commands block:

```sh
npm run timing                 # suite wall time and per-file table on 2 workers; --budget, --baseline
npm run profile -- <area>      # where a test area's (or "login"'s) Lua goes
node scripts/login-scope-probe.mjs --write   # rederive scripts/tests/login-scope.json after a case needs a heavy module
```

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None. T-03-15: the data is generated and reproducible, a stale key fails loudly, and the guard test fails if a hand-kept case or file disappears. T-03-16: 907 of 907 present and passed with 0 failed and 0 skipped, coverage 19058/19058 with the floor untouched, no case edited. T-03-SC6: no package added. No addon Lua changed.

## Next Phase Readiness

- Plan 03-07 can time the suite on 2 workers against D-06's 150 s budget and run the `VG_LOGIN_SCOPE=full` equivalence check. Nothing needs an in-game check.
- Any later test change that adds a case needing a heavy module fails until the probe is rerun and the JSON committed (documented in `scripts/tests/README.md`).

## Self-Check: PASSED

- `scripts/tests/login-scope.json`, `scripts/lib/login-scope.mjs`, `scripts/login-scope.test.mjs`, `scripts/tests/README.md` and `README.md` exist and are modified; commits `1993665` and `0cca835` are ancestors of HEAD; `git rev-list --count` from the plan base gives 2.
- `npm test -- scripts/login-scope.test.mjs` 27 passed; `npm run quality` OK; `npm run test:quick` 231 passed; coverage, baseline and reproducibility results are above.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
