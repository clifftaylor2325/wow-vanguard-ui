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
- [x] **Phase 8: Every window styled** - The PvP windows are reskinned and visual issues #187-#204 are closed (completed 2026-10-12)

UI coherence (priority 3, polish and consistency; INSERTED 2026-10-17 from Cliff's UI/UX review, spec in `docs/design/UI-COHERENCE.md`; in flight alongside, not phases: PR #393 pill controls (merged 2026-10-17), the consistency fixes on `work/ui-consistency`, the frame-coverage batches on `work/reskin-coverage-1` to `-3`, the research doc PR #394 (merged 2026-10-17), and the design thread's game-frame primitives on `work/game-primitives`. Cliff answered every [DECIDE] on 2026-10-17, taking the recommendation each time):

- [x] **Phase 8.1: Theme tokens and capsule kit** (INSERTED) - Every variant keeps the surface order, and pills, discs and badges are one theme primitive and one media set
- [x] **Phase 8.2: Check box primitive** (INSERTED) - No game check box art inside any window Vanguard owns
- [ ] **Phase 8.3: One material per window** (INSERTED) - The inbox, the spellbook and talent pages and the character pane's stats are slate inside, and the material tiers are written down
- [ ] **Phase 8.4: Control grid and button kinds** (INSERTED) - Every control on one grid, with secondary, primary and danger buttons
- [ ] **Phase 8.5: Selection grammar and row press** (INSERTED) - "Selected" is said three ways and no other, and rows press like buttons
- [ ] **Phase 8.6: One yellow, type pairings and empty states** (INSERTED) - Gold marks content only, each place has one text role and colour, and an empty list says what fills it
- [x] **Phase 8.7: States, keyboard and menus** (INSERTED) - One state matrix in code, and menus close like menus
- [ ] **Phase 8.8: Dialogs and button order** (INSERTED) - One primary per dialog, destructive actions never brass, Escape and Enter work
- [x] **Phase 8.9: Spacing sweep** (INSERTED, cuttable) - Every window's padding and footer sit on `T.SPACE`
- [ ] **Phase 8.10: Knob and thumb ease** (INSERTED, cuttable) - Knobs glide 0.1 s out of combat
- [ ] **Phase 8.11: UI batch checklist and probes** (INSERTED) - One in-game list for every look the UI coherence work changed, with the probes that gate the open decisions

Levelling and group features (priority 4, cut first):

- [x] **Phase 9: Levelling helpers** - Quest XP, kills to level and low-supply warnings (completed 2026-10-12)
- [x] **Phase 10: Roll tracking** - `/roll` results and loot rolls are tracked (loot rolls cuttable) (completed 2026-10-12)
- [ ] **Phase 11: Party quest progress** - Live party quest progress over addon messages (cuttable; the author's call)
- [ ] **Phase 11.1: Levelling guide** (INSERTED) - Vanguard's own levelling guide from the client's data: a chat-only probe first (LG-0), then an owner tag on waypoints (LG-1) and a ranking engine only if the probe passes (LG-2)

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

### Phase 8.1: Theme tokens and capsule kit (INSERTED)

**Goal**: Every theme variant keeps its surfaces in lightness order, and the pill shape PR #393 introduced is one theme primitive and one checked media set that any control, badge or thumb can use.
**Owner**: a new thread (Sonnet, medium)
**Depends on**: G0 (the consistency PR on `main`; PR #393 merged 2026-10-17); PR #395, whose slider parts this phase moves into `T.Capsule`, merged 2026-10-17
**Requirements**: UI-09
**Success Criteria** (what must be TRUE):
  1. A `theme.test.mjs` case checks, for every variant, that `inset` < `panel` < `raised` < `raisedHover` < `divider` < `borderHi` in OKLCH lightness, and the contrast variant passes it (its `divider` moves below `borderHi`; `raisedHover` and `borderHi` become per-variant tokens).
  2. `T.Capsule(frame, height, tier)` in `Core/Theme.lua` paints a pill of any height and tier with its 1 px edge; #393's switch and slider use it, and the local `pillParts` and `placePill` in `Core/Controls.lua` are gone.
  3. The pill and knob media land their outline on one screen pixel at 18, 14 and 12 px (a `media.test.mjs` case), `Disc20Soft` and the `Up` glyph exist, and `node scripts/build-media.mjs --check` passes.
  4. The error badge is a capsule (14 high, `accent` fill, `void` text, `99+` cap), and the auction table's sort arrow uses `Up` instead of a rotated `Down`.
**Files**: `Core/Theme.lua` (`T.VARIANTS`, the constants block, new `T.Capsule`), `Core/Controls.lua` (pill helpers out), `Core/ErrorBadge.lua`, `Modules/AuctionTable.lua` (the arrow only), `scripts/lib/media-sources.mjs`, `docs/THEME.md`, `scripts/tests/theme.test.mjs`, `scripts/media.test.mjs`.
**Size**: M.
**Waits on [DECIDE]**: none.
**Needs in-game check**: the contrast variant's dividers and hover fills; the error badge; pills crisp at 1080p, 1440p and `pixelMultiple` 2.
**Plans**: TBD
**UI hint**: yes

### Phase 8.2: Check box primitive (INSERTED)

**Goal**: The game's gold-rimmed check boxes no longer show inside any window Vanguard owns or skins.
**Owner**: the UI/UX design research thread (`work/checkbox`)
**Depends on**: nothing; it merged as PR #397 on 2026-10-17, before G0, because its `Core/Theme.lua` region is one the consistency PR does not touch; the consistency PR brings `main` in once before it opens. Gate G1: on `main` before the coverage thread's batch 2 skins any check box; the call sites in a window belong to whichever PR lands second.
**Requirements**: UI-11
**Success Criteria** (what must be TRUE):
  1. `T.CheckBox(button)` paints a 16 px `inset` box with a 1 px `edge` and a 12 px `Check` glyph, follows the game's checked state by post-hooking `SetChecked`, has the hover, press, disabled and focus states of the state matrix, and keeps the game's parts faded by alpha (never hidden, no field stored on the game's frame).
  2. `T.CheckBox` is exported through `Core/Skin.lua` and documented in `docs/API.md`.
  3. The check boxes skinned windows leave in game art today (friends, raid, chat config and settings; `Modules/WindowsSocial.lua:511` says so) use it, and a test opens each and finds no game check art.
**Files**: `Core/Theme.lua` (new `T.CheckBox`, the `T.EditBox` region), `Core/Skin.lua`, `docs/API.md`, the call sites in `Modules/Windows*.lua` (lines only), `scripts/tests/theme.test.mjs`, `scripts/tests/skins.test.mjs`, the matching `windows-*.test.mjs`.
**Size**: S.
**Waits on [DECIDE]**: none. Decided 2026-10-17: 8a, the dark box with a brass check, which is `T.CHECK`'s merged default.
**Needs in-game check**: a check box in the friends and chat config windows, checked, unchecked and disabled.
**Plans**: done in PR #397 (merged 2026-10-17): `T.CheckBox`, `S.CheckBox`, the THEME.md tiers and state matrix, the raid tab, addon list and chat settings call sites; the other windows' call sites ride the coverage thread's batch 2.
**UI hint**: yes

### Phase 8.3: One material per window (INSERTED)

**Goal**: Inside the inbox, the spellbook and talent pages and the character pane, every inner surface is `inset`, `raised` or `panel`, and the material tier table the coverage batches paint to is written down.
**Owner**: the Game interface coverage audit thread, inside its batch 2 (`work/reskin-coverage-2`); moved from the design thread's `work/one-material` on 2026-10-17 so one thread edits the `Modules/Windows*.lua` files. The design thread wrote the tier table.
**Depends on**: the coverage thread's batch 1 merged (this phase is part of batch 2); the tier table on `main` in any of its copies (`docs/design/UI-COHERENCE.md` §2.3, `docs/design/DESIGN-PRINCIPLES.md` §1.6 or `docs/THEME.md` from the check-box PR) before the painting starts.
**Requirements**: UI-11
**Success Criteria** (what must be TRUE):
  1. `docs/THEME.md` carries the material tier table (`docs/design/UI-COHERENCE.md` §2.3) and the nesting rule, written by the design thread in the check-box PR, and batch 2 paints to it rather than inventing tiers.
  2. The inbox rows and parchment (`MailFrame`, `InboxFrame`), `PlayerSpellsFrame`'s page and tree art and the character pane's leftover stats art are faded by alpha and painted to the table; portraits, icons and the talent tree's spell icons stay.
  3. A test opens each of the three windows and finds the game's art at alpha 0 with the tier panel behind, and no error with the matching `Windows` group off.
**Files**: `Modules/WindowsSocial.lua` (mail), `Modules/WindowsTabs.lua` (spellbook and talents, character pane), `Modules/WindowsTown.lua` (merchant material; batch 1 builds the rows), `docs/THEME.md` (the tier table, from the check-box PR), `scripts/tests/windows-social.test.mjs`, `scripts/tests/windows-tabs.test.mjs`, `scripts/tests/windows-town.test.mjs`.
**Size**: M.
**Waits on [DECIDE]**: none.
**Needs in-game check**: the inbox with mail in it, the spellbook and the talent tree, the character pane's stats, each in two variants.
**Plans**: TBD
**UI hint**: yes

### Phase 8.4: Control grid and button kinds (INSERTED)

**Goal**: Every Vanguard control sits on one grid (rows 28, inline controls 20, standalone buttons 26, a 200-wide control column), and buttons come in secondary, primary and danger kinds.
**Owner**: a new thread (Sonnet, medium)
**Depends on**: Phase 8.1
**Requirements**: UI-09
**Success Criteria** (what must be TRUE):
  1. Switch track, dropdown, segment group, edit box and slider thumb area are `T.CONTROL_H` high; standalone buttons are `T.BUTTON_H`; the control column is `W.COLUMN` (200) with the slider value in `W.VALUE_SLOT` (60); a test fails if the literals 180, 140, 52 or −66 come back.
  2. The switch and slider keep the sizes merged in PR #393 (settled as [DECIDE] 13), centred in the 20 px slot; the slider's fill is `borderHi` under the solid thumb ([DECIDE] 5a); the slider thumb shows a 20 px `hover` wash disc on hover (12 % while dragging).
  3. `T.Button` takes `primary` (accent fill with no bevel line through it, `void` SemiBold label, hover eases to `accentText`) and `danger` (`bad` label, never a red fill); `W.Primary` is built on it.
  4. A segment group is one `inset` panel with 1 px `divider` lines between segments and `label`-sized text, the selected segment in `accent` with `void` text; the dropdown is 200x20 and its menu items 24 high.
  5. Slider values print a space before `%`, and every options page holds at Text size 130 % with no overlap (a harness width check).
**Files**: `Core/Theme.lua` (`T.Button`), `Core/Controls.lua`, `Core/Widgets.lua`, `Core/Dialog.lua` (button height only), `Core/OptionsProfiles.lua` (danger on Delete), `README.md` and `docs/THEME.md` where they state sizes, `scripts/tests/options.test.mjs`, `scripts/tests/theme.test.mjs`.
**Size**: M.
**Waits on [DECIDE]**: none. Decided 2026-10-17: 5a, a `borderHi` fill under the solid thumb; 2 and 13 were settled by Cliff's in-game look the same day.
**Needs in-game check**: an options page with every control kind at 100 % and 130 % text; the primary button's top edge (no light line through the brass); the switch and slider in each theme.
**Plans**: TBD
**UI hint**: yes

### Phase 8.5: Selection grammar and row press (INSERTED)

**Goal**: "Selected" is said in three ways only (an accent fill for choose-one-of-few, a rail for navigation, an attached tab for the current page), and a pressed row darkens like a pressed button.
**Owner**: the UI/UX design research thread (`work/select-press`; Sonnet, medium, as CLAUDE.md keeps high effort for the Opus cases: the brief names the three tab templates and where each takes its selected state)
**Depends on**: G0 (the consistency PR's `W.Row`; this phase lands inside `W.Row:SetSelected`, with only an additive `T.PressRow` allowed before that); `T.Row` and `T.RowState`, the game-frame row the coverage thread's batch-2 plan asks for, land here too with the same look
**Requirements**: UI-07
**Success Criteria** (what must be TRUE):
  1. `T.Panel` takes `open` (TOP, BOTTOM, LEFT or RIGHT: that edge draws no line and no sheen), and the selected tab on all three game templates (`PanelTabButtonTemplate`, `TabSystemButtonTemplate`, `LargeSideTabButtonTemplate`) and on Vanguard's own tabs is the attached tab ([DECIDE] 3a), with no accent anywhere on a tab.
  2. The options nav, the AH lists, the quest log and quest dialog lines and the group board mark their current row one way, the 2 px `accent` rail plus a `raisedHover` fill ([DECIDE] 4a), drawn by `W.Row:SetSelected`; no row is marked by text colour alone or by an accent wash, and the nav icon stays `text`.
  3. A pressed row shows the `shade` 20 % overlay (`T.PressRow`); maximize and minimize hover to a `raisedHover` tile ([DECIDE] 12a) while close keeps its `bad` tile; the dropdown menu keeps `accentText` plus the check.
  4. A test opens each tab template and each list and checks the selected and pressed parts.
**Files**: `Core/Theme.lua` (`T.Panel`, `paintTab`, `T.CONTROL_TILES`, `T.PressRow`, `T.SelectRow` and `T.SELECT`), `Core/Chrome.lua` (`W.Row:SetSelected`), `Core/OptionsWindow.lua` (`markNav`), `Modules/AuctionShop.lua`, `Modules/AuctionHelper.lua`, `Modules/QuestDialogParts.lua`, `Modules/GroupBoardView.lua`, `scripts/tests/windows-tabs.test.mjs`, `scripts/tests/options.test.mjs`, the auction and quest tests.
**Size**: M.
**Waits on [DECIDE]**: none. Decided 2026-10-17: 3a (the attached tab), 4a (the rail plus a lighter fill; THEME.md's state-matrix row for navigation changes from the 14 % accent wash in the same commit) and 12a (maximize and minimize hover to a grey tile, close alone in colour; THEME.md's window-control exception goes).
**Needs in-game check**: tabs in the character pane (side tabs), spellbook, AH, mail and friends; the options nav in each variant; a pressed row.
**Plans**: TBD
**UI hint**: yes

### Phase 8.6: One yellow, type pairings and empty states (INSERTED)

**Goal**: The game's gold marks content only, every place (window title, section header, column header, caption, value, hint) has one text role and colour, and an empty list or panel says what will fill it.
**Owner**: a new thread (Sonnet, medium)
**Depends on**: G0; the coverage thread's batch 2 for the check in criterion 1 (it moves the gold heads in its own files)
**Requirements**: UI-08
**Success Criteria** (what must be TRUE):
  1. A quality-scan rule or test fails on a `gold` colour in a title, header or tag table; money, quest titles, elite names, the crown and AH prices keep it. (The skinned windows' titles and zone headers leave gold in the consistency PR; the heads in `Modules/Windows*.lua` leave it in coverage batch 2.)
  2. `T.ROLES` gains an `upper` flag and section headers use it instead of `:upper()` on the string; section headers outside the options window are the same small `muted` capitals ([DECIDE] 6a); skinned game window titles stay centred, in the `title` role and `text` ([DECIDE] 1a).
  3. Column headers stay `text2` when sorted (the arrow alone marks the sort) and show the `hover` wash; bag section headers are `small` `text2`, off the accent.
  4. The meter says "No damage yet this fight" instead of "Nothing to show"; the AH table says no auctions were found and to scan first, with the scan button as the primary; the quest tracker says "Nothing tracked. Track a quest from the log." when empty, unless its README sentence says it hides (the README wins).
  5. `docs/THEME.md` has a "Type pairings" table matching `docs/design/UI-COHERENCE.md` §2.6, and each changed line has a test and its README sentence.
**Files**: `Core/Theme.lua` (`T.ROLES`), `Core/Chrome.lua` (the one-line alignment default), `Modules/AuctionTable.lua` (header colour, hover, status line), `Modules/BagSections.lua`, `Modules/Meter.lua`, `Modules/QuestTrackerView.lua`, `scripts/lib/code-quality.mjs` (the rule), `docs/THEME.md`, `README.md`, the matching tests.
**Size**: S.
**Waits on [DECIDE]**: none. Decided 2026-10-17: 1a (game window titles stay centred, `title` in `text`, as the coverage thread's `GW.SkinTitle` paints them) and 6a (small grey capitals for section headers everywhere).
**Needs in-game check**: a book or letter (H1 to H3), the guild creation heads, the bag section headers, one skinned window title per area, the meter before a fight, the AH before a scan.
**Plans**: TBD
**UI hint**: yes

### Phase 8.7: States, keyboard and menus (INSERTED)

**Goal**: Every control follows one state matrix (hover, press, disabled, focus), and menus open and close the way players expect.
**Owner**: the UI/UX design research thread (`work/ui-states`)
**Depends on**: Phase 8.4 for everything in `Core/Controls.lua`. Safe at G0: the setup wizard's focus ring and the edit-box focus border. Safe now: the state matrix written into `docs/THEME.md`.
**Requirements**: UI-10
**Success Criteria** (what must be TRUE):
  1. The switch's press drops its knob 1 px and never recolours the track; no control fades its whole alpha to look disabled (a test scans the constructors); `docs/THEME.md` carries the state matrix (`docs/design/UI-COHERENCE.md` §2.5).
  2. `T.FocusRing` shows on the setup wizard's rows and on dialog buttons when Tab reaches them; edit boxes turn their border `accentText` while focused; the search box shows a clear glyph while it has text.
  3. A dropdown keeps its `raisedHover` fill while its menu is open; a menu with more than 16 rows shows the 4 px thumb; Escape and a click outside close the menu; the Left and Right keys step a focused slider.
**Files**: `Core/Controls.lua`, `Core/Widgets.lua`, `Core/Setup.lua`, `Core/Dialog.lua` (focus only), `Core/Theme.lua` (callers of `T.FocusRing` and `T.EaseHover` only), `docs/THEME.md`, `scripts/tests/options.test.mjs`, `scripts/tests/setup.test.mjs`.
**Size**: M.
**Waits on [DECIDE]**: none.
**Needs in-game check**: Tab through the setup wizard; open the Font menu and press Escape; click outside an open menu; type in the options search and clear it; a pressed switch.
**Plans**: TBD
**UI hint**: yes

### Phase 8.8: Dialogs and button order (INSERTED)

**Goal**: Every dialog has one primary action, a destructive action is never brass, dialogs open like windows, and Escape and Enter do what they say.
**Owner**: a new thread (Sonnet, medium)
**Depends on**: Phase 8.4 (button kinds)
**Requirements**: UI-12
**Success Criteria** (what must be TRUE):
  1. `ns.Dialog` question and text dialogs are 360 and 520 wide with `T.SPACE.pad` padding, open with `T.OpenWindow`, and close on Escape (No or Later); the reload prompt's Reload is the primary (if the consistency PR has not already made it so).
  2. Destructive confirms (Delete profile, Abandon) use the danger kind; Enter presses the primary ([DECIDE] 11a) and never a destructive one; the reload prompt's secure overlay still does the reload (`ReloadUI` is blocked from addon code on Forever); Enter is caught without changing keyboard propagation in combat (modern clients block `SetPropagateKeyboardInput` from addon code in combat; confirm in the 12.1 API docs).
  3. The quest log's Abandon and the quest dialog's Goodbye sit alone at the far left ([DECIDE] 10a), and the footer rule (primary rightmost at the padding, secondary 8 left, escape or destructive alone at the far left) is written in `docs/THEME.md`.
**Files**: `Core/Dialog.lua`, `Core/ProfileExport.lua`, `Core/OptionsProfiles.lua`, `Modules/QuestLogView.lua`, `Modules/QuestDialogView.lua`, `docs/THEME.md`, the tests that cover `ns.Ask` and the quest windows.
**Size**: S.
**Waits on [DECIDE]**: none. Decided 2026-10-17: 10a and 11a.
**Needs in-game check**: the reload prompt reloads; delete a profile; abandon a quest; Escape on each dialog.
**Plans**: TBD
**UI hint**: yes

### Phase 8.9: Spacing sweep (INSERTED, cuttable)

**Goal**: Every Vanguard window's padding, card inset, footer and gap come from `T.SPACE`, so two layouts written by two people line up.
**Owner**: a new thread (Sonnet, medium)
**Depends on**: Phase 8.4 and the consistency PR (so the sweep lands once, after the helpers)
**Requirements**: UI-13
**Success Criteria** (what must be TRUE):
  1. Window edge padding is `T.SPACE.pad` (16), card insets `T.SPACE.col` (12), gaps `T.SPACE.gap` (8) and tight gaps `T.SPACE.tight` (4) in every Vanguard-drawn window (the audit lists today's 4 to 16 by window); the options cards' `PAD` 10 becomes 12 and the nav insets 14 and 9 become 12 and 8.
  2. The seven footers at 12 (`Core/Dialog.lua:62-64` and its siblings) move to the padding, and the mover popover's inputs match the width of the dropdowns above them.
  3. A quality-scan rule or test fails on a new odd or off-scale padding constant in a layout file.
**Files**: `Core/OptionsWindow.lua`, `Core/Dialog.lua`, `Core/Setup.lua`, `Core/WhatsNew.lua`, `Core/MoverPopover.lua`, `Core/ProfileExport.lua`, `Core/Feedback.lua`, the module windows the audit lists (`Modules/QuestLogView.lua`, `Modules/QuestDialogView.lua`, `Modules/GroupBoardView.lua`, `Modules/AuctionHelper.lua`, `Modules/MailTools.lua`, `Modules/InstancePrep*.lua`), `scripts/lib/code-quality.mjs`, `docs/THEME.md`, the matching tests.
**Size**: M.
**Waits on [DECIDE]**: none.
**Needs in-game check**: one window per area side by side (options, quest log, a dialog, the mover popover) for equal edges.
**Plans**: TBD
**UI hint**: yes
**Notes**: Cut first if the 2026-10-28 freeze is near; it changes no behaviour.

### Phase 8.10: Knob and thumb ease (INSERTED, cuttable)

**Goal**: A switch's knob and a slider's thumb glide 0.1 s to their new place out of combat, and jump in combat or with Reduce motion on.
**Owner**: a new thread (Sonnet, medium)
**Depends on**: Phase 8.4 (Cliff's look at the pill controls came on 2026-10-17)
**Requirements**: UI-14
**Success Criteria** (what must be TRUE):
  1. The knob moves with a `Translation` animation on its own (never protected) frame, ends snapped to the pixel grid, and is instant in combat and with Reduce motion; harness tests cover all three.
  2. `T.KNOB_EASE` has a row in `docs/THEME.md`'s fades table.
**Files**: `Core/Controls.lua`, `Core/Theme.lua` (the constant), `docs/THEME.md`, `scripts/tests/options.test.mjs`.
**Size**: S.
**Waits on [DECIDE]**: none. Decided 2026-10-17: 7a, build it; still the second cut if it is not merged by the freeze.
**Needs in-game check**: flip a switch in and out of combat, with Reduce motion on and off.
**Plans**: TBD
**UI hint**: yes
**Notes**: Cut with Phase 8.9 if the freeze is near.

### Phase 8.11: UI batch checklist and probes (INSERTED)

**Goal**: Cliff has one in-game list, in crash-risk order, for every look the UI coherence work changed, with the probes whose answers change the plan at the top.
**Owner**: a new thread (Haiku, low)
**Depends on**: Phases 8.1 to 8.10 merged or cut, and the in-flight PRs merged
**Requirements**: none (it closes the check loop for UI-07 to UI-14)
**Success Criteria** (what must be TRUE):
  1. `docs/SMOKE-TEST.md` has a UI coherence section built from every merged PR's needs-in-game-check list, opening with the ten probes in `docs/design/UI-COHERENCE.md` §8, and one GitHub issue carries the same list as checkboxes, the way #284 does for batch 1.
**Files**: `docs/SMOKE-TEST.md`.
**Size**: S.
**Waits on [DECIDE]**: none.
**Plans**: TBD
**UI hint**: no

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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Phases 9-11 are cut first if time runs short; Phase 12 runs regardless. The inserted UI coherence phases (8.1 to 8.11) follow the gates in `docs/design/UI-COHERENCE.md` §4.2 rather than the numeric order: 8.2 merged as PR #397 before G0 (the consistency PR on `main`; PR #393 merged 2026-10-17); 8.3 rides the coverage thread's batch 2 after its batch 1 merges; 8.1, 8.5 and 8.6 start at G0; 8.4 after 8.1; 8.7, 8.8, 8.9 and 8.10 after 8.4; 8.11 last. Phases 8.1 to 8.8 merge before the 2026-10-28 freeze; 8.9 and 8.10 are cut first.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Green baseline | 2/2 | Complete    | 2026-10-09 |
| 2. Errors fail tests | 13/13 | Complete    | 2026-10-10 |
| 3. Fast suite and CI gate | 7/7 | Complete    | 2026-10-11 |
| 4. Lean core | TBD | Complete | 2026-10-12 |
| 5. Auction Post fix | 0/TBD | Not started | - |
| 6. Theme scale and motion | TBD | Complete | 2026-10-12 |
| 7. Control states and panel depth | TBD | Complete | 2026-10-12 |
| 8. Every window styled | TBD | Complete | 2026-10-12 |
| 8.1 Theme tokens and capsule kit | 0/TBD | Not started | - |
| 8.2 Check box primitive | 1/1 | Complete | 2026-10-17 |
| 8.3 One material per window | 0/TBD | Not started | - |
| 8.4 Control grid and button kinds | 0/TBD | Not started | - |
| 8.5 Selection grammar and row press | 0/TBD | Not started | - |
| 8.6 One yellow, type pairings and empty states | 0/TBD | Not started | - |
| 8.7 States, keyboard and menus | 1/1 | Complete | 2026-10-17 |
| 8.8 Dialogs and button order | 0/TBD | Not started | - |
| 8.9 Spacing sweep | 0/TBD | Not started | - |
| 8.10 Knob and thumb ease | 0/TBD | Not started | - |
| 8.11 UI batch checklist and probes | 0/TBD | Not started | - |
| 9. Levelling helpers | TBD | Complete | 2026-10-12 |
| 10. Roll tracking | TBD | Complete | 2026-10-12 |
| 11. Party quest progress | 0/TBD | Not started | - |
| 11.1 Levelling guide | 0/TBD | Not started | - |
| 12. Launch readiness | 0/TBD | Not started | - |
