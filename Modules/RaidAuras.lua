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

local ADDON, ns = ...

local T = ns.Theme
local RF = ns.GetModule("RaidFrames")

local RA = ns.Module("RaidAuras", {
  defaults = { dispel = true, debuffs = 3, hots = true, maxHots = 3 },
})

-- The client's filter for debuffs you can dispel.
RA.DISPELLABLE = "HARMFUL|RAID"

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
-- drive them, they stay hidden rather than showing uncolored.
function RA.DispelParts(host, b)
  local wash = T.Snap(host:CreateTexture(nil, "ARTWORK"))
  wash:SetTexture(T.Texture("Fade"))
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
    ns.AuraEngine.RegisterDispel(button, { wash }, 0.35)
    ns.AuraEngine.RegisterDispel(button, edges, 1)
  end
end

-- On the fallback: the tile's own wash and edge, painted on each refresh.
local function legacyDispel(b)
  b.dispel = CreateFrame("Frame", nil, b)
  b.dispel:SetAllPoints()
  b.dispel:SetFrameLevel(b:GetFrameLevel() + 10)
  b.dispel.wash, b.dispel.edges = RA.DispelParts(b.dispel, b)
  b.dispel:Hide()
end

-- Paints the fallback wash and edge for the first debuff you can dispel, or hides them.
local function paintDispel(b, unit)
  local aura = RA.settings.dispel and ns.Auras.Get(unit, 1, RA.DISPELLABLE)
  b.dispel:SetShown(aura ~= nil and aura ~= false)
  if not aura then return end
  local r, g, bl = ns.Auras.DispelColor(unit, aura)
  b.dispel.wash:SetVertexColor(r, g, bl, 0.35)
  b.dispel.wash:Show()
  for _, t in ipairs(b.dispel.edges) do t:SetVertexColor(r, g, bl); t:Show() end
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

-- Adds the aura rows to a raid button (RF setup hook). The fallback highlight
-- follows the debuff row, which carries the engine's: it is read right after
-- that row is built, so a refusal on the hot row can't give the tile both.
local function setup(b)
  local z, s = RF.TileZones(), RA.settings
  b.debuffRow = ns.Auras.Container(b, RA.DebuffSpec(b, z, s), nil)
  local legacy = ns.Auras.BackendName() == "fallback"
  b.hotRow = ns.Auras.Container(b, RA.HotSpec(b, z, s), nil)
  if legacy then legacyDispel(b) end
end

-- Updating ------------------------------------------------------------------------------

-- Points the rows at the button's unit, hides them on the dead and offline,
-- and paints the fallback highlight (RF update hook).
local function update(b, unit)
  if b.auraUnit ~= unit then
    b.auraUnit = unit
    b.debuffRow:SetUnit(unit)
    b.hotRow:SetUnit(unit)
  end
  b.debuffRow.frame:SetShown(not b.down)
  b.hotRow.frame:SetShown(not b.down)
  if b.dispel then paintDispel(b, unit) end
end

-- Repaints a tile's fallback highlight, if it has one.
local function repaint(b, unit)
  if b.dispel then paintDispel(b, unit) end
end

-- UNIT_AURA: repaint the fallback highlight on the tile showing that unit.
local function onAura(_, unit)
  RF.ForUnit(unit, repaint)
end

-- Module entry point (Core/Modules.lua): hook into raid buttons (existing and new).
function RA.Enable(settings)
  RA.settings = settings
  for _, b in ipairs(RF.buttons) do setup(b) end
  table.insert(RF.setupHooks, setup)
  table.insert(RF.updateHooks, update)
  ns.On("UNIT_AURA", onAura)
end
