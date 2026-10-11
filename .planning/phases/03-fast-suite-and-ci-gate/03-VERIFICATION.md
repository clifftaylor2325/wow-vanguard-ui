---
phase: 03-fast-suite-and-ci-gate
verified: 2026-10-11T13:30:00Z
status: human_needed
score: 3/3 roadmap truths verified locally (hosted parts of 2 of them open by accepted decision D-01)
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
  - "scripts/lib/suite-timing.mjs"
  - "scripts/tests/helpers.mjs"
  - "scripts/tests/login-scope.json"
  - "scripts/workflows.test.mjs"
covered_digest: "v3:sha256:4d05cd5cc40d14666a5491d2c87d986d1118cc1544a3269589fbac81597a9771"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Open a pull request already marked ready (not draft) on a hosted runner and watch the Actions tab"
    expected: "verify (Quick checks) and full suite (Suite) each start once; a draft pull request starts neither; marking a draft ready starts both via ready_for_review"
    why_human: "CI-05. The trigger logic is proved only locally, by a truth-table test over the workflow's own expressions (scripts/workflows.test.mjs). No hosted run exists because billing is blocked (D-01)."
  - test: "On a ready pull request carrying full-tests, add an unrelated label while a full-suite run is in progress; then push without the label on another pull request"
    expected: "The unrelated label starts nothing and cancels nothing (assumption A2: the skipped run lands in the '-other-label' concurrency group). A push without the label cancels a run still in progress."
    why_human: "Concurrency-group and cancel behaviour is GitHub-side runtime behaviour; the workflow text is only evaluated locally."
  - test: "Read the 'Tests, coverage and checks' job time from the first hosted full-suite run"
    expected: "Under 5 minutes wall time on the hosted runner (CI-06 as written)"
    why_human: "CI-06 says 'on the hosted runner, measured and recorded'. Only the 2-worker local proxy (148.5 to 158.7 s) exists. A hosted 2-vCPU runner may be faster or slower than the i7-13620H used here."
  - test: "First hosted run of verify.yml and lua-suite.yml after the toolchain pins"
    expected: "luacheck 1.2.0 binary installs after sha256sum -c accepts the digest (and a wrong digest would fail the step); lua5.1 still installs through apt; node-version-file: .nvmrc sets up Node 24 with cache: npm on actions/setup-node@v7; the Playwright preview job runs on Node 24"
    why_human: "Assumptions A3, A4, A6 from 03-05 can only be proved on a hosted ubuntu-latest runner."
  - test: "Decide whether D-06's internal 150 s budget needs module startup work (D-02, one module at a time)"
    expected: "A decision. Recorded runs: 155.5 s and 158.7 s (over by 5.5 and 8.7 s); this verification's independent run: 148.5 s (under). The 300 s requirement is met in every run."
    why_human: "Judgement call on a noisy margin; D-02 requires the user's approval before any module change."
  - test: "Decide the open review items: WR-01 (scoped firstRun login runs MigrateDB(0,2)) and IN-05 (UI preview job now runs on every ready-for-review PR)"
    expected: "Each marked fixed, deferred or wontfix in 03-REVIEW-DISPOSITION.md"
    why_human: "WR-01 is latent (nothing fails today); IN-05 trades against the free-tier minutes constraint and is best decided with the first hosted run."
---

# Phase 3: Fast suite and CI gate Verification Report

**Phase Goal:** The full suite is fast enough to run on every PR that is ready for review, and it runs there automatically.
**Verified:** 2026-10-11
**Status:** human_needed
**Re-verification:** No, initial verification

The local half of the goal is met and independently re-checked. The hosted half (the full suite actually starting on GitHub, and its time on a hosted runner) cannot be observed from this machine because billing blocks hosted runs. Per D-01 the user accepted leaving that open. So the status is `human_needed`, not `passed`, and CI-05 and CI-06 are not marked complete.

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every push runs the quick check, and marking a PR ready for review, or adding the `full-tests` label, starts the full suite | VERIFIED locally; hosted behaviour in Human Verification | `verify.yml` triggers on `[opened, synchronize, reopened, ready_for_review]` (job skipped for drafts). `full-suite.yml` `pull_request.types` is `[opened, ready_for_review, labeled, synchronize, reopened]`; the `suite` job `if` runs for `opened`/`ready_for_review`/`reopened`, and for later events only when `full-tests` is on the PR; a draft never runs; a `labeled` event for any other label is skipped and given its own concurrency group. The truth table in `scripts/workflows.test.mjs` (40 tests) passes when run by me. README.md line 210 and `scripts/tests/README.md` line 202 describe it. |
| 2 | Full suite finishes in under 5 minutes on a 2-worker local proxy for a 2-vCPU runner, with measured time and per-file times recorded; hosted measurement left open (D-01) | VERIFIED for the local proxy; hosted half OPEN by accepted decision | My own run of `npm run timing -- --baseline 03-BASELINE-CASES.txt`: exit 0, workers 2, busy before run 9%, total wall 148.5 s, `within budget: 148.5 s <= 300 s`. Recorded runs in 03-07-SUMMARY.md: 155.5 s, 158.7 s plain, 170.7 s with coverage, `max concurrent files 2`, per-file table of 72 rows present. Phase-start figure was 241 s. |
| 3 | No case dropped or skipped: test count and the 100% coverage floor match the start of the phase | VERIFIED | My run of the baseline check: `baseline: 907 of 907 cases present and passed`; 989 tests (907 + 82 new, all in four files this phase added or extended: login-scope 27, lua-profile 8, suite-timing 14, workflows 33). `git diff 2624b1f..HEAD` touches no existing `scripts/tests/*.test.mjs`, adds no `.skip`/`.todo`, and deletes no file. `03-BASELINE-CASES.txt` has 907 lines and was committed in `6521e6a`, before the scoped-login commits. `coverage/p3-gate-coverage.log`: `total 19058/19058 100.00%`; floor file still `{ "lines": 100 }`. I did not re-run `npm run coverage`. |

**Score:** 3/3 truths verified locally; 0 behaviour-unverified truths in the verifier's sense (the hosted items are listed under Human Verification because they need a platform I cannot reach, not because tests are missing).

### Plan must-haves spot-check (beyond the roadmap contract)

| Must-have | Status | Evidence |
|-----------|--------|----------|
| `npm run timing` / `npm run profile` exist and work (03-01, 03-03) | VERIFIED | `package.json` has `"timing"` and `"profile"` scripts; `scripts/lib/suite-timing.mjs` (147 lines) and `lua-profile.mjs` (194 lines) are substantive; timing ran end to end for me, printing the header, per-file table, baseline line and new-case list. |
| Scoped logins with no new exemption from the Phase 2 error guard (03-04, 03-06) | VERIFIED | `helpers.mjs` `loggedIn` appends `modulesOffLua(scopeFor(...))` to the SavedVariables text; `createAddon` is still the only factory; `setup.mjs` diff only adds profiler dump/reset lines, the guard `afterEach` is untouched. `login-scope.json` holds 57 scoped files. `VG_LOGIN_SCOPE=full` run green (989) per `p3-gate-full-logins.log`. |
| Toolchain pins (03-05) | VERIFIED statically | `.nvmrc` = `24`, in `.pkgmeta` ignore; `node-version-file: .nvmrc` in all four workflow places; `package.json` `"fengari": "0.1.5"`; luacheck binary installed only after `sha256sum -c` in `verify.yml` (and `lua-suite.yml`); `pkgmeta.test.mjs` and `workflows.test.mjs` pass for me. Hosted behaviour is in Human Verification. |
| `lua-suite.yml` header carries the measured proxy time (03-07) | VERIFIED | Commit `c17be4c`, comment-only change. |

### Cheap checks I ran

| Check | Result |
|-------|--------|
| `npm run quality` | OK (every function documented and at most 10 lines; theme-only colours) |
| `npm run test:quick` | 13 files, 231 tests passed |
| `npx vitest run scripts/workflows.test.mjs scripts/login-scope.test.mjs scripts/pkgmeta.test.mjs` | 3 files, 69 tests passed |
| `npm run timing -- --baseline 03-BASELINE-CASES.txt` (2 workers) | exit 0, 148.5 s, 907 of 907, 989 passed |
| Full `npm run coverage`, `npm run verify`, `VG_LOGIN_SCOPE=full npm test` | Not re-run; relied on logs `coverage/p3-gate-*.log` (verify: 989 passed; coverage 19058/19058; full-login: 989 passed) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CI-05 | 03-02, 03-05, 03-07 | Full suite runs on ready-for-review and on the `full-tests` label; the quick check runs on every push | LOCALLY SATISFIED, hosted proof OPEN | Workflow triggers and truth-table test verified above. No hosted run has exercised them. Keep Pending in REQUIREMENTS.md until a hosted run is seen. |
| CI-06 | 03-01, 03-03, 03-04, 03-06, 03-07 | Full suite finishes in under 5 minutes on the hosted runner, measured and recorded | NOT SATISFIED AS WRITTEN; proxy met | The measurement is on a local 2-worker proxy (148.5 to 158.7 s). The words "on the hosted runner" are unmet; the user accepted this explicitly (D-01). Keep Pending. |

Both IDs appear in REQUIREMENTS.md (lines 21-22, traceability rows 90-91, "Pending"). No orphaned Phase 3 requirements. The SUMMARYs' `requirements-completed` fields are consistent with this: 03-05 and 03-07 leave the list empty, and 03-02 (CI-05) and 03-01/03/04/06 (CI-06) claim only their share.

### Anti-Patterns Found

None blocking. The `process.exit(1)` hits in the diff are CLI error exits. No TBD/FIXME/XXX introduced in the phase's files that I scanned by diff-grep for skips; the code-quality scan passes.

### Review and security status

- 03-REVIEW.md: 0 critical, 1 warning (WR-01), 5 info (IN-01..IN-05), all `open` in 03-REVIEW-DISPOSITION.md. The review gate is advisory; none contradicts a roadmap truth. Two bear on the goal and are worth a decision:
  - IN-02 / README: a later push without the label cancels the in-progress ready-for-review run and gets no full-suite verdict of its own. This matches D-04 as written, but it means "full suite on every ready PR" holds at the ready moment, not for every subsequent push unless the label is on.
  - IN-05: the UI preview job now also runs on every ready-for-review PR, against the free-tier minutes constraint.
- 03-SECURITY.md: `status: verified`, `threats_open: 0`.

### Known and accepted deviations (weighed, not hidden)

- **Hosted measurement and hosted trigger behaviour: unverified.** Billing blocks hosted runs. Accepted by the user under D-01. These are the Human Verification items 1 to 4.
- **D-06 internal budget (150 s or less) is borderline.** Recorded runs were 155.5 s and 158.7 s (missed); my independent run was 148.5 s (met). Run-to-run spread of about 10 s with machine load is larger than the margin. The user accepted the local result. It is listed as a decision, not a failure, because the requirement figure is 300 s.
- **`npm run lint` exits 1 on this machine** only because of two user-owned git worktrees under `.claude/worktrees/` (742 warnings, all in those worktrees). The repo-only run (`luacheck . --exclude-files node_modules/ scripts/ Libs/ .claude/`) reports 0 warnings in 114 files and is the accepted evidence. A clean hosted checkout does not contain those worktrees. Not independently re-run here. Optional follow-up: add `.claude/` to `.luacheckrc` `exclude_files`.
- Shared logins and file splits were dropped from D-02 after research (D-06), so the "harness-only levers" were the profiler, scoped logins and the timing recorder. This is consistent with the delivered code.

### Gaps Summary

No code gap blocks the phase goal as scoped by the user's decisions. The suite is about 35 to 40 percent faster than at phase start (241 s to roughly 150-159 s on the same 2-worker proxy), it carries all 907 baseline cases plus 82 new ones, coverage is unchanged at 100%, and the workflow wiring for ready-for-review, the `full-tests` label and drafts is present and pinned by a truth-table test. What remains is evidence only a hosted GitHub run can give, so the phase is `human_needed` rather than `passed`. REQUIREMENTS.md should keep CI-05 and CI-06 Pending until that run exists.

---

_Verified: 2026-10-11_
_Verifier: Claude (gsd-verifier)_
