# Phase 3: Fast suite and CI gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 3-fast-suite-and-ci-gate
**Areas discussed:** Proving 5 minutes, Speed-up approach, Full-suite triggers, CI housekeeping

---

## Proving 5 minutes

| Option | Description | Selected |
|--------|-------------|----------|
| Local 2-worker proxy, hosted later (Recommended) | Measure locally capped to 2 workers; hosted measurement stays open until billing clears. | ✓ |
| Clear billing first, measure hosted | Phase waits on the user clearing the billing block. | |

## Speed-up approach

| Option | Description | Selected |
|--------|-------------|----------|
| Harness-only first (Recommended) | Profiler, scoped and shared logins, split big files; module startup cuts only if still over target, with approval. | ✓ |
| Also cut module startup now | Start with the six heaviest modules. | |

## VM swap

| Option | Description | Selected |
|--------|-------------|----------|
| No, not before launch (Recommended) | Keep the current engine. | ✓ |
| Yes, 2-day spike if needed | Prototype a WASM Lua 5.4 engine behind createAddon. | |

## Full-suite triggers

| Option | Description | Selected |
|--------|-------------|----------|
| Ready-for-review once, then while labeled (Recommended) | Later pushes re-run only while the label is on. | ✓ |
| Every push to a ready PR | Re-run on each new commit. | |

## CI housekeeping (multi-select)

| Option | Selected |
|--------|----------|
| Node 24 and .nvmrc | ✓ |
| Pin luacheck 1.2.0 binary | ✓ |
| Pin fengari exactly | ✓ |
| None, leave CI as is | |

---

## Claude's Discretion

- Profiler design, shared-login selection, file splits, the 2-worker cap, workflow wording.

## Deferred Ideas

- Addon module startup cuts (only with approval); engine swap; required-status-check setting; Phase 2 review warnings WR-01..04.
