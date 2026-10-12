# Architecture Research

**Domain:** WoW addon UI suite (Lua 5.1, WoW Forever / 12.1 engine), brownfield, with a headless test harness
**Researched:** 2026-10-09
**Confidence:** HIGH for how the existing seams work (read from source and measured); MEDIUM for the test-speed levers (measured on a 16-core dev box, not a 2-vCPU runner); LOW for the two new-feature APIs (party quest progress, loot rolls), which cannot be verified without the client

This file does not re-map the system (see `.planning/codebase/ARCHITECTURE.md`). It answers one question: where does each piece of the milestone's work attach to the architecture that exists, and in what order does that make them safe to build?

## Headline Findings

1. **The runtime architecture is already right; the milestone is mostly about the test rail.** One hub (`ns.On`), a unit-filtered tier (`ns.OnUnit`), error isolation (`ns.Try`), coalescing (`ns.Soon`), and a hub-and-satellite file pattern are all in place. The work is to close a handful of leaks in those seams, not to redesign them.
2. **Test time is a login-cost problem, not a file-load problem.** Measured warm on this machine: `createAddon` (all 114 Lua files from cached chunks) is about 60-100 ms; `loggedIn` (which adds `PLAYER_LOGIN` and every module's `Enable`) is about 600-800 ms (about 2 s cold). There are about 900 `loggedIn(` / `createAddon(` call sites across the suite, so roughly 10 CPU-minutes before assertions or coverage hooks. On the two-core runner the vitest config comment describes, that alone misses a 5-minute target.
3. **Login cost is concentrated.** Wrapping each `def.Enable` with `os.clock` (directional, one noisy run) put ActionBars at about 35% of total Enable time and the top six modules (ActionBars, PlayerAuras, FrameAuras, UnitFrames, RaidTools, InstancePrep) at about 80%. Everything else is small.
4. **Dead public code is nearly gone.** A cross-reference scan of the 1181 `function X.Name(` definitions in `Core/` and `Modules/` found only 6 with no production reference, all used only by tests: `ns.GridLineCount`, `ns.WatchMover`, `O.RowCount`, `W.Cycle`, `CC.Move`, `GW.SkinWith`. Dead-code removal is a small, targeted task. The likelier leftovers are things this scan does not see: unused file-local helpers (luacheck sees these), unused `defaults` keys, unused theme tokens, unreferenced `Media/` files, and test-only seams. 100% line coverage hides dead code, because a test that calls it counts as a hit.
5. **Event handling is sound on the shared frame and leaky at the edges.** Only low-frequency globals use `ns.On` (top: `ADDON_LOADED`, `PLAYER_LOGIN`, `PLAYER_ENTERING_WORLD`, combat toggles). The leaks are specific and fixable (see Event Rail).
6. **Much of the "new levelling features" list already exists.** `Modules/InfoStrip.lua` already shows XP per hour, time to level and gold per hour (`IS.XPRate`, `xprate`/`leveltime`/`goldrate` blocks). `Modules/QuestLog.lua` and `QuestDialog.lua` already show quest XP and money rewards. `Modules/Errands.lua` already has "keep stocked" supply lists and `Modules/InstancePrep.lua` covers reagents and ammo. Before planning feature phases, the author should say which concrete gaps remain (see Feature Integration).

## Standard Architecture

### System overview: four rails

```
 RUNTIME RAIL (ships)                          EVENT RAIL (ships)
 Vanguard.toc load order                       client event
   Libs -> Core/* -> Modules/*                   |
 ns.Module(name, def)  <- file scope             +--> Core/Events.lua shared frame --> ns.On(event, fn)      [globals, low frequency]
 PLAYER_LOGIN -> def.Enable(settings) under Try  +--> per-sub frame, RegisterUnitEvent --> ns.OnUnit(...)     [UNIT_* events]
 ns.Settings(name, defaults) <-> SavedVariables  +--> frame OnUpdate (19 files)  <- throttle copied, not isolated
 T.* tokens (Core/Theme.lua) -> every paint      every handler: ns.Try -> ns.Report -> /vg errors
 ns.Soon(key, fn) coalesces repaint to next frame

 TEST RAIL (does not ship)                     CI RAIL
 scripts/tests/<area>.test.mjs (vitest, 1 file  verify.yml  (every PR, about 1 min): quality, luacheck, 5.1 syntax, test:quick, zip
   = 1 worker unit, parallel across files)      full-suite.yml / lua-suite.yml (weekly, release, label): npm test, coverage
 helpers.loggedIn() -> createAddon() + login()  release.yml (about 9 min)
 lua-harness.mjs (fengari) + wow-stub/world/    Target: whole suite under 5 min on every PR
   layout/widget-api (allowlist)
 count hook = runaway budget; line hook = coverage
```

### Component boundaries

| Component | Responsibility | Talks to | Must not |
|-----------|----------------|----------|----------|
| `Core/Events.lua` | Event hub, `ns.On`/`ns.Off`/`ns.OnUnit`/`ns.SetUnits`, `ns.Try`/`ns.Report` | Everyone (leaf dependency) | Depend on any module |
| `Core/Combat.lua` | `ns.OutOfCombat`, `ns.IsForever`, `ns.Soon`, secret helpers | Modules | Hold feature state |
| `Core/Modules.lua` | Registry, `ns.ModuleEnabled`, login enable loop | Events, DB | Know module internals |
| `Core/DB.lua`, `Profiles.lua` | `ns.Settings`, profiles, SavedVariables | Modules, Options | Be read by tests through private fields |
| `Core/Theme.lua` (1298 lines, 84 top-level locals) | Tokens, pixel math, painting primitives, game-frame primitives, motion and sound, scale | Skin, Widgets, all modules | Be edited for colour from elsewhere (CI rule) |
| `Core/Options.lua` + `OptionsWindow.lua` | Option pages as row tables; window builder; `O.AddPage` | Modules' `defaults` | Contain feature logic |
| Hub module (e.g. `AuctionHelper`, `Windows`) | Registers via `ns.Module`, owns shared state and the registration function (`GW.Add`) | Satellites | Reach into a satellite's locals |
| Satellite files (`AuctionShop`, `WindowsPvP`, `QuestLogView`, `ClickCastOptions`) | `local AH = ns.GetModule("AuctionHelper")`, attach functions, register at file scope | Hub only | Call another satellite's internals |
| Feature module (one file) | Defaults, `Enable`, handlers via `ns.On`/`ns.OnUnit`, view built from `T` | Core services; other modules only via documented `Module.Fn` | Create event frames, hold colour literals |
| `scripts/lib/lua-harness.mjs` | Load addon from cached chunks, drive events/clock/input, expose world | wow-stub/world/layout | Ship |
| `helpers.mjs` | `loggedIn`, fixtures, `WINDOWS_ENV` | Every test | Grow per-test copies of setup |

### Data flow (direction is always inward to Core, never module to module through private state)

```
client event --> ns.On / ns.OnUnit handler (under ns.Try)
                    |  reads game API through C_* / helper wrappers (ns.PlainNumber, ns.IsSecret guards)
                    v
              module state (file-local upvalues; persisted only via ns.Settings)
                    |  ns.Soon(key, repaint)  --> one repaint per frame however many events
                    v
              view code paints with T.* tokens (T.Color, T.Text, T.Paint, T.Panel ...)
                    |
                    v
              frames the client draws          <-- ns.OutOfCombat(fn, key) guards anything protected

options window --> ns.Settings(module).key = v --> module re-reads on next ns.Soon refresh, or flags "reload"
failure anywhere --> ns.Try --> ns.Report --> ns.errors (cap 20) --> chat once, /vg errors, game error handler
```

Cross-module data goes through a documented function on the owning module, never through its upvalues. Rule of two: when a second consumer needs a computation that lives inside a feature module, move it to a Core service. A computation that a profile can switch off (`modules[name] = false`) must not be the only home of a value another module needs. `ns.GetModule("X")` returns the definition even when `X` is disabled, but its `settings` are then nil (`Core/Slash.lua` already guards this for Errands).

## Recommended Structure (changes only)

```
Core/
  Ticker.lua            NEW  ns.Every(frame, interval, fn): throttled OnUpdate under ns.Try, circuit breaker
  Theme.lua             keeps tokens, DEFAULTS/settings, pixel math, T.* public surface
  ThemeFrames.lua       NEW  "Game frame primitives" section (about 300 lines, current lines ~783-1081)
  ThemeMotion.lua       NEW  "Motion and sound" + "Pixel-perfect scale" (current lines ~1155-1298)
  Options.lua           keeps accessors + O.AddPage; page row builders move out by area (O.AddPage already exists)
  OptionsPages*.lua     NEW  one file per area (actionBar, more, raid ...), each calls O.AddPage
Modules/
  AuctionShop.lua      -> AuctionLists.lua (lists + list management), AuctionResults.lua (results + listings), AuctionShop.lua (pane, filters, card)
  <new feature>.lua     one file, own defaults, own options rows via O.AddPage from a *Options.lua or the same file
scripts/tests/
  more.test.mjs        split by area (2735 lines, about 196 login call sites: it is the critical path of the whole parallel run)
  auction.test.mjs     split by area (1818 lines)
  helpers.mjs          loggedIn gains { only: [...] } / { skip: [...] } (see Test Rail)
scripts/lib/
  dead-code.mjs         NEW  cross-reference scan wired into check-code-quality
```

### Structure rationale

- **Split along the banner comments that already exist.** `Theme.lua`, `AuctionShop.lua` and `Options.lua` are already organised in `-- Name ----` sections. The split boundary is a section, and a section's cross-section locals become fields on the hub table.
- **The hub-and-satellite pattern is the house style, so reuse it.** `AuctionHelper` + `AuctionShop/Sell/Owned/...`, `Windows` + `Windows<Area>`, `QuestLog` + `QuestLogView`. Do not invent a second pattern.
- **A split is coverage-neutral.** The coverage floor is a single global percentage (`scripts/lua-coverage-floor.json` is `{ "lines": 100 }`), not per file, so moving code needs no floor change.
- **Functions are already capped at 10 lines**, so file size is driven by function count, which makes sections a safe unit to move.

## Architectural Patterns

### Pattern 1: Hub-and-satellite split (for oversized files)

**What:** The hub file calls `ns.Module(...)` once and keeps shared state. Satellites load after it in `Vanguard.toc` and do `local HUB = ns.GetModule("Hub")`, then attach `function HUB.Thing()`.
**When:** Splitting `AuctionShop`, `MenuStrip`, `TalentPlanner`, `ActionBars`, `AuctionSell`, `RaidFrames`, `ClickCastOptions`; for `Core/Theme.lua` use `local T = ns.Theme`.
**Trade-offs:** A call that was a local upvalue becomes a table lookup (negligible off the hot path; keep per-frame functions in the same file as their caller). Lua 5.1 allows 200 locals per function and 60 upvalues per closure, so splitting relieves a real load-time ceiling rather than creating one.
**Rules for each split:** one split is one commit with no behaviour change; add the new file to `Vanguard.toc` after the hub and before first use (a Core file before the first module that uses it); a file players need does not go in `.pkgmeta` `ignore`; run `npm run verify` before and after and expect the same pass set; do not split a file in the same phase as a behaviour fix to it.

```lua
-- Modules/AuctionResults.lua (satellite)
local ADDON, ns = ...
local T, AP = ns.Theme, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- Starts a results view for one item (the rows come from AH.Queue).
function AH.ShowResults(item) ... end
```

### Pattern 2: Two-tier event subscription (keep it; add one rule)

**What:** `ns.On` for global, low-frequency events. `ns.OnUnit(events, fn, unit1..3)` for any `UNIT_*` event, so the client only sends the named units. `ns.SetUnits(sub, ...)` retargets.
**Rule to add and enforce in `check-code-quality`:** no `RegisterEvent`/`RegisterUnitEvent` outside `Core/Events.lua`, and no `ns.On("UNIT_...")`.
**Current exceptions to fix (verified in source):**
- `Modules/RaidAuras.lua` registers `ns.On("UNIT_AURA", onAura)` on the shared frame in its legacy (non-engine) path, so every unit's aura change reaches the handler, including nameplates. `ns.OnUnit` takes at most three units and a raid has up to 40 tiles, so this one needs a cheap early filter (`RF.ForUnit` already does the lookup) rather than a unit list. Keep it, but measure it first.
- `Modules/UnitFrames.lua` (`listen`, line ~324) and `Core/AuraLegacy.lua` (`Container:SetUnit`, line ~119) call `RegisterUnitEvent` on their own frames with unprotected `OnEvent` functions. An error in `UF.UpdateHealth` then fires on every `UNIT_HEALTH` with no de-duplication in `/vg errors`, instead of being reported once. Route both through `ns.OnUnit`/`ns.SetUnits`, or wrap the dispatch in `ns.Try`.

### Pattern 3: One throttled driver, `ns.Every`

**What:** About nine files repeat an `elapsed = elapsed + dt; if elapsed < N then return end` accumulator in an `OnUpdate`: `ActionBars.pollRange`, `RaidStatus.pollRange`, `Minimap.coordsTicker`, `InfoStrip.ticker`, `Errands.pollFlights`, `MainTanks.poll`, `UnitFrames.pollTargetOfTarget`, `AfkScreen`, `QuestTracker`. None of these `OnUpdate` bodies runs under `ns.Try`, so a bug fires every frame.
**Proposal:** `ns.Every(frame, seconds, fn)` in `Core/Ticker.lua`, loaded after `Core/Events.lua`. It accumulates `dt`, calls `fn` under `ns.Try`, and after N consecutive failures clears the script and reports once (a circuit breaker). Parent the driver to the thing it serves: WoW does not run `OnUpdate` on hidden frames, so `RaidStatus.followHeader` (show/hide with the raid header) and `PowerTicks`/`SwingTimer` (script set only while needed) are the model; the always-on fallbacks (`ActionBars.pollRange`, per-tile `MainTanks.poll`) are the candidates to gate.
**Trade-offs:** touches about nine modules (a mechanical edit each, each needs its existing test to still pass); do it after dead-code removal and before file splits so each file is edited once in a settled state.

```lua
-- Core/Ticker.lua
-- Calls fn every `seconds` while `frame` is shown; a failing fn is reported once and stops after 3 misses.
function ns.Every(frame, seconds, fn) ... end
```

### Pattern 4: Scoped login for tests

**What:** The profile switch `modules[name] = false` is already how tests turn a module off (`auctioncrafting.test.mjs` passes `savedVariables: "VanguardDB.profiles = { Default = { modules = { Errands = false } } }"`). Give `helpers.loggedIn` a first-class `{ only: ["Bags", "Merchant"] }` / `{ skip: [...] }` that writes that table.
**When:** Any area test whose assertions concern one module. Keep a small number of full-login tests (smoke, core, interaction cases such as unit frames plus aura modules) as the integration signal.
**Trade-offs:** A scoped login hides cross-module breakage, which is why a few full-login cases stay. Dependent modules (e.g. `CastBars` needs `UnitFrames`; the options text says "Needs Unit frames") must be listed in `only`; the helper should expand a dependency list rather than make each test remember it.

### Pattern 5: Feature module template (for the new levelling and group features)

**What:** One file in `Modules/`, header comment in the house style, `ns.Module("Name", { defaults = {...} })`, `Enable(settings)` registers `ns.On`/`ns.OnUnit`, repaint via `ns.Soon`, colours and sizes via `T`, protected calls via `ns.OutOfCombat`, values via `ns.PlainNumber`.
**Touch points a feature must update (all of them, or CI or review fails):** `Vanguard.toc` (file order), `.luacheckrc` `read_globals` for each new WoW global, a name/description entry in the `Core/Options.lua` module table (around line 235) and an options page via `O.AddPage`, the README behaviour sentence, `docs/SMOKE-TEST.md`, `docs/THEME.md` if it adds a fade or sound, and a `scripts/tests/<area>.test.mjs` that executes every new line.
**Hotspot:** `Core/Options.lua` (898 lines, 103 top-level locals) is edited by every feature. Give each new feature its own `O.AddPage` call from its own file so Options.lua stops being a merge-conflict point.

## Test Rail: where the time goes and what to change

| Measurement (this machine, 16 cores, warm) | Value | Implication |
|-------------------------------------------|-------|-------------|
| `createAddon` (load all files from chunk cache) | about 60-100 ms | Not the problem; the chunk cache already works |
| `loggedIn` (create + `PLAYER_LOGIN`, all `Enable`s) | about 600-800 ms warm, about 2 s first call in a worker | This is the unit of cost |
| `loggedIn` + `createAddon` call sites | about 900 in 60 files | about 10 CPU-min before coverage hooks |
| Largest files | `more.test.mjs` 2735 lines (about 196 logins), `auction.test.mjs` 1818 lines | Vitest parallelises per file, so the biggest file is the wall-clock floor |
| Enable-time share (directional) | ActionBars about 35%, top six about 80% | Optimise those Enables first |

Levers, in order of expected payoff per unit of risk:

1. **Measure first, in CI terms.** Add an env-gated line to `lua-summary-reporter.mjs` (and a timing wrapper around `login()`) that prints login ms and per-module Enable ms. Run it on a two-core runner or with `VITEST_MAX_WORKERS=2`; the numbers above are from 16 cores and understate the problem.
2. **Cut `Enable` cost in the top six modules.** ActionBars builds every button, region and binding eagerly; building lazily per bar or per visible slot, or sharing one button factory, removes the largest single slice. This is addon code, so it also helps in game.
3. **Scoped logins** (Pattern 4) for the area tests that need one or two modules.
4. **Share a login across read-only assertions** (`beforeAll` in a `describe`) where cases do not mutate the world. The Lua state cannot be cloned or snapshotted in fengari, so reuse, not copy, is the only way to avoid a second login.
5. **Rebalance files:** split `more.test.mjs` and `auction.test.mjs` so no file is more than about 15% of total CPU.
6. **Decide what runs per PR.** Line coverage uses a per-line hook and is much slower than a plain run. Per PR: plain `vitest run` of everything (target under 5 minutes). On merge to main and weekly: `npm run coverage`. Sharding across a matrix does not help the budget: it spends the same total minutes.
7. **Fix determinism while in there:** the harness clock is stubbed (`advance`), which is good; check for any `Date`/`performance` use in tests and for order dependence through `globalThis[Symbol.for("foreverui.chunks")]` (cache is keyed by mtime and size, so it is safe).

**Prerequisite for all of it:** the suite must be green. `npm run coverage` exits before it reports while any test is red, and the three known red harness cases (raid tiles, plate glow, chat watch price) plus the seven in #169 must be cleared or the speed work has no baseline.

**Add an idle-cost test (new, MEDIUM confidence on exact shape).** The harness already counts Lua instructions per call (`countHook`, `budgets`). Expose `addon.cost(fn)` returning instructions used, and assert a budget for "default profile, idle, 10 simulated seconds" and "raid of 40, in combat, 10 seconds". This turns "inefficient event handling" from a review opinion into a regression test, and it is the only way to verify per-frame work without the game.

## Dead-code approach

1. Run the cross-reference scan (a prototype was run for this research: definitions of `function X.Name(` versus `.Name`, `:Name`, `Name =`, `["Name"]` and `"Name"` uses across `Core/` and `Modules/`). Result: 6 candidates, listed in Headline Findings; each is test-only, so remove the function and its tests together.
2. Add the scan to `scripts/lib/code-quality.mjs` as a check with an allowlist, so dead public functions cannot come back.
3. Scan the things this check cannot see: `defaults` keys no code reads; `TOKENS`/`ALIASES` in `Theme.lua` no caller uses; `Media/` files (77) no Lua or TOC references; `read_globals` entries in `.luacheckrc` no file reads (it is a long hand-kept list); `CallbackHandler-1.0` (loaded only as LibSharedMedia's dependency; keep, it is required).
4. Delete in small commits, one concern each; the coverage floor catches nothing here, so rely on `luacheck` plus the scan plus a green suite.
5. Do this before the splits: it shrinks the files that will be split and removes code nobody should have to move.

## Feature Integration

| Feature | Where it attaches | Notes and risk |
|---------|-------------------|----------------|
| PvP reskin (RESKIN S8.1-S8.5) | `Modules/WindowsPvP.lua` is already in the TOC, already has a `pvp` switch, and `windows-pvp.test.mjs` is a stub. Register with `GW.Add(group, "framed" / "popups" / "onDemand", names, skin)` at file scope | Lowest-risk item in the milestone: data registration against an existing registry. The plan says S8 "waits until battlegrounds are live on Forever"; the frame names (`PVPMatchScoreboard`, `PVPReadyDialog`, ...) cannot be confirmed here, so the test uses `WINDOWS_ENV`'s `__window(name)` and the real names go on the in-game check list. Use `onDemand` for frames in a load-on-demand Blizzard addon |
| UI polish (depth, motion, typography) | `Core/Theme.lua` and its split files; `docs/THEME.md` for every new fade or sound | Split Theme before polishing it. Fades are capped at 0.15 s in combat and respect Reduce motion; `ThemeMotion.lua` is then the one place to enforce it |
| Levelling helpers | Extend what exists. XP/hour and time to level: `InfoStrip.XPRate` | If a new feature needs the session XP rate, move `XPRate` into a Core service first (rule of two) so a profile that disables InfoStrip does not break it. Quest XP is already in `QuestLog`/`QuestDialog` (`GetQuestLogRewardXP`, `GetRewardXP`); the gap is probably an aggregate ("XP from completed quests in the log as a share of the level"). Supply reminders overlap `Errands` stock lists and `InstancePrep`. Ask the author which gaps remain before planning |
| Party quest progress | New `Modules/PartyQuests.lua`; hosts near `PartyExtras` (party tiles) | The client does not give you another player's objective progress. Game-API-only version: `QUEST_LOG_UPDATE` plus who shares each quest (`C_QuestLog` party queries; availability on Forever unverified, LOW). Real progress needs addon messages between Vanguard users, which is a new `Core/Comms.lua` (prefix, throttle, `CHAT_MSG_ADDON`, version handshake) and a fake `C_ChatInfo` in the harness. Third-party documentation reports 12.0 chat lockdown during encounters (`C_ChatInfo.InChatMessagingLockdown`), so sends must tolerate refusal. Treat Comms as a separate, cuttable task behind the API-only version. Mark [DECIDE] with the author |
| Loot roll tracking | New `Modules/LootRolls.lua` | Candidate sources: `START_LOOT_ROLL`, loot chat lines (locale-dependent, parse with the client's global format strings), and `C_LootHistory`, which the wiki lists for Classic Era but removed from retail in 10.1 (so presence on a 12.1 vanilla-content client is unknown, LOW). Feature-detect the API at use, like the existing `call(...)` wrappers, and add the world model to `wow-world.lua` before writing the module. Needs an in-game check |

New features come last and are cut first (author's ranking). Because each is one new file plus a registered options page, cutting one removes one TOC line, one test file and one README sentence.

## Anti-Patterns

### Anti-Pattern 1: Changing behaviour and moving code in one commit

**What people do:** Fix a bug in `AuctionSell.lua` while splitting it, or retune ActionBars while extracting `ns.Every`.
**Why it's wrong:** A moved-code diff cannot be reviewed for behaviour, and the suite cannot tell a lost line from a moved one. With the game unavailable, review is the only second check.
**Do this instead:** Fix the AuctionSell posting bug (small diff, with a harness test that drives the post path) before splitting that file; one move per commit; run the same suite before and after.

### Anti-Pattern 2: Per-test full logins as the default

**What people do:** Call `loggedIn()` in every case because it is the simplest correct setup.
**Why it's wrong:** At 0.6-0.8 s it is about 900 of them; it is the whole budget.
**Do this instead:** Scoped login, shared `beforeAll` logins for read-only cases, and a handful of full-login integration cases.

### Anti-Pattern 3: A second event path

**What people do:** `CreateFrame` + `RegisterEvent` in a feature module, or `ns.On("UNIT_...")` for a unit event.
**Why it's wrong:** Bypasses `ns.Try` (an error repeats on every event with no de-duplication) and, for unit events, makes the client send every unit to the handler.
**Do this instead:** `ns.On` for globals, `ns.OnUnit` for units, `ns.Every` for timers; enforce with a code-quality check.

### Anti-Pattern 4: Shared value owned by a switchable module

**What people do:** A new module calls `ns.GetModule("InfoStrip").XPRate()` because the logic is already there.
**Why it's wrong:** If the profile disables InfoStrip, the function's state is never built and the caller errors or returns stale data.
**Do this instead:** Move the computation to a Core service the first time a second module needs it.

### Anti-Pattern 5: Guessing client behaviour in tests

**What people do:** Add a widget method or API to `wow-widget-api.lua` / `wow-world.lua` so a test passes.
**Why it's wrong:** The allowlist is the only thing that makes "passes headless" mean "exists in 12.1". A made-up method hides a runtime error until launch day.
**Do this instead:** Add only methods confirmed in Blizzard's wow-ui-source or the API documentation; otherwise put the case on the needs-in-game-check list.

## Build Order (dependencies drive it)

```
P1  Green + measure           (everything else is verified through the suite)
 |
P2  Test speed                (cheap edits afterwards; also gives the CI target)
 |
P3  Dead code + code-quality scan additions     (shrinks what P5 moves)
 |
P4  Event rail: ns.Every, UnitFrames/AuraLegacy via ns.OnUnit, RaidAuras filter, idle-cost test
 |
P5  Auction posting fix  ---->  P6  Splits (Theme, Options, AuctionShop, then the rest)
                                |
P7  UI polish + PvP reskin (on split Theme; PvP is independent and can run anywhere after P1)
 |
P8  New features (each cuttable)
```

1. **P1 Green and measure.** Clear the three red harness cases and #169; restore `npm run coverage` reporting; add the timing output (login and per-module Enable ms) and take the baseline on two workers. Nothing downstream is trustworthy without it. Pitfall to avoid: chasing pre-existing failures; compare against the base commit first.
2. **P2 Test speed.** Order inside the phase: cut Enable cost in the top six modules; scoped login helper; convert the heaviest files (`more`, `core`, `auction`, `bars`, `units`) first; shared `beforeAll` logins where safe; rebalance `more.test.mjs` and `auction.test.mjs`; change CI so every PR runs the full suite without line coverage and coverage runs on merge to main. Done when the suite is under 5 minutes on two workers and the floor still holds. Doing this before refactors means every later phase is cheap to verify.
3. **P3 Dead code.** The six test-only functions, then the sweeps in "Dead-code approach". Add the scan to `check-code-quality`.
4. **P4 Event rail.** `Core/Ticker.lua` and `ns.Every` first (one place), then convert the nine drivers, then the two `RegisterUnitEvent` leaks, then evaluate `RaidAuras`' shared-frame `UNIT_AURA`. Add the idle-cost test so each conversion has a number. Lint rule last, once the code complies.
5. **P5 Auction posting bug.** Independent of the above except for a green harness, and priority 2 for the author, so it can run in parallel with P3/P4 as long as nobody splits `AuctionSell.lua`/`AuctionShop.lua` yet. Root cause first, then the end-to-end harness test.
6. **P6 Splits.** Order: `Core/Theme.lua` (UI polish depends on it), `Core/Options.lua`/`OptionsWindow.lua` (every feature edits it), `AuctionShop.lua` (after P5), then `MenuStrip`, `TalentPlanner`, `ActionBars`, `AuctionSell`, `RaidFrames`, `ClickCastOptions` as time allows. Stop when the remaining files are under about 500 lines or there is no clean seam. Each split is its own commit. Keep this phase cuttable after Theme and Options; the rest are a nice-to-have, not launch-critical.
7. **P7 UI polish and PvP reskin.** Polish uses the split Theme and `ThemeMotion`. PvP (`WindowsPvP.lua`) is a data-registration task with almost no dependencies and can slot in anywhere after P1. Visual bugs #187-#204 are individually small; group them by file to avoid reopening a file repeatedly. Everything visual goes on the needs-in-game-check list.
8. **P8 New features.** After the author confirms which gaps remain. Order by risk: aggregate quest-XP and supply reminders (existing data) before loot rolls (new API surface) before party quest progress via addon messages (new Core service plus a harness fake).

**Ordering constraints worth stating to the roadmap:**
- P2 before P3-P6: refactors need a fast safety net.
- P3 and P4 before P6: do not move code that is about to be deleted or rewritten.
- P5 before splitting `AuctionSell`/`AuctionShop`.
- P6 (Theme) before P7 polish; P6 (Options) before P8.
- A new Core file always goes in `Vanguard.toc` before its first use; `Core/Ticker.lua` right after `Core/Events.lua` and `Core/Combat.lua`.

## Scaling Considerations

Scale here is raid size, bar count and suite size, not users.

| Concern | Typical (solo, party) | Raid 25-40 | Suite growth |
|---------|----------------------|------------|--------------|
| Unit events | `ns.OnUnit` per unit; fine | One shared-frame `UNIT_AURA` in RaidAuras fallback is the only risky path; filter early | n/a |
| Per-frame work | 19 `OnUpdate` files, mostly 0.2-1 s throttles; fine | MainTanks per-tile polls and range polls scale with tiles; gate on header visibility | Idle-cost test catches regressions |
| Login cost | Not felt in game (frame creation is fast in the client) | Same | The harness pays it about 900 times: scope it |
| Load time and memory | 114 files; `/vg perf` reports CPU and memory | Larger header | Splitting does not change it materially |
| Test suite | about 60 files in parallel | n/a | Wall clock is bounded by the largest file and by cores; keep files balanced |

First bottleneck for the milestone: login cost in the harness. Second: the largest test file.

## Integration Points

### External services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| WoW client API (`C_Item`, `C_Spell`, `C_UnitAuras`, `C_Container`, ...) | Looked up when used, guarded; new globals added to `.luacheckrc` `read_globals` | Never read a value that may be secret; `ns.IsSecret`, `ns.PlainNumber` |
| Blizzard frames (windows reskin) | Registered by name through `GW.Add`; on-demand frames via `onDemand` | Frame names must be confirmed for 12.1 before they join the allowlist |
| Other addons | `Vanguard.API.v1` (auction prices), Skin API (`Core/Skin.lua`), Masque (`Core/Masque.lua`) | Public surface documented in `docs/API.md`; changing a signature is a breaking change |
| GitHub Actions (hosted only) | `verify.yml` per PR; `full-suite.yml`/`lua-suite.yml` scheduled; `release.yml` | Free-tier private-repo minutes: avoid matrix sharding and duplicate full runs |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Module to Core | `ns.*` functions only | Core never calls into a module |
| Hub to satellite | `ns.GetModule(hub)` table fields | Load order in `Vanguard.toc` |
| Feature to feature | Documented `Module.Fn`, or a Core service once there is a second consumer | Guard for the other module being disabled |
| Options to module | `ns.Settings(name)` and `O.AddPage` rows | A feature owns its page |
| Test to addon | Public frames, text, rects, `ns.errors`; `addon.eval` for the rest | Assert on what the player sees, not on internals (README convention) |

## Sources

- Repo, read in full or in the relevant part: `Core/Events.lua`, `Core/Modules.lua`, `Core/Perf.lua`, `Core/Combat.lua` (`ns.Soon`), `Core/AuraLegacy.lua`, `Modules/UnitFrames.lua`, `Modules/RaidAuras.lua`, `Modules/ActionBars.lua`, `Modules/InfoStrip.lua`, `Modules/Minimap.lua`, `Modules/RaidStatus.lua`, `Modules/Errands.lua`, `Modules/MainTanks.lua`, `Modules/WindowsPvP.lua`, `Modules/Windows.lua` (`GW.Add`), `Core/Options.lua`, `Vanguard.toc`, `vitest.config.mjs`, `scripts/lib/lua-harness.mjs`, `scripts/tests/helpers.mjs`, `scripts/tests/README.md`, `.luacheckrc`, `scripts/lua-coverage-floor.json`. (HIGH)
- Measurements taken for this research (throwaway scripts in the session scratchpad, not committed): login and createAddon timings, Enable timing by module, cross-reference dead-code scan, `OnUpdate`/`ns.On` counts. Machine: 16 cores; one run each, so treat as directional. (MEDIUM)
- [Patch 12.0.0 planned API changes, warcraft.wiki.gg](https://warcraft.wiki.gg/wiki/Patch_12.0.0/Planned_API_changes) and [Icy Veins on Midnight addon limits](https://www.icy-veins.com/wow/news/blizzard-relaxing-more-addon-limitations-in-midnight/): secret values and combat restrictions. The chat-lockdown claim comes from a single third-party addon page and is not confirmed from Blizzard. (LOW)
- [C_LootHistory.GetItem, warcraft.wiki.gg](https://warcraft.wiki.gg/wiki/API:C_LootHistory.GetItem) and [GetPlayerInfo](https://warcraft.wiki.gg/wiki/API:C_LootHistory.GetPlayerInfo): listed for Classic Era and removed from retail in 10.1; availability on Forever (12.1 engine, vanilla content) unverified. (LOW)

---
*Architecture research for: WoW addon UI suite (Vanguard), brownfield*
*Researched: 2026-10-09*
