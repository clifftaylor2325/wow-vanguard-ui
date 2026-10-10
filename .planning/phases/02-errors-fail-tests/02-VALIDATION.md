---
phase: "2"
slug: "errors-fail-tests"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-10"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `02-RESEARCH.md` § Validation Architecture. The planner turns the requirement map below into a per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (lock file), projects `quick` and `lua` |
| **Config file** | `vitest.config.mjs`; setup file `scripts/tests/setup.mjs` |
| **Quick run command** | `npm run test:quick` (JS tests plus `smoke.test.mjs`, about 10 s) |
| **Full suite command** | `npm test` (66 files, 873 tests today; about 3.5 minutes on 16 threads); gate: `npm run verify` and `npm run coverage` |
| **Estimated runtime** | quick ~10 s; full ~4 to 6 min; verify + coverage ~11 min |

---

## Sampling Rate

- **After every task commit:** `npm test -- <the touched area test files>` plus `npm run test:quick` (the plans use `npm test -- <files>`, which runs the repo's own `vitest run`, instead of `npx`, so a worktree never fetches another Vitest); for a harness or `Core/Events.lua` change also `npm test -- scripts/tests/errorrail.test.mjs`
- **While the guard is staged (waves 1-2):** `VG_ERROR_GUARD=1 npm test -- <files>` judges the named files; plain runs stay green. Plan 02-07 removes the opt-in.
- **After every plan wave:** `npm test` (the last task of each plan from 02-05 on runs it)
- **Before `/gsd-verify-work`:** `npm run verify` and `npm run coverage` green, plus the shuffle smoke commands (plan 02-13 task 3)
- **Max feedback latency:** ~90 seconds for a task; the full suite per wave
- **Command shape:** every verify is a list of simple commands, one per line, run from the worktree root with relative paths: no `cd`, no `git -C`, no compound git commands, no backslashes (the executors' worktree guard refuses them)
- **Logged runs (plans 02-08 to 02-12):** each `npm test` run in the map below (area files or whole suite) writes to `coverage/p2-<task>-area.log` or `coverage/p2-<task>-full.log` (gitignored, after `mkdir -p coverage`). The gate is the run's exit status, `grep -E "Test Files +[0-9]+ passed"` on the log printing the files summary of a run in which no file failed (a bare `FAIL` line cannot satisfy it), and `! grep -E "(Test Files|Tests) +[0-9]+ failed"` on the log; to read a run, the executor prints only `grep -E "Test Files|Tests +[0-9]|FAIL"` on the log, plus the failing cases' sections when a run is red

---

## Per-Task Verification Map

Task IDs are final (planner, 2026-10-10). Each task's full command list is in its PLAN's `<verify>`; the main gate is shown here.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command (main gate) | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------------------|-------------|--------|
| 2-01-01 | 01 | 1 | CI-04, CI-03 | T-02-01, T-02-02, T-02-03, T-02-05 | errors go through `ns.Try` only (`errorText` names secrets); the SetPostItem hook stays a synchronous post-hook; the registry is drained after every test | tracer (Lua integration) | `npm test -- scripts/tests/errorrail.test.mjs`; `VG_ERROR_GUARD=1 npm test -- scripts/tests/errorrail.test.mjs scripts/tests/smoke.test.mjs`; `npm test -- scripts/tests/auction.test.mjs`; `npm run test:quick`; `npm run quality`; `npm run lint` | W0: errorrail + error-guard created here | ✅ green |
| 2-01-02 | 01 | 1 | CI-04 | T-02-03, T-02-04 | stale markers fail; `expectErrors` throws for a marker that could match a class of errors (unanchored, empty, wildcard, varying in more than digits); the ClearErrors harvest; a nil passthrough | unit (JS) + Lua integration | `npm test -- scripts/error-guard.test.mjs scripts/tests/errorrail.test.mjs`; guarded `feedback.test.mjs` run saved to `coverage/p2-guard-bites.log` with `\|\| true`, then the log must show `did not expect`, the numbered entry line for `RaidFrames: attempt to index a nil value` and a failed-test count; `npm test` | W0: error-guard.test created here | ✅ green |
| 2-02-01 | 02 | 1 | CI-03 | T-02-08 | each case in its own TEST-ONLY temp folder | unit (JS), shuffled | `npm test -- scripts/link-wow.test.mjs --sequence.shuffle --sequence.seed=<1, 2, 3, 20261010>` | ✅ | ✅ green |
| 2-02-02 | 02 | 1 | CI-03 | — | no re-run option | smoke | `VG_SHUFFLE_SEED=4242 npm run test:quick` (log has `Running tests with seed "4242"`); seeds 1, 2, 3 | ✅ | ✅ green |
| 2-02-03 | 02 | 1 | CI-03 | T-02-06, T-02-07 | no `${{ }}` in `run:`; `contents: read` kept | static (JS reader) | `npm test -- scripts/workflows.test.mjs` | W0: workflows.test created here | ✅ green |
| 2-03-01 | 03 | 2 | CI-04 | T-02-09 | fixtures fixed to match the client; a stub change is its own cited commit | Lua area | `npm test -- scripts/tests/core.test.mjs`; guarded log shows none of the R1/R2/R5 texts | ✅ | ✅ green |
| 2-03-02 | 03 | 2 | CI-04 | T-02-10 | exact markers only | Lua area, guarded | `VG_ERROR_GUARD=1 npm test -- scripts/tests/core.test.mjs` | ✅ | ✅ green |
| 2-04-01 | 04 | 2 | CI-04 | T-02-26, T-02-11 | D-06 notice named with `AURA_FALLBACK` | Lua area, guarded | `VG_ERROR_GUARD=1 npm test -- scripts/tests/auras.test.mjs scripts/tests/plates.test.mjs` | ✅ | ✅ green |
| 2-04-02 | 04 | 2 | CI-04 | T-02-26 | exact markers; one anchored pattern for the generated family | Lua area, guarded | `VG_ERROR_GUARD=1 npm test -- scripts/tests/report.test.mjs` | ✅ | ✅ green |
| 2-05-01 | 05 | 2 | CI-04 | T-02-12 | addon guards skip only when the client call is missing | Lua area, guarded | `VG_ERROR_GUARD=1 npm test -- scripts/tests/profiles.test.mjs scripts/tests/windows-map.test.mjs scripts/tests/windows-menus.test.mjs`; `npm run lint` | ✅ | ✅ green |
| 2-05-02 | 05 | 2 | CI-04 | T-02-09 | fixtures extend Enum; both hooksecurefunc forms | Lua area | `VG_ERROR_GUARD=1 npm test -- scripts/tests/frames.test.mjs`; guarded log shows none of the R1/R2 texts | ✅ | ✅ green |
| 2-05-03 | 05 | 2 | CI-04 | T-02-27, T-02-13 | `UNITS_ENV` answers like the client; full suite before commit | Lua area, guarded + full | `VG_ERROR_GUARD=1 npm test -- scripts/tests/more.test.mjs scripts/tests/tooltip.test.mjs scripts/tests/frames.test.mjs scripts/tests/profiles.test.mjs scripts/tests/windows-map.test.mjs scripts/tests/windows-menus.test.mjs`; `npm test` | ✅ | ✅ green |
| 2-06-01 | 06 | 2 | CI-04 | T-02-28 | exact markers | Lua area, guarded | `VG_ERROR_GUARD=1 npm test -- scripts/lua-engine.test.mjs scripts/tests/auctionapi.test.mjs scripts/tests/feedback.test.mjs` | ✅ | ✅ green |
| 2-06-02 | 06 | 2 | CI-04 | T-02-28 | exact markers | Lua area, guarded | `VG_ERROR_GUARD=1 npm test -- scripts/tests/fallbacks.test.mjs scripts/tests/skins.test.mjs` | ✅ | ✅ green |
| 2-07-01 | 07 | 3 | CI-04 | T-02-14 | the opt-in is gone; setup.mjs names no test file and reads no test name | full + coverage | `npm test`; `! grep -n "VG_ERROR_GUARD" scripts/tests/setup.mjs`; `npm ci`; `npm run coverage` (100.00%) | ✅ | ✅ green |
| 2-07-02 | 07 | 3 | CI-04 | T-02-15 | the control edit is reverted, with no commit | negative control | log `coverage/p2-negative-control.log` names `hook SetPostItem:` and `TEST-ONLY control` and shows failed tests; `git diff --quiet -- Modules/AuctionSell.lua`; `npm test -- scripts/tests/auction.test.mjs` | ✅ | ✅ green |
| 2-08-01 | 08 | 4 | CI-04 | T-02-16, T-02-29 | restricted auction calls stay in the click's call stack | Lua area + listing | `npm test -- scripts/tests/auction*.test.mjs scripts/tests/errorrail.test.mjs` (the seven files named in the plan); no unguarded site in the five files | ✅ | ✅ green |
| 2-08-02 | 08 | 4 | CI-04 | T-02-16, T-02-17 | nil `onClick` stays nil | Lua area + full | `npm test -- scripts/tests/options.test.mjs scripts/tests/setup.test.mjs scripts/tests/clickcast.test.mjs scripts/tests/profiles.test.mjs scripts/tests/auction.test.mjs`; `npm test` | ✅ | ✅ green |
| 2-09-01 | 09 | 4 | CI-04 | T-02-18 | — | Lua area + listing | `npm test -- scripts/tests/bagsections.test.mjs scripts/tests/upgrades.test.mjs scripts/tests/auctionupgrades.test.mjs scripts/tests/inventory.test.mjs scripts/tests/windows-town.test.mjs scripts/tests/visibility.test.mjs` | ✅ | ✅ green |
| 2-09-02 | 09 | 4 | CI-04 | T-02-19, T-02-30 | purchase and sell calls stay where they ran | Lua area + full | `npm test -- scripts/tests/vendor.test.mjs scripts/tests/inventory.test.mjs scripts/tests/auctioncrafting.test.mjs scripts/tests/auctionrestock.test.mjs`; `npm test` | ✅ | ✅ green |
| 2-10-01 | 10 | 5 | CI-04 | T-02-31 | — | Lua area + listing | `npm test -- scripts/tests/movers.test.mjs scripts/tests/unlock.test.mjs scripts/tests/theme.test.mjs scripts/tests/profiles.test.mjs scripts/tests/options.test.mjs scripts/tests/windows-tabs.test.mjs` | ✅ | ✅ green |
| 2-10-02 | 10 | 5 | CI-04 | T-02-20 | the secure Reload overlay untouched | Lua area + listing | `npm test -- scripts/tests/setup.test.mjs scripts/tests/feedback.test.mjs scripts/tests/profiles.test.mjs scripts/tests/options.test.mjs scripts/tests/core.test.mjs` | ✅ | ✅ green |
| 2-10-03 | 10 | 5 | CI-04 | T-02-32 | — | Lua area + full | `npm test -- scripts/tests/options.test.mjs scripts/tests/visibility.test.mjs scripts/tests/bars.test.mjs scripts/tests/profiles.test.mjs scripts/tests/core.test.mjs`; `npm test` | ✅ | ✅ green |
| 2-11-01 | 11 | 6 | CI-04 | T-02-34 | — | Lua area + listing | `npm test -- scripts/tests/windows-*.test.mjs scripts/tests/spellbook.test.mjs` (the eight files named in the plan) | ✅ | ✅ green |
| 2-11-02 | 11 | 6 | CI-04 | T-02-33 | — | Lua area + listing | `npm test -- scripts/tests/windows-town.test.mjs scripts/tests/tooltip.test.mjs scripts/tests/situations.test.mjs scripts/tests/visibility.test.mjs scripts/tests/more.test.mjs` | ✅ | ✅ green |
| 2-11-03 | 11 | 6 | CI-04 | T-02-33, T-02-21 | a failing AddMessage hook prints once | Lua area + full | `npm test -- scripts/tests/chatwatch.test.mjs scripts/tests/casts.test.mjs scripts/tests/fallbacks.test.mjs scripts/tests/windows-social.test.mjs scripts/tests/theme.test.mjs scripts/tests/more.test.mjs`; `npm test` | ✅ | ✅ green |
| 2-12-01 | 12 | 7 | CI-04 | T-02-22 | clicks stay in their call stack | Lua area + listing | `npm test -- scripts/tests/plates.test.mjs scripts/tests/units.test.mjs scripts/tests/windows-map.test.mjs scripts/tests/core.test.mjs` | ✅ | ✅ green |
| 2-12-02 | 12 | 7 | CI-04 | T-02-35 | no OnClick on secure frames | Lua area + listing | `npm test -- scripts/tests/broker.test.mjs scripts/tests/clickcast.test.mjs scripts/tests/prep.test.mjs scripts/tests/frames.test.mjs scripts/tests/auctionrestock.test.mjs scripts/tests/more.test.mjs` | ✅ | ✅ green |
| 2-12-03 | 12 | 7 | CI-04 | T-02-35, T-02-22 | — | Lua area + full + completeness | `npm test -- scripts/tests/talents.test.mjs scripts/tests/fights.test.mjs scripts/tests/status.test.mjs scripts/tests/raid.test.mjs scripts/tests/fallbacks.test.mjs`; repo-wide listing of unguarded hooks and OnClick is empty; `npm test` | ✅ | ✅ green |
| 2-13-01 | 13 | 8 | CI-04 | T-02-23 | exception limited to ns.Soon's timer | unit (JS) + quality | `npm test -- scripts/code-quality.test.mjs`; `npm run quality` | ✅ | ✅ green |
| 2-13-02 | 13 | 8 | CI-03 | T-02-24 | no assertion loosened; the stub commit cites the source | full | `npm test` | ✅ | ✅ green |
| 2-13-03 | 13 | 8 | CI-03, CI-04 | T-02-25 | — | phase gate | `npm ci`; `npm run verify`; `npm run coverage`; `npm run lint`; `VG_SHUFFLE_SEED=4242 npm run test:quick` (seed line), then seeds 1, 2, 3 | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Sequencing: the guard is built in wave 1 behind the `VG_ERROR_GUARD=1` opt-in (it always drains the registry), the markers and root-cause fixes land file by file in wave 2, verified with the opt-in, and plan 02-07 removes the opt-in once the whole suite is green with it. No commit leaves `npm test` red. Conversions (waves 4-7) run with the guard live, money paths first (D-04): 02-08 and 02-09 side by side in wave 4 (test edits there belong to 02-08), then 02-10, 02-11 and 02-12 one at a time in waves 5, 6 and 7, because all three may edit the shared `more.test.mjs` and `core.test.mjs`, and 02-12's repo-wide completeness listing needs 02-10 and 02-11 merged first. 02-13 runs last, in wave 8.*

---

## Requirement Verification Map (research's map, now carried by the tasks above)

| Req | Criterion | Behavior | Automated command | Expected |
|-----|-----------|----------|-------------------|----------|
| CI-04 | SC1 | An unexpected `ns.errors` entry fails the test and the message names text, count and stack | `npx vitest run scripts/error-guard.test.mjs` | pass; unmarked entry gives a message with the text; matching marker gives none; never-matched marker fails |
| CI-04 | SC1 | A marker cannot cover a class of errors (D-01) | `npm test -- scripts/error-guard.test.mjs` | `expectErrors` throws for an unanchored, empty or wildcard RegExp, one that varies in more than digit runs, a loosening flag, or an empty string, and keeps none of the call's matchers |
| CI-04 | SC1 | The registry is drained and a real addon's error is seen | `npx vitest run scripts/tests/errorrail.test.mjs` | pass |
| CI-04 | SC1 | No exemption list in `setup.mjs`: it holds no list of file or test names, because it names no test file and never reads which test is running | `grep -nE "[a-z-]+[.]test[.]mjs\|currentTestName\|task[.]name" scripts/tests/setup.mjs` (carried by task 2-07-01's verify) | no output |
| CI-04 | SC2 | A throwing hook, `OnClick` handler and timer callback each land in `ns.errors` | `npx vitest run scripts/tests/errorrail.test.mjs` | pass |
| CI-04 | SC2 | Every site converted | `npm run quality` (new rule) and the two completeness greps in `02-RESEARCH.md` | exit 0; greps print nothing (only `Core/Combat.lua:118` may remain) |
| CI-04 | SC4 | Guard on, suite green, no exemptions | `npm test` | all files and tests pass, exit 0 |
| CI-04 | SC4 | Coverage floor holds | `npm run coverage` | total 100.00%, exit 0 |
| CI-04 | SC4 | Code-quality scan | `npm run verify` | exit 0 |
| CI-03 | SC3 | The config shuffles from `VG_SHUFFLE_SEED` and prints the seed | `VG_SHUFFLE_SEED=4242 npx vitest run --project quick` | output contains `Running tests with seed "4242"` |
| CI-03 | SC3 | JS tests are order independent (`link-wow` fix) | `VG_SHUFFLE_SEED=1 npm run test:quick`, then seeds 2 and 3 | exit 0 each |
| CI-03 | SC3 | The weekly workflow shuffles and prints the seed; the PR run does not | `grep -n "shuffle\|VG_SHUFFLE_SEED" .github/workflows/*.yml vitest.config.mjs` | `full-suite.yml` sets `shuffle` only for `schedule` |
| CI-03 | SC3 | First green hosted shuffled run | not runnable (billing block) | stays open by D-05; do not claim it |

---

## Wave 0 Requirements

- [x] `scripts/lib/error-guard.mjs`: `expectErrors`, `takeExpected`, `caught`, `judge`, `check` (task 2-01-01)
- [x] `scripts/error-guard.test.mjs`: pure-function tests (task 2-01-02)
- [x] `scripts/tests/errorrail.test.mjs`: `ns.Guard` on the SetPostItem hook (2-01-01), a click, a timer and a nil callback, the harvest and `AURA_FALLBACK` (2-01-02), the stack (2-13-03)
- [x] `scripts/tests/setup.mjs` global `afterEach` (opt-in in 2-01-01, unconditional in 2-07-01); `createAddon` registry and `ns.ClearErrors` harvest in `scripts/lib/lua-harness.mjs` (2-01-01); re-export and `AURA_FALLBACK` in `scripts/tests/helpers.mjs` (2-01-02)
- [x] Code-quality rule and its tests in `scripts/code-quality.test.mjs` (task 2-13-01)
- [x] `link-wow.test.mjs` made order independent (2-02-01); `vitest.config.mjs` shuffle block (2-02-02); `scripts/workflows.test.mjs` (2-02-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Negative control: a deliberately throwing hook turns its test red | CI-04 | Proves the guard bites end to end; reverted afterwards | Now a recorded, automated run: task 2-07-02 (temporary edit of the SetPostItem hook, log checked, `git checkout` revert, no commit) |
| Does Forever show the error badge at login (aura-container notice)? | CI-04 (D-06) | Needs the game client | Author's in-game check list (plan 02-04) |
| Auction Post/Buy/Cancel clicks still work after being wrapped in `ns.Try` | CI-04 (D-03) | Needs the game client (A1) | Author's in-game check list, with Phase 5's Post check (plan 02-08) |
| Train all, restock buying, junk selling; Reload button; raid tools, quest dialog, talent planner clicks | CI-04 (D-03) | Needs the game client | Author's in-game check list (plans 02-09, 02-10, 02-12) |
| Per-call cost of hot guarded hooks (SetPoint, SetAlpha, SetChecked, AddMessage, Show, bag-slot SetVertexColor) | CI-04 (D-03) | Needs the game client (A4) | `/vg perf` in game (plans 02-09 to 02-11) |
| `debugstack` exists in the Forever client | CI-03 | Needs the game client (A3) | Author's in-game check list (plan 02-13) |
| First green shuffled run on the hosted runner | CI-03 (D-05) | Hosted runner is blocked by billing | Left open until the block clears |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (all 32 tasks carry an `<automated>` block)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each Wave 0 file is created by a named task before its first use)
- [x] No watch-mode flags (`vitest run` only)
- [ ] Feedback latency < 120 s per task (the area-file gates; the full-suite runs at plan ends and the 2-07 / 2-13 gates are per-wave by design)
- [x] `nyquist_compliant: true` set in frontmatter (validate-phase, 2026-10-10)

**Approval:** approved 2026-10-10 (orchestrator audit). Caveats: executors ran the plans' one-line verify gates condition by condition, not verbatim, because the isolation guard refuses compound git commands; the latency box stays unticked because the larger area runs and full-suite runs take minutes; the in-game items and the first green hosted shuffled run remain manual-only and open.

## Validation Audit 2026-10-10

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
