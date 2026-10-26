-- Layout for the TEST-ONLY WoW stub (scripts/lib/wow-stub.lua): anchors and
-- sizes resolve to screen rects, the way the client lays frames out, so a
-- test can ask where something is drawn. Loads after the stub.
--
-- Rects are in screen pixels with the origin at the bottom left, as in the
-- client. A frame's own-scale values (GetLeft, GetWidth...) divide by its
-- effective scale. A frame with no anchor sits at its parent's top left,
-- as the UI preview draws it. Rects are recomputed after any change that
-- can move something (stub.layoutGen counts those).

local stub = __wfgStub
local methods = stub.methods

stub.layoutGen = 0
stub.rectCache = {}

-- The default screen, and UIParent's size, until a test sets another.
stub.screen = { width = 1920, height = 1080 }
UIParent:SetSize(stub.screen.width, stub.screen.height)

-- Marks every cached rect stale.
local function invalidate()
  stub.layoutGen = stub.layoutGen + 1
end
stub.invalidateLayout = invalidate

-- Reverse fill on status bars, recorded for the fill rect.
function methods:SetReverseFill(on) self.__reverseFill = on == true end
function methods:GetReverseFill() return self.__reverseFill == true end

-- Wraps a method so calling it invalidates the layout.
local function moving(name)
  local orig = methods[name]
  methods[name] = function(self, ...)
    invalidate()
    if orig then return orig(self, ...) end
  end
end

for _, name in ipairs({
  "SetPoint", "ClearAllPoints", "SetAllPoints", "SetSize", "SetWidth", "SetHeight", "SetScale",
  "SetParent", "SetText", "SetFont", "SetScrollChild", "SetValue", "SetMinMaxValues", "SetReverseFill",
}) do
  moving(name)
end

-- The screen rect (UIParent's, at its scale).
local function screenRect()
  local s = UIParent.__scale or 1
  return { left = 0, bottom = 0, width = (UIParent.__width or 0) * s, height = (UIParent.__height or 0) * s }
end

local rectOf

-- The width a font string's text takes (its set width when it has one; scripts/lib/wow-text.lua measures it).
local textWidth = stub.textWidth

-- The height a font string's text takes (its set height when it has one), wrapped at width units.
local function textHeight(w, width)
  if w.__height then return w.__height end
  return stub.textHeight(w, width)
end

-- The width a widget asks for, in its own units.
local function askedWidth(w)
  if w.__kind == "FontString" then return textWidth(w) end
  return w.__width or 0
end

-- The height a widget asks for in its own units; a font string's text wraps at width units (as laid out).
local function askedHeight(w, width)
  if w.__kind == "FontString" then return textHeight(w, width) end
  return w.__height or 0
end

-- Screen position of a named point (TOPLEFT, CENTER...) on a rect.
local function pointOn(r, point)
  local x = r.left + r.width / 2
  if point:find("LEFT") then x = r.left elseif point:find("RIGHT") then x = r.left + r.width end
  local y = r.bottom + r.height / 2
  if point:sub(1, 3) == "TOP" then y = r.bottom + r.height elseif point:sub(1, 6) == "BOTTOM" then y = r.bottom end
  return x, y
end

-- The scroll frame this widget is the scroll child of, if any.
local function scrollOwner(w)
  return stub.scrollOwners[w]
end

-- The anchors to lay a widget out by, in a stable order; an unanchored
-- widget gets its scroll frame's (else its parent's) top left.
local function anchorsOf(w)
  local list = {}
  for _, p in pairs(w.__points) do list[#list + 1] = p end
  table.sort(list, function(a, b) return a.point < b.point end)
  if #list == 0 then
    list[1] = { point = "TOPLEFT", rel = scrollOwner(w) or w.__parent, relPoint = "TOPLEFT", x = 0, y = 0 }
  end
  return list
end

-- Which edge an anchor pins on one axis: "L"/"R"/"C" horizontally, "T"/"B"/"C" vertically.
local function edgeKinds(point)
  local h = point:find("LEFT") and "L" or point:find("RIGHT") and "R" or "C"
  local v = point:sub(1, 3) == "TOP" and "T" or point:sub(1, 6) == "BOTTOM" and "B" or "C"
  return h, v
end

-- One anchor as the pinned edges { h = kind, x = px, v = kind, y = px }.
local function anchorEdges(w, p, scale)
  local x, y = pointOn(rectOf(p.rel), p.relPoint or p.point)
  local h, v = edgeKinds(p.point)
  return { h = h, x = x + (p.x or 0) * scale, v = v, y = y + (p.y or 0) * scale }
end

-- The first edge of a kind among the anchors, as its coordinate.
local function pinned(edges, axis, kind)
  for _, e in ipairs(edges) do
    if e[axis == "x" and "h" or "v"] == kind then return e[axis] end
  end
end

-- Start and extent along one axis: both sides pinned, one side, or a center.
local function solve(edges, axis, extent, lo, hi)
  local a, b = pinned(edges, axis, lo), pinned(edges, axis, hi)
  if a and b then return a, b - a end
  if a then return a, extent end
  if b then return b - extent, extent end
  local c = pinned(edges, axis, "C") or 0
  return c - extent / 2, extent
end

-- A number as the client draws it: a secret's hidden number (the client fills a
-- bar by a secret value it won't tell addons), anything else as it is.
local function drawn(v)
  if type(v) == "table" and rawget(v, "__secret") then return rawget(v, "n") end
  return v
end

-- A status bar's fill texture: the bar's rect cut to the value's share.
local function fillRect(w)
  local bar = w.__parent
  local r = rectOf(bar)
  local lo, hi = drawn(bar.__min) or 0, drawn(bar.__max) or 1
  local v = drawn(bar.__value)
  local share = type(v) == "number" and type(lo) == "number" and type(hi) == "number" and hi > lo and math.max(0, math.min(1, (v - lo) / (hi - lo))) or 0
  local width = r.width * share
  local left = bar.__reverseFill and r.left + r.width - width or r.left
  return { left = left, bottom = r.bottom, width = width, height = r.height }
end

-- A widget's rect from its anchors and asked size.
local function anchoredRect(w)
  local scale = w:GetEffectiveScale()
  local edges = {}
  for i, p in ipairs(anchorsOf(w)) do edges[i] = anchorEdges(w, p, scale) end
  local left, width = solve(edges, "x", askedWidth(w) * scale, "L", "R")
  local bottom, height = solve(edges, "y", askedHeight(w, width / scale) * scale, "B", "T")
  return { left = left, bottom = bottom, width = width, height = height }
end

-- A widget's screen rect, cached per layout generation; nil and UIParent are the screen.
function rectOf(w)
  if w == nil or w == UIParent then return screenRect() end
  local cached = stub.rectCache[w]
  if cached and cached.gen == stub.layoutGen then return cached.rect end
  stub.rectCache[w] = { gen = stub.layoutGen, rect = { left = 0, bottom = 0, width = 0, height = 0 } } -- anchor cycles
  local r = w.__parent and w.__parent.__barTexture == w and fillRect(w) or anchoredRect(w)
  stub.rectCache[w] = { gen = stub.layoutGen, rect = r }
  return r
end
stub.rectOf = rectOf

-- Whether a widget's rect is one the client would give it: anchored (or
-- UIParent, or in a scroll frame), with a width and a height, and every
-- frame it hangs on laid out too. The client gives a zero-sized frame no
-- rect, and nothing anchored to one is drawn (a 0 x 0 anchor frame hides a
-- whole bar); the rect itself is still worked out, so sizes read as usual.
-- A status bar's fill is laid out by its bar (while it has a width).
local function laidOut(w, depth)
  if w == UIParent then return true end
  local fill = w.__parent and w.__parent.__barTexture == w
  if fill then return rectOf(w).width > 0 and laidOut(w.__parent, (depth or 0) + 1) end
  if next(w.__points) == nil and scrollOwner(w) == nil then return false end
  local r = rectOf(w)
  if r.width <= 0 or r.height <= 0 then return false end
  for _, p in pairs(w.__points) do
    if type(p.rel) == "table" and p.rel ~= UIParent and (depth or 0) < 64 and not laidOut(p.rel, (depth or 0) + 1) then return false end
  end
  return true
end

-- Edges in the widget's own scale. A test may pin __left/__bottom directly.
function methods:GetLeft()
  if self.__left then return self.__left end
  if not laidOut(self) then return nil end
  return rectOf(self).left / self:GetEffectiveScale()
end

-- The bottom edge, in the widget's own scale.
function methods:GetBottom()
  if self.__bottom then return self.__bottom end
  if not laidOut(self) then return nil end
  return rectOf(self).bottom / self:GetEffectiveScale()
end

-- The right edge, in the widget's own scale.
function methods:GetRight()
  local left = self:GetLeft()
  return left and left + self:GetWidth()
end

-- The top edge, in the widget's own scale.
function methods:GetTop()
  local bottom = self:GetBottom()
  return bottom and bottom + self:GetHeight()
end

-- The center, in the widget's own scale.
function methods:GetCenter()
  local left, bottom = self:GetLeft(), self:GetBottom()
  if not left then return nil end
  return left + self:GetWidth() / 2, bottom + self:GetHeight() / 2
end

-- left, bottom, width, height in the widget's own scale.
function methods:GetRect()
  local left, bottom = self:GetLeft(), self:GetBottom()
  if not left then return nil end
  return left, bottom, self:GetWidth(), self:GetHeight()
end

-- left, bottom, width, height in screen pixels.
function methods:GetScaledRect()
  if not laidOut(self) then return nil end
  local r = rectOf(self)
  return r.left, r.bottom, r.width, r.height
end

-- Width: the one set, else what the anchors give (a font string: its text's).
function methods:GetWidth()
  if self.__width then return self.__width end
  if self.__kind == "FontString" and not laidOut(self) then return textWidth(self) end
  return rectOf(self).width / self:GetEffectiveScale()
end

-- Height: the one set, else what the anchors give (a font string: its text's).
function methods:GetHeight()
  if self.__height then return self.__height end
  if self.__kind == "FontString" and not laidOut(self) then return textHeight(self) end
  return rectOf(self).height / self:GetEffectiveScale()
end

-- Width and height together.
function methods:GetSize() return self:GetWidth(), self:GetHeight() end

-- The width of a font string's text: rough mode, as the layout sizes it; font mode, its longest line
-- as drawn (no wider than its set width).
function methods:GetStringWidth()
  if stub.textMetrics ~= "font" then return textWidth(self) end
  local natural = self:GetUnboundedStringWidth()
  return self.__width and math.min(natural, self.__width) or natural
end

-- Whether the client would have a rect for this widget.
function methods:IsRectValid() return laidOut(self) end

-- How many anchors are set.
function methods:GetNumPoints()
  local n = 0
  for _ in pairs(self.__points) do n = n + 1 end
  return n
end

-- Whether a screen point (pixels) is inside the widget's rect.
function stub.hitTest(w, x, y)
  local r = rectOf(w)
  return x >= r.left and x <= r.left + r.width and y >= r.bottom and y <= r.bottom + r.height
end

-- Sets the screen size: UIParent's size, and what GetPhysicalScreenSize reports.
function stub.setScreen(width, height)
  stub.screen = { width = width, height = height }
  UIParent:SetSize(width, height)
end

-- Whether two rects overlap by more than touching edges.
function stub.rectsOverlap(a, b)
  return a.left < b.left + b.width and b.left < a.left + a.width
    and a.bottom < b.bottom + b.height and b.bottom < a.bottom + a.height
end
