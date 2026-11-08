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
local L, T = ns.L, ns.Theme

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

-- Whether the quest is watched: it is in the list the tracker draws from.
---@param id number
---@return boolean
function QT.IsWatched(id)
  for _, watched in ipairs(QT.Watched()) do
    if watched == id then return true end
  end
  return false
end

-- A quest's objectives as { text, done } (the quest log shows them too).
function QT.Objectives(id)
  local out = {}
  for _, o in ipairs(ns.CallIf(C_QuestLog, "GetQuestObjectives", id) or {}) do
    out[#out + 1] = { text = ns.QuestParts.Plain(o.text), done = ns.IsTrue(o.finished) }
  end
  return out
end

-- The quest's usable item { link, texture }, if it has one. The item goes once the quest is ready to turn in,
-- unless the game keeps showing it.
---@param logIndex number|nil
---@param ready boolean
---@return table|nil
function QT.QuestItem(logIndex, ready)
  if not logIndex or type(GetQuestLogSpecialItemInfo) ~= "function" then return nil end
  local link, texture, _, showsWhenReady = GetQuestLogSpecialItemInfo(logIndex)
  if type(link) == "string" and (not ready or ns.IsTrue(showsWhenReady)) then return { link = link, texture = texture } end
end

-- Opens every zone folded in the game's own quest list, since the log hides the quests under a folded
-- zone: Vanguard's lists read the whole log. The bottom zone first, so the places above it stay put.
function QT.OpenFolds()
  if type(ExpandQuestHeader) ~= "function" then return end
  for i = ns.PlainNumber((ns.CallIf(C_QuestLog, "GetNumQuestLogEntries"))) or 0, 1, -1 do
    local info = ns.CallIf(C_QuestLog, "GetInfo", i)
    if type(info) == "table" and ns.IsTrue(info.isHeader) and ns.IsTrue(info.isCollapsed) then ExpandQuestHeader(i) end
  end
end

-- The game folds every zone off the current map as you zone in (QuestMapFrame_ResetFilters, on
-- PLAYER_ENTERING_WORLD): they are opened on the next frame, after it, so the quest log, the XP lines, the
-- dungeon card and the tracker read every quest. Shared by those modules, so it holds whichever are on.
-- The windowed world map's quest panel folds them again on each map change while it is up, so they are opened
-- again when the panel closes (the map closing, or its panel being put away); a zone folded by hand stays
-- folded until the next zone-in, that closing, or until Vanguard's log opens.
local function openFoldsSoon()
  ns.Soon("quest folds", QT.OpenFolds)
end
ns.On("PLAYER_ENTERING_WORLD", ns.Guard("quest folds", openFoldsSoon))

-- Has the game's map quest panel (QuestMapFrame, there before any addon loads) open the folds when it hides.
-- HookScript only: the game's frame keeps its own scripts.
local function hookMapPanel()
  local panel = _G.QuestMapFrame
  if type(panel) == "table" and panel.HookScript then panel:HookScript("OnHide", ns.Guard("quest folds", openFoldsSoon)) end
end
hookMapPanel()

-- The quest id of a log row the game's own log lists, or nil: not a header, hidden or a task (a world quest or bonus
-- objective), and a bounty only once it is complete. The quest log, the XP footer and the XP tooltip share this rule.
---@param info table|nil  A C_QuestLog.GetInfo row.
---@return number|nil
function QT.Listed(info)
  if type(info) ~= "table" or ns.IsTrue(info.isHeader) or ns.IsTrue(info.isHidden) or ns.IsTrue(info.isTask) then return nil end
  local id = ns.PlainNumber(info.questID)
  if id and ns.IsTrue(info.isBounty) and not ns.IsTrue(ns.CallIf(C_QuestLog, "IsComplete", id)) then return nil end
  return id
end

-- A quest's place in the log (it moves as quests come and go), or nil when the log doesn't have it.
function QT.LogIndex(id)
  return ns.PlainNumber(ns.CallIf(C_QuestLog, "GetLogIndexForQuestID", id))
end

-- Whether the quest is ready to turn in: the game's ready flag, or complete. The quest log's list uses it too.
---@param id number
---@return boolean
function QT.IsReady(id)
  return ns.IsTrue(ns.CallIf(C_QuestLog, "ReadyForTurnIn", id)) or ns.IsTrue(ns.CallIf(C_QuestLog, "IsComplete", id))
end

-- One watched quest: { id, title, level, ready, autoComplete, failed, objectives, item, xp }, or nil when the log doesn't have it.
-- The XP switch is read from the profile: the arrow and the minimap marks ask with this module off, before any QT.Enable.
function QT.Quest(id)
  local index = QT.LogIndex(id)
  local info = index and ns.CallIf(C_QuestLog, "GetInfo", index)
  if type(info) ~= "table" then return nil end
  local ready = QT.IsReady(id)
  return { id = id, title = info.title, level = info.level, ready = ready, autoComplete = ns.IsTrue(info.isAutoComplete), failed = ns.IsTrue(ns.CallIf(C_QuestLog, "IsFailed", id)), objectives = QT.Objectives(id), item = QT.QuestItem(index, ready),
    xp = ns.Settings("QuestTracker", QT.defaults).xp and ns.GetModule("DataBars").RewardXP(id) or 0 }
end

-- How far a quest is (squared), or nil when the client won't say or says it isn't on your continent (that
-- distance means nothing). A client with one return keeps the distance.
---@param id number
---@return number|nil
function QT.DistanceSq(id)
  local sq, onContinent = ns.CallIf(C_QuestLog, "GetDistanceSqToQuest", id)
  if not ns.IsSecret(onContinent) and onContinent == false then return nil end
  return ns.PlainNumber(sq)
end

-- How far a quest is (squared), or a long way when it can't be told.
local function distance(q)
  return QT.DistanceSq(q.id) or math.huge
end

-- Seconds left on each timed quest, by quest id, on WoW Forever: C_QuestLog.GetQuestTimers (the call the game's
-- own timer frame reads; QuestLogDocumentation.lua's QuestTimerInfo). A timer the client hides is left out.
local function questTimers()
  local out = {}
  for _, info in ipairs(ns.PlainTable(ns.CallIf(C_QuestLog, "GetQuestTimers")) or {}) do
    local id, left = ns.PlainTable(info) and ns.PlainNumber(info.questID), ns.PlainTable(info) and ns.PlainNumber(info.questTimer)
    if id and left then out[id] = left end
  end
  return out
end

-- The same on Retail, which has no GetQuestTimers: each watched quest's (the ids given) C_QuestLog.GetTimeAllowed (its whole
-- time and the seconds gone, as the game's own tracker reads them), while time is left. A hidden value is left out.
local function timesAllowed(watched)
  local out = {}
  for _, id in ipairs(watched) do
    local total, gone = ns.CallIf(C_QuestLog, "GetTimeAllowed", id)
    total, gone = ns.PlainNumber(total), ns.PlainNumber(gone)
    if total and gone and gone < total then out[id] = total - gone end
  end
  return out
end

-- Seconds left on each timed quest, by quest id: the running client's call, picked once. Takes the watched ids.
QT.Timers = ns.ClientData({ forever = questTimers, retail = timesAllowed })

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
  local watched = QT.Watched()
  local out, timers, timed = {}, QT.Timers(watched), false
  for _, id in ipairs(watched) do
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
  return ns.Format(L["Quests: {percent}% of the XP to level"], { percent = math.floor(total / need * 100) })
end

-- Whether the game's own tracker would watch a quest that was just accepted: it leaves bounty and task
-- (world) quests out of the watch list.
local function watchedOnAccept(id)
  return not (ns.IsTrue(ns.CallIf(C_QuestLog, "IsQuestBounty", id)) or ns.IsTrue(ns.CallIf(C_QuestLog, "IsQuestTask", id)))
end

-- A quest was accepted: watch it unless it is watched already (the game may have; adding is safe either way,
-- and the game itself refuses past its watch limit) or the game would not (a world or bounty quest). Older
-- clients send the log index before the id.
function QT.AutoTrack(_, first, second)
  local id = ns.PlainNumber(second or first)
  if not (QT.settings.autoTrack and id) or QT.IsWatched(id) or not watchedOnAccept(id) then return end
  ns.CallIf(C_QuestLog, "AddQuestWatch", id)
end

-- The watch list put in the game's order again on a new area, as the game's own tracker did (its events are
-- off while this tracker shows). With the nearest-first order the tracker sorts itself.
function QT.SortWatches()
  if QT.settings.order == "game" then ns.CallIf(C_QuestLog, "SortQuestWatches") end
end

-- The game also sorts again when a zone change puts you on another map (Blizzard_ObjectiveTracker.lua), once
-- per map; the nearest-first order sorts itself.
function QT.SortOnMapChange()
  local mapID = ns.PlainNumber(ns.CallIf(C_Map, "GetBestMapForUnit", "player"))
  if mapID == QT.sortedMap then return end
  QT.sortedMap = mapID
  QT.SortWatches()
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

-- The heading over tracked achievements: Forever's "Legacy challenges", Retail's "Achievements".
QT.ACHIEVEMENT_HEADING = ns.ClientData({ forever = L["Legacy challenges"], retail = L["Achievements"] })

-- Whether an achievement you have earned leaves the tracker: on Retail it does, as in the game's own; on Forever it
-- stays and reads "Complete".
QT.SKIP_EARNED = ns.ClientData({ forever = false, retail = true })

-- A tracked achievement's lines: its criteria, or its description when it has none (as the game's tracker does).
local function achievementObjectives(id, description)
  local criteria = achievementCriteria(id)
  if #criteria > 0 or type(description) ~= "string" then return criteria end
  return { { text = ns.QuestParts.Plain(description), done = false } }
end

-- One tracked achievement (a Legacy challenge on Forever): { id, title, ready, objectives, achievement = true },
-- or nil when the client doesn't have it (or, on Retail, you have earned it).
function QT.Achievement(id)
  local _, name, _, completed, _, _, _, description, _, _, _, _, earnedByMe = ns.CallIf(_G, "GetAchievementInfo", id)
  if type(name) ~= "string" or (QT.SKIP_EARNED and ns.IsTrue(earnedByMe)) then return nil end
  return { id = id, title = name, ready = ns.IsTrue(completed), objectives = achievementObjectives(id, description), achievement = true }
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

-- How many of a slot's reagents you hold. Retail counts every quality rank the way the game's tracker does
-- (ItemUtil.GetCraftingReagentCount: bags, reagent bank and warband bank); Forever counts its first rank in
-- the bags and bank.
local function slotCount(reagents)
  local retail, have = not ns.IsForever(), 0
  for _, r in ipairs(retail and reagents or { reagents[1] }) do
    local id = ns.PlainTable(r) and ns.PlainNumber(r.itemID)
    local n = id and (retail and ns.CallIf(ItemUtil, "GetCraftingReagentCount", id) or ns.CallIf(C_Item, "GetItemCount", id, true))
    have = have + (ns.PlainNumber(n) or 0)
  end
  return have
end

-- A reagent line for a recipe's slot: "2/4 Linen Cloth" (what you hold against what the recipe needs)
-- and whether you have enough; nil for an optional slot, a hidden value, or an item the client hasn't
-- named yet (its data is asked for, and the line comes with it). The second value is true in that last case.
local function reagentLine(slot)
  local basic = (Enum and Enum.CraftingReagentType or {}).Basic or QT.BASIC_REAGENT
  local r, need = ns.PlainTable(slot.reagents) and ns.PlainTable(slot.reagents[1]), ns.PlainNumber(slot.quantityRequired)
  local id = r and ns.PlainNumber(r.itemID)
  if ns.PlainNumber(slot.reagentType) ~= basic or not (id and need) then return nil end
  local name = ns.CallIf(C_Item, "GetItemInfo", id)
  if ns.IsSecret(name) or type(name) ~= "string" then ns.CallIf(C_Item, "RequestLoadItemDataByID", id) return nil, true end
  local have = slotCount(slot.reagents)
  return { text = have .. "/" .. need .. " " .. name, done = have >= need }
end

-- A tracked recipe's reagents as { text, done } lines, in the recipe's order; the second value is true while
-- a reagent's name is still loading.
local function recipeReagents(schematic)
  local out, loading = {}, false
  for _, slot in ipairs(ns.PlainTable(schematic.reagentSlotSchematics) or {}) do
    local line, waiting
    if ns.PlainTable(slot) then line, waiting = reagentLine(slot) end
    if line then out[#out + 1] = line end
    loading = loading or waiting == true
  end
  return out, loading
end

-- One tracked recipe: { id, title, objectives, recipe = true }, or nil when the client has no schematic for it.
-- The second value is true while one of its reagent names is still loading.
function QT.Recipe(id)
  local s = id and ns.PlainTable(ns.CallIf(C_TradeSkillUI, "GetRecipeSchematic", id, false))
  if not s or ns.IsSecret(s.name) or type(s.name) ~= "string" then return nil end
  local reagents, loading = recipeReagents(s)
  return { id = id, title = s.name, objectives = reagents, recipe = true }, loading
end

-- The recipes you track in a profession window, in the game's order (none on a client without the
-- tracking API; C_TradeSkillUI.GetRecipesTracked, TradeSkillUIDocumentation.lua).
function QT.Recipes()
  local out, loading = {}, false
  for _, id in ipairs(ns.PlainTable(ns.CallIf(C_TradeSkillUI, "GetRecipesTracked", false)) or {}) do
    local r, waiting = QT.Recipe(ns.PlainNumber(id))
    loading = loading or waiting == true
    if r then out[#out + 1] = r end
  end
  QT.waitingItems = loading
  return out
end

-- Adds a heading (none without a name) and the rows under it (nothing when there are none, so the tracker looks as it did).
local function addSection(rows, name, list)
  if #list == 0 then return end
  if name then rows[#rows + 1] = { section = name } end
  for _, r in ipairs(list) do rows[#rows + 1] = r end
end

-- Blocks a client adds around the watched quests, in order (Modules/RetailQuests.lua on Retail; none on WoW
-- Forever). Each is fn(quests, taken) giving its rows, headings included, and setting taken[id] for each watched
-- quest it draws itself (a campaign quest under its campaign), so the plain list leaves that quest out.
QT.BLOCKS = { above = {}, afterQuests = {}, afterChallenges = {}, last = {} }

-- Appends every block's rows.
local function addBlocks(rows, blocks, quests, taken)
  for _, block in ipairs(blocks) do
    for _, r in ipairs(block(quests, taken)) do rows[#rows + 1] = r end
  end
end

-- The watched quests no block took: under a "Quests" heading when blocks above them drew rows, else as they are.
local function addQuests(rows, quests, taken)
  local rest = {}
  for _, q in ipairs(quests) do
    if not taken[q.id] then rest[#rest + 1] = q end
  end
  addSection(rows, #rows > 0 and L["Quests"] or nil, rest)
end

-- The rows the tracker draws, in the game's tracker's order: the client's blocks above the quests, the watched
-- quests, the client's blocks that follow them, the tracked achievements (Legacy challenges on Forever), the
-- client's blocks that follow those, the tracked recipes, then the client's last blocks, each under its own heading.
function QT.Rows(quests)
  local rows, taken = {}, {}
  addBlocks(rows, QT.BLOCKS.above, quests, taken)
  addQuests(rows, quests, taken)
  addBlocks(rows, QT.BLOCKS.afterQuests, quests, taken)
  addSection(rows, QT.ACHIEVEMENT_HEADING, QT.Achievements())
  addBlocks(rows, QT.BLOCKS.afterChallenges, quests, taken)
  addSection(rows, L["Recipes"], QT.Recipes())
  addBlocks(rows, QT.BLOCKS.last, quests, taken)
  return rows
end

-- Actions --------------------------------------------------------------------------------------

-- Completes a ready auto-complete quest (one with nobody to hand in to), as the game's own tracker does on a
-- click (Blizzard_QuestObjectiveTracker.lua); true when it did. The game's tracker is hidden, so this is the way.
local function completeAuto(id)
  local q = QT.Quest(id)
  if not (q and q.autoComplete and q.ready) then return false end
  ns.CallIf(_G, "ShowQuestComplete", id)
  return true
end

-- A title was clicked: left opens the quest (Vanguard's quest log, else the game's map), Shift-left points
-- the arrow at it (Quest guidance, when it's on); right stops watching it. A finished auto-complete quest is
-- completed instead of opened.
function QT.OnTitle(id, button)
  if button == "RightButton" then return ns.CallIf(C_QuestLog, "RemoveQuestWatch", id) end
  local guide = ns.QuestGuide
  if IsShiftKeyDown() and guide.settings then return guide.Point(id) end
  if completeAuto(id) then return end
  local log = ns.GetModule("QuestLog")
  if log and log.Open and log.frame then return log.Open(id) end
  if ns.WindowWaitsForCombat(L["The world map"]) then return end
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
  if not ns.PlainTable(ns.CallIf(C_TradeSkillUI, "GetRecipesTracked", false)) then return end
  ns.On("TRACKED_RECIPE_UPDATE", refreshSoon)
  ns.On("BAG_UPDATE_DELAYED", refreshSoon)
  ns.On("GET_ITEM_INFO_RECEIVED", itemArrived)
end

-- Builds the tracker (in its spot), parks the game's under a hidden frame, as the unit frames park theirs (hidden
-- in place, the game showing it in a fight made Vanguard's hide lay out the game's right-side column, boss frames
-- and all, from addon code), and follows the quest log.
local function build()
  QT.Build(ns.MoverFrame("questtracker"))
  ns.GetModule("UnitFrames").HideBlizzard("ObjectiveTrackerFrame")
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
  ns.On("ZONE_CHANGED_NEW_AREA", QT.SortWatches)
  ns.On("ZONE_CHANGED", QT.SortOnMapChange)
  ns.On("BAG_UPDATE_COOLDOWN", QT.UpdateCooldowns)
  T.OnChanged(QT.Redraw)
end
