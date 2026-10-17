---
name: polish-module
description: Bring an existing Vanguard module or skinned game window up to the theme and the code rules without changing what it does (consistency passes, RESKIN-PLAN streams, a window that still shows the game's art, duplicated code, missing guards). Use for polish tasks on code that already works; new features use add-module, reported bugs use fix-bug.
---

# Polish a module

Polish changes how a thing looks or how its code reads, never what the player can do. The spec for the look is `docs/THEME.md`; the spec for the code is `CLAUDE.md` and `docs/PATTERNS.md`. Before you start, write down in the commit body which of the two you are polishing against; a commit that does both is two commits.

## Steps, in order

1. **Read first**: the module file in full, its README sentence(s), `docs/THEME.md` (Rules, Text roles, Spacing, Panels, Game frame primitives) and, for a game window, the stream in `docs/handoff/RESKIN-PLAN.md` and its "Done list" (section 11) so you do not redo a finished item.
2. **Measure before touching**: for each frame the pass covers, `addon.frame("<name>")` and `addon.frames('<predicate>')` in a scratch test give the alpha, size, texture and text as the harness lays them out. Keep that as the "before" so the test you write asserts a change, not a hope.
3. **Look only**: the theme's primitives, never new colour or size numbers. `T.Panel`, `T.Button`, `T.Text` roles, `T.Tab`, `T.Tooltip`, `T.ScrollBar`, `T.FontObjects` for a game window, `T.Crop` for a game icon. The game's art is faded by alpha, never hidden or reparented, so the game's own layout and show/hide code keep working. Spacing in 4 px and 8 px steps. A new colour or font size goes in `Core/Theme.lua` as a token with a line in `docs/THEME.md`; nowhere else.
4. **Code only**: shorten each function to its 10 lines with the helper named for what it does, not `helper2`; a comment on the line above every function that says what it does for the player or the frame, not what the code does; `ns.Guard` on every hook, click and timer callback; `ns.FrameState` for state on a game frame; `ns.Every` for periodic work; one `ns.On` per event. `node scripts/agent-check.mjs <file>` reports the rule breaks in one file; `npm run quality` shows the report-only counts (they must not go up).
5. **A window the game owns** is reskinned the way `Modules/Windows*.lua` already do it: one `skin<Window>(frame)` that is safe to run twice, run from the window's `OnShow` through `HookScript`, with every child guarded by a `type()` check because the harness's copy of the window is a model and the real client may lack the part. The switch that turns it off (`Windows.<group>`) is respected and tested.
6. **The test** asserts the measured thing: the art's alpha, the panel present, the label in the role, the raised look on the selected tab; and the same frame with the switch off left alone. For a window, the pattern in RESKIN-PLAN "Writing a task's test" (`WINDOWS_ENV`, `windowState`). For a code-only pass, the existing tests stay green and no new one is needed unless a function's split made a path that nothing ran.
7. **Docs**: a README sentence only if the player sees something new (a flat tile where there was wood); `docs/SMOKE-TEST.md` gets the step that confirms the look, with the exact Expect text; tick the RESKIN-PLAN item in the same commit.
8. **Check** and **PR** as in `ready-pr`. The "Needs in-game check" list names every window touched: nothing here was seen in the game, and texture blending, font rasterizing and pixel snapping are the harness's blind spots.

## Do not

- Do not split a file before launch (the author's call, 2026-10-12); polish stays inside the file.
- Do not change a setting's name, type or default; that is a migration and a feature change, not polish.
- Do not remove a guard, a `ns.IsSecret` check or an `ns.OutOfCombat` wrap because the harness never trips it; the harness stubs the client.
