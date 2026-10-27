-- Aura icons for the unit frames, raid frames and nameplates.
--
-- Modules describe what they want as a container spec: where it sits, which
-- way it grows, how wide a row may get, and a list of groups (a client filter
-- such as "HARMFUL|PLAYER", how many icons, their size). A.Container builds
-- it on one of two backends:
--   * the engine (Core/AuraEngine.lua): the client's own AuraContainer, which
--     reads, sorts, lays out and times the auras itself, hidden values and all;
--   * the fallback (Core/AuraLegacy.lua): Vanguard's own icons, for a client
--     without AuraContainer.
-- Both dress every icon the same way (A.Dress): a 1 px edge, the icon inset
-- and cropped, a dark sweep that empties as time runs out, stacks above the
-- sweep, an edge in the debuff's type color, and a timer only where asked.
-- Nothing here compares or computes with a value the client hides.
-- A filter word the client rejects is dropped for the session and reported once (A.Filter).

local ADDON, ns = ...

local T = ns.Theme

local A = {}
ns.Auras = A

-- How many refused aura reads (A.Get) one pass over a unit steps past before it gives
-- up: a vanilla unit's 16 debuff slots, so a unit the client hides whole costs 17 reads.
A.REFUSED_LIMIT = 16

-- Debuff type -> color token (anything else, including no type, is "bad").
A.DISPEL_TOKENS = { Magic = "magic", Curse = "curse", Disease = "disease", Poison = "poison" }

-- The client's dispel type indexes, for the color curve that colors a hidden type.
local DISPEL_INDEXES = { None = 0, Magic = 1, Curse = 2, Disease = 3, Poison = 4, Enrage = 9, Bleed = 11 }

-- Reading --------------------------------------------------------------------------------

-- Filter string -> the filter this client accepts for it, and probe string -> whether
-- the client takes it: each distinct string is probed once per session.
local knownFilters, knownTokens = {}, {}

-- Whether the client's aura read takes `filter`; an error means a word it doesn't know.
-- Only pcall's verdict is used: the aura (possibly hidden) is never read; it is
-- kept, so no string is probed twice.
local function accepts(get, filter)
  if knownTokens[filter] == nil then knownTokens[filter] = (pcall(get, "player", 1, filter)) end
  return knownTokens[filter]
end

-- `filter` with every word the client rejects dropped. The first word (HELPFUL or
-- HARMFUL) is probed alone and each later one together with it, so a word that
-- only qualifies another is never taken for an unknown one.
local function strip(get, filter)
  local kept = {}
  for token in filter:gmatch("[^|]+") do
    local probe = kept[1] and (kept[1] .. "|" .. token) or token
    if accepts(get, probe) then kept[#kept + 1] = token end
  end
  return table.concat(kept, "|")
end

-- Notes a filter the client rejects, once per filter, saying what is read instead.
local function reportFilter(filter, used)
  local what = used == "" and "no part of it is known to this client" or ("this client rejects it; reading " .. used)
  ns.Report("aura filter " .. filter, what)
end

-- The filter the client accepts for `filter`: itself, or the same with the rejected
-- words dropped (reported). When it rejects every word the filter stays as it is, so
-- the read keeps failing safely to "no auras".
local function probe(get, filter)
  if accepts(get, filter) then return filter end
  local used = strip(get, filter)
  reportFilter(filter, used)
  return used ~= "" and used or filter
end

-- The filter the client accepts for `filter`, probed once per session (see probe);
-- a nil filter, or a client without the read, passes through unchanged. While the
-- client hides auras it may refuse the probe's read, which would take every word for
-- an unknown one: the filter passes through unprobed until auras can be read again.
function A.Filter(filter)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByIndex
  if type(filter) ~= "string" or type(get) ~= "function" then return filter end
  if knownFilters[filter] == nil and not ns.AurasSecret() then knownFilters[filter] = probe(get, filter) end
  return knownFilters[filter] or filter
end

-- The i-th aura on a unit through a client filter (with the words this client
-- rejects dropped, see A.Filter), or nil (no API, or no aura there). A read the
-- client refuses (an aura it hides from addons raises an error) gives nil, true:
-- a refused index is not the end of the list.
function A.Get(unit, i, filter)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByIndex
  if type(get) ~= "function" then return nil end
  local ok, aura = pcall(get, unit, i, A.Filter(filter))
  if not ok then return nil, true end
  return type(aura) == "table" and aura or nil
end

-- The color token for a debuff type name ("Magic"...); "bad" for none or unknown.
function A.DispelToken(kind)
  if ns.IsSecret(kind) or type(kind) ~= "string" then return "bad" end
  return A.DISPEL_TOKENS[kind] or "bad"
end

local dispelCurve

-- A step curve from dispel type index to its theme color, made once (nil if the client has none).
local function curve()
  if dispelCurve ~= nil or not (C_CurveUtil and C_CurveUtil.CreateColorCurve and CreateColor) then return dispelCurve end
  dispelCurve = C_CurveUtil.CreateColorCurve()
  if Enum and Enum.LuaCurveType then dispelCurve:SetType(Enum.LuaCurveType.Step) end
  for name, index in pairs(DISPEL_INDEXES) do dispelCurve:AddPoint(index, CreateColor(T.RGB(A.DispelToken(name)))) end
  return dispelCurve
end

-- r, g, b for a debuff's edge: its type's color. A hidden type is colored by
-- the client through the curve (the result may itself be hidden: widgets take it).
-- The client asks by the aura's id, which an addon may pass only when it is plain.
function A.DispelColor(unit, aura)
  local get, id = C_UnitAuras and C_UnitAuras.GetAuraDispelTypeColor, ns.PlainNumber(aura.auraInstanceID)
  if ns.IsSecret(aura.dispelName) and id and type(get) == "function" and curve() then
    local ok, color = pcall(get, unit, id, curve())
    if ok and color then return color:GetRGB() end
  end
  return T.RGB(A.DispelToken(aura.dispelName))
end

-- The stack text: the client's own (it formats hidden counts; asked by a plain id only), else plain counts above 1.
function A.StackText(unit, aura)
  local get, id = C_UnitAuras and C_UnitAuras.GetAuraApplicationDisplayCount, ns.PlainNumber(aura.auraInstanceID)
  if type(get) == "function" and id then
    local ok, text = pcall(get, unit, id, 2, 99)
    if ok then return text end
  end
  local stacks = ns.PlainNumber(aura.applications)
  return stacks and stacks > 1 and tostring(stacks) or ""
end

-- Dressing ---------------------------------------------------------------------------------

-- The four 1 px strips of the type-colored debuff edge, hidden until a debuff shows.
local function ring(f, px)
  local strips = {}
  for i, side in ipairs({ { "TOPLEFT", "TOPRIGHT" }, { "BOTTOMLEFT", "BOTTOMRIGHT" }, { "TOPLEFT", "BOTTOMLEFT" }, { "TOPRIGHT", "BOTTOMRIGHT" } }) do
    local t = T.Snap(f:CreateTexture(nil, "OVERLAY", nil, 7))
    t:SetTexture(T.WHITE)
    t:SetPoint(side[1]); t:SetPoint(side[2])
    if i <= 2 then t:SetHeight(px) else t:SetWidth(px) end
    t:Hide()
    strips[i] = t
  end
  return strips
end

-- Dispel type -> its badge glyph under Media/Icons (#235): a letter, so a type reads without its hue.
A.DISPEL_GLYPHS = { Magic = "DispelMagic", Curse = "DispelCurse", Disease = "DispelDisease", Poison = "DispelPoison" }
-- The badge's side: a share of the icon's, and the least it may be (UI units).
A.BADGE, A.BADGE_MIN = 0.45, 8

-- One badge letter on the badge's backing, in its type's color, hidden until shown.
local function letter(f, back, kind)
  local t = T.Tint(T.Snap(f:CreateTexture(nil, "OVERLAY", nil, 7), "icon"), A.DispelToken(kind))
  t:SetTexture(T.Icon(A.DISPEL_GLYPHS[kind]))
  t:SetAllPoints(back)
  t:Hide()
  return t
end

-- A debuff icon's type badge (#235) in its top-left corner: a dark backing and one letter per
-- type, all hidden until a typed debuff shows. { back, letters = { type -> texture } }.
local function badge(f, size)
  local back = T.Tint(T.Snap(f:CreateTexture(nil, "OVERLAY", nil, 6)), "edge", 0.8)
  back:SetTexture(T.WHITE)
  back:SetSize(math.max(A.BADGE_MIN, size * A.BADGE), math.max(A.BADGE_MIN, size * A.BADGE))
  back:SetPoint("TOPLEFT")
  back:Hide()
  local letters = {}
  for kind in pairs(A.DISPEL_GLYPHS) do letters[kind] = letter(f, back, kind) end
  return { back = back, letters = letters }
end

-- Shows a debuff's type badge for a type it can read, or hides it (no type, or a hidden one).
function A.ShowBadge(b, kind)
  local known = not ns.IsSecret(kind) and type(kind) == "string" and b.letters[kind] ~= nil
  b.back:SetShown(known)
  for k, t in pairs(b.letters) do t:SetShown(known and k == kind) end
end

-- The dark sweep: empties clockwise as the aura runs out, no edge line, no flash.
local function sweep(f, px)
  local cd = CreateFrame("Cooldown", nil, f, "CooldownFrameTemplate")
  cd:SetPoint("TOPLEFT", px, -px)
  cd:SetPoint("BOTTOMRIGHT", -px, px)
  cd:SetReverse(true)
  cd:SetDrawEdge(false)
  cd:SetDrawBling(false)
  cd:SetSwipeColor(T.RGB("sweep"))
  cd:SetHideCountdownNumbers(true)
  return cd
end

-- Text above the sweep: stacks top right, and the timer (at the bottom edge, clear of the type badge) when asked for.
local function texts(f, cd, size, timer)
  local carrier = CreateFrame("Frame", nil, f)
  carrier:SetAllPoints()
  carrier:SetFrameLevel(cd:GetFrameLevel() + 2)
  local count = T.Text(carrier:CreateFontString(nil, "OVERLAY"), "auraCount", "white")
  count:SetPoint("TOPRIGHT", -1, -1)
  local clock = timer and T.Text(carrier:CreateFontString(nil, "OVERLAY"), size >= 20 and "auraTimer" or "auraTimerSmall", "white") or nil
  if clock then clock:SetPoint("BOTTOM", 0, 1) end
  return count, clock
end

-- The 1 px theme edge around an icon, on a frame of our own (so a theme
-- repaint never touches a client-owned button); no edge when Masque skins it.
local function frameEdge(f, masque)
  local skin = CreateFrame("Frame", nil, f)
  skin:SetAllPoints()
  if ns.Masque.Group(masque) then return skin end
  return T.Panel(skin, { noBg = true })
end

-- Dresses an icon frame (an engine button or one of ours). style: size, debuff
-- (type-colored edge and type badge), dim (desaturated: others' auras), timer, masque (the
-- Masque group that skins it, when Masque is loaded). Returns its parts.
function A.Dress(f, style)
  f:SetSize(style.size, style.size)
  local px = T.Pixel(f)
  local skin = frameEdge(f, style.masque)
  local icon = T.Snap(T.Crop(f:CreateTexture(nil, "ARTWORK")))
  icon:SetPoint("TOPLEFT", px, -px); icon:SetPoint("BOTTOMRIGHT", -px, px); icon:SetDesaturated(style.dim == true)
  local cd = sweep(f, px)
  local count, clock = texts(f, cd, style.size, style.timer)
  ns.Masque.Add(style.masque, f, { Icon = icon, Cooldown = cd, Count = count }, "Aura")
  return { icon = icon, cooldown = cd, count = count, timer = clock, ring = style.debuff and ring(skin, px) or nil, badge = style.debuff and badge(skin, style.size) or nil }
end

-- Containers -------------------------------------------------------------------------------

-- The icon style for one group of a container spec.
function A.Style(spec, def)
  return { size = def.size, debuff = def.debuff, dim = def.dim, pandemic = def.pandemic, register = def.register, timer = spec.timer, mouse = spec.mouse, cancel = spec.cancel, masque = spec.masque }
end

-- The backend in use: the engine when the client has AuraContainer, else the
-- fallback. A container can't be made in combat, so one needed then (a new
-- nameplate) gets the fallback. Asked afresh every time, never cached: the
-- engine's answer turns false for the session once the client refuses a
-- container (Core/AuraEngine.lua), and this is where that switch is read.
function A.Backend()
  return not ns.InCombat() and ns.AuraEngine.Available() and ns.AuraEngine or ns.AuraLegacy
end

-- "engine" or "fallback", for /vg status.
function A.BackendName()
  return A.Backend() == ns.AuraEngine and "engine" or "fallback"
end

-- Builds a container from a spec (see the top of this file) on the backend in
-- use, showing `unit`'s auras. Returns an object with :SetUnit and :Refresh.
-- spec.level sets its frame level; a group's `register(button)` runs on each
-- engine button as it is made (to hand the client more regions to drive).
function A.Container(parent, spec, unit)
  return A.Backend().Create(parent, spec, unit)
end
