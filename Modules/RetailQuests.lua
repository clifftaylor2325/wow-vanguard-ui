-- Retail's own quest tracker blocks (WoW Retail only: the TOC keeps this file off WoW Forever), added to
-- Vanguard's tracker (Modules/QuestTracker.lua, QT.BLOCKS) where the game's own tracker shows them:
--   * above the watched quests: the scenario you are in (a delve, a scenario, later Mythic+) under its name (a
--     kind of scenario may add to it: RQ.HEADINGS), with its stage, criteria and spells; then the watched campaign
--     quests under their campaign's name and chapter;
--   * after the watched quests: the appearances and decor you track (Collections);
--   * after the achievements: the Traveler's Log activities you track, then the Housing Endeavor tasks you track;
--   * last, after the recipes: the bonus objectives of your area, then world quests (those in your area, then
--     those you watch).
-- Each block reads the client's calls from Blizzard's live API docs (wow-ui-source, live branch); the task list
-- comes from GetTasksTable and GetTaskInfo, which the game's own tracker reads and the docs leave out. Every
-- value goes through the plain-value helpers: a scenario's counts can be hidden in an instance.

local ADDON, ns = ...
local L = ns.L

local QT = ns.GetModule("QuestTracker")
local RQ = {}
ns.RetailQuests = RQ

-- The events the game's own tracker follows for these blocks (Blizzard_ObjectiveTracker on Retail), each one
-- a redraw of Vanguard's tracker. SUPER_TRACKING_CHANGED is the game tracker's own: a quest tracked on the world
-- map moves the followed quest's accent line, and Forever's QuestGuide (not loaded on Retail) covers that there.
RQ.EVENTS = { "SCENARIO_UPDATE", "SCENARIO_CRITERIA_UPDATE", "SCENARIO_COMPLETED", "TASK_PROGRESS_UPDATE",
  "QUEST_WATCH_UPDATE", "PERKS_ACTIVITY_COMPLETED", "PERKS_ACTIVITIES_TRACKED_UPDATED", "PERKS_ACTIVITIES_TRACKED_LIST_CHANGED",
  "INITIATIVE_TASKS_TRACKED_UPDATED", "INITIATIVE_TASKS_TRACKED_LIST_CHANGED", "NEIGHBORHOOD_INITIATIVE_UPDATED",
  "TRACKING_TARGET_INFO_UPDATE", "TRACKABLE_INFO_UPDATE", "SCENARIO_SPELL_UPDATE", "SUPER_TRACKING_CHANGED" }

-- A heading and its rows, or no rows at all when there are none (a heading never shows alone).
local function section(name, rows)
  if #rows == 0 then return rows end
  table.insert(rows, 1, { section = name })
  return rows
end

-- Scenario -------------------------------------------------------------------------------------

-- An objective drawn as a bar in the game's tracker, as a line: "Enemy forces 45%".
local function percentLine(text, percent, done)
  return { text = ns.Format(L["{objective} {percent}%"], { objective = text, percent = math.floor(percent) }), done = done }
end

-- A weighted criterion's line ("Enemy forces 45%", its quantity being the percent), or nil when it isn't one or its
-- percent is hidden.
local function weightedLine(c, text)
  local percent = ns.IsTrue(c.isWeightedProgress) and ns.PlainNumber(c.quantity)
  return percent and percentLine(text, percent, ns.IsTrue(c.completed)) or nil
end

-- A scenario criterion as an objective: "2/5 Cultists slain", a weighted one as its percent ("Enemy forces 45%"),
-- or the game's own text for a formatted line, done once completed. nil while the client hides its text.
function RQ.Criterion(c)
  local text = ns.PlainText(c.description)
  if not text then return nil end
  local weighted = weightedLine(c, text)
  if weighted then return weighted end
  local have, need = ns.PlainNumber(c.quantity), ns.PlainNumber(c.totalQuantity)
  local counted = have and need and not (ns.IsTrue(c.isWeightedProgress) or ns.IsTrue(c.isFormatted))
  if counted then text = ns.Format(L["{have}/{need} {objective}"], { have = have, need = need, objective = text }) end
  return { text = text, done = ns.IsTrue(c.completed) }
end

-- The countdown line under a timed criterion ("Time left 2:41"), as the game's tracker draws a timer bar for one
-- while it runs; nil for an untimed or run-out criterion, or one whose timing the client hides. The line carries
-- timed = true, which keeps the tracker redrawing each second.
local function criterionTimer(c)
  local total, gone = ns.PlainNumber(c.duration), ns.PlainNumber(c.elapsed)
  if not (total and gone and total > 0 and gone <= total) then return nil end
  return { text = ns.Format(L["Time left {time}"], { time = QT.Clock(total - gone) }), done = false, timed = true }
end

-- The stage's criteria as objectives, in the game's order, a timed one with its countdown under it.
local function criteria(count)
  local out = {}
  for i = 1, count do
    local c = ns.PlainTable(ns.CallIf(C_ScenarioInfo, "GetCriteriaInfo", i))
    local line = c and RQ.Criterion(c)
    if line then out[#out + 1], out[#out + 2] = line, criterionTimer(c) end
  end
  return out
end

-- What a kind of scenario adds under its stage's criteria: each fn(step) gives a list of objectives (Modules/
-- RetailDelves.lua adds a delve's counters, affixes and reward chest). Empty for any other kind.
RQ.EXTRAS = {}

-- The stage's criteria as objectives, or its description with the stage's percent when the game draws the stage as
-- one bar.
local function stageCriteria(step)
  local percent, text = ns.PlainNumber(step.weightedProgress), ns.PlainText(step.description)
  if percent and text then return { percentLine(text, percent, false) } end
  return criteria(ns.PlainNumber(step.numCriteria) or 0)
end

-- The stage's objectives: its criteria, then what each of RQ.EXTRAS adds for this step.
local function stageObjectives(step)
  local out = stageCriteria(step)
  for _, extra in ipairs(RQ.EXTRAS) do
    for _, line in ipairs(extra(step)) do out[#out + 1] = line end
  end
  return out
end

-- The stage's row: "Stage 2/3: The Crypt" (the stage's title alone in a scenario of one stage) and its objectives.
function RQ.Stage(step, stage, stages)
  local title = ns.PlainText(step.title) or L["Scenario"]
  if stages > 1 then title = ns.Format(L["Stage {stage}/{stages}: {title}"], { stage = stage, stages = stages, title = title }) end
  return { title = title, objectives = stageObjectives(step), kind = "scenario" }
end

-- What a kind of scenario makes of its heading: each fn(name) gives the heading for a scenario of its kind, or nil
-- for any other (Modules/RetailDelves.lua adds a delve's tier). The first that answers wins.
RQ.HEADINGS = {}

-- The scenario's heading: its name (Scenario while the client hides it), as the first of RQ.HEADINGS to answer has it.
local function scenarioHeading(info)
  local name = ns.PlainText(info.name) or L["Scenario"]
  for _, heading in ipairs(RQ.HEADINGS) do
    local text = heading(name)
    if text then return text end
  end
  return name
end

-- A stage spell's row: its name, with a button beside it that casts the spell (QT.PlaceItems gives a row with an
-- item a button; item.spell makes it a spell's). Its id is the spell's negated, so it never meets a quest's. nil
-- while the client hides the spell's id or name.
local function spellRow(entry)
  local id = ns.PlainTable(entry) and ns.PlainNumber(entry.spellID)
  local name = id and ns.PlainText(ns.CallIf(C_Spell, "GetSpellName", id))
  if not name then return nil end
  local texture = ns.CallIf(C_Spell, "GetSpellTexture", id)
  return { id = -id, title = name, objectives = {}, kind = "scenario", item = { spell = id, texture = texture } }
end

-- The stage's spells as rows, one per spell, as the game's tracker puts a spell button under the criteria; none
-- while the stage is drawn as one bar (the game adds none then) or the list is hidden.
local function spellRows(step)
  local rows, oneBar = {}, ns.IsSecret(step.weightedProgress) or step.weightedProgress ~= nil
  if oneBar then return rows end
  for _, entry in ipairs(ns.PlainTable(step.spells) or {}) do rows[#rows + 1] = spellRow(entry) end
  return rows
end

-- The scenario you are in, under its heading, with the stage's spells under the stage: none outside one (no
-- stages), once its last stage is done, or while the client hides where you are in it.
local function scenarioRows()
  local info = ns.PlainTable(ns.CallIf(C_ScenarioInfo, "GetScenarioInfo"))
  local stage, stages = info and ns.PlainNumber(info.currentStage), info and ns.PlainNumber(info.numStages)
  if not (stage and stages and stages > 0 and stage <= stages) then return {} end
  local step = ns.PlainTable(ns.CallIf(C_ScenarioInfo, "GetScenarioStepInfo")) or {}
  local rows = { RQ.Stage(step, stage, stages) }
  for _, row in ipairs(spellRows(step)) do rows[#rows + 1] = row end
  return section(scenarioHeading(info), rows)
end

-- Whether a row in the rows has a countdown line.
local function hasTimer(rows)
  for _, row in ipairs(rows) do
    for _, line in ipairs(row.objectives or {}) do
      if line.timed then return true end
    end
  end
  return false
end

-- Redraws the tracker once a second while the block's rows hold a countdown line, and stops when they hold none.
-- Whatever draws in the scenario block's place (Modules/RetailMythicPlus.lua's key block) passes its rows too, so
-- a countdown started before it never keeps ticking under it.
function RQ.TimeScenario(rows)
  ns.Every("scenario timer", hasTimer(rows) and QT.TICK_EVERY or nil, QT.Refresh, QT.frame)
end

-- The scenario block, redrawn once a second while one of its criteria counts down (and stopped when none does).
function RQ.Scenario()
  local rows = scenarioRows()
  RQ.TimeScenario(rows)
  return rows
end

-- Campaigns ------------------------------------------------------------------------------------

-- The name of the chapter a campaign is on, or nil when the game names none.
local function chapterName(campaign)
  local chapter = ns.PlainNumber(ns.CallIf(C_CampaignInfo, "GetCurrentChapterID", campaign))
  local info = chapter and ns.PlainTable(ns.CallIf(C_CampaignInfo, "GetCampaignChapterInfo", chapter))
  return info and ns.PlainText(info.name)
end

-- A campaign's heading: its name and the chapter you are on ("The War Within: Ascent"), or its name alone.
function RQ.CampaignName(campaign)
  local info = ns.PlainTable(ns.CallIf(C_CampaignInfo, "GetCampaignInfo", campaign))
  local name, chapter = info and ns.PlainText(info.name) or L["Campaign"], chapterName(campaign)
  return chapter and ns.Format(L["{campaign}: {chapter}"], { campaign = name, chapter = chapter }) or name
end

-- The campaign a quest belongs to, or nil for any other quest.
local function campaignOf(id)
  if not ns.IsTrue(ns.CallIf(C_CampaignInfo, "IsCampaignQuest", id)) then return nil end
  return ns.PlainNumber(ns.CallIf(C_CampaignInfo, "GetCampaignID", id))
end

-- The watched campaign quests by campaign, and the campaigns in the order the watch list first meets each.
local function byCampaign(quests, taken)
  local groups, order = {}, {}
  for _, q in ipairs(quests) do
    local campaign = campaignOf(q.id)
    if campaign and not groups[campaign] then groups[campaign], order[#order + 1] = {}, campaign end
    if campaign then table.insert(groups[campaign], q) taken[q.id] = true end
  end
  return groups, order
end

-- The watched campaign quests under their campaign's heading, taken out of the plain quest list.
function RQ.Campaigns(quests, taken)
  local rows, groups, order = {}, byCampaign(quests, taken)
  for _, campaign in ipairs(order) do
    rows[#rows + 1] = { section = RQ.CampaignName(campaign) }
    for _, q in ipairs(groups[campaign]) do rows[#rows + 1] = q end
  end
  return rows
end

-- World quests and bonus objectives -----------------------------------------------------------

-- The world quests you watch, in the game's order.
function RQ.WatchedWorldQuests()
  local out = {}
  for i = 1, ns.PlainNumber(ns.CallIf(C_QuestLog, "GetNumWorldQuestWatches")) or 0 do
    local id = ns.PlainNumber(ns.CallIf(C_QuestLog, "GetQuestIDForWorldQuestWatchIndex", i))
    if id then out[#out + 1] = id end
  end
  return out
end

-- Every quest you watch, plain and world, as a set: the area's lists leave these out, as the game's tracker does.
local function watchedSet()
  local set = {}
  for _, id in ipairs(QT.Watched()) do set[id] = true end
  for _, id in ipairs(RQ.WatchedWorldQuests()) do set[id] = true end
  return set
end

-- Whether a task is in your area, with objectives (GetTaskInfo's first and third values), and its own name.
local function taskHere(id)
  local here, _, count, name = ns.CallIf(_G, "GetTaskInfo", id)
  return ns.IsTrue(here) and (ns.PlainNumber(count) or 0) > 0, ns.PlainText(name)
end

-- The tasks of the area you are in that you don't watch (world quests when world is true, else bonus
-- objectives), each as { id, name }, as the game's tracker finds them.
local function areaTasks(world)
  local out, watched = {}, watchedSet()
  for _, id in ipairs(ns.PlainTable(ns.CallIf(_G, "GetTasksTable")) or {}) do
    local here, name = taskHere(id)
    local kind = ns.IsTrue(ns.CallIf(C_QuestLog, "IsWorldQuest", id)) == world
    if kind and here and not watched[id] then out[#out + 1] = { id, name } end
  end
  return out
end

-- The world quests you watch, those in your area first (as the game's tracker sorts them), else in watch order.
local function watchedByArea()
  local near, far = {}, {}
  for _, id in ipairs(RQ.WatchedWorldQuests()) do
    local here = taskHere(id)
    table.insert(here and near or far, id)
  end
  for _, id in ipairs(far) do near[#near + 1] = id end
  return near
end

-- A task's row: its title (the task's own name, else the quest's), objectives, ready state and usable item (as the
-- game's tracker gives one); nil without a title.
function RQ.TaskRow(id, name, kind)
  local title = name or ns.PlainText((ns.CallIf(C_TaskQuest, "GetQuestInfoByQuestID", id)))
  if not title then return nil end
  local ready = QT.IsReady(id)
  return { id = id, title = title, objectives = QT.Objectives(id), ready = ready, kind = kind, item = QT.QuestItem(QT.LogIndex(id), ready) }
end

-- World quests: those in your area you don't watch ("areaWorld": nothing to stop watching), then those you
-- watch ("world"), under one heading.
function RQ.WorldQuests()
  local rows = {}
  for _, task in ipairs(areaTasks(true)) do rows[#rows + 1] = RQ.TaskRow(task[1], task[2], "areaWorld") end
  for _, id in ipairs(watchedByArea()) do rows[#rows + 1] = RQ.TaskRow(id, nil, "world") end
  return section(L["World quests"], rows)
end

-- The bonus objectives of the area you are in, under their heading.
function RQ.BonusObjectives()
  local rows = {}
  for _, task in ipairs(areaTasks(false)) do rows[#rows + 1] = RQ.TaskRow(task[1], task[2], "bonus") end
  return section(L["Bonus objectives"], rows)
end

-- Traveler's Log --------------------------------------------------------------------------------

-- What an activity still asks, as objectives ("2/5 Dungeons", the game's spaced slash closed up as its tracker does).
local function requirements(info)
  local out = {}
  for _, r in ipairs(ns.PlainTable(info.requirementsList) or {}) do
    local text = ns.PlainTable(r) and not ns.IsTrue(r.completed) and ns.PlainText(r.requirementText)
    if text then out[#out + 1] = { text = (text:gsub(" / ", "/")), done = false } end
  end
  return out
end

-- An activity's row, or nil once it is done (the game's tracker drops it then) or while its id or name is hidden.
local function activityRow(id)
  local info = id and ns.PlainTable(ns.CallIf(C_PerksActivities, "GetPerksActivityInfo", id))
  local name = info and not ns.IsTrue(info.completed) and ns.PlainText(info.activityName)
  return name and { id = id, title = name, objectives = requirements(info), kind = "activity" } or nil
end

-- The Traveler's Log activities you track and haven't finished, under its heading.
function RQ.Activities()
  local rows, tracked = {}, ns.PlainTable(ns.CallIf(C_PerksActivities, "GetTrackedPerksActivities"))
  for _, id in ipairs(tracked and ns.PlainTable(tracked.trackedIDs) or {}) do
    local row = activityRow(ns.PlainNumber(id))
    if row then rows[#rows + 1] = row end
  end
  return section(L["Traveler's Log"], rows)
end

-- Housing Endeavors -----------------------------------------------------------------------------

-- A tracked Endeavor task's row, or nil once it is done or while its info or name is hidden.
local function endeavorRow(id)
  local info = id and ns.PlainTable(ns.CallIf(C_NeighborhoodInitiative, "GetInitiativeTaskInfo", id))
  local name = info and not ns.IsTrue(info.completed) and ns.PlainText(info.taskName)
  return name and { id = id, title = name, objectives = requirements(info), kind = "endeavor" } or nil
end

-- The Housing Endeavor tasks you track and haven't finished, under their heading.
function RQ.Endeavors()
  local rows, tracked = {}, ns.PlainTable(ns.CallIf(C_NeighborhoodInitiative, "GetTrackedInitiativeTasks"))
  for _, id in ipairs(tracked and ns.PlainTable(tracked.trackedIDs) or {}) do
    local row = endeavorRow(ns.PlainNumber(id))
    if row then rows[#rows + 1] = row end
  end
  return section(L["Endeavors"], rows)
end

-- Collections -----------------------------------------------------------------------------------

-- A tracked appearance or decor piece's row (its title and where to get it), or nil while the game has no target
-- for it or the client hides its title. The type stays on the row: a click needs it.
local function collectableRow(kind, id)
  local targetType, targetID = ns.CallIf(C_ContentTracking, "GetCurrentTrackingTarget", kind, id)
  local title = targetType and ns.PlainText(ns.CallIf(C_ContentTracking, "GetTitle", kind, id))
  if not title then return nil end
  local text = ns.PlainText(ns.CallIf(C_ContentTracking, "GetObjectiveText", targetType, targetID, false))
  return { id = id, trackableType = kind, title = title, objectives = text and { { text = text, done = false } } or {}, kind = "collectable" }
end

-- The collectables of one type that you track, as rows.
local function collectablesOf(kind)
  local out = {}
  for _, id in ipairs(ns.PlainTable(ns.CallIf(C_ContentTracking, "GetTrackedIDs", kind)) or {}) do
    local row = ns.PlainNumber(id) and collectableRow(kind, id)
    if row then out[#out + 1] = row end
  end
  return out
end

-- The appearances and decor you track, under their heading, as the game's Adventure tracker lists them.
function RQ.Collectables()
  local rows = {}
  for _, kind in ipairs(ns.PlainTable(ns.CallIf(C_ContentTracking, "GetCollectableSourceTypes")) or {}) do
    if ns.PlainNumber(kind) then for _, row in ipairs(collectablesOf(kind)) do rows[#rows + 1] = row end end
  end
  return section(L["Collections"], rows)
end

-- Clicks ---------------------------------------------------------------------------------------

-- A world quest's title clicked: left opens the world map on its zone (after a fight, as other windows do),
-- right stops watching it (the game's own call; one in your area you don't watch has nothing to stop).
function RQ.OnWorldQuest(id, button)
  if button == "RightButton" then return ns.CallIf(C_QuestLog, "RemoveWorldQuestWatch", id) end
  if ns.WindowWaitsForCombat(L["The world map"]) then return end
  ns.CallIf(_G, "OpenWorldMap", ns.PlainNumber(ns.CallIf(C_TaskQuest, "GetQuestZoneID", id)))
end

-- A tracked activity's title right-clicked: it stops being tracked (the game's own call).
function RQ.OnActivity(id, button)
  if button == "RightButton" then ns.CallIf(C_PerksActivities, "RemoveTrackedPerksActivity", id) end
end

-- A tracked Endeavor task's title right-clicked: it stops being tracked (the game's own call).
function RQ.OnEndeavor(id, button)
  if button == "RightButton" then ns.CallIf(C_NeighborhoodInitiative, "RemoveTrackedInitiativeTask", id) end
end

-- A tracked appearance or decor piece right-clicked: tracking stops, as the game's tracker does it by hand.
function RQ.OnCollectable(id, button, row)
  if button ~= "RightButton" or not row then return end
  ns.CallIf(C_ContentTracking, "StopTracking", row.trackableType, id, Enum.ContentTrackingStopType.Manual)
end

QT.KIND_CLICKS.world, QT.KIND_CLICKS.areaWorld, QT.KIND_CLICKS.activity = RQ.OnWorldQuest, RQ.OnWorldQuest, RQ.OnActivity
QT.KIND_CLICKS.endeavor, QT.KIND_CLICKS.collectable = RQ.OnEndeavor, RQ.OnCollectable
QT.CLICKS.world = L["Click: show on the map · Right-click: stop watching"]
QT.CLICKS.areaWorld = L["Click: show on the map"]
QT.CLICKS.activity = L["Right-click: stop tracking"]
QT.CLICKS.endeavor, QT.CLICKS.collectable = QT.CLICKS.activity, QT.CLICKS.activity

-- The blocks, in the game's tracker's order (Blizzard_ObjectiveTrackerManager.lua): the scenario and campaigns above
-- the quests, the Collections after the quests, the Traveler's Log and Endeavors after the achievements, the bonus objectives and world quests last.
for _, block in ipairs({ RQ.Scenario, RQ.Campaigns }) do table.insert(QT.BLOCKS.above, block) end
table.insert(QT.BLOCKS.afterQuests, RQ.Collectables)
for _, block in ipairs({ RQ.Activities, RQ.Endeavors }) do table.insert(QT.BLOCKS.afterChallenges, block) end
for _, block in ipairs({ RQ.BonusObjectives, RQ.WorldQuests }) do table.insert(QT.BLOCKS.last, block) end
for _, event in ipairs(RQ.EVENTS) do table.insert(QT.EVENTS, event) end
-- A stage spell's button follows the spell's cooldown, as the game's tracker does.
table.insert(QT.COOLDOWN_EVENTS, "SPELL_UPDATE_COOLDOWN")
