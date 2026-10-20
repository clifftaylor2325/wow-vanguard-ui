-- Quest guidance from the client's own data (never a community quest
-- database): a "New" mark on quests new in WoW Forever, quest-start pins on
-- the world map (Modules/QuestGuideMap.lua), and the arrow pointed at a
-- tracked quest's next step (Shift-click its title in the tracker).
--
-- The "New" mark needs a flag the client exposes. None is known yet, so it is
-- looked for at runtime, once: a quest classification or a quest tag whose
-- name says Forever or New. Without one nothing is marked; the pins and the
-- arrow work regardless. /vg questdata prints what the client says about
-- quests, to find the flag in game.

local ADDON, ns = ...

local T = ns.Theme

local QG = ns.Module("QuestGuide", { defaults = { newMark = true, pins = true, arrow = "quest", stepLine = true } })
ns.QuestGuide = QG

ns.Options.MODULE_INFO.QuestGuide = { "Quest guidance", "A New mark on quests new in WoW Forever (when the client flags them), quest-start pins on the world map, and the arrow on a tracked quest's next step." }

-- The names a new-quest flag would have in the client's enums (lower-case patterns).
QG.FLAG_NAMES = { "forever", "^new" }

-- The new-quest flag ------------------------------------------------------------------------------

-- The first key of an enum whose lower-cased name matches a flag name, and its value.
local function flagIn(enum)
  if type(enum) ~= "table" then return nil end
  for key, value in pairs(enum) do
    for _, pattern in ipairs(QG.FLAG_NAMES) do
      if type(key) == "string" and key:lower():find(pattern) then return key, value end
    end
  end
end

-- The client's new-quest flag: { source, name, value }, or false when it has none. Asked once.
function QG.Flag()
  if QG.flag ~= nil then return QG.flag end
  local e = type(Enum) == "table" and Enum or {}
  local name, value = flagIn(e.QuestClassification)
  if name then QG.flag = { source = "classification", name = name, value = value } return QG.flag end
  name, value = flagIn(e.QuestTag)
  QG.flag = name and { source = "tag", name = name, value = value } or false
  return QG.flag
end

-- What the client says about a quest for the flag's source: its classification or its tag ID (a hidden value counts as none).
local function flagValue(source, questID)
  local v
  if source == "classification" then v = ns.CallIf(C_QuestInfoSystem, "GetQuestClassification", questID) end
  if source == "tag" then v = (ns.CallIf(C_QuestLog, "GetQuestTagInfo", questID) or {}).tagID end
  return not ns.IsSecret(v) and v or nil
end

-- Whether a quest is new in WoW Forever: only when the client has the flag and says so.
function QG.IsNew(questID)
  local flag = QG.Flag()
  if not flag or type(questID) ~= "number" then return false end
  return flagValue(flag.source, questID) == flag.value
end

-- "  New" in the accent after a quest's title, or "" (not new, mark off, or the module off).
function QG.Mark(questID)
  if not (QG.settings and QG.settings.newMark) or not QG.IsNew(questID) then return "" end
  return "  " .. T.Paint("New", "accent")
end

-- The arrow --------------------------------------------------------------------------------------

-- The quest's next step as map, x, y: its next waypoint, else its spot on the map you're on; nil when the client won't say.
function QG.Target(questID)
  local mapID, x, y = ns.CallIf(C_QuestLog, "GetNextWaypoint", questID)
  if ns.PlainNumber(mapID) and ns.PlainNumber(x) and ns.PlainNumber(y) then return mapID, x, y end
  local here = ns.PlainNumber(ns.CallIf(C_Map, "GetBestMapForUnit", "player"))
  for _, q in ipairs(here and ns.CallIf(C_QuestLog, "GetQuestsOnMap", here) or {}) do
    if q.questID == questID and ns.PlainNumber(q.x) and ns.PlainNumber(q.y) then return here, q.x, q.y end
  end
end

-- Points the game's own quest arrow at the quest (it follows the quest's steps); false when the client can't.
local function questArrow(questID)
  if type(C_SuperTrack) ~= "table" or type(C_SuperTrack.SetSuperTrackedQuestID) ~= "function" then return false end
  C_SuperTrack.SetSuperTrackedQuestID(questID)
  return true
end

-- Puts a map waypoint on the quest's next step (the arrow points at it, as /way's does); false when there is none.
local function waypointArrow(questID)
  local mapID, x, y = QG.Target(questID)
  return mapID ~= nil and ns.GetModule("Waypoints").Set(mapID, x, y)
end

-- The quest's title for chat, or "that quest".
local function titleOf(questID)
  local title = ns.CallIf(C_QuestLog, "GetTitleForQuestID", questID)
  return (not ns.IsSecret(title) and type(title) == "string") and title or "that quest"
end

-- Shift-click on a tracked quest: the arrow points at its next step, the game's quest arrow or a
-- map waypoint as the Arrow setting says (the other when that one can't); chat says which.
function QG.Point(questID)
  QG.pointed = questID
  local first, second = questArrow, waypointArrow
  if QG.settings.arrow == "waypoint" then first, second = waypointArrow, questArrow end
  if first(questID) or second(questID) then
    ns.Chat("Arrow: " .. titleOf(questID) .. ".")
  else
    ns.Chat("The game can't point the arrow at " .. titleOf(questID) .. " from here.")
  end
  QG.StepsChanged()
end

-- Lets the pin go (the arrow's Pin button), and the game's tracked quest with it, else the arrow would hold on to
-- that one (0 is how the game's own tracker stops tracking, Blizzard_QuestObjectiveTracker.lua). A map waypoint,
-- your /way or Ctrl-click, is the game's other kind of tracking and is left alone.
function QG.Unpin()
  QG.pointed = nil
  local id = ns.PlainNumber(ns.CallIf(C_SuperTrack, "GetSuperTrackedQuestID"))
  if id and id > 0 then ns.CallIf(C_SuperTrack, "SetSuperTrackedQuestID", 0) end
  QG.StepsChanged()
end

-- The quest the arrow follows: the game's super-tracked quest, else the one last pointed at.
function QG.Followed()
  local id = ns.PlainNumber(ns.CallIf(C_SuperTrack, "GetSuperTrackedQuestID"))
  return (id and id > 0) and id or QG.pointed
end

-- The tracker line for the followed quest's next step ("> Take the boat to Menethil"), or nil.
function QG.StepLine(questID)
  if not (QG.settings and QG.settings.stepLine) or questID ~= QG.Followed() then return nil end
  local text = ns.CallIf(C_QuestLog, "GetNextWaypointText", questID)
  if ns.IsSecret(text) or type(text) ~= "string" or text == "" then return nil end
  return { "> " .. text, "accent" }
end

-- The steps or the followed quest changed: the tracker redraws, if it shows.
function QG.StepsChanged()
  ns.GetModule("QuestTracker").Redraw()
end

-- /vg questdata --------------------------------------------------------------------------------

-- A value for the dump: "hidden" for one the client hides, else as text.
local function shown(v)
  if ns.IsSecret(v) then return "hidden" end
  return tostring(v)
end

-- "name=value" for each of a table's plain fields, sorted by name.
local function fields(t)
  local out = {}
  for k, v in pairs(type(t) == "table" and t or {}) do
    if ns.IsSecret(v) or (type(v) ~= "table" and type(v) ~= "function") then out[#out + 1] = tostring(k) .. "=" .. shown(v) end
  end
  table.sort(out)
  return #out > 0 and table.concat(out, " ") or "none"
end

-- One quest as the client describes it: its classification, its tag, and its quest log fields (when it's in the log).
function QG.Describe(questID)
  local index = ns.PlainNumber(ns.CallIf(C_QuestLog, "GetLogIndexForQuestID", questID))
  local info = index and ns.CallIf(C_QuestLog, "GetInfo", index)
  local class = ns.CallIf(C_QuestInfoSystem, "GetQuestClassification", questID)
  return string.format("Quest %d: classification %s; tag %s; log %s", questID, shown(class), fields(ns.CallIf(C_QuestLog, "GetQuestTagInfo", questID)), fields(info))
end

-- The quests the open NPC offers, each with the NPC's own fields first.
local function dumpOffered()
  for _, q in ipairs(ns.CallIf(C_GossipInfo, "GetAvailableQuests") or {}) do
    ns.Chat("Offered: " .. fields(q))
    if ns.PlainNumber(q.questID) then ns.Chat(QG.Describe(q.questID)) end
  end
end

-- The quest ID a /vg questdata argument names: a shift-clicked quest link's (its colour code has digits
-- of its own), else a number typed first.
local function questArg(rest)
  rest = rest or ""
  return tonumber(rest:match("quest:(%d+)") or rest:match("^%s*(%d+)"))
end

-- /vg questdata [questID]: the new-quest flag this client has (or none), then one quest, or the
-- quests the open NPC offers and those you track: what the in-game check reads to find the flag.
function QG.Command(rest)
  local flag, id = QG.Flag(), questArg(rest)
  ns.Chat(flag and ("New-quest flag: " .. flag.source .. " " .. flag.name .. ".") or "New-quest flag: none on this client (no quest classification or tag named Forever or New).")
  if id then return ns.Chat(QG.Describe(id)) end
  dumpOffered()
  for _, watched in ipairs(ns.GetModule("QuestTracker").Watched()) do ns.Chat(QG.Describe(watched)) end
end

-- Options ----------------------------------------------------------------------------------------

-- get/set for one of the module's settings (also while it is off), after() running on each change, and the default.
local function setting(key, after)
  return function() return ns.Settings("QuestGuide", QG.defaults)[key] end,
    function(v) ns.Settings("QuestGuide", QG.defaults)[key] = v if QG.settings then after() end end, QG.defaults[key]
end

-- The guidance rows on the Quests page's "Finding your way" card (Core/OptionsQuests.lua places them). "Arrow"
-- there is Vanguard's panel only; the game's own is its quest marker.
function QG.Rows()
  return {
    { "cycle", "Shift-click points", { { "quest", "The game's quest marker" }, { "waypoint", "A map waypoint" } }, setting("arrow", function() end) },
    { "check", "The followed quest's next step in the tracker", setting("stepLine", QG.StepsChanged) },
    { "check", "Quest-start pins on the world map", setting("pins", function() QG.MapChanged() end) },
    { "check", "New mark on quests new in WoW Forever (when the client flags them)", setting("newMark", QG.StepsChanged) },
  }
end

-- Module entry point (Core/Modules.lua): the map pins, and the tracker following the arrow (redrawn
-- now: it was built at login before this module, so without its marks).
function QG.Enable(settings)
  QG.settings = settings
  for _, event in ipairs({ "SUPER_TRACKING_CHANGED", "WAYPOINT_UPDATE" }) do ns.On(event, QG.StepsChanged) end
  QG.EnableMap()
  QG.StepsChanged()
end
