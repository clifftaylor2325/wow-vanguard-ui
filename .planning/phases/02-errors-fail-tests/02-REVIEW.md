---
phase: 02-errors-fail-tests
reviewed: 2026-10-10T00:00:00Z
depth: standard
files_reviewed: 84
files_reviewed_list:
  - Core/Controls.lua
  - Core/Dialog.lua
  - Core/ErrorBadge.lua
  - Core/Events.lua
  - Core/Feedback.lua
  - Core/GameMenu.lua
  - Core/Movers.lua
  - Core/OptionsProfiles.lua
  - Core/OptionsWindow.lua
  - Core/Perf.lua
  - Core/Profiles.lua
  - Core/Setup.lua
  - Core/Theme.lua
  - Core/Visibility.lua
  - Core/Widgets.lua
  - Modules/AuctionCrafting.lua
  - Modules/AuctionHelper.lua
  - Modules/AuctionOwned.lua
  - Modules/AuctionSell.lua
  - Modules/AuctionTable.lua
  - Modules/BagSections.lua
  - Modules/Bags.lua
  - Modules/BrokerStrip.lua
  - Modules/CastBars.lua
  - Modules/Chat.lua
  - Modules/ChatExtras.lua
  - Modules/ChatWatch.lua
  - Modules/ClickCastOptions.lua
  - Modules/DataBars.lua
  - Modules/Errands.lua
  - Modules/FightHistory.lua
  - Modules/GameAlerts.lua
  - Modules/GameTools.lua
  - Modules/InstancePrep.lua
  - Modules/Inventory.lua
  - Modules/MenuStrip.lua
  - Modules/Merchant.lua
  - Modules/Minimap.lua
  - Modules/MinimapButtons.lua
  - Modules/Nameplates.lua
  - Modules/QuestDialogView.lua
  - Modules/QuestLog.lua
  - Modules/QuestLogView.lua
  - Modules/QuestTrackerView.lua
  - Modules/RaidStatus.lua
  - Modules/RaidTools.lua
  - Modules/SwingTimer.lua
  - Modules/TalentPlanner.lua
  - Modules/Tooltips.lua
  - Modules/Upgrades.lua
  - Modules/Windows.lua
  - Modules/WindowsMap.lua
  - Modules/WindowsSocial.lua
  - Modules/WindowsSystem.lua
  - Modules/WindowsTabs.lua
  - Modules/WindowsTown.lua
  - scripts/lib/error-guard.mjs
  - scripts/lib/lua-harness.mjs
  - scripts/lib/wow-world.lua
  - scripts/lib/code-quality.mjs
  - scripts/check-code-quality.mjs
  - scripts/tests/setup.mjs
  - scripts/tests/helpers.mjs
  - scripts/tests/errorrail.test.mjs
  - scripts/error-guard.test.mjs
  - scripts/code-quality.test.mjs
  - scripts/link-wow.test.mjs
  - scripts/workflows.test.mjs
  - scripts/lua-engine.test.mjs
  - scripts/tests/auctionapi.test.mjs
  - scripts/tests/auras.test.mjs
  - scripts/tests/core.test.mjs
  - scripts/tests/fallbacks.test.mjs
  - scripts/tests/feedback.test.mjs
  - scripts/tests/frames.test.mjs
  - scripts/tests/more.test.mjs
  - scripts/tests/plates.test.mjs
  - scripts/tests/report.test.mjs
  - scripts/tests/skins.test.mjs
  - scripts/tests/tooltip.test.mjs
  - scripts/tests/README.md
  - vitest.config.mjs
  - .github/workflows/full-suite.yml
  - .github/workflows/lua-suite.yml
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-10
**Depth:** standard
**Files Reviewed:** 84
**Status:** issues_found

## Summary

The phase wraps hook, OnClick and timer callbacks in `ns.Guard` across Core/ and Modules/, adds the
`expectErrors` guard to the test harness, adds code-quality rule 4, and wires a weekly shuffled run.

Every one of the Core/Modules conversions was read in the diff. None of them changed behaviour in a
way that matters:

- **Argument passing.** `ns.Guard` forwards `...` to `ns.Try`, so `self` and hook arguments arrive
  unchanged. The `hooksecurefunc(game, "Show", ns.Guard(..., game.Hide))` forms in Bags.lua and
  DataBars.lua still receive the hooked frame as the first argument.
- **Return values.** The game ignores what post-hooks, OnClick handlers and `C_Timer` callbacks
  return. No converted site used a return value, and `Errands.later` still returns the timer handle.
- **nil OnClick.** `ns.Guard` hands a non-function back unchanged, so `W.Primary(..., nil, ...)` and
  `W.Button(b, "", nil, 56)` still leave OnClick nil.
- **Double wrapping.** A double wrap would be harmless anyway: the inner `ns.Try` catches the error
  and does not rethrow.
- **Hardware-event paths.** `ns.Guard` is a synchronous `xpcall` in the same call stack. The
  PostItem/Post/Buy/Cancel handlers (`hook SetPostItem`, `W.Primary(c, "Post", ...)`) stay in the
  click's stack. No timer wraps a hardware-event action.
- **Labels.** All labels are literals, or `"hook " .. tostring(name)` where `name` is a literal
  function name, or `W.ClickLabel(caption)` where every caller passes a literal caption (the class
  name in ClickCastOptions.lua:627 is not secret). No loop variable or game value reaches a label.
- **Repo rules.** `node scripts/check-code-quality.mjs` passes (documented functions, at most
  10 lines, no colours, rule 4). The new Lua is Lua 5.1 only.
- **Workflows.** The seed step contains no `${{ }}` expression. Shuffle is enabled only by
  `github.event_name == 'schedule'`. Permissions are unchanged (`contents: read`).

The findings below are in the new lint rule, in the interaction of `ns.Guard` with `ns.Try`'s
re-entrancy state, and in limits of the error-guard registry.

## Warnings

### WR-01: Rule 4 reports a false positive for a guarded `C_Timer.NewTicker` with an iteration count

**File:** `scripts/lib/code-quality.mjs:370`
**Issue:** `isBareCallback` takes the callback as `args[args.length - 1]` for every non-OnClick call.
That is right for `After(seconds, fn)` and `NewTimer(seconds, fn)`. `C_Timer.NewTicker(seconds, fn, iterations)`
has the callback second and an optional third argument, so a correctly guarded ticker with an
iteration count is flagged. I reproduced this with `checkSource`:

```
C_Timer.NewTicker(5, ns.Guard("a", fn), 3)  =>  "bare C_Timer.NewTicker callback: wrap it in ns.Guard(...)"
```

The only ticker in the repo (Core/Perf.lua:131) has two arguments, so CI is green today. The first
module to use the third argument will have to work around the lint. `scripts/code-quality.test.mjs`
`timerRule` tests only the two-argument form, so the gap is untested.
**Fix:** Pick the callback by position per kind: index 1 for `OnClick`, `After`, `NewTimer` and
`NewTicker`, and the last argument only for `hooksecurefunc`. Add a test with
`C_Timer.NewTicker(5, ns.Guard("tick", fn), 3)`.

```js
const callback = (call.kind === "hooksecurefunc" ? args[args.length - 1] : args[1]) ?? [];
```

### WR-02: Rule 4 misses aliased `C_Timer.After` and `HookScript("OnClick", ...)`

**File:** `scripts/lib/code-quality.mjs:326-333` (`callbackCall`)
**Issue:** The rule matches only the literal token sequences `C_Timer . After|NewTimer|NewTicker (`,
`SetScript ( "OnClick"` and `hooksecurefunc (`. Two real bare-callback paths pass the lint:

1. A local alias. `Modules/TalentPlanner.lua:502` and `:573` do
   `local after = type(C_Timer) == "table" and C_Timer.After` and then call `after(0, function() ... end)`.
   Both callbacks happen to be wrapped by hand in `ns.Try`, so there is no bug today. I confirmed that
   `local after = C_Timer.After after(1, fn)` and `local ca = C_Timer ca.After(1, fn)` return no
   problem. The next alias with a bare function will go unnoticed.
2. `frame:HookScript("OnClick", fn)` returns no problem, although it is the same class of
   unreported click error as `SetScript("OnClick", ...)`.

The header comment of rule 4 says clicks and timers "run under ns.Guard", which these two cases make false.
**Fix:** Either convert TalentPlanner.lua:502 and :573 to `C_Timer.After(..., ns.Guard("timer talent planner", ...))`
(they hold an already-nested `ns.Try`) and forbid `local x = C_Timer.After` aliases in Core/ and
Modules/ with a one-line token check, or document the alias gap in the rule header. Add
`HookScript` with a first argument of `"OnClick"` to `callbackCall`, with a test.

### WR-03: `ns.Try` clears the re-entrancy flag unconditionally, which `ns.Guard` now makes reachable from inside the game's error handler

**File:** `Core/Events.lua:145-148` (`finished`), used by `ns.Try` at `:152-156` and `ns.Guard` at `:162-167`
**Issue:** `traced` sets `forwarding = true` while the game's handler runs, so an error raised inside
the handler "passes through here silently" (the comment at `:126-133`). But `finished(outer, ...)`
resets `forwarding = false` on every return, including a nested `ns.Try` that completes while the outer
handler is still running. Before this phase few callbacks went through `ns.Try`. Now 124 hook, click
and timer sites do, so any error handler or error-display addon that calls a method Vanguard hooks
(SetPoint on a pinned frame, SetAlpha on a mover frame, `Show`/`Hide` hooks) runs a nested guarded
callback. That nested call clears the flag. A later failure inside the same handler is then recorded
and forwarded again (`traced` -> `record` -> `handler(text)`), instead of being swallowed. Lua's own
C-stack limit bounds the recursion, so this cannot loop forever, but the loop guard no longer holds.
**Fix:** Have `finished` restore the previous flag rather than clearing it:

```lua
function ns.Try(where, fn, ...)
  local outer, wasForwarding = current, forwarding
  current = where
  return finished(outer, wasForwarding, xpcall(fn, traced, ...))
end
local function finished(outer, wasForwarding, ...)
  current, forwarding = outer, wasForwarding
  return ...
end
```

Add a test where a game handler calls a guarded callback and then errors.

### WR-04: `ns.Guard` accepts a wrong call shape silently, and the lint accepts it

**File:** `Core/Events.lua:162-167`, `scripts/lib/code-quality.mjs:355-358` (`isGuarded`)
**Issue:** `ns.Guard(where, fn)` checks only `type(fn) ~= "function"`. A call missing its label,
`ns.Guard(fn)`, makes `fn` nil, so it returns nil and the click, hook or timer is installed with no
callback at all. I confirmed that rule 4 reports no problem for `b:SetScript("OnClick", ns.Guard(fn))`,
because `isGuarded` checks only that the callback starts with `ns.Guard(`. A non-string `where`
that does reach `ns.Try` makes `record` fail on `where .. ": "` inside the message handler.
**Fix:** In `ns.Guard`, return `fn` unchanged for a non-function but treat a non-string `where` as a
programming error:

```lua
function ns.Guard(where, fn)
  if type(where) ~= "string" then error("ns.Guard: first argument is the label", 2) end
  ...
```

In `isGuarded`, require the first argument of the `ns.Guard(` call to be a string token.

## Info

### IN-01: The addon registry is cleared after the first test, so a shared addon is judged once

**File:** `scripts/tests/setup.mjs:30`, `scripts/lib/lua-harness.mjs:430-445`
**Issue:** `afterEach` does `check(createdAddons.splice(0), takeExpected())`. An addon built in
`beforeAll` or at module scope is registered once, judged after the first test of the file, and never
again. Later tests that use it can leave unexpected errors unseen. No test file does this today
(checked: no module-scope or `beforeAll` `createAddon`/`loggedIn`), so it is latent. `scripts/tests/README.md`
says each test builds its addon but does not say that sharing one silently drops the guard.
**Fix:** Add a sentence to `scripts/tests/README.md`. Optionally keep addons registered until the
file ends and keep a per-addon "already judged" count.

### IN-02: Errors dropped by the 20-entry cap are invisible to the guard

**File:** `Core/Events.lua:64-71` (`keep`), `scripts/lib/lua-harness.mjs:434-441` (`HARVEST`)
**Issue:** `HARVEST` copies the entries `ns.ClearErrors` forgets, but `keep` drops the oldest entry
once `#ns.errors > ns.MAX_ERRORS` with no harvest. A test that causes more than 20 distinct errors
and names one of the oldest in `expectErrors` gets "expected but never seen" although the error did
occur. An unexpected error is never missed this way, because the 20 survivors still fail the test.
`report.test.mjs` already notes that its case stays at exactly 20.
**Fix:** Make the HARVEST wrapper also cover `table.remove` in `keep`, or note the 20-error limit in the README.

### IN-03: Hook labels are not unique across sites

**File:** `Modules/Bags.lua:221`, `Modules/BagSections.lua:317`, `Modules/Upgrades.lua:288`, `Modules/WindowsTown.lua:243` (all `"hook UpdateItems"`); `"hook Update"` x3; `"hook Show"` x2; `"hook AddMessage"` x2
**Issue:** `ns.errors` de-duplicates by `label: message`. Errors that carry a file:line (a normal `error`
from addon code) stay distinct. Errors without one (`error(msg, 0)`, or text raised by game code) from
two different sites with the same label collapse into one entry with a higher count, and the chat
notice prints once. `/vg errors` then cannot tell which module failed. This is the failure the
focus section warned about; it is real but only in this narrow case.
**Fix:** Qualify the label with the module where the frame method is generic, for example
`"hook UpdateItems (bags)"`, `"hook UpdateItems (upgrades)"`.

### IN-04: The ChatExtras condition changes are for the harness, not the client

**File:** `Modules/ChatExtras.lua:64`, `:143`
**Issue:** Both changes only add clauses that are always true in the game client, so behaviour there is
unchanged: `type(registry.RegisterCallback) ~= "function"` (EventRegistry is a CallbackRegistry whose
`RegisterCallback` is a function) and `type(hooksecurefunc) == "function"`. They exist so tests that
remove those globals no longer throw. This is production code changed to suit a test environment. It is
consistent with the many `type(hooksecurefunc) == "function"` guards elsewhere, so I do not recommend
changing it. That `EventRegistry.RegisterCallback` is a function on the 12.1 client was not observed
here; mark it for the in-game check list.
**Fix:** None required. List it under "needs in-game check" in the PR.

### IN-05: The workflow test checks only `${{ inputs.` in run scripts

**File:** `scripts/workflows.test.mjs` ("no run script holds an input expression")
**Issue:** The test asserts that no `run:` text contains `${{ inputs.`. It would not catch a
`${{ github.event.* }}`, `${{ github.head_ref }}` or `${{ secrets.* }}` placed in a run script later.
The current scripts are clean (the seed comes from `date +%s`).
**Fix:** Forbid every `${{` inside `run:` text in these three workflows, since every value can be passed
through `env:` instead.

---

_Reviewed: 2026-10-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
