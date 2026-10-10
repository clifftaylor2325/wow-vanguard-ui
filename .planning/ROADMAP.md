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

- [ ] **Phase 1: Green baseline** - The full suite passes on main, each #169 case is resolved with evidence, and coverage reports again
- [ ] **Phase 2: Errors fail tests** - A swallowed addon error fails its test, and runs give the same result every time
- [ ] **Phase 3: Fast suite and CI gate** - The full suite runs in under 5 minutes on the hosted runner, on ready-for-review and the full-tests label
- [ ] **Phase 4: Lean core** - Dead code is gone, and per-frame and unit-event work goes through shared helpers

Auction house (priority 2):

- [ ] **Phase 5: Auction Post fix** - Post lists the auction on both paths, and every silent exit shows a reason

UI polish (priority 3):

- [ ] **Phase 6: Theme scale and motion** - One type scale, spacing grid and fade helper, all in Theme
- [ ] **Phase 7: Control states and panel depth** - Controls react to hover, press, disabled and focus, and panels have depth
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
**Plans**: TBD
**Notes**: Re-baseline first. Sources disagree on what is red (751/751 passing locally on 2026-10-09 against seven red cases in #169), so compare clean main locally and on the hosted runner before chasing anything. Research also suggests pinning fengari 0.1.5 and luacheck 1.2.0 (official binary, checked by SHA-256), moving CI to Node 24 with an `.nvmrc`, and running `npm ci` so local Vitest matches the lock file.

### Phase 2: Errors fail tests
**Goal**: A test cannot pass while the addon swallows an error, and a red run says exactly what broke.
**Depends on**: Phase 1
**Requirements**: CI-03, CI-04
**Success Criteria** (what must be TRUE):
  1. Any test that leaves an entry in the addon's error list (`ns.errors`) fails, and the failure prints the error text and where it came from. Only tests on a named allow-list (tests of the error handling itself) are exempt.
  2. Errors raised inside `hooksecurefunc` callbacks, `OnClick` handlers and `C_Timer` callbacks reach the error list, so a throwing handler fails its area test instead of passing.
  3. The full suite gives the same result on repeated runs and under a shuffled order seed. Any flaky case found is fixed, not retried.
  4. The suite stays green with the guard on: errors it exposes are fixed in the addon, not added to the allow-list.
**Plans**: TBD
**Notes**: Today only `smoke.test.mjs` asserts zero errors, and 81 `hooksecurefunc` sites, about 57 `OnClick` handlers and 21 raw `C_Timer` calls bypass `ns.Try`. Put the guard in a global `afterEach` in `scripts/tests/setup.mjs` and wrap the money paths first. Research also recommends a combat-lockdown mode and a per-module secret-value sweep in the harness. Both help the launch combat check; plan-phase decides whether they fit here.

### Phase 3: Fast suite and CI gate
**Goal**: The full suite is fast enough to run on every PR that is ready for review, and it runs there automatically.
**Depends on**: Phase 2
**Requirements**: CI-05, CI-06
**Success Criteria** (what must be TRUE):
  1. Every push runs the quick check, and marking a PR ready for review, or adding the `full-tests` label, starts the full suite.
  2. The full suite finishes in under 5 minutes wall time on the hosted runner, and the measured time, with per-file times, is recorded in the phase PR.
  3. No case was dropped or skipped to reach the time: the test count and the 100% coverage floor match the start of the phase.
**Plans**: TBD
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
| 1. Green baseline | 0/TBD | Not started | - |
| 2. Errors fail tests | 0/TBD | Not started | - |
| 3. Fast suite and CI gate | 0/TBD | Not started | - |
| 4. Lean core | 0/TBD | Not started | - |
| 5. Auction Post fix | 0/TBD | Not started | - |
| 6. Theme scale and motion | 0/TBD | Not started | - |
| 7. Control states and panel depth | 0/TBD | Not started | - |
| 8. Every window styled | 0/TBD | Not started | - |
| 9. Levelling helpers | 0/TBD | Not started | - |
| 10. Roll tracking | 0/TBD | Not started | - |
| 11. Party quest progress | 0/TBD | Not started | - |
| 12. Launch readiness | 0/TBD | Not started | - |
