---
phase: 02-errors-fail-tests
plan: 08
subsystem: auction, widgets
tags: [error-guard, ns.Guard, money-path, ci-04]
requires:
  - phase: 02-errors-fail-tests
    provides: "ns.Guard (02-01) and the always-on error guard (02-07)"
provides:
  - "Auction hooks, clicks and timers run under ns.Guard"
  - "Every widget and control factory OnClick runs under ns.Guard (covers all auction action buttons)"
  - "W.ClickLabel(text) for button click labels"
affects: [02-09, 02-10, 02-11, 02-12, 02-13]
tech-stack:
  added: []
  patterns: ["wrap only the callback argument at install time; label 'hook X' / 'click X' / 'timer X'"]
key-files:
  created: []
  modified:
    - Modules/AuctionCrafting.lua
    - Modules/AuctionHelper.lua
    - Modules/AuctionSell.lua
    - Modules/AuctionTable.lua
    - Modules/AuctionOwned.lua
    - Core/Widgets.lua
    - Core/Controls.lua
key-decisions:
  - "New public helper W.ClickLabel in Core/Widgets.lua builds the button-caption label once for W.Button and W.Primary."
requirements-completed: [CI-04]
status: complete
commits: 2
plan_head_before: e736fb2b087da55875ec1e85cfc4876f9e62b13d
plan_head_after: 255faa5db05c2a5499b5bb92150e8ade3e40ed7b
actuals:
  tokens: 2500
  tasks: 2
  commits: 2
---

# Phase 2 Plan 08: Money-path conversions, auction first Summary

Nine auction sites and eleven factory sites now run under `ns.Guard`, so a throwing auction hook, click or timer lands in `ns.errors` and `/vg errors`; no test needed changing and the whole suite stays green with the guard on.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 2-08-01 | Auction hooks, clicks and timers run under ns.Guard | 26fec65 |
| 2-08-02 | The widget and control factories wrap every OnClick they install | 255faa5 |

## Converted sites

Task 1 (9 sites; the `SetPostItem` hook at AuctionSell.lua:654 was already guarded by 02-01 and is not counted):

| File | Site | Label |
| ---- | ---- | ----- |
| AuctionCrafting.lua | hooksecurefunc(form, "Init") | hook Init |
| AuctionHelper.lua | AH.Row OnClick | click auction row |
| AuctionHelper.lua | sendLater timer | timer search queue |
| AuctionHelper.lua | AH.Next fallback timer | timer search fallback |
| AuctionHelper.lua | hook SetDisplayMode | hook SetDisplayMode |
| AuctionHelper.lua | hook UpdateTitle | hook UpdateTitle |
| AuctionSell.lua | sell slot OnClick (AH.TakeCursor) | click sell slot |
| AuctionTable.lua | sort header OnClick | click sort header |
| AuctionOwned.lua | paintLater timer | timer repaint owned |

Task 2 (11 sites):

| File | Site | Label |
| ---- | ---- | ----- |
| Widgets.lua | W.Button | click <caption> via W.ClickLabel |
| Widgets.lua | W.Cycle | click cycle |
| Widgets.lua | W.Swatch | click swatch |
| Widgets.lua | W.KeyCapture | click key capture |
| Controls.lua | W.Primary | click <caption> via W.ClickLabel |
| Controls.lua | W.Check | click switch |
| Controls.lua | segment | click segment |
| Controls.lua | W.Choice | click choice |
| Controls.lua | menu item | click menu item |
| Controls.lua | W.Dropdown | click dropdown |
| Controls.lua | W.Slider (stepOrWrap) | click slider |

Per-file counts of `ns.Guard(` lines: AuctionCrafting 1, AuctionHelper 5, AuctionSell 2 (1 new), AuctionTable 1, AuctionOwned 1, Widgets 4, Controls 7. No unguarded hook, OnClick or timer call remains in any of the seven files.

Only the callback argument changed at each site. Every handler still runs synchronously in the click's own call stack (ns.Try xpcall); nothing moved to a timer. No `OnClick` in scope sits on a secure template frame.

## Verification

| Check | Result |
| ----- | ------ |
| Auction area (auction, auctionapi, auctioncrafting, auctionledger, auctionrestock, auctionupgrades, errorrail), `coverage/p2-08-01-area.log` | 7 files / 115 tests passed |
| `npm run test:quick` | 10 files / 140 tests passed |
| Widget area (options, setup, clickcast, profiles, auction), `coverage/p2-08-02-area.log` | 5 files / 142 tests passed |
| Full `npm test`, `coverage/p2-08-02-full2.log` | 69 files / 897 tests passed, exit 0 |
| `npm run coverage` | exit 0, Lua line coverage 19058/19058 (100.00%) |
| `npm run quality`, `npm run lint` (0 warnings / 0 errors, 114 files), `luac5.1 -p` on all seven files | pass |
| Grep for an unguarded hooksecurefunc / OnClick / C_Timer in the five auction files and for an unguarded OnClick in Widgets/Controls | none found |

The plan's verify blocks use `!` negations and pipes; each condition was run as its own command and read from the output or exit status.

## D-04 tally

Cases turned red by these conversions: 0. New unexpected errors: 0. No test file was edited. Phase total from 02-07 (5 root causes) plus this plan: 5, well under the limit of about 20. No fix was needed, so no addon change beyond the conversions and `W.ClickLabel`.

## Deviations from Plan

- [Rule 3 - blocking] `npm ci` run once in the fresh worktree (vitest was missing).
- The first full `npm test` run showed 4 failures: timeouts of 30 s in `check-zip.test.mjs` and `media.test.mjs` (two cases each), while another agent's plan was running in parallel on the same machine. Both files passed alone (2 files / 70 tests), and a second full run passed 69 / 897. They are load timeouts unrelated to these changes; the cause was not investigated further.
- Added `W.ClickLabel` (a 3-line function, commented) in `Core/Widgets.lua`, as the plan allowed ("a commented local helper"); it is a field on `W` rather than a local because `Core/Controls.lua` (`W.Primary`) uses it too.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or trust-boundary surface.

## Needs in-game check

- Auction Post (item and commodity), Buy and Cancel from Vanguard's buttons still work after their handlers run under `ns.Try` (research A1, hardware-event status inside `xpcall`). The headless stub's hardware counter still passes in `auction.test.mjs`, but only the real client can confirm.
- `/vg perf` shows no visible cost from the guarded auction hooks while browsing.

## Self-Check: PASSED

- All seven modified files exist and carry the `ns.Guard(` lines listed above.
- Commits 26fec65 and 255faa5 exist on `worktree-agent-aed21f80f7b0727e9`.
