# Research: making Vanguard look crisp and beautiful

Written 2026-10-10 against commit `b032e6f` (v0.5.0), from public sources listed at the end. It is research, not a
spec: `docs/THEME.md` stays the reference for what ships, and any token change goes there and in `Core/Theme.lua` in the
same commit. Nothing here has been checked in a Forever client. The change numbers (1 to 15) are the ones the GitHub
issues use.

**Principles only.** Copy no other project's code, textures, profiles or text. Every asset
Vanguard ships is made by `scripts/lib/media-sources.mjs` or comes from a licensed source recorded in a CREDITS file.

## Verification notes (added when this was committed)

The contrast and OKLCH figures were recomputed with the published WCAG 2 and APCA-W3 (0.0.98G) formulas against an opaque
`panel` (`12151b`). They match the research to within a decimal place. Three points differ from the text below:

- **Slate hue.** Vanguard's slates sit at OKLCH hue about 262 to 268, not 255. The proposed v2 hex values also land at
  257 to 268. Keep the current hue; the "255" target in the table is approximate.
- **`void` keeps its role.** Today `void` (`0b0d11`, L 0.159) is lighter than `inset` (`07080b`, L 0.135) and is the
  near-black for marks drawn on an accent fill. The v2 table reorders them and calls `void` "behind everything". Keep
  `void`'s current role; if a darker "behind everything" step is wanted, add a new token instead.
- **Step evenness.** The proposed v2 steps are about 0.04 L apart from `inset` to `divider`, but `void`→`inset` is 0.02
  and `divider`→`border-hi` is 0.076. That is fine for their roles, but they are not one even scale.
- **Weak pairs to remember.** `brass-dim` (`8a6a2e`) is Lc −26 on `panel`: borders and inactive tabs only, never text.
  The Parchment variant's brass text (`8a5f1e` on `e8dcc2`) is 4.1:1 WCAG and Lc 58: headings at 13 px and up only.

| Token | Hex | WCAG on panel | APCA Lc | OKLCH L / C / h |
|---|---|---|---|---|
| text | `e8eaee` | 15.2 | −93.3 | |
| text2 (now) | `a6adb9` | 8.1 | −56.8 | |
| muted (now) | `6b7280` | 3.8 | −27.3 | |
| brass | `d9a441` | 8.1 | −57.2 | 0.751 / 0.130 / 80 |
| text2 (v2) | `c8cdd6` | 11.5 | −75.2 | |
| disabled (v2) | `7c8390` | 4.8 | −35.2 | |
| brass-text (v2) | `e6b45a` | 9.6 | −65.6 | 0.798 / 0.122 / 80 |
| brass-dim (v2) | `8a6a2e` | 3.6 | −26.3 | 0.544 / 0.087 / 81 |

## Where Vanguard stands today (checked in the code at `b032e6f`)

- **Pixel unit:** `T.Pixel(frame)`, `T.PixelPerfectScale()` and `T.PixelsPerUnit()` exist (`Core/Theme.lua`). `T.Pixel`
  is deliberately not rounded to whole UI units (its comment explains why). Sizes and offsets are not snapped through
  one helper.
- **Texel snapping is off everywhere, on purpose.** `T.Snap(texture)` calls `SetSnapToPixelGrid(false)` and
  `SetTexelSnappingBias(0)` on every texture `T` makes, with the comment that this keeps 1 px lines and icon edges crisp
  instead of blurring or jumping. The research recommends the opposite for static borders and fills. This is a
  conflict to settle with an in-game A/B test, not a change to make blind (change 2).
- **UI scale presets are fractional.** Setup's screen presets set the game's UI scale to 0.8 (1080p), 0.7 (1440p,
  ultrawide) and 0.65 (4K) and turn Vanguard's pixel-perfect scale off (`Core/Setup.lua`). Pixel-perfect would be 0.711
  at 1080p, 0.533 at 1440p and 0.356 or 0.711 at 4K, below the game slider's 0.65 floor, so Vanguard would set it with
  `UIParent:SetScale` as it already can (change 1).
- **Dark fringes:** `fill()`-based textures (bars, spark, stripes, glow, shadow) already write white RGB under alpha.
  Shapes drawn with `over()` in `scripts/lib/media-art.mjs` (the line icons) write RGB 0 into fully transparent pixels,
  so those can fringe dark when tinted and filtered (change 4).
- **Icon crop:** `SetTexCoord(0.08, 0.92, 0.08, 0.92)` is already used (`Core/Theme.lua`, action bars, bags, special
  bars, raid healing).
- **Shadow:** built from eight ring pieces; `SetTextureSliceMargins`, masks, gradients and frame buffers are not used
  yet.
- **Text:** the `tiny` role is 9 pt; there is no `disabled` tier.

## TL;DR

- **Crispness first.** The biggest gain is rendering, not new art: every 1 px edge and every glyph on a real screen pixel
  (an integer pixel-perfect scale plus per-texture snapping). Lock the UI to a pixel grid (scale N × 768 / physical
  height, snap every size and offset to that pixel unit). Turn `SetSnapToPixelGrid`/`SetTexelSnappingBias` on for static
  borders and fills and off for anything that moves. Export masks with white RGB under transparent pixels so they don't
  fringe. Treat the new 12.1 SVG/VectorGraphics and Slug text paths as experiments to feature-detect, not foundations.
- **The palette is close but under-contrasted.** Primary text is excellent. `text2` is only Lc −57 and `muted` is
  Lc −27, below APCA's Lc 30 floor for any text. Raise `text2` to about `c8cdd6` (Lc −75), demote the old `text2` to
  `muted`, and add a `7c8390` `disabled` tier (Lc −35). Re-step the slates evenly in OKLCH lightness. Split brass into a
  fill and a lighter text colour. Fix the accent presets that collide with WoW class, quality and state colours.
- **Art and type: keep it procedural and licence-clean, then add restraint.** Keep game-icons.net (CC BY 3.0) as the
  fantasy icon base, add MIT/ISC sets only for utility glyphs, and bake every icon at its exact display size with
  distance-field maths in the generator. Keep Fira Sans Condensed, but bake tabular figures into the default digits.
  Ornament on window headers only; motion at ≤ 150 ms ease-out, no decorative pulses in combat.

## Key findings

**Confirmed by sources**

- **Coordinates.** WoW treats the screen as 768 units tall. A pixel-perfect scale is 768 / physical height; the
  `uiScale` CVar floors at 0.64, so addons that want it call `UIParent:SetScale()` directly. The usual method
  computes `perfect = 768 / physicalHeight` and `mult = perfect / UIScale`, then rounds lengths to
  `mult * floor(x / mult + 0.5)`.
- **Texel snapping.** A Blizzard engineer (2018-10-02, quoted on Warcraft Wiki): with snapToPixelGrid on, the texture's
  verts are rounded to the nearest pixel when rendering; a bias above 0 implies snapping, and a stronger bias picks a
  texel instead of blending, a sharpening effect. Addons that animate bars and map pins commonly turn snapping off
  (`SetSnapToPixelGrid(false)`, `SetTexelSnappingBias(0)`) on bar fills, backgrounds, sparks, icons and pins.
  Snapping helps static geometry and hurts moving or scaling geometry.
- **Filtering.** `SetTexture`'s `filterMode` (8.0.1) takes LINEAR (default), TRILINEAR (also samples mipmaps) and
  NEAREST. Textures must be power-of-two; TGA and BLP are accepted; BLP carries up to 16 pre-built mipmaps.
- **Gradients.** `SetGradient(orientation, minColor, maxColor)` takes ColorMixin objects (`CreateColor`) since 10.0.0.
  VERTICAL runs from the bottom colour to the top colour and acts as a vertex-colour filter.
- **Masks.** `CreateMaskTexture` arrived in 7.2.0; the round-mask pattern uses the `CLAMPTOBLACKADDITIVE` wrap mode, and
  a texture can take up to three masks (WoWInterface, 2017).
- **Font flags.** `SetFont` takes MONOCHROME (no antialiasing), OUTLINE, THICKOUTLINE and SLUG (rendered with the Slug
  library). Each font + size × scale + flags combination is a separate font instance.
- **12.x client.** 12.0.0: the Midnight restrictions are not meant to prevent look-and-feel customization; `SetTexture`
  no longer takes secret strings. 11.2.0: `FontString:SetAlphaGradient`, `Frame:IsFrameBuffer`. 12.0.7:
  `C_UIFileAsset.GetFileID/IsKnownFile`. 12.1.0 (build 69587, 2026-08-27): SVG textures with the VectorGraphics object
  type (`TextureBase:SetSVG`, `Frame:CreateVectorGraphics`), `SetRadialProgressBar*`, `StatusBar:SetRenderMode`,
  `Frame:SetOnUpdateMode`.
- **Contrast targets (APCA).** Lc 90 preferred for body text, Lc 75 minimum for body text where readability matters,
  Lc 60 for other content text, Lc 45 for large or heavy text, Lc 30 the absolute minimum for any text (placeholder and
  disabled included). For large fonts in dark mode, keep contrast under Lc 90.
- **Licences.** game-icons.net (4,180 icons) is CC BY 3.0 with per-author credit. Lucide is ISC; Tabler and Phosphor are
  MIT. Every font discussed below is SIL OFL 1.1 (Roboto Condensed and Noto Sans were relicensed from Apache).

**Inferred**

- Most of Vanguard's remaining softness comes from fractional offsets (odd sizes centred on even parents), bilinear
  filtering of masks whose transparent pixels are black, and fades on multi-layer panels, not from the palette.
- WoW's font renderer does not appear to apply OpenType features such as `tnum`, so tabular digits have to be baked into
  the default glyphs at build time.

## Technical crispness checklist (WoW client)

**Scale and the pixel grid**

1. **Compute the pixel unit once:** `perfect = 768 / select(2, GetPhysicalScreenSize())`,
   `mult = perfect / UIParent:GetEffectiveScale()`. Recompute on `UI_SCALE_CHANGED` and `DISPLAY_SIZE_CHANGED`. Defer any
   `SetScale` until combat ends. (Vanguard already has `T.Pixel(frame)`; extend it rather than add a second helper.)
2. **Offer integer multiples only:** N × 768/height (N = 1 at 1080p, 1 or 2 at 1440p, 2 at 4K). A fractional scale such
   as 0.85 makes a "1 px" border alternate between 1 and 2 physical pixels. For bigger UI, use Vanguard's own size
   multiplier in whole pixels. (Today setup's presets set 80/70/65 % game UI scale; see issue for change 1.)
3. **Snap every size, offset and inset** through one helper, `Snap(x) = mult * floor(x / mult + 0.5)`. Blizzard's
   FrameXML ships a PixelUtil helper (SetSize/SetPoint/GetNearestPixelSize); verify names in Gethe/wow-ui-source.
4. **Odd-pixel centring.** An odd-width child centred on an even-width parent lands on a half pixel. Keep paired
   dimensions the same parity, or anchor by an edge plus a snapped offset. An icon in a 1 px-bordered button is
   (button − 2 px).

**Textures**

5. **Snapping policy.** Static border lines, flat fills, dividers and sheens: `SetSnapToPixelGrid(true)`,
   `SetTexelSnappingBias(1)` (or 0.5 to 1). Bar fills, sparks, cooldown swipes, rotating or scaling elements, anything
   animated: `SetSnapToPixelGrid(false)`, `SetTexelSnappingBias(0)`. Otherwise bars step and sparks jitter.
6. **Filter mode.** LINEAR for art drawn at 1:1; NEAREST only for pixel-art glyphs at exact integer multiples;
   TRILINEAR only for heavy minification. Mipmap generation for addon TGAs is undocumented, so bake small sizes instead.
7. **Power-of-two canvases** with the art at its exact display size inside (a 20 px icon in a 32×32 canvas, cropped with
   `SetTexCoord`), plus 1 to 2 px of transparent padding so CLAMP wrapping doesn't smear edges.
8. **No dark fringes.** For tintable masks, write RGB 255,255,255 into every pixel, transparent ones included, and put
   the shape only in alpha. For full-colour art, bleed edge colours outward into the transparent area. (Inferred from
   straight-alpha behaviour.)
9. **TGA vs BLP.** 32-bit uncompressed or RLE TGA is right for a code-generated pipeline. BLP only buys mipmaps and
   compression; don't convert unless file size becomes a problem.

**Borders, nine-slice, masks, gradients**

10. **1 px borders as four textures** with `SetColorTexture`, exactly `mult` thick (Vanguard already does this; add
    snapping per item 5). Backdrop edge files are scaled art and blur at non-native scales.
11. **Shadows and glow via one nine-slice texture** with `SetTextureSliceMargins`/`SetTextureSliceMode`, 8 to 16 px
    margins, Gaussian falloff from the generator, behind the black border so the crisp edge stays on top. (Vanguard
    builds its shadow from eight pieces today.)
12. **Rounded corners.** Masks are filtered, so radii ≤ 3 px come out mushy. Generate exact-pixel corner pieces (or a
    nine-slice with the corner baked at the target size) for small radii; keep `CreateMaskTexture` for circles,
    portraits and radii of 6 px or more.
13. **Gradients.** Subtle top-to-bottom panel gradients of 2 to 4 % lightness read as material; big gradients band and
    look cheap. VERTICAL is bottom-to-top.
14. **Group fades.** Fading a parent with overlapping translucent children ghosts the inner borders. `SetIsFrameBuffer`
    renders the frame to its own buffer first; use it only on big windows during open and close fades, and measure.

**Fonts**

15. **Outline vs shadow.** Text on panels: a 1 px drop shadow (0, −1, black 60 to 80 %), no outline. Text over the world
    (nameplates, floating numbers, bar text on transparent bars): OUTLINE. THICKOUTLINE fills counters below about
    14 px; reserve it for big numbers. MONOCHROME only for pixel fonts at their native size.
16. **Size discipline.** At a pixel-perfect scale one point is one physical pixel, so the 9 pt `tiny` role is 9 px tall.
    Floor labels at 10 px and values at 11 to 12 px.
17. **SLUG flag.** An experiment for smoothly scaling text (nameplates, animated numbers). Feature-detect, compare
    screenshots, and never default to it without an A/B test at 1080p.

**Icons**

18. **Blizzard spell and item icons** have a baked bevel. The common crop is about `SetTexCoord(0.08, 0.92, 0.08, 0.92)`
    (from practice, not documentation). Cropping at runtime redistributes nothing. For non-square slots, crop the long
    axis further to keep the aspect ratio.

**New 12.1 features**

19. `SetSVG`/VectorGraphics, the radial progress APIs and `StatusBar:SetRenderMode` are documented only as signatures.
    Wrap them in `if tex.SetSVG then … end` and confirm them on the Forever 16001 client. Keep the TGA pipeline canonical.
    (Any new widget method also goes in `scripts/lib/wow-widget-api.lua` only once confirmed in the 12.1 client.)

## What makes a WoW UI read as premium (principles only)

- **One material, used everywhere.** Well-regarded profiles use a single bar texture across the whole UI and a
  minimalist dark look. Bar, Soft and Flat can stay options, but each theme should default to one bar material
  across every module.
- **One border language.** Premium suites pick one edge treatment (pixel-black, thin round, or shadow-only) and never mix them in a layout.
- **Inferred patterns of minimalist layouts:** near-black low-chroma panels; class or reaction
  colour carries meaning while the chrome stays neutral; icons cropped and bordered uniformly; consistent gaps of 1, 2,
  4 or 8 px; text mostly white or grey with one accent; ornament nearly absent.
- **Art-heavy UIs** look premium through painted frames with consistent lighting.
  Without licensed custom art, borrow their lighting logic (top-lit bevel, inner shadow, warm metal highlights), not
  their art.
- **Copy nothing.** Other suites carry their own licences, and Vanguard is All Rights Reserved.

## Lessons from modern game UI

- **Clarity beats ornament.** Game UI teams describe the job as communicating systems while keeping clarity, and
  usability tests regularly pull core controls back to familiar places (an action bar at bottom centre).
- **A small material vocabulary.** Dark fantasy interfaces lean on a few materials (leather, fabric, metal, wood).
  For Vanguard's procedural pipeline: two materials,
  slate (matte) and brass (specular). Don't attempt hand-painted grunge.
- **Inferred principles from modern ARPG and MMO interfaces:**
  1. Hierarchy through value, not hue: the most important numbers brightest, chrome darkest.
  2. Ornament at the periphery: headers and corners, never inside bars or grids.
  3. Light is information: glows mark ready, proc and danger only.
  4. Combat HUDs are flatter and more transparent than menus.
  5. Every colour-coded state has a shape redundancy (icon, border style or text).

## Palette: critique of Slate & Brass and a proposed v2

The WCAG/APCA gap for `text2` and `muted` is the dark-mode case APCA was designed to catch: WCAG overstates how readable
mid-grey on near-black is (figures in the verification table above).

**Neutral steps.** Current OKLCH lightness: `inset` 0.135, `void` 0.159, `panel` 0.195, `raised` 0.235, `divider` 0.284.
The steps are uneven, so `raised` and `divider` barely separate from `panel` at 1 px. Re-step at about 0.04 L with a
constant cool tint (keep today's hue, about 264, chroma about 0.010 to 0.015) so brass, the complementary hue, glows
against it.

**Proposed "Slate & Brass v2" tokens.** Hex values are hand-derived from OKLCH targets; recheck with a tool such as
oklch.com, Harmonizer or apcach before committing them to `Core/Theme.lua`.

| Token | Proposed | Measured OKLCH L | Role / contrast |
|---|---|---|---|
| (new, darkest) | `080a0e` | 0.144 | Behind everything, world dimmer (see verification notes about `void`) |
| inset | `0c0e13` | 0.164 | Wells, bar backgrounds |
| panel | `13161c` | 0.200 | Base surface (≈ current) |
| raised | `1b1f26` | 0.238 | Headers, buttons |
| raised-hover (new) | `262a32` | 0.284 | Replaces the 8 % white wash on opaque controls |
| divider | `2f343d` | 0.324 | Separators that read at 1 px |
| border-hi (new) | `43484f` | 0.400 | Inner bevel and focus base |
| text | `e8eaee` | 0.94 | Lc −93 |
| text2 | `c8cdd6` | 0.85 | Lc −75 (new body-secondary) |
| muted | `a6adb9` | 0.75 | Lc −57; labels at ≥ 11 px only |
| disabled (new) | `7c8390` | 0.62 | Lc −35; disabled and placeholder only |
| brass (fill) | `d9a441` | 0.751 | Bars, borders, selected fills |
| brass-text (new) | `e6b45a` | 0.798 | Accent text, Lc −66 |
| brass-dim (new) | `8a6a2e` | 0.544 | Accent borders, inactive tabs (never text) |

**Accent presets against WoW's colours** (class colours from `RAID_CLASS_COLORS`, quality colours from Warcraft Wiki):

- **brass `d9a441`** sits near Warrior `C69B6D`, Artifact `e6cc80` and game gold `ffd100`. Acceptable, but the selection
  highlight on class-coloured elements should be white or brass-text plus a shape change, not brass alone.
- **ember `e0664b`** is nearly `bad` `e0565b` and `hostile` `cc4b45`, so "selected" reads as an error. Replace with
  copper `c8784a` (hue toward 50°), or have the state colours borrow vermilion and magenta variants while ember is on.
- **void `a47bf0`** sits between Epic `a335ee` and Warlock `8788EE`. Shift to orchid `b48ae8` at lower chroma, or never
  use the accent to mark item rarity.
- **fel `5bcb7e`** sits near Uncommon `1eff00`, Hunter `AAD372` and `good` `4fc27a`. Shift toward jade `4fbfa3` (hue
  about 170°).
- **arcane `5aa2f0`** sits near Shaman/Rare `0070dd` and the magic dispel colour. Acceptable as a cool preset.

**State, reaction and dispel: colour-blind safety.** The Okabe-Ito palette (Okabe and Ito, Color Universal Design,
2002/2008; Wong, Nature Methods 2011) is the standard reference: `E69F00` orange, `56B4E9` sky blue, `009E73` bluish
green, `F0E442` yellow, `0072B2` blue, `D55E00` vermilion, `CC79A7` reddish purple. Adapted for dark panels:

- **good** `3fbf9a` (bluish green), **warn** `f0b43c` (amber, away from ember and vermilion), **bad** `e8663f`
  (vermilion-red). Pair each with a glyph (check, triangle, cross). Today's `good` and `bad` differ in luminance (0.42 vs
  0.23), which helps, but their hues sit on the red-green confusion axis.
- **Colour-assist toggle** for reaction colours: friendly blue `4a9be8`, neutral yellow `e8d25a`, hostile vermilion
  `e0663a`.
- **Dispel:** keep the familiar hues, but always add a type letter or glyph corner badge: poison/disease
  (deuteranopia) and magic/curse (protanopia) collapse in simulation (inferred).

**Over the 3D world.** Contrast comes from OUTLINE plus a dark backing, not from hue. Keep world-text colours at OKLCH
L ≥ 0.80 so the outline does the separating.

**Theme variants worth offering**

1. **Vellum & Ink** (warm dark): `panel` `1a1612`, `raised` `241f19`, `text` `efe6d2`, `text2` `d2c6ad`, accent brass
   `d9a441`, `divider` `3a3226`. Old parchment and leather without a light HUD flooding the screen.
2. **Parchment** (light), non-combat windows only (bags, options, quest text, mail reader): background `e8dcc2`, raised
   `f2e9d6`, ink `2a2117` (11.6:1), brass text `8a5f1e` (4.1:1, headings only). Never on unit frames or nameplates.
3. **High Contrast**: `panel` `0a0b0e` at alpha 1.0, `text` `ffffff`, `text2` `dfe3ea`, `muted` `b8bfca`, a 2 px accent
   focus ring, no sheen, no gradients, full-saturation states, Colour-assist on by default.

## Artwork and iconography

| Source | Licence | Use in Vanguard |
|---|---|---|
| game-icons.net | CC BY 3.0, per-author credit; a few CC0 folders | Primary fantasy vocabulary (already in `art/game-icons`) |
| Tabler Icons | MIT, 24×24 grid, 2 px stroke | Utility glyphs (settings, lock, search) |
| Phosphor | MIT, six weights | Utility glyphs where weight matching matters |
| Lucide | ISC | Alternative utility set |
| Kenney, OpenGameArt, RPG-Awesome, Font Awesome Free | Verify per asset (Kenney generally CC0; OpenGameArt per file; Font Awesome Free icons CC BY 4.0) | Only with a per-file licence entry |

- MIT and ISC still require the copyright and licence text to ship with the files: add it to `Media/Icons/CREDITS.txt`
  and `art/CREDITS.md` with the CC BY credits.
- Don't mix stroke utility icons with game-icons' filled silhouettes in one context: silhouettes for game concepts,
  strokes only for chrome controls.
- RPG-Awesome largely repackages game-icons art; credit the original authors.

**A procedural pipeline that stays sharp** (for `scripts/lib/media-sources.mjs`)

1. **Bake at the target size, never scale down:** render each icon at each display size (16, 20, 24, 32, 48 px) and
   pick the matching TGA at runtime.
2. **Signed-distance rendering in the generator:** distance to each shape edge, alpha by a ~1 px smoothstep around zero
   at the output resolution. Even anti-aliasing at every size, sharp corners, and free outlines and glows from distance
   bands. (Chris Green, Valve, SIGGRAPH 2007, applied offline since WoW has no custom shaders.)
3. **Snap stems to the pixel grid** at each size before rasterizing.
4. **Consistent stroke weight:** 1.5 to 2 px at 20 to 24 px icons, nothing under 1 px at 16 px, one corner-radius
   family.
5. **Optical alignment:** centre on visual mass; nudge triangles and arrows toward their heavy side; circles 6 to 8 %
   larger than squares.
6. **One family grammar:** same light direction (top-left) for inner highlights, same detail density, a 2 px internal
   margin.

**Ornament that stays subtle** (generated): a 1 px brass header rule with a diamond centre-cut; corner brackets (L-shaped
1 px lines with a 45° chamfer); a faint top-lit inner bevel (`border-hi` at 30 to 40 % on the top inner edge, black at
40 % on the bottom); an optional faction crest watermark at 4 to 6 % in large window headers. One ornament per window,
none on combat frames, coloured from `brass-dim`.

**Vanilla flavour without Blizzard assets:** warm metal on dark leather tones (Vellum & Ink), serif small-caps headings
(Cinzel already), gold-on-dark titles, rivet dots at panel corners, gentle bevels, all generated in code. Never trace or
sample Blizzard frames, Friz Quadrata or Blizzard icons into Vanguard's art.

**Commissioning art** (prices vary widely; no authoritative 2026 survey found): get a written assignment or an
exclusive, perpetual, worldwide licence permitting modification and redistribution inside an All Rights Reserved addon;
the layered or vector sources; a warranty of originality (no Blizzard-derived or AI-training-data elements); and
permission to credit the artist.

## Typography

All OFL 1.1:

| Font | `tnum` | Verdict |
|---|---|---|
| Fira Sans Condensed (current) | In the Fira family | Screen-designed, open counters. **Keep as the UI face.** |
| Barlow Semi Condensed | Since v1.400; open reports of imperfect alignment | More geometric; a numeric-only alternative |
| IBM Plex Sans Condensed | Not verified | Name trademarked; corporate look |
| Inter | Yes; same width across weights | Superb numbers but not condensed; build from rsms/inter (Google files strip features) |
| Roboto Condensed | Not verified | Neutral, relicensed to OFL |
| Source Sans 3, Noto Sans | Not verified | Not condensed; Noto's value is script coverage |

1. **Bake tabular digits:** at build time (`scripts/fonts/make-fonts.py`), remap `tnum` glyphs onto the default digits
   (fontTools feature freezing) for a "Vanguard Numerals" face used by timers, cooldowns, health text and meters, so
   timers stop jittering.
2. **Reserved Font Names:** a modified or subsetted OFL font must be renamed if upstream declares an RFN (Metamorphous
   declares "Metamorphous"; check every OFL.txt, Fira's included). Ship the OFL text and copyright lines.
3. **Headings:** Cinzel and Metamorphous only at ≥ 13 px, in small caps or all caps with +4 to 6 % tracking, never for
   numbers. IM Fell English (OFL, Latin only) is an option for Parchment titles.
4. **Weights:** Medium for body on dark is right (light-on-dark blooms); Regular only at ≥ 13 px. SemiBold for values and
   headings, not Bold, which closes counters at 10 to 11 px.
5. **Sizes:** whole-pixel role sizes of 10/11/12/13/15/18 at a pixel-perfect scale; retire 9 except for badge glyphs.

## Motion and polish

- **Hover:** 90 to 120 ms ease-out to `raised-hover` (opaque) or the 8 % white wash (transparent), plus a 1 px
  `border-hi` top edge; exit in 120 to 150 ms. Use AnimationGroup Alpha/VertexColor with OUT smoothing rather than
  OnUpdate loops (inferred API usage).
- **Press:** instant (≤ 50 ms): one neutral step darker and the label 1 px down. No scale animation (it breaks snapping).
- **Focus ring:** keyboard and gamepad focus get a 1 px `brass-text` ring outside a 1 px black gap; never animated.
- **Inner highlight:** keep the 6 % sheen, snapped and one pixel inside the border; on raised controls add a bottom
  inner line in black at 30 % for a machined look.
- **Glow:** additive glows for ready, proc and danger only. Out of combat a slow 1.2 to 1.6 s sine pulse is fine; in
  combat a static glow or one 150 ms flash. Reduce motion makes all glows static.
- **Windows:** open in 120 to 150 ms (alpha 0→1 plus a 4 px upward move, snapped at the end), close in 100 ms; consider
  a frame buffer for the fade. Anything opened mid-fight opens instantly (the 0.15 s combat cap already applies).
- **Bars:** smooth health over 100 to 150 ms (12.x `SetValue` interpolation may do it natively; verify on Forever). The
  spark rides unsnapped. Absorb stripes use a REPEAT-wrapped, pixel-exact 8 px tile so they don't shimmer.

Every new fade and sound goes in `docs/THEME.md` per the repo's rules.

## Prioritised changes

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | Pixel-unit helper: snap every size and offset; integer-N scale presets | Very high | Low |
| 2 | Snapping policy per texture class (static on, moving off) | High | Low |
| 3 | Text tiers v2: `text2` `c8cdd6`, `muted` `a6adb9`, `disabled` `7c8390` | High | Very low |
| 4 | Re-export all masks with white RGB under alpha, plus 2 px padding | High | Low |
| 5 | Evenly stepped OKLCH slates, including `divider` `2f343d` and `border-hi` `43484f` | High | Low |
| 6 | Split brass into fill, text and dim tokens | Medium-high | Very low |
| 7 | Fix colliding presets (ember→copper, fel→jade, void→orchid) | Medium | Very low |
| 8 | Bake icons per display size with SDF anti-aliasing in the generator | High | Medium |
| 9 | Tabular "Vanguard Numerals" build of Fira Sans Condensed | Medium-high | Medium |
| 10 | Inner bevel on raised controls; one bar material per theme | Medium | Low |
| 11 | CVD-safe states, a Colour-assist reaction swap, glyph redundancy on dispels | Medium (high for affected players) | Medium |
| 12 | Single-texture nine-slice shadow via `SetTextureSliceMargins` | Medium | Low |
| 13 | High Contrast and Vellum & Ink theme variants | Medium | Medium |
| 14 | Subtle header ornament kit (rule, chamfered corners, crest watermark) | Medium | Medium |
| 15 | Feature-detected experiments: SLUG text, radial progress, SVG icons, frame-buffer fades | Unknown | Medium |

## Caveats

- **Contrast figures** assume an opaque panel; real panels let about 6 % of the world through. Proposed hex values
  approximate their OKLCH targets.
- **12.1 APIs** (SVG, VectorGraphics, radial progress, `SetRenderMode`, SLUG) are documented only as names and
  signatures as of the wiki's 2026-08-27 12.1.0 diff; the wiki's API pages have been under extended maintenance since
  2026-07-23. Availability on Forever 16001 is unconfirmed.
- **Undocumented behaviour:** mipmaps for addon TGAs, WoW's alpha model, OpenType feature support and the icon crop value
  are inferred from practice.
- **Benchmarks:** descriptions of other UIs come from general design knowledge, not fetched sources; treat
  them as directional.
- **Licences:** Kenney, OpenGameArt, RPG-Awesome and Font Awesome terms were not re-verified. Check every imported file
  and record it in CREDITS.

## Sources

1. Warcraft Wiki, SetSnapToPixelGrid: https://warcraft.wiki.gg/wiki/API_TextureBase_SetSnapToPixelGrid
2. Warcraft Wiki, SetTexture: https://warcraft.wiki.gg/wiki/API_TextureBase_SetTexture
3. AddOn Studio, XML/Texture: https://addonstudio.org/wiki/WoW:XML/Texture
4. Wowpedia, BLP files: https://wowpedia.fandom.com/wiki/BLP_files
5. Warcraft Wiki, Patch 10.0.0 API changes: https://warcraft.wiki.gg/wiki/Patch_10.0.0/API_changes
6. Warcraft Wiki, SetGradient: https://warcraft.wiki.gg/wiki/API_TextureBase_SetGradient
7. Warcraft Wiki, CreateMaskTexture: https://warcraft.wiki.gg/wiki/API_Frame_CreateMaskTexture
8. WoWInterface, mask textures thread: https://www.wowinterface.com/forums/showthread.php?t=55368
9. Warcraft Wiki, SetFont: https://warcraft.wiki.gg/wiki/API_FontInstance_SetFont
10. WoWWiki archive, SetFont: https://wowwiki-archive.fandom.com/wiki/API_FontInstance_SetFont
11. Warcraft Wiki, Patch 12.0.0 planned API changes: https://warcraft.wiki.gg/wiki/Patch_12.0.0/Planned_API_changes
12. Warcraft Wiki, Patch 12.0.0 API changes: https://warcraft.wiki.gg/wiki/Patch_12.0.0/API_changes
13. Warcraft Wiki, Patch 11.2.0 API changes: https://warcraft.wiki.gg/wiki/Patch_11.2.0/API_changes
14. Warcraft Wiki, Patch 12.0.7 API changes: https://warcraft.wiki.gg/wiki/Patch_12.0.7/API_changes
15. Warcraft Wiki, Patch 12.1.0 API changes: https://warcraft.wiki.gg/wiki/Patch_12.1.0/API_changes
16. Lucide vs Tabler vs Phosphor: https://dev.to/svgicons/lucide-vs-tabler-vs-phosphor-which-free-icon-set-fits-your-ui-4ocl
17. Wikipedia, Roboto: https://en.wikipedia.org/wiki/Roboto
18. Wikipedia, Noto fonts: https://en.wikipedia.org/wiki/Noto_fonts
19. WoWInterface thread 42139: https://cdn.wowinterface.com/forums/showthread.php?t=42139
20. WoWWiki archive, SetTexture: https://wowwiki-archive.fandom.com/wiki/API_Texture_SetTexture
21. Warcraft Wiki, TextureBase: https://warcraft.wiki.gg/wiki/UIOBJECT_TextureBase
22. Warcraft Wiki, StatusBar: https://warcraft.wiki.gg/wiki/UIOBJECT_StatusBar
23. Warcraft Wiki, Widget API: https://warcraft.wiki.gg/wiki/Widget_API
24. APCA tool: https://www.qwertybit.com/tools/apca
25. Evil Martians, OKLCH ecosystem: https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools
26. Harmonizer: https://web-standards.dev/news/2025/11/harmonizer-color-palette-generator/
27. Warcraft Wiki, Quality: https://warcraft.wiki.gg/wiki/Quality
28. Warcraft Wiki, Class colors: https://warcraft.wiki.gg/wiki/Class_colors
29. game-icons.net about: https://game-icons.net/about.html
30. OpenReplay, SVG icon libraries: https://blog.openreplay.com/svg-icon-libraries-web-apps/
31. Iconoop, icon sets: https://iconoop.com/icon-sets.html
32. Mantlr, open-source icon libraries: https://mantlr.com/blog/best-open-source-icon-libraries-compared
33. Fontsource, Fira Sans Extra Condensed: https://fontsource.org/fonts/fira-sans-extra-condensed/about
34. CTAN, Fira: https://ctan.org/tex-archive/fonts/fira?lang=en
35. Barlow issue 69: https://github.com/jpt/barlow/issues/69
36. Google Fonts PR 1330: https://github.com/google/fonts/pull/1330
37. Wikipedia, IBM Plex: https://en.wikipedia.org/wiki/IBM_Plex
38. Inter: https://rsms.me/inter/
39. Wikipedia, Inter: https://en.wikipedia.org/wiki/Inter_(typeface)
40. Font Squirrel, Metamorphous: https://www.fontsquirrel.com/fonts/metamorphous
41. Google Fonts, IM Fell English metadata: https://github.com/google/fonts/blob/main/ofl/imfellenglish/METADATA.pb
42. Cufon Fonts, Metamorphous: https://www.cufonfonts.com/font/metamorphous
43. Fontsource, Cinzel: https://fontsource.org/fonts/cinzel/about
44. Warcraft Wiki, GetItemQualityColor: https://warcraft.wiki.gg/wiki/API_GetItemQualityColor
