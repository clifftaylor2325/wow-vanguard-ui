---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
# Codebase Structure

**Analysis Date:** 2026-10-09

## Directory Layout

```
wow-vanguard-ui/
├── Vanguard.toc        # Load order and metadata (version lives here)
├── Core/               # Framework: events, DB, modules, theme, widgets, options, movers
├── Modules/            # One file per feature (81 files), grouped by filename prefix
├── Libs/               # Vendored libraries, unmodified (LibStub, CallbackHandler-1.0, LibSharedMedia-3.0)
├── Media/              # GENERATED textures, icons, fonts (from scripts/lib/media-sources.mjs)
├── art/                # Sources for Media/ (fonts, game-icons, CREDITS.md)
├── scripts/            # Node build, packaging, lint and test harness
│   ├── lib/            # Shared JS and headless-client Lua (wow-*.lua, lua-harness.mjs)
│   ├── tests/          # Area tests: <area>.test.mjs, helpers.mjs, README.md
│   ├── fonts/          # make-fonts.py (Fira Sans Condensed build)
│   └── *.mjs           # build-media, package, check-code-quality, coverage, link-wow, tests
├── docs/               # THEME.md, API.md, SMOKE-TEST.md, design/, handoff/ (work plans)
├── .github/workflows/  # verify.yml (PR quick check), full-tests, lua-suite, release
├── .claude/, .vscode/, .editorconfig, .gitattributes, .gitignore, .luacheckrc, .pkgmeta
├── README.md           # Behaviour spec (player-facing and developer sections)
├── CLAUDE.md           # Working rules for the repo
├── LICENSE             # All rights reserved
├── package.json        # npm scripts (test, verify, coverage, lint, media, package, preview)
├── vitest.config.mjs   # Test runner config
└── (generated, ignored: coverage/, dist/, node_modules/, preview/, .cache/)
```

## Directory Purposes

**`Core/`:**
- Purpose: The framework every module depends on. Loaded before any module.
- Contains: 33 Lua files, e.g. `Core/Events.lua` (event hub, `ns.On`, `ns.Try`, `ns.Report`), `Core/DB.lua` (`ns.Settings`), `Core/Modules.lua` (`ns.Module`), `Core/Theme.lua` (colours and font sizes), `Core/Skin.lua` (public Skin API), `Core/Widgets.lua`, `Core/Controls.lua`, `Core/Options.lua`, `Core/OptionsWindow.lua`, `Core/Movers.lua`, `Core/Setup.lua`, `Core/Slash.lua`, `Core/Combat.lua`.
- Key files: `Core/Events.lua`, `Core/Modules.lua`, `Core/Theme.lua`, `Core/Combat.lua`.

**`Modules/`:**
- Purpose: Feature implementations. One feature per file; each calls `ns.Module(name, def)`.
- Contains: 81 Lua files. Related files share a prefix (see Naming Conventions).
- Key files: `Modules/UnitFrames.lua`, `Modules/ActionBars.lua`, `Modules/Bags.lua`, `Modules/Chat.lua`, `Modules/Nameplates.lua`, `Modules/Windows.lua`, `Modules/ClickCast.lua`, `Modules/RaidFrames.lua`, `Modules/QuestLog.lua`, `Modules/AuctionAPI.lua`.

**`Libs/`:**
- Purpose: Third-party libraries shared with other addons.
- Contains: `Libs/LibStub/LibStub.lua`, `Libs/CallbackHandler-1.0/CallbackHandler-1.0.lua`, `Libs/LibSharedMedia-3.0/LibSharedMedia-3.0.lua`, each with its licence file.
- Rule: Do not edit (CLAUDE.md).

**`Media/`:**
- Purpose: Shipped art and fonts used by the addon.
- Contains: `Media/Art/`, `Media/Fonts/`, `Media/Icons/`, `Media/Textures/`.
- Generated: Yes, by `npm run media` (`scripts/build-media.mjs`). Check with `node scripts/build-media.mjs --check`.
- Committed: Yes.

**`art/`:**
- Purpose: Source art and fonts for `Media/`.
- Contains: `art/fonts/`, `art/game-icons/` (SVG sources), `art/CREDITS.md`, `art/game-icons/CREDITS.txt`, `lorc-*.tga` sources.
- Generated: No (hand-maintained sources).
- Committed: Yes.

**`scripts/`:**
- Purpose: Build, quality gates, packaging and the headless test client.
- Contains: `scripts/build-media.mjs`, `scripts/package.mjs`, `scripts/check-code-quality.mjs`, `scripts/coverage-lua.mjs`, `scripts/link-wow.mjs`, `scripts/preview-ui.mjs`, `scripts/check-zip.mjs`, `scripts/lua-coverage-floor.json` (100% floor), and `*.test.mjs` meta-tests (e.g. `scripts/pkgmeta.test.mjs`, `scripts/lua-engine.test.mjs`).
- Also: `scripts/fonts/make-fonts.py` (font pipeline).

**`scripts/lib/`:**
- Purpose: Harness and generators.
- Contains: `lua-harness.mjs` (loads client and addon), `wow-stub.lua`, `wow-world.lua`, `wow-layout.lua`, `wow-inspect.lua`, `wow-widget-api.lua` (widget method allowlist), `media-sources.mjs` (source of truth for Media/), `code-quality.mjs`, `ui-preview.mjs`, `truetype.mjs`.

**`scripts/tests/`:**
- Purpose: Behavioural scenarios per feature area, run against the real addon Lua.
- Contains: `<area>.test.mjs` (e.g. `smoke.test.mjs` for the CI quick check), `helpers.mjs`, `README.md` (read before writing a test).

**`docs/`:**
- Purpose: Developer documentation.
- Contains: `THEME.md` (every fade and sound), `API.md` (Skin API), `SMOKE-TEST.md` (in-game checklist), `design/` (`AUCTION-TABS.md`, `RESKIN.md`), `handoff/` (work plans: `VANGUARD-PLAN.md`, `WORKPLAN.md`, `AUCTION-PLAN.md`, `RESKIN-PLAN.md`); `docs/README.md` indexes the docs by reader.
- Note: `docs/handoff/` plans refer to the old repo name `wow-forever-ui`; grep for identifiers rather than trusting line numbers.

**`.github/workflows/`:**
- Purpose: CI. `verify.yml` runs on every PR; `full-tests.yml` weekly, before releases, or with the `full-tests` label; `lua-suite.yml`; `release.yml`.

## Key File Locations

**Entry Points:**
- `Vanguard.toc`: Load order and addon metadata.
- `Core/Events.lua`: Event hub and `PLAYER_LOGIN` wiring.
- `Core/Slash.lua`: `/vg`, `/vanguard`.

**Configuration:**
- `Vanguard.toc`: Interface versions (16001, 120007), SavedVariables (`VanguardDB`, `VanguardCharDB`), version.
- `.luacheckrc`: Lint config; `read_globals` and `globals` lists (every new WoW global the addon reads goes in `read_globals`).
- `.pkgmeta`: Packaging ignore list (new top-level files or folders players don't need go here).
- `vitest.config.mjs`: Test runner.
- `package.json`: npm scripts.
- `scripts/lua-coverage-floor.json`: Coverage floor (100%).

**Core Logic:**
- `Core/`: framework (see above).
- `Modules/`: features.

**Testing:**
- `scripts/tests/`: area tests.
- `scripts/lib/wow-*.lua`, `scripts/lib/lua-harness.mjs`: headless client.
- `scripts/lua-engine.test.mjs`: tests of the client itself.

## Naming Conventions

**Files:**
- Lua source: `PascalCase.lua`, one feature per file (e.g. `Modules/ActionBarKeybinds.lua`, `Core/AuraEngine.lua`).
- Shared-prefix groups: `Auction*` (`AuctionAPI`, `AuctionPrices`, `AuctionLedger`, ...), `Quest*` (`QuestLog` + `QuestLogView`, `QuestDialog` + `QuestDialogParts` + `QuestDialogView`), `Raid*` (`RaidFrames`, `RaidAuras`, `RaidHealing`, `RaidStatus`, `RaidTools`), `Windows*` (`Windows` + `WindowsMap`, `WindowsSocial`, `WindowsTown`, `WindowsSystem`, `WindowsMenus`, `WindowsTabs`, `WindowsPvP`), `ClickCast*` (`ClickCast`, `ClickCastSpells`, `ClickCastOptions`), `ActionBar*`, `Chat*`, `Bag*`/`Bags`, `Minimap*`.
- Suffixes: `*View.lua` for presentation split from logic; `*Parts.lua` for helper parts; `*Spells.lua` / `*Options.lua` for data or options of a feature.
- Tests: `scripts/tests/<area>.test.mjs` (lowercase area name, e.g. `smoke.test.mjs`).

**Directories:**
- Top-level game folders are capitalised by role: `Core`, `Modules`, `Libs`, `Media`.
- Script and doc folders are lowercase: `scripts`, `docs`, `art`.

**Identifiers:**
- Module names passed to `ns.Module` match the file's base name (e.g. `"Bags"` in `Modules/Bags.lua`).
- Addon globals listed in `.luacheckrc` `globals`; WoW globals in `read_globals`.
- Slash commands: `/vg`, `/vanguard`. "ForeverUI" and "/fui" only in migration notes.

## Where to Add New Code

**New Feature (a player-visible module):**
- Primary code: `Modules/<Feature>.lua`, registered with `ns.Module("<Feature>", { defaults = ... })`; add the file to `Vanguard.toc` after the `Core/` files it uses. If it belongs to an area, use that area's prefix (e.g. `Auction*`).
- Tests: `scripts/tests/<area>.test.mjs` (read `scripts/tests/README.md` first).
- README: update the matching sentence in the same commit.

**New Framework Service:**
- Implementation: `Core/<Service>.lua`, added to `Vanguard.toc` in the Core section before any module that uses it.
- Tests: Covered through `scripts/tests/` scenarios that load the real TOC.

**New Options Page or Control:**
- Control widgets: `Core/Controls.lua` / `Core/Widgets.lua`.
- Page: the owning module's `*Options.lua` (e.g. `Modules/ClickCastOptions.lua`) or `Core/Options.lua` for shared settings.

**New Theme Token, Colour or Font Size:**
- Implementation: `Core/Theme.lua` only.
- Docs: `docs/THEME.md` if it adds a fade or sound.

**New Art or Icon:**
- Source: `art/` (add credit in `art/CREDITS.md` for third-party art).
- Build: `scripts/lib/media-sources.mjs`, then `npm run media`. Never hand-edit `Media/`.

**New Widget Method Used by Tests:**
- Add only after confirming it exists in the 12.1 client: `scripts/lib/wow-widget-api.lua`.

**Utilities:**
- Shared helpers: `Core/` (existing helpers include `ns.Fill`, `ns.Copy`, `ns.Soon`, `ns.OutOfCombat`). Put a helper in the module's own file unless more than one module needs it.

**New Build or Test Script:**
- Implementation: `scripts/<name>.mjs`. If it is not needed by players and sits at top level, add it to `.pkgmeta` `ignore`.

**New Library:**
- Vendor under `Libs/<Name>/` unmodified with its licence; list in `Vanguard.toc` before `Core/`.

## Special Directories

**`Libs/`:**
- Purpose: Vendored libraries.
- Generated: No.
- Committed: Yes (unmodified).

**`Media/`:**
- Purpose: Generated textures, icons and fonts.
- Generated: Yes (`npm run media`).
- Committed: Yes.

**`coverage/`:**
- Purpose: Lua and JS coverage output.
- Generated: Yes.
- Committed: No (in `.gitignore`).

**`dist/`:**
- Purpose: Release zip (`dist/Vanguard-<version>.zip`).
- Generated: Yes (`npm run package`).
- Committed: No.

**`preview/`:**
- Purpose: Preview PNGs (`npm run preview`, needs Playwright).
- Generated: Yes.
- Committed: No.

**`.cache/`:**
- Purpose: Build cache.
- Generated: Yes.
- Committed: No.

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes (`npm install`).
- Committed: No.

**`.planning/`:**
- Purpose: GSD planning artifacts, including `.planning/codebase/` (these documents).
- Generated: Yes (by GSD commands).
- Committed: Per the user's workflow.

---

*Structure analysis: 2026-10-09*
