---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
# External Integrations

**Analysis Date:** 2026-10-09

Vanguard has no network services, no hosted database, and no authentication provider. Its integrations are the WoW client API, the SavedVariables store, other addons that share data through library or API hooks, and the build and CI tooling around the repo.

## APIs & External Services

**WoW client API (primary integration):**
- The game's Lua API (globals, `C_*` namespaces, widget methods) is the main external surface. Every file in `Core/` and `Modules/` calls it.
- Read globals are declared in `.luacheckrc` under `read_globals`. Addon-owned globals are declared under `globals`.
- Preferred namespaces (CLAUDE.md, Game rules): `C_Item`, `C_Spell`, `C_UnitAuras`. Older globals are avoided where a `C_` version exists.
- Version detection: `ns.IsForever` checks the interface version (defined in `Core/Combat.lua`). Do not detect Forever by checking for a global.
- Secret values: `ns.IsSecret` and `ns.PlainNumber` guard reads of values that may be secret (CLAUDE.md, Game rules).
- Combat restriction: `ns.OutOfCombat` guards protected actions (`Core/Combat.lua`).
- Widget methods are validated against `scripts/lib/wow-widget-api.lua`. Methods not listed there are nil in tests by design.
- Edit Mode integration: Vanguard places its handles in the game's Edit Mode and switches Edit Mode layouts per profile (README, Movers and Profiles). Edit Mode layout names come from the account's own layouts.
- Talents API: `Modules/TalentPlanner.lua` reads the game's trait API. A client without it shows only the bar.
- Auction house API: `Modules/Auction*.lua` (`AuctionPrices`, `AuctionAPI`, `AuctionSell`, `AuctionOwned`, `AuctionShop`, `AuctionRestock` and others) use the game's auction house calls for browse, sell and owned-auction queries. Searches run one at a time, at most one a second, and scans are limited to one every 15 minutes (README, Auction helper).
- Addon compartment: `Vanguard_OnAddonCompartmentClick` is the click handler named in `Vanguard.toc`.
- Minimap shape: `GetMinimapShape` may be read or set for other addons that place icons around the minimap (`Modules/Minimap.lua`).

**Public API for other addons:**
- Skin API: `Vanguard` global, implemented in `Core/Skin.lua`. Documented in `docs/API.md`. `S.apiVersion` is 1 and only grows (README, Skin API).
- Auction prices API: `Vanguard.API.v1`, in `Modules/AuctionAPI.lua`. It mirrors Auctionator's function names so an addon written for Auctionator can switch to it. It reads prices, vendor prices and disenchant values, makes and changes shopping lists, and runs searches through the Shop card. It never posts, buys or cancels auctions (README, Auction prices for other addons).
- Theme colours and fonts for other addons: `S.RGB(name)`, listed in `docs/THEME.md` (from `Core/Theme.lua`).

**Other addons (optional, detected at runtime, not bundled):**
- LibDataBroker-1.1 - Read with `LibStub("LibDataBroker-1.1", true)`. Feeds the broker strip (`Modules/BrokerStrip.lua`). Vanguard does not bundle it; with no feed-providing addon, the strip stays hidden.
- Masque - If present, Masque skins Vanguard's button groups: Action bars; Pet, stance and extra buttons; Buffs and debuffs (with weapon enchants); Target and focus auras (`Core/Masque.lua`, README). Vanguard bundles nothing of Masque.
- Minimap buttons from other addons - Gathered into a drawer (`Modules/MinimapButtons.lua`). No API dependency.
- LibSharedMedia-3.0 - Bundled in `Libs/` and used for shared fonts and bar textures (`Core/SharedMedia.lua`). Vanguard also registers its own font and bar textures with it, so other addons can pick them.
- Auctionator - Its shopping-list string format is accepted on import (`Modules/AuctionHelper.lua` area; README, Auction helper). No Auctionator code is used or required.
- `/way` slash command - Vanguard claims `SLASH_VANGUARDWAY1` only when no other addon has `/way` (`Modules/Waypoints.lua`).

## Data Storage

**Databases:**
- None. No SQL, NoSQL or remote database.

**SavedVariables (the only persistent storage):**
- `VanguardDB` - Account-wide. Declared by `## SavedVariables: VanguardDB` in `Vanguard.toc`. Holds profiles, shared settings, auction price history and shopping lists (the README says shopping lists and auction prices are kept per account and per realm/faction respectively).
- `VanguardCharDB` - Per character. Declared by `## SavedVariablesPerCharacter: VanguardCharDB` in `Vanguard.toc`. Holds per-character state such as talent plans (kept per character and spec).
- Accessed through `Core/DB.lua`. Profiles, import and export are in `Core/Profiles.lua` and `Core/OptionsProfiles.lua`. Import and export strings are serialised with `Core/Serialize.lua`.
- Auction price records are keyed by realm and faction. Entries not seen for 30 days are dropped (README, Auction helper).

**File storage:**
- Local filesystem only, inside the game's `Interface/AddOns/Vanguard/` folder.
- Media assets are read from `Media/` through `Interface\AddOns\Vanguard\Media\...` paths. Textures are generated by `npm run media` (`scripts/lib/media-art.mjs` writes TGA and PNG output). Fonts are TTF in `Media/Fonts/`.

**Caching:**
- None outside the addon's own in-memory state. The build and test tools use `.cache/` (git-ignored) for generated output.

## Authentication & Identity

**Auth provider:**
- None. The addon runs inside the game client, which owns the character and account login.
- Character identity comes from the game API (`UnitName`, realm and faction calls) and is used as a key for per-character and per-realm data (`Core/DB.lua`).

## Monitoring & Observability

**Error tracking:**
- None external. Errors in a callback registered through the Skin API are reported in chat and do not break other code (README, Skin API). Error reporting is in `Core/ErrorBadge.lua` and `Core/Feedback.lua`.

**Performance:**
- `Core/Perf.lua` provides in-game performance measurement. Auction scans are spread over frames (a few hundred listings per frame) so the game does not stall.

**Logs:**
- Chat output only (`Core/Feedback.lua`). No log files are written.

**Test observability:**
- Coverage reports go to `coverage/` (Lua lines, floor 100 per `scripts/lua-coverage-floor.json`).
- JUnit output at `coverage/junit.xml` on GitHub Actions.
- Lua-by-area summary and coverage tables go to the Actions job summary.

## CI/CD & Deployment

**Source host:**
- GitHub: `https://github.com/clifftaylor2325/wow-vanguard-ui` (`## X-Website` in `Vanguard.toc`). The repository is private (CLAUDE.md, MEMORY note on Actions minutes).

**CI pipeline (GitHub Actions, `.github/workflows/`):**
- `verify.yml` - Pull request gate, `ubuntu-latest`, under 10 minutes. Required check "Quick checks" in the main branch ruleset. Skips docs-only changes.
- `lua-suite.yml` - Full Vitest run with Lua coverage, quality scan, luacheck, Lua 5.1 syntax of the TOC files, release zip check, optional UI preview. Called by the two workflows below.
- `full-suite.yml` - Weekly cron, manual start, and PRs labelled `full-tests`. Opens a `ci-failure` issue when red, closes it when green. Needs `issues: write`.
- `release.yml` - Tag push `v*` or manual run from `main`. Checks the tag against `## Version`, runs the suite, publishes a GitHub Release with the zip and `contents: write`.
- Actions in use: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v6`, `actions/github-script@v9`.
- Apt packages installed in CI: `lua-check`, `lua5.1`.

**Hosting and distribution:**
- GitHub Releases - Zip `Vanguard-<version>.zip` (`scripts/package.mjs`, `dist/`).
- CurseForge and Wago - Packaged by their own packager from `.pkgmeta`. The CurseForge project ID is not yet in `Vanguard.toc` (`## X-Curse-Project-ID`, to be added once the project exists, per `.pkgmeta`).

**Local development link:**
- `scripts/link-wow.mjs` links the clone into the Forever client's `Interface/AddOns/` folder for `/reload` testing. Requires the `--wow "<Forever folder>"` argument.

**Dependency sources:**
- npm registry for `vitest`, `fengari`, `@resvg/resvg-js`, `acorn` (lockfile `package-lock.json`).
- Apt (Ubuntu) for `lua5.1` and `luacheck` in CI.
- Upstream font: Fira Sans Condensed (`https://github.com/google/fonts`, SIL OFL 1.1), subset by `scripts/fonts/make-fonts.py`.
- Art and icon sources, all credited in `art/CREDITS.md`: game-icons.net (CC BY 3.0, authors such as Lorc and Delapouite), OpenGameArt, the Cinzel font (`https://github.com/NDISCOVER/Cinzel`), and the Gethe/wow-ui-source reference (`https://github.com/Gethe/wow-ui-source`) used to check the game API.
- WoWUIDev/Ace3 is referenced in the docs as a source of library conventions only; no Ace3 code is shipped.

## Environment Configuration

**Required environment variables:**
- None for the addon at runtime.
- For tests and tools, optional: `CI`, `GITHUB_ACTIONS` (reporter and timeout switches), `VITEST_MAX_WORKERS` (worker cap).

**Secrets location:**
- No secrets are used or stored in the repository. No `.env` file is present in the repo root. The release workflow uses the built-in `GITHUB_TOKEN` with `contents: write`.
- Do not add credential files. `.gitignore` excludes build and cache output (`.cache/`, `dist/`, `coverage/`, `node_modules/`).

## Webhooks & Callbacks

**Incoming:**
- None. The addon listens only to game events (`Core/Events.lua`, a wrapper over the frame event system).
- GitHub Actions is triggered by `push` (tags), `pull_request`, `schedule`, `workflow_dispatch` and labels. These are CI triggers, not service webhooks.

**Outgoing:**
- None. The addon makes no network calls. The WoW client has no network access from addon Lua.

## Library Callbacks (internal integration point)

- `Libs/CallbackHandler-1.0` is loaded only because LibSharedMedia-3.0 depends on it. No file in `Core/` or `Modules/` references it; Vanguard's own events go through `Core/Events.lua`.

---

*Integration audit: 2026-10-09*
