# Guided setup: recommended settings in the first-run wizard

- **Status:** Accepted 2026-11-09. Cliff chose the nine-step layout (§3, decision 1) and let the recommended values (§4) and the first-run rule (§5) stand as written. Built the same day as `Core/SetupGuide.lua`; the behaviour is on [features/options-and-setup.md](../features/options-and-setup.md) (First-run setup, Guided steps).
- **Asked for:** "a more comprehensive init that guides the user through all of the recommended settings" (Cliff, 2026-11-09).
- **Builds on:** today's setup ([features/options-and-setup.md](../features/options-and-setup.md), First-run setup), [SETTINGS-SIMPLIFICATION.md](SETTINGS-SIMPLIFICATION.md) (D6, Set up first, tune second) and [UX-LESSONS.md](UX-LESSONS.md) (one first-run window, Keep as the default). It changes none of their decisions.

## 1. Problem

Setup today asks four things: a layout, a screen preset, an accent and raid style with three switches, and where frames go. Everything else is left at its default, and 72 switches ship off (measured with the options inventory walk on Forever, 2026-11-09). Some of those are what most players turn on in their first hour (enemy nameplates, the furthest camera zoom, faster auto-loot, a spam filter, keeping chat across a reload), and some only make sense for one role (the group threat panel for a tank). A player finds them by reading 20 pages. The 2026-11-09 review ranks "dozens of features ship off" as the fourth most visible gap, and its market notes show the two lasting complaints about UI suites: "too many settings" and "it overwrote what I had".

So the wizard should walk the player through the settings worth deciding on day one, show which value Vanguard recommends and why in one line, and still never change something the player didn't see.

## 2. What players and other suites do (research)

- **Installers in the big suites** walk about eight steps: the game's settings, chat, theme, UI scale, layout by role, auras, finish. They set the game's own settings in one go, and that is the source of "automatically overwrote all of my technical settings" (Blizzard forums, 2023, in the review's market notes).
- **The newer Forever suites** pitch the opposite: "features start off by default and only activate when the user opts in", "no setup". Vanguard's own promise is in between: Keep is picked, so Next, Next, Done changes nothing.
- **Forever setup guides** (Method, PlayHub, Mobalytics, Gfinity, ForeverMastery; Sept to Nov 2026) agree on a short list of first changes: enemy nameplates on, camera zoom out as far as it goes, camera following off, auto loot on, target of target on, status text as value and percent, combined bags on while levelling, the Cooldown Manager on, click casting or mouseover healing for healers, raid frames with class colours, power bars for healers and dispellable debuffs shown.
- **Classic-era habits** carry over: quest automation with a modifier to skip it, a sell-junk and repair helper, a gold-spam filter, spell rank upgrades on bars after training, boat timers.

Vanguard already covers most of that list: target of target, status text, class-coloured raid frames, dispellable debuffs, combined bags and repair are on by default, and click casting comes with the Healing layout. The rest are below.

## 3. Step layout ([DECIDE] 1)

Recommended: **nine steps** (ten for a new character, with Profile first): the eight of today's wizard plus four guided ones, and All set. Each fits the window without scrolling (six rows at most), and each row is a control that already exists in `/vg`, so the wizard adds no new setting.

| # | Step | What it asks | New? |
|---|---|---|---|
| (0) | Profile | Share or own profile (new characters only) | as today |
| 1 | Layout | Role layout or Keep | as today |
| 2 | Screen | Screen preset, Pixel-perfect, Fit, or Keep | as today |
| 3 | Look | Accent, raid frame style | as today, minus its three switches |
| 4 | Comfort | Larger text, Safer colours, Calm HUD, Reduce motion | moves Look's switches here, adds Reduce motion |
| 5 | Game settings | The game's own settings Vanguard can set, each showing what the game has now | **new** |
| 6 | Helpers | Vanguard's errand and chat helpers that ship off | **new** |
| 7 | Combat | Role-based extras, extra action bars, key setup | **new** |
| 8 | Move things | Unlocked frames, as today | as today |
| 9 | All set | What this run changed, Undo setup, Done | **new** |

Alternatives:

- **Six steps:** Layout, Screen, Look (with Comfort's switches, as today), one **Recommended** step holding steps 5 to 7 under three small headings (it scrolls), and Move things. Fewer Next clicks, but one long scrolling page.
- **Today's four plus one:** keep the wizard and add a single **Recommended settings** step with a "Use all recommended" button and a list. The least work, the least guidance.

## 4. Recommended values ([DECIDE] 2)

Each row shows its caption, with `· recommended` after it while Vanguard recommends it on for this role and client (the mark is static: it says what is recommended, not whether the row differs). A role in brackets means the row is recommended only for that layout's role (it reads the role the Layout step marked, or your group role on Keep).

### Step 4, Comfort

| Row | Default | Recommended | Why |
|---|---|---|---|
| Larger text (115%) | Off | Off; **On with a controller** (`InputUtil.IsGamepadUIEnabled`) | Couch distance; the review's accessibility item 8 |
| Colour vision: Safer colours | Off | Off | A need, not a taste; offered, never pushed |
| Calm HUD out of combat | Off | Off | Some players love it, many miss their bars; offered |
| Reduce motion | Off | Off | Offered here so players who need it find it |

### Step 5, Game settings (the game's own; Vanguard records the old value so turning it back puts yours back)

| Row | Recommended | Why |
|---|---|---|
| Enemy nameplates (the game's setting) | On | Every guide's first change. Also replaces today's silent once-per-character write (review item E3-7) with a choice the player sees |
| Furthest camera zoom (the game's setting) | 2.6 x (furthest) | Every guide's second change |
| Class-colored names in chat (the game's setting) | On | Who said what, at a glance |

Not offered (Vanguard has no control for them, and CLAUDE.md says not to add a setting nobody asked for): camera following style, auto loot, sticky targeting. If Cliff wants them, each becomes a new "(the game's setting)" row on its page first, with the same put-back record.

### Step 6, Helpers (Vanguard's own, all off by default)

| Row | Recommended | Why |
|---|---|---|
| Faster auto-loot | On | Looting is half of levelling; no downside |
| Filter chat (gold selling, boosting, recruiting, repeats) | On | Gold spam is the top Trade complaint on new realms; caught lines go to their own tab, nothing is lost |
| Keep chat history | On | Chat survives a reload and a relog |
| Notice older ranks on bars, Remember what trainers teach (Forever) | On | Vanilla's spell ranks: after training, the bars still cast the old rank |
| Inbox search and send-to-alt presets | On | Cheap, and only shows at a mailbox |
| Quest automation (Accept quests, Turn in finished quests) | Off | Many Forever players read the quest text; offered, with "hold Shift to skip" in its tip |

### Step 7, Combat

| Row | Recommended | Why |
|---|---|---|
| Show the game's Cooldown Manager | On | Guides recommend it; it ships off in the game |
| Glow a buff near its end | On | Pairs with the manager |
| Timer numbers on target and focus auras | On | Most asked-for aura detail |
| Group threat panel | On for **Tanking**, off otherwise | Tanks watch threat on the group |
| Action bars | **Three plus the two right-edge bars** (bars 4 and 5, shown on mouseover) | Vanilla classes carry more spells than three bars hold by level 40 |
| Key setup at your next login (Forever) | On | Key setup's once-only offer at the next login already exists; this gives it a switch, so a player can decline it here |

Left alone, because Vanguard already uses the game's own: the game's damage meter is shown in the Vanguard look, so Vanguard's own meter stays off.

### Why not just change the defaults

A default changes every existing player's UI on the next update, and several of these depend on role or taste. Setup recommends; the defaults stay as they are.

## 5. How a recommendation is applied ([DECIDE] 3)

Recommended:

- **On a first run**, Vanguard's own rows (steps 4, 6, 7) start on the recommended value, because the profile is new and those are Vanguard's settings, not the player's. The game's own rows (step 5) start on what the game has now, with a **Use recommended** button at the top of the step.
- **On a run again** (`/vg setup`, Run setup, a new character sharing a profile), every row starts on what is set now, and every step has **Use recommended**. So Next, Next, Done on a run again still changes nothing.
- The All set step lists what this run changed, grouped by step, with **Undo setup** (puts the backup profile back and the game's settings it changed, after a question, with the reload) next to Done.

Alternatives: every row always starts on what is set now, with Use recommended on each step (a first run then also changes nothing until the player clicks); or every row, the game's included, starts on the recommended value (fastest, and the "overwrote my settings" complaint).

## 6. How it would be built

- A new `Core/SetupGuide.lua` holds steps 4 to 7 and 9 as data: one table per step listing its rows by options caption, module, key, recommended value and an optional role or client. Setup.lua keeps the window, the order and the Back and Next buttons, and reads the step list from it (Setup.lua is at 1,091 lines; its top-level locals stay under the scanner's limit by moving, not adding).
- A row in the wizard is the options row (same caption, tip and setter), so the window, the search and the website keep one name for each setting.
- Game settings go through the setters that already record the old value (Nameplates' `setGameSetting`, Quiet's `cameraPrior`, ChatExtras' class colours and timestamps).
- Nothing is protected: every row is a saved setting or a CVar applied out of combat; setup still waits for combat to end.
- Tests: each step's rows exist on both clients (a Forever-only row is dropped on Retail), first run versus run again starting values, Use recommended, role-dependent rows follow the Layout step, the All set list, Undo setup, text fit with every string a third longer.

Docs: `features/options-and-setup.md` First-run setup and Guided steps, `SMOKE-TEST.md` 1.2, 2.2, 33.452, 33.456 and 33.457, `GETTING-STARTED.md`, `COMMANDS.md`. No fade or sound was added. The What's new line is written at the release, as the other notes are.

**Banner art (Cliff, 2026-11-09, "include banner art in the setup experience too").** The welcome banner's strip stays on every step, so the window keeps one height, and the picture is a journey through the art that has shipped (all four paintings are 2:1, so one strip fits them): the dusk banner with the crest and name while the profile, layout, screen and look are chosen, the player's faction's AFK scene (`T.AFK_SCENES`) through the four guided steps, and the camp at night on Move things and All set. No new art; `Core/Banner.lua` takes the scene's file and shows the brand mark only over the welcome banner.

## 7. Needs in-game check (once built)

The wizard at 1080p and at Larger text in German; that every step fits without scrolling; that Enemy nameplates, camera zoom and class colours apply and that turning them back puts the old values back; Undo setup after a first run; a new character sharing a profile sees Keep everywhere.
