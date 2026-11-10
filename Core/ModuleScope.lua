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
  scope.gates, scope.latest, scope.gateCount = {}, {}, 0
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
  -- This module's own handler for fn (ns.Off and the error budget tell it apart from another module's).
  local wrapped = function(...) return fn(...) end
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
-- is off. install(gate) runs only the first time (it hooks a game function, adds a theme listener, ...), so a
-- restart never installs a hook twice; a later call only points the gate at its new fn. Returns the gate.
---@param key string
---@param fn function
---@param install fun(gate: function)
---@return function gate
function Scope:Gate(key, fn, install)
  self.latest[key] = fn
  if self.gates[key] then return self.gates[key] end
  -- Calls through while the module runs; inert while it is off.
  local gate = function(...) if self.on then return self.latest[key](...) end end
  self.gates[key], self.gateCount = gate, self.gateCount + 1
  install(gate)
  return gate
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
