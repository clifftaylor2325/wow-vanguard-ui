---
phase: 03-fast-suite-and-ci-gate
plan: 03
subsystem: testing
tags: [profiler, fengari, lua-hooks, vitest, ci]

requires:
  - phase: 03-fast-suite-and-ci-gate
    provides: plan 03-01 (npm run timing, the per-file time table the profiler explains)
provides:
  - "npm run profile -- login: warm logins in one process, four tables (self by file, inclusive by file, inclusive by function, self by line), coverage/profile/login.json"
  - "npm run profile -- <area>: one test file under Vitest with sampling on, parts merged, same report, coverage/profile/<area>.json; unknown area lists the valid ones and exits 1"
  - "a sampler on the harness's existing count hook, active only when LUA_PROFILE is set"
affects: [03-04, 03-05, 03-06, 03-07]

plan_head_before: f98b51f44b23f7c057634ca6e255635cf5bc4b7f
plan_head_after: 1f27dc4a4932e9b65fe52e458f2cca57176694ba

actuals:
  tokens: 5650
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "sampling by Lua stack walk (lua_getstack, lua_getinfo Sln) in the count hook every 1000 VM instructions"
    - "per-test-file dump into a LUA_PROFILE folder, merged by the CLI, as the coverage hits are"

key-files:
  created:
    - scripts/lib/lua-profile.mjs
    - scripts/profile-lua.mjs
    - scripts/lua-profile.test.mjs
  modified:
    - scripts/lib/lua-harness.mjs
    - scripts/tests/setup.mjs
    - package.json

key-decisions:
  - "Output goes to coverage/profile/ (gitignored, never packaged), so no .gitignore or .pkgmeta change"
  - "A frame counts as Lua only when lua_getinfo reports what = Lua or main; fengari reports its JS-implemented functions as J, not C, so skipping only C left a bogus [JS] file at 97.6% inclusive"
  - "setup.mjs dumps only when LUA_PROFILE is an absolute folder (the login mode sets it to 1 in the CLI process only) and resets the accumulator after the dump, so a worker that runs several files does not count samples twice"

requirements-completed: [CI-06]

coverage:
  - id: D1
    description: "npm run profile -- login prints samples, the header line (one sample = 1000 Lua VM instructions; JS-function time not counted) and the four tables, and writes coverage/profile/login.json"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run profile -- login (4650 samples over 3 warm logins; wow-stub.lua 60.8% self; Modules/ActionBars.lua 37.4% inclusive)"
        status: pass
      - kind: unit
        ref: "scripts/lua-profile.test.mjs (report has the header and four sections in order)"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run profile -- <area> runs the area green under Vitest, prints the report, writes coverage/profile/<area>.json; an unknown or malformed area lists the valid ones and exits 1"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run profile -- auction (74 passed, 185757 samples, exit 0); npm run profile -- no-such-area (exit 1, list printed)"
        status: pass
      - kind: unit
        ref: "scripts/lua-profile.test.mjs (unknown and ../package areas exit 1 listing auction and login)"
        status: pass
    human_judgment: false
  - id: D3
    description: "With LUA_PROFILE unset nothing is sampled or written; the afterEach error guard is unchanged"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "scripts/lua-profile.test.mjs (login with LUA_PROFILE unset samples nothing; dumpProfile writes nothing without samples)"
        status: pass
      - kind: other
        ref: "npm test -- scripts/tests/smoke.test.mjs scripts/tests/errorrail.test.mjs (8 passed, in both tasks)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The sampler ranks a hot function first, self samples add up to the sample count, self-by-file percentages sum to 100, and mergeProfiles adds two dumps"
    requirement: CI-06
    verification:
      - kind: unit
        ref: "scripts/lua-profile.test.mjs (hot/cold ranking, self sum, 100 percent, merge)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 03: Lua sampling profiler Summary

**`npm run profile -- login` and `npm run profile -- <area>` attribute the Lua VM instructions a login or a test file spends by file, function and line, from a sampler on the harness's existing 1000-instruction count hook; it is off unless `LUA_PROFILE` is set.**

## What the profile shows

Login, 3 warm logins, 4650 samples (1 sample = 1000 Lua VM instructions; time inside JS-implemented functions is not counted):

| self by file | samples | pct |
| --- | --- | --- |
| wow-stub.lua | 2829 | 60.8% |
| Core/Theme.lua | 804 | 17.3% |
| wow-layout.lua | 243 | 5.2% |
| Modules/ActionBars.lua | 144 | 3.1% |
| Core/DB.lua | 135 | 2.9% |

Inclusive: `Core/Modules.lua` 93.2% (the Enable loop), `Core/Combat.lua` 70.3% (OutOfCombat wraps module enables), `Core/Theme.lua` 66.6%, `Modules/ActionBars.lua` 37.4%. The hottest function is `wow-stub.lua:119 cacheFor` (22.1% inclusive); the hottest lines are `wow-stub.lua:120` (13.2%), `:151` (6.2%) and `:157` (4.5%). This matches research (61% in the stub). The auction area (74 tests, 185757 samples) has the same shape: stub 60.2% self, Theme 16.9%.

## Accomplishments

- `scripts/lib/lua-profile.mjs`: sampler, accumulator on `globalThis[Symbol.for("vanguard.profile")]`, `topRows`, `formatProfile`, `profileJson`/`writeProfileJson`, `dumpProfile`, `mergeProfiles`.
- `attachHooks` calls the sampler after `countHook` when `LUA_PROFILE` is set; the mask, `COUNT_EVERY` and the line-event branch are unchanged.
- `scripts/profile-lua.mjs`: login mode (one unmeasured warm-up, then `--runs N`, default 3) and area mode (Vitest on one worker, merge, report, exit with Vitest's status).
- `scripts/lua-profile.test.mjs`: 8 quick tests; 3 failed before the area/merge code existed, then all passed.

## Task Commits

1. **Task 1 (3-03-01): Lua sampling profiler, `npm run profile -- login`** - `814bdf1`
2. **Task 2 (3-03-02): `npm run profile -- <area>` through Vitest** - `1f27dc4`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `scripts/lib/lua-profile.mjs` - the sampler, report, dump and merge
- `scripts/profile-lua.mjs` - the CLI
- `scripts/lua-profile.test.mjs` - quick-project tests
- `scripts/lib/lua-harness.mjs` - sampler call in `attachHooks`
- `scripts/tests/setup.mjs` - profile dump in `afterAll` (the `afterEach` guard is untouched)
- `package.json` - `profile` script

## Decisions Made

See key-decisions. The tracer gate was met by re-running the verify end to end (smoke, errorrail, quality, quick), not by a human checkpoint; no `blocking-human` gate was set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JS-implemented functions were counted as a Lua file "[JS]"**
- **Found during:** Task 1
- **Issue:** the plan said to skip frames whose `what` is `C`; fengari reports its host functions as `J`, so an `[JS]` row showed at 97.6% inclusive.
- **Fix:** a frame counts only when `what` is `Lua` or `main`.
- **Files modified:** `scripts/lib/lua-profile.mjs`
- **Committed in:** `814bdf1`

**2. [Rule 2 - Missing critical] Reset after the per-file dump**
- **Found during:** Task 2
- **Issue:** a worker that runs several test files in one process would write the earlier files' samples again in each later dump, and the merge would double count.
- **Fix:** `setup.mjs` calls `resetProfile()` after the dump; and dumps only when `LUA_PROFILE` is an absolute folder.
- **Files modified:** `scripts/tests/setup.mjs`
- **Committed in:** `1f27dc4`

---

**Total deviations:** 2 auto-fixed. **Impact:** none on scope; both inside the plan's files.

## Issues Encountered

- `npm run profile` samples cost about 15% of a run (research figure); wall times in the report are profiled times, not the suite's real times. The 3-warm-login wall time was about 1.0 s.
- The report's "inclusive by file" lists the harness's `eval` chunk and `wow-stub.lua` near the top because every call comes through them; read the `Core/` and `Modules/` rows for the addon's own cost.

## Known Stubs

None.

## Threat Flags

None. The area name is checked against `^[a-z0-9-]+$` and the existing test files, passed to `spawnSync` as an argv element, and output stays under gitignored `coverage/profile/` (T-03-07). The sampler exists only with `LUA_PROFILE` set and a test proves an unset run samples nothing (T-03-08). No package was added (T-03-SC3).

## Next Phase Readiness

- The profile points where speed work pays: `wow-stub.lua` lookup (`cacheFor`, `__index`), `Core/Theme.lua` part building and the ActionBars build. The stub lookup change itself is out of scope for this plan (D-06).
- Nothing needs an in-game check.

## Self-Check: PASSED

- `scripts/lib/lua-profile.mjs`, `scripts/profile-lua.mjs`, `scripts/lua-profile.test.mjs` exist; commits `814bdf1` and `1f27dc4` are ancestors of HEAD; `git rev-list --count` from the plan base gives 2.
- `npm test -- scripts/lua-profile.test.mjs` 8 passed; smoke and errorrail 8 passed; `npm run quality` OK; `npm run test:quick` 195 passed.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
