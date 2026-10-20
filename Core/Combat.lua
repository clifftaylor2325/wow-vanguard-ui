-- Combat lockdown and secret values. Protected (secure) frames can't be
-- moved, shown, hidden or re-attributed in combat; work that touches them
-- waits until combat ends. Midnight also hides some values from addons
-- ("secrets"): they can be handed to widgets but not compared or computed with.

local ADDON, ns = ...

-- The work waiting for combat to end, in order; keyed maps a key to its slot in queue.
local queue, keyed = {}, {}

-- True while the client forbids changes to protected frames.
---@return boolean
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
---@param fn function
---@param key any|nil  later calls with the same key replace the queued fn
function ns.OutOfCombat(fn, key)
  if ns.InCombat() then
    enqueue(fn, key)
  else
    fn()
  end
end

-- Runs fn once the fight that is starting or under way ends (PLAYER_REGEN_ENABLED),
-- in the same queue as ns.OutOfCombat: for a PLAYER_REGEN_DISABLED handler, which
-- runs before the client's lockdown starts, so ns.OutOfCombat there would run fn at once.
---@param fn function
---@param key any|nil
function ns.AfterCombat(fn, key)
  enqueue(fn, key)
end

-- True, after a chat line, while a fight is on: the game's panel manager (ShowUIPanel and HideUIPanel,
-- behind ToggleWorldMap, ToggleCalendar and the like) refuses addon code in combat, so a Vanguard
-- button that opens a game window says so and asks for nothing instead of setting off the block.
---@param window string  the window, as a sentence starts it ("The world map")
---@return boolean
function ns.WindowWaitsForCombat(window)
  if not ns.InCombat() then return false end
  ns.Chat(window .. " doesn't open from Vanguard in a fight. Try again after it.")
  return true
end

-- The client's check for a hidden value, or one that says no on a client
-- without it. It never throws, so it is called bare, not under pcall.
local isSecret

-- Never hidden (a client without issecretvalue).
local function never()
  return false
end

-- Picks the check: at load, and again as addons load (the client defines it first).
local function resolveSecret()
  isSecret = type(issecretvalue) == "function" and issecretvalue or never
end
resolveSecret()
ns.On("ADDON_LOADED", resolveSecret)

-- True for a value Midnight hides from addons.
---@param value any
---@return boolean
function ns.IsSecret(value)
  return isSecret(value) == true
end

-- The value if it's a plain (non-secret) number; nil otherwise.
---@param value any
---@return number|nil
function ns.PlainNumber(value)
  if ns.IsSecret(value) or type(value) ~= "number" then
    return nil
  end
  return value
end

-- The value if it's a plain, non-empty string; nil for a hidden value, a non-string or "".
---@param value any
---@return string|nil
function ns.PlainText(value)
  if ns.IsSecret(value) or type(value) ~= "string" or value == "" then return nil end
  return value
end

-- True only for a plain true from the client; a hidden value counts as no.
---@param value any
---@return boolean
function ns.IsTrue(value)
  return not ns.IsSecret(value) and value == true
end

-- Calls t[name](...) if the client has it, else returns nil. Pass _G as t for a global function.
---@param t table|nil
---@param name string
---@return any
function ns.CallIf(t, name, ...)
  local fn = type(t) == "table" and t[name]
  if type(fn) == "function" then return fn(...) end
end

-- True on the WoW Forever client (game type "camelot"): the 12.1 engine with
-- vanilla content, reporting a 1.x interface number (16001). A build that
-- reports the 12.x number instead still counts when the client has the Forever
-- ruleset call, which Retail lacks.
---@return boolean
function ns.IsForever()
  local iface = type(GetBuildInfo) == "function" and select(4, GetBuildInfo())
  if type(iface) == "number" and iface >= 16000 and iface < 20000 then return true end
  return type(C_GameRules) == "table" and type(C_GameRules.GetForeverExperiencePreset) == "function"
end

-- True while the client hides aura values from addons (instanced combat).
-- An error or a hidden answer counts as hidden: unknown is never "readable".
---@return boolean
function ns.AurasSecret()
  local ask = C_Secrets and C_Secrets.ShouldAurasBeSecret
  if type(ask) ~= "function" then return false end
  local ok, secret = pcall(ask)
  return not ok or ns.IsSecret(secret) or secret == true
end

-- True when one aura's values are hidden from addons, or the client can't say
-- (as ns.AurasSecret). `id` must be a plain aura instance id.
---@param unit string
---@param id number
---@return boolean
function ns.AuraInstanceSecret(unit, id)
  local ask = C_Secrets and C_Secrets.ShouldUnitAuraInstanceBeSecret
  if type(ask) ~= "function" then return ns.AurasSecret() end
  local ok, secret = pcall(ask, unit, id)
  return not ok or ns.IsSecret(secret) or secret == true or ns.AurasSecret()
end

-- Add-on restrictions ------------------------------------------------------------------------

-- The restriction kinds the client names (Enum.AddOnRestrictionType), in the order /vg status lists them.
ns.RESTRICTIONS = { "Combat", "Encounter", "ChallengeMode", "PvPMatch", "Map", "Chat" }

-- The client's state number for a restriction kind; nil when the client lacks the call, the kind, or answers plainly with nothing.
local function restrictionState(kind)
  local api, kinds = C_RestrictedActions, _G.Enum and _G.Enum.AddOnRestrictionType
  if type(api) ~= "table" or type(api.GetAddOnRestrictionState) ~= "function" or type(kinds) ~= "table" or kinds[kind] == nil then return nil end
  local ok, state = pcall(api.GetAddOnRestrictionState, kinds[kind])
  return ok and ns.PlainNumber(state) or nil
end

-- Whether the chat lockdown flag is plainly on (the game hides chat text from add-ons while it is).
local function chatLockdown()
  local info = C_ChatInfo
  if type(info) ~= "table" or type(info.InChatMessagingLockdown) ~= "function" then return false end
  local ok, locked = pcall(info.InChatMessagingLockdown)
  return ok and not ns.IsSecret(locked) and locked == true
end

-- True while the client restricts add-ons for this kind ("Combat", "Encounter", "ChallengeMode", "PvPMatch",
-- "Map" or "Chat"), also while the restriction is starting. False when the client doesn't say: a client
-- without these calls, or one that errors or hides its answer, is treated as unrestricted and each read
-- still checks its own value. "Chat" also counts the chat messaging lockdown.
---@param kind string
---@return boolean
function ns.Restricted(kind)
  local state = restrictionState(kind)
  local inactive = ((_G.Enum or {}).AddOnRestrictionState or {}).Inactive or 0
  if state ~= nil and state ~= inactive then return true end
  return kind == "Chat" and chatLockdown()
end

-- The restriction kinds active right now, in /vg status order.
---@return string[]
function ns.ActiveRestrictions()
  local out = {}
  for _, kind in ipairs(ns.RESTRICTIONS) do
    if ns.Restricted(kind) then out[#out + 1] = kind end
  end
  return out
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
---@param key string
---@param fn function
function ns.Soon(key, fn)
  if type(C_Timer) ~= "table" or type(C_Timer.After) ~= "function" then return fn() end
  local waiting = soon[key] ~= nil
  soon[key] = fn
  if not waiting then C_Timer.After(0, function() runSoon(key) end) end
end
