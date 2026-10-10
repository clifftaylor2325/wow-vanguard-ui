---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
# Coding Conventions

**Analysis Date:** 2026-10-09

## Naming Patterns

**Files:**
- Addon Lua is PascalCase, one feature per file: `Core/Events.lua`, `Core/OptionsWindow.lua`, `Modules/Tooltips.lua`.
- Files that belong to one area share a prefix: `Modules/Auction*.lua`, `Modules/Quest*.lua`, `Modules/Raid*.lua`, `Modules/Windows*.lua`, `Modules/ClickCast*.lua`. Example: `Modules/QuestDialog.lua` with `Modules/QuestDialogParts.lua` and `Modules/QuestDialogView.lua`.
- Tests are lowercase, one per area: `scripts/tests/auction.test.mjs`, `scripts/tests/windows-social.test.mjs`. Shared helpers are `scripts/tests/helpers.mjs`.
- Harness code is `scripts/lib/wow-*.lua` (test-only) and `scripts/lib/*.mjs`.

**Functions:**
- Module-level functions are `local function camelCase()` (`local function chatPrefix()` in `Core/Events.lua`, `local function skin(tt)` in `Modules/Tooltips.lua`).
- Public functions hang off the namespace: `function ns.Chat(msg)` (`Core/Events.lua`), `function TT.ApplyFonts()` (`Modules/Tooltips.lua`). Module methods use the module's local table name (`TT`, `AP`).
- Test case callbacks are plain sentences: `it("the addon loads, logs in, unlocks and locks its frames, and catches no error", ...)` (`scripts/tests/smoke.test.mjs`).

**Variables:**
- Locals are camelCase (`local byText`, `local forwarding`, `local watchers` in `Core/Events.lua`).
- Module handle is a short uppercase local: `local T = ns.Theme`, `local TT = ns.Module("Tooltips", {...})`.
- Constants are SCREAMING_SNAKE on `ns`: `ns.MAX_ERRORS = 20`; table constants in module tables: `TT.NAMES`, `TT.MORE_NAMES`.
- Every addon file opens with `local ADDON, ns = ...`. The unused `ADDON` is allowed by `.luacheckrc` (`ignore = { "211/ADDON" }`).

**Types and tables:**
- Module defaults are declared once in `ns.Module(name, { defaults = {...} })` (`Modules/Tooltips.lua`), keyed by camelCase option names (`classBorder`, `hideInCombat`).
- Saved data lives in the `VanguardDB` and `VanguardCharDB` globals (listed in `.luacheckrc` `globals`).

## Code Style

**Formatting:**
- `.editorconfig`: LF line endings, UTF-8, final newline, 2-space indentation, trailing whitespace trimmed (not in `*.md`).
- Lua has no enforced formatter config in the repo (no stylua config found). Match the surrounding file.
- Lua: 2-space indent, `local function` with a comment above it, `end` on its own line.
- Long lines are common in Lua (`.luacheckrc` sets `max_line_length = false`). JS test lines run long too.

**Linting:**
- `luacheck` via `.luacheckrc`: `std = "lua51"`, `exclude_files` covers `node_modules/`, `scripts/`, `Libs/`.
- Every WoW global the addon reads must be added to `read_globals` in `.luacheckrc`, and addon globals to `globals`. A missing `local` fails luacheck.
- `npm run lint` runs `luacheck .` only when luacheck is installed.
- Code-quality rules are enforced by `npm run quality` (`scripts/check-code-quality.mjs`, rules in `scripts/lib/code-quality.mjs`):
  1. Function bodies are at most 10 lines of code. Blank, comment-only, signature and closing lines don't count. Nested functions count toward the parent. Test case callbacks are exempt.
  2. Every named function has a comment on the line directly above it. A run of one-line accessors may share one comment.
  3. `Core/` and `Modules/` write no color numbers and no font sizes. Colors and sizes come from `Core/Theme.lua` through `T.RGB`, `T.Color`, `T.Text` or theme tokens.

**Hard rules (from CLAUDE.md):**
- Lua 5.1 only: no `goto`, no `//`, no integer division, no 5.3+ bit library.
- Add a method to `scripts/lib/wow-widget-api.lua` only after confirming it exists in the 12.1 client.
- `Libs/` (LibStub, CallbackHandler-1.0, LibSharedMedia-3.0) is never edited.
- `Media/` is generated: change `scripts/lib/media-sources.mjs` and run `npm run media`. Never hand-edit.
- Every file the game loads is listed in `Vanguard.toc`. Top-level files players don't need go in `.pkgmeta` `ignore`.

## Comments

**Function comments (required):**
Every function has a one-line comment directly above it, phrased as a plain description of what it does or returns. Examples:

```lua
-- Prints one line to the default chat frame, prefixed with the addon name.
function ns.Chat(msg)
```

```lua
-- Tells every watcher how many errors are kept now.
local function tellWatchers()
```

```lua
-- Length of a Lua long bracket opener ("[[" or "[==[") at i, or -1.
function longBracketLevel(src, i) ...
```

**File header comments:**
Each file opens with a comment block describing its purpose, the design decision behind it and any client caveat. Examples: `Core/Events.lua` (one event frame for the addon), `Modules/Tooltips.lua` (the Vanguard look, and why item text is never read).

**Inline comments:**
- Used for why, not what: `-- Target of target identity and the minimap's still-standing check (P1.13).`
- Feature or task IDs appear in comments (`P1.13`, `P2.3`) to tie a config entry or global to its plan.

**JSDoc/TSDoc:** Not used. JS files use `//` comments above exports, as in `scripts/tests/helpers.mjs`.

## Function Design

**Size:** Hard limit of 10 lines of body code. Split helpers into `local function` units rather than growing a function. `Core/Events.lua` shows the pattern: `errorsChanged()` and `tellWatchers()` are each a few lines.

**Parameters:** Positional for 1-3 arguments. Option tables for many (`ns.Module(name, { defaults = ... })`, `createAddon({ savedVariables })`).

**Return values:** Lua returns plain values or `nil`. Callers check for nil (`hasSpellbook()` then `ns.Try(...)`). JS helpers return values directly (`tok(addon, name)` returns an `[r, g, b, a]` array).

**Guards:**
- Optional client APIs are checked before use: `if DEFAULT_CHAT_FRAME then`, `if ns.Soon then ns.Soon(...) end`, `local T = ns.Theme; return T and T.Paint(...) or ...`.
- Optional globals are looked up at call time, not cached at load: "Every client call is looked up when used" (`Modules/Tooltips.lua`).

## Error Handling

**Pattern: catch and report, never silently drop.**
- Wrap risky work with `ns.Try(label, fn, ...)`. It returns the result and records failures in `ns.errors` (`Core/Events.lua`). Examples: `ns.Try("nameplate click area", plate.SetAllHitTestPoints, plate, f.hit)` in `Modules/Nameplates.lua`, `ok, items = ns.Try("ClickCast spellbook", bookItems)` in `Modules/ClickCastSpells.lua`.
- `ns.Report` keeps one entry per distinct error text (count and first stack), prints the first occurrence to chat once per session, and forwards to the game's error handler.
- `ns.errors` is capped at `ns.MAX_ERRORS = 20`. The user can inspect and clear it with `/vg errors`.
- Secret values are never read or compared: check `ns.IsSecret(v)` first, and use `ns.PlainNumber` for numbers that might be hidden (`Core/Auras.lua`, `Core/Combat.lua`).

**Game state guards:**
- Protected actions are guarded with `ns.OutOfCombat` (CLAUDE.md "Game rules").
- Forever is detected by interface version with `ns.IsForever`, not by checking for a global.

**Test-facing errors:** A Lua error in a test throws in JS with the addon file and line. Errors the addon catches land in `ns.errors`, and tests assert `#ns.errors` is 0 (`scripts/tests/smoke.test.mjs`).

## Logging

**Framework:** None. `ns.Chat(msg)` prints to `DEFAULT_CHAT_FRAME` with the accent-colored "Vanguard:" prefix. `ns.Report` is the path for caught errors.

**Patterns:**
- Player-facing output goes through `ns.Chat`, never `print`.
- Errors go through `ns.Try` or `ns.Report`, not `print`.
- Chat lines are asserted in tests with `addon.chat()` or `chatHas(addon, re)`.

## Module Design

**Module creation:**

```lua
local TT = ns.Module("Tooltips", {
  defaults = { anchor = "corner", classBorder = true, targetLine = true },
})
```

Modules register with `ns.Module`. Events subscribe with `ns.On`, not their own frames (`Core/Events.lua` header: "One event frame for the whole addon").

**Exports:**
- Cross-module access goes through `ns.GetModule("Minimap")` or the module table on `ns`. Example in `scripts/tests/README.md`: `ns.GetModule('Minimap').frame`.
- Public API for other addons: `Vanguard.API.v1` (`Modules/AuctionAPI.lua`) and the skin API (`Core/Skin.lua`, documented in `docs/API.md`).

**Barrel files:** None. Each `Core/` and `Modules/` file is loaded directly, listed in `Vanguard.toc`.

**JS (scripts and tests):** ES modules (`import` / `export`), `.mjs` extension, named exports for helpers (`export const tok`, `export function loggedIn`).

## Theme and Visual Rules

- Colors: `T.RGB("token")`, `T.Color(...)`, `T.Paint("text", "accent")` only. Tokens live in `Core/Theme.lua`.
- Font sizes and roles: `T.Text(...)` from `Core/Theme.lua`.
- Fades never exceed 0.15 s in combat. Motion and sounds respect the Reduce motion and Interface sounds switches. Every fade and sound is listed in `docs/THEME.md`; update it when adding one.

## Naming in Text

- Use "Vanguard" in code, docs and player text. "ForeverUI" and "/fui" appear only in migration notes.
- Slash commands: `/vg` and `/vanguard`.

---

*Convention analysis: 2026-10-09*
