# Vanguard: product and code review

Reviewed: `clifftaylor2325/wow-vanguard-ui` at `c6853f7` (TOC version 0.9.3, Interface 16001 and 120105), read-only, on 2026-11-09. A second pass the same day read line by line the 40 features first judged from their headers; see "Second-pass changes".

## How to read this

- **What I judged against.** The TOC targets WoW Forever (the 12.1 engine with vanilla content, interface 16001) first and Retail 12.1.5 second. API use is judged against that restricted 12.x client (secret values, no combat log for addons, combat lockdown), not against older clients.
- **What I could and could not do.** I cannot run the game. Everything here comes from reading the Lua, the docs, the media files, and from running the repo's own tooling on a scratch copy outside the clone (`npm ci`, `npm run quality`, `node scripts/i18n.mjs status`, and `node scripts/preview-ui.mjs` for 17 headless preview scenes). The previews are the addon's own layout code rendered in a browser with approximated fonts, icons and map, so they show layout, colour and proportion but are not game screenshots. Section 8 lists what needs an in-game eye.
- **Confidence labels.** "Confirmed" means I read the code path and the lines cited. "Suspected" means the code suggests it but it depends on client behaviour I cannot observe. "Measured in game" means the number comes from the owner's own notes in `docs/smoke-results.json`, not from me.
- **Depth labels.** The codebase is about 82,000 lines of addon Lua (Core 22,570, Modules 59,727) plus 27,350 lines of locale files. Each feature carries a depth tag: **[full]** every code line of its files read, **[targeted]** file outline plus the hot paths, event wiring and options rows read in full. The first pass also had a **[header]** tag (header contract, defaults and cross-cutting searches only) on 40 features; the second pass read 38 of those in full and two structurally (slash commands and the probe), so no `[header]` tag remains. In the second pass "read in full" means every code line with comment-only lines skipped, and very long lines (mostly string tables) seen to about 110 to 150 characters. Pure data files (`Modules/KeybindsData.lua`, `Core/WhatsNewNotes.lua`) were skimmed, not checked value by value.
- **Names.** Other addons and third-party UI products are described generically throughout, as asked. A few repo paths contain such names; I describe those files instead of quoting the path.

---

## Second-pass changes

The second pass read line by line the 40 features the first pass had judged from their headers. This section lists what moved. Everything below is reflected in the sections it names.

**Coverage.** 38 of the 40 read in full. Two read structurally and tagged `[targeted]`: slash commands (help table, command table and dispatcher in full, handlers by their heads) and the probe (function list, events and saved-variable writes). The full test suite was not re-run, as instructed.

**Verdicts that moved (2 of 40).**

| Feature | From | To | Reason |
| --- | --- | --- | --- |
| Keybind mode and "Your keys" view | Strong | Solid | The drawn keyboard is 46 keys of one US layout plus mouse, with no function keys, number pad or two-modifier chords (`Modules/KeysView.lua:17-32`). The first-pass phrase "reads every binding" was wrong. Keybind mode itself is as good as stated. |
| Graphics advisor | Needs work | Solid | Nothing is automatic. Writes happen only on an explicit `apply`, each original value is recorded for `undo`, and both refuse in combat (`Core/Graphics.lua:208-225`, `:332-363`). The scope question remains. |

The other 38 verdicts held. Three held for a different reason than the first pass gave: key setup (the engine is strong; the data is what is unverified), quest tracker (content coverage is broad; layout options are the gap) and guided setup (see the correction below).

**New bugs and risks.** None Critical or High. Six Medium (M11 to M16) and seventeen Low (L13 to L29) are added in section 6. The Medium ones:

- **M11** Off-hand items are marked as upgrades for anyone holding a two-hander (`Modules/Upgrades.lua:63`, `:225-229`, `:366-369`, `:376-380`). Confirmed by reading.
- **M12** Two calls into the game's panel manager with no combat check, against the repo's own rule (`Modules/QuestLog.lua:314-318`, `Core/GameMenu.lua:14-17`, `Core/Combat.lua:51-53`). Confirmed by reading; in-game effect not verified.
- **M13** The quest arrow and minimap spots run four tickers that never pause, default on, in combat too (`Modules/QuestArrow.lua:362-363`, `Modules/QuestMinimap.lua:168-169`). Confirmed by reading; cost not measured.
- **M14** First-run setup pre-ticks its recommended rows, so the English-only chat filter and the key-setup offer are on for anyone who clicks through (`Core/SetupGuide.lua:63-84`, `:171-174`, `:251-257`). Confirmed by reading.
- **M15** The cooldown "gaps" row rebuilds its whole list on every cooldown event when switched on (`Modules/CooldownGaps.lua:30`, `:351`). Confirmed by reading; off by default.
- **M16** Collapsed zones in the game's quest log are reopened at every loading screen and map close, from file-scope handlers that ignore the module switches (`Modules/QuestTracker.lua:88-94`, `:102-113`). Confirmed by reading.

**First-pass claims corrected.**

1. **Visibility rules.** "Mouseover needs a poll" was wrong: hover is hook-based (`Core/Visibility.lua:308-325`). The list of features that take rules was incomplete: the meter, fight history and the roll tracker use them too.
2. **"Your keys" view.** It does not read every binding (see the table above).
3. **Graphics advisor.** Judged from its header as a standing liability; it is an explicit, undoable command. Bug L10 is reworded.
4. **"Off by default."** Several features the first pass described that way (chat filter, chat history, spell-rank notices, mail tools, the Cooldown Manager extras, bars 4 and 5, the key-setup offer) are off in their module tables but pre-ticked on the first run of setup. Bugs M7 and H3 now say so.
5. **The "New" quest mark.** "Has no data source" is refined: it guesses an enum key by name (`Modules/QuestGuide.lua:25-63`). Still unverified.
6. **Key setup.** The first pass called it the riskiest feature without having read the engine. The engine is transactional, takes a record, refuses in unsafe states and can undo (`Modules/KeybindsApply.lua:383-433`, `:629-703`). The risk is confined to the data and to the logout backup that runs for everyone.

**Grade and priorities.** The overall grade stays **B-** and no sub-grade moves. The second pass found the line-level code of these 40 features to be as disciplined as the parts read first (no new Critical or High), and found the same two patterns again: work registered outside the module lifecycle, and polling or event handlers that allocate on hot paths. The top five elevation moves and the top five style elevations are unchanged. Seven quick wins (Q15 to Q21) and two near-term items (N20, N21) are added to the roadmap, and the suggested order now starts with Q15 to Q18.

---

## 1. Executive summary

**Where it stands.** Vanguard is five days past its public launch and already carries the surface area of a mature all-in-one suite: 76 registered modules across unit and raid frames, click casting, action bars, nameplates, chat, bags, quests, a full auction toolkit, a reskin of roughly 150 stock windows, and a second client (Retail) added at 0.9.0. The engineering underneath is far better than the addon ecosystem's norm. The product on top of it is uneven: the non-combat tooling is distinctive and deep, the core HUD is competent but shallow in configuration, and almost none of it has been recorded as seen working in the game.

**Overall grade: B-.** Broken down: engineering discipline A-, feature breadth A, core HUD depth C+, configuration experience B-, visual identity B-, in-game verification D. The grade is held down by one fact more than any other: `docs/smoke-results.json` holds 4 results (3 partial, 1 fail) against a checklist with 827 "Expect" lines in `docs/SMOKE-TEST.md`, and 12 shipped files still carry an UNVERIFIED note on their data.

**After the second pass** (38 more features read line by line, 2 structurally): the grade and every sub-grade stand. Two verdicts moved, one each way; six Medium and seventeen Low findings were added; none is Critical or High. The clearest new product point is that the first-run wizard, not the module defaults, decides what most players have switched on. See "Second-pass changes" above.

**Biggest strengths**

1. **Quality infrastructure that most commercial projects lack.** A headless client harness (`scripts/lib/wow-*.lua`), about 3,350 test cases in 61,800 lines, a 100% line-coverage floor, a taint, combat-lockdown and secret-value model in the harness (`scripts/lib/wow-taint.lua`), a code-quality scanner that blocks hard-coded colours and unguarded secure calls, instruction-count benchmarks with budgets, and a release pipeline that publishes to both listing sites.
2. **Written for the restricted 12.x client from first principles.** Secret values go to widgets unread (`Core/Combat.lua:81-120`), cast bars and cooldowns run on the client's duration objects, raid frames use a secure group header with all 40 buttons created up front, every event handler runs under an error budget (`Core/Events.lua:378-435`), and protected work is queued through one combat queue (`Core/Combat.lua:20-49`).
3. **A real design system.** Zero numeric colour literals outside `Core/Theme.lua`, text set by role, eight theme variants, five accent presets plus a custom hex, a high-contrast variant, colour-blind-aware state colours, reduce-motion and text-scale switches. This is the foundation a premium look can be built on.
4. **Distinctive non-combat tooling.** The auction suite (13 files, about 6,000 lines), key setup with class layouts, click-casting starter layouts, the chat-based group board, Situations (per-context layouts recorded by doing), relationship movers, partial profile strings, the settings-loss guard and the coexistence manager. No single one of these is unique in the ecosystem, but having them together in one look is the addon's best argument.
5. **A support loop built in.** `/vg errors`, `/vg perf`, `/vg status`, `/vg report`, the error badge, the feedback form that produces a block the website parses, and What's new. For a solo developer this is the right investment.

**Biggest weaknesses**

1. **Verification debt.** The harness proves the code does what the model of the client says. It cannot prove the model matches the client. The one recorded fail (`docs/smoke-results.json`, step 33.390) is exactly this class: a forbidden-object error on nameplate aura icons that every test passed.
2. **Configuration depth and live apply.** 111 option captions end in "(reload)", module switches take effect on reload (only 4 of 76 modules have a `Disable`), there are 16 sliders in the whole options surface against 52 fixed-step choices, and no per-element colour, font or text-format control. Players who choose an all-in-one suite expect to tune it without reloading.
3. **The core HUD is the thinnest part.** Unit frames have no portraits, no incoming-heal or shield display, no leader, role, resting or PvP marks, no focus target, and fixed sizes (`Modules/UnitFrames.lua:46-63`). Action buttons show no macro names. Nameplates offer three widths and three heights. These are the features players look at every second.
4. **Breadth outruns one maintainer.** 76 modules, 86 `/vg` subcommands, two clients, ten machine-drafted locales, and everything loaded eagerly. Measured in game on 0.9.3: 49.3 MB of memory and a 2.8 s `PLAYER_LOGIN` handler (`docs/smoke-results.json`, step 1.5; a fix for the login stall is on `main` but unreleased).
5. **The look is competent, not yet distinctive.** The default ships with every richer treatment switched off (shadows, gradients, ornaments, panel textures, sized icons: `Core/Theme.lua:246-296`), the brass identity barely reaches the HUD, the icon set mixes two visual families at 32 px, and the painted crest clashes with the flat UI around it. Section 4 covers this in full.

---

## 2. Feature scorecard

Size is lines of Lua in the files named. Depth: F = full read, T = targeted (see "How to read this"). No row is header-level after the second pass.

### Core

| Feature | Size | Depth | Verdict | One-line reason |
| --- | --- | --- | --- | --- |
| Events, error capture, error budget | 724 | F | **Strong** | One dispatcher, per-unit subscriptions, xpcall everywhere, repeat offenders paused; the best part of the core. |
| Combat queue, secret helpers, ticker, client probe | 709 | F | **Strong** | Small, correct, consistently used; one throttled driver instead of scattered OnUpdates. |
| Module system and lifecycle | 127 | F | **Needs work** | Registry only: no dependencies, no teardown, eager load, reload to toggle. |
| Saved variables, schema and migrations | 303 | F | **Solid** | Type-repairing defaults, versioned account upgrades, idempotent table migrations; one registration hazard. |
| Profiles, profile strings, spec profiles, presets | 1,871 | T | **Strong** | Backups before every import, partial strings, safe parser, per-spec profiles; switching still needs a reload. |
| Settings-loss guard | 481 | F | **Solid** | Thoughtful recovery flow; one asymmetric write can raise a false loss. |
| Theme and design system | 3,767 | T | **Strong** | Tokens, roles, variants, live repaint; the default configuration undersells it. |
| Options window, controls, search, pages | about 5,900 | T | **Solid** | Clean modern panel with search and changed-settings view; thin controls and too many reloads. |
| Guided setup and welcome | 1,666 | F | **Solid** | Backup, undo, pause in combat and resume; first run pre-ticks helpers, including two that are not proven. |
| Movers, unlock mode, links, grid | 1,835 | T | **Strong** | Edge-relative positions, snapping, anchoring to other frames, size matching, exit without saving. |
| Visibility rules and Calm HUD | 465 | F | **Solid** | State-driver based so it works in combat; hover is hook-based (first pass wrongly said polled). |
| Slash commands | 903 | T | **Solid** | Complete and documented, but 86 subcommands is a second interface to maintain. |
| Feedback, report, What's new, perf, inspect | 1,472 | F | **Strong** | Closes the loop from a player's bug to a parseable report. |
| Aura containers (engine and fallback) | 857 | T | **Solid** | Right architecture for hidden aura values; the source of both field failures so far. |
| Skin API, integration API, button-skin bridge | 259 | F | **Solid** | Small, documented, guarded; no evidence of outside adopters yet. |
| Localization | 60 + 27,350 | T | **Needs work** | Good pipeline; machine drafts, 184 keys missing per locale, every locale file compiled at login. |
| Graphics advisor | 382 | F | **Solid** | Nothing automatic: explicit apply, every write recorded for undo, combat-gated. Scope question remains. |
| Dialogs, game-menu button, realm keys | 976 | F | **Solid** | Careful dialogs and realm keys; the game-menu button calls the panel manager without a combat check. |

### Frames and combat HUD

| Feature | Size | Depth | Verdict | One-line reason |
| --- | --- | --- | --- | --- |
| Unit frames (with readouts, party pets) | 1,216 | F | **Needs work** | Correct and clean, but far short of what unit-frame users expect to see and tune. |
| Cast bars, cursor ring, interrupt mark | 770 | T | **Strong** | Duration-object timing, latency zone, interrupt readiness without reading hidden values. |
| Target, focus and player auras | 460 | F | **Solid** | Client-run containers survive hidden auras; filters and sizes are fixed at build. |
| Class resources, swing timer, power sparks | 1,030 | F | **Solid** | Covers what hiding the player frame removed; combo points update on every energy tick. |
| Raid frames (tiles, auras, healing, status, preview) | 2,442 | T | **Strong** | Secure header, healer-first tile zones, preview mode; one event-registration hotspot. |
| Raid tools, main tanks, group threat | 585 | F | **Solid** | Sensible and secure; group threat ships unverified and off. |
| Click casting | 3,088 | F | **Strong** | Mouse and hover keys, ranks, class starter layouts, import and undo. |
| Action bars, flyouts, layout, special bars | 1,772 | T | **Solid** | Hand-built secure buttons done carefully; missing several stock button behaviours. |
| Keybind mode and "Your keys" view | 765 | F | **Solid** | Keybind mode is strong; the drawn keyboard is one layout, 46 keys, no function keys or number pad. |
| Key setup wizard and auto-placement | 2,554 | F | **Needs work** | A transactional engine with undo, on spell and stance data the file itself marks unverified. |
| Nameplates | 1,059 | T | **Solid** | Pooled, per-unit events, quest and tag marks; little to configure. |
| Game tools and Cooldown Manager extras | 1,180 | F | **Solid** | Decorates the game's own tools instead of rebuilding them. |
| Combat tools (meter, fight history, rolls, docks, officer tools) | 1,941 | F | **Needs work** | A grab bag: the meter view is fine, boss docks and officer tools are thin. |
| Game alerts and AFK screen | 696 | F | **Solid** | Polished small touches. |

### World, chat and inventory

| Feature | Size | Depth | Verdict | One-line reason |
| --- | --- | --- | --- | --- |
| Minimap and button drawer | 845 | F | **Solid** | Square or round, coordinates, drawer for other addons' buttons. |
| Waypoints | 440 | F | **Solid** | Standard command syntax on the game's own arrow. |
| Info strip, broker strip, menu strip, data bars | 2,815 | F | **Solid** | Useful defaults; fixed places and a fixed block list. |
| Chat skin, windows, bubbles | 1,727 | F | **Solid** | Full restyle without touching messages. |
| Chat extras and history | 691 | F | **Solid** | Links, copy, find, short channels, opt-in history. |
| Chat watch and chat filter | 796 | T | **Needs work** | Filter heuristics are English word lists on a ten-locale addon. |
| Group board | 594 | F | **Solid** | The right answer to a game with no dungeon finder; hand-written English patterns. |
| Bags and bank | 1,528 | T | **Solid** | Sections, custom groups and search operators on the game's own buttons; layout cannot change in combat. |
| Inventory across characters, vendor memory | 451 | F | **Solid** | Tooltip-level; no browsable window. |
| Tooltips | 337 | F | **Needs work** | Skin plus five item or unit lines; thin for a one-stop claim. |
| Gear upgrades and stat weights | 1,099 | F | **Needs work** | Unsimulated weights, and off-hand items are flagged as upgrades for anyone holding a two-hander. |
| Character sheet extras | 172 | F | **Solid** | Item level and missing-enchant marks. |

### Quests

| Feature | Size | Depth | Verdict | One-line reason |
| --- | --- | --- | --- | --- |
| Quest dialog | 1,172 | T | **Solid** | Compact keyboard-driven panel; takes events away from the game's windows. |
| Quest automation | 194 | F | **Solid** | Conservative rules, Shift to skip. |
| Quest tracker (with Retail blocks) | 1,621 | F | **Solid** | Own tracker with secure item buttons and broad Retail content; fixed size, no layout options. |
| Quest log and history | 926 | F | **Solid** | Two-pane log, cross-character "done on" lines. |
| Quest guidance, arrow, minimap spots | 943 | F | **Needs work** | Limited to what the client exposes; the "New" mark is a guess by name; four tickers never pause. |

### Town, economy and windows

| Feature | Size | Depth | Verdict | One-line reason |
| --- | --- | --- | --- | --- |
| Game window skins (Forever) | 9,026 | T | **Solid** | About 150 windows through one registry and shared helpers; unverified visually at this scale. |
| Retail window and feature pack | 1,136 | F | **Needs work** | Honest "best effort"; doubles the surface for a second audience. |
| Auction suite | 5,996 | T | **Strong** | Shopping lists, posting, undercut checks, deals, ledger, crafting costs, a price API. |
| Merchant and bulk trade | 661 | F | **Solid** | Repair, junk, sell list, bulk buy; also owns HUD fonts, which is misplaced. |
| Errands (train all, restock, travel timers) | 939 | F | **Solid** | Small quality-of-life wins. |
| Instance prep and dungeon card | 1,122 | F | **Solid** | A supply checklist at the door; buff IDs unverified. |
| Talent planner | 848 | F | **Solid** | Plans on the game's own tree with legal-order spending; the order is geometric, not the player's. |
| Spell ranks and trainer memory | 281 | F | **Needs work** | Chat-only output, off by default. |
| Crafting queue | 369 | F | **Needs work** | A list of slash commands more than a feature. |
| Mail tools | 722 | F | **Solid** | Inbox search and send-to-alt presets. |
| Pet stable, Legacy helper | 184 | F | **Weak** | Chat printouts and a hand-typed list; placeholders. |
| Auto-accept and Quiet the game | 540 | T | **Solid** | Each off by default and narrowly scoped. |
| Situations | 689 | F | **Strong** | Per-context layouts recorded by doing; a real differentiator. |
| Coexistence manager | 261 | F | **Solid** | Detects overlaps and asks; depends on a hand-kept folder list. |
| Probe | 1,044 | T | **Solid** | Valuable diagnostic; 1,000 lines every player loads for a developer tool. |

Verdict counts across the 64 rows after the second pass: 11 Strong, 40 Solid, 12 Needs work, 1 Weak (first pass: 12, 38, 13, 1). Depth: 46 full, 18 targeted, 0 header-level (first pass: 8, 16, 40).

---
## 3. Feature-by-feature critique

Each entry follows the same shape: what it does and how complete it is, UX, correctness and robustness, performance, code quality, verdict, and the top improvements. After the second pass every entry is tagged `[full]` or `[targeted]`; entries rewritten in the second pass say so where a verdict or a first-pass claim changed.

### 3.1 Core

#### Events, error capture and error budget `[full]`
`Core/Events.lua` (647), `Core/ErrorBadge.lua` (77)

- **What it does.** One event frame for the addon (`ns.On`/`ns.Off`), per-unit subscriptions on their own frames with `RegisterUnitEvent` (`ns.OnUnit`, `Core/Events.lua:589-614`), `ns.Try`/`ns.Guard` wrappers that record an error with its stack and forward it to the game's handler, `ns.Quiet` for calls expected to be refused, and an error budget that pauses a repeating handler after 10 failures (`Core/Events.lua:378-435`). Blocked-action events naming Vanguard are kept for `/vg errors` (`Core/Events.lua:624-647`).
- **Completeness.** Better than what most frameworks offer. The handler lists are copy-on-write, so a handler may unsubscribe itself mid-dispatch (`Core/Events.lua:481-499`).
- **Correctness.** Sound. Unknown events are checked with `C_EventUtils.IsEventValid` before registering. A re-entrancy flag stops an error addon that fails inside the handler from looping.
- **Performance.** Every dispatch pays one `xpcall` per handler. That is acceptable, and timing is switched off after login (`ns.timingOn`). The real cost is not here but in which events modules register globally (see raid frames).
- **Code quality.** Clear. Text helpers (UTF-8 length, case folding, `ns.PlaceText`) live in this file for no reason other than load order; they belong in a `Core/Text.lua`.
- **Verdict: Strong.** The addon degrades module by module instead of dying, and tells the player why.
- **Improve.** (1) Add a lint or a debug assertion that flags `ns.On("UNIT_*")` so unit events always go through `ns.OnUnit`. (2) Move the text helpers out.

#### Combat queue, secret helpers, ticker, client probe `[full]`
`Core/Combat.lua` (311), `Core/Ticker.lua` (108), `Core/Client.lua` (290)

- **What it does.** `ns.OutOfCombat(fn, key)` runs now or after the fight with keyed replacement; `ns.AfterCombat` for `PLAYER_REGEN_DISABLED` handlers; `ns.Soon` coalesces a frame's worth of events; `ns.Spread` spreads heavy builds over frames; `ns.IsSecret`/`ns.PlainNumber`/`ns.PlainText` gate every read of a possibly hidden value; `ns.Restricted(kind)` reads the client's addon-restriction state; `ns.Every` is one shared throttled OnUpdate driver that only runs while a job exists.
- **Correctness.** `ns.IsForever` decides by interface number and project ID, not by feature sniffing (`Core/Combat.lua:176-180`), which is the right call for a client that will keep gaining Retail APIs. `ns.AurasSecret` treats "cannot tell" as hidden.
- **Performance.** The ticker walks every job each frame and calls `IsVisible` on jobs tied to a frame (`Core/Ticker.lua:23-29`). With the roughly 40 `ns.Every` call sites in the addon this is cheap. Only 20 raw `OnUpdate` sites exist outside it, each bounded.
- **Code quality.** Small and readable. `ns.Soon` allocates one closure per first call per key per frame, which is fine.
- **Verdict: Strong.**
- **Improve.** (1) Expose the queue's contents in `/vg status` during combat so a stuck layout can be diagnosed. (2) Document which keys are shared on purpose (for example `"questitems"` is used by both `QT.PlaceItems` and `QT.RetryItems`).

#### Module system and lifecycle `[full]`
`Core/Modules.lua` (127)

- **What it does.** `ns.Module(name, def)` registers a table with `defaults`, `Enable` and optionally `Disable` and `clients`. At `PLAYER_LOGIN` every enabled module's `Enable` runs under `ns.Try` in TOC order (`Core/Modules.lua:118-127`).
- **Gaps.** There is no dependency declaration (the options page says "Needs Unit frames" in prose instead), no load-on-demand, and no teardown. `ns.SetModuleEnabled` writes the flag and calls `Disable` only where one exists (`Core/Modules.lua:102-106`); only Bags, ChatFilter, ChatHistory and Quiet have one. Across the addon there are 278 `ns.On` registrations and 3 `ns.Off` calls. So turning a module off always means a reload, and turning one on does too.
- **Robustness.** Good on failure isolation: one module's error does not stop the rest. Dependent modules do not crash when their parent is off (for example `Modules/FrameAuras.lua:75-81` skips missing frames), but they still register their events (`Modules/RaidHealing.lua:429-436` registers five events even when raid frames are off).
- **Structure.** Many files do work outside the lifecycle: `ns.On("PLAYER_LOGIN", ...)` at file scope in `Modules/WindowsTown.lua:477`, `Modules/WindowsMenus.lua:147`, `Modules/WindowsTabs.lua:1242`, `Modules/KeybindsApply.lua:1033`, `Modules/KeybindsWizard.lua:702`. Each guards itself by reading the owning module's settings, so it is correct today, but the pattern relies on each author remembering to.
- **Performance.** Every file the TOC lists for the client loads (226 entries: 64 Core, 149 Modules, 10 locales, 3 libraries) and all enabled modules build at login. Measured in game on 0.9.3: `PLAYER_LOGIN` 2,782.8 ms longest call, 3,146 ms in all, with RaidAuras 1,494 ms and Nameplates 881 ms (`docs/smoke-results.json`, step 1.5). `main` now spreads those two builds over frames (`Modules/RaidAuras.lua:279`, `Modules/Nameplates.lua:383`), unreleased.
- **Verdict: Needs work.** It is a registry, not a lifecycle. This one file is what forces 111 "(reload)" captions.
- **Improve.** (1) Add `requires = { "UnitFrames" }` to module definitions and let the registry skip or order by it. (2) Add a subscription scope (`def:On(event, fn)`) that the registry can unregister, then give the simple display-only modules a generic `Disable`. (3) Split the town, auction, Retail-only and diagnostic files into load-on-demand companions (see section 5.1).

#### Saved variables, schema and migrations `[full]`
`Core/DB.lua` (303)

- **What it does.** `VanguardDB` (account: profiles, client notes, guard, auction data, key records) and `VanguardCharDB` (profile choice, per-character lists, backup). `ns.Settings(key, defaults)` fills missing or wrong-typed keys and caches the table. Three migration layers: versioned account steps (`ns.UpgradeDB`, `DB_VERSION = 2`), whole-profile steps, and per-table steps that run before defaults are filled.
- **Correctness.** `fill` repairs a hand-edited or damaged file instead of erroring (`Core/DB.lua:12-21`), and broken profile entries are dropped (`Core/DB.lua:70-74`). A failed account step leaves the version unstamped so it retries next login.
- **Risk (confirmed).** `ns.Migrate(key, fn)` stores one function per key (`Core/DB.lua:189-191`). A second registration for the same key silently replaces the first. Today each of the seven keys registers once, so nothing is broken, but nothing prevents the mistake either.
- **Risk (design).** Per-table migrations are unversioned and "must leave an upgraded table as it is" every session. That contract is easy to violate as migrations accumulate; nothing tests idempotence generically.
- **Size.** Measured in game: account file 858 KB of the 16 MB the client allows, character file 21 KB (`docs/smoke-results.json`, step 1.5). Stores are capped (prices 6,000 items per house, ledger 2,000 records, vendor memory 2,000 items, quest history 1,000 quests).
- **Verdict: Solid.**
- **Improve.** (1) Make `ns.Migrate` append to a list, or raise on a duplicate key. (2) Stamp a per-profile schema number so table migrations can become run-once steps. (3) Add a harness test that runs every migration twice and diffs the result.

#### Profiles, profile strings, spec profiles, presets `[targeted]`
`Core/Profiles.lua` (632), `Core/ProfileStrings.lua` (412), `Core/Serialize.lua` (366), `Core/ProfileExport.lua` (149), `Core/OptionsProfiles.lua` (145), `Core/PresetStrings.lua` (52), `Core/Integration.lua` (115)

- **What it does.** New, copy, delete, reset; a rolling backup profile before every import; whole or partial export strings (layout, situations, global, any module); import that merges partial strings key by key; a profile per specialization (per talent group on Forever); the game's Edit Mode layout tied to a profile; a preset registry other addons can add to.
- **Correctness.** The parser reads a fixed grammar and never executes pasted text (`Core/Serialize.lua:1-12`), has a depth cap matching the encoder, a checksum for truncated pastes, and decodes large strings across frames. Imported tables pass through the same migrations as saved ones. Legacy `FUI1:` strings still import.
- **Gaps.** Strings are plain base64 with no compression, so a full profile is long. Switching profile, copying and importing all stage for a reload (`Core/DB.lua:266-270`). A 16-bit checksum (`Core/Serialize.lua:296-300`) catches truncation, not corruption in general; that is adequate for the purpose.
- **Verdict: Strong.** The safest profile import I would expect to find in an addon.
- **Improve.** (1) Live profile switching for the modules that can repaint (theme, movers, strips) with a reload only when a rebuild-on-enable module differs. (2) Compress before base64. (3) A "what will change" summary before an import is applied.

#### Settings-loss guard `[full]`
`Core/SettingsGuard.lua` (481)

- **What it does.** Stamps both saved-variable files at logout and compares them at login. If the account file came back blank or older, it offers to restore from the character's own backup string, paste a string, keep what loaded, or start fresh.
- **Correctness.** The flow handles a second character with an older backup (`alreadyRestored`), a deleted profile, and realm names spelled two ways (`foldRealmSpellings`, added for the README's known issue).
- **Bug (confirmed by reading, Low to Medium).** `G.Save` writes the character stamp unconditionally but the account note only when `G.CharKey()` is non-nil (`Core/SettingsGuard.lua:331-335`). `G.CharKey` is nil when `UnitName("player")` is nil or hidden. If that ever happens at logout, the character file gets a newer stamp than its note in the account file, and the next login reads the note by key (`Core/SettingsGuard.lua:58-63`), finds it older, and reports a loss that did not happen. While a loss is unanswered `G.Save` returns early (`:330`), so the notice then persists until the player answers it. I cannot say how often the client returns no name at logout; the README already admits the same client returns nil for the normalized realm name there.
- **UX.** The recovery choices are clear. A false positive is costly because it holds back setup and puts a warning on two options pages.
- **Verdict: Solid.**
- **Improve.** (1) In `G.Save`, skip the character stamp when the key is nil, or cache the key at login and reuse it. (2) Auto-resolve when the profile that loaded equals the backup (compare the encoded strings) so a false positive clears itself.

#### Theme and design system `[targeted]`
`Core/Theme.lua` (3,611), `Core/SharedMedia.lua` (61), `Core/PanelTexture.lua` (95)

- Covered in depth in section 4. In short: tokens at `Core/Theme.lua:85-137`, accent presets at `:162-166`, variants at `:180-244`, defaults at `:246-296`, text roles at `:2894-2912`, spacing at `:1830`, motion at `:3317-3520`. Every painted frame is remembered and repainted on a theme change.
- **Code quality.** At 3,611 lines it is the largest file and close to Lua's limit of 200 top-level locals (the file says so at `:298-300`). It mixes tokens, pixel maths, primitives, every control's art, fonts, motion, sound and the faction look.
- **Verdict: Strong** as a system. **Improve.** (1) Split into `ThemeTokens`, `ThemePixels`, `ThemeControls`, `ThemeText`, `ThemeMotion` along the section comments that already exist. (2) Turn the off-by-default treatments on after an in-game pass (section 4).

#### Options window, controls, search, pages `[targeted]`
`Core/OptionsWindow.lua` (1,388), `Core/Options.lua` (763), `Core/Controls.lua` (801), `Core/Widgets.lua` (207), `Core/Chrome.lua` (484), `Core/OptionsFold.lua` (129), `Core/OptionsSearch.lua` (209), `Core/OptionsPreview.lua` (161), ten `Core/Options<Area>.lua` files (1,467), plus pages in `Modules/ClickCastOptions.lua`, `RaidHealing.lua`, `Nameplates.lua`, `TalentPlanner.lua`, `Situations.lua`

- **What it does.** A 20-page window with icon navigation, per-page tabs, cards of rows, a settings search with a "changed" view, a profile picker in the header, keyboard navigation, a "More settings" fold per card, a reload notice in the footer, and a live sample on the General page. Pages are data (tables of rows), so the same rows feed the search, the guided setup and the website.
- **UX strengths.** Search across all settings, a dot on pages with non-default values, reset per page, Tab and arrow-key navigation. These are premium features.
- **UX weaknesses (confirmed).** 111 captions carry "(reload)". Controls are almost all switches (about 178) and fixed-step choices (52); there are 16 sliders and one colour control (the accent). Width and height are offered as three or four fixed values (`Core/OptionsFrames.lua:187-188`, `Modules/Nameplates.lua:1042`). Several features expose a "List ... in chat" button as their only output (pets, craft queue, perk plan, fights, sell list), which reads as unfinished. Grouping is sometimes surprising: Situations is listed under Unit frames and Nameplates under Combat tools on the Modules page (`Core/Options.lua:476-484`), and the Calm HUD's settings are stored on the UnitFrames module.
- **Correctness.** Rows built from data; a module absent on this client contributes no rows. Not verified in game.
- **Verdict: Solid.**
- **Improve.** (1) Convert size, count and opacity choices to sliders with live preview (the raid preview already proves the pattern). (2) Drive the reload count down by adding `Apply` methods to modules that only need a repaint. (3) Replace "List in chat" buttons with small list panels.

#### Guided setup and welcome `[full]`

Files: `Core/Setup.lua` (1,163), `Core/SetupGuide.lua` (393), `Core/Banner.lua` (112).

- **What it does.** Up to ten steps: profile (only for a new character on an account that already ran setup, `Core/Setup.lua:1152-1155`), layout, screen, look, comfort, game settings, helpers, combat, move things, done (`:33-34`). Each step applies when you press Next (`:1071-1084`). One backup profile is made before the first change and its name is kept so a resumed run reuses it (`:140-157`). The Done page lists every change of the run and has an Undo that copies the backup back (`Core/SetupGuide.lua:203-224`, `:297-306`; `Core/Setup.lua:997-1003`). A first run ends by offering a profile export (`Core/Setup.lua:959-976`).
- **Gaps against expectations.** No live preview beside the choices, no "apply a friend's string" step, and ten pages is long for a first minute. The screen step offers four presets, pixel-perfect, fit and keep (`Core/Setup.lua:80-94`, `:773-780`); there is no free slider.
- **UX and defaults.** Second-pass correction: on a first run every row marked recommended that is not a game setting starts ticked (`Core/SetupGuide.lua:171-174`) and is applied on leaving the page (`:251-257`). A player who clicks Next through setup therefore switches on faster auto-loot, the chat filter, chat history, spell-rank notices and trainer memory, mail tools (`:63-74`), the game's Cooldown Manager, the buff-end glow, aura timers, bars 4 and 5 and the key-setup offer at next login (`:75-84`). "Off by default" in the module tables is "on for most new players" in practice. That is a defensible onboarding choice for the proven helpers, and the wrong one for the two that are not proven: the chat filter matches English words only (bug M7) and key setup runs on unverified data (H3).
- **Correctness and robustness.** Careful. Setup waits for combat to end before opening (`Core/Setup.lua:1097-1102`, `:1120-1121`), hides and resumes around a fight (`:1133-1148`), reopens at the next login until finished or skipped (`:128-131`, `:983-990`, `:1160-1162`) and does not open when the settings guard reports a loss (`:1161`). The UI-scale write goes through the combat queue (`:456-465`). Layout presets reset only the movers they own (`:170-189`).
- **Performance.** Built on first open; nothing runs afterwards.
- **Code quality.** One weak joint: guided rows find their getters and setters by matching the English caption text of a row on a named options page (`Core/SetupGuide.lua:45-84`, `:106-113`). Reword a caption and the row silently disappears from setup (`:127-135`, `:318-319`). Rows should bind by setting key.
- **Verdict: Solid** (unchanged). The engineering is better than the first pass credited; the pre-ticked rows are the new concern.
- **Improve:** 1) Leave the chat filter and the key-setup offer unticked until they are locale-aware and verified. 2) Bind guided rows by key, not caption. 3) Fold comfort, game and helpers into one page and add the live preview (roadmap B7).

#### Movers, unlock mode, links, grid `[targeted]`
`Core/Movers.lua` (759), `Core/MoverLinks.lua` (424), `Core/MoverPopover.lua` (260), `Core/UnlockBar.lua` (132), `Core/Layout.lua` (189), `Core/Grid.lua` (71)

- **What it does.** Every placeable frame registers a mover. Unlock shows labelled handles and a grid; drag snaps to frame edges and the screen centre; arrow keys nudge; right-click sets exact offsets, scale, opacity, anchoring to another frame's side and width or height matching. Positions are stored against the nearest screen edge. "Exit without saving" restores the session's starting state. Edit Mode and unlock cooperate.
- **Correctness.** Links are resolved to a point on UIParent each time, so no frame is ever anchored to another frame (`Core/MoverLinks.lua` header), which avoids dragging protected frames into each other's anchor families.
- **Verdict: Strong.** **Improve.** (1) Multi-select and align or distribute. (2) A named layout picker inside unlock mode (the role layouts exist in setup only).

#### Visibility rules and Calm HUD `[full]`

Files: `Core/Visibility.lua` (465).

- **What it does.** Compiles a per-frame rule (always, in combat, with a target, in a group, in an instance, on mouseover and combinations) into a secure state driver so shown and hidden states change in combat without addon code. Calm HUD fades chosen parts out of combat using the unit-frame settings (`Core/Visibility.lua:189-194`).
- **First-pass corrections.** I wrote that mouseover "needs a poll". It does not: hover is hook-based, with enter and leave scripts hooked on the frame and its children (`:308-325`). I also listed only bars, strips and data bars as users. The meter, fight history and the roll tracker use it too, and every caller applies the rule through the combat queue.
- **Gaps against expectations.** No custom macro-condition string for power users, and no per-frame fade timing. Unit frames, raid frames and nameplates do not take rules; only Calm reaches them.
- **Correctness and robustness.** The instance condition is compiled when the rule is applied and re-applied on zone change (`:72-80`, `:280-286`), which is right because instance type is not a macro conditional. Suspected, low: children created after the hover watch was installed are not hooked (`:314-319`), so a late-built child can drop the hover state while the pointer is over it.
- **Performance.** Event-free once applied; the driver does the work.
- **Code quality.** Small and readable.
- **Verdict: Solid** (unchanged; reason corrected).
- **Improve:** 1) Re-hook children when a watched frame gains them. 2) Offer the rules to unit and raid frames. 3) An advanced field for a raw condition string.

#### Slash commands `[targeted]`

Files: `Core/Slash.lua` (903).

- **Depth.** Second pass read the help table, the command table and the dispatcher in full and every handler's head; individual handlers were sampled, not read line by line. That is why the tag is `[targeted]`, not `[full]`.
- **What it does.** 86 command words in one table (`Core/Slash.lua:795-887`), most of them one-line forwards to a module's own `Command` function. The dispatcher runs every handler under the error capture (`:891-898`) and refuses a word whose module does not exist on this client (`:116-121`). `/vg` alone opens the options window.
- **Gaps against expectations.** No tab completion and no fuzzy match: an unknown word prints one line pointing at help.
- **UX and defaults.** The help list mixes player commands with several rendering test switches (texel snap, slug, frame buffer, nine-slice) (`:20-23`). Several features exist only as commands with chat output (crafting queue, pets, trainers, ranks, inventory).
- **Correctness and robustness.** Module handlers each check their own settings table and say "off under Modules" rather than erroring; I found no path that indexes a missing module.
- **Code quality.** A table, a dispatcher, no parsing framework. Appropriate.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Hide test switches behind `/vg dev`. 2) Give chat-only features a small panel and let the command open it. 3) Suggest the nearest command on a typo.

#### Feedback, report, What's new, perf, inspect `[full]`

Files: `Core/Feedback.lua` (313), `Core/WhatsNew.lua` (241), `Core/WhatsNewNotes.lua` (data, skimmed), `Core/Perf.lua` (336), `Core/Inspect.lua` (165).

- **What it does.** A two-mode form (bug or feature) with length checks that builds a delimited text block, with the `/vg report` text attached for bugs, to paste on the project site (`Core/Feedback.lua:17-25`, `:81-128`, `:247-254`). Perf prints per-frame profiler metrics, the ten busiest named functions, a 60-second watch, slow-handler timings armed through login, and a 60-second memory run that tells garbage from kept memory by forcing a collection at both ends (`Core/Perf.lua:98-108`, `:118-144`, `:188-240`, `:255-335`). Inspect dumps a frame's state, anchors, ancestors and parts with every read guarded (`Core/Inspect.lua:28-35`, `:86-165`). What's new opens once per version after setup, and its lines jump to the setting they describe (`Core/WhatsNew.lua:53-66`, `:198-236`).
- **Gaps against expectations.** Addons cannot send data, so the copy-and-paste step is unavoidable; it is as short as it can be.
- **Correctness and robustness.** Memory is not read in combat (`Core/Perf.lua:34-39`); profiling is switched through the game's own setting with a reload offer (`:162-169`).
- **Code quality.** Perf and Inspect print hard-coded English. For developer tools that is a reasonable choice, but it is the one place the localisation rule is knowingly broken.
- **Verdict: Strong** (unchanged; confirmed by the full read).
- **Improve:** 1) Put `/vg perf slow` output into the report block when a bug is filed. 2) A "copy and open the site" hint with the short address in the dialog footer.

#### Aura containers `[targeted]`
`Core/Auras.lua` (326), `Core/AuraEngine.lua` (287), `Core/AuraLegacy.lua` (244)

- **What it does.** Modules describe aura rows as specs; the engine backend hands them to the client's own aura container widget (which reads, sorts, lays out and times hidden auras), with a fallback that draws its own icons from filter strings. Unknown filter words are probed once and dropped.
- **Robustness.** This is where both recorded field problems came from: a forbidden-object error re-anchoring icons on plates the game keeps (`docs/smoke-results.json`, step 33.390, fixed on `main`), and the 1.5 s login cost of building rows for 40 raid tiles. The design is right; the client surface is new and under-documented, so expect more of this.
- **Gap.** Because the client does the filtering, players cannot add a spell to a whitelist or blacklist. The filter words are the whole vocabulary.
- **Verdict: Solid.** **Improve.** (1) Guard every icon operation with `IsForbidden` at the one choke point. (2) A user spell list on the fallback path for out-of-instance play, clearly labelled as unavailable while auras are hidden.

#### Skin API, integration API, button-skin bridge `[full]`

Files: `Core/Skin.lua` (104), `Core/Integration.lua` (116), the 39-line button-skin bridge in `Core/`.

- **What it does.** A public global table with an API version number, `RegisterSkin(name, fn)` that runs each registered skin once under the error capture with 25 theme helpers and a per-skin off switch (`Core/Skin.lua:17-104`), `RegisterPreset` with validation (name up to 32 characters, text up to 20,000 and carrying the profile prefix, 20 presets at most, built-ins protected) applied through the normal backed-up import (`Core/Integration.lua:15-46`, `:92-102`), and `OpenOptions(page, setting)` (`:73-82`). The bridge hands action buttons to an optional third-party button-skinning library when it is present.
- **Gaps against expectations.** No unregister, no callback when the player turns a skin off live, and no documented deprecation path beyond the single version number.
- **Correctness and robustness.** A failing skin is recorded and shown in the skins list, not rethrown (`Core/Skin.lua:64-72`, `:92-98`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Publish the helper list as a versioned contract in the docs. 2) Fire a callback on theme-variant change for registered skins (the hook exists: `:52-56`; document it).

#### Localization `[targeted]`
`Core/Locale.lua` (60), `Locales/*.lua` (10 files, 2,735 lines each)

- **Approach.** English text is the key; `ns.Format` with named slots lets translations reorder words; `scripts/i18n.mjs` extracts, exports CSV and imports. A text-fit test inflates every string by a third to catch overflow.
- **State (measured with the repo's tool).** 2,912 keys in code, 2,728 translated in each of ten locales, 184 missing in every one, 33 English strings still unwrapped per the quality baseline (for example `Modules/Nameplates.lua:985`). All translations are machine drafts by the README's own account.
- **Cost (confirmed).** Each locale file returns on its sixth line unless the client runs that locale (`Locales/deDE.lua:4-6`), but the client still reads and compiles all ten: about 2.5 MB of source at every login to use at most 257 KB of it.
- **Hidden gap.** Feature logic that matches English words is not localized at all: chat filter categories (`Modules/ChatFilter.lua:32-42`) and group board patterns (`Modules/GroupBoard.lua:40-41`).
- **Verdict: Needs work.** **Improve.** (1) Load each locale file only on its client with the TOC's per-locale load condition, the same mechanism the TOC already uses per game type (verify the directive on the Forever client). (2) Ship fewer locales until a human has reviewed them, or mark unreviewed ones in the options. (3) Move matcher word lists into the string table.

#### Graphics advisor `[full]`

Files: `Core/Graphics.lua` (382).

- **What it does.** `/vg graphics` samples the frame rate once a second for five seconds out of combat (`Core/Graphics.lua:21`, `:200-205`, `:375-382`), prints the graphics card, the current and the game's recommended quality step, and a suggestion (`:102-121`, `:178-188`). `/vg graphics apply` writes the suggestion: up to 16 detail settings plus the quality step, render scale and the screen preset. `/vg graphics undo` puts everything back.
- **First-pass correction.** I rated this from its header as a liability that "writes game graphics settings". The full read shows nothing is automatic: every write happens only on an explicit `apply`, each original value is recorded once in the per-computer notes before it is changed (`:208-225`, `:302-342`), undo restores all of them (`:346-363`), and both refuse in combat (`:335`, `:359`).
- **Gaps against expectations.** The heuristic is crude: under 30 fps suggests two steps down, 60 or more suggests one up (`:102-107`), from five readings wherever the player happens to stand.
- **Correctness and robustness.** Reads and writes are wrapped; unsupported settings are skipped by asking the client (`:236-247`).
- **Verdict: Solid** (changed from Needs work). Implementation is careful. The scope question stays: this is not what players install a UI suite for, and it is one more thing to keep right on two clients.
- **Improve:** 1) Sample for longer and say "in a city" or "in a fight" in the result. 2) Keep it as a command; do not grow it into an options page.

#### Dialogs, game-menu button, realm keys `[full]`

Files: `Core/Dialog.lua` (591), `Core/GameMenu.lua` (56), `Core/Home.lua` (329).

- **What it does.** Shared text, find, question and reload dialogs (`Core/Dialog.lua:104-116`, `:205-236`, `:336-361`, `:412-441`). A "Vanguard" button in the game menu. A data key made of normalised realm, season or hardcore ruleset and faction, with older key shapes adopted in place (`Core/Home.lua:45-71`, `:86-101`), and a confirmed clean-up of data saved before launch (`:173-329`).
- **Correctness and robustness.** Good details: a danger confirmation never fires on Enter (`Core/Dialog.lua:383-390`); `ns.Irreversible` re-checks combat and a "still valid" test before acting (`:455-468`); the reload button is a secure macro overlay placed out of combat, put away when a fight starts and restored after (`:479-557`).
- **New in the second pass.** `ns.OpenFromGameMenu` calls the game's panel manager to hide the game menu with no combat check (`Core/GameMenu.lua:14-17`). The repo's own rule says the panel manager refuses addon code in combat (`Core/Combat.lua:51-53`), and the game menu can be opened in a fight. See bug M12. Suspected and unverifiable here: a button added into the game menu's own layout (`Core/GameMenu.lua:21-37`) is a known way to taint that menu's protected buttons.
- **Verdict: Solid** (unchanged), with one new Medium.
- **Improve:** 1) In combat, hide the menu with a plain `Hide` or leave it up and open options over it. 2) Check the game-menu button for taint in game (open Edit Mode and log out from the menu after clicking it).

### 3.2 Frames and combat HUD

#### Unit frames `[full]`
`Modules/UnitFrames.lua` (890), `Modules/UnitExtras.lua` (268), `Modules/PartyExtras.lua` (58)

- **What it does.** Player, target, target of target, focus, pet, party 1 to 4, boss 1 to 5 as secure unit buttons with health, power, name, level, health text, classification diamond, tag mark, raid icon and an in-combat edge. Optional "Versus deck" panel joining player and target. Threat percent, pet happiness and a status chip on Forever.
- **Gaps against best-in-class unit frames (confirmed by grep: none of these appear in the files).** No portraits. No incoming heals or shields (the raid tiles have them; the player frame does not). No leader, role, resting or PvP marks. No focus target or pet target. No range fade on party frames. No party cast bars. No arena frames. Sizes are constants (`Modules/UnitFrames.lua:46-63`: 240x36, 120x24, 160x30, 160x32, 150x26) with only the target's height and the power bar's height adjustable. No text-format choice beyond value or percent. Party frames have no debuff display of their own.
- **UX.** Defaults are sensible for a centred layout. The options page for the most-looked-at feature has 13 rows, 8 of them reload-only (`Core/OptionsFrames.lua:85-97`).
- **Correctness.** Good. Health and power go to the bars unread; text is formatted only when plain; party frames use one attribute driver that also hides them in a raid (`Modules/UnitFrames.lua:628-633`); the game's frames are parked under a hidden parent and re-parked when Edit Mode hands them back.
- **Performance (confirmed, Low).** `UF.UpdateHealth` calls `UF.DownState` three times per health event: directly (`:415`), through `UF.PaintHealth` (`:403`) and through `UF.HealthText` (`:178`), each costing five unit queries. `reactionColor` builds a new table on every call (`:81-88`). Target of target is polled five times a second, which is the standard answer.
- **Code quality.** Clean, small functions, shared helpers reused by raid tiles and nameplates.
- **Verdict: Needs work.** Not because it is wrong, but because it is the feature players compare first and it offers the least.
- **Improve.** (1) Per-frame width, height and text format with live apply. (2) Heal prediction and shields on player, target and party by reusing `RH.Prediction`. (3) A status row: leader, role, resting, PvP, plus optional 2D or 3D portrait.

#### Cast bars, cursor ring, interrupt mark `[targeted]`
`Modules/CastBars.lua` (770)

- **What it does.** Player, target, focus and pet bars; the client's timer drives the bar where it can (`StatusBar:SetTimerDuration`), plain times otherwise; latency zone on your own bar; a finish flash with the reason; empowered-cast stage marks on Retail; an optional GCD and cast ring at the cursor; a diamond beside enemy casts that shows whether your interrupt is ready, driven by a duration object so nothing hidden is compared.
- **Correctness.** Cast events are subscribed only for the units that have a bar (`Modules/CastBars.lua:738-739`). The game's crafting cast bar is restyled, not hidden, since it is the only one there.
- **Performance.** `CB.ShowSeconds` avoids a new string per frame (`:137-144`).
- **Verdict: Strong.** **Improve.** (1) Width, height and icon side per bar as sliders. (2) A target-of-cast name on enemy bars where the client exposes it.

#### Target, focus and player auras `[full]`

Files: `Modules/FrameAuras.lua`, `Modules/PlayerAuras.lua`, `Modules/RetailAuras.lua` (460 together), over `Core/AuraEngine.lua`.

- **What it does.** Three debuff groups on the target through the client's own filters (`Modules/FrameAuras.lua:26-32`), debuffs only on focus (`:49-53`). Player buffs (32) and debuffs (16) in rows sized to fit the screen (`Modules/PlayerAuras.lua:44-49`), weapon-enchant cells (`:119-126`), and the four stock frames hidden (`:27`).
- **Gaps against expectations.** Counts and icon size (8, 8, 20) are fixed in code; the options expose only "only mine" and timers. No purge or steal highlight, no buffs on focus, no per-group growth direction.
- **Correctness and robustness.** Suspected, needs the game: `PA.PlaceAuras` re-anchors the client-run aura container (`Modules/PlayerAuras.lua:61-66`) from the enchant update (`:182-188`), which runs on inventory and weapon-enchant events (`:241-243`, `:257`) with no combat check, while the engine itself refuses to create containers in combat (`Core/AuraEngine.lua:55`). If that container is protected, a weapon buff applied or lost mid-fight triggers a blocked move.
- **Performance.** Icons are drawn by the client; the addon's work is placement. The inventory event is registered for all units and filtered in the handler (`Modules/PlayerAuras.lua:257`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Route `PA.PlaceAuras` through the combat queue. 2) Sliders for count and size (roadmap N5). 3) A dispellable or stealable border on target buffs where the client exposes the flag.

#### Class resources, swing timer, power sparks `[full]`

Files: `Modules/ComboPoints.lua`, `Modules/ClassBars.lua`, `Modules/PowerTicks.lua`, `Modules/SwingTimer.lua`, `Modules/RetailClassBars.lua` (1,030 together).

- **What it does.** Combo pips, totem cells as secure buttons (`Modules/ClassBars.lua:33-46`), an energy and mana tick spark inferred from gains (`Modules/PowerTicks.lua:78-83`), a swing timer driven by the client's own swing event (`Modules/SwingTimer.lua:78-87`, `:240`) with a range dim (`:109-129`), and the Retail class resources including runes and stagger.
- **Gaps against expectations.** No per-resource size or colour options; no ranged auto-shot window beyond the bar itself.
- **Correctness and robustness.** Suspected minor: `ArmTotems` enables the mouse on all four totem cells at combat start (`Modules/ClassBars.lua:109-112`), so an empty, invisible cell can take clicks during a fight.
- **Performance.** New, confirmed: the combo-point handler subscribes to the frequent power events for the player with no power-type filter (`Modules/ComboPoints.lua:22-25`, `:114`). Every energy tick runs the update (`:96-105`), allocates a table in `CP.Charged` (`:76-85`) and refits the pips (`:57-61`). Rogues and cat druids pay this continuously. The Retail resource bars have the same shape (`Modules/RetailClassBars.lua:311-321`, `:350`, `:368`); runes refill per frame while recharging (`:179-188`) and stagger polls at 0.1 s (`:205-209`). The swing timer's per-frame ticker runs only while a swing is live (`Modules/SwingTimer.lua:69-75`), which is right.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Return early unless the event's power type is the one displayed. 2) Reuse one scratch table for charged points. 3) Mouse-enable only filled totem cells.

#### Raid frames `[targeted]`
`Modules/RaidFrames.lua` (878), `Modules/RaidAuras.lua` (336), `Modules/RaidHealing.lua` (605), `Modules/RaidStatus.lua` (339), `Modules/RaidPreview.lua` (284)

- **What it does.** A secure group header with 40 pre-created buttons; tiles with non-overlapping zones for name, status, debuffs, HoTs, indicators and power (`Modules/RaidFrames.lua:379-445`); three looks; role sorting; compact scaling for 25 and 40; incoming heals, shields, overshield mark, aggro strip, missing-buff marker; dispel wash; range fade, ready check, resurrection and summon marks; a preview with sample players.
- **Gaps.** No pets. No class or name sort. No per-size layout profiles beyond "stack big raids". Debuff and HoT selection is whatever the client's filters return.
- **Correctness.** Strong design. Buttons are created out of combat with a negative start index (`:691-699`), and a fallback path exists for a client that cannot run secure snippets.
- **Performance (confirmed, Medium).** The base tiles subscribe per unit, but `Modules/RaidHealing.lua:412-424` registers `UNIT_AURA`, `UNIT_HEAL_PREDICTION`, `UNIT_ABSORB_AMOUNT_CHANGED` and `UNIT_THREAT_SITUATION_UPDATE` on the shared frame, so every such event for every unit the client tracks (all nameplates, target, pets) is dispatched through `xpcall` and a table lookup before being discarded. For raid members, each aura add or remove calls `C_UnitAuras.GetUnitAuras(unit, "HELPFUL")` (`:243-250`), which returns a fresh table of aura tables, to decide whether one buff is missing. Outside instances (where auras are readable) in a 40-player group this is steady garbage. `Modules/RaidAuras.lua:120` does the same for `UNIT_AURA` on the fallback backend. `updatePrediction` also resets the overlay width on every health event (`Modules/RaidHealing.lua:338`).
- **Verdict: Strong**, with that hotspot to fix.
- **Improve.** (1) Move those four events onto each tile's own `ns.OnUnit` subscription via a hook list on `RF`. (2) For the buff marker, look up each watched name with the by-name aura call first and only fall back to the full list. (3) Pets and a class sort.

#### Raid tools, main tanks, group threat `[full]`

Files: `Modules/RaidTools.lua`, `Modules/MainTanks.lua`, `Modules/GroupThreat.lua`, `Modules/PartyExtras.lua` (585 together).

- **What it does.** Ready check and a ten-second pull countdown as secure macro buttons (`Modules/RaidTools.lua:58-63`, `:72-77`), target and world markers (`:148-182`), shown to the leader and assistants only (`:45-48`). Main tanks and assists through a secure group header, four at most (`Modules/MainTanks.lua:106-126`). A group threat panel on a dirty flag and a 0.25 s tick with scratch tables (`Modules/GroupThreat.lua:44-99`, `:164-187`) that hides itself when threat is a hidden value (`:31-36`). Eight secure party-extra tiles (`Modules/PartyExtras.lua:21-31`).
- **Gaps against expectations.** Raid tools have no options at all (no countdown length, no role check, no "convert to raid"). Main-tank tiles poll at 0.2 s (`Modules/MainTanks.lua:72-74`) where unit events would do.
- **Correctness and robustness.** All secure work happens out of combat (`Modules/RaidTools.lua:189-196`). Group threat is off by default and unverified in the game.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) A countdown-length choice and a role-check button. 2) Events instead of the main-tank poll. 3) Verify group threat in a dungeon or remove the option until it is.

#### Click casting `[full]`

Files: `Modules/ClickCast.lua`, `ClickCastGame.lua`, `ClickCastOptions.lua`, `ClickCastPresets.lua`, `ClickCastSpells.lua`, plus the ranks data (3,088 together). All six read.

- **What it does.** Binding lists per spec or talent group in the character file (`Modules/ClickCast.lua:90-93`, `:176-179`), applied to frames out of combat (`:253`, `:563-572`). Hover keys through secure enter, leave and hide wrappers that set and clear a click binding (`:523-548`). Import validated (200 bindings and 255 characters at most, `:316-344`). It reads the game's own click-binding profile to tell the player which bindings will not run and marks those cells (`Modules/ClickCastGame.lua:183-192`; `Modules/ClickCastOptions.lua:438-443`, `:467-481`). A "Try it" tile lets you test without a group (`Modules/ClickCastOptions.lua:716-797`). Class starter layouts on the Forever client with an undo string kept (`Modules/ClickCastPresets.lua:192-194`, `:301-312`).
- **Gaps against expectations.** Mouse buttons 1 to 5 only (`Modules/ClickCast.lua:217`); the page shows eight hover keys and the rest need a command (`Modules/ClickCastOptions.lua:25`, `:637-640`). No per-frame-type sets (party versus raid versus enemy).
- **Correctness and robustness.** The secure paths are the conventional ones and are all set out of combat. Needs an in-game pass for the wrapper snippets.
- **Performance.** Low, confirmed: file-scope handlers in the options, presets and spells files run with the module off (`Modules/ClickCastOptions.lua:1161-1164`), and once the page has been opened the combat-end handler recomputes a page signature after every fight (`:154-157`, `:1162`).
- **Verdict: Strong** (unchanged; confirmed by the full read).
- **Improve:** 1) Mouse buttons beyond 5 and wheel bindings. 2) Guard the file-scope handlers on the module being live. 3) Separate lists for friendly and hostile frames.

#### Action bars, flyouts, layout, special bars `[targeted]`
`Modules/ActionBars.lua` (942), `ActionBarFlyout.lua` (280), `ActionBarLayout.lua` (285), `SpecialBars.lua` (265)

- **What it does.** Eight bars of hand-built secure action buttons; bar 1 pages through a state driver (`Modules/ActionBars.lua:79-86`); default bindings redirected with override bindings; per-bar count, rows, size and visibility; empty slots invisible until a drag; range and usability tint; counts; proc glow; a custom secure flyout; the game's pet, stance and extra buttons restyled and movable; a vehicle exit button.
- **Gaps (confirmed by grep).** No macro name text (`GetActionText` is never called). No auto-attack or auto-shot flash. No new-action highlight. No assisted-rotation highlight on Retail. No cooldown text options beyond the game's own. Button spacing and hotkey text have no row on the options page. Pet and stance bars remain the game's frames.
- **Correctness.** Paging has a no-snippet fallback. Bindings are reapplied on `UPDATE_BINDINGS` out of combat and released during pet battles. Range uses the client's push events where present.
- **Performance.** Usability, cooldown and state events each repaint every button (`:885-888`). With three bars that is 36 buttons and matches what the stock UI does; with eight bars shown a coalescing `ns.Soon` would halve the work, since two usable events fire for most changes (the code notes this at `:322-323`).
- **Verdict: Solid.** **Improve.** (1) Macro names and the attack flash. (2) Coalesce the three repaint events per frame. (3) Button spacing and a hotkey-text toggle on the options page.

#### Keybind mode and "Your keys" view `[full]`

Files: `Modules/ActionBarKeybinds.lua` (338), `Modules/KeysView.lua` (154), `Modules/KeysViewCard.lua` (273).

- **What it does.** Keybind mode puts a catcher over every bar button plus the stance and pet buttons (`Modules/ActionBarKeybinds.lua:52-82`, `:249-260`). Hover and press a key, a side mouse button or the wheel, with modifiers (`:37`, `:42-48`, `:202-210`). Backspace or Delete clears (`:33`, `:196`). It tells you which button lost the key (`:104-111`, `:164`), restores the old keys when the game refuses a binding (`:147-153`), saves at once (`:130-134`), lets the screenshot key through (`:182-196`) and leaves when combat starts (`:338`). The keys view draws a keyboard, shows the action icon on each bound key, follows the modifier you hold (`Modules/KeysViewCard.lua:261-266`) and lets you put back a key the key setup changed (`:140-147`).
- **First-pass correction.** I wrote that the view "reads every binding". It does not. It draws 46 keys of a US-layout main block, the space bar and five mouse inputs (`Modules/KeysView.lua:17-25`) across four tabs for no modifier, Shift, Ctrl and Alt (`:27-32`). There are no function keys, no number pad, no Tab, Caps or arrows and no two-modifier chords, and the layout is fixed, so French and German keyboards (both shipped locales) see letters in the wrong positions.
- **Correctness and robustness.** Keybind mode is conservative and correct by reading. Catchers are plain child frames; nothing protected changes in combat.
- **Verdict: Solid** (changed from Strong). Keybind mode alone is strong; the view covers less than claimed and assumes one keyboard layout.
- **Improve:** 1) Add a function-key row and the number pad. 2) Layout choice (or detect by locale) for the letter rows. 3) Click a drawn key to enter keybind mode for it.

#### Key setup wizard and auto-placement `[full]`

Files: `Modules/KeybindsApply.lua` (1,033), `KeybindsLayouts.lua`, `KeybindsLearn.lua`, `KeybindsWizard.lua` (702), `KeybindsData.lua` (data, skimmed) (2,554 together).

- **What it does.** A transactional engine: plan (`Modules/KeybindsApply.lua:383`), take a record (`:629`), place spells (`:647`), bind (`:662`), save, and undo the whole run if a step fails (`:703`). It refuses on the wrong client, in combat, with key windows open or with something on the cursor (`:398-433`) and watches for a blocked action (`:602-606`). The wizard is three steps with a tick box per change (`Modules/KeybindsWizard.lua:430-472`), "now X" text for what each key does today (`:148`), a character or account scope (`:512-526`), and it steps aside in combat (`:678-685`) and when a bar addon, a gamepad or hidden bars make it unsafe (`:50-57`). The learner respects slots and keys the player changed by hand (`Modules/KeybindsLearn.lua:187`, `:196`) and asks once, at the first trained spell or level 10 (`:342-349`).
- **Second-pass reading.** The engine is better than the first-pass verdict implied: it is the most carefully guarded write path in the addon. The verdict stays where it was for one reason only: the data. The layouts name spell IDs and stance pages that the data file itself marks unverified on this client, with 16 spells flagged unknown, and the first-run setup pre-ticks the offer (`Core/SetupGuide.lua:83`, `:171-174`).
- **Correctness and robustness.** One edge: an undo with no set switch reloads the current binding set (`Modules/KeybindsApply.lua:708`), which discards any other unsaved binding edits. Low, confirmed: file-scope handlers run for players who never use the feature. A key backup is written at every logout (`:1005-1014`) and the learner creates its state table (`Modules/KeybindsLearn.lua:59-66`).
- **Verdict: Needs work** (unchanged; the engine is Strong, the data is unverified).
- **Improve:** 1) Verify the data per class in game and mark unverified classes "beta" (roadmap N2). 2) Write the logout backup only for characters that have run key setup. 3) Unticked by default in first-run setup until verified.

#### Nameplates `[targeted]`
`Modules/Nameplates.lua` (1,059)

- **What it does.** Vanguard's frame on each client plate: health, name, level, threat colour, tapped grey, your debuffs, a player's defensive buffs, cast bar, target and focus borders, quest "!" marks, tag marks, soft-target icon, health numbers following the game's own setting, and a restyle of the personal resource display.
- **Correctness.** Plates are pooled and built a few per frame after login; each plate has its own per-unit event subscription; forbidden and widget-only plates are left alone; a plate first drawn in combat gets fallback aura rows and is upgraded afterwards. Scale drift is polled because the client rescales plates without an event.
- **Gaps.** Three widths, three heights, no font size, no friendly name-only mode, no custom colours by unit, no execute-range marker, no target scale, no clickable-area controls. `/vg plates` prints an untranslated string (`:985`).
- **Verdict: Solid.** **Improve.** (1) Sliders and a text-size control with live apply. (2) Friendly name-only mode. (3) A larger, brighter target plate (scale or height bump) since target identification is the plate's main job.

#### Game tools and Cooldown Manager extras `[full]`

Files: `Modules/GameTools.lua`, `Modules/CooldownGaps.lua`, `Modules/CooldownGlow.lua`, `Modules/CooldownKeys.lua`, plus the cooldowns options and wizard (1,180 together).

- **What it does.** Pins the game's own cooldown viewers and damage meter into movers (`Modules/GameTools.lua:133-141`) with a fit scale (`:65-69`, `:94-98`), re-pins after the game re-lays them (`:144-147`) and pauses pins in Edit Mode (`Core/Movers.lua:337-341`, `:421-426`). Extras: a "gaps" row for cooldowns the game's viewer leaves out, a glow on a buff near its end evaluated with a hidden-value-safe curve (`Modules/CooldownGlow.lua:72-81`), and key text on viewer icons.
- **Gaps against expectations.** No custom tracked list in the game's viewer itself (the client owns it); the gaps row is the workaround.
- **Performance.** New, confirmed: when the gaps row is on, `CG.Refresh` runs unthrottled on every cooldown and bag-cooldown event (`Modules/CooldownGaps.lua:30`, `:351`). Each run re-parses the settings strings (`:70-74`), allocates a table and a closure per entry (`:87-90`, `:145-155`, `:168-176`) and re-anchors every cell (`:231-238`). Those events fire many times a second in a fight. Off by default. The glow uses a 0.25 s ticker only while on (`Modules/CooldownGlow.lua:136-141`).
- **Correctness and robustness.** Low, confirmed: the key-text extra registers six events and hooks the bar update and viewer refresh in `Enable` whether or not its switch is on (`Modules/CooldownKeys.lua:97-99`, `:134-140`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Coalesce `CG.Refresh` to once per frame and rebuild the entry list only when settings or the spellbook change. 2) Register the key-text handlers only while the switch is on. 3) A bench step for the gaps row.

#### Combat tools `[full]`

Files: `Modules/Meter.lua` (460), `MeterDetail.lua` (239), `FightHistory.lua` (196), `FightRecap.lua` (87), `Rolls.lua` (355), `BossDocks.lua` (94), `OfficerLoot.lua` (313), `OfficerRoster.lua` (196).

- **What it does.** The meter is a view over the game's own damage-meter sessions (`Modules/Meter.lua:52-61`): nine kinds, three sessions (`:21-30`), ten rows, a spell breakdown per source (`Modules/MeterDetail.lua:26-66`) and a chat report out of combat (`:230-239`). Hidden values go to widgets through guarded setters (`Modules/Meter.lua:86-88`, `:144-149`). Fight history keeps the last 20 fights of the session as bars (`Modules/FightHistory.lua:19`, `:74-99`); the recap prints interrupts, dispels, damage taken and deaths (`Modules/FightRecap.lua:17-76`). The roll tracker compiles its pattern from the client's own localized roll string, so it works in every language (`Modules/Rolls.lua:35-61`), groups rolls into rounds (`:84-95`) and shows loot-roll history (`:106-169`). Officer tools add a hand-typed soft-reserve list and a roster panel.
- **Gaps against expectations.** The meter cannot do more than the client's own (no per-pull history beyond three sessions, no saved fights). Soft reserves are typed one by one (`Modules/OfficerLoot.lua:84-94`, `:209-215`); there is no import of a reserve list and no collection by whisper. Boss docks are two empty mover spots and a command.
- **Correctness and robustness.** The docks command writes position options into one third-party boss-timer addon's bar object and prints coordinates for another (`Modules/BossDocks.lua:53-73`). Writing another addon's options is a compatibility liability, and both products are named in code and in translated player strings (`:23`, `:27`, `:32-41`, `:65`, `:81`). The share buttons put text in the chat box in parts and never send for you (`Modules/OfficerLoot.lua:173-196`), which is the right restraint.
- **Performance.** The meter repaints at 0.5 s only while shown (`Modules/Meter.lua:451`). Low, confirmed: the officer roster registers its watchers in `Enable` whether the feature is on or not, including every unit's flag and connection events (`Modules/OfficerRoster.lua:190-195`).
- **Verdict: Needs work** (unchanged). Meter, rolls and history are fine individually; the group is a grab bag and two members are thin.
- **Improve:** 1) Import a reserve list from a pasted block. 2) Replace boss docks with two ordinary movers and a help line; stop writing another addon's settings. 3) Register roster events only while the roster is open.

#### Game alerts and AFK screen `[full]`

Files: `Modules/GameAlerts.lua` (358), `Modules/AfkScreen.lua` (338).

- **What it does.** Loss-of-control skin and mover (`Modules/GameAlerts.lua:92-103`, `:342-347`), talking head moved, hidden or left alone (`:170-178`), raid-warning font and a hardcore-death style (`:211-246`), a rare-nearby sound and chat line once per creature and never in combat (`:250-271`), and a low-health vignette driven by a colour curve on the health-percent call, which works with hidden health values (`:276-324`). The AFK screen dims the world, shows a faction scene and a card with name, level, zone, time away and XP (`Modules/AfkScreen.lua:135-152`, `:276-299`).
- **Correctness and robustness.** The AFK screen never opens in instances, PvP or combat, waits out a cast, and steps aside for ready checks and any game popup (`Modules/AfkScreen.lua:34-36`, `:157-183`, `:192-196`, `:318-323`, `:333-335`). Keyboard capture is set out of combat. One handler in the file is not under the error guard: the raid-warning event hook (`Modules/GameAlerts.lua:244`).
- **A decision for the owner.** The AFK card carries two long lore quotations as translatable strings (`Modules/AfkScreen.lua:39-48`). Given the care taken elsewhere to keep third-party material out of the repo, it is worth deciding deliberately whether quoted game text belongs in it.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Wrap the remaining hook in the guard. 2) Options for the vignette threshold. 3) Decide on the quotations.

### 3.3 World, chat and inventory

#### Minimap and button drawer `[full]`

Files: `Modules/Minimap.lua` (640), `Modules/MinimapButtons.lua` (205).

- **What it does.** Reparents the minimap into its own holder (`Modules/Minimap.lua:415-425`), square or round mask (`:380-383`), a zone band coloured by PvP status (`:264-269`), coordinates on a 0.2 s ticker that skips when you have not moved (`:313-335`), wheel zoom (`:338-349`), corner buttons pinned (`:33-46`, `:229-239`) and the global shape function other addons read (`:89-99`). The drawer gathers minimap buttons into a panel, four per row, with Escape to close (`Modules/MinimapButtons.lua:76-84`, `:129`).
- **Gaps against expectations.** Confirmed: size is fixed at 180 with no options row (`Modules/Minimap.lua:25`). The drawer only gathers buttons made with the common minimap-icon library's naming (`Modules/MinimapButtons.lua:25`, `:88-92`); hand-made buttons from older addons stay on the map edge.
- **Correctness and robustness.** The build waits for combat to end (`Modules/Minimap.lua:634`); protected buttons are skipped by the drawer.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) A size slider. 2) Gather any child button of the minimap that is not the game's own. 3) Per-button hide list.

#### Waypoints `[full]`

Files: `Modules/Waypoints.lua` (440).

- **What it does.** `/way` in the usual forms ("x y", "Zone x y title", "#map x y", comma decimals) (`Modules/Waypoints.lua:42-116`) placed as the game's own user waypoint and tracked (`:127-132`, `:180-186`), the last eight kept (`:135-168`), a coordinate line on the world map (`:340`), and the pin skinned (`:372-391`). The command is claimed only when no other addon has it (`:260-286`).
- **Gaps against expectations.** One waypoint at a time (the client's limit), no arrow of its own for it, no list window.
- **Correctness and robustness.** Confirmed limit: a zone name is resolved only among the maps under the current continent (`:77-97`), so a waypoint for another continent by name fails. Low: the Map options page always appends a card that names and credits an optional third-party map addon, whether or not it is installed (`:294-295`, `:413-419`).
- **Performance.** The map coordinate line repaints ten times a second while the map is open and builds strings each time (`:315-323`, `:340`). Negligible, map-only.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Search all continents for a zone name. 2) Show the credit card only when that addon is loaded. 3) A small recent-waypoints menu on the map.

#### Info strip, broker strip, menu strip, data bars `[full]`

Files: `Modules/InfoStrip.lua` (1,015), `BrokerStrip.lua` (247), `MenuStrip.lua` (929), `DataBars.lua` (562).

- **What it does.** Info strip: fixed blocks (`Modules/InfoStrip.lua:36-48`) with a session that survives a reload for five minutes (`:163-205`), hourly rates after a minute (`:238-242`), one 1 Hz ticker (`:881-890`) and text set only when it changes (`:566-571`). Broker strip: up to four data feeds from the common data-broker library (`Modules/BrokerStrip.lua:24`, `:229-236`). Data bars: XP, rested, reputation or renown, honor on Retail, sizable through the mover (`Modules/DataBars.lua:383`, `:443`), with kills-to-level in the tooltip (`:281-316`). Menu strip: reparents the game's bag bar and micro menu into its own strip and rescales them (`Modules/MenuStrip.lua:186-191`, `:306-315`), re-seats them after the game's layout (`:288-299`), draws its own glyphs (`:114-122`, `:549-557`) and bag fill bars (`:673-692`).
- **Gaps against expectations.** The block list and order are fixed; four broker feeds is a low ceiling; widths only grow (`Modules/BrokerStrip.lua:172-179`).
- **Correctness and robustness.** Low, confirmed: the game's durability figure is hidden unconditionally (`Modules/InfoStrip.lua:964`, `:970-972`), also when the strip's own durability block is switched off, leaving no durability warning at all. The menu strip is the highest taint exposure of the four because it reparents the micro menu and reclaims it after pet battles and when the game hides it (`Modules/MenuStrip.lua:367-395`); every protected call is queued out of combat, and it needs an in-game pass. It also owns the quest tracker's spot and skins the game's tracker (`:831-839`, `:906-929`), two jobs in one module.
- **Performance.** Event-driven; the inventory event is registered for all units and filtered (`Modules/InfoStrip.lua:958`, `:1015`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Hide the game's durability frame only while the durability block is on. 2) Reorderable blocks and more broker feeds. 3) Move tracker placement out of the menu strip.

#### Chat skin, windows, bubbles `[full]`

Files: `Modules/Chat.lua` (1,259), `Modules/ChatWindows.lua` (382), `Modules/ChatBubbles.lua` (84).

- **What it does.** A per-window outline, panel, scrim and bar (`Modules/Chat.lua:321-335`), the game's art hidden (`:190-196`), tabs restyled through the game's own colour update (`:1219`), an edit box with a rail tinted by chat type (`:558-570`), the side buttons re-stacked beside the bar (`:990-999`), three text sizes or the game's (`:104`), three window scales (`:1121`), line fade never, 60 or 10 seconds (`:162`). The options page manages tabs: new, rename, close, ten message-group switches, width, height and lock (`Modules/ChatWindows.lua:78-107`, `:137-142`, `:191-282`). Bubbles are skinned 0.05 s after a say, yell or party line, in the open world only (`Modules/ChatBubbles.lua:25-30`, `:73-77`).
- **Gaps against expectations.** No timestamps of its own (it sets the game's), no class-coloured names of its own, no per-tab colours, no sticky-channel controls.
- **Correctness and robustness.** Fourteen post-hooks on the game's chat functions (`Modules/Chat.lua:1212-1245`), all on unprotected frames. The six tab-alpha globals are overwritten (`:686-688`), noted in the first pass. Confirmed limit: movers for floating chat windows are opt-in and made only for windows shown at login (`Modules/ChatWindows.lua:379-382`); a window floated later has no mover until a reload.
- **Performance.** The hover-bar poll (0.1 s) runs only with that option on (`Modules/Chat.lua:697`, `:758`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Create the mover when a window is undocked. 2) Slider for text size. 3) Per-tab accent.

#### Chat extras and history `[full]`

Files: `Modules/ChatExtras.lua` (394), `Modules/ChatHistory.lua` (297).

- **What it does.** Clickable web addresses through a chat filter (`Modules/ChatExtras.lua:124-143`), copy of the last 100 lines of the shown tab (`:37`, `:217-224`), short channel names, four-line wheel steps and Ctrl-wheel to top or bottom (`:320-334`), a find box over live and saved lines (`Modules/ChatWindows.lua:287`, `:325-342`). History is opt-in in the module table: per character, as "time, colour, text" lines (`Modules/ChatHistory.lua:56-67`), capped at 100, 200 or 500 lines per window for 1 to 30 days (`:22-23`), whispers left out unless you opt in (`:97-112`), pruned on restore and at logout (`:85-91`, `:264-267`).
- **UX and defaults.** History is one of the rows first-run setup pre-ticks (`Core/SetupGuide.lua:67`), so most new players will have it on.
- **Correctness and robustness.** Lines that arrive before the world loads are buffered and merged (`Modules/ChatHistory.lua:116-121`, `:290-296`). Restored player links are neutralised so stale line IDs are not reused (`:173-185`).
- **Performance.** Low: short channel names are applied by transforming the window's messages after each added line, which walks the window's buffer once per rewritten line (`Modules/ChatExtras.lua:311-316`, `:340`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Rewrite the channel name before the line is added where the client allows. 2) A "copy this line" click. 3) Show saved size in the options row.

#### Chat watch and chat filter `[targeted]`
`Modules/ChatWatch.lua` (362), `Modules/ChatFilter.lua` (434)

- **What it does.** Phrase alerts with a toast and whisper-on-click; a spam filter for gold selling, boosting, recruiting, your own words and repeats, routed to a "Filtered" tab with per-sender allow.
- **Correctness.** Verdicts are cached per line ID so each chat frame gets the same answer (`Modules/ChatFilter.lua:231-238`). Spammers' addon links are made inert (`:177-179`). Hidden chat passes untouched.
- **Limitation (confirmed).** Category word lists are English literals (`:32-42`): "gold", "boost", "recruiting". On the nine other shipped locales the three category switches do nothing useful. `holdsAny` also re-lowers each constant word on every line (`:51-56`), a trivial cost.
- **Verdict: Needs work.** **Improve.** (1) Per-locale word lists in the string table, or hide the category switches where none exist. (2) A "why was this caught" hover and a session review list.

#### Group board `[full]`

Files: `Modules/GroupBoard.lua` (342), `Modules/GroupBoardView.lua` (252). Forever client only.

- **What it does.** Reads channel, yell, say and guild lines, classifies each as looking-for-more or looking-for-group, finds the dungeon from 27 entries with level bands and abbreviations (`Modules/GroupBoard.lua:51-67`) and the roles wanted (`:40-47`, `:95-130`). One post per sender, 40 kept, pruned after 5 to 20 minutes (`:36`, `:135-151`). Filters for kind, "needs my role" and "only dungeons for my level" (`:221-282`). Clicking a post opens a whisper with a message filled in and never sends it (`:295-308`). Counters and a probe command explain an empty board (`:160-211`).
- **Gaps against expectations.** Confirmed: the window shows the first ten posts and "+N more" with no scrolling (`Modules/GroupBoardView.lua:30`, `:200-215`). No composer for your own post, no class filter, no sound for a match on your role.
- **Correctness and robustness.** The vocabulary is English only (`Modules/GroupBoard.lua:40-44`), bug M7. The parser pads words so abbreviations match whole words (`:78-91`).
- **Performance.** One lowercase-and-strip pass per chat line on the enabled channels; fine.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) A scroll view. 2) Per-locale word tables (roadmap N9). 3) A "post my own" row that fills the chat box.

#### Bags and bank `[targeted]`
`Modules/Bags.lua` (375), `BagSections.lua` (375), `BagCategories.lua` (240), `BagSearch.lua` (246), `BagTools.lua` (126), `RetailBank.lua` (83), `ForeverBank.lua` (83)

- **What it does.** Turns on the game's combined bag, restyles it and the bank, and re-lays the game's own item buttons into sections (quest, equipment, consumables, trade goods, other, junk with its vendor value, empty), plus user groups and search operators such as `ilvl>20` and `bind:boe`.
- **Design trade-off.** Keeping the game's buttons means item use is never tainted, but those buttons are protected, so the layout can only change out of combat (`Modules/BagSections.lua` header). Loot picked up mid-fight sits wherever the game put it until the fight ends. Suspected, needs an in-game look: whether the game re-running its own layout in combat visibly scrambles the sections until then.
- **State handling.** The module writes the game's `combinedBags` setting and remembers the player's prior value per computer to restore on disable (`Modules/Bags.lua:57-116`). The code that does this carries two migrations already, a sign the approach is fiddly.
- **Gaps.** No item-level overlay in the bag, no offline bank or alt bag view, no custom sort.
- **Verdict: Solid.** **Improve.** (1) Item level and upgrade arrows as overlays (the arrow exists). (2) An offline "other characters" bag browser built on `Modules/Inventory.lua`'s data.

#### Inventory across characters, vendor memory `[full]`

Files: `Modules/Inventory.lua` (304), `Modules/VendorMemory.lua` (147).

- **What it does.** Per realm and character: item counts for bags and bank, level, money, rested and played time (`Modules/Inventory.lua:36-50`, `:91-110`). Item tooltips gain "other characters hold" lines, six names at most, and a total (`:167-178`). Vendor memory remembers up to three merchants per item for 2,000 items and adds "Sold by" to tooltips (`Modules/VendorMemory.lua:17`, `:60-68`, `:108-114`).
- **Gaps against expectations.** Confirmed: there is no window. Other characters' bags are reachable only through tooltip lines and chat commands (`Modules/Inventory.lua:242-291`). No mail, no shared or guild bank, no search.
- **Correctness and robustness.** Suspected, needs the game: the bag list includes container -1 (`Modules/Inventory.lua:25`) and counts it under "bags" (`:108`); on a client where that is the bank's main container its contents would count as bags only while the bank is open. Vendor memory is account-wide and not keyed by realm or faction (`Modules/VendorMemory.lua:20-23`), so the other faction's merchants show on your alts.
- **Performance.** Bag scans are coalesced to 0.5 s (`Modules/Inventory.lua:114-119`), but while the bank is open the bank is recounted on every bag event (`:115`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) An offline bags window from the data already stored (roadmap B6). 2) Key vendor memory by faction. 3) Check container -1 in game.

#### Tooltips `[full]`
`Modules/Tooltips.lua` (337)

- **What it does.** Flat skin on five tooltips (twelve more behind the menus switch), class or reaction border and name colour, a target line, hide in combat, corner or cursor anchor, sell price, owned count, item ID, and a hook list other modules add lines to.
- **Gaps.** On a player: no guild rank, realm, role, item level or specialization. No spell or aura IDs. No anchor per tooltip type, no scale, no health-bar text.
- **Correctness.** Uses the tooltip data processor where the client has it, with script hooks as fallback (`:261-269`). Anchoring respects forbidden and anchoring-restricted tooltips (`:302-305`).
- **Performance (confirmed, Low).** `decorate` builds `{ r, g, b }` for `T.SetBorder` on every unit tooltip refresh (`:134`).
- **Verdict: Needs work** for a one-stop claim. **Improve.** (1) Player info lines. (2) Spell and aura ID toggle. (3) Pass three numbers to `T.SetBorder`.

#### Gear upgrades and stat weights `[full]`

Files: `Modules/Upgrades.lua` (632), `UpgradeWeights.lua` (198), `UpgradeStrings.lua` (53), `UpgradeWizard.lua` (215).

- **What it does.** Scores an item as the sum of weight times stat from the client's stat table, plus an item-level weight on Retail (`Modules/Upgrades.lua:195-204`), compares with what is worn (two-hander against main hand plus off hand, `:237-241`, `:265-269`) and shows "+N% (estimate) vs [item]" on tooltips, arrows in bags and marks on quest rewards (`:395-405`, `:435-443`). Hit, expertise and defense are discounted past a cap using the character's live ratings (`:274-346`), which is a good idea done properly. A wizard edits weights and caps (`Modules/UpgradeWizard.lua:81-88`, `:124-130`); two string formats import.
- **Gaps against expectations.** Weights are six hand-set kinds on Forever (`Modules/UpgradeWeights.lua:73-84`) and five generic kinds shared by every spec of a role on Retail (`:88-94`), so Retail verdicts are close to "higher item level and the right primary stat". No weapon speed, set bonus, enchant or gem awareness. Bag arrows appear only on the game's combined bag frame (`Modules/Upgrades.lua:452`, `:627-628`).
- **Correctness and robustness.** New, confirmed (bug M11): off-hand, shield and held-in-off-hand items are compared only with slot 17 (`:63`). With a two-hander equipped that slot is empty, `weakest` reports an empty slot (`:225-229`), `UP.Compare` returns "empty" (`:366-369`), the tooltip says "Upgrade: fills an empty slot" (`:397-398`) and `isUpgrade` is true (`:376-380`). Every usable off-hand item in the bags and in quest rewards gets an upgrade arrow for anyone holding a two-hander. Tooltip, bag and quest marks are all on by default (`:30`).
- **Performance.** Scores are cached per link and cleared only when role or weights change (`:208-213`); the cache is unbounded for a session, which is small in practice.
- **Verdict: Needs work** (unchanged; one confirmed logic bug added to the unsimulated weights).
- **Improve:** 1) Compare an off-hand item against main hand plus off hand when the main hand is two-handed (or stay silent). 2) Per-spec weight sets on Retail, or switch the feature to item level there and say so. 3) Arrows on the addon's own bag sections.

#### Character sheet extras `[full]`

Files: `Modules/CharacterExtras.lua` (172).

- **What it does.** Item level on each gear slot, an optional "!" on enchantable slots with no enchant (`Modules/CharacterExtras.lua:44-49`, `:104-118`), and a chat summary with average item level, melee damage per second and missing enchants (`:131-139`).
- **Gaps against expectations.** No average on the sheet itself, no durability per slot, no gem check on Retail, no inspect-frame version.
- **Correctness and robustness.** Suspected, Retail only: the level shown is the fourth return of the item-info call (`:39`), the base level, where the upgrades module asks the client for the detailed level (`Modules/Upgrades.lua:187-190`). Upgraded or scaled Retail items may show the wrong number. Vanilla items are unaffected.
- **Performance.** Paints only while the character window is shown (`Modules/CharacterExtras.lua:113-118`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Use the detailed item level. 2) Print the average on the sheet. 3) The same labels on the inspect window.

### 3.4 Quests

#### Quest dialog `[targeted]`
`Modules/QuestDialog.lua` (358), `QuestDialogParts.lua` (449), `QuestDialogView.lua` (365)

- **What it does.** A compact panel replaces the game's gossip and quest windows: portrait, text, numbered options with number keys, reward cards with quality borders, Space to accept, Escape to leave.
- **How.** It unregisters the gossip and quest events from the game's frames (`Modules/QuestDialog.lua:23-27`, `:327-334`) and drives everything through the game's own functions.
- **Risks.** (Suspected, Retail) The same list unregisters `GOSSIP_SHOW` from the game's custom gossip manager, so gossip that the game would show in a special themed frame gets the plain panel instead. (Design) Other addons that hook the game's quest or gossip window to add buttons or read state will find it never shown. The switch is reload-only, so a player who hits a broken dialog cannot fall back mid-session.
- **Verdict: Solid.** **Improve.** (1) A modifier or `/vg` toggle that re-registers the game's events for the session. (2) Pass textured gossip through to the game on Retail.

#### Quest automation `[full]`

Files: `Modules/QuestAuto.lua` (194).

- **What it does.** Accepts and turns in on its own with Shift to skip (`Modules/QuestAuto.lua:30-32`, `:112-116`). It never accepts a quest that flags you for PvP (`:93-95`) and turns in only when nothing has to be paid (`:87-89`). A chat line follows each accepted quest (`:126-150`).
- **Correctness and robustness.** Confirmed from the first pass (bug M5): the reward pick ranks choices by stack vendor price alone (`:50-57`, `:60-64`) with no reference to the upgrades module.
- **UX and defaults.** Off in the module table, offered but not pre-ticked in first-run setup (`Core/SetupGuide.lua:72-73`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Never auto-pick when any choice is marked an upgrade (roadmap Q6). 2) A per-NPC skip list. 3) Skip daily or repeatable turn-ins that cost items, behind a switch.

#### Quest tracker `[full]`

Files: `Modules/QuestTracker.lua` (535), `Modules/QuestTrackerView.lua` (668), `Modules/RetailQuests.lua` (418).

- **What it does.** Its own tracker with quests in the game's order or nearest first (`Modules/QuestTracker.lua:210-212`), tracked achievements (`:272-301`), tracked recipes with reagent counts (`:309-377`) and a block registry other modules add to (`:389-419`). Auto-track on accept (`:234-238`). Quest timers tick only while a timed quest is watched (`:198-200`). Quest item buttons are secure, eight at most, placed out of combat, with range tint and cooldown sweeps (`Modules/QuestTrackerView.lua:500-507`, `:534-538`, `:571-582`, `:656-660`). On Retail it adds scenario stages with timers and spells, campaign grouping, area and watched world quests, bonus objectives, the monthly log, endeavors and collectables (`Modules/RetailQuests.lua:73-178`, `:184-222`, `:227-375`).
- **Gaps against expectations.** Confirmed: 260 wide with a 174-high body and ten rows before "+N more" (`Modules/QuestTracker.lua:23`; `Modules/QuestTrackerView.lua:376-383`, `:431-439`). No width, text-size or per-section options, no progress bars (percent as text), tooltips off in combat (`Modules/QuestTrackerView.lua:105`).
- **Correctness and robustness.** New, confirmed: two file-scope handlers expand every collapsed zone header in the game's quest log at each loading screen and whenever the map's quest panel closes (`Modules/QuestTracker.lua:88-94`, `:102-113`). They are registered when the file loads, not in `Enable`, so they run with the tracker and the quest log switched off, and there is no option. The comment explains why (the addon's lists read the whole log); the effect is that a zone a player folds by hand reopens.
- **Performance.** Refreshes are coalesced to one per frame across twelve events (`:25-27`, `:474-476`, `:528`), but each refresh rebuilds every row and computes each block's lines up to three times (`Modules/QuestTrackerView.lua:236-239`, `:256-258`, `:379-383`). With nearest-first order or a timed quest it does that every second (`Modules/QuestTracker.lua:198-200`, `:468`).
- **Code quality.** Names a third-party quest addon in a settings key and a loaded check (`:21`, `:40-41`).
- **Verdict: Solid** (unchanged). Content coverage is better than the first pass assumed; layout options are the gap.
- **Improve:** 1) Width and text-size options and progress bars. 2) Expand headers only while a Vanguard quest module is on, and offer a switch. 3) Compute a block's lines once per refresh.

#### Quest log and history `[full]`

Files: `Modules/QuestLog.lua` (361), `Modules/QuestLogView.lua` (418), `Modules/QuestHistory.lua` (147).

- **What it does.** A two-pane log, 640 by 440 (`Modules/QuestLogView.lua:14`), with collapsible zones, XP per quest (`:241-263`), objective progress bars (`:311-316`), reward cards shared with the quest dialog, track, share and abandon. Ctrl-click marks several quests and one confirmation lists what each abandon destroys; each abandon re-checks that the game has the right quest selected first (`Modules/QuestLog.lua:215-272`). The game's quest-log key is rebound to it with an override binding (`:297-304`, `:337-341`). History remembers turn-ins across the account, 1,000 at most (`Modules/QuestHistory.lua:17`, `:56-63`).
- **Gaps against expectations.** No search or sort, not resizable, zone folds are forgotten at reload (`Modules/QuestLog.lua:14`). History keeps one record per quest, the last character to turn it in (`Modules/QuestHistory.lua:66-72`), so "Done on" never lists more than one alt.
- **Correctness and robustness.** New, confirmed against the repo's own rule (bug M12): the hook on the game's quest-log toggle closes the world map through the panel manager with no combat check (`Modules/QuestLog.lua:314-318`), while every other map call in these modules goes through the "not in a fight" helper (`:276`; `Modules/QuestTracker.lua:443`; `Core/Combat.lua:51-60`). Clicking the quest micro button during a fight runs that call. Selecting a quest in the log also changes the game's selected quest (`Modules/QuestLog.lua:154`), a small side effect.
- **Verdict: Solid** (unchanged), with one new Medium.
- **Improve:** 1) Skip or defer the map hide in combat. 2) Keep a set of characters per quest in history. 3) A search box and remembered folds.

#### Quest guidance, arrow, minimap spots `[full]`

Files: `Modules/QuestGuide.lua` (234), `QuestGuideMap.lua` (173), `QuestArrow.lua` (365), `QuestMinimap.lua` (171).

- **What it does.** Shift-click a tracked quest to point the game's marker or a waypoint at it (`Modules/QuestGuide.lua:84-120`), a next-step line in the tracker (`:144-149`), quest-start pins on the world map (`Modules/QuestGuideMap.lua:38-47`, `:128-137`), a movable arrow with distance that follows the nearest watched quest with hysteresis and favours quests ready to hand in (`Modules/QuestArrow.lua:26-28`, `:40-63`, `:167-173`), and quest spots on the minimap with edge clamping for square and round shapes (`Modules/QuestMinimap.lua:80-100`).
- **First-pass refinement.** I wrote that the "New" mark "has no data source". More precisely: it looks for a key containing "forever" or starting with "new" in two of the client's quest enums and compares each quest with it (`Modules/QuestGuide.lua:25-63`). That is a guess by name. If the client has no such key the mark never shows, and nobody has recorded seeing it.
- **Gaps against expectations.** Everything rests on what the client reports for a quest; there is no bundled quest database, so quests the client gives no spot for show "No spot from the game" (`Modules/QuestArrow.lua:241`).
- **Performance.** New, confirmed (bug M13): four tickers are started with no owner frame (`Modules/QuestArrow.lua:362-363`; `Modules/QuestMinimap.lua:168-169`), and the shared ticker only pauses jobs bound to a frame (`Core/Ticker.lua:72-87`). So, default on and in combat too: once a second the arrow rebuilds a full quest record for every watched quest (`Modules/QuestArrow.lua:40-56`; `Modules/QuestTracker.lua:140-147`); ten times a second it reads the player's map position (a new object each call), formats two strings and rotates the texture (`Modules/QuestArrow.lua:227-255`); once a second the minimap layer asks for every quest on the map; five times a second it allocates a scale table and reads position again (`Modules/QuestMinimap.lua:71-77`, `:133-141`). Cost not measured.
- **Correctness and robustness.** Suspected, needs the game: the quest-start pins are the addon's own buttons parented to the world map's canvas (`Modules/QuestGuideMap.lua:94-125`, `:156-163`), a known way to taint the map. The pins also name a third-party quest addon in a loaded check (`:59`).
- **Verdict: Needs work** (unchanged).
- **Improve:** 1) Bind the tickers to their frames, stop them in combat and in instances, and reuse scratch tables. 2) Verify or drop the "New" mark. 3) Test the map pins for taint in game (open the map in combat after pins have drawn).

### 3.5 Town, economy and windows

#### Game window skins (Forever) `[targeted]`
`Modules/Windows.lua` (2,493), `WindowsSocial.lua` (1,694), `WindowsTown.lua` (693), `WindowsSystem.lua` (848), `WindowsMap.lua` (1,258), `WindowsMenus.lua` (147), `WindowsTabs.lua` (1,242), `WindowsPvP.lua` (267), `WindowsMove.lua` (384)

- Covered in section 4.1. About 110 registrations naming roughly 150 frames in ten switchable groups, through one registry (`GW.Add`, `GW.AddOnDemand`, `Modules/Windows.lua:2401-2410`) and about 45 shared helpers. Windows also become draggable with remembered positions.
- **Correctness.** Skins fade art by alpha and paint behind it; state lives in side tables; `GW.Needs` declares what a skin depends on so a patched window keeps the stock look and logs one note instead of half-dressing.
- **Verdict: Solid.** The mechanism is strong; what holds the verdict down is that 9,000 lines of visual work have essentially no recorded in-game check.

#### Retail window and feature pack `[full]`

Files: `Modules/RetailWindows.lua` (251), `RetailBank.lua`, `RetailVault.lua`, `RetailLanding.lua`, `RetailHousing.lua`, `RetailDelves.lua`, `RetailMythicPlus.lua`, `RetailProfessions.lua`, plus `RetailAuras.lua`, `RetailClassBars.lua` and `RetailQuests.lua` covered above. All read.

- **What it does.** Declarative tables of frame paths per window (`Modules/RetailWindows.lua:34-104`), dressed step by step through the shared helpers with each path under the error capture so a missing part costs nothing (`:179-187`). Covered: group finder, PvP, encounter journal, who list, character pane, expansion landing, transmog, trading post, housing, account bank tabs, delves, professions (spec page, crafting orders, book) and the keystone window. Features: a Great Vault block on the info strip with a tooltip and click-to-open (`Modules/RetailVault.lua:44-123`), a Mythic+ tracker block with elapsed and limit, "over time", deaths and seconds lost, affixes and criteria (`Modules/RetailMythicPlus.lua:83-147`), a delve heading with tier, currencies, affixes and the reward-chest state (`Modules/RetailDelves.lua:29-41`, `:109-119`).
- **Gaps against expectations.** The Mythic+ block has no two- and three-chest thresholds and no enemy-forces bar. Collections, achievements and the calendar are not in these files.
- **Correctness and robustness.** None of the frame paths has been recorded as seen in a live Retail client, and they will drift with patches. The delve header is found by a hard-coded widget type number (`Modules/RetailDelves.lua:47-49`). A widget-update event is registered at file scope for all widgets and filtered by type (`:125-129`); cheap, but it fires constantly on Retail.
- **Verdict: Needs work** (unchanged). Well built for what it is; unverified and behind the Forever side.
- **Improve:** 1) A Retail verification pass with screenshots, or freeze the pack (roadmap B9). 2) Chest thresholds in the Mythic+ timer. 3) Read the widget type from the client's enum.

#### Auction suite `[targeted]`
`Modules/AuctionPrices.lua` (538), `AuctionHelper.lua` (700), `AuctionTable.lua` (341), `AuctionShop.lua` (1,211), `AuctionRestock.lua` (181), `AuctionCrafting.lua` (279), `AuctionSell.lua` (928), `AuctionOwned.lua` (458), `AuctionDeals.lua` (226), `AuctionUpgrades.lua` (325), `AuctionAlerts.lua` (170), `AuctionAPI.lua` (204), `AuctionLedger.lua` (435)

- **What it does.** Two tabs on the game's auction window: shopping lists with a throttled search queue, and posting with undercut rules and one stack per click. A full scan records cheapest price, units and a market value defined as the quantity-weighted mean of the cheapest 15% of units (`Modules/AuctionPrices.lua:129-137`). On top: undercut checks and cancel-next, deals, gear upgrades for sale, price alerts, a sales ledger, crafting cost and profit, disenchant values, restock lists fed by instance prep, and a versioned price API for other addons.
- **Correctness.** Posting, buying and cancelling only happen inside a click. Every price passes `ns.PlainNumber` before arithmetic. Stores are pruned by age and capped per house and across houses (`:24-30`).
- **Design question.** The 6,000-item cap per house evicts the least-listed items after a full scan; on a busy house that may drop rare items players most want prices for. Not measurable from here.
- **Verdict: Strong.** This is the deepest feature in the addon and the best case for "one-stop". **Improve.** (1) A price-history sparkline on the sell card from the 7 days already stored. (2) Review the eviction rule against a real full scan. (3) Group posting for many stacks in fewer clicks where the client allows.

#### Merchant and bulk trade `[full]`
`Modules/Merchant.lua` (149), `Modules/MerchantBulk.lua` (512)

- **What it does.** Auto-repair, sell greys with retries, a personal sell list with confirmation, sell-all-of-item, stack and max buying.
- **Correctness.** Selling checks a merchant is open before every try, because using a bag item with no merchant would equip or consume it (`Modules/Merchant.lua:61-68`). Equipment-set items are never sold.
- **Cohesion problem (confirmed).** The same module themes the error line, zone text, scrolling combat text and the floating damage font (`:95-128`), and writes the `DAMAGE_TEXT_FONT` global. A player who turns "Merchant" off loses HUD font theming, which nobody would guess.
- **Gaps.** No guild-funds repair on Retail; no earnings summary after selling.
- **Verdict: Solid.** **Improve.** (1) Move the font work to the theme or a "HUD text" module. (2) Print the total earned.

#### Errands `[full]`

Files: `Modules/Errands.lua` (576), `ErrandsBoats.lua` (95), `ErrandsStock.lua` (268).

- **What it does.** A "Train all" button on the trainer window with count and cost in its tooltip (`Modules/Errands.lua:110-127`, `:182-191`); it skips new professions and pet trainers (`:76-97`) and buys at most 30 per click (`:24`). "Keep stocked": a per-character list built by dragging items onto a slot (`Modules/ErrandsStock.lua:56-62`, `:203-213`); at a merchant it buys up to each amount, picks the cheapest listing (`Modules/Errands.lua:333-342`), rounds to whole stacks (`:353-355`), checks money (`:365`), verifies each purchase arrived for up to three seconds and stops if not (`:372-401`), then reports in chat (`:413-418`). A flight timer learns each route on its first flight (`:474-520`); a boat timer is off by default (`Modules/ErrandsBoats.lua:76-94`).
- **UX and defaults.** Restocking spends money at every merchant visit with no confirmation (`Modules/Errands.lua:438-443`). The list is empty until the player fills it and each purchase is reported, so the behaviour is earned; a first-time notice would still be kind.
- **Correctness and robustness.** Low, confirmed: the training run marks skills done by name (`:95`, `:104`, `:161`) and does not re-read the list inside its loop (`:157-172`), so a rank that unlocks after the previous one is bought needs a second click. Learned flight times live in the profile (`:20`), so a profile switch forgets them.
- **Performance.** The flight poll runs only during a flight (`:479`, `:513-515`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Loop on the trainer's update event until nothing is affordable. 2) Keep flight times account-wide. 3) A one-time "bought for you" explanation the first time restock runs.

#### Instance prep and dungeon card `[full]`

Files: `Modules/InstancePrep.lua` (458), `InstancePrepBuffs.lua` (232), `InstancePrepWizard.lua` (171), `DungeonCard.lua` (261).

- **What it does.** A card at the dungeon or raid door, once per instance and not on a reload (`Modules/InstancePrep.lua:383-392`), and on a ready check (`:396-398`): class reagents by level band on the Forever client (`:57-68`, `:153-164`), food, bandage and potion counts by item subclass (`:41`, `:85-111`), durability under a threshold (`:180-183`), the stock list (`:170-177`) and a "Buy list" button that hands the shortfall to the auction helper (`:317-320`). A two or three step wizard sets amounts with suggestions by level (`Modules/InstancePrepWizard.lua:30-60`). The dungeon card (off by default) adds the instance name, level range, group size, when you last ran it, your quests there and keys in your bags (`Modules/DungeonCard.lua:56-77`, `:99-126`, `:175-183`, `:213-223`).
- **Gaps against expectations.** Counts are by category, not quality: twenty low-level potions satisfy "potions". Buff checks are off by default and rest on unverified spell IDs (`Modules/InstancePrepBuffs.lua:23-59`); on Retail the flask list is empty so that row can never show (`:43`, `:108-111`).
- **Performance.** New, low, default on: the low-supplies warning recomputes all rows after every bag update (`Modules/InstancePrep.lua:428-430`, `:456`), which walks every bag slot and asks for an item table per slot (`:103-111`), on top of the inventory module's own scan.
- **Code quality.** The buff report command prints hard-coded English (`Modules/InstancePrepBuffs.lua:227-231`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Share one bag snapshot between inventory, prep and restock. 2) Count only consumables usable at your level. 3) Verify the buff IDs or label the option experimental.

#### Talent planner `[full]`

Files: `Modules/TalentPlanner.lua` (848). Forever client only.

- **What it does.** Reads the client's trait tree (`Modules/TalentPlanner.lua:142-179`), keeps a plan per spec group in the character file (`:198-211`), drops planned nodes that vanish after a patch and says so (`:215-225`), simulates a legal spending order with gates and all-of or any-of prerequisites (`:240-311`), puts click marks on the game's talent buttons in Plan mode (`:415-458`), and spends: purchase, commit, roll back on refusal, never in combat or over staged picks (`:611-672`). A level-up prompt or auto-spend (off by default, `:24`, `:675-693`). Export and import with a class check and a confirmation (`:719-771`).
- **Gaps against expectations.** Confirmed limit: the spending order is geometric. The next pick is the topmost row, then leftmost, then lowest node number (`:276-289`). A player cannot say "this tree first", so with points planned in two trees the automatic order alternates by row instead of following a levelling order. No bundled builds.
- **Correctness and robustness.** Careful by reading. Needs the game: whether addon-driven purchase and commit calls, and child buttons on talent nodes, leave the talents window able to apply afterwards.
- **Performance.** Refreshes only while the talents window is visible (`:569-578`).
- **Verdict: Solid** (unchanged).
- **Improve:** 1) An ordered plan: click order is spend order. 2) Show the order as numbers on the nodes. 3) An in-game taint check for the spend path.

#### Spell ranks and trainer memory `[full]`

Files: `Modules/SpellRanks.lua` (281). Forever client only.

- **What it does.** Finds action slots holding a lower rank than the highest you know (`Modules/SpellRanks.lua:36-55`); `/vg ranks` lists them and `/vg ranks swap` replaces them out of combat (`:72-87`). Trainer memory records each class trainer's services with rank, level, cost, place and faction, 400 per class (`:137-167`, `:177-186`), and prints what the next levels bring at level-up or on command (`:201-237`, `:248-255`).
- **Gaps against expectations.** Chat only. No mark on the bar button, no "visit a trainer" reminder with a waypoint, no window.
- **UX and defaults.** Off in the module table but pre-ticked in first-run setup (`Core/SetupGuide.lua:68-69`).
- **Correctness and robustness.** No bug found. Downranking on purpose is not distinguished from a stale rank, so healers who keep low ranks on their bars will be nagged.
- **Verdict: Needs work** (unchanged).
- **Improve:** 1) A small corner mark on stale buttons with a click to swap. 2) An "ignore this slot" choice. 3) Fold the next-levels list into the trainer window.

#### Crafting queue `[full]`

Files: `Modules/CraftQueue.lua` (369).

- **What it does.** A per-character queue driven by commands (`Modules/CraftQueue.lua:46-48`, `:95-101`, `:132-140`). "Next" opens the recipe and the player presses Create (`:153-160`); the head of the queue counts down on the matching cast (`:304-309`). Shortfalls can be pushed to the stock list and the auction restock (`:164-173`). It notes profession cooldowns across characters (`:38-41`, `:202-262`) and ranks the five most profitable recipes from auction prices (`:267-286`).
- **Gaps against expectations.** No window, no drag ordering, no "craft all" (the client requires a click per craft, but a visible queue beside the profession window is the expected form). Off by default.
- **Performance.** Low, when on: every profession list update reads a schematic for up to 300 recipes to note cooldowns (`:29`, `:74-78`, `:202-213`).
- **Correctness and robustness.** Old per-profile data is merged into the new stores at enable (`:314-360`), carefully.
- **Verdict: Needs work** (unchanged): the logic is sound, the feature has no face.
- **Improve:** 1) A queue panel docked to the profession window. 2) Read cooldowns only for recipes that have one. 3) Material totals with "have, need, buy" columns.

#### Mail tools `[full]`

Files: `Modules/MailTools.lua` (722).

- **What it does.** A panel beside the mail window: search, four filters (`Modules/MailTools.lua:41`, `:81-97`), a Take button per row, "Take all" that steps every 0.3 s, waits for the game's pending flag, re-reads and compares each mail before acting (`:154-156`, `:216-227`), never pays cash-on-delivery (`:131`, `:147`) and stops when bags are full (`:170-199`). "Return all" sits behind the irreversible-action confirmation and skips auction sales (`:242-248`, `:285-290`). Presets fill the recipient and attach items by words in their names; the player still presses Send (`:351-382`). Rows warn when mail expires within three days and says when it would be deleted (`:394-399`).
- **Gaps against expectations.** No total of gold collected, no recipient list of your own characters, and only the first page the server sends is listed (`:425-437`).
- **UX and defaults.** Off in the module table, pre-ticked in first-run setup (`Core/SetupGuide.lua:70-71`).
- **Correctness and robustness.** Low, confirmed: `MT.Attach` counts attempts, not successes (`Modules/MailTools.lua:351-360`), so the "items attached" line can overstate and the 12-slot limit can be reached by failed attempts. Suspected: the running flag is cleared only in the run's exit branch (`:253-256`, `:263-268`); if a step ever errors inside the timer the flag stays set until a reload.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Count attachments by reading the send slots after each use. 2) Clear the running flag when the mail window closes. 3) A gold total at the end of "Take all" and a drop-down of your own characters.

#### Pet stable, Legacy helper `[full]`

Files: `Modules/PetStable.lua` (81), `Modules/Legacy.lua` (103). Forever client only.

- **What it does.** One chat line when the stable opens and a `/vg pets` printout (`Modules/PetStable.lua:55-76`). A hand-typed perk list with a 16-point budget in the account file, off by default (`Modules/Legacy.lua:23-56`, `:92-98`).
- **Correctness and robustness.** Nothing to go wrong; nothing much to do either.
- **Verdict: Weak** (unchanged; confirmed by the full read).
- **Improve:** 1) Remove both as modules (roadmap N10). 2) If stable information is wanted, put it in the pet frame's tooltip.

#### Auto-accept and Quiet the game `[targeted]`
`Modules/AutoAccept.lua` (131), `Modules/Quiet.lua` (262), `Modules/QuietDeclines.lua` (147)

- Summon and resurrection accept, faster auto-loot, error-line filtering, zone text hiding, camera distance, declines for duels, guild invites, stranger group invites and friend requests, instant battleground release.
- **Correctness.** Each uses the game's own answer and closes the matching prompt, including the Forever-specific invite frames (`Modules/QuietDeclines.lua:70-73`, `:95-101`). Self-resurrection options are checked before auto-release. `Quiet` has a real `Disable`.
- **Verdict: Solid.** **Improve.** The stranger-invite whitelist noted under Group board.

#### Situations `[full]`

Files: `Modules/Situations.lua` (587), `Modules/SituationsBanner.lua` (103).

- **What it does.** An override is the difference between two snapshots of mover spots and a whitelist of keys from five modules (`Modules/Situations.lua:62-68`, `:203-231`), recorded by doing (`:391-413`). Applying writes the override into the live settings while the originals are held aside (`:314-324`); they are put back at logout and on profile change (`:424-438`), and exports run against the base values (`:347-354`). Situations in priority order: Mythic+ and delves on Retail, PvP, instance, raid, party, resting, solo (`:137-143`). Applied only out of combat (`:379-385`). A banner on the options window and the screen while recording, and a note on any setting that is not recordable (`Modules/SituationsBanner.lua:30-33`, `:82-87`).
- **Gaps against expectations.** The whitelist is narrow: info strip, menu bar, XP bars, four nameplate switches and Calm HUD (`Modules/Situations.lua:62-68`). Action bar, unit frame, raid frame and chat settings are covered only by position, scale and opacity. No spec or "in a city" situation.
- **Correctness and robustness.** Suspected UX hazard: while an override is applied and you are not recording, changing an overridden setting or moving an overridden frame writes to the live table only; the next situation change restores the base (`:320-324`, `:365`) and the edit is gone, with no banner or note because those exist only while recording.
- **Verdict: Strong** (unchanged; the design holds up under a full read).
- **Improve:** 1) When an edit touches an overridden key outside recording, ask "save to this situation or to the base?". 2) Widen the whitelist to bar visibility and raid-frame size. 3) A spec situation.

#### Coexistence manager `[full]`

Files: `Modules/Coexist.lua` (261).

- **What it does.** A table of about forty outside addon folder names, each mapped to one Vanguard module or to named setting keys (`Modules/Coexist.lua:25-49`). At login it says once per addon in chat that both do the same job (`:247-255`) and adds "Turn off / Keep both" rows to the Modules page (`:226-244`). It never changes anything unasked (`:173-215`) and remembers exactly which keys it turned off so turning back on restores those (`:185-203`).
- **Gaps against expectations.** Confirmed: each outside addon maps to exactly one module, so whole-UI suites are reported only against action bars (`:38`). The list is kept by hand.
- **Names.** This file is the largest single block of third-party product names in the repo, and they are shown to players (`:219-222`). The feature cannot work without the folder names; the owner should decide that this is the one sanctioned place for them.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Let one outside addon map to several modules. 2) Detect overlap by behaviour where possible (for example, another addon already owning the nameplate or bag frames) so the list shrinks. 3) Keep the names in this file only.

#### Probe `[targeted]`

Files: `Modules/Probe.lua` (1,044).

- **Depth.** Second pass read the function list, every event registration and every saved-variable write, not each probe line. Tag `[targeted]`.
- **What it does.** `/vg probe` asks the client a fixed list of open questions (API presence, enum values, hidden-value behaviour, paging, bindings, bar slots) and saves the answers for a paste (`Modules/Probe.lua:897-935`, `:965-990`). `/vg probe fight` arms two snapshots for the next fight (`:995-1031`).
- **Correctness and robustness.** On demand only: the combat-start handler returns at once unless armed (`:1017-1024`), the flight-map handler notes one small table (`:778-782`), and the saved report is written only on a run.
- **Performance.** About a thousand lines loaded for every player for a developer tool; it costs memory, not time.
- **Verdict: Solid** (unchanged).
- **Improve:** 1) Move it to a load-on-demand companion with the other diagnostics (roadmap B2). 2) Commit probe outputs per class and build as test fixtures (roadmap N2).

---
## 4. Style assessment

**Limits of this section.** I judged style from three sources: the theme and skinning code, the media files themselves (I rendered every file in `Media/Textures`, `Media/Icons` and `Media/Art` to contact sheets and looked at them), and 17 scenes from the repo's own headless preview (`node scripts/preview-ui.mjs`), which lays out the addon's real frames in a browser with approximated fonts, spell icons and map. None of this is a running client. Sub-pixel crispness, how panels sit over a bright world, text legibility at speed, and how the skinned game windows actually look are all on the in-game list at the end of the section.

### 4.0 What the look is built from

The style is a real design system, defined in one file and enforced by CI.

- **Colour tokens.** About 80 named colours at `Core/Theme.lua:85-137`: surfaces stepped about 0.04 apart in OKLCH lightness (`void`, `inset`, `panel`, `raised`, `raisedHover`, `divider`, `borderHi`), three text tiers plus disabled, state colours off the red-green axis (`good`, `warn`, `bad`, `info`), reaction, power, threat, dispel-type, cast, heal and shield overlays, XP and reputation, zone text. Modules read them through `T.RGB` (`:418`), `T.Color` (`:3081`), `T.Tint` (`:453`) and `T.BarColor` (`:495`).
- **Accent.** One accent with five presets (`:162-166`: brass `d9a441`, arcane, jade, orchid, copper) or any hex, and two derived shades computed in OKLCH (`:350`) so every accent gets a readable text shade and a dim shade.
- **Variants.** Eight token sets (`:180-244`): default, high contrast, vellum, classic, midnight, obsidian, moss, ember. A variant can also switch ornaments, the minimap shape and bar backing.
- **Typography.** Text is set by role (`:2894-2912`): title 15, heading 13, name 12, label 12, number 12, cell 11, small 10, tiny 10, badge 9, plus outlined roles for world text and bars. One family (Fira Sans Condensed Medium and SemiBold, `:25-31`) with a serif heading face per faction used only when the faction look is set to "auto". A global text scale from 0.7 to 1.3 (`:2931`).
- **Spacing and shape.** A five-step spacing scale (`T.SPACE`, `:1830`), row height 28 (`:1841`), control metrics (`:1822`), square corners by default with an optional 4-unit radius (`:727`) and 8-unit "shield" corner cuts on unit frames (`:730`).
- **Depth.** One-pixel edge, a one-pixel top sheen, an optional bevel (`:792`), a soft shadow built from pieces (`:825`), a glow ring (`:900`), an optional panel gradient (`:1018`) and optional panel surface textures (`Core/PanelTexture.lua:25-27` plus five of Vanguard's own).
- **Primitives.** `T.Panel` (`:1397`) and `T.HudPanel` (`:1407`), `T.Button` (`:1689`), `T.EditBox` (`:1717`), `T.Slot` (`:1790`), switch capsule (`:2049`), check box (`:2172`), radio (`:2219`), divider (`:2280`), slider (`:2466`), tab (`:2599`), tooltip (`:2614`), list row (`:2709`), scroll bar (`:2812`), crest (`:3180`), ornaments (`:3193-3295`). Each remembers what it painted and repaints on a theme change (`T.Refresh`, `:3141`).
- **Motion and sound.** Alpha fades with ease-out, a window open and close, hover easing, a knob glide, all capped at 0.15 s in combat and switched off by Reduce motion (`:3317-3520`). Six of the game's own interface sounds by use (`:3523-3534`).
- **Pixels.** Borders are one screen pixel at any UI scale (`T.Pixel`, `:632`), sizes round to whole pixels (`:664-677`), and an optional pixel-perfect scale picks a whole multiple for the screen (`:3536-3585`).

**Centralised or scattered?** Centralised, to an unusual degree. Confirmed by grep across `Core/` and `Modules/`:

| Kind of hard-coded style | Outside `Core/Theme.lua` | Notes |
| --- | --- | --- |
| Colour setter called with number literals | 0 | The quality scan blocks it. |
| Inline colour escape codes | 0 | Coloured text goes through `T.Paint` (`:437`). |
| `SetFont` calls | 3 | `Core/Banner.lua:81`, `Modules/GameAlerts.lua:196`, `Modules/Chat.lua:154`; all three pass a theme font path. |
| Game texture paths | 45 in 6 files | 34 are fallback buff icons in `Modules/RaidHealing.lua:79-112`; 3 stock backgrounds in `Core/PanelTexture.lua:25-27`; the rest are icon fallbacks and a faction-art probe. |
| Size setters with a number literal | 41 | Mostly small marks and icons. |
| Anchor offsets with a number literal | about 516 | Against 619 uses of `T.SPACE`. Layout is where magic numbers live. |

So colour and type are fully tokenised. Layout is half tokenised: element sizes and default positions are constants at the top of each module (`Modules/UnitFrames.lua:46-63` is typical), which is tidy but means there is no single place that says "the HUD's unit is 36 tall with a 6 gap".

**The gap between what the theme can do and what ships.** The defaults at `Core/Theme.lua:246-296` turn off nearly every richer treatment: `panelGradient = false` (`:268`), `ornaments = false` (`:270`), `sizedIcons = false` (`:277`), `panelTexture = "flat"` (`:281`), `hudShadow = false` (`:283`), plus texel snapping, slice rings, the heading font (`faction = "crest"`, `:292`). The comments say each waits on an in-game check. The result is that the look players actually get is the plainest one the system can produce.

### 4.1 Game reskin

**What the code touches.** `Modules/Windows*.lua` register about 110 entries naming roughly 150 stock frames in ten switchable groups (`Modules/Windows.lua:43`):

- *Windows:* character, merchant, mail, quest, gossip, trade, game menu, ready check, friends, dressing room, flight map, books and letters, group loot rolls, loot window (`:54-58`); and on demand the spellbook and talents, time manager, auction house, professions, inspect, guild bank, collections, achievements, flight map (`:68-74`).
- *Popups and timers:* the four static popups, breath and fatigue bars.
- *Social:* open mail, communities and guild windows and their dialogs, channels, friend dialogs, guild registrar, petition, tabard, role poll, raid tab, guild control, account toasts.
- *Town:* stable, trainer, side dressing room, stack split, coin pickup, the seven separate bags, master loot, loot history, macros and icon pickers, gear manager popup, stopwatch, ghost frame, basic dialogs.
- *System:* settings panel, addon list, chat config, Edit Mode manager and dialogs, quick keybind, Cooldown Manager settings, click binding, help, report, splash, colour picker, death recap, combat log buttons.
- *Map:* world map, quest map, battlefield map, the Forever group finder, Legacy window, queue status, calendar.
- *Menus:* the modern context menus and the old dropdown lists.
- *Tabs:* tab buttons, the character pane's inner panels, and scroll bars on every registered window.
- *PvP:* scoreboards, ready dialogs, objective widgets, timer tracker, rank frame.
- Elsewhere: tooltips (`Modules/Tooltips.lua:26-33`), bags and bank, chat, bubbles, the game's cast bar, pet, stance and extra buttons, Cooldown Manager, damage meter, loss of control, talking head, raid warnings, the personal resource display, the waypoint pin, and on Retail about 25 more windows.

**What is left looking stock (confirmed: no reference anywhere in `Core/` or `Modules/`).**

- The alert toast family (loot won, achievement, new recipe, and similar). `Modules/GameAlerts.lua:67` and `:163` only re-anchor the alert container; nothing dresses the toasts. These are the most frequently seen stock art left on screen.
- Level-up and event toasts, the boss emote and raid boss whisper frames.
- Tutorial and help tips (the pointer boxes new players see constantly in a fresh game).
- Barber shop and character customisation, item socketing, item upgrade, the bonus roll frame, player choice frames, vehicle seat indicator, zone ability button, the pet battle UI.
- **Fonts on anything unskinned.** Vanguard re-fonts its own frames by role, each skinned window element by element, and a short list of the game's font objects (`Core/Theme.lua:2824-2834`: tooltip, error line, zone text, combat text, tracker). It does not replace the game's standard font family. So every unskinned frame, every other addon, and system text keeps the stock typeface next to Fira Sans Condensed. This is the single biggest reason a partially reskinned UI reads as two UIs.
- **Content art kept on purpose.** Parchment stays on some Retail reward pages and journals, the talent tree's own art, model scenes, the world map canvas. These are reasonable, but they are where the flat language stops.

**How the skin is applied.** Shared machinery, not per-frame one-offs, with per-window detail on top:

- A registry: `GW.Add(group, names, skin)` and `GW.AddOnDemand(group, addon, names, skin)` (`Modules/Windows.lua:2401-2410`). A window is skinned when first watched and again on every show, so parts the game adds later are caught.
- One default treatment, `GW.Skin` (`:394-402`): fade the window's art by alpha, paint its inset, paint one opaque `T.Panel` with a shadow, theme its close button, title and push buttons, add corner ornaments if enabled.
- About 45 shared helpers (`:259-1738`): `GW.SkinButton`, `GW.SkinItem`, `GW.SkinDropdown`, `GW.SkinSearch`, `GW.SkinEditBox`, `GW.SkinMoney`, `GW.SkinProgress`, `GW.DressTabs`, `GW.SkinPager`, `GW.SkinMenu`, `GW.KeepFaded` (`:416-420`, re-fades art the game re-lights by alpha).
- The per-area files are mostly calls into those helpers: 170 helper calls in `WindowsSocial.lua`, 118 in `WindowsMap.lua`, 88 in `WindowsTown.lua`, 61 in `WindowsSystem.lua`. Direct theme calls are about half as many. That ratio is healthy.
- **Robustness for on-demand frames.** Good. On-demand windows key off the loading part's name through `ADDON_LOADED` (`:2383-2385`). `GW.Needs` (`:2418-2425`) lets a skin declare the parts and methods it relies on; if a patch removes one, the window keeps the stock look and `/vg errors` gets one note. State is kept in side tables, never on the game's frames, and scripts are hooked, never replaced, which the harness enforces.

**Consistency.** By construction every skinned window gets the same panel, edge, shadow, title role, button, tab, scroll bar and close button, so the treatment is uniform. The quest dialog preview shows the language at its best: a dark panel, brass primary button, quality-coloured reward cards, a faint crest watermark. The merchant preview shows the risk: with art faded and nothing drawn in its place, a skinned window is a near-empty dark rectangle with small text. Flat panels need internal structure (insets, dividers, section headers) to avoid reading as "art removed", and how much of that each window got is exactly what I cannot see from here.

**Does it read as one visual language?** Within skinned windows, yes. Across the whole screen, not yet, for three reasons: the stock font on everything unskinned, the stock toasts and tips, and the game's own item and spell icons and model scenes sitting in very flat frames with no transitional material (no bevel, no inner shadow by default).

**Verdict: Solid.** Coverage and mechanism are well above average. It is held back by the missing global font pass, the toast and tip family, and the absence of any recorded in-game look at 9,000 lines of visual code.

**Top fixes**

1. Replace the game's standard font family globally (with the existing exemptions for Korean and Chinese clients at `Core/Theme.lua:46`), so unskinned frames at least share the typeface.
2. Skin the alert toasts, level-up and event toasts and help tips; `GW.SkinToast` already exists for account toasts (`Modules/WindowsSocial.lua:1673`).
3. Capture one in-game screenshot per registered window on each client and commit them; turn the list into a coverage checklist.

**Elevations**

| # | Elevation | Builds on | Effort | Player-visible payoff |
| --- | --- | --- | --- | --- |
| R1 | **Signature window header.** A brass rule with a centre diamond under every skinned window's title, plus corner brackets, on by default. | `T.Ornament` and the rule art (`Core/Theme.lua:3193-3295`), `addCorners` (`Modules/Windows.lua:388-390`), default at `:270` | S for code, M for redrawn art (see 4.4) | Every window is recognisably Vanguard at a glance instead of a generic dark panel. |
| R2 | **Material by default.** Ship floating windows with the slate surface at low alpha, the panel gradient and the top bevel on. | `panelTexture` (`:281`), `panelGradient` (`:268`, `:1018`), `T.BEVEL` (`:792`) | S, plus an in-game A/B | Depth and tactility; windows stop reading as flat grey boxes. |
| R3 | **One item-slot language.** The same slot well, quality edge and inner glow on bags, bank, character sheet, merchant, loot, quest rewards, mail and trade. | `T.Slot` (`:1790`), `GW.SkinItem` (`Modules/Windows.lua:692`), bag slot code in `Modules/Bags.lua` | M | Items look the same everywhere; quality reads instantly. |
| R4 | **Inset structure pass.** Give each large window internal insets, section headers and dividers where art was faded. | `paintInset` in `GW.Skin`, `W.SectionHeader` (`Core/Chrome.lua`), `T.Divider` (`Core/Theme.lua:2280`) | M to L, window by window | Skinned windows gain hierarchy instead of emptiness. |
| R5 | **Own micro and menu icon set in every window.** Replace remaining stock glyphs (portrait rings, tab icons, tracking and mail buttons) with the theme's icon family. | `T.Icon` (`:73`), `GW.SkinGlyph` (`Modules/Windows.lua:512`) | M, art-led | Removes the last obviously stock shapes inside skinned frames. |
| R6 | **Reskin coverage report.** `/vg status` lists every registered window as dressed, missing a need, or never seen this session; CI publishes the registry as a doc. | `GW.REGISTERED`, `GW.NEEDS` (`Modules/Windows.lua:2418`) | S | Nothing regresses to stock unnoticed after a game patch. |
| R7 | **Toast family in the theme with motion.** Themed loot, achievement and level-up toasts that rise and fade with the existing fades. | `GW.SkinToast` (`Modules/WindowsSocial.lua:1673`), `T.FadeIn` (`Core/Theme.lua:3361`), `GA.ReanchorToasts` (`Modules/GameAlerts.lua:163`) | M | The most frequent celebratory moments carry the brand. |

### 4.2 Addon menu (options window and guided setup)

**What it is built from.** `Core/OptionsWindow.lua` lays out a 780 by 600 minimum window (`:14`) with a 176-unit navigation column, a header (crest at `:777`, faction mark at `:770`, search box, profile dropdown, close), per-page tabs, cards of rows from `Core/Controls.lua`, and a footer with the version and the reload notice. Row kinds are data (`:37-39`). Controls are theme primitives: capsule switch, segmented choice or dropdown, slider (`Core/Theme.lua:2012`, `:2466`), swatches, key capture, text input, push button.

**What the preview shows.** A clean, modern settings panel: 20 nav entries in four groups with small icons, a brass rail on the selected page, brass switches and selected segments, muted descriptions under captions, a "reload" tag beside rows that need one, and a live sample (a unit frame and an action button) at the top of General. The Modules page is a list of 54-unit rows with a description and a switch. The setup wizard is a centred 440-unit card with a painted banner strip, a step line ("Step 3 of 9"), swatches and three raid-style tiles, Back and a brass Next.

**Strengths**

- **Navigation and discoverability.** Search over every setting, a "changed" query, a dot on pages with non-default values, per-page reset, keyboard navigation. Few suites have all four.
- **Widget consistency.** Every control comes from the same primitives, so hover, focus ring (`:1511`), pressed (`:1523`), disabled (`:1578`) and selected states are uniform.
- **Information hierarchy inside a card.** Essential rows first, "More settings" fold for the rest (`Core/OptionsFold.lua`), descriptions in the muted tier.
- **Palette discipline.** Brass is reserved for "on", "selected" and the primary action. Nothing else competes with it.

**Weaknesses**

- **Flat type hierarchy.** The page title is 15, a card heading 13, a row caption 12, a description 10 (`Core/Theme.lua:2894-2899`). Five points separate the top and bottom of the scale, all in one condensed family. Pages read as uniform lists; nothing feels like a title.
- **Brand presence is small.** The header carries a crest of about 20 units and the word "Vanguard" in the body face. The serif heading face that matches the crest's V is only used with the faction look on "auto", which is not the default (`:292`, `:3166-3168`).
- **Density and dead space.** The General page in the preview uses about 60% of the window's height and leaves the rest empty, while Modules scrolls through 76 rows. Pages are not composed; they are lists poured into a column.
- **Icons.** Navigation icons are 32-pixel silhouettes from two visibly different families (simple geometric glyphs beside detailed creature and castle silhouettes) drawn at about 16 units. They are hard to tell apart at that size.
- **Previews are rare.** Only General (theme sample) and Raid frames (sample raid) show the effect of a setting. Everything else is "flip it and go look", often after a reload.
- **Empty and placeholder states.** Earlier repo notes list several panels with no empty-state text; I could not confirm the current state from code alone. Output-in-chat buttons (section 3.1) are the menu's weakest moments.
- **Setup.** Nine steps, a small card in the middle of a large screen, and four steps that are lists of switches. The painted banner is the only place the brand's artwork appears in the whole flow.

**Against the premium standard.** The best settings panels in this genre combine four things: strong brand framing, live previews beside the controls, direct manipulation (sliders, colour pickers, drag-to-reorder), and instant apply. Vanguard has the framework for all four (data-driven rows, a preview row kind, a slider control, `liveSetting` helpers) but uses them sparingly: 16 sliders, 1 colour control, 2 previews, 111 reload tags.

**Verdict: Solid.** Structurally one of the better options windows I would expect to see; visually it is a well-made generic dark settings panel.

**Top fixes**

1. Add a display tier to the type scale (18 to 20 for page titles, in the heading face) and use the small-caps `section` role consistently for card headings.
2. Redraw the navigation icons as one family at 64-pixel masters (see 4.4) and tint the selected one brass.
3. Give every HUD page a live preview strip, as General and Raid frames have.

**Elevations**

| # | Elevation | Builds on | Effort | Player-visible payoff |
| --- | --- | --- | --- | --- |
| M1 | **Hero header.** The painted crest at 40 to 48 units with the wordmark in the serif heading face and the brand gold, over a faint slate texture; the faction mark moves to the footer. | Header build at `Core/OptionsWindow.lua:770-777`, `T.BANNER_MARK` (`Core/Theme.lua:42`), `T.FONTS.alliance` (`:29`), `brandGold` token | S | The window announces itself as Vanguard the moment it opens. |
| M2 | **Preview dock.** A right-hand or top preview area per page: a unit frame pair, a raid block, a nameplate, an action bar, a tooltip, fed by the real build functions with sample units. | `Core/OptionsPreview.lua`, `Modules/RaidPreview.lua`, the scene builders in `scripts/lib/preview-scenes.mjs` as a model | L (one page at a time, M each) | Players see every change as they make it; this is the feature that makes settings feel premium. |
| M3 | **Theme studio page.** Variant cards with a thumbnail each, the accent row with a live OKLCH-derived ramp, a "use my class colour as accent" switch, a bar-texture picker with samples, corner and shadow toggles, all applied instantly. | `T.VARIANTS` (`:180`), `T.ACCENT_VARIANTS` (`:350`), `T.SetAccent` (`:3300`), `T.Refresh` (`:3141`), `Core/SharedMedia.lua` | M | Turns the existing token system into something players play with and share. |
| M4 | **Composed pages.** Two-column cards on wide pages, a summary card at the top of each page (what this area is, whether it is on, a "run its setup" button), and no page shorter than half the window. | Card layout in `Core/OptionsWindow.lua:29-39`, `O.Essential` fold | M | Pages feel designed, not listed. |
| M5 | **Empty and first-run states.** A crest watermark, one sentence and one button wherever a list is empty (no profiles beyond Default, no shopping lists, no click bindings, no watched phrases). | `T.Crest` watermark (`:3180`, `T.CREST.watermark` at `:36`), list row primitives in `Core/Chrome.lua` | S to M | Empty panels teach instead of looking broken. |
| M6 | **Setup as a stage.** A wider wizard with the live HUD rearranging behind it as layouts are picked, role-layout thumbnails, and four steps instead of nine with an "advanced" branch. | Layout definitions in `Core/Setup.lua` (five named layouts), `Core/SetupGuide.lua`, movers' live placement | M to L | The first five minutes sell the addon. |
| M7 | **Motion polish.** A gliding selection rail in the nav and tab bar, cards that fade in on page change, a brass sweep on the reload notice when it appears. | `T.Glide` (`:3503`), `T.FadeIn` (`:3361`), `T.SELECT` (`:1875`) | S | Small, cheap signals of quality. |
| M8 | **Density setting.** Comfortable and compact row heights and spacing from two token sets. | `T.ROW` (`:1841`), `T.SPACE` (`:1830`), `T.CONTROL` (`:1822`) | S to M | Suits both 1080p laptops and 4K desks. |

### 4.3 HUD

**What it is built from.** Every HUD element paints itself with `T.HudPanel` (`Core/Theme.lua:1407-1412`), which is `T.Panel` without the sheen, without a surface texture, and with a shadow only if the player turns one on. Bars use `T.StyleBar` (`:948`) with one of two bar textures (`Media/Textures/Bar.tga`, `BarSoft.tga`: plain vertical gradients) or any shared one. Text uses the outlined `barName`, `barSmall` and `world` roles over bars and in the world. Default positions are constants per module, arranged as a "centred" cluster: player and target mirrored either side of the character at 240 by 36 (`Modules/UnitFrames.lua:46-63`), party or raid above the player, cast bar over the action bar stack, three stacked bars at the bottom centre, chat bottom left, minimap top right with the info strip under it, menu strip bottom right.

**Colour semantics (confirmed in code, consistent across elements).**

- Class colour on player-unit health bars from the game's class colour table (`Modules/UnitFrames.lua:97-104`), softened into the panel colour on raid tiles with a luminance cap so names stay readable (`Modules/RaidFrames.lua:162-168`).
- Reaction from three tokens (`hostile`, `neutral`, `friendly`), tapped grey, on unit frames and plates alike (`Modules/Nameplates.lua:116-121` calls the unit frames' own colour function).
- Threat in three steps (`threat1` to `threat3`) on plates, the raid aggro strip and the threat readout.
- Dispel types from four tokens via one table (`Core/Auras.lua:29`), with a letter glyph per type for colour-blind players.
- Cast kinds: cast, channel, shielded.
- State: good, warn, bad, each with a glyph where it stands alone.

This is the HUD's strongest style property: one unit is the same colour everywhere, and the colour-blind work is real.

**What the previews show.**

- **Cohesion.** High. Everything is a dark rectangle with a one-pixel black edge and a coloured fill; the shield-cut corners on unit frames are the only shape variation. It is unmistakably one system.
- **Identity.** Thin. In the default scene the brass accent appears on the minimap's four corner diamonds, the selected chat tab's text, the target plate's edge and the cast bar fill. Nothing about the unit frames, action bars or raid tiles says "Slate & Brass" rather than "flat dark UI". The classic-look variant (bronze edges, a round map, a backing panel under the bars) has noticeably more character than the default.
- **Legibility.** Names and numbers are 11 to 12 units, bold and outlined, on saturated fills: fine. Unit frames at 36 units tall on a 1080p-equivalent canvas are on the small side for the primary health readouts, and the default raid tiles pack role mark, name, status, icons and a power bar into 100 by 48. Bright class fills (the cyan and yellow in the previews) dominate the screen; the softened raid style is calmer and looks more considered than the unit frames beside it.
- **Spacing.** The cluster is deliberately tight around the character, with large empty margins. On an ultrawide screen it will float in the middle; the code handles narrow screens explicitly (`UF.NARROW_W`, `Modules/UnitFrames.lua:28`) but I found no wide-screen treatment.
- **Action bars.** Slots are flat wells (`T.Slot`); empty slots vanish; hotkeys top right. With no gloss, bevel or backing by default the bar is just a row of icons, which is clean but anonymous.
- **Feedback.** Sparse by design. Proc glow is a static accent ring (`Modules/ActionBars.lua:406`, `Core/Theme.lua:900-915`). The in-combat mark is a red edge and a swords icon that appear with no transition (`Modules/UnitFrames.lua:487-493`). There are two animation-group call sites in the entire addon, both alpha fades. Nothing pulses, flashes or sweeps except the client's own cooldown swipes. A HUD should be calm, but this one gives the player almost no motion cues for "now".

**Sizing and scale behaviour.** Strong in code: positions are stored against the nearest screen edge, sizes are rounded to whole pixels at any UI scale, the grid rescales and re-rounds borders when the scale changes (`T.OnScale`, `:679-710`), raid tiles shrink in steps for 25 and 40 players, and the bottom stack lifts on tall screens. Weak in user control: element sizes are fixed or stepped (section 3.2), and per-element scale lives in the mover popover where few players will find it.

**Border, texture and font consistency.** Uniform, because there is only one of each. That is also the limitation: one edge weight, one bar material, one face.

**Verdict: Needs work.** Cohesive, legible and technically careful, but generic. It is the surface where the brand should be strongest and is weakest, and where feedback matters most and is most absent.

**Top fixes**

1. Turn HUD shadows on by default (after an in-game check) and give the two primary frames an accent treatment so the player frame and target frame are visually the heroes.
2. Add a small set of motion cues tied to state changes: combat start, proc, cooldown ready, low health.
3. Offer two or three complete HUD looks rather than one look with switches.

**Elevations**

| # | Elevation | Builds on | Effort | Player-visible payoff |
| --- | --- | --- | --- | --- |
| H1 | **HUD looks.** Three bundled presets, for example "Slate" (today's flat), "Brass" (thin brass inner line on primary frames, soft shadows, banded bar texture, backing under bars) and "Deck" (the Versus deck as the centrepiece), each one click. | Theme defaults (`Core/Theme.lua:246-296`), `T.HudPanel` options (`:1407`), `UF.DECK` (`Modules/UnitFrames.lua:770`), variant flags such as `barBacking` (`:195`) | M | A distinctive default and real choice without touching twenty switches. |
| H2 | **Crest geometry in the frames.** Carry the shield's shape into the HUD: the existing shield corner cuts on unit frames extended to the cast bar, raid tiles' top corners and the action bar backing; a small brass chevron or diamond as the classification and target marker everywhere. | `T.ShieldMask` (`:1302`), `T.CORNER_CUT` (`:730`), `Media/Textures/Diamond.tga`, target marker in `Modules/Nameplates.lua:174` | M | A recognisable silhouette: screenshots are identifiable as Vanguard. |
| H3 | **State motion kit.** Four small animations, all honouring Reduce motion and the 0.15 s combat cap: a brass edge pulse on the player frame when combat starts, a breathing proc ring, a brief bright flash when a cooldown sweep ends, a slow pulse on the health bar under a threshold where health is readable. | Fader and `T.COMBAT_FADE` (`:3317-3349`), `T.Glow` (`:900`), `UF.PaintCombat` (`Modules/UnitFrames.lua:487`), `AB.UpdateGlow` (`Modules/ActionBars.lua:406`), the client's cooldown-done script on cooldown frames | M | The HUD tells you "now" without you reading it. |
| H4 | **Bar materials.** Four to six status-bar textures of Vanguard's own (see 4.4) and a per-element picker; a subtle spark on health changes. | `T.BarTexture` (`:930`), `T.Spark` (`:939`), `Core/SharedMedia.lua` | S code, S art | Bars stop looking like filled rectangles. |
| H5 | **Class tint option.** "Accent follows my class" for the player's own elements (resource pips, cast bar, selected action button, target edge). | `T.SetAccent` (`:3300`), `T.ACCENT_VARIANTS` (`:350`) | S | Personal identity at near-zero cost. |
| H6 | **Numeric hierarchy.** A larger numeric role for the player and target health values and for cooldown counts, using the font's tabular figures; optional larger target frame. | `T.ROLES` (`:2894`), `UF.TargetHeight` (`Modules/UnitFrames.lua:817`) | S | The two numbers that matter become the most readable things on screen. |
| H7 | **Layout presets any time.** The five setup layouts selectable from the unlock bar and shareable as layout-only strings; add an ultrawide variant that spreads the cluster. | Layouts in `Core/Setup.lua`, `Core/UnlockBar.lua`, layout-only export in `Core/ProfileExport.lua` | S to M | Players can try a whole arrangement and back out. |
| H8 | **Action button finish.** An optional inner bevel and top highlight on slots, a pressed state with depth, an equipped ring and a keybind plate in the theme's control-tile style. | `T.Slot` and its states (`:1729-1810`), `T.BEVEL` (`:792`) | S to M | Bars gain presence without leaving the flat language. |
| H9 | **Portrait or class emblem slot.** An optional square at the outer end of player and target frames holding a 2D portrait or a class emblem from Vanguard's own icon set. | `T.Slot` (`:1790`), unit frame build at `Modules/UnitFrames.lua:386-396` | M, art-led | Faces and classes at a glance; fills the most-requested gap in the frames. |

### 4.4 The media itself

**Inventory (looked at, not just listed).**

- `Media/Textures` (52 files): white or greyscale primitives generated by script, meant to be tinted. Corner fills, lines and masks at 8 and 32 pixels; control tiles at 80; pill and slider lines at 64 by 32; knobs at 32; a glow and a shadow at 64; a spark; an 8-pixel stripe; a vignette at 128; discs and rings at 256; two bar textures at 256 by 32 (both simple vertical gradients); five panel surfaces at 256 square (grain, leather, slate, stone, vellum, all very faint); ornament corners at 32 and 64 and rules at 64 and 128; the painted crest as `Icon.tga` at 64.
- `Media/Icons` (128 files, 63 distinct): 60 at 32 pixels, 3 at 64, and 16 of them also baked at 16, 20, 24 and 32. Two sources: Vanguard's own geometric glyphs (check, close, arrows, search, dispel letters) and a CC BY 3.0 glyph set credited in `Media/Icons/CREDITS.txt` for navigation and menu icons.
- `Media/Art` (7 files): three AFK scenes and a banner at 1024 by 512, the painted crest at 256, two faction marks at 64.
- `Media/Fonts`: Fira Sans Condensed Medium and SemiBold (trimmed to Latin, Greek and Cyrillic with tabular digits), Cinzel SemiBold, Metamorphous Regular.
- `art/`: 38 SVG glyph sources, the variable font sources, three scene sources, four painted sources and a manifest recording the prompt, model and crop for each generated image.

**Quality and consistency.**

- **The primitives are good.** Clean, correctly sized for their use, generated reproducibly (`scripts/lib/media-sources.mjs`), verified by a media test. Nothing to fix.
- **The ornaments are the weakest textures.** The corner brackets and rules are small bevelled shapes with a hard dark outline. At 32 and 64 pixels they have a pixel-art quality that does not match either the hairline UI or the painted crest, and they will soften on a 4K screen. They are off by default, which is the right call for this version of them.
- **The icon set is two sets.** Simple line-weight glyphs sit beside dense silhouettes (a raven, a mask, a castle, a wolf). At 16 to 20 units the dense ones turn to blobs. Masters are 32 pixels, which is enough at 1080p and thin at 4K, where a 20-unit icon is 40 or more pixels.
- **The crest stands alone.** It is a glossy, studded, three-dimensional shield with a gold V. Everything else in the UI is flat, single-colour and hairline. At 20 units in a window header it will read as a blue-and-gold smudge. There is no simplified or single-colour version of it for small sizes. Note also that the crest as shipped is a shield bearing a V with no swords; the crossed swords in the UI are the Alliance faction mark from the glyph set (`Core/Theme.lua:33`), a different drawing in a different style. If the intended mark is a shield with crossed swords, the repo does not contain it yet.
- **The scenes are three styles.** A blue night camp, an orange canyon and a grey misty keep, plus a dusk banner. Each is attractive; together they do not share a palette or a hand, and none uses the slate-and-brass colours.
- **Bar textures are minimal.** Two near-identical gradients.
- **Fonts are a good choice with one gap.** A condensed sans is right for dense UI and the tabular digits are a real detail. The serif faces that give the brand its character are almost never seen.

**Gaps.** No class emblems. No role set beyond tank and healer. No raid-target, item-quality or currency art of its own (the game's are used, which is fine). No button or slot frame art. No window header art. No empty-state or onboarding illustrations. No simplified logo. No status-bar variety. No cursor or reticle art. No large-format icon masters.

**Prioritised art list (what would lift the look most, and where it goes).**

| Priority | Asset | Spec | Used in |
| --- | --- | --- | --- |
| 1 | **Crest system.** One master design in three treatments: full painted, flat two-tone emblem, single-colour tintable glyph. Decide once whether it carries swords. | 1024 master; emblem at 128 and 64; glyph at 64, 32 and 16 | TOC icon and addon list, minimap and compartment button, options and setup headers, window watermark, AFK card, store art, website |
| 2 | **Navigation and menu icon family.** One hand, one stroke weight, one corner style, designed to be read at 16 units. | About 45 icons, 64-pixel masters, baked to 16, 20, 24, 32 and 48; white on alpha | Options nav, micro menu strip, tracker and minimap buttons, state glyphs, role marks |
| 3 | **Ornament set v2 from the crest's geometry.** Corner bracket, title rule with centre diamond, divider flourish, drawn as smooth tintable shapes without outlines. | 128 and 64 masters with clean anti-aliasing; nine-slice friendly | Every Vanguard window and every skinned game window header (R1), setup, What's new |
| 4 | **Status-bar texture family.** Flat, soft, brushed slate, banded brass, fine stripe for shields and absorbs, a brighter leading-edge spark. | 512 by 64, greyscale, tileable horizontally | Unit frames, raid tiles, nameplates, cast bars, XP and reputation bars, meter (H4) |
| 5 | **Panel materials and trim.** Slate, vellum and leather redone with visible mid-frequency detail at low alpha, and a brass edge trim as a nine-slice for the "Brass" HUD look. | 512 square tileable; trim at 64 with 16 margins | Floating windows (R2), HUD look preset (H1), tooltips |
| 6 | **Class and role emblems.** A tintable emblem per class and a full role set. | 64-pixel masters, white on alpha | Portrait slot (H9), raid tile fallback, setup role layouts, click-casting presets, group board rows |
| 7 | **Setup and empty-state illustrations.** Five role-layout thumbnails and six to eight small spot illustrations. | 512 by 288 thumbnails; 256 square spots | Setup (M6), empty lists (M5), What's new |
| 8 | **Scenes v2 in one hand and one palette.** Keep the three subjects, repaint to a shared slate, dusk-blue and brass palette. | 2048 by 1024 masters | AFK screen, welcome banner, store and site |
| 9 | **Action slot finish.** Inner bevel overlay, pressed overlay, a proc ring as a short flipbook, a cooldown-ready flash. | 128 masters; flipbook 8 frames | Action bars, pet and stance buttons, cooldown rows (H3, H8) |
| 10 | **Minimap frames.** A square frame with corner ornaments and a round ring, both from the ornament set. | 512 masters | Minimap in both shapes |

Process notes for the art pass, since the repo already records generation prompts: keep everything that will be tinted as white on transparent with no baked colour; draw at twice the largest display size; keep the crest's simplified forms vector-clean rather than generated; and extend `art/painted/manifest.json` and `art/CREDITS.md` for every new file so provenance stays auditable.

### 4.5 What needs an in-game eye

- Whether one-pixel borders and the top sheen stay crisp at non-integer UI scales and at 4K, with and without pixel-perfect scale.
- Each default-off treatment (shadows, gradient, ornaments, panel textures, sized icons, texel snapping) side by side with the default.
- Every skinned game window, for leftover stock art, unreadable text on dark panels, and emptiness after art was faded.
- Panel alpha 0.94 over bright zones (snow, desert) and text contrast on class-coloured bars.
- Whether bright class fills on unit frames overpower the softened raid tiles beside them.
- The painted crest at 20 units in window headers.
- Motion: that fades feel right at 0.15 s and that nothing lingers in combat.
- Korean and Chinese clients, where the bundled face is replaced by the game's.

---
## 5. Cross-cutting assessment

### 5.1 Architecture

- **Shape.** One namespace table (`ns`) is shared by 64 Core files and 149 module files (226 TOC entries with the locales and libraries), loaded in a fixed order. Core provides events, the combat queue, settings, theme, movers and options; each feature is one or more files under `Modules/` that register a module table. Feature areas share a table across files by prefix (`Auction*`, `Raid*`, `Windows*`, `ClickCast*`). This is simple, readable and easy to test.
- **Lifecycle.** Covered in section 3.1. The registry enables modules at login and has no notion of dependency, teardown or late enable. That is the root of the reload-heavy experience, and of the handful of file-scope login handlers that sit outside it.
- **Coupling.** Modules reach each other by name through `ns.GetModule("X")` and call each other's functions directly (the info strip's `Money` formatter is called from at least Merchant, Tooltips and the quest dialog; unit frames call RaidStatus; raid add-ons insert into hook lists on `RF`). It works because everything is always loaded. It is the main obstacle to load-on-demand, and it makes "disable this module" semantics fuzzy (a disabled module's helper functions are still called).
- **Load-on-demand opportunities.** Everything loads at login today. Good candidates to split into companion addons that load when needed, in rough order of payoff: the auction suite (about 6,000 lines, needed only at the auction house or for tooltip prices, which could stay in a small core store), the options window and setup (about 7,500 lines, needed only when opened), diagnostics (`Probe`, `Perf`, `Inspect`, about 1,500 lines), the key setup wizard and data (about 2,500 lines), talent planner, mail tools, crafting. The TOC already loads files by game type; splitting by need is the next step. Expect a meaningful cut to the measured 49.3 MB and to login time, but measure before promising a number.
- **Saved variables.** Sensible split of account and character data, capped stores, and three migration layers (section 3.1). Per-computer state that must not travel in a profile (`VanguardDB.client`) is kept apart, which shows care.
- **Profiles.** Strong (section 3.1). The reload on switch is the one gap.
- **Two clients, one codebase.** Per-client defaults (`ns.CLIENT_DEFAULTS`, `Core/Modules.lua:28-32`), per-client module filters and TOC game-type conditions keep this tidy in code. The cost is in testing and attention, not structure.

### 5.2 Options and guided setup as a whole

- **Good:** one window, searchable, keyboard-navigable, data-driven, with changed-setting indicators and per-page reset; setup that changes nothing unless asked, backs up first and can be undone.
- **Not good enough for the one-stop claim:** 111 reload-tagged captions; fixed-step choices where players expect sliders; no per-element colour, font or texture choice; almost no live previews; features whose output is a chat list; a nine-step wizard followed by a key-setup offer; 20 pages and 86 commands with some surprising groupings.
- **The underlying tension.** The project's own rule is "don't add a setting nobody asked for". That is healthy, but the audience for an all-in-one suite self-selects for people who want to tune. The answer is not more switches; it is fewer, better controls (a size slider replaces three reload-only steps) and presets that bundle them.

### 5.3 Performance posture

**What is measured (from `docs/smoke-results.json`, step 1.5, 0.9.3 in game).** CPU 0.19 ms a frame at rest, 0.48 ms average, 137 frames over 5 ms in the session, a 3,259.5 ms peak; 11% of all addons' CPU; memory 49.3 MB; `PLAYER_LOGIN` 2,782.8 ms longest call.

**Posture.** Better than the numbers suggest in steady state, worse at login and in memory.

- **Good habits, consistently applied.** Per-unit event subscriptions for tiles, plates, unit frames and cast bars. One throttled ticker. Repaint-on-change guards (`UF.PaintCombat`, `RF.PaintEdge`, usable-state caching on action buttons). Pooled nameplate frames built a few per frame. Benchmarks with per-event instruction budgets in CI (`scripts/bench-budget.json`), which is rare and valuable.
- **Login.** Everything is parsed and built up front: more than 200 files, ten locale files of which nine are discarded, 40 raid buttons with their aura rows, a nameplate pool, about 150 window registrations. The two largest costs are already spread over frames on `main` (unreleased). The 3.26 s peak frame is that same login work.
- **Memory.** 49.3 MB is high. I cannot attribute it from here; the likely contributors are code size, the string table, aura container frames for 40 tiles built ahead, and price data. `/vg mem` exists to answer this and should drive the load-on-demand split.
- **Combat CPU hotspots found by reading (all confirmed in code, impact not measured):**
  1. `Modules/RaidHealing.lua:412-424`: four unit events registered for all units instead of per tile; `:243-250` allocates a full aura list per aura change per raid member when auras are readable.
  2. `Modules/RaidAuras.lua:120`: `UNIT_AURA` for all units on the fallback aura backend.
  3. `Modules/ActionBars.lua:885-888`: three events each repaint every button, uncoalesced.
  4. `Modules/UnitFrames.lua:403`, `:415`, `:178`: the down-state check runs three times per health event; `:86` allocates a colour table per call.
  5. `Modules/Tooltips.lua:134`: a table per unit-tooltip refresh.
  6. `Modules/RaidHealing.lua:338`: overlay width reset on every health event.
- **A caution on the benchmarks.** They count Lua VM instructions in the harness. They do not see the cost of client calls or of garbage, which is exactly where item 1 hurts. Treat them as a regression guard, not as a performance measurement.

- **Second-pass additions.** The same two patterns recur in the features read later. (a) Tickers with no owner frame never pause: the quest arrow (1 s and 0.1 s) and minimap spots (1 s and 0.2 s) run in combat for every player with a watched quest (`Modules/QuestArrow.lua:362-363`, `Modules/QuestMinimap.lua:168-169`, `Core/Ticker.lua:72-87`). (b) Handlers that allocate on frequent events: combo points on every power tick (`Modules/ComboPoints.lua:76-85`, `:96-105`), the cooldown gaps row on every cooldown event (`Modules/CooldownGaps.lua:30`, `:351`), a full bag walk per bag update in instance prep (`Modules/InstancePrep.lua:103-111`, `:428-430`), a full tracker rebuild per refresh (`Modules/QuestTrackerView.lua:236-239`, `:379-383`). None is large alone; together they are the steady background cost the 49 MB figure hints at. The fix is the same each time: bind the ticker to a frame, filter the event by its payload, reuse a scratch table.

### 5.4 Taint and combat-safety posture

This is the strongest cross-cutting area on paper.

- **Rules, enforced by tooling.** No field writes on the game's frames (state lives in `ns.FrameState` side tables, `Core/Events.lua:133-141`); no `SetScript` on the game's frames (hooks only); every secure call must sit behind a combat check (a blocking rule in the quality scan); protected methods on protected frames are blocked in the harness while "in combat" and fail the test; secret values raise in the harness if compared.
- **Design choices that avoid whole classes of bugs.** Secure group header for raid tiles; state drivers for bar paging and visibility; the pet, stance and extra buttons stay the game's own; item buttons in bags stay the game's own; the flyout is Vanguard's own secure frame so the game's protected flyout never touches addon buttons; posting and buying happen only inside a hardware click.
- **Where the risk remains.**
  - The harness's model of taint is a simplification (field writes and script replacement). Real taint also flows through values read from the game's tables and through shared globals. Vanguard writes a small number of globals the game reads (`DAMAGE_TEXT_FONT`, six chat tab alpha constants; listed in `.luacheckrc`), and re-anchors and re-parents many of the game's frames. Each is a known technique, and each is the kind of thing that produces "action blocked" reports only in particular sequences in the real client.
  - Hooks on the game's functions run inside the game's call stacks. There are 99 script handlers not yet wrapped by `ns.Guard` (quality baseline); those report to the game's error popup rather than `/vg errors`, which is a diagnostics gap rather than a safety one.
  - The fallback for a client that cannot compile secure snippets doubles the number of secure paths to keep correct.
- **Evidence from the field.** The one recorded failure was a forbidden-object access, not a combat-lockdown or taint block. `main` now checks `IsForbidden` before touching plate aura icons (`Core/Auras.lua:273`, `:292`); I did not verify that in game.

### 5.5 Visual identity and polish

See section 4. Summary: the system is excellent, the shipped default is its plainest setting, the brand is strong in the options and quest dialog and nearly absent on the HUD, and the media needs one coherent art pass led by the crest.

### 5.6 Localization

Covered in section 3.1. To add: `## Notes` in the TOC is translated for ten locales, which is a nice touch on the addon list; the pipeline (extract, CSV out, CSV in, never hand-edit) is the right one; the text-fit test with strings inflated by a third is an unusually good safeguard. The weaknesses are quality (machine drafts), completeness (184 of 2,912 keys missing, 33 strings unwrapped), login cost (all ten files compiled) and English-only matching logic in two features.

### 5.7 Quality infrastructure

- **Tests.** 161 test files, about 3,350 cases, 61,800 lines, running the real addon Lua in an embedded Lua VM against a stub client, with rules for taint, lockdown and secrets, a line-coverage floor of 100%, shuffled weekly runs, and an error guard that fails any test with an unexpected caught error. This is exceptional.
- **What I ran.** On a scratch copy: `npm ci` (clean), `npm run quality` (pass; report-only counts: 2 unbounded OnUpdate, 99 unguarded script handlers, 33 unwrapped text, 0 secret truth tests, 12 pcall-result patterns, 468 long lines, all at baseline), the quick gate (`vitest run --project quick`: 29 files, 469 tests, all passed in 55 s), `scripts/i18n.mjs status`, and 17 preview scenes. I started the full suite but stopped it after about 28 minutes without a completed file on a two-core sandbox that was also rendering previews, so **I have no full-suite result**. `luacheck` and a Lua 5.1 compiler were not installed here, so I did not lint.
- **The structural limit.** 100% line coverage against a model is not verification against the game. The harness encodes the author's understanding of the client. The widget API list (`scripts/lib/wow-widget-api.lua`) and the Forever-only API list are curated by hand from source reading. Where the understanding is wrong, tests pass and the game fails, as on step 33.390.
- **The side effects of the code rules.** "Every function at most 10 lines with a comment above it" produces very readable small functions and very long files of them (2,493 lines for one module), with logic spread across many tiny helpers. It also spends a lot of the codebase on comments that restate intent. On balance it works here, but it should not be mistaken for a quality measure.
- **CI.** A fast gate on every pull request (quality scan, TOC check, lint, syntax, quick tests, zip check), the full suite weekly, on a label and before a release, a markdown lint, and a tag-triggered release that builds the zip, creates the release and uploads to both listing sites with the standard packager. Draft pull requests are skipped to save minutes. Sensible for a private repository on a free tier; the trade-off is that area tests do not run on most pull requests.
- **Release hygiene.** `.pkgmeta` and the local packager are tested against each other. The changelog is player-facing and well written. Four releases in five days after launch shows responsiveness and also how much was found only once real players had it.
- **Docs.** One feature page per area as the behaviour spec, a theme spec, an API page, patterns, a 5,000-line smoke checklist, design notes. Good for contributors and for AI-assisted work. For players there is a short getting-started page and the command list; there are no screenshots in the repo's player docs.
- **In-game verification record.** 4 entries. This is the number to move.

### 5.8 Compatibility and behaviour when a module is off

- **With other addons.** Better than most suites: a coexistence manager that asks, deference to a dedicated quest addon's tracker, yielding `/way`, a button-skin bridge, shared media through LibSharedMedia-3.0, a drawer for other addons' minimap buttons, a strip for data-broker feeds, docks for boss-mod bars, a skin API, a price API with a familiar shape. Global footprint is small: two saved variables, one API table, one slash command, a few named frames with a `Vanguard_` prefix.
- **Risks.** Replacing the gossip and quest windows and parking the game's unit, raid and action frames will break addons that hook those frames. The coexistence list is hand-kept. The handful of game globals Vanguard writes (the damage font path and six chat tab alpha constants) can clash with addons that set the same ones.
- **Module off.** The profile flag is honoured at the next login: the module builds nothing. In the current session nothing changes unless the module has a `Disable` (four do). Dependent modules whose parent is off stay registered and cost a few dispatches. Game frames that a module hid come back only after the reload. This is coherent but should be said plainly in the UI: the Modules page tags every row "Reload to apply", which it does.

### 5.9 Accessibility

- **Strong for an addon.** Global text scale 0.7 to 1.3; no role under 10 units except a badge; a high-contrast variant; state colours chosen off the red-green axis with a glyph wherever colour stands alone; "safer colours" for reactions and dispel types that follow the game's colour-blind setting; reduce motion; interface sounds switch; contrast targets documented per token (4.5:1 for disabled text); a luminance cap on softened raid bars so names keep 3:1.
- **Keyboard.** The options window, quest dialog and auction tables are keyboard-navigable. Keybind mode and the drawn key map are accessibility features in their own right.
- **Gaps.** No gamepad consideration beyond stepping aside when one is active. The drawn keyboard is QWERTY only. Class colours on bars are the game's and not adjusted for colour-blind players (names and role marks carry the information instead). No option for larger hit targets on raid tiles beyond size. Screen-reader support is not something the client offers addons, so that is out of reach.

### 5.10 Scope and hygiene

- **Scope.** The roadmap in `docs/design/ONE-STOP-FEATURES.md` argued for breadth outside combat rather than parity inside it. The code followed that plan faithfully and then also added Retail. The plan was sound; the open question is whether a solo developer can keep 76 modules on two clients correct while also deepening the HUD. Section 7 assumes the answer is "freeze breadth, deepen the core".
- **Third-party names in the repository.** The owner's stated policy is to keep references to other addons out of the project. The repo does not currently meet that: by pattern search, 24 shipped Lua files under `Core/` and `Modules/` name other addons (8 of them in player-facing strings, which then propagate to all 10 locale files), 2 TOC lines do, about 31 files under `docs/` and `.planning/` do, and about 30 test and fixture files do. Much of this is functional (detecting a loaded addon needs its folder name; telling a player which addon was detected needs its name), so the realistic rule is "names only where needed for interoperability, never in commentary", and the header comments, design notes and research files are where the cleanup is.
- **Second-pass detail on names.** Where they sit in shipped code, by role: one detection table of about forty outside addons that the coexistence feature cannot work without (`Modules/Coexist.lua:25-49`); two boss-timer products named in code and in translated player strings, one of whose settings the addon writes (`Modules/BossDocks.lua:23`, `:27`, `:53-65`, `:81`); a quest addon in a settings key and two loaded checks (`Modules/QuestTracker.lua:21`, `:40-41`; `Modules/QuestGuideMap.lua:59`); a waypoint addon in a loaded check and a map addon named and credited on an options page for every player (`Modules/Waypoints.lua:282`, `:294-295`, `:413-419`); and the button-skin bridge, whose file name is the product. Only the first is unavoidable.

---

## 6. Bugs and risks found

Ordered by priority. "How verified" says what I actually did.

### Critical

None confirmed by reading. That is a statement about what I read, not about the addon: the risk that matters most (behaviour in the real client) is the one I cannot test.

### High

| # | Where | What goes wrong | How verified |
| --- | --- | --- | --- |
| H1 | Released 0.9.3; `Core/Auras.lua` icon placement (guards now at `:273`, `:292`) | Nameplate aura icons on plates the game keeps for itself raise "attempt to access forbidden object" errors in dungeons. Players on the listed version still have this. | Owner's in-game note, `docs/smoke-results.json` step 33.390; README known issues. Guards read on `main`; fix not verified in game. |
| H2 | Released 0.9.3; `Modules/RaidAuras.lua`, `Modules/Nameplates.lua` build at login | Login freezes for about 3 seconds (2,782.8 ms in one handler). | Measured in game by the owner, step 1.5. `main` spreads both builds (`Modules/RaidAuras.lua:279`, `Modules/Nameplates.lua:383`); unreleased. |
| H3 | `Modules/KeybindsData.lua` (header), `Modules/KeybindsApply.lua`, `Modules/KeybindsLearn.lua` | Key setup writes action slots and the account's bindings from spell IDs and stance-page mappings the file itself marks unverified on the Forever client; 16 spells are known unknowns. A wrong mapping binds keys to the wrong bar page with no error. The feature is offered at login after setup. Second pass: the engine is transactional with a record and undo (`Modules/KeybindsApply.lua:629-703`), which limits the damage to a run the player can reverse; the offer is pre-ticked in first-run setup (`Core/SetupGuide.lua:83`, `:171-174`). | Read the data file header and the apply engine's contract; counted markers. Not run. Second pass: engine, learner and wizard read in full; data still not run. |
| H4 | Whole project; `docs/smoke-results.json` | 4 recorded in-game results against 827 checklist expectations. Every visual and secure-path claim in 82,000 lines rests on a hand-written model of the client. | Counted both files. |

### Medium

| # | Where | What goes wrong | How verified |
| --- | --- | --- | --- |
| M1 | `Modules/RaidHealing.lua:412-424`, `:429-436`, `:243-250` | `UNIT_AURA`, `UNIT_HEAL_PREDICTION`, `UNIT_ABSORB_AMOUNT_CHANGED` and `UNIT_THREAT_SITUATION_UPDATE` are registered for every unit; each raid member's aura change builds a full aura list to test one buff. CPU and garbage scale with raid size and nameplate count wherever auras are readable. Also registered when raid frames are off. | Read both the handler table and `Enable`; confirmed base tiles use per-unit subscriptions (`Modules/RaidFrames.lua:373-377`) so this is the exception. Impact not measured. |
| M2 | `Core/SettingsGuard.lua:331-335` with `:58-63` | If the client gives no player name at logout, the character stamp advances and the account note does not; next login reports a settings loss that did not happen, and the notice persists until answered (`:330`). | Traced both functions twice. Whether the client ever returns no name at logout: unknown. |
| M3 | `Modules/QuestDialog.lua:23-27`, `:327-334`, `:349-358` | The game's quest and gossip windows lose their events for the session; the switch needs a reload, so there is no fallback if the custom panel misbehaves, and addons that hook those windows stop working. On Retail the custom gossip manager is silenced too (suspected: special gossip frames show as plain lists). | Read the takeover list and `Enable`. Retail effect not observable here. |
| M4 | `Modules/QuietDeclines.lua:85-90`, `:106-111` | "Decline group invites from strangers" recognises friends, account friends and guild only. In a game where groups form by whispering strangers (and which ships a group board for exactly that), the invite a player just asked for is auto-declined. Off by default. | Read `knownPlayer` and the handler. |
| M5 | `Modules/QuestAuto.lua:63` | "Pick the reward that sells for most" chooses by vendor value alone and has no link to gear upgrades, so with both features on it can vendor-pick over an item the other feature marks as an upgrade. Off by default. | Grepped `QuestAuto.lua` for any reference to the upgrades module: none. Second pass: confirmed in the full read (`:50-64`). |
| M6 | `Vanguard.toc` locale lines; `Locales/*.lua:4-6` | All ten locale files (about 2.5 MB of source) are read and compiled at every login; nine return immediately. Adds login time and transient memory. | Read the TOC and a locale file's guard. Cost not measured. |
| M7 | `Modules/ChatFilter.lua:32-42`, `Modules/GroupBoard.lua:40-41` | Spam categories and LFG parsing match English words only, on an addon that ships ten locales and translates the switches that control them. Second pass: the chat filter is pre-ticked in first-run setup (`Core/SetupGuide.lua:65-66`, `:171-174`), so non-English players who click through get an English-word filter switched on. | Read both tables. |
| M8 | `Modules/Upgrades.lua`, `Modules/UpgradeWeights.lua:73-94` | Upgrade arrows on tooltips, bags and quest rewards come from weights the file calls "a starting point ... not simulated". Wrong advice presented with an arrow. | Read the header; did not evaluate the numbers. Second pass: all four files read; Retail uses five generic sets for every spec (`Modules/UpgradeWeights.lua:88-94`). See also M11. |
| M9 | `Core/Modules.lua:102-106`, `:118-127`; file-scope handlers at `Modules/WindowsTown.lua:477`, `WindowsMenus.lua:147`, `WindowsTabs.lua:1242`, `KeybindsApply.lua:1033`, `KeybindsWizard.lua:702` | No teardown and no dependency model: 4 of 76 modules can switch off live; work registered outside the lifecycle depends on each file guarding itself. | Counted `Disable` functions, `ns.On` (278) and `ns.Off` (3); read each file-scope handler's guard (all currently correct). |
| M10 | `Modules/BagSections.lua` (header), `Modules/Bags.lua:57-116` | Sectioned layout can only be applied out of combat because the item buttons are protected; suspected visual scramble if the game re-lays the bag during a fight. The module also changes a game setting and must restore it. | Read the header contract and the setting code. Needs an in-game look. |
| M11 | `Modules/Upgrades.lua:63`, `:225-229`, `:265-269`, `:366-369`, `:376-380`, `:397-398` | Off-hand weapons, shields and held items are compared only with slot 17. With a two-hander equipped that slot is empty, so the tooltip says "Upgrade: fills an empty slot" and every usable off-hand item in bags and quest rewards gets an upgrade arrow. Tooltip, bag and quest marks are on by default (`:30`). | Second pass. Traced `wornScore`, `weakest`, `UP.Compare`, `isUpgrade` and `UP.AddLine`; re-read after writing. Not run. |
| M12 | `Modules/QuestLog.lua:314-318`; `Core/GameMenu.lua:14-17`; rule at `Core/Combat.lua:51-53` | Two calls into the game's panel manager with no combat check: closing the world map when the game's quest-log toggle runs, and closing the game menu when the Vanguard button is clicked. The repo's own comment says the panel manager refuses addon code in combat, and every other such call is gated (`Modules/QuestLog.lua:276`, `Modules/QuestTracker.lua:443`). Clicking the quest micro button or the game-menu button during a fight runs a call the client is expected to block. | Second pass. Searched every panel-manager call in `Core` and `Modules`: these are the only two, and neither is gated. In-game effect not verified. |
| M13 | `Modules/QuestArrow.lua:362-363`, `:227-255`, `:40-56`; `Modules/QuestMinimap.lua:168-169`, `:71-77`, `:133-141`; `Core/Ticker.lua:72-87` | Four tickers started with no owner frame, so they never pause: default on, in combat, in raids. Per second: a full quest record rebuilt for every watched quest, the quest list for the map fetched, about fifteen position reads (each a new object), strings formatted and set ten times. | Second pass. Read both files and the ticker contract. Cost not measured. |
| M14 | `Core/SetupGuide.lua:63-84`, `:171-174`, `:251-257` | On a first run every recommended non-game row starts ticked and is applied on Next: faster auto-loot, chat filter, chat history, spell-rank notices, mail tools, the Cooldown Manager and its glow, aura timers, bars 4 and 5, and the key-setup offer. Features documented as off by default are on for most new players, including one that only understands English (M7) and one on unverified data (H3). | Second pass. Read `startPick`, `G.Leave` and the row table. |
| M15 | `Modules/CooldownGaps.lua:30`, `:351`, `:70-74`, `:87-90`, `:145-155`, `:168-176`, `:231-238` | With the gaps row on, every cooldown, bag-cooldown and pet-bar event re-parses the settings strings, allocates a table and a closure per entry and re-anchors every cell, unthrottled. Those events fire many times a second in a fight. Off by default. | Second pass. Read the event list and `CG.Refresh`. Cost not measured. |
| M16 | `Modules/QuestTracker.lua:88-94`, `:102-113` | File-scope handlers expand every collapsed zone header in the game's quest log at each loading screen and whenever the map's quest panel closes. They are not registered in `Enable`, so they run with the tracker and the quest log switched off, and there is no option. A zone folded by hand reopens. | Second pass. Read the handlers and the comment explaining the intent. |

### Low

| # | Where | What goes wrong | How verified |
| --- | --- | --- | --- |
| L1 | `Core/DB.lua:189-191` | `ns.Migrate` keeps one function per key; a second registration silently replaces the first. Latent. | Read; counted 7 keys each registered once. |
| L2 | `Modules/Merchant.lua:95-128`, `:140-149` | HUD fonts (error line, zone text, combat text, damage font) are themed by the Merchant module; turning Merchant off drops them. | Read `MC.Enable`. |
| L3 | `Modules/UnitFrames.lua:403`, `:415`, `:178`, `:86` | Down-state computed three times per health event; a colour table allocated per reaction lookup. | Read. |
| L4 | `Modules/Tooltips.lua:134` | A table allocated on every unit tooltip refresh. | Read. |
| L5 | `Modules/ActionBars.lua:885-888` | Usable, cooldown and state events each repaint all buttons without coalescing. Matches stock behaviour; only matters with many bars. | Read. |
| L6 | `Modules/RaidHealing.lua:338` | Overlay width set on every health event. | Read. |
| L7 | `Modules/Nameplates.lua:985` and 32 other sites | English strings outside the string table; 184 keys untranslated per locale. | Quality baseline; `i18n.mjs status`. |
| L8 | `Modules/RaidFrames.lua:611-614` and 95 other sites | Script handlers not under `ns.Guard`: an error goes to the game's popup but not `/vg errors`. | Quality scan count; read this site. |
| L9 | `Modules/AuctionPrices.lua:24-30` | The 6,000-item cap per house evicts least-listed items after a full scan, which may drop rare items. | Read the constants and comment; real scan size unknown. |
| L10 | `Core/Graphics.lua:332-363` | Reworded after the full read: the advisor writes graphics settings only on an explicit `/vg graphics apply`, records every original and restores them on `undo`. The remaining risk is scope (one more thing to keep right on two clients) and a crude five-second heuristic (`:102-107`). | Read in full. |
| L11 | Repo-wide | Other addons are named in 24 shipped Lua files, the TOC, locales, docs and tests, against the owner's stated policy. | Pattern search; counts in section 5.10. Second pass: sites by role listed in section 5.10. |
| L12 | `Media/Textures/Icon.tga`, `Media/Art/banner-crest.tga`, `Core/Theme.lua:33` | The shipped crest is a shield with a V and no swords; the crossed swords in the UI are a separate faction mark in a different style. If the brand mark is meant to include swords, the art does not match. | Looked at the image files. |
| L13 | `Modules/ComboPoints.lua:22-25`, `:76-85`, `:96-105`, `:114`; `Modules/RetailClassBars.lua:311-321`, `:350`, `:368` | Resource displays update on every frequent power event with no power-type filter; the combo handler allocates a table and refits pips on each energy tick. | Second pass. Read. |
| L14 | `Modules/PlayerAuras.lua:61-66`, `:182-188`, `:241-243`, `:257`; `Core/AuraEngine.lua:55` | Suspected: the player aura container is re-anchored from the weapon-enchant update with no combat check. If the container is protected, an enchant gained or lost mid-fight triggers a blocked move. | Second pass. Read; needs the game. |
| L15 | `Modules/InfoStrip.lua:964`, `:970-972` | The game's durability figure is hidden unconditionally, also when the strip's own durability block is off. | Second pass. Read. |
| L16 | `Modules/CooldownKeys.lua:97-99`, `:134-140`; `Modules/OfficerRoster.lua:190-195`; `Modules/KeybindsApply.lua:1005-1014`; `Modules/KeybindsLearn.lua:59-66`; `Modules/ClickCastOptions.lua:1161-1164` | More work registered regardless of the feature's own switch: key text on cooldown icons, officer-roster unit events, a key backup written at every logout, the key learner's state table, click-cast page handlers. Same family as M9. | Second pass. Read each. |
| L17 | `Modules/InstancePrep.lua:103-111`, `:428-430`, `:456`; `Modules/Inventory.lua:115` | A full bag walk with an item table per slot after every bag update (low-supplies warning, default on); the bank recounted on every bag event while it is open. | Second pass. Read. |
| L18 | `Modules/MailTools.lua:351-360`; `:253-256`, `:263-268` | Preset attach counts attempts, not successes, so the "items attached" line can overstate. Suspected: the running flag is cleared only on the run's normal exit. | Second pass. Read. |
| L19 | `Modules/Situations.lua:314-324`, `:359-368`; `Modules/SituationsBanner.lua:30-33`, `:82-87` | Suspected UX hazard: an edit to an overridden setting or frame while an override is applied, outside recording, is silently undone at the next situation change. | Second pass. Read; searched for any hook that would save such an edit: none. |
| L20 | `Modules/TalentPlanner.lua:276-289` | Planned points are spent top row first, then left to right; the player cannot set the order, so auto-spend across two trees does not follow a levelling order. | Second pass. Read. |
| L21 | `Modules/KeysView.lua:17-32` | The drawn keyboard is one fixed US layout without function keys or number pad; players on other layouts (two shipped locales) see letters in the wrong places. | Second pass. Read. |
| L22 | `Modules/Errands.lua:95`, `:104`, `:157-172` | "Train all" marks skills done by name and does not re-read the trainer list inside its loop, so ranks that unlock on purchase need another click. | Second pass. Read. |
| L23 | `Modules/ChatFilter.lua:25`, `:111-122`; `Modules/ChatWindows.lua:379-382`; `Modules/ChatExtras.lua:311-316`, `:340` | The Filtered tab is found by an untranslated name, so renaming it makes the addon open another; floating chat windows get movers only if shown at login; short channel names walk the window's buffer once per rewritten line. | Second pass. Read. |
| L24 | `Modules/Waypoints.lua:77-97`; `:294-295`, `:413-419` | A zone name in `/way` is looked up only under the current continent. The Map options page always shows a card crediting an optional third-party addon, installed or not. | Second pass. Read. |
| L25 | `Core/SetupGuide.lua:45-84`, `:106-113`, `:127-135` | Guided-setup rows bind to options rows by matching English caption text; a reworded caption silently removes the row from setup. | Second pass. Read. |
| L26 | `Modules/CharacterExtras.lua:39` (compare `Modules/Upgrades.lua:187-190`) | Suspected, Retail: slot item levels use the base level from the item-info call, not the detailed level, so upgraded or scaled items may show the wrong number. | Second pass. Read; needs the game. |
| L27 | `Modules/Inventory.lua:25`, `:108`; `Modules/VendorMemory.lua:20-23`; `Modules/QuestHistory.lua:66-72` | Suspected: container -1 is counted as bags. Vendor memory is not keyed by faction. Quest history keeps one character per quest, so "Done on" names only the latest. | Second pass. Read. |
| L28 | `Modules/AfkScreen.lua:39-48` | Two long lore quotations ship as translatable strings. Not a bug; an owner decision given the care taken over third-party material elsewhere. | Second pass. Read. |
| L29 | `Modules/QuestGuideMap.lua:94-125`, `:156-163`; `Core/GameMenu.lua:21-37`; `Modules/TalentPlanner.lua:437-446`, `:642-646` | Suspected taint vectors the harness cannot model: addon buttons parented to the world map canvas, a button added to the game menu's layout, and marks plus purchase calls on the talents window. | Second pass. Read; each needs a specific in-game check (section 8). |

---

## 7. How to elevate it

### 7.1 What is missing for a credible one-stop-shop claim

A player who installs one addon and removes the rest will notice these first:

1. **Unit frames that can be tuned.** Size, text, portraits, heal prediction, status marks.
2. **Live configuration.** Change a setting and see it, without `/reload`.
3. **Nameplate and aura control.** Sizes, fonts, friendly plates, a say in which auras show where the client allows.
4. **Tooltips with player information.**
5. **Action button completeness.** Macro names, attack flash, spacing and hotkey controls.
6. **A bag that shows item level and other characters' bags.**
7. **Confidence.** A listing that can say "tested in game on this build" with screenshots.

None of these is exotic. All are the core of the genre, and each matters more to retention than the fortieth convenience feature.

### 7.2 The strongest differentiators (protect and promote these)

1. **Healer kit:** raid tiles, heal prediction, click casting with class starter layouts, preview mode.
2. **Economy kit:** the auction suite with ledger, deals, crafting costs and restock tied to instance prep.
3. **Key setup and the drawn key map** (once verified).
4. **Situations and relationship movers:** layouts that follow context and keep their relationships.
5. **Group board** for a game without a dungeon finder.
6. **Trust features:** settings guard, safe profile strings, error budget, coexistence manager, feedback loop.
7. **The design system**, once the default look shows it off.

### 7.3 Roadmap

Each item is written to be handed to a separate session as a self-contained piece of work. Effort: **S** about half a day or less, **M** one to three days, **L** a week or more. Items tagged **[Style]** come from section 4.

#### Quick wins (hours)

| # | Work item | Why it matters to players | Effort |
| --- | --- | --- | --- |
| Q1 | **Cut a release from `main`.** Ship the login spread and the forbidden-icon guard; update the README's known issues. | Removes a 3-second login freeze and a recurring error for everyone on the listed version. | S |
| Q2 | **Per-unit events for raid add-ons.** Add a per-tile event hook list to `RF` and move the four global events in `Modules/RaidHealing.lua:412-424` and the one in `Modules/RaidAuras.lua:120` onto each tile's `ns.OnUnit` subscription. For the buff marker, try the by-name aura call before the full list. Add a bench step for it. | Smoother raids and less garbage with many nameplates up. | S |
| Q3 | **Fix the settings-guard stamp asymmetry.** In `G.Save` (`Core/SettingsGuard.lua:329-336`) cache the character key at login and reuse it, or skip the character stamp when the key is nil. Add a harness case with no name at logout. | No false "your settings didn't load" notices. | S |
| Q4 | **Load only the active locale.** Use the TOC's per-locale load condition on each `Locales/*.lua` line (verify the directive on the Forever client; keep the in-file guard as a fallback). | Faster login and less memory on every client. | S |
| Q5 | **Whitelist recent whisper partners for stranger-invite declines.** Track names you whispered in the last ten minutes and treat them as known in `knownPlayer` (`Modules/QuietDeclines.lua:85-90`). | The decline switch and the group board stop fighting. | S |
| Q6 | **Never auto-pick over an upgrade.** In `QA.BestChoice` (`Modules/QuestAuto.lua`), skip the automatic pick when any choice is flagged by the upgrades module. | Protects players from losing a gear reward to automation. | S |
| Q7 | **Micro-allocations.** Compute the down state once in `UF.UpdateHealth`; cache reaction colours; pass three numbers to `T.SetBorder` from tooltips; drop the per-event `SetWidth` in `Modules/RaidHealing.lua:338`. | Small steady CPU and garbage savings on the hottest paths. | S |
| Q8 | **Make `ns.Migrate` safe.** Append to a list per key (or raise on a duplicate) and add a test that runs every migration twice. | Prevents a silent settings-migration loss in a future release. | S |
| Q9 | **Move HUD font theming out of Merchant.** Put `ThemeFonts`, `ThemeCombatText` and `ThemeDamageFont` under the theme or a small "HUD text" module with its own switch. | Turning off merchant helpers no longer changes fonts. | S |
| Q10 | **Wrap the last 33 strings and translate the 184 missing keys.** | No English fragments on localized clients. | S |
| Q11 | **[Style] Hero header in the options window (M1).** Larger painted crest, wordmark in the serif heading face and brand gold, faction mark moved to the footer (`Core/OptionsWindow.lua:770-777`). | The settings window looks like a product, not a panel. | S |
| Q12 | **[Style] Type scale display tier.** Add an 18 to 20 unit `display` role to `T.ROLES` (`Core/Theme.lua:2894`) for page and window titles and use `section` for card headings throughout. | Clear hierarchy on every Vanguard window. | S |
| Q13 | **[Style] Class-colour accent option (H5).** A switch that sets the accent from the player's class through `T.SetAccent` (`Core/Theme.lua:3300`). | Instant personalisation; good screenshots. | S |
| Q14 | **[Style] Reskin coverage report (R6).** List registered windows and their state in `/vg status`; generate a doc from `GW.REGISTERED`. | Stock-looking windows after a patch are caught the same day. | S |
| Q15 | **Fix the off-hand upgrade verdict (M11).** In `wornScore` (`Modules/Upgrades.lua:265-269`), when the candidate goes in the off hand and the main hand holds a two-hander, compare against the two-hander (or return no verdict). Add harness cases for shield, held item and off-hand weapon against a two-hander. | Stops wrong green arrows on every shield for half the classes. | S |
| Q16 | **Gate the two panel-manager calls (M12).** In `QL.OnGameToggle` (`Modules/QuestLog.lua:314-318`) skip the map hide in combat; in `ns.OpenFromGameMenu` (`Core/GameMenu.lua:14-17`) use a plain hide or open options over the menu in combat. Add the panel-manager functions to the quality scanner's guarded-call list. | No blocked-action message from two everyday clicks during a fight. | S |
| Q17 | **Own the quest tickers (M13).** Pass the arrow frame and the minimap layer as the owner in the four `ns.Every` calls, stop them in combat and where the map is restricted, and reuse scratch tables in `QA.Pick`, `QA.Draw` and `scale()`. Add a bench step. | Removes a permanent background cost for every levelling player. | S |
| Q18 | **Untick the unproven rows in first-run setup (M14).** Set the chat filter and the key-setup offer to not recommended until N2 and N9 land; keep the rest. | New players stop getting an English-only filter and an unverified key offer by clicking Next. | S |
| Q19 | **Filter and coalesce three hot handlers (M15, L13, L17).** Return early in the combo and resource handlers unless the event's power type is the one shown; coalesce `CG.Refresh` to one run per frame and rebuild its entry list only on settings or spellbook change; share one bag snapshot between inventory, instance prep and restock. | Less garbage in every fight. | S to M |
| Q20 | **Small correctness batch.** Hide the game's durability figure only while the strip's block is on (L15); count mail attachments from the send slots and clear the running flag when mail closes (L18); queue `PA.PlaceAuras` out of combat (L14); loop "Train all" on the trainer update (L22); search all continents for `/way` zone names (L24); use the detailed item level on the character sheet (L26). | Six small wrong behaviours removed. | S |
| Q21 | **Make quest-log header expansion conditional (M16).** Register the two handlers from the quest modules' `Enable`, and add a switch. | A folded zone stays folded for players who want it. | S |

#### Near-term (days)

| # | Work item | Why it matters to players | Effort |
| --- | --- | --- | --- |
| N1 | **In-game verification sprint.** Walk `docs/SMOKE-TEST.md` by area on the live Forever build; record every step in `docs/smoke-results.json`; screenshot each skinned window and each HUD scene; file what breaks. Prioritise secure paths (bars, click casting, raid header, quest item buttons), then visuals. Consider a "verified on build X" line per feature page. | Turns 100% coverage of a model into evidence. Nothing else on this list is worth more. | M, repeating |
| N2 | **Verify or gate key setup.** Run `/vg probe` per class, commit the output as fixtures, correct `Modules/KeybindsData.lua`, and until a class is verified show it as "beta" and never offer it at login. | The boldest feature stops being the riskiest. | M |
| N3 | **Live apply, wave one.** Give repaint-only settings an `Apply` path and remove their reload tags: unit frame text and levels, aura sizes and timers, nameplate size and counts (rebuild rows out of combat), minimap shape and icons, info strip blocks, chat toggles. Target: under 40 reload tags. | The options window starts to feel instant. | M |
| N4 | **Unit frame depth, wave one.** Width and height sliders per frame, text format choices (value, percent, both, deficit), heal prediction and shields on player, target and party via `RH.Prediction`, and a status row (leader, role, resting, PvP). | Closes the most visible gap against dedicated unit-frame addons. | M |
| N5 | **Sliders instead of steps.** Replace fixed-step width, height, size and count choices across raid frames, nameplates, auras, bars and the minimap with sliders that apply live. | Players get the size they want, not the nearest of three. | M |
| N6 | **Action button completeness.** Macro name text with a toggle, auto-attack and auto-shot flash, spacing and hotkey-text rows, coalesced repaint events. | Bars behave like the ones players left behind. | M |
| N7 | **Tooltip information.** Guild and rank, realm, role, item level where the client exposes them, spell and aura IDs behind a switch, anchor choice per tooltip type. | A tooltip addon players can uninstall. | M |
| N8 | **Session fallback for the quest dialog.** A switch (and a modifier on interact) that re-registers the game's quest and gossip events without a reload; pass textured gossip to the game on Retail. | A broken dialog never blocks a quest hand-in. | S to M |
| N9 | **Locale-aware matchers.** Move chat-filter categories and group-board patterns into per-locale tables; hide a category where a locale has no words. | Features work for the nine non-English audiences they are advertised to. | M |
| N10 | **Retire or fold placeholders.** Remove Pet stable and the Legacy helper as modules, fold boss docks into movers and the officer roster into raid tools, replace "List in chat" buttons with small list panels, move graphics `apply` out. | Fewer options rows and commands; every remaining feature earns its place. | M |
| N11 | **[Style] Global font pass.** Apply the theme font to the game's standard font family through `T.FontObjects` (`Core/Theme.lua:2824-2856`), keeping the Korean and Chinese exemption (`:46`). | Unskinned frames and other addons stop showing a second typeface. | S to M |
| N12 | **[Style] Skin the toast and tip family (R7).** Loot, achievement, level-up and event toasts and help tips, using `GW.SkinToast` (`Modules/WindowsSocial.lua:1673`) and the existing fades. | The most frequent stock art on screen joins the theme. | M |
| N13 | **[Style] Default-on depth after an in-game A/B (R2, HUD fix 1).** Decide `hudShadow`, `panelGradient`, slate `panelTexture` and the bevel with real screenshots, then flip the defaults at `Core/Theme.lua:246-296`. | The look players get by default gains depth without a single new asset. | S plus in-game time |
| N14 | **[Style] Icon family redraw (art priority 2).** One consistent set at 64-pixel masters, baked sizes, wired through `T.Icon` (`Core/Theme.lua:73`) with `sizedIcons` on. | Navigation and menus become legible and coherent. | M (art-led) |
| N15 | **[Style] Crest system (art priority 1) and ornament set v2 (priority 3), then the signature window header (R1).** Produce the three crest treatments and the bracket, rule and divider from its geometry; switch `ornaments` on by default. | One recognisable mark and motif across every window, the listing and the site. | M (art-led) |
| N16 | **[Style] State motion kit (H3).** Combat-start edge pulse, breathing proc ring, cooldown-ready flash, low-health pulse, all behind Reduce motion and the combat fade cap (`Core/Theme.lua:3317-3349`). | The HUD communicates "now" at a glance. | M |
| N17 | **[Style] Status-bar texture family and picker (H4, art priority 4).** | Bars with material; an easy, visible upgrade. | S code, S art |
| N18 | **[Style] Empty states and motion polish in the menu (M5, M7).** | Empty lists teach; navigation feels finished. | S to M |
| N19 | **Clean the repository of non-functional third-party names.** Rewrite header comments, design and research notes generically; keep names only in detection tables and the player strings that must say which addon was found. | Brings the repo in line with the owner's own policy. | M |
| N20 | **Lifecycle sweep for switched-off features (L16, M9).** One pass over every file-scope `ns.On` and every `Enable` that registers before checking its own switch: cooldown key text, officer roster, key backup and learner, click-cast pages, quest folds. Add a quality-scan rule: no `ns.On` at file scope outside `Core/`. | Features that are off cost nothing and write nothing. | M |
| N21 | **Give the chat-only features a face or remove them.** Crafting queue panel docked to the profession window, an offline bags list, a keyboard with function keys, number pad and a layout choice, an ordered talent plan, a scrolling group board. | Five features move from "works by command" to something a player finds and keeps. | M each |

#### Larger bets (weeks)

| # | Work item | Why it matters to players | Effort |
| --- | --- | --- | --- |
| B1 | **A real module lifecycle.** Declared dependencies, a subscription scope the registry can tear down, generic disable for display-only modules, late enable. Then live profile switching for modules that support it. | Toggle features and switch profiles without reloading: the single biggest experience upgrade. | L |
| B2 | **Load-on-demand split.** Companion addons for auction, options and setup, diagnostics, key setup, talents, mail and crafting, with a thin always-loaded core and price store. Measure memory and login before and after. | Lower memory and faster login for everyone; a smaller always-on surface to keep correct. | L |
| B3 | **[Style] Preview dock in the options window (M2).** Live sample frames beside the controls on every HUD page, built by the real module code against sample units. | Settings become see-as-you-change; this is what makes a suite feel premium. | L |
| B4 | **[Style] HUD looks and layout presets (H1, H2, H7).** Three complete looks with the crest's geometry carried into frames, the setup layouts available any time from unlock mode, an ultrawide layout, layout-only sharing strings. | A distinctive default and real choice in one click. | L |
| B5 | **Nameplate depth.** Friendly name-only mode, target emphasis, text sizes, per-situation overrides, optional user aura list where auras are readable. | Brings plates up to what dedicated nameplate addons offer within the client's limits. | L |
| B6 | **Inventory window.** Item level and upgrade overlays in bags, an offline view of other characters' bags and bank from the data already stored, filtered open-all for mail. | Lets players drop a bag addon and an alt-inventory addon. | L |
| B7 | **[Style] Setup as a stage (M6) with the theme studio (M3).** Four steps over a live HUD, role thumbnails, variant cards, accent and bar pickers. | The first five minutes sell the addon and produce shareable looks. | L |
| B8 | **[Style] Window structure pass (R3, R4, R5).** One item-slot language everywhere, insets and section headers in every large skinned window, the last stock glyphs replaced. | Nothing on screen looks stock or hollow. | L |
| B9 | **Decide Retail.** Either commit (a second verification sprint, Retail-specific unit frame and plate features) or freeze it as "works, unsupported" and stop adding to it. | Focus. A solo developer cannot deepen the Forever experience and chase Retail parity at once. | Decision, then L or zero |
| B10 | **Outside testers.** Ten to twenty players on the live build with a short structured checklist per role, feeding `docs/smoke-results.json`. | Scales the one thing the harness cannot do. | Ongoing |

**Suggested order.** Q1 to Q8 and Q15 to Q18 this week (Q15 to Q18 are the second pass's confirmed player-facing fixes). Then N1 and N2 before any new feature. Then N3 to N6 together with N11, N13 and N15, which is the point at which the addon both works and looks like itself. B1 before B2, since the lifecycle makes the split clean.

---

## 8. What I could not assess

- **Anything at runtime.** Combat lockdown and taint in the real client, secret-value behaviour in instances, whether the secure-snippet fallback paths work, frame-rate impact in a 40-player fight, actual memory by module.
- **Whether the Forever client matches the harness.** Widget methods, event payloads, the aura container widget, the swing-timer event, the modern auction and profession frames on that client. I took the repo's own source-reading notes as the reference and did not second-guess API names for a client I have no documentation for.
- **Visual results.** I saw 17 approximated preview scenes and the raw media. I did not see any skinned game window as it renders in game, sub-pixel crispness, text over bright backgrounds, or motion. One preview scene (the auction lists tab) rendered empty for me; I could not tell whether that was the preview tool under load or the layout, and drew no conclusion from it.
- **The full test suite.** Not completed in this environment (section 5.7). The quality scan and the quick gate passed. Lint was not run (no `luacheck` here).
- **Second-pass coverage and its limits.** All 40 features first judged from their headers have now been read: 38 in full and 2 structurally (slash command handlers and the individual probe lines). Reading in full skipped comment-only lines and saw very long lines only to about 110 to 150 characters, so the tail of a long string table or a one-line function may hide something. Two pure data files were skimmed, not checked.
- **Specific in-game checks the second pass asks for.** (1) Click the quest micro button and the Vanguard game-menu button during a fight and watch for a blocked-action message (M12). (2) After clicking the game-menu button, open Edit Mode and log out from the menu (game-menu taint, L29). (3) Open the world map in combat after quest-start pins have drawn (L29). (4) Spend planned talents, then apply a manual change in the talents window (L29). (5) Lose a weapon enchant mid-fight and watch for a blocked move of the player buffs (L14). (6) Open the bank and compare the "bags" count on an alt's tooltip before and after (L27). (7) Hover an upgraded Retail item on the character sheet (L26). (8) Check whether any quest shows the "New" mark at all.
- **Data accuracy.** Spell IDs in the key and click-cast layouts, buff IDs in instance prep, stat weights, disenchant tables, dungeon level ranges, vendor stack presets. I flagged where the repo itself marks them unverified and did not check values.
- **Translation quality.** I counted coverage; I did not review any language.
- **The website, the listing pages and the companion site repository.** Out of scope and not available here.
- **Player sentiment.** No download counts, comments or issue tracker were available, so "what players expect" is my judgement of the genre, not survey data.
