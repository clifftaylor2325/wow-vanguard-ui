---
phase: 02-errors-fail-tests
plan: 12
subsystem: testing
tags: [error-guard, ns.Guard, hooks, clicks, timers, quests, minimap, raid, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "ns.Guard (02-01), the always-on test guard (02-07), earlier conversions (02-08 to 02-11)"
provides:
  - "28 hook, OnClick and raw timer callbacks in the nameplate, swing timer, quest, tracker, broker, click-cast options, instance prep, minimap, raid tools, talent planner, fight history and raid status modules reporting to ns.errors and /vg errors"
  - "repo-wide completeness: no bare hooksecurefunc or SetScript OnClick in Core/ or Modules/; the only bare raw timer is ns.Soon's in Core/Combat.lua"
affects: [02-13]
tech-stack:
  added: []
  patterns: ["wrap only the callback argument with ns.Guard at install time, on the same line as the call"]
key-files:
  created: []
  modified:
    - Modules/Nameplates.lua
    - Modules/SwingTimer.lua
    - Modules/QuestLog.lua
    - Modules/QuestLogView.lua
    - Modules/QuestDialogView.lua
    - Modules/QuestTrackerView.lua
    - Modules/BrokerStrip.lua
    - Modules/ClickCastOptions.lua
    - Modules/InstancePrep.lua
    - Modules/Minimap.lua
    - Modules/MinimapButtons.lua
    - Modules/RaidTools.lua
    - Modules/TalentPlanner.lua
    - Modules/FightHistory.lua
    - Modules/RaidStatus.lua
key-decisions:
  - "Labels follow 'hook <Name>', 'click <what>', 'timer <what>'; no loop index in any label."
requirements-completed: [CI-04]
status: complete
commits: 3
plan_head_before: fff76b67d53c6abb4f952ae3f4cda4b00cb99cc3
plan_head_after: dea591e5fd73e8a80bf22dd210c1e95571040ef8
actuals:
  tokens: 900
  tasks: 3
  commits: 3
---

# Phase 2 Plan 12: Last hook, click and timer conversions Summary

Twenty-eight callbacks (3 hooks, 22 OnClick handlers, 3 raw timers) now run under `ns.Guard`, and a repo-wide listing shows no other bare `hooksecurefunc`, `SetScript("OnClick")` or raw `C_Timer` call left in `Core/` and `Modules/` apart from `ns.Soon`'s timer in `Core/Combat.lua`. Only the callback argument changed at each site; no test file was edited.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-12-01 | Nameplate, swing timer and quest view hooks and clicks run under ns.Guard | 46c4cbf |
| 2-12-02 | Tracker, broker, click-cast options, instance prep and minimap clicks run under ns.Guard | 411826c |
| 2-12-03 | Minimap buttons, raid tools, talent planner, fight history and raid status run under ns.Guard | dea591e |

## Converted sites

| File | Sites | Labels |
| ---- | ----- | ------ |
| Modules/Nameplates.lua | 1 | hook UpdateHitTestArea |
| Modules/SwingTimer.lua | 1 | hook ApplyRangePresentation |
| Modules/QuestLog.lua | 2 | click quest log toggle, hook ToggleQuestLog |
| Modules/QuestLogView.lua | 3 | click close quest log, click quest log button, click quest log line |
| Modules/QuestDialogView.lua | 4 | click quest dialog primary, click quest dialog secondary, click quest dialog line, click quest reward choice |
| Modules/QuestTrackerView.lua | 2 | click quest tracker collapse, click quest tracker title |
| Modules/BrokerStrip.lua | 1 | click broker feed |
| Modules/ClickCastOptions.lua | 5 | click spell picker item, click spell picker ranks, click close spell picker, click click-cast cell, click click-cast test tile |
| Modules/InstancePrep.lua | 1 | click close instance prep |
| Modules/Minimap.lua | 1 | click minimap world map |
| Modules/MinimapButtons.lua | 2 | click minimap button drawer, timer minimap button rescan |
| Modules/RaidTools.lua | 2 | click raid tools button, click raid target icon |
| Modules/TalentPlanner.lua | 1 | click talent plan |
| Modules/FightHistory.lua | 1 | timer fight history record |
| Modules/RaidStatus.lua | 1 | timer ready check linger |

Total 28: 11 in task 1, 10 in task 2, 7 in task 3 (3 hooks, 22 clicks, 3 timers).

Left alone on purpose: the secure quest item button in QuestTrackerView and the secure world-marker and clear buttons in RaidTools (no OnClick of ours, nothing converted; no in-scope OnClick on a secure template frame was found); TalentPlanner's `after(...)` calls through its local `C_Timer.After` alias (already under `ns.Try`); `HookScript`, other `SetScript` kinds and `OnUpdate` drivers. RaidTools' action buttons (`ns.DialogButton`) and target icons (`iconButton(bar, nil, ...)`) are insecure, and the handlers still run synchronously in the click's call stack, so hardware-event paths are unchanged.

## Completeness listing (Task 3)

```
grep -rnE 'hooksecurefunc[(]|SetScript[(]"OnClick"' Core Modules | grep -v "ns.Guard("
  (empty)
grep -rnE 'C_Timer[.](After|NewTimer|NewTicker)[(]' Core Modules | grep -v "ns.Guard("
  Core/Combat.lua:118:  if not waiting then C_Timer.After(0, function() runSoon(key) end) end
```

Only the allowed exception (`ns.Soon`) is listed. A wider extra grep (`C_Timer.After|NewTimer|NewTicker` without the call paren, `= hooksecurefunc`, any `"OnClick"`) added only type checks (`type(C_Timer.After) ~= "function"`), two `GetScript("OnClick")(...)` calls (Core/OptionsWindow.lua:581, Modules/AuctionShop.lua:957, which call an existing script and install nothing), and TalentPlanner's two `local after = ... C_Timer.After` aliases (out of scope, under `ns.Try`).

## Verification

| Check | Result |
| ----- | ------ |
| Task 1 area files (4), `coverage/p2-12-01-area.log` | 4 files / 104 tests passed |
| Task 2 area files (6), `coverage/p2-12-02-area.log` | 6 files / 140 tests passed |
| Task 3 area files (5), `coverage/p2-12-03-area.log` | 5 files / 37 tests passed |
| `grep -c "ns.Guard("` per task | T1: Nameplates 1, SwingTimer 1, QuestLog 2, QuestLogView 3, QuestDialogView 4; T2: QuestTrackerView 2, BrokerStrip 1, ClickCastOptions 5, InstancePrep 1, Minimap 1; T3: MinimapButtons 2, RaidTools 2, TalentPlanner 1, FightHistory 1, RaidStatus 1 |
| Unguarded `hooksecurefunc(`, `SetScript("OnClick"`, `C_Timer.After/NewTimer/NewTicker(` in each task's files | none |
| `npm run test:quick` after tasks 1 and 2 | exit 0 |
| `npm run quality`, `npm run lint`, `luac5.1 -p` per task's files | pass |
| Full `npm test`, `coverage/p2-12-03-full.log` | exit 0, 69 files / 897 tests passed |
| `npm run coverage` (extra, CLAUDE.md) | exit 0, Lua line coverage 19058/19058 100.00% |

The plan's verify blocks use `!` negations and pipes; each condition was run as a separate command and its output read (the `! grep ... | grep -v` checks were run as `grep ... | grep -v "ns.Guard("` and the empty result read as "none left"). `grep -c` was used for per-file counts in addition to `grep -n`.

## D-04 tally

Cases turned red by these conversions: 0. New unexpected errors: 0. No test file was edited and no addon change beyond the wrapping was needed. Phase total: the 5 root causes (R1 to R5) from `02-07-SUMMARY.md`, plus 0 from 02-08 to 02-11, plus 0 here = 5, well under the limit of about 20.

## Full-run failures

None. The single full `npm test` run (and the later `npm run coverage` run) passed on the first attempt, 69 files / 897 tests.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was run once in the fresh worktree (vitest was missing).
- The branch was fast-forwarded to `fff76b6` first, as instructed by the orchestrator.
- The plan commit ledger file under the worktree git dir could not be written (the harness refuses writes to that path), so `commits:` was measured with `git rev-list --count fff76b67d53c6abb4f952ae3f4cda4b00cb99cc3..HEAD` (3 code commits, taken before this SUMMARY commit).
- Extra check not in the plan: `npm run coverage` (CLAUDE.md requires it before calling a change done); it passed at 100%.
- Labels chosen where the plan left them open: "click quest log toggle", "click close quest log", "click quest dialog line", "click broker feed", "click spell picker item" and the others in the table above.
- Files named by each task were read top to bottom (Core/Events.lua, Nameplates, SwingTimer, QuestLog, QuestLogView, QuestDialogView, QuestTrackerView, BrokerStrip, InstancePrep, Minimap, ClickCastOptions in two parts, MinimapButtons, RaidTools, TalentPlanner in two parts, FightHistory, RaidStatus) before editing.

## Known Stubs

None.

## Threat Flags

None. T-02-22: the guarded handlers still run synchronously inside the click's own call stack (nothing moved to a timer). T-02-35: no OnClick was set on a secure template frame; the world-marker buttons and the quest item button are untouched. T-02-36: the guard's error text goes through `errorText()`, which names a hidden error instead of reading it.

## Needs in-game check

- Raid tools: the ready check and role poll buttons, Pull (left and right click) and the raid target icons still work in a group; the world-marker buttons still work in combat.
- Quest dialog: accept, complete and choose-reward still work from Vanguard's dialog; the quest log buttons and quest tracker collapse and titles still respond.
- Talent planner clicks (plan mode) and the minimap button drawer toggle still behave as before.
- Click-cast options: picker rows, ranks chevron, cells and the test tile still respond.

## Self-Check: PASSED

- All 15 Modules files carry the converted lines (grep counts above).
- Commits `46c4cbf`, `411826c` and `dea591e` are on `worktree-agent-aa84eb2a75c2757aa`.
