---
name: sweep-prs
description: The weekly open pull request and CI sweep for Vanguard: what is green, what is red, merge order, bringing main into a branch, the ci-failure issue, and a status line for Cliff. Use on the Monday routine, when Cliff asks "where are we", or before a merge wave.
---

# Sweep the open PRs

Cheap work for the cheapest model and effort: list, read, decide, report. No code changes beyond bringing `main` into a branch that is about to merge.

## Steps, in order

1. **List** open PRs on `clifftaylor2325/wow-vanguard-ui` and `wow-vanguard-ui-site`, with draft state, the latest check results, review state, mergeability and labels. Then the open `ci-failure` issues and the latest full-suite run (weekly or hand-started).
2. **Sort each PR** into one line: *ready* (green, approved or Cliff's own, no conflict), *waiting on Cliff* (review or an in-game check he owes), *waiting on CI* (a run in progress), *red* (a failed check or a conflict, with the failing step's name from the job log), *draft* (still being worked; say by which thread if it is known).
3. **Merge order** for the ready ones: core and harness first (anything under `Core/`, `scripts/lib/`, `.github/`), then features, so `main` moves under the fewest branches. Bring `main` into a branch once, right before it merges, with a merge commit (never a rebase or force-push on a branch another session made), and only when the PR is next. Merging itself is Cliff's call unless he has said otherwise for this wave; say what is ready in the order to merge.
4. **A red PR** that is a thread's own stays that thread's; say which. One nobody owns gets a one-line comment on the PR naming the failing step and the likely cause, no fix pushed from the sweep.
5. **The `ci-failure` issue**: if the latest weekly run is green and the issue is still open, the next green run closes it on its own; say so. If red, the failing test's name and the seed line from the run's job summary (the replay command) go in a comment on the issue, and a thread is started for the fix if none owns it.
6. **Stale drafts**: a draft with no push for two weeks and no thread gets one line in the report asking whether it stays; nothing is closed from the sweep.
7. **The report** is one message: a line per PR as `[title](link): state, what it waits on`, grouped ready / waiting on Cliff / red / draft, then the full-suite line, then the merge order. Under ten lines when there are under ten PRs. Project memory's "Open" and "MERGED" lines are updated to match.

## Do not

- Push to re-run a green check, or add the `full-tests` label to make a sweep feel thorough; CI minutes are counted.
- Mark a draft ready; only its own thread or Cliff does that.
- Report time estimates; report what each PR waits on.
