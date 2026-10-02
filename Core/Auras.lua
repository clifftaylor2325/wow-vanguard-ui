-- Aura icons for the unit frames, raid frames and nameplates.
--
-- Modules describe what they want as a container spec: where it sits, which
-- way it grows, how wide a row may get, and a list of groups (a client filter
-- such as "HARMFUL|PLAYER", how many icons, their size). A.Container builds
-- it on one of two backends:
--   * the engine (Core/AuraEngine.lua): the client's own AuraContainer, which
--     reads, sorts, lays out and times the auras itself, hidden values and all;
--   * the fallback (Core/AuraLegacy.lua): ForeverUI's own icons, for a client
--     without AuraContainer.
-- Both dress every icon the same way (A.Dress): a 1 px edge, the icon inset
-- and cropped, a dark sweep that empties as time runs out, stacks above the
-- sweep, an edge in the debuff's type color, and a timer only where asked.
-- Nothing here compares or computes with a value the client hides.

local ADDON, ns = ...

local T = ns.Theme

local A = {}
ns.Auras = A

-- Debuff type -> color token (anything else, including no type, is "bad").
A.DISPEL_TOKENS = { Magic = "magic", Curse = "curse", Disease = "disease", Poison = "poison" }

-- The client's dispel type indexes, for the color curve that colors a hidden type.
local DISPEL_INDEXES = { None = 0, Magic = 1, Curse = 2, Disease = 3, Poison = 4, Enrage = 9, Bleed = 11 }

-- Reading --------------------------------------------------------------------------------

-- The i-th aura on a unit through a client filter, or nil (no API, none, or an error).
function A.Get(unit, i, filter)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByIndex
  if type(get) ~= "function" then return nil end
  local ok, aura = pcall(get, unit, i, filter)
  return ok and type(aura) == "table" and aura or nil
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
function A.DispelColor(unit, aura)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDispelTypeColor
  if ns.IsSecret(aura.dispelName) and type(get) == "function" and curve() then
    local ok, color = pcall(get, unit, aura.auraInstanceID, curve())
    if ok and color then return color:GetRGB() end
  end
  return T.RGB(A.DispelToken(aura.dispelName))
end

-- The stack text: the client's own (it formats hidden counts), else plain counts above 1.
function A.StackText(unit, aura)
  local get = C_UnitAuras and C_UnitAuras.GetAuraApplicationDisplayCount
  if type(get) == "function" and aura.auraInstanceID then
    local ok, text = pcall(get, unit, aura.auraInstanceID, 2, 99)
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

-- Text above the sweep: stacks bottom right, and the timer (centered) when asked for.
local function texts(f, cd, size, timer)
  local carrier = CreateFrame("Frame", nil, f)
  carrier:SetAllPoints()
  carrier:SetFrameLevel(cd:GetFrameLevel() + 2)
  local count = T.Text(carrier:CreateFontString(nil, "OVERLAY"), "auraCount", "white")
  count:SetPoint("BOTTOMRIGHT", 0, 1)
  local clock = timer and T.Text(carrier:CreateFontString(nil, "OVERLAY"), size >= 20 and "auraTimer" or "auraTimerSmall", "white") or nil
  if clock then clock:SetPoint("CENTER", 0, 0) end
  return count, clock
end

-- The 1 px theme edge around an icon, on a frame of our own (so a theme
-- repaint never touches a client-owned button).
local function frameEdge(f)
  local skin = CreateFrame("Frame", nil, f)
  skin:SetAllPoints()
  return T.Panel(skin, { noBg = true })
end

-- Dresses an icon frame (an engine button or one of ours). style: size, debuff
-- (type-colored edge), dim (desaturated: others' auras), timer. Returns its parts.
function A.Dress(f, style)
  f:SetSize(style.size, style.size)
  local px = T.Pixel(f)
  local skin = frameEdge(f)
  local icon = T.Snap(T.Crop(f:CreateTexture(nil, "ARTWORK")))
  icon:SetPoint("TOPLEFT", px, -px); icon:SetPoint("BOTTOMRIGHT", -px, px)
  icon:SetDesaturated(style.dim == true)
  local cd = sweep(f, px)
  local count, clock = texts(f, cd, style.size, style.timer)
  return { icon = icon, cooldown = cd, count = count, timer = clock, ring = style.debuff and ring(skin, px) or nil }
end

-- Containers -------------------------------------------------------------------------------

-- The icon style for one group of a container spec.
function A.Style(spec, def)
  return { size = def.size, debuff = def.debuff, dim = def.dim, pandemic = def.pandemic, register = def.register, timer = spec.timer, mouse = spec.mouse, cancel = spec.cancel }
end

-- The backend in use: the engine when the client has AuraContainer, else the
-- fallback. A container can't be made in combat, so one needed then (a new
-- nameplate) gets the fallback. Asked afresh every time, never cached: the
-- engine's answer turns false for the session once the client refuses a
-- container (Core/AuraEngine.lua), and this is where that switch is read.
function A.Backend()
  return not ns.InCombat() and ns.AuraEngine.Available() and ns.AuraEngine or ns.AuraLegacy
end

-- "engine" or "fallback", for /fui status.
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
