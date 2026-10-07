-- /vg frame <name> [deep]: what the client says about a frame right now, for
-- a bug that only shows in game (a bar that draws empty, a button that isn't
-- there): shown and visible, alpha and scale (its own and effective), size,
-- where its rect is (or that it has none: nothing anchored to it is drawn),
-- strata and level, its parent and anchors, every ancestor's shown state (a
-- hidden one hides the frame), and with deep its regions and child frames.
-- A dotted name (MinimapCluster.Tracking) follows keys from the global.
-- Every value is read under pcall, so a widget missing a method, or a value
-- the client keeps secret, prints "?" instead of failing.

local ADDON, ns = ...

ns.Inspect = {}
local I = ns.Inspect

-- The frame a dotted global name leads to, or nil.
function I.Resolve(name)
  local f = _G
  for key in (name or ""):gmatch("[^%.]+") do
    if type(f) ~= "table" then return nil end
    f = f[key]
  end
  return type(f) == "table" and type(f.GetObjectType) == "function" and f or nil
end

-- A value as text: numbers to two places, booleans as yes/no.
local function text(v)
  if type(v) == "number" then return tostring(math.floor(v * 100 + 0.5) / 100) end
  if type(v) == "boolean" then return v and "yes" or "no" end
  return tostring(v)
end

-- A value as text, "?" when it's nil or can't be read (a secret value).
local function safe(v)
  if v == nil then return "?" end
  local ok, s = pcall(text, v)
  return ok and s or "?"
end

-- A widget method's result as text; "?" when the widget lacks the method or it fails.
local function get(w, method)
  local fn = w[method]
  if type(fn) ~= "function" then return "?" end
  local ok, v = pcall(fn, w)
  return ok and safe(v) or "?"
end

-- A widget's parent, or nil.
local function parentOf(w)
  return type(w) == "table" and type(w.GetParent) == "function" and w:GetParent() or nil
end

-- A widget's name: its global name, its key under its parent, or its kind unnamed.
function I.Name(w)
  local name = get(w, "GetName")
  if name ~= "?" then return name end
  local key, parent = get(w, "GetParentKey"), parentOf(w)
  if key ~= "?" and type(parent) == "table" then return I.Name(parent) .. "." .. key end
  return "(unnamed " .. get(w, "GetObjectType") .. ")"
end

-- Where a widget's rect is ("at 12, 34", its left and bottom in its own
-- units), or "no rect" when the client has none for it: nothing anchored to
-- it is drawn, nor is it. A zero-sized frame has none.
function I.Rect(w)
  local ok, left, bottom = pcall(function() return w:GetRect() end)
  if not ok or left == nil then return "no rect" end
  return "at " .. safe(left) .. ", " .. safe(bottom)
end

-- One line of a frame's state: shown, visible, alpha, scale, size, rect, strata, level and parent.
function I.StateLine(f)
  local parent = parentOf(f)
  return string.format("%s (%s): shown %s, visible %s, alpha %s (effective %s), scale %s (effective %s), %s x %s %s, strata %s level %s, under %s",
    I.Name(f), get(f, "GetObjectType"), get(f, "IsShown"), get(f, "IsVisible"), get(f, "GetAlpha"), get(f, "GetEffectiveAlpha"),
    get(f, "GetScale"), get(f, "GetEffectiveScale"), get(f, "GetWidth"), get(f, "GetHeight"), I.Rect(f), get(f, "GetFrameStrata"), get(f, "GetFrameLevel"),
    parent and I.Name(parent) or "nothing")
end

-- The frame's anchors, one line each ("  RIGHT to Vanguard_MenuStrip TOPRIGHT 7.3, -13.4"); none: says so.
function I.PointLines(f, out)
  local first = #out
  for i = 1, 8 do
    local ok, point, rel, relPoint, x, y = pcall(f.GetPoint, f, i)
    if not ok or not point then break end
    out[#out + 1] = string.format("  %s to %s %s %s, %s", point, type(rel) == "table" and I.Name(rel) or "its parent", safe(relPoint), safe(x or 0), safe(y or 0))
  end
  if #out == first then out[#out + 1] = "  no anchors" end
end

-- Every ancestor up to the top, one line each: shown, alpha and scale.
function I.AncestorLines(f, out)
  local p, depth = parentOf(f), 0
  while p and depth < 20 do
    out[#out + 1] = string.format("  under %s: shown %s, alpha %s, scale %s", I.Name(p), get(p, "IsShown"), get(p, "GetAlpha"), get(p, "GetScale"))
    p, depth = parentOf(p), depth + 1
  end
end

-- What a region shows: a font string's text, or a texture's atlas or file.
local function art(w)
  if type(w.GetText) == "function" then return "text " .. get(w, "GetText") end
  local atlas = get(w, "GetAtlas")
  return atlas ~= "?" and ("atlas " .. atlas) or ("file " .. get(w, "GetTexture"))
end

-- A region's draw layer and what it shows, or a child frame's level.
local function detail(w)
  if type(w.GetDrawLayer) == "function" then return "layer " .. get(w, "GetDrawLayer") .. ", " .. art(w) end
  return "level " .. get(w, "GetFrameLevel")
end

-- One of the frame's regions or child frames, in one line.
local function partLine(w)
  return string.format("  %s (%s): shown %s, alpha %s, %s x %s %s, %s", I.Name(w), get(w, "GetObjectType"), get(w, "IsShown"), get(w, "GetAlpha"), get(w, "GetWidth"), get(w, "GetHeight"), I.Rect(w), detail(w))
end

-- The frame's regions and child frames (deep), counted, then one line each.
function I.PartLines(f, out)
  for _, method in ipairs({ "GetRegions", "GetChildren" }) do
    local parts = type(f[method]) == "function" and { f[method](f) } or {}
    out[#out + 1] = string.format("  %d %s", #parts, method == "GetRegions" and "region(s):" or "child frame(s):")
    for _, w in ipairs(parts) do out[#out + 1] = partLine(w) end
  end
end

-- Every line /vg frame prints for name: the frame's state, anchors and ancestors, and with deep its parts.
function I.Lines(name, deep)
  local f = I.Resolve(name)
  if not f then return { string.format("No frame called %s (a global name; dots follow keys: MinimapCluster.Tracking).", name) } end
  local out = { I.StateLine(f) }
  I.PointLines(f, out)
  I.AncestorLines(f, out)
  if deep then I.PartLines(f, out) end
  return out
end
