# Reskin coverage

Every game window Vanguard's skin is registered for, by client. Written from the window registry by `scripts/tests/windows-coverage.test.mjs` (`VG_COVERAGE_WRITE=1` writes it again); don't edit it by hand. The test fails when this page and the registry differ, so a window added to or dropped from `Modules/Windows*.lua` shows up in a pull request's diff.

Group is the switch under Game windows that turns the window's skin off. Made says when the game makes the window: at login, or with a part of the game that loads on demand. Its skin needs lists what the skin is written against (`GW.Needs`): a window that lacks one keeps the game's look, and `/vg status` names it. In game, `/vg status` counts these windows by state (dressed, left as the game's, replaced, switched off, not made yet) and `/vg status windows` lists them.

Not on this page, because they are skinned outside the registry: tooltips, bags and the bank, chat and its bubbles, the cast bar, the pet, stance and extra buttons, the Cooldown Manager, the damage meter, loss of control, the talking head and raid warnings. Not skinned at all yet: the alert toasts, level-up and event toasts, help tips, the barber shop, item socketing and upgrade, the bonus roll, player choice frames and the pet battle interface.

## WoW Forever

145 registered windows: 104 looked for at login, 41 when their part of the game loads.

| Group | Window | Made | Its skin needs |
| --- | --- | --- | --- |
| windows | `CharacterFrame` | at login | - |
| windows | `MerchantFrame` | at login | - |
| windows | `MailFrame` | at login | - |
| windows | `QuestFrame` | at login | - |
| windows | `GossipFrame` | at login | - |
| windows | `TradeFrame` | at login | - |
| windows | `GameMenuFrame` | at login | - |
| windows | `ReadyCheckFrame` | at login | - |
| windows | `FriendsFrame` | at login | - |
| windows | `DressUpFrame` | at login | - |
| windows | `TaxiFrame` | at login | - |
| windows | `ItemTextFrame` | at login | - |
| windows | `GroupLootFrame1` | at login | - |
| windows | `GroupLootFrame2` | at login | - |
| windows | `GroupLootFrame3` | at login | - |
| windows | `GroupLootFrame4` | at login | - |
| windows | `LootFrame` | at login | - |
| popups | `StaticPopup1` | at login | - |
| popups | `StaticPopup2` | at login | - |
| popups | `StaticPopup3` | at login | - |
| popups | `StaticPopup4` | at login | - |
| timers | `MirrorTimerContainer` | at login | `SetupTimer()` |
| windows | `PlayerSpellsFrame` | with `Blizzard_PlayerSpells` | `SpellBookFrame.PagedSpellsFrame, TalentsFrame` |
| windows | `TimeManagerFrame` | with `Blizzard_TimeManager` | - |
| windows | `AuctionHouseFrame` | with `Blizzard_AuctionHouseUI` | `SearchBar, CategoriesList, AuctionHouseFilterButton_SetUp()` |
| windows | `ProfessionsFrame` | with `Blizzard_Professions` | - |
| windows | `InspectFrame` | with `Blizzard_InspectUI` | - |
| windows | `GuildBankFrame` | with `Blizzard_GuildBankUI` | - |
| windows | `CollectionsJournal` | with `Blizzard_Collections` | - |
| windows | `AchievementFrame` | with `Blizzard_AchievementUI` | - |
| windows | `FlightMapFrame` | with `Blizzard_FlightMap` | - |
| social | `OpenMailFrame` | at login | - |
| social | `CommunitiesFrame` | at login | `MemberList, SetDisplayMode()` |
| social | `CommunitiesGuildLogFrame` | at login | - |
| social | `CommunitiesGuildTextEditFrame` | at login | - |
| social | `CommunitiesGuildNewsFiltersFrame` | at login | - |
| social | `GuildInviteFrame` | at login | - |
| social | `CommunitiesSettingsDialog` | at login | - |
| social | `CommunitiesAvatarPickerDialog` | at login | - |
| social | `CommunitiesTicketManagerDialog` | at login | - |
| social | `GuildRenameFrame` | at login | - |
| social | `ChannelFrame` | at login | `ChannelRoster, ChannelList.Update()` |
| social | `CreateChannelPopup` | at login | - |
| social | `FriendsFriendsFrame` | at login | - |
| social | `BattleNetInviteFrame` | at login | - |
| social | `AddFriendFrame` | at login | - |
| social | `SocialUIFrame` | at login | `RefreshTabs()` |
| social | `GuildRegistrarFrame` | at login | - |
| social | `PetitionFrame` | at login | - |
| social | `TabardFrame` | at login | - |
| social | `RolePollPopup` | at login | - |
| social | `LFGInvitePopup` | at login | - |
| social | `RaidFrame` | with `Blizzard_RaidUI` | - |
| social | `RaidParentFrame` | at login | - |
| social | `GuildControlUI` | with `Blizzard_GuildControlUI` | - |
| social | `BNToastFrame` | at login | `ShowToast()` |
| social | `TimeAlertFrame` | at login | - |
| social | `VoiceChatPromptActivateChannel` | at login | - |
| social | `VoiceChatChannelActivatedNotification` | at login | - |
| town | `PetStableFrame` | at login | - |
| town | `ClassTrainerFrame` | with `Blizzard_TrainerUI` | - |
| town | `SideDressUpFrame` | at login | - |
| town | `StackSplitFrame` | at login | - |
| town | `CoinPickupFrame` | at login | - |
| town | `ContainerFrame1` | at login | - |
| town | `ContainerFrame2` | at login | - |
| town | `ContainerFrame3` | at login | - |
| town | `ContainerFrame4` | at login | - |
| town | `ContainerFrame5` | at login | - |
| town | `ContainerFrame6` | at login | - |
| town | `ContainerFrame7` | at login | - |
| town | `MasterLooterFrame` | at login | - |
| town | `GroupLootHistoryFrame` | at login | - |
| town | `MacroFrame` | with `Blizzard_MacroUI` | - |
| town | `MacroPopupFrame` | with `Blizzard_MacroUI` | - |
| town | `GuildBankPopupFrame` | with `Blizzard_GuildBankUI` | - |
| town | `GearManagerPopupFrame` | at login | - |
| town | `StopwatchFrame` | with `Blizzard_TimeManager` | - |
| town | `InspectRecipeFrame` | with `Blizzard_Professions` | - |
| town | `GhostFrame` | at login | - |
| town | `BasicMessageDialog` | at login | - |
| town | `AddonDialog` | at login | - |
| town | `CurrencyTransferMenu` | at login | - |
| town | `AuctionHouseMultisellProgressFrame` | with `Blizzard_AuctionHouseUI` | - |
| system | `SettingsPanel` | at login | - |
| system | `AddonList` | at login | - |
| system | `ChatConfigFrame` | at login | - |
| system | `NamePlatesTutorial` | at login | - |
| system | `EditModeManagerFrame` | at login | - |
| system | `EditModeSystemSettingsDialog` | at login | `UpdateSettings(), UpdateExtraButtons()` |
| system | `EditModeLayoutDialog` | at login | - |
| system | `EditModeImportLayoutDialog` | at login | - |
| system | `EditModeImportLayoutLinkDialog` | at login | - |
| system | `EditModeUnsavedChangesDialog` | at login | - |
| system | `QuickKeybindFrame` | at login | - |
| system | `CooldownViewerSettings` | at login | `RefreshLayout()` |
| system | `CooldownViewerLayoutDialog` | at login | - |
| system | `CooldownViewerImportLayoutDialog` | at login | - |
| system | `CooldownViewerSettingsEditAlert` | at login | - |
| system | `GroupBuffFilterEditVisualAlert` | at login | - |
| system | `MovePadFrame` | with `Blizzard_MovePad` | - |
| system | `ScriptErrorsFrame` | at login | - |
| system | `ClickBindingFrame` | with `Blizzard_ClickBindingUI` | - |
| system | `HelpFrame` | at login | - |
| system | `TicketStatusFrame` | at login | - |
| system | `ReportFrame` | at login | `AnchorMinorCategory()` |
| system | `ReportCheatingDialog` | at login | - |
| system | `SplashFrame` | at login | - |
| system | `ColorPickerFrame` | at login | - |
| system | `OpacityFrame` | at login | - |
| system | `DeathRecapFrame` | with `Blizzard_DeathRecap` | - |
| system | `CombatLogQuickButtonFrame_Custom` | with `Blizzard_CombatLog` | - |
| map | `WorldMapFrame` | with `Blizzard_WorldMap` | `BorderFrame, NavBar, SynchronizeDisplayState()` |
| map | `QuestMapFrame` | at login | `QuestsFrame, QuestLogQuests_Update()` |
| map | `QuestLogPopupDetailFrame` | at login | - |
| map | `BattlefieldMapFrame` | with `Blizzard_BattlefieldMap` | `BorderFrame` |
| map | `LFGParentFrame` | with `Blizzard_GroupFinder_VanillaStyle` | - |
| map | `LFGListingFrame` | with `Blizzard_GroupFinder_VanillaStyle` | `LFGListingCategorySelection_UpdateCategoryButtons()` |
| map | `LFGBrowseFrame` | with `Blizzard_GroupFinder_VanillaStyle` | `LFGBrowseSearchEntry_SetSelection()` |
| map | `LFGWhoListFrame` | with `Blizzard_GroupFinder_VanillaStyle` | - |
| map | `LFGBrowseSearchEntryTooltip` | with `Blizzard_GroupFinder_VanillaStyle` | - |
| map | `LegacySystemFrame` | with `Blizzard_LegacySystem` | `TreePage, ChallengesPage, RewardTrackPage` |
| map | `QueueStatusFrame` | at login | `Update()` |
| map | `CalendarFrame` | with `Blizzard_Calendar` | `CalendarFrame_SetToday()` |
| map | `CalendarViewHolidayFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarViewRaidFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarViewEventFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarCreateEventFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarMassInviteFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarEventPickerFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarTexturePickerFrame` | with `Blizzard_Calendar` | - |
| menus | `DropDownList1` | at login | - |
| menus | `DropDownList2` | at login | - |
| menus | `DropDownList3` | at login | - |
| pvp | `PVPMatchScoreboard` | with `Blizzard_PVPMatch` | - |
| pvp | `PVPMatchResults` | with `Blizzard_PVPMatch` | - |
| pvp | `PVPReadyDialog` | at login | - |
| pvp | `PVPRoleCheckPopup` | at login | - |
| pvp | `PVPFramePopup` | at login | - |
| pvp | `PVPReadyPopup` | at login | - |
| pvp | `UIWidgetTopCenterContainerFrame` | at login | - |
| pvp | `UIWidgetBelowMinimapContainerFrame` | at login | - |
| pvp | `TimerTracker` | at login | - |
| pvp | `PvPObjectiveBannerFrame` | with `Blizzard_PVPUI` | - |
| pvp | `PVPRankFrame` | at login | - |

## Retail

167 registered windows: 108 looked for at login, 59 when their part of the game loads.

| Group | Window | Made | Its skin needs |
| --- | --- | --- | --- |
| windows | `CharacterFrame` | at login | - |
| windows | `MerchantFrame` | at login | - |
| windows | `MailFrame` | at login | - |
| windows | `QuestFrame` | at login | - |
| windows | `GossipFrame` | at login | - |
| windows | `TradeFrame` | at login | - |
| windows | `GameMenuFrame` | at login | - |
| windows | `ReadyCheckFrame` | at login | - |
| windows | `FriendsFrame` | at login | - |
| windows | `DressUpFrame` | at login | - |
| windows | `TaxiFrame` | at login | - |
| windows | `ItemTextFrame` | at login | - |
| windows | `GroupLootFrame1` | at login | - |
| windows | `GroupLootFrame2` | at login | - |
| windows | `GroupLootFrame3` | at login | - |
| windows | `GroupLootFrame4` | at login | - |
| windows | `LootFrame` | at login | - |
| popups | `StaticPopup1` | at login | - |
| popups | `StaticPopup2` | at login | - |
| popups | `StaticPopup3` | at login | - |
| popups | `StaticPopup4` | at login | - |
| timers | `MirrorTimerContainer` | at login | `SetupTimer()` |
| windows | `PlayerSpellsFrame` | with `Blizzard_PlayerSpells` | `SpellBookFrame.PagedSpellsFrame, TalentsFrame` |
| windows | `TimeManagerFrame` | with `Blizzard_TimeManager` | - |
| windows | `AuctionHouseFrame` | with `Blizzard_AuctionHouseUI` | `SearchBar, CategoriesList, AuctionHouseFilterButton_SetUp()` |
| windows | `ProfessionsFrame` | with `Blizzard_Professions` | - |
| windows | `InspectFrame` | with `Blizzard_InspectUI` | - |
| windows | `GuildBankFrame` | with `Blizzard_GuildBankUI` | - |
| windows | `CollectionsJournal` | with `Blizzard_Collections` | - |
| windows | `AchievementFrame` | with `Blizzard_AchievementUI` | - |
| windows | `FlightMapFrame` | with `Blizzard_FlightMap` | - |
| social | `OpenMailFrame` | at login | - |
| social | `CommunitiesFrame` | at login | `MemberList, SetDisplayMode()` |
| social | `CommunitiesGuildLogFrame` | at login | - |
| social | `CommunitiesGuildTextEditFrame` | at login | - |
| social | `CommunitiesGuildNewsFiltersFrame` | at login | - |
| social | `GuildInviteFrame` | at login | - |
| social | `CommunitiesSettingsDialog` | at login | - |
| social | `CommunitiesAvatarPickerDialog` | at login | - |
| social | `CommunitiesTicketManagerDialog` | at login | - |
| social | `GuildRenameFrame` | at login | - |
| social | `ChannelFrame` | at login | `ChannelRoster, ChannelList.Update()` |
| social | `CreateChannelPopup` | at login | - |
| social | `FriendsFriendsFrame` | at login | - |
| social | `BattleNetInviteFrame` | at login | - |
| social | `AddFriendFrame` | at login | - |
| social | `SocialUIFrame` | at login | `RefreshTabs()` |
| social | `GuildRegistrarFrame` | at login | - |
| social | `PetitionFrame` | at login | - |
| social | `TabardFrame` | at login | - |
| social | `RolePollPopup` | at login | - |
| social | `LFGInvitePopup` | at login | - |
| social | `RaidFrame` | with `Blizzard_RaidUI` | - |
| social | `RaidParentFrame` | at login | - |
| social | `GuildControlUI` | with `Blizzard_GuildControlUI` | - |
| social | `BNToastFrame` | at login | `ShowToast()` |
| social | `TimeAlertFrame` | at login | - |
| social | `VoiceChatPromptActivateChannel` | at login | - |
| social | `VoiceChatChannelActivatedNotification` | at login | - |
| town | `PetStableFrame` | at login | - |
| town | `ClassTrainerFrame` | with `Blizzard_TrainerUI` | - |
| town | `SideDressUpFrame` | at login | - |
| town | `StackSplitFrame` | at login | - |
| town | `CoinPickupFrame` | at login | - |
| town | `ContainerFrame1` | at login | - |
| town | `ContainerFrame2` | at login | - |
| town | `ContainerFrame3` | at login | - |
| town | `ContainerFrame4` | at login | - |
| town | `ContainerFrame5` | at login | - |
| town | `ContainerFrame6` | at login | - |
| town | `ContainerFrame7` | at login | - |
| town | `MasterLooterFrame` | at login | - |
| town | `GroupLootHistoryFrame` | at login | - |
| town | `MacroFrame` | with `Blizzard_MacroUI` | - |
| town | `MacroPopupFrame` | with `Blizzard_MacroUI` | - |
| town | `GuildBankPopupFrame` | with `Blizzard_GuildBankUI` | - |
| town | `GearManagerPopupFrame` | at login | - |
| town | `StopwatchFrame` | with `Blizzard_TimeManager` | - |
| town | `InspectRecipeFrame` | with `Blizzard_Professions` | - |
| town | `GhostFrame` | at login | - |
| town | `BasicMessageDialog` | at login | - |
| town | `AddonDialog` | at login | - |
| town | `CurrencyTransferMenu` | at login | - |
| town | `AuctionHouseMultisellProgressFrame` | with `Blizzard_AuctionHouseUI` | - |
| system | `SettingsPanel` | at login | - |
| system | `AddonList` | at login | - |
| system | `ChatConfigFrame` | at login | - |
| system | `NamePlatesTutorial` | at login | - |
| system | `EditModeManagerFrame` | at login | - |
| system | `EditModeSystemSettingsDialog` | at login | `UpdateSettings(), UpdateExtraButtons()` |
| system | `EditModeLayoutDialog` | at login | - |
| system | `EditModeImportLayoutDialog` | at login | - |
| system | `EditModeImportLayoutLinkDialog` | at login | - |
| system | `EditModeUnsavedChangesDialog` | at login | - |
| system | `QuickKeybindFrame` | at login | - |
| system | `CooldownViewerSettings` | at login | `RefreshLayout()` |
| system | `CooldownViewerLayoutDialog` | at login | - |
| system | `CooldownViewerImportLayoutDialog` | at login | - |
| system | `CooldownViewerSettingsEditAlert` | at login | - |
| system | `GroupBuffFilterEditVisualAlert` | at login | - |
| system | `MovePadFrame` | with `Blizzard_MovePad` | - |
| system | `ScriptErrorsFrame` | at login | - |
| system | `ClickBindingFrame` | with `Blizzard_ClickBindingUI` | - |
| system | `HelpFrame` | at login | - |
| system | `TicketStatusFrame` | at login | - |
| system | `ReportFrame` | at login | `AnchorMinorCategory()` |
| system | `ReportCheatingDialog` | at login | - |
| system | `SplashFrame` | at login | - |
| system | `ColorPickerFrame` | at login | - |
| system | `OpacityFrame` | at login | - |
| system | `DeathRecapFrame` | with `Blizzard_DeathRecap` | - |
| system | `CombatLogQuickButtonFrame_Custom` | with `Blizzard_CombatLog` | - |
| map | `WorldMapFrame` | with `Blizzard_WorldMap` | `BorderFrame, NavBar, SynchronizeDisplayState()` |
| map | `QuestMapFrame` | at login | `QuestsFrame, QuestLogQuests_Update()` |
| map | `QuestLogPopupDetailFrame` | at login | - |
| map | `BattlefieldMapFrame` | with `Blizzard_BattlefieldMap` | `BorderFrame` |
| map | `LFGParentFrame` | with `Blizzard_GroupFinder_VanillaStyle` | - |
| map | `LFGListingFrame` | with `Blizzard_GroupFinder_VanillaStyle` | `LFGListingCategorySelection_UpdateCategoryButtons()` |
| map | `LFGBrowseFrame` | with `Blizzard_GroupFinder_VanillaStyle` | `LFGBrowseSearchEntry_SetSelection()` |
| map | `LFGWhoListFrame` | with `Blizzard_GroupFinder_VanillaStyle` | - |
| map | `LFGBrowseSearchEntryTooltip` | with `Blizzard_GroupFinder_VanillaStyle` | - |
| map | `LegacySystemFrame` | with `Blizzard_LegacySystem` | `TreePage, ChallengesPage, RewardTrackPage` |
| map | `QueueStatusFrame` | at login | `Update()` |
| map | `CalendarFrame` | with `Blizzard_Calendar` | `CalendarFrame_SetToday()` |
| map | `CalendarViewHolidayFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarViewRaidFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarViewEventFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarCreateEventFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarMassInviteFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarEventPickerFrame` | with `Blizzard_Calendar` | - |
| map | `CalendarTexturePickerFrame` | with `Blizzard_Calendar` | - |
| menus | `DropDownList1` | at login | - |
| menus | `DropDownList2` | at login | - |
| menus | `DropDownList3` | at login | - |
| pvp | `PVPMatchScoreboard` | with `Blizzard_PVPMatch` | - |
| pvp | `PVPMatchResults` | with `Blizzard_PVPMatch` | - |
| pvp | `PVPReadyDialog` | at login | - |
| pvp | `PVPRoleCheckPopup` | at login | - |
| pvp | `PVPFramePopup` | at login | - |
| pvp | `PVPReadyPopup` | at login | - |
| pvp | `UIWidgetTopCenterContainerFrame` | at login | - |
| pvp | `UIWidgetBelowMinimapContainerFrame` | at login | - |
| pvp | `TimerTracker` | at login | - |
| pvp | `PvPObjectiveBannerFrame` | with `Blizzard_PVPUI` | - |
| pvp | `PVPRankFrame` | at login | - |
| finder | `PVEFrame` | at login | - |
| finder | `LFGListApplicationDialog` | at login | - |
| finder | `LFGListInviteDialog` | at login | - |
| finder | `PVPUIFrame` | with `Blizzard_PVPUI` | - |
| finder | `EncounterJournal` | with `Blizzard_EncounterJournal` | - |
| finder | `ConquestTooltip` | with `Blizzard_PVPUI` | - |
| finder | `EncounterJournalTooltip` | with `Blizzard_EncounterJournal` | - |
| windows | `HousingDashboardFrame` | with `Blizzard_HousingDashboard` | - |
| windows | `HouseFinderFrame` | with `Blizzard_HousingHouseFinder` | - |
| windows | `HouseEditorFrame` | with `Blizzard_HouseEditor` | - |
| windows | `HousingModelPreviewFrame` | with `Blizzard_HousingModelPreview` | - |
| finder | `ChallengesFrame` | with `Blizzard_ChallengesUI` | - |
| finder | `ChallengesKeystoneFrame` | with `Blizzard_ChallengesUI` | - |
| windows | `DelvesCompanionConfigurationFrame` | with `Blizzard_DelvesCompanionConfiguration` | - |
| windows | `DelvesCompanionAbilityListFrame` | with `Blizzard_DelvesCompanionConfiguration` | - |
| windows | `DelvesDifficultyPickerFrame` | with `Blizzard_DelvesDifficultyPicker` | - |
| windows | `ProfessionsBookFrame` | with `Blizzard_ProfessionsBook` | - |
| windows | `ProfessionsCustomerOrdersFrame` | with `Blizzard_ProfessionsCustomerOrders` | - |
| vault | `WeeklyRewardsFrame` | with `Blizzard_WeeklyRewards` | - |
| expansion | `ExpansionLandingPage` | at login | - |
| expansion | `TransmogFrame` | with `Blizzard_Transmog` | - |
| expansion | `PerksProgramFrame` | with `Blizzard_PerksProgram` | - |
