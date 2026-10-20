-- Vanguard's quest tracker, in the tracker's spot under the info strip
-- (Modules/MenuStrip.lua makes the spot): each quest you watch as a block,
--   * "[12] Title" in its difficulty color ("Ready to turn in" when done, "Failed" when failed),
--   * its objectives, gray until each is done, then green,
--   * "Time left 4:32" while the quest is timed (the game's own timer frame is hidden with its tracker),
--   * its usable quest item as a button beside it (the game's own item use, with
--     its cooldown, a red tint out of range and the game's item tooltip).
-- Legacy challenges you track sit under a "Legacy challenges" heading, and recipes you track in a
-- profession window under "Recipes", each with its reagents ("2/4 Linen Cloth", green once you have them).
-- Left-click a title to open the quest; right-click to stop watching it; hover it for a tooltip that says so.
-- Quests are in the game's order, or nearest first. The game's objective
-- tracker is hidden in place while this one shows (it's an Edit Mode frame).
-- In combat the text still updates; the item buttons are secure, so they stay put
-- and are placed once, when combat ends. With Questie loaded, Questie's own
-- tracker shows instead (unless the With Questie setting picks Vanguard's), so
-- there are never two.

local ADDON, ns = ...

local QT = ns.Module("QuestTracker", { defaults = { own = true, order = "game", withQuestie = "questie", xp = true, levelXp = true, autoTrack = true, expanded = false } })

QT.W, QT.H, QT.SORT_EVERY, QT.TICK_EVERY = 260, 174, 1, 1
-- The events that redraw the tracker; XP and a level-up move the "Quests: N% of the XP to level" line.
QT.EVENTS = { "QUEST_WATCH_LIST_CHANGED", "QUEST_LOG_UPDATE", "QUEST_ACCEPTED", "QUEST_REMOVED", "PLAYER_ENTERING_WORLD",
  "CONTENT_TRACKING_UPDATE", "TRACKED_ACHIEVEMENT_UPDATE", "TRACKED_ACHIEVEMENT_LIST_CHANGED", "ACHIEVEMENT_EARNED",
  "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP" }
-- Enum.CraftingReagentType.Basic (ProfessionConstantsDocumentation.lua), for a client without the Enum.
QT.BASIC_REAGENT = 1

-- Whether Vanguard's tracker shows with these settings: it's on, and Questie (when it's
-- loaded) isn't set to show its own tracker instead.
function QT.Shows(settings)
  if not settings.own then return false end
  local loaded = C_AddOns and C_AddOns.IsAddOnLoaded
  local questie = type(loaded) == "function" and loaded("Questie")
  return not (questie and settings.withQuestie == "questie")
end

-- A table the client gives plainly (a hidden one counts as none).
local function plainTable(v)
  return not ns.IsSecret(v) and type(v) == "table" and v or nil
end

-- Data -----------------------------------------------------------------------------------------

-- The quest IDs you watch, in the game's order.
function QT.Watched()
  local out = {}
  for i = 1, ns.PlainNumber(ns.CallIf(C_QuestLog, "GetNumQuestWatches")) or 0 do
    local id = ns.PlainNumber(ns.CallIf(C_QuestLog, "GetQuestIDForQuestWatchIndex", i))
    if id then out[#out + 1] = id end
  end
  return out
end

-- A quest's objectives as { text, done } (the quest log shows them too).
function QT.Objectives(id)
  local out = {}
  for _, o in ipairs(ns.CallIf(C_QuestLog, "GetQuestObjectives", id) or {}) do
    out[#out + 1] = { text = ns.QuestParts.Plain(o.text), done = ns.IsTrue(o.finished) }
  end
  return out
end

-- The quest's usable item { link, texture }, if it has one.
local function questItem(logIndex)
  if not logIndex or type(GetQuestLogSpecialItemInfo) ~= "function" then return nil end
  local link, texture = GetQuestLogSpecialItemInfo(logIndex)
  if type(link) == "string" then return { link = link, texture = texture } end
end

-- A quest's place in the log (it moves as quests come and go), or nil when the log doesn't have it.
function QT.LogIndex(id)
  return ns.PlainNumber(ns.CallIf(C_QuestLog, "GetLogIndexForQuestID", id))
end

-- One watched quest: { id, title, level, ready, failed, objectives, item, xp }, or nil when the log doesn't have it.
-- The XP switch is read from the profile: the arrow and the minimap marks ask with this module off, before any QT.Enable.
function QT.Quest(id)
  local index = QT.LogIndex(id)
  local info = index and ns.CallIf(C_QuestLog, "GetInfo", index)
  if type(info) ~= "table" then return nil end
  local ready = ns.IsTrue(ns.CallIf(C_QuestLog, "ReadyForTurnIn", id)) or ns.IsTrue(ns.CallIf(C_QuestLog, "IsComplete", id))
  return { id = id, title = info.title, level = info.level, ready = ready, failed = ns.IsTrue(ns.CallIf(C_QuestLog, "IsFailed", id)), objectives = QT.Objectives(id), item = questItem(index),
    xp = ns.Settings("QuestTracker", QT.defaults).xp and ns.GetModule("DataBars").RewardXP(id) or 0 }
end

-- How far a quest is (squared), or a long way when the client can't say.
local function distance(q)
  return ns.PlainNumber((ns.CallIf(C_QuestLog, "GetDistanceSqToQuest", q.id))) or math.huge
end

-- Seconds left on each timed quest, by quest id, from C_QuestLog.GetQuestTimers (the call the game's own
-- timer frame reads; QuestLogDocumentation.lua's QuestTimerInfo). A timer the client hides is left out.
function QT.Timers()
  local out = {}
  for _, info in ipairs(plainTable(ns.CallIf(C_QuestLog, "GetQuestTimers")) or {}) do
    local id, left = plainTable(info) and ns.PlainNumber(info.questID), plainTable(info) and ns.PlainNumber(info.questTimer)
    if id and left then out[id] = left end
  end
  return out
end

-- A countdown as minutes and seconds ("4:32"; an hour and more as "61:05").
function QT.Clock(seconds)
  local s = math.max(0, math.floor(seconds))
  return string.format("%d:%02d", math.floor(s / 60), s % 60)
end

-- Keeps a countdown moving: a once-a-second redraw while a watched quest's timer runs (and the tracker
-- shows), stopped when none is left. A timed quest nobody watches draws no countdown, so it ticks nothing.
function QT.TickTimers(timed)
  ns.Every("quest timers", timed and QT.TICK_EVERY or nil, QT.Refresh, QT.frame)
end

-- Every watched quest, in the chosen order, each timed one with its seconds left; and whether any is timed.
function QT.Quests()
  local out, timers, timed = {}, QT.Timers(), false
  for _, id in ipairs(QT.Watched()) do
    local q = QT.Quest(id)
    if q then q.timer = timers[id] timed = timed or q.timer ~= nil out[#out + 1] = q end
  end
  if QT.settings.order == "nearest" then
    table.sort(out, function(a, b) return distance(a) < distance(b) end)
  end
  return out, timed
end

-- "Quests: 62% of the XP to level": the XP your quest log gives against what this level still needs.
-- nil at the level cap, when no quest in the log gives XP, or when the client hides a value.
function QT.LevelLine()
  local DB = ns.GetModule("DataBars")
  local need, total = DB.XPToLevel(), DB.LogXP()
  if not need or total <= 0 then return nil end
  return string.format("Quests: %d%% of the XP to level", math.floor(total / need * 100))
end

-- A quest was accepted: watch it unless it is watched already (the game may have; adding is safe either way,
-- and the game itself refuses past its watch limit). Older clients send the log index before the id.
function QT.AutoTrack(_, first, second)
  local id = ns.PlainNumber(second or first)
  if not (QT.settings.autoTrack and id) then return end
  for _, watched in ipairs(QT.Watched()) do
    if watched == id then return end
  end
  ns.CallIf(C_QuestLog, "AddQuestWatch", id)
end

-- The achievement type of the content tracker (Enum.ContentTrackingType.Achievement), or nil without it.
local function achievementType()
  local types = Enum and Enum.ContentTrackingType
  return types and types.Achievement
end

-- A tracked achievement's criteria as { text, done }, in the game's order.
local function achievementCriteria(id)
  local out = {}
  for i = 1, ns.PlainNumber(ns.CallIf(_G, "GetAchievementNumCriteria", id)) or 0 do
    local text, _, done = ns.CallIf(_G, "GetAchievementCriteriaInfo", id, i)
    out[#out + 1] = { text = ns.QuestParts.Plain(text or ""), done = ns.IsTrue(done) }
  end
  return out
end

-- One tracked achievement (a Legacy challenge on Forever): { id, title, ready, objectives, achievement = true },
-- or nil when the client doesn't have it.
function QT.Achievement(id)
  local _, name, _, completed = ns.CallIf(_G, "GetAchievementInfo", id)
  if type(name) ~= "string" then return nil end
  return { id = id, title = name, ready = ns.IsTrue(completed), objectives = achievementCriteria(id), achievement = true }
end

-- The achievements you track, in the game's order.
function QT.Achievements()
  local out, kind = {}, achievementType()
  if not (kind and C_ContentTracking and C_ContentTracking.GetTrackedIDs) then return out end
  for _, id in ipairs(C_ContentTracking.GetTrackedIDs(kind) or {}) do
    local a = QT.Achievement(id)
    if a then out[#out + 1] = a end
  end
  return out
end

-- Recipes --------------------------------------------------------------------------------------

-- A reagent line for a recipe's slot: "2/4 Linen Cloth" (your bags and bank against what the recipe needs)
-- and whether you have enough; nil for an optional slot, a hidden value, or an item the client hasn't
-- named yet (its data is asked for, and the line comes with it).
local function reagentLine(slot)
  local basic = (Enum and Enum.CraftingReagentType or {}).Basic or QT.BASIC_REAGENT
  local r, need = plainTable(slot.reagents) and plainTable(slot.reagents[1]), ns.PlainNumber(slot.quantityRequired)
  local id = r and ns.PlainNumber(r.itemID)
  if ns.PlainNumber(slot.reagentType) ~= basic or not (id and need) then return nil end
  local name = ns.CallIf(C_Item, "GetItemInfo", id)
  if ns.IsSecret(name) or type(name) ~= "string" then ns.CallIf(C_Item, "RequestLoadItemDataByID", id) QT.waitingItems = true return nil end
  local have = ns.PlainNumber(ns.CallIf(C_Item, "GetItemCount", id, true)) or 0
  return { text = have .. "/" .. need .. " " .. name, done = have >= need }
end

-- A tracked recipe's reagents as { text, done } lines, in the recipe's order.
local function recipeReagents(schematic)
  local out = {}
  for _, slot in ipairs(plainTable(schematic.reagentSlotSchematics) or {}) do
    local line = plainTable(slot) and reagentLine(slot)
    if line then out[#out + 1] = line end
  end
  return out
end

-- One tracked recipe: { id, title, objectives, recipe = true }, or nil when the client has no schematic for it.
function QT.Recipe(id)
  local s = id and plainTable(ns.CallIf(C_TradeSkillUI, "GetRecipeSchematic", id, false))
  if not s or ns.IsSecret(s.name) or type(s.name) ~= "string" then return nil end
  return { id = id, title = s.name, objectives = recipeReagents(s), recipe = true }
end

-- The recipes you track in a profession window, in the game's order (none on a client without the
-- tracking API; C_TradeSkillUI.GetRecipesTracked, TradeSkillUIDocumentation.lua).
function QT.Recipes()
  local out = {}
  QT.waitingItems = false
  for _, id in ipairs(plainTable(ns.CallIf(C_TradeSkillUI, "GetRecipesTracked", false)) or {}) do
    local r = QT.Recipe(ns.PlainNumber(id))
    if r then out[#out + 1] = r end
  end
  return out
end

-- Adds a heading and the rows under it (nothing when there are none, so the tracker looks as it did).
local function addSection(rows, name, list)
  if #list == 0 then return end
  rows[#rows + 1] = { section = name }
  for _, r in ipairs(list) do rows[#rows + 1] = r end
end

-- The rows the tracker draws: the watched quests, then the tracked Legacy challenges and the tracked
-- recipes, each under its own heading.
function QT.Rows(quests)
  local rows = {}
  for _, q in ipairs(quests) do rows[#rows + 1] = q end
  addSection(rows, "Legacy challenges", QT.Achievements())
  addSection(rows, "Recipes", QT.Recipes())
  return rows
end

-- Actions --------------------------------------------------------------------------------------

-- A title was clicked: left opens the quest (Vanguard's quest log, else the game's map), Shift-left points
-- the arrow at it (Quest guidance, when it's on); right stops watching it.
function QT.OnTitle(id, button)
  if button == "RightButton" then return ns.CallIf(C_QuestLog, "RemoveQuestWatch", id) end
  local guide = ns.QuestGuide
  if IsShiftKeyDown() and guide.settings then return guide.Point(id) end
  local log = ns.GetModule("QuestLog")
  if log and log.Open and log.frame then return log.Open(id) end
  if ns.WindowWaitsForCombat("The world map") then return end
  if type(QuestMapFrame_OpenToQuestDetails) == "function" then QuestMapFrame_OpenToQuestDetails(id) end
end

-- A tracked achievement's title was clicked: right stops tracking it (the game's own tracker does the same).
function QT.OnAchievement(id, button)
  local kind, stop = achievementType(), Enum and Enum.ContentTrackingStopType
  if button == "RightButton" and kind and C_ContentTracking and C_ContentTracking.StopTracking then
    C_ContentTracking.StopTracking(kind, id, stop and stop.Manual)
  end
end

-- A tracked recipe's title was clicked: left opens it in the profession window, right stops tracking it (the
-- game's own calls; its tracker's menu offers the same).
function QT.OnRecipe(id, button)
  if button == "RightButton" then return ns.CallIf(C_TradeSkillUI, "SetRecipeTracked", id, false, false) end
  ns.CallIf(C_TradeSkillUI, "OpenRecipe", id)
end

-- Updates ---------------------------------------------------------------------------------------

-- Applies the order setting: the once-a-second sort (while the tracker shows)
-- runs only while the order is nearest first, and the tracker is drawn in the order now.
function QT.ApplyOrder()
  if not QT.frame then return end
  ns.Every("quest tracker sort", QT.settings.order == "nearest" and QT.SORT_EVERY or nil, QT.Refresh, QT.frame)
  QT.Refresh()
end

-- Rebuilds the tracker on the next frame: the quest log fires its update many
-- times at login and on each kill, and a burst in one frame is one rebuild.
local function refreshSoon()
  if QT.frame then ns.Soon("questtracker", QT.Refresh) end
end

-- An item's data arrived: a redraw when a tracked recipe's reagent was waiting for its name.
local function itemArrived()
  if QT.waitingItems then refreshSoon() end
end

-- Follows the events the game's own recipe tracker does (Blizzard_ProfessionsRecipeTracker.lua: a recipe
-- tracked or untracked, the bags settling), and an item's name arriving, on a client that tracks recipes.
local function followRecipes()
  if not plainTable(ns.CallIf(C_TradeSkillUI, "GetRecipesTracked", false)) then return end
  ns.On("TRACKED_RECIPE_UPDATE", refreshSoon)
  ns.On("BAG_UPDATE_DELAYED", refreshSoon)
  ns.On("GET_ITEM_INFO_RECEIVED", itemArrived)
end

-- Builds the tracker (in its spot), hides the game's, and follows the quest log.
local function build()
  QT.Build(ns.MoverFrame("questtracker"))
  ns.GetModule("DataBars").Suppress("ObjectiveTrackerFrame")
  QT.ApplyOrder()
end

-- Module entry point (Core/Modules.lua): after the menu strip has made the tracker's spot.
function QT.Enable(settings)
  QT.settings = settings
  if not QT.Shows(settings) then return end
  ns.OutOfCombat(build)
  for _, event in ipairs(QT.EVENTS) do ns.On(event, refreshSoon) end
  followRecipes()
  ns.On("QUEST_ACCEPTED", QT.AutoTrack)
  ns.On("BAG_UPDATE_COOLDOWN", QT.UpdateCooldowns)
end
