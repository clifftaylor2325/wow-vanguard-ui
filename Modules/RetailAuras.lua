-- Private auras on Retail (WoW Retail only: the TOC keeps this file off WoW Forever). A boss fight can give a
-- player auras the client hides from addons; the game draws such an aura itself, in a spot an addon hands it
-- (C_UnitAuras.AddPrivateAuraAnchor, UnitAuraDocumentation.lua). Vanguard hands it two:
--   * one in the middle of each raid tile (its tile hooks on Modules/RaidFrames.lua, kept with Raid debuffs and HoTs off), moved to the tile's new unit
--     as the roster shifts (the game's own raid frames do the same, CompactUnitFrame.lua);
--   * one right of the target frame, over the target of target (Modules/FrameAuras.lua's frame parts), handed again
--     on a new target;
--   * six left of your own buffs and debuffs (Modules/PlayerAuras.lua's client parts), for the player's own, which
--     the game's debuff frame draws until Vanguard parks it.
-- Nothing about the aura is read here: the game draws it, its icon and its sweep, in the spot.

local ADDON, ns = ...

local RF, RA, FA = ns.GetModule("RaidFrames"), ns.GetModule("RaidAuras"), ns.GetModule("FrameAuras")

local PA = {}
ns.PrivateAuras = PA

-- The gap between the target of target and the target's spot, and how much larger than a debuff the spot is.
-- PA.CLEAR: how far right of the target frame the spot starts, past its corner mark and the Versus deck's edge.
-- PA.PLAYER_SPOTS: how many of your own private auras are drawn (the game's debuff frame has six).
PA.GAP, PA.GROW, PA.CLEAR, PA.PLAYER_SPOTS = 4, 4, 8, 6

-- Hands the game the spot on holder for unit's private aura (the holder's auraIndex, else the first), an icon
-- size across, and gives back its id.
local function anchor(holder, unit, size)
  return ns.CallIf(C_UnitAuras, "AddPrivateAuraAnchor", { unitToken = unit, auraIndex = holder.auraIndex or 1, parent = holder,
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
-- check, resurrection or summon mark in the middle shows over the aura while it lasts (raid frames setup hook).
function PA.TileSetup(b)
  b.privateAura = PA.Spot(b, RF.TileZones().icon + PA.GROW, RA.LEVEL_ABOVE + 1)
  b.privateAura:SetPoint("CENTER", b.health or b, "CENTER", 0, 0)
end

-- Points the tile's spot at its unit, when that changed (raid frames update hook).
function PA.TileUpdate(b, unit)
  if b.privateAura.unit ~= unit then PA.Point(b.privateAura, unit) end
end

-- An emptied tile's spot points at nobody (raid frames empty hook).
function PA.TileEmptied(b)
  if b.privateAura.unit ~= nil then PA.Point(b.privateAura, nil) end
end

-- The raid frames' own hooks, not the Raid debuffs module's: the game's raid frames are hidden, so the spot
-- stays when that module is off.
table.insert(RF.setupHooks, PA.TileSetup)
table.insert(RF.updateHooks, PA.TileUpdate)
table.insert(RF.emptyHooks, PA.TileEmptied)

-- The target frame ---------------------------------------------------------------------------

-- The target's spot right of its frame, raised PA.GAP over the target of target that sits there (Modules/UnitFrames.lua
-- LAYOUT; both stand on the same line), a debuff and a bit across, handed again on each new target (the token
-- then means someone else). Left of the frame is the Cooldown Manager's row (Modules/GameTools.lua).
function PA.TargetPart(f, key, settings)
  if key ~= "target" then return end
  local holder = PA.Spot(f, settings.size + PA.GROW, 1)
  local below = ns.GetModule("UnitFrames").LAYOUT_BY_KEY.targettarget.h
  holder:SetPoint("BOTTOMLEFT", f, "BOTTOMRIGHT", PA.CLEAR, below + PA.GAP)
  PA.target = holder
  PA.Point(holder, "target")
  ns.On("PLAYER_TARGET_CHANGED", function() PA.Point(holder, "target") end)
end

table.insert(FA.CLIENT_PARTS, PA.TargetPart)

-- Your own auras ------------------------------------------------------------------------------

-- Your private aura number index: a spot size across, right to left from the row's right edge, handed the player.
local function playerSpot(row, size, index)
  local spot = PA.Spot(row, size, 1)
  spot.auraIndex = index
  spot:SetPoint("RIGHT", row, "RIGHT", -(index - 1) * (size + PA.GAP), 0)
  PA.Point(spot, "player")
end

-- A row of your private aura spots left of your buffs and debuffs. It hangs on the block's holder but not under it,
-- so the Calm HUD's fade of the block never hides a mechanic. The token "player" is fixed: no re-pointing.
function PA.PlayerPart(holder, settings)
  local size = settings.size + PA.GROW
  local row = CreateFrame("Frame", nil, UIParent)
  row:SetSize(PA.PLAYER_SPOTS * (size + PA.GAP), size)
  row:SetPoint("RIGHT", holder, "LEFT", -PA.GAP, 0)
  for index = 1, PA.PLAYER_SPOTS do playerSpot(row, size, index) end
end

table.insert(ns.GetModule("PlayerAuras").CLIENT_PARTS, PA.PlayerPart)
