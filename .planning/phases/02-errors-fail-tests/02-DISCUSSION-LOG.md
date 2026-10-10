# Phase 2: Errors fail tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 2-errors-fail-tests
**Areas discussed:** Allow-list shape, Handler wrapping, Shuffle and flaky, Many errors found

---

## Allow-list shape

| Option | Description | Selected |
|--------|-------------|----------|
| Marker inside the test (Recommended) | The test names the exact error it expects; any other error still fails. | ✓ |
| File list in setup.mjs | Whole test files exempt. | |
| Marker first, file list as last resort | Marker by default; a named file entry only with a written reason. | |

**User's choice:** Marker inside the test

---

## Handler wrapping

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap all via a shared helper (Recommended) | One helper in Core at every site; players see errors in /vg errors. | ✓ |
| Money paths now, rest harness-only | Wrap auction, vendor, bag hooks in production; catch the rest only in tests. | |
| Harness-only | No production change. | |

**User's choice:** Wrap all via a shared helper

---

## Shuffle and flaky

| Option | Description | Selected |
|--------|-------------|----------|
| Shuffle the full-suite run (Recommended) | Full suite shuffled with printed seed; plus 3 clean local shuffled runs to close. | |
| Local gate only | Three shuffled local runs to close; CI order fixed. | |
| Weekly CI job only | A separate weekly shuffled run. | ✓ |

**User's choice:** Weekly CI job only

### Shuffle proof (follow-up)

The hosted runner is blocked by billing, so a weekly job cannot prove the criterion at phase close.

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly job plus 2 local shuffled runs (Recommended) | Close on two clean local shuffled runs with different seeds. | |
| Weekly job only, leave criterion open | Close without a shuffle run; criterion pending until the hosted runner works. | ✓ |

**User's choice:** Weekly job only, leave criterion open
**Notes:** The roadmap's criterion 3 was reworded to match. The verifier may still flag the open part; the user accepted that.

---

## Many errors found

| Option | Description | Selected |
|--------|-------------|----------|
| Fix the money paths, stop and ask on the rest (Recommended) | Stop and show the list if more than about 20 distinct errors or one big change. | ✓ |
| Fix everything in this phase | Keep going until green with no allow-list entries. | |

**User's choice:** Fix the money paths, stop and ask on the rest

### Extra harness modes

| Option | Description | Selected |
|--------|-------------|----------|
| Defer, note for later (Recommended) | Combat-lockdown mode and secret sweep are not in CI-03 or CI-04. | ✓ |
| Include lockdown mode | | |
| Include both | | |

**User's choice:** Defer, note for later

---

## Claude's Discretion

- Marker design, harness registry of created addons, helper name and shape.
- Stub gaps exposed by the guard: fix the stub citing Blizzard source (Phase 1 policy).

## Deferred Ideas

- Combat-lockdown mode and secret-value sweep: add as a requirement before Phase 12.
- `OnUpdate` accumulators and `RegisterUnitEvent` leaks: Phase 4.
- Hosted-runner shuffled run: after the billing block clears.
