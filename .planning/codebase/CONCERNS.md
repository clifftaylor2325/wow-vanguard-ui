---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
# Codebase Concerns

**Analysis Date:** 2026-10-09, counts refreshed 2026-10-13. Figures rot: where a line names a count or a size, run the command beside it rather than trusting the number.

## Tech Debt

**Test suite history (resolved):**
- The suite was red on main until Phase 1 (2026-10-09, #169). Since then `npm run coverage` has reported 100% on every merge, and the weekly shuffled run opens a `ci-failure` issue when it goes red. Before chasing a red check, read `.planning/ROADMAP.md` and the open `ci-failure` issues.

**Large modules concentrate behaviour:**
- Issue: Several files are very large and mix UI construction, state and event handling.
- Files: `wc -l Core/*.lua Modules/*.lua | sort -n | tail` lists them; on 2026-10-13 the largest were `Core/Theme.lua` (about 1,750 lines), `Modules/AuctionShop.lua` (about 1,050) and `Core/OptionsWindow.lua` (about 830). `Core/Options.lua` was split into `Core/Options*.lua` in Phase 4. No further splits before launch (the author's call, 2026-10-12).
- Impact: The CLAUDE.md rule (every function at most 10 lines, with a comment above it) is enforced by `scripts/lib/code-quality.mjs`, but large files are harder to change safely and to test.
- Fix approach: Split by responsibility when touching these files for other reasons. Keep each split inside an existing area prefix (`Auction*`, `ClickCast*`).

**Duplicate or stale work plans:**
- Issue: `docs/handoff/` holds four work plans (`AUCTION-PLAN.md`, `RESKIN-PLAN.md`, `VANGUARD-PLAN.md`, `WORKPLAN.md`; the finished click-casting and crest hand-offs and the prompt template were removed in 0.6.0 prep). They refer to the old name `wow-forever-ui`, to commit `619d5c9`, and to line numbers that have drifted.
- Files: `docs/handoff/*.md`
- Impact: Executors may act on stale line numbers or on the pre-rename identifiers.
- Fix approach: Grep for the quoted identifier instead of trusting line numbers. Mark completed plan items and retire finished plans.

**Legacy name kept in code:**
- Issue: Migration handling for the ForeverUI name persists in the code paths for old strings and profiles.
- Files: `Core/Serialize.lua` (the `FUI1` prefix, line 6), `Core/Theme.lua` (pre-rename profiles, line 132)
- Impact: Required for import compatibility, but it is the only place "ForeverUI" should appear in code.
- Fix approach: Keep these, and keep them out of new player-facing text.

## Known Bugs

Open bug issues on GitHub as of 2026-10-09 (read with `gh issue list`):

- **#199 Raid frames:** no Width size is highlighted, so the current width is not visible. Options UI.
- **#198 Talents:** the plan status line runs over the Apply Changes button. Files: `Modules/TalentPlanner.lua`.
- **#197 Spellbook:** parchment look, and paging arrows enabled on a one-page book.
- **#196 Guild settings:** Apply buttons look enabled for members who cannot change settings.
- **#194 Guild roster:** dim text and a truncated Rank column.
- **#193 Quest log and guild settings:** the panel is see-through.
- **#191 Group finder:** the search view keeps the game's brass frame.
- **#189 Character pane:** the third top tab has a blank icon.
- **#188 Auction house:** Shopping and Selling tab labels are cut off. Files: `Modules/AuctionShop.lua`, `Modules/AuctionSell.lua`.
- **#187 Combined bag:** the bag button covers the Sort button.
- **#186 Setup wizard step 4:** unlock handles and grid draw over the dialog. Files: `Core/Setup.lua`, `Core/Movers.lua`.

#186, #188, #197 and #199 (and #202) have fixes merged to `main` in PR #205 (`b032e6f`) but the issues are still open on GitHub, pending an in-game check. Treat them as fixed in code, not as open work.

Most of these are visual and have not been seen in game. Mark any fix as needing an in-game check.

## Security Considerations

**Secret values in combat:**
- Risk: Some aura, unit and health values can be secret on Forever. Reading or comparing them raises errors or leaks data.
- Files: 76 files under `Core/` and `Modules/` reference `ns.IsSecret` or `ns.PlainNumber` (the list is large; search with `grep -rln "IsSecret\|PlainNumber" Core Modules`).
- Current mitigation: `ns.IsSecret` and `ns.PlainNumber` wrap reads.
- Recommendations: Every new read of a unit, aura or cooldown value must go through these helpers. Add a test for each new path.

**Error forwarding:**
- Risk: Errors are forwarded to the game's handler under `pcall`, and a failing handler could loop.
- Files: `Core/Events.lua` (lines 89 to 95), `Core/Feedback.lua`, `Core/Slash.lua`
- Current mitigation: A re-entrancy guard stops an error inside our handler from looping.
- Recommendations: Keep the guard in place when changing the event path.

**Feedback and report content:**
- Risk: `/vg report` and `/vg feedback` build a text block for players to paste. It includes client, module and skin state.
- Files: `Core/Feedback.lua`, `Core/Slash.lua`
- Current mitigation: The block is built from status counts and client facts; it should not contain saved credentials.
- Recommendations: Confirm the block never includes account names or profile export strings that could hold personal data.

**Profile import strings:**
- Risk: Imported strings are deserialised from player-pasted text.
- Files: `Core/Serialize.lua`, `Core/OptionsProfiles.lua`
- Current mitigation: Prefix check (`FUI1` and the Vanguard prefix) before decoding.
- Recommendations: Validate the decoded table's shape before writing to the DB. Do not call `loadstring` on imported text.

## Performance Bottlenecks

**Timers and OnUpdate handlers:**
- Problem: 49 call sites use `C_Timer` or `OnUpdate` across `Core/` and `Modules/`.
- Files: search with `grep -rn "C_Timer\|OnUpdate" Core Modules`
- Cause: Each periodic handler runs for the whole session, including out of combat.
- Improvement path: Stop handlers when their module is disabled. Throttle per-frame work. Run the performance checks in `Core/Perf.lua`.

**Raid and party frame updates:**
- Problem: Raid frames rebuild tiles on group changes and may repaint many buttons at once.
- Files: `Modules/RaidFrames.lua`, `Modules/MainTanks.lua`, `Modules/PartyExtras.lua`
- Cause: Full re-layout on every roster event.
- Improvement path: Update only the changed tiles.

## Fragile Areas

**Secure frames and combat lockdown:**
- Files: `Modules/ActionBars.lua`, `Modules/ClickCast.lua`, `Modules/ClassBars.lua`, `Modules/MainTanks.lua`, `Modules/PartyExtras.lua`, `Modules/QuestTrackerView.lua`, `Modules/RaidFrames.lua`, `Modules/SpecialBars.lua`, `Modules/UnitFrames.lua`, `Core/Dialog.lua`, `Core/Client.lua`
- Why fragile: Secure frames cannot have protected attributes changed in combat. `SetAttribute` is called in `Modules/ClickCast.lua` (lines 230 and 236). Only 6 call sites use `ns.OutOfCombat` or `InCombatLockdown`, against 13 secure-frame creations.
- Safe modification: Guard every protected change with `ns.OutOfCombat`. Queue changes made in combat and apply them on `PLAYER_REGEN_ENABLED`. Check `Core/Combat.lua` first.
- Test coverage: The harness stubs the secure API. Real lockdown behaviour is untested and needs an in-game check.

**Forever detection:**
- Files: `Core/Client.lua`, `Core/Combat.lua` (line 69, `ns.IsForever`), `Core/Slash.lua` (lines 291 and 304), `Core/Dialog.lua` (line 148)
- Why fragile: Detection depends on interface version. The TOC declares 16001 (Forever) and 120007.
- Safe modification: Use `ns.IsForever`, never a global check. Test both interface values.
- Test coverage: Limited to the harness client stubs.

**Atlas and texture coordinates:**
- Files: `Media/` (generated), `scripts/lib/media-sources.mjs`, `Core/Skin.lua`
- Why fragile: On Forever, atlas texcoords are atlas-relative. File-based `SetTexCoord` crops blur atlas art.
- Safe modification: Size and anchor atlas art instead of cropping. Never hand-edit `Media/`; run `npm run media`.

**Fades and sounds:**
- Files: `docs/THEME.md`, `Core/Theme.lua`
- Why fragile: Fades must stay at or under 0.15 s in combat, and motion and sound must respect the Reduce motion and Interface sounds switches. Each fade or sound must be listed in `docs/THEME.md`.
- Safe modification: Update `docs/THEME.md` in the same change.

## Scaling Limits

**Saved variables and profiles:**
- Current capacity: Not measured in this analysis.
- Limit: Large profile exports and many profiles grow `Vanguard.lua` SavedVariables, which the client loads on every login.
- Scaling path: Keep exports compact. Prune unused profile keys on save.

## Dependencies at Risk

**Forever client build drift:**
- Risk: Widget methods in `scripts/lib/wow-widget-api.lua` were confirmed against build 1.60.1.70170 (the value in `docs/SMOKE-TEST.md`). The client can change.
- Impact: Methods that are added or removed on the client make tests pass or fail for the wrong reason.
- Migration plan: Add a method to the stub only after confirming it exists in the 12.1 client. Run `/vg status` in game to check the build.

**Vendored libraries:**
- Risk: `Libs/` (LibStub, CallbackHandler-1.0, LibSharedMedia-3.0) is kept unmodified. Upstream updates are manual.
- Impact: Old library versions may miss Forever API changes.
- Migration plan: Update only from upstream releases, and record the version in the CREDITS file.

## Missing Critical Features

**In-game verification:**
- Problem: Nothing in `docs/SMOKE-TEST.md` has been seen in the game. Every "Expect" line is what the code intends.
- Blocks: Confidence in secure frames, setup flow, and visual layout until the owner runs the smoke test.

**Empty-state messages:**
- Problem: Several panels show no message when empty (#200, #190, #195). Legacy Challenges, Appearances, click casting hover keys, Currency and the Guild Information box.
- Blocks: Players cannot tell empty from broken.

## Test Coverage Gaps

**Real client behaviour:**
- What's not tested: Combat lockdown on secure frames, real secret-value responses, and Forever-only API paths. The harness uses stubs.
- Files: `scripts/lib/wow-*.lua`, `scripts/lib/wow-widget-api.lua`
- Risk: Passing tests can hide errors that appear only in the game.
- Priority: High

**Visual layout:**
- What's not tested: Tab label widths, header centring, and overlap between controls (#186, #188, #198, #202). Layout checks run only on the stub's laid-out rule.
- Files: `Core/Layout.lua`, `Core/Setup.lua`, `Modules/AuctionShop.lua`, `Modules/TalentPlanner.lua`
- Risk: Overlaps ship unnoticed.
- Priority: Medium

**Full suite gating:**
- What's not tested: The full suite runs weekly, before releases, or on PRs labelled `full-tests`. The quick check (`npm run test:quick`) does not cover the area tests.
- Files: `scripts/tests/README.md`, `.github/workflows/verify.yml`
- Risk: Regressions in area tests merge between full runs. Issue #148 and #147 track the slow suite.
- Priority: Medium

---

*Concerns audit: 2026-10-09*
