---
name: add-module
description: Add a new Vanguard module (a feature file under Modules/) with its settings, options, test, README line, /vg help line and smoke-test step. Use when a task asks for a new feature that is not part of an existing module.
---

# Add a module

A module is one file under `Modules/`, registered with `ns.Module`, built at PLAYER_LOGIN from the profile's settings. Copy the nearest module with the same shape (`Modules/PartyExtras.lua` is the smallest complete one) rather than writing from a blank file.

## Steps, in order

1. **Read first**: `CLAUDE.md`, `docs/PATTERNS.md`, the README section for the area, and the module you are copying.
2. **The file** `Modules/<Name>.lua`, starting with a comment that says what the player sees, then `local ADDON, ns = ...`, then `local M = ns.Module("<Name>", { defaults = { ... } })`. `M.Enable(settings)` builds it; add `M.Disable(settings)` only if the module can undo itself without a reload. Every function has a comment on the line above and at most 10 lines of code.
3. **List it in `Vanguard.toc`** after the modules it reads with `ns.GetModule` at load time (load order is TOC order). `node scripts/check-toc.mjs` passes.
4. **Settings** live only in `settings` (the table `ns.Module` gives `Enable`). A setting never changes type; a renamed or re-typed one gets an `ns.Migrate("<Name>", fn)` step.
5. **Options**: add the switch or control to the right page in `Core/Options*.lua` using the existing control helpers; colours and sizes only through `T.*`.
6. **The test** `scripts/tests/<area>.test.mjs` (a new file for a new area, or the existing area file): a scenario in the README style, set up the world, act as the player, assert on what the module drew. Every new line of Lua must run in some test (`npm run coverage` stays at 100%). If the module is heavy at login, see "Scoped logins" in `scripts/tests/README.md`.
7. **Docs in the same commit**: a sentence in the README's "What's in it" list, a `HELP` line in `Core/Slash.lua` and a README command line if there is a `/vg` command, a step in `docs/SMOKE-TEST.md` (renumber nothing; add a sub-step like `9.4a`), and a line in `docs/THEME.md` for any new fade or sound.
8. **Check**: `npm run test:quick` while iterating; `npm run quality` and `npm run coverage` once before the PR.

## Rules the module must keep (the harness fails a test that breaks them)

- Nothing protected in combat: wrap frame changes in `ns.OutOfCombat(fn, key)`; from a `PLAYER_REGEN_DISABLED` handler use `ns.AfterCombat`.
- Never read a value that might be hidden: `ns.PlainNumber(v)` for numbers, `ns.IsSecret(v)` before any comparison.
- Never store a field on a frame the game made, and never `SetScript` on one: keep state in `ns.FrameState("<name>")` and use `HookScript`.
- Every hook, click handler and timer callback is wrapped in `ns.Guard("<where>", fn)`.
- Events through `ns.On` / `ns.OnUnit`, periodic work through `ns.Every`, deferred work through `ns.Soon`; no private event frames or `OnUpdate` loops.

## PR

One commit per task, subject `<task id> <area>: <change>`, body saying what was verified. The PR body follows `.github/PULL_REQUEST_TEMPLATE.md` and always has a "Needs in-game check" list: nothing here is ever seen in the game.
