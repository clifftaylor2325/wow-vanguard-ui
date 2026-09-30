-- Minimal WoW API stub so addon Lua runs under Node (fengari, Lua 5.3).
-- TEST-ONLY. Not listed in the TOC and never shipped in game.

-- Lua 5.1 names fengari (5.3) lacks.
math.atan2 = math.atan2 or function(y, x)
  return math.atan(y, x)
end
unpack = unpack or table.unpack

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

local widgetMeta = {
  -- Resolves a method name to the stub method, a no-op, or nil.
  __index = function(w, key)
    if type(key) ~= "string" or key:sub(1, 2) == "__" or not hasMethod(w, key) then
      return nil
    end
    return methods[key] or noop
  end,
}

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
  if name then
    _G[name] = w
  end
  return w
end

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
function methods:SetJustifyH(j) self.__justifyH = j end
function methods:SetFontObject(font) self.__template = type(font) == "string" and font or self.__template end
function methods:SetBackdrop(b) self.__backdrop = b end
function methods:SetBackdropColor(r, g, b, a) self.__backdropColor = { r, g, b, a or 1 } end
function methods:SetBackdropBorderColor(r, g, b, a) self.__borderColor = { r, g, b, a or 1 } end
function methods:SetTexture(t) self.__texture = t end
function methods:SetColorTexture(r, g, b, a) self.__color = { r, g, b, a or 1 } end
function methods:SetVertexColor(r, g, b, a) self.__vertexColor = { r, g, b, a or 1 } end
function methods:SetAlpha(a) self.__alpha = a end
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
function methods:IsMouseOver() return self.__mouseOver == true end
-- Moving (recorded for the mover tests).
function methods:StartMoving() self.__moving = true end
function methods:StopMovingOrSizing() self.__moving = false end

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

-- Runs fn after a script's current handler, as HookScript does.
function methods:HookScript(name, fn)
  local old = self.__scripts[name]
  self.__scripts[name] = function(...)
    if old then old(...) end
    return fn(...)
  end
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
  for _, w in ipairs(stub.frames) do
    if w.__parent == self and (w.__kind == "Texture" or w.__kind == "FontString") then out[#out + 1] = w end
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
function methods:SetValue(v) self.__value = v end
function methods:GetValue() return self.__value or 0 end
function methods:SetStatusBarColor(r, g, b, a) self.__barColor = { r, g, b, a or 1 } end

-- Registers a unit event: delivered only when its first argument is one of the units.
function methods:RegisterUnitEvent(event, ...)
  self.__events[event] = true
  self.__unitEvents = self.__unitEvents or {}
  self.__unitEvents[event] = { ... }
end

-- Reparents a region (the preview and tests read __parent).
function methods:SetParent(parent) self.__parent = parent end

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
function methods:IsVisible() return self.__shown end
function methods:SetShown(shown) self.__shown = not not shown end

-- Script handlers: only ones the real widget type has.
function methods:SetScript(name, fn)
  local scripts = API.scripts[self.__kind]
  if not scripts or not scripts[name] then
    error(self.__kind .. " doesn't have a \"" .. tostring(name) .. "\" script", 2)
  end
  self.__scripts[name] = fn
end

-- Scripts, events, text, rotation, attributes and identity: recorded and read back.
function methods:GetScript(name) return self.__scripts[name] end
function methods:RegisterEvent(event) self.__events[event] = true end
function methods:UnregisterEvent(event) self.__events[event] = nil end
function methods:UnregisterAllEvents() self.__events = {}; self.__unitEvents = nil end
function methods:IsEventRegistered(event) return self.__events[event] == true end
function methods:SetText(text) self.__text = text end
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
function methods:CreateTexture(name, layer) return newWidget("Texture", name, self, nil, layer) end
function methods:CreateFontString(name, layer, template) return newWidget("FontString", name, self, template, layer) end

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

-- Fires an event at every frame registered for it.
function stub.fire(event, ...)
  for _, frame in ipairs(stub.frames) do
    local onEvent = frame.__scripts.OnEvent
    if onEvent and wants(frame, event, ...) then
      onEvent(frame, event, ...)
    end
  end
end

-- Moves the clock by `elapsed` and runs one OnUpdate on each shown frame.
function stub.update(elapsed)
  stub.now = stub.now + elapsed
  for _, frame in ipairs(stub.frames) do
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
