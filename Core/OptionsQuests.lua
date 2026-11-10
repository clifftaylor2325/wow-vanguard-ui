-- The Quests page (/vg): its cards in the order a player meets them: the quest windows, the tracker, finding
-- your way (the arrow, guidance and minimap spots, whose rows their modules give), quest history and the
-- automation. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local setting, reloadSetting, liveSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append

-- The switch for opening the zones the game folds in its quest log (Modules/QuestTracker.lua, QT.KeepFoldsOpen),
-- with a tip saying what it is for and what off costs. It applies at once.
local function foldsRow()
  local row = check(L["Open folded zones in the quest log"], setting("QuestTracker", "openFolds"))
  row.tip = L["The game folds every zone off your map each time you zone in, and quests under a folded zone are hidden from Vanguard's tracker, quest log and XP lines. Off: a zone stays as you fold it, and its quests are left out until you open it. Vanguard's quest log still opens them when you open it."]
  return row
end

-- Quests: the dialog, and the automation (each off until switched on).
local function questRows()
  return {
    { "header", L["Quest windows"] },
    check(L["Vanguard's quest dialog (reload)"], reloadSetting("QuestDialog", "dialog")),
    check(L["Vanguard's quest log (reload)"], reloadSetting("QuestLog", "own")),
    check(L["Each quest's XP in the quest log list"], liveSetting("QuestLog", "xp", function() if ns.GetModule("QuestLog").frame then ns.GetModule("QuestLog").Refresh() end end)),
    foldsRow(),
  }
end

-- Quests: the tracker.
local function trackerRows()
  return {
    { "header", L["Quest tracker"] },
    check(L["Vanguard's quest tracker (reload)"], reloadSetting("QuestTracker", "own")),
    { "cycle", L["With Questie loaded (reload)"], { { "questie", L["Questie's tracker"] }, { "vanguard", L["Vanguard's tracker"] } }, reloadSetting("QuestTracker", "withQuestie") },
    check(L["Each quest's XP under it"], liveMethod("QuestTracker", "xp", "Refresh")),
    check(L["Quest XP toward your level"], liveMethod("QuestTracker", "levelXp", "Refresh")),
    check(L["Watch a quest when you accept it"], setting("QuestTracker", "autoTrack")),
    { "cycle", L["Order"], { { "game", L["As the game orders them"] }, { "nearest", L["Nearest first"] } }, liveMethod("QuestTracker", "order", "ApplyOrder") },
  }
end

-- Finding your way: the quest arrow, quest guidance and the minimap's quest spots. Their modules load after
-- this file, so their rows are read here, when the page is built.
local function wayRows()
  local rows = {
    { "header", L["Finding your way"] },
    { "text", ns.ClientData({
      forever = L["The arrow on screen turns toward the nearest unfinished objective of the quests you watch; Shift-click a quest in the tracker to point it there instead. Move it with /vg unlock. /vg questdata shows what the client says about quests."],
      retail = L["The arrow on screen turns toward the nearest unfinished objective of the quests you watch, or the quest you track on the game's map. Move it with /vg unlock."],
    }) },
  }
  rows = append(append(rows, ns.GetModule("QuestArrow").Rows()), O.ModuleRows("QuestGuide", ns.QuestGuide.Rows))
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
    check(L["Remember who finished each quest"], setting("QuestHistory", "track")),
    { "button", L["List latest turn-ins"], function() ns.GetModule("QuestHistory").Command("") end, historyOn },
  }
end

-- Quest automation (each off until switched on).
local function questAutoRows()
  return {
    { "header", L["Automation (hold Shift while talking to skip it)"] },
    check(L["Accept quests"], setting("QuestAuto", "accept")), check(L["Accept shared quests"], setting("QuestAuto", "acceptShared")), check(L["Turn in finished quests"], setting("QuestAuto", "turnIn")),
    check(L["Pick the reward that sells for most"], setting("QuestAuto", "bestReward")), check(L["Skip chatter for a single quest"], setting("QuestAuto", "skipGossip")),
  }
end

O.AddPage({ key = "quests", title = L["Quests"], icon = "NavQuests", order = 70, rows = function() return append(append(append(append(questRows(), trackerRows()), wayRows()), questHistoryRows()), questAutoRows()) end })
