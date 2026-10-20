-- The Quests page (/vg): its cards in the order a player meets them: the quest windows, the tracker, finding
-- your way (the arrow, guidance and minimap spots, whose rows their modules give), quest history and the
-- automation. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, reloadSetting, liveSetting, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.Check, O.Append

-- Quests: the dialog, and the automation (each off until switched on).
local function questRows()
  return {
    { "header", "Quest windows" },
    check("Vanguard's quest dialog at the bottom center (reload)", reloadSetting("QuestDialog", "dialog")),
    check("Vanguard's quest log on the quest log key (reload)", reloadSetting("QuestLog", "own")),
    check("Each quest's XP in the quest log list", liveSetting("QuestLog", "xp", function() if ns.GetModule("QuestLog").frame then ns.GetModule("QuestLog").Refresh() end end)),
  }
end

-- Quests: the tracker.
local function trackerRows()
  return {
    { "header", "Quest tracker" },
    check("Vanguard's quest tracker under the info strip (reload)", reloadSetting("QuestTracker", "own")),
    { "cycle", "With Questie loaded (reload)", { { "questie", "Questie's tracker" }, { "vanguard", "Vanguard's tracker" } }, reloadSetting("QuestTracker", "withQuestie") },
    check("Each quest's XP under it", liveSetting("QuestTracker", "xp", function() ns.GetModule("QuestTracker").Refresh() end)),
    check("Under the quests, how much of the XP to level they give", liveSetting("QuestTracker", "levelXp", function() ns.GetModule("QuestTracker").Refresh() end)),
    check("Watch a quest when you accept it", setting("QuestTracker", "autoTrack")),
    { "cycle", "Order", { { "game", "As the game orders them" }, { "nearest", "Nearest first" } }, liveSetting("QuestTracker", "order", function() ns.GetModule("QuestTracker").ApplyOrder() end) },
  }
end

-- Finding your way: the quest arrow, quest guidance and the minimap's quest spots. Their modules load after
-- this file, so their rows are read here, when the page is built.
local function wayRows()
  local rows = {
    { "header", "Finding your way" },
    { "text", "The arrow on screen turns toward the nearest unfinished objective of the quests you watch; Shift-click a quest in the tracker to point it there instead. Move it with /vg unlock. /vg questdata shows what the client says about quests." },
  }
  rows = append(append(rows, ns.GetModule("QuestArrow").Rows()), ns.GetModule("QuestGuide").Rows())
  return append(rows, ns.GetModule("QuestMinimap").Rows())
end

-- Whether quest history is on (its module and its switch), so its list has something to say.
local function historyOn()
  local settings = ns.GetModule("QuestHistory").settings
  return settings ~= nil and settings.track == true
end

-- Quest history: which character finished each quest.
local function questHistoryRows()
  return {
    { "header", "Quest history" },
    check("Remember which character finished each quest (\"Done on Thrall-Realm\")", setting("QuestHistory", "track")),
    { "button", "List latest turn-ins", function() ns.GetModule("QuestHistory").Command("") end, historyOn },
  }
end

-- Quest automation (each off until switched on).
local function questAutoRows()
  return {
    { "header", "Automation (hold Shift while talking to skip it)" },
    check("Accept quests", setting("QuestAuto", "accept")), check("Accept quests a party member shares with you", setting("QuestAuto", "acceptShared")), check("Turn in finished quests", setting("QuestAuto", "turnIn")),
    check("With a choice of rewards, take the one that sells for most", setting("QuestAuto", "bestReward")), check("Skip the chatter when an NPC has just one quest for you", setting("QuestAuto", "skipGossip")),
  }
end

O.AddPage({ key = "quests", title = "Quests", icon = "NavQuests", order = 70, rows = function() return append(append(append(append(questRows(), trackerRows()), wayRows()), questHistoryRows()), questAutoRows()) end })
