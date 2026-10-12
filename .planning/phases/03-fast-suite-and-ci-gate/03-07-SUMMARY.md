---
phase: 03-fast-suite-and-ci-gate
plan: 07
subsystem: testing
tags: [phase-gate, timing, coverage, luacheck, ci]

requires:
  - phase: 03-fast-suite-and-ci-gate
    provides: plans 03-01 (npm run timing, baseline list), 03-03 (npm run profile), 03-04 and 03-06 (scoped logins), 03-05 (toolchain pins)
provides:
  - "Phase gate evidence: verify, all-full-login run, 907 of 907 baseline, coverage 19058/19058, luacheck 1.2.0"
  - "The 2-worker proxy time of the whole suite: 155.5 s and 158.7 s plain, 170.7 s with coverage, recorded with the per-file table"
  - "lua-suite.yml's header comment carries the measured proxy time and says the hosted time is not measured"
affects: []

plan_head_before: 3ae6cec3749a24cf9b80b709a7f4ba7149957b14
plan_head_after: c17be4cc04998e4a30db8d37748700f404a7ad90

actuals:
  tokens: 2400
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .github/workflows/lua-suite.yml

key-decisions:
  - "The user accepted the repo-only luacheck run (0 warnings, 114 files) as the lint evidence, because plain npm run lint also lints two user-owned worktrees under .claude/worktrees/"

requirements-completed: []

coverage:
  - id: D1
    description: "npm run verify passes, and the whole suite passes with VG_LOGIN_SCOPE=full, so scoping hides no failure at this commit"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run verify (72 files, 989 passed); VG_LOGIN_SCOPE=full npm test (72 files, 989 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 907 phase-start cases present and passed, 0 failed, 0 skipped; Lua line coverage 19058/19058 100.00%"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run timing -- --workers 4 --budget 900 --baseline 03-BASELINE-CASES.txt (907 of 907; tests 989 passed, 0 failed, 0 skipped); npm run coverage (total 19058/19058 100.00%)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Whole suite under 300 s on 2 workers on a quiet machine, with max concurrent files 2"
    requirement: CI-06
    verification:
      - kind: other
        ref: "npm run timing x2 (155.5 s, 158.7 s) and VITEST_MAX_WORKERS=2 npm run coverage (170.72 s)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-06 internal budget of 150 s or less on the 2-worker proxy"
    requirement: CI-06
    verification:
      - kind: other
        ref: "155.5 s and 158.7 s: missed by 5.5 s and 8.7 s"
        status: fail
    human_judgment: true
    rationale: "The user decides whether any module startup work is approved under D-02; no module change was made"
  - id: D5
    description: "The suite time on the hosted runner (roadmap criterion 2's hosted part, CI-06 as written) and the hosted trigger and toolchain checks"
    requirement: CI-06
    human_judgment: true
    rationale: "Unverified: the hosted runner is blocked by billing (D-01)"

duration: about 40min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 07: Phase gate and 2-worker timing Summary

**The phase's invariants hold (907 of 907 baseline cases pass, coverage 19058/19058, the all-full-login run is green) and the whole suite takes 155.5 s and 158.7 s on the 2-worker local proxy (170.7 s with coverage), under the 300 s criterion but over D-06's internal 150 s budget by 5.5 to 8.7 s; the hosted time is unmeasured.**

## Performance

- **Duration:** about 40 min (most of it gate and timing runs)
- **Tasks:** 2 (tracer, auto)
- **Files modified:** 1 (`.github/workflows/lua-suite.yml`, comment only)

## Task 1 gate lines (dated 2026-10-11, HEAD `3ae6cec`)

Before the gate, `npm ci` from the lock moved `node_modules/vitest` from 5.0.2 to the pinned 5.0.3 (03-01 had flagged the difference). `package.json` and the lockfile did not change.

| Command | Result |
| --- | --- |
| `npm run verify` | exit 0; Test Files 72 passed, Tests 989 passed; quality scan OK |
| `VG_LOGIN_SCOPE=full npm test` | exit 0; Test Files 72 passed, Tests 989 passed; Duration 137.85 s |
| `npm run timing -- --workers 4 --budget 900 --baseline 03-BASELINE-CASES.txt` | exit 0; `baseline: 907 of 907 cases present and passed`; `tests 989 passed, 0 failed, 0 skipped`; total wall 104.4 s, max concurrent files 4 |
| new cases against the baseline | 82, all in this phase's files: login-scope 27, lua-profile 8, suite-timing 14, workflows 33 |
| `npm run coverage` | exit 0; Tests 989 passed; `total 19058/19058 100.00%`; Duration 85.52 s |
| `luacheck --version` | `Luacheck: 1.2.0`, `Lua: PUC-Rio Lua 5.4`, `Argparse: 0.7.1`, `LuaFileSystem: 1.8.0`, `LuaLanes: 3.16.0` (same release as CI's pinned 1.2.0) |
| `npm run lint` (`luacheck .`) | exit 1; `Total: 742 warnings / 0 errors in 366 files` (see Deviations) |
| `luacheck . --no-color --exclude-files "node_modules/" "scripts/" "Libs/" ".claude/"` | exit 0; `Total: 0 warnings / 0 errors in 114 files` (the lint evidence the user accepted) |

## Timing record (Task 2)

Date 2026-10-11. Machine: `cpu 13th Gen Intel(R) Core(TM) i7-13620H`, `cores 16`, `node v24.14.0`, `vitest 5.0.3`, `workers 2`. Quiet-machine check before the runs: 8% processor load, no node, game or Lua process running.

| Run | busy before run | total wall | file span | sum of file times | max concurrent files | tests |
| --- | --- | --- | --- | --- | --- | --- |
| `npm run timing` 1 | 8% | 155.5 s | 149.5 s | 285.6 s | 2 | 989 passed, 0 failed, 0 skipped |
| `npm run timing` 2 | 19% | 158.7 s | 157.9 s | 302.5 s | 2 | 989 passed, 0 failed, 0 skipped |
| `VITEST_MAX_WORKERS=2 npm run coverage` | not printed (22% load read afterwards) | Vitest Duration 170.72 s | n/a | n/a | n/a | 989 passed; `total 19058/19058 100.00%` |

Both timing runs print `within budget: ... <= 300 s`. Run 2 started at a higher load (19%) than run 1 (8%).

### Comparison with research's baseline (same machine, same 2-worker cap)

| | Phase start (research) | Now |
| --- | --- | --- |
| plain, run 1 / run 2 | 241.4 s / 240 s | 155.5 s / 158.7 s |
| with coverage | 250 s | 170.7 s |
| `more.test.mjs` | 73.3 s | 29.2 s |
| `auction.test.mjs` | 36.4 s | 17.3 s |
| `core.test.mjs` | 25.2 s | 13.6 s |

That is about 36% (run 1) and 34% (run 2) off the plain figure, and about 32% off the coverage figure. The suite now has 989 cases (82 added by this phase).

### D-06 internal budget (150 s or less on the proxy): not met

155.5 s and 158.7 s are 5.5 s and 8.7 s over; coverage is 20.7 s over. The criterion (under 300 s) is met. No module change was made (D-02) and the test engine was not switched (D-03). The numbers go to the user, who decides whether any module startup work is approved, one module at a time.

Profile of the slowest file, `npm run profile -- more` (28.2 s run, 132,388 samples of 1,000 Lua instructions): self time by file is `wow-stub.lua` 57.2%, `Core/Theme.lua` 15.0%, `wow-layout.lua` 5.4%, `Core/DB.lua` 4.6%, `eval` 2.1%, `wow-world.lua` 1.7%, `Core/Events.lua` 1.4%, `Modules/InfoStrip.lua` 1.2%. Time in JS-implemented functions is not counted by the profiler.

### Per-file table, run 1 (seconds, tests, file)

```
   29.2    108  scripts/tests/more.test.mjs
   17.3     74  scripts/tests/auction.test.mjs
   15.9     67  scripts/media.test.mjs
   13.6     50  scripts/tests/core.test.mjs
   13.6     13  scripts/tests/plates.test.mjs
   11.2     22  scripts/tests/units.test.mjs
   11.1     35  scripts/tests/bars.test.mjs
    9.9     21  scripts/tests/setup.test.mjs
    9.3      3  scripts/check-zip.test.mjs
    8.6     21  scripts/tests/options.test.mjs
    6.8     17  scripts/tests/profiles.test.mjs
    6.5     23  scripts/tests/auras.test.mjs
    5.9     11  scripts/tests/prep.test.mjs
    5.5     21  scripts/tests/windows-tabs.test.mjs
    5.3     20  scripts/tests/windows-social.test.mjs
    5.1      9  scripts/tests/clickcast.test.mjs
    5.0     19  scripts/tests/windows-system.test.mjs
    4.5     19  scripts/tests/windows-map.test.mjs
    4.4     12  scripts/tests/bagsections.test.mjs
    4.2     16  scripts/tests/windows-town.test.mjs
    3.9     17  scripts/tests/theme.test.mjs
    3.7      7  scripts/tests/scenarios.test.mjs
    3.5      6  scripts/tests/auctionrestock.test.mjs
    3.3     15  scripts/tests/situations.test.mjs
    3.3     11  scripts/tests/chatwatch.test.mjs
    3.3      7  scripts/tests/movers.test.mjs
    3.0     10  scripts/tests/visibility.test.mjs
    2.9      3  scripts/tests/frames.test.mjs
    2.9      9  scripts/tests/auctionapi.test.mjs
    2.9     13  scripts/lua-engine.test.mjs
    2.8      6  scripts/tests/special.test.mjs
    2.8      5  scripts/tests/auctionupgrades.test.mjs
    2.8     10  scripts/tests/auctionledger.test.mjs
    2.7      9  scripts/tests/talents.test.mjs
    2.7     12  scripts/tests/raid.test.mjs
    2.3     10  scripts/tests/casts.test.mjs
    2.2      9  scripts/tests/fights.test.mjs
    2.0      3  scripts/tests/broker.test.mjs
    2.0      5  scripts/tests/auctioncrafting.test.mjs
    2.0      3  scripts/tests/docks.test.mjs
    2.0     27  scripts/login-scope.test.mjs
    1.9      4  scripts/tests/waypoints.test.mjs
    1.9      8  scripts/tests/vendor.test.mjs
    1.8      3  scripts/tests/clicks.test.mjs
    1.8      6  scripts/tests/feedback.test.mjs
    1.7      2  scripts/tests/masque.test.mjs
    1.6      7  scripts/tests/errorrail.test.mjs
    1.6      5  scripts/tests/report.test.mjs
    1.6      4  scripts/tests/windows-menus.test.mjs
    1.6      5  scripts/tests/tooltip.test.mjs
    1.6      5  scripts/tests/unlock.test.mjs
    1.5      1  scripts/tests/smoke.test.mjs
    1.5      5  scripts/tests/inventory.test.mjs
    1.5      1  scripts/tests/range.test.mjs
    1.4      4  scripts/tests/upgrades.test.mjs
    1.3      8  scripts/lua-profile.test.mjs
    1.3      3  scripts/tests/healing.test.mjs
    1.2      4  scripts/tests/fallbacks.test.mjs
    1.2      3  scripts/tests/motion.test.mjs
    1.1      3  scripts/tests/status.test.mjs
    1.1      2  scripts/tests/skins.test.mjs
    1.0      9  scripts/lua-coverage.test.mjs
    0.7      1  scripts/tests/data.test.mjs
    0.7      1  scripts/tests/spellbook.test.mjs
    0.7      1  scripts/tests/windows-pvp.test.mjs
    0.3     12  scripts/link-wow.test.mjs
    0.1     35  scripts/code-quality.test.mjs
    0.1      2  scripts/pkgmeta.test.mjs
    0.1     40  scripts/workflows.test.mjs
    0.0     14  scripts/suite-timing.test.mjs
    0.0     11  scripts/error-guard.test.mjs
    0.0      2  scripts/lua-summary.test.mjs
```

The table has 72 rows, one per test file. Files that read 0.0 to 0.1 s are the quick-project JS tests.

## Accomplishments

- Proved the phase invariants at one commit: all 907 phase-start cases present and passed with 0 failed and 0 skipped, coverage unchanged at 19058/19058, the whole suite green with every login full (`VG_LOGIN_SCOPE=full`), and the new cases confined to the four files this phase added or extended.
- Measured the 2-worker proxy on a quiet machine, twice plain and once with coverage, each with `max concurrent files 2`, and recorded the per-file table.
- Replaced the unmeasured "about five minutes on a hosted runner" sentence in `lua-suite.yml` with the measured proxy times and the statement that the hosted time is not measured. Comment text only; `npm test -- scripts/workflows.test.mjs` passed (40 passed).

## Task Commits

1. **Task 1 (3-07-01): Phase gate** - no commit (the plan changes no files); evidence is above.
2. **Task 2 (3-07-02): record the 2-worker suite time** - `c17be4c`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `.github/workflows/lua-suite.yml` - header comment above `timeout-minutes: 25` now carries the measured proxy time

## Decisions Made

- Plain `npm run lint` is not the lint evidence for this phase; the repo-only luacheck run is (the user chose this, see Deviations). `.luacheckrc` was not touched and the two worktrees were not touched.

## Deviations from Plan

**1. [Gate check failed, user-approved] `npm run lint` exits 1 on this machine**
- **Found during:** Task 1
- **Issue:** `luacheck .` reports `Total: 742 warnings / 0 errors in 366 files`. All 742 warnings are in 14 files under `.claude/worktrees/`, which holds two user-owned git worktrees (`bag-menu-toggle-visibility-92e86e` at `cfa2822` and `social-tab-reskin-2ca9df` at `0da6d64`; both excluded locally through `.git/info/exclude`). Their copies of `Libs/`, `scripts/lib/` and `node_modules/` fall outside `.luacheckrc`'s `exclude_files`. A clean checkout on a hosted runner does not have them.
- **What was done:** the plan's stop rule applied, so the plan returned a checkpoint. The user chose to accept the repo-only luacheck run as the lint evidence: `luacheck . --no-color --exclude-files "node_modules/" "scripts/" "Libs/" ".claude/"` exits 0 with `Total: 0 warnings / 0 errors in 114 files`, and 114 is the count of tracked Lua files outside `scripts/` and `Libs/`.
- **Files modified:** none. `.luacheckrc` and the worktrees were not touched.
- **Left for the user (not done here):** adding `.claude/` to `exclude_files` would make plain `npm run lint` exit 0 on machines that keep worktrees under the repo.

**Total deviations:** 1 (user-approved gate evidence). **Impact:** none on the code or the timing; the CI lint step is unaffected.

## Issues Encountered

- D-06's internal 150 s budget is missed on the proxy (155.5 s and 158.7 s). The plan's own criterion (under 300 s) is met. Reported to the user for a decision; nothing was changed to fit.
- Run 2's `busy before run` was 19%, against 8% for run 1. Run 2 is 3.2 s slower; the machine was otherwise quiet, but this is the only difference noticed between the two.

## Open items

Requirements CI-05 and CI-06 are not ticked. CI-06 reads "under 5 minutes on the hosted runner, measured and recorded" and the hosted measurement does not exist; CI-05's trigger behaviour is proved only by the truth-table test over the workflow's own expressions, and the hosted checks are open.

**Unverified: needs a hosted run (blocked by billing, D-01)**

- The suite's time on a hosted runner (CI-06 as written; roadmap criterion 2's hosted part).
- From 03-02: a ready pull request gets one `full suite` run and a draft gets none; opening a pull request ready starts the run via `opened`; adding an unrelated label neither starts nor cancels a run (assumption A2); a push without the label cancels a running full suite.
- From 03-05: A3 the luacheck 1.2.0 release binary runs on `ubuntu-latest`; A4 `lua5.1` still installs through apt as written; A6 `node-version-file: .nvmrc` works on `actions/setup-node@v7`, Node 24 sets up with `cache: npm`, and the Playwright preview job (`playwright@1.56.1`) runs on Node 24; the `wait "$tools_pid" || { cat tools.log; exit 1; }` shape fails the verify step on a bad digest.
- From this plan: the same 2-worker measurement is a proxy for a 2-vCPU runner; a hosted vCPU may be faster or slower than this i7-13620H.

**Needs a user decision:** whether any module startup work is approved to bring the proxy from about 156 s to 150 s or less (D-02, one module at a time).

## Known Stubs

None.

## Threat Flags

None. T-03-17: measured last and alone on a quiet machine, with `busy before run` and the machine printed with each run, the cap proved by `max concurrent files 2`, and the hosted number stated as open. T-03-18: the baseline diff (907 of 907, 0 failed, 0 skipped), coverage 19058/19058 and the `VG_LOGIN_SCOPE=full` run all passed. T-03-SC7: nothing installed; `npm ci` from the lock only.

## Next Phase Readiness

Phase 3 plans are all done. Phase verification can copy the timing record above. It also needs the user's answers on the 150 s budget and on whether to add `.claude/` to the luacheck excludes. Nothing here needs an in-game check.

## Self-Check: PASSED

- `.github/workflows/lua-suite.yml` is modified and commit `c17be4c` is an ancestor of HEAD; `git rev-list --count 3ae6cec..HEAD` gave 1 before this SUMMARY was committed.
- Logs exist under `coverage/`: `p3-gate-verify.log`, `p3-gate-full-logins.log`, `p3-gate-baseline.log`, `p3-gate-coverage.log`, `p3-gate-lint.log`, `p3-gate-lint-repo-only.log`, `p3-timing-1.log`, `p3-timing-2.log`, `p3-timing-coverage.log`, `p3-profile-more.log`.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
