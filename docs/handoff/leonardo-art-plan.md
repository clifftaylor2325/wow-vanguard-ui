# Vanguard art plan: painted textures, ornaments and art made with Leonardo.ai (handoff)

Repo `clifftaylor2325/wow-vanguard-ui`, written 2026-11-02 against commit `553dd5a` (0.8.0 plus the AFK scene fix, #723).
Status: **plan only**. No art is generated and no addon code changes in the PR that adds this file. Execution starts after the WoW Forever launch (4 November 2026) and after Cliff has answered the decisions in §9.
Every `file:line` is as of `553dd5a`; if a line has moved, grep for the identifier quoted next to it.
Naming rule for this file and everything made from it: no other addon or add-on library is named, and no competing product; patterns are described generically. Leonardo.ai (the tool Cliff chose) and its own model names, the game and its maker, the two stores the addon ships on, and the sources a cited fact comes from (a documentation mirror, a wiki, a help centre, a news or pricing page, a standards body) are named only where a rule, a licence or a measured fact is quoted from them. Cliff can strike any of those (§9, R11).

---

## 0. Summary

**What the audit found.** Vanguard draws with 169 generated texture files and no painted pixel outside the three AFK scenes; its look is tokens, one-pixel lines and code-drawn shapes, and that is its identity, not a gap. The gaps, ranked (§2.3): the Classic look's and the ornaments switch's line brackets and diamond are the one place the UI promises decoration and delivers geometry (1); the round minimap's rim is a plain 3-texel line (2); the three panel surfaces are code noise (3); the first-run window has no picture (4); the crest is never shown large (5).

**What the plan does.** Draws the way the crest is drawn: hard-edged shapes, three flat tones per material, a dark outline, tinted by the theme's `accentDim` so ornament never matches a selection colour (§4). Small ornaments and the ring are drawn in code from Leonardo concept sheets Cliff picks; Leonardo pixels ship only as two panel-surface patterns and one first-run banner (§4.1). Phoenix 1.0 for everything, private mode, every setting in a manifest (§6). No new setting, no new top-level local in `Core/Theme.lua`, nothing on the HUD beyond a thinner, dimmer minimap ring with its own go/no-go (§7).

**Milestones** (§5): M0-code (probe rows, the drawn `toned` kind, a tint sheet) beside M0-Cliff (plan, privacy and Terms, the app's controls, three calibration runs, the §9 decisions); M1a (High contrast fix, corner bracket); M1b (rule motif, round ring); M2 (two surfaces at a 12/255 alpha ceiling, with their pipeline); M3 (banner, with its pipeline). One thread and one draft PR each, from the prompt in §10, after launch.

**What the reviews changed most.** The ornaments and ring moved from Leonardo pixels to code drawn from Leonardo concepts (wave 1); every small piece is baked at 1 x and 2 x and picked by `T.PixelsPerUnit()`, and the ring sits inside the disc (waves 2 and 5); one model, no upscaling, references by kind, a token budget and a disclosure line (wave 3); tint back to `accentDim`, the surface ceiling down from 0.08 to 12/255 because `disabled` text already misses 4.5:1 at 0.08, a High contrast bug found in `T.PaintOrnament`, and a QA list with a pass condition per row (wave 4); the milestones re-cut so a cold thread can finish each one (wave 5).

**Biggest remaining risks** (§9): Leonardo's Terms are unread and the shipped AFK scenes' plan and privacy are unrecorded (Q1, R2); how the client filters and keeps addon textures is undocumented and only Cliff's eyes settle it (R1); AI pixels carry thin copyright (R3); the ring may still distract in a fight (R10).

---

## 1. How to use this plan

1. Read §4 (the direction brief) before you make or judge any picture. Every later section assumes it.
2. Work the milestones in order (§5). M0 has no art in it: M0-code proves the tint sheet and the drawn kind in the harness, and M0-Cliff is a checklist Cliff answers with no thread. Nothing in M1a starts until both are done.
3. Each asset row in §5 is one task with an id (A1, S2, ...). One task is one commit on the milestone's branch (`work/leonardo-m1a` and so on), subject `<id> <area>: <change>`, as CLAUDE.md asks.
4. Cliff makes every picture in Leonardo himself (his account, his plan, his downloads). A Claude session never logs into Leonardo, never holds an API key and never generates. It writes prompts, judges candidates Cliff sends, processes the chosen file, wires it in and tests it.
5. Cliff sees every processed file before it is committed (his standing rule for art, 2026-10-31).
6. §10 is a ready-to-run prompt for the session that executes a milestone.

---

## 2. Phase 1: audit of the current look

### 2.1 What the addon draws with today

The look is code-drawn on purpose. `docs/THEME.md` says it in one line: "flat dark slate panels, one-screen-pixel borders, one accent colour, one font (Fira Sans Condensed), and textures that are plain white or grayscale shapes tinted by the theme."

| Folder | Files | Bytes | What is in it |
|---|---|---|---|
| `Media/Textures` | 38 TGA | 1,631,660 | Bars (`Bar`, `BarSoft` 256x32), shapes (`Diamond`, `Dot` 16x16, `Knob*` 32x32, `Pill*` 64x32), corner pieces (8x8 cut, 32x32 round, masks), `Shadow`/`Glow` 64x64, `Fade` 8x64, `Spark` 16x64, `Stripes` 8x8, `Vignette` 128x128, `OrnamentCorner` 16x16, `RoundDisc`/`RoundRing` 256x256, panel surfaces `PanelGrain`/`PanelStone`/`PanelLeather` 256x256, `ControlTile`/`ControlTileLine` **80x80**, `LogoLeft` 64x64, `Icon` 64x64 (the crest, the only pre-coloured texture) |
| `Media/Icons` | 126 TGA | 437,468 | 16 menu glyph families at 32/16/20/24/32 px, 46 single glyphs at 32x32 (three at 64x64): line glyphs on a 16-unit grid, filled silhouettes from CC BY 3.0 sources for the options nav and minimap slots, dispel letters |
| `Media/Art` | 5 TGA | 6,325,035 | AFK scenes `afk-keep`, `afk-canyon`, `afk-camp` 1024x512 (Leonardo.ai, #722), faction crests `lorc-crossed-swords`/`lorc-crossed-axes` 64x64 (CC BY 3.0) |
| `Media/Fonts` | 4 TTF | 527,504 | Fira Sans Condensed Medium and SemiBold, Cinzel SemiBold, Metamorphous (all SIL OFL) |

Facts that matter for new art:

- **Every texture is a 32-bit uncompressed TGA, bottom-left origin, 8 alpha bits** (header bytes checked on all 169 files), written by `tga()` in `scripts/lib/media-art.mjs:180`. All are power-of-two except `ControlTile` and `ControlTileLine` (80x80, `scripts/lib/media-sources.mjs:100`).
- **`Media/` is generated.** `scripts/build-media.mjs` writes every file from `MEDIA` (`scripts/lib/media-sources.mjs:400`) and `--check` fails on any byte that differs. The AFK scenes are the only raster sources: 1024x512 PNGs in `art/scenes/`, decoded by the dependency-free reader in `scripts/lib/media-scenes.mjs`.
- **Tinting is the theme's colour system.** A tinted texture is white in every pixel with the shape in alpha, so `T.Tint` (vertex colour) gives it any token colour and `T.Refresh` re-tints it on an accent or variant change. `scripts/media.test.mjs` checks that rule and the one clear pixel inside every canvas edge.
- **No backdrops, no nine-slice.** `SetBackdrop`, `BackdropTemplate`, `edgeFile` and `bgFile` have zero uses in `Core/` and `Modules/`. Borders are one-pixel `WHITE8X8` lines (`T.WHITE`, `Core/Theme.lua:21`, 36 references). Rounded and shield corners are small corner textures plus mask textures (`CreateMaskTexture` at `Core/Theme.lua:1207`, `Modules/Minimap.lua:418`).
- **Game art still in use:** the raid target sheet `Interface\TargetingFrame\UI-RaidTargetingIcons` and `Interface\RaidFrame\Raid-Icon-Rez` (`Modules/RaidStatus.lua:27`, `:34`), 29 fallback spell icons (`Modules/RaidHealing.lua:54-82`), two item icons as fallbacks (`Modules/MenuStrip.lua:93`, `Modules/AuctionHelper.lua:76`), the game's Rock, Marble and Dialog backgrounds as panel-texture choices (`Core/PanelTexture.lua:23-25`), and spell, item and aura icons from the client everywhere they belong. Inside the 70-odd game windows Vanguard skins, the game's art is faded by alpha, not replaced (`T.FadeRegions`, 99 calls).
- **Where ornament already has a slot:** `T.Ornament` (`Core/Theme.lua:3032`) gives a large window four 14-unit corner brackets (`OrnamentCorner`, tinted `accentDim`) or a header rule (two one-pixel `divider` lines with a 7-unit `Diamond` in the middle, `headerRule`, `Core/Theme.lua:3007`). They show when General → Look → Window ornaments is on or the Classic look variant is picked. The round minimap draws `RoundRing` tinted `edge` over a `RoundDisc` mask (`Modules/Minimap.lua:416-424`). The panel texture picker (`Core/PanelTexture.lua`) draws a 256x256 tile over floating windows only, never on the HUD.
- **The brand crest** (`art/brand/vanguard-crest.svg`, 1024 units): two swords crossed at ±33° behind a heater shield with a dark-brass rim, a brass field, a brass boss diamond at the top, 41 dark studs round the rim and a serif V (Cinzel 900 outline). Colours: ground `#0b0d11`, steel `#a9b1bc`/`#e4e8ee`, brass `#d9a441`, dark brass `#b5842d`. It appears at 64 px in the addons list (`Vanguard.toc:20`), 28 units in the options header (`Core/OptionsWindow.lua:749`) and on the unit-frame deck (`Modules/UnitFrames.lua:676`).

### 2.2 Frame map and how each area holds up

Vanguard builds about 258 frames, about 70 of them named `Vanguard_*`, almost all under `UIParent`. Game frames are hidden, faded or reparented, never replaced (hide lists: `Modules/ActionBars.lua:101`, `Modules/UnitFrames.lua:63`, `Modules/RaidFrames.lua:60`, `Modules/CastBars.lua:54`, `Modules/PlayerAuras.lua:27`, `Modules/QuestTracker.lua:360`).

```
UIParent
├─ Floating windows: Vanguard_Options, Vanguard_Setup, Vanguard_WhatsNew, Vanguard_QuestDialog, Vanguard_QuestLog,
│  Vanguard_GroupBoard, Vanguard_MailTools, Vanguard_CraftingPanel, Vanguard_SpellPicker, Vanguard_KeybindMode
│  + ~70 game windows skinned in place (Modules/Windows*.lua)          ← panel texture, ornaments, banners belong here
├─ HUD: Vanguard_<unit> unit frames, Vanguard_CastBar_<unit>, Vanguard_Bar1..8, Vanguard_Raid (secure header),
│  Vanguard_MainTanks, Vanguard_PlayerAuras, Vanguard_SwingTimer, nameplates, Vanguard_Meter, Vanguard_Rolls
│                                                                     ← flat on purpose; no new art here
├─ Edges: Vanguard_Minimap (+ drawer, quest spots), Vanguard_MenuStrip, Vanguard_InfoStrip, Vanguard_BrokerStrip,
│  DataBars, Vanguard_QuestTrackerFrame                               ← minimap ring is the one ornament slot
└─ Full screen: Vanguard_AfkScreen (painted scene), Vanguard_LowHealthVignette
```

| Area (files) | Hierarchy | Consistency | Combat readability | Density | Accessibility | Art opportunity |
|---|---|---|---|---|---|---|
| Unit frames, cast bars (`UnitFrames`, `CastBars`, 8 files) | Clear: name, bars, values on one panel; shield corners echo the crest | One panel primitive, one corner language | Good: flat fills, outlined numbers | Right for the job | Safer colours, glyph states | None. Painted fills or frames would cost recognition. |
| Action bars (7 files) | Icons carry it; game icons cropped by `T.Crop` | Consistent | Good | Fine | Range and power tints by token | Classic look bar backing only (already drawn). |
| Raid and party (9 files) | Tiles, dispel letters and corner marks | Consistent | Good; dispel wash and letters | Dense by need | Dispel shapes off the colour axis | None in tiles. |
| Nameplates (1 file) | Simple | Consistent | Good | Low | Reaction colours with Safer colours | None. |
| Minimap and strips (7 files) | Square map with diamond corners; round map in Classic | Round ring is a 3-texel line | n/a | Low | Zone text colours | Painted ring for the round map. |
| Chat (7 files) | Flat rounded panel, tabs | Matches theme | n/a | n/a | Text size | Panel texture only, if at all. |
| Bags, tooltips | Game bags skinned (`GW.SkinBagWindow`), flat tooltip | Consistent | Tooltip readable | n/a | n/a | Panel texture applies already. |
| Options, setup, What's new (`Core/Options*`, `Setup`, `WhatsNew`) | Strong: nav, cards, section headers | The most polished area | n/a | Medium | Focus ring, text fit | Header rule motif, corner brackets, a welcome banner. |
| Quest dialog and log (12 files) | Reading windows; faction crest watermark at 0.1 | Consistent | n/a | Medium | Text size | Corner brackets (log), surface texture. |
| Game windows (`Windows*`, 9 files) | The game's layout with Vanguard panels; game art faded | Interiors keep the game's art: talent cards, map, token page, collection rows, role icons | n/a | The game's | The game's | Panel texture and ornaments only. Interiors stay the game's (taint risk, scope). |
| AFK screen (1 file) | Card over a painted scene | The one painted image | n/a | Low | n/a | Done (#722). |

The overall verdict: the HUD is a coherent flat system and should stay that way. The places that read as unfinished are the opt-in decorative layer (Classic look, Window ornaments) and the first-run windows, which are forms with no picture.

### 2.3 Gaps, ranked

Impact is how much a player notices it (1 to 5); effort is work to close it with painted art (1 to 5, lower is cheaper).

| Rank | Gap | Impact | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | Classic look and Window ornaments use 14-unit line brackets and a 7-unit diamond (`OrnamentCorner` 16x16). A look named "Classic" reads as a wireframe of itself. | 4 | 1 | Existing slot, existing switch, texture swap only. |
| 2 | Round minimap ring is a plain 3-texel line (`RoundRing`), the most visible ornament spot in Classic. | 4 | 2 | Existing slot; needs the ring's inner edge to match the `RoundDisc` mask. |
| 3 | Vanguard's own panel surfaces are code noise at ≤ 8 % alpha, so players who want texture pick the game's Rock, Marble or Dialog, which mixes the game's art into Vanguard's windows. | 3 | 2 | Existing picker; two Leonardo-made patterns (bedded slate, vellum fibre) that code noise cannot make give a Vanguard-made choice. |
| 4 | Setup and What's new open as forms with no picture. A new player's first look at Vanguard has no brand moment beyond a 28-unit crest. | 3 | 3 | Needs a new slot (post-launch UI code). |
| 5 | The brand crest is never shown large in the addon; the faction crests are third-party glyphs. | 2 | 3 | Not closed by painting: a painted crest would twin the faction crest and drift from the mark (§5, Not in this plan). The code-drawn crest can be shown larger where a window has room. |
| 6 | `ControlTile`/`ControlTileLine` are 80x80, not a power of two, against the wiki's rule (§3.2). | 2 | 1 | Technical: confirm on Forever, or regenerate at 64x64 or 128x128. Not an art task, listed so it is not lost. |
| 7 | Game-window interiors keep the game's art (talent cards, map, collections rows, token page). | 3 | 5 | Out of scope: replacing the game's own art inside its windows risks taint and has no texture slot. |
| 8 | Status bars have three textures (Vanguard, Soft, Flat); a painted bar adds little and risks colour accuracy. | 1 | 2 | Optional, last. |

---

## 3. Phase 2: research

Verified means read on the page cited, today. Unverified means searched and not found, or the page could not be opened; each one becomes a probe step or an open question.

### 3.1 What makes an addon UI feel like one design rather than a skin

These are working principles, drawn from the repo's own design record and from the accessibility standards cited; they are the yardstick the reviews use.

- **One system, not one coat of paint.** Cohesion comes from shared tokens (colour, spacing, type roles, corner language) applied by primitives, so every new window inherits them. Vanguard already works this way (`T.Panel`, `T.Text`, `T.SPACE`, `T.Tint`). A "skinned" UI is the opposite: art laid over each frame one by one, which drifts because nothing ties two frames together. New art must therefore enter through the same primitives (`T.Ornament`, the panel-texture picker, `T.Texture`) and take its colour from tokens.
- **Ornament on windows, never on the HUD.** Combat frames are read in a fraction of a second; texture and ornament there add noise (Cliff's crisp-look rule and Calm HUD both point this way). Decoration belongs to windows you read at rest, but some windows are open in a fight: the quest log (opened with L, bracketed today), bags, menus and every tooltip, which carry the panel surface. So ornament is tinted no louder than today's (`accentDim`), and the surface ceiling is set by the text that is read in a glance over a bright world, not by what looks good on a dark one.
- **Contrast.** Text needs at least 4.5:1 against what it is drawn over, and large text 3:1 ([WCAG 2.2, SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)); a background image counts as the background (failure F83). Parts of a control needed to identify it need 3:1 against neighbours ([SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)); decoration is exempt, which means ornament must never be the only thing that shows a control or a state.
- **Colour is never the only signal.** Vanguard already pairs states with glyphs and dispel types with letters and shapes (`T.STATE_GLYPHS`, `Core/Theme.lua:145`; `A.DISPEL_GLYPHS`, `Core/Auras.lua:159`). Painted art must not undo that by tinting a state by hue alone.
- **Texture cost.** Assume a texture file stays in memory as decoded pixels once loaded (how long, and whether with mipmaps, is not documented, §3.2); art whose file is set only when its window first shows costs nothing until then.

### 3.2 Texture facts for the WoW Forever client

The Forever client's UI source is the `forever` branch of Blizzard's UI code mirrored at `github.com/Gethe/wow-ui-source`; its `version.txt` reads `1.60.1.70532` (TOC interface 16001). The generated API documentation there is the closest thing to a spec for this client.

| Fact | Status | Source |
|---|---|---|
| `Texture:SetTexture(textureAsset, wrapModeHorizontal, wrapModeVertical, filterMode)` exists, returns success | Verified on `forever` | `Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleTextureBaseAPIDocumentation.lua` on the `forever` branch |
| `SetTextureSliceMargins(left, top, right, bottom)`, `SetTextureSliceMode(mode)` ("whether the center and sides are Stretched or Tiled ... Defaults to Stretched") and `ClearTextureSlice` (shader nine-slice on one texture) exist | Verified on `forever` | same file |
| `SetSVG(svgAsset)`, `SetSpriteSheetCell(cell, rows, cols, w, h)`, `SetRadialProgressBar*`, `SetSnapToPixelGrid`, `SetTexelSnappingBias`, `SetHorizTile`/`SetVertTile`, `SetMask`, `SetRotation`, `SetDesaturation`, `SetGradient` exist | Verified on `forever` (that the methods are listed, not how they behave for addon files) | same file |
| Formats: "Custom images must be in BLP, JPEG, PNG, or TGA format with power-of-two dimensions"; TGA "8bpp grayscale, 24bpp RGB, or 32 bpp RGBA; RLE is supported"; PNG added in 10.0.7 and "must explicitly include the '.png' extension" | Verified for the retail API (page edited 2026-08-10); **not verified on Forever** | [warcraft.wiki.gg: SetTexture](https://warcraft.wiki.gg/wiki/API_TextureBase_SetTexture) |
| Filter modes: LINEAR (default, bilinear), TRILINEAR ("also samples mipmaps"), NEAREST; wrap modes CLAMP, CLAMPTOWHITE, CLAMPTOBLACK, CLAMPTOBLACKADDITIVE, REPEAT, MIRROR | Verified (retail page) | same page |
| `SetTextureSliceMargins` "Enables nineslice texture rendering using the specified pixel margins ... Preferred over legacy nineslice approach that uses 9 separate textures", added 10.2.0 | Verified (retail page) | [warcraft.wiki.gg: SetTextureSliceMargins](https://warcraft.wiki.gg/wiki/API_TextureBase_SetTextureSliceMargins) |
| Backdrop edge files are cut into 8 equal slices (left, right, top, bottom, four corners) | Verified, old page (2016) | [warcraft.wiki.gg: EdgeFiles](https://warcraft.wiki.gg/wiki/EdgeFiles) |
| BLP holds up to 16 mipmaps and can be DXT-compressed (4x4 blocks) | Verified (2024 page) | [warcraft.wiki.gg: BLP files](https://warcraft.wiki.gg/wiki/BLP_files) |
| The game's nine-slice layouts (`NineSliceUtil.ApplyLayout`) are built from atlas names (`pieceLayout.atlas`), which addons cannot add to | Verified on `forever` | `Interface/AddOns/Blizzard_SharedXML/NineSlice.lua` |
| Whether the client builds mipmaps for addon TGA/PNG, how much video memory an addon texture takes, the largest texture size, whether non-power-of-two files load, whether `SetSVG` accepts an addon file | **Not found** | none; the probe can only report that a method exists (M0.1), so these are settled by eye in the M1a in-game check (R1) |
| Mask textures: `CreateMaskTexture` exists; no stated limit per texture | Verified exists; limit not found | [warcraft.wiki.gg: CreateMaskTexture](https://warcraft.wiki.gg/wiki/API_Frame_CreateMaskTexture); the repo's own rule (at most 3 masks per texture, never more than 2 corner masks) stays in force |
| What the Forever client is | Weak (news): it "uses a version of the modern UI from the current Midnight expansion, with changes for Classic content" | [Warcraft Tavern, 2026-09-17](https://www.warcrafttavern.com/forever/news/wow-forever-loads-your-retail-addons-keybinds/) |

What this means for the plan:

1. **Stay on 32-bit TGA, power of two.** It is the format the addon already ships and Cliff has seen it draw in the 12.x retail client; the shipped 1024 x 512 AFK scenes are the largest size in the repo, and nothing larger is verified. PNG would shrink the download but is unverified on Forever and would change how `T.Texture` builds paths. The wiki's own examples allow non-square powers of two (8 x 32), so 32 x 8 and 2:1 sizes are fine. The addon already ships non-power-of-two files (`ControlTile` 80 x 80, drawn on every window-control hover, and the sized icons at 20 and 24 px); ask Cliff whether he has seen those draw before spending probe time on it.
2. **Assume no mipmaps; size for the screen, not for the zoom.** A small piece is baked at the pixel sizes it is drawn at and picked by pixels per unit (§5.0), the way the sized menu icons are, so no texture is drawn more than about 1.4 x smaller or larger than it is.
3. **A load failure is invisible to code.** The wiki notes `SetTexture` "always appears to return true", loading is asynchronous and size reads 0, 0 until `IsObjectLoaded` is true. Only Cliff's eyes on a shown texture prove that a file draws.
4. **No nine-slice now.** Shader nine-slice (`SetTextureSliceMargins`) exists on Forever, is `AllowedWhenUntainted` (own frames only), and is not needed until a painted frame is made (deferred, §5).
5. **Texture memory is not addon memory.** `GetAddOnMemoryUsage` counts Lua memory; decoded textures do not show there. Budget it by arithmetic (width x height x 4 bytes, plus a third if the client keeps mipmaps).
6. **Harness first.** `SetTextureSliceMargins`, `SetSnapToPixelGrid` and `SetTexelSnappingBias` are in the harness (`scripts/lib/wow-widget-api.lua:50`); `IsObjectLoaded`, `SetTextureSliceMode`, `ClearTextureSlice`, `SetSVG`, `SetSpriteSheetCell` and `GetTextureFilePath` exist on `forever` but not in the harness, and need the `add-game-api` skill (citing the `forever` docs) before any code calls them.

### 3.3 Pipeline tooling

- **TGA writing** is already in the repo (`tga()` in `scripts/lib/media-art.mjs`), and a dependency-free PNG reader exists (`readPng` in `scripts/lib/media-scenes.mjs`). It reads only 8-bit RGB or RGBA, not interlaced, and rejects greyscale, palette and 16-bit files. Cliff's earlier Leonardo downloads arrived as 3072 x 1536 JPEGs and were re-saved as plain 8-bit RGB PNGs before commit, so the download format must be confirmed (C4) and the conversion step written down. Every step this plan needs (crop, box downscale, luminance, blur, seamless wrap, alpha mapping) is plain arithmetic on that pixel array, so it can run inside `npm run media` with no new dependency. To stay byte-for-byte reproducible under `--check` on any Node version, the new steps use integer or fixed-point maths (no `Math.exp`, `Math.pow` or `Math.hypot` in loops over a million pixels).
- **BLP:** the only command-line converter found is decode-only (BLP to PNG/TGA, MIT licence); the only encoder found is a small TypeScript library (MIT, version 0.2.0) that has not been tried here. Neither is needed while the addon ships TGA.
- **Atlases:** addons cannot register atlases; a sprite sheet is one texture cut with `SetTexCoord` (or `SetSpriteSheetCell`, unverified for addons). This plan keeps one file per asset because each is small and loads with its window.

### 3.4 Leonardo.ai today

The API pages describe each model's controls exactly; the web app exposes most of them, and C4 confirms what Cliff's app shows.

| Capability | What is verified | Source |
|---|---|---|
| Models | Leonardo's own: Lucid Origin, Lucid Realism, Phoenix 1.0, Phoenix 0.9. Several third-party models are also hosted (not named here). | [Leonardo docs: list of models](https://docs.leonardo.ai/docs/list-of-models) |
| Phoenix 1.0 controls | `negative_prompt`; `tiling` (true or false); `contrast` LOW, MEDIUM (default) or HIGH; `mode` FAST (default), QUALITY or ULTRA; one style preset, including "None", "Minimalist", "Graphic Design Vector" and "Illustration"; `seed`; prompt up to 2000 characters; width and height 32 to 2048 in multiples of 8 | [Leonardo docs: Phoenix](https://docs.leonardo.ai/docs/phoenix) (read 2026-11-02) |
| Phoenix 1.0 reference images | Style: up to 4 references, strength LOW, MID, HIGH, ULTRA or MAX. Content (form and content): 1 reference, LOW, MID or HIGH. Character: 1. Image to image: 1. | same page |
| Lucid Origin controls | `mode` FAST or ULTRA, `seed`, `prompt_enhance`, one style, one style and one content reference; the page says negative prompt, contrast, transparency and tiling are not covered; marketed for vibrancy | [Leonardo docs: Lucid Origin](https://docs.leonardo.ai/docs/lucid-origin); [help article, 2026-08-25](https://intercom.help/leonardo-ai/en/articles/11890238-lucid-origin) |
| Prompt enhance | Defaults to AUTO, so it has to be turned off on every run | Phoenix docs page |
| Seeds | Hold a result only when prompt, size, model and every setting are the same: good for re-running, not for editing | Phoenix and Lucid Origin docs pages |
| Transparency | API parameter `"transparency": "foreground_only"` on compatible models (the example uses a legacy model); not listed for Phoenix or Lucid Origin | [Leonardo docs: transparency](https://docs.leonardo.ai/docs/generate-images-using-transparency) |
| Upscaling | Universal Upscaler, at most 2 x and 20 MP, with a creativity setting that "may deviate from the original image" | [Leonardo docs: Universal Upscaler](https://docs.leonardo.ai/docs/image-variations-with-universal-upscaler); [help: Universal Upscaler](https://intercom.help/leonardo-ai/en/articles/8756274-universal-upscaler) |
| Elements (custom style training) | 10 to 50 images; the default training base is a third-party model; using an Element costs 1 token | [Leonardo help: Elements, 2026-02-19](https://intercom.help/leonardo-ai/en/articles/10501488-how-to-train-and-use-elements-loras-and-datasets-on-leonardo-ai) |
| Token costs | The help centre's table (2026-08-25) prices a 768 x 768 default image at 1 token and image guidance at 1 to 7 tokens, but does not price Phoenix, Lucid Origin, these sizes or the modes. The app shows the exact cost beside the Generate button. Third-party pages put Phoenix at 1024 x 1024 around 8 to 12 tokens an image (weak). | [Leonardo help: token usage](https://intercom.help/leonardo-ai/en/articles/8044033-token-usage); [third-party summary](https://dev.to/techsifted/leonardo-ai-pricing-2026-free-credits-paid-plans-and-api-costs-16a2) Measured in Cliff's app on 2026-11-02: 24 tokens for four Phoenix 1.0 images at Quality, 1776 x 1008, about 6 an image. |
| Private mode | "Private image generation is a feature only available to paid members"; Leonardo sets "no usage caps, quotas, or other limits on private generation" | [Leonardo help: private and public images](https://intercom.help/leonardo-ai/en/articles/8044029-private-public-images) Cliff's app showed Private Mode on and a paid token balance on 2026-11-02 (C1, in part). |
| Web app controls (Phoenix 1.0) | Seen in Cliff's app on 2026-11-02 (C4, in part): Prompt Enhance, Style, Contrast, Generation Mode Fast / Quality / Ultra, sizes 2:3, 1:1, 16:9 and Custom, 1 to 4 or more images, Private Mode, and under Advanced Settings switches for Negative Prompt, Tiling and Use Fixed Seed. Tiling is a sticky switch: on for surfaces only, off for concept sheets and the banner. | Cliff's screenshots, `/mnt/project-files/leonardo-art/m0-cliff/` |
| Tokens vs API credits | Web app uses tokens, which expire; the API uses API credits, which don't | [Leonardo help: FAQ, 2026-02-16](https://intercom.help/leonardo-ai/en/articles/7051613-frequently-asked-questions) |
| Plans and prices | **Not verified from Leonardo** (its pricing page would not load). Third-party pages from June to October 2026 list Free (150 tokens a day), Essential $12 a month (8,500 tokens), Premium $30 (25,000), Ultimate $60 (60,000); older pages use the names Apprentice, Artisan, Maestro | Weak: [cost summary, checked 2026-10-29](https://www.costbench.com/software/ai-image-generators/leonardo-ai/) |

### 3.5 Prompting for a consistent set

- **Style references carry look; one content reference carries shape.** On Phoenix 1.0, up to four Style references set the look and one Content reference sets form. References are small crops of the crest's materials (a brass patch with its outline, a rim with studs), never the whole crest, which would pull swords, a shield and letter shapes into every ornament (§6.2). Every run of a class uses the same references at the same named strength.
- **Ask for the crest's drawing style, not a material photograph.** "Flat vector illustration, three flat tones, hard edges, thin dark outline" describes the crest; "worn satin brass, domed rivets, top-left light" describes a 3D render and pulls in shine and grime. Avoid "game UI asset" and "fantasy frame": they pull in glossy bevelled interface art. Try the "Graphic Design Vector" and "Minimalist" presets against "None" once (C4).
- **Ask for shapes, then draw them.** Models do not hold counts, circles or symmetry. For ornaments, ask for shape options, pick one, and draw it in code.
- **Keep the subject in the centre with room around it**, so a crop never cuts the piece.
- **To edit a good candidate, guide from it** (Content or image-to-image reference at LOW or MID) rather than changing a phrase on the same seed; a seed only repeats a result when nothing else changes.
- **Scenes are the exception:** atmosphere is allowed in a painted scene, never on an ornament.
- **Negative phrasing goes in the negative box, never in the prompt** (the prompt pack found "no ..." phrases pull those things in). Phoenix has the box; Lucid Origin does not, which is one reason this plan uses Phoenix throughout.
- **Never name the game, its maker, its factions, places or characters** in a prompt (the prompt pack's rule): those words pull in trademarked emblems and styles.
- **Generate at an integer multiple of the shipped size**, so the downscale is a clean box filter, and do not upscale just to downscale: an upscaler invents detail that the box filter then averages away.

### 3.6 Licence and ownership

- **Commercial use** is allowed on every plan: Leonardo's help says "In both examples, Jason and Jane can download their own generations for commercial usage" ([commercial usage, 2026-08-25](https://intercom.help/leonardo-ai/en/articles/8044018-commercial-usage)).
- **Ownership is split by plan, at the moment of creation.** Paid private generations: "users retain full ownership, copyright, and all other intellectual property rights to their images" (same page), and the FAQ says Leonardo "assigned to you all rights, titles, and interests in the outputs" generated as a paid subscriber, which stays true after a downgrade ([FAQ](https://intercom.help/leonardo-ai/en/articles/7051613-frequently-asked-questions)). Free-plan images are public, and secondary readings of the Terms quote that for free subscribers "ownership of all Intellectual Property Rights in any Output ... will vest in us upon creation" ([a reader's quotation, checked 2026-10-22](https://thelicenseledger.com/questions/can-i-use-leonardo-ai-images-commercially/)). Public images also give Leonardo "worldwide perpetual rights" and let other users copy and remix them.
- **The Terms themselves were not read** (the page would not load from here), so section numbers, the date and the exact restrictions are unverified. Secondary readings mention that outputs "may not be unique across users" and that users must follow third-party model terms, one more reason to stay on Leonardo's own models.
- **Copyright in AI pixels is thin.** In the US, "prompting alone does not qualify as sufficient human authorship", while original human selection, arrangement and modification can be protected ([summary of the Copyright Office's Part 2 report, January 2025](https://copyrightalliance.org/ai-report-part-2-copyrightability/)). "All rights reserved" protects Vanguard's code and drawn art fully; for an AI image it protects what Cliff added (the crop, the processing, the composition with the UI), not the raw pixels.
- **The stores:** CurseForge's moderation policies (modified 2026-10-22) ask for "a clear and visible disclaimer" on showcase images that are AI-modified and could mislead about the project, and require permission for third-party content ([CurseForge moderation policies](https://support.curseforge.com/support/solutions/articles/9000197279)); no rule against AI-made assets inside a project was found. No Wago policy on AI art was found (its terms page returned no text). Both can change.
- **What follows for Vanguard:** generate only on a paid plan with private mode on, and record plan, privacy and date per image in the manifest; check in C4 that the three shipped AFK scenes were made that way (if not, remake them privately before the next release); keep the code-drawn crest as the mark; say "made with Leonardo.ai" in `art/CREDITS.md` and `Media/Art/CREDITS.txt`, and say "AI-assisted" next to any listing image that shows the painted art. Nothing here is legal advice; Cliff reads the Terms himself (§9, Q1).

### 3.7 Post-processing that keeps UI edges clean

Small ornaments and the ring are drawn in code (§4.1), so raster post-processing covers surfaces and colour art only. Steps 2 onwards run in `npm run media` from manifest fields, in integer or fixed-point maths, so the output is the same bytes on every machine:

1. **Convert and crop (by hand, once, before commit):** turn the download into an 8-bit RGB PNG with no colour profile, crop to the manifest's box, and write the command used into the manifest. This file is the committed source.
2. **Seamless wrap** (surfaces, even when Phoenix's tiling switch was on): blend the tile with itself shifted by half its size, weighted towards the shifted copy near the edges, then rescale the blended zone so its local variance matches the rest of the tile (a plain cross-fade halves the variance at the mid-lines and leaves a faint cross that repeats at 3 x 3). Tests: the first and last rows and columns differ no more than neighbouring rows; local variance in a 16-texel window stays within 15 % across the tile.
3. **Remove lighting drift** (surfaces), after the wrap so the blur sees a tile with no edge: subtract a toroidal blur (three box-blur passes that wrap at the edges) of radius one eighth of the tile, so large bright and dark patches go and the pattern stays.
4. **Grey:** luma from Rec. 709 weights on the sRGB values as stored (gamma-space luma, written down so it is never "fixed" later).
5. **Downscale** by an integer box filter only (1024 to 256 is 4 x; 2048 to 1024 is 2 x).
6. **Surface alpha:** map the zero-mean pattern to alpha as `alpha = 0.03 + gain x pattern`, with the gain chosen so the 99th percentile lands on `PAINTED_MAX_ALPHA`, then clamp to 0 and `PAINTED_MAX_ALPHA`, on white. `PAINTED_MAX_ALPHA` is 12/255 (about 0.047), the largest byte-exact value under 0.05, below the code surfaces' `SURFACE_MAX_ALPHA` 0.08 (`scripts/lib/media-surfaces.mjs:9`) for the contrast reason in §4.4; `byte()` in `media-art.mjs` rounds, so every alpha test and the §8 contrast table read the written bytes, not the float image. The build reports the feature band and the number of distinct alpha levels used (at least 8 of the 13 bytes 0 to 12).
7. **Colour art:** box-downscale, measure saturation (§4.5), write as `colour`.
8. **Drawn shapes** (bracket, motif, ring): drawn at each baked size with the existing primitives (`box`, `line`, `poly`, `arc` in `media-art.mjs`), one anti-aliased texel at the edge, tones from §4.2. Transparent pixels keep the colour of the nearest edge pixel (edge bleed), which here is the dark outline, so filtering never pulls a light fringe into a dark edge. This is a new "toned" kind beside the existing rule that tinted glyphs are white in every pixel (`clearPixelsWhite`, `scripts/media.test.mjs:246`), whose reason (no dark fringe on a white glyph) still holds for glyphs.

---

## 4. Visual direction brief

**One sentence:** Vanguard's art is drawn the way its crest is drawn: hard-edged shapes in three flat tones per material, each wrapped in a thin dark outline, cut from the crest's and the shield corners' geometry, coloured by the theme's tokens, and always quieter than the text and bars beside it.

### 4.1 Who makes what

Painted pixels and exact edges come from different tools. The split is the core of this plan.

| Kind of asset | Made by | Why |
|---|---|---|
| Small ornaments (corner bracket, rule motif), any new icon | Code (`scripts/lib/media-sources.mjs` drawing), from a Leonardo concept sheet Cliff picks | They are drawn at 14 to 56 screen pixels beside one-pixel lines; only a vector drawing gives exact straight edges, chamfers and symmetry at that size |
| Ring geometry (round minimap) | Code: exact radii inside `RoundDisc`, exact stud count and spacing | A model cannot hold a circle, a radius or a count |
| Panel surfaces | Leonardo, reduced to an alpha pattern | A surface is white at up to 8 % alpha, so only its pattern survives; Leonardo earns its place only where code noise cannot make that pattern |
| Scenes (AFK, banner) | Leonardo, full colour | Painting is the point; text sits on a shade, never on the paint |
| The brand mark | Code (`art/brand/vanguard-crest.svg`) | Cliff owns it outright; its geometry is exact |

### 4.2 Style rules, in numbers

- **Tones:** three per material (base, lit facet, recess) from about 24 screen pixels up; two (base and outline) below that. No gradient across a shape, no noise on metal.
- **Outline:** one dark outline round every shape, at least 1 texel, about 0.7 % of the piece's width at larger sizes (the crest's is 8 units on 1024, `stroke-width="8"`).
- **Edges:** hard alpha. Alpha is 0 or 1 except one anti-aliased texel at an edge.
- **Values for tinted art** (before the tint): base 0.72, lit 1.0, recess 0.45, outline 0.15. Tinted with `accentDim` (the token every ornament uses today, `T.PaintOrnament`, `docs/THEME.md`: "for accent borders and ornament only"), brass gives lit `8a6a2f`, 3.6:1 on the panel, with base and recess below it. The lit facet is never the `accent` itself: `accent` is the colour of selected rows, focus rings and primary buttons, and an ornament that matches a state colour reads as a state. The gate is measurable (§8): the brightest ornament texel stays at or below 4:1 against `panel` and below `muted` in every variant and preset. These values are a starting point; the M0.2 tint sheet confirms them under every accent and variant.
- **Detail budget, in screen pixels at 0.9 px per unit** (the smallest case: 1080p at the slider's lowest scale, 0.64): no line under 1 px, no feature under 2 px. The bracket at 14 units is two bars 2 units wide with a 1 unit outline; its 2 x bake adds the recess line. The rule motif at 24 x 7 units is a diamond with an outline. The ring's band is 4 texels (about 3 units at the default size): one dark outline texel each side and two texels of base tone, with flat dark studs at least 4 texels across; it has no inner line, so nothing in it falls under the 2-texel rule (§5.0).
- **Light:** implied by the tones only (lit facet on top and left edges). No cast shadow, no specular spot, no glow.
- **Loudness:** an ornament's area is at most 2 % of its window's area, and its brightest texel, tinted, is at or below 4:1 against `panel` and darker than `muted` (the gate in §8). A bigger ornament must be fainter, never louder.

### 4.3 Motifs, checked against the crest

| Motif | Where it is (crest SVG, or the addon) | Used for | How |
|---|---|---|---|
| Dark outline | Every crest shape, `stroke="#0b0d11"` | Every shape | Rule above |
| Flat planes | Blade `#a9b1bc` with its `#e4e8ee` facet; brass `#d9a441` with dark brass `#b5842d` | Every shape | Three tones |
| Diamond | The brass tip at each guard and the boss at the shield's top | Rule motif centre; the ring's four cardinal marks | 1:1 or 2:1 |
| Dark studs | 41 flat dark dots (`r=7`) cut into the shield's rim | The ring | Flat dark dots, never domes; count set by code (24 on the ring, so they sit about 22 units apart at the default size) |
| Inner outline | The V's brass inner line | One recess line inside a bar | Inset a quarter to a third of the bar's width |
| 45° chamfer | Not in the crest: Vanguard's shield corners (`T.CORNER_CUT`, 8 units; the feature page calls it "the shape of the Vanguard crest") | The bracket's corner | 45° |
| Crossed blades at ±33°, heater shield, the V | The mark | Never in ornament | Kept for the mark only |

### 4.4 Surfaces are patterns

A surface lightens the panel by a few shades and carries no hue. The shipped ceiling is `SURFACE_MAX_ALPHA` 0.08 on white (`scripts/lib/media-surfaces.mjs:9`), and at 0.08 the `disabled` tier already misses the 4.5:1 that `docs/THEME.md` promises in five of the eight variants (4.40 to 4.49:1 over a dark world, computed from the tokens; the existing surfaces reach about 0.054 and 0.07, so the miss is small today). The new surfaces use a ceiling of their own, `PAINTED_MAX_ALPHA` = 12/255 (about 0.047, §3.7 step 6), which keeps `text`, `text2`, `muted` and `disabled` at 4.5:1 over a dark world in every variant; whether the three existing surfaces move to the same ceiling is Q5 (§9), since it changes what players already see. Each surface is named for its pattern and must be told apart from the three code-made ones.

| Surface | Pattern | Must differ from |
|---|---|---|
| S1 Bedded slate | Broken, jittered bedding lines running across, features 4 to 16 units, very low contrast; never straight parallel lines, which beat against the pixel grid at 0.9 to 1.9 px per unit and crawl while a window rises into place | Carved stone: round mottling 4 to 64 units with seams |
| S2 Vellum fibre | Short random fibres and specks, 4 to 8 units | Fine grain: one-unit speckle over 32-unit blotches |

A tiled surface draws one texel per UI unit, like the existing ones (`Core/PanelTexture.lua:66-72`), so its features are sized in units and look one to three times larger on a 4K screen than on 1080p. That is true of today's surfaces too; the in-game check covers both ends. A surface is drawn on every floating window and on tooltips, menus and bags (`Core/PanelTexture.lua:1-5`), including the ones open in a fight; the contrast ceiling above is what makes that acceptable, and `media.test.mjs` adds a banding check: on the tile's alpha channel, the mean normalised autocorrelation along each axis (rows shifted against rows, columns against columns, wrapping) at lags 2 to 64; the largest value on either axis stays below the largest value measured on the three existing surfaces plus 0.05.

### 4.5 Colour art (scenes and banner)

- Painterly, with atmosphere (dusk, haze) allowed: scenes are the one place for it.
- Median saturation at most 0.45 and the 90th percentile at most 0.7 (the shipped AFK scenes measure 0.18, 0.53 and 0.59 median; the banner sits with the calmest of them). The build measures it.
- Cloth in a scene is undyed (cream, grey) or brass-coloured: never blue or red, which read as faction colours next to the faction crests.
- No emblems, no lettering, no recognisable places or characters from the game.
- Any text over a painting sits on a `shade` band (black at 0.5, `Core/Theme.lua:86`). That alone does not guarantee 4.5:1: `text` over the band over a white sky is 3.3:1 and over a pale cream sky 4.1:1 (computed). So the build measures it (§8): in the band's area the painting's 95th-percentile luminance, under the band, must keep `text` and `text2` at 4.5:1; if a candidate fails, the band goes to 0.65 for that window or the title moves below the banner.

### 4.6 This, not that

| This | Not that |
|---|---|
| Two straight bars meeting at a 45° chamfer, one dark inner line, a dark outline, three flat tones | Scrollwork, acanthus, filigree, curls, vines, gems |
| A thin ring, 24 flat dark studs at exact spacing, four small diamonds | Runes, zodiac or compass letters, glowing stones, domed rivets, a band that hides the map |
| A tile whose repeat you cannot find in five seconds at 3 x 3 | Blotches, a visible grid, cracks that line up across tiles |
| Flat tones that imply top-left light | Fog, sparks, bloom, rim light, shine, scratches, grime on ornaments |
| A piece that reads at 14 screen pixels | Detail that reads only when zoomed |
| Shapes built from the crest's outline, planes, diamond and studs | Anything like the game's faction emblems, its window frames or its logo |
| Undyed or brass cloth in scenes | Blue or red banners |

**Exemplars:** the first code-drawn bracket (A1) and the M0.2 tint sheet are the approved "this". Rejected candidates are kept in the project folder (`art-review/rejected/`, with one line on why) as the "not that". A new asset is judged side by side with both.

---

## 5. Asset manifest

### 5.0 Rules for every row

- **Texture size.** One UI unit is (screen height / 768) x UI scale pixels: 1.0 px at 1080p and scale 0.71, 1.4 px at 1080p and 1.0, 1.9 px at 1440p and 1.0, 2.8 px at 2160p and 1.0. Small drawn pieces (under 64 units) are baked twice, at 1 x and 2 x their size in units (rounded up to a power of two, the drawing filling the size it is meant for), and the Lua picks the bake by pixels per unit (`T.PixelsPerUnit()`, `Core/Theme.lua:603`, which reads UIParent's scale; `T.Pixel` is its inverse, units per pixel): the 1 x bake while `T.PixelsPerUnit() <= 1.6`, the 2 x bake above. A window with its own scale would pick wrongly; no decorated window sets one today, and the test states that. The 16-texel bake carries 14 units (1.14 texel per unit) and the 32-texel one 2.29, so every piece is drawn within about 1.4 x of its texel size; the client is assumed to have no mipmaps, so a bigger ratio shimmers. The ring is baked at 256 and 128 texels and picked by its drawn pixel size (256 at 160 px and above); surfaces and colour art are single files, since painterly art tolerates minification and thin lines do not. Large drawn pieces keep any inner line at 2 texels or more; the ring has none.
- **Format:** 32-bit TGA from `npm run media`, never committed by hand.
- **Classes:** `drawn` (code shapes in toned grey with alpha, tinted by a token), `surface` (white with alpha ≤ 12/255, tileable), `colour` (full colour).
- **Leonardo effort** is Cliff's work: runs of 4 images (no upscales, §6.1).

**Progress** (tick here in the task's commit, as CLAUDE.md asks; a new thread reads this list and the PR body first):
- [x] M0.1 - [x] M0.2 - [x] C1 - [x] C2 - [x] C3 - [x] C4 - [x] H1 - [ ] K1 - [ ] A1 - [ ] K2 - [ ] A2 - [ ] K3 - [ ] A3 - [ ] S0 - [ ] S1 - [ ] S2 - [ ] S3 - [ ] B0 - [ ] B1

Order and gates: M0-code and M0-Cliff in parallel; M1a after both; M1b after A1 is approved (its render is a reference for K2 and K3); M2 after Q5 and Q6; M3 last. Each thread's state lives in this list and its PR body's Tasks section.

### M0-code: Foundations in the harness (one thread, one PR, no shipped art)

| Id | Task | Definition of done |
|---|---|---|
| M0.1 | Probe rows: a `Texture` kind in `widgetOf` (`Modules/Probe.lua:314`; it builds only Cooldown, FontString and Frame today, so the new branch makes a texture on a hidden frame) and rows in `P.METHODS` for `IsObjectLoaded`, `SetTextureSliceMargins`, `SetTextureSliceMode`, `SetSVG` and `SetSpriteSheetCell`. A row reports presence only (`methodLine`), so nothing is added to `scripts/lib/wow-widget-api.lua` and no `full-tests` label is needed; in tests the unlisted ones read "missing", which the scenario asserts. | Scenario passes; `npm run test:quick` green; `/vg probe` wording in `docs/COMMANDS.md` updated. |
| M0.2 | Drawn kind and tint sheet: a `toned` kind in `NOT_TINTED` (`scripts/media.test.mjs:232`) with its own edge-bleed check (bleed to the outline colour, not white); the drawing makers memoised so tests do not decode each file four times; a test-only fixture outside `MEDIA` (under `scripts/fixtures/`, never written to `Media/`, so `noUnusedMedia` at `scripts/media.test.mjs:131` is untouched). The tint sheet: a test bracket in the §4.2 tones, tinted `accentDim` by all five accent presets on `panel`, `raised` and `inset` of all eight variants, as one PNG written to `/mnt/project-files/leonardo-art/m0/tint-sheet.png` (`mkdir -p`) and attached in the thread. | `node scripts/build-media.mjs --check`, `npm run quality` and `npm run coverage` pass; no file under `Media/` changes; Cliff has seen the tint sheet. |

### M0-Cliff: Leonardo setup and decisions (a checklist for Cliff, no thread)

**Done (Cliff, 2026-11-02):** C1 and C2 by screenshot in the thread; C3 and C4 Cliff did himself and keeps ("already have done them"), so no thread asks for them again. Where C4's results would set a value (the concept preset, grid or singles, the surface wording), a thread uses the plan's default and asks Cliff only if a result looks wrong.

Each item is one short ask; the thread that runs M1a posts them as one message and waits.

| Id | Ask | Where the answer goes |
|---|---|---|
| C1 | Two screenshots: the plan page (tier name, private-generation allowance, concurrent jobs, billing date) and the Private mode switch. | §3.4; kept in the project folder, not the repo |
| C2 | In the Library, does each of the three shipped AFK scenes show as private, and what plan were you on in October 2026? | §3.6, §7 credits wording |
| C3 | Read the Terms sections on output ownership, the licence on uploaded content (the reference crops are the crest) and restrictions; paste the section numbers and the "last updated" line. Then read both stores' current rules on AI and third-party content and paste the lines. | §3.6; Q1 |
| C4 | In the app, with Phoenix 1.0: note what it shows of tiling, contrast, mode, seed, negative prompt, style and content references and their named strengths, and the download's file type and size. Then three calibration runs on a throwaway prompt: the K1 prompt under the None, Graphic Design Vector and Minimalist presets (keep the flattest); K1 once as a six-up grid and once as four single pieces; the S1 prompt with "fine", "medium" and "coarse" lines (the thread measures the feature width after the box filter). The K1 calibration output counts as K1's runs. Save the reference crops (§6.2). | §6.1, §6.3, §6.4 |
| Q2 to Q6 | Answered 2026-11-02 (§9). | §9 |

### M1a: Corner bracket (existing slot) and the High contrast fix

Before M1a starts, run the code-quality scanner on `Core/Theme.lua` (`npm install` first; it fails a Core file at 185 top-level locals). M1 adds no top-level local there: new values go on `T` or in tables that exist. Every helper split out below keeps its comment line and stays under 10 lines.

| Id | Asset | Plugs into | Display | Textures | Class | Leonardo effort |
|---|---|---|---|---|---|---|
| H1 | High contrast fix (a behaviour bug, its own commit, `fix-bug` skill) | `T.PaintOrnament` (`Core/Theme.lua:3021`) adds `and not (T.Variant() or {}).flat`, with a test under the contrast variant with `ornaments = true` (`scripts/tests/theme.test.mjs`, near the ornament tests at 864-879) | n/a | n/a | n/a | none |
| K1 | Bracket concept sheet | Not shipped; Cliff picks one of the usable options (C4's runs count) | n/a | n/a | n/a | 1 to 2 runs |
| A1 | Corner bracket, drawn from K1, lit from the top left at every corner | Replaces `OrnamentCorner` (`scripts/lib/media-sources.mjs:208`) with four corner files per bake (`OrnamentCornerTL`, `TR`, `BL`, `BR`, as the corner masks already are, `Core/Theme.lua:1191-1199`), because `cornerPieces` mirrors with `SetTexCoord` and would flip the light, so `cornerBrackets` (`Core/Theme.lua:2996`) gets a corner builder of its own that picks the corner and the bake by `T.PixelsPerUnit()`. Update `BUILT_NAMES` (`scripts/media.test.mjs:121`: remove `OrnamentCorner.tga`, add the eight files) and the ornament tests in `theme.test.mjs` (864-879, 983-994; `find("OrnamentCorner")` still matches the new names). | 14 units | 16 x 16 and 32 x 32, four corners each | drawn, tint `accentDim` | none |

### M1b: Rule motif and the round ring (existing slots)

Starts after A1 is approved. A3 has its own go/no-go (R10): if the rim-blip check fails in game, A3 is reverted and the plan loses it.

| Id | Asset | Plugs into | Display | Textures | Class | Leonardo effort |
|---|---|---|---|---|---|---|
| K2 | Rule motif concept sheet (optional: §4.2 already fixes the diamond and the lines, so run it only if Cliff wants options) | Not shipped | n/a | n/a | n/a | 0 to 1 run |
| A2 | Rule motif, drawn from K2 | New `OrnamentRule` in `headerRule` (`Core/Theme.lua:3007`, already 10 lines, so it is split into a rule builder and a motif placer) instead of `Diamond`; the two one-pixel lines are re-anchored to stop at the motif's half width (today they stop at ±8 units); the motif's pixel height is odd so it centres on the one-pixel line; snap class `icon` (art stays off pixel-grid snapping, `Core/Theme.lua:526-528`). The `Diamond` count in `theme.test.mjs:868` changes with it. | 24 x 7 units | 32 x 8 and 64 x 16 | drawn, tint `accentDim` | none |
| K3 | Ring concept sheet | Not shipped | n/a | n/a | n/a | 2 runs |
| A3 | Round minimap ring, drawn from K3 | New `RoundRingOrnate`, drawn instead of `RoundRing` (`Modules/Minimap.lua:422`) while ornaments are on; `RoundRing` stays (tests and the plain look use it). This is the one HUD-adjacent piece in the plan: the minimap is on screen in every fight, and its rim is where party dots, tracked nodes and pings pass as they leave the view. So the band is 4 texels wide inside the `RoundDisc` disc (radius 127 of 256, `scripts/lib/media-sources.mjs:160`), hiding 6 % of the disc's area against 4.7 % for today's 3-texel line; the map's mask is unchanged, so the mask rules are not touched. Studs are at least 4 texels and drop out below a drawn size of 140 px, leaving a bare band; the 128 bake serves maps under 160 px. `roundTrim` (`Modules/Minimap.lua:417`) is split into ring creation and ring painting, and the painter registers with `T.OnChanged` (`Core/Theme.lua:2930`) so the Window ornaments switch swaps texture and tint at once, as the options row promises (today the ring is built once). `BUILT_NAMES` gains both files. | 180 units (default size; slider 120 to 240) | 256 x 256 and 128 x 128 | drawn, tint `accentDim` | none |

### M2: Panel surfaces (existing picker)

Starts after Q5 and Q6 are answered.

| Id | Asset | Plugs into | Texture | Class | Leonardo effort |
|---|---|---|---|---|---|
| S0 | Surface pipeline: `scripts/lib/media-painted.mjs` for the `surface` class (§3.7 steps 2 to 6, integer maths), reading `art/painted/surface/<id>.png` with `import { readPng } from "./media-scenes.mjs"` and `art/painted/manifest.json` (§6.1 shape); a test that builds each painted file twice and compares bytes; the banding, alpha-level, variance and seam tests of §8; a test that every file under `art/painted/` has a complete manifest entry. Built and tested on S1's first real download, not before. | n/a | n/a | none |
| S1 | Bedded slate | New entries in `T.PANEL_TEXTURES` and `T.PANEL_TEXTURE_CHOICES` (`Core/PanelTexture.lua:19-31`), shared under a "Vanguard ..." name (`Core/SharedMedia.lua:15`) | 256 x 256 | surface | 3 runs |
| S2 | Vellum fibre | same | 256 x 256 | surface | 3 runs |
| S3 | Existing surfaces to the new ceiling (Q5): `Grain`, `Stone` and `Leather` rebuilt in `scripts/lib/media-surfaces.mjs` with `SURFACE_MAX_ALPHA` lowered to 12/255, so the §8 contrast table passes for all five surfaces | `scripts/lib/media-surfaces.mjs:9` and the three files in `Media/Textures` | 256 x 256 each | surface | none |

Gate: each new surface is shown at shipped alpha beside the three existing ones; if Cliff cannot tell it from them, it is dropped. The existing three stay (profiles name them).

### M3: First-run banner (new slot, post-launch code)

| Id | Asset | Plugs into | Display | Texture | Class | Leonardo effort |
|---|---|---|---|---|---|---|
| B0 | Colour pipeline: the `colour` class in `media-painted.mjs` (§3.7 steps 1, 5 and 7), the saturation and title-band measurements of §8, and the banner's fade listed in `docs/THEME.md` with its Reduce motion behaviour | n/a | n/a | n/a | n/a | none |
| B1 | Welcome banner: dusk landscape, an undyed banner on a hill, open sky on the left | A new header slot on Setup's first page (`Core/Setup.lua`) and on What's new (`Core/WhatsNew.lua`), its file set in the window's first `OnShow`; the window title sits on a `shade` band | up to 448 x 224 units | 1024 x 512 (2:1, no crop) | colour | 4 runs |

### Not in this plan, and why

| Idea | Why not now |
|---|---|
| Painted crest in the addon | It would sit beside the faction look's crossed-swords crest (`T.CRESTS`, `Core/Theme.lua:33`) as a near-twin, and a model cannot reproduce the 41 studs, the ±33° blades or the V. For store and Discord art only, it may be made later from the SVG render, with the V and outline laid back on from the SVG. |
| Painted window frame (nine-slice) | Fights the one-pixel border that is the theme's identity; needs the M1a in-game check first. Revisit for the Classic look only, after M1a is seen in game. |
| Painted icons or emblems | Icons follow the 16-unit grid rules (`docs/THEME.md`, Icons); a painted icon cannot meet them. New glyphs stay code-drawn, with a Leonardo concept sheet at most. |
| Painted bar texture | Impact 1 in the audit; a textured fill shifts class and power colours. |
| Anything on the HUD | Combat frames stay flat (§3.1). The round minimap ring (A3) is the one HUD-adjacent piece, and it is kept thin and dim for that reason. |

---

## 6. Leonardo production playbook

### 6.1 Settings for every run

- **Model:** Phoenix 1.0 for everything (concept sheets, surfaces, banner). It is the one Leonardo model with a documented negative prompt, tiling switch and contrast control (§3.4), and one set of terms then covers every asset. Lucid Origin is not used: it has no negative box, and the two assets that need the strongest exclusions (a tile with no seam or vignette, a banner with no blue or red cloth and no people) would go to it.
- **Mode and contrast:** FAST unless a sheet comes out soft, then QUALITY; contrast HIGH for concept sheets (hard-edged flat art), LOW for surfaces and the banner. Both recorded per image.
- **Prompt enhance:** off, set again on every run and re-run (the app defaults it to AUTO). **Tiling** (Advanced Settings) stays as last set, so check it before every run: on for surfaces, off for everything else. **Use Fixed Seed** off, except to re-run a kept image. **Style preset:** the one C4 picked between None, Graphic Design Vector and Minimalist, the same for every concept sheet; None for surfaces and the banner. **Private mode:** on.
- **References:** Style references (up to four) carry look; one Content reference carries shape (§3.5, §6.2). Strength is a named step; start at LOW for Style and MID for Content, written in the manifest, and change it only for a whole class after a calibration run (C4).
- **Images per run:** 4. **Size:** 1024 x 1024 for concept sheets (or four single pieces at 1024, §6.4); 1024 x 1024 with tiling on for surfaces, box 4 x down to 256; 2048 x 1024 for the banner, box 2 x down to 1024 x 512. **No upscaling:** an upscaler invents detail that the box filter averages away; if a native banner is too soft, M3 may try a 2 x upscale at the lowest creativity, recording mode, style, creativity, similarity and multiplier.
- **Cost:** the token figure the app shows beside the Generate button for that model, size and mode, written into the manifest per run; the help-centre price table does not cover these models (§3.4).
- **Record** for each kept image: model, mode, contrast, preset, prompt, negative prompt, seed (if shown; it holds a result only when nothing else changes), references and their named strengths, private flag, date and tokens charged, in `art/painted/manifest.json` (or, for concept sheets, in the commit body of the drawn asset). The plan tier and the generation's link are account details and stay out of the public repo: they go in `/mnt/project-files/leonardo-art/<id>/record.json` in the project folder. A manifest entry looks like:

```json
{ "id": "S1", "class": "surface", "source": "art/painted/surface/S1.png", "output": "Media/Textures/SurfaceSlate.tga",
  "crop": [0, 0, 1024, 1024], "box": 4, "convert": "convert S1-slate-v2.png -strip -colorspace sRGB -type TrueColor S1.png",
  "model": "Phoenix 1.0", "mode": "FAST", "contrast": "LOW", "preset": "None", "tiling": true,
  "prompt": "...", "negative": "...", "seed": 123456, "references": [], "private": true, "date": "2026-11-20", "tokens": 24 }
```

### 6.2 Reference crops

Never the whole crest: a whole-crest reference pulls swords, a shield and letter shapes into every ornament. Instead, crops made in C4 from a 1024 px render of `art/brand/vanguard-crest.svg`, used as Phoenix Style references (look) and, once an approved piece exists, as the one Content reference (shape):

| Crop | Shows | Kind | Used by |
|---|---|---|---|
| R-brass | A patch of the shield's brass field with its rim and outline | Style | K1, K2, K3 |
| R-stud | Three rim studs on the rim | Style | K3 |
| Approved pieces | Once A1 exists, its render at 512 px on a mid-grey ground | Style, and Content for siblings | K2, K3 |

There is no blade crop: the concept negatives exclude blades and swords, and a reference that shows one would push against them. Whether a Style and a Content reference can run together in the app is checked in C4. Surfaces and the banner run without references.

### 6.3 Prompt templates

**Style phrase** (end every concept prompt with it): `flat vector illustration, three flat tones, hard edges, thin dark outline, plain mid-grey background`. Negation never goes in the prompt (§3.5); the ground is mid-grey, not black, so the dark outline and the bar widths can be judged on the sheet (the crest's own ground is near black).

**Concept negatives:** `text, letters, numbers, logo, watermark, signature, sword, blade, shield, crossguard, emblem, coat of arms, lion, eagle, skull, face, scrollwork, filigree, vines, gems, gradients, shading, bevel, gloss, glow, shine, specular highlights, scratches, grime, rust, 3d render, photo, perspective`.

**Single-piece form** (if C4 finds singles beat the grid, §6.4): replace "Six variations of ... arranged in a grid, each" with "One ... centred," and keep the rest.

**K1 bracket sheet**
```
Six variations of a corner bracket in brass arranged in a grid, each an L shape of two straight bars meeting at a 45 degree cut corner, one thin dark line running inside each bar, square-cut ends, flat vector illustration, three flat tones, hard edges, thin dark outline, plain mid-grey background
```

**K2 rule motif sheet**
```
Six variations of a small horizontal divider ornament in brass arranged in a grid, each an elongated diamond with one thin dark line inside its edge, short straight arms on both sides, flat vector illustration, three flat tones, hard edges, thin dark outline, plain mid-grey background
```

**K3 ring sheet**
```
Six variations of a section of a brass ring arranged in a grid, each a curved band with a lighter flat stripe along the outer edge, one thin dark line inside it, small flat dark round dots spaced along the band and one small diamond, flat vector illustration, three flat tones, hard edges, thin dark outline, plain mid-grey background
```

**S1 bedded slate**
```
Flat overhead scan of a split slate slab, fine parallel bedding lines running across it, uniform all over, even flat light, seamless texture, neutral grey
```
**S2 vellum fibre**
```
Flat overhead scan of a sheet of handmade paper, fine short fibres and tiny pulp specks, uniform all over, even flat light, seamless texture, neutral grey
```
Surface negatives: `cracks, veins, stains, blotches, seams, grid, tiles, border, vignette, folds, creases, text`. Tiling on, contrast LOW. The words "fine" and "short" are placeholders until C4 maps them to texels after the 4 x box; a model sizes detail to its canvas, not to pixels.

**B1 welcome banner**
```
Painterly landscape at dusk, a plain undyed cream cloth banner on a spear planted on a grassy hilltop in the right third, rolling hills and a distant grey stone watchtower, muted slate-blue and soft amber sky, the left half open sky, calm, low saturation, wide composition, digital painting
```
Negatives: `text, letters, logo, emblem, coat of arms, symbols on the banner, blue banner, red banner, people, characters, city, bright saturated colours, lens flare`.

### 6.4 How many and how to choose

- **Grid or singles:** a sheet of six is an assumption the model may not hold (uneven cells, merged pieces, five or seven of them). C4 runs K1 both ways; if four single pieces at full resolution give more usable options, every concept run is singles. A run counts by usable options, not by images.
- Concept sheets: up to 2 runs each. Cliff picks one shape; the session draws it. A concept is a shape, not pixels: proportion, bar width, where the line runs, where the diamond sits. K2 is optional (§5, M1).
- Tiles and the banner: up to 3 runs of 4 before changing the prompt, up to 3 prompt changes. After 9 runs with nothing usable, stop and bring the best two to Cliff with what is wrong.
- **Token budget gate:** the nominal plan is about 60 images (15 runs of 4, before references); at the third-party figure of 8 to 12 tokens an image that is roughly 500 to 720 tokens, and the §6.4 worst case (33 runs) about 1,600. Both fit one month of the cheapest paid plan as third parties describe it (8,500). The real figures come from the app's readout (§6.1); if a milestone passes twice its nominal estimate, stop and tell Cliff before the next run.
- Keep a tile only if, tiled 3 x 3 at shipped size, nobody finds the repeat in five seconds and the pipeline's checks pass (§3.7), and the raw download already shows at least 8 distinct alpha levels and a measured feature width in the §4.4 band after the box (checked before any wrap work).
- Keep a banner only if its saturation passes (§4.5), nothing in it resembles a faction emblem or a known place, and the left half is calm enough for the title band.

### 6.5 From download to the addon

1. Cliff downloads the full image and sends it in the thread with the asset id in the name (`S1-slate-v2.png`); the session saves it under `/mnt/project-files/leonardo-art/<id>/` (`mkdir -p`) and never reads his machine.
2. Concept sheets: the session draws the chosen shape in `scripts/lib/media-sources.mjs` with the existing primitives (`box`, `line`, `poly`, `arc` in `media-art.mjs`) and shows a strip at 1 x, 1.4 x, 1.9 x and 2.8 x next to a one-pixel `divider` line and the tint sheet.
3. Surfaces and the banner: the session converts the download to an 8-bit RGB PNG with no colour profile (§3.7 step 1; `readPng` in `scripts/lib/media-scenes.mjs:66` reads only 8-bit non-interlaced RGB or RGBA and there is no JPEG decoder, so the conversion uses an image tool outside the build, for example `convert in.jpg -strip -colorspace sRGB -type TrueColor out.png`, and if no such tool exists in the session it says so and stops), crops it, and saves it as `art/painted/<class>/<id>.png`, writing the exact command into the manifest. Reference crops (§6.2) are rendered from the crest SVG with the `@resvg/resvg-js` dev dependency the build already uses (`scripts/lib/media-crests.mjs:9`). Everything else is a manifest field done by `npm run media`, so the result is reproducible.
4. Cliff sees the result before the commit: the session attaches the strip, the tint sheet and the previews in the thread, and his yes is a message in the thread.

---

## 7. Integration in the addon

- **Files:** raster sources in `art/painted/<class>/`, the manifest `art/painted/manifest.json`, build code `scripts/lib/media-painted.mjs`, drawn shapes in `scripts/lib/media-sources.mjs`, output in `Media/Textures/` (drawn, surface) or `Media/Art/` (colour). `art` is in `.pkgmeta`'s ignore list, so sources never ship; `Media/` does.
- **No new settings.** The ornaments follow the existing Window ornaments switch and the Classic look's `ornaments` flag (`T.PaintOrnament`, `Core/Theme.lua:3021`). Today that function does not check the variant's `flat` flag, so High contrast with the switch on shows ornaments; A1 adds `and not (T.Variant() or {}).flat`, with a harness test under the contrast variant, so a player who chose High contrast for legibility gets none. Surfaces join the Panel texture picker and, like the existing three, draw on tooltips, menus, bags and the quest log in combat (§4.4). The banner follows its window and its fade (Reduce motion shows it at once); no new sound.
- **Names and code:** A1 becomes four corner files per bake (`OrnamentCornerTL` and so on) and `cornerBrackets` picks the corner and bake; A2 is `OrnamentRule`, one line in `headerRule` plus the lines' new anchors; A3 is `RoundRingOrnate`, picked in `roundTrim` (`Modules/Minimap.lua:416`). The ornament code lives in `Core/Theme.lua` because it uses that file's own helpers (`cornerPieces`, `solid`, `outward`); it adds no top-level local there (new values go on `T`). The ornament tint stays `accentDim` (§4.2, Q2).
- **Crisp placement:** A2 is sized with `T.PixelSize` (odd pixel height) and placed with `T.PixelRound` so it lands on whole pixels and centres on the one-pixel line; it stays in the `icon` snap class, like other art.
- **Colour:** every tint goes through `T.Tint` with a token, so `T.Refresh` re-colours it.
- **Performance:** new textures in normal play, by arithmetic (RGBA8; a third more if the client keeps mipmaps): A1 one bake of four corners, 4 to 16 KB; A2 1 to 4 KB; A3 256 KB; one surface 256 KB; 0.5 to 0.7 MB in all. B1 (2 MB) has its file set only in its window's first `OnShow`, as the AFK scene does (`AFK.PaintScene`, `Modules/AfkScreen.lua:122`). Nothing new is drawn on unit frames, bars, raid tiles or nameplates; the one HUD-adjacent change is the round minimap ring, and the surfaces reach the windows and tooltips that are open in a fight (§4.4).
- **Credits and disclosure:** a "Painted art (AI-assisted)" section in `art/CREDITS.md` and lines in `Media/Art/CREDITS.txt` and a new `Media/Textures/CREDITS.txt`, as for the AFK scenes, each saying "made with Leonardo.ai under a paid plan, private mode" once C2 confirms it for the scenes (if not, the scenes are remade privately before the next release and the wording in `Media/Art/CREDITS.txt` is corrected). Drawn shapes are Cliff's own work and need no credit line. Listing screenshots and the store descriptions say the AFK scenes and the banner are AI-assisted (Leonardo.ai), and Cliff re-reads both stores' current rules on AI and third-party content on the release day (C3).

---

## 8. QA checklist

Each row names the milestones it applies to; a PR ticks the rows for its milestone and writes N/A for the rest. Each row has a pass condition, because a session cannot look in the game and Cliff runs the in-game rows by eye.

**Harness:**
- [ ] (all) `node scripts/build-media.mjs --check`, `npm run quality`, `npm run coverage` pass.
- [ ] (M0, M1a, M1b) `scripts/media.test.mjs`: drawn art (the `toned` kind) has hard alpha, edge bleed to the outline colour and a clear border pixel; power of two.
- [ ] (M2) `scripts/media.test.mjs`: each painted file builds to the same bytes twice; surfaces use at least 8 alpha levels, keep local variance within 15 %, stay at or below `PAINTED_MAX_ALPHA` in the written bytes and wrap without a seam; the banding check (§4.4) passes.
- [ ] (M3) `scripts/media.test.mjs`: the banner's saturation passes §4.5; in the title band's area, the painting's 95th-percentile luminance under `shade` keeps `text` and `text2` at 4.5:1.
- [ ] (M1a, M1b) Ornament loudness (`scripts/tests/theme.test.mjs`): for every variant and accent preset, the brightest tinted texel of each drawn piece is at or below 4:1 against `panel` and darker than `muted`.
- [ ] (M2) Surface contrast, as a table test: for all eight variants, each surface at its written maximum alpha, over black and over white, `text`, `text2`, `muted` and `disabled` keep 4.5:1 on `panel`, `raised` and `inset` over black; over white the same for `text`, `text2` and `muted`, with `disabled` reported (it is a placeholder tier and cannot reach 4.5:1 over snow at any surface alpha). A superset of the bare-panel checks already in `theme.test.mjs`.
- [ ] (M1a) High contrast with Window ornaments on: zero ornament pieces shown (test under the contrast variant).
- [ ] (M1b) Toggling Window ornaments swaps the round ring's texture and tint without a reload (test reads the ring's path before and after).
- [ ] (M1a, M1b) The crispness strip (§6.5 step 2) at 0.9 x, 1 x, 1.4 x, 1.9 x and 2.8 x beside a one-pixel `divider` line, and the tint sheet with the new piece, attached in the thread and seen by Cliff.
- [ ] (M1a, M1b, M2, M3) Previews: `npm run preview` needs a global Playwright install (`scripts/preview-ui.mjs:9`); if it is missing, say so and skip this row, never silently. Add scenes to `scripts/lib/preview-scenes.mjs` with a `before:` that sets the variant and `ornaments = true` (as `vanguard-classic-look` does at line 255): the options window, setup and the quest log in the default and Classic variants with the brass accent (M1a, M1b), plus a tooltip with each new surface in the default, Classic and Ash and ember variants (M2), plus setup's first page with the banner (M3). Attached in the thread.

**In game (Cliff, after launch), added to `docs/SMOKE-TEST.md` by the milestone that ships the piece:**
- [ ] (M1a, M1b) UI scale 0.64, 0.71, 0.8 and 1.0 at 1920 x 1080; 1.0 at 2560 x 1440 and 3440 x 1440; 1.0 at 3840 x 2160 if available. Pass: no shimmer when a window is dragged, no blur, no dark fringe round a bracket's edge (the toned kind bleeds to its outline, so a halo here is a dark one).
- [ ] (M1b) Minimap size 120, 180 and 240 at scale 0.64 and 1.0: the ring stays a clean band, studs do not sparkle as the camera turns, and a party dot, a tracked node and a ping stay visible as they cross the rim.
- [ ] (M1a, M1b) Every accent preset and every variant: ornaments tint with the accent's dim shade and never match a selected row or a primary button beside them; High contrast shows none.
- [ ] (M1a, M1b) The game's three colour-blind filters on: an ornament next to a selected row and a focused control differs from them in brightness, not only hue.
- [ ] (M2) Windows open over a bright snowfield, over lava and in a crowded capital, with S1 and S2: text, including a disabled row, reads at a glance; the harness table (above) is the number behind it.
- [ ] (M2) In a fight: a tooltip over a mob, the bag and the quest log with S1 on read at a glance; nothing new appears on unit frames, bars, raid tiles or nameplates.
- [ ] (M1a, M1b) Text size 70 % and 130 %: labels clear the brackets and the rule motif.
- [ ] (M3) Reduce motion on: the first-run window shows its banner at once; Interface sounds: nothing new.
- [ ] (all) Load: a `/reload` with ornaments and a surface on is no slower than without (watch for a hitch); frame rate with four windows open is unchanged.

---

## 9. Risks and open questions

**Decisions for Cliff** (Q1 blocks every shipped painted file; Q2 to Q4 block M1a; Q5 and Q6 block M2). Q2 to Q6 were answered on 2026-11-02 with the recommended options; Q1 is open:
- Q1. Read Leonardo's Terms of Service on your plan's page and confirm commercial use and ownership for private generations before anything painted ships (C3), including the licence Leonardo takes on uploaded reference images, since the crops are the crest.
- Q2. Ornaments tinted by the accent's dim shade (`accentDim`, as today's ornaments are, with the loudness gate in §8; recommended), or always brass (a full-colour piece that ignores the accent)? The brighter `accent` tint is off the table: it is the selection and focus colour.
  **Answered 2026-11-02 (Cliff, "take all recommended decisions"):** `accentDim`.
- Q3. The plan draws the ornaments and the ring in code from Leonardo concept sheets, and uses Leonardo pixels for the surfaces and the banner (§4.1). Is that split what you want, or do you want painted pixels in the small ornaments even though they will be softer?
  **Answered 2026-11-02:** yes, the split in §4.1 stands: ornaments and the ring drawn in code from concept sheets.
- Q4. Should Window ornaments stay off by default, with the new art showing only for players who turn them on or pick the Classic look? (The Classic look forces ornaments on, including the minimap ring; a separate map switch is not planned, since nobody asked for one.)
  **Answered 2026-11-02:** Window ornaments stay off by default.
- Q5. The existing three surfaces are built to a 0.08 ceiling and miss the 4.5:1 that `docs/THEME.md` promises for `disabled` text in five variants (§4.4). Lower them to the new 0.05 ceiling in M2 (players see slightly fainter textures), or leave them and file it as an issue?
  **Answered 2026-11-02:** lower them; M2 moves the three existing surfaces to `PAINTED_MAX_ALPHA` (12/255) with the new ones, and its changelog line says panel textures are a little fainter.
- Q6. Should the panel surface skip tooltips in combat? Today every surface draws on tooltips and menus; the 12/255 ceiling keeps them readable, so the plan leaves it, but it is your call.
  **Answered 2026-11-02:** surfaces stay on tooltips in combat; the lower ceiling is what keeps them readable.

**Risks:**
- R1. How the Forever client loads, filters and keeps addon textures (mipmaps, non-power-of-two, memory) is undocumented, and code cannot see a failed load; only the in-game checks after M1 settle it, by eye.
- R2. Phoenix's controls are verified from its API page, not from the web app; what the app hides, and whether Style and Content references run together, C4 settles. The three shipped AFK scenes are private, so they were made on a paid plan (Cliff checked his Library, 2026-11-02, C2); the credits now say so.
- R3. AI output may not be protected by copyright; the code-drawn crest stays the mark.
- R4. Brass tones tinted jade or orchid may read as coloured plastic (Q2); the M0.2 tint sheet shows it before any art is made.
- R5. Consistency across many sessions depends on the reference board and the manifest; drift shows up as one asset that looks newer than the rest.
- R6. Most of the art lives in opt-in modes; players on the default look see only the surfaces they choose.
- R11. The naming rule (header) is read as "no other addon, library or competing product"; the stores and the cited sources are named where a rule or fact is quoted from them. If Cliff wants those struck too, the citations become "the store's moderation policy" and "a news report of <date>" and Appendix B keeps the links.
- R10. The round ring is the one piece in peripheral vision during a fight; its band is kept at 4 texels and `accentDim`, and the in-game rim-blip row (§8) is the check. If it still distracts, it drops back to `RoundRing` and the plan loses A3.
- R7. Leonardo's download format (earlier ones were JPEG) and colour profile are unconfirmed; the conversion step (§3.7 step 1) is by hand and must be written down each time or the source cannot be remade.
- R8. Store rules: CurseForge asks for a disclaimer on AI-modified showcase images (policy modified 2026-10-22); no Wago AI policy was found on 2026-11-02; both can change before release day, so the listing text and screenshots carry the "AI-assisted" line regardless (§7).
- R9. Byte-reproducible builds with image maths depend on integer arithmetic; a float shortcut in `media-painted.mjs` would make `--check` fail on another Node version.

---

## 10. Execution prompt

Paste the block below as the brief for a thread that runs one milestone. It is written for a cheaper model at medium effort (Sonnet per `CLAUDE.md`, Usage and cost): every rule it needs is in the repo, and every judgement call is already made in this plan or goes to Cliff. The human fills the one placeholder, `<MILESTONE>`, with `M0-code`, `M1a`, `M1b`, `M2` or `M3`; the other angle brackets in the block are patterns the thread fills itself. M0-Cliff is a checklist for Cliff (§5), not a thread. Order: M0-code, then M1a (after M0-Cliff), M1b, M2, M3, one thread and one draft PR each. Do not start before launch (2026-11-04) and the code freeze lift.

```
Run milestone <MILESTONE> of docs/handoff/leonardo-art-plan.md in clifftaylor2325/wow-vanguard-ui.

Setup: `npm install` first (the scanner and the hooks need it). Read, in full: CLAUDE.md, docs/handoff/leonardo-art-plan.md (its §5 Progress list and your milestone's table are your task list; §4 and §6 your rules; §8 your gate; §9 the open calls). Read these parts: docs/PATTERNS.md (module shape, frame state, scenario); docs/THEME.md (the Icons section and the fade and sound tables); scripts/tests/README.md (writing a scenario); the skill files .claude/skills/add-media, add-harness-scenario and ready-pr, plus fix-bug for H1. Then the code your milestone names: M0-code: Modules/Probe.lua (P.METHODS, widgetOf, methodLine), scripts/media.test.mjs, scripts/lib/media-art.mjs. M1a and M1b: Core/Theme.lua around cornerBrackets, cornerPieces, headerRule, PaintOrnament, T.Pixel, T.PixelsPerUnit and T.OnChanged; Modules/Minimap.lua around roundTrim; scripts/lib/media-sources.mjs; scripts/tests/theme.test.mjs ornament tests. M2: Core/PanelTexture.lua, scripts/lib/media-surfaces.mjs, scripts/lib/media-scenes.mjs (readPng). M3: Core/Setup.lua, Core/WhatsNew.lua, Modules/AfkScreen.lua (AFK.PaintScene). Grep for the identifiers the plan quotes; its line numbers may have drifted.

State: before anything else, read the §5 Progress list and, if a PR for this milestone exists, its body's Tasks section; continue from the first unticked task. Tick a task's box in §5 in the commit that finishes it.

Branch: work/leonardo-<milestone in lower case>, from origin/main. One task of §5 is one commit, subject "<task id> <area>: <change>", body saying what changed and what was verified. Commits are authored by Cliff only (user.name clifftaylor2325, user.email as on origin/main's commits); no Co-Authored-By, Claude-Session or generated-with lines anywhere, and check `git log --format='%h %an <%ae> | %cn <%ce>' origin/main..HEAD` before the first push. Open one draft PR for the milestone with the sections: Tasks, Tests added, Skipped, Where the control is (or "no new control: the art follows existing switches"), Changelog line, Needs in-game check. Mark it ready only after the local gate and one run of the code-review skill on the diff. Add the full-tests label only if you added a method to scripts/lib/wow-widget-api.lua (this plan adds none).

What you do and do not do:
- You never generate art, log in to Leonardo, or hold a key. Cliff generates from the §6.3 templates with the §6.1 settings and sends the file in the thread; save it under /mnt/project-files/leonardo-art/<task id>/ (mkdir -p) and record every §6.1 manifest field he reports in art/painted/manifest.json, with the plan tier and generation link in record.json beside the file, not in the repo. If he has not sent a file your task needs, do the code and test work that does not depend on it, then post the asks of your milestone (M1a posts the M0-Cliff checklist as one message) once and stop; his answer wakes you.
- Small ornaments (A1, A2, A3) are drawn in code from the shape Cliff picked, with the primitives in scripts/lib/media-art.mjs, at every bake size in §5, in the §4.2 tones, tinted accentDim; surfaces and the banner go through scripts/lib/media-painted.mjs (§3.7) from a committed art/painted/<class>/<id>.png. Never hand-edit Media/. Keep test fixtures out of MEDIA and out of Media/.
- No new setting, no new top-level local in Core/Theme.lua (run `node scripts/agent-check.mjs <file>` after each edit; it also enforces the 10-line function limit, so split headerRule and roundTrim as §5 says), nothing drawn on the HUD beyond A3, nothing that names another addon or product, no wording copied from files that name one. Every player string goes through L[]. Every new line of Lua has a test that runs it.
- Show Cliff, before any commit that changes Media/: the crispness strip at 0.9 x, 1 x, 1.4 x, 1.9 x and 2.8 x beside a one-pixel divider, the tint sheet with the new piece, and the §8 previews, written to /mnt/project-files/leonardo-art/<milestone>/ and attached in the thread. His yes is a message in the thread; wait for it.
- Decisions: anything in §9 Cliff has not answered that blocks your milestone, any [DECIDE] you would add, and any case where a §8 gate fails and the fix is a plan change go to Cliff with your recommendation; do not pick. Where this plan and the code disagree about a name or a line, follow the code and say so in the commit body and in the PR's "plan corrections" line.

Gate before the PR is marked ready: `node scripts/build-media.mjs --check`, `npm run quality`, `npm run coverage` (100 %, run alone), luacheck if installed, and every §8 row tagged with your milestone ticked in the PR body with the output that shows it, the rest marked N/A. Add the in-game rows tagged for your milestone to docs/SMOKE-TEST.md as a new step and list them under "Needs in-game check" (M0-code: "none, harness only"). Update the matching sentence in docs/features/look-and-layout.md if behaviour changes; list any new fade in docs/THEME.md. Changelog: do not add a version heading (scripts/release-local.test.mjs requires the newest heading to equal the TOC version, which only a release bumps). If the newest docs/CHANGELOG.md section equals the TOC version and that version has no git tag yet, add your player-facing line there and the matching entry in Core/WhatsNewNotes.lua; otherwise write the proposed line under "Changelog line" in the PR body and the release adds both.

When done, reply with: the PR link, the §5 rows ticked, the §8 rows ticked, what waits on Cliff, and anything in this plan that turned out wrong (corrected in the same PR under a "plan corrections" commit).
```

---

## Appendix A: Review log

Five sequential adversarial reviews, each a fresh reviewer that saw only the plan as it then stood, the repo and its own lens. Every finding was adjudicated; the tables say what changed. No wave was skipped for usage, and no P1 remains open: the two wave-4 P1s that could not be closed by the plan alone (the existing surfaces' contrast miss, tooltips in combat) are Q5 and Q6 for Cliff.

### Wave 1: brand authenticity and visual coherence

14 findings (4 P1, 8 P2, 2 P3). Accepted 12, accepted in part 2, rejected 0.

| Id | Sev | Finding | Verdict | What changed |
|---|---|---|---|---|
| W1-1 | P1 | The brief asked for satin, worn, softly lit metal, but the crest is flat: dark outlines, three tone planes, hard edges | Accepted in part | §4 rewritten from the crest's drawing style. Small ornaments are now drawn in code from Leonardo concept sheets (§4.1). Rejected the narrower "Leonardo for surfaces and one colour piece only": Leonardo also makes the concept sheets and the ring's material tile. |
| W1-2 | P1 | Multiplying grey by `accentDim` cannot reach brass; A3 tinted `edge` would be black outside Classic; grey art cannot show steel against brass | Accepted | Ornaments tint `accent` with set tone values (§4.2); A3 tints `accent`; steel studs removed; a tint sheet across accents and variants comes before any art (M0.2). |
| W1-3 | P1 | Engraved lines and studs do not survive 32 texels | Accepted | Detail budget by texture size (§4.2); the bracket stays 14 units with no studs; the old "raise to 20 units" question was removed. |
| W1-4 | P1 | Surfaces are white at ≤ 8 % alpha and carry no hue; three new tiles would differ only by pattern | Accepted in part | Surfaces defined as patterns that must differ from the existing three (§4.4); hue words removed; hammered iron dropped; a side-by-side gate. Kept two surfaces, not one, because bedding lines and fibres are patterns the code noise cannot make. |
| W1-5 | P2 | No rule for painted pieces beside snapped one-pixel lines | Accepted | Crispness strip at four scales beside a `divider` line (§6.5, §8); A2 drawn in code and placed on whole pixels with `T.Snap` (§7). |
| W1-6 | P2 | Prompts contained "game UI asset", contradictory light, 3D relief words, counts and a clichéd "heraldic crest" | Accepted | Templates rewritten around the crest's style phrase; counts and symmetry moved to code; the crest prompt removed (§6.3). |
| W1-7 | P2 | A whole-crest reference leaks swords, shield and letters into ornaments | Accepted | References are material crops (§6.2); sword, blade, shield and letter added to the negatives. |
| W1-8 | P2 | A model cannot hold the ring's radius, roundness or stud count | Accepted | Ring geometry drawn in code at `RoundDisc`'s radius with 16 studs (§4.3, §3.7 step 8). |
| W1-9 | P2 | "All from the crest" was partly false (chamfer, studs, engraved line) | Accepted | §4.3 is now an audit table naming where each motif comes from; the chamfer is credited to the shield corners; studs are flat dark dots. |
| W1-10 | P2 | "This, not that" was adjectives with a soft pass test | Accepted | Numbers for tones, outline, edges, detail and loudness (§4.2); exemplars defined (§4.6). |
| W1-11 | P2 | Colour art broke its own saturation rule, used a foggy reference and faction-coded banners, and had no title-contrast rule | Accepted | §4.5: measured saturation limits, undyed cloth, a `shade` band under titles, 2:1 with no crop, no scene reference for B1. |
| W1-12 | P2 | A painted crest twins the faction crest and drifts from the mark | Accepted | C1 moved out of the addon (§5, Not in this plan). |
| W1-13 | P3 | The painted bar, frame and emblems contradict the plan's own thesis | Accepted | Moved to "Not in this plan, and why". |
| W1-14 | P3 | Small inconsistencies (size rule examples, leather and vellum rows, dark brass vs `accentDim`) | Accepted | Size rule restated as "within about 2.3 x"; material rows replaced by the pattern table; tint values tied to `accent`. |

### Wave 2: technical feasibility on the Forever client

14 findings (3 P1, 8 P2, 3 P3). Accepted 14, rejected 0. The reviewer read the `forever` branch's API documentation, `NineSlice.lua` and `PixelUtil.lua`, and confirmed as sound: the tint arithmetic, the units-per-pixel table, the memory arithmetic and the TGA writer.

| Id | Sev | Finding | Verdict | What changed |
|---|---|---|---|---|
| W2-1 | P1 | `RoundDisc`'s radius is the canvas edge, so a ring "with its inner edge on that radius" cannot exist; a wide band would cover the map | Accepted | A3's band sits inside the disc, 8 texels (6 % of the diameter); the mask is unchanged; behaviour at other Minimap sizes stated (§5, M1). |
| W2-2 | P1 | 32 texels for 14 units is 2.3 x minified at 1 px per unit, so a 1-texel outline is under half a pixel | Accepted | Small pieces are baked at 1 x and 2 x and picked by pixels per unit (§5.0), like the sized menu icons; the detail budget is now in screen pixels at 1.0 px per unit (§4.2). |
| W2-3 | P1 | The probe cannot see a failed load (`SetTexture` returns true; loading is asynchronous; a hidden texture may never load) | Accepted | M0.1 now checks only that methods exist and asks Cliff what already draws; whether a new file draws is settled by eye in game (§3.2 item 3, R1). The PNG test was dropped, since the plan stays on TGA. |
| W2-4 | P2 | `cornerPieces` mirrors the bracket with `SetTexCoord`, which flips top-left light at three corners | Accepted | A1 ships four corner files per bake, like the corner masks. |
| W2-5 | P2 | Toned art fails the existing white-pixel test (`clearPixelsWhite`) | Accepted | A new `toned` kind with its own edge-bleed check (M0.2, §3.7 step 8); the reason for the old rule is recorded. |
| W2-6 | P2 | A2: the rule's lines would overlap the motif; the `divider` snap class does nothing by default and is wrong for art; an even height cannot centre on a one-pixel line; a new Core file cannot reach Theme.lua's locals; the local-count figure was unreliable | Accepted | Lines re-anchored, odd pixel height, `icon` class, no new Core file, and the scanner is run on `Core/Theme.lua` before M1 (§5, §7). |
| W2-7 | P2 | Tiled surfaces draw one texel per unit, so texel feature sizes do not describe what the player sees; 0.08 alpha is only 21 byte levels | Accepted | Feature sizes in units (§4.4); at least 8 alpha levels required (§3.7 step 6, §8). |
| W2-8 | P2 | A half-shift cross-fade halves variance and leaves a faint repeating cross; blur, alpha mapping and luma space were unspecified; makers re-run per test | Accepted | Variance-preserving blend and a local-variance test; toroidal box blur; the alpha formula; gamma-space luma written down; makers memoised (§3.7, M0.2). |
| W2-9 | P2 | `readPng` rejects greyscale, palette and 16-bit files, and Leonardo's download may be JPEG | Accepted | A written conversion to 8-bit RGB with no profile before commit; the download format is checked in M0.3; `readPng` stays where it is (§3.3, §3.7 step 1, R7). |
| W2-10 | P2 | 1536 to 1024 is a fractional downscale | Accepted | Banner upscaled 2 x to 3072 x 1536 and boxed 3 x, as the AFK scenes were; surfaces upscaled to 2048 and boxed 8 x (§6.1). |
| W2-11 | P2 | Memory claims were asserted; "loads only when its window opens" needs the file set on show | Accepted | §3.1 reworded as an assumption; 0.5 to 0.7 MB with mipmaps allowed for; B1's file is set in its window's first `OnShow` (§7). |
| W2-12 | P3 | The brass material tile needs a polar mapping and shows as ±11 byte levels | Accepted | MT1 and the `material` class removed. |
| W2-13 | P3 | Float maths over a million pixels can flip a byte between Node versions | Accepted | Integer or fixed-point maths and a build-twice test (§3.3, M0.2, R8). |
| W2-14 | P3 | Small points: non-power-of-two files already ship; non-square powers of two are legal; the mask rule is untouched; `RoundRing` must stay; slice margins are own-frames only | Accepted | All folded into §3.2, §4.2 and §5. |

### Wave 3: Leonardo.ai reality

14 findings (2 P1, 7 P2, 5 P3). Accepted 14, rejected 0. The reviewer read Leonardo's Phoenix 1.0 and Lucid Origin API pages, the help centre's commercial-use, private-image, token and FAQ articles, and the shipped AFK scenes; it confirmed the no-negation-in-the-prompt rule as sound and found no verified per-image token price for these models.

| Id | Sev | Finding | Verdict | What changed |
|---|---|---|---|---|
| W3-1 | P1 | Style references cannot do a Content reference's job (three references only fit the Style kind); the R-blade crop fights the "blade" negative; "if no strength control" would never trigger | Accepted | §6.2 names the kind per crop (Style for look, one Content reference for a sibling's shape); R-blade dropped; strength is a named step calibrated in M0.3 (e) (§6.1). |
| W3-2 | P1 | Surfaces and the banner were assigned to Lucid Origin, which documents no negative prompt, tiling or contrast; the shipped scenes show unprompted blue and red cloth | Accepted | Phoenix 1.0 for everything, tiling on and contrast LOW for surfaces and the banner (§6.1, §6.3, §3.5). |
| W3-3 | P2 | "no gradients" in the style phrase breaks the plan's own rule; a dark outline on a black ground cannot be judged | Accepted | Style phrase ends "plain mid-grey background"; `gradients, shading, bevel, gloss` moved to the negatives (§6.3). |
| W3-4 | P2 | A six-up grid at 1024 will not give six equal usable cells; K2 and K3 may not earn their cost | Accepted | Grid versus four singles is a calibration run in M0.3 (e); runs count by usable options; K2 optional (§5 M1, §6.4). |
| W3-5 | P2 | The upscale step is wasted (detail the box filter averages away), may invent detail, and records no settings | Accepted | No upscaling; surfaces at 1024 box 4 x, banner at 2048 x 1024 box 2 x; a fallback upscale must record its five settings (§6.1, §5 effort columns, §3.5). |
| W3-6 | P2 | Feature scale is not controllable by prompt wording; the pipeline blurred before it wrapped; nothing checks alpha levels before the wrap | Accepted | §3.7 reordered (wrap, then drift removal); scale probe with "fine", "medium", "coarse" in M0.3 (e); raw-download check of alpha levels and feature width (§6.3, §6.4). |
| W3-7 | P2 | Ownership vests by the plan at the moment of creation; the shipped scenes carry no record of plan or privacy; the Terms were not read; the reference crops are the crest under the upload licence | Accepted | §3.6 rewritten; M0.3 (a) to (c) collect the plan screenshot, the Library's privacy state for each scene and the Terms section numbers; manifest records plan, private flag and date; credits wording conditional on (b); Q1 and R2 extended. |
| W3-8 | P2 | No check of the stores' rules on AI art | Accepted | §3.6 cites CurseForge's disclaimer rule (modified 2026-10-22) and notes no Wago policy was found; §7 adds the "AI-assisted" listing line; M0.4 re-reads both stores' rules on release day; R8 added. |
| W3-9 | P2 | No cost estimate; the cited token page does not price these models | Accepted | §3.4's token row corrected; §6.4 adds a token budget gate (about 500 to 720 tokens nominal, about 1,600 worst case, from a weak third-party figure; the app's readout is the real number); §6.1 records tokens per run. |
| W3-10 | P3 | Plan names were stale and the private-generation cap conflicted with Leonardo's own help | Accepted | §3.4 uses Essential, Premium, Ultimate, marked unverified; private mode has no cap per Leonardo's help; M0.3 (a) asks Cliff for his plan page's lines. |
| W3-11 | P3 | §6.1 omitted mode, contrast and the matching style preset | Accepted | §6.1 sets mode and contrast per class and records them; preset comparison in M0.3 (e). |
| W3-12 | P3 | "Keep its seed and change one phrase" is not a controlled edit | Accepted | §3.5: a seed only repeats a result when nothing else changes; edits guide from the candidate with a Content or image-to-image reference. |
| W3-13 | P3 | Privacy and reference-image coverage of follow-on steps unverified | Accepted | Folded into M0.3 (a) and (d); §3.4's private-mode row cites Leonardo's help. |
| W3-14 | P3 | The "not verified" row could be filled from the API pages; two entries were wrong in kind | Accepted | §3.4 rewritten as a per-model table of verified controls with sources, read 2026-11-02. |

### Wave 4: player experience and accessibility under combat

12 findings (3 P1, 7 P2, 2 P3). Accepted 9, accepted in part 3, rejected 0. The reviewer computed WCAG contrast from the theme tokens and read `T.PaintOrnament`, `Core/PanelTexture.lua`, `roundTrim` and the smoke test.

| Id | Sev | Finding | Verdict | What changed |
|---|---|---|---|---|
| W4-1 | P1 | The round ring is a HUD change: accent-bright and hiding 12 % of the map disc against 4.7 % today | Accepted in part | Band cut to 4 texels (6 % of the disc), tint `accentDim`, studs with a floor, bakes at 256 and 128, a rim-blip row in §8, §7 reworded, R10 added. The separate map switch is not added (no setting nobody asked for); noted under Q4. |
| W4-2 | P1 | Surfaces reach tooltips, menus, bags and the quest log in combat; the plan said nothing new is drawn in combat | Accepted in part | §3.1, §4.4 and §7 state it; §8 adds tooltip, bag and quest-log rows in a fight. Skipping tooltips in combat changes what the existing surfaces do, so it is Q6 for Cliff rather than a task. |
| W4-3 | P1 | The 4.5:1 gate cannot pass at the 0.08 ceiling (`disabled` 4.40 to 4.49:1 in five variants; Classic `muted` 4.33) | Accepted | New surfaces use a 0.05 ceiling; the gate is a table test over eight variants, four tiers, two worlds, with `disabled` over white reported, not required; the existing surfaces' miss is Q5. |
| W4-4 | P2 | `T.PaintOrnament` never checks `flat`, so High contrast shows ornaments | Accepted (verified at `Core/Theme.lua:3021`) | A1 adds the `flat` check with a test; §7 and §8 corrected. |
| W4-5 | P2 | Tinting with `accent` makes ornament as loud as selection and focus; the "below `text2`" loudness test is vacuous | Accepted | Tint stays `accentDim` (wave 1's `accent` choice reversed); the loudness gate is now the brightest texel at or below 4:1 and below `muted` (§4.2, §8); Q2 reframed. |
| W4-6 | P2 | A `shade` band at 0.5 gives 3.3:1 over a white sky; no gate | Accepted | §4.5 and §8 measure the 95th-percentile luminance under the band; fallbacks are a 0.65 band or the title below the banner. |
| W4-7 | P2 | The detail budget stops at 1.0 px per unit; the slider goes to 0.64 (0.9 px per unit); "1.3 x" was wrong | Accepted | §4.2 budget at 0.9 px per unit; bake threshold 1.6 px per unit and the ratio stated as 1.4 x (§5.0); 0.64 in §8. |
| W4-8 | P2 | The ring's 1-px lines break the 2-texel rule and the Minimap size slider stretches it | Accepted | Bead line dropped, studs at least 4 texels with a floor, two bakes picked by drawn size, a Minimap size row in §8 (§4.2, §4.6, A3). |
| W4-9 | P2 | Parallel bedding lines at one texel per unit beat against the pixel grid and crawl during the rise | Accepted in part | S1 becomes broken, jittered lines with a 4-unit floor (anisotropy kept); a banding test joins `media.test.mjs`; the in-game row covers the window opening. |
| W4-10 | P2 | §8 was "look at it" with no pass conditions, no combat, text-size, motion or colour-blind steps, and previews for four of eight variants | Accepted | §8 rewritten with a pass condition per row and the missing rows. |
| W4-11 | P3 | The ring is built once, so the Window ornaments switch would need a reload | Accepted (verified at `Modules/Minimap.lua:416-424`) | A3 registers with `T.OnChanged`; §8 tests the swap. |
| W4-12 | P3 | The quest log is a combat-open window with brackets | Accepted in part | §3.1 says so; with `accentDim` the brackets are as loud as today's, so no combat fade is added. |

### Wave 5: execution and handoff

15 findings (1 P1, 12 P2, 2 P3; the reviewer numbered a fifteenth under P3). Accepted 13, accepted in part 2, rejected 0. The reviewer checked every quoted path and identifier against the repo (all correct except the three noted below), grepped the plan and the repo for names, and judged the milestone split.

| Id | Sev | Finding | Verdict | What changed |
|---|---|---|---|---|
| W5-1 | P1 | "Create the next version's changelog heading" fails `scripts/release-local.test.mjs` (the newest heading must equal the TOC version) and `Core/WhatsNewNotes.lua` was never mentioned | Accepted | §10: no heading is ever added; a line goes into the current section only if that version is untagged, with the What's new entry, else into the PR body under "Changelog line". |
| W5-2 | P2 | The §8 gate was not scoped per milestone, so M0 could not pass it | Accepted | Every §8 row is tagged with its milestones; §10 says tick yours, N/A the rest. |
| W5-3 | P2 | M0 was half Cliff's work, so no thread could finish it; no resume rule or checkboxes | Accepted | M0 split into M0-code (one thread) and M0-Cliff (a checklist C1 to C4 plus Q2 to Q4, no thread); a Progress list with one box per task heads §5; §10 has a state rule. |
| W5-4 | P2 | The alpha recipe contradicted itself and 0.05 rounds to 13/255 | Accepted | `alpha = 0.03 + gain x pattern`, 99th percentile at `PAINTED_MAX_ALPHA` = 12/255; tests read written bytes (§3.7, §4.4, §5.0, §8). |
| W5-5 | P2 | `headerRule` is already 10 lines; `roundTrim` would pass 10; the scanner needs `npm install` | Accepted (verified) | A2 and A3 say which function is split; §10 starts with `npm install`. |
| W5-6 | P2 | "pixels per unit (`T.Pixel`)" names the inverse function | Accepted (verified at `Core/Theme.lua:593` and `:603`) | `T.PixelsPerUnit() <= 1.6` picks the 1 x bake; its UIParent-scale basis stated (§5.0, A1). |
| W5-7 | P2 | `BUILT_NAMES`, `noUnusedMedia` and the ornament tests in `theme.test.mjs` are affected and were not listed; a fixture in `MEDIA` would write into `Media/` | Accepted | A1, A2 and A3 list them; M0.2's fixture is test-only under `scripts/fixtures/`. |
| W5-8 | P2 | The §8 preview matrix cannot come out of `npm run preview`, and Playwright may be missing | Accepted | The previews row names the scenes to add with `before:` settings, a smaller matrix, and "say so and skip" if Playwright is missing. |
| W5-9 | P2 | No SVG renderer, JPEG conversion or manifest shape named | Accepted | §6.5 names `@resvg/resvg-js` and an example convert command with a stop rule; §6.1 shows a manifest entry; S0 adds a completeness test. |
| W5-10 | P2 | A Windows username in a public repo; a Linux session cannot read that path; the project folder did not exist; account details in the committed manifest | Accepted | Path removed; files arrive in the thread and are saved under `/mnt/project-files/leonardo-art/<id>/` with `mkdir -p`; plan tier and links go in `record.json` there, not the repo; a yes is a thread message. |
| W5-11 | P2 | M1 was oversized (six Cliff gates, a bug fix bundled into A1, K3's dependence on A1 unstated, Q5 and Q6 wrongly blocking M1) | Accepted | M1a (H1, K1, A1) and M1b (K2, A2, K3, A3 with its own go/no-go); order stated; each Q tagged with the milestone it blocks; C4's K1 runs count as K1's. |
| W5-12 | P2 | M0.2 built the surface and colour pipelines with no consumer and no real download to tune on | Accepted | S0 (M2) and B0 (M3) carry them; M0.2 keeps the toned kind, memoisation and the tint sheet; the `readPng` import is named. |
| W5-13 | P2 | M0.1 cannot settle the §3.2 facts (the probe reports presence only), and listing uncalled methods in the harness was needless | Accepted in part | M0.1 reduced to a `Texture` kind in `widgetOf` and presence rows, no harness listing, no `full-tests` label; §3.2's row says the facts are settled by eye in M1a. The rows stay because the presence answer is cheap and feeds the frame decision. |
| W5-14 | P2 | The plan's own naming rule was stricter than the plan (stores, a mirror account, a wiki, blogs, fonts and a linter are named); the repo names other addons in 13 files | Accepted in part | The header rule now says what is named and why (sources of a quoted rule or fact); R11 offers to strike them; §10 forbids copying wording from files that name other addons. Cliff's rule was about other addons and products, which the plan does not name. |
| W5-15 | P3 | Placeholders, two branch-name styles, an 80 KB reading list, stale Q and R counts in the handoff note, `T.STATE_GLYPHS` cited in the wrong file, the banding check under-defined | Accepted | One placeholder; `work/leonardo-<milestone>` everywhere; section-scoped reading list; counts fixed; `Core/Theme.lua:145`; the banding check defined by axis, lag range and threshold. |

No P1 finding remains open after wave 5. No wave was skipped for usage.

---

## Appendix B: Sources

- WCAG 2.2 Understanding SC 1.4.3: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- WCAG 2.2 Understanding SC 1.4.11: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- Blizzard UI source, `forever` branch (mirror): https://raw.githubusercontent.com/Gethe/wow-ui-source/forever/version.txt, `.../Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleTextureBaseAPIDocumentation.lua`, `.../Interface/AddOns/Blizzard_SharedXML/NineSlice.lua`, `.../Interface/AddOns/Blizzard_SharedXML/Backdrop.lua`
- warcraft.wiki.gg: https://warcraft.wiki.gg/wiki/API_TextureBase_SetTexture, https://warcraft.wiki.gg/wiki/API_TextureBase_SetTextureSliceMargins, https://warcraft.wiki.gg/wiki/EdgeFiles, https://warcraft.wiki.gg/wiki/BLP_files, https://warcraft.wiki.gg/wiki/API_Frame_CreateMaskTexture, https://warcraft.wiki.gg/wiki/API_C_Texture.GetAtlasInfo, https://warcraft.wiki.gg/wiki/BackdropTemplate
- Warcraft Tavern on Forever: https://www.warcrafttavern.com/forever/news/wow-forever-loads-your-retail-addons-keybinds/
- Leonardo docs and help: https://docs.leonardo.ai/docs/list-of-models, https://docs.leonardo.ai/docs/commonly-used-api-values, https://docs.leonardo.ai/docs/generate-images-using-transparency, https://docs.leonardo.ai/docs/image-variations-with-universal-upscaler, https://intercom.help/leonardo-ai/en/articles/11890238-lucid-origin, https://intercom.help/leonardo-ai/en/articles/8044033-token-usage, https://intercom.help/leonardo-ai/en/articles/10501488-how-to-train-and-use-elements-loras-and-datasets-on-leonardo-ai, https://intercom.help/leonardo-ai/en/articles/7051613-frequently-asked-questions, https://intercom.help/leonardo-ai/en/articles/8044018-commercial-usage
- Pricing (third party, weak): https://dev.to/techsifted/leonardo-ai-pricing-2026-free-credits-paid-plans-and-api-costs-16a2
- US Copyright Office Part 2 summary: https://copyrightalliance.org/ai-report-part-2-copyrightability/
