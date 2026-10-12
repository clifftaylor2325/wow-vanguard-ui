# Spike: code quality checks for Vanguard

Spike run 2026-10-11. Question: which code quality checks should the repo add, and in what order?

This file has two parts:

1. **Repo fit** (below): what Vanguard already has, what is missing, and the priorities that follow. Read this first.
2. **Research** (further down): the general research, gathered for a WoW Lua addon without looking at this repo's code. It recommends a baseline that this repo mostly already has, so use it as background and for the sources, not as a to-do list.

Follow-up work is tracked in the issues linked from the tracking issue for this spike.

## Repo fit

### What Vanguard already has

The research's must-have tier is mostly in place. Checked against the repo at commit `81c6a65`:

| Research recommendation | In Vanguard today | Gap |
|---|---|---|
| luacheck on Lua 5.1, libs excluded | `.luacheckrc` with `std = "lua51"`, `Libs/` excluded; luacheck 1.2.0 installed in CI from the release binary after a SHA-256 check (`verify.yml`) | None. The globals list is hand-curated on purpose (CLAUDE.md: a name goes in `read_globals` when the addon starts using it), so the research's large generated Blizzard list would drop that inventory. Keep curated. A typo or removed API in `read_globals` is still accepted silently (nice-to-have) |
| Real Lua 5.1 parse (`luac -p`) | Runs over every file the TOC loads, in `verify.yml` and `lua-suite.yml`. It also fails on a missing file or a wrong-case path, because CI is Linux | None |
| Unit tests with an API stub layer | 64 area test files on a headless client (fengari, Lua 5.3) with Lua 5.1 shims, plus a **100% line-coverage floor** (`scripts/lua-coverage-floor.json`) | None. busted is not needed |
| Code rules beyond lint | `scripts/lib/code-quality.mjs`: function length and comment rules, theme-only colours and sizes, `ns.Guard` on hooks, click handlers and timers | New rules can extend this scanner (see "Pitfall heuristics") |
| One aggregate required check | The ruleset `main: pull requests with a green gate` requires `Quick checks`; admins can bypass | `verify.yml` has workflow-level `paths-ignore` for `docs/**` and `**.md`. GitHub leaves a required check pending when a workflow is skipped by a path filter, so a docs-only PR cannot satisfy it without a bypass |
| `.editorconfig` and `.gitattributes` | Both present (LF everywhere, 2-space indent) | None |
| Dependabot for Actions | `dependabot.yml`: monthly, grouped, for `github-actions` and `npm` | Actions are pinned by tag (`@v7`), not by commit SHA |
| Packaging checks | `check-zip.mjs`, `pkgmeta.test.mjs`, and the release workflow checks the tag against `## Version` | No packager dry run (the repo builds its own zip, so this is optional) |
| TOC validation | The TOC lists `Interface: 16001, 120007` | No check that every `.lua` under `Core/` or `Modules/` is listed. The harness and the coverage floor both walk the TOC, so an unlisted file is neither loaded nor counted. No duplicate, SavedVariables-vs-`.luacheckrc`, or Interface-value checks |
| Formatter | None; `.editorconfig` says 2 spaces | A decision is needed, and the cost is real (see below) |
| Pre-commit or pre-push hooks | None; `npm run verify` is run by hand | Gap |
| Secrets, spelling, Markdown lint | None | Gap |
| PR template, CODEOWNERS | None | A PR template would help (CLAUDE.md prescribes a PR shape). CODEOWNERS adds little with one maintainer and zero required approvals |
| WoW pitfall heuristics | Partial: `ns.Guard` is enforced; `ns.OutOfCombat` is used about 90 times but not enforced; about 27 lines mention `OnUpdate`; about 94 lines use `SetAttribute`, state drivers or secure handlers | Gap; overlaps issues #253 and #255 |
| XML validation | No `.xml` files in the repo | Not needed |
| LuaLS type diagnostics | None | Nice-to-have, non-blocking |
| Coverage reporting | 100% floor already | Not needed |

### Findings that change the plan

- **Docs-only PRs and the required check.** `verify.yml` skips docs-only changes with `paths-ignore`, and the ruleset requires `Quick checks`. Per GitHub's documentation, a required check from a workflow skipped by path filtering stays pending, which blocks the merge. The repo admin bypass covers it today. Worth confirming on a real docs-only PR (the PR that adds this file is one) and then fixing, because it costs nothing to fix and surprises the next contributor.
- **The scanner is the right home for WoW-specific checks.** The research proposed a separate heuristics script. `scripts/lib/code-quality.mjs` already tokenises Lua and knows each function's range, and the 10-line function rule makes per-function checks simple. New rules belong there, report-only first, with a baseline count that can only go down (the same ratchet idea as the coverage floor).
- **A formatter would interact with the function-length rule.** The scanner counts lines of code per function (maximum 10). A formatter that splits long calls across lines raises those counts and could push many functions over the limit. About 36,000 lines of Lua across 122 files would be reformatted, which also conflicts with parallel branches. Decide before adopting.
- **The test engine is Lua 5.3 with shims.** The harness patches number-to-string conversion and provides `unpack` and friends, and `luac -p` covers syntax. Remaining differences are semantic and subtle; there is no cheap automated fix, so this is a note, not a task.
- **The rename migration.** CLAUDE.md says the ForeverUI to Vanguard rename shipped in 0.4.0 with migration notes. The research's risk about orphaned settings is therefore about confirming the migration has a test, not about building one.
- **Repo visibility.** The API reports the repo as public, while workflow comments mention private-repository Actions minutes. If it is public, GitHub secret scanning and push protection are available at no cost. Check the settings page rather than assuming.

### Revised priorities for this repo

**Must-have**

1. TOC-versus-disk validation: orphan files, duplicates, SavedVariables names against `.luacheckrc`, expected Interface values. About 3 hours, one script plus tests, run in `verify.yml` and `lua-suite.yml`.

**Should-have**

2. Make docs-only PRs satisfy the required check. About 1 hour.
3. Static pitfall rules in the quality scanner (throttled or cleared `OnUpdate`; secure-frame calls only inside a combat-safe wrapper), report-only first. About 1 day.
4. A local pre-push hook running the quick checks. About 2 hours.
5. Hygiene bundle: secret scanning settings, spelling check, Markdown lint (its own path-filtered workflow, since `verify.yml` ignores docs), a PR template, SHA-pinned actions. About half a day in total.

**Decide first**

6. A Lua formatter, given the line-count interaction and the reformat cost.

**Nice-to-have** (listed on the tracking issue, not separate issues): a scheduled Interface-version drift check; LuaLS diagnostics, non-blocking; validating `read_globals` names against Blizzard's API documentation in a scheduled job.

---

## Research

The rest of this file is the research as written, without access to the repo. Sample configs use the formatter's defaults (tabs); this repo's `.editorconfig` uses 2 spaces, so adjust. Wording about third-party addons was generalised.

### Recommendation

Add one GitHub Actions "CI" workflow on top of five must-haves: luacheck targeting Lua 5.1 with a generated WoW-globals list, a real Lua 5.1 parse check (`luac -p`), StyLua in `--check` mode, a custom TOC validator that requires `## Interface: 16001`, and a single aggregate required status check. Then add lefthook so the same commands run locally on Windows before every commit. Unit tests (busted plus hand-written stubs), LuaLS type diagnostics and the hygiene checks (typos, markdownlint, gitleaks, Dependabot) come second. The must-have tier is roughly 1 to 1.5 days of work. The full rollout is roughly 4 to 6 days spread over a few weeks.

### TL;DR

- **Must-haves (about 1 to 1.5 days):** luacheck (`std = "lua51"` plus a vendored Blizzard globals list, libraries excluded), a `luac -p` parse with a real Lua 5.1, StyLua `--check` with `syntax = "Lua51"`, and a TOC validator. The validator checks that the Interface line includes 16001, that every listed file exists with exact case, that no `.lua` or `.xml` file is orphaned, and that SavedVariables are declared. Gate merges on one aggregate `ci-ok` job, protected by a branch ruleset.
- **Should-haves (about 2 to 3 days):** busted unit tests for pure logic (SavedVariables defaults and migrations, formatters, damage-meter math, aura and filter predicates) with a small WoW API stub layer. LuaLS `--check` using the community WoW API annotations, non-blocking at first. lefthook hooks for local runs. Dependabot for Actions, with actions pinned to SHAs. gitleaks, typos and markdownlint-cli2. CODEOWNERS and `.editorconfig`.
- **Nice-to-haves and limits:** heuristic WoW-specific "pitfall" greps (unthrottled `OnUpdate`, secure-frame changes without an `InCombatLockdown()` guard, table allocation in hot handlers), XML validation, a scheduled interface-version drift check, and PR-title conventions. Taint, combat lockdown and real performance cannot be proven outside the client. Automation can only flag suspicious patterns, so in-game smoke testing stays mandatory.

### Key findings

1. **The target is "modern API, Lua 5.1, Interface 16001."** WoW runs "a modified version of Lua 5.1 that supports taint," and the OS and file I/O libraries are removed. Forever uses the modern Mainline addon API, not the Classic Era API. The Warcraft Wiki TOC table lists **16001** for "Forever Beta" but leaves the "Forever Test" and "Forever" rows blank, so the number may change at launch. Patch 1.60.1 (build 70205, Oct 2 2026) shows 176 global APIs added and 10 removed compared with 12.1.5. Build 70291 (Oct 7) added a `"forever"` TOC game type equivalent to `"camelot"`, and build 70170 added a `WOW_PROJECT_CAMELOT` (18) constant.
2. **luacheck is still the standard WoW Lua linter.** It is at v1.2.0 (lunarmodules), ships a single-file 64-bit Windows binary and an official pre-commit hook, and is used by the BigWigsMods composite action that runs luacheck with Lua 5.1 in Docker. The hard part is the Blizzard globals list. Generated lists derived from Ketho/BlizzardInterfaceResources (for example Jayrgo/wow-luacheckrc, which publishes Mainline, Classic, BC and Wrath variants) solve it better than hand-curated lists. No Forever-specific list exists, so the Mainline list is the closest base.
3. **luacheck alone does not guarantee Lua 5.1 compatibility.** Its parser accepts Lua 5.1 to 5.4 and LuaJIT syntax, and the Windows binary bundles Lua 5.4.4. Code using `goto`, `//` or the 5.3 bitwise operators can pass luacheck and still fail to load in WoW. A `luac -p` pass with a real Lua 5.1.5 closes that gap cheaply.
4. **Unit testing is worthwhile for logic only.** busted supports Lua 5.1 and later, has `insulate` (which restores `_G` and `package.loaded`), and provides spies, stubs and mocks. Frames, secure templates, taint and combat lockdown are not realistically testable offline. Building a full WoW emulator is out of scope.
5. **The main CI design trap is GitHub's required-check semantics.** Required checks are matched by job name, matrix legs get suffixed names, and "required status checks do not take workflow, matrix, or event trigger types into account." A path-filtered workflow that never runs blocks a PR forever. One always-running aggregate job is the robust fix.

### Prioritized recommendation

| # | Check | Tier | Effort | Blocking? | Runs |
|---|---|---|---|---|---|
| 1 | luacheck (`lua51` + generated WoW globals + project globals, libs excluded) | Must | 3 to 4 h | Yes | Both |
| 2 | Lua 5.1 parse (`luac -p` on all non-lib `.lua`) | Must | 1 h | Yes | Both |
| 3 | StyLua `--check` + `.stylua.toml` + one-time reformat commit | Must | 2 h | Yes | Both |
| 4 | TOC validator script (Interface, file existence and case, orphans, SavedVariables, duplicates) | Must | 3 to 4 h | Yes | Both |
| 5 | CI workflow + aggregate `ci-ok` job + branch ruleset requiring it | Must | 2 to 3 h | Yes | CI |
| 6 | `.editorconfig` + `.gitattributes` (line endings) | Must | 0.5 h | n/a | Editor |
| 7 | lefthook pre-commit (luacheck, stylua, TOC check, typos, gitleaks on staged files) | Should | 2 h | Local only | Local |
| 8 | busted + stub layer + first specs for pure logic | Should | 1 to 1.5 d | Yes once at least one spec exists | Both |
| 9 | LuaLS `--check` with WoW API annotations | Should | 3 to 4 h | Non-blocking at first | Both |
| 10 | Dependabot (`github-actions`) + SHA-pinned actions + least-privilege `permissions:` | Should | 1 h | n/a | CI |
| 11 | gitleaks (secrets) + GitHub secret scanning and push protection | Should | 1 h | Yes | Both |
| 12 | typos (or codespell) with a WoW-term allowlist | Should | 1 h | Yes | Both |
| 13 | markdownlint-cli2 | Should | 1 h | Yes | Both |
| 14 | CODEOWNERS + PR template + agent instructions file | Should | 1 h | n/a | Repo |
| 15 | Packager dry-run on PRs (`.pkgmeta` sanity, zip builds) | Should | 2 h | Yes | CI |
| 16 | WoW pitfall heuristics (custom script) | Nice | 0.5 to 1 d | Warn only | Both |
| 17 | Scheduled interface-version drift check / toc-interface-updater | Nice | 1 to 2 h | n/a | CI (cron) |
| 18 | XML well-formedness (xmllint) | Nice | 1 h | Yes | Both |
| 19 | PR-title / Conventional Commits lint | Nice | 1 h | Yes | CI |
| 20 | Coverage reporting (luacov) | Nice | 1 to 2 h | No | CI |

### Details

#### 1. Static analysis and linting

**luacheck: primary linter.** Set `std = "lua51"` explicitly. luacheck's default std is `max`, which allows Lua 5.2 to 5.4 and LuaJIT globals that don't exist in WoW. Then add a WoW std for the client globals. Configuration supports `globals` (writable), `read_globals` (read-only), per-file overrides via `files[...]`, `exclude_files`, and named custom stds via `stds.<name>`. By default luacheck already applies `+busted` to `*_spec.lua` files under `spec/`, `test/` or `tests/`. luacheck caches results under `%LOCALAPPDATA%\Luacheck\Cache` on Windows.

**Handling the Blizzard globals: three options.**

- *Hand-curated `read_globals`* (the approach in the packager project's example luacheck config): precise, but noisy and high-churn. Every session that uses a new API either edits the list or adds suppressions.
- *Generated full list* (Jayrgo/wow-luacheckrc, whose README describes it as "A .luacheckrc parsed from Ketho/BlizzardInterfaceResources"): near-zero false positives. With every real global known, an "undefined variable" warning almost always points to a genuine typo or a missing local. Its GitHub page showed a last update of Aug 3 2024, so the list may lag recent builds. Vendor the Mainline variant at a pinned commit under `tools/luacheck/`, then generate the committed `.luacheckrc` by concatenating it with a small project section, so contributors never hand-edit the big file.
- *Pattern ignores* such as ignoring all uppercase constants: cheap, but they hide real typos. Avoid them except for clearly scoped cases.

**Key warning codes to keep enabled.** 111/112 catch accidental global writes, the most common WoW namespace-leak bug. 113 catches undefined globals and typos. 121/122 catch writes to read-only (Blizzard) globals and fields. Overwriting a Blizzard function is a classic taint source, so this is the closest luacheck gets to a taint check. 211/311 catch unused values. 421/431 catch shadowing. 581/582 catch error-prone negations. Usual WoW-friendly relaxations are `max_line_length = false` (a formatter owns layout) and ignoring `212/self`.

**Forever caveat.** The Mainline list is generated from retail builds. Forever removed 10 global APIs relative to 12.1.5, so luacheck will accept a call to a removed API. Treat in-game testing (and LuaLS, below) as the backstop, and add a `not_globals` entry for any removed API the team discovers.

**selene: not recommended as the primary linter.** It is fast (Rust), has richer argument-aware std definitions in YAML (`base: lua51`), and supports custom standard libraries. But no maintained WoW std turned up in this research. Adopting it would mean building and maintaining one, which duplicates what the luacheck ecosystem already provides. Revisit only if luacheck stalls.

**Lua language server (LuaLS) diagnostics: a second tier.** The Ketho "WoW API" extension (34,110 installs on the VS Code Marketplace) includes the WoW Lua 5.1 environment, loads Blizzard's API documentation, and parses Warcraft Wiki docs into LuaLS annotations. Headless `lua-language-server --check <dir>` writes `check.json` to the log path. `--checklevel` defaults to `Warning`, and `--configpath` overrides the workspace `.luarc.json`. It catches wrong argument counts and types and undefined fields on `C_*` namespaces, which luacheck cannot. Costs: the annotations track retail, not Forever, so expect false positives on Forever-specific APIs. A past issue (#2038) reported unexpected behaviour when combining `--configpath` with `--check`. Run it in CI as non-blocking, failing only on Error severity, then tighten once the noise is known.

**Lua version target.** Use Lua 5.1 everywhere: luacheck `std = "lua51"`, StyLua `syntax = "Lua51"`, LuaLS `runtime.version = "Lua 5.1"`, busted under Lua 5.1.5, and `luac -p` from Lua 5.1.5. WoW-specific additions such as the `bit` library, `strsplit`, `strtrim` and `wipe`/`table.wipe` come from the WoW std list, not from the Lua version setting.

#### 2. Formatting and editor config

**StyLua** is the de facto Lua formatter. It is opinionated and Prettier-like, and runs as a single binary on Windows. Set `syntax = "Lua51"` so ambiguous newer syntax is rejected rather than formatted. The defaults are tabs, `column_width = 120`, Unix line endings and `AutoPreferDouble` quotes. `stylua --check` exits non-zero when files would change, which suits CI. The official `JohnnyMorganz/stylua-action` uses prebuilt release binaries for fast startup. StyLua 2.4.0 added `stylua_syntax` support in `.editorconfig` and fixed the LSP ignoring `.stylua.toml` on Windows. Exclude embedded libraries with `.styluaignore`. Do the initial reformat as one dedicated commit and list it in `.git-blame-ignore-revs`.

**EditorConfig and `.gitattributes`.** On a Windows-developed repo, CRLF/LF churn is the most common source of noisy diffs. Pin `* text=auto eol=lf` in `.gitattributes`, set `end_of_line = lf`, `charset = utf-8` and `insert_final_newline = true` in `.editorconfig`, and match StyLua's `line_endings = "Unix"`.

#### 3. Unit testing outside the client

**Tooling.** busted (docs for 2.1.1) works with Lua 5.1 and later. A `.busted` file in the repo root holds defaults. Each test file runs in an `insulate` block by default, which snapshots and restores `_G` and `package.loaded`. A busted issue (#534) reports that changes to fields of globals can still leak between blocks. Use `spy.on`, `stub(t, "fn")` and `mock(t, true)` for WoW API calls. In CI, install Lua with `leafo/gh-actions-lua@v13`. Its default `luaVersion` is now 5.5, so you must set `luaVersion: "5.1.5"`. Install LuaRocks with `leafo/gh-actions-luarocks@v6` (default LuaRocks 3.13.0). gh-actions-lua has enabled build caching by default since v9. On Windows runners it needs `step-security/msvc-dev-cmd@v1` first.

**Stub strategy.** Write a small, project-owned `spec/helpers/wow_stubs.lua` covering only what the tested modules touch: `CreateFrame` returning a table with no-op `SetScript`/`RegisterEvent`/`SetPoint`, `C_Timer.After`, `GetTime`, `UnitName`, `wipe`, `strsplit`, `bit`. Load addon files the way the client does, `loadfile(path)("Vanguard", ns)`, so the `local addonName, ns = ...` idiom works. In-game test frameworks run tests inside the client; they are useful for manual smoke suites but cannot run in CI.

**What is realistically testable:**

- *High value:* SavedVariables defaults merging and version migrations (important given the ForeverUI to Vanguard rename), slash-command parsing, number and time formatting, damage-meter aggregation math, aura and filter predicates, profile import/export serialization, and layout math that is pure arithmetic.
- *Moderate:* event-dispatch tables (fire a fake event, assert handler calls via spies), throttling logic driven by a fake clock.
- *Not worth it offline:* rendering, anchoring and visual layout, secure templates, click-casting attributes, taint, combat lockdown, and anything depending on real Blizzard frame behaviour or Forever "secret values."

Implication: refactor toward "thin frame glue, fat pure modules." That design pays off whether or not test coverage grows.

#### 4. TOC and packaging validation

**Interface version.** The Forever Beta value is 16001, which the wiki derives from `/dump select(4, GetBuildInfo())`. The TOC can carry comma-separated values (`## Interface: 16001, 120100`), and BigWigs packager v2.3.0 and later treats "every interface value in every (non-external) TOC file" as a supported version when uploading. If Vanguard is Forever-only, consider `## AllowLoadGameType: forever` together with `## ExcludeLoadGameType: standard, classic`. The wiki notes that unrecognized game types load anyway on other clients, so the exclude line matters. The TOC file name must match its folder name.

**Custom validator (must-have).** Write a script of about 150 lines that:

- requires `## Interface:` to include the expected value(s) from a single config constant (`EXPECTED_INTERFACE = {16001}`), and fails if any TOC disagrees;
- resolves every listed file relative to the TOC and checks **exact case**. Windows is case-insensitive, so a wrong-case path works for the developer but not on case-sensitive systems or CI;
- flags `.lua` and `.xml` files on disk that no TOC or included XML references (orphans, which AI sessions often create);
- flags duplicates, forward- and back-slash inconsistencies, and BOM or encoding issues;
- checks that every `## SavedVariables` / `## SavedVariablesPerCharacter` name appears in `.luacheckrc` `globals`;
- checks that required metadata (`Title`, `Version` or the `@project-version@` keyword) is present.

**Packager.** BigWigs packager reads `.pkgmeta` (`package-as`, `externals`, `ignore`, `enable-nolib-creation`, `embedded-libraries`). It supports Forever as of its PR #202. A PR-time dry run (`BigWigsMods/packager@v2` with `-d` for no upload, or `-z` to skip the zip) catches broken externals and ignore rules. Pin the packager to a commit SHA and give only the release job `contents: write` and the upload tokens, ideally inside a protected GitHub Environment. For keeping Interface values current, `p3lim/toc-interface-updater` added Forever (Beta) support in v4.16 under the "Camelot" name. Run it on a schedule so it opens PRs, rather than auto-committing.

#### 5. Library and embedded-lib hygiene

- **Exclude libs from every check**: `exclude_files = {"Libs/**"}` for luacheck, `.styluaignore`, LuaLS `workspace.ignoreDir`, typos `extend-exclude`, and the orphan check. Third-party code is not yours to reformat or lint.
- **Prefer packager `externals` over vendoring** where possible: the packager fetches libraries at build time and marks them embedded. If you vendor, which is reasonable for reproducibility and supply-chain review, record each library's source URL, revision and minor version (`LibStub:NewLibrary("Name-1.0", MINOR)`) in a `Libs/README.md` or manifest. Add a CI check that the manifest matches the `MINOR` constants actually present.
- **LibStub semantics**: the highest MINOR loaded wins across all addons, so embedding an old library is mostly harmless but stale. A nice-to-have check can warn when an embedded library's MINOR is below the manifest's "latest known."
- Make sure the TOC (or an `embeds.xml`) loads LibStub, then CallbackHandler, then the other libraries in dependency order. The TOC validator can enforce that LibStub appears first.

#### 6. WoW-specific performance and correctness pitfalls

| Pitfall | Automatable? | How |
|---|---|---|
| Global namespace leaks | Yes, reliably | luacheck 111/112/113. Keep all state on the private `ns` table, and allow only the addon table, SavedVariables, `SLASH_*` and frame-name globals |
| Overwriting Blizzard functions (taint) | Mostly | luacheck 121/122 on read-only globals. Grep for `_G[...] =` and `_G.X =`. Require `hooksecurefunc` for post-hooks |
| Secure-frame changes in combat | Heuristic | The wiki says addons "should check InCombatLockdown() before creating secure frames, setting their attributes, or reconfiguring their attributes." Flag `SetAttribute`, `Secure*Template` and protected `Show`/`Hide`/`SetPoint` on secure frames outside functions containing an `InCombatLockdown()` guard or a `PLAYER_REGEN_ENABLED` deferral queue. Warn only |
| Protected API misuse | Partial | Wiki categories: *protected* (fires `ADDON_ACTION_FORBIDDEN`), *nocombat* and *secureframe* (fire `ADDON_ACTION_BLOCKED`). A denylist of known protected calls can flag them for review |
| Unbounded `OnUpdate` | Heuristic | Flag `SetScript("OnUpdate", ...)` whose handler has no elapsed-accumulator or throttle and is never cleared with `SetScript("OnUpdate", nil)`. Prefer `C_Timer` or event-driven updates |
| Garbage in hot paths | Heuristic | Flag `{}`, closures, `..` concatenation and `string.format` inside `OnUpdate`, combat-log style or `UNIT_AURA` handlers. Reuse tables with `wipe` |
| Real taint and CPU cost | No | In-game only: `/console taintLog 1`, the addon CPU profiler, and an error-capture addon during smoke tests |

Implement the heuristics as a script that emits `file:line: [rule] message` in warning-only mode. GitHub renders these as annotations via `::warning file=...,line=...::`. Promote individual rules to blocking only after they prove low-noise.

#### 7. Hooks and CI design

**pre-commit versus lefthook.** The pre-commit framework has the largest hook catalog (gitleaks, typos, codespell and markdownlint-cli2 are all listed), and luacheck ships an official hook. But it needs Python, and its Lua language support installs through LuaRocks, which is awkward on Windows. lefthook is a single Go binary, runs hooks in parallel, and is configured in plain YAML. lefthook's own wiki benchmark, run on the Discourse project, reports it about 300% faster than pre-commit; that comes from the vendor, so treat it as indicative. Recommendation: lefthook, calling locally installed binaries (`scoop` or `winget` for luacheck, stylua, typos, gitleaks, plus Lua 5.1 for `luac`). Run checks on staged files at pre-commit and the full suite at pre-push. Hooks can be skipped (`LEFTHOOK=0`, `--no-verify`), so **CI is the source of truth**. Document one command in the agent instructions file (`CLAUDE.md` or `AGENTS.md`) so every AI session self-checks before opening a PR.

**Workflow shape.**

- Run one workflow on `pull_request`, `push: main` and `merge_group`. `merge_group` is required if you enable a merge queue.
- Use parallel jobs `lint`, `toc`, `test` and `hygiene`, plus an aggregate `ci-ok` job with `needs: [...]` and `if: always()` that fails unless every dependency is `success` or `skipped`. **Require only `ci-ok`** in the ruleset, so renaming jobs or adding matrix legs never breaks branch protection.
- Use **no workflow-level `paths:` filters** on required workflows. Skip at job level instead, because skipped jobs count as passing.
- Use **no OS matrix** for lint. Ubuntu is fastest, and Windows developers already run the same tools locally. Optionally add a `windows-latest` leg of the `test` job, non-required, to keep the local Windows scripts honest.
- **Caching:** gh-actions-lua's built-in build cache, `actions/cache` for the `.luarocks` tree keyed on a hash of the busted dependency list, and the luacheck cache directory. Expect under 2 minutes wall time.
- **Security:** `permissions: contents: read` at the top level, actions pinned to full SHAs with `# vX` comments, and `concurrency` with `cancel-in-progress` for PR runs.

**Branch protection.** Use a ruleset on `main`: require a PR, require status check `ci-ok`, require branches to be up to date (or use the merge queue), block force-pushes and deletions, and require linear history if you squash-merge. Require CODEOWNERS review only if a human other than the PR author can approve (see risks).

#### 8. Other repo hygiene

- **Secrets:** gitleaks as a pre-commit hook and CI job. Also enable GitHub secret scanning and push protection.
- **Spelling:** `typos` (crate-ci, single binary, low false-positive rate) is preferred over codespell on Windows. Seed `_typos.toml` with WoW vocabulary and exclude `Libs/` and locale files.
- **Markdown:** `markdownlint-cli2` with `DavidAnson/markdownlint-cli2-action` (v24.0.0) and a single `.markdownlint-cli2.jsonc`.
- **Dependabot:** `package-ecosystem: github-actions`, grouped. It advances SHA pins and keeps the trailing version comment in sync. Pinning without Dependabot just trades tag-hijack risk for stale-action risk.
- **Conventions:** Conventional Commits or PR-title linting make auto-generated changelogs readable. Add a PR template with a checklist: ran the local checks, tested in-game on Forever build X, touches secure frames? Y/N.
- **CODEOWNERS:** `* @clifftaylor2325`, plus stricter paths for `.github/`, `*.toc` and `.pkgmeta`.
- **Optional:** `actionlint` for workflow files.

### Suggested rollout order (from the research)

1. **Foundations (day 1):** `.editorconfig`, `.gitattributes`, `.stylua.toml`, `.styluaignore`, one reformat commit, `.git-blame-ignore-revs`.
2. **Lint (day 1 to 2):** vendored WoW globals plus `.luacheckrc`, fix or annotate the existing warnings, `luac -p` parse, CI `lint` job.
3. **TOC validator (day 2):** the validator script, a CI `toc` job and the `ci-ok` aggregate. Then turn on the ruleset requiring `ci-ok`.
4. **Local loop (day 3):** `lefthook.yml`, Windows install notes, agent-instructions section, PR template, CODEOWNERS.
5. **Supply chain (day 3):** SHA pins, `permissions:`, Dependabot, gitleaks, typos, markdownlint-cli2.
6. **Tests (week 2):** busted, stubs, first specs for SavedVariables migration and formatters. Add `test` to `ci-ok`.
7. **LuaLS non-blocking (week 2):** `.luarc.json`, CI job with `continue-on-error: true`. Review the noise after 2 weeks.
8. **Nice-to-haves (week 3 onward):** pitfall heuristics (warn-only), packager dry-run, interface drift cron, XML well-formedness.

For this repo, steps 1, 2 (mostly), 6 and parts of 5 already exist; see "Repo fit".

### Example configuration

**`.luacheckrc` (project section, appended to a vendored Mainline globals list)**

```lua
std = "lua51+wow"            -- 'wow' std comes from the vendored generated list
max_line_length = false      -- the formatter owns layout
codes = true

exclude_files = {
  "Libs/**",
  ".release/**",             -- packager output
  "tools/luacheck/**",
}

ignore = {
  "212/self",                -- unused self in mixins/methods
  "212/event",               -- unused event arg in handlers
}

-- Only these globals may be WRITTEN by Vanguard
globals = {
  "Vanguard",
  "VanguardDB", "VanguardCharDB",   -- must match ## SavedVariables in the TOC
  "SLASH_VANGUARD1", "SLASH_VANGUARD2",
  "SlashCmdList",
  "StaticPopupDialogs",
}

read_globals = {
  "LibStub",
}

-- Forever-specific removals discovered in testing go here:
not_globals = {
  -- "SomeRemovedApi",
}

files["spec/**/*_spec.lua"] = { std = "+busted" }
```

**`.stylua.toml`**

```toml
syntax = "Lua51"
column_width = 120
line_endings = "Unix"
indent_type = "Tabs"
indent_width = 4
quote_style = "AutoPreferDouble"
call_parentheses = "Always"
```

**`.luarc.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json",
  "runtime.version": "Lua 5.1",
  "workspace.library": ["tools/wow-api-annotations/Annotations/Core"],
  "workspace.ignoreDir": ["Libs", ".release"],
  "diagnostics.globals": ["VanguardDB", "VanguardCharDB"]
}
```

**`lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    stylua:
      glob: "*.lua"
      exclude: "Libs/**"
      run: stylua --check {staged_files}
    luacheck:
      glob: "*.lua"
      exclude: "Libs/**"
      run: luacheck -q {staged_files}
    luac:
      glob: "*.lua"
      exclude: "Libs/**"
      run: luac5.1 -p {staged_files}
    typos:
      run: typos {staged_files}
    gitleaks:
      run: gitleaks protect --staged --redact
pre-push:
  commands:
    tests:
      run: npm run test:quick
```

**`.github/workflows/ci.yml` (outline; replace `<sha>` with pinned SHAs)**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
  merge_group:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: JohnnyMorganz/stylua-action@<sha>
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          version: latest                        # pin a concrete version in practice
          args: --check .

  hygiene:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
        with: { fetch-depth: 0 }
      - uses: crate-ci/typos@<sha>
      - uses: DavidAnson/markdownlint-cli2-action@<sha>   # v24

  ci-ok:
    if: always()
    needs: [lint, hygiene]
    runs-on: ubuntu-latest
    steps:
      - run: |
          for r in ${{ join(needs.*.result, ' ') }}; do
            [[ "$r" == "success" || "$r" == "skipped" ]] || exit 1
          done
```

**`.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
    groups:
      actions: { patterns: ["*"] }
```

### Risks and open questions

- **The Interface number may change at launch.** The wiki's "Forever" row is still blank. Keep the expected value in one constant used by the TOC validator, and add the scheduled drift check. Community guide sites disagree on what `WOW_PROJECT_ID` reports on build 69913 (one says 1, another says missing), and the wiki documents a `WOW_PROJECT_CAMELOT` (18) constant. Don't hard-code project IDs; compare against the constant.
- **The globals list is retail-derived.** Removed Forever APIs pass luacheck. LuaLS annotations are also retail-oriented. Both need in-game confirmation, plus a curated `not_globals` list that grows over time.
- **The rename (ForeverUI to Vanguard) may orphan user settings.** If the addon folder, TOC name or SavedVariables names changed, check that a migration path exists before shipping, and cover the migration logic with a test. (CLAUDE.md says this shipped in 0.4.0.)
- **Required reviews with a single maintainer.** If AI sessions open PRs under the maintainer's own account, GitHub won't let that account approve its own PR. Either don't require approvals and rely on the required check, or have the sessions use a separate bot or machine account. (The repo's ruleset already requires zero approvals.)
- **Packager flavor mapping.** Confirm that the pinned packager version maps 16001 to the Forever game version on CurseForge, which lists "1.60.1" for Forever, rather than retail. Pass `-g` explicitly if not.
- **Windows tool installation.** luacheck, stylua, typos, gitleaks and lefthook all ship Windows binaries, but a native Lua 5.1 `luac` on Windows needs a package such as Lua for Windows. Decide on one documented installer path (for example `scoop`) so every session gets identical versions.
- **Heuristic pitfall rules will produce false positives.** Keep them warn-only, and promote individual rules only when they are near-silent on main.

### Caveats

- Several Forever facts (Interface 16001, the `forever` game type, the API delta counts) come from the community-maintained Warcraft Wiki for a beta client as of early October 2026 and may change before or after launch. Community guide sites were used only for corroboration, and they disagree with each other on some build details.
- Performance claims for lefthook come from its own wiki benchmark on the Discourse project. Version numbers for actions (checkout v7, gh-actions-lua v13, gh-actions-luarocks v6, markdownlint-cli2-action v24) reflect their READMEs at research time.
- The research drew only on generic tooling and community documentation.

### Sources

Generic tooling and documentation only.

**WoW client, TOC and Forever**

- [Lua functions (Warcraft Wiki)](https://warcraft.wiki.gg/wiki/Lua_functions)
- [Patch 1.60.1 API changes (Warcraft Wiki)](https://warcraft.wiki.gg/wiki/Patch_1.60.1/API_changes)
- [TOC format (Warcraft Wiki)](https://warcraft.wiki.gg/wiki/TOC_format)
- [TOC format (Wowpedia)](https://wowpedia.fandom.com/wiki/TOC_format)
- [Secure Execution and Tainting (Warcraft Wiki)](https://warcraft.wiki.gg/wiki/Secure_Execution_and_Tainting)
- [Restricted API functions (Warcraft Wiki)](https://warcraft.wiki.gg/wiki/Category:API_functions/restricted)
- [Addon developer guide (community guide site)](https://wowforeverguides.com/addons/developers)
- [Addons overview (community guide site)](https://wowforeverguides.com/addons)
- [Code templates (community guide site)](https://wowforeverguides.com/addons/code-templates)
- [toc-interface-updater v4.16](https://github.com/p3lim/toc-interface-updater/releases/tag/v4.16)

**Linting and formatting**

- [luacheck](https://github.com/lunarmodules/luacheck)
- [luacheck releases](https://github.com/lunarmodules/luacheck/releases)
- [luacheck CLI docs](https://luacheck.readthedocs.io/en/stable/cli.html)
- [luacheck config docs](https://luacheck.readthedocs.io/en/stable/config.html)
- [luacheck GitHub Action](https://github.com/BigWigsMods/luacheck)
- [Example .luacheckrc](https://github.com/BigWigsMods/luacheck/blob/main/.luacheckrc.example)
- [Generated WoW luacheckrc](https://github.com/Jayrgo/wow-luacheckrc/blob/mainline/README.md)
- [selene configuration](https://kampfkarren.github.io/selene/usage/configuration.html)
- [selene standard libraries](https://kampfkarren.github.io/selene/usage/std.html)
- [StyLua](https://github.com/JohnnyMorganz/StyLua)
- [StyLua README (v2.3.1)](https://github.com/JohnnyMorganz/StyLua/blob/v2.3.1/README.md)
- [StyLua releases](https://github.com/JohnnyMorganz/StyLua/releases)

**Lua language server**

- [WoW API extension (VS Code Marketplace)](https://marketplace.visualstudio.com/items?itemName=ketho.wow-api)
- [LuaLS usage](https://luals.github.io/wiki/usage/)
- [LuaLS diagnosis report](https://github.com/LuaLS/lua-language-server/wiki/Diagnosis-Report)
- [LuaLS issue 2038](https://github.com/LuaLS/lua-language-server/issues/2038)

**Testing**

- [busted docs](https://lunarmodules.github.io/busted/)
- [busted issue 534](https://github.com/lunarmodules/busted/issues/534)
- [gh-actions-lua](https://github.com/leafo/gh-actions-lua)
- [gh-actions-lua releases](https://github.com/leafo/gh-actions-lua/releases)
- [gh-actions-luarocks](https://github.com/leafo/gh-actions-luarocks)

**Packaging**

- [BigWigsMods packager](https://github.com/BigWigsMods/packager)

**Hooks and CI**

- [pre-commit hooks catalog](https://pre-commit.com/hooks.html)
- [Comparing code quality meta-tools](https://blog.urth.org/2020/05/08/comparing-code-quality-meta-tools/)
- [pre-commit vs lefthook vs husky (2026 guide)](https://www.pistack.xyz/posts/2026-04-26-pre-commit-vs-lefthook-vs-husky-git-hooks-management-guide-2026/)
- [Troubleshooting rulesets (GitHub Docs)](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules)
- [Troubleshooting required status checks (GitHub Docs)](https://docs.github.com/ko/enterprise-server@3.18/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)
- [Required checks discussion 26698](https://github.com/orgs/community/discussions/26698)
- [Required checks discussion 26822](https://github.com/orgs/community/discussions/26822)
- [Required checks discussion 60792](https://github.com/orgs/community/discussions/60792)
- [wait-for-status-checks](https://github.com/poseidon/wait-for-status-checks)

**Hygiene**

- [gitleaks](https://github.com/gitleaks)
- [markdownlint-cli2 action](https://github.com/marketplace/actions/markdownlint-cli2-action)
