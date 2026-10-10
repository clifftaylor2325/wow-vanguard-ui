# Phase 3: Fast suite and CI gate - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the full test suite fast enough to run on every pull request that is ready for review, and make it run there automatically. This phase adds the ready-for-review trigger for the full suite, cuts the suite's cost (the research found it is mostly the addon login repeated in about 900 tests), records the measured time, and does a small amount of CI housekeeping. It does not drop or skip a case, change the 100% coverage floor, or add new features.

</domain>

<decisions>
## Implementation Decisions

### Proving "under 5 minutes" (CI-06)
- **D-01:** The hosted runner is blocked by billing, so the 5-minute target is proven locally with a 2-worker proxy for a 2-vCPU runner (Vitest capped to 2 workers). Per-file times and the total are recorded in the phase verification and summaries. The hosted measurement stays open until the billing block clears, the same as the shuffled run in Phase 2 (D-05 there). The user knowingly accepts that the "on the hosted runner" part of roadmap criterion 2 stays open; the roadmap wording was updated to say so. (The pull request is deferred, so the record lives in the phase summaries and verification, not a PR.)

### How the suite gets cheaper (CI-06)
- **D-02:** Harness-only first, in this order: a Lua sampling profiler (`npm run profile -- <area>`), scoped logins (`loggedIn({ only })` using the existing `modules[name] = false` seam), shared logins for read-only cases, then splitting the two biggest test files (`more.test.mjs`, `auction.test.mjs`). Changing the addon modules' startup cost (ActionBars first) happens only if the suite is still above target afterwards, one module at a time, and each such change returns to the user for approval before it is made. No Vitest sharding. — **Reversibility:** reversible — test-harness changes only; module changes are gated by the approval above.
- **D-03:** No test-engine swap before launch. The WASM Lua 5.4 spike is not allowed in this phase; keep the current engine (fengari). If the target is out of reach by D-02's levers, return to the user with the measurements instead of switching engine.

### Full-suite triggers (CI-05)
- **D-04:** The quick check keeps running on every push (it already does). The full suite starts when a pull request is marked ready for review (add `ready_for_review` to `full-suite.yml`'s pull request types; drafts do not run it). Later pushes re-run it only while the `full-tests` label is on, so the label is the "run it every push" switch. The weekly (shuffled) run and the pre-release run stay as they are.

### CI housekeeping included in this phase
- **D-05:** Move CI to Node 24 and add an `.nvmrc` (local development is already Node 24.14). Install luacheck 1.2.0 from the official release binary, checked against a SHA-256, instead of apt's 1.1.2 (this also drops an apt step from the one-minute quick gate). Pin `fengari` to exactly 0.1.5 (no caret), keeping the lock file consistent. No other dependency changes.

### Decided after research (2026-10-10)
- **D-06 (user):** The research measured the baseline suite on the 2-worker proxy at 241 s and 240 s (two runs; 250 s under coverage), already under the 300 s target. The earlier 2,622 CPU-second figure was inflated by 16-way contention. Because the hosted runner's real speed is unknown, Phase 3 still does speed work, scoped to: scoped logins (turn off the six heavy modules for tests that do not need them; research probe: 796 of 907 tests still pass and their time falls 49%), the Lua profiler (`npm run profile -- <area>`), and a timing recorder (`npm run timing`). The internal budget is 150 s or less on the 2-worker proxy. Shared logins and splitting `more.test.mjs`/`auction.test.mjs` are dropped from D-02: research found shared logins save about 2 s and splits give no gain on 2 workers. The test-stub lookup change (about 14% faster logins) is not part of this phase.
- **Defaults taken from the research (not asked; redirect if wrong):** add `opened` to `full-suite.yml`'s pull request types, since a PR opened already ready fires `opened`, not `ready_for_review` (drafts still do not run it); guard the concurrency group so an unrelated label cannot cancel a good run; keep `lua5.1` in the quick gate's apt install (it is needed for `luac5.1 -p`) and drop only the `lua-check` package (this corrects D-05's wording); pin `fengari` by hand-editing `package.json` and the lock file line (on this Windows machine `npm install --package-lock-only` deletes `libc` fields); use `node-version-file: .nvmrc` in the four workflow places and add `.nvmrc` to `.pkgmeta`'s `ignore`. The luacheck SHA-256 in the research came from one download and is unverified: the plan must check it a second way (a second download or the release signature) before pinning it.

### Invariants (roadmap criterion 3)
- Corrected wording after research: all 907 baseline cases present and green, and the 100% Lua line coverage floor unchanged. New quick-project tests (for example for `npm run timing`) may raise the total above 907.
- The test count and the 100% Lua line coverage floor must match the start of the phase: no case dropped, skipped or merged away. Start values at Phase 2's end: 69 files, 907 tests, coverage 19058/19058 = 100.00%.

### Claude's Discretion
- Profiler design, which tests share a login, how to split the two big files, and how to cap Vitest to 2 workers for the proxy.
- Exact wording of the workflow changes, as long as D-04 and the repo's workflow tests (`scripts/workflows.test.mjs`) hold.
- Phase 2's error guard must keep working: see the constraint below.

### Folded Todos
None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria (criterion 2 reworded for D-01) and notes
- `.planning/REQUIREMENTS.md` — CI-05 (full suite on ready-for-review and label) and CI-06 (under 5 minutes, measured)
- `.planning/PROJECT.md` — constraints: free-tier CI minutes, 100% coverage floor, code rules

### Research
- `.planning/research/STACK.md` — cost diagnosis (about 2,622 CPU-seconds, login cost), budget math, what not to use (sharding, `wasmoon-lua5.1`), Node 24 / luacheck / fengari pins
- `.planning/research/ARCHITECTURE.md` — test-rail levers in payoff order, scoped login, shared `beforeAll` logins
- `.planning/research/PITFALLS.md` — pitfalls 6 and 7 (suite time, minutes exhausted)
- `.planning/phases/02-errors-fail-tests/02-CONTEXT.md` — D-05 there (weekly shuffled job, hosted run open)
- `.planning/phases/02-errors-fail-tests/02-REVIEW.md` finding IN-01 and `02-VERIFICATION.md` — the guard drains the addon registry after each test

### Codebase
- `.github/workflows/verify.yml`, `full-suite.yml`, `lua-suite.yml`, `release.yml` — current triggers and jobs
- `vitest.config.mjs` — projects, timeouts, shuffle block
- `scripts/lib/lua-harness.mjs` — `createAddon`, the registry and harvest
- `scripts/tests/helpers.mjs` — `loggedIn()` (about 890 call sites) and shared fixtures
- `scripts/tests/setup.mjs` — the global error guard (must keep judging every test)
- `scripts/workflows.test.mjs` — pins the workflow wiring
- `package.json` and the lock file — fengari and Vitest versions
- `.planning/codebase/TESTING.md` and `scripts/tests/README.md`
- `CLAUDE.md` — hard rules (function comments and 10-line limit, coverage floor, workflow and `.pkgmeta` rules)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verify.yml` already runs the quick check on every pull request push; `full-suite.yml` already runs the full suite on the `full-tests` label and weekly; `lua-suite.yml` already takes `preview` and `shuffle` inputs.
- `loggedIn()` creates the addon; the `modules[name] = false` setting is the existing seam for a scoped login.
- Research measured the login at roughly 0.6 to 1.2 s warm, with `more.test.mjs` (about 2,700 lines, around 196 logins) as the wall-clock floor because Vitest parallelises per file.

### Established Patterns
- New npm scripts and JS files live under `scripts/`; a new top-level file players do not need must be listed in `.pkgmeta`'s `ignore` or `scripts/pkgmeta.test.mjs` fails (an `.nvmrc` counts).
- Workflow wiring is pinned by `scripts/workflows.test.mjs`; change both together.

### Integration Points
- **Constraint from Phase 2:** the global `afterEach` in `scripts/tests/setup.mjs` drains and judges the registry of addons created during a test, then clears it. An addon created once in a `beforeAll` and shared across tests would be judged only after the first test (review finding IN-01). A shared-login helper must make every test judged for the errors it caused, for example by judging and clearing `ns.errors` after each test, and must not add an exemption.

</code_context>

<specifics>
## Specific Ideas

- Start values to keep: 69 test files, 907 tests, Lua line coverage 19058/19058.
- Known heavy files from research: `more.test.mjs` (about 400 s of CPU), `auction.test.mjs` (about 177 s).
- Phase 2 saw 30 s timeouts in `check-zip.test.mjs` and `media.test.mjs` when two full suites ran at once on one machine; record load when taking timings.

</specifics>

<deferred>
## Deferred Ideas

- Addon module startup cuts (ActionBars and the other five heavy modules): only if D-02's harness-only levers fall short, with the user's approval per module.
- Test-engine swap (WASM Lua 5.4): not before launch (D-03).
- Making the full suite a required status check in the branch ruleset: a repository setting outside the code; decide when billing is cleared.
- Code review warnings WR-01 to WR-04 from Phase 2: still open, not part of this phase.

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 3-Fast suite and CI gate*
*Context gathered: 2026-10-10*
