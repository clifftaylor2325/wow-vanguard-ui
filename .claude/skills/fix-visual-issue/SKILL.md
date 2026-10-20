---
name: fix-visual-issue
description: Fix a visual or layout bug reported from the game (a cut-off label, a see-through panel, a wrong colour) in Vanguard, which nobody can see in the game while working. Use for issues like #187 to #204 and any report that quotes /vg frame output.
---

# Fix a visual issue

Nobody working on the repo can run the game. A visual fix is made from what the report says, what the code intends, and what the harness can measure; it is never claimed as seen.

## Steps

1. **Read the report** and any `/vg frame <name> [deep]` block in it: shown, alpha, scale, size, rect, anchors, parents. If the issue has none, ask for one in the PR's "Needs in-game check" rather than guessing twice.
2. **Find the frame** by its global name or the code that makes it (`grep -rn '"Vanguard_<name>'` or the `T.Panel`/`T.Button` call). Read the whole function group around it and `docs/THEME.md` for the primitive involved.
3. **Reproduce in the harness** where the measurement exists: `addon.frame("<name>")` gives `visible`, `alpha`, `width`, `height`, `left`, `bottom`, `texture`, `text`; `addon.frames('<Lua predicate>')` finds children. `scripts/lib/wow-layout.lua` resolves anchors to screen rects, so overlap and cut-off text are measurable. A font string's width is approximate.
4. **Fix at the source**: a colour or size only in `Core/Theme.lua`; a layout in the module; a game-window skin in `Modules/Windows*.lua`. Keep to the theme's spacing steps (4 px, 8 px) and text roles. Never a one-off colour number.
5. **A test** that asserts the measured thing (the label fits, the panel's alpha is 1, the button no longer covers the other).
6. **Docs**: the feature page sentence if what the player sees changed; `docs/SMOKE-TEST.md` step that will confirm it in game, with the exact Expect text.
7. **PR**: the issue number in the body, and under "Needs in-game check" the one thing Cliff should look at and what it should look like. The issue stays open until he has.

## What the harness cannot tell you

- Texture rendering, blend modes, pixel snapping at scales other than 1, and font rasterizing. Do not reason from a preview PNG as if it were the game.
- Whether a Blizzard frame has the children you expect on the real client; the harness's copies are models. Guard every `frame.<child>` access with a type check.
