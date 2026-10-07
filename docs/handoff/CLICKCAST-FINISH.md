# Finishing PR #78: click casting without typing

For the session that picks this up on the owner's machine (clone at `C:\Workspace\wow-forever-ui`).
Branch `work/p3-clickcast`, PR https://github.com/clifftaylor2325/wow-forever-ui/pull/78, head `8daf0dd`.
Design: `docs/design/CLICK-CASTING.md` (branch `docs/ellesmereui-gap-analysis`). Repo rules: `docs/handoff/WORKPLAN.md` §0.

## What was done (do not redo)

- `Modules/ClickCastSpells.lua` (new): spellbook catalog via `C_SpellBook`, ranks folded, groups by a per-class
  name table, starter layouts. `Modules/ClickCast.lua`: `spellID`/`rank` on bindings, `focus`/`assist`, `Move`,
  `Clear`, `ApplyLayout`, `CopyToSpec`, `Export`/`Import`, `Collision`; hover-key attributes use the `*` prefix.
  `Modules/ClickCastOptions.lua`: rewritten page (grid, picker, hover keys, test tile, share). `Vanguard.toc`
  loads `ClickCastSpells.lua` between the two. `Core/Dialog.lua` (`ns.AskText` label), `Core/Widgets.lua`
  (`W.MODIFIER_KEYS`, `W.MOUSE_BUTTONS`), `.luacheckrc` (`C_SpellBook`, `GetBindingAction`, `GetNumSpecializations`).
- Harness: `scripts/lib/wow-world.lua` (`C_SpellBook` over `world.book`, `world.learn`/`forgetAll`,
  `C_Spell.IsSpellHelpful`, `GetBindingAction`, `GameTooltip:SetSpellByID`, 4-value `GetCursorInfo` for spells),
  `scripts/lib/lua-harness.mjs` (`learn`, `forgetAll` in `WORLD_CALLS`), `scripts/tests/README.md`.
- Tests: `scripts/tests/clickcast.test.mjs` (new, 7 cases); `clicks.test.mjs` (old options test removed, `*` prefix,
  new messages); `bars.test.mjs` (spell drop now lands on a grid cell); `core.test.mjs` (`*type-fui2`).
- README: a "Click casting" bullet under "What's in it".

## What was verified, and what was not

The npm registry is blocked in the Claude sandboxes, so vitest never ran. These passed on the owner's machine
through a plain-node `it`/`expect` stand-in: `clickcast`, `clicks`, `bars`, `casts`, `core`, `data`,
`fallbacks`, `frames`, `healing`, `auras`. Lua 5.1 syntax and the Lua half of `npm run quality` pass on every
changed file. **Not run:** the other 23 test files, the JS half of `npm run quality`, `npm run coverage`, `luacheck`.

## Steps

1. `git fetch && git checkout work/p3-clickcast && npm ci`
2. `npm run verify` — fix anything that fails. Likely spots: a test elsewhere that reads the old `type-fui<i>`
   attributes (search `type-fui`), or that relied on `GetCursorInfo` returning 3 values for a spell.
3. `npm run coverage` — floor is 100 %. If `Modules/ClickCastOptions.lua` or `ClickCastSpells.lua` has uncovered
   lines, add the case to `scripts/tests/clickcast.test.mjs` (the file's helpers: `priest()`, `cell()`,
   `pickerRow()`, `chevron()`, `confirm()`, `textsIn()`, `bindings()`). Do not lower the floor.
4. `npm run lint` if luacheck is installed (CI runs it): expect at most new `read_globals` names.
5. `node scripts/build-media.mjs --check` is not needed (no media changed).
6. Tick nothing in WORKPLAN §5 yet; add a line under §8 "Done list" when merged: `- P3 click casting (PR #78)`.

## In-game smoke test (Forever client), then update the README/design if an answer differs

- `/vg` → Click casting: the grid shows; click a cell → the picker lists your spells in groups with icons; the
  rank chevron shows on spells with more than one rank; pick a rank → the cell says "(Rank n)".
- Hover a raid frame and use a mouse cell: casts the highest rank. Use a rank cell: casts that rank. **If a rank
  cell does nothing**, the secure `spell` attribute does not take a numeric id on Forever: in
  `Modules/ClickCast.lua` `spellValue()`, return `b.value .. "(Rank " .. b.rank .. ")"` instead of `b.spellID`,
  and update the design doc §6 Q1 and this file.
- If every spell lands in "Other", `C_Spell.IsSpellHelpful` is missing or the class table misses your names:
  check `/vg errors`, then the names in `CLASSES` in `ClickCastSpells.lua` against your spellbook.
- Add key → press Shift+Q → pick → hover a frame and press Shift+Q: casts. Without secure snippets (beta bug)
  the section shows the note and mouse bindings still work.
- "<Class> healing layout" fills the grid; unlearned spells show the name with no icon and bind once learned.
- Try it tile: hover, press, read the line. Export → Import round-trips. Escape closes the picker with the window.
- Known gap (by design, later): cell-to-cell drag to move a binding; `CC.Move` exists, no UI yet.
