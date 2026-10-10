# Phase 3: Fast suite and CI gate - Research

**Researched:** 2026-10-10
**Domain:** Vitest + fengari (Lua 5.3 VM running the Lua 5.1 addon) test-suite cost, GitHub Actions workflow wiring, CI toolchain pins
**Confidence:** HIGH for every measured number and every in-repo fact (measured or read this session); MEDIUM for hosted-runner projections (no hosted run is possible: billing block)

<user_constraints>
## User Constraints (from 03-CONTEXT.md)

### Locked Decisions
- **D-01:** The hosted runner is blocked by billing, so the 5-minute target is proven locally with a 2-worker proxy for a 2-vCPU runner (Vitest capped to 2 workers). Per-file times and the total are recorded in the phase verification and summaries. The hosted measurement stays open until the billing block clears, the same as the shuffled run in Phase 2 (D-05 there). The user knowingly accepts that the "on the hosted runner" part of roadmap criterion 2 stays open; the roadmap wording was updated to say so. (The pull request is deferred, so the record lives in the phase summaries and verification, not a PR.)
- **D-02:** Harness-only first, in this order: a Lua sampling profiler (`npm run profile -- <area>`), scoped logins (`loggedIn({ only })` using the existing `modules[name] = false` seam), shared logins for read-only cases, then splitting the two biggest test files (`more.test.mjs`, `auction.test.mjs`). Changing the addon modules' startup cost (ActionBars first) happens only if the suite is still above target afterwards, one module at a time, and each such change returns to the user for approval before it is made. No Vitest sharding. Reversibility: reversible - test-harness changes only; module changes are gated by the approval above.
- **D-03:** No test-engine swap before launch. The WASM Lua 5.4 spike is not allowed in this phase; keep the current engine (fengari). If the target is out of reach by D-02's levers, return to the user with the measurements instead of switching engine.
- **D-04:** The quick check keeps running on every push (it already does). The full suite starts when a pull request is marked ready for review (add `ready_for_review` to `full-suite.yml`'s pull request types; drafts do not run it). Later pushes re-run it only while the `full-tests` label is on, so the label is the "run it every push" switch. The weekly (shuffled) run and the pre-release run stay as they are.
- **D-05:** Move CI to Node 24 and add an `.nvmrc` (local development is already Node 24.14). Install luacheck 1.2.0 from the official release binary, checked against a SHA-256, instead of apt's 1.1.2 (this also drops an apt step from the one-minute quick gate). Pin `fengari` to exactly 0.1.5 (no caret), keeping the lock file consistent. No other dependency changes.
- **Invariants (roadmap criterion 3):** The test count and the 100% Lua line coverage floor must match the start of the phase: no case dropped, skipped or merged away. Start values at Phase 2's end: 69 files, 907 tests, coverage 19058/19058 = 100.00%.

### Claude's Discretion
- Profiler design, which tests share a login, how to split the two big files, and how to cap Vitest to 2 workers for the proxy.
- Exact wording of the workflow changes, as long as D-04 and the repo's workflow tests (`scripts/workflows.test.mjs`) hold.
- Phase 2's error guard must keep working: the global `afterEach` in `scripts/tests/setup.mjs` drains and judges the registry of addons created during a test, then clears it. An addon created once in a `beforeAll` and shared across tests would be judged only after the first test (review finding IN-01). A shared-login helper must make every test judged for the errors it caused, for example by judging and clearing `ns.errors` after each test, and must not add an exemption.

### Deferred Ideas (OUT OF SCOPE)
- Addon module startup cuts (ActionBars and the other five heavy modules): only if D-02's harness-only levers fall short, with the user's approval per module.
- Test-engine swap (WASM Lua 5.4): not before launch (D-03).
- Making the full suite a required status check in the branch ruleset (a repository setting; decide when billing is cleared).
- Code review warnings WR-01 to WR-04 from Phase 2: still open, not part of this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-05 | The full suite runs on ready-for-review and on the `full-tests` label; the quick check runs on every push | "CI workflow changes" below: exact `full-suite.yml` edits (types, `if`, concurrency), the `workflows.test.mjs` assertions that pin them |
| CI-06 | The full suite finishes in under 5 minutes (wall) on the hosted runner, measured and recorded; hosted part waits for billing (D-01), proven on a 2-worker local proxy | "Measurements" and "Lever estimates": baseline 241 s / 240 s (plain), 250 s (with coverage) on 2 workers; harness-only levers estimated at 125-140 s; recording script and validation commands below |
</phase_requirements>

## Summary

**The 2-worker proxy already passes at baseline.** With nothing else running, the whole suite on 2 workers takes 241 s (plain `vitest run --maxWorkers=2`, run 1), 240 s (run 2, with timing instrumentation), and 250 s for the CI-shaped command `VITEST_MAX_WORKERS=2 npm run coverage` (907/907 passed, coverage 19058/19058 = 100.00%). The target is 300 s, so the margin is 59 s (20%) on this machine (Intel i7-13620H, 10 cores / 16 threads, Node 24.14.0). The earlier "2,622 CPU-seconds" in the roadmap notes came from a 16-thread run where workers fight each other; the same suite needs only 464 worker-seconds when 2 workers run it (the 16-worker run summed to 1,624 worker-seconds and took 144 s wall, equal to `more.test.mjs`'s own time under contention). A hosted 2-vCPU runner is slower per core than this laptop; by how much cannot be measured here, so the levers still matter for hosted margin.

**Where the time goes (2 workers, instrumented run, 907 tests):** 1,121 `login()` calls across 1,132 `createAddon` calls. Of 464.5 worker-seconds: `createAddon` 66.4 s (14%), `login` 306.3 s (66%), the rest 91.9 s (20%: 70 s test bodies, 21.9 s for the 149 tests that build no addon, mostly `media.test.mjs` 13.1 s and `check-zip.test.mjs` 8.2 s). A warm login is about 25 ms (create) + 195 ms (login), and 190 of those ms are the `PLAYER_LOGIN` module `Enable` calls. Six modules are 79% of that: ActionBars 67.1 ms, FrameAuras 27.1, PlayerAuras 19.5, InstancePrep 12.6, UnitFrames 11.9, RaidTools 11.7 (of 189.5 ms total across 52 modules).

**What works, in order of payoff (all harness-only):**
1. **Scoped logins** (D-02 lever 2): a probe that turned those six modules off for every login left 796 of 907 tests green; those 796 dropped from 400.6 s to 203.4 s (-49%). Only 111 tests need one of the six modules (union of 53 that need ActionBars and 68 that need one of the other five, 10 need both). Estimated suite: about 267 worker-seconds, about 135-140 s on 2 workers (-42%).
2. **A faster widget method lookup in `wow-stub.lua`** (not named in D-02, but harness-only): 61% of the instructions in a login run inside `wow-stub.lua`, mostly the `widgetMeta.__index` function. A prototype that resolves methods through per-kind metatable tables cut a full warm login from 227 to 195 ms (-14%) and a scoped login from 73 to 66 ms (-9%); the whole Lua project (758 tests) still passed on the prototype. Worth about -20 worker-seconds after lever 1.
3. **Shared logins** (D-02 lever 3) are nearly worthless here: at most 52 single-login tests are read-only (by grep), in 44 distinct (file, login arguments) groups, so sharing saves at most about 8 logins (about 2 s). Recommend recording that and skipping it (the IN-01 design is given below anyway, as asked).
4. **Splitting `more.test.mjs` and `auction.test.mjs`** does nothing for 2 workers (241 s measured vs the 232 s ideal of 464.5/2; the biggest file is 73 s). It only helps a 16-worker dev run, whose 144 s floor is `more.test.mjs` itself.

Harness-only levers plausibly reach about 125-140 s on 2 workers, well under 300 s, with no addon change and without D-03's engine swap. Addon module startup cuts are not needed for the proxy target.

**Primary recommendation:** Build the profiler and a timing recorder first (D-02 order), then convert tests to scoped logins in batches (default stays the full login; opt tests out of the six heavy modules where the probe shows they pass), apply the `wow-stub.lua` lookup change, skip shared logins and file splitting with the measurements recorded, then do the CI changes (D-04, D-05) with `workflows.test.mjs` assertions. Re-run the 2-worker timing and `npm run coverage` after each batch.

## Project Constraints (from CLAUDE.md)

- Every function has a comment on the line directly above it and a body of at most 10 lines of code (nested functions count toward the parent); checked by `scripts/lib/code-quality.mjs` (`npm run quality`). All new JS in `scripts/` (profiler, timing recorder, helper changes) must obey this.
- Colours and font sizes only in `Core/Theme.lua`. WoW globals the addon reads go in `.luacheckrc` `read_globals`. Widget methods go into `scripts/lib/wow-widget-api.lua` only after confirming them in the 12.1 client.
- `Libs/` untouched, `Media/` generated, Lua 5.1 only for addon files.
- A new top-level file or folder players do not need must be added to `.pkgmeta`'s `ignore` list, or `scripts/pkgmeta.test.mjs` fails (`.nvmrc` counts; a `profile/` output folder stays untracked and gitignored).
- Before "done": `npm run verify` and `npm run coverage` both pass. Every new line of addon Lua needs a test (this phase adds no addon Lua).
- Branch `work/p3-...` style, one task per commit `<task id> <area>: <change>`, tick the work-plan checkbox in the same commit; no commits to `main`; don't add doc files unless asked; "needs in-game check" list is only for game behaviour (none here).
- You cannot run the game; never claim in-game behaviour.
- Known pre-existing failures on main (user memory, 2026-10-07: raid tiles, plate glow, chat watch price) did NOT reproduce: the full suite was 907/907 green at the start of this research. [VERIFIED: vitest JSON, numFailedTests 0]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Login scoping (`loggedIn({ only })`) | Test harness helper (`scripts/tests/helpers.mjs`) | SavedVariables Lua (`modules[name] = false`) | The addon already reads `ns.ModuleEnabled(name)` at `PLAYER_LOGIN`; the helper only writes the setting |
| Error judging for every test | Vitest global `afterEach` (`scripts/tests/setup.mjs`) | `scripts/lib/error-guard.mjs`, harness registry | Must keep judging every test, shared login or not |
| Method lookup speed | Stub (`scripts/lib/wow-stub.lua`) | harness only | Pure test-engine code; no addon change |
| Sampling profiler | Harness (`lua-harness.mjs` hook) + CLI (`scripts/profile-lua.mjs`) | `.gitignore` for output | Hook already exists (count hook); CLI aggregates |
| Full-suite trigger and drafts | GitHub Actions (`full-suite.yml`) | `workflows.test.mjs` | `lua-suite.yml` is `workflow_call` only |
| Toolchain pins (Node, luacheck, fengari) | `.nvmrc`, `package.json` + lock, workflow steps | `workflows.test.mjs`, `.pkgmeta` | Pins only matter if a test fails when they drift |

## Measurements

All measured this session on one machine with no other heavy job running. Machine: 13th Gen Intel Core i7-13620H, 10 cores / 16 logical processors, Windows 11, Node v24.14.0, Vitest 5.0.3, fengari 0.1.5. Scratch scripts lived outside the repo; no tracked file changed (`git status` shows only the untracked `.planning/state.json`, which pre-dated this work). `npm run coverage` regenerated the gitignored `coverage/lua-coverage.json` and `coverage/lua-hits/`.

### How to cap Vitest to 2 workers (verified)

Two ways, both work with Vitest 5.0.3:

- CLI: `npx vitest run --maxWorkers=2` (Vitest's `--maxWorkers` option). Verified: from the JSON reporter's per-file start and end times, the maximum number of files running at once was **2** (and **16** uncapped).
- Environment: `VITEST_MAX_WORKERS=2`. `vitest.config.mjs` already reads it: `maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || os.availableParallelism(),`. This is the form that reaches `npm run coverage` (the script spawns Vitest and passes `process.env` through), so use it for the CI-shaped measurement: `VITEST_MAX_WORKERS=2 npm run coverage` ran 250 s, 69 files, 907 tests, `total 19058/19058 100.00%`.

### Wall times

| Run | Wall | Notes |
|-----|------|-------|
| 2 workers, plain (`--maxWorkers=2`, JSON reporter) | **241.4 s** (span of file times), shell `real 4m3s` incl. startup | 69 files, 907 passed; sum of file times 471.1 s |
| 2 workers, plain, with timing instrumentation | **240 s** (JSON span 238.4 s) | second sample; instrumentation cost is not visible |
| 2 workers, `VITEST_MAX_WORKERS=2 npm run coverage` | **250 s** | Vitest "Duration 249.05s"; coverage costs about +4% |
| Uncapped (16 workers) | **144.2 s** (`real 2m26s`) | sum of file times 1,624 s: each file runs 2-3.4x slower than on 2 workers (SMT and memory contention) |

CPU-seconds: no per-child CPU counter is available from Node on Windows, so worker-seconds stand in for it. With 2 busy single-threaded workers, 464.5 s of summed test durations is the CPU total (about 2x the wall). The 16-worker figure (1,624 s) is inflated by contention and is not a CPU cost. Variation between two 2-worker runs was 1-4 s.

### Top 12 files by time (2-worker run; logins from the instrumented run)

| File | Tests | Logins | 2-worker s | 16-worker s |
|------|-------|--------|-----------|-------------|
| more.test.mjs | 108 | 208 | 73.3 | 144.1 |
| auction.test.mjs | 74 | 80 | 36.4 | 109.5 |
| core.test.mjs | 50 | 78 | 25.2 | 69.3 |
| plates.test.mjs | 13 | 17 | 16.9 | 60.7 |
| options.test.mjs | 21 | 24 | 14.8 | 56.7 |
| setup.test.mjs | 21 | 37 | 14.6 | 57.1 |
| windows-tabs.test.mjs | 21 | 33 | 14.4 | 55.0 |
| units.test.mjs | 22 | 46 | 14.1 | 58.0 |
| media.test.mjs (no addon) | 67 | 0 | 13.2 | 26.4 |
| windows-social.test.mjs | 20 | 36 | 13.1 | 53.5 |
| windows-system.test.mjs | 19 | 43 | 12.8 | 51.5 |
| bars.test.mjs | 35 | 40 | 11.7 | 46.7 |

The other 57 files sum to 210.5 s. 60 of 69 files log in at least once. Largest per-login cost: `plates.test.mjs` at about 810 ms per login (create + login), against 266-410 ms elsewhere.

### Where the time goes inside a login

Instrumented run (2 workers, `createAddon` timed from `luaL_newstate` to registration, `login()` timed separately):

| Part | Worker-seconds | Share of 464.5 s |
|------|---------------|------------------|
| `createAddon` (1,132 calls) | 66.4 | 14% |
| `login()` (1,121 calls) | 306.3 | 66% |
| Test bodies of the Lua tests | about 70 | 15% |
| 149 tests that build no addon | 21.9 | 5% (media 13.1, check-zip 8.2) |

Isolated, one process, warm (median of 20): `createAddon` 21-30 ms (of which 19 ms is loading the compiled chunks), `login` 195-230 ms. Split of a login: `ADDON_LOADED` 0.3 ms, `PLAYER_LOGIN` 192 ms (all the module `Enable` calls), `PLAYER_ENTERING_WORLD` 8.5 ms. The first `createAddon` in each fresh worker costs 410-450 ms (179 ms of it parsing the Lua source once; the rest is V8 warm-up) and the first login 295-350 ms; 53 Lua files pay that once each, about 25-30 worker-seconds in total. A disk chunk cache would recover at most the parse part (about 9.5 worker-seconds, about 5 s wall); not worth a lever.

The existing instruction counter (`countHook` in `lua-harness.mjs`) counts but does not expose anything; the profiler prototype below reads it. A login runs about 1.55 million Lua instructions (4.65M for 3 logins).

### Module `Enable` cost (top six named; warm, mean of 10 logins, `os.clock` around each `def.Enable`)

| Module | Enable ms | Share of 189.5 ms |
|--------|-----------|-------------------|
| ActionBars | 67.1 | 35% |
| FrameAuras | 27.1 | 14% |
| PlayerAuras | 19.5 | 10% |
| InstancePrep | 12.6 | 7% |
| UnitFrames | 11.9 | 6% |
| RaidTools | 11.7 | 6% |
| (next: QuestLog 9.5, QuestDialog 3.7, CastBars 3.2, InfoStrip 2.6, Chat 2.3, AfkScreen 2.2) | | |

The six sum to about 150 ms (79%). The sampling prototype agrees: ActionBars is 37.4% of login instructions inclusive, `Core/AuraEngine.lua` 19.2% (FrameAuras 10.8, PlayerAuras 9.4), RaidTools 6.6, InstancePrep 6.6, UnitFrames 5.4.

### Sampling profile of a login (prototype, 3 warm logins, 4,650 samples of 1,000 instructions)

Self time by file: `wow-stub.lua` 60.8%, `Core/Theme.lua` 17.3%, `wow-layout.lua` 5.2%, `Modules/ActionBars.lua` 3.1%, `Core/DB.lua` 2.9%, `wow-world.lua` 2.3%. Top self lines: `wow-stub.lua:120` 13.2%, `:151` 6.2%, `:157` 4.5%, `:121` 4.3% (all inside `cacheFor` and the `widgetMeta.__index` function). Inclusive: `Core/Combat.lua OutOfCombat` 70% (module builds run inside it), `Core/Theme.lua` 66.6% (`Theme.lua:537 makeParts` 21%, `:595 Button` 18%), `ActionBars.lua:445 createButton` 30%. So the harness itself, not the addon's logic, is most of the login: every `frame:SetX()` call goes through a Lua function (`__index`) that looks up `rawget`, `store[w.__kind]` and a cache table before returning the method.

## Lever estimates

Method: worker-seconds from the measurements above; wall = worker-seconds / 2 plus about 3% imbalance (the measured baseline is 241 s against a 232 s ideal).

| Step | Worker-s | 2-worker wall (est.) | Basis |
|------|---------|----------------------|-------|
| Baseline | 464.5 | **241 s** (measured; 250 s with coverage) | measured |
| A. Scoped logins: six heavy modules off in the 796 tests that tolerate it | about 267 | **about 135-140 s** | measured: the 796 passing tests 400.6 -> 203.4 s; the 111 that need a module keep their full login (63.9 s at baseline) |
| B. + `wow-stub.lua` per-kind lookup tables | about 247 | **about 125-130 s** | measured on prototype: full login -14%, scoped login -9%; applies to about 138 + 54 s of login time |
| C. + shared logins | -2 | no change | grep: at most about 8 shareable logins |
| D. + split `more`/`auction` | 0 | no change on 2 workers | largest file 73 s; helps only a 16-worker dev run (its floor, 144 s, is `more.test.mjs`) |
| E. (not recommended) persistent chunk cache | -10 | -5 s | parse is 179 ms per fresh worker |
| Lever B alone, without A | about 412 | about 212 s | -14% of 372.7 s login time |

The probe for A (a run with the six off for every login) measured 119 s wall, but 111 tests failed early, so that figure is not a valid result; the 135-140 s estimate adds the failing tests back at their baseline cost.

**Can harness-only levers reach under 300 s on 2 workers?** Yes, and baseline already does on this machine (241 s). For margin against a slower hosted CPU, A + B give an estimated 125-140 s. If the hosted core is 1.5x slower than this laptop (an assumption, see A1) baseline would be 360 s (fail) and A + B 190-210 s (pass); a 2.3x slower core would still pass with A + B. Recommended internal budget for the local proxy: at most 150 s, with 300 s the criterion.

**If the target were out of reach** (it is not): the modules to cut one at a time with approval (D-02, D-03) would be, by measured Enable ms: ActionBars 67.1, FrameAuras 27.1, PlayerAuras 19.5, InstancePrep 12.6, UnitFrames 11.9, RaidTools 11.7.

### Scoped-login probe detail (what the 111 are)

Probe: after `createAddon`, before `login()`, the scratch setup file replaced `ns.ModuleEnabled` with a wrapper returning false for the named modules, for every test (a probe only; the real seam is below). Results, each a full-suite run on 2 workers:

| Modules off | Tests that fail | Passing tests: baseline -> probe | Saving on passing |
|-------------|-----------------|----------------------------------|-------------------|
| ActionBars only | 53 | 437.0 s -> 323.9 s | 26% |
| FrameAuras, PlayerAuras, InstancePrep, UnitFrames, RaidTools | 68 | 419.8 s -> 307.1 s | 27% |
| All six | 111 (= the union: 43 ActionBars only, 58 others only, 10 both) | 400.6 s -> 203.4 s | 49% |

Failures by file, all six off: bars 33, units 15, prep 11, setup 7, auctionrestock 6, auras 6, core 5, more 5, scenarios 4, clickcast 3, frames 3, visibility 3, masque 2, and one each in smoke, lua-engine, clicks, movers, options, raid, range, report. These need the modules (or, for tests that name an error with `expectErrors`, the module that raises it: `judge` fails a test whose matcher "matched nothing"). An executor can re-derive the exact 111 names by the same probe (recipe in Code Examples). Tests that pass with modules off but exist to check cross-module layout (`scenarios`, `smoke`, `setup` "nothing overlaps", `movers`) should stay on the full login on purpose, because a scoped login hides cross-module breakage (ARCHITECTURE.md trade-off); the saving for those few is small.

The real seam, verified: appending Lua after the caller's SavedVariables sets `VanguardDB.profiles.Default.modules.<Name> = false`; with `loggedIn("", { savedVariables })` the six names were off (`ns.ModuleEnabled('ActionBars')` false, `Vanguard_Bar1Button1` nil), `RaidFrames` untouched, `#ns.errors` 0. The profile is named `Default` (used by the existing `NO_RAID` constant). Careful: `NO_RAID` assigns a whole new `VanguardDB`, which drops the `setupDone` that `SETUP_DONE` set; a scoped helper must merge into the table after any caller-supplied SavedVariables rather than replace it.

## Standard Stack

### Core (already installed; no new package)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| vitest | 5.0.3 (exact in `package.json`; `npm view vitest version` -> 5.0.3) [VERIFIED: npm registry] | Test runner, projects `quick` and `lua`, JSON reporter for timing | Already the runner; `--maxWorkers` and `VITEST_MAX_WORKERS` both work |
| fengari | 0.1.5 (`npm view fengari version` -> 0.1.5, `time.modified` 2025-12-26) [VERIFIED: npm registry] | Lua 5.3 VM; supports `lua_sethook` count hooks, `lua_getstack`, `lua_getinfo` ("Sln") used by the profiler prototype [VERIFIED: ran the prototype] | D-03 keeps it |
| Node | v24.14.0 local [VERIFIED: `node --version`] | Runtime | D-05 moves CI to 24 |
| luacheck | 1.2.0, official release binary (latest GitHub release `v1.2.0`, published 2024-05-24) [VERIFIED: GitHub API] | Lint | D-05 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `--maxWorkers=2` for the proxy | `VITEST_MAX_WORKERS=2` | Same effect; the env form also reaches `npm run coverage` |
| Whitelist `only` for scoped logins | Blacklist `without` | `only` is the D-02 wording; implement `only` and expand dependencies (CastBars needs UnitFrames, per ARCHITECTURE.md), or offer both with `only` as the public name |
| Per-kind `__index` tables in the stub | Leave the stub alone | -14% login time for a small, test-verified stub edit |

**Installation:** nothing new to install. `package.json` change: `"fengari": "0.1.5"`.

## Package Legitimacy Audit

No new npm package is added. `fengari` (already locked at 0.1.5) only loses its caret; `vitest` is unchanged. The only new external artefact is the luacheck release binary (not npm; official `lunarmodules/luacheck` GitHub release).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fengari 0.1.5 | npm | in lock since before this phase | n/a (existing) | github.com/fengari-lua/fengari | existing dependency | Approved (pin only) |
| vitest 5.0.3 | npm | existing | n/a | existing | existing | unchanged |
| luacheck v1.2.0 | GitHub release (not a package) | released 2024-05-24 by `alerque` (lunarmodules maintainer) | n/a | github.com/lunarmodules/luacheck | not run through the package seam (not a registry package) | Approved with SHA-256 pin below |

**Packages removed due to SLOP verdict:** none. **Packages flagged SUS:** none.
The luacheck SHA-256 below was computed from one TLS download on 2026-10-10 [VERIFIED: sha256sum of the downloaded file]. It was not compared with an independent source (the release publishes `luacheck.asc` signatures, 833 bytes, but the signer's key was not checked here). The executor should fetch it a second time from another network, or verify `luacheck.asc` with the maintainer's published key, before committing the digest. `[ASSUMED]` until then.

## Architecture Patterns

### Test pipeline and where each lever acts

```
npm test / npm run coverage   (VITEST_MAX_WORKERS=2 for the proxy)
        |
   Vitest main process --- schedules 69 test files on N workers (forked processes)
        |                         each worker: setup.mjs (afterEach = error guard, afterAll = coverage dump)
        v
 scripts/tests/<area>.test.mjs --calls--> helpers.loggedIn(extra, opts)  <== LEVER A: scoped modules written here
        |                                         |
        |                                createAddon (lua-harness.mjs)
        |                                  newState + loadStub  <== LEVER B: wow-stub.lua lookup
        |                                  load 90 TOC files (compiled-chunk cache)
        |                                  track(): HARVEST + createdAddons.push
        |                                         |
        |                                addon.login(): ADDON_LOADED -> PLAYER_LOGIN (modules Enable, ~190 ms)
        |                                               -> PLAYER_ENTERING_WORLD
        v
   test body (world / click / inspect)  --- afterEach: check(createdAddons.splice(0), takeExpected())  [Phase 2 guard]
        |
   count hook every 1000 instructions: budget (always) + profiler sampler (LUA_PROFILE) + line coverage (LUA_COVERAGE)
```

### Recommended structure for new files
```
scripts/
├── lib/lua-profile.mjs        # sampler + aggregation + report (functions <= 10 lines, commented)
├── profile-lua.mjs            # CLI: npm run profile -- <area|login>
├── suite-timing.mjs           # CLI: npm run timing  (2-worker run, per-file table, budget check)
├── lua-profile.test.mjs       # quick-project test of the profiler on a tiny chunk
└── suite-timing.test.mjs      # quick-project test of the table/budget code on a canned JSON
.nvmrc                         # "24"; add to .pkgmeta ignore
.gitignore                     # + profile/
```
New `scripts/*.test.mjs` files fall in the `quick` project and raise the test count above 907 by the number of cases added (see Validation Architecture: the invariant is "no baseline case lost", plus the `scripts/tests` area counts unchanged).

### Pattern 1: Scoped login (D-02 lever 2)
**What:** `loggedIn(extra, { only, savedVariables, firstRun })`: after the caller's SavedVariables, append Lua that sets `VanguardDB.profiles.Default.modules[name] = false` for every registered module not in `only` plus its dependencies. The module names come from `ns.ModuleNames()` at run time, which cannot be known before the addon files load, so append the Lua after load: either extend `createAddon` with a `modulesOff` option that runs the Lua after the SavedVariables source, or pass the fixed six-name list.
**Recommendation (prescriptive):** keep the default `loggedIn()` as is. Add `HEAVY = ["ActionBars","FrameAuras","PlayerAuras","InstancePrep","UnitFrames","RaidTools"]` and an option `without: HEAVY` (or `only`, computed as all modules minus `without`). Convert tests in batches by file, running the file after each batch; any test that fails stays on the full login. Do not scope `smoke`, `scenarios`, `setup` layout and `movers` cases.
**Example:** see Code Examples.

### Pattern 2: Shared login with the guard intact (design only; recommended to skip, see measurements)

Why it is hard: tests here mutate the world (`setUnit`, `click`, `fire`, `slash`, `advance`), set combat, fill chat and edit the addon; a fengari Lua state cannot be cloned or snapshotted (ARCHITECTURE.md line 171), so a mutated shared login cannot be reset to login state. Only a login that tests read from, never write to, can be shared safely.

**Proposed API** (`scripts/tests/helpers.mjs`):
```js
// A logged-in addon built once for the file and shared by read-only tests.
// Returns a getter for a read-only view: inspectors and world reads only.
export function sharedLogin(extra = "", options = {}) { /* beforeAll(create), afterEach(fingerprint check), afterAll(drop) */ }
const view = sharedLogin(NO_RAID);
it("...", () => { expect(view().frame("Vanguard_player").visible).toBe(true); });
```
- **View, not the addon:** the object exposes only `frame`, `frames`, `screen`, `texts`, `find`, `chat`, `savedVariables`, `world.get`, `world.unit`, and `read(luaExpr)` (prepends `return`). No `fire`, `click`, `slash`, `update`, `advance`, `world.set*`, `eval`. A test cannot mutate what it cannot call, so shared tests cannot affect each other, and nothing needs resetting. Defence in depth: after each test compare a fingerprint (`#__wfgStub.frames`, `#__wfgStub.chat`, `__wfgStub.now`, `__wfgStub.inCombat`, `#ns.errors`, `#__wfgCleared`) with the one taken before; a difference fails that test with "the shared login changed".
- **Combat, chat, mocks, world:** unchanged by construction, so nothing is reset. A test needing any of them uses `loggedIn()`.
- **Guard (review finding IN-01):** register shared addons in a second registry `globalThis[Symbol.for("vanguard.sharedAddons")]` (same trick as `createdAddons`, so `setup.mjs` need not import the harness). In `setup.mjs` the global `afterEach` becomes: judge `createdAddons.splice(0)` plus the shared list with `check([...created, ...shared], takeExpected())`, then forget the shared addons' caught errors (`__wfgCleared = {}` and `ns.errors = {}` through `ns.ClearErrors()`, which the harness HARVEST wrapper would copy first, so clear `__wfgCleared` after judging), so every later test is judged on what it alone caused. `afterAll` empties the shared list. No test is exempt and `expectErrors` still works because `takeExpected()` is read once per test.
- **Tests to add with it:** a quick-project test showing (1) an error raised while test 2 uses the shared addon fails test 2 and only test 2, (2) the shared addon is still judged after the 3rd test, (3) the view has no mutators.

### Pattern 3: Per-kind metatables in the stub (lever B)
**What:** replace the function `widgetMeta.__index` (calls `cacheFor`, `rawget`, `store[w.__kind]`) with one metatable per widget kind (and per kind with the backdrop mixin) whose `__index` is a cache table; the cache has its own `__index` function that resolves a miss (`resolveKind(kind, backdrop, key)`) and stores only hits with `rawset`. A hit is then a plain table lookup chain with no Lua call. `forgetResolved()` must clear the caches in place (not replace the tables), so metatables stay valid when a test edits the widget API list. Misses (unknown keys such as `frame.someField == nil` probes) still call the function; they return `nil`, not `false`.
**Prototype** (scratch copy, not committed): warm full login 227 -> 195 ms median (two runs: 227/194, 221/194), scoped login 73 -> 66 ms; `npx vitest run --project lua` on the copy: 758/758 passed with the guard on.
**Apply:** in `newWidget` use `metaFor(kind, false)`; in `CreateFrame` after `w.__backdrop_mixin = backdrop`, if true switch to `metaFor(kind, true)`. `__backdrop_mixin` is set only there (grep over `scripts` found no other writer). Cite in the commit body that behaviour is unchanged for existing widget API surface (it adds no method). The code-quality scan lists `"*.lua", "*.mjs", "*.js"` (`scripts/lib/code-quality.mjs:388`, via `git ls-files --cached --others`), so the stub's new functions need a comment above and bodies of at most 10 lines; the prototype's `metaFor` must be split to comply, and a file not yet added to git is scanned too.

### Pattern 4: Sampling profiler design (D-02 lever 1; design only, prototype validated)

**What works in fengari 0.1.5** [VERIFIED: ran a prototype in scratch]: `lua_sethook(L, fn, LUA_MASKCOUNT, 1000)` (the harness already uses it), and inside the hook `lua_getstack(L, level, ar)` plus `lua_getinfo(L, "Sln", ar)` give `short_src`, `currentline`, `linedefined`, `name`, `what`. Attribution to Lua file and function worked on 4,650 samples. Hook overhead in the prototype was 150 ms of 1,011 ms (15%) with a depth-60 stack walk; line hooks (coverage) can be on at the same time (the harness already multiplexes them in `attachHooks`).

**Where it hooks in:** `attachHooks` in `scripts/lib/lua-harness.mjs` builds one hook (`(state, ar) => ar.event === LUA_HOOKLINE ? onLine(state, ar) : countHook(state)`). Add, in the same style as `lineHook()` for coverage: `const sampler = process.env.LUA_PROFILE ? profileSampler() : null`, and in the count branch call `sampler?.(state)` after `countHook(state)`. No extra hook, no cost when `LUA_PROFILE` is unset. (The prototype did this from outside by wrapping `lua.lua_sethook`, which also worked.)

**Attribution:**
- One sample = 1,000 Lua VM instructions, not wall time. Time spent inside JS-implemented functions (fengari's string and table libraries, any `[JS]` frame) does not advance the instruction count; it shows up only as the calling Lua frame's share. State this in the report header, and convert to milliseconds by scaling each share by the measured wall time of the run.
- Self: the Lua frame at level 0 (skip `what == "C"`), keyed `short_src:linedefined name`; also per line.
- Inclusive: each distinct Lua function on the stack once per sample (deduplicate recursion), up to depth 40; keyed by file and by function.
- Merge: each test file's `afterAll` (in `setup.mjs`, by the same lazy global-symbol trick as `dumpHits`, so the quick project does not import the profiler) writes `profile/<area>-<pid>.json`; the CLI merges them.

**CLI:** `npm run profile -- <area>` runs `vitest run scripts/tests/<area>.test.mjs --maxWorkers=1` with `LUA_PROFILE=profile/` (spawned like `scripts/coverage-lua.mjs`), then prints tables and writes `profile/<area>.json`. A special area `login` runs `createAddon` plus `login` N times in one process (the measurement used for this research) without Vitest. Add `"profile": "node scripts/profile-lua.mjs"` to `package.json`, and `profile/` to `.gitignore` (output is untracked, so `.pkgmeta` and `check-zip` are unaffected; `scripts/` is already ignored by `.pkgmeta`).

**Output format:** text, in this order: header (area, samples, instructions per sample, wall ms, hook overhead); "self by file" top 12; "inclusive by file" top 25; "inclusive by function" top 20 (`file:linedefined name`); "self by line" top 10; each row `samples  pct  key`. JSON: `{ area, samples, perSample, wallMs, files: [{ file, self, incl }], functions: [{ key, incl }], lines: [{ key, self }] }`. Add `--tests` later to attribute by test name if wanted. Unit test: run a known two-function Lua chunk and assert the hot function ranks first and percentages sum to 100 on the self table.

### Pattern 5: Recording the 2-worker measurement (CI-06 evidence)
A small `scripts/suite-timing.mjs` (`npm run timing`): spawn `vitest run --maxWorkers=2 --reporter=json --outputFile=<tmp>` (so it works from PowerShell, bash and CI), read the JSON, print total wall (max end minus min start of files), the sum of file times, max concurrent files (must equal 2, which proves the cap), the top N files with tests and seconds, and exit non-zero when wall exceeds `--budget` (default 300). The JSON reporter fields used (`testResults[].startTime/endTime`, `assertionResults[].duration/status`, `numTotalTests`) were verified this session.

### Anti-Patterns to Avoid
- **Running two suites at once** on one machine: Phase 2 saw 30 s timeouts in `check-zip` and `media`; the uncapped run here also showed each file taking 2-3.4x longer. Record machine load with every timing.
- **Trusting a probe's wall time when tests fail**: failing tests end early.
- **Scoping everything by default**: it hides cross-module breakage; keep a few full-login cases.
- **Dropping the `setupDone` flag** by assigning a whole new `VanguardDB` after `SETUP_DONE` (what `NO_RAID` does).
- **Running `npm install --package-lock-only` on Windows** to pin fengari: see Pitfall 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lua call-stack attribution | A text parser of tracebacks | `lua_getstack` + `lua_getinfo` inside the existing count hook | Verified to work; exact file and function |
| Per-file timing | A custom timer around each file | Vitest's JSON reporter (`--reporter=json --outputFile`) | Gives file start/end and per-test durations |
| Judging errors across tests | A second error list | The existing registry and `check`/`judge` in `error-guard.mjs` | Keeps the D-01 rules; one place |
| YAML parsing for workflow tests | A YAML parser dependency | The text readers already in `scripts/workflows.test.mjs` (`workflow`, `runBlocks`, `stepNamed`, `deeperLines`) | D-05 forbids other dependency changes |
| SHA-256 checking | A custom script | `sha256sum -c` in the workflow step | Standard on the runner |
| Checksum for the lock edit | `npm install --package-lock-only` | A one-line hand edit of the lock (below) | The tool rewrites unrelated lines on Windows |

## Runtime State Inventory

Not a rename or migration phase. Omitted. (One related note: Vitest keeps a results cache under `node_modules/.vite` that orders files by past duration; it only affects scheduling, never results, and CI has no such cache.)

## Common Pitfalls

### Pitfall 1: A concurrency group cancels a good run when an unrelated label is added
**What goes wrong:** `full-suite.yml`'s concurrency group is `full-suite-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true`. Adding any other label fires a `labeled` event; even though the job's `if` skips it, the new (skipped) run can still cancel the in-progress run for the same PR. [ASSUMED: GitHub evaluates concurrency before job conditions; confirm on the first hosted run.]
**How to avoid:** make the group differ for runs that will be skipped, for example append `${{ github.event.action == 'labeled' && github.event.label.name != 'full-tests' && '-other-label' || '' }}`, and pin it with a workflow test.
**Warning signs:** a ready-for-review run shows "Cancelled" right after someone adds a label.

### Pitfall 2: A PR opened ready (not as a draft) never gets the full suite
**What goes wrong:** D-04 adds `ready_for_review`, which fires only when a draft is marked ready. A PR opened directly as ready fires `opened`, which is not in `full-suite.yml`'s current types (`types: [labeled, synchronize, reopened]`), so no full suite runs unless the label is added.
**How to avoid:** add `opened` (and keep `reopened`) to the types, and let the job `if` skip drafts. This is within D-04's intent ("a PR that is ready for review"). Flag it to the user in the plan summary since it widens D-04's literal wording by one event.

### Pitfall 3: `npm install --package-lock-only` rewrites the lock on Windows
**What goes wrong:** On this machine (npm 11.9.0) pinning `"fengari": "0.1.5"` and running `npm install --package-lock-only` changed line 12 correctly but also deleted 10 `libc` fields (glibc/musl markers on the optional native packages), which would change what Linux CI installs.
**How to avoid:** hand-edit exactly two lines: `package.json` `"fengari": "^0.1.5",` -> `"fengari": "0.1.5",` and `package-lock.json` root `packages[""].devDependencies` (line 12) the same. Verified in a scratch copy: the diff is exactly that one line and `npm ci --dry-run --ignore-scripts` exits 0. Assert in a test that both files say `0.1.5` with no caret, and that `package-lock.json`'s `node_modules/fengari` version is `0.1.5`.

### Pitfall 4: Tests that name an expected error break when their module is off
**What goes wrong:** `judge` fails a test whose `expectErrors` matcher matched nothing ("expected but never seen"). A scoped login that disables the module raising that error turns a green test red (for example `AURA_FALLBACK`-style cases and the 6 `auctionrestock` cases that need Instance prep).
**How to avoid:** keep such tests on the full login; the probe list above already contains them.

### Pitfall 5: apt cannot be dropped from the quick gate entirely
**What goes wrong:** D-05 says the luacheck binary "drops an apt step". The quick gate (`verify.yml`) and `lua-suite.yml` also install `lua5.1` for `luac5.1 -p` (Lua 5.1 syntax of every TOC file). Dropping `lua-check` from the apt line removes only a package, not the `apt-get update`, which is the slow part. [ASSUMED: `lua5.1` is not preinstalled on `ubuntu-latest`.]
**How to avoid:** keep a one-package apt line for `lua5.1` (run in the background beside `npm ci`, as `verify.yml` does now), and download luacheck in the same background group. Tell the user the saving is the package, not the step; removing apt fully would need another way to run a 5.1 syntax check (a decision, not made here).

### Pitfall 6: Timing noise and false precision
Two identical 2-worker runs differed by 1-4 s; the coverage run adds about 4%. Record at least two runs, and the machine's load, and compare like with like (plain vs coverage). The proxy's real use is the ratio between before and after, not an absolute hosted prediction.

### Pitfall 7: New tests change the 907 count
Adding quick-project tests (profiler, timing, workflows) raises the total. State the invariant as "all 907 baseline cases still present and passing, every `scripts/tests` area line in the Lua harness summary unchanged, total = 907 + added".

## Code Examples

### A. Scoped login (sketch; function bodies <= 10 lines when implemented)
```js
// scripts/tests/helpers.mjs
// The modules that cost about 150 of a login's 190 ms (measured 2026-10-10).
export const HEAVY = ["ActionBars", "FrameAuras", "PlayerAuras", "InstancePrep", "UnitFrames", "RaidTools"];

// Lua that turns modules off in the account's Default profile, keeping whatever the caller's SavedVariables set.
const modulesOff = (names) => `VanguardDB.profiles = VanguardDB.profiles or {}
VanguardDB.profiles.Default = VanguardDB.profiles.Default or {}
VanguardDB.profiles.Default.modules = VanguardDB.profiles.Default.modules or {}
${names.map((n) => `VanguardDB.profiles.Default.modules.${n} = false`).join("\n")}`;

// loggedIn(extra, { without: HEAVY }) : like loggedIn, with those modules off.
// (savedVariables order: SETUP_DONE, then the caller's, then modulesOff)
```
[VERIFIED: this exact append, after `SETUP_DONE`, with `Default` profile, turned all six off and left `RaidFrames` on, zero errors.]

### B. The probe that finds which tests need a module (scratch, not committed)
```js
// vitest.prof.config.mjs (outside the repo, with a node_modules junction): setupFiles = [repo setup, this]
// a.eval(`local off = {["ActionBars"]=true} local orig = ns.ModuleEnabled
//   ns.ModuleEnabled = function(n) if off[n] then return false end return orig(n) end`)
// run: DISABLE=ActionBars,... npx vitest run --config <scratch config> --maxWorkers=2 --reporter=json --outputFile=<f>
// tests with status != "passed" in the JSON are the ones that need those modules.
```
Run it per file-batch rather than trusting this research's counts, since tests change.

### C. `full-suite.yml` (D-04)
Current text, quoted verbatim from the file read this session:
```yaml
  pull_request:
    types: [labeled, synchronize, reopened]
...
concurrency:
  group: full-suite-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
...
    if: github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'full-tests')
```
Recommended:
```yaml
  pull_request:
    types: [opened, ready_for_review, labeled, synchronize, reopened]
...
concurrency:
  group: full-suite-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}${{ github.event.action == 'labeled' && github.event.label.name != 'full-tests' && '-other-label' || '' }}
  cancel-in-progress: true
...
    if: >-
      github.event_name != 'pull_request' || (
        !github.event.pull_request.draft && (
          github.event.action == 'opened' ||
          github.event.action == 'ready_for_review' ||
          github.event.action == 'reopened' ||
          contains(github.event.pull_request.labels.*.name, 'full-tests')))
```
Meaning: non-draft PRs run on `opened`, `ready_for_review`, `reopened`; a `synchronize` or `labeled` run happens only while the `full-tests` label is on the PR; drafts never. (Adding the label to an unlabeled ready PR fires `labeled` with the label present, so it starts a run; an unrelated label on an unlabeled PR does not.) `report` job is unchanged (`github.event_name != 'pull_request'`). Update the header comment of `full-suite.yml`, `lua-suite.yml` and `verify.yml` (they say "or on a pull request while it carries the full-tests label") to match.

### D. Node 24 and `.nvmrc` (D-05)
`.nvmrc` content: `24`. Verbatim current lines: `node-version: 22` at `lua-suite.yml` (two places: tests job and preview job), `verify.yml` (one), `release.yml` (one: the publish job). Replace each with `node-version-file: .nvmrc` (keep `cache: npm`). Add `- .nvmrc` to `.pkgmeta`'s `ignore:` list (verbatim list ends `- .pkgmeta`); `scripts/pkgmeta.test.mjs` compares `git ls-files` minus ignore against the zip, so the file must be tracked and listed. Update the stale note in `.planning/codebase/STACK.md` only if the user wants planning docs refreshed (not required).

### E. luacheck 1.2.0 step (D-05), for `verify.yml` and `lua-suite.yml`
```yaml
- name: luacheck 1.2.0 (official release binary, checked against its SHA-256)
  env:
    LUACHECK_SHA256: d68da17fca0697d9e2fb04201f3884abd259fa558b3a449bccaed47f1390defc
  run: |
    curl -fsSL -o "$RUNNER_TEMP/luacheck" https://github.com/lunarmodules/luacheck/releases/download/v1.2.0/luacheck
    echo "$LUACHECK_SHA256  $RUNNER_TEMP/luacheck" | sha256sum -c -
    sudo install -m 0755 "$RUNNER_TEMP/luacheck" /usr/local/bin/luacheck
    luacheck --version
```
The real asset list of release `v1.2.0` [VERIFIED: GitHub API `releases/tags/v1.2.0`]: `luacheck` (835,048 bytes, the Linux binary), `luacheck.exe`, `luacheck32.exe`, `luacheck-1.2.0-1.rockspec`, `.src.rock`, and `.asc` signatures for each. The `luacheck` file is an ELF 64-bit x86-64 shared/PIE object (header bytes checked: class 2, machine 0x3e, type 3) with one `ld-linux` string, so it is dynamically linked against glibc and will run on `ubuntu-latest` [ASSUMED: not executed here, this machine is Windows]. Obtain the checksum yourself: `curl -sL <url> | sha256sum`, repeat from a second network, and optionally verify `luacheck.asc` with the release signer's key. In `verify.yml`, run the download inside the existing background group beside `npm ci`; keep `sudo apt-get update -qq && sudo apt-get install -y -qq lua5.1` there (Pitfall 5). The step comments must say "luacheck" without the `lua-check` apt name so the test below can assert it is gone.

### F. `scripts/workflows.test.mjs` additions (read as text with the existing helpers)
Assert (each a small `it`):
1. `full-suite.yml` types line contains `ready_for_review` and `opened`; the job `if` mentions `pull_request.draft` and `full-tests`; `schedule`, `workflow_dispatch` unchanged; the shuffle line (`shuffle: ${{ github.event_name == 'schedule' }}`) unchanged.
2. The concurrency group in `full-suite.yml` contains the `-other-label` guard (Pitfall 1).
3. `verify.yml` still has `types: [opened, synchronize, reopened, ready_for_review]` and `if: ${{ !github.event.pull_request.draft }}`, and still has no `full-tests` (quick check on every push).
4. No workflow contains `node-version: 22` or a bare `node-version:`; every `actions/setup-node` step has `node-version-file: .nvmrc`; `.nvmrc` exists, is a plain major version, and is not `22`.
5. `.nvmrc` is in `.pkgmeta` ignore (the pkgmeta test also fails otherwise, but assert it here for a clear message).
6. `verify.yml` and `lua-suite.yml` both contain the same 64-hex `LUACHECK_SHA256`, the `v1.2.0` release URL, `sha256sum -c`, and neither installs the `lua-check` apt package nor says `lua-check`; both still run `luacheck --no-color .`.
7. `package.json` and `package-lock.json` root list `"fengari": "0.1.5"` (no `^`, `~`, range), the lock's `node_modules/fengari` entry is `0.1.5`, and `vitest` is still exact.
8. `release.yml` still never shuffles (existing test) and its setup-node uses `.nvmrc`.
Keep `lua-suite` read-only permissions test as is.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-version: 22` inline | `node-version-file: .nvmrc` (Node 24) | this phase (D-05) | One place to move Node; local matches CI |
| apt `lua-check` 1.1.2 | luacheck 1.2.0 release binary, SHA-256 pinned | this phase | Newer linter, no apt for it; supply chain gated by checksum |
| fengari `^0.1.5` | exact `0.1.5` | this phase | Reproducible; 0.1.5 is also the latest release (no newer exists) |
| Full login in every test | Scoped login for tests that do not need the six heavy modules | this phase | -42% estimated suite CPU |

**Deprecated/outdated:** the comment in `lua-suite.yml`, "The tests take about five minutes on a hosted runner", predates the 907-test suite and has not been measured; replace it with the recorded proxy number when it is recorded (a hosted number stays open per D-01).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A hosted 2-vCPU Actions runner core is 1.5-2.5x slower than this laptop's core, so baseline would be 360-600 s there | Lever estimates | If it is only 1.2x slower, baseline already passes; if worse than 2.5x, even A + B (about 130 s) could exceed 300 s. The hosted measurement is open by D-01 either way |
| A2 | A skipped `labeled` run still cancels an in-progress run in the same concurrency group | Pitfall 1 | If wrong, the `-other-label` suffix is harmless extra text; if right, omitting it cancels good runs |
| A3 | The `luacheck` release binary runs on `ubuntu-latest` (ELF x86-64, glibc, header checked; never executed) | Code Example E | The quick gate would fail on the first hosted run (unobservable now); fallback: keep apt `lua-check` |
| A4 | `lua5.1` is not preinstalled on `ubuntu-latest`, so one apt install stays | Pitfall 5 | If preinstalled, the apt step could be dropped entirely |
| A5 | The SHA-256 `d68da17f...defc` is the true digest of the official `v1.2.0` `luacheck` asset (one TLS download, not cross-checked, `.asc` not verified) | Package Legitimacy Audit, Example E | A wrong or tampered digest would either fail CI (safe) or pin a bad binary; cross-check before committing |
| A6 | `actions/setup-node@v7` accepts `node-version-file`, Node 24 is available on hosted runners, and Playwright 1.56.1 works on Node 24 (preview job) | Example D | First hosted run fails; keep Node 22 for the preview job only if so |
| A7 | The grep-based read-only estimate (52 tests) is a good bound: it parsed 746 of 907 tests (tests declared as `it(` at column 0); the other 161 (indented, generated or in loops) were not classified | Pattern 2 | Shared logins could save somewhat more than 2 s; still bounded by about 1 test in 17 being read-only |
| A8 | Node 24 as the CI major is correct to pin as `24` rather than `24.14.0` | Example D | Minor drift between local and CI patch versions; pin the full version if the user wants exactness |

## Open Questions

1. **Does the user want `opened` added to `full-suite.yml`'s types?**
   - Known: D-04 names `ready_for_review`; a PR opened as ready fires `opened`, not `ready_for_review`.
   - Unclear: whether the user meant to exclude those.
   - Recommendation: add `opened`; mention it in the plan summary.
2. **Should the UI preview job run on every full-suite pull-request run?** `full-suite.yml` passes `preview: ${{ github.event_name != 'workflow_dispatch' || inputs.preview }}`, which is true for pull requests: each ready-for-review run also installs Playwright and Chromium (about a few minutes of billed time). Not part of CI-06's wall time (it runs in parallel) but of the minutes budget. Recommendation: leave as is unless the user wants it off for PRs.
3. **How much margin does the user want?** Proxy target 300 s is met at baseline (241 s). Recommend delivering A + B anyway (internal budget 150 s) because hosted speed is unknown (A1). If the user prefers to stop at the baseline, only D-04 and D-05 plus the profiler and timing recorder remain.
4. **Is the `wow-stub.lua` lookup change acceptable under D-02?** It is harness-only and fits "harness-only first", but it is not in D-02's list; the profiler's first finding motivates it.
5. **Drop shared logins?** Measured benefit about 2 s; the IN-01 design is ready if the user wants it anyway. Recommendation: record the measurement and skip.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | yes | v24.14.0 | n/a |
| npm | install, registry checks | yes | 11.9.0 | n/a |
| Vitest | tests, timing | yes | 5.0.3 | n/a |
| fengari | harness | yes | 0.1.5 | n/a |
| luacheck (local) | `npm run lint` | yes, `C:\tools\lua\luacheck` on PATH | not queried | n/a |
| lua5.1 / luac5.1 (local) | `luac5.1 -p` check | yes, `C:\tools\lua\luac5.1` | not queried | n/a |
| GitHub API / registry (network) | version and checksum checks | yes | n/a | n/a |
| Hosted Actions runner | hosted timing, workflow dry-run | **no** (billing block, D-01) | n/a | 2-worker local proxy; workflow wiring pinned by text tests only |
| Linux x86-64 host | executing the luacheck ELF | no (Windows machine) | n/a | header inspection only (A3) |

**Missing with no fallback:** none for planning. **Missing with fallback:** the hosted runner (proxy and text-level workflow tests stand in; first real run waits for billing).

## Validation Architecture

> `.planning/config.json` has `"nyquist_validation": true` (read this session), so this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3, projects `quick` (`scripts/*.test.mjs`, `scripts/tests/smoke.test.mjs`) and `lua` (`scripts/tests/*.test.mjs`, `scripts/lua-engine.test.mjs`) |
| Config file | `vitest.config.mjs` |
| Quick run command | `npm run test:quick` (about 10 s) |
| Full suite command | `npm test` (all), `npm run coverage` (all plus the 100% floor), `npm run verify` (tests + quality scan) |

### Phase Success Criteria -> automated checks

| Criterion | Behavior | Test type | Automated command | Expected | File exists? |
|-----------|----------|-----------|-------------------|----------|--------------|
| SC1 / CI-05 (wiring) | `ready_for_review` and `opened` start the full suite; drafts do not; label gates later pushes; quick check on every push | text-level workflow tests | `npx vitest run scripts/workflows.test.mjs` | all green, including the new cases listed in Example F | partly; new cases are Wave 0 |
| SC1 (hosted behaviour) | the hosted run actually starts on ready-for-review and on the label | manual, deferred | mark a PR ready on GitHub after billing clears; check Actions tab | one `full suite` run appears; none for a draft | manual-only; billing blocks it (D-01 spirit); record as an open item |
| SC2 / CI-06 (time) | whole suite under 300 s on 2 workers | timing run | `node scripts/suite-timing.mjs --budget 300` (to be created; until then `npx vitest run --maxWorkers=2 --reporter=json --outputFile=<f>` and read the JSON) | prints `total wall <N> s`, `max concurrent files 2`, per-file table, exit 0 when N < 300 | Wave 0 |
| SC2 (CI-shaped) | the command CI runs, on 2 workers | timing run | `VITEST_MAX_WORKERS=2 npm run coverage` (PowerShell: `$env:VITEST_MAX_WORKERS=2; npm run coverage`) | `Duration` under 300 s; ends with `total 19058/19058 100.00%` | exists |
| SC2 (record) | per-file times and the total in the phase summaries and verification | document | paste the `suite-timing` table into the plan SUMMARY and VERIFICATION | top files, total, machine, load, run count | n/a |
| SC3 (no case dropped) | all 907 baseline cases still run and pass; area counts unchanged | JSON diff | Wave 0: at the phase's start commit, `npx vitest run --reporter=json --outputFile=<base.json>` and save the sorted `file|fullName` list; at the end repeat and check every baseline name is present with status `passed`; also compare the `Lua harness by area` lines | no name missing; every area line identical (`more 108/108 passed`, ...) | Wave 0 (list is not stored yet) |
| SC3 (count) | 907 baseline + the cases this phase adds | count | JSON `numTotalTests` = 907 + added quick-project cases; `numFailedTests` 0; `numPendingTests` 0 (no skips) | exact | n/a |
| SC3 (coverage) | floor unchanged | coverage | `npm run coverage` | `total 19058/19058 100.00%` (no addon Lua is added; scoping must not lower it) | exists |
| D-02 (profiler) | `npm run profile -- <area>` prints attribution; zero cost when unset | unit + smoke | `npx vitest run scripts/lua-profile.test.mjs`; `npm run profile -- login` | hot function ranks first; self percentages sum to 100; no output file when `LUA_PROFILE` unset | Wave 0 |
| D-02 (scoping) | each converted file stays green with a smaller login; guard still judges | per-file run, then full | `npx vitest run scripts/tests/<file>.test.mjs`, then the SC2/SC3 commands | file green; its time drops | Wave 0 |
| D-02 (stub) | lookup change keeps behaviour | full lua project | `npx vitest run --project lua` and `npx vitest run scripts/lua-engine.test.mjs` | 758/758 | exists |
| D-02 (guard, if shared login is built) | every test judged for its own errors | unit | new quick test on `sharedLogin` (3 cases in Pattern 2) | an error in test 2 fails test 2 only | only if built |
| D-05 | Node 24, `.nvmrc`, luacheck pin, fengari pin | text tests + pkgmeta | `npx vitest run scripts/workflows.test.mjs scripts/pkgmeta.test.mjs` | green | Wave 0 |
| D-05 (lock consistent) | exact pin keeps the lock valid | install dry run | `npm ci --dry-run --ignore-scripts` and `git diff --stat package-lock.json` | exit 0; exactly one changed line | n/a |
| Hard rules | function comments and length; luacheck; Lua 5.1 | scan | `npm run verify` | passes | exists |

### How to record the 2-worker timing (procedure)
1. Close other heavy programs; note `Get-CimInstance Win32_Processor` name and any background load.
2. `node scripts/suite-timing.mjs --budget 300` twice (and once with `VITEST_MAX_WORKERS=2 npm run coverage`). Keep both totals.
3. Copy the header (date, machine, Node, Vitest, worker cap, total wall, sum of file times, max concurrent files) and the per-file table into the SUMMARY and VERIFICATION. Mark the hosted measurement as open (D-01).
4. Baseline for comparison from this research: 241.4 s / 240 s plain, 250 s with coverage; top file `more.test.mjs` 73.3 s.

### Sampling Rate
- **Per task commit:** the converted test file(s) alone (`npx vitest run scripts/tests/<file>.test.mjs`) plus `npm run test:quick`.
- **Per wave merge:** `npm run verify`, then `node scripts/suite-timing.mjs`.
- **Phase gate:** `npm run verify`, `VITEST_MAX_WORKERS=2 npm run coverage`, `suite-timing` twice, the baseline-name diff, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Save the baseline name list (`file|fullName` of all 907 cases and the per-area summary lines) before any test edit.
- [ ] `scripts/suite-timing.mjs` and its test.
- [ ] `scripts/lib/lua-profile.mjs`, `scripts/profile-lua.mjs`, `scripts/lua-profile.test.mjs`; `profile` npm script; `profile/` in `.gitignore`.
- [ ] New cases in `scripts/workflows.test.mjs` (Example F).
- [ ] `.nvmrc` plus `.pkgmeta` ignore entry.
- [ ] Framework install: none.

## Security Domain

> `security_enforcement` treated as enabled (not set false).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | n/a (no user accounts) |
| V3 Session Management | no | n/a |
| V4 Access Control | yes (CI) | workflow `permissions: contents: read` kept on `lua-suite.yml` (existing test); `full-suite.yml` keeps `contents: read, issues: write` |
| V5 Input Validation | yes (CI) | no `${{ inputs.* }}` or event-controlled text in `run:` scripts (existing test "no run script holds an input expression"); the new `if` and concurrency expressions use only expressions, never shell text |
| V6 Cryptography | yes | SHA-256 checksum of the downloaded binary via `sha256sum -c`; do not hand-roll |
| V14 Config / supply chain | yes | pin the luacheck binary by digest; exact fengari version; `npm ci` from the lock |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered or swapped release binary | Tampering | SHA-256 pin in the workflow, digest cross-checked before commit (A5), failing closed on mismatch |
| Script injection through PR title, label or branch name into `run:` | Elevation | keep the label name only inside `if`/concurrency expressions, never interpolated into `run:` text |
| Fork PRs running the full suite with write tokens | Elevation | `pull_request` (not `pull_request_target`), `contents: read` for the suite job; the `report` job (issues write) does not run for pull requests |
| Dependency drift | Tampering | exact `fengari` pin and `npm ci` |

## Sources

### Primary (HIGH confidence)
- Measurements by the researcher this session (vitest JSON reports, instrumented setup file, scratch sampler and module-cost scripts, `npm run coverage` with `VITEST_MAX_WORKERS=2`): all timings, counts and percentages above.
- In-repo files read in full this session: `03-CONTEXT.md`, `vitest.config.mjs`, `package.json`, `.pkgmeta`, `.github/workflows/full-suite.yml`, `lua-suite.yml`, `verify.yml`, `scripts/workflows.test.mjs`, `scripts/tests/helpers.mjs`, `scripts/tests/setup.mjs`, `scripts/lib/lua-harness.mjs`, `scripts/lib/error-guard.mjs`, `scripts/lib/wow-stub.lua` (lines 85-215, 640-655), `scripts/coverage-lua.mjs`, `Core/Modules.lua` (lines 1-60), `scripts/tests/README.md` (head), `02-REVIEW.md` IN-01, `ROADMAP.md` Phase 3, ARCHITECTURE.md (scoped and shared login notes at lines 148 and 171). `release.yml` was read through its publish job.
- npm registry: `npm view fengari` -> version 0.1.5 (modified 2025-12-26); `npm view vitest version` -> 5.0.3.
- GitHub API `repos/lunarmodules/luacheck/releases/latest` and `releases/tags/v1.2.0`: tag `v1.2.0`, published 2024-05-24, asset list and sizes above.

### Secondary (MEDIUM confidence)
- Vitest `--maxWorkers` and the JSON reporter behaviour confirmed by running them on Vitest 5.0.3 (not from the docs).

### Tertiary (LOW confidence)
- Hosted-runner speed ratio (A1), concurrency-cancel behaviour (A2), runner image contents and Node 24 support (A3, A4, A6): training knowledge, to be confirmed on the first hosted run.

## Appendix: tests that need one of the six heavy modules (probe of 2026-10-10)

The probe changed `ns.ModuleEnabled` (not the real seam). The per-test names are not stored in the repo; re-derive them with Code Example B before converting a file, because tests change. Counts only:

Totals: 43 AB only, 58 OTH only, 10 both, 111 in all; by file: bars 33, units 15, prep 11, setup 7, auctionrestock 6, auras 6, core 5, more 5, scenarios 4, clickcast 3, frames 3, visibility 3, masque 2, smoke 1, lua-engine 1, clicks 1, movers 1, options 1, raid 1, range 1, report 1.

## Metadata

**Confidence breakdown:**
- Standard stack and CI mechanics: HIGH for versions and quoted file text; MEDIUM for hosted behaviour (unobservable)
- Measurements and lever estimates: HIGH for the baseline, the cost split, the six-module numbers and the scoped probe; MEDIUM for the combined A + B figure (sum of two measured parts, not one measured run)
- Profiler design: HIGH that fengari supports it (prototype ran); the CLI and merge layer are design only
- Shared-login design: MEDIUM (design only, no code run); benefit estimate HIGH-to-MEDIUM (regex covers 746 of 907 tests)
- Pitfalls: HIGH for 3 (reproduced), MEDIUM for the rest

**Research date:** 2026-10-10
**Valid until:** 2026-11-10 for the numbers (tests change); the luacheck/fengari/vitest versions were current on 2026-10-10 and move slowly.
