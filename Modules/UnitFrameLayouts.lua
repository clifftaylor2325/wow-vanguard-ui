-- The HUD layouts' parts of the unit frames (a part of the UnitFrames module, UF.Layouts; Core/HudLayout.lua names
-- the layouts and holds their spots and sizes). The keep: one wall (a plate behind your frame, the bars and your
-- target's frame, on the background strata) with a brass parapet along its top and a gatehouse rising from the
-- middle around your cast bar, the crest on its peak. Standards: your frame and your target's stood on end as
-- banners, health rising from the foot to a pointed hem, power a line down the outer side, the name (and level) on a
-- line over the banner, the health percent at the top inside; the focus, pet and target of target as small banners
-- with their bars alone.

local ADDON, ns = ...
local T = ns.Theme
local UF = ns.GetModule("UnitFrames")

local LY = {}
UF.Layouts = LY

-- The keep -------------------------------------------------------------------------------------

-- The keep's small frames: they stand under the big ones, so under the Tabs look they wear no tab (a tab would cover
-- the frame or cast bar over them) and keep their name on the bar.
LY.KEEP_SMALL = { focus = true, pet = true, targettarget = true }

-- Whether a frame is one of the keep's small frames while the keep holds.
---@param f table a unit frame
---@return boolean
function LY.Stacked(f)
  return LY.KEEP_SMALL[f.key] == true and ns.HudLayout() == "fort" and ns.LayoutHolds()
end

-- The movers the keep is pinned to, by the edge each holds up. A spot you dragged one to answers per edge: your
-- frame, your target's or the focus moved hides the wall and gatehouse; bar 1 moved puts the wall's top on your
-- frame (and hides the gatehouse, which stands on the bar); your cast bar moved hides the gatehouse.
LY.KEEP_PINS = { uf_player = "wall", uf_target = "wall", uf_focus = "wall", bar1 = "parapet", cast_player = "gate" }

-- Whether a frame the wall's sides or foot are pinned to has a spot you dragged it to.
local function wallMoved()
  for key, edge in pairs(LY.KEEP_PINS) do
    if edge == "wall" and ns.MoverSaved(key) then return true end
  end
  return false
end

-- Whether the keep's wall shows: the layout in force on a canvas it holds on, with your frame and your target's
-- built and the frames it stands on in the layout's spots.
local function keepShown()
  local built = UF.frames.player ~= nil and UF.frames.target ~= nil
  return ns.HudLayout() == "fort" and ns.LayoutHolds() and built and not wallMoved()
end

-- The bottom bar stack's first bar while it stands in its own spot, else nil.
local function parapetBar()
  if ns.MoverSaved("bar1") then return nil end
  return ns.MoverFrame("bar1")
end

-- The frame the wall's top follows: the first bar in its own spot, else your frame.
local function parapetFrame()
  return parapetBar() or UF.frames.player
end

-- The frame the wall's foot follows: the focus frame under yours, else your frame.
local function footFrame()
  return UF.frames.focus or UF.frames.player
end

-- Pins the wall ns.KEEP.pad past your frame's left edge, your target's right edge, the bars' top and the focus's bottom.
local function anchorWall(w)
  local pad = ns.KEEP.pad
  w:ClearAllPoints()
  w:SetPoint("LEFT", UF.frames.player, "LEFT", -pad, 0)
  w:SetPoint("RIGHT", UF.frames.target, "RIGHT", pad, 0)
  w:SetPoint("TOP", parapetFrame(), "TOP", 0, pad)
  w:SetPoint("BOTTOM", footFrame(), "BOTTOM", 0, -pad)
end

-- Your cast bar while the gatehouse can hold it: in its own spot over the first bar the wall's top follows; else nil.
local function gateCast()
  if ns.MoverSaved("cast_player") or not parapetBar() then return nil end
  return ns.MoverFrame("cast_player")
end

-- Pins the gatehouse ns.KEEP.pad around your cast bar, its foot a pixel down over the wall's top border so the two
-- join; hidden while your cast bar isn't there to hold.
local function anchorGate(w)
  local cast, pad, g = gateCast(), ns.KEEP.pad, w.gate
  g:SetShown(cast ~= nil)
  if not cast then return end
  g:ClearAllPoints()
  g:SetPoint("LEFT", cast, "LEFT", -pad, 0)
  g:SetPoint("RIGHT", cast, "RIGHT", pad, 0)
  g:SetPoint("TOP", cast, "TOP", 0, pad)
  g:SetPoint("BOTTOM", w, "TOP", 0, -T.Pixel(w))
end

-- The gatehouse: a HUD panel in the tool role on the wall, the parapet line along its top, open at the bottom where it
-- meets the wall, the crest centred on its peak.
local function gatehouse(w)
  local g = CreateFrame("Frame", nil, w)
  T.HudPanel(g, { role = "tool", hair = ns.KEEP.parapet, hairSides = { top = true }, open = { bottom = true } })
  g.crest = T.Logo(g, UF.DECK.crest)
  g.crest:SetPoint("CENTER", g, "TOP")
  return g
end

-- The wall: a HUD panel in the tool role on the background strata (under everything between the frames, as the deck
-- is), the brass parapet along its top edge only, with its gatehouse.
local function wall()
  local w = CreateFrame("Frame", "Vanguard_Keep", UIParent)
  w:SetFrameStrata("BACKGROUND")
  T.HudPanel(w, { role = "tool", hair = ns.KEEP.parapet, hairSides = { top = true } })
  w.gate = gatehouse(w)
  return w
end

-- Shows the keep's wall and gatehouse for the layout (made the first time they show), pinned to the frames as they
-- stand now, or hides them.
function LY.ApplyKeep()
  local on = keepShown()
  if on and not UF.keep then UF.keep = wall() end
  if not UF.keep then return end
  UF.keep:SetShown(on)
  if on then anchorWall(UF.keep) anchorGate(UF.keep) end
end

-- Standards ------------------------------------------------------------------------------------

-- A banner's measures, in units: the power line's width down the outer side, how far the name line's foot sits over
-- the banner's top, the health number's inset from the top (under the marks' row), and the raid target icon's room.
LY.STANDARD = { power = 4, labelLift = 2, numberInset = 14 }

-- Whether a frame is one of the big banners (yours and your target's), which carry a name line and a health number;
-- the small ones (focus, pet, target of target) carry only their bars.
---@param f table a unit frame
---@return boolean
function LY.Big(f)
  return f.key == "player" or f.key == "target"
end

-- The other side from one.
local OTHER = { LEFT = "RIGHT", RIGHT = "LEFT" }

-- An offset `x` pointing in from `side`.
local function inward(side, x)
  if side == "RIGHT" then return -x end
  return x
end

-- A banner's hem: both bottom corners cut half the frame's width deep in whole pixels (the point art), meeting at a
-- point under the middle; the top corners square; both bars' masks on the bottom corners. Nil (square) while the
-- frame has no width. From the width the frame was given: a fight may hide the one it reports.
local function hemGeometry(frame)
  local px = T.Pixel(frame)
  local depth = math.floor(frame.vgWidth / px / 2) * px
  if depth <= 0 then return nil end
  local hem = { "BOTTOMLEFT", "BOTTOMRIGHT" }
  local r = { TOPLEFT = 0, TOPRIGHT = 0, BOTTOMLEFT = depth, BOTTOMRIGHT = depth }
  return { r = r, art = { BOTTOMLEFT = "point", BOTTOMRIGHT = "point" }, sides = { TOP = hem, BOTTOM = hem } }
end

-- The corner geometry the HUD layout gives a painted frame (Core/HudLook.lua T.HudCorners asks first): a banner's hem
-- for one of the five frames while they stand, nil otherwise (the look's own corners).
local function layoutShape(frame)
  if frame.key and UF.frames[frame.key] == frame and UF.Standing(frame) then return hemGeometry(frame) end
  return nil
end

-- What the parts riding a frame learn from a banner: the health bar's width (UF.BarWidth, the banner less its edges
-- and the power line) and that the portrait has no room (UF.Portrait.Measure finds none on a standing frame); then they
-- place themselves, each staying off while the frame stands.
local function placeRiders(f)
  f.vgBarWidth = f.vgWidth - 2 * T.Pixel(f) - LY.STANDARD.power
  UF.Portrait.Measure(f)
  UF.PlaceExtras(f)
end

-- Stands a banner's bars on end: the power line down the outer side a pixel in from the edge, the health bar filling
-- the rest, both rising from the foot.
local function layoutStandard(f)
  local px, outer, inner = T.Pixel(f), f.outer, OTHER[f.outer]
  f.health:SetOrientation("VERTICAL") f.power:SetOrientation("VERTICAL")
  f.health:SetReverseFill(false) f.power:SetReverseFill(false)
  f.power:ClearAllPoints() f.health:ClearAllPoints()
  f.power:SetPoint("TOP" .. outer, f, "TOP" .. outer, inward(outer, px), -px)
  f.power:SetPoint("BOTTOM" .. outer, f, "BOTTOM" .. outer, inward(outer, px), px)
  f.power:SetWidth(LY.STANDARD.power)
  f.health:SetPoint("TOP" .. inner, f, "TOP" .. inner, inward(inner, px), -px)
  f.health:SetPoint("BOTTOM" .. outer, f.power, "BOTTOM" .. inner, inward(outer, px), 0)
end

-- A big banner's name line: the name centred over the banner's top (a long one reaches past the banner's sides), the
-- level before it; the small banners show no name.
local function placeLabel(f)
  local big = LY.Big(f)
  f.name:ClearAllPoints()
  f.name:SetPoint("BOTTOM", f, "TOP", 0, LY.STANDARD.labelLift)
  f.name:SetJustifyH("CENTER")
  f.name:SetShown(big)
  if not f.level then return end
  f.level:ClearAllPoints()
  f.level:SetPoint("RIGHT", f.name, "LEFT", -UF.TEXT_INSET, 0)
  f.level:SetShown(big)
end

-- A big banner's health number centred at the top inside, under the marks' row; the small banners show none.
local function placeNumber(f)
  f.healthText:ClearAllPoints()
  f.healthText:SetPoint("TOP", f.health, "TOP", 0, -LY.STANDARD.numberInset)
  f.healthText:SetJustifyH("CENTER")
  f.healthText:SetShown(LY.Big(f))
end

-- The raid target icon over a banner: over the name line on a big one, on the top edge of a small one.
local function placeIcon(f)
  f.raidIcon:ClearAllPoints()
  if LY.Big(f) then return f.raidIcon:SetPoint("BOTTOM", f.name, "TOP", 0, 0) end
  f.raidIcon:SetPoint("CENTER", f, "TOP", 0, UF.RAID_ICON / 2)
end

-- Lays a banner's parts out (UF.PlaceParts, while the frame stands, the texts in their roles already): the bars on
-- end, the name line and health number (big banners), the marks at the inner top corner, the raid target icon over it all.
-- A banner carries no power number (shown again when the frame lies across).
function LY.PlaceStandard(f)
  layoutStandard(f)
  placeLabel(f)
  placeNumber(f)
  f.powerText:Hide()
  UF.PlaceMarks(f, f.outer)
  placeIcon(f)
  placeRiders(f)
end

-- After a canvas or scale change the keep may hold now or no longer (it needs a wide canvas): the frames take their
-- sizes again and the wall follows. Never the whole layout here: UF.ApplyLook re-places a mover, which asks for a
-- rescale, and a rescale calls back here, so that would run every frame for good.
local function onScale()
  UF.ApplySizes()
  LY.ApplyKeep()
end

-- A mover was placed again (a drag, a nudge, a reset): the keep answers when it is one the keep is pinned to.
local function keepPinMoved(key)
  if LY.KEEP_PINS[key] then LY.ApplyKeep() end
end

-- Part entry point (UF.Enable): the layout's shape for the frames, the wall after the world is entered (your cast bar
-- is a mover by then) and after a canvas change.
function LY.Enable()
  T.SetLayoutShape(layoutShape)
  ns.On("PLAYER_ENTERING_WORLD", LY.ApplyKeep)
  ns.OnMoverPlaced(keepPinMoved)
  ns.OnLayoutChanged(UF.ApplyLayout)
  T.OnScale(onScale)
end
