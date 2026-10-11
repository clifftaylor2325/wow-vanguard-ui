---
gsd_state_version: "1.0"
current_phase: 03
current_phase_name: Fast suite and CI gate
status: executing
stopped_at: Completed 03-06-PLAN.md
last_updated: "2026-10-11T03:30:46.908Z"
last_activity: 2026-10-10
last_activity_desc: Phase 03 execution started
state_head: 0cca8353e68e1d9303f20e75dd8b3c578bd1479b
progress:
  total_phases: 12
  completed_phases: 2
  total_plans: 22
  completed_plans: 21
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-09)

**Core value:** On launch day, Vanguard loads without errors and everything it replaces works, verified by a full test suite that is green and fast enough to run on every PR.
**Current focus:** Phase 03 — Fast suite and CI gate

## Current Position

Phase: 03 (Fast suite and CI gate) — EXECUTING
Plan: 7 of 7
Status: Ready to execute
Last activity: 2026-10-10 — Phase 03 execution started

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2 | - | - |
| 2 | 13 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P01 | 8 min | 3 tasks | 5 files |
| Phase 03 P02 | 15 min | 2 tasks | 6 files |
| Phase 03 P03 | 10 min | 2 tasks | 6 files |
| Phase 03 P04 | 7 min | 2 tasks | 5 files |
| Phase 03 P05 | 12 min | 3 tasks | 8 files |
| Phase 03 P06 | 13 min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phases grouped by area in the author's priority order: Code and CI (1-4), auction Post fix (5), UI polish (6-8), levelling and group features (9-11), launch gate (12).
- [Roadmap]: CI design decided: the full suite runs on ready-for-review and on the `full-tests` label; the quick check runs on every push (replaces "full suite on every PR").
- [Roadmap]: Features (Phases 9-11) are cut first if time runs short; Phase 12 runs regardless.
- [Roadmap]: FEAT-06 (party quest progress over addon messages) stays in v1 by the author's decision, against the research's advice; cuttable.
- [Roadmap]: File splits have no v1 requirement; they ride as cuttable, structure-only tails (Options in Phase 4, auction files in Phase 5 after the fix, Theme at the start of Phase 6).
- [Phase 03]: [03-01] suite-timing CLI also fails when Vitest exits non-zero with no failed test; test groups are flat it() calls because describe() callbacks are not exempt from the 10-line rule
- [Phase 03]: 03-02: opened added to full-suite pull_request types beyond D-04's wording (a PR opened ready fires opened, not ready_for_review)
- [Phase 03]: [03-03] Profiler counts a frame as Lua only when what is Lua or main (fengari reports host functions as J); setup.mjs resets the accumulator after each per-file dump
- [Phase 03]: [03-04] login-scope.test.mjs is in FULL_FILES (its logins test the scoping rules, so the probe's --write must not scope it); the probe refuses --write when a login file ran no case
- [Phase 03]: [03-05] The foreground luacheck step in lua-suite.yml is one && chain that ends the script, because bash -e ignores a failing non-final member of an && list; CI-05 not ticked since 03-07 also declares it
- [Phase 03]: setup 'nothing overlaps' cases are hand-kept on the full login: they compare every module's mover rects and pass vacuously with a module off
- [Phase 03]: units 'threat and happiness only where the client and settings allow' is kept on the full login for coverage (UnitExtras.lua:46)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 12]: The Forever beta may close around 2026-10-21 (unverified). Read `/vg status` at the first beta login, and run the zero-error session as soon as Phase 5 merges.
- [Phase 1]: Sources disagree on which tests are red. Re-baseline on clean main and on the hosted runner before chasing failures.
- [Phase 3]: Current measurements do not support a 5-minute full suite on a 2-vCPU runner yet; measure on the hosted runner before promising the time.
- [All]: No current figure for the Actions minutes allowance. Check it weekly and agree a break-glass path if minutes run out.
- [Phase 9]: The author confirms the feature gap list before planning (several listed helpers already exist).
- [Phases 8, 10]: PvP frame names and the loot-history API on Forever need in-game checks before planning.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-11T03:30:46.846Z
Stopped at: Completed 03-06-PLAN.md
Resume file: None
