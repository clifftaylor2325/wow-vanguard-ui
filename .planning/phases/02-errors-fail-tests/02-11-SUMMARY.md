---
phase: 02-errors-fail-tests
plan: 11
subsystem: testing
tags: [error-guard, ns.Guard, windows, chat, hooks, clicks, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "ns.Guard (02-01), the always-on test guard (02-07), Core conversions (02-08 to 02-10)"
provides:
  - "32 hook and OnClick callbacks in the window skins, menu strip, game tools, alerts, tooltips, chat and bars reporting errors to ns.errors and /vg errors"
affects: [02-12, 02-13]
tech-stack:
  added: []
  patterns: ["wrap only the callback argument with ns.Guard at install time; local after() wrappers build the label from the hook name once per hook"]
key-files:
  created: []
  modified:
    - Modules/Windows.lua
    - Modules/WindowsMap.lua
    - Modules/WindowsSocial.lua
    - Modules/WindowsSystem.lua
    - Modules/WindowsTabs.lua
    - Modules/WindowsTown.lua
    - Modules/MenuStrip.lua
    - Modules/GameTools.lua
    - Modules/GameAlerts.lua
    - Modules/Tooltips.lua
    - Modules/Chat.lua
    - Modules/ChatExtras.lua
    - Modules/ChatWatch.lua
    - Modules/CastBars.lua
    - Modules/DataBars.lua
key-decisions:
  - "Labels follow 'hook <Name>', 'click <what>'; the three local after() wrappers build 'hook ' .. tostring(name) (WindowsSocial uses its key local) so their callers are covered without editing each caller."
requirements-completed: [CI-04]
status: complete
commits: 3
plan_head_before: bea7c3297eae330987341e57b3eede6a92f4782a
plan_head_after: 957ec94bf175216a9a9b4c743bdb2b91b6a6ea67
actuals:
  tokens: 1100
  tasks: 3
  commits: 3
---

# Phase 2 Plan 11: Window-skin, menu strip, game tool, alert, tooltip, chat and bar conversions Summary

Thirty-two callbacks (30 hooks, 2 OnClick handlers) now run under `ns.Guard`, so an error in any of them is recorded in `ns.errors` and shows in `/vg errors`; only the callback argument changed at each site, no test file was edited, and the full suite and the 100% coverage floor held on the first run.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-11-01 | Window-skin hooks run under ns.Guard, including the after() wrappers | f0e240b |
| 2-11-02 | Town window, menu strip, game tools, alerts and tooltip hooks run under ns.Guard | 8497337 |
| 2-11-03 | Chat, chat extras, chat watch, cast bar and data bar hooks and clicks run under ns.Guard | 957ec94 |

## Converted sites

| File | Sites | Labels |
| ---- | ----- | ------ |
| Modules/Windows.lua | 4 | hook SetupTimer, hook InitButtons, after() owner branch and global branch: `"hook " .. tostring(name)` |
| Modules/WindowsMap.lua | 3 | hook SynchronizeDisplayState, hook Refresh, hook Update |
| Modules/WindowsSocial.lua | 1 | after(): `"hook " .. key` |
| Modules/WindowsSystem.lua | 3 | hook OnSelected, hook UpdateExtraButtons, hook Blizzard_CombatLog_QuickButton_OnClick |
| Modules/WindowsTabs.lua | 2 | hook AddTab, hook EquipmentFlyout_UpdateItems |
| Modules/WindowsTown.lua | 2 | hook UpdateItems, hook MasterLooterFrame_UpdatePlayers |
| Modules/MenuStrip.lua | 3 | hook Layout, hook SetCollapsed, hook Update |
| Modules/GameTools.lua | 3 | hook RefreshLayout, hook Update, hook SetupSessionWindow |
| Modules/GameAlerts.lua | 1 | hook AddMessage |
| Modules/Tooltips.lua | 1 | hook GameTooltip_SetDefaultAnchor |
| Modules/Chat.lua | 1 | after(): `"hook " .. tostring(name)` (covers its four callers) |
| Modules/ChatExtras.lua | 3 | hook AddMessage, hook FCF_OpenTemporaryWindow, click copy chat |
| Modules/ChatWatch.lua | 1 | click chat watch toast |
| Modules/CastBars.lua | 2 | hook UpdateBarFillTexture, hook PlayFadeAnim |
| Modules/DataBars.lua | 2 | hook Show, hook SetShown |

Total 32: 13 in task 1, 10 in task 2, 9 in task 3. The 02-05 `hooksecurefunc` type check on ChatExtras' `AddMessage` line is kept; `HookScript("OnMouseWheel")`, other `SetScript` kinds and `OnUpdate` drivers were not touched. No line was added to any function (every change is inline on the existing line), and the quality scan passes.

## Verification

| Check | Result |
| ----- | ------ |
| Task 1 area files (8), `coverage/p2-11-01-area.log` | 8 files / 101 tests passed |
| Task 2 area files (5), `coverage/p2-11-02-area.log` | 5 files / 154 tests passed |
| Task 3 area files (6), `coverage/p2-11-03-area.log` | 6 files / 170 tests passed |
| `npm run test:quick` after tasks 1 and 2 | exit 0 |
| `grep -c "ns.Guard("` per file | Windows 4, WindowsMap 3, WindowsSocial 1, WindowsSystem 3, WindowsTabs 2; WindowsTown 2, MenuStrip 3, GameTools 3, GameAlerts 1, Tooltips 1; Chat 1, ChatExtras 3, ChatWatch 1, CastBars 2, DataBars 2 |
| Unguarded `hooksecurefunc(`, `SetScript("OnClick"`, `C_Timer.After/NewTimer/NewTicker(` in the 15 files | none |
| Full `npm test`, `coverage/p2-11-03-full.log` | exit 0, 69 files / 897 tests passed |
| `npm run coverage` | exit 0, Lua line coverage 19058/19058 100.00% |
| `npm run quality`, `npm run lint`, `luac5.1 -p` per task's files | pass (lint 0 warnings / 0 errors in 114 files) |

The plan's verify blocks use `!` negations and pipes; each condition was run as a separate command and its exit status or count read. The `! grep ... | grep -v` check was run as `grep ... | grep -v "ns.Guard("` and the empty result was read as "none left". `grep -c` was used in place of `grep -n` to read the per-file counts.

## D-04 tally

Cases turned red by these conversions: 0. New unexpected errors: 0. No test file was edited and no addon change beyond the wrapping was needed. Phase total (5 root causes R1 to R5 from `02-07-SUMMARY.md`; 02-08, 02-09 and 02-10 added 0) plus this plan: 5, well under the limit of about 20.

## Full-run failures

None. The single full `npm test` run (and the later `npm run coverage` run) passed on the first attempt, 69 files / 897 tests.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was run once in the fresh worktree (vitest was missing).
- The branch was fast-forwarded to `bea7c32` first, as instructed by the orchestrator.
- Files were read around their hook sites (and in full for the regions edited) rather than top to bottom, because each change is a one-line wrap of an argument; the edited lines were located by grep with context.
- The plan commit ledger file (`gsd-plan-head-before-02-11` under the worktree git dir) was written by hand with the fast-forward target; `git rev-list --count bea7c32..HEAD` gave 3 for the code commits. The SUMMARY commit follows them.
- Extra check not in the plan: `npm run coverage` (CLAUDE.md requires it before calling a change done); it passed at 100%.
- Labels chosen where the plan left them open: "click copy chat" for the copy button, "click chat watch toast" for the toast. WindowsSocial's `after()` uses its existing `key` local as the plan said.

## Known Stubs

None.

## Threat Flags

None. T-02-21: no site builds a message from the hooked arguments and the guard adds no printing of its own. T-02-33 (hot hooks) is accepted and listed below for the in-game perf check.

## Needs in-game check

- `/vg perf` in busy chat (trade, a raid) and with the data bars toggling: no visible cost from the guarded `AddMessage` (ChatExtras, GameAlerts), `Show` and `SetShown` (DataBars) hooks.
- Chat copy button, chat-watch toasts and temporary whisper windows still behave as before.

## Self-Check: PASSED

- All 15 Modules files carry the converted lines (grep counts above).
- Commits `f0e240b`, `8497337` and `957ec94` are on `worktree-agent-ac2bf9aef20d04f82`.
