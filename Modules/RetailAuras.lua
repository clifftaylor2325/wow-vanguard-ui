-- Private auras on Retail (WoW Retail only: the TOC keeps this file off WoW Forever). A boss fight can give a
-- player auras the client hides from addons; the game draws such an aura itself, in a spot an addon hands it
-- (C_UnitAuras.AddPrivateAuraAnchor, UnitAuraDocumentation.lua). Vanguard hands it two:
--   * one in the middle of each raid tile (Modules/RaidAuras.lua's tile hooks), moved to the tile's new unit
--     as the roster shifts (the game's own raid frames do the same, CompactUnitFrame.lua);
--   * one right of the target frame (Modules/FrameAuras.lua's frame parts), handed again on a new target.
-- Nothing about the aura is read here: the game draws it, its icon and its sweep, in the spot.

local ADDON, ns = ...

local RF, RA, FA = ns.GetModule("RaidFrames"), ns.GetModule("RaidAuras"), ns.GetModule("FrameAuras")

local PA = {}
ns.PrivateAuras = PA

-- The gap between the target frame and its spot, and how much larger than a debuff the spot is.
PA.GAP, PA.GROW = 4, 4

-- Hands the game the spot on holder for unit's first private aura, an icon size across, and gives back its id.
local function anchor(holder, unit, size)
  return ns.CallIf(C_UnitAuras, "AddPrivateAuraAnchor", { unitToken = unit, auraIndex = 1, parent = holder,
    showCooldownFrame = true, showCooldownEdge = false, showCountdownNumbers = false, showDispelIcon = false, isContainer = false,
    iconInfo = { iconWidth = size, iconHeight = size,
      iconAnchor = { point = "CENTER", relativeTo = holder, relativePoint = "CENTER", offsetX = 0, offsetY = 0 } } })
end

-- Points a spot at unit (nil: at nobody): the spot handed for its last unit is taken back first.
function PA.Point(holder, unit)
  if holder.anchorID then ns.CallIf(C_UnitAuras, "RemovePrivateAuraAnchor", holder.anchorID) end
  holder.unit, holder.anchorID = unit, nil
  if unit then holder.anchorID = anchor(holder, unit, holder:GetWidth()) end
end

-- A spot of size on parent, its own frame above the parent's other layers (above an aura row by lift levels).
function PA.Spot(parent, size, lift)
  local holder = CreateFrame("Frame", nil, parent)
  holder:SetSize(size, size)
  holder:SetFrameLevel(parent:GetFrameLevel() + lift)
  return holder
end

-- Raid tiles --------------------------------------------------------------------------------

-- Gives a tile its spot, a debuff icon across, in the middle of its health bar, under the tile's overlay, so a ready
-- check, resurrection or summon mark in the middle shows over the aura while it lasts (RaidAuras setup hook).
function PA.TileSetup(b)
  b.privateAura = PA.Spot(b, RF.TileZones().icon + PA.GROW, RA.LEVEL_ABOVE + 1)
  b.privateAura:SetPoint("CENTER", b.health or b, "CENTER", 0, 0)
end

-- Points the tile's spot at its unit, when that changed (RaidAuras update hook).
function PA.TileUpdate(b, unit)
  if b.privateAura.unit ~= unit then PA.Point(b.privateAura, unit) end
end

-- An emptied tile's spot points at nobody (RaidAuras empty hook).
function PA.TileEmptied(b)
  if b.privateAura.unit ~= nil then PA.Point(b.privateAura, nil) end
end

table.insert(RA.CLIENT_HOOKS.setup, PA.TileSetup)
table.insert(RA.CLIENT_HOOKS.update, PA.TileUpdate)
table.insert(RA.CLIENT_HOOKS.empty, PA.TileEmptied)

-- The target frame ---------------------------------------------------------------------------

-- The target's spot right of its frame, a debuff and a bit across, handed again on each new target (the token
-- then means someone else).
function PA.TargetPart(f, key, settings)
  if key ~= "target" then return end
  local holder = PA.Spot(f, settings.size + PA.GROW, 1)
  holder:SetPoint("LEFT", f, "RIGHT", PA.GAP, 0)
  PA.target = holder
  PA.Point(holder, "target")
  ns.On("PLAYER_TARGET_CHANGED", function() PA.Point(holder, "target") end)
end

table.insert(FA.CLIENT_PARTS, PA.TargetPart)
