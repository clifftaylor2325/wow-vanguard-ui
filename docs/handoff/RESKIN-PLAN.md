# Reskin plan: the rest of the game's frames, in parallel (handoff)

Repo `clifftaylor2325/wow-vanguard-ui`, written 2026-10-06 against commit `757c0c7` (v0.4.0, after PR #125).
Design: `docs/design/RESKIN.md` (read it first; §5 there is the inventory every task below points at).
Repo rules: `docs/handoff/WORKPLAN.md` §0 ("How to work") applies word for word except where §0 below overrides it.
Every `file:line` is as of `757c0c7`; if a line has moved, grep for the identifier quoted next to it.

---

## 0. How this plan runs

### Order and parallelism

1. **S0 (foundation) first and alone.** It changes `Modules/Windows.lua`, `Core/Theme.lua`, `Core/Skin.lua`,
   `Core/Options.lua`, `Vanguard.toc`, `README.md`, `docs/THEME.md`, `docs/SMOKE-TEST.md` and the test helpers, and it
   creates the empty area files. Branch `work/reskin-s0`, one PR. Nothing else starts until S0 is merged into `main`.
2. **S1–S7 run at the same time**, one session each, each in its own clone or `git worktree` of `main` after S0:
   branches `work/reskin-s1-social` … `work/reskin-s7-tabs`, one PR each. Each stream owns exactly the files its header
   names and never edits another stream's file. S8 (PvP) waits until battlegrounds are live on Forever.
3. **Shared files** (`README.md`, `docs/SMOKE-TEST.md`, `.luacheckrc`, `scripts/lib/wow-widget-api.lua`,
   `scripts/lib/media-sources.mjs`, `scripts/tests/helpers.mjs`): S0 pre-makes a spot per area (a README sub-bullet, a
   smoke-test subsection). A stream edits only its own spot, and appends to the end of a list when it must add a global
   or a widget method. Before opening the PR: `git fetch origin main && git rebase origin/main`; conflicts in those
   files are list appends and resolve by keeping both sides.
4. **One task = one commit**, subject `<task id> <area>: <change>` (e.g. `S1.2 WindowsSocial: guild window`). Tick the
   task's checkbox in this file in the same commit. The PR description lists the tasks done, the tests added, what was
   skipped and why, and the "needs in-game check" list.

### Testing: on the owner's machine only

- Tests run **only on the owner's machine** (a local clone of the repo with `npm ci` done). After each task:
  `npm run verify` (tests + the code-quality scan), `npm run coverage` (floor: 100 % of lines, do not lower it),
  `npm run lint` if luacheck is installed, and `node scripts/build-media.mjs --check` if `Media/` or
  `scripts/lib/media-sources.mjs` changed.
- A session that cannot reach the npm registry (cloud sandbox: `npm ci` fails with HTTP 403 `host_not_allowed`) still
  writes the code and the tests, runs `luac5.1 -p` on every changed Lua file if it has it, and lists in the PR exactly
  which commands it could not run. It never claims a test passed that it did not run.
- **GitHub CI is not part of this loop**: do not wait for it, do not read its results, do not touch
  `.github/workflows/`. The local commands above are the gate.
- The addon has not been run in the game by anyone but the owner. A task tagged **[VERIFY IN GAME]** is implemented and
  tested under the stub, then listed in the PR under "needs in-game check" with the line from `docs/SMOKE-TEST.md` that
  checks it. Never claim in-game behaviour you did not observe.

### Suggested model and effort per stream

The owner sets the model and effort when opening each session; these are the suggestions this plan was written for.
"Mechanical" streams follow one pattern (register a name, fade listed parts, hook one redraw, write a stub test) and
need breadth more than judgement; the three others touch the theme's API, pooled secure menus, or secure HUD frames.

| Stream | Branch | Model | Effort | Why |
|---|---|---|---|---|
| S0 Foundation | `work/reskin-s0` | Claude Opus 5.5 | high | designs `T.Tab`/`T.Tooltip`/`T.ScrollBar`/`T.FontObjects` and the registry every other stream builds on; touches the most constrained file (`Core/Theme.lua`) |
| S1 Social and guild | `work/reskin-s1-social` | Claude Sonnet 5.5 | medium | mechanical; 10 windows, one parchment |
| S2 Town and items | `work/reskin-s2-town` | Claude Sonnet 5.5 | medium | mechanical; reuses `BG.SkinWindow` |
| S3 System windows | `work/reskin-s3-system` | Claude Sonnet 5.5 | medium | mechanical; many small dialogs |
| S4 Map, finder, Legacy | `work/reskin-s4-map` | Claude Sonnet 5.5 | high | the world map and the Legacy window have the most parts; one [DECIDE] |
| S5 Menus and tooltips | `work/reskin-s5-menus` | Claude Opus 5.5 | high | pooled frames behind an `EventRegistry` hook, taint on the unit popup menu |
| S6 HUD leftovers | `work/reskin-s6-hud` | Claude Opus 5.5 | high | edits inside modules that handle secure frames and combat |
| S7 Tabs and inner parts | `work/reskin-s7-tabs` | Claude Sonnet 5.5 | high | three tab templates across 14 windows; selection state must be right everywhere |
| S8 PvP (later) | `work/reskin-s8-pvp` | Claude Sonnet 5.5 | medium | mechanical; only once battlegrounds exist on Forever |

### Writing a task's test

Every area file gets `scripts/tests/windows-<area>.test.mjs` (S0 makes the empty files). Use the helpers S0 moves into
`scripts/tests/helpers.mjs`: `WINDOWS_ENV` (TEST-ONLY `__window(name)` builds a ButtonFrameTemplate-shaped frame:
art texture, `NineSlice`, `Inset`, `PortraitContainer`, `CloseButton`, `TitleContainer.TitleText`, `Button1-2`) and
`windowState(addon, name)` (`{ art, nine, portrait, insetNine, panel, title, painted }`). The pattern per window:

```js
it("open mail: the letter window in the theme, its stationery faded, body text light", () => {
  const addon = loggedIn(WINDOWS_ENV + `__window("OpenMailFrame") OpenMailFrame.ReportSpamButton = CreateFrame("Button", nil, OpenMailFrame)`);
  addon.eval("OpenMailFrame:Show()");
  expect(windowState(addon, "OpenMailFrame")).toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  // then one assertion per part the task names, and one for the switch off:
  const off = loggedIn(WINDOWS_ENV + '__window("OpenMailFrame")', { savedVariables: "VanguardDB.profiles = { Default = { Windows = { social = false } } }" });
  off.eval("OpenMailFrame:Show()");
  expect(windowState(off, "OpenMailFrame").panel).toBe(false);
});
```

A part the game only has on some clients gets a second `loggedIn` without it, asserting nothing errors
(`addon.eval("return ns.errors")` is empty). A `hooksecurefunc` on a game method is tested by defining the method in
the ENV and calling it after the skin ran.

---

## 1. S0 — Foundation (serial; everything else waits for it)

Files: `Modules/Windows.lua`, `Modules/Bags.lua`, `Core/Theme.lua`, `Core/Skin.lua`, `Core/Options.lua`, `Vanguard.toc`, `README.md`,
`docs/THEME.md`, `docs/SMOKE-TEST.md`, `scripts/tests/helpers.mjs`, `scripts/tests/more.test.mjs`,
`scripts/tests/theme.test.mjs`, `scripts/lib/media-sources.mjs`, new empty `Modules/Windows{Social,Town,System,Map,Menus,Tabs,PvP}.lua`
and `scripts/tests/windows-{social,town,system,map,menus,tabs,pvp}.test.mjs`.

- [x] **S0.1 The registry.** `Modules/Windows.lua`: add `GW.GROUPS`, `GW.Add(group, kind, …)`, `GW.AddButtons(name, list)`
  as `docs/design/RESKIN.md` §3.1 specifies; re-express `GW.FRAMED` (:19), `GW.POPUPS` (:24), `GW.ON_DEMAND` (:29) and
  `GW.EXTRA_BUTTONS` (:45) through them (keep the old table names as the storage so existing tests keep reading them);
  `watch` (:238) skips a name whose group setting is false; `onLoaded` (:252) unchanged in behaviour; a late
  `GW.Add("…", "onDemand", addon, …)` for an addon already loaded (`C_AddOns.IsAddOnLoaded`, guarded) watches at once.
  Drop `Blizzard_EncounterJournal` from the on-demand list (never loads on Forever). `GW.defaults` (:16) gains
  `social, town, system, map, menus, tabs, pvp = true`. Test (`more.test.mjs`, the "game windows" cases): a name added
  under a group is skinned on show; with that group's setting false it is not hooked; a late on-demand registration
  for a loaded addon is skinned at once; the EncounterJournal entry is gone. Size S.
- [x] **S0.2 `T.Tab`.** `Core/Theme.lua`, after `T.CloseButton` (:674): the three templates by parts (design §3.3), the
  accent line while selected, hooks on `OnEnable`/`OnDisable` and a post-hook of `SetChecked` when present; `T.Refresh`
  (:813) repaints it with the accent. Export as `S.Tab` in `Core/Skin.lua:17`. Test (`theme.test.mjs`): a stub tab with
  `Left/Middle/Right` is faded and panelled; disabling it shows the accent line and enabling hides it; a side tab with
  `SelectedTexture` works the same; a tab with none of the parts is panelled and nothing errors; an accent change
  recolours the line. Size M.
- [x] **S0.3 `T.Tooltip` and `T.FontObjects`.** `T.Tooltip(frame)` = `skin()` from `Modules/Tooltips.lua:29` (panel at
  alpha 0.94 with shadow, `NineSlice` alpha 0, idempotent) moved into the theme; `Tooltips.lua` calls it.
  `T.FontObjects(map)` = the loop in `TT.ApplyFonts` (`Tooltips.lua:44`), re-run through `T.OnChanged`; `Tooltips.lua`
  and `MS.SkinTracker` (`Modules/MenuStrip.lua:554`) use it. Both exported in `Core/Skin.lua`. Test: existing tooltip
  and tracker tests still pass; `T.FontObjects` applies the theme font at `T.ScaledSize` and re-applies after a text
  size change. Size S.
- [x] **S0.4 `T.ScrollBar`.** Both 12.x bars by parts (design §3.3); the up arrow is the existing `Down` icon turned
  over (`SetTexCoord(0, 1, 1, 0)`), so no new media (the media build's renderer couldn't be installed where S0 was
  written). Exported as `S.ScrollBar`. Test (`theme.test.mjs`): a stub
  `MinimalScrollBar` and a stub `WowTrimScrollBar` get their track and thumb art faded, the thumb painted, the arrows
  tinted; a bar without a `Thumb` is left alone. Size M.
- [x] **S0.5 Area files and TOC.** Create the seven `Modules/Windows<Area>.lua` files holding only a header comment
  ("<area> windows in the Vanguard look; filled by stream S<n> of docs/handoff/RESKIN-PLAN.md") and the seven test
  files holding one `it("placeholder", …)` that loads the addon; add the module files to `Vanguard.toc` right after
  `Modules/Windows.lua` (:94) in the order Social, Town, System, Map, Menus, Tabs, PvP. Size S.
- [x] **S0.6 Options rows.** `Core/Options.lua`, `windowRows` (:418): one `check` per new group, after the existing
  four, all "(reload)": "Mail, guild, channels, friends and guild-creation windows", "Stable, trainer, bags, loot and
  item dialogs", "Game options, Edit Mode, keybinding and help windows", "World map, group finder, calendar and Legacy
  windows", "Right-click menus, dropdowns and more tooltips", "Tab buttons and the inside of the character pane",
  "Battleground windows". Update the `Windows` module description (:261). Test (`options.test.mjs`): the rows exist and
  toggle their settings. Size S.
- [x] **S0.7 Test helpers.** Move `WINDOWS_ENV`, `__window` and `windowState` from `scripts/tests/more.test.mjs:2475-2497`
  into `scripts/tests/helpers.mjs` (exported), and import them back in `more.test.mjs`; document them in
  `scripts/tests/README.md` under "Inspecting". Size S.
- [x] **S0.8 Docs.** `README.md`: split the "Game windows" bullet (line 49) into an intro line plus one sub-bullet per
  group (the existing text for `windows`/`popups`/`timers`; a one-line placeholder "(coming: see docs/handoff/RESKIN-PLAN.md)"
  for the seven new groups, which each stream replaces). `docs/THEME.md`: a "Game frame primitives" section for `T.Tab`,
  `T.Tooltip`, `T.ScrollBar`, `T.FontObjects`. `docs/SMOKE-TEST.md`: section 14 "Game windows, by area" with its switch
  step (14.1) and a fixed subsection number per stream (14.2 S1 … 14.8 S7, 14.9 S8) that each stream adds; empty `###`
  subsections aren't allowed (`core.test.mjs` checks every step has Do, Expect and paste lines). Size S.
- [x] **S0.10 Helpers for the streams** (added while writing S0). `Modules/Windows.lua` also exports
  `GW.FadeParts(frame, keys)` (parentKeys: a frame's own textures, or a texture), `GW.FadeNamed(names)` (global
  textures/frames), `GW.SkinWith(keys)` (a skin function: `GW.Skin` then those parts faded), `GW.PaintNamed(names, token)`
  (font strings by global name in a theme colour) and `GW.settings` (the module's settings once enabled; read a group's
  switch as `GW.settings.<group>`). Streams use these instead of writing their own loops.
- [x] **S0.9 Shared item skin.** `Modules/Bags.lua`: export the local `skinItem` (:95, "Fades an item button's slot art") as
  `BG.SkinItem` so other windows' item buttons (mail attachments, the equipment flyout, merchant items later) get the
  same quality border without copying it. No behaviour change; one test that `ns.GetModule("Bags").SkinItem` skins a
  stub button once. Size S.

---

## 2. S1 — Social and guild

Files: `Modules/WindowsSocial.lua`, `scripts/tests/windows-social.test.mjs`, own README sub-bullet, its smoke-test subsection (§14 of docs/SMOKE-TEST.md, number fixed there).
Inventory: design §5.1. Group `social`.

- [x] **S1.1 Open mail.** `GW.Add("social", "framed", { "OpenMailFrame" }, GW.SkinOpenMail)`: `GW.Skin`, then the
  parchment faded (`OpenStationeryBackgroundLeft`, `OpenStationeryBackgroundRight`; `_G` lookups, each optional),
  `OpenMailBodyText` (a `SimpleHTML`) light per tag as `GW.LightItemText` (`Modules/Windows.lua:198`) does, re-applied
  after `OpenMailFrame:Update()` (`hooksecurefunc(OpenMailFrame, "Update", …)`, guarded), `GW.AddButtons("OpenMailFrame",
  { "OpenMailReplyButton", "OpenMailDeleteButton", "OpenMailCancelButton", "OpenMailReportSpamButton" })`; the letter,
  money and attachment item buttons get the bags' quality border through `ns.GetModule("Bags").SkinItem` (exported by
  S0.9). Size S.
- [x] **S1.2 Guild window.** `CommunitiesFrame` with `GW.Skin`; `MaximizeMinimizeFrame`'s button via `T.Button`;
  `PortraitOverlay` faded; `GuildBenefitsFrame`, `GuildDetailsFrame`, `MemberList`, `Chat` and `CommunitiesList` art
  faded with inset panels; `StreamDropdown` via `T.Button`. Side tabs are S7's (leave them). Re-skin on
  `CommunitiesFrameMixin:OnShow` and after `SetDisplayMode` (hooksecurefunc on the frame, guarded). Size M.
- [x] **S1.3 Guild dialogs.** `CommunitiesGuildLogFrame`, `CommunitiesGuildNewsFiltersFrame`, `CommunitiesGuildTextEditFrame`,
  `GuildInviteFrame`, `CommunitiesSettingsDialog`, `CommunitiesAvatarPickerDialog`, `CommunitiesTicketManagerDialog`,
  `GuildRenameFrame`: `GW.Skin` each (`Bg`/`Border`/`BG` parts faded where `GW.ART` doesn't already list them, with
  `GW.SkinWith({ ... })` from S0). Size S.
- [x] **S1.4 Channels and friends dialogs.** `ChannelFrame`, `CreateChannelPopup`, `FriendsFriendsFrame`, `AddFriendFrame`,
  `BattleNetInviteFrame`: `GW.Skin`; `AddFriendFrame`'s edit boxes via `T.EditBox`. Size S.
- [x] **S1.5 Guild creation.** `GuildRegistrarFrame`, `PetitionFrame`, `TabardFrame`: `GW.Skin`;
  `GuildRegistrarText`, `GuildRegistrarPurchaseText`, `PetitionFrameCharterTitle`, `PetitionFrameMemberTitle`
  light/gold after `GuildRegistrar_OnShow`/`PetitionFrame_Update` (hooksecurefunc, guarded); the tabard model and
  its colour swatches untouched. Size S.
- [x] **S1.6 Role poll and invite popups.** `RolePollPopup`, `LFGInvitePopup`: `Border` faded, `T.Panel` with shadow,
  `CloseButton`/`acceptButton`/decline buttons themed, the role buttons' checked art kept (only their frame art faded).
  Registered as `"popups"` kind under `social`. **[VERIFY IN GAME]**: start a role check from the raid tools; the popup
  shows themed and the role buttons still check. Size S.
- [x] **S1.7 Raid tab.** `GW.Add("social", "onDemand", "Blizzard_RaidUI", { "RaidFrame" }, GW.SkinRaidTab)`: the eight
  `RaidGroup<n>` boxes (their title textures faded, inset panel), `RaidGroupButton1-40` as `T.Button` with the class
  colour the game sets on the name kept; `RaidFrameRaidInfoButton`, `RaidFrameConvertToRaidButton`, `RaidFrameAllAssistCheckButton`
  themed. `RaidParentFrame` registered as framed for clients that use it. Size M.
- [x] **S1.8 Docs and smoke lines.** The README sub-bullet for `social`; smoke-test lines: open a letter, open the
  guild window and each of its pages, `/join test`, invite a friend, visit a guild registrar; each with what you should
  see and what to paste if it fails. Size S.

---

## 3. S2 — Town and items

Files: `Modules/WindowsTown.lua`, `scripts/tests/windows-town.test.mjs`, own README sub-bullet, its smoke-test subsection (§14 of docs/SMOKE-TEST.md, number fixed there).
Inventory: design §5.2. Group `town`.

- [x] **S2.1 Stable.** `PetStableFrame`: `GW.Skin` plus `Background`, `Border`, `PetModelSceneShadow`, `PetShadow` faded,
  `Inset` as `GW.ART` handles it, `expBar` via `T.StyleBar`, `purchaseButton` via `T.Button`, `levelText`, `loyaltyLevel`,
  `diet`, `Text` in the theme font. Size S.
- [x] **S2.2 Trainer.** `GW.Add("town", "onDemand", "Blizzard_TrainerUI", { "ClassTrainerFrame" }, GW.SkinTrainer)`:
  `GW.Skin`, `BG` and `bottomInset` faded with an inset panel, `GW.AddButtons("ClassTrainerFrame", { "ClassTrainerTrainButton" })`,
  `FilterDropdown` via `T.Button`, each row on acquire (`ClassTrainerFrame.ScrollBox:RegisterCallback(ScrollBoxListMixin.Event.OnAcquiredFrame, …)`
  guarded; keep `selectedTex`, `disabledBG`, `lock`, `icon`; fade the row's `Left/Middle/Right/Bg` art; `name`/`subText`
  in the theme font). Vanguard's Train all button (`Modules/Errands.lua:112`) is already themed; don't move it. Size M.
- [x] **S2.3 Side dress-up, stack split, coin pickup.** `SideDressUpFrame` (`BGTopLeft`, `BGBottomLeft`, `$parentTop`,
  `$parentBackgroundTop`, `$parentBackgroundBot` faded; `ControlFrame` buttons `T.Button`), `StackSplitFrame`
  (`SingleItemSplitBackground`, `MultiItemSplitBackground`, `FrameGlow` faded; the four buttons `T.Button`;
  `StackSplitText` theme font), `CoinPickupFrame` (textures faded, `CoinPickupOkayButton`/`CoinPickupCancelButton`).
  All three as `"popups"` kind. Size S.
- [x] **S2.4 Separate bag windows.** When `ContainerFrameCombinedBags` is off: hook `OnShow` on `ContainerFrame1-7`
  (those that exist) to `ns.GetModule("Bags").SkinWindow` (`Modules/Bags.lua:127`) and hooksecurefunc each frame's
  `UpdateItems` to its item skin (as `BG.Enable` :202 does for the combined bag). Registered under `town` but it also
  respects the Bags module being on. Test: with `combined = false`, showing `ContainerFrame1` skins it and its items;
  with Bags off, nothing. Size S.
- [x] **S2.5 Loot dialogs.** `MasterLooterFrame` (child of `LootFrame`; `DefaultPanelTemplate` parts `NineSlice`/`Bg`),
  `GroupLootHistoryFrame` (`DefaultPanelFlatTemplate`): `GW.Skin`; the master looter's player buttons `T.Button`. Size S.
- [x] **S2.6 Macro, popups with icon pickers, stopwatch.** `GW.Add("town", "onDemand", "Blizzard_MacroUI",
  { "MacroFrame", "MacroPopupFrame" })`, `"Blizzard_GuildBankUI"` → `GuildBankPopupFrame`, framed `GearManagerPopupFrame`,
  `"Blizzard_TimeManager"` → `StopwatchFrame`, `"Blizzard_Professions"` → `InspectRecipeFrame`. One `GW.SkinIconPicker`
  for the `IconSelectorPopupFrameTemplate` windows (`BorderBox`, `BG` faded; `SelectedIconArea` inset panel; the edit
  box `T.EditBox`; OK/Cancel `T.Button`). Size S.
- [x] **S2.7 Small dialogs.** `GhostFrame` (`T.Button`), `BasicMessageDialog`, `AddonDialog` (`Border` faded, panel,
  buttons). `CurrencyTransferMenu`/`TokenFrame` only if `C_CurrencyInfo` exists and the frames do; otherwise skipped
  silently. Size S.
- [x] **S2.8 Docs and smoke lines.** README sub-bullet for `town`; smoke-test lines: stable (hunter), trainer, shift-click
  a stack, pick up coins from the money frame, Combined bags off and open a bag, master loot in a group, `/macro`, the
  stopwatch. Size S.

---

## 4. S3 — System windows

Files: `Modules/WindowsSystem.lua`, `scripts/tests/windows-system.test.mjs`, own README sub-bullet, its smoke-test subsection (§14 of docs/SMOKE-TEST.md, number fixed there).
Inventory: design §5.3. Group `system`.

- [x] **S3.1 Game options.** `SettingsPanel`: `NineSlice`, `Bg` faded; `T.Panel` with shadow; `ClosePanelButton`
  (`T.CloseButton`), `ApplyButton`, `CloseButton` (`T.Button`), `SearchBox` (`T.EditBox`), `GameTab`/`AddOnsTab`
  (`T.Tab`); `CategoryList` and `SettingsList` inset panels; `Container`/`SettingsCanvas` left to their pages. Fonts via `T.FontObjects({ SettingsListHeader… })` only if those font objects exist on
  Forever (check `Blizzard_Settings_Shared`); otherwise none. Re-skin on `OnShow`. Size M.
- [x] **S3.2 Addon list, chat config, nameplates tutorial.** `AddonList` (`GW.Skin`; its rows' `Backdrop` not touched),
  `ChatConfigFrame` (outer frame + every child whose name ends in `Backdrop`/`Background`: fade and inset panel),
  `NamePlatesTutorial` (`GW.Skin`). Size S.
- [x] **S3.3 Edit Mode windows.** `EditModeManagerFrame` (`Border` faded, `T.Panel` with shadow; `Title`/`LayoutLabel`
  theme font; buttons `T.Button`; the Vanguard note under it from `Core/Movers.lua` must still show: test it),
  `EditModeSystemSettingsDialog`, `EditModeLayoutDialog`, `EditModeImportLayoutDialog`, `EditModeImportLayoutLinkDialog`,
  `EditModeUnsavedChangesDialog` (`Border` faded, panel, buttons). **[VERIFY IN GAME]**: open Edit Mode, move a Blizzard
  frame, save; nothing reports a blocked action. Size M.
- [x] **S3.4 Keybinding, Cooldown Manager settings, click bindings.** `QuickKeybindFrame` (panel behind its banner),
  `CooldownViewerSettings` (`GW.Skin`), `CooldownViewerLayoutDialog`/`CooldownViewerImportLayoutDialog`,
  `GW.Add("system", "onDemand", "Blizzard_ClickBindingUI", { "ClickBindingFrame" })`. Size S.
- [x] **S3.5 Help, report, splash, colour picker, death recap, combat log bar.** `HelpFrame`, `TicketStatusFrame`,
  `ReportFrame`, `ReportCheatingDialog`, `SplashFrame` (panel behind, art kept), `ColorPickerFrame` + `OpacityFrame`
  (`Border`/`Header` faded, panel, buttons; the wheel and swatch untouched),
  `GW.Add("system", "onDemand", "Blizzard_DeathRecap", { "DeathRecapFrame" })`,
  `GW.Add("system", "onDemand", "Blizzard_CombatLog", { "CombatLogQuickButtonFrame_Custom" })` (panel, its filter
  buttons `T.Button`). Size S.
- [x] **S3.6 Docs and smoke lines.** README sub-bullet for `system`; smoke-test lines: Escape → Options, Edit Mode,
  AddOns, `/stopwatch`, the help button, a death on a test character for the recap. Size S.

---

## 5. S4 — Map, finder and Legacy

Files: `Modules/WindowsMap.lua`, `scripts/tests/windows-map.test.mjs`, own README sub-bullet, its smoke-test subsection (§14 of docs/SMOKE-TEST.md, number fixed there).
Inventory: design §5.4. Group `map`.

- [x] **S4.1 World map.** `WorldMapFrame`: `GW.Skin` applied to `WorldMapFrame.BorderFrame` (it carries the
  `NineSlice`, `TitleContainer`, `CloseButton`, `MaximizeMinimizeFrame`), `Underlay` and the four vignettes faded,
  `NavBar` (made in Lua on load, `Blizzard_WorldMap.lua:343`: `overlay` faded, `homeButton`, `overflow` and the crumb
  buttons via `T.Button`), `SidePanelToggle` (`:349`) buttons, `Tutorial` button. Keep `ScrollContainer` and every map canvas untouched. Re-skin on `OnShow` and after
  `WorldMapFrame:SynchronizeDisplayState` (hooksecurefunc, guarded) because minimising rebuilds the border. The
  coordinate line from `Modules/Waypoints.lua:162` must still sit along the bottom: test it. Size M.
- [x] **S4.2 Quest log inside the map.** Only when Vanguard's quest log is off (`ns.GetModule("QuestLog")` nil or its
  setting off, as `Modules/Windows.lua:232` `replaced` does for the quest dialog): `QuestMapFrame` (`DetailsFrame`,
  `QuestsFrame` art faded, inset panels; their scroll bars are S7's), `QuestLogPopupDetailFrame` (`GW.Skin`). Size S.
- [x] **S4.3 Battlefield map.** `GW.Add("map", "onDemand", "Blizzard_BattlefieldMap", { "BattlefieldMapFrame" })` with
  the same `BorderFrame` treatment; `BattlefieldMapTab` via `T.Button`. Size S.
- [x] **S4.4 Vanilla group finder.** `GW.Add("map", "onDemand", "Blizzard_GroupFinder_VanillaStyle", { "LFGParentFrame",
  "LFGListingFrame", "LFGBrowseFrame" })`: `LFGParentFrame` gets `T.Panel` with shadow, `$parentCloseButton`
  (`T.CloseButton`), its `$parentPortrait` faded; the two child frames' `NineSlice`/`Bg` faded (no close button of their
  own); `LFGBrowseSearchEntryTooltip` via `T.Tooltip`; the listing's edit boxes `T.EditBox`, its buttons `T.Button`;
  `Tab1-3` are S7's. Size M.
- [x] **S4.5 Legacy system.** `GW.Add("map", "onDemand", "Blizzard_LegacySystem", { "LegacySystemFrame" }, GW.SkinLegacy)`:
  `GW.Skin`; `TreePage`, `ChallengesPage`, `RewardTrackPage` background art faded with inset panels (the trees'
  `TalentFrameBaseTemplate` art: `Background`, `BottomBar`, side art; the node buttons untouched); `TabIndicators` and
  the three tabs are S7's. **[DECIDE]** (design §6.1) the tracker; this task assumes (c), the window only, and says so
  in the commit body. Size M.
- [x] **S4.6 Queue status.** `QueueStatusFrame` via `T.Tooltip` on `OnShow`; its `QueueStatusFrame` entries' art faded.
  Size S.
- [x] **S4.7 Calendar, first pass.** `GW.Add("map", "onDemand", "Blizzard_Calendar", { "CalendarFrame", … })`: the
  outer frame's corner/edge textures (`CalendarFrame` `$parentTopLeft`…) faded, `T.Panel` with shadow, `CalendarCloseButton`,
  the month buttons, the day grid buttons' `Backdrop`-like textures faded with an inset panel each, the seven dialogs
  (`CalendarViewHolidayFrame`, `CalendarViewRaidFrame`, `CalendarViewEventFrame`, `CalendarCreateEventFrame`,
  `CalendarMassInviteFrame`, `CalendarEventPickerFrame`, `CalendarTexturePickerFrame`) with `GW.Skin`. Event icons kept.
  Can be dropped if it runs long: say so in the PR. Size L.
- [x] **S4.8 Docs and smoke lines.** README sub-bullet for `map`; smoke-test lines: `M`, minimise/maximise the map,
  the finder eye, the Legacy button on the menu bar, `/calendar`. Size S.

---

## 6. S5 — Menus and tooltips

Files: `Modules/WindowsMenus.lua`, `Modules/Tooltips.lua`, `scripts/tests/windows-menus.test.mjs`, `scripts/tests/tooltip.test.mjs`,
own README sub-bullet, its smoke-test subsection (§14 of docs/SMOKE-TEST.md, number fixed there). Inventory: design §5.5 and §3.4. Group `menus`.

- [x] **S5.1 12.x context menus.** `EventRegistry:RegisterCallback("MenuProxy.OnShow", fn, GW)` (guarded on the registry
  and on `RegisterCallback` existing): `fn(_, menu)` fades `menu`'s texture regions (the Compositor's background is a
  region of the menu frame) and `T.Tooltip(menu)` once per frame (menus are pooled: `menu.vgMenu` flag; fade again every
  show). On Camelot also fade `FrameGlow`. Nothing on the menu's buttons. **[VERIFY IN GAME]**: right-click a party
  member → Whisper, Set Focus, Leave Party; the minimap tracking menu; a chat tab's menu; no "Interface action failed
  because of an AddOn". If an action is blocked, drop this task and record it. Test: the stub's `world.trigger("MenuProxy.OnShow", frame)`
  (`scripts/lib/wow-world.lua:164`) paints the frame; a second trigger paints nothing new; without `EventRegistry`
  nothing errors. Size M.
- [x] **S5.2 Legacy dropdowns.** `DropDownList1-3`: on `OnShow`, `Backdrop` and `MenuBackdrop` (child frames) to alpha 0,
  `Border` faded, `T.Tooltip(list)`; the list buttons' highlight kept. Size S.
- [x] **S5.3 More tooltips.** `Modules/Tooltips.lua`, `TT.NAMES` (:22): append `ItemRefShoppingTooltip1`,
  `ItemRefShoppingTooltip2`, `GameNoHeaderTooltip`, `GameSmallHeaderTooltip`, `BuffFrameTooltip`, `QuickKeybindTooltip`,
  `SettingsTooltip`, `PartyMemberBuffTooltip`, `AutoCompleteBox`; each skipped when the client lacks it (the loop already
  does). `LFGBrowseSearchEntryTooltip` is S4's. Test (`tooltip.test.mjs`): the new names are skinned when present. Size S.
- [x] **S5.4 Docs and smoke lines.** README sub-bullet for `menus`; smoke-test lines: the unit menu, the tracking menu,
  a dropdown in the auction house, the buff tooltip. Size S.

---

## 7. S6 — HUD leftovers

Files: `Modules/SwingTimer.lua`, `Modules/PlayerAuras.lua`, `Modules/CastBars.lua`, `Modules/SpecialBars.lua`,
`Modules/Merchant.lua`, their test files (`special.test.mjs`, `auras.test.mjs`, `casts.test.mjs`, `vendor.test.mjs`),
the "Combat timers"/"Your buffs"/"Action bars" README bullets (one sentence each), own smoke-test subsection.
Inventory: design §5.6. No new group: each change lives under its module's own settings.

- [x] **S6.1 The game's swing timers.** `Modules/SwingTimer.lua`: while `SW.Wanted` (:99) is true, hide
  `SwingTimerMainHandFrame`, `SwingTimerOffHandFrame`, `SwingTimerRangedFrame` the way `UF.HideBlizzard`
  (`Modules/UnitFrames.lua:458`) does (they are not secure; out of combat all the same); while it is false, skin them:
  `StatusBar` via `T.StyleBar`, `Background`/`Border` faded, `TimeLabel`/`TypeLabel` theme font, `TypeLabelShadow`
  hidden. The game shows them only with the `showSwingTimer` CVar on, so a stub test defines the frames and checks both
  paths. **[VERIFY IN GAME]** with the CVar on. Size S.
- [x] **S6.2 The other aura frames.** `Modules/PlayerAuras.lua`, `PA.BLIZZARD` (:24): append `ExternalDefensivesFrame`,
  `DeadlyDebuffFrame`; `UF.HideBlizzard` skips a missing one already. README: "your buffs and debuffs (and the external
  defensives and deadly debuff frames of newer clients)". Size S.
- [x] **S6.3 The crafting cast bar.** `Modules/CastBars.lua`: skin `OverlayPlayerCastingBarFrame` (not hidden: it is the
  bar over the professions window while crafting): `T.StyleBar`, its `Border`/`Background`/`Flash` faded, `Text` in the
  theme font; on `OnShow`, once. Size S.
- [x] **S6.4 Possess bar.** `Modules/SpecialBars.lua`: add `skinPossess = { "PossessButton", 2 }` beside `skinPet` (:28),
  default on, through `SB.Skin` (:56). Size S.
- [ ] **S6.5 Fonts on the HUD text.** `T.FontObjects` on `ErrorFont` (the `UIErrorsFrame` line, next to
  `Modules/Merchant.lua:95`), `ZoneTextFont`, `SubZoneTextFont`, `PVPInfoTextFont`, `PVPArenaTextString`'s font, each
  only if the object exists. Size S.
- [ ] **S6.6 Smoke lines.** Toggle the game's swing timer, mind-control an enemy (priest), craft something, enter a zone.
  Size S.

---

## 8. S7 — Tabs and inner parts

Files: `Modules/WindowsTabs.lua`, `scripts/tests/windows-tabs.test.mjs`, own README sub-bullet, its smoke-test subsection (§14 of docs/SMOKE-TEST.md, number fixed there).
Inventory: design §5.8. Group `tabs`. Depends on `T.Tab` and `T.ScrollBar` (S0).

- [ ] **S7.1 Tab buttons on framed windows.** On each window already registered (read `GW.FRAMED` and `GW.ON_DEMAND`
  at `Enable`, don't re-list them): for every button in `frame.Tabs` (parentArray of `PanelTabButtonTemplate`), every
  `_G[name .. "Tab" .. i]` for i = 1..8 that exists, and `frame.TabSystem`'s buttons when present (`TabSystem:GetTabButton`?
  check `Blizzard_SharedXML/Shared/TabSystem/TabSystem.lua` for the accessor and use it guarded), call `T.Tab`. Hook the
  window's `OnShow` so tabs the game adds later are covered. Size M.
- [ ] **S7.2 Side tabs.** The Camelot character pane (`CharacterFrame.CharacterTab`, `ReputationTab`, `SkillsTab`, `PvPTab`,
  `CurrencyTab`, `StatisticsTab`; `CharacterFrame.TabIndicators` faded), `CommunitiesFrame` (`ChatTab`, `RosterTab`,
  `GuildBenefitsTab`, `GuildInfoTab`, `GuildPreferredPlaySettingsTab`) and `LegacySystemFrame` (`LegacyTreeTab`,
  `LegacyChallengeTab`, `LegacyRewardTrackTab`, `TabIndicators`), `InspectFrame` tabs, `LFGParentFrameTab1-3`: `T.Tab`.
  Size S.
- [ ] **S7.3 Inside the character pane.** `ReputationFrame` rows' bars (`T.StyleBar`; the rows come from a `ScrollBox`:
  on acquire), `SkillsFrame` rows' bars, `TokenFrame` rows, `PVPRankFrame` art faded, `EquipmentFlyoutFrame` (`T.Panel`
  on show; its buttons through `ns.GetModule("Bags").SkinItem`, exported by S0.9), `PaperDollFrame`'s stat category boxes (`CharacterStatsPane` categories: `Background` faded, inset
  panel). The gear slots keep their durability labels from `Modules/Windows.lua:268`. Size M.
- [ ] **S7.4 Scroll bars.** On every registered window on show: any child or `parentKey` named `ScrollBar`, and
  `.ScrollBox`'s paired bar, through `T.ScrollBar`. Size S.
- [ ] **S7.5 Docs and smoke lines.** README sub-bullet for `tabs`; smoke-test lines: click every tab on the character
  pane, friends, mail, merchant, spellbook; scroll the reputation list. Size S.

---

## 9. S8 — PvP (start only when battlegrounds are live on Forever)

Files: `Modules/WindowsPvP.lua`, `scripts/tests/windows-pvp.test.mjs`. Inventory: design §5.7. Group `pvp`.

- [ ] **S8.1 Scoreboards.** `PVPMatchScoreboard`, `PVPMatchResults`: their `Content`/`Background` art faded, `T.Panel`
  with shadow, header buttons `T.Button`, the table's rows untouched. Size M.
- [ ] **S8.2 Queue dialogs.** `PVPReadyDialog`, `PVPReadyPopup`, `PVPRoleCheckPopup`, `PVPFramePopup`: `Border` faded,
  panel, buttons; as `"popups"`. Size S.
- [ ] **S8.3 Objectives and timer.** `UIWidgetTopCenterContainerFrame`, `UIWidgetBelowMinimapContainerFrame`: a flat
  panel behind each widget container only while it has children (hook `OnSizeChanged`); `TimerTracker` bars via
  `T.StyleBar` on creation (hooksecurefunc `TimerTracker_OnEvent`, guarded); `PvPObjectiveBannerFrame` fonts. Size M.
- [ ] **S8.4 Honor tab.** `PVPRankFrame` (if S7.3 left it): art faded, rank bar `T.StyleBar`. Size S.
- [ ] **S8.5 Docs and smoke lines.** Size S.

---

## 10. Prompt for the implementing sessions

Paste the block below as the first message of a session opened in a clone (or worktree) of `clifftaylor2325/wow-vanguard-ui`
on the owner's machine, with `<STREAM>` replaced (`S0`, `S1`, …) and the model and effort set as §0 suggests.

```text
You are working in the Vanguard repository (a World of Warcraft addon for WoW Forever, written in Lua 5.1 with a Node/Vitest test harness). Your instructions are in docs/handoff/RESKIN-PLAN.md; the design it carries out is docs/design/RESKIN.md. Read both in full before doing anything else, then README.md, then docs/handoff/WORKPLAN.md section 0 (the repository's rules).

Carry out stream <STREAM> of the reskin plan, task by task, in order:
- Work on the branch the plan names for the stream, started from origin/main (S0 must already be merged unless you are S0). Edit only the files the stream's header lists plus your own README sub-bullet and smoke-test subsection; append to the end of a list when you must add a global to .luacheckrc or a method to scripts/lib/wow-widget-api.lua (only after confirming it exists in Blizzard's Forever source: git clone --depth 1 --branch forever https://github.com/Gethe/wow-ui-source).
- One task = one commit, subject "<task id> <area>: <change>". Before each task read every file it names in full. Make the change, write the test in the stream's test file (the pattern is in the plan's section 0), and tick the task's checkbox in docs/handoff/RESKIN-PLAN.md in the same commit.
- Tests run only on this machine: after each task run npm run verify and npm run coverage (floor 100 % of lines; never lower it), npm run lint if luacheck is installed, and node scripts/build-media.mjs --check if you touched Media/ or scripts/lib/media-sources.mjs. If npm ci fails with HTTP 403 host_not_allowed you are in a sandbox: write the code and tests anyway, run luac5.1 -p on changed Lua files, and list in the PR exactly which commands you could not run. Ignore GitHub CI entirely: don't wait for it, don't read it, don't change .github/.
- Obey the repository's enforced rules: a comment above every function, at most 10 code lines per function body, no colour or font-size literals outside Core/Theme.lua, every WoW global in .luacheckrc read_globals, every widget method in scripts/lib/wow-widget-api.lua.
- Obey the skinning rules in docs/design/RESKIN.md section 4: fade art by alpha, never Hide() unless the design says so; skin on OnShow and on the game call that redraws the frame; every part is optional (type checks); on secure frames touch textures and font strings only, never attributes, anchors or parents, and nothing in combat (ns.OutOfCombat); parchment text goes light after the game colours it.
- You cannot run the game. For tasks tagged [VERIFY IN GAME], implement and test under the stub, then list them in the PR under "needs in-game check" with the smoke-test line that checks them. Never claim in-game behaviour you did not observe.
- Stop and ask only for a task tagged [DECIDE] when the decision changes the implementation; otherwise make the smallest reasonable choice and record it in the commit body.

When the stream is complete: git fetch origin main && git rebase origin/main, run the local checks once more, and open one pull request for the branch with: the tasks done (ids, one line each), the tests added, anything skipped and why, and the "needs in-game check" list. Then give me a short summary in chat (under 200 words).
```

## 11. Done list

Move finished streams here with the PR number: `- S0 foundation (PR #…)`.
