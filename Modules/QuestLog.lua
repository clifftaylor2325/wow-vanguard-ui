-- Vanguard's quest log: a window with your quests by zone on the left
-- ("[12] Title" in its difficulty color, a check when ready to turn in) and
-- the chosen quest on the right: its text, objectives and rewards, with
-- Track, Share, Abandon (through the game's own confirmation; Ctrl-click marks
-- several quests to abandon at once after one question) and Map.
-- The game's quest log key and micro button open it (and /vg quests); the
-- tracker's titles open it on that quest.

local ADDON, ns = ...
local L = ns.L

local QL = ns.Module("QuestLog", { defaults = { own = true, xp = true } })

QL.collapsed = {}
-- Quests marked with Ctrl-click for Abandon (id -> true).
QL.marked = {}

-- Calls a C_QuestLog function by name, if this client has it.
local function questLog(name, ...)
  local fn = C_QuestLog and C_QuestLog[name]
  if type(fn) == "function" then return fn(...) end
end

-- The list ----------------------------------------------------------------------------------------

-- One log entry: a zone header { header, title }, or a quest { id, title, level, ready }; nil for hidden ones.
local function entry(info)
  if type(info) ~= "table" or ns.IsTrue(info.isHidden) then return nil end
  if ns.IsTrue(info.isHeader) then return { header = true, title = info.title } end
  local id = ns.PlainNumber(info.questID)
  return id and { id = id, title = info.title, level = info.level, ready = ns.GetModule("QuestTracker").IsReady(id) }
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

-- Every quest in your log in log order, those under a folded zone too (headers aside).
local function allQuests()
  local out = {}
  for i = 1, ns.PlainNumber(questLog("GetNumQuestLogEntries")) or 0 do
    local e = entry(questLog("GetInfo", i))
    if e and not e.header then out[#out + 1] = e end
  end
  return out
end

-- How many quests you have (headers aside).
function QL.Count()
  return #allQuests()
end

-- The XP a quest's list line shows: its reward, or 0 with the setting off.
function QL.XP(id)
  return QL.settings and QL.settings.xp and ns.GetModule("DataBars").RewardXP(id) or 0
end

-- Details ----------------------------------------------------------------------------------------

-- A reward item for a card: its kind ("choice" or "reward"), slot and quest are what its tooltip is set from;
-- its link gives its sell price (the crown).
local function rewardItem(kind, i, id, name, texture, count, quality)
  return { kind = kind, index = i, questID = id, name = name, texture = texture, count = count, quality = quality, link = ns.CallIf(_G, "GetQuestLogItemLink", kind, i) }
end

-- The quest's reward items: choices, then what you always get.
local function rewardItems(id)
  local out = {}
  for i = 1, ns.PlainNumber(ns.CallIf(_G, "GetNumQuestLogChoices", id)) or 0 do
    out[#out + 1] = rewardItem("choice", i, id, ns.CallIf(_G, "GetQuestLogChoiceInfo", i))
  end
  for i = 1, ns.PlainNumber(ns.CallIf(_G, "GetNumQuestLogRewards", id)) or 0 do
    out[#out + 1] = rewardItem("reward", i, id, ns.CallIf(_G, "GetQuestLogRewardInfo", i, id))
  end
  return out
end

-- The quest's money and XP, as "+1g 20s 0c · 450 XP" ("" for none).
local function moneyLine(id)
  return ns.QuestParts.MoneyText(ns.PlainNumber(ns.CallIf(_G, "GetQuestLogRewardMoney", id)), ns.PlainNumber(ns.CallIf(_G, "GetQuestLogRewardXP", id)))
end

-- Whether you watch a quest: it is in the watch list the tracker draws from (the client's watch type
-- can't be trusted to be nil for a quest you don't watch).
function QL.IsWatched(id)
  return ns.GetModule("QuestTracker").IsWatched(id)
end

-- What the chosen quest asks beside its objectives (QP.Needs: money and group size), and whether it failed
-- (a timed or escort quest that ran out); a read the client lacks or hides is left out.
local function requirements(id, d)
  d.needs, d.short = ns.QuestParts.Needs(questLog("GetRequiredMoney", id), questLog("GetSuggestedGroupSize", id))
  d.failed = ns.IsTrue(questLog("IsFailed", id))
  return d
end

-- The chosen quest's details: { id, title, level, text, objectives, rewards, money, watched, shareable, done (the
-- quest history line), needs and short (QP.Needs), failed }. It selects the quest in the game's log, which the
-- quest text read needs.
function QL.Details(id)
  local index = ns.PlainNumber(questLog("GetLogIndexForQuestID", id))
  local info = index and questLog("GetInfo", index)
  if type(info) ~= "table" then return nil end
  questLog("SetSelectedQuest", id)
  local text = ns.CallIf(_G, "GetQuestLogQuestText")
  return requirements(id, { id = id, title = info.title, level = info.level, text = text, objectives = ns.GetModule("QuestTracker").Objectives(id),
    rewards = rewardItems(id), money = moneyLine(id), watched = QL.IsWatched(id),
    shareable = ns.IsTrue(questLog("IsPushableQuest", id)) and ns.IsTrue(ns.CallIf(_G, "IsInGroup")), done = ns.GetModule("QuestHistory").Muted(id) })
end

-- Actions ----------------------------------------------------------------------------------------

-- What chat says when the game didn't change a quest's watch, by whether it was watched.
local UNCHANGED = {
  [true] = L["The game didn't untrack {quest} ({count} quests tracked)."],
  [false] = L["The game didn't track {quest} ({count} quests tracked)."],
}

-- Starts or stops watching the chosen quest, then redraws it so the button shows what the game now says;
-- says so in chat when the game didn't change it (at its watch limit, say).
function QL.ToggleTrack(d)
  if d.watched then questLog("RemoveQuestWatch", d.id) else questLog("AddQuestWatch", d.id) end
  if QL.IsWatched(d.id) == d.watched then
    local values = { quest = ns.QuestParts.Plain(d.title), count = #ns.GetModule("QuestTracker").Watched() }
    ns.Chat(ns.Format(UNCHANGED[d.watched == true], values))
  end
  QL.Select(d.id)
end

-- Shares the chosen quest with your group.
function QL.Share(d)
  questLog("SetSelectedQuest", d.id)
  ns.CallIf(_G, "QuestLogPushQuest")
end

-- The items the game destroys with the quest SetAbandonQuest picked, as "Name, Name" (as the game's quest
-- map lists them), or nil for none (an item the client can't name yet is left out, as there).
local function abandonItems()
  local names = {}
  for _, itemID in ipairs(questLog("GetAbandonQuestItems") or {}) do
    local name = ns.CallIf(C_Item, "GetItemInfo", itemID)
    if type(name) == "string" and not ns.IsSecret(name) then names[#names + 1] = name end
  end
  return #names > 0 and table.concat(names, ", ") or nil
end

-- Picks a quest to abandon (the client's SetAbandonQuest) and returns the items it destroys, or nil.
local function pickToAbandon(id)
  questLog("SetSelectedQuest", id)
  questLog("SetAbandonQuest")
  return abandonItems()
end

-- Abandons the chosen quest, through the game's own confirmation (the one naming the items it destroys,
-- when it does); with quests marked (Ctrl-click a quest in the list), abandons the marked ones after one
-- question of Vanguard's.
function QL.Abandon(d)
  if QL.MarkedCount() > 0 then return QL.AbandonMarked() end
  local title, items = ns.QuestParts.Plain(d.title), pickToAbandon(d.id)
  if items then return ns.CallIf(_G, "StaticPopup_Show", "ABANDON_QUEST_WITH_ITEMS", title, items) end
  ns.CallIf(_G, "StaticPopup_Show", "ABANDON_QUEST", title)
end

-- The marked quests still in your log, as { id, title } in log order (a folded zone's marks count too).
function QL.MarkedQuests()
  local out = {}
  for _, e in ipairs(allQuests()) do
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
  ns.Chat(ns.Format(L["Abandoned {count} quest(s)."], { count = #list }))
  QL.Refresh()
end

-- A marked quest's line in the abandon question: its title, and the items abandoning it destroys.
local function markedLine(e)
  local title, items = ns.QuestParts.Plain(e.title), pickToAbandon(e.id)
  return items and ns.Format(L["{quest} (destroys {items})"], { quest = title, items = items }) or title
end

-- Asks, naming the marked quests (and the items they destroy), then abandons them all.
function QL.AbandonMarked()
  local list, names = QL.MarkedQuests(), {}
  for i, e in ipairs(list) do names[i] = markedLine(e) end
  if #list == 0 then return end
  local question = ns.Format(L["Abandon {count} quest(s)?\n{quests}"], { count = #list, quests = table.concat(names, "\n") })
  ns.Ask(question, L["Abandon"], function() abandonAll(list) end, nil, "danger")
end

-- Shows the chosen quest on the game's map.
function QL.ShowOnMap(d)
  if ns.WindowWaitsForCombat(L["The world map"]) then return end
  ns.CallIf(_G, "QuestMapFrame_OpenToQuestDetails", d.id)
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
    for _, key in ipairs({ ns.CallIf(_G, "GetBindingKey", "TOGGLEQUESTLOG") }) do
      SetOverrideBindingClick(QL.toggle, false, key, "Vanguard_QuestLogToggle")
    end
  end, "quest log keys")
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

-- Binds the quest log key (and keeps it bound), on a client that can.
local function bindKeys()
  if type(SetOverrideBindingClick) ~= "function" or type(ClearOverrideBindings) ~= "function" then return end
  QL.BindKeys()
  ns.On("UPDATE_BINDINGS", QL.BindKeys)
end

-- Module entry point (Core/Modules.lua).
function QL.Enable(settings)
  QL.settings = settings
  if not settings.own then return end
  QL.Build()
  addToggle()
  bindKeys()
  hookGameToggle()
  -- Share is lit only in a group (as the game's quest map does on GROUP_ROSTER_UPDATE); an item's info
  -- arriving can settle the reward crown.
  for _, event in ipairs({ "QUEST_LOG_UPDATE", "QUEST_WATCH_LIST_CHANGED", "GROUP_ROSTER_UPDATE", "GET_ITEM_INFO_RECEIVED" }) do
    ns.On(event, refreshSoon)
  end
end
