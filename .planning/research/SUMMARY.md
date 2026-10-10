# Project Research Summary

**Project:** Vanguard (WoW: Forever UI suite, Lua 5.1)
**Domain:** Brownfield WoW addon UI suite, headless Lua test harness (Node, fengari), hosted-runner CI on a private GitHub Free plan
**Researched:** 2026-10-09
**Launch deadline:** 2026-11-04, 15:00 PST (about 26 days from research date)
**Confidence:** MEDIUM overall. Repo and measurement facts are HIGH. Forever client behaviour is LOW to MEDIUM (unobserved; nobody can run the game).

## Executive Summary

Vanguard is a mature, from-scratch UI suite replacing most of the default interface with one "Slate & Brass" look. It is not greenfield. The runtime architecture (one event hub, unit-filtered events, `ns.Try` isolation, coalesced repaints, hub-and-satellite files) is sound. Launch-critical work sits on the test rail, the auction Post bug, and window polish. The new levelling and group features are small and mostly extend existing modules; several items in PROJECT.md are already built.

Recommended approach: fix the foundation first. Get the suite green and trustworthy, make the harness catch errors and combat lockdown, cut test-login cost, then fix the auction Post path before the files are split. Then dead-code removal, event-rail fixes, file splits, UI polish. New features come last and are cut first. Keep the stack (Lua 5.1, Vitest 5.0.3, fengari 0.1.5 pinned exact, luacheck 1.2.0), but pin exact versions, use the official luacheck binary with a checksum, move CI to Node 24, add a Lua-level profiler, and add an advisory API-name check against Ketho's `forever` branch.

Main risks: (1) the "full suite under 5 minutes on every PR" target is not supported by current measurements on a 2-vCPU private runner, and the minute budget is tight; (2) the red/green state is inconsistent across sources and must be re-baselined before speed or refactor work is trusted; (3) most launch-day risk is outside what the harness can show (secret values in combat, protected frames under lockdown, the real Post flow, interface number drift). Book one smoke session in the Forever beta now; the beta may end around 2026-10-21.

## Conflicts

1. **Is the suite green?** STACK.md (measured 2026-10-09 at `47f1e94`) and PITFALLS.md: `lua` project 751/751 passing locally, 0 failed, 58 files. PROJECT.md: seven full-suite cases red (#169), including three Lua-harness cases (raid tiles, plate glow, chat watch price). ARCHITECTURE.md: three harness cases plus the seven in #169. Project memory: the three harness cases failing on main as of 2026-10-07. Possible causes: local vs CI difference, failures only under CI load, or fixes after 2026-10-07. Action: re-baseline on clean `main` and on the hosted runner first.
2. **Per-PR gate vs 5-minute target.** PROJECT.md: full suite under 5 minutes on every PR. STACK.md: full suite fits the budget only if run once per PR (on `ready_for_review` or a label). PITFALLS.md: path-gated runs, full suite on `Core/` changes, merges to main, and weekly. ARCHITECTURE.md: plain `vitest run` per PR, coverage on merge and weekly. Four different CI designs. The author's stated preference conflicts with the budget arithmetic. Decision for the author.
3. **Suite timing.** STACK.md: 2,622 CPU-s (6 m 42 s wall, 16 threads; `more.test.mjs` 400 s). PITFALLS.md: 288 s wall for 58 files on a shared machine. ARCHITECTURE.md: `loggedIn` 600-800 ms warm, about 2 s cold. All on 16 cores. All agree the 2-vCPU runner will be 3-8x slower, but exact figures differ. Measure once on the hosted runner (per-file JUnit times are already uploaded).
4. **What is actually new.** PROJECT.md lists "quest XP values" and "supply reminders" as work. FEATURES.md and ARCHITECTURE.md show `InfoStrip` (XP/hour, time to level, gold/hour), `QuestLog`/`QuestDialog` (quest XP), `InstancePrep` (supplies) and `Errands` (keep-stocked) already exist. Real gaps: kills to level, XP waiting in the log, edge-triggered supply warnings, tracker XP line, roll tracker and history, `/roll` tracking, "who has this quest" via `C_QuestLog.IsUnitOnQuest`. Author should confirm the gap list.
5. **Party quest progress and comms.** FEATURES.md: v1.x after launch, with a new `Core/Comms.lua`. ARCHITECTURE.md: separate, cuttable, `[DECIDE]` with author. PITFALLS.md: addon messaging out for launch (may be blocked in vanilla instances). Synthesis: exclude comms from launch; ship only `IsUnitOnQuest` "who has it".
6. **Loot roll data source.** FEATURES.md: `START_LOOT_ROLL` plus `C_LootHistory`, rated P1. ARCHITECTURE.md and PITFALLS.md: `C_LootHistory` removed from retail in 10.1; presence on 12.1 vanilla unknown (LOW). Synthesis: keep only with feature detection and an in-game check; cut first if missing.
7. **Interface number.** TOC uses 16001 and 120007 as given. STACK.md and PITFALLS.md: 16001 is listed as the Forever beta interface with no release value; release number may differ. Unverified; check `/vg status` in beta.

## Key Findings

### Recommended Stack

Keep the existing stack; pin tighter.

- Lua 5.1 (client, fixed). `luac5.1 -p` and luacheck `std = "lua51"`.
- Node.js 24 LTS: move CI from 22; add `.nvmrc`; re-time once.
- Vitest 5.0.3 exact: lockfile pins it, but local `node_modules` has 5.0.2. Run `npm ci`.
- fengari 0.1.5 exact (drop caret): harness patches fengari internals.
- luacheck 1.2.0 official binary with SHA-256 check, not apt (apt gives 1.1.2 on Ubuntu 24.04).
- `@resvg/resvg-js` 2.6.2 exact: output byte-checked by `build-media.mjs --check`.
- New tooling, priority order: (1) Lua sampling profiler in the harness (`debug.sethook` count hook tallying lines by module); (2) split `more.test.mjs` (400 s) and `auction.test.mjs` (177 s); (3) advisory `npm run check:api` against Ketho `forever` (`.cache/`, never committed; reports misses, never hard-fails); (4) weekly shuffle-seed run; (5) 2-day wasmoon spike only if steps 1-2 leave the suite above about 8 minutes CPU.
- Avoid: `wasmoon-lua5.1` (dormant fork republished 2026-10-08; supply-chain risk); sharding to save minutes; `--changed` for Lua areas; apt `lua-check`; self-hosted runner (ruled out); LuaLS in CI.
- Forever API facts (MEDIUM): shares Mainline UI architecture; `forever` branch (build 1.60.1, 70205/70334) has `C_ActionBar.*`, `C_Spell.GetSpellInfo`, `C_Item.*`, `C_UnitAuras.*` etc., and lacks top-level `GetActionCooldown`, `IsUsableAction`, `HasAction`, `GetSpellInfo`, `GetItemInfo`, `UnitAura`. `ns.IsForever` by interface range (16000-19999) is correct. `issecretvalue` and `canaccessvalue` present in Forever's `GlobalAPI.lua`.

### Expected Features

Must have for launch:
- Auction Post that posts, with a visible reason for each silent exit.
- Zero Lua errors at login, in combat, and on Post.
- Suite green and fast enough for the agreed CI design.
- Quest XP on the tracker row; "XP waiting in the log" on XP bar tooltip and tracker header (LOW).
- XP bar tooltip: percent, rested detail, kills to level (LOW), via `IS.CountXP` and `ns.PlainNumber`.
- Edge-triggered low-supply warning reusing `InstancePrep` counts and `want`; never in combat (LOW). Restock button is a stretch; player presses, never auto-buy.
- `/roll` tracker parsing the localised `RANDOM_ROLL_RESULT` global string (LOW).
- "Who has this quest" via `C_QuestLog.IsUnitOnQuest` (LOW, in-game check).
- UI polish: hover, pressed, disabled, focus states; panel depth via one Theme helper; type scale and spacing grid; feedback within 0.15 s and Reduce motion.
- PvP windows (RESKIN S8) registered with `GW.Add` (frame names need in-game confirmation).

Should have (after table stakes): roll tracker and history panel in Vanguard look (MEDIUM); roll-frame upgrade badge reusing `Upgrades`/`UpgradeWeights` (later); per-level history (new SavedVariables table, defer); level-up toast with trainer/talent nudge (LOW, if time); vendor restock button.

Defer past launch: live party quest progress and comms (HIGH cost, lockdown risk); any auto-Need or auto-roll (anti-feature; opt-in "auto-pass items I cannot equip" only, later, never Need); levelling route guides, own quest database or map pins, Questie protocol interop, loot council or DKP; anything automating gameplay (permanently out).

### Architecture Approach

The four-rail model is right. Runtime rail (`Libs` then `Core` then `Modules`, `ns.Module`, `ns.Settings`, `T.*`), event rail (`ns.On` globals, `ns.OnUnit` units, `ns.Try`, `ns.Soon`), test rail (`scripts/tests/*.test.mjs`, `helpers.loggedIn()`, fengari with wow-stub/world/layout), CI rail. Changes close seam leaks; no redesign.

Major components in the milestone:
1. `Core/Events.lua` plus new `Core/Ticker.lua` (`ns.Every`): one throttled, circuit-broken driver to replace about nine hand-rolled `OnUpdate` accumulators.
2. `Core/Theme.lua` (1298 lines) split into `ThemeFrames.lua` and `ThemeMotion.lua`: the only colour and size source; enforces Reduce motion and combat fade limit.
3. `Core/Options.lua` (898 lines) split into `OptionsPages*.lua`, one `O.AddPage` per feature.
4. Hub-and-satellite files (`AuctionHelper`, `Windows`, `QuestLog`): house pattern for splits.
5. `scripts/tests/helpers.mjs`: scoped login (`{ only }`, `{ skip }`) writing `modules[name] = false`; shared `beforeAll` logins for read-only cases.
6. New `Modules/PartyQuests.lua` and `Modules/LootRolls.lua` (cuttable; each is one TOC line, one test file, one README sentence).

Patterns: one split or behaviour change per commit; new Core file in `Vanguard.toc` before first use; no `RegisterEvent` outside `Core/Events.lua`; no `ns.On("UNIT_...")`; idle-cost test (`addon.cost(fn)`) for per-frame budgets.

### Critical Pitfalls

1. Bending the stub to go green. Decide each red case against Blizzard source; evidence in commit body; never loosen a harness rule and a test in one commit.
2. Swallowed errors. `hooksecurefunc` (81 sites, 0 wrapped), `OnClick` (about 57), raw `C_Timer` (21) bypass `ns.Try`. Only `smoke.test.mjs` asserts `#ns.errors == 0`. Add a global `afterEach` in `scripts/tests/setup.mjs` (allow-list for error-handling tests); wrap money-path hooks and clicks first.
3. Auction Post does nothing. `AH.Post` has three silent exits; the harness reports throttle always ready unless a test turns it off; `PostItem`/`PostCommodity` need a hardware event. Reproduce end to end (bag click, `SetPostItem`, price check, click Post, throttle drop, ready event, next stack) with `ns.errors` empty at each step; assert call arguments on both paths and `confirm`; visible reason per silent exit.
4. Secret values. Direct reads are guarded (76 files). Gaps: derived values, `string.format`, table keys from hidden data, fail-open if `issecretvalue` missing, chat and event payloads in encounters, harness table-secret hides type differences. Per-module table-driven secret sweep; no new `pcall` as a guard; check CVars `secretAurasForced` and `secretCooldownsForced` on Forever.
5. Protected frames and combat. Harness does not model lockdown. Add lockdown mode; login-in-combat test; grep checklist for secure-frame operations; in-combat smoke steps for each skinned window.
6. Suite time is cost per case. Profile login first; cut Enable cost in ActionBars, PlayerAuras, FrameAuras, UnitFrames, RaidTools, InstancePrep (ActionBars about 35% directional); scoped logins; shared logins; split the two largest files; then decide the gate with hosted measurements.
7. Minutes exhausted block all merges ($0 spending limit; 2,000 included minutes). Check allowance weekly; keep UI preview manual; agree break-glass (admin bypass, or local `npm run verify && npm run coverage` pasted into PR).
8. No in-game observation. Five merged fixes (#186, #188, #197, #199, #202) and eleven visual issues unverified. Book one beta session covering login and errors, setup wizard, one Post, combat with each skinned window open. Keep one needs-in-game-check file ordered by crash risk.
9. Late refactors. Lua 5.1 upvalue and load-order errors appear only in game. Structure-only commits; load-order check; structural freeze 2026-10-28.
10. Launch drift: interface number, widget API drift from build 1.60.1.70170, old beta addons in `AddOns`, CurseForge/Wago Forever game-version entry. Multi-value TOC interface once known; `npm run package` plus `scripts/check-zip.mjs`; install from real zip in clean folder; rehearse patch release before 2026-11-02; code freeze 2026-11-01.

Also: add `.planning/` to `.pkgmeta` `ignore` before any release candidate, or `scripts/pkgmeta.test.mjs` fails.

## Implications for Roadmap

Ordering follows the ARCHITECTURE.md dependency graph and PITFALLS.md risk ordering. Phase names are suggestions.

**Phase 1: Green baseline and trustworthy harness.** Re-baseline on clean `main` and hosted runner; evidence-backed resolution of each red case; `npm run coverage` reporting again; global zero-error `afterEach`; secret-sweep helper; lockdown mode; test failing if a 5.3-only global (`table.unpack`, `math.type`, `utf8`) is visible to addon code; luacheck binary pinned by checksum; fengari pinned; Node 24 and `npm ci`; timing line in reporter.
Addresses: suite green, 100% floor holds, deterministic. Avoids Pitfalls 1, 2, 4, 5, 6, 11. Research flag: none.

**Phase 2: Test-suite speed and CI design.** Lua sampling profiler (`npm run profile -- <area>`); Enable-cost cuts in the top six modules; scoped login helper; shared `beforeAll` logins; split `more.test.mjs` and `auction.test.mjs`; author decision on the per-PR gate (Conflict 2); wasmoon spike only if still above about 8 minutes CPU. Do not use Vitest sharding. Avoids Pitfalls 6, 7. Research flag: decision and measurement, not research.

**Phase 3: Auction Post fix.** End-to-end harness test driving the click with throttle drop and ready event; assertions on `PostItem`/`PostCommodity` arguments for both paths and `confirm`; `ns.errors` empty after each step; visible reason per silent exit; `ns.Try` around `SetPostItem` hook. Must precede splits of `AuctionShop.lua` and `AuctionSell.lua`. Avoids Pitfalls 2 and 3. Research flag: reproduction, not external research; whether a throwing post-hook aborts Blizzard's call must be checked in game.

**Phase 4: Review, dead code, event rail.** Remove six test-only functions (`ns.GridLineCount`, `ns.WatchMover`, `O.RowCount`, `W.Cycle`, `CC.Move`, `GW.SkinWith`) with their tests; sweep unused `defaults` keys, theme tokens, `Media/` files, `read_globals`; `Core/Ticker.lua` with `ns.Every` then convert nine drivers; `UnitFrames` and `AuraLegacy` to `ns.OnUnit`; measure and filter `RaidAuras` shared-frame `UNIT_AURA`; `ns.Try` on money-path `OnClick`; idle-cost test; old and new SavedVariables fixtures; review the "not on this client" event list; lint rules last. Avoids Pitfalls 9, 12, 13, 16. Research flag: none (RaidAuras decision needs measurement).

**Phase 5: Structural splits (cuttable after Theme and Options).** Split `Core/Theme.lua` (ThemeFrames, ThemeMotion), `Core/Options.lua` and `OptionsWindow.lua` by area; `AuctionShop.lua` after Phase 3 (lists, results, pane); then `MenuStrip`, `TalentPlanner`, `ActionBars`, `AuctionSell`, `RaidFrames`, `ClickCastOptions` as time allows. Stop at about 500 lines or no clean seam. Structure-only commits, test counts unchanged. Research flag: none.

**Phase 6: UI polish and PvP reskin.** Hover, pressed, disabled, focus states in widget constructors; panel depth helper (1 px border, bevel, edge glow sized to frame; no `SetTexCoord` crops on atlas art); type scale and 4 px grid; window fade 0.1-0.15 s via one helper respecting Reduce motion and combat; `docs/THEME.md` row per fade or sound; open visual bugs #187-#204 grouped by file; PvP windows via `GW.Add`, `onDemand` for load-on-demand frames. Avoid heavy blur and per-frame OnUpdate animation. Research flag: confirm PvP frame names on Forever in game.

**Phase 7: Levelling and group features (cut first).** Order: (1) quest XP on tracker row; "XP waiting in the log" on XP bar tooltip and tracker header; (2) XP bar tooltip detail and kills to level on `IS.CountXP` (move `XPRate` to a Core service first if a second module needs it); (3) edge-triggered low-supply warning on `InstancePrep`; restock button as stretch; (4) "who has this quest" via `C_QuestLog.IsUnitOnQuest` (in-game check); (5) `/roll` tracker with localised parsing; (6) loot roll tracker with bounded history, feature-detected, cut if APIs absent. Deferred: comms and party progress; roll-frame upgrade badge; per-level history; auto-pass (never Need). Cut-off 2026-10-28. Avoids Pitfall 15. Research flag: short API check before planning rolls and "who has this quest" (`C_LootHistory`, `START_LOOT_ROLL`, `C_QuestLog.IsUnitOnQuest` on 12.1).

**Phase 8: Launch freeze and release path.** In-game smoke pass with `/vg report` blocks (login, status, errors, setup wizard, one Post, combat with each skinned window open, a mover drag); real Forever interface number in TOC; `.planning/` in `.pkgmeta` ignore; `npm run package` plus `scripts/check-zip.mjs`; install from the real zip in a clean `AddOns` folder; rehearsed patch release before 2026-11-02; module-off safe mode confirmed; CurseForge and Wago Forever game-version entry checked; code freeze 2026-11-01 (after that only fixes for `/vg errors` reports). Avoids Pitfalls 8, 10, 18. Research flag: CurseForge and Wago Forever game-version support (not researched).

### Phase Ordering Rationale

- Harness before everything: Phase 1 turns swallowed errors, lockdown and secrets into test failures.
- Speed before refactors: Phase 2 before Phases 4-6.
- Auction before splits: Phase 3 fixes the root cause in unsplit files.
- Dead code and event rail before splits: Phase 4 shrinks what Phase 5 moves.
- Theme before polish; Options before features.
- Features last and cuttable: each is one file, one page, one test.

### Research Flags

Need a targeted check during planning: Phase 6 (PvP frame names on Forever); Phase 7 (`C_LootHistory`, `START_LOOT_ROLL`, `C_QuestLog.IsUnitOnQuest` on 12.1); Phase 8 (CurseForge and Wago Forever game-version support).
Standard, skip research: Phase 1 (repo-local), Phase 2 (measurement and mechanical edits), Phase 3 (reproduction), Phase 4 (repo-local scans already prototyped), Phase 5 (hub-and-satellite pattern exists).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Versions HIGH (npm, GitHub API). Forever API presence MEDIUM (Ketho `forever` branch, can lag). Hosted 2-vCPU speed and minute rounding unmeasured. |
| Features | MEDIUM | Competitor and policy info from listings and a 2009 policy page. Forever availability of `IsUnitOnQuest` and loot-history APIs unverified. Polish section is experience, not sourced. |
| Architecture | HIGH for seams; MEDIUM for test speed | Measured once on a 16-core machine; directional. Chat-lockdown claim from one third-party page. |
| Pitfalls | MEDIUM | Repo observations HIGH. Secret and taint rules from 12.0 wiki pages (alpha/beta-era) and addon-author reports (LOW to MEDIUM). Forever client behaviour LOW. |

Overall: MEDIUM. Buildable, but the suite state, CI design and new-feature API surface each need a measurement or decision before the dependent phase.

### Gaps to Address

- Suite state (Conflicts 1, 3): re-baseline in Phase 1; compare against base commit before chasing failures.
- Per-PR CI design (Conflict 2): author `[DECIDE]` before Phase 2 planning. Options: full suite every PR (budget risk); full suite on `ready_for_review` or label (recommended by STACK and PITFALLS); path-gated.
- Minutes allowance: no current figure; check weekly; record in each phase PR.
- Feature gap list (Conflict 4): author confirms before Phase 7.
- Comms (Conflict 5): author confirms launch excludes comms (recommended: exclude).
- Loot-roll API (Conflict 6): in-game check; cut if absent.
- Interface number (Conflict 7): read `/vg status` in beta; set TOC; add plausible values for release.
- Beta end date 2026-10-21: search text only; verify; book the smoke session before it if real.
- Secret CVars and fail-open: check `secretAurasForced`, `secretCooldownsForced`; confirm `issecretvalue` loaded before `ADDON_LOADED`.
- Harness secret model: table-based; document the gap or model as userdata proxy.
- Missing-event list from beta `/vg errors`: needed before Phase 4 closes.
- Hosted-runner measurement: none yet; measure before promising a time.
- Visual and in-game items: one needs-in-game-check file, ordered by crash risk (login, combat, Post) before appearance. The five merged fixes stay open until the author confirms.

## Sources

Primary (HIGH): repository at `47f1e94` on `work/gsd-planning`, observed 2026-10-09 (`Core/Events.lua`, `Core/Modules.lua`, `Core/Combat.lua`, `Core/AuraLegacy.lua`, `Core/Options.lua`, `Modules/AuctionSell.lua`, `Modules/InfoStrip.lua`, `Modules/InstancePrep.lua`, `Modules/QuestLog.lua`, `Modules/WindowsPvP.lua`, `Vanguard.toc`, `vitest.config.mjs`, `scripts/lib/lua-harness.mjs`, `scripts/tests/helpers.mjs`, `setup.mjs`, `smoke.test.mjs`, `.github/workflows/verify.yml`, `.luacheckrc`, `docs/SMOKE-TEST.md`, `scripts/lua-coverage-floor.json`); npm registry 2026-10-09; GitHub API 2026-10-09 (luacheck v1.2.0, `actions/*`, Gethe/wow-ui-source and Ketho BlizzardInterfaceResources `forever` branches); issue #169; GitHub Docs Actions billing.
Secondary (MEDIUM): warcraft.wiki.gg (`Secret_values`, Patch 12.0.0 and 12.1.0 API changes (partial read), `WOW_PROJECT_ID`, `TOC_format`, `C_ChatInfo.SendAddonMessage`, `C_QuestLog.IsUnitOnQuest`); Vitest docs; GitHub runner images; local timings 2026-10-09 (shared 16-thread machine); Blizzard UI Add-On Development Policy (2009); CurseForge listings for the competitor add-ons named in FEATURES.md.
Tertiary (LOW): Warcraft Tavern on Forever addon loading (disputed in comments); beta end date and launch details from search summaries (Icy Veins HTTP 403, not read); wasmoon vs fengari vendor benchmarks; chat lockdown from one third-party page; UI polish expectations (experience).

---
*Research completed: 2026-10-09*
*Ready for roadmap: yes, once Conflicts are resolved or accepted by the author*
