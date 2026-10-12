---
status: testing
phase: 03-fast-suite-and-ci-gate
source: [03-VERIFICATION.md]
started: 2026-10-11T13:19:59Z
updated: 2026-10-12T02:15:28Z
---

## Current Test

number: 2
name: Unrelated label neither starts nor cancels a run; a push without full-tests cancels a running full suite
expected: |
  Adding an unrelated label while a full-suite run is in progress starts nothing and cancels nothing (assumption A2). A push without the label on another PR cancels its in-progress run.
awaiting: user response

## Tests

### 1. Ready pull request starts verify and full suite once; a draft starts neither
expected: verify and full suite each start once on a ready PR; a draft starts neither; marking a draft ready starts both (CI-05, needs a hosted run; billing blocked, D-01)
result: pass
source: PR #242 (opened non-draft 13:37:41Z). Skipped verify and full-suite runs at 13:37:44-45Z, real runs at 13:37:55Z, one each. The draft-to-ready sequence is inferred from timestamps; the timeline API returned no events.

### 2. Unrelated label neither starts nor cancels a run; a push without full-tests cancels a running full suite
expected: adding an unrelated label while a full-suite run is in progress starts nothing and cancels nothing (assumption A2); a push without the label on another PR cancels its in-progress run
result: [pending]

### 3. Hosted full-suite time is under 5 minutes
expected: the "Tests, coverage and checks" job of the first hosted full-suite run takes under 5 minutes (CI-06; local 2-worker proxy shows 148.5 to 158.7 s)
result: pass
source: PR #242 full-suite run 38143945159, Tests, coverage and checks 13:37:59Z to 13:41:24Z = 205 s (under 300 s). Quick checks took 28 s.

### 4. First hosted verify and lua-suite run after the toolchain pins
expected: luacheck 1.2.0 installs after sha256sum -c accepts the digest; lua5.1 still installs through apt; node-version-file .nvmrc gives Node 24 on actions/setup-node@v7; the Playwright preview job runs on Node 24 (assumptions A3, A4, A6)
result: issue
reported: "Toolchain pins proved on PR #242: luacheck 1.2.0 installed after sha256sum -c, setup-node@v7 read .nvmrc, UI preview ran Node v24.21.0, lua5.1 installed. But Suite / UI preview failed: npm run preview threw 'FontString:SetText(): Font not set' (eval:69, scripts/preview-ui.mjs:576)."
severity: major

### 5. Decide D-06's internal 150 s budget
expected: a decision. Recorded runs 155.5 s and 158.7 s, independent verifier run 148.5 s; the 300 s requirement is met in every run. The user already chose to accept about 156 s during execution; record that here or ask for module startup work.
result: [pending]

### 6. Decide the open review items WR-01 and IN-05
expected: each marked fixed, deferred or wontfix in 03-REVIEW-DISPOSITION.md (WR-01: a scoped firstRun login runs MigrateDB(0,2); IN-05: the UI preview job now runs on every ready-for-review PR)
result: [pending]

## Summary

total: 6
passed: 2
issues: 1
pending: 3
skipped: 0
blocked: 0

## Gaps

- gap_id: G-03-4
  truth: "The Playwright preview job runs on Node 24 and completes"
  status: failed
  reason: "User reported: Suite / UI preview failed on PR #242 (run 38143945159): npm run preview threw FontString:SetText(): Font not set at eval:69, scripts/preview-ui.mjs:576. The job makes the full-suite workflow red."
  severity: major
  test: 4
  artifacts: []
  missing: []
