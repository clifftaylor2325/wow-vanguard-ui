---
phase: 02-errors-fail-tests
plan: 09
subsystem: testing
tags: [error-guard, ns.Guard, bags, vendor, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "ns.Guard (02-01) and the always-on test guard (02-07)"
provides:
  - "16 bag, bag-section, upgrade, errands, merchant and inventory callbacks reporting errors to ns.errors and /vg errors"
affects: [02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns: ["wrap only the callback argument with ns.Guard at install time"]
key-files:
  created: []
  modified:
    - Modules/Bags.lua
    - Modules/BagSections.lua
    - Modules/Upgrades.lua
    - Modules/Errands.lua
    - Modules/Merchant.lua
    - Modules/Inventory.lua
key-decisions:
  - "Labels follow the convention 'hook <Name>', 'click <what>', 'timer <what>'; the sort button is 'click sort bags'."
requirements-completed: [CI-04]
status: complete
commits: 2
plan_head_before: e736fb2b087da55875ec1e85cfc4876f9e62b13d
plan_head_after: b60be3f6af1670e51bb402fafac18f5b3089e1f5
actuals:
  tokens: 1000
  tasks: 2
  commits: 2
---

# Phase 2 Plan 09: Money-path conversions, bags, vendor and inventory Summary

Sixteen callbacks in the bag, bag-section, upgrade-marker, errands, merchant and inventory modules now run under `ns.Guard`, so an error in any of them is recorded in `ns.errors` and shows in `/vg errors`; only the callback argument changed at each site and the full suite stayed green with no test edit.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-09-01 | Bag, bag-section and upgrade-marker hooks run under ns.Guard | 70d8709 |
| 2-09-02 | Errands, merchant and inventory hooks, clicks and timers run under ns.Guard | b60be3f |

## Converted sites

| File | Sites | Label (line at execution) |
| ---- | ----- | ------------------------- |
| Modules/Bags.lua | 7 | hook SetVertexColor (89), hook Hide (90), hook GenerateItemSlotsForSelectedTab (149), hook Show with `game.Hide` (159), hook UpdateSearchBox (195), click sort bags (205), hook UpdateItems (221) |
| Modules/BagSections.lua | 3 | hook UpdateItemLayout (316), hook UpdateItems (317), hook UpdateCurrencyFrames (318) |
| Modules/Upgrades.lua | 1 | hook UpdateItems (288) |
| Modules/Errands.lua | 3 | timer errands (34, inside `later()`; the no-timer fallback is unchanged), click train all (116), hook TakeTaxiNode (344) |
| Modules/Merchant.lua | 1 | timer sell junk (67) |
| Modules/Inventory.lua | 1 | timer bag scan (93) |

Total 16: 11 in task 1 (7 + 3 + 1) and 5 in task 2 (3 + 1 + 1). Purchase, sell and training calls run where they ran before: the Train all loop is still inside its click, and the junk-sell and restock-buy timers are still timer callbacks.

## Verification

| Check | Result |
| ----- | ------ |
| Task 1 area files (bagsections, upgrades, auctionupgrades, inventory, windows-town, visibility), `coverage/p2-09-01-area.log` | 6 files / 52 tests passed |
| `grep -n "ns.Guard("` on Bags, BagSections, Upgrades | 7, 3, 1 lines |
| Unguarded `hooksecurefunc(`, `SetScript("OnClick"`, `C_Timer.After/NewTimer/NewTicker(` in the three task 1 files | none |
| `npm run test:quick` | exit 0 |
| Task 2 area files (vendor, inventory, auctioncrafting, auctionrestock), `coverage/p2-09-02-area.log` | 4 files / 24 tests passed |
| `grep -n "ns.Guard("` on Errands, Merchant, Inventory | 3, 1, 1 lines |
| Unguarded sites in the three task 2 files | none |
| Full `npm test`, `coverage/p2-09-02-full.log` | 69 files / 897 tests passed |
| `npm run coverage` | exit 0, 69 files / 897 tests, Lua line coverage 19055/19055 100.00% |
| `npm run quality`, `npm run lint`, `luac5.1 -p` on all six files | pass (lint 0 warnings / 0 errors) |

The plan's verify blocks use `!` negations and pipes; I ran each condition as a separate command and read the exit status or count. The `! grep ... | grep -v` check was run as `grep ... | grep -v "ns.Guard("` and the empty result (exit 1) was read as "none left".

## D-04 tally

This plan found 0 unexpected errors: no test turned red after either conversion, and no fix to addon code beyond the wrapping was needed. The phase total stays at 5 root causes (R1 to R5 from `02-07-SUMMARY.md`), well under the limit of about 20.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` was needed in the fresh worktree before tests could run (vitest was missing); run once at the start.
- The branch was fast-forwarded to `e736fb2` first, as instructed by the orchestrator.
- The plan commit ledger (`gsd-plan-head-before-*` under the git dir) was not written, because the harness refuses the compound command; `plan_head_before` is the fast-forward target `e736fb2`, and `git rev-list --count e736fb2..HEAD` gave 2.

## Known Stubs

None.

## Threat Flags

None.

## Needs in-game check

- Errands "Train all" learns everything affordable at a trainer, in one click.
- Restock buying (`/vg stock`) still tops up at a vendor.
- Merchant junk selling still sells the grays and retries.
- Bag clicks: the Sort button still sorts the bags.
- `/vg perf` with the bags open: no visible cost from the guarded `SetVertexColor` and `Hide` hooks on every bag slot (T-02-18, research A4).

## Self-Check: PASSED

- All six Modules files carry the converted lines (grep counts above).
- Commits `70d8709` and `b60be3f` are on `worktree-agent-a3be910fceb512dfb`.
