# ADR: Settings that don't overwhelm

An architecture decision record for the options window (`/vg`) and the other places a player configures Vanguard. Written 2026-11-05 against `main` at `c997aca` (0.8.0 plus the retail build and the twenty bug hunts), from a spike measured in the headless harness (`node scripts/options-inventory.mjs` reproduces every number below). Nothing in it was checked in a game client.

- **Status:** Proposed. Five calls are open for Cliff ([DECIDE] in §6). Nothing here is built.
- **Deciders:** Cliff. Reviewed in four design-review waves before it was sent (§8).
- **Supersedes:** the "C: essentials first" option of the 2026-10-26 options review (the tabs it chose, PR #690, stay). Builds on [UI-COHERENCE.md](UI-COHERENCE.md) and [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) and changes none of their decisions.

## 1. The problem in one line

A player who opens `/vg` to "set Vanguard up" meets 632 rows on 20 pages with no sign of which 30 matter, three different places a feature can be off, captions that read as sentences, and the same setting in more than one place.

## 2. What the spike measured

The window on WoW Forever, logged in with every module on, one row per control (a card title is no row):

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

Every row gets a tier, and a card shows its essential rows then a fold line, "More settings · N", that opens the rest below it (the quest log's collapsible section header, `W.SectionHeader` with `collapsible`, already draws one). The fold is remembered per card while the game runs, like the tab. The fold line wears the accent dot while a folded row is changed from its default. A search hit, a What's new link, `OpenOptions` and the keyboard open the fold on their way to the row. Reset this page covers both depths.

The tier is a rule, not taste, so a reviewer can check it. A row is **essential** when it is

- the module's switch (D2),
- something setup, a layout or a preset sets (so the window shows the player what the wizard chose), or
- something that adds, removes, moves or resizes a thing on screen (a visibility choice, a placement, a size, a frame's replacement).

Every other row is **more**: a tuning number, a wording or colour variant, a mirror of the game's own setting, a list editor, a per-channel switch, a diagnostic. Marked as `more = true` on the row table, the way `isReset` already is, so no row helper changes its signature. With that rule 22 tabs fall under the 8-row target; the harness test (§7) lists the rest as a baseline that only shrinks, like `textfit-baseline.json`.

### D2. One switch per feature, on its page

A module's switch moves to the top of its card on its area page (the first row of Chat → Chat filter is "Chat filter", with the "Reload to apply" tag where a reload is still needed), and the fourteen modules with an own switch inside lose it: the module switch is the switch. Those fourteen do nothing until switched on, so they stay registered and load as every other module does, and their switch applies live, as their own switch did. The Modules page stays as the overview (what's on, what each module does, what it needs, the Other addons card), which the website also reads; its switches set the same key as the one on the page, the one allowed case of a setting in two places (rule 4).

### D3. Captions are names; the explanation is the tip

The 75 long captions are renamed to a name of at most 40 English characters, and their sentence moves to `row.tip` (shown on hover and found by the search, which already reads tips) or, when the row can't be understood without it, to a note. The `/vg` word a caption names moves to the tip too. A new row that breaks the rule fails the test. Translations: a renamed caption shows in English until the next `scripts/i18n.mjs import` carries its draft, which the addon already allows ("any text without a translation shows in English").

### D4. One home per setting, and no repeated cards

Calm HUD's switch leaves Unit frames (General → Calm HUD keeps it with its seven parts). Action bars' eight bar cards become one "Bars" tab with a Bar 1 to 8 choice at its top (the row helpers take the bar from that choice; a per-bar changed dot shows on the choice). Healing's seven class tabs become one "Class buffs" tab that opens on the player's class and folds the other six under D1. The presets' buttons also appear on the first tab of General (D6), with the Profiles page keeping the list for addon presets.

### D5. Pages by what the player is doing

Three pages fold into kin pages as tabs: Healing into Raid frames (Raid frames · Preview · Healing · Class buffs), Talents into Town and gear (as the Training tab with Spell ranks, Pet stable and Legacy), Cooldowns into Combat tools (its four cards as one Cooldown Manager tab, 9 rows). Town and gear's eleven tabs become six (Auction house · Merchants and errands · Crafting and mail · Training · Instance prep · Gear upgrades), Chat's eight become six (Chat · Tabs and windows · Extras · Watch · Filter · History and group board). The list on the left gets three dividers instead of one: **Start** (General, Modules), **On screen** (Unit frames, Raid frames, Nameplates, Action bars, Combat tools, Map, Bars and bags, Chat), **Playing** (Quests, Game windows, Town and gear, Click casting), **Yours** (Situations, Profiles, Feedback). Old page keys (`healing`, `talents`, `cooldowns`) stay as aliases in `OpenOptions`, `/vg` and What's new, opening the kin page on the right tab, so no link or guide breaks.

### D6. Set up first, tune second

General's first tab becomes **Start here**: the preview, then **Run setup**, the three role presets (Healer, Damage and tanking, Tank) with one line each on what they set, **Move frames**, and **What's new**. Look, Bars, Motion and sound, Calm HUD and Layout follow as tabs. Setup stays the recommended path and gains nothing; the window just stops hiding it under Layout.

## 6. Calls for Cliff [DECIDE]

1. **D1's fold versus B's page switch.** Recommended: the fold. One mechanism, no mode, the count stays in view.
2. **D2: the fourteen inner switches go, and their modules always load.** Recommended: yes. They cost nothing until switched on (the module's own switch today). The alternative keeps the Modules switch and the inner switch and only moves the latter up, which leaves two places to be off.
3. **D5's three page merges and the four-group list.** Recommended: yes, with the key aliases. Alternative: keep the twenty pages and only regroup the list.
4. **D3 now, in English, with translations following in the next i18n batch;** or wait and rename captions only with their ten drafts in hand. Recommended: now. 75 rows in English for one release is the cost; a window that reads as prose is the cost of waiting.
5. **D6's Start here tab.** Recommended: yes. Alternative: leave General as it is and put Run setup and the presets in the header beside the profile picker.

## 7. Consequences and the build order

Four phases, one PR each, in this order so that nothing is renamed and moved in the same phase. Each phase is a `work/settings-<n>` branch, lists where its controls are, and ends with the local gate. Sonnet, medium effort, three adversarial waves unless usage is close.

| Phase | Builds | Moves a setting? | Touches | Needs in game |
|---|---|---|---|---|
| S1 fold and tiers | D1; the `more` marks on every row by the rule; the harness test `scripts/tests/options-budget.test.mjs` (rows shown per tab ≤ 8 with a shrinking baseline, no duplicate keys, caption length, tabs per page) and the inventory script; D4's Calm HUD dedupe and bar picker | No (the bar picker keeps the keys) | `Core/OptionsWindow.lua` (one new row kind and the fold; it has room: 32 top-level locals), every `Core/Options*.lua` for the marks, `docs/features/options-and-setup.md`, SMOKE-TEST | The fold's look at Larger text and in German; the bar choice; keyboard Tab through a fold |
| S2 names | D3: 75 captions renamed, tips written, `OptionsSearch` keywords checked; the i18n export for the drafts | No | `Core/Options*.lua`, module options files, `Locales/` via import, WhatsNewNotes rows that name a caption | Tips on hover; search finds the old words (keywords) |
| S3 one switch | D2: the module switch row on its page, the fourteen own switches gone with a migration that turns the module on where the own switch was on, `ns.Module` building those fourteen live | The 14 keys (migrated) | `Core/Modules.lua`, `Core/Options.lua` (MODULE_LINKS goes), the fourteen modules, Modules page | A module switched on without a reload; the Modules overview |
| S4 pages | D5 and D6; the aliases; the nav groups | Yes (page keys) | `Core/Options.lua` PAGES, `OptionsWindow` nav, `Slash`, `WhatsNewNotes`, `API.md`, the website's generators read page keys | The list on the left at 1080p and Larger text; every What's new link |

What changes for players: the window opens on Start here; each tab shows a short list with a fold under it; a module is switched on where its settings are and most switch on without a reload; names, not sentences; three fewer pages. What stays: every setting, every key, every `/vg` word, every deep link, the search, the dots, the reset.

What it costs: 75 captions in English for one release in nine languages; a one-time read of every row to mark its tier (the rule makes it mechanical; the test holds it); the website's Settings page regenerates from the new captions and tiers (the site reads the addon at build time, so it needs no hand edits, but its generator must learn `more` and the aliases); and a migration for the fourteen inner switches. The Lua top-level local limit is not at risk: `OptionsWindow.lua` holds 32 and `Options.lua` 15.

What it does not do: cut any setting (C), change the theme or the controls (UI-COHERENCE owns those), or touch the reload mechanism. A follow-up, after S3, is the list of the 70 reload settings with a per-row note on which could apply live; that is a per-module job, not a window job.

## 8. Review record

Four design-review waves, each a fresh reviewer with one lens, run before this record was sent; the record was revised after each. The lens and what changed:

1. Player lens (a first-week player, a healer with a guide open): pending.
2. Engineering lens (CLAUDE.md's hard rules, the harness, the local limit, taint, Retail): pending.
3. Consistency lens (UI-COHERENCE, DESIGN-PRINCIPLES, text fit in ten languages, the website's generators): pending.
4. Decision lens (is each [DECIDE] a real fork, is the recommendation defended, could Cliff act on this in one reading): pending.

## 9. Appendix: the tabs over the 8-row target today

Rows shown when the tab opens (Forever). The tier rule's expected essentials are an estimate from the captions and will be set row by row in S1.

| Page → tab | Rows | Expected essentials |
|---|---|---|
| Raid frames → Raid frames | 22 | 7 |
| General → Look | 19 | 6 |
| Nameplates → Nameplates | 17 | 6 |
| Map → Strip under the minimap | 16 | 2 (visibility, Show when) |
| Chat → Chat tabs | 15 | 4 (the tab choice and its three buttons) |
| Modules → Town and gear | 15 | 15 (module switches; the overview stays long) |
| General → Layout | 14 | 5 |
| Modules → Unit frames | 14 | 14 |
| Unit frames → Unit frames | 13 | 7 |
| Game windows → Game windows | 13 | 3 |
| Chat → Chat filter | 13 | 1 (the switch; the rest is the filter's lists) |
| Chat → Chat watch | 12 | 2 |
| Healing → Paladin | 12 | 0 for another class, 12 for a paladin |
| Town and gear → Auction house | 11 | 2 |
| Combat tools → Vanguard meter | 10 | 3 |
| Game windows → Tooltips | 10 | 1 |
| Town and gear → Instance prep | 10 | 2 |
| Action bars → Action bars, Your keys; Chat → Chat, Group board; General → Calm HUD; Combat tools → The game's tools; Quests → Finding your way; Map → Minimap and waypoints; Town and gear → Gear upgrades; Modules → Quests, Game windows, Combat tools | 8 to 9 | at or under 8, except the Modules tabs |
