# Design: one interface, not an assembly (UI coherence plan)

Written 2026-10-17 against `main` at `8e249a4` (0.6.0 plus PRs #390 to #392) for Cliff's full UI/UX review. It turns three research notes into one target and one build order. The phases themselves are Phases 8.1 to 8.10 in `.planning/ROADMAP.md` (requirements UI-07 to UI-14 in `.planning/REQUIREMENTS.md`); this file is the spec they build to. Research, not observation: nothing here was seen in a Forever client, and every look it describes goes on the in-game batch list (Phase 8.10).

The research notes it draws on live in the project's shared folder (the design-principles note also lands in `docs/design/` through its own PR): `research/ui-ux-review/design-principles.md` (principles, a target spec for 21 elements, 12 questions), `blizzard-frame-coverage.md` (301 Blizzard addons, 709 top-level frames, 241 touched by Vanguard, gaps ranked by how often a player sees them) and `vanguard-ui-audit.md` (widget inventory, 17 inconsistencies with `file:line` evidence). Every `file:line` below is as of `8e249a4`; grep the identifier next to it if a line has moved.

## 1. What a stranger sees today, and after

A public post called Vanguard's look "mis-matching textures and fonts". The research agrees with the first half and explains it: the eye is not reacting to any one ugly control, it is reacting to seams. Each row below is a seam a stranger meets in the first ten minutes, and the phase that closes it.

| A stranger today | After | Phase |
|---|---|---|
| Two yellows: brass (`accent`, `d9a441`) marks the current item, while most skinned game windows title in the game's gold (`ffd100`, `Modules/Windows.lua:194` keeps the game's colour); the quest log's zone headers are gold too. | Gold means content only (money, quest titles and "!" marks, elite, the leader's crown). Every window title, Vanguard's or the game's, is `title` in `text`. | audit PR (titles), 8.5 |
| "Selected" is said six ways: rail plus accent wash (options nav), accent bar on a tab, accent fill (segments), accent text plus check (menus), the game's gold rim (side tabs), rail plus accent text (AH lists). | Three cases, one each: choose-one-of-few is a filled accent capsule; navigate is a rail; the current tab is attached to its page. | #393, 8.4 |
| Parchment, painted backdrops, red row plates and gold-rimmed check boxes inside slate windows (inbox, talents, merchant, friends). | One material per window: every inner surface is `inset`, `raised` or `panel`; art stays only where it is the content (portraits, icons, the map). | coverage batches, 8.2 |
| Controls on no grid: switch 36x18, dropdown 180x22, slider 140x6, buttons 24, segments in 10 px text beside 12 px captions. | One scale: rows 28, inline controls 20, standalone buttons 26, a 200-wide control column, one label size. | 8.1, 8.3 |
| Five scroll bar looks, four dialogs with the game's own scroll bar art, and quest panes with no hint that they scroll. | One 4 px thumb everywhere, the soft edge fade kept. | audit PR, 8.2 |
| Hover is a fill on buttons and a white wash on rows; press recolours the switch but darkens buttons; only the options window shows keyboard focus. | One state matrix (section 2.5): one hover per surface kind, one press, one disabled, one focus ring, everywhere. | 8.6 |
| Five section header styles; seven window title styles; dialogs where Reload and Later look the same. | One pairing per place (section 2.6); one title helper; one primary per view, destructive actions never brass. | audit PR, 8.5, 8.7 |
| "Nothing to show" in an empty meter. | Empty states say what fills them. | 8.8 |

The second half of the post ("a copy of") is answered by what no other suite has, made consistent: the brass sheen and bevel, the crest, attached tabs, pill controls and the copy tone. Those are the things this plan makes uniform first.

## 2. The target system

Each rule names its tokens from `docs/THEME.md` and its primitives from `Core/Theme.lua`. New names are listed in section 3.

### 2.1 One selection grammar

| Case | Look | Where |
|---|---|---|
| Choose one of few | `accent` fill, `void` text or knob | segments, switch on, radio dot, primary button |
| Navigate | 2 px `accent` rail on the left plus a `raisedHover` fill; text and icon unchanged in `text`; never an accent wash | options nav, AH lists, quest log and quest dialog lines, group board, any list row ([DECIDE] 4) |
| Current tab | the attached tab: the selected tab takes its page's fill and has no border on the side touching the page; unselected tabs are `inset`, `text2`, pulled 1 px off the page. No accent on a tab. | `T.Tab` on all three game templates, Vanguard's own tabs ([DECIDE] 3) |
| Many of many | the mark carries the accent, the box stays `inset` | check boxes ([DECIDE] 8) |
| Current item in a menu | `accentText` plus the `Check` glyph at right 8 (no fill to carry it) | dropdown menus |

### 2.2 One yellow

`gold` is content, never chrome. It stays on money, quest titles and "!" marks, elite names, the leader's crown and AH prices. It leaves the skinned windows' titles (`Modules/Windows.lua:194`), `GW.CREATION_HEADS` (`Modules/WindowsSocial.lua:444`), `GW.QUEST_HEADS` (`Modules/Windows.lua:316`), the report-cheating dialog title (`Modules/WindowsSystem.lua:43`), the map header glyph (`Modules/WindowsMap.lua:210`), `GW.ITEM_TEXT_TAGS` H1 to H3 (`Modules/Windows.lua:62`) and the quest log's zone headers (`Modules/QuestLogView.lua:118`). The accent is the only chrome hue; state colours and game colours mark content. The one exception stays: the close button's `bad` tile on hover. Rule for authors: a view with more than two accent fills at rest demotes the least important to `text2` or `borderHi`.

### 2.3 One material per window

| Tier | Fill | Border | Sheen | Bevel | Shadow | Used for |
|---|---|---|---|---|---|---|
| Window | `panel` | `edge` | yes | no | when floating | options, dialogs, skinned game windows, bags, tooltips |
| Card | `raised` | `edge` | yes | yes | only when floating (popovers, menus) | cards, popovers, the dropdown menu |
| Control | `inset` | `edge` | buttons and edit boxes | buttons | no | buttons, edit boxes, tracks, segment groups |
| HUD | `panel` (`T.HudPanel`) | `edge` | no | no | with `hudShadow` | unit frames, bars, minimap, tracker |

A window holds cards, a card holds controls, a control holds no surface. Never `inset` in `inset`. Opacity comes in named tiers, not numbers: opaque 1 (options, quest log, skinned windows), dialog 0.98 (dialogs, setup, What's new, anything with an edit box), overlay 0.94 (tooltips, cards), alert 0.92. Inside a skinned game window every inner surface is painted to this table; game art survives only where it is the content.

### 2.4 One control grid

| Thing | Size |
|---|---|
| Option row | 28 (`W.ROW_HEIGHT`, unchanged) |
| Inline control (switch track, dropdown, segment group, edit box, slider thumb area) | 20 high (`T.CONTROL_H`) |
| Standalone button (dialogs, card button rows, quest dialog) | 26 high (`T.BUTTON_H`), min width 80, label padding 16 |
| List row | 24; nav rows 28 |
| Table header row | 20, `small` `text2`, sentence case |
| Control column | 200 wide, right inset 8 (`W.COLUMN`); slider track 132, gap 8, value slot 60 (`W.VALUE_SLOT`) |
| Switch | 40x20 pill, 16 px knob, 2 px inset, no size change between states ([DECIDE] 13) |
| Slider | 4 px capsule track, 14 px white thumb with a 1 px `accent` ring, fill in `borderHi` ([DECIDE] 2, 5, 13) |
| Check box | 16, 1 px `edge`, 12 px `Check` glyph |
| Badge | capsule 14 high, min 14 wide, `accent` fill, `void` text in `badge`, at most three characters (`99+`) |
| Radii | 0 (square default), 4 (`T.CORNER_RADIUS`, the rounded toggle; edit boxes, check boxes and segment groups join `ROUNDED_KINDS`), full (pills, discs, thumbs, badges: a shape, so not part of the toggle) |
| Spacing | `T.SPACE = { tight = 4, gap = 8, col = 12, pad = 16, section = 24 }`; 2 only between repeated cells of one control |

Every layout holds at Text size 130 % with a long caption: captions wrap left of the control, values keep a fixed slot, anything that cannot wrap truncates with the font's ellipsis.

Button kinds share one shape: secondary (`inset` plus bevel, `text`), primary (`accent` fill, no bevel showing through, `void` SemiBold label, hover eases to `accentText`; one per view), danger (secondary with a `bad` label; never a red fill), icon (a 20x20 `raised` tile).

### 2.5 One state matrix

| State | Opaque control | See-through row | Text |
|---|---|---|---|
| Rest | `inset`, `edge`, bevel | nothing | role colour |
| Hover | ease to `raisedHover` plus a `borderHi` top line (`T.EaseHover`, 0.1 s in, 0.13 s out) | `hover` wash, instant | unchanged: never recolour text on hover |
| Pressed | `shade` 30 % plus label down 1 px | `shade` 20 % | unchanged |
| Selected | per section 2.1 | per section 2.1 | `accentText` only where no fill carries it |
| Disabled | no hover or press, text and icons `disabled` at full alpha (never fade a whole bordered control) | same | `disabled` |
| Focus | `T.FocusRing`; edit boxes instead turn their border `accentText` while focused | same | |

The moving-part controls keep this vocabulary on their own geometry: the switch's knob brightens on hover and drops 1 px on press while the track never changes (today's `accentDim` press fill goes); the slider thumb gets a 20 px `hover` wash disc on hover, 12 % while dragging. The window controls' hover tile becomes `raisedHover` so only close keeps a coloured tile ([DECIDE] 12). States are layers over an unchanged base, so they stack; only press moves geometry. Escape closes every Vanguard window, dialog and menu; a click outside closes a menu.

### 2.6 One type pairing per place

| Place | Role | Colour |
|---|---|---|
| Window title | `title` (15 SemiBold) | `text` |
| Section header | `small`, upper-cased by a role flag, not by `:upper()` on the string | `muted` ([DECIDE] 6) |
| Column header | `small`, sentence case; the sorted column adds a 10 px arrow in `accentText`, the title stays | `text2` |
| Caption | `label` | `text` |
| Value | `number` | `text2` unless it carries meaning |
| Hint, note, empty state | `small` or `label` | `muted` |
| Placeholder | `label` | `disabled` |
| Badge | `badge` | `void` on `accent` |

Captions are names (`Corners`, `Window ornaments`); the explanation and "(reload)" go in the note. Sentence case everywhere but section headers. A space before a unit: `105 %`. Buttons are verbs. Close for windows, Cancel when there is a primary, Done only for forms.

### 2.7 Motion and alignment

Hover 0.1 s in and 0.13 s out, window open 0.13 s with the 4 px rise, close 0.1 s, 0.15 s cap in combat, Reduce motion makes all of it instant. Menus and tooltips never animate. Dialogs open with `T.OpenWindow` like every other window. A knob or thumb may ease 0.1 s out of combat ([DECIDE] 7). Dialog and footer buttons: primary rightmost, secondary 8 to its left, an escape or destructive action (Skip, Abandon, Goodbye) alone on the far left ([DECIDE] 10).

## 3. New names the phases add

| Name | Kind | File | Value | Phase |
|---|---|---|---|---|
| `T.CONTROL_H`, `T.BUTTON_H`, `T.ROW`, `T.SPACE`, `T.ALPHA`, `T.SCROLL`, `T.CREST`, `T.ROLES.zone` | constants | `Core/Theme.lua` | 20; 26; `{ height = 28, rail = 2, wash = 0.12 }`; `{ tight = 4, gap = 8, col = 12, pad = 16, section = 24 }`; `{ opaque = 1, dialog = 0.98, overlay = 0.94, alert = 0.92 }`; `{ thumb = 4, rest = 0.5, lit = 1 }`; crest sizes; a 13 bold zone role | stream B (already on its branch) |
| `ns.WindowTitle(frame, text, opts)`, `W.Row:SetSelected` | helpers | `Core/Chrome.lua` (new), `Core/Widgets.lua` | every window title; the one place a selected row is drawn (`opts.align` and `SetSelected` are where [DECIDE] 1 and 4 flip) | stream B |
| `W.COLUMN`, `W.VALUE_SLOT` | constants | `Core/Controls.lua` | 200, 60, replacing the literals 180, 140, 52 and −66 | 8.3 |
| `T.Capsule(frame, height, tier)` | primitive | `Core/Theme.lua` | #393's local `pillParts`/`placePill` moved into the theme and generalised (any height, any tier, 1 px edge) | 8.1 |
| capsule media sizes | media | `scripts/lib/media-sources.mjs` | #393's `Pill`, `PillLine`, `Knob`, `KnobShade` (32 px canvases) re-checked against the grid sizes (20 px pill, 16 px knob, 14 px thumb): the outline's baked width scaled to land on one screen pixel at each, re-baked where it does not; white RGB under alpha; a `media.test.mjs` case checks it | 8.1 |
| `Disc20Soft` | media | `scripts/lib/media-sources.mjs` | soft disc for the slider thumb's hover and drag wash | 8.3 |
| `Media/Icons/Up` | media | `scripts/lib/media-sources.mjs` | the sort arrow, instead of rotating `Down` | 8.1 |
| `opts.open` on `T.Panel` | option | `Core/Theme.lua` | `"TOP"`, `"BOTTOM"`, `"LEFT"` or `"RIGHT"`: that edge draws no line and no sheen | 8.4 |
| `opts.primary`, `opts.danger` on `T.Button` | options | `Core/Theme.lua` | accent fill and `void` label without the bevel / `bad` label | 8.3 |
| `T.CheckBox(button)` | primitive, exported by `Core/Skin.lua` | `Core/Theme.lua` | 16 box, `Check` glyph, follows `SetChecked` by post-hook | 8.2 |
| `upper` flag in `T.ROLES` | role flag | `Core/Theme.lua` | `T.Text` upper-cases for roles that set it | 8.5 |
| `T.KNOB_EASE` | constant | `Core/Theme.lua` | 0.1 s, a row in THEME.md's fades table | 8.9 |
| contrast surfaces | token edit | `Core/Theme.lua` (`T.VARIANTS.contrast`) | `divider` below `borderHi` in OKLCH lightness (about `3a414c`), and per-variant `raisedHover` and `borderHi` | 8.1 |

Constants are added only together with their first user, since the dead-code scan fails an unused token.

## 4. How the streams fit together

### 4.1 In flight before this plan

| Stream | What it owns | Where |
|---|---|---|
| A. Controls restyle | pill switches, pill sliders with a round thumb, the short font list, no accent line on tabs | draft PR #393, `work/toggle-restyle` |
| B. Consistency audit fixes (F1 to F17) | one window title helper, one scroll view, one section header, one list row (`W.Row`), `T.Tint` refresh, spacing, opacity and crest tokens, primary buttons in the Core dialogs, the options preview placeholder, segment label size, rounded fills, a display font role, copy and dismiss verbs | thread "Vanguard UI consistency audit", one branch |
| D. Design targets | the deliverables of the design research itself: one selection grammar (nav rail, tabs, segments, dropdown check, character side tabs, AH rail), one material per window including `T.CheckBox`, the written state matrix; it also lands the research doc as its own small `docs/design` PR. It starts outside the helper files B is changing, rebases after B merges, and builds nothing behind a [DECIDE] | thread "UI/UX design research"; owns Phases 8.2, 8.4 and 8.6 below |
| C. Frame coverage | batch 1 always-visible frames (chat buttons, toasts, bubbles, loot and merchant rows, durability, tracker timers and recipes, waypoint pin, resource display, combat text, stale names); batch 2 inner parts of framed windows; batch 3 occasional windows | thread "Game interface coverage audit", one PR per batch; not phases here. Batch 1 adds a reusable `GW.SkinMoney` and a new `Modules/ChatBubbles.lua`; it touches no `Core/` file and not `Modules/WindowsTabs.lua`, edits shared lists only by appending, and leaves the gamepad HUD for an in-game check |

The numbers in section 2 were sent to stream B while it builds its helpers, and B has taken them under the names in section 3 (`T.CONTROL_H`, `T.BUTTON_H`, `T.ROW`, `T.SPACE`, `T.ALPHA`, `T.SCROLL`, `ns.WindowTitle`, `W.Row:SetSelected`). B keeps each window's title alignment and today's rail-plus-wash row mark until Cliff answers [DECIDE] 1 and 4, so each answer is a one-line change in those helpers. Skinned game windows' titles turn `text` in stream C's files.

### 4.2 Gates

- **G0: A and B merged.** Every phase below edits `Core/Theme.lua` or `Core/Controls.lua`, which A and B are changing now; none merges before both are on `main`, and only the items under "Safe before G0" start earlier. Phase 8.8 needs only B.
- **G1: Phase 8.2 merged before C's batch 2 skins any check box or scroll bar.** Batch 2 is where the game's check boxes and old scroll frames live; if 8.2 is late, batch 2 skips those parts and leaves them for 8.2 to apply.
- **G2: Phase 8.1 merged before 8.3 and 8.4** (`T.Capsule`, the contrast tokens).
- **G3: Phase 8.3 merged before 8.6, 8.7 and 8.9** (button kinds, the control grid).
- **G4: Cliff's answers.** No phase builds a [DECIDE] item before Cliff answers it (CLAUDE.md). A phase builds the rest of its work, keeps the open item's code path untouched, and adds the item in its own commit once the answer comes; if the answer has not come by the freeze, the item waits for after launch.
- **Freeze 2026-10-28** (structural freeze and feature cut-off): 8.1 to 8.8 merged. 8.9 is cut if it is not. **Code freeze 2026-11-01**: only fixes from the in-game batch.
- **Safe before G0** (no file B or A is changing): the state matrix and type pairings written into `docs/THEME.md`; `T.CheckBox` on its own branch with its tests, rebased at G0; C's batch 1. Everything else waits for G0.
- **Beta risk:** the beta may close around 2026-10-21 (unverified). Anything that lands after Cliff's last beta session is first seen in game at launch, so 8.1 to 8.5 and C's batch 1 are the ones to get in front of him first.

### 4.3 Who owns what in the shared files

Parallel phases touch different functions of the same file. A phase edits only the functions named for it here and brings `main` in once, right before it merges.

| File | 8.1 | 8.2 | 8.3 | 8.4 | 8.5 | 8.6 | 8.7 |
|---|---|---|---|---|---|---|---|
| `Core/Theme.lua` | `T.VARIANTS`, the constants block, `T.Capsule` | `T.ScrollBar`, `T.CheckBox` | `T.Button` kinds | `T.Panel` `open`, `paintTab`, `T.CONTROL_TILES` | `T.ROLES` | `T.FocusRing` callers, `T.EaseHover` users | `T.OpenWindow` callers |
| `Core/Controls.lua` | moves `pillParts` out | | switch, slider, segments, dropdown sizes | | | press, menu close, menu thumb, search clear | |
| `Core/Widgets.lua`, `W.Row` | | | `W.Primary` | row selection mark | | edit box focus | |
| `Core/Dialog.lua` | | | button height | | | | all of it |
| `Modules/Windows*.lua` (C's files) | | check box call sites | | | the gold lines in section 2.2 | | |

## 5. Phases in build order

Details (goal, owner, success criteria, files) are in `.planning/ROADMAP.md`. All are one branch and one PR each, Sonnet medium unless noted. "New" means a new thread started when the phase's gate opens.

| Phase | Owner | Branch | Goal | Size | Waits on | [DECIDE] |
|---|---|---|---|---|---|---|
| 8.1 Theme tokens and capsule kit | new | `work/ui-tokens` | Every variant keeps the surface order, and pills are one theme primitive | M | G0 | none |
| 8.2 Check box and one scroll bar | D | `work/ui-checkbox-scroll` | No game check box or scroll bar art inside a Vanguard look | M | G0 to merge (may start now); before C's batch 2 | 8 |
| 8.3 Control grid and button kinds | new | `work/ui-control-grid` | Every control on the 20/26/200 grid; primary and danger buttons | M | 8.1 | 2, 5, 13 |
| 8.4 Selection grammar | D | `work/ui-selection` | "Selected" said three ways, nowhere else (Sonnet high: three tab templates) | M | 8.1, B | 3, 4, 12 |
| 8.5 One yellow and type pairings | new | `work/ui-type` | Gold only for content; one role and colour per place | S | G0 | 1, 6 |
| 8.6 States, keyboard and menus | D | `work/ui-states` | One state matrix; menus close like menus | M | 8.3 (Controls parts); G0 (setup, edit boxes); now (THEME.md text) | none |
| 8.7 Dialogs and button order | new | `work/ui-dialogs` | One primary per dialog, destructive never brass, Escape and Enter | S | 8.3 | 10, 11 |
| 8.8 Empty states | new | `work/ui-empty-states` | Empty lists say what fills them (Sonnet low) | S | B | none |
| 8.9 Knob and thumb ease (cuttable) | new | `work/ui-knob-ease` | Knobs glide 0.1 s out of combat | S | 8.3, Cliff's look at the pill | 7 |
| 8.10 UI batch checklist | new | `work/ui-batch-check` | One in-game list for every look above (Haiku low) | S | 8.1 to 8.9 | none |

Not planned, on purpose: a light theme (decided), window ornaments on by default, animated tab indicators or sliding selection pills (they jitter on the pixel grid), hover recolouring of text, zebra rows, icons in empty states, and anything that touches what section 3 of `blizzard-frame-coverage.md` keeps Blizzard's for safety (secure action buttons, unit menus beyond textures, forbidden frames, toasts and banners whose art is the content, commerce and legal flows). A class-colour accent waits for [DECIDE] 9.

## 6. [DECIDE] list for Cliff

Answer in one message as numbers and letters (for example `1a 2a 3a ...`). The recommendation is (a) unless marked. Items 4 and 6 overlap stream B's fixes; B draws each in one place, so your answer is a one-line change there.

1. **Window titles on skinned game windows.** (a) Keep the game's centred title, recoloured to `text` in the `title` role; no layout risk. (b) Left-align them like Vanguard's own windows; a layout change on every game window.
2. **Slider track ends.** (a) Rounded ends on the 4 px track (what you asked for). (b) Square ends (one pixel of difference at 1080p).
3. **Active tab.** (a) The attached tab: it takes its page's colour and has no border where it meets the page; no accent. (b) A 2 px accent line that replaces the tab's top border.
4. **List and nav selection.** (a) Accent rail plus a lighter fill, text and icon unchanged. (b) Keep today's accent wash and brass icon.
5. **Slider fill.** (a) A quiet grey fill, with the accent only on the thumb's ring, so a page of sliders is not a row of brass bars. (b) Accent fill as in PR #393.
6. **Section headers outside options.** (a) Small grey capitals everywhere, like the options cards. (b) Keep bold sentence-case headers in the quest log and auction house.
7. **Knob and thumb glide (0.1 s).** (a) Build it, off with Reduce motion and instant in combat, and check it in the next batch. (b) Leave knobs instant.
8. **Check box mark.** (a) Dark box with a brass check. (b) Brass-filled box with a dark check.
9. **"Class colour" accent preset.** (a) Leave it out for launch; class colours are content and would collide with the selection colour. (b) Add it.
10. **Quest log and quest dialog buttons.** (a) Abandon (and Goodbye) alone on the far left, the others on the right. (b) Keep them in one row.
11. **Enter in dialogs.** (a) Enter presses the primary, except when it is destructive. (b) Enter does nothing.
12. **Hover on window controls.** (a) Maximize and minimize hover to a grey tile; only close turns colour. (b) Keep the brass hover tile.
13. **Sizes of PR #393's switch and slider.** (a) Move them onto the grid: switch 40x20 with a 16 px knob, slider thumb 14 px on a 4 px track; same art, sizes only. (b) Keep #393's 36x18 switch and 8 px track with a 12 px thumb.
