# Phase 2: Errors fail tests - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A test cannot pass while the addon swallows an error, and a red run says exactly what broke. This phase adds a global guard that fails any test leaving an entry in `ns.errors`, makes errors from hooks, click handlers and timers reach that list, and fixes the errors the guard exposes in the addon. It does not add new harness modes, new features, or CI speed work (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### The guard and its allow-list (CI-04)
- **D-01:** Tests that deliberately cause an error (tests of the error handling itself) opt out with a marker inside the test that names the exact error it expects. The test passes only if exactly that error appears; any other error left in `ns.errors` still fails it. There are no file-level exemptions and no list of exempt files in `setup.mjs`.
- **D-02:** The guard is a global `afterEach` in `scripts/tests/setup.mjs`. The harness must know every addon a test created: `createAddon` (`scripts/lib/lua-harness.mjs:429`) is the single factory, reached through `loggedIn` (about 890 call sites) and 23 direct calls. A failure prints the error text and where it came from (the stack the addon keeps).

### Handlers that bypass ns.Try (CI-04)
- **D-03:** Production code is changed. One shared helper in `Core/` is used at every `hooksecurefunc` site (about 81), every `OnClick` handler (about 57) and every raw `C_Timer` call (about 21), converted mechanically. A throwing handler then lands in `ns.errors`, so players see it in `/vg errors` as well as tests failing. — **Reversibility:** costly — it touches roughly 160 call sites across `Core/` and `Modules/`; undoing it means reverting each conversion.
- Existing repo rules apply to the helper: a comment on the line above every function, at most 10 lines of code per function, every new line executed by a test, the 100% coverage floor holds.

### When the guard exposes errors (CI-04, success criterion 4)
- **D-04:** Fix the errors in the addon (money paths first: auction, vendor and bags), not in the allow-list. If more than about 20 distinct errors appear, or any single fix needs a large change, stop and show the user the list before continuing.

### Repeated and shuffled runs (CI-03)
- **D-05:** A weekly CI job runs the full suite in a shuffled order and prints its seed so a failure can be replayed. The PR full-suite run is not shuffled. No local shuffled runs are required to close the phase. The user knowingly accepts that the shuffle part of roadmap criterion 3 stays open until the hosted runner works (it is currently blocked by billing); the roadmap wording was updated to say so. Any flaky case met while running the suite is fixed at its cause, not retried.

### Decided after research (2026-10-10)
- **D-06 (user):** The deliberate aura-container fallback notice (`Core/AuraEngine.lua:57`, carried by 12 tests) stays in `ns.errors` for now. The 12 tests declare it with the expected-error marker, and "does Forever show the error badge at login?" goes on the author's in-game check list. A separate notice channel is a later change.
- **Real site counts (research, replaces the approximate figures in D-03):** 54 `hooksecurefunc` calls (the earlier 81 counted grep lines, 36 of them `type(hooksecurefunc)` guards), 57 `OnClick` handlers, and 12 unguarded timer calls (3 more are already inside `ns.Try`). Research expects the guard to turn 60 tests in 15 files red: about 43 are deliberate error tests that need a marker, about 17 come from six root causes (none on a money path), under D-04's stop threshold.
- **Order-dependent test (CI-03):** `scripts/link-wow.test.mjs` fails 6 of 12 cases when shuffled, because its cases share a folder and rely on running in order. Make the cases independent. Every Lua-harness case passed shuffled.
- **Defaults taken from the research recommendations (not asked; redirect if wrong):** do exactly D-03 (the other 102 `SetScript` handlers and 54 `HookScript` calls are a recorded follow-up); reuse the existing Sunday full run for the shuffled job rather than adding a second weekly workflow; add a default `debugstack` to the test stub as a separate task after the guard is green; add a code-quality rule that rejects a bare `hooksecurefunc`, `OnClick` or `C_Timer` call; no metatable tap on `ns.errors`.

### Claude's Discretion
- How the expected-error marker looks (name, arguments, matching by text or pattern), as long as D-01 holds.
- How the harness records the addons a test created.
- Name and shape of the shared helper in `Core/` (D-03).
- If an error the guard exposes comes from a gap in the test stub, not the addon, fix the stub and cite the 12.1 Blizzard source in the commit body (the policy set in Phase 1), and do not weaken a harness rule and a test in one commit.

### Folded Todos
None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` — Phase 2 goal and success criteria (criterion 3 reworded for D-05)
- `.planning/REQUIREMENTS.md` — CI-03 (deterministic tests) and CI-04 (a test that leaves an error fails)
- `.planning/PROJECT.md` — constraints: code rules, 100% coverage floor, verification rules

### Research
- `.planning/research/PITFALLS.md` — Pitfall 2 (swallowed errors: 81 `hooksecurefunc`, about 57 `OnClick`, 21 raw `C_Timer`) and the global `afterEach` fix
- `.planning/research/ARCHITECTURE.md` — event rail: `ns.On`, `ns.OnUnit`, `ns.Try`, `ns.Soon`; the nine `OnUpdate` drivers are Phase 4's, not this phase's
- `.planning/phases/01-green-baseline/01-CONTEXT.md` — Phase 1 decisions, including the fixture-over-rule policy and Blizzard source citations
- `.planning/phases/01-green-baseline/01-VERIFICATION.md` — W4: only `smoke.test.mjs` asserts zero errors, so this phase may turn tests red

### Codebase
- `Core/Events.lua` — `ns.errors`, `ns.Try`, `ns.Report`, `ns.ClearErrors`, error recording and de-duplication (about lines 25 to 160)
- `Core/Combat.lua` — `ns.Soon` (line 114)
- `scripts/tests/setup.mjs` — where the global guard goes
- `scripts/tests/helpers.mjs` — `loggedIn` (line 31) and the many test helpers
- `scripts/lib/lua-harness.mjs` — `createAddon` (line 429)
- `scripts/tests/smoke.test.mjs` (line 18) — the one existing zero-errors assertion
- `.planning/codebase/TESTING.md` and `scripts/tests/README.md` — how area tests run the real Lua
- `CLAUDE.md` — function comment and 10-line rules, coverage floor, `ns.OutOfCombat` and secret-value rules

### External
- No external specs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ns.Try`, `ns.Report` and the `ns.errors` list already exist in `Core/Events.lua`, with de-duplication by error text and a 20-entry cap. The helper in D-03 should route into them, not build a second list.
- `createAddon` is one factory, so a registry of created addons for the guard is feasible without touching every test.

### Established Patterns
- Test files use `helpers.loggedIn()`; new helpers should follow that style.
- Money-path modules are the auction files (`Modules/Auction*`), vendor and inventory modules.

### Integration Points
- The helper from D-03 is used by `Core/` and `Modules/` alike; new Core files must be listed in `Vanguard.toc` before first use.
- `ns.errors` is capped at 20 entries and de-duplicated; the guard must read it before an error is dropped from the end of the list.

</code_context>

<specifics>
## Specific Ideas

- Counts of unwrapped sites are from research and approximate; re-count with grep before planning.

</specifics>

<deferred>
## Deferred Ideas

- Combat-lockdown mode and a per-module secret-value sweep for the harness: not in CI-03 or CI-04. Add them as a requirement before Phase 12's in-combat check.
- The nine hand-rolled `OnUpdate` accumulators and the `RegisterUnitEvent` leaks: Phase 4.
- Hosted-runner confirmation of the shuffled run: waits for the billing block to clear (Phase 3 measures CI).

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 2-Errors fail tests*
*Context gathered: 2026-10-09*
