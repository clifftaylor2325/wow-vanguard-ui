---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
<!-- refreshed: 2026-10-09 -->

# Architecture

**Analysis Date:** 2026-10-09

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                     WoW client (Forever, 12.1 engine)                 │
│   loads Vanguard.toc in order; SavedVariables VanguardDB/CharDB       │
└───────────────┬──────────────────────────────────────────┬───────────┘
                │ shared addon table: local ADDON, ns = ...│
                ▼                                          ▼
┌───────────────────────────────┐        ┌──────────────────────────────┐
│ Libs/ (LibStub, CallbackHandler,│      │ Core/ framework               │
│ LibSharedMedia; unmodified)    │ ───▶  │ Events, DB, Modules, Theme,  │
└───────────────────────────────┘        │ Skin, Widgets, Options, Movers│
                                          │ Combat, Slash, Feedback, ... │
                                          └──────────────┬───────────────┘
                                                         │ ns.Module / ns.On / ns.Settings
                                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Modules/ one file per feature (81 files; prefixes group areas:       │
│ Auction*, Quest*, Raid*, Windows*, ClickCast*, ActionBar*, Chat*, Bag*)│
│ e.g. `Modules/UnitFrames.lua`, `Modules/Bags.lua`, `Modules/Nameplates.lua` │
└──────────────────────────────────────────────────────────────────────┘
                                                         │ game API (C_Item, C_Spell, C_UnitAuras, frames)
                                                         ▼
                                              WoW client API / Blizzard frames

Test side (not shipped):  scripts/tests/*.test.mjs ──▶ scripts/lib/lua-harness.mjs
                          ──▶ scripts/lib/wow-*.lua (headless client: fengari Lua 5.1 VM)
                          loads the same Vanguard.toc files as the game.
```

## Pattern Overview

**Overall:** Modular, load-order-driven addon framework. A single shared namespace table (`ns`) is passed to every file; `Core/` provides services and registration points, and `Modules/` register features into a registry. No external frameworks beyond three vendored libraries.

**Key Characteristics:**
- Every Lua file starts with `local ADDON, ns = ...` and attaches its API to `ns` (e.g. `ns.Module`, `ns.On`, `ns.Settings`, `ns.Theme`, `ns.Try`). No global addon object is used; `ns.errors` is the only shared diagnostic table.
- Load order is the architecture. `Vanguard.toc` lists libraries first, then `Core/*.lua` (Events, DB, Combat, Client, Serialize, Profiles, Modules, Theme, ...), then `Modules/*.lua`. Core files must not depend on modules; modules run only after `PLAYER_LOGIN`.
- Features are opt-in per profile: `ns.ModuleEnabled(name)` (`Core/Modules.lua`) is on unless the profile sets `modules[name] = false`.
- Events are multiplexed through one frame: modules subscribe with `ns.On(event, fn)` (`Core/Events.lua`) rather than creating their own event frames.
- Errors are isolated: `ns.Try(where, fn, ...)` (`Core/Events.lua`) wraps handlers so one failing module is reported (`ns.Report`, `/vg errors`) and skipped while others keep running.
- Game rules are enforced through helpers, not ad hoc checks: `ns.OutOfCombat` (`Core/Combat.lua`) defers protected work; `ns.IsForever` (`Core/Combat.lua`) detects the client by interface version; `ns.IsSecret` / `ns.PlainNumber` guard secret values; `ns.Soon(key, fn)` coalesces work to the next frame.

## Layers

**Libraries (vendored):**
- Purpose: Shared infrastructure for other addons (LibStub versioning, CallbackHandler events, LibSharedMedia fonts/bars).
- Location: `Libs/LibStub/`, `Libs/CallbackHandler-1.0/`, `Libs/LibSharedMedia-3.0/`
- Contains: Third-party Lua, unmodified. Licences beside them.
- Depends on: Nothing in the addon.
- Used by: `Core/SharedMedia.lua` (LibSharedMedia). CallbackHandler is loaded only as LibSharedMedia's dependency; Vanguard code does not reference it.

**Core framework:**
- Purpose: Everything modules need: lifecycle, persistence, theming, widgets, movers, options, diagnostics.
- Location: `Core/`
- Contains: `Events.lua` (event hub, `ns.On`, `ns.Try`, `ns.Report`), `DB.lua` (`ns.Settings`, SavedVariables), `Profiles.lua` and `OptionsProfiles.lua` (named profiles), `Modules.lua` (module registry), `Theme.lua` (colours, fonts, tokens; the only place for colour and font-size literals), `Skin.lua` (public skin API), `Widgets.lua` / `Controls.lua` (UI building blocks), `Layout.lua` / `Grid.lua` / `Movers.lua` / `MoverPopover.lua` (unlock mode and placement), `Options.lua` / `OptionsWindow.lua` (settings UI), `Setup.lua` (first-run wizard), `Slash.lua` (`/vg`, `/vanguard`), `Combat.lua` (combat and Forever helpers), `Auras.lua` / `AuraEngine.lua` / `AuraLegacy.lua` (aura data), `Visibility.lua`, `Feedback.lua`, `Perf.lua`, `ErrorBadge.lua`, `GameMenu.lua`, `Masque.lua`, `FactionArt.lua`, `Inspect.lua`, `Serialize.lua`, `Client.lua`, `Dialog.lua`.
- Depends on: Libs/ and the WoW API.
- Used by: All modules.

**Feature modules:**
- Purpose: One feature each (unit frames, action bars, bags, chat, quests, auction house helpers, raid tools, windows restyling, etc.).
- Location: `Modules/`
- Contains: One `ns.Module(name, def)` registration per file, with `def.defaults` for its settings, `def.Enable(settings)` to build, and optional `def.Disable(settings)`. Views split out as `*View.lua` (e.g. `Modules/QuestLogView.lua`, `Modules/QuestTrackerView.lua`, `Modules/QuestDialogView.lua`) and helper parts as `*Parts.lua` / `*Spells.lua` / `*Options.lua`.
- Depends on: Core (`ns.*`), `ns.Theme`, the WoW API.
- Used by: The player through the game UI and the options window; other modules through shared `ns` functions (e.g. `Modules/Bags.lua` reads `ns.Theme` and calls into `Modules/BagSections.lua`).

**Test harness (not shipped):**
- Purpose: Run the real addon Lua headlessly for CI.
- Location: `scripts/lib/` (`lua-harness.mjs`, `wow-stub.lua`, `wow-world.lua`, `wow-layout.lua`, `wow-inspect.lua`, `wow-widget-api.lua`), `scripts/tests/`.
- Contains: Vitest scenarios per feature area; fengari-based Lua 5.1 VM with a frame API and world model.
- Depends on: `Vanguard.toc` as the file list; the addon Lua unchanged.
- Used by: `npm test`, `npm run test:quick`, `npm run coverage`.

## Data Flow

### Primary Request Path (login to a running module)

1. The client loads `Vanguard.toc` files in order; each file receives `ADDON, ns` (`Core/Events.lua` first among Core files).
2. `Core/DB.lua` binds `VanguardDB` (profiles) and `VanguardCharDB` (character's profile choice); `ns.Settings(key, defaults)` fills missing keys via `ns.Fill`.
3. `Core/Modules.lua` holds the registry filled by every `Modules/*.lua` at file load (`ns.Module`).
4. On `PLAYER_LOGIN` (subscribed through `ns.On` in `Core/Events.lua`), enabled modules' `Enable(settings)` run under `ns.Try`, so a failing module is reported and skipped.
5. Game events flow from the single event frame to every subscriber; combat-sensitive work is wrapped in `ns.OutOfCombat(fn, key)` (`Core/Combat.lua`) and deferred until `PLAYER_REGEN_ENABLED`.
6. Visual output is produced by `Core/Theme.lua` tokens applied through `Core/Skin.lua` / `Core/Widgets.lua`.

### Settings change

1. The options window (`Core/OptionsWindow.lua`, `Core/Options.lua`) writes through `ns.Settings("<module>")`.
2. Modules that need to react register as watchers or re-read on `ns.Soon`-coalesced refresh; module enable/disable goes through `ns.SetModuleEnabled(name, on)` in `Core/Modules.lua`, which calls `Disable` immediately if present, otherwise on `/reload`.

### Diagnostics

1. A caught failure goes to `ns.Report` (`Core/Events.lua`): kept as one entry per distinct text in `ns.errors` (capped by `ns.MAX_ERRORS = 20`), printed once to chat, forwarded to the game's error handler.
2. `Core/ErrorBadge.lua` watches `ns.OnErrorsChanged` and shows the count; `/vg errors` lists them.

**State Management:**
- Persistent state lives only in SavedVariables (`VanguardDB`, `VanguardCharDB`), keyed by profile then module name.
- Runtime state is module-local upvalues; cross-module state is shared through `ns` fields and `ns.Soon` keys.

## Key Abstractions

**Module registry (`ns.Module`):**
- Purpose: Declares a feature with defaults and lifecycle hooks.
- Examples: `Modules/Bags.lua` (`local BG = ns.Module("Bags", { defaults = {...} })`), `Modules/Bags.lua` defines `BG.PAD`.
- Pattern: Register, then extend the returned table with functions.

**Event hub (`ns.On`):**
- Purpose: Single event frame, many subscribers.
- Examples: `Core/Events.lua`.
- Pattern: `ns.On("EVENT_NAME", fn)`; never create per-module frames for events.

**Settings (`ns.Settings`):**
- Purpose: Per-module settings tables inside the active profile, auto-filled from defaults.
- Examples: `Core/DB.lua`, `Core/Profiles.lua`.
- Pattern: `local s = ns.Settings("Bags", BG.defaults)`; a default fixes its key's type.

**Theme tokens (`ns.Theme` / `T`):**
- Purpose: The only source of colours and font sizes (`T.RGB`, `T.Color`, `T.Text`, `T.Paint`).
- Examples: `Core/Theme.lua`; used as `local T = ns.Theme` in `Modules/Bags.lua`.
- Pattern: Never hard-code colours outside `Core/Theme.lua`.

**Skin API (public):**
- Purpose: Lets other addons restyle through Vanguard.
- Examples: `Core/Skin.lua`, documented in `docs/API.md` and the README "Skin API" section.

**Test-side client:**
- Purpose: Headless WoW for behavioural tests.
- Examples: `scripts/lib/lua-harness.mjs`, `scripts/tests/README.md`.

## Entry Points

**Addon load (file order):**
- Location: `Vanguard.toc` (first `Libs/...`, then `Core/Events.lua`, `Core/DB.lua`, ..., then `Modules/*.lua`).
- Triggers: Client start, `/reload`.
- Responsibilities: Define `ns`, register modules, set up events.

**Login:**
- Location: `Core/Events.lua` (`PLAYER_LOGIN` via `ns.On`), `Core/Modules.lua` (enabling).
- Triggers: `PLAYER_LOGIN`.
- Responsibilities: Enable every module the profile turns on, under `ns.Try`.

**Slash commands:**
- Location: `Core/Slash.lua`.
- Triggers: `/vg`, `/vanguard`.
- Responsibilities: Unlock mode, options, profiles, `errors`, import/export, etc.

**Addon compartment:**
- Location: `Vanguard.toc` `AddonCompartmentFunc: Vanguard_OnAddonCompartmentClick`.
- Triggers: Minimap compartment click.

**Test entry:**
- Location: `scripts/tests/smoke.test.mjs` (CI quick check), other `scripts/tests/<area>.test.mjs`.

## Architectural Constraints

- **Threading:** Single-threaded Lua event model; no threads. Work that must not run in combat is deferred with `ns.OutOfCombat`; fades are capped at 0.15 s in combat.
- **Global state:** The addon exposes no globals except those in `.luacheckrc` `globals` (SavedVariables `VanguardDB`, `VanguardCharDB`, `Vanguard_OnAddonCompartmentClick`, and the `ns.errors` table reached through `ns`). Module-level singletons live as file-local tables (e.g. `BG` in `Modules/Bags.lua`).
- **Load order dependency:** Modules assume `Core/` is loaded and `ns.Theme` exists at file load (`local T = ns.Theme` at the top of `Modules/Bags.lua`). Any new Core file must be placed in `Vanguard.toc` before its first use.
- **Circular imports:** Not applicable (Lua files share `ns`; no `require`). Module-to-module calls form a dependency web (e.g. Auction* and Quest* prefixes share helpers); none are circular at load time as far as observed.
- **Lua 5.1:** No `goto`, `//`, or 5.3+ bit library (enforced by CLAUDE.md).
- **Protected functions:** Nothing protected is called in combat; guard with `ns.OutOfCombat`.

## Anti-Patterns

### Creating a frame per feature for events

**What happens:** A module creates its own event frame and calls `RegisterEvent` directly.
**Why it's wrong:** Bypasses error isolation (`ns.Try`) and the single-frame design; errors go unreported.
**Do this instead:** Subscribe with `ns.On("EVENT", fn)` from `Core/Events.lua`.

### Hard-coded colours or font sizes in modules

**What happens:** A module passes an RGB literal or pixel font size.
**Why it's wrong:** Breaks the theme and the CI rule restricting colours and font sizes to `Core/Theme.lua`.
**Do this instead:** Use `T.RGB`, `T.Color`, `T.Text`, or a theme token from `Core/Theme.lua`.

### Editing files in `Libs/`

**What happens:** Changes to LibStub, CallbackHandler or LibSharedMedia.
**Why it's wrong:** The libraries must stay unmodified so other addons can share them.
**Do this instead:** Wrap behaviour in `Core/SharedMedia.lua` or the feature module.

## Error Handling

**Strategy:** Catch, record, continue. Failures are isolated per handler or module.

**Patterns:**
- `ns.Try(where, fn, ...)` around handlers and module enable/disable (`Core/Events.lua`, `Core/Modules.lua`).
- `ns.Report` keeps distinct error texts in `ns.errors`, prints the first occurrence once, forwards to the game's error handler.
- Secret values are never read or compared; use `ns.IsSecret` and `ns.PlainNumber`.

## Cross-Cutting Concerns

**Logging:** `ns.Chat(msg)` (`Core/Events.lua`) prints a "Vanguard:" prefixed line to `DEFAULT_CHAT_FRAME`.
**Validation:** Settings types are enforced by `ns.Fill` (`Core/DB.lua`) against defaults.
**Authentication:** Not applicable (no accounts or network; the client handles identity).
**Client detection:** `ns.IsForever()` (`Core/Combat.lua`) by interface version, never by global presence.
**Performance:** `Core/Perf.lua` and `ns.Soon` coalescing.

---

*Architecture analysis: 2026-10-09*
