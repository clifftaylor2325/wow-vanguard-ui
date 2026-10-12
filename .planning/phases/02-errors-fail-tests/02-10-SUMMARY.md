---
phase: 02-errors-fail-tests
plan: 10
subsystem: testing
tags: [error-guard, ns.Guard, core, hooks, clicks, timers, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "ns.Guard (02-01), the always-on test guard (02-07), money-path conversions (02-08, 02-09)"
provides:
  - "26 Core hook, OnClick and timer callbacks reporting errors to ns.errors and /vg errors"
affects: [02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns: ["wrap only the callback argument with ns.Guard at install time"]
key-files:
  created: []
  modified:
    - Core/Movers.lua
    - Core/Profiles.lua
    - Core/Theme.lua
    - Core/Dialog.lua
    - Core/ErrorBadge.lua
    - Core/Feedback.lua
    - Core/GameMenu.lua
    - Core/Setup.lua
    - Core/OptionsProfiles.lua
    - Core/OptionsWindow.lua
    - Core/Visibility.lua
    - Core/Perf.lua
key-decisions:
  - "Labels follow the convention 'hook <Name>', 'click <what>', 'timer <what>'; both GameMenu buttons share one label because they run the same handler."
requirements-completed: [CI-04]
status: complete
commits: 3
plan_head_before: 1a7cb87bd2c7ab9b9bd5b4e54d97320ccc8f5238
plan_head_after: faa44c6d1b73c28749d3390f096700a783cdd893
actuals:
  tokens: 700
  tasks: 3
  commits: 3
---

# Phase 2 Plan 10: Remaining Core hook, click and timer conversions Summary

Twenty-six Core callbacks (6 hooks, 17 OnClick handlers, 3 timers) now run under `ns.Guard`, so an error in any of them is recorded in `ns.errors` and shows in `/vg errors`; only the callback argument changed at each site, no test file was edited, and the full suite and the 100% coverage floor held on the first run.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-10-01 | Mover, profile and theme hooks run under ns.Guard | 3d8d080 |
| 2-10-02 | Dialog, error badge, feedback, game menu and setup clicks run under ns.Guard | a680881 |
| 2-10-03 | Options, visibility and perf clicks and timers run under ns.Guard | faa44c6 |

## Converted sites

| File | Sites | Label (line at execution) |
| ---- | ----- | ------------------------- |
| Core/Movers.lua | 3 | hook SetAlpha (98), hook SetPoint (209), hook HighlightSystem (267) |
| Core/Profiles.lua | 1 | hook UpdateLayoutInfo (332) |
| Core/Theme.lua | 2 | hook SetChecked (852), hook SetTabSelected (853) |
| Core/Dialog.lua | 6 | click close text box (64), click text box primary (87), click question yes (116), click question no (117), click reload by hand (158), click reload later (172) |
| Core/ErrorBadge.lua | 1 | click list errors (54) |
| Core/Feedback.lua | 1 | click cancel feedback (267) |
| Core/GameMenu.lua | 2 | click open options from game menu (34, 43) |
| Core/Setup.lua | 2 | click setup style (381), click close setup (455) |
| Core/OptionsProfiles.lua | 1 | click danger button (18) |
| Core/OptionsWindow.lua | 3 | click reset setting (177), click close options (432), click options page (484) |
| Core/Visibility.lua | 3 | click visibility chip (288), timer end linger (115), timer auto hide (134) |
| Core/Perf.lua | 1 | timer perf report (133, the NewTicker) |

Total 26: 6 in task 1, 12 in task 2, 8 in task 3. The Reload button keeps its `SecureActionButtonTemplate` overlay untouched; only the plain button's `reloadByHand` fallback is wrapped. `ns.Soon`, `HookScript`, other `SetScript` kinds and `OnUpdate` drivers were not touched. No function grew past 10 lines (the quality scan passes).

## Verification

| Check | Result |
| ----- | ------ |
| Task 1 area files (movers, unlock, theme, profiles, options, windows-tabs), `coverage/p2-10-01-area.log` | 6 files / 88 tests passed |
| Task 2 area files (setup, feedback, profiles, options, core), `coverage/p2-10-02-area.log` | 5 files / 115 tests passed |
| Task 3 area files (options, visibility, bars, profiles, core), `coverage/p2-10-03-area.log` | 5 files / 133 tests passed |
| `npm run test:quick` after tasks 1 and 2 | exit 0, 10 files / 140 tests |
| `grep -n "ns.Guard("` per task | Movers 3, Profiles 1, Theme 2; Dialog 6, ErrorBadge 1, Feedback 1, GameMenu 2, Setup 2; OptionsProfiles 1, OptionsWindow 3, Visibility 3, Perf 1 |
| Unguarded `hooksecurefunc(`, `SetScript("OnClick"`, `C_Timer.After/NewTimer/NewTicker(` in the 12 files | none |
| Full `npm test`, `coverage/p2-10-03-full.log` | exit 0, 69 files / 897 tests passed |
| `npm run coverage` | exit 0, 69 files / 897 tests, Lua line coverage 19058/19058 100.00% |
| `npm run quality`, `npm run lint`, `luac5.1 -p` on all 12 files | pass (lint 0 warnings / 0 errors in 114 files) |

The plan's verify blocks use `!` negations and pipes; each condition was run as a separate command and its exit status or count read. The `! grep ... | grep -v` check was run as `grep ... | grep -v "ns.Guard("` and the empty result was read as "none left".

## D-04 tally

Cases turned red by these conversions: 0. New unexpected errors: 0. No test file was edited and no addon change beyond the wrapping was needed. Phase total (from `02-07-SUMMARY.md`, 5 root causes R1 to R5; 02-08 and 02-09 added 0) plus this plan: 5, well under the limit of about 20.

## Full-run failures

None. The single full `npm test` run (and the later `npm run coverage` run) passed on the first attempt, 69 files / 897 tests. The check-zip and media timeouts seen under parallel load in plan 02-08 did not recur with plans running one at a time.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was run once in the fresh worktree (vitest was missing).
- The branch was fast-forwarded to `1a7cb87` first, as instructed by the orchestrator.
- The plan commit ledger (`gsd-plan-head-before-*` under the git dir) was not written; `plan_head_before` is the fast-forward target `1a7cb87`, and `git rev-list --count 1a7cb87..HEAD` gave 3.
- Extra check not in the plan: `npm run coverage` (CLAUDE.md requires it before calling a change done); it passed at 100%.
- Labels chosen where the plan left them open: "click danger button" for `W.Danger` (a generic widget used for Delete and Copy here), "click visibility chip", "click reset setting", "click options page", "click text box primary".

## Known Stubs

None.

## Threat Flags

None. T-02-20: only the insecure button's OnClick is wrapped; the secure overlay, its attributes and its `ns.OutOfCombat` build are unchanged.

## Needs in-game check

- The Reload button in the options footer and the reload dialog still reloads out of combat on Forever (the secure overlay), and in combat still says to type `/reload`.
- `/vg perf` while dragging movers and switching tabs: no visible cost from the guarded `SetPoint`, `SetAlpha` and `SetChecked` hooks (T-02-31, research A4).
- The game menu's Vanguard button and the error badge click still open what they did.

## Self-Check: PASSED

- All 12 Core files carry the converted lines (grep counts above).
- Commits `3d8d080`, `a680881` and `faa44c6` are on `worktree-agent-abe1b2f7cc7855c64`.
