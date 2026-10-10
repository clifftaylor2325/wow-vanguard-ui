---
phase: 02-errors-fail-tests
plan: 04
subsystem: testing
tags: [error-guard, expectErrors, aura-fallback, D-06, vitest, lua-harness]
requires: [02-01]
provides:
  - "auras, plates and report tests pass under VG_ERROR_GUARD=1 by naming their deliberate errors"
affects: [02-07]
tech-stack:
  added: []
  patterns: ["expectErrors with exact text, or a both-ends-anchored RegExp varying only in digit runs"]
key-files:
  created: []
  modified:
    - scripts/tests/auras.test.mjs
    - scripts/tests/plates.test.mjs
    - scripts/tests/report.test.mjs
key-decisions:
  - "D-06 applied: the aura-container fallback notice stays in ns.errors, named with AURA_FALLBACK in 7 auras cases and 1 plates case"
requirements-completed: [CI-04]
status: complete
duration: about 25 min
completed: 2026-10-10
commits: 2
plan_head_before: 3d492c33eb2d079efa0d7b11923862ee4ccc57b7
plan_head_after: a57f5355aad96b6f8032a7cb600df93690400882
actuals:
  tokens: 3000
  tasks: 2
  commits: 2
---

# Phase 2 Plan 04: Name the aura, nameplate and report errors Summary

The aura, nameplate and report tests now pass under `VG_ERROR_GUARD=1` (41 tests, 3 files) and without it, because each case names the entries it causes on purpose; no addon code changed.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 2-04-01 | 4737af9 | tests: name the aura and nameplate fallback notices, D-06 included |
| 2-04-02 | a57f535 | tests: name the entries the /vg report cases plant |

## Marked cases and matchers

### scripts/tests/auras.test.mjs (13 failing cases found, 13 marked)

| Case | Matchers |
| ---- | -------- |
| a client that won't drive the dispel highlight never shows it uncolored | `NO_DISPEL_STYLE` = `/^debuff type colors: Core\/AuraEngine\.lua:\d+: attempt to index a nil value \(field 'CustomAuraButtonDispelTypeTextureStyle'\)$/` and `NO_DISPEL_EXTRAS` (same with `aura icon extras`) |
| raid auras listen for UNIT_AURA only on the fallback | `AURA_FALLBACK` |
| raid indicators on the fallback | `AURA_FALLBACK` |
| your buffs: the enchant switch, and clients without enchant info | `AURA_FALLBACK`, `"event WEAPON_ENCHANT_CHANGED: not on this client"` |
| aura containers without the engine (the fallback) | `AURA_FALLBACK` |
| fallback containers skip a UNIT_AURA that changes nothing | `AURA_FALLBACK` |
| aura filter words this client rejects are dropped | `AURA_FALLBACK`, `"aura filter HARMFUL\|CROWD_CONTROL: this client rejects it; reading HARMFUL"`, `"aura filter HELPFUL\|PLAYER\|RAID_IN_COMBAT: this client rejects it; reading HELPFUL\|PLAYER"` |
| a client that rejects every aura filter word | `AURA_FALLBACK`, exact `aura filter <HARMFUL\|CROWD_CONTROL, HARMFUL\|PLAYER, HARMFUL, HELPFUL>: no part of it is known to this client` (4 strings) |
| the raid dispel highlight reads through the stripped filter | `AURA_FALLBACK`, `"aura filter HARMFUL\|RAID: this client rejects it; reading HARMFUL"`, `"aura filter HELPFUL\|PLAYER\|RAID_IN_COMBAT: this client rejects it; reading HELPFUL\|PLAYER"` |
| the engine probe refuses an AuraContainer without AddAuraGroup | exact `aura containers (using Vanguard's own icons): the client's AuraContainer has no AddAuraGroup` |
| a container the client refuses after the probe retires the engine | `/^aura container \(switching to Vanguard's own icons\): eval:\d+: TEST-ONLY: SetUnit refused$/` and the same with `TEST-ONLY: no more containers` |
| raid tiles built after the engine retires | the `SetUnit refused` pattern |
| a raid tile whose second container is refused | the same pattern ending `TEST-ONLY: HoT row refused` |

The guarded run's 14 failures were these 13 auras cases plus the 1 plates case below.

### scripts/tests/plates.test.mjs (1 case)

| Case | Matchers |
| ---- | -------- |
| a nameplate first drawn in combat gets the client's aura container after the fight | `AURA_FALLBACK` (the second addon is built with `__wfgStub.noAuraContainer = true`) |

`grep -c AURA_FALLBACK scripts/tests/plates.test.mjs` is 2 (import and marker).

### scripts/tests/report.test.mjs (3 cases)

| Case | Matchers |
| ---- | -------- |
| /vg report lists the caught errors, newest last | `"RaidFrames: attempt to index a nil value"`, `"Nameplates: \|cffff0000bad\|r arithmetic"` |
| /vg report stays under 8,000 characters | `GENERATED` = `new RegExp("^Module\\d+: " + "long message ".repeat(30) + "\\d+$")` |
| /vg report names the modules turned off and the skinned addons | `/^skin for Broken: eval:\d+: oops$/` |

The 20-entry cap drops the oldest entries. The size-cap case plants exactly 20 and asserts 20 remain, so the guard judges all 20.

## Verification

Each run was made as a separate command; output logs are under `coverage/` (gitignored).

- `VG_ERROR_GUARD=1 npm test -- scripts/tests/auras.test.mjs scripts/tests/plates.test.mjs`: before markers 14 failed / 22 passed (log `coverage/p2-auras-guard.log`); after, 36 passed.
- `npm test -- scripts/tests/auras.test.mjs scripts/tests/plates.test.mjs`: 36 passed.
- `VG_ERROR_GUARD=1 npm test -- scripts/tests/report.test.mjs`: before markers 3 failed / 2 passed; after, 5 passed. Without the variable: 5 passed.
- `VG_ERROR_GUARD=1 npm test -- scripts/tests/auras.test.mjs scripts/tests/plates.test.mjs scripts/tests/report.test.mjs`: 3 files, 41 tests passed.
- `npm run quality`: OK after each task.
- The plan's verify blocks are multi-line; each line was run as its own command.
- Not run: `npm run coverage` and the full `npm test` (this plan edits test files only and no addon Lua; the phase-level gate runs them).

## D-04 tally

Distinct unexpected errors that were not the point of their case: 0. Root causes: 0. No addon fix and no stop. Two entries were not in research's expectation list but were confirmed deliberate by reading the case:

- `debuff type colors` / `aura icon extras` (Core/AuraEngine.lua:122, nil `Enum.CustomAuraButtonDispelTypeTextureStyle`): the case title states the client "won't drive the dispel highlight"; the header of Core/AuraEngine.lua says every call into a newer option is wrapped so the icons still show without the extra. The case asserts exactly that. (x31 and x1 occurrences.)
- `skin for Broken: eval:3: oops`: the case registers a skin that throws and asserts `Broken (failed)` in the report.

If the user reads the dispel one as a missing nil check in `E.RegisterDispel` rather than a deliberate degrade path, it needs a decision; I marked it because the wrapping is documented design.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was run once in the worktree (vitest was missing), as the execution notes allowed.
- Research listed 17 expected failures (13 auras, 1 plates, 3 report); the guard found 17, but two entries differ from research's description: the auras dispel-style case (`debuff type colors`) and the report Broken-skin case (`skin for Broken`) were not named in it. Both were confirmed deliberate (see the D-04 tally). No plan behaviour changed.

## Known Stubs

None.

## Needs in-game check

- D-06: on the Forever client, does Vanguard show the error badge at login because of the aura-container fallback notice? If it does, a separate notice channel moves up the list.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: scripts/tests/auras.test.mjs, scripts/tests/plates.test.mjs, scripts/tests/report.test.mjs (each contains `expectErrors(`; plates contains `AURA_FALLBACK`)
- FOUND commits: 4737af9, a57f535 (ancestors of HEAD)
