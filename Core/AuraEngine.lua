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
--     (initializeFrame): afterwards the client may refuse addon calls on it.
-- Every call into a newer option is wrapped, so a client that rejects an
-- option still gets the icons, only without that extra.

local ADDON, ns = ...

local T = ns.Theme
local A = ns.Auras

local E = {}
ns.AuraEngine = E

local probed

-- Whether the client has AuraContainer: asked once, out of combat (making one
-- in combat is an error), after loading the client's AuraContainer code.
function E.Available()
  if probed ~= nil then return probed end
  if ns.InCombat() then return false end
  if C_AddOns and type(C_AddOns.LoadAddOn) == "function" then pcall(C_AddOns.LoadAddOn, "Blizzard_AuraContainer") end
  local ok, probe = pcall(CreateFrame, "AuraContainer", nil, UIParent, "CustomAuraContainerTemplate")
  if ok then probe:Hide() end
  probed = ok
  return ok
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
  if parts.ring then pcall(E.RegisterDispel, button, parts.ring, 1) end
  if style.pandemic then pcall(pandemic, button, parts) end
  if style.register then pcall(style.register, button) end
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
    initializeFrame = function(button) pcall(E.Init, button, style) end,
  }
end

local Container = {}
Container.__index = Container

-- An engine container at spec.point with the spec's groups, showing `unit`'s auras.
function E.Create(parent, spec, unit)
  local frame = CreateFrame("AuraContainer", nil, parent, "CustomAuraContainerTemplate")
  layout(frame, spec)
  -- A filter token this client doesn't know is refused: that group is left out, not the rest.
  for i, def in ipairs(spec.groups) do pcall(frame.AddAuraGroup, frame, "fui" .. i, def.filter, groupOptions(spec, def)) end
  local c = setmetatable({ frame = frame }, Container)
  c:SetUnit(unit)
  return c
end

-- Shows another unit's auras (nil: none). The client follows UNIT_AURA itself.
function Container:SetUnit(unit)
  self.unit = unit
  if unit then self.frame:SetUnit(unit) end
  self.frame:SetEnabled(unit ~= nil)
end

-- Reads the auras again: for a token whose unit changed (target, focus).
function Container:Refresh()
  self.frame:UpdateAllAuras()
end
