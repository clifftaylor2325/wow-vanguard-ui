# Docs

Pick by who you are. The behaviour spec for the whole addon is the root [README.md](../README.md) (the overview, install, safety, license and credits) together with the feature pages below, one per area; everything else points into them.

## Feature pages (the behaviour spec)

- [Look and theme](features/look-and-layout.md)
- [Unit frames and nameplates](features/unit-frames.md)
- [Raid frames and click casting](features/raid-frames.md)
- [Action bars and cooldowns](features/action-bars.md)
- [Game windows and extras](features/game-windows.md)
- [Combat tools](features/combat-tools.md)
- [Chat](features/chat.md)
- [Map, minimap, bags and more](features/map-and-minimap.md)
- [Quests](features/quests.md)
- [Town and gear](features/town-and-gear.md)
- [Auction house](features/auction-house.md)
- [Options and setup](features/options-and-setup.md)

## Players

- [GETTING-STARTED.md](GETTING-STARTED.md): install, first run, what to do when something breaks.
- [COMMANDS.md](COMMANDS.md): every `/vg` command, grouped.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release. The in-game text is `Core/WhatsNewNotes.lua`.

## Testers

- [SMOKE-TEST.md](SMOKE-TEST.md): the in-game checklist, in crash-risk order. The results go in [smoke-results.json](smoke-results.json), one entry per step.

## Addon authors

- [API.md](API.md): the Skin API, auction prices and shopping lists, and the preset and options hooks other addons can use.

## Developers

- Start with [../CLAUDE.md](../CLAUDE.md) (how to work in the repo) and [PATTERNS.md](PATTERNS.md) (the canonical shape of a module, a guarded callback, frame state, combat-deferred work, a migration and a scenario).
- [DEVELOPMENT.md](DEVELOPMENT.md): the npm scripts, playing from a clone, editor and Windows tools, the pre-push hook, art and fonts, testing, code quality, CI and CurseForge packaging.
- [RELEASING.md](RELEASING.md): the local release route and the launch-day hotfix steps.
- [THEME.md](THEME.md): colours, text roles, spacing, every fade and sound. Update it when you add one.
- [../scripts/tests/README.md](../scripts/tests/README.md): how to write a headless-client test.
- `research/`: spikes that explain why the checks and tools are what they are ([code-quality-checks.md](research/code-quality-checks.md), [engineering-review.md](research/engineering-review.md)), and [forever-api-facts.md](research/forever-api-facts.md): eleven questions about the Forever client settled from the game's UI source, each with what only the game can answer.
- [design/RESKIN-COVERAGE.md](design/RESKIN-COVERAGE.md): every game window the skin is registered for, by client, written from the window registry by `scripts/tests/windows-coverage.test.mjs` (never by hand).
- `design/`: design research and the reasoning behind big pieces (reskin, auction tabs, UX, visual polish, one-stop features, [DESIGN-PRINCIPLES.md](design/DESIGN-PRINCIPLES.md): the UI/UX review's principles and element-by-element targets, [SETTINGS-SIMPLIFICATION.md](design/SETTINGS-SIMPLIFICATION.md): the decision record for making the options window less overwhelming, with the spike's numbers, and [MODULE-LIFECYCLE.md](design/MODULE-LIFECYCLE.md): the proposed module lifecycle (dependencies, teardown, late enable, live profile switching) with every module classified, for approval before code). Research, not spec: nothing in it was checked in the game.
- `handoff/`: work plans written for other sessions. They use the old repo name `wow-forever-ui` and old commits; grep for the identifier they quote. `RESKIN-PLAN.md` is carried out (its how-to-work rules are superseded by [CLAUDE.md](../CLAUDE.md)); `AUCTION-PLAN.md` is partly open; [leonardo-art-plan.md](handoff/leonardo-art-plan.md) is the spec of the toned art the media scripts cite (milestones built, its section 8 checks not ticked). [A-GRADE-PLAN.md](handoff/A-GRADE-PLAN.md) is the open plan from the 2026-11-09 review's B- to an A, phase by phase, and [VANGUARD-REVIEW-2026-11-09.md](handoff/VANGUARD-REVIEW-2026-11-09.md) is that review: the scorecard, the bug list and the roadmap the plan's task ids point into. [BUG-HUNT-HANDOFF-2026-11-10.md](handoff/BUG-HUNT-HANDOFF-2026-11-10.md) is what the 2026-11-10 hunt left for the next one: what is still suspected, what needs the game, and what the harness lets through.
- `../.planning/`: the closed GSD record. `ROADMAP.md` is kept because it holds the goal, success criteria, files and checks of the open UI coherence phases 8.1 to 8.11, which [design/UI-COHERENCE.md](design/UI-COHERENCE.md) also specifies; `STATE.md` says the rest is no longer kept up to date, and `config.json` sets the model profile.
