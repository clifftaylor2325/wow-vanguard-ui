# Module lifecycle: dependencies, teardown and late enable (design note, A4-1)

Status: **approved by Cliff on 2026-11-10: every recommendation in 5.3 (Q1 to Q11) as recommended.** Written 2026-11-09 against `48966bb` (0.9.5 notes merged); counts corrected on 2026-11-10 against `eaff8c5`. Plan task A4-1 in `docs/handoff/A-GRADE-PLAN.md`; review items B1 and M9, sections 3.1 ("Module system and lifecycle"), 5.1 and 5.8 of `docs/handoff/VANGUARD-REVIEW-2026-11-09.md`. Nothing here was checked in the game. Counts come from reading and grepping the Lua at that commit; a sibling thread (live apply for the minimap, info strip, chat, raid frame sizes) may move a few of them before this lands.

## 0. The short version

- Today the registry builds modules at login and never takes one down (`Core/Modules.lua:118-127`). Of 74 modules, 4 have a `Disable`, and each of those only stops part of what it does.
- Proposal: each module gets a **scope**, an object the registry owns and passes to `Enable(settings, scope)`. Events, unit events, tickers, listeners, hooks, frames and movers registered through it are released by the registry when the module goes off. Hooks can't be removed, so they stay installed and do nothing while the module is off.
- Modules declare `requires = { ... }` and either `live = true` or `reload = L["why"]`. A module that declares neither stays reload-only, as today. Nothing changes behaviour until a module is converted.
- Every switch, whether a module going on or off or a module being rebuilt, runs out of combat. A switch made in a fight waits for the fight to end.
- Classification of the 74 modules (three were retired after this was written: Pet stable, Legacy helper and Boss docks, all from the first class): **22** toggle live with the scope alone, **29** with a small `Disable`, **23** stay reload-only for a stated reason. Module rows tagged "Reload to apply" go from 74 to 23. Setting rows tagged "(reload)" go from 68 to about 49 on WoW Forever. That does not reach the plan's target of 15 or fewer; section 5 says what else would be needed.
- Live profile switching (A4-4) runs on top of this, but only when no reload-only module's switch or settings differ between the two profiles. Otherwise it is staged as today, and the dialog names the modules that are waiting.
- Eleven decisions for Cliff are listed at the end.

## 1. What exists today

### 1.1 Registration and enable

- `ns.Module(name, def)` stores the table and the load order. A module for another client is never registered (`Core/Modules.lua:57-63`, `ns.ClientAllows` at `:38-40`).
- At `PLAYER_LOGIN`, every module that is switched on gets `Enable(settings)` under `ns.Try`, in TOC order. `def.enabled` records whether that call succeeded (`Core/Modules.lua:109-127`). Modules that are off get `def.enabled = false`.
- `ns.SetModuleEnabled(name, on)` writes the flag. When the module is turned off and has a `Disable`, it calls it (`Core/Modules.lua:102-106`). Turning a module on mid-session does nothing until a reload.
- `ns.ModuleLive(name)` reports whether a module was built this session (`Core/Modules.lua:91-96`). Six call sites use it.
- Dependencies exist only as prose in the Modules page captions: "Needs Unit frames" (FrameAuras, ComboPoints, ClassBars, PowerTicks, UnitExtras), "Needs Raid frames" (RaidAuras, RaidHealing, RaidStatus), "Needs Minimap" (MinimapButtons) (`Core/Options.lua:367-403`). Code reaches other modules by name 392 times (`ns.GetModule`, Core and Modules; `ns.GetModule("Windows")` 29, `"QuestTracker"` 25, `"InfoStrip"` 24, `"UnitFrames"` 22, and so on). Most of those calls are to helper functions, not checks that the other module is on.
- The four existing `Disable` functions only stop part of the module. `Modules/Bags.lua:110` puts the bag layout CVar back, but the window skin stays. `Modules/ChatFilter.lua:420` and `Modules/ChatHistory.lua:270` set an `active` flag to false. `Modules/Quiet.lua:245` sets a flag and puts the camera back, and its hooks stay installed but idle.
- The UI is honest about this. Every module row wears "Reload to apply" (`Core/Options.lua:480-484`, tag text at `Core/OptionsWindow.lua:353`). A setting row whose English caption ends in " (reload)" gets the tag and a tip line (`Core/OptionsWindow.lua:567-592`), and its setter calls `O.NeedReload()` (`Core/Options.lua:60-63`). Once that is set, the footer's reload notice stays for the session, even if the player changes the switch back (`Core/OptionsWindow.lua:1102-1105`).

### 1.2 What a module creates, and whether it can be undone today

Counts are for `Modules/*.lua` (Core adds 46 `ns.On` of its own).

| What | API | Count | Undo today |
| --- | --- | --- | --- |
| Event handlers | `ns.On` (`Core/Events.lua:537`) | 238, of which 37 sit at file scope | `ns.Off` exists (`:549`); 2 calls in Modules |
| Unit events | `ns.OnUnit` (`:608`): one frame per subscription | 24 | `ns.SetUnits(sub, nil)` unregisters (`:589`); the frame itself is never freed |
| Tickers | `ns.Every(key, ...)` (`Core/Ticker.lua:83`) | 41 | `ns.Every(key, nil)` stops one |
| Theme and scale listeners | `T.OnChanged`, `T.OnScale` (`Core/Theme.lua:3339`, `:688`) | 33 | none: append-only lists |
| Mover listeners | `ns.OnMoverPlaced` (`Core/Movers.lua:250`) | 4 | none |
| Tooltip item lines | `TT.AddItemLines` (`Modules/Tooltips.lua:328`) | 7 | none |
| Raid tile hook lists | `table.insert(RF.updateHooks, ...)` and others | 13 | none (could be removed by hand) |
| Quest card painters | `ns.QuestParts.OnPaintCard` (`Modules/QuestDialogParts.lua:242`) | 1 | none |
| Chat filters | `ns.AddChatFilters` | 3 | the game has a remove call; Vanguard never uses it |
| Hooks on game functions and methods | `hooksecurefunc` | 105 | **impossible**: no API removes a secure hook |
| Script hooks on game frames | `:HookScript` | 125 | **impossible** the same way |
| Own frames | `CreateFrame` | many | can be hidden; **never freed** (the client has no destroy) |
| Movers | `ns.Mover` (`Core/Movers.lua:221`) | 36 | none: no release; `ns.ResetMovers("all")` drops the saved spots of unregistered movers only |
| Visibility and Calm drivers | `V.ApplyState`, `V.ApplySecureNow`, `V.Track`, `V.Calm` (`Core/Visibility.lua:261-341`) | 11 modules | none (`UnregisterStateDriver` is never called) |
| Secure frames of its own | secure templates, `SetAttribute` | 40 sites in 9 modules | can be hidden out of combat; never freed |
| Game frames hidden for good | `UF.HideBlizzard` (`Modules/UnitFrames.lua:813-823`), plus the same code in RaidFrames and ActionBars | 7 modules use the helper | **impossible in practice**: see 1.3 |
| Game windows restyled | `GW.Skin`, `GW.FadeWindowArt` (`Modules/Windows.lua:229`, `:394`) | about 150 windows | **impossible in practice**: see 1.3 |
| CVars and globals written | `SetCVar`, `DAMAGE_TEXT_FONT`, chat tab alphas, `SlashCmdList` | a handful | some reversible (Bags, Quiet), some read once by the engine |

### 1.3 What cannot be undone in a session, and why

1. **Hooks on game code.** `hooksecurefunc` and `HookScript` have no inverse. Replacing a game function or script to "unhook" would taint it, and CLAUDE.md forbids `SetScript` on the game's frames. So a hook stays installed for the session, and the most it can do is go inert by checking a flag.
2. **Game frames with all their events unregistered.** `hideBlizzard` calls `f:UnregisterAllEvents()`, then parks the frame under a hidden parent and hooks `UpdateShownState` and `SetParent` to keep it there (`Modules/UnitFrames.lua:775-823`). The same happens in RaidFrames (`:755`) and ActionBars (`:793`). It is used by UnitFrames, CastBars, PlayerAuras, SwingTimer, InfoStrip (durability, clock, calendar button), Minimap and QuestTracker (the game's objective tracker). The client has no call that lists which events a frame had. Re-registering a guessed set from addon code would also be untested ground for taint. So bringing such a frame back means a reload.
3. **Restyled game windows.** A skin fades the window's art to alpha 0 and post-hooks `SetAlpha` to keep it there (`Modules/Windows.lua:419`). It also lays panels over the window and changes fonts. Undoing that would mean recording every region's previous state for about 150 windows, the tooltips (`Modules/Tooltips.lua`), the chat frames (`Modules/Chat.lua`), the recycled chat bubbles (`Modules/ChatBubbles.lua`), the bag windows, the game's Cooldown Manager and alerts. That is not worth it.
4. **Frames taken from someone else.** Minimap reparents and masks the game's `Minimap` (`Modules/Minimap.lua:381`, `:416`). MinimapButtons reparents other addons' buttons into its drawer (`:80`). MenuStrip reparents the micro menu buttons (`:188`). SpecialBars restyles and moves the game's pet, stance and vehicle-exit buttons. AuctionHelper inserts its tabs into the game's auction window tab list (`Modules/AuctionHelper.lua:317`, `:352`). Putting these back means knowing and restoring the previous parent, points and tab state of frames whose owners may have moved them since.
5. **Secure state on other frames.** ClickCast writes its bindings into secure attributes and wrap scripts on unit and raid frames it does not own (`Modules/ClickCast.lua:648-658`). ActionBars and RaidFrames own secure headers that are tied into Edit Mode and the game's bars. Any of this can be changed only out of combat, and a half-undone binding set is worse than none.
6. **Values the engine reads once.** The damage-number font path (`Modules/HudText.lua:51`) is read when the world loads. Waypoints puts its `/way` handler in the game's slash table (`Modules/Waypoints.lua:284`), which the chat box caches.
7. **Combat.** Anything protected waits for the fight to end. This means the visibility drivers on secure frames, hiding a protected frame, and every secure header. This limits when a switch can happen, not whether it can.

### 1.4 Profiles today

- A switch is staged in `VanguardCharDB.pendingProfile` and applied before modules read their settings at the next load (`Core/DB.lua:253-277`). The running modules keep the old profile's tables until then, so a drag or an accent change still lands in the profile on screen.
- On WoW Forever an addon cannot call `ReloadUI()`. The reload button is a secure overlay running a `/reload` macro on a real click (`Core/Dialog.lua:4-6`, `:523-548`). A reload always costs the player a click and a loading screen, and the addon can never do it for them.

## 2. The proposed design

### 2.1 What a module declares

```lua
-- A module that switches off and on live, with nothing it must undo by hand.
local GT = ns.Module("GroupThreat", { defaults = { show = false }, live = true })

-- One that lives on the unit frames: off whenever they are, built after them.
local FA = ns.Module("FrameAuras", { defaults = DEFAULTS, live = true, requires = { "UnitFrames" } })

-- One that can't: the reason is the tip of its switch and the line the options window shows.
local UF = ns.Module("UnitFrames", { defaults = DEFAULTS,
  reload = L["It replaces the game's own unit frames, which only come back with a reload."] })

-- One that goes off live except for one thing, which it says.
local HT = ns.Module("HudText", { defaults = {}, live = true,
  afterOff = L["Damage numbers keep Vanguard's font until you reload."] })
```

- `requires` names hard dependencies: the module needs the other one's frames on screen. Code that only calls another module's helpers (the info strip's `Money` formatter, `TT.AddItemLines`) is not a dependency in this sense. Moving those helpers into Core is A4-6's business.
- Without `live` or `reload`, a module is reload-only, as today. That is the safe default for every module not yet converted.

### 2.2 The scope

There is one scope per module per session. The registry creates it on the module's first start and keeps it, so gates and spare unit frames survive a stop. `Enable` gets it as a second argument. Modules not yet converted ignore it.

```lua
-- Calls fn(event, ...) while the module runs. The scope keeps a wrapper of its own, so ns.Off takes off
-- only this module's handler, and a handler paused by the error budget starts over after a restart.
function Scope:On(event, fn)
  local key = event .. "\0" .. tostring(fn)
  if self.handlers[key] then return end
  local wrapped = function(...) return fn(...) end
  self.handlers[key] = { event, wrapped }
  ns.On(event, wrapped)
end

-- As ns.OnUnit, on a spare subscription frame when the scope has one (the client never frees a frame).
function Scope:OnUnit(events, fn, unit1, unit2, unit3)
  local sub = ns.OnUnit(events, fn, unit1, unit2, unit3, table.remove(self.spare))
  self.subs[#self.subs + 1] = sub
  return sub
end

-- As ns.Every; the key is stopped when the module stops.
function Scope:Every(key, seconds, fn, frame, now)
  self.tickers[key] = true
  ns.Every(key, seconds, fn, frame, now)
end
```

For a registration that can't be taken back (a hook, a theme listener, an item-line provider, a raid tile hook list), the scope hands out a **gate**. A gate is one function per key, made once per session, that calls the module's latest `fn` while the module runs and does nothing otherwise. `install` runs only the first time, so a restart never doubles a hook.

```lua
-- The gate for key, installed once a session with install(gate); fn is the one a running module gets.
function Scope:Gate(key, fn, install)
  self.latest[key] = fn
  if self.gates[key] then return self.gates[key] end
  local gate = function(...) if self.on then return self.latest[key](...) end end
  self.gates[key], self.gateCount = gate, self.gateCount + 1
  install(gate)
  return gate
end
```

The calls modules already make fit `install` as they are:

```lua
scope:Gate("theme", R.Paint, T.OnChanged)
scope:Gate("item lines", IV.AddLines, ns.GetModule("Tooltips").AddItemLines)
scope:Gate("tile update", update, function(gate) table.insert(RF.updateHooks, gate) end)
scope:Gate("anchor", TT.Anchor, function(gate) hooksecurefunc("GameTooltip_SetDefaultAnchor", ns.Guard("hook anchor", gate)) end)
scope:Gate("pane shown", CE.PaintAll, function(gate) pane:HookScript("OnShow", ns.Guard("character extras", gate)) end)
```

Frames and movers are recorded so the registry can put them away:

```lua
-- A frame of the module's own: hidden, and its visibility and Calm drivers released, when the module stops.
function Scope:Frame(f)
  self.frames[#self.frames + 1] = f
  return f
end

-- As ns.Mover, and the frame is the scope's: its handle leaves unlock mode when the module stops
-- (the saved spot stays in the profile, so it comes back where it was).
function Scope:Mover(f, key, label, default)
  self.movers[#self.movers + 1] = key
  return ns.Mover(self:Frame(f), key, label, default)
end
```

When the module stops, `Close` releases all of it in one place. It always runs out of combat (2.6).

```lua
-- The module stopped: its handlers off, unit frames spare, tickers stopped, gates shut, frames hidden
-- with their drivers released, and its movers out of unlock mode.
function Scope:Close()
  self.on = false
  for _, h in pairs(self.handlers) do ns.Off(h[1], h[2]) end
  for _, sub in ipairs(self.subs) do ns.SetUnits(sub, nil) self.spare[#self.spare + 1] = sub end
  for key in pairs(self.tickers) do ns.Every(key, nil) end
  for _, f in ipairs(self.frames) do ns.Visibility.Release(f) f:Hide() end
  for _, key in ipairs(self.movers) do ns.ReleaseMover(key) end
  self.handlers, self.subs, self.tickers, self.frames, self.movers = {}, {}, {}, {}, {}
end
```

Core needs three small additions for this: an optional spare frame as a sixth argument to `ns.OnUnit`; `ns.ReleaseMover(key)` in `Core/Movers.lua`, which takes the key out of the unlock list, hides its handle and keeps its saved entry; and `V.Release(frame)` in `Core/Visibility.lua`, which calls `UnregisterStateDriver` for `vgvis` and `visibility` and drops `V.tracked[frame]`. PR #809 has merged since this was written, so `ns.ReleaseMover` no longer waits for it and lands with the core.

### 2.3 Generic disable for display-only modules

For a module whose work is its own frames plus subscriptions, `Close` is the whole disable. It unsubscribes, hides the module's frames, releases their movers and visibility rules, and shuts its gates. The registry then sets `def.enabled = false`, calls `ns.Options.Refresh()` so the rows that check `moduleRunning` (`Core/Options.lua:66-69`) and the "own switch" notes (`O.OwnSwitchNote`) redraw, and lists the module as stopped in `/vg status`. Settings stay as they are. Data the module keeps (inventory, quest history, vendor memory, chat history) also stays: switching a module off stops new writes and keeps what was there.

A module with something the scope can't see writes a `Disable` for that part only. Examples: a CVar to put back, an override to write back (Situations), events to give back to a game window (QuestDialog), text to clear on game frames (CooldownKeys, CharacterExtras), a reserve hook to unset (OfficerLoot sets `Rolls.reserve`). The registry calls `Disable` before `Close`.

### 2.4 Hooks stay installed and go inert

A hook is never removed. Through `scope:Gate`, it checks `self.on` and returns. This is the pattern the four existing `Disable` functions already use, done in one place. When the module starts again, the same gate starts calling the module's current function, and nothing is installed twice. A gated call costs one table read and one function call per hook, which is the price of having no undo.

### 2.5 Late enable, and the build-once rule

Turning a module on mid-session runs the same `start` as login does. That only works if `Enable` is safe to run more than once a session. So a converted module follows three rules:

- It builds its frames once and keeps them on the module table. A named frame made twice would leave an orphan and overwrite the global name.
- It registers everything through the scope.
- It reads `settings` from its argument each time instead of keeping an old reference in a closure.

The harness checks the first two (4.3). A converted module's `Enable` also must not assume it runs at `PLAYER_LOGIN`. Code that waits for "the login after this one" (one-time offers, `ns.SetupOwed()` checks) moves behind an explicit flag, as `Modules/Nameplates.lua` `NP.EnemyPlatesOnce` already does.

### 2.6 The registry

```lua
-- Whether a module should run: its own switch on, and every module it requires wanted too.
function ns.ModuleWanted(name)
  local def = modules[name]
  if def == nil or not ns.ModuleEnabled(name) then return false end
  for _, parent in ipairs(def.requires or NONE) do
    if not ns.ModuleWanted(parent) then return false end
  end
  return true
end

-- Builds a module: its scope opened, its settings read (ns.Migrate runs), its Enable under ns.Try.
local function start(def)
  def.scope = def.scope or newScope(def.name)
  def.scope.on = true
  def.enabled = (ns.Try("module " .. def.name, build, def))
  if not def.enabled then def.scope:Close() end
end

-- Takes a running module down: its own Disable first (what the scope can't see), then its scope.
local function stop(def)
  if def.Disable then ns.Try("disable " .. def.name, def.Disable, ns.Settings(def.name, def.defaults)) end
  def.scope:Close()
  def.enabled = false
end

-- After any switch, out of combat: live modules that are no longer wanted stop, dependents first
-- (reverse load order), then wanted ones start, parents first (load order). Toggles made in a fight
-- add up to one pass when it ends.
local function settleAll()
  ns.OutOfCombat(function()
    for i = #order, 1, -1 do stopUnwanted(modules[order[i]]) end
    for _, name in ipairs(order) do startWanted(modules[name]) end
    ns.ModulesChanged()
  end, "modules")
end
```

- `build` passes `def.scope` as `Enable`'s second argument. `ns.SetModuleEnabled` writes the flag and calls `settleAll()`. For a module that is not live yet, it keeps today's branch (call its `Disable` when switched off) until that module is converted. Login runs the same start loop.
- `settleAll` only touches live modules. A reload-only module keeps running, or stays unbuilt, until the reload. `ns.ModulesWaiting()` lists the reload-only modules whose running state differs from `ns.ModuleWanted`.
- Dependencies are not sorted. TOC order already puts each parent first, and `scripts/module-registry.test.mjs` gains a check that every `requires` names a registered module listed earlier in the TOC and that there are no cycles.
- A live child of a reload-only parent that is switched off keeps running with its parent until the reload. Its frames are still there. At the next login it is skipped because `ModuleWanted` is false. Its own switch keeps its value, so turning the parent back on brings it back.
- Turning a live parent off stops its live children first. Turning a child on while its parent is off does nothing: the switch is greyed and its row says "Needs Unit frames" (decision Q3).

### 2.7 Combat

Every start, stop and restart goes through `ns.OutOfCombat` under one key, so the last toggle wins. A start can build secure frames, and a stop can hide protected frames and unregister state drivers. Running only out of combat also means `Enable` and `Disable` never have to think about lockdown for this. While the switch waits, its row shows "Applies after the fight". Nothing runs from a `PLAYER_REGEN_DISABLED` handler, so the `ns.AfterCombat` rule doesn't come into it. An options window open in a fight still takes the click, because writing the flag is not protected.

### 2.8 Saying "needs a reload" honestly

- **Module rows.** A live module's switch has no tag and applies at once. A reload-only module's switch keeps "Reload to apply", and its tip gains the module's `reload` reason. A live child under a reload-only parent that is off reads "Off with Unit frames after a reload".
- **The footer.** Instead of the sticky `needsReload` flag, the notice comes from `ns.ModulesWaiting()` plus the reload settings changed this session. When the list is empty, the notice goes away. When it isn't, it names what is waiting: "Waiting for a reload: Unit frames, Chat". The reload button is the secure overlay already there.
- **Partial modules.** A live module with `afterOff` prints that line once when it stops ("Damage numbers keep Vanguard's font until you reload."). Its switch still applies at once.
- **Setting rows.** The tag follows the setter, not the caption. `O.RestartSetting(module, key)` writes the setting and calls `ns.RestartModule(module)`, which runs `stop` and then `start` out of combat. A row with that setter gets no tag, even though its English caption still ends in " (reload)". `moveReload` already strips that bracket from what the player sees. So converting a row changes no `L[]` string, no translation and no text-fit baseline. A later cleanup can drop the brackets from the English with a normal i18n pass.

```lua
-- get/set for a setting that changes a live module's shape: the module is built again, out of combat.
function O.RestartSetting(module, key)
  local get, set, initial = setting(module, key)
  return get, function(v) set(v) ns.RestartModule(module) end, initial
end
```

### 2.9 Live profile switching (A4-4)

As built in A4-2a: the rule, the switch and the named offer are in (`Core/ProfileSwitch.lua`, `ns.PickProfile`), but no reload-only module declares `rebinds = true` yet (that audit is A4-4) and none declares `reload = L["why"]`, so any running reload-only module blocks every switch and players see today's staged switch. The path is tested with every real module off and TEST-ONLY modules.

The rule is all or nothing. A profile switches now when nothing that is reload-only would differ. Otherwise it is staged as today and the dialog says why.

```lua
-- The reload-only modules that keep the profile `name` from applying now: those running or wanted whose
-- switch or settings table differ between the two profiles (mover spots never do: they place live).
function ns.SwitchBlockers(name)
  local out, now, next = {}, ns.Profile(), VanguardDB.profiles[name]
  for _, n in ipairs(order) do
    local def = modules[n]
    if not def.live and differs(def, now, next) then out[#out + 1] = n end
  end
  return out
end
```

- `differs` compares the module's flag and its settings table, both deep, with defaults filled in on both sides. The theme block counts as one reload-only part, through its reload keys (safer colours, colour-blind mode, soft shadows).
- **Switching now**, out of combat and never in a fight: stop every running live module (reverse order); set `VanguardCharDB.profile` and call `ns.ProfileChanged()`, which clears the settings cache; give each reload-only module that keeps `def.settings` the new table; place every mover again for the new profile; repaint the theme; start the wanted live modules (load order). The spec-profile path (`ns.StageProfile` from a spec change) uses the same check.
- **Stale references.** Re-pointing `def.settings` only fixes modules that read their settings through the module table. A reload-only module that keeps `settings` in a closure would keep the old profile's table. Writes from its live options rows would then land in the new profile while the module reads the old one. So A4-4 audits each reload-only module, marks the ones that read only `def.settings` with `rebinds = true`, and counts a module without it as a blocker even when its settings are equal.
- **What to expect.** Switching between profiles that differ in chat, quests, town and tool settings, and in the positions of anything, works now. Profiles that differ in unit frames, raid frames, bars, game windows or the theme's reload keys still reload. The dialog names those modules: "Unit frames and Chat differ in Raid, so the switch waits for a reload."

### 2.10 Worked example: GroupThreat (sketch, not a commit)

Today (`Modules/GroupThreat.lua:154-188`): `build()` makes `Vanguard_GroupThreat` and registers its mover; `Enable` registers four events with bare `ns.On` and one ticker. It has no `Disable`, and its options row "Group threat panel (reload)" calls `O.NeedReload()`.

Converted:

```lua
local GT = ns.Module("GroupThreat", { defaults = { show = false }, live = true })

-- The movable panel, made once a session; a second Enable finds it and hands it to the new scope.
local function panel(scope)
  GT.panel = GT.panel or build()
  scope:Mover(GT.panel, "groupthreat", L["Group threat"], GT.SPOT)
  GT.panel:Hide()
end

-- Module entry point (Core/Modules.lua): built, and listening, only when switched on. Everything goes
-- through the scope, so switching the module or its panel row off needs no Disable.
function GT.Enable(settings, scope)
  if not settings.show then return end
  panel(scope)
  for _, event in ipairs(GT.THREAT_EVENTS) do scope:On(event, GT.Dirty) end
  for _, event in ipairs(GT.NOW_EVENTS) do scope:On(event, GT.Soon) end
  scope:Every("group threat", GT.EVERY, GT.Tick)
end
```

- `build` loses its `ns.Mover` line and `f:Hide()` (moved into `panel`).
- `Core/OptionsFrames.lua:105` changes `reloadSetting("GroupThreat", "show")` to `O.RestartSetting("GroupThreat", "show")`. The caption string stays.
- `scripts/tests/options.test.mjs` row counts do not change. The test gains lifecycle cases (4.3) and keeps its existing threat cases.
- The feature page sentence for group threat in `docs/features/unit-frames.md` changes from "after a reload" to "at once, or when the fight ends".

A small `Disable`, for comparison. QuestDialog takes a known list of events from the game's gossip and quest windows (`Modules/QuestDialog.lua:327-334`) and can give them back:

```lua
-- Switched off: the game's gossip and quest windows get back the events Vanguard took (QD.TAKEN), so
-- the next talk opens them; Vanguard's dialog and its handlers go with the scope.
function QD.Disable()
  for name, events in pairs(QD.TAKEN) do
    local f = _G[name]
    if type(f) == "table" and f.RegisterEvent then
      for _, e in ipairs(events) do f:RegisterEvent(e) end
    end
  end
end
```

Whether re-registering events on those windows from addon code leaves them untainted is not known. It goes on the in-game list (4.4).

## 3. Classification of the 74 modules

"Live" means: after the switch goes off, the screen and the event load are what a login with it off would give. The one exception is a line the module states with `afterOff`.

### 3.1 Live with the scope alone: 22

Own frames, subscriptions and gated hooks only.

AutoAccept, QuestAuto, VendorMemory, Inventory, QuestHistory, SpellRanks, Coexist, GroupBoard, ChatWatch, GroupThreat, FightHistory, Meter, Rolls, InstancePrep, QuestArrow, QuestMinimap, CooldownGaps, MailTools, CraftQueue, AfkScreen, FrameAuras (requires UnitFrames), ComboPoints (requires UnitFrames).

### 3.2 Live with a small Disable: 29

| Module | What its Disable does |
| --- | --- |
| Situations | writes the profile's own values back over an applied override (`SI.base`) |
| HudText | gives the HUD font objects back; `afterOff` for the damage-number font |
| ChatHistory, ChatFilter | already have one; the flag becomes the scope's gate |
| Quiet | already has one; `afterOff`: the action bar's own errors come back with a reload |
| ChatExtras | removes its chat filter (the game has the call), hides copy buttons on the chat windows |
| ChatWindows | hides its find box; the floating-window movers setting stays a reload setting |
| QuestDialog | gives the taken events back (2.10); in-game check |
| QuestLog | clears its override binding (`ClearOverrideBindings`); the toggle hook is gated |
| QuestGuide | takes its pins off the world map |
| Upgrades | clears the marks already drawn on bag slots and quest cards |
| CharacterExtras, CooldownKeys | clear their texts on the game's character pane and cooldown icons |
| CooldownGlow | its `Apply` with glow off already clears; its `C_Timer.NewTicker` moves to `scope:Every` |
| Errands, Merchant, TalentPlanner | hide their buttons and bars on the game's trainer, merchant and talent windows |
| DataBars | shows again the game's status bars it hid (their events were kept, `Modules/DataBars.lua:552`); in-game check |
| BrokerStrip | unregisters its data-broker callbacks (the library has the call) |
| OfficerLoot | unsets `Rolls.reserve`; its roster subscriptions go with the scope |
| MainTanks, PartyExtras, RaidTools | their own secure headers and buttons are hidden by the scope out of combat; in-game check |
| RaidAuras, RaidHealing, RaidStatus | clear their marks from every raid tile (require RaidFrames) |
| ClassBars, PowerTicks, UnitExtras | hide their bars, sparks and readouts on the player frame (require UnitFrames) |

### 3.3 Reload only: 23

| Module | Reason (the `reload` text, in short) |
| --- | --- |
| UnitFrames, RaidFrames, ActionBars | replace the game's frames, whose events are gone; secure headers and Edit Mode |
| CastBars, PlayerAuras, SwingTimer, InfoStrip | hide a game frame for good with `UF.HideBlizzard` (cast bars, buffs, swing bars, clock and durability) |
| QuestTracker | hides the game's objective tracker for good |
| SpecialBars | restyles and moves the game's pet, stance and vehicle-exit buttons |
| ClickCast | writes bindings into other frames' secure attributes |
| Nameplates | hides the game's plate frames and sets their hit areas |
| Windows, Tooltips, Chat, ChatBubbles, Bags | restyle the game's windows, tooltips, chat and bags; Bags already gives back its layout setting at once |
| GameAlerts, GameTools | restyle and move the game's alert frames, Cooldown Manager and damage meter |
| Minimap, MinimapButtons, MenuStrip | reparent the game's minimap, other addons' buttons and the micro menu |
| AuctionHelper | adds its tabs to the game's auction window's own tab list |
| Waypoints | takes `/way` in the game's slash table and dresses the game's waypoint pin |

Some of these could move up later. CastBars, SwingTimer, InfoStrip and PlayerAuras would, if a reversible park kept the game frame's events (Q5). Several of their settings could apply live without the module itself toggling (Q7).

### 3.4 What happens to the reload tags (WoW Forever)

- **Module switch tags:** 74 to 23. 51 go, all from 3.1 and 3.2.
- **Setting rows tagged "(reload)":** 68 today (recounted on 2026-11-10 at `eaff8c5` from the options pages' rows on WoW Forever: still 68), counted as 74 caption strings in `Core/Options*.lua` and `Modules/*.lua` (the old captions in `Core/OptionsNames.lua` are tips, not rows), minus the Retail-only rows and the second client's druid mana strings. 19 go, because their modules are live and the row becomes `O.RestartSetting`: Cooldown gaps (2), flight and boat timers (2), druid mana and totems (2), party pets (1), group threat (1), readouts (3), raid debuffs and indicators (6), the quest dialog (1) and the quest log (1). That leaves about **49**.
- Of those 49, 12 are the game-window groups, 3 are theme keys, 9 belong to the bars, map and menu strip, and the rest are spread over reload-only modules.

## 4. Migration plan

### 4.1 Batches (one PR each, about ten modules, display-only first)

- **A4-2a, Core.** Scope, `requires`, `live`/`reload`/`afterOff`, `settleAll`, `ns.RestartModule`, `ns.ModulesWaiting`, `O.RestartSetting`, `V.Release`, the spare-frame argument to `ns.OnUnit`, the footer and row text, and `ns.HandlerCounts()` for the harness and `/vg perf`. Also the harness footprint (4.3) and the `requires` check in `scripts/module-registry.test.mjs`. No module is converted, so nothing visible changes. `ns.ReleaseMover` lands here too (#809 has merged).
- **A4-2b, own frames.** GroupThreat, FightHistory, Meter, Rolls, InstancePrep, QuestArrow, QuestMinimap, CooldownGaps, ChatWatch.
- **A4-2c, listeners and data.** AutoAccept, QuestAuto, VendorMemory, Inventory, QuestHistory, SpellRanks, Coexist, GroupBoard, MailTools, CraftQueue.
- **A4-2d, on the unit frames.** #809, which owned FrameAuras, ComboPoints, ClassBars and UnitExtras, has merged; wait for any open PR that owns the unit-frame files. Batch: FrameAuras, ComboPoints, ClassBars, PowerTicks, UnitExtras, PartyExtras, MainTanks, RaidTools, AfkScreen.
- **A4-2e, raid and town.** RaidAuras, RaidHealing, RaidStatus, OfficerLoot, Upgrades, CharacterExtras, Errands, Merchant, TalentPlanner, QuestGuide.
- **A4-2f, chat, quests and the old four.** ChatHistory, ChatFilter, Quiet, ChatExtras, ChatWindows, QuestDialog, QuestLog, CooldownKeys, CooldownGlow, DataBars, BrokerStrip, HudText, Situations. This batch is thirteen; split it if review gets long.
- **A4-2g (optional, Q5 and Q7).** The reversible-park spike and the setting-level `Apply` for reload-only modules.

Each batch converts its modules and moves their setting rows to `O.RestartSetting`. It updates the feature page sentences and `docs/SMOKE-TEST.md` steps ("switch X off: it goes at once, nothing left on screen"), and adds the lifecycle cases. Before converting a module, the batch greps its `ns.GetModule("X")` callers and checks each one survives X being stopped (`ns.ModuleLive` or a nil frame).

### 4.2 The quality-scan rule (A4-3)

- **`file-scope-subscription`** in `scripts/lib/code-quality.mjs`: a top-level `ns.On(`, `ns.OnUnit(` or `ns.Every(` in `Modules/` fails unless `ALLOWED` names the file with its count and a reason, as `scripts/unit-events.test.mjs` does for unit events. It starts at the 37 found today. A4-3 moves the module-owned ones into `Enable`: the five `PLAYER_LOGIN` handlers in `Modules/WindowsTown.lua:477`, `WindowsMenus.lua:147`, `WindowsTabs.lua:1242`, `KeybindsApply.lua:1033` and `KeybindsWizard.lua:702`, plus HudText, ChatHistory, Situations, RaidPreview, AuctionCrafting, ClickCast pages and the quest folds (M16). Files that belong to no module keep an entry with a reason: key setup, the probe, the keys card.
- **`bare-subscription`**: in a file whose module is `live = true`, a bare `ns.On`, `ns.OnUnit`, `ns.Every`, `T.OnChanged`, `ns.OnMoverPlaced`, `hooksecurefunc` or `:HookScript` fails. The file-to-module map is the one the scanner can read: `ns.Module("X")` in the file, else a top-level `local ... = ns.GetModule("X")`. Core files are exempt.

### 4.3 What the harness needs

A Lua footprint of the whole addon, taken through the test-only `__vg` hooks the snapshot test already uses (`scripts/tests/snapshot.test.mjs`): handler counts per event (`ns.HandlerCounts()`), ticker keys (`ns.ticker.vgJobs`), registered events per addon frame, unit subscriptions with events, shown addon frames (`stub.frames`, owned by the addon per `wow-taint.lua`), frames with a state driver, mover keys, and the number of open gates.

Three cases per live module, in `scripts/tests/lifecycle.test.mjs` (split by batch if it passes 45 s):

```js
// Switched off live, the module leaves what a login with it off leaves: no handler, ticker,
// subscription, shown frame, driver or mover of its own.
it(`lifecycle: ${name} off leaves nothing behind`, () => {
  const off = footprint(loggedIn(withModule(name, false)));
  const addon = loggedIn(withModule(name, true));
  addon.eval(`ns.SetModuleEnabled("${name}", false)`);
  expect(footprint(addon)).toEqual(off);
});
```

- **Late equals login:** a login with the module off, then switched on, has the same footprint as a login with it on (frames compared by name and kind, not creation order).
- **Toggle three times:** after the second and third time on, `#stub.frames` and every handler count match the first. This proves the build-once rule and that nothing is doubled. No error is recorded.
- **One shared combat case:** a switch made during a fight changes nothing until `PLAYER_REGEN_ENABLED`, then settles. `wow-taint.lua` already fails any protected call made in combat.
- **One shared profile case (A4-4):** a live switch between two profiles that differ only in live modules has the footprint of a login with the new profile.

The logins follow `scripts/tests/login-scope.json`, with heavy modules off unless the case is about them, which keeps the file's time down.

### 4.4 Needs in-game check (once code exists)

- QuestDialog giving its events back: the game's gossip and quest windows open normally after the switch, with no taint report in `/vg errors`.
- DataBars: the game's status bars come back in their Edit Mode spot.
- MainTanks, PartyExtras, RaidTools: their secure frames hide and come back, in a raid, out of combat.
- One switch made in a fight applies when the fight ends.
- A live profile switch between two chat-only profiles; one blocked switch naming its modules.

## 5. Risks, rejected alternatives and decisions

### 5.1 Risks

- **Handler order.** A module started late runs its handlers after the ones already registered for the same event, while at login they run in TOC order. Parents start before children, so the known chains (raid tile hooks, unit frame add-ons) keep their order. An unknown dependency on order shows up as a failed "late equals login" case.
- **Duplicate registration.** `ns.On` drops a function it already has. The scope keeps that behaviour by keying on event and function, so a module that registers the same function twice still gets one call.
- **Error budget.** A restart gives handlers new wrappers, so a handler paused by the budget runs again after the module restarts. That is intended (a restart is a retry) and goes in `/vg errors` help.
- **Cross-module calls into a stopped module.** Helpers stay callable because the code is still loaded. Calls that touch a stopped module's frames must check `ns.ModuleLive`. The per-batch grep in 4.1 and the lifecycle cases catch the ones that don't.
- **Frames are never freed.** Toggling must not grow memory. The toggle-three-times case enforces that.
- **Taint.** Re-registering events on game windows (QuestDialog) and showing game frames again (DataBars) is suspected safe out of combat but unverified (4.4).
- **Overlap with other open PRs.** #809 (`Core/Movers.lua` and five unit-frame files) has merged, so 2.2's `ns.ReleaseMover` no longer waits. Batch A4-2d still waits for any open PR that owns the unit-frame files.
- **Scope of the change.** The core PR changes `Core/Modules.lua`, `Core/Events.lua`, `Core/Ticker.lua`, `Core/Visibility.lua`, `Core/Options.lua` and `Core/OptionsWindow.lua`. CLAUDE.md puts a cross-module decision like this at Opus; the conversions are Sonnet work.

### 5.2 Alternatives rejected

- **A hand-written `Disable` in every module.** That is 74 chances to forget an event or a ticker, and no single place to test. The scope does the common part once, and `Disable` covers only what the scope can't see.
- **An implicit scope** (ns.On records into "the module whose Enable is running"). It needs no module changes, but it attributes wrongly across modules. For example, `QL.Enable` calls `QT.KeepFoldsOpen`, which would land in QuestLog's scope. It also misses anything registered later from a callback, and it hides one function's dependence on another, which CLAUDE.md asks us not to do. It is kept only as a harness check.
- **Removing hooks by restoring the original function.** Impossible for `hooksecurefunc`, and replacing game functions or scripts taints them.
- **Destroying frames.** The client has no call for it. Frames are hidden and reused.
- **Sorting modules by dependency.** TOC order is already right. A test asserting it is cheaper and keeps load order visible in one file.
- **A partial live profile switch** (apply what can, leave the rest). That leaves two profiles mixed on screen, and writes land in whichever table a module happens to hold. All or nothing, with the blockers named, is honest.
- **Reloading for the player.** WoW Forever refuses `ReloadUI()` from addon code (`Core/Dialog.lua:4-6`). The reload stays a click on the button.

### 5.3 Decisions for Cliff

- **Q1. Approve the scope API and `Enable(settings, scope)`?** Recommended: yes. It is backward compatible, and unconverted modules ignore the second argument.
  Decided 2026-11-10: as recommended.
- **Q2. Is an unconverted module reload-only by default?** Recommended: yes, until it declares `live` or `reload`. Once A4-2 is done, the registry test requires one of the two.
  Decided 2026-11-10: as recommended.
- **Q3. Turning on a child whose parent is off.** Recommended: the switch is greyed and says "Needs Unit frames", and the note jumps to the parent's row. The alternative, turning the parent on too after a question, is one more dialog for little gain.
  Decided 2026-11-10: as recommended.
- **Q4. Switches made in a fight.** Recommended: let the switch flip, show "Applies after the fight", and apply when the fight ends. Refusing would be the stricter choice.
  Decided 2026-11-10: as recommended.
- **Q5. Reversible park for small game frames** (cast bars, swing bars, buffs, clock, calendar button, durability). The game frame keeps its events while hidden, so the module could go off live. Cost: those frames keep handling events while hidden, and there is a taint question to answer in the game. Recommended: not in the main batches. Do a spike on the durability frame in A4-2g, with an in-game look, then decide.
  Decided 2026-11-10: as recommended.
- **Q6. The plan's target of 15 or fewer reload-tagged options.** It can't be reached by A4 alone: about 49 setting rows remain. Recommended: keep the target, and get there with Q5, Q7, and one section-level note for the 12 game-window rows ("These apply after a reload") instead of 12 tags. Or relax it to "every display-only module live, and only reasons that can't change still tagged".
  Decided 2026-11-10: as recommended.
- **Q7. Setting-level `Apply` for reload-only modules** whose setting only changes the module's own frames: buff timers and size, levels on unit frames, map coordinates, chat place, text-only bubbles, groups as columns or rows. Recommended: yes, in A4-2g, one test each.
  Decided 2026-11-10: as recommended.
- **Q8. The live profile rule.** Recommended: all or nothing as in 2.9, with `rebinds = true` audited per module.
  Decided 2026-11-10: as recommended.
- **Q9. File-scope handlers in files that are not modules** (key setup, the probe, the keys card). Recommended: an allowlist with a reason per file. Gate key setup's logout backup and learner behind key setup's own switch (L16) in A4-3.
  Decided 2026-11-10: as recommended.
- **Q10. Ship the core PR with no module converted?** Recommended: yes. It changes nothing a player sees, so A4-2b is the first visible change and the easiest one to judge.
  Decided 2026-11-10: as recommended.
- **Q11. Captions keep " (reload)" in their English `L[]` text after conversion**, since the tag now follows the setter. Recommended: yes for A4. Drop the brackets in one i18n pass after A4-2f, so no translation churns batch by batch.
  Decided 2026-11-10: as recommended.
