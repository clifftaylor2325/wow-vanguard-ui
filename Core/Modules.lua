-- Modules: each feature (unit frames, action bars, ...) registers itself here
-- and is enabled at PLAYER_LOGIN unless the profile turns it off. A module
-- that errors is reported (chat, /vg errors, the game's error handler) and
-- skipped; the others still load.

local ADDON, ns = ...

local modules, order = {}, {}

-- Registers a module. def.defaults = its settings; def.Enable(settings) builds
-- it. Returns def so the module file can add functions to it.
function ns.Module(name, def)
  def.name = name
  modules[name] = def
  order[#order + 1] = name
  return def
end

-- The module registered under name, or nil.
function ns.GetModule(name)
  return modules[name]
end

-- Module names in load order.
function ns.ModuleNames()
  return { unpack(order) }
end

-- Whether the profile has the module on (on unless turned off).
function ns.ModuleEnabled(name)
  local enabled = ns.Settings("modules")
  return enabled[name] ~= false
end

-- Turns a module on or off for this profile. Takes effect on /reload, except
-- that a module with a Disable(settings) gives back what it changed at once.
function ns.SetModuleEnabled(name, on)
  ns.Settings("modules")[name] = on and true or false
  local def = modules[name]
  if not on and def and def.Disable then ns.Try("disable " .. name, def.Disable, ns.Settings(name, def.defaults)) end
end

-- Reads a module's settings (running its ns.Migrate upgrade) and builds it.
local function build(def)
  return def.Enable(ns.Settings(def.name, def.defaults))
end

-- Enables one module; a failure, in its settings' upgrade too, is reported (see ns.Report) instead of stopping the others.
local function enable(def)
  def.enabled = (ns.Try("module " .. def.name, build, def))
end

ns.On("PLAYER_LOGIN", function()
  for _, name in ipairs(order) do
    local def = modules[name]
    if def.Enable and ns.ModuleEnabled(name) then
      enable(def)
    end
  end
end)
