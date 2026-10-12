-- Mover links: a frame's place and size can follow another frame instead of
-- a fixed spot, so a layout keeps its relationships and not just numbers.
--
-- Anchored (its saved entry's rel = { to, side, x, y }): the frame's own
-- opposite edge is pinned to a side of another frame, plus offsets, so it
-- grows away from that frame (anchored to its right, it grows to the right).
-- Its point, relPoint, x and y keep its last screen spot, where it lands
-- while that frame isn't there (its module off), never off screen.
-- Matched (match = { width = key, height = key }): a frame Vanguard may size
-- (cast bars, XP and reputation bars) takes another frame's width or height,
-- and keeps it as that one changes. Its own w and h, when set, are its size.
--
-- A link is worked out to a spot on UIParent each time a frame is placed:
-- no frame is ever anchored to another (protected frames stay safe), and
-- links that would go round in a loop are refused.

local ADDON, ns = ...

local L = ns.Layout
local K = {}
ns.MoverLinks = K

-- Width and height, and the saved field that holds each as the frame's own size.
local DIMS = { width = "w", height = "h" }
-- How each side reads in unlock mode.
local SIDE_NAMES = { LEFT = "Left of", RIGHT = "Right of", TOP = "Above", BOTTOM = "Below" }
-- Frames Vanguard may size: key -> { width = { min, max }, height = { min, max }, onSized, natural }.
local sizable = {}
-- Keys (and dim .. key) being worked out now, so a hand-edited loop falls back instead of going round.
local busy = {}

-- Saved entries --------------------------------------------------------------------------

-- A mover's saved entry, or nil when there is none (or it isn't a table).
local function entryOf(key)
  local p = ns.Settings("positions")[key]
  return type(p) == "table" and p or nil
end

-- A mover's saved entry, made empty when there is none.
local function entry(key)
  local positions = ns.Settings("positions")
  positions[key] = entryOf(key) or {}
  return positions[key]
end

-- A field of a saved entry when it is a table: entry.rel or entry.match.
local function part(p, field)
  return p and type(p[field]) == "table" and p[field] or nil
end

-- The mover a frame is anchored to, or nil.
local function anchoredTo(key)
  local rel = part(entryOf(key), "rel")
  return rel and rel.to
end

-- A function giving the mover whose width or height (dim) a frame matches, or nil.
local function matchOf(dim)
  return function(key) local match = part(entryOf(key), "match") return match and match[dim] end
end

-- Names and numbers -------------------------------------------------------------------------

-- A mover's label ("Player frame"), or its key when it isn't registered.
local function label(key)
  for _, m in ipairs(ns.MoverList()) do
    if m.key == key then return m.label end
  end
  return tostring(key)
end

-- Why a key can't be used: there's no frame by that name.
local function noFrame(key)
  return string.format("There's no frame called %s here (is its module on?).", tostring(key))
end

-- Rounds to the nearest whole number.
local function round(v)
  return math.floor(v + 0.5)
end

-- The screen's width and height in UIParent's units.
local function screen()
  return UIParent:GetWidth() or 0, UIParent:GetHeight() or 0
end

-- A mover's saved scale.
local function scaleOf(key)
  return (ns.MoverLook(key))
end

-- Sizes ------------------------------------------------------------------------------------

-- A size kept to a range { min, max }.
local function within(v, range)
  return math.max(range[1], math.min(range[2], v))
end

-- The width or height (dim) another frame gives a matched mover (in the mover's own units), or nil.
local function matchedSize(key, dim)
  local source = matchOf(dim)(key)
  if not source or not ns.MoverFrame(source) or busy[dim .. key] then return nil end
  busy[dim .. key] = true
  local size = K.Own(source, dim) * scaleOf(source) / scaleOf(key)
  busy[dim .. key] = nil
  return size
end

-- A mover's width or height (dim) in its own units as it should be now: for a frame Vanguard
-- sizes, matched to another frame's, else the size you set, else its own; else what it is.
function K.Own(key, dim)
  local s, f = sizable[key], ns.MoverFrame(key)
  if not (s and s[dim]) then return (dim == "width" and f:GetWidth() or f:GetHeight()) or 0 end
  local own = tonumber((entryOf(key) or {})[DIMS[dim]])
  return within(matchedSize(key, dim) or own or s.natural[dim], s[dim])
end

-- A mover's rect on screen ({ left, bottom, w, h } in UIParent's units), from where it goes and its size.
function K.RectOf(key)
  local point, relPoint, x, y = ns.MoverPoint(key)
  local s = scaleOf(key)
  return L.Rect(point, relPoint, x, y, K.Own(key, "width") * s, K.Own(key, "height") * s, screen())
end

-- Sizes a frame Vanguard may size (as K.Own works it out) and tells its module.
function K.Size(m)
  local s = sizable[m.key]
  if not s then return end
  m.frame:SetSize(K.Own(m.key, "width"), K.Own(m.key, "height"))
  if s.onSized then s.onSized(m.frame) end
end

-- Lets Vanguard size a mover's frame: ranges = { width = { min, max }, height = { min, max } }
-- names the sizes it may set (matched to another frame, or set under General → Layout);
-- onSized(frame) runs after each. Its size now is its own until one is set.
function ns.MoverSizable(key, ranges, onSized)
  local f, before = ns.MoverFrame(key), sizable[key]
  local natural = before and before.natural or { width = f:GetWidth(), height = f:GetHeight() }
  sizable[key] = { width = ranges.width, height = ranges.height, onSized = onSized, natural = natural }
  ns.PlaceMover(key)
end

-- Anchoring -----------------------------------------------------------------------------------

-- The rect an anchored mover takes: its own point at the other frame's side, plus its offsets, on screen.
local function anchoredRect(key, rel)
  local own, theirs = L.SIDES[rel.side][1], L.SIDES[rel.side][2]
  local tx, ty = L.PointAt(K.RectOf(rel.to), theirs)
  local s = scaleOf(key)
  local r = L.RectAt(own, tx + (tonumber(rel.x) or 0), ty + (tonumber(rel.y) or 0), K.Own(key, "width") * s, K.Own(key, "height") * s)
  return L.Clamp(r, screen())
end

-- Remembers where an anchored mover is as its saved spot (against the nearest screen edge):
-- where it lands while the frame it's anchored to isn't there.
local function remember(p, r)
  local point, x, y = L.Anchor(r.left, r.bottom, r.w, r.h, screen())
  p.point, p.relPoint, p.x, p.y = point, point, x, y
end

-- Where an anchored mover goes: its own pinned point on UIParent's bottom left, so it grows
-- away from the frame it's anchored to. Nothing while that frame isn't there (or a loop in a
-- hand-edited profile leads back to it): it stays at its saved spot.
function K.Point(key, p)
  local rel = part(p, "rel")
  if not rel or not L.SIDES[rel.side] or not ns.MoverFrame(rel.to) or busy[key] then return nil end
  busy[key] = true
  local r = anchoredRect(key, rel)
  busy[key] = nil
  remember(p, r)
  local x, y = L.PointAt(r, L.SIDES[rel.side][1])
  return L.SIDES[rel.side][1], "BOTTOMLEFT", x, y
end

-- Sets an anchored mover's offsets so the rect r is where it sits, from the side it's anchored to.
local function offsetsFrom(rel, r)
  local x, y = L.PointAt(r, L.SIDES[rel.side][1])
  local tx, ty = L.PointAt(K.RectOf(rel.to), L.SIDES[rel.side][2])
  rel.x, rel.y = round(x - tx), round(y - ty)
end

-- An anchored mover was dropped, nudged or given a spot (just saved as its point): that spot
-- becomes its offsets from the side it's anchored to, so the link holds.
function K.Saved(key, p)
  local rel = part(p, "rel")
  if not rel or not L.SIDES[rel.side] or not ns.MoverFrame(rel.to) then return end
  local s = scaleOf(key)
  local w, h = K.Own(key, "width") * s, K.Own(key, "height") * s
  offsetsFrom(rel, L.Rect(p.point, p.relPoint or p.point, tonumber(p.x) or 0, tonumber(p.y) or 0, w, h, screen()))
end

-- "Below", "Player frame", and the offsets, for an anchored mover's handle and popover; nil for one that isn't.
function K.Where(key)
  local to, side, x, y = ns.MoverAnchor(key)
  if to then return string.format("%s %s", SIDE_NAMES[side] or tostring(side), label(to)), x, y end
end

-- The frame a mover is anchored to, its side and offsets; nothing for one that isn't anchored.
function ns.MoverAnchor(key)
  local rel = part(entryOf(key), "rel")
  if rel then return rel.to, rel.side, tonumber(rel.x) or 0, tonumber(rel.y) or 0 end
end

-- Following ---------------------------------------------------------------------------------

-- True when following each frame's link (nextOf(key) gives the one it links to) from `from` reaches key.
local function leadsTo(from, key, nextOf)
  local seen = {}
  while from and not seen[from] do
    if from == key then return true end
    seen[from] = true
    from = nextOf(from)
  end
  return false
end

-- True when a saved entry links to key (anchored to it, or matching its size).
local function linksTo(p, key)
  local rel, match = part(p, "rel") or {}, part(p, "match") or {}
  return rel.to == key or match.width == key or match.height == key
end

-- Every mover linked to key, in registration order.
local function dependents(key)
  local out = {}
  for _, m in ipairs(ns.MoverList()) do
    if linksTo(entryOf(m.key), key) then out[#out + 1] = m.key end
  end
  return out
end

-- key moved, was reset, rescaled or resized: every frame linked to it is placed again, and those
-- linked to them in turn, each once.
function K.Changed(key, seen)
  seen = seen or {}
  seen[key] = true
  for _, dep in ipairs(dependents(key)) do
    if not seen[dep] then
      ns.PlaceMover(dep)
      K.Changed(dep, seen)
    end
  end
end

-- Places the frames linked to key again whenever its frame changes size (a bar whose button
-- count changed), after combat if in it. Hooked once per frame.
local function watchSize(key)
  local f = ns.MoverFrame(key)
  if f.vgLinkWatch == key then return end
  f.vgLinkWatch = key
  f:HookScript("OnSizeChanged", ns.Guard("hook OnSizeChanged", function() ns.OutOfCombat(function() K.Changed(key) end, "links " .. key) end))
end

-- A mover was registered (its module built its frame): it watches its size when a frame is
-- linked to it, and the frames linked to it are placed again (they may have been waiting for it).
function K.Registered(key)
  if #dependents(key) > 0 then watchSize(key) end
  K.Changed(key)
end

-- A mover's link changed: it is placed again, and everything following it is told. Returns true.
local function settle(key)
  ns.PlaceMover(key)
  ns.MoverChanged(key)
  return true
end

-- Setting links --------------------------------------------------------------------------------

-- Why a mover can't be anchored to `to` on `side` (nil: it can).
local function anchorRefusal(key, to, side)
  if to == key then return "A frame can't be anchored to itself." end
  if not ns.MoverFrame(to) then return noFrame(to) end
  if side ~= nil and not L.SIDES[side] then return "Pick a side: left, right, top or bottom." end
  if leadsTo(to, key, anchoredTo) then
    return string.format("%s is anchored to %s already (or to a frame anchored to it), so that would go round in a circle.", label(to), label(key))
  end
end

-- Anchors a mover to the screen again, where it is now.
local function detach(key)
  local p, r = entry(key), K.RectOf(key)
  remember(p, r)
  p.rel = nil
  return settle(key)
end

-- Anchors a mover to a side ("LEFT", "RIGHT", "TOP" or "BOTTOM") of another mover (to), x, y
-- from it. Without a side it takes the nearest, and without offsets it stays where it is; without
-- `to` it is anchored to the screen again, where it is. Returns true, or false and why it can't be.
function ns.SetMoverAnchor(key, to, side, x, y)
  if not ns.MoverFrame(key) then return false, noFrame(key) end
  if to == nil or to == "" then return detach(key) end
  local why = anchorRefusal(key, to, side)
  if why then return false, why end
  local now = K.RectOf(key)
  local rel = { to = to, side = side or L.NearestSide(now, K.RectOf(to)) }
  if x and y then rel.x, rel.y = round(x), round(y) else offsetsFrom(rel, now) end
  entry(key).rel = rel
  watchSize(to)
  return settle(key)
end

-- Matching sizes ------------------------------------------------------------------------------

-- Why a matched size can't be: the other frame's size is outside what this one may be (nil: it fits).
local function outOfRange(key, dim, source)
  local size, range = K.Own(source, dim) * scaleOf(source) / scaleOf(key), sizable[key][dim]
  if size >= range[1] and size <= range[2] then return nil end
  return string.format("%s is %d %s; %s can be %d to %d.", label(source), round(size), dim == "width" and "wide" or "tall", label(key), range[1], range[2])
end

-- Why a mover can't match source's width or height (dim); nil when it can (or when unmatching).
local function matchRefusal(key, dim, source)
  if not ns.MoverFrame(key) then return noFrame(key) end
  if source == nil then return nil end
  if not (sizable[key] and sizable[key][dim]) then return string.format("%s sets its own %s, so it can't match another frame's.", label(key), dim) end
  if source == key then return string.format("A frame can't match its own %s.", dim) end
  if not ns.MoverFrame(source) then return noFrame(source) end
  if leadsTo(source, key, matchOf(dim)) then return string.format("%s already matches the %s of %s.", label(source), dim, label(key)) end
  return outOfRange(key, dim, source)
end

-- Matches a mover's width or height (dim: "width" or "height") to another mover's (source), kept
-- as that one changes; no source unmatches it (back to its own size). Returns true, or false and why.
function ns.SetMoverMatch(key, dim, source)
  source = source ~= "" and source or nil
  local why = matchRefusal(key, dim, source)
  if why then return false, why end
  local p = entry(key)
  p.match = part(p, "match") or {}
  p.match[dim] = source
  if not next(p.match) then p.match = nil end
  if source then watchSize(source) end
  return settle(key)
end

-- The mover whose width or height (dim) a mover matches, or nil.
function ns.MoverMatch(key, dim)
  return matchOf(dim)(key)
end

-- A mover's width or height (dim) in its own units, as Vanguard places it (0 for no frame).
function ns.MoverSize(key, dim)
  if not ns.MoverFrame(key) then return 0 end
  return K.Own(key, dim)
end

-- Why a mover's width or height (dim) can't be set now (matched to another frame, or a frame
-- that sizes itself), or nil.
function ns.MoverSizeLock(key, dim)
  local source = ns.MoverMatch(key, dim)
  if source then return string.format("Matched to the %s of %s. To unmatch, right-click its handle in unlock mode (/vg unlock) and set Match %s to None.", dim, label(source), dim) end
  if not (sizable[key] and sizable[key][dim]) then return string.format("%s sets its own %s.", label(key), dim) end
end

-- Sets a mover's own width or height (dim), kept to its range; its size when it was made is saved as unset.
-- Refused while it's matched, or for a frame that sizes itself. Returns true, or false and why.
function ns.SetMoverSize(key, dim, value)
  local why = ns.MoverSizeLock(key, dim)
  if why or type(value) ~= "number" then return false, why end
  local s = sizable[key]
  local v = within(round(value), s[dim])
  entry(key)[DIMS[dim]] = v ~= round(s.natural[dim]) and v or nil
  return settle(key)
end

-- Puts a recorded spot's links back on a mover (Modules/Situations.lua) through the setters, so
-- a link that can't hold now (the frame it names isn't there) is left off.
function ns.RestoreMoverLinks(key, spot)
  local rel, match = part(spot, "rel") or {}, part(spot, "match") or {}
  if rel.to then ns.SetMoverAnchor(key, rel.to, rel.side, tonumber(rel.x) or 0, tonumber(rel.y) or 0) end
  for dim, field in pairs(DIMS) do
    if match[dim] then ns.SetMoverMatch(key, dim, match[dim]) end
    if tonumber(spot[field]) then ns.SetMoverSize(key, dim, tonumber(spot[field])) end
  end
end
