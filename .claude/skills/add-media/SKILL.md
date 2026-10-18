---
name: add-media
description: Add or change a texture, icon or piece of art in Vanguard's Media/ folder, which is generated from code, with its credit line when the source is not ours. Use when a task needs a new icon, bar texture, glyph, crest or logo, or changes an existing one.
---

# Add media

`Media/` is generated. Every texture and icon is code in `scripts/lib/media-sources.mjs` (crests in `scripts/lib/media-crests.mjs`), written out by `npm run media`; `node scripts/build-media.mjs --check` fails CI when a committed file does not match its source. Nothing under `Media/` is ever edited by hand, and a hand-made image is never committed there.

## Steps, in order

1. **Read** `docs/THEME.md` ("Icons": the 16-unit grid, 2-unit strokes on whole units, 45-degree strokes half a unit off, white in every pixel with the shape in alpha, one clear pixel inside the edge) and the entries around the one you are adding in `media-sources.mjs`.
2. **A line glyph** (a control, a mark): an entry in `ICONS` drawn with `line`, `path`, `poly`, `box`, `ring`, `arc` from `media-art.mjs` at `STROKE` width. Straight strokes on whole units; curves stay round; a filled shape where 2 px strokes do not fit (the raid marks).
3. **A texture** (a bar fill, a sheen, a shadow): an entry in `TEXTURES` made with `fill` or `draw`, white or grayscale so the theme tints it. The one coloured image is `Icon` (the addons list cannot tint it).
4. **A silhouette or crest** from an outside SVG (`SILHOUETTES`, `CRESTS`): only from a source whose licence allows it (game-icons.net is CC BY 3.0), with the author and licence in `art/CREDITS.md` and `Media/Icons/CREDITS.txt`, and the SVG under `art/`. Anything without a licence note is a [DECIDE] for Cliff before it goes in.
5. **Generate**: `npm run media`, then `node scripts/build-media.mjs --check`. Commit the source change and the generated files together; `npm run media` also deletes a file whose source is gone.
6. **Look at it**: `node scripts/media-sheet.mjs <Name> [<Name>...]` writes `preview/media-sheet.png` (each image scaled up, once over a checkerboard for the alpha and once tinted brass on the slate panel) and prints each image's size (flagging a side that is not a power of two), alpha range and count of soft texels. Open the PNG with the Read tool and check the shape, the orientation (corner art is drawn for the top left) and the stroke weight against a neighbour of the same kind (`CornerLine`, `OrnamentCorner`). The numbers settle what the eye can't: a one-pixel line meant to be crisp at its own size has no soft texels. Neither proves how the game samples it at another size, so the PR's in-game list says where to look.
7. **Use it**: the addon references it by its `Media/...` path through the theme (`T.Icon`, a texture token in `Core/Theme.lua`), never a raw path in a module. A new icon that is tinted uses the tint rules in `docs/THEME.md` (`text2` at rest, the accent under the mouse or when selected, `disabled` when disabled).
8. **Tests**: `scripts/media.test.mjs` checks the straight-stroke icons have no half-covered pixel at 16 px, the clear edge pixel and the white-in-every-pixel rule; read that file for the lists a new icon joins (`BUILT_NAMES`, `SQUARE_ICONS` and the straight-stroke set). The feature that shows it asserts the texture path in its area test (`addon.frame("<name>").texture`).
9. **Docs**: a line in `docs/THEME.md` for a new token or a new size an icon is shown at; `art/CREDITS.md` for anything not ours.

## Do not

- Commit a PNG, TGA or BLP that no source makes.
- Ship a font: fonts come from upstream Fira Sans Condensed by `scripts/fonts/make-fonts.py` only.
- Crop a game atlas with `SetTexCoord`; on Forever, atlas coordinates are atlas-relative (size and anchor the art instead; `Core/Skin.lua`).
