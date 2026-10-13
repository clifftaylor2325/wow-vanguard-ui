-- Minimap: square, in a themed frame you can move in unlock mode, with the
-- zone name in the heading font on a see-through band along its top edge
-- (colored by PvP status; hover it for the zone's territory, click it for the
-- world map), the coordinates on a band along its bottom between the tracking
-- and addon slot buttons, accent rules inside both bands, and mouse-wheel zoom. The round
-- border art and zoom buttons are faded out (alpha only), and the game's
-- emptied cluster frame stops taking the mouse and loses its zone button.
-- Nothing is unregistered. The game's small minimap buttons (tracking, mail,
-- dungeon difficulty, the addon compartment) move from the old minimap spot
-- onto this map's corners.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgGlyph = ns.FrameState("vgGlyph")
local vgHover = ns.FrameState("vgHover")
local vgSlot = ns.FrameState("vgSlot")

local T = ns.Theme

local MM = ns.Module("Minimap", {
  defaults = { size = 180, coords = true, icons = true },
})

-- The game's minimap buttons this map takes onto its corners: where to find
-- each (newer client path first) and which corner it sits in. The two you
-- click for a menu (tracking, the addon compartment) become slot buttons on
-- the bottom band with the theme's icon (slot); the others are indicators.
MM.LEFTOVERS = {
  { paths = { { "MinimapCluster", "Tracking" }, { "MiniMapTracking" } }, point = "BOTTOMLEFT", x = 3, y = 3, slot = "MinimapTracking" },
  { paths = { { "MinimapCluster", "IndicatorFrame", "MailFrame" }, { "MiniMapMailFrame" } }, point = "TOPRIGHT", x = -2, y = -2 },
  { paths = { { "MinimapCluster", "InstanceDifficulty" }, { "MiniMapInstanceDifficulty" } }, point = "TOPLEFT", x = 2, y = -2 },
  { paths = { { "AddonCompartmentFrame" } }, point = "BOTTOMRIGHT", x = -3, y = 3, slot = "MinimapAddons" },
  -- The group finder eye (shown while you're queued), smaller, just above the compartment.
  { paths = { { "QueueStatusButton" } }, point = "BOTTOMRIGHT", x = -2, y = 42, scale = 0.6 },
}
-- A slot button on the map (UI units square), and its icon.
MM.BUTTON, MM.GLYPH = 18, 12
-- Minimap buttons that have nothing to show here (vanilla content has no expansion page): put away.
MM.HIDE = { "ExpansionLandingPageMinimapButton" }
MM.ICON_SCALE = 0.85
-- The accent diamonds on the map's corners (UI units across).
MM.CORNER = 8
-- The bands along the map's top and bottom edges (UI units high), and how
-- solid they are over the map.
MM.BAND = { top = 20, bottom = 24 }
MM.BAND_ALPHA = 0.7
-- Room kept clear of the zone name on each side, for the buttons in the top corners.
MM.ZONE_INSET = 28

-- Zone text color tokens by PvP type (GetZonePVPInfo); gold otherwise.
local ZONE_COLORS = {
  sanctuary = "zoneSanctuary", friendly = "zoneFriendly", hostile = "zoneHostile",
  contested = "zoneContested", combat = "zoneHostile",
}

-- What the zone tooltip says of each PvP type.
local PVP_WORDS = {
  sanctuary = "Sanctuary", friendly = "Friendly territory", hostile = "Hostile territory",
  contested = "Contested territory", combat = "Combat zone",
}

-- Minimap art this module fades out, by path under the global table.
local FADE = {
  { "MinimapCompassTexture" },
  { "MinimapCluster", "BorderTop" },
  { "Minimap", "ZoomIn" },
  { "Minimap", "ZoomOut" },
  { "MinimapBackdrop" },
}

-- Addons that place icons around the minimap (LibDBIcon and others) ask
-- this global for its shape; Vanguard's minimap is square.
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

-- The game's cluster frame at the old top-right spot has nothing left to show:
-- it takes no mouse (it ate clicks there, and Edit Mode drew a handle on the
-- empty frame), and its zone button is hidden (faded, it stayed clickable).
local function quietCluster()
  local cluster = _G.MinimapCluster
  if type(cluster) ~= "table" then return end
  cluster:EnableMouse(false)
  local button = cluster.ZoneTextButton
  if type(button) == "table" and button.Hide then button:Hide() end
end

-- The first of several paths this client has, or nil.
local function first(paths)
  for _, path in ipairs(paths) do
    local obj = lookup(path)
    if type(obj) == "table" and obj.SetPoint then return obj end
  end
end

-- Slot buttons -----------------------------------------------------------------------------

-- The part of a minimap button the mouse clicks: the tracking frame's own button (by key on newer
-- clients, $parentButton on older ones), else the frame itself.
local function clickable(obj)
  local name = obj.GetName and obj:GetName()
  local b = obj.Button or (name and _G[name .. "Button"])
  return type(b) == "table" and b.HookScript and b or obj
end

-- Paints a slot button's icon: the accent while the mouse is over it, else the text color.
local function paintGlyph(obj)
  T.Tint(vgGlyph[obj], vgHover[obj] and "accent" or "text")
end

-- The slot's accent edge and the icon follow the mouse, as on the menu bar's buttons.
local function slotStates(obj, b)
  b:HookScript("OnEnter", function() vgHover[obj] = true T.SlotState(vgSlot[obj], "hover") paintGlyph(obj) end)
  b:HookScript("OnLeave", function() vgHover[obj] = false T.SlotState(vgSlot[obj], nil) paintGlyph(obj) end)
  b:HookScript("OnMouseDown", function() T.SlotState(vgSlot[obj], "pressed") end)
  b:HookScript("OnMouseUp", function() T.SlotState(vgSlot[obj], vgHover[obj] and "hover" or nil) end)
end

-- The slot tile (a level under the button, so the game's count text draws over it) and the icon on it, made once.
local function addSlot(obj, icon)
  vgSlot[obj] = T.Slot(CreateFrame("Frame", nil, obj))
  vgSlot[obj]:SetAllPoints(obj)
  vgSlot[obj]:SetFrameLevel(math.max(0, obj:GetFrameLevel() - 1))
  vgGlyph[obj] = T.Snap(vgSlot[obj]:CreateTexture(nil, "OVERLAY"))
  vgGlyph[obj]:SetTexture(T.Icon(icon))
  vgGlyph[obj]:SetSize(MM.GLYPH, MM.GLYPH)
  vgGlyph[obj]:SetPoint("CENTER")
  paintGlyph(obj)
  T.OnChanged(function() paintGlyph(obj) end)
end

-- The addon compartment's count of addons, faded out: the icon says what the button is, and the
-- count hung off the slot's corner (its tooltip and menu still list the addons).
local function hideCount(obj)
  if type(obj.Text) == "table" and obj.Text.SetAlpha then obj.Text:SetAlpha(0) end
end

-- One of the game's minimap buttons as a slot button like the menu bar's: MM.BUTTON square, the
-- game's art and the compartment's count faded (again whenever the game places it), its click area filling the slot, the theme's icon on it.
-- side (default MM.BUTTON) sets another size, for the info strip's calendar button.
function MM.SlotButton(obj, icon, side)
  local b = clickable(obj)
  obj:SetSize(side or MM.BUTTON, side or MM.BUTTON)
  T.FadeRegions(obj)
  if b ~= obj then T.FadeRegions(b) b:ClearAllPoints() b:SetAllPoints(obj) end
  hideCount(obj)
  if vgSlot[obj] then return end
  addSlot(obj, icon)
  slotStates(obj, b)
end

-- Pins one of the game's minimap buttons to a corner of the map (it stays
-- there when the game lays out its old minimap spot again).
local function placeLeftover(spec)
  local obj = first(spec.paths)
  if not obj then return end
  ns.Pin(obj, function(f)
    f:SetParent(MM.overlay)
    f:SetScale(spec.slot and 1 or spec.scale or MM.ICON_SCALE)
    f:ClearAllPoints()
    f:SetPoint(spec.point, MM.overlay, spec.point, spec.x, spec.y)
    if spec.slot then MM.SlotButton(f, spec.slot) end
  end)
end

-- Moves the game's minimap buttons onto the map's corners and puts away the ones with nothing to show.
local function placeLeftovers()
  for _, spec in ipairs(MM.LEFTOVERS) do placeLeftover(spec) end
  for _, name in ipairs(MM.HIDE) do ns.GetModule("UnitFrames").HideBlizzard(name) end
end

-- The game's minimap buttons ask their parent to lay them out again (the mail
-- icon does when mail arrives); on the map's overlay there's nothing to lay out.
function MM.NoLayout() end

-- Zone and coordinates -------------------------------------------------------------------

-- The zone's PvP type ("sanctuary", "contested"...): C_PvP's answer where the
-- client has it (WoW Forever), else the older global; nil when hidden or missing.
local function zonePvP()
  local get = (C_PvP and C_PvP.GetZonePVPInfo) or GetZonePVPInfo
  if type(get) ~= "function" then return nil end
  local pvp = get()
  if ns.IsSecret(pvp) then return nil end
  return pvp
end

-- Sets the zone text and its PvP color.
function MM.UpdateZone()
  local zone = GetMinimapZoneText and GetMinimapZoneText() or ""
  local pvp = zonePvP()
  MM.zone:SetText(zone)
  T.Color(MM.zone, ZONE_COLORS[pvp] or "gold")
end

-- r, g, b of a named color (no alpha, so it can end a tooltip line's arguments).
local function rgb(name)
  local r, g, b = T.RGB(name)
  return r, g, b
end

-- Fills the tooltip for the zone band: the zone, its subzone when it has
-- one, and whose territory it is, in the zone text's color.
local function zoneTooltip(button)
  local zone = GetZoneText and GetZoneText() or ""
  local sub, pvp = GetSubZoneText and GetSubZoneText() or "", zonePvP()
  if zone == "" then zone = GetMinimapZoneText and GetMinimapZoneText() or "" end
  GameTooltip:SetOwner(button, "ANCHOR_LEFT")
  GameTooltip:SetText(zone, rgb("text"))
  if sub ~= "" and sub ~= zone then GameTooltip:AddLine(sub, rgb("text2")) end
  if PVP_WORDS[pvp] then GameTooltip:AddLine(PVP_WORDS[pvp], rgb(ZONE_COLORS[pvp])) end
  GameTooltip:Show()
end

-- The map the player is on, or nil.
local function playerMap()
  return C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player")
end

-- "x, y" in map percent on mapID (default: the player's map), or "" where the
-- client won't say (instances, secrets).
function MM.CoordsText(mapID)
  mapID = mapID or playerMap()
  local pos = mapID and C_Map.GetPlayerMapPosition(mapID, "player")
  if not pos or not pos.GetXY then
    return ""
  end
  local x, y = pos:GetXY()
  x, y = ns.PlainNumber(x), ns.PlainNumber(y)
  return x and y and string.format("%.1f, %.1f", x * 100, y * 100) or ""
end

-- Where the coordinates were last read: plain world x and y, continent and map.
local lastSpot = {}

-- Whether the player stands where the coordinates were last read (same map,
-- same plain world position), so the text already shown still holds; notes the spot.
local function unmoved(mapID)
  local x, y, _, instance
  if type(UnitPosition) == "function" then x, y, _, instance = UnitPosition("player") end
  x, y, instance, mapID = ns.PlainNumber(x), ns.PlainNumber(y), ns.PlainNumber(instance), ns.PlainNumber(mapID)
  local same = x ~= nil and y ~= nil and x == lastSpot[1] and y == lastSpot[2] and instance == lastSpot[3] and mapID == lastSpot[4]
  lastSpot[1], lastSpot[2], lastSpot[3], lastSpot[4] = x, y, instance, mapID
  return same
end

-- Refreshes the coordinates at most five times a second, and only after the
-- player moved: standing still asks the client for no new map position.
local function coordsTicker(frame)
  ns.Every("minimap coords", 0.2, function()
    local mapID = playerMap()
    if not unmoved(mapID) then MM.coords:SetText(MM.CoordsText(mapID)) end
  end, frame)
end

-- Mouse wheel zooms in and out.
local function onWheel(_, delta)
  local zoom = Minimap:GetZoom() + (delta > 0 and 1 or -1)
  Minimap:SetZoom(math.max(0, math.min(Minimap:GetZoomLevels() - 1, zoom)))
end

-- The wheel over the map zooms: by the game's own handler when the map has one,
-- else by Vanguard's, hooked on (a script set on the game's frame would replace the game's).
local function wheelZoom()
  Minimap:EnableMouseWheel(true)
  if Minimap:GetScript("OnMouseWheel") then return end
  Minimap:HookScript("OnMouseWheel", onWheel)
end

-- Building -------------------------------------------------------------------------------

-- The themed holder the minimap moves into.
local function createHolder(size)
  local holder = CreateFrame("Frame", "Vanguard_Minimap", UIParent)
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
  wheelZoom()
end

-- The overlay frame above the map that holds the bands, the texts, the
-- corner marks and the game's buttons; on the holder the map would cover them.
local function createOverlay(holder)
  local overlay = CreateFrame("Frame", nil, holder)
  MM.overlay = overlay
  overlay.Layout = MM.NoLayout
  overlay:SetAllPoints()
  overlay:SetFrameLevel((Minimap:GetFrameLevel() or 1) + 2)
  return overlay
end

-- A see-through strip across the top or bottom edge of the map, so the text
-- on it stays readable over bright ground.
local function band(overlay, point, height)
  local t = T.Snap(overlay:CreateTexture(nil, "BACKGROUND"))
  t:SetPoint(point .. "LEFT", overlay, point .. "LEFT")
  t:SetPoint(point .. "RIGHT", overlay, point .. "RIGHT")
  t:SetHeight(height)
  MM.bands[#MM.bands + 1] = t
  return t
end

-- Paints the bands in the panel color, see-through (again after every theme change).
local function paintBands()
  local r, g, b = T.PanelColor()
  for _, t in ipairs(MM.bands) do t:SetColorTexture(r, g, b, MM.BAND_ALPHA) end
end

-- A one-pixel accent rule along a band's inner edge (side: the band's edge it runs along).
local function rule(overlay, bandTexture, side)
  local t = T.Snap(overlay:CreateTexture(nil, "BORDER"))
  t:SetPoint(side .. "LEFT", bandTexture, side .. "LEFT")
  t:SetPoint(side .. "RIGHT", bandTexture, side .. "RIGHT")
  t:SetHeight(T.Pixel(overlay))
  return t
end

-- Paints the bands in the panel color, see-through, and their rules in the accent (again after every theme change).
local function paintChrome()
  paintBands()
  for _, t in ipairs(MM.rules) do T.Tint(t, "accent") end
end

-- The bands along the map's top and bottom edges (the bottom one, which holds
-- the coordinates and the slot buttons, only with coordinates on), each with an
-- accent rule on its inner edge; they follow the panel color and accent live.
local function addBands(overlay, settings)
  MM.bands = {}
  MM.top = band(overlay, "TOP", MM.BAND.top)
  MM.bottom = band(overlay, "BOTTOM", MM.BAND.bottom)
  MM.bottom:SetShown(settings.coords ~= false)
  MM.rules = { rule(overlay, MM.top, "BOTTOM"), rule(overlay, MM.bottom, "TOP") }
  MM.rules[2]:SetShown(settings.coords ~= false)
  paintChrome()
  T.OnChanged(paintChrome)
end

-- The zone name centered on the top band in the heading font (the faction
-- look's, as on window titles), kept to the room between the
-- corner buttons (a long name is cut short rather than run under them), and
-- the coordinates centered on the bottom band (inside the map, so a map in a
-- screen corner never pushes them off screen).
local function addTexts(overlay, size)
  MM.zone = T.Text(overlay:CreateFontString(nil, "OVERLAY"), "heading", false)
  MM.zone:SetPoint("CENTER", MM.top, "CENTER")
  MM.zone:SetWidth(size - 2 * MM.ZONE_INSET)
  MM.zone:SetWordWrap(false)
  MM.coords = T.Text(overlay:CreateFontString(nil, "OVERLAY"), "small")
  MM.coords:SetPoint("CENTER", MM.bottom, "CENTER")
  T.Color(MM.coords, "text")
end

-- The zone name takes the mouse: a click opens (or closes) the world map,
-- hovering names the zone and its territory, and the wheel still zooms. It
-- stops short of the top corners, so the buttons there keep their clicks.
local function zoneButton(overlay)
  local b = CreateFrame("Button", "Vanguard_MinimapZone", overlay)
  b:SetPoint("TOPLEFT", overlay, "TOPLEFT", MM.ZONE_INSET, 0)
  b:SetPoint("TOPRIGHT", overlay, "TOPRIGHT", -MM.ZONE_INSET, 0)
  b:SetHeight(MM.BAND.top)
  b:SetScript("OnClick", ns.Guard("click minimap world map", function() if type(ToggleWorldMap) == "function" then ToggleWorldMap() end end))
  b:SetScript("OnEnter", zoneTooltip)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  b:EnableMouseWheel(true)
  b:SetScript("OnMouseWheel", onWheel)
  MM.zoneButton = b
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

-- Dresses the overlay: the bands, the texts on them, the zone button and the corner marks.
local function dress(overlay, settings)
  addBands(overlay, settings)
  addTexts(overlay, settings.size)
  zoneButton(overlay)
  addCorners(overlay)
end

-- Builds the minimap frame. Out of combat, since it moves Blizzard frames.
local function build(settings)
  local holder = createHolder(settings.size)
  adoptMinimap(holder, settings.size)
  dress(createOverlay(holder), settings)
  fadeArt()
  quietCluster()
  if settings.icons then placeLeftovers() end
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
