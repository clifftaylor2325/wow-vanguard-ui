-- The engine aura backend: the client's own AuraContainer (12.1+, and WoW
-- Forever). The client reads the unit's auras through each group's filter,
-- sorts them, flows them into rows, and drives every icon's sweep, stacks,
-- timer text, debuff-type edge and refresh-window highlight itself, so they
-- keep working while the client hides aura values from addons.
--
-- The client's rules, which this file keeps:
--   * containers can only be made out of combat (the probe waits too);
--   * groups are fixed once added: a changed filter needs a new container;
--   * an engine button is dressed only while it is being made
--     (initializeFrame): afterwards the client may refuse addon calls on it;
--   * a container the client refuses (a template that gives a frame without
--     the methods, a call that errors) retires the engine for the session:
--     that container and every later one are built by the fallback.
-- Every call into a newer option is wrapped, so a client that rejects an
-- option still gets the icons, only without that extra.

local ADDON, ns = ...

local T = ns.Theme
local A = ns.Auras

local E = {}
ns.AuraEngine = E

local probed

-- The container methods the engine calls without a guard: AddAuraGroup and
-- SetUnit while making one, SetEnabled and UpdateAllAuras later from the
-- modules. A frame without them is not an engine container, whatever
-- CreateFrame returned (in game a bad template still returns a frame).
E.REQUIRED = { "AddAuraGroup", "SetUnit", "SetEnabled", "UpdateAllAuras" }

-- The first of E.REQUIRED that `frame` lacks, or nil when it has them all.
local function missing(frame)
  for _, name in ipairs(E.REQUIRED) do
    if type(frame[name]) ~= "function" then return name end
  end
end

-- Makes a probe container and puts it away; an error names the first method
-- it lacks (level 0: the message alone, for /vg errors).
local function makeProbe()
  local probe = CreateFrame("AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
  local lack = missing(probe)
  if lack then error("the client's AuraContainer has no " .. lack, 0) end
  probe:Hide()
end

-- Whether the client has AuraContainer: asked once, out of combat (making one
-- in combat is an error), after loading the client's AuraContainer code. The
-- answer turns false for the session when the client later refuses a container (see retire).
function E.Available()
  if probed ~= nil then return probed end
  if ns.InCombat() then return false end
  if C_AddOns and type(C_AddOns.LoadAddOn) == "function" then pcall(C_AddOns.LoadAddOn, "Blizzard_AuraContainer") end
  probed = (ns.Try("aura containers (using Vanguard's own icons)", makeProbe))
  ns.Client.has.auraContainer = probed
  return probed
end

-- Timers -----------------------------------------------------------------------------------

local cache = {}

-- A cached value, made on first use by `make` (nil when the client can't make it).
local function once(key, make)
  if cache[key] == nil then
    local ok, value = pcall(make)
    cache[key] = ok and value or false
  end
  return cache[key] or nil
end

-- One timer band: from `threshold` seconds, `format` with the value divided by `div`.
local function band(threshold, format, rounding, div)
  return { threshold = threshold, format = format, step = format == "%.1f" and 0.1 or 1, rounding = rounding, components = div and { { div = div } } or nil }
end

-- The timer's text: tenths under 3 s, whole seconds (rounded up, so it never
-- reads 0 with time left), then whole minutes and hours.
local function formatter()
  local up, down = Enum.NumericRuleFormatRounding.Up, Enum.NumericRuleFormatRounding.Down
  local f = C_StringUtil.CreateNumericRuleFormatter()
  f:SetBreakpoints({ band(0, "%.1f", up), band(3, "%d", up), band(60, "%dm", up, 60), band(61, "%dm", down, 60), band(3600, "%dh", down, 3600) })
  return f
end

-- The timer's color by time left: red under 4 s, orange under 11 s, else the text color.
local function timerColor()
  local c = C_CurveUtil.CreateColorCurve()
  c:SetType(Enum.LuaCurveType.Step)
  for _, point in ipairs({ { 0, "bad" }, { 4, "warn" }, { 11, "text" } }) do c:AddPoint(point[1], CreateColor(T.RGB(point[2]))) end
  return { curve = c, property = Enum.DurationTextBindingProperty.RemainingDuration }
end

-- Binds the timer text: formatter and color first, then without the color,
-- then the client's defaults, so an option this client rejects costs only itself.
local function durationText(button, fs)
  local full = { textFormatter = once("formatter", formatter), textColor = once("timerColor", timerColor) }
  if pcall(button.SetDurationText, button, fs, full) then return end
  if pcall(button.SetDurationText, button, fs, { textFormatter = full.textFormatter }) then return end
  pcall(button.SetDurationText, button, fs, {})
end

-- Buttons ----------------------------------------------------------------------------------

-- Debuff type -> the theme's color for it at an alpha, as the client's Color objects.
local function colorMap(alpha)
  local r, g, b = T.RGB("bad")
  local map = { None = CreateColor(r, g, b, alpha), Bleed = CreateColor(r, g, b, alpha) }
  for kind in pairs(A.DISPEL_TOKENS) do
    r, g, b = T.RGB(A.DispelToken(kind))
    map[kind] = CreateColor(r, g, b, alpha)
  end
  return map
end

-- Hands textures to the client, which shows them while the button holds a
-- debuff and colors them by its type (at `alpha`), hidden types included.
function E.RegisterDispel(button, textures, alpha)
  local style = Enum.CustomAuraButtonDispelTypeTextureStyle.PreserveAsset
  local map = once("colorMap" .. alpha, function() return colorMap(alpha) end)
  local opts = { style = style, showWhenHarmful = true, showWithoutDispelType = true, customDispelColorMap = map }
  for _, t in ipairs(textures) do button:AddDispelTypeTexture(t, opts) end
end

-- The client's dispel types a badge map covers (the untyped ones map clear).
local BADGE_TYPES = { "None", "Bleed", "Magic", "Curse", "Disease", "Poison" }

-- A color map for one badge part: `color(kind)` gives r, g, b, a for each type, as Color objects.
local function badgeMap(color)
  local map = {}
  for _, kind in ipairs(BADGE_TYPES) do map[kind] = CreateColor(color(kind)) end
  return map
end

-- The backing's color for a type: dark for a type with a letter, clear for one without.
local function backColor(kind)
  local r, g, b = T.RGB("edge")
  return r, g, b, A.DISPEL_GLYPHS[kind] and 0.8 or 0
end

-- The client's options for a badge part colored by `map` (the art kept, shown with a debuff).
local function badgeOpts(map)
  return { style = Enum.CustomAuraButtonDispelTypeTextureStyle.PreserveAsset, showWhenHarmful = true, customDispelColorMap = map }
end

-- Hands a debuff's type badge to the client (#235): the backing for any typed debuff, and each
-- letter in its type's color for its own type only (clear for every other), hidden types included.
function E.RegisterBadge(button, badge)
  button:AddDispelTypeTexture(badge.back, badgeOpts(once("badgeBack", function() return badgeMap(backColor) end)))
  for kind, t in pairs(badge.letters) do
    local r, g, b = T.RGB(A.DispelToken(kind))
    local map = once("badge" .. kind, function() return badgeMap(function(k) return r, g, b, k == kind and 1 or 0 end) end)
    button:AddDispelTypeTexture(t, badgeOpts(map))
  end
end

-- A soft accent wash the client shows while your HoT is in its refresh window
-- (the last stretch, where casting it again loses nothing).
local function pandemic(button, parts)
  local wash = T.Snap(parts.cooldown:CreateTexture(nil, "OVERLAY"))
  wash:SetAllPoints(parts.icon)
  wash:SetTexture(T.WHITE)
  wash:SetBlendMode("ADD")
  T.Tint(wash, "accent", 0.35)
  wash:Hide()
  button:AddPandemicRegion(wash)
end

-- Dresses one engine button as the client makes it (initializeFrame).
function E.Init(button, style)
  local parts = A.Dress(button, style)
  button:EnableMouse(style.mouse ~= false)
  button:SetIcon(parts.icon)
  button:SetDurationCooldown(parts.cooldown)
  button:SetApplicationCount(parts.count, {})
  if parts.timer then durationText(button, parts.timer) end
  if parts.ring then ns.Try("debuff type colors", E.RegisterDispel, button, parts.ring, 1) ns.Try("debuff type badge", E.RegisterBadge, button, parts.badge) end
  if style.pandemic then ns.Try("HoT refresh window", pandemic, button, parts) end
  if style.register then ns.Try("aura icon extras", style.register, button) end
  if style.cancel and button.SetCancelAuraButtons then button:SetCancelAuraButtons("RightButtonUp") end
end

-- Containers ------------------------------------------------------------------------------

local DIRECTION_KEYS = { LEFT = "Left", RIGHT = "Right", UP = "Up", DOWN = "Down" }

-- The client's flow direction for "LEFT", "RIGHT", "UP" or "DOWN".
local function direction(name)
  local dirs = AnchorUtil and AnchorUtil.FlowDirection
  if dirs and dirs[DIRECTION_KEYS[name]] then return dirs[DIRECTION_KEYS[name]] end
  return (name == "LEFT" or name == "DOWN") and -1 or 1
end

-- Where the container sits and how its icons flow: from the corner it is
-- anchored by, wrapping at the line size.
local function layout(c, spec)
  c:SetPoint(unpack(spec.point))
  c:SetSize(1, 1)
  if spec.level then c:SetFrameLevel(spec.level) end
  c:SetFlowLayoutAnchorPoint(spec.point[1])
  c:SetFlowLayoutGrowthDirection(direction(spec.grow or "RIGHT"), direction(spec.growY or "UP"))
  c:SetFlowLayoutMaximumLineSize(spec.lineSize)
end

-- The client's options for one group: count, spacing, a new row if asked, sort, dressing.
local function groupOptions(spec, def)
  local gap, style = spec.gap or 2, A.Style(spec, def)
  local sorts = AuraContainerSortMethod
  return {
    maxFrameCount = def.max, sortMethod = def.sort and sorts and sorts[def.sort] or nil,
    layout = { elementSpacing = gap, lineSpacing = gap, groupSpacing = gap, groupLineSpacing = gap, forceNewLine = def.newLine == true },
    initializeFrame = function(button) ns.Try("aura icon", E.Init, button, style) end,
  }
end

local Container = {}
Container.__index = Container

-- Lays an engine frame out, adds the spec's groups and makes the container showing `unit`.
local function fill(frame, spec, unit)
  layout(frame, spec)
  -- A filter token this client doesn't know is refused: that group is left out, not the rest.
  for i, def in ipairs(spec.groups) do ns.Try("aura filter " .. def.filter, frame.AddAuraGroup, frame, "vg" .. i, def.filter, groupOptions(spec, def)) end
  local c = setmetatable({ frame = frame }, Container)
  c:SetUnit(unit)
  return c
end

-- The client refused a container after the probe passed: the half-made frame
-- (if any) is put away so it can't draw next to the fallback's icons, the
-- engine is retired for this session (A.Backend asks E.Available again for
-- every container, so it is never tried again) and the fallback builds this one.
local function retire(frame, parent, spec, unit)
  if frame then frame:Hide() end
  probed = false
  ns.Client.has.auraContainer = false
  return ns.AuraLegacy.Create(parent, spec, unit)
end

-- The /vg errors label of a refused container; the probe's own is different, so the two read apart.
local REFUSED = "aura container (switching to Vanguard's own icons)"

-- An engine container at spec.point with the spec's groups, showing `unit`'s
-- auras; one the client refuses is built by the fallback instead (see retire).
function E.Create(parent, spec, unit)
  local ok, frame = ns.Try(REFUSED, CreateFrame, "AuraContainer", nil, parent, "CustomAuraContainerTemplate")
  if not ok then return retire(nil, parent, spec, unit) end
  local built, c = ns.Try(REFUSED, fill, frame, spec, unit)
  if built then return c end
  return retire(frame, parent, spec, unit)
end

-- Shows another unit's auras. The client follows UNIT_AURA itself. With no unit
-- the container is bound to "none", the client's null unit, and turned off, so it
-- never keeps the unit it had (an emptied raid tile shows nobody's auras).
function Container:SetUnit(unit)
  self.unit = unit
  self.frame:SetUnit(unit or "none")
  self.frame:SetEnabled(unit ~= nil)
end

-- Reads the auras again: for a token whose unit changed (target, focus).
function Container:Refresh()
  self.frame:UpdateAllAuras()
end
