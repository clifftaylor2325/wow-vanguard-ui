# Phase 2 — Code review disposition

> One row per finding in `02-REVIEW.md`. Written by the orchestrator; `02-REVIEW.md` has a single writer (the reviewer) and is not edited. Advisory: the code-review gate never blocks the phase. Review result: 0 critical, 4 warning, 5 info. The reviewer found every `ns.Guard` conversion behaviour-preserving.

| Finding | Severity | Summary | Disposition | Note |
|---------|----------|---------|-------------|------|
| WR-01 | warning | `scripts/lib/code-quality.mjs:370`: rule 4 takes the last argument as the callback for every timer call, so a guarded `C_Timer.NewTicker(5, ns.Guard("a", fn), 3)` is reported as bare | open | Tooling false positive only. The one ticker in the repo has two arguments, so CI is green today. |
| WR-02 | warning | `code-quality.mjs:326-333`: rule 4 misses aliased timers (`local after = C_Timer.After`) and `HookScript("OnClick", ...)` | open | `TalentPlanner.lua:502,573` are hand-wrapped in `ns.Try`, so no live bug. HookScript is outside the declared D-03 scope. |
| WR-03 | warning | `Core/Events.lua:145-148`: `finished()` resets `forwarding = false` on every return, so a guarded callback running inside the game's error handler clears the loop guard | open | Bounded by Lua's C-stack limit. The fix is to save and restore the previous flag. Production code. |
| WR-04 | warning | `Core/Events.lua:162-167` and `code-quality.mjs:355-358`: `ns.Guard(fn)` with the label missing returns nil, silently dropping the handler, and the lint accepts it | open | Production code and tooling. `ns.Guard` should require a string label and `isGuarded` should check the first argument. |
| IN-01 | info | The addon registry is cleared after the first test, so an addon shared across tests is judged once | open | No test shares an addon today. |
| IN-02 | info | Errors dropped by the 20-entry cap are invisible to the guard | open | Can only cause a false "expected but never seen". |
| IN-03 | info | Hook labels are not unique ("hook UpdateItems" at 4 sites, "hook Update" at 3), so errors without a file:line would merge | open | |
| IN-04 | info | The two ChatExtras conditions add clauses that are always true in the client; `EventRegistry.RegisterCallback` being a function on the 12.1 client was not observed | open | Goes on the author's in-game check list. |
| IN-05 | info | `workflows.test.mjs` checks only `${{ inputs.` inside `run:` scripts | open | Same as security observation 1. |

Dispositions to use later: `open` (default) · `fixed` · `deferred` · `wontfix`. The orchestrator will not change a row without a recorded reason.
