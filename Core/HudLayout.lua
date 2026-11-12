-- The HUD layouts (setup's layout step; General → HUD layout): where the frames around your character stand.
-- "Centered" is every module's own default spot. "The keep" (fort) is one wall at the foot of the screen: your frame
-- at the left end over the focus and pet, the bars in the middle under a gatehouse holding your cast bar, your
-- target's frame at the right end over its cast bar and target of target, the chat above the left end; the wall, its
-- brass parapet and the gatehouse are drawn by Modules/UnitFrameLayouts.lua. "Standards" plants your frame and your
-- target's as tall banners either side of your character, health rising from the foot to a pointed hem, the focus
-- (its target beside it) and pet beside yours, the target of target beside its, the target's cast bar to the right.
-- A layout is its default spots (Core/Movers.lua ns.LayoutSpots: BOTTOM-anchored, so they rise with the block on a
-- tall canvas; a layout's spot wins over a module's default, a saved position over both) and its frame sizes
-- (ns.LayoutSize). Each holds only on a canvas wide enough for it (ns.LayoutHolds, which Core/Movers.lua asks too):
-- narrower ones take the modules' own spots. The keep measures itself: its frames stand out past their drawn spots by
-- however much the bar stack is wider than drawn (ns.KeepSpread), and the canvas it needs grows with that and with the
-- bag and menu bar in the corner; Standards needs ns.STANDARDS.least.
-- The keep's frames are marked underFrames, so they rise with the bars as one block and the wall stays behind them.

local ADDON, ns = ...
local L = ns.L

-- The layouts a player can pick, in the order the control cycles them, and their names.
ns.HUD_LAYOUTS = { "centered", "fort", "standards" }
ns.HUD_LAYOUT_LABELS = { centered = L["Centered"], fort = L["The keep"], standards = L["Standards"] }

-- The layouts as a cycle row's choices, in order: { key, name } each.
---@return table
function ns.HudLayoutChoices()
  local choices = {}
  for i, layout in ipairs(ns.HUD_LAYOUTS) do choices[i] = { layout, ns.HUD_LAYOUT_LABELS[layout] } end
  return choices
end

-- The keep's measures, in units: how far the wall reaches past the frames it holds (pad), the brass parapet's token,
-- half the bar stack's width the spots were drawn round (bars: 12 buttons of 38, 2 apart), how far the wall's ends
-- reach from the centre at that width (reach: the target's cast bar's right end, 488, and the pad), the least canvas
-- the keep holds on whatever the corners hold, and the mover in the bottom right corner the wall's end must clear.
ns.KEEP = { pad = 12, parapet = "accentDim", bars = 239, reach = 500, least = 1100, corner = "menustrip" }

-- How far the keep's frames stand out past their drawn spots, on each side: by however much the bar stack's widest
-- bar in its own spot is wider than the bars the spots were drawn round (0 while it is narrower, every bar is off or
-- dragged away, or the action bars are off).
---@return number
function ns.KeepSpread()
  local AB = ns.GetModule("ActionBars")
  local half = AB and AB.StackHalfWidth() or 0
  return math.max(0, half - ns.KEEP.bars)
end

-- A keep spot's x: `x` units from the centre, moved out on its side by the spread (read each time it is placed).
local function outward(x)
  local side = x < 0 and -1 or 1
  return function() return x + side * ns.KeepSpread() end
end

ns.LayoutSpots("fort", {
  uf_player = { "BOTTOM", "BOTTOM", outward(-378), 86, underFrames = true },
  uf_target = { "BOTTOM", "BOTTOM", outward(378), 86, underFrames = true },
  uf_focus = { "BOTTOM", "BOTTOM", outward(-430), 52, underFrames = true },
  uf_pet = { "BOTTOM", "BOTTOM", outward(-326), 52, underFrames = true },
  uf_targettarget = { "BOTTOM", "BOTTOM", outward(326), 12, underFrames = true },
  cast_target = { "BOTTOM", "BOTTOM", outward(368), 37, underFrames = true },
  chat = { "BOTTOM", "BOTTOM", -392, 150 },
})

ns.LayoutSpots("standards", {
  uf_player = { "BOTTOM", "BOTTOM", -140, 196 },
  uf_target = { "BOTTOM", "BOTTOM", 140, 196 },
  uf_pet = { "BOTTOM", "BOTTOM", -178, 196 },
  uf_focus = { "BOTTOM", "BOTTOM", -208, 196 },
  uf_focustarget = { "BOTTOM", "BOTTOM", -238, 196 },
  uf_targettarget = { "BOTTOM", "BOTTOM", 178, 196 },
  cast_target = { "BOTTOM", "BOTTOM", 320, 196 },
})

-- Each layout's frame sizes by mover key ({ w, h } in units): the keep's wall holds 200 x 40 frames for you and
-- your target over 96 x 24 ones; Standards' banners are 40 x 160, the small ones (the focus target's too) 24 x 100.
local SIZES = {
  fort = { uf_player = { 200, 40 }, uf_target = { 200, 40 }, uf_focus = { 96, 24 }, uf_pet = { 96, 24 }, uf_targettarget = { 96, 24 } },
  standards = {
    uf_player = { 40, 160 }, uf_target = { 40, 160 },
    uf_focus = { 24, 100 }, uf_focustarget = { 24, 100 }, uf_pet = { 24, 100 }, uf_targettarget = { 24, 100 },
  },
}

-- The room the bag and menu bar takes in the bottom right corner, measured on a canvas `width` wide: from its left edge
-- to the screen's right (0 while it isn't built, or stands where you dragged it, or the client hides its edge).
local function cornerRoom(width)
  local strip = ns.MoverFrame(ns.KEEP.corner)
  if not strip or ns.MoverSaved(ns.KEEP.corner) then return 0 end
  local scale = ns.PlainNumber(strip:GetScale()) or 1
  local left = (ns.PlainNumber(strip:GetLeft()) or math.huge) * scale
  return math.max(0, width - left)
end

-- The bag and menu bar in the corner changed (it widened or narrowed as the game laid its menu or bags out, or it
-- was dragged, reset or rescaled): the keep may hold now or no longer, so its frames are placed again and its wall
-- judged, after the fight (the unit frames are secure).
local function cornerChanged(key)
  if key ~= ns.KEEP.corner or ns.HudLayout() ~= "fort" then return end
  ns.OutOfCombat(ns.RefitHudLayout, "HUD layout refit")
end
ns.OnMoverPlaced(ns.Guard("keep corner", cornerChanged))

-- The canvas width the keep needs: the wall's right end (ns.KEEP.reach from the centre, out with the spread) clear of
-- the bag and menu bar's corner, the left end as far out on its side, and never under ns.KEEP.least.
---@param width number the canvas's width
---@return number
function ns.KeepNeed(width)
  local half = ns.KEEP.reach + ns.KeepSpread() + cornerRoom(width)
  return math.max(ns.KEEP.least, 2 * half)
end

-- Standards' measures, in units: the least canvas its small banners hold on. The focus target's outer edge stands 250
-- left of centre and the pet bar's default spot ends 328 in from the left edge, so the two clear from 1156 wide; least
-- keeps 12 more on each side (narrower, a 4:3 or 5:4 screen at the game's UI scale, takes the Centered spots).
ns.STANDARDS = { least = 1180 }

-- The canvas width Standards needs.
---@return number
function ns.StandardsNeed()
  return ns.STANDARDS.least
end

-- The canvas width each layout needs, by key, as a function of the canvas's width; a layout with none always holds.
local NEEDS = { fort = ns.KeepNeed, standards = ns.StandardsNeed }

-- Whether the HUD layout in force holds on this canvas: the keep needs ns.KeepNeed's width, Standards
-- ns.StandardsNeed's (a canvas the client hides counts as wide enough); Centered always holds. Core/Movers.lua asks this before a layout's spot applies.
---@return boolean
function ns.LayoutHolds()
  local need = NEEDS[ns.HudLayout()]
  if not need then return true end
  local width = ns.PlainNumber(UIParent:GetWidth())
  return width == nil or width >= need(width)
end

-- A frame's size under the HUD layout in force, by its mover key: w, h in units, or nil when the layout leaves the
-- frame its own size (Centered, a frame no layout sizes, or the keep on a canvas it doesn't hold on).
---@param key string a mover key (uf_player, cast_target...)
---@return number|nil w
---@return number|nil h
function ns.LayoutSize(key)
  local sizes = SIZES[ns.HudLayout()]
  local size = sizes and ns.LayoutHolds() and sizes[key]
  if not size then return nil end
  return size[1], size[2]
end
