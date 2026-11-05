-- TEST-ONLY Retail stubs, quests area (see wow-retail-core.lua for when these run). What Retail's quest tracker
-- reads beyond the shared quest log in wow-world.lua, each checked against Blizzard's live docs (wow-ui-source,
-- live branch, Blizzard_APIDocumentationGenerated) or, for the two undocumented task calls, against the game's
-- own tracker (Blizzard_ObjectiveTracker). A test sets the world's fields below and fires the event it needs.

local world = __wfgWorld
local stub = __wfgStub

-- world.timeAllowed[questID] = { total, gone, at }: a timed quest's whole time, the seconds gone when it was
-- set, and the clock then (world.setTimeAllowed).
world.timeAllowed = {}

-- QuestLogDocumentation.lua's GetTimeAllowed: totalTime and elapsedTime, both 0 for a quest without a timer.
function C_QuestLog.GetTimeAllowed(id)
  local t = world.timeAllowed[id]
  if not t then return 0, 0 end
  if issecretvalue(t.total) then return t.total, t.gone end
  return t.total, t.gone + (stub.now - t.at)
end

-- Gives a quest its timer (total seconds, seconds gone; a secret total for one the client hides) or clears it
-- (nil), then fires QUEST_LOG_UPDATE as the log does.
function world.setTimeAllowed(id, total, gone)
  world.timeAllowed[id] = total ~= nil and { total = total, gone = gone or 0, at = stub.now } or nil
  stub.fire("QUEST_LOG_UPDATE")
end

-- world.scenario: the scenario you are in, ScenarioInfoDocumentation.lua's ScenarioInformation (name,
-- currentStage, numStages) with step = its ScenarioStepInfo (title, numCriteria) and criteria = its
-- ScenarioCriteriaInfo list; nil outside one.
world.scenario = nil

-- An empty scenario, as the client answers outside one (numStages 0).
local NO_SCENARIO = { name = "", currentStage = 0, numStages = 0, flags = 0, isComplete = false, xp = 0, money = 0, type = 0, area = "", uiTextureKit = "", scenarioID = 0 }

C_ScenarioInfo = {
  -- The scenario you are in, or the empty one.
  GetScenarioInfo = function() return world.scenario or NO_SCENARIO end,
  -- The current stage's step.
  GetScenarioStepInfo = function() return (world.scenario or {}).step or { title = "", description = "", numCriteria = 0 } end,
  -- A criterion of the current stage, by index.
  GetCriteriaInfo = function(i) return ((world.scenario or {}).criteria or {})[i] end,
}

-- world.campaigns[campaignID] = { name, chapter = { id, name } }; world.campaignQuests[questID] = campaignID.
world.campaigns, world.campaignQuests = {}, {}

C_CampaignInfo = {
  -- WarCampaignDocumentation.lua: whether a quest is a campaign's, and which.
  IsCampaignQuest = function(id) return world.campaignQuests[id] ~= nil end,
  GetCampaignID = function(id) return world.campaignQuests[id] or 0 end,
  -- A campaign's CampaignInfo, nil for an unknown one.
  GetCampaignInfo = function(id) local c = world.campaigns[id] return c and { name = c.name, description = "", isWarCampaign = false } end,
  -- The chapter it is on, and that chapter's CampaignChapterInfo.
  GetCurrentChapterID = function(id) local c = world.campaigns[id] return c and c.chapter and c.chapter.id end,
  GetCampaignChapterInfo = function(chapterID)
    for _, c in pairs(world.campaigns) do if c.chapter and c.chapter.id == chapterID then return { name = c.chapter.name, description = "", rewardQuestID = 0 } end end
  end,
}

-- world.tasks: the area's tasks, in order, each { questID, title, name, inArea, world, zone, objectives, watched }
-- (world: a world quest, else a bonus objective; name: the task's own name, which GetTaskInfo gives; watched: on
-- the world quest watch list). A watched world quest elsewhere has inArea = false.
world.tasks = {}

-- The task with this quest id.
local function taskOf(id)
  for _, t in ipairs(world.tasks) do if t.questID == id then return t end end
end

-- The game's task list: the tasks of your area (the undocumented global its tracker reads).
function GetTasksTable()
  local out = {}
  for _, t in ipairs(world.tasks) do if t.inArea then out[#out + 1] = t.questID end end
  return out
end

-- isInArea, isOnMap, numObjectives, taskName, displayAsObjective (Blizzard_BonusObjectiveTracker.lua's reading).
function GetTaskInfo(id)
  local t = taskOf(id)
  if not t then return false, false, nil, nil, false end
  return t.inArea == true, true, #(t.objectives or {}), t.name, false
end

local logObjectives = C_QuestLog.GetQuestObjectives
-- A task's objectives come from the quest log's call, as a task quest's do in game.
function C_QuestLog.GetQuestObjectives(id)
  local t = taskOf(id)
  if t then return t.objectives or {} end
  return logObjectives(id)
end

-- QuestLogDocumentation.lua: whether a quest is a world quest, and the world quest watch list.
function C_QuestLog.IsWorldQuest(id) local t = taskOf(id) return t ~= nil and t.world == true end

-- The watched world quests, in order.
local function worldWatches()
  local out = {}
  for _, t in ipairs(world.tasks) do if t.watched then out[#out + 1] = t.questID end end
  return out
end
-- How many world quests are watched.
function C_QuestLog.GetNumWorldQuestWatches() return #worldWatches() end
-- The i-th watched world quest's id.
function C_QuestLog.GetQuestIDForWorldQuestWatchIndex(i) return worldWatches()[i] end
-- Stops watching a world quest, firing the watch list's event.
function C_QuestLog.RemoveWorldQuestWatch(id)
  local t = taskOf(id)
  if t then t.watched = nil stub.fire("QUEST_WATCH_LIST_CHANGED", id, false) end
end

C_TaskQuest = {
  -- QuestTaskInfoDocumentation.lua: questTitle, factionID, capped, displayAsObjective.
  GetQuestInfoByQuestID = function(id) local t = taskOf(id) if t then return t.title, nil, false, false end end,
  -- The zone a world quest is in.
  GetQuestZoneID = function(id) local t = taskOf(id) return t and t.zone end,
}

-- The world map opened on a zone (Blizzard_WorldMap.lua's OpenWorldMap), recorded.
function OpenWorldMap(mapID) world.openedMap = mapID or false end

-- world.activities[id] = PerksActivityInfo (activityName, completed, requirementsList = { { completed,
-- requirementText } }); world.trackedActivities = the tracked ids, in order.
world.activities, world.trackedActivities = {}, {}

C_PerksActivities = {
  -- PerksActivitiesDocumentation.lua: the tracked ids, one activity, and untracking it.
  GetTrackedPerksActivities = function() return { trackedIDs = world.trackedActivities } end,
  GetPerksActivityInfo = function(id) return world.activities[id] end,
  RemoveTrackedPerksActivity = function(id)
    for i, tracked in ipairs(world.trackedActivities) do if tracked == id then table.remove(world.trackedActivities, i) break end end
    stub.fire("PERKS_ACTIVITIES_TRACKED_LIST_CHANGED", id, false)
  end,
}

-- world.endeavors[id] = InitiativeTaskInfo (taskName, completed, requirementsList); world.trackedEndeavors = the
-- tracked ids, in order.
world.endeavors, world.trackedEndeavors = {}, {}

-- NeighborhoodInitiativeDocumentation.lua: the tracked ids (InitiativeTasksTracked.trackedIDs), one task, untracking it.
C_NeighborhoodInitiative = {
  -- The tracked ids.
  GetTrackedInitiativeTasks = function() return { trackedIDs = world.trackedEndeavors } end,
  GetInitiativeTaskInfo = function(id) return world.endeavors[id] end,
  RemoveTrackedInitiativeTask = function(id)
    for i, tracked in ipairs(world.trackedEndeavors) do if tracked == id then table.remove(world.trackedEndeavors, i) break end end
    stub.fire("INITIATIVE_TASKS_TRACKED_LIST_CHANGED", id, false)
  end,
}

-- ContentTrackingTypesDocumentation.lua's types and stop types.
Enum.ContentTrackingType = { Appearance = 0, Mount = 1, Achievement = 2, Decor = 3 }
Enum.ContentTrackingStopType = { Invalidated = 0, Collected = 1, Manual = 2 }

-- world.collectables[type] = { { id, title, target = { type, id } | nil, objective } } in tracking order; world.stopped
-- = the (type, id, stop type) of each StopTracking call.
world.collectables, world.stopped = {}, {}

-- The tracked entry of a type and id.
local function collectableOf(kind, id)
  for _, c in ipairs(world.collectables[kind] or {}) do if c.id == id then return c end end
end

-- ContentTrackingDocumentation.lua: the collectable types, a type's tracked ids, an entry's current target, its
-- title and its target's objective text, and stopping the tracking.
C_ContentTracking = {
  -- The collectable types.
  GetCollectableSourceTypes = function() return { Enum.ContentTrackingType.Appearance, Enum.ContentTrackingType.Decor } end,
  GetTrackedIDs = function(kind)
    local out = {}
    for i, c in ipairs(world.collectables[kind] or {}) do out[i] = c.id end
    return out
  end,
  GetCurrentTrackingTarget = function(kind, id) local c = collectableOf(kind, id) if c and c.target then return c.target[1], c.target[2] end end,
  GetTitle = function(kind, id) local c = collectableOf(kind, id) return c and c.title end,
  GetObjectiveText = function(targetType, targetID)
    for _, list in pairs(world.collectables) do
      for _, c in ipairs(list) do if c.target and c.target[1] == targetType and c.target[2] == targetID then return c.objective end end
    end
  end,
  StopTracking = function(kind, id, stopType)
    world.stopped[#world.stopped + 1] = { kind, id, stopType }
    for i, c in ipairs(world.collectables[kind] or {}) do if c.id == id then table.remove(world.collectables[kind], i) break end end
    stub.fire("CONTENT_TRACKING_UPDATE", kind, id, true)
  end,
}
