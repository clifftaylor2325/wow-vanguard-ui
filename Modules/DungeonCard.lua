-- The dungeon card: lines for the Instance prep card (off until "Dungeon card" is switched on):
--   * which dungeon you stand at, its size and difficulty, and its level range;
--   * your quests for it: from your own quest log (in a dungeon, the quests the
--     client puts on its map; anywhere else, the log's dungeon and raid quests),
--     lowest level first, "done" when turned in ready;
--   * the keys in your bags;
--   * when you last came here before this visit (kept per character and dungeon).
-- Everything comes from the client and your own log: no dungeon, quest or loot
-- database ships. Any value the client hides or lacks is left out, never
-- compared, and nothing is read in combat.

local ADDON, ns = ...

local DC = {}
ns.DungeonCard = DC

-- Quest lines shown before "and N more"; bags scanned (backpack, four bags, reagent bag); the item class of keys (Enum.ItemClass.Key).
DC.QUESTS, DC.LAST_BAG, DC.KEY_CLASS = 6, 5, 13
-- The quest tags (Enum.QuestTag names) that make a log quest a dungeon quest.
DC.TAGS = { "Dungeon", "Raid", "Group" }

-- Helpers ------------------------------------------------------------------------------------

-- Calls a client function by name; nil when this client doesn't have it.
local function ask(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  return fn(...)
end

-- Calls tbl[name] when the client has it; nil otherwise.
local function call(tbl, name, ...)
  if type(tbl) ~= "table" or type(tbl[name]) ~= "function" then return nil end
  return tbl[name](...)
end

-- The text if it's a plain, non-empty string; nil otherwise (hidden, missing, empty).
local function plainText(text)
  if ns.IsSecret(text) or type(text) ~= "string" or text == "" then return nil end
  return text
end

-- The dungeon ------------------------------------------------------------------------------

-- The map you stand on, or nil.
local function mapNow()
  return ns.PlainNumber(call(C_Map, "GetBestMapForUnit", "player"))
end

-- "levels 13-18" from the client's map levels, or nil when it gives none.
local function levelText(mapID)
  local low, high = call(C_Map, "GetMapLevels", mapID or 0)
  low, high = ns.PlainNumber(low), ns.PlainNumber(high)
  if not low or not high or low < 1 then return nil end
  return low == high and ("level " .. low) or string.format("levels %d-%d", low, high)
end

-- The heading at a dungeon's door: "Ragefire Chasm · levels 13-18 · 5-player Normal", or nil outside one (outside, the client answers with the zone's name and type "none").
function DC.Heading()
  local name, kind, _, difficulty, size = ask("GetInstanceInfo")
  if not plainText(name) or (kind ~= "party" and kind ~= "raid") then return nil end
  local parts = { name, levelText(mapNow()) }
  local group = ns.PlainNumber(size)
  if group and group > 0 then parts[#parts + 1] = string.format("%d-player%s", group, plainText(difficulty) and (" " .. difficulty) or "") end
  return table.concat(parts, " · ")
end

-- Last run -------------------------------------------------------------------------------------

-- Seconds in a day; a way back in within SAME_VISIT seconds (a reload, a quick run in) is the same visit.
DC.DAY, DC.SAME_VISIT = 86400, 3600

-- The dungeon you stand in by the client's instance ID, and the time now; nil for either the client lacks.
local function here()
  return ns.PlainNumber((select(8, ask("GetInstanceInfo")))), type(time) == "function" and time() or nil
end

-- This character's visits, { [instanceID] = { at = latest visit, prior = the one before } }.
local function visits()
  if type(VanguardCharDB) ~= "table" then return {} end
  VanguardCharDB.dungeonRuns = type(VanguardCharDB.dungeonRuns) == "table" and VanguardCharDB.dungeonRuns or {}
  return VanguardCharDB.dungeonRuns
end

-- Notes a visit to the dungeon you stand at: the latest visit becomes the prior one, unless this is the same visit.
function DC.Record()
  local id, now = here()
  if not id or not now or ns.InCombat() then return end
  local seen = visits()[id]
  if type(seen) == "table" and type(seen.at) == "number" and now - seen.at < DC.SAME_VISIT then return end
  visits()[id] = { at = now, prior = type(seen) == "table" and seen.at or nil }
end

-- "Last run: today", "yesterday" or "5 days ago" for the dungeon you stand at; nil when there was no earlier visit.
function DC.LastRun()
  local id, now = here()
  local seen = id and visits()[id]
  if not now or type(seen) ~= "table" or type(seen.prior) ~= "number" then return nil end
  local days = math.max(0, math.floor((now - seen.prior) / DC.DAY))
  return "Last run: " .. (days == 0 and "today" or days == 1 and "yesterday" or days .. " days ago")
end

-- Quests ---------------------------------------------------------------------------------------

-- The tag IDs (Enum.QuestTag) that mark a dungeon quest, as a set.
local function tagSet()
  local out, tags = {}, type(Enum) == "table" and Enum.QuestTag or {}
  for _, name in ipairs(DC.TAGS) do
    if type(tags[name]) == "number" then out[tags[name]] = true end
  end
  return out
end

-- The questIDs the client puts on a map, as a set, or nil when it can't say.
local function onMap(mapID)
  local list = mapID and call(C_QuestLog, "GetQuestsOnMap", mapID)
  if type(list) ~= "table" then return nil end
  local set = {}
  for _, q in ipairs(list) do set[ns.PlainNumber(q.questID) or 0] = true end
  return set
end

-- Whether a log entry belongs on the card: on this dungeon's map when inside one that lists quests, else tagged as a dungeon quest.
local function wanted(info, onThisMap, tags)
  if onThisMap then return onThisMap[info.questID] == true end
  local tag = call(C_QuestLog, "GetQuestTagInfo", info.questID)
  return type(tag) == "table" and tags[ns.PlainNumber(tag.tagID) or 0] == true
end

-- A log entry as { title, level, done }, or nil when it is a header or its title or level is hidden.
local function entry(info)
  if type(info) ~= "table" or info.isHeader or ns.IsSecret(info.questID) then return nil end
  local level = ns.PlainNumber(info.level)
  if not plainText(info.title) or not ns.PlainNumber(info.questID) or not level then return nil end
  return { title = info.title, level = level, done = info.isComplete == true, questID = info.questID }
end

-- Sort order: lowest level first, then by title.
local function byLevel(a, b)
  if a.level ~= b.level then return a.level < b.level end
  return a.title < b.title
end

-- Your log's quests for the card, lowest level first.
function DC.Quests(inside)
  local out, onThisMap, tags = {}, inside and onMap(mapNow()), tagSet()
  for i = 1, ns.PlainNumber((call(C_QuestLog, "GetNumQuestLogEntries"))) or 0 do
    local e = entry(call(C_QuestLog, "GetInfo", i))
    if e and wanted(e, onThisMap, tags) then out[#out + 1] = e end
  end
  table.sort(out, byLevel)
  return out
end

-- "[22] The Defias Brotherhood · done".
function DC.QuestText(q)
  return string.format("[%d] %s%s", q.level, q.title, q.done and " · done" or "")
end

-- Keys ------------------------------------------------------------------------------------------

-- Whether an item is a key (by the client's own item class).
local function isKey(itemID)
  local _, _, _, _, _, class = call(C_Item, "GetItemInfoInstant", itemID)
  return ns.PlainNumber(class) == DC.KEY_CLASS
end

-- The name of an item, "item 123" while the client hasn't cached it.
local function nameOf(itemID)
  local name = call(C_Item, "GetItemInfo", itemID)
  return plainText(name) or ("item " .. itemID)
end

-- The keys in your bags, by name, each once.
function DC.Keys()
  local out, seen = {}, {}
  for bag = 0, DC.LAST_BAG do
    for slot = 1, ns.PlainNumber(call(C_Container, "GetContainerNumSlots", bag)) or 0 do
      local item = call(C_Container, "GetContainerItemInfo", bag, slot)
      local id = type(item) == "table" and ns.PlainNumber(item.itemID)
      if id and not seen[id] and isKey(id) then seen[id], out[#out + 1] = true, nameOf(id) end
    end
  end
  return out
end

-- The card ----------------------------------------------------------------------------------------

-- The quest lines: up to DC.QUESTS, then "and N more".
local function questLines(inside)
  local quests, lines = DC.Quests(inside), {}
  for i = 1, math.min(#quests, DC.QUESTS) do lines[#lines + 1] = DC.QuestText(quests[i]) end
  if #quests > DC.QUESTS then lines[#lines + 1] = string.format("and %d more", #quests - DC.QUESTS) end
  return lines, #quests
end

-- The dungeon's heading and, when there was an earlier visit, its last-run line.
local function headLines(heading)
  local last = DC.LastRun()
  return { { heading, "head" }, last and { last } or nil }
end

-- The lines to add to the Instance prep card, as { text, role } with role "head" for a heading: the dungeon, your quests for it, the keys you carry. Empty when there is nothing to say or in combat.
function DC.Lines()
  if ns.InCombat() then return {} end
  local out, heading = {}, DC.Heading()
  if heading then out = headLines(heading) end
  local quests, n = questLines(heading ~= nil)
  if n > 0 then out[#out + 1] = { heading and "Your quests here" or "Dungeon quests in your log", "head" } end
  for _, text in ipairs(quests) do out[#out + 1] = { text } end
  local keys = DC.Keys()
  if #keys > 0 then out[#out + 1] = { "Keys: " .. table.concat(keys, ", ") } end
  return out
end
