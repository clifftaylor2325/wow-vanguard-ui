-- Aura icons shared by the raid indicators and the unit frames: reading
-- auras through the client's filters, and small icons with a timer sweep
-- and stack count. Values the client hides are passed to widgets as they
-- come; nothing here compares or computes with them.

local ADDON, ns = ...

local T = ns.Theme

local A = {}
ns.Auras = A

-- The i-th aura on a unit through a client filter, or nil (no API, none, or an error).
function A.Get(unit, i, filter)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataByIndex
  if type(get) ~= "function" then return nil end
  local ok, aura = pcall(get, unit, i, filter)
  return ok and type(aura) == "table" and aura or nil
end

-- An icon frame: cropped texture, timer sweep and stack count; hidden until used.
function A.Icon(parent, size)
  local f = CreateFrame("Frame", nil, parent)
  f:SetSize(size, size)
  f.icon = T.Crop(f:CreateTexture(nil, "ARTWORK"))
  f.icon:SetAllPoints()
  f.cooldown = CreateFrame("Cooldown", nil, f, "CooldownFrameTemplate")
  f.cooldown:SetAllPoints()
  f.count = T.Text(f:CreateFontString(nil, "OVERLAY"), size >= 20 and "small" or "tiny", "white")
  f.count:SetPoint("BOTTOMRIGHT", 1, -1)
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

-- Fills an icon from an aura, or hides it when there is none.
function A.Show(f, unit, aura)
  f:SetShown(aura ~= nil)
  if not aura then return end
  f.icon:SetTexture(aura.icon)
  A.Sweep(f.cooldown, unit, aura)
  local stacks = ns.PlainNumber(aura.applications)
  f.count:SetText(stacks and stacks > 1 and tostring(stacks) or "")
end
