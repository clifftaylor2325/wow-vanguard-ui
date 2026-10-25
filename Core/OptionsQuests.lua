-- The Quests page (/vg): its cards in the order a player meets them: the quest windows, the tracker, finding
-- your way (the arrow, guidance and minimap spots, whose rows their modules give), quest history and the
-- automation. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local setting, reloadSetting, liveSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append

-- Quests: the dialog, and the automation (each off until switched on).
local function questRows()
  return {
    { "header", L["Quest windows"] },
    check(L["Vanguard's quest dialog at the bottom center (reload)"], reloadSetting("QuestDialog", "dialog")),
    check(L["Vanguard's quest log on the quest log key (reload)"], reloadSetting("QuestLog", "own")),
    check(L["Each quest's XP in the quest log list"], liveSetting("QuestLog", "xp", function() if ns.GetModule("QuestLog").frame then ns.GetModule("QuestLog").Refresh() end end)),
  }
end

-- Quests: the tracker.
local function trackerRows()
  return {
    { "header", L["Quest tracker"] },
    check(L["Vanguard's quest tracker under the info strip (reload)"], reloadSetting("QuestTracker", "own")),
    { "cycle", L["With Questie loaded (reload)"], { { "questie", L["Questie's tracker"] }, { "vanguard", L["Vanguard's tracker"] } }, reloadSetting("QuestTracker", "withQuestie") },
    check(L["Each quest's XP under it"], liveMethod("QuestTracker", "xp", "Refresh")),
    check(L["Under the quests, how much of the XP to level they give"], liveMethod("QuestTracker", "levelXp", "Refresh")),
    check(L["Watch a quest when you accept it"], setting("QuestTracker", "autoTrack")),
    { "cycle", L["Order"], { { "game", L["As the game orders them"] }, { "nearest", L["Nearest first"] } }, liveMethod("QuestTracker", "order", "ApplyOrder") },
  }
end

-- Finding your way: the quest arrow, quest guidance and the minimap's quest spots. Their modules load after
-- this file, so their rows are read here, when the page is built.
local function wayRows()
  local rows = {
    { "header", L["Finding your way"] },
    { "text", L["The arrow on screen turns toward the nearest unfinished objective of the quests you watch; Shift-click a quest in the tracker to point it there instead. Move it with /vg unlock. /vg questdata shows what the client says about quests."] },
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
    { "header", L["Quest history"] },
    check(L["Remember which character finished each quest (\"Done on Thrall-Realm\")"], setting("QuestHistory", "track")),
    { "button", L["List latest turn-ins"], function() ns.GetModule("QuestHistory").Command("") end, historyOn },
  }
end

-- Quest automation (each off until switched on).
local function questAutoRows()
  return {
    { "header", L["Automation (hold Shift while talking to skip it)"] },
    check(L["Accept quests"], setting("QuestAuto", "accept")), check(L["Accept quests a party member shares with you"], setting("QuestAuto", "acceptShared")), check(L["Turn in finished quests"], setting("QuestAuto", "turnIn")),
    check(L["With a choice of rewards, take the one that sells for most"], setting("QuestAuto", "bestReward")), check(L["Skip the chatter when an NPC has just one quest for you"], setting("QuestAuto", "skipGossip")),
  }
end

O.AddPage({ key = "quests", title = L["Quests"], icon = "NavQuests", order = 70, rows = function() return append(append(append(append(questRows(), trackerRows()), wayRows()), questHistoryRows()), questAutoRows()) end })
