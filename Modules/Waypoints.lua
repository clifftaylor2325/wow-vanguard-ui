-- Waypoints: /way (and /vg way) puts a waypoint on the map and the game's own
-- navigation arrow points at it, the way guides and map sites write them:
--   /way 45.2 61.8                  on the map you're on
--   /way Elwynn Forest 42 65 Inn    a zone by name (any case, or a unique start of it), and a title
--   /way #1429 42 65                a map by its id
--   /way clear                      removes it
-- /way is Vanguard's only while no other addon (TomTom, say) has it; /vg way
-- always works. While the world map is open, a line along its bottom shows
-- your coordinates and the cursor's.
--
-- Written for WoW Forever: C_Map's user waypoint, UiMapPoint and
-- C_SuperTrack's arrow are in its UI source (1.60.1). Coordinates are map
-- percent, as the game's map shows them.

local ADDON, ns = ...

local T = ns.Theme

local WP = ns.Module("Waypoints", { defaults = { slash = true, mapCoords = true } })

-- Seconds between updates of the world map's coordinates line.
WP.MAP_INTERVAL = 0.1

-- Parsing a /way line -------------------------------------------------------------------------

-- The words of a /way line, commas read as spaces ("45.2, 61.8" and "45,61" both work).
local function words(text)
  local out = {}
  for w in (text or ""):gsub(",", " "):gmatch("%S+") do out[#out + 1] = w end
  return out
end

-- A map percent (0 to 100) from a word, or nil.
local function percent(word)
  local n = tonumber(word)
  return n and n >= 0 and n <= 100 and n or nil
end

-- Where the coordinates start among the words: the first two in a row that
-- are percents; nil when there aren't two.
local function coordsAt(list)
  for i = 1, #list - 1 do
    if percent(list[i]) and percent(list[i + 1]) then return i end
  end
end

-- The map the player is on, or nil.
local function playerMap()
  return C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player")
end

-- The top map above mapID (the world it's in), following parents.
local function rootOf(mapID)
  local info = C_Map.GetMapInfo(mapID)
  while info and info.parentMapID and info.parentMapID > 0 do
    mapID = info.parentMapID
    info = C_Map.GetMapInfo(mapID)
  end
  return mapID
end

-- The map called name in the player's world: the exact name (any case), else
-- the one map whose name starts with it; nil when none or several do.
local function mapNamed(name)
  local here, want, found = playerMap(), name:lower(), nil
  if not here then return nil end
  for _, info in ipairs(C_Map.GetMapChildrenInfo(rootOf(here), nil, true) or {}) do
    local n = info.name:lower()
    if n == want then return info.mapID end
    if n:sub(1, #want) == want then found = found == nil and info.mapID or false end
  end
  return found or nil
end

-- The map a /way line names: "#<id>", a zone name, or (nothing) the player's map.
local function mapFor(zone)
  if zone == "" then return playerMap() end
  local id = zone:match("^#(%d+)$")
  return id and tonumber(id) or mapNamed(zone)
end

-- A /way line as mapID, x and y (0 to 1) and title; nil and the reason when it can't be read.
function WP.Parse(text)
  local list = words(text)
  local at = coordsAt(list)
  if not at then return nil, "give the coordinates as x y, e.g. /way 45.2 61.8" end
  local zone = table.concat(list, " ", 1, at - 1)
  local mapID = mapFor(zone)
  if not mapID then return nil, zone == "" and "the game won't say which map you're on here" or ("no zone called " .. zone) end
  return mapID, percent(list[at]) / 100, percent(list[at + 1]) / 100, table.concat(list, " ", at + 2)
end

-- Setting it --------------------------------------------------------------------------------

-- A map's name, or "map <id>".
local function mapName(mapID)
  local info = C_Map.GetMapInfo and C_Map.GetMapInfo(mapID)
  return info and info.name or ("map " .. mapID)
end

-- Puts the waypoint on mapID at x, y (0 to 1) and points the game's arrow at it; false when that map can't hold one.
function WP.Set(mapID, x, y)
  if not (C_Map.CanSetUserWaypointOnMap and C_Map.CanSetUserWaypointOnMap(mapID)) then return false end
  C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(mapID, x, y))
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(true) end
  return true
end

-- Whether this client has map waypoints at all.
local function canWaypoint()
  return type(C_Map) == "table" and type(C_Map.SetUserWaypoint) == "function" and type(UiMapPoint) == "table"
end

-- /way and /vg way: "clear", or [zone] x y [title]. The second value from WP.Parse is the reason when it fails.
function WP.Command(rest)
  rest = rest or ""
  if not canWaypoint() then return ns.Chat("This client has no map waypoints.") end
  if rest:lower():match("^%s*clear%s*$") then C_Map.ClearUserWaypoint() return ns.Chat("Waypoint cleared.") end
  local mapID, x, y, title = WP.Parse(rest)
  if not mapID then return ns.Chat("Can't set that waypoint: " .. x .. ".") end
  if not WP.Set(mapID, x, y) then return ns.Chat("Can't put a waypoint on " .. mapName(mapID) .. ".") end
  local named = title ~= "" and (" (" .. title .. ")") or ""
  ns.Chat(string.format("Waypoint: %s %.1f, %.1f%s.", mapName(mapID), x * 100, y * 100, named))
end

-- Takes /way unless another addon (TomTom) has it; true when it did.
local function claimWay()
  local loaded = C_AddOns and C_AddOns.IsAddOnLoaded
  if (hash_SlashCmdList and hash_SlashCmdList["/WAY"]) or (loaded and loaded("TomTom")) then return false end
  SLASH_VANGUARDWAY1 = "/way"
  SlashCmdList.VANGUARDWAY = WP.Command
  return true
end

-- The world map's coordinates line -----------------------------------------------------------

-- The cursor's spot on the map as "x, y" in map percent, or "" when it isn't over the map.
local function cursorText(map)
  local scroll = map.ScrollContainer
  if not (scroll and scroll.GetNormalizedCursorPosition) then return "" end
  local x, y = scroll:GetNormalizedCursorPosition()
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  if not (x and y) or x < 0 or x > 1 or y < 0 or y > 1 then return "" end
  return string.format("%.1f, %.1f", x * 100, y * 100)
end

-- "You 45.2, 61.8     Cursor 40.0, 52.3" for the map shown; a part the client won't say is left out.
function WP.MapText(map)
  local mapID = map.GetMapID and map:GetMapID()
  local you = mapID and ns.GetModule("Minimap").CoordsText(mapID) or ""
  local cursor, parts = cursorText(map), {}
  if you ~= "" then parts[#parts + 1] = "You " .. you end
  if cursor ~= "" then parts[#parts + 1] = "Cursor " .. cursor end
  return table.concat(parts, "     ")
end

-- Every frame while the world map is open (the line's frame hides with it): the line, at most every MAP_INTERVAL.
function WP.OnMapUpdate(_, elapsed)
  WP.wait = (WP.wait or 0) - elapsed
  if WP.wait > 0 then return end
  WP.wait = WP.MAP_INTERVAL
  WP.mapLine:SetText(WP.MapText(_G.WorldMapFrame))
end

-- Adds the coordinates line along the bottom of the world map.
local function buildMapLine(map)
  local holder = CreateFrame("Frame", "Vanguard_MapCoords", map)
  holder:SetAllPoints(map.ScrollContainer or map)
  WP.mapLine = T.Text(holder:CreateFontString(nil, "OVERLAY"), "small", "text2")
  WP.mapLine:SetPoint("BOTTOM", holder, "BOTTOM", 0, 6)
  holder:SetScript("OnUpdate", WP.OnMapUpdate)
end

-- The game's world map has loaded (when it wasn't there at login).
function WP.OnLoaded(_, name)
  if name == "Blizzard_WorldMap" and _G.WorldMapFrame and not WP.mapLine then buildMapLine(_G.WorldMapFrame) end
end

-- Module entry point (Core/Modules.lua).
function WP.Enable(settings)
  WP.settings = settings
  if settings.slash then WP.claimed = claimWay() end
  if not settings.mapCoords then return end
  if _G.WorldMapFrame then buildMapLine(_G.WorldMapFrame) else ns.On("ADDON_LOADED", WP.OnLoaded) end
end
