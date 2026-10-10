# Phase 2: Errors fail tests - Research

**Researched:** 2026-10-10
**Domain:** Test-harness error guard (Vitest 5 + fengari headless WoW client) and error isolation in a Lua 5.1 WoW addon (`ns.Try` / `ns.Report` / `ns.errors`)
**Confidence:** HIGH for counts, stub semantics and harness design (read and run in this session); MEDIUM for the 60-test classification (judged from test names and error text, not every test read line by line); LOW for in-game behaviour and per-call overhead (not observable here)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The guard and its allow-list (CI-04)**
- **D-01:** Tests that deliberately cause an error (tests of the error handling itself) opt out with a marker inside the test that names the exact error it expects. The test passes only if exactly that error appears; any other error left in `ns.errors` still fails it. There are no file-level exemptions and no list of exempt files in `setup.mjs`.
- **D-02:** The guard is a global `afterEach` in `scripts/tests/setup.mjs`. The harness must know every addon a test created: `createAddon` (`scripts/lib/lua-harness.mjs:429`) is the single factory, reached through `loggedIn` (about 890 call sites) and 23 direct calls. A failure prints the error text and where it came from (the stack the addon keeps).

**Handlers that bypass ns.Try (CI-04)**
- **D-03:** Production code is changed. One shared helper in `Core/` is used at every `hooksecurefunc` site (about 81), every `OnClick` handler (about 57) and every raw `C_Timer` call (about 21), converted mechanically. A throwing handler then lands in `ns.errors`, so players see it in `/vg errors` as well as tests failing. -- **Reversibility:** costly -- it touches roughly 160 call sites across `Core/` and `Modules/`; undoing it means reverting each conversion.
- Existing repo rules apply to the helper: a comment on the line above every function, at most 10 lines of code per function, every new line executed by a test, the 100% coverage floor holds.

**When the guard exposes errors (CI-04, success criterion 4)**
- **D-04:** Fix the errors in the addon (money paths first: auction, vendor and bags), not in the allow-list. If more than about 20 distinct errors appear, or any single fix needs a large change, stop and show the user the list before continuing.

**Repeated and shuffled runs (CI-03)**
- **D-05:** A weekly CI job runs the full suite in a shuffled order and prints its seed so a failure can be replayed. The PR full-suite run is not shuffled. No local shuffled runs are required to close the phase. The user knowingly accepts that the shuffle part of roadmap criterion 3 stays open until the hosted runner works (it is currently blocked by billing); the roadmap wording was updated to say so. Any flaky case met while running the suite is fixed at its cause, not retried.

### Claude's Discretion
- How the expected-error marker looks (name, arguments, matching by text or pattern), as long as D-01 holds.
- How the harness records the addons a test created.
- Name and shape of the shared helper in `Core/` (D-03).
- If an error the guard exposes comes from a gap in the test stub, not the addon, fix the stub and cite the 12.1 Blizzard source in the commit body (the policy set in Phase 1), and do not weaken a harness rule and a test in one commit.

### Deferred Ideas (OUT OF SCOPE)
- Combat-lockdown mode and a per-module secret-value sweep for the harness: not in CI-03 or CI-04. Add them as a requirement before Phase 12's in-combat check.
- The nine hand-rolled `OnUpdate` accumulators and the `RegisterUnitEvent` leaks: Phase 4.
- Hosted-runner confirmation of the shuffled run: waits for the billing block to clear (Phase 3 measures CI).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-03 | Tests are deterministic: no flaky cases, and a failure names what broke | Q7: one real order dependence found by a local shuffled run (`scripts/link-wow.test.mjs`, 6 cases); shuffle config and seed printing verified; failure-message design in Q4 |
| CI-04 | Any test that leaves an error in the addon's error list fails, so swallowed errors cannot pass | Q2 (stub semantics), Q3 (`ns.Guard` helper), Q4 (registry, `afterEach`, `expectErrors` marker), Q5 (60 tests would fail today; root causes listed) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Same authority as CONTEXT.md. `[VERIFIED: CLAUDE.md, read this session]`

- Every function has a comment on the line directly above it and a body of at most 10 lines of code (`scripts/lib/code-quality.mjs`, `MAX_BODY_LINES = 10`). Nested functions count toward the parent. This applies to JS test and harness files too (the callback passed to `it(...)` is exempt from the body limit).
- Colours and font sizes only in `Core/Theme.lua`.
- A new WoW global the addon reads goes in `read_globals` in `.luacheckrc`; addon globals in `globals`. (`ns.Guard` is a field on `ns`, not a global.)
- Widget methods go in `scripts/lib/wow-widget-api.lua` only after confirming they exist in the 12.1 client. Unlisted methods are nil in tests on purpose.
- A file the game loads must be in `Vanguard.toc`. A new top-level file or folder players do not need goes in the `.pkgmeta` `ignore` list (`scripts` is already ignored, so new files under `scripts/` need nothing).
- Lua 5.1 only. Nothing protected in combat (`ns.OutOfCombat`). Never read or compare a possibly-secret value (`ns.IsSecret`, `ns.PlainNumber`).
- `npm run verify` and `npm run coverage` must both pass before a change is called done; every new line of addon Lua needs a test that executes it; the coverage floor is 100%.
- One task is one commit, subject `<task id> <area>: <change>`, body says what changed and what was verified; branch `work/...`, one PR per phase; never commit to `main`; no new doc files unless asked.
- The game cannot be run here: never claim in-game behaviour. Anything that needs the real client goes on the PR's "needs in-game check" list.
- Use "Vanguard" and `/vg`; no "ForeverUI" or `/fui` in new text.
- Memory notes: worktrees need their own `npm ci` (or resolve `node_modules` from a parent folder, as this session did); `npm run coverage` exits before reporting while any test is red; the three pre-existing red tests noted on 2026-10-07 were green in Phase 1's baseline and in every run here.

## Summary

The guard is cheap to build and the suite is nearly ready for it. I simulated it with a throwaway setup file kept outside the tracked tree (it patches fengari's `luaL_newstate` to remember every Lua state, then reads `ns.errors` after each test and logs; it never fails a test). The unshuffled suite is green (66 files, 873 tests, 217.5 s on 16 threads). With the guard on, **60 tests in 15 files would fail today**, carrying **66 distinct normalised error texts**. About 43 of those tests are tests of error handling or of a deliberate client-fallback notice (they need an `expectErrors` marker). About 17 carry errors nobody asked for, from **six root causes**: test fixtures that replace `Enum` or `hooksecurefunc` wholesale, two unguarded calls in `Modules/ChatExtras.lua`, a stripped-globals AFK test, and one capability probe. That is under the D-04 stop threshold of about 20 distinct errors, and none of them is on a money path.

Hooks, click handlers and timers do not swallow errors in the test stub: it calls them bare, so an error propagates as a JS exception out of `addon.click` / `addon.advance` / `addon.eval` and already fails the test (Q2). The real gap is production: in game a throwing hook, click or timer goes only to the game's handler and never reaches `/vg errors`. So D-03's test-side effect is small (it turns "exception" into "entry in `ns.errors`", which the guard then fails); its value is to players and to errors that run inside someone else's `pcall`/`ns.Try`. The real counts differ from the CONTEXT figures: **54 `hooksecurefunc` calls** (81 is grep lines, 36 mentions are `type(hooksecurefunc)` guards), **57 `OnClick` handlers**, and **12 unguarded timer calls** (21 is grep lines; 3 more calls are already inside `ns.Try`).

A local shuffled full run (seed 20261010, not required by D-05) found exactly one order-dependent file: `scripts/link-wow.test.mjs`, whose own header says "The cases share that folder and run in this order." Six of its cases fail when shuffled. It is a JS test in the `quick` project, so the fix can be proven in about 10 seconds per seed. Every Lua-harness case passed shuffled, so the suite is otherwise order-independent today.

**Primary recommendation:** Add one helper `ns.Guard(where, fn)` to `Core/Events.lua` next to `ns.Try` (no `Vanguard.toc` change) and wrap the callback argument at every hook, `OnClick` and raw timer site; register every `createAddon` result in a list the global `afterEach` drains; add `expectErrors(...)` in a new `scripts/lib/error-guard.mjs` (re-exported from `helpers.mjs`); fix the six root causes and add about 43 markers; make `link-wow.test.mjs` cases independent; drive shuffle from a `VG_SHUFFLE_SEED` environment variable read by `vitest.config.mjs`, so `npm run coverage` picks it up with no argument change.

## Architectural Responsibility Map

This phase has no browser or server tiers. The tiers that matter are the shipped addon, the JS test harness, the Lua test stub, and CI.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Catching and recording errors from hooks, clicks, timers | Addon Core (`Core/Events.lua`) | Addon Modules (call sites) | Only production code can make an in-game error reach `/vg errors` (D-03) |
| Failing a test that leaves errors | Test harness JS (`scripts/tests/setup.mjs`, `scripts/lib/error-guard.mjs`) | `scripts/lib/lua-harness.mjs` (registry) | `afterEach` is a Vitest hook; the harness owns the addon factory |
| Expected-error marker | Test files via `helpers.mjs` | `scripts/lib/error-guard.mjs` | The marker lives inside the test (D-01) |
| Stack text in the failure message | Test stub (`scripts/lib/wow-world.lua`, optional `debugstack`) | Addon (`stack()` in Events.lua) | The addon keeps `stack` only if the client has `debugstack`; the stub has none today |
| Shuffle order and seed | Vitest config (`vitest.config.mjs`) | CI workflows (`lua-suite.yml`, `full-suite.yml`) | The config reads an env var; the workflow chooses and prints the seed |
| Completeness of the D-03 conversion | Code-quality scan (`scripts/lib/code-quality.mjs`) | Plan-time greps | Only a static rule stops a new bare `hooksecurefunc` from creeping back |

## Standard Stack

No new packages. Everything below is already in the repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 5.0.3 in `package-lock.json` (5.0.2 installed in the main checkout's `node_modules`) | Test runner; `afterEach`, `sequence.shuffle`, `sequence.seed` | Already the runner `[VERIFIED: package-lock.json:1335-1336; node_modules/vitest/package.json]` |
| fengari | 0.1.5 | Lua VM for the headless client | Already the engine `[VERIFIED: package-lock.json:731-732]` |
| acorn | 8.18.0 | JS parser behind the code-quality scan | Already used by `scripts/lib/code-quality.mjs` |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `ns.Try` / `ns.Report` / `ns.errors` in `Core/Events.lua` | Error isolation and the one error list | The new helper routes into these; never build a second list |
| `ns.Soon` in `Core/Combat.lua:114` | Next-frame coalescing; its work already runs under `ns.Try` (Combat.lua:108) | Leave as is; it is not a bare timer site |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One `ns.Guard(where, fn)` used at all three site kinds | Three verbs (`ns.Hook`, `ns.OnClick`, `ns.After`) | Nicer call sites, and `ns.Hook` could absorb the `type(hooksecurefunc)` guards. D-03 says "one shared helper" and three helpers triple the tests. Recommend the single wrapper; `ns.Hook` is an optional follow-up |
| Reading `ns.errors` at the end of the test, plus a `ns.ClearErrors` harvest | A metatable tap on `ns.errors` | The tap also sees entries dropped by the 20-entry cap. More harness Lua. Recommend the simpler default |
| Env-driven shuffle in `vitest.config.mjs` | `--sequence.shuffle --sequence.seed=N` flags | `npm run coverage` spawns vitest with fixed arguments (`scripts/coverage-lua.mjs`: `spawnSync(process.execPath, [bin, "run"], { ... env: { ...process.env, ... } })`) but passes the environment through, so the env route needs no script change |

**Installation:** none. Versions: the lockfile pins vitest 5.0.3; 5.0.2 is what ran here, so the sequence and seed behaviour below is verified for 5.0.2 only (Assumption A9).

## Package Legitimacy Audit

No external packages are installed or recommended in this phase.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
PRODUCTION (ships)                                         TEST HARNESS (JS, not shipped)
------------------                                         -----------------------------
game fires hook / click / timer                            test body: loggedIn() / createAddon()
        |                                                         |
        v                                                         v
 ns.Guard(where, fn)  <-- wraps the callback ONCE at         createAddon pushes the addon into
        |                 install time (hooksecurefunc,      the created-addons list
        |                 SetScript, C_Timer.After)                 |
        v                                                         v
 ns.Try(where, fn, ...)  -- xpcall(fn, traced, ...)          test drives: click / advance / fire / eval
        |  error                                                   |
        v                                                         v
 traced(): record(where, err) -> keep() -> ns.errors         test ends  ->  global afterEach (setup.mjs)
        |            (cap 20, de-duplicated by text)                |
        +--> chat once --> game's error handler                      |  reads ns.errors of every listed addon
                                                                     |  plus entries saved by the ns.ClearErrors wrapper
 /vg errors and the error badge read ns.errors                       v
                                                              judge(found, expected):
                                                                no entries            -> pass
                                                                entries, no marker    -> FAIL, print text + count + stack
                                                                marker matches all    -> pass
                                                                marker never matched  -> FAIL (stale marker)
                                                                entry not in marker   -> FAIL

CI: full-suite.yml (schedule) --shuffle=true--> lua-suite.yml --VG_SHUFFLE_SEED=$(date +%s)--> npm run coverage
      PR / dispatch / release: shuffle=false                       vitest.config.mjs: sequence.shuffle + seed
                                                                   default reporter prints: Running tests with seed "N"
```

### Recommended Project Structure
```
Core/Events.lua                  # + ns.Guard (after ns.Try, ~line 157); no new Core file, no .toc change
scripts/lib/lua-harness.mjs      # + createdAddons list, push in createAddon, ClearErrors-harvest snippet
scripts/lib/error-guard.mjs      # NEW: expectErrors, caught, judge, check (each <= 10 lines)
scripts/error-guard.test.mjs     # NEW (quick project): unit tests of judge/expectErrors, no Lua
scripts/tests/errorrail.test.mjs # NEW (lua project): ns.Guard on a hook, a click, a timer, a nil callback
scripts/tests/setup.mjs          # + global afterEach
scripts/tests/helpers.mjs        # + re-export expectErrors
scripts/link-wow.test.mjs        # make the cases independent (CI-03, fix at the cause)
vitest.config.mjs                # + sequence from VG_SHUFFLE_SEED
.github/workflows/{lua-suite,full-suite}.yml   # shuffle input, seed step
```

### Pattern 1: Wrap the callback, leave the surrounding code alone
**What:** `ns.Guard(where, fn)` returns a function that runs `fn` under `ns.Try`. Each conversion changes only the callback argument, so the surrounding `type(...)` branches, argument order and early returns stay as they are.
**When to use:** the callback of `hooksecurefunc`, of `SetScript("OnClick", ...)`, and of a raw `C_Timer.After` / `NewTicker`.
**Example (design sketch, not implemented; each function has a comment and fewer than 10 lines):**
```lua
-- Source: design for Core/Events.lua, placed after ns.Try (Events.lua:152-156)
-- fn as a function that runs under ns.Try, so a failure is reported (ns.Report, /vg errors) under `where`;
-- for hooks, scripts and timers. Anything that is not a function comes back as it is (SetScript nil clears).
function ns.Guard(where, fn)
  if type(fn) ~= "function" then return fn end
  return function(...) return ns.Try(where, fn, ...) end
end

-- Call sites (mechanical):
--   hooksecurefunc(frame, "SetPoint", ns.Guard("hook SetPoint", function(self) ... end))
--   hooksecurefunc("FCF_OpenTemporaryWindow", ns.Guard("hook FCF_OpenTemporaryWindow", CX.WatchWindows))
--   b:SetScript("OnClick", ns.Guard("click " .. tostring(text), onClick))
--   C_Timer.After(wait, ns.Guard("timer search queue", function() AH.waiting = false AH.Next() end))
```

### Pattern 2: Registry of created addons, drained by the global afterEach
**What:** `createAddon` appends the addon it returns to a list on `globalThis` (the same trick as the existing `chunkCache` at `lua-harness.mjs:47`); the `afterEach` in `setup.mjs` reads and empties it.
**Why globalThis:** Vitest evaluates modules once per test file, and `setup.mjs` and the test file share one module graph, so a plain module-level array would also work (the existing `dumpHits` import shows that setup and harness share instances within a file). The `Symbol.for` form costs nothing and survives a different import path.
**Example (design sketch):**
```js
// scripts/lib/lua-harness.mjs
// The addons createAddon made since the guard last looked (the global afterEach in scripts/tests/setup.mjs empties it).
export const createdAddons = (globalThis[Symbol.for("vanguard.addons")] ??= []);
// ... at the end of createAddon, before `return addon;`:   createdAddons.push(addon);

// scripts/tests/setup.mjs
afterEach(() => check(createdAddons.splice(0)));   // check() throws one Error describing every bad finding
```

### Pattern 3: A marker that must be consumed
**What:** `expectErrors(...matchers)` records what this test expects. A matcher is an exact string (the whole entry `text`, `"where: message"`, which is what `/vg errors` prints) or a `RegExp`. After the test, every entry must match some matcher and every matcher must match some entry. A stale marker therefore fails, so markers cannot rot.
**Why exact text first:** D-01 says "names the exact error". Use exact strings where the text is stable (`"DB upgrade 4: eval:2: boom"`) and anchored regexes only where file or line numbers drift (`/^module Bad: eval:\d+: boom$/`). Never `/./` or a bare `TEST-ONLY`.
**Example (design sketch):**
```js
// scripts/lib/error-guard.mjs (each function carries its comment and stays <= 10 lines)
const wanted = (globalThis[Symbol.for("vanguard.expected")] ??= []);

// Names the caught errors this test expects: a string is the whole entry text, a RegExp a pattern.
export function expectErrors(...matchers) { wanted.push(...matchers); }

// Whether a matcher names an entry's text.
const names = (m, text) => (typeof m === "string" ? m === text : m.test(text));

// The failure message for what was found against what was expected, or "" when they agree.
export function judge(found, expected) {
  const extra = found.filter((e) => !expected.some((m) => names(m, e.text)));
  const unseen = expected.filter((m) => !found.some((e) => names(m, e.text)));
  const lines = [extra.length && listing(extra), unseen.length && `expected but never seen: ${unseen.join(", ")}`];
  return lines.filter(Boolean).join("\n");
}
```

### Anti-Patterns to Avoid
- **A file-level exemption list in `setup.mjs`:** forbidden by D-01.
- **A marker that matches a class** (`/TEST-ONLY/`, `/.*/`): defeats "exactly that error". Several `core.test.mjs` cases produce 3 to 5 distinct `TEST-ONLY ...` errors; list each.
- **Clearing `ns.errors` in a test to make the guard pass:** `ns.ClearErrors()` is part of the error-handling tests; the harvest below keeps what was cleared, so clearing is not a loophole.
- **Building the guarded function inside the hook:** call `ns.Guard` once at install time (on the `hooksecurefunc` line), never per firing.
- **A second error list or a bare `pcall` in the helper:** route through `ns.Try`, which already de-duplicates, prints once, captures the stack while frames are live, and calls the game's handler.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Catching errors from a callback and reporting them | Per-site `pcall` + chat print | `ns.Guard` -> `ns.Try` -> `ns.Report` | De-duplication by text, the 20-entry cap, print-once, stack capture inside xpcall's handler (`traced`, Events.lua:134-142), game-handler forwarding with a loop guard |
| A test registry of addons | Patching every test or `loggedIn` call site | One push in `createAddon` | `createAddon` is the only factory: 898 `loggedIn(` calls and about 35 direct `createAddon(` calls (counted this session) all end there |
| Test shuffling | A custom sorter | Vitest `sequence.shuffle` + `sequence.seed` | Deterministic per seed (verified: the same seed gave the same in-file order twice, another seed a different one) |
| Seed printing | Custom reporter code | Vitest's default reporter | It prints `Running tests with seed "N"` itself `[VERIFIED: node_modules/vitest/dist/chunks/index.C-uw7tH9.js:14038-14039]` |
| "No bare hook/timer remains" | A hand audit each release | A rule in `scripts/lib/code-quality.mjs` with a test in `scripts/code-quality.test.mjs` | Prevents regressions after the 54 + 57 + 12 sites are converted |

**Key insight:** the addon already has the whole error rail; the work is putting three more kinds of entry on it and making the end of every test look at it.

## Common Pitfalls

### Pitfall 1: The stub has no `debugstack`, so "the stack the addon keeps" is empty in tests
**What goes wrong:** D-02 wants the failure to print where the error came from. `stack()` in `Core/Events.lua:54-56` returns `""` unless the client has `debugstack`, and the stub defines none (`grep -rn debugstack scripts/lib` finds nothing; `core.test.mjs:639` is titled "without debugstack or an error handler (this stub)"). Only `core.test.mjs` defines its own per test.
**How to avoid:** the failure message always prints `text` (it already carries the site label and, for Lua errors, the failing `file:line`, e.g. `module DataBars: Modules/DataBars.lua:19: attempt to compare number with string`), the `count`, and the stack when it is non-empty. Optional, as its own task with a full-suite run: add a test-only `debugstack` to `scripts/lib/wow-world.lua` returning `debug.traceback("", level + 1)`. Cite Blizzard's source for `debugstack` in the commit body (Phase 1 policy); tests that need "no stack" already set `debugstack = nil` (`core.test.mjs:640`). `[ASSUMED]` that `debugstack` exists in the 12.1/Forever client (the addon already feature-detects it).
**Warning signs:** a failure printout with an empty stack line.

### Pitfall 2: The 20-entry cap and `ns.ClearErrors` hide errors from an end-of-test read
**What goes wrong:** `keep()` drops the oldest entry past `ns.MAX_ERRORS` (`Events.lua:68`) and `ns.ClearErrors()` replaces the list (`Events.lua:119`). An end-of-test read misses both.
**Why it matters:** a test that causes an unexpected error and later calls `ns.ClearErrors()` would pass. Dropping by the cap only matters when more than 20 distinct errors occurred; then the list is non-empty and an unmarked test fails anyway. It only weakens the exactness check of a marked test.
**How to avoid:** in `createAddon`, after `loadAddon`, run a short Lua snippet that wraps `ns.ClearErrors` so the entries it is about to drop are first appended to a harvest list (`Core/Slash.lua:358` and the tests all call `ns.ClearErrors()` through the field, so the wrapper is seen). The guard judges harvest + current list. The cap stays a documented blind spot for marked tests; a metatable on `ns.errors` would close it at the cost of more harness Lua (Open Question 5).

### Pitfall 3: Converting a site turns "throws into the test" into "swallowed and recorded"
**What goes wrong:** today a bare hook, click or timer that throws propagates out of `addon.click` / `addon.advance` as a JS exception (Q2). After `ns.Guard` it is caught, so the test fails only through the guard. If a marker excused it, the failure would vanish.
**How to avoid:** land the guard (and its tests) before converting sites; keep the negative-control step in the validation plan (add a throwing handler, watch the test go red, revert).
**Also:** the stub's `hooksecurefunc` calls `fn(...)` bare (`wow-world.lua:150`), so a failing hook aborts the caller in tests, while in game a failing secure hook does not stop its caller. After the conversion both behave alike (reported, not propagated).

### Pitfall 4: Test fixtures that define their own `hooksecurefunc` or replace `Enum`
**What goes wrong:** many tests define a one-overload `hooksecurefunc` (`core.test.mjs:161` table form only; `more.test.mjs:114, 295, 589, 978` return early for a string first argument; `tooltip.test.mjs:9` string form only) or assign `Enum = {...}` over the stub's (`tooltip.test.mjs:11`, `frames.test.mjs:8`, `core.test.mjs:406`, `more.test.mjs:1116, 1138, 1162`). The addon then reports `attempt to index a string value (local 't')` or `Enum.CustomAuraButtonDispelTypeTextureStyle` nil, and the test passes anyway. The guard will fail them.
**How to avoid:** fix the fixtures at the cause: extend (`Enum = Enum or {}`) instead of replacing, and make a fixture `hooksecurefunc` accept both `(name, fn)` and `(table, name, fn)` like the stub's (`wow-world.lua:144-153`). This is the Phase 1 "fixture over rule" policy; do not weaken a harness rule in the same commit as a test.

### Pitfall 5: `ns.Guard` on a nil callback
**What goes wrong:** `SetScript("OnClick", nil)` clears a script. A wrapper that always returns a function turns a clear into a handler that errors on the first click.
**How to avoid:** return non-functions unchanged (sketch above) and test the nil branch (coverage floor).

### Pitfall 6: Restricted auction calls inside a wrapped click
**What goes wrong:** auction Post, Buy and Cancel calls are restricted to a hardware event, and the click path now runs inside `xpcall`.
**In tests:** the stub counts running clicks (`stub.hardware`, `wow-world.lua:1307-1314`) and logs `clicked = stub.hardware > 0` (`wow-world.lua:1326`), so the wrapper does not change what tests see.
**In game:** `[ASSUMED]` that a call made through `xpcall` from a click handler keeps its hardware-event status (the repo runs event handlers through `xpcall` in `ns.Try`, but not click handlers). Put it on the PR's "needs in-game check" list for the auction Post, Buy and Cancel buttons. It is the largest production risk of D-03.

### Pitfall 7: Next-frame work never runs in a test that does not advance the clock
**What goes wrong:** `ns.Soon` and `C_Timer.After(0, ...)` callbacks run only when the test calls `advance` or `update`. An error inside one is invisible to a guard that reads at the end of a test that never advanced.
**How to avoid:** nothing to fix (an existing limit); do not claim the guard proves timers ran, and do not add an automatic `advance` in `afterEach` (it would change test behaviour).

### Pitfall 8: Shuffle against tests that share state
**What goes wrong:** `scripts/link-wow.test.mjs` shares one temp folder across cases and relies on order; shuffled, 6 of its 12 cases fail (`ENOENT: no such file or directory, unlink '...\TEST-ONLY Forever\Interface\AddOns\Vanguard'`). See Q7.
**How to avoid:** give each case its own setup so order does not matter.

## Code Examples

### How the stub runs handlers today (why errors propagate to the test)
```lua
-- Source: scripts/lib/wow-stub.lua:838-845, wow-world.lua:144-153 and 206-210  [VERIFIED: read this session]
-- click:  if frame.__disabled ~= true then runScript(frame, "OnClick", button, down == true) end
-- hook:   local results = { orig(...) }  fn(...)  return unpack(results)
-- timer:  for _, t in ipairs(dueTimers()) do t.done = true  t.fn(t) end
-- No pcall anywhere: an error leaves stub.click / stub.update / the hooked call and reaches
-- runPushed's lua_pcall (lua-harness.mjs:232), which throws a JS Error naming file and line.
```

### Keeping what ns.ClearErrors would drop (design sketch, run once per state after loadAddon)
```js
// scripts/lib/lua-harness.mjs: test-only Lua run in the addon state (the JS function around it stays <= 10 lines).
const KEEP_CLEARED = `
  __wfgCleared = {}
  local clear = ns.ClearErrors
  ns.ClearErrors = function(...)
    for _, e in ipairs(ns.errors) do __wfgCleared[#__wfgCleared + 1] = e end
    return clear(...)
  end
`;
```

### Reading what an addon caught
```js
// scripts/lib/error-guard.mjs (sketch). Entry shape, Events.lua:66:  local e = { text = text, count = 0, stack = stackText }
const READ = `
  local out = {}
  for _, list in ipairs({ __wfgCleared or {}, ns.errors }) do
    for _, e in ipairs(list) do out[#out + 1] = { text = e.text, count = e.count, stack = e.stack } end
  end
  return out`;
// A Lua list result is [] or {} in JS (see `list` in lua-harness.mjs:381), so normalise.
export const caught = (addon) => { const out = addon.eval(READ); return Array.isArray(out) ? out : []; };
```

### Failure message
```
Vanguard left 2 error(s) in ns.errors that this test did not expect:
  1. module Bad: eval:4: boom   (x1)
       stack: (the test client keeps none)
  2. TEST-ONLY late: x   (x1)
If this test checks error handling on purpose, name the error: expectErrors("module Bad: eval:4: boom").
```
A throwing `afterEach` fails the test and prints a multi-line message under the test's name `[VERIFIED: ran a scratch test this session; output "FAIL ... > passes by itself / Error: GUARD MESSAGE line one / line two"]`.

### Shuffle config (design sketch for vitest.config.mjs; behaviour verified with a scratch copy)
```js
// A weekly CI run sets VG_SHUFFLE_SEED; Vitest then prints `Running tests with seed "N"` and the order replays from the same seed.
const seed = Number(process.env.VG_SHUFFLE_SEED) || 0;
// inside defineConfig({ test: { ...existing, ...(seed ? { sequence: { shuffle: { files: true, tests: true }, seed } } : {}) } })
```
`[VERIFIED: scratch config extending vitest.config.mjs]`: the run printed `Running tests with seed "4242"`; the same seed twice gave the same in-file order of `clicks.test.mjs`, seed 7 a different one.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Only `smoke.test.mjs` asserts `#ns.errors == 0` | Global `afterEach` over every created addon | this phase | 60 tests need a marker or a fix |
| Hooks, clicks and timers trust the game's handler | The same callbacks under `ns.Try` | this phase | errors reach `/vg errors` and the error badge |
| Fixed test order | Weekly shuffled run with a printed seed | this phase | finds order dependence (one file today) |

**Deprecated/outdated:** the figures 81, 57 and 21 in CONTEXT.md and PITFALLS.md are grep lines, not call sites; use the counts in Q1.

## Findings by Question

### Q1. Unwrapped sites (counted this session)

Method: `grep -rn` and a PCRE `-o` search over `Core/` and `Modules/` in the worktree at `b032e6f`. HIGH confidence unless noted.

**`hooksecurefunc`:** 81 grep lines = **54 call sites** (occurrences of `hooksecurefunc(` not preceded by `type(`) plus 36 `type(hooksecurefunc)` guard mentions (some lines hold both). 27 files. None of the 54 passes a callback wrapped in `ns.Try`. A few hook bodies call `ns.Try` inside (`Windows.lua:358`, `WindowsTabs.lua:162,163,312,351,390`, `Upgrades.lua:196`, `Movers.lua:188`), so those are partly guarded; the rest are bare.

| File | Calls | | File | Calls |
|------|------:|-|------|------:|
| Modules/Bags.lua | 6 | | Modules/WindowsTabs.lua | 2 |
| Modules/Windows.lua | 4 | | Modules/DataBars.lua | 2 |
| Modules/WindowsSystem.lua | 3 | | Modules/ChatExtras.lua | 2 |
| Modules/WindowsMap.lua | 3 | | Modules/CastBars.lua | 2 |
| Modules/MenuStrip.lua | 3 | | Modules/AuctionHelper.lua | 2 |
| Modules/GameTools.lua | 3 | | Core/Theme.lua | 2 |
| Modules/BagSections.lua | 3 | | Modules/WindowsTown.lua | 2 |
| Core/Movers.lua | 3 | | one each in 12 files: WindowsSocial, Upgrades, Tooltips, SwingTimer, QuestLog, Nameplates, GameAlerts, Errands, Chat, AuctionSell, AuctionCrafting, Core/Profiles | 12 |

Three local wrappers fan out: `after()` in `Modules/Windows.lua:314` (calls at 317 and 318), in `Modules/WindowsSocial.lua:17` (call at 22) and in `Modules/Chat.lua:160` (call at 161). Converting inside the wrapper covers their 14 callers (5 + 5 + 4 uses).

**`OnClick`:** **57** `SetScript("OnClick", ...)` sites in 28 files. The quoted-name grep gives 59; two are `GetScript("OnClick")(...)` call-throughs (`Core/OptionsWindow.lua:581`, `Modules/AuctionShop.lua:957`), not handlers. No `HookScript("OnClick")`, `PreClick`, `PostClick` or `.OnClick =` in `Core/` or `Modules/`. Per file: Controls 7, Dialog 6, ClickCastOptions 5, QuestDialogView 4, Widgets 4, QuestLogView 3, OptionsWindow 3, RaidTools 2, QuestTrackerView 2, Setup 2, GameMenu 2, and one each in 17 more files. Several are shared factories: `W.Button` (`Core/Widgets.lua:32`), `W.Primary` (`Core/Controls.lua:54`), `AH.Row` (`Modules/AuctionHelper.lua:128`). Converting a factory covers every button built through it, including the Auction* Post, Max, Stop, Skip, Relist, Cancel and Back buttons (`AuctionSell.lua:578,595,620,622`, `AuctionShop.lua:795,900,970,1004` and `AuctionOwned.lua:336,346,353` all call `W.Button`).

**Other scripts (outside D-03, for the record):** `SetScript` totals 186 = 57 OnClick + 27 OnUpdate (Phase 4) + 20 OnEnter + 20 OnLeave + 12 OnMouseWheel + 9 OnKeyDown + 6 OnMouseDown + 5 OnHide + 5 OnEnterPressed + 4 OnEvent + 4 OnEscapePressed + 3 OnReceiveDrag + 3 OnDragStart + 2 each of OnTextChanged, OnMouseUp, OnFinished, OnDragStop + 1 each of OnTabPressed, OnCooldownDone, OnAttributeChanged. `HookScript` totals 54 (OnShow 18, OnEnter 8, OnLeave 8, OnHide 7, the rest 13). `ns.Guard` fits these too; leaving them is a scope decision (Open Question 2).

**Raw timers:** 21 grep lines = **15 scheduling calls**: **12 unguarded**, 3 already guarded.

| Site | Callback | Guarded now? | Money path? |
|------|----------|--------------|-------------|
| Core/Perf.lua:133 `NewTicker` | `P.Report(false)` | no | no |
| Core/Visibility.lua:115 | `V.EndLinger` | no | no |
| Core/Visibility.lua:134 (`ns.AutoHide`) | `T.FadeOut` | no | no |
| Modules/AuctionHelper.lua:158 | `AH.waiting = false AH.Next()` (search throttle) | no | **auction** |
| Modules/AuctionHelper.lua:170 | `AH.Done()` fallback | no | **auction** |
| Modules/AuctionOwned.lua:306 | `AH.PaintOwned()` | no | **auction** |
| Modules/Errands.lua:34 (`later`; caller :250 `ER.StockNext`) | any | no | **vendor** (restock buying) |
| Modules/Merchant.lua:67 | `MC.SellJunk(tries - 1)` retry | no | **vendor** |
| Modules/Inventory.lua:93 | `IV.Scan` | no | **bags/inventory** |
| Modules/FightHistory.lua:53 | `FH.Record()` | no | no |
| Modules/MinimapButtons.lua:90 | `MB.Scan` | no | no |
| Modules/RaidStatus.lua:270 | `clearReady` | no | no |
| Core/Combat.lua:118 | `runSoon` -> `ns.Try(key, fn)` | yes (Combat.lua:108) | n/a |
| Modules/TalentPlanner.lua:502/505 | body is `ns.Try("talent planner", TP.Refresh)` | yes | no |
| Modules/TalentPlanner.lua:573-576 | `go` runs `ns.Try("talent planner", TP.Prompt)` | yes | no |

**Money-path classification** (what D-04 says to do first; MEDIUM, a judgement from file purpose):

| Kind | Money-path sites | Of total |
|------|------------------|---------:|
| Hooks | AuctionCrafting:240, AuctionHelper:325+326, AuctionSell:654 (`SetPostItem` -> `AH.TakeItem`, the Post path); Bags:89,90,149,159,195,221; BagSections:316-318; Upgrades:288; Errands:344 (`TakeTaxiNode`) | 15 of 54 |
| OnClick | AuctionSell:550 (`AH.TakeCursor`), AuctionHelper:128 (`AH.Row`), AuctionTable:115 (sort header), Bags:205 (sort), Errands:116 (`ER.TrainAll`), and the factories `Core/Widgets.lua:32,70` and `Core/Controls.lua:54` that build every Auction* action button | 5 direct + 3 factories of 57 |
| Timers | AuctionHelper:158,170; AuctionOwned:306; Errands:34; Merchant:67; Inventory:93 | 6 of 12 |

`Modules/Merchant.lua`, `VendorMemory.lua` and `Inventory.lua` have no `hooksecurefunc` or `OnClick` of their own.

### Q2. What the stub does when a hook, click or timer throws

It does not catch, swallow or record. `[VERIFIED: read this session]`
- Hooks: `scripts/lib/wow-world.lua:144-153`: `t[name] = function(...) local results = { orig(...) } fn(...) return unpack(results) end`. No pcall.
- Clicks: `scripts/lib/wow-stub.lua:831-845`: `runScript` returns `fn(frame, ...)`; `stub.click` runs `if frame.__disabled ~= true then runScript(frame, "OnClick", button, down == true) end`.
- Timers: `scripts/lib/wow-world.lua:206-210` (`t.done = true`, `t.fn(t)`) and the ticker at 235-239 (`fn(t)`); `stub.update` (wow-stub.lua:803-813, wrapped at wow-world.lua:247-250) calls them bare.
- The harness runs every call from the tests under `lua_pcall` with a traceback handler (`runPushed`, `lua-harness.mjs:226-234`), and `throwTop` (163-167) raises a JS `Error`. An uncaught handler error therefore fails the test that triggered it, naming the Lua file and line.
- It is caught and recorded only when something above already wraps it: an `ns.On` / `ns.OnUnit` handler, `ns.Soon`, the after-combat queue, a module build, or a window skin (all `ns.Try`). Those are the entries in the 60 tests of Q5.

Consequence for the helper: in production it must route errors into `ns.Try` (the game's handler does not feed `ns.errors`); in tests nothing extra is needed. Expect D-03 to expose few new test failures (the suite is green, so no un-nested hook, click or timer throws in driven tests). This could not be simulated (Assumption A6).

### Q3. The shared Core helper (design only)

**Where:** `Core/Events.lua`, directly after `ns.Try` (line 156) and before the "Events" section. It is the first file in `Vanguard.toc` after the libraries, so every later file can call it at load time, `Vanguard.toc` and `.pkgmeta` stay unchanged, and `ns.Try`, `ns.Report` and `ns.errors` live in the same file. A new `Core/Guard.lua` would need a TOC line right after `Core/Events.lua` and gains nothing.

**Signature options:**
1. **Recommended: `ns.Guard(where, fn)` returning a function.** One helper, three site kinds, argument wrapping only (sketch in Pattern 1). `where` is a short constant label such as `"hook UpdateItems"`, `"click Post"` or `"timer search queue"`. It becomes the prefix of the entry text (`where .. ": " .. message`, `Events.lua:102`) and half of the de-duplication key, so keep it stable and per feature rather than per frame.
2. `ns.Hook(a, b, c)` as a drop-in for `hooksecurefunc` that also skips when the global is missing. It would absorb the 36 `type(hooksecurefunc)` guards and fix `Modules/ChatExtras.lua:143` for free, but it is a second helper and a bigger diff. Optional follow-up.
3. `ns.After(seconds, fn, where)` for timers with a built-in "no `C_Timer`" fallback. Their fallbacks differ (`Errands.later` runs now, `Visibility.lua:133` returns, `FightHistory` records now), so it is not mechanical. Not recommended here.

**Routing:** `ns.Guard` -> `ns.Try(where, fn, ...)` -> `xpcall(fn, traced, ...)` -> `record` -> `keep` -> `ns.errors`, then chat once, then the game's handler (`Events.lua:134-142, 152-156`). Nothing new to write for the list, de-duplication or forwarding. Nesting is safe: `ns.Try` saves and restores `current` (`finished`, Events.lua:145-148).

**10-line and comment rules:** the helper body is 3 lines. Call-site conversions add no function, and existing named functions keep their size because only an argument changes. Anonymous closures passed as callbacks are not "named functions" under rule 2 of `code-quality.mjs`. Where a conversion would push a function past 10 lines, hoist the callback into a commented local function and pass its name.

**Coverage:** the single new branch (`type(fn) ~= "function"`) needs one test with a nil callback. Every converted line was already executed by existing tests (it is the same line). The new area test `scripts/tests/errorrail.test.mjs` covers the helper itself.

**Per-call overhead (not measured, Assumption A4):** installing a guard costs one closure per site at load. Each call of a guarded callback adds the wrapper call, `ns.Try` (two upvalue writes and a call to `finished`) and one `xpcall` frame; no per-call table is built (varargs pass straight through). That is a handful of function calls per firing. The hot ones are hooks that fire per game call: `Core/Movers.lua:98` (SetAlpha) and `:209` (SetPoint), `Core/Theme.lua:852-853` (SetChecked, SetTabSelected), `Modules/ChatExtras.lua:143` and `Modules/GameAlerts.lua:118` (AddMessage, every chat line), `Modules/Bags.lua:89-90` (SetVertexColor, Hide per bag slot), `Modules/DataBars.lua:191-192` (Show, SetShown). Measure in game with `/vg perf` (`Core/Perf.lua`) and list it under "needs in-game check". A hook that fails on every firing is de-duplicated by text, but `traced` still calls the game's handler each time (as the game itself did before D-03).

**Completeness rule (Claude's discretion, recommended):** a code-quality rule that flags, in `Core/` and `Modules/`, a `hooksecurefunc(` call whose callback is not an `ns.Guard(` call, a `SetScript("OnClick",` whose callback is not an `ns.Guard(` call, and `C_Timer.After/NewTimer/NewTicker(` whose callback is not an `ns.Guard(` call, except the `ns.Soon` line (`Core/Combat.lua:118`). The scan must be token-based (callbacks often start on the next line), not a line grep. Without it the next hook added bypasses the rail again.

### Q4. Harness side for D-01 and D-02

**Registering every addon:** push inside `createAddon` (`lua-harness.mjs:429-439`) just before `return addon;`. All 898 `loggedIn(` calls and the direct `createAddon(` calls (36 occurrences in tests, one of them inside `loggedIn`) end there. There is no module-level `loggedIn` or `createAddon` in `scripts/tests/` (a search for `^(const|let|var) ... (loggedIn|createAddon)\(` found none), so "the addons created since the last test ended" is exactly "this test's addons". `readLuaGlobals` (lua-harness.mjs:257) makes bare states with no `ns`; it is not an addon and is not registered. Errors raised at login are in `ns.errors` by the time the test body runs, so the end-of-test read sees them.

**The global afterEach:**
```js
// scripts/tests/setup.mjs (sketch; setup.mjs already imports afterAll and expect)
afterEach(() => check(createdAddons.splice(0)));
// error-guard.mjs: check(addons) = message = judge(addons.flatMap(caught), wanted.splice(0)); throw new Error(message) when non-empty
```
Vitest attributes a throwing `afterEach` to the test, so the red test names the case (verified above). The hook is registered once per test file through `setupFiles` (`vitest.config.mjs`: `setupFiles: ["scripts/tests/setup.mjs"]`), so it also runs for the pure-JS tests, where the list is empty and costs nothing. A failing test body and a failing guard both report; that is acceptable.

**Reading before the cap drops entries:** the cap (`ns.MAX_ERRORS = 20`, `Events.lua:31`) and `ns.ClearErrors` are the only ways an entry leaves the list. See Pitfall 2 for the harvest wrapper. For an unmarked test the end-of-test read is already sufficient (any entry fails it).

**Expected-error marker:** `expectErrors(...matchers)` as in Pattern 3, defined in `scripts/lib/error-guard.mjs` and re-exported from `scripts/tests/helpers.mjs` so tests import it with `loggedIn`. State lives on `globalThis` via `Symbol.for` and is reset by the `afterEach`. Match on the entry `text`; `count` and `stack` are not matched. Example: `core.test.mjs:585` expects `[20, "TEST-ONLY: 6"]` after 25 reports; its marker is `/^TEST-ONLY: \d+$/`, anchored, not `/TEST-ONLY/`.

**Printing:** throw one `Error` whose message lists, per entry, `text`, `count` and the stack when non-empty, plus the hint to call `expectErrors`. Do not read any value that might be secret: `text` is already built by `errorText()` (`Events.lua:59-62`), which names a hidden error instead of reading it.

**Existing tests that exercise error handling on purpose, and what each expects** (from a grep for `ns.errors|ns.Try|ns.Report|ns.ClearErrors|...` plus the simulation; 33 test files mention errors at all):
- `core.test.mjs` (22 of the 60): the error rail itself. `ns.Report` keeps one entry per distinct text with a count (`:604-606`); `ns.Try` returns pcall-like results and keeps a stack read inside xpcall's handler (`:609-614, 631-636`); no debugstack or handler (`:639-650`); a game handler that fails or loops (`:654-657, 740-786`); the 20-entry cap (`:584-591`); `/vg errors` and `/vg errors clear` (`:672-683`); module and DB-upgrade failures (`:80, 102, 117`); pin failures (`:176-182`); the error badge (`:924-942`); a failing unit-event handler (`:831-836`).
- `auras.test.mjs` (13): client fallbacks. Reports such as `aura filter HARMFUL|CROWD_CONTROL: this client rejects it; reading HARMFUL`, `aura filter HELPFUL: no part of it is known to this client`, `aura containers (using Vanguard's own icons): ...`, `aura container (switching to Vanguard's own icons): eval:49: TEST-ONLY: SetUnit refused` (`:405-518`).
- `report.test.mjs` (3): `/vg report` text; plants `RaidFrames: attempt to index a nil value`, `Nameplates: |cffff0000bad|r arithmetic` and 20 `ModuleN: long message ...` entries, then asserts `#ns.errors` is 20 (`:37-69`).
- One each, deliberate: `auctionapi.test.mjs:125` (`Vanguard.API.v1 update for TEST-ONLY Broken: eval:3: TEST-ONLY broken`, expects exactly 1), `skins.test.mjs` (`skin for Broken: eval:5: oops`), `feedback.test.mjs:81` (`RaidFrames: attempt to index a nil value`), `lua-engine.test.mjs:32-33` (`TEST-ONLY: eval:2: attempt to index a nil value (local 't')`), `fallbacks.test.mjs` (`after-combat update: eval:2: TEST-ONLY boom`), `tooltip.test.mjs:89` (`tooltip lines: eval:4: TEST-ONLY broken line`), `more.test.mjs:1604, 2584-2591` (`GameMenu: ... unknown template NoSuchTemplate`; `window CharacterFrame: eval:17: TEST-ONLY skin failure`, count 2).
- Many other assertions already say `#ns.errors` is 0; they stay valid and become redundant.

### Q5. Simulating the guard (done; nothing committed)

**Method (feasible without editing tracked files):** a scratch folder `.scratch-guard/` (untracked, deleted at the end) holding (1) a setup file added after `scripts/tests/setup.mjs` that patches `fengari.lauxlib.luaL_newstate` to remember each state, reads `__wfgNs.errors` through the Lua C API after every test, and appends `{file, test, errors[]}` to a JSONL file outside the repo, never failing a test; and (2) a config that imports the repo's `vitest.config.mjs` and appends that setup file. Run: `vitest run --config .scratch-guard/vitest.guard.config.mjs`.

**Result:** the unshuffled suite passed (66 files, 873 tests, 217.5 s, 16 threads). The guard would have failed **60 tests in 15 files**, with 66 distinct normalised texts (digits collapsed).

| File | Tests that would fail |
|------|----------------------:|
| core.test.mjs | 22 |
| auras.test.mjs | 13 |
| more.test.mjs | 8 |
| tooltip.test.mjs | 4 |
| report.test.mjs | 3 |
| plates, profiles, windows-map, windows-menus, lua-engine, auctionapi, feedback, frames, fallbacks, skins (one each) | 10 |

**Classification (MEDIUM: judged from test names and error text):**
- About **43 tests are tests of error or fallback handling** and need a marker: core about 18, auras about 12, report 3, tooltip 1, more 2 (`NoSuchTemplate`, `TEST-ONLY skin failure`), plates 1, and one each in auctionapi, feedback, lua-engine, fallbacks, skins.
- About **17 tests carry errors nobody asked for**, from these root causes (fix at the cause, no marker):

| # | Root cause | Evidence | Tests | Fix |
|---|-----------|----------|------:|-----|
| R1 | Fixtures replace `Enum` instead of extending it, so `Core/AuraEngine.lua:122` (`Enum.CustomAuraButtonDispelTypeTextureStyle.PreserveAsset`) indexes nil (`debuff type colors`, `aura icon extras`) | tooltip.test.mjs:11, frames.test.mjs:8, core.test.mjs:406, more.test.mjs:1116-1162 | about 8 (tooltip 4, frames 1, more 2, core 1) | `Enum = Enum or {}` in the fixtures |
| R2 | A test-local `hooksecurefunc` handles one overload only; modules `Chat`, `ChatExtras`, `Tooltips` fail to enable with `attempt to index a string value (local 't'/'a')` | core.test.mjs:161, the boss-frame fixtures in more.test.mjs | 4 (core 2, more 2) | make the fixture accept `(name, fn)` and `(table, name, fn)` |
| R3 | `Modules/ChatExtras.lua:143` calls `hooksecurefunc` without a `type(hooksecurefunc)` guard; `ChatExtras.lua:66` calls `registry:RegisterCallback` without a method check | three tests set `hooksecurefunc = nil` (`profiles`, `windows-map:413`, the Edit Mode case in `more`); `windows-menus` lacks `RegisterCallback` | 4 | addon fix: add the guards (or `ns.Hook`) |
| R4 | The AFK-screen fixture strips `UnitClass`/`UnitName`; UnitFrames, ComboPoints, ClassBars, SwingTimer, InfoStrip and Inventory fail to enable | `more.test.mjs` "the AFK screen: ..." | 1 | stub the globals, or mark it if "left out" is the point |
| R5 | Capability probe with `Enum` removed: `module UnitFrames: wow-world.lua:469: attempt to index a nil value (field 'PowerType')` although the case title says every module still enables | `core.test.mjs` "client capability probe: every flag off..." | 1 | likely a real fragility in `Modules/UnitFrames.lua`, or the fixture |
| R6 | `aura containers (using Vanguard's own icons): ...: CreateFrame: unknown frame type AuraContainer`: the addon reports a probe refusal as an error on any client without the engine | 12 tests in plates, auras, core (inside the 43 above) | 12 | decision: Open Question 1 |

None of the 66 texts comes from a hook, click or timer (they are not wrapped yet), and none is on an auction, vendor or bag money path. Counting root causes rather than texts, there are five non-deliberate causes plus the R6 decision: **under the D-04 stop threshold of about 20**. No single fix is large (R1 and R2 are fixture edits, R3 two guards).

**Not simulated:** the effect of D-03 itself (a stub-level wrapper that mimics `ns.Guard`). That needed temporary edits to three tracked stub and harness files; the run was blocked by the permission classifier, so I reverted the edits at once and confirmed `git status` showed only `?? .scratch-guard/`. The claim that D-03 exposes few new failures rests on the stub semantics in Q2 (Assumption A6), not on a run.

**Blind spots of this simulation:** end-of-test read only (no cap or `ClearErrors` harvest; the tests that call `ns.ClearErrors` are all in files already flagged); errors scheduled for a next frame the test never advanced; the vitest used is 5.0.2, the lockfile says 5.0.3.

### Q6. Validation architecture

See the `## Validation Architecture` section below.

### Q7. Flaky tests and shuffle (CI-03)

**Evidence of flakiness:**
- Historical and load-induced: `vitest.config.mjs:35-39` records that the first CI run "timed out the first case of several files at 30 s while every worker started at once on a shared machine"; CI now uses `testTimeout: process.env.CI ? 120_000 : 30_000`. Phase 1 recorded no flaky case (`01-01-SUMMARY.md`: "No flaky case was observed or reported by the user").
- Determinism sources checked: no `Math.random`, `Date.now`, `new Date` or `performance.now` in `scripts/tests/` or `lua-harness.mjs`; no `math.random` in `Core/` or `Modules/`; the Lua clock is the stub's own (`stub.now`, moved only by `stub.update`). Each test builds a fresh Lua state. Shared JS state is `chunkCache` (immutable bytes keyed by file stamp) and `let nextLine` in `chatwatch.test.mjs:22` (a unique line-id counter, order-safe).
- **Order dependence found (the only one):** a full local shuffled run (`VG_SHUFFLE_SEED=20261010`, files and tests shuffled, 197.8 s) ended `Test Files 1 failed | 65 passed (66)`, `Tests 6 failed | 867 passed (873)`. All six failures are `scripts/link-wow.test.mjs` (the second "link:wow" block), e.g. `ENOENT: no such file or directory, unlink '...\TEST-ONLY Forever\Interface\AddOns\Vanguard'`. Cause: its header says "The cases share that folder and run in this order", and the `AddOns` folder is created by the case "game folder problems" (`fs.mkdirSync(L.addonsDir(wow), { recursive: true })`), which the later cases need. Every Lua-harness case passed shuffled. D-05 says fix at the cause: give each case its own setup.

**Vitest shuffle in this repo's setup:**
- Options in 5.0.2: `--sequence.shuffle` (or `.files` / `.tests`) and `--sequence.seed <n>`. The default reporter prints `Running tests with seed "N"` when shuffling `[VERIFIED: vitest --help --sequence; dist/chunks/index.C-uw7tH9.js:14038-14039]`. The seed defaults to `Date.now()` (`:14601`), and `shuffle(array, seed)` is a deterministic function of the seed (`run.C5UmxDPh.js:9-20`).
- Projects: `vitest.config.mjs` defines two inline projects with `extends: true` (`name: "quick"`, `name: "lua"`), so a root-level `test.sequence` applies to both. Verified with a scratch copy of the config.
- The seed fixes the order within a file and the file queue, not the interleaving across workers (`maxWorkers = os.availableParallelism()`). Every file is isolated, so this does not matter; say so in the job summary.

**What a weekly shuffled workflow needs:**
1. `vitest.config.mjs` reads `VG_SHUFFLE_SEED` (sketch above). `scripts/coverage-lua.mjs` spawns vitest with `env: { ...process.env, LUA_COVERAGE: "1", LUA_COVERAGE_HITS: hits }`, so the variable flows through `npm run coverage` unchanged. Coverage hits are dumped per file in `afterAll` (setup.mjs) and do not depend on order.
2. `lua-suite.yml` (a `workflow_call` workflow whose only input today is `preview`) gets a boolean input `shuffle` and a step before `npm run coverage` that picks and prints the seed:
```yaml
      - name: Pick and print the shuffle seed
        if: inputs.shuffle
        run: |
          seed=$(date +%s)
          echo "VG_SHUFFLE_SEED=$seed" >> "$GITHUB_ENV"
          echo "Shuffled run, seed $seed. Replay: VG_SHUFFLE_SEED=$seed npm test" | tee -a "$GITHUB_STEP_SUMMARY"
```
3. `full-suite.yml` passes `shuffle: ${{ github.event_name == 'schedule' }}` so only the Sunday run is shuffled and PR, dispatch and release runs are not (D-05). An optional `workflow_dispatch` input `seed`, passed through an `env:` variable and never interpolated into the `run:` script, would let a failure be replayed on the runner.
4. Planner decision (Open Question 3): reuse the existing weekly slot (no extra Actions minutes; the existing `report` job already opens or comments on the `ci-failure` issue, which then covers shuffle failures) or add a second weekly workflow (isolates shuffle failures, doubles minutes; the memory notes say Actions minutes are budgeted). Recommend reuse.
5. Nothing here can run on the hosted runner (billing block). Verify locally: the YAML parses, the config prints the seed, and `VG_SHUFFLE_SEED=<n> npm run test:quick` is green for three seeds after the `link-wow` fix. The first green hosted shuffled run stays open by D-05.

## Runtime State Inventory

Not a rename, refactor or migration phase. Omitted per the template rule.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A restricted call (PostItem, PlaceBid, CancelAuction) made inside `xpcall` from a click handler keeps its hardware-event status in the real client | Pitfall 6 | High: auction Post, Buy and Cancel would stop working in game. Needs an in-game check before release |
| A2 | The game's `xpcall` passes extra arguments to the called function (`xpcall(fn, handler, ...)`) | Pattern 1 | Low: `ns.Try` already relies on it (`Events.lua:155`) and ships |
| A3 | `debugstack` exists in the 12.1/Forever client, and a test-only stub copy is acceptable under the Phase 1 policy | Pitfall 1 | Low: the addon feature-detects it. A name list left in an earlier session's scratch folder contains `debugstack`; its origin is unverified |
| A4 | Per-call overhead of a guarded hook is negligible in game (a few function calls) | Q3 | Medium: a hot hook (SetPoint, AddMessage) could cost frame time. Measure with `/vg perf` in game |
| A5 | The end-of-test read plus the `ns.ClearErrors` harvest is enough; the cap blind spot only affects marked tests | Pitfall 2 | Low: a metatable tap closes it |
| A6 | D-03 exposes few or no new test failures because the stub already propagates handler errors | Q2, Q5 | Medium: the simulation was blocked. If wrong, a handful more tests turn red when sites are converted; D-04 still caps the response |
| A7 | The 43 / 17 split of the 60 tests is right | Q5 | Low: the planner reads each test when adding markers; causes R1 to R5 are verified in code |
| A8 | The Actions YAML snippet is correct and `schedule` can carry the input as written | Q7 | Low: cannot be run on the hosted runner |
| A9 | Vitest 5.0.3 (lockfile) behaves like 5.0.2 (installed) for `sequence` and the seed line | Q7 | Low |

## Open Questions

1. **Is the AuraContainer probe refusal an "error"?**
   - What we know: on any client without the engine, `Core/AuraEngine.lua:57` reports `aura containers (using Vanguard's own icons): ...` through `ns.Try`, so it lands in `ns.errors`, and 12 tests carry it. If Forever lacks `AuraContainer`, players would see the error badge on every login.
   - What's unclear: whether Forever has the engine (needs an in-game check) and whether the author wants a fallback notice to count as an error.
   - Recommendation: keep it and mark the 12 tests (smallest choice, D-01); put "does Forever show the error badge at login?" on the PR's in-game list; a notice channel separate from `ns.errors` is a later change.
2. **Extend `ns.Guard` to the other scripts?** 102 `SetScript` handlers other than OnClick and OnUpdate, and 54 `HookScript` calls, are unguarded. D-03 names only hooks, OnClick and raw timers. Recommendation: do exactly D-03, record the rest as a follow-up (the stub already propagates those errors to tests).
3. **Weekly shuffle: reuse the existing Sunday run or add a second one?** See Q7 item 4. Recommend reuse.
4. **Add a default `debugstack` to the stub?** It gives every failure message a real stack but touches `wow-world.lua`. Recommend yes, as a separate task after the guard is green.
5. **A tap on `ns.errors` instead of the harvest wrapper?** It closes the cap blind spot for marked tests at the cost of a metatable in harness Lua. Recommend not now.
6. **Add the static code-quality rule for bare hooks, clicks and timers?** Recommend yes: it is the only automated proof of D-03 completeness and a guard against regressions.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all scripts and tests | yes | v24.14.0 | none needed |
| vitest | tests, shuffle | yes | 5.0.2 installed in `C:\Workspace\wow-vanguard-ui\node_modules` (lock: 5.0.3) | run from the worktree: Node resolves `node_modules` from the parent folder, so no `npm ci` was needed |
| luacheck, luac5.1 | `npm run lint`, CI Lua 5.1 syntax check | yes | `/c/tools/lua/luacheck`, `/c/tools/lua/luac5.1` | CI installs them |
| GitHub-hosted runner | the first green shuffled run, Phase 3 timing | no (billing block) | n/a | verify config and YAML locally; the hosted shuffled run stays open (D-05) |

**Missing dependencies with no fallback:** none for planning or implementation.
**Missing dependencies with fallback:** the hosted runner (above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (lockfile), two projects `quick` and `lua` (`vitest.config.mjs`) |
| Config file | `vitest.config.mjs`; setup file `scripts/tests/setup.mjs` |
| Quick run command | `npm run test:quick` (JS tests + `smoke.test.mjs`, about 10 s) |
| Full suite command | `npm test` (66 files, 873 tests, about 3.5 minutes on 16 threads); gate: `npm run verify` and `npm run coverage` |

### Phase Requirements -> Test Map
| Req ID | Success criterion | Behavior | Test Type | Automated Command | Expected | File Exists? |
|--------|-------------------|----------|-----------|-------------------|----------|-------------|
| CI-04 | SC1 | An unexpected entry fails the test and the message names text, count, stack | unit (pure functions) | `npx vitest run scripts/error-guard.test.mjs` | all pass; `judge()` returns a message containing the text for an unmarked entry, `""` for a matching marker, a message for a never-matched marker | Wave 0 |
| CI-04 | SC1 | The registry is drained and a real addon's error is seen | integration | `npx vitest run scripts/tests/errorrail.test.mjs` | passes; the case that plants `ns.Report("TEST-ONLY rail", "x")` carries `expectErrors("TEST-ONLY rail: x")` | Wave 0 |
| CI-04 | SC1 | No exemption list in `setup.mjs` | static | `grep -nEi "exempt|allow|skip" scripts/tests/setup.mjs` | no output | n/a |
| CI-04 | SC2 | A throwing `hooksecurefunc` callback, `OnClick` handler and `C_Timer` callback each land in `ns.errors` with the right label | integration (Lua) | `npx vitest run scripts/tests/errorrail.test.mjs` | passes; asserts entries `hook ...`, `click ...`, `timer ...` after `addon.click` and `addon.advance` | Wave 0 |
| CI-04 | SC2 | `ns.Guard` returns a non-function unchanged | integration (Lua) | same file | passes (covers the nil branch) | Wave 0 |
| CI-04 | SC2 | Every site converted | static | `npm run quality` (new rule), and the two greps below | quality exits 0; both greps print nothing | rule: Wave 0 |
| CI-04 | SC4 | Guard on, suite green, no exemptions, errors fixed in the addon | full | `npm test` | `Test Files 66+ passed`, `Tests 873+ passed`, exit 0 | exists |
| CI-04 | SC4 | A stale marker cannot survive | full | `npm test` | green (a marker that matches nothing fails its own test) | n/a |
| CI-04 | SC4 | Coverage floor holds | full | `npm run coverage` | prints the report with total 100.00% and exit 0 | exists |
| CI-04 | SC4 | Code-quality scan | static | `npm run verify` | exit 0 | exists |
| CI-03 | SC3 | The config shuffles from the env var and prints the seed | smoke | `VG_SHUFFLE_SEED=4242 npx vitest run --project quick` | output contains `Running tests with seed "4242"`; exit 0 | after config edit |
| CI-03 | SC3 | The same seed gives the same order | smoke | run the line above twice with `--reporter=verbose` | identical test order | n/a |
| CI-03 | SC3 | JS tests are order independent (the `link-wow` fix) | smoke | `VG_SHUFFLE_SEED=1 npm run test:quick`, then seeds 2 and 3 | exit 0 each time | after fix |
| CI-03 | SC3 | The whole suite is order independent (local, optional) | full | `VG_SHUFFLE_SEED=20261010 npm test` | `Test Files 66+ passed`, exit 0 | after fix; about 3.5 min |
| CI-03 | SC3 | The weekly workflow shuffles and prints the seed; the PR run does not | static | `grep -n "shuffle\|VG_SHUFFLE_SEED" .github/workflows/*.yml vitest.config.mjs` | `full-suite.yml` sets `shuffle` only for `schedule`; `lua-suite.yml` writes the seed to `GITHUB_ENV` and the step summary | after edit |
| CI-03 | SC3 | The first green hosted shuffled run | CI | not runnable (billing block) | stays open by D-05; do not claim it | n/a |

Completeness greps for SC2 (run from the repo root; the second is a coarse line check, the code-quality rule is the real gate because callbacks can start on the next line):
```bash
grep -rnP "(?<!type\()hooksecurefunc\(" Core Modules | grep -v "ns.Guard"
grep -rnE "C_Timer\.(After|NewTimer|NewTicker)\(" Core Modules | grep -v "ns.Guard"     # only Core/Combat.lua:118 may remain
```

### Sampling Rate
- **Per task commit:** `npx vitest run <the touched area test file>` plus `npm run test:quick`; for a harness or `Core/Events.lua` change add `npx vitest run scripts/tests/core.test.mjs scripts/tests/errorrail.test.mjs`.
- **Per wave merge:** `npm test`.
- **Phase gate:** `npm run verify` and `npm run coverage` green, plus the SC3 smoke commands; then `/gsd-verify-work`.
- **Negative control (once, by hand, recorded in the summary):** temporarily make one hook callback `error("TEST-ONLY control")`, run its area test and `npm run test:quick`, see the test go red with the entry text printed, then revert. It proves SC1 and SC2 bite end to end.

### Wave 0 Gaps
- [ ] `scripts/lib/error-guard.mjs`: `expectErrors`, `caught`, `judge`, `check`
- [ ] `scripts/error-guard.test.mjs`: covers CI-04 SC1 (pure functions; picked up by the `quick` project through `scripts/*.test.mjs`)
- [ ] `scripts/tests/errorrail.test.mjs`: covers CI-04 SC2 (`ns.Guard` on a hook, a click, a timer, a nil callback)
- [ ] `scripts/tests/setup.mjs` global `afterEach`; the `createAddon` registry and `ns.ClearErrors` harvest in `scripts/lib/lua-harness.mjs`; the re-export in `scripts/tests/helpers.mjs`
- [ ] Code-quality rule and its tests in `scripts/code-quality.test.mjs` (recommended)
- [ ] `vitest.config.mjs` shuffle block; `link-wow.test.mjs` made order independent
- Framework install: none.

## Security Domain

`security_enforcement` is enabled in `.planning/config.json` (`security_asvs_level: 1`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a (no accounts) |
| V3 Session Management | no | n/a |
| V4 Access Control | partly | Protected frames: nothing protected in combat (`ns.OutOfCombat`); the guard must not change when a handler is installed, only how it runs |
| V5 Input Validation | yes | An error from the game may be a secret value; keep using `errorText()` / `ns.IsSecret` (`Events.lua:59-62`); the harness reads only the already-built `text` string |
| V6 Cryptography | no | n/a |
| V7 Error Handling and Logging | yes | Errors go to `ns.errors`, chat once, and the game's handler; no secrets in the message; the guard prints `text` and `stack` only to the test log |
| V14 Configuration (CI) | yes | Workflows keep `permissions: contents: read`; the seed comes from `date +%s`; a dispatch `seed` input goes through `env:`, not an inline `${{ }}` in `run:` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A hook error text containing a secret value | Information disclosure | `errorText()` replaces a hidden error with `(a hidden error message)`; do not change it |
| A guarded click handler running restricted calls outside a hardware event | Tampering / elevation of the addon's own protected actions | Keep the wrapper synchronous in the same call stack; verify in game (A1) |
| A workflow input injected into a shell step | Tampering | Pass inputs through `env:` and quote variables |
| An error-reporting loop (a handler fails inside the handler) | Denial of service | Already handled by the `forwarding` flag (`Events.lua:34, 92-97, 134-142`); keep routing through `ns.Try` |

## Sources

### Primary (HIGH confidence)
- Repo files read this session (in full or in the cited ranges): `Core/Events.lua`, `Core/Combat.lua` (60-120), `scripts/lib/lua-harness.mjs`, `scripts/lib/wow-world.lua` (120-300, 1289-1330), `scripts/lib/wow-stub.lua` (385-400, 526-545, 785-850), `scripts/tests/setup.mjs`, `scripts/tests/helpers.mjs` (1-120), `scripts/tests/smoke.test.mjs`, `vitest.config.mjs`, `scripts/coverage-lua.mjs`, `scripts/lib/code-quality.mjs` (1-60), `scripts/link-wow.test.mjs`, `.github/workflows/{full-suite,lua-suite,verify}.yml`, `.luacheckrc`, `Vanguard.toc`, `CLAUDE.md`, `.planning/phases/02-errors-fail-tests/02-CONTEXT.md` and `02-DISCUSSION-LOG.md`, `.planning/ROADMAP.md`, `REQUIREMENTS.md`, `research/PITFALLS.md` (Pitfall 2), `research/ARCHITECTURE.md` (event rail), `codebase/TESTING.md`, `phases/01-green-baseline/01-01-SUMMARY.md`.
- Vitest 5.0.2 as installed: `vitest --help --sequence`; `dist/chunks/index.C-uw7tH9.js:14038-14039, 14601, 13358`; `dist/chunks/run.C5UmxDPh.js:9-20, 4054`.
- Runs this session: the unshuffled full suite with a simulated guard (66 files, 873 tests passed, 217.5 s); the full suite shuffled with seed 20261010 (1 file, 6 tests failed: `link-wow.test.mjs`); small shuffled runs with seeds 4242 (twice) and 7; a scratch test showing a throwing `afterEach` fails its test with a multi-line message.

### Secondary (MEDIUM confidence)
- Counts by `grep -rn`, `grep -rhoE` and a PCRE `-o` search over `Core/` and `Modules/`; the commands are reproducible from Q1 and the Validation table.

### Tertiary (LOW confidence)
- A global-API name list left in an earlier session's scratch folder (it contains `debugstack`, `geterrorhandler`, `hooksecurefunc`, `C_Timer.After`): origin not verified; used only for Assumption A3.
- Anything about the real client (hardware-event status inside `xpcall`, per-call cost): training knowledge, not observed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from the lockfile and `node_modules`.
- Architecture: HIGH for the harness and stub (read and exercised); MEDIUM for the `ns.Guard` shape (design, not built).
- Pitfalls: HIGH for the shuffle and fixture findings (reproduced); LOW for the in-game ones (A1, A4).

**Research date:** 2026-10-10
**Valid until:** 2026-11-09 (the repo moves with each merged PR; re-run the Q1 greps before planning if more than a few commits land first)
