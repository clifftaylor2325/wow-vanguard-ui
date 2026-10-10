---
phase: 02-errors-fail-tests
plan: 03
subsystem: testing
tags: [error-guard, expectErrors, core-tests, lua-harness]
requires: [02-01]
provides:
  - "scripts/tests/core.test.mjs passes with and without VG_ERROR_GUARD=1"
key-files:
  modified:
    - scripts/tests/core.test.mjs
key-decisions:
  - "The capability-probe fixtures clear only the four Enum tables the probe asks about instead of replacing Enum (R1 and R5 share this one cause)"
  - "The no-cooldown-frames errors are marked: the fixture throws them itself"
requirements-completed: [CI-04]
status: complete
duration: about 25 min
completed: 2026-10-10
commits: 2
plan_head_before: 3d492c33eb2d079efa0d7b11923862ee4ccc57b7
plan_head_after: a807e7c96c67f27c5d020235c482972eb3379039
actuals:
  tokens: 3500
  tasks: 2
  commits: 2
---

# Phase 2 Plan 03: core.test.mjs under the guard Summary

`scripts/tests/core.test.mjs` now passes with `VG_ERROR_GUARD=1` and without it (50/50 both ways): the fixtures that replaced the stub's `Enum` or hooked only the table form of `hooksecurefunc` are fixed, and the 22 cases that cause errors on purpose name each one with `expectErrors`.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 2-03-01 | f21482d | tests: core fixtures extend Enum and hook both hooksecurefunc forms |
| 2-03-02 | a807e7c | tests: core error-handling cases name the errors they cause |

No stub (`wow-world.lua`) or addon change was needed.

## What changed

- `NO_PROBE_ENUMS` (new const): clears `Enum.StatusBarInterpolation`, `PlayerSwingType`, `DamageMeterSessionType` and `DamageMeterType` on the stub's Enum. `CLIENT_FULL_ENV` and the three `half(...)` probe cases set or clear just those tables, so the rest of the stub's Enum (`PowerType`, `CustomAuraButtonDispelTypeTextureStyle`, ...) stays. The assertions are unchanged.
- `PIN_ENV`'s test-local `hooksecurefunc` accepts `(name, fn)` (hooks `_G`) as well as `(table, name, fn)`, and leaves a missing function alone, as the stub does (`wow-world.lua:144-153`).
- 22 cases carry `expectErrors(...)` as their first statement. Markers are exact strings except three digit-varying patterns: `/^TEST-ONLY: \d+$/` (cap case), `/^module DataBars: Modules\/DataBars\.lua:\d+: attempt to compare number with string$/` (file line), `/^pin Vanguard_PinTest: eval:\d+: boom$/` (fixture line); plus `AURA_FALLBACK` (D-06).

## Marked cases (22)

| Case | Matchers |
| ---- | -------- |
| the account file's version is read and upgraded | `DB upgrade 4: eval:2: boom` |
| a failing first upgrade step ... retried at the next login | `DB upgrade 1: eval:2: boom` (2 entries, 1 matcher) |
| modules | `module Bad: eval:4: boom` |
| modules: a module whose saved settings fail to upgrade ... | DataBars pattern above; `module TESTONLY_Broken: eval:3: attempt to compare number with string` |
| pins: a throwing apply is reported ... | pin pattern above; `pin frame: eval:2: bare` |
| client capability probe: what this client has ... | `aura icon: eval:3: TEST-ONLY: no cooldown frames`; same for `module PlayerAuras`, `module ActionBars` |
| client capability probe: every flag off ... | `AURA_FALLBACK` (3 entries across 3 addons) |
| secure snippets: what waits for the probe's answer ... | `secure snippet fallback: eval:3: TEST-ONLY waiter broke` |
| /vg errors: what Vanguard caught this session | `/^TEST-ONLY: \d+$/` |
| caught errors: one entry per distinct error ... | `TEST-ONLY site: boom`, `TEST-ONLY try: eval:2: bad x`, `TEST-ONLY inner: in`, `TEST-ONLY outer: eval:2: out` |
| caught errors: the stack is read while the failing frames are still live | `TEST-ONLY live: eval:2: TEST-ONLY deep`, `event TEST_ONLY_LIVE: eval:2: TEST-ONLY deep`, `TEST-ONLY late: x` |
| caught errors: without debugstack ... hidden error value | `TEST-ONLY bare: x`, `TEST-ONLY: (a hidden error message)` |
| caught errors: a game handler that fails or reports again ... | `TEST-ONLY outer: x`, `TEST-ONLY inner: TEST-ONLY outer: x`, `TEST-ONLY none: y` |
| caught errors: an after-combat update that fails ... | `after-combat update: eval:2: TEST-ONLY late` |
| /vg errors: counts, build, interface version ... then clear | `TEST-ONLY twice: x`, `TEST-ONLY once: y` |
| events: a handler that throws does not stop the others ... | `event TEST_ONLY_EVENT: eval:5: TEST-ONLY first` |
| events: on a client without debugstack or an error handler ... | same |
| events: a broken game error handler cannot lose the record | same (2 entries, 1 matcher) |
| events: Blizzard's CallErrorHandler is preferred ... | same |
| events: a game handler that fails inside a failing handler ... | same; `TEST-ONLY again: second` |
| unit events: a failing handler is reported ... | `event UNIT_LEVEL: eval:2: TEST-ONLY unit handler`, `event TEST_ONLY_GONE: not on this client` |
| the error badge ... | `TEST-ONLY site: TEST-ONLY failure`, `TEST-ONLY site: TEST-ONLY other` |

## D-04 tally

Baseline guarded run (`coverage/p2-core-guard.log`): 23 failing cases. Distinct root causes of unexpected errors: 3, all known, all fixed in the test fixtures, none marked, none in addon code.

| Root cause | Texts | Cases | Fix |
| ---------- | ----- | ----- | --- |
| R1: fixture replaces `Enum` | `debuff type colors: Core/AuraEngine.lua:122: attempt to index a nil value (field 'CustomAuraButtonDispelTypeTextureStyle')` (x28 per addon) | client capability probe: what this client has (the full-client and three half-client addons) | `NO_PROBE_ENUMS` + set only the probe's tables |
| R5: same replacement, read by the stub's `UnitPowerMax` | `module UnitFrames: wow-world.lua:469: attempt to index a nil value (field 'PowerType')` | same case (3 addons) | same fix; the stub is unchanged (every fixture that removed `Enum.PowerType` was the replacement above) |
| R2: `hooksecurefunc` fixture handled the table form only | `module Chat / ChatExtras / Tooltips: eval:3: attempt to index a string value (local 'a')` | pins: a throwing apply; pins: any number of game moves in combat | string form added |

No new root cause. Of the 23 baseline failures, one (the second pins case) was R2 only and needed no marker; the other 22 carry markers, and the pins and capability-probe cases that also had R1, R2 or R5 entries mark only their deliberate remainder. Research expected 22 failing cases; the baseline showed 23. The stop threshold was not approached.

One judgement call to review: the three `TEST-ONLY: no cooldown frames` entries (an aura icon x46, PlayerAuras and ActionBars failing to enable) come from the `noCooldown` fixture in the first capability-probe case, whose own `CreateFrame` override throws on a Cooldown frame. I marked them as deliberate because the fixture throws them by design and the case asserts the probe survives. Whether the addon should enable PlayerAuras and ActionBars on a client that cannot make Cooldown frames is a separate question; nothing is hidden about it, but say so if you would rather treat it as a defect.

## Blind spot

The `/vg errors` cap case overflows the 20-entry list: the aura-container notice and `module TEST-ONLY Broken` entries of that addon fall off the end before the guard reads them, so they are never judged (the known 02-01 blind spot for marked tests). They are deliberate in that case.

## Verification

Commands run one per call (the plan's multi-line verify block cannot run as one command here; each condition was run separately).

- `npm test -- scripts/tests/core.test.mjs`: 50/50 passed after each commit.
- `VG_ERROR_GUARD=1 npm test -- scripts/tests/core.test.mjs`: after task 1, 22 failing (only deliberate cases); no R1, R2 or R5 text (`PowerType`, `attempt to index a string value`, `debuff type colors`, `aura icon extras` greps found nothing). After task 2: 50/50 passed.
- `npm run quality`: OK after each task.
- Logs under `coverage/` (gitignored): `p2-core-guard.log`, `p2-core-t1.log`, `p2-core-t2.log`.
- `npm run coverage` and the full suite were not run (this plan only changes a test file; other plans in the wave are in flight).

## Deviations from Plan

None in behaviour. `npm ci` was run once because the worktree had no `node_modules`.

## Known Stubs

None.

## Needs in-game check

None. All of it is headless test fixture work.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: scripts/tests/core.test.mjs
- FOUND commits: f21482d, a807e7c (ancestors of HEAD)
