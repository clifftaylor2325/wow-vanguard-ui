-- Minimap: square (or round: Minimap shape), in a themed frame you can move in unlock mode, with the
-- zone name in the zone text role on a see-through band along its top edge
-- (colored by PvP status; hover it for the zone's territory, click it for the
-- world map), the coordinates on a band along its bottom between the tracking
-- and addon slot buttons, accent rules inside both bands, and mouse-wheel zoom. The round
-- border art and zoom buttons are faded out (the zoom buttons take no mouse either), and the game's
-- emptied cluster frame stops taking the mouse and loses its zone button.
-- Nothing is unregistered. The game's small minimap buttons (tracking, mail,
-- dungeon difficulty, the addon compartment) move from the old minimap spot
-- onto this map's corners. A round map is masked to a disc with an outline over its edge; the bands are
-- masked to it, the corner diamonds are left off and the buttons sit on the rim.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgGlyph = ns.FrameState("vgGlyph")
local vgHover = ns.FrameState("vgHover")
local vgSlot = ns.FrameState("vgSlot")

local T = ns.Theme

local MM = ns.Module("Minimap", {
  defaults = { size = 180, coords = true, icons = true, shape = "auto" },
})

-- The game's minimap buttons this map takes onto its corners: where to find
-- each (a path of keys from the global table) and which corner it sits in. The two you
-- click for a menu (tracking, the addon compartment) become slot buttons on
-- the bottom band with the theme's icon (slot); the others are indicators.
-- On a round map `angle` (degrees, anticlockwise from three o'clock) puts it on the rim instead.
MM.LEFTOVERS = {
  { paths = { { "MinimapCluster", "Tracking" } }, point = "BOTTOMLEFT", x = 3, y = 3, slot = "MinimapTracking", angle = 225 },
  { paths = { { "MinimapCluster", "IndicatorFrame", "MailFrame" } }, point = "TOPRIGHT", x = -2, y = -2, angle = 45 },
  { paths = { { "MinimapCluster", "InstanceDifficulty" } }, point = "TOPLEFT", x = 2, y = -2, angle = 135 },
  { paths = { { "AddonCompartmentFrame" } }, point = "BOTTOMRIGHT", x = -3, y = 3, slot = "MinimapAddons", angle = 315 },
  -- The group finder eye (shown while you're queued), smaller, just above the compartment.
  { paths = { { "QueueStatusButton" } }, point = "BOTTOMRIGHT", x = -2, y = 42, scale = 0.6, angle = 345 },
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
-- How far in from a round map's edge the buttons' centres sit (UI units): half a slot button's
-- diagonal and a little more, so a whole button stays inside the outline.
MM.RIM_INSET = 15

-- Zone text color tokens by PvP type (GetZonePVPInfo); gold otherwise.
local ZONE_COLORS = {
  sanctuary = "zoneSanctuary", friendly = "zoneFriendly", hostile = "zoneHostile",
  contested = "zoneContested", combat = "zoneHostile", arena = "zoneHostile",
}

-- What the zone tooltip says of each PvP type.
local PVP_WORDS = {
  sanctuary = "Sanctuary", friendly = "Friendly territory", hostile = "Hostile territory",
  contested = "Contested territory", combat = "Combat zone", arena = "Free-for-all territory",
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
-- this global for its shape; Vanguard's minimap is square unless it is built round.
function GetMinimapShape()
  return MM.round and "ROUND" or "SQUARE"
end

-- Whether the map is built round: the Minimap shape setting says "round", or says "auto" (the
-- default) and the theme variant asks for it (Classic look).
function MM.IsRound(settings)
  if settings.shape == "round" then return true end
  return settings.shape ~= "square" and (T.Variant() or {}).minimapRound == true
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

-- The zoom buttons, faded with the art, take no mouse either: the game shows them over the map's corner
-- while the mouse is over the map, and faded they still took clicks. The wheel still zooms
-- (Minimap_ZoomIn clicks them from code, which needs no mouse; a disabled button wouldn't click).
local function quietZoom()
  for _, key in ipairs({ "ZoomIn", "ZoomOut" }) do
    local b = Minimap[key]
    if type(b) == "table" and b.EnableMouse then b:EnableMouse(false) end
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

-- The game's tracking and compartment buttons put their round art back on hover, press and while the
-- menu is open (OnButtonStateChanged sets AddTexture's alpha); it is faded again after each change.
local function keepFaded(b)
  if type(b.OnButtonStateChanged) ~= "function" then return end
  hooksecurefunc(b, "OnButtonStateChanged", ns.Guard("hook OnButtonStateChanged", function() T.FadeRegions(b) end))
end

-- The slot tile (a level under the button, so the game's count text draws over it) and the icon on it, made once.
local function addSlot(obj, icon, glyph)
  vgSlot[obj] = T.Slot(CreateFrame("Frame", nil, obj))
  vgSlot[obj]:SetAllPoints(obj)
  vgSlot[obj]:SetFrameLevel(math.max(0, obj:GetFrameLevel() - 1))
  vgGlyph[obj] = T.Snap(vgSlot[obj]:CreateTexture(nil, "OVERLAY"))
  vgGlyph[obj]:SetTexture(T.Icon(icon))
  vgGlyph[obj]:SetSize(glyph or MM.GLYPH, glyph or MM.GLYPH)
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
-- side (default MM.BUTTON) and glyph (default MM.GLYPH) set other sizes, for the info strip's calendar button.
function MM.SlotButton(obj, icon, side, glyph)
  local b = clickable(obj)
  obj:SetSize(side or MM.BUTTON, side or MM.BUTTON)
  T.FadeRegions(obj)
  if b ~= obj then T.FadeRegions(b) b:ClearAllPoints() b:SetAllPoints(obj) end
  hideCount(obj)
  if vgSlot[obj] then return end
  addSlot(obj, icon, glyph)
  slotStates(obj, b)
  keepFaded(b)
end

-- SetPoint arguments for a leftover button: its corner of the map, or on a round map the rim at its angle.
function MM.Spot(spec)
  if not MM.round then return spec.point, MM.overlay, spec.point, spec.x, spec.y end
  local a = math.rad(spec.angle)
  return "CENTER", MM.overlay, "CENTER", math.cos(a) * MM.rim, math.sin(a) * MM.rim
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
    f:SetPoint(MM.Spot(spec))
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

-- The zone tooltip's closing hints: what a click and the wheel do on the zone name.
MM.ZONE_HINTS = { "Click: world map", "Wheel: zoom" }

-- Fills the tooltip for the zone band: the zone, its subzone when it has
-- one, and whose territory it is, in the zone text's color; then what a click and the wheel do.
local function zoneTooltip(button)
  local zone = GetZoneText and GetZoneText() or ""
  local sub, pvp = GetSubZoneText and GetSubZoneText() or "", zonePvP()
  if zone == "" then zone = GetMinimapZoneText and GetMinimapZoneText() or "" end
  GameTooltip:SetOwner(button, "ANCHOR_LEFT")
  GameTooltip:SetText(zone, rgb("text"))
  if sub ~= "" and sub ~= zone then GameTooltip:AddLine(sub, rgb("text2")) end
  if PVP_WORDS[pvp] then GameTooltip:AddLine(PVP_WORDS[pvp], rgb(ZONE_COLORS[pvp])) end
  for _, hint in ipairs(MM.ZONE_HINTS) do GameTooltip:AddLine(hint, rgb("text2")) end
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

-- Points a region at the square along the holder's bottom where the map sits (a round map's holder
-- is a strip taller, for the zone name above the disc).
local function onMapSquare(region, holder, size)
  region:SetPoint("BOTTOMLEFT", holder, "BOTTOMLEFT")
  region:SetPoint("BOTTOMRIGHT", holder, "BOTTOMRIGHT")
  region:SetHeight(size + 2)
end

-- A round map's backing: a disc in the panel color (it follows the theme).
local function roundBacking(holder, size)
  local disc = holder:CreateTexture(nil, "BACKGROUND")
  disc:SetTexture(T.Texture("RoundDisc"))
  onMapSquare(disc, holder, size)
  T.Tint(disc, "panel")
end

-- The themed holder the minimap moves into; a round map's is a band taller, for the zone name above it.
local function createHolder(size)
  local holder = CreateFrame("Frame", "Vanguard_Minimap", UIParent)
  MM.holder = holder
  holder:SetSize(size + 2, size + 2 + (MM.round and MM.BAND.top or 0))
  if MM.round then roundBacking(holder, size) else T.HudPanel(holder) end
  ns.Mover(holder, "minimap", "Minimap", { "TOPRIGHT", "TOPRIGHT", -12, -12 })
  return holder
end

-- The map's mask: Vanguard's disc on a round map, else the square.
local function applyMask()
  Minimap:SetMaskTexture(MM.round and T.Texture("RoundDisc") or T.WHITE)
end

-- Rotate Minimap (Edit Mode, or the rotateMinimap CVar) runs the cluster's UpdateMinimapConfig, which
-- puts the game's round mask back on the map; Vanguard's goes on again after it.
local function keepMask()
  local cluster = _G.MinimapCluster
  if type(cluster) ~= "table" or type(cluster.UpdateMinimapConfig) ~= "function" then return end
  hooksecurefunc(cluster, "UpdateMinimapConfig", ns.Guard("hook UpdateMinimapConfig", applyMask))
end

-- Moves the minimap into the holder, square and sized, a pixel in from its bottom edge.
local function adoptMinimap(holder, size)
  Minimap:SetParent(holder)
  Minimap:ClearAllPoints()
  Minimap:SetPoint("BOTTOM", holder, "BOTTOM", 0, 1)
  Minimap:SetSize(size, size)
  applyMask()
  keepMask()
  wheelZoom()
end

-- On a round map: the disc mask the bands wear (so they stop at the edge) and the outline over the map's rim.
local function roundTrim(overlay)
  MM.mask = overlay:CreateMaskTexture()
  MM.mask:SetTexture(T.Texture("RoundDisc"), "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
  MM.mask:SetAllPoints(overlay)
  local ring = overlay:CreateTexture(nil, "OVERLAY")
  ring:SetTexture(T.Texture("RoundRing"))
  ring:SetAllPoints(overlay)
  T.Tint(ring, "edge")
end

-- The overlay frame above the map that holds the bands, the texts, the
-- corner marks and the game's buttons; on the holder the map would cover them.
local function createOverlay(holder, size)
  local overlay = CreateFrame("Frame", nil, holder)
  MM.overlay = overlay
  if MM.round then roundTrim(overlay) end
  overlay.Layout = MM.NoLayout
  onMapSquare(overlay, holder, size)
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
  if MM.mask then t:AddMaskTexture(MM.mask) end
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
  if MM.mask then t:AddMaskTexture(MM.mask) end
  return t
end

-- Paints the bands in the panel color, see-through, and their rules in the accent (again after every theme change).
local function paintChrome()
  paintBands()
  for _, t in ipairs(MM.rules) do T.Tint(t, "accent") end
end

-- The bands along the map's top and bottom edges (the top one only on a square map, the bottom one,
-- which holds the coordinates and the slot buttons, only with coordinates on), each with an
-- accent rule on its inner edge; they follow the panel color and accent live.
local function addBands(overlay, settings)
  MM.bands = {}
  MM.top = band(overlay, "TOP", MM.BAND.top)
  MM.bottom = band(overlay, "BOTTOM", MM.BAND.bottom)
  MM.bottom:SetShown(settings.coords ~= false)
  MM.rules = { rule(overlay, MM.top, "BOTTOM"), rule(overlay, MM.bottom, "TOP") }
  MM.rules[2]:SetShown(settings.coords ~= false)
  MM.top:SetShown(not MM.round)
  MM.rules[1]:SetShown(not MM.round)
  paintChrome()
  T.OnChanged(paintChrome)
end

-- How wide the zone name may run: the room between the top corner buttons, or on a round map the
-- whole width of the strip above the disc.
function MM.ZoneWidth(size)
  if not MM.round then return size - 2 * MM.ZONE_INSET end
  return size
end

-- The zone name centered on its button (the top band, or the strip above a round map) in the zone
-- role (a bold 13 that keeps Fira Sans when the faction look sets the display font on window titles),
-- kept to the button's width (a long name is cut short rather than run under the corner buttons), and
-- the coordinates centered on the bottom band (inside the map, so a map in a
-- screen corner never pushes them off screen).
local function addTexts(overlay, size)
  MM.zone = T.Text(overlay:CreateFontString(nil, "OVERLAY"), "zone", false)
  MM.zone:SetPoint("CENTER", MM.zoneButton, "CENTER")
  MM.zone:SetWidth(MM.ZoneWidth(size))
  MM.zone:SetWordWrap(false)
  MM.coords = T.Text(overlay:CreateFontString(nil, "OVERLAY"), "small")
  MM.coords:SetPoint("CENTER", MM.bottom, "CENTER")
  T.Color(MM.coords, "text")
end

-- Opens or closes the world map, unless a fight is on (the game refuses Vanguard there).
local function toggleWorldMap()
  if ns.WindowWaitsForCombat("The world map") then return end
  if type(ToggleWorldMap) == "function" then ToggleWorldMap() end
end

-- The zone name takes the mouse: a click opens (or closes) the world map,
-- hovering names the zone and its territory, and the wheel still zooms. It
-- stops short of the top corners, so the buttons there keep their clicks. It runs along the holder's
-- top: over the top band, or on a round map over the strip above the disc.
local function zoneButton(overlay, size)
  local b = CreateFrame("Button", "Vanguard_MinimapZone", overlay)
  local inset = (size - MM.ZoneWidth(size)) / 2
  b:SetPoint("TOPLEFT", MM.holder, "TOPLEFT", inset, 0)
  b:SetPoint("TOPRIGHT", MM.holder, "TOPRIGHT", -inset, 0)
  b:SetHeight(MM.BAND.top)
  b:SetScript("OnClick", ns.Guard("click minimap world map", toggleWorldMap))
  b:SetScript("OnEnter", zoneTooltip)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  b:EnableMouseWheel(true) b:SetScript("OnMouseWheel", onWheel)
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

-- The four corner diamonds (none on a round map); they follow the accent live.
local function addCorners(overlay)
  MM.corners = {}
  if MM.round then return end
  for _, point in ipairs({ "TOPLEFT", "TOPRIGHT", "BOTTOMLEFT", "BOTTOMRIGHT" }) do MM.corners[#MM.corners + 1] = cornerMark(overlay, point) end
  paintCorners()
  T.OnChanged(paintCorners)
end

-- Dresses the overlay: the bands, the texts on them, the zone button and the corner marks.
local function dress(overlay, settings)
  addBands(overlay, settings)
  zoneButton(overlay, settings.size)
  addTexts(overlay, settings.size)
  addCorners(overlay)
end

-- Builds the minimap frame. Out of combat, since it moves Blizzard frames.
local function build(settings)
  MM.round, MM.rim = MM.IsRound(settings), settings.size / 2 - MM.RIM_INSET
  local holder = createHolder(settings.size)
  adoptMinimap(holder, settings.size)
  dress(createOverlay(holder, settings.size), settings)
  fadeArt()
  quietZoom()
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
