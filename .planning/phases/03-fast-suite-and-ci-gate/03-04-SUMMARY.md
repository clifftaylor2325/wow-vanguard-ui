---
phase: 03-fast-suite-and-ci-gate
plan: 04
subsystem: testing
tags: [scoped-logins, vitest, savedvariables, probe, ci]

requires:
  - phase: 03-fast-suite-and-ci-gate
    provides: plan 03-01 (caseList and caseKey in scripts/lib/suite-timing.mjs, npm run timing)
provides:
  - "scripts/lib/login-scope.mjs: HEAVY, FULL_FILES, FULL_CASES, SCOPE_FILE, modulesOffLua, scopeFor, buildScope, probeRows, dataText"
  - "loggedIn turns the six heavy modules off for a case in a file listed in scripts/tests/login-scope.json, through VanguardDB.profiles.Default.modules; VG_LOGIN_SCOPE=full and =probe override"
  - "scripts/tests/login-scope.json seeded with auction.test.mjs only; scripts/login-scope-probe.mjs derives the data from a probe run"
affects: [03-05, 03-06, 03-07]

plan_head_before: 7a901ec440296d1ccd20445d933256f97e0070f9
plan_head_after: 0cb3e6f304061a5e13678855930dbabb37b0a3e7

actuals:
  tokens: 6480
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "scope text appended after the caller's saved variables, each table level created only where missing, so any VanguardDB shape merges"
    - "case key is expect.getState().currentTestName, the same ' > ' shape caseKey builds from the JSON report"

key-files:
  created:
    - scripts/lib/login-scope.mjs
    - scripts/login-scope-probe.mjs
    - scripts/login-scope.test.mjs
    - scripts/tests/login-scope.json
  modified:
    - scripts/tests/helpers.mjs

key-decisions:
  - "scripts/login-scope.test.mjs is in FULL_FILES: it calls loggedIn( under each mode and asserts a file not in the data gets the full login, so plan 03-06's --write must not list it"
  - "dataText holds the data file's JSON form in the library, so the probe writes it and a test checks the committed file is already in that form"
  - "The probe refuses --write when a login file ran no case (a file that failed to load would otherwise be scoped unchecked)"

requirements-completed: [CI-06]

coverage:
  - id: D1
    description: "A case in a file listed in login-scope.json logs in with the six heavy modules off through the SavedVariables seam; a file not in the data, a login outside a case and VG_LOGIN_SCOPE=full are the full login; probe scopes every login; another value throws"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "scripts/login-scope.test.mjs (scopeFor rules, modulesOffLua text, loggedIn under unset, probe, full and a bad value)"
        status: pass
      - kind: unit
        ref: "scripts/login-scope.test.mjs (real scoped login: six off, RaidFrames on, Vanguard_Bar1Button1 nil, #ns.errors 0; brand-new-account shape; merge into the caller's saved variables)"
        status: pass
    human_judgment: false
  - id: D2
    description: "auction.test.mjs (74 cases) passes scoped and with VG_LOGIN_SCOPE=full; smoke, errorrail and core pass on the full login; the error guard and setup.mjs are untouched"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run timing -- --workers 1 scripts/tests/auction.test.mjs (tests 74 passed, 0 failed, 0 skipped; total wall 27.9 s before, 15.0 s after)"
        status: pass
      - kind: other
        ref: "VG_LOGIN_SCOPE=full npm test -- scripts/tests/auction.test.mjs (74 passed); npm test -- smoke errorrail core (58 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "node scripts/login-scope-probe.mjs reports per login file how many cases keep the full login, writes nothing without --write, refuses --write with file filters, and the Vitest JSON key for a nested case equals the runtime currentTestName"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "scripts/login-scope.test.mjs (buildScope sorted, de-duplicated, full-file and full-case rules; probeRows; dataText)"
        status: pass
      - kind: other
        ref: "node scripts/login-scope-probe.mjs scripts/tests/auction.test.mjs scripts/tests/bars.test.mjs (keep-full 0 of 74 auction, keep-full 32 of 35 bars; git diff --exit-code login-scope.json exits 0)"
        status: pass
      - kind: other
        ref: "npm run timing -- --cases-out ... scripts/login-scope.test.mjs gives scripts/login-scope.test.mjs|outer > inner"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 04: Scoped logins and the probe Summary

**`loggedIn` now logs in with ActionBars, FrameAuras, PlayerAuras, InstancePrep, UnitFrames and RaidTools off for any case in a file listed in `scripts/tests/login-scope.json`, and `node scripts/login-scope-probe.mjs` derives that data from a suite run with every login scoped; auction (74 cases) runs scoped in 15.0 s instead of 27.9 s.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-11T03:03:21Z
- **Completed:** 2026-10-11T03:10:41Z
- **Tasks:** 2 (tracer, tdd)
- **Files modified:** 5 (4 created, `scripts/tests/helpers.mjs` modified)

## Numbers

Auction area, 1 worker, `npm run timing -- --workers 1 scripts/tests/auction.test.mjs` (indicative: other work may share the machine):

| | total wall | tests |
| --- | --- | --- |
| before (full login) | 27.9 s | 74 passed, 0 failed, 0 skipped |
| after (scoped) | 15.0 s | 74 passed, 0 failed, 0 skipped |

Probe dry run on two files (`node scripts/login-scope-probe.mjs scripts/tests/auction.test.mjs scripts/tests/bars.test.mjs`):

```
keep-full 0 of 74  scripts/tests/auction.test.mjs
keep-full 32 of 35  scripts/tests/bars.test.mjs
cases 109, keep-full 32, scoped 77
```

Research expected 0 for auction and about 33 for bars; the data file was unchanged afterwards.

## Accomplishments

- `scripts/lib/login-scope.mjs`: `HEAVY` (with the measured Enable cost), `FULL_FILES` and `FULL_CASES` (the hand-kept cross-module list, each with a reason), `SCOPE_FILE`, `modulesOffLua`, `scopeFor`, `buildScope`, `probeRows`, `dataText`. Only `node:` imports.
- `scripts/tests/helpers.mjs`: `runningCase()` returns `{ file, key }` from `expect.getState()` (`testPath` made repo-relative, `currentTestName`); `loggedIn` appends `modulesOffLua(scopeFor(...))` after the saved variables it already builds, with the same signature, `extra` eval and `login()`.
- `scripts/tests/login-scope.json`: seeded with `scripts/tests/auction.test.mjs` and an empty keep list.
- `scripts/login-scope-probe.mjs`: spawns Vitest with `VG_LOGIN_SCOPE=probe`, reads the JSON report with `caseList`, prints one `keep-full <n> of <cases>` line per login file and the totals; `--write` (whole suite only) writes the data sorted and reproducibly.
- `scripts/login-scope.test.mjs`: 25 quick tests, including three real logins.

## Task Commits

1. **Task 1 (3-04-01): scoped logins from data; auction runs without the six heavy modules** - `3810026`
2. **Task 2 (3-04-02): probe that derives which cases need a heavy module** - `0cb3e6f`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

_Task 1 is the tracer. Its verify was run end to end (scope tests, auction scoped and with `VG_LOGIN_SCOPE=full`, smoke, errorrail, core, quality, quick) before task 2 started. Task 2 was test-first: the 5 `buildScope` and `probeRows` tests failed with the functions missing, then all passed._

## Files Created/Modified

- `scripts/lib/login-scope.mjs` - scope rules, the Lua that scopes a login, and the probe's pure functions
- `scripts/tests/helpers.mjs` - `runningCase`, scope data read once, `loggedIn` appends the scope text
- `scripts/tests/login-scope.json` - the per-file, per-case scope data (auction only in this plan)
- `scripts/login-scope-probe.mjs` - the probe CLI (no npm script; `package.json` untouched)
- `scripts/login-scope.test.mjs` - quick-project tests

## Decisions Made

See key-decisions. The scope text merges into `VanguardDB` with `x = x or {}` at each level, so it works after `SETUP_DONE`, after a caller's own `VanguardDB.profiles = {...}`, and on a brand-new account where `VanguardDB` does not exist yet. The `Default` profile name is the one research verified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The probe's own test file is a full-login file**
- **Found during:** Task 2
- **Issue:** the probe lists every file whose text contains `loggedIn(`. `scripts/login-scope.test.mjs` does, and one of its tests asserts that a file not in the data gets the full login. Plan 03-06's `--write` would list it, and that test would then fail.
- **Fix:** added `scripts/login-scope.test.mjs` to `FULL_FILES` with a reason comment; a test checks that no listed file is a `FULL_FILES` file and that every `FULL_FILES` path exists.
- **Files modified:** `scripts/lib/login-scope.mjs`
- **Committed in:** `0cb3e6f`

**2. [Rule 2 - Missing critical] `--write` refuses when a login file ran no case**
- **Found during:** Task 2
- **Issue:** a login file that fails to load has no cases in the report, so `buildScope` would list it with an empty keep list and the data would scope it unchecked.
- **Fix:** the probe prints a warning for such a file and `--write` exits 1.
- **Files modified:** `scripts/login-scope-probe.mjs`
- **Committed in:** `0cb3e6f`

**3. [Rule 2 - Missing critical] `dataText` and `probeRows` added to the library**
- **Found during:** Task 2
- **Issue:** the plan names only `buildScope`; the per-file printout counts and the data file's JSON form would otherwise sit untested in the CLI.
- **Fix:** both are pure library functions with tests, one of which proves the committed data file is already in the form `--write` produces.
- **Files modified:** `scripts/lib/login-scope.mjs`, `scripts/login-scope.test.mjs`
- **Committed in:** `0cb3e6f`

---

**Total deviations:** 3 auto-fixed (all Rule 2). **Impact:** none on scope; all inside the plan's files.

## Issues Encountered

- `scripts/tests/README.md` still describes `loggedIn` as a plain finished-setup login. Nothing is scoped beyond auction yet, so the sentence is not wrong today; plan 03-06, which runs the probe on the whole suite and scopes the other files, should add one line there about `VG_LOGIN_SCOPE` and the data file.
- `node_modules/vitest` is 5.0.2 against `package.json`'s 5.0.3 (noted by plan 03-01); unchanged.

## Known Stubs

None.

## Threat Flags

None. T-03-09: the default stays the full login, only data-listed files are scoped, cross-module files and cases are in `FULL_FILES` and `FULL_CASES`, `VG_LOGIN_SCOPE=full` restores the full login everywhere, and an unknown value throws. T-03-10: `createAddon` is still the only factory; `setup.mjs`, `error-guard.mjs` and `lua-harness.mjs` are not edited, no `expectErrors` marker was added, and the real-login tests assert `#ns.errors` is 0 under the global `afterEach`. T-03-SC4: no package added. No addon Lua changed.

## Next Phase Readiness

- Plan 03-06 can run `node scripts/login-scope-probe.mjs --write` on the whole suite, review `FULL_FILES` and `FULL_CASES`, and then compare against `03-BASELINE-CASES.txt` with `npm run timing -- --baseline`. The probe's case keys already match `currentTestName` (checked on a real report).
- Coverage must stay 19058/19058 at the gate: `VG_LOGIN_SCOPE=full` gives the equivalence run (03-07).
- Nothing needs an in-game check.

## Self-Check: PASSED

- `scripts/lib/login-scope.mjs`, `scripts/login-scope-probe.mjs`, `scripts/login-scope.test.mjs`, `scripts/tests/login-scope.json` exist; `scripts/tests/helpers.mjs` modified; commits `3810026` and `0cb3e6f` are ancestors of HEAD; `git rev-list --count` from the plan base gives 2.
- `npm test -- scripts/login-scope.test.mjs` 25 passed; auction 74 passed scoped and with `VG_LOGIN_SCOPE=full`; smoke, errorrail, core 58 passed; `npm run quality` OK; `npm run test:quick` 220 passed.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
