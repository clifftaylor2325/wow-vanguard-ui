---
phase: "1"
slug: "green-baseline"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-09"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (lock file), projects `quick` and `lua` |
| **Config file** | `vitest.config.mjs` (setup `scripts/tests/setup.mjs`) |
| **Quick run command** | `npx vitest run scripts/tests/auction.test.mjs scripts/tests/auctionledger.test.mjs scripts/tests/chatwatch.test.mjs scripts/tests/plates.test.mjs scripts/tests/raid.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~90 s, full ~5 min on 16 cores, verify + coverage ~11 min |

---

## Sampling Rate

- **After every task commit:** run the five-file quick command (plus `npm run quality` if a `.mjs` test file changed)
- **After every plan wave:** run `npm test`
- **Before `/gsd-verify-work`:** `npm ci`, `npm run verify`, `npm run coverage` all green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | CI-01 | T-01-01, T-01-02 | the worktree gets its own `npm ci`; no tracked file is edited | targeted + git evidence | Paths resolve from `R="$(git rev-parse --show-toplevel)"`; worktree `W="$(dirname "$R")/vg-p1-baseline"`, logs `D="$R/coverage/p1-baseline"`. `npm --prefix "$W" ci`, then the five-file run via `npm --prefix "$W" test -- <five files>` into a new numbered log `$D/targeted-run<N>.log` (never overwritten), which also records `head=` and `vitest=`. Gates on the newest targeted log: last line `exit=0`; anchored on the Vitest summary, its one `Test Files` line reads `5 passed (5)` and its one `Tests` line is passed-only (so nothing failed/skipped/todo); `head=` equals origin/main; `vitest=` equals the lock file. Fail rule: every red `targeted-run<N>.log` has its matching `targeted-run<N>-decision.txt`, and the newest log is newer than that file. Git: `eff5158` and `0cf01dc` exist; `git diff --stat eff5158 0cf01dc -- 'Modules/Auction*'` is empty; `wow-layout.lua` is unchanged `eff5158..origin/main`; `84a7b0a` and `e0f34d8` are ancestors of origin/main; `! git merge-base --is-ancestor 0cf01dc origin/main`; `git diff --stat origin/main...HEAD -- Modules Core scripts` is empty (the branch's one `.pkgmeta` line, `b8786c5`, is packaging metadata outside D-06 and correctly excluded) | ✅ | ✅ green |
| 1-01-02 | 01 | 1 | CI-01 | T-01-02 | N/A | full suite + quality | `NO_COLOR=1 npm --prefix "$W" run verify` into a new numbered log `$D/verify-run<N>.log`. Gates on the newest verify log: last line `exit=0`; its one Vitest `Test Files` line and one `Tests` line are passed-only (anchored, so nothing failed/skipped/todo); the quality OK line; every `Lua harness by area` line n/n. Fail rule: every red `verify-run<N>.log` or `coverage-run<N>.log` has its matching `-decision.txt`, and the newest verify log is newer than that file | ✅ | ✅ green |
| 1-01-03 | 01 | 1 | CI-02 | T-01-01, T-01-02, T-01-03 | floor unchanged; the worktree is removed without touching the main checkout; the SUMMARY matches the logs | coverage + SUMMARY check | `NO_COLOR=1 npm --prefix "$W" run coverage` into a new numbered log `$D/coverage-run<N>.log`. Strings confirmed in `scripts/coverage-lua.mjs` (header template `Lua line coverage (floor ${floor}%)`, floor 100) and `scripts/lib/lua-coverage.mjs` (`formatReport`). Gates on the newest coverage log: last line `exit=0`, newer than the newest verify log (also `exit=0`); the template is present on origin/main; the exact line `Lua line coverage (floor 100%)`; a line matching `^  total +N/N +100[.]00%$` with covered = total; no row between the header and the total; no `is below the floor of`; its Vitest `Test Files` and `Tests` lines passed-only (anchored). Fail rule: every red verify or coverage log has its matching `-decision.txt`, and the newest verify log is newer than that file. The floor file reads 100 and matches origin/main; `$W` is gone; `$R/node_modules/vitest/package.json` is intact. SUMMARY (written in Task 3 step 4): `01-01-SUMMARY.md` exists and holds origin/main's short SHA, `100.00%` and the `covered/total` pair, the verbatim `Test Files` and `Tests` lines of the newest targeted, verify and coverage logs, and a run ledger row for every `*-run*.log` carrying its last line | ✅ SUMMARY created in 1-01-03 | ✅ green |
| 1-02-01 | 02 | 2 | CI-01 | T-01-06 | no local paths, user names or emails in the comment | file check | Paths resolve from `R`. The draft `01-ISSUE-169-COMMENT.md` has rows 1-7 exactly once, the origin/main short SHA, `84a7b0a`, `e0f34d8`, `100.00%`. Client claims: it cites `AH.SaveFilters` (row 2), `Blizzard_NamePlates.lua:634-640` and `SecureGroupHeaders.lua` at `2ced784` (rows 6 and 7), and has at least three lines with `not verified in game` (rows 5 and 6, closing line). Hygiene: the case-insensitive pattern from plan 01-02's context section (a drive letter followed by `:/` after a non-letter, `/c/`, `/home/`, `/users/`, `appdata`, an email address) finds nothing, with built-in controls (a `**Cause:**` line passes, a drive path is flagged), plus a node check for a colon followed by a backslash via `String.fromCharCode(92)`. The last commit subject starts `1-02-01 planning:`; the message ends with the Co-Authored-By trailer from the session's attribution reminder at execution time | ✅ created in 1-02-01 | ✅ green |
| 1-02-02 | 02 | 2 | CI-01 | T-01-04, T-01-05 | posting and closing need the user's approval (D-07); post-close is the recommended choice and the only one that follows D-05; post-open and hold are shown only as labelled D-05 deviations that need an explicit override; branch and PR handling is decided with the user | checkpoint:decision, gate blocking-human, no auto-select | none (human decision) | n/a | ✅ green |
| 1-02-03 | 02 | 2 | CI-01 | T-01-04, T-01-05, T-01-07, T-01-08 | posts only from the repository owner's account, at most once, and only after plan 01-01's newest `coverage-run<N>.log` ends with `exit=0` and `01-01-SUMMARY.md` exists; the expected end state comes from the user's own words | manual-by-command | The expected state is derived from the user's reply quoted word for word under `## Checkpoint reply` in `01-02-SUMMARY.md` (written first on every path): `override D-05: hold` gives `OPEN 0`, else `override D-05: post-open` gives `OPEN 1`, else `post-close` gives `CLOSED 1`; none, or both overrides, fails. `(cd "$R" && gh issue view 169 --json state,comments --jq '<state + count of comments with both fixing SHAs>')` must equal it. `CLOSED 1` is the D-05 state. `OPEN 1` / `OPEN 0` pass only when `01-02-SUMMARY.md` also has a `## D-05 override` section. Any state that wrote to the issue also re-checks the newest coverage log and `01-01-SUMMARY.md` | ✅ SUMMARY created in 1-02-03 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs are final (planner, 2026-10-09; revised the same day after plan-checker feedback). Plan 01-01 runs coverage before plan 01-02 posts anything, because D-05 closes #169 only after D-04 passes. Every run writes its own numbered log, so a red run is never overwritten. A red run never counts toward the baseline: the plan stops, the user decides, the decision goes in that log's own `-decision.txt`, and only clean runs made after that decision count. The Vitest gates read the anchored `Test Files` and `Tests` summary lines, not a free grep. Revised again after the third plan-checker round.*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Post the #169 outcome comment and close the issue | CI-01 | Posts to a public tracker; needs the user's go-ahead (D-07) | Draft the seven-row table, show it, post and close only after approval (D-05: close once the seven outcomes are recorded and D-04 passed; leaving it open needs the user's recorded override). The user's reply is quoted word for word in `01-02-SUMMARY.md` before any write; then run `gh issue view 169 --comments` |
| Branch and PR handling for the phase | CI-01 | A PR is outward-facing, and CLAUDE.md asks for one PR per phase from a `work/p<N>-...` branch while the phase's commits sit on `work/gsd-planning` | Ask the user at the 1-02-02 checkpoint; record the decision or exemption in `01-02-SUMMARY.md`. The plans open no PR and push no branch |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (1-02-02 is a human checkpoint by design)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none were missing)
- [x] No watch-mode flags
- [x] Feedback latency < 120 s (the five-file run took 103.33 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Caveat recorded at audit:** the executors ran the plans' one-line verify gates condition by condition, not verbatim, because the isolation guard refused compound git commands. The underlying checks (exit codes, Vitest summary lines, coverage total, git evidence, issue state) all passed.

**Approval:** approved 2026-10-09 (orchestrator audit)

## Validation Audit 2026-10-10

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
