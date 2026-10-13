# Design: the rest of the game's frames in the Vanguard look

Written 2026-10-06 against commit `757c0c7` (v0.4.0, after PR #125), from Blizzard's UI source for WoW Forever
(`github.com/Gethe/wow-ui-source`, branch `forever`, build 1.60.1.70235, commit `a84e2b1`). The work plan that
carries this out is `docs/handoff/RESKIN-PLAN.md`. If a `file:line` here has moved, grep for the identifier quoted next to it.

## 1. What "skinned" means in Vanguard

A game frame is skinned when it keeps its own layout, buttons and behaviour, and only its look changes:

- its template art (textures) is faded to alpha 0, never hidden (`T.FadeRegions`, `Core/Theme.lua:467`), so the game's
  own show/hide and layout code keeps working;
- a flat slate panel with a one-pixel border is painted behind it (`T.Panel`, `Core/Theme.lua:536`; floating windows get
  `shadow = true`), and the close button, title font and push buttons are themed (`T.CloseButton`, `T.Text`, `T.Button`);
- it is done on every `OnShow` and after every game call that redraws the frame, because the game restores art as it
  pleases; painting again never piles up (`painted` table in Theme.lua: a frame is painted once, then repainted).

Three things are *not* skinning and stay out of this plan: hiding a game frame because Vanguard draws its own (unit
frames, bars, buffs, cast bars, the quest tracker: `UF.HideBlizzard`, `Modules/UnitFrames.lua:458`; `DB.Suppress`,
`Modules/DataBars.lua:183`), replacing a game window with a Vanguard one (quest dialog, quest log), and changing what a
window does. `Modules/Windows.lua` is the home of window skins; `Modules/Tooltips.lua`, `Modules/Bags.lua`,
`Modules/GameTools.lua`, `Modules/GameAlerts.lua`, `Modules/MenuStrip.lua` (the game's tracker) and `Core/GameMenu.lua`
skin the frames their feature owns.

## 2. Where the gap list comes from (so it can be redone)

Blizzard's TOC files gate every file and addon by game type: a line or an addon tagged `[AllowLoadGameType ...]` loads
only for the types named, `[ExcludeLoadGameType camelot]` never loads on Forever, `[Family]` resolves to `Mainline/` and
`[Game]` to `Camelot/`. On Forever the matching tokens are `camelot` and `mainline`. Resolving every TOC that way gives
285 addons that load on Forever and 63 that do not (among the latter: `Blizzard_EncounterJournal`, `Blizzard_GroupFinder`,
`Blizzard_PVPUI`, every `Blizzard_Housing*`, `Blizzard_ExpansionLandingPage`). Reading the named, non-virtual top-level
frames out of the XML and `CreateFrame("…", "Name"` calls of those files gives about 660 frames; the ones that matter
are the `UIPanelWindows` entries in `Blizzard_UIParent/UIParent.lua` that an addon on Forever actually defines, plus the
HUD frames parented to `UIParent`. Section 5 of this doc is that list after subtracting what Vanguard already handles.

To redo it after a Blizzard update: `git clone --depth 1 --branch forever https://github.com/Gethe/wow-ui-source`, read
`Interface/AddOns/*/*.toc` with the rules above, then grep the surviving `.xml` files for `^\t<[A-Z]\w* … name="…"` (a tag
indented by exactly one tab is a child of `<Ui>`) and the `.lua` files for `CreateFrame\("\w+", "(\w+)"`.

## 3. Architecture: one registry, one file per area

Today `Modules/Windows.lua` owns four lists (`GW.FRAMED` :19, `GW.POPUPS` :24, `GW.TIMERS` :25, `GW.ON_DEMAND` :29) and one
skin (`GW.Skin` :89), and `watchAll` (:247) hooks every name at `PLAYER_LOGIN`. Seven streams adding to those lists at
once would conflict on every merge, and most new windows need a little more than `GW.Skin` (a parchment to fade, an
extra button, a second frame to dress). So:

### 3.1 The registry (`Modules/Windows.lua`)

```lua
-- Registers windows for a group. kind: "framed" (skinned now and on every show), "onDemand" (the first
-- argument is the Blizzard addon that loads them), "popups". skin: a function(frame) or nil for GW.Skin.
-- Called at file scope by Modules/Windows<Area>.lua; Windows.Enable (PLAYER_LOGIN) reads what was registered.
function GW.Add(group, kind, names, skin)            -- GW.Add("social", "framed", { "OpenMailFrame" })
function GW.Add(group, "onDemand", addon, names, skin)  -- GW.Add("map", "onDemand", "Blizzard_LegacySystem", { "LegacySystemFrame" }, GW.SkinLegacy)
function GW.AddButtons(name, buttonNames)             -- push buttons a window keeps outside Button1-4 (today GW.EXTRA_BUTTONS)
```

- `GW.GROUPS = { "windows", "popups", "timers", "social", "town", "system", "map", "menus", "tabs", "pvp" }`; every
  group is a boolean in `GW.defaults` (`Modules/Windows.lua:16`) and a row under Game windows
  (`Core/Options.lua:418`, `windowRows`). The existing lists are re-expressed as `GW.Add("windows", …)` calls so there is
  one path.
- `watch(name, skin)` (:238) gains the group check: a name registered under a group whose setting is false is never
  hooked. `GW.QUEST_WINDOWS` (:27) stays as it is.
- `onLoaded` (:252) looks up `GW.ON_DEMAND[addon]` as today; `GW.Add("…", "onDemand", …)` appends to it. A window
  registered on demand whose addon is already loaded (a late registration) is watched at once.
- Load order: `Modules/Windows.lua` stays at `Vanguard.toc:94`; the area files go right after it in the TOC and open with
  `local GW = ns.GetModule("Windows")` (the pattern `Modules/ActionBarLayout.lua:21` and `Modules/QuestDialogView.lua:11`
  use). Registration happens at file scope, which is before `PLAYER_LOGIN`, so `GW.Enable` sees everything.
- `Blizzard_EncounterJournal` → `EncounterJournal` is dropped from the on-demand list: the addon never loads on Forever
  (`## AllowLoadGameType: standard, classic`). `Blizzard_Collections` stays (it loads, behind the `CollectionsPanelDisabled`
  game rule).

### 3.2 Area files (one per stream, file-disjoint)

| File | Group | What goes in it |
|---|---|---|
| `Modules/WindowsSocial.lua` | `social` | mail reading, guild (Communities), channels, friends sub-dialogs, guild creation (registrar, petition, tabard), role poll |
| `Modules/WindowsTown.lua` | `town` | stable, trainer, side dress-up, stack split, coin pickup, separate bag windows, master looter, loot history, macro, stopwatch, small dialogs |
| `Modules/WindowsSystem.lua` | `system` | game options, addon list, chat config, Edit Mode windows, quick keybind, Cooldown Manager settings, help/ticket/report, splash, color picker, click bindings, death recap |
| `Modules/WindowsMap.lua` | `map` | world map, battlefield map, calendar, vanilla group finder, Legacy system, queue status |
| `Modules/WindowsMenus.lua` + `Modules/Tooltips.lua` | `menus` | the 12.x context-menu system, `DropDownList1-3`, the tooltips not yet in `TT.NAMES`, auto-complete box |
| `Modules/WindowsTabs.lua` | `tabs` | tab buttons on every skinned window, the character pane's sub-panels, scroll bars inside skinned windows |
| `Modules/WindowsPvP.lua` | `pvp` | battleground scoreboards, queue-ready dialogs, objective widgets, the match timer (only once battlegrounds are live on Forever) |
| HUD leftovers | (own modules) | edits inside `SwingTimer.lua`, `PlayerAuras.lua`, `CastBars.lua`, `SpecialBars.lua`, `Merchant.lua`: see §5.6 |

Each area file holds its `GW.Add` calls, any window-specific skin functions (`GW.SkinWorldMap`, …) and nothing else.
Each has its own test file `scripts/tests/windows-<area>.test.mjs`, built on the `WINDOWS_ENV`/`__window()`/`windowState()`
helpers that `scripts/tests/more.test.mjs:2475-2497` define today (the foundation stream moves them into
`scripts/tests/helpers.mjs` so every area file can import them).

### 3.3 New theme primitives (`Core/Theme.lua`, exported through `Core/Skin.lua:17`)

The windows left to do share four parts that `T.Panel`/`T.Button` do not cover. They become primitives, so area files
and other addons (the skin API; `apiVersion` stays 1 because the table only grows) get one implementation:

- **`T.Tab(button)`** — a tab button in the theme. Three Blizzard tab templates exist on Forever and the primitive handles
  all of them by the parts it finds: `PanelTabButtonTemplate` (parts `Left`, `Middle`, `Right`, `LeftActive`,
  `MiddleActive`, `RightActive`, `LeftHighlight`, `MiddleHighlight`, `RightHighlight`, `Text`; the friends, mail, merchant,
  inspect and finder tabs), `TabSystemButtonTemplate` (`LeftActive`, `RightActive` and the `TabSystemButtonArtTemplate`
  art; spellbook, professions, Legacy, auction house), `LargeSideTabButtonTemplate` (`Background`, `SelectedTexture`,
  `HighlightTexture`, `Icon`, `Mask`, `TabGlow`; the Camelot character pane's side tabs and the guild window's). Look: the
  art faded, an inset panel, a one-pixel accent line along the top (side tabs: along the inner edge) while the tab is
  selected, the faint white hover. Selected state: Blizzard selects a tab by disabling its button
  (`PanelTemplates_SelectTab`) or by `SetChecked`, so `T.Tab` hooks `OnEnable`/`OnDisable` and, when the button has
  `SetChecked`, post-hooks it, and repaints the accent line from those. Never calls `PanelTemplates_*` itself.
- **`T.Tooltip(frame)`** — what `skin()` in `Modules/Tooltips.lua:29` does today (panel at alpha 0.94 with a shadow,
  `NineSlice` to alpha 0), moved into the theme so the menus stream, the finder tooltip and the queue-status panel use
  it; `Tooltips.lua` calls it.
- **`T.ScrollBar(bar)`** — the two 12.x scroll bars, `MinimalScrollBar` (parts `Back`, `Forward`, `Track`, `Thumb`,
  `Begin`, `Middle`, `End`) and `WowTrimScrollBar` (the same plus `Background`, `Backplate`, `Overlay`): track art faded,
  the thumb's textures faded and a thin raised panel painted on the thumb in the border color (accent under the mouse),
  the arrow buttons' art faded with the Up/Down line icons (`Media/Icons/Down.tga` exists; an Up icon is one new entry in
  `scripts/lib/media-sources.mjs`). Scroll bars inside Vanguard's own windows are already Vanguard's; this is for the
  game's.
- **`T.FontObjects(map)`** — the loop `TT.ApplyFonts` (`Modules/Tooltips.lua:44`) and `MS.SkinTracker`
  (`Modules/MenuStrip.lua:554`, `MS.TRACKER_FONTS` :504) both write: `{ FontObjectName = { size, bold } }` → theme font at
  `T.ScaledSize(size)`, re-applied on `T.OnChanged` (text size, font pick). Used for the zone text, the error line, the
  settings window and the world map fonts.

Everything else stays on the existing primitives. No colour or size literal leaves `Core/Theme.lua`; new tokens (if any)
go next to the existing ones and into `docs/THEME.md`.

### 3.4 The context-menu system (why it is its own stream)

12.x builds every right-click menu, dropdown and chat menu from `Blizzard_Menu` (`MenuTemplateBase`, created by a frame
factory in `Menu.lua:2154`); the menu's background is a texture attached on every open by the Compositor
(`MenuStyle1Mixin:Generate`, `Blizzard_Menu/Mainline/MenuTemplates.lua:53`, atlas `common-dropdown-bg`). The frame itself
never has a `NineSlice`. The one hook the game offers is `EventRegistry:TriggerEvent("MenuProxy.OnShow", menuFrame)`
(`Menu.lua:1805`): register for it, fade the menu's regions and paint a panel. Menus are pooled, so a frame is painted
once and only faded again on each show. The unit popup menu runs secure actions from its buttons; the skin touches only
textures on the menu frame, never a button's attributes, and it is tagged **[VERIFY IN GAME]** for taint
("Interface action failed because of an AddOn" after right-clicking a unit and choosing an action). `EventRegistry` is
already in `.luacheckrc` and modelled by the stub (`scripts/lib/wow-world.lua:164`; `world.trigger` fires it).
`DropDownList1-3` (the old `UIDropDownListTemplate`: `Backdrop` and `MenuBackdrop` child frames, `Border`) are still
loaded on Forever and get the same treatment through their `OnShow`.

### 3.5 What is deliberately left alone

- Frames whose content Vanguard replaces (listed in §1), and the game's Edit Mode handles for them.
- Toast systems that pool and animate their frames (`AlertFrame`, `EventToastManagerFrame`, `BossBanner`,
  `HonorLevelUpBanner`): the art *is* the content; a flat panel behind an achievement toast reads worse than the toast.
- Tutorials and help plates (`TutorialFrame`, `HelpPlate*`, `Blizzard_NewPlayerExperience`): short-lived, and the game
  anchors them to its own frames, some of which Vanguard hides.
- The shop (`CatalogShopFrame`), `RecruitAFriend*`, `SplashFrame` after a first pass: rarely open. (`SocialUIFrame` was listed here; on Forever it is the friends list, `C_SocialUI.IsSystemEnabled()` being on, so `WindowsSocial.lua` skins it: `GW.SkinSocial`.)
- Anything only reachable in content Forever doesn't have (vehicles, pet battles, garrisons, covenants, housing,
  delves, transmog): the addons are present but never asked for.

## 4. Rules every stream follows

1. Fade with alpha, never `Hide()`, except art the game's own code re-shows by alpha (then `Hide()`, as `Modules/Chat.lua`
   and `Modules/GameAlerts.lua` had to).
2. Skin on `OnShow` plus the game call that redraws the frame (`hooksecurefunc` on the mixin method, by name, guarded with
   `type(...) == "function"`), never from a timer.
3. Every client call and part is optional: `type(frame.Part) == "table"` before touching it; a window a client lacks is
   skipped silently (`watch` already does this for the frame itself).
4. Secure frames (anything with `SecureUnitButtonTemplate`, `SecureActionButtonTemplate`, action bars, the menu's
   buttons): textures and font strings only, never attributes, anchors or `SetParent`, and nothing at all in combat
   (`ns.OutOfCombat`).
5. The text the game colours for parchment goes light (`T.Color(fs, "text")`, headings `"gold"`), after the game colours
   it, as `keepTextReadable` (`Modules/Windows.lua:217`) does for quests.
6. A stream never edits another stream's file. Shared files (`README.md`, `docs/SMOKE-TEST.md`, `.luacheckrc`,
   `scripts/lib/wow-widget-api.lua`, `scripts/lib/media-sources.mjs`) are edited only in the spots the foundation stream
   pre-made for the area (its own README sub-bullet, its own smoke-test subsection), appending at the end of a list.

## 5. The inventory (what is left, by area)

"Template" is the Blizzard template on Forever; "parts" are the `parentKey`s the skin needs. ✓ marks what `GW.Skin`
handles with no extra code once the name is registered.

### 5.1 Social and guild (`WindowsSocial.lua`)

| Frame | Loads | Template / parts | Notes |
|---|---|---|---|
| `OpenMailFrame` | login | `ButtonFrameTemplate` ✓; parts `Name`, `ReportSpamButton`; letter body `OpenMailBodyText` (a `SimpleHTML` inside `OpenMailScrollFrame`) on the parchment textures `OpenStationeryBackgroundLeft`/`Right`; redrawn by `OpenMailFrame:Update()` (`OpenMailMixin`) | fade the stationery, body text light like `GW.LightItemText` (a `SimpleHTML` takes `SetTextColor(tag, …)` per tag); `OpenMailReplyButton`, `OpenMailDeleteButton`, `OpenMailCancelButton`, `OpenMailReportSpamButton` via `GW.AddButtons`; `OpenMailLetterButton`/`OpenMailMoneyButton`/`OpenMailAttachmentButton1-16` are item buttons (quality border like the bags) |
| `CommunitiesFrame` | login | `ButtonFrameTemplateMinimizable` ✓; parts `MaximizeMinimizeFrame`, `PortraitOverlay`, `CommunitiesList`, `MemberList`, `Chat`, `StreamDropdown`, `GuildBenefitsFrame`, `GuildDetailsFrame`, side tabs `ChatTab`, `RosterTab`, `GuildBenefitsTab`, `GuildInfoTab`, `GuildPreferredPlaySettingsTab` | the guild window on Forever (the friends window has no guild tab); the side tabs are the tabs stream's |
| `CommunitiesGuildLogFrame`, `CommunitiesGuildNewsFiltersFrame`, `CommunitiesGuildTextEditFrame`, `GuildInviteFrame` | login | `TranslucentFrameTemplate` (`Bg`, `NineSlice`) | panel + close button |
| `CommunitiesSettingsDialog`, `CommunitiesAvatarPickerDialog`, `CommunitiesTicketManagerDialog` | login | plain frames with `Border`/`BG` | low; one pass |
| `ChannelFrame`, `CreateChannelPopup` | login | `ButtonFrameTemplate` ✓ / plain | chat channels window |
| `FriendsFriendsFrame`, `AddFriendFrame`, `BattleNetInviteFrame` | login | `UserScaledFrameTemplate`, `ResizeLayoutFrame` with `Border` | friends sub-dialogs |
| `GuildRegistrarFrame`, `PetitionFrame`, `TabardFrame` | login | `ButtonFrameTemplate` ✓ | vanilla guild creation: registrar text is parchment-coloured (`GuildRegistrarText` in `GuildRegistrarGreetingFrame`, `GuildRegistrarPurchaseText`; set in `GuildRegistrar_OnShow`), the petition's `PetitionFrameCharterTitle`/`PetitionFrameMemberTitle` (set in `PetitionFrame_Update`); the tabard window has a model and colour pickers (leave the pickers' swatches) |
| `GuildRenameFrame` | login | `ButtonFrameTemplate` ✓ | |
| `RolePollPopup`, `LFGInvitePopup` | login | parts `Border` (`DialogBorderTemplate`), `CloseButton`, role buttons, `acceptButton` | Vanguard's raid tools send role polls, so this one shows often |
| `RaidFrame` (the Raid tab inside `FriendsFrame`), `RaidGroup1-8`, `RaidGroupButton1-40` | LoD `Blizzard_RaidUI` | plain frames with textures | the raid roster tab; skin the group boxes and buttons; `RaidParentFrame` (`ButtonFrameTemplate` ✓) only shows on clients that don't parent the tab to the friends window |

### 5.2 Town and items (`WindowsTown.lua`)

| Frame | Loads | Template / parts | Notes |
|---|---|---|---|
| `PetStableFrame` | login (Camelot) | `PortraitFrameTemplate` ✓; parts `Background`, `Border`, `Inset`, `modelScene`, `expBar`, `purchaseButton`, `levelText`, `loyaltyLevel`, `diet` | hunters; `expBar` via `T.StyleBar` |
| `ClassTrainerFrame` | LoD `Blizzard_TrainerUI` | `ButtonFrameTemplate` ✓; parts `BG`, `ScrollBox`, `ScrollBar`, `FilterDropdown`, `TrainButton`, `bottomInset`, `money`, `skillStepButton` | `TrainButton` via `GW.AddButtons`; Vanguard's **Train all** (`Modules/Errands.lua:112`) sits beside it; rows via a `ScrollBox` `OnAcquired` hook: `selectedTex`/`disabledBG`/`lock` kept |
| `SideDressUpFrame` | login | plain; parts `BGTopLeft`, `BGBottomLeft`, `ModelScene`, `ControlFrame`, textures `$parentTop`, `$parentBackgroundTop`, `$parentBackgroundBot` | docks beside the auction house and merchant |
| `StackSplitFrame` | login (Camelot) | parts `SingleItemSplitBackground`, `MultiItemSplitBackground`, `FrameGlow`, `OkayButton`, `CancelButton`, `LeftButton`, `RightButton`, `StackSplitText` | |
| `CoinPickupFrame` | login | textures + `CoinPickupOkayButton`, `CoinPickupCancelButton` | |
| `ContainerFrame1-7` | login | `ContainerFrameTemplate`/`ContainerFrameBackpackTemplate`: `PortraitContainer`, `NineSlice`, `Bg`, `MoneyFrame`, `CloseButton`, item buttons via `EnumerateValidItems` | the separate bag windows when Combined bags is off (`BG.Enable`, `Modules/Bags.lua:202`, returns before skinning anything then); reuse `BG.SkinWindow` (:127) through `ns.GetModule("Bags")` |
| `MasterLooterFrame` | login | `DefaultPanelTemplate`, child of `LootFrame` | vanilla raids use master loot |
| `GroupLootHistoryFrame` | login | `DefaultPanelFlatTemplate` | |
| `MacroFrame`, `MacroPopupFrame` | LoD `Blizzard_MacroUI` | `ButtonFrameTemplate` ✓ / `IconSelectorPopupFrameTemplate` (`BorderBox`, `BG`, `SelectedIconArea`) | |
| `GuildBankPopupFrame` | LoD `Blizzard_GuildBankUI` | `IconSelectorPopupFrameTemplate` | same skin as `MacroPopupFrame` |
| `GearManagerPopupFrame` | login | `IconSelectorPopupFrameTemplate`, child of `PaperDollFrame` | equipment sets exist on Forever |
| `StopwatchFrame` | LoD `Blizzard_TimeManager` | textures + play/pause/reset buttons | |
| `InspectRecipeFrame` | LoD `Blizzard_Professions` | `PortraitFrameTemplateNoCloseButton` | |
| `GhostFrame` | login | `UIPanelLargeSilverButton` | `T.Button` |
| `BasicMessageDialog`, `AddonDialog` | login | `Border`, `Text`, `Button` | |
| `CurrencyTransferMenu`, `TokenFrame` | login (Camelot) | plain | only if Forever shows currencies; probe and skip |

### 5.3 System windows (`WindowsSystem.lua`)

| Frame | Loads | Template / parts | Notes |
|---|---|---|---|
| `SettingsPanel` | login | `SettingsFrameTemplate` (`NineSlice`, `Bg`, `ClosePanelButton`, `Text`) plus `GameTab`, `AddOnsTab`, `CategoryList`, `Container`, `SettingsList`, `SettingsCanvas`, `SearchBox`, `ApplyButton`, `CloseButton`, `OutputText` | the game's options; fonts through `T.FontObjects` |
| `AddonList` | login | `ButtonFrameTemplate` ✓ | |
| `ChatConfigFrame` | login | plain, many `Backdrop` children | one pass on the outer frame and its section boxes |
| `EditModeManagerFrame` | login | `ResizeLayoutFrame`; parts `Border`, `Title`, `LayoutLabel` | Vanguard already pins a note under it (`Core/Movers.lua`); skin only, keep the note |
| `EditModeSystemSettingsDialog`, `EditModeLayoutDialog`, `EditModeImportLayoutDialog`, `EditModeImportLayoutLinkDialog`, `EditModeUnsavedChangesDialog` | login | `EditModeBaseDialogTemplate` (`Border`) | |
| `QuickKeybindFrame` | login | `QuickKeybindFrameTemplate` | the game's keybind mode banner |
| `CooldownViewerSettings`, `CooldownViewerLayoutDialog`, `CooldownViewerImportLayoutDialog` | login | `ButtonFrameTemplate` ✓ / dialog templates | `Modules/GameTools.lua` skins the viewers themselves, not this window |
| `ClickBindingFrame` | LoD `Blizzard_ClickBindingUI` | `PortraitFrameTemplate` ✓ | Vanguard's click-casting page opens it |
| `HelpFrame`, `TicketStatusFrame`, `ReportFrame`, `ReportCheatingDialog` | login | `DefaultPanelTemplate` / `SharedReportFrameTemplate` | |
| `SplashFrame` | login | plain, big art | panel behind, art kept |
| `ColorPickerFrame`, `OpacityFrame` | login | plain with `Border`/`Header` | |
| `DeathRecapFrame` | LoD `Blizzard_DeathRecap` | plain | |
| `CombatLogQuickButtonFrame_Custom` | LoD `Blizzard_CombatLog` | child of `ChatFrame2` | the combat log's filter bar |
| `NamePlatesTutorial` | login | `ButtonFrameTemplate` ✓ | |

### 5.4 Map, finder and Legacy (`WindowsMap.lua`)

| Frame | Loads | Template / parts | Notes |
|---|---|---|---|
| `WorldMapFrame` | login | `WorldMapFrameTemplate`: `BorderFrame` (`PortraitFrameTemplateMinimizable`: `NineSlice`, `TitleContainer`, `CloseButton`, `MaximizeMinimizeFrame`), `Tutorial`, `Underlay`, `TopLeftVignette`…`BottomRightVignette`, `ScrollContainer`; made in Lua on load: `NavBar` (`WorldMapNavBarTemplate`: `overlay`, `overflow`, `homeButton`, crumb buttons from `NavBar_Initialize`) and `SidePanelToggle` (`Blizzard_WorldMap.lua:343-349`) | skin `BorderFrame` with `GW.Skin`; `NavBar.overlay` faded and its buttons via `T.Button`; `Modules/Waypoints.lua:162` already adds the coordinate line; `QuestMapFrame`/`QuestLogPopupDetailFrame` (`ButtonFrameTemplate` ✓) matter only with Vanguard's quest log off |
| `BattlefieldMapFrame`, `BattlefieldMapTab` | LoD `Blizzard_BattlefieldMap` | `MapCanvasFrameTemplate` + `BorderFrame` | |
| `LFGParentFrame`, `LFGListingFrame`, `LFGBrowseFrame`, `LFGBrowseSearchEntryTooltip` | LoD `Blizzard_GroupFinder_VanillaStyle` | plain + `PortraitFrameTemplateNoCloseButton`; `$parentCloseButton`, tabs `Tab1-3`; tooltip `TooltipBackdropTemplate` | the group-finder eye opens this on Forever |
| `LegacySystemFrame` | LoD `Blizzard_LegacySystem` (camelot only) | `PortraitFrameTemplate` ✓; parts `TreePage`, `ChallengesPage`, `RewardTrackPage`, tabs `LegacyTreeTab`, `LegacyChallengeTab`, `LegacyRewardTrackTab`, `TabIndicators` | Forever's own system (Adventure, Professions and Progression trees, challenges, a reward track). Its tracker is a module of `ObjectiveTrackerFrame`, which Vanguard's own tracker hides (`Modules/QuestTracker.lua:139`): **[DECIDE]** whether Vanguard's tracker should list Legacy challenges, or the game's tracker should stay visible for them |
| `CalendarFrame` + `CalendarViewHolidayFrame`, `CalendarViewRaidFrame`, `CalendarViewEventFrame`, `CalendarCreateEventFrame`, `CalendarMassInviteFrame`, `CalendarEventPickerFrame`, `CalendarTexturePickerFrame` | LoD `Blizzard_Calendar` | hand-drawn textures, no template | size L; a first pass fades the frame art and panels the outer window and the day grid; leave the event icons |
| `QueueStatusFrame` | login | `TooltipBackdropTemplate` | the eye's status panel; `T.Tooltip` |
| `TimeManagerFrame` ✓ | LoD | already registered | |

### 5.5 Menus and tooltips (`WindowsMenus.lua`, `Tooltips.lua`)

| Frame | Loads | Parts | Notes |
|---|---|---|---|
| Menus from `Blizzard_Menu` | login | `MenuTemplateBase` (`ResizeLayoutFrame`; on Camelot also `FrameGlow`, jump hints), background attached per open | `EventRegistry` `MenuProxy.OnShow`; §3.4 |
| `DropDownList1-3` | login | `UIDropDownListTemplate`: `Backdrop`, `MenuBackdrop` (child frames), `Border` | legacy dropdowns some panels still use |
| `ItemRefShoppingTooltip1/2`, `GameNoHeaderTooltip`, `GameSmallHeaderTooltip`, `BuffFrameTooltip`, `QuickKeybindTooltip`, `SettingsTooltip`, `PartyMemberBuffTooltip`, `AutoCompleteBox`, `LFGBrowseSearchEntryTooltip` | login/LoD | `GameTooltipTemplate` / `TooltipBackdropTemplate` (`NineSlice`) | add to `TT.NAMES` (`Modules/Tooltips.lua:22`), or `T.Tooltip` for the LoD ones from their area file |

### 5.6 HUD leftovers (inside the owning modules)

| Frame | Loads | Owner | Change |
|---|---|---|---|
| `SwingTimerMainHandFrame`, `SwingTimerOffHandFrame`, `SwingTimerRangedFrame` | login (camelot only; `showSwingTimer` CVar) | `Modules/SwingTimer.lua` | the game's own swing timer. While Vanguard's is on (`SW.Wanted`, :99): hide them as `UF.HideBlizzard` does (not secure). While it is off: skin them (`StatusBar` via `T.StyleBar`, `Background`/`Border` faded, `TimeLabel`/`TypeLabel` in the theme font) |
| `ExternalDefensivesFrame`, `DeadlyDebuffFrame` | login (camelot) | `Modules/PlayerAuras.lua` | add to `PA.BLIZZARD` (:24): they are the 12.x companions of the buff and debuff frames Vanguard hides; a probe skips a client without them |
| `OverlayPlayerCastingBarFrame` | login | `Modules/CastBars.lua` | **skin, don't hide**: it is the cast bar shown over the professions window while crafting. `T.StyleBar` and the theme font on `Text`; not added to `BLIZZARD` (:29) |
| `PossessActionBar` buttons | login | `Modules/SpecialBars.lua` | mind control: add `PossessButton` (2 buttons) next to `skinPet`/`skinStance` (:28) |
| `UIErrorsFrame`, `ZoneTextFrame`, `SubZoneTextFrame` | login | `Modules/Merchant.lua:95` already holds the error line; fonts | `T.FontObjects` on `ErrorFont`, `ZoneTextFont`, `SubZoneTextFont`, `PVPInfoTextFont` |
| `TimerTracker` | login | — | the battleground start countdown; pooled bars; pvp stream |

### 5.7 PvP (`WindowsPvP.lua`; start when battlegrounds are live on Forever)

`PVPMatchScoreboard`, `PVPMatchResults` (login on camelot), `PVPReadyDialog`, `PVPReadyPopup`, `PVPRoleCheckPopup`,
`PVPFramePopup` (`Blizzard_LFGUtil`), `UIWidgetTopCenterContainerFrame`, `UIWidgetBelowMinimapContainerFrame` (the
flag and base widgets), `TimerTracker`, `PvPObjectiveBannerFrame`, `PVPRankFrame` (the character pane's honor tab).

### 5.8 Tabs and inner parts (`WindowsTabs.lua`)

Tab buttons on: `FriendsFrameTab1/3/4`, `MerchantFrameTab1/2`, `MailFrameTab1/2`, `InspectFrame` tabs, `CharacterFrame`
side tabs (`CharacterTab`, `ReputationTab`, `SkillsTab`, `PvPTab`, `CurrencyTab`, `StatisticsTab`; Camelot
`CharacterFrameModeSideTabTemplate` = `LargeSideTabButtonTemplate`), `PlayerSpellsFrame`, `ProfessionsFrame`,
`AuctionHouseFrame`, `CollectionsJournal`, `AchievementFrame` and `LegacySystemFrame` tab systems, `LFGParentFrameTab1-3`,
`CommunitiesFrame` side tabs. Inside the character pane: `ReputationFrame` bars (`T.StyleBar`), `SkillsFrame` bars,
`TokenFrame`, `PVPRankFrame`, `EquipmentFlyoutFrame` (`T.Panel`, its buttons as `Modules/Bags.lua` skins item buttons).
Scroll bars (`T.ScrollBar`) on every window already registered that has a `ScrollBar` or `.ScrollBox`'s bar.

## 6. Open decisions (for the owner)

1. **Legacy challenges in the tracker** (§5.4). Vanguard's tracker hides `ObjectiveTrackerFrame`, which carries the
   Legacy challenge module on Forever. Options: (a) Vanguard's tracker grows a Legacy section (reads
   `C_LegacyChallenge`/`C_Traits`, to be confirmed in the source), (b) the game's tracker stays visible with only its
   quest module collapsed while Vanguard's is on, (c) leave it, Legacy progress lives in its window. The plan assumes (c)
   for now and skins the window.
2. **Calendar depth**: a first pass (outer window, day grid, dialogs) or skip it until someone asks. The plan does the
   first pass as the last task of the map stream, so it can be dropped.
3. **Game options (`SettingsPanel`)**: skinning it changes the look of every Blizzard settings page; some players prefer
   it untouched. The plan gives it the `system` switch; default on.
