# Design: UI coherence plan (one interface, not an assembly)

Written 2026-10-17 against `main` at `8e249a4` (0.6.0 plus PRs #390 to #392) for Cliff's full UI/UX review. It turns the review's three research notes into one target, one build order and one list of questions. The phases are Phases 8.1 to 8.11 in `.planning/ROADMAP.md` (requirements UI-07 to UI-14 in `.planning/REQUIREMENTS.md`); this file is what they build to. Research, not observation: nothing here was seen in a Forever client, and every look it describes goes on the in-game list that Phase 8.11 assembles.

The research it draws on: [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) (PR #394: twelve principles, a target spec for twenty-one elements, a ranked list and twelve open questions) and two notes in the project's shared folder, `research/ui-ux-review/blizzard-frame-coverage.md` (301 Blizzard addons load on Forever and define 709 top-level frames, 241 of which Vanguard touches; the gaps ranked by how often a player sees them; what should stay Blizzard's) and `research/ui-ux-review/vanguard-ui-audit.md` (the widget inventory and seventeen inconsistencies with `file:line` evidence). Where this file and DESIGN-PRINCIPLES.md give a different number, this file wins: it also carries the decisions the threads already building have taken. Every `file:line` is as of `8e249a4`; grep the identifier next to it if a line has moved.

## 1. What a stranger sees today, and after

A public post called Vanguard "mis-matching textures and fonts" and "an ElvUI copy". The research agrees with the first half and explains it: a stranger is not reacting to one ugly control but to seams, and the seams are these.

| Today (shot number from the walkthrough set, or `file:line`) | After | Closed by |
|---|---|---|
| Two yellows. Brass (`accent`) marks the current nav item, the switch and the logo, while most skinned game windows title in the game's gold (`Modules/Windows.lua:194` keeps the game's colour; shots 10, 13, 14, 19, 29) and so do the quest log's zone headers. | Gold means content: money, quest titles and "!" marks, elite names, the leader's crown, prices. Every window title, Vanguard's or the game's, is the `title` role in `text`. | consistency PR (titles, zone headers), coverage batch 2 (the gold heads in game windows), 8.6 (the check) |
| "Selected" is said six ways: rail plus accent wash (options nav), an accent bar on the tab, an accent fill (segments), accent text plus a check (menus), the game's gold rim (character side tabs), rail plus accent text (AH lists). | Three ways: a filled accent capsule for choose-one-of-few, a rail for navigation and lists, the current tab attached to its page. Nothing else marks "current". | #393 (the bar is gone), 8.5 |
| Half-skinned windows: parchment in the inbox (shot 19), painted talent backdrops (shot 13), the bronze stats list and gold-rimmed side tab in the character pane (shot 12), red "can't use" row plates in the merchant (shot 14), the game's gold-rimmed check boxes (`Modules/WindowsSocial.lua:511`), Blizzard's round chat buttons beside the flat chat panel, Blizzard's loot rows, toasts, chat bubbles and waypoint pin. | One material per window: inside a Vanguard panel every inner surface is `inset`, `raised` or `panel`, every control is a theme primitive, and game art stays only where it is the content (portraits, icons, the map, the talent tree's spells). Every frame a player sees all the time is Vanguard's. | coverage batches 1 to 3, 8.2, 8.3 |
| Controls on no grid: dropdown 180x22, buttons 24, an 8 px slider track under an 18 px switch, segments in 10 px text beside 12 px captions; window padding anywhere from 4 to 16. | One scale: rows 28, inline controls 20, standalone buttons 26, a 200-wide control column, one label size, padding from `T.SPACE`. | consistency PR (the constants), 8.1, 8.4, 8.9 |
| Five scroll bar looks, four dialogs with the game's own scroll art, quest panes with no sign that they scroll. | One 4 px thumb everywhere, the soft edge fades kept. | consistency PR |
| Hover is a fill on buttons but a wash on rows; press recolours the switch but darkens buttons; only the options window shows keyboard focus; a menu closes only from its own button. | One state matrix: one hover per surface kind, one press, one disabled, one focus ring; Escape and a click outside close a menu. | 8.5, 8.7 |
| Seven title styles, five section-header styles, dialogs where Reload and Later look the same, "Nothing to show" in an empty meter. | One title helper, one header style, one primary per view, destructive never brass, empty states that say what fills them. | consistency PR, 8.6, 8.8 |
| The website's walkthrough shots 01 to 07a still show the pre-0.6.0 Cinzel-heading default. | Retaken from the launch build once these phases land (a task in `wow-vanguard-ui-site`, not a phase here). | after 8.11 |

The second half of the post ("an ElvUI copy") reads as "another dark pixel-border suite". The earlier research found no shared code, names or art; what answers it is an identity made consistent: the brass sheen and bevel, the crest, the attached tab, the pill controls, the copy tone. No other suite has those, so they are what this plan makes uniform first.

## 2. The target, in one page

DESIGN-PRINCIPLES.md §2 holds the element-by-element geometry. This section is the set of rules every phase builds to, with the names the code uses; §3 lists the names that do not exist yet.

### 2.1 One selection grammar

| Case | Look | Where |
|---|---|---|
| Choose one of few | `accent` fill, `void` text or knob | segments, the switch when on, a radio dot, the primary button |
| Navigate | a 2 px `accent` rail on the row's left plus a `raisedHover` fill; text and icon unchanged in `text`; never an accent wash | options nav, AH lists, quest log and quest dialog lines, group board, any list row ([DECIDE] 4) |
| Current tab | the attached tab: it takes its page's fill and has no border on the side that touches the page; unselected tabs are `inset` with `text2` labels, pulled 1 px off the page; no accent anywhere on a tab | `T.Tab` on all three game tab templates and Vanguard's own tabs ([DECIDE] 3) |
| Many of many | the mark carries the accent, the box stays `inset` | check boxes ([DECIDE] 8) |
| Current item in a menu | `accentText` plus the `Check` glyph at right 8 (a menu has no fill to carry it) | dropdown menus |

### 2.2 One yellow

`gold` is content, never chrome: money, quest titles and "!" marks, elite names, the leader's crown, AH prices. It leaves the skinned windows' titles (`Modules/Windows.lua:194`), `GW.CREATION_HEADS` (`Modules/WindowsSocial.lua:444`), `GW.QUEST_HEADS` (`Modules/Windows.lua:316`), the report-cheating heading (`Modules/WindowsSystem.lua:43`), the map header glyph (`Modules/WindowsMap.lua:210`), `GW.ITEM_TEXT_TAGS` H1 to H3 (`Modules/Windows.lua:62`) and the quest log's zone headers (`Modules/QuestLogView.lua:118`). The accent is the only chrome hue; state colours (`good`, `warn`, `bad`) and the game's colours (class, quality, reaction) mark content. One exception stays: the close button's `bad` tile on hover. Rule for authors: a view with more than two accent fills at rest demotes the least important to `text2` or `borderHi`.

### 2.3 One material per window

| Tier | Fill | Border | Sheen | Bevel | Shadow | Used for |
|---|---|---|---|---|---|---|
| Window | `panel` | `edge` | yes | no | when it floats | the options window, dialogs, skinned game windows, bags, tooltips |
| Card | `raised` | `edge` | yes | yes | only when it floats (popovers, the dropdown menu) | cards inside a window, popovers, menus |
| Control | `inset` | `edge` | buttons and edit boxes only | buttons only | no | buttons, edit boxes, switch and slider tracks, segment groups |
| HUD | `panel` (`T.HudPanel`) | `edge` | no | no | with `hudShadow` | unit frames, bars, minimap, tracker |

A window holds cards, a card holds controls, a control holds no surface; never an `inset` inside an `inset`. Opacity comes in named tiers (`T.ALPHA`), not numbers: `opaque` 1 for the options window, the quest log and skinned game windows, `dialog` 0.98 for dialogs, the setup wizard, What's new and anything with an edit box, `overlay` 0.94 for tooltips and floating cards, `alert` 0.92 for alerts. Inside a skinned game window every inner surface (rows, slots, pages, money frames, inner buttons) is painted to this table, and game art survives only where it is the content.

### 2.4 One control grid

| Thing | Size |
|---|---|
| Option row | 28 (`W.ROW_HEIGHT`, unchanged) |
| Inline control (switch track, dropdown, segment group, edit box, slider thumb area) | 20 high (`T.CONTROL_H`) |
| Standalone button (dialogs, card button rows, quest dialog) | 26 high (`T.BUTTON_H`), min width 80, label padding 16 |
| List row | 24; nav rows 28 |
| Table header row | 20, `small` `text2`, sentence case |
| Control column | 200 wide, right inset 8 (`W.COLUMN`); slider track 132, gap 8, value slot 60 (`W.VALUE_SLOT`) |
| Switch | 36x18 pill with a 14 px knob and a 2 px inset, as merged in PR #393 and approved in game on 2026-10-17; centred in the 20 px slot; no size change between states |
| Slider | 8 px capsule track with a 1 px outline and a 12 px solid `white` thumb with a shade and a dark 1 px outline, as PR #395 draws them, centred in the 20 px slot; the fill colour is [DECIDE] 5 |
| Check box | 16, 1 px `edge`, 12 px `Check` glyph |
| Badge | a capsule 14 high and at least 14 wide, `accent` fill, `void` text in `badge`, at most three characters (`99+`) |
| Radii | 0 (square, the default), 4 (`T.CORNER_RADIUS`, the rounded toggle; edit boxes, check boxes and segment groups join `ROUNDED_KINDS`), full (pills, discs, thumbs, badges: a shape, so not part of the toggle) |
| Spacing | `T.SPACE = { tight = 4, gap = 8, col = 12, pad = 16, section = 24 }`; 2 only between repeated cells of one control |

Every layout holds at Text size 130 % with a long caption: captions wrap left of the control, values keep a fixed slot, anything that cannot wrap truncates with the font's ellipsis. Button kinds share one shape: secondary (`inset` plus bevel, `text` label), primary (`accent` fill with no bevel line through it, `void` SemiBold label, hover eases to `accentText`; one per view), danger (a secondary with a `bad` label; never a red fill), icon (a 20x20 `raised` tile).

### 2.5 One state matrix

| State | Opaque control | See-through row | Text |
|---|---|---|---|
| Rest | `inset`, `edge`, bevel | nothing | the role's colour |
| Hover | ease to `raisedHover` plus a `borderHi` top line (`T.EaseHover`, 0.1 s in, 0.13 s out) | `hover` wash (white 8 %), instant | unchanged: text never recolours on hover |
| Pressed | `shade` 30 % plus the label down 1 px | `shade` 20 % | unchanged |
| Selected | per §2.1 | per §2.1 | `accentText` only where no fill carries it |
| Disabled | no hover or press, text and icons `disabled` at full alpha (never fade a whole bordered control) | the same | `disabled` |
| Focus | `T.FocusRing`; an edit box instead turns its border `accentText` while it has focus | the same | |

The controls with a moving part keep this vocabulary on their own geometry: the switch's knob brightens on hover and drops 1 px on press while the track never changes (today's `accentDim` press fill goes); the slider thumb gets a 20 px `hover` wash disc on hover, 12 % while dragging. The window controls' hover tile becomes `raisedHover` so only close keeps a coloured tile ([DECIDE] 12). States are layers over an unchanged base, so they stack; only press moves anything, and only by one pixel. Escape closes every Vanguard window, dialog and menu; a click outside closes a menu.

### 2.6 One type pairing per place

| Place | Role | Colour |
|---|---|---|
| Window title | `title` (15 SemiBold) | `text` |
| Section header | `small`, upper-cased by a role flag, not by `:upper()` on the string | `muted` ([DECIDE] 6) |
| Column header | `small`, sentence case; the sorted column adds a 10 px arrow in `accentText`, its title stays | `text2` |
| Caption | `label` | `text` |
| Value | `number` | `text2` unless it carries meaning |
| Hint, note, empty state | `small` or `label` | `muted` |
| Placeholder | `label` | `disabled` |
| Badge | `badge` | `void` on `accent` |

Captions are names (`Corners`, `Window ornaments`); the explanation and "(reload)" go in the row's note. Sentence case everywhere but section headers. A space before a unit (`105 %`). Buttons are verbs. Close for windows, Cancel when there is a primary, Done only for a form.

### 2.7 Motion and alignment

Hover 0.1 s in and 0.13 s out, a window opens in 0.13 s with the 4 px rise and closes in 0.1 s, 0.15 s is the cap in combat, and Reduce motion makes all of it instant. Menus and tooltips never animate. Dialogs open with `T.OpenWindow` like every other window. A knob or thumb may ease 0.1 s out of combat ([DECIDE] 7). Footer buttons: the primary rightmost at the window's padding (`T.SPACE.pad`, 16), the secondary 8 to its left, an escape or destructive action (Skip, Abandon, Goodbye) alone at the far left ([DECIDE] 10). Seven windows today put the footer at 12 (`Core/Dialog.lua:62-64` and its siblings) and the setup wizard at 16; the plan takes 16, the window padding THEME.md already prescribes, and moves the seven in the spacing sweep (Phase 8.9).

## 3. New names the phases add

| Name | Kind | File | Value | Who |
|---|---|---|---|---|
| `T.CONTROL_H`, `T.BUTTON_H`, `T.ROW`, `T.SPACE`, `T.ALPHA`, `T.SCROLL`, `T.CREST`, `T.ROLES.zone` | constants | `Core/Theme.lua` | 20; 26; `{ height = 28, rail = 2, wash = 0.12 }`; `{ tight = 4, gap = 8, col = 12, pad = 16, section = 24 }`; `{ opaque = 1, dialog = 0.98, overlay = 0.94, alert = 0.92 }`; `{ thumb = 4, rest = 0.5, lit = 1 }`; the crest sizes; a 13 px bold zone role that never takes the display font | consistency PR (on its branch) |
| `ns.WindowTitle(frame, text, opts)`, `W.Row` with `SetSelected`, `W.SectionHeader(parent, text, opts)` | helpers | `Core/Chrome.lua` (new) and `Core/Widgets.lua` | every window title (`opts.align` keeps each window's alignment until [DECIDE] 1); the one place a selected row is drawn (rail plus wash today; [DECIDE] 4 flips it there); one header style with `collapsible` for the quest log and tracker | consistency PR |
| `T.Capsule(frame, height, tier)` | primitive | `Core/Theme.lua` | #393's local `pillParts` and `placePill` moved into the theme and generalised (any height, any tier, a 1 px edge) | 8.1 |
| capsule media | media | `scripts/lib/media-sources.mjs` | #393's `Pill`, `PillLine`, `Knob`, `KnobShade` re-checked so the baked outline lands on one screen pixel at 18, 14 and 12 px, re-baked where it does not; `Disc20Soft` for the slider thumb's hover wash; an `Up` glyph for the sort arrow; white RGB under alpha; a `media.test.mjs` case | 8.1 |
| `T.CheckBox(button)` | primitive, exported by `Core/Skin.lua` | `Core/Theme.lua` | a 16 box with the `Check` glyph that follows `SetChecked` by post-hook; the game's parts faded, never hidden | 8.2 |
| `W.COLUMN`, `W.VALUE_SLOT` | constants | `Core/Controls.lua` | 200 and 60, replacing the literals 180, 140, 52 and −66 | 8.4 |
| `opts.primary`, `opts.danger` on `T.Button` | options | `Core/Theme.lua` | accent fill and `void` label with no bevel showing through; `bad` label | 8.4 |
| `opts.open` on `T.Panel` | option | `Core/Theme.lua` | `"TOP"`, `"BOTTOM"`, `"LEFT"` or `"RIGHT"`: that edge draws no line and no sheen | 8.5 |
| `T.PressRow` | helper | `Core/Theme.lua` | the row press overlay (`shade` 20 %), beside `T.PressButton` | 8.5 |
| `T.SelectRow(frame, on)` and `T.SELECT` | primitive | `Core/Theme.lua` | the one selected look for a row (the rail and the fill of §2.1, sizes in `T.SELECT`); `W.Row:SetSelected` is its one caller, so the options nav and the AH list pane reach it through `W.Row` | 8.5 |
| `upper` flag in `T.ROLES` | role flag | `Core/Theme.lua` | `T.Text` upper-cases the string for roles that set it | 8.6 |
| `T.KNOB_EASE` | constant | `Core/Theme.lua` | 0.1 s, with a row in THEME.md's fades table | 8.10 |
| contrast surfaces | token edit | `Core/Theme.lua` (`T.VARIANTS.contrast`) | `divider` below `borderHi` in OKLCH lightness (about `3a414c`), and `raisedHover` and `borderHi` per variant | 8.1 |

A constant is added together with its first user: the dead-code scan fails an unused token.

## 4. Streams, gates and ownership

### 4.1 In flight before this plan

Four threads are already building; the plan covers what they do not and the order between them.

| Stream | What it owns | Where |
|---|---|---|
| A. Controls restyle | pill switches, pill sliders with a round thumb, the short font list, no accent line on tabs | merged in PR #393 on 2026-10-17; Cliff saw the switches in game ("the toggles look perfect"); the slider thumbs read washed out, so PR #395 puts the fill under the thumb, makes the thumb solid with a dark outline and lets the tracks follow the theme; waits on his second look at the sliders |
| B. Consistency fixes (the audit's F1 to F17) | the constants and helpers in §3's first two rows; one scroll thumb for the options window and `T.ScrollBar`, the four dialogs' game scroll bars replaced; one section header (the quest log zone headers leave gold here, and the tracker's heading takes the same style); `T.Tint` that follows the accent; opacity tiers; the crest rule; primary buttons in the Core dialogs; the options preview placeholder; segment label size; fills that round with their panel; a display role so Faction look reaches only titles; hint and note tiers; dismiss verbs and captions; Vanguard's own quest icons | thread "Vanguard UI consistency audit", `work/ui-consistency`, one PR; it owns the shared `Core/` helper files until that PR merges |
| C. Frame coverage | batch 1 (`work/reskin-coverage-1`, draft PR #398): the always-visible gaps (chat side buttons, chat bubbles in a new `Modules/ChatBubbles.lua`, Battle.net and time toasts, loot and merchant rows with a reusable `GW.SkinMoney`, the durability frame, timed-quest countdowns and tracked recipes in the tracker, the waypoint pin, personal resource display, combat text fonts) and the dead names; batch 2 (`work/reskin-coverage-2`, Phase 8.3 inside it): the inbox rows and parchment, the spellbook and talent page art and the character pane's stats art painted to the material tiers (§2.3), the inner parts of professions, auction house, trade, bank, friends, inspect, guild bank, the statistics page, the meter breakdown window, nested tooltips, collections, plus the gold heads in §2.2; batch 3: guild control, the stable's parts, raid warning fonts, small dialogs | thread "Game interface coverage audit", one PR per batch; skins and modules only, no `Core/` files, existing helpers, shared lists appended to |
| D. Design deliverables | the research doc (PR #394, merged 2026-10-17); `T.CheckBox` (PR #397, merged 2026-10-17); the material tier table and the state matrix written into `docs/THEME.md` (in the check-box PR); the one selection grammar and the row press, landing inside `W.Row` once B's PR is up (`work/select-press`); the written state matrix | thread "UI/UX design research"; owns Phases 8.5 and 8.7, with 8.2 done (8.3 moved to C's batch 2 on 2026-10-17, so one thread edits the `Modules/Windows*.lua` files) |

Three rules the streams have agreed and the plan keeps: whoever is already in a file keeps it and the other waits for that PR and rebases; A merged first (PR #393, 2026-10-17) and B brings `main` in once before it merges; C's batch 2 starts once the material tier table (§2.3) is on `main` in any of its copies (this doc, `docs/design/DESIGN-PRINCIPLES.md` §1.6 or `docs/THEME.md`) and reads the tiers from it rather than inventing them; C owns Phase 8.3 inside that batch, so no second PR paints its windows.

### 4.2 Merge order and gates

- **G0: B on `main`** (A merged in PR #393 on 2026-10-17). Every phase below edits `Core/Theme.lua` or `Core/Controls.lua`, which B is changing now. Nothing merges before it is on `main`, with one exception, already taken: Phase 8.2 (PR #397) merged on 2026-10-17, because its `Core/Theme.lua` region (the game-frame primitives block and `T.PressButton`'s row flag) is one B does not touch; B brings `main` in once before opening its draft. Only the work under "safe before G0" starts earlier.
- **G1: `T.CheckBox` (Phase 8.2) on `main` before C's batch 2 skins any check box.** Open since PR #397 merged on 2026-10-17 (it also did the raid tab, the addon list and the chat settings); batch 2 adds the call sites in the windows it did not reach.
- **G2: Phase 8.1 before Phase 8.4** (`T.Capsule`, `Disc20Soft`, the contrast tokens).
- **G3: Phase 8.4 before Phases 8.7, 8.8, 8.9 and 8.10** (the control grid and button kinds).
- **G4: Cliff's answers.** No phase builds a [DECIDE] item before he answers it (CLAUDE.md). A phase builds the rest, keeps the open item as a one-line constant or an untouched code path, and adds the item in its own commit when the answer comes; an item still open at the freeze waits for the first release after launch.
- **Structural freeze 2026-10-28** (no new files, feature cut-off): B, C's batches 1 and 2 and Phases 8.1 to 8.8 merged (A is). B's new `Core/Chrome.lua` and C's new `Modules/ChatBubbles.lua` are the only new files and must be on `main` by then. Phases 8.9 and 8.10 are cut if they are not merged.
- **Code freeze 2026-11-01:** Phase 8.11's checklist is on `main`; after this, only fixes from the in-game list.
- **Beta risk:** the Forever beta may close around 2026-10-21 (unverified). Anything merged after Cliff's last beta session is first seen in game on launch day, so A (merged), B and C's batch 1 (the pills, the titles, the chat buttons, the loot and merchant rows) are what to get in front of him first; the rest ships with its checks on the Phase 8.11 list and the patch release rehearsed for 2026-11-02 fixes what the launch-day look shows.
- **Safe before G0:** `T.CheckBox` (8.2, merged); the material pass in C's batch 2 (8.3); the state matrix and type pairings written into `docs/THEME.md`; C's batch 1.

### 4.3 Who owns which function in the shared files

Parallel phases edit different functions of the same file. A phase edits only the functions named here and brings `main` in once, right before it merges.

| File | 8.1 | 8.2 | 8.4 | 8.5 | 8.6 | 8.7 | 8.8 |
|---|---|---|---|---|---|---|---|
| `Core/Theme.lua` | `T.VARIANTS`, the constants block, new `T.Capsule` | new `T.CheckBox`, the `T.EditBox` region | `T.Button` kinds | `T.Panel` `open`, `paintTab`, `T.CONTROL_TILES`, `T.PressRow`, `T.SelectRow` | `T.ROLES` | callers of `T.FocusRing` and `T.EaseHover` | callers of `T.OpenWindow` |
| `Core/Controls.lua` | `pillParts` and `placePill` out | | switch, slider, segment and dropdown sizes, the value formatter, `W.Primary` | | | press, menu close, menu thumb, search clear | |
| `Core/Chrome.lua`, `Core/Widgets.lua` | | | `W.Button` default width | `W.Row:SetSelected` | | edit box focus | |
| `Core/Dialog.lua` | | | button height only | | | | the rest |
| `Modules/Windows*.lua` (C's files) | | `T.CheckBox` call sites, by the later PR | | | nothing (C carries the gold heads) | | |

### 4.4 Rules every phase follows

One branch named `work/<phase>` from fresh `origin/main`, one draft PR marked ready once, Cliff's attribution only, `npm run quality` and `npm run coverage` (100 %) green, the README sentence and `docs/THEME.md` updated in the same commit as the behaviour, every new global in `.luacheckrc`, every new fade in THEME.md's table, a needs-in-game-check list in the PR, and the phase's checkbox ticked in `.planning/ROADMAP.md`. Nothing protected in combat, no secret-value reads, no field on a game frame and no `SetScript` on one: the harness fails both. Nothing is built behind an unanswered [DECIDE].

## 5. Phases in build order

Details (goal, success criteria, files, checks) are in `.planning/ROADMAP.md`. "New" means a thread started when the phase's gate opens; model and effort follow CLAUDE.md's table (Sonnet medium unless noted).

| Phase | Owner | Branch | Goal | Size | Starts after | [DECIDE] |
|---|---|---|---|---|---|---|
| 8.1 Theme tokens and capsule kit | new | `work/ui-tokens` | Every variant keeps the surface order; pills, discs and badges are one theme primitive and one media set | M | G0 | none |
| 8.2 Check box primitive | D | `work/checkbox` | No game check box art inside any window Vanguard owns | S | done: PR #397 merged 2026-10-17, G1 open | 8 |
| 8.3 One material per window | C (inside batch 2) | `work/reskin-coverage-2` | The inbox, the spellbook and talent pages and the character pane's stats are slate inside, painted to the tier table D wrote down | M | C's batch 1 merged | none |
| 8.4 Control grid and button kinds | new | `work/ui-control-grid` | Every control on the 20/26/200 grid, with secondary, primary and danger buttons | M | 8.1 | 5 |
| 8.5 Selection grammar and row press | D | `work/select-press` | "Selected" said three ways and no other; rows press like buttons | M, Sonnet high | G0 (B's `W.Row`) | 3, 4, 12 |
| 8.6 One yellow, type pairings and empty states | new | `work/ui-type` | Gold only for content; one role and colour per place; an empty list says what fills it | S | G0, and C's batch 2 for the check | 1, 6 |
| 8.7 States, keyboard and menus | D | `work/ui-states` | One state matrix in code; menus close like menus | M | 8.4 | none |
| 8.8 Dialogs and button order | new | `work/ui-dialogs` | One primary per dialog, destructive never brass, Escape and Enter | S | 8.4 | 10, 11 |
| 8.9 Spacing sweep (cuttable) | new | `work/ui-spacing` | Every window's padding and footer on `T.SPACE` | M | 8.4 and B | none |
| 8.10 Knob and thumb ease (cuttable) | new | `work/ui-knob-ease` | Knobs glide 0.1 s out of combat | S | 8.4 and Cliff's second look at the sliders (PR #395) | 7 |
| 8.11 UI batch checklist and probes | new, Haiku low | `work/ui-batch-check` | One in-game list for every look above, with the probes that gate the open decisions | S | 8.1 to 8.10 merged or cut | none |

Not planned, on purpose: a light theme (decided), window ornaments on by default, animated tab indicators or sliding selection pills (they jitter on the pixel grid and under the combat cap), hover recolouring of text, zebra rows, icons in empty states, and anything §7 keeps Blizzard's. A class-colour accent waits for [DECIDE] 9.

## 6. [DECIDE] list for Cliff

Answer in one message as numbers and letters (for example `1a 2a 3a`). The recommended answer is (a) on every open line; items 2 and 13 were settled by Cliff's in-game look on 2026-10-17 and need no answer. Items 1 and 4 are drawn in one place by the consistency PR (`ns.WindowTitle`'s `align` option and `W.Row:SetSelected`), so each answer is a one-line change there.

1. **Window titles on skinned game windows.** (a) Keep the game's centred placement, recoloured to `text` in the `title` role; no layout risk. (b) Left-align them like Vanguard's own windows; a layout change on every game window.
2. **Slider track ends.** Settled, no answer needed: the track merged in PR #393 is a pill with rounded ends, and Cliff saw it in game on 2026-10-17 without objection; his second look (PR #395) is about the thumb and the outline, not the shape.
3. **Active tab.** (a) The attached tab: it takes its page's colour and has no border where it meets the page; no accent on any tab. (b) A 2 px accent line that replaces the tab's top border.
4. **List and nav selection.** (a) An accent rail plus a lighter fill, text and icon unchanged. (b) Keep today's accent wash and brass icon.
5. **Slider fill.** (a) A quiet grey fill (`borderHi`) under the solid thumb, so a page of sliders is not a row of brass bars. (b) The accent fill, as merged in PR #393.
6. **Section headers outside the options window.** (a) Small grey capitals everywhere, like the options cards. (b) Keep bold sentence-case headers in the quest log and auction house.
7. **Knob and thumb glide (0.1 s).** (a) Build it, instant in combat and with Reduce motion, and check it in the next batch. (b) Leave knobs instant.
8. **Check box mark.** (a) A dark box with a brass check. (b) A brass-filled box with a dark check.
9. **A "class colour" accent preset.** (a) Leave it out for launch: class colours mark content, and a class-coloured accent would collide with the selection colour. (b) Add it.
10. **Quest log and quest dialog buttons.** (a) Abandon (and Goodbye) alone at the far left, the other buttons at the right. (b) Keep them in one row.
11. **Enter in dialogs.** (a) Enter presses the primary, except when the primary is destructive. (b) Enter does nothing, as today.
12. **Hover on the window controls.** (a) Maximize and minimize hover to a grey tile; only close turns colour. (b) Keep the brass hover tile.
13. **Sizes of the switch and slider merged in PR #393.** Settled, no answer needed: Cliff saw the switches in game on 2026-10-17 ("the toggles look perfect"), so the 36x18 switch with its 14 px knob and the 8 px track with its 12 px thumb stay as built; the control grid (§2.4) centres them in the 20 px slot.
14. **The game's tutorials.** Forever runs the modern tutorial system, and its pointers aim at frames Vanguard hides (the action bar, bags, minimap, tracker), so a new character may be pointed at nothing. (a) After an in-game check on a level 1, offer "Turn off the game's tutorials" (the `showTutorials` setting) in the setup wizard for a new character, off by default. (b) Re-anchor the game's help tips to Vanguard's frames. (c) Leave them as they are.

## 7. What stays Blizzard's, on purpose

The end state after C's three batches and Phases 8.1 to 8.11: every frame a player meets in vanilla content is drawn or dressed by Vanguard, except these, which the coverage research keeps Blizzard's for safety or because the art is the content.

- **Secure action buttons** (the game's bars Vanguard keeps, pet, stance, possess, extra, flyouts, the new-spell flight): textures only, never moved or re-parented, nothing in combat.
- **Unit popup menus**: textures on the menu frame only; its buttons run secure actions.
- **Forbidden frames**: `RaidBossEmoteFrame`, private auras, chat bubbles inside instances.
- **Chat lines, tooltips, meters, cooldowns, auras, health and power**: skinned, never read; every value through `ns.IsSecret` and `ns.PlainNumber`.
- **Static popups**: skinned, never clicked for the player.
- **Toasts and banners** (`AlertFrame`, `EventToastManagerFrame`, `BossBanner`, level-up banners): the art is the content and the frames are pooled and animated.
- **Engine screens**: loading screens, cinematics, movies, subtitles, the low-health vignette, the proc overlay.
- **Commerce, legal and account flows**: the shop, subscription prompt, token dialog, checkout, authenticator, code of conduct, login warnings, the beta issue reporter.
- **The gamepad HUD** (Forever-only controller support): untouched until someone plugs in a controller and reports what sits beside Vanguard's bars.
- **Edit Mode**: skinned; Vanguard pauses its pins while it is open and never drives it.

## 8. In-game checks that gate a decision

Every phase PR carries its own needs-in-game-check list; Phase 8.11 gathers them into one `docs/SMOKE-TEST.md` section and one issue in crash-risk order. These are the checks whose answer changes the plan, so they go first in Cliff's next session:

1. A level 1 character: where the game's tutorial pointers land with Vanguard's bars, bags and minimap ([DECIDE] 14).
2. A timed quest with Vanguard's tracker on: whether any countdown shows (C's batch 1 adds one; confirms the gap and the fix).
3. `/way` and a supertracked quest: the pin shows, and after batch 1 it is Vanguard's.
4. Flip a switch and drag a slider (after PR #395) in each theme, at 1080p and at a larger UI scale: whether the pill ends and knobs read crisp (decides whether 8.1 re-bakes the media and whether 8.10 is worth building).
5. The raised tab without its line (#393): whether it reads clearly against the window in the options window, merchant, character pane and guild window (decides how urgent 8.5's attached tab is).
6. The rounded corners toggle on a 20 to 26 px button: whether the arcs show at all (if not, `ROUNDED_KINDS` drops `button` in a follow-up and the rounded inner fills cost nothing more).
7. A controller plugged in: what the gamepad bar does beside Vanguard's bars.
8. The Collections button and an achievement link: which windows open on Forever (decides C's batch 2 scope).
9. Unit menu actions after the menu skin (Set Focus, Leave Party): no "action blocked".
10. Personal resource display with `nameplateShowSelf` on, and the Statistics tab page, after batch 1 and batch 2.

## 9. After launch

Carried over on purpose, each as its own issue when the time comes: the class-colour accent if [DECIDE] 9 says yes; re-anchoring the game's help tips if [DECIDE] 14 says (b); the spacing sweep and knob ease if they are cut at the freeze; `sizedIcons` on by default once the in-game check for #232 passes; the native pixel rounding (`SetRoundLayoutToNearestPixel`) when Forever reaches the 12.1.5 engine; the gamepad HUD once a controller check exists; and the website's walkthrough shots, retaken from the launch build.
