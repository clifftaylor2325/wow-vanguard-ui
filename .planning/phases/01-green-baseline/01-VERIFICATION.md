---
phase: 01-green-baseline
verified: 2026-10-09T23:50:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - ".planning/phases/01-green-baseline/01-01-PLAN.md"
  - ".planning/phases/01-green-baseline/01-01-SUMMARY.md"
  - ".planning/phases/01-green-baseline/01-02-PLAN.md"
  - ".planning/phases/01-green-baseline/01-02-SUMMARY.md"
  - "scripts/lib/wow-layout.lua"
  - "scripts/lua-coverage-floor.json"
  - "scripts/tests/auction.test.mjs"
  - "scripts/tests/auctionledger.test.mjs"
  - "scripts/tests/chatwatch.test.mjs"
  - "scripts/tests/helpers.mjs"
  - "scripts/tests/plates.test.mjs"
  - "scripts/tests/raid.test.mjs"
covered_digest: "v3:sha256:6bea227f2955bd17a55126b3a9a39064e93d33b0f05b20d34d78aec6d14de5cc"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Green baseline Verification Report

**Phase Goal:** The author can trust a green run: the full suite passes on clean main locally, and coverage reports again. The hosted-runner check moves to Phase 3.
**Verified:** 2026-10-09
**Status:** passed
**Re-verification:** No, initial verification

Phase 1 is an evidence phase (D-06). I checked the recorded logs, git history against origin/main, the live state of GitHub issue #169, and re-ran the five-file targeted command once. I did not re-run the full suite (verify and coverage, about 5.5 minutes each), as instructed.

## Goal Achievement

### Observable Truths (ROADMAP success criteria plus plan must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `npm test` on a clean checkout of main reports zero failed cases locally (hosted run moved to Phase 3) | VERIFIED | `coverage/p1-baseline/verify-run1.log`: `Test Files 66 passed (66)`, `Tests 873 passed (873)`, all 58 Lua-harness area lines read n/n, quality OK line, last line `exit=0`. `targeted-run1.log` records `head=b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b`, which equals `git rev-parse origin/main` today (fetched). No fail, skip or todo text in any of the three logs. Fresh re-run of the five #169 files in the main checkout today: `Test Files 5 passed (5)`, `Tests 120 passed (120)`, exit 0 (auction 74/74, auctionledger 10/10, chatwatch 11/11, plates 13/13, raid 12/12). |
| 2 | SC2: each of the seven #169 cases has a recorded outcome on the issue (fixed with cause named, or not reproducing) | VERIFIED | `gh issue view 169`: state `CLOSED`, stateReason `COMPLETED`, exactly 1 comment, authored by `clifftaylor2325` (the repo owner). The comment body (`01-ISSUE-169-COMMENT.md`) has seven rows, each with cause, "Code bug?", resolving commit and where-on-main. I grep-checked the cited anchors on main: `auction.test.mjs:250/280/852/921`, `AuctionShop.lua:493/860`, `AuctionTable.lua:251`, `auctionledger.test.mjs:196/198`, `chatwatch.test.mjs:191`, `ChatWatch.lua:131`, `helpers.mjs:208/287/288`, `plates.test.mjs:153`, `raid.test.mjs:95`, `RaidFrames.lua:41-42`. All resolve to the described code. Row 1's cause is confirmed independently: at `eff5158` the sell and owned card reads came before `pickTab(addon, 5)`. See warning W1 for row 4's cause wording. |
| 3 | SC3: harness/stub changes made to turn a case green cite the 12.1 Blizzard source in the commit body; no commit loosens a harness rule and changes a test together | VERIFIED (vacuous for this phase; see W2) | The phase changed no harness, stub, test or addon file: `git diff --stat origin/main...HEAD -- Modules Core scripts Libs Media` is empty; the branch-vs-origin/main file list is `.pkgmeta` (the `b8786c5` ignore line) plus `.planning/` only. `scripts/lib/wow-layout.lua` is byte-identical `eff5158..origin/main` (`git diff --quiet` exit 0), and no commit on main since `eff5158` touches `wow-layout.lua`. The loosening commit `0cf01dc` is not an ancestor of origin/main (`merge-base --is-ancestor` exit 1). The Blizzard citations (wow-ui-source `forever` at `2ced784`) live in the #169 comment rows 6 and 7, not in a commit body, because the fixing commit `e0f34d8` predates the phase. |
| 4 | SC4: `npm run coverage` prints its report and passes the 100% floor in `scripts/lua-coverage-floor.json` (CI-02) | VERIFIED | `coverage-run1.log` ends with the header `Lua line coverage (floor 100%)`, then directly `  total  19050/19050 100.00%`, then `exit=0`, with 66/66 files and 873/873 tests. No per-file row between header and total, no below-floor message. `scripts/lua-coverage-floor.json` is `{ "lines": 100 }` and identical to origin/main. The log is timestamped after the verify log (23:31 vs 23:26) and both are green, so the baseline rests on two consecutive clean full runs. |
| 5 | Plan 01-01: git evidence holds (cases 1-4 test-side, layout rule unchanged, fixing commits on main, loosening commit not) | VERIFIED | `git diff --stat eff5158 0cf01dc -- 'Modules/Auction*'` is empty. `84a7b0a` and `e0f34d8` are ancestors of origin/main (exit 0 both). `0cf01dc` is not (exit 1). `wow-layout.lua` unchanged. |
| 6 | Plan 01-02: user approval gate honoured, one comment, owner account, branch/PR decision recorded (D-05, D-07) | VERIFIED | `01-02-SUMMARY.md` quotes the user's reply word for word (`Post and close (Recommended)`; PR: `Defer: one PR later (Recommended)`). The live issue state matches the post-close path (`CLOSED` / `COMPLETED` / 1 comment). No override section needed, none present. No pushed branch or PR (nothing under `work/p1-*`; only `work/gsd-planning`). The comment file has no drive paths, user names or emails (grep found none). |

**Score:** 6/6 truths verified (0 present-but-behavior-unverified)

### Decisions honoured (01-CONTEXT.md)

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 keep the stricter laid-out rule, fix fixtures, loosen no test | Honoured | `wow-layout.lua` unchanged; fixtures were fixed on main by `e0f34d8` (helpers.mjs raid `__spawn`, plate `SetSize/SetPoint`) and the chatwatch test reads `price.rect?.left`. Every assertion kept. |
| D-02, D-03 revised to "no code change, record as not a code bug" | Honoured | Comment rows 2 and 3 (and 4) say "Code bug? No". Auction behaviour confirmed in code: `AuctionShop.lua:493` hides rows above `maxPrice`; `AuctionTable.lua:251` leaves keys alone while a box has focus. |
| D-04 local green run plus coverage floor; no hosted run in Phase 1 | Honoured | Logs above. Hosted confirmation is listed in ROADMAP Phase 3 (CI-05, CI-06) and deferred in the comment's last line. |
| D-05 close #169 once seven outcomes recorded and D-04 passed | Honoured | Issue CLOSED / COMPLETED after coverage-run1 `exit=0`. |
| D-06 evidence only, no Modules/Core/scripts change | Honoured | Empty diff, see truth 3. |
| D-07 nothing posted until the user approves | Honoured | Checkpoint reply quoted in `01-02-SUMMARY.md`. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `coverage/p1-baseline/targeted-run1.log`, `verify-run1.log`, `coverage-run1.log` | Numbered run logs, each ending `exit=0` | VERIFIED | Present (gitignored); each ends `exit=0`; none red, so no decision files are due. |
| `01-ISSUE-169-COMMENT.md` | Seven-row outcome comment, contains `84a7b0a` | VERIFIED | Present, seven rows, cites `84a7b0a` and `e0f34d8`; it is the text of the single posted comment. |
| `01-01-SUMMARY.md`, `01-02-SUMMARY.md` | Evidence and checkpoint record | VERIFIED | Counts and SHAs in 01-01-SUMMARY match the logs line for line (873/873, 66 files, 19050/19050, 103.33s/339.06s/292.58s not re-timed). |
| `scripts/lua-coverage-floor.json` | Floor still 100 | VERIFIED | `{ "lines": 100 }`, identical to origin/main. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `01-ISSUE-169-COMMENT.md` | GitHub issue #169 | `gh issue comment 169` | WIRED | The issue holds exactly one comment (`issuecomment-6093365569`) and is closed as completed. |
| `01-01-SUMMARY.md` | the comment's opening line | baseline SHA, counts and coverage total copied | WIRED | Comment opens with `b032e6f`, 66 files, 873 tests, `19050/19050 = 100.00%`, matching the logs. |

### Data-Flow Trace (Level 4)

Not applicable: the phase produces no rendering code.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| The seven #169 cases pass | `npx vitest run` on the five named files, main checkout | 5/5 files, 120/120 tests, exit 0 (91.5 s) | PASS |

Step 7b note: the main checkout's local Vitest is 5.0.2 (header `RUN v5.0.2`), while the lock file and the scratch `npm ci` install used 5.0.3. Result is the same. Not blocking; the recorded baseline used the lock-file version.

### Probe Execution

Step 7c: SKIPPED (the phase declares no probe scripts).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CI-01 | 01-01, 01-02 | Full suite green on main; each of the seven #169 cases resolved with evidence | SATISFIED | Truths 1, 2, 5, 6. Both plans declare it; REQUIREMENTS.md maps it to Phase 1. |
| CI-02 | 01-01 | `npm run coverage` reports again and the 100% floor holds | SATISFIED | Truth 4. 01-01-PLAN declares it; 01-02-PLAN rightly claims CI-01 only. |

All requirement IDs accounted for: the union of PLAN frontmatter IDs (CI-01, CI-02) equals the IDs the phase was given. REQUIREMENTS.md traceability maps exactly CI-01 and CI-02 to Phase 1, so there are no orphaned requirements. (The checkboxes in REQUIREMENTS.md and the Phase 1 plan list in ROADMAP.md still read unticked, `[ ]` and "Pending"; that bookkeeping is for the orchestrator to update on phase completion.)

### Anti-Patterns Found

No implementation file was modified by this phase, so the debt-marker scan has nothing to scan (no `TBD`/`FIXME`/`XXX` introduced). None.

### Warnings (non-blocking)

- **W1. Row 4's cause line is imprecise.** The posted comment says the ledger test "never picked the Selling tab". On main, `auctionledger.test.mjs` has no `pickTab` call. What `84a7b0a` actually did was repoint the case at the new `upCard` (Up now) and read `IsShown()` instead of `IsVisible()`. The "never picked the Selling tab" wording comes from the `0cf01dc` message. The outcome (not a code bug, green on main, listings by default and history behind the toggle asserted at `:198`) stands. The author already accepted this caveat when approving the post. Optional follow-up: a one-line correcting comment on #169.
- **W2. SC3 is met only vacuously for commit bodies.** `e0f34d8`, which fixed cases 5 to 7 (it edited `helpers.mjs` fixtures and the chatwatch test), says "as the client does" in its body but cites no Blizzard source file. The phase could not amend it (it is on main) and made no new harness change. The citations were recorded in the #169 comment instead (rows 6 and 7, pinned to wow-ui-source `forever` at `2ced784`). I judge this acceptable. If the author reads SC3 literally, they should treat the #169 comment as the citation record.
- **W3. Rows 2 to 4 rest partly on commit messages.** `84a7b0a` is not a test-only commit: it rewrote `Modules/AuctionHelper.lua`, `AuctionLedger.lua`, `AuctionOwned.lua` and `AuctionSell.lua` for the new Selling layout and fixed the tests in the same commit. The "not a code bug" classification rests on `0cf01dc` (a tests-only commit with an empty `Modules/Auction*` diff against `eff5158`) and on the current code behaviour I checked directly. That evidence is sound. The wording "no addon change was needed" means "none was needed to resolve the cases", not "84a7b0a touched no addon code".
- **W4. A green suite is not an error-free suite.** Only `smoke.test.mjs` asserts an empty error list. Phase 2 (CI-04) may turn some tests red; that would not be a Phase 1 regression.

### Human Verification (non-blocking notes for the author)

These need the game and are about client behaviour, not the green baseline. I judged that none of them blocks the phase goal, because the addon does not depend on any of them and the tests that touch them pass under the stub's stated rules. They are recorded in `01-02-SUMMARY.md` and the #169 comment as "not verified in game".

1. Case 5: whether the Forever client gives an anchored, empty font string a rect (chat watch price). The addon anchors to the price only when there is one (`ChatWatch.lua:131`).
2. Case 6: where the engine places a nameplate. The fixture's `CENTER` point is a stand-in.
3. That wow-ui-source `forever` (at `2ced784`) matches the UI source of the Forever client the author plays on. This is the premise behind the Blizzard citations in rows 6 and 7.

### Gaps Summary

No gaps. The suite is green on a clean, lock-file install of origin/main (b032e6f), coverage reports and holds 100% at 19050/19050, issue #169 is closed as completed with one comment carrying seven recorded outcomes, and no addon, stub, test or floor file changed in the phase. Hosted-runner confirmation is explicitly deferred to Phase 3, as the phase goal states.

---

_Verified: 2026-10-09_
_Verifier: Claude (gsd-verifier)_
