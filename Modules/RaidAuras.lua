-- Raid frame auras, in the tile's zones (Modules/RaidFrames.lua):
--   * debuffs bottom left: first one you can dispel, then the others;
--   * your HoTs bottom right, lit while they're in their refresh window;
--   * a debuff you can dispel also washes the tile in its type's color
--     (rising from the bottom, clear of the name) and colors its edge.
-- No timer numbers on these small icons: the sweep shows time left.
--
-- The icons are aura containers (Core/Auras.lua). On the client's engine the
-- wash and edge are handed to the client too, so they keep their color while
-- the client hides debuff types in instanced combat; on the fallback they are
-- painted here. The client's filters decide what counts: "HARMFUL|RAID" is
-- what YOU can dispel, "HELPFUL|PLAYER|RAID_IN_COMBAT" your buffs worth
-- showing on raid frames. The groups are fixed once built, so the settings
-- apply after a reload.
--
-- Indicators: up to three small icons down the tile's right edge, under the
-- missing-buff mark, each showing the first aura the client's filter for the
-- chosen source finds (an external defensive, a big defensive, a crowd
-- control, a debuff you can dispel, an important buff, any of your buffs).
-- Only the client's own filters decide what shows; nothing about an aura is
-- read here, so hidden values are fine. A short tile fills a second column.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local RF = ns.GetModule("RaidFrames")

local RA = ns.Module("RaidAuras", {
  defaults = { dispel = true, debuffs = 3, hots = true, maxHots = 3, indicator1 = "external", indicator2 = "cc", indicator3 = "none" },
})

-- The client's filter for debuffs you can dispel.
RA.DISPELLABLE = "HARMFUL|RAID"

-- Indicator source -> the client's filter for it, with the words for the options page.
RA.SOURCES = {
  external = "HELPFUL|EXTERNAL_DEFENSIVE", defensive = "HELPFUL|BIG_DEFENSIVE", important = "HELPFUL|IMPORTANT",
  mine = "HELPFUL|PLAYER", cc = "HARMFUL|CROWD_CONTROL", dispel = RA.DISPELLABLE,
}
RA.SOURCE_CHOICES = {
  { "none", L["None"] }, { "external", L["External defensive"] }, { "defensive", L["Big defensive"] }, { "important", L["Important buff"] },
  { "mine", L["Your buffs"] }, { "cc", L["Crowd control"] }, { "dispel", L["Dispellable debuff"] },
}
-- An indicator icon's side, and how many slots there are.
RA.IND_SIZE, RA.IND_SLOTS = 9, 3
-- The aura layers (the dispel wash and the indicators) sit this many frame levels above the tile.
RA.LEVEL_ABOVE = 10

-- The dispel edge's sides: two anchor points and a width (vertical) or height (horizontal).
local SIDES = {
  { "TOPLEFT", "TOPRIGHT", nil, 2 }, { "BOTTOMLEFT", "BOTTOMRIGHT", nil, 2 },
  { "TOPLEFT", "BOTTOMLEFT", 2 }, { "TOPRIGHT", "BOTTOMRIGHT", 2 },
}

-- Dispel highlight ------------------------------------------------------------------------

-- One 2 px edge along a side of the tile, drawn on `host`, hidden until a debuff shows.
local function edge(host, b, side)
  local t = T.Snap(host:CreateTexture(nil, "OVERLAY"))
  t:SetTexture(T.WHITE)
  t:SetPoint(side[1], b, side[1])
  t:SetPoint(side[2], b, side[2])
  if side[3] then t:SetWidth(side[3]) else t:SetHeight(side[4]) end
  t:Hide()
  return t
end

-- The wash rising from the tile's bottom and the edge around it, drawn on
-- `host`. Hidden until a debuff shows them: if the client ever refuses to
-- drive them, they stay hidden rather than showing uncolored. The wash's faintness is its own
-- alpha, since the client's color map carries none.
function RA.DispelParts(host, b)
  local wash = T.Snap(host:CreateTexture(nil, "ARTWORK"))
  wash:SetTexture(T.Texture("Fade"))
  wash:SetAlpha(T.ALPHA.dispelWash)
  wash:SetAllPoints(b.health)
  wash:Hide()
  local edges = {}
  for i, side in ipairs(SIDES) do edges[i] = edge(host, b, side) end
  return wash, edges
end

-- On the engine: each "you can dispel" button carries the tile's wash and
-- edge, and the client shows and colors them with the debuff.
local function engineDispel(b)
  return function(button)
    local wash, edges = RA.DispelParts(button, b)
    ns.AuraEngine.RegisterDispel(button, { wash })
    ns.AuraEngine.RegisterDispel(button, edges)
  end
end

-- Paints the fallback wash and edge for the first debuff you can dispel, or hides them (on the dead
-- and offline too, whose icons are hidden; on the engine the wash hides with its icon).
local function paintDispel(b, unit)
  local aura = RA.settings.dispel and not b.down and ns.Auras.Get(unit, 1, RA.DISPELLABLE)
  b.dispel:SetShown(aura ~= nil and aura ~= false)
  if not aura then return end
  local r, g, bl = ns.Auras.DispelColor(unit, aura)
  b.dispel.wash:SetVertexColor(r, g, bl)
  b.dispel.wash:Show()
  for _, t in ipairs(b.dispel.edges) do t:SetVertexColor(r, g, bl); t:Show() end
end

-- Repaints a tile's fallback highlight, if it has one.
local function repaint(b, unit)
  if b.dispel then paintDispel(b, unit) end
end

-- UNIT_AURA: repaint the fallback highlight on the tile showing that unit.
local function onAura(_, unit)
  RF.ForUnit(unit, repaint)
end

-- On the fallback: the tile's own wash and edge, painted on each refresh.
-- Only these need UNIT_AURA here (the rows follow their own units), so it is
-- registered with the first one.
local function legacyDispel(b)
  ns.On("UNIT_AURA", onAura)
  b.dispel = CreateFrame("Frame", nil, b)
  b.dispel:SetAllPoints()
  b.dispel:SetFrameLevel(b:GetFrameLevel() + RA.LEVEL_ABOVE)
  b.dispel.wash, b.dispel.edges = RA.DispelParts(b.dispel, b)
  b.dispel:Hide()
end

-- Containers -------------------------------------------------------------------------------

-- The debuff groups: first one you can dispel (carrying the highlight), then the others.
local function debuffGroups(b, z, s)
  local count = math.min(s.debuffs, z.per)
  local first = (count > 0 or s.dispel) and 1 or 0
  return {
    { filter = RA.DISPELLABLE, max = first, size = z.icon, debuff = true, register = s.dispel and engineDispel(b) or nil },
    { filter = "HARMFUL|!RAID", max = math.max(0, count - first), size = z.icon, debuff = true },
  }
end

-- Debuffs from the bottom-left corner of the icon strip, growing right.
function RA.DebuffSpec(b, z, s)
  local x, bottom = z.debuffs[1], z.debuffs[2] + z.icon
  return { point = { "BOTTOMLEFT", b, "TOPLEFT", x, -bottom }, grow = "RIGHT", growY = "UP", lineSize = z.debuffs[3] + 1,
    gap = 1, mouse = false, level = b:GetFrameLevel() + 10, groups = debuffGroups(b, z, s) }
end

-- Your HoTs from the bottom-right corner of the icon strip, growing left.
function RA.HotSpec(b, z, s)
  local right, bottom = z.hots[1] + z.hots[3], z.hots[2] + z.icon
  local count = s.hots and math.min(s.maxHots, z.per) or 0
  return { point = { "BOTTOMRIGHT", b, "TOPLEFT", right, -bottom }, grow = "LEFT", growY = "UP", lineSize = z.hots[3] + 1,
    gap = 1, mouse = false, level = b:GetFrameLevel() + 10,
    groups = { { filter = "HELPFUL|PLAYER|RAID_IN_COMBAT", max = count, size = z.icon, pandemic = true } } }
end

-- Adds the aura rows to a raid tile. The fallback highlight follows the debuff
-- row, which carries the engine's: it is read right after that row is built, so
-- a refusal on the hot row can't give the tile both.
local function addRows(b)
  local z, s = RF.TileZones(), RA.settings
  b.debuffRow = ns.Auras.Container(b, RA.DebuffSpec(b, z, s), nil)
  local legacy = ns.Auras.BackendName() == "fallback"
  b.hotRow = ns.Auras.Container(b, RA.HotSpec(b, z, s), nil)
  if legacy then legacyDispel(b) end
end

-- Indicators ------------------------------------------------------------------------------

-- Where slot n sits: the tile's right edge under the missing-buff mark, filling down as far as the
-- icon strip allows, then a column to the left. Nil when not even one fits.
local function indicatorSlot(z, n)
  local step, y0 = RA.IND_SIZE + 1, z.missing[2] + z.missing[4] + 1
  local rows = math.floor((z.debuffs[2] - y0) / step)
  if rows < 1 then return nil end
  return 2 + math.floor((n - 1) / rows) * step, y0 + ((n - 1) % rows) * step
end

-- Slot n's container spec on tile b, or nil when the slot is off or doesn't fit.
function RA.IndicatorSpec(b, z, n)
  local filter = RA.SOURCES[RA.settings["indicator" .. n]]
  local x, y = indicatorSlot(z, n)
  if not filter or not x then return nil end
  return { point = { "TOPRIGHT", b, "TOPRIGHT", -x, -y }, grow = "LEFT", growY = "DOWN", lineSize = RA.IND_SIZE + 1, gap = 1, mouse = false,
    level = b:GetFrameLevel() + RA.LEVEL_ABOVE, groups = { { filter = filter, max = 1, size = RA.IND_SIZE } } }
end

-- Builds the tile's indicator icons.
local function addIndicators(b)
  local z = RF.TileZones()
  b.indRows = {}
  for n = 1, RA.IND_SLOTS do
    local spec = RA.IndicatorSpec(b, z, n)
    if spec then b.indRows[#b.indRows + 1] = ns.Auras.Container(b, spec, nil) end
  end
end

-- Points an aura row at a tile's unit; when the row already shows that token (shownUnit) it reads it
-- again instead: a roster change can give the token to someone else, and the client's container only
-- refreshes when the token changes.
local function pointRow(row, unit, shownUnit)
  if shownUnit == unit then row:Refresh() else row:SetUnit(unit) end
end

-- Points the indicators at the tile's unit, hidden on the dead and offline (RF update hook).
local function indicatorUpdate(b, unit)
  if not b.indRows then return end
  for _, row in ipairs(b.indRows) do
    pointRow(row, unit, b.indUnit)
    row.frame:SetShown(not b.down)
  end
  b.indUnit = unit
end

-- Lets go of an emptied tile's unit (RF empty hook).
local function indicatorEmptied(b)
  if b.indUnit == nil then return end
  b.indUnit = nil
  for _, row in ipairs(b.indRows) do row:SetUnit(nil) end
end

-- Building ahead -------------------------------------------------------------------------
-- An aura container takes the client some 12 ms to make, and a tile has four or five, so the 40
-- tiles' rows are not made at login (some 2 s). A tile gets them when it first shows a unit, and
-- the tiles a group may fill next are built ahead one a frame (RA.BuildAhead), since no container
-- can be made in a fight. A tile first given a unit in a fight gets its rows when the fight ends.

-- How many tiles a party keeps built ahead: its own group's.
RA.PARTY_TILES = 5

-- Whether the tile has its aura rows yet.
local function built(b)
  return b.debuffRow ~= nil
end

-- Builds a tile's rows and indicators (out of combat).
local function build(b)
  addRows(b)
  addIndicators(b)
end

-- How many tiles are kept built ahead: every one in a raid (it can grow in a fight), the first
-- group's in a party, none alone.
function RA.TilesAhead()
  if type(IsInRaid) == "function" and IsInRaid() then return #RF.buttons end
  if type(IsInGroup) == "function" and IsInGroup() then return math.min(RA.PARTY_TILES, #RF.buttons) end
  return 0
end

-- One frame's share of the building ahead: the first tile within RA.TilesAhead without rows gets
-- them. True while another is left.
local function buildOne()
  for i = 1, RA.TilesAhead() do
    local b = RF.buttons[i]
    if not built(b) then build(b) return true end
  end
  return false
end

-- Builds the rows of the tiles the group may fill next, one tile a frame, out of combat.
function RA.BuildAhead()
  ns.Spread("raid aura rows", buildOne)
end

-- A tile that shows a unit before its rows were built ahead gets them now, or (in a fight) once
-- it ends, and is refreshed then. True when the tile has its rows.
local function ensure(b)
  if built(b) then return true end
  if not ns.InCombat() then build(b) return true end
  ns.OutOfCombat(function() if not built(b) then build(b) RF.Update(b) end end, b)
  return false
end

-- Updating ------------------------------------------------------------------------------

-- Points the rows at the button's unit, hides them on the dead and offline,
-- and paints the fallback highlight (RF update hook).
local function update(b, unit)
  if not ensure(b) then return end
  pointRow(b.debuffRow, unit, b.auraUnit)
  pointRow(b.hotRow, unit, b.auraUnit)
  b.auraUnit = unit
  b.debuffRow.frame:SetShown(not b.down)
  b.hotRow.frame:SetShown(not b.down)
  if b.dispel then paintDispel(b, unit) end
end

-- Lets go of an emptied tile's unit: the rows show nobody's auras (RF empty hook).
local function emptied(b)
  if b.auraUnit == nil then return end
  b.auraUnit = nil
  b.debuffRow:SetUnit(nil)
  b.hotRow:SetUnit(nil)
  if b.dispel then b.dispel:Hide() end
end

-- Module entry point (Core/Modules.lua): hook into raid tiles (existing and new), and build the
-- rows ahead now and whenever the group changes.
function RA.Enable(settings)
  RA.settings = settings
  table.insert(RF.updateHooks, update)
  table.insert(RF.updateHooks, indicatorUpdate)
  table.insert(RF.emptyHooks, emptied)
  table.insert(RF.emptyHooks, indicatorEmptied)
  ns.On("GROUP_ROSTER_UPDATE", RA.BuildAhead)
  RA.BuildAhead()
end
