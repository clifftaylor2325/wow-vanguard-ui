-- luacheck config for ForeverUI's Lua. The game runs Lua 5.1. Globals the
-- addon may set are listed exactly, so a missing `local` fails.
std = "lua51"
max_line_length = false
exclude_files = { "node_modules/", "scripts/" }

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
  "AbbreviateNumbers", "GetTime", "UnitCastingInfo", "UnitChannelInfo", "AuraUtil", "CreateUnitHealPredictionCalculator", "GetThreatStatusColor", "UnitGetDetailedHealPrediction", "UnitGetIncomingHeals", "UnitGetTotalAbsorbs", "UnitThreatSituation", "C_ActionBar", "C_AddOns", "C_CVar", "C_Reputation", "C_Spell", "C_UnitAuras", "C_Timer", "GetLocale", "GetCursorPosition", "Enum", "GetActionInfo", "SOUNDKIT", "PlaySound", "ClearCursor", "GetCursorInfo", "GetSpellInfo", "C_SpecializationInfo", "GetSpecialization", "ReloadUI", "GetXPExhaustion", "IsPlayerAtEffectiveMaxLevel", "IsXPUserDisabled", "UnitLevel", "UnitXP", "UnitXPMax", "C_Map", "FCF_OpenTemporaryWindow", "FCF_Tab_OnClick", "GetMinimapZoneText", "GetZonePVPInfo", "Minimap", "NUM_CHAT_WINDOWS", "SELECTED_CHAT_FRAME", "SecureHandlerUnwrapScript", "SecureHandlerWrapScript", "SetCVar", "UISpecialFrames", "hooksecurefunc", "ClearOverrideBindings", "GetBindingKey", "CreateFrame", "DEFAULT_CHAT_FRAME",
  "GetAddOnMetadata", "GetBuildInfo", "GetNetStats", "UnitClassification", "UnitLevel", "GetCreatureDifficultyColor", "GetComboPoints", "C_Secrets", "CreateColor", "AnchorUtil", "AuraContainerSortMethod", "C_CurveUtil", "C_StringUtil", "InCombatLockdown", "IsAltKeyDown", "IsControlKeyDown", "IsShiftKeyDown", "PowerBarColor", "RAID_CLASS_COLORS",
  "RegisterAttributeDriver", "RegisterStateDriver", "UnitGroupRolesAssigned", "UnitIsUnit", "RegisterUnitWatch", "SetOverrideBindingClick", "STANDARD_TEXT_FONT", "UIParent", "UnitClass",
  "UnitExists", "UnitHealth", "UnitHealthMax", "UnitIsConnected",
  "UnitIsDeadOrGhost", "UnitIsPlayer", "UnitName", "UnitPower", "UnitPowerMax",
  "UnitPowerType", "UnitReaction", "issecretvalue", "GetTotemInfo", "GetTotemDuration", "C_EventUtils", "C_Item", "GetInventoryItemTexture", "GameTooltip", "C_Container", "C_MerchantFrame", "CanMerchantRepair", "GetRepairAllCost", "RepairAllItems", "GetMoney", "UIErrorsFrame", "C_SwingTimer", "GetPetHappiness", "C_PetInfo", "C_PvP", "HideUIPanel", "ChatFrame_AddMessageEventFilter", "C_SummonInfo", "AcceptResurrect", "CancelDuel", "StaticPopup_Hide", "EventRegistry", "GetInventoryItemDurability", "GetPartyAssignment", "C_PartyInfo", "SetRaidTarget", "CanBeRaidTarget", "GetNumGroupMembers",
}
