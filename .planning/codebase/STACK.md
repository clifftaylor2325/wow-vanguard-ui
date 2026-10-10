---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
# Technology Stack

**Analysis Date:** 2026-10-09

## Languages

**Primary:**
- Lua 5.1 - The whole addon: `Core/*.lua`, `Modules/*.lua`, and the bundled libraries in `Libs/`. Listed in load order in `Vanguard.toc`.
- JavaScript (ES modules, `"type": "module"` in `package.json`) - Build, packaging, test harness and checks in `scripts/*.mjs` and `scripts/lib/*.mjs`.

**Secondary:**
- Lua (test-only, fixtures for the headless client) - `scripts/lib/wow-*.lua` (`wow-stub.lua`, `wow-widget-api.lua`, `wow-world.lua`, `wow-layout.lua`, `wow-inspect.lua`). Run only under Node, never shipped.
- Python 3 - `scripts/fonts/make-fonts.py` (uses `fontTools` subsetting to trim Fira Sans Condensed into `Media/Fonts/`). Run by hand, not by npm scripts or CI.
- SVG - Source art for `Media/` is described in `scripts/lib/media-sources.mjs` and `scripts/lib/media-crests.mjs`, rasterised by `@resvg/resvg-js`.
- HTML/JS - UI preview page `scripts/lib/ui-preview-page.js`, rendered by `scripts/preview-ui.mjs`.

## Runtime

**Game runtime (shipped addon):**
- World of Warcraft Forever client, the 12.1 engine with vanilla content.
- Lua 5.1 semantics only. The addon must not use `goto`, `//` integer division, or 5.3+ bit operators (CLAUDE.md, Hard rules).
- TOC declares `## Interface: 16001, 120007` (Forever and the 12.1 interface). `## X-Flavor: forever`.
- Version of the addon: `## Version: 0.5.0` in `Vanguard.toc`.

**Development and test runtime:**
- Node.js 22 in CI (`node-version: 22` in `.github/workflows/*.yml`). Local machine has Node v24.14.0. No `.nvmrc` or `.node-version` file exists.
- Package manager: npm. Lockfile `package-lock.json` is present and CI uses `npm ci`.
- Lua 5.1 interpreter and compiler for CI syntax checks: `lua5.1` and `luac5.1` installed with apt (`lua-check` package for `luacheck`).

## Frameworks and Tooling

**Testing:**
- Vitest 5.0.3 (`devDependencies`) - Test runner. Config in `vitest.config.mjs`, two projects: `quick` (JS tests plus one Lua smoke test) and `lua` (the Lua harness, one file per area, in `scripts/tests/*.test.mjs`). Setup file `scripts/tests/setup.mjs`.
- Vitest reporters: default, `github-actions` and JUnit (written to `coverage/junit.xml` when `GITHUB_ACTIONS` is set), plus a custom Lua summary reporter at `scripts/lib/lua-summary-reporter.mjs`.
- Fengari 0.1.5 (`devDependencies`) - A Lua VM in JavaScript. It runs the real addon Lua inside Node. Note this is Lua 5.3 semantics; the addon itself targets 5.1. Harness in `scripts/lib/lua-harness.mjs` and `scripts/lib/lua-emit.mjs`.
- Line coverage of addon Lua: `scripts/coverage-lua.mjs`, `scripts/lib/lua-coverage.mjs`. Floor in `scripts/lua-coverage-floor.json` is `{ "lines": 100 }`.

**Lint and quality:**
- luacheck - Lua linter. Config `.luacheckrc` (`std = "lua51"`, explicit `globals` and `read_globals` lists). Run as `npm run lint` (`luacheck .`) and in CI. Installed from apt in CI, optional locally.
- Custom code-quality scan - `scripts/check-code-quality.mjs` backed by `scripts/lib/code-quality.mjs` (function comment rule and 10-line body limit). Run as `npm run quality`.
- acorn 8.18.0 (`devDependencies`) - JavaScript parser used by the code-quality scan.

**Media and fonts build:**
- `@resvg/resvg-js` 2.6.2 (`devDependencies`) - SVG rasteriser for `Media/` art. Entry `scripts/build-media.mjs`, sources `scripts/lib/media-sources.mjs`, helpers `scripts/lib/media-art.mjs`, `scripts/lib/truetype.mjs`. Run as `npm run media`; `node scripts/build-media.mjs --check` verifies output.
- Python `fontTools` - Font subsetting in `scripts/fonts/make-fonts.py`. Upstream is Fira Sans Condensed (SIL OFL 1.1).

**Packaging and release:**
- `scripts/package.mjs` builds `dist/Vanguard-<version>.zip`. Validated by `scripts/check-zip.mjs`.
- `.pkgmeta` - CurseForge/Wago packager manifest. Its `ignore` list excludes `.github`, `art`, `docs`, `scripts`, dev config and docs. `scripts/pkgmeta.test.mjs` checks it matches the zip.

**Preview and dev helpers:**
- Playwright (optional, not in `package.json`; install it yourself for `npm run preview`) - renders `preview/*.png` through `scripts/preview-ui.mjs`.
- `scripts/link-wow.mjs` (`npm run link:wow -- --wow "<Forever folder>"`) - links the clone into the game folder for `/reload` testing.
- `.vscode/` - Recommended extensions: Lua (sumneko) and WoW API (Ketho). `.vscode/tasks.json` holds verify, luacheck, coverage, package, preview and link:wow tasks.

## Key Dependencies

**Dev dependencies (`package.json`):**
- `vitest` 5.0.3 - Test runner for all JS and Lua-harness tests.
- `fengari` ^0.1.5 - Runs the addon Lua in Node. Without it the Lua harness cannot run.
- `@resvg/resvg-js` 2.6.2 - Generates `Media/` textures and icons. Pinned exact version.
- `acorn` ^8.18.0 - Parser for the code-quality scan.

**Bundled libraries (shipped in the addon, unmodified, `Libs/`):**
- LibStub - Library versioning loader. `Libs/LibStub/LibStub.lua`.
- CallbackHandler-1.0 - Event callback registry. `Libs/CallbackHandler-1.0/CallbackHandler-1.0.lua`, licence `LICENSE.txt` beside it.
- LibSharedMedia-3.0 (revision 151, minor 8020003, by Elkano) - Shares fonts and bar textures with other addons. `Libs/LibSharedMedia-3.0/LibSharedMedia-3.0.lua`, LGPL 2.1 (`LICENSE.txt` beside it). Shipped unmodified, as the LGPL requires.

**Optional libraries and addons detected by the code (not bundled):**
- `LibDataBroker-1.1` - Read via `LibStub("LibDataBroker-1.1", true)` (optional lookup). Feeds the broker strip (`Modules/BrokerStrip.lua`). Not shipped by Vanguard.
- `Masque` - If installed, skins action button groups (`Core/Masque.lua`). Not shipped.
- Auctionator-compatible API - `Vanguard.API.v1` in `Modules/AuctionAPI.lua` copies Auctionator function names. No Auctionator code is used.

## Configuration

**Addon configuration (in game):**
- SavedVariables: `VanguardDB` (account-wide, `## SavedVariables` in `Vanguard.toc`) and `VanguardCharDB` (per character, `## SavedVariablesPerCharacter`). Read and written by `Core/DB.lua` and `Core/Profiles.lua`.
- Slash commands: `/vg` and `/vanguard` (`Core/Slash.lua`). Also `/way` when no other addon claims it (`SLASH_VANGUARDWAY1`, `Modules/Waypoints.lua`).
- Addon compartment entry: `## AddonCompartmentFunc: Vanguard_OnAddonCompartmentClick` (`Core/Options.lua`).
- Minimap icon texture: `Interface\AddOns\Vanguard\Media\Textures\Icon`.

**Build and test configuration:**
- `package.json` - npm scripts: `test`, `test:quick`, `verify`, `coverage`, `lint`, `media`, `quality`, `package`, `preview`, `link:wow`.
- `vitest.config.mjs` - Vitest projects, heap cap (`--max-old-space-size=2048`), test timeouts (120 s in CI, 30 s locally).
- `.luacheckrc` - Lua lint rules and WoW globals.
- `.editorconfig`, `.gitattributes`, `.gitignore` - Formatting and ignore rules. `.cache/`, `dist/`, `preview/`, `coverage/`, `node_modules/` are not committed.
- `.pkgmeta` - Release packaging.
- `scripts/lua-coverage-floor.json` - Coverage floor (only goes up).

**Environment variables:**
- `CI` and `GITHUB_ACTIONS` - Switch Vitest reporters and timeouts (`vitest.config.mjs`).
- `VITEST_MAX_WORKERS` - Caps Vitest worker count (`vitest.config.mjs`).
- No `.env` file exists in the repository root. Nothing in the repo requires secrets to build or test.

**Widget API for tests:**
- `scripts/lib/wow-widget-api.lua` lists the widget methods the headless client supports. Methods are added only after confirming they exist in the 12.1 client (CLAUDE.md, Hard rules).

## Platform Requirements

**Development:**
- Node.js 22 or later (CI uses 22).
- npm with the lockfile (`npm ci`).
- Lua 5.1 (`lua5.1`, `luac5.1`) and luacheck for the syntax and lint steps. Installed from apt on Ubuntu runners.
- Python 3 with `fontTools` only if regenerating fonts.
- Windows is the development host (paths in the repo use `C:\Workspace\...`). Shell scripts in CI are Bash on `ubuntu-latest`.
- The game client cannot be run in this environment. All behaviour is checked through the headless harness (CLAUDE.md).

**Production:**
- Distributed as a zip folder `Vanguard` built by `scripts/package.mjs`. Published as a GitHub Release (`.github/workflows/release.yml`), and intended for CurseForge and Wago via `.pkgmeta`. The CurseForge project ID is not yet set in `Vanguard.toc`.
- Installed in the World of Warcraft Forever `Interface/AddOns/` folder.

## CI Runners and Actions

**Workflows (`.github/workflows/`):**
- `verify.yml` - Pull request gate ("Quick checks"). Runs on `ubuntu-latest`. Steps: `npm ci`, `npm run quality`, `luacheck`, Lua 5.1 syntax check of every TOC file, `npm run test:quick`, release zip check.
- `lua-suite.yml` - Reusable full suite (`workflow_call`). Runs `npm run coverage`, the quality scan, luacheck, syntax check, release zip check, and optionally the UI preview.
- `full-suite.yml` - Weekly Sunday cron (`23 10 * * 0` UTC), `workflow_dispatch`, and PRs with the `full-tests` label. Opens or closes a `ci-failure` issue.
- `release.yml` - Runs on `v*` tag pushes and `workflow_dispatch` from `main`. Checks the tag matches `## Version`, runs the suite, then publishes a GitHub Release with the zip.

**Actions used (pinned by major version):**
- `actions/checkout@v7`
- `actions/setup-node@v7` (Node 22, npm cache)
- `actions/upload-artifact@v6`
- `actions/github-script@v9`

---

*Stack analysis: 2026-10-09*
