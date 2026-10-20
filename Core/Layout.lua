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

-- A rect moved as little as it takes to be on a sw x sh screen (one bigger
-- than the screen starts at its left or bottom edge).
function L.Clamp(r, sw, sh)
  local left = math.max(0, math.min(r.left, sw - r.w))
  local bottom = math.max(0, math.min(r.bottom, sh - r.h))
  return { left = left, bottom = bottom, w = r.w, h = r.h }
end

-- The side of rect t ("LEFT", "RIGHT", "TOP" or "BOTTOM") that rect r is nearest to.
function L.NearestSide(r, t)
  local dx = (r.left + r.w / 2) - (t.left + t.w / 2)
  local dy = (r.bottom + r.h / 2) - (t.bottom + t.h / 2)
  if math.abs(dx) * (t.h + r.h) > math.abs(dy) * (t.w + r.w) then return dx < 0 and "LEFT" or "RIGHT" end
  return dy < 0 and "BOTTOM" or "TOP"
end
