-- Minimap: square, in a themed frame you can move in unlock mode, with the
-- zone name along its top edge (colored by PvP status), coordinates along the bottom
-- and mouse-wheel zoom. The round border art and zoom buttons are faded
-- out (alpha only; nothing Blizzard owns is hidden or unregistered).

local ADDON, ns = ...

local T = ns.Theme

local MM = ns.Module("Minimap", {
  defaults = { size = 180, coords = true },
})

-- Zone text colors by PvP type (GetZonePVPInfo).
local ZONE_COLORS = {
  sanctuary = { 0.41, 0.8, 0.94 },
  friendly = { 0.1, 1, 0.1 },
  hostile = { 1, 0.1, 0.1 },
  contested = { 1, 0.7, 0 },
  combat = { 1, 0.1, 0.1 },
}
local DEFAULT_ZONE_COLOR = { 1, 0.82, 0 }

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

-- Zone and coordinates -------------------------------------------------------------------

-- Sets the zone text and its PvP color.
function MM.UpdateZone()
  local zone = GetMinimapZoneText and GetMinimapZoneText() or ""
  local pvp = GetZonePVPInfo and GetZonePVPInfo()
  local c = ZONE_COLORS[pvp] or DEFAULT_ZONE_COLOR
  MM.zone:SetText(zone)
  MM.zone:SetTextColor(c[1], c[2], c[3])
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
  T.Panel(holder)
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
  overlay:SetAllPoints()
  overlay:SetFrameLevel((Minimap:GetFrameLevel() or 1) + 2)
  MM.zone = T.SetFont(overlay:CreateFontString(nil, "OVERLAY"), 12)
  MM.zone:SetPoint("TOP", overlay, "TOP", 0, -6)
  MM.coords = T.SetFont(overlay:CreateFontString(nil, "OVERLAY"), 11)
  MM.coords:SetPoint("BOTTOM", overlay, "BOTTOM", 0, 4)
  MM.coords:SetTextColor(1, 1, 1)
end

-- Builds the minimap frame. Out of combat, since it moves Blizzard frames.
local function build(settings)
  local holder = createHolder(settings.size)
  adoptMinimap(holder, settings.size)
  addTexts(holder)
  fadeArt()
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
