---
phase: "3"
slug: "fast-suite-and-ci-gate"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3; projects `quick` (`scripts/*.test.mjs`, `scripts/tests/smoke.test.mjs`) and `lua` (`scripts/tests/*.test.mjs`, `scripts/lua-engine.test.mjs`); Lua harness on fengari 0.1.5 |
| **Config file** | `vitest.config.mjs` |
| **Quick run command** | `npm run test:quick` (about 10 s) |
| **Full suite command** | `npm run verify` (all tests plus the code-quality scan); `npm run coverage` (all tests plus the 100% Lua line floor) |
| **Estimated runtime** | quick about 10 s; full suite about 240 s on 2 workers at the phase start, about 140 s expected after scoped logins |

---

## Sampling Rate

- **After every task commit:** the task's own test files (`npm test -- <files>`) plus `npm run test:quick` and `npm run quality`
- **After every plan wave:** `npm run verify`; from wave 3 on, also `npm run timing -- --workers 4 --budget 900 --baseline .planning/phases/03-fast-suite-and-ci-gate/03-BASELINE-CASES.txt`
- **Where the scope data is built:** plan 03-06: `VITEST_MAX_WORKERS=4 npm run coverage` (19058/19058) and the baseline check, in 03-06's own worktree
- **Before `/gsd-verify-work`:** plan 03-07: `npm run verify`, `VG_LOGIN_SCOPE=full npm test`, the baseline check, `npm run coverage` (19058/19058), `luacheck --version`, then the quiet 2-worker timing runs
- **Max feedback latency:** about 60 s per task (quick project plus one area); whole-suite runs only where a plan says so

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | CI-06 | T-03-01 | argv passed to spawnSync as an array | tracer (CLI run) | `npm run timing -- --budget 300 scripts/workflows.test.mjs` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | CI-06 | T-03-02 | baseline written only from an all-passed run, never by hand | capture | `npm run timing -- --workers 4 --budget 900 --cases-out .planning/phases/03-fast-suite-and-ci-gate/03-BASELINE-CASES.txt` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | CI-06 | T-03-02 | missing, failed or skipped baseline case fails the run | unit | `npm test -- scripts/suite-timing.test.mjs` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | CI-05 | T-03-03, T-03-04, T-03-05, T-03-06 | event text only in if/concurrency; no privileged trigger; drafts never run; an unrelated label neither starts a run (even with full-tests already on) nor cancels one; no workflow sets VG_LOGIN_SCOPE | unit (truth table over the workflow's own expressions) | `npm test -- scripts/workflows.test.mjs` | ✅ (new cases W0) | ⬜ pending |
| 3-02-02 | 02 | 2 | CI-05 | — | N/A | text | `npm test -- scripts/workflows.test.mjs scripts/pkgmeta.test.mjs` | ✅ | ⬜ pending |
| 3-03-01 | 03 | 2 | CI-06 | T-03-08 | sampler only when LUA_PROFILE is set | tracer (CLI run) | `npm run profile -- login` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | CI-06 | T-03-07, T-03-08 | area name validated; nothing sampled when unset | unit + CLI | `npm test -- scripts/lua-profile.test.mjs` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 2 | CI-06 | T-03-09, T-03-10 | default login unchanged; guard untouched; real scoped login has zero errors | tracer (unit + area) | `npm test -- scripts/login-scope.test.mjs scripts/tests/auction.test.mjs` | ❌ W0 | ⬜ pending |
| 3-04-02 | 04 | 2 | CI-06 | T-03-09 | `--write` refuses partial runs; dry run leaves the data unchanged; the JSON report key of a nested case equals the runtime `currentTestName` shape | unit + dry run + key check | `npm test -- scripts/login-scope.test.mjs`; `git diff --exit-code scripts/tests/login-scope.json`; `npm run timing -- --workers 1 --budget 900 --cases-out coverage/p3-login-scope-cases.txt scripts/login-scope.test.mjs` then `grep -Fx "scripts/login-scope.test.mjs\|outer > inner"` on that file | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 3 | CI-05 | T-03-11, T-03-12, T-03-SC5 | digest confirmed a second way before pinning (automated `sha256sum -c` of a fresh download); pinned value equals the verified test constant; sha256sum -c before install; fail closed | unit (workflow text) + local checksum | `echo "<verified digest>  coverage/luacheck-verify/luacheck" \| sha256sum -c -` and `npm test -- scripts/workflows.test.mjs` | ✅ (new cases W0) | ⬜ pending |
| 3-05-02 | 05 | 3 | CI-05 | T-03-13, T-03-14 | exact pins; lock unchanged but one line | unit + install dry run | `npm test -- scripts/workflows.test.mjs scripts/pkgmeta.test.mjs` and `npm ci --dry-run --ignore-scripts` | ✅ | ⬜ pending |
| 3-05-03 | 05 | 3 | CI-05 | T-03-13 | every setup-node reads .nvmrc | unit (workflow text) | `npm test -- scripts/workflows.test.mjs` | ✅ | ⬜ pending |
| 3-06-01 | 06 | 3 | CI-06 | T-03-15, T-03-16 | data reproducible (probe on 4 workers, no timed-out case); coverage stays 19058/19058 with the data; 907 of 907 baseline cases pass, 0 failed, 0 skipped; hand-kept cases guarded | full suite with coverage + baseline | `VITEST_MAX_WORKERS=4 npm run coverage` and `npm run timing -- --workers 4 --budget 900 --baseline .planning/phases/03-fast-suite-and-ci-gate/03-BASELINE-CASES.txt` | ❌ W0 (data) | ⬜ pending |
| 3-06-02 | 06 | 3 | CI-06 | — | N/A | docs grep | `npm run test:quick` | ✅ | ⬜ pending |
| 3-07-01 | 07 | 4 | CI-05, CI-06 | T-03-18 | no case dropped, failed, skipped or hidden by scoping; coverage unchanged | gate | `npm run verify`; `VG_LOGIN_SCOPE=full npm test`; baseline check (exact `tests <N> passed, 0 failed, 0 skipped` line); `npm run coverage`; `luacheck --version`; `npm run lint` | ✅ | ⬜ pending |
| 3-07-02 | 07 | 4 | CI-06 | T-03-17 | measured on a quiet machine, load printed | timing | `npm run timing` (twice) and `VITEST_MAX_WORKERS=2 npm run coverage` | ✅ (after 03-01) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/03-fast-suite-and-ci-gate/03-BASELINE-CASES.txt` — the 907 phase-start case names, saved before any test edit (3-01-02)
- [ ] `scripts/suite-timing.mjs`, `scripts/lib/suite-timing.mjs`, `scripts/suite-timing.test.mjs` — the timing recorder and its tests (3-01-01, 3-01-03)
- [ ] `scripts/lib/lua-profile.mjs`, `scripts/profile-lua.mjs`, `scripts/lua-profile.test.mjs` — the profiler and its tests; output in the gitignored `coverage/profile/` (3-03-01, 3-03-02)
- [ ] `scripts/lib/login-scope.mjs`, `scripts/login-scope.test.mjs`, `scripts/login-scope-probe.mjs`, `scripts/tests/login-scope.json` — scoped logins, the probe and the data (3-04-01, 3-04-02, 3-06-01)
- [ ] New cases in `scripts/workflows.test.mjs` — the full-suite trigger truth table (3-02-01) and the toolchain pins (3-05-01..03)
- [ ] `.nvmrc` plus its `.pkgmeta` ignore entry (3-05-02)
- [ ] Framework install: none

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marking a PR ready for review starts one `full suite` run; a draft starts none; an unrelated label does not cancel a running one | CI-05 | Hosted runner blocked by billing (D-01 spirit); the wiring is proved locally by evaluating the workflow's own expressions | After billing clears: open a draft PR, mark it ready, check the Actions tab; add an unrelated label while it runs |
| The full suite takes under 300 s on the hosted 2-vCPU runner | CI-06 | Hosted runner blocked by billing; the user accepted leaving this open (D-01) | After billing clears: run `full suite` from the Actions tab and record the job time next to the proxy time |
| luacheck 1.2.0 binary runs on `ubuntu-latest`; `lua5.1` still needs apt; Node 24 and Playwright set up | CI-05 (housekeeping D-05) | Linux runner only (assumptions A3, A4, A6) | First hosted verify and full-suite runs: check the `luacheck --version` line and the setup-node step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s per task (whole-suite runs only where a plan says so)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
