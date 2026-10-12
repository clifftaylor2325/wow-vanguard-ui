---
phase: 02-errors-fail-tests
verified: 2026-10-10T10:45:00Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - .github/workflows/full-suite.yml
  - .github/workflows/lua-suite.yml
  - .planning/phases/02-errors-fail-tests/02-01-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-01-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-02-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-02-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-03-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-03-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-04-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-04-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-05-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-05-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-06-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-06-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-07-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-07-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-08-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-08-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-09-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-09-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-10-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-10-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-11-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-11-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-12-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-12-SUMMARY.md
  - .planning/phases/02-errors-fail-tests/02-13-PLAN.md
  - .planning/phases/02-errors-fail-tests/02-13-SUMMARY.md
  - Core/Combat.lua
  - Core/Events.lua
  - Modules/ChatExtras.lua
  - scripts/code-quality.test.mjs
  - scripts/lib/code-quality.mjs
  - scripts/lib/error-guard.mjs
  - scripts/lib/lua-harness.mjs
  - scripts/link-wow.test.mjs
  - scripts/tests/errorrail.test.mjs
  - scripts/tests/setup.mjs
  - scripts/workflows.test.mjs
  - vitest.config.mjs
covered_digest: "v3:sha256:d84f2327e9d95bcd2f8671301042a02c8ff5bd95ba9d088a3acf5f627fa832a2"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Errors fail tests - Verification Report

**Phase Goal:** A test cannot pass while the addon swallows an error, and a red run says exactly what broke.
**Verified:** 2026-10-10
**Status:** passed
**Re-verification:** No, initial verification
**Requirement IDs:** CI-03, CI-04 (both claimed by the plans and both present in REQUIREMENTS.md; none orphaned)

## Goal Achievement

### Observable Truths (ROADMAP Phase 2 success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Any test that leaves an entry in `ns.errors` fails, the failure prints text and origin; a deliberate error is named with a marker inside the test; no test or file is exempt | VERIFIED | `scripts/tests/setup.mjs` is a global `afterEach` that runs `check(createdAddons.splice(0), takeExpected())` for both vitest projects (`vitest.config.mjs` `setupFiles` is set at the top level and the projects `extends: true`). It names no file or test, has no opt-in (`VG_ERROR_GUARD` appears nowhere in `scripts/`). Negative controls I ran in a throwaway test file (deleted afterwards): an unmarked `click` and `timer` error failed the test with `Vanguard left 2 error(s) ... 1. click neg: eval:2: NEG click (x1) stack: ... Core/Events.lua:155: in field 'Try' ...` and the hint `name it with expectErrors("click neg: ...")`; `expectErrors(/boom/)` threw the D-01 TypeError; a marker nothing matched failed with `expected but never seen`; a marker for one error plus a second unmarked error failed on the second. `createAddon` is the only factory (`track()` pushes every addon and installs the `ns.ClearErrors` harvest); `Core/Slash.lua:358` calls `ns.ClearErrors()` through the table, so `/vg errors clear` is harvested too. |
| 2 | Errors in `hooksecurefunc` callbacks, `OnClick` handlers and `C_Timer` callbacks reach the error list | VERIFIED | `ns.Guard` (`Core/Events.lua:162`) wraps through `ns.Try`. Grep of `Core/` and `Modules/` (multi-line aware via the quality rule): 44 `hooksecurefunc` calls with `ns.Guard(` in the callback (the other matches are `type(hooksecurefunc)` checks), 57 of 57 `SetScript("OnClick", ...)` guarded (two more are `GetScript("OnClick")(...)` invocations), every `C_Timer.After`/`NewTicker` guarded except `Core/Combat.lua:118` (`ns.Soon`, whose `runSoon` runs under `ns.Try`). `HookScript("OnClick")` and `.OnClick =` do not occur. `npm run quality` passes with rule 4 (`scripts/lib/code-quality.mjs` `bareCallbackProblems`), which has nine unit tests including "another bare timer in Core/Combat.lua still fails" and "the Soon timer elsewhere fails". Behavioral proof: `errorrail.test.mjs` (7/7 passed in my run) throws from a guarded hook, click and timer and asserts the entry text `hook ...`, `click ...`, `timer ...` lands in `ns.errors` and fails the guard until named. |
| 3 | A weekly CI job runs the full suite shuffled and prints its seed; flaky cases are fixed, not retried. First green hosted run waits for the hosted runner (D-05, accepted) | VERIFIED for everything that does not need the hosted runner; hosted green run open by user decision | `full-suite.yml` cron `23 10 * * 0` passes `shuffle: ${{ github.event_name == 'schedule' }}`; `lua-suite.yml` step `Pick and print the shuffle seed` (`if: inputs.shuffle`) sets `VG_SHUFFLE_SEED=$(date +%s)` in `$GITHUB_ENV` and `tee`s the seed and replay command into the job summary; `coverage-lua.mjs` passes `process.env` to Vitest; `vitest.config.mjs` turns on a seeded file and test shuffle and Vitest prints `Running tests with seed`. `scripts/workflows.test.mjs` pins this. No retry option exists (config comment, no `retry` key). `link-wow.test.mjs` builds one TEST-ONLY folder per case (`mkdtemp` root, `afterAll` cleanup), so it is order independent; passed under seeds 3, 777 and 20261010 in my runs. The quick project passed under seeds 1, 4242 and 99991 (149/149 each). A shuffled slice of the Lua project (errorrail, core, report, skins; seed 555) passed. |
| 4 | The suite stays green with the guard on; exposed errors are fixed in the addon/fixtures, not excused with a marker | VERIFIED | Recorded final tree: `npm run verify` 69 files / 907 tests, quality OK; coverage 19058/19058 = 100.00% (logs plus 02-13-SUMMARY; not re-run per instructions). Fresh: `npm run test:quick` 10 files / 149 tests; `npm run quality` OK; errorrail+core+error-guard 57/57. Root causes the guard exposed (R1 Enum replaced by fixtures, R5 same, R2 one-form `hooksecurefunc` fixtures, R3 `Modules/ChatExtras.lua` calling missing client functions, R4 AFK bare-client fixture) were fixed at the cause: one addon change (`ChatExtras.lua`, two conditions), the rest fixtures. D-04 total was 5 root causes, far below the stop threshold of about 20. I read all 55 `expectErrors` call sites; each marker names an error the test plants itself (`ns.Report("TEST-ONLY ...")`, a throwing fixture, a planted bad saved table, `__wfgStub.noAuraContainer`, `GameMenuFrame.buttonTemplate = "NoSuchTemplate"`). Matchers are exact strings, or anchored patterns varying only in digit runs, enforced by `namesOneError`. |

**Score:** 4/4 truths verified (0 behavior-unverified).

### Decisions honoured

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 markers inside tests, exact error, no file exemption, no exempt list in setup.mjs | Honoured | setup.mjs read in full; `expectErrors` refuses broad matchers; two-way matching (unexpected and unused both fail). |
| D-02 global `afterEach`, `createAddon` registry, text and stack printed | Honoured | `lua-harness.mjs` `createdAddons`, `track`, `HARVEST`; message includes `stack:` frames (the test client now has a `debugstack`). |
| D-03 one shared helper at every hook, click, raw timer | Honoured | `ns.Guard` is the one helper; widget and control factories (`Core/Widgets.lua:37`, `Core/Controls.lua:54`) wrap every OnClick they install; the quality rule keeps it so. |
| D-04 fix in the addon; stop above about 20 | Honoured | 5 root causes, none near the threshold. |
| D-05 weekly shuffled job, seed printed, PR run not shuffled, hosted green run may stay open | Honoured | Static wiring verified; only `schedule` shuffles. |
| D-06 aura-container notice stays in `ns.errors`, declared by the tests, in-game badge check listed | Honoured | `AURA_FALLBACK` (`helpers.mjs:12`) is used by the tests that cause it; the check is on the in-game list. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `scripts/lib/error-guard.mjs` (`expectErrors`, `check`, `judge`, `caught`) | VERIFIED | Substantive, imported by setup.mjs and tests; 100 percent covered. |
| `scripts/tests/setup.mjs` | VERIFIED | Global afterEach, no exemptions. |
| `scripts/lib/lua-harness.mjs` registry and harvest | VERIFIED | Single factory tracked. |
| `Core/Events.lua` `ns.Guard` | VERIFIED | Wired at 44 hook, 57 click and 14 timer sites. |
| `scripts/lib/code-quality.mjs` rule 4 plus `scripts/code-quality.test.mjs` | VERIFIED | Enforced by `npm run quality` and CI. |
| `vitest.config.mjs` shuffle, `.github/workflows/lua-suite.yml` and `full-suite.yml`, `scripts/workflows.test.mjs` | VERIFIED | See truth 3. |
| `scripts/link-wow.test.mjs` | VERIFIED | Per-case folders. |
| `README.md` `/vg errors` sentence | VERIFIED | Mentions hooks, clicks and timers. |

### Key Links

| From | To | Status |
|------|----|--------|
| `createAddon` | `createdAddons` (globalThis symbol) | WIRED, shared with setup.mjs without importing the harness |
| `setup.mjs` afterEach | `check` / `takeExpected` | WIRED, runs in both projects |
| `ns.Guard` | `ns.Try`, `record`, `ns.errors` | WIRED (traced; verified by negative control output showing `Core/Events.lua:155` and `:165` frames) |
| `ns.ClearErrors` | harness `__wfgCleared` | WIRED (errorrail case "an entry ns.ClearErrors removed is still judged") |
| weekly cron | `VG_SHUFFLE_SEED` | WIRED to `vitest.config.mjs` through the environment |

### Behavioral Spot-Checks (run fresh)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Quick gate | `npm run test:quick` | 10 files / 149 tests passed | PASS |
| Code quality incl. rule 4 | `npm run quality` | OK line printed | PASS |
| Error rail and core under the guard | `vitest run --project lua errorrail core error-guard` | 57 passed | PASS |
| Guard fails an unmarked error with text and stack; rejects broad and unused markers | throwaway test file (removed) | 4 of 4 failed as intended | PASS |
| Quick project under several seeds | `VG_SHUFFLE_SEED=1, 4242, 99991` | 149/149 each, seed line printed | PASS |
| link-wow, error-guard, workflows, code-quality shuffled | seeds 3, 777, 20261010 | 65/65 each | PASS |
| Lua slice shuffled | seed 555, errorrail+core+report+skins | 64/64 | PASS |

The full suite and coverage were not re-run; the recorded final-tree numbers are 69 files / 907 tests and 19058/19058 lines.

### Probe Execution

No probes declared; Step 7c not applicable.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| CI-03 | 02-01, 02-02, 02-13 | Tests are deterministic; a failure names what broke | SATISFIED (hosted shuffled run open by D-05) | Truth 3, plus the failure message with text and stack. |
| CI-04 | 02-01 to 02-13 | A test that leaves an error in the addon's error list fails | SATISFIED | Truths 1, 2, 4. |

No orphaned requirement IDs: REQUIREMENTS.md maps only CI-03 and CI-04 to Phase 2 and both appear in plan frontmatter. REQUIREMENTS.md still shows both as `Pending`; that checkbox and the traceability table are not updated here (orchestrator task).

### Anti-Patterns Found

Debt markers (`TBD`, `FIXME`, `XXX`) were not introduced in the addon files this phase changed (hook and timer wraps are one-line edits). No blockers.

### Findings that are not gaps (non-blocking notes)

1. **Validation map: task 2-05-02 points at T-02-09, which 02-05's register does not declare.** T-02-09 ("fixtures change only to match the client") is declared in `02-03-PLAN.md:144` and closed in `02-SECURITY.md:42`. 02-05-02 does the same kind of fixture work (extend `Enum`, both `hooksecurefunc` forms), so the reference is semantically right, but it is a cross-plan reference rather than one in 02-05's own register. Verdict: a documentation inconsistency, not a defect: the threat is phase-wide and closed once in SECURITY.md. Cleanest fix is to add T-02-09 to 02-05's register or note it as inherited.
2. **Judgement calls (user accepted).** (a) `Core/AuraEngine.lua:122` dispel-style: `Enum.CustomAuraButtonDispelTypeTextureStyle` indexed without a nil check; the test removes the enum and marks the two resulting entries. It is arguably a latent missing nil check in `E.RegisterDispel` that `ns.Try` absorbs by design; it is a named, exact, deliberately-caused entry, so the guard works as specified, but a nil check would let the markers go. (b) `no cooldown frames` markers in `core.test.mjs`: the fixture itself throws on Cooldown frames; PlayerAuras and ActionBars failing to enable on such a client is a separate question. (c) R4 was fixed by switching six modules off in one fixture rather than by marker. None of the 55 markers hides a defect I could find beyond (a) and (b) as described.
3. **Guard blind spots.** Errors pushed off the 20-entry list are never judged (IN-02 in review; core's cap case relies on it knowingly, and a test over the cap still fails on whatever remains). The rule does not see aliased timers (`TalentPlanner.lua:502,573` use `local after = C_Timer.After`, but their callbacks run under `ns.Try`) or `HookScript("OnClick")` (none exist; outside D-03). 102 other `SetScript` handlers and 54 `HookScript` calls are the recorded D-03 follow-up.
4. **Review state.** 02-REVIEW: 0 critical, 4 warnings, 5 info, all dispositions `open`. WR-03 (`finished()` resets `forwarding` on every return) and WR-04 (`ns.Guard(fn)` with a missing label returns nil) are production-code edge cases; I grepped every `ns.Guard(` call site in `Core/` and `Modules/` and found none with a missing label, so WR-04 has no live instance.
5. **02-11 read-in-full rule.** Executor read files only around hook sites, against CLAUDE.md. The changes are one-line wraps and the full recorded suite is green; noted only.
6. **No shuffled full Lua run exists.** Only the quick project (several seeds) and the slices above were shuffled. Accepted by D-05 ("no local shuffled runs required"), and research found every Lua case passed shuffled before the guard; the first hosted weekly run is the real test.

### Human / in-game checks (all user-accepted, non-blocking; nothing was observed in game)

1. First green HOSTED shuffled weekly run (D-05, billing block).
2. Auction Post (item and commodity), Buy and Cancel after wrapping; real-client hardware-event status inside `xpcall`.
3. Secure Reload overlay, game menu button, error-badge click.
4. Raid tools (ready check, role poll, Pull, target icons, world markers in combat).
5. `/vg perf` cost of the wrapped hot hooks (bag slot, AddMessage, data bars, movers, auction browsing).
6. `debugstack` exists on Forever and `/vg errors` shows a stack.
7. D-06: does the error badge show at login because of the aura-container fallback notice?
8. Quest dialog and tracker, errands, restock, junk selling, bag sort, click-cast options, talent planner, minimap drawer, chat copy and toasts.

### Gaps Summary

None. All four roadmap criteria hold in the code. The one part of criterion 3 that cannot yet be observed (a green run on the hosted runner) is explicitly left open by the user in D-05 and the reworded roadmap criterion, and is not counted as a gap.

---

_Verified: 2026-10-10_
_Verifier: Claude (gsd-verifier)_
