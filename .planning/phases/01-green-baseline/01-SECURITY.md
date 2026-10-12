---
phase: "1"
slug: "green-baseline"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-09"
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| main checkout to scratch worktree | The plan created and removed a second checkout next to the repository. | files on disk |
| npm registry to worktree `node_modules` | `npm ci` installed the committed lock file in the scratch worktree. | third-party packages |
| test runs to recorded evidence | The SUMMARY's counts became the public record on #169. | test counts, coverage total |
| local phase files to GitHub issue #169 | The comment text became visible to everyone with access to the repository. | comment body |
| gh CLI credentials to the GitHub API | Two accounts are logged in; a write goes out under the active one. | issue write under `clifftaylor2325` |
| executor to user approval | Posting and closing were the user's decision (D-07). | approval reply |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Tampering / Denial of service | worktree removal and setup (plan 01-01) | medium | mitigate | Own `npm ci` in the scratch worktree, removed with `git worktree remove` (no `--force`). Verified: no `vg-p1-baseline` worktree or sibling folder is left, and `node_modules/vitest/package.json` is intact in the main checkout. | closed |
| T-01-02 | Tampering (evidence integrity) | baseline runs (plan 01-01) | medium | mitigate | Detached worktree at origin/main. Verified: `targeted-run1.log` records `head=b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b` (equals origin/main) and `vitest=5.0.3`; each of the three logs ends `exit=0` and none was overwritten. | closed |
| T-01-03 | Tampering | coverage floor and harness rules (plan 01-01) | high | mitigate | No tracked file outside `.planning/` changed. Verified: `git diff --stat origin/main...HEAD -- Modules Core scripts` is empty, and the coverage floor, `package.json` and lock file are identical to origin/main. | closed |
| T-01-SC | Tampering | npm installs (plan 01-01) | low | mitigate | `npm ci` installed the committed lock file only; `package.json` and the lock file are unchanged. | closed |
| T-01-04 | Elevation of privilege | `gh issue comment` and `gh issue close` on #169 (plan 01-02) | high | mitigate | Blocking-human checkpoint, answered by the user (post and close). The reply is quoted in `01-02-SUMMARY.md`. Nothing was written to #169 before that reply. | closed |
| T-01-05 | Spoofing | the gh account that posted (plan 01-02) | medium | mitigate | Active gh account `clifftaylor2325` equals the repository owner (`clifftaylor2325/wow-vanguard-ui`); `gh auth switch` was never run. | closed |
| T-01-06 | Information disclosure | the comment body (plan 01-02) | medium | mitigate | The draft passed the plan's hygiene check, and the posted body was fetched back and scanned: 0 hits for drive-letter paths, `/c/`, `/home/`, `/users/`, `appdata` and email addresses. | closed |
| T-01-07 | Tampering | duplicate or misdirected writes on GitHub (plan 01-02) | low | mitigate | Issue fixed at 169. Verified afterwards: `CLOSED COMPLETED`, exactly one comment. No PR opened, no branch pushed. | closed |
| T-01-08 | Repudiation | closing #169 without the D-04 evidence (plan 01-02) | medium | mitigate | Before any write, the newest `coverage-run1.log` ended `exit=0` and `01-01-SUMMARY.md` existed. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Note: plan 01-02 lists its own `T-01-SC` (npm/pip/cargo installs) as `accept`: that plan installs no package, so there is nothing to mitigate. It is recorded in the log below.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-SC (plan 01-02) | Plan 01-02 installs no package, so no supply-chain exposure exists to mitigate. | plan author (low severity, no exposure) | 2026-10-09 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-09 | 10 | 10 | 0 | orchestrator (L1 grep-depth; auditor not spawned, ASVS level 1, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-09
