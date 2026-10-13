-- A refresh-window glow on the game's Cooldown Manager (#252): when a tracked
-- aura has less than a set share of its time left (30 % unless you change it),
-- its icon gets the accent glow ring. It does not need the game's pandemic
-- flag, which many spells (heal-over-time spells especially) lack. Off by
-- default. The glow only decorates the game's own item; nothing is copied.
-- Remaining time can be secret in combat, so it is never compared: where the
-- client can evaluate the aura's duration object against a curve, the result
-- goes straight to the glow's opacity; otherwise plain numbers are used out of
-- combat, and with neither the glow stays off (no error). Static: no fade.

local ADDON, ns = ...

local T = ns.Theme

-- The glow rings, kept off the game's items (Core/Events.lua, ns.FrameState).
local vgGlow = ns.FrameState("vgGlow")

local CG = ns.Module("CooldownGlow", { defaults = { glow = false, percent = 30 } })

-- The rows whose items can track an aura (the buff row, the essential and utility rows).
CG.VIEWERS = { "BuffIconCooldownViewer", "EssentialCooldownViewer", "UtilityCooldownViewer" }
-- How often the glows are looked at again (seconds).
CG.EVERY = 0.25

-- Time left ---------------------------------------------------------------------------------

-- A curve that gives 1 while less than percent of the time is left and 0 after, or nil where the client has no curves.
function CG.Curve(percent)
  local util = C_CurveUtil
  if type(util) ~= "table" or type(util.CreateCurve) ~= "function" then return nil end
  local curve = util.CreateCurve()
  if curve.SetType and Enum and Enum.LuaCurveType then curve:SetType(Enum.LuaCurveType.Step) end
  curve:AddPoint(0, 1)
  curve:AddPoint(percent / 100, 0)
  curve:AddPoint(1, 0)
  return curve
end

-- The aura a Cooldown Manager item tracks (its id and unit), or nil when it tracks none right now.
function CG.Aura(item)
  local id = item.auraInstanceID
  if not (ns.IsSecret(id) or type(id) == "number") then return nil end
  return id, type(item.auraDataUnit) == "string" and item.auraDataUnit or "player"
end

-- The glow's strength from the aura's duration object, handed to the game's curve; nil when the client can't do that.
function CG.FromCurve(id, unit, percent)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDuration
  local curve = type(get) == "function" and CG.Curve(percent)
  if not curve then return nil end
  local ok, duration = pcall(get, unit, id)
  if not (ok and type(duration) == "table" and duration.EvaluateRemainingPercent) then return nil end
  local done, value = pcall(duration.EvaluateRemainingPercent, duration, curve)
  local usable = done and (ns.IsSecret(value) or type(value) == "number")
  return usable and value or nil
end

-- The glow's strength from plain numbers (1 or 0); nil when the aura's times are hidden or it has none.
function CG.FromNumbers(id, unit, percent)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByAuraInstanceID
  local aura = type(get) == "function" and get(unit, id)
  local expires, length = aura and ns.PlainNumber(aura.expirationTime), aura and ns.PlainNumber(aura.duration)
  if not (expires and length and length > 0) then return nil end
  return (expires - GetTime()) / length < percent / 100 and 1 or 0
end

-- How lit an item's glow is (0 to 1; maybe a hidden number the glow takes as it is), or nil for none.
function CG.Strength(item, percent)
  local id, unit = CG.Aura(item)
  if id == nil then return nil end
  return CG.FromCurve(id, unit, percent) or CG.FromNumbers(id, unit, percent)
end

-- Showing -----------------------------------------------------------------------------------

-- Lights an item's glow to a strength, or turns it off (nil, 0 or a hidden item).
function CG.Light(item, strength)
  local glow = vgGlow[item]
  if not glow and strength == nil then return end
  glow = glow or T.Glow(item, 6)
  vgGlow[item] = glow
  T.ShowGlow(glow, strength ~= nil and ns.PlainNumber(strength) ~= 0 and item:IsShown())
  for _, piece in ipairs(glow) do if strength ~= nil then piece:SetAlpha(strength) end end
end

-- Every item the Cooldown Manager's rows hold right now.
function CG.Items()
  local out = {}
  for _, name in ipairs(CG.VIEWERS) do
    local viewer = _G[name]
    local items = type(viewer) == "table" and type(viewer.GetItemFrames) == "function" and viewer:GetItemFrames()
    for _, item in ipairs(type(items) == "table" and items or {}) do out[#out + 1] = item end
  end
  return out
end

-- Looks at every item again.
function CG.Tick()
  for _, item in ipairs(CG.Items()) do CG.Light(item, CG.Strength(item, CG.settings.percent)) end
end

-- Starts looking when the glow is on, and stops (putting the glows out) when it is off. Applied at once.
function CG.Apply()
  if CG.ticker then CG.ticker:Cancel() CG.ticker = nil end
  if CG.settings.glow and C_Timer and C_Timer.NewTicker then
    CG.ticker = C_Timer.NewTicker(CG.EVERY, ns.Guard("timer cooldown glow", CG.Tick))
    return CG.Tick()
  end
  for _, item in ipairs(CG.Items()) do CG.Light(item, nil) end
end

-- Module entry point (Core/Modules.lua).
function CG.Enable(settings)
  CG.settings = settings
  CG.Apply()
end
