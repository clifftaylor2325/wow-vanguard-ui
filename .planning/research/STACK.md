# Stack Research

**Domain:** Lua 5.1 World of Warcraft addon UI suite (WoW Forever, 12.1.5-era engine, interface 16001), with a Node-driven headless test harness, luacheck, line coverage and hosted-runner CI on the GitHub Free plan.
**Researched:** 2026-10-09
**Confidence:** MEDIUM overall. Versions, registry facts, repo branches and local timings are direct observations (HIGH). Forever-specific API behaviour comes from community-maintained dumps and wiki pages (MEDIUM, cross-checked against two sources where noted). Anything about GitHub billing details or the speed-up a different Lua VM would give is LOW until measured.

Scope note: this builds on `.planning/codebase/STACK.md` and does not repeat it. The existing stack (Lua 5.1 addon, Vitest 5, fengari, luacheck, custom coverage and quality scans) is **kept**. This file says what to keep, what to change, what to add, and what to avoid.

## Headline Findings

1. **The stack is right; the cost profile is wrong.** Measured today on this machine (16 threads): all 751 Lua-harness cases pass, but they sum to **2,622 s (43.7 CPU-minutes)**. Wall time was 6 m 42 s, bounded by one file (`more.test.mjs`, 400 s, 108 cases). On a 2-core hosted runner that is 22 minutes or more. The 5-minute target needs roughly a **4.4x** cut in CPU time. Tuning Vitest will not give that.
2. **The cost is the Lua VM running a full addon login, once per case.** In isolation, `createAddon` takes 125-175 ms warm (1.2 s cold) and `login()` takes 0.87-1.24 s warm. About 750 cases, several of them loading the addon more than once, put roughly half of the suite in login. The first thing to build is a Lua-level profiler, not a new runner.
3. **Do not shard to save minutes.** Sharding cuts wall-clock time only. GitHub bills each job by the started minute, and every shard repeats checkout and `npm ci`. It makes the minute bill larger.
4. **Forever's API data is available and should be used.** `Gethe/wow-ui-source` and `Ketho/BlizzardInterfaceResources` both have a `forever` branch (Forever build 1.60.1, commits dated 2026-10-06 to 2026-10-09). A script can check the addon's API names and the test stub's widget allow-list against it. Nothing in the repo does this today.
5. **A real launch risk in the TOC.** `## Interface: 16001, 120007`: the wiki lists 16001 as the Forever **beta** interface and gives no release value, and Midnight live is now 120100 (test 120105). If Forever ships with a different number the addon shows out of date on launch day. Add the real Forever release number to the TOC list the day it is known (cheap), and put it on the pre-launch checklist.

## Recommended Stack

### Core Technologies (keep)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Lua | 5.1 (game client) | Addon language | Fixed by the client. Syntax-checked in CI with `luac5.1 -p`; library calls checked by luacheck `std = "lua51"`. | HIGH |
| Node.js | **24 LTS** in CI and a pinned `.nvmrc` | Runs the harness, build scripts, Vitest | Local dev is v24.14.0 but CI pins 22 and no `.nvmrc` exists, so CI and local differ. Node 24 is the current LTS line; 22 is in maintenance. Same major everywhere removes "passes locally, differs in CI" for a fengari-heavy suite (V8 version affects speed). | MEDIUM (LTS dates from training data, not re-checked) |
| Vitest | **5.0.3** (exact) | Test runner for JS and Lua-harness cases | Current on npm (published 2026-09-30). `package.json` and `package-lock.json` say 5.0.3 but the local `node_modules` holds 5.0.2: run `npm ci`. Built-in `--shard`, blob reports, `sequence.shuffle`, `vitest doctor`. | HIGH |
| fengari | **0.1.5, pin exact** (drop the caret) | Lua VM for the harness (Lua 5.3 semantics, shimmed to behave like 5.1) | Last published 2025-12-26. `scripts/lib/lua-harness.mjs` patches fengari internals (`fengari/src/lobject.js`), so any 0.1.x change can break it silently. Pin it. | HIGH |
| luacheck | **1.2.0** (latest, 2024-05-24) | Lint, undefined and unused globals | Standard WoW addon linter. Local machine has 1.2.0, but CI installs `lua-check` from apt, which on `ubuntu-latest` (Ubuntu 24.04) is **1.1.2-1**: lint results can differ between local and CI. Use the official 1.2.0 Linux binary (release asset `luacheck`, 835 KB) downloaded with a pinned SHA-256: one `curl`, no apt step, same version as local. | HIGH on versions, MEDIUM on the binary being static x86-64 |
| GitHub Actions runner | `ubuntu-latest` (= Ubuntu 24.04) | CI | 2-core, 1x minute multiplier on private repos. `ubuntu-26.04` exists; do not move before launch. | HIGH |

### Supporting Libraries and Tools

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `actions/checkout` | v7 (latest v7.0.1) | Checkout | Already used. |
| `actions/setup-node` | v7 (latest v7.1.0) | Node + npm cache | Already used. |
| `actions/upload-artifact` | **v7** (latest v7.0.2; repo uses v6) | Coverage and JUnit upload | Bump with the monthly Dependabot group. Artifacts count toward the 500 MB Free-plan allowance, so keep uploads to the weekly and release runs only. |
| `actions/github-script` | v9 (v9.0.0) | `ci-failure` issue | Already used. |
| `@resvg/resvg-js` | 2.6.2 (exact) | Media rasteriser | Keep pinned; output is checked byte-for-byte by `build-media.mjs --check`. |
| acorn | ^8.18 (8.19.0 is current) | Parser for the function-size scan | Keep. |
| Ketho `BlizzardInterfaceResources` (`forever` branch) | fetched at run time, not vendored | Name lists for global API, widget methods, events, enums, templates | New `npm run check:api` (see below). Fetch into gitignored `.cache/`; do not commit it (CLAUDE.md: no third-party material without a CREDITS note). |
| `Gethe/wow-ui-source` (`forever` branch) | read-only reference | Blizzard's own UI code for Forever | Read it to settle "does this exist in Forever" questions before adding a global to `.luacheckrc` or a method to `wow-widget-api.lua`. Do not copy code from it. |
| Playwright | 1.56.1, CI-only global install | UI preview PNGs | Weekly and release only. Never in the PR gate. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Lua-level sampling profiler in the harness | Find where a login spends its second | Add a `debug.sethook(fn, "", 1000)` count hook (fengari supports it) that tallies `debug.getinfo(2, "S")` source:line by module. The coverage line hook in `scripts/lib/lua-coverage.mjs` already shows the pattern. Node `--cpu-prof` only shows fengari's VM loop, not addon functions. |
| `vitest doctor` / `--no-isolate` trial | Check whether sharing a warm V8 and chunk cache across files is safe | Expect only a few percent: cold start is about 1 s per file, about 60 files. Try it, keep it only if every case still passes. |
| `--sequence.shuffle.files --sequence.shuffle.tests --sequence.seed=<run id>` | Flake detector for the "deterministic" requirement | Weekly run only; print the seed so a failure reproduces. |
| luacheck `-j` (LuaLanes) | Parallel lint | Local luacheck 1.2.0 includes LuaLanes; irrelevant at the current size. |
| LuaLS (lua-language-server 3.19.1) + Ketho `vscode-wow-api` 0.22.3 | Editor-side type hints | Already recommended in `.vscode/`. Editor only; see "What NOT to use" for CI. |

## Installation

```bash
# Project dev dependencies (exact pins where the harness depends on internals)
npm ci
# package.json: "vitest": "5.0.3", "fengari": "0.1.5" (remove the ^), "@resvg/resvg-js": "2.6.2"

# CI: luacheck 1.2.0 without apt (replace <sha256> with the value you verify once)
curl -fsSL -o /usr/local/bin/luacheck \
  https://github.com/lunarmodules/luacheck/releases/download/v1.2.0/luacheck
echo "<sha256>  /usr/local/bin/luacheck" | sha256sum -c - && chmod +x /usr/local/bin/luacheck

# CI still needs real Lua 5.1 only for `luac5.1 -p`
sudo apt-get install -y -qq lua5.1
```

## Budget Model (GitHub Free, private repo)

2,000 included Linux minutes a month on 2-core runners (1x multiplier); billing is by the started minute per job (the repo's own notes say so; GitHub's billing page does not state rounding, so treat as MEDIUM). Artifact storage is a separate 500 MB; cache is 10 GB per repo.

| Item | Minutes | Notes |
|------|---------|-------|
| Gate (`verify.yml`) per push | about 1 | Already at target. |
| Weekly full suite + preview | about 4 x (suite + preview) | Today about 22+ each: roughly 100 a month. |
| Release | about 9 | |
| Per-PR full suite at 5 min | 5 per run | At 6 PRs a day, one run each: about 900 a month. Each extra push to a PR adds 5. Fits the budget **only** if it runs once per PR (on `ready_for_review` or the `full-tests` label, with `cancel-in-progress`), not on every `synchronize`. |
| Per-PR full suite at today's 22 min | 22 per run | 6 a day is about 3,960 a month: roughly double the budget. This is why the 5-minute target and the budget are the same problem. |

Public repositories get free standard-runner minutes, and a 4-core Linux runner, but the owner chose to go private (2026-10-07). Mentioned only so the trade-off is visible; it is not a recommendation.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Stay on fengari for launch; profile and cut login cost | **wasmoon** 1.16.0 (Lua 5.4 compiled to WebAssembly; npm published 2026-04-25) | Only after a time-boxed spike (2 days, Phase 1) shows `login()` at or under about 150 ms through the same `createAddon` API and the harness shims still pass. Its own benchmark shows about 25x faster raw Lua than fengari, but a third-party test found fengari faster on JS-to-Lua calls (the README itself warns heavy interop may reverse the result). Two real costs: the `..` float-formatting patch in `lua-harness.mjs` works by patching fengari's JS and has no equivalent in WASM, and Lua 5.4 is one version further from 5.1. The harness is mostly pure Lua with a thin JS driver, which favours wasmoon. LOW confidence on the gain until measured. |
| fengari + shims | A native `lua5.1` process per case | Would be exact 5.1 and about 50x faster, but every `addon.frame()`/`expect` round trip crosses a process boundary and Node has no synchronous child-pipe read. That is a harness rewrite, not a tweak. Post-launch idea only. |
| Custom harness (`wow-stub.lua`, `wow-world.lua`, about 3,300 lines) | **wowless** (`wowless/wowless`, active, last push 2026-10-09) | Runs Blizzard's real FrameXML in a taint-aware Lua 5.1 fork (elune). But development is Docker-only, built with CMake, it downloads the **retail** client's UI code, and its README mentions no Forever support. Revisit after launch, not before. |
| Hosted `ubuntu-latest` | `ubuntu-slim` (1 vCPU, 15-minute job cap, billed at a lower rate) | Possibly for the 1-minute gate. How it counts against the 2,000 included minutes is not documented in what I could read; test with one workflow and read the usage report before moving anything. LOW. |
| One job, all cores | Vitest `--shard` across N jobs | Only if wall-clock matters more than minutes (it does not here). More jobs means more rounded-up minutes and repeated `npm ci`. |
| Custom line-coverage hook | luacov | luacov needs a real Lua process and debug hooks the harness does not run under. The custom hook already holds the 100% floor. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`wasmoon-lua5.1`** (npm, "a real lua 5.1 VM ... webassembly") | Tempting because it is real 5.1, but it is a third-party fork (`JX3BOX/wasmoon-lua5.1`) that was **dormant from 2024-02-19 and then published two versions on 2026-10-08, the day before this research**. A sudden republish of a dormant package is a supply-chain warning sign. It would run inside the test process with file access. | Stay on fengari; if a 5.1 VM is ever wanted, evaluate the spike above and review the package source first. |
| busted / luarocks test stack | Needs a real Lua install and has no WoW frame, event or layout model. The headless client is the valuable part. | The existing Vitest + harness. |
| luacov for the addon | See above. | `scripts/lib/lua-coverage.mjs`. |
| `lua-check` from apt on `ubuntu-latest` | Pinned by the distro to 1.1.2-1, so CI differs from the 1.2.0 used locally, and apt adds its update/install time to a gate with a 60-second budget. | Official 1.2.0 binary with a checksum. |
| Vitest `--shard` or a matrix of jobs to hit "under 5 minutes" | Hides the cost and raises the bill. | Cut CPU time (profile, then fix login). |
| `--changed` for Lua area selection | Vitest's changed-file graph follows JS imports; the addon's Lua files are not in it, so it would select nothing useful. | If selective runs are wanted, build a path-to-area map from the coverage hit files (`coverage/lua-hits`), and keep full runs for `Core/` changes. Optional, LOW. |
| A full-suite run on every `synchronize` | Budget model above. | Gate on every push; full suite once on `ready_for_review` or the label. |
| Self-hosted runner | Ruled out by the owner. | Hosted only. |
| LuaLS `--check` in CI | Slow, noisy on 114 addon files against partial annotations, and would add a second source of truth next to luacheck and the code-quality scan. | Keep it editor-side. |
| Global fallbacks for removed action-bar APIs as primary calls | Forever's global table has none of `GetActionCooldown`, `IsUsableAction`, `HasAction`, `IsActionInRange`, `GetActionTexture`, `GetActionCount`, `IsCurrentAction` (checked against the `forever` branch of Ketho's `GlobalAPI.lua`, build 70205). The `C_ActionBar.*` versions exist. `Modules/ActionBars.lua` already tries `C_ActionBar` first, which is correct. | Keep that order; add a harness case that removes the globals (`addon.world.without`) and checks the buttons still update. |
| Detecting Forever by a global's presence | Already forbidden in CLAUDE.md, and still right: the interface check (`16000-19999`) in `ns.IsForever` works. The wiki also documents `WOW_PROJECT_ID == WOW_PROJECT_CAMELOT` (value 18), which is a second, equally valid signal if a corroborating check is ever wanted. | Keep `ns.IsForever`. |

## Stack Patterns by Variant

**If the PR only touches docs or Markdown:** the existing `paths-ignore` already skips CI. Keep it.

**If the change is addon Lua under `Core/` or a shared Theme/stub file:** run the full suite (everything depends on it).

**If the change is one `Modules/<Area>*.lua` file plus its test:** the gate plus the area's test file locally (`npx vitest run scripts/tests/<area>.test.mjs`) is enough for iteration; the full suite runs once at `ready_for_review`.

**If an API might be missing in Forever:** feature-detect with `type(x) == "function"` / `"table"` (as `AuraEngine`, `SwingTimer` and `ActionBars` already do), and add a harness case that removes the API with `world.without(...)`.

## API Surface Facts for Forever (for the roadmap's API-check work)

| Fact | Source | Confidence |
|------|--------|------------|
| Forever shares Mainline's UI architecture and the vast majority of 12.1.5 APIs | Blizzard statement quoted by Icy Veins and community guides; wiki build table (Forever 1.60.1) | MEDIUM |
| Forever game type is `camelot`; `WOW_PROJECT_CAMELOT = 18`; per-game TOC suffixes `_Forever.toc` or `_Camelot.toc` | warcraft.wiki.gg `WOW_PROJECT_ID`, `TOC_format` | MEDIUM |
| Interface numbers: Forever beta 16001; Midnight live 120100; Midnight test 120105. No Forever release value listed | warcraft.wiki.gg `TOC_format` (contributor-maintained, may lag) | LOW-MEDIUM |
| Secret values arrived in 12.0.0 (2026-01-20). Blocked in tainted code: arithmetic, comparison, `#`, key use, indexing, calling. Allowed: store, pass to Lua functions, concatenate, `string.format`, `type()` | warcraft.wiki.gg `Secret_values` | MEDIUM |
| Test functions: `issecretvalue`, `canaccessvalue`, `canaccesssecrets`, `issecrettable`, `canaccesstable`, `scrubsecretvalues`; `C_Secrets.Should*BeSecret` family. `issecretvalue` and `canaccessvalue` are present in Forever's `GlobalAPI.lua` | wiki 12.0.0 API changes; Forever `GlobalAPI.lua` | MEDIUM (two sources) |
| 12.1.0 adds `SecretWhenAurasRestricted` and others; 12.1.5 adds `SecretWhenLuaTableHasSecretKeys` and new forbidden aspects (`SetTexture`, `QueryRotation`, `AddAnimations`) | wiki `Secret_values` | LOW-MEDIUM (check each against Forever before relying on it) |
| 12.1.0 removed from `C_UnitAuras`: `AddAuraSound`, `CancelAuraByInstanceID`, group-buff alert setters and others; `C_Item.DoesItemMatchSpellItemCondition` removed; `C_Spell.GetSpellTexture` returns a third value | wiki `Patch_12.1.0/API_changes` (first 100,000 of 131,341 characters read) | MEDIUM |
| In Forever's `GlobalAPI.lua`: `C_ActionBar.GetActionTexture/IsUsableAction/IsActionInRange/IsCurrentAction/GetActionCooldown/GetActionUseCount/GetActionCooldownDuration`, `C_Spell.GetSpellInfo`, `C_Item.GetItemInfo/GetItemInfoInstant/GetItemCount`, `C_Container.GetContainerItemInfo`, `C_UnitAuras.GetAuraDataByIndex/GetUnitAuras`, `C_PetInfo.GetPetHappiness`, `C_AuctionHouse.PostItem/PostCommodity`, `C_QuestLog.GetInfo`, `C_Secrets.ShouldAurasBeSecret`: all present. Top-level `GetSpellInfo`, `GetPetHappiness`, `GetContainerItemInfo`, `GetItemInfo`, `UnitAura`: **absent** | Ketho `forever` branch, build 70205, read 2026-10-09 | MEDIUM-HIGH (generated from Blizzard's docs; can lag the client) |
| `C_SwingTimer` exists in Forever's dump but only lists `EnableRangeCheck` and `IsTargetWithinSwingRange`; `GetSwingTimerInfo` is not listed. The swing module's own guard is the table check, not a method check | same dump | MEDIUM |

Where `.luacheckrc` lists legacy top-level names (`GetSpellInfo`, `GetPetHappiness`, `GetActionInfo` and similar), the code already reads them behind `type(...) == "function"` guards. That is correct for Forever but means the linter's `read_globals` list does not show which names are real on the target client.

## New Tooling to Add (in priority order)

| # | Tool | Effort | Why |
|---|------|--------|-----|
| 1 | Lua sampling profiler in the harness (`npm run profile -- <area>`) | Small | Needed to cut login cost; without it the 4.4x target is guesswork. |
| 2 | Split `more.test.mjs` (400 s) and `auction.test.mjs` (177 s) by area | Small | Evens the file schedule so wall time follows CPU time / cores. |
| 3 | `npm run check:api`: fetch Ketho's `forever` `GlobalAPI.lua` and `WidgetAPI.lua` into `.cache/`, check every `.luacheckrc` `read_globals` name and every `wow-widget-api.lua` method against them, and report each miss as "verify by hand", never as a hard failure | Small-medium | I prototyped it: 245 `read_globals` names, 22 not found anywhere in the dump (all constants or tables such as `SOUNDKIT`, `RAID_CLASS_COLORS`, `LibStub`), and of 374 widget names 41 absent from `WidgetAPI.lua`. Many of those 41 are legitimate (template mixins such as `SetBackdrop`; the 12.1 `AuraContainer` methods, which the dump's widget list lags on, and which `Core/AuraEngine.lua` already probes at run time). That is exactly why it must be advisory. Weekly and release runs only; not the gate. |
| 4 | luacheck 1.2.0 binary step in `verify.yml` and `lua-suite.yml` | Small | Version parity and a shorter gate. |
| 5 | Shuffle-seed weekly run | Small | Satisfies "no flaky cases" with evidence. |
| 6 | wasmoon spike behind `createAddon` | 2 days, time-boxed | Only if items 1 and 2 leave the suite above about 8 minutes of CPU on two cores. |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vitest@5.0.3` | Node 22 and 24 | CI today is on 22; move to 24 with a `.nvmrc` and re-time the suite once. |
| `fengari@0.1.5` | the patches in `scripts/lib/lua-harness.mjs` (`lobject.luaO_tostring`) | Internal API; exact pin. |
| luacheck 1.2.0 binary | `.luacheckrc` with `std = "lua51"` | Apt's 1.1.2-1 reads the same config; 1.2.0 adds only a new built-in standard (minetest). |
| `@resvg/resvg-js@2.6.2` | `build-media.mjs --check` | Output is byte-checked; upgrade only with a regenerated `Media/`. |
| `actions/upload-artifact@v7` | `actions/download-artifact` (not used) | Only the weekly and release runs upload. |

## Sources

- npm registry, queried 2026-10-09 with `npm view` — vitest 5.0.3 (2026-09-30), fengari 0.1.5 (2025-12-26), wasmoon 1.16.0 (2026-04-25), acorn 8.19.0, `@resvg/resvg-js` 2.6.2, `wasmoon-lua5.1` publish history. HIGH.
- GitHub API, queried 2026-10-09 — luacheck v1.2.0 release and assets; `actions/*` latest tags; `Gethe/wow-ui-source` and `Ketho/BlizzardInterfaceResources` branch lists (both have `forever`); `forever` branch head commits ("1.60.1 (70334)", "1.60.1 (70205)"); `wowless/wowless` last push. HIGH.
- Local measurement, 2026-10-09, this repository at `47f1e94` on the `work/gsd-planning` branch: `npx vitest run --project lua` (751 passed, 6 m 42 s wall, 2,622 s summed), `createAddon`/`login` timing script. HIGH for this machine; hosted-runner time is an extrapolation.
- https://warcraft.wiki.gg/wiki/Secret_values — secret value rules and patch timeline. MEDIUM.
- https://warcraft.wiki.gg/wiki/Patch_12.0.0/API_changes and https://warcraft.wiki.gg/wiki/Patch_12.1.0/API_changes — removed and added APIs (12.1.0 page read only to character 100,000 of 131,341). MEDIUM.
- https://warcraft.wiki.gg/wiki/WOW_PROJECT_ID and https://warcraft.wiki.gg/wiki/TOC_format — `WOW_PROJECT_CAMELOT`, interface numbers, TOC suffixes. LOW-MEDIUM (contributor-maintained).
- https://vitest.dev/guide/improving-performance and https://vitest.dev/guide/cli — sharding, `isolate`, `doctor`, shuffle options (Vitest 5.0.3 docs). HIGH.
- https://github.com/actions/runner-images — `ubuntu-latest` is Ubuntu 24.04; `ubuntu-26.04` and `ubuntu-slim` exist. HIGH.
- https://packages.ubuntu.com — `lua-check` 1.1.2-1 (noble), 1.2.0-1 (questing), 1.2.0-1build1 (resolute). MEDIUM.
- https://docs.github.com/en/billing/concepts/product-billing/github-actions and https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/ — 2,000 free minutes, 500 MB artifacts, 10 GB cache, January 2026 price cuts with unchanged quotas. MEDIUM (rounding rule not stated on the page).
- https://github.blog/changelog/2026-01-22-1-vcpu-linux-runner-now-generally-available-in-github-actions/ — `ubuntu-slim`, 15-minute cap; how it counts against included minutes not confirmed. LOW.
- https://github.com/ceifa/wasmoon README (via jsDelivr) and a Babylon.js forum benchmark thread — wasmoon vs fengari speed claims. LOW (vendor benchmark, different workload).
- https://github.com/wowless/wowless — requirements and scope. MEDIUM.

---
*Stack research for: Lua 5.1 WoW addon UI suite with Node-driven headless tests, hosted-runner CI*
*Researched: 2026-10-09*
