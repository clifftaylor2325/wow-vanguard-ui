-- luacheck config for Vanguard's Lua. The game runs Lua 5.1. Globals the
-- addon may set are listed exactly, so a missing `local` fails.
std = "lua51"
max_line_length = false
-- Libs/ holds the shared libraries, unmodified as upstream wrote them.
exclude_files = { "node_modules/", "scripts/", "Libs/" }

-- Every addon file starts `local ADDON, ns = ...`; not all use ADDON.
ignore = { "211/ADDON" }

globals = {
  -- SavedVariables (Vanguard.toc)
  "VanguardDB",
  "VanguardCharDB",
  -- Public API table and slash command. Vanguard holds the skin API (Core/Skin.lua) and
  -- Vanguard.API.v1, the auction prices for other addons (Modules/AuctionAPI.lua).
  "Vanguard",
  "SLASH_VANGUARD1",
  "SLASH_VANGUARD2",
  -- /way, when no other addon has it (Modules/Waypoints.lua)
  "SLASH_VANGUARDWAY1",
  -- Minimap shape for addons that place icons around it (Modules/Minimap.lua)
  "GetMinimapShape",
  -- Addon compartment click and hover handlers named in the TOC (Core/Options.lua)
  "Vanguard_OnAddonCompartmentClick", "Vanguard_OnAddonCompartmentEnter", "Vanguard_OnAddonCompartmentLeave",
  -- The engine's floating damage font path, set to the theme font at load (Modules/Merchant.lua)
  "DAMAGE_TEXT_FONT",
  -- The game's chat tab alphas, set to 1 while Keep chat tabs visible is on (Modules/Chat.lua)
  "CHAT_FRAME_TAB_SELECTED_MOUSEOVER_ALPHA", "CHAT_FRAME_TAB_SELECTED_NOMOUSE_ALPHA", "CHAT_FRAME_TAB_ALERTING_MOUSEOVER_ALPHA",
  "CHAT_FRAME_TAB_ALERTING_NOMOUSE_ALPHA", "CHAT_FRAME_TAB_NORMAL_MOUSEOVER_ALPHA", "CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA",
  SlashCmdList = { other_fields = true },
}

-- WoW API the addon reads. Add a name only when the addon starts using it.
read_globals = {
  "C_DeathRecap", "DECIMAL_SEPERATOR", "LARGE_NUMBER_SEPERATOR",
  "UiMapPoint", "C_SuperTrack", "C_Navigation", "C_Minimap", "hash_SlashCmdList", "IsPlayerSpell",
  "C_Bank", "C_ContentTracking", "InputUtil",
  "GetInventoryItemLink", "C_PlayerInfo",
  "AbbreviateNumbers", "GetTime", "UnitCastingInfo", "UnitChannelInfo", "AuraUtil", "CreateUnitHealPredictionCalculator", "UnitGetDetailedHealPrediction", "UnitGetIncomingHeals", "UnitGetTotalAbsorbs", "UnitThreatSituation", "C_ActionBar", "C_AddOns", "C_CVar", "C_VideoOptions", "GetGraphicsCVarValueForQualityLevel", "C_Reputation", "C_Spell", "C_UnitAuras", "C_Timer", "C_EquipmentSet", "GetMerchantItemCostInfo", "GetLocale", "GetCursorPosition", "Enum", "GetActionInfo", "GetMacroSpell", "SOUNDKIT", "PlaySound", "ClearCursor", "GetCursorInfo", "GetSpellInfo", "C_SpecializationInfo", "GetSpecialization", "ReloadUI", "GetXPExhaustion", "IsPlayerAtEffectiveMaxLevel", "IsXPUserDisabled", "UnitLevel", "UnitXP", "UnitXPMax", "C_Map", "FCF_OpenTemporaryWindow", "FCF_OpenNewWindow", "GetChatWindowInfo", "FCF_SetLocked", "FCF_SetWindowName", "FCF_Close", "ChatFrame_AddMessageGroup", "ChatFrame_RemoveMessageGroup", "ChatFrame_ContainsMessageGroup", "FCF_SavePositionAndDimensions", "ChatFrame_RemoveAllMessageGroups", "FCF_Tab_OnClick", "FCFTab_UpdateAlpha", "FCFDock_SetPrimary", "FCFDock_GetSelectedWindow", "FCFDock_UpdateTabs", "FCFTab_UpdateColors", "FCF_SetTabPosition", "FCF_SetButtonSide", "FloatingChatFrame_UpdateBackgroundAnchors", "GENERAL_CHAT_DOCK", "ChatAlertFrame", "GetMinimapZoneText", "GetZonePVPInfo", "Minimap", "NUM_CHAT_WINDOWS", "SELECTED_CHAT_FRAME", "GUILD_MOTD_TEMPLATE", "SecureHandlerExecute", "SecureHandlerUnwrapScript", "SecureHandlerWrapScript", "SetCVar", "DeclineGuild", "DeclineGroup", "BNDeclineFriendInvite", "RepopMe", "HasSoulstone", "C_DeathInfo", "RED_FONT_COLOR", "IsGuildMember", "C_FriendList", "C_BattleNet", "ZoneTextFrame", "SubZoneTextFrame", "UISpecialFrames", "hooksecurefunc", "ClearOverrideBindings", "GetBindingKey", "CreateFrame", "DEFAULT_CHAT_FRAME", "debugstack", "geterrorhandler", "CallErrorHandler",
  "GetAddOnMetadata", "GetBuildInfo", "GetNetStats", "UnitClassification", "C_SpellBook", "GetBindingAction", "GetNumSpecializations", "GetCreatureDifficultyColor", "GetComboPoints", "C_Secrets", "CreateColor", "AnchorUtil", "AuraContainerSortMethod", "C_CurveUtil", "C_StringUtil", "UnitHealthMissing", "C_IncomingSummon", "InCombatLockdown", "IsAltKeyDown", "IsControlKeyDown", "IsShiftKeyDown", "PowerBarColor", "RAID_CLASS_COLORS",
  "RegisterAttributeDriver", "RegisterStateDriver", "UnregisterStateDriver", "UnitGroupRolesAssigned", "UnitIsUnit", "RegisterUnitWatch", "SetOverrideBindingClick", "STANDARD_TEXT_FONT", "UIParent", "UnitClass",
  "GetInventoryItemID", "GetPetActionInfo", "GetPetActionCooldown", "UnitExists", "UnitHealth", "UnitHealthMax", "UnitIsConnected",
  "UnitIsDeadOrGhost", "UnitIsPlayer", "UnitPlayerControlled", "UnitName", "UnitPower", "UnitPowerMax",
  "UnitPowerType", "UnitReaction", "issecretvalue", "GetTotemInfo", "GetTotemDuration", "C_EventUtils", "C_LootHistory", "RANDOM_ROLL_RESULT", "C_Item", "GetInventoryItemTexture", "GameTooltip", "C_Container", "C_MerchantFrame", "CanMerchantRepair", "GetRepairAllCost", "RepairAllItems", "GetMoney", "UIErrorsFrame", "GetGameMessageInfo", "C_SwingTimer", "GetPetHappiness", "C_PetInfo", "C_PvP", "HideUIPanel", "C_Texture", "UnitFactionGroup", "C_CooldownViewer", "C_DamageMeter", "AcceptQuest", "AcknowledgeAutoAcceptQuest", "C_GossipInfo", "CloseQuest", "CompleteQuest", "DeclineQuest", "GetActiveLevel", "GetActiveTitle", "GetAvailableLevel", "GetAvailableTitle", "GetGreetingText", "GetNumActiveQuests", "GetNumAvailableQuests", "GetNumQuestChoices", "GetNumQuestItems", "GetNumQuestRewards", "GetObjectiveText", "GetProgressText", "GetQuestDifficultyColor", "GetQuestItemInfo", "GetQuestItemLink", "GetQuestReward", "GetQuestMoneyToGet", "GetQuestText", "GetSuggestedGroupSize", "GetRewardMoney", "GetRewardText", "GetRewardXP", "GetTitleText", "IsQuestCompletable", "QuestGetAutoAccept", "SelectActiveQuest", "SelectAvailableQuest", "SetPortraitTexture", "GetQuestID", "C_QuestInfoSystem", "C_QuestLog", "C_TooltipInfo", "GetQuestLogSpecialItemInfo", "QuestMapFrame_OpenToQuestDetails", "QuestLogQuests_Update", "QuestScrollFrame", "GetNumQuestLogChoices", "GetQuestLogChoiceInfo", "GetQuestLogItemLink", "GetNumQuestLogRewards", "GetQuestLogRewardInfo", "GetQuestLogRewardMoney", "GetQuestLogRewardXP", "GetQuestLogQuestText", "QuestLogPushQuest", "StaticPopup_Show", "IsInGroup", "ChatFrame_AddMessageEventFilter", "C_SummonInfo", "AcceptResurrect", "CancelDuel", "GetNumLootItems", "GetLootSlotInfo", "LootSlot", "StaticPopup_Hide", "StaticPopupSpecial_Hide", "StaticPopupSpecial_Show", "PlayerCanTeleport", "EventRegistry", "GetInventoryItemDurability", "GetPartyAssignment", "PixelUtil", "C_PartyInfo", "GetNumGroupMembers",
  -- The social window's status dropdown: the game's word for a presence (Available, Away, Busy).
  "SocialUIUtil",
  -- Target of target identity and the minimap's still-standing check (P1.13).
  "UnitGUID", "UnitPosition", "C_TaxiMap", "GetPlayerFacing",
  -- /vg perf: the game's CPU and memory counters (P1.14).
  "GetCVar", "C_AddOnProfiler", "debugprofilestop", "GetAddOnCPUUsage", "UpdateAddOnCPUUsage", "GetAddOnMemoryUsage", "UpdateAddOnMemoryUsage", "GetFunctionCPUUsage",
  -- Action button tooltips: the client's default anchor (P2.3).
  "GameTooltip_SetDefaultAnchor",
  -- Quest tracker item buttons: the quest item's cooldown and range (P2.10).
  "GetQuestLogSpecialItemCooldown", "IsQuestLogSpecialItemInRange",
  -- P2.8 Chat: the game's list of chat window art names.
  "CHAT_FRAME_TEXTURES",
  -- Chat: the game's chat type table (its colours come from the client's settings), for the edit box's rail.
  "ChatTypeInfo",
  -- Info strip: the calendar's reminder line the game's calendar button prints (GameTime.lua), shown while the clock block hides it.
  "CALENDAR_EVENT_ALARM_MESSAGE",
  -- Info strip: the calendar button's count of invites waiting for an answer.
  "C_Calendar",
  -- Info strip: a click on durability opens the character window, on free space or gold the bags.
  "ToggleCharacter", "ToggleAllBags",
  -- Info strip: a click on the time opens the game's clock window, or turns off its ringing alarm (Blizzard_TimeManager).
  "ToggleTimeManager", "TimeManager_IsAlarmFiring", "TimeManager_TurnOffAlarm",
  -- Info strip: the time in the game's clock format, realm and local (Blizzard_FrameXMLUtil/GameTimeUtil.lua).
  "GameTime_GetTime", "GameTime_GetGameTime", "GameTime_GetLocalTime",
  -- Info strip: the realm's date beside the realm time, and whether the game's clock shows local time.
  "C_DateAndTime", "GetCVarBool",
  -- Reputation bar: the game's standing words in your character's form (its click uses ToggleCharacter, above).
  "GetText", "UnitSex",
  -- P3.3 Visibility conditions: In an instance, and what a state driver's string says now.
  "IsInInstance", "SecureCmdOptionParse", "SendChatMessage",
  -- R1.6 Chat bubbles (Modules/ChatBubbles.lua): the engine's list of the bubbles it is showing.
  "C_ChatBubbles",
  -- P3.4 Keybind mode: binding a key to a button's command and saving it in the binding set in use.
  "SetBinding", "SaveBindings", "GetCurrentBindingSet",
  -- P3.5 Shared media: the bundled libraries' loader (Libs/LibStub).
  "LibStub",
  -- P3.8 Chat: the game's time formatter and clock (chat timestamps), its chat windows list.
  "TimeUtil", "time", "date", "CHAT_FRAMES",
  -- P3.9 GameAlerts: rare spawns from the minimap's vignettes.
  "C_VignetteInfo",
  -- P3.10 Click casting: the game's click bindings and its Click Casting window.
  "C_ClickBindings", "ToggleClickBindingFrame",
  -- P3.12 Error badge: the game's addons button by the minimap.
  "AddonCompartmentFrame",
  -- P3.14 Profiles: switching the game's Edit Mode layout with the profile.
  "C_EditMode",
  -- P4.7 Options keys: the box that has the typing (the window leaves keys alone while you type).
  "GetCurrentKeyBoardFocus",
  -- Bug hunt, swing timer: your weapons' speeds, for a swing a weapon swap restarts.
  "UnitAttackSpeed", "UnitDamage",
  -- F2 Vendor memory: a merchant item's ID, and the zone and subzone you're in.
  "GetMerchantItemID", "GetZoneText", "GetSubZoneText",
  -- F4 Chat watch: the game's whisper call, and its older name.
  "ChatFrameUtil", "GetChannelList", "ChatFrame_SendTell",
  -- F5 Situations: whether you're in a raid, and resting.
  "IsInRaid", "IsResting", "UnitIsGroupLeader", "UnitIsGroupAssistant", "UnitCanAttack", "UnitIsTapDenied", "UnitIsGhost", "UnitIsFeignDeath", "UnitAffectingCombat", "UnitDetailedThreatSituation",
  -- #208 Quest guidance: the client's quest lines (quest-start spots on a map).
  "C_QuestLine",
  -- F6 Auction helper: the auction house API and the game's auction house window.
  "C_AuctionHouse", "AuctionHouseFrame",
  -- Auction helper, tabs: the window's tab row (the game's tab count call) and its display modes.
  "PanelTemplates_SetNumTabs", "PanelTemplates_TabResize", "AuctionHouseFrameDisplayMode",
  -- F6 Auction helper, sell card: the item on the cursor.
  "C_Cursor",
  -- C1 Auction prices: the realm you're on, so each realm and faction keeps its own prices.
  "GetRealmName", "GetNormalizedRealmName", "C_Seasons", "C_GameRules", "C_RestrictedActions", "C_ChatInfo",
  -- A5 Auction helper, your auctions: an expired auction's item found in the bags, for Relist.
  -- A1 Auction helper, sell form: a bag slot's item location, for the next stack.
  "ItemLocation",
  -- D1 Auction prices, disenchant values: whether you know Enchanting (your professions' skill lines).
  "GetProfessions", "GetProfessionInfo", "C_TradeSkillUI", "C_SkillInfo",
  -- Info strip ammo: whether your ranged weapon needs ammo.
  "C_PaperDollInfo",
  -- Pet stable: the stable master's pet lists and slot price.
  "C_StableInfo",
  -- E5 Auction ledger: the inbox's auction mail (Blizzard_MailFrame/MailFrame.lua), and the game's
  -- "Auction expired" subject line.
  "TakeInboxMoney", "ReturnInboxItem", "TakeInboxItem", "MailFrame", "SendMailFrame", "SendMailNameEditBox",
  "GetInboxNumItems", "GetInboxHeaderInfo", "GetInboxInvoiceInfo", "InboxItemCanDelete", "AUCTION_EXPIRED_MAIL_SUBJECT",
  -- Mail tools, Take all: which attachment slots a mail still holds, and whether the server is still
  -- answering the last take (Blizzard_MailFrame/MailFrame.lua, MailInfoDocumentation.lua).
  "HasInboxItem", "C_Mail",
  -- D2 Auction helper, crafting costs: the game's profession window (Blizzard_Professions).
  "ProfessionsFrame",
  -- Minimap: the game's world map toggle. Healing: the client's readable class names, for the buff list.
  "ToggleWorldMap", "ToggleCalendar", "LOCALIZED_CLASS_NAMES_MALE",
  -- R1.4 Waypoints: the game's floating waypoint pin (Blizzard_QuestNavigation).
  "SuperTrackedFrame",
  -- Inventory: the engine's case-blind UTF-8 compare, so a name with an accented capital is found.
  "strcmputf8i",
  -- H-04 Reset moved windows (Modules/WindowsMove.lua): the panel manager's list of the windows it lays out.
  "UIPanelWindows",
}
