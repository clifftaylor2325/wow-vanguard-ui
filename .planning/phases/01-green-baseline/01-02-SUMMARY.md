---
phase: 01-green-baseline
plan: 02
status: complete
requirements: [CI-01]
completed: 2026-10-09
---

# Plan 01-02 Summary: #169 outcome recorded and issue closed

## Checkpoint reply

The user's settling replies at the blocking-human checkpoint, quoted word for word:

- Question: "What should happen with the #169 comment? (Your decision D-05 says close once all seven outcomes are recorded and the local green run passed, which it has.)"
  Reply: `Post and close (Recommended)`
- Question: "How should Phase 1's branch and PR be handled? CLAUDE.md asks for one PR per phase from a work/p1-... branch, but this phase only adds .planning files on work/gsd-planning."
  Reply: `Defer: one PR later (Recommended)`

The path taken is post-close, which follows D-05. No D-05 override was made, so there is no override section.

## What was done

- Drafted the seven-row outcome comment (`1-02-01`, commit `57a04ae`), then showed it to the user with three caveats before posting.
- Preconditions checked before any write: `coverage/p1-baseline/coverage-run1.log` ends with `exit=0`; `01-01-SUMMARY.md` exists; the active `gh` account is `clifftaylor2325`, the repository owner; #169 was OPEN with zero comments. No `gh auth switch` was run.
- Posted the comment once and closed #169 as completed: https://github.com/clifftaylor2325/wow-vanguard-ui/issues/169#issuecomment-6093365569
- Verified afterwards: `CLOSED COMPLETED comments=1`.

## Branch and PR decision

Deferred, per the user's reply. Phase 1 changes only `.planning/` files, committed on `work/gsd-planning`. No branch was created, nothing was pushed and no PR was opened. CLAUDE.md asks for one PR per phase from a `work/p1-...` branch; the user chose to open a single PR for the planning branch later, when they say so.

## Deviations

- **Task 3 was run by the orchestrator inline**, not by a spawned executor, because it needed only a few `gh` calls after the user's approval. The task's own verify one-liner was not run verbatim; the post-conditions were checked directly (state, state reason, comment count, comment URL).
- **Task 1 ran in an isolated worktree** as the project's isolation guard required. The executor ran the plan's verify conditions one at a time, because the guard refused compound git commands.

## Caveats the user accepted when approving

- **Row 4 cause and fix lines do not quite match.** The posted comment says the test "never picked the Selling tab", but the current test on main has no `pickTab` call. The "Resolved by" line says only that `84a7b0a` moved the listings to the Up now card and rewrote the case. The user chose to post as drafted. If this matters, add a short correcting comment on #169.
- Rows 2 to 4 take their fix descriptions from the `84a7b0a` commit message, not from a diff read.
- The Blizzard citations in rows 6 and 7 were copied from `01-RESEARCH.md`, pinned to wow-ui-source `forever` at `2ced784`, and not re-fetched. They assume that branch is the Forever client's UI source.

## Needs in-game check (for the author)

- Whether the client gives an anchored, empty font string a rect (chat watch price, case 5).
- Where the engine places a nameplate on screen (case 6); the test fixture's centre point is a stand-in.
- That wow-ui-source `forever` matches the UI source of the Forever client the author plays on.

## Not changed

No `Modules/`, `Core/` or `scripts/` file was edited (D-06). `scripts/lib/wow-layout.lua` is unchanged. The local branch `claude/auction-tabs-leftovers` was not touched.

## Open items passed to later phases

- Hosted-runner confirmation of the full suite: Phase 3.
- A green suite is not an error-free suite; only `smoke.test.mjs` asserts zero addon errors. Phase 2 may turn some tests red.
