-- Quest history: which of your characters turned in each quest, remembered for the
-- whole account from the client's own QUEST_TURNED_IN, so a quest's text can say
-- "Done on Thrall-Forever · 3 days ago" in Vanguard's quest dialog and quest log
-- (or "Done on this character" from the client's own completed flag for a quest
-- finished before), and the Quest history card's button and /vg quests history [n]
-- list the latest turn-ins. Only the latest turn-in
-- of each quest is kept (a repeatable quest overwrites its own entry), up to
-- QH.MAX_QUESTS quests. Nothing is read in combat that could be hidden: an id or
-- a name the client hides is skipped.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme

local QH = ns.Module("QuestHistory", { defaults = { track = true } })

-- Quests kept, and the share of them a prune keeps (1000 -> 900).
QH.MAX_QUESTS, QH.KEEP = 1000, 0.9
-- How many turn-ins /vg quests history lists by default, and at most.
QH.LIST, QH.LIST_MAX = 10, 25

-- The store ----------------------------------------------------------------------------------

-- The account-wide store: VanguardDB.questHistory = { quests = { [questID] = { who, class, t, title } }, count = quests }.
function QH.Store()
  VanguardDB.questHistory = ns.Fill(type(VanguardDB.questHistory) == "table" and VanguardDB.questHistory or {}, { quests = {}, count = 0 })
  return VanguardDB.questHistory
end

-- Whether history is on (Quests page); false before the module is enabled.
function QH.On()
  return QH.settings ~= nil and QH.settings.track == true
end

-- This character as "Name-Realm" and its class file, or nil when the client hides the name.
function QH.Me()
  local name = ns.PlainText(UnitName("player"))
  if not name then return nil end
  local _, class = UnitClass("player")
  return name .. "-" .. ns.Home.Realm(), ns.PlainText(class)
end

-- The quest's title if the client knows it now, else nil.
local function titleOf(id)
  local api = type(C_QuestLog) == "table" and C_QuestLog.GetTitleForQuestID
  return type(api) == "function" and ns.PlainText(api(id)) or nil
end

-- The wall clock in seconds (0 when the client can't say).
local function now()
  return type(_G.time) == "function" and ns.PlainNumber(_G.time()) or 0
end

-- Recording -----------------------------------------------------------------------------------

-- Forgets the quests turned in longest ago, down to QH.KEEP of QH.MAX_QUESTS.
function QH.Prune()
  local store, ids = QH.Store(), {}
  for id, rec in pairs(store.quests) do ids[#ids + 1] = { id, rec.t or 0 } end
  table.sort(ids, function(a, b) return a[2] > b[2] end)
  local keep = math.floor(QH.MAX_QUESTS * QH.KEEP)
  for k = keep + 1, #ids do store.quests[ids[k][1]] = nil end
  store.count = math.min(#ids, keep)
end

-- Notes that this character turned questID in now (replacing the quest's older entry).
function QH.Record(questID)
  local store, who, class = QH.Store(), QH.Me()
  if not who then return end
  if not store.quests[questID] then store.count = store.count + 1 end
  store.quests[questID] = { who = who, class = class, t = now(), title = titleOf(questID) }
  if store.count > QH.MAX_QUESTS then QH.Prune() end
end

-- QUEST_TURNED_IN: the first argument after the event is the quest's id; anything but a plain number is ignored.
function QH.OnTurnedIn(_, questID)
  local id = ns.PlainNumber(questID)
  if id and QH.On() then QH.Record(id) end
end

-- Showing -------------------------------------------------------------------------------------

-- How long ago a time was, in the computer's days, as every other "ago" reads: "today", "yesterday", "3 days ago".
function QH.Ago(t)
  return ns.AuctionPrices.Ago(t or 0)
end

-- The quest's entry, or nil (none, or history is off).
function QH.Get(questID)
  local rec = QH.On() and questID and QH.Store().quests[questID]
  if type(rec) == "table" and rec.who then return rec end
end

-- "Done on this character" for a quest the client flags as done here (finished before Vanguard was there to
-- see it), or nil. A hidden answer counts as not done.
local function clientLine(questID)
  local api = type(C_QuestLog) == "table" and C_QuestLog.IsQuestFlaggedCompleted
  local done = QH.On() and type(questID) == "number" and type(api) == "function" and api(questID)
  return ns.IsTrue(done) and L["Done on this character"] or nil
end

-- "Done on Thrall-Forever · 3 days ago" (on this character's own name: "Done on this character"); with no
-- turn-in remembered, the client's own flag for this character; nil for a quest not done.
function QH.Line(questID)
  local rec = QH.Get(questID)
  if not rec then return clientLine(questID) end
  if rec.who == QH.Me() then return ns.Format(L["Done on this character · {ago}"], { ago = QH.Ago(rec.t) }) end
  return ns.Format(L["Done on {character} · {ago}"], { character = rec.who, ago = QH.Ago(rec.t) })
end

-- The same line in the muted color, for a text that holds more (nil for none).
function QH.Muted(questID)
  local line = QH.Line(questID)
  return line and T.Paint(line, "muted") or nil
end

-- Orders two { id, rec } pairs: the newer turn-in first, the lower quest id on the same second. A strict
-- order (never true both ways round), or table.sort errors or leaves the list half sorted.
local function newestFirst(a, b)
  if a[2].t ~= b[2].t then return a[2].t > b[2].t end
  return a[1] < b[1]
end

-- The latest turn-ins, newest first: { id, rec } pairs.
function QH.Latest(n)
  local list = {}
  for id, rec in pairs(QH.Store().quests) do list[#list + 1] = { id, rec } end
  table.sort(list, newestFirst)
  for i = #list, n + 1, -1 do list[i] = nil end
  return list
end

-- One chat line: "Wolves · Thrall-Forever · 3 days ago".
local function listLine(id, rec)
  local title = rec.title or titleOf(id) or ns.Format(L["Quest {id}"], { id = id })
  return string.format("%s · %s · %s", title, rec.who, QH.Ago(rec.t))
end

-- /vg quests history [n]: the latest turn-ins from every character.
function QH.Command(rest)
  if not QH.On() then return ns.Chat(L["Quest history is off (/vg > Quests)."]) end
  local n = math.max(1, math.min(tonumber(rest:match("(%d+)")) or QH.LIST, QH.LIST_MAX))
  local list = QH.Latest(n)
  if #list == 0 then return ns.Chat(L["No turn-ins remembered yet."]) end
  ns.Chat(ns.Format(L["Latest {count} quest turn-in(s), of {total} remembered:"], { count = #list, total = QH.Store().count }))
  for _, e in ipairs(list) do ns.Chat(listLine(e[1], e[2])) end
end

-- Module entry point (Core/Modules.lua).
function QH.Enable(settings)
  QH.settings = settings
  QH.Store()
  ns.On("QUEST_TURNED_IN", QH.OnTurnedIn)
end
