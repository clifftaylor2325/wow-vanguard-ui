-- The fallback aura backend: Vanguard's own icons, for a client without the
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
function A.Countdown(cd, size)
  cd:SetHideCountdownNumbers(false)
  local fs = ns.Client.Has("countdownText") and cd:GetCountdownFontString()
  if fs then T.Text(fs, size >= 20 and "auraTimer" or "auraTimerSmall", "white") end
end

-- An icon frame, dressed (A.Dress) and hidden until used. style: size, debuff,
-- dim, timer (the client's countdown numbers), as A.Style gives.
function A.Icon(parent, size, style)
  style = style or { size = size }
  local f = CreateFrame("Frame", nil, parent)
  local parts = A.Dress(f, { size = size, debuff = style.debuff, dim = style.dim, masque = style.masque })
  f.icon, f.cooldown, f.count, f.ring = parts.icon, parts.cooldown, parts.count, parts.ring
  if style.timer then A.Countdown(f.cooldown, size) end
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

-- One group's icon: its size, and whether it starts a new row (the group's first, when asked), kept on it for the layout.
local function groupIcon(frame, spec, def, i)
  local icon = A.Icon(frame, def.size, A.Style(spec, def))
  icon.vgSize, icon.vgNewLine = def.size, i == 1 and def.newLine
  return icon
end

-- The icons for each group of a spec.
local function build(frame, spec)
  local groups = {}
  for g, def in ipairs(spec.groups) do
    groups[g] = { def = def, filter = L.BaseFilter(def.filter), icons = {} }
    for i = 1, def.max do groups[g].icons[i] = groupIcon(frame, spec, def, i) end
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
  local c = setmetatable({ frame = frame, flow = flow(spec), groups = build(frame, spec), ids = {}, placed = {} }, Container)
  c.events = ns.OnUnit("UNIT_AURA", function(_, _, info) c:Refresh(info) end)
  c:SetUnit(unit)
  return c
end

-- Shows another unit's auras (nil: none), refreshed on its UNIT_AURA (ns.OnUnit, the unit's only).
function Container:SetUnit(unit)
  self.unit = unit
  ns.SetUnits(self.events, unit)
  self:Refresh()
end

-- Scratch tables every refresh reuses (one runs at a time): the aura ids
-- already shown, one group's auras, and the icons shown, in order.
local seen, auras, shown, NONE = {}, {}, {}, {}

-- Empties a table in place.
local function clear(t)
  for k in pairs(t) do t[k] = nil end
end

-- True the first time an aura is seen (by its instance id; a hidden id always counts as new).
local function fresh(aura)
  local id = ns.PlainNumber(aura.auraInstanceID)
  if not id then return true end
  if seen[id] then return false end
  seen[id] = true
  return true
end

-- Up to `max` auras through a group's filter that no earlier group shows, into `auras`.
local function collect(unit, g)
  clear(auras)
  local i = 1
  local aura = unit and A.Get(unit, i, g.filter)
  while aura and #auras < #g.icons do
    if fresh(aura) then auras[#auras + 1] = aura end
    i = i + 1
    aura = A.Get(unit, i, g.filter)
  end
end

-- Notes a shown aura's id on the container (a hidden id: it can't tell, so every update counts).
local function remember(c, aura)
  local id = ns.PlainNumber(aura.auraInstanceID)
  if id then c.ids[id] = true else c.anyHidden = true end
end

-- Fills one group's icons; adds the shown ones to `shown` for the layout.
local function fill(c, g)
  collect(c.unit, g)
  for i, icon in ipairs(g.icons) do
    A.Show(icon, c.unit, auras[i])
    if auras[i] then shown[#shown + 1] = icon remember(c, auras[i]) end
  end
end

-- Whether the shown icons differ (in order) from those last placed; remembers them.
local function reordered(c)
  local placed = c.placed
  local changed = #placed ~= #shown
  for i, icon in ipairs(shown) do
    changed = changed or placed[i] ~= icon
    placed[i] = icon
  end
  for i = #shown + 1, #placed do placed[i] = nil end
  return changed
end

-- Flows the shown icons into rows from the anchor corner, wrapping at the line size.
local function place(c)
  local f, x, y, lineH = c.flow, 0, 0, 0
  for _, icon in ipairs(shown) do
    local size = icon.vgSize
    if x > 0 and (icon.vgNewLine or (f.line and x + size > f.line)) then x, y, lineH = 0, y + lineH + f.gap, 0 end
    icon:ClearAllPoints()
    icon:SetPoint(f.anchor, c.frame, f.anchor, x * f.dx, y * f.dy)
    x, lineH = x + size + f.gap, math.max(lineH, size)
  end
end

-- True when one of the ids (UNIT_AURA's updated or removed list) is shown
-- here, or is hidden from addons (then it can't be ruled out).
local function touches(c, ids)
  for _, id in ipairs(ids or NONE) do
    local plain = ns.PlainNumber(id)
    if not plain or c.ids[plain] then return true end
  end
  return false
end

-- True when a UNIT_AURA's update info can't change what the container shows:
-- not a full update, nothing added, and nothing it shows updated or removed.
-- Without update info (an older client, or a unit change) it reads again.
local function untouched(c, info)
  if type(info) ~= "table" or info.isFullUpdate or c.anyHidden then return false end
  if info.addedAuras and #info.addedAuras > 0 then return false end
  return not touches(c, info.updatedAuraInstanceIDs) and not touches(c, info.removedAuraInstanceIDs)
end

-- Reads the unit's auras again and lays the icons out (re-anchoring them
-- only when the icons shown, or their order, changed). `info` is UNIT_AURA's
-- update info: an update that can't change what shows is skipped.
function Container:Refresh(info)
  if untouched(self, info) then return end
  clear(seen) clear(shown) clear(self.ids)
  self.anyHidden = false
  for _, g in ipairs(self.groups) do fill(self, g) end
  if reordered(self) then place(self) end
  clear(auras)
end
