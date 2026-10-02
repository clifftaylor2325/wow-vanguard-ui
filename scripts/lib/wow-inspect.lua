-- Frame inspection for the TEST-ONLY harness: a widget as a plain table of
-- what it draws (the harness turns it into JS). Loaded into each addon by
-- scripts/lib/lua-harness.mjs; never shipped in game.

local stub = __wfgStub

-- A color table { r, g, b, a } or nil.
local function color(c)
  return c and { c[1], c[2], c[3], c[4] }
end

-- A widget's rect { left, bottom, width, height, right, top } in screen pixels, or nil.
local function rect(w)
  if not w:IsRectValid() then return nil end
  local r = stub.rectOf(w)
  return { left = r.left, bottom = r.bottom, width = r.width, height = r.height, right = r.left + r.width, top = r.bottom + r.height }
end

-- A widget's identity: name, kind, parent name, template and layer.
local function identity(w)
  return {
    id = w.__id, name = w.__name, kind = w.__kind, template = w.__template, layer = w.__layer,
    parent = w.__parent and (w.__parent.__name or w.__parent.__id),
  }
end

-- Text and its font.
local function text(w, out)
  out.text = w.__text
  out.textColor = color(w.__textColor)
  out.font = w.__font and { path = w.__font[1], size = w.__font[2], flags = w.__font[3] }
end

-- The look: textures, colors and alpha.
local function look(w, out)
  out.texture = w.__texture
  out.atlas = w.__atlas
  out.color = color(w.__color)
  out.vertexColor = color(w.__vertexColor)
  out.alpha = w.__alpha or 1
  out.backdropColor = color(w.__backdropColor)
  out.borderColor = color(w.__borderColor)
  out.desaturated = w.__desaturated == true
end

-- Status bars, buttons and cooldowns: their values.
local function values(w, out)
  out.value, out.min, out.max = w.__value, w.__min, w.__max
  out.barColor = color(w.__barColor)
  out.checked = w.__checked
  out.enabled = w.__disabled ~= true
  local d = w.__durationObject
  out.cooldown = w.__cooldown and { start = w.__cooldown[1], duration = w.__cooldown[2] } or d and { start = d.start, duration = d.duration }
  out.scroll = w.__scroll
end

-- Where a frame sits in the stack, and what it takes from the mouse.
local function state(w, out)
  out.scale = w.__scale or 1
  out.strata = w.__strata
  out.level = w.__kind ~= "Texture" and w.__kind ~= "FontString" and w:GetFrameLevel() or nil
  out.attributes = next(w.__attributes) and w.__attributes or nil
  out.mouse = w.__mouse == true
end

-- The names (or ids) of a frame's regions and child frames, in creation order.
local function children(w)
  local out = {}
  for _, c in ipairs(stub.frames) do
    if c.__parent == w then out[#out + 1] = c.__name or c.__id end
  end
  return out
end

-- Everything about one widget.
function __wfgInspect(w)
  local out = identity(w)
  out.shown, out.visible = w.__shown == true, w:IsVisible()
  out.rect = rect(w)
  text(w, out)
  look(w, out)
  values(w, out)
  state(w, out)
  out.children = children(w)
  return out
end

-- Snapshots of every widget a predicate accepts, in creation order.
function __wfgInspectAll(accept)
  local out = {}
  for _, w in ipairs(stub.frames) do
    if accept(w) then out[#out + 1] = __wfgInspect(w) end
  end
  return out
end

-- Whether a frame is the addon's own (made after the client's frames).
local function addonMade(w)
  return w.__id > stub.firstAddonFrame
end

-- The visible frames parented straight to UIParent that the addon made, with
-- rects: what a screenshot would show at the top level.
function __wfgScreen()
  local out = {}
  for _, w in ipairs(stub.frames) do
    if w.__parent == UIParent and w:IsVisible() and w:IsRectValid() and addonMade(w) and w.__kind ~= "Texture" and w.__kind ~= "FontString" then
      local r = rect(w)
      if r.width > 0 and r.height > 0 then out[#out + 1] = { name = w.__name or w.__id, kind = w.__kind, rect = r } end
    end
  end
  return out
end

-- The first visible widget whose name or text matches a Lua pattern.
function __wfgFind(pattern)
  for _, w in ipairs(stub.frames) do
    local name, text = w.__name, type(w.__text) == "string" and w.__text or nil
    if w:IsVisible() and ((name and name:find(pattern)) or (text and text:find(pattern))) then
      return __wfgInspect(w)
    end
  end
  return nil
end
