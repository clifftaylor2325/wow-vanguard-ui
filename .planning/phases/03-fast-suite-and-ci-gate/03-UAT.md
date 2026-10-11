---
status: testing
phase: 03-fast-suite-and-ci-gate
source: [03-VERIFICATION.md]
started: 2026-10-11T13:19:59Z
updated: 2026-10-11T13:19:59Z
---

## Current Test

number: 1
name: Ready pull request starts verify and full suite once; a draft starts neither
expected: |
  On a hosted runner, a PR opened ready starts verify (Quick checks) and full suite (Suite) once each. A draft starts neither. Marking a draft ready starts both via ready_for_review.
awaiting: user response

## Tests

### 1. Ready pull request starts verify and full suite once; a draft starts neither
expected: verify and full suite each start once on a ready PR; a draft starts neither; marking a draft ready starts both (CI-05, needs a hosted run; billing blocked, D-01)
result: [pending]

### 2. Unrelated label neither starts nor cancels a run; a push without full-tests cancels a running full suite
expected: adding an unrelated label while a full-suite run is in progress starts nothing and cancels nothing (assumption A2); a push without the label on another PR cancels its in-progress run
result: [pending]

### 3. Hosted full-suite time is under 5 minutes
expected: the "Tests, coverage and checks" job of the first hosted full-suite run takes under 5 minutes (CI-06; local 2-worker proxy shows 148.5 to 158.7 s)
result: [pending]

### 4. First hosted verify and lua-suite run after the toolchain pins
expected: luacheck 1.2.0 installs after sha256sum -c accepts the digest; lua5.1 still installs through apt; node-version-file .nvmrc gives Node 24 on actions/setup-node@v7; the Playwright preview job runs on Node 24 (assumptions A3, A4, A6)
result: [pending]

### 5. Decide D-06's internal 150 s budget
expected: a decision. Recorded runs 155.5 s and 158.7 s, independent verifier run 148.5 s; the 300 s requirement is met in every run. The user already chose to accept about 156 s during execution; record that here or ask for module startup work.
result: [pending]

### 6. Decide the open review items WR-01 and IN-05
expected: each marked fixed, deferred or wontfix in 03-REVIEW-DISPOSITION.md (WR-01: a scoped firstRun login runs MigrateDB(0,2); IN-05: the UI preview job now runs on every ready-for-review PR)
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
