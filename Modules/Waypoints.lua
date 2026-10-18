-- Waypoints: /way (and /vg way) puts a waypoint on the map and the game's own
-- navigation arrow points at it, the way guides and map sites write them:
--   /way 45.2 61.8                  on the map you're on
--   /way Elwynn Forest 42 65 Inn    a zone by name (any case, or a unique start of it), and a title
--   /way #1429 42 65                a map by its id
--   /way clear                      removes it
-- /way is Vanguard's only while no other addon (TomTom, say) has it; /vg way
-- always works. While the world map is open, a line along its bottom shows
-- your coordinates and the cursor's. The floating pin and distance the game
-- draws over the world for a waypoint or a supertracked quest (SuperTrackedFrame)
-- take Vanguard's pin in the accent and the theme font; a party member's portrait
-- and the corpse's tombstone stay the game's.
--
-- Ctrl-click on the world map puts a waypoint down (the game's own); the game leaves its arrow off for it,
-- so with "Point the arrow at map clicks" on (the default) Vanguard turns the arrow on whenever a waypoint
-- appears. The last eight waypoints are kept (account-wide in this profile): the Game map options list them
-- as buttons, /way recent lists them and /way recent <n> goes back to one. A Clear waypoint button sits on
-- the world map's bottom edge while there is a waypoint, and in the options. The arrow is the game's floating
-- pin, so there is no second arrow; the quest arrow (Modules/QuestArrow.lua) stays for quests.
--
-- Written for WoW Forever: C_Map's user waypoint, UiMapPoint and
-- C_SuperTrack's arrow are in its UI source (1.60.1). Coordinates are map
-- percent, as the game's map shows them.

local ADDON, ns = ...

local T = ns.Theme

local WP = ns.Module("Waypoints", { defaults = { slash = true, mapCoords = true, pin = true, follow = true } })

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

-- How many recent waypoints are kept.
WP.RECENT = 8

-- Remembering waypoints ------------------------------------------------------------------------

-- The game's waypoint as mapID, x and y (0 to 1); nil when there is none or the client won't say.
function WP.Current()
  if not (C_Map.HasUserWaypoint and C_Map.HasUserWaypoint() and C_Map.GetUserWaypoint) then return nil end
  local point, mapID = C_Map.GetUserWaypoint(), nil
  if type(point) ~= "table" or type(point.position) ~= "table" then return nil end
  local x, y = point.position:GetXY()
  x, y, mapID = ns.PlainNumber(x), ns.PlainNumber(y), ns.PlainNumber(point.uiMapID)
  if mapID and x and y then return mapID, x, y end
end

-- Puts a waypoint first among the recent ones (the same spot moves up instead of repeating), keeping WP.RECENT.
function WP.Remember(mapID, x, y)
  local list = WP.settings.recent or {}
  WP.settings.recent = list
  for i = #list, 1, -1 do
    if list[i].map == mapID and math.abs(list[i].x - x) < 0.001 and math.abs(list[i].y - y) < 0.001 then table.remove(list, i) end
  end
  table.insert(list, 1, { map = mapID, x = x, y = y })
  while #list > WP.RECENT do table.remove(list) end
end

-- The game's waypoint changed (a Ctrl-click on the map, /way): remember it and, with the switch on, point the arrow at it.
function WP.OnWaypoint()
  local mapID, x, y = WP.Current()
  if not mapID then return end
  WP.Remember(mapID, x, y)
  if WP.settings.follow and C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(true) end
end

-- "Elwynn Forest 45.2, 61.8" for a remembered waypoint.
function WP.Describe(w)
  return string.format("%s %.1f, %.1f", mapName(w.map), w.x * 100, w.y * 100)
end

-- Goes back to the nth recent waypoint; says why when there is none or the map can't hold one.
function WP.Recall(n)
  local w = (WP.settings.recent or {})[n]
  if not w then return ns.Chat("No recent waypoint " .. n .. ".") end
  if not WP.Set(w.map, w.x, w.y) then return ns.Chat("Can't put a waypoint on " .. mapName(w.map) .. ".") end
  ns.Chat("Waypoint: " .. WP.Describe(w) .. ".")
end

-- Takes the waypoint away and the arrow with it.
function WP.Clear()
  if type(C_Map) == "table" and C_Map.ClearUserWaypoint then C_Map.ClearUserWaypoint() end
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(false) end
end

-- /way recent: the list, or with a number, back to that one.
function WP.RecentCommand(n)
  local list = WP.settings.recent or {}
  if n ~= "" then return WP.Recall(tonumber(n)) end
  if #list == 0 then return ns.Chat("No recent waypoints yet.") end
  for i, w in ipairs(list) do ns.Chat(i .. ". " .. WP.Describe(w)) end
end

-- Whether this client has map waypoints at all.
local function canWaypoint()
  return type(C_Map) == "table" and type(C_Map.SetUserWaypoint) == "function" and type(UiMapPoint) == "table"
end

-- /way and /vg way: "clear", or [zone] x y [title]. The second value from WP.Parse is the reason when it fails.
function WP.Command(rest)
  rest = rest or ""
  if not canWaypoint() then return ns.Chat("This client has no map waypoints.") end
  if rest:lower():match("^%s*clear%s*$") then WP.Clear() return ns.Chat("Waypoint cleared.") end
  local recent = rest:lower():match("^%s*recent%s*(%d*)%s*$")
  if recent then return WP.RecentCommand(recent) end
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

-- The line under the open world map, from where you and the cursor are.
function WP.PaintMapLine()
  WP.mapLine:SetText(WP.MapText(_G.WorldMapFrame))
  WP.clearButton:SetShown(WP.Current() ~= nil)
end

-- Adds the coordinates line along the bottom of the world map.
local function buildMapLine(map)
  local holder = CreateFrame("Frame", "Vanguard_MapCoords", map)
  holder:SetAllPoints(map.ScrollContainer or map)
  WP.mapLine = T.Text(holder:CreateFontString(nil, "OVERLAY"), "small", "text2")
  WP.mapLine:SetPoint("BOTTOM", holder, "BOTTOM", 0, 6)
  WP.clearButton = ns.DialogButton(holder, "Clear waypoint", 110)
  WP.clearButton:SetPoint("BOTTOMRIGHT", holder, "BOTTOMRIGHT", -8, 6)
  WP.clearButton:SetScript("OnClick", ns.Guard("clear waypoint", WP.Clear))
  ns.Every("world map coords", WP.MAP_INTERVAL, WP.PaintMapLine, holder, true)
end

-- The game's world map has loaded (when it wasn't there at login).
function WP.OnLoaded(_, name)
  if name == "Blizzard_WorldMap" and _G.WorldMapFrame and not WP.mapLine then buildMapLine(_G.WorldMapFrame) end
end

-- The floating waypoint pin ---------------------------------------------------------------------
-- The game's SuperTrackedFrame (Blizzard_QuestNavigation/SuperTrackedFrame.xml: Icon, DistanceText) floats
-- over the world for a /way point or a supertracked quest. Its icon takes Vanguard's pin in the accent after
-- each time the game sets its own (SuperTrackedFrameMixin:UpdateIcon, on SUPER_TRACKING_CHANGED), its
-- distance the theme font; the frame's own placing, distance and fading stay the game's.

-- The super-tracking kinds (Enum.SuperTrackingType) whose icon the game fills with something of its own,
-- kept as it is: a party member's portrait and the corpse's tombstone.
WP.OWN_ICONS = { "PartyMember", "Corpse" }

-- Whether the game's pin shows one of WP.OWN_ICONS right now (no when the client can't say).
local function keepsOwnIcon()
  local kinds, get = Enum and Enum.SuperTrackingType, C_SuperTrack and C_SuperTrack.GetHighestPrioritySuperTrackingType
  if type(kinds) ~= "table" or type(get) ~= "function" then return false end
  local kind = get()
  for _, name in ipairs(WP.OWN_ICONS) do
    if not ns.IsSecret(kind) and kind == kinds[name] then return true end
  end
  return false
end

-- Paints Vanguard's pin, in the accent, on the game's waypoint icon (its size stays the game's); an icon the
-- game fills itself is left as it is, untinted. The game sets its pin as an atlas, and a texture set after one
-- keeps the atlas's sub-rectangle, so the pin's whole art is asked for again.
function WP.PaintPin()
  local f = _G.SuperTrackedFrame
  local icon = type(f) == "table" and f.Icon
  if type(icon) ~= "table" or type(icon.SetTexture) ~= "function" then return end
  if keepsOwnIcon() then return T.Tint(icon, "white") end
  icon:SetTexture(T.Icon("Pin"))
  if type(icon.SetTexCoord) == "function" then icon:SetTexCoord(0, 1, 0, 1) end
  T.Tint(icon, "accent")
end

-- Dresses the game's floating pin: the distance in the theme font, the pin painted now and again whenever
-- the game redraws its icon or the theme changes. Nothing without the frame.
local function skinPin()
  local f = _G.SuperTrackedFrame
  if type(f) ~= "table" then return end
  if type(f.DistanceText) == "table" and type(f.DistanceText.SetFont) == "function" then T.Text(f.DistanceText, "world", "text") end
  if type(f.UpdateIcon) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(f, "UpdateIcon", ns.Guard("hook waypoint pin", WP.PaintPin)) end
  T.OnChanged(WP.PaintPin)
  WP.PaintPin()
end

-- Options -------------------------------------------------------------------------------------------

-- get/set for the "follow" switch (also while the module is off) and its default.
local function followSetting()
  return function() return ns.Settings("Waypoints", WP.defaults).follow end,
    function(v) ns.Settings("Waypoints", WP.defaults).follow = v end, WP.defaults.follow
end

-- The recent waypoints as one button each ("Go to ..."), or a line saying there are none.
local function recentRows()
  local rows = {}
  for i, w in ipairs(ns.Settings("Waypoints", WP.defaults).recent or {}) do
    rows[#rows + 1] = { "button", "Go to " .. WP.Describe(w), function() WP.settings = ns.Settings("Waypoints", WP.defaults) WP.Recall(i) end }
  end
  if #rows == 0 then rows[1] = { "text", "No recent waypoints yet. Ctrl-click the world map or use /way to make one." } end
  return rows
end

-- The waypoint card on the Map page.
function WP.Rows()
  local rows = { { "header", "Waypoints" }, { "check", "Point the arrow at a waypoint you Ctrl-click on the map", followSetting() },
    { "button", "Clear waypoint", WP.Clear }, { "header", "Recent waypoints" } }
  for _, row in ipairs(recentRows()) do rows[#rows + 1] = row end
  return rows
end
ns.Options.AddRows("map", WP.Rows)

-- Module entry point (Core/Modules.lua).
function WP.Enable(settings)
  WP.settings = settings
  ns.On("USER_WAYPOINT_UPDATED", WP.OnWaypoint)
  if settings.slash then WP.claimed = claimWay() end
  if settings.pin then skinPin() end
  if not settings.mapCoords then return end
  if _G.WorldMapFrame then buildMapLine(_G.WorldMapFrame) else ns.On("ADDON_LOADED", WP.OnLoaded) end
end
