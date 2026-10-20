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

- [SMOKE-TEST.md](SMOKE-TEST.md): the in-game checklist, in crash-risk order. The batch results go on issue #284.

## Addon authors

- [API.md](API.md): the Skin API, auction prices and shopping lists, and the preset and options hooks other addons can use.

## Developers

- Start with [../CLAUDE.md](../CLAUDE.md) (how to work in the repo) and [PATTERNS.md](PATTERNS.md) (the canonical shape of a module, a guarded callback, frame state, combat-deferred work, a migration and a scenario).
- [DEVELOPMENT.md](DEVELOPMENT.md): the npm scripts, playing from a clone, editor and Windows tools, the pre-push hook, art and fonts, testing, code quality, CI and CurseForge packaging.
- [RELEASING.md](RELEASING.md): the local release route and the launch-day hotfix steps.
- [THEME.md](THEME.md): colours, text roles, spacing, every fade and sound. Update it when you add one.
- [../scripts/tests/README.md](../scripts/tests/README.md): how to write a headless-client test.
- `research/`: spikes that explain why the checks and tools are what they are ([code-quality-checks.md](research/code-quality-checks.md), [engineering-review.md](research/engineering-review.md)).
- `design/`: design research and the reasoning behind big pieces (reskin, auction tabs, UX, visual polish, one-stop features, and [DESIGN-PRINCIPLES.md](design/DESIGN-PRINCIPLES.md): the UI/UX review's principles and element-by-element targets). Research, not spec: nothing in it was checked in the game.
- `handoff/`: work plans written for other sessions. They use the old repo name `wow-forever-ui` and old commits; grep for the identifier they quote. `RESKIN-PLAN.md`, `VANGUARD-PLAN.md` and `WORKPLAN.md` are carried out; `AUCTION-PLAN.md` is partly open.
- `../.planning/`: the launch roadmap (`ROADMAP.md` is the source of truth for phase state). The UI coherence phases 8.1 to 8.11 are specified in [design/UI-COHERENCE.md](design/UI-COHERENCE.md).
