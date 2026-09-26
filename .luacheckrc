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
  SlashCmdList = { other_fields = true },
}

-- WoW API the addon reads. Add a name only when the addon starts using it.
read_globals = {
  "C_AddOns", "CreateFrame", "DEFAULT_CHAT_FRAME", "GetAddOnMetadata",
  "InCombatLockdown", "IsShiftKeyDown", "STANDARD_TEXT_FONT", "UIParent",
}
