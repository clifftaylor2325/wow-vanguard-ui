# Patterns

The canonical shape of the things CLAUDE.md's rules ask for, each in ten lines or fewer, taken from the code as it is. Copy these rather than the nearest file; when a file in `Modules/` disagrees with this page, this page is right and the file is the one to fix. The rules themselves are in CLAUDE.md; the reasons are in `docs/research/engineering-review.md`.

## A module

```lua
-- Party pets and targets (off until you turn it on): what the player sees, in one paragraph.
local ADDON, ns = ...

local PX = ns.Module("PartyExtras", { defaults = { show = false } })

-- Module entry point (Core/Modules.lua): built out of combat, and only when switched on.
function PX.Enable(settings)
  if settings.show then ns.OutOfCombat(build) end
end
```

`ns.Module` registers the name and defaults; `Enable(settings)` gets the profile's table with defaults filled in. Functions the module exports hang on `PX`; everything else is `local`. The file is listed in `Vanguard.toc` after any module it calls `ns.GetModule` on at load time.

## A guarded callback

```lua
-- Sells the junk again after a moment, up to `tries` times.
C_Timer.After(MC.RETRY_AFTER, ns.Guard("timer sell junk", function() MC.SellJunk(tries - 1) end))

-- The same for a hook on a game function, a click, or a script on a frame.
hooksecurefunc("CloseMerchant", ns.Guard("hook close merchant", MC.Closed))
button:SetScript("OnClick", ns.Guard("click sell", MC.Sell))
frame:HookScript("OnShow", ns.Guard("show window", GW.Light))
```

A callback the game reads a result from (a chat filter) uses `ns.GuardResult(where, fn, fallback)` instead: it hands back `fn`'s results, or `fallback` (`false` for a chat filter, so the line goes through) when `fn` fails. Callbacks the game calls from its own code (`ChatFrame_AddMessageEventFilter`, `TooltipDataProcessor.AddTooltipPostCall`, `EventRegistry:RegisterCallback`) are guarded the same way as hooks.

`ns.Guard(where, fn)` runs `fn` under `ns.Try`, so a failure is kept for `/vg errors`, printed once, and handed to the game's error handler, and the other callbacks still run. The `where` text is the site name a tester will paste. Event handlers through `ns.On` are guarded already.

## State for a game frame

```lua
-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")

-- Paints a game tooltip once; later calls are no-ops.
local function skin(tip)
  if vgSkinned[tip] then return end
  vgSkinned[tip] = true
  T.Panel(tip)
end
```

Never `tip.vgSkinned = true`: a field on a frame the game made taints it, and the harness fails the test. The side table has weak keys, so a frame the game drops is forgotten. Replace a game frame's script with `HookScript`, never `SetScript`.

## A read that may be secret

```lua
-- The quest's reward XP as a plain number, or 0 when the client hides it or lacks the call.
function DB.RewardXP(id)
  if type(GetQuestLogRewardXP) ~= "function" then return 0 end
  local xp = ns.PlainNumber(GetQuestLogRewardXP(id))
  return xp and xp > 0 and xp or 0
end
```

`ns.PlainNumber` returns the number or nil, never a secret; compare only after it. `ns.IsTrue(v)` is true only for a plain `true` (a hidden value counts as no), so `ns.IsTrue(C_QuestLog.IsComplete(id))` is safe to test. For any other boolean or a string, `ns.IsSecret` first. A secret may be handed to a widget (`bar:SetValue(v)`), not computed with. Unknown is never "readable": a call that errors counts as hidden.

Truthiness is a test too: `if v then`, `not v`, `a or b` and `a and b or nil` all test `v`, and the client raises an error when addon code tests a secret that way, so none of them is safe on a value that may be secret. Read the call into a local, check `ns.IsSecret` (or `ns.IsTrue`, `flag`) first, and only then test or default it; `type(fn) == "function" and fn(unit)` is fine because the test is on `type(...)`, not on the result. Pass the raw value to a widget. The harness cannot catch this (a harness secret is a table, always truthy, and Lua has no `__bool`), so review for it by eye: grep for `or nil`, `or "` and `and ... or` on the direct result of a `Unit*` call.

## Work that must wait for combat to end

```lua
-- Rebuilds the bar's buttons now, or as soon as the fight ends; a second call before then replaces the first.
function AB.Rebuild(bar)
  ns.OutOfCombat(function() rebuild(bar) end, "rebuild " .. bar:GetName())
end

-- From a PLAYER_REGEN_DISABLED handler (the lockdown has not started yet, so OutOfCombat would run at once):
ns.On("PLAYER_REGEN_DISABLED", function() ns.AfterCombat(AB.HideHandles, "hide handles") end)
```

The key makes repeated calls collapse into one. Anything that calls `Show`, `Hide`, `SetPoint`, `SetSize` or `SetAttribute` on a protected frame goes through this; the harness blocks the call in combat and fails the test.

## Events and timers

```lua
ns.On("PLAYER_TARGET_CHANGED", UF.UpdateTarget)                 -- one shared frame; handlers run under ns.Try
local sub = ns.OnUnit({ "UNIT_HEALTH", "UNIT_MAXHEALTH" }, UF.UpdateHealth, "player", "target")
ns.Every("action bar range", 0.2, function() each(updateRange) end) -- one shared OnUpdate; stops when unregistered
ns.Soon("layout", relayout)                                      -- once, on the next frame, however often asked
```

No module makes its own event frame or its own `OnUpdate` loop. An event the client lacks is skipped and reported, not raised.

## Text a player reads

```lua
local L = ns.L                                                   -- once per file, beside `local ADDON, ns = ...`
fs:SetText(L["Experience bar"])                                  -- the English is the key; untranslated, it reads as itself
ns.Chat(ns.Format(L["{count} items sold for {money}"], { count = n, money = m })) -- named slots, never "..." .. n .. "..."
```

Every label, tooltip line, chat line and dialog text goes through `L[…]`, one whole sentence per key, so a translator can reorder it. Names the game supplies (spells, items, zones, classes) come from the client already translated and never go through `L`; nor do slash command verbs (a `/vg help` entry is `{ "syntax", L["what it does"] }`), saved-variable keys and the names saved under them (profile and preset names), profile strings, or the diagnostics pasted into a bug report: `/vg probe`, `/vg perf`, `/vg mem`, `/vg status`, `/vg report`, the `/vg errors` text, `/vg frame`, `/vg realm` and `/vg factionart`. Translations live in `Locales/<locale>.lua`, written by `node scripts/i18n.mjs import` from a reviewed CSV, never by hand.

Leave room for a translation about a third longer than the English. A label on a button is fitted (`T.FitText(fs, button)`: one line, shrinking a little when it runs long); a line in a window either has a width and wraps, with room kept below it for the lines it may take, or sits where nothing is beside it. `scripts/tests/textfit.test.mjs` opens the windows with every string a third longer and fails on text cut short, running out of its frame, or drawn over other text or a control.

## A setting that changes shape

```lua
-- 0.6.0: `showPets` became `pets` (a number of rows, 0 for off).
ns.Migrate("PartyExtras", function(saved)
  if saved.showPets ~= nil then saved.pets, saved.showPets = saved.showPets and 4 or 0, nil end
end)
```

`ns.Settings` fills defaults by type: a saved value of the wrong type is replaced by the default, silently. So a setting never changes type without a migration, and the migration runs before the defaults are filled.

## A harness scenario

```js
it("a buff on the player shows its icon in the player auras, and goes with the buff", () => {
  const addon = loggedIn();
  const icons = () => addon.frames('w.__kind == "Texture" and w.__texture == "TEST-ONLY-ICON-Arcane Intellect" and w:IsVisible()');
  addon.world.addAura("player", { name: "Arcane Intellect", duration: 3600, sourceUnit: "player" });
  expect(icons().length, "one icon, inside the player auras").toBe(1);
  addon.world.removeAura("player", "Arcane Intellect");
  expect(icons().length).toBe(0);
});
```

Set up the world, act as the player, inspect what was drawn. See `.claude/skills/add-harness-scenario/SKILL.md`.

## Things the rules do not say but the code assumes

- `pairs` order is undefined; anything the player sees sorted is sorted explicitly. The harness iterates like Lua 5.3, the game like 5.1, so a test can pass by luck.
- No allocation in `OnUpdate`, `UNIT_AURA` or `UNIT_HEALTH` handlers: reuse tables, format text only when the value changed. `npm run bench` measures a 40-player raid.
- `select("#", ...)` to count varargs, never `#{...}`.
- `error(msg, 2)` so the stack points at the caller; a bare `pcall` that swallows an error is only right when the error is the answer (an API probe).
- Frames are never garbage collected: a frame made in response to an event is a leak unless it is pooled.
- `string.format("%d", x)` truncates a float in 5.1 and errors in 5.3; the harness shims this, but prefer `math.floor` where the value can be fractional.
