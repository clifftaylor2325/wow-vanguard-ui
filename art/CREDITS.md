# Art sources and credits

Open-licensed art that Vanguard may build from. Nothing here ships to players
as-is: `scripts/build-media.mjs` rasterizes the crests the faction look uses
into `Media/Art/` (which then ships, with `Media/Art/CREDITS.txt`) and the
options nav's and minimap's filled icons into `Media/Icons/` (with
`Media/Icons/CREDITS.txt`), and the heading fonts are only bundled once one is
picked.

## game-icons.net (CC BY 3.0)

From https://github.com/game-icons/icons, licensed under the Creative Commons
Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/);
`game-icons/license.txt` is the project's own license file. Each SVG is a
white glyph on a black square; the build drops the square and keeps the glyph
as alpha, so the crest or icon can be tinted with the theme's colors (a change
to the original, which the license allows with credit). The icons the build
uses are named in `SILHOUETTES` in `scripts/lib/media-sources.mjs`.

| File | Author | Source |
|---|---|---|
| `delapouite-binoculars.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/binoculars.html |
| `delapouite-castle.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/castle.html |
| `delapouite-chat-bubble.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/chat-bubble.html |
| `delapouite-crossroad.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/crossroad.html |
| `delapouite-griffin-symbol.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/griffin-symbol.html |
| `delapouite-id-card.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/id-card.html |
| `delapouite-mouse.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/mouse.html |
| `delapouite-orc-head.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/orc-head.html |
| `delapouite-portrait.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/portrait.html |
| `delapouite-price-tag.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/price-tag.html |
| `delapouite-three-friends.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/three-friends.html |
| `delapouite-tusks-flag.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/tusks-flag.html |
| `delapouite-upgrade.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/upgrade.html |
| `lorc-battle-axe.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/battle-axe.html |
| `lorc-boar-tusks.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/boar-tusks.html |
| `lorc-broadsword.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/broadsword.html |
| `lorc-checked-shield.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/checked-shield.html |
| `lorc-cog.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/cog.html |
| `lorc-compass.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/compass.html |
| `lorc-crossed-axes.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/crossed-axes.html |
| `lorc-crossed-swords.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/crossed-swords.html |
| `lorc-crown.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/crown.html |
| `lorc-cubes.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/cubes.html |
| `lorc-eagle-emblem.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/eagle-emblem.html |
| `lorc-fist.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/fist.html |
| `lorc-horned-skull.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/horned-skull.html |
| `lorc-jigsaw-piece.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/jigsaw-piece.html |
| `lorc-laurel-crown.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/laurel-crown.html |
| `lorc-lion.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/lion.html |
| `lorc-raven.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/raven.html |
| `lorc-scroll-unfurled.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/scroll-unfurled.html |
| `lorc-sun.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/sun.html |
| `lorc-tribal-mask.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/tribal-mask.html |
| `lorc-wolf-head.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/wolf-head.html |
| `lorc-wolf-howl.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/wolf-howl.html |
| `sbed-health-increase.svg` | Sbed (http://opengameart.org/content/95-game-icons) | https://game-icons.net/1x1/sbed/health-increase.html |
| `sbed-shield.svg` | Sbed (http://opengameart.org/content/95-game-icons) | https://game-icons.net/1x1/sbed/shield.html |

## Vanguard's own crest

`brand/vanguard-crest.svg` is Vanguard's crest (two swords crossed behind a rimmed brass
shield that bears a V), drawn for Vanguard; copyright Cliff Hearthvale, all rights reserved,
like the rest of the addon. The V is Cinzel's capital at weight 900 (the font below, SIL
OFL; the licence allows its glyphs in a logo), converted to an outline. The build does not
read the SVG: `scripts/lib/media-brand.mjs` draws the same shapes with `media-art.mjs` for
`Media/Textures/Icon.tga`, the addons list's icon, and the website keeps the SVG for its
favicon and logo.

## Heading fonts: SIL Open Font License 1.1

From https://github.com/google/fonts (ofl/).

| File | Copyright | Notes |
|---|---|---|
| `fonts/Cinzel[wght].ttf` | The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) | No Reserved Font Name; license in `fonts/OFL-Cinzel.txt` |
| `fonts/Metamorphous-Regular.ttf` | Sorkin Type Co (www.sorkintype.com) | Reserved Font Name "Metamorphous": a subset or changed copy must ship under another name; license in `fonts/OFL-Metamorphous.txt` |

## AFK scenes (AI-generated)

`scenes/afk-camp.png`, `scenes/afk-keep.png` and `scenes/afk-canyon.png` were made by Cliff
Hearthvale with Leonardo.ai (https://leonardo.ai) from his own prompts, in October 2026, then
cropped and sized to 1024 x 512. No other art or reference picture went in.
`scripts/lib/media-scenes.mjs` writes them to `Media/Art/` as TGA for the AFK screen.

## Not used

Blizzard's own faction emblems are the game's trademarked art, so Vanguard
never copies them. `/vg factionart` only checks which of the client's own
faction pictures exist, so a later build can point at them where the game
already has them.
