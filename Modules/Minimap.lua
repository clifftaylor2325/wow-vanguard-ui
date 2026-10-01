-- Minimap: square, in a themed frame you can move in unlock mode, with the
-- zone name along its top edge (colored by PvP status), coordinates along the bottom
-- and mouse-wheel zoom. The round border art and zoom buttons are faded
-- out (alpha only; nothing Blizzard owns is hidden or unregistered). The
-- game's small minimap buttons (tracking, mail, dungeon difficulty, the addon
-- compartment) move from the old minimap spot onto this map's corners.

local ADDON, ns = ...

local T = ns.Theme

local MM = ns.Module("Minimap", {
  defaults = { size = 180, coords = true, icons = true },
})

-- The game's minimap buttons this map takes onto its corners: where to find
-- each (newer client path first) and which corner it sits in.
MM.LEFTOVERS = {
  { paths = { { "MinimapCluster", "Tracking" }, { "MiniMapTracking" } }, point = "BOTTOMLEFT", x = 2, y = 2 },
  { paths = { { "MinimapCluster", "IndicatorFrame", "MailFrame" }, { "MiniMapMailFrame" } }, point = "TOPRIGHT", x = -2, y = -2 },
  { paths = { { "MinimapCluster", "InstanceDifficulty" }, { "MiniMapInstanceDifficulty" } }, point = "TOPLEFT", x = 2, y = -2 },
  { paths = { { "AddonCompartmentFrame" } }, point = "BOTTOMRIGHT", x = -2, y = 2 },
}
MM.ICON_SCALE = 0.85
-- The accent diamonds on the map's corners (UI units across).
MM.CORNER = 8

-- Zone text color tokens by PvP type (GetZonePVPInfo); gold otherwise.
local ZONE_COLORS = {
  sanctuary = "zoneSanctuary", friendly = "zoneFriendly", hostile = "zoneHostile",
  contested = "zoneContested", combat = "zoneHostile",
}

-- Minimap art this module fades out, by path under the global table.
local FADE = {
  { "MinimapCompassTexture" },
  { "MinimapCluster", "BorderTop" },
  { "MinimapCluster", "ZoneTextButton" },
  { "Minimap", "ZoomIn" },
  { "Minimap", "ZoomOut" },
  { "MinimapBackdrop" },
}

-- Addons that place icons around the minimap (LibDBIcon and others) ask
-- this global for its shape; ForeverUI's minimap is square.
function GetMinimapShape()
  return "SQUARE"
end

-- The object at a path under the global table, or nil.
local function lookup(path)
  local obj = _G
  for _, key in ipairs(path) do
    obj = type(obj) == "table" and obj[key] or nil
  end
  return obj
end

-- Fades every listed art piece this client has.
local function fadeArt()
  for _, path in ipairs(FADE) do
    local obj = lookup(path)
    if type(obj) == "table" and obj.SetAlpha then
      obj:SetAlpha(0)
    end
  end
end

-- The first of several paths this client has, or nil.
local function first(paths)
  for _, path in ipairs(paths) do
    local obj = lookup(path)
    if type(obj) == "table" and obj.SetPoint then return obj end
  end
end

-- Pins one of the game's minimap buttons to a corner of the map (it stays
-- there when the game lays out its old minimap spot again).
local function placeLeftover(spec)
  local obj = first(spec.paths)
  if not obj then return end
  ns.Pin(obj, function(f)
    f:SetParent(MM.overlay)
    f:SetScale(MM.ICON_SCALE)
    f:ClearAllPoints()
    f:SetPoint(spec.point, MM.overlay, spec.point, spec.x, spec.y)
  end)
end

-- Zone and coordinates -------------------------------------------------------------------

-- Sets the zone text and its PvP color.
function MM.UpdateZone()
  local zone = GetMinimapZoneText and GetMinimapZoneText() or ""
  local pvp = GetZonePVPInfo and GetZonePVPInfo()
  MM.zone:SetText(zone)
  T.Color(MM.zone, ZONE_COLORS[pvp] or "gold")
end

-- "x, y" in map percent, or "" where the client won't say (instances, secrets).
function MM.CoordsText()
  local mapID = C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player")
  local pos = mapID and C_Map.GetPlayerMapPosition(mapID, "player")
  if not pos or not pos.GetXY then
    return ""
  end
  local x, y = pos:GetXY()
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  return x and y and string.format("%.1f, %.1f", x * 100, y * 100) or ""
end

-- Refreshes the coordinates at most five times a second.
local function coordsTicker(frame)
  local elapsed = 0
  frame:SetScript("OnUpdate", function(_, dt)
    elapsed = elapsed + dt
    if elapsed >= 0.2 then
      elapsed = 0
      MM.coords:SetText(MM.CoordsText())
    end
  end)
end

-- Mouse wheel zooms in and out.
local function onWheel(_, delta)
  local zoom = Minimap:GetZoom() + (delta > 0 and 1 or -1)
  Minimap:SetZoom(math.max(0, math.min(Minimap:GetZoomLevels() - 1, zoom)))
end

-- Building -------------------------------------------------------------------------------

-- The themed holder the minimap moves into.
local function createHolder(size)
  local holder = CreateFrame("Frame", "ForeverUI_Minimap", UIParent)
  holder:SetSize(size + 2, size + 2)
  T.HudPanel(holder)
  ns.Mover(holder, "minimap", "Minimap", { "TOPRIGHT", "TOPRIGHT", -12, -12 })
  return holder
end

-- Moves the minimap into the holder, square and sized.
local function adoptMinimap(holder, size)
  Minimap:SetParent(holder)
  Minimap:ClearAllPoints()
  Minimap:SetPoint("CENTER", holder, "CENTER")
  Minimap:SetSize(size, size)
  Minimap:SetMaskTexture(T.WHITE)
  Minimap:EnableMouseWheel(true)
  Minimap:SetScript("OnMouseWheel", onWheel)
end

-- Zone text along the map's top edge and coordinates along its bottom edge
-- (inside, so a map in a screen corner never pushes them off screen). They
-- live on an overlay frame above the map; on the holder the map would cover them.
local function addTexts(holder)
  local overlay = CreateFrame("Frame", nil, holder)
  MM.overlay = overlay
  overlay:SetAllPoints()
  overlay:SetFrameLevel((Minimap:GetFrameLevel() or 1) + 2)
  MM.zone = T.Text(overlay:CreateFontString(nil, "OVERLAY"), "label", false)
  MM.zone:SetPoint("TOP", overlay, "TOP", 0, -6)
  MM.coords = T.Text(overlay:CreateFontString(nil, "OVERLAY"), "small")
  MM.coords:SetPoint("BOTTOM", overlay, "BOTTOM", 0, 4)
  T.Color(MM.coords, "text")
end

-- Tints the corner diamonds in the accent (again after every theme change).
local function paintCorners()
  for _, d in ipairs(MM.corners) do T.Tint(d, "accent") end
end

-- One accent diamond centered on a corner of the map's overlay, under the
-- game buttons that sit in that corner.
local function cornerMark(overlay, point)
  local d = T.Snap(overlay:CreateTexture(nil, "ARTWORK"))
  d:SetTexture(T.Texture("Diamond"))
  d:SetSize(MM.CORNER, MM.CORNER)
  d:SetPoint("CENTER", overlay, point)
  return d
end

-- The four corner diamonds; they follow the accent live.
local function addCorners(overlay)
  MM.corners = {}
  for _, point in ipairs({ "TOPLEFT", "TOPRIGHT", "BOTTOMLEFT", "BOTTOMRIGHT" }) do MM.corners[#MM.corners + 1] = cornerMark(overlay, point) end
  paintCorners()
  T.OnChanged(paintCorners)
end

-- Builds the minimap frame. Out of combat, since it moves Blizzard frames.
local function build(settings)
  local holder = createHolder(settings.size)
  adoptMinimap(holder, settings.size)
  addTexts(holder)
  addCorners(MM.overlay)
  fadeArt()
  if settings.icons then for _, spec in ipairs(MM.LEFTOVERS) do placeLeftover(spec) end end
  if settings.coords then coordsTicker(holder) end
  MM.UpdateZone()
end

-- Module entry point (Core/Modules.lua).
function MM.Enable(settings)
  ns.OutOfCombat(function() build(settings) end)
  for _, event in ipairs({ "ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA", "PLAYER_ENTERING_WORLD" }) do
    ns.On(event, function() if MM.zone then MM.UpdateZone() end end)
  end
end
