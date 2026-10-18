-- Vanguard's quest log: a window with your quests by zone on the left
-- ("[12] Title" in its difficulty color, a check when ready to turn in) and
-- the chosen quest on the right: its text, objectives and rewards, with
-- Track, Share, Abandon (through the game's own confirmation; Ctrl-click marks
-- several quests to abandon at once after one question) and Map.
-- The game's quest log key and micro button open it (and /vg quests); the
-- tracker's titles open it on that quest.

local ADDON, ns = ...

local QL = ns.Module("QuestLog", { defaults = { own = true } })

QL.collapsed = {}
-- Quests marked with Ctrl-click for Abandon (id -> true).
QL.marked = {}

-- Calls a C_QuestLog function by name, if this client has it.
local function questLog(name, ...)
  local fn = C_QuestLog and C_QuestLog[name]
  if type(fn) == "function" then return fn(...) end
end

-- Calls fn if it's a function; nil otherwise.
local function call(fn, ...)
  if type(fn) == "function" then return fn(...) end
end

-- A plain true from the client (hidden values count as false).
local function yes(v)
  return not ns.IsSecret(v) and v == true
end

-- The list ----------------------------------------------------------------------------------------

-- One log entry: a zone header { header, title }, or a quest { id, title, level, ready }; nil for hidden ones.
local function entry(info)
  if type(info) ~= "table" or yes(info.isHidden) then return nil end
  if yes(info.isHeader) then return { header = true, title = info.title } end
  local id = ns.PlainNumber(info.questID)
  return id and { id = id, title = info.title, level = info.level, ready = yes(questLog("ReadyForTurnIn", id)) or yes(questLog("IsComplete", id)) }
end

-- Your quests under their zone headers (a collapsed zone keeps its header, without its quests).
function QL.Entries()
  local out, zone = {}, nil
  for i = 1, ns.PlainNumber(questLog("GetNumQuestLogEntries")) or 0 do
    local e = entry(questLog("GetInfo", i))
    if e and e.header then zone = e.title end
    if e and (e.header or not QL.collapsed[zone]) then out[#out + 1] = e end
  end
  return out
end

-- How many quests you have (headers aside).
function QL.Count()
  local n = 0
  for i = 1, ns.PlainNumber(questLog("GetNumQuestLogEntries")) or 0 do
    local e = entry(questLog("GetInfo", i))
    if e and not e.header then n = n + 1 end
  end
  return n
end

-- Details ----------------------------------------------------------------------------------------

-- A reward item for a card: its kind ("choice" or "reward"), slot and quest are what its tooltip is set from.
local function rewardItem(kind, i, id, name, texture, count, quality)
  return { kind = kind, index = i, questID = id, name = name, texture = texture, count = count, quality = quality }
end

-- The quest's reward items: choices, then what you always get.
local function rewardItems(id)
  local out = {}
  for i = 1, ns.PlainNumber(call(GetNumQuestLogChoices, id)) or 0 do
    out[#out + 1] = rewardItem("choice", i, id, call(GetQuestLogChoiceInfo, i))
  end
  for i = 1, ns.PlainNumber(call(GetNumQuestLogRewards, id)) or 0 do
    out[#out + 1] = rewardItem("reward", i, id, call(GetQuestLogRewardInfo, i, id))
  end
  return out
end

-- The quest's money and XP, as "+1g 20s 0c · 450 XP" ("" for none).
local function moneyLine(id)
  local money, xp, parts = ns.PlainNumber(call(GetQuestLogRewardMoney, id)), ns.PlainNumber(call(GetQuestLogRewardXP, id)), {}
  if money and money > 0 then parts[#parts + 1] = "+" .. ns.GetModule("InfoStrip").Money(money) end
  if xp and xp > 0 then parts[#parts + 1] = xp .. " XP" end
  return table.concat(parts, "  ·  ")
end

-- Whether you watch a quest: it is in the watch list the tracker draws from (the client's watch type
-- can't be trusted to be nil for a quest you don't watch).
function QL.IsWatched(id)
  for _, watched in ipairs(ns.GetModule("QuestTracker").Watched()) do
    if watched == id then return true end
  end
  return false
end

-- The chosen quest's details: { id, title, level, text, objectives, rewards, money, watched, shareable, done (the quest history line) }.
function QL.Details(id)
  local index = ns.PlainNumber(questLog("GetLogIndexForQuestID", id))
  local info = index and questLog("GetInfo", index)
  if type(info) ~= "table" then return nil end
  questLog("SetSelectedQuest", id)
  local text = call(GetQuestLogQuestText)
  return { id = id, title = info.title, level = info.level, text = text, objectives = ns.GetModule("QuestTracker").Objectives(id),
    rewards = rewardItems(id), money = moneyLine(id), watched = QL.IsWatched(id),
    shareable = yes(questLog("IsPushableQuest", id)) and yes(call(IsInGroup)), done = ns.GetModule("QuestHistory").Muted(id) }
end

-- Actions ----------------------------------------------------------------------------------------

-- Starts or stops watching the chosen quest, then redraws it so the button shows what the game now says;
-- says so in chat when the game didn't change it (at its watch limit, say).
function QL.ToggleTrack(d)
  if d.watched then questLog("RemoveQuestWatch", d.id) else questLog("AddQuestWatch", d.id) end
  if QL.IsWatched(d.id) == d.watched then
    ns.Chat(("The game didn't %s %s (%d quests tracked)."):format(d.watched and "untrack" or "track", ns.QuestParts.Plain(d.title), #ns.GetModule("QuestTracker").Watched()))
  end
  QL.Select(d.id)
end

-- Shares the chosen quest with your group.
function QL.Share(d)
  questLog("SetSelectedQuest", d.id)
  call(QuestLogPushQuest)
end

-- Abandons the chosen quest, through the game's own confirmation; with quests marked (Ctrl-click a
-- quest in the list), abandons the marked ones after one question of Vanguard's.
function QL.Abandon(d)
  if QL.MarkedCount() > 0 then return QL.AbandonMarked() end
  questLog("SetSelectedQuest", d.id)
  questLog("SetAbandonQuest")
  call(StaticPopup_Show, "ABANDON_QUEST", ns.QuestParts.Plain(d.title))
end

-- The marked quests still in your log, as { id, title } in log order.
function QL.MarkedQuests()
  local out = {}
  for _, e in ipairs(QL.Entries()) do
    if e.id and QL.marked[e.id] then out[#out + 1] = e end
  end
  return out
end

-- How many quests are marked.
function QL.MarkedCount()
  return #QL.MarkedQuests()
end

-- Abandons each quest of the list (the question was the confirmation), then clears the marks.
local function abandonAll(list)
  for _, e in ipairs(list) do
    questLog("SetSelectedQuest", e.id)
    questLog("SetAbandonQuest")
    questLog("AbandonQuest")
  end
  QL.marked = {}
  ns.Chat(string.format("Abandoned %d quest(s).", #list))
  QL.Refresh()
end

-- Asks, naming the marked quests, then abandons them all.
function QL.AbandonMarked()
  local list, names = QL.MarkedQuests(), {}
  for i, e in ipairs(list) do names[i] = ns.QuestParts.Plain(e.title) end
  if #list == 0 then return end
  ns.Ask(string.format("Abandon %d quest(s)?\n%s", #list, table.concat(names, "\n")), "Abandon", function() abandonAll(list) end, nil, "danger")
end

-- Shows the chosen quest on the game's map.
function QL.ShowOnMap(d)
  call(QuestMapFrame_OpenToQuestDetails, d.id)
end

-- Opening -----------------------------------------------------------------------------------------

-- Opens the log, on a quest when given one.
function QL.Open(id)
  QL.selected = id or QL.selected
  QL.frame:Show()
  QL.Refresh()
end

-- Opens or closes the log.
function QL.Toggle()
  if QL.frame:IsShown() then return QL.frame:Hide() end
  QL.Open()
end

-- The game's quest log key(s) open this log instead (set out of combat; again when keys change).
function QL.BindKeys()
  ns.OutOfCombat(function()
    ClearOverrideBindings(QL.toggle)
    for _, key in ipairs({ call(GetBindingKey, "TOGGLEQUESTLOG") }) do
      SetOverrideBindingClick(QL.toggle, false, key, "Vanguard_QuestLogToggle")
    end
  end)
end

-- The button the quest log key clicks.
local function addToggle()
  QL.toggle = CreateFrame("Button", "Vanguard_QuestLogToggle", UIParent)
  QL.toggle:SetScript("OnClick", ns.Guard("click quest log toggle", QL.Toggle))
end

-- The game's own quest log toggle ran (its micro button, or anything else that
-- calls it): open or close this log, and put away the game's window it just opened.
function QL.OnGameToggle()
  QL.Toggle()
  local map = _G.WorldMapFrame
  if type(map) == "table" and map:IsShown() and type(HideUIPanel) == "function" then HideUIPanel(map) end
end

-- Makes the game's quest log toggle (the micro button) open this log too.
local function hookGameToggle()
  if type(hooksecurefunc) == "function" and type(_G.ToggleQuestLog) == "function" then hooksecurefunc("ToggleQuestLog", ns.Guard("hook ToggleQuestLog", QL.OnGameToggle)) end
end

-- Re-renders the log, if it is still open.
local function refreshIfOpen()
  if QL.frame:IsShown() then QL.Refresh() end
end

-- QUEST_LOG_UPDATE while the log is open: re-render it on the next frame (the
-- log fires many updates at once; a burst in one frame is one re-render).
local function refreshSoon()
  if QL.frame:IsShown() then ns.Soon("questlog", refreshIfOpen) end
end

-- Module entry point (Core/Modules.lua).
function QL.Enable(settings)
  if not settings.own then return end
  QL.Build()
  addToggle()
  if type(SetOverrideBindingClick) == "function" and type(ClearOverrideBindings) == "function" then
    QL.BindKeys()
    ns.On("UPDATE_BINDINGS", QL.BindKeys)
  end
  hookGameToggle()
  ns.On("QUEST_LOG_UPDATE", refreshSoon)
  ns.On("QUEST_WATCH_LIST_CHANGED", refreshSoon)
end
