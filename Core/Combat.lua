-- Combat lockdown and secret values. Protected (secure) frames can't be
-- moved, shown, hidden or re-attributed in combat; work that touches them
-- waits until combat ends. Midnight also hides some values from addons
-- ("secrets"): they can be handed to widgets but not compared or computed with.

local ADDON, ns = ...

-- The work waiting for combat to end, in order; keyed maps a key to its slot in queue.
local queue, keyed = {}, {}

-- True while the client forbids changes to protected frames.
function ns.InCombat()
  return type(InCombatLockdown) == "function" and InCombatLockdown() == true
end

-- Queues fn: a new key (or none) takes the next slot, a key already queued
-- gets its slot's function replaced, so the order of first calls holds.
local function enqueue(fn, key)
  local slot = key ~= nil and keyed[key]
  if not slot then
    slot = #queue + 1
    if key ~= nil then keyed[key] = slot end
  end
  queue[slot] = fn
end

-- Runs fn now, or right after combat ends. Queued work runs in order, once; a
-- call with a key replaces the work queued under that key, in its place (the
-- latest wins, the first call's position stays). A key is held until combat ends.
function ns.OutOfCombat(fn, key)
  if ns.InCombat() then
    enqueue(fn, key)
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

-- How many distinct pieces of work are waiting for combat to end.
function ns.QueuedCount()
  return #queue
end

-- Runs queued work; one failing function is reported (see ns.Report) and the rest still run.
local function flush()
  local pending = queue
  queue, keyed = {}, {}
  for _, fn in ipairs(pending) do
    ns.Try("after-combat update", fn)
  end
end

ns.On("PLAYER_REGEN_ENABLED", flush)

-- Next frame ---------------------------------------------------------------------------------

-- The work waiting for the next frame, by key (see ns.Soon).
local soon = {}

-- Runs the work last asked for under key, freeing the key first; a failure is reported.
local function runSoon(key)
  local fn = soon[key]
  soon[key] = nil
  ns.Try(key, fn)
end

-- Runs fn on the next frame, once however often it is asked for before then
-- (a burst of events in one frame becomes one refresh): a call with a key
-- already waiting replaces its work. Without the client's timer it runs now.
function ns.Soon(key, fn)
  if type(C_Timer) ~= "table" or type(C_Timer.After) ~= "function" then return fn() end
  local waiting = soon[key] ~= nil
  soon[key] = fn
  if not waiting then C_Timer.After(0, function() runSoon(key) end) end
end
