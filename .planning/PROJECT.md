# Vanguard: Forever launch

## What This Is

Vanguard is a from-scratch World of Warcraft UI suite (Lua 5.1) for WoW Forever, the 12.1 engine with vanilla content. It replaces unit and raid frames, action bars, nameplates, bags, chat, quests, auctions and the game's own windows with one consistent "Slate & Brass" look. This project gets it launch-ready for WoW: Forever: a clean, efficient, well-tested codebase with fast CI, a working auction house, a polished UI, and a few features that matter while levelling and grouping. First users are the author and two friends; it ships on CurseForge and Wago.

## Core Value

On launch day, Vanguard loads without errors and everything it replaces works, verified by a full test suite that is green and fast enough to run on every PR.

## Business Context

- **Customer**: The author and two friends at launch; public CurseForge/Wago listing for anyone after.
- **Revenue model**: None (free addon, all rights reserved).
- **Success metric**: Zero Lua errors in a launch-week session for the three players, with the full suite under 5 minutes and green.
- **Deadline**: WoW: Forever launch, Tuesday 2026-11-04, 3 PM PST (about 26 days from 2026-10-09).

## Requirements

### Validated

<!-- Inferred from the existing code (see .planning/codebase/ and README.md). -->

- ✓ Slate & Brass theme, centered layout, faction look, text size scaling — existing
- ✓ Unit frames (player, target, ToT, focus, party, boss), cast bars, swing timer, threat readout, auras — existing
- ✓ Raid frames (VuhDo-style), raid auras and status, main tank frames, raid tools — existing
- ✓ Click casting with grid, picker, hover keys, import/export — existing
- ✓ Action bars with keybind mode, visibility rules, Masque support — existing
- ✓ Nameplates, tooltips, gear upgrade hints, vendor memory, other characters' items — existing
- ✓ Bags (combined, sections), merchant auto-repair/sell, errands, instance prep — existing
- ✓ Quest dialog, tracker, log and automation; waypoints — existing
- ✓ Chat extras, chat watch, minimap drawer, broker strip, info strip, data bars, AFK screen — existing
- ✓ Auction helper: Shopping/Selling tabs, deals, upgrades, alerts, ledger, crafting costs, disenchant values, `Vanguard.API.v1` — existing (posting currently broken, see Active)
- ✓ Game windows reskinned (character, mail, social, town, system, map, menus, tabs) — existing; PvP windows (S8) unfinished
- ✓ Talent planner, situations, options window, profiles, first-run setup wizard, Skin API — existing
- ✓ Headless Lua test harness with 100% line-coverage floor and code-quality scan — existing

### Active

**1. Code and CI (highest priority)**
- [ ] Comprehensive technical review of Core/ and Modules/: dead code, duplication, inefficient event handling and per-frame work, oversized files; fixes applied
- [ ] Full test suite is green on main (clears #169/#143 and the known red Lua-harness cases)
- [ ] Full suite runs in under 5 minutes in CI, cheap enough to run on every PR within the free-tier budget
- [ ] Test results are deterministic: no flaky cases, and a failure says clearly what broke
- [ ] `npm run coverage` reports again and the 100% floor holds

**2. Auction house posting (bug)**
- [ ] Clicking Post on an item posts the auction (today it silently does nothing after an earlier red Lua error)
- [ ] The root-cause error is found and fixed, with a harness test that drives the post path end to end

**3. UI polish**
- [ ] Depth: panels and windows have shadows, borders and texture instead of looking like flat grey boxes
- [ ] Motion and feedback: hover states, transitions and feedback when things happen (within the 0.15 s in-combat fade limit and the Reduce motion switch)
- [ ] Typography and icons: fonts, spacing and icons look deliberate, not generic
- [ ] Consistency: every window Vanguard touches is fully styled, including the unfinished PvP reskin (RESKIN-PLAN S8.1–S8.5)
- [ ] Open visual bug issues (#187–#204) resolved

**4. New features (cut first if time runs short)**
- [ ] Levelling helpers (e.g. XP/hour and time to level, quest XP values, supply reminders)
- [ ] Group play helpers (e.g. party quest progress, loot roll tracking)

### Out of Scope

- Features beyond levelling and group play for launch — the author ranked new features last; anything more waits for after launch
- Retail-only systems not in vanilla content (Mythic+, covenants, etc.) — Forever runs vanilla content
- Editing `Libs/` or hand-editing `Media/` — repo rules; Libs stay upstream, Media is generated
- Repo/site rename, Cloudflare Pages, listing claims (VANGUARD-PLAN O1–O5) — manual tasks for the author, not code work
- Self-hosted CI runners — the budget plan is hosted only (see memory: repos going private)

## Context

- Brownfield: about 33 Core files and 81 Modules files; codebase map in `.planning/codebase/` (mapped at `b032e6f`).
- Large files concentrate risk: `Core/Theme.lua` (~1300 lines), `Modules/AuctionShop.lua` (~1040), `Core/Options.lua`, `Core/OptionsWindow.lua`, `Modules/ClickCastOptions.lua`, `Modules/MenuStrip.lua`, `Modules/TalentPlanner.lua`, `Modules/ActionBars.lua`, `Modules/AuctionSell.lua`, `Modules/RaidFrames.lua`.
- CI today: `verify.yml` is the per-PR quick check (about 1 minute); `full-suite.yml` and `lua-suite.yml` run weekly, before releases, or with the `full-tests` label; the release workflow takes about 9 minutes. The repos are going private, so Actions minutes are limited.
- The suite is red on main: seven full-suite cases (#169), including three Lua-harness tests (raid tiles, plate glow, chat watch price). `npm run coverage` exits before it reports while any test is red.
- Fixes for #186, #188, #197, #199 and #202 are merged (PR #205) but the issues remain open until checked in game.
- `docs/handoff/` plans are mostly done (AUCTION, WORKPLAN complete; RESKIN S8 open). They use the old name `wow-forever-ui` and drifted line numbers, so grep for identifiers.
- Nobody on the project can run the game in this environment; all verification is through the headless harness, and anything visual or in-game goes on a needs-in-game-check list for the author.

## Constraints

- **Timeline**: Must be launch-ready by 2026-11-04 15:00 PST — fixed by the WoW: Forever release.
- **Tech stack**: Lua 5.1 only (no goto, `//`, 5.3 bit ops); Interface 16001 and 120007 — client constraint.
- **Code rules**: every function has a comment directly above it and a body of at most 10 lines; colours and font sizes only in `Core/Theme.lua`; new WoW globals go in `.luacheckrc`; widget methods added to the test API only once confirmed in the 12.1 client — enforced by CI (`scripts/lib/code-quality.mjs`).
- **Game rules**: nothing protected in combat (`ns.OutOfCombat`); never read secret values (`ns.IsSecret`, `ns.PlainNumber`); prefer `C_Item`/`C_Spell`/`C_UnitAuras`; fades no longer than 0.15 s in combat; motion and sounds respect Reduce motion and Interface sounds; every fade and sound is listed in `docs/THEME.md`.
- **Testing**: every new line of addon Lua is executed by a test; coverage floor 100%; `npm run verify` and `npm run coverage` must pass before a change is done.
- **Budget**: GitHub Actions free tier on private repos — CI minutes are scarce.
- **Verification**: the game cannot be run here; in-game behaviour must be marked as needing a check by the author.
- **Workflow**: branches per phase (`work/p<N>-<name>`), one task per commit (`<task id> <area>: <change>`), one PR per phase, never commit to main.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Priority order: code/CI → auction posting → UI polish → features | Author's stated order; a broken or untestable addon at launch is worse than a plain one | — Pending |
| New features are cut first if time runs short | Author: stable, clean, polished, working auctions matter more than new things | — Pending |
| CI target is a full suite under 5 minutes, run on every PR | Author wants the whole suite per PR rather than a tiny gate plus rare full runs | — Pending |
| Launch audience is the author and two friends, public listing after | Realistic first users; keeps support load small | — Pending |
| Feature scope limited to levelling and group play | Author picked these; vanilla content at launch is mostly levelling in small groups | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-09 after initialization*
