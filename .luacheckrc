-- luacheck config for ForeverUI's Lua. The game runs Lua 5.1. Globals the
-- addon may set are listed exactly, so a missing `local` fails.
std = "lua51"
max_line_length = false
-- Libs/ holds the shared libraries, unmodified as upstream wrote them.
exclude_files = { "node_modules/", "scripts/", "Libs/" }

-- Every addon file starts `local ADDON, ns = ...`; not all use ADDON.
ignore = { "211/ADDON" }

globals = {
  -- SavedVariables (ForeverUI.toc)
  "ForeverUIDB",
  "ForeverUICharDB",
  -- Public API table and slash command
  "ForeverUI",
  "SLASH_FOREVERUI1",
  "SLASH_FOREVERUI2",
  -- Minimap shape for addons that place icons around it (Modules/Minimap.lua)
  "GetMinimapShape",
  -- Addon compartment click handler named in the TOC (Core/Options.lua)
  "ForeverUI_OnAddonCompartmentClick",
  SlashCmdList = { other_fields = true },
}

-- WoW API the addon reads. Add a name only when the addon starts using it.
read_globals = {
  "AbbreviateNumbers", "GetTime", "UnitCastingInfo", "UnitChannelInfo", "AuraUtil", "CreateUnitHealPredictionCalculator", "GetThreatStatusColor", "UnitGetDetailedHealPrediction", "UnitGetIncomingHeals", "UnitGetTotalAbsorbs", "UnitThreatSituation", "C_ActionBar", "C_AddOns", "C_CVar", "C_Reputation", "C_Spell", "C_UnitAuras", "C_Timer", "GetLocale", "GetCursorPosition", "Enum", "GetActionInfo", "SOUNDKIT", "PlaySound", "ClearCursor", "GetCursorInfo", "GetSpellInfo", "C_SpecializationInfo", "GetSpecialization", "ReloadUI", "GetXPExhaustion", "IsPlayerAtEffectiveMaxLevel", "IsXPUserDisabled", "UnitLevel", "UnitXP", "UnitXPMax", "C_Map", "FCF_OpenTemporaryWindow", "FCF_Tab_OnClick", "GetMinimapZoneText", "GetZonePVPInfo", "Minimap", "NUM_CHAT_WINDOWS", "SELECTED_CHAT_FRAME", "SecureHandlerExecute", "SecureHandlerUnwrapScript", "SecureHandlerWrapScript", "SetCVar", "UISpecialFrames", "hooksecurefunc", "ClearOverrideBindings", "GetBindingKey", "CreateFrame", "DEFAULT_CHAT_FRAME", "debugstack", "geterrorhandler", "CallErrorHandler",
  "GetAddOnMetadata", "GetBuildInfo", "GetNetStats", "UnitClassification", "C_SpellBook", "GetBindingAction", "GetNumSpecializations", "UnitLevel", "GetCreatureDifficultyColor", "GetComboPoints", "C_Secrets", "CreateColor", "AnchorUtil", "AuraContainerSortMethod", "C_CurveUtil", "C_StringUtil", "InCombatLockdown", "IsAltKeyDown", "IsControlKeyDown", "IsShiftKeyDown", "PowerBarColor", "RAID_CLASS_COLORS",
  "RegisterAttributeDriver", "RegisterStateDriver", "UnregisterStateDriver", "UnitGroupRolesAssigned", "UnitIsUnit", "RegisterUnitWatch", "SetOverrideBindingClick", "STANDARD_TEXT_FONT", "UIParent", "UnitClass",
  "UnitExists", "UnitHealth", "UnitHealthMax", "UnitIsConnected",
  "UnitIsDeadOrGhost", "UnitIsPlayer", "UnitName", "UnitPower", "UnitPowerMax",
  "UnitPowerType", "UnitReaction", "issecretvalue", "GetTotemInfo", "GetTotemDuration", "C_EventUtils", "C_Item", "GetInventoryItemTexture", "GameTooltip", "C_Container", "C_MerchantFrame", "CanMerchantRepair", "GetRepairAllCost", "RepairAllItems", "GetMoney", "UIErrorsFrame", "C_SwingTimer", "GetPetHappiness", "C_PetInfo", "C_PvP", "HideUIPanel", "C_Texture", "UnitFactionGroup", "C_CooldownViewer", "C_DamageMeter", "AcceptQuest", "AcknowledgeAutoAcceptQuest", "C_GossipInfo", "CloseQuest", "CompleteQuest", "DeclineQuest", "GetActiveLevel", "GetActiveTitle", "GetAvailableLevel", "GetAvailableTitle", "GetGreetingText", "GetNumActiveQuests", "GetNumAvailableQuests", "GetNumQuestChoices", "GetNumQuestItems", "GetNumQuestRewards", "GetObjectiveText", "GetProgressText", "GetQuestDifficultyColor", "GetQuestItemInfo", "GetQuestItemLink", "GetQuestReward", "GetQuestText", "GetRewardMoney", "GetRewardText", "GetRewardXP", "GetTitleText", "IsQuestCompletable", "QuestGetAutoAccept", "SelectActiveQuest", "SelectAvailableQuest", "SetPortraitTexture", "GetQuestID", "C_QuestInfoSystem", "C_QuestLog", "GetQuestLogSpecialItemInfo", "QuestMapFrame_OpenToQuestDetails", "GetNumQuestLogChoices", "GetQuestLogChoiceInfo", "GetNumQuestLogRewards", "GetQuestLogRewardInfo", "GetQuestLogRewardMoney", "GetQuestLogRewardXP", "GetQuestLogQuestText", "QuestLogPushQuest", "StaticPopup_Show", "GetBindingKey", "SetOverrideBindingClick", "ClearOverrideBindings", "IsInGroup", "ChatFrame_AddMessageEventFilter", "C_SummonInfo", "AcceptResurrect", "CancelDuel", "StaticPopup_Hide", "EventRegistry", "GetInventoryItemDurability", "GetPartyAssignment", "PixelUtil", "C_PartyInfo", "SetRaidTarget", "CanBeRaidTarget", "GetNumGroupMembers",
  -- Target of target identity and the minimap's still-standing check (P1.13).
  "UnitGUID", "UnitPosition",
  -- /fui perf: the game's CPU and memory counters (P1.14).
  "GetCVar", "GetAddOnCPUUsage", "UpdateAddOnCPUUsage", "GetAddOnMemoryUsage", "UpdateAddOnMemoryUsage", "GetFunctionCPUUsage",
  -- Action button tooltips: the client's default anchor (P2.3).
  "GameTooltip_SetDefaultAnchor",
  -- Quest tracker item buttons: the quest item's cooldown and range (P2.10).
  "GetQuestLogSpecialItemCooldown", "IsQuestLogSpecialItemInRange",
  -- P2.8 Chat: the game's list of chat window art names.
  "CHAT_FRAME_TEXTURES",
  -- P3.3 Visibility conditions: In an instance, and what a state driver's string says now.
  "IsInInstance", "SecureCmdOptionParse",
  -- P3.4 Keybind mode: binding a key to a button's command and saving it in the binding set in use.
  "SetBinding", "SaveBindings", "GetCurrentBindingSet",
  -- P3.5 Shared media: the bundled libraries' loader (Libs/LibStub).
  "LibStub",
  -- P3.8 Chat: the game's time formatter and clock (chat timestamps), its chat windows list.
  "TimeUtil", "time", "CHAT_FRAMES",
  -- P3.9 GameAlerts: rare spawns from the minimap's vignettes.
  "C_VignetteInfo",
}
