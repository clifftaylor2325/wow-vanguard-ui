# CLAUDE.md: Vanguard (WoW addon)

Read this before touching anything. README.md is the spec for behaviour; this file is how to work in the repo.

## What this is

- Vanguard is a from-scratch UI suite (Lua 5.1) for WoW Forever, the 12.1 engine with vanilla content. TOC declares Interface 16001 (Forever) and 120007.
- Formerly ForeverUI, renamed in 0.4.0. Use "Vanguard" in code, docs and player-facing text. "ForeverUI" and "/fui" appear only in migration notes. Slash commands are `/vg` and `/vanguard`.
- Version lives in `Vanguard.toc` (`## Version`). Bump it only as part of a release.
- Copyright Clifton Taylor, all rights reserved (LICENSE). Don't add third-party code or art without a license note in the right CREDITS file.
- You cannot run the game. Everything is verified through the headless test harness. Never claim in-game behaviour you did not observe; mark such work as needing an in-game check.

## Commands

```sh
npm install           # once; also turns on .githooks/pre-push (test:quick, quality, TOC, luacheck and luac if installed; --no-verify skips)
npm run test:quick    # JS tests + the Lua smoke tests (both clients, secret geometry); what a PR's quick check runs
npm test              # all tests (JS + Lua harness)
npm run verify        # npm test + code-quality scan
npm run coverage      # all tests with line coverage; floor is 100% (scripts/lua-coverage-floor.json)
npm run lint          # luacheck (only if installed)
npm run media         # regenerate Media/ from scripts/lib/media-sources.mjs
npm run package       # dist/Vanguard-<version>.zip
npm run preview       # preview/*.png (needs Playwright)
npm run link:wow -- --wow "<Forever folder>"   # link the clone into the game for /reload testing
```

Before you say a change is done: `npm run verify` and `npm run coverage` must both pass. Every new line of addon Lua needs a test that executes it. CI runs `verify.yml` on every PR; the full suite runs weekly, before releases, or on PRs labelled `full-tests`.

## Hard rules (CI enforces these)

- **Functions:** every function has a comment on the line directly above it, and its body is at most 10 lines of code. Nested functions count toward the parent. Checked by `scripts/lib/code-quality.mjs`.
- **Colours and font sizes:** only in `Core/Theme.lua`. Elsewhere use `T.RGB`, `T.Color`, `T.Text` or theme tokens.
- **WoW globals:** every new global the addon reads goes in `read_globals` in `.luacheckrc`. Addon globals go in `globals`.
- **Widget methods:** add a method to `scripts/lib/wow-widget-api.lua` only after confirming it exists in the 12.1 client (Blizzard's wow-ui-source or the API docs). Unlisted methods are nil in tests on purpose.
- **Libs/:** LibStub, CallbackHandler-1.0 and LibSharedMedia-3.0, kept unmodified. Don't edit them.
- **Media/:** generated. Change `scripts/lib/media-sources.mjs` and run `npm run media`. Never hand-edit textures or icons. `node scripts/build-media.mjs --check` must pass.
- **Fonts:** made from upstream Fira Sans Condensed by `scripts/fonts/make-fonts.py`.
- **New files:** a file the game loads must be listed in `Vanguard.toc`. A new top-level file or folder that players don't need must be added to the `ignore` list in `.pkgmeta`, or `scripts/pkgmeta.test.mjs` fails.
- **Lua 5.1 only.** No `goto`, no integer division, no `//`, no bit library from 5.3+.

## Game rules

- Nothing protected in combat. Guard with `ns.OutOfCombat`.
- Never read or compare a value that might be secret. Use `ns.IsSecret` and `ns.PlainNumber`.
- Never store a field on a frame the game made, and never replace its scripts with `SetScript`. Keep per-frame state in an `ns.FrameState` side table and use `HookScript`. The harness fails a test that stores such a field (`scripts/lib/wow-taint.lua`).
- A `PLAYER_REGEN_DISABLED` handler defers its after-fight work with `ns.AfterCombat`. Anything else that waits for the fight to end uses `ns.OutOfCombat`.
- Prefer `C_Item`, `C_Spell` and `C_UnitAuras` over older globals.
- Detect Forever by interface version with `ns.IsForever`, not by the presence of a global.
- Fades never run longer than 0.15 s in combat. Motion and sounds respect the Reduce motion and Interface sounds switches. Every fade and sound is listed in `docs/THEME.md`; update it when you add one.

## Where things are

- `Core/`: the framework. Events, DB, Profiles, Options and OptionsWindow, Theme, Movers, Slash, Feedback, Setup, and so on.
- `Modules/`: one file per feature. Files share a prefix when they belong to one area (`Auction*`, `Quest*`, `Raid*`, `Windows*`, `ClickCast*`).
- `scripts/tests/<area>.test.mjs`: area tests that run the real Lua in a headless client (`scripts/lib/wow-*.lua`). Read `scripts/tests/README.md` before writing one.
- `docs/`: `THEME.md`, `API.md` (the Skin API for other addons), `SMOKE-TEST.md` (in-game checklist), `design/`, `handoff/` (work plans).
- `art/`: sources for Media/ art. Credits in `art/CREDITS.md`.

## Working method

- Before a change, read every file the task names in full, plus the README section for that feature.
- If behaviour changes, update the matching README sentence in the same commit.
- Work in branches named after the phase (`work/p1-performance`). One task is one commit, with subject `<task id> <area>: <change>` and a body saying what changed and what was verified.
- Tick the task's checkbox in the work plan in the same commit, when there is one.
- Check tasks marked `[DECIDE]` with the user before going ahead. For everything else, take the smallest reasonable choice and note it in the commit body.
- Open one PR per phase. List the tasks, tests added, anything skipped, and a "needs in-game check" list.
- Plans in `docs/handoff/` refer to the old repo name `wow-forever-ui` and to a commit (`619d5c9`). Line numbers in them have drifted. Grep for the identifier they quote rather than trusting the line.

## Don't

- Don't commit to `main` directly. Work on a branch and open a PR.
- Don't commit `.cache/`, `dist/`, `preview/`, `coverage/` or `node_modules/`.
- Don't add a doc file unless the user asks for one.
- Don't use `/fui` or "ForeverUI" in new player-facing text.
