---
phase: "3"
slug: "fast-suite-and-ci-gate"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-11"
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail. Verified by the security auditor against the tip of `work/gsd-planning` with all 7 plans merged. No addon Lua changed in this phase; the surface is test tooling, CI workflow files and pinned downloads.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| developer shell to the timing, profile and probe CLIs | file filters and options typed by the developer reach `spawnSync` as an argv array | argv |
| baseline file to the phase gate | the committed list of 907 cases is the evidence that no case was dropped | case names |
| pull request events to `full-suite.yml` | event text (action, label name, draft flag) decides whether the suite runs | event fields in `if` and `concurrency` only |
| release download to the CI runner | the luacheck 1.2.0 binary is fetched and installed | binary, SHA-256 digest |
| `login-scope.json` to the test logins | probe-derived data decides which modules a test logs in with | module names |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|----------------------|--------|
| T-03-01 | Tampering | `suite-timing.mjs` argv passthrough | low | accept | local developer tool; argv array to `spawnSync`, no `shell:`; no workflow runs it (`scripts/suite-timing.mjs:56-58`) | closed (accepted) |
| T-03-02 | Repudiation | `03-BASELINE-CASES.txt` | medium | mitigate | `writeCases` refuses when any case did not pass; `baselineProblems` fails on a missing, failed or skipped case; 907 lines, committed alone in `6521e6a` | closed |
| T-03-03 | Elevation of privilege | `full-suite.yml` `if` and `concurrency` | high | mitigate | event values only at the concurrency line and the job `if`; `workflows.test.mjs:263-267` fails on `${{ github.event` or `${{ inputs.` in any `run:` | closed |
| T-03-04 | Elevation of privilege | fork PRs running the full suite | high | mitigate | trigger stays `pull_request`; test forbids `pull_request_target` and pins the permissions (`workflows.test.mjs:244-247`) | closed |
| T-03-05 | Denial of service | concurrency group | medium | mitigate | `-other-label` suffix and the `labeled` clause in the job `if`; truth table at `workflows.test.mjs:197-223`. Hosted cancel behaviour (A2) not verified | closed |
| T-03-06 | Denial of service | Actions minutes | medium | mitigate | `!github.event.pull_request.draft`; draft and label cases in the truth table | closed |
| T-03-07 | Tampering | `profile-lua.mjs` area argument | low | mitigate | `/^[a-z0-9-]+$/` plus a list check, else exit 1; argv array, no shell; output fixed under gitignored `coverage/profile` (`scripts/profile-lua.mjs:70-76`) | closed |
| T-03-08 | Repudiation | `attachHooks` and `setup.mjs` | medium | mitigate | sampler runs only when `LUA_PROFILE` is set (`lua-harness.mjs:210-212`); the `afterEach` error guard lines are unchanged | closed |
| T-03-09 | Repudiation | scoped logins hiding errors | high | mitigate | no scope data or login outside a case gives the full login; `VG_LOGIN_SCOPE=full` run passed 989 of 989; coverage floor 19058/19058 unchanged | closed |
| T-03-10 | Tampering | Phase 2 error guard | high | mitigate | `loggedIn` still builds through `createAddon`; real-login tests assert `#ns.errors` is 0; no `expectErrors(` call added | closed |
| T-03-11 | Tampering | luacheck release binary | high | mitigate | `sha256sum -c` runs before `sudo install` in both workflows, `wait` fails the verify step; digest pinned as a test constant; digest also confirmed by a second download and a good GPG signature | closed |
| T-03-12 | Elevation of privilege | workflow `run:` scripts | high | mitigate | digest and URL come from step `env:`; no `${{` in those scripts; permissions unchanged | closed |
| T-03-13 | Tampering | Node version drift | medium | mitigate | `.nvmrc` holds 24; every `setup-node` step reads it; tests count the steps and forbid `node-version:` | closed |
| T-03-14 | Tampering | fengari range and lock drift | medium | mitigate | `fengari` pinned to exactly 0.1.5 in `package.json` and the lock (one line each) | closed |
| T-03-15 | Tampering | `login-scope.json` drift | medium | mitigate | two probe runs gave byte-identical JSON (786 cases, 147 full, 639 scoped); rename and agreement guards in `login-scope.test.mjs` | closed |
| T-03-16 | Repudiation | dropped or skipped cases, lost coverage | high | mitigate | baseline: 907 of 907 present and passed, `tests 989 passed, 0 failed, 0 skipped`; coverage 19058/19058; no existing test file edited | closed |
| T-03-17 | Repudiation | recorded suite time | medium | mitigate | timing logs print CPU, cores, Node, Vitest, workers and load before the run; `lua-suite.yml` says the hosted time is not measured | closed |
| T-03-18 | Repudiation | phase invariants | high | mitigate | gate logs show 907 of 907, coverage unchanged, `verify` and `VG_LOGIN_SCOPE=full` both green | closed |
| T-03-SC1..SC7 | Tampering | npm installs and luacheck binary (one row per plan) | high | mitigate | no package added; only `fengari ^0.1.5` to `0.1.5` and two scripts in `package.json`; CI uses `npm ci`; the binary is covered by T-03-11 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-01 | The timing tool is a local developer command that passes arguments as an argv array, never a shell string, and no workflow runs it. | plan author (low severity) | 2026-10-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-11 | 25 (18 plus 7 T-03-SC rows) | 25 | 0 | gsd-security-auditor (ASVS level 1, block_on high) |

---

## Non-blocking observations (from the audit)

1. Hosted behaviour is unverified until billing clears: whether a skipped run still cancels its concurrency group (A2), whether the luacheck binary runs on `ubuntu-latest` (A3), and whether the `wait` fails the verify step on a bad digest. The mitigations are in the workflow text and pinned by tests.
2. T-03-09 leaves a residual risk the 03-06 SUMMARY admits: a scoped case that passes without testing anything, and is not the only case to run some line, is not detected. The `VG_LOGIN_SCOPE=full` check ran once at the gate and is not repeated in CI; only the 100% coverage floor guards this in CI.
3. The signing key for the luacheck release is uncertified in gpg (`[unknown]`). Trust rests on two key channels agreeing plus matching downloads.
4. `npm run lint` exits 1 on machines with git worktrees under `.claude/worktrees/` (742 warnings, none in tracked files). Not part of any threat's mitigation.
5. No unregistered threat flags in any SUMMARY.
