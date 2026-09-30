-- Combat lockdown and secret values. Protected (secure) frames can't be
-- moved, shown, hidden or re-attributed in combat; work that touches them
-- waits until combat ends. Midnight also hides some values from addons
-- ("secrets"): they can be handed to widgets but not compared or computed with.

local ADDON, ns = ...

local queue = {}

-- True while the client forbids changes to protected frames.
function ns.InCombat()
  return type(InCombatLockdown) == "function" and InCombatLockdown() == true
end

-- Runs fn now, or right after combat ends. Queued work runs in order, once.
function ns.OutOfCombat(fn)
  if ns.InCombat() then
    queue[#queue + 1] = fn
  else
    fn()
  end
end

-- True for a value Midnight hides from addons.
function ns.IsSecret(value)
  if type(issecretvalue) ~= "function" then
    return false
  end
  local ok, secret = pcall(issecretvalue, value)
  return ok and secret == true
end

-- The value if it's a plain (non-secret) number; nil otherwise.
function ns.PlainNumber(value)
  if ns.IsSecret(value) or type(value) ~= "number" then
    return nil
  end
  return value
end

-- True on the WoW Forever client (game type "camelot"): the 12.1 engine with
-- vanilla content, reporting a 1.x interface number (16001).
function ns.IsForever()
  local iface = type(GetBuildInfo) == "function" and select(4, GetBuildInfo())
  return type(iface) == "number" and iface >= 16000 and iface < 20000
end

-- True while the client hides aura values from addons (instanced combat).
-- An error or a hidden answer counts as hidden: unknown is never "readable".
function ns.AurasSecret()
  local ask = C_Secrets and C_Secrets.ShouldAurasBeSecret
  if type(ask) ~= "function" then return false end
  local ok, secret = pcall(ask)
  return not ok or ns.IsSecret(secret) or secret == true
end

-- How many functions are waiting for combat to end.
function ns.QueuedCount()
  return #queue
end

-- Runs queued work; one failing function is reported and the rest still run.
local function flush()
  local pending = queue
  queue = {}
  for _, fn in ipairs(pending) do
    local ok, err = pcall(fn)
    if not ok then
      ns.Chat("after-combat update failed: " .. tostring(err))
    end
  end
end

ns.On("PLAYER_REGEN_ENABLED", flush)
