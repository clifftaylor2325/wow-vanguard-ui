# Roadmap: Vanguard: Forever launch

## Overview

Vanguard is already a full UI suite. This milestone makes it ready for the WoW: Forever launch on 2026-11-04, 15:00 PST. The phases are grouped by area and follow the author's priority order. Code and CI come first: a green and trustworthy suite, a fast CI gate and a leaner core. Then the auction Post bug, then UI polish, then levelling and group features, which are cut first if time runs short. A final launch phase checks the release against the real Forever build. Nobody can run the game in this environment, so every phase PR carries a needs-in-game-check list for the author.

**Key dates** (research-suggested, except the launch itself):
- 2026-10-21: the Forever beta may close (unverified). The beta session for the launch check needs the Post fix (Phase 5).
- 2026-10-28: structural freeze (no more file splits) and feature cut-off.
- 2026-11-01: code freeze. After this, only fixes for `/vg errors` reports.
- 2026-11-02: a patch release has been rehearsed.
- 2026-11-04 15:00 PST: launch.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

Code and CI (priority 1):

- [x] **Phase 1: Green baseline** - The full suite passes on main, each #169 case is resolved with evidence, and coverage reports again (completed 2026-10-09)
- [x] **Phase 2: Errors fail tests** - A swallowed addon error fails its test, and runs give the same result every time (completed 2026-10-10)
- [x] **Phase 3: Fast suite and CI gate** - The full suite runs in under 5 minutes on the hosted runner, on ready-for-review and the full-tests label (completed 2026-10-11)
- [x] **Phase 4: Lean core** - Dead code is gone, and per-frame and unit-event work goes through shared helpers (completed 2026-10-12)

Auction house (priority 2):

- [ ] **Phase 5: Auction Post fix** - Post lists the auction on both paths, and every silent exit shows a reason

UI polish (priority 3):

- [x] **Phase 6: Theme scale and motion** - One type scale, spacing grid and fade helper, all in Theme (completed 2026-10-12)
- [x] **Phase 7: Control states and panel depth** - Controls react to hover, press, disabled and focus, and panels have depth (completed 2026-10-12)
- [ ] **Phase 8: Every window styled** - The PvP windows are reskinned and visual issues #187-#204 are closed

Levelling and group features (priority 4, cut first):

- [ ] **Phase 9: Levelling helpers** - Quest XP, kills to level and low-supply warnings
- [ ] **Phase 10: Roll tracking** - `/roll` results and loot rolls are tracked (loot rolls cuttable)
- [ ] **Phase 11: Party quest progress** - Live party quest progress over addon messages (cuttable; the author's call)

Launch:

- [ ] **Phase 12: Launch readiness** - A zero-error beta session and the real Forever build number in the TOC

## Phase Details

### Phase 1: Green baseline

**Goal**: The author can trust a green run: the full suite passes on clean main locally, and coverage reports again. The hosted-runner check moves to Phase 3.
**Depends on**: Nothing (first phase)
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. `npm test` on a clean checkout of main reports zero failed cases locally. The hosted-runner run is confirmed in Phase 3.
  2. Each of the seven cases in #169 has a recorded outcome on the issue: fixed, with the cause named in the commit body, or shown not to reproduce on clean main.
  3. Every harness or stub change made to turn a case green cites the 12.1 Blizzard source in its commit body, and no commit loosens a harness rule and changes a test together.
  4. `npm run coverage` prints its report and passes the 100% floor in `scripts/lua-coverage-floor.json`.

**Plans**: 2/2 plans complete
Plans:
- [x] 01-01-PLAN.md — Clean-checkout baseline: worktree at origin/main with `npm ci`, the five #169 files, git evidence, `npm run verify`, `npm run coverage` at the 100% floor (no tracked file changes)
- [x] 01-02-PLAN.md — Draft the seven-row #169 outcome comment, get the user's approval at a blocking-human checkpoint, then post it and close or keep the issue open as chosen

**Notes**: Re-baseline first. Sources disagree on what is red (751/751 passing locally on 2026-10-09 against seven red cases in #169), so compare clean main locally and on the hosted runner before chasing anything. Research also suggests pinning fengari 0.1.5 and luacheck 1.2.0 (official binary, checked by SHA-256), moving CI to Node 24 with an `.nvmrc`, and running `npm ci` so local Vitest matches the lock file.

### Phase 2: Errors fail tests

**Goal**: A test cannot pass while the addon swallows an error, and a red run says exactly what broke.
**Depends on**: Phase 1
**Requirements**: CI-03, CI-04
**Success Criteria** (what must be TRUE):
  1. Any test that leaves an entry in the addon's error list (`ns.errors`) fails, and the failure prints the error text and where it came from. A test that causes an error on purpose (a test of the error handling itself) names that exact error with an expected-error marker inside the test, and passes only if exactly that error appears (D-01 in `02-CONTEXT.md`); no test or file is exempt.
  2. Errors raised inside `hooksecurefunc` callbacks, `OnClick` handlers and `C_Timer` callbacks reach the error list, so a throwing handler fails its area test instead of passing.
  3. A weekly CI job runs the full suite in a shuffled order and prints its seed. Any flaky case found is fixed, not retried. The first green shuffled run waits for the hosted runner (blocked by billing); the user accepted leaving that part open (D-05 in `02-CONTEXT.md`).
  4. The suite stays green with the guard on: errors it exposes are fixed in the addon, not excused with an expected-error marker.

**Plans**: 13/13 plans complete in 8 waves
Plans:
- [x] 02-01-PLAN.md — Tracer: `ns.Guard`, the guarded SetPostItem hook, the `createAddon` registry and `ns.ClearErrors` harvest, `error-guard.mjs` (`expectErrors`, which refuses any marker broader than one error, and `check`), the global `afterEach` behind a `VG_ERROR_GUARD=1` opt-in; guard unit tests, click/timer/nil cases, `AURA_FALLBACK`
- [x] 02-02-PLAN.md — CI-03: `link-wow.test.mjs` cases made independent; `VG_SHUFFLE_SEED` shuffle in `vitest.config.mjs`; the Sunday full run shuffled with its seed printed (lua-suite/full-suite), checked by `scripts/workflows.test.mjs`
- [x] 02-03-PLAN.md — core.test.mjs under the guard: R1/R2/R5 fixtures fixed at the cause, deliberate error-rail cases named
- [x] 02-04-PLAN.md — auras, plates and report tests under the guard: fallback notices named, D-06 via `AURA_FALLBACK`
- [x] 02-05-PLAN.md — ChatExtras guards (R3, addon fix); Enum and hooksecurefunc fixtures (R1, R2) and the AFK fixture (R4); deliberate entries in more and tooltip named
- [x] 02-06-PLAN.md — the one deliberate error each in lua-engine, auctionapi, feedback, fallbacks and skins tests named
- [x] 02-07-PLAN.md — Guard on for every test (opt-in removed), tests README, coverage at 100%; negative control on the SetPostItem hook
- [x] 02-08-PLAN.md — Money first: auction hooks, clicks and timers and the W.Button / W.Primary / Controls factories under `ns.Guard`
- [x] 02-09-PLAN.md — Money first: bags, bag sections, upgrade markers, errands, merchant and inventory under `ns.Guard`
- [x] 02-10-PLAN.md — The remaining Core hooks, clicks and timers under `ns.Guard`
- [x] 02-11-PLAN.md — Window skins, menu strip, game tools, alerts, tooltips, chat and bars under `ns.Guard`
- [x] 02-12-PLAN.md — Quests, tracker, broker, click-cast options, minimap, raid tools, talents, fight history and raid status under `ns.Guard`
- [x] 02-13-PLAN.md — Code-quality rule against bare hooks, clicks and timers (README sentence); stub `debugstack`; stack in the guard message; phase gate

**Notes**: Today only `smoke.test.mjs` asserts zero errors, and 54 `hooksecurefunc` calls, 57 `OnClick` handlers and 12 unguarded `C_Timer` calls bypass `ns.Try` (research recount; 3 more timer calls already run inside `ns.Try`). Put the guard in a global `afterEach` in `scripts/tests/setup.mjs` and wrap the money paths first. The combat-lockdown mode and per-module secret-value sweep for the harness that research recommended are deferred (`02-CONTEXT.md`): they are not in CI-03 or CI-04 and become a requirement before Phase 12's in-combat check.

### Phase 3: Fast suite and CI gate

**Goal**: The full suite is fast enough to run on every PR that is ready for review, and it runs there automatically.
**Depends on**: Phase 2
**Requirements**: CI-05, CI-06
**Success Criteria** (what must be TRUE):
  1. Every push runs the quick check, and marking a PR ready for review, or adding the `full-tests` label, starts the full suite.
  2. The full suite finishes in under 5 minutes wall time on a 2-worker local proxy for a 2-vCPU runner, and the measured time, with per-file times, is recorded in the phase summaries and verification. The same measurement on the hosted runner waits for the billing block to clear; the user accepted leaving that part open (D-01 in `03-CONTEXT.md`).
  3. No case was dropped or skipped to reach the time: the test count and the 100% coverage floor match the start of the phase.

**Plans**: 7/7 plans complete in 4 waves
Plans:
- [x] 03-01-PLAN.md — `npm run timing` (2-worker per-file timing recorder with a budget and a baseline check) and the 907 phase-start case names, captured before any test edit
- [x] 03-02-PLAN.md — CI-05: full suite on opened-ready / ready-for-review, later pushes only with `full-tests`, drafts never, unrelated labels cannot cancel; truth-table test over the workflow's own expressions; README wording
- [x] 03-03-PLAN.md — Lua sampling profiler in the harness count hook: `npm run profile -- login` and `npm run profile -- <area>`, output in `coverage/profile/`
- [x] 03-04-PLAN.md — Scoped logins from data (`scripts/tests/login-scope.json`, six heavy modules off through the SavedVariables seam, `VG_LOGIN_SCOPE=full|probe`), auction as the tracer, and the probe that derives the data
- [x] 03-05-PLAN.md — D-05 housekeeping: luacheck 1.2.0 binary pinned by a SHA-256 verified a second way (fails closed), `.nvmrc` (Node 24) in every setup-node, fengari exactly 0.1.5
- [x] 03-06-PLAN.md — Probe the whole suite, write the scope data, keep cross-module checks on the full login, 907 of 907 phase-start cases green; tests README and README commands
- [x] 03-07-PLAN.md — Phase gate (verify, every login full, baseline, coverage 19058/19058), then the quiet-machine 2-worker timing runs recorded with per-file times

**Notes**: The CI design is the author's decision: full suite on ready-for-review and on the `full-tests` label, quick check on every push. The existing weekly and pre-release runs can stay. Current measurements do not yet support 5 minutes on a 2-vCPU runner (2,622 CPU-seconds on 16 threads), so measure on the hosted runner first. Research order: a Lua sampling profiler (`npm run profile -- <area>`), Enable-cost cuts in the six heaviest modules (ActionBars first), scoped and shared logins, then splitting `more.test.mjs` and `auction.test.mjs`. No Vitest sharding. A wasmoon spike only if the suite is still above about 8 CPU-minutes.

### Phase 4: Lean core

**Goal**: The addon carries no dead code, and per-frame and unit-event work runs through one throttled driver and one unit-event path.
**Depends on**: Phase 3
**Requirements**: CI-07, CI-08
**Success Criteria** (what must be TRUE):
  1. The six test-only functions (`ns.GridLineCount`, `ns.WatchMover`, `O.RowCount`, `W.Cycle`, `CC.Move`, `GW.SkinWith`) are gone along with their tests, and a scan finds no unused defaults, theme tokens, `Media/` files or `.luacheckrc` globals.
  2. Every per-frame driver uses one throttled `ns.Every` helper (in a new `Core/Ticker.lua`, listed in the TOC) instead of its own `OnUpdate` accumulator, and an idle-cost test shows the throttle holds.
  3. Unprotected unit-event registrations, including those in `UnitFrames` and `AuraLegacy`, go through `ns.OnUnit`, and a check fails if a new direct registration appears.

**Plans**: TBD
**Notes**: Media removals go through `scripts/lib/media-sources.mjs` and `npm run media`, never by hand. Measure the `RaidAuras` shared-frame `UNIT_AURA` cost before filtering it. Structure-only and cuttable, with no v1 requirement behind it: once the above lands, split `Core/Options.lua` and `Core/OptionsWindow.lua` by area (one `O.AddPage` per feature) so the feature phases add their settings without growing those files. Other splits (`MenuStrip`, `TalentPlanner`, `ActionBars`, `RaidFrames`, `ClickCastOptions`) only if time allows, and none after the 2026-10-28 structural freeze.

### Phase 5: Auction Post fix

**Goal**: Clicking Post lists the auction, and when it cannot, the player sees why.
**Depends on**: Phase 4
**Requirements**: AH-01, AH-02, AH-03
**Success Criteria** (what must be TRUE):
  1. Clicking Post on an item listing calls `C_AuctionHouse.PostItem`, and on a commodity listing calls `C_AuctionHouse.PostCommodity`, each with the stack, duration and price the player chose; the harness asserts the arguments and the confirm step on both paths.
  2. Each place where Post used to stop without a word (for example when no usable price is found) now tells the player why, and a test checks each message.
  3. One end-to-end harness test drives Post from the bag click through `SetPostItem`, the price check, the Post click, the throttle drop and the ready event to the next stack, with the error list empty after every step.
  4. The root-cause Lua error is named in the fix commit and fixed in the unsplit auction files, and the `SetPostItem` hook runs under `ns.Try`.

**Plans**: TBD
**Notes**: Reproduction work, not research. The harness reports the throttle as always ready unless a test turns it off, and `PostItem`/`PostCommodity` need a hardware event; model both. Whether a throwing post-hook aborts Blizzard's own call can only be seen in game, so one real Post goes on the needs-in-game-check list. Only after the fix and its test land: optional, structure-only splits of `AuctionShop.lua` and `AuctionSell.lua` (no v1 requirement; cuttable).

### Phase 6: Theme scale and motion

**Goal**: `Core/Theme.lua` is the one source for type sizes, spacing and motion, so the polish phases build on one scale and one fade helper.
**Depends on**: Phase 5
**Requirements**: UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Every font size and spacing value in the addon comes from one type scale and one spacing grid defined in `Core/Theme.lua`, and the code-quality scan finds none set elsewhere.
  2. Every fade and feedback animation runs through one Theme motion helper that finishes within 0.15 s in combat and does not animate when Reduce motion is on; harness tests check both cases.
  3. Every fade and sound the addon plays has a row in `docs/THEME.md`, and the list matches what the code plays.

**Plans**: TBD
**UI hint**: yes
**Notes**: First, structure-only (no v1 requirement): split `Core/Theme.lua` (about 1,300 lines) into `ThemeFrames.lua` and `ThemeMotion.lua`, listed in the TOC, with test counts unchanged. Sounds also respect the Interface sounds switch. No heavy blur and no per-frame `OnUpdate` animation.

### Phase 7: Control states and panel depth

**Goal**: Vanguard's controls and panels feel deliberate: buttons respond to every state, and windows have depth instead of looking like flat grey boxes.
**Depends on**: Phase 6
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. Every Vanguard button and control shows distinct hover, pressed, disabled and focus states, set in the shared widget constructors so new controls get them automatically.
  2. Every Vanguard panel and window has a border, bevel and edge glow drawn by one Theme depth helper and sized and anchored to the frame.
  3. No atlas art is cropped with `SetTexCoord` to get the depth effect (texcoords are atlas-relative on Forever, so crops blur).
  4. Hover and press feedback uses the Phase 6 motion helper, so it stays within the combat limit and respects Reduce motion.

**Plans**: TBD
**UI hint**: yes
**Notes**: Preview images (`npm run preview`) show the states and depth for review; the in-game look goes on the needs-in-game-check list.

### Phase 8: Every window styled

**Goal**: Every window Vanguard touches looks finished, including the PvP windows, and the open visual bugs are closed.
**Depends on**: Phase 7
**Requirements**: UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. The PvP windows (RESKIN S8.1-S8.5) are registered with `GW.Add` (load-on-demand ones via `onDemand`) and styled like the other game windows, and a harness test opens each one.
  2. A harness check opens every window Vanguard reskins and finds the skin applied to each.
  3. Each issue in #187-#204 has a merged fix with a test, and is closed only after the author confirms it in game. The fixes already merged in PR #205 (#188, #197, #199, #202, plus #186) are on the same check list.

**Plans**: TBD
**UI hint**: yes
**Notes**: Confirm the PvP frame names on Forever in game before planning (research flag). Group the visual bugs by file.

### Phase 9: Levelling helpers

**Goal**: While levelling, the player sees what each quest is worth, how far away the next level is, and when supplies run low.
**Depends on**: Phase 8
**Requirements**: FEAT-01, FEAT-02, FEAT-03
**Success Criteria** (what must be TRUE):
  1. Each quest row in the tracker shows that quest's XP, and the XP bar tooltip shows the total XP waiting in the quest log.
  2. The XP bar tooltip shows kills to level, percent through the level and rested XP detail, read through `ns.PlainNumber` so a secret value never breaks it.
  3. When a supply count drops below its threshold, one warning appears. It does not repeat until the count recovers and drops again, and it never fires in combat.
  4. Each helper can be turned off in the options, and the README describes it.

**Plans**: TBD
**Notes**: Cut first if time runs short (the whole phase; feature cut-off 2026-10-28). Extend what exists rather than rebuild: `InfoStrip` already has XP/hour and time to level, `QuestLog`/`QuestDialog` show quest XP, and `InstancePrep` and `Errands` already count supplies. The author confirms the gap list before planning. Move `XPRate` into a Core service only if a second module needs it.

### Phase 10: Roll tracking

**Goal**: In a group, the player can see who rolled what and who won.
**Depends on**: Phase 8
**Requirements**: FEAT-04, FEAT-05
**Success Criteria** (what must be TRUE):
  1. When anyone in the group types `/roll`, Vanguard records the result by parsing the localised roll result text (`RANDOM_ROLL_RESULT`) and shows each roll and the highest.
  2. During a loot roll, a tracker on screen shows each member's choice and roll and who won, in the Vanguard look, with a bounded history.
  3. On a client without the loot-history API, the loot roll tracker stays off with no error, and the `/roll` tracker still works.

**Plans**: TBD
**UI hint**: yes
**Notes**: Cut first if time runs short. FEAT-05 is cuttable on its own: it is feature-detected, and it is cut if the client does not expose the loot-history API (`C_LootHistory` was removed from retail in 10.1; whether 12.1 Forever has it is unknown). Do a short API check before planning (`C_LootHistory`, `START_LOOT_ROLL`). Nothing rolls automatically.

### Phase 11: Party quest progress

**Goal**: Party members who run Vanguard see each other's quest progress live.
**Depends on**: Phase 9
**Requirements**: FEAT-06
**Success Criteria** (what must be TRUE):
  1. When a party member running Vanguard advances a quest objective, the other members running Vanguard see the new count shortly after, sent by addon message.
  2. Where addon messaging is blocked (for example inside instances), the feature stays quiet: no error, and no stale count shown as live.
  3. Party members without Vanguard see nothing new, and Vanguard's messages are throttled so they never flood the channel.

**Plans**: TBD
**Notes**: Cuttable. FEAT-06 is in v1 by the author's decision, not the research's recommendation. The research advised leaving addon messaging out of launch (high cost, a new `Core/Comms.lua`, combat-lockdown risk, and messaging may be blocked in vanilla instances) and shipping only "who has this quest" via `C_QuestLog.IsUnitOnQuest`. Cut this phase if messaging is blocked in instances or if time runs short. The lighter "who has this quest" is not a v1 requirement; adding it is the author's call.

### Phase 12: Launch readiness

**Goal**: The release the three players install on 2026-11-04 loads without errors on the real Forever build.
**Depends on**: Phase 8
**Requirements**: LNCH-01, LNCH-02
**Success Criteria** (what must be TRUE):
  1. In a Forever beta session, login, a combat session with each skinned window open, and one auction Post each produce zero Lua errors, with the `/vg errors` output recorded.
  2. The TOC `## Interface` line holds the real Forever release build number, read from `/vg status` in the client, before `npm run package` runs.
  3. The packaged zip passes `scripts/check-zip.mjs`, and installing it into a clean `AddOns` folder loads Vanguard (in-game check).
  4. The author has walked the combined needs-in-game-check list, ordered by crash risk (login, combat and Post first).

**Plans**: TBD
**UI hint**: no
**Notes**: Phases 9-11 can be cut without blocking this phase, but the beta session needs Phase 5 merged. Timing risk: the beta may close around 2026-10-21 (unverified). Read `/vg status` at the first beta login, and run the zero-error session as soon as Phase 5 merges, even though this phase closes last. Research also suggests rehearsing a patch release before 2026-11-02, confirming the module-off safe mode, checking the CurseForge and Wago Forever game-version entries (not researched), and a code freeze on 2026-11-01. `.planning` is already in the `.pkgmeta` ignore list.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Phases 9-11 are cut first if time runs short; Phase 12 runs regardless.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Green baseline | 2/2 | Complete    | 2026-10-09 |
| 2. Errors fail tests | 13/13 | Complete    | 2026-10-10 |
| 3. Fast suite and CI gate | 7/7 | Complete    | 2026-10-11 |
| 4. Lean core | TBD | Complete | 2026-10-12 |
| 5. Auction Post fix | 0/TBD | Not started | - |
| 6. Theme scale and motion | TBD | Complete | 2026-10-12 |
| 7. Control states and panel depth | TBD | Complete | 2026-10-12 |
| 8. Every window styled | 0/TBD | Not started | - |
| 9. Levelling helpers | 0/TBD | Not started | - |
| 10. Roll tracking | 0/TBD | Not started | - |
| 11. Party quest progress | 0/TBD | Not started | - |
| 12. Launch readiness | 0/TBD | Not started | - |
