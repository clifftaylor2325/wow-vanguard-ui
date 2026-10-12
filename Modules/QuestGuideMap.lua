-- Quest guidance's map pins (Modules/QuestGuide.lua): where quests start on
-- the map the world map shows, from the client's own lists (its quest lines
-- for the map, and the quest spots it marks as starts), as small "!" pins in
-- the Vanguard look. Hover one for the quest; click it to point the arrow
-- there. Vanguard's pins stay away when the game's own map already shows
-- quest offers on that map, and while Questie (which has its own) is loaded.

local ADDON, ns = ...

local T = ns.Theme
local QP = ns.QuestParts
local QG = ns.QuestGuide

QG.PIN, QG.MAX_PINS = 16, 60

-- Calls t[name](...) if the client has it.
local function call(t, name, ...)
  local fn = type(t) == "table" and t[name]
  if type(fn) == "function" then return fn(...) end
end

-- Data -------------------------------------------------------------------------------------------

-- Adds a start { questID, x, y, name } unless its quest is there already or a value is hidden.
local function addStart(out, seen, questID, x, y, name)
  questID, x, y = ns.PlainNumber(questID), ns.PlainNumber(x), ns.PlainNumber(y)
  if not (questID and x and y) or seen[questID] then return end
  seen[questID] = true
  out[#out + 1] = { questID = questID, x = x, y = y, name = (not ns.IsSecret(name) and type(name) == "string") and name or "" }
end

-- Where quests start on a map: its quest lines' starts (hidden ones left out), then the quest spots marked as starts.
function QG.Starts(mapID)
  local out, seen = {}, {}
  for _, l in ipairs(call(C_QuestLine, "GetAvailableQuestLines", mapID) or {}) do
    if l.isHidden ~= true then addStart(out, seen, l.questID, l.x, l.y, l.questName) end
  end
  for _, q in ipairs(call(C_QuestLog, "GetQuestsOnMap", mapID) or {}) do
    if q.isQuestStart == true then addStart(out, seen, q.questID, q.x, q.y, call(C_QuestLog, "GetTitleForQuestID", q.questID)) end
  end
  return out
end

-- Whether Vanguard draws pins on this map: the setting is on, Questie isn't loaded, and the game's own map shows no quest offers.
function QG.DrawsPins(map)
  if not QG.settings.pins or call(C_AddOns, "IsAddOnLoaded", "Questie") == true then return false end
  local offers = map.GetNumActivePinsByTemplate and ns.PlainNumber(map:GetNumActivePinsByTemplate("QuestOfferPinTemplate")) or 0
  return offers == 0
end

-- Pins -------------------------------------------------------------------------------------------

-- The pin's tooltip: the quest's name and what a click does.
function QG.PinTooltip(pin)
  local tip = GameTooltip
  if not tip or not pin.start then return end
  tip:SetOwner(pin, "ANCHOR_RIGHT")
  tip:SetText(pin.start.name ~= "" and pin.start.name or "Quest start")
  tip:AddLine(T.Paint("Quest starts here. Click: point the arrow here", "text2"))
  tip:Show()
end

-- A click on a pin: a map waypoint on it, which the arrow points at.
function QG.OnPin(pin)
  if ns.GetModule("Waypoints").Set(pin.mapID, pin.start.x, pin.start.y) then ns.Chat("Arrow: " .. (pin.start.name ~= "" and pin.start.name or "quest start") .. ".") end
end

-- A pin on the map's canvas: the game's quest-start "!" on a small inset square.
local function makePin(canvas)
  local p = T.Panel(CreateFrame("Button", nil, canvas), { inset = true, noSheen = true })
  p:SetSize(QG.PIN, QG.PIN)
  p.icon = QP.Square(p:CreateTexture(nil, "ARTWORK"), QG.PIN - 2)
  p.icon:SetPoint("CENTER")
  p.icon:SetTexture(QP.ICONS.available)
  p:SetScript("OnEnter", QG.PinTooltip)
  p:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  p:SetScript("OnClick", ns.Guard("click quest start pin", QG.OnPin))
  return p
end

-- Puts a pin on the canvas at the start's spot (fractions of the map, from its top left).
local function placePin(p, canvas, mapID, start)
  p.start, p.mapID = start, mapID
  p:ClearAllPoints()
  p:SetPoint("CENTER", canvas, "TOPLEFT", start.x * canvas:GetWidth(), -start.y * canvas:GetHeight())
  p:SetFrameLevel(canvas:GetFrameLevel() + 20)
  p:Show()
end

-- Draws the pins for the map the world map shows (or none: see QG.DrawsPins), at most QG.MAX_PINS.
function QG.RefreshPins()
  local map = _G.WorldMapFrame
  if not (QG.pins and map and map:IsShown()) then return end
  QG.pins.Reset()
  local mapID = ns.PlainNumber(map:GetMapID())
  if not mapID or not QG.DrawsPins(map) then return end
  local canvas = map:GetCanvas()
  for i, start in ipairs(QG.Starts(mapID)) do
    if i <= QG.MAX_PINS then placePin(QG.pins.Next(), canvas, mapID, start) end
  end
end

-- Hooks ------------------------------------------------------------------------------------------

-- The map changed or the client's quest lists did: ask for the map's quest lines, redraw the pins next frame.
function QG.MapChanged()
  local map = _G.WorldMapFrame
  local mapID = map and map:IsShown() and ns.PlainNumber(map:GetMapID())
  if mapID then call(C_QuestLine, "RequestQuestLinesForMap", mapID) end
  ns.Soon("questpins", QG.RefreshPins)
end

-- Follows the world map: its map changes and its showing (hooks run after the game's own).
local function followMap(map)
  if not (map.GetCanvas and map.GetMapID) then return end
  QG.pins = QP.Pool(map:GetCanvas(), makePin)
  if type(map.OnMapChanged) == "function" then hooksecurefunc(map, "OnMapChanged", ns.Guard("hook world map changed", QG.MapChanged)) end
  map:HookScript("OnShow", ns.Guard("hook world map shown", QG.MapChanged))
  for _, event in ipairs({ "QUESTLINE_UPDATE", "QUEST_LOG_UPDATE", "QUEST_POI_UPDATE" }) do ns.On(event, QG.MapChanged) end
end

-- The game's world map has loaded (when it wasn't there at login).
function QG.OnLoaded(_, name)
  if name == "Blizzard_WorldMap" and _G.WorldMapFrame and not QG.pins then followMap(_G.WorldMapFrame) end
end

-- Starts following the world map, now or once it loads.
function QG.EnableMap()
  if _G.WorldMapFrame then followMap(_G.WorldMapFrame) else ns.On("ADDON_LOADED", QG.OnLoaded) end
end
