-- Minimal WoW API stub so addon Lua runs under Node (fengari, Lua 5.3).
-- TEST-ONLY. Not listed in the TOC and never shipped in game.

-- Lua 5.1 fidelity -----------------------------------------------------------------------
-- The game runs Lua 5.1; fengari is 5.3. These shims make the differences
-- the addon could meet behave as in game: 5.1 names, and numbers that print
-- as integers when they are whole (5.3 says "3.0" for 6 / 2; 5.1 says "3").
-- Concatenation (`..`) is patched in the harness (scripts/lib/lua-harness.mjs).

math.atan2 = math.atan2 or function(y, x)
  return math.atan(y, x)
end
unpack = unpack or table.unpack
math.pow = math.pow or function(x, y) return x ^ y end
math.mod = math.mod or math.fmod
math.log10 = math.log10 or function(x) return math.log(x, 10) end
loadstring = loadstring or load
table.getn = table.getn or function(t) return #t end
table.maxn = table.maxn or function(t)
  local n = 0
  for k in pairs(t) do if type(k) == "number" and k > n then n = k end end
  return n
end
string.gfind = string.gfind or string.gmatch
-- 5.1's getfenv: every function the addon and its libraries load runs in the
-- global table (the bundled LibSharedMedia-3.0 reads getfenv(0)).
getfenv = getfenv or function() return _G end
-- The game's bit library (LibSharedMedia-3.0 reads bit.band).
bit = bit or { band = function(a, b) return a & b end }

-- A whole float as the integer 5.1 would print; anything else as is.
local function wholeNumber(v)
  if math.type(v) == "float" and v == math.floor(v) and v > -2^53 and v < 2^53 then
    return math.tointeger(v)
  end
  return v
end
__wfgWholeNumber = wholeNumber

local rawtostring = tostring
-- tostring as 5.1 prints numbers: whole floats without ".0".
function tostring(v)
  return rawtostring(wholeNumber(v))
end

-- Truncates toward zero, as 5.1's %d did with a fractional number.
local function truncated(v)
  if type(v) ~= "number" or math.type(v) == "integer" then return v end
  local t = v < 0 and math.ceil(v) or math.floor(v)
  return math.tointeger(t) or v
end

-- The conversion each % spec in a format string wants, in order.
local function formatSpecs(fmt)
  local specs = {}
  for spec in fmt:gmatch("%%[%-%+ #0]*%d*%.?%d*([%a%%])") do
    if spec ~= "%" then specs[#specs + 1] = spec end
  end
  return specs
end

local rawformat = string.format
-- string.format as 5.1 does it: %d truncates a fraction, %s prints whole floats as integers.
function string.format(fmt, ...)
  local args, specs = { ... }, formatSpecs(fmt)
  for i, spec in ipairs(specs) do
    if spec:find("[dicxXo]") then args[i] = truncated(args[i])
    elseif spec == "s" then args[i] = wholeNumber(args[i]) end
  end
  return rawformat(fmt, unpack(args, 1, math.max(#specs, select("#", ...))))
end

local stub = { frames = {}, chat = {}, now = 1000, inCombat = false }
__wfgStub = stub

-- Test clock: only stub.update moves it.
function GetTime()
  return stub.now
end

-- Tests set stub.inCombat to simulate combat lockdown.
function InCombatLockdown()
  return stub.inCombat == true
end

-- Stands in for real methods the tests don't model.
local function noop() end

local methods = {}
stub.methods = methods

-- Widget methods resolve only if the real client has them for that widget
-- type (scripts/lib/wow-widget-api.lua). Real methods the tests don't model
-- are no-ops. Anything else is nil, so calling it fails as it would in game.
-- Lowercase keys are addon fields and stay nil until the addon sets them.
local API = __wfgWidgetApi

-- Whether the real client has this method on this widget.
local function hasMethod(w, key)
  local allowed = API.methods[w.__kind]
  if allowed and allowed[key] then
    return true
  end
  return rawget(w, "__backdrop_mixin") == true and API.backdrop[key] == true
end

-- What a key resolves to on a widget: the stub method, a no-op, or false for nil.
local function resolve(w, key)
  if type(key) ~= "string" or key:sub(1, 2) == "__" or not hasMethod(w, key) then
    return false
  end
  return methods[key] or noop
end

-- Resolved keys per widget kind (and per kind with the backdrop mixin), so
-- a method call looks a name up once per kind, not on every call.
local resolved, resolvedBackdrop = {}, {}
-- The cache a widget's keys resolve through.
local function cacheFor(w)
  local store = rawget(w, "__backdrop_mixin") == true and resolvedBackdrop or resolved
  local cache = store[w.__kind]
  if not cache then
    cache = {}
    store[w.__kind] = cache
  end
  return cache
end

-- Empties the caches: a method added later (the layout and world files add
-- theirs), or a test editing the widget API list (an older client).
local function forgetResolved()
  resolved, resolvedBackdrop = {}, {}
end
-- A new stub method: stored, and the caches start over.
local function addMethod(t, key, fn) rawset(t, key, fn) forgetResolved() end
setmetatable(methods, { __newindex = addMethod })

-- A set from the widget API list behind a proxy, so an edit to it reaches
-- the caches; reads see the set as it is.
local function watched(store)
  -- The write goes to the set, and the caches start over.
  local function edit(_, key, v) store[key] = v forgetResolved() end
  return setmetatable({}, { __index = store, __newindex = edit })
end
for kind, store in pairs(API.methods) do API.methods[kind] = watched(store) end
API.backdrop = watched(API.backdrop)

local widgetMeta = {
  -- Resolves a method name to the stub method, a no-op, or nil.
  __index = function(w, key)
    local cache = cacheFor(w)
    local found = cache[key]
    if found == nil then
      found = resolve(w, key)
      cache[key] = found
    end
    return found or nil
  end,
}

-- Each widget's regions and child frames, kept in creation order, so
-- GetRegions and GetChildren need not scan every widget there is.
local childrenOf = setmetatable({}, { __mode = "k" })
-- Creation order, for sorting.
local function byId(a, b) return a.__id < b.__id end
-- Adds w to its parent's list, keeping creation order.
local function attach(parent, w)
  if not parent then return end
  local list = childrenOf[parent]
  if not list then
    list = {}
    childrenOf[parent] = list
  end
  list[#list + 1] = w
  if #list > 1 and list[#list - 1].__id > w.__id then table.sort(list, byId) end
end
-- Takes w out of its parent's list.
local function detach(parent, w)
  local list = parent and childrenOf[parent]
  if not list then return end
  for i, c in ipairs(list) do
    if c == w then table.remove(list, i) return end
  end
end

-- The widgets in a set, in creation order.
local function inOrder(set)
  local out = {}
  for w in pairs(set) do out[#out + 1] = w end
  table.sort(out, byId)
  return out
end

-- The internal state of a fresh widget.
local function widgetState(kind, name, parent, template, layer)
  return {
    __kind = kind, __name = name, __parent = parent, __template = template, __layer = layer,
    __shown = true, __scripts = {}, __events = {}, __attributes = {}, __points = {},
  }
end

-- Makes a widget, records it in stub.frames and names it globally if named.
local function newWidget(kind, name, parent, template, layer)
  local w = setmetatable(widgetState(kind, name, parent, template, layer), widgetMeta)
  stub.frames[#stub.frames + 1] = w
  w.__id = #stub.frames
  attach(parent, w)
  if name then
    _G[name] = w
  end
  return w
end
stub.newWidget = newWidget

-- Layout recording. Only the UI preview (scripts/preview-ui.mjs) reads it;
-- in game these are the real widget methods.

-- A widget given as itself, a global name, or nil (the fallback).
local function widgetRef(value, fallback)
  if type(value) == "string" then
    return _G[value]
  end
  if value == nil then
    return fallback
  end
  return value
end

-- SetPoint's argument forms, as (relativeTo, relativePoint, x, y).
local function pointArgs(self, point, a, b, c, d)
  if type(a) == "number" then
    return self.__parent, point, a, b
  elseif type(b) == "number" then
    return widgetRef(a, self.__parent), point, b, c
  end
  return widgetRef(a, self.__parent), b or point, c, d
end

-- Records one anchor point.
function methods:SetPoint(point, ...)
  local rel, relPoint, x, y = pointArgs(self, point, ...)
  self.__points[point] = { point = point, rel = rel, relPoint = relPoint, x = x or 0, y = y or 0 }
end

-- Records a texture's blend mode ("ADD" for sparks).
function methods:SetBlendMode(mode) self.__blend = mode end

-- Records whether a texture snaps to the pixel grid.
function methods:SetSnapToPixelGrid(snap) self.__snapToPixelGrid = snap end

-- Records a texture's nine-slice margins (texture pixels: left, top, right, bottom).
function methods:SetTextureSliceMargins(l, t, r, b) self.__sliceMargins = { l, t, r, b } end

-- Records a texture's texel snapping bias.
function methods:SetTexelSnappingBias(bias) self.__texelBias = bias end

-- Forgets every anchor point.
function methods:ClearAllPoints() self.__points = {} end

-- Anchors TOPLEFT and BOTTOMRIGHT to the relative widget's corners.
function methods:SetAllPoints(rel)
  rel = widgetRef(rel, self.__parent)
  self.__points.TOPLEFT = { point = "TOPLEFT", rel = rel, relPoint = "TOPLEFT", x = 0, y = 0 }
  self.__points.BOTTOMRIGHT = { point = "BOTTOMRIGHT", rel = rel, relPoint = "BOTTOMRIGHT", x = 0, y = 0 }
end

-- Size, look and movement: each records what it was given.
function methods:SetSize(w, h) self.__width, self.__height = w, h end
function methods:SetWidth(w) self.__width = w end
function methods:SetHeight(h) self.__height = h end
function methods:GetWidth() return self.__width or 0 end
function methods:GetHeight() return self.__height or 0 end
function methods:SetTextColor(r, g, b, a) self.__textColor = { r, g, b, a or 1 } end
-- The text colour last set (white until one is).
function methods:GetTextColor() local c = self.__textColor or { 1, 1, 1, 1 } return c[1], c[2], c[3], c[4] end
function methods:SetJustifyH(j) self.__justifyH = j end
function methods:SetFontObject(font) self.__template = type(font) == "string" and font or self.__template self.__fontObject = font end
function methods:SetBackdrop(b) self.__backdrop = b end
function methods:SetBackdropColor(r, g, b, a) self.__backdropColor = { r, g, b, a or 1 } end
function methods:SetBackdropBorderColor(r, g, b, a) self.__borderColor = { r, g, b, a or 1 } end
function methods:SetTexture(t) self.__texture = t end
function methods:GetTexture() return self.__texture end
-- A region's draw layer and sublevel, as it was created (or moved) with.
function methods:SetDrawLayer(layer, sublevel) self.__layer = layer self.__sublevel = sublevel end
function methods:GetDrawLayer() return self.__layer, self.__sublevel or 0 end
function methods:SetAtlas(a, useSize) self.__atlas = a self.__atlasSize = useSize end
function methods:GetAtlas() return self.__atlas end
function methods:SetColorTexture(r, g, b, a) self.__color = { r, g, b, a or 1 } end
function methods:SetVertexColor(r, g, b, a) self.__vertexColor = { r, g, b, a or 1 } end
function methods:SetAlpha(a) self.__alpha = a end
-- A frame's ID (0 until set, as in the client; secure action buttons read it to page).
function methods:SetID(id) self.__frameID = id end
function methods:GetID() return self.__frameID or 0 end
-- Records which clicks cancel an engine aura button's aura.
function methods:SetCancelAuraButtons(buttons) self.__cancelButtons = buttons end
-- Records the (possibly hidden) boolean a region's alpha follows.
function methods:SetAlphaFromBoolean(v) self.__alphaFromBoolean = v end
function methods:GetAlpha() return self.__alpha or 1 end
function methods:SetTexCoord(...) self.__texCoord = { ... } end
function methods:SetScale(s) self.__scale = s end
function methods:GetScale() return self.__scale or 1 end

-- Its scale times every parent's, as the client computes it.
function methods:GetEffectiveScale()
  local parent = self.__parent
  return (self.__scale or 1) * (parent and parent:GetEffectiveScale() or 1)
end
-- Mouse: whether the frame takes the mouse, and whether it is under it
-- (only what a test sets in __mouseOver).
function methods:EnableMouse(on) self.__mouse = on == true end
-- Mouse motion (OnEnter/OnLeave) and clicks, each on its own.
function methods:SetMouseMotionEnabled(on) self.__mouseMotion = on == true end
-- Whether clicks land on the frame (false lets them through to what's under it).
function methods:SetMouseClickEnabled(on) self.__mouseClick = on == true end
function methods:IsMouseOver() return self.__mouseOver == true end
-- The mouse wheel: whether the frame takes it (a frame with an OnMouseWheel script does too, as in game).
function methods:EnableMouseWheel(on) self.__mouseWheel = on ~= false end
function methods:IsMouseWheelEnabled() return self.__mouseWheel == true or self.__scripts.OnMouseWheel ~= nil end
-- Moving (recorded for the mover tests).
function methods:StartMoving() self.__moving = true end
function methods:StopMovingOrSizing() self.__moving = false end

-- How many anchor points a widget has.
function methods:GetNumPoints() local n = 0 for _ in pairs(self.__points) do n = n + 1 end return n end

-- The i-th anchor point, in a stable (alphabetical) order.
function methods:GetPoint(i)
  local list = {}
  for _, p in pairs(self.__points) do
    list[#list + 1] = p
  end
  table.sort(list, function(a, b) return a.point < b.point end)
  local p = list[i or 1]
  if p then
    return p.point, p.rel, p.relPoint, p.x, p.y
  end
end

-- Check buttons: checked state and the checked highlight texture.
function methods:SetChecked(on) self.__checked = on == true end
function methods:GetChecked() return self.__checked == true end

-- The checked highlight: one texture, created on first use.
function methods:SetCheckedTexture(t)
  self.__checkedTexture = self.__checkedTexture or newWidget("Texture", nil, self, nil, "OVERLAY")
  self.__checkedTexture:SetTexture(t)
end

-- The checked highlight texture, if set.
function methods:GetCheckedTexture() return self.__checkedTexture end

-- Cooldowns: the last start and duration given, or the duration object.
function methods:SetCooldown(start, duration) self.__cooldown = { start, duration } end
function methods:SetCooldownFromDurationObject(d) self.__durationObject = d end
-- Clearing a cooldown forgets what it was given.
function methods:Clear() self.__cooldown, self.__durationObject = nil, nil end
function methods:SetHideCountdownNumbers(hide) self.__hideNumbers = hide end
function methods:SetSwipeColor(r, g, b, a) self.__swipeColor = { r, g, b, a } end
function methods:SetReverse(on) self.__reverse = on end

-- The countdown numbers' font string: made on first use, as the client's cooldown has one.
function methods:GetCountdownFontString()
  self.__countdown = self.__countdown or newWidget("FontString", nil, self, nil, "OVERLAY")
  return self.__countdown
end

-- Frame levels: the level set.
function methods:SetFrameLevel(level) self.__level = level end

-- The level set, or one above the parent's, as the client stacks new frames.
function methods:GetFrameLevel()
  local parent = self.__parent
  return self.__level or ((parent and parent.GetFrameLevel and parent:GetFrameLevel() or 0) + 1)
end

-- Textures: desaturation, recorded.
function methods:SetDesaturated(on) self.__desaturated = on == true end

-- Frames: where clicks are taken, inset from each edge (left, right, top, bottom), recorded.
function methods:SetHitRectInsets(l, r, t, b) self.__hitInsets = { l, r, t, b } end

-- Buttons: the click types registered, as given.
function methods:RegisterForClicks(...) self.__clicks = { ... } end

-- Buttons: whether they're enabled, recorded.
function methods:IsEnabled() return self.__disabled ~= true end

-- Enables a button, running OnEnable if it was disabled, as the client does.
function methods:Enable()
  local was = self.__disabled
  self.__disabled = false
  if was and self.__scripts.OnEnable then self.__scripts.OnEnable(self) end
end

-- Disables a button, running OnDisable if it was enabled, as the client does.
function methods:Disable()
  local was = self.__disabled
  self.__disabled = true
  if not was and self.__scripts.OnDisable then self.__scripts.OnDisable(self) end
end

-- Runs fn after a script's current handler, as HookScript does.
function methods:HookScript(name, fn)
  local old = self.__scripts[name]
  self.__scripts[name] = function(...)
    if old then old(...) end
    return fn(...)
  end
  if name == "OnUpdate" then stub.updaters[self] = true end
end

-- Fonts on font strings, edit boxes and chat frames: recorded and read back.
function methods:SetFont(path, size, flags) self.__font = { path, size, flags } end
function methods:GetFont() local f = self.__font or {} return f[1], f[2], f[3] end
function methods:SetShadowOffset(x, y) self.__shadowOffset = { x, y } end

-- The minimap mask texture (square or round).
function methods:SetMaskTexture(t) self.__maskTexture = t end

-- Chat windows: the lines added, for the preview.
function methods:AddMessage(text) self.__messages = self.__messages or {}; self.__messages[#self.__messages + 1] = text end

-- Minimap zoom: the level, and how many levels there are (6 unless a test sets __zoomLevels).
function methods:SetZoom(z) self.__zoom = z end
function methods:GetZoom() return self.__zoom or 0 end
function methods:GetZoomLevels() return self.__zoomLevels or 6 end

-- Word wrap on a font string (the preview reads it).
function methods:SetWordWrap(on) self.__noWrap = not on end

-- A frame's regions: its textures and font strings, in creation order.
function methods:GetRegions()
  local out = {}
  for _, w in ipairs(childrenOf[self] or out) do
    if w.__kind == "Texture" or w.__kind == "FontString" then out[#out + 1] = w end
  end
  return unpack(out)
end

-- Screen edges: only what a test sets (__left, __bottom); nil like an unlaid-out frame.
function methods:GetLeft() return self.__left end
function methods:GetBottom() return self.__bottom end

-- The status bar's fill texture: made on first SetStatusBarTexture, returned after.
function methods:SetStatusBarTexture(t)
  self.__barTexture = self.__barTexture or newWidget("Texture", nil, self, nil, "ARTWORK")
  self.__barTexture:SetTexture(t)
end

-- The fill texture, if set.
function methods:GetStatusBarTexture() return self.__barTexture end

-- Status bars: range, value and color, recorded as given (secrets included).
function methods:SetMinMaxValues(lo, hi) self.__min, self.__max = lo, hi end
function methods:GetMinMaxValues() return self.__min or 0, self.__max or 0 end
function methods:SetValue(v, ease) self.__value, self.__ease = v, ease end
function methods:GetValue() return self.__value or 0 end
function methods:SetStatusBarColor(r, g, b, a) self.__barColor = { r, g, b, a or 1 } end

-- Registers a unit event: delivered only when its first argument is one of the units.
function methods:RegisterUnitEvent(event, ...)
  self:RegisterEvent(event)
  self.__unitEvents = self.__unitEvents or {}
  self.__unitEvents[event] = { ... }
end

-- Reparents a region (the preview and tests read __parent).
function methods:SetParent(parent)
  detach(self.__parent, self)
  self.__parent = parent
  attach(parent, self)
end

-- Strata and scroll child.
function methods:SetFrameStrata(s) self.__strata = s end
function methods:SetScrollChild(child) self.__scrollChild = child end
function methods:SetClipsChildren(on) self.__clips = on == true end

-- A rough rendered height: 14 px per wrapped line at ~6 px per character.
local function estimatedHeight(text, width)
  local lines = 0
  for line in (text .. "\n"):gmatch("(.-)\n") do
    lines = lines + math.max(1, math.ceil(#line * 6 / width))
  end
  return lines * 14
end

-- Real clients measure the rendered text. The preview feeds measured heights
-- back in through stub.stringHeights; tests get a rough estimate.
function methods:GetStringHeight()
  local measured = stub.stringHeights and stub.stringHeights[self.__id]
  if measured then
    return measured
  end
  local text = self.__text or ""
  return text == "" and 0 or estimatedHeight(text, self.__width or 300)
end

-- Showing a hidden widget runs its OnShow, as the client does.
function methods:Show()
  local was = self.__shown
  self.__shown = true
  local onShow = self.__scripts.OnShow
  if not was and onShow then onShow(self) end
end

-- Hiding a shown widget runs its OnHide, as the client does.
function methods:Hide()
  local was = self.__shown
  self.__shown = false
  local onHide = self.__scripts.OnHide
  if was and onHide then onHide(self) end
end

-- The shown state.
function methods:IsShown() return self.__shown end

-- A scroll frame's offset.
function methods:SetVerticalScroll(y) self.__scroll = y end
function methods:GetVerticalScroll() return self.__scroll or 0 end

-- How far a scroll frame can scroll: its scroll child's height beyond its own (0 without a child, or a short one).
function methods:GetVerticalScrollRange()
  local child = self.__scrollChild
  return math.max(0, (child and child:GetHeight() or 0) - self:GetHeight())
end

-- Visible only while it and every parent are shown, as in game.
function methods:IsVisible()
  local f = self
  while f do
    if not f.__shown then return false end
    f = f.__parent
  end
  return true
end

-- Shows or hides by a flag.
function methods:SetShown(shown) self.__shown = not not shown end

-- Script handlers: only ones the real widget type has.
function methods:SetScript(name, fn)
  local scripts = API.scripts[self.__kind]
  if not scripts or not scripts[name] then
    error(self.__kind .. " doesn't have a \"" .. tostring(name) .. "\" script", 2)
  end
  self.__scripts[name] = fn
  if name == "OnUpdate" then stub.updaters[self] = fn and true or nil end
end

-- Scripts, events, text, rotation, attributes and identity: recorded and read back.
function methods:GetScript(name) return self.__scripts[name] end
-- The frames registered for each event, so firing one visits only them.
stub.listeners = {}
-- The frames with an OnUpdate script, so a frame tick visits only them.
stub.updaters = {}
-- Puts a frame on (or takes it off) an event's list.
local function listen(frame, event, on)
  local set = stub.listeners[event]
  if not set then
    set = {}
    stub.listeners[event] = set
  end
  set[frame] = on or nil
end
-- Event registration, as the client keeps it per frame.
function methods:RegisterEvent(event)
  self.__events[event] = true
  listen(self, event, true)
end
-- One event off.
function methods:UnregisterEvent(event)
  self.__events[event] = nil
  listen(self, event, false)
end
-- Every event off, unit filters included.
function methods:UnregisterAllEvents()
  for event in pairs(self.__events) do listen(self, event, false) end
  self.__events = {}
  self.__unitEvents = nil
end
-- Whether the frame listens for an event.
function methods:IsEventRegistered(event) return self.__events[event] == true end
-- Text: a font string made with CreateFontString takes none until it has a font (SetFont, a font
-- object, or a template it inherits one from), as the client refuses it; the stub's own game font
-- strings have theirs from the game's XML.
function methods:SetText(text)
  if self.__needsFont and not (self.__font or self.__template or self.__fontObject) then error("FontString:SetText(): Font not set", 2) end
  self.__text = text
end
-- A button's label font string (as a template's own would be), once one is set.
function methods:SetFontString(fs) self.__fontString = fs end
function methods:GetFontString() return self.__fontString end
-- The text set, and the rotation field.
function methods:GetText() return self.__text end
function methods:SetRotation(r) self.__rotation = r end
function methods:GetRotation() return self.__rotation or 0 end

-- Sets an attribute and runs OnAttributeChanged, as the client does.
function methods:SetAttribute(k, v)
  self.__attributes[k] = v
  local onChanged = self.__scripts.OnAttributeChanged
  if onChanged then onChanged(self, k, v) end
end

-- Attributes and identity, read back.
function methods:GetAttribute(k) return self.__attributes[k] end
function methods:GetName() return self.__name end
function methods:GetObjectType() return self.__kind end
function methods:GetScrollChild() return self.__scrollChild end
function methods:GetParent() return self.__parent end
-- The frames parented to this one (not its textures or font strings), as the client returns them.
function methods:GetChildren()
  local out = {}
  for _, w in ipairs(childrenOf[self] or out) do
    if w.__kind ~= "Texture" and w.__kind ~= "FontString" then out[#out + 1] = w end
  end
  return unpack(out)
end
-- Textures record their draw layer and sublevel.
function methods:CreateTexture(name, layer, _, sublevel)
  local t = newWidget("Texture", name, self, nil, layer)
  t.__sublevel = sublevel
  return t
end

-- Font strings record their draw layer and template.
-- A font string on the frame; it needs a font before it takes text (methods:SetText).
function methods:CreateFontString(name, layer, template)
  local fs = newWidget("FontString", name, self, template, layer)
  fs.__needsFont = true
  return fs
end

-- Checks one template name against the frame type; true if it adds the backdrop mixin.
local function checkTemplate(t, kind)
  local info = API.templates[t]
  if not info then
    error("CreateFrame: unknown template " .. t, 4)
  end
  if info.kind and info.kind ~= kind then
    error("CreateFrame: template " .. t .. " is for " .. info.kind .. ", not " .. kind, 4)
  end
  return info.backdrop == true
end

-- Whether any of the comma-separated templates adds the backdrop mixin.
local function checkTemplates(template, kind)
  local backdrop = false
  for t in tostring(template or ""):gmatch("[^,%s]+") do
    backdrop = checkTemplate(t, kind) or backdrop
  end
  return backdrop
end

-- Unknown frame types and templates are errors in game, so they are here.
function CreateFrame(kind, name, parent, template)
  local missing = kind == "AuraContainer" and stub.noAuraContainer
  if missing or not API.methods[kind] or kind == "Texture" or kind == "FontString" then
    error("CreateFrame: unknown frame type " .. tostring(kind), 2)
  end
  local backdrop = checkTemplates(template, kind)
  local w = newWidget(kind, name, parent, template)
  w.__backdrop_mixin = backdrop
  return w
end

-- Secure script wrappers (FrameXML): recorded per frame and script, never run.
function SecureHandlerWrapScript(frame, script, _, preBody)
  frame.__wraps = frame.__wraps or {}
  frame.__wraps[script] = preBody
end

-- TEST-ONLY: runs a snippet with self bound to the frame, as the client's restricted
-- environment does, without its restrictions (Lua 5.3 load with an env table).
function SecureHandlerExecute(frame, body)
  local env = setmetatable({ self = frame }, { __index = _G })
  local fn = assert(load(body, "=snippet", "t", env))
  fn()
end

-- Removes a recorded wrapper.
function SecureHandlerUnwrapScript(frame, script)
  if frame.__wraps then frame.__wraps[script] = nil end
end

-- Aura containers (TEST-ONLY model of the client's) ------------------------------------

-- Layout settings, recorded as given.
function methods:SetFlowLayoutAnchorPoint(point) self.__flowAnchor = point end
function methods:SetFlowLayoutGrowthDirection(h, v) self.__flowGrow = { h, v } end
function methods:SetFlowLayoutMaximumLineSize(size) self.__flowLine = size end

-- A group: its buttons are made now and dressed by initializeFrame, as the client does.
function methods:AddAuraGroup(key, filter, opts)
  local g = { key = key, filter = filter, opts = opts, buttons = {} }
  self.__groups = self.__groups or {}
  self.__groups[#self.__groups + 1] = g
  for i = 1, math.min(opts.maxFrameCount or 10, 10) do
    g.buttons[i] = newWidget("AuraButton", nil, self)
    g.buttons[i].__dispel, g.buttons[i].__pandemic = {}, {}
    if opts.initializeFrame then opts.initializeFrame(g.buttons[i]) end
  end
  self:UpdateAllAuras()
end

-- The unit and whether the container is on; either change reads the auras again.
function methods:SetUnit(unit) self.__unit = unit self:UpdateAllAuras() end
function methods:GetUnit() return self.__unit end
function methods:SetEnabled(on) self.__enabled = on self:UpdateAllAuras() end

-- Aura buttons: the regions the addon hands the client, recorded.
function methods:SetIcon(t) self.__icon = t end
function methods:SetDurationCooldown(cd) self.__durationCooldown = cd end
function methods:SetApplicationCount(fs) self.__count = fs end
function methods:AddDispelTypeTexture(t, opts) self.__dispel[#self.__dispel + 1] = { texture = t, opts = opts } end
function methods:AddPandemicRegion(region) self.__pandemic[#self.__pandemic + 1] = region end

-- The timer text binding. A test can make the client refuse an option by
-- naming it in stub.refuseDurationOptions.
function methods:SetDurationText(fs, opts)
  for key in pairs(opts or {}) do
    if (stub.refuseDurationOptions or {})[key] then error("TEST-ONLY: option " .. key .. " refused") end
  end
  self.__durationText = { fontString = fs, opts = opts }
end

-- Colors and shows a button's debuff-type textures for an aura, as the client does.
local function paintDispel(b, aura, harmful)
  for _, d in ipairs(b.__dispel) do
    local kind = type(aura.dispelName) == "string" and aura.dispelName or "None"
    local color = (d.opts.customDispelColorMap or {})[kind]
    d.texture:SetShown(harmful and (kind ~= "None" or d.opts.showWithoutDispelType == true))
    if color then d.texture:SetVertexColor(color:GetRGBA()) end
  end
end

-- Fills one button from an aura (nil hides it).
local function fillButton(b, aura, harmful)
  b.__aura, b.__shown = aura, aura ~= nil
  if not aura then return end
  if b.__icon then b.__icon:SetTexture(aura.icon) end
  local n = aura.applications
  if b.__count then b.__count:SetText(type(n) == "number" and n > 1 and tostring(n) or "") end
  paintDispel(b, aura, harmful)
end

-- Fills a group's buttons from C_UnitAuras through its filter.
local function fillGroup(c, g)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByIndex
  for i, b in ipairs(g.buttons) do
    local aura = c.__enabled and c.__unit and get and get(c.__unit, i, g.filter) or nil
    fillButton(b, aura, g.filter:find("HARMFUL") ~= nil)
  end
end

-- Flows the shown buttons from the anchor corner, wrapping at the line size (for the preview).
local function flowButtons(c)
  local grow, anchor, x, y, lineH = c.__flowGrow or { 1, 1 }, c.__flowAnchor or "TOPLEFT", 0, 0, 0
  for _, g in ipairs(c.__groups or {}) do
    local gap, newLine = g.opts.layout.elementSpacing or 0, g.opts.layout.forceNewLine
    for i, b in ipairs(g.buttons) do
      if b.__shown and x > 0 and ((i == 1 and newLine) or (c.__flowLine and x + b.__width > c.__flowLine)) then x, y, lineH = 0, y + lineH + gap, 0 end
      if b.__shown then b.__points = { [anchor] = { point = anchor, rel = c, relPoint = anchor, x = x * grow[1], y = y * grow[2] } } end
      if b.__shown then x, lineH = x + b.__width + gap, math.max(lineH, b.__height) end
    end
  end
end

-- Reads every group's auras again and lays the buttons out.
function methods:UpdateAllAuras()
  for _, g in ipairs(self.__groups or {}) do fillGroup(self, g) end
  flowButtons(self)
end

-- The client's Color objects (FrameXML CreateColor).
function CreateColor(r, g, b, a)
  local c = { r = r, g = g, b = b, a = a or 1 }
  -- r, g, b (and a) back.
  function c:GetRGB() return self.r, self.g, self.b end
  function c:GetRGBA() return self.r, self.g, self.b, self.a end
  return c
end

UIParent = newWidget("Frame", "UIParent")
SlashCmdList = {}
DEFAULT_CHAT_FRAME = {
  -- Chat lines go to stub.chat for the tests to read.
  AddMessage = function(_, msg)
    stub.chat[#stub.chat + 1] = msg
  end,
}

-- Whether a frame gets this event: registered, and for a unit event, for this unit.
local function wants(frame, event, unit)
  local units = frame.__unitEvents and frame.__unitEvents[event]
  if not frame.__events[event] or not units then
    return frame.__events[event] == true
  end
  for _, u in ipairs(units) do
    if u == unit then return true end
  end
  return false
end

-- Fires an event at every frame registered for it, in creation order.
function stub.fire(event, ...)
  for _, frame in ipairs(inOrder(stub.listeners[event] or {})) do
    local onEvent = frame.__scripts.OnEvent
    if onEvent and wants(frame, event, ...) then
      onEvent(frame, event, ...)
    end
  end
end

-- Moves the clock by `elapsed` and runs one OnUpdate on each shown frame, in creation order.
function stub.update(elapsed)
  stub.now = stub.now + elapsed
  for _, frame in ipairs(inOrder(stub.updaters)) do
    local onUpdate = frame.__scripts.OnUpdate
    if frame.__shown and onUpdate then
      onUpdate(frame, elapsed)
    end
  end
end

-- Moves the clock in frames of `step` seconds so throttled OnUpdate
-- drivers tick every frame.
function stub.advance(seconds, step)
  step = step or 0.25
  local frames = math.floor(seconds / step + 0.5)
  for _ = 1, frames do
    stub.update(step)
  end
end

-- Forgets the chat lines seen so far.
function stub.clearChat()
  stub.chat = {}
end

-- Driving the mouse and keyboard (TEST-ONLY) -------------------------------------------------

-- Runs a script handler on a frame if it has one.
local function runScript(frame, name, ...)
  local fn = frame.__scripts[name]
  if fn then return fn(frame, ...) end
end
stub.runScript = runScript

-- Clicks a frame: PreClick, OnMouseDown, OnMouseUp, OnClick, PostClick, as the client does.
function stub.click(frame, button, down)
  button = button or "LeftButton"
  runScript(frame, "PreClick", button, down == true)
  runScript(frame, "OnMouseDown", button)
  runScript(frame, "OnMouseUp", button)
  if frame.__disabled ~= true then runScript(frame, "OnClick", button, down == true) end
  runScript(frame, "PostClick", button, down == true)
end

-- The widget's Click method, as buttons have in game.
function methods:Click(button, down) stub.click(self, button, down) end

-- Takes the mouse off the frame it is over, running its OnLeave.
local function leave()
  local last = stub.hovered
  stub.hovered = nil
  if not last then return end
  last.__mouseOver = false
  runScript(last, "OnLeave")
end

-- Moves the mouse onto a frame (nil: off everything): OnLeave on the last one, OnEnter on this.
function stub.hover(frame)
  if stub.hovered == frame then return end
  leave()
  stub.hovered = frame
  if frame then
    frame.__mouseOver = true
    runScript(frame, "OnEnter")
  end
end

-- Scrolls the mouse wheel over a frame (delta 1 up, -1 down). As in game, it
-- goes to the frame if it takes the wheel, else to the nearest parent that does
-- (a row inside a scroll view scrolls the view); nothing takes it otherwise.
function stub.wheel(frame, delta)
  local f = frame
  while f and not f:IsMouseWheelEnabled() do f = f.__parent end
  if f then runScript(f, "OnMouseWheel", delta or 1) end
end

-- Presses a key on a frame: OnKeyDown then OnKeyUp.
function stub.key(frame, key)
  runScript(frame, "OnKeyDown", key)
  runScript(frame, "OnKeyUp", key)
end

-- Drags a frame: OnDragStart, then moves it to a point on UIParent, then OnDragStop.
function stub.drag(frame, point, x, y)
  runScript(frame, "OnDragStart", "LeftButton")
  if point then
    frame:ClearAllPoints()
    frame:SetPoint(point, UIParent, point, x or 0, y or 0)
  end
  runScript(frame, "OnDragStop")
end

-- Types into an edit box: sets the text and runs OnTextChanged (as user input).
function stub.type(frame, text)
  frame:SetText(text)
  runScript(frame, "OnTextChanged", true)
end

-- Presses Enter in an edit box.
function stub.enter(frame)
  runScript(frame, "OnEnterPressed")
end
