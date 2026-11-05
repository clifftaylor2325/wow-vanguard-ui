# ADR: Settings that don't overwhelm

An architecture decision record for the options window (`/vg`) and the other places a player configures Vanguard. Written 2026-11-05 against `main` at `c997aca` (0.8.0 plus the retail build and the twenty bug hunts), from a spike measured in the headless harness (`node scripts/options-inventory.mjs` reproduces every number below). Nothing in it was checked in a game client.

- **Status:** Proposed. Five calls are open for Cliff ([DECIDE] in §6). Nothing here is built.
- **Deciders:** Cliff. Reviewed in four design-review waves before it was sent (§8).
- **Supersedes:** the "C: essentials first" option of the 2026-10-26 options review (the tabs it chose, PR #690, stay). Builds on [UI-COHERENCE.md](UI-COHERENCE.md) and [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) and changes none of their decisions.

## 1. The problem in one line

A player who opens `/vg` to "set Vanguard up" meets 632 rows on 20 pages with no sign of which 30 matter, three different places a feature can be off, captions that read as sentences, and the same setting in more than one place.

## 2. What the spike measured

The window on WoW Forever, logged in with every module on, one row per control (a card title is no row, and the page's own Reset this page button is not counted: with it the script prints 649 and 579):

| | Forever | Retail |
|---|---|---|
| Pages in the list | 20 | 19 |
| Tabs (cards) | 107 | 98 |
| Rows | 632 | 563 |
| Settings with a default (a reset dot) | 319 | 298 |
| Module switches (Modules page) | 76 | 67 |
| Settings that apply after a reload | 70 | 69 |
| Module settings keys in `defaults` | 324 | |

The shape of it:

- **Volume.** The median tab shows 5 rows, but 22 of the 107 tabs show more than 8 and 11 show more than 12; the largest (Raid frames) shows 22 switches and choices in one column. Modules shows 76 module rows across 10 tabs. Action bars repeats one 7-row card eight times (Bar 1 to Bar 8). Healing lists 29 class-buff picks across 7 class tabs, 6 of them for classes the player isn't.
- **Three layers of "off".** A feature can be off on the Modules page (its module, applied on reload), off by the module's own switch on its area page (14 modules start that way: the meter, fight history, chat filter and history, the three Cooldown Manager extras, craft queue, mail tools, spell ranks, Legacy, party pets, group threat, officer loot), or off by a feature switch under that. The window already has to explain itself: "On, but its own switch is off (Combat tools)".
- **Captions that are sentences.** 75 of the 630 captions run past 60 characters in English (so past 80 in a translation), and 21 of them name a `/vg` command. A row's hover tip (`row.tip`) exists in the window but three rows use it; the explanation went into the caption instead. 72 rows are plain text (notes), a tenth of the window.
- **One setting in two places.** Calm HUD's switch is on General → Calm HUD and on Unit frames → Unit frames; the eight bar cards each carry the same four bar settings for a different bar. Presets (Healer, Damage, Tank) are on Profiles, but what they set (raid frames, raid auras, raid healing, nameplates) is on four other pages, and setup's layouts set them too.
- **Pages by module, not by what the player is doing.** The list on the left is two groups: General and Modules, then eighteen areas in the order the modules were written (Healing, Click casting and Talents sit between Raid frames and Action bars). Three of those pages are small (Cooldowns 9 rows, Talents 6, Situations 13) and two carry one tab each.
- **Six surfaces configure the same profile:** the setup wizard (six questions, the recommended path), the options window, unlock mode's handle popover (anchor, offsets, scale, opacity, size links), Situations recording, the 55 `/vg` commands (86 words), and What's new's deep links. Only the options window can show what a player changed (the search word "changed"), and only there does a changed setting wear its reset dot.
- **Reload.** 70 of 319 settings (22%) apply after a reload, and every one of the 76 module switches does, so the footer's reload notice is a usual sight while configuring.

What already works and stays: the tabs (one card at a time, remembered per page), the search (captions, keywords, choice names, notes, both languages), the reset dot and the page dot, Reset this page, the keyboard, the preview on General, the per-row reload tag, `Vanguard.OpenOptions(page, row)` for addons and What's new, and the UI-first rule (every action has a control).

## 3. What "not overwhelming" means here

Targets a test can hold, not adjectives:

1. **A tab opens on at most 8 rows.** Everything else on that tab is one fold away and the fold says how many ("More settings · 11").
2. **A feature is off in one place.** One switch per module, where its settings are; no module has an "own switch" under its module switch.
3. **A caption is a name.** At most 40 characters in English, no command words, no bracketed tails; the explanation is the row's hover tip, or a one-line note only when the name can't carry it.
4. **A setting lives in one place.** Two rows never set the same key, except where a page is an overview of others (the profile picker in the header is the pattern).
5. **A page has at most 6 tabs and at least 10 rows,** or it is a tab on a kin page.
6. **Set up first, tune second.** The first thing the window shows is what setup and the presets do, with the controls that run them; the pages are the fine tuning.

## 4. Options considered

| Option | What it is | Why not on its own |
|---|---|---|
| A. Leave it; lean on search | The search already finds any row in both languages. | Search helps the player who knows the word. The problem is the player who doesn't know what to look for. |
| B. Essentials / All settings switch per page (the 10-26 "C") | Each page opens on a quarter of its rows; a switch at the top shows all. | A mode the player has to remember, and a hidden changed setting is a support question. Per-card folding (D1 below) keeps the count in view and needs no mode. |
| C. Fewer settings | Cut rows nobody asked for. | Nobody can say which, there is no telemetry, and every row was asked for by someone in a hunt or an issue. Folding keeps them without showing them. Cutting stays a per-row call in later polish, with the fold as the default home for a doubtful row. |
| D. Restructure around the player's task (adopted, in parts) | Set up first; essentials per tab; one switch per feature; names not sentences; one home per setting; pages by what you're doing. | Big if done at once. Phased in §7 so that no phase moves a setting that another phase renames. |
| E. A separate "simple" window | A second, smaller options window over the same settings. | Two windows to keep in step, two to translate, two to test for text fit. The fold inside one window gives the simple view for free. |

## 5. Decision

Adopt D as six rules, each with the smallest mechanism that holds it.

### D1. Two depths on every card: essentials shown, the rest folded

Every row gets a tier, and a card shows its essential rows then a fold line, "More settings · N", that opens the rest below it (the quest log's collapsible section header, `W.SectionHeader` with `collapsible` and a count, already draws one). The mechanism, so that it fits the window as it is: the card's rows are partitioned where cards are built (`groupRows`), never in the page's row list, so a note stays under its setting (a text row takes the tier of the row above it); the fold line is a button, so the keyboard's Tab reaches it and Enter or Space toggles it as it does any button; `O.RevealRow` (a search hit, a What's new link, `OpenOptions`) unfolds before it checks the row is visible; a toggle sets the card's height again and refits the view. The fold is remembered per card (the page key and the card's English title) for the character, across reloads, in the character's saved file, like the quest log's folded zones, since 70 settings and every module switch reload and a player following a guide reloads between steps. The fold line wears the accent dot while a folded row is changed from its default, so "where did X go" is answered where the player is looking. Reset this page and the "changed" list walk the whole row list, as they do today, so folding costs them nothing. The fold and its memory live in a new `Core/OptionsFold.lua` (listed in the TOC), not in `OptionsWindow.lua`, which holds 160 top-level locals against the scanner's 185.

The tier is a rule, not taste, so a reviewer can check it. A row is **essential** when it is

- the module's switch (D2),
- a setting that setup, a layout or a preset sets (so the window shows the player what the wizard chose), or
- the row that places, sizes, hides, replaces or lays out **the whole feature**: its Visibility and Show when, its width and height, its spot, Groups as, "Replace the default unit frames", "Vanguard's quest tracker under the info strip".

Every other row is **more**, and in particular **a part of a feature** is more: one block of the info strip, one raid mark, one icon slot, one chat channel, one window group, one tooltip line, a tuning number, a wording or colour variant, a mirror of the game's own setting, a list editor, a diagnostic. Marked as `more = true` on the row table, the way `isReset` already is, so no row helper changes its signature. With that rule 22 tabs fall under the 8-row target; the harness test (§7) lists the rest as a baseline that only shrinks, like `textfit-baseline.json`.

### D2. One switch per feature, on its page

A module's switch moves to the top of its card on its area page, and the fourteen modules with an own switch inside lose it: the module switch is the switch. Which cards get one:

- **A card that is one module's** (its name is the module's: Chat filter, Chat history, Cast bars, Readouts, Tooltips' first module, the meter, the roll tracker, each Town and gear card) gets the module's switch as its first row, with the "Reload to apply" tag where the module still builds at login.
- **The fourteen** (party pets and targets, group threat, officer loot, chat filter and history, the three Cooldown Manager extras, craft queue, mail tools, spell ranks, Legacy, fight history, the meter): the row that was the own switch becomes the module's switch, where it is; the module stays registered and loaded, as today when its own switch is off. Eleven of the own switches apply live today and keep doing so; three are reload settings whose `Enable` returns early when off (party pets and targets, group threat, the gaps row: `PartyExtras.show`, `GroupThreat.show`, `CooldownGaps.on`), so S3 either gives each a build-on-first-switch path (party pets' secure tiles under `ns.OutOfCombat`, which it already uses; the gaps row's mover registered late, which `Movers` allows) or keeps the row's reload tag; the smallest choice is the tag, and the build path is the better one where its `Enable` can be split. Two of the fourteen have two own switches (spell ranks: `barNotice` and `trainerMemory`; fight history: `strip` and `recap`): each gets one `on` key as the switch (migrated as either-on) and keeps the two as parts. A module-switch row has no default (a module switch is not a setting with a reset dot today, and stays that way), so Reset this page never turns a module on or off and "changed" never lists one. Its row on the Modules page sets the same key and wears the tag the page's row wears. `O.MODULE_LINKS` and the "On, but its own switch is off" note go.
- **The migration** turns the direction round: today a module that is off on Modules wins over its own switch, so where a saved profile holds `modules[X] == false` for one of the fourteen, the switch key goes off and the Modules entry is cleared. It reads one table and writes another, which `ns.Migrate` (one table at a time) can't, so S3 adds a profile-wide step (`ns.MigrateProfile`) run where a profile enters: at load, after `migrate(payload)` in `ProfileStrings` for an imported string (a friend's 0.8 string, a "parts" string without the sibling table) and for an addon's preset string. The tests' scoped logins that switch a module off through `modules = { Meter = false }` change with it.
- **A card that mixes modules** (Raid frames → Raid frames holds RaidFrames, RaidAuras and RaidStatus; Unit frames → Unit frames holds UnitFrames and ClassBars; Game windows → Tooltips holds Tooltips, Inventory and VendorMemory) gets no switch for the modules whose rows are a few lines inside another module's card: their switch stays on Modules only, so a healer never flips "Raid debuffs and HoTs" among 22 rows thinking it is a setting. Where the mix is large enough to be its own card (RaidAuras' and RaidStatus' rows on Raid frames), the card is split by module first, within the page's tab budget (rule 5).

The Modules page stays as the overview (what's on, what each module does, what it needs, the Other addons card), which the website also reads; its switches set the same key as the one on the page, the one allowed case of a setting in two places (rule 4), and both wear the same tag.

### D3. Captions are names; the explanation is the tip

The 75 long captions are renamed to a name of at most 40 English characters, and their sentence moves to `row.tip` (shown on hover and found by the search, which already reads tips) or, when the row can't be understood without it, to a note. The `/vg` word a caption names moves to the tip too. A renamed row keeps its old English caption on the row (`was = "Recap in chat after each fight (/vg recap)"`; a bare literal, so it is no player text for the unwrapped-text count), which the search's `haystack` and the window's `captionHas` both read, so a guide written against 0.8 still finds the row by its old words and an older What's new note still jumps to it; the old page names of D5 are keywords of their kin tab the same way. `O.KEYWORDS` is keyed by the English caption, so a rename orphans its keywords silently: the S2 test asserts every key matches a live caption or a `was`. A new row that breaks the length rule fails the test. Translations: a renamed caption shows in English until the next `scripts/i18n.mjs import` carries its draft, which the addon already allows ("any text without a translation shows in English").

### D4. One home per setting, and no repeated cards

Calm HUD's switch leaves Unit frames (General → Calm HUD keeps it with its seven parts). Action bars' eight bar cards become one "Bars" tab with a Bar 1 to 8 choice at its top, the choice names keeping "right edge" where a bar has it. That is the one change here that needs a new contract in the window: a row's default is read once when the row is built (`defaultOf`), and the bars' defaults differ (bar 1 is on, bar 6 is off; the right-edge bars lay out differently), so a row under the picker needs its default and its getter and setter to follow the picked bar: `defaultOf`, `rowChanged`, `defaultText` and `resetRows` accept a function as a default, and the search's hit line, which shows caption and page only, learns to name the bar ("Action bars → Bars → Bar 4, right edge") so eight hits of "Buttons per row" tell apart. The picker therefore has a phase of its own (S5), after the fold, since it moves 56 rows under one card while S1 moves none. Healing's seven class tabs become one "Class buffs" tab that opens on the player's class and folds the other six under D1; they fold rather than hide because the list is the buffs to watch for on the raid, any class's (a priest watching for a missing Blessing of Kings), not the buffs this character gives. The presets' buttons also appear on the first tab of General (D6), with the Profiles page keeping the list for addon presets.

### D5. Pages by what the player is doing

Three pages fold into kin pages as tabs: Healing into Raid frames (Raid frames · Debuffs and marks · Preview · Healing · Class buffs, with D2's split), Talents into Town and gear (as the Training tab with Spell ranks, Pet stable and Legacy; all four are WoW Forever's, so on Retail there is no Training tab, as there is no Talents page today), Cooldowns into Combat tools (its four cards as one Cooldown Manager tab of 9 rows, its "Set up cooldowns" button the tab's first row, and the note on The game's tools that points to "the Cooldowns page" reworded to the tab). Town and gear's eleven tabs become six on Forever (Auction house · Merchants and errands · Crafting and mail · Training · Instance prep · Gear upgrades) and five on Retail; its "Data from the beta" card (a note and a Clear button about saved data) moves to Profiles → Your profiles, beside Reset profile, where clearing saved data belongs. Chat's eight become six (Chat · Tabs and windows · Extras · Watch · Filter · History and group board). The list on the left gets three dividers instead of one: **Start** (General, Modules), **On screen** (Unit frames, Raid frames, Nameplates, Action bars, Click casting, Combat tools, Map, Bars and bags, Chat), **Playing** (Quests, Game windows, Town and gear), **Yours** (Situations, Profiles, Feedback); the three extra dividers cost 3 list rows, which `fitHeight` already absorbs by shortening entries, and the text-fit test covers the list at Larger text on 1080p. Old page keys (`healing`, `talents`, `cooldowns`) stay as aliases, and the alias table lives in `O.Show` itself (`healing` opens `raid` and then its Healing tab) and in `O.RebuildPage`, not only in `Vanguard.OpenOptions`'s `OLD_PAGES`: What's new, `/vg cooldowns`, the unlock bar, the click-casting page and the gaps row all call `O.Show` or `O.RebuildPage` with a page key, and an unknown key shows a blank page today. The old names are search keywords of their kin tab, so no link or guide breaks. Healing and Talents are pages a module adds with `ns.Options.AddPage`; as tabs they come through `O.AddRows`, which today only appends or prepends a page's rows, so S4 gives `AddRows` a position (after a named card) to put Healing fourth of five and Training fourth of six.

### D6. Set up first, tune second

General's first tab becomes **Start here**: **Run setup**, the three role presets (Healer, Damage and tanking, Tank), each with one line that says what it replaces ("Replaces your raid frame, aura, healing and nameplate settings; asks first and backs your profile up"), **Move frames**, and **What's new**. Look (which keeps the preview, since the preview shows Look's own controls changing), Bars, Motion and sound, Calm HUD and Layout follow as tabs. General opens on Start here while setup is owed (`Core/Setup.lua`'s own test, which covers the account and the character), then on the tab it showed last, as every page does; the window keeps opening on the page it showed last. Setup stays the recommended path and gains nothing; the window just stops hiding it under Layout.

## 6. Calls for Cliff [DECIDE]

1. **D1's fold versus B's page switch.** Recommended: the fold. One mechanism, no mode, the count stays in view.
2. **D2: the fourteen inner switches go, and their modules always load.** Recommended: yes. They cost nothing until switched on (the module's own switch today), and a card that mixes modules gets no switch for the modules inside it. The alternative keeps the Modules switch and the inner switch and only moves the latter up, which leaves two places to be off.
3. **D5's three page merges and the four-group list.** Recommended: yes, with the key aliases. Alternative: keep the twenty pages and only regroup the list.
4. **D3 now, in English, with translations following in the next i18n batch;** or wait and rename captions only with their ten drafts in hand. Recommended: now. 75 rows in English for one release is the cost; a window that reads as prose is the cost of waiting.
5. **D6's Start here tab.** Recommended: yes. Alternative: leave General as it is and put Run setup and the presets in the header beside the profile picker.

## 7. Consequences and the build order

Five phases, one PR each, in this order so that nothing is renamed and moved in the same phase, and the one pass that reads every row (its tier and its name) happens once. Each phase is a `work/settings-<n>` branch, lists where its controls are, and ends with the local gate. Sonnet, medium effort, three adversarial waves unless usage is close.

| Phase | Builds | Moves a setting? | Touches (rough size) | Needs in game |
|---|---|---|---|---|
| S1 fold | D1's mechanism with no row marked yet; the harness test `scripts/tests/options-budget.test.mjs` (rows shown per tab ≤ 8 with a baseline that starts at today's 22 tabs and only shrinks, no two rows on one key, caption length with its own baseline, tabs per page) and the inventory script; D4's Calm HUD dedupe | No | New `Core/OptionsFold.lua` and its TOC line, `OptionsWindow.lua` (`groupRows`, `buildCard`, `RevealRow`), `OptionsSearch.lua`, the test, `docs/features/options-and-setup.md`, SMOKE-TEST (about 500 lines) | The fold's look at Larger text and in German; keyboard Tab onto a fold line |
| S2 tiers and names | The `more` marks on every row by D1's rule and D3's 75 renames with their tips and `was`, in one read of the 630 rows; the keywords test; the i18n export for the drafts | No | Every `Core/Options*.lua` and module options file, `Locales/` via import, `OptionsSearch.lua` (`haystack`, `captionHas`) (about 300 lines of Lua, plus Locales churn) | Tips on hover; search finds the old words; the baseline shrinks to the tabs D1 leaves long |
| S3 one switch | D2: the module switch row on its page, the fourteen own switches gone, the `on` keys for the two two-key modules, the build-on-first-switch path or the tag for the three reload ones, `ns.MigrateProfile` run at load, on import and on a preset | The 14 keys (migrated) | `Core/Modules.lua`, `Core/DB.lua`, `Core/ProfileStrings.lua`, `Core/Options.lua` (MODULE_LINKS goes), the fourteen modules, the Modules page, the tests' scoped logins (about 400 lines) | A module switched on without a reload; the Modules overview; an imported 0.8 string with a module off |
| S4 pages | D5 and D6; the aliases in `O.Show` and `O.RebuildPage`; `AddRows` with a position; the nav groups; the website's generator learning `AddRows` rows and the aliases | Yes (page keys) | `Core/Options.lua` PAGES, `OptionsWindow` nav, `Slash`, `WhatsNewNotes`, `Integration`, `API.md`, `RaidHealing` and `TalentPlanner` (their pages become tabs), and a site PR (about 500 lines plus the site) | The list on the left at 1080p and Larger text; every What's new link; `/vg cooldowns` |
| S5 bar picker | D4's one Bars tab with the Bar 1 to 8 choice and the default-as-function contract | 56 rows under one card (keys unchanged) | `OptionsBars.lua`, `OptionsWindow.lua` (`defaultOf`, `rowChanged`, `defaultText`, `resetRows`), `OptionsSearch.lua` (the hit line) (about 250 lines) | The choice; the dot per bar; "changed" naming the bar |

What changes for players: the window opens on Start here; each tab shows a short list with a fold under it; a module is switched on where its settings are and most switch on without a reload; names, not sentences; three fewer pages; one Bars tab. What stays: every setting, every key, every `/vg` word, every deep link, the search, the dots, the reset.

What it costs: 75 captions in English for one release in nine languages; a one-time read of every row to mark its tier and name it (the rule makes it mechanical; the test holds it); the website's Settings page regenerates from the new captions and tiers (the site reads the addon at build time, so it needs no hand edits, but its generator reads only `PAGES` and `AddPage` tables today, so it must learn `AddRows` rows, `more` and the aliases, which also puts the rows it misses today, Healing's 44 among them, on the site); a profile-wide migration for the fourteen inner switches; and a new Core file, since `OptionsWindow.lua` holds 160 top-level locals and `Options.lua` 71 against the scanner's 185.

What it does not do: cut any setting (C), change the theme or the controls (UI-COHERENCE owns those), or touch the reload mechanism. A follow-up, after S3, is the list of the 70 reload settings with a per-row note on which could apply live; that is a per-module job, not a window job.

## 8. Review record

Four design-review waves, each a fresh reviewer with one lens, run before this record was sent; the record was revised after each. The lens and what changed:

1. Player lens (a first-week player, a healer with a guide open). Found: the tier rule's third clause marked a part of a feature (one strip block, one raid mark) essential, so Raid frames would have shown 20 rows, not 7; D2 said nothing about cards that mix modules; D5's Training tab was empty on Retail and lost "Data from the beta"; a renamed caption and a folded card broke a guide-follower twice; the migration had to cover imported strings. Changed: the whole-feature versus part-of-feature rule, D2's three card cases, the Retail tab list, the fold remembered across reloads, old captions and page names as search keywords, migration on import stated, the preview kept on Look, Click casting under On screen, the presets' one-liner.
2. Engineering lens (CLAUDE.md's hard rules, the harness, the local limit, taint, Retail). Found: the local counts were wrong (160 and 71, not 32 and 15); the migration could not be written with `ns.Migrate` and ran the wrong way; three of the fourteen own switches are reload settings whose module builds nothing when off; two modules have two own switches; a module-switch row must have no default; the bar picker needs a default-as-function contract and moved 56 rows inside "S1 moves nothing"; page aliases had to live in `O.Show`, not only in `OpenOptions`; `AddRows` can't place a tab; the website reads no `AddRows` rows. Changed: a new `Core/OptionsFold.lua`; `ns.MigrateProfile` at load, import and preset; the three reload modules and the two two-key modules named with their handling; no default on a module switch; the picker as its own S5 with its contract; aliases in `O.Show` and `O.RebuildPage`; `AddRows` with a position; the site's generator in S4's cost; tiers and names in one pass (S2); the fold's partition, keyboard and reveal mechanics spelled out.
3. Consistency lens (UI-COHERENCE, DESIGN-PRINCIPLES, text fit in ten languages, the website's generators): pending.
4. Decision lens (is each [DECIDE] a real fork, is the recommendation defended, could Cliff act on this in one reading): pending.

## 9. Appendix: the tabs over the 8-row target today

Rows shown when the tab opens (Forever, today's tabs). The expected essentials are an estimate under D1's rule, read from the captions, and will be set row by row in S1; the rule's test is that a reviewer reading the caption reaches the same tier.

| Page → tab | Rows | Expected essentials (the rows) |
|---|---|---|
| Raid frames → Raid frames | 22 | 7: the module switch, Groups as, Stack big raids, Style, Width, Height, Sort (preset keys); the marks, icon slots, fade and ready-check rows are parts |
| General → Look | 19 | 6: Safer colours, Font, Text size, Theme variant, Corners, Pixel-perfect (setup keys); the rest are variants |
| Nameplates → Nameplates | 17 | 5: the switch, Show levels, threat colours, the two preset keys; the rest are parts |
| Map → Strip under the minimap | 16 | 2: Strip visibility, Show when; 14 blocks are parts |
| Chat → Chat tabs | 15 | 4: the Tab choice and its three buttons; 10 channel switches are parts |
| Modules → Town and gear | 15 | 15: module switches; the overview stays long by design |
| General → Layout | 14 | 5: Run setup, Move frames, Frame to size, Its scale, Reset all positions |
| Modules → Unit frames | 14 | 14 |
| Unit frames → Unit frames | 13 | 6: Replace the default frames, Versus deck, Health as, Boss frames, the two ClassBars rows (they place a bar) |
| Game windows → Game windows | 13 | 3: the module switch, Drag game windows, Reset window positions; the window groups are parts |
| Chat → Chat filter | 13 | 1: the switch; the kinds and lists are parts |
| Chat → Chat watch | 12 | 2: Add a phrase, Toast |
| Healing → Paladin | 12 | 12 for a paladin, folded whole for another class |
| Town and gear → Auction house | 11 | 2: the switch, Auction prices in tooltips |
| Combat tools → Vanguard meter | 10 | 4: the switch, Meter visibility, Show when, Lines |
| Game windows → Tooltips | 10 | 2: Tooltip position, Hide in combat |
| Town and gear → Instance prep | 10 | 2: the two checklist triggers |
| Action bars → Action bars, Your keys; Chat → Chat, Group board; General → Calm HUD; Combat tools → The game's tools; Quests → Finding your way; Map → Minimap and waypoints; Town and gear → Gear upgrades; Modules → Quests, Game windows, Combat tools | 8 to 9 | at or under 8, except the Modules tabs |
