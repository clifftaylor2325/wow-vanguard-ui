---
phase: 03-fast-suite-and-ci-gate
reviewed: 2026-10-11T13:20:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - .github/workflows/full-suite.yml
  - .github/workflows/lua-suite.yml
  - .github/workflows/release.yml
  - .github/workflows/verify.yml
  - .nvmrc
  - .pkgmeta
  - README.md
  - package.json
  - scripts/lib/login-scope.mjs
  - scripts/lib/lua-harness.mjs
  - scripts/lib/lua-profile.mjs
  - scripts/lib/suite-timing.mjs
  - scripts/login-scope-probe.mjs
  - scripts/login-scope.test.mjs
  - scripts/lua-profile.test.mjs
  - scripts/profile-lua.mjs
  - scripts/suite-timing.mjs
  - scripts/suite-timing.test.mjs
  - scripts/tests/README.md
  - scripts/tests/helpers.mjs
  - scripts/tests/login-scope.json
  - scripts/tests/setup.mjs
  - scripts/workflows.test.mjs
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-11T13:20:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed the workflow wiring, the scoped-login machinery, the profiler, the timing recorder and their tests. No addon Lua changed in this phase.

What I checked and found sound:
- The `full-suite.yml` `if` and concurrency group behave as the README says for every event and action in the test table. The expression and its JS evaluator agree on `&&`/`||` operand semantics.
- The luacheck pin is correct. I downloaded the v1.2.0 release asset: 835,048 bytes, an ELF file, and its SHA-256 equals `d68da17f...defc` in both workflows and in `workflows.test.mjs`. The download is verified before `install`, and the verify.yml background group does fail the step through `wait`.
- No `${{ }}` expression is interpolated into any `run:` script. Untrusted values (`GITHUB_REF_NAME`, tag, result) reach the shell only through env vars.
- Exit codes of `npm run timing`: I ran it with a green file set (exit 0) and against the 907-case baseline with a filter (exit 1, "900 baseline case(s) missing"). Windows path handling in `relFile` is correct and tested.
- `npm run quality` passes. `npm run test:quick` passes (13 files, 231 tests). The baseline file has LF endings (`.gitattributes` forces `eol=lf`), so `checkBaseline`'s split on `\n` is safe.

One real defect (scoped first-run logins are not fresh installs) and five lower-severity items follow.

## Warnings

### WR-01: A scoped `firstRun` login is not a fresh install: it runs the account-file upgrade path

**File:** `scripts/lib/login-scope.mjs:42-48`, applied at `scripts/tests/helpers.mjs:62`
**Issue:** `loggedIn(..., { firstRun: true })` promises "a brand-new account (no SavedVariables unless given)". For a case that the scope data scopes, `scopeLua()` is appended to the (empty) saved variables, and `modulesOffLua` begins with `VanguardDB = VanguardDB or {}`. That makes `VanguardDB` a table without a `version`. `Core/DB.lua:56-59` (`savedVersion`) then returns `0` instead of `nil`, and `Core/DB.lua:88` runs `ns.MigrateDB(0, 2)`.

I confirmed this with the harness. With an `ns.UpgradeDB` spy registered before login:

| Saved variables | Upgrade steps run |
|---|---|
| none (full login) | none |
| `modulesOffLua(HEAVY)` | steps 1 and 2 both run (`__mig == 11`) |

So every scoped first-run case exercises the "old file upgraded from version 0" path, not the "fresh install is stamped without an upgrade" path that its title describes. The probe only caught the one case that asserts on the upgrade count directly (`core.test.mjs` "the account file's version is read and upgraded", which is on the keep-full list). Other first-run cases with no `VanguardDB` of their own are not on any keep list and run scoped:
- `core.test.mjs:12` ("saved variables", which asserts "fresh install creates VanguardDB")
- `setup.test.mjs:21` (title centring) and `:26` ("first-run setup: once per account, four clicks with the defaults")
- `setup.test.mjs:48`, `:88`, `:137`, `:142` and others

Today the only registered step (`MenuStrip.upgradeMenu`) is a no-op on an account whose Default profile has no `MenuStrip` or `positions` table, so nothing fails. The next `ns.UpgradeDB` step that changes defaults or sets a flag will silently alter every first-run case, and the "fresh install" cases will pass or fail for the wrong reason.

**Fix:** Do not scope a login that is meant to be a fresh account. In `helpers.mjs`:
```js
function scopeLua(firstRun, savedVariables) {
  // A fresh account has no VanguardDB; creating one here would make it a version-0 file.
  if (firstRun && !/\bVanguardDB\b/.test(savedVariables)) return "";
  return modulesOffLua(scopeFor({ mode: process.env.VG_LOGIN_SCOPE, ...runningCase(), data: SCOPE_DATA }));
}
```
Then rerun the probe (or add a `firstRun` rule to `scopeFor`) so the data is derived under the same rule. Alternatively, add the first-run cases that have no `VanguardDB` of their own to `FULL_CASES`.

## Info

### IN-01: A new case in a listed file is scoped by default, and "passes with the six off" cannot tell "does not need them" from "asserts only absence"

**File:** `scripts/lib/login-scope.mjs:55-61`; `scripts/tests/README.md` (Scoped logins)
**Issue:** In a listed file the rule is "scoped unless the case name is on the keep list", and the keep list is derived only from cases that fail with the modules off. A case that passes only because the heavy modules built nothing (an overlap, "no error" or "nothing is shown" assertion) is scoped, and so is every case added later. Three such cases were found by hand (`FULL_CASES`). The README admits the gap and names the coverage floor as the only backstop. The floor protects lines, not the error guard's view of the six modules, nor assertions that become vacuous. I found no further concrete vacuous case: `unlock`, `profiles`, `motion`, `errorrail` and `fallbacks` do not depend on the six modules.
**Fix:** A review step rather than a code change. When a case is added to a listed file, check that it still reaches what it asserts with the six off. Optionally, make the default fail-closed for newly added cases by recording the full list of scoped case names in the data and treating an unknown name as a full login.

### IN-02: A later push without the label cancels a full run in progress, and nothing replaces it

**File:** `.github/workflows/full-suite.yml:49-51, 59-67`
**Issue:** The concurrency group is evaluated for the whole workflow run before the job `if`. A `synchronize` event on an unlabelled PR gets the same group as the `ready_for_review` run, so with `cancel-in-progress: true` it cancels that run and then every job in the new run is skipped. Scenario: the author marks the PR ready, the suite starts (about 3 minutes), the author pushes a one-line fix after 1 minute, and the PR ends with a cancelled full run and no full-suite verdict for its head commit. The README documents the cancel ("the code it was testing is stale"), and D-04 says later pushes re-run only with the label, so this is consistent with the design. It is still a trap, because the cancelled check can look like a failure.
**Fix:** If a verdict on the head commit matters, give a push that will be skipped its own group, as the other-label case already does, so that it cancels nothing. Otherwise keep the behaviour and say in the README that a quick push after "ready" needs the `full-tests` label to get a result.

### IN-03: The required quick gate downloads luacheck with no retry

**File:** `.github/workflows/verify.yml:55`, `.github/workflows/lua-suite.yml:64`
**Issue:** `curl -fsSL` fails the "Quick checks" job, the required merge check, on one transient 5xx or a connection reset from the GitHub release CDN. The checksum guards integrity but not availability. The same applies to `apt-get`, which was already the case before this phase.
**Fix:** `curl -fsSL --retry 3 --retry-delay 2 --retry-all-errors -o "$RUNNER_TEMP/luacheck" "$LUACHECK_URL"`. `workflows.test.mjs:312` matches `"$LUACHECK_URL"\s*&&`, so keep the URL as the last argument.

### IN-04: The probe's default worker count invites timeouts that silently grow the keep-full lists

**File:** `scripts/login-scope-probe.mjs:47`
**Issue:** Without `--workers` the probe uses the config default (all cores; 16 here). CONTEXT records 30 s timeouts at that contention. A timed-out case has status `failed`, so `--write` puts it on its file's keep-full list. The direction is safe (it only gives up speed), but the committed data then depends on the machine load of the run that wrote it, and nothing flags it.
**Fix:** Default `--workers` to `2` in the probe, as `npm run timing` does, or print the number of keep-full cases whose failure message was a timeout.

### IN-05: The full suite now runs the UI preview on every ready-for-review pull request

**File:** `.github/workflows/full-suite.yml:70`
**Issue:** `preview: ${{ github.event_name != 'workflow_dispatch' || inputs.preview }}` is true for every `pull_request` event. The preview job installs Playwright and Chromium with `--with-deps` and bills its own minutes in parallel. This was true for labelled runs before. After this phase it also applies to every PR opened ready or marked ready, against the project's free-tier minute constraint. The wall time is unaffected because the jobs run in parallel.
**Fix:** If the minutes matter, pass `preview: ${{ github.event_name == 'workflow_dispatch' && inputs.preview }}` and keep it as an opt-in from the Actions tab. Otherwise leave as is, since the README says the full suite includes the preview.

---

_Reviewed: 2026-10-11T13:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
