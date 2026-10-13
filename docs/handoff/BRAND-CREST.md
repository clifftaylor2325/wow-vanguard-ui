# Finishing the crest: Vanguard's new icon

For the session that picks this up on the owner's machine (clone at `C:\Workspace\wow-forever-ui`).
Branch `work/brand-crest`, PR https://github.com/clifftaylor2325/wow-vanguard-ui/pull/343. The site side is
https://github.com/clifftaylor2325/wow-vanguard-ui-site/pull/60 (its notes are in that PR's body; the site repo
keeps no handoff files).

## What was done (do not redo)

- `art/brand/vanguard-crest.svg` (new): the reference drawing, 1024 x 1024 on slate. Two swords crossed behind a
  rimmed, riveted heater shield that bears a serif V (Cinzel 900, converted to an outline). Same drawing as the
  website's logo, favicon and Open Graph image.
- `scripts/lib/media-brand.mjs` (new): draws that crest with `media-art.mjs` shapes (no resvg, no new
  dependency) at 64 x 64 for `Media/Textures/Icon.tga`, the addons list's icon (`## IconTexture` in the TOC is
  unchanged). The rivets, fullers, grip wrap and the V's engraved line are left out: under a pixel at 64 px.
- `scripts/lib/media-sources.mjs`: `Icon` now comes from `crestIcon(64)`; the old `coloredIcon` (the two
  diamonds, pre-coloured) is gone. `LogoLeft`/`LogoRight` (the in-game `T.Logo`) are untouched.
- `Media/Textures/Icon.tga`: regenerated from the new source.
- `scripts/media.test.mjs`: `iconIsCrest` (brass, slate and steel pixel counts at 64 px).
- `docs/THEME.md` ("Icons"), `art/CREDITS.md` (the crest and the Cinzel outline), `README.md` (the crest at the
  top).

## What was verified, and what was not

The npm registry is blocked in the Claude sandbox, so vitest, `npm run quality` (acorn) and `npm run media`
(resvg) never ran there. What did run: `node --check` on every changed `.mjs`; `Media/Textures/Icon.tga` was
written by calling the same `tga(crestIcon(64))` the build calls, so `node scripts/build-media.mjs --check`
should report it current; the new test's three counts were run by hand against the image (714 brass, 102 slate,
40 steel); the icon's outer pixel ring is clear (`shapesPadded`). Function bodies in `media-brand.mjs` were
counted against the 10-line rule by hand. **Not run:** `npm run verify`, `npm run coverage`, the markdown lint.

## Steps

1. `git fetch && git checkout work/brand-crest && npm ci`
2. `node scripts/build-media.mjs --check`. If it reports `Media/Textures/Icon.tga` out of date (a floating-point
   difference between machines would be a first), run `npm run media` and commit the file.
3. `npm run verify` and `npm run coverage` (no Lua changed, so coverage should be unchanged). If `quality` flags
   a function in `media-brand.mjs`, split it; the shapes are plain data.
4. In game (`npm run link:wow`): open the addons list and check the crest shows on the Vanguard row and reads at
   that size. If it is muddy there, the fallback is a simpler drawing for the icon only (shield and V, no swords):
   the shapes are all in `media-brand.mjs`.
5. [DECIDE] The in-game logo (`T.Logo`: the two linked diamonds beside the options title, on setup and the AFK
   card) still differs from the crest. Swapping it means tinted layers (shield and hilts in the accent, blades in
   `text`, the slate parts clear) and new sizes in `docs/THEME.md`; not done here. Ask Cliff before starting.
6. After merge: upload the 1280 x 640 social preview (`src/assets/brand/github-social-preview.png` in the site
   repo) under this repo's Settings → Social preview; it is not something git can set.
