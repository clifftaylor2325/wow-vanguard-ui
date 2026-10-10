---
phase: "1"
slug: "green-baseline"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-09"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (lock file), projects `quick` and `lua` |
| **Config file** | `vitest.config.mjs` (setup `scripts/tests/setup.mjs`) |
| **Quick run command** | `npx vitest run scripts/tests/auction.test.mjs scripts/tests/auctionledger.test.mjs scripts/tests/chatwatch.test.mjs scripts/tests/plates.test.mjs scripts/tests/raid.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~90 s, full ~5 min on 16 cores, verify + coverage ~11 min |

---

## Sampling Rate

- **After every task commit:** run the five-file quick command (plus `npm run quality` if a `.mjs` test file changed)
- **After every plan wave:** run `npm test`
- **Before `/gsd-verify-work`:** `npm ci`, `npm run verify`, `npm run coverage` all green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | CI-01 | — | N/A | full suite | `npm ci && npm test; echo "exit=$?"` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | CI-01 | — | N/A | targeted | five-file quick command (expect 120 passed) | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | CI-01 | — | N/A | evidence | `git diff --stat eff5158 0cf01dc -- 'Modules/Auction*'` (expect empty) | ✅ | ⬜ pending |
| 1-02-01 | 02 | 2 | CI-01 | — | closing the issue needs the user's approval | manual-by-command | `gh issue view 169 --comments` | ❌ created in plan 02 | ⬜ pending |
| 1-03-01 | 03 | 3 | CI-02 | — | N/A | coverage | `npm run coverage; echo "exit=$?"` (expect 100.00%) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs are provisional; the planner assigns final IDs.*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Post the #169 outcome comment and close the issue | CI-01 | Posts to a public tracker; needs the user's go-ahead (D-07) | Draft the seven-row table, show it, post and close only after approval; then run `gh issue view 169 --comments` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
