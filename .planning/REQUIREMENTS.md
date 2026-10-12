# Requirements: Vanguard: Forever launch

**Defined:** 2026-10-09
**Core Value:** On launch day, Vanguard loads without errors and everything it replaces works, verified by a full test suite that is green and fast enough to run on every PR.

## v1 Requirements

Requirements for the launch on 2026-11-04. Each maps to a roadmap phase.

### Launch Quality

- [ ] **LNCH-01**: Login, a combat session and one auction Post each produce zero Lua errors (checked in the beta session)
- [ ] **LNCH-02**: The TOC interface number matches the real Forever release build before the release is packaged

### Code and CI

- [x] **CI-01**: The full test suite is green on main, and each of the seven cases in #169 is resolved with evidence (fixed, or documented as not reproducing)
- [x] **CI-02**: `npm run coverage` reports again and the 100% line-coverage floor holds
- [x] **CI-03**: Tests are deterministic: no flaky cases, and a failure names what broke
- [x] **CI-04**: Any test that leaves an error in the addon's error list fails, so swallowed errors cannot pass
- [x] **CI-05**: The full suite runs on ready-for-review and on the `full-tests` label; the quick check runs on every push
- [x] **CI-06**: The full suite finishes in under 5 minutes on the hosted runner, measured and recorded
- [x] **CI-07**: Dead code is removed: the six test-only functions and any unused defaults, theme tokens, media and globals, each with its test
- [x] **CI-08**: Per-frame drivers share one throttled `ns.Every` helper, and unprotected event registrations go through `ns.OnUnit`

### Auction House

- [ ] **AH-01**: Clicking Post posts the auction for both item and commodity listings
- [ ] **AH-02**: Each silent exit from Post shows a visible reason
- [ ] **AH-03**: An end-to-end harness test drives Post from the bag click to the next stack, with zero errors at each step

### UI Polish

- [ ] **UI-01**: Buttons and controls have hover, pressed, disabled and focus states
- [ ] **UI-02**: Panels and windows have depth (border, bevel, edge glow), without crops on atlas art
- [ ] **UI-03**: Feedback and motion finish within 0.15 s in combat and respect the Reduce motion switch; each fade and sound is listed in `docs/THEME.md`
- [ ] **UI-04**: Type sizes and spacing follow one scale, set in `Core/Theme.lua`
- [ ] **UI-05**: Every window Vanguard touches is styled, including the PvP windows (RESKIN S8.1–S8.5)
- [ ] **UI-06**: Open visual issues #187–#204 are resolved, checked in game

### Levelling and Group Features (cut first if time runs short)

- [ ] **FEAT-01**: Each quest's XP shows on its tracker row, and XP waiting in the quest log shows on the XP bar tooltip
- [ ] **FEAT-02**: The XP bar tooltip shows kills to level, with percent and rested detail
- [ ] **FEAT-03**: A low-supply warning fires once when a count drops below its threshold, and never in combat
- [ ] **FEAT-04**: `/roll` tracks the group's rolls by parsing the localised roll result text
- [ ] **FEAT-05**: A loot roll tracker shows who rolled what and who won; cut if the client does not expose the loot-history API
- [ ] **FEAT-06**: Live party quest progress is shared by addon messaging between group members; cut if messaging is blocked in instances

## v2 Requirements

Deferred past launch. Tracked but not in the current roadmap.

### Features

- **FEAT-07**: Vendor restock button (the player presses it; nothing is bought automatically)
- **FEAT-08**: Upgrade badge on roll frames, reusing the existing upgrade weights
- **FEAT-09**: Per-level history of XP and time (new saved-variable table)
- **FEAT-10**: Level-up notice with a trainer or talent nudge
- **FEAT-11**: Opt-in auto-pass for items the character cannot equip (never auto-Need)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Features beyond levelling and group play | The author ranked new features last; anything more waits for after launch |
| Retail-only systems (Mythic+, covenants and similar) | Forever runs vanilla content |
| Auto-Need or any automatic roll | Takes the player's decision and invites ninja accusations |
| Auto-buy at a vendor | Takes the player's decision |
| Levelling route guides, a quest database or map pins | Content and licensing problem; duplicates Questie |
| Bots, rotation helpers, auto-walk | Against the Terms of Use and the 12.0 restrictions |
| Editing `Libs/` or hand-editing `Media/` | Repo rules: Libs stay upstream, Media is generated |
| Repo rename, Cloudflare Pages, listing claims | Manual tasks for the author, not code work |
| Self-hosted CI runners | The budget plan is hosted only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LNCH-01 | Phase 12 | Pending |
| LNCH-02 | Phase 12 | Pending |
| CI-01 | Phase 1 | Complete |
| CI-02 | Phase 1 | Complete |
| CI-03 | Phase 2 | Complete |
| CI-04 | Phase 2 | Complete |
| CI-05 | Phase 3 | Complete |
| CI-06 | Phase 3 | Complete |
| CI-07 | Phase 4 | Complete |
| CI-08 | Phase 4 | Complete |
| AH-01 | Phase 5 | Pending |
| AH-02 | Phase 5 | Pending |
| AH-03 | Phase 5 | Pending |
| UI-01 | Phase 7 | Pending |
| UI-02 | Phase 7 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 6 | Pending |
| UI-05 | Phase 8 | Pending |
| UI-06 | Phase 8 | Pending |
| FEAT-01 | Phase 9 | Pending |
| FEAT-02 | Phase 9 | Pending |
| FEAT-03 | Phase 9 | Pending |
| FEAT-04 | Phase 10 | Pending |
| FEAT-05 | Phase 10 | Pending |
| FEAT-06 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 25 total (the earlier count of 26 was off by one; the list holds 25 IDs)
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-10-09*
*Last updated: 2026-10-09 after roadmap creation*
