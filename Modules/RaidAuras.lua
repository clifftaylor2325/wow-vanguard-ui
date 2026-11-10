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
-- showing on raid frames. The groups are fixed once a row is made, so a changed
-- setting makes the rows again (the module restarts, out of combat).
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
  live = true,
  requires = { "RaidFrames" },
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
  if b.dispel and RA.scope.on then paintDispel(b, unit) end
end

-- On the fallback: the tile's own wash and edge, painted on each refresh.
-- Only these need UNIT_AURA here (the rows follow their own units), and each tile
-- listens for its own unit's only (RF.OnTileUnit).
local function legacyDispel(b)
  RF.OnTileUnit(b, "UNIT_AURA", repaint)
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

-- Debuffs from the bottom-left corner of the icon strip, growing right (anchored to the tile's bottom, so a new tile height moves them with it).
function RA.DebuffSpec(b, z, s)
  local x, bottom = z.debuffs[1], z.debuffs[2] + z.icon
  return { point = { "BOTTOMLEFT", b, "BOTTOMLEFT", x, z.height - bottom }, grow = "RIGHT", growY = "UP", lineSize = z.debuffs[3] + 1,
    gap = 1, mouse = false, level = b:GetFrameLevel() + 10, groups = debuffGroups(b, z, s) }
end

-- Your HoTs from the bottom-right corner of the icon strip, growing left.
function RA.HotSpec(b, z, s)
  local right, bottom = z.hots[1] + z.hots[3], z.hots[2] + z.icon
  local count = s.hots and math.min(s.maxHots, z.per) or 0
  return { point = { "BOTTOMRIGHT", b, "BOTTOMRIGHT", right - z.width, z.height - bottom }, grow = "LEFT", growY = "UP", lineSize = z.hots[3] + 1,
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
  if legacy and not b.dispel then legacyDispel(b) end
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
-- An aura container takes the client some 12 ms to make, and a tile has four or five, so no
-- more than RA.NOW_PER_FRAME tiles' rows are made in one frame (40 tiles at once is some 2 s): a
-- tile that first shows a unit builds them at once while that share allows, and the rest are made
-- one tile a frame (RA.BuildAhead): first the tiles that already show a unit (each refreshed once
-- it has them), then the tiles the group may fill next, since no container can be made in a
-- fight. A fight pauses it; a tile first given a unit in one gets its rows after it.

-- How many tiles a party keeps built ahead: its own group's.
RA.PARTY_TILES = 5
-- How many tiles may build their rows at once in one frame when they first show a unit (a login
-- or a join in a big raid fills 40 tiles in one frame; the rest go one a frame after).
RA.NOW_PER_FRAME = 2
-- Tiles that showed a unit before they had rows (a set), built first.
RA.waiting = {}

-- Whether the tile has its aura rows yet.
local function built(b)
  return b.debuffRow ~= nil
end

-- What is fixed in a tile's rows once they are made, as one string: the dispel switch and each row's signature
-- (ns.Auras.Signature). A tile built with another string than the settings now give needs its rows made again.
local function rowsSignature(b)
  local z, s = RF.TileZones(), RA.settings
  local parts = { tostring(s.dispel), ns.Auras.Signature(RA.DebuffSpec(b, z, s)), ns.Auras.Signature(RA.HotSpec(b, z, s)) }
  for n = 1, RA.IND_SLOTS do
    local spec = RA.IndicatorSpec(b, z, n)
    parts[#parts + 1] = spec and ns.Auras.Signature(spec) or "-"
  end
  return table.concat(parts, "|")
end

-- Builds a tile's rows and indicators (out of combat).
local function build(b)
  addRows(b)
  addIndicators(b)
  b.auraSignature = rowsSignature(b)
end

-- How many tiles are kept built ahead: every one in a raid (it can grow in a fight), the first
-- group's in a party, none alone.
function RA.TilesAhead()
  if type(IsInRaid) == "function" and IsInRaid() then return #RF.buttons end
  if type(IsInGroup) == "function" and IsInGroup() then return math.min(RA.PARTY_TILES, #RF.buttons) end
  return 0
end

-- The first tile, in the grid's order, still without rows: one waiting for them, else one of the
-- RA.TilesAhead; nil when none is left.
local function nextTile()
  for _, b in ipairs(RF.buttons) do
    if RA.waiting[b] and not built(b) then return b end
  end
  for i = 1, RA.TilesAhead() do
    if not built(RF.buttons[i]) then return RF.buttons[i] end
  end
end

-- One frame's share: the next tile gets its rows (one that waited is refreshed, so they show its
-- unit). True while another may be left.
local function buildOne()
  local b = nextTile()
  if not b then return false end
  build(b)
  if RA.waiting[b] then RA.waiting[b] = nil RF.Update(b) end
  return true
end

-- Builds the rows of the tiles that need them, one tile a frame, out of combat.
function RA.BuildAhead()
  ns.Spread("raid aura rows", buildOne)
end

-- Whether another tile's rows may be built at once this frame (out of combat, at most
-- RA.NOW_PER_FRAME a frame, the frame told by GetTime), counting it when so.
local function buildNow()
  local now = GetTime()
  if ns.InCombat() then return false end
  if RA.nowAt ~= now then RA.nowAt, RA.nowCount = now, 0 end
  if RA.nowCount >= RA.NOW_PER_FRAME then return false end
  RA.nowCount = RA.nowCount + 1
  return true
end

-- Whether a tile has its rows: one that shows a unit before they were built ahead gets them at
-- once while this frame's share allows, else it is queued for them (RA.BuildAhead).
local function ensure(b)
  if built(b) then return true end
  if buildNow() then build(b) return true end
  RA.waiting[b] = true
  RA.BuildAhead()
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

-- Every row of a tile that has them: debuffs, HoTs and the indicators.
local function tileRows(b)
  local rows = { b.debuffRow, b.hotRow }
  for _, row in ipairs(b.indRows or {}) do rows[#rows + 1] = row end
  return rows
end

-- Hides a tile's rows and highlight and lets go of its unit (the module stopped, or the rows are to be made again).
local function clearTile(b)
  for _, row in ipairs(tileRows(b)) do
    row:SetUnit(nil)
    row.frame:Hide()
  end
  if b.dispel then b.dispel:Hide() end
  b.auraUnit, b.indUnit = nil, nil
end

-- Puts a tile's rows away for good, so the next update makes them from the settings (a container can't be reshaped).
local function retireRows(b)
  clearTile(b)
  for _, row in ipairs(tileRows(b)) do ns.Auras.Retire(row) end
  b.debuffRow, b.hotRow, b.indRows, b.auraSignature = nil, nil, nil, nil
end

-- A tile whose rows were made from other settings than now loses them.
local function reconcile(b)
  if built(b) and b.auraSignature ~= rowsSignature(b) then retireRows(b) end
end

-- Adds fn to one of the raid frames' tile hook lists (RF.updateHooks and the others) unless it is there already (the
-- module started again). The raid modules keep their hooks on the lists only while they run, so a running tile
-- update pays nothing for the lifecycle and a stopped module costs the tiles nothing.
function RA.AddHook(list, fn)
  for _, have in ipairs(list) do
    if have == fn then return end
  end
  table.insert(list, fn)
end

-- Takes fn off a raid tile hook list (RA.AddHook).
function RA.RemoveHook(list, fn)
  for i = #list, 1, -1 do
    if list[i] == fn then table.remove(list, i) end
  end
end

-- Module entry point (Core/Modules.lua): hook into raid tiles (existing and new), and build the
-- rows ahead now and whenever the group changes. The hooks are on the parent's lists for as long as the
-- module runs (RA.Disable takes them off).
function RA.Enable(settings, scope)
  RA.settings, RA.scope = settings, scope
  for _, b in ipairs(RF.buttons) do reconcile(b) end
  RA.AddHook(RF.updateHooks, update)
  RA.AddHook(RF.updateHooks, indicatorUpdate)
  RA.AddHook(RF.emptyHooks, emptied)
  RA.AddHook(RF.emptyHooks, indicatorEmptied)
  scope:On("GROUP_ROSTER_UPDATE", RA.BuildAhead)
  RA.BuildAhead()
  if ns.ModulesBuilt() then RF.UpdateAll() end
end

-- Switched off: the hooks leave the tiles' lists and every tile's rows, indicators and highlight are cleared and
-- hidden (kept for the next start, which makes them again only if the settings changed their shape).
function RA.Disable()
  RA.RemoveHook(RF.updateHooks, update)
  RA.RemoveHook(RF.updateHooks, indicatorUpdate)
  RA.RemoveHook(RF.emptyHooks, emptied)
  RA.RemoveHook(RF.emptyHooks, indicatorEmptied)
  RA.waiting = {}
  for _, b in ipairs(RF.buttons) do
    if built(b) then clearTile(b) end
  end
end
