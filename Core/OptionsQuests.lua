-- The Quests page (/vg): Vanguard's quest windows and tracker, and the
-- quest automation. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, liveSetting, check, append = O.Setting, O.LiveSetting, O.Check, O.Append

-- Quests: the dialog, and the automation (each off until switched on).
local function questRows()
  return {
    { "header", "Quest windows" },
    check("Vanguard's quest dialog at the bottom center (reload)", setting("QuestDialog", "dialog", true)),
    check("Vanguard's quest log on the quest log key (reload)", setting("QuestLog", "own", true)),
    check("Each quest's XP in the quest log list", liveSetting("QuestLog", "xp", function() if ns.GetModule("QuestLog").frame then ns.GetModule("QuestLog").Refresh() end end)),
  }
end

-- Quests: the tracker.
local function trackerRows()
  return {
    { "header", "Quest tracker" },
    check("Vanguard's quest tracker under the info strip (reload)", setting("QuestTracker", "own", true)),
    { "cycle", "With Questie loaded (reload)", { { "questie", "Questie's tracker" }, { "vanguard", "Vanguard's tracker" } }, setting("QuestTracker", "withQuestie", true) },
    check("Each quest's XP under it", liveSetting("QuestTracker", "xp", function() ns.GetModule("QuestTracker").Refresh() end)),
    check("Under the quests, how much of the XP to level they give", liveSetting("QuestTracker", "levelXp", function() ns.GetModule("QuestTracker").Refresh() end)),
    check("Watch a quest when you accept it", setting("QuestTracker", "autoTrack")),
    { "cycle", "Order", { { "game", "As the game orders them" }, { "nearest", "Nearest first" } }, liveSetting("QuestTracker", "order", function() ns.GetModule("QuestTracker").ApplyOrder() end) },
  }
end

-- Quest history: which character finished each quest.
local function questHistoryRows()
  return {
    { "header", "Quest history" },
    check("Remember which character finished each quest (\"Done on Thrall-Realm\")", setting("QuestHistory", "track")),
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

O.AddPage({ key = "quests", title = "Quests", icon = "NavQuests", order = 70, rows = function() return append(append(append(questRows(), trackerRows()), questHistoryRows()), questAutoRows()) end })
