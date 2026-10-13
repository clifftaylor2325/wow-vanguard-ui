---
name: triage-game-report
description: Turn what Cliff pastes from the game (a /vg report block, /vg errors lines, smoke-test step results, a batch checklist like issue #284) into issues, closed issues and fixes. Use when a message quotes "### Vanguard report v1 ###", a step id like 9.4, or /vg errors output.
---

# Triage a game report

The in-game check is the only ground truth this project has, and Cliff's time in the game is the scarcest thing in it. Every line he pastes is read once, recorded where the next person will look, and turned into the smallest next step.

## Steps, in order

1. **Read the whole paste** before acting. A `/vg report` block holds, in order: the `/vg status` lines (version, profile and module count; skinned, painted and waiting-on-combat counts; the client line with the build, `auras on the engine` or `on the fallback`, `aura values readable` or `hidden right now`, whether secure snippets work; `Client has: ... lacks: ...`; `UI scale ... text ... chat ...`), then `/vg errors` (each error as `<where>: <file>:<line>: <message>` with `(xN)` and stack lines), then the screen size, the modules turned off and the skins.
2. **Record the facts first**, before any fix: the real Interface build and the `Client has / lacks` line go in the thread's reply and, when they differ from what the repo assumes, in `docs/SMOKE-TEST.md` (the build value) and `Vanguard.toc` (`## Interface`). An API the client lacks that the addon assumes is an issue on its own.
3. **One issue per distinct error**, not per paste: the `<where>` label and the file and line are the title ("`UnitFrames` target health: Modules/UnitFrames.lua:212 attempt to compare secret"), the body quotes the exact lines and names the smoke-test step. Search issues first (`search_issues` with the file name) and comment on the existing one instead of opening a twin. Label it by the step's crash-risk order in `docs/SMOKE-TEST.md`.
4. **A step that passed closes what it was checking**: an issue whose fix was "pending an in-game check" (#186 to #204 style) gets a comment with the step id and the paste's version, then is closed as completed. `CONCERNS.md`'s "Known Bugs" list is updated in the same commit if it names the issue.
5. **A step that failed without an error** (it looks wrong, nothing in `/vg errors`) is a `fix-visual-issue` or `fix-bug` task; ask for `/vg frame <name> deep` in the issue if the paste has none, as a checklist, not a question that blocks.
6. **A batch checklist** (issue #284) is ticked item by item with the paste's version in the tick's comment; an item that could not be run is left unticked with why. An API probe's answer (what `type()` returns for a secret, whether addon messages work in instances) goes into the harness or the plan it was blocking, in its own PR, and the issue comment links that PR.
7. **Then the fixes**, highest crash risk first, each by `fix-bug` or `fix-visual-issue`, one branch per issue. A fix for an error only the game showed is a `full-tests` candidate when it changes the harness.
8. **Reply** with one line per error (issue link, what it is, what is next) and the facts recorded. No fix is claimed as seen; every PR from a report says "Needs in-game check" with the step to rerun.

## Do not

- Guess at a stack line's cause without reading the function group; the line number in a paste comes from the shipped version, so `git show v<version>:<file>` is the file to read.
- Close an issue because the code changed; only a passed step or Cliff's word closes it.
- Ask Cliff to rerun something before every other step in the paste is recorded.
