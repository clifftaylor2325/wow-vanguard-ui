-- Raid frames: up to 40 players in a grid, one column per group (or sorted
-- by role), built on the client's secure group header so the roster can
-- change in combat. Each button shows class-colored health (softened into
-- the panel color by default, so the outlined name stays readable), a role
-- mark (a shield for tanks, a cross for healers) and the name on the top row, then Dead / Offline or the missing
-- health on the second, and a thin power bar along the bottom. With
-- showInParty on, these frames also cover your party (and the party frames
-- in UnitFrames aren't built).
--
-- All 40 buttons are created up front, out of combat, so click casting and
-- hover keys (Modules/ClickCast.lua) can be set on every one of them safely.
--
-- The frames grow up from a movable holder (just above your player frame, default;
-- a raid of more than 10 stacks its groups as rows at the left of your character,
-- see RF.SPOT_BIG). In bigger raids the whole grid is drawn smaller (compact), so 40
-- players fit beside the unit frames at any UI scale; each tile keeps its layout.

local ADDON, ns = ...

local T = ns.Theme

local RF = ns.Module("RaidFrames", {
  defaults = { width = 100, height = 48, spacing = 4, showInParty = true, showPlayer = true, sortByRole = false, hideBlizzard = true, look = "soft", showPower = true, compact = true, layout = "columns", stackBig = true },
})

-- Group size -> how large the grid is drawn when compact: up to 10 full size, up to 25 at 80%, more at 72%.
RF.COMPACT = { { 10, 1 }, { 25, 0.8 }, { 40, 0.72 } }
-- Where the grid starts by default: a party or a raid of 10 right over your player frame; a bigger raid
-- (with Stack big raids on) left of your character, as healers keep it, so the boss and your own frames stay in
-- view, its left edge 620 units left of the screen's middle, 344 up and clear of the frames around your character.
RF.SPOT = { "BOTTOM", "BOTTOM", -240, 344 }
RF.SPOT_BIG = { "BOTTOMLEFT", "BOTTOM", -620, 344 }
-- How large the grid is drawn now (RF.Fit sets it).
RF.tileScale = 1

local MAX_UNITS = 40
-- The class color's share of a softened bar; the rest is the panel color.
local SOFT = 0.7
-- Role marks: a shield for tanks and a cross for healers; damage dealers get none.
RF.ROLE_MARKS = { TANK = T.Icon("RoleTank"), HEALER = T.Icon("RoleHealer") }
local BLIZZARD_FRAMES = { "CompactRaidFrameManager", "CompactRaidFrameContainer", "CompactPartyFrame" }

-- Runs in the secure environment for every button the header creates: size
-- and default clicks, then the insecure setup below via CallMethod.
RF.INIT = [[
  local header = self:GetParent()
  self:SetWidth(header:GetAttribute("vg-width"))
  self:SetHeight(header:GetAttribute("vg-height"))
  self:SetAttribute("*type1", "target")
  self:SetAttribute("*type2", "togglemenu")
  header:CallMethod("initialConfigFunction", self:GetName())
]]

RF.buttons = {}
-- Other modules add to a raid button here: setupHooks(b) once per button,
-- updateHooks(b, unit) on every refresh (Modules/RaidAuras.lua uses both).
-- healthHooks(b, unit) after a health event (only what follows health).
-- emptyHooks(b) when a tile's unit goes away (the group shrank).
RF.setupHooks, RF.updateHooks, RF.healthHooks, RF.emptyHooks = {}, {}, {}, {}
-- Tiles by the unit token the group header gave them (see RF.ForUnit).
RF.byUnit = {}

-- Values ----------------------------------------------------------------------------------

-- The unit frames module's helpers (class/reaction color, health text).
local function unitFrames()
  return ns.GetModule("UnitFrames")
end

-- The raid's main tank and main assist get the shield in these colors.
RF.ASSIGNMENTS = { MAINTANK = "accent", MAINASSIST = "text2" }

-- The color for a unit the raid assigned as main tank or main assist, or nil.
local function assignment(unit)
  if type(GetPartyAssignment) ~= "function" then return nil end
  for kind, color in pairs(RF.ASSIGNMENTS) do
    local yes = GetPartyAssignment(kind, unit)
    if not ns.IsSecret(yes) and yes == true then return color end
  end
end

-- The role mark (an icon path) and its color for a unit: a shield for tanks
-- (accent for the main tank), a cross for healers; nil for anyone else, or
-- when the client keeps the role hidden.
function RF.RoleMark(unit)
  local assigned = assignment(unit)
  if assigned then return RF.ROLE_MARKS.TANK, assigned end
  local role = type(UnitGroupRolesAssigned) == "function" and UnitGroupRolesAssigned(unit) or "NONE"
  if ns.IsSecret(role) then return nil end
  return RF.ROLE_MARKS[role], RF.ROLE_MARKS[role] and "text2"
end

-- Missing health as short text ("-16K") from plain numbers; "" at full health.
function RF.DeficitText(health, max)
  if health >= max then return "" end
  local missing = max - health
  return "-" .. (type(AbbreviateNumbers) == "function" and AbbreviateNumbers(missing) or tostring(missing))
end

-- A unit's missing health as short text; "" at full health, or when the client
-- keeps the values secret (in instanced combat), since they can't be subtracted.
function RF.Deficit(unit)
  local health, max = ns.PlainNumber(UnitHealth(unit)), ns.PlainNumber(UnitHealthMax(unit))
  if not health or not max then return "" end
  return RF.DeficitText(health, max)
end

-- True when two unit tokens name the same unit (a hidden answer counts as no).
function RF.Same(a, b)
  local same = type(UnitIsUnit) == "function" and UnitIsUnit(a, b)
  return not ns.IsSecret(same) and same == true
end

-- True when a unit is your target (a hidden answer counts as no).
local function isTarget(unit)
  return RF.Same(unit, "target")
end

-- A class color mixed into the panel color (SOFT of the class color).
function RF.Soften(r, g, b)
  local pr, pg, pb = T.RGB("panel")
  return r * SOFT + pr * (1 - SOFT), g * SOFT + pg * (1 - SOFT), b * SOFT + pb * (1 - SOFT)
end

-- The status line's font size in tile units, for a tile h tall drawn at scale:
-- the barSmall role grown or shrunk with the tile's height (against the
-- default) and the grid's scale, but never under the theme's smallest text
-- (tiny) on screen, so the missing health on a 40-player grid stays readable.
function RF.StatusSize(h, scale)
  local onScreen = math.floor(T.RoleSize("barSmall") * h / RF.defaults.height * scale + 0.5)
  return math.max(T.RoleSize("tiny"), onScreen) / scale
end

-- Updating ---------------------------------------------------------------------------------

-- The accent as an { r, g, b } for a tile's edge: it reads the current accent
-- whenever the edge is painted (an accent change included), so painting the
-- target's edge makes no table.
local ACCENT = setmetatable({}, {
  -- ACCENT[i]: the i-th of the accent's r, g, b.
  __index = function(_, i) return (select(i, T.Accent())) end,
})

-- Shows a role mark texture with the mark, or hides it.
local function showRoleTexture(t, mark)
  t:SetShown(mark ~= nil)
  if mark then t:SetTexture(mark) end
end

-- Paints a role mark (an icon path, with its shadow) in a color, or none. With no
-- mark it narrows to one unit, so the name anchored after it starts near the row's
-- start. Nothing is re-anchored, so this is safe in combat (the game's raid frames do the same).
function RF.PaintRole(b, mark, color)
  showRoleTexture(b.role, mark)
  showRoleTexture(b.roleShadow, mark)
  if color then T.Tint(b.role, color) end
  b.role:SetWidth(mark and b.roleSize or 1)
end

-- The unit's role mark (with its shadow), or none.
local function updateRole(b, unit)
  RF.PaintRole(b, RF.RoleMark(unit))
end

-- Paints the status line: down ("Dead" / "Offline") when given, else the deficit text.
function RF.PaintStatus(b, down, deficit)
  b.down = down ~= nil
  b.status:SetText(down or deficit)
  T.Color(b.status, down == "Dead" and "bad" or "text2")
end

-- Dead / Offline, else the missing health, on the status line.
local function updateStatus(b, unit)
  -- DownState, not the health text: that text can be a secret string, and
  -- comparing a secret errors ("attempt to compare ... a secret string value").
  local down = unitFrames().DownState(unit)
  RF.PaintStatus(b, down, not down and RF.Deficit(unit))
end

-- Paints the health bar and name from a class color r, g, bl by look: softened
-- class bars (default) or bright ones, both with light names; or dark bars with
-- class-colored names. The dead and offline (b.down) get a dark bar.
function RF.PaintColors(b, r, g, bl)
  if b.down then return T.BarColor(b.health, "darkBar") end
  if RF.settings.look == "dark" then
    T.BarColor(b.health, "darkBar")
    return b.name:SetTextColor(r, g, bl)
  end
  if RF.settings.look == "soft" then r, g, bl = RF.Soften(r, g, bl) end
  b.health:SetStatusBarColor(r, g, bl)
  T.Color(b.name, "text")
end

-- The health bar and name in the unit's colors.
local function paintHealth(b, unit)
  RF.PaintColors(b, unitFrames().HealthColor(unit))
end

-- The health bar, the status line under the name, and the colors.
local function updateHealth(b, unit)
  b.health:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(b.health, UnitHealth(unit))
  updateStatus(b, unit)
  paintHealth(b, unit)
end

-- Shows the thin power bar, or hides it when turned off; true when shown.
function RF.ShowPower(b)
  b.power:SetShown(RF.settings.showPower == true)
  return RF.settings.showPower == true
end

-- Paints the power bar: value of max, in r, g, bl.
function RF.PaintPower(b, value, max, r, g, bl)
  b.power:SetMinMaxValues(0, max)
  b.power:SetValue(value)
  b.power:SetStatusBarColor(r, g, bl)
end

-- The thin power bar: value, maximum and power color, or hidden when turned off.
function RF.UpdatePower(b, unit)
  if not RF.ShowPower(b) then return end
  RF.PaintPower(b, UnitPower(unit), UnitPowerMax(unit), unitFrames().PowerColor(unit))
end

-- The unit a tile shows, when it exists; else nil.
local function tileUnit(b)
  local unit = b:GetAttribute("unit")
  if unit and UnitExists(unit) then return unit end
  return nil
end

-- The 1 px line in a class color (r, g, bl) along the tile's top, in the
-- softened look only (softened, close class colors such as shaman and mage
-- blues read alike).
function RF.PaintTopLine(b, r, g, bl)
  local on = RF.settings.look == "soft"
  b.topLine:SetShown(on)
  if on then b.topLine:SetVertexColor(r, g, bl) end
end

-- The top line in the unit's class color. Its class doesn't change with
-- health, so it is painted on a full update only.
local function paintTopLine(b, unit)
  RF.PaintTopLine(b, unitFrames().HealthColor(unit))
end

-- A tile with no unit (the group shrank): every module's part lets go of the old one.
function RF.Emptied(b)
  for _, hook in ipairs(RF.emptyHooks) do hook(b) end
end

-- Everything on one tile: name, role, health, power, edge, top line and every
-- module's part (RF.updateHooks). For a roster change, a new tile, or a setting.
function RF.Update(b)
  local unit = tileUnit(b)
  if not unit then RF.Emptied(b) return end
  b.name:SetText(UnitName(unit))
  updateRole(b, unit)
  paintTopLine(b, unit)
  updateHealth(b, unit)
  RF.UpdatePower(b, unit)
  RF.PaintEdge(b, unit)
  for _, hook in ipairs(RF.updateHooks) do hook(b, unit) end
end

-- A health event: the bar, status and colors, then the parts that follow
-- health (RF.healthHooks). A unit that just died, came back or went offline
-- gets everything, since other parts hide on the dead.
function RF.UpdateHealth(b, unit)
  local wasDown = b.down
  updateHealth(b, unit)
  if b.down ~= wasDown then return RF.Update(b) end
  for _, hook in ipairs(RF.healthHooks) do hook(b, unit) end
end

-- The role marks on one tile (roles were assigned).
RF.UpdateRole = updateRole

-- The tile's own edge: accent on your target, the theme's otherwise. It is
-- painted only when that changes (b.isTarget remembers it).
function RF.PaintEdge(b, unit)
  local on = isTarget(unit)
  if on == b.isTarget then return end
  b.isTarget = on
  T.SetBorder(b, on and ACCENT or nil)
end

-- Every button currently showing a unit.
function RF.UpdateAll()
  for _, b in ipairs(RF.buttons) do
    if b:IsShown() then RF.Update(b) end
  end
end

-- Runs fn(tile, unit) on every shown tile with an existing unit.
function RF.EachTile(fn)
  for _, b in ipairs(RF.buttons) do
    local unit = b:IsShown() and tileUnit(b)
    if unit then fn(b, unit) end
  end
end

-- Runs fn(tile, unit) for the shown tile showing this unit token, if any.
-- The client sends a unit event for each token that names the unit (raid3,
-- target...), so the tile's own token is enough, as for the game's raid frames.
function RF.ForUnit(unit, fn)
  local b = unit and RF.byUnit[unit]
  if b and b:IsShown() then fn(b, unit) end
end

-- A unit event handler that runs one part, RF[part](tile, unit), on the tile
-- showing the event's unit, with the tile's own unit token.
local function onUnit(part)
  -- The part, on a tile whose unit still exists.
  local run = function(b)
    local unit = tileUnit(b)
    if unit then RF[part](b, unit) end
  end
  return function(_, unit) RF.ForUnit(unit, run) end
end

-- Zones ------------------------------------------------------------------------------------
-- A tile is laid out in zones that never overlap (tested at several sizes and
-- text scales): the name row at the top, the missing-buff mark in the top-right
-- corner, the status line under the name (or at the name row's right when the
-- tile is too short), debuffs bottom left, your HoTs bottom right, the power
-- bar along the bottom. Ready check and resurrection come and go in the center.
-- Rects are { x, y, w, h } from the tile's top-left, y growing down.

RF.POWER = 3
-- How far above the health bar the texts sit (the heal bars are one level above it).
RF.TEXT_LEVEL = 5
local CORNER = 10

-- A text role's line height: its size (text scale included) and a pixel of air each side.
local function lineHeight(role)
  return T.RoleSize(role) + 2
end

-- The icon strip: icon size from the tile's height, how many fit each side, and its top.
local function strip(w, h)
  local icon = math.max(10, math.min(18, math.floor(h * 0.3)))
  local per = math.max(1, math.min(3, math.floor((w / 2 - 3) / (icon + 1))))
  return icon, per, h - 1 - RF.POWER - 1 - icon
end

-- The name row and status line (its text `size` tall, a pixel of air each
-- side): status under the name when it fits above the icon strip, else at the
-- right of the name row, no taller than the room above the strip. The fifth
-- field is its justification; z.statusSize is the size it ends up with.
local function textZones(z, w, top, size)
  local nameH = lineHeight("barName")
  if top - (4 + nameH) >= size + 2 then
    z.name, z.status = { 4, 4, w - 20, nameH }, { 4, 4 + nameH, w - 8, size + 2, "CENTER" }
  else
    size = math.min(size, top - 6)
    z.name, z.status = { 4, 4, w - 52, nameH }, { w - 44, 4, 28, size + 2, "RIGHT" }
  end
  z.statusSize = size
end

-- Every zone of a w x h tile, drawn at scale (1 when not given): the status
-- text keeps a readable size on screen (RF.StatusSize), so the texts make room for it.
function RF.Zones(w, h, scale)
  local icon, per, top = strip(w, h)
  local rowW = per * (icon + 1) - 1
  local z = { icon = icon, per = per, missing = { w - 3 - CORNER, 3, CORNER, CORNER }, power = { 1, h - 1 - RF.POWER, w - 2, RF.POWER } }
  z.debuffs, z.hots = { 2, top, rowW, icon }, { w - 2 - rowW, top, rowW, icon }
  textZones(z, w, top, RF.StatusSize(h, scale or 1))
  return z
end

-- The zones of the tiles at the set size and the grid's current scale.
function RF.TileZones()
  return RF.Zones(RF.settings.width, RF.settings.height, RF.tileScale)
end

-- Building ---------------------------------------------------------------------------------

-- The role mark at the name row's start, as tall as the name's letters, with a
-- dark copy one pixel down and right under it, so it reads on a bright bar as
-- the outlined name does.
local function addRoleMark(b, z)
  local size, px = T.RoleSize("barName") - 1, T.Pixel(b)
  b.roleSize = size
  b.roleShadow = T.Tint(T.Snap(b.texts:CreateTexture(nil, "OVERLAY", nil, 1)), "textShadow")
  b.role = T.Tint(T.Snap(b.texts:CreateTexture(nil, "OVERLAY", nil, 2)), "text2")
  for i, t in ipairs({ b.role, b.roleShadow }) do
    t:SetSize(size, size)
    t:SetPoint("TOPLEFT", b, "TOPLEFT", z.name[1] + (i - 1) * px, -z.name[2] - 1 - (i - 1) * px)
  end
end

-- Top row: the role mark, then the name, which stops at its zone's edge
-- (placeTexts) and ends in "..." when it's too long (outlined over the bar).
local function addTopRow(b, z)
  addRoleMark(b, z)
  b.name = T.Text(b.texts:CreateFontString(nil, "OVERLAY"), "barName")
  b.name:SetPoint("TOPLEFT", b.role, "TOPRIGHT", 3, 1)
  b.name:SetJustifyH("LEFT")
  b.name:SetWordWrap(false)
end

-- The class-colored line along the health bar's top (sized by placeTexts,
-- painted by paintTopLine), under the aggro strip (Modules/RaidHealing.lua),
-- which covers it while the player has aggro.
local function addTopLine(b)
  b.topLine = T.Snap(b.health:CreateTexture(nil, "OVERLAY", nil, -1), "border")
  b.topLine:SetTexture(T.WHITE)
  b.topLine:SetPoint("TOPLEFT", b.health, "TOPLEFT")
  b.topLine:SetPoint("TOPRIGHT", b.health, "TOPRIGHT")
  b.topLine:Hide()
end

-- Lays a tile's texts out in its zones: where the name stops, the status
-- line's spot, width, justification and size, and the top line one screen
-- pixel tall at the grid's scale. Again whenever that scale changes.
local function placeTexts(b, z)
  b.name:SetPoint("TOPRIGHT", b, "TOPLEFT", z.name[1] + z.name[3], -z.name[2])
  b.status:ClearAllPoints()
  b.status:SetPoint("TOPLEFT", b, "TOPLEFT", z.status[1], -z.status[2])
  b.status:SetWidth(z.status[3])
  b.status:SetJustifyH(z.status[5])
  T.TextSize(b.status, z.statusSize)
  b.topLine:SetHeight(T.Pixel(b))
end
-- Shared with the preview tiles (Modules/RaidPreview.lua).
RF.PlaceTexts = placeTexts

-- The tile's texts: the top row, the status line (Dead / Offline or the
-- missing health) and the top line, laid out in their zones.
local function addTexts(b, z)
  addTopRow(b, z)
  b.status = T.Text(b.texts:CreateFontString(nil, "OVERLAY"), "barSmall", "text2")
  addTopLine(b)
  placeTexts(b, z)
end

-- Lays every tile's texts out again for the grid's current scale (out of combat).
function RF.PlaceAllTexts()
  local z = RF.TileZones()
  for _, b in ipairs(RF.buttons) do placeTexts(b, z) end
end

-- The layer above everything on the tile (auras included) for marks, and a
-- faint wash while the mouse is over the tile.
local function addOverlay(b)
  b.overlay = CreateFrame("Frame", nil, b)
  b.overlay:SetAllPoints()
  b.overlay:SetFrameLevel(b:GetFrameLevel() + 20)
  b.hover = T.Tint(T.Snap(b.overlay:CreateTexture(nil, "BACKGROUND")), "hover")
  b.hover:SetTexture(T.WHITE)
  b.hover:SetAllPoints(b.health)
  b.hover:Hide()
end

-- A 3 px power bar along the bottom edge.
local function addPower(b)
  b.power = T.StyleBar(CreateFrame("StatusBar", nil, b.health))
  b.power:SetPoint("BOTTOMLEFT")
  b.power:SetPoint("BOTTOMRIGHT")
  b.power:SetHeight(3)
end

-- The layer the tile's texts sit on: above the incoming-heal and shield bars
-- (child frames of the health bar, which would otherwise cover the name) and
-- under the status marks on the overlay.
local function addTextLayer(b)
  b.texts = CreateFrame("Frame", nil, b.health)
  b.texts:SetAllPoints()
  b.texts:SetFrameLevel(b.health:GetFrameLevel() + RF.TEXT_LEVEL)
end

-- The health bar filling the button, with its texts, power bar and overlay.
local function addParts(b)
  local z = RF.TileZones()
  local px = T.Pixel(b)
  b.health = T.StyleBar(CreateFrame("StatusBar", nil, b))
  b.health:SetPoint("TOPLEFT", px, -px)
  b.health:SetPoint("BOTTOMRIGHT", -px, px)
  addTextLayer(b)
  addTexts(b, z)
  addPower(b)
  addOverlay(b)
end

-- Moves a tile to its new unit token in RF.byUnit. The tile showing you is
-- also filed under "player", since your own events name you that way.
local function track(b, unit)
  if b.tracked and RF.byUnit[b.tracked] == b then RF.byUnit[b.tracked] = nil end
  if RF.byUnit.player == b then RF.byUnit.player = nil end
  b.tracked = unit
  if unit then RF.byUnit[unit] = b end
  if unit and RF.Same(unit, "player") then RF.byUnit.player = b end
end

-- A button's unit changed (roster change): track it and refresh it.
local function onAttributeChanged(b, name, value)
  if name ~= "unit" then return end
  track(b, value)
  RF.Update(b)
end

-- A button's scripts: clicks, follow its unit, refresh on show, light on hover.
local function addScripts(b)
  b:RegisterForClicks("AnyUp")
  b:HookScript("OnAttributeChanged", onAttributeChanged)
  b:HookScript("OnShow", RF.Update)
  b:HookScript("OnEnter", function() b.hover:Show() end)
  b:HookScript("OnLeave", function() b.hover:Hide() end)
end

-- The panel and every part of a tile (bars, texts, marks, overlay): on a button
-- the header made, and on the preview's tiles (Modules/RaidPreview.lua).
function RF.Dress(b)
  T.HudPanel(b)
  addParts(b)
end

-- Insecure setup for a button the header created (called from RF.INIT).
function RF.Setup(b)
  RF.Dress(b)
  addScripts(b)
  RF.buttons[#RF.buttons + 1] = b
  track(b, b:GetAttribute("unit"))
  for _, hook in ipairs(RF.setupHooks) do hook(b) end
  if RF.OnButtonCreated then RF.OnButtonCreated(b) end
end

-- Where the header grows for each layout: columns of five side by side
-- (growing up), or rows of five stacked upward (wide, for big healing raids).
RF.GROW = {
  columns = { point = "BOTTOM", columnAnchorPoint = "LEFT", xOffset = 0, yOffset = 4 },
  rows = { point = "LEFT", columnAnchorPoint = "BOTTOM", xOffset = 4, yOffset = 0 },
}

-- Whether a group of n players is drawn as a big raid: more than 10, with Stack big raids on.
local function big(n)
  return n > 10 and RF.settings.stackBig == true
end

-- The groups' direction for n players: your Groups as choice, except that a big raid stacks its
-- groups as rows (five across, one group above the next), which is shorter and clear of your frames.
function RF.LayoutFor(n)
  return (RF.settings.layout == "rows" or big(n)) and "rows" or "columns"
end

-- The grid's default spot for n players (a saved spot wins over it).
function RF.SpotFor(n)
  return big(n) and RF.SPOT_BIG or RF.SPOT
end

-- Layout attributes: groups of five (or sorted by role), as columns or rows (key).
local function layout(header, s, key)
  local grow = RF.GROW[key] or RF.GROW.columns
  header:SetAttribute("groupBy", s.sortByRole and "ASSIGNEDROLE" or "GROUP")
  header:SetAttribute("groupingOrder", s.sortByRole and "TANK,HEALER,DAMAGER,NONE" or "1,2,3,4,5,6,7,8")
  header:SetAttribute("maxColumns", 8)
  header:SetAttribute("unitsPerColumn", 5)
  header:SetAttribute("columnSpacing", s.spacing)
  for _, key in ipairs({ "point", "columnAnchorPoint" }) do header:SetAttribute(key, grow[key]) end
  header:SetAttribute("xOffset", grow.xOffset > 0 and s.spacing or 0)
  header:SetAttribute("yOffset", grow.yOffset > 0 and s.spacing or 0)
end

-- Which groups show: raid always, party and yourself by setting.
local function membership(header, s)
  header:SetAttribute("showRaid", true)
  header:SetAttribute("showParty", s.showInParty)
  header:SetAttribute("showPlayer", s.showPlayer)
  header:SetAttribute("showSolo", false)
  RegisterAttributeDriver(header, "state-visibility", s.showInParty and "[group:raid] show; [group:party] show; hide" or "[group:raid] show; hide")
end

-- Creates all 40 buttons now, out of combat (shown briefly with a negative start index, then back as
-- it was: a header the visibility driver hid stays hidden). Call it once the header is configured
-- (membership), so the first SecureGroupHeader_Update it triggers sees the final attributes.
local function precreate(header)
  local shown = header:IsShown()
  header:SetAttribute("startingIndex", 1 - MAX_UNITS)
  header:Show()
  header:SetAttribute("startingIndex", 1)
  header:SetShown(shown)
end

-- The secure group header, its button template and setup hook.
local function createHeader(s)
  local header = CreateFrame("Frame", "Vanguard_Raid", UIParent, "SecureGroupHeaderTemplate")
  header:SetAttribute("template", "SecureUnitButtonTemplate")
  header:SetAttribute("vg-width", s.width)
  header:SetAttribute("vg-height", s.height)
  -- Called by RF.INIT (CallMethod) with the new button's name.
  header.initialConfigFunction = function(_, name) RF.Setup(_G[name]) end
  if ns.Client.ProbeSnippets() ~= false then header:SetAttribute("initialConfigFunction", RF.INIT) end
  RF.layoutKey = RF.LayoutFor(0)
  layout(header, s, RF.layoutKey)
  return header
end

-- Sets up the raid buttons the header made without its init snippet (out of combat).
function RF.SetupButtons()
  ns.Client.SetupHeaderButtons(RF.header, RF.Setup)
end

-- The raid header on a client that can't run snippets: the header copies the
-- clicks, the buttons are made (again) and set up from here, now and on every
-- roster change, out of combat.
function RF.WithoutSnippets()
  ns.Client.HeaderWithoutSnippets(RF.header)
  precreate(RF.header)
  RF.SetupButtons()
  ns.On("GROUP_ROSTER_UPDATE", function() ns.OutOfCombat(RF.SetupButtons, "raidbuttons") end)
end

local hiddenParent
-- Unit event -> the part of the tile it refreshes (rare ones refresh all of it).
local UNIT_EVENTS = {
  UNIT_HEALTH = onUnit("UpdateHealth"), UNIT_MAXHEALTH = onUnit("UpdateHealth"),
  UNIT_POWER_UPDATE = onUnit("UpdatePower"), UNIT_MAXPOWER = onUnit("UpdatePower"), UNIT_DISPLAYPOWER = onUnit("UpdatePower"),
  UNIT_CONNECTION = onUnit("Update"), UNIT_NAME_UPDATE = onUnit("Update"), UNIT_FACTION = onUnit("Update"),
}

-- Hides a default raid/party frame by parenting it to a hidden frame, and
-- silences it (no events), so it does no work while hidden (out of combat, from build).
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetParent then return end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  if f.UnregisterAllEvents then f:UnregisterAllEvents() end
  f:SetParent(hiddenParent)
  ns.EditModeReplaced(f)
end

-- Sizing and placing the grid ------------------------------------------------------------

-- How large the grid is drawn for a group of n players (always 1 with compact off).
function RF.Scale(n)
  if not RF.settings.compact then return 1 end
  for _, step in ipairs(RF.COMPACT) do
    if n <= step[1] then return step[2] end
  end
  return RF.COMPACT[#RF.COMPACT][2]
end

-- The header's point on the holder: the holder's own side (left, right or
-- center), at the bottom, so the grid grows up and away from that side.
local function headerPoint()
  local point = ns.MoverPoint("raid") or "BOTTOM"
  return point:find("LEFT") and "BOTTOMLEFT" or point:find("RIGHT") and "BOTTOMRIGHT" or "BOTTOM"
end
RF.HeaderPoint = headerPoint

-- Scales the grid to the group's size, pins it to the holder and lays the
-- tiles' texts out for that scale (out of combat).
function RF.Fit()
  if not RF.header then return end
  local n = type(GetNumGroupMembers) == "function" and ns.PlainNumber(GetNumGroupMembers()) or 0
  ns.OutOfCombat(function()
    RF.tileScale = RF.Scale(n or 0)
    RF.Arrange(n or 0)
    RF.header:SetScale(RF.tileScale)
    RF.header:ClearAllPoints()
    RF.header:SetPoint(headerPoint(), RF.holder, headerPoint())
    RF.PlaceAllTexts()
  end, "raidfit")
end

-- Sizes the holder f for one group in a layout: a column of five tall, or a row of five wide.
function RF.SizeHolder(f, s, key)
  local five = 5 * (s.width + s.spacing) - s.spacing
  if key == "rows" then f:SetSize(five, s.height) else f:SetSize(s.width, 5 * (s.height + s.spacing) - s.spacing) end
end

-- Moves the holder to the default spot for n players when that changed (a saved spot still wins).
function RF.PlaceFor(n)
  local spot = RF.SpotFor(n)
  if spot ~= RF.spot then RF.spot = spot ns.SetMoverDefault("raid", spot) end
end

-- Sets the groups' direction and the holder's size for n players when the layout changed, then the
-- default spot (out of combat: the header is secure).
function RF.Arrange(n)
  local key = RF.LayoutFor(n)
  if key ~= RF.layoutKey then
    RF.layoutKey = key
    layout(RF.header, RF.settings, key)
    RF.SizeHolder(RF.holder, RF.settings, key)
  end
  RF.PlaceFor(n)
end

-- The movable holder, where the grid starts: one group's size (a column of
-- five tall, or a row of five wide).
local function holder(s)
  local f = CreateFrame("Frame", "Vanguard_RaidHolder", UIParent)
  RF.SizeHolder(f, s, RF.LayoutFor(0))
  RF.spot = RF.SPOT
  ns.Mover(f, "raid", "Raid frames", RF.SPOT)
  return f
end

-- Builds the header, precreates its buttons and replaces the default frames.
local function build(s)
  RF.holder, RF.header = holder(s), createHeader(s)
  RF.Fit()
  membership(RF.header, s)
  precreate(RF.header)
  ns.Client.WhenSnippetsKnown(function(worked) if worked == false then RF.WithoutSnippets() end end)
  if s.hideBlizzard then
    for _, name in ipairs(BLIZZARD_FRAMES) do hideBlizzard(name) end
  end
end

-- Carries a dark style chosen before `look` existed over to `look`, then drops
-- the old key (so this runs once per profile).
local function migrateStyle(s)
  if s.style == "dark" then s.look = "dark" end
  s.style = nil
end

-- The roster changed (or you zoned in): the grid is fitted to the group now,
-- and every tile is refreshed once on the next frame, however many roster
-- events come in this one (the marks and heal parts refresh with the tiles).
function RF.RosterChanged()
  RF.Fit()
  ns.Soon("raidtiles", RF.UpdateAll)
end

-- Event -> what it refreshes on every tile: the edge for a new target, the role marks for roles.
local TILE_EVENTS = { PLAYER_TARGET_CHANGED = "PaintEdge", PLAYER_ROLES_ASSIGNED = "UpdateRole" }

-- Module entry point (Core/Modules.lua): build out of combat, then listen.
function RF.Enable(settings)
  RF.settings = settings
  migrateStyle(settings)
  ns.OutOfCombat(function() build(settings) end)
  for e, fn in pairs(UNIT_EVENTS) do ns.On(e, fn) end
  for e, part in pairs(TILE_EVENTS) do ns.On(e, function() RF.EachTile(RF[part]) end) end
  for _, e in ipairs({ "GROUP_ROSTER_UPDATE", "PLAYER_ENTERING_WORLD" }) do ns.On(e, RF.RosterChanged) end
  -- A new text size or UI scale: the texts' sizes and the top line's pixel follow.
  T.OnChanged(function() ns.OutOfCombat(RF.PlaceAllTexts, "raidtexts") end)
end
