# Vanguard theme spec ("Slate & Brass")

This is the reference every style change cites. It is written from `Core/Theme.lua` (and `Core/SharedMedia.lua`, `scripts/lib/media-sources.mjs`) as they are, not from the work plan's notes: where the two disagree, the code is what ships and this page follows the code (see [Where the plan and the code differ](#where-the-plan-and-the-code-differ)). If you change a token, a role or a primitive, change this page in the same commit.

The look in one line: flat dark slate panels, one-screen-pixel borders, one accent colour, one font (Fira Sans Condensed), and textures that are plain white or grayscale shapes tinted by the theme. Nothing depends on art from another addon.

## Rules

- **Colours and font sizes live only in `Core/Theme.lua`.** Modules ask for a colour by token name (`T.RGB`, `T.Color`, `T.Tint`, `T.BarColor`, `T.Paint`, `T.Hex`) and for text by role (`T.Text(fs, role)`). `scripts/lib/code-quality.mjs` fails the build on a colour setter called with numbers, a 0-1 colour table, a written-out `|cff......` escape, or a `:SetFont(path, <number>)` outside the theme.
- **Every painted frame follows live changes.** `T.Panel`, `T.Button`, `T.EditBox`, `T.CloseButton`, `T.Logo` and `T.Crest` remember what they painted; `T.Refresh()` (run by `/vg accent`, the accent swatches, a font or text-size change, a UI scale change) repaints them and re-fonts every string styled with a role. Anything coloured by hand registers with `T.OnChanged(fn)`.
- **Primitives are idempotent.** Calling one again on the same frame repaints it; it never adds a second border.
- **Other addons get the same tools** through the Skin API (`Vanguard.RegisterSkin`, `Core/Skin.lua`): `S.Panel`, `S.Button`, `S.EditBox`, `S.CloseButton`, `S.WindowControl`, `S.FadeRegions`, `S.SetFont`, `S.Text`, `S.Color`, `S.RGB`, `S.Tint`, `S.BarColor`, `S.Pixel`, `S.Accent`, `S.PanelColor`, `S.Font`, `S.OnChanged`.

## Colour tokens

`T.RGB(name)` returns r, g, b, a (0-1). Four tokens come from the theme settings, so a profile can change them; the rest are fixed. A name that is not a token is an error, not a silent white.

### From the settings

| Token | Default | Setting | Role |
| --- | --- | --- | --- |
| `accent` | `d9a441` (brass) | `accent` | The one highlight colour: selected nav items, focus and target edges, glows, links, header rules, the logo's left diamond, the minimap's corner diamonds. Changed by `/vg accent`, the swatches under General → Look, or the hex box beside them. |
| `accentText`, `accentDim` | `e6b45b`, `8a6a2f` (from brass) | `accent` | Made from the accent in OKLCH (`T.ACCENT_VARIANTS`: lightness +0.047 and chroma x0.94 for text, -0.207 and x0.67 for dim), so every preset and custom hex gets them, worked out once per accent. `accentText` is for accent-coloured text: selected choices, captions, tabs, headers, badges, links, the `Vanguard:` chat prefix, and `T.Color` with no colour. `accentDim` is for accent borders and ornament only, never text. The `accent` itself stays for bars, borders, glows and selected fills. |
| `panel` | `13161c` at 0.94 | `panel` | The fill of every panel (`T.Panel`, `T.HudPanel`). Softened raid bars mix their class colour into it. |
| `inset` | `0c0e13` at 0.95 | `inset` | The darker fill of buttons, edit boxes and inset panels (`opts.inset`). |
| `edge` | `000000` | `border` | Every one-pixel border unless a frame sets its own (`T.SetBorder`) or asks for the accent (`opts.accent`). |

`panel`, `inset` and `border` have no control in the options window: they are kept in the profile (and its export string) and go back to these defaults with `/vg theme reset`. A profile keeps the values it saved, so a profile made before the surfaces were re-stepped (#229) keeps `12151b` and `07080b` until `/vg theme reset`.

### Fixed tokens

The surfaces (`inset`, `panel`, `raised`, `raisedHover`, `divider`, `borderHi`) step about 0.04 apart in OKLCH lightness at one cool hue, so each separates from the next at one pixel.

| Group | Token | Value | Role |
| --- | --- | --- | --- |
| Surfaces | `void` | `0b0d11` | Near-black for text and marks drawn on an accent fill: a selected segment or condition, the setup wizard's check. |
| | `raised` | `1b1f26` | The lighter fill of raised panels (`opts.raised`): dropdown menus, popovers, the spell picker, keybind mode. |
| | `raisedHover` | `262a32` | An opaque control under the mouse, in place of the `hover` wash. |
| | `borderHi` | `43484f` | A lighter line: the inner bevel and the base of a focus ring. |
| | `sheen` | `ffffff` at 0.06 | The one-pixel light line inside a panel's top border. |
| | `divider` | `2f343d` | Lines between sections (the options window). |
| | `shade` | `000000` at 0.5 | Dimming behind or under things: the options nav, unit frame bar backgrounds, the cast bar's latency zone, the AFK screen. |
| | `hover` | `ffffff` at 0.08 | The faint white wash under the mouse on rows, tabs, raid tiles and menu icons (see-through things; buttons ease to `raisedHover`). |
| | `darkBar` | `2a3039` | The health bar of the raid style "Dark, class-coloured names". |
| | `checked` | `ffffff` at 0.25 | An action button that is checked (an active stance or aura). |
| | `gridline` | `ffffff` at 0.12 | The unlock-mode grid. |
| | `textShadow` | `000000` at 0.9 | The drop shadow under text roles without an outline. |
| | `sweep` | `000000` at 0.65 | The dark sweep over an aura icon as its time runs out. |
| | `spark` | `ffffff` at 0.9 | The power bar's tick spark (five-second rule, energy ticks). |
| Text | `text` | `e8eaee` | Body text (the default colour of `T.Text`). |
| | `text2` | `c8cdd6` | Secondary text, hints, the close glyph, assistant marks. |
| | `muted` | `a6adb9` | Least important text: card titles, descriptions, notes. |
| | `disabled` | `7c8390` | Disabled and placeholder text only (a search box's hint, a button you can't press yet, a disabled menu icon). |
| | `white` | `ffffff` | Text and sparks over bars and icons (timers, counts, the cast spark). |
| | `gold` | `ffd100` | The game's gold: quest titles and "!" marks, money, elite units, the leader's crown, the zone name's default. |
| State | `good` | `3fbf9a` | Success, ready, full durability. Off the red-green axis with `warn` and `bad` (#235, after Okabe-Ito); where a state stands alone as a mark it has a glyph too (`T.STATE_GLYPHS`: `Check`, `Warn`, `Close`), as on the pet's mood. |
| | `warn` | `f0b43c` | Warnings, middling values. |
| | `bad` | `e8663f` | Errors, not ready, broken items. |
| | `info` | `5aa2f0` | Informational state (reserved; no module uses it yet). |
| | `unknown` | `808080` | A value the client will not tell (reserved; no module uses it yet). |
| Reaction | `hostile` | `cc4b45` | Hostile units (nameplates, unit frames). |
| | `neutral` | `e0c24e` | Neutral units. |
| | `friendly` | `4db86a` | Friendly units. With Color assist on (`colorAssist`, #235) the three reactions are `T.ASSIST`'s instead: friendly `4a9be8` (blue), neutral `e8d25a`, hostile `e0663a` (vermilion). |
| Resources | `mana` / `rage` / `energy` / `focus` | `3e7be0` / `cf4a3e` / `e6c24a` / `e0893c` | Power bars. |
| Threat | `threat1` / `threat2` / `threat3` | `e0c24e` / `ee8b3a` / `e0565b` | Yellow, orange, red threat. |
| Dispel | `magic` / `curse` / `disease` / `poison` | `3c8cf0` / `9a55e0` / `b08a3a` / `3fa34d` | Debuff borders and the raid tile dispel wash. Every debuff icon also carries a type badge (#235): its letter (`Media/Icons/DispelMagic`, `DispelCurse`, `DispelDisease`, `DispelPoison`) in the type's colour on an `edge` backing at 0.8, half the icon (at least 8 units) in its top-left corner; on the client's aura engine each letter is mapped clear for every type but its own, so hidden types keep theirs. |
| | `dispel` | `cc4dff` | The dispel highlight when the client hides the debuff's type. |
| Casts | `cast` | `e6a93a` | A cast. |
| | `channel` | `4fc27a` | A channel. |
| | `shielded` | `8b9099` | A cast you cannot interrupt. |
| Healing | `heal` | `4fc27a` at 0.45 | Incoming heals over a health bar. |
| | `shield` | `ffffff` at 0.35 | Absorb shields (over the Stripes texture: one 8 px diagonal tile, repeated both ways so the seams are exact and the stripes don't shimmer, #257). |
| Action buttons | `outOfRange` / `noPower` / `unusable` | `e64d4d` / `6680ff` / `666666` | Icon tints. |
| XP and reputation | `xp` / `rested` | `940090` / `0063e0` at 0.5 | The XP bar and its rested overlay. |
| | `repHostile` / `repUnfriendly` / `repNeutral` / `repFriendly` | `cc2121` / `bf4500` / `e6b300` / `00991a` | Reputation bar by standing. |
| Faction look | `allianceCrest` / `hordeCrest` | `d6b25a` / `c8453a` | The crest's colour. |
| Zone text | `zoneSanctuary` / `zoneFriendly` / `zoneHostile` / `zoneContested` | `69ccf0` / `1aff1a` / `ff1a1a` / `ffb300` | The minimap's zone name by PvP status. |

Colours that are not tokens on purpose: class colours come from the client (`RAID_CLASS_COLORS`), item quality colours from the client, and the quest tracker's quest colours stay the game's. The raid style "Class colours, softened" mixes 70 % of the class colour with 30 % of `panel` (`RF.Soften`, `Modules/RaidFrames.lua`).

## Accent presets

`T.PRESET_ORDER` is the order of the swatches under General → Look and in the setup wizard; `/vg accent <name>` takes the same names, any `rrggbb` or `#rrggbb`, or `reset`.

| Preset | Hex | Older names that still work |
| --- | --- | --- |
| brass (default) | `d9a441` | bronze |
| arcane | `5aa2f0` | blue |
| jade | `4fbfa3` | fel, green |
| orchid | `b48ae8` | void, purple |
| copper | `c8784a` | ember, red |

The state colours (`good`, `warn`, `bad`) are kept apart from every preset, so an accent never reads as a warning, and jade, orchid and copper keep clear of item quality and class colours too (#231: they replaced fel `5bcb7e`, near Uncommon and Hunter; void `a47bf0`, near Epic and Warlock; and ember `e0664b`, near `bad`). An older name now gives the new colour; a profile that picked fel, void or ember keeps that colour as its own hex. Arcane shares its hex with `info`.

## Text

### Fonts

| Setting `font` | Font |
| --- | --- |
| `""` (default) | Fira Sans Condensed, bundled: Medium for regular roles, SemiBold for bold ones (`T.FONTS.regular`, `T.FONTS.bold`). Latin, Greek and Cyrillic, tabular digits. |
| `"client"` | The game's font (`STANDARD_TEXT_FONT`). Korean and Chinese clients always use it, whatever the setting. |
| any other name | A font shared through LibSharedMedia (the Font picker lists them after the two built-ins). If the addon that shared it is gone, Fira Sans Condensed comes back. A font path from older settings still works. |

Vanguard shares its own fonts through LibSharedMedia as "Vanguard Fira Sans" and "Vanguard Fira Sans SemiBold" (western and Russian clients). The faction look swaps the font of the `title` and `heading` roles only: Cinzel SemiBold for Alliance, Metamorphous for Horde, and only while the Font setting is Fira Sans and the client uses it (not on Russian clients: Cinzel and Metamorphous have no Cyrillic). The font and text size apply at once (every role-styled string is re-fonted).

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
| `small` | 10 (7 - 13) | Medium | - | Secondary lines: bar text, the info strip, hints, keybinds. At a pixel-perfect scale a point is a screen pixel, so no role but `badge` goes under 10 (#258). |
| `tiny` | 10 (7 - 13) | Medium | - | The floor for raid tile text that shrinks with the tile. |
| `badge` | 9 (6 - 12) | Medium | - | The only role under 10: a count or mark on a tiny badge (the error badge, the backpack's free-slot count). |
| `world` | 11 (8 - 14) | SemiBold | OUTLINE | Text drawn in the world: nameplate names. |
| `barName` | 11 (8 - 14) | SemiBold | OUTLINE | Names over a bright bar (raid tiles). |
| `barSmall` | 10 (7 - 13) | Medium | OUTLINE | Small text over a bar (raid tile status, the damage meter, the flight timer). |
| `cooldown` | 14 (10 - 18) | SemiBold | OUTLINE | Cooldown numbers on action buttons, the Cooldown Manager and the Cooldown gaps row (that row has no fades or sounds). |
| `auraCount` | 10 (7 - 13) | SemiBold | OUTLINE | Stack counts on aura and item icons. |
| `auraTimer` | 11 (8 - 14) | SemiBold | OUTLINE | The timer on larger aura icons. |
| `auraTimerSmall` | 10 (7 - 13) | SemiBold | OUTLINE | The timer on smaller aura icons. |
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
| `T.Panel(frame, opts)` | A `panel` fill (`inset` with `opts.inset`, `raised` with `opts.raised`, alpha `opts.alpha`), a one-screen-pixel border in `edge` (or the accent with `opts.accent`, or `T.SetBorder`'s colour), a one-pixel `sheen` line just inside the top border, and with `opts.shadow` a soft shadow. A raised panel (or `opts.bevel`; `T.Button` always) also gets an inner bevel (#234, `T.BEVEL`): a one-pixel `borderHi` line at 35 % on the first row inside the top border and a `shade` line at 35 % on the first row inside the bottom, and its sheen moves down to the second row so the two never merge; `opts.noBevel` leaves it out (slots have their own). `opts.pad` draws it all that many units out past the frame (game windows use 6, room their thick border art used to take; `T.Padding(frame)` reads it back). `noBg`, `noBorder`, `noSheen` leave a part out. With `panelGradient` on (`/vg gradient`, off by default, #259) a floating window's fill (`opts.shadow`, or `opts.gradient`) runs from `T.PANEL_GRADIENT[1]` (-0.012) to `[2]` (+0.012) OKLCH lightness bottom to top (`SetGradient` VERTICAL, alpha kept), about 2.4 % in all, under 7 of 255 levels; smaller panels stay flat. |
| `T.HudPanel(frame, opts)` | `T.Panel` for the HUD (unit frames, bars, the minimap): never a sheen, and a shadow only when "Soft shadows under frames" (`hudShadow`, off by default, applies on reload) is on, so the screen stays calm. |
| `T.Button(button)` | An `inset` panel, the template's art faded out, and an eased hover (#257): a `raisedHover` fill over the inset and a one-pixel `borderHi` line inside the top border, easing in over `T.HOVER_IN` (0.1 s) and out over `T.HOVER_OUT` (0.13 s), eased out (`OUT` smoothing), never on a disabled button, cleared at once when the button hides (`T.EaseHover`). Pressed (#257, `T.PRESS`, `T.PressButton`): a `shade` overlay at 30 % over the fill and its own label (`button.text`) one screen pixel lower, at once, while the mouse is held; a protected button darkens but keeps its label still. Disabled (#257, `T.DisabledLook`, run by the button's `OnDisable` and `OnEnable`): no hover or press and the label in `disabled`, its own colour back when enabled again. |
| `T.FocusRing(frame, on)` | The keyboard focus ring (#257): a one-pixel `accentText` ring two screen pixels outside the frame, with a one-pixel `edge` (black) gap between, placed at the frame's pixel size, never animated. The options window puts it on the row Tab marks and takes it off on a new page or when it closes. |
| `T.EditBox(box)` | An `inset` panel, the template's art faded out. |
| `T.WindowControl(button, icon, opts)` | A window control (close, maximize, minimize): the template's art faded, the glyph (`T.CONTROL`: drawn on a 20-unit grid, its mark in the middle 9 to 11 units; maximize and minimize are diagonal arrows pointing out and in) in `text2` on a faint 20 x 20 `raised` tile at 0.9; under the mouse that tile turns (`bad` at 0.9 with `opts.tile = "close"`, else the `accent` at 0.35) and the glyph `white`. An unsized button takes the tile's size. |
| `T.ControlPlate(button)` | Only a window control's resting tile (`T.CONTROL_TILES.rest`, the tile's size, centered), behind a button in a window's control row that keeps its own icon (the character pane's right-half arrow, the group finder's gear). |
| `T.CloseButton(button)` | `T.WindowControl` with the plain cross (`CloseMark`) and the red tile. |
| `T.PlaceClose(close, panel)` | Puts a close button where every window has it: its middle `T.CONTROL.inset` (24) in from the panel's top-right corner on both axes, counting the panel's padding; the game's windows go through `GW.DressClose` (Modules/Windows.lua), which also puts a maximize/minimize box `T.CONTROL.step` (28) left of it. |
| `T.Glow(frame, size)` / `T.ShowGlow(glow, on, color)` | A soft ring around a frame (default 8 units; action buttons use 6), hidden until shown, in the accent unless a token is given. Action buttons glow for a spell the game highlights. `T.SizeGlow(glow, frame, pixels)` sizes a ring to whole screen pixels at the frame's scale (the nameplate target glow is 2 px). |
| `T.Slot(frame, opts)` / `T.SlotState(frame, state)` | A slot tile: a raised fill, a one-pixel border with a one-pixel accent edge inside it, a light line along the top and a dark one along the bottom (a bevel), and a small soft shadow. The accent edge brightens for `"hover"` and darkens for `"pressed"`. `opts.quiet` hides the accent edge until the slot has a state; `opts.well` makes it a dark well ringed in a lighter line, with no bevel (`T.SLOT_WELL`; the bag and menu bar), for art that isn't a full square icon. |
| `T.Logo(parent, size)` | The two linked diamonds: left in the accent, right in `text`. |
| `T.Crest(parent, size, layer, alpha)` | The faction crest in its token colour, hidden while the faction look is off. |

**Borders are one screen pixel at any UI scale.** `T.Pixel(frame)` is the length of one physical pixel in the frame's units (the client's `PixelUtil` factor, else 768 / screen height, over the frame's effective scale). It is never rounded to whole UI units, which would give 2 px at 1440p and 3 px at 4K. Textures painted by the theme are kept off the client's pixel-grid snapping (`T.Snap`) so 1 px lines stay crisp. `T.Snap(texture, class)` puts a texture under one snapping policy by class (`T.SNAP_CLASSES`): with texel snapping on (`/vg texelsnap`, off by default until an in-game A/B test settles it, #226) the still classes (`border`, `fill`, `divider`, `sheen`) snap to the pixel grid with a bias of `T.SNAP_BIAS` (1), and the moving ones (`bar`, `spark`, `swipe`) and art (`icon`, the default) stay off. `T.SetTexelSnap(on)` and `T.Refresh` re-apply it to every texture at once. A status bar's border is drawn on its top layer (the fill would cover a lower one). "Pixel-perfect scale" (off by default) sets UIParent to 768 / screen height times `pixelMultiple` (a whole number, 1 unless setup's Pixel-perfect preset picks 2 for a 4K screen), out of combat, so one UI unit is one or two whole pixels; the setup wizard's other screen presets turn it off, since they set the game's UI scale instead.

**Sizes and offsets land on whole screen pixels.** `T.PixelRound(frame, length, even)` rounds a length to whole pixels at the frame's scale (to an even count with `even`, for things centred on a frame). `T.PixelSize(frame, w, h, even)` sizes a frame that way and remembers it; panel padding, glows and sheens, the close and window controls, arrows, the logo, unit frames, the options and setup windows and the action bars' button sizes and gaps use them. When the UI scale, the screen size or a frame's mover scale changes, `T.Rescale()` sizes them again on the next frame, out of combat (queued until the fight ends), and calls the `T.OnScale(fn)` listeners (the action bars lay out again).

**Shadows** are a nine-slice ring of `Media/Textures/Shadow` (black, 0.8 alpha, soft falloff) reaching 10 units around the frame on every side, rounded to whole pixels, on the BACKGROUND layer. Floating windows always have one: the options window, setup, dialogs, menus and popovers, the quest dialog and log, tooltips, bags, skinned game windows, alerts. HUD frames have one only with `hudShadow`. With `sliceRings` on (`/vg nineslice`, then a reload; off by default until an in-game check, #236) each shadow and glow is instead one texture the client slices itself (`SetTextureSliceMargins`, `T.SLICE_MARGIN` 16 texture pixels, the client's default stretched mode), anchored the same whole-pixel distance out; a client without texture slicing keeps the eight pieces.

## Bars

| Setting `barTexture` | Texture | Look |
| --- | --- | --- |
| `"vanguard"` (default; `"forever"` before 0.4.0, read as `"vanguard"`) | `Media/Textures/Bar` | A bright top line, then a gentle darkening to the bottom (grayscale 256 x 32, tinted by the bar colour). |
| `"soft"` | `Media/Textures/BarSoft` | No top line, only a slight darkening: calmer and flatter. |
| `"flat"` | `WHITE8X8` | A solid colour. |
| any other name | A status bar texture shared through LibSharedMedia | Listed in the Bar texture picker after the three built-ins; if the addon that shared it is gone, the Vanguard bar comes back. |

Vanguard shares its three bars through LibSharedMedia as "Vanguard", "Vanguard Soft" and "Vanguard Flat". The bar texture applies on reload. `T.StyleBar(bar)` gives a bar the texture; `T.SetBarValue(bar, value)` lets the client ease the change ("Smooth health and power bars", on by default, where the client has `StatusBarInterpolation`); `T.Spark(bar, width)` adds the soft additive spark (cast bars 8 wide in `white` at 0.8, power ticks 6 wide in `spark`). Shields are drawn with `Media/Textures/Stripes` in `shield`; the raid tile dispel wash with `Media/Textures/Fade`.

## Game frame primitives

For the game's own windows (`Modules/Windows*.lua`, docs/design/RESKIN.md), and through the skin API (`S.Tab`, `S.Tooltip`, `S.ScrollBar`, `S.FontObjects`) for other addons. Each is safe to call again and fades the game's art by alpha only, so the game's layout and show/hide code keep working.

| Primitive | What it does |
| --- | --- |
| `T.Tab(button)` | A tab of any of the game's three tab templates (`PanelTabButtonTemplate`, `TabSystemButtonTemplate`, `LargeSideTabButtonTemplate`): the parts in `T.TAB_ART` faded (the icon and text kept), an `inset` panel without sheen and the `hover` wash; the selected tab is `raised` with a 2-pixel `accent` bar (`T.TAB_BAR`) along `opts.bar` (TOP by default; game windows give the edge away from the window), and with `opts.dimIcon` the other tabs' icons are greyed and faded (`T.TAB_DIM`). It follows the game's selection: `SetTabSelected` (tab systems), `SetChecked` (side tabs), else disabled (the game selects a panel tab by disabling it). |
| `T.Tooltip(frame)` | A tooltip-like frame (tooltips, menus, small panels): the panel at alpha 0.94 with a soft shadow, the game's `NineSlice` faded. |
| `T.ScrollBar(bar)` | The game's `MinimalScrollBar` and `WowTrimScrollBar`: the parts in `T.SCROLL_ART` and the thumb's art faded, the thumb a `raised` panel whose edge goes `accent` under the mouse, the Back/Forward arrows as flat buttons with the Down icon in `text2` (turned over for Back). A bar without a thumb is left alone. |
| `T.FontObjects(map)` | The theme font, at `T.ScaledSize(size)`, on the game's font objects in `{ Name = { size, bold } }`, re-applied by `T.Refresh` (font and Text size changes). Used for the tooltip and quest tracker fonts. |

## Icons

`Media/Icons/*.tga` are white glyphs made at 32 x 32 px by `scripts/lib/media-sources.mjs`. Most are line glyphs drawn on a 16-unit grid and shown at 16 px (menu strip, close and arrow controls) or smaller (raid marks at about 10 px, which are filled shapes for that reason). The options nav's page icons (`Nav*`) and the minimap's two slot buttons (`Minimap*`) are filled silhouettes rasterized from game-icons.net SVGs (`SILHOUETTES`; CC BY 3.0, credited in `art/CREDITS.md` and `Media/Icons/CREDITS.txt`) with one unit of clear air around them, shown at 16 and 12 px. The stroke rules below are for the drawn line glyphs; the tinting rules apply to all. Every tinted image is white in every pixel, its clear ones included, with the shape only in alpha, so filtering never pulls a dark fringe into a tinted edge; icons and the stand-alone shapes (the diamond, the logo halves) keep at least one clear pixel inside their canvas edge (`scripts/media.test.mjs` checks both).

- **One grid unit is one pixel at 16 px.** Strokes are 2 units (2 px) wide (`STROKE`).
- **Straight strokes sit on whole units** (`crisp`, `rect`: square-ended boxes), so each covers exactly two rows or columns of pixels at 16 px instead of smearing across three. `scripts/media.test.mjs` checks that the icons made only of straight strokes have no half-covered pixel at 16 px.
- **45-degree strokes run half a unit off the grid** (the close cross, the check, the arrows, the map diamond), which lands each step of the stroke on whole pixels.
- Where 2 px strokes do not fit, a glyph uses filled shapes (the raid marks); curves (rings, arcs) stay round. They are tinted with tokens: `text2` at rest in the options nav, `text` at rest on the menu strip, the accent under the mouse or when selected, `disabled` when disabled. Regenerate them with `npm run media`, never by hand; `node scripts/build-media.mjs --check` (and `npm run verify`) fails if a committed file does not match its source, or no source makes it any more (`npm run media` deletes those).

Game icons (spells, items, auras) go through `T.Crop(texture, w, h)`: it trims `T.ICON_EDGE` (0.08) off every edge, the art's baked-in bevel, and given a slot that isn't square, crops the long axis further so the icon keeps its aspect ratio (#259). Every slot Vanguard draws today is square.

## Theme settings

All in the profile's `theme` table (`T.Settings()`), exported with the profile; `/vg theme reset` (or Reset theme under General → Look) puts them all back.

| Setting | Default | Control | Applies |
| --- | --- | --- | --- |
| `accent` | brass | swatches, hex box, `/vg accent` | at once |
| `panel`, `inset`, `border` | see tokens | none | at once (`T.Refresh`) |
| `font` | `""` (Fira Sans Condensed) | General → Look → Font | at once |
| `outline` | `""` | none | at once |
| `textScale` | 1 | General → Look → Text size (70 % - 130 %) | at once |
| `faction` | `"auto"` | General → Look → Faction look | at once |
| `pixelScale` | off | General → Look → Pixel-perfect scale | on: at once, out of combat; off: on reload |
| `pixelMultiple` | 1 | Setup → Pixel-perfect (sharpest) | with `pixelScale`, out of combat |
| `texelSnap` | off | `/vg texelsnap` | at once |
| `sliceRings` | off | `/vg nineslice` | on reload |
| `variant` | `"default"` | General → Look → Theme variant, `/vg variant` | at once; `T.VARIANTS` token sets (#237): `contrast` (panel `0a0b0e` alpha 1, inset `050608`, raised `14161b`, divider `4a5260`, text `ffffff`, text2 `dfe3ea`, muted `b8bfca`, sheen alpha 0, saturated good/warn/bad/info, Color assist on, `ring` 2 px on accent-bordered frames, no gradient) `classic` (#218: panel `1c1610` alpha 0.96, inset `120d09`, raised `2b2117`, divider `4a3a24`, edge `6b5230`, sheen `ffd27a` at 8 %, text `f2e2b6`, text2 `d4bf8c`, muted `9c8a62`; `ornaments` always on) and `vellum` (panel `1a1612`, inset `100d0a`, raised `241f19`, divider `3a3226`, text `efe6d2`, text2 `d2c6ad`, muted `9a8f78`); `T.RGB` and `T.PanelColor` read the variant first; `T.Refresh` repaints. Parchment is not built |
| `panelGradient` | off | `/vg gradient` | at once |
| `ornaments` | off | `/vg ornaments`, General → Look → Window ornaments | at once; `T.Ornament(frame, kind, anchor)` (#238) gives a window one ornament, once: `"rule"` (a one-pixel rule along the bottom of `anchor` with a `Diamond` cut in the middle; the options window's header) or `"corners"` (four `OrnamentCorner` brackets, a one-pixel L with a 45° chamfer, `T.ORNAMENT_SIZE` 14 units, `T.ORNAMENT_INSET` 3 in; setup and the quest log). Tinted `accentDim`, never on combat frames; the faction crest watermark is not built |
| `slugText` | off | `/vg slug` | at once; adds the SLUG font flag to outlined world-text roles only (`T.FontFlags`, #239) |
| `frameBuffer` | off | `/vg framebuffer` | next window open or close; `T.OpenWindow`/`T.CloseWindow` call `SetIsFrameBuffer` on the window only while it fades, and only where the client has it (#239) |
| `barTexture` | `"vanguard"` | General → Bars → Bar texture | on reload; one material for every bar (#234): unit frames, raid tiles, cast bars, XP and reputation, the damage meter all fill with `T.BarTexture()`, and a test checks the whole HUD |
| `smoothBars` | on | General → Bars → Smooth health and power bars | at once |
| `hudShadow` | off | General → Bars → Soft shadows under frames | on reload |
| `colorAssist` | off | General → Look → Color assist | on reload |
| `reduceMotion` | off | General → Motion and sound → Reduce motion | at once |
| `sounds` | on | General → Motion and sound → Interface sounds | at once |

## Motion and sound

Vanguard moves little and quietly. Every fade goes through the theme (`T.FadeIn`, `T.FadeOut`, `T.StopFade`, `T.OpenWindow`, `T.CloseWindow`, `T.EaseHover`): an alpha animation, eased out, on frames that are not protected (never a secure frame) or on a button's own textures, 0.12 s unless the caller asks for another length. A window opens with `T.OpenWindow` (#257): it fades in over `T.WINDOW_OPEN` (0.13 s) while rising `T.WINDOW_RISE` (4) screen pixels into its own spot, so it ends on the pixel grid, and opens at once in combat; `T.CloseWindow` fades it out over `T.WINDOW_CLOSE` (0.1 s). **In combat no fade lasts longer than 0.15 s** (`T.COMBAT_FADE`, applied by `T.FadeTime`): combat counts from the fight's `PLAYER_REGEN_DISABLED` (which comes just before the client's lockdown) until `PLAYER_REGEN_ENABLED`. **Reduce motion** (General → Motion and sound, off by default) turns every fade into an instant show or hide. **Interface sounds** (on by default) turns Vanguard's own interface sounds off. Everything else that changes on screen does so at once, without animation.

### Fades and flashes

| What | Kind | Out of combat | In combat | Turned off by |
| --- | --- | --- | --- | --- |
| Options window (`/vg`) opens | fade in, rising 4 px into place | 0.13 s | at once | Reduce motion |
| Options window closes | fade out | 0.1 s | 0.1 s | Reduce motion |
| A button (`T.Button`) under the mouse | hover eases in / out | 0.1 s / 0.13 s | 0.1 s / 0.13 s | Reduce motion (at once) |
| A button (`T.Button`) pressed, or a row's keyboard focus ring | darker fill, label down 1 px / ring on | at once | at once | - |
| Options page change | stops a fade in progress; the page appears at once | - | - | - |
| Unlock mode: a frame's popover (right-click a handle) opens / closes | fade in / out | 0.12 s | closes in 0.12 s (a fight ends unlock mode) | Reduce motion |
| Setup wizard opens, or comes back after a fight | fade in, rising 4 px into place | 0.13 s | - (waits for the fight to end) | Reduce motion |
| What's new window opens (after an update, `/vg whatsnew`) | fade in | 0.12 s | 0.12 s (only from `/vg whatsnew`; after an update it waits for the fight to end) | Reduce motion |
| AFK screen appears | fade in | 0.4 s | - (never opens in a fight) | Reduce motion |
| AFK screen goes (you are back, a click or key, a fight starts) | fade out | 0.2 s | 0.15 s | Reduce motion |
| Instance prep card shows, then goes after Hide after (20 s) or its close button | fade in / fade out | 0.12 s | - (never opens in a fight; closes in 0.12 s) | Reduce motion |
| Chat watch toast (a phrase, or an auction price alert) shows, then goes after 8 s or a click | fade in / fade out | 0.12 s | 0.12 s | Reduce motion |
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
| A phrase you watch for is said in chat (Chat watch, at most once every 2 s) | `TELL_MESSAGE` (`T.Sound("alert")`) | Interface sounds, and Chat watch's Sound switch |
| A shopping list item is up at or under its max price (Auction helper's price alerts, sharing Chat watch's 2 s gap) | `TELL_MESSAGE` (`T.Sound("alert")`) | Interface sounds, and the item's alert switch |

The game's own sounds (error messages, the micro menu, windows Vanguard restyles) stay the game's.

## Where the plan and the code differ

The work plan (P4.1) described the theme from an earlier review. The code is what ships, so this page follows it:

- **Text sizes.** The plan says "title 14 … tiny 9". The code has `title` 15, `heading` 13, `name`, `label` and `number` 12, `cell` 11, `small` and `tiny` 10, `badge` 9 (the only role under 10, #258), plus the outlined roles (`world`, `barName`, `barSmall`, `cooldown`, `auraCount`, `auraTimer`, `auraTimerSmall`) and `chat`.
- **Spacing grid.** The plan speaks of a 4/8 px grid. The code has no spacing tokens and uses mostly even offsets (2 to 16); the 4 px steps above are the rule for new work, not a description of every existing layout.
- **Bar textures.** The plan names "bar textures" generally. The code has three built-ins (Vanguard, Soft, Flat) and, since P3.5, every bar texture shared through LibSharedMedia; it also shares its own bars and fonts under the "Vanguard ..." names.
- **Fonts.** Besides Fira Sans Condensed and the game's font, the Font picker lists LibSharedMedia fonts (P3.5), and the faction look adds Cinzel and Metamorphous for titles and headings.
- **Accents.** The plan's five presets were brass, arcane, fel, void and ember; the code now has brass, arcane, jade, orchid and copper (#231) and also accepts any hex colour and the older names fel, void, ember, bronze, blue, green, purple and red.
- **Default sizes** of unit frames, raid tiles, action buttons, the menu strip and windows are not theme tokens; they live in each module and the setup wizard's screen presets (`Core/Setup.lua`), and are described in the README.
