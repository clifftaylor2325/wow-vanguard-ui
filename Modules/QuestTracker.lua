-- ForeverUI's quest tracker, in the tracker's spot under the info strip
-- (Modules/MenuStrip.lua makes the spot): each quest you watch as a block,
--   * "[12] Title" in its difficulty color ("Ready to turn in" when done),
--   * its objectives, gray until each is done, then green,
--   * its usable quest item as a button beside it (the game's own item use).
-- Left-click a title to open the quest; right-click to stop watching it.
-- Quests are in the game's order, or nearest first. The game's objective
-- tracker is hidden in place while this one shows (it's an Edit Mode frame).

local ADDON, ns = ...

local QT = ns.Module("QuestTracker", { defaults = { own = true, order = "game" } })

QT.W, QT.H, QT.SORT_EVERY = 260, 264, 1
QT.EVENTS = { "QUEST_WATCH_LIST_CHANGED", "QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_REMOVED", "PLAYER_ENTERING_WORLD" }

-- Calls a C_QuestLog function by name, if this client has it.
local function questLog(name, ...)
  local fn = C_QuestLog and C_QuestLog[name]
  if type(fn) == "function" then return fn(...) end
end

-- A plain true from the client (hidden values count as false).
local function yes(v)
  return not ns.IsSecret(v) and v == true
end

-- Data -----------------------------------------------------------------------------------------

-- The quest IDs you watch, in the game's order.
function QT.Watched()
  local out = {}
  for i = 1, ns.PlainNumber(questLog("GetNumQuestWatches")) or 0 do
    local id = ns.PlainNumber(questLog("GetQuestIDForQuestWatchIndex", i))
    if id then out[#out + 1] = id end
  end
  return out
end

-- A quest's objectives as { text, done }.
local function objectives(id)
  local out = {}
  for _, o in ipairs(questLog("GetQuestObjectives", id) or {}) do
    out[#out + 1] = { text = ns.QuestParts.Plain(o.text), done = yes(o.finished) }
  end
  return out
end

-- The quest's usable item { link, texture }, if it has one.
local function questItem(logIndex)
  if not logIndex or type(GetQuestLogSpecialItemInfo) ~= "function" then return nil end
  local link, texture = GetQuestLogSpecialItemInfo(logIndex)
  if type(link) == "string" then return { link = link, texture = texture } end
end

-- One watched quest: { id, title, level, ready, objectives, item }, or nil when the log doesn't have it.
function QT.Quest(id)
  local index = ns.PlainNumber(questLog("GetLogIndexForQuestID", id))
  local info = index and questLog("GetInfo", index)
  if type(info) ~= "table" then return nil end
  local ready = yes(questLog("ReadyForTurnIn", id)) or yes(questLog("IsComplete", id))
  return { id = id, title = info.title, level = info.level, ready = ready, objectives = objectives(id), item = questItem(index) }
end

-- How far a quest is (squared), or a long way when the client can't say.
local function distance(q)
  return ns.PlainNumber((questLog("GetDistanceSqToQuest", q.id))) or math.huge
end

-- Every watched quest, in the chosen order.
function QT.Quests()
  local out = {}
  for _, id in ipairs(QT.Watched()) do out[#out + 1] = QT.Quest(id) end
  if QT.settings.order == "nearest" then
    table.sort(out, function(a, b) return distance(a) < distance(b) end)
  end
  return out
end

-- Actions --------------------------------------------------------------------------------------

-- A title was clicked: left opens the quest (ForeverUI's quest log, else the game's map); right stops watching it.
function QT.OnTitle(id, button)
  if button == "RightButton" then return questLog("RemoveQuestWatch", id) end
  local log = ns.GetModule("QuestLog")
  if log and log.Open and log.frame then return log.Open(id) end
  if type(QuestMapFrame_OpenToQuestDetails) == "function" then QuestMapFrame_OpenToQuestDetails(id) end
end

-- Updates ---------------------------------------------------------------------------------------

-- Re-sorts by distance every second, while that order is on.
local function sortTicker()
  local elapsed = 0
  QT.frame:SetScript("OnUpdate", function(_, dt)
    elapsed = elapsed + dt
    if elapsed < QT.SORT_EVERY then return end
    elapsed = 0
    if QT.settings.order == "nearest" then QT.Refresh() end
  end)
end

-- Builds the tracker (in its spot), hides the game's, and follows the quest log.
local function build()
  QT.Build(ns.MoverFrame("questtracker"))
  ns.GetModule("DataBars").Suppress("ObjectiveTrackerFrame")
  sortTicker()
  QT.Refresh()
end

-- Module entry point (Core/Modules.lua): after the menu strip has made the tracker's spot.
function QT.Enable(settings)
  QT.settings = settings
  if not settings.own then return end
  ns.OutOfCombat(build)
  for _, event in ipairs(QT.EVENTS) do ns.On(event, function() if QT.frame then QT.Refresh() end end) end
end
