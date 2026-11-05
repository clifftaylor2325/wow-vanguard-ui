# Design: settings that don't overwhelm (ADR)

An architecture decision record for the options window (`/vg`) and the other places a player configures Vanguard. Written 2026-11-05 against `main` at `c997aca` (0.8.0 plus the retail build and the twenty bug hunts), from a spike measured in the headless harness: `node scripts/options-inventory.mjs` reproduces every number below. Nothing in it was checked in a game client.

- **Status:** Accepted for S1 (Cliff, 2026-11-05: build the fold, Raid frames first). Calls 2 to 5 in §6 stand on their recommendation unless Cliff says otherwise before each phase starts. Nothing is built yet; S1 is the first build.
- **Deciders:** Cliff. Reviewed in four design-review waves before it was sent (§8).
- **Relation to earlier work:** the 2026-10-26 options review offered A (folded cards), B (tabs inside a page) and C (essentials first); Cliff chose B, built as PR #690, and it stays. D1 below is A moved inside B, carrying C's essentials without C's mode. Builds on [UI-COHERENCE.md](UI-COHERENCE.md) and [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) and changes none of their decisions.

## 1. The problem in one line

A player who opens `/vg` to "set Vanguard up" meets 632 rows on 20 pages, 22 tabs that open on more than 8 rows, no sign of which rows set a feature up and which only tune it, three different places a feature can be off, and captions that read as sentences.

## 2. What the spike measured

The window on WoW Forever, logged in with every module on, one row per control (a card title is no row; the page's own Reset this page button is not counted, with it the script prints 649 and 579):

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
- **Captions that are sentences.** Of the 548 captions on controls, 113 run past 40 characters in English (so past 53 in a translation a third longer) and 32 past 60; 21 name a `/vg` command. A row's hover tip (`row.tip`) exists in the window but three rows use it; the explanation went into the caption instead. 72 rows are plain text (notes), a tenth of the window.
- **One setting in two places.** Calm HUD's switch is on General → Calm HUD and on Unit frames → Unit frames; the eight bar cards each carry the same four bar settings for a different bar. Presets (Healer, Damage, Tank) are on Profiles, but what they set (raid frames, raid auras, raid healing, nameplates) is on four other pages, and setup's layouts set them too.
- **Pages by module, not by what the player is doing.** The list on the left is three groups with a divider between them: General and Modules, then sixteen areas in the order the modules were written (Healing, Click casting and Talents sit between Raid frames and Action bars), then Profiles and Feedback. Three of those pages are small (Cooldowns 9 rows, Talents 6, Situations 13) and two carry one tab each.

What already works and stays: the tabs (one card at a time, remembered per page), the search (captions, keywords, choice names, notes, both languages), the reset dot and the page dot, Reset this page, the keyboard, the preview on General, the per-row reload tag, `Vanguard.OpenOptions(page, row)` for addons and What's new, and the UI-first rule (every action has a control).

Two more things the spike saw that no decision here solves, kept for the record: six surfaces configure the same profile (setup, the window, unlock mode's popover, Situations recording, the 55 `/vg` commands, What's new's links) and only the window shows what a player changed; and 70 settings plus every module switch wait for a reload (§7, "what it does not do").

## 3. What "not overwhelming" means here

Targets a test can hold, not adjectives:

1. **A tab opens on at most 8 rows.** Everything else on that tab is one fold away and the fold says how many.
2. **A feature is off in one place.** One switch per module, where its settings are; no module has an "own switch" under its module switch.
3. **A caption is a name.** At most 40 characters in English, no command words, no bracketed tails; the explanation is the row's hover tip, or a one-line note only when the name can't carry it.
4. **A setting lives in one place.** Two rows never set the same key, except where a page is an overview of others (the profile picker in the header is the pattern).
5. **A page has at most 6 tabs and at least 10 rows,** or it is a tab on the page it belongs with. The Modules page is an overview by design and is exempt from rules 1 and 5.
6. **Set up first, tune second.** The first thing the window shows is what setup and the presets do, with the controls that run them; the pages are the fine tuning.

## 4. Options considered

| Option | What it is | Why not on its own |
|---|---|---|
| Leave it; lean on search | The search already finds any row in both languages. | Search helps the player who knows the word. The problem is the player who doesn't know what to look for. |
| 10-26's C: an Essentials / All settings switch per page | Each page opens on a quarter of its rows; a switch at the top shows all. | A mode the player has to remember, and a hidden changed setting is a support question. A fold per card (D1) keeps the count in view and needs no mode. |
| Fewer settings | Cut rows nobody asked for. | Nobody can say which, there is no telemetry, and every row was asked for by someone in a hunt or an issue. Folding keeps them without showing them. Cutting stays a per-row call in later polish, with the fold as the default home for a doubtful row. |
| Restructure around the player's task (adopted) | Essentials per tab; one switch per feature; names not sentences; one home per setting; the list by what you're doing; set up first. | Big if done at once. Phased in §7 so that no phase moves a setting that another phase renames, and so the fold is judged in game before the rest is built. |
| A separate "simple" window | A second, smaller options window over the same settings. | Two windows to keep in step, two to translate, two to test for text fit. The fold inside one window gives the simple view for free. |

## 5. Decision

Adopt the restructure as six rules, each with the smallest mechanism that holds it. D1 is the one that moves "overwhelming" the most (Raid frames from 22 rows to 7) and comes first; the rest are ordered by payoff over cost in §7.

### D1. Two depths on every card: essentials shown, the rest folded

**What it is.** This is 10-26's A inside the tabs Cliff chose: the tab and the card stay, and the fold sits under a card's essential rows, not around the card. A card shows its essential rows, then a fold line, a section header reading "More settings" with the count beside it as the quest tracker's header carries its count (`W.SectionHeader` with `collapsible` and `count`, the quest log's zone header; `L["More settings"]` and the number, no new idiom and no `ns.Format`), and the rest opens below it.

**The tier rule**, so that a reviewer can check it rather than taste it. A row is **essential** when it is

- the module's switch (D2),
- a setting that setup, a layout or a preset sets (so the window shows the player what the wizard chose), or
- the row that places, sizes, hides, replaces or lays out **the whole feature**: its Visibility and Show when, its width and height, its spot, Groups as, "Replace the default unit frames", "Vanguard's quest tracker under the info strip".

Every other row is **more**, and in particular **a part of a feature** is more: one block of the info strip, one raid mark, one icon slot, one chat channel, one window group, one tooltip line, a tuning number, a wording or colour variant, a mirror of the game's own setting, a list editor, a diagnostic. A text row takes the tier of the row above it, so a note stays under its setting. With that rule every tab but the Modules page's and a player's own class-buffs tab falls under the 8-row target; §9 is the worked example.

**The mark.** `essential = true` on the row table, the way `isReset` already is, so no row helper changes its signature. It marks about 90 rows rather than the 540 that `more = true` would, and a row nobody marked goes in the fold, so a tab stays short as settings are added; the module switch and the whole-feature rows are few and known, and the `add-setting` skill says to mark one.

**Mechanics**, so that it fits the window as it is:

- The card's rows are partitioned where cards are built (`groupRows`), never in the page's row list, so search, the "changed" list, Reset this page and the dots keep walking whole row lists and the fold costs them nothing.
- The fold line is a section header that is also a button, so the keyboard's Tab reaches it and Enter or Space toggles it as it does any button.
- `O.RevealRow` (a search hit, a What's new link, `OpenOptions`) unfolds before it checks the row is visible.
- A toggle sets the card's height again and refits the view. It snaps open and shut with no fade, as the quest log's zones do (nothing new for THEME.md's fades table).
- The fold line wears the accent dot while a folded row is changed from its default, so "where did X go" is answered where the player is looking.

**Memory.** The fold is remembered per card (the page key and the card's English title) while the game runs, as the tab is and as the quest log's folded zones are. A reload opens every card folded again, which a player following a guide meets after each reload step; the dot on the fold line and the search's unfolding answer that without a new saved-file table.

**Where it lives.** A new `Core/OptionsFold.lua` (listed in the TOC), not in `OptionsWindow.lua`, which holds 160 top-level locals against the scanner's 185.

### D2. One switch per feature, on its page

A module's switch moves to the top of its card on its area page, and the fourteen modules with an own switch inside lose it: the module switch is the switch. Which cards get one:

- **A card that is one module's** (its name is the module's: Chat filter, Chat history, Cast bars, Readouts, the meter, the roll tracker, each Town and gear card) gets the module's switch as its first row: a plain switch row (`check`) named as the Modules page names the module, with the module's description as its tip, not the Modules page's two-line module row, so the card's top doesn't repeat that page; it wears the "Reload to apply" tag where the module still builds at login.
- **The fourteen** (party pets and targets, group threat, officer loot, chat filter and history, the three Cooldown Manager extras, craft queue, mail tools, spell ranks, Legacy, fight history, the meter; twelve on Retail, where spell ranks and Legacy don't exist): the row that was the own switch becomes the module's switch, where it is; the module stays registered and loaded, as today when its own switch is off. Eleven of the own switches apply live today and keep doing so. Three are reload settings whose `Enable` returns early when off (party pets and targets, group threat, the gaps row: `PartyExtras.show`, `GroupThreat.show`, `CooldownGaps.on`): the default is to keep their reload tag; a build-on-first-switch path (party pets' secure tiles under `ns.OutOfCombat`, which it already uses; the gaps row's mover registered late, which `Movers` allows) is the engineer's call where the module's `Enable` splits cleanly. Two of the fourteen have two own switches (spell ranks: `barNotice` and `trainerMemory`; fight history: `strip` and `recap`): each gets one `on` key as the switch (migrated as either-on) and keeps the two as parts.
- **A card that mixes modules** (Raid frames → Raid frames holds RaidFrames, RaidAuras and RaidStatus; Unit frames → Unit frames holds UnitFrames and ClassBars; Game windows → Tooltips holds Tooltips, Inventory and VendorMemory) gets no switch for the modules whose rows are a few lines inside another module's card: their switch stays on Modules only, so a healer never flips "Raid debuffs and HoTs" among 22 rows thinking it is a setting. Where the mix is large enough to be its own card (RaidAuras' and RaidStatus' rows on Raid frames), the card is split by module first, within the page's tab budget (rule 5).

A module-switch row has no default (a module switch is not a setting with a reset dot today, and stays that way), so Reset this page never turns a module on or off and "changed" never lists one. The Modules page stays as the overview (what's on, what each module does, what it needs, the Other addons card), which the website also reads; its switches set the same key as the one on the page, the one allowed case of a setting in two places (rule 4), and both wear the same tag. `O.MODULE_LINKS` and the "On, but its own switch is off" note go.

**The migration** turns the direction round: today a module that is off on Modules wins over its own switch, so where a saved profile holds `modules[X] == false` for one of the fourteen, the switch key goes off and the Modules entry is cleared. It reads one table and writes another, which `ns.Migrate` (one table at a time) can't, so S3 adds a profile-wide step (`ns.MigrateProfile`) run where a profile enters: at load, after `migrate(payload)` in `ProfileStrings` for an imported string (a friend's 0.8 string, a "parts" string without the sibling table) and for an addon's preset string. The tests' scoped logins that switch a module off through `modules = { Meter = false }` change with it. This is the one phase that rewrites saved profiles, and so the plan's stability risk.

### D3. Captions are names; the explanation is the tip

The 113 control captions over 40 English characters are renamed to a name of at most 40, and the old caption becomes the row's tip, the same `L[]` string verbatim (`tip = L["Recap in chat after each fight (/vg recap)"]`), shown on hover and read by the search in both tongues as tips are today (`O.BothTongues` in `haystack`), so the ten machine drafts of the sentence survive the rename and a German guide written against 0.8 still finds the row by its old German words; a tip is reworded only where the old sentence doesn't explain the row. The `/vg` word a caption names stays in that tip. A renamed row also keeps its old English caption as a bare literal (`was = "..."`, no player text, so nothing for the unwrapped-text count), which the window's `captionHas` reads, so an older What's new note that jumps by caption still lands. Only the 113 new names are untranslated until the next i18n batch; S2 writes no `Locales/` file (`scripts/i18n.mjs status` reports them until then). `O.KEYWORDS` is keyed by the English caption, so a rename orphans its keywords silently: the S2 test asserts every key matches a live caption. A new row that breaks the length rule fails the test.

### D4. One home per setting, and no repeated cards

Calm HUD's switch leaves Unit frames (General → Calm HUD keeps it with its seven parts). Healing's seven class tabs become one "Class buffs" tab that opens on the player's class and folds the other six under D1; they fold rather than hide because the list is the buffs to watch for on the raid, any class's (a priest watching for a missing Blessing of Kings), not the buffs this character gives. The presets' buttons also appear on the first tab of General (D6), with the Profiles page keeping the list for addon presets.

Action bars' eight bar cards become one "Bars" tab with a Bar 1 to 8 choice at its top, the choice names keeping "right edge" where a bar has it. That is the one change here that needs a new contract in the window: a row's default is read once when the row is built (`defaultOf`), and the bars' defaults differ (bar 1 is on, bar 6 is off; the right-edge bars lay out differently), so a row under the picker needs its default, getter and setter to follow the picked bar: `defaultOf`, `rowChanged`, `defaultText` and `resetRows` accept a function as a default, and the search's hit line, which shows caption and page only, learns to name the bar ("Action bars → Bars → Bar 4, right edge") so eight hits of "Buttons per row" tell apart. The picker has a phase of its own (S5), since it moves 56 rows under one card while S1 moves none.

### D5. The list on the left by what the player is doing

The list gets four groups and three dividers instead of three groups and two: General and Modules; the on-screen pages (Unit frames, Raid frames, Nameplates, Action bars, Click casting, Combat tools, Map, Bars and bags, Chat); the pages for playing (Quests, Game windows, Town and gear); then Situations, Profiles and Feedback. The group names are this record's and are not drawn: a divider separates groups and nothing else, as DESIGN-PRINCIPLES §2.15 has it, so no new strings. One more divider costs one list row, which the list's row height already absorbs (`navStep`), and the text-fit test covers the list at Larger text on 1080p.

**Deferred, not decided: merging the three small pages.** Healing could join Raid frames, Talents could join Town and gear (as a Training tab, Forever only) and Cooldowns could join Combat tools, taking the list from 20 pages to 17 and rule 5 to the letter. It is the smallest payoff in this record for the largest churn: page keys are public (`Vanguard.OpenOptions`, `/vg cooldowns`, What's new's `page = "cooldowns"`, the unlock bar and the gaps row all call `O.Show` or `O.RebuildPage` with a key, and an unknown key shows a blank page, so aliases must live in `O.Show`); Healing and Talents are pages a module adds with `AddPage`, and as tabs they would come through `O.AddRows`, which only appends or prepends; the website reads only `PAGES` and `AddPage` tables, so its generator must learn `AddRows` rows, its page list and `/settings/#healing` anchors change, and every smoke step that names a page moves. The tab lists, with Retail where it differs, are kept here for the day it is wanted:

| Page | Tabs today | Tabs after, Forever | Retail |
|---|---|---|---|
| Raid frames | Raid frames · Preview | Raid frames · Debuffs and HoTs · Marks · Preview · Healing · Class buffs | the same |
| Town and gear | 11 (Auction house, Merchants, Errands, Craft queue, Mail tools, Spell ranks, Pet stable, Legacy, Instance prep, Gear upgrades, Data from the beta) | Auction house · Merchants and errands · Crafting and mail · Training · Instance prep · Gear upgrades; Data from the beta moves to Profiles → Your profiles beside Reset profile | five (no Training) |
| Combat tools | 5 | the five, plus Cooldown Manager (the Cooldowns page's four titled cards as one tab of 9 rows, its "Set up cooldowns" button the first row; the note on The game's tools reworded) | the same |
| Chat | 8 | Chat · Tabs and windows · Extras · Watch · Filter · History and group board | five (History alone; the group board is WoW Forever's) |

### D6. Set up first, tune second

General's first tab becomes **Start here**: **Run setup**, the three presets (Healer, Damage, Tank) as a button row, each button's tip the preset's own translated `info` sentence (what it sets, that it asks first and backs the profile up), nothing new to write, **Move frames**, and **What's new**. Look (which keeps the preview, since the preview shows Look's own controls changing), Bars, Motion and sound, Calm HUD and Layout follow as tabs. General opens on Start here while setup is owed (`Core/Setup.lua`'s own test, which covers the account and the character), then on the tab it showed last, as every page does; the window keeps opening on the page it showed last. Setup stays the recommended path and gains nothing; the window just stops hiding it under Layout.

## 6. Calls for Cliff [DECIDE]

| Call | What a player sees | What it costs | Alternative | Recommended |
|---|---|---|---|---|
| 1. The fold (D1) | Each tab opens on its essentials with "More settings · N" under them; Raid frames goes from 22 rows to 7. It is the folded cards you turned down on 10-26, moved under the tabs you kept. | S1 and S2: a new Core file, a test, one pass over every row; an in-game look at the fold | 10-26's C: an Essentials / All settings switch at the top of each page (a mode to remember) | **The fold.** One mechanism, no mode, the count stays in view. |
| 2. One switch (D2) | A module is switched on where its settings are, most without a reload; "On, but its own switch is off" is gone. | S3: a profile-wide migration that must also run on imported strings; the plan's stability risk | Keep both switches and only move the inner one to the top of its card (two places to be off stay) | **One switch.** The three reload cases keep their tag. |
| 3. The list (D5) | Four groups in the list on the left, pages where a player looks for them; twenty pages stay. | Part of S4, cheap | Also merge Healing, Talents and Cooldowns into the pages they belong with (17 pages): aliases, `AddRows` positions, a site PR, every smoke step that names a page | **Regroup, keep twenty pages.** The merge removes the least scrolling for the most churn; it is written up for later. |
| 4. Names now (D3) | 113 rows show a short name; the old sentence stays on hover in every language. | S2: 113 names in English for one release in ten languages, until the next i18n batch | Wait for the ten drafts and rename then | **Now.** A German player already sees English for untranslated text; prose captions hurt everyone every day. |
| 5. Start here (D6) | `/vg` opens on Run setup, the presets, Move frames and What's new while setup is owed; nothing else on General moves. | Part of S4; the site's three Troubleshooting answers that say "General → Layout → Run setup" are re-pointed | Leave General as it is; put Run setup and the presets in the header beside the profile picker | **Start here.** One primary per view; the header has no room at Larger text. |

## 7. Build order, cost and the stop rule

Five phases, one PR each, in this order so that nothing is renamed and moved in the same phase, the one pass that reads every row (its tier and its name) happens once, and the fold is judged in game before the rest is built. Each phase is a `work/settings-<n>` branch, lists where its controls are, gets one `code-review` pass before it is marked ready, and ends with the local gate. Sonnet, medium effort. CI: five addon PRs and, if call 3's alternative is ever taken, one site PR; none needs `full-tests`; the i18n batch that follows S2 is its own PR as every batch is.

**Stop rule.** S1 marks one page, Raid frames, so Cliff can open `/vg` on a healer and judge the fold on the window's longest tab (22 rows to 7). If that tab does not read as better in game, stop: S2 to S5 are not started, and the fold comes out in one revert. S5 depends on S1 only; S3 on S2 (the names settle before the switch rows are named); S4 on S3 (the Modules page's notes change with it).

| Phase | Builds | Moves a setting? | Touches (rough size) | Docs | Site | Needs in game |
|---|---|---|---|---|---|---|
| S1 fold | D1's mechanism, Raid frames marked as the sample; the harness test `scripts/tests/options-budget.test.mjs` (rows shown per tab ≤ 8 with a baseline that starts at today's 22 tabs less Raid frames and only shrinks, no two rows on one key, caption length with its own baseline, tabs per page) and the inventory script; D4's Calm HUD dedupe | No | New `Core/OptionsFold.lua` and its TOC line, `OptionsWindow.lua` (`groupRows`, `buildCard`, `RevealRow`), `OptionsSearch.lua`, `OptionsFrames.lua` (the marks), the test (about 500 lines) | `docs/features/options-and-setup.md` Options (the fold, the dot on it); `docs/THEME.md` (`W.SectionHeader`'s users); `docs/SMOKE-TEST.md` (a fold step); `docs/DEVELOPMENT.md` (the inventory script) | Nothing (no caption or key changes) | The fold on Raid frames at Larger text and in German; keyboard Tab onto a fold line. **Cliff's go or stop.** |
| S2 tiers and names | `essential` marks on the rest of the rows by D1's rule and D3's 113 renames with their tips and `was`, in one read of the rows; the keywords test; the i18n export for the next drafts | No | Every `Core/Options*.lua` and module options file, `OptionsSearch.lua` (`captionHas`), `Core/Slash.lua`'s help string (about 800 lines of edits across many files; no `Locales/` file) | The feature pages' sentences that quote a renamed caption; `docs/COMMANDS.md` lines that quote one; `docs/SMOKE-TEST.md` steps that quote one | `extract.mjs` learns `row.tip` and `essential`, else the Settings page loses every explanation; Troubleshooting answers that quote a caption are re-read | Tips on hover; search finds the old words; the baseline shrinks to the Modules tabs and the class tab |
| S3 one switch | D2: the module switch row on its page, the fourteen own switches gone, the `on` keys for the two two-key modules, the tag kept on the three reload ones, `ns.MigrateProfile` run at load, on import and on a preset | The 14 keys (migrated) | `Core/Modules.lua`, `Core/DB.lua`, `Core/ProfileStrings.lua`, `Core/Options.lua` (MODULE_LINKS goes), the fourteen modules, the Modules page, the tests' scoped logins (about 400 lines) | `options-and-setup.md` Options (the "On, but its own switch is off" sentence goes; "every module's switch wears Reload to apply" narrows); each of the fourteen's feature-page sentence ("off until you switch it on (Chat)"); `docs/SMOKE-TEST.md` 2.1f and the fourteen's steps; `docs/API.md` if a preset string names a key | `extractModuleLinks` goes; the Modules page's "own switch" notes | A module switched on without a reload; the Modules overview; an imported 0.8 string with a module off |
| S4 list and Start here | D5's groups and D6 | No | `Core/Options.lua` (PAGES order, generalRows), `OptionsWindow` list, `Core/Setup.lua` (setup owed, read) (about 200 lines) | `options-and-setup.md` Options (the page list, "Run setup under General → Layout", "What's new under General → Layout"); `docs/SMOKE-TEST.md` steps that say General → Layout | `help-content.mjs`'s three answers that quote "General → Layout → Run setup" are re-pointed first (the site drops an answer whose quote it can't find) | The list at 1080p and Larger text; Start here on a fresh character and after setup |
| S5 bar picker | D4's one Bars tab with the Bar 1 to 8 choice and the default-as-function contract | 56 rows under one card (keys unchanged) | `OptionsBars.lua`, `OptionsWindow.lua` (`defaultOf`, `rowChanged`, `defaultText`, `resetRows`), `OptionsSearch.lua` (the hit line) (about 250 lines) | `docs/features/action-bars.md` (the per-bar sentence); `docs/SMOKE-TEST.md` (the bar steps) | `applyDefaults` reads literal defaults only, so the Default cell of 56 rows and the "rows repeat for each bar" heading need the generator to read a per-bar default | The choice; the dot per bar; "changed" naming the bar |

**Success measure.** The budget test's baseline goes from 22 tabs to the Modules tabs and one class tab; and Cliff's own test, "open `/vg` on a fresh healer and find Groups as in under ten seconds".

**What changes for players:** `/vg` opens on Start here; each tab shows a short list with a fold under it; a module is switched on where its settings are, eleven of the fourteen without a reload; names, not sentences; one Bars tab; pages grouped by what you're doing. **What stays:** every setting, every key, every `/vg` word, every deep link, every page, the search, the dots, the reset.

**What it costs:** 113 captions in English for one release in ten languages; one read of every row to mark its tier and name it (the rule makes it mechanical; the test holds it); the website's Settings page regenerates from the new captions and tiers (the site reads the addon at build time, so it needs no hand edits, but its generator must learn `row.tip`, `essential` and, in S5, a per-bar default); a profile-wide migration for the fourteen inner switches; and a new Core file, since `OptionsWindow.lua` holds 160 top-level locals and `Options.lua` 71 against the scanner's 185.

**What it does not do:** cut any setting; change the theme or the controls (UI-COHERENCE owns those); merge pages (call 3's alternative, deferred); touch the reload mechanism. Two follow-ups belong to other records: the 70 reload settings, each a per-module candidate for applying live, and the six surfaces that configure one profile, where only the window shows what changed.

## 8. Review record

Four design-review waves, each a fresh reviewer with one lens, run before this record was sent; the record was revised after each.

1. **Player lens** (a first-week player, a healer with a guide open). Found: the tier rule's third clause marked a part of a feature (one strip block, one raid mark) essential, so Raid frames would have shown 20 rows, not 7; D2 said nothing about cards that mix modules; the page merges' Training tab was empty on Retail and lost "Data from the beta"; a renamed caption and a folded card broke a guide-follower twice; the migration had to cover imported strings. Changed: the whole-feature versus part-of-feature rule, D2's three card cases, the Retail tab lists, old captions kept for the search, migration on import stated, the preview kept on Look, Click casting in the on-screen group, the presets' description.
2. **Engineering lens** (CLAUDE.md's hard rules, the harness, the local limit, taint, Retail). Found: the local counts were wrong (160 and 71, not 32 and 15); the migration could not be written with `ns.Migrate` and ran the wrong way; three of the fourteen own switches are reload settings whose module builds nothing when off; two modules have two own switches; a module-switch row must have no default; the bar picker needs a default-as-function contract and moved 56 rows inside "S1 moves nothing"; page aliases had to live in `O.Show`; `AddRows` can't place a tab; the website reads no `AddRows` rows. Changed: a new `Core/OptionsFold.lua`; `ns.MigrateProfile` at load, import and preset; the three reload modules and the two two-key modules named with their handling; no default on a module switch; the picker as its own S5 with its contract; the merge's real cost written down; tiers and names in one pass; the fold's partition, keyboard and reveal mechanics spelled out.
3. **Consistency lens** (UI-COHERENCE, DESIGN-PRINCIPLES, text fit in ten languages, the website's generators). Found: the list's group and divider counts were wrong and the group names read as drawn; the fold memory cited a precedent that is session-only; the preset names were setup's layout names and their one-liner duplicated the presets' own translated `info`; old captions were kept in English only, so nine languages lost their guide words; "More settings · N" was a third count idiom; Retail was missing from the Chat tabs and the count of fourteen; the phase table named almost no docs or website work. Changed: the group and divider counts, names not drawn; the fold remembered for the session, answered across reloads by its dot; presets Healer, Damage, Tank with their `info` as tip; the old caption kept as the row's tip verbatim so its drafts survive; the quest tracker's count idiom; Retail columns; a Docs and a Site cell on every phase.
4. **Decision lens** (one reading by Cliff; is each call a real fork). Found: D1 never said it was 10-26's A inside B; S1 built the fold with nothing a player sees and no stop rule; "which 30 matter" was unsupported; several numbers disagreed with the script (Healing 35 rows, not 44; 113 captions over 40 characters, not 75 over 60; ten languages); Modules broke rule 5 with no exemption; the cost understated usage (three review waves per PR against CLAUDE.md's one) and S2's size; §6 could not be read alone; the page merges cost the most for the least. Changed: D1's first line and call 1 name the 10-26 options; S1 marks Raid frames as the sample with a stop rule and the phases' dependencies; the problem line and the numbers follow the script; rule 5 exempts Modules; one `code-review` pass per PR and S2 at about 800 lines; §6 as a table of what a player sees, what it costs, the alternative and the recommendation; the merges deferred to call 3's alternative; `essential` on about 90 rows instead of `more` on 540; a success measure; the long paragraphs split.

## 9. Appendix: the tabs over the 8-row target today

Rows shown when the tab opens (Forever, today's tabs). The expected essentials are an estimate under D1's rule, read from the captions, and will be set row by row (Raid frames in S1, the rest in S2); the rule's test is that a reviewer reading the caption reaches the same tier.

| Page → tab | Rows | Expected essentials (the rows) |
|---|---|---|
| Raid frames → Raid frames | 22 | 7: the module switch, Groups as, Stack big raids, Style, Width, Height, Sort (preset keys); the marks, icon slots, fade and ready-check rows are parts |
| General → Look | 19 | 6: Safer colours, Font, Text size, Theme variant, Corners, Pixel-perfect (setup keys); the rest are variants |
| Nameplates → Nameplates | 17 | 5: the switch, Show levels, threat colours, the two preset keys; the rest are parts |
| Map → Strip under the minimap | 16 | 2: Strip visibility, Show when; 14 blocks are parts |
| Chat → Chat tabs | 15 | 4: the Tab choice and its three buttons; 10 channel switches are parts |
| Modules → Town and gear | 15 | 15: module switches; the overview stays long by design |
| General → Layout | 14 | 3 after D6 takes Run setup, Move frames and What's new: Frame to size, Its scale, Reset all positions |
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
