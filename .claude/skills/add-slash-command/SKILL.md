---
name: add-slash-command
description: Add or change a /vg command in Vanguard, with its handler, HELP line, COMMANDS.md line, test and smoke-test step. Use when a task asks for "/vg something" or changes what an existing command prints.
---

# Add a /vg command

Every command lives in `Core/Slash.lua`: a `HELP` line near the top, a handler in `COMMANDS` below. `/vg` with no arguments opens the options window; anything else runs under `ns.Try("slash <cmd>", handler, rest)`, so an error in a handler is caught and listed by `/vg errors`.

## Steps, in order

1. **Read** `Core/Slash.lua` in full (the `chat`, `printLines` and `COMMANDS` shapes) and the word-for-word reference at the end of `docs/COMMANDS.md` (`/vg help` text and that reference stay word for word the same).
2. **The handler**: `name = function(rest) ... end` in `COMMANDS`, 10 lines with its comment, the key lower case. It parses `rest` itself (`rest:match(...)`), prints with `chat(...)` (one line) or `printLines({...})`, and never touches a protected frame in combat (`ns.OutOfCombat` if it must). A command that belongs to a module calls `ns.GetModule("<Name>").Command(rest)` so the module owns the logic and the command stays a thin entry. The handler is not wrapped in its own `pcall` or `ns.Try`; `handleSlash` already does that.
3. **The HELP entry**: `{ "<name> <args>", L["what it does, in player language"] }`: the syntax as typed (never translated) and the description through the string table; `/vg help` lines the syntax up in one column. Same order as the reference in `docs/COMMANDS.md` ("Every command, word for word"); the reference line is the syntax and the description with the same words. Every chat line the command prints goes through `L[…]` too, with `ns.Format` for values (`docs/PATTERNS.md`, "Text a player reads").
4. **Unknown-argument behaviour**: a wrong argument prints a one-line hint that names the right forms (`/vg preview [party|10|25|40|off]`), never an error.
5. **The test** in `scripts/tests/core.test.mjs` (commands) or the area file: `addon.slash("<name> <args>")`, then assert on `addon.chat()` (the lines printed) and on the state the command changed. A command that can fail names its error with `expectErrors("slash <name>: <text>")`. Nothing compares the HELP and reference lines for you; read both back after editing and keep them identical.
6. **Docs in the same commit**: the reference line in `docs/COMMANDS.md` (and a table row there), a `docs/SMOKE-TEST.md` sub-step that types the command and says the exact output, and a `Core/WhatsNewNotes.lua` line if players will care.
7. **Check**: `npm run test:quick` while iterating; `npm run quality` and `npm run coverage` once.

## Do not

- Add a second slash prefix; `/vg` and `/vanguard` are the two, and `/fui` is a migration note only.
- Print a secret value, or a count made from one; `/vg status` shows "hidden right now" for those on purpose.
- Make a command that reloads the UI from chat: WoW Forever reloads only from a secure button click (see the Options section of `docs/features/options-and-setup.md`).
