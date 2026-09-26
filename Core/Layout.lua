-- Screen geometry for movers, as pure functions (no frames): which screen
-- edge a rect is nearest, and snapping to nearby edges. A position saved
-- against the nearest edge keeps its distance from that edge when the
-- resolution or UI scale changes.

local ADDON, ns = ...

local L = {}
ns.Layout = L

L.SNAP_DISTANCE = 8

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
-- (left, bottom, width, height) against the nearest edge of a sw x sh screen.
function L.Anchor(left, bottom, w, h, sw, sh)
  local hp, x = horizontal(left, w, sw)
  local vp, y = vertical(bottom, h, sh)
  local point = vp .. hp
  return point ~= "" and point or "CENTER", round(x), round(y)
end

-- The smallest shift (within the snap distance) that lines one of `edges` up
-- with one of `targets`; 0 when nothing is close.
local function bestShift(edges, targets)
  local best = 0
  for _, e in ipairs(edges) do
    for _, t in ipairs(targets) do
      local d = t - e
      if math.abs(d) <= L.SNAP_DISTANCE and (best == 0 or math.abs(d) < math.abs(best)) then
        best = d
      end
    end
  end
  return best
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

-- left, bottom moved so an edge or center lines up with a nearby frame edge
-- or the screen center, when one is within SNAP_DISTANCE.
function L.Snap(left, bottom, w, h, others, sw, sh)
  local xs, ys = targets(others, sw, sh)
  local dx = bestShift({ left, left + w, left + w / 2 }, xs)
  local dy = bestShift({ bottom, bottom + h, bottom + h / 2 }, ys)
  return left + dx, bottom + dy
end
