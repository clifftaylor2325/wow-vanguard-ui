---
name: triage-game-report
description: "Turn what Cliff pastes from the game (a /vg report block, /vg errors lines, smoke-test step results, a batch checklist) into issues, closed issues and fixes. Use when a message quotes \"### Vanguard report v1 ###\", a step id like 9.4, or /vg errors output, or when Cliff says to find or read the logs (the bug log) on his computer."
---

# Triage a game report

The in-game check is the only ground truth this project has, and Cliff's time in the game is the scarcest thing in it. Every line he pastes is read once, recorded where the next person will look, and turned into the smallest next step.

## Steps, in order

1. **Read the whole paste** before acting. A `/vg report` block holds, in order, the lines `reportHead` builds (`Core/Slash.lua`): `### Vanguard report v1 ###`; the version, interface number, profile and module count; the client line (the build, `auras on the engine` or `on the fallback`, `aura values readable` or `hidden right now`, whether secure snippets work); `Client has: ... lacks: ...`; `Game restrictions: ...`; `UI scale ... text ... chat ...`; the screen size; `Modules off: ...`; `Skins: ...`; `Left off: ...`; `Errors: N (M in all)`; then, when there are any, the paused sites (`Paused after an error:` with one indented line each) and the blocked calls (`Calls the game blocked from Vanguard:` with one indented line each, ending `(xN)`), as `/vg errors` prints them; then each caught error as `[i] <where>: <file>:<line>: <message>  (xN)` with indented stack lines, and `### end ###`. The skinned, painted and waiting-on-combat counts, the game fonts and the game windows lines are only in `/vg status`.
2. **Record the facts first**, before any fix: the real interface number (the `/vg errors` header, or the second line of the report) and build (the client line) and the `Client has / lacks` line go in the thread's reply and, when they differ from what the repo assumes, in `docs/SMOKE-TEST.md` (the build value) and `Vanguard.toc` (the matching `## Interface` value: 16001 for Forever, and keep the Retail one). An API the client lacks that the addon assumes is an issue on its own.
3. **One issue per distinct error**, not per paste: the `<where>` label and the file and line are the title ("`UnitFrames` target health: Modules/UnitFrames.lua:212 attempt to compare secret"), the body quotes the exact lines and names the smoke-test step. Search issues first (`search_issues` with the file name) and comment on the existing one instead of opening a twin. Label it by the step's crash-risk order in `docs/SMOKE-TEST.md`.
4. **Record the results**: each step Cliff reports goes in `docs/smoke-results.json` as `{ step, build, date, result, note }`, `build` being the paste's Vanguard version and `note` what he saw, in its own small PR; never an entry he did not report. This is the ledger the release gate reads.
5. **A step that passed closes what it was checking**: an issue whose fix was "pending an in-game check" gets a comment citing the ledger entry (step id and the paste's version), then is closed as completed.
6. **A step that failed without an error** (it looks wrong, nothing in `/vg errors`) is a `fix-visual-issue` or `fix-bug` task; ask for `/vg frame <name> deep` in the issue if the paste has none, as a checklist, not a question that blocks.
7. **A batch checklist** (an open issue Cliff names, if there is one) is ticked item by item with the paste's version in the tick's comment, and each item's result goes in the ledger; an item that could not be run is left unticked with why. An API probe's answer (what `type()` returns for a secret, whether addon messages work in instances) goes into the harness or the plan it was blocking, in its own PR, and the issue comment links that PR.
8. **Then the fixes**, highest crash risk first, each by `fix-bug` or `fix-visual-issue`, one branch per issue. A fix for an error only the game showed runs the whole suite locally before it merges, as every PR does.
9. **Reply** with one line per error (issue link, what it is, what is next) and the facts recorded. No fix is claimed as seen; every PR from a report says "Needs in-game check" with the step to rerun.

## The bug log on Cliff's computer

When Cliff says to find, read or pull the logs from his machine, the source is Vanguard's bug log (`Core/BugLog.lua`), not a paste. Nothing here needs him to copy anything.

1. **Where it is**: the account's saved variables, `<WoW folder>\_forever_\WTF\Account\<account>\SavedVariables\Vanguard.lua` (`_retail_` for Retail), the table `VanguardDB.bugLog`; `Vanguard.lua.bak` beside it is the write before. Read it through the device's folder access (the WoW folder is one Cliff approves); list `WTF\Account` first when the account folder's name is not known. The game writes the file only at logout or `/reload`, so if the newest entry is older than what he describes, ask him to `/reload` once and read again.
2. **What an entry holds**: `kind` (`error`, `quiet` for a client call that fell back, `blocked`, `paused`, `note` for a skin left off, `mark` for a bug he noted with `/vg bug` or Note a bug), `text`, `count`, `first` and `last` (his computer's local time), `session`, `version`, `client`, `profile`, `who`, `class`, `level`, `zone`, `instance`, `combat`, `group`, and for an error the top of its `stack`. A detailed kind also has `state` (the `/vg report` head lines without the first, then the group, target, pet and open windows), `layout` (each shown movable frame's size, place and scale, then the ones not shown) and `trail` (what happened just before, oldest first). A `mark` adds `mouse` (the `/vg frame` lines of what the mouse was over) and `errors` (how many this session had kept).
3. **Screenshots**: every `mark`, and an error with `shot = true`, has a file in `<client folder>\Screenshots` named `WoWScrnShot_MMDDYY_HHMMSS` by the same local time as the entry's `first`; read the one whose time matches (a second or two later).
4. **Then triage as a paste**: an entry is a `/vg errors` line with its report already attached, so steps 2 to 9 above apply as they are. Group entries by `version` first: one from an older version than the fix is not a regression. A `mark` with no error near it in the list is a `fix-visual-issue` or `fix-bug` task, and its `mouse`, `layout` and screenshot are the evidence to start from.
5. **Afterwards** tell Cliff which entries became which issue, and that Clear the bug log on the Feedback page empties it once he has read the reply; never edit or delete the file yourself.

## Do not

- Guess at a stack line's cause without reading the function group; the line number in a paste comes from the shipped version, so `git show v<version>:<file>` is the file to read.
- Close an issue because the code changed; only a passed step or Cliff's word closes it.
- Ask Cliff to rerun something before every other step in the paste is recorded.
