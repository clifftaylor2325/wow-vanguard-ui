-- Modules: each feature (unit frames, action bars, ...) registers itself here
-- and is enabled at PLAYER_LOGIN unless the profile turns it off. A module
-- that errors is reported and skipped; the others still load.

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

-- Turns a module on or off for this profile. Takes effect on /reload.
function ns.SetModuleEnabled(name, on)
  ns.Settings("modules")[name] = on and true or false
end

-- Enables one module; an error is printed instead of stopping the others.
local function enable(def)
  local ok, err = pcall(def.Enable, ns.Settings(def.name, def.defaults))
  def.enabled = ok
  if not ok then
    ns.CaughtError("module " .. def.name, err)
    ns.Chat(string.format("module %s failed to load: %s", def.name, tostring(err)))
  end
end

ns.On("PLAYER_LOGIN", function()
  for _, name in ipairs(order) do
    local def = modules[name]
    if def.Enable and ns.ModuleEnabled(name) then
      enable(def)
    end
  end
end)
