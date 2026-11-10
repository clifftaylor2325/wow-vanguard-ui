-- The HUD layouts (setup's layout step; General → HUD layout): where the frames around your character stand.
-- "Centered" is every module's own default spot. "The keep" (fort) is one wall at the foot of the screen: your frame
-- at the left end over the focus and pet, the bars in the middle under a gatehouse holding your cast bar, your
-- target's frame at the right end over its cast bar and target of target, the chat above the left end; the wall, its
-- brass parapet and the gatehouse are drawn by Modules/UnitFrameLayouts.lua. "Standards" plants your frame and your
-- target's as tall banners either side of your character, health rising from the foot to a pointed hem, the focus
-- and pet beside yours, the target of target beside its, the target's cast bar to the right.
-- A layout is its default spots (Core/Movers.lua ns.LayoutSpots: BOTTOM-anchored, so they rise with the block on a
-- tall canvas; a layout's spot wins over a module's default, a saved position over both) and its frame sizes
-- (ns.LayoutSize). The keep holds only on a canvas ns.KEEP.under wide: narrower ones take the modules' own spots.

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

-- The keep's measures, in units: the least canvas width the wall holds on (under: narrower canvases fall back to
-- the Centered spots and draw no wall), how far the wall reaches past the frames it holds (pad), and the brass
-- parapet's token.
ns.KEEP = { under = 1100, pad = 12, parapet = "accentDim" }

ns.LayoutSpots("fort", {
  uf_player = { "BOTTOM", "BOTTOM", -378, 86, under = ns.KEEP.under },
  uf_target = { "BOTTOM", "BOTTOM", 378, 86, under = ns.KEEP.under },
  uf_focus = { "BOTTOM", "BOTTOM", -430, 52, under = ns.KEEP.under },
  uf_pet = { "BOTTOM", "BOTTOM", -326, 52, under = ns.KEEP.under },
  uf_targettarget = { "BOTTOM", "BOTTOM", 326, 10, under = ns.KEEP.under },
  cast_target = { "BOTTOM", "BOTTOM", 368, 36, under = ns.KEEP.under },
  chat = { "BOTTOM", "BOTTOM", -392, 150, under = ns.KEEP.under },
})

ns.LayoutSpots("standards", {
  uf_player = { "BOTTOM", "BOTTOM", -140, 196 },
  uf_target = { "BOTTOM", "BOTTOM", 140, 196 },
  uf_pet = { "BOTTOM", "BOTTOM", -178, 196 },
  uf_focus = { "BOTTOM", "BOTTOM", -208, 196 },
  uf_targettarget = { "BOTTOM", "BOTTOM", 178, 196 },
  cast_target = { "BOTTOM", "BOTTOM", 320, 196 },
})

-- Each layout's frame sizes by mover key ({ w, h } in units): the keep's wall holds 200 x 40 frames for you and
-- your target over 96 x 24 ones; Standards' banners are 40 x 160, the small ones 24 x 100.
local SIZES = {
  fort = { uf_player = { 200, 40 }, uf_target = { 200, 40 }, uf_focus = { 96, 24 }, uf_pet = { 96, 24 }, uf_targettarget = { 96, 24 } },
  standards = { uf_player = { 40, 160 }, uf_target = { 40, 160 }, uf_focus = { 24, 100 }, uf_pet = { 24, 100 }, uf_targettarget = { 24, 100 } },
}

-- Whether the HUD layout in force holds on this canvas: the keep needs ns.KEEP.under units of width (a canvas the
-- client hides counts as wide enough); the others always hold.
---@return boolean
function ns.LayoutHolds()
  if ns.HudLayout() ~= "fort" then return true end
  local width = ns.PlainNumber(UIParent:GetWidth())
  return width == nil or width >= ns.KEEP.under
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
