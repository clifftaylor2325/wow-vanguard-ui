-- The quest arrow: a small movable arrow on screen that turns toward the nearest unfinished
-- objective among the quests you watch, with the quest's title and the distance under it. A finished
-- quest counts as nearer than it is, so a turn-in wins over an objective close by. Shift-click on a
-- quest in the tracker (Modules/QuestGuide.lua) pins the arrow to it instead; with "Follow the
-- nearest quest" off, only that pinned quest (or the game's super-tracked one) is followed.
--
-- Everything comes from the client: the quest's next waypoint or its spot on the map you're on
-- (QuestGuide.Target), the distance the client reports for the quest, your map position and facing.
-- A quest on another map is pointed at by the client's next waypoint on this one (the zone exit
-- or boat), when the client has that call; without it, or a value the client won't give, the
-- distance reads "no direction" instead of a guess. Nothing here is protected, so it updates in combat too.

local ADDON, ns = ...

local T = ns.Theme

local QA = ns.Module("QuestArrow", { defaults = { show = true, auto = true } })
ns.QuestArrow = QA

ns.Options.MODULE_INFO.QuestArrow = { "Quest arrow", "A movable arrow on screen that turns toward the nearest unfinished quest objective, with its distance." }

-- The frame's size; seconds between redraws of the turn and distance; seconds between picks of the quest.
QA.WIDTH, QA.HEIGHT, QA.DRAW, QA.PICK = 190, 44, 0.1, 1
-- A finished quest's distance (squared) is multiplied by this, so a turn-in outranks a near objective.
QA.READY_BIAS = 0.25
-- A challenger replaces the current quest only when its distance (squared) is under this share of the current one's.
QA.SWITCH = 0.5
-- Within this many yards the arrow reads "Here"; the arrow's alpha while it can't point (or you're there).
QA.HERE, QA.FAINT = 15, 0.35

-- Calls t[name](...) if the client has it.
local function call(t, name, ...)
  local fn = type(t) == "table" and t[name]
  if type(fn) == "function" then return fn(...) end
end

-- The text if it is a plain, non-empty string; nil otherwise.
local function plainText(text)
  if ns.IsSecret(text) or type(text) ~= "string" or text == "" then return nil end
  return text
end

-- Choosing the quest ------------------------------------------------------------------------------

-- How near a quest counts (distance squared, less for a finished one); nil when it isn't in the log or the client won't say.
local function rank(id)
  local q = ns.GetModule("QuestTracker").Quest(id)
  local d = q and ns.PlainNumber(call(C_QuestLog, "GetDistanceSqToQuest", id))
  if not d then return nil end
  return q.ready and d * QA.READY_BIAS or d
end

-- The watched quest with the lowest rank, its rank, and the rank of `current` (nil when it has none).
local function nearest(current)
  local best, bestRank, currentRank
  for _, id in ipairs(ns.GetModule("QuestTracker").Watched()) do
    local r = rank(id)
    if r and (not bestRank or r < bestRank) then best, bestRank = id, r end
    if r and id == current then currentRank = r end
  end
  return best, bestRank, currentRank
end

-- The quest to follow: the current one unless another is clearly nearer (so the arrow doesn't flap between two).
function QA.Choose(current)
  local best, bestRank, currentRank = nearest(current)
  if currentRank and bestRank > currentRank * QA.SWITCH then return current end
  return best
end

-- The quest the player pinned (Shift-click) or the game super-tracks, when it is still in the log.
local function pinned()
  local id = ns.QuestGuide.Followed()
  return id and ns.GetModule("QuestTracker").Quest(id) and id or nil
end

-- Whether a quest is finished or gone from the log (the arrow moving on from it is worth a word).
local function finished(id)
  local q = ns.GetModule("QuestTracker").Quest(id)
  return not q or q.ready
end

-- The quest title for the arrow, or "Quest".
local function titleOf(id)
  return plainText(call(C_QuestLog, "GetTitleForQuestID", id)) or "Quest"
end

-- Picks the quest, whether it is finished, and its spot (map, x, y); says so when it moved on from a
-- finished one, and redraws.
function QA.Pick()
  if not QA.frame then return end
  local old = QA.current
  QA.current = (QA.settings.auto and (ns.QuestGuide.pointed and pinned() or QA.Choose(old))) or pinned()
  QA.ready = QA.current ~= nil and finished(QA.current)
  QA.target = QA.current and { ns.QuestGuide.Target(QA.current) } or nil
  if old and QA.current and old ~= QA.current and finished(old) and not ns.InCombat() then ns.Chat("Arrow: " .. titleOf(QA.current) .. ".") end
  QA.Draw()
end

-- Turning and distance -----------------------------------------------------------------------------

-- Your spot on a map as x, y (0 to 1); nil when the client won't say.
function QA.PlayerSpot(mapID)
  if ns.Restricted("Map") then return nil end
  local pos = call(C_Map, "GetPlayerMapPosition", mapID, "player")
  if type(pos) ~= "table" or type(pos.GetXY) ~= "function" then return nil end
  local x, y = pos:GetXY()
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  if x and y then return x, y end
end

-- The map's size in yards as width, height and true; 1, 1 and false when the client doesn't give it (the turn is then a little off on a wide map).
function QA.WorldSize(mapID)
  local w, h = call(C_Map, "GetMapWorldSize", mapID)
  w, h = ns.PlainNumber(w), ns.PlainNumber(h)
  if w and h and w > 0 and h > 0 then return w, h, true end
  return 1, 1, false
end

-- Radians to turn the arrow, from straight up (up means the spot is ahead of you); nil when the client won't say your spot or facing.
function QA.Turn(mapID, x, y)
  local px, py = QA.PlayerSpot(mapID)
  local facing = ns.PlainNumber(call(_G, "GetPlayerFacing"))
  if not (px and facing) then return nil end
  local w, h = QA.WorldSize(mapID)
  return math.atan2(-(x - px) * w, -(y - py) * h) - facing
end

-- Yards to the quest, from the distance the client reports; nil when it won't say.
local function yards(id)
  local sq = ns.PlainNumber(call(C_QuestLog, "GetDistanceSqToQuest", id))
  return sq and math.floor(math.sqrt(sq) + 0.5)
end

-- The distance line: "230 yd" ("Turn in · 230 yd" for a finished quest), or why there is none.
local function distanceText(d, turn, ready)
  if not d then return "No direction" end
  local text = turn and (d .. " yd") or (d .. " yd, no direction")
  return ready and ("Turn in · " .. text) or text
end

-- Whether you're there: within QA.HERE yards and not on a flight, which passes over spots without
-- stopping (a hidden answer counts as on one).
local function arrived(d)
  if not d or d > QA.HERE then return false end
  local taxi = call(_G, "UnitOnTaxi", "player")
  return not ns.IsSecret(taxi) and taxi ~= true
end

-- The game's next waypoint on a map toward its super-tracked target, as x, y (C_Navigation since 12.1, C_SuperTrack before).
local function navWaypoint(mapID)
  local x, y = call(C_Navigation, "GetNextWaypointForMap", mapID)
  if not ns.IsSecret(x) and x == nil then x, y = call(C_SuperTrack, "GetNextWaypointForMap", mapID) end
  return x, y
end

-- The next waypoint on this map toward a quest on another one (a zone exit, a boat), as x, y: the
-- quest's own, else the game's for its super-tracked quest; nil when the client has neither call or won't say.
function QA.Exit(id, mapID)
  local x, y = call(C_QuestLog, "GetNextWaypointForMap", id, mapID)
  if not ns.PlainNumber(x) and id == ns.PlainNumber(call(C_SuperTrack, "GetSuperTrackedQuestID")) then
    x, y = navWaypoint(mapID)
  end
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  if x and y then return x, y end
end

-- The arrow's turn for the quest's spot, or for the way toward it when the spot is on another map; nil when the client won't say.
local function turnFor(id, target)
  local here = ns.PlainNumber(call(C_Map, "GetBestMapForUnit", "player"))
  if not (target and target[1] and here) then return nil end
  if here == target[1] then return QA.Turn(here, target[2], target[3]) end
  local x, y = QA.Exit(id, here)
  return x and QA.Turn(here, x, y)
end

-- The distance line and the arrow's look: "Here" in good with a faint arrow once you're there, else the
-- distance; the arrow gold for a turn-in, else the accent. A state change, never a fade.
local function paintState(f, id, turn)
  local d = yards(id)
  local spot = QA.target ~= nil and QA.target[1] ~= nil
  local here = spot and arrived(d)
  f.dist:SetText((not spot and "No spot from the game") or (here and "Here") or distanceText(d, turn, QA.ready))
  T.Color(f.dist, here and "good" or "text2")
  T.Tint(f.arrow, QA.ready and "gold" or "accent")
  f.arrow:SetAlpha(turn and not here and 1 or QA.FAINT)
end

-- Redraws the arrow's turn, title and distance for the current quest; hides the frame with none.
function QA.Draw()
  local f, id = QA.frame, QA.current
  if not (f and QA.settings.show and id) then return f and f:Hide() end
  local turn = turnFor(id, QA.target)
  f.title:SetText(titleOf(id))
  paintState(f, id, turn)
  f.arrow:SetRotation(turn or 0)
  f:Show()
end

-- The frame ---------------------------------------------------------------------------------------

-- The arrow and its two lines of text on the frame.
local function fill(f)
  f.arrow = f:CreateTexture(nil, "ARTWORK")
  f.arrow:SetSize(28, 28)
  f.arrow:SetPoint("LEFT", f, "LEFT", 8, 0)
  f.arrow:SetTexture(T.Icon("QuestArrow"))
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text")
  f.title:SetPoint("TOPLEFT", f.arrow, "TOPRIGHT", 8, -2)
  f.title:SetPoint("RIGHT", f, "RIGHT", -8, 0)
  f.title:SetJustifyH("LEFT")
end

-- The movable frame (/vg unlock), hidden until there is a quest to point at.
local function build()
  local f = CreateFrame("Frame", "Vanguard_QuestArrow", UIParent)
  T.Panel(f, { shadow = true })
  f:SetSize(QA.WIDTH, QA.HEIGHT)
  fill(f)
  f.dist = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.dist:SetPoint("BOTTOMLEFT", f.arrow, "BOTTOMRIGHT", 8, 2)
  f:Hide()
  QA.frame = f
  ns.Mover(f, "questarrow", "Quest arrow", { "TOP", "TOP", 0, -150 })
end

-- Options ----------------------------------------------------------------------------------------

-- get/set for one of the module's settings (also while it is off), after() running on each change, and the default.
local function setting(key, after)
  return function() return ns.Settings("QuestArrow", QA.defaults)[key] end,
    function(v) ns.Settings("QuestArrow", QA.defaults)[key] = v if QA.settings then after() end end, QA.defaults[key]
end

-- The arrow's card on the Quests page.
function QA.Rows()
  return {
    { "header", "Quest arrow" },
    { "text", "An arrow on screen that turns toward the nearest unfinished objective of the quests you watch. Move it with /vg unlock; Shift-click a quest in the tracker to pin the arrow to it." },
    { "check", "Show the quest arrow", setting("show", QA.Draw) },
    { "check", "Follow the nearest quest (off: only the one you pinned)", setting("auto", QA.Pick) },
  }
end
ns.Options.AddRows("quests", QA.Rows)

-- Module entry point (Core/Modules.lua): the frame, a pick whenever the log or the zone changes, a pick
-- each second as you move, and the redraw of the turn a few times a second.
function QA.Enable(settings)
  QA.settings = settings
  build()
  for _, event in ipairs({ "QUEST_LOG_UPDATE", "QUEST_WATCH_LIST_CHANGED", "SUPER_TRACKING_CHANGED", "ZONE_CHANGED_NEW_AREA", "QUEST_POI_UPDATE" }) do
    ns.On(event, function() ns.Soon("quest arrow", QA.Pick) end)
  end
  ns.Every("quest arrow pick", QA.PICK, QA.Pick)
  ns.Every("quest arrow", QA.DRAW, QA.Draw)
  QA.Pick()
end
