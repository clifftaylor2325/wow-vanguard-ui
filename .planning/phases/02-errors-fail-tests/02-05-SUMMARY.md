---
phase: 02-errors-fail-tests
plan: 05
subsystem: testing
tags: [error-guard, chat-extras, fixtures, expectErrors]
requires: [02-01]
provides:
  - "ChatExtras skips its AddMessage hook and link watcher on a client without hooksecurefunc or EventRegistry:RegisterCallback"
  - "more, tooltip, frames, profiles, windows-map and windows-menus pass under VG_ERROR_GUARD=1"
affects: [02-07]
key-files:
  modified:
    - Modules/ChatExtras.lua
    - scripts/tests/tooltip.test.mjs
    - scripts/tests/frames.test.mjs
    - scripts/tests/more.test.mjs
key-decisions:
  - "R4 was a fixture that strips unit globals from a bare client, not UNITS_ENV: the six collateral modules are switched off in that client; UNITS_ENV and helpers.mjs are unchanged"
  - "Markers for the wow-world.lua position use an anchored pattern with a digit run, because that file is edited by another plan this wave"
requirements-completed: [CI-04]
status: complete
duration: about 35 min
completed: 2026-10-10
commits: 3
plan_head_before: 3d492c33eb2d079efa0d7b11923862ee4ccc57b7
plan_head_after: 950504cbd71b80ad36b70380316104fb30354126
actuals:
  tokens: 1500
  tasks: 3
  commits: 3
---

# Phase 2 Plan 05: Chat, tooltip, frames and "more" tests leave no stray errors Summary

ChatExtras now skips the hooks it cannot make instead of failing to enable, the Enum and hooksecurefunc fixtures match the client, and the three deliberate entries are named with anchored `expectErrors` patterns, so six test files pass under `VG_ERROR_GUARD=1`.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 2-05-01 | 2165ee0 | chat: ChatExtras skips its hook and link watcher on a client without them |
| 2-05-02 | 3ba5895 | tests: Enum and hooksecurefunc fixtures match the client |
| 2-05-03 | 950504c | tests: the AFK bare client keeps its other modules off, and the deliberate entries are named |

## What changed

- `Modules/ChatExtras.lua` (the only addon change): `watchWindow` hooks `AddMessage` only when `type(hooksecurefunc) == "function"`; `watchLinks` returns early unless `registry.RegisterCallback` is a function. Both extend an existing condition, so no line was added, function lengths are unchanged, and behaviour on a client with both calls is unchanged. Nothing a player sees changes, so no README sentence was edited.
- R1 (Enum): `tooltip.test.mjs:11`, `frames.test.mjs:8` and `more.test.mjs` (DPS_ENV, the two `addon.eval`/`bare.eval` lines at 1138 and 1162) now extend `Enum` instead of replacing it. The case at `more.test.mjs:1140` that set `Enum = nil` now removes only `DamageMeterSessionType` and `DamageMeterType`; its assertion ("without the client's enums the meter is not asked") is unchanged and still passes.
- R2 (hooksecurefunc): the BOSS_ENV fixture (`more.test.mjs:1641`) accepts the `(name, fn)` form like the stub and leaves a missing function alone. The other test-local fixtures left no error and were not touched.
- R4 (AFK): see Deviations. The "bare" client in the AFK case now has the six modules that need the stripped unit calls switched off in its saved variables.

## Per-case marker list

| File | Case | Matcher |
| ---- | ---- | ------- |
| `scripts/tests/more.test.mjs` | game menu button: falls back, or goes without what the menu lacks | `/^GameMenu: wow-world\.lua:\d+: CreateFrame: unknown template NoSuchTemplate$/` |
| `scripts/tests/more.test.mjs` | game windows: one skin that fails is reported and the other windows... | `/^window CharacterFrame: eval:\d+: TEST-ONLY skin failure$/` |
| `scripts/tests/tooltip.test.mjs` | item tooltips: other modules' lines come after the tooltip's own... | `/^tooltip lines: eval:\d+: TEST-ONLY broken line$/` |

Each is fully anchored and varies only in a digit run; `expectErrors` also fails the case if a matcher sees no entry.

## D-04 tally

Distinct unexpected errors: 4 root causes, all known; none unknown, so the stop thresholds (more than 5 unknown root causes, or a large addon fix) were not approached. The one addon fix is 2 changed lines in one file.

| Root cause | Texts | Cases | Disposition |
| ---------- | ----- | ----- | ----------- |
| R1 Enum replaced | `debuff type colors` / `aura icon extras`: `Core/AuraEngine.lua:122: attempt to index a nil value (field 'CustomAuraButtonDispelTypeTextureStyle')` | frames pass; tooltips; item tooltips (3 cases); the two info strip DPS cases | fixture fixed (commit 3ba5895) |
| R2 hooksecurefunc fixture | `module Chat/ChatExtras/Tooltips: eval:30: attempt to index a string value (local 't')` | both boss frames cases | fixture fixed (3ba5895) |
| R3 ChatExtras without hooksecurefunc / RegisterCallback | `module ChatExtras: ...` | profiles, windows-map, windows-menus, more (Edit Mode case) | addon fixed (2165ee0) |
| R4 AFK bare client | `module UnitFrames/ComboPoints/ClassBars/SwingTimer/InfoStrip: ... attempt to call a nil value (global 'UnitClass')`, `module Inventory: ... (global 'UnitName')` | the AFK screen "clicks, keys and fights" case | fixture fixed (950504c) |
| Deliberate | the three texts in the marker table | 3 cases | named with expectErrors (950504c) |

## Deviations from Plan

**1. [R4 cause differs from the plan's theory]** The plan expected `UNITS_ENV` to error for units it does not list. It did not: the six errors came from the case's last part (`more.test.mjs` "bare" client), which sets `UnitName`, `UnitLevel`, `UnitClass` and `UnitXP` to nil on a client with no `UNITS_ENV`. A client without `UnitClass` cannot enable those six modules, and the card (the case's point) does not depend on them. I switched those modules off in that client's saved variables. I did not change `UNITS_ENV`, so `helpers.mjs` is untouched and no other file could shift. A marker was the plan's alternative; I chose the fixture change because it avoids a marker that names six unrelated module errors with brittle line numbers. If the user prefers the marker, it is a one-line swap.

**2. [Pattern for a wow-world.lua position]** The plan allowed a pattern only for `eval:<line>`. The NoSuchTemplate entry carries `wow-world.lua:<line>` (1508 today). Plan 02-03 edits `wow-world.lua` this wave, so an exact line would break after merge; I used an anchored pattern whose only variable part is that digit run.

No other deviations. `UNITS_ENV` still has `u(unit).hp`-style indexing that would error for an unlisted unit; no test reached it, so it is left alone.

## Verification

- Task 1: `VG_ERROR_GUARD=1` profiles, windows-map, windows-menus: 3 files, 40 tests pass. `more` and `chatwatch` unguarded: 119 pass. `npm run lint` 0 warnings / 0 errors in 114 files. `luac5.1 -p Modules/ChatExtras.lua` exit 0. `npm run quality` OK.
- Task 2: tooltip, frames, more unguarded: 116 pass. `VG_ERROR_GUARD=1` frames: 3 pass. Guarded tooltip + more log (`coverage/p2-more-t2.log`): 4 failures (the AFK case and the three deliberate cases), zero matches for `attempt to index a string value`, `debuff type colors`, `aura icon extras`. `npm run quality` OK.
- Task 3: `VG_ERROR_GUARD=1` more, tooltip, frames, profiles, windows-map, windows-menus: 6 files, 156 tests pass. `npm test` (no variable): 69 files, 897 tests pass. `npm run quality` OK.
- The verify blocks ran as separate commands; the `! grep` lines were run as `grep -c` and read as 0. `npm run coverage` was not run: no addon line was added (task 1 only extended two conditions).
- `npm ci` was run once in the worktree.

## Known Stubs

None.

## Needs in-game check

None required. The ChatExtras guards only skip work when a client call is missing; the real client has both calls and the harness shows unchanged behaviour with them present. I did not observe the game.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: Modules/ChatExtras.lua, scripts/tests/more.test.mjs, scripts/tests/tooltip.test.mjs, scripts/tests/frames.test.mjs
- FOUND commits: 2165ee0, 3ba5895, 950504c (ancestors of HEAD)
