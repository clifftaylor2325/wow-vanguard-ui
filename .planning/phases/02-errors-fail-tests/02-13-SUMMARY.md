---
phase: 02-errors-fail-tests
plan: 13
subsystem: testing
tags: [code-quality, ns.Guard, debugstack, error-guard, shuffle-smoke, phase-gate, ci-03, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "ns.Guard (02-01), the always-on guard (02-07), every hook, click and timer conversion (02-08 to 02-12)"
provides:
  - "A code-quality rule (rule 4) that fails npm run quality on a bare hooksecurefunc, SetScript OnClick or C_Timer.After/NewTimer/NewTicker callback in Core/ or Modules/"
  - "The test client's debugstack, so an entry kept in tests carries its stack and the guard's failure message prints it"
  - "The phase gate record: verify, coverage 100%, lint, and the quick project shuffled under seeds 4242, 1, 2, 3"
affects: [phase-2-verification]
tech-stack:
  added: []
  patterns: ["token-based Lua rule: call found by name, arguments split at depth-1 commas with function/if/do/repeat blocks counted as nesting"]
key-files:
  created: []
  modified:
    - scripts/lib/code-quality.mjs
    - scripts/code-quality.test.mjs
    - scripts/check-code-quality.mjs
    - README.md
    - scripts/lib/wow-world.lua
    - scripts/tests/core.test.mjs
    - scripts/tests/errorrail.test.mjs
key-decisions:
  - "The rule is token-based (tokenizeLua, comments dropped) so a callback on the next line or a function body with its own commas is read correctly."
  - "The only exception is Core/Combat.lua's C_Timer.After whose callback contains runSoon (ns.Soon, which runs each job under ns.Try)."
  - "The one test that assumed the stub had no debugstack was made explicit (debugstack = nil in its own fixture) in a commit before the stub change."
requirements-completed: [CI-04, CI-03]
status: complete
commits: 4
plan_head_before: fb5eedb9bca1c48e56edee3b8a25950d3af265f6
plan_head_after: c661d1daf9cc7ef947ed20e9629151bc0412ec36
actuals:
  tokens: 4000
  tasks: 3
  commits: 4
---

# Phase 2 Plan 13: Quality rule, stub debugstack and the phase gate Summary

`npm run quality` now fails on any `hooksecurefunc`, `SetScript("OnClick", ...)` or `C_Timer.After/NewTimer/NewTicker` in `Core/` or `Modules/` whose callback is not an `ns.Guard(...)` call (the repo passes it, apart from `ns.Soon`'s timer), the test client has a `debugstack` so caught errors carry a stack that the guard's message prints, and the phase gate is green on the final tree.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-13-01 | Code-quality rule: no bare hook, OnClick or raw timer callback in addon Lua (+ README sentence) | cdd7eec |
| 2-13-02 | The no-stack event case says it has no debugstack (tests, first) | ed1f639 |
| 2-13-02 | The test client gets a debugstack (harness) | 156bafa |
| 2-13-03 | The guard's failure message shows the stack of a caught error | c661d1d |

Four code commits for three tasks: task 2 is two commits, as its step 3 requires when a test assumed no stack.

## What changed

- `scripts/lib/code-quality.mjs`: rule 4. A call is found by name (`hooksecurefunc(`, `SetScript("OnClick"`, `C_Timer.After|NewTimer|NewTicker(`), its top-level arguments are split at depth-1 commas (brackets and `function/if/do/repeat ... end/until` blocks count as nesting), the callback is the last argument (second for `SetScript`) and must begin `ns.Guard(`. A literal `nil` passes for OnClick. Exception: `Core/Combat.lua` only, `C_Timer.After` whose callback contains `runSoon`. Applies within `Core/` and `Modules/` only; comments, strings and `type(hooksecurefunc)` checks are ignored.
- `scripts/code-quality.test.mjs`: nine named, commented tests covering every behaviour line of the plan, including a bare timer in `Core/Combat.lua` that still fails and the Soon timer elsewhere that fails.
- `scripts/check-code-quality.mjs`: header and OK line mention the rule; the OK line keeps its prefix (`OK  every function is documented and at most 10 lines; ...; hooks, clicks and timers run under ns.Guard`).
- `README.md`: the `/vg errors` line now ends "... event handler, after-combat update, hook on a game function, button click or timer is kept here and doesn't stop the others". This is the README sentence for the behaviour plans 02-01 and 02-08 to 02-12 changed.
- `scripts/lib/wow-world.lua`: `function debugstack(start)` next to `hooksecurefunc`, built from `debug.traceback("", start + 1)` with the `stack traceback:` header removed. Client source: Gethe/wow-ui-source branch `forever` (head 9437644), `Interface/AddOns/Blizzard_ScriptErrors/Blizzard_ScriptErrors.lua` lines 53 to 63 (`local stack = debugstack(debugStackLevel)`), also `Blizzard_CooldownViewer/CooldownViewer.lua`. That it exists on the Forever game client itself is not verified in game (research A3).
- `scripts/tests/core.test.mjs`: one fixture (`events: on a client without debugstack or an error handler, the error is still kept`) now sets `debugstack = nil`. No assertion changed.
- `scripts/tests/errorrail.test.mjs`: new case: a guarded hook raises `error("TEST-ONLY stack")`; `caught(addon)` holds the entry with a stack matching `eval:\d+`; `check([addon], [])` throws with the entry text followed by `stack:` and its frames; the entry is named with `expectErrors(/^hook TEST-ONLY: eval:\d+: TEST-ONLY stack$/)`.

## Verification

Plan verify blocks were run one command at a time (the harness refuses compound commands); every condition was read from its output or exit status.

| Check | Result |
| ----- | ------ |
| `npm test -- scripts/code-quality.test.mjs` | 35 passed |
| `npm run quality` on the whole repo | exit 0, OK line with the new suffix |
| Spot check: `ns.Guard(` stripped from `Core/Controls.lua`, `Modules/Bags.lua`, `Modules/AuctionHelper.lua` in memory | rule reports 19 bare callbacks |
| `grep -F "hook on a game function, button click or timer" README.md` | found |
| `npm run test:quick` after task 1 | 10 files / 149 tests passed |
| Dry run of `npm test` with the stub change on the old tests (`coverage/p2-13-02-dry.log`) | 1 failed (the no-stack event case), 905 passed |
| `npm test -- scripts/tests/core.test.mjs` after the test-only commit | 50 passed |
| `grep -n "function debugstack" scripts/lib/wow-world.lua` | line 158 |
| `npm test` after the stub commit (`coverage/p2-13-02-full.log`) | 69 files / 906 tests passed |
| `npm test -- scripts/tests/errorrail.test.mjs` | 7 passed |

## Phase gate

All on the final tree (HEAD `c661d1d`), after `npm ci`; logs under `coverage/`.

| Command | Result |
| ------- | ------ |
| `npm ci` | exit 0 |
| `npm run verify` (`p2-13-verify.log`) | exit 0: 69 files / 907 tests passed, then `OK  every function is documented and at most 10 lines; colors and text sizes come from the theme; hooks, clicks and timers run under ns.Guard` |
| `npm run coverage` (`p2-13-coverage.log`) | exit 0: 69 files / 907 tests passed; `Lua line coverage (floor 100%)` total `19058/19058 100.00%` |
| `npm run lint` | exit 0: 0 warnings / 0 errors in 114 files |
| `VG_SHUFFLE_SEED=4242 npm run test:quick` (`p2-final-shuffle.log`) | exit 0, line `Running tests with seed "4242"` present; 10 files / 149 tests |
| `VG_SHUFFLE_SEED=1 npm run test:quick` | exit 0, `Running tests with seed "1"`; 10 files / 149 tests |
| `VG_SHUFFLE_SEED=2 npm run test:quick` | exit 0, `Running tests with seed "2"`; 10 files / 149 tests |
| `VG_SHUFFLE_SEED=3 npm run test:quick` | exit 0, `Running tests with seed "3"`; 10 files / 149 tests |

Test count: 897 before this plan, 907 after (nine quality tests, one errorrail case).

Per D-05 only the quick project was shuffled; no shuffled full Lua run was made, and nothing here claims a hosted-runner result. The first green hosted shuffled run stays open.

### Completeness listing (from plan 02-12, re-proven by the new rule)

02-12 recorded: no `hooksecurefunc(` or `SetScript("OnClick"` without `ns.Guard(` in `Core/` and `Modules/`, and the only raw timer left is `Core/Combat.lua:118  if not waiting then C_Timer.After(0, function() runSoon(key) end) end`. That listing is now enforced: `npm run quality` exits 0 on the whole repo with the rule on, and the Soon exception is limited to that file and that callback.

## D-04 tally (phase)

Total distinct unexpected root causes in Phase 2: **5**, under the limit of about 20. Summed once per root cause from `02-07-SUMMARY.md` (which already sums 02-01 and 02-03 to 02-06) and `02-08-SUMMARY.md` to `02-12-SUMMARY.md`, plus this plan.

| Plan | Root causes |
| ---- | ----------- |
| 02-01 | 0 (its one entry, `RaidFrames: attempt to index a nil value` in feedback.test.mjs, is deliberate and was marked in 02-06) |
| 02-02 | no tally recorded |
| 02-03 to 02-06 (as summed in 02-07) | 5: R1 (fixtures replaced `Enum`, `Core/AuraEngine.lua:122` indexed nil), R5 (same replacement, read by the stub's `UnitPowerMax`), R2 (`hooksecurefunc` fixture handled only the table form), R3 (ChatExtras without `hooksecurefunc` / `RegisterCallback`, addon fixed, 2 lines), R4 (AFK bare client without `UnitClass` / `UnitName`, fixture fixed) |
| 02-07 | 0 |
| 02-08, 02-09, 02-10, 02-11, 02-12 | 0 each |
| 02-13 (this plan) | 0: the new rule found nothing in the repo, and the stub `debugstack` turned exactly one case red, a case that relied on the stub having no stack (made explicit; not an addon error) |

Judgement calls still open for the user, copied from earlier summaries and not decided here: the `TEST-ONLY: no cooldown frames` markers (02-03), the `Core/AuraEngine.lua:122` dispel-style entry marked as deliberate in 02-04 (if it is read as a missing nil check in `E.RegisterDispel` it needs a decision), and the R4 fixture-vs-marker choice (02-05).

## Full-run failures

None in this plan. The dry run of `npm test` with the stub change failed one case (the expected no-stack case), which was fixed in its own commit; the later full runs (`npm test`, `npm run verify`, `npm run coverage`) each passed on the first attempt. No other failure was seen in any full run, so there was nothing to re-run or investigate.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was run once at the start (vitest was missing in the fresh worktree), and again for the gate as the plan says.
- The branch was fast-forwarded to `fb5eedb` first, as instructed.
- The plan verify blocks were run as separate commands (the harness refuses compound commands); the 4242 shuffle log is `coverage/p2-final-shuffle.log` as in the plan, and the seeds 1, 2 and 3 logs are `coverage/p2-final-shuffle-1.log` to `-3.log` (the plan prints them without a log).
- The stub change was set aside with a copy in the scratchpad and `git checkout -- scripts/lib/wow-world.lua` (no `git stash`), then restored with `cp` after the test-only commit.
- Task 2 produced two commits (tests, then harness) because the dry run showed one case that assumed no stack; this is the plan's step 3.
- `debugstack` in the stub treats a missing `start` as 1.
- The in-memory spot check of the rule on real files (strip `ns.Guard(`) is an extra, not in the plan.

## Known Stubs

None.

## Threat Flags

None. T-02-23: the exception is limited to `Core/Combat.lua` and a `C_Timer.After` whose callback contains `runSoon`; a self-test shows another bare timer in the same file still fails. T-02-24: no assertion loosened; the test change is its own earlier commit and the stub commit cites the client source. T-02-25 accepted (stack text only in test logs). T-02-SC: `npm ci` only, no package added.

## Needs in-game check

Combined list, ordered by crash risk (money path and combat paths first). Nothing below was observed in game.

1. Auction Post (item and commodity), Buy and Cancel from Vanguard's buttons still work after their handlers run under `ns.Try` (research A1, hardware-event status inside `xpcall`); the headless hardware counter passes, only the real client can confirm (02-08).
2. A throwing post-hook does not affect Blizzard's own `SetPostItem` call in the real client (02-01, T-02-02; already on the Phase 5 list).
3. Raid tools: ready check and role poll buttons, Pull (left and right click) and the raid target icons in a group; the world-marker buttons still work in combat (02-12).
4. The Reload button in the options footer and the reload dialog still reload out of combat on Forever (the secure overlay), and in combat still say to type `/reload`; the game menu's Vanguard button and the error badge click still open what they did (02-10).
5. Quest dialog accept, complete and choose-reward from Vanguard's dialog; quest log buttons and tracker collapse and titles still respond (02-12).
6. Errands "Train all", Restock buying (`/vg stock`), merchant junk selling and the bag Sort button (02-09).
7. Click-cast options (picker rows, ranks chevron, cells, test tile), talent planner plan mode and the minimap button drawer toggle (02-12).
8. Chat copy button, chat-watch toasts and temporary whisper windows (02-11).
9. `/vg perf` cost of the guarded hot hooks: bag slot `SetVertexColor` and `Hide` (02-09, T-02-18), `AddMessage` in busy chat and `Show` / `SetShown` on data bars (02-11, T-02-33), `SetPoint`, `SetAlpha` and `SetChecked` while dragging movers (02-10, T-02-31), and the auction hooks while browsing (02-08).
10. `debugstack` exists in the Forever client and `/vg errors` shows a stack for a caught error (research A3; this plan's stub follows Blizzard's `forever` branch source, not an observation of the game).
11. D-06: on the Forever client, does Vanguard show the error badge at login because of the aura-container fallback notice? If it does, a separate notice channel moves up the list (02-04, 02-07).

## Self-Check: PASSED

- Files exist: `scripts/lib/code-quality.mjs`, `scripts/code-quality.test.mjs`, `scripts/check-code-quality.mjs`, `README.md`, `scripts/lib/wow-world.lua` (`function debugstack` at line 158), `scripts/tests/core.test.mjs`, `scripts/tests/errorrail.test.mjs`.
- Commits `cdd7eec`, `ed1f639`, `156bafa` and `c661d1d` are ancestors of HEAD on `worktree-agent-a6f2383c8e4a0ba78`.
