---
phase: 02-errors-fail-tests
plan: 01
subsystem: testing
tags: [error-guard, ns.Guard, ns.Try, vitest, lua-harness]
requires: []
provides:
  - "ns.Guard(where, fn) in Core/Events.lua"
  - "the SetPostItem hook under ns.Guard (Post path)"
  - "scripts/lib/error-guard.mjs (expectErrors, takeExpected, caught, judge, check)"
  - "createdAddons registry and ns.ClearErrors harvest in lua-harness.mjs"
  - "global afterEach in scripts/tests/setup.mjs (judges only with VG_ERROR_GUARD=1)"
  - "expectErrors and AURA_FALLBACK exports in scripts/tests/helpers.mjs"
affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns: ["Symbol.for globals shared between setup.mjs and the harness", "ns.Guard wraps callbacks through ns.Try"]
key-files:
  created:
    - scripts/lib/error-guard.mjs
    - scripts/error-guard.test.mjs
    - scripts/tests/errorrail.test.mjs
  modified:
    - Core/Events.lua
    - Modules/AuctionSell.lua
    - scripts/lib/lua-harness.mjs
    - scripts/tests/setup.mjs
    - scripts/tests/helpers.mjs
key-decisions:
  - "Judging is opt-in (VG_ERROR_GUARD=1) until plan 02-07; draining the registry is unconditional"
  - "No metatable on ns.errors; the 20-entry cap stays a known blind spot for marked tests only"
requirements-completed: [CI-04, CI-03]
status: complete
duration: about 40 min
completed: 2026-10-10
commits: 2
plan_head_before: f5e3c47aa4f18eb18322128cafa83a984b6b0972
plan_head_after: 398df0e92feb97f8bda68c98de02eddc4be055d3
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 2 Plan 01: Error guard tracer Summary

A throwing `SetPostItem` hook now lands in `ns.errors` as `hook SetPostItem: <message>` instead of escaping the bag click, and a global `afterEach` (opt-in until plan 02-07) fails any test that leaves an error it did not name with `expectErrors`.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 2-01-01 | 797a0a6 | core: ns.Guard on the SetPostItem hook, with the error guard behind it |
| 2-01-02 | 398df0e | harness: unit tests for the guard; clicks, timers, harvest and the aura notice proved |

## What was built

- `ns.Guard(where, fn)` (Core/Events.lua, after `ns.Try`): non-function returned unchanged, otherwise a wrapper that calls `ns.Try(where, fn, ...)` and returns nothing. No second list, no bare pcall.
- `Modules/AuctionSell.lua`: the `SetPostItem` post-hook runs under `ns.Guard("hook SetPostItem", ...)`; `AH.BuildSell` stays at 9 body lines.
- `createAddon` calls `track(addon)`: pushes the addon on `createdAddons` (the array at `globalThis[Symbol.for("vanguard.addons")]`) and installs a `ns.ClearErrors` wrapper that copies the forgotten entries into `__wfgCleared`.
- `scripts/lib/error-guard.mjs` (imports nothing): `expectErrors` enforces the D-01 matcher rule (whole-text string, or a RegExp anchored both ends with a letter, no g/m/y, varying only in digit runs; a bad call keeps none of its matchers), plus `takeExpected`, `caught`, `judge`, `check`. The message lists text, count and stack of every stray entry, "expected but never seen" for unused matchers, and ends with an `expectErrors(...)` hint.
- `scripts/tests/setup.mjs`: always drains the registry and the expected list after each test; calls `check` only when `VG_ERROR_GUARD === "1"`. It names no file and no test and imports nothing from the harness.
- `scripts/tests/helpers.mjs`: re-exports `expectErrors`; `AURA_FALLBACK` (D-06 notice matcher).

## D-06 notice text observed

The plan's pattern matched the real text unchanged (the errorrail case proves it through `expectErrors(AURA_FALLBACK)` and a match against the live entry):
`aura containers (using Vanguard's own icons): wow-world.lua:<n>: CreateFrame: unknown frame type AuraContainer`

## Verification

- `npm test -- scripts/tests/errorrail.test.mjs`: pass, with and without `VG_ERROR_GUARD=1` (also `smoke.test.mjs` under the opt-in).
- `npm test -- scripts/tests/auction.test.mjs`: 74/74 passed.
- `npm test -- scripts/error-guard.test.mjs scripts/tests/errorrail.test.mjs`: 17 tests pass (11 pure, 6 Lua), same under `VG_ERROR_GUARD=1`.
- Negative control, `VG_ERROR_GUARD=1 npm test -- scripts/tests/feedback.test.mjs` (log `coverage/p2-guard-bites.log`, gitignored), exit 1 as intended. The guard's lines:
  - `Error: Vanguard left 1 error(s) in ns.errors that this test did not expect:`
  - `  1. RaidFrames: attempt to index a nil value   (x1)`
  - `Tests  1 failed | 5 passed (6)`
- `npm test` (no variable): 68 files, 890 tests, all passed.
- `npm run coverage`: all green, Lua line coverage 19055/19055 (100.00%).
- `npm run quality`: OK. `npm run lint`: 0 warnings / 0 errors in 114 files. `luac5.1 -p Core/Events.lua Modules/AuctionSell.lua`: exit 0.
- `grep -nE "^import .*lua-harness" scripts/tests/setup.mjs`: no output. `grep -n "function ns.Guard" Core/Events.lua`: line 162. The `ns.Guard("hook SetPostItem"` grep: `Modules/AuctionSell.lua:654`.
- `npm run test:quick`: 8 files / 122 tests pass. Its Duration read 16.3 s twice on this machine; I did not measure a pre-change baseline here, so "about 10 s" is not confirmed or refuted. setup.mjs adds no harness import, and the only new quick-project work is two small imports (`error-guard.mjs` has no imports) and the smoke test's extra `eval`.

The plan's verify block ran as separate commands (no `!` negation line; the grep exit status was read directly, exit 1 = no match).

## D-04 tally

Distinct unexpected errors found in this plan: 1, `RaidFrames: attempt to index a nil value` from `feedback.test.mjs:81`, which the plan already expected (deliberate; marker comes in plan 02-06). Under `VG_ERROR_GUARD=1` the only other files run (errorrail, error-guard, smoke) are clean. The stop threshold was not approached. No full guarded sweep was part of this plan.

## Deviations from Plan

None in behaviour. Two small test-code points:

- `scripts/error-guard.test.mjs`: the case table is run by one `describe` loop over a `CASES` array (instead of eleven `it(...)` lines in the `describe` callback) so the `describe` callback stays within the repo's 10-line rule; `addonOf` is a function declaration because the quality scan keys comments by line and cannot tell two functions on one line apart.
- The ns.Guard arguments-pass-through check records the arguments in a Lua global (`__guardSeen`) rather than returning them, since a guarded function returns nothing.

## Known Stubs

None.

## Needs in-game check

- That a throwing post-hook does not affect Blizzard's own `SetPostItem` call in the real client (the harness stub calls the hook after the original, with ns.Try catching; the real `hooksecurefunc` was not observed). Already on the Phase 5 in-game list (T-02-02).

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: Core/Events.lua (`function ns.Guard`), scripts/lib/error-guard.mjs, scripts/error-guard.test.mjs, scripts/tests/errorrail.test.mjs
- FOUND commits: 797a0a6, 398df0e (both ancestors of HEAD)
