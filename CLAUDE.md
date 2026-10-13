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
- Never store a field on a frame the game made, and never replace its scripts with `SetScript`. Keep per-frame state in an `ns.FrameState` side table and use `HookScript`. The harness fails a test that does either (`scripts/lib/wow-taint.lua`).
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

## Usage and cost

Claude usage and CI minutes are both limited. Pick the cheapest model and effort that can do the task well, and run work in parallel only when the pieces are independent.

- **Model by task.** Haiku for mechanical work: closing issues with a link, ticking plans, renumbering smoke-test steps, bringing `main` into a branch, release-note drafts from merged PR titles, a status summary. Sonnet for everything that changes code: bug fixes, feature phases, harness tests, site generators, docs that need judgement. Opus or above only for a root cause nobody has reproduced, a change to the harness rules (`scripts/lib/wow-taint.lua`, the secret helpers), a secure or protected code path, or a decision that spans modules.
- **Effort by task.** Low for the Haiku work and for checklists. Medium is the default for code. High only for the Opus cases above. Don't raise effort to make up for a vague brief; sharpen the brief.
- **Briefs stay lean.** A thread's brief names the issue or phase, the branch, the files it may touch, and the default picked where the ask forks. It does not restate the README, this file or the plan; the thread reads those itself. One thread per independent branch. A task that waits on another PR waits; it does not get a thread yet.
- **Local runs.** `npm run test:quick` while iterating. `npm run verify` and `npm run coverage` once, before the PR, not after every edit.
- **CI minutes.** Open PRs as drafts and mark them ready once, when they are done; CI skips drafts. The `full-tests` label goes only on a PR that adds new game API surface, changes the harness, or cuts a release. Don't push to re-run a green check.
- **Merging in a wave.** When several PRs are open, merge in the order that keeps `main` moving under the fewest branches (core and harness first, then features), and bring `main` into a branch once, right before it merges, not after every merge.
- **GSD.** `.planning/config.json` sets `model_profile` to `budget` for the same reason. A phase plan states the model and effort a plan needs only when it is not the default above.

## Agent tooling

- **Edit-time check.** `.claude/settings.json` runs `scripts/agent-check.mjs` after every Edit or Write: the code-quality rules and luacheck (when installed) on that one file, fed back as hook output. Fix what it says before moving on; it is the same scanner CI runs. `node scripts/agent-check.mjs <file>` runs it by hand.
- **Skills** in `.claude/skills/`, one per recurring task; use the one that matches, each is the worked example of the rules above:
  - Building: `add-module` (a new feature), `add-setting` (a switch or option on an existing module), `add-slash-command` (a `/vg` command), `add-media` (a texture or icon), `add-game-api` (a client API the harness lacks).
  - Changing: `polish-module` (look or code of an existing module, a game window's skin), `fix-bug` (a behaviour bug), `fix-visual-issue` (a look bug).
  - Testing and shipping: `add-harness-scenario` (a test), `ready-pr` (before any PR), `release` (a version), `triage-game-report` (what Cliff pastes from the game), `sweep-prs` (the weekly PR and CI sweep).
- **Patterns.** `docs/PATTERNS.md` shows the canonical shape of a module, a guarded callback, frame state, a secret-safe read, combat-deferred work, events and timers, a migration and a scenario. Copy from there, not from the nearest file.
- **Before a PR is marked ready**, run the built-in `code-review` skill on the diff once (the `ready-pr` skill says how). It catches what the harness cannot.
- **Annotations.** The `ns.*` helpers in `Core/` carry `---@param` and `---@return` lines; keep them when you change a signature, and add them to a new helper.

## Don't

- Don't commit to `main` directly. Work on a branch and open a PR.
- Don't commit `.cache/`, `dist/`, `preview/`, `coverage/` or `node_modules/`.
- Don't add a doc file unless the user asks for one.
- Don't use `/fui` or "ForeverUI" in new player-facing text.
