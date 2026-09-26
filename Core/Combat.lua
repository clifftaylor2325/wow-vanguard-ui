-- Combat lockdown. Protected (secure) frames can't be moved, shown, hidden or
-- re-attributed in combat; work that touches them waits until combat ends.

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

-- How many functions are waiting for combat to end.
function ns.QueuedCount()
  return #queue
end

ns.On("PLAYER_REGEN_ENABLED", function()
  local pending = queue
  queue = {}
  for _, fn in ipairs(pending) do
    fn()
  end
end)
