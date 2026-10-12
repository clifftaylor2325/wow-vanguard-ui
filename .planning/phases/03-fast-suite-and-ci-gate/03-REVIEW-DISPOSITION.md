# Phase 3 — Code review disposition

> One row per finding in `03-REVIEW.md`. Written by the orchestrator; `03-REVIEW.md` has a single writer (the reviewer) and is not edited. Advisory: the code-review gate never blocks the phase. Review result: 0 critical, 1 warning, 5 info.

| Finding | Severity | Summary | Disposition | Note |
|---------|----------|---------|-------------|------|
| WR-01 | warning | `scripts/lib/login-scope.mjs:42-48`: a scoped `firstRun` login with no `VanguardDB` of its own gets `VanguardDB = {}`, so `Core/DB.lua` runs `MigrateDB(0, 2)` instead of a fresh install | fix (gap closure) | Nothing fails today: the only upgrade step is a no-op on an empty profile. The next `ns.UpgradeDB` step would silently change first-run cases. Fix: keep those cases on the full login or in `FULL_CASES`, then rerun the probe. |
| IN-01 | info | New cases in a listed file are scoped by default; the probe cannot tell "does not need the six modules" from "asserts only absence" | open | Known limit, stated in the README. Coverage floor is the CI guard. |
| IN-02 | info | `full-suite.yml:49-67`: a later push without the label cancels the ready-for-review run and gets no full-suite verdict of its own | open | Matches D-04 and the README. Hosted behaviour unverified. |
| IN-03 | info | `verify.yml:55`, `lua-suite.yml:64`: `curl -fsSL` has no retry | open | Add `--retry 3 --retry-all-errors` later. |
| IN-04 | info | `login-scope-probe.mjs:47`: without `--workers` the probe uses all cores, so timeouts can grow the keep-full lists | open | Safe direction; the committed data came from a 4-worker run with no timed-out case. |
| IN-05 | info | `full-suite.yml:70`: the UI preview job now also runs on every ready-for-review PR | wontfix | Against the free-tier minutes constraint; decided 2026-10-11 after the hosted run (205 s): kept. |

Dispositions to use later: `open` (default) · `fixed` · `deferred` · `wontfix`. The orchestrator will not change a row without a recorded reason.
