---
phase: 03-fast-suite-and-ci-gate
plan: 05
subsystem: ci
tags: [github-actions, luacheck, sha256, supply-chain, nvmrc, fengari, vitest]

requires:
  - phase: 03-fast-suite-and-ci-gate
    provides: plan 03-02 (the workflow text readers and tests in scripts/workflows.test.mjs); plan 03-03 (profiler, no code dependency)
provides:
  - "verify.yml and lua-suite.yml install luacheck 1.2.0 from the official release binary, only after sha256sum -c accepts a pinned, twice-verified digest"
  - ".nvmrc (24) read by every actions/setup-node step; .nvmrc left out of the CurseForge package"
  - "fengari pinned to exactly 0.1.5 in package.json and the lock root, no other lock line changed"
  - "scripts/workflows.test.mjs: the digest as a constant both workflows must equal, step-order and fail-closed checks, .nvmrc wiring, fengari pin"
affects: [03-06, 03-07]

plan_head_before: cec181de6d3c0481083cece93f5ca99263954984
plan_head_after: a2c9d21f2156a00ea343190c4a27b0074b76ce3f

actuals:
  tokens: 3130
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "download, sha256sum -c, then sudo install, joined by && so the install never runs after a bad check"
    - "the verified digest held as a test constant that every workflow copy must equal"

key-files:
  created:
    - .nvmrc
  modified:
    - .github/workflows/verify.yml
    - .github/workflows/lua-suite.yml
    - .github/workflows/release.yml
    - scripts/workflows.test.mjs
    - .pkgmeta
    - package.json
    - package-lock.json

key-decisions:
  - "The foreground luacheck step in lua-suite.yml is one && chain that is the last thing in the script: under bash -e a failing member of an && list that is not last does not stop the script, so the chain must end the step for a bad check to fail it (a test pins this)"
  - "verify.yml's tools group log is tools.log (was apt.log) and the wait variable tools_pid, since the group now holds more than apt"
  - "CI-05 is not ticked: plan 03-07 also declares it"

requirements-completed: []

coverage:
  - id: D1
    description: "The luacheck 1.2.0 digest was confirmed a second way before it was written into any workflow"
    requirement: CI-05
    verification:
      - kind: other
        ref: "fresh download, 835048 bytes, sha256sum -c against research's digest: OK, exit 0; one digit changed: FAILED, exit 1"
        status: pass
      - kind: other
        ref: "gpg --verify luacheck.asc luacheck with the key fetched from keys.openpgp.org and github.com/alerque.gpg: Good signature"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both workflows pin exactly the verified digest and URL in a step env, install only after sha256sum -c, no longer install the apt luacheck package, still install lua5.1 and run luacheck --no-color ."
    requirement: CI-05
    verification:
      - kind: unit
        ref: "scripts/workflows.test.mjs (5 new cases for the luacheck steps; 5 failed before the edit)"
        status: pass
    human_judgment: false
  - id: D3
    description: ".nvmrc is 24 and in .pkgmeta's ignore list; fengari is exactly 0.1.5 in package.json and the lock root and resolved entry"
    requirement: CI-05
    verification:
      - kind: unit
        ref: "scripts/workflows.test.mjs (2 cases) and scripts/pkgmeta.test.mjs"
        status: pass
      - kind: other
        ref: "npm ci --dry-run --ignore-scripts exit 0; git diff --numstat: 1 1 for package.json and package-lock.json"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every actions/setup-node step (two in lua-suite.yml, one each in verify.yml and release.yml) reads .nvmrc and keeps cache: npm; no workflow names node-version"
    requirement: CI-05
    verification:
      - kind: unit
        ref: "scripts/workflows.test.mjs (2 cases; failed before the edit)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The luacheck binary runs on ubuntu-latest; lua5.1 still needs apt; node-version-file works on setup-node@v7; Node 24 sets up and the Playwright preview job runs on it"
    requirement: CI-05
    verification: []
    human_judgment: true
    rationale: "Hosted runner behaviour (assumptions A3, A4, A6) cannot be observed until billing clears (D-01)"

duration: 12min
completed: 2026-10-11
status: complete
---

# Phase 3 Plan 05: Toolchain pins Summary

**CI installs luacheck 1.2.0 from its official release binary only after `sha256sum -c` accepts a digest that was confirmed by a second download and the release signature; every `setup-node` step reads `.nvmrc` (Node 24); fengari is pinned to exactly 0.1.5.**

## Digest evidence (task 3-05-01)

Gathered on 2026-10-10 before any workflow was edited:

| Check | Result |
| --- | --- |
| Fresh download of `v1.2.0/luacheck`, `sha256sum -c` against research's `d68da17fca0697d9e2fb04201f3884abd259fa558b3a449bccaed47f1390defc` | OK, exit 0 |
| Size | 835048 bytes (as planned) |
| Same check with the last hex digit changed (`...defd`) | FAILED, exit 1 (fails closed) |
| `luacheck.asc` | signed by key `89793084D5E649FAB8B61C65B538286DE04ECFE5` (primary `9F37 7DDB 6D31 53A4 8EB3 EB1E 63CC 4964 7526 7693`, Caleb Maclennan) |
| Signer key source | fetched by fingerprint from `keys.openpgp.org` and from `github.com/alerque.gpg` (`alerque` is the release author per the releases API), imported into a throwaway gpg home under `coverage/luacheck-verify/` |
| `gpg --verify` | Good signature (gpg warns the key is not in a web of trust, which is expected: it is not certified by anything this machine trusts) |
| Release API `digest` field for the asset | absent (null) |

The signature trust is therefore "two independent key channels agree and the signature is good", not a certified identity. The digest in the workflows is the one research recorded, matched by an independent download.

## Accomplishments

- `verify.yml`: the background tools group is now one `&&` chain (apt update, apt install `lua5.1`, `curl` the release URL, `sha256sum -c`, `sudo install`) logged to `tools.log` beside `npm ci`; the `wait` still fails the step and prints the log. The luacheck step prints `luacheck --version` first.
- `lua-suite.yml`: the same chain in the foreground, last in the step script; same version print.
- `scripts/workflows.test.mjs`: 9 new cases (31 -> 40 in the file; 5 in task 1, 2 in task 2, 2 in task 3): digest constant equality in both workflows, chain order, no `${{` in those scripts, the verify background/wait shape, the lua-suite chain ending the script, no apt luacheck package, `.nvmrc` content and `.pkgmeta` entry, the fengari pin, setup-node steps per file, no `node-version:` key.
- `.nvmrc` (`24`), `.pkgmeta` ignore entry, `package.json` and `package-lock.json` one line each.

## Task Commits

1. **Task 1 (3-05-01): luacheck 1.2.0 release binary, pinned by a verified SHA-256** - `e762bcf`
2. **Task 2 (3-05-02): .nvmrc for Node 24; pin fengari to exactly 0.1.5** - `7d190c7`
3. **Task 3 (3-05-03): setup-node reads .nvmrc (Node 24)** - `a2c9d21`

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Decisions Made

See key-decisions. The tracer gate was met by re-running the verify block end to end (workflow tests, quality, quick suite), not by a human checkpoint; no `blocking-human` gate was set.

## Deviations from Plan

None - plan executed exactly as written. Small judgement calls inside the plan's words: the chain is also the last statement in the lua-suite step (see key-decisions), and the log file in `verify.yml` is `tools.log` rather than `apt.log`.

## Issues Encountered

- Running `gpg --list-packets` created an empty `~/.gnupg` in the user's home before the throwaway `--homedir` was used. It holds no keys; nothing else outside the repository was touched.
- No step executed the downloaded Linux binary (this machine is Windows); only its hash and signature were checked.

## Open hosted checks (cannot be verified until billing clears, D-01)

- A3: the luacheck 1.2.0 release binary runs on `ubuntu-latest` (a statically linked ELF; not executed here).
- A4: `lua5.1` (for `luac5.1 -p`) still needs apt and installs as written.
- A6: `node-version-file: .nvmrc` is accepted by `actions/setup-node@v7`, Node 24 sets up with `cache: npm`, and the Playwright preview job (`playwright@1.56.1`) runs on Node 24.
- The `wait "$tools_pid" || { cat tools.log; exit 1; }` shape fails the verify step on a bad digest (proved locally only for `sha256sum -c` exiting non-zero; the workflow text order is pinned by tests).

## For the user

- Stale sentences remain only in `.planning/codebase/STACK.md` and `INTEGRATIONS.md` (Node 22, the apt luacheck package, "no .nvmrc"); they describe the codebase before this plan and were not in its file list. `CLAUDE.md`, the README and `docs/` do not mention them.
- The pinned digest's authority is the release author's signature plus two matching downloads. If you want a certified identity, verify fingerprint `9F37 7DDB 6D31 53A4 8EB3 EB1E 63CC 4964 7526 7693` against a source you trust.

## Known Stubs

None.

## Threat Flags

None. The new external artefact (the luacheck binary) is the one T-03-11 and T-03-SC5 cover; digest and URL come from step `env:`, never from `${{ }}` inside `run:` (T-03-12, tested); `.nvmrc` is the single Node source and tested (T-03-13); the fengari pin is tested (T-03-14). No npm package added or upgraded.

## Self-Check: PASSED

- `.nvmrc` exists; commits `e762bcf`, `7d190c7` and `a2c9d21` are ancestors of HEAD; `git rev-list --count` from the plan base gives 3.
- `npm test -- scripts/workflows.test.mjs scripts/pkgmeta.test.mjs` 42 passed; `npm run quality` OK; `npm run test:quick` 229 passed; `npm ci --dry-run --ignore-scripts` exit 0.

---
*Phase: 03-fast-suite-and-ci-gate*
*Completed: 2026-10-11*
