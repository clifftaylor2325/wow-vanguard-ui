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
local L = ns.L

local T = ns.Theme

local QA = ns.Module("QuestArrow", { defaults = { show = true, auto = true } })
ns.QuestArrow = QA

ns.Options.MODULE_INFO.QuestArrow = { L["Quest arrow"], L["A movable arrow on screen that turns toward the nearest unfinished quest objective, with its distance."] }

-- The frame's size; seconds between redraws of the turn and distance; seconds between picks of the quest.
QA.WIDTH, QA.HEIGHT, QA.DRAW, QA.PICK = 212, 44, 0.1, 1
-- A finished quest's distance (squared) is multiplied by this, so a turn-in outranks a near objective.
QA.READY_BIAS = 0.25
-- A challenger replaces the current quest only when its distance (squared) is under this share of the current one's.
QA.SWITCH = 0.5
-- Within this many yards the arrow reads "Here"; the arrow's alpha while it can't point (or you're there); the
-- panel's inner padding (units).
QA.HERE, QA.FAINT, QA.PAD = 15, 0.35, 8
-- How far the Pin button sits below the panel's top: it fills the title's row, so the distance line under it can run to the
-- panel's right edge.
QA.PIN_TOP = 2

-- Choosing the quest ------------------------------------------------------------------------------

-- How near a quest counts (distance squared, less for a finished one); nil when it isn't in the log, it failed
-- (nothing is left to do there), or the client won't say.
local function rank(id)
  local q = ns.GetModule("QuestTracker").Quest(id)
  local d = q and ns.PlainNumber(ns.CallIf(C_QuestLog, "GetDistanceSqToQuest", id))
  if not d or q.failed then return nil end
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

-- Whether a quest is finished, failed or gone from the log (the arrow moving on from it is worth a word).
local function finished(id)
  local q = ns.GetModule("QuestTracker").Quest(id)
  return not q or q.ready or q.failed
end

-- Whether a quest is ready to turn in.
local function readyToTurnIn(id)
  local q = ns.GetModule("QuestTracker").Quest(id)
  return q ~= nil and q.ready
end

-- The quest title for the arrow, or "Quest".
local function titleOf(id)
  return ns.PlainText(ns.CallIf(C_QuestLog, "GetTitleForQuestID", id)) or L["Quest"]
end

-- The quest to follow and whether the arrow holds it as a pin: the Shift-clicked quest (with "Follow the
-- nearest quest" off, also the game's tracked one), else the nearest, else the game's tracked one. A
-- Shift-click whose quest has left the log is let go here, so it can't hold a quest the game tracks later.
local function follow(old)
  local guide = ns.QuestGuide
  if guide.pointed and not ns.GetModule("QuestTracker").Quest(guide.pointed) then guide.DropPin() end
  local pin = pinned()
  if pin and (ns.QuestGuide.pointed or not QA.settings.auto) then return pin, true end
  return QA.settings.auto and QA.Choose(old) or pin, false
end

-- The look that changes only with the pick: the Pin button while the arrow holds a pinned quest (the title stops short
-- of it; the distance line below it keeps the whole width), and the arrow gold for a turn-in, else the accent.
local function paintPick(f)
  f.pin:SetShown(QA.held == true)
  if QA.held then f.title:SetPoint("RIGHT", f.pin, "LEFT", -T.SPACE.tight, 0) else f.title:SetPoint("RIGHT", f, "RIGHT", -QA.PAD, 0) end
  T.Tint(f.arrow, QA.ready and "gold" or "accent")
end

-- Picks the quest, whether it is held and ready to turn in, and its spot (map, x, y); says so when it moved on
-- from a finished one, redraws, and has the tracker move its accent line when the quest changed.
function QA.Pick()
  if not QA.frame then return end
  local old = QA.current
  QA.current, QA.held = follow(old)
  QA.ready = QA.current ~= nil and readyToTurnIn(QA.current)
  QA.target = QA.current and { ns.QuestGuide.Target(QA.current) } or nil
  if old and QA.current and old ~= QA.current and finished(old) and not ns.InCombat() then ns.Chat(ns.Format(L["Arrow: {quest}."], { quest = titleOf(QA.current) })) end
  paintPick(QA.frame)
  QA.Draw()
  if old ~= QA.current then ns.GetModule("QuestTracker").Redraw() end
end

-- The quest the arrow holds (its pick), shown or not: the minimap marks it larger.
---@return number|nil
function QA.Current()
  return QA.current
end

-- The quest the arrow shows, for the tracker's accent line: its pick while the arrow is on, else nil.
---@return number|nil
function QA.Followed()
  if not (QA.settings and QA.settings.show) then return nil end
  return QA.current
end

-- Turning and distance -----------------------------------------------------------------------------

-- Your spot on a map as x, y (0 to 1); nil when the client won't say.
function QA.PlayerSpot(mapID)
  if ns.Restricted("Map") then return nil end
  local pos = ns.CallIf(C_Map, "GetPlayerMapPosition", mapID, "player")
  if type(pos) ~= "table" or type(pos.GetXY) ~= "function" then return nil end
  local x, y = pos:GetXY()
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  if x and y then return x, y end
end

-- The map's size in yards as width, height and true; 1, 1 and false when the client doesn't give it (the turn is then a little off on a wide map).
function QA.WorldSize(mapID)
  local w, h = ns.CallIf(C_Map, "GetMapWorldSize", mapID)
  w, h = ns.PlainNumber(w), ns.PlainNumber(h)
  if w and h and w > 0 and h > 0 then return w, h, true end
  return 1, 1, false
end

-- Radians to turn the arrow, from straight up (up means the spot is ahead of you); nil when the client won't say your spot or facing.
function QA.Turn(mapID, x, y)
  local px, py = QA.PlayerSpot(mapID)
  local facing = ns.PlainNumber(ns.CallIf(_G, "GetPlayerFacing"))
  if not (px and facing) then return nil end
  local w, h = QA.WorldSize(mapID)
  return math.atan2(-(x - px) * w, -(y - py) * h) - facing
end

-- Yards to the quest, from the distance the client reports; nil when it won't say.
local function yards(id)
  local sq = ns.PlainNumber(ns.CallIf(C_QuestLog, "GetDistanceSqToQuest", id))
  return sq and math.floor(math.sqrt(sq) + 0.5)
end

-- The distance lines by whether the arrow has a turn, then whether the quest is ready to turn in.
local DISTANCE = {
  [true] = { [false] = L["{yards} yd"], [true] = L["Turn in · {yards} yd"] },
  [false] = { [false] = L["{yards} yd, no direction"], [true] = L["Turn in · {yards} yd, no direction"] },
}

-- The distance line: "230 yd" ("Turn in · 230 yd" for a finished quest), or why there is none.
local function distanceText(d, turn, ready)
  if not d then return L["No direction"] end
  return ns.Format(DISTANCE[not not turn][not not ready], { yards = d })
end

-- Whether you're there: within QA.HERE yards and not on a flight, which passes over spots without
-- stopping (a hidden answer counts as on one).
local function arrived(d)
  if not d or d > QA.HERE then return false end
  local taxi = ns.CallIf(_G, "UnitOnTaxi", "player")
  return not ns.IsSecret(taxi) and taxi ~= true
end

-- The game's next waypoint on a map toward its super-tracked target, as x, y (C_Navigation since 12.1, C_SuperTrack before).
local function navWaypoint(mapID)
  local x, y = ns.CallIf(C_Navigation, "GetNextWaypointForMap", mapID)
  if not ns.IsSecret(x) and x == nil then x, y = ns.CallIf(C_SuperTrack, "GetNextWaypointForMap", mapID) end
  return x, y
end

-- The next waypoint on this map toward a quest on another one (a zone exit, a boat), as x, y: the
-- quest's own, else the game's for its super-tracked quest; nil when the client has neither call or won't say.
function QA.Exit(id, mapID)
  local x, y = ns.CallIf(C_QuestLog, "GetNextWaypointForMap", id, mapID)
  if not ns.PlainNumber(x) and id == ns.PlainNumber(ns.CallIf(C_SuperTrack, "GetSuperTrackedQuestID")) then
    x, y = navWaypoint(mapID)
  end
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  if x and y then return x, y end
end

-- The arrow's turn for the quest's spot, or for the way toward it when the spot is on another map; nil when the client won't say.
local function turnFor(id, target)
  local here = ns.PlainNumber(ns.CallIf(C_Map, "GetBestMapForUnit", "player"))
  if not (target and target[1] and here) then return nil end
  if here == target[1] then return QA.Turn(here, target[2], target[3]) end
  local x, y = QA.Exit(id, here)
  return x and QA.Turn(here, x, y)
end

-- The distance line and the arrow's look: "Here" in good with a faint arrow once you're there, else the
-- distance. A state change, never a fade.
local function paintState(f, id, turn)
  local d = yards(id)
  local spot = QA.target ~= nil and QA.target[1] ~= nil
  local here = spot and arrived(d)
  f.dist:SetText((not spot and L["No spot from the game"]) or (here and L["Here"]) or distanceText(d, turn, QA.ready))
  T.Color(f.dist, here and "good" or "text2")
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

-- The Pin button: back to the nearest quest (or, with "Follow the nearest quest" off, no arrow until the next pin).
function QA.Unpin()
  ns.QuestGuide.Unpin()
  ns.Chat(QA.settings.auto and L["Arrow: nearest quest."] or L["Arrow: off until you Shift-click a quest in the tracker."])
  QA.Pick()
end

-- What the Pin button says it does.
function QA.PinTooltip(b)
  local tip = GameTooltip
  if not tip then return end
  tip:SetOwner(b, "ANCHOR_BOTTOM")
  tip:SetText(L["Pinned (Shift-click in the tracker)"], T.RGB("text"))
  tip:AddLine(QA.settings.auto and L["Click: follow the nearest quest."] or L["Click: let it go. Follow the nearest quest is off, so the arrow hides."], T.RGB("text2"))
  tip:Show()
end

-- The frame ---------------------------------------------------------------------------------------

-- The arrow and its two lines of text on the frame.
local function fill(f)
  f.arrow = f:CreateTexture(nil, "ARTWORK")
  f.arrow:SetSize(28, 28)
  f.arrow:SetPoint("LEFT", f, "LEFT", QA.PAD, 0)
  f.arrow:SetTexture(T.Icon("QuestArrow"))
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text")
  f.title:SetPoint("TOPLEFT", f.arrow, "TOPRIGHT", QA.PAD, -2)
  f.title:SetPoint("RIGHT", f, "RIGHT", -QA.PAD, 0)
  f.title:SetJustifyH("LEFT")
  f.title:SetWordWrap(false)
end

-- The Pin button at the panel's top right, the one part of the panel that takes the mouse (the rest lets
-- clicks and camera turns through): a ghost tile, as the window controls.
local function pinButton(f)
  local b = T.WindowControl(CreateFrame("Button", nil, f), "Pin")
  b:SetPoint("TOPRIGHT", f, "TOPRIGHT", -T.SPACE.tight, -QA.PIN_TOP)
  b:SetScript("OnClick", ns.Guard("unpin quest arrow", function() QA.Unpin() end))
  b:HookScript("OnEnter", ns.Guard("quest arrow pin tip", QA.PinTooltip))
  b:HookScript("OnLeave", ns.Guard("quest arrow pin tip", function() if GameTooltip then GameTooltip:Hide() end end))
  b:Hide()
  f.pin = b
end

-- The movable frame (/vg unlock), hidden until there is a quest to point at.
local function build()
  local f = CreateFrame("Frame", "Vanguard_QuestArrow", UIParent)
  T.Panel(f, { shadow = true })
  f:SetSize(QA.WIDTH, QA.HEIGHT)
  fill(f)
  f.dist = ns.EndAt(T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2"), f, QA.PAD)
  f.dist:SetPoint("BOTTOMLEFT", f.arrow, "BOTTOMRIGHT", QA.PAD, 2)
  pinButton(f)
  f:Hide()
  QA.frame = f
  ns.Mover(f, "questarrow", L["Quest arrow"], { "TOP", "TOP", 0, -150 })
end

-- Options ----------------------------------------------------------------------------------------

-- get/set for one of the module's settings (also while it is off), after() running on each change, and the default.
local function setting(key, after)
  return function() return ns.Settings("QuestArrow", QA.defaults)[key] end,
    function(v) ns.Settings("QuestArrow", QA.defaults)[key] = v if QA.settings then after() end end, QA.defaults[key]
end

-- Shows or hides the arrow, and the tracker's mark on its pick with it.
local function showChanged()
  QA.Draw()
  ns.GetModule("QuestTracker").Redraw()
end

-- The arrow's rows on the Quests page's "Finding your way" card (Core/OptionsQuests.lua places them).
function QA.Rows()
  return {
    { "check", L["Show the quest arrow"], setting("show", showChanged) },
    { "check", L["Follow the nearest quest (off: only the one you pinned)"], setting("auto", QA.Pick) },
  }
end

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
