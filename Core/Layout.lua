-- Screen geometry for movers, as pure functions (no frames): which screen
-- edge a rect is nearest, and snapping to nearby edges. A position saved
-- against the nearest edge keeps its distance from that edge when the
-- resolution or UI scale changes.

local ADDON, ns = ...

local L = {}
ns.Layout = L

L.SNAP_DISTANCE = 8
-- The gap between frames laid out next to each other by default: between
-- the stacked bottom action bars, and above the player cast bar for the
-- Healing layout (Core/Setup.lua).
L.GAP = 6

-- Rounds to the nearest whole pixel.
local function round(v)
  return math.floor(v + 0.5)
end

-- Horizontal anchor for a rect: LEFT/RIGHT in the outer thirds, else center; with the x offset.
local function horizontal(left, w, sw)
  local cx = left + w / 2
  if cx < sw / 3 then
    return "LEFT", left
  elseif cx > sw * 2 / 3 then
    return "RIGHT", left + w - sw
  end
  return "", cx - sw / 2
end

-- Vertical anchor for a rect: TOP/BOTTOM in the outer thirds, else center; with the y offset.
local function vertical(bottom, h, sh)
  local cy = bottom + h / 2
  if cy > sh * 2 / 3 then
    return "TOP", bottom + h - sh
  elseif cy < sh / 3 then
    return "BOTTOM", bottom
  end
  return "", cy - sh / 2
end

-- The point (e.g. "TOPLEFT", "CENTER") and x, y offsets that hold a rect
-- ({ left, bottom, w, h }) against the nearest edge of a screen ({ w, h }).
function L.Anchor(r, screen)
  local hp, x = horizontal(r.left, r.w, screen.w)
  local vp, y = vertical(r.bottom, r.h, screen.h)
  local point = vp .. hp
  return point ~= "" and point or "CENTER", round(x), round(y)
end

-- The smallest shift (within the snap distance) that lines one of `edges` up
-- with one of `targets`; 0 when nothing is close. An exact line-up (a shift of 0)
-- is kept: nothing after it replaces it.
local function bestShift(edges, targets)
  local best
  for _, e in ipairs(edges) do
    for _, t in ipairs(targets) do
      local d = t - e
      if math.abs(d) <= L.SNAP_DISTANCE and (not best or math.abs(d) < math.abs(best)) then
        best = d
      end
    end
  end
  return best or 0
end

-- Snap targets from other rects ({ left, bottom, w, h }) plus the screen's center lines.
local function targets(others, sw, sh)
  local xs, ys = { sw / 2 }, { sh / 2 }
  for _, o in ipairs(others) do
    xs[#xs + 1], xs[#xs + 2] = o.left, o.left + o.w
    ys[#ys + 1], ys[#ys + 2] = o.bottom, o.bottom + o.h
  end
  return xs, ys
end

-- The rect r moved so an edge or center lines up with a nearby frame edge
-- or the screen center, when one is within SNAP_DISTANCE.
function L.Snap(r, others, screen)
  local xs, ys = targets(others, screen.w, screen.h)
  local dx = bestShift({ r.left, r.left + r.w, r.left + r.w / 2 }, xs)
  local dy = bestShift({ r.bottom, r.bottom + r.h, r.bottom + r.h / 2 }, ys)
  return { left = r.left + dx, bottom = r.bottom + dy, w = r.w, h = r.h }
end

-- Rects and points --------------------------------------------------------------------------

-- Anchoring to another frame's side: the frame's own point pinned there, and
-- the other frame's point it is pinned to. To the right of a frame, its left
-- edge is pinned, so it grows to the right (and so on for each side).
L.SIDES = { LEFT = { "RIGHT", "LEFT" }, RIGHT = { "LEFT", "RIGHT" }, TOP = { "BOTTOM", "TOP" }, BOTTOM = { "TOP", "BOTTOM" } }

-- Where a named point ("TOPLEFT", "RIGHT", "CENTER", ...) of a rect
-- ({ left, bottom, w, h }) is: x, y.
function L.PointAt(r, point)
  local x = point:find("LEFT") and r.left or point:find("RIGHT") and r.left + r.w or r.left + r.w / 2
  local y = point:find("TOP") and r.bottom + r.h or point:find("BOTTOM") and r.bottom or r.bottom + r.h / 2
  return x, y
end

-- The w x h rect whose named point sits at x, y.
function L.RectAt(point, x, y, w, h)
  local px, py = L.PointAt({ left = 0, bottom = 0, w = w, h = h }, point)
  return { left = x - px, bottom = y - py, w = w, h = h }
end

-- The rect of a frame (size: { w, h }) whose anchor point (anchor: { point, relPoint, x, y }) sits
-- at relPoint of a screen ({ w, h }), offset by x, y.
function L.Rect(anchor, size, screen)
  local ax, ay = L.PointAt({ left = 0, bottom = 0, w = screen.w, h = screen.h }, anchor.relPoint)
  return L.RectAt(anchor.point, ax + anchor.x, ay + anchor.y, size.w, size.h)
end

-- The number v kept to min..max.
function L.Within(v, min, max)
  return math.max(min, math.min(max, v))
end

-- A rect moved as little as it takes to be on a sw x sh screen (one bigger
-- than the screen starts at its left or bottom edge).
function L.Clamp(r, sw, sh)
  local left = math.max(0, math.min(r.left, sw - r.w))
  local bottom = math.max(0, math.min(r.bottom, sh - r.h))
  return { left = left, bottom = bottom, w = r.w, h = r.h }
end

-- How far a rect's low edge v (size long) moves to sit within lo..hi: 0 when it is inside already, or when
-- it is too big to fit (a frame taller than the screen keeps its top where its anchor puts it).
local function shiftInto(v, size, lo, hi)
  if size > hi - lo then return 0 end
  return math.max(lo, math.min(v, hi - size)) - v
end

-- The shift dx, dy that moves a rect ({ left, bottom, w, h }) as little as it takes onto a screen ({ w, h })
-- less its room ({ left, right, bottom, top }: room kept clear at those edges, each may be missing).
function L.FitShift(r, screen, room)
  room = room or {}
  local dx = shiftInto(r.left, r.w, room.left or 0, screen.w - (room.right or 0))
  local dy = shiftInto(r.bottom, r.h, room.bottom or 0, screen.h - (room.top or 0))
  return dx, dy
end

-- The side of rect t ("LEFT", "RIGHT", "TOP" or "BOTTOM") that rect r is nearest to.
function L.NearestSide(r, t)
  local dx = (r.left + r.w / 2) - (t.left + t.w / 2)
  local dy = (r.bottom + r.h / 2) - (t.bottom + t.h / 2)
  if math.abs(dx) * (t.h + r.h) > math.abs(dy) * (t.w + r.w) then return dx < 0 and "LEFT" or "RIGHT" end
  return dy < 0 and "BOTTOM" or "TOP"
end

-- The block around your character -----------------------------------------------------------

-- The Centered layout's spots are drawn for a canvas 768 units tall. On a taller one, every spot anchored to the
-- bottom centre rises by `share` of the extra height, so the bars, frames and cooldown rows stay one block under
-- your character instead of keeping to the screen's bottom edge. Once the rise is at least a `row`, the part under
-- your frames (spots marked `underFrames`: the bars, your cast bar and swing timer, the vehicle exit and the
-- Cooldown Manager's main row) rises a row less, so that row gets a line of its own between your swing timer and
-- the debuffs under your target, `roomyRow` wide (Modules/GameTools.lua). The share is about where your
-- character's feet stand at the game's default camera; it needs an in-game look.
L.HUD = { base = 768, share = 1 / 3, row = 72, roomyRow = 560 }

-- How far the block rises on a canvas `height` units tall: 0 up to 768.
---@param height number?
---@return number
function L.HudRise(height)
  return math.floor(math.max(0, ((height or 0) - L.HUD.base) * L.HUD.share))
end

-- Whether a canvas `height` tall has room for the cooldown row's own line under your frames.
---@param height number?
---@return boolean
function L.HudRoom(height)
  return L.HudRise(height) >= L.HUD.row
end

-- How far a default spot ({ point, relPoint, x, y }) rises on a canvas `height` tall: one anchored to the bottom
-- centre rises with the block (one marked `edge`, the XP and reputation bars, keeps to the screen's edge), and
-- one under your frames (`underFrames`) a row less once there is room.
---@param spot table
---@param height number?
---@return number
function L.HudLift(spot, height)
  if spot[2] ~= "BOTTOM" or spot.edge then return 0 end
  local rise = L.HudRise(height)
  if spot.underFrames and L.HudRoom(height) then return rise - L.HUD.row end
  return rise
end
