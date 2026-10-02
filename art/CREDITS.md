# Art sources and credits

Open-licensed art that ForeverUI may build from. Nothing here ships to players
as-is: `scripts/build-media.mjs` rasterizes the crests the faction look uses
into `Media/Art/` (which then ships, with `Media/Art/CREDITS.txt`), and the
heading fonts are only bundled once one is picked.

## Crests: game-icons.net (CC BY 3.0)

From https://github.com/game-icons/icons, licensed under the Creative Commons
Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/);
`game-icons/license.txt` is the project's own license file. Each SVG is a
white glyph on a black square; the build drops the square and keeps the glyph
as alpha, so the crest can be tinted with the theme's colors (a change to the
original, which the license allows with credit).

| File | Author | Source |
|---|---|---|
| `delapouite-castle.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/castle.html |
| `delapouite-griffin-symbol.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/griffin-symbol.html |
| `delapouite-orc-head.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/orc-head.html |
| `delapouite-tusks-flag.svg` | Delapouite (https://delapouite.com) | https://game-icons.net/1x1/delapouite/tusks-flag.html |
| `lorc-battle-axe.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/battle-axe.html |
| `lorc-boar-tusks.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/boar-tusks.html |
| `lorc-checked-shield.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/checked-shield.html |
| `lorc-crossed-axes.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/crossed-axes.html |
| `lorc-crossed-swords.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/crossed-swords.html |
| `lorc-crown.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/crown.html |
| `lorc-eagle-emblem.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/eagle-emblem.html |
| `lorc-fist.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/fist.html |
| `lorc-horned-skull.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/horned-skull.html |
| `lorc-laurel-crown.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/laurel-crown.html |
| `lorc-lion.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/lion.html |
| `lorc-raven.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/raven.html |
| `lorc-scroll-unfurled.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/scroll-unfurled.html |
| `lorc-sun.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/sun.html |
| `lorc-tribal-mask.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/tribal-mask.html |
| `lorc-wolf-head.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/wolf-head.html |
| `lorc-wolf-howl.svg` | Lorc (http://lorcblog.blogspot.com) | https://game-icons.net/1x1/lorc/wolf-howl.html |
| `sbed-shield.svg` | Sbed (http://opengameart.org/content/95-game-icons) | https://game-icons.net/1x1/sbed/shield.html |

## Heading fonts: SIL Open Font License 1.1

From https://github.com/google/fonts (ofl/).

| File | Copyright | Notes |
|---|---|---|
| `fonts/Cinzel[wght].ttf` | The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) | No Reserved Font Name; license in `fonts/OFL-Cinzel.txt` |
| `fonts/Metamorphous-Regular.ttf` | Sorkin Type Co (www.sorkintype.com) | Reserved Font Name "Metamorphous": a subset or changed copy must ship under another name; license in `fonts/OFL-Metamorphous.txt` |

## Not used

Blizzard's own faction emblems are the game's trademarked art, so ForeverUI
never copies them. `/fui factionart` only checks which of the client's own
faction pictures exist, so a later build can point at them where the game
already has them.
