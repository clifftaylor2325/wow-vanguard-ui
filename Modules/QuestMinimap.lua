-- Quest spots on the minimap: a small mark on the minimap for each quest in your log that the client
-- puts on the map you're on (its quest spot, C_QuestLog.GetQuestsOnMap): a gold ! while it has
-- objectives left, a gold ? once it is ready to turn in. A spot past the minimap's edge sits on the
-- edge, faint, in its direction (the rim of a round minimap, the sides of a square one), inside it. The marks turn with the minimap when it rotates.
--
-- Client data only, never a quest database: no spot from the client, no mark. The scale comes from the
-- client's minimap view radius and the map's size in yards; without either, no marks are drawn rather
-- than guessed. Nothing here is protected (the marks are Vanguard's own textures over the minimap).

local ADDON, ns = ...

local T = ns.Theme

local QM = ns.Module("QuestMinimap", { defaults = { show = true } })
ns.QuestMinimap = QM

ns.Options.MODULE_INFO.QuestMinimap = { "Quest spots on the minimap", "A mark on the minimap where each quest in your log has its spot on the map you're on." }

-- Seconds between redraws; seconds between reads of the quest spots; a mark's size (UI units); the most marks drawn.
QM.DRAW, QM.READ, QM.SIZE, QM.MAX = 0.2, 1, 12, 25
-- How faint a mark on the edge is (the spot is farther than the minimap shows).
QM.EDGE_ALPHA = 0.5

-- Calls t[name](...) if the client has it.
local function call(t, name, ...)
  local fn = type(t) == "table" and t[name]
  if type(fn) == "function" then return fn(...) end
end

-- The spots ---------------------------------------------------------------------------------------

-- One quest spot from the client as { id, x, y, ready }, or nil when it isn't a quest in your log or a value is hidden.
local function spot(q)
  if type(q) ~= "table" or ns.IsSecret(q.isQuestStart) or q.isQuestStart == true then return nil end
  local id, x, y = ns.PlainNumber(q.questID), ns.PlainNumber(q.x), ns.PlainNumber(q.y)
  local quest = id and x and y and ns.GetModule("QuestTracker").Quest(id)
  return quest and { id = id, x = x, y = y, ready = quest.ready } or nil
end

-- The spots of the quests in your log on a map, at most QM.MAX.
function QM.Spots(mapID)
  local out = {}
  for _, q in ipairs(call(C_QuestLog, "GetQuestsOnMap", mapID) or {}) do
    local s = #out < QM.MAX and spot(q)
    if s then out[#out + 1] = s end
  end
  return out
end

-- Reads the spots on the map you're on (each second and when the log or the zone changes).
function QM.Read()
  QM.mapID = not ns.Restricted("Map") and ns.PlainNumber(call(C_Map, "GetBestMapForUnit", "player")) or nil
  QM.spots = QM.mapID and QM.Spots(QM.mapID) or {}
end

-- Placing -----------------------------------------------------------------------------------------

-- East and north yards turned with the minimap when it rotates (the way you face is up), else as they are.
local function rotated(east, north)
  local facing = call(C_CVar, "GetCVar", "rotateMinimap") == "1" and ns.PlainNumber(call(_G, "GetPlayerFacing"))
  if not facing then return east, north end
  local c, s = math.cos(facing), math.sin(facing)
  return east * c + north * s, north * c - east * s
end

-- The yards per minimap half-width, the map's size and your spot, or nil when the client won't say one of them.
local function scale(mapID)
  local radius = ns.PlainNumber(call(C_Minimap, "GetViewRadius"))
  local w, h, known = ns.QuestArrow.WorldSize(mapID)
  local px, py = ns.QuestArrow.PlayerSpot(mapID)
  if not (radius and radius > 0 and known and px) then return nil end
  return { radius = radius, w = w, h = h, px = px, py = py }
end

-- Whether the minimap is round: Vanguard's built round, or the game's own (round) one while Vanguard's is off.
function QM.Round()
  local map = ns.GetModule("Minimap")
  return map.round == true or not map.enabled
end

-- How far an offset reaches towards the minimap's edge: straight out on a round map, along the farther axis on a square one.
local function reach(ox, oy)
  if QM.Round() then return math.sqrt(ox * ox + oy * oy) end
  return math.max(math.abs(ox), math.abs(oy))
end

-- Where a spot (x, y on the map, 0 to 1) sits from the minimap's centre, in UI units, given `half` its half-width:
-- x, y and true when it is past the edge (then it sits faint on the edge in its direction). A mark never
-- runs past the map's edge: one that would is drawn just inside it, its whole self on the map.
function QM.Offset(s, x, y, half)
  local east, north = rotated((x - s.px) * s.w, -(y - s.py) * s.h)
  local ox, oy = east / s.radius * half, north / s.radius * half
  local far, room = reach(ox, oy), half - QM.SIZE / 2
  if far <= room then return ox, oy, false end
  return ox * room / far, oy * room / far, far > half
end

-- Drawing -----------------------------------------------------------------------------------------

-- Mark i, made the first time it's needed (a texture on the marks' layer over the minimap).
local function mark(i)
  local m = QM.marks[i]
  if m then return m end
  m = QM.layer:CreateTexture(nil, "OVERLAY")
  m:SetSize(QM.SIZE, QM.SIZE)
  QM.marks[i] = m
  return m
end

-- Puts mark i on a spot: the ! or the ?, in gold, faint on the edge.
local function place(i, sp, ox, oy, edge)
  local m = mark(i)
  m:SetTexture(T.Icon(sp.ready and "QuestQuery" or "QuestBang"))
  T.Tint(m, "gold", edge and QM.EDGE_ALPHA or 1)
  m:ClearAllPoints()
  m:SetPoint("CENTER", QM.layer, "CENTER", ox, oy)
  m:Show()
end

-- Redraws the marks for the spots read last; none when switched off, with no spots, or when the client won't give the scale or the minimap's size.
function QM.Draw()
  local s = QM.settings.show and QM.mapID and #QM.spots > 0 and scale(QM.mapID)
  local width, n = ns.PlainNumber(QM.layer:GetWidth()), 0
  for _, sp in ipairs(s and width and QM.spots or {}) do
    n = n + 1
    place(n, sp, QM.Offset(s, sp.x, sp.y, width / 2))
  end
  for i = n + 1, #QM.marks do QM.marks[i]:Hide() end
end

-- Options ----------------------------------------------------------------------------------------

-- Whether the marks show (also while the module is off, for the options).
local function getShow() return ns.Settings("QuestMinimap", QM.defaults).show end

-- Switches the marks, redrawing them when the module is on.
local function setShow(v)
  ns.Settings("QuestMinimap", QM.defaults).show = v
  if QM.settings then QM.Draw() end
end

-- The switch on the Quests page.
function QM.Rows()
  return { { "check", "Quest spots on the minimap", getShow, setShow, QM.defaults.show } }
end
ns.Options.AddRows("quests", QM.Rows)

-- Module entry point (Core/Modules.lua): the marks' layer over the minimap, the spots read each second and
-- when the log or zone changes, and the marks redrawn a few times a second as you move.
function QM.Enable(settings)
  QM.settings, QM.marks, QM.spots = settings, {}, {}
  QM.layer = CreateFrame("Frame", "Vanguard_QuestMinimap", Minimap)
  QM.layer:SetAllPoints(Minimap)
  for _, event in ipairs({ "QUEST_LOG_UPDATE", "ZONE_CHANGED_NEW_AREA", "QUEST_POI_UPDATE" }) do
    ns.On(event, function() ns.Soon("quest minimap", QM.Read) end)
  end
  ns.Every("quest minimap read", QM.READ, QM.Read)
  ns.Every("quest minimap", QM.DRAW, QM.Draw)
  QM.Read()
end
