-- The fallback aura backend: ForeverUI's own icons, for a client without the
-- engine's AuraContainer (Core/AuraEngine.lua). Each container reads its
-- unit's auras through the client's filters on UNIT_AURA, fills its groups in
-- order (an aura an earlier group shows is skipped) and flows the icons into
-- rows. Filters with a "!" token (not) aren't understood by the older reads,
-- so those tokens are dropped and the earlier groups' auras skipped instead.
-- Values the client hides go to the widgets as they are.

local ADDON, ns = ...

local T = ns.Theme
local A = ns.Auras

local L = {}
ns.AuraLegacy = L

-- Icons -----------------------------------------------------------------------------------

-- The client's countdown numbers on an icon, in the theme's font (timer icons only).
local function countdown(cd, size)
  cd:SetHideCountdownNumbers(false)
  local fs = cd:GetCountdownFontString()
  if fs then T.Text(fs, size >= 20 and "auraTimer" or "auraTimerSmall", "white") end
end

-- An icon frame, dressed (A.Dress) and hidden until used. style: size, debuff,
-- dim, timer (the client's countdown numbers), as A.Style gives.
function A.Icon(parent, size, style)
  style = style or { size = size }
  local f = CreateFrame("Frame", nil, parent)
  local parts = A.Dress(f, { size = size, debuff = style.debuff, dim = style.dim })
  f.icon, f.cooldown, f.count, f.ring = parts.icon, parts.cooldown, parts.count, parts.ring
  if style.timer then countdown(f.cooldown, size) end
  f:Hide()
  return f
end

-- The timer sweep: a duration object where the client offers one, plain
-- numbers otherwise, no sweep when the values are hidden.
function A.Sweep(cd, unit, aura)
  local getDuration = C_UnitAuras and C_UnitAuras.GetAuraDuration
  if type(getDuration) == "function" and cd.SetCooldownFromDurationObject and aura.auraInstanceID then
    local ok, duration = pcall(getDuration, unit, aura.auraInstanceID)
    if ok and duration then return pcall(cd.SetCooldownFromDurationObject, cd, duration) end
  end
  local exp, dur = ns.PlainNumber(aura.expirationTime), ns.PlainNumber(aura.duration)
  if exp and dur and dur > 0 then cd:SetCooldown(exp - dur, dur) else cd:Clear() end
end

-- Colors and shows a debuff icon's type edge.
local function paintRing(f, unit, aura)
  local r, g, b = A.DispelColor(unit, aura)
  for _, t in ipairs(f.ring) do
    t:SetVertexColor(r, g, b)
    t:Show()
  end
end

-- Fills an icon from an aura, or hides it when there is none.
function A.Show(f, unit, aura)
  f:SetShown(aura ~= nil)
  if not aura then return end
  f.icon:SetTexture(aura.icon)
  A.Sweep(f.cooldown, unit, aura)
  f.count:SetText(A.StackText(unit, aura))
  if f.ring then paintRing(f, unit, aura) end
end

-- Containers ------------------------------------------------------------------------------

local Container = {}
Container.__index = Container

-- A filter with its "!" (not) tokens dropped: the older reads don't know them.
function L.BaseFilter(filter)
  return (filter:gsub("|![%w_]+", ""))
end

-- The icons for each group of a spec.
local function build(frame, spec)
  local groups = {}
  for g, def in ipairs(spec.groups) do
    groups[g] = { def = def, filter = L.BaseFilter(def.filter), icons = {} }
    for i = 1, def.max do groups[g].icons[i] = A.Icon(frame, def.size, A.Style(spec, def)) end
  end
  return groups
end

-- Which way icons flow from the anchor corner, and how far apart.
local function flow(spec)
  local dx = spec.grow == "LEFT" and -1 or 1
  local dy = spec.growY == "DOWN" and -1 or 1
  return { anchor = spec.point[1], dx = dx, dy = dy, gap = spec.gap or 2, line = spec.lineSize }
end

-- A container of our own icons at spec.point, showing `unit`'s auras.
function L.Create(parent, spec, unit)
  local frame = CreateFrame("Frame", nil, parent)
  frame:SetPoint(unpack(spec.point))
  frame:SetSize(1, 1)
  if spec.level then frame:SetFrameLevel(spec.level) end
  local c = setmetatable({ frame = frame, flow = flow(spec), groups = build(frame, spec) }, Container)
  frame:SetScript("OnEvent", function() c:Refresh() end)
  c:SetUnit(unit)
  return c
end

-- Shows another unit's auras (nil: none), refreshed on its UNIT_AURA.
function Container:SetUnit(unit)
  self.unit = unit
  self.frame:UnregisterAllEvents()
  if unit then self.frame:RegisterUnitEvent("UNIT_AURA", unit) end
  self:Refresh()
end

-- True the first time an aura is seen (by its instance id; a hidden id always counts as new).
local function fresh(seen, aura)
  local id = ns.PlainNumber(aura.auraInstanceID)
  if not id then return true end
  if seen[id] then return false end
  seen[id] = true
  return true
end

-- Up to `max` auras through a group's filter that no earlier group shows.
local function collect(unit, g, seen)
  local out, i = {}, 1
  local aura = unit and A.Get(unit, i, g.filter)
  while aura and #out < #g.icons do
    if fresh(seen, aura) then out[#out + 1] = aura end
    i = i + 1
    aura = A.Get(unit, i, g.filter)
  end
  return out
end

-- Fills one group's icons; adds the shown ones to `shown` for the layout.
local function fill(unit, g, seen, shown)
  local auras = collect(unit, g, seen)
  for i, icon in ipairs(g.icons) do
    A.Show(icon, unit, auras[i])
    if auras[i] then shown[#shown + 1] = { icon = icon, size = g.def.size, newLine = i == 1 and g.def.newLine } end
  end
end

-- Flows the shown icons into rows from the anchor corner, wrapping at the line size.
local function place(c, shown)
  local f, x, y, lineH = c.flow, 0, 0, 0
  for _, s in ipairs(shown) do
    if x > 0 and (s.newLine or (f.line and x + s.size > f.line)) then x, y, lineH = 0, y + lineH + f.gap, 0 end
    s.icon:ClearAllPoints()
    s.icon:SetPoint(f.anchor, c.frame, f.anchor, x * f.dx, y * f.dy)
    x, lineH = x + s.size + f.gap, math.max(lineH, s.size)
  end
end

-- Reads the unit's auras again and lays the icons out.
function Container:Refresh()
  local seen, shown = {}, {}
  for _, g in ipairs(self.groups) do fill(self.unit, g, seen, shown) end
  place(self, shown)
end
