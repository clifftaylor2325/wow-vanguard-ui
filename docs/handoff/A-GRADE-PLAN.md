# Vanguard: the plan from B- to A (handoff)

Repo `clifftaylor2325/wow-vanguard-ui`, written 2026-11-09 against commit `c6853f7` (0.9.3 plus the guided-setup work, #794).
Status: **in progress**. Phase 1 started 2026-11-09. Revised the same day for two calls Cliff made: the verification sprint is skipped (section 4), and the model rule changed twice (see the next paragraph).
Source: the product and code review of the same date (`VANGUARD-REVIEW-2026-11-09.md`, to sit beside this file). Task lines below cite its item ids (Q1 to Q21, N1 to N21, B1 to B10) and its bug ids (H1 to H4, M1 to M16, L1 to L29); the review holds the `file:line` detail and the reasoning, so a thread reads the review entry for its task before it starts. If a line has moved, grep for the identifier quoted there.
Naming rule for this file and everything made from it: no other addon or competing product is named; patterns are described generically.

`CLAUDE.md` applies in full, including its model-by-task table. Cliff first set every task to Fable 5.2 at high effort (2026-11-09), then the same day went back to the table for everything started after the first five threads (the phase 1 fixes, the 0.9.4 release, tooltips, nameplates and auras, and the code-only look work, which finish on Fable 5.2). From here on: Sonnet at medium effort for fixes and feature work; Opus or Fable at high effort for protected and taint-prone paths, the lifecycle design and harness rules; Haiku for mechanical work; Fable for reviews and the phase 7 re-grade. The per-task notes below ("Opus", "Haiku") follow that table.

Other threads are open on the same repo (section 10). A thread on this plan checks the open PRs before it starts and stays out of files another open PR owns.

---

## 0. Summary

**Where we are.** Overall B-. By area: engineering A-, feature breadth A, core HUD depth C+, configuration B-, visual identity B-, in-game verification D. Scorecard: 11 Strong, 40 Solid, 12 Needs work, 1 Weak across 64 features. No Critical bugs; 4 High and 16 Medium open.

**What an A means here.** A grade is one reviewer's judgement, so this plan pins it to things that can be counted (section 1). In short: every area at A- or better, nothing Weak, no Needs work on anything a player looks at in combat, every High and Medium closed, and the game itself, not the harness, as the evidence.

**The shape of the route.** Breadth and engineering are already there. The review held the grade down with three things:

1. **Proof.** 4 recorded in-game results against 827 checklist expectations. Cliff's call on 2026-11-09: he has played with the addon for a week, is confident it works, and the sprint is skipped (section 4).
2. **The core HUD and its configuration.** The parts a player sees every second are the thinnest, and 111 settings need a reload.
3. **A look that is distinctive, not only tidy.** The design system is excellent and ships at its plainest setting.

So the plan adds almost no new features. It ships what is fixed, deepens the core, removes the reloads, then turns the look up.

**Grade ladder (an estimate, to be confirmed by the re-review in phase 7).**

| After | Expected grade | Why |
| --- | --- | --- |
| Phase 1 | B | Known player-facing bugs gone, fixes actually released |
| Phases 3 and 4 | B+ to A- | HUD depth and configuration both reach A- |
| Phases 5 and 6, then 7 | A- to A | The look is distinctive; nothing Weak or placeholder remains; an independent re-review agrees |

The top of each range assumes the re-review can count Cliff's week of play. It was graded D on what is written down, so the play has to be written down to move it (section 4, one optional task).

---

## 1. The bar: what has to be true for an A

Targets marked `[DECIDE]` are proposals for Cliff to confirm or change in phase 0.

| Area | Now | Target | Exit test |
| --- | --- | --- | --- |
| In-game verification | D | Cliff's call: a week of live play is the evidence; no sprint | Optional: that play recorded in `docs/smoke-results.json` (A2-1) so a re-review can count it. |
| Core HUD depth | C+ | A- | Unit frames, action bars, nameplates, auras and tooltips each Solid or Strong; the seven gaps in review section 7.1 closed. |
| Configuration | B- | A- | Reload-tagged options from 111 to 15 or fewer `[DECIDE]`. Every display-only module can be switched off live. Sizes are sliders, applied live. Profile switch without a reload for modules that support it. |
| Visual identity | B- | A- | Review style verdicts: HUD from Needs work to Solid or Strong; reskin and menu to Strong. Depth treatments on by default. No stock typeface or stock toast art on screen. One crest system and one icon family. |
| Engineering | A- | A | A real module lifecycle (dependencies, teardown, late enable). Load-on-demand split done. Longest login handler 300 ms or less and memory at login 30 MB or less `[DECIDE]`, both measured in game with `/vg perf` and `/vg mem`. |
| Feature breadth | A | A (hold) | No new modules until the re-review. Placeholders retired or given a real interface. |
| Scorecard | 11 / 40 / 12 / 1 | 0 Weak, 3 or fewer Needs work, none of them on the HUD | Re-review. |
| Bugs | 4 High, 16 Medium | 0 High, 0 Medium | Each closed by a commit, and by a recorded in-game step where the review says it needs one. |

---

## 2. Phase 0: decisions (Cliff, about an hour, before anything else)

- [x] **D1 Retail.** Commit to it (a second verification sprint and Retail HUD work) or freeze it as "works, unsupported" until the A is reached. Recommended: freeze. (B9) **Answered 2026-11-09: frozen as "works, unsupported" until this plan is done; fixes still must not break the Retail tests.**
- [ ] **D2 Breadth freeze.** No new modules until the phase 7 re-review. Recommended: yes.
- [ ] **D3 The crest.** The shipped mark is a shield with a V and no swords; the design chosen in October had two swords crossed behind the shield (L12). Pick one before any art is made: the crest system (A5-9) is built from it.
- [x] **D4 First-run setup.** Which rows stay pre-ticked. Recommended: untick the chat filter and the key-setup offer until the key data is confirmed and A6-3 lands; keep the rest. (M14, Q18) **Answered 2026-11-09: untick both; every other row stays as it is.**
- [ ] **D5 Third-party names.** Recommended rule: names only where interoperability needs them (detection tables, the player string that says which addon was found), never in comments, notes or research. (L11, N19)
- [ ] **D6 The 1.0 gate.** Draft PR #795 makes the release script refuse 1.0.0 until every step of a 74-step core path has a recorded pass. That and the skipped sprint pull in opposite directions: keep the gate (and walk the core path before 1.0), or drop or shorten it.
- [ ] **D7 The numbers.** Confirm or change the three `[DECIDE]` targets in section 1. Memory and login targets are provisional until A4-6 has attributed the 49.3 MB.
- [ ] **D8 The AFK lore quotations.** Keep or replace the two long quotations shipped as strings (L28).

---

## 3. Phase 1: stabilise and ship

Branch `work/a1-stabilise`. One PR. Then a release. Nothing else starts until this is out.

- [ ] **A1-0 Release what is already on `main`** as the next patch version, today, with the `release` skill. It carries the login spread and the forbidden-icon guard. (Q1; closes H1 and H2 once seen in game)
- [x] **A1-1** Off-hand upgrade verdict against a two-hander, with harness cases. (Q15, M11)
- [x] **A1-2** Combat checks on the two panel-manager calls, and add those functions to the quality scan's guarded list. Protected path: Opus. (Q16, M12)
- [x] **A1-3** Give the four quest tickers an owner frame, stop them in combat, reuse scratch tables, add a bench step. (Q17, M13)
- [x] **A1-4** First-run setup rows per D4. (Q18, M14)
- [x] **A1-5** Quest-log zone expansion registered from `Enable`, with a switch. (Q21, M16)
- [x] **A1-6** Per-unit events for the raid add-ons; by-name aura lookup before the full list; bench step. (Q2, M1)
- [x] **A1-7** Settings-guard stamp asymmetry, with a no-name-at-logout harness case. (Q3, M2)
- [ ] **A1-8** Load only the active locale; keep the in-file guard as the fallback. Needs an in-game check that the directive works on the Forever client. (Q4, M6)
- [x] **A1-9** Recent whisper partners count as known for stranger-invite declines. (Q5, M4)
- [x] **A1-10** Never auto-pick a quest reward over a flagged upgrade. (Q6, M5)
- [ ] **A1-11** Filter and coalesce the three hot handlers; one shared bag snapshot. (Q19, M15, L13, L17)
- [x] **A1-12** Micro-allocations on the hottest paths, except the unit-frame ones, which move to A3-1 to stay out of PR #796's files. (Q7, L4, L6)
- [x] **A1-13** `ns.Migrate` keeps a list per key or raises on a duplicate; a test runs every migration twice. (Q8, L1)
- [x] **A1-14** HUD font theming out of Merchant into its own switch. (Q9, L2)
- [ ] **A1-15** Small correctness batch, one commit each: durability figure, mail attach count and running flag, trainer loop, `/way` across continents, detailed item level. The player-aura re-anchor (L14) is a protected path: Opus. (Q20)
- [ ] **A1-16** Wrap the last 33 strings and fill the 184 missing keys per locale. Haiku for the fill, through the CSV pipeline. (Q10, L7)
- [ ] **A1-17** Release again with the above. PR lists every item that needs an in-game check.

**Gate.** H1, H2, M1, M2, M4 to M6 and M11 to M16 closed in code; released; the README's known issues updated.

---

## 4. Phase 2: verification (skipped by decision)

Cliff's call, 2026-11-09: he has played with the addon on the live game for a week and is confident it works, so the in-game sprint, the tester cohort and the smoke walker are not part of this plan. What that leaves:

- Each PR still ends with its "Needs in-game check" list, as `CLAUDE.md` requires. Those are for Cliff's normal play, not a gate.
- The review's items that only the game can settle stay marked as suspected until someone sees them: M12, L14, L26, L27, L29, and the key-setup data (H3).
- [ ] **A2-1 (optional, about ten minutes).** Write the week of play down: Cliff names the areas he has used, and a thread records a pass for the matching steps in `docs/smoke-results.json` with the build and date. Without it a re-review will find the same 4 results and grade verification the same.

---

## 5. Phase 3: core HUD depth, with live apply built in

One branch and one PR per HUD area, so each set of files is opened once and comes out with depth, sliders and live apply together. The areas do not share files and can run as parallel threads. A3-1 and A3-2 work in files the HUD signature thread also changes (PR #796 and its three follow-ups: unit frames, cast bars, action bar layout), so they start from that work once it has merged, or from its branch.

- [ ] **A3-1 Unit frames** (`work/a3-unitframes`). The unit-frame micro-allocations from Q7 (L3); width and height sliders per frame; text formats (value, percent, both, deficit); heal prediction and shields on player, target and party; a status row (leader, role, resting, PvP); then portraits and a focus target. All settings apply without a reload. (N4, N5, N3)
- [ ] **A3-2 Action bars** (`work/a3-actionbars`). Macro names with a switch, attack and auto-shot flash, spacing and hotkey-text controls, coalesced repaint. Secure button work: Opus. (N6, L5)
- [ ] **A3-3 Nameplates and auras** (`work/a3-plates`). Size sliders, text sizes, friendly name-only mode, target emphasis, aura sizes and filters where the client allows a say. Rebuild rows out of combat. (N5, B5, N3)
- [ ] **A3-4 Tooltips** (`work/a3-tooltips`). Guild and rank, realm, role, item level where exposed, ids behind a switch, anchor choice per tooltip type. (N7)
- [ ] **A3-5 Quest dialog session fallback.** A switch and a modifier that hand the quest and gossip windows back to the game without a reload. (N8, M3)
- [ ] **A3-6 The rest of live apply, wave one.** Minimap shape and icons, info strip blocks, chat toggles, raid-frame sizes. (N3, N5)

**Gate.** Unit frames and tooltips move from Needs work to Solid or better; reload tags under 40; no fixed-step size choice left on the HUD.

---

## 6. Phase 4: lifecycle, then weight

Runs after phase 3 has merged, on its own, because A4-1 touches every module. Branches `work/a4-lifecycle`, then `work/a4-split`.

- [ ] **A4-1 Module lifecycle design.** Declared dependencies, a subscription scope the registry can tear down, generic disable for display-only modules, late enable. A decision that spans modules: Opus, as a short design note in `docs/design/` for Cliff to approve before code. (B1, M9)
- [ ] **A4-2 Convert modules in batches** of about ten, display-only first. Sonnet. Each batch removes its reload tags.
- [ ] **A4-3 Lifecycle sweep** for work registered outside `Enable`, plus the quality-scan rule that blocks `ns.On` at file scope outside `Core/`. (N20, L16)
- [ ] **A4-4 Live profile switching** for modules that support it; the rest say so plainly.
- [ ] **A4-5 Bags in combat.** Settle the sectioned-layout behaviour during a fight with an in-game look, then guard or document it. (M10)
- [ ] **A4-6 Measure, then split.** Attribute the 49.3 MB with `/vg mem` in game, confirm the D7 targets, then split into load-on-demand companions in payoff order: auction (keeping a small price store in the core), options and setup, diagnostics, key setup, talents, mail, crafting. Record before and after. (B2)

**Gate.** Reload tags at the D7 target; every display-only module switches off live; memory and login at the D7 targets, measured in game.

---

## 7. Phase 5: the look

Read with `docs/handoff/leonardo-art-plan.md`. That plan says how the art is made; this phase says where it lands and in what order. The code-only half (5a) touches the theme and the options window, not the HUD modules, so it can run alongside phase 3. The art-led half (5b) waits for D3.

**5a, code only** (`work/a5-look-code`)

- [ ] **A5-1** Hero header in the options window. (Q11)
- [ ] **A5-2** A display tier in the type scale for window and page titles. (Q12)
- [ ] **A5-3** Class-colour accent option. (Q13)
- [ ] **A5-4** Reskin coverage report in `/vg status` and as a generated doc. (Q14)
- [ ] **A5-5** Global font pass, keeping the Korean and Chinese exemption. (N11)
- [ ] **A5-6** Depth on by default (shadows, gradient, slate surface, bevel), decided by Cliff from an A and B look in game. (N13)
- [ ] **A5-7** State motion kit: combat start, proc, cooldown ready, low health, all behind Reduce motion. (N16)
- [ ] **A5-8** Empty states and navigation polish in the menu. (N18)

**5b, art-led** (`work/a5-look-art`)

- [ ] **A5-9** Crest system in three treatments, the ornament set drawn from its geometry, then the signature window header, with ornaments on by default. (N15; needs D3)
- [ ] **A5-10** One icon family from 64-pixel masters, sized icons on. (N14)
- [ ] **A5-11** Status-bar texture family and a picker. (N17)
- [ ] **A5-12** Toast and help-tip skins. (N12)

**5c, the larger pieces** (one branch each, after phase 4)

- [ ] **A5-13** Preview dock: live sample frames beside the controls on every HUD page. (B3)
- [ ] **A5-14** HUD looks and layout presets. Already under way in another thread as the HUD signature (PR #796, the first of four); this plan does not duplicate it. Left here: an ultrawide layout and layout-only sharing strings, after those four have merged. (B4)
- [ ] **A5-15** Window structure pass: one item-slot language, insets and section headers in the large windows, the last stock glyphs. (B8)
- [ ] **A5-16** Setup as a stage over a live HUD, with the theme studio. (B7)

**Gate.** HUD style verdict Solid or better; nothing on screen shows the stock typeface or stock toast art; the default look uses the depth treatments.

---

## 8. Phase 6: focus and finish

Branch `work/a6-focus`. Can run alongside 5b.

- [ ] **A6-1** Retire or fold the placeholders: pet stable and Legacy helper out, boss docks into movers, officer roster into raid tools, graphics `apply` out. (N10)
- [ ] **A6-2** Give the chat-only features a face or remove them: crafting queue panel, fuller keyboard with a layout choice, ordered talent plan, scrolling group board. One commit each. (N21, L20, L21)
- [x] **A6-3** Locale-aware matchers for the chat filter and the group board; hide a category a locale has no words for. Then re-tick the chat filter in setup if D4 allows. (N9, M7) Per-locale lists are in `Core/MatchWords.lua`; the Filtered tab is found by a saved window number (L23, first part). Setup still leaves the chat filter unticked (D4's answer); it can be revisited once the lists are checked in the game.
- [ ] **A6-4** Stat weights: simulate them, source them, or label the arrows as a guide. (M8)
- [ ] **A6-5** Clean non-functional third-party names from the repo per D5. (N19, L11)
- [ ] **A6-6** Inventory window: item level and upgrade marks in bags, an offline view of other characters. Optional under the breadth freeze; it reuses stored data and closes a section 7.1 gap. (B6)
- [ ] **A6-7** The remaining Low list (L8 to L10, L18, L19, L22 to L25, L27), one sweep.
- [ ] **A6-8** Player docs with real screenshots; the listing pages say which build was tested.
- [ ] **A6-9** Follow through on D1: either the Retail verification sprint or the "unsupported" label. (B9)

**Gate.** No Weak feature; three or fewer Needs work; every Medium closed.

---

## 9. Phase 7: re-grade and 1.0

- [ ] **A7-1** A fresh, independent review at the release candidate, same rubric and same scorecard, by a thread that has not seen this plan's progress.
- [ ] **A7-2** Fix what it finds at High or Medium.
- [ ] **A7-3** Ship 1.0, subject to D6.

---

## 10. Order and what can run together

```text
Phase 0 (decisions)
  -> Phase 1 (alone; ship)
  -> Phase 3 (parallel threads) + Phase 5a
  -> Phase 4 (alone: lifecycle, then split)
  -> Phase 5b + 5c + Phase 6
  -> Phase 7
```

- Phase 3 threads are independent of each other. Phase 4 is not independent of anything, so it runs with no other code branch open.
- **Other threads on this repo (as of 2026-11-09).** PR #795, the road-to-1.0 gate (tooling and docs only: smoke core path, frozen surface, version policy). PR #796, the HUD signature, first of four (unit frames, cast bars, action bar layout, theme, options, setup guide). This plan's threads stay out of their files until they merge, and `scripts/tests/frozen-surface.json` from #795 means a setting or `/vg` word this plan retires must be listed there with its migration.
- Rough size, as an estimate and not a promise: phase 1 a few days; phases 3 and 5a two weeks; phase 4 two to three weeks; phases 5b, 5c and 6 two to three weeks; phase 7 a week.

## 11. Risks

- **Verification is skipped.** A bug that only the game shows ships to players and comes back as a report, as the nameplate icon error did. Mitigation: the `/vg report` loop, fast patch releases, and A2-1 if the grade matters more than the ten minutes.
- **The lifecycle change regresses stable modules.** Mitigation: design note first, display-only modules first, batches of ten, the full test label on those PRs.
- **The art pass lands in pieces and looks mixed.** Mitigation: D3 first, the crest and ornament set before any other asset, one icon family in one go.
- **Scope creeps back in.** Mitigation: D2. A new idea goes in a list for after 1.0.
- **The targets in section 1 are wrong.** They are proposals. D7 fixes them once A4-6 has real numbers.
