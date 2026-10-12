---
phase: 03-fast-suite-and-ci-gate
verified: 2026-10-12T02:50:00Z
status: passed
score: 3/3 roadmap truths verified (plus all plan must-haves; hosted evidence checked by me via gh)
covered_files:
  - ".github/workflows/full-suite.yml"
  - ".github/workflows/lua-suite.yml"
  - ".github/workflows/verify.yml"
  - ".nvmrc"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-01-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-01-SUMMARY.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-02-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-02-SUMMARY.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-03-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-03-SUMMARY.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-04-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-04-SUMMARY.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-05-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-05-SUMMARY.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-06-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-06-SUMMARY.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-07-PLAN.md"
  - ".planning/phases/03-fast-suite-and-ci-gate/03-07-SUMMARY.md"
  - "package.json"
  - "scripts/lib/login-scope.mjs"
  - "scripts/lib/lua-profile.mjs"
  - "scripts/lib/preview-scenes.mjs"
  - "scripts/lib/suite-timing.mjs"
  - "scripts/login-scope.test.mjs"
  - "scripts/preview-ui.mjs"
  - "scripts/tests/helpers.mjs"
  - "scripts/tests/login-scope.json"
  - "scripts/tests/preview.test.mjs"
  - "scripts/workflows.test.mjs"
covered_digest: "v3:sha256:0b8456a6228c11cdf69414e59719dba651d3abfd397aec5759e556f7b7f064b3"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 3/3 locally, hosted parts open (D-01)
  gaps_closed:
    - "CI-05 hosted trigger behaviour (ready, draft, label, push without label) observed on PR #242 runs"
    - "CI-06 hosted time measured: 205 s, then 271 s"
    - "Toolchain pins (luacheck sha256, .nvmrc / setup-node@v7, Node 24) proved on a hosted runner"
    - "UI preview job failure (G-03-4) fixed in be36bed and 3260114; green on run 38196119168"
    - "WR-01 fixed in f1c3d26; IN-05 wontfix recorded"
  gaps_remaining: []
  regressions: []
---

# Phase 3: Fast suite and CI gate Verification Report

**Phase Goal:** The full suite is fast enough to run on every PR that is ready for review, and it runs there automatically.
**Verified:** 2026-10-12
**Status:** passed
**Re-verification:** Yes, after the hosted runs on PR #242 and the commits be36bed, 3260114 and f1c3d26

The previous report held the phase at `human_needed` because billing blocked hosted runs. Hosted runs now exist. I read them myself with `gh` (not only the UAT file) and re-ran the local checks against the current tree.

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every push runs the quick check, and marking a PR ready for review, or adding the `full-tests` label, starts the full suite | VERIFIED (hosted and local) | Hosted, from `gh run list` and the issue events/timeline API for PR #242: the PR's `opened` event fired while it was a draft, and both `verify` (run 38143933561) and `full suite` (38143933849) concluded `skipped` at 13:37:44-45Z. The `ready_for_review` event is in the timeline at 13:37:53Z; `verify` (38143945148) and `full suite` (38143945159) started at 13:37:55Z, once each. Push `3260114` at 02:29:20Z without the label: `verify` 38195973754 ran and succeeded, `full suite` 38195973857 was `skipped`. The `labeled` event for `full-tests` at 02:31:23Z started `full suite` 38196119168 at 02:31:25Z. Push `4dd6a63` with the label on: `verify` 38196443264 succeeded and `full suite` 38196443354 is in progress. Local: `full-suite.yml` `pull_request.types` and the job `if` read as the plan requires; the 33-case truth table in `scripts/workflows.test.mjs` passes inside `npm run test:quick` (13 files, 232 tests, run by me). README.md line 210 describes it. |
| 2 | Full suite finishes in under 5 minutes, measured and recorded | VERIFIED | Hosted, run 38143945159: job "Tests, coverage and checks" 13:37:59Z to 13:41:24Z = 205 s (`npm run coverage` step 182 s). Hosted, run 38196119168 (head `3260114`, which includes the new preview test file): the same job 02:31:29Z to 02:36:00Z = 271 s, `npm run coverage` step 02:31:44Z to 02:35:53Z = 249 s. Both are under 300 s, but the margin has shrunk to about 29 s on the second run. Local 2-worker proxy, my run just now: 178.8 s, exit 0, `within budget: 178.8 s <= 300 s` (machine 24% busy before the run; the earlier recorded local runs were 148.5 to 158.7 s). Phase-start time was 241 s locally. See Note on margin below. |
| 3 | No case dropped or skipped; test count and 100% coverage floor match the start of the phase | VERIFIED | My `npm run timing -- --baseline 03-BASELINE-CASES.txt`: `baseline: 907 of 907 cases present and passed`, 121 new cases, all in files this phase added (login-scope 28, lua-profile 8, suite-timing 14, preview 38, workflows 33). `git diff 2624b1f..HEAD` modifies no existing test file, deletes nothing, adds no `.skip`/`.todo`; `scripts/lua-coverage-floor.json` is still `{ "lines": 100 }` and unchanged. Hosted run 38196119168 log: `Test Files 73 passed (73)` and `Lua line coverage (floor 100%)  total 19058/19058 100.00%`, so the floor passes on the code at `3260114`. `4dd6a63` and the current HEAD differ from `3260114` only in `03-UAT.md`. |

**Score:** 3/3 roadmap truths verified; 0 behaviour-unverified.

### Note on margin

The hosted job went from 205 s to 271 s between two runs of nearly the same suite (the second adds 38 preview cases at about 17 s and ran on whatever runner it got). Both meet CI-06's 300 s. The run-to-run spread on a hosted runner is evidently large, so the 300 s bound is met but not by a wide margin on the second run. This is a watch item for later phases, not a gap; the user accepted the D-06 internal budget in UAT 5.

### Plan must-haves (beyond the roadmap contract)

| Must-have | Status | Evidence |
|-----------|--------|----------|
| `npm run timing` / `npm run profile` work (03-01, 03-03) | VERIFIED | `timing` ran end to end for me (header, per-file table, baseline line, new cases by file, exit 0). `lua-profile.test.mjs` passes in the quick project. |
| Scoped logins; Phase 2 error guard unchanged (03-04, 03-06) | VERIFIED | `helpers.mjs` `loggedIn` uses `scopeFor`; `login-scope.json` committed; baseline 907 of 907 with the data applied. The full suite (hosted 73 files) passes with scoped logins. |
| WR-01: a scoped brand-new account is not migrated | VERIFIED | `f1c3d26` changes `modulesOffLua` to create `VanguardDB = VanguardDB or { version = <DB_VERSION> }`, with `DB_VERSION` read from `Core/DB.lua`. A new case ("a scoped brand-new account is not migrated ... (WR-01)") asserts the scoped and unscoped migration counts match and are 0; it passes in my run. |
| Toolchain pins (03-05) | VERIFIED hosted | Hosted run 38196119168: `sha256sum -c` step present and the "luacheck 1.2.0 and Lua 5.1" step succeeded; both `actions/setup-node@v7` steps use `node-version-file: .nvmrc`; `luacheck --version` step succeeded; UI preview ran on that setup. `workflows.test.mjs` and `pkgmeta.test.mjs` pass. |
| UI preview job builds (UAT gap G-03-4) | VERIFIED | The first hosted run's "Suite / UI preview" failed (`FontString:SetText(): Font not set`). Fix `be36bed` then `3260114` (scenes moved into `scripts/lib/preview-scenes.mjs`, with `scripts/tests/preview.test.mjs` building every scene in the Lua harness). Hosted run 38196119168: "Suite / UI preview" success (3 min), `npm run preview` step success. `preview.test.mjs` (38 cases) passes in my timing run. |
| `lua-suite.yml` header carries the measured proxy time (03-07) | VERIFIED | Commit `c17be4c`, comment-only. It still says the hosted time was open; now superseded by the hosted figures above (comment text is stale, cosmetic). |
| 03-02 truth: unrelated label neither starts nor cancels; a push without the label cancels an in-progress run | VERIFIED as written (text and truth table); hosted cancel not observed by me | The job `if` skips any `labeled` event not for `full-tests`, and the concurrency group gains the `-other-label` suffix for it; pushes and opens share `full-suite-pull_request-<number>`. The truth table passes. Hosted: the only label event on PR #242 is `full-tests`, and no cancelled run exists in the list, so I could not independently observe the cancel or the unrelated-label case; UAT 2 records user confirmation. This is a plan-level truth (assumption A2), not a roadmap criterion. |

### Cheap checks I ran

| Check | Result |
|-------|--------|
| `npm run quality` | OK |
| `npm run test:quick` | 13 files, 232 tests passed, Lua smoke 1/1 |
| `npm run timing -- --baseline 03-BASELINE-CASES.txt` (2 workers) | exit 0, 178.8 s, 907 of 907, max concurrent files 2, 121 new cases |
| `gh run view` on 38143945159 and 38196119168; `gh run list`; issue events/timeline | as above |
| `npm run coverage`, `npm run verify`, `npm run lint` | Not run locally. The hosted `npm run coverage`, `npm run quality` and luacheck steps on `3260114` all succeeded (coverage 19058/19058, floor 100%). |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CI-05 | 03-02, 03-05, 03-07 | Full suite runs on ready-for-review and on the `full-tests` label; the quick check runs on every push | SATISFIED | Hosted runs listed under Truth 1: draft skipped, `ready_for_review` starts both, label starts the suite, a push without the label runs only the quick check. |
| CI-06 | 03-01, 03-03, 03-04, 03-06, 03-07 | Full suite finishes in under 5 minutes on the hosted runner, measured and recorded | SATISFIED | Hosted job times 205 s and 271 s, both under 300 s; recorded here and in 03-UAT.md; per-file table and local proxy in 03-07-SUMMARY.md. |

Both IDs appear in REQUIREMENTS.md (lines 21-22 and traceability rows 90-91); there are no other Phase 3 requirements, so none are orphaned. REQUIREMENTS.md still shows both as `[ ]` / Pending: it should be updated to Complete, which is left to the orchestrator.

### Anti-Patterns Found

None blocking. `npm run quality` passes. The new `preview-scenes.mjs` is a straight move of scene code out of `preview-ui.mjs` plus the fix; the harness test builds each scene.

### Review and security status

03-REVIEW-DISPOSITION.md: WR-01 fixed, IN-05 wontfix; IN-01 to IN-04 remain `open` as advisory notes (IN-02: a later push without the label cancels the ready-for-review run and gets no full-suite verdict of its own, which is D-04 as written and documented in README). 03-SECURITY.md: `threats_open: 0` (from the previous report; I did not re-read it).

### Human Verification Required

None. All six former items are resolved in 03-UAT.md; items 1, 3 and 4 and the trigger half of the phase goal were re-checked by me against hosted runs. Item 2 (unrelated label, cancel on push) rests on the truth-table test plus user confirmation, as noted above.

### Gaps Summary

No gaps. The suite runs on every ready-for-review PR automatically (observed on PR #242), takes 205 to 271 s on the hosted runner, keeps all 907 baseline cases and the 100% coverage floor, and the UI preview job is green after its fix.

---

_Verified: 2026-10-12_
_Verifier: Claude (gsd-verifier)_
