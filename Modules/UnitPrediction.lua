-- Incoming heals and shields on the player, target and party frames: a green bar from the end of the health fill for
-- the heals on their way and a striped one after it for the shield that soaks damage, read through the same client
-- calculator the raid frames use (RH.Prediction, Modules/RaidHealing.lua). A part of the unit frames module (its
-- healPrediction and absorbs settings), in a file of its own; UF.Frames build starts it (UF.Prediction.Attach).
--
-- The amounts may be hidden (Midnight hides some values in instances): they go to the bars untouched, which scale them
-- against the same maximum as the health fill, and are never compared or added up here.

local ADDON, ns = ...

local T = ns.Theme

local UF = ns.GetModule("UnitFrames")
local PR = {}
UF.Prediction = PR

-- The frames that show them: yours, your target's and the party's.
PR.KEYS = { player = true, target = true, party1 = true, party2 = true, party3 = true, party4 = true }
-- The unit events that change what is on its way or soaked (health events repaint through UF.UpdateHealth).
PR.EVENTS = { "UNIT_HEAL_PREDICTION", "UNIT_ABSORB_AMOUNT_CHANGED" }

-- The frame the heal and shield bars sit in: the health bar's size, cutting them at its edges (heals past a full bar
-- stop there). Only these bars are cut: the health bar itself clips nothing, since the client clips every descendant
-- and the frame's text layer is one (the name row over a bare frame, the portrait, the marks and the raid icon all
-- draw past the bar).
local function clipFrame(f)
  local clip = CreateFrame("Frame", nil, f.health)
  clip:SetAllPoints()
  clip:SetClipsChildren(true)
  clip:SetFrameLevel(f.health:GetFrameLevel() + 1)
  return clip
end

-- A bar over the health bar that starts where `after` ends, in a texture: the bar texture for heals, tiled stripes for
-- shields. In the clip frame, one level over the fill, under the frame's text layer.
local function overlay(f, after, color, texture)
  local bar = CreateFrame("StatusBar", nil, f.healClip)
  bar:SetStatusBarTexture(texture)
  T.BarColor(bar, color)
  bar:SetFrameLevel(f.health:GetFrameLevel() + 1)
  bar.after = after
  bar:Hide()
  return bar
end

-- Anchors a bar to the end of `after`'s fill (its right end, or its left while the bars fill from the right), filling
-- the same way, as wide as the whole health bar so one value scales as the health fill does.
local function follow(f, bar)
  local reverse, tex = UF.FillsFromRight(f), bar.after:GetStatusBarTexture()
  local near, far = reverse and "RIGHT" or "LEFT", reverse and "LEFT" or "RIGHT"
  bar:ClearAllPoints()
  bar:SetPoint("TOP" .. near, tex, "TOP" .. far)
  bar:SetPoint("BOTTOM" .. near, tex, "BOTTOM" .. far)
  bar:SetReverseFill(reverse)
  bar:SetWidth(UF.BarWidth(f))
end

-- Lays both bars out again (the look mirrored the fill, or the frame changed size) and paints them: a frame that stood
-- as a banner had them off.
---@param f table a unit frame with the bars
function PR.Place(f)
  follow(f, f.heal)
  follow(f, f.shield)
  PR.Update(f)
end

-- Gives a frame its heal bar, its shield bar and their events, once.
local function add(f)
  f.healClip = clipFrame(f)
  f.heal = overlay(f, f.health, "heal", T.BarTexture())
  f.shield = overlay(f, f.heal, "shield", T.Texture("Stripes"))
  f.shield:GetStatusBarTexture():SetHorizTile(true)
  f.shield:GetStatusBarTexture():SetVertTile(true)
  f.vgPredictionEvents = ns.OnUnit(PR.EVENTS, function() PR.Update(f) end, f.unit)
  PR.Place(f)
end

-- Adds the bars to the frames that show them (once the unit frames are built).
function PR.Attach()
  for key in pairs(PR.KEYS) do
    local f = UF.frames[key]
    if f and not f.heal then add(f) end
  end
end

-- Fills a bar from an amount that is shown while its switch is on and the client gave one; hidden when not, emptied
-- so the shield after it starts at the health edge. A hidden amount is never tested, only handed on.
local function fill(bar, max, amount, on)
  local given = type(amount) ~= "nil"
  bar:SetShown(on and given)
  if not (on and given) then return bar:SetValue(0) end
  bar:SetMinMaxValues(0, max)
  bar:SetValue(amount)
end

-- Paints a frame's heal and shield bars from the client's prediction for its unit. A standing banner's bars run up
-- and these lie across its fill, so they stay off while the frame stands (UF.Standing).
---@param f table a unit frame with the bars
function PR.Update(f)
  if not ns.IsTrue(UnitExists(f.unit)) then return end
  local max, incoming, shields = ns.GetModule("RaidHealing").Prediction(f.unit)
  local lying = not UF.Standing(f)
  fill(f.heal, max, incoming, lying and UF.settings.healPrediction == true)
  fill(f.shield, max, shields, lying and UF.settings.absorbs == true)
end

-- A switch changed (the Unit frames page): every frame paints again.
function PR.Apply()
  for key in pairs(PR.KEYS) do
    if UF.frames[key] and UF.frames[key].heal then PR.Update(UF.frames[key]) end
  end
end
