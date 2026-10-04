# ForeverUI theme spec ("Slate & Brass")

This is the reference every style change cites. It is written from `Core/Theme.lua` (and `Core/SharedMedia.lua`, `scripts/lib/media-sources.mjs`) as they are, not from the work plan's notes: where the two disagree, the code is what ships and this page follows the code (see [Where the plan and the code differ](#where-the-plan-and-the-code-differ)). If you change a token, a role or a primitive, change this page in the same commit.

The look in one line: flat dark slate panels, one-screen-pixel borders, one accent colour, one font (Fira Sans Condensed), and textures that are plain white or grayscale shapes tinted by the theme. Nothing depends on art from another addon.

## Rules

- **Colours and font sizes live only in `Core/Theme.lua`.** Modules ask for a colour by token name (`T.RGB`, `T.Color`, `T.Tint`, `T.BarColor`, `T.Paint`, `T.Hex`) and for text by role (`T.Text(fs, role)`). `scripts/lib/code-quality.mjs` fails the build on a colour setter called with numbers, a 0-1 colour table, a written-out `|cff......` escape, or a `:SetFont(path, <number>)` outside the theme.
- **Every painted frame follows live changes.** `T.Panel`, `T.Button`, `T.EditBox`, `T.CloseButton`, `T.Logo` and `T.Crest` remember what they painted; `T.Refresh()` (run by `/fui accent`, the accent swatches, a font or text-size change, a UI scale change) repaints them and re-fonts every string styled with a role. Anything coloured by hand registers with `T.OnChanged(fn)`.
- **Primitives are idempotent.** Calling one again on the same frame repaints it; it never adds a second border.
- **Other addons get the same tools** through the Skin API (`ForeverUI.RegisterSkin`, `Core/Skin.lua`): `S.Panel`, `S.Button`, `S.EditBox`, `S.CloseButton`, `S.FadeRegions`, `S.SetFont`, `S.Text`, `S.Color`, `S.RGB`, `S.Tint`, `S.BarColor`, `S.Pixel`, `S.Accent`, `S.PanelColor`, `S.Font`, `S.OnChanged`.

## Colour tokens

`T.RGB(name)` returns r, g, b, a (0-1). Four tokens come from the theme settings, so a profile can change them; the rest are fixed. A name that is not a token is an error, not a silent white.

### From the settings

| Token | Default | Setting | Role |
| --- | --- | --- | --- |
| `accent` | `d9a441` (brass) | `accent` | The one highlight colour: selected nav items, focus and target edges, glows, links, header rules, the logo's left diamond, the minimap's corner diamonds. Changed by `/fui accent`, the swatches under General → Look, or the hex box beside them. |
| `panel` | `12151b` at 0.94 | `panel` | The fill of every panel (`T.Panel`, `T.HudPanel`). Softened raid bars mix their class colour into it. |
| `inset` | `07080b` at 0.95 | `inset` | The darker fill of buttons, edit boxes and inset panels (`opts.inset`). |
| `edge` | `000000` | `border` | Every one-pixel border unless a frame sets its own (`T.SetBorder`) or asks for the accent (`opts.accent`). |

`panel`, `inset` and `border` have no control in the options window: they are kept in the profile (and its export string) and go back to these defaults with `/fui theme reset`.

### Fixed tokens

| Group | Token | Value | Role |
| --- | --- | --- | --- |
| Surfaces | `void` | `0b0d11` | Near-black for text and marks drawn on an accent fill: a selected segment or condition, the setup wizard's check. |
| | `raised` | `1a1e26` | The lighter fill of raised panels (`opts.raised`): dropdown menus, popovers, the spell picker, keybind mode. |
| | `sheen` | `ffffff` at 0.06 | The one-pixel light line inside a panel's top border. |
| | `divider` | `242a34` | Lines between sections (the options window). |
| | `shade` | `000000` at 0.5 | Dimming behind or under things: the options nav, unit frame bar backgrounds, the cast bar's latency zone, the AFK screen. |
| | `hover` | `ffffff` at 0.08 | The faint white wash under the mouse on buttons, rows, raid tiles and menu icons. |
| | `darkBar` | `2a3039` | The health bar of the raid style "Dark, class-coloured names". |
| | `checked` | `ffffff` at 0.25 | An action button that is checked (an active stance or aura). |
| | `gridline` | `ffffff` at 0.12 | The unlock-mode grid. |
| | `textShadow` | `000000` at 0.9 | The drop shadow under text roles without an outline. |
| | `sweep` | `000000` at 0.65 | The dark sweep over an aura icon as its time runs out. |
| | `spark` | `ffffff` at 0.9 | The power bar's tick spark (five-second rule, energy ticks). |
| Text | `text` | `e8eaee` | Body text (the default colour of `T.Text`). |
| | `text2` | `a6adb9` | Secondary text, hints, the close glyph, assistant marks. |
| | `muted` | `6b7280` | Disabled and least important text. |
| | `white` | `ffffff` | Text and sparks over bars and icons (timers, counts, the cast spark). |
| | `gold` | `ffd100` | The game's gold: quest titles and "!" marks, money, elite units, the leader's crown, the zone name's default. |
| State | `good` | `4fc27a` | Success, ready, full durability. |
| | `warn` | `ee8b3a` | Warnings, middling values. |
| | `bad` | `e0565b` | Errors, not ready, broken items. |
| | `info` | `5aa2f0` | Informational state (reserved; no module uses it yet). |
| | `unknown` | `808080` | A value the client will not tell (reserved; no module uses it yet). |
| Reaction | `hostile` | `cc4b45` | Hostile units (nameplates, unit frames). |
| | `neutral` | `e0c24e` | Neutral units. |
| | `friendly` | `4db86a` | Friendly units. |
| Resources | `mana` / `rage` / `energy` / `focus` | `3e7be0` / `cf4a3e` / `e6c24a` / `e0893c` | Power bars. |
| Threat | `threat1` / `threat2` / `threat3` | `e0c24e` / `ee8b3a` / `e0565b` | Yellow, orange, red threat. |
| Dispel | `magic` / `curse` / `disease` / `poison` | `3c8cf0` / `9a55e0` / `b08a3a` / `3fa34d` | Debuff borders and the raid tile dispel wash. |
| | `dispel` | `cc4dff` | The dispel highlight when the client hides the debuff's type. |
| Casts | `cast` | `e6a93a` | A cast. |
| | `channel` | `4fc27a` | A channel. |
| | `shielded` | `8b9099` | A cast you cannot interrupt. |
| Healing | `heal` | `4fc27a` at 0.45 | Incoming heals over a health bar. |
| | `shield` | `ffffff` at 0.35 | Absorb shields (over the Stripes texture). |
| Action buttons | `outOfRange` / `noPower` / `unusable` | `e64d4d` / `6680ff` / `666666` | Icon tints. |
| XP and reputation | `xp` / `rested` | `940090` / `0063e0` at 0.5 | The XP bar and its rested overlay. |
| | `repHostile` / `repUnfriendly` / `repNeutral` / `repFriendly` | `cc2121` / `bf4500` / `e6b300` / `00991a` | Reputation bar by standing. |
| Faction look | `allianceCrest` / `hordeCrest` | `d6b25a` / `c8453a` | The crest's colour. |
| Zone text | `zoneSanctuary` / `zoneFriendly` / `zoneHostile` / `zoneContested` | `69ccf0` / `1aff1a` / `ff1a1a` / `ffb300` | The minimap's zone name by PvP status. |

Colours that are not tokens on purpose: class colours come from the client (`RAID_CLASS_COLORS`), item quality colours from the client, and the quest tracker's quest colours stay the game's. The raid style "Class colours, softened" mixes 70 % of the class colour with 30 % of `panel` (`RF.Soften`, `Modules/RaidFrames.lua`).

## Accent presets

`T.PRESET_ORDER` is the order of the swatches under General → Look and in the setup wizard; `/fui accent <name>` takes the same names, any `rrggbb` or `#rrggbb`, or `reset`.

| Preset | Hex | Older name that still works |
| --- | --- | --- |
| brass (default) | `d9a441` | bronze |
| arcane | `5aa2f0` | blue |
| fel | `5bcb7e` | green |
| void | `a47bf0` | purple |
| ember | `e0664b` | red |

The state colours (`good`, `warn`, `bad`) are kept apart from every preset, so an accent never reads as a warning. Arcane shares its hex with `info`.

## Text

### Fonts

| Setting `font` | Font |
| --- | --- |
| `""` (default) | Fira Sans Condensed, bundled: Medium for regular roles, SemiBold for bold ones (`T.FONTS.regular`, `T.FONTS.bold`). Latin, Greek and Cyrillic, tabular digits. |
| `"client"` | The game's font (`STANDARD_TEXT_FONT`). Korean and Chinese clients always use it, whatever the setting. |
| any other name | A font shared through LibSharedMedia (the Font picker lists them after the two built-ins). If the addon that shared it is gone, Fira Sans Condensed comes back. A font path from older settings still works. |

ForeverUI shares its own fonts through LibSharedMedia as "ForeverUI Fira Sans" and "ForeverUI Fira Sans SemiBold" (western and Russian clients). The faction look swaps the font of the `title` and `heading` roles only: Cinzel SemiBold for Alliance, Metamorphous for Horde, and only while the Font setting is Fira Sans and the client uses it. The font and text size apply at once (every role-styled string is re-fonted).

### Text roles

`T.Text(fs, role, color)` sets the font, size, shadow or outline, and a colour token (`text` unless given; `false` keeps the colour). Sizes are at Text size 100 %; the Text size slider (General → Look, 70 % to 130 % in steps of 5 %, also set by the setup wizard's screen presets) multiplies them, rounded to whole points (`T.ScaledSize`). Roles without an outline get a 1 px drop shadow in `textShadow`; outlined roles get no shadow. `T.TextSize(fs, size)` draws a styled string at a size of its own, worked out from the roles' sizes (`T.RoleSize`), and keeps it when text is refreshed (raid tile deficits follow the tile's scale this way, never below `tiny`).

| Role | Size (70 % - 130 %) | Weight | Outline | Used for |
| --- | --- | --- | --- | --- |
| `title` | 15 (11 - 20) | SemiBold | - | Window titles: options, setup, quest log, AFK card, alerts. |
| `heading` | 13 (9 - 17) | SemiBold | - | Section headings, dialog titles, the quest dialog and tracker headers. |
| `name` | 12 (8 - 16) | SemiBold | - | Unit frame names and levels, the options window's preview bar, click-cast tiles. |
| `cell` | 11 (8 - 14) | SemiBold | - | Bag section headers. |
| `label` | 12 (8 - 16) | Medium | - | Body text, control labels, options nav items. |
| `number` | 12 (8 - 16) | Medium | - | Health and power values, counters, timers on frames. |
| `small` | 10 (7 - 13) | Medium | - | Secondary lines: bar text, the info strip, hints, keybinds. |
| `tiny` | 9 (6 - 12) | Medium | - | The error badge. |
| `world` | 11 (8 - 14) | SemiBold | OUTLINE | Text drawn in the world: nameplate names. |
| `barName` | 11 (8 - 14) | SemiBold | OUTLINE | Names over a bright bar (raid tiles). |
| `barSmall` | 10 (7 - 13) | Medium | OUTLINE | Small text over a bar (raid tile status, the damage meter, the flight timer). |
| `cooldown` | 14 (10 - 18) | SemiBold | OUTLINE | Cooldown numbers on action buttons and the Cooldown Manager. |
| `auraCount` | 10 (7 - 13) | SemiBold | OUTLINE | Stack counts on aura and item icons. |
| `auraTimer` | 11 (8 - 14) | SemiBold | OUTLINE | The timer on larger aura icons. |
| `auraTimerSmall` | 9 (6 - 12) | SemiBold | OUTLINE | The timer on smaller aura icons. |
| `chat` | 12 (8 - 16) | Medium | - | Chat windows ("Medium"). |

Sizes that are not roles, all inside the code-quality rule because they are scaled with `T.ScaledSize` and set on the game's font objects: chat's Small/Medium/Large (10/12/14, `Modules/Chat.lua`), the tooltip fonts (header 14 SemiBold, body 12, small 11, `Modules/Tooltips.lua`) and the game's quest tracker fonts (header 13 SemiBold, lines 12, `Modules/MenuStrip.lua`).

The `outline` setting (default `""`) adds an outline to every role that has none; it has no control in the options window.

## Spacing

The theme has no spacing tokens: each layout keeps its sizes as constants in its own file (`OptionsWindow.lua` `WIDTH, HEIGHT, NAV_WIDTH, BAR = 780, 560, 176, 40` and 28 px rows; `Setup.lua` `PAD = 16`; `RaidTools.lua` `PAD, GAP = 4, 2`). The offsets in use are almost all even: 8 is the most common, then 2, 4 and 12, with some 6, 3, 10 and 14 in older code. For new and restyled layouts:

- **4 px steps** for padding and gaps between unrelated things: 4 (tight), 8 (default), 12, 16 (window padding).
- **2 px** only for the gap between repeated cells of one control (raid tiles, minimap buttons, swing timer rows).
- **Rows** are 28 px in the options window (check, cycle, slider), 30 for the swatch row, 32 for buttons, 20 for a text line.
- Borders and sheens are measured in screen pixels, not UI units (below), so they never count toward the grid.

## Panels, borders, sheen, shadow, glow

| Primitive | What it paints |
| --- | --- |
| `T.Panel(frame, opts)` | A `panel` fill (`inset` with `opts.inset`, `raised` with `opts.raised`, alpha `opts.alpha`), a one-screen-pixel border in `edge` (or the accent with `opts.accent`, or `T.SetBorder`'s colour), a one-pixel `sheen` line just inside the top border, and with `opts.shadow` a soft shadow. `noBg`, `noBorder`, `noSheen` leave a part out. |
| `T.HudPanel(frame, opts)` | `T.Panel` for the HUD (unit frames, bars, the minimap): never a sheen, and a shadow only when "Soft shadows under frames" (`hudShadow`, off by default, applies on reload) is on, so the screen stays calm. |
| `T.Button(button)` | An `inset` panel, the template's art faded out, and a `hover` wash. |
| `T.EditBox(box)` | An `inset` panel, the template's art faded out. |
| `T.CloseButton(button)` | The Close icon (12 x 12) in `text2`, a `hover` wash, the template's art faded out. |
| `T.Glow(frame, size)` / `T.ShowGlow(glow, on, color)` | A soft ring around a frame (default 8 units; action buttons use 6), hidden until shown, in the accent unless a token is given. Action buttons glow for a spell the game highlights. `T.SizeGlow(glow, frame, pixels)` sizes a ring to whole screen pixels at the frame's scale (the nameplate target glow is 2 px). |
| `T.Slot(frame)` / `T.SlotState(frame, state)` | A slot tile (the bag and menu bar): a raised fill, a one-pixel border with a one-pixel accent edge inside it, a light line along the top and a dark one along the bottom (a bevel), and a small soft shadow. The accent edge brightens for `"hover"` and darkens for `"pressed"`. |
| `T.Logo(parent, size)` | The two linked diamonds: left in the accent, right in `text`. |
| `T.Crest(parent, size, layer, alpha)` | The faction crest in its token colour, hidden while the faction look is off. |

**Borders are one screen pixel at any UI scale.** `T.Pixel(frame)` is the length of one physical pixel in the frame's units (the client's `PixelUtil` factor, else 768 / screen height, over the frame's effective scale). It is never rounded to whole UI units, which would give 2 px at 1440p and 3 px at 4K. Textures painted by the theme are kept off the client's pixel-grid snapping (`T.Snap`) so 1 px lines stay crisp. A status bar's border is drawn on its top layer (the fill would cover a lower one). "Pixel-perfect scale" (off by default) sets UIParent to 768 / screen height, out of combat, so one UI unit is one pixel; the setup wizard's screen presets turn it off, since they set the game's UI scale instead.

**Shadows** are a nine-slice ring of `Media/Textures/Shadow` (black, 0.8 alpha, soft falloff) reaching 10 units around the frame on every side, rounded to whole pixels, on the BACKGROUND layer. Floating windows always have one: the options window, setup, dialogs, menus and popovers, the quest dialog and log, tooltips, bags, skinned game windows, alerts. HUD frames have one only with `hudShadow`.

## Bars

| Setting `barTexture` | Texture | Look |
| --- | --- | --- |
| `"forever"` (default) | `Media/Textures/Bar` | A bright top line, then a gentle darkening to the bottom (grayscale 256 x 32, tinted by the bar colour). |
| `"soft"` | `Media/Textures/BarSoft` | No top line, only a slight darkening: calmer and flatter. |
| `"flat"` | `WHITE8X8` | A solid colour. |
| any other name | A status bar texture shared through LibSharedMedia | Listed in the Bar texture picker after the three built-ins; if the addon that shared it is gone, Forever comes back. |

ForeverUI shares its three bars through LibSharedMedia as "ForeverUI Forever", "ForeverUI Soft" and "ForeverUI Flat". The bar texture applies on reload. `T.StyleBar(bar)` gives a bar the texture; `T.SetBarValue(bar, value)` lets the client ease the change ("Smooth health and power bars", on by default, where the client has `StatusBarInterpolation`); `T.Spark(bar, width)` adds the soft additive spark (cast bars 8 wide in `white` at 0.8, power ticks 6 wide in `spark`). Shields are drawn with `Media/Textures/Stripes` in `shield`; the raid tile dispel wash with `Media/Textures/Fade`.

## Icons

`Media/Icons/*.tga` are white line glyphs drawn on a 16-unit grid at 32 x 32 px by `scripts/lib/media-sources.mjs` and shown at 16 px (options nav, menu strip, close and arrow controls) or smaller (raid marks at about 10 px, which are filled shapes for that reason).

- **One grid unit is one pixel at 16 px.** Strokes are 2 units (2 px) wide (`STROKE`).
- **Straight strokes sit on whole units** (`crisp`, `rect`: square-ended boxes), so each covers exactly two rows or columns of pixels at 16 px instead of smearing across three. `scripts/media.test.mjs` checks that the icons made only of straight strokes have no half-covered pixel at 16 px.
- **45-degree strokes run half a unit off the grid** (the close cross, the check, the arrows, the map diamond), which lands each step of the stroke on whole pixels.
- Where 2 px strokes do not fit, a glyph uses filled shapes (the action bar buttons) or 1 px strokes (the six raid tiles); curves (rings, arcs) stay round. They are tinted with tokens: `text2` at rest in the options nav, `text` at rest on the menu strip, the accent under the mouse or when selected, `muted` when disabled. Regenerate them with `npm run media`, never by hand; `node scripts/build-media.mjs --check` (and `npm run verify`) fails if a committed file does not match its source.

## Theme settings

All in the profile's `theme` table (`T.Settings()`), exported with the profile; `/fui theme reset` (or Reset theme under General → Look) puts them all back.

| Setting | Default | Control | Applies |
| --- | --- | --- | --- |
| `accent` | brass | swatches, hex box, `/fui accent` | at once |
| `panel`, `inset`, `border` | see tokens | none | at once (`T.Refresh`) |
| `font` | `""` (Fira Sans Condensed) | General → Look → Font | at once |
| `outline` | `""` | none | at once |
| `textScale` | 1 | General → Look → Text size (70 % - 130 %) | at once |
| `faction` | `"auto"` | General → Look → Faction look | at once |
| `pixelScale` | off | General → Look → Pixel-perfect scale | on: at once, out of combat; off: on reload |
| `barTexture` | `"forever"` | General → Bars → Bar texture | on reload |
| `smoothBars` | on | General → Bars → Smooth health and power bars | at once |
| `hudShadow` | off | General → Bars → Soft shadows under frames | on reload |
| `reduceMotion` | off | General → Motion and sound → Reduce motion | at once |
| `sounds` | on | General → Motion and sound → Interface sounds | at once |

## Motion and sound

ForeverUI moves little and quietly. Every fade goes through the theme (`T.FadeIn`, `T.FadeOut`, `T.StopFade`): an alpha animation on frames that are not protected (never a secure frame), 0.12 s unless the caller asks for another length. **In combat no fade lasts longer than 0.15 s** (`T.COMBAT_FADE`, applied by `T.FadeTime`): combat counts from the fight's `PLAYER_REGEN_DISABLED` (which comes just before the client's lockdown) until `PLAYER_REGEN_ENABLED`. **Reduce motion** (General → Motion and sound, off by default) turns every fade into an instant show or hide. **Interface sounds** (on by default) turns ForeverUI's own interface sounds off. Everything else that changes on screen does so at once, without animation.

### Fades and flashes

| What | Kind | Out of combat | In combat | Turned off by |
| --- | --- | --- | --- | --- |
| Options window (`/fui`) opens | fade in | 0.12 s | 0.12 s | Reduce motion |
| Options window closes | fade out | 0.12 s | 0.12 s | Reduce motion |
| Options page change | stops a fade in progress; the page appears at once | - | - | - |
| Unlock mode: a frame's popover (right-click a handle) opens / closes | fade in / out | 0.12 s | closes in 0.12 s (a fight ends unlock mode) | Reduce motion |
| Setup wizard opens, or comes back after a fight | fade in | 0.12 s | - (waits for the fight to end) | Reduce motion |
| AFK screen appears | fade in | 0.4 s | - (never opens in a fight) | Reduce motion |
| AFK screen goes (you are back, a click or key, a fight starts) | fade out | 0.2 s | 0.15 s | Reduce motion |
| Cast bar ends | flash: the bar fills, green for a finished cast, red with the reason (Interrupted, Failed) | held while it fades | held while it fades | Reduce motion (the bar hides at once) |
| Cast bar ends, then | fade out | 0.35 s | 0.15 s | Reduce motion |
| Bars and strips on mouseover or conditions (action bars, the menu and bag strips, ...) | alpha 0 / 1 | instant | instant | - (no animation) |
| Raid tiles out of range | alpha 40 % | instant | instant | Fade players out of range (Raid frames) |
| Health and power bars | the client eases the value (`ExponentialEaseOut`) | the client's easing | the client's easing | Smooth health and power bars |
| Action button proc glow | the accent glow ring shows while the game highlights the spell | static, no animation | static | - |
| Aura and cooldown sweeps | the dark sweep, no edge line and no end flash (bling) | the aura's duration | the aura's duration | - |
| Micro menu buttons | the game's own alert flash (kept on the strip) | the game's | the game's | - (the game's) |
| Stance and pet bars | the game's attack flash and auto-cast mark (kept) | the game's | the game's | - (the game's) |

Sparks (cast bars, power ticks, the swing timer) move with what they show; they are not fades and Reduce motion leaves them.

### Sounds

All are the client's own interface sounds (`SOUNDKIT`), played with `T.Sound` unless noted.

| When | Sound | Turned off by |
| --- | --- | --- |
| The options window opens | `IG_MAINMENU_OPEN` | Interface sounds |
| The options window closes | `IG_MAINMENU_CLOSE` | Interface sounds |
| Another options page opens | `IG_CHARACTER_INFO_TAB` | Interface sounds |
| A switch is turned on in the options, a visibility condition is ticked or unticked, a click-cast starter layout is applied | `IG_MAINMENU_OPTION_CHECKBOX_ON` | Interface sounds |
| A switch is turned off in the options, or a row's reset dot is clicked | `IG_MAINMENU_OPTION_CHECKBOX_OFF` | Interface sounds |
| A rare shows up on the minimap (out of combat, once per rare) | `RAID_WARNING`, with one chat line | "A rare nearby: a sound and a chat line" (off by default; not Interface sounds, since it is an alert you asked for) |

The game's own sounds (error messages, the micro menu, windows ForeverUI restyles) stay the game's.

## Where the plan and the code differ

The work plan (P4.1) described the theme from an earlier review. The code is what ships, so this page follows it:

- **Text sizes.** The plan says "title 14 … tiny 9". The code has `title` 15, `heading` 13, `name`, `label` and `number` 12, `cell` 11, `small` 10, `tiny` 9, plus the outlined roles (`world`, `barName`, `barSmall`, `cooldown`, `auraCount`, `auraTimer`, `auraTimerSmall`) and `chat`.
- **Spacing grid.** The plan speaks of a 4/8 px grid. The code has no spacing tokens and uses mostly even offsets (2 to 16); the 4 px steps above are the rule for new work, not a description of every existing layout.
- **Bar textures.** The plan names "bar textures" generally. The code has three built-ins (Forever, Soft, Flat) and, since P3.5, every bar texture shared through LibSharedMedia; it also shares its own bars and fonts under the "ForeverUI ..." names.
- **Fonts.** Besides Fira Sans Condensed and the game's font, the Font picker lists LibSharedMedia fonts (P3.5), and the faction look adds Cinzel and Metamorphous for titles and headings.
- **Accents.** The plan's five presets match the code (brass, arcane, fel, void, ember); the code also accepts any hex colour and the older names bronze, blue, green, purple and red.
- **Default sizes** of unit frames, raid tiles, action buttons, the menu strip and windows are not theme tokens; they live in each module and the setup wizard's screen presets (`Core/Setup.lua`), and are described in the README.
