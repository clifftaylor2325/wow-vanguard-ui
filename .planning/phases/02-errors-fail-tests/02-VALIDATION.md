---
phase: "2"
slug: "errors-fail-tests"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `02-RESEARCH.md` § Validation Architecture. The planner turns the requirement map below into a per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (lock file), projects `quick` and `lua` |
| **Config file** | `vitest.config.mjs`; setup file `scripts/tests/setup.mjs` |
| **Quick run command** | `npm run test:quick` (JS tests plus `smoke.test.mjs`, about 10 s) |
| **Full suite command** | `npm test` (66 files, 873 tests today; about 3.5 minutes on 16 threads); gate: `npm run verify` and `npm run coverage` |
| **Estimated runtime** | quick ~10 s; full ~4 to 6 min; verify + coverage ~11 min |

---

## Sampling Rate

- **After every task commit:** `npx vitest run <the touched area test file>` plus `npm run test:quick`; for a harness or `Core/Events.lua` change also `npx vitest run scripts/tests/core.test.mjs scripts/tests/errorrail.test.mjs`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** `npm run verify` and `npm run coverage` green, plus the shuffle smoke commands
- **Max feedback latency:** ~90 seconds for a task; the full suite per wave

---

## Requirement Verification Map (the planner refines this into tasks)

| Req | Criterion | Behavior | Automated command | Expected |
|-----|-----------|----------|-------------------|----------|
| CI-04 | SC1 | An unexpected `ns.errors` entry fails the test and the message names text, count and stack | `npx vitest run scripts/error-guard.test.mjs` | pass; unmarked entry gives a message with the text; matching marker gives none; never-matched marker fails |
| CI-04 | SC1 | The registry is drained and a real addon's error is seen | `npx vitest run scripts/tests/errorrail.test.mjs` | pass |
| CI-04 | SC1 | No exemption list in `setup.mjs` | `grep -nEi "exempt|allow|skip" scripts/tests/setup.mjs` | no output |
| CI-04 | SC2 | A throwing hook, `OnClick` handler and timer callback each land in `ns.errors` | `npx vitest run scripts/tests/errorrail.test.mjs` | pass |
| CI-04 | SC2 | Every site converted | `npm run quality` (new rule) and the two completeness greps in `02-RESEARCH.md` | exit 0; greps print nothing (only `Core/Combat.lua:118` may remain) |
| CI-04 | SC4 | Guard on, suite green, no exemptions | `npm test` | all files and tests pass, exit 0 |
| CI-04 | SC4 | Coverage floor holds | `npm run coverage` | total 100.00%, exit 0 |
| CI-04 | SC4 | Code-quality scan | `npm run verify` | exit 0 |
| CI-03 | SC3 | The config shuffles from `VG_SHUFFLE_SEED` and prints the seed | `VG_SHUFFLE_SEED=4242 npx vitest run --project quick` | output contains `Running tests with seed "4242"` |
| CI-03 | SC3 | JS tests are order independent (`link-wow` fix) | `VG_SHUFFLE_SEED=1 npm run test:quick`, then seeds 2 and 3 | exit 0 each |
| CI-03 | SC3 | The weekly workflow shuffles and prints the seed; the PR run does not | `grep -n "shuffle\|VG_SHUFFLE_SEED" .github/workflows/*.yml vitest.config.mjs` | `full-suite.yml` sets `shuffle` only for `schedule` |
| CI-03 | SC3 | First green hosted shuffled run | not runnable (billing block) | stays open by D-05; do not claim it |

---

## Wave 0 Requirements

- [ ] `scripts/lib/error-guard.mjs`: `expectErrors`, `caught`, `judge`, `check`
- [ ] `scripts/error-guard.test.mjs`: pure-function tests
- [ ] `scripts/tests/errorrail.test.mjs`: `ns.Guard` on a hook, a click, a timer and a nil callback
- [ ] `scripts/tests/setup.mjs` global `afterEach`; `createAddon` registry and `ns.ClearErrors` harvest in `scripts/lib/lua-harness.mjs`; re-export in `scripts/tests/helpers.mjs`
- [ ] Code-quality rule and its tests in `scripts/code-quality.test.mjs`
- [ ] `vitest.config.mjs` shuffle block; `link-wow.test.mjs` made order independent

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Negative control: a deliberately throwing hook turns its test red | CI-04 | Proves the guard bites end to end; reverted afterwards | Temporarily make one hook callback `error("TEST-ONLY control")`, run its area test and `npm run test:quick`, see the test fail with the entry text, then revert and record it in the summary |
| Does Forever show the error badge at login (aura-container notice)? | CI-04 (D-06) | Needs the game client | Author's in-game check list |
| Auction Post/Buy/Cancel clicks still work after being wrapped in `ns.Try` | CI-04 (D-03) | Needs the game client | Author's in-game check list, with Phase 5's Post check |
| First green shuffled run on the hosted runner | CI-03 (D-05) | Hosted runner is blocked by billing | Left open until the block clears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120 s per task
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
