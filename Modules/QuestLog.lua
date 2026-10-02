-- ForeverUI's quest log: a window with your quests by zone on the left
-- ("[12] Title" in its difficulty color, a check when ready to turn in) and
-- the chosen quest on the right: its text, objectives and rewards, with
-- Track, Share, Abandon (through the game's own confirmation) and Map.
-- The game's quest log key opens it (and /fui quests); the tracker's titles
-- open it on that quest.

local ADDON, ns = ...

local QL = ns.Module("QuestLog", { defaults = { own = true } })

QL.collapsed = {}

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

-- The quest's reward items: choices, then what you always get.
local function rewardItems(id)
  local out = {}
  for i = 1, ns.PlainNumber(call(GetNumQuestLogChoices, id)) or 0 do
    local name, texture, count, quality = call(GetQuestLogChoiceInfo, i)
    out[#out + 1] = { name = name, texture = texture, count = count, quality = quality }
  end
  for i = 1, ns.PlainNumber(call(GetNumQuestLogRewards, id)) or 0 do
    local name, texture, count, quality = call(GetQuestLogRewardInfo, i, id)
    out[#out + 1] = { name = name, texture = texture, count = count, quality = quality }
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

-- The chosen quest's details: { id, title, level, text, objectives, rewards, money, watched, shareable }.
function QL.Details(id)
  local index = ns.PlainNumber(questLog("GetLogIndexForQuestID", id))
  local info = index and questLog("GetInfo", index)
  if type(info) ~= "table" then return nil end
  questLog("SetSelectedQuest", id)
  local text = call(GetQuestLogQuestText)
  return { id = id, title = info.title, level = info.level, text = text, objectives = ns.GetModule("QuestTracker").Objectives(id),
    rewards = rewardItems(id), money = moneyLine(id), watched = questLog("GetQuestWatchType", id) ~= nil,
    shareable = yes(questLog("IsPushableQuest", id)) and yes(call(IsInGroup)) }
end

-- Actions ----------------------------------------------------------------------------------------

-- Starts or stops watching the chosen quest.
function QL.ToggleTrack(d)
  if d.watched then questLog("RemoveQuestWatch", d.id) else questLog("AddQuestWatch", d.id) end
end

-- Shares the chosen quest with your group.
function QL.Share(d)
  questLog("SetSelectedQuest", d.id)
  call(QuestLogPushQuest)
end

-- Abandons the chosen quest, through the game's own confirmation.
function QL.Abandon(d)
  questLog("SetSelectedQuest", d.id)
  questLog("SetAbandonQuest")
  call(StaticPopup_Show, "ABANDON_QUEST", ns.QuestParts.Plain(d.title))
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
      SetOverrideBindingClick(QL.toggle, false, key, "ForeverUI_QuestLogToggle")
    end
  end)
end

-- The button the quest log key clicks.
local function addToggle()
  QL.toggle = CreateFrame("Button", "ForeverUI_QuestLogToggle", UIParent)
  QL.toggle:SetScript("OnClick", QL.Toggle)
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
  ns.On("QUEST_LOG_UPDATE", function() if QL.frame:IsShown() then QL.Refresh() end end)
end
