-- The HUD look (Settings > HUD > HUD look): the shape of the unit frames and of the HUD's tools. "Plain" keeps the
-- flat frames as they were before 0.9.5 (the shield-corner switch cuts the unit frames' corners). "Shield", the
-- default, turns every unit frame into a shield pointing away from your character, its two outer corners cut to a
-- point at mid-height, and gives the shield-corner cuts to the tools (the cast bars, the bar plinth) instead.
-- "Hairline" takes the unit frames' plates away (no fill, no border) and closes each with a brass line under it;
-- "Rimmed" rounds every frame and tool four pixels and draws a two-line rim, the border outside and brass inside. A
-- look is a table: corners (a shape by a painted frame's role, T.HudPanel opts.role: the frame and its painted entry
-- give a corner geometry, Core/Theme.lua, false for square corners, or nil for the plain corners), bare (the roles drawn without a plate), hair
-- (a hairline token by role), hairSides (the hairline's sides, when not all four), outlined (the frames' texts take
-- the outlined roles) and backing (the bar backing's Auto comes on).

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L

-- The looks a player can pick, in the order the control cycles them, and their names.
T.HUD_LOOKS = { "plain", "shield", "hairline", "rimmed" }
T.HUD_LOOK_LABELS = { plain = L["Plain"], shield = L["Shield"], hairline = L["Hairline"], rimmed = L["Rimmed"] }

-- The looks as a cycle row's choices, in order: { key, name } each.
---@return table
function T.HudLookChoices()
  local choices = {}
  for i, look in ipairs(T.HUD_LOOKS) do choices[i] = { look, T.HUD_LOOK_LABELS[look] } end
  return choices
end

-- The depths, in screen pixels, a shield point's line is baked at (Media/Textures/PointLine<depth>, from
-- scripts/lib/media-sources.mjs POINT_DEPTHS, the same list): a frame's point takes the nearest.
T.POINT_DEPTHS = { 12, 14, 16, 18, 20, 22, 24, 30, 36 }
-- A baked line's canvas is the smallest power of two no smaller than its depth, from 16.
local SMALLEST_CANVAS = 16

-- The baked depth nearest `depth` pixels.
local function nearestDepth(depth)
  local best = T.POINT_DEPTHS[1]
  for _, d in ipairs(T.POINT_DEPTHS) do
    if math.abs(d - depth) < math.abs(best - depth) then best = d end
  end
  return best
end

-- The canvas size a depth was baked on.
local function canvasOf(depth)
  local size = SMALLEST_CANVAS
  while size < depth do size = size * 2 end
  return size
end

-- A shield point's line for a corner `depth` pixels deep: the texture baked nearest that depth, and the tex coords
-- cropping its canvas to the depth and flipping it to `point` (T.CORNER_FLIPS).
---@param depth number the corner's depth in screen pixels
---@param point string "TOPLEFT", "TOPRIGHT", "BOTTOMLEFT" or "BOTTOMRIGHT"
---@return string name the texture's name under Media/Textures
---@return table texcoords left, right, top, bottom
function T.PointLine(depth, point)
  local baked = nearestDepth(depth)
  local crop, tc = baked / canvasOf(baked), {}
  for i, v in ipairs(T.CORNER_FLIPS[point]) do tc[i] = v * crop end
  return "PointLine" .. baked, tc
end

-- The two corners on each outer side of a shield: the ones its point is cut from.
local OUTER = { LEFT = { "TOPLEFT", "BOTTOMLEFT" }, RIGHT = { "TOPRIGHT", "BOTTOMRIGHT" } }
T.SHIELD_OUTER = OUTER

-- Half a frame's height in whole pixels: a shield point's depth. While the client hides the frame's size (a fight
-- with secret geometry), the depth it was last painted at.
local function pointDepth(frame, entry)
  local px, h = T.Pixel(frame), ns.PlainNumber(frame:GetHeight())
  if h then return math.floor(h / px / 2) * px end
  return entry.geo and entry.geo.max or 0
end

-- A unit frame's shield point: its two outer corners (opts.outer, "LEFT" unless the frame says "RIGHT") each cut
-- half the frame's height in whole pixels, meeting at mid-height; the inner corners square. Both bars' masks reach
-- the outer corners (a bar's masks past its own rows mask nothing). Nil (square) while the frame has no height.
local function pointGeometry(frame, entry)
  local depth = pointDepth(frame, entry)
  if depth <= 0 then return nil end
  local outer = OUTER[entry.opts.outer] or OUTER.LEFT
  local geo = { r = { TOPLEFT = 0, TOPRIGHT = 0, BOTTOMLEFT = 0, BOTTOMRIGHT = 0 }, art = {}, sides = { TOP = outer, BOTTOM = outer } }
  for _, point in ipairs(outer) do geo.r[point], geo.art[point] = depth, "point" end
  return geo
end

-- A tool's cuts under the Shield look: the shield-corner cuts (T.CORNER_CUT) on all four corners while the switch is
-- on, else nil (plain corners).
local function cutGeometry(frame)
  if not T.Settings().shield then return nil end
  return T.UniformCorners(T.CORNER_CUT * T.Pixel(frame), "cut")
end

-- Square corners whatever the corner settings say (false: a shape, not the plain corners' nil).
local function squareGeometry()
  return false
end

-- The Rimmed look's corner radius, in screen pixels.
local RIM_RADIUS = 4

-- The Rimmed look's corners: four pixels round on every frame and tool.
local function roundGeometry(frame)
  return T.UniformCorners(RIM_RADIUS * T.Pixel(frame), "rounded")
end

-- The looks. Plain shapes nothing: every frame keeps its corner look. Shield points the unit frames and cuts the
-- tools. Hairline bares the unit frames and runs its brass line along their bottom edge only. Rimmed rounds units and
-- tools alike and gives each the brass line inside its border.
local LOOKS = {
  plain = { corners = {} },
  shield = { corners = { unit = pointGeometry, tool = cutGeometry }, backing = true },
  hairline = { corners = { unit = squareGeometry }, bare = { unit = true }, hair = { unit = "accentDim" }, hairSides = { bottom = true }, outlined = true },
  rimmed = { corners = { unit = roundGeometry, tool = roundGeometry }, hair = { unit = "accentDim", tool = "accentDim" }, outlined = true, backing = true },
}

-- The HUD look in force ("plain" for a saved name no release knows).
---@return string
function T.HudLook()
  local look = T.Settings().hudLook
  if LOOKS[look] then return look end
  return "plain"
end

-- The corner geometry the HUD look gives a painted frame with a role: a geometry, false for square corners whatever
-- the corner settings say, or nil for its plain corners (Core/Theme.lua corner.geometry asks before it reads the
-- corner settings).
---@param frame table a painted frame
---@param entry table its painted entry (opts.role, opts.outer)
---@return table|boolean|nil
function T.HudCorners(frame, entry)
  local shape = LOOKS[T.HudLook()].corners[entry.opts.role]
  if not shape then return nil end
  return shape(frame, entry)
end

-- Whether the HUD look draws a painted frame with a role without its plate (no fill, no border): Hairline's unit
-- frames, unless the High contrast variant (flat) is on, which keeps every plate.
---@param entry table a painted entry (opts.role)
---@return boolean
function T.HudBare(entry)
  if (T.Variant() or {}).flat then return false end
  local bare = LOOKS[T.HudLook()].bare
  return bare ~= nil and bare[entry.opts.role] == true
end

-- The hairline token the HUD look gives a painted frame with a role (a frame's own T.SetHairline token wins), or nil.
---@param entry table a painted entry (opts.role)
---@return string|nil
function T.HudHair(entry)
  local hair = LOOKS[T.HudLook()].hair
  return hair and hair[entry.opts.role] or nil
end

-- The sides a hairline keeps under the HUD look ({ bottom = true } for Hairline's line under the frame), or nil for
-- all four.
---@return table|nil
function T.HudHairSides()
  return LOOKS[T.HudLook()].hairSides
end

-- Whether the HUD look's frames draw their texts in the outlined roles (text over the world or on a fill).
---@return boolean
function T.HudOutlined()
  return LOOKS[T.HudLook()].outlined == true
end

-- Whether the HUD look brings the action bars' backing on under Auto.
---@return boolean
function T.HudBacking()
  return LOOKS[T.HudLook()].backing == true
end
