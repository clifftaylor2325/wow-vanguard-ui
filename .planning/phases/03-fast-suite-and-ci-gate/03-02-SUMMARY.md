---
phase: 03-fast-suite-and-ci-gate
plan: 02
subsystem: ci
tags: [github-actions, workflows, concurrency, expression-evaluator, vitest]

requires:
  - phase: 03-fast-suite-and-ci-gate
    provides: plan 03-01 (suite timing recorder); no code dependency
provides:
  - "full-suite.yml starts the full suite when a pull request is opened ready, marked ready for review or reopened (never a draft), and on later pushes only while the full-tests label is on"
  - "a label-guarded concurrency group so an unrelated label neither starts a second run nor cancels a good one"
  - "scripts/workflows.test.mjs: an evaluator for the workflow expression subset and a truth table over the real if and concurrency text"
affects: [03-04, 03-07]

plan_head_before: 29c838f72836b7cc6c58415fe69b633150924d2b
plan_head_after: 04f56a6734aa79d8d1f504576239dd4bce3b207a

actuals:
  tokens: 4800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "workflow conditions proved by evaluating their own text per event (small tokenizer, translation to JS, new Function)"

key-files:
  created: []
  modified:
    - .github/workflows/full-suite.yml
    - .github/workflows/lua-suite.yml
    - .github/workflows/verify.yml
    - scripts/workflows.test.mjs
    - README.md
    - scripts/tests/README.md

key-decisions:
  - "opened is in the pull_request types beyond D-04's literal wording: a pull request opened ready fires opened, not ready_for_review (research pitfall 2)"
  - "verify.yml's 'never mentions full-tests' is checked on non-comment lines only, because its header comment now names the label to describe the full suite"

requirements-completed: [CI-05]

coverage:
  - id: D1
    description: "The suite job runs for opened-ready, ready_for_review, reopened, a labeled full-tests event, a push with the label, schedule and workflow_dispatch; it is skipped for drafts, a push without the label, and any labeled event for another label"
    requirement: CI-05
    verification:
      - kind: unit
        ref: "scripts/workflows.test.mjs#suite job if (14 truth-table cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A labeled event for another label lands in the -other-label group; ready_for_review, a push and the full-tests label share the pull request's group; other pull requests and the schedule have their own"
    requirement: CI-05
    verification:
      - kind: unit
        ref: "scripts/workflows.test.mjs#concurrency (3 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Types line, schedule, preview and shuffle lines, report job if, permissions, verify.yml types and draft check are unchanged; no VG_LOGIN_SCOPE, no privileged pull request event, no event or input expression in any run script"
    requirement: CI-05
    verification:
      - kind: unit
        ref: "scripts/workflows.test.mjs (text checks)"
        status: pass
    human_judgment: false
  - id: D4
    description: "README.md, scripts/tests/README.md and the three workflow headers state the ready-for-review rule and the label's role"
    requirement: CI-05
    verification:
      - kind: other
        ref: "grep -n 'ready for review' README.md scripts/tests/README.md .github/workflows/full-suite.yml (all three match)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A hosted run actually appears for a ready pull request, a draft gets none, an unrelated label neither starts nor cancels a run, and a push without the label cancels a running full suite"
    requirement: CI-05
    verification: []
    human_judgment: true
    rationale: "Hosted Actions behaviour (including assumption A2, whether a skipped run cancels its group) cannot be observed until billing clears (D-01)"

duration: 15min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 02: Full suite on ready for review Summary

**`full-suite.yml` now runs the full suite when a pull request is opened ready, marked ready for review or reopened, and on later pushes only while the `full-tests` label is on; the wiring is proved by a test that evaluates the workflow's own `if` and concurrency group for each event.**

## What a push without the label does

A later push without the `full-tests` label **cancels a full-suite run still in progress for that pull request**. The push lands in the same concurrency group as the earlier run, which has `cancel-in-progress: true`, and the code that run was testing is stale. This is by design and is described in `README.md` and the `full-suite.yml` header. Adding any other label does not do this: that event is skipped by the job `if` and sits in its own `-other-label` group.

## Accomplishments

- `types: [opened, ready_for_review, labeled, synchronize, reopened]`; the suite job `if` is a folded block that runs non-pull-request events always, skips drafts, skips any `labeled` event whose label is not `full-tests`, and otherwise runs on `opened`, `ready_for_review`, `reopened` or when the pull request carries the label.
- The concurrency group has a `-other-label` suffix for `labeled` events of any other label.
- `scripts/workflows.test.mjs` has a tokenizer and evaluator for the expression subset in use (property paths, `labels.*.name`, `contains`, `==`, `!=`, `!`, `&&`, `||`, parentheses, quoted strings; anything else throws), 14 truth-table cases for the job `if`, 3 for the group, and text checks. 31 cases pass in the file (24 new), up from 7.
- The red step was real: 8 of the new cases failed against the unchanged workflow before the edit.
- README.md (commands comment and **CI:** paragraph), `scripts/tests/README.md` and the headers of `full-suite.yml`, `lua-suite.yml` and `verify.yml` say the new rule.

## Task Commits

1. **Task 1 (3-02-01): Ready for review starts the full suite; later pushes only with the label; drafts never** - `1cb4ac6`
2. **Task 2 (3-02-02): Every sentence about the full-suite trigger says the new rule** - `04f56a6`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `.github/workflows/full-suite.yml` - types, job `if`, concurrency suffix, header
- `.github/workflows/lua-suite.yml` - header sentence only
- `.github/workflows/verify.yml` - header sentence only
- `scripts/workflows.test.mjs` - evaluator, truth table, text checks
- `README.md`, `scripts/tests/README.md` - the trigger sentences

## Decisions Made

- `opened` is added beyond D-04's literal wording (see key-decisions); flagged for the user as the research asked.
- The `verify.yml` no-label check skips comment lines, since the header now names the label.
- The test file's `evaluate` takes only `github.` names; `inputs.` and `true`/`false` literals are not needed by the two expressions under test and throw if a later edit adds them, which is the intent.

## Deviations from Plan

None - plan executed exactly as written. (One small judgement call: the plan's "verify.yml never mentions full-tests" is read as "does not depend on it", because Task 2 also has the verify.yml header describe the label; see Decisions Made.)

## Issues Encountered

- A first attempt to append the tests with a shell heredoc failed on quoting; nothing was written, and the tests were added with the Edit tool instead.

## Open hosted checks (cannot be verified until billing clears, D-01)

- A ready pull request gets one `full suite` run; a draft gets none.
- Opening a pull request ready (not as a draft) starts the run via `opened`.
- Adding an unrelated label neither starts nor cancels a run (assumption A2: a skipped run might still cancel its group; the `-other-label` suffix is the guard and is pinned only by the truth-table test).
- A push without the label cancels a running full suite for that pull request, by design.

## For the user: stale line in CLAUDE.md

`CLAUDE.md` says "the full suite runs weekly, before releases, or on PRs labelled `full-tests`". It is now stale: the full suite also runs when a pull request is opened ready or marked ready for review, and the label means "run it on every later push". Not edited here (project instructions are yours to change).

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust boundary; event-controlled values appear only in `if` and `concurrency` expressions (T-03-03), the trigger stays `pull_request` (T-03-04), permissions are unchanged.

## Next Phase Readiness

- 03-04 adds `VG_LOGIN_SCOPE`; the workflow test already fails if any workflow file mentions it.
- 03-07 replaces the "about five minutes" sentence in `lua-suite.yml`, which was left alone here.

## Self-Check: PASSED

- Modified files present; commits `1cb4ac6` and `04f56a6` are ancestors of HEAD; `git rev-list --count` from the plan base gives 2.
- `npm test -- scripts/workflows.test.mjs scripts/pkgmeta.test.mjs` 33 passed; `npm run quality` OK; `npm run test:quick` 187 passed.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
