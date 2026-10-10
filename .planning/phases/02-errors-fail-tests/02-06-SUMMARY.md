---
phase: 02-errors-fail-tests
plan: 06
subsystem: testing
tags: [error-guard, expectErrors, vitest, lua-harness]
requires: [02-01]
provides:
  - "expectErrors markers for the five deliberate-error cases (engine, auction API, feedback, fallbacks, skins)"
affects: [02-07]
tech-stack:
  added: []
  patterns: ["exact-text expectErrors marker as the first line after the addon is built"]
key-files:
  created: []
  modified:
    - scripts/lua-engine.test.mjs
    - scripts/tests/auctionapi.test.mjs
    - scripts/tests/feedback.test.mjs
    - scripts/tests/fallbacks.test.mjs
    - scripts/tests/skins.test.mjs
key-decisions:
  - "All five markers are exact strings; no RegExp was needed (the eval:<line> numbers are stable in these cases)"
requirements-completed: [CI-04]
status: complete
duration: about 15 min
completed: 2026-10-10
commits: 2
plan_head_before: 3d492c33eb2d079efa0d7b11923862ee4ccc57b7
actuals:
  tokens: 600
  tasks: 2
  commits: 2
---

# Phase 2 Plan 06: Name the deliberate errors in five test files Summary

Five test files that cause an error on purpose now say which one, with `expectErrors`, so they pass under `VG_ERROR_GUARD=1` and nothing else in them is excused.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 2-06-01 | 4ae077b | tests: name the deliberate errors in the engine, auction API and feedback tests |
| 2-06-02 | 7860aa7 | tests: name the deliberate errors in the fallback and skin tests |

## Markers (all exact strings)

| File | Case | Marker |
| ---- | ---- | ------ |
| scripts/lua-engine.test.mjs | a Lua error carries a traceback naming the addon file | `TEST-ONLY: eval:2: attempt to index a nil value (local 't')` |
| scripts/tests/auctionapi.test.mjs | RegisterForDBUpdate: callbacks run once ... | `Vanguard.API.v1 update for TEST-ONLY Broken: eval:3: TEST-ONLY broken` |
| scripts/tests/feedback.test.mjs | a bug's block carries the kind, title, texts and the /vg report ... | `RaidFrames: attempt to index a nil value` |
| scripts/tests/fallbacks.test.mjs | without issecretvalue nothing is secret, and a failing after-combat update is reported ... | `after-combat update: eval:2: TEST-ONLY boom` |
| scripts/tests/skins.test.mjs | skin API | `skin for Broken: eval:5: oops` |

Each was confirmed as the point of its case before marking, and matches the research's expectation text for text. `lua-engine.test.mjs` imports `expectErrors` from `./lib/error-guard.mjs`; the other four from `./helpers.mjs`. No existing assertion changed.

The auctionapi entry showed `(x3)` in the guarded output: the broken subscriber fires on each of three updates and `ns.errors` de-duplicates by text. The test's own `#ns.errors == 1` assertion still holds.

## Verification

Each command run on its own; logs under `coverage/p206-*.log` (gitignored).

- `VG_ERROR_GUARD=1 npm test -- <three task-1 files>`: before markers 3 failed / 25 passed, each naming exactly the one expected entry; after: 28 passed.
- `npm test -- <three task-1 files>` (no opt-in): 28 passed.
- `VG_ERROR_GUARD=1 npm test -- fallbacks skins`: before markers 2 failed / 4 passed; after: 6 passed.
- `npm test -- fallbacks skins` (no opt-in): 6 passed.
- `VG_ERROR_GUARD=1 npm test -- <all five files>`: 5 files, 34 tests passed.
- `npm run quality` after each task: OK.

The plan's multi-line verify blocks were run as separate commands, one per line.

## D-04 tally

Distinct unexpected errors: 0. Every entry the guard reported was one of the five deliberate cases, so no addon code was changed and no stop threshold was approached.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Needs in-game check

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND commits 4ae077b and 7860aa7 (both ancestors of HEAD).
- FOUND `expectErrors(` in all five files.
