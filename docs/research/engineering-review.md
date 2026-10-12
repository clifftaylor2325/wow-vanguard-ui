# Engineering review

A research spike (2026-10-12), not a build. No code was changed. The question was: from a software engineering view, what can be done better in this repo before and after launch (freeze Oct 28, launch Nov 4)?

This builds on `docs/research/code-quality-checks.md` (issue #267, PR #268), which covers lint, scanners, coverage and hooks. It does not repeat that. It looks at architecture, the error and event layers, the DB layer, the test harness, CI cost, doc drift and the hard rules themselves.

Scope respected: no file splits are proposed (Cliff's rule before launch). Where a large file matters, it is noted only.

Evidence base: Core/ (12.1k lines) and Modules/ (25.6k lines) read in the areas named; `scripts/lib/*` and `scripts/tests/README.md`; `vitest.config.mjs`; all five workflows; CLAUDE.md, README.md, `.planning/`. Run on 2026-10-12: `npm run quality` (1.3 s). CI timings come from GitHub run records. Nothing here was observed in the game. Where a claim is about how the real client behaves, it says so.

## Summary

The codebase is in better shape than its size suggests. The error layer (`ns.Try`/`ns.Guard`/`ns.Report`), the taint side tables, the combat queue and the test harness are well designed and consistently used. Every `ns.GetModule("X")` name in the code resolves to a registered module. Command help, `COMMANDS` and the README agree closely. The weak points are at the edges of what the safety net can see:

1. The harness models secret values in a way that may let real-client errors pass (F1).
2. CI is far slower than the plan's own target and runs duplicate work (F2).
3. Errors outside the guarded call types never reach `/vg errors`, the thing testers will paste (F3).
4. Planning docs have drifted and now say things that are not true (F4).
5. The 10-line rule plus line-based coverage pushes logic into very long lines (F5).

## Findings, ranked

Impact is the damage if left alone, in terms of launch week. Effort is S (under an hour), M (a few hours), L (a day or more).

| # | Finding | Impact | Effort | When |
|---|---------|--------|--------|------|
| F1 | Harness secret values are plain tables, not faithful to the client | High | M | Pre-launch |
| F2 | CI: full suite ~9 min against a 5 min goal; duplicated steps; preview on every PR | High (cost) | S | Pre-launch |
| F3 | Many handlers are outside `ns.Guard`; `/vg errors` has blind spots | Medium | S | Pre-launch |
| F4 | `.planning/STATE.md` and `CONCERNS.md` are stale and contradict `ROADMAP.md` | Medium | S | Pre-launch |
| F5 | The 10-line rule and line coverage reward very long lines | Medium | M | Post-launch [DECIDE] |
| F6 | Core reaches into Modules by name; hidden TOC-order dependencies | Medium | S to M | Mixed |
| F7 | DB layer: silent type coercion, direct `VanguardDB` access outside the layer | Medium | S | Mixed |
| F8 | Harness is Lua 5.3, game is Lua 5.1 | Low to medium | M | Post-launch |
| F9 | Line coverage hides branches; one coverage definition for everything | Low to medium | M | Post-launch |
| F10 | Theme.lua is at 118 of 200 top-level locals | Low | S | Note only |
| F11 | `verify` + `coverage` run the whole suite twice | Low (dev cost) | S | Pre-launch |

### F1. The harness's "secret" is a plain table

Where: `scripts/lib/wow-world.lua:17-27`; guards in `Core/Combat.lua:62-70`.

What: `world.secret(n)` returns `{ __secret = true, n = n }`, and `issecretvalue` is true for that table. The comment says the same mistakes fail. Some do: arithmetic, `<`, and `..` on a table error in Lua just as they would on a secret. But there is no metatable (grep for `__lt`, `__add`, `__concat`, `__index` in `scripts/lib/` finds nothing relevant). Three differences follow:

- `type(secret) == "number"` is false in the harness. As I understand the 12.x API notes, a real secret keeps its type, so a guard like `type(v) == "number" and v > 0` passes in the harness and could still error in game. `ns.PlainNumber` checks `ns.IsSecret` first, which is right, but nothing enforces its use.
- Indexing (`v.n`) and `==` do not error in the harness.
- `tostring`, `string.format` and `#` behave differently.

Why it matters: priority 1 of the project is "no secret-value reads". The harness is the only check, and CLAUDE.md says nobody can run the game. A wrong harness gives false confidence that no one can correct before testers hit it. `ns.PlainNumber` appears 270 times, so the pattern is mostly followed; the risk is in the remaining paths.

Recommendation:
1. Give the harness secret a metatable that raises on arithmetic, comparison, concat, index, length and call, with a message naming the operation. (Effort M; touches `wow-world.lua` and the tests that expect secrets.)
2. Add `type(secret)` fidelity as an open question in the batch-1 probes (#284): confirm in game what `type()` returns for a secret number. Record the answer in `docs/design/` and `wow-world.lua`.
3. Report-only scanner rule (in the style of #263): a raw comparison on the direct result of a unit, aura or cooldown API call that does not pass through `ns.PlainNumber`. Start report-only and ratchet.

This overlaps issue #244 (harness secret and taint simulation). [DECIDE]: fold this into #244, or keep as a separate issue.

### F2. CI cost and shape

Where: `.github/workflows/verify.yml`, `full-suite.yml`, `lua-suite.yml`; `.planning/ROADMAP.md:26`.

Observed (GitHub run records, 2026-10-12): `verify` (Quick checks) takes about 47 s. The `full suite` run for PR #289 took 8 min 52 s (15:54:19 to 16:03:11). Phase 3's goal in the roadmap is "under 5 minutes on the hosted runner". It was ticked complete on 2026-10-11; the run on 2026-10-12 is nearly double that.

Causes visible in the files:
- `lua-suite.yml` repeats the Quick checks job: luacheck install (with `apt-get update`), quality scan, TOC check, `luac -p` loop, release zip. These all just ran in `verify`. On a ready PR both workflows start, so those steps are billed twice.
- `preview` defaults to true for every non-dispatch run (`full-suite.yml`, `preview: ${{ github.event_name != 'workflow_dispatch' || inputs.preview }}`). It is a second job with `playwright install --with-deps chromium`. Most PRs do not change visuals.
- The suite runs on `opened` and `ready_for_review`, then again on every push once the `full-tests` label is on, and the weekly schedule runs it shuffled.
- The raid benchmark runs on every full run.

Recommendation (all small):
1. When called from a pull request, `lua-suite.yml` skips the steps `verify` already did (an `if: github.event_name != 'pull_request'` or an input). Keep them on schedule and release.
2. Make `preview` run only on the weekly schedule, on release, on `workflow_dispatch`, or when a PR has a `preview` label. Today's default is every ready PR.
3. Measure first: add per-step timing to the job summary (the harness already has `scripts/suite-timing.mjs`) so the 9 minutes are explained before cutting. I did not have per-job timings for the full run; the 8:52 is wall-clock for the workflow.
4. Update the Phase 3 claim: either hit 5 minutes or restate the target. [DECIDE]
5. Consider a path filter inside the job for the full suite (skip when only `scripts/` docs or `.planning/` changed). `full-suite.yml` already uses `paths-ignore` for `docs/**` and `**.md`, so `.planning/*.md` is covered; JSON under `.planning/` is not.

The required-check design (no path filter on the required check, docs-only logic inside the job) is sound and well documented. Keep it.

### F3. Errors outside the guarded call types are invisible to `/vg errors`

Where: rule 4 in `scripts/lib/code-quality.mjs:11-14`; `Core/Slash.lua:571-577`.

The scanner requires `ns.Guard` on `hooksecurefunc`, `SetScript("OnClick")` and `C_Timer` callbacks only. Counting in `Core/` and `Modules/`:

- 61 `HookScript(` calls without `ns.Guard` (11 with it).
- About 100 other `SetScript("On...")` calls without it: `OnEnter` 24, `OnLeave` 24, `OnMouseWheel` 12, `OnKeyDown` 9, `OnUpdate` 8, `OnMouseDown` 5, `OnEnterPressed` 5, and a tail.
- `handleSlash` calls the handler bare, so an error in any `/vg` subcommand goes only to the game's popup.
- `OnUpdate` handlers (such as `Modules/PowerTicks.lua:45`, `Modules/CastBars.lua:147`) are the ones that fire every frame, so a failing one would repeat.

The docs say "an error in one module, skin, event handler, after-combat update, hook on a game function, button click or timer is kept here" (README `/vg errors`). That is true for those kinds. It is not true for the rest. In tests this does not hide anything: the stub has no `pcall`, so an unguarded error throws into the test and fails it. The gap is for testers in game: an `OnEnter` error appears in their popup or error addon but not in `/vg errors`, which is what the report flow asks them to paste.

Recommendation:
1. Wrap `handleSlash` in `ns.Try("slash", ...)`. One line.
2. Extend rule 4 to `HookScript` on game frames and to `OnUpdate`, `OnEvent`, `OnShow`, `OnHide`. Start report-only with a baseline (the machinery from #263 exists) because retrofitting ~160 sites in one go is a large diff this close to freeze.
3. Measure the cost of guarding `OnUpdate`: `ns.Try` adds an `xpcall` and a varargs pass-through per call (`Core/Events.lua:172-176`). `scripts/bench.mjs` can show whether it matters in a raid.

Note a related point: every event handler runs under `ns.Try` (`Core/Events.lua:228-233`), so one `UNIT_AURA` for 40 raid members costs 40 xpcalls per handler. The unit-event path (`ns.OnUnit`) already narrows who is called. This is a measurement item, not a defect.

### F4. Planning and concern docs have drifted

Where: `.planning/STATE.md:2-5`, `.planning/codebase/CONCERNS.md`, `.planning/ROADMAP.md`.

- `STATE.md` says current phase 4, status planning, 25% progress, last activity 2026-10-11. `ROADMAP.md` shows Phases 4, 6, 7, 8, 9 and 10 complete on 2026-10-12.
- `CONCERNS.md` (2026-10-09) says seven full-suite cases are red on main and that `npm run coverage` cannot confirm the floor. Phase 1 closed that on 2026-10-09 per the roadmap. It also quotes `Core/Theme.lua (1298 lines)`; it is 1721 now. It quotes `Core/Options.lua (898)`; it is 435 lines (it was split into `Options*.lua` files).
- CLAUDE.md tells agents to read `docs/handoff/` plans that "refer to the old repo name"; `CONCERNS.md` lists the same plans as stale.

Why it matters: this repo is worked on by agents that read these files first. Stale state sends them to the wrong phase or tells them the suite is red.

Recommendation: a Haiku-sized housekeeping pass: refresh `STATE.md` from `ROADMAP.md`, regenerate or delete `CONCERNS.md` figures that are counts (counts rot; link to a command instead), and archive finished `docs/handoff/` plans into one `docs/handoff/ARCHIVE.md` or delete. Tie it into the existing "tick the plan in the same commit" rule: add `STATE.md` to that rule. Effort S.

What is not drifting: `Vanguard.toc` version equals the README's; every command in `COMMANDS` is in the `HELP` table except aliases and grouped entries (`config`, `options`, `move`, `enable`/`disable`, `lock`, `snap`, `help`), and the README command block has every `/vg` command except `talents`, which the README documents in the Talent planner section. A cheap test that diffs the three lists would keep it that way (S, post-launch).

### F5. The 10-line rule and line coverage reward long lines

Where: `scripts/lib/code-quality.mjs` (rule 1), `.luacheckrc` (`max_line_length = false`), `scripts/lua-coverage-floor.json`.

The rule counts lines of code in a function, and coverage counts lines hit. Both measure lines, and nothing bounds line length. Result in `Core/` and `Modules/`: 114 lines longer than 160 characters, 8 longer than 250. Examples: `Modules/AfkScreen.lua:24` (516 chars), `:28` (381), `Core/Slash.lua:42` (335), `Modules/ClickCastSpells.lua:33` (333), `Modules/TalentPlanner.lua:726` (291). `Core/Slash.lua:543` puts a four-statement function on one line.

What helps: the rule keeps functions small and forces a comment above each one, which makes the files easy to skim and the units easy to test. Across the 72 test files and a 100% floor it has clearly paid for itself in stability.

What hurts: a function that is 10 lines of logic or 1 line of the same logic scores the same on both gates. Coverage is the worse offender: `a and f() or g()` on one line is "covered" when either branch runs. The combination pushes the compression the rule was meant to prevent.

Recommendation, post-launch [DECIDE]: count statements instead of physical lines in the scanner, or cap line length (200 is enough to leave 99% of the code untouched, and `luacheck` already supports `max_line_length`). Do not change this before freeze: it would touch dozens of files.

### F6. Core reaches into Modules; module order is implicit

Where: `Core/Modules.lua:12-24, 54-60`; `Modules/PowerTicks.lua:14`, `ComboPoints.lua:10`, `PlayerAuras.lua:14`; `Core/Slash.lua:541-560`; `Core/Options.lua:20-30`.

- `ns.GetModule("X")` is used by name in 176 places, 64 of them in Core (Slash, Options*, Setup, Perf, ProfileStrings). Core depends on Modules by string.
- Modules start in TOC order (`order` in `Core/Modules.lua`). Three files call `ns.GetModule("UnitFrames")` at file load time, which only works because `Modules/UnitFrames.lua` is listed before them in the TOC (`Vanguard.toc:67` and `:73`). Nothing declares or tests this. `check-toc.mjs` checks files exist and are listed, not order.
- 18 uses of `GetModule("UnitFrames")` and 17 of `AuctionHelper` make those two the de facto platform APIs of the addon. `Modules/Tooltips.lua:84` and `InfoStrip.lua:434` dereference the result with no nil check.
- Positive: all 56 registered names match every literal use today. Not enforced.

Recommendation:
1. Add a test (S) that extracts every `GetModule("literal")` and asserts a module with that name is registered, and that load-time `GetModule` calls only name modules listed earlier in the TOC. Pre-launch, because a rename or reorder is the likeliest way to break the build late.
2. Post-launch: give shared services (UnitFrames helpers, AuctionHelper helpers) a `ns.<Service>` table of their own instead of reaching through the module registry, and let `ns.Module` take `needs = { "UnitFrames" }` so load order is declared. Not a split; a naming change.

### F7. DB and profile layer

Where: `Core/DB.lua:9-20, 90-120`; `Core/Setup.lua:546, 657-698`; `Core/Options.lua:341`; `Core/ProfileStrings.lua:257`.

- `fill()` replaces a saved value whose type differs from its default (`DB.lua:9-20`). This is documented ("a setting must not change type"), and it protects against corruption. The cost: a future change from number to string, or an imported string with a wrong-typed field, silently resets that setting. A setting with no default is never checked.
- Setup, Options and ProfileStrings read and write `VanguardDB` and `VanguardCharDB` directly (`Setup.lua:546`, `:657`, `:666`, `:697-698`; `Options.lua:341`; `ProfileStrings.lua:257`) instead of through `DB.lua` functions. The setup flag and `pickProfile` are the cases. Adding a field or renaming one means grepping the whole tree.
- `DB_VERSION = 2` with one registered step. The mechanism (`ns.UpgradeDB`, `ns.MigrateDB`, step runs under `ns.Try`, a failed step retries next login) is solid. `ns.Migrate(key, fn)` per-module upgrade is the second path; the two are easy to confuse.
- `ns.Settings(key, defaults)` is called from hot paths ("colour lookups on every bar update", comment at `DB.lua:~124`). It does `ns.Profile()` and `ns.ProfileName()` table lookups every call before the cache hit. Fine today; worth a bench line if a profile shows it.

Recommendation: wrap the few direct accesses (`ns.SetupDone()`, `ns.SetPickProfile()`, `ns.ProfileExists()`) so `DB.lua` is the only file that names the saved tables (S, any time). Settings-loss was already addressed by #206; also add a log line when `fill` replaces a wrong-typed value, so imports that lose data say so (S, post-launch).

### F8. Lua 5.3 harness, Lua 5.1 game

Where: `scripts/lib/wow-stub.lua:1-60`.

The harness uses fengari (Lua 5.3) with shims for number printing and `string.format`. CI also runs real `luac5.1 -p` (syntax only) and `luacheck` with `std = "lua51"` (rejects 5.3-only library functions). That closes most of the gap. What remains is semantic: integer vs float division and printing in paths the shims do not cover, `#` on tables with holes, `unpack`/`select("#")` edge cases, string patterns, `%d` with non-integers, `os.time`/`date`.

Recommendation: nothing before launch. Post-launch, run a handful of pure-Lua modules (`Core/Serialize.lua`, `Core/DB.lua`, the auction price math) under real `lua5.1` in CI, since CI already installs it. These have no frame dependencies.

### F9. Coverage is line-only

Where: `scripts/coverage-lua.mjs`, `scripts/lua-coverage-floor.json`.

100% line coverage with every error failing a test is a strong baseline. It cannot tell whether both sides of `and/or`, or both outcomes of a one-line `if`, ran (see F5). It also treats combat and secret variants as covered when only the calm variant ran. The project's rules about combat and secrets are exactly the branches line coverage misses.

Recommendation, post-launch: a combat-on and secret-on re-run of the smoke scenario already exists (`smoke.test.mjs`). Extend it to run each module's main path once in combat and once with secret values on, which targets the rules directly and is cheaper than branch coverage. This pairs with F1 and issue #244.

### F10. Theme.lua local count

`Core/Theme.lua` has 118 top-level `local` statements in 1721 lines and 164 functions. Lua 5.1 allows 200 locals per function and 60 upvalues per closure; the chunk is a function. Headroom is ~80 locals. CI's `luac -p` would catch overflow as a hard error, so it cannot ship, but it will fail a PR in the middle of theme work. Note only, per Cliff's no-splits rule: when adding to Theme, prefer fields on `T` over new top-level locals.

### F11. `verify` and `coverage` run everything twice

CLAUDE.md says a change is done after both `npm run verify` and `npm run coverage` pass. `verify` is `npm test && npm run quality`; `coverage` (`scripts/coverage-lua.mjs:23-27`) runs the complete Vitest suite again with hit counting. I started `npm run coverage` on a 4-core cloud box and stopped it at about 3 minutes, unfinished, so I have no clean timing; the point is that the whole suite runs twice in the definition of done. Replace the rule with "`npm run quality` and `npm run coverage`" (coverage already fails on any red test). One line in CLAUDE.md, no code. [DECIDE] since it changes the written definition of done.

## How the safety design measures up

Worth keeping and copying:

- `ns.Try` / `ns.Guard` / `ns.Report` (`Core/Events.lua:133-190`): one error format, de-duplication, a re-entrancy guard, and the game's own handler still receives the error with the real stack. Tests fail on any caught error unless it is named by `expectErrors`, which refuses broad patterns.
- `ns.FrameState` side tables (`Core/Events.lua:~22-35`) with a harness rule that fails the test when addon code writes a field on a game frame or replaces its script (`scripts/lib/wow-taint.lua`). This is the strongest taint control in the repo.
- Combat: `ns.OutOfCombat`/`ns.AfterCombat` share one ordered, keyed queue (`Core/Combat.lua:11-45`). The harness blocks protected calls in combat and fires `ADDON_ACTION_BLOCKED`.
- Events: copy-on-write handler lists (`Core/Events.lua:~196-215`), so unsubscribing inside a handler is safe; unknown events are skipped and reported rather than raising.
- Pinned, SHA-checked tooling in CI and a required check designed around the skipped-check pitfall.

What the rules cost: the "every function has a comment above it" rule is worth its weight; the code is readable cold. The 10-line limit gives many tiny helpers that read well, but see F5. The 100% floor is a good gate while the project is young; its meaning should be restated as "every line runs", not "every behaviour is verified".

## Developer workflow notes

- Scripts and the CI replay hint are Windows-aware (PowerShell variants in `vitest.config.mjs` and `lua-suite.yml`). Good.
- The pre-push hook runs `test:quick`, quality, TOC, luacheck and luac when installed. Good balance.
- Agents are the main developers. The most useful cheap improvements are those that give them cheaper feedback: F11 (one command instead of two), F2 (CI that reports where the time goes), and F4 (state that is true).
- The README holds single paragraphs of 1,000 to 2,000 characters on one line (for example `README.md:50`, `:57`, `:87`). They diff badly and are hard to review. A rewrap at sentence boundaries would help review without changing content. Low priority.

## Recommended next steps

### Before freeze (Oct 28)

1. F4: refresh `STATE.md`, fix or remove the stale numbers in `CONCERNS.md`, archive finished handoff plans. Haiku, low effort.
2. F6.1: add the module-name and load-order test. Sonnet, low.
3. F3.1 and F3.2: wrap `handleSlash` in `ns.Try`; add a report-only scanner rule for unguarded `HookScript`/`OnUpdate` with a baseline. Sonnet, low.
4. F2.1 to F2.3: drop the duplicated steps in the PR path of `lua-suite.yml`, make `preview` opt-in for PRs, add step timings. Sonnet, low. Saves the most CI minutes.
5. F1.1 and F1.2: give the harness secret a metatable and add the `type()` fidelity question to the batch-1 probes (#284). Opus is justified here (harness rules). Medium.
6. F11 [DECIDE]: change the definition of done to quality plus coverage.
7. F2.4 [DECIDE]: decide whether the 5 minute target stands or is restated.

### After launch

1. F5 [DECIDE]: statement-based or line-length-capped scanner rule.
2. F9: combat-on and secret-on re-runs of each module's main path.
3. F6.2: module `needs` declarations and service tables.
4. F7: wrap direct `VanguardDB` access; log wrong-typed resets.
5. F8: run pure-Lua modules under real `lua5.1` in CI.
6. F3.3: extend guard rule to every script type once launch-week errors show which matter.
7. A three-way test of `HELP`, `COMMANDS` and the README command block.
8. README rewrap.

## Open questions for Cliff

- [DECIDE] Fold F1 into issue #244, or track it separately?
- [DECIDE] Is "under 5 minutes" the CI target for the full PR suite, or is about 9 minutes acceptable given the minutes cap?
- [DECIDE] Replace "verify and coverage" with "quality and coverage" in CLAUDE.md?
- [DECIDE] After launch, change the 10-line rule's unit (statements, or a line-length cap)?

## Tools and practices that help agents write better code

Added 2026-10-12 at Cliff's request. The code-quality spike (`code-quality-checks.md`) already weighs luacheck, StyLua, selene and LuaLS as CI tools; this section asks a narrower question: what gives an agent better feedback while it writes, before CI sees the code? Nothing below is set up in the repo today (there is no `.claude/` directory, and no `---@` annotations in `Core/` or `Modules/`).

### Feedback inside the session (highest value, lowest cost)

1. **Claude Code hooks in `.claude/settings.json`.** A `PostToolUse` hook on Edit/Write that runs `npm run quality` and `luacheck <file>` on the file just changed gives the agent the 10-line, comment, colour and guard rules within seconds of writing, instead of at pre-push or in CI. The quality scan takes about 1.3 s for the whole tree, so this is cheap. This is the single most effective change for agent-written code: a rule the agent hears about at edit time is fixed in the same thought; one it hears about at push time costs a new cycle. Effort S. [DECIDE] since it adds a top-level folder (`.claude/`).
2. **Repo skills in `.claude/skills/`.** A skill is a short markdown playbook the agent loads when the task matches: "add a module" (the `ns.Module` skeleton, where settings go, the test file to copy, the README and `/vg help` lines to touch), "add a harness scenario", "fix a visual issue" (the `/vg frame` output, the smoke-test step). These encode the rules in CLAUDE.md as worked examples, which agents follow more reliably than prose rules. The project's "Working method" bullets are already most of the content. Effort S each. Same [DECIDE] as above.
3. **A `/code-review`-style pass before marking a PR ready.** Claude Code has a built-in review skill that reads the diff adversarially for correctness bugs. Asking for it once per PR (it is one line in the thread brief) catches the class of error the harness cannot: a wrong guard that still runs, a secret compared after a `type()` check, a handler registered twice. It costs tokens, not CI minutes.

### Making intent checkable

4. **LuaLS annotations as a contract, not a linter.** Even without running LuaLS in CI, `---@param unit string` and `---@return number|nil` on the `ns.*` helpers (`ns.PlainNumber`, `ns.Settings`, `ns.OnUnit`, `ns.FrameState`) tell an agent what a function accepts without opening the file. The 60-odd `ns` entry points are the whole surface a module author touches. Annotating only those is a few hours. When LuaLS `--check` is added later (the earlier spike's item 9), these annotations are what it checks against. Post-launch.
5. **A written `docs/PATTERNS.md`, or a section in CLAUDE.md.** CLAUDE.md states the rules; nothing shows the canonical shape of a module, a guarded hook, a secret-safe read or a combat-deferred update in ten lines each. Agents copy the nearest existing code, so the nearest code is the de facto standard; one short reference stops drift between modules. [DECIDE] because CLAUDE.md says no new docs unless asked.

### Lua and WoW practices worth stating (most are already followed)

- **Locals everywhere, globals never.** luacheck enforces this. Watch the 200-locals and 60-upvalues limits per chunk (F10).
- **No allocation in hot paths.** `OnUpdate`, `UNIT_AURA` and `UNIT_HEALTH` handlers should not build tables, closures or strings per call. Reuse a table, format text only when the value changed. `scripts/bench.mjs` is the place to prove it.
- **Cache the API locally in hot functions** (`local UnitHealth = UnitHealth` at file top) only where a profile shows it; it hurts readability elsewhere.
- **`pairs` order is undefined.** Anything the player sees sorted must sort explicitly. The harness happens to iterate like 5.3, the game like 5.1; a test can pass by luck.
- **Strings:** build with `table.concat` in loops, not `..`; `string.format("%d", x)` errors in 5.3 on a float and silently truncates in 5.1 (the stub already shims this).
- **Varargs:** `select("#", ...)` for counts, never `#{...}`, because nil holes lie.
- **Frames:** reuse a frame pool rather than creating in response to events; frames are never garbage collected. Every `CreateFrame` outside setup is a leak candidate.
- **Secure code:** keep protected changes in `ns.OutOfCombat`; prefer `SecureHandler` snippets and attributes over Lua that runs in combat; never store Lua state on a secure frame (the taint rule already enforces this).
- **SavedVariables:** keep the saved shape flat and stable; a type change needs a `ns.Migrate` step (F7).
- **Errors:** raise with `error(msg, 2)` so the stack points at the caller; never swallow with a bare `pcall` (there are 63 `pcall` sites; each should either report or be an API-probe where the error is the answer).

### General guidance for agent-driven work

- **Small, single-purpose PRs** with the test in the same commit as the code. The repo already does this; it is the main reason the 100% floor holds.
- **Executable specs over prose.** A harness scenario that reads like the README sentence (`scripts/tests/scenarios.test.mjs` style) is the best brief an agent can get. When a README sentence changes, the matching scenario changes in the same commit.
- **Keep the state files true** (F4). An agent trusts `STATE.md` and `CONCERNS.md` the way a new hire would.
- **Let the scanner grow with the mistakes.** Every error that reaches a tester in launch week should become a scanner rule or a harness rule, report-only first with a baseline, as #263 did. That is how the repo turns one-off fixes into guard rails.
- **Don't reach for a typed Lua** (Teal, or a TypeScript-to-Lua pipeline) for this project. The custom harness, the TOC loader and the 10-line rule all assume plain Lua files; a compile step would cost more than the types return.
