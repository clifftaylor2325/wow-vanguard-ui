---
phase: 02-errors-fail-tests
plan: 07
subsystem: testing
tags: [error-guard, vitest, harness, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "error guard module, expectErrors markers and root-cause fixes from plans 02-01, 02-03 to 02-06"
provides:
  - "Unconditional global afterEach: every test in both Vitest projects is judged on ns.errors"
  - "Test-writer note on the guard and expectErrors in scripts/tests/README.md"
  - "Recorded negative control on the SetPostItem hook"
affects: [02-08, 02-09, 02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns: ["guard always on; the only opt-out is naming the error with expectErrors"]
key-files:
  created: []
  modified:
    - scripts/tests/setup.mjs
    - scripts/tests/README.md
key-decisions:
  - "The VG_ERROR_GUARD condition was removed, not inverted; setup.mjs mentions no opt-in variable and names no test file."
requirements-completed: [CI-04]
status: complete
commits: 1
plan_head_before: b2afb27d551b6706846c890f190953fb0bc06715
plan_head_after: b0a8730f560e1e4aef42a940e9d0882ca7bed1bd
actuals:
  tokens: 1500
  tasks: 2
  commits: 1
---

# Phase 2 Plan 07: Switch the error guard on for every test Summary

The `afterEach` in `scripts/tests/setup.mjs` now always calls `check(createdAddons.splice(0), takeExpected())`, so any test in either Vitest project that leaves an `ns.errors` entry it did not name with `expectErrors` fails, and a deliberately throwing `SetPostItem` hook was shown to turn `auction.test.mjs` red.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-07-01 | The guard judges every test, with no opt-in | b0a8730 |
| 2-07-02 | Negative control (temporary edit, reverted) | no commit, by plan |

## What changed

- `scripts/tests/setup.mjs`: the opt-in condition is gone. The comment now says every test is judged, a test opts out of nothing and can only name each deliberate error with `expectErrors` (D-01). `process.env` is read once, for `LUA_COVERAGE_HITS`.
- `scripts/tests/README.md`: new text in the Errors section: every test is judged, entries cleared with `ns.ClearErrors` count, failures print text, count and stack; how to use `expectErrors` (whole text, or a `^...$` pattern varying only in `\d+`); broader matchers throw; a marker matching nothing fails; `AURA_FALLBACK` is the D-06 notice.
- No test file was needed in step 1: the pre-switch guarded run was already green.

## Verification

| Check | Result |
| ----- | ------ |
| `VG_ERROR_GUARD=1 npm test` before the switch (`coverage/p2-guard-full.log`) | 69 files / 897 tests passed |
| `npm test` after the switch (`coverage/p2-switch-full.log`) | 69 files / 897 tests passed |
| `npm run quality` | OK |
| `grep -n "process.env" scripts/tests/setup.mjs` | one hit, line 18, `LUA_COVERAGE_HITS` |
| `VG_ERROR_GUARD` in `setup.mjs` | 0 hits (and none in any `.mjs`, `.yml`, `.json` or `.md` outside `.planning/` and `coverage/`) |
| test file names, `currentTestName`, `task.name` in `setup.mjs` | 0 hits |
| `expectErrors` in README | present (lines 127, 130) |
| `npm ci` then `npm run coverage` | exit 0, 69 files / 897 tests, `Lua line coverage (floor 100%)` total `19055/19055 100.00%` |

The plan's verify block uses `!` negations and compound lines; I ran each condition as a separate command and read the exit status or count directly (the harness refuses compound git commands).

## D-04 tally (phase so far)

Distinct unexpected root causes across plans 02-01 and 02-03 to 02-06: 5 (R1 to R5), well under the limit of about 20. Step 1 found nothing new (the guarded run was already green), so this plan adds 0. Plan 02-02 recorded no tally.

| Root cause | Plan | Disposition |
| ---------- | ---- | ----------- |
| R1: fixtures replaced `Enum`, so `Core/AuraEngine.lua:122` indexed a nil `CustomAuraButtonDispelTypeTextureStyle` | 02-03 (re-seen in 02-05) | fixture fixed (`NO_PROBE_ENUMS`, probe tables only) |
| R5: the same replacement, read by the stub's `UnitPowerMax` (`PowerType`) | 02-03 | same fixture fix |
| R2: `hooksecurefunc` fixture handled only the table form | 02-03 (re-seen in 02-05) | string form added to the fixtures |
| R3: ChatExtras without `hooksecurefunc` / `RegisterCallback` | 02-05 | addon fixed (2 changed lines, commit 2165ee0) |
| R4: AFK bare client without `UnitClass` / `UnitName` | 02-05 | fixture fixed (modules switched off in that client's saved variables) |

Entries that were not root causes: 02-01's `RaidFrames: attempt to index a nil value` (feedback.test.mjs, deliberate, marked in 02-06); 02-04 found 0 (its dispel-style and Broken-skin entries were deliberate cases and carry markers); 02-06 found 0.

Judgement calls from earlier plans still open for the user (copied, not decided here): the `TEST-ONLY: no cooldown frames` markers in 02-03, the `Core/AuraEngine.lua:122` dispel entry marked as deliberate in 02-04, and the R4 fixture-vs-marker choice in 02-05.

## Negative control

Temporary edit: in `Modules/AuctionSell.lua` line 654, the `SetPostItem` hook callback was changed to `function(_, loc) error("TEST-ONLY control", 1) AH.TakeItem(loc) end`. Command: `npm test -- scripts/tests/auction.test.mjs`, log `coverage/p2-negative-control.log`, exit 1, `Tests  3 failed | 71 passed (74)`.

Failing cases:
- `posting calls the right function from a click, never from a timer` (reported twice in the log)
- `the addon never writes into the game's auction window`
- `what the sell card won't take, and when it can't post`

Guard message lines from the log:

```
Error: Vanguard left 1 error(s) in ns.errors that this test did not expect:
  1. hook SetPostItem: Modules/AuctionSell.lua:654: TEST-ONLY control   (x1)
If the test causes the error on purpose, name it with expectErrors("hook SetPostItem: Modules/AuctionSell.lua:654: TEST-ONLY control"); otherwise fix the addon.
```

(One case shows `(x3)`.) The stack lines are in the log.

Revert: `git checkout -- Modules/AuctionSell.lua`; `git diff --quiet -- Modules/AuctionSell.lua` exit 0 and `git status --short` empty. Re-run of `npm test -- scripts/tests/auction.test.mjs` (`coverage/p2-negative-control-rerun.log`): 1 file / 74 tests passed. No commit for this task.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was needed in the fresh worktree before any test could run (vitest was missing); run once at the start. The plan's later `npm ci` before coverage was therefore a repeat, not run again.
- The verify one-liners were run as separate commands (see Verification).

## Known Stubs

None.

## Needs in-game check

- D-06 (from 02-04): does Forever show the error badge at login because of the aura-container fallback notice?

## Threat Flags

None.

## Self-Check: PASSED

- `scripts/tests/setup.mjs` and `scripts/tests/README.md` changed; commit b0a8730 exists on `worktree-agent-a345d6be44f6f2325`.
- `Modules/AuctionSell.lua` matches HEAD.
