# Development

How to build, test and release Vanguard from a clone. [CLAUDE.md](../CLAUDE.md) has the rules every change follows, and [PATTERNS.md](PATTERNS.md) the canonical shapes.

```bash
npm install
npm test          # JS and Lua harness tests under Vitest, once (vitest run, no watch), then a per-area Lua harness summary
npm run test:quick # the JS tests and the Lua smoke tests (both clients, and secret geometry): what a pull request's check runs
npm run verify    # npm test (real addon Lua in a TEST-ONLY headless WoW client, and the JS tests), then the code-quality scan
                  # (functions of 10 lines or fewer, all documented; colors only from Core/Theme.lua)
npm run coverage  # every test with line coverage of the addon Lua; fails below scripts/lua-coverage-floor.json (100%)
                  # run it before you open a pull request: CI runs it when a pull request is opened ready or marked ready for
                  # review (not a draft), on later pushes only while it carries the full-tests label, weekly, before each
                  # release and from the Actions tab, not on every push (a private repository's Actions minutes count)
npm run lint      # luacheck
npm run timing    # the suite on 2 workers (the hosted runner's size): wall time, per-file table; --budget and --baseline fail it
npm run profile -- <area>  # where the Lua of one test area (or "login") spends its time, by file, function and line
npm run bench     # time and Lua instructions per event and per module under a scripted 40-player raid (a harness measurement); --compare <file>
npm run media     # regenerate Media/Textures and Media/Icons from scripts/lib/media-sources.mjs (deleting images no source makes)
npm run package   # dist/Vanguard-<version>.zip from committed files
npm run preview   # preview/*.png: the default layout and the options window (needs Playwright)
```

**Play from your clone:** `npm run link:wow -- --wow "<Forever folder that has Interface/AddOns>"` links `Interface/AddOns/Vanguard` to this clone (a directory junction on Windows, no admin needed), so an edit plus `/reload` shows in game. The folder is remembered in `~/.wow-forever/config.json`, so after the first time it's just `npm run link:wow`. An installed copy is only moved aside with `--replace` (it becomes `Vanguard.backup-<date>`). `--status` shows what's there; `--unlink` removes the link and never deletes a real folder.

[SMOKE-TEST.md](SMOKE-TEST.md) is the in-game checklist to run after a release lands: what to do, what to expect and what to paste back for each step.

**VS Code:** open the folder and accept the recommended extensions: **Lua** (sumneko) and **WoW API** (Ketho), which add Lua 5.1 checking plus autocomplete and docs for the game API. `.vscode/tasks.json` has verify, luacheck (problems show in the editor), coverage, package, preview and link:wow under *Run Task*.

**Windows tools:** `npm run verify` needs only Node. For `npm run lint`, put `luacheck.exe` from the [luacheck releases](https://github.com/lunarmodules/luacheck/releases) on your PATH. CI also runs a Lua 5.1 syntax check (`luac5.1 -p`); you don't need it locally.

**Working with an agent:** `.claude/settings.json` runs `scripts/agent-check.mjs` after every file edit Claude Code makes, so a broken rule (a function over 10 lines, a missing comment, a colour outside the theme, an unguarded hook) is reported at edit time rather than at push. `.claude/skills/` holds a playbook per recurring task (adding a module, a setting, a `/vg` command, media or a client API to the harness; polishing a module; fixing a bug or a visual issue; writing a harness scenario; readying a PR; cutting a release; triaging what the game reports; the weekly PR sweep); `docs/PATTERNS.md` shows the canonical shape of each pattern the rules ask for.

**Text fit:** `scripts/tests/textfit.test.mjs` runs the setup wizard, every options page, the dialogs, the screen at login and unlock mode in a client with the addon's real font widths and every `L[…]` string a third longer (a pseudo-locale, as a translation might run), and fails on text cut short in its box, text running out over an edge of its frame, and text drawn over other text or a control. The overflows it found when it was added are listed in `scripts/tests/textfit-baseline.json`; a new one fails, and so does a listed one that is fixed, so the list only shrinks (`VG_TEXTFIT_WRITE=1 npx vitest run scripts/tests/textfit.test.mjs` rewrites it after a fix). `scripts/tests/README.md` (Text fit) has how to audit a window of your own.

**Pre-push hook:** `npm install` points git at `.githooks/`, whose pre-push hook runs `npm run test:quick`, `npm run quality` and the TOC check, then luacheck and the Lua 5.1 syntax check when they are installed (it names what it skipped; on Windows it always skips the syntax check). CI stays the gate; `git push --no-verify` skips the hook once.

**Release:** bump `## Version` in `Vanguard.toc` and merge, then run the `release` workflow from the Actions tab on `main` (it tags `v<version>`), or push a matching tag. It runs the whole suite with the coverage floor first, then publishes a GitHub release with the zip. When Actions can't run, or a fix has to go out fast, `node scripts/release-local.mjs` does the same from your machine (a rehearsal by default, `--publish=v<version>` to ship to CurseForge, Wago and GitHub); see `docs/RELEASING.md`.

**Art and fonts:** every texture and icon under `Media/` is made by code in `scripts/lib/media-sources.mjs`: most drawn in plain math (no image editor), the options nav's and minimap's icons and the faction crests rasterized from game-icons.net SVGs in `art/game-icons` (credited in `art/CREDITS.md`); `npm run verify` fails if a committed file doesn't match its source. The fonts are made from upstream Fira Sans Condensed by `scripts/fonts/make-fonts.py` (see that file).

**Testing the addon:** `scripts/tests/<area>.test.mjs` play the addon's real Lua in a headless client built for the tests (`scripts/lib/wow-*.lua`): Lua 5.1 semantics, frames with real layout on a 1920x1080 screen, a world model (units, auras, actions, quests, combat, timers) behind the game API, and mouse and keyboard input. A test sets up the world, acts as the player would, and asserts on what the addon drew. The client also holds the addon to the game's taint rules: a test fails if the addon stores a field on one of the game's frames or touches a protected frame in combat, and it can hide positions and sizes as secrets the way the client does in a fight. The guide is [scripts/tests/README.md](../scripts/tests/README.md).

**Code quality:** every function has a comment on the line above it and at most 10 lines of body code, and addon Lua uses no syntax newer than Lua 5.1 (no `goto`, `::label::`, `//`, `&`, `|`, `~` or shifts: the test client parses Lua 5.3 and accepts them, the game does not); `npm run verify` and CI enforce it on every pull request. `npm run quality` also compiles every file the TOC loads with `luac5.1 -p` when it is installed (`apt-get install lua5.1`) and names the gap when it is not. `npm run quality` also counts four report-only patterns, secure calls outside a combat guard, `OnUpdate` handlers neither throttled nor cleared, and frame script handlers (`OnEnter`, `OnShow`, a `HookScript`) that are not `ns.Guard` calls (`--report` lists them); and English literals handed straight to a widget, tooltip, chat line or option row instead of through the string table (`unwrapped-text`); these fail only when a count rises above `scripts/code-quality-baseline.json`, which only goes down. The shared libraries in `Libs/` stay exactly as upstream wrote them, so the scan, luacheck and the coverage count leave them out.

**CI:** every pull request gets `verify.yml` ("Quick checks": spelling with typos (`_typos.toml` lists the WoW words it accepts), the code-quality scan, the TOC check (`scripts/check-toc.mjs`: every `.lua` under `Core/`, `Modules/` and `Locales/` listed once, libraries first, the Interface values, Title, Version and SavedVariables), luacheck, Lua 5.1 syntax, `npm run test:quick` and the release zip, inside a minute), and `main` requires it to merge. A pull request that changes only docs (`docs/**` and `*.md`) still gets the check, which skips its steps and passes in seconds, so it can merge without a bypass (the spelling check still reads it). A pull request that changes Markdown also gets `markdown.yml` (markdownlint, settings in `.markdownlint-cli2.jsonc`), which is not required. Every action the workflows use is pinned to a commit SHA, with its version in a comment for Dependabot. The whole suite with the coverage floor (`lua-suite.yml`) runs when a pull request is opened ready for review or marked ready for review (a draft doesn't run it), on every later push while the pull request carries the `full-tests` label, weekly (shuffled), before each release and from the Actions tab (*full suite* → *Run workflow*). On a pull request it runs only the tests: the quick check already ran the scan, TOC, luacheck, syntax and zip steps on the same commit, and the UI preview renders only when the pull request carries the `preview` label (the weekly run and a hand-started run that asks for it render it too). A later push without the label stops a full-suite run still in progress for that pull request (the code it was testing is stale), and adding any other label neither starts nor stops a run. A red weekly run opens an issue labelled `ci-failure`, which the next green run closes. Run `npm run coverage` yourself before opening a pull request, since CI doesn't run it on every push: a private repository's Actions minutes are counted, and the gate is kept to one billed minute. Code scanning (GitHub Advanced Security's default setup) stops once the repository is private; nothing here depends on it.

## Translations

Player text is looked up as `L["English text"]` (`Core/Locale.lua`; the pattern is in [PATTERNS.md](PATTERNS.md)), and `Locales/<locale>.lua` holds one locale's translations for all ten non-English client locales. Each file stops at its first line unless the client runs that locale, so only one locale's text stays in memory.

```sh
node scripts/i18n.mjs extract                 # every key the code looks up, with where
node scripts/i18n.mjs status                  # per locale: translated, missing, orphaned
node scripts/i18n.mjs export deDE deDE.csv    # key, english, translation, context, note
node scripts/i18n.mjs import deDE deDE.csv    # writes Locales/deDE.lua from the reviewed rows
```

A row whose note says `machine` is a draft and is not imported: a translation ships only once a native speaker has reviewed it. Volunteers translate through the Localization tab of the CurseForge project; its export comes back as a CSV for the same import. `scripts/i18n.test.mjs` fails when a locale file was edited by hand, keeps a key the code no longer uses, or loses a `{placeholder}`; `scripts/tests/options.test.mjs` logs in under every locale, so each file's lines run under the coverage floor. Changing a key's English orphans its translations: `status` lists them, and the next import drops them. An options caption whose English ends in ` (reload)` keeps its reload words in a bracket at the end of its translation (half-width or full-width): the options window moves that last bracket into the row's reload tag.

## Releases on CurseForge

`.pkgmeta` tells CurseForge's packager (and Wago's, and the BigWigs packager) what goes in the `Vanguard` folder: exactly what `npm run package` puts in the release zip. `scripts/pkgmeta.test.mjs` fails if the two ever differ, so add a new top-level file or folder to `.pkgmeta`'s ignore list unless players need it.

Both projects exist. `Vanguard.toc` carries `## X-Curse-Project-ID` and `## X-Wago-ID`, and the `listings` job in `release.yml` runs the BigWigs packager after the GitHub release is published, so a new `v*` tag reaches CurseForge and Wago without a manual upload. It needs the repository secrets `CF_API_KEY` (CurseForge, Account → API Tokens) and `WAGO_API_TOKEN` (Wago, Developer tools), and skips itself while either is missing. The packager (v2.6.1, pinned by commit) knows the Forever flavor and maps Interface 16xxx to it. Nobody has run it yet, and the TOC's second value (120007) is a retail Interface, so the first tag shows whether CurseForge and Wago also list Vanguard as a retail file. When both listings are live, set `CURSEFORGE_URL` in the website's `scripts/lib/html.mjs`: its "Coming soon on CurseForge" badges become links.
