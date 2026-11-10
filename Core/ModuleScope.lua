-- A module's scope (docs/design/MODULE-LIFECYCLE.md, 2.2): the registry (Core/Modules.lua) hands one to the Enable of
-- a module that declares live or reload, and releases what the module registered through it when the module stops.
-- Events, unit events, tickers, frames, movers and visibility rules are released; what the client can't take back
-- (a hook, a theme listener, an item-line provider) gets a gate instead, installed once a session, that does nothing
-- while the module is off. One scope per module per session, kept across stops, so its gates and its spare unit
-- event frames (the client never frees a frame) are there again at the next start.

local ADDON, ns = ...

local Scope = {}
Scope.__index = Scope

-- A new scope for the module `name`, closed until the registry opens it (scope.on).
---@param name string
---@return table scope
function ns.NewScope(name)
  local scope = { name = name, on = false, handlers = {}, subs = {}, spare = {}, tickers = {}, frames = {}, movers = {} }
  scope.gates, scope.latest, scope.gateCount, scope.adopted = {}, {}, 0, {}
  return setmetatable(scope, Scope)
end

-- Whether the module runs now (its gates call through).
---@return boolean
function Scope:Running()
  return self.on
end

-- Calls fn(event, ...) while the module runs. The scope keeps a wrapper of its own per event and fn, so taking it off
-- (Scope:Off, the stop) takes off only this module's handler, and a handler the error budget paused starts over
-- after a restart (a restart is a retry). The same fn twice for one event is one handler, as with ns.On.
---@param event string
---@param fn function
function Scope:On(event, fn)
  local key = event .. "\0" .. tostring(fn)
  if self.handlers[key] then return end
  -- This module's own handler for fn (ns.Off and the error budget tell it apart from another module's). It checks the
  -- module still runs: the event that stopped it (a switch made in a fight settles at PLAYER_REGEN_ENABLED) still
  -- walks the handler list it started with.
  local wrapped = function(...) if self.on then return fn(...) end end
  self.handlers[key] = { event, wrapped }
  ns.On(event, wrapped)
end

-- Stops calling fn for the event (registered with Scope:On).
---@param event string
---@param fn function
function Scope:Off(event, fn)
  local key = event .. "\0" .. tostring(fn)
  local h = self.handlers[key]
  if not h then return end
  self.handlers[key] = nil
  ns.Off(h[1], h[2])
end

-- As ns.OnUnit, on a spare subscription frame when the scope has one from an earlier run; given back on stop.
---@param events string|string[]
---@param fn function
---@param unit1 string|nil
---@param unit2 string|nil
---@param unit3 string|nil
---@return Frame sub  for ns.SetUnits
function Scope:OnUnit(events, fn, unit1, unit2, unit3)
  local sub = ns.OnUnit(events, fn, unit1, unit2, unit3, table.remove(self.spare))
  self.subs[#self.subs + 1] = sub
  return sub
end

-- As ns.Every; the job stops when the module stops (or now, with no seconds).
---@param key string
---@param seconds number|nil
---@param fn function
---@param frame Frame|nil
---@param now boolean|nil
function Scope:Every(key, seconds, fn, frame, now)
  self.tickers[key] = seconds and true or nil
  ns.Every(key, seconds, fn, frame, now)
end

-- The gate for key: one function a session, which calls the latest fn while the module runs and does nothing while it
-- is off. install(gate) runs only until it installs the gate (it hooks a game function, adds a theme listener, ...),
-- so a restart never installs a hook twice; a later call only points the gate at its new fn. An install that could
-- not hook anything yet (the game window isn't loaded) returns false: the gate is not kept or counted, and the next
-- call tries again. Returns the gate.
---@param key string
---@param fn function
---@param install fun(gate: function): boolean|nil
---@return function gate
function Scope:Gate(key, fn, install)
  self.latest[key] = fn
  if self.gates[key] then return self.gates[key] end
  -- Calls through while the module runs and the key points somewhere (Scope:Point); inert otherwise.
  local gate = function(...)
    local target = self.on and self.latest[key]
    if target then return target(...) end
  end
  if install(gate) == false then return gate end
  self.gates[key], self.gateCount = gate, self.gateCount + 1
  return gate
end

-- Points the gate for key at another fn, or at nothing (nil: the hook stays installed and does nothing even while the
-- module runs, until a later Scope:Gate or Scope:Point gives it a fn again).
---@param key string
---@param fn function|nil
function Scope:Point(key, fn)
  self.latest[key] = fn
end

-- A frame of the module's own: hidden, and its visibility rules released, when the module stops. Returns the frame.
---@param f Frame
---@return Frame f
function Scope:Frame(f)
  self.frames[#self.frames + 1] = f
  return f
end

-- As ns.Mover, and the frame is the scope's (Scope:Frame): its handle leaves unlock mode when the module stops, and
-- its saved spot stays in the profile, so it comes back where it was.
---@param f Frame
---@param key string
---@param label string|nil
---@param default table|nil
---@return table mover
function Scope:Mover(f, key, label, default)
  self.movers[#self.movers + 1] = key
  return ns.Mover(self:Frame(f), key, label, default)
end

-- Gives an adopted frame to the scope for this run: with its mover when it was adopted with a key.
local function own(self, entry)
  if entry.key then return self:Mover(entry.frame, entry.key, entry.label, entry.default) end
  self:Frame(entry.frame)
end

-- A frame of the module's own built after Enable (when a window first wants it), for the rest of the session: it is the
-- scope's now and again at every later start (Scope:Open), with its mover when key is given, so Enable need not hand
-- it over again. Adopting the same frame twice keeps one. Returns the frame.
---@param f Frame
---@param key string|nil
---@param label string|nil
---@param default table|nil
---@return Frame f
function Scope:Adopt(f, key, label, default)
  for _, entry in ipairs(self.adopted) do
    if entry.frame == f then return f end
  end
  local entry = { frame = f, key = key, label = label, default = default }
  self.adopted[#self.adopted + 1] = entry
  own(self, entry)
  return f
end

-- The module starts (the registry calls it before Enable): its gates call through again, and every frame it adopted
-- in an earlier run is its own again.
function Scope:Open()
  self.on = true
  for _, entry in ipairs(self.adopted) do own(self, entry) end
end

-- Takes off every handler the module registered with Scope:On.
local function closeHandlers(self)
  for _, h in pairs(self.handlers) do ns.Off(h[1], h[2]) end
  self.handlers = {}
end

-- Stops every unit event subscription and keeps its frame as a spare for the next start.
local function closeSubs(self)
  for _, sub in ipairs(self.subs) do
    ns.SetUnits(sub, nil)
    self.spare[#self.spare + 1] = sub
  end
  self.subs = {}
end

-- Stops every ticker job.
local function closeTickers(self)
  for key in pairs(self.tickers) do ns.Every(key, nil) end
  self.tickers = {}
end

-- Hides every frame with its visibility rules released, and takes every mover out of unlock mode.
local function closeFrames(self)
  for _, f in ipairs(self.frames) do
    ns.Visibility.Release(f)
    f:Hide()
  end
  for _, key in ipairs(self.movers) do ns.ReleaseMover(key) end
  self.frames, self.movers = {}, {}
end

-- The module stopped: its gates shut, its handlers off, its unit frames spare, its tickers stopped, its frames hidden
-- with their drivers released, and its movers out of unlock mode. The registry calls it out of combat only
-- (hiding a secure frame and unregistering a state driver are protected).
function Scope:Close()
  self.on = false
  closeHandlers(self)
  closeSubs(self)
  closeTickers(self)
  closeFrames(self)
end
