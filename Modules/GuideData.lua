-- The levelling guide's client reads. Phase LG-0 holds only the probe behind `/vg guide probe`:
-- chat only, no settings and no player-facing change. It reports which quest, map, taxi and unit
-- reads this client has and what each returns (a number, a flag, "hidden" for a secret), so the
-- guide is built only on reads the client proves. Later phases read the client through this
-- file; the probe is the one diagnostic that may call a read directly.
--
-- Rules: a name is read through _G, never called when absent, and called once, in a pcall. A value
-- is printed only when it is a plain number or flag; a secret prints "hidden" and is never
-- concatenated, formatted or compared. QUEST_ACCEPTED and QUEST_TURNED_IN record only the types
-- of their first arguments, never the values.

local ADDON, ns = ...

local GD = {}
ns.GuideData = GD

-- The reads probed, and what each is called with: "quest" is the first quest in the log, "map" the
-- map the player is on, "player" the unit. `/vg probe` also asks with "selected" (the quest picked in
-- the log) and "done" (a quest this character has turned in).
GD.PROBES = {
  { "C_QuestLog.GetDistanceSqToQuest", "quest" },
  { "C_QuestLog.IsQuestFlaggedCompleted", "quest" },
  { "C_QuestLog.GetQuestDifficultyLevel", "quest" },
  { "C_QuestLog.GetMaxNumQuestsCanAccept" },
  { "C_QuestLog.GetTitleForQuestID", "quest" },
  { "C_QuestLog.GetQuestsOnMap", "map" },
  { "C_QuestLog.GetNextWaypoint", "quest" },
  { "C_QuestLog.GetNextWaypointForMap", "quest", "map" },
  { "C_Navigation.GetNextWaypointForMap", "map" },
  { "C_SuperTrack.GetNextWaypointForMap", "map" },
  { "C_Map.GetMapWorldSize", "map" },
  { "C_Minimap.GetViewRadius" },
  { "C_Map.GetMapLevels", "map" },
  { "C_Map.GetPlayerMapPosition", "map", "player" },
  { "C_Map.GetBestMapForUnit", "player" },
  { "C_TaxiMap.GetAllTaxiNodes", "map" },
  { "C_TaxiMap.GetTaxiNodesForMap", "map" },
  { "UnitOnTaxi", "player" },
  { "UnitIsDeadOrGhost", "player" },
  { "C_TooltipInfo.GetUnit", "target" },
  { "UnitLevel", "player" },
  { "GetPlayerFacing" },
  { "UnitPosition", "player" },
  { "IsInInstance" },
}

-- The events whose first arguments are recorded as they happen.
GD.EVENTS = { "QUEST_ACCEPTED", "QUEST_TURNED_IN" }

-- The type words recorded per event this session: { "number", "number" } for its first two arguments.
GD.seen = {}

-- The read named "A.b" or "b" if this client has it as a function, else nil.
function GD.Find(name)
  local space, key = name:match("^(.-)%.?([%w_]+)$")
  local holder = space == "" and _G or _G[space]
  local fn = type(holder) == "table" and holder[key]
  return type(fn) == "function" and fn or nil
end

-- The ids of the first quests in the log (headers skipped), up to limit.
function GD.LogQuests(limit)
  local get, ids = GD.Find("C_QuestLog.GetInfo"), {}
  local n = GD.Find("C_QuestLog.GetNumQuestLogEntries")
  for i = 1, n and ns.PlainNumber((n())) or 0 do
    local info = get and get(i)
    local id = type(info) == "table" and not info.isHeader and ns.PlainNumber(info.questID)
    if id then ids[#ids + 1] = id end
    if #ids >= limit then break end
  end
  return ids
end

-- The first quest in the log (its id), or nil.
local function firstQuest()
  return GD.LogQuests(1)[1]
end

-- The quest selected in the quest log, or nil when none is (the client gives 0).
local function selectedQuest()
  local get = GD.Find("C_QuestLog.GetSelectedQuest")
  local id = get and ns.PlainNumber(get())
  return id and id > 0 and id or nil
end

-- A quest this character has turned in: the first plain id the client lists, or nil.
local function doneQuest()
  local get = GD.Find("C_QuestLog.GetAllCompletedQuestIDs")
  local ids = get and get()
  return type(ids) == "table" and ns.PlainNumber(ids[1]) or nil
end

-- The map the player is on, if the client gives a plain one.
local function currentMap()
  local get = GD.Find("C_Map.GetBestMapForUnit")
  return get and ns.PlainNumber(get("player"))
end

-- "target" when you have one the client plainly says exists, else nil.
local function currentTarget()
  local exists = GD.Find("UnitExists")
  local has = exists and exists("target")
  if not ns.IsSecret(has) and has == true then return "target" end
end

-- What each argument word stands for.
GD.ARGS = {
  quest = firstQuest, selected = selectedQuest, done = doneQuest, map = currentMap,
  player = function() return "player" end, target = currentTarget,
}

-- The arguments a probe wants, or nil and the word that could not be had.
local function argsFor(words)
  local args = {}
  for i, word in ipairs(words) do
    args[i] = GD.ARGS[word]()
    if args[i] == nil then return nil, word end
  end
  return args
end

-- A map position's x and y, as "plain" or "hidden".
local function positionNote(v)
  local ok, x, y = pcall(v.GetXY, v)
  return "position " .. (ok and ns.PlainNumber(x) and ns.PlainNumber(y) and "plain" or "hidden")
end

-- What a value is, as chat text: plain numbers and flags in full, a secret as "hidden", anything
-- else by its kind (a table by its length or as a position).
function GD.Describe(v)
  if ns.IsSecret(v) then return "hidden" end
  local kind = type(v)
  if kind == "number" or kind == "boolean" then return kind .. " " .. tostring(v) end
  if kind ~= "table" then return kind end
  if type(v.GetXY) == "function" then return positionNote(v) end
  if type(v.lines) == "table" then return "tooltip data, " .. #v.lines .. " lines" end
  return "table of " .. #v
end

-- One probe's line: the name, then missing, not called (and why), the error, or the first return.
function GD.Line(probe)
  local fn = GD.Find(probe[1])
  if not fn then return probe[1] .. ": missing" end
  local args, word = argsFor({ unpack(probe, 2) })
  if not args then return probe[1] .. ": present, not called (no " .. word .. ")" end
  local ok, value = pcall(fn, unpack(args))
  if not ok then return probe[1] .. ": present, error " .. (type(value) == "string" and value:sub(1, 80) or "?") end
  return probe[1] .. ": present, " .. GD.Describe(value)
end

-- The type word of one event argument: a secret is named so, and the type() the client gives it.
local function typeWord(v)
  if ns.IsSecret(v) then return "secret (type " .. type(v) .. ")" end
  return type(v)
end

-- Records the argument types of a quest event.
local function record(event, first, second)
  GD.seen[event] = { typeWord(first), typeWord(second) }
end

-- Listens for the quest events; only their argument types are kept.
function GD.Listen()
  for _, event in ipairs(GD.EVENTS) do ns.On(event, record) end
end

-- The line for one recorded event.
local function eventLine(event)
  local seen = GD.seen[event]
  if not seen then return event .. ": not seen this session" end
  return event .. ": first arguments " .. seen[1] .. ", " .. seen[2]
end

-- /vg guide probe: prints a line per read and per event.
function GD.Probe()
  ns.Chat("Guide probe (chat only, nothing is changed); in combat: " .. tostring(ns.InCombat()))
  for _, probe in ipairs(GD.PROBES) do ns.Chat("  " .. GD.Line(probe)) end
  for _, event in ipairs(GD.EVENTS) do ns.Chat("  " .. eventLine(event)) end
end

-- /vg guide <what>: only "probe" so far.
function GD.Command(rest)
  if (rest or ""):lower():match("^%s*(%S*)") == "probe" then return GD.Probe() end
  ns.Chat("Usage: /vg guide probe  (what this client returns for the reads the levelling guide would use)")
end

GD.Listen()
